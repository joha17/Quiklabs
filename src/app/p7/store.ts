/**
 * Estado compartido de la Práctica 7 (Zustand): mismo patrón que las demás prácticas — el mundo es mutable dentro
 * de BondingRuntime y React se re-renderiza con un contador `version` (≤ 5 Hz).
 */
import { create } from 'zustand';
import { createActor, type Actor } from 'xstate';
import type { SimEvent } from '../../simulation/bonding-world/types';
import type { P07Command, P07DispatchResult } from '../../simulation/bonding-world/commands';
import { newSeed } from '../../simulation/core/rng';
import { newPractice07World, type Practice07Options } from '../../practices/practice-07';
import { sanitizeOnResume07 } from '../../practices/practice-07/resume';
import type { P07Mode } from '../../practices/practice-07/definition';
import type { P07Scenario } from '../../practices/practice-07/error-scenarios';
import { emptyP07Notebook, type P07Notebook } from '../../practices/practice-07/notebook';
import { practice07Machine, p07StageName } from '../../practices/practice-07/workflow.machine';
import { p07StageEvidence } from '../../practices/practice-07/evidence';
import { evaluateP07 } from '../../practices/practice-07/rubric';
import type { GloveType, PpeItem } from '../../simulation/bonding-world/commands';
import type { Evaluation } from '../../simulation/scoring/types';
import type { BondingLab3D } from '../../engine/bonding/BondingLab3D';
import type { QualitySetting } from '../../engine/quality';
import { BondingRuntime } from './runtime';
import { clearP07Attempt, loadP07Attempt, saveP07Attempt, type SavedP07Attempt } from './persistence';
import { p07EventFeedback } from './feedback';
import { reportSubmission } from '../platform/report';
import { TapeRecorder } from '../platform/tape';

export interface P07Settings {
  mode: P07Mode;
  seed: number;
  scenarios: P07Scenario[];
  timeScale: number;
  uiScale: number;
  reducedMotion: boolean;
  captions: boolean;
  volume: number;
  showNames: boolean;
  quality: QualitySetting;
  /** Opciones docentes (§7.3): permitir la muestra restringida (NaOH) en un escenario controlado. */
  allowRestricted: boolean;
}

export interface P07Toast {
  id: number;
  level: 'info' | 'warn' | 'alert' | 'critical';
  text: string;
  at: number;
}

export interface P07DemoUi {
  index: number;
  total: number;
  key: string;
  part: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  note: string | null;
  done: boolean;
  speed: number;
}

const P07_DEMO_SEED = 20261007;

export type P07Modal = null | { kind: 'ppe' } | { kind: 'submit' } | { kind: 'settings' } | { kind: 'help' } | { kind: 'restored' };

interface P07State {
  screen: 'intro' | 'lab' | 'review';
  settings: P07Settings;
  runtime: BondingRuntime | null;
  stage: BondingLab3D | null;
  attemptId: string;
  notebook: P07Notebook;
  ppeConfirmed: boolean;
  selected: string | null;
  held: string | null;
  toasts: P07Toast[];
  captions: P07Toast[];
  version: number;
  workflowStage: string;
  modal: P07Modal;
  paused: boolean;
  evaluation: Evaluation | null;
  submitted: boolean;
  notebookOpen: boolean;
  inventoryOpen: boolean;
  savedAt: number | null;
  notebookTab: string | null;
  demo: P07DemoUi | null;
  startDemo(): void;
  setDemo(p: Partial<P07DemoUi>): void;

  setSettings(p: Partial<P07Settings>): void;
  start(opts?: { sameSeed?: boolean }): void;
  resume(saved: SavedP07Attempt): void;
  confirmPpe(items: Record<PpeItem, boolean> & { gloves: GloveType }): boolean;
  dispatch(cmd: P07Command): P07DispatchResult;
  select(id: string | null): void;
  setHeld(id: string | null): void;
  toast(level: P07Toast['level'], text: string): void;
  caption(text: string): void;
  dismissToast(id: number): void;
  setNotebook(fn: (nb: P07Notebook) => void, field?: string, from?: string, to?: string): void;
  setModal(m: P07Modal): void;
  setStage(s: BondingLab3D | null): void;
  bump(): void;
  setPaused(p: boolean): void;
  submit(): void;
  backToIntro(): void;
  save(): void;
  toggleNotebook(): void;
  toggleInventory(): void;
}

let actor: Actor<typeof practice07Machine> | null = null;
let toastSeq = 1;
let unsubEvents: (() => void) | null = null;

const DEFAULT_SETTINGS: P07Settings = {
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
  allowRestricted: false,
};

const attemptIdFor = (seed: number) => `p7-${seed.toString(36)}-${Date.now().toString(36)}`;

/** Opciones de creación del mundo (también van en la cinta del intento). */
function optionsFor(s: P07Settings, seed: number, mode: P07Mode): Practice07Options {
  return { mode, seed, scenarios: s.scenarios, params: { allowRestricted: mode === 'DEBUG' && s.allowRestricted } };
}

function worldFor(s: P07Settings, seed: number, mode: P07Mode) {
  return newPractice07World(optionsFor(s, seed, mode));
}

export const useP07 = create<P07State>()((set, get) => ({
  screen: 'intro',
  settings: DEFAULT_SETTINGS,
  runtime: null,
  stage: null,
  attemptId: '',
  notebook: emptyP07Notebook(),
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
    const tape = TapeRecorder.start('p7', id, worldOpts);
    const rt = new BondingRuntime(newPractice07World(worldOpts), id);
    rt.tape = tape;
    rt.timeScale = s.timeScale;
    bindRuntime(rt);
    actor?.stop();
    actor = createActor(practice07Machine);
    bindActor();
    actor.start();
    actor.send({ type: 'START' });
    set({
      screen: 'lab', settings: { ...s, seed }, runtime: rt, attemptId: id, notebook: emptyP07Notebook(), ppeConfirmed: false, selected: null, held: null,
      toasts: [], captions: [], evaluation: null, submitted: false, modal: { kind: 'ppe' }, paused: true, demo: null, notebookTab: null
    });
    rt.paused = true;
  },

  startDemo() {
    const s = get().settings;
    const world = worldFor({ ...DEFAULT_SETTINGS, scenarios: [] }, P07_DEMO_SEED, 'PRACTICE');
    const rt = new BondingRuntime(world, 'demo');
    rt.timeScale = 1;
    bindRuntime(rt);
    actor?.stop();
    actor = createActor(practice07Machine);
    bindActor();
    actor.start();
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    for (const item of ['coat', 'goggles', 'shoes'] as const) rt.dispatch({ type: 'setPPE', item, enabled: true });
    rt.dispatch({ type: 'setGloves', gloves: 'nitrile' });
    rt.dispatch({ type: 'startWork' });
    set({
      screen: 'lab', settings: { ...s, mode: 'PRACTICE' }, runtime: rt, attemptId: 'demo', notebook: emptyP07Notebook(), ppeConfirmed: true,
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
    sanitizeOnResume07(w);
    const rt = new BondingRuntime(w, saved.attemptId, saved.actions);
    rt.tape = TapeRecorder.resume('p7', saved.attemptId, w.tick, saved);
    rt.timeScale = saved.settings.timeScale;
    rt.paused = true;
    bindRuntime(rt);
    actor?.stop();
    try {
      actor = createActor(practice07Machine, saved.workflow ? { snapshot: saved.workflow as never } : undefined);
    } catch {
      actor = createActor(practice07Machine);
    }
    bindActor();
    actor.start();
    set({
      screen: saved.submitted ? 'review' : 'lab', settings: { ...DEFAULT_SETTINGS, ...saved.settings }, runtime: rt, attemptId: saved.attemptId, notebook: saved.notebook,
      ppeConfirmed: saved.ppe, toasts: [], captions: [], paused: true, submitted: saved.submitted,
      modal: saved.submitted ? null : saved.ppe ? null : { kind: 'ppe' },
      evaluation: saved.submitted ? evaluateP07(w, saved.notebook) : null,
    });
  },

  confirmPpe(items) {
    const rt = get().runtime;
    if (!rt) return false;
    // El equipo elegido va al dominio; empezar sin algo de él se rechaza y queda registrado (L01–L03).
    for (const k of ['coat', 'goggles', 'shoes'] as PpeItem[]) rt.dispatch({ type: 'setPPE', item: k, enabled: !!items[k] });
    rt.dispatch({ type: 'setGloves', gloves: items.gloves });
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
    const evaluation = evaluateP07(rt.world, get().notebook);
    set({ evaluation, submitted: true, screen: 'review', modal: null, paused: true });
    get().save();
    // Estudiantes: la entrega queda registrada en su curso (plataforma).
    void reportSubmission('p7', {
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
    const ok = saveP07Attempt({
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

function bindRuntime(rt: BondingRuntime) {
  unsubEvents?.();
  unsubEvents = rt.onEvents((evs: SimEvent[]) => {
    const st = useP07.getState();
    for (const e of evs) p07EventFeedback(rt.world, e, st.settings.mode, st);
  });
}

function bindActor() {
  actor?.subscribe((snap) => {
    useP07.setState({ workflowStage: p07StageName(snap.value) });
  });
}

export function tickP07Workflow() {
  const st = useP07.getState();
  if (!st.runtime || !actor || st.screen !== 'lab') return;
  actor.send({ type: 'EVIDENCE', flags: p07StageEvidence(st.runtime.world, st.notebook) });
}

/** Bucles de fondo de la Práctica 7 (solo mientras esta práctica está abierta). */
export function startP07Loops(): () => void {
  const a = setInterval(() => {
    const st = useP07.getState();
    if (st.screen === 'lab') st.bump();
  }, 200);
  const b = setInterval(tickP07Workflow, 1000);
  const c = setInterval(() => {
    const st = useP07.getState();
    if (st.screen === 'lab' && st.ppeConfirmed && !st.demo) st.save();
  }, 5000);
  const onHide = () => {
    const st = useP07.getState();
    if (document.visibilityState === 'hidden' && st.runtime) {
      st.save();
      if (st.screen === 'lab') st.setPaused(true);
    }
  };
  const onUnload = () => useP07.getState().save();
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

export { loadP07Attempt, clearP07Attempt };

/**
 * Ir a una estación. E (libreta y comparación) y F (revisión y entrega) no tienen objetos en la mesada (§4): además de
 * mover la cámara, abren la libreta en la pestaña de trabajo correspondiente.
 */
export function goToStation07(id: string) {
  const s = useP07.getState();
  s.stage?.goToStation(id);
  // F (integración y entrega) no tiene objetos en la mesada (§4.3): abre la libreta en la matriz de interpretación.
  if (s.demo || id !== 'F') return;
  useP07.setState({ notebookOpen: true, notebookTab: 'F' });
}
