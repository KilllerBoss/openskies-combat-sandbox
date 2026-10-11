/**
 * GroundModel — Panzer-/Bodenfahrzeug-Physik.
 *
 * Didaktik: Panzer kleben am Boden — der Witz ist die Interaktion mit dem
 * Terrain:
 *   1. Fahrt + Lenkung wie beim Schiff (Trägheit), aber ohne Wasser-Feder
 *   2. Die Wanne wird JEDEM Frame auf die Terrainhöhe gesetzt und an die
 *      HANG-NORMALE ausgerichtet (4 Stützpunkte abtasten → Ebene fitten).
 *      So klettert der Panzer nativ über Hügel, Kuppen und Gräben.
 *   3. Der TURM zielt UNABHÄNGIG (folgt dem Kamera-Fadenkreuz) — der einzige
 *      "Kampf-Freiheitsgrad" des Panzers. Sein aktueller Blickwinkel wird
 *      hier berechnet (turretYaw/turretPitch) und vom ModelFactory-Modell
 *      für die Visualisierung abgefragt.
 */
import * as THREE from 'three';
import type { ControlInput, MovementContext, MovementModel, TankPhysicsSpec, VehicleState } from '../types';

const _fwd = new THREE.Vector3();
const _qTarget = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _xAxis = new THREE.Vector3();
const _yAxis = new THREE.Vector3();
const _zAxis = new THREE.Vector3();
const _aimLocal = new THREE.Vector3();
const _qInv = new THREE.Quaternion();

export class GroundModel implements MovementModel {
  crashed = false;
  stalling = false;
  aoa = 0;

  private speed = 0;          // m/s (negativ = rückwärts)
  private heading = 0;        // rad (Kompasskurs der Wanne)
  private headingRate = 0;    // rad/s
  /** Turm-Blickrichtung relativ zur Wanne (fürs Modell & Schussrichtung). */
  turretYaw = 0;
  turretPitch = 0;

  constructor(private readonly spec: TankPhysicsSpec) {}

  getThrottle(): number {
    // "Schub" des Panzers = Fahrt im Verhältnis zur Höchstgeschwindigkeit
    return Math.min(1, Math.abs(this.speed) / this.spec.maxSpeed);
  }

  getSpeed(): number {
    return Math.abs(this.speed);
  }

  update(dt: number, input: ControlInput, state: VehicleState, ctx: MovementContext): void {
    this.crashed = false;
    const spec = this.spec;

    // ------------------------------------------------------------------
    // 1) FAHREN — Beschleunigung, Bremsen, Rollwiderstand
    // ------------------------------------------------------------------
    // W = vorwärts (throttle +1), S = rückwärts (−1). Trägheit: speed läuft
    // mit maxAccel auf den Zielwert; ohne Eingang bremst Rollreibung (0.9/s).
    const maxAccel = spec.maxSpeed / 2.5; // 0→voll in ~2,5 s
    const target = input.throttle > 0
      ? input.throttle * spec.maxSpeed
      : input.throttle * -spec.reverseSpeed;
    if (Math.abs(target - this.speed) > 0.05) {
      const dir = Math.sign(target - this.speed);
      this.speed += dir * maxAccel * dt;
      if (Math.sign(target - this.speed) !== dir) this.speed = target;
    } else {
      this.speed += (0 - this.speed) * Math.min(1, dt * 0.9);
    }

    // ------------------------------------------------------------------
    // 2) LENKEN — Kettenwendung, geschwindigkeitsabhängig
    // ------------------------------------------------------------------
    // Steht der Panzer, dreht er auf der Stelle (Kettenwendung!). Bei Fahrt
    // skaliert die Drehrate mit |speed|/maxSpeed nach oben (fahrkurvenartig).
    const speedFactor = 0.35 + 0.65 * Math.min(1, Math.abs(this.speed) / spec.maxSpeed);
    const targetRate = -input.yaw * spec.turnRate * speedFactor
      * (this.speed < -0.1 ? -1 : 1); // rückwärts einlenken invertiert
    this.headingRate += (targetRate - this.headingRate) * Math.min(1, dt * 4);
    this.heading += this.headingRate * dt;

    // ------------------------------------------------------------------
    // 3) POSITION — horizontal integrieren
    // ------------------------------------------------------------------
    _fwd.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    state.position.addScaledVector(_fwd, this.speed * dt);

    // ------------------------------------------------------------------
    // 4) BODENABTASTUNG — Höhe + Hang-Normale aus 4 Stützpunkten
    // ------------------------------------------------------------------
    // Wir tasten vorn/hinten links/rechts (halbe Wannenlänge/-breite) ab und
    // spannen daraus die lokale Ebene. Die Normalen-Schätzung macht Steigungen
    // sichtbar weich (statt Triebergewackel bei einzelnen Grid-Zellen).
    const halfL = 2.2;
    const halfW = 1.4;
    const hFL = ctx.terrainHeight(state.position.x - _fwd.x * halfL - _fwd.z * halfW, state.position.z - _fwd.z * halfL + _fwd.x * halfW);
    const hFR = ctx.terrainHeight(state.position.x - _fwd.x * halfL + _fwd.z * halfW, state.position.z - _fwd.z * halfL - _fwd.x * halfW);
    const hBL = ctx.terrainHeight(state.position.x + _fwd.x * halfL - _fwd.z * halfW, state.position.z + _fwd.z * halfL + _fwd.x * halfW);
    const hBR = ctx.terrainHeight(state.position.x + _fwd.x * halfL + _fwd.z * halfW, state.position.z + _fwd.z * halfL - _fwd.x * halfW);
    const avgH = (hFL + hFR + hBL + hBR) / 4;
    state.position.y = avgH + 1.1; // Wanne sitzt ~1 m über dem Boden (Ketten)

    // Längs-/Querachse der Ebene → Normale über Kreuzprodukt.
    // Rechtssystem: x = rechts, z = vorwärts ⇒ up = z × x (Rechte-Hand-Regel).
    _zAxis.set(-_fwd.x * 2 * halfL, hFL + hFR - hBL - hBR, -_fwd.z * 2 * halfL).normalize(); // nach vorn
    _xAxis.set(_fwd.z * 2 * halfW, hFR + hBR - hFL - hBL, -_fwd.x * 2 * halfW).normalize();  // nach rechts
    _yAxis.crossVectors(_zAxis, _xAxis).normalize();
    if (_yAxis.y < 0) {
      // Sicherungsnetz bei extrem steilen Hangkanten: nicht kopfüber kippen
      _yAxis.negate();
      _zAxis.negate();
    }
    _m.makeBasis(_xAxis, _yAxis, _zAxis);
    _qTarget.setFromRotationMatrix(_m);
    // Weiches Anpassen (kein Snappen bei kleinen Bodenwellen)
    state.quaternion.slerp(_qTarget, Math.min(1, dt * 8));
    state.velocity.set(0, 0, 0);

    // ------------------------------------------------------------------
    // 5) TURM — folgt dem Fadenkreuz (Weltziel → Wannen-lokale Winkel)
    // ------------------------------------------------------------------
    if (input.aim) {
      _qInv.copy(state.quaternion).invert();
      _aimLocal.copy(input.aim).sub(state.position).applyQuaternion(_qInv);
      // Zielrichtung in Wannen-Koordinaten: yaw um Y, pitch um X
      const targetYaw = Math.atan2(_aimLocal.x, _aimLocal.z);
      const targetPitch = Math.atan2(_aimLocal.y, Math.hypot(_aimLocal.x, _aimLocal.z));
      // Turmdrehrate begrenzen (turretRate) — der Turm "hinkt" dem Ziel nach,
      // schnelle Vorbeiflüge kann er nicht verfolgen!
      const dy = THREE.MathUtils.euclideanModulo(targetYaw - this.turretYaw + Math.PI, Math.PI * 2) - Math.PI;
      this.turretYaw += THREE.MathUtils.clamp(dy, -spec.turretRate * dt, spec.turretRate * dt);
      this.turretPitch += THREE.MathUtils.clamp(
        THREE.MathUtils.clamp(targetPitch, -0.12, 0.55) - this.turretPitch,
        -spec.turretRate * dt, spec.turretRate * dt,
      );
    }
  }

  /** Respawn: stehen bleiben, Turm geradeaus. */
  reset(): void {
    this.speed = 0;
    this.headingRate = 0;
    this.turretYaw = 0;
    this.turretPitch = 0;
  }
}
