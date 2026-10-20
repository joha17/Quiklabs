/**
 * Geometría visual de la Práctica 1 (cm de mesada): niveles, bocas y menisco de la pipeta. La usan la cámara (lectura a
 * la altura del ojo), el controlador (paralaje real) y las vistas, con las MISMAS medidas que el dominio (`GEO01`).
 */
import type { P01World } from '../../simulation/density-world/types';
import { CYL_AREA, GEO01, PIP_STEM_AREA } from '../../simulation/density-world/geometry';
import { cylinderLevelCm, fluidMl, levelCmOf, pipetteAboveMarkMl } from '../../simulation/density-world/world';
import { PAN_POS } from '../../practices/practice-01/definition';

export const VIS = {
  ...GEO01,
  reservoirH: GEO01.reservoir.h,
};

/** Borde de vertido (radio y altura sobre la base, cm) de lo que se vierte inclinándolo. */
export const POUR_LIP01: Record<string, { r: number; h: number }> = {
  waterRoom01: { r: GEO01.reservoir.r, h: GEO01.reservoir.h },
  waterCold01: { r: GEO01.reservoir.r, h: GEO01.reservoir.h },
  cylinder50: { r: GEO01.cylinder50.r, h: GEO01.cylinder50.h },
  erlenmeyer150: { r: GEO01.erlenmeyer150.mouthR, h: GEO01.erlenmeyer150.mouthZ },
  erlenmeyer150b: { r: GEO01.erlenmeyer150.mouthR, h: GEO01.erlenmeyer150.mouthZ },
};

/** Altura del borde (boca) de cada recipiente sobre su base (cm). */
export const RIM_Z: Record<string, number> = {
  waterRoom01: GEO01.reservoir.h, waterCold01: GEO01.reservoir.h, cylinder50: GEO01.cylinder50.h, erlenmeyer150: GEO01.erlenmeyer150.mouthZ,
  erlenmeyer150b: GEO01.erlenmeyer150.mouthZ, waste01: GEO01.waste.h, washBottle: GEO01.washBottle.h, spillTray01: GEO01.spillTray.h,
};

/** Radio de la boca (para acoples y vertidos). */
export const MOUTH_R: Record<string, number> = {
  waterRoom01: GEO01.reservoir.r, waterCold01: GEO01.reservoir.r, cylinder50: GEO01.cylinder50.r + 0.2, erlenmeyer150: GEO01.erlenmeyer150.mouthR,
  erlenmeyer150b: GEO01.erlenmeyer150.mouthR, waste01: GEO01.waste.r, spillTray01: 9,
};

export function mouthOf(w: P01World, id: string): { x: number; y: number; z: number; r: number } | null {
  const o = w.objects[id];
  if (!o || RIM_Z[id] === undefined) return null;
  return { x: o.pose.x, y: o.pose.y, z: o.pose.z + RIM_Z[id], r: MOUTH_R[id] ?? 2 };
}

/** Menisco de la probeta (z sobre la mesada). */
export const cylinderLevelZ = (w: P01World) => w.objects.cylinder50.pose.z + cylinderLevelCm(w);

/** Superficie del agua de un recipiente (z sobre la mesada). */
export function surfaceZ(w: P01World, id: string): number {
  const o = w.objects[id]?.pose;
  if (!o) return 0;
  if (id === 'cylinder50') return cylinderLevelZ(w);
  const f = w.fluids[id];
  return o.z + (f?.floorCm ?? 0) + levelCmOf(w, id);
}

/** Menisco de la pipeta (z) respecto de su marca: el vástago tiene 0,283 cm² (3,5 cm por mL). */
export function pipetteLevelZ(w: P01World): number {
  const o = w.objects.pipette25.pose;
  const P = GEO01.pipette25;
  const dz = Math.max(-8, Math.min(P.topZ - P.markZ, pipetteAboveMarkMl(w) / PIP_STEM_AREA));
  return o.z + P.markZ + dz;
}

/** Punto del platillo de la balanza. */
export const panPoint = () => ({ ...PAN_POS });

/** Volumen del agua de un recipiente (mL) para las vistas. */
export const mlOf = (w: P01World, id: string) => (w.fluids[id] ? fluidMl(w.fluids[id]) : 0);

/** Altura de la marca de un volumen en la probeta (cm sobre su base): la misma función que el dominio. */
export const cylinderMarkZ = (ml: number) => GEO01.cylinder50.floor + ml / CYL_AREA;
