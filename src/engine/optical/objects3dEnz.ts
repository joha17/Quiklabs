/**
 * Vistas 3D procedurales de los objetos propios de B05 (§4): frascos, beakers de los lotes con su pastilla, probetas,
 * pipetas, goteros, gradillas y tubos (con espuma), placas con agitador, balanza y bote, frascos de polvo, espátula,
 * hígado y su tabla, baños María, pinza, termómetro, tiras de pH, captador de gas graduado, cronómetros, fotómetro UV,
 * cubetas, mechero y residuos. Como en B01–B03, SOLO leen el estado del dominio: el color de cada líquido sale de sus
 * especies (complejo yodo–almidón, Cu₂O del Benedict, extracto de hígado), nunca del rótulo del tubo ni de un
 * resultado esperado.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { OpticalObject, OpticalWorld } from '../../simulation/optical-world/types';
import type { EnzVessel, EnzWorld } from '../../simulation/enz-world/types';
import { GEO_B05 } from '../../simulation/enz-world/geometry';
import { benedictColor, lugolSignal } from '../../simulation/enz-world/chemistry';
import { clockS } from '../../simulation/enz-world/world';
import { gasMl } from '../../simulation/enz-world/kinetics';
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
const STARCH = new THREE.Color(0xf1eee2);
const EXTRACT = new THREE.Color(0x8d3b2a);
const LUGOL = new THREE.Color(0x9a5a1a);
const LUGOL_COLORS: Record<string, number> = { amber: 0xc98a2a, redbrown: 0x8a3b1e, violet: 0x5b2a7a, blue: 0x283c8c, blueblack: 0x141a3a };
const BENEDICT_COLORS: Record<string, number> = { blue: 0x2f7fd1, green: 0x5f9f3a, yellow: 0xd9b62a, orange: 0xd9702a, brick: 0xa3381e };
const PIGMENT = new THREE.Color(0x7a6a2a);

const enz = (w: OpticalWorld) => (w as EnzWorld).enz;

/** Color y opacidad de un líquido según sus especies (solo cantidades del dominio). */
export function enzLiquidLook(w: OpticalWorld, v: EnzVessel): { color: THREE.Color; opacity: number } {
  const p = (w as EnzWorld).params.enz!;
  const c = WATER.clone();
  const vol = Math.max(1e-6, v.volumeMl);
  const s = v.s;
  let opacity = 0.42;
  const starch = (s.starch + s.starchSolid * v.homog01) / vol;
  if (starch > 0.01) {
    c.lerp(STARCH, Math.min(0.85, starch / 0.6));
    opacity = Math.min(0.9, 0.5 + starch);
  }
  if (s.tissueMg / vol > 1 || s.catAct + s.catTissue + s.catDen > 1e-3) {
    c.lerp(EXTRACT, Math.min(0.75, (s.tissueMg / vol) / 60 + 0.15));
    opacity = Math.max(opacity, 0.7);
  }
  if (s.pigment / vol > 0.0005) c.lerp(PIGMENT, Math.min(0.5, (s.pigment / vol) * 80));
  if (s.iodine > 1e-9) {
    const sig = lugolSignal(p.lugol, s, vol);
    c.copy(sig.color === 'none' ? LUGOL : new THREE.Color(LUGOL_COLORS[sig.color]));
    opacity = Math.max(opacity, 0.75 + 0.2 * sig.index);
  }
  if (s.cu + s.cu2o > 1e-9) {
    c.setHex(BENEDICT_COLORS[benedictColor(p.benedict, s, vol)]);
    opacity = Math.max(opacity, 0.8);
  }
  return { color: c, opacity };
}

/** Geometría vertical de cada recipiente: base interior y altura útil (cm), para el líquido y el menisco. */
function vesselBox(w: OpticalWorld, id: string): { base: number; h: number } | null {
  const o = w.objects[id];
  if (!o) return null;
  switch (o.kind) {
    case 'enzBottle':
      return { base: 0.4, h: GEO_B05.bottle.h * 0.7 };
    case 'enzBeaker':
      return { base: 0.3, h: (GEO_B05.beaker[id]?.h ?? 7) - 1 };
    case 'enzCylinder':
      return { base: 0.8, h: (GEO_B05.cylinder[id]?.h ?? 18) - 2 };
    case 'enzTube':
      return { base: 0.6, h: GEO_B05.tube.h - 1.4 };
    case 'enzCuvette':
      return { base: 0.3, h: 3.6 };
  }
  return null;
}

/** Altura del menisco (cm sobre la mesada) de un recipiente de B05; null si no aplica. */
export function meniscusAtEnz(w: OpticalWorld, id: string): { x: number; y: number; z: number } | null {
  const o = w.objects[id];
  const g = vesselBox(w, id);
  const v = enz(w)?.vessels[id];
  if (!o || !g || !v) return null;
  const f = Math.min(1, v.volumeMl / Math.max(1e-6, v.capacityMl));
  return { x: o.pose.x, y: o.pose.y, z: o.pose.z + g.base + f * g.h };
}

function liquidMesh(geo: THREE.BufferGeometry, own: Own) {
  const mat = own(new THREE.MeshStandardMaterial({ color: WATER, transparent: true, opacity: 0.42, roughness: 0.15, depthWrite: false }));
  return { mesh: new THREE.Mesh(geo, mat), mat };
}

function setLiquid(ctx: FrameCtxB01, mesh: THREE.Mesh, mat: THREE.MeshStandardMaterial, v: EnzVessel | undefined, base: number, h: number) {
  const f = v ? Math.min(1, v.volumeMl / Math.max(1e-6, v.capacityMl)) : 0;
  mesh.visible = f > 0.002;
  mesh.scale.y = Math.max(0.001, f);
  mesh.position.y = base + (h * Math.max(0.001, f)) / 2;
  if (v && mesh.visible) {
    const l = enzLiquidLook(ctx.world, v);
    mat.color.copy(l.color);
    mat.opacity = l.opacity;
  }
}

const flatLabel = (label: Label, text: string, w: number, band: string, z: number) => {
  const l = label([text], w, 1, band);
  l.rotation.x = -Math.PI / 2;
  l.position.set(0, 0.02, z);
  return l;
};

/** Construye la vista de un objeto de B05 en `group`; null si la clase no es de B05. */
export function buildEnzObject(o: OpticalObject, w0: OpticalWorld, group: THREE.Group, mats: MaterialSet, own: Own, label: Label, seg: number): CellVisual | null {
  const id = o.id;
  if (!enz(w0)) return null;
  switch (o.kind) {
    case 'enzBottle': {
      const B = GEO_B05.bottle;
      const inner = new THREE.Group();
      const amber = id === 'hp' || id === 'hpOld';
      const bottle = cyl(B.r, B.h * 0.75, amber ? mats.amberGlass : mats.glass, seg);
      bottle.position.y = (B.h * 0.75) / 2;
      const neck = cyl(B.r * 0.45, B.h * 0.2, mats.glass, seg);
      neck.position.y = B.h * 0.85;
      const cap = cyl(B.r * 0.5, 0.8, id === 'naoh' || id === 'meth' ? mats.rubberRed : mats.blackPlastic, seg);
      cap.position.y = B.h * 0.98;
      const l = liquidMesh(new THREE.CylinderGeometry(B.r - 0.2, B.r - 0.2, B.h * 0.7, seg), own);
      const lbl = label((o.label ?? id).split(' (').slice(0, 1), 4.6, 1.6, id === 'bW' ? '#1565c0' : amber ? '#6d4c41' : id === 'naoh' || id === 'meth' ? '#b71c1c' : '#00695c');
      lbl.position.set(0, B.h * 0.4, B.r + 0.03);
      inner.add(bottle, neck, cap, l.mesh, lbl);
      group.add(inner, at(hitMesh(new THREE.CylinderGeometry(B.r + 0.4, B.r + 0.4, B.h + 1, 10), id), 0, (B.h + 1) / 2, 0));
      return {
        ringR: B.r + 0.9,
        update: (ctx) => {
          setLiquid(ctx, l.mesh, l.mat, enz(ctx.world).vessels[id], 0.4, B.h * 0.7);
          tilt(inner, ctx, id);
        },
      };
    }
    case 'enzBeaker': {
      const B = GEO_B05.beaker[id] ?? GEO_B05.beaker.bk2;
      const inner = new THREE.Group();
      const b = new THREE.Mesh(new THREE.CylinderGeometry(B.r, B.r * 0.94, B.h, seg, 1, true), mats.glass);
      b.position.y = B.h / 2;
      const floor = new THREE.Mesh(new THREE.CircleGeometry(B.r * 0.94, seg), mats.glass);
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = 0.05;
      const l = liquidMesh(new THREE.CylinderGeometry(B.r - 0.2, B.r * 0.94 - 0.2, B.h - 1, seg), own);
      const bar = box(B.r * 0.9, 0.35, 0.35, own(new THREE.MeshStandardMaterial({ color: 0xf5f5f5 })));
      bar.position.y = 0.3;
      const lbl = label([o.label ?? id], 5, 1, '#1565c0');
      lbl.position.set(0, B.h * 0.45, B.r + 0.03);
      inner.add(b, floor, l.mesh, bar, lbl);
      group.add(inner, at(hitMesh(new THREE.CylinderGeometry(B.r, B.r, B.h, 10), id), 0, B.h / 2, 0));
      return {
        ringR: B.r + 0.6,
        update: (ctx) => {
          const E = enz(ctx.world);
          setLiquid(ctx, l.mesh, l.mat, E.vessels[id], 0.3, B.h - 1);
          // Pastilla dentro: gira con las rpm de la placa donde está el beaker.
          const inside = Object.values(E.bars).includes(id);
          bar.visible = inside;
          const plate = ctx.world.objects[id]?.support;
          const rpm = plate && E.plates[plate] ? E.plates[plate].rpm : 0;
          if (inside && !ctx.reducedMotion) bar.rotation.y += ((rpm / 60) * Math.PI * 2 * ctx.dt) % (Math.PI * 2);
          tilt(inner, ctx, id);
        },
      };
    }
    case 'enzCylinder': {
      const C = GEO_B05.cylinder[id] ?? GEO_B05.cylinder.g25;
      const inner = new THREE.Group();
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(C.r, C.r, C.h, seg, 1, true), mats.glass);
      tube.position.y = C.h / 2;
      const foot = cyl(C.r * 2, 0.6, mats.glass, seg);
      foot.position.y = 0.3;
      const tickMat = own(new THREE.MeshBasicMaterial({ color: 0x1a237e }));
      for (let i = 1; i <= 10; i++) inner.add(at(box(i % 2 ? 0.5 : 0.9, 0.05, 0.05, tickMat), -C.r + 0.2, 0.8 + ((C.h - 2) * i) / 10, C.r + 0.01));
      const l = liquidMesh(new THREE.CylinderGeometry(C.r - 0.12, C.r - 0.12, C.h - 2, seg), own);
      inner.add(tube, foot, l.mesh);
      group.add(inner, flatLabel(label, o.label ?? id, 5, '#1a237e', C.r * 2 + 0.8), at(hitMesh(new THREE.CylinderGeometry(C.r + 0.6, C.r + 0.6, C.h, 10), id), 0, C.h / 2, 0));
      return {
        ringR: C.r * 2 + 0.6,
        update: (ctx) => {
          setLiquid(ctx, l.mesh, l.mat, enz(ctx.world).vessels[id], 0.8, C.h - 2);
          tilt(inner, ctx, id);
        },
      };
    }
    case 'enzPipette': {
      const L = id === 'p1' ? 22 : id === 'p5' ? 26 : 30;
      const inner = new THREE.Group();
      const body = cyl(id === 'p10' ? 0.32 : 0.22, L, mats.glass, 10);
      body.position.y = L / 2;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8), id === 'p1' ? mats.plasticYellow : id === 'p5' ? mats.plasticBlue : mats.rubberRed);
      bulb.scale.set(1, 1.6, 1);
      bulb.position.y = L + 0.6;
      const l = liquidMesh(new THREE.CylinderGeometry(0.16, 0.16, L * 0.6, 8), own);
      inner.add(body, bulb, l.mesh);
      group.add(inner, at(hitMesh(new THREE.BoxGeometry(1.2, 1.2, L), id), 0, 0.6, 0));
      return {
        ringR: 2,
        update: (ctx, ob) => {
          setLiquid(ctx, l.mesh, l.mat, enz(ctx.world).vessels[id], 0.3, L * 0.6);
          inner.rotation.x = ob.support === 'hand' ? 0 : Math.PI / 2;
          inner.position.set(0, ob.support === 'hand' ? 0 : 0.3, ob.support === 'hand' ? 0 : L / 2);
        },
      };
    }
    case 'enzDropper': {
      const D = GEO_B05.dropper;
      const color = id === 'dL' ? mats.amberGlass : mats.glass;
      const bottle = cyl(D.r, D.h, color, seg);
      bottle.position.y = D.h / 2;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(D.r * 0.6, 10, 8), id === 'dN' || id === 'dH' ? mats.rubberRed : mats.blackPlastic);
      bulb.scale.set(1, 1.4, 1);
      bulb.position.y = D.h + 0.9;
      const l = liquidMesh(new THREE.CylinderGeometry(D.r - 0.15, D.r - 0.15, D.h - 0.6, seg), own);
      const lbl = label([o.label ?? id], 3.2, 1.2, id === 'dL' ? '#6d4c41' : id === 'dB' ? '#1565c0' : id === 'dH' || id === 'dN' ? '#b71c1c' : '#37474f');
      lbl.position.set(0, D.h * 0.5, D.r + 0.03);
      group.add(bottle, bulb, l.mesh, lbl, at(hitMesh(new THREE.CylinderGeometry(D.r + 0.3, D.r + 0.3, D.h + 2, 8), id), 0, (D.h + 2) / 2, 0));
      return { ringR: D.r + 0.8, update: (ctx) => setLiquid(ctx, l.mesh, l.mat, enz(ctx.world).vessels[id], 0.3, D.h - 0.6) };
    }
    case 'enzRack': {
      const R = GEO_B05.rack;
      const top = box(R.w, 0.4, R.d, mats.wood);
      top.position.y = R.h;
      const bottom = box(R.w, 0.4, R.d, mats.wood);
      bottom.position.y = 0.2;
      const legL = at(box(0.4, R.h, R.d, mats.wood), -R.w / 2 + 0.2, R.h / 2, 0);
      const legR = at(box(0.4, R.h, R.d, mats.wood), R.w / 2 - 0.2, R.h / 2, 0);
      group.add(top, bottom, legL, legR, flatLabel(label, o.label ?? 'Gradilla', 8, '#5d4037', R.d / 2 + 0.8), at(hitMesh(new THREE.BoxGeometry(R.w, R.h, R.d), id), 0, R.h / 2, 0));
      return { ringR: R.w / 2 + 0.6 };
    }
    case 'enzTube': {
      const T = GEO_B05.tube;
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(T.r, T.r, T.h, 12, 1, true), mats.glass);
      tube.position.y = T.h / 2;
      const bottom = new THREE.Mesh(new THREE.SphereGeometry(T.r, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mats.glass);
      bottom.position.y = 0.01 + T.r * 0.2;
      const l = liquidMesh(new THREE.CylinderGeometry(T.r - 0.1, T.r - 0.1, T.h - 1.4, 12), own);
      const foamMat = own(new THREE.MeshStandardMaterial({ color: 0xfafafa, transparent: true, opacity: 0.85, roughness: 0.9 }));
      const foam = cyl(T.r - 0.08, 1, foamMat, 12);
      const stopper = cyl(T.r + 0.05, 1.2, mats.rubberRed, 12);
      stopper.position.y = T.h + 0.3;
      const tagMat = own(new THREE.MeshStandardMaterial({ color: 0xffffff }));
      const tag = box(T.r * 2 + 0.1, 1, 0.05, tagMat);
      tag.position.set(0, T.h - 1.5, T.r + 0.03);
      group.add(tube, bottom, l.mesh, foam, stopper, tag, at(hitMesh(new THREE.CylinderGeometry(T.r + 0.3, T.r + 0.3, T.h, 8), id), 0, T.h / 2, 0));
      return {
        ringR: T.r + 0.6,
        update: (ctx) => {
          const E = enz(ctx.world);
          const v = E.vessels[id];
          const t = E.tubes[id];
          setLiquid(ctx, l.mesh, l.mat, v, 0.6, T.h - 1.4);
          // Espuma: aspecto secundario (no es medida de O₂); se apoya sobre el líquido.
          const fh = t ? Math.min(T.h * 0.5, t.foamMl / (Math.PI * (T.r - 0.08) ** 2)) : 0;
          foam.visible = fh > 0.05;
          foam.scale.y = Math.max(0.01, fh);
          foam.position.y = 0.6 + (T.h - 1.4) * Math.min(1, (v?.volumeMl ?? 0) / Math.max(1e-6, v?.capacityMl ?? 1)) + fh / 2;
          stopper.visible = !!t?.stoppered;
          tag.visible = !!t?.label;
          tagMat.color.setHex(t?.label?.startsWith('cat') ? 0xffcdd2 : t?.label?.startsWith('L') ? 0xffe0b2 : t?.label?.startsWith('B') ? 0xbbdefb : t?.label ? 0xd1c4e9 : 0xffffff);
        },
      };
    }
    case 'enzPlate': {
      const P = GEO_B05.plate;
      const body = new THREE.Mesh(new RoundedBoxGeometry(P.w, P.h, P.d, 2, 0.4), mats.enamel);
      body.position.y = P.h / 2;
      const topMat = own(new THREE.MeshStandardMaterial({ color: 0x9e9e9e, emissive: 0x000000 }));
      const top = box(P.w * 0.8, 0.1, P.d * 0.8, topMat);
      top.position.y = P.h + 0.05;
      const kHeat = at(cyl(0.8, 0.8, mats.rubberRed, 12), -P.w * 0.25, P.h * 0.5, P.d / 2 + 0.3);
      kHeat.rotation.x = Math.PI / 2;
      const kStir = at(cyl(0.8, 0.8, mats.blackPlastic, 12), P.w * 0.25, P.h * 0.5, P.d / 2 + 0.3);
      kStir.rotation.x = Math.PI / 2;
      group.add(body, top, kHeat, kStir, flatLabel(label, o.label ?? id, 7, '#37474f', P.d / 2 + 1.4), at(hitMesh(new THREE.BoxGeometry(P.w, P.h, P.d), id), 0, P.h / 2, 0));
      return {
        ringR: P.w / 2 + 1,
        update: (ctx) => {
          const pl = enz(ctx.world).plates[id];
          if (!pl) return;
          topMat.emissive.setHex(pl.heatOn ? 0x7a1a00 : 0x000000);
          kHeat.rotation.y = pl.heatOn ? ((pl.setK - 293) / 280) * Math.PI * 1.5 : 0;
          kStir.rotation.y = (pl.rpm / 2000) * Math.PI * 1.5;
        },
      };
    }
    case 'enzStirBar': {
      const bar = box(2.2, 0.4, 0.4, own(new THREE.MeshStandardMaterial({ color: 0xf5f5f5 })));
      bar.position.y = 0.2;
      group.add(bar, at(hitMesh(new THREE.BoxGeometry(2.6, 0.8, 0.8), id), 0, 0.4, 0));
      // Dentro de un beaker la dibuja el beaker (girando); aquí se oculta.
      return { ringR: 1.6, update: (ctx) => void (group.visible = !Object.prototype.hasOwnProperty.call(enz(ctx.world).bars, id) || enz(ctx.world).bars[id] === null) };
    }
    case 'enzBalance': {
      const B = GEO_B05.balance;
      const body = new THREE.Mesh(new RoundedBoxGeometry(B.w, B.h, B.d, 2, 0.5), mats.plasticWhite);
      body.position.y = B.h / 2;
      const pan = cyl(B.w * 0.35, 0.3, mats.steel, seg);
      pan.position.y = B.h + 0.15;
      const screen = box(B.w * 0.5, B.h * 0.4, 0.05, own(new THREE.MeshBasicMaterial({ color: 0x263238 })));
      screen.position.set(0, B.h * 0.55, B.d / 2 + 0.03);
      group.add(body, pan, screen, flatLabel(label, o.label ?? 'Balanza', 7, '#37474f', B.d / 2 + 1), at(hitMesh(new THREE.BoxGeometry(B.w, B.h, B.d), id), 0, B.h / 2, 0));
      return { ringR: B.w / 2 + 1 };
    }
    case 'enzBoat': {
      const boat = new THREE.Mesh(new THREE.BoxGeometry(4, 0.6, 4), mats.plasticWhite);
      boat.position.y = 0.3;
      const powderMat = own(new THREE.MeshStandardMaterial({ color: 0xf5f1e3, roughness: 1 }));
      const powder = new THREE.Mesh(new THREE.ConeGeometry(1.2, 0.8, 12), powderMat);
      powder.position.y = 0.6;
      const tissue = new THREE.Mesh(new THREE.SphereGeometry(0.8, 10, 8), own(new THREE.MeshStandardMaterial({ color: 0x6d1f16, roughness: 0.6 })));
      tissue.scale.y = 0.5;
      tissue.position.y = 0.6;
      group.add(boat, powder, tissue, at(hitMesh(new THREE.BoxGeometry(4.4, 1, 4.4), id), 0, 0.5, 0));
      return {
        ringR: 3,
        update: (ctx) => {
          const E = enz(ctx.world);
          const g = Object.values(E.boat).reduce((a, x) => a + x, 0);
          powder.visible = g > 0.01;
          powder.scale.setScalar(Math.min(2, 0.4 + Math.cbrt(g) * 0.4));
          tissue.visible = !!E.boatTissue && E.boatTissue.massG > 0;
        },
      };
    }
    case 'enzJar': {
      const jar = cyl(2.2, 6, mats.glass, seg);
      jar.position.y = 3;
      const powder = cyl(2.0, 4, own(new THREE.MeshStandardMaterial({ color: id === 'jA' ? 0xefe6c8 : 0xf8f6ee, roughness: 1 })), seg);
      const lid = cyl(2.3, 0.6, mats.blackPlastic, seg);
      lid.position.y = 6.3;
      const lbl = label([o.label ?? id], 4.4, 1.4, id === 'jA' ? '#6a1b9a' : '#5d4037');
      lbl.position.set(0, 3, 2.25);
      group.add(jar, powder, lid, lbl, at(hitMesh(new THREE.CylinderGeometry(2.6, 2.6, 7, 10), id), 0, 3.5, 0));
      return {
        ringR: 3,
        update: (ctx) => {
          const g = enz(ctx.world).powders[id] ?? 0;
          const f = Math.min(1, g / (id === 'jA' ? 5 : 100));
          powder.visible = f > 0.01;
          powder.scale.y = Math.max(0.01, f);
          powder.position.y = 0.2 + (4 * f) / 2;
        },
      };
    }
    case 'enzSpatula':
    case 'enzKnife': {
      const blade = box(o.kind === 'enzKnife' ? 3.5 : 2.5, 0.08, o.kind === 'enzKnife' ? 0.8 : 1, mats.steel);
      blade.position.set(-1.8, 0.15, 0);
      const handle = box(5, 0.5, 0.7, o.kind === 'enzKnife' ? mats.blackPlastic : mats.wood);
      handle.position.set(2, 0.25, 0);
      group.add(blade, handle, at(hitMesh(new THREE.BoxGeometry(9, 1, 1.6), id), 0, 0.5, 0));
      return { ringR: 5 };
    }
    case 'enzLiver': {
      const dish = cyl(3.2, 0.6, mats.glass, seg);
      dish.position.y = 0.3;
      const meat = new THREE.Mesh(new THREE.SphereGeometry(2, 14, 10), own(new THREE.MeshStandardMaterial({ color: id === 'livH' ? 0x7a4a3a : 0x6d1f16, roughness: 0.55 })));
      meat.scale.y = 0.45;
      meat.position.y = 0.9;
      group.add(dish, meat, flatLabel(label, o.label ?? id, 6, '#6d1f16', 4.2), at(hitMesh(new THREE.CylinderGeometry(3.4, 3.4, 2, 10), id), 0, 1, 0));
      return {
        ringR: 4,
        update: (ctx) => {
          const l = enz(ctx.world).liver[id];
          meat.visible = !!l && l.massG > 0.05;
          if (l) meat.scale.setScalar(Math.max(0.2, Math.cbrt(l.massG / 10)));
          meat.scale.y *= 0.45;
        },
      };
    }
    case 'enzBoard': {
      const board = box(10, 1.2, 7, mats.plasticWhite);
      board.position.y = 0.6;
      const piecesMat = own(new THREE.MeshStandardMaterial({ color: 0x6d1f16, roughness: 0.6 }));
      const pieces = new THREE.Group();
      for (let i = 0; i < 6; i++) pieces.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.35, 0.6), piecesMat), -1.5 + (i % 3) * 1.2, 1.4, -0.6 + Math.floor(i / 3) * 1.2));
      group.add(board, pieces, flatLabel(label, o.label ?? id, 7, '#6d1f16', 4.6), at(hitMesh(new THREE.BoxGeometry(10, 1.6, 7), id), 0, 0.8, 0));
      return {
        ringR: 6,
        update: (ctx) => {
          const b = enz(ctx.world).board;
          pieces.visible = !!b && b.massG > 0.01;
          if (b) pieces.scale.setScalar(Math.max(0.4, Math.min(2.5, b.sizeCm / 0.4)));
        },
      };
    }
    case 'enzBath': {
      const B = GEO_B05.bath;
      const tank = new THREE.Mesh(new RoundedBoxGeometry(B.w, B.h, B.d, 2, 0.4), mats.steel);
      tank.position.y = B.h / 2;
      const waterMat = own(new THREE.MeshStandardMaterial({ color: 0x8fc4e8, transparent: true, opacity: 0.6 }));
      const water = new THREE.Mesh(new THREE.PlaneGeometry(B.w - 1, B.d - 1), waterMat);
      water.rotation.x = -Math.PI / 2;
      water.position.y = B.h - 1;
      const ledMat = own(new THREE.MeshBasicMaterial({ color: 0x455a64 }));
      const led = at(new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), ledMat), B.w * 0.35, B.h * 0.7, B.d / 2 + 0.05);
      const knob = at(cyl(0.8, 0.8, mats.blackPlastic, 12), -B.w * 0.3, B.h * 0.7, B.d / 2 + 0.3);
      knob.rotation.x = Math.PI / 2;
      group.add(tank, water, led, knob, flatLabel(label, o.label ?? id, 9, '#0d47a1', B.d / 2 + 1.2), at(hitMesh(new THREE.BoxGeometry(B.w, B.h, B.d), id), 0, B.h / 2, 0));
      return {
        ringR: B.w / 2 + 1,
        update: (ctx) => {
          const b = enz(ctx.world).baths[id];
          if (!b) return;
          // Verde: dentro de la estabilidad; ámbar: calentando; gris: apagado.
          ledMat.color.setHex(!b.on ? 0x455a64 : b.stableSince !== null ? 0x66bb6a : 0xffb300);
          waterMat.color.setHex(b.tK > 340 ? 0xb3d4ea : 0x8fc4e8);
          knob.rotation.y = ((b.setK - 293) / 75) * Math.PI * 1.5;
        },
      };
    }
    case 'enzTongs': {
      const armA = box(9, 0.3, 0.4, mats.steel);
      armA.position.set(0, 0.3, -0.4);
      armA.rotation.y = 0.06;
      const armB = box(9, 0.3, 0.4, mats.steel);
      armB.position.set(0, 0.3, 0.4);
      armB.rotation.y = -0.06;
      group.add(armA, armB, at(hitMesh(new THREE.BoxGeometry(9, 1, 1.6), id), 0, 0.5, 0));
      return { ringR: 5 };
    }
    case 'enzThermo': {
      const L = 16;
      const stick = cyl(0.2, L, mats.glass, 8);
      stick.rotation.x = Math.PI / 2;
      stick.position.y = 0.25;
      const bulb = at(new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), own(new THREE.MeshBasicMaterial({ color: 0xd32f2f }))), 0, 0.25, L / 2);
      group.add(stick, bulb, at(hitMesh(new THREE.BoxGeometry(1, 1, L), id), 0, 0.4, 0));
      return { ringR: 2 };
    }
    case 'enzStrips': {
      const boxM = new THREE.Mesh(new RoundedBoxGeometry(4, 1.2, 2.4, 2, 0.2), own(new THREE.MeshStandardMaterial({ color: 0xffca28 })));
      boxM.position.y = 0.6;
      group.add(boxM, flatLabel(label, o.label ?? 'pH', 5, '#f57f17', 2), at(hitMesh(new THREE.BoxGeometry(4.4, 1.6, 2.8), id), 0, 0.8, 0));
      return { ringR: 3 };
    }
    case 'enzCollector': {
      const C = GEO_B05.collector;
      const stand = box(C.w, 0.6, C.d, mats.darkMetal);
      stand.position.y = 0.3;
      const rod = at(cyl(0.25, C.h, mats.steel, 8), -C.w / 2 + 0.6, C.h / 2, 0);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, C.h - 4, seg, 1, true), mats.glass);
      col.position.y = (C.h - 4) / 2 + 2;
      const waterMat = own(new THREE.MeshStandardMaterial({ color: 0x9cc8ea, transparent: true, opacity: 0.5, depthWrite: false }));
      const water = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, C.h - 4, seg), waterMat);
      const tickMat = own(new THREE.MeshBasicMaterial({ color: 0x1a237e }));
      for (let i = 0; i <= 10; i++) group.add(at(box(i % 2 ? 0.4 : 0.8, 0.05, 0.05, tickMat), 0.6, 2 + ((C.h - 4) * i) / 10, 1.21));
      const hoseMat = own(new THREE.MeshStandardMaterial({ color: 0xd7ccc8, transparent: true, opacity: 0.8 }));
      const hose = at(cyl(0.18, 10, hoseMat, 6), 2.5, 1.5, 0);
      hose.rotation.z = Math.PI / 2;
      const valve = at(cyl(0.45, 0.8, mats.rubberRed, 10), 0, C.h - 1.4, 0);
      group.add(stand, rod, col, water, hose, valve, flatLabel(label, o.label ?? id, 8, '#1a237e', C.d / 2 + 1), at(hitMesh(new THREE.BoxGeometry(C.w, C.h, C.d), id), 0, C.h / 2, 0));
      return {
        ringR: C.w / 2 + 1.5,
        update: (ctx) => {
          const E = enz(ctx.world);
          const p = (ctx.world as EnzWorld).params.enz!;
          // El gas desplaza el agua desde arriba de la columna invertida.
          const g = Math.min(1, gasMl(E.collector.gasMmol / 1000, p.ambientK, p.pressureKPa) / p.collector.capacityMl);
          const f = Math.max(0.001, 1 - g);
          water.scale.y = f;
          water.position.y = 2 + ((C.h - 4) * f) / 2;
          hose.visible = !!E.collector.tubeId;
          valve.rotation.x = E.collector.stopcockOpen ? Math.PI / 2 : 0;
        },
      };
    }
    case 'enzClock': {
      const body = cyl(2, 0.8, mats.blackPlastic, seg);
      body.rotation.x = Math.PI / 2;
      body.position.y = 2.2;
      const face = at(new THREE.Mesh(new THREE.CircleGeometry(1.7, seg), own(new THREE.MeshBasicMaterial({ color: 0xfafafa }))), 0, 2.2, 0.42);
      const hand = at(box(0.1, 1.5, 0.05, own(new THREE.MeshBasicMaterial({ color: 0xd32f2f }))), 0, 2.2, 0.46);
      hand.geometry.translate(0, 0.7, 0);
      const stand = box(2, 0.4, 1.4, mats.blackPlastic);
      stand.position.y = 0.2;
      group.add(body, face, hand, stand, flatLabel(label, o.label ?? id, 7, '#37474f', 1.6), at(hitMesh(new THREE.BoxGeometry(4, 4.6, 1.6), id), 0, 2.3, 0));
      return { ringR: 2.6, update: (ctx) => void (hand.rotation.z = -((clockS(ctx.world as EnzWorld, id) % 60) / 60) * Math.PI * 2) };
    }
    case 'enzPhotometer': {
      const P = GEO_B05.photometer;
      const body = new THREE.Mesh(new RoundedBoxGeometry(P.w, P.h, P.d, 2, 0.5), own(new THREE.MeshStandardMaterial({ color: 0xeceff1, roughness: 0.5 })));
      body.position.y = P.h / 2;
      const screen = at(box(P.w * 0.45, P.h * 0.35, 0.05, own(new THREE.MeshBasicMaterial({ color: 0x263238 }))), -P.w * 0.18, P.h * 0.6, P.d / 2 + 0.03);
      const well = at(box(1.4, 0.4, 1.4, mats.blackPlastic), P.w * 0.28, P.h + 0.2, 0);
      const ledMat = own(new THREE.MeshBasicMaterial({ color: 0xff7043 }));
      const led = at(new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), ledMat), P.w * 0.32, P.h * 0.6, P.d / 2 + 0.05);
      group.add(body, screen, well, led, flatLabel(label, o.label ?? 'UV', 8, '#4a148c', P.d / 2 + 1), at(hitMesh(new THREE.BoxGeometry(P.w, P.h, P.d), id), 0, P.h / 2, 0));
      return {
        ringR: P.w / 2 + 1,
        // Verde con blanco registrado; naranja sin blanco; gris si el módulo ADH no está asignado.
        update: (ctx) => void ledMat.color.setHex(!enz(ctx.world).adhEnabled ? 0x607d8b : enz(ctx.world).uv.blankA !== null ? 0x66bb6a : 0xff7043),
      };
    }
    case 'enzCuvette': {
      const quartz = id !== 'cp';
      const c = box(1.1, 4, 1.1, quartz ? mats.glass : mats.plasticWhite);
      c.position.y = 2;
      const l = liquidMesh(new THREE.BoxGeometry(0.9, 3.6, 0.9), own);
      group.add(c, l.mesh, at(hitMesh(new THREE.BoxGeometry(1.6, 4.4, 1.6), id), 0, 2.2, 0));
      return { ringR: 1.4, update: (ctx) => setLiquid(ctx, l.mesh, l.mat, enz(ctx.world).vessels[id], 0.3, 3.6) };
    }
    case 'enzBurner': {
      const base = cyl(2, 0.8, mats.darkMetal, seg);
      base.position.y = 0.4;
      const tube = at(cyl(0.6, 6, mats.steel, 12), 0, 3.6, 0);
      const flame = at(new THREE.Mesh(new THREE.ConeGeometry(0.6, 3, 12), own(new THREE.MeshBasicMaterial({ color: 0x4f8cff, transparent: true, opacity: 0.7 }))), 0, 8.1, 0);
      group.add(base, tube, flame, flatLabel(label, o.label ?? id, 5, '#b71c1c', 2.6), at(hitMesh(new THREE.CylinderGeometry(2, 2, 7, 10), id), 0, 3.5, 0));
      return { ringR: 2.6, update: (ctx) => void (flame.visible = enz(ctx.world).burnerLit) };
    }
    case 'enzWaste': {
      const W = GEO_B05.waste;
      const color = id === 'wCu' ? 0x6a1b9a : id === 'wBio' ? 0xc62828 : 0x1565c0;
      const bin = cyl(W.r, W.h, own(new THREE.MeshStandardMaterial({ color })), seg);
      bin.position.y = W.h / 2;
      const lbl = label((o.label ?? id).split(' (').slice(0, 1), 8, 2, id === 'wCu' ? '#4a148c' : id === 'wBio' ? '#b71c1c' : '#0d47a1');
      lbl.position.set(0, W.h * 0.6, W.r + 0.05);
      group.add(bin, lbl, at(hitMesh(new THREE.CylinderGeometry(W.r, W.r, W.h, 10), id), 0, W.h / 2, 0));
      return { ringR: W.r + 0.6 };
    }
    case 'enzRinse': {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3, 8, seg, 1, true), mats.glass);
      b.position.y = 4;
      const l = liquidMesh(new THREE.CylinderGeometry(3, 2.8, 7, seg), own);
      group.add(b, l.mesh, flatLabel(label, o.label ?? id, 6, '#1565c0', 4.2), at(hitMesh(new THREE.CylinderGeometry(3.2, 3.2, 8, 10), id), 0, 4, 0));
      return { ringR: 3.8, update: (ctx) => setLiquid(ctx, l.mesh, l.mat, enz(ctx.world).vessels[id], 0.3, 7) };
    }
  }
  return null;
}

/** Inclinación del frasco, beaker o probeta mientras vierte (la boca hacia el destino). */
function tilt(inner: THREE.Group, ctx: FrameCtxB01, id: string) {
  const pour = enz(ctx.world).pours[id];
  const target = pour ? ctx.world.objects[pour.targetId] : null;
  const self = ctx.world.objects[id];
  const dir = target && self ? Math.sign(target.pose.x - self.pose.x) || 1 : 1;
  const goal = pour ? (-dir * Math.min(115, pour.tiltDeg) * Math.PI) / 180 : 0;
  inner.rotation.z += (goal - inner.rotation.z) * Math.min(1, ctx.dt * 6);
}
