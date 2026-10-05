/**
 * Estado compartido de la Práctica 3 (Zustand): mismo patrón que la Práctica 2 — el mundo es mutable dentro de
 * FlameRuntime y React se re-renderiza con un contador `version` (≤ 5 Hz).
 */
import { create } from 'zustand';
import { createActor, type Actor } from 'xstate';
import type { SimEvent } from '../../simulation/flame-world/types';
import type { FlameCommand, FlameDispatchResult } from '../../simulation/flame-world/commands';
import { newSeed } from '../../simulation/core/rng';
import { newPractice3World } from '../../practices/practice-03';
import type { P3Mode } from '../../practices/practice-03/definition';
import type { P3Scenario } from '../../practices/practice-03/error-scenarios';
import { emptyP3Notebook, type P3Notebook } from '../../practices/practice-03/notebook';
import { practice3Machine, p3StageName } from '../../practices/practice-03/workflow.machine';
import { p3StageEvidence } from '../../practices/practice-03/evidence';
import { evaluateP3 } from '../../practices/practice-03/rubric';
import type { Evaluation } from '../../simulation/scoring/types';
import type { FuelId } from '../../simulation/combustion/combustion';
import type { FlameLab3D } from '../../engine/flame/FlameLab3D';
import type { QualitySetting } from '../../engine/quality';
import { FlameRuntime } from './runtime';
import { clearP3Attempt, loadP3Attempt, pushUnknownHistory, readUnknownHistory, saveP3Attempt, type SavedP3Attempt } from './persistence';
import { p3EventFeedback } from './feedback';
import { reportSubmission } from '../platform/report';

export interface P3Settings {
  mode: P3Mode;
  seed: number;
  fuel: FuelId;
  loopMode: 'DEDICATED' | 'SHARED';
  atomizer: boolean;
  scenarios: P3Scenario[];
  timeScale: number;
  uiScale: number;
  reducedMotion: boolean;
  captions: boolean;
  volume: number;
  showNames: boolean;
  quality: QualitySetting;
  /** Apoyo para deficiencia de visión cromática (§24): espectro y nombre de región tras registrar. */
  colorAid: boolean;
}

export interface P3Toast {
  id: number;
  level: 'info' | 'warn' | 'alert' | 'critical';
  text: string;
  at: number;
}

/** Estado visible de la demostración automática (el director vive en app/p3/demo). */
export interface P3DemoUi {
  index: number;
  total: number;
  key: string;
  part: 'A' | 'B' | 'C' | 'D' | 'E';
  note: string | null;
  done: boolean;
  speed: number;
}

/** Semilla fija de la demostración: siempre se ve la misma práctica (y la misma incógnita). */
const P3_DEMO_SEED = 20261004;

export type P3Modal = null | { kind: 'ppe' } | { kind: 'submit' } | { kind: 'settings' } | { kind: 'help' } | { kind: 'restored' };

interface P3State {
  screen: 'intro' | 'lab' | 'review';
  settings: P3Settings;
  runtime: FlameRuntime | null;
  stage: FlameLab3D | null;
  attemptId: string;
  notebook: P3Notebook;
  ppeConfirmed: boolean;
  selected: string | null;
  held: string | null;
  toasts: P3Toast[];
  captions: P3Toast[];
  version: number;
  workflowStage: string;
  modal: P3Modal;
  paused: boolean;
  evaluation: Evaluation | null;
  submitted: boolean;
  notebookOpen: boolean;
  inventoryOpen: boolean;
  savedAt: number | null;
  /** Identificación de partes: etiqueta elegida que espera un clic sobre el modelo. */
  partLabel: string | null;
  partsOpen: boolean;
  /** Pestaña de la libreta pedida desde fuera (demostración); null = la que elija el usuario. */
  notebookTab: string | null;
  /** Demostración en curso (null = intento normal). */
  demo: P3DemoUi | null;
  /** Abre el laboratorio en modo demostración: el simulador hace la práctica completa paso a paso. */
  startDemo(): void;
  setDemo(p: Partial<P3DemoUi>): void;

  setSettings(p: Partial<P3Settings>): void;
  start(opts?: { sameSeed?: boolean }): void;
  resume(saved: SavedP3Attempt): void;
  confirmPpe(): void;
  dispatch(cmd: FlameCommand): FlameDispatchResult;
  select(id: string | null): void;
  setHeld(id: string | null): void;
  toast(level: P3Toast['level'], text: string): void;
  caption(text: string): void;
  dismissToast(id: number): void;
  setNotebook(fn: (nb: P3Notebook) => void, field?: string, from?: string, to?: string): void;
  setModal(m: P3Modal): void;
  setStage(s: FlameLab3D | null): void;
  bump(): void;
  setPaused(p: boolean): void;
  submit(): void;
  backToIntro(): void;
  save(): void;
  toggleNotebook(): void;
  toggleInventory(): void;
  setPartLabel(l: string | null): void;
  togglePartsPanel(): void;
}

let actor: Actor<typeof practice3Machine> | null = null;
let toastSeq = 1;
let unsubEvents: (() => void) | null = null;

const DEFAULT_SETTINGS: P3Settings = {
  mode: 'PRACTICE',
  seed: newSeed(),
  fuel: 'PROPANE',
  loopMode: 'DEDICATED',
  atomizer: false,
  scenarios: [],
  timeScale: 2,
  uiScale: 1,
  reducedMotion: typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  captions: true,
  volume: 0.4,
  showNames: true,
  quality: 'AUTO',
  colorAid: false,
};

const attemptIdFor = (seed: number) => `p3-${seed.toString(36)}-${Date.now().toString(36)}`;

export const useP3 = create<P3State>()((set, get) => ({
  screen: 'intro',
  settings: DEFAULT_SETTINGS,
  runtime: null,
  stage: null,
  attemptId: '',
  notebook: emptyP3Notebook(),
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
  partLabel: null,
  partsOpen: false,
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
    const world = newPractice3World({
      mode: s.mode,
      seed,
      fuel: s.fuel,
      scenarios: s.scenarios,
      params: { loopMode: s.loopMode, atomizerEnabled: s.atomizer },
      unknownHistory: readUnknownHistory(),
    });
    pushUnknownHistory(world.unknown.cation);
    const id = attemptIdFor(seed);
    const rt = new FlameRuntime(world, id);
    rt.timeScale = s.timeScale;
    bindRuntime(rt);
    actor?.stop();
    actor = createActor(practice3Machine);
    bindActor();
    actor.start();
    actor.send({ type: 'START' });
    set({
      screen: 'lab', settings: { ...s, seed }, runtime: rt, attemptId: id, notebook: emptyP3Notebook(), ppeConfirmed: false, selected: null, held: null,
      toasts: [], captions: [], evaluation: null, submitted: false, modal: { kind: 'ppe' }, paused: true, partLabel: null, partsOpen: false,
      demo: null, notebookTab: null,
    });
    rt.paused = true;
  },

  startDemo() {
    const s = get().settings;
    // Mundo del modo Práctica con asas dedicadas, sin guardar ni evaluar: es solo para ver cómo se hace.
    const world = newPractice3World({ mode: 'PRACTICE', seed: P3_DEMO_SEED, fuel: 'PROPANE', params: { loopMode: 'DEDICATED', atomizerEnabled: false } });
    const rt = new FlameRuntime(world, 'demo');
    rt.timeScale = 1;
    bindRuntime(rt);
    actor?.stop();
    actor = createActor(practice3Machine);
    bindActor();
    actor.start();
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    rt.dispatch({ type: 'confirmPpe' });
    set({
      screen: 'lab', settings: { ...s, mode: 'PRACTICE' }, runtime: rt, attemptId: 'demo', notebook: emptyP3Notebook(), ppeConfirmed: true,
      selected: null, held: null, toasts: [], captions: [], evaluation: null, submitted: false, modal: null, paused: false,
      notebookOpen: false, inventoryOpen: false, partLabel: null, partsOpen: false, notebookTab: null,
      demo: { index: -1, total: 0, key: '', part: 'A', note: null, done: false, speed: 1 },
    });
  },

  setDemo(p) {
    const d = get().demo;
    if (d) set({ demo: { ...d, ...p } });
  },

  resume(saved) {
    const w = saved.world;
    // §25 — al restaurar se vuelve a un estado seguro: gas cerrado, sin llama ni chispa, nada en la mano.
    const wasLit = !['OFF', 'EXTINGUISHED', 'GAS_RELEASED'].includes(w.burner.flameState);
    w.burner.tableGasValve = 0;
    w.burner.needleGasValve = 0;
    w.burner.flameState = 'OFF';
    w.burner.flame = { ...w.burner.flame, isLit: false, heightCm: 0, innerConeHeightCm: 0, fuelFlow: 0, sootRateMgS: 0, coRateMgS: 0 };
    w.lighter.sparking = false;
    w.room.gasAccumMl = 0;
    for (const o of Object.values(w.objects)) if (o.support === 'hand' || o.support === 'falling') o.support = 'bench';
    for (const tg of Object.values(w.tongs)) tg.holding = null;
    w.capsule.clampedBy = null;
    const rt = new FlameRuntime(w, saved.attemptId, saved.actions);
    rt.timeScale = saved.settings.timeScale;
    rt.paused = true;
    bindRuntime(rt);
    actor?.stop();
    try {
      actor = createActor(practice3Machine, saved.workflow ? { snapshot: saved.workflow as never } : undefined);
    } catch {
      actor = createActor(practice3Machine);
    }
    bindActor();
    actor.start();
    set({
      screen: saved.submitted ? 'review' : 'lab', settings: saved.settings, runtime: rt, attemptId: saved.attemptId, notebook: saved.notebook,
      ppeConfirmed: saved.ppe, toasts: [], captions: [], paused: true, submitted: saved.submitted,
      modal: saved.submitted ? null : saved.ppe ? (wasLit ? { kind: 'restored' } : null) : { kind: 'ppe' },
      evaluation: saved.submitted ? evaluateP3(w, saved.notebook, { ppeConfirmed: saved.ppe }) : null,
      partLabel: null,
    });
    if (wasLit && !saved.submitted) get().toast('warn', 'Se restauró el intento en un estado seguro: se cerró el gas y se apagó el mechero.');
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
    const evaluation = evaluateP3(rt.world, get().notebook, { ppeConfirmed: get().ppeConfirmed });
    set({ evaluation, submitted: true, screen: 'review', modal: null, paused: true });
    get().save();
    // Estudiantes: la entrega queda registrada en su curso (plataforma).
    void reportSubmission('p3', { mode: get().settings.mode, attemptId: get().attemptId, evaluation, durationS: rt.world.timeS });
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
    const ok = saveP3Attempt({
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
  setPartLabel(l) {
    set({ partLabel: l });
  },
  togglePartsPanel() {
    set({ partsOpen: !get().partsOpen, partLabel: null });
  },
}));

function bindRuntime(rt: FlameRuntime) {
  unsubEvents?.();
  unsubEvents = rt.onEvents((evs: SimEvent[]) => {
    const st = useP3.getState();
    for (const e of evs) p3EventFeedback(e, st.settings.mode, st);
  });
}

function bindActor() {
  actor?.subscribe((snap) => {
    useP3.setState({ workflowStage: p3StageName(snap.value) });
  });
}

export function tickP3Workflow() {
  const st = useP3.getState();
  if (!st.runtime || !actor || st.screen !== 'lab') return;
  actor.send({ type: 'EVIDENCE', flags: p3StageEvidence(st.runtime.world, st.notebook) });
}

/** Bucles de fondo de la Práctica 3 (se activan solo mientras esta práctica está abierta). */
export function startP3Loops(): () => void {
  const a = setInterval(() => {
    const st = useP3.getState();
    if (st.screen === 'lab') st.bump();
  }, 200);
  const b = setInterval(tickP3Workflow, 1000);
  const c = setInterval(() => {
    const st = useP3.getState();
    if (st.screen === 'lab' && st.ppeConfirmed && !st.demo) st.save();
  }, 5000);
  const onHide = () => {
    const st = useP3.getState();
    if (document.visibilityState === 'hidden' && st.runtime) {
      st.save();
      if (st.screen === 'lab') st.setPaused(true);
    }
  };
  const onUnload = () => useP3.getState().save();
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

export { loadP3Attempt, clearP3Attempt };
