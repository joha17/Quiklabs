/**
 * Retroalimentación de F11: primero la consecuencia observable, luego la causa y la recuperación (los mismos textos
 * del informe). En evaluación solo se muestran la seguridad y los hechos observables. Nunca completa cálculos ni dice
 * qué valor debió leerse.
 */
import type { F11World, SimEvent } from '../../simulation/f11-world/types';
import type { F11Mode } from '../../practices/practice-f11/definition';
import { t } from '../i18n';
import type { F11Sound } from '../../engine/f11/host';

interface Sink {
  toast(level: 'info' | 'warn' | 'alert' | 'critical', text: string): void;
  caption(text: string): void;
  stage: { audio: { play(n: F11Sound): void } } | null;
  settings: { captions: boolean };
}

/** Evento del dominio → error de técnica cuyo texto explica la causa y la recuperación. */
export const EVENT_ERR: Record<string, string> = {
  PROBE_NOT_ZEROED: 'E01', PROBE_BUBBLE: 'E03', PROBE_ON_WALL: 'E04', FLUIDS_MIXED: 'E05', BLOCK_ON_BOTTOM: 'E08', OBJECT_TETHERED: 'E09', CONTAINER_NOT_TARED: 'E10',
  CAN_NOT_PRIMED: 'E11', OVERFLOW_SPILLED: 'E11', TANK_SPILLED: 'E11', READ_DURING_WAVES: 'E12', DENSITY_CHANGED: 'E14', OBJECT_STACKED: 'E15', OBJECT_OUTSIDE: 'E17',
  BODY_MOVING: 'E19', ITEMS_LEFT: 'E20', NOT_ZEROED: 'E21', SENSOR_SATURATED: 'E22', NO_SIGNAL: 'E23', LOW_RATE: 'E24', SCALE_OCCLUDED: 'E25', DYN_OBLIQUE: 'E26',
  PROBE_UNCALIBRATED: 'E27', GUIDE_DRIFT: 'E28', SCALE_PARALLAX: 'E29', READ_BEFORE_STABLE: 'E30', CONFIG_DURING_SERIES: 'E32', READ_AFTER_IMPACT: 'E39', UNSAFE_CLOSE: 'E40',
};

/** Errores de técnica que en evaluación no se explican en vivo (quedan para el informe); la seguridad siempre se muestra. */
const SAFETY_ERRS = new Set(['E11', 'E40']);

/** Eventos informativos que sí se muestran (los demás INFO son silenciosos). */
export const SHOW_INFO = new Set([
  'PPE_OK', 'INSPECTED', 'INSPECT_TANK', 'INSPECT_TAP', 'INSPECT_RESERVOIR', 'INSPECT_PUMP', 'INSPECT_DRAIN', 'INSPECT_WASTE', 'INSPECT_AGITATOR', 'INSPECT_AGITATOR_ON', 'INSPECT_SCALE',
  'INSPECT_GUIDE', 'INSPECT_GUIDE_FREE', 'INSPECT_PROBE', 'INSPECT_PROBE_UNCAL', 'INSPECT_PROBE_ABS', 'INSPECT_PROBE_BUBBLE', 'INSPECT_RULER', 'INSPECT_HOLDER', 'INSPECT_LOGGER',
  'INSPECT_LOGGER_LOW', 'INSPECT_TOWEL', 'INSPECT_RACK', 'INSPECT_FLOATER', 'INSPECT_BOTTLE', 'INSPECT_BLOCK', 'INSPECT_BALLAST', 'INSPECT_BALANCE', 'INSPECT_BALANCE_OFF',
  'INSPECT_CYLINDER', 'INSPECT_CAN', 'INSPECT_CATCH', 'INSPECT_STAND', 'INSPECT_DYN', 'INSPECT_DYN_OFF', 'PROBE_READ', 'RULER_READ', 'LEVEL_READ', 'DRAFT_READ', 'DYN_READ',
  'STAND_READ', 'BALANCE_READ', 'CYLINDER_READ', 'PROBE_ZEROED', 'PROBE_CALIBRATED', 'PROBE_PURGED', 'BUBBLE_PURGED', 'DYN_ZEROED', 'STAND_ZEROED', 'BALANCE_TARED',
  'SERIES_STARTED', 'CAN_PRIMED', 'OBJECT_SANK', 'THREAD_UNTIED', 'SPILL_MOPPED', 'TANK_EMPTY', 'STATION_CLOSED', 'STATION_RESET', 'PROBE_REPAIRED', 'TEACHER_RESUME',
]);

/** Lecturas: en evaluación no se repite el valor en un aviso (solo queda en la lista de lecturas). */
const READ_EVENTS = new Set(['PROBE_READ', 'RULER_READ', 'LEVEL_READ', 'DRAFT_READ', 'DYN_READ', 'STAND_READ', 'BALANCE_READ', 'CYLINDER_READ']);

const SOUND: Partial<Record<string, F11Sound>> = {
  PROBE_IMPACT: 'alert', TANK_SPILLED: 'alert', UNSAFE_CLOSE: 'alert', OBJECT_RELEASED: 'click', BLOCK_HUNG: 'click',
};

const fmtNum = (v: number, d: number) => v.toFixed(d).replace('.', ',');

export function f11EventFeedback(e: SimEvent, mode: F11Mode, sink: Sink): void {
  const err = e.severity === 'INFO' ? undefined : EVENT_ERR[e.code];
  const snd = SOUND[e.code] ?? (e.severity === 'CRITICAL' || e.severity === 'ALERT' ? 'alert' : undefined);
  if (snd) sink.stage?.audio.play(snd);
  if (mode === 'EVALUATION' && err && !SAFETY_ERRS.has(err)) return;
  if (e.severity === 'INFO' && !SHOW_INFO.has(e.code)) return;
  if (mode === 'EVALUATION' && READ_EVENTS.has(e.code)) return;
  const params: Record<string, unknown> = { ...(e.params ?? {}) };
  if (typeof params.cmd === 'string') params.cmd = t(`f11.cmdName.${params.cmd}`);
  for (const k of ['obj', 'target', 'inst', 'id', 'on', 'item'] as const) {
    if (typeof params[k] === 'string') {
      const key = `f11.obj.${params[k]}`;
      const tr = t(key);
      if (tr !== key) params[k] = tr;
    }
  }
  for (const [k, d] of [['cm', 2], ['n', 0], ['deg', 1], ['hz', 0], ['N', 2], ['res', 0], ['mm', 0], ['kPa', 3], ['g', 1], ['mL', 0], ['V', 0], ['H', 0], ['Ls', 1], ['pct', 0], ['max', 0]] as const) {
    if (typeof params[k] === 'number') params[k] = fmtNum(params[k] as number, d);
  }
  const key = err ? `f11fb.${err}` : `f11.ev.${e.code}`;
  const text = t(key, params);
  if (text === key) return;
  const level = e.severity === 'CRITICAL' ? 'critical' : e.severity === 'ALERT' ? 'alert' : e.severity === 'WARN' ? 'warn' : 'info';
  sink.toast(level, err ? `F11-${err} · ${text}` : text);
  if (snd && (e.severity === 'CRITICAL' || e.severity === 'ALERT')) sink.caption(t(`p4.cap.${snd}`));
}

const fired = new Set<string>();
let firedFor = '';

/** Observaciones en vivo (práctica y guiado), una vez por situación y por intento. */
export function f11LiveFeedback(w: F11World, mode: F11Mode, attemptId: string, sink: Sink): void {
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
  // Objeto soltado en el tanque con el hilo atado: no flota libre y la lectura de calado no vale.
  if (Object.values(w.floats).some((f) => f.where === 'tank' && f.tethered)) once('thread', 'f11.hint.thread');
  // Sonda en la guía sin trabar: se corre de la profundidad que marca la regla.
  if (w.probe.mount === 'guide' && !w.probe.locked) once('lock', 'f11.hint.lock');
  // Burbuja en la membrana: purgar antes de leer.
  if (w.probe.mount === 'guide' && w.probe.bubble) once('bubble', 'f11.hint.bubble');
  // Derrame en la mesada: secar antes de seguir (hay equipos eléctricos cerca).
  if (w.spill.A + w.spill.B > 1) once('spill', 'f11.hint.spill');
}
