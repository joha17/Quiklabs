/**
 * Eventos y banderas de evidencia de F05. Un error se cuenta una vez por episodio (`latch`/`rearm`); su efecto en el
 * mundo dura hasta que se corrige sobre el aparato.
 */
import type { F05World, Severity, SimEvent } from './types';
import { rand } from '../core/rng';

export function emitF5(w: F05World, code: string, severity: Severity, params?: SimEvent['params']): SimEvent {
  const seq = (w.evidence.__eventSeq ?? 0) + 1;
  w.evidence.__eventSeq = seq;
  // Un número sin dato se guarda como «—»: NaN no sobrevive al JSON de la cinta ni se muestra bien.
  const clean = params && Object.fromEntries(Object.entries(params).map(([k, v]) => [k, typeof v === 'number' && !Number.isFinite(v) ? '—' : v]));
  const e: SimEvent = { seq, t: w.timeS, code, severity, params: clean };
  w.events.push(e);
  if (w.events.length > 600) w.events.splice(0, w.events.length - 600);
  return e;
}

export function latchF5(w: F05World, key: string, code: string, severity: Severity, params?: SimEvent['params']) {
  if (w.evidence[`latch:${key}`]) return;
  w.evidence[`latch:${key}`] = 1;
  emitF5(w, code, severity, params);
}

export const rearmF5 = (w: F05World, key: string) => {
  if (w.evidence[`latch:${key}`]) w.evidence[`latch:${key}`] = 0;
};

export const bumpF5 = (w: F05World, key: string, by = 1) => {
  w.evidence[key] = (w.evidence[key] ?? 0) + by;
};

/** Marca de tiempo de evidencia (la primera vez). */
export const flagF5 = (w: F05World, key: string) => {
  if (!w.evidence[key]) w.evidence[key] = Math.max(0.01, Math.round(w.timeS * 100) / 100);
};

/** Error de técnica `F05-Exx`: se cuenta una vez por episodio (`err:Exx`) y avisa con su evento. */
export function errF5(w: F05World, code: string, event: string, severity: Severity = 'WARN', params?: SimEvent['params']) {
  if (w.evidence[`latch:e:${code}`]) return;
  bumpF5(w, `err:${code}`);
  latchF5(w, `e:${code}`, event, severity, params);
}

/** Rearma un error para que un nuevo episodio vuelva a contar (tras corregirlo). */
export const rearmErrF5 = (w: F05World, code: string) => rearmF5(w, `e:${code}`);

export const gaussF5 = (w: F05World) => (rand(w) + rand(w) + rand(w) - 1.5) * 2;
