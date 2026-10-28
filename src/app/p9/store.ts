/**
 * Estado compartido de la Práctica 9 (Zustand): mismo patrón que las demás prácticas — el mundo es mutable dentro
 * de CationRuntime y React se re-renderiza con un contador `version` (≤ 5 Hz). La composición de la muestra sale de la
 * semilla y de los escenarios elegidos en la intro y queda fija en el intento.
 */
import { create } from 'zustand';
import { createActor, type Actor } from 'xstate';
import type { SimEvent } from '../../simulation/cation-analysis-world/types';
import type { P09Command, P09DispatchResult } from '../../simulation/cation-analysis-world/commands';
import { newSeed } from '../../simulation/core/rng';
import { newPractice09World, type Practice09Options } from '../../practices/practice-09';
import { sanitizeOnResume09 } from '../../practices/practice-09/resume';
import type { P09Mode } from '../../practices/practice-09/definition';
import type { P09Scenario } from '../../practices/practice-09/error-scenarios';
import { emptyP09Notebook, type P09Notebook } from '../../practices/practice-09/notebook';
import { practice09Machine, p09StageName } from '../../practices/practice-09/workflow.machine';
import { p09StageEvidence } from '../../practices/practice-09/evidence';
import { evaluateP09 } from '../../practices/practice-09/rubric';
import type { PpeItem09 } from '../../simulation/cation-analysis-world/commands';
import type { Evaluation } from '../../simulation/scoring/types';
import type { CationLab3D } from '../../engine/cations/CationLab3D';
import type { QualitySetting } from '../../engine/quality';
import { CationRuntime } from './runtime';
import { clearP09Attempt, loadP09Attempt, saveP09Attempt, type SavedP09Attempt } from './persistence';
import { p09EventFeedback } from './feedback';
import { reportSubmission } from '../platform/report';
import { TapeRecorder } from '../platform/tape';

export interface P09Settings {
  mode: P09Mode;
  seed: number;
  scenarios: P09Scenario[];
  timeScale: number;
  uiScale: number;
  reducedMotion: boolean;
  captions: boolean;
  volume: number;
  showNames: boolean;
  quality: QualitySetting;
}

export interface P09Toast {
  id: number;
  level: 'info' | 'warn' | 'alert' | 'critical';
  text: string;
  at: number;
}

export interface P09DemoUi {
  index: number;
  total: number;
  key: string;
  part: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  note: string | null;
  done: boolean;
  speed: number;
}

const P09_DEMO_SEED = 20261020;

export type P09Modal = null | { kind: 'ppe' } | { kind: 'submit' } | { kind: 'settings' } | { kind: 'help' } | { kind: 'restored' };

interface P09State {
  screen: 'intro' | 'lab' | 'review';
  settings: P09Settings;
  runtime: CationRuntime | null;
  stage: CationLab3D | null;
  attemptId: string;
  notebook: P09Notebook;
  ppeConfirmed: boolean;
  selected: string | null;
  held: string | null;
  toasts: P09Toast[];
  captions: P09Toast[];
  version: number;
  workflowStage: string;
  modal: P09Modal;
  paused: boolean;
  evaluation: Evaluation | null;
  submitted: boolean;
  notebookOpen: boolean;
  inventoryOpen: boolean;
  savedAt: number | null;
  notebookTab: string | null;
  demo: P09DemoUi | null;
  startDemo(): void;
  setDemo(p: Partial<P09DemoUi>): void;

  setSettings(p: Partial<P09Settings>): void;
  start(opts?: { sameSeed?: boolean }): void;
  resume(saved: SavedP09Attempt): void;
  confirmPpe(items: Record<PpeItem09, boolean>): boolean;
  dispatch(cmd: P09Command): P09DispatchResult;
  select(id: string | null): void;
  setHeld(id: string | null): void;
  toast(level: P09Toast['level'], text: string): void;
  caption(text: string): void;
  dismissToast(id: number): void;
  setNotebook(fn: (nb: P09Notebook) => void, field?: string, from?: string, to?: string): void;
  setModal(m: P09Modal): void;
  setStage(s: CationLab3D | null): void;
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

let actor: Actor<typeof practice09Machine> | null = null;
let toastSeq = 1;
let unsubEvents: (() => void) | null = null;

const DEFAULT_SETTINGS: P09Settings = {
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
};

const attemptIdFor = (seed: number) => `p9-${seed.toString(36)}-${Date.now().toString(36)}`;

/** Opciones de creación del mundo (también van en la cinta del intento). */
function optionsFor(s: P09Settings, seed: number, mode: P09Mode): Practice09Options {
  return { mode, seed, scenarios: s.scenarios };
}

function worldFor(s: P09Settings, seed: number, mode: P09Mode) {
  return newPractice09World(optionsFor(s, seed, mode));
}

export const useP09 = create<P09State>()((set, get) => ({
  screen: 'intro',
  settings: DEFAULT_SETTINGS,
  runtime: null,
  stage: null,
  attemptId: '',
  notebook: emptyP09Notebook(),
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
    const tape = TapeRecorder.start('p9', id, worldOpts);
    const rt = new CationRuntime(newPractice09World(worldOpts), id);
    rt.tape = tape;
    rt.timeScale = s.timeScale;
    bindRuntime(rt);
    actor?.stop();
    actor = createActor(practice09Machine);
    bindActor();
    actor.start();
    actor.send({ type: 'START' });
    set({
      screen: 'lab', settings: { ...s, seed }, runtime: rt, attemptId: id, notebook: emptyP09Notebook(id), ppeConfirmed: false, selected: null, held: null,
      toasts: [], captions: [], evaluation: null, submitted: false, modal: { kind: 'ppe' }, paused: true, demo: null, notebookTab: null
    });
    rt.paused = true;
  },

  startDemo() {
    const s = get().settings;
    const world = worldFor({ ...DEFAULT_SETTINGS, scenarios: [] }, P09_DEMO_SEED, 'PRACTICE');
    const rt = new CationRuntime(world, 'demo');
    rt.timeScale = 1;
    bindRuntime(rt);
    actor?.stop();
    actor = createActor(practice09Machine);
    bindActor();
    actor.start();
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    for (const item of ['goggles', 'coat', 'gloves'] as const) rt.dispatch({ type: 'setPPE', item, enabled: true });
    rt.dispatch({ type: 'startWork' });
    set({
      screen: 'lab', settings: { ...s, mode: 'PRACTICE' }, runtime: rt, attemptId: 'demo', notebook: emptyP09Notebook('demo'), ppeConfirmed: true,
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
    // Al restaurar: llama apagada, vertidos, pipeta y agitación detenidos, rotor parado. El tiempo no avanzó.
    sanitizeOnResume09(w);
    const rt = new CationRuntime(w, saved.attemptId, saved.actions);
    rt.tape = TapeRecorder.resume('p9', saved.attemptId, w.tick, saved);
    rt.timeScale = saved.settings.timeScale;
    rt.paused = true;
    bindRuntime(rt);
    actor?.stop();
    try {
      actor = createActor(practice09Machine, saved.workflow ? { snapshot: saved.workflow as never } : undefined);
    } catch {
      actor = createActor(practice09Machine);
    }
    bindActor();
    actor.start();
    set({
      screen: saved.submitted ? 'review' : 'lab', settings: { ...DEFAULT_SETTINGS, ...saved.settings }, runtime: rt, attemptId: saved.attemptId, notebook: saved.notebook,
      ppeConfirmed: saved.ppe, toasts: [], captions: [], paused: true, submitted: saved.submitted,
      modal: saved.submitted ? null : saved.ppe ? null : { kind: 'ppe' },
      evaluation: saved.submitted ? evaluateP09(w, saved.notebook) : null,
    });
  },

  confirmPpe(items) {
    const rt = get().runtime;
    if (!rt) return false;
    // El equipo elegido va al dominio; empezar sin algo de él se rechaza y queda registrado (E01).
    for (const k of ['goggles', 'coat', 'gloves'] as PpeItem09[]) rt.dispatch({ type: 'setPPE', item: k, enabled: !!items[k] });
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
    const evaluation = evaluateP09(rt.world, get().notebook);
    set({ evaluation, submitted: true, screen: 'review', modal: null, paused: true });
    get().save();
    // Estudiantes: la entrega queda registrada en su curso (plataforma).
    void reportSubmission('p9', {
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
    clearP09Attempt();
    set({ screen: 'intro', modal: null, demo: null, runtime: null, paused: true });
  },

  save() {
    const s = get();
    if (s.demo) return;
    const rt = s.runtime;
    if (!rt) return;
    const ok = saveP09Attempt({
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

function bindRuntime(rt: CationRuntime) {
  unsubEvents?.();
  unsubEvents = rt.onEvents((evs: SimEvent[]) => {
    const st = useP09.getState();
    for (const e of evs) p09EventFeedback(rt.world, e, st.settings.mode, st);
  });
}

function bindActor() {
  actor?.subscribe((snap) => {
    useP09.setState({ workflowStage: p09StageName(snap.value) });
  });
}

export function tickP09Workflow() {
  const st = useP09.getState();
  if (!st.runtime || !actor || st.screen !== 'lab') return;
  actor.send({ type: 'EVIDENCE', flags: p09StageEvidence(st.runtime.world, st.notebook) });
}

/** Bucles de fondo de la Práctica 9 (solo mientras esta práctica está abierta). */
export function startP09Loops(): () => void {
  const a = setInterval(() => {
    const st = useP09.getState();
    if (st.screen === 'lab') st.bump();
  }, 200);
  const b = setInterval(tickP09Workflow, 1000);
  const c = setInterval(() => {
    const st = useP09.getState();
    if (st.screen === 'lab' && st.ppeConfirmed && !st.demo) st.save();
  }, 5000);
  const onHide = () => {
    const st = useP09.getState();
    if (document.visibilityState === 'hidden' && st.runtime) {
      st.save();
      if (st.screen === 'lab') st.setPaused(true);
    }
  };
  const onUnload = () => useP09.getState().save();
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

export { loadP09Attempt, clearP09Attempt };

/**
 * Ir a una estación (§2.1).
 */
export function goToStation09(id: string) {
  const s = useP09.getState();
  s.stage?.goToStation(id);
  // F (auditoría) se trabaja en la libreta: además de mover la cámara, la abre en el cuadro F.
  if (s.demo || id !== 'F') return;
  useP09.setState({ notebookOpen: true, notebookTab: 'F' });
}
