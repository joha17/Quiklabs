/**
 * Retroalimentación de F04: primero la consecuencia observable, luego la causa y la recuperación (los mismos textos
 * del informe). En evaluación solo se muestran la seguridad y los hechos observables. Nunca completa cálculos ni dice
 * qué valor debió leerse.
 */
import type { F04World, SimEvent } from '../../simulation/f04-world/types';
import type { F04Mode } from '../../practices/practice-f04/definition';
import { t } from '../i18n';
import type { F04Sound } from '../../engine/f04/host';

interface Sink {
  toast(level: 'info' | 'warn' | 'alert' | 'critical', text: string): void;
  caption(text: string): void;
  stage: { audio: { play(n: F04Sound): void } } | null;
  settings: { captions: boolean };
}

/** Evento del dominio → error de técnica cuyo texto explica la causa y la recuperación. */
export const EVENT_ERR: Record<string, string> = {
  TRACK_NOT_LEVEL: 'E02', SLACK_AT_RELEASE: 'E03', STRING_ON_AXLE: 'E04', READ_AFTER_LANDING: 'E05', SENSOR_PERPENDICULAR: 'E07', READ_CLIPPED: 'E08',
  HAND_RELEASE: 'E09', CART_HIT_STOP: 'E10', FBD_WEIGHT_NOT_DOWN: 'E11', FBD_SAME_BODY_PAIR: 'E12', PAIR_SAME_SIGN: 'E13', FBD_WRONG_PARTNER: 'E15',
  CABLE_DRAG: 'E18', NOT_ZEROED: 'E21', SENSOR_SATURATED: 'E22', NO_SIGNAL: 'E23', LOW_RATE: 'E24', GATE_OCCLUDED: 'E25', SENSOR_TILTED: 'E26',
  SENSOR_UNCALIBRATED: 'E27', PULLEY_LOOSE: 'E28', SCALE_PARALLAX: 'E29', READ_BEFORE_STABLE: 'E30', CONFIG_DURING_RUN: 'E32', READ_AFTER_IMPACT: 'E39', MASS_FALL: 'E40',
};

/** Errores de técnica que en evaluación no se explican en vivo (quedan para el informe); la seguridad siempre se muestra. */
const SAFETY_ERRS = new Set(['E10', 'E40']);

/** Eventos informativos que sí se muestran (los demás INFO son silenciosos). */
export const SHOW_INFO = new Set([
  'PPE_OK', 'INSPECTED', 'INSPECT_TRACK', 'INSPECT_CART', 'INSPECT_PULLEY', 'INSPECT_HANGER', 'INSPECT_FORCE', 'INSPECT_ACCEL', 'INSPECT_LOGGER', 'INSPECT_GATE',
  'INSPECT_BALANCE', 'INSPECT_MASS', 'BALANCE_TARED', 'BALANCE_READ', 'TILT_READ', 'SCALE_READ', 'RUN_DONE', 'RUN_READ', 'PAIR_READ', 'STRING_TAUT', 'HANGER_HUNG',
  'HANGER_LANDED', 'SENSOR_CALIBRATED', 'FBD_LOCKED', 'STATION_CLOSED', 'STATION_RESET', 'ACCEL_RESEATED', 'PULLEY_CLAMPED', 'BRAKE_ON', 'CART_RETURNED',
]);

/** Lecturas: en evaluación no se repite el valor en un aviso (solo queda en la lista de lecturas). */
const READ_EVENTS = new Set(['BALANCE_READ', 'TILT_READ', 'SCALE_READ', 'RUN_READ', 'PAIR_READ']);

const SOUND: Partial<Record<string, F04Sound>> = {
  CART_HIT_STOP: 'metal', HANGER_LANDED: 'clink', MASS_FALL: 'alert', ACCEL_SHOCK: 'alert', PAIR_PUSHED: 'click', HANGER_HUNG: 'clink',
};

const fmtNum = (v: number, d: number) => v.toFixed(d).replace('.', ',');

export function f04EventFeedback(e: SimEvent, mode: F04Mode, sink: Sink): void {
  // «PULLEY_LOOSE» informativo es aflojar la abrazadera a propósito; solo el aviso del ensayo es el error E28.
  const err = e.severity === 'INFO' ? undefined : EVENT_ERR[e.code];
  const snd = SOUND[e.code] ?? (e.severity === 'CRITICAL' || e.severity === 'ALERT' ? 'alert' : undefined);
  if (snd) sink.stage?.audio.play(snd);
  if (mode === 'EVALUATION' && err && !SAFETY_ERRS.has(err)) return;
  if (e.severity === 'INFO' && !SHOW_INFO.has(e.code)) return;
  if (mode === 'EVALUATION' && READ_EVENTS.has(e.code)) return;
  const params: Record<string, unknown> = { ...(e.params ?? {}) };
  if (typeof params.body === 'string') params.body = t(`f04.fbd.body.${params.body}`);
  if (typeof params.path === 'string') params.path = t(`f04.desc.path.${params.path}`);
  for (const k of ['obj', 'target', 'inst', 'part', 'what', 'id', 'ch'] as const) {
    if (typeof params[k] === 'string') {
      const key = `f04.obj.${params[k]}`;
      const tr = t(key);
      if (tr !== key) params[k] = tr;
    }
  }
  for (const [k, d] of [['cm', 1], ['a', 2], ['T', 3], ['b', 2], ['v', 2], ['n', 0], ['deg', 2], ['res', 3], ['hz', 0], ['g', 1], ['range', 0], ['ms', 2]] as const) {
    if (typeof params[k] === 'number') params[k] = fmtNum(params[k] as number, d);
  }
  const key = err ? `f04fb.${err}` : `f04.ev.${e.code}`;
  const text = t(key, params);
  if (text === key) return;
  const level = e.severity === 'CRITICAL' ? 'critical' : e.severity === 'ALERT' ? 'alert' : e.severity === 'WARN' ? 'warn' : 'info';
  sink.toast(level, err ? `F04-${err} · ${text}` : text);
  if (snd && (e.severity === 'CRITICAL' || e.severity === 'ALERT')) sink.caption(t(`p4.cap.${snd}`));
}

const fired = new Set<string>();
let firedFor = '';

/** Observaciones en vivo (práctica y guiado), una vez por situación y por intento. */
export function f04LiveFeedback(w: F04World, mode: F04Mode, attemptId: string, sink: Sink): void {
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
  const st = w.string;
  // Portapesas colgado y sostenido a mano: el cordel queda flojo hasta tensarlo.
  if (st.hung && st.held && w.timeS > 0) once('taut', 'f04.hint.taut');
  // Freno apagado con el portapesas colgado: el carro llegará rápido al tope.
  if (st.hung && !w.brake.on && w.cart.latched) once('brake', 'f04.hint.brake');
  // Ensayo terminado: la ventana de lectura se elige en la gráfica antes del primer suceso.
  if (w.runs.length === 1 && w.runs[0].done) once('window', 'f04.hint.window');
  // El portapesas tocó el suelo: lo que sigue ya no es el sistema acoplado.
  if (st.landed && w.run && !w.run.done) once(`landed:${w.run.id}`, 'f04.hint.landed');
}
