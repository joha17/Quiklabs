/**
 * Estado compartido de la Práctica 1 (Zustand): mismo patrón que las demás prácticas — el mundo es mutable dentro
 * de DensityRuntime y React se re-renderiza con un contador `version` (≤ 5 Hz).
 */
import { create } from 'zustand';
import { createActor, type Actor } from 'xstate';
import type { SimEvent } from '../../simulation/density-world/types';
import type { P01Command, P01DispatchResult } from '../../simulation/density-world/commands';
import { newSeed } from '../../simulation/core/rng';
import { newPractice01World, type Practice01Options } from '../../practices/practice-01';
import { sanitizeOnResume01 } from '../../practices/practice-01/resume';
import type { P01Mode } from '../../practices/practice-01/definition';
import type { P01Scenario } from '../../practices/practice-01/error-scenarios';
import { emptyP01Notebook, type P01Notebook } from '../../practices/practice-01/notebook';
import { practice01Machine, p01StageName } from '../../practices/practice-01/workflow.machine';
import { p01StageEvidence } from '../../practices/practice-01/evidence';
import { evaluateP01 } from '../../practices/practice-01/rubric';
import type { UncertaintyConvention } from '../../simulation/metrology/uncertainty';
import type { PpeItem } from '../../simulation/density-world/commands';
import type { Evaluation } from '../../simulation/scoring/types';
import type { DensityLab3D } from '../../engine/density/DensityLab3D';
import type { QualitySetting } from '../../engine/quality';
import { DensityRuntime } from './runtime';
import { clearP01Attempt, loadP01Attempt, saveP01Attempt, type SavedP01Attempt } from './persistence';
import { p01EventFeedback } from './feedback';
import { reportSubmission } from '../platform/report';
import { TapeRecorder } from '../platform/tape';

export interface P01Settings {
  mode: P01Mode;
  seed: number;
  scenarios: P01Scenario[];
  timeScale: number;
  uiScale: number;
  reducedMotion: boolean;
  captions: boolean;
  volume: number;
  showNames: boolean;
  quality: QualitySetting;
  /** Opciones docentes (§7): temperaturas, convención de incertidumbre y material del cilindro. */
  roomTempC: number;
  coldBathTargetC: number;
  convention: UncertaintyConvention;
  cylinderMaterial: 'ALUMINUM' | 'BRASS' | 'STEEL';
}

export interface P01Toast {
  id: number;
  level: 'info' | 'warn' | 'alert' | 'critical';
  text: string;
  at: number;
}

export interface P01DemoUi {
  index: number;
  total: number;
  key: string;
  part: 'A' | 'B' | 'C' | 'D' | 'E';
  note: string | null;
  done: boolean;
  speed: number;
}

const P01_DEMO_SEED = 20261001;

export type P01Modal = null | { kind: 'ppe' } | { kind: 'submit' } | { kind: 'settings' } | { kind: 'help' } | { kind: 'restored' };

interface P01State {
  screen: 'intro' | 'lab' | 'review';
  settings: P01Settings;
  runtime: DensityRuntime | null;
  stage: DensityLab3D | null;
  attemptId: string;
  notebook: P01Notebook;
  ppeConfirmed: boolean;
  selected: string | null;
  held: string | null;
  toasts: P01Toast[];
  captions: P01Toast[];
  version: number;
  workflowStage: string;
  modal: P01Modal;
  paused: boolean;
  evaluation: Evaluation | null;
  submitted: boolean;
  notebookOpen: boolean;
  inventoryOpen: boolean;
  savedAt: number | null;
  notebookTab: string | null;
  demo: P01DemoUi | null;
  startDemo(): void;
  setDemo(p: Partial<P01DemoUi>): void;

  setSettings(p: Partial<P01Settings>): void;
  start(opts?: { sameSeed?: boolean }): void;
  resume(saved: SavedP01Attempt): void;
  confirmPpe(items: Record<PpeItem, boolean>): boolean;
  dispatch(cmd: P01Command): P01DispatchResult;
  select(id: string | null): void;
  setHeld(id: string | null): void;
  toast(level: P01Toast['level'], text: string): void;
  caption(text: string): void;
  dismissToast(id: number): void;
  setNotebook(fn: (nb: P01Notebook) => void, field?: string, from?: string, to?: string): void;
  setModal(m: P01Modal): void;
  setStage(s: DensityLab3D | null): void;
  bump(): void;
  setPaused(p: boolean): void;
  submit(): void;
  backToIntro(): void;
  save(): void;
  toggleNotebook(): void;
  toggleInventory(): void;
}

let actor: Actor<typeof practice01Machine> | null = null;
let toastSeq = 1;
let unsubEvents: (() => void) | null = null;

const DEFAULT_SETTINGS: P01Settings = {
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
  roomTempC: 25,
  coldBathTargetC: 5,
  convention: 'RECTANGULAR',
  cylinderMaterial: 'ALUMINUM',
};

const attemptIdFor = (seed: number) => `p01-${seed.toString(36)}-${Date.now().toString(36)}`;

/** Opciones de creación del mundo (también van en la cinta del intento). */
const MATERIAL_RHO = { ALUMINUM: 2.7, BRASS: 8.5, STEEL: 7.85 } as const;

function optionsFor(s: P01Settings, seed: number, mode: P01Mode): Practice01Options {
  return {
    mode, seed, scenarios: s.scenarios,
    params: { roomTempC: s.roomTempC, coldBathTargetC: s.coldBathTargetC, convention: s.convention, cylinderMaterialDensityGPerMl: MATERIAL_RHO[s.cylinderMaterial] ?? 2.7 },
  };
}

function worldFor(s: P01Settings, seed: number, mode: P01Mode) {
  return newPractice01World(optionsFor(s, seed, mode));
}

export const useP01 = create<P01State>()((set, get) => ({
  screen: 'intro',
  settings: DEFAULT_SETTINGS,
  runtime: null,
  stage: null,
  attemptId: '',
  notebook: emptyP01Notebook(),
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
    const tape = TapeRecorder.start('p01', id, worldOpts);
    const rt = new DensityRuntime(newPractice01World(worldOpts), id);
    rt.tape = tape;
    rt.timeScale = s.timeScale;
    bindRuntime(rt);
    actor?.stop();
    actor = createActor(practice01Machine);
    bindActor();
    actor.start();
    actor.send({ type: 'START' });
    set({
      screen: 'lab', settings: { ...s, seed }, runtime: rt, attemptId: id, notebook: emptyP01Notebook(), ppeConfirmed: false, selected: null, held: null,
      toasts: [], captions: [], evaluation: null, submitted: false, modal: { kind: 'ppe' }, paused: true, demo: null, notebookTab: null
    });
    rt.paused = true;
  },

  startDemo() {
    const s = get().settings;
    const world = worldFor({ ...DEFAULT_SETTINGS, scenarios: [] }, P01_DEMO_SEED, 'PRACTICE');
    const rt = new DensityRuntime(world, 'demo');
    rt.timeScale = 1;
    bindRuntime(rt);
    actor?.stop();
    actor = createActor(practice01Machine);
    bindActor();
    actor.start();
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) rt.dispatch({ type: 'equipPpe', item, on: true });
    rt.dispatch({ type: 'startWork' });
    set({
      screen: 'lab', settings: { ...s, mode: 'PRACTICE' }, runtime: rt, attemptId: 'demo', notebook: emptyP01Notebook(), ppeConfirmed: true,
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
    sanitizeOnResume01(w);
    const rt = new DensityRuntime(w, saved.attemptId, saved.actions);
    rt.tape = TapeRecorder.resume('p01', saved.attemptId, w.tick, saved);
    rt.timeScale = saved.settings.timeScale;
    rt.paused = true;
    bindRuntime(rt);
    actor?.stop();
    try {
      actor = createActor(practice01Machine, saved.workflow ? { snapshot: saved.workflow as never } : undefined);
    } catch {
      actor = createActor(practice01Machine);
    }
    bindActor();
    actor.start();
    set({
      screen: saved.submitted ? 'review' : 'lab', settings: { ...DEFAULT_SETTINGS, ...saved.settings }, runtime: rt, attemptId: saved.attemptId, notebook: saved.notebook,
      ppeConfirmed: saved.ppe, toasts: [], captions: [], paused: true, submitted: saved.submitted,
      modal: saved.submitted ? null : saved.ppe ? null : { kind: 'ppe' },
      evaluation: saved.submitted ? evaluateP01(w, saved.notebook) : null,
    });
  },

  confirmPpe(items) {
    const rt = get().runtime;
    if (!rt) return false;
    // El equipo elegido va al dominio; empezar sin algo de él se rechaza y queda registrado (E001–E004).
    for (const k of Object.keys(items) as PpeItem[]) rt.dispatch({ type: 'equipPpe', item: k, on: items[k] });
    const r = rt.dispatch({ type: 'startWork' });
    set({ version: get().version + 1 });
    if (!r.ok) return false;
    actor?.send({ type: 'PPE_CONFIRMED' });
    rt.paused = false;
    set({ ppeConfirmed: true, modal: null, paused: false });
    get().save();
    return true;
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
    const evaluation = evaluateP01(rt.world, get().notebook);
    set({ evaluation, submitted: true, screen: 'review', modal: null, paused: true });
    get().save();
    // Estudiantes: la entrega queda registrada en su curso (plataforma).
    void reportSubmission('p01', {
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
    const ok = saveP01Attempt({
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

function bindRuntime(rt: DensityRuntime) {
  unsubEvents?.();
  unsubEvents = rt.onEvents((evs: SimEvent[]) => {
    const st = useP01.getState();
    for (const e of evs) p01EventFeedback(e, st.settings.mode, st);
  });
}

function bindActor() {
  actor?.subscribe((snap) => {
    useP01.setState({ workflowStage: p01StageName(snap.value) });
  });
}

export function tickP01Workflow() {
  const st = useP01.getState();
  if (!st.runtime || !actor || st.screen !== 'lab') return;
  actor.send({ type: 'EVIDENCE', flags: p01StageEvidence(st.runtime.world, st.notebook) });
}

/** Bucles de fondo de la Práctica 1 (solo mientras esta práctica está abierta). */
export function startP01Loops(): () => void {
  const a = setInterval(() => {
    const st = useP01.getState();
    if (st.screen === 'lab') st.bump();
  }, 200);
  const b = setInterval(tickP01Workflow, 1000);
  const c = setInterval(() => {
    const st = useP01.getState();
    if (st.screen === 'lab' && st.ppeConfirmed && !st.demo) st.save();
  }, 5000);
  const onHide = () => {
    const st = useP01.getState();
    if (document.visibilityState === 'hidden' && st.runtime) {
      st.save();
      if (st.screen === 'lab') st.setPaused(true);
    }
  };
  const onUnload = () => useP01.getState().save();
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

export { loadP01Attempt, clearP01Attempt };

/**
 * Ir a una estación. E (libreta y comparación) y F (revisión y entrega) no tienen objetos en la mesada (§4): además de
 * mover la cámara, abren la libreta en la pestaña de trabajo correspondiente.
 */
export function goToStation01(id: string) {
  const s = useP01.getState();
  s.stage?.goToStation(id);
  if (s.demo || (id !== 'E' && id !== 'F')) return;
  useP01.setState({ notebookOpen: true, notebookTab: id === 'E' ? 'B' : 'analysis' });
}
