/**
 * 3 Welt-Konfigurationen — komplett prozedural aus diesen Daten gebaut
 * (Terrain-Palette, Nebel, Himmel, Wasser, Gegner-Mix, Spieler-Spawn).
 */
import type { WorldSpec } from '../types';

export const WORLDS: WorldSpec[] = [
  // 1) Archipel — türkises Wasser, 8–12 Inseln, heller Dunst
  {
    id: 'archipelago',
    name: 'Archipel',
    tagline: 'Türkiswasser · Inselgruppe · Flotte Präsenz',
    terrain: {
      seed: 1337,
      amplitude: 95,
      frequency: 0.0035,
      octaves: 4,
      islandCount: 10,
      islandRadius: 95,
      terrace: 0,
      canyon: false,
      lakeRadius: 0, lakeX: 0, lakeZ: 0,
    },
    water: { enabled: true, color: 0x2ec4b6, deepColor: 0x0b6e7a, frozen: false },
    sky: {
      topColor: 0x79b7d6, horizonColor: 0xdceef2, sunColor: 0xfff3d6,
      sunDir: [0.45, 0.62, 0.34], sunIntensity: 2.6, ambient: 0.75,
    },
    fog: { color: 0xd6e8ec, near: 900, far: 4200 },
    clouds: 26,
    rocks: 90,
    palette: [
      { h: -80, color: 0x0b5060 },  // Meeresboden (dunkel türkis)
      { h: -2, color: 0x18a3a0 },  // Uferzone unter Wasser
      { h: 1.5, color: 0xe7d9a8 }, // Strandring (heller Sand)
      { h: 6, color: 0xb9ba7e },   // Dünengras
      { h: 30, color: 0x6f8455 },  // bewachsene Hänge
      { h: 65, color: 0x77796b },  // Fels
      { h: 95, color: 0x9aa099 },  // helles Gipfelgestein
    ],
    enemies: { jets: 4, ships: 1, tanks: 0 },
    spawn: { x: 0, y: 480, z: -1400, heading: 0 },
    gradientCss: 'linear-gradient(180deg,#79b7d6 0%,#dceef2 42%,#2ec4b6 42.5%,#0b6e7a 100%)',
  },

  // 2) Wüsten-Canyon — gerastertes Rauschen, Mesas, oranger Nebel
  {
    id: 'canyon',
    name: 'Wüsten-Canyon',
    tagline: 'Sandstein-Mesas · Schluchten · Panzergräben',
    terrain: {
      seed: 4242,
      amplitude: 130,
      frequency: 0.0042,
      octaves: 5,
      islandCount: 0,
      islandRadius: 0,
      terrace: 22,        // Mesa-Terrassen
      canyon: true,
      lakeRadius: 0, lakeX: 0, lakeZ: 0,
    },
    water: { enabled: false, color: 0, deepColor: 0, frozen: false },
    sky: {
      topColor: 0xc9924e, horizonColor: 0xf2c98e, sunColor: 0xffd9a0,
      sunDir: [-0.5, 0.45, 0.3], sunIntensity: 2.8, ambient: 0.7,
    },
    fog: { color: 0xe8b780, near: 700, far: 3800 },
    clouds: 18,
    rocks: 70,
    palette: [
      { h: -50, color: 0x8a5a33 },  // Canyonsohle (dunkler Sandstein)
      { h: 5, color: 0xc98d54 },    // Wüstensand
      { h: 40, color: 0xd8a566 },   // heller Sandstein
      { h: 80, color: 0xb07040 },   // rotes Gestein
      { h: 115, color: 0x8a4f36 },  // dunkle Mesa-Plateaus
      { h: 140, color: 0x6e4230 },  // Schattenkanten oben
    ],
    enemies: { jets: 3, ships: 0, tanks: 2 },
    spawn: { x: -600, y: 520, z: -1200, heading: 0.4 },
    gradientCss: 'linear-gradient(180deg,#c9924e 0%,#f2c98e 48%,#c98d54 52%,#8a4f36 100%)',
  },

  // 3) Schneegipfel — Alpen, bläulicher Nebel, zugefrorener See
  {
    id: 'alps',
    name: 'Schneegipfel',
    tagline: 'Alpenpanorama · Eissee · Klarluft-Dogfights',
    terrain: {
      seed: 9001,
      amplitude: 340,
      frequency: 0.0038,
      octaves: 5,
      islandCount: 0,
      islandRadius: 0,
      terrace: 0,
      canyon: false,
      lakeRadius: 260,   // zugefrorener See
      lakeX: 450, lakeZ: 380,
    },
    water: { enabled: true, color: 0x9fc4d8, deepColor: 0x7aa8c4, frozen: true },
    sky: {
      topColor: 0x5d84a8, horizonColor: 0xcfe0ea, sunColor: 0xffffff,
      sunDir: [0.35, 0.55, -0.42], sunIntensity: 2.4, ambient: 0.95,
    },
    fog: { color: 0xc4d6e2, near: 1000, far: 4800 },
    clouds: 30,
    rocks: 60,
    palette: [
      { h: -50, color: 0x5d6d78 },  // Talsohle (blaugrau)
      { h: 60, color: 0x74858c },   // Felsuntergrund
      { h: 150, color: 0x8b979c },  // alpine Matten
      { h: 220, color: 0xd7dde2 },  // Schneegrenze
      { h: 290, color: 0xf4f7fa },  // Schneehänge
      { h: 360, color: 0xffffff },  // Gipfel
    ],
    enemies: { jets: 5, ships: 0, tanks: 0 },
    spawn: { x: -300, y: 620, z: -1500, heading: 0.2 },
    gradientCss: 'linear-gradient(180deg,#5d84a8 0%,#cfe0ea 45%,#f4f7fa 60%,#74858c 100%)',
  },
];

export const WORLDS_BY_ID: Record<string, WorldSpec> = Object.fromEntries(
  WORLDS.map((w) => [w.id, w]),
);
