/**
 * Retroalimentación de B07 (§9, §13.2): primero la consecuencia observable, luego la causa y la recuperación. En
 * Evaluación solo se muestran la seguridad y los hechos observables (sin pistas de técnica). Las alertas de seguridad
 * (separación baja, choque, vidrio roto, derrame) se muestran en todos los modos.
 */
import type { SimEvent } from '../../simulation/optical-world/types';
import type { MicroWorld as OpticalWorld } from '../../simulation/micro-world/types';
import type { B07Mode } from '../../practices/practice-b07/definition';
import { microscopeView } from '../../simulation/optical-world/world';
import { t } from '../i18n';
import type { OpticalSound } from '../../engine/optical/host';
import { b07NameOf } from './describe';

interface Sink {
  toast(level: 'info' | 'warn' | 'alert' | 'critical', text: string): void;
  caption(text: string): void;
  stage: { audio: { play(n: OpticalSound): void } } | null;
  settings: { captions: boolean };
}

/** Avisos de seguridad: siempre visibles. */
const SAFETY = new Set(['PPE_REQUIRED', 'OPTICAL_GAP_LOW', 'GAP_UNCHECKED', 'OBJECTIVE_COLLISION', 'COARSE_AT_40X', 'REMOVE_GAP_UNSAFE', 'COVER_CRACKED', 'COVER_BROKEN', 'LIQUID_SPILL', 'CUT_UNSAFE', 'ABRASIVE_LENS_CLEANING', 'LENS_CLEANING_INVALID', 'BLADE_ON_GLASS', 'BROKEN_GLASS_BY_HAND', 'RESTRICTED_PLATE', 'FLAME_FORBIDDEN', 'SHARPS_WRONG_WASTE']);

/** Avisos informativos que sí se muestran (acciones confirmadas). */
const SHOW_INFO = new Set(['PPE_OK', 'SPECIMEN_PLACED', 'SPECIMEN_CUT', 'DROP_ADDED', 'COVER_LOWERED', 'COVER_LIFTED', 'EDGE_WIPED', 'SLIDE_CLEANED', 'SHARDS_CLEANED', 'SPILL_CLEANED', 'OBJECTIVE_LOCKED', 'OBSERVATION_RECORDED', 'BENCH_CLOSED', 'BLOCK_CLEARED', 'POWER_ON', 'POWER_OFF', 'TISSUE_CUT', 'TISSUE_SCRAPED', 'SWAB_TAKEN', 'SMEAR_MADE', 'STAIN_PHASE', 'PLATE_SELECTED', 'COLONY_RECORDED', 'STREAK_RECORDED', 'ASSET_UNAVAILABLE']);

const SOUND: Partial<Record<string, OpticalSound>> = { COVER_BROKEN: 'alert', OBJECTIVE_COLLISION: 'alert', DROP_ADDED: 'drip', COVER_LOWERED: 'clink' };

export function b07EventFeedback(w: OpticalWorld, e: SimEvent, mode: B07Mode, sink: Sink): void {
  if (mode === 'EVALUATION' && !SAFETY.has(e.code) && e.severity !== 'INFO') return;
  if (e.severity === 'INFO' && !SHOW_INFO.has(e.code)) return;
  if (mode === 'EVALUATION' && e.code === 'OBSERVATION_RECORDED') return;
  const params: Record<string, unknown> = { ...(e.params ?? {}) };
  if (typeof params.obj === 'string') params.obj = b07NameOf(w, params.obj as string);
  if (typeof params.ml === 'number') params.ml = (params.ml as number).toFixed(3).replace('.', ',');
  if (typeof params.mm === 'number') params.mm = (params.mm as number).toFixed(2).replace('.', ',');
  if (typeof params.r === 'string') params.r = t(`b07.reagent.${params.r as string}`);
  if (typeof params.phase === 'string') params.phase = t(`b07.phase.${params.phase as string}`);
  if (typeof params.part === 'string') params.part = t(`b07.part.${(params.part as string).replace(':', '_')}`);
  const key = `b07.ev.${e.code}`;
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

/** Observaciones en vivo (práctica y guiado), una vez por situación. Nunca dicen qué estructura hay. */
export function b07LiveFeedback(w: OpticalWorld, mode: B07Mode, attemptId: string, sink: Sink): void {
  if (mode === 'EVALUATION') return;
  if (firedFor !== attemptId) {
    fired.clear();
    firedFor = attemptId;
  }
  const once = (k: string, level: 'info' | 'warn', key: string) => {
    if (fired.has(k)) return;
    fired.add(k);
    sink.toast(level, t(key));
  };
  if (w.microscope.slideOnStage && !w.microscope.clampedSlideId) once('clip', 'info', 'b07.live.closeClip');
  const v = microscopeView(w);
  if (w.view.instrument === 'compound' && v.slideId && v.objectiveX === 4 && v.sharpness01 < 0.2) once('focus4', 'info', 'b07.live.focusCoarse');
  if (w.view.instrument === 'compound' && v.objectiveX && v.objectiveX > 4 && v.sharpness01 < 0.6) once(`refocus${v.objectiveX}`, 'info', 'b07.live.refocusFine');
  if (w.slideCase.open && w.slideCase.openedAt !== null && w.timeS - w.slideCase.openedAt > 60) once('case', 'warn', 'b07.live.closeCase');
}
