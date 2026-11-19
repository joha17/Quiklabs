/**
 * Vistas 3D procedurales de F05: tablero inclinable con su escala grabada, revestimiento (madera, papel o goma),
 * bisagra, base con abrazadera, pasador superior y tope con espuma; puntal del elevador con manivela, tuerca de
 * bloqueo y escala del soporte; goniómetro de plomada; bloque de madera con gancho y bandera; lastres de 250 g y su
 * estante; tiras de revestimiento en su estante; tirador de husillo en la ménsula con su gancho de altura regulable,
 * motor, retorno y manija; cable con el resorte y la célula de carga; fotopuertas en U montadas sobre el tablero;
 * registrador con pantalla; balanza; termómetro digital; flechas de los diagramas de cuerpo libre sobre el bloque.
 * SOLO leen el estado; cada pieza funcional tiene un colisionador invisible simple (`userData {objId, part}`).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { F05Object, F05World, FbdArrow } from '../../simulation/f05-world/types';
import type { FbdBody } from '../../simulation/f05-world/commands';
import { GEOF05 } from '../../simulation/f05-world/geometry';
import { loadOnBalanceG } from '../../simulation/f05-world/world';
import type { QualityLevel } from '../quality';
import { materials } from '../renderers/materials';
import { lcdTexture } from '../renderers/textures';
import type { FrameCtxF } from './F05Lab3D';
import {
  DEG, ballastRoom, blockHookRoom, blockRoom, blockTilt, elevatorFoot, elevatorTop, gateRoom, goniometerRoom, objRoom, panRoom, planeAt, pullerHookRoom, stripSlot, supportScaleRoom, thetaOf,
} from './layout';

export interface ObjHandleF {
  group: THREE.Group;
  update(ctx: FrameCtxF, o: F05Object): void;
  dispose(): void;
}

const hitMat = () => materials('LOW').hit;
const PL = GEOF05.plane;
const BK = GEOF05.block;
const PU = GEOF05.puller;

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

/** Escala del tablero: cero en la bisagra (izquierda, visto de frente) y crece hacia el extremo alto. */
function planeScaleTexture(lenCm: number, pxPerCm: number): THREE.CanvasTexture {
  const W = Math.min(8192, Math.round(lenCm * pxPerCm));
  const k = W / lenCm;
  const H = 64;
  return canvasTex(W, H, (g) => {
    g.fillStyle = '#f4f1e6';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#1b2733';
    g.fillStyle = '#1b2733';
    g.font = 'bold 22px sans-serif';
    g.textAlign = 'center';
    for (let mm = 0; mm <= lenCm * 10; mm += 2) {
      const p = mm * (k / 10);
      const major = mm % 100 === 0;
      const half = mm % 50 === 0;
      if (!half && mm % 10 && pxPerCm < 20) continue;
      g.lineWidth = major ? 2 : 1;
      g.beginPath();
      g.moveTo(p, 0);
      g.lineTo(p, major ? 30 : half ? 22 : mm % 10 === 0 ? 14 : 8);
      g.stroke();
      if (major) g.fillText(String(mm / 10), Math.max(16, Math.min(W - 16, p)), 54);
    }
  });
}

/** Arco graduado del goniómetro (0–60°, marcas cada 0,5°). */
function protractorTexture(): THREE.CanvasTexture {
  const S = 512;
  return canvasTex(S, S, (g) => {
    g.fillStyle = 'rgba(250,250,245,0.95)';
    g.beginPath();
    g.arc(S / 2, S * 0.1, S * 0.48, 0, Math.PI);
    g.fill();
    g.strokeStyle = '#1b2733';
    g.fillStyle = '#1b2733';
    g.font = 'bold 22px sans-serif';
    g.textAlign = 'center';
    for (let d = -60; d <= 60; d += 0.5) {
      const a = Math.PI / 2 + d * DEG;
      const major = d % 10 === 0;
      const mid = d % 5 === 0;
      const r1 = S * 0.46;
      const r0 = r1 - (major ? 34 : mid ? 22 : Number.isInteger(d) ? 14 : 8);
      g.lineWidth = major ? 2.5 : 1;
      g.beginPath();
      g.moveTo(S / 2 + Math.cos(a) * r0, S * 0.1 + Math.sin(a) * r0);
      g.lineTo(S / 2 + Math.cos(a) * r1, S * 0.1 + Math.sin(a) * r1);
      g.stroke();
      if (major) g.fillText(String(Math.abs(d)), S / 2 + Math.cos(a) * (r0 - 20), S * 0.1 + Math.sin(a) * (r0 - 20) + 8);
    }
  });
}

/** Escala del soporte junto a la bisagra (0–45°, marcas cada grado). */
function supportScaleTexture(): THREE.CanvasTexture {
  const S = 256;
  return canvasTex(S, S, (g) => {
    g.fillStyle = '#e9e4d4';
    g.fillRect(0, 0, S, S);
    g.strokeStyle = '#1b2733';
    g.fillStyle = '#1b2733';
    g.font = 'bold 16px sans-serif';
    for (let d = 0; d <= 45; d++) {
      const a = -d * DEG;
      const r1 = S * 0.9;
      const r0 = r1 - (d % 10 === 0 ? 26 : d % 5 === 0 ? 18 : 10);
      g.lineWidth = d % 5 === 0 ? 2 : 1;
      g.beginPath();
      g.moveTo(10 + Math.cos(a) * r0, S - 10 + Math.sin(a) * r0);
      g.lineTo(10 + Math.cos(a) * r1, S - 10 + Math.sin(a) * r1);
      g.stroke();
      if (d % 10 === 0) g.fillText(String(d), 10 + Math.cos(a) * (r0 - 18) - 6, S - 10 + Math.sin(a) * (r0 - 18) + 6);
    }
  });
}

const SURFACE: Record<string, number> = { wood: 0xc8a06a, paper: 0xf2efe6, rubber: 0x2b2b2b };
const FORCE_COLOR: Record<string, number> = { weight: 0x1565c0, normal: 0x2e9d57, tension: 0xe67e22, friction: 0x8e44ad };

/** Dirección de cada flecha en la escena (x a lo largo de la mesada, y arriba) para la inclinación θ (°). */
function dirVec(dir: string, thetaDeg: number): THREE.Vector3 {
  const t = thetaDeg * DEG;
  switch (dir) {
    case 'up': return new THREE.Vector3(0, 1, 0);
    case 'down': return new THREE.Vector3(0, -1, 0);
    case 'perp': return new THREE.Vector3(-Math.sin(t), Math.cos(t), 0);
    case 'upSlope': return new THREE.Vector3(Math.cos(t), Math.sin(t), 0);
    default: return new THREE.Vector3(-Math.cos(t), -Math.sin(t), 0);
  }
}

/** Flechas del diagrama de cuerpo libre dibujadas sobre el bloque (se rehacen cuando cambia el diagrama o el ángulo). */
function fbdLayer(body: FbdBody) {
  const g = new THREE.Group();
  g.renderOrder = 10;
  let key = '';
  const update = (w: F05World) => {
    const f = w.fbd[body];
    const th = Math.round(blockTilt(w) * 2) / 2;
    const k = f ? `${f.locked}|${th}|${f.arrows.map((a: FbdArrow) => `${a.force}:${a.dir}`).join(',')}` : '';
    if (k === key) return;
    key = k;
    for (const c of [...g.children]) {
      g.remove(c);
      (c as THREE.ArrowHelper).dispose?.();
    }
    if (!f) return;
    const count: Record<string, number> = {};
    for (const a of f.arrows) {
      const n = (count[a.dir] = (count[a.dir] ?? 0) + 1) - 1;
      const dir = dirVec(a.dir, th);
      const off = new THREE.Vector3(-dir.y, dir.x, 0).multiplyScalar(n * 2.5);
      const len = a.force === 'weight' || a.force === 'normal' ? 11 : a.force === 'friction' ? 6 : 10;
      const arrow = new THREE.ArrowHelper(dir, off, len, FORCE_COLOR[a.force] ?? 0x333333, 2.6, 1.6);
      (arrow.line.material as THREE.Material).depthTest = false;
      (arrow.cone.material as THREE.Material).depthTest = false;
      arrow.renderOrder = 10;
      g.add(arrow);
    }
  };
  return { group: g, update };
}

/** Cilindro entre dos puntos de la escena (puntal, cable, resorte). */
function stretch(m: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
  const d = b.clone().sub(a);
  const len = Math.max(0.01, d.length());
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.scale.set(1, len, 1);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
}
const sv = (p: { x: number; y: number; z: number }) => new THREE.Vector3(p.x, p.z, -p.y);

export function createObjVisualF(o: F05Object, _w0: F05World, q: QualityLevel, ghost?: () => { x: number; y: number; z: number } | null): ObjHandleF {
  const mats = materials(q);
  const seg = q === 'LOW' ? 14 : q === 'MEDIUM' ? 24 : 36;
  const group = new THREE.Group();
  const disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];
  let ring: THREE.Mesh | null = null;
  let update: ObjHandleF['update'] = () => undefined;
  let place: ((ctx: FrameCtxF, ob: F05Object) => boolean) | null = null;
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
  const roomLevel: THREE.Object3D[] = [];
  const fbdOf = (b: FbdBody) => {
    const l = fbdLayer(b);
    roomLevel.push(l.group);
    return l;
  };
  const roomObj = <O extends THREE.Object3D>(x: O): O => {
    roomLevel.push(x);
    return x;
  };

  switch (o.kind) {
    case 'plane': {
      // Base sobre la mesada con la bisagra a la izquierda y la abrazadera del pie del elevador.
      const Bs = GEOF05.base;
      const base = shadowed(new THREE.Mesh(new THREE.BoxGeometry(Bs.len, Bs.h, Bs.w), mats.darkMetal));
      base.position.set(Bs.len / 2 - 2, Bs.h / 2, 0);
      const hingeBlock = shadowed(new THREE.Mesh(new THREE.BoxGeometry(4, PL.hingeZ + PL.thick - Bs.h, PL.w + 2), mats.darkMetal));
      hingeBlock.position.set(0, Bs.h + (PL.hingeZ + PL.thick - Bs.h) / 2 - 1, 0);
      const clampJaw = shadowed(new THREE.Mesh(new THREE.BoxGeometry(5, 3, 3), mats.darkMetal));
      const clampKnob = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.8, 12), red));
      const supScale = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), own(new THREE.MeshBasicMaterial({ map: own(supportScaleTexture()), transparent: true })));
      supScale.position.set(2.5, PL.hingeZ - 2.5, Bs.w / 2 + 0.05);
      body.add(base, hingeBlock, clampJaw, clampKnob, supScale);
      const hClamp = hit(new THREE.BoxGeometry(6, 5, 5), id, 'clamp');
      body.add(hClamp);
      // Tablero (gira alrededor de la bisagra): cara superior en y = 0 local, escala en el canto frontal.
      const board = new THREE.Group();
      const slab = shadowed(new THREE.Mesh(new THREE.BoxGeometry(PL.length, PL.thick, PL.w), mats.wood));
      slab.position.set(PL.length / 2, -PL.thick / 2, 0);
      const surfMat = own(new THREE.MeshStandardMaterial({ color: SURFACE.wood, roughness: 0.8 }));
      const surf = new THREE.Mesh(new THREE.PlaneGeometry(PL.length - 2, PL.w - 1), surfMat);
      surf.rotation.x = -Math.PI / 2;
      surf.position.set(PL.length / 2, 0.03, 0);
      surf.receiveShadow = true;
      const scale = new THREE.Mesh(new THREE.PlaneGeometry(PL.length, 1.8), own(new THREE.MeshBasicMaterial({ map: own(planeScaleTexture(PL.length, 24)) })));
      scale.position.set(PL.length / 2, -1, PL.w / 2 + 0.02);
      // Ménsula del tirador (prolonga el tablero hasta s = 1,24).
      const bracket = shadowed(new THREE.Mesh(new THREE.BoxGeometry(26, 1.4, 6), alu));
      bracket.position.set(PL.length + 12, -0.7, 0);
      // Pasador del extremo alto (sube cuando retiene el bloque).
      const pin = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 4, 10), mats.chrome));
      const pinKnob = shadowed(new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), mats.rubberRed));
      board.add(slab, surf, scale, bracket, pin, pinKnob);
      board.add(at(hit(new THREE.BoxGeometry(PL.length, PL.thick + 0.4, PL.w), id, 'board'), PL.length / 2, -PL.thick / 2, 0));
      const hPin = hit(new THREE.BoxGeometry(3, 5, 3), id, 'pin');
      board.add(hPin);
      body.add(board);
      ring = selRing(14);
      group.add(ring);
      place = (ctx) => {
        const w = ctx.world;
        group.position.set(PL.hingeX, 0, -PL.y);
        board.position.set(0, PL.hingeZ + PL.thick, 0);
        board.rotation.z = thetaOf(w) * DEG;
        const m = w.surface.material;
        surfMat.color.setHex(SURFACE[m]);
        if (w.surface.worn[m]) surfMat.color.multiplyScalar(0.78);
        const pinX = GEOF05.pin.s * 100 + 1.2;
        const up = w.block.pinned ? 2 : 0.3;
        pin.position.set(pinX, up - 1, PL.w / 2 - 3);
        pinKnob.position.set(pinX, up + 1.4, PL.w / 2 - 3);
        hPin.position.set(pinX, up, PL.w / 2 - 3);
        const jawY = w.plane.clamped ? Bs.h + 1.5 : Bs.h + 3.5;
        const footX = GEOF05.base.elevatorS * 100;
        clampJaw.position.set(footX, jawY, -Bs.w / 2 - 2);
        clampKnob.position.set(footX, jawY + 2.2, -Bs.w / 2 - 2);
        hClamp.position.set(footX, Bs.h + 2, -Bs.w / 2 - 2);
        ring!.position.set(50, 0.06, 0);
        return true;
      };
      break;
    }
    case 'elevator': {
      // Puntal de tornillo desde el pie (sobre la base) hasta el tablero, con manivela y tuerca de bloqueo.
      const strut = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1, 12), mats.chrome));
      const sleeve = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 1, 12), mats.darkMetal));
      const foot = shadowed(new THREE.Mesh(new THREE.BoxGeometry(5, 2, 5), mats.darkMetal));
      const crank = new THREE.Group();
      const arm = shadowed(new THREE.Mesh(new THREE.BoxGeometry(5, 0.6, 0.6), mats.darkMetal));
      arm.position.x = 2.5;
      const knob = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 2.2, 10), mats.blackPlastic));
      knob.position.set(5, 1.1, 0);
      crank.add(arm, knob);
      const nut = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 1.2, 6), red));
      for (const m of [strut, sleeve, foot, nut]) roomObj(m);
      roomObj(crank);
      const hCrank = roomObj(hit(new THREE.BoxGeometry(7, 4, 4), id, 'crank'));
      const hLock = roomObj(hit(new THREE.CylinderGeometry(2.4, 2.4, 2, 8), id, 'lock'));
      const hScale = roomObj(hit(new THREE.BoxGeometry(10, 10, 1), id, 'scale'));
      const hBody = roomObj(hit(new THREE.CylinderGeometry(1.6, 1.6, 1, 8), id, 'body'));
      update = (ctx) => {
        const w = ctx.world;
        const a = sv(elevatorFoot());
        const b = sv(elevatorTop(w));
        foot.position.copy(a).add(new THREE.Vector3(0, 1, 0));
        const mid = a.clone().lerp(b, 0.4);
        stretch(strut, a, b);
        stretch(sleeve, a, mid);
        stretch(hBody, a, b);
        nut.position.copy(mid);
        nut.quaternion.copy(strut.quaternion);
        hLock.position.copy(mid);
        hLock.quaternion.copy(strut.quaternion);
        (nut.material as THREE.MeshStandardMaterial) = w.plane.locked ? green : red;
        crank.position.copy(a).add(new THREE.Vector3(0, 2.5, -4));
        crank.rotation.z = w.plane.relDeg * 0.8;
        hCrank.position.copy(crank.position).add(new THREE.Vector3(2.5, 0.5, 0));
        const sc = supportScaleRoom();
        hScale.position.set(sc.x - 2, sc.z - 2, -sc.y + 0.5);
      };
      break;
    }
    case 'goniometer': {
      const face = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), own(new THREE.MeshBasicMaterial({ map: own(protractorTexture()), transparent: true, side: THREE.DoubleSide })));
      const needle = new THREE.Group();
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.12, 5.4, 0.05), own(new THREE.MeshBasicMaterial({ color: 0xd0021b })));
      line.position.y = -2.7;
      const bob = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1, 10), brass);
      bob.position.y = -5.6;
      bob.rotation.x = Math.PI;
      needle.add(line, bob);
      body.add(face, needle);
      body.add(at(hit(new THREE.BoxGeometry(12, 7, 1), id, 'face'), 0, -3, 0));
      ring = selRing(4);
      group.add(ring);
      place = (ctx) => {
        const w = ctx.world;
        const p = goniometerRoom(w);
        group.position.set(p.x, p.z, -p.y);
        // El arco gira con el tablero; la plomada cuelga siempre vertical (marca θ sobre el arco).
        face.rotation.z = thetaOf(w) * DEG;
        face.position.set(0, 0, 0.02);
        needle.rotation.z = 0;
        needle.position.set(0, 0, 0.08);
        return true;
      };
      break;
    }
    case 'catcher': {
      const stop = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.2, 5, PL.w - 2), mats.darkMetal));
      const foam = shadowed(new THREE.Mesh(new THREE.BoxGeometry(2, 4, PL.w - 4), own(new THREE.MeshStandardMaterial({ color: 0xf2c94c, roughness: 0.95 }))));
      body.add(stop, foam);
      const hb = hit(new THREE.BoxGeometry(4, 6, PL.w - 2), id, 'body');
      body.add(hb);
      place = (ctx) => {
        const w = ctx.world;
        const p = planeAt(w, GEOF05.catcher.s, 0);
        group.position.set(p.x, p.z, -p.y);
        body.rotation.z = thetaOf(w) * DEG;
        stop.position.set(-0.6, 2.5, 0);
        foam.position.set(1, 2, 0);
        foam.visible = w.catcherOn;
        hb.position.set(0.5, 2.5, 0);
        return true;
      };
      break;
    }
    case 'block': {
      const woodMat = own(new THREE.MeshStandardMaterial({ color: 0x9c6b3c, roughness: 0.75 }));
      const shell = shadowed(new THREE.Mesh(new RoundedBoxGeometry(BK.len, BK.h, BK.w, 2, 0.3), woodMat));
      shell.position.y = BK.h / 2;
      const flag = shadowed(new THREE.Mesh(new THREE.BoxGeometry(BK.flagW, BK.flagH, 0.15), mats.blackPlastic));
      const hook = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.15, 6, 14), mats.chrome));
      hook.position.set(BK.len / 2 + 0.6, BK.hookZ, 0);
      hook.rotation.y = Math.PI / 2;
      const peg = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 3, 8), mats.chrome));
      peg.position.set(0, BK.h + 1.5, 0);
      body.add(shell, flag, hook, peg);
      body.add(at(hit(new THREE.BoxGeometry(BK.len, BK.h, BK.w), id, 'body'), 0, BK.h / 2, 0));
      body.add(at(hit(new THREE.BoxGeometry(2.4, 2.4, 2.4), id, 'hook'), BK.len / 2 + 0.8, BK.hookZ, 0));
      const hFlag = hit(new THREE.BoxGeometry(2, BK.flagH, 1.2), id, 'flag');
      body.add(hFlag);
      const fbdP = fbdOf('blockPull');
      const fbdS = fbdOf('blockSlide');
      ring = selRing(7);
      group.add(ring);
      place = (ctx) => {
        const w = ctx.world;
        const g = ghost?.();
        const c = g ?? blockRoom(w);
        group.position.set(c.x, c.z, -c.y);
        body.rotation.z = g ? (w.block.on === 'plane' ? thetaOf(w) * DEG : 0) : blockTilt(w) * DEG;
        // La bandera va a un costado (hacia el fondo) para cruzar el haz de las compuertas; torcida tras un golpe.
        flag.position.set(-2, BK.h + BK.flagH / 2, -BK.w / 2 + 0.6);
        flag.rotation.set(0, w.block.flagBent ? 0.6 : 0, 0);
        hFlag.position.copy(flag.position);
        const top = blockRoom(w);
        const th = blockTilt(w) * DEG;
        fbdP.group.position.set(top.x - Math.sin(th) * (BK.h / 2), top.z + Math.cos(th) * (BK.h / 2), -top.y + BK.w / 2 + 1.5);
        fbdS.group.position.set(top.x - Math.sin(th) * (BK.h / 2), top.z + Math.cos(th) * (BK.h / 2), -top.y - BK.w / 2 - 1.5);
        fbdP.update(w);
        fbdS.update(w);
        return true;
      };
      break;
    }
    case 'ballast': {
      const disc = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 2.6, seg, 1, false, 0.3, Math.PI * 2 - 0.6), brass));
      disc.position.y = 1.3;
      body.add(disc);
      body.add(at(hit(new THREE.CylinderGeometry(2.5, 2.5, 2.8, 10), id, 'body'), 0, 1.3, 0));
      ring = selRing(3);
      group.add(ring);
      place = (ctx, ob) => {
        const w = ctx.world;
        const p = ob.support === 'hand' ? ob.pose : ballastRoom(w, id);
        group.position.set(p.x, p.z, -p.y);
        body.rotation.z = ob.support === 'block01' ? blockTilt(w) * DEG : ob.support === 'bench' ? Math.PI / 2 - 0.2 : 0;
        body.position.y = ob.support === 'bench' ? 2.2 : 0;
        return true;
      };
      break;
    }
    case 'massRack': {
      const R = GEOF05.massRack;
      const base = shadowed(new THREE.Mesh(new THREE.BoxGeometry(R.w, R.h, R.d), mats.wood));
      base.position.y = R.h / 2;
      body.add(base);
      body.add(at(hit(new THREE.BoxGeometry(R.w, R.h, R.d), id, 'body'), 0, R.h / 2, 0));
      break;
    }
    case 'stripRack': {
      const S = GEOF05.stripRack;
      const base = shadowed(new THREE.Mesh(new THREE.BoxGeometry(S.w, S.h, S.d), mats.wood));
      base.position.y = S.h / 2;
      // Taco de lija para volver a la madera desnuda.
      const pad = shadowed(new THREE.Mesh(new THREE.BoxGeometry(5, 1.4, 4), own(new THREE.MeshStandardMaterial({ color: SURFACE.wood, roughness: 0.9 }))));
      pad.position.set(0, S.h + 0.7, 3);
      body.add(base, pad);
      body.add(at(hit(new THREE.BoxGeometry(S.w, S.h, S.d), id, 'body'), 0, S.h / 2, 0));
      body.add(at(hit(new THREE.BoxGeometry(6, 2.4, 5), id, 'wood'), 0, S.h + 0.7, 3));
      break;
    }
    case 'strip': {
      const mat = id === 'stripRubber' ? SURFACE.rubber : SURFACE.paper;
      const plate = shadowed(new THREE.Mesh(new THREE.BoxGeometry(10, 0.4, 7), own(new THREE.MeshStandardMaterial({ color: mat, roughness: 0.9 }))));
      plate.position.y = 0.2;
      body.add(plate);
      body.add(at(hit(new THREE.BoxGeometry(10, 1.2, 7), id, 'body'), 0, 0.4, 0));
      place = (ctx, ob) => {
        // Montada en el tablero, la tira es el revestimiento dibujado por el tablero.
        group.visible = ob.support !== 'plane';
        const p = stripSlot(id);
        group.position.set(p.x, p.z, -p.y);
        void ctx;
        return true;
      };
      break;
    }
    case 'puller': {
      // Carro del husillo con su gancho (altura regulable), motor, botón de retorno, manija de tirón y manivela.
      const carriage = shadowed(new THREE.Mesh(new THREE.BoxGeometry(3, 2.4, 5), alu));
      const post = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1, 8), mats.chrome));
      const motor = shadowed(new THREE.Mesh(new RoundedBoxGeometry(5, 4, 5, 2, 0.6), own(new THREE.MeshStandardMaterial({ color: 0x2b3a4a, roughness: 0.5 }))));
      const motorBtn = button(0.8, mats.plasticYellow);
      const retBtn = button(0.8, mats.plasticBlue);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), ledMat());
      const crank = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.6, 14), mats.blackPlastic));
      const handle = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.8, 4, 0.8), red));
      for (const m of [carriage, post, motor, motorBtn, retBtn, led, crank, handle]) body.add(m);
      const hMotor = hit(new THREE.BoxGeometry(2.4, 2.4, 2.4), id, 'motor');
      const hRet = hit(new THREE.BoxGeometry(2.4, 2.4, 2.4), id, 'return');
      const hCrank = hit(new THREE.BoxGeometry(4, 4, 2), id, 'crank');
      const hHandle = hit(new THREE.BoxGeometry(2, 5, 2), id, 'handle');
      const hHeight = hit(new THREE.BoxGeometry(2.4, 6, 2.4), id, 'height');
      const hBody = hit(new THREE.BoxGeometry(6, 4, 6), id, 'body');
      for (const m of [hMotor, hRet, hCrank, hHandle, hHeight, hBody]) body.add(m);
      ring = selRing(5);
      group.add(ring);
      place = (ctx) => {
        const w = ctx.world;
        const th = thetaOf(w) * DEG;
        const base = planeAt(w, PU.s0, 0);
        group.position.set(base.x, base.z, -PL.y);
        body.rotation.z = th;
        const px = (w.puller.p - PU.s0) * 100;
        carriage.position.set(px, 1.2, 0);
        const hz = w.puller.heightCm;
        post.scale.y = hz;
        post.position.set(px, hz / 2, 0);
        hHeight.position.set(px, hz / 2 + 1, 0);
        motor.position.set((PU.s1 - PU.s0) * 100 + 3.5, 2, 0);
        motorBtn.position.set((PU.s1 - PU.s0) * 100 + 2, 4.3, 1.2);
        retBtn.position.set((PU.s1 - PU.s0) * 100 + 5, 4.3, 1.2);
        led.position.set((PU.s1 - PU.s0) * 100 + 3.5, 4.3, -1.6);
        hMotor.position.copy(motorBtn.position);
        hRet.position.copy(retBtn.position);
        crank.rotation.x = Math.PI / 2;
        crank.position.set((PU.s1 - PU.s0) * 100 + 3.5, 2, 3.2);
        crank.rotation.y = w.puller.p * 600;
        hCrank.position.copy(crank.position);
        handle.position.set(px + 1.8, 3.2, 2.6);
        hHandle.position.copy(handle.position);
        hBody.position.set(px, 1.2, 0);
        (led.material as THREE.MeshBasicMaterial).color.setHex(w.puller.driveMs > 0 ? 0x34c759 : 0x444444);
        return true;
      };
      break;
    }
    case 'loadCell': {
      const cell = new THREE.Group();
      const box = shadowed(new THREE.Mesh(new RoundedBoxGeometry(4, 2.2, 2.6, 2, 0.4), own(new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.5 }))));
      const zeroBtn = button(0.45, mats.plasticBlue);
      zeroBtn.position.set(0.4, 1.2, 0);
      const calBtn = button(0.45, mats.plasticYellow);
      calBtn.position.set(1.5, 1.2, 0);
      const rngBtn = button(0.45, mats.plasticWhite);
      rngBtn.position.set(-0.7, 1.2, 0);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), ledMat());
      led.position.set(-1.6, 1.2, 0);
      cell.add(box, zeroBtn, calBtn, rngBtn, led);
      cell.add(at(hit(new THREE.BoxGeometry(4, 2.2, 2.6), id, 'body'), 0, 0, 0));
      cell.add(at(hit(new THREE.BoxGeometry(1.2, 1.2, 1.2), id, 'zero'), 0.4, 1.3, 0));
      cell.add(at(hit(new THREE.BoxGeometry(1.2, 1.2, 1.2), id, 'cal'), 1.5, 1.3, 0));
      cell.add(at(hit(new THREE.BoxGeometry(1.2, 1.2, 1.2), id, 'range'), -0.7, 1.3, 0));
      cell.add(at(hit(new THREE.BoxGeometry(1.2, 1.2, 1.2), id, 'plug'), -1.6, 1.3, 0));
      body.add(cell);
      ring = selRing(3);
      group.add(ring);
      place = (ctx) => {
        const w = ctx.world;
        const h = pullerHookRoom(w);
        group.position.set(h.x, h.z, -h.y);
        cell.position.set(-2.2, 0, 0);
        cell.rotation.set(0, w.sensor.angleDeg * DEG, thetaOf(w) * DEG);
        const s = w.sensor;
        (led.material as THREE.MeshBasicMaterial).color.setHex(!s.connected ? 0x444444 : s.calibrated && s.zeroed ? 0x34c759 : 0xf0c36e);
        return true;
      };
      break;
    }
    case 'spring': {
      // Cable desde el gancho del bloque hasta la célula, con el resorte del dinamómetro en el extremo del tirador.
      const cable = roomObj(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1, 6), own(new THREE.MeshStandardMaterial({ color: 0x3b3024 }))));
      const coil = roomObj(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1, 10, 1, true), own(new THREE.MeshStandardMaterial({ color: 0x9aa3ab, metalness: 0.8, roughness: 0.3, wireframe: true }))));
      const hb = roomObj(hit(new THREE.CylinderGeometry(1, 1, 1, 6), id, 'body'));
      update = (ctx) => {
        const w = ctx.world;
        const attached = w.puller.attached && w.block.on === 'plane';
        cable.visible = coil.visible = attached;
        const cellEnd = pullerHookRoom(w);
        const th = thetaOf(w) * DEG;
        const cell = { x: cellEnd.x - 4.4 * Math.cos(th), y: cellEnd.y, z: cellEnd.z - 4.4 * Math.sin(th) };
        if (!attached) {
          const tip = sv(cell);
          stretch(coil, tip, tip.clone().add(new THREE.Vector3(-3 * Math.cos(th), -3 * Math.sin(th), 0)));
          coil.visible = true;
          stretch(hb, tip, tip.clone().add(new THREE.Vector3(-3, 0, 0)));
          return;
        }
        const a = sv(blockHookRoom(w));
        const b = sv(cell);
        const springLen = 3 + w.puller.ext * 100;
        const dir = b.clone().sub(a);
        const L = dir.length();
        const k = Math.max(0, 1 - springLen / Math.max(1, L));
        const joint = a.clone().add(dir.multiplyScalar(k));
        // Cable flojo: cuelga un poco en el medio.
        if (w.puller.tensionN < 0.01) joint.y -= 0.4;
        stretch(cable, a, joint);
        stretch(coil, joint, b);
        stretch(hb, a, b);
      };
      break;
    }
    case 'logger': {
      const Lg = GEOF05.logger;
      const box = shadowed(new THREE.Mesh(new RoundedBoxGeometry(Lg.w, Lg.h, Lg.d, 2, 0.6), own(new THREE.MeshStandardMaterial({ color: 0x2b3a4a, roughness: 0.5 }))));
      box.position.y = Lg.h / 2;
      const { lcd, mesh } = lcdScreen(13, 3.6, 360, 100);
      mesh.position.set(0, Lg.h * 0.68, Lg.d / 2 + 0.02);
      body.add(box, mesh);
      const ports: Array<[string, number, THREE.Material]> = [['portL', -4.5, mats.plasticWhite], ['portG', -1.5, mats.plasticYellow], ['portV', 1.5, mats.plasticBlue]];
      const portLeds: Record<string, THREE.Mesh> = {};
      for (const [part, x, mat] of ports) {
        const b = button(0.7, mat);
        b.rotation.x = Math.PI / 2;
        b.position.set(x, 1.6, Lg.d / 2 + 0.2);
        const led = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), ledMat());
        led.position.set(x, 2.9, Lg.d / 2 + 0.1);
        portLeds[part] = led;
        body.add(b, led, at(hit(new THREE.BoxGeometry(2.4, 2.4, 1.4), id, part), x, 1.6, Lg.d / 2 + 0.3));
      }
      const rateBtn = button(0.8, mats.plasticBlue);
      rateBtn.position.set(Lg.w / 2 - 2, Lg.h, -Lg.d / 2 + 2.5);
      body.add(rateBtn, at(hit(new THREE.BoxGeometry(2.6, 1.6, 2.6), id, 'rate'), Lg.w / 2 - 2, Lg.h, -Lg.d / 2 + 2.5));
      body.add(at(hit(new THREE.BoxGeometry(Lg.w, Lg.h, Lg.d), id, 'body'), 0, Lg.h / 2, 0));
      update = (ctx) => {
        const w = ctx.world;
        const on = (b: boolean) => (b ? 0x34c759 : 0x444444);
        (portLeds.portL.material as THREE.MeshBasicMaterial).color.setHex(on(w.sensor.connected));
        (portLeds.portG.material as THREE.MeshBasicMaterial).color.setHex(on(w.logger.gatesConnected));
        (portLeds.portV.material as THREE.MeshBasicMaterial).color.setHex(on(w.logger.videoOn));
        const pull = w.pull && !w.pull.done ? w.pull : null;
        const slide = w.slide && !w.slide.done ? w.slide : null;
        const last = pull?.samples[pull.samples.length - 1];
        const sl = slide?.samples[slide.samples.length - 1];
        const head = last ? `F ${last[1].toFixed(2)} N` : sl ? `x ${sl[1].toFixed(1)} cm` : 'LISTO';
        lcd.set(head, last || sl ? '#6ef08a' : '#f0c36e', `${w.logger.rateHz} Hz · ${pull || slide ? 'REGISTRANDO' : `${w.pulls.length + w.slides.length} ensayos`}`);
      };
      break;
    }
    case 'gate': {
      const G = GEOF05.gate;
      const frame = new THREE.Group();
      const postA = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.4, G.h, 1.4), mats.blackPlastic));
      postA.position.set(0, G.h / 2 - 2, -PL.w / 2 - 1.5);
      const postB = postA.clone();
      postB.position.z = PL.w / 2 + 1.5;
      const top = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, PL.w + 4.4), mats.blackPlastic));
      top.position.y = G.h - 2;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, PL.w + 3, 6), own(new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.6 })));
      beam.rotation.x = Math.PI / 2;
      beam.position.y = G.beamDz;
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), ledMat());
      led.position.set(0, G.h - 1, PL.w / 2 + 2.4);
      const index = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.4, 0.2), own(new THREE.MeshBasicMaterial({ color: 0xd0021b })));
      index.position.set(0, -1.4, PL.w / 2 + 0.3);
      frame.add(postA, postB, top, beam, led, index);
      body.add(frame);
      frame.add(at(hit(new THREE.BoxGeometry(2, G.h, PL.w + 5), id, 'mount'), 0, G.h / 2 - 2, 0));
      frame.add(at(hit(new THREE.BoxGeometry(2, 3, 1.6), id, 'index'), 0, -1.4, PL.w / 2 + 0.8));
      ring = selRing(5);
      group.add(ring);
      place = (ctx) => {
        const w = ctx.world;
        const g = gateRoom(w, id);
        group.position.set(g.x, g.z, -g.y);
        frame.rotation.set(0, 0, thetaOf(w) * DEG);
        const blocked = w.gates[id]?.blocked;
        (led.material as THREE.MeshBasicMaterial).color.setHex(!w.logger.gatesConnected ? 0x444444 : blocked ? 0xff3b30 : 0x34c759);
        return true;
      };
      break;
    }
    case 'balance': {
      const Bl = GEOF05.balance;
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
    case 'thermometer': {
      const stand = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.8, 1, 16), mats.darkMetal));
      stand.position.y = 0.5;
      const stem = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 12, 10), mats.chrome));
      stem.position.y = 7;
      const head = shadowed(new THREE.Mesh(new RoundedBoxGeometry(5, 3.4, 1.6, 2, 0.4), mats.plasticWhite));
      head.position.y = 13.5;
      const { lcd, mesh } = lcdScreen(4, 1.8, 200, 90);
      mesh.position.set(0, 13.6, 0.82);
      body.add(stand, stem, head, mesh);
      body.add(at(hit(new THREE.BoxGeometry(5, 15, 3), id, 'body'), 0, 7.5, 0));
      update = (ctx) => {
        const w = ctx.world;
        lcd.set(`${w.params.roomC.toFixed(1)} °C`, '#6ef08a', 'SALA');
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
      if (m.isMesh && m.geometry && !(c.parent instanceof THREE.ArrowHelper)) disposables.push(m.geometry);
    });
  }

  // Las piezas que se estiran entre dos puntos y las flechas de los diagramas viven en la sala, no dentro del grupo.
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

export { panRoom };
