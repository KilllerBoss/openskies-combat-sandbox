/**
 * TerrainGen — deterministisches, geseedetes Höhenfeld.
 *
 * Didaktik (Lernprojekt): Statt einer Noise-Bibliothek bauen wir Wert-Rauschen
 * selbst — so sieht man jeden Schritt:
 *   1. hash(ix, iz)        → reproduzierbare Zufallszahl pro Gitterzelle (0..1)
 *   2. valueNoise(x, z)    → bilineare Interpolation zwischen Zellwerten mit
 *                            quintic-Verlauf (C²-stetig → keine sichtbaren Kanten)
 *   3. fbm(x, z)           → "fractal Brownian motion": mehrere Oktaven mit
 *                            doppelter Frequenz & halber Amplitude überlagern
 *   4. ridged(x, z)        → gratige Variante: 1-|2·noise-1| ergipelt Bergrücken
 *   5. Welt-Former         → Insel-Buckel, Mesa-Terrassen, Canyon, Eissee
 *
 * Die Funktion height(x, z) ist ANALYTISCH (kein Mesh-Lookup!) — dieselbe
 * Formel nutzt der Meshaufbau, die Kollisionsprüfung und der Panzer-Boden.
 */
import type { TerrainSpec } from '../types';

/** 32-Bit-Integer-Hash → [0,1). Deterministisch für (ix, iz, seed). */
function hash(ix: number, iz: number, seed: number): number {
  // Math.imul = schnelle 32-Bit-Multiplikation ohne Präzisionsverlust
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296; // 2^32 → sauberes [0,1)
}

/** Quintic-Verlauf (Perlin's fade): glatter als smoothstep. */
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Weiches Wert-Rauschen: Gitterzellen + C²-Interpolation. */
function valueNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = fade(x - ix);
  const fz = fade(z - iz);
  const a = hash(ix, iz, seed);
  const b = hash(ix + 1, iz, seed);
  const c = hash(ix, iz + 1, seed);
  const d = hash(ix + 1, iz + 1, seed);
  // Bilineare Mischung der vier Zellecken
  const top = a + (b - a) * fx;
  const bottom = c + (d - c) * fx;
  return top + (bottom - top) * fz;
}

/** Fraktales Rauschen: Oktaven mit steigender Frequenz, fallender Amplitude. */
function fbm(x: number, z: number, seed: number, octaves: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let fx = x;
  let fz = z;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(fx, fz, seed + o * 101);
    norm += amp;
    amp *= 0.5;   // jede Oktave halb so stark
    fx *= 2.02;   // … aber doppelt so fein (Lacunarity leicht >2 gegen Muster)
    fz *= 2.02;
  }
  return sum / norm; // auf [0,1] normiert
}

/** Gratiges Rauschen (1-|2n-1|) — Bergkämme statt Hügel. */
function ridged(x: number, z: number, seed: number, octaves: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let fx = x;
  let fz = z;
  for (let o = 0; o < octaves; o++) {
    const n = valueNoise(fx, fz, seed + o * 131);
    sum += amp * (1 - Math.abs(2 * n - 1));
    norm += amp;
    amp *= 0.5;
    fx *= 2.05;
    fz *= 2.05;
  }
  return sum / norm;
}

/** Deterministischer Zufall für Welt-Layout (Insel-Positionen etc.). */
export class SeededRandom {
  private state: number;
  constructor(seed: number) {
    this.state = (seed >>> 0) || 1;
  }
  next(): number {
    // xorshift32 — klein, schnell, gut genug für Weltenbau
    let x = this.state;
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    this.state = x;
    return x / 4294967296;
  }
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }
}

/** Insel-Zentren werden einmalig erzeugt (deterministisch). */
interface IslandBump {
  x: number;
  z: number;
  radius: number;
  height: number;
}

export class TerrainGen {
  private readonly cfg: TerrainSpec;
  private readonly islands: IslandBump[] = [];
  /** ~300×300 Einsatzgebiet; außerhalb wird das Gelände flacher (Weltende). */
  private readonly worldRadius = 2600;

  constructor(cfg: TerrainSpec) {
    this.cfg = cfg;
    if (cfg.islandCount > 0) {
      const rng = new SeededRandom(cfg.seed ^ 0x5eed);
      for (let i = 0; i < cfg.islandCount; i++) {
        const angle = (i / cfg.islandCount) * Math.PI * 2 + rng.range(-0.25, 0.25);
        const dist = rng.range(500, 2100);
        this.islands.push({
          x: Math.cos(angle) * dist,
          z: Math.sin(angle) * dist,
          radius: cfg.islandRadius * rng.range(0.55, 1.25),
          height: cfg.amplitude * rng.range(0.75, 1.35),
        });
      }
    }
  }

  /**
   * Analytische Terrainhöhe an (x, z) — identisch für Rendering,
   * Kollision, Panzerabtastung und Props.
   */
  height(x: number, z: number): number {
    const cfg = this.cfg;
    const nx = x * cfg.frequency;
    const nz = z * cfg.frequency;

    // Basis: fractal Brownian motion auf [0,1]
    let h = fbm(nx, nz, cfg.seed, cfg.octaves) - 0.5; // → [-0.5, 0.5]

    // Wüste: gratige Struktur + Mesa-Terrassen
    if (cfg.terrace > 0) {
      const r = ridged(nx * 0.7, nz * 0.7, cfg.seed + 7, 3) - 0.5;
      h = h * 0.4 + r * 0.6;
      // Terrassierung: Höhe in Stufen quantisieren, obere Kante etwas glätten
      const steps = h * cfg.amplitude;
      const quant = Math.floor(steps / cfg.terrace) * cfg.terrace;
      const frac = steps / cfg.terrace - Math.floor(steps / cfg.terrace);
      const smooth = quant + cfg.terrace * Math.min(1, frac * frac * (3 - 2 * frac) * 1.6);
      h = smooth / cfg.amplitude;
    }

    // Schnee: Gratigung für scharfe Gipfel
    if (cfg.lakeRadius > 0) {
      const r = ridged(nx * 0.8, nz * 0.8, cfg.seed + 3, 4);
      h = h * 0.55 + (r - 0.5) * 0.75;
    }

    let height = h * cfg.amplitude;

    // Archipel: garantierte Insel-Buckel (radiale, weich auslaufende Hügel)
    for (const isl of this.islands) {
      const dx = x - isl.x;
      const dz = z - isl.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < isl.radius * 1.6) {
        const t = Math.max(0, 1 - d / (isl.radius * 1.6));
        // glatter Buckel: cos-Verlauf, durch fbm leicht unregelmäßig
        const bump = (0.5 + 0.5 * Math.cos((1 - t) * Math.PI * 0.5 + Math.PI * 0.5));
        height = Math.max(height, bump * isl.height * (0.85 + 0.3 * fbm(nx * 3, nz * 3, cfg.seed + 11, 2)) - 12);
      }
    }

    // Canyon (Wüste): entlang einer sanft geschwungenen Schneise abgraben
    if (cfg.canyon) {
      const pathX = Math.sin(z * 0.0022) * 420 + Math.sin(z * 0.0007 + 2) * 260;
      const distToPath = Math.abs(x - pathX);
      const canyonWidth = 90 + 40 * Math.sin(z * 0.004 + 1.3);
      if (distToPath < canyonWidth) {
        const t = distToPath / canyonWidth;
        const carve = (1 - t * t) * 78; // parabolische Vertiefung
        height -= carve;
      }
    }

    // Zugefrorener See (Schnee): Fläche auf Seespiegel nivellieren
    if (cfg.lakeRadius > 0) {
      const dx = x - cfg.lakeX;
      const dz = z - cfg.lakeZ;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < cfg.lakeRadius * 1.15) {
        const t = Math.min(1, d / (cfg.lakeRadius * 1.15));
        const blend = 1 - t * t * (3 - 2 * t); // smoothstep-Rand
        height = height * (1 - blend) + 52 * blend; // Seespiegel bei y = 52
      }
    }

    // Sanftes Weltrand-Abflachen (Spieler bleibt freiwillig in der Zone)
    const distC = Math.sqrt(x * x + z * z);
    if (distC > this.worldRadius) {
      const t = Math.min(1, (distC - this.worldRadius) / 900);
      height *= 1 - t * 0.85;
    }
    return height;
  }
}
