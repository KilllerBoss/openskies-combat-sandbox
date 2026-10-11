/**
 * Projectile — Kanonenprojektile, Schiffs-Flak und Panzergranaten.
 *
 * Ein Typ für alle drei: Sie unterscheiden sich nur in Parametern & Verhalten
 * (Ballistik ja/nein, Annäherungszünder ja/nein, Splash ja/nein) — ein
 * klassischer "Daten statt Klassen"-Trick, der die Anzahl paralleler Systeme
 * klein hält.
 *
 * Kollision: gesweepte Prüfung (Strecke pos → pos+vel·dt gegen Trefferkugel).
 * Bei 900 m/s Mündungsgeschwindigkeit legt ein Geschoss pro Physikschritt
 * 15 m zurück — eine Punktprobe WÜRDE Ziele durch tunneln!
 */
import * as THREE from 'three';
import type { Vehicle } from './Vehicle';
import type { FlakSpec, GrenadeSpec } from '../types';

const _seg = new THREE.Vector3();
const _rel = new THREE.Vector3();
const _closest = new THREE.Vector3();

export type ProjectileKind = 'bullet' | 'flak' | 'grenade';

export interface ProjectileParams {
  kind: ProjectileKind;
  damage: number;
  speed: number;
  spread: number;
  life: number;
  flak?: FlakSpec;
  grenade?: GrenadeSpec;
}

export class Projectile {
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  life = 0;
  params!: ProjectileParams;
  owner!: Vehicle;
  active = false;

  /** Trefferprüfung gegen alle lebenden Fahrzeuge. true = Projektil verbraucht. */
  update(dt: number, vehicles: Vehicle[], env: ProjectileEnv): boolean {
    this.life -= dt;
    if (this.life <= 0) return true;

    // Ballistik: Granaten fliegen in vollem Bogen, Bullets nur leicht
    if (this.params.kind === 'grenade') this.vel.y -= 9.81 * dt;
    else if (this.params.kind === 'bullet') this.vel.y -= 2.2 * dt;

    _seg.copy(this.vel).multiplyScalar(dt); // Bewegungsstrecke dieses Schritts

    // Flak: Annäherungszünder — detoniert, wenn ein FEINDLICHES Ziel nah genug
    if (this.params.kind === 'flak' && this.params.flak) {
      for (const v of vehicles) {
        if (!v.alive || v === this.owner) continue;
        if (v.pos.distanceToSquared(this.pos) < this.params.flak.fuseRadius ** 2) {
          env.flakBurst(this.pos);
          env.splashDamage(this.pos, this.params.damage, this.params.flak.splashRadius, this.owner);
          return true;
        }
      }
    }

    // Gesweepte Kollision gegen Trefferkugeln
    for (const v of vehicles) {
      if (!v.alive || v === this.owner) continue;
      _rel.subVectors(v.pos, this.pos);
      // Projektion des Zentrums auf die Bewegungsstrecke, geklemmt auf [0,1]
      const t = THREE.MathUtils.clamp(_rel.dot(_seg) / _seg.lengthSq(), 0, 1);
      _closest.copy(_seg).multiplyScalar(t).sub(_rel);
      if (_closest.lengthSq() < v.hitRadius * v.hitRadius) {
        if (this.params.kind === 'grenade' && this.params.grenade) {
          // Granate: Splash statt Einzeltreffer
          env.explosionAt(this.pos, 0.7);
          env.splashDamage(this.pos, this.params.damage, this.params.grenade.splashRadius, this.owner);
        } else {
          env.applyDamage(v, this.params.damage, this.owner);
          env.hitBurst(this.pos);
        }
        return true;
      }
    }

    // Boden-/Wasseroberfläche
    const surface = env.surfaceHeight(this.pos.x, this.pos.z);
    if (this.pos.y <= surface) {
      if (this.params.kind === 'grenade' && this.params.grenade) {
        env.explosionAt(this.pos, 0.9);
        env.splashDamage(this.pos, this.params.damage, this.params.grenade.splashRadius, this.owner);
      } else if (this.params.kind === 'flak') {
        env.flakBurst(this.pos); // schwarzer Rauch-Puff am Boden
      }
      return true;
    }

    this.pos.add(_seg);
    return false;
  }
}

/** Was ein Projektil über die Welt wissen muss (Engine implementiert das). */
export interface ProjectileEnv {
  surfaceHeight(x: number, z: number): number;
  applyDamage(target: Vehicle, amount: number, attacker: Vehicle): void;
  splashDamage(pos: THREE.Vector3, damage: number, radius: number, attacker: Vehicle): void;
  hitBurst(pos: THREE.Vector3): void;
  flakBurst(pos: THREE.Vector3): void;
  explosionAt(pos: THREE.Vector3, scale: number): void;
}
