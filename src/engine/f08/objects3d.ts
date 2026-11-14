/**
 * Vistas 3D procedurales de F08: soporte giratorio con base de transportador impreso, traba y guarda transparente con
 * puerta; eje con tambor escalonado, plataforma con su marca y freno de mano; disco, aro y barra (sobre el eje, en la
 * bandeja o en el plato); masas corredizas con fijador y regla radial sobre la barra; cuerda enrollada en el tambor, polea
 * en el canto y masa colgante que baja junto a la columna de caída con su tope blando y su fotopuerta; encoder bajo la
 * plataforma, tacómetro láser en su pie, sensor de tensión en la cuerda, registrador, balanza, estante y calibre.
 * SOLO leen el estado; cada pieza funcional tiene un colisionador invisible simple (`userData {objId, part}`).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { F08Object, F08World, SlideId, SolidId } from '../../simulation/f08-world/types';
import { GEOF08 } from '../../simulation/f08-world/geometry';
import { massOfG } from '../../simulation/f08-world/world';
import { massZ } from '../../simulation/f08-world/conservation';
import type { QualityLevel } from '../quality';
import { materials } from '../renderers/materials';
import { lcdTexture } from '../renderers/textures';
import type { FrameCtxF } from './F08Lab3D';
import { DEG, SOLID_H, TABLE_TOP, catchRoom, dropLine, dropRoom, gateRoom, objRoom, panRoom, slideRoom, solidAngle, solidRoom } from './layout';

export interface ObjHandleF {
  group: THREE.Group;
  update(ctx: FrameCtxF, o: F08Object): void;
  dispose(): void;
}

const hitMat = () => materials('LOW').hit;
const AX = GEOF08.axis;
const TABLE = GEOF08.table;
const DRUM = GEOF08.drum;
const COL = GEOF08.column;

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

/** Transportador impreso en la base: círculo graduado cada grado con números cada 30°, 0° hacia +x. */
function protractorTexture(): THREE.CanvasTexture {
  const N = 1024;
  return canvasTex(N, N, (g) => {
    g.fillStyle = '#e9e4d4';
    g.fillRect(0, 0, N, N);
    const c = N / 2;
    const R = N * 0.47;
    g.strokeStyle = '#1b2733';
    g.fillStyle = '#1b2733';
    g.font = 'bold 30px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let d = 0; d < 360; d++) {
      const a = (-d * Math.PI) / 180;
      const len = d % 30 === 0 ? 44 : d % 10 === 0 ? 30 : d % 5 === 0 ? 20 : 11;
      g.lineWidth = d % 10 === 0 ? 3 : 1.4;
      g.beginPath();
      g.moveTo(c + Math.cos(a) * R, c + Math.sin(a) * R);
      g.lineTo(c + Math.cos(a) * (R - len), c + Math.sin(a) * (R - len));
      g.stroke();
      if (d % 30 === 0) g.fillText(`${d}°`, c + Math.cos(a) * (R - 70), c + Math.sin(a) * (R - 70));
    }
  });
}

/** Regla radial de la barra: 0 en el centro y números cada 5 cm hacia los dos extremos. */
function radialScaleTexture(lenCm: number): THREE.CanvasTexture {
  const k = 24;
  const W = Math.round(lenCm * k);
  const H = 48;
  return canvasTex(W, H, (g) => {
    g.fillStyle = '#f4f1e6';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#1b2733';
    g.fillStyle = '#1b2733';
    g.font = 'bold 18px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'bottom';
    const half = (lenCm * 10) / 2;
    for (let mm = -half; mm <= half; mm++) {
      const x = (mm + half) * (k / 10);
      const major = mm % 50 === 0;
      g.lineWidth = major ? 2 : 1;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, major ? 24 : mm % 10 === 0 ? 15 : 7);
      g.stroke();
      if (major && mm !== -half && mm !== half) g.fillText(String(Math.abs(mm / 10)), x, H - 2);
    }
  });
}

/** Forma anular (aro, contorno de la guarda) acostada sobre el plano de la mesada, de alto `h`. */
function annulus(rOut: number, rIn: number, h: number, seg: number): THREE.BufferGeometry {
  const sh = new THREE.Shape();
  sh.absarc(0, 0, rOut, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, rIn, 0, Math.PI * 2, true);
  sh.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: seg });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

export function createObjVisualF(o: F08Object, _w0: F08World, q: QualityLevel, _ghost?: () => { id: string; x: number; y: number; z: number } | null): ObjHandleF {
  const mats = materials(q);
  const seg = q === 'LOW' ? 18 : q === 'MEDIUM' ? 32 : 56;
  const group = new THREE.Group();
  const disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];
  let ring: THREE.Mesh | null = null;
  let update: ObjHandleF['update'] = () => undefined;
  let place: ((ctx: FrameCtxF, ob: F08Object) => boolean) | null = null;
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
  const hand = (ob: F08Object) => ob.support === 'hand';

  switch (o.kind) {
    case 'base': {
      // Placa con el transportador impreso, índice fijo al frente de la plataforma y traba de la base.
      const Bs = GEOF08.base;
      const plate = shadowed(new THREE.Mesh(new THREE.BoxGeometry(Bs.w, Bs.h, Bs.d), mats.darkMetal));
      plate.position.y = Bs.h / 2;
      const face = new THREE.Mesh(new THREE.CircleGeometry(Bs.w * 0.46, seg * 2), own(new THREE.MeshBasicMaterial({ map: own(protractorTexture()) })));
      face.rotation.x = -Math.PI / 2;
      face.position.y = Bs.h + 0.02;
      const index = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.8, 2.4, 4), red));
      index.rotation.x = Math.PI / 2;
      index.position.set(0, Bs.h + 0.6, GEOF08.table.r + 1.5);
      const clamp = shadowed(new THREE.Mesh(new THREE.BoxGeometry(4, 2.4, 3), red));
      clamp.position.set(Bs.w / 2 - 3, Bs.h + 1.2, Bs.d / 2 - 3);
      body.add(plate, face, index, clamp);
      body.add(at(hit(new THREE.BoxGeometry(Bs.w, Bs.h + 0.4, Bs.d), id, 'body'), 0, Bs.h / 2, 0));
      body.add(at(hit(new THREE.BoxGeometry(5, 3.6, 3.8), id, 'clamp'), Bs.w / 2 - 3, Bs.h + 1.2, Bs.d / 2 - 3));
      body.add(at(hit(new THREE.BoxGeometry(5, 2.4, 3.6), id, 'protractor'), 0, Bs.h + 0.8, GEOF08.table.r + 1.5));
      place = (ctx) => {
        const w = ctx.world;
        group.position.set(AX.x, 0, -(AX.y - w.base.driftM * 100));
        (clamp.material as THREE.MeshStandardMaterial) = w.base.clamped ? green : red;
        clamp.rotation.z = w.base.clamped ? 0 : 0.6;
        return true;
      };
      break;
    }
    case 'guard': {
      // Guarda cilíndrica de policarbonato: 300° fijos y una puerta frontal de 60° que gira sobre su bisagra.
      const G = GEOF08.guard;
      const glass = own(new THREE.MeshStandardMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.18, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false }));
      // El frente (−y de la sala) es +z de la escena: la puerta ocupa θ∈[60°, 120°] en la convención de CylinderGeometry.
      const fixed = new THREE.Mesh(new THREE.CylinderGeometry(G.r, G.r, G.h, seg * 2, 1, true, (2 * Math.PI) / 3 + Math.PI / 6, (5 * Math.PI) / 3), glass);
      fixed.position.y = G.h / 2 + GEOF08.base.h;
      const doorPivot = new THREE.Group();
      const hinge = new THREE.Vector3(Math.sin(Math.PI / 6 - Math.PI / 6) * G.r, 0, 0);
      doorPivot.position.set(Math.sin(-Math.PI / 6) * G.r, GEOF08.base.h, Math.cos(-Math.PI / 6) * G.r);
      const door = new THREE.Mesh(new THREE.CylinderGeometry(G.r, G.r, G.h, seg, 1, true, -Math.PI / 6, Math.PI / 3), glass);
      door.position.set(-doorPivot.position.x + hinge.x, G.h / 2, -doorPivot.position.z);
      const rimTop = shadowed(new THREE.Mesh(new THREE.TorusGeometry(G.r, 0.35, 6, seg * 2), alu));
      rimTop.rotation.x = Math.PI / 2;
      rimTop.position.y = G.h + GEOF08.base.h;
      const handle = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1, 6, 1.6), mats.blackPlastic));
      handle.position.set(-doorPivot.position.x + Math.sin(Math.PI / 6) * G.r * 0.98, G.h / 2, -doorPivot.position.z + Math.cos(Math.PI / 6) * G.r + 0.8);
      doorPivot.add(door, handle, at(hit(new THREE.BoxGeometry(4, 10, 4), id, 'door'), handle.position.x, handle.position.y, handle.position.z));
      body.add(fixed, rimTop, doorPivot);
      place = (ctx) => {
        group.position.set(AX.x, 0, -AX.y);
        doorPivot.rotation.y = ctx.world.base.guardClosed ? 0 : -1.6;
        return true;
      };
      break;
    }
    case 'hub': {
      // Eje con el tambor escalonado (el escalón en uso con la cuerda enrollada), plataforma con su marca y freno.
      const rot = new THREE.Group();
      const shaft = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, TABLE.z - GEOF08.base.h, 16), mats.steel));
      shaft.position.y = (TABLE.z + GEOF08.base.h) / 2;
      const radii = [...ctxRadii()];
      const steps = radii.map((r, i) => {
        const m = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r * 100, r * 100, DRUM.h, seg), i % 2 ? alu : brass));
        m.position.y = DRUM.z + (i - 1) * DRUM.h;
        return m;
      });
      const wound = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, DRUM.h * 0.8, seg), cord);
      const table = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(TABLE.r, TABLE.r, TABLE.h, seg), mats.darkMetal));
      table.position.y = TABLE.z + TABLE.h / 2;
      const mark = new THREE.Mesh(new THREE.BoxGeometry(TABLE.r - 1, 0.06, 0.5), own(new THREE.MeshBasicMaterial({ color: 0xffffff })));
      mark.position.set((TABLE.r - 1) / 2, TABLE.z + TABLE.h + 0.04, 0);
      const pin = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.8, 8), mats.steel));
      rot.add(shaft, ...steps, wound, table, mark, pin);
      const brake = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 7), red));
      brake.position.set(-4, DRUM.z + 2.6, 0);
      body.add(rot, brake);
      body.add(at(hit(new THREE.CylinderGeometry(TABLE.r, TABLE.r, TABLE.h + 0.6, 16), id, 'body'), 0, TABLE.z + TABLE.h / 2, 0));
      body.add(at(hit(new THREE.CylinderGeometry(3.4, 3.4, DRUM.h * 3, 12), id, 'drum'), 0, DRUM.z, 0));
      body.add(at(hit(new THREE.BoxGeometry(3, 3, 8), id, 'brake'), -4, DRUM.z + 2.6, 0));
      place = (ctx) => {
        const w = ctx.world;
        group.position.set(AX.x, 0, -AX.y);
        rot.rotation.y = w.rotor.theta;
        const s = w.string;
        const i = Math.max(0, w.params.drumRadii.indexOf(s.drumR));
        const left = s.attached ? Math.max(0, s.turns - s.unwound / (2 * Math.PI)) : 0;
        wound.visible = left > 0.02;
        const rw = s.drumR * 100 + 0.12 + Math.min(0.5, left * 0.04);
        wound.scale.set(rw, 1, rw);
        wound.position.y = steps[i].position.y;
        pin.position.set(s.drumR * 100, steps[i].position.y, 0);
        brake.position.x = w.rotor.brake ? -3.6 : -5;
        (brake.material as THREE.MeshStandardMaterial) = w.rotor.brake ? red : green;
        return true;
      };
      break;
    }
    case 'solid': {
      const sid = id as SolidId;
      const p = _w0.params;
      const h = SOLID_H[sid];
      const piece = new THREE.Group();
      if (sid === 'disc01') {
        const disc = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(p.disc.R * 100, p.disc.R * 100, h, seg * 2), alu));
        disc.position.y = h / 2;
        piece.add(disc);
        for (const hr of p.holes) {
          if (hr === 0) continue;
          const holeM = new THREE.Mesh(new THREE.CircleGeometry(0.5, 12), mats.blackPlastic);
          holeM.rotation.x = -Math.PI / 2;
          holeM.position.set(-hr * 100, h + 0.02, 0);
          piece.add(holeM);
        }
        const cm = new THREE.Mesh(new THREE.CircleGeometry(0.6, 12), red);
        cm.rotation.x = -Math.PI / 2;
        cm.position.y = h + 0.03;
        piece.add(cm, at(hit(new THREE.CylinderGeometry(p.disc.R * 100, p.disc.R * 100, h + 0.4, 16), id, 'body'), 0, h / 2, 0));
      } else if (sid === 'ring01') {
        const hoop = shadowed(new THREE.Mesh(annulus(p.ring.R * 100 + 0.6, p.ring.R * 100 - 0.6, h, seg * 2), brass));
        const spokes = [0, Math.PI / 2].map((a) => {
          const sp = shadowed(new THREE.Mesh(new THREE.BoxGeometry(p.ring.R * 200 - 1, 0.3, 0.8), mats.darkMetal));
          sp.rotation.y = a;
          sp.position.y = 0.15;
          return sp;
        });
        piece.add(hoop, ...spokes, at(hit(new THREE.CylinderGeometry(p.ring.R * 100 + 0.6, p.ring.R * 100 + 0.6, h + 0.4, 16), id, 'body'), 0, h / 2, 0));
      } else {
        const L = p.bar.L * 100;
        const bar = shadowed(new THREE.Mesh(new RoundedBoxGeometry(L, h, 3, 2, 0.3), mats.steel));
        bar.position.y = h / 2;
        piece.add(bar, at(hit(new THREE.BoxGeometry(L, h + 0.4, 3.4), id, 'body'), 0, h / 2, 0));
      }
      const dent = shadowed(new THREE.Mesh(new THREE.BoxGeometry(2, 0.6, 2), red));
      dent.position.set(sid === 'bar01' ? p.bar.L * 50 - 2 : p.disc.R * 100 - 1.5, h + 0.2, 0);
      piece.add(dent, at(hit(new THREE.BoxGeometry(2.4, 1.2, 2.4), id, 'center'), 0, h + 0.4, 0));
      body.add(piece);
      ring = selRing(sid === 'bar01' ? 6 : 11);
      group.add(ring);
      place = (ctx, ob) => {
        const w = ctx.world;
        placeAt(hand(ob) ? ob.pose : solidRoom(w, sid));
        piece.rotation.y = solidAngle(w, sid);
        dent.visible = w.damaged[sid];
        return true;
      };
      break;
    }
    case 'slideMass': {
      const sid = id as SlideId;
      const m = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 3, seg), brass));
      m.position.y = 1.5;
      const slot = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.6, 3.1), mats.darkMetal);
      slot.position.y = 0.7;
      const knob = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.2, 10), red));
      knob.position.y = 3.6;
      body.add(m, slot, knob);
      body.add(at(hit(new THREE.CylinderGeometry(2.4, 2.4, 3, 12), id, 'body'), 0, 1.5, 0));
      body.add(at(hit(new THREE.BoxGeometry(1.8, 1.6, 1.8), id, 'lock'), 0, 3.8, 0));
      ring = selRing(3);
      group.add(ring);
      place = (ctx, ob) => {
        const w = ctx.world;
        placeAt(hand(ob) ? ob.pose : slideRoom(w, sid));
        body.rotation.y = solidAngle(w, 'bar01');
        (knob.material as THREE.MeshStandardMaterial) = w.slides[sid].locked ? green : red;
        knob.position.y = w.slides[sid].locked ? 3.3 : 3.8;
        return true;
      };
      break;
    }
    case 'radialRuler': {
      const L = _w0.params.bar.L * 100;
      const face = new THREE.Mesh(new THREE.PlaneGeometry(L - 1, 1.6), own(new THREE.MeshBasicMaterial({ map: own(radialScaleTexture(L - 1)) })));
      face.rotation.x = -Math.PI / 2;
      face.position.set(0, 0.04, 0.6);
      body.add(face, at(hit(new THREE.BoxGeometry(L - 6, 0.4, 1.6), id, 'body'), 0, 0.2, 0.6));
      place = (ctx) => {
        const w = ctx.world;
        const b = solidRoom(w, 'bar01');
        placeAt({ ...b, z: b.z + SOLID_H.bar01 });
        body.rotation.y = solidAngle(w, 'bar01');
        group.visible = w.objects.bar01.support !== 'balance';
        return true;
      };
      break;
    }
    case 'solidRack': {
      const Rk = GEOF08.rack;
      const tray = shadowed(new THREE.Mesh(new THREE.BoxGeometry(Rk.w, 1, Rk.d), mats.wood));
      tray.position.y = 0.5;
      body.add(tray, at(hit(new THREE.BoxGeometry(Rk.w, 1, Rk.d), id, 'body'), 0, 0.5, 0));
      place = () => {
        group.position.set(Rk.x, 0, -Rk.y);
        return true;
      };
      break;
    }
    case 'pulley': {
      // Polea en su abrazadera al canto; la cuerda (tambor → sensor → polea → masa) vive en la sala.
      const P = GEOF08.pulley;
      const wheel = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(P.r, P.r, 0.8, seg), mats.blackPlastic));
      wheel.rotation.z = Math.PI / 2;
      const clampB = shadowed(new THREE.Mesh(new THREE.BoxGeometry(2, 8, 4), mats.darkMetal));
      clampB.position.set(-1.6, -2, 1.5);
      body.add(wheel, clampB, at(hit(new THREE.BoxGeometry(3, 6, 6), id, 'body'), 0, 0, 0));
      const segA = roomObj(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1, 5), cord));
      const segB = roomObj(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1, 5), cord));
      ring = selRing(3);
      group.add(ring);
      place = (ctx) => {
        const w = ctx.world;
        const s = w.string;
        const l = dropLine(w);
        group.position.set(l.x, DRUM.z + s.pulleyDzCm - P.r, -P.y);
        wheel.rotation.x = s.y * 100 / P.r;
        const live = s.attached && s.turns > 0;
        segA.visible = live;
        segB.visible = live && !!s.mass;
        const drumPt = new THREE.Vector3(l.x, DRUM.z, -(AX.y));
        const top = new THREE.Vector3(l.x, DRUM.z + s.pulleyDzCm, -(P.y));
        stretchC(segA, drumPt, top);
        if (s.mass) {
          const mz = massZ(w) + GEOF08.mass.h + 1.2;
          const p0 = new THREE.Vector3(l.x, DRUM.z + s.pulleyDzCm - P.r, -(P.y - P.r));
          const p1 = new THREE.Vector3(l.x, Math.min(p0.y - 0.1, mz), -(P.y - P.r));
          stretchC(segB, p0, p1);
          segB.visible = live && !s.landed;
        }
        return true;
      };
      break;
    }
    case 'dropMass': {
      const kg = _w0.params.dropKg[id as keyof typeof _w0.params.dropKg] ?? 0.05;
      const M = GEOF08.mass;
      const hgt = M.h * (0.6 + kg * 4);
      const cyl = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(M.r, M.r, hgt, seg), kg >= 0.1 ? brass : mats.steel));
      cyl.position.y = hgt / 2;
      const hook = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.12, 6, 12), mats.steel));
      hook.position.y = hgt + 0.7;
      const flag = new THREE.Mesh(new THREE.BoxGeometry(0.1, M.flag * 1.6, M.flag), mats.blackPlastic);
      flag.position.set(M.r + 0.2, hgt / 2, 0);
      body.add(cyl, hook, flag, at(hit(new THREE.CylinderGeometry(M.r + 0.4, M.r + 0.4, hgt + 1.4, 10), id, 'body'), 0, hgt / 2 + 0.4, 0));
      ring = selRing(2.4);
      group.add(ring);
      place = (ctx, ob) => {
        placeAt(hand(ob) ? ob.pose : dropRoom(ctx.world, id as 'drop20'));
        return true;
      };
      break;
    }
    case 'massRack': {
      const R = GEOF08.massRack;
      const base = shadowed(new THREE.Mesh(new THREE.BoxGeometry(R.w, R.h, R.d), mats.wood));
      base.position.set(0, R.h / 2, 0);
      body.add(base, at(hit(new THREE.BoxGeometry(R.w, R.h, R.d), id, 'body'), 0, R.h / 2, 0));
      place = () => {
        group.position.set(R.x, 0, -R.y);
        return true;
      };
      break;
    }
    case 'dropColumn': {
      // Varilla graduada del piso a la mesada, junto a la línea de caída.
      const hgt = COL.zTop - COL.floor;
      const rod = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, hgt, 10), alu));
      rod.position.y = hgt / 2;
      const foot = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 1, seg), mats.darkMetal));
      foot.position.y = 0.5;
      const pad = shadowed(new THREE.Mesh(new THREE.BoxGeometry(10, 1.2, 10), own(new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.95 }))));
      pad.position.set(-COL.dx, 0.6, 0);
      body.add(rod, foot, pad, at(hit(new THREE.CylinderGeometry(1.4, 1.4, hgt, 8), id, 'body'), 0, hgt / 2, 0));
      place = (ctx) => {
        const l = dropLine(ctx.world);
        group.position.set(l.x + COL.dx, COL.floor, -l.y);
        return true;
      };
      break;
    }
    case 'catch': {
      const pad = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 2, seg), own(new THREE.MeshStandardMaterial({ color: 0xf0a020, roughness: 0.9 }))));
      pad.position.y = -1;
      const arm = shadowed(new THREE.Mesh(new THREE.BoxGeometry(COL.dx, 1, 1.4), mats.darkMetal));
      arm.position.set(COL.dx / 2, -1.5, 0);
      body.add(pad, arm, at(hit(new THREE.BoxGeometry(COL.dx + 6, 3, 7), id, 'body'), COL.dx / 2 - 1, -1, 0));
      ring = selRing(3.4);
      group.add(ring);
      place = (ctx) => {
        const w = ctx.world;
        placeAt(catchRoom(w));
        pad.visible = w.column.catchOn;
        pad.position.x = 0;
        arm.rotation.y = w.column.catchOn ? 0 : Math.PI / 2;
        return true;
      };
      break;
    }
    case 'gate': {
      const frame = new THREE.Group();
      const postA = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.2, 6, 1.2), mats.blackPlastic));
      postA.position.set(-3.6, 0, 0);
      const postB = postA.clone();
      postB.position.x = 3.6;
      const back = shadowed(new THREE.Mesh(new THREE.BoxGeometry(8.4, 6, 1.2), mats.blackPlastic));
      back.position.set(0, 0, -3);
      const beamL = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 7, 6), own(new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.6 })));
      beamL.rotation.z = Math.PI / 2;
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), ledMat());
      led.position.set(3.6, 3.4, 0);
      const plug = button(0.5, mats.plasticYellow);
      plug.rotation.x = Math.PI / 2;
      plug.position.set(-3.6, 2.2, 0.8);
      frame.add(postA, postB, back, beamL, led, plug);
      body.add(frame);
      frame.add(at(hit(new THREE.BoxGeometry(9, 6, 2), id, 'mount'), 0, 0, -1.4));
      frame.add(at(hit(new THREE.BoxGeometry(1.6, 1.6, 1.6), id, 'plug'), -3.6, 2.2, 0.9));
      ring = selRing(5);
      group.add(ring);
      place = (ctx) => {
        const w = ctx.world;
        placeAt(gateRoom(w));
        const run = w.run;
        const blocked = !!run && run.gateIn !== null && run.gateOut === null && !run.done;
        setLed(led, !w.logger.gateConnected ? 0x444444 : blocked ? 0xff3b30 : 0x34c759);
        return true;
      };
      break;
    }
    case 'encoder': {
      const box = shadowed(new THREE.Mesh(new RoundedBoxGeometry(8, 3, 4, 2, 0.4), own(new THREE.MeshStandardMaterial({ color: 0x2b3a4a, roughness: 0.5 }))));
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), ledMat());
      led.position.set(3.2, 0.6, 2.05);
      body.add(box, led);
      const btns: Array<[string, number, THREE.Material]> = [['zero', -2.6, mats.plasticBlue], ['cal', -0.8, mats.plasticYellow], ['dir', 1, mats.plasticWhite], ['plug', 2.6, mats.rubberRed]];
      for (const [part, x, mat] of btns) {
        const b = button(0.5, mat);
        b.rotation.x = Math.PI / 2;
        b.position.set(x, -0.6, 2.1);
        body.add(b, at(hit(new THREE.BoxGeometry(1.5, 1.5, 1.2), id, part), x, -0.6, 2.3));
      }
      body.add(at(hit(new THREE.BoxGeometry(8, 3, 4), id, 'body'), 0, 0, 0));
      ring = selRing(4);
      group.add(ring);
      update = (ctx) => {
        const e = ctx.world.encoder;
        setLed(led, !e.connected ? 0x444444 : e.zeroed && e.calibrated && e.dir > 0 ? 0x34c759 : 0xf0c36e);
      };
      break;
    }
    case 'tach': {
      const T = GEOF08.tach;
      const pole = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, T.h, 8), mats.darkMetal));
      pole.position.y = T.h / 2;
      const foot = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 0.8, seg), mats.darkMetal));
      foot.position.y = 0.4;
      const head = shadowed(new THREE.Mesh(new RoundedBoxGeometry(6, 3.6, 3, 2, 0.4), own(new THREE.MeshStandardMaterial({ color: 0xf0c020, roughness: 0.5 }))));
      head.position.y = T.h;
      const { lcd, mesh } = lcdScreen(4.6, 1.8, 220, 90);
      mesh.position.set(0, T.h + 0.2, 1.55);
      const rng = button(0.5, mats.plasticBlue);
      rng.position.set(-1.8, T.h + 1.9, 0);
      const plug = button(0.5, mats.rubberRed);
      plug.position.set(1.8, T.h + 1.9, 0);
      const laser = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 6), own(new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.7 })));
      body.add(pole, foot, head, mesh, rng, plug, laser);
      body.add(at(hit(new THREE.BoxGeometry(6, 3.6, 3), id, 'body'), 0, T.h, 0));
      body.add(at(hit(new THREE.BoxGeometry(1.6, 1.4, 1.6), id, 'range'), -1.8, T.h + 1.9, 0));
      body.add(at(hit(new THREE.BoxGeometry(1.6, 1.4, 1.6), id, 'plug'), 1.8, T.h + 1.9, 0));
      ring = selRing(4);
      group.add(ring);
      update = (ctx) => {
        const w = ctx.world;
        const t = w.tach;
        laser.visible = t.connected;
        // El láser apunta a la plataforma (cinta reflectante en su borde).
        const a = new THREE.Vector3(0, T.h, 0);
        const b = new THREE.Vector3(AX.x - T.x, TABLE.z + TABLE.h / 2, -(AX.y - TABLE.r) + T.y);
        stretchC(laser, a, b);
        const rpm = Math.abs(w.rotor.omega) * 60 / (2 * Math.PI);
        const max = w.params.tach.ranges[t.rangeIdx];
        lcd.set(t.connected ? (rpm > max ? 'OL' : `${rpm.toFixed(t.rangeIdx === 0 ? 1 : 0)} rpm`) : '----', t.connected ? '#6ef08a' : '#555', `0–${max} rpm`);
      };
      break;
    }
    case 'tensionSensor': {
      const cell = new THREE.Group();
      const box = shadowed(new THREE.Mesh(new RoundedBoxGeometry(2.6, 2.4, 4.2, 2, 0.4), own(new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.5 }))));
      const zeroBtn = button(0.45, mats.plasticBlue);
      zeroBtn.position.set(0, 1.3, -1);
      const plug = button(0.45, mats.rubberRed);
      plug.position.set(0, 1.3, 1);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), ledMat());
      led.position.set(0, 1.3, 0);
      cell.add(box, zeroBtn, plug, led);
      cell.add(at(hit(new THREE.BoxGeometry(2.6, 2.4, 4.2), id, 'body'), 0, 0, 0));
      cell.add(at(hit(new THREE.BoxGeometry(1.2, 1.2, 1.1), id, 'zero'), 0, 1.4, -1));
      cell.add(at(hit(new THREE.BoxGeometry(1.2, 1.2, 1.1), id, 'plug'), 0, 1.4, 1));
      body.add(cell);
      ring = selRing(3);
      group.add(ring);
      place = (ctx) => {
        const w = ctx.world;
        placeAt(objRoom(w, id));
        cell.rotation.set(w.tension.angleDeg * DEG, 0, 0);
        const s = w.tension;
        setLed(led, !s.connected ? 0x444444 : s.zeroed ? 0x34c759 : 0xf0c36e);
        group.visible = w.string.attached && w.string.turns > 0 || s.connected;
        return true;
      };
      break;
    }
    case 'logger': {
      const Lg = GEOF08.logger;
      const box = shadowed(new THREE.Mesh(new RoundedBoxGeometry(Lg.w, Lg.h, Lg.d, 2, 0.6), own(new THREE.MeshStandardMaterial({ color: 0x2b3a4a, roughness: 0.5 }))));
      box.position.y = Lg.h / 2;
      const { lcd, mesh } = lcdScreen(13, 3.4, 360, 100);
      mesh.position.set(0, Lg.h * 0.7, Lg.d / 2 + 0.02);
      body.add(box, mesh);
      const ports: Array<[string, number, THREE.Material]> = [['portE', -6, mats.plasticWhite], ['portT', -2, mats.plasticYellow], ['portW', 2, mats.plasticBlue], ['portG', 6, mats.rubberRed]];
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
      const tops: Array<[string, number, THREE.Material]> = [['rate', -7, mats.plasticBlue], ['readE', -3.5, mats.plasticWhite], ['readT', 0, mats.plasticYellow], ['readW', 3.5, mats.plasticBlue], ['readG', 7, mats.rubberRed]];
      for (const [part, x, mat] of tops) {
        const b = button(0.8, mat);
        b.position.set(x, Lg.h, -Lg.d / 2 + 3);
        body.add(b, at(hit(new THREE.BoxGeometry(2.6, 1.6, 2.6), id, part), x, Lg.h, -Lg.d / 2 + 3));
      }
      body.add(at(hit(new THREE.BoxGeometry(Lg.w, Lg.h, Lg.d), id, 'body'), 0, Lg.h / 2, 0));
      update = (ctx) => {
        const w = ctx.world;
        const on = (b: boolean) => (b ? 0x34c759 : 0x444444);
        setLed(portLeds.portE, on(w.encoder.connected));
        setLed(portLeds.portT, on(w.tension.connected));
        setLed(portLeds.portW, on(w.tach.connected));
        setLed(portLeds.portG, on(w.logger.gateConnected));
        const run = w.run && !w.run.done ? w.run : null;
        const head = run ? `ω ${w.rotor.omega.toFixed(2)} rad/s` : 'LISTO';
        lcd.set(head, run ? '#6ef08a' : '#f0c36e', `${w.logger.rateHz} Hz · ${run ? 'REGISTRANDO' : `${w.runs.length} ensayos`}`);
      };
      break;
    }
    case 'balance': {
      const Bl = GEOF08.balance;
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
        const g = (b.on ? massOfG(w, b.on) : 0) + b.offsetG;
        const res = w.params.balanceResolutionG;
        const shown = Math.round(g / res) * res + (settling && !ctx.reducedMotion ? Math.sin(w.timeS * 23) * 3 : 0);
        lcd.set(`${shown.toFixed(res < 1 ? 1 : 0)} g`, settling ? '#f0c36e' : '#6ef08a', b.tared ? 'TARA ✓' : 'SIN TARA');
      };
      break;
    }
    case 'caliper': {
      const beamC = shadowed(new THREE.Mesh(new THREE.BoxGeometry(32, 0.4, 1.4), mats.steel));
      beamC.position.set(0, 0.3, 0);
      const jawF = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 4), mats.steel));
      jawF.position.set(-15.6, 0.3, 2);
      const slider = shadowed(new THREE.Mesh(new THREE.BoxGeometry(3, 0.8, 2), mats.steel));
      const jawS = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 4), mats.steel));
      const { lcd, mesh } = lcdScreen(2.4, 1, 160, 64);
      mesh.rotation.x = -Math.PI / 2;
      body.add(beamC, jawF, slider, jawS, mesh);
      body.add(at(hit(new THREE.BoxGeometry(33, 2, 5), id, 'body'), 0, 0.5, 1));
      ring = selRing(8);
      group.add(ring);
      let shownFor = '';
      update = (ctx) => {
        const w = ctx.world;
        const last = [...w.readingOrder].reverse().map((r) => w.readings[r]).find((r) => r?.kind === 'length');
        const cm = last ? last.value : 0;
        const x = -15.6 + Math.min(29, cm + 0.6);
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

  // La cuerda vive en la sala, no dentro del grupo de la polea.
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

  function ctxRadii(): number[] {
    return _w0.params.drumRadii;
  }
}

export { panRoom, TABLE_TOP };
