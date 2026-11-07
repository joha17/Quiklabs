/**
 * Eventos y banderas de evidencia de F101. Un error se cuenta una vez por episodio (`latch`/`rearm`); su efecto en el
 * mundo dura hasta que se corrige sobre el aparato.
 */
import type { F101World, Severity, SimEvent } from './types';
import { rand } from '../core/rng';

export function emitF(w: F101World, code: string, severity: Severity, params?: SimEvent['params']): SimEvent {
  const seq = (w.evidence.__eventSeq ?? 0) + 1;
  w.evidence.__eventSeq = seq;
  const e: SimEvent = { seq, t: w.timeS, code, severity, params };
  w.events.push(e);
  if (w.events.length > 600) w.events.splice(0, w.events.length - 600);
  return e;
}

export function latchF(w: F101World, key: string, code: string, severity: Severity, params?: SimEvent['params']) {
  if (w.evidence[`latch:${key}`]) return;
  w.evidence[`latch:${key}`] = 1;
  emitF(w, code, severity, params);
}

export const rearmF = (w: F101World, key: string) => {
  if (w.evidence[`latch:${key}`]) w.evidence[`latch:${key}`] = 0;
};

export const bumpF = (w: F101World, key: string, by = 1) => {
  w.evidence[key] = (w.evidence[key] ?? 0) + by;
};

/** Marca de tiempo de evidencia (la primera vez). */
export const flagF = (w: F101World, key: string) => {
  if (!w.evidence[key]) w.evidence[key] = Math.max(0.01, Math.round(w.timeS * 100) / 100);
};

/** Error de técnica `F101-Exx`: se cuenta una vez por episodio (`err:Exx`) y avisa con su evento. */
export function errF(w: F101World, code: string, event: string, severity: Severity = 'WARN', params?: SimEvent['params']) {
  if (w.evidence[`latch:e:${code}`]) return;
  bumpF(w, `err:${code}`);
  latchF(w, `e:${code}`, event, severity, params);
}

/** Rearma un error para que un nuevo episodio vuelva a contar (tras corregirlo). */
export const rearmErrF = (w: F101World, code: string) => rearmF(w, `e:${code}`);

export const gaussF = (w: F101World) => (rand(w) + rand(w) + rand(w) - 1.5) * 2;
