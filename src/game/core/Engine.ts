/**
 * Engine — der Dirigent: Game-Loop, Welt, Entities, Kampf, HUD.
 *
 * LOOP-DESIGN (das Wichtigste zum Lernen):
 *   renderFrame (variabel, z.B. 144 Hz): Visuals, Kamera, Partikel, HUD
 *   fixedStep  (IMMER 60 Hz):           Physik, KI, Waffen, Kollision
 *
 * Warum getrennt? Physik MUSS deterministisch gleich schnell laufen, egal
 * wie schnell der Bildschirm ist (sonst fliegt der Jet auf einem 144-Hz-
 * Monitor dreimal so schnell wie auf einem Laptop mit 48 FPS). Der
 * Akkumulator sammelt Rahmenzeit ein und arbeitet sie in 1/60-Schritten ab.
 */
import * as THREE from 'three';
import { InputManager } from './Input';
import { Vehicle } from '../entities/Vehicle';
import { Projectile, type ProjectileParams } from '../entities/Projectile';
import { Missile } from '../entities/Missile';
import type { WeaponEnv } from '../combat/WeaponSystem';
import { DamageSystem } from '../combat/DamageSystem';
import { AIPilot, type AIWorld } from '../ai/AIPilot';
import { buildWorld, applyAtmosphere, type WorldRuntime } from '../world/WorldBuilder';
import { Effects } from '../render/Effects';
import { CameraRig } from '../render/CameraRig';
import { SoundKit } from '../audio/SoundKit';
import { createVehicleVisual, loadGlbVisual } from '../render/ModelFactory';
import { AI_JET_IDS, AI_SHIP_IDS, AI_TANK_IDS, VEHICLES_BY_ID } from '../data/vehicles';
import { WORLDS_BY_ID } from '../data/worlds';
import { MODE_NAMES, type ControlInput, type GameModeId, type HudState, type HudTargetInfo, type MovementContext, type RadarContact, type VehicleSpec } from '../types';

const STEP = 1 / 60;
const MAX_PROJECTILES = 90;
const MAX_MISSILES = 18;

/** SAM-Lasten der Schiffe (Schiffe haben nur cooldown in ihrer Spec — die
 *  ballistischen Werte wohnen hier, weil alle Schiffe dieselbe Rakete nutzen). */
const SAM_MISSILE = {
  count: 1, damage: 55, lockTime: 1, lockCone: 0.5, lockRange: 3200,
  cooldown: 0, speed: 300, accel: 260, turnRate: 2.1, burnTime: 3.6, navConstant: 4,
};

export interface StartConfig {
  vehicleId: string;
  worldId: string;
  mode: GameModeId;
}

const _fwd = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _tmp2 = new THREE.Vector3();
const _camDir = new THREE.Vector3();
const _ndc = new THREE.Vector3();
const _right = new THREE.Vector3();
const _fwdW = new THREE.Vector3();
const _rel = new THREE.Vector3();

export class Engine {
  // Grundausstattung (leben über mehrere Sessions)
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(70, 1, 0.5, 9000);
  private rig: CameraRig;
  private input = new InputManager();
  readonly sound = new SoundKit();

  // Session-Zustand
  private world: WorldRuntime | null = null;
  private clearAtmosphere: (() => void) | null = null;
  private effects: Effects | null = null;
  private player: Vehicle | null = null;
  private aiVehicles: Vehicle[] = [];
  private projectiles: Projectile[] = [];
  private missiles: Missile[] = [];
  private pendingAI: Array<{ spec: VehicleSpec; at: number }> = [];
  private damage = new DamageSystem({ explosionAt: () => {}, soundExplosion: () => {} });

  private cfg: StartConfig | null = null;
  private movementCtx: MovementContext = {
    terrainHeight: () => 0, hasWater: false, waterLevel: 0, time: 0,
  };
  private aiWorld: AIWorld = { player: null as unknown as Vehicle, ctx: this.movementCtx };

  private playerPosRef = new THREE.Vector3(0, -9999, 0);
  private time = 0;
  private respawnT = 0;
  private raf = 0;
  private lastT = 0;
  private acc = 0;

  running = false;
  paused = false;

  // Vorallokiertes HUD-Objekt (GC-frei — wird pro Frame befüllt)
  private hud: HudState = {
    running: false, dead: false, respawnIn: 0, speedKmh: 0, altitude: 0,
    throttle: 0, hp: 0, maxHp: 1, ammo: 0, maxAmmo: 1, missiles: 0, maxMissiles: 0,
    lockProgress: 0, locked: false, hasTarget: false, target: null,
    score: 0, kills: 0, stall: false, incoming: false, killFeed: [],
    message: null, radar: { contacts: [], range: 3500 },
    cameraMode: 'chase', vehicleName: '', worldName: '', modeName: '',
  };

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.rig = new CameraRig(this.camera);
    this.resize();
    window.addEventListener('resize', this.resize);
  }

  private resize = (): void => {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  // ------------------------------------------------------------------ Start --
  start(cfg: StartConfig): void {
    this.cfg = cfg;
    this.time = 0;
    this.acc = 0;
    this.damage = new DamageSystem({
      explosionAt: (p, s) => this.env.explosionAt(p, s),
      soundExplosion: (v) => this.sound.explosion(v),
    });

    // Welt aufbauen (alte Session räumen)
    this.teardownSession();
    const worldSpec = WORLDS_BY_ID[cfg.worldId];
    this.world = buildWorld(worldSpec);
    this.scene.add(this.world.group);
    this.clearAtmosphere = applyAtmosphere(this.scene, worldSpec);
    this.effects = new Effects(this.scene);
    this.movementCtx = {
      terrainHeight: this.world.terrainHeight,
      hasWater: this.world.hasWater,
      waterLevel: this.world.waterLevel,
      time: 0,
    };
    this.aiWorld = { player: null as unknown as Vehicle, ctx: this.movementCtx };

    // Spieler
    const pSpec = VEHICLES_BY_ID[cfg.vehicleId];
    const player = this.createVehicle(pSpec, true);
    const sp = worldSpec.spawn;
    player.state.position.set(sp.x, sp.y, sp.z);
    player.state.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), sp.heading);
    if (pSpec.vehicleClass === 'jet') {
      _fwd.set(0, 0, 1).applyQuaternion(player.state.quaternion);
      const jetPhys = pSpec.physics as import('../types').JetPhysicsSpec;
      player.state.velocity.copy(_fwd).multiplyScalar(Math.max(170, jetPhys.stallSpeed * 2.4));
    }
    this.player = player;
    this.aiWorld.player = player;

    // Gegner je Modus
    const e = worldSpec.enemies;
    if (cfg.mode !== 'free') {
      const jets = cfg.mode === 'dogfight' ? e.jets : e.jets;
      for (let i = 0; i < jets; i++) this.spawnAI(AI_JET_IDS[i % AI_JET_IDS.length], i);
      if (cfg.mode === 'mixed') {
        for (let i = 0; i < e.ships; i++) this.spawnAI(AI_SHIP_IDS[i % AI_SHIP_IDS.length], i);
        for (let i = 0; i < e.tanks; i++) this.spawnAI(AI_TANK_IDS[i % AI_TANK_IDS.length], i);
      }
    }

    // Kamera hinter den Spieler setzen (kein Einschweben vom Nullpunkt)
    this.camera.position.copy(player.pos).add(new THREE.Vector3(0, 12, -34));
    this.rig.mode = 'chase';

    // Sound & Input
    this.sound.resume();
    if (pSpec.vehicleClass === 'jet') this.sound.startEngine();
    this.input.attach();
    this.input.setActive(true);

    this.running = true;
    this.paused = false;
    this.lastT = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.loop);
  }

  /** Kamera-Toggle (Taste C). */
  toggleCamera(): boolean {
    this.rig.toggle();
    return this.rig.mode === 'cockpit';
  }

  setMuted(m: boolean): void {
    this.sound.setMuted(m);
  }

  pause(): void {
    this.paused = true;
    this.input.setActive(false);
  }

  resume(): void {
    this.paused = false;
    this.lastT = performance.now();
    this.input.setActive(true);
  }

  /** Zurück ins Menü — hält die Engine bereit für die nächste Session. */
  returnToMenu(): void {
    this.running = false;
    this.teardownSession();
    this.input.setActive(false);
    this.sound.stopEngine();
    this.damage.reset();
  }

  dispose(): void {
    this.returnToMenu();
    this.input.detach();
    this.sound.dispose();
    window.removeEventListener('resize', this.resize);
    this.renderer.dispose();
  }

  private teardownSession(): void {
    cancelAnimationFrame(this.raf);
    if (this.world) {
      this.scene.remove(this.world.group);
      this.world.dispose();
      this.world = null;
    }
    this.clearAtmosphere?.();
    this.clearAtmosphere = null;
    this.effects?.dispose();
    this.effects = null;
    for (const v of [this.player, ...this.aiVehicles]) {
      if (v?.visual) {
        this.scene.remove(v.visual.group);
        v.visual.dispose();
      }
    }
    if (this.player?.visual) { this.scene.remove(this.player.visual.group); this.player.visual.dispose(); }
    this.player = null;
    this.aiVehicles = [];
    this.pendingAI = [];
    for (const p of this.projectiles) p.active = false;
    for (const m of this.missiles) m.despawn();
  }

  // ---------------------------------------------------------------- Loop --
  private loop = (): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min((now - this.lastT) / 1000, 0.1); // Clamps: Tab-Pause etc.
    this.lastT = now;
    if (this.paused) { this.renderer.render(this.scene, this.camera); return; }

    this.acc += dt;
    let guard = 0; // Spiralschutz (Schnellklemm-Rechner: max 5 Schritte/Frame)
    while (this.acc >= STEP && guard++ < 5) {
      this.fixedStep(STEP);
      this.acc -= STEP;
    }
    this.renderFrame(dt);
  };

  // ----------------------------------------------------------- fixedStep --
  private fixedStep(dt: number): void {
    this.time += dt;
    this.movementCtx.time = this.time;
    const player = this.player;
    if (!player) return;
    this.playerPosRef.copy(player.pos);

    // ---- Spielersteuerung ----
    let playerInput: ControlInput = { pitch: 0, roll: 0, yaw: 0, throttle: 0, fire: false, missile: false, aim: null };
    if (player.alive) {
      playerInput = this.input.poll(player.spec.vehicleClass);
      if (this.input.consumePress('KeyC')) this.toggleCamera();
      if (player.spec.vehicleClass === 'tank') player.turretAim = this.computeTankAim();
      playerInput.aim = player.turretAim;
      player.lastInput = playerInput;
      if (player.fixedUpdate(dt, playerInput, this.movementCtx)) {
        this.killVehicle(player, null); // Bodenkontakt = Crash
      }
    } else {
      this.respawnT -= dt;
      if (this.respawnT <= 0) {
        const sp = WORLDS_BY_ID[this.cfg!.worldId].spawn;
        player.respawn(new THREE.Vector3(sp.x, sp.y, sp.z), sp.heading);
        if (player.visual) player.visual.group.visible = true;
      }
    }

    // ---- KI-Fahrzeuge ----
    for (const v of this.aiVehicles) {
      if (!v.alive) continue;
      const ai = v.ai!;
      const input = ai.update(dt, this.aiWorld);
      v.lastInput = input;
      if (v.fixedUpdate(dt, input, this.movementCtx)) {
        this.killVehicle(v, null);
      }
    }

    // ---- Waffen ----
    if (player.alive) {
      player.weapons.update(dt, playerInput, this.enemiesOf(player), this.env, this.spawnProjectile, this.launchMissile);
    }
    for (const v of this.aiVehicles) {
      if (!v.alive) continue;
      const fireInput: ControlInput = v.lastInput ?? { pitch: 0, roll: 0, yaw: 0, throttle: 0, fire: false, missile: false, aim: null };
      v.weapons.update(dt, fireInput, this.enemiesOf(v), this.env, this.spawnProjectile, this.launchMissile);
    }

    // ---- Projektile ----
    for (const p of this.projectiles) {
      if (!p.active) continue;
      if (p.update(dt, this.allTargets(), this.env)) p.active = false;
    }

    // ---- Raketen ----
    for (const v of this.aiVehicles) v.threatened = false;
    let incoming = false;
    for (const m of this.missiles) {
      if (!m.active) continue;
      if (m.target === player && m.pos.distanceTo(player.pos) < 1300) incoming = true;
      if (m.target !== player) m.target.threatened = true;
      if (m.update(dt, this.env)) m.despawn();
    }
    this.hud.incoming = incoming;

    // ---- Buchführung ----
    this.damage.update(dt);
    this.scheduleAIRespawns();
  }

  /** Panzer-Zielpunkt: Kamera-Fadenkreuz gegen Terrain ray-marschen. */
  private computeTankAim(): THREE.Vector3 | null {
    if (!this.player) return null;
    this.camera.getWorldDirection(_camDir);
    const origin = this.camera.position;
    let prev = origin.distanceTo(this.player.pos) + 20;
    for (let t = prev; t < 3600; t += 22) {
      _tmp.copy(origin).addScaledVector(_camDir, t);
      const s = this.surfaceHeight(_tmp.x, _tmp.z);
      if (_tmp.y <= s) {
        _tmp.copy(origin).addScaledVector(_camDir, (t + prev) / 2);
        return _tmp.clone();
      }
      prev = t;
    }
    _tmp.copy(origin).addScaledVector(_camDir, 2400);
    return _tmp.clone();
  }

  // ---------------------------------------------------------- renderFrame --
  private renderFrame(dt: number): void {
    const player = this.player;
    if (!player || !this.effects) return;

    for (const v of this.aiVehicles) v.syncVisual(this.time);
    if (player.alive) player.syncVisual(this.time);

    // Tracer-Visuals der aktiven Projektile (Farbe je Art)
    for (const p of this.projectiles) {
      if (!p.active) continue;
      if (p.params.kind === 'bullet') this.effects.spawnTracer(p.pos, p.vel, dt + 0.06, 0xffd27a);
      else if (p.params.kind === 'flak') this.effects.spawnTracer(p.pos, p.vel, dt + 0.06, 0xff8a5c);
      // Granaten zeigen keine Tracer — der Bogen sieht man am Ballistik-Effekt
    }

    this.effects.update(dt);

    if (player.alive) {
      this.rig.setShake(this.effects.shake);
      this.rig.update(dt, player.state, player.speed, player.buffet);
      if (player.spec.vehicleClass === 'jet') {
        const phys = player.spec.physics as { maxSpeed: number };
        this.sound.updateEngine(player.throttle, Math.min(1, player.speed / phys.maxSpeed));
      }
    }

    this.buildHud();
    this.renderer.render(this.scene, this.camera);
  }

  // ------------------------------------------------------------------ HUD --
  getHudState(): HudState {
    return this.hud;
  }

  private buildHud(): void {
    const player = this.player;
    if (!player) return;
    const h = this.hud;
    const d = this.damage;
    h.running = this.running;
    h.dead = !player.alive;
    h.respawnIn = Math.max(0, this.respawnT);
    h.speedKmh = player.speed * 3.6;
    h.altitude = player.pos.y;
    h.throttle = player.throttle;
    h.hp = Math.max(0, Math.round(player.hp));
    h.maxHp = player.spec.hp;
    h.ammo = Math.floor(player.weapons.ammo);
    h.maxAmmo = player.spec.cannon.ammo;
    h.missiles = player.weapons.missilesLeft;
    h.maxMissiles = player.spec.missiles?.count ?? 0;
    h.lockProgress = player.weapons.lockProgress;
    h.locked = player.weapons.locked;
    h.score = d.score;
    h.kills = d.kills;
    h.stall = player.stalling;
    h.killFeed = d.killFeed;
    h.message = d.message;
    h.cameraMode = this.rig.mode;
    h.vehicleName = player.spec.name;
    h.worldName = WORLDS_BY_ID[this.cfg?.worldId ?? 'archipelago'].name;
    h.modeName = MODE_NAMES[this.cfg?.mode ?? 'free'];

    // Ziel-Marker auf den Bildschirm projizieren
    const t = player.weapons.lockTarget;
    if (t && t.alive) {
      h.hasTarget = true;
      if (!h.target) h.target = { x: 0.5, y: 0.5, visible: false, dist: 0, locked: false, lockProgress: 0 };
      _ndc.copy(t.pos).project(this.camera);
      h.target.x = (_ndc.x + 1) / 2;
      h.target.y = (1 - _ndc.y) / 2;
      h.target.visible = _ndc.z < 1 && _ndc.x > -1.05 && _ndc.x < 1.05 && _ndc.y > -1.05 && _ndc.y < 1.05;
      h.target.dist = t.pos.distanceTo(player.pos);
      h.target.locked = player.weapons.locked;
      h.target.lockProgress = player.weapons.lockProgress;
    } else {
      h.hasTarget = false;
    }

    // Radar: Kontakte in Koppelnavigation (Heading = oben)
    const contacts = h.radar.contacts;
    contacts.length = 0;
    _fwdW.set(0, 0, 1).applyQuaternion(player.state.quaternion);
    _right.set(1, 0, 0).applyQuaternion(player.state.quaternion);
    _fwdW.y = 0; _right.y = 0;
    if (_fwdW.lengthSq() > 0.0001) _fwdW.normalize();
    if (_right.lengthSq() > 0.0001) _right.normalize();
    for (const v of this.aiVehicles) {
      if (!v.alive) continue;
      _rel.subVectors(v.pos, player.pos);
      if (_rel.length() > h.radar.range) continue;
      const c: RadarContact = { x: _rel.dot(_right), z: _rel.dot(_fwdW), kind: v.spec.vehicleClass };
      contacts.push(c);
    }
  }

  // ------------------------------------------------------- Spawn-Helfer --
  private createVehicle(spec: VehicleSpec, isPlayer: boolean): Vehicle {
    const v = new Vehicle(spec, isPlayer);
    v.visual = createVehicleVisual(spec);
    this.scene.add(v.visual.group);
    if (spec.model.type === 'glb') {
      // GLB-Modelle laden asynchron — bis dahin läuft das Fallback-Modell
      void loadGlbVisual(spec.model.src, spec.model.scale).then((vis) => {
        if (v.visual) { this.scene.remove(v.visual.group); v.visual.dispose(); }
        v.visual = vis;
        this.scene.add(vis.group);
        vis.group.visible = v.alive;
      });
    }
    return v;
  }

  private spawnAI(specId: string, index: number): void {
    const spec = VEHICLES_BY_ID[specId];
    if (!spec) return;
    const v = this.createVehicle(spec, false);
    v.ai = new AIPilot(v);
    const rng = () => Math.random();

    if (spec.vehicleClass === 'jet') {
      const ang = (index / 6) * Math.PI * 2 + rng() * 0.8;
      const dist = 1500 + rng() * 900;
      v.pos.set(this.playerPosRef.x + Math.cos(ang) * dist, 320 + rng() * 260, this.playerPosRef.z + Math.sin(ang) * dist);
      v.state.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang + Math.PI); // Richtung Spieler
      _fwd.set(0, 0, 1).applyQuaternion(v.state.quaternion);
      v.state.velocity.copy(_fwd).multiplyScalar(200);
    } else if (spec.vehicleClass === 'ship') {
      // Wasserstelle suchen (Terrain unter -6 m)
      let ok = false;
      for (let i = 0; i < 40 && !ok; i++) {
        const x = (rng() - 0.5) * 3000;
        const z = (rng() - 0.5) * 3000;
        if (this.surfaceHeight(x, z) < -6) {
          v.pos.set(x, 0, z);
          v.state.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI * 2);
          ok = true;
        }
      }
      if (!ok) { this.scene.remove(v.visual!.group); v.visual!.dispose(); return; }
    } else {
      // Flaches Landstück suchen
      let ok = false;
      for (let i = 0; i < 40 && !ok; i++) {
        const x = (rng() - 0.5) * 3200;
        const z = (rng() - 0.5) * 3200;
        const h = this.surfaceHeight(x, z);
        if (h > 4 && !this.movementCtx.hasWater) {
          v.pos.set(x, h + 1, z);
          v.state.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI * 2);
          ok = true;
        }
      }
      if (!ok) { this.scene.remove(v.visual!.group); v.visual!.dispose(); return; }
    }
    this.aiVehicles.push(v);
  }

  /** Gefallene KI nach ~9 s weit weg neu spawnen (damit die Welt lebendig bleibt). */
  private scheduleAIRespawns(): void {
    const mode = this.cfg?.mode;
    if (!mode || mode === 'free') return;
    for (const v of this.aiVehicles) {
      if (!v.alive && v.respawnMark !== true) {
        v.respawnMark = true;
        const cls = v.spec.vehicleClass;
        const pool = cls === 'jet' ? AI_JET_IDS : cls === 'ship' ? AI_SHIP_IDS : AI_TANK_IDS;
        this.pendingAI.push({ spec: VEHICLES_BY_ID[pool[Math.floor(Math.random() * pool.length)]], at: this.time + 9 });
      }
    }
    for (let i = this.pendingAI.length - 1; i >= 0; i--) {
      if (this.time >= this.pendingAI[i].at) {
        this.spawnAI(this.pendingAI[i].spec.id, Math.floor(rng() * 6));
        this.pendingAI.splice(i, 1);
      }
    }
  }

  private enemiesOf(v: Vehicle): Vehicle[] {
    // FFA gegen die Welt: Spieler gegen alle KI, jede KI gegen den Spieler
    if (v.isPlayer) return this.aiVehicles;
    return this.player && this.player.alive ? [this.player] : [];
  }

  /** Wiederverwendete Liste aller Fahrzeuge (KEINE Allokation im Loop —
   *  das alte allTargets-Push-auf-aiVehicles war ein echtes Mutation-Bug-Risiko). */
  private targetList: Vehicle[] = [];
  private allTargets(): Vehicle[] {
    const l = this.targetList;
    l.length = 0;
    for (const v of this.aiVehicles) l.push(v);
    if (this.player) l.push(this.player);
    return l;
  }

  /** Zentraler Abschuss: Schadenssystem + Buchführung (Respawn/Visuals). */
  private killVehicle(v: Vehicle, attacker: Vehicle | null): void {
    this.damage.kill(v, attacker);
    if (!v.alive) this.onDeath(v);
  }

  private onDeath(v: Vehicle): void {
    if (v.isPlayer) {
      this.respawnT = 2.5;
    } else if (v.visual) {
      v.visual.group.visible = false;
    }
  }

  // -------------------------------------------------- Combat-Environment --
  /** Implementiert ProjectileEnv/MissileEnv/WeaponEnv in einem Objekt. */
  private env = {
    surfaceHeight: (x: number, z: number): number => this.surfaceHeight(x, z),
    applyDamage: (target: Vehicle, amount: number, attacker: Vehicle | null): void => {
      this.damage.applyDamage(target, amount, attacker);
      if (!target.alive) this.onDeath(target);
    },
    splashDamage: (pos: THREE.Vector3, dmg: number, radius: number, attacker: Vehicle): void => {
      for (const v of this.allTargets()) {
        if (!v.alive || v === attacker) continue;
        const d = v.pos.distanceTo(pos);
        if (d < radius) {
          this.env.applyDamage(v, dmg * Math.max(0.35, 1 - d / radius), attacker);
        }
      }
    },
    hitBurst: (pos: THREE.Vector3): void => this.effects?.hitBurst(pos, 1),
    flakBurst: (pos: THREE.Vector3): void => {
      const fx = this.effects;
      if (!fx) return;
      for (let i = 0; i < 6; i++) {
        fx.spawnParticle(
          pos.x, pos.y, pos.z,
          (Math.random() - 0.5) * 16, Math.random() * 10, (Math.random() - 0.5) * 16,
          0.8 + Math.random() * 0.5, 4 + Math.random() * 3, 0x26262a, 0.93,
        );
      }
    },
    explosionAt: (pos: THREE.Vector3, scale: number): void => {
      this.effects?.explosion(pos, scale);
      if (this.player) {
        const d = pos.distanceTo(this.player.pos);
        if (d < 1600) this.sound.explosion(Math.max(0.15, 0.9 * (1 - d / 1600)));
      }
    },
    missileTrail: (pos: THREE.Vector3): void => this.effects?.missileTrail(pos),
    sound: {
      gun: (v: number) => this.sound.gun(v),
      missileLaunch: () => this.sound.missileLaunch(),
      lockBeep: (locked: boolean) => this.sound.lockBeep(locked),
    },
    playerPos: this.playerPosRef,
  };

  private surfaceHeight(x: number, z: number): number {
    if (!this.world) return 0;
    const t = this.world.terrainHeight(x, z);
    return this.world.hasWater ? Math.max(t, this.world.waterLevel) : t;
  }

  private spawnProjectile = (params: ProjectileParams, pos: THREE.Vector3, dir: THREE.Vector3, owner: Vehicle): Projectile => {
    let p = this.projectiles.find((x) => !x.active);
    if (!p) {
      if (this.projectiles.length >= MAX_PROJECTILES) return this.projectiles[0];
      p = new Projectile();
      this.projectiles.push(p);
    }
    p.params = params;
    p.owner = owner;
    p.pos.copy(pos);
    p.vel.copy(dir).multiplyScalar(params.speed);
    p.life = params.life;
    p.active = true;
    return p;
  };

  private launchMissile = (owner: Vehicle, target: Vehicle): void => {
    let m = this.missiles.find((x) => !x.active);
    if (!m) {
      if (this.missiles.length >= MAX_MISSILES) return;
      m = new Missile(this.scene);
      this.missiles.push(m);
    }
    _fwd.set(0, 0, 1).applyQuaternion(owner.state.quaternion);
    m.launch(owner, target, owner.spec.missiles ?? SAM_MISSILE, _fwd);
  };
}

/** Hilfs-Zufall (Modul-Ebene für scheduleAIRespawns). */
function rng(): number {
  return Math.random();
}
