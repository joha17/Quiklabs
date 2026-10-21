/**
 * Eventos y banderas de evidencia del mundo de la Práctica 9 (§5.2). Un error cuenta una vez por episodio
 * (`latch`); su efecto en el mundo dura lo que dura la causa. Textos solo en i18next (códigos y parámetros).
 */
import type { P09World, Severity, SimEvent } from './types';
import { rand } from '../core/rng';

export function emit09(w: P09World, code: string, severity: Severity, params?: SimEvent['params']): SimEvent {
  const seq = (w.evidence.__eventSeq ?? 0) + 1;
  w.evidence.__eventSeq = seq;
  const e: SimEvent = { seq, t: w.timeS, code, severity, params };
  w.events.push(e);
  if (w.events.length > 600) w.events.splice(0, w.events.length - 600);
  return e;
}

export function latch09(w: P09World, key: string, code: string, severity: Severity, params?: SimEvent['params']) {
  if (w.evidence[`latch:${key}`]) return;
  w.evidence[`latch:${key}`] = 1;
  emit09(w, code, severity, params);
}

export const rearm09 = (w: P09World, key: string) => {
  if (w.evidence[`latch:${key}`]) w.evidence[`latch:${key}`] = 0;
};

export const bump09 = (w: P09World, key: string, by = 1) => {
  w.evidence[key] = (w.evidence[key] ?? 0) + by;
};

/** Marca de tiempo de evidencia (la primera vez). */
export const flag09 = (w: P09World, key: string) => {
  if (!w.evidence[key]) w.evidence[key] = Math.max(0.01, Math.round(w.timeS * 100) / 100);
};

/** Error de técnica: se fija una vez (`err:<código>`) y avisa con su evento. */
export function err09(w: P09World, code: string, event: string, severity: Severity = 'WARN', params?: SimEvent['params']) {
  if (w.evidence[`latch:e:${code}`]) return;
  bump09(w, `err:${code}`);
  latch09(w, `e:${code}`, event, severity, params);
}

export const gauss09 = (w: P09World) => (rand(w) + rand(w) + rand(w) - 1.5) * 2;
