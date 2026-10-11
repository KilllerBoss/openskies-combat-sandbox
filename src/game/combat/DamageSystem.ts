/**
 * DamageSystem — Schaden, Abschüsse, Score, Kill-Feed.
 *
 * Zentral an EINER Stelle, damit Panzerung/Score/Feed überall identisch
 * laufen. Der eigentliche Clou: `applyDamage` kennt NICHT die Quellen
 * (Projektil? Rakete? Aufprall?) — es zählt nur (Ziel, Betrag, Verursacher).
 * Solche "dummen" Schnittstellen machen ein System testbar & erweiterbar.
 */
import * as THREE from 'three';
import type { Vehicle } from '../entities/Vehicle';
import type { KillFeedItem } from '../types';

/** Punkte pro Fahrzeugklasse (Abschuss eines schweren Ziels lohnt sich mehr). */
const SCORE: Record<string, number> = { jet: 100, ship: 150, tank: 120 };

export interface DamageEnv {
  explosionAt(pos: THREE.Vector3, scale: number): void;
  soundExplosion(volume: number): void;
}

export class DamageSystem {
  score = 0;
  kills = 0;
  deaths = 0;
  killFeed: KillFeedItem[] = [];
  message: string | null = null;
  private messageT = 0;
  private feedId = 1;

  constructor(private readonly env: DamageEnv) {}

  /** Schaden anwenden (Panzerung absorbiert einen Anteil). */
  applyDamage(target: Vehicle, amount: number, attacker: Vehicle | null): void {
    if (!target.alive) return;
    const armor = 'armor' in target.spec.physics ? (target.spec.physics as { armor: number }).armor : 0;
    const dmg = amount * (1 - armor);
    target.hp -= dmg;
    if (target.hp <= 0) this.kill(target, attacker);
  }

  /** Abschuss verbuchen. Respawn-Handling macht die Engine (kennt Timer). */
  kill(target: Vehicle, attacker: Vehicle | null): void {
    if (!target.alive) return;
    target.alive = false;
    target.hp = 0;
    this.env.explosionAt(target.pos, target.spec.vehicleClass === 'ship' ? 2.2 : 1);
    this.env.soundExplosion(0.85);

    // Kill-Feed (letzte 5 Einträge)
    this.killFeed.push({
      id: this.feedId++,
      text: attacker
        ? `${attacker.spec.name} schoss ${target.spec.name} ab`
        : `${target.spec.name} zerschellte am Boden`,
      age: 0,
      own: attacker?.isPlayer ?? false,
    });
    if (this.killFeed.length > 5) this.killFeed.shift();

    // Score & Meldung nur für Abschüsse DES SPIELERS
    if (attacker?.isPlayer) {
      const pts = SCORE[target.spec.vehicleClass] ?? 100;
      this.score += pts;
      this.kills++;
      this.message = `ZIEL ZERSTÖRT  +${pts}`;
      this.messageT = 2.4;
    }
    if (target.isPlayer) {
      this.deaths++;
      this.message = 'ABGESCHOSSEN';
      this.messageT = 2.4;
    }
  }

  /** Altern des Feeds/Meldung (Physik-Takt). */
  update(dt: number): void {
    for (const k of this.killFeed) k.age += dt;
    this.killFeed = this.killFeed.filter((k) => k.age < 7);
    if (this.messageT > 0) {
      this.messageT -= dt;
      if (this.messageT <= 0) this.message = null;
    }
  }

  reset(): void {
    this.score = 0; this.kills = 0; this.deaths = 0;
    this.killFeed.length = 0;
    this.message = null; this.messageT = 0;
  }
}
