/**
 * Retroalimentación de F102: primero la consecuencia observable, luego la causa y la recuperación (los
 * mismos textos del informe). En evaluación solo se muestran la seguridad y los hechos observables.
 * Nunca completa cálculos ni dice qué valor debió leerse.
 */
import type { F102World, SimEvent } from '../../simulation/f102-world/types';
import type { F102Mode } from '../../practices/practice-f102/definition';
import { cartMoving } from '../../simulation/f102-world/world';
import { t } from '../i18n';
import type { F102Sound } from '../../engine/f102/host';

interface Sink {
  toast(level: 'info' | 'warn' | 'alert' | 'critical', text: string): void;
  caption(text: string): void;
  stage: { audio: { play(n: F102Sound): void } } | null;
  settings: { captions: boolean };
}

/** Evento del dominio → error de técnica cuyo texto explica la causa y la recuperación. */
export const EVENT_ERR: Record<string, string> = {
  TRACK_NOT_LEVEL: 'E01', CART_PUSHED: 'E02', GATE_MISALIGNED: 'E03', GATES_OVERLAP: 'E04', TIMER_STARTED_LATE: 'E05', TAPE_SLACK: 'E06',
  MASS_LANDED_EARLY: 'E07', STRING_OFF_WHEEL: 'E08', CART_HIT_STOP: 'E09', GATE_EDGE_READ: 'E10', LATERAL_RELEASE: 'E12', PHOTOCELL_BLOCKED: 'E13',
  BALL_HIT_BENCH: 'E14', FILTER_GEOMETRY_MIXED: 'E15', FILTERS_TUMBLE: 'E16', INSTRUMENT_ZERO_SKIPPED: 'E21', SENSOR_CLIPPED: 'E22',
  SENSOR_NOT_CONNECTED: 'E23', SAMPLING_TOO_LOW: 'E24', LINE_OF_SIGHT_BLOCKED: 'E25', INSTRUMENT_TILTED: 'E26', SENSOR_UNCALIBRATED: 'E27',
  SUPPORT_LOOSE: 'E28', SCALE_PARALLAX: 'E29', READ_BEFORE_STABLE: 'E30', CONFIG_CHANGED_MIDRUN: 'E32', DATA_AFTER_DAMAGE: 'E39', UNSAFE_DISASSEMBLY: 'E40',
};

/** Errores de técnica que en evaluación no se explican en vivo (quedan para el informe); la seguridad siempre se muestra. */
const SAFETY_ERRS = new Set(['E14', 'E28', 'E39', 'E40']);

/** Eventos informativos que sí se muestran (los demás INFO son silenciosos). */
export const SHOW_INFO = new Set([
  'PPE_OK', 'INSPECTED', 'INSPECT_TRACK', 'INSPECT_INCLINOMETER', 'INSPECT_GATE', 'INSPECT_TIMER', 'INSPECT_CART', 'INSPECT_TAPE', 'INSPECT_TOWER',
  'INSPECT_PHOTOCELL', 'INSPECT_MOTION', 'INSPECT_PULLEY', 'INCLINOMETER_ZEROED', 'ANGLE_READ', 'LENGTH_READ', 'GATES_READ', 'TAPE_READ', 'FALL_READ',
  'MOTION_READ', 'MOTION_CALIBRATED', 'FLAG_REPLACED', 'STATION_CLOSED', 'STATION_RESET', 'MASS_LANDED', 'CART_IMPACT', 'BODY_LANDED', 'FILTER_CRUMPLED',
]);

/** Lecturas: en evaluación no se repite el valor en un aviso (solo queda en la lista de lecturas). */
const READ_EVENTS = new Set(['ANGLE_READ', 'LENGTH_READ', 'GATES_READ', 'TAPE_READ', 'FALL_READ', 'MOTION_READ']);

const SOUND: Partial<Record<string, F102Sound>> = {
  CART_IMPACT: 'clink', FLAG_BENT: 'alert', BALL_HIT_BENCH: 'alert', BODY_LANDED: 'click', MASS_LANDED: 'metal', UNSAFE_DISASSEMBLY: 'alert', LAUNCHED: 'click',
};

const fmtNum = (v: number, d: number) => v.toFixed(d).replace('.', ',');

export function f102EventFeedback(e: SimEvent, mode: F102Mode, sink: Sink): void {
  const err = EVENT_ERR[e.code];
  const snd = SOUND[e.code] ?? (e.severity === 'CRITICAL' || e.severity === 'ALERT' ? 'alert' : undefined);
  if (snd) sink.stage?.audio.play(snd);
  if (mode === 'EVALUATION' && err && !SAFETY_ERRS.has(err)) return;
  if (e.severity === 'INFO' && !SHOW_INFO.has(e.code)) return;
  if (mode === 'EVALUATION' && READ_EVENTS.has(e.code)) return;
  const params: Record<string, unknown> = { ...(e.params ?? {}) };
  for (const k of ['obj', 'target', 'inst', 'part', 'what'] as const) {
    if (typeof params[k] === 'string') {
      const key = `f102.obj.${params[k]}`;
      const tr = t(key);
      if (tr !== key) params[k] = tr;
    }
  }
  for (const [k, d] of [['mm', 1], ['cm', 1], ['m', 1], ['v', 2], ['s', 4], ['n', 0], ['deg', 1], ['res', 1], ['hz', 0], ['g', 0], ['w', 1]] as const) {
    if (typeof params[k] === 'number') params[k] = fmtNum(params[k] as number, d);
  }
  const key = err ? `f102fb.${err}` : `f102.ev.${e.code}`;
  const text = t(key, params);
  if (text === key) return;
  const level = e.severity === 'CRITICAL' ? 'critical' : e.severity === 'ALERT' ? 'alert' : e.severity === 'WARN' ? 'warn' : 'info';
  sink.toast(level, err ? `F102-${err} · ${text}` : text);
  if (snd && (e.severity === 'CRITICAL' || e.severity === 'ALERT')) sink.caption(t(`p4.cap.${snd}`));
}

const fired = new Set<string>();
let firedFor = '';

/** Observaciones en vivo (práctica y guiado), una vez por situación y por intento. */
export function f102LiveFeedback(w: F102World, mode: F102Mode, attemptId: string, sink: Sink): void {
  if (mode === 'EVALUATION') return;
  if (firedFor !== attemptId) {
    fired.clear();
    firedFor = attemptId;
  }
  const once = (k: string, key: string) => {
    if (fired.has(k)) return;
    fired.add(k);
    sink.toast('info', t(key));
  };
  // El carro va rápido hacia el tope: conviene atajarlo (la bandera se dobla por encima de ~0,9 m/s).
  if (cartMoving(w) && w.cart.v > w.params.flagBendMs * 0.9 && w.cart.s > 1.1) once(`fast:${w.readingOrder.length}`, 'f102.hint.catchCart');
  if (w.launcher.latched && !w.cart.held && w.cart.s - 0.05 > 0.01) once('launcherAway', 'f102.hint.cartOnPlunger');
  if (w.magnet.holding && !w.fallTimer.armed && w.photocellCapped) once('capOn', 'f102.hint.photocellCap');
}
