/**
 * Retroalimentación de la Práctica 6 (§25): primero la consecuencia observable y luego el principio; en evaluación
 * solo seguridad y hechos observables (las explicaciones quedan para el informe). Nunca completa cálculos.
 */
import type { P6World, SimEvent } from '../../simulation/calorimetry-world/types';
import type { P6Mode } from '../../practices/practice-06/definition';
import { activeRun, displayedSlope } from '../../simulation/calorimetry-world/world';
import { t } from '../i18n';
import type { CalorSound } from '../../engine/calor/host';

interface Sink {
  toast(level: 'info' | 'warn' | 'alert' | 'critical', text: string): void;
  caption(text: string): void;
  stage: { audio: { play(n: CalorSound): void } } | null;
  settings: { captions: boolean };
}

/** Pistas de técnica que se ocultan en evaluación (las de seguridad siempre se muestran). */
const HIDE_IN_EVALUATION = new Set([
  'READING_UNCALIBRATED', 'BALANCE_NOT_SETTLED', 'ZERO_NOT_ADJUSTED', 'READING_UNSTABLE', 'PARALLAX', 'WEIGHED_WET', 'SHORT_SOAK', 'BATH_NOT_MEASURED',
  'SLOW_TRANSFER', 'NOT_STIRRED', 'PEAK_TOO_EARLY', 'PEAK_TOO_LATE', 'METAL_ABOVE_LEVEL', 'TUBE_ON_BOTTOM', 'READING_CHANGING', 'LID_LEFT_OPEN', 'THERMO_TOUCHING',
  'BULB_NOT_IMMERSED', 'MIXED_METALS', 'WRONG_TUBE', 'PIECE_STUCK',
]);

const SHOW_INFO = new Set([
  'BALANCE_CALIBRATED', 'BALANCE_LEVELED', 'READING_RECORDED', 'VOLUME_READ', 'TEMP_READ', 'PEAK_RECORDED', 'METAL_IN_CALORIMETER', 'CUP_EMPTIED', 'DRIED',
  'STATION_RESET', 'INCIDENT_RESOLVED', 'BOMB_PROFILE', 'BOMB_CALIBRATION', 'BOMB_LEAK_OK', 'BOMB_FIRED', 'BOMB_COMPLETE', 'BOMB_VENTED', 'BOMB_OPENED', 'BOMB_ABORTED',
]);

const SOUND: Partial<Record<string, CalorSound>> = { BURN: 'sizzle', TUBE_CRACKED: 'break', SPLASH: 'drip', WATER_SPILLED: 'drip', BOMB_FIRED: 'spark' };

export function p6EventFeedback(e: SimEvent, mode: P6Mode, sink: Sink): void {
  if (mode === 'EVALUATION' && HIDE_IN_EVALUATION.has(e.code)) return;
  if (e.severity === 'INFO' && !SHOW_INFO.has(e.code)) return;
  if (mode === 'EVALUATION' && (e.code === 'TEMP_READ' || e.code === 'VOLUME_READ' || e.code === 'READING_RECORDED')) return;
  const params: Record<string, unknown> = { ...(e.params ?? {}) };
  if (typeof params.obj === 'string') params.obj = t(`p6.obj.${params.obj}`);
  if (typeof params.id === 'string') params.id = t(`p6.obj.${params.id}`, { code: '' });
  if (typeof params.target === 'string') params.target = t(`p6.obj.${params.target}`) !== `p6.obj.${params.target}` ? t(`p6.obj.${params.target}`, { code: '' }) : params.target;
  if (typeof params.where === 'string') params.where = t(`p6.where.${params.where}`);
  if (typeof params.dir === 'string') params.dir = t(`p6.dir.${params.dir}`);
  if (typeof params.code === 'string') params.code = t(`p6.block.short.${params.code}`);
  if (typeof params.list === 'string') params.list = params.list.split(',').map((x) => t(`p6.lock.${x}`)).join(', ');
  if (typeof params.part === 'string') params.part = t(`p6.bombPart.${params.part}`);
  if (typeof params.residue === 'string') params.residue = t(`p6.residue.${params.residue}`);
  for (const k of ['g', 'c', 'ml', 'drop'] as const) if (typeof params[k] === 'number') params[k] = (params[k] as number).toFixed(k === 'c' ? 1 : 2).replace('.', ',');
  const key = `p6.ev.${e.code}`;
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

/** Observaciones en vivo (práctica y guiado), una vez por situación y por intento (§25.2). */
export function p6LiveFeedback(w: P6World, mode: P6Mode, attemptId: string, sink: Sink): void {
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
  if (run && !run.recorded) {
    const s = displayedSlope(w, 'cal', 8);
    if (w.timeS - run.startS > 5 && s > 0.01) once(`rising:${run.index}`, 'info', 'p6.live.rising');
    if (w.timeS - run.startS > 8 && !w.cal.lidClosed) once(`lid:${run.index}`, 'warn', 'p6.live.lidOpen');
    if (w.timeS - run.startS > 40 && s < -0.002) once(`falling:${run.index}`, 'info', 'p6.live.falling');
  }
  for (const tb of Object.values(w.tubes)) {
    if (tb.liftedAt !== null && w.timeS - tb.liftedAt > 6 && w.objects[tb.id].support !== 'bath' && tb.metalC > 60) once(`cool:${tb.id}:${Math.round(tb.liftedAt)}`, 'info', 'p6.live.cooling');
  }
  if (w.bath.vigor > 0.02) once('boiling', 'info', 'p6.live.boiling', { c: w.bath.boilingC.toFixed(1).replace('.', ',') });
  if (w.objects.beaker.support === 'plate' && w.vessels.beaker.waterG > 0 && w.vessels.beaker.waterG < 150 && w.plate.knob > 0) once('lowBath', 'warn', 'p6.live.lowBath');
}
