/**
 * Retroalimentación de la Práctica 7 (§9): primero la consecuencia observable, luego la causa y la recuperación. En
 * Evaluación solo se muestran la seguridad y los hechos observables; nunca anticipa qué conduce ni qué se disuelve
 * (§1.3). Las alertas de seguridad se muestran en todos los modos (§11.1).
 */
import type { P07World, SimEvent } from '../../simulation/bonding-world/types';
import type { P07Mode } from '../../practices/practice-07/definition';
import { t } from '../i18n';
import type { BondingSound } from '../../engine/bonding/host';
import { p07NameOf } from './describe';

interface Sink {
  toast(level: 'info' | 'warn' | 'alert' | 'critical', text: string): void;
  caption(text: string): void;
  stage: { audio: { play(n: BondingSound): void } } | null;
  settings: { captions: boolean };
}

/** Pistas de técnica que se ocultan en Evaluación (las de seguridad siempre se muestran). */
const HIDE_IN_EVALUATION = new Set([
  'PREMATURE_OBSERVATION', 'SOLUBILITY_EXCEEDED', 'TUBE_CROSS_CONTAMINATED', 'IONIC_CARRYOVER', 'UNTARED_BALANCE', 'WRONG_SOLVENT', 'APOLAR_CARRYOVER',
  'DETECTOR_SINGLE_CONTACT', 'DETECTOR_ELECTRODE_SHORT', 'DETECTOR_DIFFERENT_SPECIMENS', 'DETECTOR_ELECTRODE_GAP', 'DETECTOR_INSTRUMENT_MISUSE', 'DETECTOR_UNSTABLE',
  'DETECTOR_OUT_OF_RANGE', 'OXIDIZED_CONTACT', 'WET_SALT_SURFACE', 'FAILED_CONTROL_CIRCUIT', 'DETECTOR_UNVERIFIED', 'PROBE_TOO_SHALLOW', 'PROBE_BOTTOM', 'PROBE_CONTAMINATION',
  'COLORED_CARRYOVER', 'KAPPA_UNSTABLE', 'OVER_RANGE', 'TEMP_UNCOMPENSATED', 'ALIQUOT_UNMIXED', 'FLASK_OVER_MARK', 'WRONG_STANDARD', 'INSTRUMENT_MISUSE', 'MIXING_SPILL',
  'IDENTITY_UNVERIFIED', 'PROBE_RESIDUE_FOUND', 'MASS_UNSTABLE',
]);

/** Avisos informativos que sí se muestran (lecturas registradas, acciones confirmadas). */
const SHOW_INFO = new Set([
  'PPE_OK', 'BALANCE_ON', 'MASS_READ', 'VOLUME_READ', 'OBSERVATION_SAVED', 'CURRENT_READ', 'KAPPA_READ', 'CONTROL_PASSED', 'METER_CALIBRATED', 'PROBE_RINSED', 'EMPTIED',
  'SPILL_CLEANED', 'BLOCK_CLEARED', 'INSPECT_DETECTOR', 'INSPECT_METER', 'INSPECT_BALANCE', 'INSPECTED_VESSEL', 'SOLID_ADDED', 'SCOOPED', 'POUR_DONE',
]);

/** Lecturas con valor que en Evaluación no se repiten en un aviso (el valor está en el instrumento). */
const VALUE_EVENTS = new Set(['MASS_READ', 'VOLUME_READ', 'CURRENT_READ', 'KAPPA_READ', 'INSPECTED_VESSEL']);

const SOUND: Partial<Record<string, BondingSound>> = { BENCH_SPILL: 'drip', CONTAINER_OVERFLOW: 'drip', ELECTRICS_SPILL: 'alert', CONTROL_PASSED: 'click', SOLID_ADDED: 'drip' };

export function p07EventFeedback(w: P07World, e: SimEvent, mode: P07Mode, sink: Sink): void {
  if (mode === 'EVALUATION' && HIDE_IN_EVALUATION.has(e.code)) return;
  if (e.severity === 'INFO' && !SHOW_INFO.has(e.code)) return;
  if (mode === 'EVALUATION' && VALUE_EVENTS.has(e.code)) return;
  const params: Record<string, unknown> = { ...(e.params ?? {}) };
  for (const k of ['obj', 'from', 'to'] as const) {
    if (typeof params[k] === 'string') params[k] = params[k] === 'bench' ? t('p7.where.bench') : p07NameOf(w, params[k] as string);
  }
  for (const [k, d] of [['g', 2], ['ml', 1], ['ma', 3], ['k', 2]] as const) if (typeof params[k] === 'number') params[k] = (params[k] as number).toFixed(d).replace('.', ',');
  if (typeof params.on === 'number') params.on = t(params.on ? 'p7.ev.lit' : 'p7.ev.unlit');
  if (typeof params.gloves === 'string') params.gloves = t(`p7.gloves.${params.gloves}`);
  const key = `p7.ev.${e.code}`;
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
export function p07LiveFeedback(w: P07World, mode: P07Mode, attemptId: string, sink: Sink): void {
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
  const m = w.meter;
  if (m.powered && m.vesselId && m.stable) once(`stable:${m.vesselId}`, 'info', 'p7.live.meterStable');
  const d = w.detector;
  if (d.powered && d.contactSince !== null && w.timeS - d.contactSince > w.params.detectorStabilityS) once(`contact:${d.a?.targetId}`, 'info', 'p7.live.contactStable');
  for (const v of Object.values(w.vessels)) {
    if (v.stir01 > 0 && w.timeS - v.lastAddS > w.params.mixObservationS) once(`mix:${v.id}:${Math.round(v.lastAddS)}`, 'info', 'p7.live.observeNow', { o: p07NameOf(w, v.id) });
  }
  if (w.vessels.btHeptane && w.vessels.btHeptane.capped === false && Object.keys(w.pours).length === 0) once('uncapped', 'warn', 'p7.live.capSolvent');
}
