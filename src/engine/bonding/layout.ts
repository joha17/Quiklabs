/**
 * Geometría visual de la Práctica 7 (cm de mesada): bocas, bordes de vertido, niveles de las fases y la cara superior
 * de las muestras sólidas. La usan la cámara, el controlador (contactos de las puntas, profundidad de la sonda) y las
 * vistas, con las MISMAS medidas que el dominio (`GEO07`).
 */
import type { P07World, Vessel } from '../../simulation/bonding-world/types';
import { GEO07, type VesselShape } from '../../simulation/bonding-world/geometry';
import { phaseHeights } from '../../simulation/bonding-world/world';

/** Altura del borde sobre la base de cada forma (cm). */
export const RIM_Z: Record<VesselShape, number> = {
  tube: GEO07.tube.h, cylinder10: GEO07.cylinder10.h, beaker50: GEO07.beaker50.h, flask100: GEO07.flask100.h, bottle250: GEO07.bottle250.h + 2.5,
  bottle100: GEO07.bottle100.h + 2, jar: GEO07.jar.h + 0.6, vial: GEO07.vial.h, waste: GEO07.waste.h, watchGlass: GEO07.watchGlass.h, washBottle: GEO07.washBottle.h,
};

/** Radio de la boca (acoples y vertidos). */
export const MOUTH_R: Record<VesselShape, number> = {
  tube: GEO07.tube.r, cylinder10: GEO07.cylinder10.r + 0.1, beaker50: GEO07.beaker50.r, flask100: GEO07.flask100.neckR, bottle250: 1.4, bottle100: 1.1,
  jar: GEO07.jar.r - 0.3, vial: GEO07.vial.r - 0.4, waste: GEO07.waste.r, watchGlass: GEO07.watchGlass.r, washBottle: 0.4,
};

/** Borde de vertido (radio y altura sobre la base) de las formas que se vierten inclinándolas. */
export const POUR_LIP07: Partial<Record<VesselShape, { r: number; h: number }>> = {
  tube: { r: GEO07.tube.outerR, h: GEO07.tube.h },
  cylinder10: { r: GEO07.cylinder10.outerR, h: GEO07.cylinder10.h },
  beaker50: { r: GEO07.beaker50.r + 0.2, h: GEO07.beaker50.h },
  flask100: { r: GEO07.flask100.neckR + 0.2, h: GEO07.flask100.h },
  bottle250: { r: 1.4, h: RIM_Z.bottle250 },
  bottle100: { r: 1.1, h: RIM_Z.bottle100 },
  vial: { r: GEO07.vial.r - 0.4, h: GEO07.vial.h },
};

export const isPourable = (w: P07World, id: string) => {
  const v = w.vessels[id];
  return !!v && !!POUR_LIP07[v.shape] && v.shape !== 'jar';
};

export function mouthOf(w: P07World, id: string): { x: number; y: number; z: number; r: number } | null {
  const o = w.objects[id];
  const v = w.vessels[id];
  if (!o || !v) return null;
  return { x: o.pose.x, y: o.pose.y, z: o.pose.z + RIM_Z[v.shape], r: MOUTH_R[v.shape] };
}

/** Superficie de la fase superior y la interfase (z sobre la mesada). */
export function levelsZ(w: P07World, v: Vessel) {
  const o = w.objects[v.id];
  const base = (o?.pose.z ?? 0) + v.floorCm;
  const h = phaseHeights(v);
  return { floor: base, interface: base + h.polar, surface: base + h.total };
}

/** Cara superior de una muestra sólida sobre su baldosa (z) y su caja en la mesada. */
export function specimenTop(w: P07World, id: string): { x: number; y: number; z: number; halfL: number; halfW: number } | null {
  const o = w.objects[id];
  const sp = w.specimens[id];
  if (!o || !sp) return null;
  const standing = sp.orientation === 'edge';
  // De canto, la placa muestra su espesor hacia arriba: las puntas tocan sus caras grandes.
  const h = standing ? sp.widthCm : sp.thickCm;
  return { x: o.pose.x, y: o.pose.y, z: o.pose.z + h, halfL: sp.lengthCm / 2, halfW: (standing ? sp.thickCm : sp.widthCm) / 2 + 0.6 };
}

/** Panel de control del detector (dónde se apoyan las puntas para probar el circuito). */
export function detectorPad(w: P07World) {
  const d = w.objects.det01.pose;
  return { x: d.x + 3.2, y: d.y - 2.2, z: d.z + GEO07.detector.h, r: 1.4 };
}

/** Soporte de la sonda junto al conductímetro. */
export function probeHolder(w: P07World) {
  const m = w.objects.cond01.pose;
  return { x: m.x + 12, y: m.y - 4 };
}

/** Puntos de la gradilla (cm) para cada sitio. */
export function rackSlot(w: P07World, rackId: string, i: number) {
  const r = w.objects[rackId].pose;
  return { x: r.x - 9.8 + i * GEO07.rack.pitch, y: r.y, z: 2 };
}

/** Altura de la punta de la sonda cuando está dentro de un recipiente (z). */
export const probeTipZ = (w: P07World) => w.objects.probe01?.pose.z ?? 0;
