/**
 * Estado compartido de la práctica B03 (Zustand): mismo patrón que las demás prácticas — el mundo es mutable dentro
 * de OpticalRuntime y React se re-renderiza con un contador `version` (≤ 5 Hz). La asignación de muestras y activos
 * (manifiestos versionados) y los escenarios se fijan en la intro y quedan congelados en el intento.
 */
import { create } from 'zustand';
import { createActor, type Actor } from 'xstate';
import type { SimEvent } from '../../simulation/optical-world/types';
import type { PermCommand, PermDispatchResult } from '../../simulation/perm-world/commands';
import { newSeed } from '../../simulation/core/rng';
import { newPracticeB03World, type PracticeB03Options } from '../../practices/practice-b03';
import { sanitizeOnResumeB03 } from '../../practices/practice-b03/resume';
import type { B03Mode } from '../../practices/practice-b03/definition';
import type { B03Scenario } from '../../practices/practice-b03/error-scenarios';
import { emptyB03Notebook, type B03Notebook } from '../../practices/practice-b03/notebook';
import { practiceB03Machine, b03StageName } from '../../practices/practice-b03/workflow.machine';
import { b03StageEvidence } from '../../practices/practice-b03/evidence';
import { evaluateB03 } from '../../practices/practice-b03/rubric';
import type { PpeItemB01 } from '../../simulation/optical-world/types';
import type { Evaluation } from '../../simulation/scoring/types';
import type { OpticalLab3D } from '../../engine/optical/OpticalLab3D';
import type { QualitySetting } from '../../engine/quality';
import { OpticalRuntime } from '../b01/runtime';
import type { PermWorld } from '../../simulation/perm-world/types';
import { PERM_SIM } from './sim';
import { clearB03Attempt, loadB03Attempt, saveB03Attempt, type SavedB03Attempt } from './persistence';
import { b03EventFeedback } from './feedback';
import { reportSubmission } from '../platform/report';
import { TapeRecorder } from '../platform/tape';
import { t } from '../i18n';

export interface B03Settings {
  mode: B03Mode;
  seed: number;
  scenarios: B03Scenario[];
  timeScale: number;
  uiScale: number;
  reducedMotion: boolean;
  captions: boolean;
  volume: number;
  showNames: boolean;
  quality: QualitySetting;
}

export interface B03Toast {
  id: number;
  level: 'info' | 'warn' | 'alert' | 'critical';
  text: string;
  at: number;
}

export interface B03DemoUi {
  index: number;
  total: number;
  key: string;
  part: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  note: string | null;
  done: boolean;
  speed: number;
}

const B03_DEMO_SEED = 20261020;

export type B03Modal = null | { kind: 'ppe' } | { kind: 'submit' } | { kind: 'settings' } | { kind: 'help' } | { kind: 'restored' };

interface B03State {
  screen: 'intro' | 'lab' | 'review';
  settings: B03Settings;
  runtime: OpticalRuntime<PermWorld> | null;
  stage: OpticalLab3D | null;
  attemptId: string;
  notebook: B03Notebook;
  ppeConfirmed: boolean;
  selected: string | null;
  held: string | null;
  toasts: B03Toast[];
  captions: B03Toast[];
  version: number;
  workflowStage: string;
  modal: B03Modal;
  paused: boolean;
  evaluation: Evaluation | null;
  submitted: boolean;
  notebookOpen: boolean;
  inventoryOpen: boolean;
  savedAt: number | null;
  notebookTab: string | null;
  demo: B03DemoUi | null;
  startDemo(): void;
  setDemo(p: Partial<B03DemoUi>): void;

  setSettings(p: Partial<B03Settings>): void;
  start(opts?: { sameSeed?: boolean }): void;
  resume(saved: SavedB03Attempt): void;
  confirmPpe(items: Partial<Record<PpeItemB01, boolean>>): boolean;
  dispatch(cmd: PermCommand): PermDispatchResult;
  select(id: string | null): void;
  setHeld(id: string | null): void;
  toast(level: B03Toast['level'], text: string): void;
  caption(text: string): void;
  dismissToast(id: number): void;
  setNotebook(fn: (nb: B03Notebook) => void, field?: string, from?: string, to?: string): void;
  setModal(m: B03Modal): void;
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

let actor: Actor<typeof practiceB03Machine> | null = null;
let toastSeq = 1;
let unsubEvents: (() => void) | null = null;

const DEFAULT_SETTINGS: B03Settings = {
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
};

const attemptIdFor = (seed: number) => `b03-${seed.toString(36)}-${Date.now().toString(36)}`;

/** Opciones de creación del mundo (también van en la cinta del intento). */
function optionsFor(s: B03Settings, seed: number, mode: B03Mode): PracticeB03Options {
  return { mode, seed, scenarios: s.scenarios };
}

function worldFor(s: B03Settings, seed: number, mode: B03Mode) {
  return newPracticeB03World(optionsFor(s, seed, mode));
}

export const useB03 = create<B03State>()((set, get) => ({
  screen: 'intro',
  settings: DEFAULT_SETTINGS,
  runtime: null,
  stage: null,
  attemptId: '',
  notebook: emptyB03Notebook(),
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
    const rt = get().runtime;
    // Acelerar el tiempo es un pedido al dominio: se bloquea mientras se vierte, se aspira o se lleva una hoja (PERM18).
    if (rt && p.timeScale !== undefined && p.timeScale > 1) {
      const r = rt.dispatch({ type: 'requestTimeScale', x: p.timeScale });
      set({ version: get().version + 1 });
      if (!r.ok) {
        get().toast('warn', t('b03.cmd.TIME_LOCKED'));
        p = { ...p };
        delete p.timeScale;
      }
    }
    set({ settings: { ...get().settings, ...p } });
    if (rt && p.timeScale !== undefined) rt.timeScale = p.timeScale;
    if (p.volume !== undefined) get().stage?.audio.setVolume(p.volume);
  },

  start(opts) {
    const s = get().settings;
    const seed = opts?.sameSeed ? s.seed : s.seed || newSeed();
    const id = attemptIdFor(seed);
    const worldOpts = optionsFor(s, seed, s.mode);
    const tape = TapeRecorder.start('b03', id, worldOpts);
    const rt = new OpticalRuntime(newPracticeB03World(worldOpts), id, [], PERM_SIM);
    rt.tape = tape;
    rt.timeScale = s.timeScale;
    bindRuntime(rt);
    actor?.stop();
    actor = createActor(practiceB03Machine);
    bindActor();
    actor.start();
    actor.send({ type: 'START' });
    set({
      screen: 'lab', settings: { ...s, seed }, runtime: rt, attemptId: id, notebook: emptyB03Notebook(id), ppeConfirmed: false, selected: null, held: null,
      toasts: [], captions: [], evaluation: null, submitted: false, modal: { kind: 'ppe' }, paused: true, demo: null, notebookTab: null
    });
    rt.paused = true;
  },

  startDemo() {
    const s = get().settings;
    const world = worldFor({ ...DEFAULT_SETTINGS, scenarios: [] }, B03_DEMO_SEED, 'PRACTICE');
    const rt = new OpticalRuntime(world, 'demo', [], PERM_SIM);
    rt.timeScale = 1;
    bindRuntime(rt);
    actor?.stop();
    actor = createActor(practiceB03Machine);
    bindActor();
    actor.start();
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    for (const item of ['coat', 'shoes', 'hair', 'hands', 'gloves'] as const) rt.dispatch({ type: 'setPPE', item, enabled: true });
    rt.dispatch({ type: 'startWork' });
    set({
      screen: 'lab', settings: { ...s, mode: 'PRACTICE' }, runtime: rt, attemptId: 'demo', notebook: emptyB03Notebook('demo'), ppeConfirmed: true,
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
    sanitizeOnResumeB03(w);
    const rt = new OpticalRuntime(w, saved.attemptId, saved.actions, PERM_SIM);
    rt.tape = TapeRecorder.resume('b03', saved.attemptId, w.tick, saved);
    rt.timeScale = saved.settings.timeScale;
    rt.paused = true;
    bindRuntime(rt);
    actor?.stop();
    try {
      actor = createActor(practiceB03Machine, saved.workflow ? { snapshot: saved.workflow as never } : undefined);
    } catch {
      actor = createActor(practiceB03Machine);
    }
    bindActor();
    actor.start();
    set({
      screen: saved.submitted ? 'review' : 'lab', settings: { ...DEFAULT_SETTINGS, ...saved.settings }, runtime: rt, attemptId: saved.attemptId, notebook: saved.notebook,
      ppeConfirmed: saved.ppe, toasts: [], captions: [], paused: true, submitted: saved.submitted,
      modal: saved.submitted ? null : saved.ppe ? null : { kind: 'ppe' },
      evaluation: saved.submitted ? evaluateB03(w, saved.notebook) : null,
    });
  },

  confirmPpe(items) {
    const rt = get().runtime;
    if (!rt) return false;
    // El equipo elegido va al dominio; empezar sin algo de él se rechaza y queda registrado (E68).
    for (const k of ['coat', 'shoes', 'hair', 'hands', 'gloves'] as PpeItemB01[]) rt.dispatch({ type: 'setPPE', item: k, enabled: !!items[k] });
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
    const evaluation = evaluateB03(rt.world, get().notebook);
    set({ evaluation, submitted: true, screen: 'review', modal: null, paused: true });
    get().save();
    // Estudiantes: la entrega queda registrada en su curso (plataforma).
    void reportSubmission('b03', {
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
    clearB03Attempt();
    set({ screen: 'intro', modal: null, demo: null, runtime: null, paused: true });
  },

  save() {
    const s = get();
    if (s.demo) return;
    const rt = s.runtime;
    if (!rt) return;
    const ok = saveB03Attempt({
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

function bindRuntime(rt: OpticalRuntime<PermWorld>) {
  unsubEvents?.();
  unsubEvents = rt.onEvents((evs: SimEvent[]) => {
    const st = useB03.getState();
    for (const e of evs) b03EventFeedback(rt.world, e, st.settings.mode, st);
  });
}

function bindActor() {
  actor?.subscribe((snap) => {
    useB03.setState({ workflowStage: b03StageName(snap.value) });
  });
}

export function tickB03Workflow() {
  const st = useB03.getState();
  if (!st.runtime || !actor || st.screen !== 'lab') return;
  actor.send({ type: 'EVIDENCE', flags: b03StageEvidence(st.runtime.world, st.notebook) });
}

/** Bucles de fondo de la práctica B03 (solo mientras esta práctica está abierta). */
export function startB03Loops(): () => void {
  const a = setInterval(() => {
    const st = useB03.getState();
    if (st.screen === 'lab') st.bump();
  }, 200);
  const b = setInterval(tickB03Workflow, 1000);
  const c = setInterval(() => {
    const st = useB03.getState();
    if (st.screen === 'lab' && st.ppeConfirmed && !st.demo) st.save();
  }, 5000);
  const onHide = () => {
    const st = useB03.getState();
    if (document.visibilityState === 'hidden' && st.runtime) {
      st.save();
      if (st.screen === 'lab') st.setPaused(true);
    }
  };
  const onUnload = () => useB03.getState().save();
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

export { loadB03Attempt, clearB03Attempt };

/**
 * Ir a una estación (§2.1).
 */
export function goToStationB03(id: string) {
  const s = useB03.getState();
  s.stage?.goToStation(id);
  // F (cierre) se trabaja en la libreta: además de mover la cámara, la abre en el cuadro de incidentes y cierre.
  if (s.demo || id !== 'F') return;
  useB03.setState({ notebookOpen: true, notebookTab: 'close' });
}
