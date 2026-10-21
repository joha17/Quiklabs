/**
 * Geometría visual de la Práctica 9 (cm de mesada): bocas, bordes de vertido, niveles y apoyos con nombre (gradilla,
 * rotor, turbidímetro, platillo, llama, soporte sobre el emisor, vaso de limpieza). Mismas medidas que el dominio.
 */
import type { P09World } from '../../simulation/cation-analysis-world/types';
import { GEO09, type VesselShape09 } from '../../simulation/cation-analysis-world/geometry';
import { levels09 } from '../../simulation/cation-analysis-world/world';
import { CLEAN_POS, FLAME_POINT, PAD_POS, PAN_POS, TURB_POS, rackSlot, rotorSlot } from '../../practices/practice-09/definition';

export const RIM_Z: Record<VesselShape09, number> = {
  tube: GEO09.tube.h, cylinder: GEO09.cylinder.h, beaker: GEO09.beaker.h, dropperBottle: GEO09.dropperBottle.h + 1.5, bottle: GEO09.bottle.h + 2,
  washBottle: GEO09.washBottle.h, watchGlass: GEO09.watchGlass.h, refractoryCup: GEO09.refractoryCup.h, cleanCup: GEO09.cleanCup.h, waste: GEO09.waste.h,
};

export const MOUTH_R: Record<VesselShape09, number> = {
  tube: GEO09.tube.r + 0.1, cylinder: GEO09.cylinder.r + 0.1, beaker: GEO09.beaker.r, dropperBottle: 0.5, bottle: 1.2, washBottle: 0.4, watchGlass: GEO09.watchGlass.r,
  refractoryCup: GEO09.refractoryCup.r, cleanCup: GEO09.cleanCup.r, waste: GEO09.waste.r,
};

export const POUR_LIP09: Partial<Record<VesselShape09, { r: number; h: number }>> = {
  tube: { r: GEO09.tube.outerR, h: GEO09.tube.h },
  cylinder: { r: GEO09.cylinder.outerR, h: GEO09.cylinder.h },
  beaker: { r: GEO09.beaker.r + 0.2, h: GEO09.beaker.h },
  bottle: { r: 1.2, h: RIM_Z.bottle },
};

export const isPourable = (w: P09World, id: string) => {
  const v = w.vessels[id];
  return !!v && !!POUR_LIP09[v.shape] && w.objects[id]?.movable !== false;
};

export function mouthOf(w: P09World, id: string): { x: number; y: number; z: number; r: number } | null {
  const o = w.objects[id];
  const v = w.vessels[id];
  if (!o || !v) return null;
  return { x: o.pose.x, y: o.pose.y, z: o.pose.z + RIM_Z[v.shape], r: MOUTH_R[v.shape] };
}

export const levelsZ = (w: P09World, id: string) => levels09(w, id);

/** Puntos de apoyo con nombre. */
export function supportPoint(w: P09World, support: string): { x: number; y: number; z: number } | null {
  if (support.startsWith('rack:')) return rackSlot(Number(support.slice(5)));
  if (support.startsWith('cf:')) return rotorSlot(Number(support.slice(3)));
  switch (support) {
    case 'turb01': return { ...TURB_POS, z: 2 };
    case 'pan': return PAN_POS;
    case 'flame': return FLAME_POINT;
    case 'flamePad': return PAD_POS;
    case 'clean01': return { ...CLEAN_POS, z: 1 };
  }
  void w;
  return null;
}

/** Apoyos válidos de cada clase de objeto. */
export function spotsFor(kind: string): string[] {
  const rack = Array.from({ length: GEO09.rack.slots }, (_, i) => `rack:${i}`);
  const rotor = Array.from({ length: GEO09.centrifuge.slots }, (_, i) => `cf:${i}`);
  switch (kind) {
    case 'tube': return [...rack, ...rotor, 'turb01', 'pan'];
    case 'watchGlass':
    case 'refractoryCup': return ['flamePad', 'pan'];
    case 'loop': return ['flame', 'clean01'];
    case 'beaker':
    case 'cylinder':
    case 'bottle':
    case 'dropperBottle': return ['pan'];
  }
  return [];
}
