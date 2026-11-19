/**
 * Estado compartido de F08 (Zustand): mismo patrón que las demás prácticas — el mundo es mutable dentro de
 * F08Runtime y React se re-renderiza con un contador `version` (≤ 5 Hz).
 */
import { create } from 'zustand';
import { createActor, type Actor } from 'xstate';
import type { SimEvent } from '../../simulation/f08-world/types';
import type { F08Command, F08DispatchResult, PpeItem } from '../../simulation/f08-world/commands';
import { newSeed } from '../../simulation/core/rng';
import { newPracticeF08World, type PracticeF08Options } from '../../practices/practice-f08';
import { sanitizeOnResumeF08 } from '../../practices/practice-f08/resume';
import type { F08Mode } from '../../practices/practice-f08/definition';
import type { F08Scenario } from '../../practices/practice-f08/error-scenarios';
import { emptyF08Notebook, type F08Notebook } from '../../practices/practice-f08/notebook';
import { practiceF08Machine, f08StageName } from '../../practices/practice-f08/workflow.machine';
import { f08StageEvidence } from '../../practices/practice-f08/evidence';
import { evaluateF08 } from '../../practices/practice-f08/rubric';
import type { Evaluation } from '../../simulation/scoring/types';
import type { F08Lab3D } from '../../engine/f08/F08Lab3D';
import type { QualitySetting } from '../../engine/quality';
import { F08Runtime } from './runtime';
import { clearF08Attempt, loadF08Attempt, saveF08Attempt, type SavedF08Attempt } from './persistence';
import { f08EventFeedback } from './feedback';
import { reportSubmission } from '../platform/report';
import { TapeRecorder } from '../platform/tape';

export interface F08Settings {
  mode: F08Mode;
  seed: number;
  scenarios: F08Scenario[];
  timeScale: number;
  uiScale: number;
  reducedMotion: boolean;
  captions: boolean;
  volume: number;
  showNames: boolean;
  quality: QualitySetting;
  /** Opción docente: modelo ideal (sin roce ni masa del émbolo, sensores ideales) o realista (rodadura, émbolo, aire y sensores reales). */
  scientificMode: 'CURRICULAR' | 'REALISTIC';
  /** Lente de lectura abierta (instrumento cuya escala se amplía). */
  lens: string | null;
}

export interface F08Toast {
  id: number;
  level: 'info' | 'warn' | 'alert' | 'critical';
  text: string;
  at: number;
}

export interface F08DemoUi {
  index: number;
  total: number;
  key: string;
  part: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  note: string | null;
  done: boolean;
  speed: number;
}

const F08_DEMO_SEED = 20261114;

export type F08Modal = null | { kind: 'ppe' } | { kind: 'submit' } | { kind: 'settings' } | { kind: 'help' } | { kind: 'restored' };

interface F08State {
  screen: 'intro' | 'lab' | 'review';
  settings: F08Settings;
  runtime: F08Runtime | null;
  stage: F08Lab3D | null;
  attemptId: string;
  notebook: F08Notebook;
  ppeConfirmed: boolean;
  selected: string | null;
  held: string | null;
  toasts: F08Toast[];
  captions: F08Toast[];
  version: number;
  workflowStage: string;
  modal: F08Modal;
  paused: boolean;
  evaluation: Evaluation | null;
  submitted: boolean;
  notebookOpen: boolean;
  inventoryOpen: boolean;
  savedAt: number | null;
  notebookTab: string | null;
  demo: F08DemoUi | null;
  startDemo(): void;
  setDemo(p: Partial<F08DemoUi>): void;

  setSettings(p: Partial<F08Settings>): void;
  start(opts?: { sameSeed?: boolean }): void;
  resume(saved: SavedF08Attempt): void;
  confirmPpe(items: Record<PpeItem, boolean>): boolean;
  dispatch(cmd: F08Command): F08DispatchResult;
  select(id: string | null): void;
  setHeld(id: string | null): void;
  toast(level: F08Toast['level'], text: string): void;
  caption(text: string): void;
  dismissToast(id: number): void;
  setNotebook(fn: (nb: F08Notebook) => void, field?: string, from?: string, to?: string): void;
  setModal(m: F08Modal): void;
  setStage(s: F08Lab3D | null): void;
  bump(): void;
  setPaused(p: boolean): void;
  submit(): void;
  backToIntro(): void;
  /** Sale al inicio descartando el intento guardado: al volver se empieza de cero. */
  discardAndExit(): void;
  save(): void;
  toggleNotebook(): void;
  toggleInventory(): void;
}

let actor: Actor<typeof practiceF08Machine> | null = null;
let toastSeq = 1;
let unsubEvents: (() => void) | null = null;

const DEFAULT_SETTINGS: F08Settings = {
  mode: 'PRACTICE',
  seed: newSeed(),
  scenarios: [],
  timeScale: 1,
  uiScale: 1,
  reducedMotion: typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  captions: true,
  volume: 0.4,
  showNames: true,
  quality: 'AUTO',
  scientificMode: 'REALISTIC',
  lens: null,
};

const attemptIdFor = (seed: number) => `f08-${seed.toString(36)}-${Date.now().toString(36)}`;

/** Opciones de creación del mundo (también van en la cinta del intento). */
function optionsFor(s: F08Settings, seed: number, mode: F08Mode): PracticeF08Options {
  return { mode, seed, scenarios: s.scenarios, scientificMode: s.scientificMode };
}

function worldFor(s: F08Settings, seed: number, mode: F08Mode) {
  return newPracticeF08World(optionsFor(s, seed, mode));
}

export const useF08 = create<F08State>()((set, get) => ({
  screen: 'intro',
  settings: DEFAULT_SETTINGS,
  runtime: null,
  stage: null,
  attemptId: '',
  notebook: emptyF08Notebook(),
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
    const tape = TapeRecorder.start('f08', id, worldOpts);
    const rt = new F08Runtime(newPracticeF08World(worldOpts), id);
    rt.tape = tape;
    rt.timeScale = s.timeScale;
    bindRuntime(rt);
    actor?.stop();
    actor = createActor(practiceF08Machine);
    bindActor();
    actor.start();
    actor.send({ type: 'START' });
    set({
      screen: 'lab', settings: { ...s, seed }, runtime: rt, attemptId: id, notebook: emptyF08Notebook(), ppeConfirmed: false, selected: null, held: null,
      toasts: [], captions: [], evaluation: null, submitted: false, modal: { kind: 'ppe' }, paused: true, demo: null, notebookTab: null
    });
    rt.paused = true;
  },

  startDemo() {
    const s = get().settings;
    const world = worldFor({ ...DEFAULT_SETTINGS, scenarios: [] }, F08_DEMO_SEED, 'PRACTICE');
    const rt = new F08Runtime(world, 'demo');
    rt.timeScale = 1;
    bindRuntime(rt);
    actor?.stop();
    actor = createActor(practiceF08Machine);
    bindActor();
    actor.start();
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) rt.dispatch({ type: 'equipPpe', item, on: true });
    rt.dispatch({ type: 'startWork' });
    set({
      screen: 'lab', settings: { ...s, mode: 'PRACTICE' }, runtime: rt, attemptId: 'demo', notebook: emptyF08Notebook(), ppeConfirmed: true,
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
    // Al restaurar: lanzadores destrabados, carros quietos, nada en la mano. El tiempo no avanzó.
    sanitizeOnResumeF08(w);
    const rt = new F08Runtime(w, saved.attemptId, saved.actions);
    rt.tape = TapeRecorder.resume('f08', saved.attemptId, w.tick, saved);
    rt.timeScale = saved.settings.timeScale;
    rt.paused = true;
    bindRuntime(rt);
    actor?.stop();
    try {
      actor = createActor(practiceF08Machine, saved.workflow ? { snapshot: saved.workflow as never } : undefined);
    } catch {
      actor = createActor(practiceF08Machine);
    }
    bindActor();
    actor.start();
    set({
      screen: saved.submitted ? 'review' : 'lab', settings: { ...DEFAULT_SETTINGS, ...saved.settings }, runtime: rt, attemptId: saved.attemptId, notebook: saved.notebook,
      ppeConfirmed: saved.ppe, toasts: [], captions: [], paused: true, submitted: saved.submitted,
      modal: saved.submitted ? null : saved.ppe ? null : { kind: 'ppe' },
      evaluation: saved.submitted ? evaluateF08(w, saved.notebook) : null,
    });
  },

  confirmPpe(items) {
    const rt = get().runtime;
    if (!rt) return false;
    // El equipo elegido va al dominio; empezar sin algo de él se rechaza y queda registrado.
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
    const evaluation = evaluateF08(rt.world, get().notebook);
    set({ evaluation, submitted: true, screen: 'review', modal: null, paused: true });
    get().save();
    // Estudiantes: la entrega queda registrada en su curso (plataforma).
    void reportSubmission('f08', {
      mode: get().settings.mode, attemptId: get().attemptId, evaluation, world: rt.world, notebook: get().notebook, ppe: get().ppeConfirmed, tape: rt.tape,
    });
  },

  backToIntro() {
    get().save();
    set({ screen: 'intro', modal: null, demo: null });
  },

  discardAndExit() {
    const rt = get().runtime;
    if (rt) rt.paused = true;
    // Sin runtime, ningún autoguardado (intervalo, pestaña oculta, cierre) puede volver a escribir el intento.
    clearF08Attempt();
    set({ screen: 'intro', modal: null, demo: null, runtime: null, paused: true });
  },

  save() {
    const s = get();
    if (s.demo) return;
    const rt = s.runtime;
    if (!rt) return;
    const ok = saveF08Attempt({
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

function bindRuntime(rt: F08Runtime) {
  unsubEvents?.();
  unsubEvents = rt.onEvents((evs: SimEvent[]) => {
    const st = useF08.getState();
    for (const e of evs) f08EventFeedback(e, st.settings.mode, st);
  });
}

function bindActor() {
  actor?.subscribe((snap) => {
    useF08.setState({ workflowStage: f08StageName(snap.value) });
  });
}

export function tickF08Workflow() {
  const st = useF08.getState();
  if (!st.runtime || !actor || st.screen !== 'lab') return;
  actor.send({ type: 'EVIDENCE', flags: f08StageEvidence(st.runtime.world, st.notebook) });
}

/** Bucles de fondo de la F08 (solo mientras esta práctica está abierta). */
export function startF08Loops(): () => void {
  const a = setInterval(() => {
    const st = useF08.getState();
    if (st.screen === 'lab') st.bump();
  }, 200);
  const b = setInterval(tickF08Workflow, 1000);
  const c = setInterval(() => {
    const st = useF08.getState();
    if (st.screen === 'lab' && st.ppeConfirmed && !st.demo) st.save();
  }, 5000);
  const onHide = () => {
    const st = useF08.getState();
    if (document.visibilityState === 'hidden' && st.runtime) {
      st.save();
      if (st.screen === 'lab') st.setPaused(true);
    }
  };
  const onUnload = () => useF08.getState().save();
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

export { loadF08Attempt, clearF08Attempt };

/** Ir a una estación. F (análisis y entrega) además abre la libreta en la pestaña de análisis. */
export function goToStationF08(id: string) {
  const s = useF08.getState();
  s.stage?.goToStation(id);
  if (s.demo || id !== 'F') return;
  useF08.setState({ notebookOpen: true, notebookTab: 'analysis' });
}
