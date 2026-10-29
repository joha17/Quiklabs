/**
 * Retroalimentación de B05 (§9, §13.2): primero la consecuencia observable, luego la causa y la recuperación. Los
 * eventos del microscopio y del montaje son los de B02 (mismo equipo); los de preparaciones, catalasa, amilasa, baños
 * y ADH tienen sus textos `b05.ev.*`. En Evaluación solo se muestran la seguridad y los hechos observables; las
 * alertas de seguridad (llama, metanol, tubo caliente, sobrepresión, cáustico, residuos) se muestran en todos los modos.
 */
import type { SimEvent } from '../../simulation/optical-world/types';
import type { EnzWorld } from '../../simulation/enz-world/types';
import type { B05Mode } from '../../practices/practice-b05/definition';
import { microscopeView } from '../../simulation/optical-world/world';
import { bathStable } from '../../simulation/enz-world/world';
import { t } from '../i18n';
import type { OpticalSound } from '../../engine/optical/host';
import { b05NameOf } from './describe';

interface Sink {
  toast(level: 'info' | 'warn' | 'alert' | 'critical', text: string): void;
  caption(text: string): void;
  stage: { audio: { play(n: OpticalSound): void } } | null;
  settings: { captions: boolean };
}

/** Avisos de seguridad: siempre visibles. */
const SAFETY = new Set([
  'PPE_REQUIRED', 'OPTICAL_GAP_LOW', 'GAP_UNCHECKED', 'OBJECTIVE_COLLISION', 'COARSE_AT_40X', 'REMOVE_GAP_UNSAFE', 'COVER_CRACKED', 'COVER_BROKEN', 'LIQUID_SPILL',
  'BROKEN_GLASS_BY_HAND', 'IGNITION_RISK', 'RESTRICTED_METHANOL', 'HOT_WITHOUT_TONGS', 'STOPPER_PRESSURE', 'STOPCOCK_PRESSURE', 'CAUSTIC_DIRECT', 'WASTE_INCOMPATIBLE',
  'SHAKE_OVERFILLED', 'OVERFILL', 'POURED_OUTSIDE', 'EXTRACT_SPILLED', 'POWDER_SPILLED', 'HEAT_LEFT_ON',
]);

/** Avisos informativos que sí se muestran (acciones confirmadas). */
const SHOW_INFO = new Set([
  'PPE_OK', 'SPECIMEN_PLACED', 'DROP_ADDED', 'COVER_LOWERED', 'COVER_LIFTED', 'EDGE_WIPED', 'SLIDE_CLEANED', 'SHARDS_CLEANED', 'SPILL_CLEANED', 'OBJECTIVE_LOCKED',
  'OBSERVATION_RECORDED', 'BENCH_CLOSED', 'BLOCK_CLEARED', 'POWER_ON', 'POWER_OFF', 'ASSET_UNAVAILABLE', 'ASPIRATED', 'DISPENSED', 'RESOURCE_INCIDENT',
]);

const SOUND: Partial<Record<string, OpticalSound>> = {
  COVER_BROKEN: 'alert', OBJECTIVE_COLLISION: 'alert', DROP_ADDED: 'drip', COVER_LOWERED: 'clink', STOPPER_PRESSURE: 'alert', STOPCOCK_PRESSURE: 'alert', HOT_WITHOUT_TONGS: 'alert',
};

export function b05EventFeedback(w: EnzWorld, e: SimEvent, mode: B05Mode, sink: Sink): void {
  if (mode === 'EVALUATION' && !SAFETY.has(e.code) && e.severity !== 'INFO') return;
  if (e.severity === 'INFO' && !SHOW_INFO.has(e.code)) return;
  if (mode === 'EVALUATION' && e.code === 'OBSERVATION_RECORDED') return;
  const params: Record<string, unknown> = { ...(e.params ?? {}) };
  if (typeof params.obj === 'string') params.obj = b05NameOf(w, params.obj as string);
  if (typeof params.ml === 'number') params.ml = (params.ml as number).toFixed(2).replace('.', ',');
  if (typeof params.r === 'string') params.r = t(`b02.reagent.${params.r as string}`);
  if (typeof params.kind === 'string') params.kind = t(`b02.specimen.${params.kind as string}`);
  if (typeof params.part === 'string') params.part = t(`b02.part.${(params.part as string).replace(':', '_')}`);
  const own = `b05.ev.${e.code}`;
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
export function b05LiveFeedback(w: EnzWorld, mode: B05Mode, attemptId: string, sink: Sink): void {
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
  const E = w.enz;
  const p = w.params.enz!;
  // Lote con sólido en una placa sin pastilla o sin agitación: recordar homogeneizar.
  for (const b of Object.values(E.batches)) {
    if (!b) continue;
    const v = E.vessels[b.vesselId];
    if (v.volumeMl > 1 && b.solidG + b.liverG > 0 && !Object.values(E.bars).includes(b.vesselId)) once(`bar:${b.id}`, 'info', 'b05.live.stirBar', { b: b.id });
    if (b.id === 'P1' && b.stirredS > p.prep.minStirS && b.measuredTK === null) once('p1temp', 'info', 'b05.live.measureTemp');
    if (b.id === 'P2' && b.heatedS > 0) once('p2heat', 'warn', 'b05.live.noHeatLiver');
  }
  // Tubo en el baño de incubación antes de que el baño esté estable.
  for (const [id, tube] of Object.entries(E.tubes)) {
    if (tube.bath && !bathStable(w, tube.bath.id) && E.baths[tube.bath.id].on) once(`bath:${tube.bath.id}`, 'info', 'b05.live.bathWait', { b: b05NameOf(w, tube.bath.id) });
    if (tube.reactionAt !== null && (tube.catAtStart ?? 0) > 0 && !w.evidence[`read:collector:gc:${id}`] && w.timeS - tube.reactionAt > 20) once(`gas:${id}`, 'info', 'b05.live.readGas');
    if (tube.contactAt !== null && tube.aliquotOf === null && w.timeS - tube.contactAt > 20 && !Object.values(E.tubes).some((x) => x.aliquotOf === id)) once(`aliq:${id}`, 'info', 'b05.live.aliquot');
  }
  if (Object.values(E.baths).some((b) => b.on) && !E.collector.tubeId && Object.values(E.tubes).every((x) => x.reactionAt === null)) once('collector', 'info', 'b05.live.collectorFirst');
  if (w.microscope.slideOnStage && !w.microscope.clampedSlideId) once('clip', 'info', 'b02.live.closeClip');
  const v = microscopeView(w);
  if (w.view.instrument === 'compound' && v.slideId && v.objectiveX === 4 && v.sharpness01 < 0.2) once('focus4', 'info', 'b02.live.focusCoarse');
  if (w.view.instrument === 'compound' && v.objectiveX && v.objectiveX > 4 && v.sharpness01 < 0.6) once(`refocus${v.objectiveX}`, 'info', 'b02.live.refocusFine');
}
