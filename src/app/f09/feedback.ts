/**
 * Retroalimentación de F09: primero la consecuencia observable, luego la causa y la recuperación (los mismos textos
 * del informe). En evaluación solo se muestran la seguridad y los hechos observables. Nunca completa cálculos ni dice
 * qué valor debió leerse.
 */
import type { F09World, SimEvent } from '../../simulation/f09-world/types';
import type { F09Mode } from '../../practices/practice-f09/definition';
import { t } from '../i18n';
import type { F09Sound } from '../../engine/f09/host';

interface Sink {
  toast(level: 'info' | 'warn' | 'alert' | 'critical', text: string): void;
  caption(text: string): void;
  stage: { audio: { play(n: F09Sound): void } } | null;
  settings: { captions: boolean };
}

/** Evento del dominio → error de técnica cuyo texto explica la causa y la recuperación. */
export const EVENT_ERR: Record<string, string> = {
  ORBIT_OFF_GUIDE: 'E01', GUARD_INTERLOCK: 'E02', DYN_OBLIQUE: 'E03', TWINS_UNLOCKED: 'E04', RADIUS_TO_EDGE: 'E05', HALF_TURN: 'E06', OVERSPEED: 'E09', SPEED_JUMP: 'E09',
  BRAKE_DURING_RUN: 'E10', MOTOR_DURING_PULL: 'E11', ASYMMETRIC_PULL: 'E12', FORCE_AFTER_STOP: 'E13', TORQUE_REVERSED: 'E15', AXIS_TILTED: 'E17', DYN_OVER_RANGE: 'E18',
  CORD_SLACK: 'E19', HAND_CONTACT: 'E20', NOT_ZEROED: 'E21', SENSOR_SATURATED: 'E22', NO_SIGNAL: 'E23', LOW_RATE: 'E24', BEAM_OCCLUDED: 'E25', SENSOR_TILTED: 'E26',
  ENCODER_UNCALIBRATED: 'E27', SUPPORT_LOOSE: 'E28', SUPPORT_MOVED: 'E28', SCALE_PARALLAX: 'E29', READ_BEFORE_STABLE: 'E30', CONFIG_DURING_RUN: 'E32', READ_AFTER_IMPACT: 'E39',
  UNSAFE_CLOSE: 'E40',
};

/** Errores de técnica que en evaluación no se explican en vivo (quedan para el informe); la seguridad siempre se muestra. */
const SAFETY_ERRS = new Set(['E01', 'E02', 'E20', 'E40']);

/** Eventos informativos que sí se muestran (los demás INFO son silenciosos). */
export const SHOW_INFO = new Set([
  'PPE_OK', 'INSPECTED', 'INSPECT_BALANCE', 'INSPECT_BASE', 'INSPECT_BRAKE', 'INSPECT_DRUM', 'INSPECT_DYN', 'INSPECT_DYN_OFF', 'INSPECT_ENCODER', 'INSPECT_ENCODER_UNCAL', 'INSPECT_FORCE',
  'INSPECT_FORCE_OFF', 'INSPECT_GATE', 'INSPECT_GATE_BLOCKED', 'INSPECT_GUARD', 'INSPECT_GUIDE', 'INSPECT_GUIDE_BAD', 'INSPECT_HUB', 'INSPECT_LEVEL', 'INSPECT_LEVEL_BAD', 'INSPECT_LOGGER',
  'INSPECT_MOTOR', 'INSPECT_ORBIT', 'INSPECT_ORBIT_SLACK', 'INSPECT_PULL', 'INSPECT_RULER', 'INSPECT_SLIDE', 'INSPECT_SLIDE_LOOSE', 'BALANCE_TARED', 'BALANCE_READ', 'RADIUS_READ',
  'FORCE_READ', 'PERIOD_READ', 'OMEGA_READ', 'ENCODER_READ', 'DYN_READ', 'RUN_DONE', 'PULL_DONE', 'ENCODER_CALIBRATED', 'DYN_ZEROED', 'AXIS_LEVELLED', 'ORBIT_MOUNTED',
  'ORBIT_RESEATED', 'GUIDE_REPAIRED', 'CORD_TIGHT', 'STATION_CLOSED', 'STATION_RESET',
]);

/** Lecturas: en evaluación no se repite el valor en un aviso (solo queda en la lista de lecturas). */
const READ_EVENTS = new Set(['BALANCE_READ', 'RADIUS_READ', 'FORCE_READ', 'PERIOD_READ', 'OMEGA_READ', 'ENCODER_READ', 'DYN_READ']);

const SOUND: Partial<Record<string, F09Sound>> = {
  HAND_CONTACT: 'alert', ORBIT_OFF_GUIDE: 'alert', OVERSPEED: 'alert', UNSAFE_CLOSE: 'alert', CORD_RELEASED: 'click', PULL_STARTED: 'click',
};

const fmtNum = (v: number, d: number) => v.toFixed(d).replace('.', ',');

export function f09EventFeedback(e: SimEvent, mode: F09Mode, sink: Sink): void {
  const err = e.severity === 'INFO' ? undefined : EVENT_ERR[e.code];
  const snd = SOUND[e.code] ?? (e.severity === 'CRITICAL' || e.severity === 'ALERT' ? 'alert' : undefined);
  if (snd) sink.stage?.audio.play(snd);
  if (mode === 'EVALUATION' && err && !SAFETY_ERRS.has(err)) return;
  if (e.severity === 'INFO' && !SHOW_INFO.has(e.code)) return;
  if (mode === 'EVALUATION' && READ_EVENTS.has(e.code)) return;
  const params: Record<string, unknown> = { ...(e.params ?? {}) };
  if (typeof params.cmd === 'string') params.cmd = t(`f09.cmdName.${params.cmd}`);
  for (const k of ['obj', 'target', 'inst', 'id', 'ch'] as const) {
    if (typeof params[k] === 'string') {
      const key = `f09.obj.${params[k]}`;
      const tr = t(key);
      if (tr !== key) params[k] = tr;
    }
  }
  for (const [k, d] of [['cm', 1], ['n', 2], ['deg', 1], ['hz', 0], ['g', 1], ['range', 0], ['N', 2], ['rpm', 0], ['s', 4], ['omega', 2], ['w', 2], ['a', 3], ['max', 0], ['turns', 2]] as const) {
    if (typeof params[k] === 'number') params[k] = fmtNum(params[k] as number, d);
  }
  const key = err ? `f09fb.${err}` : `f09.ev.${e.code}`;
  const text = t(key, params);
  if (text === key) return;
  const level = e.severity === 'CRITICAL' ? 'critical' : e.severity === 'ALERT' ? 'alert' : e.severity === 'WARN' ? 'warn' : 'info';
  sink.toast(level, err ? `F09-${err} · ${text}` : text);
  if (snd && (e.severity === 'CRITICAL' || e.severity === 'ALERT')) sink.caption(t(`p4.cap.${snd}`));
}

const fired = new Set<string>();
let firedFor = '';

/** Observaciones en vivo (práctica y guiado), una vez por situación y por intento. */
export function f09LiveFeedback(w: F09World, mode: F09Mode, attemptId: string, sink: Sink): void {
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
  // Primer tirón terminado: α sale de la pendiente de ω(t) y el roce del tramo libre.
  if (w.runs.length === 1 && w.runs[0].done) once('fit', 'f09.hint.fit');
  // Masa orbitante en la guía con el tope suelto: saldrá al girar.
  if (w.objects.orbit01.support === 'guide' && !w.orbit.stopLocked && !w.orbit.off) once('stop', 'f09.hint.stop');
  // Cordón enrollado con la base sin sujetar: la reacción del tirón girará la base.
  if (w.drum.turns > 0 && !w.base.clamped) once('clamp', 'f09.hint.clamp');
  // Mesa girando con la guarda abierta: las manos fuera del plano de giro.
  if (!w.base.guardClosed && Math.abs(w.rotor.omega) > 0.3) once('guard', 'f09.hint.guard');
}
