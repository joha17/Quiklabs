/**
 * Eventos y banderas de evidencia del mundo de la Práctica 7 (§6.5). Un error cuenta una vez por episodio
 * (`latch`); su efecto en el mundo dura lo que dura la causa. Textos solo en i18next (códigos y parámetros).
 */
import type { P07World, Severity, SimEvent } from './types';
import { rand } from '../core/rng';

export function emit07(w: P07World, code: string, severity: Severity, params?: SimEvent['params']): SimEvent {
  const seq = (w.evidence.__eventSeq ?? 0) + 1;
  w.evidence.__eventSeq = seq;
  const e: SimEvent = { seq, t: w.timeS, code, severity, params };
  w.events.push(e);
  if (w.events.length > 600) w.events.splice(0, w.events.length - 600);
  return e;
}

export function latch07(w: P07World, key: string, code: string, severity: Severity, params?: SimEvent['params']) {
  if (w.evidence[`latch:${key}`]) return;
  w.evidence[`latch:${key}`] = 1;
  emit07(w, code, severity, params);
}

export const rearm07 = (w: P07World, key: string) => {
  if (w.evidence[`latch:${key}`]) w.evidence[`latch:${key}`] = 0;
};

export const bump07 = (w: P07World, key: string, by = 1) => {
  w.evidence[key] = (w.evidence[key] ?? 0) + by;
};

/** Marca de tiempo de evidencia (la primera vez). */
export const flag07 = (w: P07World, key: string) => {
  if (!w.evidence[key]) w.evidence[key] = Math.max(0.01, Math.round(w.timeS * 100) / 100);
};

/** Error de técnica: se fija una vez (`err:<código>`) y avisa con su evento. */
export function err07(w: P07World, code: string, event: string, severity: Severity = 'WARN', params?: SimEvent['params']) {
  if (w.evidence[`latch:e:${code}`]) return;
  bump07(w, `err:${code}`);
  latch07(w, `e:${code}`, event, severity, params);
}

export const gauss07 = (w: P07World) => (rand(w) + rand(w) + rand(w) - 1.5) * 2;
