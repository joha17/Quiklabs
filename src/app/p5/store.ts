/**
 * Estado compartido de la Práctica 5 (Zustand): mismo patrón que las prácticas 2 a 4 — el mundo es mutable dentro
 * de StoichRuntime y React se re-renderiza con un contador `version` (≤ 5 Hz).
 */
import { create } from 'zustand';
import { createActor, type Actor } from 'xstate';
import type { SimEvent } from '../../simulation/stoich-world/types';
import type { P5Command, P5DispatchResult } from '../../simulation/stoich-world/commands';
import { newSeed } from '../../simulation/core/rng';
import { newPractice5World } from '../../practices/practice-05';
import type { P5Mode } from '../../practices/practice-05/definition';
import type { P5Scenario } from '../../practices/practice-05/error-scenarios';
import { emptyP5Notebook, type P5Notebook } from '../../practices/practice-05/notebook';
import { practice5Machine, p5StageName } from '../../practices/practice-05/workflow.machine';
import { p5StageEvidence } from '../../practices/practice-05/evidence';
import { evaluateP5 } from '../../practices/practice-05/rubric';
import { tubeTempC } from '../../simulation/stoich-world/world';
import type { Evaluation } from '../../simulation/scoring/types';
import type { StoichLab3D } from '../../engine/stoich/StoichLab3D';
import type { QualitySetting } from '../../engine/quality';
import { StoichRuntime } from './runtime';
import { clearP5Attempt, loadP5Attempt, saveP5Attempt, type SavedP5Attempt } from './persistence';
import { p5EventFeedback } from './feedback';
import { reportSubmission } from '../platform/report';

export interface P5Settings {
  mode: P5Mode;
  seed: number;
  scenarios: P5Scenario[];
  timeScale: number;
  uiScale: number;
  reducedMotion: boolean;
  captions: boolean;
  volume: number;
  showNames: boolean;
  quality: QualitySetting;
  /** Opciones docentes (§2): masa de KClO₃ máxima y duración del primer ciclo. */
  kclo3MaxG: number;
  firstCycleMin: number;
}

export interface P5Toast {
  id: number;
  level: 'info' | 'warn' | 'alert' | 'critical';
  text: string;
  at: number;
}

export interface P5DemoUi {
  index: number;
  total: number;
  key: string;
  part: 'A' | 'B' | 'C' | 'D' | 'E';
  note: string | null;
  done: boolean;
  speed: number;
}

const P5_DEMO_SEED = 20261005;

export type P5Modal = null | { kind: 'ppe' } | { kind: 'submit' } | { kind: 'settings' } | { kind: 'help' } | { kind: 'restored' };

interface P5State {
  screen: 'intro' | 'lab' | 'review';
  settings: P5Settings;
  runtime: StoichRuntime | null;
  stage: StoichLab3D | null;
  attemptId: string;
  notebook: P5Notebook;
  ppeConfirmed: boolean;
  selected: string | null;
  held: string | null;
  toasts: P5Toast[];
  captions: P5Toast[];
  version: number;
  workflowStage: string;
  modal: P5Modal;
  paused: boolean;
  evaluation: Evaluation | null;
  submitted: boolean;
  notebookOpen: boolean;
  inventoryOpen: boolean;
  savedAt: number | null;
  notebookTab: string | null;
  irReading: number | null;
  demo: P5DemoUi | null;
  startDemo(): void;
  setDemo(p: Partial<P5DemoUi>): void;

  setSettings(p: Partial<P5Settings>): void;
  start(opts?: { sameSeed?: boolean }): void;
  resume(saved: SavedP5Attempt): void;
  confirmPpe(): void;
  dispatch(cmd: P5Command): P5DispatchResult;
  select(id: string | null): void;
  setHeld(id: string | null): void;
  toast(level: P5Toast['level'], text: string): void;
  caption(text: string): void;
  dismissToast(id: number): void;
  setNotebook(fn: (nb: P5Notebook) => void, field?: string, from?: string, to?: string): void;
  setModal(m: P5Modal): void;
  setStage(s: StoichLab3D | null): void;
  bump(): void;
  setPaused(p: boolean): void;
  submit(): void;
  backToIntro(): void;
  save(): void;
  toggleNotebook(): void;
  toggleInventory(): void;
}

let actor: Actor<typeof practice5Machine> | null = null;
let toastSeq = 1;
let unsubEvents: (() => void) | null = null;

const DEFAULT_SETTINGS: P5Settings = {
  mode: 'PRACTICE',
  seed: newSeed(),
  scenarios: [],
  timeScale: 5,
  uiScale: 1,
  reducedMotion: typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  captions: true,
  volume: 0.4,
  showNames: true,
  quality: 'AUTO',
  kclo3MaxG: 2,
  firstCycleMin: 10,
};

const attemptIdFor = (seed: number) => `p5-${seed.toString(36)}-${Date.now().toString(36)}`;

function worldFor(s: P5Settings, seed: number, mode: P5Mode) {
  return newPractice5World({ mode, seed, scenarios: s.scenarios, params: { kclo3MaxG: s.kclo3MaxG, firstCycleS: s.firstCycleMin * 60 } });
}

export const useP5 = create<P5State>()((set, get) => ({
  screen: 'intro',
  settings: DEFAULT_SETTINGS,
  runtime: null,
  stage: null,
  attemptId: '',
  notebook: emptyP5Notebook(),
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
  irReading: null,
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
    const world = worldFor(s, seed, s.mode);
    const id = attemptIdFor(seed);
    const rt = new StoichRuntime(world, id);
    rt.timeScale = s.timeScale;
    bindRuntime(rt);
    actor?.stop();
    actor = createActor(practice5Machine);
    bindActor();
    actor.start();
    actor.send({ type: 'START' });
    set({
      screen: 'lab', settings: { ...s, seed }, runtime: rt, attemptId: id, notebook: emptyP5Notebook(), ppeConfirmed: false, selected: null, held: null,
      toasts: [], captions: [], evaluation: null, submitted: false, modal: { kind: 'ppe' }, paused: true, demo: null, notebookTab: null, irReading: null,
    });
    rt.paused = true;
  },

  startDemo() {
    const s = get().settings;
    const world = worldFor({ ...DEFAULT_SETTINGS, scenarios: [] }, P5_DEMO_SEED, 'PRACTICE');
    const rt = new StoichRuntime(world, 'demo');
    rt.timeScale = 1;
    bindRuntime(rt);
    actor?.stop();
    actor = createActor(practice5Machine);
    bindActor();
    actor.start();
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    rt.dispatch({ type: 'confirmPpe' });
    set({
      screen: 'lab', settings: { ...s, mode: 'PRACTICE' }, runtime: rt, attemptId: 'demo', notebook: emptyP5Notebook(), ppeConfirmed: true,
      selected: null, held: null, toasts: [], captions: [], evaluation: null, submitted: false, modal: null, paused: false,
      notebookOpen: false, inventoryOpen: false, notebookTab: null, irReading: null,
      demo: { index: -1, total: 0, key: '', part: 'A', note: null, done: false, speed: 1 },
    });
  },

  setDemo(p) {
    const d = get().demo;
    if (d) set({ demo: { ...d, ...p } });
  },

  resume(saved) {
    const w = saved.world;
    // Al restaurar: mechero apagado y gas cerrado, sin chispa, nada en la mano. La reacción no avanzó con la app cerrada.
    const g = w.gas;
    const wasLit = !['OFF', 'EXTINGUISHED', 'GAS_RELEASED'].includes(g.burner.flameState);
    g.burner.tableGasValve = 0;
    g.burner.needleGasValve = 0;
    g.burner.flameState = 'OFF';
    g.burner.flame = { ...g.burner.flame, isLit: false, heightCm: 0, innerConeHeightCm: 0, fuelFlow: 0, sootRateMgS: 0, coRateMgS: 0 };
    g.lighter.sparking = false;
    g.room.gasAccumMl = 0;
    for (const o of Object.values(g.objects)) if (o.support === 'hand' || o.support === 'falling') o.support = 'bench';
    for (const o of Object.values(w.objects)) {
      if (o.support !== 'hand') continue;
      o.support = 'bench';
      if (o.id === 'tube') {
        // El tubo que estaba en la mano vuelve a la gradilla.
        o.support = 'rack';
        o.pose = { x: w.objects.rack.pose.x - 3, y: w.objects.rack.pose.y, z: 0.6, rotationRad: 0 };
      }
    }
    if (w.objects.tube.support === 'tongs') {
      w.objects.tube.support = 'rack';
      w.objects.tube.pose = { x: w.objects.rack.pose.x - 3, y: w.objects.rack.pose.y, z: 0.6, rotationRad: 0 };
    }
    w.safety.lastInteractionS = w.timeS;
    const rt = new StoichRuntime(w, saved.attemptId, saved.actions);
    rt.timeScale = saved.settings.timeScale;
    rt.paused = true;
    bindRuntime(rt);
    actor?.stop();
    try {
      actor = createActor(practice5Machine, saved.workflow ? { snapshot: saved.workflow as never } : undefined);
    } catch {
      actor = createActor(practice5Machine);
    }
    bindActor();
    actor.start();
    set({
      screen: saved.submitted ? 'review' : 'lab', settings: saved.settings, runtime: rt, attemptId: saved.attemptId, notebook: saved.notebook,
      ppeConfirmed: saved.ppe, toasts: [], captions: [], paused: true, submitted: saved.submitted, irReading: null,
      modal: saved.submitted ? null : saved.ppe ? (wasLit ? { kind: 'restored' } : null) : { kind: 'ppe' },
      evaluation: saved.submitted ? evaluateP5(w, saved.notebook) : null,
    });
    if (wasLit && !saved.submitted) get().toast('warn', 'Se restauró el intento en un estado seguro: se cerró el gas y se apagó el mechero.');
    if (tubeTempC(w.tube) > w.params.ambientC + 5 && !saved.submitted) get().toast('info', 'El tubo sigue caliente: espere a que se enfríe antes de pesarlo.');
  },

  confirmPpe() {
    actor?.send({ type: 'PPE_CONFIRMED' });
    const rt = get().runtime;
    if (rt) {
      rt.dispatch({ type: 'confirmPpe' });
      rt.paused = false;
    }
    set({ ppeConfirmed: true, modal: null, paused: false });
    get().save();
  },

  dispatch(cmd) {
    const rt = get().runtime;
    if (!rt) return { ok: false };
    const r = rt.dispatch(cmd);
    if (cmd.type === 'measureIR' && r.value !== undefined) {
      set({ irReading: r.value });
      const stg = get().stage;
      if (stg) stg.irReading = r.value;
    }
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
    const evaluation = evaluateP5(rt.world, get().notebook);
    set({ evaluation, submitted: true, screen: 'review', modal: null, paused: true });
    get().save();
    // Estudiantes: la entrega queda registrada en su curso (plataforma).
    void reportSubmission('p5', { mode: get().settings.mode, attemptId: get().attemptId, evaluation, durationS: rt.world.timeS });
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
    const ok = saveP5Attempt({
      version: 1, savedAt: Date.now(), attemptId: s.attemptId, settings: s.settings, world: rt.world, actions: rt.actions,
      notebook: s.notebook, workflow: actor?.getPersistedSnapshot() ?? null, ppe: s.ppeConfirmed, submitted: s.submitted,
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

function bindRuntime(rt: StoichRuntime) {
  unsubEvents?.();
  unsubEvents = rt.onEvents((evs: SimEvent[]) => {
    const st = useP5.getState();
    for (const e of evs) p5EventFeedback(e, st.settings.mode, st);
  });
}

function bindActor() {
  actor?.subscribe((snap) => {
    useP5.setState({ workflowStage: p5StageName(snap.value) });
  });
}

export function tickP5Workflow() {
  const st = useP5.getState();
  if (!st.runtime || !actor || st.screen !== 'lab') return;
  actor.send({ type: 'EVIDENCE', flags: p5StageEvidence(st.runtime.world, st.notebook) });
}

/** Bucles de fondo de la Práctica 5 (solo mientras esta práctica está abierta). */
export function startP5Loops(): () => void {
  const a = setInterval(() => {
    const st = useP5.getState();
    if (st.screen === 'lab') st.bump();
  }, 200);
  const b = setInterval(tickP5Workflow, 1000);
  const c = setInterval(() => {
    const st = useP5.getState();
    if (st.screen === 'lab' && st.ppeConfirmed && !st.demo) st.save();
  }, 5000);
  const onHide = () => {
    const st = useP5.getState();
    if (document.visibilityState === 'hidden' && st.runtime) {
      st.save();
      if (st.screen === 'lab') st.setPaused(true);
    }
  };
  const onUnload = () => useP5.getState().save();
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

export { loadP5Attempt, clearP5Attempt };
