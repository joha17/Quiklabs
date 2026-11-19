/**
 * Vistas 3D procedurales de F09: base con tornillos de nivel y traba, nivel de burbuja, guarda de policarbonato con
 * puerta; eje con el tambor escalonado de tres ranuras, plataforma Ø 60 cm con su marca y bandera; guía radial con la
 * masa orbitante, su tope trabable y el cordón al mástil central con el sensor de fuerza; barra perpendicular con las
 * masas radiales, sus pasadores y el cordón central hasta la palanca de recogida; cordón del tambor al carro del
 * dinamómetro en el canto; motor con perilla, embrague y correa; freno, fotopuerta con la presilla del cable, encoder,
 * registrador, balanza y estante de masas. SOLO leen el estado; cada pieza funcional tiene un colisionador invisible
 * simple (`userData {objId, part}`).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { F09Object, MassId, SlideId } from '../../simulation/f09-world/types';
import { GEOF09 } from '../../simulation/f09-world/geometry';
import { massOfG } from '../../simulation/f09-world/world';
import type { QualityLevel } from '../quality';
import { materials } from '../renderers/materials';
import { lcdTexture } from '../renderers/textures';
import type { FrameCtxF } from './F09Lab3D';
import { DEG, TABLE_TOP, cordRoom, gateRoom, objRoom, orbitRoom, panRoom, rackRoom, slideAngle, slideRoom } from './layout';

export interface ObjHandleF {
  group: THREE.Group;
  update(ctx: FrameCtxF, o: F09Object): void;
  dispose(): void;
}

const hitMat = () => materials('LOW').hit;
const AX = GEOF09.axis;
const TABLE = GEOF09.table;
const DRUM = GEOF09.drum;

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

/** Regla de un solo lado: 0 en el eje y números cada 5 cm hacia afuera. */
function oneSidedScaleTexture(lenCm: number): THREE.CanvasTexture {
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
    for (let mm = 0; mm <= lenCm * 10; mm++) {
      const x = mm * (k / 10);
      const major = mm % 50 === 0;
      g.lineWidth = major ? 2 : 1;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, major ? 24 : mm % 10 === 0 ? 15 : 7);
      g.stroke();
      if (major && mm > 0 && mm < lenCm * 10) g.fillText(String(mm / 10), x, H - 2);
    }
  });
}

/** Escala del dinamómetro (0–5 N, divisiones de 0,05 N) a lo largo del tubo. */
function dynScaleTexture(rangeN: number): THREE.CanvasTexture {
  const W = 640;
  const H = 64;
  return canvasTex(W, H, (g) => {
    g.fillStyle = '#f7f3e4';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#1b2733';
    g.fillStyle = '#1b2733';
    g.font = 'bold 20px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'bottom';
    const n = Math.round(rangeN / 0.05);
    for (let i = 0; i <= n; i++) {
      // Cero a la derecha del lienzo: así, girada para que se lea derecha desde el lado del estudiante, el cero queda en el canto.
      const x = W - 16 - (i / n) * (W - 32);
      const major = i % 20 === 0;
      g.lineWidth = major ? 2.5 : 1;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, major ? 30 : i % 10 === 0 ? 20 : 10);
      g.stroke();
      if (major) g.fillText(`${i / 20}`, x, H - 2);
    }
    g.textAlign = 'left';
    g.fillText('N', 4, 26);
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

export function createObjVisualF(o: F09Object, _w0: FrameCtxF['world'], q: QualityLevel, _ghost?: () => { id: string; x: number; y: number; z: number } | null): ObjHandleF {
  const mats = materials(q);
  const seg = q === 'LOW' ? 18 : q === 'MEDIUM' ? 32 : 56;
  const group = new THREE.Group();
  const disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];
  let ring: THREE.Mesh | null = null;
  let update: ObjHandleF['update'] = () => undefined;
  let place: ((ctx: FrameCtxF, ob: F09Object) => boolean) | null = null;
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
  /** Cordón o cable: cilindro fino que se estira entre dos puntos de la sala. */
  const strand = (mat: THREE.Material, r = 0.1) => roomObj(new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 5), mat));
  const v3 = (p: { x: number; y: number; z: number }) => new THREE.Vector3(p.x, p.z, -p.y);
  /** Grupo que gira con la plataforma (local +x = dirección de la guía, local −z de la escena = +y de la sala). */
  const spinning = () => {
    const g = new THREE.Group();
    body.add(g);
    return g;
  };
  const atAxis = () => group.position.set(AX.x, 0, -AX.y);

  switch (o.kind) {
    case 'base': {
      // Placa con cuatro tornillos de nivel, el cojinete del eje y la traba que la fija a la mesada.
      const Bs = GEOF09.base;
      const plate = shadowed(new THREE.Mesh(new THREE.BoxGeometry(Bs.w, Bs.h, Bs.d), mats.darkMetal));
      plate.position.y = Bs.h / 2;
      const bearing = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(4, 5, 2.5, seg), mats.steel));
      bearing.position.y = Bs.h + 1.25;
      body.add(plate, bearing);
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const screw = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 1.2, 12), brass));
        screw.position.set(sx * (Bs.w / 2 - 3), Bs.h + 0.6, sz * (Bs.d / 2 - 3));
        body.add(screw);
      }
      const clamp = shadowed(new THREE.Mesh(new THREE.BoxGeometry(5, 2.4, 3), red));
      clamp.position.set(-Bs.w / 2 + 1, Bs.h + 1.2, Bs.d / 2 - 4);
      body.add(clamp);
      body.add(at(hit(new THREE.BoxGeometry(Bs.w, Bs.h + 0.4, Bs.d), id, 'body'), 0, Bs.h / 2, 0));
      body.add(at(hit(new THREE.BoxGeometry(6, 4, 4.4), id, 'clamp'), -Bs.w / 2 + 1, Bs.h + 1.2, Bs.d / 2 - 4));
      place = (ctx) => {
        const w = ctx.world;
        atAxis();
        body.rotation.y = w.base.clamped ? 0 : w.base.driftRad;
        (clamp.material as THREE.MeshStandardMaterial) = w.base.clamped ? green : red;
        clamp.rotation.z = w.base.clamped ? 0 : 0.6;
        return true;
      };
      break;
    }
    case 'level': {
      // Nivel de burbuja apoyado en la base: la burbuja se corre con la inclinación del eje.
      const vial = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 1.2, seg), alu));
      vial.position.y = 0.6;
      const glass = new THREE.Mesh(new THREE.CircleGeometry(2.5, seg), own(new THREE.MeshBasicMaterial({ color: 0xd8f0a0 })));
      glass.rotation.x = -Math.PI / 2;
      glass.position.y = 1.22;
      const circle = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.85, 24), own(new THREE.MeshBasicMaterial({ color: 0x1b2733 })));
      circle.rotation.x = -Math.PI / 2;
      circle.position.y = 1.24;
      const bubble = new THREE.Mesh(new THREE.CircleGeometry(0.6, 16), own(new THREE.MeshBasicMaterial({ color: 0xffffff })));
      bubble.rotation.x = -Math.PI / 2;
      body.add(vial, glass, circle, bubble, at(hit(new THREE.CylinderGeometry(3.4, 3.4, 2.4, 12), id, 'body'), 0, 1, 0));
      ring = selRing(3.6);
      group.add(ring);
      update = (ctx) => {
        const off = Math.min(1.8, ctx.world.rotor.tiltDeg * 1.6);
        bubble.position.set(off * 0.8, 1.26, -off * 0.6);
      };
      break;
    }
    case 'guard': {
      // Guarda cilíndrica de policarbonato: 300° fijos y una puerta frontal de 60° que gira sobre su bisagra.
      const G = GEOF09.guard;
      const glass = own(new THREE.MeshStandardMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.16, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false }));
      const fixed = new THREE.Mesh(new THREE.CylinderGeometry(G.r, G.r, G.h, seg * 2, 1, true, (2 * Math.PI) / 3 + Math.PI / 6, (5 * Math.PI) / 3), glass);
      fixed.position.y = G.h / 2 + GEOF09.base.h;
      const doorPivot = new THREE.Group();
      doorPivot.position.set(Math.sin(-Math.PI / 6) * G.r, GEOF09.base.h, Math.cos(-Math.PI / 6) * G.r);
      const door = new THREE.Mesh(new THREE.CylinderGeometry(G.r, G.r, G.h, seg, 1, true, -Math.PI / 6, Math.PI / 3), glass);
      door.position.set(-doorPivot.position.x, G.h / 2, -doorPivot.position.z);
      const rimTop = shadowed(new THREE.Mesh(new THREE.TorusGeometry(G.r, 0.35, 6, seg * 2), alu));
      rimTop.rotation.x = Math.PI / 2;
      rimTop.position.y = G.h + GEOF09.base.h;
      const handle = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1, 6, 1.6), mats.blackPlastic));
      handle.position.set(-doorPivot.position.x + Math.sin(Math.PI / 6) * G.r * 0.98, G.h / 2, -doorPivot.position.z + Math.cos(Math.PI / 6) * G.r + 0.8);
      doorPivot.add(door, handle, at(hit(new THREE.BoxGeometry(4, 10, 4), id, 'door'), handle.position.x, handle.position.y, handle.position.z));
      body.add(fixed, rimTop, doorPivot);
      place = (ctx) => {
        atAxis();
        doorPivot.rotation.y = ctx.world.base.guardClosed ? 0 : -1.6;
        return true;
      };
      break;
    }
    case 'hub': {
      // Eje, plataforma Ø 60 cm con la marca blanca y la bandera del borde (corta el haz de la fotopuerta), barra de
      // masas radiales perpendicular a la guía y mástil central.
      const rot = spinning();
      const shaft = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, TABLE.z - GEOF09.base.h, 16), mats.steel));
      shaft.position.y = (TABLE.z + GEOF09.base.h) / 2;
      const table = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(TABLE.r, TABLE.r, TABLE.h, seg * 2), mats.darkMetal));
      table.position.y = TABLE.z + TABLE.h / 2;
      const rimTape = new THREE.Mesh(new THREE.CylinderGeometry(TABLE.r + 0.02, TABLE.r + 0.02, TABLE.h * 0.6, seg * 2, 1, true), own(new THREE.MeshStandardMaterial({ color: 0x9aa3ab, roughness: 0.6, side: THREE.DoubleSide })));
      rimTape.position.y = TABLE.z + TABLE.h / 2;
      const flag = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.4, 1), mats.blackPlastic));
      flag.position.set(TABLE.r - 0.2, TABLE.z - 0.6, 0);
      const mark = new THREE.Mesh(new THREE.BoxGeometry(4, 0.06, 0.6), own(new THREE.MeshBasicMaterial({ color: 0xffffff })));
      mark.position.set(TABLE.r - 2.5, TABLE_TOP + 0.04, 0);
      const Br = GEOF09.bar;
      const bar = shadowed(new THREE.Mesh(new THREE.BoxGeometry(Br.w, Br.h, Br.len * 2), alu));
      bar.position.y = TABLE_TOP + Br.h / 2;
      const mast = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, GEOF09.mast.h, 12), mats.steel));
      mast.position.y = TABLE_TOP + GEOF09.mast.h / 2;
      const hubCap = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 1.4, 16), mats.darkMetal));
      hubCap.position.y = TABLE_TOP + 0.7;
      rot.add(shaft, table, rimTape, flag, mark, bar, mast, hubCap);
      // Correa del motor: polea en el eje a 3 cm de altura.
      const pulley = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 1.4, 20), mats.blackPlastic));
      pulley.position.y = 3;
      body.add(pulley);
      body.add(at(hit(new THREE.CylinderGeometry(TABLE.r, TABLE.r, TABLE.h + 0.6, 24), id, 'body'), 0, TABLE.z + TABLE.h / 2, 0));
      place = (ctx) => {
        atAxis();
        rot.rotation.y = ctx.world.rotor.theta;
        return true;
      };
      break;
    }
    case 'drum': {
      // Tambor escalonado bajo la plataforma: tres ranuras (10, 15 y 20 cm), cordón enrollado en la elegida.
      const rot = spinning();
      const radii = _w0.params.armRadii;
      const steps = radii.map((r, i) => {
        const m = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r * 100, r * 100, DRUM.h, seg * 2), i % 2 ? alu : brass));
        m.position.y = DRUM.z + (radii.length - 1 - i) * DRUM.h - DRUM.h;
        return m;
      });
      const wound = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, DRUM.h * 0.7, seg * 2, 1, true), cord);
      const spokes = [0, Math.PI / 3, (2 * Math.PI) / 3].map((a) => {
        const sp = new THREE.Mesh(new THREE.BoxGeometry(radii[radii.length - 1] * 200, 0.3, 0.8), mats.darkMetal);
        sp.rotation.y = a;
        sp.position.y = DRUM.z - DRUM.h * 1.6;
        return sp;
      });
      rot.add(...steps, wound, ...spokes);
      radii.forEach((r, i) => {
        // Cada ranura es un colisionador anular: clic = elegir ese brazo de palanca.
        body.add(at(hit(new THREE.CylinderGeometry(r * 100 + 0.3, r * 100 + 0.3, DRUM.h, 24), id, `step${i}`), 0, steps[i].position.y, 0));
      });
      const seg1 = strand(cord, 0.09);
      place = (ctx) => {
        const w = ctx.world;
        atAxis();
        rot.rotation.y = w.rotor.theta;
        const d = w.drum;
        const i = Math.max(0, radii.indexOf(d.armR));
        const left = Math.max(0, d.turns - Math.abs(d.unwound) / (2 * Math.PI));
        wound.visible = left > 0.02;
        const rw = d.armR * 100 + 0.15 + Math.min(0.5, left * 0.08);
        wound.scale.set(rw, 1, rw);
        wound.position.y = steps[i].position.y;
        // Tramo del cordón desde el tambor (tangente) hasta el gancho del carro.
        seg1.visible = left > 0.02 || d.pulling;
        const c = cordRoom(w);
        const from = { x: c.x, y: AX.y, z: steps[i].position.y };
        const to = { x: c.x, y: GEOF09.dyn.y + GEOF09.dyn.len / 2, z: steps[i].position.y + Math.tan(d.aimDeg * DEG) * 4 };
        stretchC(seg1, v3(from), v3(to));
        return true;
      };
      break;
    }
    case 'dynamometer': {
      // Carro de fuerza constante en el canto: dinamómetro de resorte (0–5 N) con su escala, gancho y botones.
      const L = GEOF09.dyn.len;
      const carriage = shadowed(new THREE.Mesh(new THREE.BoxGeometry(10, 2, L + 4), mats.darkMetal));
      carriage.position.y = 1;
      const tube = shadowed(new THREE.Mesh(new THREE.BoxGeometry(3, 2.2, L), own(new THREE.MeshStandardMaterial({ color: 0xf2f0e8, roughness: 0.4, transparent: true, opacity: 0.85 }))));
      tube.position.y = DRUM.z;
      const face = new THREE.Mesh(new THREE.PlaneGeometry(L - 1, 1.6), own(new THREE.MeshBasicMaterial({ map: own(dynScaleTexture(_w0.params.dyn.rangeN)) })));
      face.rotation.set(-Math.PI / 2, 0, -Math.PI / 2);
      face.position.set(0, DRUM.z + 1.12, 0);
      const pointer = shadowed(new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.3, 0.25), red));
      const hook = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.12, 6, 12), mats.steel));
      hook.rotation.y = Math.PI / 2;
      const zeroB = button(0.7, mats.plasticBlue);
      zeroB.position.set(-3.6, 2.3, L / 2 - 1);
      const pullB = button(0.9, mats.rubberRed);
      pullB.position.set(3.6, 2.3, L / 2 - 1);
      const aim = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1, 3, 1), mats.plasticYellow));
      aim.position.set(3.6, 2.5, -L / 2 + 2);
      body.add(carriage, tube, face, pointer, hook, zeroB, pullB, aim);
      body.add(at(hit(new THREE.BoxGeometry(4, 3, L), id, 'scale'), 0, DRUM.z, 0));
      body.add(at(hit(new THREE.BoxGeometry(10, 2, L + 4), id, 'body'), 0, 1, 0));
      body.add(at(hit(new THREE.BoxGeometry(2, 1.6, 2), id, 'zero'), -3.6, 2.4, L / 2 - 1));
      body.add(at(hit(new THREE.BoxGeometry(2.4, 1.6, 2.4), id, 'pull'), 3.6, 2.4, L / 2 - 1));
      body.add(at(hit(new THREE.BoxGeometry(2, 3.4, 2), id, 'aim'), 3.6, 2.5, -L / 2 + 2));
      ring = selRing(7);
      group.add(ring);
      place = (ctx) => {
        const w = ctx.world;
        const c = cordRoom(w);
        group.position.set(c.x, 0, -GEOF09.dyn.y);
        body.rotation.x = -w.drum.aimDeg * DEG * 0.25;
        const n = w.drum.pulling ? w.drum.pullN : 0;
        const shown = Math.max(0, Math.min(w.params.dyn.rangeN * 1.04, n + w.dyn.offset));
        // La escala crece desde el extremo del canto (+z de la escena) hacia el tambor (−z).
        const zP = L / 2 - 0.5 - (shown / w.params.dyn.rangeN) * (L - 1);
        pointer.position.set(0, DRUM.z + 1.2, zP);
        hook.position.set(0, DRUM.z, -L / 2 - 0.6);
        (pullB.material as THREE.MeshStandardMaterial) = w.drum.pulling ? green : mats.rubberRed;
        return true;
      };
      break;
    }
    case 'guide': {
      // Guía radial (local +x) con su regla, el tope rojo trabable y el extremo que se dobla si la masa sale.
      const rot = spinning();
      const G = GEOF09.guide;
      const rail = shadowed(new THREE.Mesh(new THREE.BoxGeometry(G.len, G.h, G.w), alu));
      rail.position.set(1 + G.len / 2, TABLE_TOP + G.h / 2, 0);
      const groove = new THREE.Mesh(new THREE.BoxGeometry(G.len - 2, 0.05, 0.8), mats.blackPlastic);
      groove.position.set(1 + G.len / 2, TABLE_TOP + G.h + 0.03, 0);
      const counter = shadowed(new THREE.Mesh(new THREE.BoxGeometry(6, 3, 4), mats.darkMetal));
      counter.position.set(-18, TABLE_TOP + 1.5, 0);
      const end = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.2, 3, G.w + 1), alu));
      const stop = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.6, G.w + 1.2), red));
      const knob = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.4, 10), red));
      rot.add(rail, groove, counter, end, stop, knob);
      const stopHit = hit(new THREE.BoxGeometry(2.4, 4, G.w + 2), id, 'stop');
      rot.add(stopHit, at(hit(new THREE.BoxGeometry(G.len, G.h + 0.6, G.w), id, 'body'), 1 + G.len / 2, TABLE_TOP + G.h / 2, 0));
      place = (ctx) => {
        const w = ctx.world;
        atAxis();
        rot.rotation.y = w.rotor.theta;
        const sx = (w.params.orbitStopR + w.params.orbitHalf) * 100 + 0.6;
        stop.position.set(sx, TABLE_TOP + G.h + 1.3, 0);
        knob.position.set(sx, TABLE_TOP + G.h + 3.2, 0);
        stopHit.position.set(sx, TABLE_TOP + G.h + 1.8, 0);
        (knob.material as THREE.MeshStandardMaterial) = w.orbit.stopLocked ? green : red;
        knob.position.y = TABLE_TOP + G.h + (w.orbit.stopLocked ? 2.9 : 3.5);
        end.position.set(1 + G.len, TABLE_TOP + G.h + 1.5, 0);
        end.rotation.z = w.damaged ? 0.5 : 0;
        return true;
      };
      break;
    }
    case 'radialRuler': {
      // Reglas impresas: a lo largo de la guía (0 en el eje) y sobre la barra (0 en el centro, hacia los dos extremos).
      const rot = spinning();
      const G = GEOF09.guide;
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(29, 1.2), own(new THREE.MeshBasicMaterial({ map: own(oneSidedScaleTexture(29)) })));
      gl.rotation.x = -Math.PI / 2;
      gl.position.set(14.5, TABLE_TOP + 0.02, G.w / 2 + 0.7);
      const Br = GEOF09.bar;
      const bl = new THREE.Mesh(new THREE.PlaneGeometry(Br.len * 2, 1.2), own(new THREE.MeshBasicMaterial({ map: own(radialScaleTexture(Br.len * 2)) })));
      bl.rotation.set(-Math.PI / 2, 0, -Math.PI / 2);
      bl.position.set(Br.w / 2 + 0.7, TABLE_TOP + 0.02, 0);
      rot.add(gl, bl);
      rot.add(at(hit(new THREE.BoxGeometry(29, 0.4, 1.4), id, 'guide'), 14.5, TABLE_TOP + 0.2, G.w / 2 + 0.7));
      const hb = hit(new THREE.BoxGeometry(1.4, 0.4, Br.len * 2), id, 'bar');
      rot.add(at(hb, Br.w / 2 + 0.7, TABLE_TOP + 0.2, 0));
      place = (ctx) => {
        atAxis();
        rot.rotation.y = ctx.world.rotor.theta;
        return true;
      };
      break;
    }
    case 'orbitMass': {
      // Masa orbitante con su cordón hacia el mástil (pasa por la polea central y sube al sensor de fuerza).
      const O = GEOF09.orbit;
      const cyl = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(O.r, O.r, O.h, seg), brass));
      cyl.position.y = O.h / 2;
      const eye = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.12, 6, 12), mats.steel));
      eye.position.y = O.h * 0.5;
      body.add(cyl, eye, at(hit(new THREE.CylinderGeometry(O.r + 0.4, O.r + 0.4, O.h + 0.6, 12), id, 'body'), 0, O.h / 2, 0));
      const c1 = strand(cord, 0.08);
      const c2 = strand(cord, 0.08);
      ring = selRing(O.r + 1);
      group.add(ring);
      place = (ctx, ob) => {
        const w = ctx.world;
        const p = ob.support === 'hand' ? ob.pose : orbitRoom(w);
        placeAt(p);
        const onGuide = ob.support === 'guide' && !w.orbit.off;
        body.rotation.y = onGuide ? w.rotor.theta : 0;
        eye.position.x = -O.r - 0.3;
        eye.rotation.y = Math.PI / 2;
        c1.visible = onGuide;
        c2.visible = onGuide;
        if (onGuide) {
          const a = w.rotor.theta;
          const r = w.orbit.r * 100 - O.r - 0.4;
          const zc = TABLE_TOP + GEOF09.guide.h + O.h * 0.5;
          const sag = Math.min(3, w.orbit.slackM * 100 * 0.6);
          const mid = { x: AX.x + Math.cos(a) * r * 0.5 + Math.sin(a) * sag, y: AX.y + Math.sin(a) * r * 0.5 - Math.cos(a) * sag, z: zc };
          stretchC(c1, v3({ x: AX.x + Math.cos(a) * r, y: AX.y + Math.sin(a) * r, z: zc }), v3(mid));
          stretchC(c2, v3(mid), v3({ x: AX.x + Math.cos(a) * 1, y: AX.y + Math.sin(a) * 1, z: zc }));
        }
        return true;
      };
      break;
    }
    case 'radialMass': {
      const sid = id as SlideId;
      const S = GEOF09.slide;
      const m = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(S.r, S.r, S.h, seg), brass));
      m.position.y = S.h / 2;
      const slot = new THREE.Mesh(new THREE.BoxGeometry(GEOF09.bar.w + 0.2, 1.2, S.r * 2 + 0.1), mats.darkMetal);
      slot.position.y = 0.5;
      const pin = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.4, 10), red));
      body.add(m, slot, pin);
      body.add(at(hit(new THREE.CylinderGeometry(S.r + 0.4, S.r + 0.4, S.h, 12), id, 'body'), 0, S.h / 2, 0));
      body.add(at(hit(new THREE.BoxGeometry(1.8, 1.8, 1.8), id, 'lock'), 0, S.h + 0.8, 0));
      const c = strand(cord, 0.07);
      ring = selRing(S.r + 1);
      group.add(ring);
      place = (ctx, ob) => {
        const w = ctx.world;
        const p = ob.support === 'hand' ? ob.pose : slideRoom(w, sid);
        placeAt(p);
        const onBar = ob.support === 'bar';
        body.rotation.y = onBar ? w.rotor.theta : 0;
        const locked = w.slides[sid].locked;
        (pin.material as THREE.MeshStandardMaterial) = locked ? green : red;
        pin.position.y = S.h + (locked ? 0.4 : 0.9);
        c.visible = onBar;
        if (onBar) {
          const a = slideAngle(w, sid);
          const r = w.slides[sid].r * 100 - S.r;
          const z = TABLE_TOP + GEOF09.bar.h + 0.6;
          stretchC(c, v3({ x: AX.x + Math.cos(a) * r, y: AX.y + Math.sin(a) * r, z }), v3({ x: AX.x + Math.cos(a) * 1.4, y: AX.y + Math.sin(a) * 1.4, z }));
        }
        return true;
      };
      break;
    }
    case 'pullRing': {
      // Palanca del cordón central: el cordón baja por el eje hueco y sale bajo la base hasta esta manija.
      const post = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 8, 10), mats.darkMetal));
      post.position.y = 4;
      const foot = shadowed(new THREE.Mesh(new THREE.BoxGeometry(6, 1, 6), mats.darkMetal));
      foot.position.y = 0.5;
      const lever = new THREE.Group();
      lever.position.y = 8;
      const arm = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 9), mats.steel));
      arm.position.z = -4.5;
      const grip = shadowed(new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.35, 8, 16), red));
      grip.position.z = -9;
      grip.rotation.x = Math.PI / 2;
      lever.add(arm, grip);
      body.add(post, foot, lever, at(hit(new THREE.BoxGeometry(6, 10, 6), id, 'body'), 0, 5, 0));
      lever.add(at(hit(new THREE.BoxGeometry(4, 3, 4), id, 'grip'), 0, 0, -9));
      const c = strand(cord, 0.08);
      ring = selRing(4);
      group.add(ring);
      place = (ctx) => {
        const w = ctx.world;
        group.position.set(GEOF09.pull.x, 0, -GEOF09.pull.y);
        lever.rotation.y = Math.PI / 2;
        // La palanca baja a medida que el cordón recoge las masas (radio medio de las dos).
        const rm = (w.slides.slide1.r + w.slides.slide2.r) / 2;
        const k = (w.params.slideMaxR - rm) / (w.params.slideMaxR - w.params.slideMinR);
        lever.rotation.x = -0.9 * Math.max(0, Math.min(1, k)) + 0.2;
        stretchC(c, v3({ x: GEOF09.pull.x, y: GEOF09.pull.y, z: 7.5 }), v3({ x: AX.x - 3, y: AX.y - 3, z: 0.6 }));
        return true;
      };
      break;
    }
    case 'brake': {
      // Freno de zapata contra el borde de la plataforma: rojo con retención, ámbar con roce, verde suelto.
      const amber = own(new THREE.MeshStandardMaterial({ color: 0xe0a020, roughness: 0.45 }));
      const stand = shadowed(new THREE.Mesh(new THREE.BoxGeometry(2, TABLE.z - 1, 2), mats.darkMetal));
      stand.position.y = (TABLE.z - 1) / 2;
      const shoe = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.6, 5), red));
      const lever = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.8, 6, 0.8), mats.blackPlastic));
      const knob = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 10), red));
      body.add(stand, shoe, lever, knob);
      body.add(at(hit(new THREE.BoxGeometry(4, TABLE.z + 6, 6), id, 'body'), 0, (TABLE.z + 6) / 2, 0));
      ring = selRing(3.5);
      group.add(ring);
      place = (ctx) => {
        const w = ctx.world;
        const a = GEOF09.brake.angle;
        const R = TABLE.r + 2;
        group.position.set(AX.x + Math.cos(a) * R, 0, -(AX.y + Math.sin(a) * R));
        body.rotation.y = a;
        const lv = w.rotor.brake;
        shoe.position.set(lv ? -1.2 : -0.2, TABLE.z + TABLE.h / 2, 0);
        const mat = lv === 2 ? red : lv === 1 ? amber : green;
        (shoe.material as THREE.MeshStandardMaterial) = mat;
        (knob.material as THREE.MeshStandardMaterial) = mat;
        lever.position.set(0.6, TABLE.z + 3, 0);
        lever.rotation.z = lv === 2 ? 0.5 : lv === 1 ? 0.15 : -0.3;
        knob.position.set(0.6 - Math.sin(lever.rotation.z) * 3, TABLE.z + 3 + Math.cos(lever.rotation.z) * 3, 0);
        return true;
      };
      break;
    }
    case 'motor': {
      // Motor con perilla de consigna, palanca de embrague, pantalla de rpm y correa al eje.
      const M = GEOF09.motor;
      const box = shadowed(new THREE.Mesh(new RoundedBoxGeometry(M.w, M.h, M.d, 2, 0.8), own(new THREE.MeshStandardMaterial({ color: 0x35506b, roughness: 0.5 }))));
      box.position.y = M.h / 2;
      const { lcd, mesh } = lcdScreen(8, 3, 300, 110);
      mesh.position.set(-2.5, M.h * 0.68, M.d / 2 + 0.02);
      const knob = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 1.4, 20), mats.blackPlastic));
      knob.rotation.x = Math.PI / 2;
      knob.position.set(4.5, M.h * 0.62, M.d / 2 + 0.7);
      const tick = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.4, 0.2), own(new THREE.MeshBasicMaterial({ color: 0xffffff })));
      tick.position.set(0, 0.9, 0.75);
      const knobG = new THREE.Group();
      knobG.position.copy(knob.position);
      knob.position.set(0, 0, 0);
      knobG.add(knob, tick);
      const clutch = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1, 5, 1), red));
      clutch.position.set(M.w / 2 - 2, M.h + 2, 0);
      const pulley = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 1.4, 16), mats.blackPlastic));
      body.add(box, mesh, knobG, clutch);
      body.add(at(hit(new THREE.BoxGeometry(M.w, M.h, M.d), id, 'body'), 0, M.h / 2, 0));
      body.add(at(hit(new THREE.CylinderGeometry(2.4, 2.4, 2, 12).rotateX(Math.PI / 2), id, 'knob'), 4.5, M.h * 0.62, M.d / 2 + 0.8));
      body.add(at(hit(new THREE.BoxGeometry(2.4, 6, 2.4), id, 'clutch'), M.w / 2 - 2, M.h + 2, 0));
      // Correa: dos tramos rectos de la polea del motor (a la izquierda de la caja) a la del eje.
      const beltMat = own(new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 }));
      const beltA = roomObj(new THREE.Mesh(new THREE.BoxGeometry(0.3, 1, 1), beltMat));
      const beltB = roomObj(new THREE.Mesh(new THREE.BoxGeometry(0.3, 1, 1), beltMat));
      roomObj(pulley);
      ring = selRing(9);
      group.add(ring);
      place = (ctx) => {
        const w = ctx.world;
        group.position.set(M.x, 0, -M.y);
        const pm = { x: M.x - M.w / 2 - 2.5, y: M.y, z: 3 };
        pulley.position.copy(v3(pm));
        pulley.rotation.y = -w.rotor.theta * 1.5;
        const dx = AX.x - pm.x;
        const dy = AX.y - pm.y;
        const L = Math.hypot(dx, dy);
        const nx = -dy / L;
        const ny = dx / L;
        stretchC(beltA, v3({ x: pm.x + nx * 2, y: pm.y + ny * 2, z: 3 }), v3({ x: AX.x + nx * 3, y: AX.y + ny * 3, z: 3 }));
        stretchC(beltB, v3({ x: pm.x - nx * 2, y: pm.y - ny * 2, z: 3 }), v3({ x: AX.x - nx * 3, y: AX.y - ny * 3, z: 3 }));
        beltA.scale.set(1, beltA.scale.y, 1);
        clutch.rotation.z = w.motor.clutch ? -0.5 : 0.4;
        (clutch.material as THREE.MeshStandardMaterial) = w.motor.clutch ? green : red;
        return true;
      };
      update = (ctx) => {
        const w = ctx.world;
        const set = (w.motor.target * 60) / (2 * Math.PI);
        knobG.rotation.z = -Math.min(1, set / 120) * Math.PI * 1.5;
        const rpm = (Math.abs(w.rotor.omega) * 60) / (2 * Math.PI);
        lcd.set(`${set.toFixed(0)} rpm`, w.motor.clutch ? '#6ef09a' : '#f0c36e', `${w.motor.clutch ? 'ACOPLADO' : 'DESACOPLADO'} · mesa ${rpm.toFixed(0)}`);
      };
      break;
    }
    case 'forceSensor': {
      // Sensor de fuerza en lo alto del mástil (gira con la plataforma): el cordón de la masa orbitante sube hasta él.
      const rot = spinning();
      const cell = new THREE.Group();
      const box = shadowed(new THREE.Mesh(new RoundedBoxGeometry(4.2, 2.6, 2.6, 2, 0.4), own(new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.5 }))));
      const zeroBtn = button(0.45, mats.plasticBlue);
      zeroBtn.position.set(-1, 1.4, 0);
      const rangeBtn = button(0.45, mats.plasticYellow);
      rangeBtn.position.set(1, 1.4, 0);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), ledMat());
      led.position.set(0, 1.4, 0);
      cell.add(box, zeroBtn, rangeBtn, led);
      cell.add(at(hit(new THREE.BoxGeometry(4.2, 2.6, 2.6), id, 'body'), 0, 0, 0));
      cell.add(at(hit(new THREE.BoxGeometry(1.2, 1.2, 1.2), id, 'zero'), -1, 1.5, 0));
      cell.add(at(hit(new THREE.BoxGeometry(1.2, 1.2, 1.2), id, 'range'), 1, 1.5, 0));
      cell.position.set(0, TABLE_TOP + GEOF09.mast.h + 1.3, 0);
      rot.add(cell);
      // Cable: sujeto con la presilla baja por el mástil; suelto, cuelga hacia el borde (frente al haz).
      const cab = strand(cable, 0.15);
      ring = selRing(3);
      group.add(ring);
      place = (ctx) => {
        const w = ctx.world;
        atAxis();
        rot.rotation.y = w.rotor.theta;
        cell.rotation.z = w.force.angleDeg * DEG;
        const f = w.force;
        setLed(led, !f.connected ? 0x444444 : f.zeroed ? 0x34c759 : 0xf0c36e);
        const top = { x: AX.x, y: AX.y, z: TABLE_TOP + GEOF09.mast.h };
        const g = gateRoom();
        const loose = !w.gate.cableRouted;
        const end = loose ? { x: AX.x + (g.x - AX.x) * 0.97, y: AX.y + (g.y - AX.y) * 0.97, z: TABLE.z - 1 } : { x: AX.x + 0.9, y: AX.y, z: TABLE_TOP + 0.5 };
        cab.visible = f.connected || loose;
        stretchC(cab, v3(top), v3(end));
        return true;
      };
      break;
    }
    case 'gate': {
      // Fotopuerta en U que abraza el borde de la plataforma; la presilla del cable del sensor a su lado.
      const frame = new THREE.Group();
      const top = shadowed(new THREE.Mesh(new THREE.BoxGeometry(6, 1, 2), mats.blackPlastic));
      top.position.set(-1.5, TABLE.h + 1.8, 0);
      const bot = top.clone();
      bot.position.y = -2.6;
      const back = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.2, TABLE.h + 5.4, 2), mats.blackPlastic));
      back.position.set(1.8, (TABLE.h + 1.8 - 2.6) / 2, 0);
      const stand = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.4, TABLE.z - 2.6, 1.4), mats.darkMetal));
      stand.position.set(1.8, -2.6 - (TABLE.z - 2.6) / 2, 0);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, TABLE.h + 3.4, 6), own(new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.6 })));
      beam.position.set(-1.5, TABLE.h / 2 - 0.4, 0);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), ledMat());
      led.position.set(1.8, TABLE.h + 2.6, 0);
      const clip = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1.4), mats.plasticYellow));
      clip.position.set(2.8, TABLE.h + 1, 0);
      const plug = button(0.5, mats.rubberRed);
      plug.rotation.z = Math.PI / 2;
      plug.position.set(2.6, -1.2, 0);
      frame.add(top, bot, back, stand, beam, led, clip, plug);
      frame.add(at(hit(new THREE.BoxGeometry(6, TABLE.h + 5.4, 2.4), id, 'body'), -1, (TABLE.h + 1.8 - 2.6) / 2, 0));
      frame.add(at(hit(new THREE.BoxGeometry(1.8, 1.8, 2), id, 'clip'), 2.9, TABLE.h + 1, 0));
      frame.add(at(hit(new THREE.BoxGeometry(1.6, 1.6, 1.6), id, 'plug'), 2.7, -1.2, 0));
      body.add(frame);
      ring = selRing(4);
      group.add(ring);
      place = (ctx) => {
        const w = ctx.world;
        const g = gateRoom();
        group.position.set(g.x, TABLE.z, -g.y);
        body.rotation.y = GEOF09.gate.angle;
        const d = Math.atan2(Math.sin(w.rotor.theta - GEOF09.gate.angle), Math.cos(w.rotor.theta - GEOF09.gate.angle));
        const blocked = Math.abs(d) * TABLE.r < 0.5 || !w.gate.cableRouted;
        setLed(led, !w.gate.connected ? 0x444444 : blocked ? 0xff3b30 : 0x34c759);
        (clip.material as THREE.MeshStandardMaterial) = w.gate.cableRouted ? green : mats.plasticYellow;
        return true;
      };
      break;
    }
    case 'encoder': {
      const box = shadowed(new THREE.Mesh(new RoundedBoxGeometry(6, 3, 4, 2, 0.4), own(new THREE.MeshStandardMaterial({ color: 0x2b3a4a, roughness: 0.5 }))));
      box.position.y = 1.5;
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), ledMat());
      led.position.set(2.2, 2.2, 2.05);
      const cal = button(0.5, mats.plasticYellow);
      cal.rotation.x = Math.PI / 2;
      cal.position.set(-1.6, 1.4, 2.1);
      body.add(box, led, cal);
      body.add(at(hit(new THREE.BoxGeometry(6, 3, 4), id, 'body'), 0, 1.5, 0));
      body.add(at(hit(new THREE.BoxGeometry(1.6, 1.6, 1.2), id, 'cal'), -1.6, 1.4, 2.3));
      ring = selRing(4);
      group.add(ring);
      place = () => {
        group.position.set(AX.x + 6, GEOF09.base.h, -(AX.y - 6));
        return true;
      };
      update = (ctx) => {
        const e = ctx.world.encoder;
        setLed(led, !e.connected ? 0x444444 : e.calibrated ? 0x34c759 : 0xf0c36e);
      };
      break;
    }
    case 'logger': {
      const Lg = GEOF09.logger;
      const box = shadowed(new THREE.Mesh(new RoundedBoxGeometry(Lg.w, Lg.h, Lg.d, 2, 0.6), own(new THREE.MeshStandardMaterial({ color: 0x2b3a4a, roughness: 0.5 }))));
      box.position.y = Lg.h / 2;
      const { lcd, mesh } = lcdScreen(13, 3.4, 360, 100);
      mesh.position.set(0, Lg.h * 0.7, Lg.d / 2 + 0.02);
      body.add(box, mesh);
      const ports: Array<[string, number, THREE.Material]> = [['portE', -5, mats.plasticWhite], ['portF', 0, mats.plasticYellow], ['portG', 5, mats.rubberRed]];
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
      const tops: Array<[string, number, THREE.Material]> = [['rate', -7, mats.plasticBlue], ['readF', -3.5, mats.plasticYellow], ['readT', 0, mats.rubberRed], ['readW', 3.5, mats.plasticWhite], ['readE', 7, mats.plasticBlue]];
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
        setLed(portLeds.portF, on(w.force.connected));
        setLed(portLeds.portG, on(w.gate.connected));
        const busy = !!w.timing || (!!w.run && !w.run.done);
        const head = w.encoder.connected ? `ω ${(w.rotor.omega * w.encoder.scale).toFixed(2)} rad/s` : 'LISTO';
        lcd.set(head, busy ? '#6ef09a' : '#f0c36e', `${w.logger.rateHz} Hz · ${w.timing ? `CRONOMETRANDO ${w.timing.turns} v` : busy ? 'REGISTRANDO' : `${w.runs.length} tirones`}`);
      };
      break;
    }
    case 'balance': {
      const Bl = GEOF09.balance;
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
        lcd.set(`${shown.toFixed(res < 1 ? 1 : 0)} g`, settling ? '#f0c36e' : '#6ef09a', b.tared ? 'TARA ✓' : 'SIN TARA');
      };
      break;
    }
    case 'massRack': {
      const R = GEOF09.massRack;
      const base = shadowed(new THREE.Mesh(new THREE.BoxGeometry(R.w, R.h, R.d), mats.wood));
      base.position.set(0, R.h / 2, 0);
      body.add(base, at(hit(new THREE.BoxGeometry(R.w, R.h, R.d), id, 'body'), 0, R.h / 2, 0));
      for (const m of ['orbit01', 'slide1', 'slide2'] as MassId[]) {
        const p = rackRoom(m);
        const pad = new THREE.Mesh(new THREE.CircleGeometry(2.8, 20), mats.blackPlastic);
        pad.rotation.x = -Math.PI / 2;
        pad.position.set(p.x - R.x, R.h + 0.02, -(p.y - R.y));
        body.add(pad);
      }
      place = () => {
        group.position.set(R.x, 0, -R.y);
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

  // Cordones, cables y correa viven en la sala, no dentro del grupo del objeto.
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

export { panRoom, TABLE_TOP };
