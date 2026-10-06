/**
 * Estado compartido de la Práctica 4 (Zustand): mismo patrón que las prácticas 2 y 3 — el mundo es mutable dentro
 * de ReactionRuntime y React se re-renderiza con un contador `version` (≤ 5 Hz).
 */
import { create } from 'zustand';
import { createActor, type Actor } from 'xstate';
import type { SimEvent } from '../../simulation/reaction-world/types';
import type { P4Command, P4DispatchResult } from '../../simulation/reaction-world/commands';
import { newSeed } from '../../simulation/core/rng';
import { newPractice4World, type Practice4Options } from '../../practices/practice-04';
import { sanitizeOnResume4 } from '../../practices/practice-04/resume';
import type { P4Mode } from '../../practices/practice-04/definition';
import type { P4Scenario } from '../../practices/practice-04/error-scenarios';
import { emptyP4Notebook, type P4Notebook } from '../../practices/practice-04/notebook';
import { practice4Machine, p4StageName } from '../../practices/practice-04/workflow.machine';
import { p4StageEvidence } from '../../practices/practice-04/evidence';
import { evaluateP4 } from '../../practices/practice-04/rubric';
import type { Evaluation } from '../../simulation/scoring/types';
import type { ReactionLab3D } from '../../engine/reaction/ReactionLab3D';
import type { QualitySetting } from '../../engine/quality';
import { ReactionRuntime } from './runtime';
import { clearP4Attempt, loadP4Attempt, saveP4Attempt, type SavedP4Attempt } from './persistence';
import { p4EventFeedback } from './feedback';
import { reportSubmission } from '../platform/report';
import { TapeRecorder } from '../platform/tape';

export interface P4Settings {
  mode: P4Mode;
  seed: number;
  scenarios: P4Scenario[];
  timeScale: number;
  uiScale: number;
  reducedMotion: boolean;
  captions: boolean;
  volume: number;
  showNames: boolean;
  quality: QualitySetting;
  /** Apoyo de visión cromática (§26): descripción del color y la turbidez después de registrar. */
  colorAid: boolean;
  /** Opciones docentes (§2, §10.4, §12.5). */
  aluminum: boolean;
  excessBaseDemo: boolean;
  feComparison: boolean;
  naohSingle: number | null;
  allowNeutralDrain: boolean;
  mgNitride: boolean;
}

export interface P4Toast {
  id: number;
  level: 'info' | 'warn' | 'alert' | 'critical';
  text: string;
  at: number;
}

export interface P4DemoUi {
  index: number;
  total: number;
  key: string;
  part: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  note: string | null;
  done: boolean;
  speed: number;
}

const P4_DEMO_SEED = 20261005;

export type P4Modal = null | { kind: 'ppe' } | { kind: 'submit' } | { kind: 'settings' } | { kind: 'help' } | { kind: 'restored' } | { kind: 'mgWarning' };

interface P4State {
  screen: 'intro' | 'lab' | 'review';
  settings: P4Settings;
  runtime: ReactionRuntime | null;
  stage: ReactionLab3D | null;
  attemptId: string;
  notebook: P4Notebook;
  ppeConfirmed: boolean;
  selected: string | null;
  held: string | null;
  toasts: P4Toast[];
  captions: P4Toast[];
  version: number;
  workflowStage: string;
  modal: P4Modal;
  paused: boolean;
  evaluation: Evaluation | null;
  submitted: boolean;
  notebookOpen: boolean;
  inventoryOpen: boolean;
  savedAt: number | null;
  notebookTab: string | null;
  demo: P4DemoUi | null;
  startDemo(): void;
  setDemo(p: Partial<P4DemoUi>): void;

  setSettings(p: Partial<P4Settings>): void;
  start(opts?: { sameSeed?: boolean }): void;
  resume(saved: SavedP4Attempt): void;
  confirmPpe(): void;
  dispatch(cmd: P4Command): P4DispatchResult;
  select(id: string | null): void;
  setHeld(id: string | null): void;
  toast(level: P4Toast['level'], text: string): void;
  caption(text: string): void;
  dismissToast(id: number): void;
  setNotebook(fn: (nb: P4Notebook) => void, field?: string, from?: string, to?: string): void;
  setModal(m: P4Modal): void;
  setStage(s: ReactionLab3D | null): void;
  bump(): void;
  setPaused(p: boolean): void;
  submit(): void;
  backToIntro(): void;
  save(): void;
  toggleNotebook(): void;
  toggleInventory(): void;
}

let actor: Actor<typeof practice4Machine> | null = null;
let toastSeq = 1;
let unsubEvents: (() => void) | null = null;

const DEFAULT_SETTINGS: P4Settings = {
  mode: 'PRACTICE',
  seed: newSeed(),
  scenarios: [],
  timeScale: 2,
  uiScale: 1,
  reducedMotion: typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  captions: true,
  volume: 0.4,
  showNames: true,
  quality: 'AUTO',
  colorAid: false,
  aluminum: false,
  excessBaseDemo: false,
  feComparison: false,
  naohSingle: null,
  allowNeutralDrain: false,
  mgNitride: false,
};

const attemptIdFor = (seed: number) => `p4-${seed.toString(36)}-${Date.now().toString(36)}`;

/** Opciones de creación del mundo (también van en la cinta del intento). */
function optionsFor(s: P4Settings, seed: number, mode: P4Mode): Practice4Options {
  return {
    mode,
    seed,
    scenarios: s.scenarios,
    params: {
      aluminumEnabled: s.aluminum,
      excessBaseDemo: s.excessBaseDemo,
      feComparison: s.feComparison,
      naohSingle: s.naohSingle,
      waste: { allowNeutralDrain: s.allowNeutralDrain },
      mgNitrideFrac: s.mgNitride ? 0.03 : 0,
    },
  };
}

function worldFor(s: P4Settings, seed: number, mode: P4Mode) {
  return newPractice4World(optionsFor(s, seed, mode));
}

export const useP4 = create<P4State>()((set, get) => ({
  screen: 'intro',
  settings: DEFAULT_SETTINGS,
  runtime: null,
  stage: null,
  attemptId: '',
  notebook: emptyP4Notebook(),
  ppeConfirmed: false,
  selected: null,
  held: null,
  toasts: [],
  captions: [],
  version: 0,
  workflowStage: 'INTRO',
  modal: null,
  paused: false,
  evaluation: null,
  submitted: false,
  notebookOpen: false,
  inventoryOpen: false,
  savedAt: null,
  notebookTab: null,
  demo: null,

  setSettings(p) {
    set({ settings: { ...get().settings, ...p } });
    const rt = get().runtime;
    if (rt && p.timeScale !== undefined) rt.timeScale = p.timeScale;
    if (p.volume !== undefined) get().stage?.audio.setVolume(p.volume);
  },

  start(opts) {
    const s = get().settings;
    const seed = opts?.sameSeed ? s.seed : s.seed || newSeed();
    const id = attemptIdFor(seed);
    const worldOpts = optionsFor(s, seed, s.mode);
    const tape = TapeRecorder.start('p4', id, worldOpts);
    const rt = new ReactionRuntime(newPractice4World(worldOpts), id);
    rt.tape = tape;
    rt.timeScale = s.timeScale;
    bindRuntime(rt);
    actor?.stop();
    actor = createActor(practice4Machine);
    bindActor();
    actor.start();
    actor.send({ type: 'START' });
    set({
      screen: 'lab', settings: { ...s, seed }, runtime: rt, attemptId: id, notebook: emptyP4Notebook(), ppeConfirmed: false, selected: null, held: null,
      toasts: [], captions: [], evaluation: null, submitted: false, modal: { kind: 'ppe' }, paused: true, demo: null, notebookTab: null,
    });
    rt.paused = true;
  },

  startDemo() {
    const s = get().settings;
    const world = worldFor({ ...DEFAULT_SETTINGS, scenarios: [] }, P4_DEMO_SEED, 'PRACTICE');
    const rt = new ReactionRuntime(world, 'demo');
    rt.timeScale = 1;
    bindRuntime(rt);
    actor?.stop();
    actor = createActor(practice4Machine);
    bindActor();
    actor.start();
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    rt.dispatch({ type: 'confirmPpe' });
    set({
      screen: 'lab', settings: { ...s, mode: 'PRACTICE' }, runtime: rt, attemptId: 'demo', notebook: emptyP4Notebook(), ppeConfirmed: true,
      selected: null, held: null, toasts: [], captions: [], evaluation: null, submitted: false, modal: null, paused: false,
      notebookOpen: false, inventoryOpen: false, notebookTab: null,
      demo: { index: -1, total: 0, key: '', part: 'A', note: null, done: false, speed: 1 },
    });
  },

  setDemo(p) {
    const d = get().demo;
    if (d) set({ demo: { ...d, ...p } });
  },

  resume(saved) {
    const w = saved.world;
    // §27 — al restaurar: mechero apagado y gas cerrado, sin chispa, vertidos detenidos, nada en la mano.
    const { wasLit } = sanitizeOnResume4(w);
    const rt = new ReactionRuntime(w, saved.attemptId, saved.actions);
    rt.tape = TapeRecorder.resume('p4', saved.attemptId, w.tick, saved);
    rt.timeScale = saved.settings.timeScale;
    rt.paused = true;
    bindRuntime(rt);
    actor?.stop();
    try {
      actor = createActor(practice4Machine, saved.workflow ? { snapshot: saved.workflow as never } : undefined);
    } catch {
      actor = createActor(practice4Machine);
    }
    bindActor();
    actor.start();
    set({
      screen: saved.submitted ? 'review' : 'lab', settings: saved.settings, runtime: rt, attemptId: saved.attemptId, notebook: saved.notebook,
      ppeConfirmed: saved.ppe, toasts: [], captions: [], paused: true, submitted: saved.submitted,
      modal: saved.submitted ? null : saved.ppe ? (wasLit ? { kind: 'restored' } : null) : { kind: 'ppe' },
      evaluation: saved.submitted ? evaluateP4(w, saved.notebook, { ppeConfirmed: saved.ppe }) : null,
    });
    if (wasLit && !saved.submitted) get().toast('warn', 'Se restauró el intento en un estado seguro: se cerró el gas y se apagó el mechero.');
  },

  confirmPpe() {
    actor?.send({ type: 'PPE_CONFIRMED' });
    const rt = get().runtime;
    if (rt) {
      rt.dispatch({ type: 'confirmPpe' });
      rt.paused = false;
    }
    set({ ppeConfirmed: true, modal: null, paused: false });
    get().save();
  },

  dispatch(cmd) {
    const rt = get().runtime;
    if (!rt) return { ok: false };
    const r = rt.dispatch(cmd);
    set({ version: get().version + 1 });
    return r;
  },

  select(id) {
    if (get().selected !== id) set({ selected: id });
  },
  setHeld(id) {
    set({ held: id });
  },

  toast(level, text) {
    const id = toastSeq++;
    const toasts = [...get().toasts.filter((x) => x.text !== text), { id, level, text, at: Date.now() }].slice(-5);
    set({ toasts });
    const ttl = level === 'critical' ? 12000 : level === 'alert' ? 8000 : 5000;
    setTimeout(() => get().dismissToast(id), ttl);
  },
  caption(text) {
    if (!get().settings.captions) return;
    const id = toastSeq++;
    set({ captions: [...get().captions, { id, level: 'info' as const, text, at: Date.now() }].slice(-3) });
    setTimeout(() => set({ captions: get().captions.filter((c) => c.id !== id) }), 2500);
  },
  dismissToast(id) {
    set({ toasts: get().toasts.filter((x) => x.id !== id) });
  },

  setNotebook(fn, field, from, to) {
    const nb = structuredClone(get().notebook);
    fn(nb);
    if (field && from !== to) {
      nb.history.push({ t: Math.round((get().runtime?.world.timeS ?? 0) * 10) / 10, field, from: from ?? '', to: to ?? '' });
      if (nb.history.length > 600) nb.history.splice(0, nb.history.length - 600);
    }
    set({ notebook: nb });
  },

  setModal(m) {
    set({ modal: m });
  },
  setStage(s) {
    set({ stage: s });
    if (s) s.audio.setVolume(get().settings.volume);
  },
  bump() {
    set({ version: get().version + 1 });
  },
  setPaused(p) {
    const stg = get().stage;
    if (get().demo && stg) stg.playback.paused = p;
    const rt = get().runtime;
    if (rt) rt.paused = p;
    set({ paused: p });
  },

  submit() {
    const rt = get().runtime;
    if (!rt) return;
    actor?.send({ type: 'SUBMIT' });
    actor?.send({ type: 'CONFIRM' });
    rt.paused = true;
    const evaluation = evaluateP4(rt.world, get().notebook, { ppeConfirmed: get().ppeConfirmed });
    set({ evaluation, submitted: true, screen: 'review', modal: null, paused: true });
    get().save();
    // Estudiantes: la entrega queda registrada en su curso (plataforma).
    void reportSubmission('p4', {
      mode: get().settings.mode, attemptId: get().attemptId, evaluation, world: rt.world, notebook: get().notebook, ppe: get().ppeConfirmed, tape: rt.tape,
    });
  },

  backToIntro() {
    get().save();
    set({ screen: 'intro', modal: null, demo: null });
  },

  save() {
    const s = get();
    if (s.demo) return;
    const rt = s.runtime;
    if (!rt) return;
    const ok = saveP4Attempt({
      version: 1, savedAt: Date.now(), attemptId: s.attemptId, settings: s.settings, world: rt.world, actions: rt.actions,
      notebook: s.notebook, workflow: actor?.getPersistedSnapshot() ?? null, ppe: s.ppeConfirmed, submitted: s.submitted,
      ...rt.tape?.forSave(),
    });
    rt.tape?.flush();
    if (ok) set({ savedAt: Date.now() });
  },

  toggleNotebook() {
    set({ notebookOpen: !get().notebookOpen });
  },
  toggleInventory() {
    set({ inventoryOpen: !get().inventoryOpen });
  },
}));

function bindRuntime(rt: ReactionRuntime) {
  unsubEvents?.();
  unsubEvents = rt.onEvents((evs: SimEvent[]) => {
    const st = useP4.getState();
    for (const e of evs) p4EventFeedback(e, st.settings.mode, st);
  });
}

function bindActor() {
  actor?.subscribe((snap) => {
    useP4.setState({ workflowStage: p4StageName(snap.value) });
  });
}

export function tickP4Workflow() {
  const st = useP4.getState();
  if (!st.runtime || !actor || st.screen !== 'lab') return;
  actor.send({ type: 'EVIDENCE', flags: p4StageEvidence(st.runtime.world, st.notebook) });
}

/** Bucles de fondo de la Práctica 4 (solo mientras esta práctica está abierta). */
export function startP4Loops(): () => void {
  const a = setInterval(() => {
    const st = useP4.getState();
    if (st.screen === 'lab') st.bump();
  }, 200);
  const b = setInterval(tickP4Workflow, 1000);
  const c = setInterval(() => {
    const st = useP4.getState();
    if (st.screen === 'lab' && st.ppeConfirmed && !st.demo) st.save();
  }, 5000);
  const onHide = () => {
    const st = useP4.getState();
    if (document.visibilityState === 'hidden' && st.runtime) {
      st.save();
      if (st.screen === 'lab') st.setPaused(true);
    }
  };
  const onUnload = () => useP4.getState().save();
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('beforeunload', onUnload);
  return () => {
    clearInterval(a);
    clearInterval(b);
    clearInterval(c);
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('beforeunload', onUnload);
  };
}

export { loadP4Attempt, clearP4Attempt };
