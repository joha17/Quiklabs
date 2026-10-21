/**
 * Retroalimentación de la Práctica 9 (§9): primero la consecuencia observable, luego la causa y la recuperación. En
 * Evaluación solo se muestran la seguridad y los hechos observables; nunca anticipa qué catión está presente.
 * Las alertas de seguridad (campana, mampara, centrífuga, vidrio de reloj virtual) se muestran en todos los modos.
 */
import type { P09World, SimEvent } from '../../simulation/cation-analysis-world/types';
import type { P09Mode } from '../../practices/practice-09/definition';
import { flowStatus } from '../../simulation/cation-analysis-world/world';
import { t } from '../i18n';
import type { CationSound } from '../../engine/cations/host';
import { colorWords, p09NameOf } from './describe';

interface Sink {
  toast(level: 'info' | 'warn' | 'alert' | 'critical', text: string): void;
  caption(text: string): void;
  stage: { audio: { play(n: CationSound): void } } | null;
  settings: { captions: boolean };
}

/** Pistas de técnica que se ocultan en Evaluación (las de seguridad siempre se muestran). */
const HIDE_IN_EVALUATION = new Set([
  'AMBIENT_TOO_BRIGHT', 'EARLY_READING', 'SPECTRUM_SATURATED', 'NA_ON_LOOP', 'SR_CARRYOVER', 'LOOP_NOT_CLEANED', 'CORE_ZONE', 'SUPPORT_RESIDUE', 'NO_FLAME_READING',
  'MISLABELED', 'PARALLAX', 'TRANSFER_INCOMPLETE', 'SULFATE_INSUFFICIENT', 'SULFATE_EXCESS', 'NOT_MIXED', 'SEPARATED_TOO_SOON', 'ALKALI_ON_ORIGINAL',
  'ALKALI_INSUFFICIENT', 'WATER_FOR_REAGENT', 'REAGENT_CONTAMINATED', 'PH_UNSUITABLE', 'ASYMMETRIC', 'SPIN_TOO_SHORT', 'PELLET_RESUSPENDED', 'ABRUPT_TILT',
  'USEFUL_DISCARDED', 'PELLET_ASPIRATED', 'POUR_UNCOUPLED',
]);

/** Avisos informativos que sí se muestran (lecturas registradas, acciones confirmadas). */
const SHOW_INFO = new Set([
  'PPE_OK', 'BALANCE_ON', 'MASS_READ', 'EMPTIED', 'SPILL_CLEANED', 'BLOCK_CLEARED', 'INSPECTED', 'INSPECT_HOOD', 'INSPECT_CENTRIFUGE', 'POUR_DONE', 'FLAME_ON',
  'SPIN_STARTED', 'SPIN_DONE', 'SUPPORT_CLEANED', 'TUBE_OBSERVED', 'TURBIDITY_READ', 'EMISSION_READ', 'SPECTRUM_READ',
]);

/** Lecturas con valor que en Evaluación no se repiten en un aviso (el valor está en el instrumento o en la libreta). */
const VALUE_EVENTS = new Set(['MASS_READ', 'TURBIDITY_READ', 'TUBE_OBSERVED', 'EMISSION_READ', 'SPECTRUM_READ']);

const SOUND: Partial<Record<string, CationSound>> = { SPLASH: 'drip', GLASS_CRACKED: 'alert', IMBALANCE: 'alert', SPIN_DONE: 'drip' };

export function p09EventFeedback(w: P09World, e: SimEvent, mode: P09Mode, sink: Sink): void {
  if (mode === 'EVALUATION' && HIDE_IN_EVALUATION.has(e.code)) return;
  if (e.severity === 'INFO' && !SHOW_INFO.has(e.code)) return;
  if (mode === 'EVALUATION' && VALUE_EVENTS.has(e.code)) return;
  const params: Record<string, unknown> = { ...(e.params ?? {}) };
  for (const k of ['obj', 'from', 'to', 'id', 'tube', 'source', 'target'] as const) {
    if (typeof params[k] === 'string') params[k] = params[k] === 'bench' ? t('p9.where.bench') : p09NameOf(w, params[k] as string);
  }
  for (const [k, d] of [['g', 2], ['ml', 2], ['ut', 0]] as const) if (typeof params[k] === 'number') params[k] = (params[k] as number).toFixed(d).replace('.', ',');
  for (const k of ['category', 'cat', 'tint'] as const) if (typeof params[k] === 'string') params[k] = colorWords(params[k] as string);
  if (typeof params.flow === 'string') params.flow = t(`p9.flow.${params.flow}`);
  const key = `p9.ev.${e.code}`;
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

/** Observaciones en vivo (práctica y guiado), una vez por situación y por intento. Nunca dicen el resultado. */
export function p09LiveFeedback(w: P09World, mode: P09Mode, attemptId: string, sink: Sink): void {
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
  if (w.ppe && flowStatus(w) === 'low') once('lowFlow', 'warn', 'p9.live.lowFlow');
  if (w.flame.ignited && w.hood.lightPct === 100) once('dimLight', 'info', 'p9.live.dimLight');
  if (w.centrifuge.spinUntil === null && Object.keys(w.evidence).some((k) => k.startsWith('spun:'))) once('decant', 'info', 'p9.live.decantGently');
  if (w.flame.glassStress > w.params.glassStressMax * 0.6 && !w.flame.glassCracked) once('glassHot', 'warn', 'p9.live.glassHot');
}
