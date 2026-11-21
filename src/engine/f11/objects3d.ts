/**
 * Vistas 3D procedurales de F11: tanque de vidrio con su líquido (nivel, oleaje y color según agua o salmuera), escala
 * de nivel impresa, canilla, depósito de salmuera con bomba y canilla de servicio, desagüe con manguera al balde,
 * agitador; puente-guía con traba, varilla de la sonda con su regla de inmersión, porta-sonda con puerto de
 * calibración y registrador; estante con el bloque, la botella lastrable y el bloque de aluminio; caja de lastres,
 * balanza, probeta, vaso de rebose con su pico y colector, y soporte con brazo regulable y dinamómetro de 0–20 N.
 * SOLO leen el estado; cada pieza funcional tiene un colisionador invisible simple (`userData {objId, part}`).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { F11Object, FloatId } from '../../simulation/f11-world/types';
import { GEOF11 } from '../../simulation/f11-world/geometry';
import { solidOf } from '../../simulation/f11-world/conservation';
import { balanceDisplayF11, dynDisplayF11, probeDisplayF11, probeResF11, waveEtaF11 } from '../../simulation/f11-world/world';
import type { QualityLevel } from '../quality';
import { materials } from '../renderers/materials';
import { lcdTexture } from '../renderers/textures';
import type { FrameCtxF } from './F11Lab3D';
import { BALANCE_PAN_Z, DEG, armZ, canSurfaceZ, dynHookRoom, guideRoom, homeOf, objRoom, tankSurfaceZ } from './layout';

export interface ObjHandleF {
  group: THREE.Group;
  update(ctx: FrameCtxF, o: F11Object): void;
  dispose(): void;
}

const hitMat = () => materials('LOW').hit;
const G = GEOF11;
const T = G.tank;
/** Colector (vaso de precipitado chico). */
export const CATCH = { r: 4.5, h: 9 };

function hit(geo: THREE.BufferGeometry, objId: string, part?: string): THREE.Mesh {
  const m = new THREE.Mesh(geo, hitMat());
  m.userData = { objId, part };
  return m;
}

function at<O extends THREE.Object3D>(o: O, x: number, y: number, z: number): O {
  o.position.set(x, y, z);
  return o;
}

function shadowed<O extends THREE.Object3D>(o: O): O {
  o.traverse((c) => {
    (c as THREE.Mesh).castShadow = true;
    (c as THREE.Mesh).receiveShadow = true;
  });
  return o;
}

function selRing(r: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.92, r, 48), new THREE.MeshBasicMaterial({ color: 0xffb000, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.06;
  m.visible = false;
  return m;
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Pieza entre dos puntos de la escena (hilo, cable, chorro). */
function stretchC(m: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
  const d = b.clone().sub(a);
  const len = Math.max(0.01, d.length());
  m.scale.set(1, len, 1);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  m.position.copy(a).add(b).multiplyScalar(0.5);
}

/**
 * Escala vertical impresa (cm): `lenCm` de alto, números cada `every` cm, divisiones de 1 cm y (si `mm`) de 1 mm.
 * `light` = fondo transparente con trazo oscuro (para pegar sobre vidrio).
 */
function vScaleTexture(lenCm: number, every = 5, mm = true, light = false, unit = ''): THREE.CanvasTexture {
  const k = 20;
  const H = Math.round(lenCm * k);
  const W = 64;
  return canvasTex(W, H, (g) => {
    if (!light) {
      g.fillStyle = '#f4f1e6';
      g.fillRect(0, 0, W, H);
    }
    g.strokeStyle = '#13212e';
    g.fillStyle = '#13212e';
    g.font = 'bold 18px sans-serif';
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    const step = mm ? 1 : 10;
    for (let t = 0; t <= lenCm * 10; t += step) {
      const y = H - Math.max(1, Math.min(H - 1, t * (k / 10)));
      const major = t % (every * 10) === 0;
      g.lineWidth = major ? 2.5 : t % 10 === 0 ? 1.6 : 1;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(major ? 30 : t % 10 === 0 ? 20 : t % 5 === 0 ? 13 : 8, y);
      g.stroke();
      if (major && t > 0 && t < lenCm * 10) g.fillText(`${t / 10}${unit}`, W - 2, y);
    }
  });
}

/** Escala vertical del dinamómetro de 0–20 N (cero arriba, divisiones de 0,1 N). */
function dynScaleTexture(rangeN: number): THREE.CanvasTexture {
  const W = 64;
  const H = 640;
  return canvasTex(W, H, (g) => {
    g.fillStyle = '#f7f3e4';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#1b2733';
    g.fillStyle = '#1b2733';
    g.font = 'bold 18px sans-serif';
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    const n = Math.round(rangeN / 0.1);
    for (let i = 0; i <= n; i++) {
      const y = 12 + (i / n) * (H - 24);
      const major = i % 10 === 0;
      g.lineWidth = major ? 2.5 : i % 5 === 0 ? 1.5 : 0.8;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(major ? 26 : i % 5 === 0 ? 16 : 9, y);
      g.stroke();
      if (major && i % 20 === 0) g.fillText(`${i / 10}`, W - 4, y);
    }
  });
}

const WATER = new THREE.Color(0x6fb6e0);
const BRINE = new THREE.Color(0x5fbfa6);

export function createObjVisualF(o: F11Object, w0: FrameCtxF['world'], q: QualityLevel, _ghost?: () => { id: string; x: number; y: number; z: number } | null): ObjHandleF {
  const mats = materials(q);
  const seg = q === 'LOW' ? 18 : q === 'MEDIUM' ? 28 : 44;
  const group = new THREE.Group();
  const disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];
  let ring: THREE.Mesh | null = null;
  let update: ObjHandleF['update'] = () => undefined;
  let place: ((ctx: FrameCtxF, ob: F11Object) => boolean) | null = null;
  const id = o.id;
  const own = <M extends THREE.Material | THREE.Texture>(m: M): M => {
    disposables.push(m);
    return m;
  };
  const red = own(new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.45 }));
  const green = own(new THREE.MeshStandardMaterial({ color: 0x2e9d57, roughness: 0.45 }));
  const brass = own(new THREE.MeshStandardMaterial({ color: 0xb8913a, metalness: 0.8, roughness: 0.3 }));
  const cord = own(new THREE.MeshStandardMaterial({ color: 0xf4f0e0, roughness: 0.8 }));
  const cable = own(new THREE.MeshStandardMaterial({ color: 0x222831, roughness: 0.6 }));
  const hose = own(new THREE.MeshStandardMaterial({ color: 0xd9e2e8, roughness: 0.3, transparent: true, opacity: 0.8 }));
  const liquidMat = () => own(new THREE.MeshPhysicalMaterial({ color: WATER.clone(), roughness: 0.08, transmission: 0, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide }));
  const streamMat = own(new THREE.MeshStandardMaterial({ color: 0x9fd2f0, roughness: 0.1, transparent: true, opacity: 0.6, depthWrite: false }));
  const body = new THREE.Group();
  group.add(body);
  const lcdScreen = (w: number, h: number, pw = 256, ph = 96) => {
    const lcd = lcdTexture(pw, ph);
    own(lcd.texture);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), own(new THREE.MeshBasicMaterial({ map: lcd.texture })));
    return { lcd, mesh: m };
  };
  const button = (r: number, mat: THREE.Material) => shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.6, 14), mat));
  const ledMat = () => own(new THREE.MeshBasicMaterial({ color: 0x444444 }));
  const setLed = (m: THREE.Mesh, c: number) => (m.material as THREE.MeshBasicMaterial).color.setHex(c);
  const setMat = (m: THREE.Mesh, mat: THREE.Material) => {
    if (m.material !== mat) m.material = mat;
  };
  const roomLevel: THREE.Object3D[] = [];
  const roomObj = <O extends THREE.Object3D>(x: O): O => {
    roomLevel.push(x);
    return x;
  };
  /** Cordón, cable o chorro: cilindro fino que se estira entre dos puntos de la sala. */
  const strand = (mat: THREE.Material, r = 0.1) => roomObj(new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 6), mat));
  const v3 = (p: { x: number; y: number; z: number }) => new THREE.Vector3(p.x, p.z, -p.y);
  const placeAt = (p: { x: number; y: number; z: number }) => group.position.set(p.x, p.z, -p.y);
  const stream = (on: boolean, m: THREE.Mesh, a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => {
    m.visible = on;
    if (on) stretchC(m, v3(a), v3(b));
  };
  /** Color del líquido del tanque según la mezcla. */
  const tint = (mat: THREE.MeshPhysicalMaterial, fracB: number) => mat.color.copy(WATER).lerp(BRINE, Math.max(0, Math.min(1, fracB)));

  /** Bloque / botella que se lee por calado: escala impresa en la cara frontal. */
  const floatBody = (fid: FloatId) => {
    const s = solidOf(w0, fid);
    const inner = new THREE.Group();
    if (fid === 'bottle1') {
      const r = s.footprint / 2;
      const glass = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r, r, s.H - 1.2, seg), own(new THREE.MeshPhysicalMaterial({ color: 0xdfeff7, roughness: 0.1, transparent: true, opacity: 0.45, depthWrite: false }))));
      glass.position.y = (s.H - 1.2) / 2;
      const cap = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, 1.2, 16), mats.plasticBlue));
      cap.position.y = s.H - 0.6;
      const ballast = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.88, r * 0.88, 1, seg), mats.darkMetal));
      ballast.userData.ballast = true;
      const scale = new THREE.Mesh(new THREE.PlaneGeometry(1.4, s.H - 1.2), own(new THREE.MeshBasicMaterial({ map: own(vScaleTexture(s.H - 1.2, 5, true, true)), transparent: true, depthWrite: false })));
      scale.position.set(0, (s.H - 1.2) / 2, r + 0.03);
      inner.add(glass, cap, ballast, scale);
      inner.add(at(hit(new THREE.CylinderGeometry(r + 0.3, r + 0.3, s.H, 12), id, 'body'), 0, s.H / 2, 0));
      inner.add(at(hit(new THREE.CylinderGeometry(r * 0.7, r * 0.7, 1.6, 10), id, 'cap'), 0, s.H - 0.4, 0));
      return { inner, ballast, H: s.H, r };
    }
    const p = fid === 'alu1' ? w0.params.alu : w0.params.block;
    const mat = fid === 'alu1' ? mats.steel : own(new THREE.MeshStandardMaterial({ color: p.rho > 1000 ? 0x8f9aa6 : 0xc79a5b, roughness: 0.7 }));
    const box = shadowed(new THREE.Mesh(new RoundedBoxGeometry(p.L, p.H, p.W, 2, 0.25), mat));
    box.position.y = p.H / 2;
    inner.add(box);
    if (fid === 'float1') {
      const scale = new THREE.Mesh(new THREE.PlaneGeometry(1.6, p.H), own(new THREE.MeshBasicMaterial({ map: own(vScaleTexture(p.H, 1, true, true)), transparent: true, depthWrite: false })));
      scale.position.set(-p.L / 2 + 1.2, p.H / 2, p.W / 2 + 0.03);
      inner.add(scale);
    }
    const eye = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.14, 6, 12), mats.steel));
    eye.position.y = p.H + 0.6;
    inner.add(eye);
    inner.add(at(hit(new THREE.BoxGeometry(p.L + 0.4, p.H + 0.4, p.W + 0.4), id, 'body'), 0, p.H / 2, 0));
    return { inner, ballast: null as THREE.Mesh | null, H: p.H, r: p.L / 2 };
  };

  switch (o.kind) {
    case 'tank': {
      // Tanque de vidrio de 60 × 35 × 45 cm interiores con marco, líquido, rebosadero y charco si hubo derrame.
      const Lx = T.L + 2 * T.wall;
      const Wy = T.W + 2 * T.wall;
      const glass = new THREE.Mesh(new THREE.BoxGeometry(Lx, T.H, Wy), mats.glass);
      glass.position.y = T.floorZ + T.H / 2;
      glass.renderOrder = 3;
      const base = shadowed(new THREE.Mesh(new THREE.BoxGeometry(Lx + 1, T.floorZ, Wy + 1), mats.darkMetal));
      base.position.y = T.floorZ / 2;
      const frame: THREE.Mesh[] = [];
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        const e = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.2, T.H, 1.2), mats.darkMetal));
        e.position.set((sx * Lx) / 2, T.floorZ + T.H / 2, (sy * Wy) / 2);
        frame.push(e);
      }
      for (const sy of [-1, 1]) {
        const e = shadowed(new THREE.Mesh(new THREE.BoxGeometry(Lx + 1.2, 1.2, 1.2), mats.darkMetal));
        e.position.set(0, T.floorZ + T.H, (sy * Wy) / 2);
        frame.push(e);
      }
      for (const sx of [-1, 1]) {
        const e = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, Wy + 1.2), mats.darkMetal));
        e.position.set((sx * Lx) / 2, T.floorZ + T.H, 0);
        frame.push(e);
      }
      const liquid = new THREE.Mesh(new THREE.BoxGeometry(T.L - 0.05, 1, T.W - 0.05), liquidMat());
      liquid.renderOrder = 2;
      const surf = new THREE.Mesh(new THREE.PlaneGeometry(T.L - 0.1, T.W - 0.1, 12, 6), own(new THREE.MeshPhysicalMaterial({ color: 0xbfe3f5, roughness: 0.05, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide })));
      surf.rotation.x = -Math.PI / 2;
      surf.renderOrder = 2;
      const pipe = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 4, 12), mats.plasticWhite));
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(-Lx / 2 - 2, T.floorZ + w0.params.tank.overflowCm, -Wy / 2 + 6);
      const puddle = roomObj(new THREE.Mesh(new THREE.CircleGeometry(1, 28), own(new THREE.MeshStandardMaterial({ color: 0x9fd2f0, roughness: 0.05, transparent: true, opacity: 0.55 }))));
      puddle.rotation.x = -Math.PI / 2;
      body.add(glass, base, ...frame, liquid, surf, pipe);
      // Solo el marco superior se toca: el vidrio no tapa la sonda ni los objetos que hay adentro.
      for (const sy of [-1, 1]) body.add(at(hit(new THREE.BoxGeometry(Lx + 2, 2, 2.4), id, 'rim'), 0, T.floorZ + T.H, (sy * Wy) / 2));
      for (const sx of [-1, 1]) body.add(at(hit(new THREE.BoxGeometry(2.4, 2, Wy + 2), id, 'rim'), (sx * Lx) / 2, T.floorZ + T.H, 0));
      body.add(at(hit(new THREE.BoxGeometry(Lx + 1, T.floorZ + 0.4, Wy + 1), id, 'base'), 0, T.floorZ / 2, 0));
      const pos = surf.geometry.attributes.position as THREE.BufferAttribute;
      const base0 = Float32Array.from(pos.array as Float32Array);
      place = () => {
        group.position.set(T.x0 + T.L / 2, 0, -(T.y0 + T.W / 2));
        return true;
      };
      update = (ctx) => {
        const w = ctx.world;
        const L = Math.max(0.01, tankSurfaceZ(w) - T.floorZ);
        liquid.visible = L > 0.05;
        liquid.scale.y = L;
        liquid.position.y = T.floorZ + L / 2;
        const vB = w.tank.vol.B / Math.max(1, w.tank.vol.A + w.tank.vol.B);
        tint(liquid.material as THREE.MeshPhysicalMaterial, vB);
        surf.visible = liquid.visible;
        pipe.visible = w.tank.overflowPipe;
        const eta = ctx.reducedMotion ? 0 : waveEtaF11(w);
        surf.position.y = T.floorZ + L + eta;
        // Oleaje: una onda estacionaria a lo largo del tanque; el agitador agrega rizos.
        const amp = Math.abs(eta) > 1e-4 || w.valves.agitator ? 1 : 0;
        for (let i = 0; i < pos.count; i++) {
          const x = base0[i * 3];
          const y = base0[i * 3 + 1];
          const z = amp ? eta * 2 * Math.cos((Math.PI * (x + T.L / 2)) / T.L) + (w.valves.agitator ? 0.15 * Math.sin(x * 0.8 + w.timeS * 9) * Math.cos(y * 0.6) : 0) : 0;
          pos.setZ(i, z);
        }
        pos.needsUpdate = true;
        const sp = w.spill.A + w.spill.B;
        puddle.visible = sp > 1;
        if (puddle.visible) {
          const r = Math.min(22, Math.sqrt(sp / 0.15 / Math.PI));
          puddle.scale.setScalar(r);
          puddle.position.set(T.x0 + T.L / 2, 0.08, -(T.y0 - 4 - r * 0.3));
        }
      };
      break;
    }
    case 'scale': {
      // Escala de nivel de 0–45 cm impresa en la pared frontal (cero en el fondo interior).
      const face = new THREE.Mesh(new THREE.PlaneGeometry(2.2, T.H), own(new THREE.MeshBasicMaterial({ map: own(vScaleTexture(T.H, 5, true, true)), transparent: true, depthWrite: false })));
      face.position.set(0, T.H / 2, 0.05);
      face.renderOrder = 4;
      body.add(face, at(hit(new THREE.BoxGeometry(3.2, T.H, 1), id, 'scale'), 0, T.H / 2, 0.3));
      place = () => {
        group.position.set(T.x0 + G.scaleX, T.floorZ, -(T.y0 - T.wall - 0.06));
        return true;
      };
      break;
    }
    case 'tap': {
      // Canilla de agua de red detrás del tanque: caño, pico sobre el agua y manija (verde abierta, roja cerrada).
      const pole = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, G.tap.z, 14), mats.chrome));
      pole.position.y = -G.tap.z / 2;
      const arm = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 10, 14), mats.chrome));
      arm.rotation.x = Math.PI / 2;
      arm.position.set(0, 0, 5);
      const spout = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 3, 14), mats.chrome));
      spout.position.set(0, -1.5, 10);
      const handle = shadowed(new THREE.Mesh(new THREE.BoxGeometry(5, 1, 1.4), red));
      handle.position.set(0, 1.6, 0);
      body.add(pole, arm, spout, handle);
      body.add(at(hit(new THREE.BoxGeometry(6, 3, 3), id, 'handle'), 0, 1.6, 0), at(hit(new THREE.BoxGeometry(2.4, 3, 12), id, 'body'), 0, 0, 5));
      const jet = strand(streamMat, 0.45);
      place = () => {
        placeAt(G.tap);
        return true;
      };
      update = (ctx) => {
        const w = ctx.world;
        setMat(handle, w.valves.tap ? green : red);
        handle.rotation.y = w.valves.tap ? Math.PI / 2 : 0;
        stream(w.valves.tap, jet, { x: G.tap.x, y: G.tap.y - 10, z: G.tap.z - 3 }, { x: G.tap.x, y: G.tap.y - 10, z: tankSurfaceZ(w) });
      };
      break;
    }
    case 'reservoir': {
      // Depósito de salmuera (bidón con visor) con canilla de servicio para llenar la probeta.
      const R = G.reservoir;
      const can = shadowed(new THREE.Mesh(new RoundedBoxGeometry(R.w, R.h, R.d, 2, 1), own(new THREE.MeshPhysicalMaterial({ color: 0xe8f1f4, roughness: 0.3, transparent: true, opacity: 0.45, depthWrite: false }))));
      can.position.y = R.h / 2;
      const liq = new THREE.Mesh(new THREE.BoxGeometry(R.w - 1, 1, R.d - 1), liquidMat());
      tint(liq.material as THREE.MeshPhysicalMaterial, 1);
      const spigot = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 3, 10), mats.plasticBlue));
      spigot.rotation.x = Math.PI / 2;
      spigot.position.set(-R.w / 2 + 4, 4, R.d / 2 + 1.5);
      body.add(can, liq, spigot);
      body.add(at(hit(new THREE.BoxGeometry(R.w, R.h, R.d), id, 'body'), 0, R.h / 2, 0), at(hit(new THREE.BoxGeometry(3, 3, 4), id, 'spigot'), -R.w / 2 + 4, 4, R.d / 2 + 1.5));
      update = (ctx) => {
        const w = ctx.world;
        const h = Math.max(0.01, Math.min(1, w.resB / w.params.resB0)) * (R.h - 2);
        liq.scale.y = h;
        liq.position.y = 1 + h / 2;
        liq.visible = w.resB > 1;
      };
      break;
    }
    case 'pump': {
      // Bomba de la salmuera con su botón y LED; manguera hasta el borde del tanque.
      const box = shadowed(new THREE.Mesh(new RoundedBoxGeometry(8, 5, 6, 2, 0.6), own(new THREE.MeshStandardMaterial({ color: 0x2b3a4a, roughness: 0.5 }))));
      box.position.y = 2.5;
      const btn = button(1.1, mats.rubberRed);
      btn.position.set(0, 5.2, 0);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), ledMat());
      led.position.set(2.6, 3, 3.1);
      body.add(box, btn, led, at(hit(new THREE.BoxGeometry(8, 6, 6), id, 'switch'), 0, 3, 0));
      const tube = strand(hose, 0.5);
      const tube2 = strand(hose, 0.5);
      const jet = strand(streamMat, 0.4);
      const outlet = { x: T.x0 + T.L - 3, y: T.y0 + T.W - 5, z: T.floorZ + T.H + 3 };
      update = (ctx) => {
        const w = ctx.world;
        setLed(led, w.valves.pump ? 0x34c759 : 0x444444);
        const p0 = { x: G.reservoir.x - 4, y: G.reservoir.y, z: G.reservoir.h + 4 };
        const mid = { x: T.x0 + T.L + 4, y: outlet.y, z: T.floorZ + T.H + 8 };
        stretchC(tube, v3(p0), v3(mid));
        stretchC(tube2, v3(mid), v3(outlet));
        stream(w.valves.pump, jet, outlet, { ...outlet, z: tankSurfaceZ(w) });
      };
      break;
    }
    case 'drain': {
      // Llave de vaciado en la pared derecha y manguera al balde de residuos.
      const valve = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 3, 12), brass));
      valve.rotation.z = Math.PI / 2;
      const lever = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.8, 4, 0.8), red));
      lever.position.set(0.8, 2, 0);
      body.add(valve, lever, at(hit(new THREE.BoxGeometry(4, 6, 3), id, 'lever'), 0.6, 1.5, 0));
      const tube = strand(hose, 0.6);
      const jet = strand(streamMat, 0.4);
      update = (ctx) => {
        const w = ctx.world;
        setMat(lever, w.valves.drain ? green : red);
        lever.rotation.z = w.valves.drain ? -Math.PI / 2 : 0;
        const a = { x: G.drain.x + 1.5, y: G.drain.y, z: G.drain.z };
        const b = { x: G.waste.x - 4, y: G.waste.y + 2, z: G.waste.h + 1 };
        stretchC(tube, v3(a), v3(b));
        stream(w.valves.drain, jet, b, { ...b, z: 3 });
      };
      break;
    }
    case 'waste': {
      // Balde de residuos con su nivel.
      const Wb = G.waste;
      const pail = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(Wb.r, Wb.r * 0.85, Wb.h, seg, 1, true), own(new THREE.MeshStandardMaterial({ color: 0x3d6f9e, roughness: 0.6, side: THREE.DoubleSide }))));
      pail.position.y = Wb.h / 2;
      const bottom = new THREE.Mesh(new THREE.CircleGeometry(Wb.r * 0.85, seg), pail.material);
      bottom.rotation.x = -Math.PI / 2;
      bottom.position.y = 0.2;
      const liq = new THREE.Mesh(new THREE.CylinderGeometry(Wb.r * 0.95, Wb.r * 0.86, 1, seg), liquidMat());
      body.add(pail, bottom, liq, at(hit(new THREE.CylinderGeometry(Wb.r, Wb.r, Wb.h, 12), id, 'body'), 0, Wb.h / 2, 0));
      update = (ctx) => {
        const w = ctx.world;
        const v = w.waste.A + w.waste.B;
        const h = Math.min(Wb.h - 1, (v / 120000) * Wb.h);
        liq.visible = h > 0.1;
        liq.scale.y = Math.max(0.01, h);
        liq.position.y = 0.3 + h / 2;
        tint(liq.material as THREE.MeshPhysicalMaterial, w.waste.B / Math.max(1, v));
      };
      break;
    }
    case 'agitator': {
      // Agitador de hélice sobre el borde trasero: motor, interruptor y varilla que gira dentro del tanque.
      const motor = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 6, 16), own(new THREE.MeshStandardMaterial({ color: 0x55606b, roughness: 0.5 }))));
      motor.position.y = 5;
      const clamp = shadowed(new THREE.Mesh(new THREE.BoxGeometry(4, 2, 5), mats.darkMetal));
      clamp.position.set(0, 1, 2);
      const rod = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 32, 8), mats.steel));
      rod.position.y = 2 - 16;
      const prop = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const b = shadowed(new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.2, 1.2), mats.steel));
        b.position.x = 1.6;
        const arm = new THREE.Group();
        arm.rotation.y = (i * 2 * Math.PI) / 3;
        b.rotation.x = 0.4;
        arm.add(b);
        prop.add(arm);
      }
      prop.position.y = 2 - 30;
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), ledMat());
      led.position.set(0, 8.4, 0);
      body.add(motor, clamp, rod, prop, led, at(hit(new THREE.CylinderGeometry(2.6, 2.6, 8, 10), id, 'switch'), 0, 5, 0));
      let ang = 0;
      update = (ctx) => {
        const w = ctx.world;
        setLed(led, w.valves.agitator ? 0x34c759 : 0x444444);
        if (w.valves.agitator && !ctx.reducedMotion) ang += ctx.dt * 30;
        prop.rotation.y = ang;
      };
      break;
    }
    case 'guide': {
      // Puente-guía: dos rieles sobre los bordes y un carro que corre a lo largo, con la traba (roja/verde).
      const Wy = T.W + 2 * T.wall + 3;
      const bridge = shadowed(new THREE.Mesh(new THREE.BoxGeometry(4, 1.2, Wy), own(new THREE.MeshStandardMaterial({ color: 0x9fb1c2, metalness: 0.5, roughness: 0.4 }))));
      bridge.position.y = 0.6;
      const carriage = shadowed(new THREE.Mesh(new RoundedBoxGeometry(5, G.guide.carriageH, 5, 2, 0.5), mats.darkMetal));
      const cz = -(G.guide.y - (T.y0 + T.W / 2));
      carriage.position.set(0, 1.2 + G.guide.carriageH / 2, cz);
      const lock = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 2, 12), red));
      lock.rotation.x = Math.PI / 2;
      lock.position.set(-2.6, 1.2 + G.guide.carriageH / 2, cz + 2.4);
      const ends = [-1, 1].map((s) => at(shadowed(new THREE.Mesh(new THREE.BoxGeometry(5, 3, 2), mats.darkMetal)), 0, -0.6, (s * Wy) / 2));
      body.add(bridge, carriage, lock, ...ends);
      body.add(at(hit(new THREE.BoxGeometry(5, 2, Wy), id, 'bridge'), 0, 0.6, 0), at(hit(new THREE.BoxGeometry(2.6, 2.6, 3), id, 'lock'), -2.6, 1.2 + G.guide.carriageH / 2, cz + 2.4));
      place = (ctx) => {
        placeAt(guideRoom(ctx.world));
        return true;
      };
      update = (ctx) => setMat(lock, ctx.world.probe.locked ? green : red);
      break;
    }
    case 'ruler': {
      // Regla de 1 mm junto a la varilla: 0 en el fondo interior del tanque; el índice de la varilla marca la cota.
      const len = T.H + 4;
      const strip = shadowed(new THREE.Mesh(new THREE.BoxGeometry(2.2, len, 0.3), own(new THREE.MeshStandardMaterial({ color: 0xf4f1e6, roughness: 0.6 }))));
      strip.position.y = len / 2;
      const face = new THREE.Mesh(new THREE.PlaneGeometry(2.1, len), own(new THREE.MeshBasicMaterial({ map: own(vScaleTexture(len, 5, true)) })));
      face.position.set(0, len / 2, 0.17);
      body.add(strip, face, at(hit(new THREE.BoxGeometry(2.6, len, 1), id, 'scale'), 0, len / 2, 0.2));
      place = (ctx) => {
        const g = guideRoom(ctx.world);
        group.position.set(g.x + 1.8, T.floorZ, -(G.guide.y - 1.2));
        return true;
      };
      break;
    }
    case 'probe': {
      // Sonda hidrostática: membrana en la punta, varilla con índice, botón de purga y cable al registrador.
      const L = G.guide.rodLen;
      const tip = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 2.4, 16), own(new THREE.MeshStandardMaterial({ color: 0x2d3640, roughness: 0.4 }))));
      tip.position.y = 1.2;
      const membrane = new THREE.Mesh(new THREE.CircleGeometry(1, 16), brass);
      membrane.rotation.x = Math.PI / 2;
      membrane.position.y = 0.01;
      const rod = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, L, 10), mats.steel));
      rod.position.y = 2.4 + L / 2;
      const index = shadowed(new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.18, 0.4), red));
      index.position.set(1.6, 0, 0);
      const purge = button(0.8, mats.plasticYellow);
      purge.position.y = 2.4 + L + 0.3;
      const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8), own(new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0, transparent: true, opacity: 0.7 })));
      bubble.position.set(0, -0.3, 0);
      body.add(tip, membrane, rod, index, purge, bubble);
      body.add(at(hit(new THREE.CylinderGeometry(1.4, 1.4, 3, 10), id, 'body'), 0, 1.2, 0));
      body.add(at(hit(new THREE.CylinderGeometry(1.2, 1.2, L, 8), id, 'rod'), 0, 2.4 + L / 2, 0));
      body.add(at(hit(new THREE.CylinderGeometry(1.3, 1.3, 1.6, 10), id, 'purge'), 0, 2.4 + L + 0.3, 0));
      const lead = strand(cable, 0.14);
      update = (ctx) => {
        const w = ctx.world;
        const inGuide = w.probe.mount === 'guide' && ctx.world.objects.probe01.support !== 'hand';
        // El índice queda a la altura de la regla (cota de la membrana sobre el fondo + borde superior).
        index.visible = inGuide;
        index.position.y = T.floorZ + T.H + 2 - (group.position.y);
        bubble.visible = w.probe.bubble;
        if (inGuide) index.position.y = Math.max(2.6, Math.min(2.4 + L, T.floorZ + T.H + 1 - group.position.y));
        lead.visible = w.probe.connected;
        if (lead.visible) {
          const top = { x: group.position.x, y: -group.position.z, z: group.position.y + 2.4 + L };
          stretchC(lead, v3(top), v3({ x: G.logger.x - 6, y: G.logger.y - G.logger.d / 2, z: 2 }));
        }
      };
      ring = selRing(2.5);
      group.add(ring);
      break;
    }
    case 'holder': {
      // Porta-sonda con el puerto de calibración (columna de agua de referencia).
      const base = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(5, 5.5, 1.2, seg), mats.darkMetal));
      base.position.y = 0.6;
      const col = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 14, 16, 1, true), own(new THREE.MeshPhysicalMaterial({ color: 0xdfeff7, roughness: 0.1, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide }))));
      col.position.y = 8;
      const port = shadowed(new THREE.Mesh(new THREE.BoxGeometry(3, 2.4, 2), mats.plasticBlue));
      port.position.set(3.5, 2.4, 2.4);
      body.add(base, col, port);
      body.add(at(hit(new THREE.CylinderGeometry(2.4, 2.4, 14, 10), id, 'body'), 0, 8, 0), at(hit(new THREE.BoxGeometry(3.4, 3, 2.6), id, 'cal'), 3.5, 2.4, 2.4));
      break;
    }
    case 'logger': {
      // Registrador: pantalla en kPa, puerto de la sonda con LED, botones de ritmo, rango, cero y serie.
      const Lg = G.logger;
      const box = shadowed(new THREE.Mesh(new RoundedBoxGeometry(Lg.w, Lg.h, Lg.d, 2, 0.6), own(new THREE.MeshStandardMaterial({ color: 0x2b3a4a, roughness: 0.5 }))));
      box.position.y = Lg.h / 2;
      const { lcd, mesh } = lcdScreen(14, 3.6, 380, 100);
      mesh.position.set(0, Lg.h * 0.68, Lg.d / 2 + 0.02);
      body.add(box, mesh, at(hit(new THREE.BoxGeometry(14, 3.6, 1), id, 'screen'), 0, Lg.h * 0.68, Lg.d / 2 + 0.3));
      const port = button(0.8, mats.plasticYellow);
      port.rotation.x = Math.PI / 2;
      port.position.set(-6, 1.6, Lg.d / 2 + 0.2);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), ledMat());
      led.position.set(-4.6, 1.6, Lg.d / 2 + 0.1);
      body.add(port, led, at(hit(new THREE.BoxGeometry(2.6, 2.4, 1.6), id, 'port'), -6, 1.6, Lg.d / 2 + 0.3));
      const tops: Array<[string, number, THREE.Material]> = [['rate', -6, mats.plasticBlue], ['range', -2, mats.plasticWhite], ['zero', 2, mats.plasticYellow], ['series', 6, mats.rubberRed]];
      for (const [part, x, mat] of tops) {
        const b = button(0.9, mat);
        b.position.set(x, Lg.h, -Lg.d / 2 + 3);
        body.add(b, at(hit(new THREE.BoxGeometry(2.8, 1.6, 2.8), id, part), x, Lg.h, -Lg.d / 2 + 3));
      }
      body.add(at(hit(new THREE.BoxGeometry(Lg.w, Lg.h, Lg.d), id, 'body'), 0, Lg.h / 2, 0));
      update = (ctx) => {
        const w = ctx.world;
        const pr = w.probe;
        setLed(led, pr.connected ? 0x34c759 : 0x444444);
        if (!pr.connected) return lcd.set('----', '#8892a0', `${w.logger.rateHz} Hz · SIN SONDA`);
        const v = probeDisplayF11(w);
        const res = probeResF11(w);
        const dec = Math.max(0, Math.round(-Math.log10(res)));
        const tag = pr.absolute ? 'ABS' : pr.zeroed ? 'REL' : 'SIN CERO';
        lcd.set(`${v.toFixed(dec)} kPa`, pr.zeroed || pr.absolute ? '#6ef09a' : '#f0c36e', `${w.logger.rateHz} Hz · ${tag} · serie ${w.series.id} (${w.series.n})`);
      };
      break;
    }
    case 'towel': {
      const cloth = shadowed(new THREE.Mesh(new THREE.BoxGeometry(12, 0.8, 9), own(new THREE.MeshStandardMaterial({ color: 0x7fb3d5, roughness: 0.95 }))));
      cloth.position.y = 0.4;
      body.add(cloth, at(hit(new THREE.BoxGeometry(12, 1.6, 9), id, 'body'), 0, 0.8, 0));
      break;
    }
    case 'rack': {
      // Estante de objetos.
      const R = G.rack;
      const top = shadowed(new THREE.Mesh(new THREE.BoxGeometry(R.w, 1, R.d), mats.wood));
      top.position.y = R.h - 0.5;
      const legs = [-1, 1].map((s) => at(shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.4, R.h - 1, R.d), mats.wood)), (s * (R.w - 1.4)) / 2, (R.h - 1) / 2, 0));
      body.add(top, ...legs, at(hit(new THREE.BoxGeometry(R.w, R.h, R.d), id, 'body'), 0, R.h / 2, 0));
      break;
    }
    case 'floater':
    case 'bottle':
    case 'block': {
      const fid = id as FloatId;
      const fb = floatBody(fid);
      body.add(fb.inner);
      // Hilo de seguridad (si quedó atado, el objeto no flota libre) y asa para sacarlo del tanque.
      const thread = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1, 5), cord));
      const threadHit = hit(new THREE.BoxGeometry(1.6, 1, 1.6), id, 'thread');
      body.add(thread, threadHit);
      const hang = strand(cord, 0.08);
      update = (ctx) => {
        const w = ctx.world;
        const f = w.floats[fid];
        const inTank = f.where === 'tank' && w.objects[fid].support !== 'hand';
        const rim = T.floorZ + T.H + 4;
        const len = Math.max(0.5, rim - group.position.y - fb.H);
        thread.visible = threadHit.visible = inTank;
        thread.scale.y = threadHit.scale.y = len;
        thread.position.y = threadHit.position.y = fb.H + len / 2;
        (thread.material as THREE.MeshStandardMaterial).color.setHex(f.tethered ? 0xd04a3a : 0xf4f0e0);
        if (fb.ballast) {
          const g = f.ballastG;
          fb.ballast.visible = g > 0;
          const h = Math.max(0.05, (g / 400) * 4);
          fb.ballast.scale.y = h;
          fb.ballast.position.y = 0.2 + h / 2;
        }
        const hung = f.where === 'dyn' && w.objects[fid].support !== 'hand';
        hang.visible = hung;
        if (hung) {
          const h = dynHookRoom(w);
          stretchC(hang, v3(h), v3({ x: h.x, y: h.y, z: group.position.y + fb.H + 0.6 }));
        }
        // Al dejar el tanque, el objeto mojado deja de mecerse; en el agua se balancea apenas al asentarse.
        const sway = inTank && Math.abs(f.v) > 0.05 && !ctx.reducedMotion ? Math.sin(w.timeS * 6) * Math.min(0.08, Math.abs(f.v) * 0.02) : 0;
        body.rotation.z = sway;
      };
      ring = selRing(fb.r + 1.2);
      group.add(ring);
      break;
    }
    case 'ballast': {
      // Caja de lastres (perdigones en bolsitas de 100 g): un clic cambia el lastre de la botella.
      const box = shadowed(new THREE.Mesh(new THREE.BoxGeometry(8, 3, 6), mats.wood));
      box.position.y = 1.5;
      body.add(box);
      for (let i = 0; i < 4; i++) {
        const bag = shadowed(new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 8), mats.darkMetal));
        bag.scale.y = 0.6;
        bag.position.set(-2.7 + i * 1.8, 3.2, 0);
        body.add(bag);
      }
      body.add(at(hit(new THREE.BoxGeometry(8, 4, 6), id, 'body'), 0, 2, 0));
      break;
    }
    case 'balance': {
      // Balanza de 0–2 kg: plato, pantalla y botón de tara.
      const B = G.balance;
      const box = shadowed(new THREE.Mesh(new RoundedBoxGeometry(B.w, B.h, B.d, 2, 0.8), mats.enamel));
      box.position.y = B.h / 2;
      const pan = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 0.6, seg), mats.steel));
      pan.position.set(0, BALANCE_PAN_Z - 0.3, -2);
      const { lcd, mesh } = lcdScreen(10, 2.6, 300, 90);
      mesh.position.set(-2, B.h * 0.55, B.d / 2 + 0.02);
      const tare = button(0.9, mats.plasticBlue);
      tare.rotation.x = Math.PI / 2;
      tare.position.set(6, B.h * 0.55, B.d / 2 + 0.2);
      body.add(box, pan, mesh, tare);
      body.add(at(hit(new THREE.BoxGeometry(B.w, B.h, B.d), id, 'body'), 0, B.h / 2, 0));
      body.add(at(hit(new THREE.CylinderGeometry(7, 7, 1, 12), id, 'pan'), 0, BALANCE_PAN_Z - 0.3, -2));
      body.add(at(hit(new THREE.BoxGeometry(2.6, 2.6, 1.4), id, 'tare'), 6, B.h * 0.55, B.d / 2 + 0.4));
      update = (ctx) => {
        const w = ctx.world;
        const g = balanceDisplayF11(w);
        const res = w.params.balance.resG;
        lcd.set(`${(Math.round(g / res) * res).toFixed(1)} g`, w.balance.zeroed ? '#6ef09a' : '#f0c36e', w.balance.taredWith ? 'TARA' : w.balance.zeroed ? 'CERO' : 'SIN CERO');
      };
      break;
    }
    case 'cylinder': {
      // Probeta de 250 mL con su graduación, el líquido y el menisco.
      const C = G.cylinder;
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(C.r, C.r, C.h, seg, 1, true), mats.glass);
      glass.position.y = C.h / 2 + 1;
      glass.renderOrder = 3;
      const foot = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(C.r * 1.8, C.r * 2, 1, seg), mats.glass));
      foot.position.y = 0.5;
      const liq = new THREE.Mesh(new THREE.CylinderGeometry(C.r - 0.1, C.r - 0.1, 1, seg), liquidMat());
      tint(liq.material as THREE.MeshPhysicalMaterial, 1);
      const scale = new THREE.Mesh(new THREE.PlaneGeometry(1.4, C.h - 4), own(new THREE.MeshBasicMaterial({ map: own(cylScaleTexture(w0.params.cyl.capML)), transparent: true, depthWrite: false })));
      scale.position.set(0, 1.5 + (C.h - 4) / 2, C.r + 0.04);
      scale.renderOrder = 4;
      body.add(glass, foot, liq, scale);
      body.add(at(hit(new THREE.CylinderGeometry(C.r + 0.6, C.r + 0.6, C.h, 10), id, 'body'), 0, C.h / 2 + 1, 0));
      body.add(at(hit(new THREE.CylinderGeometry(C.r + 0.8, C.r + 0.8, 2, 10), id, 'pour'), 0, C.h + 1, 0));
      update = (ctx) => {
        const w = ctx.world;
        const h = (w.cyl.vol / w.params.cyl.capML) * (C.h - 4);
        liq.visible = h > 0.05;
        liq.scale.y = Math.max(0.01, h + 0.5);
        liq.position.y = 1 + (h + 0.5) / 2;
      };
      ring = selRing(C.r * 2.2);
      group.add(ring);
      break;
    }
    case 'can': {
      // Vaso de rebose de Ø 16 cm con el pico a 12 cm y un hilo de agua cuando rebosa.
      const C = G.can;
      const wall = new THREE.Mesh(new THREE.CylinderGeometry(C.r, C.r, C.h, seg, 1, true), mats.glass);
      wall.position.y = C.h / 2;
      wall.renderOrder = 3;
      const bottom = new THREE.Mesh(new THREE.CircleGeometry(C.r, seg), mats.glass);
      bottom.rotation.x = -Math.PI / 2;
      bottom.position.y = 0.2;
      const spoutZ = w0.params.can.spoutCm;
      const dx = G.catchSpout.x - C.x;
      const spout = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, Math.abs(dx) - C.r + 2, 10), mats.glass));
      spout.rotation.z = Math.PI / 2 + 0.25;
      spout.position.set(Math.sign(dx) * (C.r + (Math.abs(dx) - C.r) / 2), spoutZ - 0.6, 0);
      const liq = new THREE.Mesh(new THREE.CylinderGeometry(C.r - 0.1, C.r - 0.1, 1, seg), liquidMat());
      body.add(wall, bottom, spout, liq);
      body.add(at(hit(new THREE.CylinderGeometry(C.r, C.r, C.h, 12), id, 'body'), 0, C.h / 2, 0));
      body.add(at(hit(new THREE.BoxGeometry(4, 3, 4), id, 'fill'), -C.r + 1, C.h + 0.5, 0));
      const jet = strand(streamMat, 0.25);
      update = (ctx) => {
        const w = ctx.world;
        const h = Math.max(0, canSurfaceZ(w));
        liq.visible = h > 0.05;
        liq.scale.y = Math.max(0.01, h);
        liq.position.y = h / 2;
        const drip = w.timeS < w.can.dripUntil;
        const tip = { x: G.catchSpout.x - 1, y: G.catchSpout.y, z: spoutZ - 1.4 };
        stream(drip, jet, tip, { ...tip, z: w.can.catchAt === 'spout' ? 1 + Math.min(CATCH.h - 1, w.can.catchVol / (Math.PI * CATCH.r ** 2)) : 0.2 });
      };
      break;
    }
    case 'catch': {
      // Colector del rebose con su nivel.
      const wall = new THREE.Mesh(new THREE.CylinderGeometry(CATCH.r, CATCH.r * 0.92, CATCH.h, seg, 1, true), mats.glass);
      wall.position.y = CATCH.h / 2;
      wall.renderOrder = 3;
      const bottom = new THREE.Mesh(new THREE.CircleGeometry(CATCH.r * 0.92, seg), mats.glass);
      bottom.rotation.x = -Math.PI / 2;
      bottom.position.y = 0.2;
      const liq = new THREE.Mesh(new THREE.CylinderGeometry(CATCH.r - 0.1, CATCH.r * 0.9, 1, seg), liquidMat());
      body.add(wall, bottom, liq, at(hit(new THREE.CylinderGeometry(CATCH.r + 0.4, CATCH.r + 0.4, CATCH.h, 10), id, 'body'), 0, CATCH.h / 2, 0));
      update = (ctx) => {
        const w = ctx.world;
        const h = Math.min(CATCH.h - 0.5, w.can.catchVol / (Math.PI * CATCH.r ** 2));
        liq.visible = h > 0.05;
        liq.scale.y = Math.max(0.01, h);
        liq.position.y = 0.2 + h / 2;
      };
      ring = selRing(CATCH.r + 1);
      group.add(ring);
      break;
    }
    case 'stand': {
      // Soporte: base, columna con escala de altura, brazo regulable (perilla) hacia el vaso de rebose y botón de cero.
      const S = G.stand;
      const base = shadowed(new THREE.Mesh(new THREE.BoxGeometry(14, 1.6, 12), mats.darkMetal));
      base.position.y = 0.8;
      const colH = S.armZ + 14;
      const col = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, colH, 12), mats.steel));
      col.position.y = colH / 2;
      const scale = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 40), own(new THREE.MeshBasicMaterial({ map: own(vScaleTexture(40, 5, true)) })));
      scale.position.set(1.6, 1.6 + 20 + (S.armZ - 46), 0.9);
      const zero = button(0.8, mats.plasticYellow);
      zero.rotation.x = Math.PI / 2;
      zero.position.set(-4, 1.2, 6.2);
      const dx = G.can.x - S.x;
      const dy = G.can.y - S.y;
      const armLen = Math.hypot(dx, dy);
      const arm = new THREE.Group();
      const bar = shadowed(new THREE.Mesh(new THREE.BoxGeometry(armLen, 1.2, 1.2), mats.steel));
      bar.position.x = armLen / 2;
      const boss = shadowed(new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), mats.darkMetal));
      const knob = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.6, 12), mats.blackPlastic));
      knob.rotation.x = Math.PI / 2;
      knob.position.set(0, 0, 2.2);
      const idx = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 2.6), red));
      idx.position.set(1.6, 0, 0.6);
      arm.add(bar, boss, knob, idx);
      arm.rotation.y = Math.atan2(dy, dx);
      body.add(base, col, scale, zero, arm);
      body.add(at(hit(new THREE.CylinderGeometry(1.6, 1.6, colH, 8), id, 'body'), 0, colH / 2, 0));
      body.add(at(hit(new THREE.BoxGeometry(2.6, 2.6, 1.4), id, 'zero'), -4, 1.2, 6.4));
      const armHit = hit(new THREE.BoxGeometry(armLen, 3, 3), id, 'arm');
      armHit.position.x = armLen / 2;
      arm.add(armHit, at(hit(new THREE.BoxGeometry(4, 4, 5), id, 'arm'), 0, 0, 1));
      update = (ctx) => {
        arm.position.y = armZ(ctx.world);
      };
      break;
    }
    case 'dynamometer': {
      // Dinamómetro de 0–20 N colgado del brazo: tubo con escala, indicador, perilla de cero, gancho y guía de plomada.
      const L = G.stand.dynLen;
      const tube = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, L, 20), own(new THREE.MeshStandardMaterial({ color: 0xf2f0e8, roughness: 0.4, transparent: true, opacity: 0.88 }))));
      tube.position.y = -L / 2;
      const face = new THREE.Mesh(new THREE.PlaneGeometry(1.8, L - 1.5), own(new THREE.MeshBasicMaterial({ map: own(dynScaleTexture(w0.params.dyn.rangeN)) })));
      face.position.set(0, -L / 2, 1.42);
      const pointer = shadowed(new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.2, 0.3), red));
      const zero = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1, 14), mats.plasticBlue));
      zero.position.y = 0.5;
      const hookB = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.16, 6, 12, Math.PI * 1.5), mats.steel));
      hookB.position.y = -L - 0.8;
      const aim = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.8, 3, 0.8), mats.plasticYellow));
      aim.position.set(2.2, -2, 0);
      body.add(tube, face, pointer, zero, hookB, aim);
      body.add(at(hit(new THREE.BoxGeometry(3.4, L, 3.4), id, 'scale'), 0, -L / 2, 0));
      body.add(at(hit(new THREE.BoxGeometry(2.6, 1.6, 2.6), id, 'zero'), 0, 0.5, 0));
      body.add(at(hit(new THREE.BoxGeometry(2, 3.4, 2), id, 'aim'), 2.2, -2, 0));
      body.add(at(hit(new THREE.BoxGeometry(2.4, 2.4, 2.4), id, 'hook'), 0, -L - 0.8, 0));
      place = (ctx) => {
        const w = ctx.world;
        group.position.set(G.can.x, armZ(w), -G.can.y);
        body.rotation.z = w.dyn.aimDeg * DEG;
        const p = w.params;
        const sway = w.dyn.holding && w.timeS - w.dyn.hungAt < 1.5 && !ctx.reducedMotion ? Math.sin(w.timeS * 14) * 0.15 * (1 - (w.timeS - w.dyn.hungAt) / 1.5) : 0;
        const shown = dynDisplayF11(w) + sway;
        pointer.position.set(0, -0.75 - (shown / p.dyn.rangeN) * (L - 1.5), 1.5);
        return true;
      };
      break;
    }
  }

  group.traverse((c) => {
    const m = c as THREE.Mesh;
    if ((m.isMesh || (c as THREE.Line).isLine) && m.geometry) disposables.push(m.geometry);
  });
  for (const r of roomLevel) {
    r.traverse((c) => {
      const m = c as THREE.Mesh;
      if ((m.isMesh || (c as THREE.Line).isLine) && m.geometry) disposables.push(m.geometry);
    });
  }

  // Cordones, cables, chorros y charcos viven en la sala, no dentro del grupo del objeto.
  let detached = false;

  return {
    group,
    update: (ctx, ob) => {
      if (!detached && group.parent) {
        for (const c of roomLevel) group.parent.add(c);
        detached = true;
      }
      if (!(place && place(ctx, ob))) {
        const p = ob.support === 'hand' ? ob.pose : objRoom(ctx.world, id);
        group.position.set(p.x, p.z, -p.y);
        group.rotation.set(0, 0, 0);
      }
      if (ring) ring.visible = ctx.selected === id;
      update(ctx, ob);
    },
    dispose() {
      for (const c of roomLevel) c.parent?.remove(c);
      for (const d of new Set(disposables)) d.dispose();
    },
  };
}

/** Graduación de la probeta: cada 2 mL, números cada 50 mL. */
function cylScaleTexture(capML: number): THREE.CanvasTexture {
  const W = 64;
  const H = 600;
  return canvasTex(W, H, (g) => {
    g.strokeStyle = '#13212e';
    g.fillStyle = '#13212e';
    g.font = 'bold 18px sans-serif';
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    for (let v = 0; v <= capML; v += 2) {
      const y = H - 2 - (v / capML) * (H - 4);
      const major = v % 50 === 0;
      g.lineWidth = major ? 2.5 : v % 10 === 0 ? 1.5 : 0.8;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(major ? 28 : v % 10 === 0 ? 18 : 9, y);
      g.stroke();
      if (major && v > 0) g.fillText(String(v), W - 2, y);
    }
  });
}

export { homeOf };
