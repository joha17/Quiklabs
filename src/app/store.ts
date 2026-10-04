/**
 * Estado compartido (Zustand): puente entre simulación, escenario y React (§3.1).
 * El mundo es mutable dentro de LabRuntime; React se re-renderiza con un contador `version` (≤ 5 Hz).
 */
import { create } from 'zustand';
import { createActor, type Actor } from 'xstate';
import type { SimEvent } from '../simulation/entities/types';
import type { Command } from '../simulation/world/commands';
import type { DispatchResult } from '../simulation/world/world';
import { newSeed } from '../simulation/core/rng';
import { newPracticeWorld } from '../practices/practice-02';
import type { PracticeMode } from '../practices/practice-02/definition';
import { emptyNotebook, type NotebookState } from '../practices/practice-02/notebook';
import { practiceMachine, stageName } from '../practices/practice-02/workflow.machine';
import { stageEvidence } from '../practices/practice-02/evidence';
import { evaluate } from '../practices/practice-02/rubric';
import type { Evaluation } from '../simulation/scoring/types';
import { LabRuntime } from './runtime';
import { clearAttempt, loadAttempt, saveAttempt, type SavedAttempt } from './persistence';
import type { Lab3D } from '../engine/Lab3D';
import type { QualitySetting } from '../engine/quality';
import { eventFeedback } from './feedback';

export interface Settings {
  mode: PracticeMode;
  oilProfile: 'OIL_VEG' | 'OIL_MIN';
  seed: number;
  timeScale: number;
  uiScale: number;
  reducedMotion: boolean;
  captions: boolean;
  volume: number;
  showZones: boolean;
  showNames: boolean;
  quality: QualitySetting;
}

export interface Toast {
  id: number;
  level: 'info' | 'warn' | 'alert' | 'critical';
  text: string;
  at: number;
}

/** Estado visible de la demostración automática (el director vive en app/demo). */
export interface DemoUi {
  index: number;
  total: number;
  key: string;
  part: 'A' | 'B';
  note: string | null;
  done: boolean;
  speed: number;
}

/** Semilla fija de la demostración: siempre se ve la misma práctica. */
const DEMO_SEED = 20261003;

export type Modal =
  | null
  | { kind: 'fold'; id: string }
  | { kind: 'label'; id: string }
  | { kind: 'submit' }
  | { kind: 'settings' }
  | { kind: 'help' }
  | { kind: 'ppe' };

interface LabState {
  screen: 'intro' | 'lab' | 'review';
  settings: Settings;
  runtime: LabRuntime | null;
  stage: Lab3D | null;
  attemptId: string;
  notebook: NotebookState;
  ppeConfirmed: boolean;
  selected: string | null;
  held: string | null;
  toasts: Toast[];
  captions: Toast[];
  version: number;
  workflowStage: string;
  modal: Modal;
  levelView: boolean;
  paused: boolean;
  evaluation: Evaluation | null;
  submitted: boolean;
  notebookOpen: boolean;
  /** Pestaña de la libreta pedida desde fuera (demostración); null = la que elija el usuario. */
  notebookTab: 't21' | 't22' | 'activities' | 'log' | null;
  inventoryOpen: boolean;
  savedAt: number | null;
  /** Demostración en curso (null = intento normal). */
  demo: DemoUi | null;

  setSettings(p: Partial<Settings>): void;
  start(opts?: { sameSeed?: boolean }): void;
  /** Abre el laboratorio en modo demostración: el simulador hace la práctica completa paso a paso. */
  startDemo(): void;
  setDemo(p: Partial<DemoUi>): void;
  resume(saved: SavedAttempt): void;
  confirmPpe(): void;
  dispatch(cmd: Command): DispatchResult;
  select(id: string | null): void;
  setHeld(id: string | null): void;
  toast(level: Toast['level'], text: string): void;
  caption(text: string): void;
  dismissToast(id: number): void;
  setNotebook(fn: (nb: NotebookState) => void, field?: string, from?: string, to?: string): void;
  setModal(m: Modal): void;
  setStage(s: Lab3D | null): void;
  bump(): void;
  setLevelView(on: boolean): void;
  /** Solo marca la bandera (la cámara ya se movió). */
  setLevelViewFlag(on: boolean): void;
  setPaused(p: boolean): void;
  submit(): void;
  backToIntro(): void;
  save(): void;
  toggleNotebook(): void;
  toggleInventory(): void;
}

let actor: Actor<typeof practiceMachine> | null = null;
let toastSeq = 1;
let unsubEvents: (() => void) | null = null;

const DEFAULT_SETTINGS: Settings = {
  mode: 'PRACTICE',
  oilProfile: 'OIL_VEG',
  seed: newSeed(),
  timeScale: 2,
  uiScale: 1,
  reducedMotion: typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  captions: true,
  volume: 0.4,
  showZones: false,
  showNames: true,
  quality: 'AUTO',
};

function attemptId(seed: number) {
  return `p2-${seed.toString(36)}-${Date.now().toString(36)}`;
}

export const useLab = create<LabState>()((set, get) => ({
  screen: 'intro',
  settings: DEFAULT_SETTINGS,
  runtime: null,
  stage: null,
  attemptId: '',
  notebook: emptyNotebook(),
  ppeConfirmed: false,
  selected: null,
  held: null,
  toasts: [],
  captions: [],
  version: 0,
  workflowStage: 'INTRO',
  modal: null,
  levelView: false,
  paused: false,
  evaluation: null,
  submitted: false,
  notebookOpen: false,
  notebookTab: null,
  inventoryOpen: false,
  savedAt: null,
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
    const settings: Settings = { ...s, seed, showZones: s.mode === 'GUIDED' ? true : s.showZones };
    const world = newPracticeWorld({ mode: settings.mode === 'DEBUG' ? 'PRACTICE' : settings.mode, seed, oilProfile: settings.oilProfile });
    const id = attemptId(seed);
    const rt = new LabRuntime(world, id);
    rt.timeScale = settings.timeScale;
    bindRuntime(rt);
    actor?.stop();
    actor = createActor(practiceMachine);
    bindActor();
    actor.start();
    actor.send({ type: 'START' });
    set({
      screen: 'lab', settings, runtime: rt, attemptId: id, notebook: emptyNotebook(), ppeConfirmed: false, selected: null, held: null,
      toasts: [], captions: [], evaluation: null, submitted: false, modal: { kind: 'ppe' }, paused: true, levelView: false, demo: null,
      notebookOpen: false, notebookTab: null,
    });
    rt.paused = true;
  },

  startDemo() {
    const s = get().settings;
    // Mundo del modo Práctica (con balanza), sin guardar ni evaluar: es solo para ver cómo se hace.
    const world = newPracticeWorld({ mode: 'PRACTICE', seed: DEMO_SEED, oilProfile: s.oilProfile });
    const rt = new LabRuntime(world, 'demo');
    rt.timeScale = 2;
    bindRuntime(rt);
    actor?.stop();
    actor = createActor(practiceMachine);
    bindActor();
    actor.start();
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    set({
      screen: 'lab', runtime: rt, attemptId: 'demo', notebook: emptyNotebook(), ppeConfirmed: true, selected: null, held: null,
      toasts: [], captions: [], evaluation: null, submitted: false, modal: null, paused: false, levelView: false,
      notebookOpen: false, notebookTab: null, inventoryOpen: false,
      demo: { index: -1, total: 0, key: '', part: 'A', note: null, done: false, speed: 1 },
    });
  },

  setDemo(p) {
    const d = get().demo;
    if (d) set({ demo: { ...d, ...p } });
  },

  resume(saved) {
    const rt = new LabRuntime(saved.world, saved.attemptId, saved.actions);
    // Reanudar en pausa y sin agitación ni vertidos activos (§14).
    for (const v of Object.values(saved.world.vessels)) {
      v.agitation = 0;
      v.agitationTool = 'NONE';
    }
    saved.world.pours = {};
    rt.timeScale = saved.settings.timeScale;
    rt.paused = true;
    bindRuntime(rt);
    actor?.stop();
    try {
      actor = createActor(practiceMachine, saved.workflow ? { snapshot: saved.workflow as never } : undefined);
    } catch {
      actor = createActor(practiceMachine);
    }
    bindActor();
    actor.start();
    set({
      screen: saved.submitted ? 'review' : 'lab', settings: saved.settings, runtime: rt, attemptId: saved.attemptId, notebook: saved.notebook,
      ppeConfirmed: saved.ppe, toasts: [], captions: [], paused: true, modal: saved.ppe ? null : { kind: 'ppe' }, submitted: saved.submitted,
      evaluation: saved.submitted ? evaluate(saved.world, saved.notebook, { ppeConfirmed: saved.ppe, mode: saved.settings.mode }) : null,
    });
    if (saved.spillPos) queueMicrotask(() => { const st = get().stage; if (st) st.controller.spillPos = saved.spillPos; });
  },

  confirmPpe() {
    actor?.send({ type: 'PPE_CONFIRMED' });
    const rt = get().runtime;
    if (rt) rt.paused = false;
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
      if (nb.history.length > 500) nb.history.splice(0, nb.history.length - 500);
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
  setLevelView(on) {
    get().stage?.setLevelView(on);
    set({ levelView: on });
  },
  setLevelViewFlag(on) {
    if (get().levelView !== on) set({ levelView: on });
  },
  setPaused(p) {
    // En la demostración se detiene TODO (escena, mano y simulación), no solo el dominio.
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
    const evaluation = evaluate(rt.world, get().notebook, { ppeConfirmed: get().ppeConfirmed, mode: get().settings.mode });
    set({ evaluation, submitted: true, screen: 'review', modal: null, paused: true });
    get().save();
  },

  backToIntro() {
    get().save();
    set({ screen: 'intro', modal: null, demo: null });
  },

  save() {
    const s = get();
    if (s.demo) return; // la demostración no se guarda como intento
    const rt = s.runtime;
    if (!rt) return;
    const ok = saveAttempt({
      version: 1, savedAt: Date.now(), attemptId: s.attemptId, settings: s.settings, world: rt.world, actions: rt.actions,
      notebook: s.notebook, workflow: actor?.getPersistedSnapshot() ?? null, ppe: s.ppeConfirmed,
      spillPos: s.stage?.controller.spillPos ?? { x: 160, y: 10 }, submitted: s.submitted,
    });
    if (ok) set({ savedAt: Date.now() });
  },

  toggleNotebook() {
    set({ notebookOpen: !get().notebookOpen });
  },
  toggleInventory() {
    set({ inventoryOpen: !get().inventoryOpen });
  },
}));

function bindRuntime(rt: LabRuntime) {
  unsubEvents?.();
  unsubEvents = rt.onEvents((evs: SimEvent[]) => {
    const st = useLab.getState();
    for (const e of evs) eventFeedback(e, st.settings.mode, st);
  });
}

function bindActor() {
  actor?.subscribe((snap) => {
    useLab.setState({ workflowStage: stageName(snap.value) });
  });
}

/** Evidencia periódica para la máquina del flujo y autoguardado. */
export function tickWorkflow() {
  const st = useLab.getState();
  if (!st.runtime || !actor || st.screen !== 'lab') return;
  actor.send({ type: 'EVIDENCE', flags: stageEvidence(st.runtime.world, st.notebook) });
}

export function startBackgroundLoops(): () => void {
  const a = setInterval(() => {
    const st = useLab.getState();
    if (st.screen === 'lab') st.bump();
  }, 200);
  const b = setInterval(tickWorkflow, 1000);
  const c = setInterval(() => {
    const st = useLab.getState();
    if (st.screen === 'lab' && st.ppeConfirmed && !st.demo) st.save();
  }, 5000);
  const onHide = () => {
    const st = useLab.getState();
    if (document.visibilityState === 'hidden' && st.runtime) {
      st.save();
      if (st.screen === 'lab') st.setPaused(true);
    }
  };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('beforeunload', () => useLab.getState().save());
  return () => {
    clearInterval(a);
    clearInterval(b);
    clearInterval(c);
    document.removeEventListener('visibilitychange', onHide);
  };
}

export { loadAttempt, clearAttempt };
