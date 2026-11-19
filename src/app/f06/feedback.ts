/**
 * Retroalimentación de F06: primero la consecuencia observable, luego la causa y la recuperación (los mismos textos
 * del informe). En evaluación solo se muestran la seguridad y los hechos observables. Nunca completa cálculos ni dice
 * qué valor debió leerse.
 */
import type { F06World, SimEvent } from '../../simulation/f06-world/types';
import type { F06Mode } from '../../practices/practice-f06/definition';
import { t } from '../i18n';
import type { F06Sound } from '../../engine/f06/host';

interface Sink {
  toast(level: 'info' | 'warn' | 'alert' | 'critical', text: string): void;
  caption(text: string): void;
  stage: { audio: { play(n: F06Sound): void } } | null;
  settings: { captions: boolean };
}

/** Evento del dominio → error de técnica cuyo texto explica la causa y la recuperación. */
export const EVENT_ERR: Record<string, string> = {
  SPRING_OVERLOAD: 'E01', SPRING_NOT_SECURED: 'E02', RULER_ZERO_OFFSET: 'E03', MASS_CHANGED_IN_MOTION: 'E04', READ_OSCILLATING: 'E05', HEIGHT_REFERENCE: 'E06',
  PUSHED_RELEASE: 'E08', CART_CRASH: 'E13', GATE_NOT_ON_FLAT: 'E14', CHANNELS_UNSYNCED: 'E15', LATERAL_PUSH: 'E17', DAMAGED_SPRING: 'E18', NONLINEAR_RANGE: 'E20',
  NOT_ZEROED: 'E21', SENSOR_SATURATED: 'E22', NO_SIGNAL: 'E23', LOW_RATE: 'E24', BEAM_OCCLUDED: 'E25', SENSOR_TILTED: 'E26', SENSOR_UNCALIBRATED: 'E27',
  RISER_SLIPPED: 'E28', SCALE_PARALLAX: 'E29', READ_BEFORE_STABLE: 'E30', CONFIG_DURING_RUN: 'E32', READ_AFTER_IMPACT: 'E39', SPRING_RELEASE: 'E40',
};

/** Errores de técnica que en evaluación no se explican en vivo (quedan para el informe); la seguridad siempre se muestra. */
const SAFETY_ERRS = new Set(['E13', 'E40']);

/** Eventos informativos que sí se muestran (los demás INFO son silenciosos). */
export const SHOW_INFO = new Set([
  'PPE_OK', 'INSPECTED', 'INSPECT_ANGLE', 'INSPECT_BALANCE', 'INSPECT_BRAKE', 'INSPECT_CART', 'INSPECT_CARTMASS', 'INSPECT_DAMPER', 'INSPECT_FORCE', 'INSPECT_GATE',
  'INSPECT_GAUGE', 'INSPECT_HANGER', 'INSPECT_LAUNCHER', 'INSPECT_LOGGER', 'INSPECT_PAD', 'INSPECT_PENDULUM', 'INSPECT_POS', 'INSPECT_RULER', 'INSPECT_SLOT',
  'INSPECT_SPRING', 'INSPECT_STAND', 'INSPECT_TRACK', 'BALANCE_TARED', 'BALANCE_READ', 'RULER_ALIGNED', 'RULER_READ', 'HEIGHT_READ', 'SCALE_READ', 'LAUNCH_READ',
  'GATES_READ', 'PENDULUM_READ', 'RUN_DONE', 'SENSOR_CALIBRATED', 'SPRING_MOUNTED', 'CART_REPAIRED', 'STATION_CLOSED', 'STATION_RESET',
]);

/** Lecturas: en evaluación no se repite el valor en un aviso (solo queda en la lista de lecturas). */
const READ_EVENTS = new Set(['BALANCE_READ', 'RULER_READ', 'HEIGHT_READ', 'SCALE_READ', 'LAUNCH_READ', 'GATES_READ', 'PENDULUM_READ']);

const SOUND: Partial<Record<string, F06Sound>> = {
  CART_CRASH: 'alert', SPRING_RELEASE: 'alert', SPRING_JUMPED: 'metal', CART_RELEASED: 'metal', CART_DAMAGED: 'alert', BOB_RELEASED: 'click',
};

const fmtNum = (v: number, d: number) => v.toFixed(d).replace('.', ',');

export function f06EventFeedback(e: SimEvent, mode: F06Mode, sink: Sink): void {
  const err = e.severity === 'INFO' ? undefined : EVENT_ERR[e.code];
  const snd = SOUND[e.code] ?? (e.severity === 'CRITICAL' || e.severity === 'ALERT' ? 'alert' : undefined);
  if (snd) sink.stage?.audio.play(snd);
  if (mode === 'EVALUATION' && err && !SAFETY_ERRS.has(err)) return;
  if (e.severity === 'INFO' && !SHOW_INFO.has(e.code)) return;
  if (mode === 'EVALUATION' && READ_EVENTS.has(e.code)) return;
  const params: Record<string, unknown> = { ...(e.params ?? {}) };
  if (typeof params.at === 'string') params.at = t(`f06.place.${params.at}`);
  if (typeof params.cmd === 'string') params.cmd = t(`f06.cmdName.${params.cmd}`);
  for (const k of ['obj', 'target', 'inst', 'part', 'what', 'id', 'ch'] as const) {
    if (typeof params[k] === 'string') {
      const key = `f06.obj.${params[k]}`;
      const tr = t(key);
      if (tr !== key) params[k] = tr;
    }
  }
  for (const [k, d] of [['cm', 1], ['lim', 0], ['v', 2], ['n', 0], ['deg', 1], ['hz', 0], ['g', 1], ['range', 0], ['ms', 2], ['F', 2], ['W', 3], ['dt', 5], ['c', 2], ['k', 0], ['s', 3]] as const) {
    if (typeof params[k] === 'number') params[k] = fmtNum(params[k] as number, d);
  }
  const key = err ? `f06fb.${err}` : `f06.ev.${e.code}`;
  const text = t(key, params);
  if (text === key) return;
  const level = e.severity === 'CRITICAL' ? 'critical' : e.severity === 'ALERT' ? 'alert' : e.severity === 'WARN' ? 'warn' : 'info';
  sink.toast(level, err ? `F06-${err} · ${text}` : text);
  if (snd && (e.severity === 'CRITICAL' || e.severity === 'ALERT')) sink.caption(t(`p4.cap.${snd}`));
}

const fired = new Set<string>();
let firedFor = '';

/** Observaciones en vivo (práctica y guiado), una vez por situación y por intento. */
export function f06LiveFeedback(w: F06World, mode: F06Mode, attemptId: string, sink: Sink): void {
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
  // Primer disparo terminado: el trabajo se lee como área bajo F–x en la gráfica del registrador.
  if (w.runs.length === 1 && w.runs[0].done) once('area', 'f06.hint.area');
  // Lanzador listo sin el freno del extremo alto: el carro puede golpear el tope.
  if (w.cart.latched && !w.track.brakeOn) once('brake', 'f06.hint.brake');
  // Parte alta levantada sin la abrazadera: la columna cede con cada pasada.
  if (!w.track.clamped && Math.abs(w.track.h - w.params.h0) > 0.01) once('clamp', 'f06.hint.clamp');
  // Pesa colgada: esperar a que la oscilación se extinga antes de leer la regla.
  if (w.stand.hangerOn && w.timeS - w.stand.loadedS < 0.5) once('settle', 'f06.hint.settle');
}
