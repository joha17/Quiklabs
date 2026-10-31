/**
 * Retroalimentación de B09 (§9, §13.2): primero la consecuencia observable, luego la causa y la recuperación. En
 * Evaluación solo se muestran la seguridad y los hechos observables (sin pistas de técnica). Las alertas de seguridad
 * (separación baja, choque, vidrio roto, derrame) se muestran en todos los modos.
 */
import type { SimEvent } from '../../simulation/optical-world/types';
import type { PlantWorld as OpticalWorld } from '../../simulation/plant-world/types';
import type { B09Mode } from '../../practices/practice-b09/definition';
import { microscopeView } from '../../simulation/optical-world/world';
import { t } from '../i18n';
import type { OpticalSound } from '../../engine/optical/host';
import { b09NameOf } from './describe';

interface Sink {
  toast(level: 'info' | 'warn' | 'alert' | 'critical', text: string): void;
  caption(text: string): void;
  stage: { audio: { play(n: OpticalSound): void } } | null;
  settings: { captions: boolean };
}

/** Avisos de seguridad: siempre visibles. */
const SAFETY = new Set(['PPE_REQUIRED', 'OPTICAL_GAP_LOW', 'GAP_UNCHECKED', 'OBJECTIVE_COLLISION', 'COARSE_AT_40X', 'REMOVE_GAP_UNSAFE', 'COVER_CRACKED', 'COVER_BROKEN', 'LIQUID_SPILL', 'CUT_UNSAFE', 'ABRASIVE_LENS_CLEANING', 'LENS_CLEANING_INVALID', 'BLADE_ON_GLASS', 'BROKEN_GLASS_BY_HAND', 'SWAB_IN_TRASH', 'LUGOL_SPILLED']);

/** Avisos informativos que sí se muestran (acciones confirmadas). */
const SHOW_INFO = new Set(['PPE_OK', 'SPECIMEN_PLACED', 'SPECIMEN_CUT', 'DROP_ADDED', 'COVER_LOWERED', 'COVER_LIFTED', 'EDGE_WIPED', 'SLIDE_CLEANED', 'SHARDS_CLEANED', 'SPILL_CLEANED', 'OBJECTIVE_LOCKED', 'OBSERVATION_RECORDED', 'BENCH_CLOSED', 'BLOCK_CLEARED', 'POWER_ON', 'POWER_OFF', 'TISSUE_CUT', 'TISSUE_SCRAPED', 'SWAB_TAKEN', 'SMEAR_MADE', 'TISSUE_DISCARDED', 'ASSET_UNAVAILABLE']);

const SOUND: Partial<Record<string, OpticalSound>> = { COVER_BROKEN: 'alert', OBJECTIVE_COLLISION: 'alert', DROP_ADDED: 'drip', COVER_LOWERED: 'clink' };

export function b09EventFeedback(w: OpticalWorld, e: SimEvent, mode: B09Mode, sink: Sink): void {
  if (mode === 'EVALUATION' && !SAFETY.has(e.code) && e.severity !== 'INFO') return;
  if (e.severity === 'INFO' && !SHOW_INFO.has(e.code)) return;
  if (mode === 'EVALUATION' && e.code === 'OBSERVATION_RECORDED') return;
  const params: Record<string, unknown> = { ...(e.params ?? {}) };
  if (typeof params.obj === 'string') params.obj = b09NameOf(w, params.obj as string);
  if (typeof params.ml === 'number') params.ml = (params.ml as number).toFixed(3).replace('.', ',');
  if (typeof params.mm === 'number') params.mm = (params.mm as number).toFixed(2).replace('.', ',');
  if (typeof params.r === 'string') params.r = t(`b09.reagent.${params.r as string}`);
  if (typeof params.kind === 'string') params.kind = t(`b09.specimen.${params.kind as string}`);
  if (typeof params.part === 'string') params.part = t(`b09.part.${(params.part as string).replace(':', '_')}`);
  const key = `b09.ev.${e.code}`;
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
export function b09LiveFeedback(w: OpticalWorld, mode: B09Mode, attemptId: string, sink: Sink): void {
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
  for (const m of Object.values(w.mounts)) {
    const z = m.cell?.zones[0];
    if (!z || z.premade || m.coverId) continue;
    const liquid = m.waterMl + Object.values(m.cell!.stainMl).reduce((a, v) => a + (v ?? 0), 0);
    if (liquid < w.params.mount.needMl) once(`dry:${m.slideId}`, 'info', 'b09.live.addLiquid');
  }
  // Lugol bajo cubreobjetos: recordar que necesita tiempo de contacto antes de observar.
  for (const m of Object.values(w.mounts)) {
    const c = m.cell;
    if (!c || !m.coverId || !c.stainMl.lugol || c.zones[0]?.premade) continue;
    if ((c.contactS.lugol ?? 0) < (w.params.cellPrep?.lugolMinContactS ?? 20) && w.microscope.slideOnStage === m.slideId) once(`lugol:${m.slideId}`, 'info', 'b09.live.lugolWait');
  }
  if (Object.values(w.cell.toolResidue).some(Boolean)) once('residue', 'info', 'b09.live.cleanTool');
  if (w.microscope.slideOnStage && !w.microscope.clampedSlideId) once('clip', 'info', 'b09.live.closeClip');
  const v = microscopeView(w);
  if (w.view.instrument === 'compound' && v.slideId && v.objectiveX === 4 && v.sharpness01 < 0.2) once('focus4', 'info', 'b09.live.focusCoarse');
  if (w.view.instrument === 'compound' && v.objectiveX && v.objectiveX > 4 && v.sharpness01 < 0.6) once(`refocus${v.objectiveX}`, 'info', 'b09.live.refocusFine');
  if (w.slideCase.open && w.slideCase.openedAt !== null && w.timeS - w.slideCase.openedAt > 60) once('case', 'warn', 'b09.live.closeCase');
}
