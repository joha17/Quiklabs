/**
 * Estado compartido de la Práctica 10 (Zustand): mismo patrón que las prácticas 2 a 6 — el mundo es mutable dentro
 * de GasRuntime y React se re-renderiza con un contador `version` (≤ 5 Hz).
 */
import { create } from 'zustand';
import { createActor, type Actor } from 'xstate';
import type { SimEvent } from '../../simulation/gas-world/types';
import type { P10Command, P10DispatchResult } from '../../simulation/gas-world/commands';
import { newSeed } from '../../simulation/core/rng';
import { DEFAULT_P10_PARAMS, newPractice10World, type Practice10Options } from '../../practices/practice-10';
import { sanitizeOnResume10 } from '../../practices/practice-10/resume';
import type { P10Mode } from '../../practices/practice-10/definition';
import type { P10Scenario } from '../../practices/practice-10/error-scenarios';
import { emptyP10Notebook, type P10Notebook } from '../../practices/practice-10/notebook';
import { practice10Machine, p10StageName } from '../../practices/practice-10/workflow.machine';
import { p10StageEvidence } from '../../practices/practice-10/evidence';
import { evaluateP10 } from '../../practices/practice-10/rubric';
import type { SensorModel } from '../../simulation/instruments/pressure-sensor';
import type { Evaluation } from '../../simulation/scoring/types';
import type { GasLab3D } from '../../engine/gas/GasLab3D';
import type { QualitySetting } from '../../engine/quality';
import { GasRuntime } from './runtime';
import { clearP10Attempt, loadP10Attempt, saveP10Attempt, type SavedP10Attempt } from './persistence';
import { p10EventFeedback } from './feedback';
import { reportSubmission } from '../platform/report';
import { TapeRecorder } from '../platform/tape';

export interface P10Settings {
  mode: P10Mode;
  seed: number;
  scenarios: P10Scenario[];
  timeScale: number;
  uiScale: number;
  reducedMotion: boolean;
  captions: boolean;
  volume: number;
  showNames: boolean;
  quality: QualitySetting;
  /** Opciones docentes (§34): modelo, presión y altitud, temperatura, vinagre, balón, sensor y réplicas. */
  model: 'CURRICULAR' | 'REALISTIC';
  vapor: 'TABLE' | 'ANTOINE';
  pressureKPa: number;
  altitudeM: number;
  ambientC: number;
  vinegarPercent: number;
  vinegarBasis: 'm/m' | 'm/v' | 'v/v';
  flaskMl: 100 | 50;
  sensorModel: SensorModel;
  bathWater: 'FRESH' | 'SATURATED';
  balanceResolution: 0.0001 | 0.001;
  replicates: 1 | 2;
}

export interface P10Toast {
  id: number;
  level: 'info' | 'warn' | 'alert' | 'critical';
  text: string;
  at: number;
}

export interface P10DemoUi {
  index: number;
  total: number;
  key: string;
  part: 'A' | 'B';
  note: string | null;
  done: boolean;
  speed: number;
}

const P10_DEMO_SEED = 20261010;

export type P10Modal = null | { kind: 'ppe' } | { kind: 'submit' } | { kind: 'settings' } | { kind: 'help' } | { kind: 'restored' };

interface P10State {
  screen: 'intro' | 'lab' | 'review';
  settings: P10Settings;
  runtime: GasRuntime | null;
  stage: GasLab3D | null;
  attemptId: string;
  notebook: P10Notebook;
  ppeConfirmed: boolean;
  selected: string | null;
  held: string | null;
  toasts: P10Toast[];
  captions: P10Toast[];
  version: number;
  workflowStage: string;
  modal: P10Modal;
  paused: boolean;
  evaluation: Evaluation | null;
  submitted: boolean;
  notebookOpen: boolean;
  inventoryOpen: boolean;
  savedAt: number | null;
  notebookTab: string | null;
  demo: P10DemoUi | null;
  startDemo(): void;
  setDemo(p: Partial<P10DemoUi>): void;

  setSettings(p: Partial<P10Settings>): void;
  start(opts?: { sameSeed?: boolean }): void;
  resume(saved: SavedP10Attempt): void;
  confirmPpe(): void;
  dispatch(cmd: P10Command): P10DispatchResult;
  select(id: string | null): void;
  setHeld(id: string | null): void;
  toast(level: P10Toast['level'], text: string): void;
  caption(text: string): void;
  dismissToast(id: number): void;
  setNotebook(fn: (nb: P10Notebook) => void, field?: string, from?: string, to?: string): void;
  setModal(m: P10Modal): void;
  setStage(s: GasLab3D | null): void;
  bump(): void;
  setPaused(p: boolean): void;
  submit(): void;
  backToIntro(): void;
  save(): void;
  toggleNotebook(): void;
  toggleInventory(): void;
}

let actor: Actor<typeof practice10Machine> | null = null;
let toastSeq = 1;
let unsubEvents: (() => void) | null = null;

const DEFAULT_SETTINGS: P10Settings = {
  mode: 'PRACTICE',
  seed: newSeed(),
  scenarios: [],
  timeScale: 3,
  uiScale: 1,
  reducedMotion: typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  captions: true,
  volume: 0.4,
  showNames: true,
  quality: 'AUTO',
  model: 'CURRICULAR',
  vapor: 'TABLE',
  pressureKPa: 101.325,
  altitudeM: 0,
  ambientC: 25,
  vinegarPercent: 5,
  vinegarBasis: 'm/v',
  flaskMl: 100,
  sensorModel: 'GPS_BTA',
  bathWater: 'FRESH',
  balanceResolution: 0.0001,
  replicates: 2,
};

const attemptIdFor = (seed: number) => `p10-${seed.toString(36)}-${Date.now().toString(36)}`;

/** Opciones de creación del mundo (también van en la cinta del intento). */
function optionsFor(s: P10Settings, seed: number, mode: P10Mode): Practice10Options {
  const res = s.balanceResolution ?? 0.0001;
  const D = DEFAULT_P10_PARAMS;
  return {
    mode, seed, scenarios: s.scenarios,
    params: {
      model: s.model, vapor: s.vapor, pressureKPa: s.pressureKPa, altitudeM: s.altitudeM, ambientC: s.ambientC, tapWaterC: s.ambientC - 1.2,
      vinegar: { ...D.vinegar, percent: s.vinegarPercent, basis: s.vinegarBasis }, flaskMl: s.flaskMl, flaskTolMl: s.flaskMl === 50 ? 0.05 : D.flaskTolMl,
      sensorModel: s.sensorModel, bathWater: s.bathWater, replicates: s.replicates,
      balance: { ...D.balance, resolutionG: res, uncertaintyG: res * 2 },
    },
  };
}

function worldFor(s: P10Settings, seed: number, mode: P10Mode) {
  return newPractice10World(optionsFor(s, seed, mode));
}

export const useP10 = create<P10State>()((set, get) => ({
  screen: 'intro',
  settings: DEFAULT_SETTINGS,
  runtime: null,
  stage: null,
  attemptId: '',
  notebook: emptyP10Notebook(),
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
    const tape = TapeRecorder.start('p10', id, worldOpts);
    const rt = new GasRuntime(newPractice10World(worldOpts), id);
    rt.tape = tape;
    rt.timeScale = s.timeScale;
    bindRuntime(rt);
    actor?.stop();
    actor = createActor(practice10Machine);
    bindActor();
    actor.start();
    actor.send({ type: 'START' });
    set({
      screen: 'lab', settings: { ...s, seed }, runtime: rt, attemptId: id, notebook: emptyP10Notebook(), ppeConfirmed: false, selected: null, held: null,
      toasts: [], captions: [], evaluation: null, submitted: false, modal: { kind: 'ppe' }, paused: true, demo: null, notebookTab: null
    });
    rt.paused = true;
  },

  startDemo() {
    const s = get().settings;
    const world = worldFor({ ...DEFAULT_SETTINGS, scenarios: [] }, P10_DEMO_SEED, 'PRACTICE');
    const rt = new GasRuntime(world, 'demo');
    rt.timeScale = 1;
    bindRuntime(rt);
    actor?.stop();
    actor = createActor(practice10Machine);
    bindActor();
    actor.start();
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    rt.dispatch({ type: 'confirmPpe' });
    set({
      screen: 'lab', settings: { ...s, mode: 'PRACTICE' }, runtime: rt, attemptId: 'demo', notebook: emptyP10Notebook(), ppeConfirmed: true,
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
    // Al restaurar: vertidos detenidos, nada en la mano, llave cerrada y émbolo suelto. El tiempo no avanzó.
    sanitizeOnResume10(w);
    const rt = new GasRuntime(w, saved.attemptId, saved.actions);
    rt.tape = TapeRecorder.resume('p10', saved.attemptId, w.tick, saved);
    rt.timeScale = saved.settings.timeScale;
    rt.paused = true;
    bindRuntime(rt);
    actor?.stop();
    try {
      actor = createActor(practice10Machine, saved.workflow ? { snapshot: saved.workflow as never } : undefined);
    } catch {
      actor = createActor(practice10Machine);
    }
    bindActor();
    actor.start();
    set({
      screen: saved.submitted ? 'review' : 'lab', settings: { ...DEFAULT_SETTINGS, ...saved.settings }, runtime: rt, attemptId: saved.attemptId, notebook: saved.notebook,
      ppeConfirmed: saved.ppe, toasts: [], captions: [], paused: true, submitted: saved.submitted,
      modal: saved.submitted ? null : saved.ppe ? null : { kind: 'ppe' },
      evaluation: saved.submitted ? evaluateP10(w, saved.notebook) : null,
    });
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
    const evaluation = evaluateP10(rt.world, get().notebook);
    set({ evaluation, submitted: true, screen: 'review', modal: null, paused: true });
    get().save();
    // Estudiantes: la entrega queda registrada en su curso (plataforma).
    void reportSubmission('p10', {
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
    const ok = saveP10Attempt({
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

function bindRuntime(rt: GasRuntime) {
  unsubEvents?.();
  unsubEvents = rt.onEvents((evs: SimEvent[]) => {
    const st = useP10.getState();
    for (const e of evs) p10EventFeedback(e, st.settings.mode, st);
  });
}

function bindActor() {
  actor?.subscribe((snap) => {
    useP10.setState({ workflowStage: p10StageName(snap.value) });
  });
}

export function tickP10Workflow() {
  const st = useP10.getState();
  if (!st.runtime || !actor || st.screen !== 'lab') return;
  actor.send({ type: 'EVIDENCE', flags: p10StageEvidence(st.runtime.world, st.notebook) });
}

/** Bucles de fondo de la Práctica 10 (solo mientras esta práctica está abierta). */
export function startP10Loops(): () => void {
  const a = setInterval(() => {
    const st = useP10.getState();
    if (st.screen === 'lab') st.bump();
  }, 200);
  const b = setInterval(tickP10Workflow, 1000);
  const c = setInterval(() => {
    const st = useP10.getState();
    if (st.screen === 'lab' && st.ppeConfirmed && !st.demo) st.save();
  }, 5000);
  const onHide = () => {
    const st = useP10.getState();
    if (document.visibilityState === 'hidden' && st.runtime) {
      st.save();
      if (st.screen === 'lab') st.setPaused(true);
    }
  };
  const onUnload = () => useP10.getState().save();
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

export { loadP10Attempt, clearP10Attempt };
