/**
 * CameraRig — Verfolgerkamera (federgedämpft) und Cockpit-Ansicht.
 *
 * Lerninhalt: "Frame-rate-unabhängiges Dämpfen". Ein `lerp(a, b, 0.1)` pro
 * Frame läuft bei 144 FPS doppelt so schnell wie bei 72 — deshalb die
 * Exponentialform: `1 - exp(-rate · dt)` verhält sich auf JEDEM Gerät gleich.
 */
import * as THREE from 'three';
import type { VehicleState } from '../types';

const _desired = new THREE.Vector3();
const _lookAt = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _up = new THREE.Vector3();
const _shakeOff = new THREE.Vector3();

export class CameraRig {
  mode: 'chase' | 'cockpit' = 'chase';

  private shakeSrc = 0; // wird von außen gesetzt (Effects.shake)

  constructor(private camera: THREE.PerspectiveCamera) {}

  setShake(v: number): void {
    this.shakeSrc = v;
  }

  toggle(): void {
    this.mode = this.mode === 'chase' ? 'cockpit' : 'chase';
  }

  /**
   * Pro Render-Frame. `dt` = echte Rahmenzeit; `speed` für FOV-Kick
   * (Geschwindigkeitsgefühl: bei 400 m/s weitet sich das Blickfeld leicht).
   */
  update(dt: number, state: VehicleState, speed: number, buffet: number): void {
    _fwd.set(0, 0, 1).applyQuaternion(state.quaternion);
    _up.set(0, 1, 0).applyQuaternion(state.quaternion);

    // FOV-Kick: 70° Basis + bis zu 16° zusätzlich bei Vmax. Eklatanter
    // Geschwindigkeits-Trick aus Rennspielen — kostet nichts, wirkt viel.
    const targetFov = THREE.MathUtils.clamp(70 + speed * 0.045, 70, 88);
    this.camera.fov += (targetFov - this.camera.fov) * (1 - Math.exp(-3 * dt));
    this.camera.updateProjectionMatrix();

    if (this.mode === 'chase') {
      // Gewünschte Position: hinter & über dem Fahrzeug; VOR die Nase schauen
      _desired.copy(state.position)
        .addScaledVector(_fwd, -26)
        .addScaledVector(_up, 9);
      const k = 1 - Math.exp(-6 * dt); // Dämpfung (rate 6 = "straff")
      this.camera.position.lerp(_desired, k);
      _lookAt.copy(state.position).addScaledVector(_fwd, 42);
      this.camera.up.copy(_up); // MITRollen → Kurvenflug fühlt sich "an"
      this.camera.lookAt(_lookAt);
    } else {
      // Cockpit: hart an das Fahrzeug gekoppelt (kein Dämpfen — sonst Seekrankheit)
      _desired.copy(state.position).addScaledVector(_up, 1.4).addScaledVector(_fwd, 3.5);
      this.camera.position.copy(_desired);
      this.camera.quaternion.copy(state.quaternion);
    }

    // Buffet (Stall-Zittern) + Explosions-Ruckeln als Positionsrauschen
    const jitter = this.shakeSrc * 0.8 + buffet * 0.35;
    if (jitter > 0.001) {
      _shakeOff.set(
        (Math.random() - 0.5) * jitter,
        (Math.random() - 0.5) * jitter,
        (Math.random() - 0.5) * jitter,
      );
      this.camera.position.add(_shakeOff);
    }
  }
}
