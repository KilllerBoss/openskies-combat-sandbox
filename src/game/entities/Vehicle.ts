/**
 * Vehicle — ein Fahrbares Ding (Jet, Schiff oder Panzer).
 *
 * Zusammenspiel der Bausteine (Strategie-Pattern):
 *   Vehicle  = Daten (Spec) + Zustand (State) + Movement-Modell + Waffen
 *   Wer steuert? Mensch (InputManager) oder KI (AIPilot) — beides erzeugt
 *   ein und denselben ControlInput-Datensatz. Die Physik MERKT NICHT, wer
 *   lenkt. Genau deshalb funktioniert Multiplayer später fast gratis:
 *   die Eingaben müssen nur noch übers Netz statt von der Tastatur kommen.
 */
import * as THREE from 'three';
import type { ControlInput, MovementContext, MovementModel, VehicleSpec, VehicleState } from '../types';
import { FlightModel } from '../physics/FlightModel';
import { ShipModel } from '../physics/ShipModel';
import { GroundModel } from '../physics/GroundModel';
import { WeaponSystem } from '../combat/WeaponSystem';
import type { AIPilot } from '../ai/AIPilot';
import type { VehicleVisual } from '../render/ModelFactory';

/** Trefferkugel-Radius je Klasse (für Projektilkollision). */
const HIT_RADIUS: Record<string, number> = { jet: 9, ship: 34, tank: 7 };

export class Vehicle {
  readonly state: VehicleState = {
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
  };
  readonly movement: MovementModel;
  readonly weapons: WeaponSystem;
  readonly hitRadius: number;

  visual: VehicleVisual | null = null;
  ai: AIPilot | null = null;
  /** Zuletzt berechnete KI- oder Spielerbefehle (Waffensystem liest sie). */
  lastInput: ControlInput | null = null;
  /** Engine-Buchführung: Abschuss schon für Respawn eingeplant? */
  respawnMark = false;

  hp: number;
  alive = true;
  /** KI-Trigger: eine Rakete ist auf mich unterwegs (Engine setzt das). */
  threatened = false;
  /** Panzer: Zielpunkt der Turmwaffe (Engine setzt ihn aus dem Fadenkreuz). */
  turretAim: THREE.Vector3 | null = null;

  constructor(readonly spec: VehicleSpec, readonly isPlayer: boolean) {
    switch (spec.vehicleClass) {
      case 'jet': this.movement = new FlightModel(spec.physics as import('../types').JetPhysicsSpec); break;
      case 'ship': this.movement = new ShipModel(spec.physics as import('../types').ShipPhysicsSpec); break;
      case 'tank': this.movement = new GroundModel(spec.physics as import('../types').TankPhysicsSpec); break;
    }
    this.hp = spec.hp;
    this.hitRadius = HIT_RADIUS[spec.vehicleClass] ?? 8;
    this.weapons = new WeaponSystem(this, spec);
  }

  // --- Bequeme Zugriffshüllen (weniger Tipparbeit im Engine-Code) ---
  get pos(): THREE.Vector3 { return this.state.position; }
  get vel(): THREE.Vector3 { return this.state.velocity; }
  get speed(): number { return this.movement.getSpeed(this.state); }
  get throttle(): number { return this.movement.getThrottle(); }
  get stalling(): boolean { return this.movement.stalling; }

  /** Buffet-Stärke (nur Jets) — für Kamerazittern. */
  get buffet(): number {
    return this.movement instanceof FlightModel ? this.movement.buffet : 0;
  }

  /** Turmwinkel (nur Panzer) — fürs Modell. */
  get turretYaw(): number {
    return this.movement instanceof GroundModel ? this.movement.turretYaw : 0;
  }
  get turretPitch(): number {
    return this.movement instanceof GroundModel ? this.movement.turretPitch : 0;
  }

  /** Physikschritt: Steuerbefehl anwenden. Gibt true zurück bei Bodenkontakt-Crash. */
  fixedUpdate(dt: number, input: ControlInput, ctx: MovementContext): boolean {
    this.movement.update(dt, input, this.state, ctx);
    return this.movement.crashed;
  }

  /** Render-Frame: Visual mit dem Physikzustand synchronisieren. */
  syncVisual(time: number): void {
    const v = this.visual;
    if (!v) return;
    v.group.position.copy(this.state.position);
    v.group.quaternion.copy(this.state.quaternion);
    v.update({
      throttle: this.throttle,
      time,
      turretYaw: this.turretYaw,
      turretPitch: this.turretPitch,
    });
  }

  /** Respawn (Engine): Zustand zurücksetzen. */
  respawn(pos: THREE.Vector3, heading: number): void {
    this.state.position.copy(pos);
    this.state.velocity.set(0, 0, pos.y > 60 ? 160 : 0); // Jets starten mit Fahrt
    this.state.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading);
    this.hp = this.spec.hp;
    this.alive = true;
    this.threatened = false;
    this.weapons.ammo = this.spec.cannon.ammo;
    this.weapons.missilesLeft = this.spec.missiles?.count ?? 0;
    this.weapons.lockTarget = null;
    this.weapons.lockProgress = 0;
    this.weapons.locked = false;
    if (this.movement instanceof FlightModel) this.movement.reset();
    if (this.movement instanceof ShipModel) this.movement.reset();
    if (this.movement instanceof GroundModel) this.movement.reset();
  }
}
