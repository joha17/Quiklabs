/**
 * Eventos y banderas de evidencia del mundo de la Práctica 10 (compartidos por la Parte A y la Parte B).
 */
import type { P10World, Severity, SimEvent } from './types';
import { rand } from '../core/rng';

export function emit10(w: P10World, code: string, severity: Severity, params?: SimEvent['params']): SimEvent {
  const seq = (w.evidence.__eventSeq ?? 0) + 1;
  w.evidence.__eventSeq = seq;
  const e: SimEvent = { seq, t: w.timeS, code, severity, params };
  w.events.push(e);
  if (w.events.length > 600) w.events.splice(0, w.events.length - 600);
  return e;
}
export function latch10(w: P10World, key: string, code: string, severity: Severity, params?: SimEvent['params']) {
  if (w.evidence[`latch:${key}`]) return;
  w.evidence[`latch:${key}`] = 1;
  emit10(w, code, severity, params);
}
export const rearm10 = (w: P10World, key: string) => {
  if (w.evidence[`latch:${key}`]) w.evidence[`latch:${key}`] = 0;
};
export const bump10 = (w: P10World, key: string, by = 1) => {
  w.evidence[key] = (w.evidence[key] ?? 0) + by;
};
export const flag10 = (w: P10World, key: string) => {
  if (!w.evidence[key]) w.evidence[key] = Math.max(0.01, Math.round(w.timeS * 100) / 100);
};
export const gauss10 = (w: P10World) => (rand(w) + rand(w) + rand(w) - 1.5) * 2;
