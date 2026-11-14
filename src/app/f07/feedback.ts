/**
 * Retroalimentación de F07: primero la consecuencia observable, luego la causa y la recuperación (los mismos textos
 * del informe). En evaluación solo se muestran la seguridad y los hechos observables. Nunca completa cálculos ni dice
 * qué valor debió leerse.
 */
import type { F07World, SimEvent } from '../../simulation/f07-world/types';
import type { F07Mode } from '../../practices/practice-f07/definition';
import { t } from '../i18n';
import type { F07Sound } from '../../engine/f07/host';

interface Sink {
  toast(level: 'info' | 'warn' | 'alert' | 'critical', text: string): void;
  caption(text: string): void;
  stage: { audio: { play(n: F07Sound): void } } | null;
  settings: { captions: boolean };
}

/** Evento del dominio → error de técnica cuyo texto explica la causa y la recuperación. */
export const EVENT_ERR: Record<string, string> = {
  TRACK_INCLINED: 'E01', MASS_NOT_WEIGHED: 'E02', TARGET_MOVING: 'E03', FLAG_WIDTH: 'E04', GATE_IN_COLLISION_ZONE: 'E05', VELCRO_LOOSE: 'E06', MAGNET_POLARITY: 'E07',
  CARTS_OVERLAP: 'E08', PUSHED_DURING_RUN: 'E09', BRAKE_LEFT_ON: 'E10', CART_CRASH: 'E14', END_STOP_HIT: 'E14', OBLIQUE_COLLISION: 'E15', WHEEL_BIND: 'E16',
  MASS_CHANGED_IN_MOTION: 'E18', HAND_IN_GATE: 'E19', NOT_ZEROED: 'E21', SENSOR_SATURATED: 'E22', NO_SIGNAL: 'E23', LOW_RATE: 'E24', BEAM_OCCLUDED: 'E25',
  SENSOR_TILTED: 'E26', SENSOR_UNCALIBRATED: 'E27', GATE_SLIPPED: 'E28', SCALE_PARALLAX: 'E29', READ_BEFORE_STABLE: 'E30', CONFIG_DURING_RUN: 'E32',
  READ_AFTER_IMPACT: 'E39', LAUNCHER_FIRED: 'E40',
};

/** Errores de técnica que en evaluación no se explican en vivo (quedan para el informe); la seguridad siempre se muestra. */
const SAFETY_ERRS = new Set(['E14', 'E40']);

/** Eventos informativos que sí se muestran (los demás INFO son silenciosos). */
export const SHOW_INFO = new Set([
  'PPE_OK', 'INSPECTED', 'INSPECT_TRACK', 'INSPECT_ENDS', 'INSPECT_LAUNCHER', 'INSPECT_LEVEL', 'INSPECT_CART', 'INSPECT_CART_BAD', 'INSPECT_CARTMASS', 'INSPECT_BUMPER',
  'INSPECT_BUMPER_POLARITY', 'INSPECT_CALIPER', 'INSPECT_GATE', 'INSPECT_FORCE', 'INSPECT_LOGGER', 'INSPECT_CAMERA', 'INSPECT_RULER', 'INSPECT_BALANCE', 'BALANCE_TARED',
  'BALANCE_READ', 'FLAG_MEASURED', 'LEVEL_READ', 'POSITION_READ', 'GATES_READ', 'FORCE_READ', 'MOTION_READ', 'RUN_DONE', 'COLLISION', 'CARTS_JOINED', 'SENSOR_CALIBRATED',
  'SENSOR_ZEROED', 'WHEEL_FREED', 'MAGNET_FLIPPED', 'CART_REPAIRED', 'STATION_CLOSED', 'STATION_RESET',
]);

/** Lecturas: en evaluación no se repite el valor en un aviso (solo queda en la lista de lecturas). */
const READ_EVENTS = new Set(['BALANCE_READ', 'FLAG_MEASURED', 'LEVEL_READ', 'POSITION_READ', 'GATES_READ', 'FORCE_READ', 'MOTION_READ']);

const SOUND: Partial<Record<string, F07Sound>> = {
  CART_CRASH: 'alert', LAUNCHER_FIRED: 'alert', CARTS_RELEASED: 'metal', COLLISION: 'click', CART_DAMAGED: 'alert', CARTS_JOINED: 'click',
};

const fmtNum = (v: number, d: number) => v.toFixed(d).replace('.', ',');

export function f07EventFeedback(e: SimEvent, mode: F07Mode, sink: Sink): void {
  const err = e.severity === 'INFO' ? undefined : EVENT_ERR[e.code];
  const snd = SOUND[e.code] ?? (e.severity === 'CRITICAL' || e.severity === 'ALERT' ? 'alert' : undefined);
  if (snd) sink.stage?.audio.play(snd);
  if (mode === 'EVALUATION' && err && !SAFETY_ERRS.has(err)) return;
  if (e.severity === 'INFO' && !SHOW_INFO.has(e.code)) return;
  if (mode === 'EVALUATION' && READ_EVENTS.has(e.code)) return;
  const params: Record<string, unknown> = { ...(e.params ?? {}) };
  if (typeof params.type === 'string') params.type = t(`f07.bumper.${params.type}`);
  if (typeof params.cmd === 'string') params.cmd = t(`f07.cmdName.${params.cmd}`);
  for (const k of ['obj', 'target', 'inst', 'part', 'what', 'id', 'ch', 'cart', 'g'] as const) {
    if (typeof params[k] === 'string') {
      const key = `f07.obj.${params[k]}`;
      const tr = t(key);
      if (tr !== key) params[k] = tr;
    }
  }
  for (const [k, d] of [['cm', 2], ['v', 2], ['n', 0], ['deg', 2], ['hz', 0], ['g', 1], ['range', 0], ['res', 2], ['J', 4], ['off', 1], ['flag', 0], ['max', 0]] as const) {
    if (typeof params[k] === 'number') params[k] = fmtNum(params[k] as number, d);
  }
  const key = err ? `f07fb.${err}` : `f07.ev.${e.code}`;
  const text = t(key, params);
  if (text === key) return;
  const level = e.severity === 'CRITICAL' ? 'critical' : e.severity === 'ALERT' ? 'alert' : e.severity === 'WARN' ? 'warn' : 'info';
  sink.toast(level, err ? `F07-${err} · ${text}` : text);
  if (snd && (e.severity === 'CRITICAL' || e.severity === 'ALERT')) sink.caption(t(`p4.cap.${snd}`));
}

const fired = new Set<string>();
let firedFor = '';

/** Observaciones en vivo (práctica y guiado), una vez por situación y por intento. */
export function f07LiveFeedback(w: F07World, mode: F07Mode, attemptId: string, sink: Sink): void {
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
  // Primer choque terminado: el impulso se lee como área bajo F–t en la gráfica del registrador.
  if (w.runs.length === 1 && w.runs[0].done) once('area', 'f07.hint.area');
  // Lanzador trabado sin los amortiguadores de los topes: un carro rápido puede golpear el extremo.
  if ((w.carts.cartA.latched || w.carts.cartB.latched) && !w.track.endDampers) once('dampers', 'f07.hint.dampers');
  // Freno de un carro puesto con el lanzador trabado.
  if ((w.carts.cartA.latched || w.carts.cartB.latched) && (w.carts.cartA.brake || w.carts.cartB.brake)) once('brake', 'f07.hint.brake');
  // Tornillo de nivelación recién girado: esperar a que la burbuja se quede quieta antes de leer.
  if (w.timeS - w.track.touchedS < 0.5) once('settle', 'f07.hint.settle');
}
