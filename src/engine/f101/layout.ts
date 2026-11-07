/**
 * Geometría visual de F101 (cm de mesada): dónde están las caras del calibrador y del micrómetro, la boca y el menisco
 * de la probeta, las poleas, el anillo y los portapesas. La usan la cámara (lectura de frente), el controlador
 * (acoples, alturas de suelta, paralaje real) y las vistas, con las MISMAS medidas que el dominio (`GEOF101`).
 */
import type { F101World } from '../../simulation/f101-world/types';
import { GEOF101, TABLE_CENTER } from '../../simulation/f101-world/geometry';
import { cylinderLevelCm, hangingOn, PULLEYS } from '../../simulation/f101-world/world';

export const T = GEOF101.forceTable;
/** Largo de cada hilo (anillo → rueda → portapesas), cm. */
export const STRING_LEN = 36;

/** Origen de la escala del calibrador (mordaza fija) respecto de su pose, a lo largo de x (cm). */
export const CALIPER_ZERO_DX = -6;
export const caliperJawX = (w: F101World) => w.objects.caliper01.pose.x + CALIPER_ZERO_DX;
/** Centro del hueco entre mordazas (donde se apoya la pieza). */
export function caliperGap(w: F101World) {
  const o = w.objects.caliper01.pose;
  return { x: caliperJawX(w) + w.caliper.jawMm / 20, y: o.y - 3.2, z: o.z + 0.6 };
}

/** Cara del yunque del micrómetro y eje del husillo (cm). */
export function micrometerAxis(w: F101World) {
  const o = w.objects.micrometer01.pose;
  return { x: o.x - 2.4, y: o.y, z: o.z + GEOF101.micrometer.anvilZ };
}

export const gradCylMouth = (w: F101World) => {
  const o = w.objects.gradCyl01.pose;
  return { x: o.x, y: o.y, z: o.z + GEOF101.gradCyl.h, r: GEOF101.gradCyl.r };
};
export const meniscusZ = (w: F101World) => w.objects.gradCyl01.pose.z + cylinderLevelCm(w);

/** Punto de la polea sobre el borde (cm de mesada) para un ángulo (°). */
export function rimPoint(angleDeg: number, out = T.pulleyOut, z = T.topZ) {
  const a = (angleDeg * Math.PI) / 180;
  const r = T.r + out;
  return { x: TABLE_CENTER.x + r * Math.cos(a), y: TABLE_CENTER.y + r * Math.sin(a), z };
}

/** Anillo en cm de mesada. */
export function ringPoint(w: F101World) {
  return { x: TABLE_CENTER.x + w.table.ring.x * 100, y: TABLE_CENTER.y + w.table.ring.y * 100, z: T.topZ + 1.2 };
}

/** Altura del portapesas colgado: el hilo tiene largo fijo; si el anillo se acerca a la polea, el peso baja. */
export function hangerZ(w: F101World, pulleyId: string): number {
  const p = w.table.pulleys[pulleyId];
  const top = rimPoint(p.angleDeg, T.pulleyOut, T.topZ + 1.2);
  const r = ringPoint(w);
  const horizontal = Math.hypot(top.x - r.x, top.y - r.y);
  return top.z - Math.max(2, STRING_LEN - horizontal);
}

/** Ángulo (°) de un punto de la mesada visto desde el centro de la mesa de fuerzas. */
export const tableAngleOf = (x: number, y: number) => {
  const a = (Math.atan2(y - TABLE_CENTER.y, x - TABLE_CENTER.x) * 180) / Math.PI;
  return a < 0 ? a + 360 : a;
};
export const distToTable = (x: number, y: number) => Math.hypot(x - TABLE_CENTER.x, y - TABLE_CENTER.y);

/** Polea cuyo punto de cuelgue está cerca (para colgar un portapesas soltándolo allí). */
export function pulleyNear(w: F101World, x: number, y: number, r = 5): string | null {
  let best: string | null = null;
  let bd = r;
  for (const id of PULLEYS) {
    const p = rimPoint(w.table.pulleys[id].angleDeg, T.pulleyOut + 1);
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < bd) {
      bd = d;
      best = id;
    }
  }
  return best;
}

/** Pose visible de un portapesas o pesa ranurada colgados. */
export function hungPose(w: F101World, id: string): { x: number; y: number; z: number } | null {
  const o = w.objects[id];
  if (!o) return null;
  if (PULLEYS.includes(o.support as never)) {
    const p = rimPoint(w.table.pulleys[o.support].angleDeg, T.pulleyOut + 1);
    return { x: p.x, y: p.y, z: hangerZ(w, o.support) - 9 };
  }
  const h = w.objects[o.support];
  if (h?.kind === 'hanger' && PULLEYS.includes(h.support as never)) {
    const base = hungPose(w, h.id)!;
    const stack = Object.values(w.objects).filter((x) => x.support === h.id).map((x) => x.id);
    return { x: base.x, y: base.y, z: base.z + 0.8 + stack.indexOf(id) * 0.9 };
  }
  return null;
}

export const loadedPulleys = (w: F101World) => PULLEYS.filter((p) => hangingOn(w, p).hangerId);
