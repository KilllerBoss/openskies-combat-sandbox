/**
 * ModelFactory — prozedurale Low-Poly-Modelle (flat-shaded).
 *
 * KEINE Original-Assets (Copyright!) — jede Silhouette entsteht aus den
 * Parametern im VehicleSpec: Spannweite, Pfeilung, Doppel-Seitenflosse,
 * Canards, LERX, Zwillings-Triebwerk …
 *
 * Konvention: Nase zeigt +Z, oben +Y, rechts +X (identisch zur Physik!).
 *
 * GLB-Hook: ModelSpec {type:'glb', src, scale} lädt stattdessen eine Datei
 * (z. B. CC0-Modelle von kenney.nl oder quaternius.com). Es werden absichtlich
 * keine .glb-Dateien ausgeliefert — der Pfad funktioniert, sobald der Nutzer
 * eigene Modelle nach public/models/ legt.
 */
import * as THREE from 'three';
import type { ModelSpec, VehicleSpec } from '../types';

export interface VehicleVisualUpdate {
  throttle: number;
  time: number;
  turretYaw?: number;
  turretPitch?: number;
}

export interface VehicleVisual {
  group: THREE.Group;
  /** Afterburner-/Turm-Animation; wird pro Render-Frame aufgerufen. */
  update(u: VehicleVisualUpdate): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Low-Poly-Hilfsbausteine
// ---------------------------------------------------------------------------

/** Flügel-/Flossenfläche als flaches 4-Eck (Doppeldreieck) in der XZ-Ebene. */
function makeWing(
  span: number,          // Halbspannweite vom Rumpfansatz
  sweepDeg: number,      // Pfeilung
  rootChord: number,     // Tiefe an der Wurzel
  tipChord: number,      // Tiefe an der Spitze
  side: 1 | -1,          // +1 = rechter Flügel
): THREE.BufferGeometry {
  const sweep = Math.tan((sweepDeg * Math.PI) / 180) * span;
  // Spannweite verjüngt sich Richtung Rumpfmitte (x=0.55 lässt Platz für Rumpf)
  const x0 = 0.55 * side;
  const x1 = (0.55 + span) * side;
  const zLE0 = rootChord * 0.5;          // Wurzel-Vorderkante
  const zLE1 = zLE0 - sweep;             // Spitzen-Vorderkante (nach hinten)
  const verts = new Float32Array([
    x0, 0, zLE0,
    x1, 0, zLE1,
    x1, 0, zLE1 - tipChord,
    x0, 0, -rootChord * 0.5,
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  if (side === -1) geo.setIndex([0, 2, 1, 0, 3, 2]); // Wicklungsrichtung spiegeln
  geo.computeVertexNormals();
  return geo;
}

/** Seitenflosse (vertikal, in der YZ-Ebene). */
function makeFin(
  height: number,
  sweepDeg: number,
  rootChord: number,
  tipChord: number,
  x: number,
): THREE.BufferGeometry {
  const sweep = Math.tan((sweepDeg * Math.PI) / 180) * height;
  const verts = new Float32Array([
    x, 0, rootChord * 0.5,
    x, height, rootChord * 0.5 - sweep,
    x, height, rootChord * 0.5 - sweep - tipChord,
    x, 0, -rootChord * 0.5,
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.computeVertexNormals();
  return geo;
}

function metal(color: number, opts: { flat?: boolean } = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    flatShading: true,
    metalness: 0.25,
    roughness: 0.72,
    ...opts,
  });
}

const GLASS = () => new THREE.MeshStandardMaterial({
  color: 0x18262e, flatShading: true, metalness: 0.75, roughness: 0.18,
});

// ---------------------------------------------------------------------------
// JET
// ---------------------------------------------------------------------------

function buildJet(spec: VehicleSpec & { model: Extract<ModelSpec, { type: 'jet' }>; }): VehicleVisual {
  const m = spec.model;
  const group = new THREE.Group();

  const bodyMat = metal(m.baseColor);
  const markMat = metal(m.markColor);
  const darkMat = metal(0x2d3136);

  const L = m.length;
  const fuselageR = 0.62;

  // --- Rumpf: Zylinder-Kette (Hinten dicker, vorn spitz zulaufend) ---
  const fus = new THREE.Mesh(
    new THREE.CylinderGeometry(fuselageR * 0.72, fuselageR, L * 0.6, 6),
    bodyMat,
  );
  fus.rotation.x = Math.PI / 2; // Achse Y → Z (Nase +Z = radiusTop-Seite)
  group.add(fus);

  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(fuselageR * 0.72, L * 0.28, 6),
    bodyMat,
  );
  nose.rotation.x = Math.PI / 2;
  nose.position.z = L * 0.3 + L * 0.14;
  group.add(nose);

  // --- Cockpit-Kanzel: getönte Halbkugel, gestreckt ---
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.52, 8, 6), GLASS());
  canopy.scale.set(0.8, 0.75, 1.9);
  canopy.position.set(0, fuselageR * 0.78, L * 0.14);
  group.add(canopy);

  // --- Tragflächen (aus Spec: Spannweite/Pfeilung/Tiefen) ---
  const wingMat = bodyMat.clone();
  const halfSpan = m.wingspan / 2 - 0.55;
  for (const side of [1, -1] as const) {
    const wing = new THREE.Mesh(
      makeWing(halfSpan, m.sweep, m.rootChord, m.tipChord, side), wingMat,
    );
    wing.position.z = L * 0.02;
    group.add(wing);
    // Markierungsfarbe an der Flügelspitze
    const tipStripe = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 0.07, m.tipChord * 0.95), markMat,
    );
    tipStripe.position.set(side * (0.55 + halfSpan - 0.5), 0, L * 0.02 + m.rootChord * 0.5
      - Math.tan((m.sweep * Math.PI) / 180) * (halfSpan - 0.5) - m.tipChord * 0.5);
    group.add(tipStripe);
  }

  // --- LERX (Hornet): Wurzelverlängerung als dünne Kante vorn ---
  if (m.lerx) {
    for (const side of [1, -1] as const) {
      const lerx = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.06, L * 0.3), wingMat,
      );
      lerx.position.set(side * 0.85, -0.08, L * 0.2);
      lerx.rotation.y = -side * 0.16;
      group.add(lerx);
    }
  }

  // --- Höhenleitwerk (kleiner Flügel hinten) ---
  const stabSpan = m.wingspan * 0.22;
  for (const side of [1, -1] as const) {
    const stab = new THREE.Mesh(
      makeWing(stabSpan, m.sweep + 5, m.rootChord * 0.5, m.tipChord * 0.6, side), wingMat,
    );
    stab.position.z = -L * 0.34;
    group.add(stab);
  }

  // --- Canards (Delta/Viggen): kleine Flächen weit vorn ---
  if (m.canards) {
    for (const side of [1, -1] as const) {
      const canard = new THREE.Mesh(
        makeWing(m.wingspan * 0.16, m.sweep * 0.55, m.rootChord * 0.32, m.tipChord * 0.5, side), wingMat,
      );
      canard.position.z = L * 0.22;
      group.add(canard);
    }
  }

  // --- Seitenflosse(n): Einzel- oder Doppel-Setup aus dem Spec ---
  const finH = m.tailCount === 2 ? 2.0 : 2.5;
  const finXs: number[] = m.tailCount === 2 ? [-0.55, 0.55] : [0];
  for (const fx of finXs) {
    const fin = new THREE.Mesh(
      makeFin(finH, 45, L * 0.17, L * 0.05, fx), wingMat,
    );
    fin.position.z = -L * 0.3;
    group.add(fin);
    // Farbwinkel an der Flossenspitze
    const finTip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, L * 0.05), markMat);
    finTip.position.set(fx, finH - 0.2, -L * 0.3 + L * 0.17 * 0.5 - Math.tan(Math.PI / 4) * (finH - 0.2) - L * 0.025);
    group.add(finTip);
  }

  // --- Triebwerk(s): Auspuff + Glüh-Scheibe + Afterburner-Kegel ---
  const afterburners: THREE.Mesh[] = [];
  const glows: THREE.Mesh[] = [];
  const exhaustXs = m.twinEngine ? [-0.5, 0.5] : [0];
  for (const ex of exhaustXs) {
    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.4, 1.2, 6), darkMat,
    );
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(ex, 0, -L * 0.31);
    group.add(pipe);

    // Emissive Glüh-Scheibe (additiv weich)
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(0.3, 8),
      new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0.9 }),
    );
    glow.position.set(ex, 0, -L * 0.32);
    glow.rotation.y = Math.PI;
    group.add(glow);
    glows.push(glow);

    // Afterburner-Kegel — sichtbar ab throttle > 0,85 (in update())
    const ab = new THREE.Mesh(
      new THREE.ConeGeometry(0.3, 3.4, 6, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffb347, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    ab.rotation.x = -Math.PI / 2; // Kegel zeigt nach hinten (−Z)
    ab.position.set(ex, 0, -L * 0.32 - 1.7);
    group.add(ab);
    afterburners.push(ab);
  }

  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = false;
    }
  });

  return {
    group,
    update({ throttle, time }) {
      // Nachbrenner: ab 85 % Schub mit Flacker-Rauschen einblenden
      const burn = THREE.MathUtils.clamp((throttle - 0.85) / 0.15, 0, 1);
      for (const ab of afterburners) {
        const mat = ab.material as THREE.MeshBasicMaterial;
        mat.opacity = burn * (0.45 + 0.25 * Math.sin(time * 61 + ab.position.x * 7));
        const s = 0.7 + 0.5 * burn + 0.06 * Math.sin(time * 47);
        ab.scale.set(1, s, 1);
      }
      for (const g of glows) {
        (g.material as THREE.MeshBasicMaterial).opacity = 0.5 + 0.45 * throttle;
      }
    },
    dispose() {
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
    },
  };
}

// ---------------------------------------------------------------------------
// SCHIFF
// ---------------------------------------------------------------------------

function buildShip(spec: VehicleSpec & { model: Extract<ModelSpec, { type: 'ship' }>; }): VehicleVisual {
  const m = spec.model;
  const group = new THREE.Group();
  const L = m.length;
  const B = m.beam;

  const hullMat = metal(m.baseColor);
  const deckMat = metal(0x4a5158);
  const markMat = metal(m.markColor);
  const darkMat = metal(0x23262b);

  // Rumpf: Hauptbox + spitz zulaufender Bug (4-seitiger Kegel, flach skaliert)
  const hull = new THREE.Mesh(new THREE.BoxGeometry(B, 6, L * 0.62), hullMat);
  hull.position.set(0, -1, -L * 0.16);
  group.add(hull);

  const bow = new THREE.Mesh(new THREE.ConeGeometry(B * 0.5, L * 0.3, 4), hullMat);
  bow.geometry.rotateZ(Math.PI / 4);      // Raute → flaches Quadrat
  bow.geometry.scale(1, 6 / (B * 0.5 * Math.SQRT2), 1);
  bow.rotation.x = Math.PI / 2;           // zeigt +Z
  bow.position.set(0, -1, L * 0.3);
  group.add(bow);

  // Heck (leicht abfallend)
  const stern = new THREE.Mesh(new THREE.BoxGeometry(B * 0.8, 5, L * 0.1), hullMat);
  stern.position.set(0, -1.4, -L * 0.52);
  group.add(stern);

  // Deck
  const deck = new THREE.Mesh(new THREE.BoxGeometry(B * 0.92, 0.5, L * 0.58), deckMat);
  deck.position.set(0, 1.9, -L * 0.16);
  group.add(deck);

  // Aufbauten (Brücke gestapelt + Fensterband)
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(B * 0.7, 4.5, L * 0.16), hullMat);
  bridge.position.set(0, 4.4, -L * 0.05);
  group.add(bridge);
  const windows = new THREE.Mesh(new THREE.BoxGeometry(B * 0.72, 1.1, L * 0.1), darkMat);
  windows.position.set(0, 5.6, -L * 0.02);
  group.add(windows);
  const bridgeTop = new THREE.Mesh(new THREE.BoxGeometry(B * 0.5, 1.6, L * 0.08), deckMat);
  bridgeTop.position.set(0, 7.2, -L * 0.06);
  group.add(bridgeTop);

  // Schornstein mit Markierungsband
  const funnel = new THREE.Mesh(new THREE.BoxGeometry(B * 0.34, 6.5, L * 0.07), hullMat);
  funnel.position.set(0, 5.4, -L * 0.26);
  group.add(funnel);
  const funnelBand = new THREE.Mesh(new THREE.BoxGeometry(B * 0.36, 1.4, L * 0.075), markMat);
  funnelBand.position.set(0, 7.6, -L * 0.26);
  group.add(funnelBand);

  // Mast + Querrah
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 12, 5), darkMat);
  mast.position.set(0, 13, -L * 0.14);
  group.add(mast);
  const yard = new THREE.Mesh(new THREE.BoxGeometry(B * 0.6, 0.3, 0.3), darkMat);
  yard.position.set(0, 16, -L * 0.14);
  group.add(yard);

  // Geschütztürme (Guardian 2, Wolf 0 → nur MG-Kugel)
  const turrets: THREE.Group[] = [];
  if (m.turrets > 0) {
    const positions = m.turrets >= 2
      ? [L * 0.22, -L * 0.38]
      : [L * 0.2];
    for (const pz of positions) {
      const turret = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.4, 1.4, 8), deckMat);
      turret.add(base);
      const house = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.9, 4.2), hullMat);
      house.position.y = 1.5;
      turret.add(house);
      for (const bx of [-0.7, 0.7]) {
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 7, 5), darkMat);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(bx, 1.6, 3.4);
        turret.add(barrel);
      }
      turret.position.set(0, 2.2, pz);
      group.add(turret);
      turrets.push(turret);
    }
  } else {
    const mg = new THREE.Mesh(new THREE.SphereGeometry(1.1, 6, 5), darkMat);
    mg.position.set(0, 3.4, L * 0.1);
    group.add(mg);
    const mgBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.4, 4), darkMat);
    mgBarrel.rotation.x = Math.PI / 2;
    mgBarrel.position.set(0, 3.4, L * 0.1 + 2.2);
    group.add(mgBarrel);
  }

  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = false;
    }
  });

  return {
    group,
    update({ time, turretYaw = 0 }) {
      // Türme schwenken träge mit (kosmetisch, Feuerlogik sitzt im WeaponSystem)
      for (let i = 0; i < turrets.length; i++) {
        const dir = i === 0 ? 1 : -1;
        const target = turretYaw * dir + Math.sin(time * 0.3 + i * 2) * 0.2;
        turrets[i].rotation.y += (target - turrets[i].rotation.y) * 0.04;
      }
    },
    dispose() {
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
    },
  };
}

// ---------------------------------------------------------------------------
// PANZER
// ---------------------------------------------------------------------------

function buildTank(spec: VehicleSpec & { model: Extract<ModelSpec, { type: 'tank' }>; }): VehicleVisual {
  const m = spec.model;
  const group = new THREE.Group();
  const L = m.length;
  const W = m.hullWidth;

  const bodyMat = metal(m.baseColor);
  const trackMat = metal(0x2a2d31);
  const markMat = metal(m.markColor);

  // Kettenboxen
  for (const side of [1, -1] as const) {
    const track = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.05, L * 0.98), trackMat);
    track.position.set(side * (W / 2 + 0.35), 0.55, 0);
    group.add(track);
    // Laufrollen-Andeutung: dunkle Streifen
    for (let i = 0; i < 4; i++) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.0, 8), trackMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(side * (W / 2 + 0.35), 0.42, -L * 0.36 + (i * L * 0.24));
      group.add(wheel);
    }
  }

  // Wanne + Bugpanzerung (leicht geneigte Platte)
  const hullTop = new THREE.Mesh(new THREE.BoxGeometry(W, 0.85, L * 0.9), bodyMat);
  hullTop.position.set(0, 1.25, -L * 0.03);
  group.add(hullTop);
  const glacis = new THREE.Mesh(new THREE.BoxGeometry(W, 0.16, L * 0.34), bodyMat);
  glacis.position.set(0, 1.35, L * 0.42);
  glacis.rotation.x = -0.42;
  group.add(glacis);

  // Turm (eigene Gruppe — dreht sich unabhängig)
  const turret = new THREE.Group();
  const turretBody = new THREE.Mesh(new THREE.BoxGeometry(W * 0.78, 0.85, L * 0.5), bodyMat);
  turretBody.position.y = 0.45;
  turret.add(turretBody);
  const markStripe = new THREE.Mesh(new THREE.BoxGeometry(W * 0.8, 0.14, L * 0.16), markMat);
  markStripe.position.set(0, 0.95, -L * 0.12);
  turret.add(markStripe);

  // Rohr mit Pivot (nickt für die Pitch-Visualisierung)
  const barrelPivot = new THREE.Group();
  barrelPivot.position.set(0, 0.55, L * 0.16);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, L * 0.72, 6), trackMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = L * 0.36;
  barrelPivot.add(barrel);
  const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 6), trackMat);
  muzzle.rotation.x = Math.PI / 2;
  muzzle.position.z = L * 0.7;
  barrelPivot.add(muzzle);
  turret.add(barrelPivot);
  turret.position.set(0, 1.75, -L * 0.05);
  group.add(turret);

  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = false;
    }
  });

  return {
    group,
    update({ turretYaw = 0, turretPitch = 0 }) {
      turret.rotation.y = turretYaw;
      barrelPivot.rotation.x = -turretPitch;
    },
    dispose() {
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
    },
  };
}

// ---------------------------------------------------------------------------
// GLB-Hook (asynchron — Datei muss unter public/ liegen)
// ---------------------------------------------------------------------------

export async function loadGlbVisual(
  src: string,
  scale: number,
): Promise<VehicleVisual> {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(src);
  const group = new THREE.Group();
  group.add(gltf.scene);
  group.scale.setScalar(scale);
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      const mat = o.material as THREE.MeshStandardMaterial;
      if (mat && 'flatShading' in mat) mat.flatShading = true;
    }
  });
  return {
    group,
    update() { /* GLB-Modelle haben keine prozeduralen Animationen */ },
    dispose() {
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const mat = o.material;
          if (Array.isArray(mat)) mat.forEach((mm) => mm.dispose());
          else mat.dispose();
        }
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Fassade
// ---------------------------------------------------------------------------

/** Baut das prozedurale Modell synchron (GLB → separater async-Pfad). */
export function createVehicleVisual(spec: VehicleSpec): VehicleVisual {
  switch (spec.model.type) {
    case 'jet':
      return buildJet(spec as Parameters<typeof buildJet>[0]);
    case 'ship':
      return buildShip(spec as Parameters<typeof buildShip>[0]);
    case 'tank':
      return buildTank(spec as Parameters<typeof buildTank>[0]);
    case 'glb':
      // Sollte async geladen werden — Fallback: schlichter Graukeil
      return buildJet({ ...spec, model: { type: 'jet', length: 15, wingspan: 10, sweep: 40, rootChord: 5, tipChord: 1.4, tailCount: 1, canards: false, lerx: false, twinEngine: false, markColor: 0xf2b134, baseColor: 0x8d949c } });
  }
}
