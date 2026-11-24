/**
 * Estado compartido de F12 (Zustand): mismo patrón que las demás prácticas — el mundo es mutable dentro de
 * F12Runtime y React se re-renderiza con un contador `version` (≤ 5 Hz).
 */
import { create } from 'zustand';
import { createActor, type Actor } from 'xstate';
import type { SimEvent } from '../../simulation/f12-world/types';
import type { F12Command, F12DispatchResult, PpeItem } from '../../simulation/f12-world/commands';
import { newSeed } from '../../simulation/core/rng';
import { newPracticeF12World, type PracticeF12Options } from '../../practices/practice-f12';
import { sanitizeOnResumeF12 } from '../../practices/practice-f12/resume';
import type { F12Mode } from '../../practices/practice-f12/definition';
import type { F12Scenario } from '../../practices/practice-f12/error-scenarios';
import { emptyF12Notebook, type F12Notebook } from '../../practices/practice-f12/notebook';
import { practiceF12Machine, f12StageName } from '../../practices/practice-f12/workflow.machine';
import { f12StageEvidence } from '../../practices/practice-f12/evidence';
import { evaluateF12 } from '../../practices/practice-f12/rubric';
import type { Evaluation } from '../../simulation/scoring/types';
import type { F12Lab3D } from '../../engine/f12/F12Lab3D';
import type { QualitySetting } from '../../engine/quality';
import { F12Runtime } from './runtime';
import { clearF12Attempt, loadF12Attempt, saveF12Attempt, type SavedF12Attempt } from './persistence';
import { f12EventFeedback } from './feedback';
import { reportSubmission } from '../platform/report';
import { TapeRecorder } from '../platform/tape';

export interface F12Settings {
  mode: F12Mode;
  seed: number;
  scenarios: F12Scenario[];
  timeScale: number;
  uiScale: number;
  reducedMotion: boolean;
  captions: boolean;
  volume: number;
  showNames: boolean;
  quality: QualitySetting;
  /** Opción docente: Bernoulli ideal (sin pérdidas ni ruido) o realista (pérdidas, sensores y caudalímetro reales). */
  scientificMode: 'CURRICULAR' | 'REALISTIC';
  /** Lente de lectura abierta (instrumento cuya escala se amplía). */
  lens: string | null;
}

export interface F12Toast {
  id: number;
  level: 'info' | 'warn' | 'alert' | 'critical';
  text: string;
  at: number;
}

export interface F12DemoUi {
  index: number;
  total: number;
  key: string;
  part: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  note: string | null;
  done: boolean;
  speed: number;
}

const F12_DEMO_SEED = 20261118;

export type F12Modal = null | { kind: 'ppe' } | { kind: 'submit' } | { kind: 'settings' } | { kind: 'help' } | { kind: 'restored' };

interface F12State {
  screen: 'intro' | 'lab' | 'review';
  settings: F12Settings;
  runtime: F12Runtime | null;
  stage: F12Lab3D | null;
  attemptId: string;
  notebook: F12Notebook;
  ppeConfirmed: boolean;
  selected: string | null;
  held: string | null;
  toasts: F12Toast[];
  captions: F12Toast[];
  version: number;
  workflowStage: string;
  modal: F12Modal;
  paused: boolean;
  evaluation: Evaluation | null;
  submitted: boolean;
  notebookOpen: boolean;
  inventoryOpen: boolean;
  savedAt: number | null;
  notebookTab: string | null;
  demo: F12DemoUi | null;
  startDemo(): void;
  setDemo(p: Partial<F12DemoUi>): void;

  setSettings(p: Partial<F12Settings>): void;
  start(opts?: { sameSeed?: boolean }): void;
  resume(saved: SavedF12Attempt): void;
  confirmPpe(items: Record<PpeItem, boolean>): boolean;
  dispatch(cmd: F12Command): F12DispatchResult;
  select(id: string | null): void;
  setHeld(id: string | null): void;
  toast(level: F12Toast['level'], text: string): void;
  caption(text: string): void;
  dismissToast(id: number): void;
  setNotebook(fn: (nb: F12Notebook) => void, field?: string, from?: string, to?: string): void;
  setModal(m: F12Modal): void;
  setStage(s: F12Lab3D | null): void;
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

let actor: Actor<typeof practiceF12Machine> | null = null;
let toastSeq = 1;
let unsubEvents: (() => void) | null = null;

const DEFAULT_SETTINGS: F12Settings = {
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

const attemptIdFor = (seed: number) => `f12-${seed.toString(36)}-${Date.now().toString(36)}`;

/** Opciones de creación del mundo (también van en la cinta del intento). */
function optionsFor(s: F12Settings, seed: number, mode: F12Mode): PracticeF12Options {
  return { mode, seed, scenarios: s.scenarios, scientificMode: s.scientificMode };
}

function worldFor(s: F12Settings, seed: number, mode: F12Mode) {
  return newPracticeF12World(optionsFor(s, seed, mode));
}

export const useF12 = create<F12State>()((set, get) => ({
  screen: 'intro',
  settings: DEFAULT_SETTINGS,
  runtime: null,
  stage: null,
  attemptId: '',
  notebook: emptyF12Notebook(),
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
    const tape = TapeRecorder.start('f12', id, worldOpts);
    const rt = new F12Runtime(newPracticeF12World(worldOpts), id);
    rt.tape = tape;
    rt.timeScale = s.timeScale;
    bindRuntime(rt);
    actor?.stop();
    actor = createActor(practiceF12Machine);
    bindActor();
    actor.start();
    actor.send({ type: 'START' });
    set({
      screen: 'lab', settings: { ...s, seed }, runtime: rt, attemptId: id, notebook: emptyF12Notebook(), ppeConfirmed: false, selected: null, held: null,
      toasts: [], captions: [], evaluation: null, submitted: false, modal: { kind: 'ppe' }, paused: true, demo: null, notebookTab: null
    });
    rt.paused = true;
  },

  startDemo() {
    const s = get().settings;
    const world = worldFor({ ...DEFAULT_SETTINGS, scenarios: [] }, F12_DEMO_SEED, 'PRACTICE');
    const rt = new F12Runtime(world, 'demo');
    rt.timeScale = 1;
    bindRuntime(rt);
    actor?.stop();
    actor = createActor(practiceF12Machine);
    bindActor();
    actor.start();
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) rt.dispatch({ type: 'equipPpe', item, on: true });
    rt.dispatch({ type: 'startWork' });
    set({
      screen: 'lab', settings: { ...s, mode: 'PRACTICE' }, runtime: rt, attemptId: 'demo', notebook: emptyF12Notebook(), ppeConfirmed: true,
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
    // Al restaurar: bomba apagada y rotor detenido, cronómetro parado, desviador al depósito. El tiempo no avanzó.
    sanitizeOnResumeF12(w);
    const rt = new F12Runtime(w, saved.attemptId, saved.actions);
    rt.tape = TapeRecorder.resume('f12', saved.attemptId, w.tick, saved);
    rt.timeScale = saved.settings.timeScale;
    rt.paused = true;
    bindRuntime(rt);
    actor?.stop();
    try {
      actor = createActor(practiceF12Machine, saved.workflow ? { snapshot: saved.workflow as never } : undefined);
    } catch {
      actor = createActor(practiceF12Machine);
    }
    bindActor();
    actor.start();
    set({
      screen: saved.submitted ? 'review' : 'lab', settings: { ...DEFAULT_SETTINGS, ...saved.settings }, runtime: rt, attemptId: saved.attemptId, notebook: saved.notebook,
      ppeConfirmed: saved.ppe, toasts: [], captions: [], paused: true, submitted: saved.submitted,
      modal: saved.submitted ? null : saved.ppe ? null : { kind: 'ppe' },
      evaluation: saved.submitted ? evaluateF12(w, saved.notebook) : null,
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
    const evaluation = evaluateF12(rt.world, get().notebook);
    set({ evaluation, submitted: true, screen: 'review', modal: null, paused: true });
    get().save();
    // Estudiantes: la entrega queda registrada en su curso (plataforma).
    void reportSubmission('f12', {
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
    clearF12Attempt();
    set({ screen: 'intro', modal: null, demo: null, runtime: null, paused: true });
  },

  save() {
    const s = get();
    if (s.demo) return;
    const rt = s.runtime;
    if (!rt) return;
    const ok = saveF12Attempt({
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

function bindRuntime(rt: F12Runtime) {
  unsubEvents?.();
  unsubEvents = rt.onEvents((evs: SimEvent[]) => {
    const st = useF12.getState();
    for (const e of evs) f12EventFeedback(e, st.settings.mode, st);
  });
}

function bindActor() {
  actor?.subscribe((snap) => {
    useF12.setState({ workflowStage: f12StageName(snap.value) });
  });
}

export function tickF12Workflow() {
  const st = useF12.getState();
  if (!st.runtime || !actor || st.screen !== 'lab') return;
  actor.send({ type: 'EVIDENCE', flags: f12StageEvidence(st.runtime.world, st.notebook) });
}

/** Bucles de fondo de la F12 (solo mientras esta práctica está abierta). */
export function startF12Loops(): () => void {
  const a = setInterval(() => {
    const st = useF12.getState();
    if (st.screen === 'lab') st.bump();
  }, 200);
  const b = setInterval(tickF12Workflow, 1000);
  const c = setInterval(() => {
    const st = useF12.getState();
    if (st.screen === 'lab' && st.ppeConfirmed && !st.demo) st.save();
  }, 5000);
  const onHide = () => {
    const st = useF12.getState();
    if (document.visibilityState === 'hidden' && st.runtime) {
      st.save();
      if (st.screen === 'lab') st.setPaused(true);
    }
  };
  const onUnload = () => useF12.getState().save();
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

export { loadF12Attempt, clearF12Attempt };

/** Ir a una estación. F (análisis y entrega) además abre la libreta en la pestaña de análisis. */
export function goToStationF12(id: string) {
  const s = useF12.getState();
  s.stage?.goToStation(id);
  if (s.demo || id !== 'F') return;
  useF12.setState({ notebookOpen: true, notebookTab: 'analysis' });
}
