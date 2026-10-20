/**
 * Retroalimentación de la Práctica 1 (§9): primero la consecuencia observable, luego la causa y la recuperación. En
 * evaluación solo se muestran la seguridad y los hechos observables (las explicaciones quedan para el informe).
 * Nunca completa cálculos.
 */
import type { P01World, SimEvent } from '../../simulation/density-world/types';
import type { P01Mode } from '../../practices/practice-01/definition';
import { pipetteAboveMarkMl } from '../../simulation/density-world/world';
import { t } from '../i18n';
import type { DensitySound } from '../../engine/density/host';

interface Sink {
  toast(level: 'info' | 'warn' | 'alert' | 'critical', text: string): void;
  caption(text: string): void;
  stage: { audio: { play(n: DensitySound): void } } | null;
  settings: { captions: boolean };
}

/** Pistas de técnica que se ocultan en evaluación (las de seguridad siempre se muestran). */
const HIDE_IN_EVALUATION = new Set([
  'PARALLAX', 'MASS_UNSTABLE', 'BALANCE_UNLEVELED_READ', 'ZERO_BIAS_IGNORED', 'WET_VESSEL_WEIGHED', 'LOAD_REMOVED_EARLY', 'TARE_MISSING', 'TARE_EXTRA_LOAD', 'AIR_ASPIRATED',
  'PIPETTE_BUBBLE', 'PIPETTE_OVERFILL', 'PIPETTE_UNDERFILL', 'PIPETTE_TILTED', 'TIP_WICKED', 'PIPETTE_BLOWN', 'DRAIN_EARLY', 'FLASK_WET', 'CROSS_RESIDUE', 'COLD_SAMPLE_WARMED',
  'THERMO_UNSTABLE', 'THERMO_WALL', 'THERMO_SHALLOW', 'BATH_NOT_READY', 'CYLINDER_TILTED', 'INITIAL_READ_LATE', 'NAILS_PARTIAL', 'TRAPPED_AIR', 'NAIL_LEFT_OUT', 'LEVEL_MOVING',
  'CALIPER_OBLIQUE', 'CALIPER_ZERO_BIAS', 'CALIPER_FORCE', 'CALIPER_HEIGHT_MISALIGNED', 'ERLEN_NOT_VOLUMETRIC', 'POUR_OFF_TARGET', 'NAILS_SPLASH',
]);

const SHOW_INFO = new Set([
  'BALANCE_ON', 'BALANCE_LEVELED', 'MASS_READ', 'VOLUME_READ', 'TEMP_READ', 'LENGTH_READ', 'DELIVERY_DONE', 'MENISCUS_ADJUSTED', 'INSPECT_BALANCE', 'INSPECT_CYLINDER',
  'INSPECT_PIPETTE', 'INSPECT_THERMO', 'INSPECT_CALIPER', 'INSPECT_ERLEN', 'CALIPER_ZERO_OFFSET', 'NAILS_IN', 'AIR_RELEASED', 'PAN_CLEANED', 'SPILL_CLEANED', 'FILLER_CLEANED',
  'STATION_RESET', 'INCIDENT_RESOLVED', 'PPE_OK', 'POUR_DONE',
]);

const SOUND: Partial<Record<string, DensitySound>> = { NAILS_SPLASH: 'drip', CYLINDER_OVERFLOW: 'drip', PAN_WET: 'drip', BENCH_SPILL: 'drip', NAILS_IN: 'metal' };

export function p01EventFeedback(e: SimEvent, mode: P01Mode, sink: Sink): void {
  if (mode === 'EVALUATION' && HIDE_IN_EVALUATION.has(e.code)) return;
  if (e.severity === 'INFO' && !SHOW_INFO.has(e.code)) return;
  if (mode === 'EVALUATION' && ['MASS_READ', 'VOLUME_READ', 'TEMP_READ', 'LENGTH_READ', 'CALIPER_ZERO_OFFSET'].includes(e.code)) return;
  const params: Record<string, unknown> = { ...(e.params ?? {}) };
  for (const k of ['obj', 'from', 'to', 'inst', 'target'] as const) {
    if (typeof params[k] === 'string') params[k] = params[k] === 'bench' ? t('p01.where.bench') : t(`p01.obj.${params[k]}`) !== `p01.obj.${params[k]}` ? t(`p01.obj.${params[k]}`) : params[k];
  }
  if (typeof params.series === 'string') params.series = t(`p01.series.${params.series}`);
  if (typeof params.code === 'string') params.code = t(`p01.block.short.${params.code}`);
  for (const [k, d] of [['g', 2], ['ml', 1], ['c', 1], ['cm', 3], ['res', 3], ['tol', 2]] as const) if (typeof params[k] === 'number') params[k] = (params[k] as number).toFixed(d).replace('.', ',');
  const key = `p01.ev.${e.code}`;
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

/** Observaciones en vivo (práctica y guiado), una vez por situación y por intento. */
export function p01LiveFeedback(w: P01World, mode: P01Mode, attemptId: string, sink: Sink): void {
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
  const cold = w.fluids.waterCold01;
  if (w.objects.waterCold01.support === 'iceBath01' && cold.tempC < w.params.roomTempC - 12) once('cooled', 'info', 'p01.live.cooled');
  const p = w.pipette;
  if (p.waterG > 1 && pipetteAboveMarkMl(w) > 0.3 && p.suction01 === 0 && !p.adjusted) once(`adjust:${w.samples.length}`, 'info', 'p01.live.adjust');
  if (p.delivering && p.drainS > w.params.pipetteDrainTimeS) once(`drained:${w.samples.length}`, 'info', 'p01.live.drained');
  if (w.balance.powered && w.balance.zeroBiasG > 0 && w.balanceOnAt !== null && w.timeS - w.balanceOnAt > 9 && !w.balance.zeroedEmpty && w.balance.panIds.length === 0) once('zeroDrift', 'info', 'p01.live.checkZero');
}
