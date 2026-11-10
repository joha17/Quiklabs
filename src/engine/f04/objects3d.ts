/**
 * Vistas 3D procedurales de F04: carril de aluminio nivelable con escala, patas y tornillo de nivel; carro con bandera,
 * ruedas, presilla del cable, sensor de fuerza A en el gancho y acelerómetro; pestillo de liberación; freno magnético
 * desplazable; tope con amortiguador; polea con abrazadera y el cordel (horizontal, sobre la garganta o el eje, y
 * vertical hasta el portapesas, con su holgura); portapesas y pesas ranuradas; estante; fotopuertas en U con LED;
 * interfaz de adquisición con pantalla; balanza con plato y pantalla; pista corta de la pareja con dos carros, sus
 * sensores enfrentados en los parachoques y la mano que empuja; flechas de los diagramas de cuerpo libre sobre los
 * cuerpos. SOLO leen el estado; cada pieza funcional tiene un colisionador invisible simple (`userData {objId, part}`).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { F04Object, F04World, FbdArrow } from '../../simulation/f04-world/types';
import type { FbdBody } from '../../simulation/f04-world/commands';
import { FLOOR_Z, GEOF04, STRING_Z, trackX } from '../../simulation/f04-world/geometry';
import { loadOnBalanceG } from '../../simulation/f04-world/world';
import type { QualityLevel } from '../quality';
import { materials } from '../renderers/materials';
import { lcdTexture } from '../renderers/textures';
import type { FrameCtxF } from './F04Lab3D';
import { DEG, cartRoom, dropX, gateRoom, hangerRoom, hookRoom, objRoom, pairCartRoom, panRoom, railZ, slotH, slotRoom } from './layout';

export interface ObjHandleF {
  group: THREE.Group;
  update(ctx: FrameCtxF, o: F04Object): void;
  dispose(): void;
}

const hitMat = () => materials('LOW').hit;
const T = GEOF04.track;
const C = GEOF04.cart;
const PT = GEOF04.pairTrack;
const PC = GEOF04.pairCart;

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

/** Escala del carril: cero en el extremo de liberación (derecha, visto de frente) y crece hacia la polea. */
function trackScaleTexture(lenCm: number, pxPerCm: number): THREE.CanvasTexture {
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
      const p = W - mm * (k / 10);
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

const FORCE_COLOR: Record<string, number> = { weight: 0x1565c0, normal: 0x2e9d57, tension: 0xe67e22, friction: 0x8e44ad, push: 0xd0021b, contact: 0x00897b };
const DIR_VEC: Record<string, THREE.Vector3> = {
  up: new THREE.Vector3(0, 1, 0), down: new THREE.Vector3(0, -1, 0), left: new THREE.Vector3(-1, 0, 0), right: new THREE.Vector3(1, 0, 0),
};

/** Flechas del diagrama de cuerpo libre dibujadas sobre el cuerpo (se rehacen solo cuando cambia el diagrama). */
function fbdLayer(body: FbdBody, own: <M extends THREE.Material>(m: M) => M) {
  const g = new THREE.Group();
  g.renderOrder = 10;
  let key = '';
  const update = (w: F04World) => {
    const f = w.fbd[body];
    const k = f ? `${f.locked}|${f.arrows.map((a: FbdArrow) => `${a.force}:${a.dir}`).join(',')}` : '';
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
      const dir = DIR_VEC[a.dir];
      const off = dir.y !== 0 ? new THREE.Vector3((n - 0.5) * 2.5, 0, 0) : new THREE.Vector3(0, n * 2.5, 0);
      const len = a.force === 'weight' || a.force === 'normal' ? 11 : a.force === 'friction' ? 6 : 10;
      const arrow = new THREE.ArrowHelper(dir, off, len, FORCE_COLOR[a.force] ?? 0x333333, 2.6, 1.6);
      (arrow.line.material as THREE.Material).depthTest = false;
      (arrow.cone.material as THREE.Material).depthTest = false;
      arrow.renderOrder = 10;
      g.add(arrow);
    }
  };
  void own;
  return { group: g, update };
}

export function createObjVisualF(o: F04Object, _w0: F04World, q: QualityLevel): ObjHandleF {
  const mats = materials(q);
  const seg = q === 'LOW' ? 14 : q === 'MEDIUM' ? 24 : 36;
  const group = new THREE.Group();
  const disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];
  let ring: THREE.Mesh | null = null;
  let update: ObjHandleF['update'] = () => undefined;
  let place: ((ctx: FrameCtxF, ob: F04Object) => boolean) | null = null;
  const id = o.id;
  const own = <M extends THREE.Material | THREE.Texture>(m: M): M => {
    disposables.push(m);
    return m;
  };
  const alu = own(new THREE.MeshStandardMaterial({ color: 0xc8cdd2, metalness: 0.7, roughness: 0.35 }));
  const blue = own(new THREE.MeshStandardMaterial({ color: 0x2f6db5, roughness: 0.45 }));
  const red = own(new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.45 }));
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
    const l = fbdLayer(b, own);
    roomLevel.push(l.group);
    return l;
  };

  switch (o.kind) {
    case 'track': {
      // El carril gira alrededor del pie fijo (lado de la polea); el tornillo levanta el extremo de liberación.
      const L = T.length;
      const pivotX = T.footFarX;
      const beam = new THREE.Group();
      const rail = shadowed(new THREE.Mesh(new THREE.BoxGeometry(L, 3, T.w), alu));
      rail.position.set(L / 2 - (pivotX - (T.xRelease - L)), -1.5, 0);
      const grooveMat = mats.darkMetal;
      for (const dz of [-2.6, 2.6]) {
        const gr = new THREE.Mesh(new THREE.BoxGeometry(L, 0.3, 0.6), grooveMat);
        gr.position.set(rail.position.x, 0.05, dz);
        beam.add(gr);
      }
      const scale = new THREE.Mesh(new THREE.PlaneGeometry(L, 2.2), own(new THREE.MeshBasicMaterial({ map: own(trackScaleTexture(L, 24)) })));
      scale.position.set(rail.position.x, -1.4, T.w / 2 + 0.02);
      const endRelease = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.5, 5, T.w), mats.blackPlastic));
      endRelease.position.set(T.xRelease - pivotX + 0.75, 1, 0);
      beam.add(rail, scale, endRelease);
      beam.add(at(hit(new THREE.BoxGeometry(L, 3, T.w), id, 'rail'), rail.position.x, -1.5, 0));
      body.add(beam);
      // Patas: la fija bajo el lado de la polea y la del tornillo en el extremo de liberación.
      const footFix = shadowed(new THREE.Mesh(new THREE.BoxGeometry(4, 1, T.w + 6), mats.darkMetal));
      footFix.position.set(0, 0.5, 0);
      const footScrew = shadowed(new THREE.Mesh(new THREE.BoxGeometry(4, 1, T.w + 6), mats.darkMetal));
      const screw = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 1.2, 16), mats.blackPlastic));
      const post = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1, 8), mats.chrome));
      body.add(footFix, footScrew, screw, post);
      const hScrew = hit(new THREE.BoxGeometry(4, 3, 4), id, 'screw');
      body.add(hScrew);
      place = (ctx) => {
        const w = ctx.world;
        group.position.set(pivotX, 0, -T.y);
        beam.position.y = T.railZ;
        beam.rotation.z = w.track.tiltDeg * DEG;
        const dx = T.footReleaseX - pivotX;
        const zr = railZ(w, (T.xRelease - T.footReleaseX) / 100) - 3;
        footScrew.position.set(dx, 0.5, 0);
        post.scale.y = Math.max(0.2, zr - 1);
        post.position.set(dx, 1 + Math.max(0.2, zr - 1) / 2, 0);
        screw.position.set(dx, 1.6, T.w / 2 + 3);
        screw.rotation.y = w.track.tiltDeg * 12;
        hScrew.position.copy(screw.position);
        return true;
      };
      break;
    }
    case 'cart': {
      const shell = shadowed(new THREE.Mesh(new RoundedBoxGeometry(C.len, C.h - 1.4, C.w, 2, 0.6), blue));
      shell.position.y = C.wheelR + (C.h - 1.4) / 2 - 0.4;
      const wheels: THREE.Mesh[] = [];
      for (const [wx, wz] of [[-5.5, -C.w / 2 + 0.6], [5.5, -C.w / 2 + 0.6], [-5.5, C.w / 2 - 0.6], [5.5, C.w / 2 - 0.6]] as Array<[number, number]>) {
        const wh = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(C.wheelR, C.wheelR, 0.8, 16), mats.blackPlastic));
        wh.rotation.x = Math.PI / 2;
        wh.position.set(wx, C.wheelR, wz);
        wheels.push(wh);
        body.add(wh);
      }
      const flag = shadowed(new THREE.Mesh(new THREE.BoxGeometry(C.flagW, C.flagH, 0.15), mats.blackPlastic));
      flag.position.set(0, C.h + C.flagH / 2, 0);
      const clip = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.4, 1, 1.6), mats.plasticYellow));
      clip.position.set(C.len / 2 - 2, C.h + 0.3, C.w / 2 - 1);
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 30, 6), mats.blackPlastic);
      body.add(shell, flag, clip, cable);
      body.add(at(hit(new THREE.BoxGeometry(C.len, C.h, C.w), id, 'body'), 0, C.h / 2, 0));
      body.add(at(hit(new THREE.BoxGeometry(3, 2, 3), id, 'clip'), C.len / 2 - 2, C.h + 0.3, C.w / 2 - 1));
      const fbd = fbdOf('cart');
      ring = selRing(10);
      group.add(ring);
      place = (ctx) => {
        const w = ctx.world;
        const c = cartRoom(w);
        group.position.set(c.x, c.z, -c.y);
        body.rotation.z = w.cart.on === 'track' ? w.track.tiltDeg * DEG : 0;
        if (!ctx.reducedMotion) for (const wh of wheels) wh.rotation.y = 0;
        // El cable del sensor A: sujeto a la presilla queda corto; suelto, cuelga y roza el carril.
        if (w.logger.cableClipped) {
          cable.scale.y = 0.15;
          cable.rotation.set(0, 0, Math.PI / 2);
          cable.position.set(C.len / 2 - 4, C.h + 0.8, C.w / 2 - 1);
        } else {
          cable.scale.y = 0.6;
          cable.rotation.set(0, 0, Math.PI / 2 - 0.2);
          cable.position.set(C.len / 2 + 7, C.h - 2, C.w / 2 - 1);
        }
        cable.visible = w.sensors.forceA.connected;
        (clip.material as THREE.Material) = w.logger.cableClipped ? mats.plasticYellow : mats.blackPlastic;
        fbd.group.position.set(c.x, c.z + C.h / 2 + 1, -c.y + C.w / 2 + 1.5);
        fbd.update(w);
        return true;
      };
      break;
    }
    case 'latch': {
      const base = shadowed(new THREE.Mesh(new THREE.BoxGeometry(2, 2.4, T.w + 2), mats.darkMetal));
      base.position.y = 1.2;
      const lever = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.8, 4, 0.8), red));
      lever.position.set(0, 2.5, T.w / 2 + 1.2);
      const knob = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 10), mats.rubberRed));
      body.add(base, lever, knob);
      body.add(at(hit(new THREE.BoxGeometry(3, 6, 4), id, 'lever'), 0, 3, T.w / 2 + 1.2));
      place = (ctx) => {
        const w = ctx.world;
        const s = GEOF04.latch.s;
        group.position.set(trackX(s) + 0.5, railZ(w, s), -T.y);
        const open = !w.cart.latched;
        lever.rotation.x = open ? -0.6 : 0;
        knob.position.set(0, open ? 4.2 : 4.6, T.w / 2 + (open ? 2.4 : 1.2));
        return true;
      };
      break;
    }
    case 'brake': {
      const len = GEOF04.brake.len * 100;
      const magMat = own(new THREE.MeshStandardMaterial({ color: 0x8a1c1c, metalness: 0.4, roughness: 0.4 }));
      const bars: THREE.Mesh[] = [];
      for (const dz of [-T.w / 2 - 1, T.w / 2 + 1]) {
        const b = shadowed(new THREE.Mesh(new THREE.BoxGeometry(len, 3, 1.4), magMat));
        b.position.set(0, 1.5, dz);
        bars.push(b);
        body.add(b);
      }
      const sw = button(1, mats.rubberRed);
      sw.rotation.x = Math.PI / 2;
      sw.position.set(len / 2 - 2, 1.5, T.w / 2 + 1.8);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), ledMat());
      led.position.set(len / 2 - 5, 3.2, T.w / 2 + 1);
      body.add(sw, led);
      body.add(at(hit(new THREE.BoxGeometry(len, 4, T.w + 4), id, 'body'), 0, 1.5, 0));
      body.add(at(hit(new THREE.BoxGeometry(3, 3, 2), id, 'switch'), len / 2 - 2, 1.5, T.w / 2 + 2));
      ring = selRing(6);
      group.add(ring);
      place = (ctx) => {
        const w = ctx.world;
        const sMid = w.brake.s + GEOF04.brake.len / 2;
        group.position.set(trackX(sMid), railZ(w, sMid) - 3, -T.y);
        body.rotation.z = w.track.tiltDeg * DEG;
        (led.material as THREE.MeshBasicMaterial).color.setHex(w.brake.on ? 0x34c759 : 0x444444);
        magMat.color.setHex(w.brake.on ? 0xb02020 : 0x5a3030);
        return true;
      };
      break;
    }
    case 'stop': {
      const block = shadowed(new THREE.Mesh(new THREE.BoxGeometry(2, 5, T.w), mats.darkMetal));
      block.position.set(-1, 2.5, 0);
      const pad = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 1.2, 14), mats.rubberRed));
      pad.rotation.z = Math.PI / 2;
      pad.position.set(0.6, 2.4, 0);
      body.add(block, pad);
      body.add(at(hit(new THREE.BoxGeometry(4, 6, T.w + 1), id, 'body'), -0.5, 3, 0));
      ring = selRing(5);
      group.add(ring);
      place = (ctx) => {
        const w = ctx.world;
        group.position.set(trackX(w.stopS), railZ(w, w.stopS), -T.y);
        return true;
      };
      break;
    }
    case 'pulley': {
      const P = GEOF04.pulley;
      const wheel = new THREE.Group();
      const disc = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(P.r, P.r, 0.8, seg), mats.plasticWhite));
      disc.rotation.x = Math.PI / 2;
      const groove = new THREE.Mesh(new THREE.TorusGeometry(P.r - 0.15, 0.18, 6, seg), mats.darkMetal);
      const spokes = new THREE.Mesh(new THREE.BoxGeometry(P.r * 1.6, 0.3, 0.9), mats.darkMetal);
      wheel.add(disc, groove, spokes);
      const axle = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 3, 10), mats.chrome));
      axle.rotation.x = Math.PI / 2;
      const arm = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1, P.axisZ + 2, 0.6), mats.darkMetal));
      arm.position.set(0, -(P.axisZ + 2) / 2 + 0.5, -1.2);
      const clampBody = shadowed(new THREE.Mesh(new THREE.BoxGeometry(5, 2, 4), mats.darkMetal));
      clampBody.position.set(2.5, -P.axisZ + 1, -1.2);
      const screwJaw = shadowed(new THREE.Mesh(new THREE.BoxGeometry(5, 1, 4), mats.darkMetal));
      const screwRod = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 5, 8), mats.chrome));
      const knob = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.8, 12), red));
      body.add(wheel, axle, arm, clampBody, screwJaw, screwRod, knob);
      body.add(at(hit(new THREE.CylinderGeometry(P.r, P.r, 1.4, 10), id, 'groove'), 0, 0, 0));
      (body.children[body.children.length - 1] as THREE.Mesh).rotation.x = Math.PI / 2;
      body.add(at(hit(new THREE.BoxGeometry(1.2, 1.2, 3.4), id, 'axle'), 0, 0, 0));
      const hClamp = hit(new THREE.BoxGeometry(5, 8, 5), id, 'clamp');
      body.add(hClamp);
      // El cordel: tramo horizontal del gancho a la polea, arco y tramo vertical hasta el portapesas.
      const N = 26;
      const strGeo = new THREE.BufferGeometry();
      strGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * N), 3));
      const str = new THREE.Line(strGeo, own(new THREE.LineBasicMaterial({ color: 0x3b3024 })));
      str.frustumCulled = false;
      const sPos = strGeo.attributes.position as THREE.BufferAttribute;
      ring = selRing(4);
      group.add(ring);
      place = (ctx) => {
        const w = ctx.world;
        group.position.set(P.x, P.axisZ, -T.y);
        const loose = !w.string.clamped;
        body.rotation.z = loose ? 0.05 : 0;
        // Abrazadera: la mordaza sube contra la mesada al apretar.
        const jawY = loose ? -P.axisZ - 2.2 : -P.axisZ - 1.0;
        screwJaw.position.set(2.5, jawY - 0.5, -1.2);
        screwRod.position.set(2.5, jawY - 3, -1.2);
        knob.position.set(2.5, jawY - 5.6, -1.2);
        hClamp.position.set(2.5, -P.axisZ - 1, -1.2);
        wheel.rotation.z = -w.string.pulleyAngle;
        if (!str.parent && group.parent) group.parent.add(str);
        const st = w.string;
        str.visible = st.path !== 'none' || st.attached;
        let n = 0;
        const put = (x: number, z: number, y = T.y) => {
          if (n < N) sPos.setXYZ(n++, x, z, -y);
        };
        const zTop = st.path === 'axle' ? P.axisZ + 0.35 : STRING_Z;
        const rr = st.path === 'axle' ? 0.35 : P.r;
        if (st.attached && w.cart.on === 'track') {
          const h = hookRoom(w);
          const sag = st.slack * 100 * (st.held ? 0.4 : 0.25);
          const steps = 8;
          for (let i = 0; i <= steps; i++) {
            const u = i / steps;
            put(h.x + (P.x - h.x) * u, h.z + (zTop - h.z) * u - Math.sin(Math.PI * u) * sag);
          }
        } else put(P.x + 6, zTop - 3);
        for (let i = 0; i <= 6; i++) {
          const a = (Math.PI / 2) * (i / 6);
          put(P.x - Math.sin(a) * rr, P.axisZ + Math.cos(a) * rr);
        }
        const bottom = st.hung || w.objects.hanger01.support === 'floor' ? hangerRoom(w).z + GEOF04.hanger.h : P.axisZ - 10;
        const xd = P.x - rr;
        put(xd, (P.axisZ + bottom) / 2);
        put(xd, bottom);
        while (n < N) put(xd, bottom);
        sPos.needsUpdate = true;
        strGeo.computeBoundingSphere();
        return true;
      };
      (group.userData as { onDispose?: () => void }).onDispose = () => str.parent?.remove(str);
      disposables.push(strGeo);
      break;
    }
    case 'hanger': {
      const H = GEOF04.hanger;
      const plate = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(H.r, H.r, 0.4, seg), brass));
      plate.position.y = 0.2;
      const rod = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, H.h - 1, 8), brass));
      rod.position.y = (H.h - 1) / 2;
      const hook = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.12, 6, 14, Math.PI * 1.5), mats.chrome));
      hook.position.y = H.h - 0.4;
      body.add(plate, rod, hook);
      body.add(at(hit(new THREE.CylinderGeometry(H.r + 0.4, H.r + 0.4, H.h, 10), id, 'body'), 0, H.h / 2, 0));
      const fbd = fbdOf('hanger');
      ring = selRing(H.r + 1);
      group.add(ring);
      place = (ctx, ob) => {
        const w = ctx.world;
        const p = ob.support === 'hand' ? ob.pose : hangerRoom(w);
        group.position.set(p.x, p.z, -p.y);
        body.rotation.z = ob.support === 'floor' ? Math.PI / 2 - 0.2 : 0;
        if (ob.support === 'floor') body.position.y = H.r;
        else body.position.y = 0;
        fbd.group.position.set(p.x - 4, p.z + H.h / 2, -p.y + 3);
        fbd.update(w);
        return true;
      };
      void dropX;
      break;
    }
    case 'slotMass': {
      const h = slotH(id);
      const r = id.startsWith('m50') ? 2.4 : 1.9;
      const disc = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg, 1, false, 0.3, Math.PI * 2 - 0.6), brass));
      disc.position.y = h / 2;
      body.add(disc);
      body.add(at(hit(new THREE.CylinderGeometry(r + 0.3, r + 0.3, Math.max(1.4, h), 10), id, 'body'), 0, h / 2, 0));
      ring = selRing(r + 0.8);
      group.add(ring);
      place = (ctx, ob) => {
        const w = ctx.world;
        const p = ob.support === 'hand' ? ob.pose : slotRoom(w, id);
        group.position.set(p.x, p.z, -p.y);
        return true;
      };
      break;
    }
    case 'massRack': {
      const R = GEOF04.massRack;
      const base = shadowed(new THREE.Mesh(new THREE.BoxGeometry(R.w, R.h, R.d), mats.wood));
      base.position.y = R.h / 2;
      body.add(base);
      body.add(at(hit(new THREE.BoxGeometry(R.w, R.h, R.d), id, 'body'), 0, R.h / 2, 0));
      const pad = shadowed(new THREE.Mesh(new THREE.BoxGeometry(6, 0.4, 6), mats.blackPlastic));
      pad.position.set(R.w / 2 + 6, 0.2, 0);
      body.add(pad);
      break;
    }
    case 'forceSensor': {
      const sensor = new THREE.Group();
      const box = shadowed(new THREE.Mesh(new RoundedBoxGeometry(6, 2.6, 3, 2, 0.5), id === 'forceA' ? own(new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.5 })) : mats.plasticYellow));
      const tip = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 2.2, 10), mats.chrome));
      tip.rotation.z = Math.PI / 2;
      tip.position.x = -4;
      const zeroBtn = button(0.5, mats.plasticBlue);
      zeroBtn.position.set(1, 1.4, 0);
      const calBtn = button(0.5, mats.plasticYellow);
      calBtn.position.set(2.4, 1.4, 0);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), ledMat());
      led.position.set(-1, 1.4, 0);
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 8), own(new THREE.MeshBasicMaterial({ color: 0x1b2733 })));
      arrow.rotation.z = Math.PI / 2;
      arrow.position.set(0, 0, 1.55);
      sensor.add(box, tip, zeroBtn, calBtn, led, arrow);
      body.add(sensor);
      sensor.add(at(hit(new THREE.BoxGeometry(6, 2.6, 3), id, 'body'), 0, 0, 0));
      sensor.add(at(hit(new THREE.BoxGeometry(1.4, 1.4, 1.4), id, 'zero'), 1, 1.5, 0));
      sensor.add(at(hit(new THREE.BoxGeometry(1.4, 1.4, 1.4), id, 'cal'), 2.4, 1.5, 0));
      sensor.add(at(hit(new THREE.BoxGeometry(1.4, 1.4, 1.4), id, 'plug'), -1, 1.5, 0));
      ring = selRing(4);
      group.add(ring);
      place = (ctx) => {
        const w = ctx.world;
        const s = w.sensors[id as 'forceA'];
        if (id === 'forceA') {
          const h = hookRoom(w);
          group.position.set(h.x + 3.5, h.z, -h.y);
          sensor.rotation.set(0, (s.angleDeg ?? 0) * DEG, w.cart.on === 'track' ? w.track.tiltDeg * DEG : 0);
          group.visible = w.cart.on === 'track' || true;
        } else {
          const c = pairCartRoom(w, id === 'dynP' ? 'cartP' : 'cartQ');
          const right = id === 'dynP';
          group.position.set(c.x + (right ? PC.len / 2 - 2.5 : -PC.len / 2 + 2.5), c.z + PC.h + 1.6, -c.y);
          sensor.rotation.set(0, right ? Math.PI : 0, (s.angleDeg ?? 0) * DEG);
          arrow.rotation.z = (s.axisSign > 0) === right ? -Math.PI / 2 : Math.PI / 2;
        }
        (led.material as THREE.MeshBasicMaterial).color.setHex(!s.connected ? 0x444444 : s.calibrated && s.zeroed ? 0x34c759 : 0xf0c36e);
        return true;
      };
      break;
    }
    case 'accelerometer': {
      const box = shadowed(new THREE.Mesh(new RoundedBoxGeometry(4, 1.6, 3, 2, 0.4), own(new THREE.MeshStandardMaterial({ color: 0x2e9d57, roughness: 0.5 }))));
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), ledMat());
      led.position.set(1.2, 0.9, 0);
      const zeroBtn = button(0.45, mats.plasticBlue);
      zeroBtn.position.set(-0.8, 0.9, 0);
      body.add(box, led, zeroBtn);
      body.add(at(hit(new THREE.BoxGeometry(4, 1.8, 3), id, 'body'), 0, 0, 0));
      body.add(at(hit(new THREE.BoxGeometry(1.4, 1.2, 1.4), id, 'zero'), -0.8, 1, 0));
      ring = selRing(3);
      group.add(ring);
      place = (ctx) => {
        const w = ctx.world;
        const c = cartRoom(w);
        group.position.set(c.x + 3, c.z + C.h + 0.4, -c.y - 2.5);
        body.rotation.z = w.cart.on === 'track' ? w.track.tiltDeg * DEG : 0;
        const s = w.sensors.accel01;
        (led.material as THREE.MeshBasicMaterial).color.setHex(!s.connected ? 0x444444 : w.cart.shock ? 0xff3b30 : s.zeroed ? 0x34c759 : 0xf0c36e);
        return true;
      };
      break;
    }
    case 'logger': {
      const Lg = GEOF04.logger;
      const box = shadowed(new THREE.Mesh(new RoundedBoxGeometry(Lg.w, Lg.h, Lg.d, 2, 0.6), own(new THREE.MeshStandardMaterial({ color: 0x2b3a4a, roughness: 0.5 }))));
      box.position.y = Lg.h / 2;
      const { lcd, mesh } = lcdScreen(13, 3.6, 360, 100);
      mesh.position.set(0, Lg.h * 0.68, Lg.d / 2 + 0.02);
      body.add(box, mesh);
      const ports: Array<[string, number, THREE.Material]> = [['portA', -6.5, mats.plasticWhite], ['portAcc', -3.5, mats.plasticBlue], ['portG', -0.5, mats.plasticYellow], ['portP', 2.5, mats.plasticYellow], ['portQ', 5.5, mats.plasticYellow]];
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
        (portLeds.portA.material as THREE.MeshBasicMaterial).color.setHex(on(w.sensors.forceA.connected));
        (portLeds.portAcc.material as THREE.MeshBasicMaterial).color.setHex(on(w.sensors.accel01.connected));
        (portLeds.portG.material as THREE.MeshBasicMaterial).color.setHex(on(w.logger.gatesConnected));
        (portLeds.portP.material as THREE.MeshBasicMaterial).color.setHex(on(w.sensors.dynP.connected));
        (portLeds.portQ.material as THREE.MeshBasicMaterial).color.setHex(on(w.sensors.dynQ.connected));
        const run = w.run && !w.run.done ? w.run : null;
        const last = run?.samples[run.samples.length - 1];
        const pr = w.pairRec && !w.pairRec.done ? w.pairRec.samples[w.pairRec.samples.length - 1] : null;
        const head = last ? `a ${Number.isFinite(last[1]) ? last[1].toFixed(2) : '----'}  T ${Number.isFinite(last[2]) ? last[2].toFixed(2) : '----'}` : pr ? `A ${pr[1].toFixed(2)} B ${pr[2].toFixed(2)}` : 'LISTO';
        lcd.set(head, last || pr ? '#6ef08a' : '#f0c36e', `${w.logger.rateHz} Hz · ${run ? 'REGISTRANDO' : `${w.runs.length} ensayos`}`);
      };
      break;
    }
    case 'gate': {
      const G = GEOF04.gate;
      const frame = new THREE.Group();
      const postA = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.4, G.h, 1.4), mats.blackPlastic));
      postA.position.set(0, G.h / 2 - 2, -T.w / 2 - 1.5);
      const postB = postA.clone();
      postB.position.z = T.w / 2 + 1.5;
      const top = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, T.w + 4.4), mats.blackPlastic));
      top.position.y = G.h - 2;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, T.w + 3, 6), own(new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.6 })));
      beam.rotation.x = Math.PI / 2;
      beam.position.y = G.beamDz;
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), ledMat());
      led.position.set(0, G.h - 1, T.w / 2 + 2.4);
      const index = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.4, 0.2), own(new THREE.MeshBasicMaterial({ color: 0xd0021b })));
      index.position.set(0, -1.4, T.w / 2 + 0.3);
      frame.add(postA, postB, top, beam, led, index);
      body.add(frame);
      frame.add(at(hit(new THREE.BoxGeometry(2, G.h, T.w + 5), id, 'mount'), 0, G.h / 2 - 2, 0));
      frame.add(at(hit(new THREE.BoxGeometry(2, 3, 1.6), id, 'index'), 0, -1.4, T.w / 2 + 0.8));
      ring = selRing(5);
      group.add(ring);
      place = (ctx) => {
        const w = ctx.world;
        const g = gateRoom(w, id);
        group.position.set(g.x, g.z, -g.y);
        frame.rotation.set(0, (w.gates[id]?.yawDeg ?? 0) * DEG, w.track.tiltDeg * DEG);
        const blocked = w.gates[id]?.blocked;
        (led.material as THREE.MeshBasicMaterial).color.setHex(!w.logger.gatesConnected ? 0x444444 : blocked ? 0xff3b30 : 0x34c759);
        return true;
      };
      break;
    }
    case 'balance': {
      const Bl = GEOF04.balance;
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
    case 'pairTrack': {
      const L = PT.x1 - PT.x0;
      const rail = shadowed(new THREE.Mesh(new THREE.BoxGeometry(L, PT.railZ, PT.w), alu));
      rail.position.y = PT.railZ / 2;
      const endA = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.5, 5, PT.w), mats.blackPlastic));
      endA.position.set(-L / 2 - 0.75, 2.5, 0);
      const endB = endA.clone();
      endB.position.x = L / 2 + 0.75;
      body.add(rail, endA, endB);
      body.add(at(hit(new THREE.BoxGeometry(L, PT.railZ, PT.w), id, 'rail'), 0, PT.railZ / 2, 0));
      place = () => {
        group.position.set((PT.x0 + PT.x1) / 2, 0, -PT.y);
        return true;
      };
      break;
    }
    case 'pairCart': {
      const isP = id === 'cartP';
      const shell = shadowed(new THREE.Mesh(new RoundedBoxGeometry(PC.len, PC.h - 1.2, PC.w, 2, 0.5), isP ? red : blue));
      shell.position.y = 1.2 + (PC.h - 1.2) / 2 - 0.2;
      for (const [wx, wz] of [[-3.8, -PC.w / 2 + 0.5], [3.8, -PC.w / 2 + 0.5], [-3.8, PC.w / 2 - 0.5], [3.8, PC.w / 2 - 0.5]] as Array<[number, number]>) {
        const wh = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.7, 14), mats.blackPlastic));
        wh.rotation.x = Math.PI / 2;
        wh.position.set(wx, 1.1, wz);
        body.add(wh);
      }
      const bumper = shadowed(new THREE.Mesh(new THREE.BoxGeometry(PC.bumper, 2.4, PC.w - 2), mats.rubberRed));
      bumper.position.set((isP ? 1 : -1) * (PC.len / 2 + PC.bumper / 2), 2.4, 0);
      body.add(shell, bumper);
      body.add(at(hit(new THREE.BoxGeometry(PC.len, PC.h, PC.w), id, 'body'), 0, PC.h / 2, 0));
      let hand: THREE.Group | null = null;
      if (isP) {
        // La mano (guante) que empuja a P desde la izquierda durante el empuje.
        hand = new THREE.Group();
        const palm = shadowed(new THREE.Mesh(new RoundedBoxGeometry(5, 4, 6, 2, 1.4), own(new THREE.MeshStandardMaterial({ color: 0x6fa8dc, roughness: 0.8 }))));
        const wrist = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.2, 8, 12), own(new THREE.MeshStandardMaterial({ color: 0xf4f1e6, roughness: 0.9 }))));
        wrist.rotation.z = Math.PI / 2;
        wrist.position.x = -6;
        hand.add(palm, wrist);
        body.add(hand);
        body.add(at(hit(new THREE.BoxGeometry(6, 5, 7), id, 'hand'), -PC.len / 2 - 4, 2.5, 0));
      }
      const fbd = isP ? fbdOf('cartP') : null;
      ring = selRing(8);
      group.add(ring);
      place = (ctx, ob) => {
        const w = ctx.world;
        const c = ob.support === 'balance' ? panRoom() : pairCartRoom(w, id as 'cartP' | 'cartQ');
        group.position.set(c.x, c.z, -c.y);
        if (hand) {
          const pushing = !!w.pair.push && w.pair.push.t < w.pair.push.durationS;
          hand.visible = pushing || ctx.selected === id;
          hand.position.set(-PC.len / 2 - 3, 2.6, 0);
        }
        if (fbd) {
          fbd.group.position.set(c.x, c.z + PC.h / 2 + 1, -c.y + PC.w / 2 + 1.5);
          fbd.update(w);
        }
        return true;
      };
      break;
    }
  }

  group.traverse((c) => {
    const m = c as THREE.Mesh;
    if ((m.isMesh || (c as THREE.Line).isLine) && m.geometry) disposables.push(m.geometry);
    if ((c as THREE.Line).isLine && !(c.parent instanceof THREE.ArrowHelper)) disposables.push((c as THREE.Line).material as THREE.Material);
  });

  // Las flechas de los diagramas viven en la sala, no dentro del grupo que se traslada.
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
      (group.userData as { onDispose?: () => void }).onDispose?.();
      for (const c of roomLevel) c.parent?.remove(c);
      for (const d of new Set(disposables)) d.dispose();
    },
  };
}

export { FLOOR_Z };
