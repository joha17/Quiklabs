/**
 * Retroalimentación de F04: primero la consecuencia observable, luego la causa y la recuperación (los mismos textos
 * del informe). En evaluación solo se muestran la seguridad y los hechos observables. Nunca completa cálculos ni dice
 * qué valor debió leerse.
 */
import type { F04World, SimEvent } from '../../simulation/f04-world/types';
import type { F04Mode } from '../../practices/practice-f04/definition';
import { ballFlying } from '../../simulation/f04-world/world';
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
  ANGLE_CHANGED_UNANCHORED: 'E01', GATE_MISSED: 'E02', GATE_EDGE: 'E02', DRY_FIRE: 'E03', MEASURED_FROM_BASE: 'E06', PLATFORM_MISSED: 'E07', ZONE_OPEN: 'E08',
  WIND_CHANGED_MIDFLIGHT: 'E16', PLATFORM_UNSETTLED: 'E17', TAPE_NOT_ALIGNED: 'E18', LAUNCHER_YAWED: 'E19', INSTRUMENT_ZERO_SKIPPED: 'E21', SENSOR_CLIPPED: 'E22',
  SENSOR_NOT_CONNECTED: 'E23', SAMPLING_TOO_LOW: 'E24', LINE_OF_SIGHT_BLOCKED: 'E25', INSTRUMENT_TILTED: 'E26', SENSOR_UNCALIBRATED: 'E27', SUPPORT_LOOSE: 'E28',
  SCALE_PARALLAX: 'E29', READ_BEFORE_STABLE: 'E30', CONFIG_CHANGED_MIDRUN: 'E32', DATA_AFTER_DAMAGE: 'E39', UNSAFE_DISASSEMBLY: 'E40',
};

/** Errores de técnica que en evaluación no se explican en vivo (quedan para el informe); la seguridad siempre se muestra. */
const SAFETY_ERRS = new Set(['E08', 'E28', 'E39', 'E40']);

/** Eventos informativos que sí se muestran (los demás INFO son silenciosos). */
export const SHOW_INFO = new Set([
  'PPE_OK', 'INSPECTED', 'INSPECT_LAUNCHER', 'INSPECT_STAND', 'INSPECT_GATE', 'INSPECT_TIMER', 'INSPECT_PLATFORM', 'INSPECT_SCREEN', 'INSPECT_TAPE', 'INSPECT_RULER',
  'INSPECT_FAN', 'INSPECT_BALL', 'STAND_ANCHORED', 'STAND_FREED', 'PROTRACTOR_ZEROED', 'PLUMB_MARKED', 'TAPE_ALIGNED', 'PLATFORM_CALIBRATED', 'LEVEL_READ', 'ANGLE_READ',
  'LENGTH_READ', 'GATE_READ', 'IMPACT_READ', 'IMPACT_NONE', 'MARK_READ', 'LAUNCHED', 'STATION_CLOSED', 'STATION_RESET', 'BALL_DAMAGED', 'FAN_ON', 'FAN_OFF',
]);

/** Lecturas: en evaluación no se repite el valor en un aviso (solo queda en la lista de lecturas). */
const READ_EVENTS = new Set(['LEVEL_READ', 'ANGLE_READ', 'LENGTH_READ', 'GATE_READ', 'IMPACT_READ', 'MARK_READ', 'LAUNCHED']);

const SOUND: Partial<Record<string, F04Sound>> = {
  LAUNCHED: 'metal', FIRST_IMPACT: 'clink', BOUNCE: 'click', SCREEN_HIT: 'click', BACKSTOP_HIT: 'click', BALL_DAMAGED: 'alert', UNSAFE_DISASSEMBLY: 'alert', ZONE_OPEN: 'alert',
};

const fmtNum = (v: number, d: number) => v.toFixed(d).replace('.', ',');

export function f04EventFeedback(e: SimEvent, mode: F04Mode, sink: Sink): void {
  const err = EVENT_ERR[e.code];
  const snd = SOUND[e.code] ?? (e.severity === 'CRITICAL' || e.severity === 'ALERT' ? 'alert' : undefined);
  if (snd) sink.stage?.audio.play(snd);
  if (mode === 'EVALUATION' && err && !SAFETY_ERRS.has(err)) return;
  if (e.severity === 'INFO' && !SHOW_INFO.has(e.code)) return;
  if (mode === 'EVALUATION' && READ_EVENTS.has(e.code)) return;
  const params: Record<string, unknown> = { ...(e.params ?? {}) };
  for (const k of ['obj', 'target', 'inst', 'part', 'what'] as const) {
    if (typeof params[k] === 'string') {
      const key = `f04.obj.${params[k]}`;
      const tr = t(key);
      if (tr !== key) params[k] = tr;
    }
  }
  for (const [k, d] of [['mm', 1], ['cm', 1], ['v', 2], ['s', 4], ['n', 0], ['deg', 1], ['res', 1], ['hz', 0], ['g', 0], ['k', 0]] as const) {
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
  // Resorte cargado con la barrera abierta: el disparo no saldrá.
  if (w.launcher.notch > 0 && !w.barrierClosed) once('barrier', 'f04.hint.barrier');
  // Protector puesto y una esfera esperando: hay que sacarlo para cargar.
  if (w.launcher.capOn && w.ppe && w.readingOrder.length > 2 && !w.launcher.loaded && w.shots === 0) once('cap', 'f04.hint.cap');
  // Esfera detenida en la pista: conviene recogerla antes del próximo disparo.
  if (!ballFlying(w) && w.shots > 0 && w.flight && w.objects[w.flight.ball]?.support === 'floor' && w.timeS - w.flight.launchedS > 8) once(`collect:${w.shots}`, 'f04.hint.collect');
}
