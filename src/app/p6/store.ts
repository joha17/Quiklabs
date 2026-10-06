/**
 * Estado compartido de la Práctica 6 (Zustand): mismo patrón que las prácticas 2 a 5 — el mundo es mutable dentro
 * de CalorRuntime y React se re-renderiza con un contador `version` (≤ 5 Hz).
 */
import { create } from 'zustand';
import { createActor, type Actor } from 'xstate';
import type { SimEvent } from '../../simulation/calorimetry-world/types';
import type { P6Command, P6DispatchResult } from '../../simulation/calorimetry-world/commands';
import { newSeed } from '../../simulation/core/rng';
import { DEFAULT_P6_PARAMS, newPractice6World } from '../../practices/practice-06';
import type { P6Mode } from '../../practices/practice-06/definition';
import type { P6Scenario } from '../../practices/practice-06/error-scenarios';
import { emptyP6Notebook, type P6Notebook } from '../../practices/practice-06/notebook';
import { practice6Machine, p6StageName } from '../../practices/practice-06/workflow.machine';
import { p6StageEvidence } from '../../practices/practice-06/evidence';
import { evaluateP6 } from '../../practices/practice-06/rubric';
import type { MetalId } from '../../simulation/calorimetry/materials';
import type { Evaluation } from '../../simulation/scoring/types';
import type { CalorLab3D } from '../../engine/calor/CalorLab3D';
import type { QualitySetting } from '../../engine/quality';
import { CalorRuntime } from './runtime';
import { clearP6Attempt, loadP6Attempt, saveP6Attempt, type SavedP6Attempt } from './persistence';
import { p6EventFeedback } from './feedback';
import { reportSubmission } from '../platform/report';

export interface P6Settings {
  mode: P6Mode;
  seed: number;
  scenarios: P6Scenario[];
  timeScale: number;
  uiScale: number;
  reducedMotion: boolean;
  captions: boolean;
  volume: number;
  showNames: boolean;
  quality: QualitySetting;
  /** Opciones docentes (§29): modelo, presión, aislamiento, incógnito y bomba calorimétrica. */
  model: 'IDEAL' | 'REALISTIC';
  cpModel: 'CONSTANT' | 'T_DEPENDENT';
  pressureKPa: number;
  ambientC: number;
  cupHeatCap: number;
  unknown: MetalId | null;
  bombEnabled: boolean;
  balanceResolution: 0.1 | 0.01;
}

export interface P6Toast {
  id: number;
  level: 'info' | 'warn' | 'alert' | 'critical';
  text: string;
  at: number;
}

export interface P6DemoUi {
  index: number;
  total: number;
  key: string;
  part: 'A' | 'B' | 'C' | 'D' | 'E';
  note: string | null;
  done: boolean;
  speed: number;
}

const P6_DEMO_SEED = 20261005;

export type P6Modal = null | { kind: 'ppe' } | { kind: 'submit' } | { kind: 'settings' } | { kind: 'help' } | { kind: 'restored' };

interface P6State {
  screen: 'intro' | 'lab' | 'review';
  settings: P6Settings;
  runtime: CalorRuntime | null;
  stage: CalorLab3D | null;
  attemptId: string;
  notebook: P6Notebook;
  ppeConfirmed: boolean;
  selected: string | null;
  held: string | null;
  toasts: P6Toast[];
  captions: P6Toast[];
  version: number;
  workflowStage: string;
  modal: P6Modal;
  paused: boolean;
  evaluation: Evaluation | null;
  submitted: boolean;
  notebookOpen: boolean;
  inventoryOpen: boolean;
  savedAt: number | null;
  notebookTab: string | null;
  demo: P6DemoUi | null;
  startDemo(): void;
  setDemo(p: Partial<P6DemoUi>): void;

  setSettings(p: Partial<P6Settings>): void;
  start(opts?: { sameSeed?: boolean }): void;
  resume(saved: SavedP6Attempt): void;
  confirmPpe(): void;
  dispatch(cmd: P6Command): P6DispatchResult;
  select(id: string | null): void;
  setHeld(id: string | null): void;
  toast(level: P6Toast['level'], text: string): void;
  caption(text: string): void;
  dismissToast(id: number): void;
  setNotebook(fn: (nb: P6Notebook) => void, field?: string, from?: string, to?: string): void;
  setModal(m: P6Modal): void;
  setStage(s: CalorLab3D | null): void;
  bump(): void;
  setPaused(p: boolean): void;
  submit(): void;
  backToIntro(): void;
  save(): void;
  toggleNotebook(): void;
  toggleInventory(): void;
}

let actor: Actor<typeof practice6Machine> | null = null;
let toastSeq = 1;
let unsubEvents: (() => void) | null = null;

const DEFAULT_SETTINGS: P6Settings = {
  mode: 'PRACTICE',
  seed: newSeed(),
  scenarios: [],
  timeScale: 5,
  uiScale: 1,
  reducedMotion: typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  captions: true,
  volume: 0.4,
  showNames: true,
  quality: 'AUTO',
  model: 'REALISTIC',
  cpModel: 'CONSTANT',
  pressureKPa: 101.325,
  ambientC: 23,
  cupHeatCap: 18,
  unknown: null,
  bombEnabled: true,
  balanceResolution: 0.1,
};

const attemptIdFor = (seed: number) => `p6-${seed.toString(36)}-${Date.now().toString(36)}`;

function worldFor(s: P6Settings, seed: number, mode: P6Mode) {
  const res = s.balanceResolution ?? 0.1;
  return newPractice6World({
    mode, seed, scenarios: s.scenarios, unknown: s.unknown,
    params: {
      model: s.model, cpModel: s.cpModel, pressureKPa: s.pressureKPa, ambientC: s.ambientC, cupHeatCapJPerC: s.cupHeatCap, bombEnabled: s.bombEnabled,
      balance: { ...DEFAULT_P6_PARAMS.balance, resolutionG: res, uncertaintyG: res / 2 },
    },
  });
}

export const useP6 = create<P6State>()((set, get) => ({
  screen: 'intro',
  settings: DEFAULT_SETTINGS,
  runtime: null,
  stage: null,
  attemptId: '',
  notebook: emptyP6Notebook(),
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
    const world = worldFor(s, seed, s.mode);
    const id = attemptIdFor(seed);
    const rt = new CalorRuntime(world, id);
    rt.timeScale = s.timeScale;
    bindRuntime(rt);
    actor?.stop();
    actor = createActor(practice6Machine);
    bindActor();
    actor.start();
    actor.send({ type: 'START' });
    set({
      screen: 'lab', settings: { ...s, seed }, runtime: rt, attemptId: id, notebook: emptyP6Notebook(), ppeConfirmed: false, selected: null, held: null,
      toasts: [], captions: [], evaluation: null, submitted: false, modal: { kind: 'ppe' }, paused: true, demo: null, notebookTab: null
    });
    rt.paused = true;
  },

  startDemo() {
    const s = get().settings;
    const world = worldFor({ ...DEFAULT_SETTINGS, scenarios: [] }, P6_DEMO_SEED, 'PRACTICE');
    const rt = new CalorRuntime(world, 'demo');
    rt.timeScale = 1;
    bindRuntime(rt);
    actor?.stop();
    actor = createActor(practice6Machine);
    bindActor();
    actor.start();
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    rt.dispatch({ type: 'confirmPpe' });
    set({
      screen: 'lab', settings: { ...s, mode: 'PRACTICE' }, runtime: rt, attemptId: 'demo', notebook: emptyP6Notebook(), ppeConfirmed: true,
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
    // Al restaurar: plantilla apagada, vertidos detenidos y nada en la mano (§28.1). El tiempo no avanzó.
    const wasOn = w.plate.knob > 0.01;
    w.plate.knob = 0;
    w.pours = {};
    for (const o of Object.values(w.objects)) {
      if (o.support !== 'hand' && o.support !== 'tongs') continue;
      if (w.tubes[o.id]) {
        o.support = 'rack';
        o.pose = { x: w.objects.rack.pose.x + (o.id === 'tube_fe' ? -3 : 3), y: w.objects.rack.pose.y, z: 0.6, rotationRad: 0 };
      } else {
        o.support = 'bench';
        o.pose = { ...o.pose, z: 0, rotationRad: 0 };
      }
    }
    for (const p of Object.values(w.pieces)) if (p.loc === 'spatula') p.loc = 'bench';
    w.safety.lastInteractionS = w.timeS;
    const rt = new CalorRuntime(w, saved.attemptId, saved.actions);
    rt.timeScale = saved.settings.timeScale;
    rt.paused = true;
    bindRuntime(rt);
    actor?.stop();
    try {
      actor = createActor(practice6Machine, saved.workflow ? { snapshot: saved.workflow as never } : undefined);
    } catch {
      actor = createActor(practice6Machine);
    }
    bindActor();
    actor.start();
    set({
      screen: saved.submitted ? 'review' : 'lab', settings: { ...DEFAULT_SETTINGS, ...saved.settings }, runtime: rt, attemptId: saved.attemptId, notebook: saved.notebook,
      ppeConfirmed: saved.ppe, toasts: [], captions: [], paused: true, submitted: saved.submitted,
      modal: saved.submitted ? null : saved.ppe ? (wasOn ? { kind: 'restored' } : null) : { kind: 'ppe' },
      evaluation: saved.submitted ? evaluateP6(w, saved.notebook) : null,
    });
    if (wasOn && !saved.submitted) get().toast('warn', 'Se restauró el intento en un estado seguro: la plantilla quedó apagada.');
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
    const evaluation = evaluateP6(rt.world, get().notebook);
    set({ evaluation, submitted: true, screen: 'review', modal: null, paused: true });
    get().save();
    // Estudiantes: la entrega queda registrada en su curso (plataforma).
    void reportSubmission('p6', { mode: get().settings.mode, attemptId: get().attemptId, evaluation, durationS: rt.world.timeS });
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
    const ok = saveP6Attempt({
      version: 1, savedAt: Date.now(), attemptId: s.attemptId, settings: s.settings, world: rt.world, actions: rt.actions,
      notebook: s.notebook, workflow: actor?.getPersistedSnapshot() ?? null, ppe: s.ppeConfirmed, submitted: s.submitted,
    });
    if (ok) set({ savedAt: Date.now() });
  },

  toggleNotebook() {
    set({ notebookOpen: !get().notebookOpen });
  },
  toggleInventory() {
    set({ inventoryOpen: !get().inventoryOpen });
  },
}));

function bindRuntime(rt: CalorRuntime) {
  unsubEvents?.();
  unsubEvents = rt.onEvents((evs: SimEvent[]) => {
    const st = useP6.getState();
    for (const e of evs) p6EventFeedback(e, st.settings.mode, st);
  });
}

function bindActor() {
  actor?.subscribe((snap) => {
    useP6.setState({ workflowStage: p6StageName(snap.value) });
  });
}

export function tickP6Workflow() {
  const st = useP6.getState();
  if (!st.runtime || !actor || st.screen !== 'lab') return;
  actor.send({ type: 'EVIDENCE', flags: p6StageEvidence(st.runtime.world, st.notebook) });
}

/** Bucles de fondo de la Práctica 6 (solo mientras esta práctica está abierta). */
export function startP6Loops(): () => void {
  const a = setInterval(() => {
    const st = useP6.getState();
    if (st.screen === 'lab') st.bump();
  }, 200);
  const b = setInterval(tickP6Workflow, 1000);
  const c = setInterval(() => {
    const st = useP6.getState();
    if (st.screen === 'lab' && st.ppeConfirmed && !st.demo) st.save();
  }, 5000);
  const onHide = () => {
    const st = useP6.getState();
    if (document.visibilityState === 'hidden' && st.runtime) {
      st.save();
      if (st.screen === 'lab') st.setPaused(true);
    }
  };
  const onUnload = () => useP6.getState().save();
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

export { loadP6Attempt, clearP6Attempt };
