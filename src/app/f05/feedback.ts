/**
 * Retroalimentación de F05: primero la consecuencia observable, luego la causa y la recuperación (los mismos textos
 * del informe). En evaluación solo se muestran la seguridad y los hechos observables. Nunca completa cálculos ni dice
 * qué valor debió leerse.
 */
import type { F05World, SimEvent } from '../../simulation/f05-world/types';
import type { F05Mode } from '../../practices/practice-f05/definition';
import { t } from '../i18n';
import type { F05Sound } from '../../engine/f05/host';

interface Sink {
  toast(level: 'info' | 'warn' | 'alert' | 'critical', text: string): void;
  caption(text: string): void;
  stage: { audio: { play(n: F05Sound): void } } | null;
  settings: { captions: boolean };
}

/** Evento del dominio → error de técnica cuyo texto explica la causa y la recuperación. */
export const EVENT_ERR: Record<string, string> = {
  PLANE_DRIFT: 'E03', SUDDEN_PULL: 'E05', BALLAST_FELL: 'E07', BLOCK_OFF_EDGE: 'E09', SUPPORT_ANGLE: 'E10', FBD_FRICTION_WITH_MOTION: 'E12',
  FBD_VERTICAL_PULL: 'E14', WORN_SURFACE: 'E16', PLANE_AT_STOP: 'E19', PLANE_SLAM: 'E20', BALANCE_NOT_TARED: 'E21', SENSOR_SATURATED: 'E22',
  SUPPORT_SHIFTED: 'E28', SCALE_PARALLAX: 'E29', READ_BEFORE_STABLE: 'E30', CONFIG_DURING_RUN: 'E32', CABLE_SNAP: 'E40',
  CABLE_TILTED: 'E01', READ_AFTER_JERK: 'E05', READ_ACCELERATING: 'E06', LOAD_SHIFTED: 'E07', NOT_ZEROED: 'E08', READ_OSCILLATING: 'E15',
  NO_SIGNAL: 'E23', LOW_RATE: 'E24', GATE_OCCLUDED: 'E25', SENSOR_TILTED: 'E26', SENSOR_UNCALIBRATED: 'E27', READ_AFTER_IMPACT: 'E39',
};

/** Errores de técnica que en evaluación no se explican en vivo (quedan para el informe); la seguridad siempre se muestra. */
const SAFETY_ERRS = new Set(['E20', 'E40']);

/** Eventos informativos que sí se muestran (los demás INFO son silenciosos). */
export const SHOW_INFO = new Set([
  'PPE_OK', 'INSPECTED', 'INSPECT_BALANCE', 'INSPECT_BALLAST', 'INSPECT_BLOCK', 'INSPECT_CATCHER', 'INSPECT_ELEVATOR', 'INSPECT_GATE', 'INSPECT_GONIO',
  'INSPECT_LOADCELL', 'INSPECT_LOGGER', 'INSPECT_PULLER', 'INSPECT_SPRING', 'INSPECT_THERMO', 'BALANCE_TARED', 'BALANCE_READ', 'TEMP_READ', 'ANGLE_READ',
  'SCALE_READ', 'PULL_DONE', 'PULL_READ', 'SLIDE_DONE', 'SLIDE_READ', 'BLOCK_SLIPPED', 'SURFACE_SET', 'CABLE_ATTACHED', 'SENSOR_CALIBRATED', 'FBD_LOCKED',
  'STATION_CLOSED', 'STATION_RESET', 'FLAG_RESEATED', 'PULLER_RETURNED', 'PULLER_END',
]);

/** Lecturas: en evaluación no se repite el valor en un aviso (solo queda en la lista de lecturas). */
const READ_EVENTS = new Set(['BALANCE_READ', 'TEMP_READ', 'ANGLE_READ', 'SCALE_READ', 'PULL_READ', 'SLIDE_READ']);

const SOUND: Partial<Record<string, F05Sound>> = {
  BLOCK_HIT_STOP: 'metal', PLANE_SLAM: 'alert', CABLE_SNAP: 'alert', BALLAST_FELL: 'alert', JERK: 'click', BLOCK_SLIPPED: 'click',
};

const fmtNum = (v: number, d: number) => v.toFixed(d).replace('.', ',');

export function f05EventFeedback(e: SimEvent, mode: F05Mode, sink: Sink): void {
  const err = e.severity === 'INFO' ? undefined : EVENT_ERR[e.code];
  const snd = SOUND[e.code] ?? (e.severity === 'CRITICAL' || e.severity === 'ALERT' ? 'alert' : undefined);
  if (snd) sink.stage?.audio.play(snd);
  if (mode === 'EVALUATION' && err && !SAFETY_ERRS.has(err)) return;
  if (e.severity === 'INFO' && !SHOW_INFO.has(e.code)) return;
  if (mode === 'EVALUATION' && READ_EVENTS.has(e.code)) return;
  const params: Record<string, unknown> = { ...(e.params ?? {}) };
  if (typeof params.body === 'string') params.body = t(`f05.fbd.body.${params.body}`);
  if (typeof params.mat === 'string') params.mat = t(`f05.material.${params.mat}`);
  for (const k of ['obj', 'target', 'inst', 'part', 'what', 'id', 'ch'] as const) {
    if (typeof params[k] === 'string') {
      const key = `f05.obj.${params[k]}`;
      const tr = t(key);
      if (tr !== key) params[k] = tr;
    }
  }
  for (const [k, d] of [['cm', 1], ['a', 2], ['T', 3], ['b', 2], ['v', 2], ['n', 0], ['deg', 2], ['res', 3], ['hz', 0], ['g', 1], ['range', 0], ['ms', 2], ['F', 2], ['c', 1], ['k', 0], ['mm', 1]] as const) {
    if (typeof params[k] === 'number') params[k] = fmtNum(params[k] as number, d);
  }
  const key = err ? `f05fb.${err}` : `f05.ev.${e.code}`;
  const text = t(key, params);
  if (text === key) return;
  const level = e.severity === 'CRITICAL' ? 'critical' : e.severity === 'ALERT' ? 'alert' : e.severity === 'WARN' ? 'warn' : 'info';
  sink.toast(level, err ? `F05-${err} · ${text}` : text);
  if (snd && (e.severity === 'CRITICAL' || e.severity === 'ALERT')) sink.caption(t(`p4.cap.${snd}`));
}

const fired = new Set<string>();
let firedFor = '';

/** Observaciones en vivo (práctica y guiado), una vez por situación y por intento. */
export function f05LiveFeedback(w: F05World, mode: F05Mode, attemptId: string, sink: Sink): void {
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
  // Un tirón terminado: la ventana de lectura se elige en la gráfica (pico antes del arranque, meseta después).
  if (w.pulls.length === 1 && w.pulls[0].done) once('window', 'f05.hint.window');
  // Tablero inclinado sin la tuerca de bloqueo: el ángulo deriva solo.
  if (!w.plane.locked && w.plane.relDeg > 3) once('lock', 'f05.hint.lock');
  // Bajada sin la espuma del tope: el golpe puede torcer la bandera.
  if (w.slide && !w.slide.done && !w.catcherOn) once(`catcher:${w.slide.id}`, 'f05.hint.catcher');
  // Cable inclinado: parte de la tensión levanta el bloque y cambia la normal.
  if (w.puller.attached && w.puller.heightCm > 3) once('height', 'f05.hint.height');
}
