/**
 * Vistas 3D procedurales de la Práctica 7 (§14.2): tubos y vasos con sus fases (la polar abajo, la apolar arriba,
 * sedimento, turbidez y color que salen del inventario del dominio), gradillas, frascos con tapa y rótulo (las
 * incógnitas solo muestran su código), probeta de 10 mL con marcas de 0,2 mL, matraces aforados, goteros, espátula
 * con su carga, piseta, balanza granataria, detector de sólidos con su indicador y sus cables, conductímetro con su
 * pantalla y su sonda, viales patrón, muestras sólidas (tira metálica, varilla, placa de grafito que puede ponerse de
 * canto, cristales, bloque) sobre baldosas. SOLO leen el estado: nunca deciden que algo se disolvió o conduce.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Comp, MaterialId, P07Object, P07World, Vessel } from '../../simulation/bonding-world/types';
import { GEO07, FLASK_MARK_Z, areaOf, liquidHeightCm, shapeSpec } from '../../simulation/bonding-world/geometry';
import { meterDisplay, phaseHeights } from '../../simulation/bonding-world/world';
import { MATERIALS } from '../../simulation/solution-properties/materials';
import { compTotal, liquidMl } from '../../simulation/solution-properties/conservation';
import { quantize } from '../../simulation/metrology/uncertainty';
import type { QualityLevel } from '../quality';
import { materials } from '../renderers/materials';
import { graduationTexture, labelTexture, lcdTexture } from '../renderers/textures';
import type { FrameCtx07 } from './BondingLab3D';
import { RIM_Z, detectorPad } from './layout';

export interface ObjHandle07 {
  group: THREE.Group;
  update(ctx: FrameCtx07, o: P07Object): void;
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
const APOLAR = 0xf3efd2;
const OIL = 0xeedb8a;

type Own = <T extends THREE.Material | THREE.Texture>(m: T) => T;

/** Color de la fase polar: azul del Cu²⁺ según su concentración; si no, agua (§3.6, no es una medición). */
function polarColor(c: Comp): THREE.Color {
  const ml = liquidMl(c);
  const cu = ml > 0 ? ((c.CuSO4_5H2O ?? 0) / ml) * 1000 : 0;
  const col = new THREE.Color(WATER);
  if (cu > 0.5) col.lerp(new THREE.Color(0x1f6fd6), Math.min(1, cu / 40));
  if ((c.glycerol ?? 0) > (c.water ?? 0)) col.lerp(new THREE.Color(0xe8eef0), 0.5);
  return col;
}

/**
 * Líquido de un recipiente de forma cilíndrica: columna polar abajo, apolar arriba, sedimento y turbidez. Las alturas
 * salen del mismo perfil del dominio (`liquidHeightCm`).
 */
function phaseColumns(r: number, seg: number, own: Own) {
  const mk = (color: number, opacity: number) => {
    const mat = own(new THREE.MeshPhysicalMaterial({ color, emissive: color, emissiveIntensity: 0.1, roughness: 0.05, transparent: true, opacity, depthWrite: false }));
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, seg), mat);
    m.renderOrder = 2;
    return { m, mat };
  };
  const polar = mk(WATER, 0.55);
  const apolar = mk(APOLAR, 0.5);
  const men = new THREE.Mesh(new THREE.TorusGeometry(r * 0.96, Math.max(0.02, r * 0.07), 6, seg), own(new THREE.MeshBasicMaterial({ color: 0x2f6fa6, transparent: true, opacity: 0.85 })));
  men.rotation.x = Math.PI / 2;
  const iface = new THREE.Mesh(new THREE.CircleGeometry(r * 0.98, seg), own(new THREE.MeshBasicMaterial({ color: 0xb08a2a, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false })));
  iface.rotation.x = -Math.PI / 2;
  const sedMat = own(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }));
  const sediment = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r * 0.95, 1, seg), sedMat);
  const g = new THREE.Group();
  g.add(polar.m, apolar.m, men, iface, sediment);
  return {
    group: g,
    set(v: Vessel, floor: number, shapeH: (ml: number) => number, t: number, reducedMotion: boolean) {
      const pMl = liquidMl(v.polar);
      const aMl = liquidMl(v.apolar);
      const hP = shapeH(pMl);
      const hT = shapeH(pMl + aMl);
      polar.m.visible = hP > 0.01;
      polar.m.scale.y = Math.max(0.001, hP);
      polar.m.position.y = floor + hP / 2;
      polar.mat.color.copy(polarColor(v.polar));
      polar.mat.emissive.copy(polar.mat.color);
      apolar.m.visible = hT - hP > 0.01;
      apolar.m.scale.y = Math.max(0.001, hT - hP);
      apolar.m.position.y = floor + hP + (hT - hP) / 2;
      const oil = (v.apolar.mineralOil ?? 0) > (v.apolar.heptane ?? 0);
      apolar.mat.color.setHex(oil ? OIL : APOLAR);
      apolar.mat.emissive.setHex(oil ? OIL : APOLAR);
      iface.visible = polar.m.visible && apolar.m.visible;
      iface.position.y = floor + hP;
      men.visible = hT > 0.02;
      men.position.y = floor + hT;
      // Turbidez: emulsión pasajera o partículas en suspensión mientras se agita (no es una medida).
      const solidG = compTotal(v.solid);
      const turbid = Math.min(1, v.emulsion01 + (solidG > 0.002 && v.stir01 > 0.2 ? 0.5 : 0));
      polar.mat.opacity = 0.55 + 0.35 * turbid;
      apolar.mat.opacity = 0.5 + 0.35 * turbid;
      // Sedimento: altura según la masa sin disolver; el color del sólido que más hay.
      sediment.visible = solidG > 0.002;
      if (sediment.visible) {
        const main = (Object.entries(v.solid) as Array<[MaterialId, number]>).sort((a, b) => b[1] - a[1])[0][0];
        sedMat.color.setHex(MATERIALS[main].color);
        const h = Math.min(2, 0.08 + solidG * 0.6);
        sediment.scale.y = h;
        sediment.position.y = floor + h / 2 + (v.stir01 > 0.2 && !reducedMotion ? 0.05 * Math.sin(t * 20) : 0);
      }
    },
  };
}

function labelPlane(lines: string[], w: number, h: number, own: Own, band = '#123a63') {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), own(new THREE.MeshStandardMaterial({ map: own(labelTexture(lines, { band, w: 256, h: 96 })), roughness: 0.6 })));
}

/** Texto del rótulo (se recalcula si cambia: etiqueta del tubo o código de incógnita). */
function dynamicLabel(w: number, h: number, own: Own, band = '#123a63') {
  const mat = own(new THREE.MeshStandardMaterial({ roughness: 0.6 }));
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  let last = '';
  return {
    mesh,
    set(text: string) {
      if (text === last) return;
      last = text;
      mat.map?.dispose();
      mat.map = text ? labelTexture(text.split('\n'), { band, w: 256, h: 96 }) : null;
      mesh.visible = !!text;
      mat.needsUpdate = true;
    },
    dispose() {
      mat.map?.dispose();
    },
  };
}

export function createObjVisual07(o: P07Object, w0: P07World, q: QualityLevel, labelText = ''): ObjHandle07 {
  const mats = materials(q);
  const seg = q === 'LOW' ? 16 : q === 'MEDIUM' ? 24 : 36;
  const group = new THREE.Group();
  const disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture | { dispose(): void }> = [];
  let ring: THREE.Mesh | null = null;
  let update: ObjHandle07['update'] = () => undefined;
  const id = o.id;
  const own: Own = (m) => {
    disposables.push(m);
    return m;
  };
  const tiltable = new THREE.Group();
  group.add(tiltable);
  const vessel0 = w0.vessels[id];

  /** Recipiente cilíndrico de vidrio con fases, rótulo y escala opcional. */
  const glassVessel = (r: number, h: number, floor: number, scaleTex?: THREE.Texture, lip = true) => {
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.12, r + 0.12, h, seg, 1, true), mats.glass);
    glass.position.y = h / 2;
    glass.renderOrder = 3;
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(r + 0.12, seg), mats.glass);
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.y = 0.05;
    tiltable.add(glass, bottom);
    if (lip) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(r + 0.14, 0.06, 6, seg), mats.glass);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = h;
      tiltable.add(rim);
    }
    if (scaleTex) {
      const span = h - floor;
      const sc = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.14, r + 0.14, span, seg, 1, true, -Math.PI * 0.22, Math.PI * 0.44), own(new THREE.MeshBasicMaterial({ map: scaleTex, transparent: true, depthWrite: false })));
      sc.position.y = floor + span / 2;
      // Las marcas no tapan el líquido: se dibujan encima, sin escribir profundidad.
      sc.renderOrder = 4;
      tiltable.add(sc);
    }
    const cols = phaseColumns(r, seg, own);
    tiltable.add(cols.group);
    tiltable.add(at(hit(new THREE.CylinderGeometry(r + 0.6, r + 0.6, h + 0.6, 10), id), 0, (h + 0.6) / 2, 0));
    ring = selRing(r + 1);
    group.add(ring);
    return cols;
  };
  const vesselUpdate = (cols: ReturnType<typeof phaseColumns>, floor: number) => (ctx: FrameCtx07) => {
    const v = ctx.world.vessels[id];
    if (v) cols.set(v, floor, (ml) => liquidHeightCm(v.shape, ml), ctx.t, ctx.reducedMotion);
  };

  switch (o.kind) {
    case 'tube': {
      const T = GEO07.tube;
      const cols = glassVessel(T.r, T.h, T.floor);
      const lbl = dynamicLabel(1.5, 0.9, own);
      lbl.mesh.position.set(0, T.h - 3, T.outerR + 0.02);
      disposables.push(lbl);
      tiltable.add(lbl.mesh);
      const base = vesselUpdate(cols, T.floor);
      update = (ctx, ob) => {
        base(ctx);
        lbl.set(ob.label ?? '');
      };
      break;
    }

    case 'cylinder10': {
      const C = GEO07.cylinder10;
      const area = areaOf(C.r);
      const span = C.h - C.floor;
      const marks: Array<[number, boolean, string?]> = [];
      for (let i = 0; i <= 60; i++) {
        const ml = i * 0.2;
        if (ml > 12) break;
        marks.push([ml / area / span, i % 5 === 0, i % 10 === 0 && ml > 0 ? String(ml) : undefined]);
      }
      const cols = glassVessel(C.r, C.h, C.floor, own(graduationTexture(marks, '#123a63', { sub: '10 mL · 0,2' })));
      const base = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(C.baseR, C.baseR + 0.2, 0.7, 6), mats.glass));
      base.position.y = 0.35;
      tiltable.add(base);
      update = vesselUpdate(cols, C.floor);
      break;
    }

    case 'beaker': {
      const B = GEO07.beaker50;
      const area = areaOf(B.r);
      const span = B.h - B.floor;
      const marks: Array<[number, boolean, string?]> = [];
      for (let ml = 0; ml <= 50; ml += 5) marks.push([ml / area / span, ml % 10 === 0, ml % 10 === 0 && ml > 0 ? String(ml) : undefined]);
      const cols = glassVessel(B.r, B.h, B.floor, own(graduationTexture(marks, '#123a63', { sub: '50 mL ≈' })));
      const lbl = dynamicLabel(2.4, 1, own);
      lbl.mesh.position.set(0, 1.2, B.r + 0.2);
      disposables.push(lbl);
      tiltable.add(lbl.mesh);
      const base = vesselUpdate(cols, B.floor);
      update = (ctx) => {
        base(ctx);
        lbl.set(labelText);
      };
      break;
    }

    case 'flask': {
      // Matraz aforado de 100 mL: bulbo con la misma sección que el dominio y cuello con la marca de aforo.
      const F = GEO07.flask100;
      const bulbR = Math.sqrt(shapeSpec('flask100').areaCm2 / Math.PI);
      const bulb = new THREE.Mesh(new THREE.CylinderGeometry(bulbR + 0.12, bulbR + 0.25, F.bulbZ, seg, 1, true), mats.glass);
      bulb.position.y = F.bulbZ / 2;
      const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(F.neckR + 0.12, bulbR + 0.12, 1.2, seg, 1, true), mats.glass);
      shoulder.position.y = F.bulbZ + 0.6;
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(F.neckR + 0.12, F.neckR + 0.12, F.h - F.bulbZ - 1.2, seg, 1, true), mats.glass);
      neck.position.y = F.bulbZ + 1.2 + (F.h - F.bulbZ - 1.2) / 2;
      const mark = new THREE.Mesh(new THREE.TorusGeometry(F.neckR + 0.14, 0.04, 6, seg), own(new THREE.MeshBasicMaterial({ color: 0x0b2c4d })));
      mark.rotation.x = Math.PI / 2;
      mark.position.y = FLASK_MARK_Z;
      const lbl = labelPlane(['100 mL', '± 0,1 · 20 °C'], 2.6, 1.2, own);
      lbl.position.set(0, F.bulbZ * 0.5, bulbR + 0.3);
      const bottom = new THREE.Mesh(new THREE.CircleGeometry(bulbR + 0.25, seg), mats.glass);
      bottom.rotation.x = -Math.PI / 2;
      bottom.position.y = 0.05;
      tiltable.add(bulb, shoulder, neck, mark, lbl, bottom);
      // Líquido: columna en el bulbo y en el cuello, de la misma altura que calcula el dominio.
      const liqMat = own(new THREE.MeshPhysicalMaterial({ color: WATER, emissive: WATER, emissiveIntensity: 0.1, roughness: 0.05, transparent: true, opacity: 0.55, depthWrite: false }));
      const inB = new THREE.Mesh(new THREE.CylinderGeometry(bulbR, bulbR, 1, seg), liqMat);
      const inN = new THREE.Mesh(new THREE.CylinderGeometry(F.neckR, F.neckR, 1, 12), liqMat);
      inB.renderOrder = 2;
      inN.renderOrder = 2;
      const men = new THREE.Mesh(new THREE.TorusGeometry(F.neckR * 0.95, 0.04, 6, 16), own(new THREE.MeshBasicMaterial({ color: 0x2f6fa6 })));
      men.rotation.x = Math.PI / 2;
      const sedMat = own(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }));
      const sed = new THREE.Mesh(new THREE.CylinderGeometry(bulbR * 0.7, bulbR * 0.8, 1, seg), sedMat);
      tiltable.add(inB, inN, men, sed);
      tiltable.add(at(hit(new THREE.CylinderGeometry(bulbR + 0.6, bulbR + 0.6, F.h, 10), id), 0, F.h / 2, 0));
      ring = selRing(bulbR + 1);
      group.add(ring);
      update = (ctx) => {
        const v = ctx.world.vessels[id];
        if (!v) return;
        const h = liquidHeightCm('flask100', liquidMl(v.polar) + liquidMl(v.apolar));
        const top = F.floor + h;
        const inBulb = Math.min(top, F.bulbZ) - F.floor;
        inB.visible = inBulb > 0.01;
        inB.scale.y = Math.max(0.001, inBulb);
        inB.position.y = F.floor + inBulb / 2;
        const inNeck = Math.max(0, top - F.bulbZ);
        inN.visible = inNeck > 0.01;
        inN.scale.y = Math.max(0.001, inNeck);
        inN.position.y = F.bulbZ + inNeck / 2;
        men.visible = h > 0.02;
        men.position.y = top;
        liqMat.color.copy(polarColor(v.polar));
        liqMat.emissive.copy(liqMat.color);
        liqMat.opacity = 0.55 + 0.3 * Math.min(1, v.emulsion01 + (compTotal(v.solid) > 0.002 && v.stir01 > 0.2 ? 0.5 : 0));
        const sg = compTotal(v.solid);
        sed.visible = sg > 0.002;
        sed.scale.y = Math.min(1.5, 0.08 + sg * 0.5);
        sed.position.y = F.floor + sed.scale.y / 2;
      };
      break;
    }

    case 'bottle':
    case 'vial':
    case 'jar': {
      const shape = vessel0?.shape ?? 'bottle100';
      const spec = shape === 'bottle250' ? GEO07.bottle250 : shape === 'vial' ? GEO07.vial : shape === 'jar' ? GEO07.jar : GEO07.bottle100;
      const r = spec.r;
      const h = spec.h;
      const solids = o.kind === 'jar';
      const amber = !!vessel0 && (Object.keys(vessel0.apolar).length > 0 || (vessel0.polar.ethanol ?? 0) > 0 || (vessel0.polar.acetone ?? 0) > 0 || (vessel0.polar.isopropanol ?? 0) > 0);
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg, 1, true), amber ? mats.amberGlass : mats.glass);
      glass.position.y = h / 2;
      glass.renderOrder = 3;
      const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(solids ? r - 0.2 : 1.1, r, solids ? 0.4 : 1.6, seg, 1, true), amber ? mats.amberGlass : mats.glass);
      shoulder.position.y = h + (solids ? 0.2 : 0.8);
      const bottom = new THREE.Mesh(new THREE.CircleGeometry(r, seg), mats.glass);
      bottom.rotation.x = -Math.PI / 2;
      bottom.position.y = 0.05;
      const capR = solids ? r - 0.1 : shape === 'vial' ? r - 0.5 : 1.3;
      const capMesh = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(capR, capR, 0.9, 16), solids ? mats.blackPlastic : shape === 'vial' ? mats.plasticBlue : mats.rubberRed));
      const capZ = RIM_Z[shape] + 0.45;
      capMesh.position.y = capZ;
      const lbl = dynamicLabel(Math.min(4.4, r * 1.7), solids ? 1.8 : 2.2, own, labelText.startsWith('X-') || labelText.startsWith('Y-') ? '#6b2fb3' : '#123a63');
      lbl.mesh.position.set(0, h * 0.5, r + 0.05);
      disposables.push(lbl);
      tiltable.add(glass, shoulder, bottom, capMesh, lbl.mesh);
      const cols = phaseColumns(r - 0.15, seg, own);
      tiltable.add(cols.group);
      tiltable.add(at(hit(new THREE.CylinderGeometry(r + 0.4, r + 0.4, h + 2, 10), id), 0, (h + 2) / 2, 0));
      tiltable.add(at(hit(new THREE.CylinderGeometry(capR + 0.4, capR + 0.4, 1.4, 10), id, 'cap'), 0, capZ, 0));
      ring = selRing(r + 1);
      group.add(ring);
      update = (ctx) => {
        const v = ctx.world.vessels[id];
        if (!v) return;
        cols.set(v, spec.floor, (ml) => liquidHeightCm(v.shape, ml), ctx.t, ctx.reducedMotion);
        capMesh.visible = !!v.capped;
        lbl.set(labelText);
      };
      break;
    }

    case 'waste': {
      const R = GEO07.waste;
      const cols = glassVessel(R.r, R.h, R.floor);
      const band = o.label === 'org' ? '#b8860b' : o.label === 'solid' ? '#6d4c41' : '#1565c0';
      const lbl = new THREE.Mesh(new THREE.CylinderGeometry(R.r + 0.18, R.r + 0.18, 2.4, seg, 1, true, -0.6, 1.2), own(new THREE.MeshStandardMaterial({ map: own(labelTexture([labelText || 'Residuos'], { band, w: 256, h: 96 })) })));
      lbl.position.y = R.h * 0.72;
      tiltable.add(lbl);
      update = vesselUpdate(cols, R.floor);
      break;
    }

    case 'rack': {
      const R = GEO07.rack;
      const mat = own(new THREE.MeshStandardMaterial({ color: 0xdfe6ea, roughness: 0.6 }));
      const top = shadowed(new THREE.Mesh(new THREE.BoxGeometry(R.w, 0.6, R.d), mat));
      top.position.y = R.h;
      const mid = shadowed(new THREE.Mesh(new THREE.BoxGeometry(R.w, 0.5, R.d), mat));
      mid.position.y = 2;
      const base = shadowed(new THREE.Mesh(new THREE.BoxGeometry(R.w, 0.5, R.d), mat));
      base.position.y = 0.25;
      for (const x of [-R.w / 2 + 0.4, R.w / 2 - 0.4]) {
        const side = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.6, R.h, R.d), mat));
        side.position.set(x, R.h / 2, 0);
        group.add(side);
      }
      const holes = new THREE.Group();
      for (let i = 0; i < R.slots; i++) {
        const hole = new THREE.Mesh(new THREE.CircleGeometry(GEO07.tube.outerR + 0.15, 16), own(new THREE.MeshBasicMaterial({ color: 0x4a5560 })));
        hole.rotation.x = -Math.PI / 2;
        hole.position.set(-9.8 + i * R.pitch, R.h + 0.31, 0);
        holes.add(hole);
      }
      group.add(top, mid, base, holes, at(hit(new THREE.BoxGeometry(R.w, R.h, R.d), id), 0, R.h / 2, 0));
      break;
    }

    case 'watchGlass': {
      const G = GEO07.watchGlass;
      const dish = shadowed(new THREE.Mesh(new THREE.SphereGeometry(G.r * 1.6, seg, 8, 0, Math.PI * 2, Math.PI * 0.82, Math.PI * 0.18), mats.glass));
      dish.rotation.x = Math.PI;
      dish.position.y = G.r * 1.6;
      const heapMat = own(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }));
      const heap = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 12), heapMat);
      const wet = new THREE.Mesh(new THREE.CircleGeometry(G.r * 0.6, 20), own(new THREE.MeshBasicMaterial({ color: 0xa8d0ee, transparent: true, opacity: 0.5 })));
      wet.rotation.x = -Math.PI / 2;
      wet.position.y = 0.3;
      group.add(dish, heap, wet, at(hit(new THREE.CylinderGeometry(G.r + 0.2, G.r + 0.2, 1.2, 12), id), 0, 0.6, 0));
      ring = selRing(G.r + 0.6);
      group.add(ring);
      update = (ctx) => {
        const v = ctx.world.vessels[id];
        const g = v ? compTotal(v.solid) : 0;
        heap.visible = g > 0.002;
        if (heap.visible) {
          const main = (Object.entries(v!.solid) as Array<[MaterialId, number]>).sort((a, b) => b[1] - a[1])[0][0];
          heapMat.color.setHex(MATERIALS[main].color);
          const s = Math.min(1.6, 0.35 + Math.cbrt(g) * 0.9);
          heap.scale.set(s, s * 0.6, s);
          heap.position.y = 0.2 + s * 0.3;
        }
        wet.visible = !!v && liquidMl(v.polar) > 0.01;
      };
      break;
    }

    case 'spatula': {
      const L = GEO07.spatula.length;
      const handle = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, L * 0.55, 10), own(new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 0.6 }))));
      handle.rotation.z = Math.PI / 2;
      handle.position.x = L * 0.22;
      const blade = shadowed(new THREE.Mesh(new THREE.BoxGeometry(L * 0.45, 0.08, 0.9), mats.steel));
      blade.position.x = -L * 0.27;
      const loadMat = own(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }));
      const load = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 6), loadMat);
      load.position.set(-L * 0.42, 0.25, 0);
      const inner = new THREE.Group();
      inner.add(handle, blade, load);
      group.add(inner, at(hit(new THREE.BoxGeometry(L, 1, 1.4), id), 0, 0.3, 0));
      update = (ctx, ob) => {
        const g = compTotal(ctx.world.spatula.load);
        load.visible = g > 0.001;
        if (load.visible) {
          const main = (Object.entries(ctx.world.spatula.load) as Array<[MaterialId, number]>).sort((a, b) => b[1] - a[1])[0][0];
          loadMat.color.setHex(MATERIALS[main].color);
          load.scale.setScalar(0.5 + Math.cbrt(g) * 1.2);
        }
        // Acostada en la mesada; en la mano o dentro de un frasco, casi vertical con la hoja abajo.
        const lying = ob.support === 'bench';
        inner.rotation.set(0, 0, lying ? 0 : Math.PI / 2 - 0.25);
        inner.position.set(lying ? 0 : 0.4, lying ? 0 : L * 0.42, 0);
      };
      break;
    }

    case 'dropper': {
      const D = GEO07.dropper;
      const inner = new THREE.Group();
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(D.r + 0.08, D.r + 0.08, D.length - D.tipLen, 10, 1, true), mats.glass);
      barrel.position.y = D.tipLen + (D.length - D.tipLen) / 2;
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.06, D.tipLen, 8, 1, true), mats.glass);
      tip.position.y = D.tipLen / 2;
      const bulb = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.75, 12, 8), mats.rubberRed));
      bulb.scale.set(1, 1.5, 1);
      bulb.position.y = D.length + 0.8;
      const marks: Array<[number, boolean, string?]> = [];
      const span = D.length - D.tipLen;
      for (let ml = 0; ml <= 5; ml += 0.5) marks.push([ml / (Math.PI * D.r * D.r) / span, ml % 1 === 0, ml % 1 === 0 && ml > 0 ? String(ml) : undefined]);
      const scale = new THREE.Mesh(new THREE.CylinderGeometry(D.r + 0.1, D.r + 0.1, span, 10, 1, true, -0.8, 1.6), own(new THREE.MeshBasicMaterial({ map: own(graduationTexture(marks, '#123a63')), transparent: true, depthWrite: false })));
      scale.position.y = D.tipLen + span / 2;
      const liqMat = own(new THREE.MeshPhysicalMaterial({ color: WATER, roughness: 0.05, transparent: true, opacity: 0.7, depthWrite: false }));
      const liq = new THREE.Mesh(new THREE.CylinderGeometry(D.r, D.r, 1, 10), liqMat);
      inner.add(barrel, tip, bulb, scale, liq);
      inner.add(at(hit(new THREE.CylinderGeometry(0.8, 0.8, D.length + 2, 8), id), 0, (D.length + 2) / 2, 0));
      group.add(inner);
      update = (ctx, ob) => {
        const d = ctx.world.droppers[id];
        const ml = d ? liquidMl(d.content) : 0;
        const hh = ml / (Math.PI * D.r * D.r);
        liq.visible = hh > 0.02;
        liq.scale.y = Math.max(0.001, hh);
        liq.position.y = D.tipLen + hh / 2;
        const apolar = d && ((d.content.heptane ?? 0) + (d.content.mineralOil ?? 0)) > (d.content.water ?? 0);
        liqMat.color.setHex(apolar ? APOLAR : d ? polarColor(d.content).getHex() : WATER);
        bulb.scale.set(d && d.squeeze01 > 0 ? 0.8 : 1, d && d.squeeze01 > 0 ? 1.2 : 1.5, d && d.squeeze01 > 0 ? 0.8 : 1);
        inner.rotation.set(0, 0, ob.support === 'bench' ? -Math.PI / 2 : 0);
      };
      break;
    }

    case 'stirRod': {
      const L = GEO07.stirRod.length;
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(GEO07.stirRod.r, GEO07.stirRod.r, L, 8), mats.glass);
      rod.position.y = L / 2;
      const inner = new THREE.Group();
      inner.add(rod, at(hit(new THREE.CylinderGeometry(0.7, 0.7, L, 6), id), 0, L / 2, 0));
      group.add(inner);
      update = (ctx, ob) => {
        const v = ctx.world.vessels[ob.support];
        const swirl = v && v.stir01 > 0 && !ctx.reducedMotion ? 0.12 * Math.sin(ctx.t * 14) : 0;
        inner.rotation.set(swirl, 0, ob.support === 'bench' ? -Math.PI / 2 : 0.08 + swirl);
      };
      break;
    }

    case 'washBottle': {
      const W = GEO07.washBottle;
      const body = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(W.r, W.r + 0.2, W.h * 0.8, seg), mats.plasticWhite));
      body.position.y = W.h * 0.4;
      const capM = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 1.2, 12), mats.plasticBlue));
      capM.position.y = W.h * 0.8 + 0.6;
      const tube = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 7, 8), mats.plasticWhite));
      tube.position.set(1.8, W.h * 0.8 + 3.2, 0);
      tube.rotation.z = -0.7;
      const lbl = labelPlane(['H₂O', 'purificada'], 4, 2, own, '#2f7fd1');
      lbl.position.set(0, W.h * 0.4, W.r + 0.12);
      group.add(body, capM, tube, lbl, at(hit(new THREE.CylinderGeometry(W.r + 0.6, W.r + 0.6, W.h + 2, 10), id), 0, (W.h + 2) / 2, 0));
      break;
    }

    case 'balance': {
      // Balanza granataria 22 × 26 cm, platillo cuadrado de 14 cm, pantalla, ON/OFF y TARA.
      const B = GEO07.balance;
      const body = shadowed(new THREE.Mesh(new RoundedBoxGeometry(B.w, 7.4, B.d, 3, 0.8), own(new THREE.MeshStandardMaterial({ color: 0xe9ecef, roughness: 0.5 }))));
      body.position.set(0, 3.7, 0);
      const pan = shadowed(new THREE.Mesh(new THREE.BoxGeometry(B.pan, 0.3, B.pan), mats.steel));
      pan.position.set(0, B.panZ - 0.15, -2);
      const front = shadowed(new THREE.Mesh(new THREE.BoxGeometry(B.w - 2, 3.2, 1), own(new THREE.MeshStandardMaterial({ color: 0x3a4652, roughness: 0.5 }))));
      front.position.set(0, 3.2, B.d / 2 - 0.2);
      const lcd = lcdTexture(320, 80);
      own(lcd.texture);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.4), own(new THREE.MeshBasicMaterial({ map: lcd.texture })));
      screen.position.set(-2, 3.2, B.d / 2 + 0.32);
      const btn = (x: number, m: THREE.Material) => at(shadowed(new THREE.Mesh(new RoundedBoxGeometry(2.2, 1.2, 0.6, 2, 0.2), m)), x, 3.2, B.d / 2 + 0.4);
      const lbl = labelPlane(['ON/OFF    TARA'], 6.4, 1.1, own, '#3a4652');
      lbl.position.set(7.5, 1.2, B.d / 2 + 0.35);
      group.add(body, pan, front, screen, btn(6, mats.rubberRed), btn(9, mats.plasticBlue), lbl);
      group.add(at(hit(new THREE.BoxGeometry(3, 2, 1.6), id, 'power'), 6, 3.2, B.d / 2 + 0.4));
      group.add(at(hit(new THREE.BoxGeometry(3, 2, 1.6), id, 'tare'), 9, 3.2, B.d / 2 + 0.4));
      group.add(at(hit(new THREE.BoxGeometry(11, 3, 1.4), id, 'display'), -2, 3.2, B.d / 2 + 0.3));
      group.add(at(hit(new THREE.BoxGeometry(B.w, 7.4, B.d), id), 0, 3.7, 0));
      ring = selRing(15);
      group.add(ring);
      update = (ctx) => {
        const b = ctx.world.balance;
        const shown = quantize(b.shownG, ctx.world.params.balance.resolutionG);
        if (!b.powered) lcd.set('', '#1b2a20');
        else lcd.set(shown.toFixed(2), b.stable ? '#6ef08a' : '#f0c36e', b.stable ? 'g  ●' : 'g  ~');
      };
      break;
    }

    case 'detector': {
      // Detector de sólidos: fuente limitada, indicador LED (intensidad de la corriente CALCULADA), lectura en mA,
      // rango, cables y panel de control incorporado (§3.5, §14.2).
      const D = GEO07.detector;
      const body = shadowed(new THREE.Mesh(new RoundedBoxGeometry(D.w, D.h, D.d, 3, 0.5), own(new THREE.MeshStandardMaterial({ color: 0x2f3b45, roughness: 0.55 }))));
      body.position.y = D.h / 2;
      const ledMat = own(new THREE.MeshStandardMaterial({ color: 0x3a1010, emissive: 0xff3b30, emissiveIntensity: 0 }));
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.6, 14, 10), ledMat);
      led.position.set(-3.4, D.h + 0.3, -1);
      const lcd = lcdTexture(256, 80);
      own(lcd.texture);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.6), own(new THREE.MeshBasicMaterial({ map: lcd.texture })));
      screen.position.set(-0.6, D.h * 0.6, D.d / 2 + 0.02);
      const pad = detectorPad(w0);
      const padMesh = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(pad.r, pad.r, 0.2, 20), mats.chrome));
      padMesh.position.set(pad.x - o.pose.x, D.h + 0.1, -(pad.y - o.pose.y));
      const padLbl = labelPlane(['CONTROL'], 2.6, 0.7, own, '#1e8e4e');
      padLbl.rotation.x = -Math.PI / 2;
      padLbl.position.set(padMesh.position.x, D.h + 0.22, padMesh.position.z + pad.r + 0.6);
      const btn = (x: number, m: THREE.Material) => at(shadowed(new THREE.Mesh(new RoundedBoxGeometry(1.6, 0.9, 0.5, 2, 0.15), m)), x, D.h * 0.3, D.d / 2 + 0.2);
      const lbl = labelPlane(['ON   RANGO   1,0 V · 100 Ω'], 7, 0.8, own, '#2f3b45');
      lbl.position.set(0, D.h * 0.12, D.d / 2 + 0.03);
      const sockets = [-1.5, 1.5].map((x) => at(shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.6, 10), x < 0 ? mats.rubberRed : mats.blackPlastic)), 3.6 + x * 0.5, D.h + 0.3, 1.8));
      group.add(body, led, screen, padMesh, padLbl, btn(-3, mats.rubberRed), btn(-0.6, mats.plasticBlue), lbl, ...sockets);
      // Cables hasta las puntas (se redibujan con las poses de las puntas).
      const cableMat = own(new THREE.LineBasicMaterial({ color: 0x222222 }));
      const cables = ['tipA', 'tipB'].map(() => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9 * 3), 3));
        const line = new THREE.Line(geo, cableMat);
        line.frustumCulled = false;
        group.add(line);
        return line;
      });
      group.add(at(hit(new THREE.BoxGeometry(2, 1.2, 1), id, 'power'), -3, D.h * 0.3, D.d / 2 + 0.2));
      group.add(at(hit(new THREE.BoxGeometry(2, 1.2, 1), id, 'range'), -0.6, D.h * 0.3, D.d / 2 + 0.2));
      group.add(at(hit(new THREE.BoxGeometry(5.4, 2, 1), id, 'display'), -0.6, D.h * 0.6, D.d / 2));
      group.add(at(hit(new THREE.BoxGeometry(2.6, 1, 1.6), id, 'cable'), 3.6, D.h + 0.3, 1.8));
      group.add(at(hit(new THREE.BoxGeometry(D.w, D.h, D.d), id), 0, D.h / 2, 0));
      ring = selRing(7);
      group.add(ring);
      update = (ctx, ob) => {
        const d = ctx.world.detector;
        ledMat.emissiveIntensity = d.powered ? 0.15 + 2.5 * d.indicator01 : 0;
        ledMat.color.setHex(d.indicator01 > 0 ? 0xff5a4f : 0x3a1010);
        const rng = d.range === 'LOW' ? { max: 2, res: 0.001 } : { max: 20, res: 0.01 };
        if (!d.powered) lcd.set('', '#1b2a20');
        else lcd.set(d.shownMA > rng.max ? '- OL -' : quantize(d.shownMA, rng.res).toFixed(d.range === 'LOW' ? 3 : 2), '#6ef08a', `mA ${d.range === 'LOW' ? 'L' : 'H'}`);
        cables.forEach((line, i) => {
          const tip = ctx.world.objects[i === 0 ? 'tipA' : 'tipB'];
          line.visible = d.cablesOk && !!tip;
          if (!tip) return;
          const sx = 3.6 + (i === 0 ? -0.75 : 0.75);
          const sy = D.h + 0.3;
          const sz = 1.8;
          const tx = tip.pose.x - ob.pose.x;
          const ty = tip.pose.z + 3;
          const tz = -(tip.pose.y - ob.pose.y);
          const pos = line.geometry.attributes.position as THREE.BufferAttribute;
          for (let k = 0; k < 9; k++) {
            const u = k / 8;
            const sag = Math.sin(u * Math.PI) * 2.5;
            pos.setXYZ(k, sx + (tx - sx) * u, sy + (ty - sy) * u + sag * 0.6, sz + (tz - sz) * u);
          }
          pos.needsUpdate = true;
        });
      };
      break;
    }

    case 'tip': {
      const red = id === 'tipA';
      const inner = new THREE.Group();
      const handle = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, 7, 10), red ? mats.rubberRed : mats.blackPlastic));
      handle.position.y = 4.8;
      const needle = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.03, 1.4, 6), mats.chrome));
      needle.position.y = 0.7;
      const guard = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.3, 10), red ? mats.rubberRed : mats.blackPlastic));
      guard.position.y = 1.4;
      inner.add(handle, needle, guard, at(hit(new THREE.CylinderGeometry(0.8, 0.8, 8.6, 8), id), 0, 4.3, 0));
      group.add(inner);
      update = (_ctx, ob) => {
        inner.rotation.set(0, 0, ob.support === 'bench' ? -Math.PI / 2 : 0);
        inner.position.y = ob.support === 'bench' ? 0.4 : 0;
      };
      break;
    }

    case 'meter': {
      // Conductímetro genérico: pantalla con κ, unidad, temperatura y estado; botones y cable de la sonda.
      const M = GEO07.meter;
      const body = shadowed(new THREE.Mesh(new RoundedBoxGeometry(M.w, M.h, M.d, 3, 0.6), own(new THREE.MeshStandardMaterial({ color: 0xf2f4f5, roughness: 0.5 }))));
      body.position.y = M.h / 2;
      const lcd = lcdTexture(320, 110);
      own(lcd.texture);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(9, 3.1), own(new THREE.MeshBasicMaterial({ map: lcd.texture })));
      screen.rotation.x = -Math.PI / 2 + 0.35;
      screen.position.set(-2, M.h + 0.05, 0.5);
      const btn = (x: number, m: THREE.Material) => at(shadowed(new THREE.Mesh(new RoundedBoxGeometry(1.6, 0.6, 1.2, 2, 0.2), m)), x, M.h + 0.2, 3.4);
      const lbl = labelPlane(['ON  RANGO  CAL'], 6, 0.8, own, '#3a4652');
      lbl.rotation.x = -Math.PI / 2;
      lbl.position.set(5.2, M.h + 0.05, 1.2);
      group.add(body, screen, btn(3.3, mats.rubberRed), btn(5.3, mats.plasticBlue), btn(7.3, mats.plasticYellow), lbl);
      const cableMat = own(new THREE.LineBasicMaterial({ color: 0x222222 }));
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9 * 3), 3));
      const cable = new THREE.Line(geo, cableMat);
      cable.frustumCulled = false;
      group.add(cable);
      group.add(at(hit(new THREE.BoxGeometry(2, 1, 1.6), id, 'power'), 3.3, M.h + 0.2, 3.4));
      group.add(at(hit(new THREE.BoxGeometry(2, 1, 1.6), id, 'range'), 5.3, M.h + 0.2, 3.4));
      group.add(at(hit(new THREE.BoxGeometry(2, 1, 1.6), id, 'cal'), 7.3, M.h + 0.2, 3.4));
      group.add(at(hit(new THREE.BoxGeometry(9.4, 1.4, 3.6), id, 'display'), -2, M.h + 0.3, 0.5));
      group.add(at(hit(new THREE.BoxGeometry(M.w, M.h, M.d), id), 0, M.h / 2, 0));
      ring = selRing(10);
      group.add(ring);
      update = (ctx, ob) => {
        const w = ctx.world;
        const m = w.meter;
        if (!m.powered) lcd.set('', '#1b2a20');
        else {
          const d = meterDisplay(w);
          const txt = d.over ? '- OL -' : d.unit === 'mS/cm' ? d.value.toFixed(2) : d.value.toFixed(m.range === 'LOW' ? 1 : 0);
          lcd.set(txt, m.stable ? '#6ef08a' : '#f0c36e', `${d.unit} ${m.probeTempC.toFixed(1)} °C ${m.atc ? 'ATC' : ''} ${m.stable ? '●' : '~'}`);
        }
        const p = w.objects.probe01;
        if (!p) return;
        const tx = p.pose.x - ob.pose.x;
        const ty = p.pose.z + GEO07.probe.length;
        const tz = -(p.pose.y - ob.pose.y);
        const pos = cable.geometry.attributes.position as THREE.BufferAttribute;
        for (let k = 0; k < 9; k++) {
          const u = k / 8;
          pos.setXYZ(k, 7.5 + (tx - 7.5) * u, M.h * 0.5 + (ty - M.h * 0.5) * u + Math.sin(u * Math.PI) * 3, -M.d / 2 + (tz + M.d / 2) * u);
        }
        pos.needsUpdate = true;
      };
      break;
    }

    case 'probe': {
      const P = GEO07.probe;
      const inner = new THREE.Group();
      const body = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(P.r * 0.55, P.r * 0.55, P.length - P.cellCm, 14), mats.blackPlastic));
      body.position.y = P.cellCm + (P.length - P.cellCm) / 2;
      const cell = new THREE.Mesh(new THREE.CylinderGeometry(P.r * 0.6, P.r * 0.6, P.cellCm, 14, 1, true), own(new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, side: THREE.DoubleSide })));
      cell.position.y = P.cellCm / 2;
      const plates = [-0.25, 0.25].map((x) => at(new THREE.Mesh(new THREE.BoxGeometry(0.08, P.cellCm * 0.8, 0.5), mats.chrome), x, P.cellCm / 2, 0));
      const mark = new THREE.Mesh(new THREE.TorusGeometry(P.r * 0.58, 0.04, 6, 16), own(new THREE.MeshBasicMaterial({ color: 0xffc400 })));
      mark.rotation.x = Math.PI / 2;
      mark.position.y = 1.5;
      inner.add(body, cell, ...plates, mark, at(hit(new THREE.CylinderGeometry(P.r, P.r, P.length, 8), id), 0, P.length / 2, 0));
      group.add(inner);
      update = (_ctx, ob) => {
        inner.rotation.set(0, 0, ob.support === 'bench' ? -Math.PI / 2 : 0);
        inner.position.y = ob.support === 'bench' ? 0.6 : 0;
      };
      break;
    }

    case 'tile': {
      const T = GEO07.tile;
      // Baldosa oscura: los cristales blancos (sal, azúcar, parafina) tienen que verse sobre ella.
      const t = shadowed(new THREE.Mesh(new THREE.BoxGeometry(T.w, T.h, T.d), own(new THREE.MeshStandardMaterial({ color: 0x3b4650, roughness: 0.8 }))));
      t.position.y = T.h / 2;
      group.add(t, at(hit(new THREE.BoxGeometry(T.w, T.h, T.d), id), 0, T.h / 2, 0));
      break;
    }

    case 'specimen': {
      const sp = w0.specimens[id];
      const m = MATERIALS[sp.material];
      const metal = m.family === 'metal' || m.family === 'alloy';
      const mat = own(new THREE.MeshStandardMaterial({ color: m.color, metalness: metal ? 0.85 : sp.material === 'graphite' ? 0.35 : 0, roughness: metal ? 0.32 : sp.material === 'graphite' ? 0.5 : 0.75 }));
      const inner = new THREE.Group();
      let body: THREE.Mesh;
      if (m.look === 'rod') {
        body = new THREE.Mesh(new THREE.CylinderGeometry(sp.widthCm / 2, sp.widthCm / 2, sp.lengthCm, 12), mat);
        body.rotation.z = Math.PI / 2;
        body.position.y = sp.widthCm / 2;
      } else if (m.look === 'crystals') {
        // Cristal: un cubo principal con caras nítidas y unos granos alrededor (no es una estructura molecular).
        body = new THREE.Mesh(new THREE.BoxGeometry(sp.lengthCm, sp.thickCm, sp.widthCm), mat);
        body.position.y = sp.thickCm / 2;
        body.rotation.y = 0.3;
        for (let k = 0; k < 4; k++) {
          const g = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), mat);
          g.position.set(Math.cos(k * 1.7) * 1.3, 0.18, Math.sin(k * 1.7) * 1.1);
          g.rotation.set(k, k * 0.7, 0);
          inner.add(g);
        }
      } else {
        body = new THREE.Mesh(new THREE.BoxGeometry(sp.lengthCm, sp.thickCm, sp.widthCm), mat);
        body.position.y = sp.thickCm / 2;
      }
      inner.add(shadowed(body));
      if (sp.oxide) {
        const film = new THREE.Mesh(new THREE.BoxGeometry(sp.lengthCm * 1.01, sp.thickCm * 1.2, sp.widthCm * 1.01), own(new THREE.MeshStandardMaterial({ color: 0xb9bec4, roughness: 0.95, transparent: true, opacity: 0.45 })));
        film.position.copy(body.position);
        inner.add(film);
      }
      const wet = new THREE.Mesh(new THREE.BoxGeometry(sp.lengthCm * 1.02, 0.04, sp.widthCm * 1.02), own(new THREE.MeshBasicMaterial({ color: 0x9fd0f0, transparent: true, opacity: 0.55 })));
      inner.add(wet);
      // Flecha de orientación del grafito (S08): indica la dirección de las capas.
      if (sp.material === 'graphite') {
        const arrow = new THREE.Mesh(new THREE.PlaneGeometry(sp.lengthCm * 0.7, 0.5), own(new THREE.MeshBasicMaterial({ map: own(labelTexture(['↔ capas'], { band: '#3a3d42', w: 192, h: 40 })), transparent: true })));
        arrow.rotation.x = -Math.PI / 2;
        arrow.position.y = sp.thickCm + 0.01;
        inner.add(arrow);
      }
      group.add(inner, at(hit(new THREE.BoxGeometry(sp.lengthCm + 0.6, Math.max(sp.thickCm, sp.widthCm) + 0.6, sp.widthCm + 0.8), id), 0, 0.6, 0));
      ring = selRing(Math.max(2, sp.lengthCm / 2 + 0.6));
      group.add(ring);
      update = (ctx) => {
        const s = ctx.world.specimens[id];
        if (!s) return;
        // De canto, la placa se para sobre su borde largo: el recorrido entre las puntas cruza las capas.
        inner.rotation.set(s.orientation === 'edge' ? Math.PI / 2 : 0, 0, 0);
        inner.position.set(0, s.orientation === 'edge' ? s.widthCm / 2 : 0, 0);
        wet.visible = s.surfaceWaterG > 0.002;
        wet.position.y = s.thickCm + 0.03;
      };
      break;
    }

    case 'ppeBoard': {
      const board = shadowed(new THREE.Mesh(new THREE.BoxGeometry(24, 30, 1), own(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }))));
      board.position.set(0, 16, 0);
      const poster = labelPlane(['EPP', 'Gafas · bata', 'guantes nitrilo', 'calzado cerrado', 'Sin llamas'], 22, 26, own, '#1e8e4e');
      poster.position.set(0, 16, 0.55);
      const leg = shadowed(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 8), mats.darkMetal));
      leg.position.set(0, 1, -2);
      group.add(board, poster, leg, at(hit(new THREE.BoxGeometry(24, 30, 2), id), 0, 16, 0));
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
      group.rotation.set(0, 0, 0);
      tiltable.rotation.set(0, 0, -p.rotationRad);
      if (ring) ring.visible = ctx.selected === id;
      update(ctx, ob);
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}

/** Altura total del líquido de un recipiente (para etiquetas y cámara). */
export const vesselLevelCm = (v: Vessel) => phaseHeights(v).total;
