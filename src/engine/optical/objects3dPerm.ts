/**
 * Vistas 3D procedurales de los objetos propios de B03 (§4): bandeja de membranas y piezas (color por material,
 * humedad y rotura), plato de remojo, cámaras de dos compartimentos (paredes, membrana, pinza, tapa y el líquido de
 * cada lado con su color), frascos, probetas graduadas, pipeta, vaso de enjuague, gradilla y tubos, termómetro,
 * colorímetro y residuos químicos. Como en B01/B02, SOLO leen el estado del dominio: el color de cada líquido sale de
 * sus cantidades (trazador, proteína, jarabe, Biuret, AgCl), nunca de un resultado esperado.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { OpticalObject, OpticalWorld } from '../../simulation/optical-world/types';
import type { PermWorld, Vessel } from '../../simulation/perm-world/types';
import { CELL_POS, GEO_B03, sideOffset } from '../../simulation/perm-world/geometry';
import type { MaterialSet } from '../renderers/materials';
import type { FrameCtxB01 } from './OpticalLab3D';
import type { CellVisual } from './objects3dCell';
import { hitMesh } from './parts';

type Own = <T extends THREE.Material | THREE.Texture>(m: T) => T;
type Label = (lines: string[], w: number, h: number, band: string) => THREE.Mesh;

const box = (w: number, h: number, d: number, m: THREE.Material) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const cyl = (r: number, h: number, m: THREE.Material, seg = 16) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m);
const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number) => (o.position.set(x, y, z), o);

const WATER = new THREE.Color(0x9cc8ea);
const TRACER = new THREE.Color(0x8a4a1e);
const PROTEIN = new THREE.Color(0xf2efe0);
const SYRUP = new THREE.Color(0xe2b866);
const BIURET_BLUE = new THREE.Color(0x3f6fd8);
const BIURET_VIOLET = new THREE.Color(0x7b3fb5);
const AGCL = new THREE.Color(0xf4f4f0);

const perm = (w: OpticalWorld) => (w as PermWorld).perm;

/** Color y opacidad de un líquido según lo que contiene (solo cantidades del dominio). */
export function liquidLook(v: Vessel, ageS: number | null, delayS: number): { color: THREE.Color; opacity: number } {
  const c = WATER.clone();
  const vol = Math.max(1e-6, v.volumeMl);
  const tracer = v.amounts.tracer / vol;
  if (tracer > 0) c.lerp(TRACER, Math.min(0.9, tracer / 0.012));
  const syrup = v.tags.some((t) => t === 'bS' || t === 'bSc' || t === 'bL') || v.amounts.glucose > 0;
  if (syrup) c.lerp(SYRUP, 0.35);
  const mg = v.amounts.protein / vol;
  let opacity = 0.45;
  if (mg > 0.5) {
    c.lerp(PROTEIN, Math.min(0.7, mg / 120));
    opacity = Math.min(0.85, 0.5 + mg / 300);
  }
  if (v.biuretMl > 0) {
    // El complejo violeta necesita tiempo de desarrollo; antes solo se ve el azul del reactivo.
    const dev = ageS === null ? 0 : Math.min(1, ageS / Math.max(1, delayS));
    c.lerp(BIURET_BLUE, 0.75);
    if (mg > 1) c.lerp(BIURET_VIOLET, 0.25 + 0.65 * dev);
    opacity = Math.max(opacity, 0.7);
  }
  if (v.pptMmol > 0) {
    c.lerp(AGCL, Math.min(0.85, v.pptMmol / 0.02));
    opacity = Math.max(opacity, Math.min(0.92, 0.55 + v.pptMmol * 20));
  }
  return { color: c, opacity };
}

/** Geometría vertical de cada recipiente: base interior y altura útil (cm), para el líquido y el menisco. */
function vesselBox(w: OpticalWorld, id: string): { base: number; h: number } | null {
  const o = w.objects[id];
  if (!o) return null;
  switch (o.kind) {
    case 'twoChamber':
      return id === 'c3' ? { base: 0.6, h: GEO_B03.cellTall.h - 1.2 } : { base: 0.6, h: GEO_B03.cell.h - 1.2 };
    case 'reagentBottle':
      return { base: 0.4, h: GEO_B03.bottle.h * 0.7 };
    case 'gradCylinder':
      return { base: 0.8, h: GEO_B03.cylinder.h - 2 };
    case 'beaker':
      return { base: 0.3, h: GEO_B03.beaker.h - 1 };
    case 'testTube':
      return { base: 0.6, h: GEO_B03.tube.h - 1.4 };
    case 'chemWaste':
      return { base: 0.5, h: GEO_B03.waste.h - 1 };
  }
  return null;
}

/** Altura del menisco (cm sobre la mesada) de un recipiente o de un lado de cámara (`c3:A`); null si no aplica. */
export function meniscusAt(w: OpticalWorld, target: string): { x: number; y: number; z: number } | null {
  const [id, side] = target.split(':');
  const o = w.objects[id];
  const g = vesselBox(w, id);
  if (!o || !g) return null;
  const P = perm(w);
  const v = side ? P.cells[id]?.sides[side as 'A' | 'B'] : P.vessels[id];
  if (!v) return null;
  const f = Math.min(1, v.volumeMl / Math.max(1e-6, v.capacityMl));
  const x = side ? CELL_POS[id].x + sideOffset(side as 'A' | 'B') : o.pose.x;
  return { x, y: o.pose.y, z: o.pose.z + g.base + f * g.h };
}

/** Líquido dentro de un recipiente cilíndrico o prismático: escala vertical y color desde el dominio. */
function liquidMesh(geo: THREE.BufferGeometry, own: Own) {
  const mat = own(new THREE.MeshStandardMaterial({ color: WATER, transparent: true, opacity: 0.45, roughness: 0.15, depthWrite: false }));
  const m = new THREE.Mesh(geo, mat);
  return { mesh: m, mat };
}

function setLiquid(mesh: THREE.Mesh, mat: THREE.MeshStandardMaterial, v: Vessel | undefined, base: number, h: number, ageS: number | null, delayS: number) {
  const f = v ? Math.min(1, v.volumeMl / Math.max(1e-6, v.capacityMl)) : 0;
  mesh.visible = f > 0.002;
  mesh.scale.y = Math.max(0.001, f);
  mesh.position.y = base + (h * Math.max(0.001, f)) / 2;
  if (v && mesh.visible) {
    const l = liquidLook(v, ageS, delayS);
    mat.color.copy(l.color);
    mat.opacity = l.opacity;
  }
}

const MEMBRANE_COLOR: Record<string, number> = { dialysis: 0xd9cfa8, dialysisWide: 0xc7d6b0, cellophane: 0xe6eef6, film: 0xf3f3f3 };

/** Construye la vista de un objeto de B03 en `group`; null si la clase no es de B03. */
export function buildPermObject(o: OpticalObject, w0: OpticalWorld, group: THREE.Group, mats: MaterialSet, own: Own, label: Label, seg: number): CellVisual | null {
  const id = o.id;
  const delayS = (w0 as PermWorld).params.perm?.assay.biuretDelayS ?? 120;
  switch (o.kind) {
    case 'membraneTray': {
      const T = GEO_B03.tray;
      const tray = new THREE.Mesh(new RoundedBoxGeometry(T.w, T.h, T.d, 2, 0.3), mats.plasticWhite);
      tray.position.y = T.h / 2;
      const lbl = label([o.label ?? 'Membranas'], 8, 1.2, '#5d4037');
      lbl.rotation.x = -Math.PI / 2;
      lbl.position.set(0, 0.02, T.d / 2 + 0.9);
      group.add(tray, lbl, at(hitMesh(new THREE.BoxGeometry(T.w, T.h + 0.3, T.d), id), 0, T.h / 2, 0));
      return { ringR: 9 };
    }
    case 'soakDish': {
      const S = GEO_B03.soak;
      const dish = new THREE.Mesh(new THREE.CylinderGeometry(S.r, S.r * 0.95, S.h, seg, 1, true), mats.glass);
      dish.position.y = S.h / 2;
      const water = new THREE.Mesh(new THREE.CircleGeometry(S.r - 0.15, seg), own(new THREE.MeshPhysicalMaterial({ color: 0x9cc8ea, transparent: true, opacity: 0.45 })));
      water.rotation.x = -Math.PI / 2;
      water.position.y = S.h * 0.6;
      const lbl = label([o.label ?? 'Remojo'], 6, 1, '#1565c0');
      lbl.rotation.x = -Math.PI / 2;
      lbl.position.set(0, 0.02, S.r + 1);
      group.add(dish, water, lbl, at(hitMesh(new THREE.CylinderGeometry(S.r, S.r, S.h + 0.4, 12), id), 0, S.h / 2, 0));
      return { ringR: S.r + 0.6 };
    }
    case 'membrane': {
      const M = GEO_B03.membrane;
      const mat = own(new THREE.MeshStandardMaterial({ color: MEMBRANE_COLOR[perm(w0).membranes[id]?.material ?? 'dialysis'], transparent: true, opacity: 0.8, side: THREE.DoubleSide, roughness: 0.35 }));
      const sheet = new THREE.Mesh(new THREE.PlaneGeometry(M.w, M.d), mat);
      sheet.rotation.x = -Math.PI / 2;
      sheet.position.y = 0.05;
      const tear = box(0.12, 0.02, M.d * 0.55, own(new THREE.MeshBasicMaterial({ color: 0x3a2a1a })));
      tear.position.set(0.8, 0.07, 0);
      tear.rotation.y = 0.5;
      group.add(sheet, tear, at(hitMesh(new THREE.BoxGeometry(M.w, 0.6, M.d), id), 0, 0.3, 0));
      return {
        ringR: 4.4,
        update: (ctx, ob) => {
          const m = perm(ctx.world).membranes[id];
          if (!m) return;
          // Instalada, la dibuja la cámara (como tabique); aquí se oculta.
          group.visible = !m.installedIn && ob.support !== 'cw';
          tear.visible = !m.intact;
          mat.opacity = 0.55 + 0.35 * (1 - m.wet01);
          mat.color.setHex(MEMBRANE_COLOR[m.material]);
          if (m.wet01 > 0.3) mat.color.lerp(WATER, 0.25 * m.wet01);
        },
      };
    }
    case 'twoChamber': {
      const tall = id === 'c3';
      const G = tall ? GEO_B03.cellTall : GEO_B03.cell;
      const W = tall ? GEO_B03.cellTall.w : GEO_B03.cell.w;
      const glass = own(new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide }));
      const shell = new THREE.Mesh(new THREE.BoxGeometry(W, G.h, G.d), glass);
      shell.position.y = G.h / 2;
      const base = box(W + 1, 0.5, G.d + 1, mats.blackPlastic);
      base.position.y = 0.25;
      // Marco de la junta central con la pinza (perilla al frente).
      const frame = box(0.6, G.h + 0.4, G.d + 0.6, own(new THREE.MeshStandardMaterial({ color: 0x455a64 })));
      frame.position.y = (G.h + 0.4) / 2;
      const knob = cyl(0.9, 1.2, mats.rubberRed, 14);
      knob.rotation.x = Math.PI / 2;
      knob.position.set(0, G.h * 0.55, G.d / 2 + 0.9);
      const memMat = own(new THREE.MeshStandardMaterial({ color: 0xd9cfa8, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
      const mem = new THREE.Mesh(new THREE.PlaneGeometry(G.d - 0.4, G.h - 0.8), memMat);
      mem.rotation.y = Math.PI / 2;
      mem.position.y = G.h / 2;
      const inner = G.h - 1.2;
      const half = W / 2 - 0.6;
      const liq = (['A', 'B'] as const).map((s) => {
        const l = liquidMesh(new THREE.BoxGeometry(half, inner, G.d - 0.6), own);
        l.mesh.position.x = (s === 'A' ? -1 : 1) * (half / 2 + 0.3);
        return l;
      });
      const lid = box(W + 0.4, 0.25, G.d + 0.4, own(new THREE.MeshPhysicalMaterial({ color: 0xe0f0ff, transparent: true, opacity: 0.35 })));
      lid.position.y = G.h + 0.15;
      const spill = new THREE.Mesh(new THREE.CircleGeometry(1, 20), own(new THREE.MeshStandardMaterial({ color: 0x9cc8ea, transparent: true, opacity: 0.5 })));
      spill.rotation.x = -Math.PI / 2;
      spill.position.set(0, 0.02, G.d / 2 + 2.5);
      const lA = label(['A'], 1.4, 1.2, '#37474f');
      lA.position.set(-W / 4, G.h * 0.85, G.d / 2 + 0.05);
      const lB = label(['B'], 1.4, 1.2, '#37474f');
      lB.position.set(W / 4, G.h * 0.85, G.d / 2 + 0.05);
      const name = label([o.label ?? id], 6, 1.2, '#00695c');
      name.rotation.x = -Math.PI / 2;
      name.position.set(0, 0.52, G.d / 2 + 0.9);
      group.add(base, shell, frame, knob, mem, ...liq.map((l) => l.mesh), lid, spill, lA, lB, name, at(hitMesh(new THREE.BoxGeometry(W, G.h, G.d + 2), id), 0, G.h / 2, 0));
      return {
        ringR: W / 2 + 1.5,
        update: (ctx) => {
          const c = perm(ctx.world).cells[id];
          if (!c) return;
          const m = c.membraneId ? perm(ctx.world).membranes[c.membraneId] : null;
          mem.visible = !!m;
          frame.visible = true;
          if (m) {
            memMat.color.setHex(MEMBRANE_COLOR[m.material]);
            memMat.opacity = m.intact ? 0.8 : 0.35;
          }
          knob.rotation.z = c.clampTurns * Math.PI * 2;
          lid.visible = c.lidClosed;
          liq.forEach((l, i) => setLiquid(l.mesh, l.mat, c.sides[i ? 'B' : 'A'], 0.6, inner, null, delayS));
          const leaked = c.leakOutMl;
          spill.visible = leaked > 0.05;
          spill.scale.setScalar(Math.min(4, 0.6 + Math.sqrt(leaked)));
        },
      };
    }
    case 'reagentBottle': {
      const B = GEO_B03.bottle;
      const inner = new THREE.Group();
      const bottle = cyl(B.r, B.h * 0.75, o.id === 'bI' ? mats.amberGlass : mats.glass, seg);
      bottle.position.y = (B.h * 0.75) / 2;
      const neck = cyl(B.r * 0.45, B.h * 0.2, mats.glass, seg);
      neck.position.y = B.h * 0.85;
      const cap = cyl(B.r * 0.5, 0.8, mats.blackPlastic, seg);
      cap.position.y = B.h * 0.98;
      const l = liquidMesh(new THREE.CylinderGeometry(B.r - 0.2, B.r - 0.2, B.h * 0.7, seg), own);
      const lbl = label((o.label ?? id).split(' (').slice(0, 1), 4.4, 1.6, o.id === 'bW' ? '#1565c0' : o.id === 'bI' ? '#6d4c41' : o.id === 'bE' ? '#827717' : o.id === 'bN' ? '#455a64' : '#e65100');
      lbl.position.set(0, B.h * 0.4, B.r + 0.03);
      inner.add(bottle, neck, cap, l.mesh, lbl);
      group.add(inner, at(hitMesh(new THREE.CylinderGeometry(B.r + 0.4, B.r + 0.4, B.h + 1, 10), id), 0, (B.h + 1) / 2, 0));
      return {
        ringR: B.r + 0.9,
        update: (ctx) => {
          setLiquid(l.mesh, l.mat, perm(ctx.world).vessels[id], 0.4, B.h * 0.7, null, delayS);
          tilt(inner, ctx, id);
        },
      };
    }
    case 'gradCylinder': {
      const C = GEO_B03.cylinder;
      const inner = new THREE.Group();
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(C.r, C.r, C.h, seg, 1, true), mats.glass);
      tube.position.y = C.h / 2;
      const foot = cyl(C.r * 2, 0.6, mats.glass, seg);
      foot.position.y = 0.3;
      const ticks = new THREE.Group();
      const tickMat = own(new THREE.MeshBasicMaterial({ color: 0x1a237e }));
      for (let i = 1; i <= 10; i++) {
        const t = box(i % 2 ? 0.5 : 0.9, 0.05, 0.05, tickMat);
        t.position.set(-C.r + 0.2, 0.8 + ((C.h - 2) * i) / 10, C.r + 0.01);
        ticks.add(t);
      }
      const l = liquidMesh(new THREE.CylinderGeometry(C.r - 0.12, C.r - 0.12, C.h - 2, seg), own);
      inner.add(tube, foot, ticks, l.mesh);
      const lbl = label([o.label ?? id], 5, 1, '#1a237e');
      lbl.rotation.x = -Math.PI / 2;
      lbl.position.set(0, 0.02, C.r * 2 + 0.8);
      group.add(inner, lbl, at(hitMesh(new THREE.CylinderGeometry(C.r + 0.6, C.r + 0.6, C.h, 10), id), 0, C.h / 2, 0));
      return {
        ringR: C.r * 2 + 0.6,
        update: (ctx) => {
          setLiquid(l.mesh, l.mat, perm(ctx.world).vessels[id], 0.8, C.h - 2, null, delayS);
          tilt(inner, ctx, id);
        },
      };
    }
    case 'pipette': {
      const L = GEO_B03.pipette.length;
      const inner = new THREE.Group();
      const body = cyl(0.25, L, mats.glass, 10);
      body.position.y = L / 2;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8), mats.rubberRed);
      bulb.scale.set(1, 1.6, 1);
      bulb.position.y = L + 0.6;
      const l = liquidMesh(new THREE.CylinderGeometry(0.18, 0.18, L * 0.6, 8), own);
      inner.add(body, bulb, l.mesh);
      group.add(inner, at(hitMesh(new THREE.BoxGeometry(1.2, 1.2, L), id), 0, 0.6, 0));
      return {
        ringR: 2,
        update: (ctx, ob) => {
          const v = perm(ctx.world).vessels[id];
          setLiquid(l.mesh, l.mat, v, 0.3, L * 0.6, null, delayS);
          // En la mano, vertical (punta abajo); sobre la mesada, acostada.
          inner.rotation.x = ob.support === 'hand' ? 0 : Math.PI / 2;
          inner.position.set(0, ob.support === 'hand' ? 0 : 0.3, ob.support === 'hand' ? 0 : L / 2);
        },
      };
    }
    case 'beaker': {
      const B = GEO_B03.beaker;
      const b = new THREE.Mesh(new THREE.CylinderGeometry(B.r, B.r * 0.92, B.h, seg, 1, true), mats.glass);
      b.position.y = B.h / 2;
      const l = liquidMesh(new THREE.CylinderGeometry(B.r - 0.2, B.r * 0.92 - 0.2, B.h - 1, seg), own);
      const lbl = label([o.label ?? id], 5, 1, '#1565c0');
      lbl.position.set(0, B.h * 0.45, B.r + 0.03);
      group.add(b, l.mesh, lbl, at(hitMesh(new THREE.CylinderGeometry(B.r, B.r, B.h, 10), id), 0, B.h / 2, 0));
      return { ringR: B.r + 0.6, update: (ctx) => setLiquid(l.mesh, l.mat, perm(ctx.world).vessels[id], 0.3, B.h - 1, null, delayS) };
    }
    case 'tubeRack': {
      const R = GEO_B03.rack;
      const top = box(R.w, 0.4, R.d, mats.wood);
      top.position.y = R.h;
      const bottom = box(R.w, 0.4, R.d, mats.wood);
      bottom.position.y = 0.2;
      const legL = box(0.4, R.h, R.d, mats.wood);
      legL.position.set(-R.w / 2 + 0.2, R.h / 2, 0);
      const legR = legL.clone();
      legR.position.x = R.w / 2 - 0.2;
      const lbl = label([o.label ?? 'Gradilla'], 6, 1, '#5d4037');
      lbl.rotation.x = -Math.PI / 2;
      lbl.position.set(0, 0.02, R.d / 2 + 0.8);
      group.add(top, bottom, legL, legR, lbl, at(hitMesh(new THREE.BoxGeometry(R.w, R.h, R.d), id), 0, R.h / 2, 0));
      return { ringR: R.w / 2 + 0.6 };
    }
    case 'testTube': {
      const T = GEO_B03.tube;
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(T.r, T.r, T.h, 12, 1, true), mats.glass);
      tube.position.y = T.h / 2;
      const bottom = new THREE.Mesh(new THREE.SphereGeometry(T.r, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mats.glass);
      bottom.position.y = 0.01 + T.r * 0.2;
      const l = liquidMesh(new THREE.CylinderGeometry(T.r - 0.1, T.r - 0.1, T.h - 1.4, 12), own);
      const tagMat = own(new THREE.MeshStandardMaterial({ color: 0xffffff }));
      const tag = box(T.r * 2 + 0.1, 1, 0.05, tagMat);
      tag.position.set(0, T.h - 1.5, T.r + 0.03);
      group.add(tube, bottom, l.mesh, tag, at(hitMesh(new THREE.CylinderGeometry(T.r + 0.3, T.r + 0.3, T.h, 8), id), 0, T.h / 2, 0));
      return {
        ringR: T.r + 0.6,
        update: (ctx, ob) => {
          const P = perm(ctx.world);
          const t = P.tubes[id];
          const age = t?.reagentAt !== null && t?.reagentAt !== undefined ? ctx.world.timeS - t.reagentAt : null;
          setLiquid(l.mesh, l.mat, P.vessels[id], 0.6, T.h - 1.4, age, delayS);
          tag.visible = !!t?.label;
          tagMat.color.setHex(t?.label?.endsWith('Ag') || t?.label === 'pos-chloride' ? 0xcfd8dc : t?.label ? 0xd1c4e9 : 0xffffff);
          group.visible = ob.support !== 'cw';
        },
      };
    }
    case 'thermometer': {
      const L = GEO_B03.thermometer.length;
      const stick = cyl(0.2, L, mats.glass, 8);
      stick.rotation.x = Math.PI / 2;
      stick.position.y = 0.25;
      const red = cyl(0.08, L * 0.45, own(new THREE.MeshBasicMaterial({ color: 0xd32f2f })), 6);
      red.rotation.x = Math.PI / 2;
      red.position.set(0, 0.25, L / 2 - (L * 0.45) / 2);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), own(new THREE.MeshBasicMaterial({ color: 0xd32f2f })));
      bulb.position.set(0, 0.25, L / 2);
      group.add(stick, red, bulb, at(hitMesh(new THREE.BoxGeometry(1, 1, L), id), 0, 0.4, 0));
      return { ringR: 2 };
    }
    case 'colorimeter': {
      const C = GEO_B03.colorimeter;
      const body = new THREE.Mesh(new RoundedBoxGeometry(C.w, C.h, C.d, 2, 0.5), own(new THREE.MeshStandardMaterial({ color: 0xeceff1, roughness: 0.5 })));
      body.position.y = C.h / 2;
      const screen = box(C.w * 0.5, C.h * 0.35, 0.05, own(new THREE.MeshBasicMaterial({ color: 0x263238 })));
      screen.position.set(-C.w * 0.15, C.h * 0.6, C.d / 2 + 0.03);
      const well = cyl(1, 0.3, mats.blackPlastic, 12);
      well.position.set(C.w * 0.3, C.h + 0.1, 0);
      const ledMat = own(new THREE.MeshBasicMaterial({ color: 0xff7043 }));
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), ledMat);
      led.position.set(C.w * 0.32, C.h * 0.6, C.d / 2 + 0.05);
      const lbl = label([o.label ?? 'Colorímetro'], 6, 1, '#37474f');
      lbl.rotation.x = -Math.PI / 2;
      lbl.position.set(0, 0.02, C.d / 2 + 0.8);
      group.add(body, screen, well, led, lbl, at(hitMesh(new THREE.BoxGeometry(C.w, C.h, C.d), id), 0, C.h / 2, 0));
      return {
        ringR: C.w / 2 + 1,
        // Verde: con el cero hecho con el blanco; naranja: sin calibrar.
        update: (ctx) => void ledMat.color.setHex(perm(ctx.world).colorimeterZeroed ? 0x66bb6a : 0xff7043),
      };
    }
    case 'chemWaste': {
      const C = GEO_B03.waste;
      const bin = cyl(C.r, C.h, own(new THREE.MeshStandardMaterial({ color: 0x6a1b9a })), seg);
      bin.position.y = C.h / 2;
      const lbl = label(['Residuos químicos', 'Ag · Cu'], 8, 2.4, '#4a148c');
      lbl.position.set(0, C.h * 0.6, C.r + 0.05);
      group.add(bin, lbl, at(hitMesh(new THREE.CylinderGeometry(C.r, C.r, C.h, 10), id), 0, C.h / 2, 0));
      return { ringR: C.r + 0.6 };
    }
  }
  return null;
}

/** Inclinación del frasco o la probeta mientras vierte (la boca hacia el destino). */
function tilt(inner: THREE.Group, ctx: FrameCtxB01, id: string) {
  const pour = perm(ctx.world).pours[id];
  const target = pour ? ctx.world.objects[pour.targetId.split(':')[0]] : null;
  const self = ctx.world.objects[id];
  const dir = target && self ? Math.sign(target.pose.x + (pour!.targetId.endsWith(':B') ? 3 : pour!.targetId.endsWith(':A') ? -3 : 0) - self.pose.x) || 1 : 1;
  const goal = pour ? (-dir * Math.min(115, pour.tiltDeg) * Math.PI) / 180 : 0;
  inner.rotation.z += (goal - inner.rotation.z) * Math.min(1, ctx.dt * 6);
}
