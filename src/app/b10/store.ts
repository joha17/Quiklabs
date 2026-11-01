/**
 * Estado compartido de la práctica B10 (Zustand): mismo patrón que las demás prácticas — el mundo es mutable dentro
 * de OpticalRuntime y React se re-renderiza con un contador `version` (≤ 5 Hz). La asignación de muestras y activos
 * (manifiestos versionados) y los escenarios se fijan en la intro y quedan congelados en el intento.
 */
import { create } from 'zustand';
import { createActor, type Actor } from 'xstate';
import type { SimEvent } from '../../simulation/optical-world/types';
import type { AnimalCommand } from '../../simulation/animal-world/commands';
import type { AnimalDispatchResult } from '../../simulation/animal-world/commands';
import { newSeed } from '../../simulation/core/rng';
import { newPracticeB10World, type PracticeB10Options } from '../../practices/practice-b10';
import { sanitizeOnResumeB10 } from '../../practices/practice-b10/resume';
import type { B10Mode } from '../../practices/practice-b10/definition';
import type { B10Scenario } from '../../practices/practice-b10/error-scenarios';
import { emptyB10Notebook, type B10Notebook } from '../../practices/practice-b10/notebook';
import { practiceB10Machine, b10StageName } from '../../practices/practice-b10/workflow.machine';
import { b10StageEvidence } from '../../practices/practice-b10/evidence';
import { evaluateB10 } from '../../practices/practice-b10/rubric';
import type { PpeItemB01 } from '../../simulation/optical-world/types';
import type { Evaluation } from '../../simulation/scoring/types';
import type { OpticalLab3D } from '../../engine/optical/OpticalLab3D';
import type { QualitySetting } from '../../engine/quality';
import { OpticalRuntime } from '../b01/runtime';
import type { AnimalWorld } from '../../simulation/animal-world/types';
import { ANIMAL_SIM } from './sim';
import { clearB10Attempt, loadB10Attempt, saveB10Attempt, type SavedB10Attempt } from './persistence';
import { b10EventFeedback } from './feedback';
import { reportSubmission } from '../platform/report';
import { TapeRecorder } from '../platform/tape';

export interface B10Settings {
  mode: B10Mode;
  seed: number;
  scenarios: B10Scenario[];
  timeScale: number;
  uiScale: number;
  reducedMotion: boolean;
  captions: boolean;
  volume: number;
  showNames: boolean;
  quality: QualitySetting;
}

export interface B10Toast {
  id: number;
  level: 'info' | 'warn' | 'alert' | 'critical';
  text: string;
  at: number;
}

export interface B10DemoUi {
  index: number;
  total: number;
  key: string;
  part: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  note: string | null;
  done: boolean;
  speed: number;
}

const B10_DEMO_SEED = 20261031;

export type B10Modal = null | { kind: 'ppe' } | { kind: 'submit' } | { kind: 'settings' } | { kind: 'help' } | { kind: 'restored' };

interface B10State {
  screen: 'intro' | 'lab' | 'review';
  settings: B10Settings;
  runtime: OpticalRuntime<AnimalWorld> | null;
  stage: OpticalLab3D | null;
  attemptId: string;
  notebook: B10Notebook;
  ppeConfirmed: boolean;
  selected: string | null;
  held: string | null;
  toasts: B10Toast[];
  captions: B10Toast[];
  version: number;
  workflowStage: string;
  modal: B10Modal;
  paused: boolean;
  evaluation: Evaluation | null;
  submitted: boolean;
  notebookOpen: boolean;
  inventoryOpen: boolean;
  savedAt: number | null;
  notebookTab: string | null;
  demo: B10DemoUi | null;
  startDemo(): void;
  setDemo(p: Partial<B10DemoUi>): void;

  setSettings(p: Partial<B10Settings>): void;
  start(opts?: { sameSeed?: boolean }): void;
  resume(saved: SavedB10Attempt): void;
  confirmPpe(items: Partial<Record<PpeItemB01, boolean>>): boolean;
  dispatch(cmd: AnimalCommand): AnimalDispatchResult;
  select(id: string | null): void;
  setHeld(id: string | null): void;
  toast(level: B10Toast['level'], text: string): void;
  caption(text: string): void;
  dismissToast(id: number): void;
  setNotebook(fn: (nb: B10Notebook) => void, field?: string, from?: string, to?: string): void;
  setModal(m: B10Modal): void;
  setStage(s: OpticalLab3D | null): void;
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

let actor: Actor<typeof practiceB10Machine> | null = null;
let toastSeq = 1;
let unsubEvents: (() => void) | null = null;

const DEFAULT_SETTINGS: B10Settings = {
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

const attemptIdFor = (seed: number) => `b10-${seed.toString(36)}-${Date.now().toString(36)}`;

/** Opciones de creación del mundo (también van en la cinta del intento). */
function optionsFor(s: B10Settings, seed: number, mode: B10Mode): PracticeB10Options {
  return { mode, seed, scenarios: s.scenarios };
}

function worldFor(s: B10Settings, seed: number, mode: B10Mode) {
  return newPracticeB10World(optionsFor(s, seed, mode));
}

export const useB10 = create<B10State>()((set, get) => ({
  screen: 'intro',
  settings: DEFAULT_SETTINGS,
  runtime: null,
  stage: null,
  attemptId: '',
  notebook: emptyB10Notebook(),
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
    const tape = TapeRecorder.start('b10', id, worldOpts);
    const rt = new OpticalRuntime(newPracticeB10World(worldOpts), id, [], ANIMAL_SIM);
    rt.tape = tape;
    rt.timeScale = s.timeScale;
    bindRuntime(rt);
    actor?.stop();
    actor = createActor(practiceB10Machine);
    bindActor();
    actor.start();
    actor.send({ type: 'START' });
    set({
      screen: 'lab', settings: { ...s, seed }, runtime: rt, attemptId: id, notebook: emptyB10Notebook(id), ppeConfirmed: false, selected: null, held: null,
      toasts: [], captions: [], evaluation: null, submitted: false, modal: { kind: 'ppe' }, paused: true, demo: null, notebookTab: null
    });
    rt.paused = true;
  },

  startDemo() {
    const s = get().settings;
    const world = worldFor({ ...DEFAULT_SETTINGS, scenarios: [] }, B10_DEMO_SEED, 'PRACTICE');
    const rt = new OpticalRuntime(world, 'demo', [], ANIMAL_SIM);
    rt.timeScale = 1;
    bindRuntime(rt);
    actor?.stop();
    actor = createActor(practiceB10Machine);
    bindActor();
    actor.start();
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    for (const item of ['coat', 'shoes', 'hair', 'hands', 'gloves', 'goggles'] as const) rt.dispatch({ type: 'setPPE', item, enabled: true });
    rt.dispatch({ type: 'startWork' });
    set({
      screen: 'lab', settings: { ...s, mode: 'PRACTICE' }, runtime: rt, attemptId: 'demo', notebook: emptyB10Notebook('demo'), ppeConfirmed: true,
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
    // Al restaurar: nada en la mano ni en la pinza, ocular cerrado; la platina y el objetivo no se mueven. El tiempo no avanzó.
    sanitizeOnResumeB10(w);
    const rt = new OpticalRuntime(w, saved.attemptId, saved.actions, ANIMAL_SIM);
    rt.tape = TapeRecorder.resume('b10', saved.attemptId, w.tick, saved);
    rt.timeScale = saved.settings.timeScale;
    rt.paused = true;
    bindRuntime(rt);
    actor?.stop();
    try {
      actor = createActor(practiceB10Machine, saved.workflow ? { snapshot: saved.workflow as never } : undefined);
    } catch {
      actor = createActor(practiceB10Machine);
    }
    bindActor();
    actor.start();
    set({
      screen: saved.submitted ? 'review' : 'lab', settings: { ...DEFAULT_SETTINGS, ...saved.settings }, runtime: rt, attemptId: saved.attemptId, notebook: saved.notebook,
      ppeConfirmed: saved.ppe, toasts: [], captions: [], paused: true, submitted: saved.submitted,
      modal: saved.submitted ? null : saved.ppe ? null : { kind: 'ppe' },
      evaluation: saved.submitted ? evaluateB10(w, saved.notebook) : null,
    });
  },

  confirmPpe(items) {
    const rt = get().runtime;
    if (!rt) return false;
    // El equipo elegido va al dominio; empezar sin algo de él se rechaza y queda registrado (E68).
    for (const k of ['coat', 'shoes', 'hair', 'hands', 'gloves', 'goggles'] as PpeItemB01[]) rt.dispatch({ type: 'setPPE', item: k, enabled: !!items[k] });
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
    const r = rt.dispatch(cmd as never);
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
    const evaluation = evaluateB10(rt.world, get().notebook);
    set({ evaluation, submitted: true, screen: 'review', modal: null, paused: true });
    get().save();
    // Estudiantes: la entrega queda registrada en su curso (plataforma).
    void reportSubmission('b10', {
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
    clearB10Attempt();
    set({ screen: 'intro', modal: null, demo: null, runtime: null, paused: true });
  },

  save() {
    const s = get();
    if (s.demo) return;
    const rt = s.runtime;
    if (!rt) return;
    const ok = saveB10Attempt({
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

function bindRuntime(rt: OpticalRuntime<AnimalWorld>) {
  unsubEvents?.();
  unsubEvents = rt.onEvents((evs: SimEvent[]) => {
    const st = useB10.getState();
    for (const e of evs) b10EventFeedback(rt.world, e, st.settings.mode, st);
  });
}

function bindActor() {
  actor?.subscribe((snap) => {
    useB10.setState({ workflowStage: b10StageName(snap.value) });
  });
}

export function tickB10Workflow() {
  const st = useB10.getState();
  if (!st.runtime || !actor || st.screen !== 'lab') return;
  actor.send({ type: 'EVIDENCE', flags: b10StageEvidence(st.runtime.world, st.notebook) });
}

/** Bucles de fondo de la práctica B10 (solo mientras esta práctica está abierta). */
export function startB10Loops(): () => void {
  const a = setInterval(() => {
    const st = useB10.getState();
    if (st.screen === 'lab') st.bump();
  }, 200);
  const b = setInterval(tickB10Workflow, 1000);
  const c = setInterval(() => {
    const st = useB10.getState();
    if (st.screen === 'lab' && st.ppeConfirmed && !st.demo) st.save();
  }, 5000);
  const onHide = () => {
    const st = useB10.getState();
    if (document.visibilityState === 'hidden' && st.runtime) {
      st.save();
      if (st.screen === 'lab') st.setPaused(true);
    }
  };
  const onUnload = () => useB10.getState().save();
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

export { loadB10Attempt, clearB10Attempt };

/**
 * Ir a una estación (§2.1).
 */
export function goToStationB10(id: string) {
  const s = useB10.getState();
  // Cambiar de estación es un hecho del mundo: con el bisturí en la mano es un error (CEL-004).
  if (s.runtime && !s.demo) s.dispatch({ type: 'goStation', station: id });
  s.stage?.goToStation(id);
  // F (cierre) se trabaja en la libreta: además de mover la cámara, la abre en el cuadro de incidentes y cierre.
  if (s.demo || id !== 'F') return;
  useB10.setState({ notebookOpen: true, notebookTab: 'close' });
}
