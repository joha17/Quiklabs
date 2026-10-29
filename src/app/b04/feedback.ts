/**
 * Retroalimentación de B04 (§9, §12.2): primero la consecuencia observable, luego la causa y la recuperación. Los
 * eventos del microscopio son los de B02 (mismo equipo); los de preparaciones, trasvases, ensayos y enzimas tienen sus
 * textos `b04.ev.*`. En Evaluación solo se muestran la seguridad y los hechos observables; las alertas de seguridad
 * (calor, llama, metanol, derrame, salpicadura, rebose, choque, vidrio) se muestran en todos los modos.
 */
import type { SimEvent } from '../../simulation/optical-world/types';
import type { BioWorld } from '../../simulation/bio-world/types';
import type { B04Mode } from '../../practices/practice-b04/definition';
import { microscopeView } from '../../simulation/optical-world/world';
import { t } from '../i18n';
import type { OpticalSound } from '../../engine/optical/host';
import { b04NameOf } from './describe';

interface Sink {
  toast(level: 'info' | 'warn' | 'alert' | 'critical', text: string): void;
  caption(text: string): void;
  stage: { audio: { play(n: OpticalSound): void } } | null;
  settings: { captions: boolean };
}

/** Avisos de seguridad: siempre visibles. */
const SAFETY = new Set([
  'PPE_REQUIRED', 'OPTICAL_GAP_LOW', 'GAP_UNCHECKED', 'OBJECTIVE_COLLISION', 'COARSE_AT_40X', 'REMOVE_GAP_UNSAFE', 'COVER_CRACKED', 'COVER_BROKEN', 'LIQUID_SPILL',
  'ABRASIVE_LENS_CLEANING', 'LENS_CLEANING_INVALID', 'BROKEN_GLASS_BY_HAND', 'OVERFILL', 'SPILLED', 'DROP_SPILLED', 'HOT_HANDLING', 'CHEMICAL_SPLASH',
  'IGNITION_BLOCKED', 'METHANOL_BLOCKED', 'SPLASH', 'CATALASE_OVERFLOW', 'SUBSTRATE_OVERFLOW', 'BAR_SLIP', 'POWDER_SPILLED', 'WASTE_MISCLASSIFIED',
]);

/** Avisos informativos que sí se muestran (acciones confirmadas). */
const SHOW_INFO = new Set([
  'PPE_OK', 'SPECIMEN_PLACED', 'DROP_ADDED', 'COVER_LOWERED', 'COVER_LIFTED', 'EDGE_WIPED', 'SLIDE_CLEANED', 'SHARDS_CLEANED', 'SPILL_CLEANED', 'OBJECTIVE_LOCKED',
  'OBSERVATION_RECORDED', 'BENCH_CLOSED', 'BLOCK_CLEARED', 'POWER_ON', 'POWER_OFF', 'ASSET_UNAVAILABLE', 'TISSUE_CUT', 'TISSUE_ADDED', 'CATALASE_STARTED',
  'AMYLASE_CONTACT', 'SPILL_WIPED', 'RESOURCE_MISSING_FEULGEN_IMAGE', 'RESOURCE_UNCALIBRATED_KINETICS', 'RESOURCE_UNAVAILABLE_INSTRUMENT', 'RESOURCE_MISMATCHED_SCALE',
]);

const SOUND: Partial<Record<string, OpticalSound>> = { COVER_BROKEN: 'alert', OBJECTIVE_COLLISION: 'alert', COVER_LOWERED: 'clink', CATALASE_STARTED: 'fizz', CATALASE_OVERFLOW: 'alert' };

export function b04EventFeedback(w: BioWorld, e: SimEvent, mode: B04Mode, sink: Sink): void {
  if (mode === 'EVALUATION' && !SAFETY.has(e.code) && e.severity !== 'INFO') return;
  if (e.severity === 'INFO' && !SHOW_INFO.has(e.code)) return;
  if (mode === 'EVALUATION' && e.code === 'OBSERVATION_RECORDED') return;
  const params: Record<string, unknown> = { ...(e.params ?? {}) };
  if (typeof params.obj === 'string') params.obj = b04NameOf(w, params.obj as string);
  if (typeof params.ml === 'number') params.ml = (params.ml as number).toFixed(2).replace('.', ',');
  if (typeof params.mm === 'number') params.mm = (params.mm as number).toFixed(2).replace('.', ',');
  if (typeof params.r === 'string') params.r = b04NameOf(w, params.r as string);
  if (typeof params.q === 'string') params.q = t(`b04.look.${(params.q as string).replace(/:/g, '_')}`);
  if (typeof params.kind === 'string') params.kind = t(`b02.specimen.${params.kind as string}`);
  if (typeof params.part === 'string') params.part = t(`b02.part.${(params.part as string).replace(':', '_')}`);
  const own = `b04.ev.${e.code}`;
  const key = t(own) !== own ? own : `b02.ev.${e.code}`;
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

/** Observaciones en vivo (práctica y guiado), una vez por situación. Nunca dicen qué resultado esperar. */
export function b04LiveFeedback(w: BioWorld, mode: B04Mode, attemptId: string, sink: Sink): void {
  if (mode === 'EVALUATION') return;
  if (firedFor !== attemptId) {
    fired.clear();
    firedFor = attemptId;
  }
  const once = (k: string, level: 'info' | 'warn', key: string, p?: Record<string, unknown>) => {
    if (fired.has(k)) return;
    fired.add(k);
    sink.toast(level, t(key, p));
  };
  const B = w.bio;
  const bp = w.params.bio!;
  // Polvo en el beaker sin agitar: la suspensión sedimenta.
  for (const p of Object.values(B.preps)) {
    if (!p) continue;
    const onPlate = Object.values(B.plates).some((x) => x.vesselId === p.vesselId && x.rpm > 0);
    if (p.id !== 'P2' && !onPlate && w.timeS > 0 && B.vessels[p.vesselId].homog01 < 0.5) once(`settle:${p.id}`, 'info', 'b04.live.settle', { p: p.id });
    if (p.id === 'P1' && p.measuredTK === null && p.maxTK > 300) once('p1thermo', 'info', 'b04.live.measureLiquid');
  }
  if (Object.values(B.plates).some((x) => x.on && x.setK > 333 && x.vesselId && B.preps.P1?.vesselId === x.vesselId)) once('p1hot', 'warn', 'b04.live.setpointNotLiquid');
  // Benedict en el baño: esperar la dosis térmica; un tubo caliente se lee después de enfriar.
  if (Object.values(B.tubes).some((x) => x.reagents.benedict !== undefined && x.bath && x.hotDoseS < bp.benedictMinS)) once('benWait', 'info', 'b04.live.benedictWait');
  if (Object.values(B.tubes).some((x) => x.reagents.cu !== undefined && x.reagents.benedict === undefined && x.readAt === null && w.timeS - x.reagents.cu! < bp.assay.biuretDelayS)) once('biuretWait', 'info', 'b04.live.biuretWait', { s: bp.assay.biuretDelayS });
  if (B.vessels.pi.volumeMl > bp.pipetteFilmMl + 1e-6 && B.pipettes.pi.from) once(`pi:${B.pipettes.pi.from}`, 'info', 'b04.live.pipetteLoaded');
  if (Object.values(B.tubes).some((x) => x.contactAt !== null && x.reagents.amylase !== undefined && x.timerAt === null)) once('amyTimer', 'info', 'b04.live.timer');
  if (Object.values(B.baths).some((x) => x.on && x.readyAt === null)) once('bathHeat', 'info', 'b04.live.bathHeating');
  if (w.microscope.slideOnStage && !w.microscope.clampedSlideId) once('clip', 'info', 'b02.live.closeClip');
  const v = microscopeView(w);
  if (w.view.instrument === 'compound' && v.slideId && v.objectiveX === 4 && v.sharpness01 < 0.2) once('focus4', 'info', 'b02.live.focusCoarse');
  if (w.view.instrument === 'compound' && v.objectiveX && v.objectiveX > 4 && v.sharpness01 < 0.6) once(`refocus${v.objectiveX}`, 'info', 'b02.live.refocusFine');
}
