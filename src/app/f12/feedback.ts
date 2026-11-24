/**
 * Retroalimentación de F12: primero la consecuencia observable, luego la causa y la recuperación (los mismos textos
 * del informe). En evaluación solo se muestran la seguridad y los hechos observables. Nunca completa cálculos ni dice
 * qué valor debió leerse.
 */
import type { F12World, SimEvent } from '../../simulation/f12-world/types';
import type { F12Mode } from '../../practices/practice-f12/definition';
import { airInLinesF12, flowingF12 } from '../../simulation/f12-world/world';
import { t } from '../i18n';
import type { F12Sound } from '../../engine/f12/host';

interface Sink {
  toast(level: 'info' | 'warn' | 'alert' | 'critical', text: string): void;
  caption(text: string): void;
  stage: { audio: { play(n: F12Sound): void } } | null;
  settings: { captions: boolean };
}

/** Evento del dominio → error de técnica cuyo texto explica la causa y la recuperación. */
export const EVENT_ERR: Record<string, string> = {
  JOINT_LEAK: 'E01', AIR_IN_LINES: 'E02', FLOW_TRANSIENT: 'E04', WATER_HAMMER: 'E05', PORT_BLOCKED: 'E06', PITOT_READING: 'E07', SENSORS_CROSSED: 'E08',
  SPOOL_CHANGED_IN_SERIES: 'E10', OVERPRESSURE: 'E11', ABSOLUTE_MODE: 'E12', NO_TIMER: 'E13', TIMER_MISMATCH: 'E13', BEAKER_OVERFLOW: 'E14', NEGATIVE_PRESSURE: 'E17',
  THROAT_OBSTRUCTED: 'E18', CLOSE_PUMP_ON: 'E20', NOT_ZEROED: 'E21', SENSOR_SATURATED: 'E22', NO_SIGNAL: 'E23', LOW_RATE: 'E24', SCALE_OCCLUDED: 'E25',
  CALIPER_OBLIQUE: 'E26', SENSOR_UNCALIBRATED: 'E27', VENTURI_DRIFT: 'E28', SCALE_PARALLAX: 'E29', READ_BEFORE_STABLE: 'E30', CONFIG_DURING_SERIES: 'E32',
  READ_AFTER_DAMAGE: 'E39', OPENED_UNDER_PRESSURE: 'E40',
};

/** Errores de técnica que en evaluación no se explican en vivo (quedan para el informe); la seguridad siempre se muestra. */
const SAFETY_ERRS = new Set(['E05', 'E11', 'E40']);

/** Eventos informativos que sí se muestran (los demás INFO son silenciosos). */
export const SHOW_INFO = new Set([
  'PPE_OK', 'INSPECTED', 'INSPECT_SUMP', 'INSPECT_PUMP', 'INSPECT_METER', 'INSPECT_JOINT', 'INSPECT_VENTURI', 'INSPECT_CLAMP', 'INSPECT_SPOOL', 'INSPECT_TAPS', 'INSPECT_PURGE',
  'INSPECT_VALVE', 'INSPECT_OUTLET', 'INSPECT_BEAKER', 'INSPECT_TIMER', 'INSPECT_PANEL', 'INSPECT_LOGGER', 'INSPECT_RULER', 'INSPECT_GASKETS', 'INSPECT_SPARE', 'INSPECT_CALIPER',
  'INSPECT_SAMPLE', 'INSPECT_PITOT', 'INSPECT_STOPPER', 'INSPECT_TOWEL', 'GASKET_FITTED', 'JOINT_CONNECTED', 'CLAMPED', 'SPOOL_SWAPPED', 'STOPPER_REMOVED', 'PUMP_ON', 'PUMP_OFF',
  'SENSORS_CALIBRATED', 'SENSORS_ZEROED', 'SERIES_STARTED', 'PRESSURES_READ', 'FLOW_READ', 'SUMP_READ', 'HEIGHT_READ', 'BEAKER_READ', 'TIMER_READ', 'DIAMETER_READ',
  'CIRCUIT_PURGED', 'SPILL_MOPPED', 'BEAKER_EMPTIED', 'STATION_CLOSED', 'STATION_RESET', 'SENSOR_REPAIRED', 'TEACHER_RESUME',
]);

/** Lecturas: en evaluación no se repite el valor en un aviso (solo queda en la lista de lecturas). */
const READ_EVENTS = new Set(['PRESSURES_READ', 'FLOW_READ', 'SUMP_READ', 'HEIGHT_READ', 'BEAKER_READ', 'TIMER_READ', 'DIAMETER_READ']);

const SOUND: Partial<Record<string, F12Sound>> = {
  WATER_HAMMER: 'alert', OVERPRESSURE: 'alert', RELIEF_OPEN: 'alert', OPENED_UNDER_PRESSURE: 'alert', CLOSE_PUMP_ON: 'alert', PUMP_ON: 'click', PUMP_OFF: 'click',
  JOINT_CONNECTED: 'click', JOINT_NO_GASKET: 'click', VALVE_SET: 'click',
};

const fmtNum = (v: number, d: number) => v.toFixed(d).replace('.', ',');

export function f12EventFeedback(e: SimEvent, mode: F12Mode, sink: Sink): void {
  const err = e.severity === 'INFO' ? undefined : EVENT_ERR[e.code];
  const snd = SOUND[e.code] ?? (e.severity === 'CRITICAL' || e.severity === 'ALERT' ? 'alert' : undefined);
  if (snd) sink.stage?.audio.play(snd);
  if (mode === 'EVALUATION' && err && !SAFETY_ERRS.has(err)) return;
  if (e.severity === 'INFO' && !SHOW_INFO.has(e.code)) return;
  if (mode === 'EVALUATION' && READ_EVENTS.has(e.code)) return;
  const params: Record<string, unknown> = { ...(e.params ?? {}) };
  if (typeof params.cmd === 'string') params.cmd = t(`f12.cmdName.${params.cmd}`);
  for (const k of ['obj', 'target', 'inst', 'what'] as const) {
    if (typeof params[k] === 'string') {
      const key = `f12.obj.${params[k]}`;
      const tr = t(key);
      if (tr !== key) params[k] = tr;
    }
  }
  if (typeof params.kind === 'string') params.kind = t(`f12.desc.spool.${params.kind}`);
  for (const [k, d] of [['cm', 2], ['n', 0], ['hz', 0], ['res', 2], ['mm', 2], ['kPa', 1], ['mL', 0], ['L', 1], ['Ls', 2], ['pct', 0], ['s', 2], ['p1', 2], ['p2', 2], ['p3', 2], ['range', 0]] as const) {
    if (typeof params[k] === 'number') params[k] = fmtNum(params[k] as number, d);
  }
  const key = err ? `f12fb.${err}` : `f12.ev.${e.code}`;
  const text = t(key, params);
  if (text === key) return;
  const level = e.severity === 'CRITICAL' ? 'critical' : e.severity === 'ALERT' ? 'alert' : e.severity === 'WARN' ? 'warn' : 'info';
  sink.toast(level, err ? `F12-${err} · ${text}` : text);
  if (snd && (e.severity === 'CRITICAL' || e.severity === 'ALERT')) sink.caption(t(`p4.cap.${snd}`));
}

const fired = new Set<string>();
let firedFor = '';

/** Observaciones en vivo (práctica y guiado), una vez por situación y por intento. */
export function f12LiveFeedback(w: F12World, mode: F12Mode, attemptId: string, sink: Sink): void {
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
  // Aire en el circuito con caudal: purgar por el punto alto antes de leer.
  if (flowingF12(w) && airInLinesF12(w)) once('air', 'f12.hint.air');
  // Venturi sin abrazaderas con caudal: el empuje lo corre.
  if (flowingF12(w) && !w.circuit.clamped) once('clamp', 'f12.hint.clamp');
  // Purga abierta tirando agua: cerrarla.
  if (w.circuit.purgeOpen && w.circuit.airCm3 <= 0 && flowingF12(w)) once('purge', 'f12.hint.purge');
  // Derrame en la mesada: secar antes de seguir (hay equipos eléctricos cerca).
  if (w.spill > 1) once('spill', 'f12.hint.spill');
}
