/**
 * Retroalimentación de la Práctica 8 (§9): primero la consecuencia observable, luego la causa y la recuperación. En
 * Evaluación solo se muestran la seguridad y los hechos observables; nunca anticipa el rendimiento ni la pureza.
 * Las alertas de seguridad se muestran en todos los modos (§11.2).
 */
import type { P08World, SimEvent } from '../../simulation/organic-world/types';
import type { P08Mode } from '../../practices/practice-08/definition';
import { t } from '../i18n';
import type { OrganicSound } from '../../engine/organic/host';
import { p08NameOf } from './describe';

interface Sink {
  toast(level: 'info' | 'warn' | 'alert' | 'critical', text: string): void;
  caption(text: string): void;
  stage: { audio: { play(n: OrganicSound): void } } | null;
  settings: { captions: boolean };
}

/** Pistas de técnica que se ocultan en Evaluación (las de seguridad siempre se muestran, §13). */
const HIDE_IN_EVALUATION = new Set([
  'WRONG_LABEL', 'UNTARED', 'MASS_UNSTABLE', 'PARALLAX', 'WET_OUTSIDE', 'CROSS_CONTAMINATION', 'NO_THERMAL_CONTACT', 'THERMO_NOT_IN_LIQUID', 'NOT_STIRRED', 'HEATING_STOPPED_EARLY',
  'THERMO_UNCHECKED', 'CONDENSER_DRY', 'NO_REFLUX', 'WATER_BEFORE_ACETYLATION', 'NO_CATALYST', 'TOO_MUCH_LIQUID', 'FILTERED_BEFORE_CRYSTALS', 'FILTERED_WARM', 'COARSE_PAPER',
  'BUCHNER_NOT_SEALED', 'WET_CRYSTALS', 'WEIGHED_HOT', 'EXCESS_WATER', 'PRODUCT_DISCARDED', 'PAST_INTERFACE', 'WATER_IN_PRODUCT', 'SATURATED_DESICCANT', 'FRACTION_TOO_WIDE',
  'WET_WEIGHING_GLASS', 'AQUEOUS_AS_PRODUCT', 'VALVE_CLOSED_EARLY', 'VALVE_LEFT_OPEN',
]);

/** Avisos informativos que sí se muestran (lecturas registradas, acciones confirmadas). */
const SHOW_INFO = new Set([
  'PPE_OK', 'BALANCE_ON', 'MASS_READ', 'VOLUME_READ', 'TEMP_READ', 'EMPTIED', 'SPILL_CLEANED', 'BLOCK_CLEARED', 'INSPECT_BALANCE', 'INSPECT_THERMO', 'INSPECT_REAGENT', 'SOLID_ADDED',
  'SCOOPED', 'POUR_DONE', 'VENTED', 'SAMPLE_TAKEN', 'ANALYSIS_STARTED', 'ANALYSIS_DONE', 'FRACTIONS_STARTED', 'FRACTIONS_DONE',
]);

/** Lecturas con valor que en Evaluación no se repiten en un aviso (el valor está en el instrumento). */
const VALUE_EVENTS = new Set(['MASS_READ', 'VOLUME_READ', 'TEMP_READ', 'FRACTIONS_DONE']);

const SOUND: Partial<Record<string, OrganicSound>> = { BENCH_SPILL: 'drip', FLASK_TIPPED: 'alert', SOLID_ADDED: 'drip', VENTED: 'drip' };

export function p08EventFeedback(w: P08World, e: SimEvent, mode: P08Mode, sink: Sink): void {
  if (mode === 'EVALUATION' && HIDE_IN_EVALUATION.has(e.code)) return;
  if (e.severity === 'INFO' && !SHOW_INFO.has(e.code)) return;
  if (mode === 'EVALUATION' && VALUE_EVENTS.has(e.code)) return;
  const params: Record<string, unknown> = { ...(e.params ?? {}) };
  for (const k of ['obj', 'from', 'to'] as const) {
    if (typeof params[k] === 'string') params[k] = params[k] === 'bench' ? t('p8.where.bench') : p08NameOf(w, params[k] as string);
  }
  for (const [k, d] of [['g', 3], ['ml', 1], ['c', 1]] as const) if (typeof params[k] === 'number') params[k] = (params[k] as number).toFixed(d).replace('.', ',');
  if (typeof params.hazard === 'string') params.hazard = t(`p8.hazard.${params.hazard}`);
  if (typeof params.method === 'string') params.method = t(`p8.method.${params.method}`);
  const key = `p8.ev.${e.code}`;
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
export function p08LiveFeedback(w: P08World, mode: P08Mode, attemptId: string, sink: Sink): void {
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
  const rf = w.vessels.rf;
  if (rf && w.objects.rf?.support === 'bath01' && rf.tempC > 45) once('heating', 'info', 'p8.live.heating');
  if (w.evidence.heatingEnded) once('heatingEnded', 'info', 'p8.live.coolFirst');
  const sf = w.vessels.sf;
  if (sf && sf.emulsion01 > 0.3 && sf.stir01 === 0) once(`emulsion:${Math.round(w.evidence.shaken ?? 0)}`, 'info', 'p8.live.settle');
  if (w.fractions.doneAt !== null && !w.fractions.running) once('fractions', 'info', 'p8.live.weighVial');
  if (Object.values(w.vessels).some((v) => v.id.startsWith('bt') && v.capped === false) && Object.keys(w.pours).length === 0) once('uncapped', 'warn', 'p8.live.capBottle');
}
