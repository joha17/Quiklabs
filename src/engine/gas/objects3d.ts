/**
 * Vistas 3D procedurales de la Práctica 10: balanza analítica con cabina y puertas, vidrio de reloj con NaHCO₃,
 * espátula, frasco, beakers, embudo, balón aforado con su marca y menisco, pipeta volumétrica con propipeta, piseta,
 * botellas, probeta de 25 mL, Erlenmeyer con burbujas y espuma, tapón, baño de 600 mL, bureta invertida con su escala
 * (50 arriba, 0 abajo), gas y agua, soporte con prensa, tubo en U, termómetro digital, barómetro, regla, sensor de
 * presión, interfaz con pantalla y jeringa con émbolo. SOLO leen el estado; no deciden nada.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { P10Object, P10World } from '../../simulation/gas-world/types';
import { GEO10 } from '../../simulation/gas-world/geometry';
import { solveBurette } from '../../simulation/gas-world/world';
import { sensorReading } from '../../simulation/instruments/pressure-sensor';
import { displayedBalance } from '../../simulation/instruments/analytical-balance';
import type { QualityLevel } from '../quality';
import { materials } from '../renderers/materials';
import { graduationTexture, labelTexture, lcdTexture } from '../renderers/textures';
import type { FrameCtx10 } from './GasLab3D';
import { VIS, buretteZ, cylinderLevelZ, flaskLevelZ } from './layout';

export interface ObjHandle10 {
  group: THREE.Group;
  update(ctx: FrameCtx10, o: P10Object): void;
  dispose(): void;
}

const hitMat = () => materials('LOW').hit;

function hit(geo: THREE.BufferGeometry, objId: string, part?: string): THREE.Mesh {
  const m = new THREE.Mesh(geo, hitMat());
  m.userData = { objId, part };
  return m;
}

function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T {
  o.position.set(x, y, z);
  return o;
}

function shadowed<T extends THREE.Object3D>(o: T, receive = true): T {
  o.traverse((c) => {
    (c as THREE.Mesh).castShadow = true;
    (c as THREE.Mesh).receiveShadow = receive;
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

const WATER = 0x8fc2e6;
const VINEGAR = 0xf3e7c8;
const POWDER = 0xf7f7f2;

/** Columna de líquido dentro de un cilindro, con menisco cóncavo opcional. */
function liquidColumn(r: number, seg: number, own: <T extends THREE.Material>(m: T) => T, color = WATER, meniscus = false) {
  const mat = own(new THREE.MeshPhysicalMaterial({ color, roughness: 0.05, transparent: true, opacity: 0.55, depthWrite: false }));
  const col = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, seg), mat);
  col.renderOrder = 2;
  const g = new THREE.Group();
  g.add(col);
  let men: THREE.Mesh | null = null;
  if (meniscus) {
    men = new THREE.Mesh(new THREE.TorusGeometry(r * 0.96, Math.max(0.03, r * 0.07), 6, seg), own(new THREE.MeshBasicMaterial({ color: 0x3f7fb2, transparent: true, opacity: 0.8 })));
    men.rotation.x = Math.PI / 2;
    g.add(men);
  }
  return {
    group: g,
    mat,
    set(h: number, floor: number) {
      g.visible = h > 0.02;
      col.scale.y = Math.max(0.001, h);
      col.position.y = floor + h / 2;
      if (men) men.position.y = floor + h + r * 0.03;
    },
  };
}

/** Marca de aforo: anillo fino alrededor de un cuello. */
function ringMark(r: number, own: <T extends THREE.Material>(m: T) => T) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 6, 32), own(new THREE.MeshBasicMaterial({ color: 0x0b2c4d })));
  m.rotation.x = Math.PI / 2;
  return m;
}

export function createObjVisual10(o: P10Object, w0: P10World, q: QualityLevel): ObjHandle10 {
  const mats = materials(q);
  const seg = q === 'LOW' ? 16 : q === 'MEDIUM' ? 28 : 40;
  const group = new THREE.Group();
  const disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];
  let ring: THREE.Mesh | null = null;
  let update: ObjHandle10['update'] = () => undefined;
  const id = o.id;
  const own = <T extends THREE.Material | THREE.Texture>(m: T): T => {
    disposables.push(m);
    return m;
  };
  /** Las vasijas se inclinan al verter (giro en el plano frontal). */
  const tiltable = new THREE.Group();
  group.add(tiltable);

  switch (o.kind) {
    case 'abalance': {
      // Balanza analítica: base, cabina de vidrio con puertas corredizas, platillo, nivel de burbuja y pantalla.
      const body = shadowed(new THREE.Mesh(new RoundedBoxGeometry(22, 4, 26, 2, 0.6), own(new THREE.MeshStandardMaterial({ color: 0xeef0f2, roughness: 0.5 }))));
      body.position.set(0, 2, 0);
      const back = shadowed(new THREE.Mesh(new THREE.BoxGeometry(22, 18, 2), own(new THREE.MeshStandardMaterial({ color: 0xdfe3e7, roughness: 0.5 }))));
      back.position.set(0, 13, -12);
      const glassMat = own(new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, roughness: 0.03, depthWrite: false, side: THREE.DoubleSide }));
      const roof = new THREE.Mesh(new THREE.BoxGeometry(20, 0.3, 22), glassMat);
      roof.position.set(0, 22, -0.5);
      const front = new THREE.Mesh(new THREE.BoxGeometry(20, 17.6, 0.3), glassMat);
      front.position.set(0, 13, 10.5);
      const doorL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 17.6, 21), glassMat);
      const doorR = doorL.clone();
      const frameMat = own(new THREE.MeshStandardMaterial({ color: 0xb8c0c8, metalness: 0.5, roughness: 0.4 }));
      const handleL = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3, 0.6), frameMat);
      const handleR = handleL.clone();
      const pan = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 0.3, seg), mats.steel));
      pan.position.set(0, 7.3, -2);
      const lcd = lcdTexture(320, 80);
      own(lcd.texture);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.2), own(new THREE.MeshBasicMaterial({ map: lcd.texture })));
      screen.position.set(0, 2.3, 13.05);
      const bubble = new THREE.Mesh(new THREE.CircleGeometry(0.9, 20), own(new THREE.MeshBasicMaterial({ color: 0x9fe0b0 })));
      bubble.rotation.x = -Math.PI / 2;
      bubble.position.set(8.5, 4.05, 10);
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.28, 12), own(new THREE.MeshBasicMaterial({ color: 0x1e5631 })));
      dot.rotation.x = -Math.PI / 2;
      const tareBtn = shadowed(new THREE.Mesh(new RoundedBoxGeometry(2.4, 0.6, 1.4, 2, 0.2), mats.plasticBlue));
      tareBtn.position.set(-8, 4.1, 12);
      const lbl = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.4), own(new THREE.MeshStandardMaterial({ map: own(labelTexture(['TARA  →0←'], { band: '#2f7fd1', w: 192, h: 48 })) })));
      lbl.position.set(-8, 1.4, 13.05);
      group.add(body, back, roof, front, doorL, doorR, handleL, handleR, pan, screen, bubble, dot, tareBtn, lbl);
      group.add(at(hit(new THREE.BoxGeometry(22, 18, 4), id, 'doors'), 0, 13, 9));
      group.add(at(hit(new THREE.BoxGeometry(4, 1.6, 3), id, 'tare'), -8, 4.2, 12));
      group.add(at(hit(new THREE.BoxGeometry(3, 1, 3), id, 'level'), 8.5, 4.2, 10));
      group.add(at(hit(new THREE.BoxGeometry(10, 3, 1.2), id, 'display'), 0, 2.3, 13));
      group.add(at(hit(new THREE.BoxGeometry(22, 4, 26), id), 0, 2, 0));
      ring = selRing(14);
      group.add(ring);
      update = (ctx) => {
        const w = ctx.world;
        const b = w.balance;
        const open = b.doorsOpen ? 1 : 0;
        // Puertas laterales: corridas hacia atrás cuando están abiertas.
        doorL.position.set(-10.2, 13, -0.5 - open * 14);
        doorR.position.set(10.2, 13, -0.5 - open * 14);
        handleL.position.set(-10.5, 13, 9 - open * 14);
        handleR.position.set(10.5, 13, 9 - open * 14);
        const load = w.balance.panObjectId ? 1 : 0;
        void load;
        const shown = displayedBalance(b, w.params.balance, 0);
        const dec = w.params.balance.resolutionG < 0.001 ? 4 : 3;
        lcd.set(Number.isFinite(shown) ? shown.toFixed(dec) : '------', b.stable && !b.doorsOpen ? '#6ef08a' : '#f0c36e', b.stable && !b.doorsOpen ? 'g  ●' : 'g  ~');
        // Burbuja del nivel desplazada con el desnivel.
        dot.position.set(8.5 + Math.min(0.6, b.levelErrorDeg * 0.22), 4.07, 10);
      };
      break;
    }

    case 'watchGlass': {
      const dish = shadowed(new THREE.Mesh(new THREE.SphereGeometry(4, seg, 8, 0, Math.PI * 2, Math.PI * 0.82, Math.PI * 0.18), mats.glass));
      dish.rotation.x = Math.PI;
      dish.position.y = 4;
      const heap = new THREE.Mesh(new THREE.ConeGeometry(1.4, 0.6, 16), own(new THREE.MeshStandardMaterial({ color: POWDER, roughness: 0.95 })));
      heap.position.y = 0.55;
      const wet = new THREE.Mesh(new THREE.CircleGeometry(2.5, 20), own(new THREE.MeshBasicMaterial({ color: 0xa8d0ee, transparent: true, opacity: 0.4 })));
      wet.rotation.x = -Math.PI / 2;
      wet.position.y = 0.3;
      group.add(dish, heap, wet);
      group.add(at(hit(new THREE.CylinderGeometry(4.2, 4.2, 1.4, 12), id), 0, 0.6, 0));
      ring = selRing(4.6);
      group.add(ring);
      update = (ctx) => {
        const g = ctx.world.solids.watchGlassG;
        heap.visible = g > 0.002;
        const s = Math.cbrt(Math.max(0.002, g) / 0.5);
        heap.scale.set(s, s, s);
        wet.visible = ctx.world.solids.watchGlassWetG > 0.002;
      };
      break;
    }

    case 'spatula': {
      const inner = new THREE.Group();
      const blade = shadowed(new THREE.Mesh(new RoundedBoxGeometry(7, 0.12, 1.3, 2, 0.05), mats.steel));
      blade.position.set(4.5, 0.1, 0);
      const spoon = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.75, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mats.steel));
      spoon.scale.set(1.3, 0.35, 1);
      spoon.position.set(8.4, 0.18, 0);
      const handle = shadowed(new THREE.Mesh(new RoundedBoxGeometry(8, 0.7, 1.1, 2, 0.25), mats.wood));
      handle.position.set(-3, 0.35, 0);
      const load = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 6), own(new THREE.MeshStandardMaterial({ color: POWDER, roughness: 0.95 })));
      load.scale.set(1.2, 0.5, 0.9);
      load.position.set(8.4, 0.4, 0);
      inner.add(blade, spoon, handle, load);
      inner.add(at(hit(new THREE.BoxGeometry(18, 1.8, 2.2), id), 1.5, 0.4, 0));
      group.add(inner);
      update = (ctx) => {
        load.visible = ctx.world.solids.spatulaG > 0.002;
      };
      break;
    }

    case 'bicarbJar': {
      const jarMat = own(new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.35, depthWrite: false }));
      const jar = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 8, seg, 1, true), jarMat);
      jar.position.y = 4;
      const heap = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 3.6, seg), own(new THREE.MeshStandardMaterial({ color: POWDER, roughness: 0.95 }))));
      heap.position.y = 1.8;
      const cap = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.3, 1, seg), mats.plasticBlue));
      cap.position.set(5, 0.5, 2);
      const lbl = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 2.4), own(new THREE.MeshStandardMaterial({ map: own(labelTexture(['NaHCO₃', 'bicarbonato de sodio'], { band: '#2f7fd1', w: 256, h: 96 })) })));
      lbl.position.set(0, 5.6, 3.25);
      group.add(jar, heap, cap, lbl);
      group.add(at(hit(new THREE.CylinderGeometry(3.6, 3.6, 8.5, 10), id), 0, 4.2, 0));
      break;
    }

    case 'beaker150':
    case 'beaker600': {
      const big = o.kind === 'beaker600';
      const G = big ? VIS.beaker600 : VIS.beaker150;
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(G.r + 0.15, G.r + 0.15, G.h, seg, 1, true), mats.glass);
      glass.position.y = G.h / 2;
      glass.renderOrder = 3;
      const bottom = new THREE.Mesh(new THREE.CircleGeometry(G.r + 0.15, seg), mats.glass);
      bottom.rotation.x = -Math.PI / 2;
      bottom.position.y = 0.05;
      const lip = new THREE.Mesh(new THREE.TorusGeometry(G.r + 0.15, 0.12, 6, seg), mats.glass);
      lip.rotation.x = Math.PI / 2;
      lip.position.y = G.h;
      const marks: Array<[number, boolean, string?]> = [];
      const cap = big ? 600 : 150;
      const step = big ? 100 : 25;
      for (let ml = step; ml <= cap; ml += step) marks.push([(ml / (Math.PI * G.r * G.r)) / G.h, true, String(ml)]);
      const tex = own(graduationTexture(marks, '#ffffff', { sub: `${cap} mL` }));
      const scale = new THREE.Mesh(new THREE.CylinderGeometry(G.r + 0.17, G.r + 0.17, G.h - G.floor, seg, 1, true, -0.25, 0.5), own(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })));
      scale.position.y = G.floor + (G.h - G.floor) / 2;
      const liquid = liquidColumn(G.r, seg, own, WATER);
      const solid = new THREE.Mesh(new THREE.CylinderGeometry(G.r * 0.7, G.r * 0.75, 0.25, seg), own(new THREE.MeshStandardMaterial({ color: POWDER, roughness: 0.95 })));
      solid.position.y = G.floor + 0.12;
      tiltable.add(glass, bottom, lip, scale, liquid.group, solid);
      tiltable.add(at(hit(new THREE.CylinderGeometry(G.r + 0.4, G.r + 0.4, G.h, 12), id), 0, G.h / 2, 0));
      ring = selRing(G.r + 1);
      group.add(ring);
      update = (ctx) => {
        const v = ctx.world.liquids[id];
        const area = Math.PI * G.r * G.r - (id === 'beaker600' && ctx.world.burette.inverted ? GEO10.burette.outerAreaCm2 : 0);
        liquid.set(Math.min(G.h - G.floor, v.ml / area), G.floor);
        solid.visible = v.solidBicarbG > 0.005;
        liquid.mat.color.setHex(v.nAcid > 1e-5 || v.nAcetate > 1e-5 ? VINEGAR : WATER);
      };
      break;
    }

    case 'funnel': {
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(3, 0.35, 4, seg, 1, true), mats.glass);
      cone.position.y = 5;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.3, 4.5, 10, 1, true), mats.glass);
      stem.position.y = 0.75;
      tiltable.add(cone, stem);
      tiltable.add(at(hit(new THREE.CylinderGeometry(3, 1, 7, 12), id), 0, 4, 0));
      update = (_ctx, ob) => {
        tiltable.rotation.set(0, 0, ob.support === 'bench' ? Math.PI / 2 : 0);
        tiltable.position.set(ob.support === 'bench' ? 4 : 0, ob.support === 'bench' ? 3 : 0, 0);
      };
      break;
    }

    case 'flask': {
      const F = VIS.flask;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(F.bulbR, seg, 16), mats.glass);
      bulb.position.y = F.bulbZ;
      bulb.scale.y = 0.95;
      const base = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2, 0.3, seg), mats.glass));
      base.position.y = 0.15;
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(F.neckR + 0.12, F.neckR + 0.12, F.neckZ1 - F.neckZ0, seg, 1, true), mats.glass);
      neck.position.y = (F.neckZ0 + F.neckZ1) / 2;
      const mark = ringMark(F.neckR + 0.13, own);
      mark.position.y = F.markZ;
      const lbl = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.4), own(new THREE.MeshStandardMaterial({ map: own(labelTexture([`${w0.params.flaskMl.toFixed(2).replace('.', ',')} mL`, 'TC 20 °C · A'], { band: '#123a63', w: 192, h: 96 })) })));
      lbl.position.set(0, F.bulbZ, F.bulbR + 0.05);
      const stopper = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.6, 1.4, 12), mats.plasticBlue));
      stopper.position.y = F.neckZ1 + 0.4;
      // Líquido: bulbo (esfera recortada por su altura) + columna en el cuello con menisco.
      const liqMat = own(new THREE.MeshPhysicalMaterial({ color: WATER, roughness: 0.05, transparent: true, opacity: 0.55, depthWrite: false }));
      const bulbLiq = new THREE.Mesh(new THREE.SphereGeometry(F.bulbR - 0.1, seg, 16), liqMat);
      bulbLiq.position.y = F.bulbZ;
      const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
      liqMat.clippingPlanes = [clip];
      const neckLiq = liquidColumn(F.neckR, seg, own, WATER, true);
      tiltable.add(bulb, base, neck, mark, lbl, stopper, bulbLiq, neckLiq.group);
      tiltable.add(at(hit(new THREE.CylinderGeometry(3.2, 3.2, F.neckZ1, 12), id), 0, F.neckZ1 / 2, 0));
      ring = selRing(3.6);
      group.add(ring);
      const wp = new THREE.Vector3();
      update = (ctx, ob) => {
        const w = ctx.world;
        const zLevel = flaskLevelZ(w) - ob.pose.z;
        stopper.visible = w.flask.stoppered;
        // Plano de recorte en coordenadas del mundo (la escena: y = altura).
        group.getWorldPosition(wp);
        clip.constant = wp.y + Math.min(zLevel, F.neckZ0 + 0.2);
        bulbLiq.visible = w.liquids.flask.ml > 0.5 && ob.pose.rotationRad === 0;
        if (zLevel > F.neckZ0) neckLiq.set(zLevel - F.neckZ0, F.neckZ0);
        else neckLiq.set(0, F.neckZ0);
      };
      break;
    }

    case 'pipette': {
      const P = VIS.pipette;
      const inner = new THREE.Group();
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.05, P.tipLen, 8, 1, true), mats.glass);
      tip.position.y = P.tipLen / 2;
      const bulb = new THREE.Mesh(new THREE.CylinderGeometry(P.bulbR, P.bulbR, P.bulbZ1 - P.bulbZ0, seg, 1, true), mats.glass);
      bulb.position.y = (P.bulbZ0 + P.bulbZ1) / 2;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(P.stemR, P.stemR, P.topZ - P.bulbZ1, 8, 1, true), mats.glass);
      stem.position.y = (P.bulbZ1 + P.topZ) / 2;
      const mark = ringMark(P.stemR + 0.02, own);
      mark.position.y = P.markZ;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(P.stemR + 0.03, P.stemR + 0.03, 1.2, 8, 1, true), own(new THREE.MeshBasicMaterial({ color: 0xd4a017 })));
      band.position.y = P.topZ - 3;
      const liqMat = own(new THREE.MeshPhysicalMaterial({ color: WATER, roughness: 0.05, transparent: true, opacity: 0.6, depthWrite: false }));
      const liqBulb = new THREE.Mesh(new THREE.CylinderGeometry(P.bulbR - 0.08, P.bulbR - 0.08, P.bulbZ1 - P.bulbZ0, seg), liqMat);
      liqBulb.position.y = (P.bulbZ0 + P.bulbZ1) / 2;
      const liqTip = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.04, P.tipLen, 6), liqMat);
      liqTip.position.y = P.tipLen / 2;
      const liqStem = new THREE.Mesh(new THREE.CylinderGeometry(P.stemR - 0.03, P.stemR - 0.03, 1, 6), liqMat);
      inner.add(tip, bulb, stem, mark, band, liqBulb, liqTip, liqStem);
      inner.add(at(hit(new THREE.CylinderGeometry(1.2, 1.2, P.topZ, 8), id), 0, P.topZ / 2, 0));
      group.add(inner);
      update = (ctx, ob) => {
        const pp = ctx.world.pipette;
        const lying = ob.support === 'bench';
        inner.rotation.set(0, 0, lying ? Math.PI / 2 : 0);
        inner.position.set(lying ? P.topZ / 2 : 0, lying ? 1 : 0, 0);
        const full = pp.ml > 0.5;
        liqBulb.visible = full;
        liqTip.visible = full;
        const top = P.markZ + Math.max(-6, Math.min(8, pp.aboveMarkMl / GEO10.pipette.stemAreaCm2 / 10));
        liqStem.visible = full && top > P.bulbZ1;
        liqStem.scale.y = Math.max(0.01, top - P.bulbZ1);
        liqStem.position.y = (P.bulbZ1 + top) / 2;
      };
      break;
    }

    case 'propipette': {
      const bulbG = shadowed(new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 12), mats.rubberRed));
      bulbG.position.y = 2.6;
      const valve = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2, 10), mats.rubberRed));
      valve.position.y = 0.6;
      group.add(bulbG, valve);
      group.add(at(hit(new THREE.SphereGeometry(2, 8, 6), id), 0, 2.4, 0));
      break;
    }

    case 'washBottle': {
      const body = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(3, 3.2, 12, seg), mats.plasticWhite));
      body.position.y = 6;
      const capM = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 1.2, 12), mats.plasticBlue));
      capM.position.y = 12.6;
      const tube = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 7, 8), mats.plasticWhite));
      tube.position.set(1.8, 15.2, 0);
      tube.rotation.z = -0.7;
      const lbl = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), own(new THREE.MeshStandardMaterial({ map: own(labelTexture(['H₂O', 'destilada'], { band: '#2f7fd1', w: 128, h: 64 })) })));
      lbl.position.set(0, 6, 3.12);
      group.add(body, capM, tube, lbl);
      group.add(at(hit(new THREE.CylinderGeometry(3.6, 3.6, 15, 10), id), 0, 7.5, 0));
      break;
    }

    case 'waterBottle':
    case 'vinegarBottle': {
      const vin = o.kind === 'vinegarBottle';
      const tap = id === 'tap_jug';
      const r = vin ? 3.6 : tap ? 5.5 : 4.6;
      const h = vin ? 18 : 22;
      const plastic = own(new THREE.MeshPhysicalMaterial({ color: vin ? 0xfff6e2 : 0xe8f1f8, roughness: 0.2, transparent: true, opacity: 0.45, depthWrite: false }));
      const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h * 0.8, seg, 1, true), plastic);
      body.position.y = h * 0.4;
      const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(1.4, r, h * 0.15, seg, 1, true), plastic);
      shoulder.position.y = h * 0.875;
      const cap = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 1.3, 16), vin ? mats.rubberRed : mats.plasticBlue));
      cap.position.y = h * 0.95 + 0.6;
      const liquid = liquidColumn(r - 0.1, seg, own, vin ? VINEGAR : WATER);
      const p = w0.params;
      const lines = vin ? ['Vinagre', `ác. acético ${p.vinegar.percent.toFixed(1).replace('.', ',')} % ${p.vinegar.basis}`] : tap ? ['Agua', 'del grifo (baño)'] : ['H₂O', 'agua destilada'];
      const lbl = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.03, r + 0.03, 5.5, seg, 1, true, -0.7, 1.4), own(new THREE.MeshStandardMaterial({ map: own(labelTexture(lines, { band: vin ? '#a0522d' : tap ? '#607080' : '#2f7fd1', w: 256, h: 96 })), roughness: 0.7 })));
      lbl.position.y = h * 0.45;
      tiltable.add(body, shoulder, cap, liquid.group, lbl);
      tiltable.add(at(hit(new THREE.CylinderGeometry(r + 0.3, r + 0.3, h, 10), id), 0, h / 2, 0));
      update = (ctx) => {
        const v = ctx.world.liquids[id];
        liquid.set(Math.min(h * 0.8, v.ml / (Math.PI * (r - 0.1) ** 2)), 0.4);
      };
      break;
    }

    case 'cylinder': {
      const G = VIS.cylinder;
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(G.r + 0.12, G.r + 0.12, G.h + G.floor, seg, 1, true), mats.glass);
      glass.position.y = (G.h + G.floor) / 2;
      glass.renderOrder = 3;
      const base = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(G.baseR, G.baseR + 0.2, 0.8, 6), mats.glass));
      base.position.y = 0.4;
      const marks: Array<[number, boolean, string?]> = [];
      const hFor = (ml: number) => ml / GEO10.cylinder.areaCm2 / G.h;
      for (let ml = 0; ml <= 25; ml += 0.5) marks.push([hFor(ml) * 0.98 + 0.01, ml % 5 === 0, ml % 5 === 0 ? String(ml) : undefined]);
      const tex = own(graduationTexture(marks, '#123a63', { sub: '25 mL · 20 °C' }));
      const scale = new THREE.Mesh(new THREE.CylinderGeometry(G.r + 0.14, G.r + 0.14, G.h, seg, 1, true, -Math.PI * 0.2, Math.PI * 0.4), own(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })));
      scale.position.y = G.floor + G.h / 2;
      const liquid = liquidColumn(G.r, seg, own, VINEGAR, true);
      tiltable.add(glass, base, scale, liquid.group);
      tiltable.add(at(hit(new THREE.CylinderGeometry(G.baseR, G.baseR, G.h + 1.5, 10), id), 0, (G.h + 1.5) / 2, 0));
      ring = selRing(G.baseR + 0.6);
      group.add(ring);
      update = (ctx, ob) => {
        liquid.set(cylinderLevelZ(ctx.world) - ob.pose.z - G.floor, G.floor);
      };
      break;
    }

    case 'erlenmeyer': {
      const E = VIS.erlen;
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(E.mouthR + 0.15, E.baseR, E.neckZ, seg, 1, true), mats.glass);
      cone.position.y = E.neckZ / 2;
      cone.renderOrder = 3;
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(E.mouthR + 0.15, E.mouthR + 0.15, E.mouthZ - E.neckZ, seg, 1, true), mats.glass);
      neck.position.y = (E.neckZ + E.mouthZ) / 2;
      const bottom = new THREE.Mesh(new THREE.CircleGeometry(E.baseR, seg), mats.glass);
      bottom.rotation.x = -Math.PI / 2;
      bottom.position.y = 0.05;
      const liqMat = own(new THREE.MeshPhysicalMaterial({ color: WATER, roughness: 0.05, transparent: true, opacity: 0.55, depthWrite: false }));
      const liq = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, seg), liqMat);
      const foamM = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, seg), own(new THREE.MeshStandardMaterial({ color: 0xfbfbf6, roughness: 0.95, transparent: true, opacity: 0.85 })));
      const bubbles = new THREE.Group();
      const bubMat = own(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }));
      for (let i = 0; i < 14; i++) bubbles.add(new THREE.Mesh(new THREE.SphereGeometry(0.12 + (i % 3) * 0.05, 6, 4), bubMat));
      const lbl = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.2), own(new THREE.MeshStandardMaterial({ map: own(labelTexture(['250 mL'], { band: '#123a63', w: 128, h: 48 })) })));
      lbl.position.set(0, 4, E.baseR * 0.75 + 0.2);
      lbl.rotation.x = -0.28;
      tiltable.add(cone, neck, bottom, liq, foamM, bubbles, lbl);
      tiltable.add(at(hit(new THREE.CylinderGeometry(E.baseR, E.baseR, E.mouthZ, 12), id), 0, E.mouthZ / 2, 0));
      ring = selRing(E.baseR + 0.8);
      group.add(ring);
      let phase = 0;
      let lastH = -1;
      update = (ctx) => {
        const w = ctx.world;
        const v = w.liquids.erlenmeyer;
        // Nivel en el cono: volumen ≈ π/3·h·(R² + R·r + r²) con r lineal en h.
        const h = Math.min(E.neckZ, Math.max(0, v.ml / (Math.PI * E.baseR * E.baseR * 0.85)));
        const rTop = E.baseR - ((E.baseR - E.mouthR) * h) / E.neckZ;
        liq.visible = v.ml > 0.5;
        if (Math.abs(h - lastH) > 0.02) {
          lastH = h;
          liq.geometry.dispose();
          liq.geometry = new THREE.CylinderGeometry(rTop - 0.08, E.baseR - 0.08, Math.max(0.05, h), seg);
        }
        liq.position.y = h / 2;
        liqMat.color.setHex(v.nAcid > 1e-5 || v.nAcetate > 1e-5 ? VINEGAR : WATER);
        const foam = Math.min(4, w.reactor.foam * 1.5);
        foamM.visible = foam > 0.05 && v.ml > 0.5;
        foamM.scale.set(rTop - 0.1, foam, rTop - 0.1);
        foamM.position.y = h + foam / 2;
        // Burbujas: solo mientras se genera CO₂ (la efervescencia es real, no decorativa).
        const fizz = v.nAcid > 1e-7 && v.nBicarb > 1e-7;
        bubbles.visible = fizz && !ctx.reducedMotion;
        phase += ctx.dt * (2 + 6 * w.reactor.stir);
        bubbles.children.forEach((b, i) => {
          const u = (phase * 0.6 + i / 14) % 1;
          b.position.set(Math.cos(i * 2.3) * (E.baseR - 1) * (1 - u * 0.4), u * h, Math.sin(i * 2.3) * (E.baseR - 1) * (1 - u * 0.4));
        });
      };
      break;
    }

    case 'stopper': {
      const plug = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.25, 2.6, 16), mats.rubberRed));
      plug.position.y = 1.3;
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 4.2, 8, 1, true), mats.glass);
      tube.position.y = 3.2;
      group.add(plug, tube);
      group.add(at(hit(new THREE.CylinderGeometry(1.9, 1.9, 4, 10), id), 0, 2, 0));
      update = (_ctx, ob) => {
        plug.rotation.set(ob.support === 'bench' ? Math.PI / 2 : 0, 0, 0);
      };
      break;
    }

    case 'burette': {
      // Bureta de 50 mL: tubo con escala, llave y boca. Invertida en el baño: llave arriba, boca bajo el agua.
      const B = VIS.burette;
      const total = (w0.burette.topUngraduatedMl + GEO10.burette.gradMl + w0.burette.mouthUngraduatedMl) / GEO10.burette.areaCm2;
      const inner = new THREE.Group();
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(B.outerR, B.outerR, total, seg, 1, true), mats.glass);
      tube.position.y = total / 2;
      tube.renderOrder = 4;
      // Escala impresa: 0 en el extremo de la boca, 50 hacia la llave (al invertirla queda 50 arriba).
      const marks: Array<[number, boolean, string?]> = [];
      const gradLen = GEO10.burette.gradMl / GEO10.burette.areaCm2;
      for (let ml = 0; ml <= 50; ml += 1) marks.push([ml / 50, ml % 5 === 0, ml % 5 === 0 ? String(ml) : undefined]);
      const tex = own(graduationTexture(marks, '#0b2c4d'));
      const scale = new THREE.Mesh(new THREE.CylinderGeometry(B.outerR + 0.02, B.outerR + 0.02, gradLen, seg, 1, true, -0.6, 1.2), own(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })));
      const mouthLen = w0.burette.mouthUngraduatedMl / GEO10.burette.areaCm2;
      scale.position.y = mouthLen + gradLen / 2;
      const cock = new THREE.Group();
      const cockBody = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2.2, 10), mats.glass));
      const key = shadowed(new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 0.5), mats.plasticBlue));
      key.position.y = 0.3;
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.12, 2.4, 8, 1, true), mats.glass);
      nozzle.position.y = 2;
      cock.add(cockBody, key, nozzle);
      cock.position.y = total + 1;
      const waterMat = own(new THREE.MeshPhysicalMaterial({ color: WATER, roughness: 0.05, transparent: true, opacity: 0.5, depthWrite: false }));
      const water = new THREE.Mesh(new THREE.CylinderGeometry(B.r, B.r, 1, 12), waterMat);
      const men = new THREE.Mesh(new THREE.TorusGeometry(B.r * 0.95, 0.06, 6, 16), own(new THREE.MeshBasicMaterial({ color: 0x1f5a8a })));
      men.rotation.x = Math.PI / 2;
      inner.add(tube, scale, cock, water, men);
      inner.add(at(hit(new THREE.CylinderGeometry(1.2, 1.2, total, 8), id), 0, total / 2, 0));
      inner.add(at(hit(new THREE.BoxGeometry(3, 2.6, 1.6), id, 'stopcock'), 0, total + 1, 0));
      group.add(inner);
      update = (ctx, ob) => {
        const w = ctx.world;
        const b = w.burette;
        key.rotation.y = b.stopcockOpen ? Math.PI / 2 : 0;
        if (!b.inverted) {
          // Derecha o acostada: la boca abajo es el extremo superior (llave abajo al invertir).
          const lying = ob.support === 'bench' || ob.pose.rotationRad !== 0;
          inner.rotation.set(0, 0, lying ? Math.PI / 2 : Math.PI);
          inner.position.set(lying ? total / 2 : 0, lying ? 0.8 : total + 2, 0);
          const wl = b.waterMl / GEO10.burette.areaCm2;
          water.visible = wl > 0.05;
          water.scale.y = Math.max(0.01, wl);
          // El agua llena desde el lado de la llave.
          water.position.y = total - wl / 2;
          men.visible = water.visible && wl < total - 0.05;
          men.position.y = total - wl;
          return;
        }
        inner.rotation.set(0, 0, 0);
        const z = buretteZ(w);
        inner.position.set(0, z.mouth, 0);
        // Agua desde la boca hasta el menisco interno; arriba, el gas.
        const s = solveBurette(w);
        const wl = Math.max(0, total - s.gasMl / GEO10.burette.areaCm2);
        water.visible = wl > 0.02;
        water.scale.y = Math.max(0.01, wl);
        water.position.y = wl / 2;
        men.visible = wl > 0.02 && wl < total - 0.02;
        men.position.y = wl - 0.05;
        inner.rotation.z = (b.tiltDeg * Math.PI) / 180;
      };
      break;
    }

    case 'stand': {
      const base = shadowed(new THREE.Mesh(new RoundedBoxGeometry(14, 1.2, 10, 2, 0.3), mats.darkMetal));
      base.position.set(0, 0.6, 2);
      const rod = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 78, 12), mats.steel));
      rod.position.set(-4, 39, 0);
      const arm = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 12, 8), mats.steel));
      arm.rotation.x = Math.PI / 2;
      const jaw = shadowed(new THREE.Mesh(new RoundedBoxGeometry(2.4, 2, 2.4, 2, 0.3), mats.darkMetal));
      const clampG = new THREE.Group();
      clampG.add(arm, jaw);
      arm.position.set(0, 0, 6);
      jaw.position.set(0, 0, 12.2);
      group.add(base, rod, clampG);
      group.add(at(hit(new THREE.BoxGeometry(14, 1.4, 10), id), 0, 0.7, 2));
      const clampHit = hit(new THREE.BoxGeometry(4, 4, 4), id, 'clamp');
      group.add(clampHit);
      update = (ctx, ob) => {
        const w = ctx.world;
        // La prensa sujeta la bureta a media altura; sin bureta queda en reposo.
        const xy = { x: w.objects.beaker600.pose.x + 0.6 - ob.pose.x, y: w.objects.beaker600.pose.y - ob.pose.y };
        const z = w.burette.inverted ? buretteZ(w).mouth + 30 : 40;
        clampG.position.set(-4, z, 0);
        clampG.rotation.y = Math.atan2(xy.x + 4, -xy.y) - Math.PI;
        const len = Math.hypot(xy.x + 4, xy.y);
        jaw.position.set(0, 0, len);
        arm.scale.y = len / 12;
        arm.position.set(0, 0, len / 2);
        jaw.visible = true;
        (jaw.material as THREE.MeshStandardMaterial).emissive?.setHex(w.burette.clamped ? 0x000000 : 0x332200);
        clampHit.position.set(xy.x, z, -xy.y);
      };
      break;
    }

    case 'uTube': {
      // Tubo en U de vidrio: una rama baja al baño, gira y sube dentro de la boca de la bureta.
      const path = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-3.5, 16, 0), new THREE.Vector3(-3.5, 2, 0), new THREE.Vector3(-3, 0.4, 0), new THREE.Vector3(-1.5, 0.2, 0), new THREE.Vector3(0, 0.4, 0), new THREE.Vector3(0.4, 2.8, 0),
      ]);
      const tubeG = new THREE.Mesh(new THREE.TubeGeometry(path, 40, 0.28, 8, false), mats.glass);
      tubeG.renderOrder = 4;
      const inner = new THREE.Group();
      inner.add(tubeG);
      inner.add(at(hit(new THREE.BoxGeometry(5, 17, 1.6), id), -1.5, 8, 0));
      group.add(inner);
      update = (ctx, ob) => {
        const lying = ob.support === 'bench' || ob.support === 'hand';
        inner.rotation.set(0, 0, lying && ob.support === 'bench' ? Math.PI / 2 : 0);
        inner.position.set(lying && ob.support === 'bench' ? 8 : 0, lying && ob.support === 'bench' ? 0.5 : 0, 0);
        void ctx;
      };
      break;
    }

    case 'thermometer': {
      const inner = new THREE.Group();
      const stem = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 14, 10), mats.chrome));
      stem.position.y = 7;
      const handle = shadowed(new THREE.Mesh(new RoundedBoxGeometry(2.4, 5.5, 1.4, 3, 0.4), own(new THREE.MeshStandardMaterial({ color: 0x1f6f6b, roughness: 0.5 }))));
      handle.position.y = 16.5;
      const lcd = lcdTexture(192, 72);
      own(lcd.texture);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.8), own(new THREE.MeshBasicMaterial({ map: lcd.texture })));
      screen.position.set(0, 17.4, 0.71);
      inner.add(stem, handle, screen);
      inner.add(at(hit(new THREE.BoxGeometry(2.6, 6, 2), id, 'display'), 0, 16.5, 0));
      inner.add(at(hit(new THREE.CylinderGeometry(0.8, 0.8, 14, 8), id), 0, 7, 0));
      group.add(inner);
      update = (ctx, ob) => {
        const th = ctx.world.thermometer;
        lcd.set((Math.round((th.displayedC + th.offsetC) / th.resolutionC) * th.resolutionC).toFixed(1), '#6ef08a', '°C');
        if (ob.support === 'bench') {
          inner.rotation.set(0, 0, Math.PI / 2);
          inner.position.set(8, 0.6, 0);
        } else {
          inner.rotation.set(0, 0, 0);
          inner.position.set(0, 0, 0);
        }
      };
      break;
    }

    case 'barometer': {
      const box = shadowed(new THREE.Mesh(new RoundedBoxGeometry(14, 18, 2, 3, 0.6), own(new THREE.MeshStandardMaterial({ color: 0x3a4652, roughness: 0.5 }))));
      const lcd = lcdTexture(256, 96);
      own(lcd.texture);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(11, 4), own(new THREE.MeshBasicMaterial({ map: lcd.texture })));
      screen.position.set(0, 2.5, 1.05);
      const lbl = new THREE.Mesh(new THREE.PlaneGeometry(11, 3), own(new THREE.MeshStandardMaterial({ map: own(labelTexture(['BARÓMETRO', 'presión local'], { band: '#3a4652', w: 256, h: 64 })) })));
      lbl.position.set(0, -4.5, 1.05);
      group.add(box, screen, lbl);
      group.add(at(hit(new THREE.BoxGeometry(14, 18, 3), id), 0, 0, 0));
      update = (ctx) => {
        const p = ctx.world.params;
        lcd.set(((p.pressureKPa / 101.325) * 760).toFixed(1), '#6ef08a', 'mmHg');
      };
      break;
    }

    case 'ruler': {
      const inner = new THREE.Group();
      const marks: Array<[number, boolean, string?]> = [];
      for (let mm = 0; mm <= 300; mm += 5) marks.push([mm / 300, mm % 50 === 0, mm % 50 === 0 ? String(mm / 10) : undefined]);
      const tex = own(graduationTexture(marks, '#111111', { sub: 'cm' }));
      const board = shadowed(new THREE.Mesh(new THREE.BoxGeometry(2.4, 30, 0.3), own(new THREE.MeshStandardMaterial({ color: 0xf4e9c8, roughness: 0.7 }))));
      board.position.y = 15;
      const face = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 30), own(new THREE.MeshBasicMaterial({ map: tex, transparent: true })));
      face.position.set(0, 15, 0.16);
      inner.add(board, face);
      inner.add(at(hit(new THREE.BoxGeometry(2.6, 30, 1), id), 0, 15, 0));
      group.add(inner);
      update = (_ctx, ob) => {
        const lying = ob.support !== 'beaker600';
        inner.rotation.set(lying ? -Math.PI / 2 : 0, 0, 0);
        inner.position.set(0, lying ? 0.2 : 0, 0);
      };
      break;
    }

    case 'sensor': {
      const body = shadowed(new THREE.Mesh(new RoundedBoxGeometry(9, 3, 4, 2, 0.6), own(new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.5 }))));
      body.position.y = 1.5;
      const port = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2, 10), mats.steel));
      port.rotation.z = Math.PI / 2;
      port.position.set(-5.4, 2.2, -2);
      const valve = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1.2), mats.blackPlastic));
      valve.position.set(-4.3, 3.2, -2);
      const lbl = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.5), own(new THREE.MeshStandardMaterial({ map: own(labelTexture([w0.sensor.model === 'GPS_BTA' ? 'Gas Pressure Sensor' : 'Sensor de presión', w0.sensor.model.replace('_', '-')], { band: '#2e7d32', w: 256, h: 64 })) })));
      lbl.position.set(0, 3.02, 0);
      lbl.rotation.x = -Math.PI / 2;
      const cable = shadowed(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(4.5, 1.5, 0), new THREE.Vector3(12, 0.6, -2), new THREE.Vector3(20, 0.6, -8), new THREE.Vector3(26, 1.2, -10)]), 20, 0.25, 6), mats.blackPlastic));
      group.add(body, port, valve, lbl, cable);
      group.add(at(hit(new THREE.BoxGeometry(9, 3, 4), id), 0, 1.5, 0));
      update = (ctx) => {
        valve.rotation.y = ctx.world.syringe.valve === 'VENT' ? Math.PI / 2 : 0;
      };
      break;
    }

    case 'datalogger': {
      const body = shadowed(new THREE.Mesh(new RoundedBoxGeometry(14, 2.4, 9, 2, 0.6), own(new THREE.MeshStandardMaterial({ color: 0x263238, roughness: 0.5 }))));
      body.position.y = 1.2;
      body.rotation.x = -0.25;
      const lcd = lcdTexture(320, 160);
      own(lcd.texture);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), own(new THREE.MeshBasicMaterial({ map: lcd.texture })));
      screen.position.set(0, 2.6, 0.4);
      screen.rotation.x = -Math.PI / 2 + 0.25;
      group.add(body, screen);
      group.add(at(hit(new THREE.BoxGeometry(14, 3, 9), id), 0, 1.5, 0));
      update = (ctx) => {
        const w = ctx.world;
        const v = sensorReading(w.sensor);
        const txt = Number.isFinite(v) ? v.toFixed(1) : '---';
        lcd.set(w.syringe.collecting ? txt : `${txt}`, w.sensor.overload ? '#f06e6e' : '#6ef08a', w.syringe.collecting ? `kPa · REC · ${w.points.length}` : 'kPa');
      };
      break;
    }

    case 'syringe': {
      // Jeringa horizontal: boquilla a +x (hacia el sensor), barril hacia −x, émbolo en la marca del borde del sello.
      const S = VIS.syringe;
      const A = GEO10.syringe.areaCm2;
      const barrelLen = (w0.params.syringeMl + 1.2) / A + 0.5;
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(S.r + 0.12, S.r + 0.12, barrelLen, seg, 1, true), mats.plasticWhite);
      barrel.rotation.z = Math.PI / 2;
      barrel.position.x = -1 - barrelLen / 2;
      const marks: Array<[number, boolean, string?]> = [];
      for (let ml = 0; ml <= 20; ml += 1) marks.push([(ml / A) / barrelLen, ml % 5 === 0, ml % 5 === 0 ? String(ml) : undefined]);
      const tex = own(graduationTexture(marks, '#111111'));
      const scale = new THREE.Mesh(new THREE.CylinderGeometry(S.r + 0.14, S.r + 0.14, barrelLen, seg, 1, true, Math.PI * 0.3, Math.PI * 0.4), own(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })));
      scale.rotation.z = -Math.PI / 2;
      scale.position.x = -1 - barrelLen / 2;
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 1, 10), mats.plasticWhite);
      nozzle.rotation.z = Math.PI / 2;
      nozzle.position.x = -0.5;
      const plunger = new THREE.Group();
      const seal = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(S.r, S.r, 0.5, seg), own(new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 }))));
      seal.rotation.z = Math.PI / 2;
      seal.position.x = -0.25;
      const rod = shadowed(new THREE.Mesh(new THREE.BoxGeometry(barrelLen, 0.5, 0.5), mats.plasticWhite));
      rod.position.x = -0.5 - barrelLen / 2;
      const thumb = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.3, 16), mats.plasticWhite));
      thumb.rotation.z = Math.PI / 2;
      thumb.position.x = -0.6 - barrelLen;
      plunger.add(seal, rod, thumb);
      const flange = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.3, 3, 1.2), mats.plasticWhite));
      flange.position.x = -1 - barrelLen;
      group.add(barrel, scale, nozzle, plunger, flange);
      group.add(at(hit(new THREE.BoxGeometry(barrelLen + 1, 2, 2), id), -1 - barrelLen / 2, 0, 0));
      plunger.add(at(hit(new THREE.BoxGeometry(barrelLen, 2.4, 2.4), id, 'plunger'), -0.6 - barrelLen / 2 - 1, 0, 0));
      ring = selRing(4);
      group.add(ring);
      update = (ctx) => {
        // Borde frontal del sello en la marca (§22.1).
        plunger.position.x = -1 - ctx.world.syringe.markMl / A;
      };
      break;
    }

    case 'sink': {
      const basin = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(12, 10, 10, seg, 1, true), mats.steel));
      basin.position.y = 5;
      const tap = shadowed(new THREE.Mesh(new THREE.TorusGeometry(4, 0.6, 8, 16, Math.PI), mats.chrome));
      tap.position.set(0, 14, -10);
      group.add(basin, tap);
      group.add(at(hit(new THREE.CylinderGeometry(12, 12, 10, 12), id), 0, 5, 0));
      break;
    }
  }

  group.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh && m.geometry) disposables.push(m.geometry);
  });

  return {
    group,
    update: (ctx, ob) => {
      const p = ob.pose;
      group.position.set(p.x, p.z, -p.y);
      tiltable.rotation.set(0, 0, ob.kind === 'burette' ? 0 : -p.rotationRad);
      if (ring) ring.visible = ctx.selected === id;
      update(ctx, ob);
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
