/**
 * Eventos y banderas de evidencia de F11. Un error se cuenta una vez por episodio (`latch`/`rearm`); su efecto en el
 * mundo dura hasta que se corrige sobre el aparato.
 */
import type { F11World, Severity, SimEvent } from './types';
import { rand } from '../core/rng';

export function emitF11(w: F11World, code: string, severity: Severity, params?: SimEvent['params']): SimEvent {
  const seq = (w.evidence.__eventSeq ?? 0) + 1;
  w.evidence.__eventSeq = seq;
  // Un número sin dato se guarda como «—»: NaN no sobrevive al JSON de la cinta ni se muestra bien.
  const clean = params && Object.fromEntries(Object.entries(params).map(([k, v]) => [k, typeof v === 'number' && !Number.isFinite(v) ? '—' : v]));
  const e: SimEvent = { seq, t: w.timeS, code, severity, params: clean };
  w.events.push(e);
  if (w.events.length > 600) w.events.splice(0, w.events.length - 600);
  return e;
}

export function latchF11(w: F11World, key: string, code: string, severity: Severity, params?: SimEvent['params']) {
  if (w.evidence[`latch:${key}`]) return;
  w.evidence[`latch:${key}`] = 1;
  emitF11(w, code, severity, params);
}

export const rearmF11 = (w: F11World, key: string) => {
  if (w.evidence[`latch:${key}`]) w.evidence[`latch:${key}`] = 0;
};

export const bumpF11 = (w: F11World, key: string, by = 1) => {
  w.evidence[key] = (w.evidence[key] ?? 0) + by;
};

/** Marca de tiempo de evidencia (la primera vez). */
export const flagF11 = (w: F11World, key: string) => {
  if (!w.evidence[key]) w.evidence[key] = Math.max(0.01, Math.round(w.timeS * 100) / 100);
};

/** Error de técnica `F11-Exx`: se cuenta una vez por episodio (`err:Exx`) y avisa con su evento. */
export function errF11(w: F11World, code: string, event: string, severity: Severity = 'WARN', params?: SimEvent['params']) {
  if (w.evidence[`latch:e:${code}`]) return;
  bumpF11(w, `err:${code}`);
  latchF11(w, `e:${code}`, event, severity, params);
}

/** Rearma un error para que un nuevo episodio vuelva a contar (tras corregirlo). */
export const rearmErrF11 = (w: F11World, code: string) => rearmF11(w, `e:${code}`);

export const gaussF11 = (w: F11World) => (rand(w) + rand(w) + rand(w) - 1.5) * 2;
