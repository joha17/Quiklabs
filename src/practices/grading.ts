/**
 * Calificación verificable de un intento. Código puro que comparten el Worker (la nota la calcula el servidor) y el
 * navegador del docente (repetición del intento):
 *
 * - `gradeSnapshot` recalcula la evaluación con la rúbrica a partir del estado final del mundo y la libreta, y hace
 *   comprobaciones de plausibilidad contra un mundo reconstruido desde las opciones de creación (semilla, parámetros,
 *   incógnita, conservación de la materia). La nota que envía el cliente no se usa.
 * - `replayTape` reconstruye el mundo inicial y vuelve a aplicar, tic a tic, todos los comandos de la cinta. Si el
 *   estado final y la evaluación coinciden con lo entregado, el intento ocurrió en el simulador tal como se entregó.
 */
import type { Evaluation } from '../simulation/scoring/types';
import { RESUME, type AttemptSnapshot, type AttemptTape, type GradedLab } from './tape';
import { dispatchMut, stepMut } from '../simulation/world/world';
import { dispatchFlame, stepFlame } from '../simulation/flame-world/world';
import { dispatchReaction, globalTotals, stepReaction } from '../simulation/reaction-world/world';
import { dispatchStoich, elementTotals, stepStoich } from '../simulation/stoich-world/world';
import { dispatchCalor, stepCalor } from '../simulation/calorimetry-world/world';
import type { World } from '../simulation/entities/types';
import type { FlameWorld } from '../simulation/flame-world/types';
import type { P4World } from '../simulation/reaction-world/types';
import type { P5World } from '../simulation/stoich-world/types';
import type { P6World } from '../simulation/calorimetry-world/types';
import { CTX, newPracticeWorld, type PracticeOptions } from './practice-02';
import { stageEvidence } from './practice-02/evidence';
import { evaluate } from './practice-02/rubric';
import { sanitizeOnResume2 } from './practice-02/resume';
import type { NotebookState } from './practice-02/notebook';
import { CTX3, newPractice3World, type Practice3Options } from './practice-03';
import { p3StageEvidence } from './practice-03/evidence';
import { evaluateP3 } from './practice-03/rubric';
import { sanitizeOnResume3 } from './practice-03/resume';
import type { P3Notebook } from './practice-03/notebook';
import { contextFor, newPractice4World, type Practice4Options } from './practice-04';
import { p4StageEvidence } from './practice-04/evidence';
import { evaluateP4 } from './practice-04/rubric';
import { sanitizeOnResume4 } from './practice-04/resume';
import type { P4Notebook } from './practice-04/notebook';
import { CTX5, newPractice5World, type Practice5Options } from './practice-05';
import { p5StageEvidence } from './practice-05/evidence';
import { evaluateP5 } from './practice-05/rubric';
import { sanitizeOnResume5 } from './practice-05/resume';
import type { P5Notebook } from './practice-05/notebook';
import { newPractice6World, type Practice6Options } from './practice-06';
import { p6StageEvidence } from './practice-06/evidence';
import { evaluateP6 } from './practice-06/rubric';
import { sanitizeOnResume6 } from './practice-06/resume';
import type { P6Notebook } from './practice-06/notebook';

export { RESUME, type AttemptSnapshot, type AttemptTape, type GradedLab, type TapeEntry } from './tape';

export const GRADED_LABS: GradedLab[] = ['p2', 'p3', 'p4', 'p5', 'p6'];

interface WorldBase {
  tick: number;
  timeS: number;
  seed: number;
  params: { dtS: number };
  evidence: Record<string, number>;
  events: unknown[];
}

interface Adapter {
  create(options: unknown): WorldBase;
  dispatch(w: WorldBase, cmd: unknown): void;
  step(w: WorldBase): void;
  sanitize(w: WorldBase): void;
  /** Banderas de etapa que la aplicación fija periódicamente (algunas cuentan en la rúbrica). */
  latch(w: WorldBase, nb: unknown): void;
  evaluate(w: WorldBase, s: AttemptSnapshot): Evaluation;
  /** Lo que no puede cambiar durante el intento (semilla, parámetros, incógnita). */
  fixed(w: WorldBase): unknown;
  /** Cantidades que se conservan (átomos, carga); vacío si la práctica no las audita. */
  conserved(w: WorldBase): Record<string, number>;
  /** Modo declarado en las opciones de creación. */
  mode(options: unknown): string;
}

const opt = <T>(o: unknown) => o as T;

const ADAPTERS: Record<GradedLab, Adapter> = {
  p2: {
    create: (o) => newPracticeWorld(opt<PracticeOptions>(o)),
    dispatch: (w, c) => void dispatchMut(w as World, c as never, CTX),
    step: (w) => stepMut(w as World, CTX),
    sanitize: (w) => sanitizeOnResume2(w as World),
    latch: (w, nb) => void stageEvidence(w as World, nb as NotebookState),
    evaluate: (w, s) => evaluate(w as World, s.notebook as NotebookState, { ppeConfirmed: s.ppe, mode: s.mode }),
    fixed: (w) => ({ seed: w.seed, params: w.params, initialTotals: (w as World).initialTotals, reagentInitial: (w as World).reagentInitial }),
    conserved: () => ({}),
    mode: (o) => opt<PracticeOptions>(o).mode,
  },
  p3: {
    create: (o) => newPractice3World(opt<Practice3Options>(o)),
    dispatch: (w, c) => void dispatchFlame(w as FlameWorld, c as never, CTX3),
    step: (w) => stepFlame(w as FlameWorld, CTX3),
    sanitize: (w) => void sanitizeOnResume3(w as FlameWorld),
    latch: (w, nb) => void p3StageEvidence(w as FlameWorld, nb as P3Notebook),
    evaluate: (w, s) => evaluateP3(w as FlameWorld, s.notebook as P3Notebook, { ppeConfirmed: (w as FlameWorld).ppe }),
    fixed: (w) => ({ seed: w.seed, params: w.params, unknown: (w as FlameWorld).unknown }),
    conserved: () => ({}),
    mode: (o) => opt<Practice3Options>(o).mode,
  },
  p4: {
    create: (o) => newPractice4World(opt<Practice4Options>(o)),
    dispatch: (w, c) => void dispatchReaction(w as P4World, c as never, contextFor(w as P4World)),
    step: (w) => stepReaction(w as P4World, contextFor(w as P4World)),
    sanitize: (w) => void sanitizeOnResume4(w as P4World),
    latch: (w, nb) => void p4StageEvidence(w as P4World, nb as P4Notebook),
    evaluate: (w, s) => evaluateP4(w as P4World, s.notebook as P4Notebook, { ppeConfirmed: (w as P4World).ppe }),
    fixed: (w) => ({ seed: w.seed, params: w.params, scenarios: (w as P4World).scenarios }),
    conserved: (w) => globalTotals(w as P4World, contextFor(w as P4World)),
    mode: (o) => opt<Practice4Options>(o).mode,
  },
  p5: {
    create: (o) => newPractice5World(opt<Practice5Options>(o)),
    dispatch: (w, c) => void dispatchStoich(w as P5World, c as never, CTX5),
    step: (w) => stepStoich(w as P5World, CTX5),
    sanitize: (w) => void sanitizeOnResume5(w as P5World),
    latch: (w, nb) => void p5StageEvidence(w as P5World, nb as P5Notebook),
    evaluate: (w, s) => evaluateP5(w as P5World, s.notebook as P5Notebook),
    fixed: (w) => ({ seed: w.seed, params: w.params, scenarios: (w as P5World).scenarios, initialElements: (w as P5World).initialElements }),
    conserved: (w) => elementTotals(w as P5World),
    mode: (o) => opt<Practice5Options>(o).mode,
  },
  p6: {
    create: (o) => newPractice6World(opt<Practice6Options>(o)),
    dispatch: (w, c) => void dispatchCalor(w as P6World, c as never),
    step: (w) => stepCalor(w as P6World),
    sanitize: (w) => void sanitizeOnResume6(w as P6World),
    latch: (w, nb) => void p6StageEvidence(w as P6World, nb as P6Notebook),
    evaluate: (w, s) => evaluateP6(w as P6World, s.notebook as P6Notebook),
    fixed: (w) => ({ seed: w.seed, params: w.params, scenarios: (w as P6World).scenarios, initialWaterG: (w as P6World).initialWaterG, initialMetalG: (w as P6World).initialMetalG }),
    conserved: () => ({}),
    mode: (o) => opt<Practice6Options>(o).mode,
  },
};

export const isGradedLab = (x: unknown): x is GradedLab => GRADED_LABS.includes(x as GradedLab);

/** Problemas de plausibilidad que el servidor anota en la entrega (no la rechazan: los revisa el docente). */
export type GradeIssue =
  | 'SEED_MISMATCH'
  | 'FIXED_STATE_CHANGED'
  | 'CLOCK_INCONSISTENT'
  | 'NOT_CONSERVED'
  | 'MODE_MISMATCH'
  | 'CLIENT_SCORE_MISMATCH'
  | 'NO_TAPE';

export interface GradeResult {
  evaluation: Evaluation;
  issues: GradeIssue[];
  /** Tiempo simulado del intento (s), tomado del mundo. */
  durationS: number;
}

/** El intento empezó con la semilla del identificador (`pN-<semilla base 36>-<marca>`). */
export function seedFromAttemptId(attemptId: string): number | null {
  const m = /^p[2-6]-([0-9a-z]+)-/.exec(attemptId);
  return m ? parseInt(m[1], 36) : null;
}

/** Igualdad estructural con tolerancia numérica relativa (la serialización JSON puede cambiar −0 por 0). */
export function sameValue(a: unknown, b: unknown, rel = 1e-9): boolean {
  if (typeof a === 'number' && typeof b === 'number') return a === b || Math.abs(a - b) <= rel * Math.max(1, Math.abs(a), Math.abs(b));
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return a === b || (a == null && b == null);
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], rel));
}

/**
 * Calificación en el servidor: evaluación por rúbrica del estado entregado y comprobaciones de plausibilidad.
 * `options` son las opciones de creación del mundo (cabecera de la cinta); sin ellas solo se evalúa.
 */
export function gradeSnapshot(
  labId: GradedLab,
  snap: AttemptSnapshot,
  ctx: { attemptId: string; options: unknown | null; requiredMode?: string | null; clientScore?: number | null },
): GradeResult {
  const a = ADAPTERS[labId];
  const w = snap.world as WorldBase;
  if (!w || typeof w !== 'object' || typeof w.tick !== 'number' || !w.params || !w.evidence) throw new Error('INVALID_WORLD');
  if (!snap.notebook || typeof snap.notebook !== 'object') throw new Error('INVALID_NOTEBOOK');
  w.events ??= [];
  const issues: GradeIssue[] = [];
  const seed = seedFromAttemptId(ctx.attemptId);
  if (seed === null || seed !== w.seed) issues.push('SEED_MISMATCH');
  if (Math.abs(w.timeS - w.tick * w.params.dtS) > 1e-6 * Math.max(1, w.tick)) issues.push('CLOCK_INCONSISTENT');
  if (ctx.options == null) issues.push('NO_TAPE');
  else {
    const o = ctx.options as { seed?: number };
    if (o.seed !== w.seed) issues.push('SEED_MISMATCH');
    const initial = a.create(ctx.options);
    if (!sameValue(a.fixed(initial), a.fixed(w))) issues.push('FIXED_STATE_CHANGED');
    const c0 = a.conserved(initial);
    const c1 = a.conserved(w);
    for (const k of Object.keys(c0)) {
      if (Math.abs((c1[k] ?? 0) - c0[k]) > 1e-9 * Math.max(1, Math.abs(c0[k]))) {
        issues.push('NOT_CONSERVED');
        break;
      }
    }
    if (ctx.requiredMode === 'EVALUATION' && a.mode(ctx.options) !== 'EVALUATION') issues.push('MODE_MISMATCH');
  }
  let evaluation: Evaluation;
  try {
    evaluation = a.evaluate(w, snap);
  } catch {
    throw new Error('INVALID_NOTEBOOK');
  }
  if (!Number.isFinite(evaluation.total)) throw new Error('INVALID_WORLD');
  evaluation = { ...evaluation, total: Math.min(1, Math.max(0, evaluation.total)) };
  if (typeof ctx.clientScore === 'number' && Math.abs(ctx.clientScore - evaluation.total) > 0.005) issues.push('CLIENT_SCORE_MISMATCH');
  return { evaluation, issues: [...new Set(issues)], durationS: w.timeS };
}

export interface ReplayResult {
  /** `OK`: la repetición llega al mismo estado y la misma nota; `MISMATCH`: no coinciden; `FAILED`: no se pudo repetir. */
  status: 'OK' | 'MISMATCH' | 'FAILED';
  /** El estado del mundo repetido es idéntico al entregado (salvo banderas de etapa). */
  exactState: boolean;
  replayScore: number | null;
  /** Componentes de la rúbrica cuya nota difiere (repetición vs. entregado). */
  diffs: Array<{ key: string; replay: number; submitted: number }>;
  steps: number;
  error?: string;
}

/** Estado comparable: sin eventos ni banderas de etapa (dependen del ritmo de la interfaz, no de la física). */
function comparable(world: unknown) {
  const w = world as WorldBase;
  const evidence = Object.fromEntries(Object.entries(w.evidence ?? {}).filter(([k]) => !k.startsWith('stage:')));
  return { ...w, events: [], evidence };
}

/** Ritmo con el que la repetición fija las banderas de etapa (la aplicación lo hace cada segundo). */
const LATCH_EVERY_S = 1;

/**
 * Repite la cinta y compara con la entrega. `onProgress` permite al navegador ceder el hilo cada `yieldEvery` pasos
 * (la repetición de una sesión larga tarda unos segundos).
 */
export async function replayTape(
  tape: AttemptTape,
  snap: AttemptSnapshot,
  submitted: Evaluation,
  opts: { yieldEvery?: number; onProgress?: (done: number, total: number) => Promise<void> | void } = {},
): Promise<ReplayResult> {
  const fail = (error: string, steps = 0): ReplayResult => ({ status: 'FAILED', exactState: false, replayScore: null, diffs: [], steps, error });
  if (!isGradedLab(tape.labId) || tape.v !== 1) return fail('UNSUPPORTED_TAPE');
  const a = ADAPTERS[tape.labId];
  const target = snap.world as WorldBase;
  let w: WorldBase;
  try {
    w = a.create(tape.options);
  } catch {
    return fail('BAD_OPTIONS');
  }
  const total = target.tick;
  const latchEvery = Math.max(1, Math.round(LATCH_EVERY_S / w.params.dtS));
  const yieldEvery = opts.yieldEvery ?? 4000;
  let steps = 0;
  const advanceTo = async (tick: number) => {
    while (w.tick < tick) {
      a.step(w);
      steps++;
      if (w.tick % latchEvery === 0) a.latch(w, snap.notebook);
      if (steps % yieldEvery === 0) await opts.onProgress?.(w.tick, total);
      // Un mundo que no avanza el reloj no llegaría nunca al tic pedido.
      if (steps > total + 10) throw new Error('TICK_OVERRUN');
    }
  };
  try {
    for (const [tick, cmd] of tape.entries) {
      if (tick < w.tick) return fail('TAPE_OUT_OF_ORDER', steps);
      if (tick > total) return fail('TAPE_PAST_END', steps);
      await advanceTo(tick);
      if (cmd === RESUME) a.sanitize(w);
      else {
        a.dispatch(w, cmd);
        a.latch(w, snap.notebook);
      }
    }
    await advanceTo(total);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'REPLAY_ERROR', steps);
  }
  a.latch(w, snap.notebook);
  await opts.onProgress?.(total, total);
  const exactState = sameValue(comparable(w), comparable(target), 0);
  // Se evalúa la repetición con la libreta entregada; solo cambia el mundo.
  const ev = a.evaluate(w, { ...snap, world: w });
  const diffs = submitted.components
    .map((c) => ({ key: c.id, submitted: c.score, replay: ev.components.find((x) => x.id === c.id)?.score ?? 0 }))
    .filter((d) => Math.abs(d.replay - d.submitted) > 0.005);
  const scoreOk = Math.abs(ev.total - submitted.total) <= 0.005;
  return { status: scoreOk && diffs.length === 0 ? 'OK' : 'MISMATCH', exactState, replayScore: ev.total, diffs, steps };
}
