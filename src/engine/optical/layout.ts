/**
 * Puntos de apoyo con nombre de la mesada B01 (cm), los mismos del dominio: área de montaje, asiento de la platina
 * (sube y baja con el foco), ranuras de la caja, base del estereoscopio y bandejas. El controlador encaja allí lo que se
 * suelta cerca; el resto queda en la mesada.
 */
import type { B01ObjKind, OpticalWorld } from '../../simulation/optical-world/types';
import { microscopeView } from '../../simulation/optical-world/world';
import { BENCH_B01, CLEAN_TRAY, GEO_B01, PREP_SPOT, SAMPLE_TRAY, STAGE_SEAT, STEREO_BASE, caseSlotId, caseSlotPos, stageTopZCm } from '../../simulation/optical-world/geometry';

export interface Spot {
  id: string;
  x: number;
  y: number;
  z: number;
  /** Radio de captura (cm). */
  r: number;
}

/** Altura actual de la cara superior de la platina (cm). */
export const stageTop = (w: OpticalWorld) => stageTopZCm(microscopeView(w).stageZmm);

/** Apoyos válidos de cada clase de objeto. */
export function spotsFor(w: OpticalWorld, kind: B01ObjKind): Spot[] {
  const out: Spot[] = [];
  if (kind === 'slide' || kind === 'fixedSlide') {
    out.push({ id: 'stage', x: STAGE_SEAT.x, y: STAGE_SEAT.y, z: stageTop(w), r: 5 });
    if (kind === 'slide') {
      out.push({ id: 'prep', x: PREP_SPOT.x, y: PREP_SPOT.y, z: PREP_SPOT.z, r: 7 });
      out.push({ id: 'cleanTray', x: CLEAN_TRAY.x, y: CLEAN_TRAY.y, z: CLEAN_TRAY.z, r: 7 });
    }
    if (kind === 'fixedSlide') {
      for (let i = 0; i < GEO_B01.slideCase.slots; i++) {
        const p = caseSlotPos(i);
        out.push({ id: `case:${caseSlotId(i)}`, x: p.x, y: p.y, z: p.z, r: 0.7 });
      }
    }
  }
  if (kind === 'leafSample' || kind === 'insectSample') {
    out.push({ id: 'stereoBase', x: STEREO_BASE.x, y: STEREO_BASE.y, z: STEREO_BASE.z, r: 6 });
    out.push({ id: 'sampleTray', x: SAMPLE_TRAY.x, y: SAMPLE_TRAY.y, z: SAMPLE_TRAY.z, r: 6 });
  }
  return out;
}

export function spotById(w: OpticalWorld, kind: B01ObjKind, id: string): Spot | null {
  return spotsFor(w, kind).find((s) => s.id === id) ?? null;
}

/** Altura de la cara superior de un objeto apoyado (para lo que se coloca encima). */
export const TOP_CM: Partial<Record<B01ObjKind, number>> = {
  prepBoard: GEO_B01.prepBoard.h, elodeaDish: GEO_B01.dish.h, dropperBottle: GEO_B01.dropperBottle.h, coverBox: GEO_B01.coverBox.h, slideCase: GEO_B01.slideCase.h + GEO_B01.slideCase.lidH,
  sampleTray: GEO_B01.sampleTray.h, cleanTray: GEO_B01.tray.h, glassBin: GEO_B01.bin.h, bioWaste: GEO_B01.bin.h, ppeTray: GEO_B01.ppeTray.h,
};

/** Huella en planta de un equipo macizo apoyado en la mesada (cm): nada la atraviesa. */
export interface Solid {
  kind: B01ObjKind;
  x: number;
  y: number;
  hw: number;
  hd: number;
  top: number;
}

const FOOTPRINT: Partial<Record<B01ObjKind, { w: number; d: number; top: number }>> = {
  microscope: { w: GEO_B01.microscope.baseW, d: GEO_B01.microscope.baseD, top: 3.8 },
  stereo: { w: GEO_B01.stereo.baseW, d: GEO_B01.stereo.baseD, top: GEO_B01.stereo.baseTopZ },
  slideCase: { w: GEO_B01.slideCase.w, d: GEO_B01.slideCase.d, top: TOP_CM.slideCase! },
  prepBoard: { w: GEO_B01.prepBoard.w, d: GEO_B01.prepBoard.d, top: GEO_B01.prepBoard.h },
  coverBox: { w: GEO_B01.coverBox.w, d: GEO_B01.coverBox.d, top: GEO_B01.coverBox.h },
  sampleTray: { w: GEO_B01.sampleTray.w, d: GEO_B01.sampleTray.d, top: GEO_B01.sampleTray.h },
  cleanTray: { w: GEO_B01.tray.w, d: GEO_B01.tray.d, top: GEO_B01.tray.h },
  ppeTray: { w: GEO_B01.ppeTray.w, d: GEO_B01.ppeTray.d, top: GEO_B01.ppeTray.h },
};

export function solidsOf(w: OpticalWorld): Solid[] {
  const out: Solid[] = [];
  for (const o of Object.values(w.objects)) {
    const f = FOOTPRINT[o.kind];
    if (f) out.push({ kind: o.kind, x: o.pose.x, y: o.pose.y, hw: f.w / 2, hd: f.d / 2, top: f.top });
  }
  return out;
}

/** Semiancho y semifondo de un objeto suelto en planta (cm). */
export const halfExtents = (kind: B01ObjKind): [number, number] => (kind === 'slide' || kind === 'fixedSlide' ? [GEO_B01.slide.w / 2, GEO_B01.slide.d / 2] : [1, 1]);

const CLEARANCE = 0.3;
const BENCH_MARGIN = 4;

/** Saca (x, y) de una huella por el lado más cercano dentro de la mesada. */
export function pushOutOf(s: Solid, x: number, y: number, hw: number, hd: number): [number, number] {
  const ox = s.hw + hw + CLEARANCE;
  const oy = s.hd + hd + CLEARANCE;
  if (Math.abs(x - s.x) >= ox || Math.abs(y - s.y) >= oy) return [x, y];
  const exits: Array<[number, number]> = [[s.x - ox, y], [s.x + ox, y], [x, s.y - oy], [x, s.y + oy]];
  const inside = exits.filter(([ex, ey]) => ex >= BENCH_MARGIN && ex <= BENCH_B01.length - BENCH_MARGIN && ey >= BENCH_MARGIN && ey <= BENCH_B01.depth - BENCH_MARGIN);
  return inside.reduce((a, b) => (Math.hypot(b[0] - x, b[1] - y) < Math.hypot(a[0] - x, a[1] - y) ? b : a), inside[0] ?? [x, y]);
}

/** Primer punto libre de equipos para apoyar un objeto en la mesada. */
export function freeBenchSpot(w: OpticalWorld, x0: number, y0: number, hw: number, hd: number): [number, number] {
  const solids = solidsOf(w);
  let p: [number, number] = [x0, y0];
  for (let i = 0; i < 3; i++) for (const s of solids) p = pushOutOf(s, p[0], p[1], hw, hd);
  return p;
}
