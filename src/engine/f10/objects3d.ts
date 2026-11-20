/**
 * Vistas 3D procedurales de F10: riel con topes de seguridad y soporte de guardado; dos apoyos regulables con filo,
 * traba y sensor de reacción con su pantalla; viga de 120 cm con la escala impresa (sobre los apoyos, en la cuña, colgada
 * del pórtico o guardada, y girando al volcar); portapesas con gancho de cierre; pórtico con el dinamómetro vertical de
 * 0–20 N; cuña, nivel de burbuja, cinta y calibre; estante de cargas y probetas; prensa de tracción vertical con mordazas,
 * celda de carga, travesaño, manivela con freno y palanca de descarga rápida, protector abatible, comparador digital
 * con su cable y presilla, y el registrador. SOLO leen el estado; cada pieza funcional tiene un colisionador invisible
 * simple (`userData {objId, part}`).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { F10Object, SupportId } from '../../simulation/f10-world/types';
import { GEOF10 } from '../../simulation/f10-world/geometry';
import { staticsF10 } from '../../simulation/f10-world/conservation';
import { loggingF10, tippingF10 } from '../../simulation/f10-world/world';
import type { QualityLevel } from '../quality';
import { materials } from '../renderers/materials';
import { lcdTexture } from '../renderers/textures';
import type { FrameCtxF } from './F10Lab3D';
import { DEG, beamPointRoom, beamPose, dynHookRoom, homeOf, loadRoom, objRoom, specimenRoom, supportRoom } from './layout';

export interface ObjHandleF {
  group: THREE.Group;
  update(ctx: FrameCtxF, o: F10Object): void;
  dispose(): void;
}

const hitMat = () => materials('LOW').hit;
const G = GEOF10;
const PR = G.press;
/** El travesaño sube 0,6 mm como mucho: se dibuja exagerado (cm de dibujo por mm de recorrido). */
export const PRESS_EXAG = 2;

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

/** Pieza entre dos puntos de la escena (hilo, cable). */
function stretchC(m: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
  const d = b.clone().sub(a);
  const len = Math.max(0.01, d.length());
  m.scale.set(1, len, 1);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  m.position.copy(a).add(b).multiplyScalar(0.5);
}

/** Escala impresa de la viga: 0 a la izquierda, números cada 10 cm, divisiones de 1 cm y medios centímetros. */
function beamScaleTexture(lenCm: number): THREE.CanvasTexture {
  const k = 16;
  const W = Math.round(lenCm * k);
  const H = 40;
  return canvasTex(W, H, (g) => {
    g.fillStyle = '#e9e4d2';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#1b2733';
    g.fillStyle = '#1b2733';
    g.font = 'bold 16px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'bottom';
    for (let mm = 0; mm <= lenCm * 10; mm += 5) {
      const x = Math.min(W - 1, Math.max(1, mm * (k / 10)));
      const major = mm % 100 === 0;
      g.lineWidth = major ? 2 : 1;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, major ? 20 : mm % 10 === 0 ? 12 : 6);
      g.stroke();
      if (major && mm > 0 && mm < lenCm * 10) g.fillText(String(mm / 10), x, H - 2);
    }
  });
}

/** Escala vertical del dinamómetro de 0–20 N (cero arriba, divisiones de 0,5 N). */
function dynScaleTexture(rangeN: number): THREE.CanvasTexture {
  const W = 64;
  const H = 512;
  return canvasTex(W, H, (g) => {
    g.fillStyle = '#f7f3e4';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#1b2733';
    g.fillStyle = '#1b2733';
    g.font = 'bold 18px sans-serif';
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    const n = Math.round(rangeN / 0.5);
    for (let i = 0; i <= n; i++) {
      const y = 12 + (i / n) * (H - 24);
      const major = i % 4 === 0;
      g.lineWidth = major ? 2.5 : 1;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(major ? 26 : 14, y);
      g.stroke();
      if (major) g.fillText(`${i / 2}`, W - 4, y);
    }
  });
}

/** Regla vertical junto a la probeta (cm), para el largo calibrado. */
function pressScaleTexture(lenCm: number): THREE.CanvasTexture {
  const k = 12;
  const H = Math.round(lenCm * k);
  const W = 40;
  return canvasTex(W, H, (g) => {
    g.fillStyle = '#f4f1e6';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#1b2733';
    g.fillStyle = '#1b2733';
    g.font = 'bold 14px sans-serif';
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    for (let mm = 0; mm <= lenCm * 10; mm += 5) {
      const y = H - Math.max(1, Math.min(H - 1, mm * (k / 10)));
      const major = mm % 50 === 0;
      g.lineWidth = major ? 2 : 1;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(major ? 18 : mm % 10 === 0 ? 11 : 5, y);
      g.stroke();
      if (major && mm > 0 && mm < lenCm * 10) g.fillText(String(mm / 10), W - 2, y);
    }
  });
}

const r2 = (x: number) => x.toFixed(2);

export function createObjVisualF(o: F10Object, w0: FrameCtxF['world'], q: QualityLevel, _ghost?: () => { id: string; x: number; y: number; z: number } | null): ObjHandleF {
  const mats = materials(q);
  const seg = q === 'LOW' ? 18 : q === 'MEDIUM' ? 32 : 56;
  const group = new THREE.Group();
  const disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];
  let ring: THREE.Mesh | null = null;
  let update: ObjHandleF['update'] = () => undefined;
  let place: ((ctx: FrameCtxF, ob: F10Object) => boolean) | null = null;
  const id = o.id;
  const own = <M extends THREE.Material | THREE.Texture>(m: M): M => {
    disposables.push(m);
    return m;
  };
  const alu = own(new THREE.MeshStandardMaterial({ color: 0xc8cdd2, metalness: 0.7, roughness: 0.35 }));
  const red = own(new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.45 }));
  const green = own(new THREE.MeshStandardMaterial({ color: 0x2e9d57, roughness: 0.45 }));
  const brass = own(new THREE.MeshStandardMaterial({ color: 0xb8913a, metalness: 0.8, roughness: 0.3 }));
  const cord = own(new THREE.MeshStandardMaterial({ color: 0xf4f0e0, roughness: 0.8 }));
  const cable = own(new THREE.MeshStandardMaterial({ color: 0x222831, roughness: 0.6 }));
  const blue = own(new THREE.MeshStandardMaterial({ color: 0x2f6fb5, roughness: 0.5 }));
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
  /** Cordón o cable: cilindro fino que se estira entre dos puntos de la sala. */
  const strand = (mat: THREE.Material, r = 0.1) => roomObj(new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 5), mat));
  const v3 = (p: { x: number; y: number; z: number }) => new THREE.Vector3(p.x, p.z, -p.y);
  const placeAt = (p: { x: number; y: number; z: number }) => group.position.set(p.x, p.z, -p.y);
  const lift = (w: FrameCtxF['world']) => w.press.u * PRESS_EXAG;

  switch (o.kind) {
    case 'rail': {
      // Riel de aluminio con su escala, dos topes de seguridad bajo los extremos de la viga y el soporte de guardado.
      const Rl = G.rail;
      const len = Rl.x1 - Rl.x0;
      const bar = shadowed(new THREE.Mesh(new THREE.BoxGeometry(len, Rl.h, Rl.w), alu));
      bar.position.set(0, Rl.h / 2, 0);
      body.add(bar);
      for (const s of [4, G.beam.len - 4]) {
        const post = shadowed(new THREE.Mesh(new THREE.BoxGeometry(3, G.catchZ, 4), mats.darkMetal));
        post.position.set(G.beam.x0 + s - (Rl.x0 + Rl.x1) / 2, G.catchZ / 2, 4);
        const pad = shadowed(new THREE.Mesh(new THREE.BoxGeometry(4, 0.8, 5), mats.rubberRed));
        pad.position.set(post.position.x, G.catchZ - 0.4, 4);
        body.add(post, pad);
      }
      for (const s of [15, G.beam.len - 15]) {
        const peg = shadowed(new THREE.Mesh(new THREE.BoxGeometry(3, G.store.z, 8), mats.wood));
        peg.position.set(G.beam.x0 + s - (Rl.x0 + Rl.x1) / 2, G.store.z / 2, -(G.store.y - Rl.y));
        body.add(peg);
      }
      body.add(at(hit(new THREE.BoxGeometry(len, Rl.h, Rl.w), id, 'body'), 0, Rl.h / 2, 0));
      place = () => {
        group.position.set((Rl.x0 + Rl.x1) / 2, 0, -Rl.y);
        return true;
      };
      break;
    }
    case 'support': {
      // Soporte con filo de acero sobre un sensor de reacción con pantalla; traba roja/verde y tornillo del filo.
      const S = G.support;
      const sid: SupportId = id === 'supportA' ? 'A' : 'B';
      const cell = shadowed(new THREE.Mesh(new RoundedBoxGeometry(S.w, S.cellH, S.d, 2, 0.5), own(new THREE.MeshStandardMaterial({ color: 0x2b3a4a, roughness: 0.5 }))));
      cell.position.y = G.rail.h + S.cellH / 2;
      const post = shadowed(new THREE.Mesh(new THREE.BoxGeometry(2.4, S.z - G.rail.h - S.cellH - 2, 2.4), mats.steel));
      post.position.y = G.rail.h + S.cellH + (S.z - G.rail.h - S.cellH - 2) / 2;
      const knifeGeo = new THREE.CylinderGeometry(0.01, 1.4, 2, 3);
      knifeGeo.rotateX(Math.PI / 2);
      const knife = shadowed(new THREE.Mesh(knifeGeo, mats.chrome));
      knife.rotation.z = 0;
      knife.position.y = S.z - 1;
      knife.scale.set(1, 1, 3);
      const clamp = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 2, 12), red));
      clamp.rotation.x = Math.PI / 2;
      clamp.position.set(S.w / 2 - 1.2, G.rail.h + 1, S.d / 2 + 0.6);
      const screw = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.2, 10), brass));
      screw.rotation.z = Math.PI / 2;
      screw.position.set(1.8, S.z - 2.4, 0);
      const { lcd, mesh } = lcdScreen(6, 2.2, 240, 88);
      mesh.position.set(0, G.rail.h + S.cellH / 2, S.d / 2 + 0.02);
      body.add(cell, post, knife, clamp, screw, mesh);
      body.add(at(hit(new THREE.BoxGeometry(4, S.z - S.cellH, 4), id, 'body'), 0, (S.z + S.cellH) / 2, 0));
      body.add(at(hit(new THREE.BoxGeometry(2.6, 2.6, 2.6), id, 'clamp'), S.w / 2 - 1.2, G.rail.h + 1, S.d / 2 + 0.8));
      body.add(at(hit(new THREE.BoxGeometry(3, 3, 6), id, 'knife'), 0, S.z - 1.2, 0));
      body.add(at(hit(new THREE.BoxGeometry(S.w, S.cellH, 1.2), id, 'cell'), 0, G.rail.h + S.cellH / 2, S.d / 2 + 0.4));
      ring = selRing(6);
      group.add(ring);
      place = (ctx) => {
        const w = ctx.world;
        const p = supportRoom(w, sid);
        group.position.set(p.x, 0, -p.y);
        const s = w.supports[sid];
        setMat(clamp, s.clamped ? green : red);
        knife.rotation.z = s.loose ? 0.25 * Math.sin(w.timeS * 6) : 0;
        return true;
      };
      update = (ctx) => {
        const w = ctx.world;
        if (!w.cells.connected) return lcd.set('----', '#8892a0', 'SIN CANAL');
        const on = w.beam.where === 'supports';
        const st = staticsF10(w);
        let R = on && !w.beam.tipped && !w.beam.pivot ? (sid === 'A' ? st.RA : st.RB) : on && w.beam.pivot === sid ? st.W : 0;
        if (!Number.isFinite(R)) R = 0;
        const wob = on && w.timeS < w.beam.settleUntil && !ctx.reducedMotion ? Math.sin(w.timeS * 17 + (sid === 'A' ? 0 : 1.3)) * 0.3 * ((w.beam.settleUntil - w.timeS) / w.params.settleS) : 0;
        const shown = Math.round((R + w.cells[sid].offset + wob) / w.params.cell.resN) * w.params.cell.resN;
        lcd.set(`${r2(shown)} N`, w.cells[sid].tared ? '#6ef09a' : '#f0c36e', w.cells[sid].tared ? `APOYO ${sid}` : `APOYO ${sid} · SIN CERO`);
      };
      break;
    }
    case 'beam': {
      // Viga de 120 × 5 × 3 cm con la escala impresa en la cara frontal; gira sobre el filo en un vuelco.
      const B = G.beam;
      const bar = shadowed(new THREE.Mesh(new THREE.BoxGeometry(B.len, B.h, B.w), own(new THREE.MeshStandardMaterial({ color: 0x9fb1c2, metalness: 0.5, roughness: 0.4 }))));
      const face = new THREE.Mesh(new THREE.PlaneGeometry(B.len - 0.4, B.h * 0.8), own(new THREE.MeshBasicMaterial({ map: own(beamScaleTexture(B.len)) })));
      face.position.set(0, 0, B.w / 2 + 0.02);
      const top = new THREE.Mesh(new THREE.PlaneGeometry(B.len - 0.4, B.w * 0.5), own(new THREE.MeshBasicMaterial({ map: own(beamScaleTexture(B.len)) })));
      top.rotation.x = -Math.PI / 2;
      top.position.set(0, B.h / 2 + 0.02, B.w * 0.2);
      const ends = [-1, 1].map((sx) => {
        const e = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.2, B.h + 0.6, B.w + 0.6), mats.darkMetal));
        e.position.set((sx * B.len) / 2, 0, 0);
        return e;
      });
      const inner = new THREE.Group();
      inner.add(bar, face, top, ...ends, at(hit(new THREE.BoxGeometry(B.len, B.h + 1, B.w + 1), id, 'body'), 0, 0, 0));
      body.add(inner);
      const slingA = strand(cord, 0.12);
      const slingB = strand(cord, 0.12);
      place = (ctx) => {
        const w = ctx.world;
        const p = beamPose(w);
        group.position.set(p.pivotX, p.pivotZ, -p.y);
        group.rotation.set(0, 0, -p.angle);
        inner.position.set(p.x0 + B.len / 2 - p.pivotX, B.h / 2, 0);
        const hung = w.beam.where === 'gantry' && w.objects.beam01.support !== 'hand';
        slingA.visible = slingB.visible = hung;
        if (hung) {
          const h = dynHookRoom();
          stretchC(slingA, v3({ ...h, z: h.z - 1 }), v3(beamPointRoom(w, 30, B.h)));
          stretchC(slingB, v3({ ...h, z: h.z - 1 }), v3(beamPointRoom(w, 90, B.h)));
        }
        return true;
      };
      break;
    }
    case 'load': {
      // Portapesas: gancho con pestillo (rojo abierto, verde cerrado), varilla y discos ranurados.
      const H = G.hanger;
      const hook = shadowed(new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.22, 8, 16, Math.PI * 1.6), mats.steel));
      hook.rotation.z = Math.PI * 0.7;
      hook.position.y = -0.9;
      const latch = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.6, 0.4), red));
      latch.position.set(0.9, -1.2, 0);
      const rod = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, H.hook, 10), mats.steel));
      rod.position.y = -H.hook / 2 - 1;
      body.add(hook, latch, rod);
      const discs = 5;
      for (let i = 0; i < discs; i++) {
        const d = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(H.r, H.r, H.stack / discs - 0.15, seg), i % 2 ? brass : mats.darkMetal));
        d.position.y = -H.hook - (i + 0.5) * (H.stack / discs);
        body.add(d);
      }
      body.add(at(hit(new THREE.CylinderGeometry(H.r, H.r, H.stack, 10), id, 'body'), 0, -H.hook - H.stack / 2, 0));
      body.add(at(hit(new THREE.BoxGeometry(3, 3, 3), id, 'hook'), 0, -1, 0));
      ring = selRing(4);
      ring.position.y = -H.hook - H.stack + 0.06;
      group.add(ring);
      place = (ctx) => {
        const w = ctx.world;
        placeAt(loadRoom(w));
        group.rotation.set(0, 0, w.loads.load1.where === 'bench' ? Math.PI / 2.3 : 0);
        setMat(latch, w.loads.load1.hookClosed ? green : red);
        latch.rotation.z = w.loads.load1.hookClosed ? 0 : 0.8;
        return true;
      };
      break;
    }
    case 'rack': {
      const R = G.loadRack;
      const box = shadowed(new THREE.Mesh(new THREE.BoxGeometry(R.w, R.h, R.d), mats.wood));
      box.position.y = R.h / 2;
      const pad = new THREE.Mesh(new THREE.CircleGeometry(3.4, 20), mats.blackPlastic);
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(-8, R.h + 0.02, 0);
      const cradle = shadowed(new THREE.Mesh(new THREE.BoxGeometry(12, 1, 6), mats.blackPlastic));
      cradle.position.set(8, R.h + 0.5, 0);
      body.add(box, pad, cradle, at(hit(new THREE.BoxGeometry(R.w, R.h, R.d), id, 'body'), 0, R.h / 2, 0));
      place = () => {
        group.position.set(R.x, 0, -R.y);
        return true;
      };
      break;
    }
    case 'gantry': {
      // Pórtico: dos columnas (delante y detrás de la línea de la viga) y travesaño con el gancho del dinamómetro.
      const Gt = G.gantry;
      for (const dy of [-14, 14]) {
        const col = shadowed(new THREE.Mesh(new THREE.BoxGeometry(3, Gt.h, 3), alu));
        col.position.set(0, Gt.h / 2, dy);
        const foot = shadowed(new THREE.Mesh(new THREE.BoxGeometry(16, 1.5, 6), mats.darkMetal));
        foot.position.set(0, 0.75, dy);
        body.add(col, foot);
      }
      const beamTop = shadowed(new THREE.Mesh(new THREE.BoxGeometry(4, 3, 34), alu));
      beamTop.position.y = Gt.h;
      const hookEye = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.2, 6, 14), mats.steel));
      hookEye.position.y = Gt.hookZ;
      body.add(beamTop, hookEye, at(hit(new THREE.BoxGeometry(4, Gt.h, 34), id, 'body'), 0, Gt.h / 2, 0));
      place = () => {
        group.position.set(Gt.x, 0, -Gt.y);
        return true;
      };
      break;
    }
    case 'dynamometer': {
      // Dinamómetro de resorte 0–20 N colgado del pórtico: tubo con escala, indicador rojo, perilla de cero y gancho.
      const L = G.gantry.dynLen;
      const tube = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, L, 20), own(new THREE.MeshStandardMaterial({ color: 0xf2f0e8, roughness: 0.4, transparent: true, opacity: 0.88 }))));
      tube.position.y = -L / 2;
      const face = new THREE.Mesh(new THREE.PlaneGeometry(1.8, L - 1.5), own(new THREE.MeshBasicMaterial({ map: own(dynScaleTexture(w0.params.dyn.rangeN)) })));
      face.position.set(0, -L / 2, 1.42);
      const pointer = shadowed(new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.25, 0.3), red));
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
        group.position.set(G.gantry.x, G.gantry.hookZ, -G.gantry.y);
        body.rotation.z = w.dyn.aimDeg * DEG;
        const p = w.params;
        const W = w.dyn.holding === 'beam' ? p.beamKg * p.g : w.dyn.holding === 'load1' ? p.loadKg * p.g : 0;
        const sway = w.dyn.holding && w.timeS - w.dyn.hungAt < 1.5 && !ctx.reducedMotion ? Math.sin(w.timeS * 14) * 0.6 * (1 - (w.timeS - w.dyn.hungAt) / 1.5) : 0;
        const shown = Math.max(0, Math.min(p.dyn.rangeN * 1.03, W * Math.cos(w.dyn.aimDeg * DEG) + w.dyn.offset + sway));
        pointer.position.set(0, -0.75 - (shown / p.dyn.rangeN) * (L - 1.5 - 0.0), 1.5);
        return true;
      };
      break;
    }
    case 'wedge': {
      // Cuña de equilibrio: prisma triangular de acero con una silla que recibe la viga.
      const W = G.wedge;
      const shape = new THREE.Shape([new THREE.Vector2(-5, 0), new THREE.Vector2(5, 0), new THREE.Vector2(0.4, W.z), new THREE.Vector2(-0.4, W.z)]);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 8, bevelEnabled: false });
      geo.translate(0, 0, -4);
      const m = shadowed(new THREE.Mesh(geo, mats.steel));
      body.add(m, at(hit(new THREE.BoxGeometry(10, W.z, 8), id, 'body'), 0, W.z / 2, 0));
      ring = selRing(6);
      group.add(ring);
      place = () => {
        group.position.set(W.x, 0, -W.y);
        return true;
      };
      break;
    }
    case 'level': {
      // Nivel de burbuja apoyado en la mesada: la burbuja se corre con la inclinación.
      const vial = shadowed(new THREE.Mesh(new THREE.BoxGeometry(12, 1.6, 2.4), alu));
      vial.position.y = 0.8;
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.2), own(new THREE.MeshBasicMaterial({ color: 0xd8f0a0 })));
      glass.rotation.x = -Math.PI / 2;
      glass.position.y = 1.62;
      const marks = [-0.9, 0.9].map((x) => {
        const mk = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 1.2), own(new THREE.MeshBasicMaterial({ color: 0x1b2733 })));
        mk.rotation.x = -Math.PI / 2;
        mk.position.set(x, 1.64, 0);
        return mk;
      });
      const bubble = new THREE.Mesh(new THREE.CircleGeometry(0.5, 16), own(new THREE.MeshBasicMaterial({ color: 0xffffff })));
      bubble.rotation.x = -Math.PI / 2;
      body.add(vial, glass, ...marks, bubble, at(hit(new THREE.BoxGeometry(12.4, 2.4, 3), id, 'body'), 0, 1, 0));
      ring = selRing(7);
      group.add(ring);
      update = (ctx) => {
        const off = Math.max(-2.6, Math.min(2.6, ctx.world.bench.tiltDeg * 1.6));
        bubble.position.set(off, 1.66, 0);
      };
      break;
    }
    case 'tape': {
      // Cinta métrica en su caja amarilla con la punta afuera.
      const box = shadowed(new THREE.Mesh(new RoundedBoxGeometry(6, 6, 2.6, 2, 0.8), mats.plasticYellow));
      box.position.y = 3;
      const blade = shadowed(new THREE.Mesh(new THREE.BoxGeometry(8, 0.1, 1.6), own(new THREE.MeshStandardMaterial({ color: 0xf2d04b, metalness: 0.4, roughness: 0.4 }))));
      blade.position.set(6, 0.1, 0);
      body.add(box, blade, at(hit(new THREE.BoxGeometry(10, 6, 3), id, 'body'), 2, 3, 0));
      ring = selRing(5);
      group.add(ring);
      break;
    }
    case 'caliper': {
      // Calibre digital de 0,01 mm acostado en la mesada, con la pantalla de su última lectura.
      const bar = shadowed(new THREE.Mesh(new THREE.BoxGeometry(18, 0.4, 1.6), mats.chrome));
      bar.position.y = 0.4;
      const jaw = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 4), mats.chrome));
      jaw.position.set(-8.6, 0.4, -1.8);
      const slider = shadowed(new THREE.Mesh(new THREE.BoxGeometry(5, 1.2, 2.6), mats.blackPlastic));
      slider.position.set(-4, 0.7, 0);
      const { lcd, mesh } = lcdScreen(3.6, 1.2, 200, 70);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(-4, 1.32, 0);
      body.add(bar, jaw, slider, mesh, at(hit(new THREE.BoxGeometry(18, 1.6, 4), id, 'body'), 0, 0.6, 0));
      ring = selRing(9);
      group.add(ring);
      update = (ctx) => {
        const w = ctx.world;
        const last = [...w.readingOrder].reverse().map((rid) => w.readings[rid]).find((r) => r.kind === 'diameter');
        lcd.set(last ? `${last.value.toFixed(2)}` : '0.00', '#6ef09a', 'mm');
      };
      break;
    }
    case 'specimen': {
      // Probeta cilíndrica de acero (o aluminio) con cabezas para las mordazas.
      const len = PR.specTop - PR.specBot;
      const metal = w0.params.material === 'aluminium' ? alu : mats.steel;
      const rod = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, len, 12), metal));
      rod.position.y = len / 2;
      const heads = [0, len].map((y) => {
        const hd = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 3, 12), metal));
        hd.position.y = y;
        return hd;
      });
      const marks = [len / 2 - 15, len / 2 + 15].map((y) => {
        const mk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 12), mats.blackPlastic);
        mk.position.y = y;
        return mk;
      });
      const inner = new THREE.Group();
      inner.add(rod, ...heads, ...marks, at(hit(new THREE.CylinderGeometry(1, 1, len, 8), id, 'body'), 0, len / 2, 0));
      body.add(inner);
      ring = selRing(2);
      group.add(ring);
      place = (ctx) => {
        const w = ctx.world;
        const inPress = w.press.specimen === id;
        const p = specimenRoom(w, id);
        placeAt(p);
        if (inPress) {
          inner.rotation.set(0, 0, 0);
          inner.position.set(0, 0, 0);
          inner.scale.set(1, 1 + lift(w) / len, 1);
        } else {
          // En el estante, acostada a lo largo de la cuna.
          inner.rotation.set(0, 0, Math.PI / 2);
          inner.position.set(len / 2, 0.6, 0);
          inner.scale.set(1, 1, 1);
        }
        return true;
      };
      break;
    }
    case 'press': {
      // Bastidor de la prensa: base, dos columnas, travesaño móvil, regla vertical junto a la probeta.
      const base = shadowed(new THREE.Mesh(new THREE.BoxGeometry(PR.baseW, PR.baseH, PR.baseD), mats.darkMetal));
      base.position.y = PR.baseH / 2;
      const cols = [-PR.colX, PR.colX].map((x) => {
        const c = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, PR.colH, 16), mats.chrome));
        c.position.set(x, PR.colH / 2, 0);
        return c;
      });
      const topPlate = shadowed(new THREE.Mesh(new THREE.BoxGeometry(PR.colX * 2 + 6, 4, 8), mats.darkMetal));
      topPlate.position.y = PR.colH;
      const cross = shadowed(new THREE.Mesh(new THREE.BoxGeometry(PR.colX * 2 + 4, PR.head - PR.cellTop, 7), own(new THREE.MeshStandardMaterial({ color: 0x3d6f9e, roughness: 0.45 }))));
      const screw = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, PR.colH - PR.head, 12), brass));
      const lowPost = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, PR.gripBot - PR.baseH, 12), mats.steel));
      lowPost.position.y = (PR.gripBot + PR.baseH) / 2;
      const scale = new THREE.Mesh(new THREE.PlaneGeometry(1.6, PR.specTop - PR.specBot), own(new THREE.MeshBasicMaterial({ map: own(pressScaleTexture(PR.specTop - PR.specBot)) })));
      scale.position.set(3, (PR.specTop + PR.specBot) / 2, 4.02);
      const scaleBack = shadowed(new THREE.Mesh(new THREE.BoxGeometry(2, PR.specTop - PR.specBot, 0.4), alu));
      scaleBack.position.set(3, (PR.specTop + PR.specBot) / 2, 3.8);
      body.add(base, ...cols, topPlate, cross, screw, lowPost, scaleBack, scale);
      body.add(at(hit(new THREE.BoxGeometry(PR.baseW, PR.baseH, PR.baseD), id, 'body'), 0, PR.baseH / 2, 0));
      body.add(at(hit(new THREE.BoxGeometry(PR.colX * 2 + 4, PR.head - PR.cellTop, 7), id, 'head'), 0, (PR.head + PR.cellTop) / 2, 0));
      place = (ctx) => {
        group.position.set(PR.x, 0, -PR.y);
        const l = lift(ctx.world);
        cross.position.y = (PR.head + PR.cellTop) / 2 + l;
        screw.position.y = (PR.colH + PR.head) / 2 + l / 2;
        return true;
      };
      break;
    }
    case 'grip': {
      // Mordaza de cuña: bloque con palanca (verde cerrada) y, en la inferior, el tornillo azul de alineación.
      const top = id === 'gripTop';
      const h = top ? PR.gripTop - PR.specTop : PR.specBot - PR.gripBot;
      const blk = shadowed(new THREE.Mesh(new THREE.BoxGeometry(5, h, 4), mats.darkMetal));
      blk.position.y = h / 2;
      const lever = shadowed(new THREE.Mesh(new THREE.BoxGeometry(5, 0.8, 0.8), red));
      lever.position.set(4.5, h / 2, 1.2);
      body.add(blk, lever);
      body.add(at(hit(new THREE.BoxGeometry(5.4, h, 4.4), id, 'body'), 0, h / 2, 0));
      body.add(at(hit(new THREE.BoxGeometry(6, 2, 2), id, 'lever'), 4.5, h / 2, 1.2));
      let alignB: THREE.Mesh | null = null;
      if (!top) {
        alignB = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.6, 10), blue));
        alignB.rotation.x = Math.PI / 2;
        alignB.position.set(-1.6, h / 2, 2.6);
        body.add(alignB, at(hit(new THREE.BoxGeometry(2, 2, 2.4), id, 'align'), -1.6, h / 2, 2.6));
      }
      place = (ctx) => {
        const w = ctx.world;
        const on = top ? w.press.gripTop : w.press.gripBottom;
        group.position.set(PR.x, top ? PR.specTop + lift(w) : PR.gripBot, -PR.y);
        setMat(lever, on ? green : red);
        lever.rotation.z = on ? 0 : 0.7;
        if (alignB) alignB.position.x = -1.6 + (w.press.specimen ? Math.min(0.6, w.press.eccMm * 2) : 0);
        return true;
      };
      break;
    }
    case 'loadCell': {
      // Celda de carga entre la mordaza superior y el travesaño, con su caja de botones (cero y rango).
      const h = PR.cellTop - PR.gripTop;
      const can = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, h, seg), alu));
      can.position.y = h / 2;
      const boxB = shadowed(new THREE.Mesh(new RoundedBoxGeometry(5, 3, 2, 2, 0.4), own(new THREE.MeshStandardMaterial({ color: 0x2b3a4a, roughness: 0.5 }))));
      boxB.position.set(-6.5, h / 2, 1);
      const zeroB = button(0.6, mats.plasticBlue);
      zeroB.rotation.x = Math.PI / 2;
      zeroB.position.set(-7.6, h / 2, 2.1);
      const rangeB = button(0.6, mats.plasticYellow);
      rangeB.rotation.x = Math.PI / 2;
      rangeB.position.set(-5.4, h / 2, 2.1);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), ledMat());
      led.position.set(-6.5, h / 2 + 1.1, 2.05);
      body.add(can, boxB, zeroB, rangeB, led);
      body.add(at(hit(new THREE.CylinderGeometry(2.6, 2.6, h, 10), id, 'body'), 0, h / 2, 0));
      body.add(at(hit(new THREE.BoxGeometry(1.6, 1.6, 1.4), id, 'zero'), -7.6, h / 2, 2.2));
      body.add(at(hit(new THREE.BoxGeometry(1.6, 1.6, 1.4), id, 'range'), -5.4, h / 2, 2.2));
      place = (ctx) => {
        const w = ctx.world;
        group.position.set(PR.x, PR.gripTop + lift(w), -PR.y);
        setLed(led, w.loadCell.rangeIdx > 0 ? 0x34c759 : 0xf0c36e);
        return true;
      };
      break;
    }
    case 'crank': {
      // Manivela del husillo con su perilla, el freno (rojo puesto, verde suelto) y la palanca amarilla de descarga rápida.
      const wheel = shadowed(new THREE.Mesh(new THREE.TorusGeometry(4, 0.45, 8, seg), mats.darkMetal));
      const spokes = [0, Math.PI / 3, (2 * Math.PI) / 3].map((a) => {
        const s = shadowed(new THREE.Mesh(new THREE.BoxGeometry(8, 0.4, 0.4), mats.darkMetal));
        s.rotation.z = a;
        return s;
      });
      const knob = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 3, 10), mats.plasticYellow));
      knob.rotation.x = Math.PI / 2;
      knob.position.set(4, 0, 1.6);
      const rot = new THREE.Group();
      rot.add(wheel, ...spokes, knob);
      rot.position.z = 1;
      const hub = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 3, 12), mats.steel));
      hub.rotation.x = Math.PI / 2;
      const brake = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1, 4, 1), red));
      brake.position.set(-5.5, -2, 0.5);
      const quick = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1, 3.6, 1), mats.plasticYellow));
      quick.position.set(5.6, -3, 0.5);
      body.add(rot, hub, brake, quick);
      body.add(at(hit(new THREE.CylinderGeometry(4.6, 4.6, 2, 16).rotateX(Math.PI / 2), id, 'wheel'), 0, 0, 1));
      body.add(at(hit(new THREE.BoxGeometry(2, 4.6, 2), id, 'lock'), -5.5, -2, 0.5));
      body.add(at(hit(new THREE.BoxGeometry(2, 4.2, 2), id, 'release'), 5.6, -3, 0.5));
      ring = selRing(5);
      group.add(ring);
      place = (ctx) => {
        const w = ctx.world;
        group.position.set(PR.crankX, PR.crankZ, -PR.y);
        // 0,5 mm por vuelta del husillo.
        rot.rotation.z = -(w.press.u / 0.5) * 2 * Math.PI;
        setMat(brake, w.press.crankLocked ? red : green);
        brake.rotation.z = w.press.crankLocked ? 0 : 0.6;
        quick.visible = w.params.quickRelease;
        return true;
      };
      break;
    }
    case 'shield': {
      // Protector de policarbonato con bisagra a la izquierda: se abre hacia el operador.
      const S = G.shield;
      const glass = own(new THREE.MeshStandardMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.18, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false }));
      const hinge = new THREE.Group();
      hinge.position.set(-S.w / 2, PR.baseH, 0);
      const pane = new THREE.Mesh(new THREE.BoxGeometry(S.w, S.h, 0.4), glass);
      pane.position.set(S.w / 2, S.h / 2, 0);
      const frame = shadowed(new THREE.Mesh(new THREE.BoxGeometry(S.w, 1, 0.8), alu));
      frame.position.set(S.w / 2, S.h, 0);
      const handle = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1, 6, 1.4), mats.blackPlastic));
      handle.position.set(S.w - 1.5, S.h / 2, 1);
      const clip = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 0.8), mats.plasticYellow));
      clip.position.set(S.w - 3, S.h * 0.3, -0.6);
      hinge.add(pane, frame, handle, clip, at(hit(new THREE.BoxGeometry(S.w, S.h, 1.2), id, 'body'), S.w / 2, S.h / 2, 0));
      body.add(hinge);
      place = (ctx) => {
        group.position.set(PR.x, 0, -S.y);
        hinge.rotation.y = ctx.world.press.shieldClosed ? 0 : 1.7;
        return true;
      };
      break;
    }
    case 'gauge': {
      // Comparador digital sujeto a la probeta por dos cuchillas, con su pantalla, botones y el cable al registrador.
      const boxG = shadowed(new THREE.Mesh(new RoundedBoxGeometry(4.4, 6, 2.2, 2, 0.5), own(new THREE.MeshStandardMaterial({ color: 0xe9eef2, roughness: 0.4 }))));
      const { lcd, mesh } = lcdScreen(3.6, 1.6, 220, 96);
      mesh.position.set(0, 1.2, 1.12);
      const stem = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 6, 8), mats.chrome));
      stem.position.y = -5.5;
      const arms = [2.4, -8].map((y) => {
        const a = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 4), mats.steel));
        a.position.set(0, y, -2);
        return a;
      });
      const zeroB = button(0.45, mats.plasticBlue);
      zeroB.rotation.x = Math.PI / 2;
      zeroB.position.set(-1.2, -1.6, 1.15);
      const calB = button(0.45, mats.plasticYellow);
      calB.rotation.x = Math.PI / 2;
      calB.position.set(1.2, -1.6, 1.15);
      const inner = new THREE.Group();
      inner.add(boxG, mesh, stem, ...arms, zeroB, calB);
      inner.add(at(hit(new THREE.BoxGeometry(4.6, 6.2, 2.6), id, 'body'), 0, 0, 0));
      inner.add(at(hit(new THREE.BoxGeometry(1.2, 1.2, 1), id, 'zero'), -1.2, -1.6, 1.3));
      inner.add(at(hit(new THREE.BoxGeometry(1.2, 1.2, 1), id, 'cal'), 1.2, -1.6, 1.3));
      inner.add(at(hit(new THREE.BoxGeometry(1.4, 12, 1.4), id, 'mount'), 0, -5, -2));
      body.add(inner);
      const clipMesh = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), mats.plasticYellow));
      const clipHit = hit(new THREE.BoxGeometry(2.4, 2.4, 2.4), id, 'clip');
      const clipG = roomObj(new THREE.Group());
      clipG.add(clipMesh, clipHit);
      clipG.position.set(PR.x + PR.colX + 2, 30, -(PR.y - 3));
      const cab1 = strand(cable, 0.12);
      const cab2 = strand(cable, 0.12);
      place = (ctx) => {
        const w = ctx.world;
        const g = w.gauge;
        const mounted = !!g.mounted && !!w.press.specimen;
        if (mounted) {
          group.position.set(PR.x - 1.6, PR.gaugeZ + lift(w) * 0.5, -(PR.y - 3));
          inner.rotation.set(0, g.mounted === 'transverse' ? Math.PI / 2 : 0, -g.angleDeg * DEG);
        } else {
          group.position.set(PR.x - 18, 1.1, -(PR.y - 20));
          inner.rotation.set(-Math.PI / 2, 0, 0);
        }
        const from = new THREE.Vector3(group.position.x, group.position.y + 3, group.position.z);
        const loggerP = v3({ x: G.logger.x + 5, y: G.logger.y - G.logger.d / 2, z: 2 });
        const clipP = g.cableRouted ? clipG.position.clone() : v3({ x: PR.x + 4, y: G.shield.y + 1.2, z: 22 });
        cab1.visible = cab2.visible = g.connected;
        stretchC(cab1, from, clipP);
        stretchC(cab2, clipP, loggerP);
        return true;
      };
      update = (ctx) => {
        const w = ctx.world;
        const g = w.gauge;
        if (!g.connected || !g.mounted) return lcd.set('-.---', '#8892a0', 'mm');
        // La pantalla muestra lo que el comparador «ve» (con su escala y su cero); vibra si el travesaño se mueve.
        const sp = w.press.specimen ? w.specimens[w.press.specimen] : null;
        const dL = w.press.elongMm;
        let v = 0;
        if (sp) {
          if (g.mounted === 'transverse') v = -w.params.materials[w.params.material].nu * (dL / w.params.L0mm) * sp.dMm;
          else v = dL * (w.press.gripTop && w.press.gripBottom ? 1 + (8 * w.press.eccMm) / sp.dMm : 1) * Math.cos(g.angleDeg * DEG) + (!g.cableRouted && w.press.shieldClosed ? 0.05 : 0);
        }
        const moving = Math.abs(w.press.target - w.press.u) > 1e-9 || w.timeS < w.press.transientUntil;
        const jitter = moving && !ctx.reducedMotion ? Math.sin(w.timeS * 31) * 0.003 : 0;
        const shown = Math.round((g.scale * v + g.offset + jitter) / w.params.gauge.resMm) * w.params.gauge.resMm;
        lcd.set(shown.toFixed(3), g.zeroed ? '#6ef09a' : '#f0c36e', g.calibrated ? 'mm' : 'mm · SIN CAL');
      };
      break;
    }
    case 'logger': {
      // Registrador: pantalla con F y ΔL, puertos de los tres canales con LED, botones de ritmo, grabar y curva.
      const Lg = G.logger;
      const box = shadowed(new THREE.Mesh(new RoundedBoxGeometry(Lg.w, Lg.h, Lg.d, 2, 0.6), own(new THREE.MeshStandardMaterial({ color: 0x2b3a4a, roughness: 0.5 }))));
      box.position.y = Lg.h / 2;
      const { lcd, mesh } = lcdScreen(14, 3.4, 380, 100);
      mesh.position.set(0, Lg.h * 0.7, Lg.d / 2 + 0.02);
      body.add(box, mesh);
      const ports: Array<[string, number, THREE.Material]> = [['portCells', -5, mats.plasticWhite], ['portPress', 0, mats.plasticYellow], ['portGauge', 5, mats.rubberRed]];
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
      const tops: Array<[string, number, THREE.Material]> = [['rate', -6, mats.plasticBlue], ['rec', 0, mats.rubberRed], ['curve', 6, mats.plasticYellow]];
      const recB: THREE.Mesh[] = [];
      for (const [part, x, mat] of tops) {
        const b = button(0.9, mat);
        b.position.set(x, Lg.h, -Lg.d / 2 + 3);
        if (part === 'rec') recB.push(b);
        body.add(b, at(hit(new THREE.BoxGeometry(2.8, 1.6, 2.8), id, part), x, Lg.h, -Lg.d / 2 + 3));
      }
      body.add(at(hit(new THREE.BoxGeometry(Lg.w, Lg.h, Lg.d), id, 'body'), 0, Lg.h / 2, 0));
      const cellCable = strand(cable, 0.1);
      const pressCable = strand(cable, 0.1);
      update = (ctx) => {
        const w = ctx.world;
        const on = (b: boolean) => (b ? 0x34c759 : 0x444444);
        setLed(portLeds.portCells, on(w.cells.connected));
        setLed(portLeds.portPress, on(w.loadCell.connected));
        setLed(portLeds.portGauge, on(w.gauge.connected));
        cellCable.visible = w.cells.connected;
        pressCable.visible = w.loadCell.connected;
        stretchC(cellCable, v3({ x: G.logger.x - 5, y: G.logger.y - G.logger.d / 2, z: 1.5 }), v3({ x: G.rail.x1, y: G.rail.y, z: 1 }));
        stretchC(pressCable, v3({ x: G.logger.x, y: G.logger.y - G.logger.d / 2, z: 1.5 }), v3({ x: PR.x - 6.5, y: PR.y - 1, z: PR.gripTop + 2 }));
        const rec = loggingF10(w);
        recB[0].scale.setScalar(rec && !ctx.reducedMotion ? 1 + 0.15 * Math.sin(w.timeS * 8) : 1);
        const c = w.loadCell;
        const range = w.params.loadCell.ranges[c.rangeIdx];
        const F = Math.max(-range, Math.min(range, w.press.forceN + c.offset));
        const head = c.connected ? `F ${Math.round(F / w.params.loadCell.resolutions[c.rangeIdx]) * w.params.loadCell.resolutions[c.rangeIdx]} N` : 'LISTO';
        const runs = w.runs.length;
        lcd.set(head, rec ? '#6ef09a' : '#f0c36e', `${w.logger.rateHz} Hz · ${range / 1000} kN · ${rec ? 'REGISTRANDO' : `${runs} curva${runs === 1 ? '' : 's'}`}`);
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

  // Cordones y cables viven en la sala, no dentro del grupo del objeto.
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

export { homeOf, tippingF10 };
