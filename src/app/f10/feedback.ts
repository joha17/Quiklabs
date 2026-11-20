/**
 * Retroalimentación de F10: primero la consecuencia observable, luego la causa y la recuperación (los mismos textos
 * del informe). En evaluación solo se muestran la seguridad y los hechos observables. Nunca completa cálculos ni dice
 * qué valor debió leerse.
 */
import type { F10World, SimEvent } from '../../simulation/f10-world/types';
import type { F10Mode } from '../../practices/practice-f10/definition';
import { t } from '../i18n';
import type { F10Sound } from '../../engine/f10/host';

interface Sink {
  toast(level: 'info' | 'warn' | 'alert' | 'critical', text: string): void;
  caption(text: string): void;
  stage: { audio: { play(n: F10Sound): void } } | null;
  settings: { captions: boolean };
}

/** Evento del dominio → error de técnica cuyo texto explica la causa y la recuperación. */
export const EVENT_ERR: Record<string, string> = {
  BEAM_NOT_SEATED: 'E01', BEAM_TIPPING: 'E02', DYN_OBLIQUE: 'E05', HAND_DURING_READ: 'E06', MASS_DROPPED: 'E07', SUPPORTS_COINCIDENT: 'E09', GAUGE_TRANSVERSE_READ: 'E11',
  QUICK_UNLOAD: 'E14', READ_AFTER_QUICK_UNLOAD: 'E14', ECCENTRIC_GRIP: 'E15', RELOAD_PLASTIC: 'E16', GAUGE_NOT_STILL: 'E18', GRIP_PRELOAD: 'E19', BENCH_TILTED: 'E20',
  NOT_ZEROED: 'E21', SENSOR_SATURATED: 'E22', NO_SIGNAL: 'E23', LOW_RATE: 'E24', GAUGE_OCCLUDED: 'E25', GAUGE_TILTED: 'E26', GAUGE_UNCALIBRATED: 'E27', SUPPORT_MOVED: 'E28',
  SCALE_PARALLAX: 'E29', READ_BEFORE_STABLE: 'E30', CONFIG_DURING_RUN: 'E32', READ_AFTER_IMPACT: 'E39', UNSAFE_CLOSE: 'E40',
};

/** Errores de técnica que en evaluación no se explican en vivo (quedan para el informe); la seguridad siempre se muestra. */
const SAFETY_ERRS = new Set(['E02', 'E07', 'E14', 'E40']);

/** Eventos informativos que sí se muestran (los demás INFO son silenciosos). */
export const SHOW_INFO = new Set([
  'PPE_OK', 'INSPECTED', 'INSPECT_BEAM', 'INSPECT_BEAM_BAD', 'INSPECT_SUPPORT', 'INSPECT_SUPPORT_FREE', 'INSPECT_SUPPORT_LOOSE', 'INSPECT_RAIL', 'INSPECT_LOAD', 'INSPECT_LOAD_OPEN',
  'INSPECT_DYN', 'INSPECT_DYN_OFF', 'INSPECT_GANTRY', 'INSPECT_WEDGE', 'INSPECT_LEVEL', 'INSPECT_LEVEL_BAD', 'INSPECT_TAPE', 'INSPECT_CALIPER', 'INSPECT_PRESS', 'INSPECT_SPECIMEN',
  'INSPECT_GRIP', 'INSPECT_GRIP_ECC', 'INSPECT_CRANK', 'INSPECT_CRANK_LOCKED', 'INSPECT_LOADCELL', 'INSPECT_LOADCELL_OFF', 'INSPECT_GAUGE', 'INSPECT_GAUGE_UNCAL', 'INSPECT_SHIELD',
  'INSPECT_LOGGER', 'INSPECT_RACK', 'DYN_READ', 'TAPE_READ', 'CALIPER_READ', 'CELL_READ', 'LOADCELL_READ', 'GAUGE_READ', 'CURVE_READ', 'DYN_ZEROED', 'CELLS_ZEROED',
  'LOADCELL_ZEROED', 'GAUGE_ZEROED', 'GAUGE_CALIBRATED', 'BENCH_LEVELLED', 'BEAM_SEATED', 'GRIPS_ALIGNED', 'KNIFE_TIGHT', 'BEAM_RESET', 'BEAM_REPAIRED', 'LOAD_RECOVERED',
  'LOG_STARTED', 'LOG_STOPPED', 'STATION_CLOSED', 'STATION_RESET',
]);

/** Lecturas: en evaluación no se repite el valor en un aviso (solo queda en la lista de lecturas). */
const READ_EVENTS = new Set(['DYN_READ', 'TAPE_READ', 'CALIPER_READ', 'CELL_READ', 'LOADCELL_READ', 'GAUGE_READ', 'CURVE_READ']);

const SOUND: Partial<Record<string, F10Sound>> = {
  BEAM_TIPPED: 'alert', MASS_DROPPED: 'alert', UNSAFE_CLOSE: 'alert', CRANK_RELEASED: 'click', GRIP_CLOSED: 'click', LOAD_HUNG: 'click',
};

const fmtNum = (v: number, d: number) => v.toFixed(d).replace('.', ',');

export function f10EventFeedback(e: SimEvent, mode: F10Mode, sink: Sink): void {
  const err = e.severity === 'INFO' ? undefined : EVENT_ERR[e.code];
  const snd = SOUND[e.code] ?? (e.severity === 'CRITICAL' || e.severity === 'ALERT' ? 'alert' : undefined);
  if (snd) sink.stage?.audio.play(snd);
  if (mode === 'EVALUATION' && err && !SAFETY_ERRS.has(err)) return;
  if (e.severity === 'INFO' && !SHOW_INFO.has(e.code)) return;
  if (mode === 'EVALUATION' && READ_EVENTS.has(e.code)) return;
  const params: Record<string, unknown> = { ...(e.params ?? {}) };
  if (typeof params.cmd === 'string') params.cmd = t(`f10.cmdName.${params.cmd}`);
  for (const k of ['obj', 'target', 'inst', 'id', 'ch'] as const) {
    if (typeof params[k] === 'string') {
      const key = `f10.obj.${params[k]}`;
      const tr = t(key);
      if (tr !== key) params[k] = tr;
    }
  }
  for (const [k, d] of [['cm', 1], ['n', 0], ['deg', 1], ['hz', 0], ['range', 0], ['N', 2], ['res', 3], ['mm', 3], ['kg', 2], ['L', 0], ['GPa', 0], ['speed', 2], ['max', 0]] as const) {
    if (typeof params[k] === 'number') params[k] = fmtNum(params[k] as number, d);
  }
  const key = err ? `f10fb.${err}` : `f10.ev.${e.code}`;
  const text = t(key, params);
  if (text === key) return;
  const level = e.severity === 'CRITICAL' ? 'critical' : e.severity === 'ALERT' ? 'alert' : e.severity === 'WARN' ? 'warn' : 'info';
  sink.toast(level, err ? `F10-${err} · ${text}` : text);
  if (snd && (e.severity === 'CRITICAL' || e.severity === 'ALERT')) sink.caption(t(`p4.cap.${snd}`));
}

const fired = new Set<string>();
let firedFor = '';

/** Observaciones en vivo (práctica y guiado), una vez por situación y por intento. */
export function f10LiveFeedback(w: F10World, mode: F10Mode, attemptId: string, sink: Sink): void {
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
  // Primera curva registrada: el tramo recto da la rigidez; lo que queda al descargar es la deformación residual.
  if (w.runs.length === 1 && w.runs[0].done) once('fit', 'f10.hint.fit');
  // Carga en la viga con el gancho abierto: se soltará.
  if (w.loads.load1.where === 'beam' && !w.loads.load1.hookClosed) once('hook', 'f10.hint.hook');
  // Viga sobre los apoyos sin trabarlos: se correrán al cargarla.
  if (w.beam.where === 'supports' && (!w.supports.A.clamped || !w.supports.B.clamped)) once('clamp', 'f10.hint.clamp');
  // Probeta tomada con el protector abierto: ciérralo antes de girar la manivela.
  if (w.press.gripTop && w.press.gripBottom && !w.press.shieldClosed) once('shield', 'f10.hint.shield');
}
