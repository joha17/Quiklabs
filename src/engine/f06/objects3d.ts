/**
 * Vistas 3D procedurales de F06: soporte con brazo y gancho, regla de 1 mm con su perilla de ajuste, resortes
 * helicoidales (colgados, en el lanzador o en el estante), porta-pesas y pesas ranuradas; riel de 180 cm con su perfil
 * (llano, subida y parte alta) sobre patas y la columna de elevación con perilla y abrazadera, tope del extremo;
 * lanzador con placa trasera, émbolo, trinquete, gatillo y presilla; sensor de fuerza en la placa y sensor de posición;
 * carro con bandera y ruedas y sus pesas; freno magnético, patín de roce y amortiguador del tramo de pérdidas;
 * fotopuertas en U; medidor de altura; péndulo con su soporte, mordaza, escala, captador de ángulo y compuerta;
 * registrador con pantalla; balanza y estante. SOLO leen el estado; cada pieza funcional tiene un colisionador
 * invisible simple (`userData {objId, part}`).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { F06Object, F06World } from '../../simulation/f06-world/types';
import { GEOF06, trackPoint } from '../../simulation/f06-world/geometry';
import { loadOnBalanceG } from '../../simulation/f06-world/world';
import type { QualityLevel } from '../quality';
import { materials } from '../renderers/materials';
import { lcdTexture } from '../renderers/textures';
import type { FrameCtxF } from './F06Lab3D';
import {
  DEG, bobRoom, cartMassRoom, cartRoom, cartTilt, gateRoom, gaugeX, hangerRoom, objRoom, panRoom, pivotRoom, plungerS, rackSlot, rulerZeroZ, slotRoom, springBottom, standHook, trackAt, trackTilt,
} from './layout';

export interface ObjHandleF {
  group: THREE.Group;
  update(ctx: FrameCtxF, o: F06Object): void;
  dispose(): void;
}

const hitMat = () => materials('LOW').hit;
const TR = GEOF06.track;
const CA = GEOF06.cart;
const LA = GEOF06.launcher;
const ST = GEOF06.stand;
const PD = GEOF06.pend;

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

/**
 * Escala vertical de `lenCm` (de arriba hacia abajo en la textura) con marcas cada mm. `label(cmFromTop)` devuelve
 * el número que corresponde a esa distancia desde el borde superior (o null para no rotular).
 */
function verticalScaleTexture(lenCm: number, label: (cmFromTop: number) => number | null, pxPerCm = 24): THREE.CanvasTexture {
  const H = Math.min(4096, Math.round(lenCm * pxPerCm));
  const k = H / lenCm;
  const W = 96;
  return canvasTex(W, H, (g) => {
    g.fillStyle = '#f4f1e6';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#1b2733';
    g.fillStyle = '#1b2733';
    g.font = 'bold 22px sans-serif';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    for (let mm = 0; mm <= lenCm * 10; mm++) {
      const p = mm * (k / 10);
      const v = label(mm / 10);
      if (v === null) continue;
      const vmm = Math.round(v * 10);
      const major = vmm % 100 === 0;
      const half = vmm % 50 === 0;
      g.lineWidth = major ? 2 : 1;
      g.beginPath();
      g.moveTo(0, p);
      g.lineTo(major ? 40 : half ? 30 : vmm % 10 === 0 ? 22 : 12, p);
      g.stroke();
      if (major) g.fillText(String(vmm / 10), 46, Math.max(12, Math.min(H - 12, p)));
    }
  });
}

/** Hélice de largo 1 a lo largo de +y (se estira con la escala y). */
function helixGeometry(turns: number, r: number, seg = 12): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  const n = Math.round(turns * seg);
  for (let i = 0; i <= n; i++) {
    const a = (i / seg) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * r, i / n, Math.sin(a) * r));
  }
  return new THREE.BufferGeometry().setFromPoints(pts);
}

/** Pieza entre dos puntos de la escena (resorte, hilo, columna). */
function stretch(m: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
  const d = b.clone().sub(a);
  const len = Math.max(0.01, d.length());
  m.position.copy(a);
  m.scale.set(1, len, 1);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
}
/** Igual que `stretch`, pero la geometría está centrada (cilindros y cajas). */
function stretchC(m: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
  stretch(m, a, b);
  m.position.copy(a).add(b).multiplyScalar(0.5);
}
const sv = (p: { x: number; y: number; z: number }) => new THREE.Vector3(p.x, p.z, -p.y);

export function createObjVisualF(o: F06Object, _w0: F06World, q: QualityLevel, ghost?: () => { id: string; x: number; y: number; z: number } | null): ObjHandleF {
  const mats = materials(q);
  const seg = q === 'LOW' ? 14 : q === 'MEDIUM' ? 24 : 36;
  const group = new THREE.Group();
  const disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];
  let ring: THREE.Mesh | null = null;
  let update: ObjHandleF['update'] = () => undefined;
  let place: ((ctx: FrameCtxF, ob: F06Object) => boolean) | null = null;
  const id = o.id;
  const own = <M extends THREE.Material | THREE.Texture>(m: M): M => {
    disposables.push(m);
    return m;
  };
  const alu = own(new THREE.MeshStandardMaterial({ color: 0xc8cdd2, metalness: 0.7, roughness: 0.35 }));
  const red = own(new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.45 }));
  const green = own(new THREE.MeshStandardMaterial({ color: 0x2e9d57, roughness: 0.45 }));
  const brass = own(new THREE.MeshStandardMaterial({ color: 0xb8913a, metalness: 0.8, roughness: 0.3 }));
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
  const roomLevel: THREE.Object3D[] = [];
  const roomObj = <O extends THREE.Object3D>(x: O): O => {
    roomLevel.push(x);
    return x;
  };
  const placeAt = (p: { x: number; y: number; z: number }) => group.position.set(p.x, p.z, -p.y);

  switch (o.kind) {
    case 'stand': {
      const base = shadowed(new THREE.Mesh(new THREE.BoxGeometry(ST.baseW, 2, ST.baseD), mats.darkMetal));
      base.position.y = 1;
      const rod = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, ST.rodH, 14), mats.chrome));
      rod.position.set(0, ST.rodH / 2, -(ST.rodY - ST.y));
      const arm = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, ST.rodY - ST.hookY + 2, 12), mats.chrome));
      arm.rotation.x = Math.PI / 2;
      arm.position.set(0, ST.hookZ + 2, -((ST.rodY + ST.hookY) / 2 - ST.y));
      const boss = shadowed(new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), mats.darkMetal));
      boss.position.set(0, ST.hookZ + 2, -(ST.rodY - ST.y));
      const hook = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.18, 6, 14, Math.PI * 1.5), mats.chrome));
      hook.position.set(0, ST.hookZ + 0.6, -(ST.hookY - ST.y));
      body.add(base, rod, arm, boss, hook);
      body.add(at(hit(new THREE.BoxGeometry(ST.baseW, 2, ST.baseD), id, 'base'), 0, 1, 0));
      body.add(at(hit(new THREE.CylinderGeometry(1.4, 1.4, ST.rodH, 8), id, 'rod'), 0, ST.rodH / 2, -(ST.rodY - ST.y)));
      break;
    }
    case 'ruler': {
      const R = GEOF06.ruler;
      const len = R.z1 - R.z0;
      const nominalZero = ST.hookZ - GEOF06.spring.natCm;
      const face = new THREE.Mesh(new THREE.PlaneGeometry(3, len), own(new THREE.MeshBasicMaterial({ map: own(verticalScaleTexture(len, (d) => d - (R.z1 - nominalZero))) })));
      const back = shadowed(new THREE.Mesh(new THREE.BoxGeometry(3.4, len + 1, 0.5), mats.wood));
      back.position.z = -0.3;
      const slide = new THREE.Group();
      slide.add(face, back);
      const clampM = shadowed(new THREE.Mesh(new THREE.BoxGeometry(4, 2, 2.4), mats.darkMetal));
      const knob = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1.2, 12), red));
      knob.rotation.x = Math.PI / 2;
      body.add(slide, clampM, knob);
      body.add(at(hit(new THREE.BoxGeometry(3.4, len, 1.2), id, 'face'), 0, len / 2, 0));
      const hAlign = hit(new THREE.BoxGeometry(3, 3, 3), id, 'align');
      body.add(hAlign);
      ring = selRing(3);
      group.add(ring);
      place = (ctx) => {
        const w = ctx.world;
        group.position.set(R.x, R.z0, -R.y);
        // La regla se desliza en su abrazadera: su cero queda donde lo dejó el ajuste.
        const shift = rulerZeroZ(w) - nominalZero;
        slide.position.set(0, len / 2 + shift, 0.2);
        clampM.position.set(0, len + 1.5, -0.6);
        knob.position.set(2.4, len + 1.5, 0);
        hAlign.position.copy(knob.position);
        return true;
      };
      break;
    }
    case 'spring': {
      const coilMat = own(new THREE.LineBasicMaterial({ color: id === 'spring02' ? 0xb0b8c0 : 0x8a949e }));
      const coil = roomObj(new THREE.Line(helixGeometry(14, GEOF06.spring.coilD / 2), coilMat));
      const hb = roomObj(hit(new THREE.CylinderGeometry(1.6, 1.6, 1, 8), id, 'body'));
      update = (ctx) => {
        const w = ctx.world;
        const sp = w.springs[id];
        const g = ghost?.();
        coilMat.color.setHex(sp.damaged ? 0x9c6b3c : id === 'spring02' ? 0xb0b8c0 : 0x8a949e);
        let a: THREE.Vector3;
        let b: THREE.Vector3;
        if (g && g.id === id) {
          a = sv({ x: g.x, y: g.y, z: g.z + 7 });
          b = sv({ x: g.x, y: g.y, z: g.z - 7 });
        } else if (sp.at === 'stand') {
          a = sv(standHook());
          b = sv(springBottom(w));
        } else if (sp.at === 'launcher') {
          a = sv(trackAt(w, LA.back + 0.008, 2.6));
          b = sv(trackAt(w, plungerS(w), 2.6));
        } else {
          const r = rackSlot(id);
          a = sv({ x: r.x - 7, y: r.y, z: r.z + 1.3 });
          b = sv({ x: r.x + 7, y: r.y, z: r.z + 1.3 });
        }
        stretch(coil, a, b);
        stretchC(hb, a, b);
      };
      break;
    }
    case 'hanger': {
      const rod = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, GEOF06.hanger.h, 8), mats.chrome));
      rod.position.y = GEOF06.hanger.h / 2;
      const plate = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(GEOF06.hanger.d / 2, GEOF06.hanger.d / 2, 0.6, seg), mats.darkMetal));
      plate.position.y = 0.3;
      const eye = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.12, 6, 12), mats.chrome));
      eye.position.y = GEOF06.hanger.h + 0.4;
      body.add(rod, plate, eye);
      body.add(at(hit(new THREE.CylinderGeometry(2.4, 2.4, GEOF06.hanger.h, 8), id, 'body'), 0, GEOF06.hanger.h / 2, 0));
      ring = selRing(3);
      group.add(ring);
      place = (ctx, ob) => {
        placeAt(ob.support === 'hand' ? ob.pose : hangerRoom(ctx.world));
        return true;
      };
      break;
    }
    case 'slotMass': {
      const disc = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 1.2, seg, 1, false, 0.25, Math.PI * 2 - 0.5), brass));
      disc.position.y = 0.6;
      body.add(disc);
      body.add(at(hit(new THREE.CylinderGeometry(2.6, 2.6, 1.4, 10), id, 'body'), 0, 0.6, 0));
      ring = selRing(3);
      group.add(ring);
      place = (ctx, ob) => {
        placeAt(ob.support === 'hand' ? ob.pose : slotRoom(ctx.world, id));
        return true;
      };
      break;
    }
    case 'cartMass': {
      const bar = shadowed(new THREE.Mesh(new RoundedBoxGeometry(8, 1.5, 4, 2, 0.3), mats.steel));
      bar.position.y = 0.75;
      body.add(bar);
      body.add(at(hit(new THREE.BoxGeometry(8, 1.8, 4), id, 'body'), 0, 0.8, 0));
      ring = selRing(4);
      group.add(ring);
      place = (ctx, ob) => {
        const w = ctx.world;
        placeAt(ob.support === 'hand' ? ob.pose : cartMassRoom(w, id));
        body.rotation.z = ob.support === 'cart' ? cartTilt(w) * DEG : 0;
        return true;
      };
      break;
    }
    case 'massRack': {
      const R = GEOF06.massRack;
      const base = shadowed(new THREE.Mesh(new THREE.BoxGeometry(R.w, R.h, R.d + 8), mats.wood));
      base.position.set(0, R.h / 2, 3);
      body.add(base);
      body.add(at(hit(new THREE.BoxGeometry(R.w, R.h, R.d + 8), id, 'body'), 0, R.h / 2, 3));
      break;
    }
    case 'track': {
      // Viga del riel en tramos que siguen el perfil z(s) (se rehacen cuando cambia la altura).
      const N = 48;
      const beamMat = alu;
      const segs: THREE.Mesh[] = [];
      for (let i = 0; i < N; i++) {
        const m = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1, 1.2, TR.w), beamMat));
        segs.push(m);
        roomObj(m);
      }
      const groove = own(new THREE.MeshStandardMaterial({ color: 0x55606a, roughness: 0.6 }));
      const grooves: THREE.Mesh[] = [];
      for (let i = 0; i < N; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 1), groove);
        grooves.push(m);
        roomObj(m);
      }
      // Patas del tramo bajo, columna de elevación (con perilla y abrazadera) y tope del extremo.
      const legs: THREE.Mesh[] = [];
      for (const s of [0.05, 0.55]) {
        const leg = shadowed(new THREE.Mesh(new THREE.BoxGeometry(2, TR.z0 - 0.6, TR.w - 2), mats.darkMetal));
        leg.position.set(TR.x0 + s * 100, (TR.z0 - 0.6) / 2, -TR.y);
        legs.push(roomObj(leg));
      }
      const column = roomObj(shadowed(new THREE.Mesh(new THREE.BoxGeometry(2.4, 1, 2.4), mats.darkMetal)));
      const sleeve = roomObj(shadowed(new THREE.Mesh(new THREE.BoxGeometry(3.4, 10, 3.4), mats.darkMetal)));
      const foot = roomObj(shadowed(new THREE.Mesh(new THREE.BoxGeometry(8, 1.2, TR.w + 4), mats.darkMetal)));
      const knob = roomObj(shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 1.2, 14), mats.blackPlastic)));
      const clampLever = roomObj(shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 4), red)));
      const endStop = roomObj(shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.4, 6, TR.w + 1), mats.darkMetal)));
      const endLeg = roomObj(shadowed(new THREE.Mesh(new THREE.BoxGeometry(2, 1, TR.w - 2), mats.darkMetal)));
      const hLow = roomObj(hit(new THREE.BoxGeometry(TR.flat1 * 100, 1.6, TR.w), id, 'board'));
      const hRiser = roomObj(hit(new THREE.BoxGeometry(4, 4, 4), id, 'riser'));
      const hClamp = roomObj(hit(new THREE.BoxGeometry(3, 3, 5), id, 'clamp'));
      const hHigh = roomObj(hit(new THREE.BoxGeometry(1, 1.6, TR.w), id, 'board'));
      update = (ctx) => {
        const w = ctx.world;
        const h = w.track.h;
        for (let i = 0; i < N; i++) {
          const s0 = (i / N) * TR.len;
          const s1 = ((i + 1) / N) * TR.len;
          const a = trackPoint(s0, h, -0.6);
          const b = trackPoint(s1, h, -0.6);
          const dx = b.x - a.x;
          const dz = b.z - a.z;
          const L = Math.hypot(dx, dz) + 0.05;
          const m = segs[i];
          m.position.set((a.x + b.x) / 2, (a.z + b.z) / 2, -TR.y);
          m.rotation.set(0, 0, Math.atan2(dz, dx));
          m.scale.set(L, 1, 1);
          const gm = grooves[i];
          gm.position.set((a.x + b.x) / 2, (a.z + b.z) / 2 + 0.62, -TR.y + 3);
          gm.rotation.set(0, 0, Math.atan2(dz, dx));
          gm.scale.set(L, 1, 1);
        }
        const rs = TR.riserS;
        const top = trackPoint(rs, h, -1.2);
        column.scale.y = Math.max(0.5, top.z - 1.2);
        column.position.set(top.x, (top.z + 1.2) / 2, -TR.y);
        sleeve.position.set(top.x, 6.2, -TR.y);
        foot.position.set(top.x, 0.6, -TR.y);
        knob.rotation.x = Math.PI / 2;
        knob.rotation.y = h * 40;
        knob.position.set(top.x, 9, -TR.y + 2.4);
        hRiser.position.copy(knob.position);
        clampLever.position.set(top.x + 2.4, w.track.clamped ? 8 : 10, -TR.y + 1.4);
        clampLever.rotation.set(0, 0, w.track.clamped ? 0 : 0.7);
        (clampLever.material as THREE.MeshStandardMaterial) = w.track.clamped ? green : red;
        hClamp.position.set(top.x + 2.4, 9, -TR.y + 1.4);
        const e = trackPoint(TR.end, h, 0);
        endStop.position.set(e.x + 0.7, e.z + 2, -TR.y);
        const eb = trackPoint(TR.len, h, -1.2);
        endLeg.scale.y = Math.max(0.5, eb.z);
        endLeg.position.set(eb.x - 1, eb.z / 2, -TR.y);
        const lo = trackPoint(TR.flat1 / 2, h, -0.6);
        hLow.position.set(lo.x, lo.z, -TR.y);
        const hi0 = trackPoint(TR.flat1 + TR.rise, h, -0.6);
        const hi1 = trackPoint(TR.len, h, -0.6);
        hHigh.scale.x = hi1.x - hi0.x;
        hHigh.position.set((hi0.x + hi1.x) / 2, hi0.z, -TR.y);
      };
      break;
    }
    case 'launcher': {
      const housing = shadowed(new THREE.Mesh(new THREE.BoxGeometry(LA.plunger0 * 100 - 1, 0.8, 2.4), mats.darkMetal));
      const backPlate = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.2, 7, TR.w - 1), mats.darkMetal));
      const plunger = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.8, 5, TR.w - 3), alu));
      const rodP = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1, 8), mats.chrome));
      const ratchet = shadowed(new THREE.Mesh(new THREE.BoxGeometry(LA.maxComp * 100, 0.6, 0.6), mats.steel));
      const pawl = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1, 1.4, 0.6), mats.darkMetal));
      const trigger = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1, 3, 1), red));
      const clip = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.4, 1, 2.2), red));
      for (const m of [housing, backPlate, plunger, rodP, ratchet, pawl, trigger, clip]) roomObj(m);
      const hTrig = roomObj(hit(new THREE.BoxGeometry(2.4, 4, 2.4), id, 'trigger'));
      const hClip = roomObj(hit(new THREE.BoxGeometry(2.4, 2.4, 3), id, 'clip'));
      const hBody = roomObj(hit(new THREE.BoxGeometry(LA.plunger0 * 100, 4, TR.w), id, 'body'));
      update = (ctx) => {
        const w = ctx.world;
        const base = trackAt(w, 0, 0);
        const ps = plungerS(w);
        const zc = base.z;
        housing.position.set(base.x + (LA.plunger0 * 100) / 2, zc + 0.4, -TR.y + TR.w / 2 - 1.4);
        backPlate.position.set(trackAt(w, LA.back).x, zc + 3.5, -TR.y);
        plunger.position.set(trackAt(w, ps).x - 0.4, zc + 2.8, -TR.y);
        stretchC(rodP, sv(trackAt(w, LA.back, 2.6)), sv(trackAt(w, ps, 2.6)));
        ratchet.position.set(base.x + 2 + (LA.maxComp * 100) / 2, zc + 0.9, -TR.y - TR.w / 2 + 0.6);
        pawl.position.set(trackAt(w, ps).x, zc + 1.4, -TR.y - TR.w / 2 + 0.6);
        pawl.rotation.z = w.cart.latched ? 0 : 0.5;
        const tx = trackAt(w, 0.06).x;
        trigger.position.set(tx, zc - 1.6, -TR.y - TR.w / 2 - 0.8);
        trigger.rotation.z = w.cart.latched ? 0.3 : 0;
        hTrig.position.copy(trigger.position);
        clip.position.set(trackAt(w, 0.04).x, zc + 5.8, -TR.y + 1);
        clip.rotation.z = w.track.springSecured ? 0 : 0.8;
        (clip.material as THREE.MeshStandardMaterial) = w.track.springSecured ? green : red;
        hClip.position.copy(clip.position);
        hBody.position.set(base.x + (LA.plunger0 * 100) / 2, zc + 2, -TR.y);
      };
      break;
    }
    case 'cart': {
      const shell = shadowed(new THREE.Mesh(new RoundedBoxGeometry(CA.len, CA.h, CA.w, 2, 0.6), own(new THREE.MeshStandardMaterial({ color: 0x1f6fb2, roughness: 0.45 }))));
      shell.position.y = CA.h / 2 + 1.2;
      const flag = shadowed(new THREE.Mesh(new THREE.BoxGeometry(CA.flagW, CA.flagH, 0.15), mats.blackPlastic));
      flag.position.set(0, CA.h + 1.2 + CA.flagH / 2, 2.6);
      const bumper = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.4, CA.w - 2), mats.rubberRed));
      bumper.position.set(-CA.len / 2 - 0.3, CA.h / 2 + 1.2, 0);
      body.add(shell, flag, bumper);
      const wheels: THREE.Mesh[] = [];
      for (const [x, z] of [[-5, 3.6], [5, 3.6], [-5, -3.6], [5, -3.6]] as const) {
        const wh = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.8, 16), mats.blackPlastic));
        wh.rotation.x = Math.PI / 2;
        wh.position.set(x, 1.2, z);
        wheels.push(wh);
        body.add(wh);
      }
      body.add(at(hit(new THREE.BoxGeometry(CA.len, CA.h + 1.2, CA.w), id, 'body'), 0, (CA.h + 1.2) / 2, 0));
      body.add(at(hit(new THREE.BoxGeometry(3, 2.6, 1.4), id, 'wheel'), 5, 1.2, 4));
      body.add(at(hit(new THREE.BoxGeometry(CA.flagW + 1, CA.flagH, 1), id, 'flag'), 0, CA.h + 1.2 + CA.flagH / 2, 2.6));
      ring = selRing(9);
      group.add(ring);
      place = (ctx) => {
        const w = ctx.world;
        const g = ghost?.();
        if (g && g.id === id) {
          placeAt(g);
          body.rotation.z = 0;
        } else {
          placeAt(cartRoom(w));
          body.rotation.z = cartTilt(w) * DEG;
        }
        // Rueda torcida tras un golpe contra el tope.
        wheels[1].rotation.y = w.cart.damaged ? 0.35 : 0;
        return true;
      };
      break;
    }
    case 'brake': {
      const B = GEOF06.brake;
      const len = (B.s1 - B.s0) * 100;
      const mag = shadowed(new THREE.Mesh(new THREE.BoxGeometry(len, 2.4, 1.6), own(new THREE.MeshStandardMaterial({ color: 0x8b1e1e, roughness: 0.5 }))));
      const magB = mag.clone();
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), ledMat());
      body.add(mag, magB, led);
      const hb = hit(new THREE.BoxGeometry(len, 4, TR.w + 4), id, 'body');
      body.add(hb);
      ring = selRing(6);
      group.add(ring);
      place = (ctx) => {
        const w = ctx.world;
        const c = trackAt(w, (B.s0 + B.s1) / 2);
        placeAt(c);
        body.rotation.z = trackTilt(w, (B.s0 + B.s1) / 2) * DEG;
        const up = w.track.brakeOn ? 1.8 : 0.2;
        mag.position.set(0, up, TR.w / 2 + 0.8);
        magB.position.set(0, up, -TR.w / 2 - 0.8);
        led.position.set(len / 2, 3, TR.w / 2 + 1);
        hb.position.set(0, 1.5, 0);
        setLed(led, w.track.brakeOn ? 0x34c759 : 0x444444);
        return true;
      };
      break;
    }
    case 'pad': {
      const L = GEOF06.loss;
      const len = (L.s1 - L.s0) * 100;
      const felt = own(new THREE.MeshStandardMaterial({ color: 0x6b4f3a, roughness: 1 }));
      const strips: THREE.Mesh[] = [];
      const N = 12;
      for (let i = 0; i < N; i++) strips.push(roomObj(new THREE.Mesh(new THREE.BoxGeometry(1, 0.25, 1.6), felt)));
      const lever = roomObj(shadowed(new THREE.Mesh(new THREE.BoxGeometry(1, 3, 1), mats.plasticYellow)));
      const hb = roomObj(hit(new THREE.BoxGeometry(3, 4, 3), id, 'body'));
      update = (ctx) => {
        const w = ctx.world;
        const on = w.track.frictionN > 0;
        for (let i = 0; i < N; i++) {
          const s0 = L.s0 + ((L.s1 - L.s0) * i) / N;
          const s1 = L.s0 + ((L.s1 - L.s0) * (i + 1)) / N;
          const a = trackAt(w, s0, 0.15, -3);
          const b = trackAt(w, s1, 0.15, -3);
          const m = strips[i];
          m.position.set((a.x + b.x) / 2, (a.z + b.z) / 2, -(a.y + b.y) / 2);
          m.rotation.set(0, 0, Math.atan2(b.z - a.z, b.x - a.x));
          m.scale.set(Math.hypot(b.x - a.x, b.z - a.z) + 0.05, 1, 1);
          m.visible = on;
        }
        const p = trackAt(w, L.s0, 0, -TR.w / 2 - 1.5);
        lever.position.set(p.x, p.z + 1.5, -p.y);
        lever.rotation.z = on ? 0 : 0.8;
        hb.position.copy(lever.position);
        void len;
      };
      break;
    }
    case 'damper': {
      const L = GEOF06.loss;
      const magMat = own(new THREE.MeshStandardMaterial({ color: 0x404b57, metalness: 0.5, roughness: 0.4 }));
      const mags: THREE.Mesh[] = [];
      const N = 6;
      for (let i = 0; i < N * 2; i++) mags.push(roomObj(shadowed(new THREE.Mesh(new THREE.BoxGeometry(3.6, 2, 1.2), magMat))));
      const knob = roomObj(shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 1, 12), mats.plasticBlue)));
      const hb = roomObj(hit(new THREE.BoxGeometry(3, 3, 3), id, 'body'));
      update = (ctx) => {
        const w = ctx.world;
        const on = w.track.damperC > 0;
        for (let i = 0; i < N; i++) {
          const s = L.s0 + ((L.s1 - L.s0) * (i + 0.5)) / N;
          for (const side of [0, 1]) {
            const p = trackAt(w, s, on ? 1.4 : -1.4, side ? TR.w / 2 + 0.8 : -TR.w / 2 - 0.8);
            const m = mags[i * 2 + side];
            m.position.set(p.x, p.z, -p.y);
            m.rotation.set(0, 0, trackTilt(w, s) * DEG);
          }
        }
        const p = trackAt(w, L.s1, 0, -TR.w / 2 - 2);
        knob.rotation.x = Math.PI / 2;
        knob.position.set(p.x, p.z + 1, -p.y);
        knob.rotation.y = on ? 1.2 : 0;
        hb.position.copy(knob.position);
      };
      break;
    }
    case 'gate': {
      const G = GEOF06.gate;
      const pend = id === 'gate3';
      const span = pend ? 8 : TR.w + 3;
      const frame = new THREE.Group();
      const postA = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.4, G.h, 1.4), mats.blackPlastic));
      postA.position.set(0, G.h / 2 - 2, -span / 2 - 0.7);
      const postB = postA.clone();
      postB.position.z = span / 2 + 0.7;
      const top = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, span + 2.8), mats.blackPlastic));
      top.position.y = G.h - 2;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, span + 1, 6), own(new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.6 })));
      beam.rotation.x = Math.PI / 2;
      beam.position.y = pend ? 0 : G.beamDz;
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), ledMat());
      led.position.set(0, G.h - 1, span / 2 + 1.6);
      frame.add(postA, postB, top, beam, led);
      body.add(frame);
      frame.add(at(hit(new THREE.BoxGeometry(2, G.h, span + 3), id, 'mount'), 0, G.h / 2 - 2, 0));
      ring = selRing(5);
      group.add(ring);
      place = (ctx) => {
        const w = ctx.world;
        const g = gateRoom(w, id);
        placeAt(g);
        if (pend) {
          // Compuerta del péndulo: el haz cruza la trayectoria de la esfera en la parte baja (perpendicular a x).
          frame.position.set(0, -G.h / 2 + 2, 0);
          frame.rotation.set(0, 0, 0);
        } else frame.rotation.set(0, 0, trackTilt(w, w.gates[id]?.s ?? 0.5) * DEG);
        const blocked = w.gates[id]?.blocked;
        setLed(led, !w.logger.gatesConnected ? 0x444444 : blocked ? 0xff3b30 : 0x34c759);
        return true;
      };
      break;
    }
    case 'gauge': {
      const H = 60;
      const colMesh = shadowed(new THREE.Mesh(new THREE.BoxGeometry(2.4, H, 1.6), mats.darkMetal));
      colMesh.position.y = H / 2;
      const face = new THREE.Mesh(new THREE.PlaneGeometry(2.2, H - 2), own(new THREE.MeshBasicMaterial({ map: own(verticalScaleTexture(H - 2, (d) => H - 1 - d - TR.z0)) })));
      face.position.set(0, H / 2, 0.82);
      const foot = shadowed(new THREE.Mesh(new THREE.BoxGeometry(8, 1, 8), mats.darkMetal));
      foot.position.y = 0.5;
      const benchMark = new THREE.Mesh(new THREE.BoxGeometry(3, 0.2, 0.2), own(new THREE.MeshBasicMaterial({ color: 0x1565c0 })));
      benchMark.position.set(0, 1, 1);
      const slider = shadowed(new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.4, 2.6), mats.plasticYellow));
      const pointer = new THREE.Mesh(new THREE.BoxGeometry(6, 0.15, 0.15), own(new THREE.MeshBasicMaterial({ color: 0xd0021b })));
      body.add(colMesh, face, foot, benchMark, slider, pointer);
      body.add(at(hit(new THREE.BoxGeometry(2.8, H, 2), id, 'column'), 0, H / 2, 0));
      body.add(at(hit(new THREE.BoxGeometry(4, 2.4, 2.4), id, 'bench'), 0, 1.4, 0.6));
      const hIndex = hit(new THREE.BoxGeometry(4, 2.4, 3), id, 'index');
      body.add(hIndex);
      ring = selRing(4);
      group.add(ring);
      place = (ctx) => {
        const w = ctx.world;
        group.position.set(gaugeX(), 0, -GEOF06.gauge.y);
        const z = TR.z0 + w.track.h * 100;
        slider.position.set(0, z, 0.6);
        pointer.position.set(-3, z, 0.9);
        hIndex.position.set(0, z, 0.8);
        return true;
      };
      break;
    }
    case 'forceSensor': {
      const cell = new THREE.Group();
      const box = shadowed(new THREE.Mesh(new RoundedBoxGeometry(2.6, 3.6, 4.2, 2, 0.4), own(new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.5 }))));
      const zeroBtn = button(0.45, mats.plasticBlue);
      const calBtn = button(0.45, mats.plasticYellow);
      const rngBtn = button(0.45, mats.plasticWhite);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), ledMat());
      const btnAt = (m: THREE.Object3D, z: number) => {
        m.position.set(0, 1.9, z);
        cell.add(m);
      };
      cell.add(box);
      btnAt(zeroBtn, -1.2);
      btnAt(calBtn, 0);
      btnAt(rngBtn, 1.2);
      led.position.set(0, 1.9, -2.2);
      cell.add(led);
      cell.add(at(hit(new THREE.BoxGeometry(2.6, 3.6, 4.2), id, 'body'), 0, 0, 0));
      cell.add(at(hit(new THREE.BoxGeometry(1.2, 1.2, 1.1), id, 'zero'), 0, 2, -1.2));
      cell.add(at(hit(new THREE.BoxGeometry(1.2, 1.2, 1.1), id, 'cal'), 0, 2, 0));
      cell.add(at(hit(new THREE.BoxGeometry(1.2, 1.2, 1.1), id, 'range'), 0, 2, 1.2));
      cell.add(at(hit(new THREE.BoxGeometry(1.2, 1.2, 1.1), id, 'plug'), 0, 2, -2.2));
      body.add(cell);
      ring = selRing(3);
      group.add(ring);
      place = (ctx) => {
        const w = ctx.world;
        const p = trackAt(w, LA.back - 0.014, 3.2);
        placeAt(p);
        cell.rotation.set(0, w.sensor.angleDeg * DEG, 0);
        const s = w.sensor;
        setLed(led, !s.connected ? 0x444444 : s.calibrated && s.zeroed ? 0x34c759 : 0xf0c36e);
        return true;
      };
      break;
    }
    case 'posSensor': {
      const box = shadowed(new THREE.Mesh(new RoundedBoxGeometry(3, 3, 4, 2, 0.4), own(new THREE.MeshStandardMaterial({ color: 0x2b3a4a, roughness: 0.5 }))));
      const lens = new THREE.Mesh(new THREE.CircleGeometry(1, 16), own(new THREE.MeshBasicMaterial({ color: 0x0a0a0a })));
      lens.rotation.y = Math.PI / 2;
      lens.position.x = 1.52;
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), ledMat());
      led.position.set(0, 1.7, 0);
      const post = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 6, 8), mats.chrome));
      post.position.y = -4.5;
      body.add(box, lens, led, post);
      body.add(at(hit(new THREE.BoxGeometry(3, 3, 4), id, 'plug'), 0, 0, 0));
      ring = selRing(3);
      group.add(ring);
      place = (ctx) => {
        const w = ctx.world;
        placeAt(trackAt(w, LA.back - 0.01, 9.5));
        setLed(led, w.logger.posConnected ? 0x34c759 : 0x444444);
        return true;
      };
      break;
    }
    case 'logger': {
      const Lg = GEOF06.logger;
      const box = shadowed(new THREE.Mesh(new RoundedBoxGeometry(Lg.w, Lg.h, Lg.d, 2, 0.6), own(new THREE.MeshStandardMaterial({ color: 0x2b3a4a, roughness: 0.5 }))));
      box.position.y = Lg.h / 2;
      const { lcd, mesh } = lcdScreen(13, 3.4, 360, 100);
      mesh.position.set(0, Lg.h * 0.7, Lg.d / 2 + 0.02);
      body.add(box, mesh);
      const ports: Array<[string, number, THREE.Material]> = [['portF', -6, mats.plasticWhite], ['portP', -2.4, mats.plasticBlue], ['portG', 1.2, mats.plasticYellow], ['portA', 4.8, mats.rubberRed]];
      const portLeds: Record<string, THREE.Mesh> = {};
      for (const [part, x, mat] of ports) {
        const b = button(0.7, mat);
        b.rotation.x = Math.PI / 2;
        b.position.set(x, 1.5, Lg.d / 2 + 0.2);
        const led = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), ledMat());
        led.position.set(x + 1.2, 1.5, Lg.d / 2 + 0.1);
        portLeds[part] = led;
        body.add(b, led, at(hit(new THREE.BoxGeometry(2.4, 2.2, 1.4), id, part), x, 1.5, Lg.d / 2 + 0.3));
      }
      const tops: Array<[string, number, THREE.Material]> = [['rate', -6, mats.plasticBlue], ['sync', -2, mats.plasticWhite], ['readL', 2.5, mats.plasticYellow], ['readG', 6.5, mats.plasticYellow]];
      let syncLed: THREE.Mesh | null = null;
      for (const [part, x, mat] of tops) {
        const b = button(0.8, mat);
        b.position.set(x, Lg.h, -Lg.d / 2 + 3);
        body.add(b, at(hit(new THREE.BoxGeometry(2.6, 1.6, 2.6), id, part), x, Lg.h, -Lg.d / 2 + 3));
        if (part === 'sync') {
          syncLed = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), ledMat());
          syncLed.position.set(x, Lg.h + 0.2, -Lg.d / 2 + 5);
          body.add(syncLed);
        }
      }
      body.add(at(hit(new THREE.BoxGeometry(Lg.w, Lg.h, Lg.d), id, 'body'), 0, Lg.h / 2, 0));
      update = (ctx) => {
        const w = ctx.world;
        const on = (b: boolean) => (b ? 0x34c759 : 0x444444);
        setLed(portLeds.portF, on(w.sensor.connected));
        setLed(portLeds.portP, on(w.logger.posConnected));
        setLed(portLeds.portG, on(w.logger.gatesConnected));
        setLed(portLeds.portA, on(w.logger.angleConnected));
        if (syncLed) setLed(syncLed, on(w.logger.synced));
        const run = w.run && !w.run.done ? w.run : null;
        const last = run?.launch[run.launch.length - 1];
        const head = run ? (last && run.sepT === null ? `F ${last[1].toFixed(2)} N` : `v ${Math.abs(w.cart.v).toFixed(2)} m/s`) : 'LISTO';
        lcd.set(head, run ? '#6ef08a' : '#f0c36e', `${w.logger.rateHz} Hz · ${run ? 'REGISTRANDO' : `${w.runs.length} disparos`}`);
      };
      break;
    }
    case 'pendulum': {
      // Soporte en L: columna en x = standX, brazo hasta el pivote; hilo y esfera; mordaza del largo; escala detrás.
      const colH = PD.pivotZ + 6;
      const base = shadowed(new THREE.Mesh(new THREE.BoxGeometry(14, 2, 18), mats.darkMetal));
      base.position.set(PD.standX - PD.x, 1, 0);
      const col = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, colH, 14), mats.chrome));
      col.position.set(PD.standX - PD.x, colH / 2, 0);
      const arm = shadowed(new THREE.Mesh(new THREE.BoxGeometry(PD.standX - PD.x + 2, 1.6, 1.6), mats.darkMetal));
      arm.position.set((PD.standX - PD.x) / 2, PD.pivotZ + 2, 0);
      const clampK = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1.4, 12), red));
      clampK.rotation.x = Math.PI / 2;
      clampK.position.set(3, PD.pivotZ + 2, 1.4);
      const scaleLen = PD.maxL * 100 + 6;
      const scale = new THREE.Mesh(new THREE.PlaneGeometry(3, scaleLen), own(new THREE.MeshBasicMaterial({ map: own(verticalScaleTexture(scaleLen, (d) => d)), side: THREE.DoubleSide })));
      scale.position.set(3, PD.pivotZ - scaleLen / 2, -2.4);
      const scaleRod = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.6, scaleLen, 0.6), mats.darkMetal));
      scaleRod.position.set(4.8, PD.pivotZ - scaleLen / 2, -2.6);
      body.add(base, col, arm, clampK, scale, scaleRod);
      body.add(at(hit(new THREE.BoxGeometry(3, 3, 3), id, 'length'), 3, PD.pivotZ + 2, 1.4));
      body.add(at(hit(new THREE.BoxGeometry(3, scaleLen, 1), id, 'scale'), 3, PD.pivotZ - scaleLen / 2, -2.4));
      body.add(at(hit(new THREE.CylinderGeometry(1.4, 1.4, colH, 8), id, 'body'), PD.standX - PD.x, colH / 2, 0));
      // Hilo y esfera viven en la sala (siguen al ángulo).
      const thread = roomObj(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 6), own(new THREE.MeshStandardMaterial({ color: 0xf0f0f0 }))));
      const bob = roomObj(shadowed(new THREE.Mesh(new THREE.SphereGeometry(1.25, seg, Math.round(seg * 0.7)), mats.chrome)));
      const hBob = roomObj(hit(new THREE.SphereGeometry(2.4, 10, 8), id, 'bob'));
      const handM = own(new THREE.MeshStandardMaterial({ color: 0xe0b896, roughness: 0.8 }));
      const hand = roomObj(new THREE.Mesh(new THREE.SphereGeometry(1.6, 10, 8), handM));
      group.position.set(PD.x, 0, -PD.y);
      update = (ctx) => {
        const w = ctx.world;
        const pv = sv(pivotRoom());
        const b = sv(bobRoom(w));
        stretchC(thread, pv, b);
        bob.position.copy(b);
        hBob.position.copy(b);
        hand.visible = w.pend.held;
        hand.position.copy(b).add(new THREE.Vector3(Math.sign(w.pend.thetaDeg || 1) * 2.4, 0.6, 0));
      };
      break;
    }
    case 'angleSensor': {
      const disc = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 1.2, seg), own(new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.5 }))));
      disc.rotation.x = Math.PI / 2;
      const { lcd, mesh } = lcdScreen(4, 1.6, 200, 80);
      mesh.position.set(0, 3.4, 0.4);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), ledMat());
      led.position.set(1.6, 1.6, 0.7);
      body.add(disc, mesh, led);
      body.add(at(hit(new THREE.BoxGeometry(4.4, 6, 2), id, 'body'), 0, 1.6, 0));
      body.add(at(hit(new THREE.BoxGeometry(1.2, 1.2, 1.2), id, 'plug'), 1.6, 1.6, 0.8));
      ring = selRing(3);
      group.add(ring);
      update = (ctx) => {
        const w = ctx.world;
        placeAt({ x: PD.x, y: PD.y - 1.4, z: PD.pivotZ });
        setLed(led, w.logger.angleConnected ? 0x34c759 : 0x444444);
        const shown = w.logger.angleConnected ? `${Math.abs(w.pend.thetaDeg).toFixed(1)}°` : '---';
        lcd.set(shown, w.pend.held ? '#f0c36e' : '#6ef08a', 'ÁNGULO');
      };
      place = () => true;
      break;
    }
    case 'balance': {
      const Bl = GEOF06.balance;
      const box = shadowed(new THREE.Mesh(new RoundedBoxGeometry(Bl.w, Bl.h, Bl.d, 2, 0.8), mats.plasticWhite));
      box.position.y = Bl.h / 2;
      const pan = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(Bl.pan, Bl.pan, 0.6, seg), mats.steel));
      pan.position.y = Bl.h + 0.3;
      const { lcd, mesh } = lcdScreen(9, 2.6, 300, 90);
      mesh.rotation.x = -0.5;
      mesh.position.set(0, Bl.h * 0.62, Bl.d / 2 + 0.3);
      const tare = button(0.8, mats.plasticBlue);
      tare.rotation.x = Math.PI / 2 - 0.5;
      tare.position.set(-6.5, Bl.h * 0.55, Bl.d / 2 + 0.3);
      const readB = button(0.8, mats.plasticYellow);
      readB.rotation.x = Math.PI / 2 - 0.5;
      readB.position.set(6.5, Bl.h * 0.55, Bl.d / 2 + 0.3);
      body.add(box, pan, mesh, tare, readB);
      body.add(at(hit(new THREE.CylinderGeometry(Bl.pan, Bl.pan, 1.2, 12), id, 'pan'), 0, Bl.h + 0.4, 0));
      body.add(at(hit(new THREE.BoxGeometry(2.6, 2.6, 1.6), id, 'tare'), -6.5, Bl.h * 0.55, Bl.d / 2 + 0.4));
      body.add(at(hit(new THREE.BoxGeometry(2.6, 2.6, 1.6), id, 'read'), 6.5, Bl.h * 0.55, Bl.d / 2 + 0.4));
      body.add(at(hit(new THREE.BoxGeometry(Bl.w, Bl.h, Bl.d), id, 'body'), 0, Bl.h / 2, 0));
      update = (ctx) => {
        const w = ctx.world;
        const b = w.balance;
        const settling = !!b.on && w.timeS - b.placedS < 1.5;
        const g = (b.on ? loadOnBalanceG(w, b.on) : 0) + b.offsetG;
        const res = w.params.balanceResolutionG;
        const shown = Math.round(g / res) * res + (settling && !ctx.reducedMotion ? Math.sin(w.timeS * 23) * 3 : 0);
        lcd.set(`${shown.toFixed(res < 1 ? 1 : 0)} g`, settling ? '#f0c36e' : '#6ef08a', b.tared ? 'TARA ✓' : 'SIN TARA');
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

  // Las piezas que siguen un perfil o se estiran entre dos puntos viven en la sala, no dentro del grupo.
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
        if (o.kind !== 'pendulum' && o.kind !== 'track' && o.kind !== 'launcher' && o.kind !== 'pad' && o.kind !== 'damper' && o.kind !== 'spring') {
          group.position.set(p.x, p.z, -p.y);
          group.rotation.set(0, 0, 0);
        }
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

export { panRoom };
