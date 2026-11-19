/**
 * Vistas 3D procedurales de F07: riel de aluminio de 200 cm sobre patas con su tornillo de nivelación, topes con
 * amortiguador y lanzadores de émbolo con trinquete y gatillo en los dos extremos; nivel de burbuja; dos carros con
 * ruedas, freno, bandera, paragolpes (resorte, imanes o velcro) y sus pesas; sensor de fuerza en el paragolpes de B;
 * fotopuertas en U con abrazadera; regla de posición; cámara en trípode; registrador con pantalla; balanza, estante,
 * calibre y estuche de paragolpes. SOLO leen el estado; cada pieza funcional tiene un colisionador invisible simple
 * (`userData {objId, part}`).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { CartId, F07Object, F07World } from '../../simulation/f07-world/types';
import { GEOF07 } from '../../simulation/f07-world/geometry';
import { loadOnBalanceG } from '../../simulation/f07-world/world';
import type { QualityLevel } from '../quality';
import { materials } from '../renderers/materials';
import { lcdTexture } from '../renderers/textures';
import type { FrameCtxF } from './F07Lab3D';
import { DEG, cartMassRoom, cartRoom, gateRoom, levelRoom, objRoom, panRoom, plungerS, trackAt, trackTilt } from './layout';

export interface ObjHandleF {
  group: THREE.Group;
  update(ctx: FrameCtxF, o: F07Object): void;
  dispose(): void;
}

const hitMat = () => materials('LOW').hit;
const TR = GEOF07.track;
const CA = GEOF07.cart;
const LA = GEOF07.launcher;

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

/** Regla horizontal de `lenCm` con marcas cada mm y números cada 10 cm (izquierda → derecha). */
function horizontalScaleTexture(lenCm: number, pxPerCm = 16): THREE.CanvasTexture {
  const W = Math.min(4096, Math.round(lenCm * pxPerCm));
  const k = W / lenCm;
  const H = 64;
  return canvasTex(W, H, (g) => {
    g.fillStyle = '#f4f1e6';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#1b2733';
    g.fillStyle = '#1b2733';
    g.font = 'bold 20px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'bottom';
    for (let mm = 0; mm <= lenCm * 10; mm++) {
      const x = mm * (k / 10);
      const major = mm % 100 === 0;
      const cm = mm % 10 === 0;
      g.lineWidth = major ? 2 : 1;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, major ? 30 : mm % 50 === 0 ? 22 : cm ? 16 : 8);
      g.stroke();
      if (major) g.fillText(String(mm / 10), Math.max(14, Math.min(W - 14, x)), H - 4);
    }
  });
}

const BUMPER_COLOR: Record<string, number> = { spring: 0xc8cdd2, magnet: 0x3949ab, velcro: 0x2e7d32 };

export function createObjVisualF(o: F07Object, _w0: F07World, q: QualityLevel, ghost?: () => { id: string; x: number; y: number; z: number } | null): ObjHandleF {
  const mats = materials(q);
  const seg = q === 'LOW' ? 14 : q === 'MEDIUM' ? 24 : 36;
  const group = new THREE.Group();
  const disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];
  let ring: THREE.Mesh | null = null;
  let update: ObjHandleF['update'] = () => undefined;
  let place: ((ctx: FrameCtxF, ob: F07Object) => boolean) | null = null;
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
    case 'track': {
      // Viga del riel (inclinada con la inclinación verdadera), dos ranuras para las ruedas, patas y tornillo.
      const beam = roomObj(shadowed(new THREE.Mesh(new THREE.BoxGeometry(TR.len * 100, 1.6, TR.w), alu)));
      const grooveMat = own(new THREE.MeshStandardMaterial({ color: 0x55606a, roughness: 0.6 }));
      const grooves = [-3.6, 3.6].map((dz) => {
        const g = roomObj(new THREE.Mesh(new THREE.BoxGeometry(TR.len * 100, 0.1, 1), grooveMat));
        g.userData.dz = dz;
        return g;
      });
      const legs = [0.15, 1.85].map(() => roomObj(shadowed(new THREE.Mesh(new THREE.BoxGeometry(3, 1, TR.w + 6), mats.darkMetal))));
      const screw = roomObj(shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 1.4, 16), mats.blackPlastic)));
      const hBeam = roomObj(hit(new THREE.BoxGeometry(TR.len * 100, 2, TR.w), id, 'body'));
      const hScrew = roomObj(hit(new THREE.BoxGeometry(4, 4, 4), id, 'screw'));
      update = (ctx) => {
        const w = ctx.world;
        const c = trackAt(w, TR.len / 2, -0.8);
        const rz = -trackTilt(w) * DEG;
        for (const m of [beam, hBeam]) {
          m.position.set(c.x, c.z, -TR.y);
          m.rotation.set(0, 0, rz);
        }
        for (const g of grooves) {
          g.position.set(c.x, c.z + 0.82, -TR.y + g.userData.dz);
          g.rotation.set(0, 0, rz);
        }
        [0.15, 1.85].forEach((s, i) => {
          const p = trackAt(w, s, -1.6);
          legs[i].scale.y = Math.max(0.5, p.z);
          legs[i].position.set(p.x, p.z / 2, -TR.y);
        });
        const p = trackAt(w, 1.85, -1.6);
        screw.position.set(p.x + 3, 1.2, -TR.y + TR.w / 2 + 4);
        screw.rotation.y = w.track.screwDeg * 6;
        hScrew.position.copy(screw.position);
      };
      break;
    }
    case 'endStop': {
      // Topes de los dos extremos con su almohadilla amortiguadora (visible solo cuando está puesta).
      const stops = [0, TR.len].map(() => roomObj(shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.4, 7, TR.w + 1), mats.darkMetal))));
      const pads = [0, TR.len].map(() => roomObj(shadowed(new THREE.Mesh(new THREE.BoxGeometry(1, 4, TR.w - 2), own(new THREE.MeshStandardMaterial({ color: 0xf0a020, roughness: 0.9 }))))));
      const hits = (['damperA', 'damperB'] as const).map((part) => roomObj(hit(new THREE.BoxGeometry(3, 7, TR.w + 2), id, part)));
      update = (ctx) => {
        const w = ctx.world;
        [0, TR.len].forEach((s, i) => {
          const p = trackAt(w, s, 3);
          const sign = i === 0 ? -1 : 1;
          stops[i].position.set(p.x + sign * 0.7, p.z, -TR.y);
          pads[i].position.set(p.x - sign * 0.4, p.z, -TR.y);
          pads[i].visible = w.track.endDampers;
          hits[i].position.copy(stops[i].position);
        });
      };
      break;
    }
    case 'launcher': {
      const cart: CartId = id === 'launcherA' ? 'cartA' : 'cartB';
      const sign = cart === 'cartA' ? 1 : -1;
      const s0 = cart === 'cartA' ? 0 : TR.len;
      const sFree = cart === 'cartA' ? LA.left : LA.right;
      const backPlate = roomObj(shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.2, 6, TR.w - 1), mats.darkMetal)));
      const plunger = roomObj(shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.8, 4.4, TR.w - 3), alu)));
      const rod = roomObj(shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1, 8), mats.chrome)));
      const ratchet = roomObj(shadowed(new THREE.Mesh(new THREE.BoxGeometry(LA.maxComp * 100, 0.6, 0.6), mats.steel)));
      const trigger = roomObj(shadowed(new THREE.Mesh(new THREE.BoxGeometry(1, 3, 1), red)));
      const hTrig = roomObj(hit(new THREE.BoxGeometry(2.6, 4, 2.6), id, 'trigger'));
      const hBody = roomObj(hit(new THREE.BoxGeometry(Math.abs(sFree - s0) * 100 + 1, 5, TR.w), id, 'body'));
      update = (ctx) => {
        const w = ctx.world;
        const back = trackAt(w, s0 + sign * 0.006, 3);
        backPlate.position.set(back.x, back.z, -TR.y);
        const ps = plungerS(w, cart);
        const pp = trackAt(w, ps, 2.8);
        plunger.position.set(pp.x - sign * 0.4, pp.z, -TR.y);
        stretchC(rod, sv(trackAt(w, s0 + sign * 0.01, 2.8)), sv(pp));
        const rc = trackAt(w, sFree + sign * (-LA.maxComp / 2), 0.9, -TR.w / 2 + 0.6);
        ratchet.position.set(rc.x, rc.z, -rc.y);
        const tp = trackAt(w, sFree + sign * 0.01, -1.6, -TR.w / 2 - 0.8);
        trigger.position.set(tp.x, tp.z, -tp.y);
        trigger.rotation.z = w.carts[cart].latched ? sign * 0.3 : 0;
        hTrig.position.copy(trigger.position);
        const hc = trackAt(w, (s0 + sFree) / 2, 2.5);
        hBody.position.set(hc.x, hc.z, -TR.y);
      };
      break;
    }
    case 'level': {
      const base = shadowed(new THREE.Mesh(new THREE.BoxGeometry(12, 1.2, 2.4), mats.darkMetal));
      const vial = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 9, 14), own(new THREE.MeshStandardMaterial({ color: 0xc8f07a, transparent: true, opacity: 0.55, roughness: 0.1 })));
      vial.rotation.z = Math.PI / 2;
      vial.position.y = 1.3;
      const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8), own(new THREE.MeshBasicMaterial({ color: 0xffffff })));
      const marks = [-1, 1].map((dx) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.6, 1.6), mats.blackPlastic);
        m.position.set(dx * 0.9, 1.3, 0);
        return m;
      });
      body.add(base, vial, bubble, ...marks);
      body.add(at(hit(new THREE.BoxGeometry(12, 3, 3), id, 'bubble'), 0, 1, 0));
      ring = selRing(6);
      group.add(ring);
      place = (ctx) => {
        const w = ctx.world;
        placeAt(levelRoom(w));
        body.rotation.z = -trackTilt(w) * DEG;
        // La burbuja sube hacia el lado alto: + baja a la derecha → corre a la izquierda.
        bubble.position.set(Math.max(-4, Math.min(4, -trackTilt(w) * 18)), 1.6, 0);
        return true;
      };
      break;
    }
    case 'cart': {
      const cart = id as CartId;
      const face = cart === 'cartA' ? 1 : -1;
      const shellMat = own(new THREE.MeshStandardMaterial({ color: cart === 'cartA' ? 0x1f6fb2 : 0xc0392b, roughness: 0.45 }));
      const shell = shadowed(new THREE.Mesh(new RoundedBoxGeometry(CA.len - 2, CA.h, CA.w, 2, 0.6), shellMat));
      shell.position.y = CA.h / 2 + 1.2;
      const flagMat = own(new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 }));
      const flag = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1, CA.flagH, 0.15), flagMat));
      const bumperMat = own(new THREE.MeshStandardMaterial({ color: 0xc8cdd2, roughness: 0.5 }));
      const bumper = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1, 3, CA.w - 2), bumperMat));
      bumper.position.set(face * (CA.len / 2 - 0.5), CA.h / 2 + 1.2, 0);
      const brake = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), red));
      brake.position.set(-face * (CA.len / 2 - 2), CA.h + 1.8, CA.w / 2 - 1.2);
      body.add(shell, flag, bumper, brake);
      const wheels: THREE.Mesh[] = [];
      for (const [x, z] of [[-5, 3.6], [5, 3.6], [-5, -3.6], [5, -3.6]] as const) {
        const wh = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.8, 16), mats.blackPlastic));
        wh.rotation.x = Math.PI / 2;
        wh.position.set(x, 1.2, z);
        wheels.push(wh);
        body.add(wh);
      }
      body.add(at(hit(new THREE.BoxGeometry(CA.len, CA.h + 1.2, CA.w), id, 'body'), 0, (CA.h + 1.2) / 2, 0));
      body.add(at(hit(new THREE.BoxGeometry(3, 2.6, 1.6), id, 'wheel'), 5, 1.2, 4));
      body.add(at(hit(new THREE.BoxGeometry(2.2, 2.2, 2.2), id, 'brake'), brake.position.x, brake.position.y, brake.position.z));
      const hFlag = hit(new THREE.BoxGeometry(4, CA.flagH, 1.2), id, 'flag');
      body.add(hFlag);
      body.add(at(hit(new THREE.BoxGeometry(2, 3.4, CA.w), id, 'bumper'), bumper.position.x, bumper.position.y, 0));
      ring = selRing(9);
      group.add(ring);
      let spin = 0;
      place = (ctx) => {
        const w = ctx.world;
        const k = w.carts[cart];
        const g = ghost?.();
        if (g && g.id === id) {
          placeAt(g);
          body.rotation.z = 0;
        } else {
          placeAt(cartRoom(w, cart));
          body.rotation.z = k.on === 'track' ? -trackTilt(w) * DEG : 0;
        }
        flag.scale.x = k.flagW;
        flag.position.set(0, CA.h + 1.2 + CA.flagH / 2, 0);
        flag.rotation.y = k.flagYawDeg * DEG;
        hFlag.position.copy(flag.position);
        bumperMat.color.setHex(BUMPER_COLOR[w.bumper.type]);
        bumper.scale.x = w.bumper.type === 'spring' ? 1 + Math.max(0, -k.compression) : w.bumper.type === 'velcro' && !w.bumper.velcroFixed ? 0.7 : 1;
        brake.position.y = k.brake ? CA.h + 1.4 : CA.h + 2.2;
        (brake.material as THREE.MeshStandardMaterial) = k.brake ? red : green;
        spin += (ctx.reducedMotion ? 0 : k.v * ctx.dt * 100) / 1.2;
        for (const [i, wh] of wheels.entries()) {
          wh.rotation.y = 0;
          wh.rotation.z = i === 1 && k.wheelBind ? 0 : -spin;
        }
        wheels[1].rotation.y = k.damaged ? 0.35 : 0;
        return true;
      };
      break;
    }
    case 'cartMass': {
      const heavy = id === 'cw200';
      const bar = shadowed(new THREE.Mesh(new RoundedBoxGeometry(heavy ? 10 : 8, heavy ? 2 : 1.4, 4, 2, 0.3), heavy ? brass : mats.steel));
      bar.position.y = 0.75;
      body.add(bar);
      body.add(at(hit(new THREE.BoxGeometry(10, 2.2, 4), id, 'body'), 0, 0.9, 0));
      ring = selRing(4);
      group.add(ring);
      place = (ctx, ob) => {
        const w = ctx.world;
        placeAt(ob.support === 'hand' ? ob.pose : cartMassRoom(w, id));
        body.rotation.z = ob.support === 'cartA' || ob.support === 'cartB' ? -trackTilt(w) * DEG : 0;
        return true;
      };
      break;
    }
    case 'massRack': {
      const R = GEOF07.massRack;
      const base = shadowed(new THREE.Mesh(new THREE.BoxGeometry(R.w, R.h, R.d), mats.wood));
      base.position.set(0, R.h / 2, 0);
      body.add(base);
      body.add(at(hit(new THREE.BoxGeometry(R.w, R.h, R.d), id, 'body'), 0, R.h / 2, 0));
      break;
    }
    case 'caliper': {
      const beamC = shadowed(new THREE.Mesh(new THREE.BoxGeometry(16, 0.4, 1.4), mats.steel));
      beamC.position.y = 0.3;
      const jawF = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 4), mats.steel));
      jawF.position.set(-7.6, 0.3, 2);
      const slider = shadowed(new THREE.Mesh(new THREE.BoxGeometry(3, 0.8, 2), mats.steel));
      const jawS = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 4), mats.steel));
      const { lcd, mesh } = lcdScreen(2.4, 1, 160, 64);
      mesh.rotation.x = -Math.PI / 2;
      body.add(beamC, jawF, slider, jawS, mesh);
      body.add(at(hit(new THREE.BoxGeometry(17, 2, 5), id, 'body'), 0, 0.5, 1));
      ring = selRing(8);
      group.add(ring);
      let shownFor = '';
      update = (ctx) => {
        const w = ctx.world;
        const last = [...w.readingOrder].reverse().map((r) => w.readings[r]).find((r) => r?.kind === 'length');
        const cm = last ? last.value : 0;
        const x = -7.6 + Math.min(14, cm * 1.4 + 0.6);
        slider.position.set(x + 1.2, 0.5, 0);
        jawS.position.set(x, 0.3, 2);
        mesh.position.set(x + 1.2, 0.95, 0);
        const key = last?.id ?? '-';
        if (key !== shownFor) {
          shownFor = key;
          lcd.set(last ? `${cm.toFixed(2)} cm` : '0.00 cm', '#6ef08a', '');
        }
      };
      break;
    }
    case 'bumperKit': {
      const box = shadowed(new THREE.Mesh(new RoundedBoxGeometry(20, 2.4, 9, 2, 0.4), mats.blackPlastic));
      box.position.y = 1.2;
      body.add(box);
      const parts: Array<[string, number, number]> = [['spring', -6.5, BUMPER_COLOR.spring], ['magnet', 0, BUMPER_COLOR.magnet], ['velcro', 6.5, BUMPER_COLOR.velcro]];
      const pads: Record<string, THREE.Mesh> = {};
      for (const [part, x, col] of parts) {
        const pad = shadowed(new THREE.Mesh(new THREE.BoxGeometry(4.6, 1, 3), own(new THREE.MeshStandardMaterial({ color: col, roughness: 0.5 }))));
        pad.position.set(x, 2.9, -1.2);
        pads[part] = pad;
        body.add(pad, at(hit(new THREE.BoxGeometry(5.6, 2.4, 4), id, part), x, 2.9, -1.2));
      }
      const flip = button(0.9, mats.plasticBlue);
      flip.position.set(-3, 2.6, 3);
      const fix = button(0.9, mats.plasticYellow);
      fix.position.set(3, 2.6, 3);
      body.add(flip, fix, at(hit(new THREE.BoxGeometry(2.6, 1.6, 2.6), id, 'flip'), -3, 2.6, 3), at(hit(new THREE.BoxGeometry(2.6, 1.6, 2.6), id, 'fix'), 3, 2.6, 3));
      ring = selRing(10);
      group.add(ring);
      update = (ctx) => {
        // La pieza montada en los carros falta en el estuche.
        for (const [part] of parts) pads[part].visible = ctx.world.bumper.type !== part;
      };
      break;
    }
    case 'gate': {
      const G = GEOF07.gate;
      const span = TR.w + 3;
      const frame = new THREE.Group();
      const postA = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.4, G.h, 1.4), mats.blackPlastic));
      postA.position.set(0, G.h / 2 - 2, -span / 2 - 0.7);
      const postB = postA.clone();
      postB.position.z = span / 2 + 0.7;
      const top = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, span + 2.8), mats.blackPlastic));
      top.position.y = G.h - 2;
      const beamL = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, span + 1, 6), own(new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.6 })));
      beamL.rotation.x = Math.PI / 2;
      beamL.position.y = G.beamDz;
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), ledMat());
      led.position.set(0, G.h - 1, span / 2 + 1.6);
      const clamp = shadowed(new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1.2), red));
      clamp.position.set(0, -1.4, span / 2 + 1.6);
      frame.add(postA, postB, top, beamL, led, clamp);
      body.add(frame);
      frame.add(at(hit(new THREE.BoxGeometry(2, G.h, span + 3), id, 'mount'), 0, G.h / 2 - 2, 0));
      frame.add(at(hit(new THREE.BoxGeometry(3, 2, 2), id, 'clamp'), 0, -1.4, span / 2 + 1.6));
      ring = selRing(5);
      group.add(ring);
      place = (ctx) => {
        const w = ctx.world;
        placeAt(gateRoom(w, id));
        frame.rotation.set(0, (w.gates[id]?.yawDeg ?? 0) * DEG, -trackTilt(w) * DEG);
        setLed(led, !w.logger.gatesConnected ? 0x444444 : w.gates[id]?.blocked ? 0xff3b30 : 0x34c759);
        (clamp.material as THREE.MeshStandardMaterial) = w.track.gatesClamped ? green : red;
        return true;
      };
      break;
    }
    case 'forceSensor': {
      const cell = new THREE.Group();
      const box = shadowed(new THREE.Mesh(new RoundedBoxGeometry(2.6, 2.4, 4.2, 2, 0.4), own(new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.5 }))));
      const zeroBtn = button(0.45, mats.plasticBlue);
      const calBtn = button(0.45, mats.plasticYellow);
      const rngBtn = button(0.45, mats.plasticWhite);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), ledMat());
      for (const [m, z] of [[zeroBtn, -1.2], [calBtn, 0], [rngBtn, 1.2]] as const) {
        m.position.set(0, 1.3, z);
        cell.add(m);
      }
      led.position.set(0, 1.3, -2.2);
      cell.add(box, led);
      cell.add(at(hit(new THREE.BoxGeometry(2.6, 2.4, 4.2), id, 'body'), 0, 0, 0));
      cell.add(at(hit(new THREE.BoxGeometry(1.2, 1.2, 1.1), id, 'zero'), 0, 1.4, -1.2));
      cell.add(at(hit(new THREE.BoxGeometry(1.2, 1.2, 1.1), id, 'cal'), 0, 1.4, 0));
      cell.add(at(hit(new THREE.BoxGeometry(1.2, 1.2, 1.1), id, 'range'), 0, 1.4, 1.2));
      cell.add(at(hit(new THREE.BoxGeometry(1.2, 1.2, 1.1), id, 'plug'), 0, 1.4, -2.2));
      body.add(cell);
      ring = selRing(3);
      group.add(ring);
      place = (ctx) => {
        const w = ctx.world;
        placeAt(objRoom(w, id));
        cell.rotation.set(0, w.sensor.angleDeg * DEG, 0);
        const s = w.sensor;
        setLed(led, !s.connected ? 0x444444 : s.calibrated && s.zeroed ? 0x34c759 : 0xf0c36e);
        return true;
      };
      break;
    }
    case 'logger': {
      const Lg = GEOF07.logger;
      const box = shadowed(new THREE.Mesh(new RoundedBoxGeometry(Lg.w, Lg.h, Lg.d, 2, 0.6), own(new THREE.MeshStandardMaterial({ color: 0x2b3a4a, roughness: 0.5 }))));
      box.position.y = Lg.h / 2;
      const { lcd, mesh } = lcdScreen(13, 3.4, 360, 100);
      mesh.position.set(0, Lg.h * 0.7, Lg.d / 2 + 0.02);
      body.add(box, mesh);
      const ports: Array<[string, number, THREE.Material]> = [['portF', -5, mats.plasticWhite], ['portG', 0, mats.plasticYellow], ['portC', 5, mats.plasticBlue]];
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
      const tops: Array<[string, number, THREE.Material]> = [['rate', -6.5, mats.plasticBlue], ['readG', -2.2, mats.plasticYellow], ['readF', 2.2, mats.plasticWhite], ['readM', 6.5, mats.rubberRed]];
      for (const [part, x, mat] of tops) {
        const b = button(0.8, mat);
        b.position.set(x, Lg.h, -Lg.d / 2 + 3);
        body.add(b, at(hit(new THREE.BoxGeometry(2.6, 1.6, 2.6), id, part), x, Lg.h, -Lg.d / 2 + 3));
      }
      body.add(at(hit(new THREE.BoxGeometry(Lg.w, Lg.h, Lg.d), id, 'body'), 0, Lg.h / 2, 0));
      update = (ctx) => {
        const w = ctx.world;
        const on = (b: boolean) => (b ? 0x34c759 : 0x444444);
        setLed(portLeds.portF, on(w.sensor.connected));
        setLed(portLeds.portG, on(w.logger.gatesConnected));
        setLed(portLeds.portC, on(w.logger.cameraOn));
        const run = w.run && !w.run.done ? w.run : null;
        const last = run?.force[run.force.length - 1];
        const head = run ? (last && run.contactT !== null && run.contactEndT === null ? `F ${last[1].toFixed(1)} N` : `vA ${w.carts.cartA.v.toFixed(2)} m/s`) : 'LISTO';
        lcd.set(head, run ? '#6ef08a' : '#f0c36e', `${w.logger.rateHz} Hz · ${run ? 'REGISTRANDO' : `${w.runs.length} choques`}`);
      };
      break;
    }
    case 'camera': {
      const legs = [0, 2.1, 4.2].map((a) => {
        const l = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, GEOF07.camera.z + 2, 8), mats.darkMetal));
        l.position.set(Math.cos(a) * 3, GEOF07.camera.z / 2 - 1, Math.sin(a) * 3);
        l.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12);
        return l;
      });
      const cam = shadowed(new THREE.Mesh(new RoundedBoxGeometry(7, 4.4, 4, 2, 0.4), mats.blackPlastic));
      cam.position.y = GEOF07.camera.z + 1;
      const lens = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 2.4, 16), mats.darkMetal));
      lens.rotation.x = Math.PI / 2;
      lens.position.set(0, GEOF07.camera.z + 1, 3);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), ledMat());
      led.position.set(2.6, GEOF07.camera.z + 3.4, 1);
      body.add(...legs, cam, lens, led);
      body.add(at(hit(new THREE.BoxGeometry(8, 6, 7), id, 'body'), 0, GEOF07.camera.z + 1, 1));
      ring = selRing(5);
      group.add(ring);
      place = () => {
        group.position.set(GEOF07.camera.x, 0, -GEOF07.camera.y);
        return true;
      };
      update = (ctx) => setLed(led, ctx.world.logger.cameraOn ? (ctx.world.run && !ctx.world.run.done ? 0xff3b30 : 0x34c759) : 0x444444);
      break;
    }
    case 'posRuler': {
      const len = TR.len * 100;
      const face = new THREE.Mesh(new THREE.PlaneGeometry(len, 3), own(new THREE.MeshBasicMaterial({ map: own(horizontalScaleTexture(len)) })));
      face.rotation.x = -Math.PI / 2 + 0.35;
      face.position.y = 1.4;
      const back = shadowed(new THREE.Mesh(new THREE.BoxGeometry(len + 1, 1.2, 3.6), mats.wood));
      back.position.y = 0.6;
      body.add(back, face);
      body.add(at(hit(new THREE.BoxGeometry(len, 2, 4), id, 'body'), 0, 1, 0));
      place = () => {
        group.position.set(TR.x0 + len / 2, 0, -GEOF07.posRuler.y);
        return true;
      };
      break;
    }
    case 'balance': {
      const Bl = GEOF07.balance;
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

  // Las piezas que siguen el riel viven en la sala, no dentro del grupo.
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
        if (o.kind !== 'track' && o.kind !== 'launcher' && o.kind !== 'endStop') {
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
