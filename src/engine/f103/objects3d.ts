/**
 * Vistas 3D procedurales de F103: pista de vuelo sobre el suelo con colchón de impacto; soporte de patas regulables con
 * deck, nivel de burbuja, tornillo y bridas de anclaje; lanzador de resorte con cañón que gira en la boca (elevación y
 * azimut), transportador con puntero, émbolo con muescas, cordón y protector; fotopuerta en la boca; interfaz de
 * adquisición con pantalla; plataforma sensora con rejilla; pantalla vertical con papel carbónico y marcas; barrera de la
 * zona; ventilador; esferas (con la estela del vuelo); bandeja; plomada; regla vertical y cinta del suelo. SOLO leen el
 * estado; cada pieza funcional tiene un colisionador invisible simple (`userData {objId, part}`) para el rayo.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { F103Object, F103World } from '../../simulation/f103-world/types';
import { FLOOR_Z, GEOF103 } from '../../simulation/f103-world/geometry';
import { trayPose } from '../../simulation/f103-world/world';
import type { QualityLevel } from '../quality';
import { materials } from '../renderers/materials';
import { lcdTexture } from '../renderers/textures';
import type { FrameCtxF } from './F103Lab3D';
import { DEG, LANE, SCREEN_PARK_Y, ballRoom, deckRoom, muzzleRoom, platformRoom, rulerRoom, screenRoom } from './layout';

export interface ObjHandleF {
  group: THREE.Group;
  update(ctx: FrameCtxF, o: F103Object): void;
  dispose(): void;
}

const hitMat = () => materials('LOW').hit;
const F = FLOOR_Z;

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

/** Cinta métrica de `lenCm` (cero a la izquierda), con rótulos cada `labelEvery` cm. */
function tapeTexture(lenCm: number, pxPerCm: number, labelEvery: number, vertical = false): THREE.CanvasTexture {
  const L = Math.min(8192, Math.round(lenCm * pxPerCm));
  const k = L / lenCm;
  const W = vertical ? 96 : L;
  const H = vertical ? L : 64;
  return canvasTex(W, H, (g) => {
    g.fillStyle = '#f5d742';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#1b2733';
    g.fillStyle = '#1b2733';
    g.font = 'bold 20px sans-serif';
    g.textAlign = 'center';
    const step = pxPerCm >= 8 ? 1 : 10;
    for (let mm = 0; mm <= lenCm * 10; mm += step) {
      const p = mm * (k / 10);
      const major = mm % 100 === 0;
      const half = mm % 50 === 0;
      g.lineWidth = major ? 2 : 1;
      g.beginPath();
      if (vertical) {
        const y = H - p;
        g.moveTo(0, y);
        g.lineTo(major ? 36 : half ? 26 : 14, y);
      } else {
        g.moveTo(p, 0);
        g.lineTo(p, major ? 28 : half ? 20 : 12);
      }
      g.stroke();
      if (major && (mm / 10) % labelEvery === 0) {
        if (vertical) g.fillText(String(mm / 10), 62, H - p + 8);
        else g.fillText(String(mm / 10), Math.max(14, Math.min(W - 14, p)), 52);
      }
    }
  });
}

/** Transportador semicircular 0–90° (lado del operador). */
function protractorTexture(): THREE.CanvasTexture {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = 'rgba(245,245,240,0.95)';
    g.beginPath();
    g.moveTo(16, 240);
    g.arc(16, 240, 224, -Math.PI / 2, 0);
    g.closePath();
    g.fill();
    g.strokeStyle = '#111';
    g.fillStyle = '#111';
    g.font = 'bold 18px sans-serif';
    for (let d = 0; d <= 90; d++) {
      const a = (d * Math.PI) / 180;
      const r0 = d % 10 === 0 ? 180 : d % 5 === 0 ? 196 : 206;
      g.lineWidth = d % 10 === 0 ? 2 : 1;
      g.beginPath();
      g.moveTo(16 + Math.cos(a) * r0, 240 - Math.sin(a) * r0);
      g.lineTo(16 + Math.cos(a) * 222, 240 - Math.sin(a) * 222);
      g.stroke();
      if (d % 10 === 0) g.fillText(String(d), 16 + Math.cos(a) * 160 - 10, 240 - Math.sin(a) * 160 + 6);
    }
  });
}

function gridTexture(): THREE.CanvasTexture {
  return canvasTex(400, 400, (g) => {
    g.fillStyle = '#2b3138';
    g.fillRect(0, 0, 400, 400);
    for (let i = 0; i <= 40; i++) {
      g.strokeStyle = i % 10 === 0 ? '#e8eef3' : i % 5 === 0 ? '#9aa6b2' : '#56606a';
      g.lineWidth = i % 10 === 0 ? 2 : 1;
      g.beginPath();
      g.moveTo(i * 10, 0);
      g.lineTo(i * 10, 400);
      g.moveTo(0, i * 10);
      g.lineTo(400, i * 10);
      g.stroke();
    }
    g.fillStyle = '#f5d742';
    g.fillRect(0, 0, 12, 400);
  });
}

function trailLine(color: number, n: number): THREE.Line {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * n), 3));
  geo.setDrawRange(0, 0);
  const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7 }));
  l.frustumCulled = false;
  return l;
}

export function createObjVisualF(o: F103Object, w0: F103World, q: QualityLevel): ObjHandleF {
  const mats = materials(q);
  const seg = q === 'LOW' ? 14 : q === 'MEDIUM' ? 24 : 36;
  const group = new THREE.Group();
  const disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];
  let ring: THREE.Mesh | null = null;
  let update: ObjHandleF['update'] = () => undefined;
  let place: ((ctx: FrameCtxF, ob: F103Object) => boolean) | null = null;
  const id = o.id;
  const own = <M extends THREE.Material | THREE.Texture>(m: M): M => {
    disposables.push(m);
    return m;
  };
  const alu = own(new THREE.MeshStandardMaterial({ color: 0xc8cdd2, metalness: 0.7, roughness: 0.35 }));
  const blue = own(new THREE.MeshStandardMaterial({ color: 0x2f6db5, roughness: 0.45 }));
  const red = own(new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.45 }));
  const green = own(new THREE.MeshStandardMaterial({ color: 0x2e9d57, roughness: 0.45 }));
  const foam = own(new THREE.MeshStandardMaterial({ color: 0x2d5f8a, roughness: 0.95 }));
  const paperMat = own(new THREE.MeshStandardMaterial({ color: 0xf4f1e6, roughness: 0.9, side: THREE.DoubleSide }));
  const body = new THREE.Group();
  group.add(body);
  const lcdScreen = (w: number, h: number, pw = 256, ph = 96) => {
    const lcd = lcdTexture(pw, ph);
    own(lcd.texture);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), own(new THREE.MeshBasicMaterial({ map: lcd.texture })));
    return { lcd, mesh: m };
  };
  const button = (r: number, mat: THREE.Material) => shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.6, 14), mat));

  switch (o.kind) {
    case 'lane': {
      // Grupo en (x0, suelo, eje): la pista va de la boca al colchón.
      const L = LANE.x1 - LANE.x0;
      const W = LANE.halfW * 2;
      const mat = own(new THREE.MeshStandardMaterial({ color: 0x5d6b74, roughness: 0.95 }));
      const strip = new THREE.Mesh(new THREE.BoxGeometry(L, 0.3, W), mat);
      strip.position.set(L / 2, 0.15, 0);
      strip.receiveShadow = true;
      const edgeMat = own(new THREE.MeshBasicMaterial({ color: 0xf5d742 }));
      const e1 = new THREE.Mesh(new THREE.BoxGeometry(L, 0.35, 2), edgeMat);
      e1.position.set(L / 2, 0.2, W / 2);
      const e2 = e1.clone();
      e2.position.z = -W / 2;
      const mattress = shadowed(new THREE.Mesh(new RoundedBoxGeometry(12, LANE.backstopH, W, 2, 2), foam));
      mattress.position.set(L + 6, LANE.backstopH / 2, 0);
      body.add(strip, e1, e2, mattress);
      place = () => {
        group.position.set(LANE.x0, F, -LANE.yc);
        return true;
      };
      break;
    }
    case 'stand': {
      const S = GEOF103.stand;
      const deck = new THREE.Group();
      const plate = shadowed(new THREE.Mesh(new THREE.BoxGeometry(S.w, 2.5, S.d), mats.darkMetal));
      plate.position.y = -1.25;
      const vial = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 8, 12), own(new THREE.MeshPhysicalMaterial({ color: 0xc8f0a8, transparent: true, opacity: 0.7, roughness: 0.1 }))));
      vial.rotation.z = Math.PI / 2;
      vial.position.set(-10, 1.2, -S.d / 2 + 5);
      const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.8, 10, 8), own(new THREE.MeshBasicMaterial({ color: 0xffffff })));
      bubble.position.set(-10, 1.8, -S.d / 2 + 5);
      deck.add(plate, vial, bubble);
      deck.add(at(hit(new THREE.BoxGeometry(10, 3, 4), id, 'level'), -10, 1.2, -S.d / 2 + 5));
      const legs: THREE.Mesh[] = [];
      for (const [lx, lz] of [[-S.w / 2 + 3, -S.d / 2 + 3], [S.w / 2 - 3, -S.d / 2 + 3], [-S.w / 2 + 3, S.d / 2 - 3], [S.w / 2 - 3, S.d / 2 - 3]] as Array<[number, number]>) {
        const leg = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 1, 10), alu));
        leg.position.set(lx, 0, lz);
        legs.push(leg);
        body.add(leg);
      }
      const column = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 1, 16), mats.chrome));
      const screw = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 2, 16), mats.blackPlastic));
      const flangeMat = own(new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.5 }));
      const flanges: THREE.Mesh[] = [];
      for (const lx of [-S.w / 2 + 3, S.w / 2 - 3]) {
        const fl = shadowed(new THREE.Mesh(new THREE.BoxGeometry(6, 1.2, 6), flangeMat));
        fl.position.set(lx, 0.6, -S.d / 2 + 3);
        flanges.push(fl);
        body.add(fl);
      }
      body.add(deck, column, screw);
      const hColumn = hit(new THREE.CylinderGeometry(4, 4, 1, 8), id, 'column');
      const hScrew = hit(new THREE.BoxGeometry(5, 4, 5), id, 'screw');
      body.add(hColumn, hScrew, at(hit(new THREE.BoxGeometry(S.w, 3, 8), id, 'anchor'), 0, 1.5, -S.d / 2 + 3));
      ring = selRing(30);
      group.add(ring);
      place = (ctx) => {
        const w = ctx.world;
        const d = deckRoom(w);
        const h = w.stand.heightCm;
        group.position.set(d.x, F, -d.y);
        deck.position.y = Math.max(2.5, h);
        deck.rotation.z = w.stand.tiltDeg * DEG;
        for (const leg of legs) {
          leg.scale.y = Math.max(1, h - 2);
          leg.position.y = Math.max(1, h - 2) / 2;
        }
        column.scale.y = Math.max(1, h - 2);
        column.position.y = Math.max(1, h - 2) / 2;
        hColumn.scale.y = Math.max(1, h - 2);
        hColumn.position.set(0, Math.max(1, h - 2) / 2, 0);
        screw.position.set(S.w / 2 - 3, Math.max(4, h * 0.3), S.d / 2 - 3);
        hScrew.position.copy(screw.position);
        screw.rotation.y = w.stand.tiltDeg * 10;
        bubble.position.x = -10 + Math.max(-3.5, Math.min(3.5, w.stand.tiltDeg * 3));
        flangeMat.color.setHex(w.stand.anchored ? 0x2e9d57 : 0xc0392b);
        return true;
      };
      break;
    }
    case 'launcher': {
      const Lg = GEOF103.launcher;
      const yaw = new THREE.Group();
      const elev = new THREE.Group();
      yaw.add(elev);
      const barrel = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(2, 2, Lg.barrel, seg), mats.darkMetal));
      barrel.rotation.z = Math.PI / 2;
      barrel.position.x = -Lg.barrel / 2;
      const housing = shadowed(new THREE.Mesh(new RoundedBoxGeometry(18, 7, 8, 2, 1), blue));
      housing.position.set(-Lg.barrel - 6, 0, 0);
      const plunger = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 10, 10), mats.chrome));
      plunger.rotation.z = Math.PI / 2;
      const knobR = shadowed(new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 10), mats.blackPlastic));
      const cord = shadowed(new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.25, 6, 14), mats.plasticYellow));
      cord.position.set(-Lg.barrel - 8, -5.5, 0);
      const cap = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 2, seg), red));
      cap.rotation.z = Math.PI / 2;
      cap.position.x = 0.8;
      elev.add(barrel, housing, plunger, knobR, cord, cap);
      // Transportador fijo al soporte (lado del operador) con el puntero solidario al cañón.
      const prot = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), own(new THREE.MeshBasicMaterial({ map: own(protractorTexture()), transparent: true, side: THREE.DoubleSide })));
      prot.position.set(9, 9, 4.6);
      const pointer = new THREE.Mesh(new THREE.BoxGeometry(17, 0.25, 0.1), own(new THREE.MeshBasicMaterial({ color: 0xd0021b })));
      pointer.position.set(8.5, 0, 4.7);
      elev.add(pointer);
      const knob = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 2, 16), mats.blackPlastic));
      knob.rotation.x = Math.PI / 2;
      knob.position.set(0, 0, -5);
      const zeroBtn = button(0.9, mats.plasticYellow);
      zeroBtn.rotation.x = Math.PI / 2;
      zeroBtn.position.set(-2, -3, 4.8);
      const pivot = shadowed(new THREE.Mesh(new THREE.BoxGeometry(6, 10, 10), mats.darkMetal));
      pivot.position.set(0, -6, 0);
      yaw.add(prot, knob, zeroBtn, pivot);
      body.add(yaw);
      const hPlunger = hit(new THREE.BoxGeometry(6, 4, 4), id, 'plunger');
      elev.add(hPlunger);
      elev.add(at(hit(new THREE.BoxGeometry(4, 4, 4), id, 'cord'), -Lg.barrel - 8, -5.5, 0));
      elev.add(at(hit(new THREE.BoxGeometry(4, 5, 5), id, 'cap'), 1, 0, 0));
      elev.add(at(hit(new THREE.BoxGeometry(Lg.barrel, 4.5, 4.5), id, 'barrel'), -Lg.barrel / 2, 0, 0));
      yaw.add(at(hit(new THREE.BoxGeometry(20, 20, 1), id, 'protractor'), 9, 9, 4.8));
      yaw.add(at(hit(new THREE.BoxGeometry(5, 5, 3), id, 'knob'), 0, 0, -5.5));
      yaw.add(at(hit(new THREE.BoxGeometry(2.4, 2.4, 1.4), id, 'zero'), -2, -3, 5));
      yaw.add(at(hit(new THREE.BoxGeometry(8, 8, 12), id, 'yaw'), 0, -7, 0));
      ring = selRing(8);
      place = (ctx) => {
        const w = ctx.world;
        const m = muzzleRoom(w);
        group.position.set(m.x, m.z, -m.y);
        yaw.rotation.y = w.launcher.yawDeg * DEG;
        prot.rotation.z = w.stand.tiltDeg * DEG;
        elev.rotation.z = (w.launcher.angleDeg + w.stand.tiltDeg) * DEG;
        // El puntero marca la elevación con el error de cero del dial (mando + desplazamiento).
        pointer.rotation.z = (w.launcher.protractorOffsetDeg - w.stand.tiltDeg) * DEG;
        const back = -Lg.barrel - 15 - w.launcher.notch * 3;
        plunger.position.set(back - 5, 0, 0);
        knobR.position.set(back - 10, 0, 0);
        hPlunger.position.set(back - 9, 0, 0);
        knob.rotation.z = w.launcher.angleDeg * DEG * 4;
        cap.visible = w.launcher.capOn;
        return true;
      };
      break;
    }
    case 'gate': {
      const frame = new THREE.Group();
      const postA = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.2, 9, 1.2), mats.blackPlastic));
      postA.position.set(0, 0, -3.5);
      const postB = postA.clone();
      postB.position.z = 3.5;
      const top = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 8.2), mats.blackPlastic));
      top.position.y = 4.5;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 6, 6), own(new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.6 })));
      beam.rotation.x = Math.PI / 2;
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), own(new THREE.MeshBasicMaterial({ color: 0x444444 })));
      led.position.set(0, 5.4, 0);
      const offKnob = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1, 12), mats.plasticBlue));
      offKnob.position.set(0, -5, 3.5);
      frame.add(postA, postB, top, beam, led, offKnob);
      body.add(frame);
      frame.add(at(hit(new THREE.BoxGeometry(2, 10, 9), id, 'mount'), 0, 0, 0));
      frame.add(at(hit(new THREE.BoxGeometry(2, 2, 2), id, 'offset'), 0, -5, 3.5));
      frame.add(at(hit(new THREE.BoxGeometry(2, 2, 2), id, 'plug'), 0, 5.4, 0));
      ring = selRing(5);
      group.add(ring);
      place = (ctx) => {
        const w = ctx.world;
        const m = muzzleRoom(w);
        if (w.gate.mounted) {
          const e = (w.launcher.angleDeg + w.stand.tiltDeg) * DEG;
          const a = w.launcher.yawDeg * DEG;
          const s = GEOF103.launcher.gateDz;
          group.position.set(m.x + Math.cos(e) * Math.cos(a) * s, m.z + Math.sin(e) * s, -(m.y + Math.cos(e) * Math.sin(a) * s));
          frame.rotation.set(0, a, e);
          beam.position.y = -w.gate.offsetMm / 10;
        } else {
          const d = deckRoom(w);
          group.position.set(d.x + 18, d.z + 5, -(d.y - 16));
          frame.rotation.set(0, 0, 0);
          beam.position.y = 0;
        }
        (led.material as THREE.MeshBasicMaterial).color.setHex(w.gate.connected ? (w.flight && !w.flight.done && w.flight.gateOut !== null && w.timeS < w.flight.gateOut + 0.05 ? 0xff3b30 : 0x34c759) : 0x444444);
        return true;
      };
      break;
    }
    case 'timer': {
      const T = GEOF103.timer;
      const box = shadowed(new THREE.Mesh(new RoundedBoxGeometry(T.w, T.h, T.d, 2, 0.5), own(new THREE.MeshStandardMaterial({ color: 0x2b3a4a, roughness: 0.5 }))));
      box.position.y = T.h / 2;
      const { lcd, mesh } = lcdScreen(12, 3.2, 320, 96);
      mesh.position.set(0, T.h * 0.66, T.d / 2 + 0.02);
      const btns: Array<[string, number, THREE.Material]> = [['rate', -5.4, mats.plasticBlue], ['range', -1.8, mats.plasticBlue], ['readGate', 1.8, mats.plasticYellow], ['readImpact', 5.4, mats.plasticYellow]];
      for (const [part, x, mat] of btns) {
        const b = button(0.8, mat);
        b.rotation.x = Math.PI / 2;
        b.position.set(x, 1.5, T.d / 2 + 0.2);
        body.add(b, at(hit(new THREE.BoxGeometry(2.6, 2.6, 1.4), id, part), x, 1.5, T.d / 2 + 0.3));
      }
      body.add(box, mesh, at(hit(new THREE.BoxGeometry(T.w, T.h, T.d), id, 'body'), 0, T.h / 2, 0));
      update = (ctx) => {
        const w = ctx.world;
        const ch = `${w.gate.connected ? 'FP' : '--'} · ${w.platform.connected ? 'PL' : '--'}`;
        const rate = w.timer.rateHz >= 1000 ? `${w.timer.rateHz / 1000} kHz` : `${w.timer.rateHz} Hz`;
        lcd.set(rate, '#6ef08a', `${ch} · reloj ${w.timer.range === 'short' ? '1 s' : '10 s'}`);
      };
      break;
    }
    case 'platform': {
      const P = GEOF103.platform;
      const plate = shadowed(new THREE.Mesh(new THREE.BoxGeometry(P.size, P.h, P.size), own(new THREE.MeshStandardMaterial({ map: own(gridTexture()), roughness: 0.6 }))));
      plate.position.y = P.h / 2;
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), own(new THREE.MeshBasicMaterial({ color: 0x444444 })));
      led.position.set(P.size / 2 - 2, P.h + 0.5, P.size / 2 + 1.5);
      const calBtn = button(1, mats.plasticYellow);
      calBtn.position.set(P.size / 2 - 6, P.h, P.size / 2 + 1.5);
      const index = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 4), own(new THREE.MeshBasicMaterial({ color: 0xd0021b })));
      index.position.set(-P.size / 2, 0.3, P.size / 2 + 2);
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.9, 16), own(new THREE.MeshBasicMaterial({ color: 0xff3b30 })));
      dot.rotation.x = -Math.PI / 2;
      dot.visible = false;
      body.add(plate, led, calBtn, index, dot);
      body.add(at(hit(new THREE.BoxGeometry(P.size, P.h + 1, P.size), id, 'body'), 0, P.h / 2, 0));
      body.add(at(hit(new THREE.BoxGeometry(3, 2, 3), id, 'cal'), P.size / 2 - 6, P.h, P.size / 2 + 1.5));
      body.add(at(hit(new THREE.BoxGeometry(2.5, 2.5, 2.5), id, 'plug'), P.size / 2 - 2, P.h + 0.5, P.size / 2 + 1.5));
      body.add(at(hit(new THREE.BoxGeometry(2, 2, 5), id, 'index'), -P.size / 2, 0.5, P.size / 2 + 2));
      ring = selRing(P.size * 0.75);
      group.add(ring);
      place = (ctx) => {
        const w = ctx.world;
        const p = platformRoom(w);
        group.position.set(p.x, F, -p.y);
        const settling = w.timeS - w.platform.movedS < w.params.platform.settleS && !ctx.reducedMotion;
        plate.position.x = settling ? Math.sin(w.timeS * 60) * 0.15 : 0;
        (led.material as THREE.MeshBasicMaterial).color.setHex(!w.platform.connected ? 0x444444 : w.platform.calibrated ? 0x34c759 : 0xf0c36e);
        const c = w.lastShot?.platformContact;
        dot.visible = !!c && w.lastShot!.platformAt.x === w.platform.x;
        if (c) dot.position.set(c.x * 100 - p.x, P.h + 0.05, -(c.y * 100 - p.y));
        return true;
      };
      break;
    }
    case 'screen': {
      const Sc = GEOF103.screen;
      const board = shadowed(new THREE.Mesh(new THREE.BoxGeometry(Sc.d, Sc.h, Sc.w), own(new THREE.MeshStandardMaterial({ color: 0xe9e4d4, roughness: 0.85 }))));
      board.position.y = Sc.h / 2;
      const scale = new THREE.Mesh(new THREE.PlaneGeometry(4, Sc.h), own(new THREE.MeshBasicMaterial({ map: own(tapeTexture(Sc.h, 12, 10, true)), side: THREE.DoubleSide })));
      scale.rotation.y = -Math.PI / 2;
      scale.position.set(-Sc.d / 2 - 0.05, Sc.h / 2, Sc.w / 2 - 2);
      const feet = shadowed(new THREE.Mesh(new THREE.BoxGeometry(30, 2, 8), mats.darkMetal));
      feet.position.y = 1;
      const clearBtn = button(1, mats.plasticYellow);
      clearBtn.rotation.z = Math.PI / 2;
      clearBtn.position.set(-Sc.d / 2 - 0.3, 10, -Sc.w / 2 + 4);
      body.add(board, scale, feet, clearBtn);
      const markMat = own(new THREE.MeshBasicMaterial({ color: 0x111111 }));
      const marks: THREE.Mesh[] = [];
      for (let i = 0; i < 12; i++) {
        const mk = new THREE.Mesh(new THREE.CircleGeometry(0.9, 12), markMat);
        mk.rotation.y = -Math.PI / 2;
        mk.visible = false;
        marks.push(mk);
        body.add(mk);
      }
      body.add(at(hit(new THREE.BoxGeometry(Sc.d + 1, Sc.h, Sc.w), id, 'body'), 0, Sc.h / 2, 0));
      body.add(at(hit(new THREE.BoxGeometry(2, Sc.h, 5), id, 'scale'), -Sc.d / 2 - 0.5, Sc.h / 2, Sc.w / 2 - 2));
      body.add(at(hit(new THREE.BoxGeometry(3, 3, 3), id, 'clear'), -Sc.d / 2 - 0.5, 10, -Sc.w / 2 + 4));
      body.add(at(hit(new THREE.BoxGeometry(30, 3, 9), id, 'foot'), 0, 1, 0));
      ring = selRing(20);
      group.add(ring);
      place = (ctx) => {
        const w = ctx.world;
        const s = screenRoom(w);
        group.position.set(s.x, F, -s.y);
        body.rotation.y = w.screen.inLane ? 0 : Math.PI / 2;
        marks.forEach((mk, i) => {
          const m = w.screen.marks[w.screen.marks.length - 1 - i];
          mk.visible = !!m && w.screen.inLane;
          if (m) mk.position.set(-Sc.d / 2 - 0.06, m.z * 100, -(m.y * 100 - LANE.yc));
        });
        return true;
      };
      void SCREEN_PARK_Y;
      break;
    }
    case 'barrier': {
      const posts: THREE.Mesh[] = [];
      for (const dz of [-20, 20]) {
        const p = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.5, 95, 12), mats.plasticYellow));
        p.position.set(0, 47.5, dz);
        posts.push(p);
        body.add(p);
      }
      const bandTex = own(canvasTex(256, 32, (g) => {
        for (let i = 0; i < 16; i++) {
          g.fillStyle = i % 2 ? '#111' : '#f5d742';
          g.fillRect(i * 16, 0, 16, 32);
        }
      }));
      const band = new THREE.Mesh(new THREE.BoxGeometry(1, 6, 40), own(new THREE.MeshStandardMaterial({ map: bandTex, roughness: 0.6 })));
      body.add(band);
      const hBand = hit(new THREE.BoxGeometry(4, 10, 44), id, 'band');
      body.add(hBand);
      place = (ctx) => {
        const w = ctx.world;
        group.position.set(GEOF103.barrier.x, F, -GEOF103.barrier.y);
        const yb = w.barrierClosed ? 85 : 8;
        band.position.y = yb;
        hBand.position.y = yb;
        return true;
      };
      break;
    }
    case 'fan': {
      const R = GEOF103.fan.r;
      const housing = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(R, R, 8, seg, 1, true), own(new THREE.MeshStandardMaterial({ color: 0x9aa6b2, side: THREE.DoubleSide, roughness: 0.5 }))));
      housing.rotation.x = Math.PI / 2;
      const blades = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const b = shadowed(new THREE.Mesh(new THREE.BoxGeometry(R * 0.85, 0.4, 5), mats.blackPlastic));
        b.position.x = R * 0.42;
        const arm = new THREE.Group();
        arm.rotation.z = (i * Math.PI) / 2;
        arm.add(b);
        blades.add(arm);
      }
      const head = new THREE.Group();
      head.add(housing, blades);
      head.position.y = R + 30;
      const stand = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, R + 30, 10), mats.darkMetal));
      stand.position.y = (R + 30) / 2;
      const base = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(14, 16, 3, 20), mats.darkMetal));
      base.position.y = 1.5;
      const sw = button(1.5, mats.rubberRed);
      sw.position.set(10, 3.2, 8);
      body.add(head, stand, base, sw);
      body.add(at(hit(new THREE.BoxGeometry(5, 4, 5), id, 'switch'), 10, 3.2, 8));
      head.add(at(hit(new THREE.CylinderGeometry(R, R, 10, 10), id, 'dir'), 0, 0, 0));
      (head.children[head.children.length - 1] as THREE.Mesh).rotation.x = Math.PI / 2;
      let spin = 0;
      place = (ctx) => {
        const w = ctx.world;
        group.position.set(GEOF103.fan.x, F, -GEOF103.fan.y);
        // 'side' sopla hacia la mesada (+y); 'head' en contra del tiro (−x); 'tail' a favor (+x).
        head.rotation.y = w.fan.dir === 'side' ? 0 : w.fan.dir === 'head' ? -Math.PI / 2 : Math.PI / 2;
        if (!ctx.reducedMotion) spin += ctx.dt * w.fan.speed * 25;
        blades.rotation.z = spin;
        (sw.material as THREE.Material) = w.fan.speed ? mats.plasticYellow : mats.rubberRed;
        return true;
      };
      break;
    }
    case 'ball': {
      const b = w0.balls[id];
      const r = (b?.diameterM ?? 0.025) * 50;
      const mat = id === 'ballL' ? own(new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4 })) : id === 'ballX' ? own(new THREE.MeshStandardMaterial({ color: 0xe67e22, roughness: 0.4 })) : mats.steel;
      const sphere = shadowed(new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.7)), mat));
      sphere.position.y = r;
      body.add(sphere);
      body.add(at(hit(new THREE.SphereGeometry(Math.max(r, 2), 8, 6), id), 0, r, 0));
      const trail = trailLine(0xff7a00, 240);
      const tPos = trail.geometry.attributes.position as THREE.BufferAttribute;
      let tShot = -1;
      let tN = 0;
      ring = selRing(r + 1.2);
      group.add(ring);
      place = (ctx, ob) => {
        const w = ctx.world;
        const p = ballRoom(w, id);
        const flying = ob.support === 'air';
        const f = w.flight;
        if (f && f.ball === id) {
          if (f.shot !== tShot) {
            tShot = f.shot;
            tN = 0;
          }
          if (!f.done && tN < 240) {
            tPos.setXYZ(tN++, f.x * 100, F + f.z * 100, -f.y * 100);
            tPos.needsUpdate = true;
            trail.geometry.setDrawRange(0, tN);
          }
        }
        if (!trail.parent && group.parent) group.parent.add(trail);
        trail.visible = !!f && f.ball === id && tN > 1 && w.timeS - f.launchedS < 12;
        sphere.scale.set(1, w.balls[id]?.damaged ? 0.88 : 1, 1);
        body.visible = ob.support !== 'launcher';
        if (!p) {
          // En la bandeja: sigue a la altura del deck.
          if (ob.support === 'tray') {
            const tp = trayPose(w, id);
            group.position.set(tp.x, tp.z, -tp.y);
            return true;
          }
          return false;
        }
        group.position.set(p.x, p.z - r, -p.y);
        void flying;
        return true;
      };
      disposables.push(trail.geometry, trail.material as THREE.Material);
      const baseDispose = () => trail.parent?.remove(trail);
      update = () => undefined;
      const prevDispose = disposables;
      void prevDispose;
      (group.userData as { onDispose?: () => void }).onDispose = baseDispose;
      break;
    }
    case 'tray': {
      const T = GEOF103.tray;
      const tray = shadowed(new THREE.Mesh(new THREE.BoxGeometry(T.w, 0.6, T.d), mats.blackPlastic));
      tray.position.y = 0.3;
      const rimA = shadowed(new THREE.Mesh(new THREE.BoxGeometry(T.w, T.h, 0.6), mats.blackPlastic));
      rimA.position.set(0, T.h / 2, T.d / 2);
      const rimB = rimA.clone();
      rimB.position.z = -T.d / 2;
      body.add(tray, rimA, rimB);
      group.add(at(hit(new THREE.BoxGeometry(T.w, T.h, T.d), id), 0, T.h / 2, 0));
      place = (ctx) => {
        const w = ctx.world;
        const m = muzzleRoom(w);
        group.position.set(m.x - 35, F + w.stand.heightCm, -(m.y + 14));
        return true;
      };
      break;
    }
    case 'floorTape': {
      const len = GEOF103.floorTape.len;
      const tape = new THREE.Mesh(new THREE.PlaneGeometry(len, 3), own(new THREE.MeshBasicMaterial({ map: own(tapeTexture(len, 5, 50)) })));
      tape.rotation.x = -Math.PI / 2;
      tape.position.set(len / 2, 0.4, 0);
      const hook = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1, 1.5, 4), mats.steel));
      hook.position.set(-0.5, 0.75, 0);
      body.add(tape, hook);
      body.add(at(hit(new THREE.BoxGeometry(3, 2, 5), id, 'zero'), -0.5, 0.75, 0));
      body.add(at(hit(new THREE.BoxGeometry(len, 1, 4), id, 'tape'), len / 2, 0.4, 0));
      place = (ctx) => {
        group.position.set(ctx.world.tapeZeroX * 100, F, -GEOF103.floorTape.y);
        return true;
      };
      break;
    }
    case 'plumb': {
      const string = trailLine(0x222222, 2);
      const sPos = string.geometry.attributes.position as THREE.BufferAttribute;
      string.geometry.setDrawRange(0, 2);
      const bob = shadowed(new THREE.Mesh(new THREE.ConeGeometry(1, 3, 12), mats.chrome));
      bob.rotation.x = Math.PI;
      const mark = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.6, 16), own(new THREE.MeshBasicMaterial({ color: 0xd0021b, side: THREE.DoubleSide })));
      mark.rotation.x = -Math.PI / 2;
      body.add(string, bob, mark);
      const hBob = hit(new THREE.BoxGeometry(4, 5, 4), id, 'bob');
      const hMark = hit(new THREE.BoxGeometry(5, 1, 5), id, 'mark');
      body.add(hBob, hMark);
      place = (ctx) => {
        const w = ctx.world;
        const m = muzzleRoom(w);
        group.position.set(m.x, F, -m.y);
        const top = m.z - F - 3;
        sPos.setXYZ(0, 0, top, 0);
        sPos.setXYZ(1, 0, 3, 0);
        sPos.needsUpdate = true;
        bob.position.set(0, 1.6, 0);
        hBob.position.set(0, 2.5, 0);
        const pm = w.plumbMark;
        mark.visible = !!pm;
        if (pm) mark.position.set(pm.x * 100 - m.x, 0.45, -(pm.y * 100 - m.y));
        hMark.position.copy(mark.position);
        return true;
      };
      break;
    }
    case 'heightRuler': {
      const H = GEOF103.heightRuler.h;
      const rule = shadowed(new THREE.Mesh(new THREE.BoxGeometry(4, H, 0.6), alu));
      rule.position.y = H / 2;
      const face = new THREE.Mesh(new THREE.PlaneGeometry(3.6, H), own(new THREE.MeshBasicMaterial({ map: own(tapeTexture(H, 20, 10, true)) })));
      face.position.set(0, H / 2, 0.31);
      const foot = shadowed(new THREE.Mesh(new THREE.BoxGeometry(12, 1.5, 8), mats.darkMetal));
      foot.position.y = 0.75;
      const slider = shadowed(new THREE.Mesh(new THREE.BoxGeometry(8, 1, 3), red));
      body.add(rule, face, foot, slider);
      const hScale = hit(new THREE.BoxGeometry(5, H, 2), id, 'scale');
      hScale.position.y = H / 2;
      body.add(hScale);
      ring = selRing(7);
      group.add(ring);
      place = (ctx) => {
        const w = ctx.world;
        const r = rulerRoom(w);
        group.position.set(r.x, F, -r.y);
        slider.position.set(-3, muzzleRoom(w).z - F, 0);
        return true;
      };
      break;
    }
  }

  group.traverse((c) => {
    const m = c as THREE.Mesh;
    if ((m.isMesh || (c as THREE.Line).isLine) && m.geometry) disposables.push(m.geometry);
    if ((c as THREE.Line).isLine) disposables.push((c as THREE.Line).material as THREE.Material);
  });
  void green;
  void paperMat;

  return {
    group,
    update: (ctx, ob) => {
      if (!(place && place(ctx, ob))) {
        const p = ob.pose;
        group.position.set(p.x, p.z, -p.y);
        group.rotation.set(0, 0, 0);
      }
      if (ring) ring.visible = ctx.selected === id;
      update(ctx, ob);
    },
    dispose() {
      (group.userData as { onDispose?: () => void }).onDispose?.();
      for (const d of new Set(disposables)) d.dispose();
    },
  };
}
