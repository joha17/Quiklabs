/**
 * Retroalimentación de la Práctica 10 (§30): primero la consecuencia observable y luego el principio; en evaluación
 * solo seguridad y hechos observables (las explicaciones quedan para el informe). Nunca completa cálculos.
 */
import type { P10World, SimEvent } from '../../simulation/gas-world/types';
import type { P10Mode } from '../../practices/practice-10/definition';
import { activeRun, solveBurette } from '../../simulation/gas-world/world';
import { sensorStable } from '../../simulation/gas-world/boyle-rig';
import { t } from '../i18n';
import type { GasSound } from '../../engine/gas/host';

interface Sink {
  toast(level: 'info' | 'warn' | 'alert' | 'critical', text: string): void;
  caption(text: string): void;
  stage: { audio: { play(n: GasSound): void } } | null;
  settings: { captions: boolean };
}

/** Pistas de técnica que se ocultan en evaluación (las de seguridad siempre se muestran). */
const HIDE_IN_EVALUATION = new Set([
  'PARALLAX', 'BALANCE_UNSTABLE', 'BALANCE_DOORS_OPEN', 'BALANCE_NOT_TARED', 'FAST_FINISH', 'PIPETTE_NOT_CONDITIONED', 'NOT_ADJUSTED', 'BELOW_MARK', 'LEVEL_STILL_MOVING',
  'THERMO_NOT_STABLE', 'RULER_NOT_ALIGNED', 'LATE_SEAL', 'CONNECTED_NOT_AT_10', 'DUPLICATE_VOLUME', 'FAST_PLUNGER', 'PIPETTE_BLOWN', 'NO_FUNNEL', 'BURETTE_AIR_BUBBLE',
  'LOOSE_CONNECTION', 'NOT_CONNECTED_AT_START', 'TARED_WITH_LOAD',
]);

const SHOW_INFO = new Set([
  'BALANCE_LEVELED', 'MASS_READ', 'VOLUME_READ', 'POUR_DONE', 'LEAK_TEST_OK', 'ACID_ADDED', 'REACTION_COMPLETE', 'POINT_SAVED', 'STATION_RESET', 'INCIDENT_RESOLVED',
  'TIP_IN_BURETTE', 'SENSOR_AMBIENT', 'RUN_CLOSED', 'TARED_WITH_LOAD',
]);

const SOUND: Partial<Record<string, GasSound>> = { STOPPER_POPPED: 'hiss', LIQUID_SPILLED: 'drip', FLASK_SPILLED: 'drip', SOLID_SPILLED: 'click', PLUNGER_OUT: 'hiss' };

export function p10EventFeedback(e: SimEvent, mode: P10Mode, sink: Sink): void {
  if (mode === 'EVALUATION' && HIDE_IN_EVALUATION.has(e.code)) return;
  if (e.severity === 'INFO' && !SHOW_INFO.has(e.code)) return;
  if (mode === 'EVALUATION' && (e.code === 'MASS_READ' || e.code === 'VOLUME_READ' || e.code === 'POINT_SAVED' || e.code === 'SENSOR_AMBIENT')) return;
  const params: Record<string, unknown> = { ...(e.params ?? {}) };
  if (typeof params.id === 'string') params.id = t(`p10.obj.${params.id}`);
  if (typeof params.obj === 'string') params.obj = t(`p10.obj.${params.obj}`);
  if (typeof params.from === 'string') params.from = t(`p10.obj.${params.from}`);
  if (typeof params.to === 'string') params.to = params.to === 'bench' ? t('p10.where.bench') : t(`p10.obj.${params.to}`);
  if (typeof params.target === 'string') params.target = t(`p10.obj.${params.target}`) !== `p10.obj.${params.target}` ? t(`p10.obj.${params.target}`) : params.target;
  if (typeof params.inst === 'string') params.inst = t(`p10.obj.${params.inst === 'ruler' ? 'ruler' : params.inst}`);
  if (typeof params.dir === 'string') params.dir = t(`p10.dir.${params.dir}`);
  if (typeof params.code === 'string') params.code = t(`p10.block.short.${params.code}`);
  if (typeof params.at === 'string') params.at = params.at.split(',').map((x) => t(`p10.conn.${x}`)).join(', ');
  if (typeof params.missing === 'string') params.missing = params.missing.split(',').map((x) => t(`p10.conn.${x}`)).join(', ');
  if (typeof params.limiting === 'string') params.limiting = t(`p10.limiting.${params.limiting}`);
  for (const k of ['g', 'ml', 'kPa'] as const) if (typeof params[k] === 'number') params[k] = (params[k] as number).toFixed(k === 'g' ? 4 : 2).replace('.', ',');
  const key = `p10.ev.${e.code}`;
  const text = t(key, params);
  if (text === key) return;
  const level = e.severity === 'CRITICAL' ? 'critical' : e.severity === 'ALERT' ? 'alert' : e.severity === 'WARN' ? 'warn' : 'info';
  sink.toast(level, text);
  const snd = SOUND[e.code] ?? (e.severity === 'CRITICAL' || e.severity === 'ALERT' ? 'alert' : undefined);
  if (snd) {
    sink.stage?.audio.play(snd);
    sink.caption(t(`p4.cap.${snd}`));
  }
}

const fired = new Set<string>();
let firedFor = '';

/** Observaciones en vivo (práctica y guiado), una vez por situación y por intento (§30.2). */
export function p10LiveFeedback(w: P10World, mode: P10Mode, attemptId: string, sink: Sink): void {
  if (mode === 'EVALUATION') return;
  if (firedFor !== attemptId) {
    fired.clear();
    firedFor = attemptId;
  }
  const once = (k: string, level: 'info' | 'warn', key: string, params?: Record<string, unknown>) => {
    if (fired.has(k)) return;
    fired.add(k);
    sink.toast(level, t(key, params));
  };
  const run = activeRun(w);
  if (run) {
    if (!w.reactor.stoppered && w.timeS - run.acidAddedAt > 2.5) once(`seal:${run.index}`, 'warn', 'p10.live.sealNow');
    if (w.reactor.stage === 'COMPLETE') once(`complete:${run.index}`, 'info', 'p10.live.complete');
    if (w.burette.stage === 'READABLE') once(`readable:${run.index}`, 'info', 'p10.live.readable');
    if (w.reactor.pressureKPa - w.params.pressureKPa > 5) once(`press:${run.index}`, 'warn', 'p10.live.pressure');
  }
  if (w.burette.inverted) {
    const s = solveBurette(w);
    if (s.readingMl !== null && s.readingMl < 4 && run) once(`nearFull:${run.index}`, 'warn', 'p10.live.nearFull');
  }
  const sy = w.syringe;
  if (sy.collecting && sy.held && Math.abs(sy.velocityMlS) < 0.02 && !sensorStable(w) && w.params.model === 'REALISTIC') once(`thermal:${Math.round(sy.markMl)}`, 'info', 'p10.live.thermal');
  if (sy.connected && w.sensor.overload) once('overload', 'warn', 'p10.live.overload');
}
