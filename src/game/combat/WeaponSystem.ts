/**
 * WeaponSystem — Feuerleitung für Kanone, Lenkraketen, Flak und Granaten.
 *
 * Ein System pro Fahrzeug (auch KI-Fahrzeuge!). Unterscheidet anhand der
 * Fahrzeugklasse, WIE geschossen wird — die WAS (Schaden, Cadence) steht
 * komplett in der VehicleSpec (data-driven).
 *
 * Lock-On (Jets): Ziel gilt als "im Suchkopf", wenn es im Kegel (lockCone)
 * UND in Reichweite (lockRange) liegt. Hält man es dort für lockTime, ist
 * die Rakete scharf. Das erzeugt das klassische Dogfight-Spiel: Ziel in der
 * Nase HALTEN statt nur draufhalten.
 */
import * as THREE from 'three';
import type { ControlInput, VehicleSpec } from '../types';
import type { Vehicle } from '../entities/Vehicle';
import type { Projectile, ProjectileParams } from '../entities/Projectile';
import type { MissileEnv } from '../entities/Missile';

const _dir = new THREE.Vector3();
const _muzzle = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _toT = new THREE.Vector3();
const _lead = new THREE.Vector3();
const _aim = new THREE.Vector3();

export class WeaponSystem {
  // Zustand (HUD liht diese Felder über die Engine)
  ammo: number;
  missilesLeft: number;
  lockTarget: Vehicle | null = null;
  lockProgress = 0;
  locked = false;

  private cannonCd = 0;
  private missileCd = 0;
  private lockBeepAcc = 0;
  private flakSalvoLeft = 0;
  private flakSalvoCd = 0;

  constructor(private readonly owner: Vehicle, private readonly spec: VehicleSpec) {
    this.ammo = spec.cannon.ammo;
    this.missilesLeft = spec.missiles?.count ?? 0;
  }

  /** Physikschritt. `enemies` = lebende Gegenpartei. */
  update(
    dt: number,
    input: ControlInput,
    enemies: Vehicle[],
    env: WeaponEnv,
    spawnProjectile: (p: ProjectileParams, pos: THREE.Vector3, dir: THREE.Vector3, owner: Vehicle) => Projectile,
    launchMissile: (owner: Vehicle, target: Vehicle) => void,
  ): void {
    const c = this.spec.cannon;
    this.cannonCd -= dt;
    this.missileCd -= dt;

    // Munitionsregeneration — verhindert "leer und hilflos" im Endspiel
    this.ammo = Math.min(c.ammo, this.ammo + c.regen * dt);

    _fwd.set(0, 0, 1).applyQuaternion(this.owner.state.quaternion);

    switch (this.spec.vehicleClass) {
      case 'jet':
        this.updateJet(dt, input, enemies, env, spawnProjectile, launchMissile, _fwd);
        break;
      case 'ship':
        this.updateShip(dt, input, enemies, env, spawnProjectile, launchMissile);
        break;
      case 'tank':
        this.updateTank(dt, input, enemies, env, spawnProjectile);
        break;
    }
  }

  // ---------------------------------------------------------------- Jets ----
  private updateJet(
    dt: number, input: ControlInput, enemies: Vehicle[],
    env: WeaponEnv,
    spawnProjectile: (p: ProjectileParams, pos: THREE.Vector3, dir: THREE.Vector3, owner: Vehicle) => Projectile,
    launchMissile: (owner: Vehicle, target: Vehicle) => void,
    fwd: THREE.Vector3,
  ): void {
    const c = this.spec.cannon;
    const m = this.spec.missiles;

    // --- Lock-On-Logik ---
    if (m) {
      // Bestes Ziel: kleinster Winkel zur Nase innerhalb Kegel+Reichweite
      let best: Vehicle | null = null;
      let bestCos = Math.cos(m.lockCone);
      for (const e of enemies) {
        if (!e.alive) continue;
        _toT.subVectors(e.pos, this.owner.pos);
        const d = _toT.length();
        if (d > m.lockRange) continue;
        const cosA = _toT.normalize().dot(fwd);
        if (cosA > bestCos) { bestCos = cosA; best = e; }
      }
      if (best !== this.lockTarget) {
        this.lockTarget = best;
        this.lockProgress = 0; // Ziel gewechselt → Lock neu aufbauen
      }
      this.locked = false;
      if (this.lockTarget) {
        // Im Kegel bleiben? (jeden Schritt neu geprüft — Kegel verlassen
        // friert den Fortschritt ein, baut ihn aber nicht ab)
        _toT.subVectors(this.lockTarget.pos, this.owner.pos).normalize();
        if (_toT.dot(fwd) > Math.cos(m.lockCone * 1.4)) {
          this.lockProgress = Math.min(1, this.lockProgress + dt / m.lockTime);
        }
        this.locked = this.lockProgress >= 1;
        // Lock-Ton (nur für den Spieler hörbar)
        if (this.owner.isPlayer && this.lockProgress > 0.15) {
          this.lockBeepAcc += dt;
          const period = this.locked ? 0.32 : 0.16;
          if (this.lockBeepAcc >= period) {
            this.lockBeepAcc = 0;
            env.sound.lockBeep(this.locked);
          }
        }
      } else {
        this.lockProgress = 0;
      }

      // --- Raketenabschuss ---
      if (input.missile && this.locked && this.missilesLeft > 0 && this.missileCd <= 0) {
        this.missilesLeft--;
        this.missileCd = m.cooldown;
        launchMissile(this.owner, this.lockTarget!);
        if (this.owner.isPlayer) env.sound.missileLaunch();
      }
    }

    // --- Bordkanone ---
    if (input.fire && this.cannonCd <= 0 && this.ammo >= 1) {
      this.cannonCd = 1 / c.rate;
      this.ammo -= 1;
      _muzzle.copy(this.owner.pos).addScaledVector(fwd, this.spec.model.type === 'jet' ? 8 : 4);
      _dir.copy(fwd);
      // Streuung: kleinen Zufallsvektor addieren & normalisieren
      _dir.x += (Math.random() - 0.5) * c.spread;
      _dir.y += (Math.random() - 0.5) * c.spread;
      _dir.z += (Math.random() - 0.5) * c.spread;
      _dir.normalize();
      spawnProjectile(
        { kind: 'bullet', damage: c.damage, speed: c.muzzleVelocity, spread: 0, life: c.range / c.muzzleVelocity },
        _muzzle, _dir, this.owner,
      );
      if (this.owner.isPlayer) env.sound.gun(0.42);
      else if (this.owner.pos.distanceTo(env.playerPos) < 700) env.sound.gun(0.12);
    }
  }

  // -------------------------------------------------------------- Schiffe ---
  private updateShip(
    dt: number, input: ControlInput, enemies: Vehicle[], env: WeaponEnv,
    spawnProjectile: (p: ProjectileParams, pos: THREE.Vector3, dir: THREE.Vector3, owner: Vehicle) => Projectile,
    launchMissile: (owner: Vehicle, target: Vehicle) => void,
  ): void {
    const f = this.spec.flak;
    const s = this.spec.sam;
    if (!f) return;

    this.flakSalvoCd -= dt;

    // Schiffe zielen automatisch auf den nächsten Feind (arcade-Flak).
    let target: Vehicle | null = null;
    let bestD = 2600;
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = e.pos.distanceTo(this.owner.pos);
      if (d < bestD) { bestD = d; target = e; }
    }

    // --- Flak-Salve ---
    if (target && this.flakSalvoLeft <= 0 && this.flakSalvoCd <= 0 && (input.fire || !this.owner.isPlayer)) {
      this.flakSalvoLeft = f.burst;
      this.flakSalvoCd = f.salvoCooldown;
    }
    if (this.flakSalvoLeft > 0 && target) {
      this.cannonCd -= dt; // Wiederverwendung als Schuss-zu-Schuss-Timer
      if (this.cannonCd <= 0) {
        this.cannonCd = 0.14;
        this.flakSalvoLeft--;
        // Vorhalt: t = d/v; Zielposition + Fahrt·t (iterativ grob)
        _toT.subVectors(target.pos, this.owner.pos);
        const t = _toT.length() / f.shellSpeed;
        _lead.copy(target.pos).addScaledVector(target.vel, t * 0.85);
        _muzzle.copy(this.owner.pos).add(new THREE.Vector3(0, 8, 0));
        _dir.subVectors(_lead, _muzzle).normalize();
        _dir.x += (Math.random() - 0.5) * 0.05;
        _dir.y += (Math.random() - 0.5) * 0.05;
        _dir.z += (Math.random() - 0.5) * 0.05;
        spawnProjectile(
          { kind: 'flak', damage: f.damage, speed: f.shellSpeed, spread: 0, life: 3.2, flak: f },
          _muzzle, _dir, this.owner,
        );
        if (this.owner.pos.distanceTo(env.playerPos) < 900) env.sound.gun(0.25);
      }
    }

    // --- SAM ---
    if (s && target && input.missile && this.missileCd <= 0 && bestD < 3200) {
      this.missileCd = s.cooldown;
      launchMissile(this.owner, target);
      if (this.owner.isPlayer) env.sound.missileLaunch();
    }
    // KI-Schiffe feuern SAM eigenständig (Chance pro Sekunde, wenn ein Ziel
    // in Reichweite ist — so wirken verschiedene Schiffe unabhängig)
    if (s && target && !this.owner.isPlayer && this.missileCd <= 0 && bestD < 2600 && Math.random() < 0.12 * dt) {
      this.missileCd = s.cooldown + Math.random() * 4;
      launchMissile(this.owner, target);
    }
  }

  // --------------------------------------------------------------- Panzer ---
  private updateTank(
    dt: number, input: ControlInput, enemies: Vehicle[],
    env: WeaponEnv,
    spawnProjectile: (p: ProjectileParams, pos: THREE.Vector3, dir: THREE.Vector3, owner: Vehicle) => Projectile,
  ): void {
    const g = this.spec.grenade;
    if (!g) return;

    if (input.fire && this.cannonCd <= 0) {
      // Zielpunkt: player.aim (Fadenkreuz-Welttrefferpunkt der Engine) oder
      // für die KI das vorberechnete input.aim
      const aimPoint = this.owner.turretAim;
      if (aimPoint) {
        this.cannonCd = g.cooldown;
        _muzzle.copy(this.owner.pos).add(new THREE.Vector3(0, 3, 0));
        // Ballistische Lösung (Näherung): Flugzeit aus Horizontalabstand,
        // dann Zielhöhe + ½·g·t² anvisieren — klassischer Artillerie-Trick.
        _aim.copy(aimPoint);
        const t0 = Math.hypot(aimPoint.x - _muzzle.x, aimPoint.z - _muzzle.z) / g.muzzleVelocity;
        _aim.y += 0.5 * 9.81 * t0 * t0;
        _dir.subVectors(_aim, _muzzle).normalize();
        spawnProjectile(
          { kind: 'grenade', damage: g.damage, speed: g.muzzleVelocity, spread: 0, life: 8, grenade: g },
          _muzzle, _dir, this.owner,
        );
        if (this.owner.pos.distanceTo(env.playerPos) < 1200) env.sound.gun(0.5);
      }
    }
    void dt; void enemies;
  }
}

/** Umgebung, die das Waffensystem braucht (Engine implementiert). */
export interface WeaponEnv extends MissileEnv {
  sound: { gun(v: number): void; missileLaunch(): void; lockBeep(locked: boolean): void };
  playerPos: THREE.Vector3;
}
