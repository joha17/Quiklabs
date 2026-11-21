/**
 * Geometría visual de F11 (cm de la sala, z = 0 en la cara de la mesada): el tanque con su líquido, la sonda en el
 * porta-sonda o en la guía, los objetos en el estante, la balanza, el tanque o la mesada, el bloque colgado del
 * dinamómetro del soporte sobre el vaso de rebose y el colector. La usan la cámara (lectura de frente), el controlador
 * y las vistas, con las MISMAS medidas que el dominio (`GEOF11`).
 */
import type { F11World, FloatId } from '../../simulation/f11-world/types';
import { GEOF11, tankPoint } from '../../simulation/f11-world/geometry';
import { canState, solidOf } from '../../simulation/f11-world/conservation';
import { tankLevel } from '../../simulation/f11-world/world';
import { buildObjectsF11 } from '../../practices/practice-f11/definition';

export const DEG = Math.PI / 180;
const G = GEOF11;
const T = G.tank;

export type P3 = { x: number; y: number; z: number };

/** Poses de partida (lugar de cada pieza suelta). */
const HOME: Record<string, P3> = Object.fromEntries(buildObjectsF11().map((o) => [o.id, { x: o.pose.x, y: o.pose.y, z: o.pose.z }]));
export const homeOf = (id: string): P3 => HOME[id] ?? { x: G.rack.x, y: G.rack.y, z: G.rack.h };

/** Altura del plato de la balanza (cm). */
export const BALANCE_PAN_Z = G.balance.h + 0.6;

/** Membrana de la sonda (punta inferior) en la sala. */
export function probeRoom(w: F11World): P3 {
  const pr = w.probe;
  const o = w.objects.probe01;
  if (o?.support === 'hand') return o.pose;
  if (pr.mount === 'guide') return tankPoint(pr.gx, pr.z, G.guide.y);
  return { x: G.holder.x, y: G.holder.y, z: 8 };
}

/** Carro de la guía sobre los bordes del tanque. */
export const guideRoom = (w: F11World): P3 => ({ x: T.x0 + w.probe.gx, y: T.y0 + T.W / 2, z: T.floorZ + T.H + 0.5 });

/** Gancho del brazo del soporte (extremo inferior del dinamómetro) y base del bloque colgado. */
export function dynHookRoom(w: F11World): P3 {
  const a = w.params.alu;
  return { x: G.can.x, y: G.can.y, z: w.stand.zb + a.H + G.stand.hook };
}
export const armZ = (w: F11World) => dynHookRoom(w).z + G.stand.dynLen;

/** Centro de la base de un objeto de flotación (o del bloque): estante, balanza, tanque, mesada o dinamómetro. */
export function floatRoom(w: F11World, id: FloatId): P3 {
  const o = w.objects[id];
  if (o?.support === 'hand') return o.pose;
  const f = w.floats[id];
  switch (f.where) {
    case 'tank':
      return tankPoint(f.x, f.zb, T.y0 + T.W / 2 + (id === 'bottle1' ? 4 : 0));
    case 'balance':
      return { x: G.balance.x, y: G.balance.y, z: BALANCE_PAN_Z };
    case 'bench':
      return { x: T.x0 - 9, y: T.y0 - 4 + (id === 'bottle1' ? 0 : 2), z: 0 };
    case 'dyn':
      return { x: G.can.x, y: G.can.y, z: w.stand.zb };
    default:
      return homeOf(id);
  }
}

/** Colector: en el estante, bajo el pico del vaso de rebose o en la balanza. */
export function catchRoom(w: F11World): P3 {
  const o = w.objects.catch01;
  if (o?.support === 'hand') return o.pose;
  if (w.can.catchAt === 'spout') return { x: G.catchSpout.x, y: G.catchSpout.y, z: 0 };
  if (w.can.catchAt === 'balance') return { x: G.balance.x, y: G.balance.y, z: BALANCE_PAN_Z };
  return { x: G.catchRack.x, y: G.catchRack.y, z: 0 };
}

/** Probeta: en su lugar o en la balanza. */
export function cylRoom(w: F11World): P3 {
  const o = w.objects.cyl01;
  if (o?.support === 'hand') return o.pose;
  if (w.cyl.where === 'balance') return { x: G.balance.x, y: G.balance.y, z: BALANCE_PAN_Z };
  return { x: G.cylinder.x, y: G.cylinder.y, z: 0 };
}

/** Nivel del tanque en la sala (z) y del vaso de rebose. */
export const tankSurfaceZ = (w: F11World) => T.floorZ + tankLevel(w);
export const canSurfaceZ = (w: F11World) => canState(w).level;

/** Lo que se lee de frente para evitar paralaje. */
export type EyeKeyF11 = 'scale01' | 'ruler01' | 'draft' | 'dyn01' | 'stand01' | 'cyl01' | 'balance01' | 'logger01';

/** Punto que se mira de frente para leer cada escala o pantalla. */
export function eyePoint(w: F11World, target: string, floatId: FloatId = 'float1'): P3 {
  switch (target) {
    case 'scale01':
      return { x: T.x0 + G.scaleX, y: T.y0 - T.wall, z: tankSurfaceZ(w) };
    case 'ruler01': {
      const g = guideRoom(w);
      return { x: g.x + 1.6, y: G.guide.y - 1, z: T.floorZ + T.H + 2 };
    }
    case 'draft': {
      const f = floatRoom(w, floatId);
      return { x: f.x, y: f.y - solidOf(w, floatId).footprint / 2, z: tankSurfaceZ(w) };
    }
    case 'dyn01': {
      const h = dynHookRoom(w);
      return { x: h.x, y: h.y - 1.5, z: h.z + G.stand.dynLen / 2 };
    }
    case 'stand01':
      return { x: G.stand.x + 2, y: G.stand.y - 2, z: armZ(w) };
    case 'cyl01': {
      const c = cylRoom(w);
      return { x: c.x, y: c.y - G.cylinder.r, z: c.z + 1.5 + (w.cyl.vol / w.params.cyl.capML) * (G.cylinder.h - 4) };
    }
    case 'balance01':
      return { x: G.balance.x, y: G.balance.y - G.balance.d / 2, z: G.balance.h * 0.6 };
    case 'logger01':
      return { x: G.logger.x, y: G.logger.y - G.logger.d / 2, z: G.logger.h * 0.7 };
    default:
      return { x: T.x0 + T.L / 2, y: T.y0, z: 24 };
  }
}

/** Lugar de cada objeto para la cámara, las etiquetas y el cursor de la demostración. */
export function objRoom(w: F11World, id: string): P3 {
  const o = w.objects[id];
  if (!o) return { x: 0, y: 0, z: 0 };
  switch (id) {
    case 'probe01':
      return probeRoom(w);
    case 'guide01':
      return guideRoom(w);
    case 'ruler01': {
      const g = guideRoom(w);
      return { x: g.x + 1.6, y: G.guide.y, z: g.z };
    }
    case 'float1':
    case 'bottle1':
    case 'alu1':
      return floatRoom(w, id);
    case 'catch01':
      return catchRoom(w);
    case 'cyl01':
      return cylRoom(w);
    case 'dyn01':
      return dynHookRoom(w);
    default:
      return { x: o.pose.x, y: o.pose.y, z: o.pose.z };
  }
}
