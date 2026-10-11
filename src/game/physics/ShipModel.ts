/**
 * ShipModel — vereinfachte Schiffsphysik.
 *
 * Didaktik: Ein Schiff ist KEIN Flugzeug — die entscheidenden Unterschiede:
 *   1. Es kann nur um die Hochachse gieren (kein Rollen/Nicken als Steuerung)
 *   2. Der Rumpf schwimmt: eine Auftriebs-FEDER zieht ihn zur Wasserlinie
 *      zurück (taucht er ein, drückt ihn mehr Verdrängung hoch — hier als
 *      gedämpfte Feder modelliert, das berühmte "bobbing")
 *   3. Massenträgheit: Schub spult über mehrere Sekunden auf (Guardian:
 *      5 s von 0 auf voll), die Dreh rate hinkt dem Ruder hinterher.
 *   4. Rollen/Nicken sind KOSMETIK aus dem Wellengang (+ Kurvenkrängung),
 *      keine Freiheitsgrade der Steuerung.
 */
import * as THREE from 'three';
import type { ControlInput, MovementContext, MovementModel, ShipPhysicsSpec, VehicleState } from '../types';

const _euler = new THREE.Euler();
const _fwd = new THREE.Vector3();

export class ShipModel implements MovementModel {
  crashed = false;
  stalling = false;
  aoa = 0;

  /** Aktueller Schub (0..1) — läuft dem Ziel mit 1/accelTime nach. */
  private throttle = 0.3;
  /** Aktuelle Fahrt (m/s). */
  private speed = 0;
  /** Aktuelle Gierrate (rad/s) — nähert sich dem Ruder-Befehl träge. */
  private headingRate = 0;
  /** Kompasskurs (rad) — akkumuliert die Gierrate. */
  private heading = 0;
  /** Wellenphase für kosmetisches Rollen/Nicken. */
  private wavePhase = Math.random() * Math.PI * 2;

  constructor(private readonly spec: ShipPhysicsSpec) {}

  getThrottle(): number {
    return this.throttle;
  }

  getSpeed(): number {
    return this.speed;
  }

  update(dt: number, input: ControlInput, state: VehicleState, ctx: MovementContext): void {
    this.crashed = false;
    this.wavePhase += dt * 0.6;

    // ------------------------------------------------------------------
    // 1) SCHUB — träge Aufspulung (accelTime von 0 auf voll)
    // ------------------------------------------------------------------
    // W/S setzt die ZIEL-Stellung; der Ist-Wert folgt mit einer Rate von
    // 1/accelTime pro Sekunde. Ein Zerstörer mit 5 s Spulzeit "läuft an",
    // ein Schnellboot reagiert schneller — der Wert steckt im Spec.
    const rate = 1 / this.spec.accelTime;
    this.throttle = THREE.MathUtils.clamp(this.throttle + input.throttle * rate * dt, 0, 1);

    // ------------------------------------------------------------------
    // 2) FAHRT — Antriebskraft gegen quadratischen Wasserwiderstand
    // ------------------------------------------------------------------
    // v' = a·throttle − c·v²  → Gleichgewicht bei maxSpeed. Wir setzen
    // c so, dass a·1 = c·maxSpeed² gilt (dann ist v_max = maxSpeed).
    const accel = 6 * this.throttle; // m/s² Antrieb (skaliert mit Schub)
    const dragC = accel / (this.spec.maxSpeed * this.spec.maxSpeed || 1);
    this.speed += (accel - dragC * this.speed * this.speed) * dt;
    this.speed = Math.max(0, this.speed);

    // ------------------------------------------------------------------
    // 3) RUDER — Gierrate mit Trägheit (kein instantanes Drehen!)
    // ------------------------------------------------------------------
    // headingRate strebt auf rudder·turnRate; die Annäherung ist exponentiell
    // geglättet (Lerp mit Faktor min(1, dt·k)) → sprunghaftes Ruder erzeugt
    // ein "Setzen" des Bugs, kein Zappen.
    const targetRate = input.yaw * this.spec.turnRate;
    this.headingRate += (targetRate - this.headingRate) * Math.min(1, dt * 1.4);
    this.heading += this.headingRate * dt; // Kompasskurs akkumulieren

    // ------------------------------------------------------------------
    // 4) POSITION — horizontal integrieren, dann aufschwimmen lassen
    // ------------------------------------------------------------------
    _fwd.set(0, 0, 1).applyQuaternion(state.quaternion);
    _fwd.y = 0;
    _fwd.normalize();
    state.position.addScaledVector(_fwd, this.speed * dt);

    // ------------------------------------------------------------------
    // 5) AUFTRIEBS-FEDER an der Wasserlinie + Wellen-Bobbing
    // ------------------------------------------------------------------
    // y'' = −k·(y − y_target) − d·y'  (gedämpfter harmonischer Oszillator)
    // Das erzeugt das typische "Auftauchen" nach Wellental und das sanfte
    // Einsinken im Wellenberg — plus Wellenbobbing über der Phase.
    const wave = Math.sin(this.wavePhase) * 0.55 + Math.sin(this.wavePhase * 1.7 + 1) * 0.25;
    // In Welten ohne Wasser (Wüste) "schwebt" das Schiff knapp über Grund
    // (Sand statt Kielwasser — die Partikel regelt die Engine).
    const ground = ctx.terrainHeight(state.position.x, state.position.z);
    const yTarget = ctx.hasWater ? ctx.waterLevel + wave : ground + 1.2;

    // Feder-Dämpfung direkt auf die Y-Geschwindigkeit (semi-implizit weiter
    // integriert unten — konsistent mit dem FlightModel-Stil)
    state.velocity.y += (-14 * (state.position.y - yTarget) - 5.5 * state.velocity.y) * dt;
    state.position.y += state.velocity.y * dt;
    // Horizontale Drift unterbinden (Schiff = kein Drifter)
    state.velocity.x = 0;
    state.velocity.z = 0;

    // ------------------------------------------------------------------
    // 6) KOSMETIK — Rollen/Nicken aus Wellen + Kurvenkrängung
    // ------------------------------------------------------------------
    // WICHTIG: Das Gesamt-Quaternion wird JEDEM Frame NEU aus Kurs +
    // Kosmetik-Winkeln komponiert (keine Akkumulation — sonst würde das
    // Schiff nach Minuten immer schräfer liegen!).
    //
    // Krängung: Drehrate · Faktor → lehnt sich AUS der Kurve (real lehnt
    // sich ein Schiff nach AUßEN, weil die Zentrifugalkraft außen wirkt).
    const heel = -this.headingRate * 2.4 + Math.sin(this.wavePhase * 0.9) * 0.02;
    const pitch = Math.sin(this.wavePhase * 0.7 + 0.8) * 0.018
      + (this.speed / this.spec.maxSpeed) * 0.012; // leicht bug-unter-Wasser bei Fahrt

    _euler.set(pitch, this.heading, heel, 'YXZ'); // Gieren → Nicken → Rollen
    state.quaternion.setFromEuler(_euler);

    // Grundberührung (Wüste: auf Sand aufgelaufen) → kein Crash, nur Stop
    if (!ctx.hasWater && state.position.y <= ground) {
      this.speed *= 0.4; // auf Grund abgebremst
    }
  }

  /** Respawn: Fahrt & Ruder neutral, Wellenphase neu würfeln. */
  reset(): void {
    this.throttle = 0.3;
    this.speed = 0;
    this.headingRate = 0;
    this.wavePhase = Math.random() * Math.PI * 2;
  }
}
