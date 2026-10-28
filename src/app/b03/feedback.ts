/**
 * Retroalimentación de B03 (§9, §13.2): primero la consecuencia observable, luego la causa y la recuperación. Los
 * eventos del microscopio y del montaje son los de B02 (mismo equipo); los de membranas, cámaras, trasvases y ensayos
 * tienen sus textos `b03.ev.*`. En Evaluación solo se muestran la seguridad y los hechos observables; las alertas de
 * seguridad (fuga, derrame, membrana rota, choque, vidrio) se muestran en todos los modos.
 */
import type { SimEvent } from '../../simulation/optical-world/types';
import type { PermWorld } from '../../simulation/perm-world/types';
import type { B03Mode } from '../../practices/practice-b03/definition';
import { microscopeView } from '../../simulation/optical-world/world';
import { t } from '../i18n';
import type { OpticalSound } from '../../engine/optical/host';
import { b03NameOf } from './describe';

interface Sink {
  toast(level: 'info' | 'warn' | 'alert' | 'critical', text: string): void;
  caption(text: string): void;
  stage: { audio: { play(n: OpticalSound): void } } | null;
  settings: { captions: boolean };
}

/** Avisos de seguridad: siempre visibles. */
const SAFETY = new Set([
  'PPE_REQUIRED', 'OPTICAL_GAP_LOW', 'GAP_UNCHECKED', 'OBJECTIVE_COLLISION', 'COARSE_AT_40X', 'REMOVE_GAP_UNSAFE', 'COVER_CRACKED', 'COVER_BROKEN', 'LIQUID_SPILL',
  'ABRASIVE_LENS_CLEANING', 'LENS_CLEANING_INVALID', 'BROKEN_GLASS_BY_HAND', 'LEAK', 'OVERFILL', 'CROSS_SPLASH', 'MEMBRANE_TORN', 'DROP_SPILLED',
]);

/** Avisos informativos que sí se muestran (acciones confirmadas). */
const SHOW_INFO = new Set([
  'PPE_OK', 'SPECIMEN_PLACED', 'DROP_ADDED', 'COVER_LOWERED', 'COVER_LIFTED', 'EDGE_WIPED', 'SLIDE_CLEANED', 'SHARDS_CLEANED', 'SPILL_CLEANED', 'OBJECTIVE_LOCKED',
  'OBSERVATION_RECORDED', 'BENCH_CLOSED', 'BLOCK_CLEARED', 'POWER_ON', 'POWER_OFF', 'ASSET_UNAVAILABLE', 'MEMBRANE_INSERTED', 'LEAK_TEST_OK', 'ASPIRATED', 'DISPENSED',
  'ASSAY_DROP', 'TRACER_IMPERMEABLE',
]);

const SOUND: Partial<Record<string, OpticalSound>> = { COVER_BROKEN: 'alert', OBJECTIVE_COLLISION: 'alert', DROP_ADDED: 'drip', COVER_LOWERED: 'clink', ASSAY_DROP: 'drip', LEAK: 'alert' };

export function b03EventFeedback(w: PermWorld, e: SimEvent, mode: B03Mode, sink: Sink): void {
  if (mode === 'EVALUATION' && !SAFETY.has(e.code) && e.severity !== 'INFO') return;
  if (e.severity === 'INFO' && !SHOW_INFO.has(e.code)) return;
  if (mode === 'EVALUATION' && e.code === 'OBSERVATION_RECORDED') return;
  const params: Record<string, unknown> = { ...(e.params ?? {}) };
  if (typeof params.obj === 'string') params.obj = b03NameOf(w, params.obj as string);
  if (typeof params.ml === 'number') params.ml = (params.ml as number).toFixed(2).replace('.', ',');
  if (typeof params.mm === 'number') params.mm = (params.mm as number).toFixed(2).replace('.', ',');
  if (typeof params.r === 'string') params.r = t(`b02.reagent.${params.r as string}`);
  if (typeof params.kind === 'string') params.kind = t(`b02.specimen.${params.kind as string}`);
  if (typeof params.part === 'string') params.part = t(`b02.part.${(params.part as string).replace(':', '_')}`);
  const own = `b03.ev.${e.code}`;
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
export function b03LiveFeedback(w: PermWorld, mode: B03Mode, attemptId: string, sink: Sink): void {
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
  const P = w.perm;
  const pp = w.params.perm!;
  for (const [id, c] of Object.entries(P.cells)) {
    // Membrana instalada sin apretar: recordar la pinza antes de cargar.
    if (c.membraneId && c.clampTurns < pp.sealTurns && c.sides.A.volumeMl + c.sides.B.volumeMl < 0.5) once(`clamp:${id}`, 'info', 'b03.live.clamp', { c: b03NameOf(w, id) });
    if (!c.lidClosed && c.loadedAt !== null && id === 'c3') once('lid:c3', 'info', 'b03.live.lid');
  }
  // Agua en la cámara 1 sin lectura de control: la prueba de fugas compara dos lecturas separadas por un tiempo.
  const c1 = P.cells.c1;
  if (c1.membraneId && c1.sides.A.volumeMl > 5 && c1.sides.B.volumeMl > 5 && !P.leakTestPassed.includes('c1') && !w.evidence['read:scale:c1:A'] && !w.evidence['read:scale:c1:B']) once('leak', 'info', 'b03.live.leakTest');
  if (c1.tracerAt !== null && !P.colorimeterZeroed && !w.evidence['read:colorimeter']) once('zero', 'info', 'b03.live.zero');
  if (P.vessels.pi.volumeMl > pp.pipetteFilmMl + 1e-6 && P.pipette.from) once(`pi:${P.pipette.from}`, 'info', 'b03.live.pipetteLoaded');
  if (Object.values(P.tubes).some((x) => x.reagentAt !== null && x.readAt === null && w.timeS - x.reagentAt < pp.assay.biuretDelayS)) once('biuretWait', 'info', 'b03.live.biuretWait', { s: pp.assay.biuretDelayS });
  // Hoja de Elodea fuera del agua: se seca.
  if (P.leafOutSince !== null && w.timeS - P.leafOutSince > pp.elodea.leafOutMaxS * 0.5) once(`leaf:${P.leafOutSince}`, 'warn', 'b03.live.leafOut');
  if (w.microscope.slideOnStage && !w.microscope.clampedSlideId) once('clip', 'info', 'b02.live.closeClip');
  const v = microscopeView(w);
  if (w.view.instrument === 'compound' && v.slideId && v.objectiveX === 4 && v.sharpness01 < 0.2) once('focus4', 'info', 'b02.live.focusCoarse');
  if (w.view.instrument === 'compound' && v.objectiveX && v.objectiveX > 4 && v.sharpness01 < 0.6) once(`refocus${v.objectiveX}`, 'info', 'b02.live.refocusFine');
}
