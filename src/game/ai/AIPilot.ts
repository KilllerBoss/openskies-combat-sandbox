/**
 * AIPilot — die Gegner-Gehirne.
 *
 * Jets fliegen eine klassische Zustandsmaschine:
 *   PATROL → ENGAGE → (FIRE ⊂ ENGAGE) → EVADE → ENGAGE → …
 *
 * Steuerung: Ein KI-Pilot erzeugt — wie ein Mensch — einen ControlInput.
 * Die "Kunst" ist nur die Übersetzung "wo will ich hin" → "welche Achsen
 * wie stark ziehen". Für Jets gilt die uralte Dogfight-Grundregel:
 *   1. ROLLE das Ziel auf die Hochachse (lokal +Y)
 *   2. DANN ziehe hoch (Pitch), um es zu erreichen
 * Denn ein Flugzeug dreht in der Ebene seiner TRAGFLÄCHEN — Kurvenflug
 * beginnt immer mit dem Rollen. Genau wie beim Spieler.
 */
import * as THREE from 'three';
import type { ControlInput, MovementContext } from '../types';
import type { Vehicle } from '../entities/Vehicle';

const _local = new THREE.Vector3();
const _goal = new THREE.Vector3();
const _qInv = new THREE.Quaternion();

type AiState = 'patrol' | 'engage' | 'evade';

export interface AIWorld {
  player: Vehicle;
  ctx: MovementContext;
}

export class AIPilot {
  state: AiState = 'patrol';
  private stateT = 0;
  private evadeDir = 1;
  private evadeTurnT = 0;
  private patrolAngle: number;
  private fireDuty = 0;      // Kanonen-Feuerdisziplin (Burst/Pause)
  private missileCd = 4 + Math.random() * 6;

  constructor(private readonly self: Vehicle) {
    this.patrolAngle = Math.random() * Math.PI * 2;
  }

  /** Physikschritt → Steuerbefehle für dieses Fahrzeug. */
  update(dt: number, world: AIWorld): ControlInput {
    this.stateT += dt;
    this.missileCd -= dt;

    switch (this.self.spec.vehicleClass) {
      case 'jet': return this.updateJet(dt, world);
      case 'ship': return this.updateShip(dt, world);
      case 'tank': return this.updateTank(world);
    }
  }

  // ----------------------------------------------------------------- Jets ---
  private updateJet(dt: number, world: AIWorld): ControlInput {
    const player = world.player;

    // Zustandsübergänge
    if (this.state !== 'evade' && (this.self.threatened || (this.self.hp < this.self.spec.hp * 0.3 && player.alive))) {
      this.state = 'evade';
      this.stateT = 0;
      this.evadeDir = Math.random() < 0.5 ? -1 : 1;
    }
    if (this.state === 'evade' && this.stateT > 4.5 && !this.self.threatened) {
      this.state = 'engage';
      this.stateT = 0;
    }

    if (!player.alive) this.state = 'patrol';
    if (this.state === 'patrol' && player.alive && this.stateT > 1 && this.self.pos.distanceTo(player.pos) < 2800) {
      this.state = 'engage';
      this.stateT = 0;
    }

    const input: ControlInput = { pitch: 0, roll: 0, yaw: 0, throttle: 0, fire: false, missile: false, aim: null };

    if (this.state === 'evade') {
      // Break-Turn mit Richtungswechsel — harte Kurve + gelegentliche Fassrolle
      this.evadeTurnT -= dt;
      if (this.evadeTurnT <= 0) {
        this.evadeTurnT = 1.1 + Math.random() * 0.8;
        this.evadeDir *= -1;
      }
      input.roll = this.evadeDir;
      input.pitch = 0.85;
      input.throttle = 1;
      return input;
    }

    if (this.state === 'patrol') {
      // Kreisen um die Weltmitte auf sicherer Höhe
      this.patrolAngle += dt * 0.12;
      const R = 900 + (this.self.spec.name.length % 3) * 350;
      _goal.set(Math.cos(this.patrolAngle) * R, 420, Math.sin(this.patrolAngle) * R);
      this.steerToward(_goal, input, world.ctx);
      input.throttle = 0.5;
      return input;
    }

    // --- ENGAGE: Vorhalt-Punkt ansteuern (lead pursuit) ---
    // Vorhalt = Zielposition + Fahrt · Annäherungszeit — wer AUF das Ziel
    // fliegt statt auf den Vorhalt, jagt ihm ewig hinterher.
    const dist = this.self.pos.distanceTo(player.pos);
    const closing = 320; // angenommene Annäherung (grob, reicht)
    const t = Math.min(dist / closing, 4);
    _goal.copy(player.pos).addScaledVector(player.vel, t * 0.8);

    this.steerToward(_goal, input, world.ctx);
    input.throttle = 1;

    // Feuerdisziplin: Bursts (0,7 s an, 0,6 s aus) — wie echte Bordkanonen
    this.fireDuty += dt;
    const phase = this.fireDuty % 1.3;
    input.fire = phase < 0.7 && dist < 950 && this.angleTo(player.pos) < 0.24;

    // Rakete, wenn mittlere Distanz + Winkel passt + Cooldown fertig
    input.missile = dist > 700 && dist < 2500 && this.angleTo(player.pos) < 0.18 && this.missileCd <= 0;
    if (input.missile) this.missileCd = 9 + Math.random() * 8;

    return input;
  }

  /**
   * Kernstück: Weltziel → Achsen.
   *  1. Ziel in das lokale System des Jets rechnen
   *  2. roll: Ziel rechts (local.x>0) → nach rechts rollen
   *  3. pitch: erst ziehen, wenn das Ziel "oben" ist (|local.x| klein)
   */
  private steerToward(goal: THREE.Vector3, input: ControlInput, ctx: MovementContext): void {
    _qInv.copy(this.self.state.quaternion).invert();
    _local.subVectors(goal, this.self.pos).applyQuaternion(_qInv);

    // Bodennähe-Schutz: unter 170 m über Grund immer hochziehen — die KI
    // "weiß" um den Boden, noch bevor der Pilotenschmerz einsetzt.
    const ground = ctx.terrainHeight(this.self.pos.x, this.self.pos.z);
    const agl = this.self.pos.y - ground;
    if (agl < 170) {
      input.pitch = 1;
      input.roll *= 0.3;
      if (_local.y < -0.2) input.roll = 0; // nicht in den Boden rollen
      return;
    }

    input.roll = THREE.MathUtils.clamp(_local.x * 2.6, -1, 1);
    const aligned = Math.abs(_local.x) < 0.45; // Ziel grob auf der Hochachse?
    input.pitch = aligned
      ? THREE.MathUtils.clamp(_local.y * 2.2, -0.7, 1)
      : THREE.MathUtils.clamp(_local.y * 0.4, -0.3, 0.4); // nur leicht ziehen
    input.yaw = THREE.MathUtils.clamp(_local.x * 0.25, -0.4, 0.4) * (aligned ? 1 : 0.3);
  }

  /** Winkel zwischen Nase und Weltpunkt (rad). */
  private angleTo(worldPos: THREE.Vector3): number {
    _local.subVectors(worldPos, this.self.pos).normalize();
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.self.state.quaternion);
    return Math.acos(THREE.MathUtils.clamp(_local.dot(fwd), -1, 1));
  }

  // ------------------------------------------------------------- Schiffe ---
  private updateShip(_dt: number, world: AIWorld): ControlInput {
    // Schiffe kurven leicht und geben Gas; das Feuern übernimmt WeaponSystem
    // (Flak/SAM zielen automatisch). Leichte Zickzackfahrt als Profil.
    const t = world.ctx.time;
    return {
      pitch: 0, roll: 0,
      yaw: Math.sin(t * 0.15 + this.patrolAngle) * 0.4,
      throttle: 1, fire: false, missile: false, aim: null,
    };
  }

  // -------------------------------------------------------------- Panzer ---
  private updateTank(world: AIWorld): ControlInput {
    const player = world.player;
    // Turm aufs Ziel: Vorhalt über geschätzte Flugzeit
    const dist = this.self.pos.distanceTo(player.pos);
    const t = dist / 170;
    this.self.turretAim = _goal.copy(player.pos).addScaledVector(player.vel, t * 0.9).clone();
    // Fahren: nur leicht herumdrehen, damit das Schussfeld wechselt
    return {
      pitch: 0, roll: 0,
      yaw: Math.sin(world.ctx.time * 0.08 + this.patrolAngle) * 0.5,
      throttle: 0.25, fire: player.alive && player.pos.y - world.ctx.terrainHeight(player.pos.x, player.pos.z) < 420 && dist < 1500,
      missile: false,
      aim: this.self.turretAim,
    };
  }
}
