/**
 * ============================================================================
 *  FlightModel — DAS HERZSTÜCK DES LERNPROJEKTS
 * ============================================================================
 *  Vereinfachtes, aber physikalisch ehrliches 6-DOF-Flugmodell.
 *
 *  WARUM "semi-implizites Euler"?
 *    Explizites Euler (erst Kräfte → dann Position) schwingt bei Federn auf.
 *    Semi-implizit (Geschwindigkeit ZUERST updaten, Position mit der NEUEN
 *    Geschwindigkeit) ist bedingt stabil — Standard in Spielen, kaum teurer.
 *
 *  Alle Kräfte wirken im Weltkoordinatensystem, berechnet aber aus
 *  strömungsmechanischen Beziehungen im lokalen (flugzeugfesten) System.
 *
 *  Konventionen des Rumpf-Koordinatensystems (three.js):
 *      +Z = Nase (forward)   ·  +Y = Bauch nach oben (up)  ·  +X = rechter Flügel
 *
 *  Formeln (mit Quelle/Intuition je Kommentar):
 *      Staudruck     q = ½·ρ·v²          (Fahrtwind-"Druckkraft" pro Fläche)
 *      Auftrieb      L = q·S·CL(α)       senkrecht zum Fahrtwind
 *      Widerstand    D = q·S·(CD0+k·CL²) entgegen dem Fahrtwind
 *      Schub         T = throttle·T_max  entlang der Nase
 *      Gravitation   g = 9,81 m/s²       nach unten (−Y)
 * ============================================================================
 */
import * as THREE from 'three';
import type { ControlInput, JetPhysicsSpec, MovementContext, MovementModel, VehicleState } from '../types';

// Luftdichte auf Meereshöhe (vereinfachte ISA-Standardatmosphäre, konstant).
// Realistisch fällt sie mit der Höhe — für die Spielwelt reicht der konstante
// Wert: er hält die Formeln lesbar, den Jet aber spürbar "luftig".
const RHO = 1.225; // kg/m³

// Referenz-Staudruck für die Steuerwirksamkeit. Liegt die Fahrt darunter,
// greifen die Ruder ins "Leere" (controlAuthority < 1).
const Q_REF = 0.5 * RHO * 120 * 120; // ~ bei 120 m/s (432 km/h) volle Kontrolle

// Hilfsvektoren (wiederverwendet — KEINE Allokation im 60-Hz-Loop, GC-Pause!)
const _f = new THREE.Vector3();
const _up = new THREE.Vector3();
const _right = new THREE.Vector3();
const _vLocal = new THREE.Vector3();
const _vHat = new THREE.Vector3();
const _force = new THREE.Vector3();
const _liftDir = new THREE.Vector3();
const _qInv = new THREE.Quaternion();
const _dq = new THREE.Quaternion();
const _euler = new THREE.Euler();

export class FlightModel implements MovementModel {
  crashed = false;
  stalling = false;
  aoa = 0;

  /** Schubhebel-Stellung 0..1 (wird per Taste integriert, ~0,45/s). */
  private throttle = 0.75;

  // Buffet-Zittern (Strömungsabriss) — exportiert für Kamerawackeln
  buffet = 0;

  constructor(private readonly spec: JetPhysicsSpec) {}

  getThrottle(): number {
    return this.throttle;
  }

  getSpeed(state: VehicleState): number {
    return state.velocity.length();
  }

  /**
   * Ein Physikschritt mit festem dt (1/60 s, vom Akkumulator der Engine
   * garantiert — deshalb ist das Verhalten framerate-unabhängig!).
   */
  update(dt: number, input: ControlInput, state: VehicleState, ctx: MovementContext): void {
    const spec = this.spec;
    this.crashed = false;

    // ------------------------------------------------------------------
    // 1) SCHUB — Schubhebel per Tastendruck integrieren
    // ------------------------------------------------------------------
    // Der Schubhebel ist eine "Flugzeug-Eigenschaft" (bleibt stehen), kein
    // Impuls: Deshalb integrales Verhalten (±0,45 pro Sekunde), kein Direkt-
    // setzen. Shift/[ erhöht, Strg/] senkt — analog einem echten Schubregler.
    this.throttle = THREE.MathUtils.clamp(this.throttle + input.throttle * 0.45 * dt, 0, 1);

    // ------------------------------------------------------------------
    // 2) FAHRT & STAUDRUCK
    // ------------------------------------------------------------------
    const speed = state.velocity.length();
    // Staudruck q = ½·ρ·v² — die zentrale Kennzahl der Aero: ALLE Luftkräfte
    // skalieren mit q. Doppelte Geschwindigkeit = vierfacher Auftrieb!
    const q = 0.5 * RHO * speed * speed;

    // Lokale Achsen aus der Lage-Quaternion holen
    _f.set(0, 0, 1).applyQuaternion(state.quaternion);   // Nase
    _up.set(0, 1, 0).applyQuaternion(state.quaternion);  // "oben" des Jets
    _right.set(1, 0, 0).applyQuaternion(state.quaternion); // rechter Flügel

    // ------------------------------------------------------------------
    // 3) ANSTELLWINKEL (Angle of Attack, AoA)
    // ------------------------------------------------------------------
    // AoA = Winkel zwischen Geschwindigkeit und Nase IN DER SYMMETRIEEBENE
    // (der Ebene aus Nase + Kiel — dort entsteht der Auftrieb).
    // Wir rechnen den Geschwindigkeitsvektor ins lokale System:
    // vLocal.y < 0 heißt "Fahrt kommt von unten" → positives α.
    _qInv.copy(state.quaternion).invert();
    _vLocal.copy(state.velocity).applyQuaternion(_qInv);

    // atan2(-vLocal.y, vLocal.z): Nase über Fahrt → positives α.
    // Schiebewinkel β (seitliche Anströmung) folgt unten in Abschnitt 5d.
    this.aoa = speed > 1
      ? Math.atan2(-_vLocal.y, Math.max(0.1, _vLocal.z))
      : 0;

    // ------------------------------------------------------------------
    // 4) AUFTRIEBSBEIWERT CL(α) — mit Strömungsabriss!
    // ------------------------------------------------------------------
    // Linearer Bereich: CL = CLα · α (gerade Steigung, klassische dünne
    // Profile). Oberhalb des Abrisswinkels (StallAngle) reißt die Strömung
    // ab: CL BRICHT EIN (hier: fällt auf ~35 % ab). Physikalische Folge im
    // Spiel: Lift kollabiert → Nase sinkt → Buffet-Zittern → Absturzgefahr.
    const aoa = this.aoa;
    const absAoa = Math.abs(aoa);
    let cl: number;
    if (absAoa < spec.stallAngle) {
      cl = spec.clSlope * aoa;                       // linearer Bereich
      this.stalling = false;
      this.buffet = 0;
    } else {
      // Nach dem Abriss: Restauftrieb (turbulent) + einbrechende Kurve
      const over = absAoa - spec.stallAngle;         // Grad "über Stall"
      const collapse = Math.max(0.35, 1 - over * 2.2);
      cl = Math.sign(aoa) * spec.clSlope * spec.stallAngle * collapse;
      this.stalling = true;
      // Buffet: Struktur-Brummen kurz vor/im Stall (skaliert mit Überschreitung)
      this.buffet = Math.min(1, over * 3 + 0.3);
    }

    // ------------------------------------------------------------------
    // 5) KRÄFTE AUFSUMMIEREN (in _force, Weltkoordinaten)
    // ------------------------------------------------------------------
    _force.set(0, 0, 0);

    // (a) SCHUB entlang der Nase. Ohne Schubvektorsteuerung: T ∝ throttle.
    //     Nachbrenner-Gefühl entsteht durch die Kombination mit geringem CD0.
    const thrust = this.throttle * spec.maxThrust;
    _force.addScaledVector(_f, thrust);

    // (b) AUFTRIEB — senkrecht zum Fahrtwind, in der Symmetrieebene.
    //     Richtung: (v̂ × rechte Achse) — bei Geradeausflug zeigt das
    //     exakt nach "oben" (lokal +Y). Bei gedrehter Fluglage dreht der
    //     Auftrieb MIT dem Flugzeug mit → Kurvenflug entsteht durch Rollen!
    if (speed > 1) {
      _vHat.copy(state.velocity).normalize();
      _liftDir.copy(_vHat).cross(_right).normalize();
      const lift = q * spec.wingArea * cl;   // L = q·S·CL
      _force.addScaledVector(_liftDir, lift);

      // (c) WIDERSTAND — parasitär + induziert.
      //     CD = CD0 + k·CL². Der induzierte Anteil wächst QUADRATISCH mit
      //     dem Auftrieb: hart ziehen → mehr Auftrieb → viel mehr Widerstand
      //     → Energieverlust im Kurvenkampf. GENAU das macht Dogfights aus.
      const cd = spec.cd0 + spec.inducedK * cl * cl;
      const drag = q * spec.wingArea * cd;   // D = q·S·CD
      _force.addScaledVector(_vHat, -drag);

      // (d) SEITENKRAFT — Rumpf/Seitenflosse dämpfen seitliche Anströmung.
      //     Ohne diesen Term würde der Jet wie auf Eis um die Z-Achse driften.
      const beta = Math.atan2(_vLocal.x, Math.max(0.1, _vLocal.z));
      const sideForce = -q * spec.wingArea * 1.2 * beta; // grob: CY ≈ −1.2·β
      _force.addScaledVector(_right, sideForce);
    }

    // (e) GRAVITATION — immer da, unabhängig von Lage & Fahrt. 9,81 m/s².
    _force.y -= 9.81 * spec.mass;

    // ------------------------------------------------------------------
    // 6) LAGEREGLERUNG (Rotationsdynamik)
    // ------------------------------------------------------------------
    // Eingaben sind WUNSCH-Winkelraten (rad/s) — ein vereinfachtes
    // Fly-by-Wire: das "Modell" streckt die Steuerrate auf den Zielwert.
    //     controlAuthority = clamp(q/qRef, 0.15, 1)
    // Bedeutet: bei langsamer Fahrt (kleines q) werden die Ruder "teigig"
    // (mindestens 15 % wirken immer — sonst wäre Landung unmöglich), oberhalb
    // der Referenzgeschwindigkeit volle Autorität. Realistische Folge: Im
    // Langsamflug kann man dem Gegner NICHT mehr ausweichen!
    const controlAuthority = THREE.MathUtils.clamp(q / Q_REF, 0.15, 1);

    const pitchRate = input.pitch * spec.maxPitchRate * controlAuthority;
    const rollRate = input.roll * spec.maxRollRate * controlAuthority;
    const yawRate = input.yaw * spec.maxYawRate * controlAuthority;

    // Buffet-Zittern: zufälliges (deterministisch gesehen egal) Kleinst-
    // moment in allen Achsen — der Rumpf "schüttelt" im Stall.
    const shake = this.buffet * 0.06;

    // Rotation um LOKALE Achsen: dq wird rechtsseitig multipliziert
    // (q_neu = q · dq ⇒ dq ist im körperfesten System definiert).
    // Vorzeichen (Rechte-Hand-Regel, +Z = Nase):
    //   Pitch +X-Rotation senkt die Nase → W (hoch) braucht NEGATIVES θx
    //   Roll  +Z-Rotation hebt den rechten Flügel → Rollen nach RECHTS (D)
    //   yaw   +Y-Rotation schwenkt Nase nach rechts → E = positiv
    _euler.set(
      (-pitchRate + (Math.random() - 0.5) * shake) * dt,
      (yawRate + (Math.random() - 0.5) * shake) * dt,
      (-rollRate + (Math.random() - 0.5) * shake) * dt,
      'ZYX',
    );
    _dq.setFromEuler(_euler);
    state.quaternion.multiply(_dq).normalize(); // normalisieren: Drift-Killer

    // Stall-Abknicken: Die Strömung reißt unsymmetrisch ab → die Nase
    // "fällt" Richtung Fahrt (negatives Nickmoment). Wir modellieren das
    // als sanftes Zusatzmoment statt komplexer Nickmomenten-Kurve —
    // spielbar UND lehrreich (Stall beenden = Fahrt aufnehmen, Nase runter).
    if (this.stalling) {
      _euler.set(-0.35 * this.buffet * dt, 0, 0, 'ZYX');
      _dq.setFromEuler(_euler);
      state.quaternion.multiply(_dq).normalize();
    }

    // ------------------------------------------------------------------
    // 7) INTEGRATION — semi-implizites Euler
    // ------------------------------------------------------------------
    // a = F/m (newtonsche Grundgleichung, umgestellt)
    state.velocity.addScaledVector(_force, dt / spec.mass);
    // Position mit der NEUEN Geschwindigkeit → semi-implizit (stabil!)
    state.position.addScaledVector(state.velocity, dt);

    // ------------------------------------------------------------------
    // 8) BODEN-/WASSERKOLLISION → Crash
    // ------------------------------------------------------------------
    const ground = ctx.terrainHeight(state.position.x, state.position.z);
    const surface = ctx.hasWater ? Math.max(ground, ctx.waterLevel) : ground;
    if (state.position.y <= surface + 2.5) {
      this.crashed = true; // Engine übernimmt: Explosion + Respawn
    }
  }

  /** Respawn: inneren Zustand zurücksetzen (Schubhebel auf Startwert). */
  reset(): void {
    this.throttle = 0.75;
    this.crashed = false;
    this.stalling = false;
    this.aoa = 0;
    this.buffet = 0;
  }
}
