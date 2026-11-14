/**
 * Eventos y banderas de evidencia de F08. Un error se cuenta una vez por episodio (`latch`/`rearm`); su efecto en el
 * mundo dura hasta que se corrige sobre el aparato.
 */
import type { F08World, Severity, SimEvent } from './types';
import { rand } from '../core/rng';

export function emitF8(w: F08World, code: string, severity: Severity, params?: SimEvent['params']): SimEvent {
  const seq = (w.evidence.__eventSeq ?? 0) + 1;
  w.evidence.__eventSeq = seq;
  // Un número sin dato se guarda como «—»: NaN no sobrevive al JSON de la cinta ni se muestra bien.
  const clean = params && Object.fromEntries(Object.entries(params).map(([k, v]) => [k, typeof v === 'number' && !Number.isFinite(v) ? '—' : v]));
  const e: SimEvent = { seq, t: w.timeS, code, severity, params: clean };
  w.events.push(e);
  if (w.events.length > 600) w.events.splice(0, w.events.length - 600);
  return e;
}

export function latchF8(w: F08World, key: string, code: string, severity: Severity, params?: SimEvent['params']) {
  if (w.evidence[`latch:${key}`]) return;
  w.evidence[`latch:${key}`] = 1;
  emitF8(w, code, severity, params);
}

export const rearmF8 = (w: F08World, key: string) => {
  if (w.evidence[`latch:${key}`]) w.evidence[`latch:${key}`] = 0;
};

export const bumpF8 = (w: F08World, key: string, by = 1) => {
  w.evidence[key] = (w.evidence[key] ?? 0) + by;
};

/** Marca de tiempo de evidencia (la primera vez). */
export const flagF8 = (w: F08World, key: string) => {
  if (!w.evidence[key]) w.evidence[key] = Math.max(0.01, Math.round(w.timeS * 100) / 100);
};

/** Error de técnica `F08-Exx`: se cuenta una vez por episodio (`err:Exx`) y avisa con su evento. */
export function errF8(w: F08World, code: string, event: string, severity: Severity = 'WARN', params?: SimEvent['params']) {
  if (w.evidence[`latch:e:${code}`]) return;
  bumpF8(w, `err:${code}`);
  latchF8(w, `e:${code}`, event, severity, params);
}

/** Rearma un error para que un nuevo episodio vuelva a contar (tras corregirlo). */
export const rearmErrF8 = (w: F08World, code: string) => rearmF8(w, `e:${code}`);

export const gaussF8 = (w: F08World) => (rand(w) + rand(w) + rand(w) - 1.5) * 2;
