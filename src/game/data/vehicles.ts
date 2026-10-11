/**
 * 12 Fahrzeug-Definitionen — das Herz der Data-Driven-Architektur.
 * Die Engine kennt KEINE individuellen Fahrzeuge: alles Verhalten ergibt sich
 * aus diesen Zahlen (Physik + Bewaffnung) + der Fahrzeugklasse (Bewegungsmodell).
 *
 * Wertebereiche (Jets, bewusst vereinfachte reale Größenordnungen):
 *   mass 8.000–16.000 kg · Schub 120–200 kN · Flügelfläche 30–60 m²
 *   Vmax 280–420 m/s · HP 80–140
 */
import type { VehicleSpec } from '../types';

const JET_MISSILES = {
  count: 6,
  damage: 60,
  lockTime: 2.5,     // 2,5 s Ziel im Kegel halten → Lock
  lockCone: 25 * Math.PI / 180,
  lockRange: 3000,
  cooldown: 1.2,
  speed: 340,
  accel: 380,
  turnRate: 1.15,    // rad/s — hartes Kurvenfliegen bringt die Rakete aus der Bahn
  burnTime: 3.5,     // danach ballistisch
  navConstant: 4,    // N der proportionalen Navigation
};

const JET_CANNON = {
  rate: 25,
  damage: 8,
  muzzleVelocity: 950,
  spread: 0.006,
  ammo: 300,
  regen: 5,
  range: 2500,
};

/** Hilfsbaukasten für knifflige Werte pro Jet (Unterschiede spürbar, aber fair). */
export const VEHICLES: VehicleSpec[] = [
  // --------------------------------------------------------------- Jets (8) --
  {
    id: 'falcon',
    name: 'Falcon',
    vehicleClass: 'jet',
    role: 'Multirollen-Jäger',
    description: 'F-16-artiger Leichtjäger: Pfeilflügel, eine Seitenflosse, sehr wendig bei mittlerem Schub.',
    hp: 100,
    stats: { speed: 0.62, agility: 0.9, armor: 0.3, firepower: 0.6 },
    physics: {
      mass: 9500, maxThrust: 130000, wingArea: 32, maxSpeed: 340, stallSpeed: 62,
      cd0: 0.021, inducedK: 0.055, clSlope: 4.8, stallAngle: 16 * Math.PI / 180,
      maxPitchRate: 1.9, maxRollRate: 4.2, maxYawRate: 0.55, armor: 0.05,
    },
    cannon: JET_CANNON,
    missiles: JET_MISSILES,
    model: {
      type: 'jet', length: 15, wingspan: 9.5, sweep: 36, rootChord: 5, tipChord: 1.6,
      tailCount: 1, canards: false, lerx: false, twinEngine: false,
      markColor: 0xf2b134, baseColor: 0x8d949c,
    },
  },
  {
    id: 'tomcat',
    name: 'Tomcat',
    vehicleClass: 'jet',
    role: 'Langstrecken-Abfangjäger',
    description: 'F-14-artig: riesige Spannweite, Doppel-Seitenflosse, schwer & schnell — Trägheit spürbar.',
    hp: 120,
    stats: { speed: 0.8, agility: 0.55, armor: 0.55, firepower: 0.75 },
    physics: {
      mass: 15800, maxThrust: 200000, wingArea: 56, maxSpeed: 380, stallSpeed: 74,
      cd0: 0.026, inducedK: 0.05, clSlope: 4.4, stallAngle: 15 * Math.PI / 180,
      maxPitchRate: 1.35, maxRollRate: 2.6, maxYawRate: 0.42, armor: 0.15,
    },
    cannon: JET_CANNON,
    missiles: JET_MISSILES,
    model: {
      type: 'jet', length: 19, wingspan: 19, sweep: 30, rootChord: 6.5, tipChord: 2.2,
      tailCount: 2, canards: false, lerx: false, twinEngine: true,
      markColor: 0xd97b29, baseColor: 0x767d85,
    },
  },
  {
    id: 'falke',
    name: 'Falke',
    vehicleClass: 'jet',
    role: 'Luftüberlegenheitsjäger',
    description: 'MiG-29-artig: Doppel-Seitenflosse, zwei Triebwerke, brutal agil — der König im Kurvenkampf.',
    hp: 100,
    stats: { speed: 0.85, agility: 0.95, armor: 0.35, firepower: 0.7 },
    physics: {
      mass: 11200, maxThrust: 165000, wingArea: 38, maxSpeed: 400, stallSpeed: 66,
      cd0: 0.023, inducedK: 0.052, clSlope: 5.0, stallAngle: 17 * Math.PI / 180,
      maxPitchRate: 2.1, maxRollRate: 4.6, maxYawRate: 0.6, armor: 0.08,
    },
    cannon: JET_CANNON,
    missiles: JET_MISSILES,
    model: {
      type: 'jet', length: 17, wingspan: 11.3, sweep: 42, rootChord: 5.6, tipChord: 1.5,
      tailCount: 2, canards: false, lerx: false, twinEngine: true,
      markColor: 0xc23b2e, baseColor: 0x6f7d76,
    },
  },
  {
    id: 'raptor',
    name: 'Raptor',
    vehicleClass: 'jet',
    role: 'Stealth-Kampfjet',
    description: 'F-22-artiger Keil-Flügel: trefferresistent (Panzerung 0,25), schnell, stabil — der Panzer unter den Jets.',
    hp: 140,
    stats: { speed: 1.0, agility: 0.8, armor: 0.9, firepower: 0.85 },
    physics: {
      mass: 14500, maxThrust: 195000, wingArea: 44, maxSpeed: 420, stallSpeed: 70,
      cd0: 0.02, inducedK: 0.048, clSlope: 4.6, stallAngle: 16 * Math.PI / 180,
      maxPitchRate: 1.8, maxRollRate: 3.9, maxYawRate: 0.5, armor: 0.25,
    },
    cannon: JET_CANNON,
    missiles: JET_MISSILES,
    model: {
      type: 'jet', length: 18, wingspan: 13.5, sweep: 45, rootChord: 7.5, tipChord: 2.4,
      tailCount: 2, canards: false, lerx: false, twinEngine: true,
      markColor: 0x708090, baseColor: 0x5d646c,
    },
  },
  {
    id: 'delta',
    name: 'Delta',
    vehicleClass: 'jet',
    role: 'Canard-Delta-Jäger',
    description: 'Rafale-artig: Canards vor dem Delta-Flügel — sehr gutmütig bei hohem Anstellwinkel.',
    hp: 110,
    stats: { speed: 0.78, agility: 0.82, armor: 0.45, firepower: 0.72 },
    physics: {
      mass: 10600, maxThrust: 150000, wingArea: 47, maxSpeed: 360, stallSpeed: 63,
      cd0: 0.022, inducedK: 0.05, clSlope: 4.9, stallAngle: 19 * Math.PI / 180,
      maxPitchRate: 1.85, maxRollRate: 3.8, maxYawRate: 0.52, armor: 0.12,
    },
    cannon: JET_CANNON,
    missiles: JET_MISSILES,
    model: {
      type: 'jet', length: 15.5, wingspan: 11, sweep: 50, rootChord: 7.2, tipChord: 1.2,
      tailCount: 1, canards: true, lerx: false, twinEngine: true,
      markColor: 0x3f7d5a, baseColor: 0x8a919b,
    },
  },
  {
    id: 'viggen',
    name: 'Viggen',
    vehicleClass: 'jet',
    role: 'Doppel-Delta-Angriffsflugzeug',
    description: 'Saab-artiges Doppel-Delta mit Canards: ungewöhnlich robust, gutmütige Langsamflugeigenschaften.',
    hp: 115,
    stats: { speed: 0.7, agility: 0.62, armor: 0.6, firepower: 0.68 },
    physics: {
      mass: 12500, maxThrust: 142000, wingArea: 50, maxSpeed: 350, stallSpeed: 68,
      cd0: 0.024, inducedK: 0.051, clSlope: 4.7, stallAngle: 18 * Math.PI / 180,
      maxPitchRate: 1.55, maxRollRate: 3.1, maxYawRate: 0.46, armor: 0.18,
    },
    cannon: JET_CANNON,
    missiles: JET_MISSILES,
    model: {
      type: 'jet', length: 16.5, wingspan: 10.5, sweep: 58, rootChord: 9, tipChord: 1.0,
      tailCount: 1, canards: true, lerx: false, twinEngine: false,
      markColor: 0x8fa3b8, baseColor: 0x646b6f,
    },
  },
  {
    id: 'hornet',
    name: 'Hornet',
    vehicleClass: 'jet',
    role: 'Trägergestützter Multirollen-Jet',
    description: 'F/A-18-artig: LERX-Wurzeln machen ihn extrem kontrollierbar im langsamen Kurvenkampf.',
    hp: 115,
    stats: { speed: 0.72, agility: 0.86, armor: 0.5, firepower: 0.7 },
    physics: {
      mass: 12200, maxThrust: 160000, wingArea: 40, maxSpeed: 335, stallSpeed: 64,
      cd0: 0.023, inducedK: 0.052, clSlope: 4.85, stallAngle: 19 * Math.PI / 180,
      maxPitchRate: 1.95, maxRollRate: 4.0, maxYawRate: 0.55, armor: 0.14,
    },
    cannon: JET_CANNON,
    missiles: JET_MISSILES,
    model: {
      type: 'jet', length: 17, wingspan: 12.5, sweep: 28, rootChord: 4.6, tipChord: 1.8,
      tailCount: 2, canards: false, lerx: true, twinEngine: true,
      markColor: 0xf0f0e8, baseColor: 0x71787f,
    },
  },
  {
    id: 'phantom',
    name: 'Phantom',
    vehicleClass: 'jet',
    role: 'Klassischer schwerer Jäger',
    description: 'F-4-artig: klotzige Masse, mächtige Triebwerke, wenig Wendigkeit — Düsenjäger-Oldschool.',
    hp: 110,
    stats: { speed: 0.88, agility: 0.42, armor: 0.5, firepower: 0.66 },
    physics: {
      mass: 14000, maxThrust: 180000, wingArea: 49, maxSpeed: 390, stallSpeed: 76,
      cd0: 0.028, inducedK: 0.054, clSlope: 4.2, stallAngle: 14 * Math.PI / 180,
      maxPitchRate: 1.25, maxRollRate: 2.4, maxYawRate: 0.4, armor: 0.12,
    },
    cannon: JET_CANNON,
    missiles: JET_MISSILES,
    model: {
      type: 'jet', length: 18, wingspan: 11.5, sweep: 45, rootChord: 6, tipChord: 1.9,
      tailCount: 1, canards: false, lerx: false, twinEngine: true,
      markColor: 0xd9c27a, baseColor: 0x6d7478,
    },
  },

  // ------------------------------------------------------------ Schiffe (2) --
  {
    id: 'guardian',
    name: 'Guardian',
    vehicleClass: 'ship',
    role: 'Zerstörer (Flugabwehr)',
    description: 'Langsamer Flugabwehr-Zerstörer: 2 Türme mit Flak (Annäherungszünder) + SAM-Batterie. Viel HP.',
    hp: 400,
    stats: { speed: 0.15, agility: 0.1, armor: 1.0, firepower: 0.8 },
    physics: { maxSpeed: 15, accelTime: 5, turnRate: 0.14, armor: 0.3 },
    cannon: { rate: 1.2, damage: 0, muzzleVelocity: 800, spread: 0.01, ammo: 9999, regen: 0, range: 3500 },
    flak: {
      damage: 16, burst: 3, salvoCooldown: 2.6, fuseRadius: 26, splashRadius: 34, shellSpeed: 800,
    },
    sam: { cooldown: 16 },
    model: { type: 'ship', length: 130, beam: 15, turrets: 2, markColor: 0xf2b134, baseColor: 0x5e6670 },
  },
  {
    id: 'wolf',
    name: 'Wolf',
    vehicleClass: 'ship',
    role: 'Schnellboot (MG-Flak)',
    description: 'Schnell, wendig, leicht gepanzert — nur MG-Flak, aber schwer zu treffen.',
    hp: 120,
    stats: { speed: 0.45, agility: 0.4, armor: 0.35, firepower: 0.4 },
    physics: { maxSpeed: 26, accelTime: 4, turnRate: 0.4, armor: 0.05 },
    cannon: { rate: 1.2, damage: 0, muzzleVelocity: 800, spread: 0.014, ammo: 9999, regen: 0, range: 2200 },
    flak: {
      damage: 7, burst: 2, salvoCooldown: 1.8, fuseRadius: 20, splashRadius: 26, shellSpeed: 850,
    },
    model: { type: 'ship', length: 45, beam: 8, turrets: 0, markColor: 0xc23b2e, baseColor: 0x6d757d },
  },

  // ------------------------------------------------------------ Panzer (2) --
  {
    id: 'panther',
    name: 'Panther',
    vehicleClass: 'tank',
    role: 'Kampfpanzer',
    description: 'Schwerer Kampfpanzer: ballistische Granaten mit Splash-Schaden — gefährlich unter 400 m Höhe.',
    hp: 200,
    stats: { speed: 0.2, agility: 0.25, armor: 0.85, firepower: 0.75 },
    physics: { maxSpeed: 12, reverseSpeed: 6, turnRate: 0.7, turretRate: 1.1, armor: 0.25 },
    cannon: { rate: 1, damage: 0, muzzleVelocity: 400, spread: 0.008, ammo: 9999, regen: 0, range: 2600 },
    grenade: { damage: 45, splashRadius: 18, muzzleVelocity: 380, cooldown: 4.5 },
    model: { type: 'tank', length: 8, hullWidth: 3.6, markColor: 0x8fa3b8, baseColor: 0x5f6b52 },
  },
  {
    id: 'scout',
    name: 'Scout',
    vehicleClass: 'tank',
    role: 'leichter Spähpanzer',
    description: 'Schnell und klein: leichte Granaten, geringer Schaden, aber schwer zu treffen.',
    hp: 100,
    stats: { speed: 0.5, agility: 0.6, armor: 0.3, firepower: 0.4 },
    physics: { maxSpeed: 20, reverseSpeed: 10, turnRate: 1.0, turretRate: 1.6, armor: 0.05 },
    cannon: { rate: 1, damage: 0, muzzleVelocity: 400, spread: 0.012, ammo: 9999, regen: 0, range: 2200 },
    grenade: { damage: 28, splashRadius: 12, muzzleVelocity: 420, cooldown: 2.8 },
    model: { type: 'tank', length: 6.2, hullWidth: 2.9, markColor: 0xd9c27a, baseColor: 0x77806d },
  },
];

export const VEHICLES_BY_ID: Record<string, VehicleSpec> = Object.fromEntries(
  VEHICLES.map((v) => [v.id, v]),
);

/** AI-Gegner-Pools (Mix pro Welt wird in WorldSpec definiert). */
export const AI_JET_IDS = ['falcon', 'tomcat', 'falke', 'viggen', 'hornet', 'phantom'];
export const AI_SHIP_IDS = ['guardian', 'wolf'];
export const AI_TANK_IDS = ['panther', 'scout'];
