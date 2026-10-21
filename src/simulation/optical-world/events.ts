/**
 * Eventos y banderas de evidencia del mundo B01. Un error cuenta una vez (`err:<código>`, con su latch) y su efecto
 * en el mundo dura lo que dura la causa. Textos solo en i18next (códigos y parámetros).
 */
import type { OpticalWorld, Severity, SimEvent } from './types';

export function emitB(w: OpticalWorld, code: string, severity: Severity, params?: SimEvent['params']): SimEvent {
  const seq = (w.evidence.__eventSeq ?? 0) + 1;
  w.evidence.__eventSeq = seq;
  const e: SimEvent = { seq, t: w.timeS, code, severity, params };
  w.events.push(e);
  if (w.events.length > 600) w.events.splice(0, w.events.length - 600);
  return e;
}

export function latchB(w: OpticalWorld, key: string, code: string, severity: Severity, params?: SimEvent['params']) {
  if (w.evidence[`latch:${key}`]) return;
  w.evidence[`latch:${key}`] = 1;
  emitB(w, code, severity, params);
}

export const bumpB = (w: OpticalWorld, key: string, by = 1) => {
  w.evidence[key] = (w.evidence[key] ?? 0) + by;
};

export const flagB = (w: OpticalWorld, key: string) => {
  if (!w.evidence[key]) w.evidence[key] = Math.max(0.01, Math.round(w.timeS * 100) / 100);
};

/** Error de técnica: se fija una vez (`err:<código>`) y avisa con su evento. */
export function errB(w: OpticalWorld, code: string, event: string, severity: Severity = 'WARN', params?: SimEvent['params']) {
  if (w.evidence[`latch:e:${code}`]) return;
  bumpB(w, `err:${code}`);
  latchB(w, `e:${code}`, event, severity, params);
}
