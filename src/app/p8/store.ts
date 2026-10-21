/**
 * Estado compartido de la Práctica 8 (Zustand): mismo patrón que las demás prácticas — el mundo es mutable dentro
 * de OrganicRuntime y React se re-renderiza con un contador `version` (≤ 5 Hz). La ruta (ISO, ASA, MS) se elige en
 * la intro y queda fija en el intento: cambiarla crea un intento nuevo (§17.2).
 */
import { create } from 'zustand';
import { createActor, type Actor } from 'xstate';
import type { SimEvent } from '../../simulation/organic-world/types';
import type { P08Command, P08DispatchResult } from '../../simulation/organic-world/commands';
import { newSeed } from '../../simulation/core/rng';
import { newPractice08World, type Practice08Options } from '../../practices/practice-08';
import { sanitizeOnResume08 } from '../../practices/practice-08/resume';
import type { P08Mode } from '../../practices/practice-08/definition';
import type { P08Scenario } from '../../practices/practice-08/error-scenarios';
import { emptyP08Notebook, type P08Notebook } from '../../practices/practice-08/notebook';
import { practice08Machine, p08StageName } from '../../practices/practice-08/workflow.machine';
import { p08StageEvidence } from '../../practices/practice-08/evidence';
import { evaluateP08 } from '../../practices/practice-08/rubric';
import type { PpeItem08 } from '../../simulation/organic-world/commands';
import type { RouteId } from '../../simulation/organic-world/types';
import type { Evaluation } from '../../simulation/scoring/types';
import type { OrganicLab3D } from '../../engine/organic/OrganicLab3D';
import type { QualitySetting } from '../../engine/quality';
import { OrganicRuntime } from './runtime';
import { clearP08Attempt, loadP08Attempt, saveP08Attempt, type SavedP08Attempt } from './persistence';
import { p08EventFeedback } from './feedback';
import { reportSubmission } from '../platform/report';
import { TapeRecorder } from '../platform/tape';

export interface P08Settings {
  mode: P08Mode;
  seed: number;
  scenarios: P08Scenario[];
  timeScale: number;
  uiScale: number;
  reducedMotion: boolean;
  captions: boolean;
  volume: number;
  showNames: boolean;
  quality: QualitySetting;
  /** Ruta del intento (§2.2–§2.4); `ISO` por defecto. */
  route: RouteId;
}

export interface P08Toast {
  id: number;
  level: 'info' | 'warn' | 'alert' | 'critical';
  text: string;
  at: number;
}

export interface P08DemoUi {
  index: number;
  total: number;
  key: string;
  part: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  note: string | null;
  done: boolean;
  speed: number;
}

const P08_DEMO_SEED = 20261008;

export type P08Modal = null | { kind: 'ppe' } | { kind: 'submit' } | { kind: 'settings' } | { kind: 'help' } | { kind: 'restored' };

interface P08State {
  screen: 'intro' | 'lab' | 'review';
  settings: P08Settings;
  runtime: OrganicRuntime | null;
  stage: OrganicLab3D | null;
  attemptId: string;
  notebook: P08Notebook;
  ppeConfirmed: boolean;
  selected: string | null;
  held: string | null;
  toasts: P08Toast[];
  captions: P08Toast[];
  version: number;
  workflowStage: string;
  modal: P08Modal;
  paused: boolean;
  evaluation: Evaluation | null;
  submitted: boolean;
  notebookOpen: boolean;
  inventoryOpen: boolean;
  savedAt: number | null;
  notebookTab: string | null;
  demo: P08DemoUi | null;
  startDemo(): void;
  setDemo(p: Partial<P08DemoUi>): void;

  setSettings(p: Partial<P08Settings>): void;
  start(opts?: { sameSeed?: boolean }): void;
  resume(saved: SavedP08Attempt): void;
  confirmPpe(items: Record<PpeItem08, boolean>): boolean;
  dispatch(cmd: P08Command): P08DispatchResult;
  select(id: string | null): void;
  setHeld(id: string | null): void;
  toast(level: P08Toast['level'], text: string): void;
  caption(text: string): void;
  dismissToast(id: number): void;
  setNotebook(fn: (nb: P08Notebook) => void, field?: string, from?: string, to?: string): void;
  setModal(m: P08Modal): void;
  setStage(s: OrganicLab3D | null): void;
  bump(): void;
  setPaused(p: boolean): void;
  submit(): void;
  backToIntro(): void;
  save(): void;
  toggleNotebook(): void;
  toggleInventory(): void;
}

let actor: Actor<typeof practice08Machine> | null = null;
let toastSeq = 1;
let unsubEvents: (() => void) | null = null;

const DEFAULT_SETTINGS: P08Settings = {
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
  route: 'ISO',
};

const attemptIdFor = (seed: number) => `p8-${seed.toString(36)}-${Date.now().toString(36)}`;

/** Opciones de creación del mundo (también van en la cinta del intento). */
function optionsFor(s: P08Settings, seed: number, mode: P08Mode): Practice08Options {
  return { mode, seed, route: s.route, scenarios: s.scenarios };
}

function worldFor(s: P08Settings, seed: number, mode: P08Mode) {
  return newPractice08World(optionsFor(s, seed, mode));
}

export const useP08 = create<P08State>()((set, get) => ({
  screen: 'intro',
  settings: DEFAULT_SETTINGS,
  runtime: null,
  stage: null,
  attemptId: '',
  notebook: emptyP08Notebook(),
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
    const tape = TapeRecorder.start('p8', id, worldOpts);
    const rt = new OrganicRuntime(newPractice08World(worldOpts), id);
    rt.tape = tape;
    rt.timeScale = s.timeScale;
    bindRuntime(rt);
    actor?.stop();
    actor = createActor(practice08Machine);
    bindActor();
    actor.start();
    actor.send({ type: 'ROUTE', route: s.route });
    actor.send({ type: 'START' });
    set({
      screen: 'lab', settings: { ...s, seed }, runtime: rt, attemptId: id, notebook: emptyP08Notebook(s.route, id), ppeConfirmed: false, selected: null, held: null,
      toasts: [], captions: [], evaluation: null, submitted: false, modal: { kind: 'ppe' }, paused: true, demo: null, notebookTab: null
    });
    rt.paused = true;
  },

  startDemo() {
    const s = get().settings;
    const world = worldFor({ ...DEFAULT_SETTINGS, route: s.route, scenarios: [] }, P08_DEMO_SEED, 'PRACTICE');
    const rt = new OrganicRuntime(world, 'demo');
    rt.timeScale = 1;
    bindRuntime(rt);
    actor?.stop();
    actor = createActor(practice08Machine);
    bindActor();
    actor.start();
    actor.send({ type: 'ROUTE', route: s.route });
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    for (const item of ['goggles', 'coat', 'gloves', 'hair'] as const) rt.dispatch({ type: 'setPPE', item, enabled: true });
    rt.dispatch({ type: 'startWork' });
    set({
      screen: 'lab', settings: { ...s, mode: 'PRACTICE' }, runtime: rt, attemptId: 'demo', notebook: emptyP08Notebook(s.route, 'demo'), ppeConfirmed: true,
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
    // Al restaurar: vertidos y goteros detenidos, circuito abierto, sonda fuera de medición. El tiempo no avanzó.
    sanitizeOnResume08(w);
    const rt = new OrganicRuntime(w, saved.attemptId, saved.actions);
    rt.tape = TapeRecorder.resume('p8', saved.attemptId, w.tick, saved);
    rt.timeScale = saved.settings.timeScale;
    rt.paused = true;
    bindRuntime(rt);
    actor?.stop();
    try {
      actor = createActor(practice08Machine, saved.workflow ? { snapshot: saved.workflow as never } : undefined);
    } catch {
      actor = createActor(practice08Machine);
    }
    bindActor();
    actor.start();
    set({
      screen: saved.submitted ? 'review' : 'lab', settings: { ...DEFAULT_SETTINGS, ...saved.settings, route: w.route }, runtime: rt, attemptId: saved.attemptId, notebook: saved.notebook,
      ppeConfirmed: saved.ppe, toasts: [], captions: [], paused: true, submitted: saved.submitted,
      modal: saved.submitted ? null : saved.ppe ? null : { kind: 'ppe' },
      evaluation: saved.submitted ? evaluateP08(w, saved.notebook) : null,
    });
  },

  confirmPpe(items) {
    const rt = get().runtime;
    if (!rt) return false;
    // El equipo elegido va al dominio; empezar sin algo de él se rechaza y queda registrado (ORG01, ORG02).
    for (const k of ['goggles', 'coat', 'gloves', 'hair'] as PpeItem08[]) rt.dispatch({ type: 'setPPE', item: k, enabled: !!items[k] });
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
    const evaluation = evaluateP08(rt.world, get().notebook);
    set({ evaluation, submitted: true, screen: 'review', modal: null, paused: true });
    get().save();
    // Estudiantes: la entrega queda registrada en su curso (plataforma).
    void reportSubmission('p8', {
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
    const ok = saveP08Attempt({
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

function bindRuntime(rt: OrganicRuntime) {
  unsubEvents?.();
  unsubEvents = rt.onEvents((evs: SimEvent[]) => {
    const st = useP08.getState();
    for (const e of evs) p08EventFeedback(rt.world, e, st.settings.mode, st);
  });
}

function bindActor() {
  actor?.subscribe((snap) => {
    useP08.setState({ workflowStage: p08StageName(snap.value) });
  });
}

export function tickP08Workflow() {
  const st = useP08.getState();
  if (!st.runtime || !actor || st.screen !== 'lab') return;
  actor.send({ type: 'EVIDENCE', flags: p08StageEvidence(st.runtime.world, st.notebook) });
}

/** Bucles de fondo de la Práctica 8 (solo mientras esta práctica está abierta). */
export function startP08Loops(): () => void {
  const a = setInterval(() => {
    const st = useP08.getState();
    if (st.screen === 'lab') st.bump();
  }, 200);
  const b = setInterval(tickP08Workflow, 1000);
  const c = setInterval(() => {
    const st = useP08.getState();
    if (st.screen === 'lab' && st.ppeConfirmed && !st.demo) st.save();
  }, 5000);
  const onHide = () => {
    const st = useP08.getState();
    if (document.visibilityState === 'hidden' && st.runtime) {
      st.save();
      if (st.screen === 'lab') st.setPaused(true);
    }
  };
  const onUnload = () => useP08.getState().save();
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

export { loadP08Attempt, clearP08Attempt };

/**
 * Ir a una estación (§2.1).
 */
export function goToStation08(id: string) {
  const s = useP08.getState();
  s.stage?.goToStation(id);
  // A (predicción) y F (informe) se trabajan en la libreta: además de mover la cámara, la abren en su cuadro.
  if (s.demo || (id !== 'F' && id !== 'A')) return;
  useP08.setState({ notebookOpen: true, notebookTab: id === 'A' ? 'A' : 'C' });
}
