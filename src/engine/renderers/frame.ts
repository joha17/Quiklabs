/**
 * Contexto por fotograma que reciben las vistas 3D. Solo lectura del estado del dominio.
 */
import type { World } from '../../simulation/entities/types';
import type { SubstanceTable } from '../../simulation/substances/types';
import type { VisualOffset } from '../effects/animator';
import type { QualityLevel } from '../quality';
import type { MaterialSet } from './materials';

export interface FrameCtx {
  world: World;
  subs: SubstanceTable;
  t: number;
  dt: number;
  held: string | null;
  selected: string | null;
  hovered: string | null;
  snapTarget: string | null;
  reducedMotion: boolean;
  offset: (id: string) => VisualOffset | null;
  squeezingId: string | null;
  probeReading: number | null;
  balanceText: string;
  mats: MaterialSet;
  quality: QualityLevel;
  /** Vista a la altura del ojo activa (sin paralaje). */
  eyeLevel: boolean;
}

/** Desplazamiento visual sobre la pose del dominio: animación de acción + oscilación por agitación. */
export function visualPose(ctx: FrameCtx, id: string, agitation = 0, tool = 'NONE') {
  const o = ctx.offset(id);
  let dx = o?.dx ?? 0;
  let dy = o?.dy ?? 0;
  const dz = o?.dz ?? 0;
  let rot = o?.rot ?? 0;
  if (ctx.held !== id && agitation > 0.12 && !ctx.reducedMotion) {
    if (tool === 'SHAKE') rot += Math.sin(ctx.t * 28) * 0.16 * agitation;
    else if (tool === 'SWIRL') {
      dx += Math.sin(ctx.t * 11) * 0.3 * agitation;
      dy += Math.cos(ctx.t * 11) * 0.25 * agitation;
    }
  }
  return { dx, dy, dz, rot, squeeze: o?.squeeze ?? 1, animating: !!o };
}

/** Generador reproducible de puntos (semilla por texto). */
export function seededPoints(seed: string, n: number): Array<[number, number, number]> {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const out: Array<[number, number, number]> = [];
  for (let i = 0; i < n; i++) {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    const a = ((h >>>= 0) % 10000) / 10000;
    h = Math.imul(h ^ 0x9e3779b9, 16777619);
    const b = ((h >>> 0) % 10000) / 10000;
    h = Math.imul(h ^ 0x85ebca6b, 16777619);
    const c = ((h >>> 0) % 10000) / 10000;
    out.push([a, b, c]);
  }
  return out;
}

export function mixColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}
