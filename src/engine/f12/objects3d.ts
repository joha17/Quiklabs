/**
 * Vistas 3D procedurales de F12: depósito colector translúcido con visor graduado, bomba con perilla de velocidad y
 * llave, caudalímetro de turbina con pantalla, juntas con su tuerca y empaquetadura, tubo Venturi transparente (perfil
 * real del dominio) con el agua, la bolsa de aire, trazadores que se aceleran en la garganta y el tapón si quedó
 * adentro, abrazaderas, tramo liso o rugoso, pieza de la toma 3 con la purga, válvula rotativa con su dial, desviador
 * con chorro, vaso volumétrico graduado, cronómetro, panel de tres sensores con sus mangueras, registrador de tres
 * canales, regla de cotas, caja de empaquetaduras, tramo de repuesto, calibre digital, pieza de corte, sonda de
 * Pitot, tapón y toalla. SOLO leen el estado; cada pieza funcional tiene un colisionador invisible simple
 * (`userData {objId, part}`).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { F12Object, JointId, PortId, SensorId } from '../../simulation/f12-world/types';
import { GEOF12, VENTURI_END, venturiD } from '../../simulation/f12-world/geometry';
import { airInLinesF12, channelDisplayF12, flowingF12, hydraulicsF12, meterDisplayF12, rangeKPaF12, resKPaF12, timerValueF12 } from '../../simulation/f12-world/world';
import type { QualityLevel } from '../quality';
import { materials } from '../renderers/materials';
import { lcdTexture } from '../renderers/textures';
import type { FrameCtxF } from './F12Lab3D';
import { LOGGER, beakerLevelCm, homeOf, objRoom, sumpSurfaceZ, tapRoom } from './layout';

export interface ObjHandleF {
  group: THREE.Group;
  update(ctx: FrameCtxF, o: F12Object): void;
  dispose(): void;
}

const hitMat = () => materials('LOW').hit;
const G = GEOF12;
const Z = G.axisZ;
const Y = G.pipeY;
const R1 = 2.3;
const JOINT_X: Record<JointId, number> = { J1: G.j1, J2: G.j2, J3: G.j3 };
/** Sensores del panel (x en la sala). */
const SENSOR_X: Record<SensorId, number> = { 1: G.panel.x - 15, 2: G.panel.x, 3: G.panel.x + 15 };
/** Volumen del vaso a la altura h (mL por cm). */
const BEAKER_ML_PER_CM = Math.PI * G.beaker.r ** 2;

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

/** Pieza entre dos puntos de la escena (manguera, caño, chorro). */
function stretchC(m: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
  const d = b.clone().sub(a);
  const len = Math.max(0.01, d.length());
  m.scale.set(1, len, 1);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  m.position.copy(a).add(b).multiplyScalar(0.5);
}

/** Escala vertical impresa: `len` de alto (cm de la escena), divisiones cada `minor` unidades y números cada `major`. */
function vScale(len: number, units: number, minor: number, major: number, light = false, fmt = (v: number) => String(v)): THREE.CanvasTexture {
  const k = 22;
  const H = Math.round(len * k);
  const W = 72;
  return canvasTex(W, H, (g) => {
    if (!light) {
      g.fillStyle = '#f4f1e6';
      g.fillRect(0, 0, W, H);
    }
    g.strokeStyle = '#13212e';
    g.fillStyle = '#13212e';
    g.font = 'bold 17px sans-serif';
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    const n = Math.round(units / minor);
    for (let i = 0; i <= n; i++) {
      const v = i * minor;
      const y = H - Math.max(1, Math.min(H - 1, (v / units) * H));
      const isMajor = Math.abs(v / major - Math.round(v / major)) < 1e-6;
      const isHalf = Math.abs((2 * v) / major - Math.round((2 * v) / major)) < 1e-6;
      g.lineWidth = isMajor ? 2.4 : isHalf ? 1.5 : 0.9;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(isMajor ? 30 : isHalf ? 20 : 11, y);
      g.stroke();
      if (isMajor && i > 0 && i < n) g.fillText(fmt(v), W - 2, y);
    }
  });
}

const WATER = 0x6fb6e0;

export function createObjVisualF(o: F12Object, w0: FrameCtxF['world'], q: QualityLevel, _ghost?: () => { id: string; x: number; y: number; z: number } | null): ObjHandleF {
  const mats = materials(q);
  const seg = q === 'LOW' ? 16 : q === 'MEDIUM' ? 24 : 36;
  const group = new THREE.Group();
  const disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];
  let ring: THREE.Mesh | null = null;
  let update: ObjHandleF['update'] = () => undefined;
  let place: ((ctx: FrameCtxF, ob: F12Object) => boolean) | null = null;
  const id = o.id;
  const own = <M extends THREE.Material | THREE.Texture>(m: M): M => {
    disposables.push(m);
    return m;
  };
  const red = own(new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.45 }));
  const green = own(new THREE.MeshStandardMaterial({ color: 0x2e9d57, roughness: 0.45 }));
  const brass = own(new THREE.MeshStandardMaterial({ color: 0xb8913a, metalness: 0.8, roughness: 0.3 }));
  const pvc = own(new THREE.MeshStandardMaterial({ color: 0x8a96a3, roughness: 0.5 }));
  const hoseMat = own(new THREE.MeshStandardMaterial({ color: 0xd9e2e8, roughness: 0.3, transparent: true, opacity: 0.85 }));
  const rubber = own(new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.85 }));
  const worn = own(new THREE.MeshStandardMaterial({ color: 0xc77a2a, roughness: 0.9 }));
  const clear = own(new THREE.MeshPhysicalMaterial({ color: 0xe8f4fa, roughness: 0.05, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }));
  const waterMat = own(new THREE.MeshStandardMaterial({ color: WATER, roughness: 0.1, transparent: true, opacity: 0.45, depthWrite: false }));
  const streamMat = own(new THREE.MeshStandardMaterial({ color: 0x9fd2f0, roughness: 0.1, transparent: true, opacity: 0.65, depthWrite: false }));
  const body = new THREE.Group();
  group.add(body);
  const lcdScreen = (w: number, h: number, pw = 256, ph = 96) => {
    const lcd = lcdTexture(pw, ph);
    own(lcd.texture);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), own(new THREE.MeshBasicMaterial({ map: lcd.texture })));
    return { lcd, mesh: m };
  };
  const button = (r: number, mat: THREE.Material) => shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.6, 14), mat));
  const setMat = (m: THREE.Mesh, mat: THREE.Material) => {
    if (m.material !== mat) m.material = mat;
  };
  const roomLevel: THREE.Object3D[] = [];
  const roomObj = <O extends THREE.Object3D>(x: O): O => {
    roomLevel.push(x);
    return x;
  };
  const v3 = (p: { x: number; y: number; z: number }) => new THREE.Vector3(p.x, p.z, -p.y);
  /** Caño, manguera o chorro: cilindro que se estira entre dos puntos de la sala. */
  const strand = (mat: THREE.Material, r = 0.4) => roomObj(shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 10), mat)));
  const pipeRun = (pts: Array<[number, number, number]>, mat: THREE.Material = pvc, r = 2.3) => {
    for (let i = 0; i + 1 < pts.length; i++) {
      const m = strand(mat, r);
      stretchC(m, v3({ x: pts[i][0], y: pts[i][1], z: pts[i][2] }), v3({ x: pts[i + 1][0], y: pts[i + 1][1], z: pts[i + 1][2] }));
      if (i > 0) {
        const elbow = roomObj(shadowed(new THREE.Mesh(new THREE.SphereGeometry(r * 1.05, 12, 8), mat)));
        elbow.position.copy(v3({ x: pts[i][0], y: pts[i][1], z: pts[i][2] }));
      }
    }
  };
  /** Tramo de tubo a lo largo de x (local del grupo), de x0 a x1. */
  const xTube = (x0: number, x1: number, r: number, mat: THREE.Material) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, x1 - x0, seg, 1, mat === clear), mat);
    m.rotation.z = Math.PI / 2;
    m.position.x = (x0 + x1) / 2;
    return m;
  };
  const placeRoom = (x: number, y: number, z: number) => group.position.set(x, z, -y);

  switch (o.kind) {
    case 'sump': {
      // Depósito colector translúcido con su agua, tapa con la boca del retorno y visor graduado al frente.
      const S = G.sump;
      const tank = new THREE.Mesh(new THREE.BoxGeometry(S.w, S.h, S.d), mats.glass);
      tank.position.y = S.h / 2;
      tank.renderOrder = 3;
      const base = shadowed(new THREE.Mesh(new THREE.BoxGeometry(S.w + 1, 1, S.d + 1), mats.darkMetal));
      base.position.y = 0.5;
      const lid = shadowed(new THREE.Mesh(new THREE.BoxGeometry(S.w + 1, 0.8, S.d * 0.45), mats.plasticWhite));
      lid.position.set(0, S.h + 0.4, -S.d * 0.27);
      const water = new THREE.Mesh(new THREE.BoxGeometry(S.w - 0.4, 1, S.d - 0.4), waterMat);
      water.renderOrder = 2;
      const scale = new THREE.Mesh(new THREE.PlaneGeometry(2.4, S.h - 2), own(new THREE.MeshBasicMaterial({ map: own(vScale(S.h - 2, S.h - 2, 0.1, 5)), transparent: true })));
      scale.position.set(-S.w / 2 + 4, 1 + (S.h - 2) / 2, S.d / 2 + 0.06);
      const glassTube = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, S.h - 2, 10), clear);
      glassTube.position.set(-S.w / 2 + 6, 1 + (S.h - 2) / 2, S.d / 2 + 0.7);
      const tubeWater = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1, 10), waterMat);
      const puddle = roomObj(new THREE.Mesh(new THREE.CircleGeometry(1, 28), own(new THREE.MeshStandardMaterial({ color: 0x9fd2f0, roughness: 0.05, transparent: true, opacity: 0.55 }))));
      puddle.rotation.x = -Math.PI / 2;
      body.add(tank, base, lid, water, scale, glassTube, tubeWater);
      body.add(at(hit(new THREE.BoxGeometry(S.w + 1, S.h, S.d + 1), id, 'body'), 0, S.h / 2, 0));
      ring = selRing(S.w * 0.6);
      body.add(ring);
      place = () => (placeRoom(S.x, S.y, 0), true);
      update = (ctx) => {
        const w = ctx.world;
        const L = Math.max(0.02, sumpSurfaceZ(w) - 1);
        water.scale.y = L;
        water.position.y = 1 + L / 2;
        tubeWater.scale.y = L;
        tubeWater.position.set(-S.w / 2 + 6, 1 + L / 2, S.d / 2 + 0.7);
        const sp = w.spill;
        puddle.visible = sp > 1;
        if (puddle.visible) {
          const r = Math.min(26, Math.sqrt(sp / 0.15 / Math.PI));
          puddle.scale.setScalar(r);
          puddle.position.set(150, 0.08, -(Y - 14 - r * 0.2));
        }
      };
      break;
    }
    case 'pump': {
      // Bomba centrífuga con motor, perilla de velocidad (gira con la consigna), llave y piloto; caños de aspiración
      // desde el depósito y de impulsión hacia el caudalímetro.
      const P = G.pump;
      const motor = shadowed(new THREE.Mesh(new RoundedBoxGeometry(P.w, P.h, P.d, 3, 1.2), mats.plasticBlue));
      motor.position.y = P.h / 2;
      const volute = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 4, seg), mats.darkMetal));
      volute.rotation.z = Math.PI / 2;
      volute.position.set(P.w / 2 + 2, 7, 0);
      const knob = new THREE.Group();
      const kb = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, 1.4, 20), mats.blackPlastic));
      kb.rotation.x = Math.PI / 2;
      const mark = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.8, 0.3), mats.plasticWhite));
      mark.position.set(0, 1, 0.8);
      knob.add(kb, mark);
      knob.position.set(-2.5, 9, P.d / 2 + 0.8);
      const dial = new THREE.Mesh(new THREE.RingGeometry(2.8, 3.4, 32, 1, -Math.PI / 4, (3 * Math.PI) / 2), own(new THREE.MeshBasicMaterial({ color: 0xf2f2f2, side: THREE.DoubleSide })));
      dial.position.set(-2.5, 9, P.d / 2 + 0.05);
      dial.rotation.z = -Math.PI / 2;
      const sw = shadowed(new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 1.2), red));
      sw.position.set(3.8, 4, P.d / 2 + 0.6);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), own(new THREE.MeshBasicMaterial({ color: 0x333333 })));
      led.position.set(3.8, 7, P.d / 2 + 0.2);
      body.add(motor, volute, knob, dial, sw, led);
      body.add(at(hit(new THREE.BoxGeometry(P.w + 4, P.h, P.d), id, 'body'), 1, P.h / 2, 0));
      body.add(at(hit(new THREE.CylinderGeometry(3, 3, 2, 12).rotateX(Math.PI / 2), id, 'knob'), -2.5, 9, P.d / 2 + 1));
      body.add(at(hit(new THREE.BoxGeometry(3.2, 3.2, 2), id, 'switch'), 3.8, 4, P.d / 2 + 0.8));
      ring = selRing(P.w * 0.7);
      body.add(ring);
      // Aspiración desde el depósito e impulsión hasta la entrada del caudalímetro.
      pipeRun([[G.sump.x + G.sump.w / 2 - 4, P.y, 6], [P.x - P.w / 2, P.y, 6]], pvc, 1.8);
      pipeRun([[P.x + P.w / 2 + 4, P.y, 7], [P.x + P.w / 2 + 6, Y, 7], [P.x + P.w / 2 + 6, Y, Z], [G.meter.x - G.meter.len / 2, Y, Z]]);
      const ledOn = own(new THREE.MeshBasicMaterial({ color: 0x38e070 }));
      const ledOff = led.material as THREE.MeshBasicMaterial;
      place = () => (placeRoom(P.x, P.y, 0), true);
      update = (ctx) => {
        const w = ctx.world;
        knob.rotation.z = Math.PI * 0.75 - w.pump.set * Math.PI * 1.5;
        setMat(sw, w.pump.on ? green : red);
        setMat(led, w.pump.on ? ledOn : ledOff);
        volute.rotation.x = ctx.reducedMotion ? 0 : volute.rotation.x + w.pump.n * ctx.dt * 30;
      };
      break;
    }
    case 'meter': {
      // Caudalímetro de turbina en línea con pantalla de L/s, y el caño hasta J1.
      const M = G.meter;
      const tube = shadowed(xTube(-M.len / 2, M.len / 2, 3.1, mats.darkMetal));
      const head = shadowed(new THREE.Mesh(new RoundedBoxGeometry(9, 5, 4, 2, 0.6), mats.plasticWhite));
      head.position.set(0, 5.5, 0);
      const { lcd, mesh } = lcdScreen(7.4, 2.8);
      mesh.position.set(0, 5.6, 2.05);
      body.add(tube, head, mesh);
      body.add(at(hit(new THREE.BoxGeometry(M.len + 1, 12, 7), id, 'body'), 0, 2, 0));
      pipeRun([[M.x + M.len / 2, Y, Z], [G.j1 - 1.2, Y, Z]]);
      place = () => (placeRoom(M.x, Y, Z), true);
      update = (ctx) => {
        const v = meterDisplayF12(ctx.world);
        lcd.set(`${v.toFixed(2)} L/s`, '#6ef09a', v >= ctx.world.params.meter.rangeLs ? 'SOBRERRANGO' : 'CAUDAL');
      };
      break;
    }
    case 'joint': {
      // Unión con tuerca: apretada (bronce, en su lugar) o abierta (corrida, con la boca visible); la empaquetadura es
      // un anillo negro (naranja si está gastada) y gotea si pierde con caudal.
      const j = id.replace('joint', '') as JointId;
      const nut = shadowed(xTube(-1.4, 1.4, 3.3, brass));
      const gasket = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.35, 8, 24), rubber);
      gasket.rotation.y = Math.PI / 2;
      const drip = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), streamMat);
      body.add(nut, gasket, drip);
      body.add(at(hit(new THREE.BoxGeometry(4, 7.4, 7.4), id, 'body'), 0, 0, 0));
      body.add(at(hit(new THREE.BoxGeometry(1.2, 7.8, 7.8), id, 'gasket'), -2.6, 0, 0));
      place = () => (placeRoom(JOINT_X[j], Y, Z), true);
      update = (ctx) => {
        const w = ctx.world;
        const s = w.circuit.joints[j];
        nut.position.x = s.connected ? 0 : 1.8;
        setMat(nut, s.connected ? brass : mats.steel);
        gasket.visible = s.gasket;
        gasket.position.x = s.connected ? 0 : -2.2;
        setMat(gasket, s.worn ? worn : rubber);
        const lk = hydraulicsF12(w).leak[j] > 0;
        drip.visible = lk && !ctx.reducedMotion;
        if (drip.visible) drip.position.set(0, -3 - ((w.timeS * 30) % (Z - 4)), 0);
      };
      break;
    }
    case 'venturi': {
      // Tubo Venturi de acrílico con el perfil del dominio; adentro el agua (con la bolsa de aire del punto alto y el
      // tapón si quedó), trazadores que se mueven a v/7 para ver la aceleración en la garganta.
      const D1 = w0.params.D1 * 100;
      const D2 = w0.params.D2 * 100;
      const V = G.venturi;
      const L = VENTURI_END - V.x0;
      const prof = (inner: boolean) => {
        const pts: THREE.Vector2[] = [];
        for (let i = 0; i <= 60; i++) {
          const x = V.x0 + (L * i) / 60;
          pts.push(new THREE.Vector2(venturiD(x, D1, D2) / 2 + (inner ? 0 : V.wall), x - V.x0));
        }
        return pts;
      };
      const shell = new THREE.Mesh(new THREE.LatheGeometry(prof(false), seg), clear);
      shell.rotation.z = -Math.PI / 2;
      shell.renderOrder = 4;
      const water = new THREE.Mesh(new THREE.LatheGeometry(prof(true).map((p) => new THREE.Vector2(p.x * 0.97, p.y)), seg), waterMat);
      water.rotation.z = -Math.PI / 2;
      water.renderOrder = 3;
      const flanges = [0, L].map((x) => shadowed(at(xTube(-0.6, 0.6, D1 / 2 + 0.9, mats.plasticWhite), x, 0, 0)));
      const bubble = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), own(new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.5, depthWrite: false })));
      const stopper = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, 2.2, 12), rubber));
      stopper.rotation.z = Math.PI / 2;
      stopper.position.set(G.tapX[2] - V.x0, -0.3, 0);
      const tracers: THREE.Mesh[] = [];
      const tracerMat = own(new THREE.MeshBasicMaterial({ color: 0xffffff }));
      for (let i = 0; i < 9; i++) {
        const t = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), tracerMat);
        t.userData.u = i / 9;
        t.userData.r = ((i * 37) % 9) / 9 - 0.5;
        tracers.push(t);
      }
      body.add(shell, water, ...flanges, bubble, stopper, ...tracers);
      for (let i = 0; i < 6; i++) body.add(at(hit(new THREE.BoxGeometry(L / 6, D1 + 1, D1 + 1), id, 'body'), (L * (i + 0.5)) / 6, 0, 0));
      place = (ctx) => {
        placeRoom(V.x0, Y, Z);
        // Montado al revés (F12-S09): el difusor largo queda aguas arriba.
        body.scale.x = ctx.world.reversed ? -1 : 1;
        body.position.x = ctx.world.reversed ? L : 0;
        return true;
      };
      update = (ctx) => {
        const w = ctx.world;
        const fill = Math.max(0, Math.min(1, 1 - w.circuit.airCm3 / w.params.pipeCm3));
        water.visible = fill > 0.02;
        water.scale.set(1, 1, 1);
        bubble.visible = airInLinesF12(w) && fill > 0.02;
        if (bubble.visible) {
          const r = Math.min(1.6, 0.5 + w.circuit.airCm3 / 300);
          bubble.scale.set(r * 2.2, r * 0.55, r);
          bubble.position.set(L * 0.85, D1 / 2 - r * 0.5, 0);
        }
        stopper.visible = w.circuit.obstructed;
        const hy = hydraulicsF12(w);
        const show = flowingF12(w) && fill > 0.5 && !ctx.reducedMotion;
        for (const t of tracers) {
          t.visible = show;
          if (!show) continue;
          const xr = V.x0 + t.userData.u * L;
          const xd = w.reversed ? V.x0 + L - (xr - V.x0) : xr;
          const D = venturiD(xd, D1, D2);
          const v = (hy.Qv / (Math.PI * (D / 200) ** 2)) * 100;
          t.userData.u = (t.userData.u + (ctx.dt * v) / 7 / L) % 1;
          t.position.set(t.userData.u * L, t.userData.r * D * 0.7, ((t.userData.r * 13) % 1) * D * 0.3);
        }
      };
      break;
    }
    case 'clamp': {
      // Dos abrazaderas con su poste: palanca verde (cerrada) o roja (libre).
      const V = G.venturi;
      const D1 = w0.params.D1 * 100;
      const xs = [V.x0 + V.inlet / 2, V.x0 + V.inlet + V.conv + V.throat + V.diff * 0.6];
      const levers: THREE.Mesh[] = [];
      for (const x of xs) {
        const lx = x - o.pose.x;
        const band = shadowed(new THREE.Mesh(new THREE.TorusGeometry(D1 / 2 + 0.6, 0.35, 8, 24), mats.steel));
        band.rotation.y = Math.PI / 2;
        band.position.set(lx, 4, 0);
        const post = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, Z - 4 - D1 / 2, 10), mats.steel));
        post.position.set(lx, (Z - 4 - D1 / 2) / 2 - Z + 4, 0);
        const foot = shadowed(new THREE.Mesh(new THREE.BoxGeometry(5, 0.8, 5), mats.darkMetal));
        foot.position.set(lx, -Z + 4.4, 0);
        const lever = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.6, 3, 0.9), red));
        lever.position.set(lx, 4 + D1 / 2 + 1.6, 0);
        levers.push(lever);
        body.add(band, post, foot, lever);
        body.add(at(hit(new THREE.BoxGeometry(3, D1 + 4, D1 + 2), id, 'lever'), lx, 4, 0));
      }
      place = () => (placeRoom(o.pose.x, Y, Z - 4), true);
      update = (ctx) => {
        for (const l of levers) {
          setMat(l, ctx.world.circuit.clamped ? green : red);
          l.rotation.x = ctx.world.circuit.clamped ? 0 : 0.7;
        }
      };
      break;
    }
    case 'spool': {
      // Tramo intercambiable de 30 cm: liso (acrílico con agua) o rugoso (gris con anillos internos).
      const S = G.spool;
      const smooth = new THREE.Group();
      const sh = xTube(-S.L / 2, S.L / 2, R1 + 0.3, clear);
      sh.renderOrder = 4;
      const sw = xTube(-S.L / 2, S.L / 2, R1 - 0.1, waterMat);
      smooth.add(sh, sw);
      const rough = new THREE.Group();
      rough.add(shadowed(xTube(-S.L / 2, S.L / 2, R1 + 0.3, own(new THREE.MeshStandardMaterial({ color: 0x5c636b, roughness: 0.95 })))));
      for (let i = 0; i < 8; i++) rough.add(shadowed(at(new THREE.Mesh(new THREE.TorusGeometry(R1 + 0.32, 0.12, 6, 18), mats.darkMetal).rotateY(Math.PI / 2), -S.L / 2 + 2 + i * 3.7, 0, 0)));
      body.add(smooth, rough);
      body.add(at(hit(new THREE.BoxGeometry(S.L, 6, 6), id, 'body'), 0, 0, 0));
      place = () => (placeRoom(S.x0 + S.L / 2, Y, Z), true);
      update = (ctx) => {
        const w = ctx.world;
        smooth.visible = w.circuit.spool === 'smooth';
        rough.visible = !smooth.visible;
        sw.visible = w.circuit.airCm3 < w.params.pipeCm3 * 0.7;
      };
      break;
    }
    case 'tapPiece': {
      // Toma de presión: niple vertical con tapa roja o con la manguera del sensor; con la sonda de Pitot asoma un
      // tubito doblado hacia el flujo. La pieza de la toma 3 lleva el cuerpo en T hasta J3.
      const port = Number(id.replace('tap', '')) as PortId;
      const nipple = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 3, 10), brass));
      const cap = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 1, 12), red));
      const pitot = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.18, 6, 10, Math.PI / 2), mats.steel));
      body.add(nipple, cap, pitot);
      if (port === 3) {
        const tee = shadowed(xTube(G.spool.x0 + G.spool.L - G.tapX[3], G.j3 - 1.2 - G.tapX[3], R1 + 0.4, pvc));
        body.add(tee);
      }
      body.add(at(hit(new THREE.BoxGeometry(2.4, 5, 2.4), id, 'cap'), 0, 3, 0));
      body.add(at(hit(new THREE.BoxGeometry(2.2, 2.2, 2.2), id, 'probe'), 0, 0.2, 2.6));
      place = (ctx) => {
        const w = ctx.world;
        placeRoom(G.tapX[port], Y, Z);
        const top = w.tapZ[port] - Z + 2.6;
        nipple.scale.y = Math.max(1, (top - 0.8) / 3);
        nipple.position.y = (R1 + top) / 2;
        cap.position.y = top + 0.3;
        return true;
      };
      update = (ctx) => {
        const w = ctx.world;
        cap.visible = w.ports[port].capped;
        pitot.visible = w.ports[port].probe === 'pitot';
        pitot.position.set(-0.9, 0, 0);
      };
      break;
    }
    case 'purge': {
      // Válvula de purga en el punto alto de la pieza de la toma 3: palanca a lo largo (cerrada) o cruzada (abierta);
      // con la purga abierta sale aire o agua.
      const bodyV = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 2.2, 12), brass));
      bodyV.position.y = 1.1;
      const lever = shadowed(new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.4, 0.6), red));
      lever.position.y = 2.4;
      const jet = new THREE.Mesh(new THREE.ConeGeometry(0.6, 3, 10, 1, true), streamMat);
      jet.position.y = 4;
      body.add(bodyV, lever, jet);
      body.add(at(hit(new THREE.BoxGeometry(3.6, 3.6, 2.4), id, 'lever'), 0, 1.8, 0));
      place = () => (placeRoom(G.purgeX, Y, Z + R1), true);
      update = (ctx) => {
        const w = ctx.world;
        lever.rotation.y = w.circuit.purgeOpen ? Math.PI / 2 : 0;
        setMat(lever, w.circuit.purgeOpen ? green : red);
        jet.visible = w.circuit.purgeOpen && flowingF12(w);
        (jet.material as THREE.MeshStandardMaterial).opacity = w.circuit.airCm3 > 0 ? 0.25 : 0.65;
      };
      break;
    }
    case 'valve': {
      // Válvula rotativa de seis posiciones: dial 0–5, manija cruzada (cerrada) a paralela (abierta) y caños de J3 a
      // la válvula y de la válvula al desviador.
      const bodyV = shadowed(new THREE.Mesh(new RoundedBoxGeometry(6, 6, 6, 2, 0.8), mats.darkMetal));
      const dial = new THREE.Mesh(new THREE.CircleGeometry(3.6, 32), own(new THREE.MeshBasicMaterial({
        map: own(canvasTex(128, 128, (g) => {
          g.fillStyle = '#f4f1e6';
          g.beginPath();
          g.arc(64, 64, 62, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#13212e';
          g.font = 'bold 20px sans-serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          for (let i = 0; i <= 5; i++) {
            const a = -Math.PI / 2 + (i / 5) * (Math.PI / 2);
            g.fillText(String(i), 64 + Math.cos(a + Math.PI / 2) * 46, 64 - Math.sin(a + Math.PI / 2) * 46);
          }
        })),
      })));
      dial.rotation.x = -Math.PI / 2;
      dial.position.y = 3.05;
      const handle = shadowed(new THREE.Mesh(new THREE.BoxGeometry(9, 0.9, 1.4), red));
      handle.position.y = 3.8;
      const minus = button(0.9, mats.plasticWhite);
      minus.rotation.x = Math.PI / 2;
      minus.position.set(-2, 0, 3.2);
      const plus = button(0.9, mats.plasticWhite);
      plus.rotation.x = Math.PI / 2;
      plus.position.set(2, 0, 3.2);
      body.add(bodyV, dial, handle, minus, plus);
      body.add(at(hit(new THREE.BoxGeometry(10, 2, 3), id, 'handle'), 0, 3.8, 0));
      body.add(at(hit(new THREE.BoxGeometry(2.2, 2.2, 1.4), id, 'close'), -2, 0, 3.4));
      body.add(at(hit(new THREE.BoxGeometry(2.2, 2.2, 1.4), id, 'open'), 2, 0, 3.4));
      body.add(at(hit(new THREE.BoxGeometry(6.4, 6, 6.4), id, 'body'), 0, 0, 0));
      pipeRun([[G.j3 + 1.2, Y, Z], [G.valve.x - 3, Y, Z]]);
      pipeRun([[G.valve.x + 3, Y, Z], [G.outlet.x - 4, Y, Z], [G.outlet.x - 4, G.outlet.y, G.outlet.z], [G.outlet.x - 1, G.outlet.y, G.outlet.z]]);
      place = () => (placeRoom(G.valve.x, Y, Z), true);
      update = (ctx) => {
        const w = ctx.world;
        // La manija se ve girar durante la maniobra (0,3 s por posición).
        const target = (w.valve.pos / 5) * (Math.PI / 2);
        handle.rotation.y += (Math.PI / 2 - target - handle.rotation.y) * Math.min(1, ctx.dt * 12);
      };
      break;
    }
    case 'outlet': {
      // Desviador sobre el vaso: pico hacia abajo, palanca (al depósito o al vaso), chorro y manguera de retorno.
      const spout = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.1, 4, 14), pvc));
      spout.position.y = -1.2;
      const lever = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.6, 4, 0.8), mats.plasticYellow));
      lever.position.set(1.8, 2, 0);
      body.add(spout, lever);
      body.add(at(hit(new THREE.BoxGeometry(5, 7, 5), id, 'lever'), 0.5, 0, 0));
      const jet = strand(streamMat, 0.55);
      pipeRun([[G.outlet.x + 1.5, G.outlet.y, G.outlet.z], [G.outlet.x + 6, G.outlet.y + 22, G.outlet.z], [G.outlet.x + 6, 60, 5], [G.sump.x + 10, 60, 5], [G.sump.x + 10, G.sump.y + 8, G.sump.h + 1]], hoseMat, 1.2);
      place = () => (placeRoom(G.outlet.x, G.outlet.y, G.outlet.z), true);
      update = (ctx) => {
        const w = ctx.world;
        const toBeaker = w.collect.diverter === 'beaker';
        lever.rotation.z = toBeaker ? -0.6 : 0.6;
        const flowing = flowingF12(w);
        jet.visible = toBeaker && flowing;
        if (jet.visible) {
          const atOut = w.collect.beakerAt === 'outlet';
          const zEnd = atOut ? 0.6 + beakerLevelCm(w) : 0.1;
          stretchC(jet, v3({ x: G.outlet.x, y: G.outlet.y, z: G.outlet.z - 3.2 }), v3({ x: G.outlet.x, y: G.outlet.y, z: zEnd }));
        }
      };
      break;
    }
    case 'beaker': {
      // Vaso volumétrico de 1 L (Ø 11,6 cm) con graduación de 10 mL y pico para vaciarlo.
      const B = G.beaker;
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(B.r + 0.2, B.r + 0.2, B.h, seg, 1, true), clear);
      glass.position.y = B.h / 2;
      glass.renderOrder = 4;
      const bottom = new THREE.Mesh(new THREE.CylinderGeometry(B.r + 0.2, B.r + 0.2, 0.6, seg), clear);
      bottom.position.y = 0.3;
      const capML = w0.params.beaker.overML;
      const hScale = capML / BEAKER_ML_PER_CM;
      const scale = new THREE.Mesh(new THREE.PlaneGeometry(2.2, hScale), own(new THREE.MeshBasicMaterial({ map: own(vScale(hScale, capML, 10, 100, true)), transparent: true, depthWrite: false })));
      scale.position.set(0, 0.6 + hScale / 2, B.r + 0.26);
      const water = new THREE.Mesh(new THREE.CylinderGeometry(B.r - 0.05, B.r - 0.05, 1, seg), waterMat);
      const lip = shadowed(new THREE.Mesh(new THREE.ConeGeometry(1.2, 1.6, 8, 1, true), clear));
      lip.position.set(B.r, B.h - 0.4, 0);
      lip.rotation.z = -Math.PI / 2;
      body.add(glass, bottom, scale, water, lip);
      body.add(at(hit(new THREE.CylinderGeometry(B.r + 0.6, B.r + 0.6, B.h, 12), id, 'body'), 0, B.h / 2, 0));
      body.add(at(hit(new THREE.BoxGeometry(2.4, 2.4, 3), id, 'empty'), B.r + 0.6, B.h - 0.6, 0));
      ring = selRing(B.r + 1.2);
      body.add(ring);
      update = (ctx) => {
        const L = beakerLevelCm(ctx.world);
        water.visible = L > 0.02;
        water.scale.y = Math.max(0.01, L);
        water.position.y = 0.6 + L / 2;
      };
      break;
    }
    case 'timer': {
      // Cronómetro de mesa: pantalla de centésimas y botones de marcha/parada y puesta a cero.
      const box = shadowed(new THREE.Mesh(new RoundedBoxGeometry(8, 5, 2.4, 2, 0.6), mats.plasticYellow));
      box.position.y = 2.5;
      box.rotation.x = -0.35;
      const { lcd, mesh } = lcdScreen(6.4, 2.4);
      mesh.position.set(0, 3, 1.25);
      mesh.rotation.x = -0.35;
      const bStart = button(0.7, green);
      bStart.position.set(-2, 5.3, -0.3);
      const bReset = button(0.7, red);
      bReset.position.set(2, 5.3, -0.3);
      body.add(box, mesh, bStart, bReset);
      body.add(at(hit(new THREE.BoxGeometry(8, 5, 3), id, 'body'), 0, 2.5, 0));
      body.add(at(hit(new THREE.BoxGeometry(2, 1.4, 2), id, 'start'), -2, 5.4, -0.3));
      body.add(at(hit(new THREE.BoxGeometry(2, 1.4, 2), id, 'reset'), 2, 5.4, -0.3));
      update = (ctx) => {
        const w = ctx.world;
        const t = timerValueF12(w);
        lcd.set(`${t.toFixed(2)} s`, w.timer.running ? '#f0c36e' : '#6ef09a', w.timer.running ? 'EN MARCHA' : 'DETENIDO');
      };
      break;
    }
    case 'panel': {
      // Panel vertical con tres sensores de 0–25 kPa (rótulo, piloto) y botón de calibración; las mangueras van de
      // cada sensor a la toma en la que está enchufado.
      const P = G.panel;
      const board = shadowed(new THREE.Mesh(new THREE.BoxGeometry(P.w, P.h, 1.2), mats.plasticWhite));
      board.position.y = P.h / 2;
      const legs = [-1, 1].map((s) => shadowed(at(new THREE.Mesh(new THREE.BoxGeometry(1.2, 1, P.d), mats.darkMetal), (s * P.w) / 2.2, 0.5, 0)));
      body.add(board, ...legs);
      const hoses: Record<SensorId, THREE.Mesh> = { 1: strand(hoseMat, 0.35), 2: strand(hoseMat, 0.35), 3: strand(hoseMat, 0.35) };
      const leds: Record<SensorId, THREE.Mesh> = {} as Record<SensorId, THREE.Mesh>;
      const ledOn = own(new THREE.MeshBasicMaterial({ color: 0x38e070 }));
      const ledBad = own(new THREE.MeshBasicMaterial({ color: 0xe0b030 }));
      const ledDmg = own(new THREE.MeshBasicMaterial({ color: 0xe04040 }));
      const ledOff = own(new THREE.MeshBasicMaterial({ color: 0x333333 }));
      for (const i of [1, 2, 3] as const) {
        const lx = SENSOR_X[i] - P.x;
        const s = shadowed(new THREE.Mesh(new RoundedBoxGeometry(7, 9, 3, 2, 0.6), mats.plasticBlue));
        s.position.set(lx, 32, 2);
        const tag = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), own(new THREE.MeshBasicMaterial({
          map: own(canvasTex(96, 48, (g) => {
            g.fillStyle = '#fff';
            g.fillRect(0, 0, 96, 48);
            g.fillStyle = '#13212e';
            g.font = 'bold 30px sans-serif';
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText(`S${i}`, 48, 26);
          })),
        })));
        tag.position.set(lx, 34, 3.55);
        const led = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), ledOff);
        led.position.set(lx + 2.4, 36, 3.55);
        leds[i] = led;
        const nozzle = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2, 10), brass));
        nozzle.position.set(lx, 26.6, 2);
        body.add(s, tag, led, nozzle);
        body.add(at(hit(new THREE.BoxGeometry(7.4, 12, 4), id, `s${i}`), lx, 31, 2));
      }
      const cal = button(1, mats.plasticYellow);
      cal.rotation.x = Math.PI / 2;
      cal.position.set(P.w / 2 - 3, 4, 0.9);
      body.add(cal, at(hit(new THREE.BoxGeometry(2.6, 2.6, 1.6), id, 'cal'), P.w / 2 - 3, 4, 1));
      body.add(at(hit(new THREE.BoxGeometry(P.w, P.h, 2), id, 'body'), 0, P.h / 2, 0));
      place = () => (placeRoom(P.x, P.y, 0), true);
      update = (ctx) => {
        const w = ctx.world;
        for (const i of [1, 2, 3] as const) {
          const s = w.sensors[i];
          hoses[i].visible = s.port !== null;
          if (s.port !== null) stretchC(hoses[i], v3({ x: SENSOR_X[i], y: P.y - 2, z: 25.6 }), v3(tapRoom(w, s.port)));
          setMat(leds[i], s.port === null ? ledOff : s.damaged ? ledDmg : s.zeroed && s.calibrated ? ledOn : ledBad);
        }
      };
      break;
    }
    case 'logger': {
      // Registrador de tres canales: pantalla con los canales en vivo (kPa) y botones de frecuencia, rango, modo,
      // cero, serie y lectura.
      const box = shadowed(new THREE.Mesh(new RoundedBoxGeometry(LOGGER.w, LOGGER.h, LOGGER.d, 2, 0.8), mats.blackPlastic));
      box.position.y = LOGGER.h / 2;
      const cv = document.createElement('canvas');
      cv.width = 320;
      cv.height = 160;
      const g2 = cv.getContext('2d')!;
      const tex = own(new THREE.CanvasTexture(cv));
      tex.colorSpace = THREE.SRGBColorSpace;
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), own(new THREE.MeshBasicMaterial({ map: tex })));
      screen.position.set(0, LOGGER.h * 0.62, LOGGER.d / 2 + 0.03);
      body.add(box, screen);
      const parts = ['rate', 'range', 'mode', 'zero', 'series', 'read'];
      parts.forEach((p, i) => {
        const b = button(0.8, p === 'read' ? green : p === 'zero' ? mats.plasticYellow : mats.plasticWhite);
        b.rotation.x = Math.PI / 2;
        b.position.set(-6.25 + i * 2.5, 1.6, LOGGER.d / 2 + 0.2);
        body.add(b, at(hit(new THREE.BoxGeometry(2.2, 2, 1.6), id, p), -6.25 + i * 2.5, 1.6, LOGGER.d / 2 + 0.4));
      });
      body.add(at(hit(new THREE.BoxGeometry(LOGGER.w, LOGGER.h, LOGGER.d), id, 'body'), 0, LOGGER.h / 2, 0));
      let last = '';
      place = () => (placeRoom(LOGGER.x, LOGGER.y, 0), true);
      update = (ctx) => {
        const w = ctx.world;
        const res = resKPaF12(w);
        const dec = Math.max(0, Math.round(-Math.log10(res) + 0.01));
        const lines = ([1, 2, 3] as const).map((i) => {
          const v = channelDisplayF12(w, i);
          return Number.isFinite(v) ? `${i}: ${v.toFixed(dec).padStart(7)} kPa` : `${i}:   ----`;
        });
        const foot = `${w.logger.rateHz} Hz · ${rangeKPaF12(w)} kPa · ${w.logger.mode === 'abs' ? 'ABS' : 'MAN'} · S${w.series.id} (${w.series.n})`;
        const key = lines.join('|') + foot;
        if (key === last) return;
        last = key;
        g2.fillStyle = '#0d1a12';
        g2.fillRect(0, 0, 320, 160);
        g2.fillStyle = '#6ef09a';
        g2.font = 'bold 30px Consolas, ui-monospace, monospace';
        g2.textBaseline = 'middle';
        lines.forEach((l, i) => g2.fillText(l, 12, 28 + i * 38));
        g2.fillStyle = '#8892a0';
        g2.font = '18px sans-serif';
        g2.fillText(foot, 12, 146);
        tex.needsUpdate = true;
      };
      break;
    }
    case 'ruler': {
      // Regla de cotas de 40 cm sobre su pie, junto a la toma 3 (cero en la mesada).
      const H = G.ruler.h;
      const face = new THREE.Mesh(new THREE.PlaneGeometry(2.6, H), own(new THREE.MeshBasicMaterial({ map: own(vScale(H, H, 0.1, 5)) })));
      face.position.set(0, H / 2, 0.4);
      const back = shadowed(new THREE.Mesh(new THREE.BoxGeometry(2.8, H, 0.6), mats.wood));
      back.position.y = H / 2;
      const foot = shadowed(new THREE.Mesh(new THREE.BoxGeometry(6, 0.8, 5), mats.darkMetal));
      foot.position.y = 0.4;
      body.add(face, back, foot, at(hit(new THREE.BoxGeometry(3.4, H, 2), id, 'scale'), 0, H / 2, 0));
      break;
    }
    case 'gaskets': {
      // Caja de empaquetaduras de repuesto.
      const box = shadowed(new THREE.Mesh(new THREE.BoxGeometry(8, 2.4, 6), mats.plasticWhite));
      box.position.y = 1.2;
      body.add(box);
      for (let i = 0; i < 4; i++) body.add(shadowed(at(new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.3, 8, 18).rotateX(Math.PI / 2), rubber), -2.4 + (i % 2) * 4.6, 2.6, -1.4 + Math.floor(i / 2) * 2.8)));
      body.add(at(hit(new THREE.BoxGeometry(8, 3.4, 6), id, 'body'), 0, 1.7, 0));
      break;
    }
    case 'spare': {
      // Tramo de repuesto en su soporte (el que no está montado).
      const sm = xTube(-15, 15, R1 + 0.3, clear);
      const rg = shadowed(xTube(-15, 15, R1 + 0.3, own(new THREE.MeshStandardMaterial({ color: 0x5c636b, roughness: 0.95 }))));
      const cradles = [-10, 10].map((x) => shadowed(at(new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.6, 6), mats.wood), x, -R1 - 0.9, 0)));
      const inner = new THREE.Group();
      inner.add(sm, rg, ...cradles);
      inner.position.y = R1 + 2.4;
      body.add(inner, at(hit(new THREE.BoxGeometry(30, 6, 6), id, 'body'), 0, 3, 0));
      update = (ctx) => {
        const rough = ctx.world.circuit.spool === 'smooth';
        rg.visible = rough;
        sm.visible = !rough;
      };
      break;
    }
    case 'caliper': {
      // Calibre digital apoyado: regla, mordazas, pantalla con la última medida y botón de mordazas interiores/exteriores.
      const bar = shadowed(new THREE.Mesh(new THREE.BoxGeometry(16, 0.4, 1.6), mats.chrome));
      bar.position.y = 0.6;
      const jaw = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 4), mats.chrome));
      jaw.position.set(-7.6, 0.6, -1.6);
      const slider = shadowed(new THREE.Mesh(new THREE.BoxGeometry(4, 1, 2.4), mats.blackPlastic));
      slider.position.set(-3, 0.8, 0);
      const { lcd, mesh } = lcdScreen(3, 1.3, 192, 80);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(-3, 1.33, 0.2);
      const face = button(0.4, mats.plasticYellow);
      face.position.set(-1.6, 1.3, -0.8);
      body.add(bar, jaw, slider, mesh, face);
      body.add(at(hit(new THREE.BoxGeometry(16, 1.6, 2), id, 'body'), 0, 0.8, 0));
      body.add(at(hit(new THREE.BoxGeometry(2, 1.4, 4.4), id, 'jaw'), -7.6, 0.8, -1.6));
      body.add(at(hit(new THREE.BoxGeometry(1.2, 1.2, 1.2), id, 'face'), -1.6, 1.4, -0.8));
      update = (ctx) => {
        const w = ctx.world;
        const lastId = [...w.readingOrder].reverse().find((rid) => w.readings[rid].kind === 'diameter');
        const r = lastId ? w.readings[lastId] : null;
        lcd.set(r ? `${(r.value * 10).toFixed(2)} mm` : '--.-- mm', '#6ef09a');
        slider.position.x = -3 + (r ? Math.min(6, r.value) : 0);
      };
      break;
    }
    case 'sample': {
      // Pieza de corte del Venturi: un anillo de la entrada (D1) y uno de la garganta (D2) para el calibre.
      const D1 = w0.params.D1 * 100;
      const D2 = w0.params.D2 * 100;
      const a = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(D1 / 2 + 0.3, D1 / 2 + 0.3, 2, seg, 1, true), mats.plasticWhite));
      a.position.set(-2.5, D1 / 2 + 0.3, 0);
      a.rotation.z = Math.PI / 2;
      const b = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(D2 / 2 + 0.3, D2 / 2 + 0.3, 2, seg, 1, true), mats.plasticWhite));
      b.position.set(2.5, D2 / 2 + 0.3, 0);
      b.rotation.z = Math.PI / 2;
      body.add(a, b, at(hit(new THREE.BoxGeometry(9, 5, 5), id, 'body'), 0, 2.5, 0));
      break;
    }
    case 'pitot': {
      // Sonda de Pitot (tubito doblado) en su estuche.
      const tray = shadowed(new THREE.Mesh(new THREE.BoxGeometry(7, 0.8, 3), mats.blackPlastic));
      tray.position.y = 0.4;
      const tube = shadowed(new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.2, 6, 12, Math.PI / 2), mats.steel));
      tube.position.set(0, 1.1, 0);
      tube.rotation.x = -Math.PI / 2;
      const leg = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 4, 8), mats.steel));
      leg.rotation.z = Math.PI / 2;
      leg.position.set(-1.4, 1.1, -1.4);
      body.add(tray, tube, leg, at(hit(new THREE.BoxGeometry(7, 2.4, 3.4), id, 'body'), 0, 1.2, 0));
      update = (ctx) => {
        const used = ([1, 2, 3] as const).some((p) => ctx.world.ports[p].probe === 'pitot');
        tube.visible = leg.visible = !used;
      };
      break;
    }
    case 'stopper': {
      // Tapón de goma: sobre la mesada (si quedó dentro del tubo se ve en la garganta del Venturi).
      const cone = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, 2.2, 14), rubber));
      cone.position.y = 1.1;
      body.add(cone, at(hit(new THREE.CylinderGeometry(1.6, 1.6, 2.6, 10), id, 'body'), 0, 1.3, 0));
      update = (ctx) => {
        body.visible = ctx.world.stopper === 'bench';
      };
      break;
    }
    case 'towel': {
      const t = shadowed(new THREE.Mesh(new RoundedBoxGeometry(14, 1.2, 9, 2, 0.4), own(new THREE.MeshStandardMaterial({ color: 0x5aa3d9, roughness: 1 }))));
      t.position.y = 0.6;
      body.add(t, at(hit(new THREE.BoxGeometry(14, 2, 9), id, 'body'), 0, 1, 0));
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

  // Caños, mangueras, chorros y charcos viven en la sala, no dentro del grupo del objeto.
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

export { homeOf };
