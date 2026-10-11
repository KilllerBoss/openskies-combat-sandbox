/**
 * InputManager — Tastatur-Zustand + klassenspezifische Bindings.
 *
 * Design: rohe keydown/keyup-Events → Set gehaltener Codes. Ein Edge-Set
 * (consumePress) für Einmaltasten (Rakete F, Kamera C). poll() übersetzt
 * je nach Fahrzeugklasse in ein ControlInput-Objekt.
 *
 * Wichtig: Shift = Schub hoch, Strg = Schub runter, zusätzlich [ und ] als
 * Alternative (Strg+W ist browser-reserviert → Tab schließt sich!). Wir
 * preventDefault() alle Spieltasten, sofern kein Meta/Alt im Spiel ist.
 */
import type { ControlInput, VehicleClass } from '../types';

const GAME_CODES = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE',
  'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight',
  'BracketLeft', 'BracketRight', 'Space', 'KeyF', 'KeyC', 'KeyY', 'KeyX',
]);

export class InputManager {
  private keys = new Set<string>();
  private edges = new Set<string>();
  private attached = false;
  private enabled = false;

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.enabled) return;
    // Eingabefelder (Menü-Suchfeld etc.) nicht abfangen
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    if (e.metaKey || e.altKey) return;
    if (GAME_CODES.has(e.code)) e.preventDefault();
    if (!e.repeat) this.edges.add(e.code);
    this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onBlur = () => {
    this.keys.clear(); // Fokus-Verlust → alle Tasten loslassen (kein "klebendes" W)
  };

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener('keydown', this.onKeyDown, { capture: true });
    window.addEventListener('keyup', this.onKeyUp, { capture: true });
    window.addEventListener('blur', this.onBlur);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener('keydown', this.onKeyDown, { capture: true } as EventListenerOptions);
    window.removeEventListener('keyup', this.onKeyUp, { capture: true } as EventListenerOptions);
    window.removeEventListener('blur', this.onBlur);
    this.keys.clear();
    this.edges.clear();
  }

  /** Aktiviert/deaktiviert die Spieltasten (Pause ↔ Menü). */
  setActive(active: boolean): void {
    this.enabled = active;
    if (!active) {
      this.keys.clear();
      this.edges.clear();
    }
  }

  /** Einmaltaste abfragen & zurücksetzen (true genau im Frame des Drucks). */
  consumePress(code: string): boolean {
    if (this.edges.has(code)) {
      this.edges.delete(code);
      return true;
    }
    return false;
  }

  private axis(neg: string, pos: string): number {
    return (this.keys.has(pos) ? 1 : 0) - (this.keys.has(neg) ? 1 : 0);
  }

  private throttleAxis(): number {
    // Schub hoch: Shift ODER [  ·  Schub runter: Strg ODER ]
    const up = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.keys.has('BracketLeft');
    const down = this.keys.has('ControlLeft') || this.keys.has('ControlRight') || this.keys.has('BracketRight');
    return (up ? 1 : 0) - (down ? 1 : 0);
  }

  /** Übersetzt gehaltene Tasten in Steuerbefehle für die Fahrzeugklasse. */
  poll(vehicleClass: VehicleClass): ControlInput {
    const fire = this.keys.has('Space');
    const missile = this.consumePress('KeyF');
    switch (vehicleClass) {
      case 'jet':
        return {
          pitch: this.axis('KeyS', 'KeyW'),   // W = Nase hoch
          roll: this.axis('KeyD', 'KeyA'),    // A = Rollen links
          yaw: this.axis('KeyQ', 'KeyE'),     // E = Gieren nach rechts
          throttle: this.throttleAxis(),
          fire, missile, aim: null,
        };
      case 'ship':
        return {
          pitch: 0,
          roll: 0,
          yaw: this.axis('KeyA', 'KeyD'),     // Ruder
          throttle: this.axis('KeyS', 'KeyW'), // Fahrt erhöhen/verringern
          fire, missile, aim: null,
        };
      case 'tank':
        return {
          pitch: 0,
          roll: 0,
          yaw: this.axis('KeyA', 'KeyD'),     // Ketten lenken
          throttle: this.axis('KeyS', 'KeyW'), // W = vorwärts
          fire, missile, aim: null,           // aim wird von der Engine gesetzt
        };
    }
  }
}
