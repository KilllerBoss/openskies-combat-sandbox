/**
 * WorldBuilder — baut aus einer WorldSpec eine begehbare 3D-Szene.
 *
 * Alles ist PROZEDURAL (deterministisch per Seed): Terrain aus fBm-Noise
 * (siehe TerrainGen), Farbverlauf per Höhen-Palette (Vertex-Colors), Himmel
 * als Gradient, Wolken als Sprites, Felsen als InstancedMesh.
 *
 * Dieselbe height()-Funktion dient für Rendering UND Kollision — nur EINE
 * Wahrheit über die Welt (kein "Mesh passt nicht zur Physik"-Bug).
 */
import * as THREE from 'three';
import type { WorldSpec } from '../types';
import { TerrainGen } from './TerrainGen';

export interface WorldRuntime {
  group: THREE.Group;
  terrainHeight: (x: number, z: number) => number;
  hasWater: boolean;
  waterLevel: number;
  update(dt: number): void;
  dispose(): void;
}

const _color = new THREE.Color();
const _cA = new THREE.Color();
const _cB = new THREE.Color();

/** Himmels-Gradient als Canvas-Textur (Background wird gestreckt — perfekt). */
function makeSkyTexture(top: number, horizon: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const g = canvas.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
  grad.addColorStop(0, hex(top));
  grad.addColorStop(0.62, hex(horizon));
  grad.addColorStop(1, hex(horizon));
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Weiche Wolken-Textur (radialer Gradient, weiß → transparent). */
function makeCloudTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 8, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,255,255,0.92)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

export function buildWorld(spec: WorldSpec): WorldRuntime {
  const group = new THREE.Group();
  const terrain = new TerrainGen(spec.terrain);

  // ------------------------------------------------------------- Terrain --
  // 5200×5200 m Spielfläche, 170×170 Grid = ~29k Vertices — flüssig auch
  // auf schwacher Hardware. flatShading gibt den Low-Poly-Look umsonst.
  const SIZE = 5200;
  const SEG = 170;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(posAttr.count * 3);
  for (let i = 0; i < posAttr.count; i++) {
    const h = terrain.height(posAttr.getX(i), posAttr.getZ(i));
    posAttr.setY(i, h);
    // Paletten-Interpolation: erste Stufe unter h, nächste darüber
    let a = spec.palette[0];
    let b = spec.palette[spec.palette.length - 1];
    for (let p = 0; p < spec.palette.length - 1; p++) {
      if (h >= spec.palette[p].h && h <= spec.palette[p + 1].h) {
        a = spec.palette[p];
        b = spec.palette[p + 1];
        break;
      }
    }
    const t = b.h === a.h ? 0 : THREE.MathUtils.clamp((h - a.h) / (b.h - a.h), 0, 1);
    _cA.setHex(a.color);
    _cB.setHex(b.color);
    _color.copy(_cA).lerp(_cB, t);
    colors[i * 3] = _color.r;
    colors[i * 3 + 1] = _color.g;
    colors[i * 3 + 2] = _color.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const terrainMesh = new THREE.Mesh(
    geo,
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  );
  group.add(terrainMesh);

  // ---------------------------------------------------------------- Wasser --
  let water: THREE.Mesh | null = null;
  if (spec.water.enabled) {
    const wGeo = new THREE.PlaneGeometry(7000, 7000);
    wGeo.rotateX(-Math.PI / 2);
    const wMat = spec.water.frozen
      ? new THREE.MeshStandardMaterial({ color: 0xdfe9ee, roughness: 0.35, metalness: 0.05 })
      : new THREE.MeshPhongMaterial({
          color: spec.water.color,
          transparent: true,
          opacity: 0.78,
          shininess: 110,
          specular: 0xbbdddd,
        });
    water = new THREE.Mesh(wGeo, wMat);
    water.position.y = 0;
    group.add(water);
  }

  // ------------------------------------------------------------- Beleuchtung --
  const sun = new THREE.DirectionalLight(spec.sky.sunColor, spec.sky.sunIntensity);
  sun.position.set(
    spec.sky.sunDir[0] * 1000,
    spec.sky.sunDir[1] * 1000,
    spec.sky.sunDir[2] * 1000,
  );
  group.add(sun);
  // Himmel-Licht von oben, Boden-Gegenlicht von unten — billig & wirksam
  const hemi = new THREE.HemisphereLight(
    spec.sky.horizonColor,
    0x40382e,
    spec.sky.ambient,
  );
  group.add(hemi);

  // ---------------------------------------------------------------- Wolken --
  const cloudTex = makeCloudTexture();
  const clouds: THREE.Sprite[] = [];
  for (let i = 0; i < spec.clouds; i++) {
    const mat = new THREE.SpriteMaterial({
      map: cloudTex,
      transparent: true,
      opacity: 0.55 + Math.random() * 0.3,
      depthWrite: false,
    });
    const s = new THREE.Sprite(mat);
    const scale = 190 + Math.random() * 320;
    s.scale.set(scale, scale * 0.42, 1);
    s.position.set(
      (Math.random() - 0.5) * 5600,
      480 + Math.random() * 420,
      (Math.random() - 0.5) * 5600,
    );
    clouds.push(s);
    group.add(s);
  }

  // ----------------------------------------------------------------- Felsen --
  if (spec.rocks > 0) {
    const rockGeo = new THREE.IcosahedronGeometry(1, 0);
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x8a8378, flatShading: true });
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, spec.rocks);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    const p = new THREE.Vector3();
    let placed = 0;
    for (let i = 0; i < spec.rocks * 3 && placed < spec.rocks; i++) {
      const x = (Math.random() - 0.5) * 4800;
      const z = (Math.random() - 0.5) * 4800;
      const h = terrain.height(x, z);
      if (h < 3) continue; // nicht im Wasser
      p.set(x, h + 0.4, z);
      scl.set(1.6 + Math.random() * 5, 1.2 + Math.random() * 4, 1.6 + Math.random() * 5);
      q.setFromEuler(new THREE.Euler(Math.random() * 0.5, Math.random() * Math.PI * 2, Math.random() * 0.5));
      m.compose(p, q, scl);
      rocks.setMatrixAt(placed++, m);
    }
    rocks.count = placed;
    group.add(rocks);
  }

  // ------------------------------------------------------------- zugefrorener See --
  if (spec.water.enabled && spec.water.frozen && spec.terrain.lakeRadius > 0) {
    const iceY = terrain.height(spec.terrain.lakeX, spec.terrain.lakeZ);
    const ice = new THREE.Mesh(
      new THREE.CircleGeometry(spec.terrain.lakeRadius, 36),
      new THREE.MeshStandardMaterial({ color: 0xcfe0e8, roughness: 0.25, metalness: 0.1 }),
    );
    ice.rotation.x = -Math.PI / 2;
    ice.position.set(spec.terrain.lakeX, iceY + 0.35, spec.terrain.lakeZ);
    group.add(ice);
  }

  const terrainHeight = (x: number, z: number) => terrain.height(x, z);

  return {
    group,
    terrainHeight,
    hasWater: spec.water.enabled && !spec.water.frozen,
    waterLevel: 0,
    update(dt: number): void {
      // Wolken driften träge Richtung +X und wrappen am Rand
      for (const c of clouds) {
        c.position.x += 6 * dt;
        if (c.position.x > 3000) c.position.x = -3000;
      }
    },
    dispose(): void {
      geo.dispose();
      water?.geometry.dispose();
      for (const c of clouds) (c.material as THREE.SpriteMaterial).dispose();
      cloudTex.dispose();
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const mat = o.material;
          if (Array.isArray(mat)) mat.forEach((mm) => mm.dispose());
          else mat.dispose();
        }
      });
    },
  };
}

/** Szehnt Himmel & Nebel auf die Szene (Engine ruft das beim Weltbau). */
export function applyAtmosphere(scene: THREE.Scene, spec: WorldSpec): () => void {
  const skyTex = makeSkyTexture(spec.sky.topColor, spec.sky.horizonColor);
  scene.background = skyTex;
  scene.fog = new THREE.Fog(spec.fog.color, spec.fog.near, spec.fog.far);
  return () => {
    scene.background = null;
    scene.fog = null;
    skyTex.dispose();
  };
}
