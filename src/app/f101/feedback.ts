/**
 * Retroalimentación de F101: primero la consecuencia observable, luego la causa y la recuperación (los
 * mismos textos del informe). En evaluación solo se muestran la seguridad y los hechos observables.
 * Nunca completa cálculos ni dice qué valor debió leerse.
 */
import type { F101World, SimEvent } from '../../simulation/f101-world/types';
import type { F101Mode } from '../../practices/practice-f101/definition';
import { ringOffsetMm } from '../../simulation/f101-world/world';
import { t } from '../i18n';
import type { F101Sound } from '../../engine/f101/host';

interface Sink {
  toast(level: 'info' | 'warn' | 'alert' | 'critical', text: string): void;
  caption(text: string): void;
  stage: { audio: { play(n: F101Sound): void } } | null;
  settings: { captions: boolean };
}

/** Evento del dominio → error de técnica cuyo texto explica la causa y la recuperación. */
export const EVENT_ERR: Record<string, string> = {
  CALIPER_ZERO_UNCHECKED: 'E01', CALIPER_OVERFORCE: 'E02', CALIPER_OBLIQUE: 'E03', MICROMETER_NO_RATCHET: 'E04', MICROMETER_DIRTY: 'E05',
  SCALE_PARALLAX: 'E06', BALANCE_UNSTABLE_SUPPORT: 'E07', TARE_MISSING: 'E08', PART_DROPPED: 'E09', MENISCUS_MISREAD: 'E10', PULLEY_UNSEATED: 'E11',
  STRING_OFF_WHEEL: 'E12', RING_TOUCHES_PIN: 'E13', MASS_CHANGED_UNSECURED: 'E19', MASSES_LEFT_ON: 'E20', INSTRUMENT_ZERO_SKIPPED: 'E21',
  SENSOR_CLIPPED: 'E22', SENSOR_NOT_CONNECTED: 'E23', SAMPLING_TOO_LOW: 'E24', LINE_OF_SIGHT_BLOCKED: 'E25', INSTRUMENT_TILTED: 'E26',
  SENSOR_UNCALIBRATED: 'E27', TABLE_NOT_LEVEL: 'E28', ANGLE_PARALLAX: 'E29', READ_BEFORE_STABLE: 'E30', CONFIG_CHANGED_MIDRUN: 'E32',
  DATA_AFTER_DAMAGE: 'E39', UNSAFE_DISASSEMBLY: 'E40',
};

/** Errores de técnica que en evaluación no se explican en vivo (quedan para el informe); la seguridad siempre se muestra. */
const SAFETY_ERRS = new Set(['E09', 'E19', 'E20', 'E39', 'E40']);

/** Eventos informativos que sí se muestran (los demás INFO son silenciosos). */
export const SHOW_INFO = new Set([
  'PPE_OK', 'INSPECTED', 'INSPECT_CALIPER', 'INSPECT_MICROMETER', 'INSPECT_RULER', 'INSPECT_BALANCE', 'INSPECT_GRADCYL', 'INSPECT_TABLE', 'INSPECT_DYN', 'INSPECT_SENSOR',
  'INSPECT_STANDARD', 'CALIPER_ZERO_READ', 'MICRO_ZERO_READ', 'LENGTH_READ', 'MASS_READ', 'VOLUME_READ', 'BALANCE_ON', 'BALANCE_LEVELED', 'TARED', 'FACES_CLEANED',
  'TABLE_LEVELED', 'EQUILIBRIUM_RECORDED', 'DYN_ZEROED', 'SENSOR_CALIBRATED', 'CAPTURE_DONE', 'CYLINDER_REPLACED', 'STATION_CLOSED', 'STATION_RESET',
]);

/** Lecturas: en evaluación no se repite el valor en un aviso (solo queda en la lista de lecturas). */
const READ_EVENTS = new Set(['CALIPER_ZERO_READ', 'MICRO_ZERO_READ', 'LENGTH_READ', 'MASS_READ', 'VOLUME_READ', 'EQUILIBRIUM_RECORDED', 'CAPTURE_DONE']);

const SOUND: Partial<Record<string, F101Sound>> = { PART_DROPPED: 'drip', CYLINDER_CRACKED: 'alert', CRACK_FOUND: 'alert', UNSAFE_DISASSEMBLY: 'alert' };

const fmtNum = (v: number, d: number) => v.toFixed(d).replace('.', ',');

export function f101EventFeedback(e: SimEvent, mode: F101Mode, sink: Sink): void {
  const err = EVENT_ERR[e.code];
  if (mode === 'EVALUATION' && err && !SAFETY_ERRS.has(err)) return;
  if (e.severity === 'INFO' && !SHOW_INFO.has(e.code)) return;
  if (mode === 'EVALUATION' && READ_EVENTS.has(e.code)) return;
  const params: Record<string, unknown> = { ...(e.params ?? {}) };
  for (const k of ['obj', 'target', 'inst', 'part'] as const) {
    if (typeof params[k] === 'string') {
      const key = `f101.obj.${params[k]}`;
      const tr = t(key);
      if (tr !== key) params[k] = tr;
    }
  }
  for (const [k, d] of [['mm', 2], ['g', 2], ['ml', 1], ['n', 0], ['N', 2], ['deg', 0]] as const) if (typeof params[k] === 'number') params[k] = fmtNum(params[k] as number, d);
  const key = err ? `f101fb.${err}` : `f101.ev.${e.code}`;
  const text = t(key, params);
  if (text === key) return;
  const level = e.severity === 'CRITICAL' ? 'critical' : e.severity === 'ALERT' ? 'alert' : e.severity === 'WARN' ? 'warn' : 'info';
  sink.toast(level, err ? `F101-${err} · ${text}` : text);
  const snd = SOUND[e.code] ?? (e.severity === 'CRITICAL' || e.severity === 'ALERT' ? 'alert' : undefined);
  if (snd) {
    sink.stage?.audio.play(snd);
    sink.caption(t(`p4.cap.${snd}`));
  }
}

const fired = new Set<string>();
let firedFor = '';

/** Observaciones en vivo (práctica y guiado), una vez por situación y por intento. */
export function f101LiveFeedback(w: F101World, mode: F101Mode, attemptId: string, sink: Sink): void {
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
  const tb = w.table;
  if (!tb.pinIn && ringOffsetMm(w) > 3 && Math.hypot(tb.ring.vx, tb.ring.vy) < 0.002) once(`ringOff:${w.readingOrder.length}`, 'f101.live.ringOff');
  if (w.caliper.forceN > w.params.caliper.forceLimitN * 0.8 && !w.caliper.locked) once('caliperForce', 'f101.hint.caliperForce');
  if (w.balance.powered && !w.balance.stable) once('balanceSettle', 'f101.hint.waitStable');
}
