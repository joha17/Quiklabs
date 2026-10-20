/**
 * Eventos y banderas de evidencia del mundo de la Práctica 1. Un error se cuenta una vez por episodio
 * (`latch`/`rearm`); su efecto en el mundo dura hasta que se corrige (§9, política de errores).
 */
import type { P01World, Severity, SimEvent } from './types';
import { rand } from '../core/rng';

export function emit01(w: P01World, code: string, severity: Severity, params?: SimEvent['params']): SimEvent {
  const seq = (w.evidence.__eventSeq ?? 0) + 1;
  w.evidence.__eventSeq = seq;
  const e: SimEvent = { seq, t: w.timeS, code, severity, params };
  w.events.push(e);
  if (w.events.length > 600) w.events.splice(0, w.events.length - 600);
  return e;
}

export function latch01(w: P01World, key: string, code: string, severity: Severity, params?: SimEvent['params']) {
  if (w.evidence[`latch:${key}`]) return;
  w.evidence[`latch:${key}`] = 1;
  emit01(w, code, severity, params);
}

export const rearm01 = (w: P01World, key: string) => {
  if (w.evidence[`latch:${key}`]) w.evidence[`latch:${key}`] = 0;
};

export const bump01 = (w: P01World, key: string, by = 1) => {
  w.evidence[key] = (w.evidence[key] ?? 0) + by;
};

/** Marca de tiempo de evidencia (la primera vez). */
export const flag01 = (w: P01World, key: string) => {
  if (!w.evidence[key]) w.evidence[key] = Math.max(0.01, Math.round(w.timeS * 100) / 100);
};

/** Error de técnica: se fija una vez (`err:<código>`) y avisa con su evento. */
export function err01(w: P01World, code: string, event: string, severity: Severity = 'WARN', params?: SimEvent['params']) {
  // Un episodio cuenta una vez: un gesto sostenido no se penaliza en cada paso (§9, política de errores).
  if (w.evidence[`latch:e:${code}`]) return;
  bump01(w, `err:${code}`);
  latch01(w, `e:${code}`, event, severity, params);
}

export const gauss01 = (w: P01World) => (rand(w) + rand(w) + rand(w) - 1.5) * 2;
