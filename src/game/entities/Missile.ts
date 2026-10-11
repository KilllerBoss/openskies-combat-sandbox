/**
 * Missile — Lenkrakete mit PROPORTIONALER NAVIGATION.
 *
 * Die PN-Regel ist DER klassische Raketenleitsatz (seit den 50ern, bis heute
 * in AIM-9 & Co. im Kern erhalten):
 *
 *      a_cmd = N · Vc · ω
 *
 *   N   = NavConstant (3..5 üblich; groß = aggressiv)
 *   Vc  = Annäherungsgeschwindigkeit (how fast the range closes)
 *   ω   = Drehgeschwindigkeit der Sichtlinie (LOS rate)
 *
 * Intuition: "So lenken, dass die Sichtlinie zum Ziel NICHT mehr rotiert."
 * Rotiert die Sichtlinie nicht mehr, laufen Rakete und Ziel auf einen
 * Kollisionspunkt zu — reine Geometrie, keine Verfolgungskurve nötig.
 *
 * Ausweichen (das macht Dogfights spannend): Die Drehrate ist LIMITIERT.
 * Ein hart drehendes Ziel erzeugt eine LOS-Rate, die die Rakete nicht mehr
 * folgen kann → sie schießt vorbei ("out-turning the missile").
 */
import * as THREE from 'three';
import type { Vehicle } from './Vehicle';
import type { MissileSpec } from '../types';
import type { ProjectileEnv } from './Projectile';

// Wiederverwendete Vektoren (kein new im 60-Hz-Loop!)
const _r = new THREE.Vector3();
const _vRel = new THREE.Vector3();
const _omega = new THREE.Vector3();
const _acc = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class Missile {
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  life = 12;           // s Lebensdauer (Selbstzerlegung)
  active = false;
  owner!: Vehicle;
  target!: Vehicle;

  private mspec!: MissileSpec;
  private burn = 0;    // verbleibende Treibwerkszeit
  private trailAcc = 0;
  private mesh: THREE.Mesh;

  constructor(private scene: THREE.Scene) {
    // Kleiner schlanker Körper + Glutkegel — wiederverwendet, nur sichtbar geschaltet
    const geo = new THREE.CylinderGeometry(0.22, 0.22, 3.2, 6);
    geo.rotateX(Math.PI / 2); // Zylinder-Achse Y → Z (Flugrichtung)
    const mat = new THREE.MeshStandardMaterial({ color: 0xdadfe2, flatShading: true });
    this.mesh = new THREE.Mesh(geo, mat);
    const glowGeo = new THREE.ConeGeometry(0.28, 1.4, 6);
    glowGeo.rotateX(-Math.PI / 2);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffb055 });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.z = -2.2;
    this.mesh.add(glow);
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  launch(owner: Vehicle, target: Vehicle, spec: MissileSpec, forward: THREE.Vector3): void {
    this.owner = owner;
    this.target = target;
    this.mspec = spec;
    this.life = 12;
    this.burn = spec.burnTime;
    this.pos.copy(owner.pos).addScaledVector(forward, 6).add(new THREE.Vector3(0, -1.2, 0));
    this.vel.copy(forward).multiplyScalar(owner.speed + 40); // Start = Trägerfahrt + Boost
    this.active = true;
    this.mesh.visible = true;
  }

  /** Physikschritt. true = Rakete verbraucht (Einschlag/Detonation/Lifetime). */
  update(dt: number, env: MissileEnv): boolean {
    const spec = this.mspec;
    this.life -= dt;
    if (this.life <= 0) return true;

    // Antrieb: während der Brennzeit auf Marschgeschwindigkeit beschleunigen,
    // danach nur noch leichter Luftwiderstand (ballistische Ausklingphase).
    if (this.burn > 0) {
      this.burn -= dt;
      const s = this.vel.length();
      const ns = Math.min(spec.speed, s + spec.accel * dt);
      this.vel.setLength(ns);
      this.trailAcc += dt;
      if (this.trailAcc > 0.028) { // Rauchspur alle ~30 ms
        this.trailAcc = 0;
        env.missileTrail(this.pos);
      }
    } else {
      this.vel.multiplyScalar(1 - 0.06 * dt);
    }

    // ---- Proportionale Navigation ------------------------------------------
    if (this.target.alive) {
      _r.subVectors(this.target.pos, this.pos);        // Sichtlinie r
      _vRel.subVectors(this.vel, this.target.vel);      // relative Geschwindigkeit
      const range = _r.length();
      if (range > 0.001) {
        // ω = (r × vRel) / |r|²  — Drehgeschwindigkeit der Sichtlinie
        _omega.crossVectors(_r, _vRel).divideScalar(range * range);
        // Vc = -(r·vRel)/|r|  (positiv = nähern sich)
        const vc = -_r.dot(_vRel) / range;
        // a_cmd = N · Vc · ω  (nur sinnvoll bei Annäherung — sonst ausblenden)
        _acc.copy(_omega).multiplyScalar(Math.max(0, vc) * spec.navConstant);
        // Seitliche Beschleunigung limitieren: a_max = speed · turnRate
        const aMax = this.vel.length() * spec.turnRate;
        if (_acc.lengthSq() > aMax * aMax) _acc.setLength(aMax);
        this.vel.addScaledVector(_acc, dt);
      }

      // Annäherungszünder: nah genug = detonieren
      if (range < 14) {
        env.explosionAt(this.pos, 1);
        env.applyDamage(this.target, spec.damage, this.owner);
        return true;
      }
    }

    // Bodenkontakt
    if (this.pos.y <= env.surfaceHeight(this.pos.x, this.pos.z)) {
      env.explosionAt(this.pos, 0.8);
      return true;
    }

    // Integrieren + Ausrichtung: Modell-Nase (+Z) entlang der Geschwindigkeit
    this.pos.addScaledVector(this.vel, dt);
    if (this.vel.lengthSq() > 0.001) {
      _q.setFromUnitVectors(Missile.UNIT_Z, _r.copy(this.vel).normalize());
      this.mesh.quaternion.copy(_q);
    }
    this.mesh.position.copy(this.pos);
    return false;
  }

  despawn(): void {
    this.active = false;
    this.mesh.visible = false;
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }

  private static readonly UNIT_Z = new THREE.Vector3(0, 0, 1);
}

/** Erweiterte Env für Raketen (Rauchspur zusätzlich). */
export interface MissileEnv extends ProjectileEnv {
  missileTrail(pos: THREE.Vector3): void;
}
