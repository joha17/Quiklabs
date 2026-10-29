/**
 * Estado compartido de la práctica B04 (Zustand): mismo patrón que las demás prácticas — el mundo es mutable dentro
 * de OpticalRuntime y React se re-renderiza con un contador `version` (≤ 5 Hz). La asignación de muestras y activos
 * (manifiestos versionados) y los escenarios se fijan en la intro y quedan congelados en el intento.
 */
import { create } from 'zustand';
import { createActor, type Actor } from 'xstate';
import type { SimEvent } from '../../simulation/optical-world/types';
import type { BioCommand, BioDispatchResult } from '../../simulation/bio-world/commands';
import { newSeed } from '../../simulation/core/rng';
import { newPracticeB04World, type PracticeB04Options } from '../../practices/practice-b04';
import { sanitizeOnResumeB04 } from '../../practices/practice-b04/resume';
import type { B04Mode } from '../../practices/practice-b04/definition';
import type { B04Scenario } from '../../practices/practice-b04/error-scenarios';
import { emptyB04Notebook, type B04Notebook } from '../../practices/practice-b04/notebook';
import { practiceB04Machine, b04StageName } from '../../practices/practice-b04/workflow.machine';
import { b04StageEvidence } from '../../practices/practice-b04/evidence';
import { evaluateB04 } from '../../practices/practice-b04/rubric';
import type { PpeItemB01 } from '../../simulation/optical-world/types';
import type { Evaluation } from '../../simulation/scoring/types';
import type { OpticalLab3D } from '../../engine/optical/OpticalLab3D';
import type { QualitySetting } from '../../engine/quality';
import { OpticalRuntime } from '../b01/runtime';
import type { BioWorld } from '../../simulation/bio-world/types';
import { BIO_SIM } from './sim';
import { clearB04Attempt, loadB04Attempt, saveB04Attempt, type SavedB04Attempt } from './persistence';
import { b04EventFeedback } from './feedback';
import { reportSubmission } from '../platform/report';
import { TapeRecorder } from '../platform/tape';
import { t } from '../i18n';

export interface B04Settings {
  mode: B04Mode;
  seed: number;
  scenarios: B04Scenario[];
  timeScale: number;
  uiScale: number;
  reducedMotion: boolean;
  captions: boolean;
  volume: number;
  showNames: boolean;
  quality: QualitySetting;
}

export interface B04Toast {
  id: number;
  level: 'info' | 'warn' | 'alert' | 'critical';
  text: string;
  at: number;
}

export interface B04DemoUi {
  index: number;
  total: number;
  key: string;
  part: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  note: string | null;
  done: boolean;
  speed: number;
}

const B04_DEMO_SEED = 20261028;

export type B04Modal = null | { kind: 'ppe' } | { kind: 'submit' } | { kind: 'settings' } | { kind: 'help' } | { kind: 'restored' };

interface B04State {
  screen: 'intro' | 'lab' | 'review';
  settings: B04Settings;
  runtime: OpticalRuntime<BioWorld> | null;
  stage: OpticalLab3D | null;
  attemptId: string;
  notebook: B04Notebook;
  ppeConfirmed: boolean;
  selected: string | null;
  held: string | null;
  toasts: B04Toast[];
  captions: B04Toast[];
  version: number;
  workflowStage: string;
  modal: B04Modal;
  paused: boolean;
  evaluation: Evaluation | null;
  submitted: boolean;
  notebookOpen: boolean;
  inventoryOpen: boolean;
  savedAt: number | null;
  notebookTab: string | null;
  demo: B04DemoUi | null;
  startDemo(): void;
  setDemo(p: Partial<B04DemoUi>): void;

  setSettings(p: Partial<B04Settings>): void;
  start(opts?: { sameSeed?: boolean }): void;
  resume(saved: SavedB04Attempt): void;
  confirmPpe(items: Partial<Record<PpeItemB01, boolean>>): boolean;
  dispatch(cmd: BioCommand): BioDispatchResult;
  select(id: string | null): void;
  setHeld(id: string | null): void;
  toast(level: B04Toast['level'], text: string): void;
  caption(text: string): void;
  dismissToast(id: number): void;
  setNotebook(fn: (nb: B04Notebook) => void, field?: string, from?: string, to?: string): void;
  setModal(m: B04Modal): void;
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

let actor: Actor<typeof practiceB04Machine> | null = null;
let toastSeq = 1;
let unsubEvents: (() => void) | null = null;

const DEFAULT_SETTINGS: B04Settings = {
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

const attemptIdFor = (seed: number) => `b04-${seed.toString(36)}-${Date.now().toString(36)}`;

/** Opciones de creación del mundo (también van en la cinta del intento). */
function optionsFor(s: B04Settings, seed: number, mode: B04Mode): PracticeB04Options {
  return { mode, seed, scenarios: s.scenarios };
}

function worldFor(s: B04Settings, seed: number, mode: B04Mode) {
  return newPracticeB04World(optionsFor(s, seed, mode));
}

export const useB04 = create<B04State>()((set, get) => ({
  screen: 'intro',
  settings: DEFAULT_SETTINGS,
  runtime: null,
  stage: null,
  attemptId: '',
  notebook: emptyB04Notebook(),
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
    // Acelerar el tiempo es un pedido al dominio: se bloquea mientras se vierte o la pipeta está cargada.
    if (rt && p.timeScale !== undefined && p.timeScale > 1) {
      const r = rt.dispatch({ type: 'requestTimeScale', x: p.timeScale });
      set({ version: get().version + 1 });
      if (!r.ok) {
        get().toast('warn', t('b04.cmd.TIME_LOCKED'));
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
    const tape = TapeRecorder.start('b04', id, worldOpts);
    const rt = new OpticalRuntime(newPracticeB04World(worldOpts), id, [], BIO_SIM);
    rt.tape = tape;
    rt.timeScale = s.timeScale;
    bindRuntime(rt);
    actor?.stop();
    actor = createActor(practiceB04Machine);
    bindActor();
    actor.start();
    actor.send({ type: 'START' });
    set({
      screen: 'lab', settings: { ...s, seed }, runtime: rt, attemptId: id, notebook: emptyB04Notebook(id), ppeConfirmed: false, selected: null, held: null,
      toasts: [], captions: [], evaluation: null, submitted: false, modal: { kind: 'ppe' }, paused: true, demo: null, notebookTab: null
    });
    rt.paused = true;
  },

  startDemo() {
    const s = get().settings;
    const world = worldFor({ ...DEFAULT_SETTINGS, scenarios: [] }, B04_DEMO_SEED, 'PRACTICE');
    const rt = new OpticalRuntime(world, 'demo', [], BIO_SIM);
    rt.timeScale = 1;
    bindRuntime(rt);
    actor?.stop();
    actor = createActor(practiceB04Machine);
    bindActor();
    actor.start();
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    for (const item of ['coat', 'shoes', 'hair', 'hands', 'gloves', 'goggles'] as const) rt.dispatch({ type: 'setPPE', item, enabled: true });
    rt.dispatch({ type: 'startWork' });
    set({
      screen: 'lab', settings: { ...s, mode: 'PRACTICE' }, runtime: rt, attemptId: 'demo', notebook: emptyB04Notebook('demo'), ppeConfirmed: true,
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
    sanitizeOnResumeB04(w);
    const rt = new OpticalRuntime(w, saved.attemptId, saved.actions, BIO_SIM);
    rt.tape = TapeRecorder.resume('b04', saved.attemptId, w.tick, saved);
    rt.timeScale = saved.settings.timeScale;
    rt.paused = true;
    bindRuntime(rt);
    actor?.stop();
    try {
      actor = createActor(practiceB04Machine, saved.workflow ? { snapshot: saved.workflow as never } : undefined);
    } catch {
      actor = createActor(practiceB04Machine);
    }
    bindActor();
    actor.start();
    set({
      screen: saved.submitted ? 'review' : 'lab', settings: { ...DEFAULT_SETTINGS, ...saved.settings }, runtime: rt, attemptId: saved.attemptId, notebook: saved.notebook,
      ppeConfirmed: saved.ppe, toasts: [], captions: [], paused: true, submitted: saved.submitted,
      modal: saved.submitted ? null : saved.ppe ? null : { kind: 'ppe' },
      evaluation: saved.submitted ? evaluateB04(w, saved.notebook) : null,
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
    const evaluation = evaluateB04(rt.world, get().notebook);
    set({ evaluation, submitted: true, screen: 'review', modal: null, paused: true });
    get().save();
    // Estudiantes: la entrega queda registrada en su curso (plataforma).
    void reportSubmission('b04', {
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
    clearB04Attempt();
    set({ screen: 'intro', modal: null, demo: null, runtime: null, paused: true });
  },

  save() {
    const s = get();
    if (s.demo) return;
    const rt = s.runtime;
    if (!rt) return;
    const ok = saveB04Attempt({
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

function bindRuntime(rt: OpticalRuntime<BioWorld>) {
  unsubEvents?.();
  unsubEvents = rt.onEvents((evs: SimEvent[]) => {
    const st = useB04.getState();
    for (const e of evs) b04EventFeedback(rt.world, e, st.settings.mode, st);
  });
}

function bindActor() {
  actor?.subscribe((snap) => {
    useB04.setState({ workflowStage: b04StageName(snap.value) });
  });
}

export function tickB04Workflow() {
  const st = useB04.getState();
  if (!st.runtime || !actor || st.screen !== 'lab') return;
  actor.send({ type: 'EVIDENCE', flags: b04StageEvidence(st.runtime.world, st.notebook) });
}

/** Bucles de fondo de la práctica B04 (solo mientras esta práctica está abierta). */
export function startB04Loops(): () => void {
  const a = setInterval(() => {
    const st = useB04.getState();
    if (st.screen === 'lab') st.bump();
  }, 200);
  const b = setInterval(tickB04Workflow, 1000);
  const c = setInterval(() => {
    const st = useB04.getState();
    if (st.screen === 'lab' && st.ppeConfirmed && !st.demo) st.save();
  }, 5000);
  const onHide = () => {
    const st = useB04.getState();
    if (document.visibilityState === 'hidden' && st.runtime) {
      st.save();
      if (st.screen === 'lab') st.setPaused(true);
    }
  };
  const onUnload = () => useB04.getState().save();
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

export { loadB04Attempt, clearB04Attempt };

/**
 * Ir a una estación (§2.1).
 */
export function goToStationB04(id: string) {
  const s = useB04.getState();
  s.stage?.goToStation(id);
  // F (cierre) se trabaja en la libreta: además de mover la cámara, la abre en el cuadro de incidentes y cierre.
  if (s.demo || id !== 'F') return;
  useB04.setState({ notebookOpen: true, notebookTab: 'close' });
}
