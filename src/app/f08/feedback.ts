/**
 * Retroalimentación de F08: primero la consecuencia observable, luego la causa y la recuperación (los mismos textos
 * del informe). En evaluación solo se muestran la seguridad y los hechos observables. Nunca completa cálculos ni dice
 * qué valor debió leerse.
 */
import type { F08World, SimEvent } from '../../simulation/f08-world/types';
import type { F08Mode } from '../../practices/practice-f08/definition';
import { t } from '../i18n';
import type { F08Sound } from '../../engine/f08/host';

interface Sink {
  toast(level: 'info' | 'warn' | 'alert' | 'critical', text: string): void;
  caption(text: string): void;
  stage: { audio: { play(n: F08Sound): void } } | null;
  settings: { captions: boolean };
}

/** Evento del dominio → error de técnica cuyo texto explica la causa y la recuperación. */
export const EVENT_ERR: Record<string, string> = {
  RING_ECCENTRIC: 'E01', MASS_SLID: 'E03', ASYMMETRIC_MASSES: 'E04', STRING_OVERLAP: 'E05', ENCODER_OFFSET: 'E06', ENCODER_REVERSED: 'E07', STRING_INCLINED: 'E10',
  HUB_TOUCHED: 'E11', GROUND_HIT: 'E12', SPINNING_START: 'E14', OVERSPEED: 'E18', HAND_IN_PLANE: 'E19', NOT_ZEROED: 'E21', TACH_SATURATED: 'E22', NO_SIGNAL: 'E23',
  LOW_RATE: 'E24', BEAM_OCCLUDED: 'E25', SENSOR_TILTED: 'E26', ENCODER_UNCALIBRATED: 'E27', SUPPORT_LOOSE: 'E28', SUPPORT_MOVED: 'E28', SCALE_PARALLAX: 'E29',
  READ_BEFORE_STABLE: 'E30', CONFIG_DURING_RUN: 'E32', READ_AFTER_IMPACT: 'E39', SPINNING_DISMOUNT: 'E40',
};

/** Errores de técnica que en evaluación no se explican en vivo (quedan para el informe); la seguridad siempre se muestra. */
const SAFETY_ERRS = new Set(['E18', 'E19', 'E40']);

/** Eventos informativos que sí se muestran (los demás INFO son silenciosos). */
export const SHOW_INFO = new Set([
  'PPE_OK', 'INSPECTED', 'INSPECT_BASE', 'INSPECT_GUARD', 'INSPECT_HUB', 'INSPECT_SOLID', 'INSPECT_SOLID_BAD', 'INSPECT_SLIDE', 'INSPECT_SLIDE_LOOSE', 'INSPECT_PULLEY', 'INSPECT_PULLEY_BAD',
  'INSPECT_DROP', 'INSPECT_COLUMN', 'INSPECT_CATCH', 'INSPECT_GATE', 'INSPECT_ENCODER', 'INSPECT_ENCODER_UNCAL', 'INSPECT_TACH', 'INSPECT_TENSION', 'INSPECT_LOGGER', 'INSPECT_BALANCE',
  'INSPECT_CALIPER', 'INSPECT_RULER', 'BALANCE_TARED', 'BALANCE_READ', 'CALIPER_READ', 'SCALE_READ', 'RADIUS_READ', 'ENCODER_ANGLE_READ', 'ENCODER_READ', 'TENSION_READ', 'TACH_READ',
  'GATE_READ', 'RUN_DONE', 'MASS_RELEASED', 'MASS_CAUGHT', 'ENCODER_CALIBRATED', 'ENCODER_ZEROED', 'TENSION_ZEROED', 'PULLEY_ALIGNED', 'SOLID_MOUNTED', 'SOLID_CENTERED',
  'SOLID_REPAIRED', 'STATION_CLOSED', 'STATION_RESET',
]);

/** Lecturas: en evaluación no se repite el valor en un aviso (solo queda en la lista de lecturas). */
const READ_EVENTS = new Set(['BALANCE_READ', 'CALIPER_READ', 'SCALE_READ', 'RADIUS_READ', 'ENCODER_ANGLE_READ', 'ENCODER_READ', 'TENSION_READ', 'TACH_READ', 'GATE_READ']);

const SOUND: Partial<Record<string, F08Sound>> = {
  HAND_IN_PLANE: 'alert', SPINNING_DISMOUNT: 'alert', OVERSPEED: 'alert', GUARD_HIT: 'alert', GROUND_HIT: 'metal', MASS_RELEASED: 'click', MASS_CAUGHT: 'click',
};

const fmtNum = (v: number, d: number) => v.toFixed(d).replace('.', ',');

export function f08EventFeedback(e: SimEvent, mode: F08Mode, sink: Sink): void {
  const err = e.severity === 'INFO' ? undefined : EVENT_ERR[e.code];
  const snd = SOUND[e.code] ?? (e.severity === 'CRITICAL' || e.severity === 'ALERT' ? 'alert' : undefined);
  if (snd) sink.stage?.audio.play(snd);
  if (mode === 'EVALUATION' && err && !SAFETY_ERRS.has(err)) return;
  if (e.severity === 'INFO' && !SHOW_INFO.has(e.code)) return;
  if (mode === 'EVALUATION' && READ_EVENTS.has(e.code)) return;
  const params: Record<string, unknown> = { ...(e.params ?? {}) };
  if (typeof params.cmd === 'string') params.cmd = t(`f08.cmdName.${params.cmd}`);
  for (const k of ['obj', 'target', 'inst', 'id', 'ch'] as const) {
    if (typeof params[k] === 'string') {
      const key = `f08.obj.${params[k]}`;
      const tr = t(key);
      if (tr !== key) params[k] = tr;
    }
  }
  for (const [k, d] of [['cm', 2], ['v', 2], ['n', 0], ['deg', 1], ['hz', 0], ['g', 0], ['range', 0], ['res', 2], ['c', 4], ['N', 3], ['rpm', 1], ['s', 5], ['omega', 1], ['z', 1], ['dz', 1], ['max', 0], ['turns', 1]] as const) {
    if (typeof params[k] === 'number') params[k] = fmtNum(params[k] as number, d);
  }
  const key = err ? `f08fb.${err}` : `f08.ev.${e.code}`;
  const text = t(key, params);
  if (text === key) return;
  const level = e.severity === 'CRITICAL' ? 'critical' : e.severity === 'ALERT' ? 'alert' : e.severity === 'WARN' ? 'warn' : 'info';
  sink.toast(level, err ? `F08-${err} · ${text}` : text);
  if (snd && (e.severity === 'CRITICAL' || e.severity === 'ALERT')) sink.caption(t(`p4.cap.${snd}`));
}

const fired = new Set<string>();
let firedFor = '';

/** Observaciones en vivo (práctica y guiado), una vez por situación y por intento. */
export function f08LiveFeedback(w: F08World, mode: F08Mode, attemptId: string, sink: Sink): void {
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
  // Primer ensayo terminado: α sale del coeficiente c del ajuste θ(t) y el roce del tramo libre.
  if (w.runs.length === 1 && w.runs[0].done) once('fit', 'f08.hint.fit');
  // Masa colgada sin el tope blando: caerá hasta el piso.
  if (w.string.mass && w.string.held && !w.column.catchOn) once('catch', 'f08.hint.catch');
  // Masa colgada con la base sin sujetar: la tensión arrastrará el soporte.
  if (w.string.mass && !w.base.clamped) once('clamp', 'f08.hint.clamp');
  // Rotor girando con la guarda abierta: las manos fuera del plano de giro.
  if (!w.base.guardClosed && Math.abs(w.rotor.omega) > 0.3) once('guard', 'f08.hint.guard');
}
