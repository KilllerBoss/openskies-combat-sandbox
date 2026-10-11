/**
 * Effects — Partikel-Pools, Explosionen, Tracer, Kameraruckeln.
 *
 * Performance-Grundsatz: NICHTS wird im Laufzeit-Loop neu allokiert (kein
 * `new` in update()). Alle Partikel leben in einem einzigen THREE.Points
 * mit vorallokierten Buffern; "Spawnen" = einen toten Slot reaktivieren.
 * Genau so machen es auch Profi-Engines (Object-Pooling).
 */
import * as THREE from 'three';

const MAX_PARTICLES = 900;
const MAX_TRACERS = 120;

/** Farbwerte werden vorab in Float32 gepackt — kein new Color() im Loop. */
const _col = new THREE.Color();

interface TracerSlot {
  mesh: THREE.Mesh;
  life: number;
  vel: THREE.Vector3;
}

export class Effects {
  private particles: THREE.Points;
  private pPos: Float32Array;
  private pVel: Float32Array;
  private pLife: Float32Array;   // verbleibende Lebenszeit (s), 0 = tot
  private pMaxLife: Float32Array;
  private pSize: Float32Array;
  private pDrag: Float32Array;
  private pGrav: Float32Array;
  private pBaseCol: Float32Array; // RGB Basisfarbe
  private pCursor = 0;

  private tracers: TracerSlot[] = [];
  private tracerCursor = 0;

  /** Explosionen: expandierender Ring + Lichtblitz (wiederverwendet). */
  private ring: THREE.Mesh;
  private ringLife = 0;
  private flash: THREE.PointLight;
  private flashLife = 0;

  /** Kameraruckeln 0..1 — CameraRig liest das ab und klingt exponentiell ab. */
  shake = 0;

  constructor(private scene: THREE.Scene) {
    // ---- Partikelsystem (ein Points für ALLES: Feuer, Rauch, Funken, Kielwasser, Staub)
    const geo = new THREE.BufferGeometry();
    this.pPos = new Float32Array(MAX_PARTICLES * 3);
    this.pVel = new Float32Array(MAX_PARTICLES * 3);
    this.pLife = new Float32Array(MAX_PARTICLES);
    this.pMaxLife = new Float32Array(MAX_PARTICLES);
    this.pSize = new Float32Array(MAX_PARTICLES);
    this.pDrag = new Float32Array(MAX_PARTICLES);
    this.pGrav = new Float32Array(MAX_PARTICLES);
    this.pBaseCol = new Float32Array(MAX_PARTICLES * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    // Größe & Farbe pro Partikel (Custom-Shader wäre schlanker, aber so bleibt
    // es bei Standard-Material — lesbarer für ein Lernprojekt).
    geo.setAttribute('size', new THREE.BufferAttribute(this.pSize, 1));
    geo.setAttribute('color', new THREE.BufferAttribute(this.pBaseCol, 3));
    const mat = new THREE.PointsMaterial({
      size: 4, vertexColors: true, transparent: true, opacity: 0.9,
      depthWrite: false, sizeAttenuation: true,
    });
    this.particles = new THREE.Points(geo, mat);
    this.particles.frustumCulled = false; // Buffer ändert sich laufend
    scene.add(this.particles);

    // ---- Tracer-Pool (leuchtende Geschosspuren)
    const tracerGeo = new THREE.BoxGeometry(0.22, 0.22, 7);
    const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffd27a });
    for (let i = 0; i < MAX_TRACERS; i++) {
      const mesh = new THREE.Mesh(tracerGeo, tracerMat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.tracers.push({ mesh, life: 0, vel: new THREE.Vector3() });
    }

    // ---- Explosions-Ring (Schockwelle)
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(1, 1.6, 40),
      new THREE.MeshBasicMaterial({ color: 0xffcf8a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    scene.add(this.ring);

    // ---- Lichtblitz
    this.flash = new THREE.PointLight(0xffb055, 0, 420, 2);
    this.flash.visible = false;
    scene.add(this.flash);
  }

  /** Ein Partikel spawnen (Ring-Puffer: ältester Slot wird recycelt). */
  spawnParticle(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    life: number, size: number, color: number,
    drag = 0.9, grav = 0,
  ): void {
    const i = this.pCursor;
    this.pCursor = (this.pCursor + 1) % MAX_PARTICLES;
    const i3 = i * 3;
    this.pPos[i3] = x; this.pPos[i3 + 1] = y; this.pPos[i3 + 2] = z;
    this.pVel[i3] = vx; this.pVel[i3 + 1] = vy; this.pVel[i3 + 2] = vz;
    this.pLife[i] = life; this.pMaxLife[i] = life;
    this.pSize[i] = size;
    this.pDrag[i] = drag; this.pGrav[i] = grav;
    _col.setHex(color);
    this.pBaseCol[i3] = _col.r; this.pBaseCol[i3 + 1] = _col.g; this.pBaseCol[i3 + 2] = _col.b;
  }

  /** Feuer+Rauch-Burst (Treffer, Absturz). */
  hitBurst(pos: THREE.Vector3, scale = 1): void {
    for (let i = 0; i < 8; i++) {
      this.spawnParticle(
        pos.x, pos.y, pos.z,
        (Math.random() - 0.5) * 28 * scale,
        Math.random() * 22 * scale,
        (Math.random() - 0.5) * 28 * scale,
        0.3 + Math.random() * 0.35, 3 + Math.random() * 3 * scale,
        Math.random() < 0.7 ? 0xffc247 : 0xff7733,
      );
    }
  }

  /** Große Explosion: Feuerball + Rauch + Ring + Licht + Ruckeln. */
  explosion(pos: THREE.Vector3, scale = 1): void {
    // Feuerball
    for (let i = 0; i < 26; i++) {
      this.spawnParticle(
        pos.x, pos.y, pos.z,
        (Math.random() - 0.5) * 60 * scale,
        Math.random() * 46 * scale,
        (Math.random() - 0.5) * 60 * scale,
        0.5 + Math.random() * 0.6, (5 + Math.random() * 6) * scale,
        Math.random() < 0.6 ? 0xffb347 : 0xff6a2a,
        0.86,
      );
    }
    // Rauch (steigt träge, dunkelt nach — hier: grau, langsamer Drag)
    for (let i = 0; i < 18; i++) {
      this.spawnParticle(
        pos.x, pos.y, pos.z,
        (Math.random() - 0.5) * 18 * scale,
        8 + Math.random() * 14,
        (Math.random() - 0.5) * 18 * scale,
        1.6 + Math.random() * 1.4, (7 + Math.random() * 8) * scale,
        0x3a3a3a, 0.94, -2,
      );
    }
    // Ring & Blitz
    this.ring.position.copy(pos);
    this.ring.scale.setScalar(6 * scale);
    this.ring.visible = true;
    this.ringLife = 0.7;
    (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.85;
    this.flash.position.copy(pos);
    this.flash.intensity = 900 * scale;
    this.flash.visible = true;
    this.flashLife = 0.35;
    this.shake = Math.min(1, this.shake + 0.5 * scale);
  }

  /** Tracer spawnen (Kanonenprojektil-Visual). */
  spawnTracer(pos: THREE.Vector3, vel: THREE.Vector3, life: number, color = 0xffd27a): void {
    const t = this.tracers[this.tracerCursor];
    this.tracerCursor = (this.tracerCursor + 1) % MAX_TRACERS;
    t.mesh.position.copy(pos);
    t.mesh.lookAt(pos.x + vel.x, pos.y + vel.y, pos.z + vel.z); // +Z zeigt Richtung Fahrt
    t.mesh.visible = true;
    (t.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
    t.life = life;
    t.vel.copy(vel);
  }

  /** Kielwasser-/Bugwellen-Schaum (Schiff). */
  wake(pos: THREE.Vector3, speedFrac: number): void {
    this.spawnParticle(
      pos.x + (Math.random() - 0.5) * 3, pos.y - 0.5, pos.z,
      (Math.random() - 0.5) * 3, 0.6, (Math.random() - 0.5) * 3,
      1.1 + Math.random(), 2.5 + speedFrac * 3, 0xeef6f6, 0.97,
    );
  }

  /** Kettenstaub (Panzer). */
  dust(pos: THREE.Vector3): void {
    this.spawnParticle(
      pos.x + (Math.random() - 0.5) * 2, pos.y + 0.4, pos.z,
      (Math.random() - 0.5) * 4, 2 + Math.random() * 2, (Math.random() - 0.5) * 4,
      0.8 + Math.random() * 0.6, 3 + Math.random() * 3, 0xb9a284, 0.95,
    );
  }

  /** Raketenrauchspur. */
  missileTrail(pos: THREE.Vector3): void {
    this.spawnParticle(
      pos.x, pos.y, pos.z,
      (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2,
      1.2 + Math.random() * 0.8, 2.2 + Math.random() * 1.5, 0xd8d8d8, 0.93,
    );
  }

  /** Render-Frame-Update (dt = echte Rahmenzeit, keine Physik hier). */
  update(dt: number): void {
    // Partikel: Bewegung + Altern (Größe schrumpft, Farbe dunkelt zum Rauch)
    const posAttr = this.particles.geometry.getAttribute('position') as THREE.BufferAttribute;
    const colAttr = this.particles.geometry.getAttribute('color') as THREE.BufferAttribute;
    const sizeAttr = this.particles.geometry.getAttribute('size') as THREE.BufferAttribute;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.pLife[i] <= 0) continue;
      this.pLife[i] -= dt;
      const i3 = i * 3;
      if (this.pLife[i] <= 0) {
        // Toter Partikel: auf weit weg parken (Größe 0 reicht nicht bei Points)
        this.pPos[i3 + 1] = -99999;
        continue;
      }
      const dragF = Math.pow(this.pDrag[i], dt * 60);
      this.pVel[i3] *= dragF; this.pVel[i3 + 1] *= dragF; this.pVel[i3 + 2] *= dragF;
      this.pVel[i3 + 1] += this.pGrav[i] * dt;
      this.pPos[i3] += this.pVel[i3] * dt;
      this.pPos[i3 + 1] += this.pVel[i3 + 1] * dt;
      this.pPos[i3 + 2] += this.pVel[i3 + 2] * dt;
      const frac = this.pLife[i] / this.pMaxLife[i]; // 1 = frisch … 0 = bald weg
      sizeAttr.array[i] = this.pSize[i] * (0.35 + 0.65 * frac);
      // Feuer → dunkler Rauch beim Altern
      colAttr.array[i3] = this.pBaseCol[i3] * (0.25 + 0.75 * frac);
      colAttr.array[i3 + 1] = this.pBaseCol[i3 + 1] * (0.25 + 0.75 * frac);
      colAttr.array[i3 + 2] = this.pBaseCol[i3 + 2] * (0.25 + 0.75 * frac);
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;

    // Tracer bewegen
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) { t.mesh.visible = false; continue; }
      t.mesh.position.addScaledVector(t.vel, dt);
    }

    // Explosions-Ring
    if (this.ringLife > 0) {
      this.ringLife -= dt;
      const s = this.ring.scale.x + 220 * dt;
      this.ring.scale.setScalar(s);
      (this.ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, this.ringLife) * 1.2;
      if (this.ringLife <= 0) this.ring.visible = false;
    }
    // Lichtblitz
    if (this.flashLife > 0) {
      this.flashLife -= dt;
      this.flash.intensity *= Math.pow(0.02, dt * 2);
      if (this.flashLife <= 0) this.flash.visible = false;
    }
    // Ruckeln abklingen lassen
    this.shake *= Math.pow(0.001, dt);
  }

  dispose(): void {
    this.scene.remove(this.particles, this.ring, this.flash);
    this.particles.geometry.dispose();
    (this.particles.material as THREE.Material).dispose();
    const tg = this.tracers[0]?.mesh.geometry;
    const tm = this.tracers[0]?.mesh.material;
    for (const t of this.tracers) this.scene.remove(t.mesh);
    tg?.dispose();
    if (tm) (tm as THREE.Material).dispose();
    this.ring.geometry.dispose();
    (this.ring.material as THREE.Material).dispose();
  }
}
