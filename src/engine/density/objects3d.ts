/**
 * Vistas 3D procedurales de la Práctica 1: balanza granataria (pantalla, encendido, tara, nivel de burbuja), vidrio
 * de reloj, pipeta aforada de 25 mL con su marca, menisco y burbuja, pera, probeta de 50 mL con su escala (la misma
 * geometría del dominio) y los clavos dentro, Erlenmeyer de 150 mL (el astillado con su grieta), piseta, termómetro
 * digital, calibrador con su mordaza móvil, cilindro metálico, cápsula y recipiente de pesada con clavos, depósitos de
 * agua, baño con hielo, bandeja para derrames, desecho y el material de reconocimiento. SOLO leen el estado.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { P01Object, P01World } from '../../simulation/density-world/types';
import { CYL_AREA, GEO01 } from '../../simulation/density-world/geometry';
import { balanceDisplayG, fluidMl, levelCmOf } from '../../simulation/density-world/world';
import type { QualityLevel } from '../quality';
import { materials } from '../renderers/materials';
import { graduationTexture, labelTexture, lcdTexture } from '../renderers/textures';
import type { FrameCtx01 } from './DensityLab3D';
import { cylinderLevelZ, pipetteLevelZ } from './layout';

export interface ObjHandle01 {
  group: THREE.Group;
  update(ctx: FrameCtx01, o: P01Object): void;
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
const COLD = 0x79b4e8;

/** Columna de líquido dentro de un cilindro, con menisco cóncavo opcional. */
function liquidColumn(r: number, seg: number, own: <T extends THREE.Material>(m: T) => T, color = WATER, meniscus = false) {
  const mat = own(new THREE.MeshPhysicalMaterial({ color, emissive: color, emissiveIntensity: 0.12, roughness: 0.05, transparent: true, opacity: 0.6, depthWrite: false }));
  const col = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, seg), mat);
  col.renderOrder = 2;
  const g = new THREE.Group();
  g.add(col);
  let men: THREE.Mesh | null = null;
  if (meniscus) {
    men = new THREE.Mesh(new THREE.TorusGeometry(r * 0.96, Math.max(0.03, r * 0.07), 6, seg), own(new THREE.MeshBasicMaterial({ color: 0x2f6fa6, transparent: true, opacity: 0.85 })));
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

function ringMark(r: number, own: <T extends THREE.Material>(m: T) => T) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 6, 32), own(new THREE.MeshBasicMaterial({ color: 0x0b2c4d })));
  m.rotation.x = Math.PI / 2;
  return m;
}

/** Clavos de un recipiente: hasta 6 piezas visibles, una de otro material si el escenario lo pide. */
function nailsGroup(own: <T extends THREE.Material>(m: T) => T, layout: 'flat' | 'stack') {
  const iron = own(new THREE.MeshStandardMaterial({ color: 0x6f7378, metalness: 0.8, roughness: 0.45 }));
  const alu = own(new THREE.MeshStandardMaterial({ color: 0xd4d8dc, metalness: 0.7, roughness: 0.3 }));
  const g = new THREE.Group();
  const nails: THREE.Group[] = [];
  for (let i = 0; i < 6; i++) {
    const n = new THREE.Group();
    const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 4.2, 6), iron);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 10), iron);
    head.position.y = 2.1;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.4, 6), iron);
    tip.rotation.z = Math.PI;
    tip.position.y = -2.3;
    n.add(shank, head, tip);
    if (layout === 'flat') {
      n.rotation.z = Math.PI / 2;
      n.rotation.y = (i - 2.5) * 0.25;
      n.position.set((i % 2) * 0.4 - 0.2, 0.25 + Math.floor(i / 2) * 0.22, (i - 2.5) * 0.5);
    } else {
      n.rotation.z = (i % 3 - 1) * 0.12;
      n.rotation.x = (i % 2 ? 1 : -1) * 0.1;
      n.position.set(((i % 3) - 1) * 0.32, 2.6 + Math.floor(i / 3) * 0.05, (Math.floor(i / 3) - 0.5) * 0.36);
    }
    nails.push(n);
    g.add(n);
  }
  return {
    group: g,
    set(w: P01World, where: string) {
      const here = w.nails.filter((x) => x.where === where);
      nails.forEach((n, i) => {
        const p = here[i];
        n.visible = !!p;
        if (p) for (const c of n.children) (c as THREE.Mesh).material = p.rhoGPerMl < 5 ? alu : iron;
      });
    },
  };
}

export function createObjVisual01(o: P01Object, w0: P01World, q: QualityLevel): ObjHandle01 {
  const mats = materials(q);
  const seg = q === 'LOW' ? 16 : q === 'MEDIUM' ? 28 : 40;
  const group = new THREE.Group();
  const disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];
  let ring: THREE.Mesh | null = null;
  let update: ObjHandle01['update'] = () => undefined;
  const id = o.id;
  const own = <T extends THREE.Material | THREE.Texture>(m: T): T => {
    disposables.push(m);
    return m;
  };
  /** Las vasijas se inclinan al verter (giro en el plano frontal). */
  const tiltable = new THREE.Group();
  group.add(tiltable);

  switch (o.kind) {
    case 'balance': {
      // Balanza granataria digital: cuerpo, platillo de Ø 13 cm, pantalla, ON/OFF, TARA y nivel de burbuja.
      const B = GEO01.balance;
      const body = shadowed(new THREE.Mesh(new RoundedBoxGeometry(B.w, 7.4, B.d, 3, 0.8), own(new THREE.MeshStandardMaterial({ color: 0xe9ecef, roughness: 0.5 }))));
      body.position.set(0, 3.7, 0);
      const riser = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.6, 0.8, 16), mats.darkMetal));
      riser.position.set(0, 7.8, -2);
      const pan = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(B.panR, B.panR, 0.25, seg), mats.steel));
      pan.position.set(0, B.panZ - 0.12, -2);
      const wet = new THREE.Mesh(new THREE.CircleGeometry(B.panR * 0.7, 24), own(new THREE.MeshBasicMaterial({ color: 0x7fb6e0, transparent: true, opacity: 0.45 })));
      wet.rotation.x = -Math.PI / 2;
      wet.position.set(0, B.panZ + 0.02, -2);
      const front = shadowed(new THREE.Mesh(new THREE.BoxGeometry(B.w - 2, 3.2, 1), own(new THREE.MeshStandardMaterial({ color: 0x3a4652, roughness: 0.5 }))));
      front.position.set(0, 3.2, B.d / 2 - 0.2);
      const lcd = lcdTexture(320, 80);
      own(lcd.texture);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.4), own(new THREE.MeshBasicMaterial({ map: lcd.texture })));
      screen.position.set(-2, 3.2, B.d / 2 + 0.32);
      const btn = (x: number, color: THREE.Material) => {
        const m = shadowed(new THREE.Mesh(new RoundedBoxGeometry(2.2, 1.2, 0.6, 2, 0.2), color));
        m.position.set(x, 3.2, B.d / 2 + 0.4);
        return m;
      };
      const powerBtn = btn(6, mats.rubberRed);
      const tareBtn = btn(9, mats.plasticBlue);
      const lbl = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.1), own(new THREE.MeshStandardMaterial({ map: own(labelTexture(['ON/OFF    TARA'], { band: '#3a4652', w: 256, h: 48 })) })));
      lbl.position.set(7.5, 1.2, B.d / 2 + 0.35);
      const bubble = new THREE.Mesh(new THREE.CircleGeometry(0.9, 20), own(new THREE.MeshBasicMaterial({ color: 0x9fe0b0 })));
      bubble.rotation.x = -Math.PI / 2;
      bubble.position.set(9, 7.45, 10);
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.28, 12), own(new THREE.MeshBasicMaterial({ color: 0x1e5631 })));
      dot.rotation.x = -Math.PI / 2;
      const cap = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.2), own(new THREE.MeshStandardMaterial({ map: own(labelTexture(['600 g × 0,01 g'], { band: '#123a63', w: 256, h: 40 })) })));
      cap.rotation.x = -Math.PI / 2;
      cap.position.set(-6, 7.42, 11);
      group.add(body, riser, pan, wet, front, screen, powerBtn, tareBtn, lbl, bubble, dot, cap);
      group.add(at(hit(new THREE.BoxGeometry(3, 2, 1.6), id, 'power'), 6, 3.2, B.d / 2 + 0.4));
      group.add(at(hit(new THREE.BoxGeometry(3, 2, 1.6), id, 'tare'), 9, 3.2, B.d / 2 + 0.4));
      group.add(at(hit(new THREE.BoxGeometry(2.6, 1, 2.6), id, 'level'), 9, 7.6, 10));
      group.add(at(hit(new THREE.BoxGeometry(11, 3, 1.4), id, 'display'), -2, 3.2, B.d / 2 + 0.3));
      group.add(at(hit(new THREE.BoxGeometry(B.w, 7.4, B.d), id), 0, 3.7, 0));
      ring = selRing(15);
      group.add(ring);
      update = (ctx) => {
        const w = ctx.world;
        const b = w.balance;
        const shown = balanceDisplayG(w);
        if (!b.powered) lcd.set('', '#1b2a20');
        else lcd.set(Number.isFinite(shown) ? shown.toFixed(2) : '------', b.stable ? '#6ef08a' : '#f0c36e', b.stable ? 'g  ●' : 'g  ~');
        dot.position.set(9 + Math.min(0.6, b.levelErrorDeg * 0.22), 7.47, 10);
        wet.visible = b.panWetG > 0.005;
      };
      break;
    }

    case 'watchGlass': {
      const G = GEO01.watchGlass;
      const dish = shadowed(new THREE.Mesh(new THREE.SphereGeometry(G.r, seg, 8, 0, Math.PI * 2, Math.PI * 0.8, Math.PI * 0.2), mats.glass));
      dish.rotation.x = Math.PI;
      dish.position.y = G.r;
      const wet = new THREE.Mesh(new THREE.CircleGeometry(G.r * 0.6, 20), own(new THREE.MeshBasicMaterial({ color: 0xa8d0ee, transparent: true, opacity: 0.45 })));
      wet.rotation.x = -Math.PI / 2;
      wet.position.y = 0.3;
      group.add(dish, wet);
      group.add(at(hit(new THREE.CylinderGeometry(G.r + 0.2, G.r + 0.2, 1.4, 12), id), 0, 0.6, 0));
      ring = selRing(G.r + 0.6);
      group.add(ring);
      update = (ctx) => {
        wet.visible = (ctx.world.wetObjects.watchGlass01 ?? 0) > 0.01;
      };
      break;
    }

    case 'pipette': {
      const P = GEO01.pipette25;
      const inner = new THREE.Group();
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.07, P.tipLen, 8, 1, true), mats.glass);
      tip.position.y = P.tipLen / 2;
      const neckLo = new THREE.Mesh(new THREE.CylinderGeometry(P.bulbR * 0.5, 0.22, P.bulbZ0 - P.tipLen, 10, 1, true), mats.glass);
      neckLo.position.y = (P.tipLen + P.bulbZ0) / 2;
      const bulb = new THREE.Mesh(new THREE.CylinderGeometry(P.bulbR, P.bulbR, P.bulbZ1 - P.bulbZ0, seg, 1, true), mats.glass);
      bulb.position.y = (P.bulbZ0 + P.bulbZ1) / 2;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(P.stemR + 0.08, P.stemR + 0.08, P.topZ - P.bulbZ1, 10, 1, true), mats.glass);
      stem.position.y = (P.bulbZ1 + P.topZ) / 2;
      const mark = ringMark(P.stemR + 0.1, own);
      mark.position.y = P.markZ;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(P.bulbR + 0.02, P.bulbR + 0.02, 1.4, seg, 1, true), own(new THREE.MeshStandardMaterial({ map: own(labelTexture(['25 mL  TD  ±0,03', '20 °C'], { band: '#d4a017', w: 256, h: 64 })) })));
      band.position.y = (P.bulbZ0 + P.bulbZ1) / 2;
      const liqMat = own(new THREE.MeshPhysicalMaterial({ color: WATER, emissive: WATER, emissiveIntensity: 0.12, roughness: 0.05, transparent: true, opacity: 0.65, depthWrite: false }));
      const liqBulb = new THREE.Mesh(new THREE.CylinderGeometry(P.bulbR - 0.08, P.bulbR - 0.08, P.bulbZ1 - P.bulbZ0, seg), liqMat);
      liqBulb.position.y = (P.bulbZ0 + P.bulbZ1) / 2;
      const liqTip = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.05, P.bulbZ0, 6), liqMat);
      liqTip.position.y = P.bulbZ0 / 2;
      const liqStem = new THREE.Mesh(new THREE.CylinderGeometry(P.stemR, P.stemR, 1, 8), liqMat);
      const men = new THREE.Mesh(new THREE.TorusGeometry(P.stemR * 0.9, 0.05, 6, 16), own(new THREE.MeshBasicMaterial({ color: 0x2f6fa6 })));
      men.rotation.x = Math.PI / 2;
      const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), own(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 })));
      const drop = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), liqMat);
      drop.position.y = -0.15;
      inner.add(tip, neckLo, bulb, stem, mark, band, liqBulb, liqTip, liqStem, men, bubble, drop);
      inner.add(at(hit(new THREE.CylinderGeometry(1.4, 1.4, P.topZ, 8), id), 0, P.topZ / 2, 0));
      group.add(inner);
      update = (ctx, ob) => {
        const w = ctx.world;
        const pp = w.pipette;
        const lying = ob.support === 'bench';
        inner.rotation.set(0, 0, lying ? Math.PI / 2 : -ob.pose.rotationRad);
        inner.position.set(lying ? P.topZ / 2 : 0, lying ? 0.6 : 0, 0);
        const full = pp.waterG > 0.3;
        liqBulb.visible = full;
        liqTip.visible = full;
        const top = lying ? P.bulbZ1 : Math.max(P.bulbZ1, Math.min(P.topZ, pipetteLevelZ(w) - ob.pose.z));
        liqStem.visible = full && top > P.bulbZ1 + 0.02;
        liqStem.scale.y = Math.max(0.01, top - P.bulbZ1);
        liqStem.position.y = (P.bulbZ1 + top) / 2;
        men.visible = liqStem.visible;
        men.position.y = top;
        bubble.visible = full && pp.airMl > 0.01;
        bubble.position.set(0.3, P.bulbZ1 - 0.6, 0.3);
        drop.visible = pp.externalDropG > 0.005 && !lying;
      };
      break;
    }

    case 'filler': {
      const bulbG = shadowed(new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 12), mats.rubberRed));
      bulbG.position.y = 2.6;
      const valve = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2, 10), mats.rubberRed));
      valve.position.y = 0.6;
      const dirty = new THREE.Mesh(new THREE.SphereGeometry(1.65, 12, 8), own(new THREE.MeshBasicMaterial({ color: 0x7fb6e0, transparent: true, opacity: 0.35 })));
      dirty.position.y = 2.6;
      group.add(bulbG, valve, dirty);
      group.add(at(hit(new THREE.SphereGeometry(2, 8, 6), id), 0, 2.4, 0));
      update = (ctx) => {
        dirty.visible = ctx.world.pipette.fillerContaminated;
      };
      break;
    }

    case 'cylinder': {
      const G = GEO01.cylinder50;
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(G.r + 0.15, G.r + 0.15, G.h, seg, 1, true), mats.glass);
      glass.position.y = G.h / 2;
      glass.renderOrder = 3;
      const lip = new THREE.Mesh(new THREE.TorusGeometry(G.r + 0.18, 0.08, 6, seg), mats.glass);
      lip.rotation.x = Math.PI / 2;
      lip.position.y = G.h;
      const base = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(G.baseR, G.baseR + 0.2, 0.8, 6), mats.glass));
      base.position.y = 0.4;
      // Escala: la marca de V mL está a la altura que encierra V mL del mismo perfil del dominio.
      const span = G.h - G.floor;
      const marks: Array<[number, boolean, string?]> = [];
      for (let ml = 0; ml <= 50; ml += 1) marks.push([(ml / CYL_AREA) / span, ml % 5 === 0, ml % 10 === 0 && ml > 0 ? String(ml) : undefined]);
      const tex = own(graduationTexture(marks, '#123a63', { sub: '50 mL · 20 °C · ±0,5' }));
      const scale = new THREE.Mesh(new THREE.CylinderGeometry(G.r + 0.17, G.r + 0.17, span, seg, 1, true, -Math.PI * 0.22, Math.PI * 0.44), own(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })));
      scale.position.y = G.floor + span / 2;
      const liquid = liquidColumn(G.r, seg, own, WATER, true);
      const nails = nailsGroup(own, 'stack');
      nails.group.position.y = G.floor - 0.2;
      nails.group.scale.setScalar(0.85);
      const bubbles = new THREE.Group();
      const bubMat = own(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 }));
      for (let i = 0; i < 8; i++) bubbles.add(new THREE.Mesh(new THREE.SphereGeometry(0.1 + (i % 3) * 0.04, 6, 4), bubMat));
      tiltable.add(glass, lip, base, scale, liquid.group, nails.group, bubbles);
      tiltable.add(at(hit(new THREE.CylinderGeometry(G.baseR, G.baseR, G.h + 1, 10), id), 0, (G.h + 1) / 2, 0));
      ring = selRing(G.baseR + 0.6);
      group.add(ring);
      let phase = 0;
      update = (ctx, ob) => {
        const w = ctx.world;
        let h = cylinderLevelZ(w) - ob.pose.z - G.floor;
        // Oscilación visible mientras el nivel no se asienta.
        if (w.timeS < w.cylinder.unsettledUntil && !ctx.reducedMotion) h += 0.08 * Math.sin(w.timeS * 9);
        liquid.set(Math.max(0, h), G.floor);
        nails.set(w, 'cylinder50');
        bubbles.visible = w.cylinder.trappedAirMl > 0.02;
        phase += ctx.dt;
        bubbles.children.forEach((b, i) => b.position.set(Math.cos(i * 2.1) * 0.5, G.floor + 0.6 + (i % 4) * 0.5 + 0.05 * Math.sin(phase * 3 + i), Math.sin(i * 2.1) * 0.5));
      };
      break;
    }

    case 'erlenmeyer': {
      const E = GEO01.erlenmeyer150;
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(E.mouthR + 0.15, E.baseR, E.neckZ, seg, 1, true), mats.glass);
      cone.position.y = E.neckZ / 2;
      cone.renderOrder = 3;
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(E.mouthR + 0.15, E.mouthR + 0.15, E.mouthZ - E.neckZ, seg, 1, true), mats.glass);
      neck.position.y = (E.neckZ + E.mouthZ) / 2;
      const bottom = new THREE.Mesh(new THREE.CircleGeometry(E.baseR, seg), mats.glass);
      bottom.rotation.x = -Math.PI / 2;
      bottom.position.y = 0.05;
      const lbl = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.2), own(new THREE.MeshStandardMaterial({ map: own(labelTexture(['150 mL ≈'], { band: '#123a63', w: 128, h: 48 })) })));
      lbl.position.set(0, 3, E.baseR * 0.72 + 0.25);
      lbl.rotation.x = -0.3;
      const liqMat = own(new THREE.MeshPhysicalMaterial({ color: WATER, emissive: WATER, emissiveIntensity: 0.12, roughness: 0.05, transparent: true, opacity: 0.6, depthWrite: false }));
      const liq = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, seg), liqMat);
      tiltable.add(cone, neck, bottom, lbl, liq);
      if (o.damaged) {
        // Grieta y astilla visibles en el borde: este material se retira.
        const crackMat = own(new THREE.LineBasicMaterial({ color: 0x1b1b1b }));
        const pts = [[E.mouthR + 0.2, E.mouthZ], [E.mouthR + 0.5, E.mouthZ - 1.2], [E.mouthR + 0.3, E.mouthZ - 2.2], [E.mouthR + 1, E.mouthZ - 3.6], [E.mouthR + 1.3, E.mouthZ - 4.4]];
        const crack = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map(([x, y]) => new THREE.Vector3(x * 0.72, y, x * 0.72))), crackMat);
        const chip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.3), own(new THREE.MeshBasicMaterial({ color: 0xe8f0f5 })));
        chip.position.set(E.mouthR * 0.7 + 0.2, E.mouthZ - 0.1, E.mouthR * 0.7);
        const tag = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1), own(new THREE.MeshStandardMaterial({ map: own(labelTexture(['NO USAR'], { band: '#d0021b', w: 128, h: 48 })) })));
        tag.position.set(0, 6, E.baseR * 0.5 + 0.2);
        tag.rotation.x = -0.28;
        tiltable.add(crack, chip, tag);
      }
      tiltable.add(at(hit(new THREE.CylinderGeometry(E.baseR, E.baseR, E.mouthZ, 12), id), 0, E.mouthZ / 2, 0));
      ring = selRing(E.baseR + 0.8);
      group.add(ring);
      let lastH = -1;
      update = (ctx) => {
        const w = ctx.world;
        const h = Math.min(E.neckZ, levelCmOf(w, id));
        liq.visible = fluidMl(w.fluids[id]) > 0.3;
        if (Math.abs(h - lastH) > 0.02) {
          lastH = h;
          liq.geometry.dispose();
          const rTop = E.baseR - ((E.baseR - E.mouthR) * h) / E.neckZ;
          liq.geometry = new THREE.CylinderGeometry(rTop - 0.08, E.baseR - 0.08, Math.max(0.05, h), seg);
        }
        liq.position.y = h / 2 + 0.05;
        liqMat.color.setHex(w.fluids[id].tempC < 15 ? COLD : WATER);
      };
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
        lcd.set((Math.round((th.displayedC + th.biasC) / th.resolutionC) * th.resolutionC).toFixed(1), '#6ef08a', '°C');
        if (ob.support === 'bench') {
          inner.rotation.set(0, 0, Math.PI / 2);
          inner.position.set(8, 0.6, 0);
        } else {
          inner.rotation.set(0, 0, th.touchingWall ? 0.12 : 0);
          inner.position.set(th.touchingWall ? 0.6 : 0, Math.max(0, 1.5 - th.depthCm * 0.3), 0);
        }
      };
      break;
    }

    case 'caliper': {
      // Pie de rey: regla con mordaza fija y mordaza móvil que se abre según la apertura del dominio.
      const steel = mats.steel;
      const beam = shadowed(new THREE.Mesh(new THREE.BoxGeometry(20, 0.35, 1.6), steel));
      beam.position.set(5, 0.2, 0);
      const fixed = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.35, 4.2), steel));
      fixed.position.set(-4.7, 0.2, 2.2);
      const slider = new THREE.Group();
      const sBody = shadowed(new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.6, 2), mats.darkMetal));
      sBody.position.set(1.6, 0.25, 0);
      const sJaw = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.35, 4.2), steel));
      sJaw.position.set(0.3, 0.2, 2.2);
      const marks: Array<[number, boolean, string?]> = [];
      for (let mm = 0; mm <= 150; mm += 1) marks.push([mm / 150, mm % 10 === 0, mm % 20 === 0 ? String(mm / 10) : undefined]);
      const tex = own(graduationTexture(marks, '#111111', { sub: 'cm · 0,02 mm' }));
      tex.center.set(0.5, 0.5);
      tex.rotation = -Math.PI / 2;
      const face = new THREE.Mesh(new THREE.PlaneGeometry(15, 1.4), own(new THREE.MeshBasicMaterial({ map: tex, transparent: true })));
      face.rotation.x = -Math.PI / 2;
      face.position.set(3.2, 0.39, 0);
      slider.add(sBody, sJaw);
      group.add(beam, fixed, slider, face);
      group.add(at(hit(new THREE.BoxGeometry(21, 1.4, 5), id), 5, 0.4, 1));
      update = (ctx) => {
        const c = ctx.world.caliper;
        slider.position.set(-4.4 + Math.max(0, c.apertureCm) * 1, 0, 0);
      };
      break;
    }

    case 'solidCylinder': {
      const s = w0.solid;
      const metal = own(new THREE.MeshStandardMaterial({ color: 0xc9ced3, metalness: 0.85, roughness: 0.3 }));
      const body = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(s.diameterCm / 2, s.diameterCm / 2, s.heightCm, seg), metal));
      body.scale.set(1 + s.ovality * 4, 1, 1 - s.ovality * 4);
      body.position.y = s.heightCm / 2;
      group.add(body);
      group.add(at(hit(new THREE.CylinderGeometry(1.6, 1.6, s.heightCm + 0.6, 10), id), 0, s.heightCm / 2, 0));
      ring = selRing(2);
      group.add(ring);
      break;
    }

    case 'nailsDish':
    case 'weighBoat': {
      const dish = o.kind === 'nailsDish';
      const base = dish
        ? new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 1.2, seg, 1, true), mats.glass)
        : shadowed(new THREE.Mesh(new THREE.BoxGeometry(GEO01.weighBoat.w, 0.15, GEO01.weighBoat.d), own(new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: 0.6 }))));
      base.position.y = dish ? 0.6 : 0.08;
      const parts: THREE.Object3D[] = [base];
      if (dish) {
        const bottom = new THREE.Mesh(new THREE.CircleGeometry(4.5, seg), mats.glass);
        bottom.rotation.x = -Math.PI / 2;
        bottom.position.y = 0.04;
        parts.push(bottom);
      } else {
        for (const [x, z, ry] of [[0, GEO01.weighBoat.d / 2, 0], [0, -GEO01.weighBoat.d / 2, 0], [GEO01.weighBoat.w / 2, 0, Math.PI / 2], [-GEO01.weighBoat.w / 2, 0, Math.PI / 2]] as const) {
          const wall = shadowed(new THREE.Mesh(new THREE.BoxGeometry(GEO01.weighBoat.w, GEO01.weighBoat.h, 0.12), own(new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: 0.6 }))));
          wall.position.set(x, GEO01.weighBoat.h / 2, z);
          wall.rotation.y = ry;
          parts.push(wall);
        }
      }
      const nails = nailsGroup(own, 'flat');
      group.add(...parts, nails.group);
      group.add(at(hit(dish ? new THREE.CylinderGeometry(4.7, 4.7, 1.6, 10) : new THREE.BoxGeometry(GEO01.weighBoat.w, 2, GEO01.weighBoat.d), id), 0, 0.8, 0));
      ring = selRing(dish ? 5 : 5.6);
      group.add(ring);
      update = (ctx) => nails.set(ctx.world, id);
      break;
    }

    case 'reservoir': {
      const R = GEO01.reservoir;
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(R.r + 0.15, R.r + 0.15, R.h, seg, 1, true), mats.glass);
      glass.position.y = R.h / 2;
      glass.renderOrder = 3;
      const bottom = new THREE.Mesh(new THREE.CircleGeometry(R.r + 0.15, seg), mats.glass);
      bottom.rotation.x = -Math.PI / 2;
      bottom.position.y = 0.05;
      const lip = new THREE.Mesh(new THREE.TorusGeometry(R.r + 0.15, 0.1, 6, seg), mats.glass);
      lip.rotation.x = Math.PI / 2;
      lip.position.y = R.h;
      const cold = id === 'waterCold01';
      const lbl = new THREE.Mesh(new THREE.CylinderGeometry(R.r + 0.18, R.r + 0.18, 2.2, seg, 1, true, -0.6, 1.2), own(new THREE.MeshStandardMaterial({ map: own(labelTexture(cold ? ['Agua', 'para enfriar'] : ['Agua', 'ambiente'], { band: cold ? '#1565c0' : '#607080', w: 256, h: 96 })) })));
      lbl.position.y = R.h * 0.72;
      const liquid = liquidColumn(R.r, seg, own, cold ? COLD : WATER);
      const frost = new THREE.Mesh(new THREE.CylinderGeometry(R.r + 0.2, R.r + 0.2, R.h * 0.45, seg, 1, true), own(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false })));
      frost.position.y = R.h * 0.25;
      tiltable.add(glass, bottom, lip, lbl, liquid.group, frost);
      tiltable.add(at(hit(new THREE.CylinderGeometry(R.r + 0.4, R.r + 0.4, R.h, 12), id), 0, R.h / 2, 0));
      ring = selRing(R.r + 0.9);
      group.add(ring);
      update = (ctx) => {
        const f = ctx.world.fluids[id];
        liquid.set(Math.min(R.h - R.floor, fluidMl(f) / f.areaCm2), R.floor);
        frost.visible = f.tempC < 12 && f.waterG > 5;
      };
      break;
    }

    case 'iceBath': {
      const B = GEO01.iceBath;
      const plastic = own(new THREE.MeshPhysicalMaterial({ color: 0xdfe9f2, roughness: 0.3, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide }));
      const walls = new THREE.Mesh(new THREE.BoxGeometry(B.w, B.h, B.d), plastic);
      walls.position.y = B.h / 2;
      const water = new THREE.Mesh(new THREE.BoxGeometry(B.w - 0.6, B.h * 0.55, B.d - 0.6), own(new THREE.MeshPhysicalMaterial({ color: COLD, transparent: true, opacity: 0.45, roughness: 0.05, depthWrite: false })));
      water.position.y = B.h * 0.28;
      const ice = new THREE.Group();
      const iceMat = mats.ice;
      for (let i = 0; i < 14; i++) {
        const c = new THREE.Mesh(new RoundedBoxGeometry(2.2, 2.2, 2.2, 1, 0.4), iceMat);
        c.position.set(((i * 37) % 20) - 10 + 1, B.h * 0.5 + (i % 3) * 0.3, ((i * 23) % 16) - 8 + 1);
        c.rotation.set(i * 0.5, i * 0.9, 0);
        if (Math.hypot(c.position.x, c.position.z) < 5) c.position.x += 7;
        ice.add(c);
      }
      const lbl = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), own(new THREE.MeshStandardMaterial({ map: own(labelTexture(['Baño con hielo'], { band: '#1565c0', w: 256, h: 64 })) })));
      lbl.position.set(0, B.h * 0.75, B.d / 2 + 0.05);
      group.add(walls, water, ice, lbl);
      group.add(at(hit(new THREE.BoxGeometry(B.w, B.h, B.d), id), 0, B.h / 2, 0));
      break;
    }

    case 'spillTray': {
      const T = GEO01.spillTray;
      const trayMat = own(new THREE.MeshStandardMaterial({ color: 0x5a6672, roughness: 0.6 }));
      const floor = shadowed(new THREE.Mesh(new THREE.BoxGeometry(T.w, 0.2, T.d), trayMat), true);
      floor.position.y = 0.1;
      const parts: THREE.Object3D[] = [floor];
      for (const [x, z, ry, len] of [[0, T.d / 2, 0, T.w], [0, -T.d / 2, 0, T.w], [T.w / 2, 0, Math.PI / 2, T.d], [-T.w / 2, 0, Math.PI / 2, T.d]] as const) {
        const wall = shadowed(new THREE.Mesh(new THREE.BoxGeometry(len, T.h, 0.25), trayMat));
        wall.position.set(x, T.h / 2, z);
        wall.rotation.y = ry;
        parts.push(wall);
      }
      const puddle = new THREE.Mesh(new THREE.PlaneGeometry(T.w - 1, T.d - 1), own(new THREE.MeshPhysicalMaterial({ color: WATER, transparent: true, opacity: 0.5, roughness: 0.02, depthWrite: false })));
      puddle.rotation.x = -Math.PI / 2;
      puddle.position.y = 0.25;
      group.add(...parts, puddle);
      group.add(at(hit(new THREE.BoxGeometry(T.w, 0.6, T.d), id), 0, 0.3, 0));
      update = (ctx) => {
        puddle.visible = ctx.world.fluids.spillTray01.waterG > 0.05;
      };
      break;
    }

    case 'waste': {
      const R = GEO01.waste;
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(R.r + 0.15, R.r + 0.15, R.h, seg, 1, true), mats.glass);
      glass.position.y = R.h / 2;
      glass.renderOrder = 3;
      const lbl = new THREE.Mesh(new THREE.CylinderGeometry(R.r + 0.18, R.r + 0.18, 2.4, seg, 1, true, -0.6, 1.2), own(new THREE.MeshStandardMaterial({ map: own(labelTexture(['Desecho', 'agua'], { band: '#7a5c2e', w: 256, h: 96 })) })));
      lbl.position.y = R.h * 0.7;
      const liquid = liquidColumn(R.r, seg, own, WATER);
      group.add(glass, lbl, liquid.group);
      group.add(at(hit(new THREE.CylinderGeometry(R.r + 0.4, R.r + 0.4, R.h, 12), id), 0, R.h / 2, 0));
      update = (ctx) => {
        const f = ctx.world.fluids.waste01;
        liquid.set(Math.min(R.h - R.floor, fluidMl(f) / f.areaCm2), R.floor);
      };
      break;
    }

    // ── Reconocimiento (§4.1): observables y seleccionables; no simulan funciones que no tienen ──
    case 'recBeaker': {
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.3, 9, seg, 1, true), mats.glass);
      glass.position.y = 4.5;
      const marks: Array<[number, boolean, string?]> = [50, 100, 150, 200].map((ml) => [ml / 250, true, String(ml)]);
      const scale = new THREE.Mesh(new THREE.CylinderGeometry(3.32, 3.32, 9, seg, 1, true, -0.3, 0.6), own(new THREE.MeshBasicMaterial({ map: own(graduationTexture(marks, '#ffffff', { sub: '250 mL ≈' })), transparent: true, depthWrite: false })));
      scale.position.y = 4.5;
      group.add(glass, scale, at(hit(new THREE.CylinderGeometry(3.6, 3.6, 9, 10), id), 0, 4.5, 0));
      break;
    }
    case 'recTubes': {
      const wood = mats.wood;
      const top = shadowed(new THREE.Mesh(new THREE.BoxGeometry(14, 0.6, 4), wood));
      top.position.y = 6;
      const bot = shadowed(new THREE.Mesh(new THREE.BoxGeometry(14, 0.6, 4), wood));
      bot.position.y = 0.3;
      const sideL = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.6, 6, 4), wood));
      sideL.position.set(-7, 3, 0);
      const sideR = sideL.clone();
      sideR.position.x = 7;
      group.add(top, bot, sideL, sideR);
      for (let i = 0; i < 5; i++) {
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 12, 12, 1, true), mats.glass);
        tube.position.set(-5 + i * 2.5, 6, 0);
        group.add(tube);
      }
      group.add(at(hit(new THREE.BoxGeometry(15, 12, 4.5), id), 0, 6, 0));
      break;
    }
    case 'recFunnel': {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(3.4, 5, seg, 1, true), mats.glass);
      cone.rotation.x = Math.PI;
      cone.position.y = 7;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 5, 8, 1, true), mats.glass);
      stem.position.y = 2.5;
      group.add(cone, stem, at(hit(new THREE.CylinderGeometry(3.4, 3.4, 9.5, 10), id), 0, 4.8, 0));
      break;
    }
    case 'recFilter': {
      const paper = new THREE.Mesh(new THREE.CircleGeometry(5.5, 32), mats.paper);
      paper.rotation.x = -Math.PI / 2;
      paper.position.y = 0.05;
      group.add(paper, at(hit(new THREE.CylinderGeometry(5.5, 5.5, 0.4, 12), id), 0, 0.2, 0));
      break;
    }
    case 'recSpatula': {
      const blade = shadowed(new THREE.Mesh(new RoundedBoxGeometry(9, 0.12, 1.3, 2, 0.05), mats.steel));
      blade.position.set(3, 0.1, 0);
      const handle = shadowed(new THREE.Mesh(new RoundedBoxGeometry(7, 0.7, 1.1, 2, 0.25), mats.wood));
      handle.position.set(-4, 0.35, 0);
      group.add(blade, handle, at(hit(new THREE.BoxGeometry(17, 1.4, 2), id), 0, 0.4, 0));
      break;
    }
    case 'recRuler': {
      const marks: Array<[number, boolean, string?]> = [];
      for (let mm = 0; mm <= 300; mm += 5) marks.push([mm / 300, mm % 50 === 0, mm % 50 === 0 ? String(mm / 10) : undefined]);
      const tex = own(graduationTexture(marks, '#111111', { sub: 'cm' }));
      tex.center.set(0.5, 0.5);
      tex.rotation = -Math.PI / 2;
      const board = shadowed(new THREE.Mesh(new THREE.BoxGeometry(30, 0.3, 2.4), own(new THREE.MeshStandardMaterial({ color: 0xf4e9c8, roughness: 0.7 }))));
      board.position.y = 0.15;
      const face = new THREE.Mesh(new THREE.PlaneGeometry(30, 2.3), own(new THREE.MeshBasicMaterial({ map: tex, transparent: true })));
      face.rotation.x = -Math.PI / 2;
      face.position.y = 0.31;
      group.add(board, face, at(hit(new THREE.BoxGeometry(30, 1, 2.6), id), 0, 0.4, 0));
      break;
    }
    case 'recBurette': {
      const base = shadowed(new THREE.Mesh(new THREE.BoxGeometry(12, 1, 8), mats.darkMetal));
      base.position.y = 0.5;
      const rod = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 60, 10), mats.steel));
      rod.position.set(-4, 30, 0);
      const clamp = shadowed(new THREE.Mesh(new THREE.BoxGeometry(5, 1, 1), mats.darkMetal));
      clamp.position.set(-1.5, 45, 0);
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 50, 10, 1, true), mats.glass);
      tube.position.set(1, 32, 0);
      const cock = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 0.6), mats.blackPlastic));
      cock.position.set(1, 6.5, 0);
      group.add(base, rod, clamp, tube, cock, at(hit(new THREE.BoxGeometry(12, 60, 8), id), 0, 30, 0));
      break;
    }
    case 'recAnalytical': {
      const body = shadowed(new THREE.Mesh(new RoundedBoxGeometry(18, 4, 22, 2, 0.6), own(new THREE.MeshStandardMaterial({ color: 0xeef0f2, roughness: 0.5 }))));
      body.position.y = 2;
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(16, 16, 18), own(new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, roughness: 0.03, depthWrite: false })));
      cabin.position.y = 12;
      const lbl = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.6), own(new THREE.MeshStandardMaterial({ map: own(labelTexture(['Analítica 0,0001 g'], { band: '#123a63', w: 256, h: 48 })) })));
      lbl.position.set(0, 2.2, 11.05);
      group.add(body, cabin, lbl, at(hit(new THREE.BoxGeometry(18, 20, 22), id), 0, 10, 0));
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
      // La pera puesta sigue a la pipeta (arriba del vástago).
      if (ob.kind === 'filler' && ob.support === 'pipette25') {
        const pp = ctx.world.objects.pipette25.pose;
        const lying = ctx.world.objects.pipette25.support === 'bench';
        if (lying) group.position.set(pp.x + GEO01.pipette25.topZ, pp.z + 0.6, -pp.y);
        else group.position.set(pp.x, pp.z + GEO01.pipette25.topZ - 0.4, -pp.y);
        group.rotation.set(0, 0, lying ? -Math.PI / 2 : 0);
      } else {
        group.position.set(p.x, p.z, -p.y);
        group.rotation.set(0, 0, 0);
      }
      tiltable.rotation.set(0, 0, -p.rotationRad);
      if (ring) ring.visible = ctx.selected === id;
      update(ctx, ob);
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
