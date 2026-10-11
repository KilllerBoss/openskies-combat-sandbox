/**
 * OpenSkies — Kampf-Flug-Sandbox
 * Zentrale Typdefinitionen (data-driven: Fahrzeuge & Welten sind reine Daten,
 * die Engine interpretiert sie — kein hartkodiertes Verhalten pro Fahrzeug).
 */
import type * as THREE from 'three';

// ----------------------------------------------------------------------------
// Fahrzeuge
// ----------------------------------------------------------------------------

export type VehicleClass = 'jet' | 'ship' | 'tank';
export type GameModeId = 'free' | 'dogfight' | 'mixed';

/** Prozedurales Jet-Modell (ModelFactory baut daraus Low-Poly-Geometrie). */
export interface JetModelSpec {
  type: 'jet';
  length: number;        // Rumpflänge (m)
  wingspan: number;      // Spannweite (m)
  sweep: number;         // Flügelpfeilung (Grad)
  rootChord: number;     // Flügeltiefe an der Wurzel (m)
  tipChord: number;      // Flügeltiefe an der Spitze (m)
  tailCount: 1 | 2;      // Einzel- oder Doppel-Seitenflosse
  canards: boolean;      // Canardflächen vorn (Delta/Viggen)
  lerx: boolean;         // LERX-Wurzelverlängerung (Hornet)
  twinEngine: boolean;   // zwei Triebwerke → Doppel-Auspuff
  markColor: number;     // Markierungsfarbe (0xRRGGBB)
  baseColor: number;     // Grundfarbe (Military-Grau/Oliv/Sandblau)
}

export interface ShipModelSpec {
  type: 'ship';
  length: number;
  beam: number;          // Schiffsbreite
  turrets: number;       // 0 (nur MG) bis 2 Geschütztürme
  markColor: number;
  baseColor: number;
}

export interface TankModelSpec {
  type: 'tank';
  length: number;
  hullWidth: number;
  markColor: number;
  baseColor: number;
}

/**
 * GLB-Hook: statt prozeduralem Modell eine GLB-Datei laden.
 * HINWEIS: Es werden KEINE .glb-Dateien ausgeliefert (Copyright).
 * Empfohlene CC0-Quellen für eigene Modelle: kenney.nl (Asset-Store,
 * "Space Kit"/"Vehicle Kit") und quaternius.com (CC0 Low-Poly-Packs).
 * Datei nach public/models/ kopieren und hier referenzieren.
 */
export interface GlbModelSpec {
  type: 'glb';
  src: string;   // z. B. '/models/mein-jet.glb'
  scale: number;
}

export type ModelSpec = JetModelSpec | ShipModelSpec | TankModelSpec | GlbModelSpec;

// --- Physik-Parameter (pro Klasse unterschiedlich) ---------------------------

export interface JetPhysicsSpec {
  mass: number;          // Leermasse (kg)
  maxThrust: number;     // Maximalschub (N)
  wingArea: number;      // Flügelfläche (m²)
  maxSpeed: number;      // Vmax (m/s)
  stallSpeed: number;    // Überziehgeschwindigkeit (m/s) — HUD-Warnung
  cd0: number;           // Profilwiderstandsbeiwert
  inducedK: number;      // k-Faktor des induzierten Widerstands CD_i = k·CL²
  clSlope: number;       // Auftriebsanstieg dCL/dα (pro rad)
  stallAngle: number;    // Abrisswinkel (rad)
  maxPitchRate: number;  // max. Steuerrate (rad/s)
  maxRollRate: number;
  maxYawRate: number;
  armor: number;         // 0..0.4 Schadensabsorption (Stealth/Titan)
}

export interface ShipPhysicsSpec {
  maxSpeed: number;      // m/s (~30 kn = 15 m/s)
  accelTime: number;     // Sekunden von 0 auf volle Fahrt
  turnRate: number;      // rad/s Enddrehrate
  armor: number;
}

export interface TankPhysicsSpec {
  maxSpeed: number;      // m/s
  reverseSpeed: number;  // m/s
  turnRate: number;      // rad/s (Kettenwendung)
  turretRate: number;    // rad/s unabhängige Turmdrehung
  armor: number;
}

// --- Bewaffnung ---------------------------------------------------------------

export interface CannonSpec {
  rate: number;          // Schuss/s
  damage: number;        // Schaden pro Treffer
  muzzleVelocity: number;// m/s
  spread: number;        // Streuwinkel (rad)
  ammo: number;          // Magazingröße
  regen: number;         // Munitionsregeneration (Schuss/s)
  range: number;         // effektive Reichweite (m) → Lebensdauer
}

export interface MissileSpec {
  count: number;         // Anzahl mitgeführter Lenkraketen
  damage: number;
  lockTime: number;      // s Ziel halten bis Lock
  lockCone: number;      // rad, halber Öffnungswinkel des Suchkopfs
  lockRange: number;     // m
  cooldown: number;      // s zwischen Abschüssen
  speed: number;         // m/s Marschgeschwindigkeit
  accel: number;         // m/s² Beschleunigung bis Marsch
  turnRate: number;      // rad/s max. Drehrate (Ausweichfenster!)
  burnTime: number;      // s Treibwerksdauer, danach ballistisch
  navConstant: number;   // N der proportionalen Navigation
}

export interface FlakSpec {
  damage: number;
  burst: number;         // Schuss je Salve
  salvoCooldown: number; // s zwischen Salven
  fuseRadius: number;    // Annäherungszünder: Detonation bei Distanz (m)
  splashRadius: number;  // Schadensradius (m)
  shellSpeed: number;    // m/s
}

export interface SamSpec {
  cooldown: number;      // s zwischen SAM-Starts
}

export interface GrenadeSpec {
  damage: number;
  splashRadius: number;  // m
  muzzleVelocity: number;// m/s (ballistischer Bogen)
  cooldown: number;      // s
}

/** Vollständige Fahrzeug-Definition — alles, was Engine & Menü wissen müssen. */
export interface VehicleSpec {
  id: string;
  name: string;
  vehicleClass: VehicleClass;
  role: string;          // Kurzrolle (Menü)
  description: string;   // Lernprojekt-Hinweis / Charakter
  hp: number;
  stats: { speed: number; agility: number; armor: number; firepower: number }; // 0..1 Balken
  physics: JetPhysicsSpec | ShipPhysicsSpec | TankPhysicsSpec;
  cannon: CannonSpec;
  missiles?: MissileSpec;  // Jets
  flak?: FlakSpec;         // Schiffe
  sam?: SamSpec;           // Schiffe
  grenade?: GrenadeSpec;   // Panzer
  model: ModelSpec;
}

// ----------------------------------------------------------------------------
// Welten
// ----------------------------------------------------------------------------

export interface TerrainSpec {
  seed: number;
  amplitude: number;     // maximale Höhenauslenkung (m)
  frequency: number;     // Grundfrequenz des Rauschens (1/m)
  octaves: number;       // fBm-Oktaven (Detailreichtum)
  islandCount: number;   // Archipel: Anzahl garantierter Insel-Buckel
  islandRadius: number;  // Archipel: typischer Inselradius (m)
  terrace: number;       // Wüste: Terrassen-Stufenhöhe (m), 0 = aus
  canyon: boolean;       // Wüste: Canyon einmeißeln
  lakeRadius: number;    // Schnee: zugefrorener See (m), 0 = keiner
  lakeX: number;
  lakeZ: number;
}

export interface WaterSpec {
  enabled: boolean;
  color: number;         // Flachwasser
  deepColor: number;     // Tiefwasser
  frozen: boolean;       // zugefrorener See (Schneewelt)
}

export interface WorldSpec {
  id: string;
  name: string;
  tagline: string;
  terrain: TerrainSpec;
  water: WaterSpec;
  sky: {
    topColor: number;
    horizonColor: number;
    sunColor: number;
    sunDir: [number, number, number]; // normalisierte Sonnenrichtung
    sunIntensity: number;
    ambient: number;
  };
  fog: { color: number; near: number; far: number };
  clouds: number;        // Anzahl Wolken-Billboards
  rocks: number;         // Anzahl Felsbrocken (InstancedMesh)
  /** Höhen-Farbstufen (Vertex-Colors): h = Terrainhöhe in m. */
  palette: Array<{ h: number; color: number }>;
  enemies: { jets: number; ships: number; tanks: number };
  spawn: { x: number; y: number; z: number; heading: number }; // rad, 0 = +Z
  gradientCss: string;   // CSS-Gradient für Menü-Vorschau
}

// ----------------------------------------------------------------------------
// Laufzeit-Schnittstellen (Engine-intern)
// ----------------------------------------------------------------------------

/** Steuerbefehle, die Mensch ODER KI pro Frame an ein Fahrzeug geben. */
export interface ControlInput {
  pitch: number;    // -1..1 (Nase hoch/runter)
  roll: number;     // -1..1 (links/rechts)
  yaw: number;      // -1..1 (gieren)
  throttle: number; // -1..1 Achse (Jet: Schub±, Schiff: Fahrt±, Panzer: fahren)
  fire: boolean;    // Kanone/Flak/Granate halten
  missile: boolean; // Rakete/SAM (Einmal-Taste)
  aim: THREE.Vector3 | null; // Panzer: Zielpunkt am Fadenkreuz (Welt)
}

export interface VehicleState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

export interface MovementContext {
  terrainHeight: (x: number, z: number) => number;
  hasWater: boolean;
  waterLevel: number;
  time: number; // Weltzeit in s (für Wellen)
}

/** Gemeinsames Interface der drei Bewegungsmodelle (Strategie-Pattern). */
export interface MovementModel {
  update(dt: number, input: ControlInput, state: VehicleState, ctx: MovementContext): void;
  /** Wurde in diesem Frame Terrain berührt? (Engine löst Absturz aus) */
  crashed: boolean;
  getThrottle(): number;
  getSpeed(state: VehicleState): number;
  /** Jet: Strömungsabriss aktiv (HUD-Warnung + Buffet)? */
  stalling: boolean;
  /** Jet: Anstellwinkel (rad) für Buffet-Effekte */
  aoa: number;
}

// ----------------------------------------------------------------------------
// HUD (Engine → React, per requestAnimationFrame gepollt, GC-frei wiederverwendet)
// ----------------------------------------------------------------------------

export interface KillFeedItem {
  id: number;
  text: string;
  age: number; // s seit Eintrag
  own: boolean; // eigener Abschuss
}

export interface RadarContact {
  x: number;    // relativ zum Spieler, in Koppelnavigation (Heading = oben)
  z: number;
  kind: VehicleClass;
}

export interface HudTargetInfo {
  /** Position als Screen-Fraktion 0..1 (links oben = 0,0), visible = on-screen */
  x: number;
  y: number;
  visible: boolean;
  dist: number;      // m
  locked: boolean;   // eigener Lock
  lockProgress: number; // 0..1
}

export interface HudState {
  running: boolean;
  dead: boolean;
  respawnIn: number;
  speedKmh: number;
  altitude: number;   // m über Null (MSL)
  throttle: number;   // 0..1
  hp: number;
  maxHp: number;
  ammo: number;
  maxAmmo: number;
  missiles: number;
  maxMissiles: number;
  lockProgress: number;
  locked: boolean;
  hasTarget: boolean;
  target: HudTargetInfo | null;
  score: number;
  kills: number;
  stall: boolean;
  incoming: boolean;  // Rakete auf mich unterwegs
  killFeed: KillFeedItem[];
  message: string | null;
  radar: { contacts: RadarContact[]; range: number };
  cameraMode: 'chase' | 'cockpit';
  vehicleName: string;
  worldName: string;
  modeName: string;
}

export const MODE_NAMES: Record<GameModeId, string> = {
  free: 'Freier Flug',
  dogfight: 'Hundekampf',
  mixed: 'Gemischtes Gefecht',
};
