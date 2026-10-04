/**
 * Puente entre la simulación de la Práctica 3 (paso fijo, determinista) y la aplicación.
 * - `dispatch(command)` aplica el comando y registra solo las acciones con significado (§19.3).
 * - `advance(dt)` acumula tiempo real × escala y ejecuta pasos fijos (el resultado no depende de los fps).
 */
import type { FlameWorld, SimEvent } from '../../simulation/flame-world/types';
import { UNLOGGED_FLAME_COMMANDS, type FlameCommand, type FlameDispatchResult } from '../../simulation/flame-world/commands';
import { dispatchFlame, flameSummary, gasFlows, isLit, stepFlame } from '../../simulation/flame-world/world';
import { stableHash } from '../../simulation/core/math';
import { CTX3 } from '../../practices/practice-03';

/** §19.3 — evento de la práctica 3. */
export interface Practice03Event {
  attemptId: string;
  sequence: number;
  timestampMs: number;
  action: string;
  toolId?: string;
  sourceId?: string;
  targetId?: string;
  gasFlow?: number;
  airMix?: number;
  flameState?: string;
  localTemperatureC?: number;
  sampleSpecies?: Record<string, number>;
  observedColor?: string;
  filterAligned?: boolean;
  safetyCode?: string;
  stateHash: string;
}

type Listener = (events: SimEvent[]) => void;

const MAX_STEPS_PER_FRAME = 400;
const MAX_FRAME_S = 0.25;

export class FlameRuntime {
  readonly ctx = CTX3;
  actions: Practice03Event[];
  timeScale = 1;
  paused = false;
  private acc = 0;
  private lastSeq: number;
  private listeners = new Set<Listener>();
  /** Última válvula registrada (las válvulas se registran por tramos, no cada píxel de arrastre). */
  private lastValve: Record<string, { v: number; t: number }> = {};

  constructor(public world: FlameWorld, public attemptId: string, actions: Practice03Event[] = []) {
    this.actions = actions;
    this.lastSeq = world.evidence.__eventSeq ?? 0;
  }

  onEvents(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  dispatch(cmd: FlameCommand): FlameDispatchResult {
    const w = this.world;
    const prevSupport = cmd.type === 'setPose' ? w.objects[cmd.id]?.support : undefined;
    const r = dispatchFlame(w, cmd, this.ctx);
    if (this.shouldLog(cmd, prevSupport)) this.actions.push(this.toAction(cmd, r));
    this.flush();
    return r;
  }

  private shouldLog(cmd: FlameCommand, prevSupport?: string): boolean {
    if (UNLOGGED_FLAME_COMMANDS.has(cmd.type)) return false;
    // Movimientos del puntero: solo cuando cambia el soporte (tomar, soltar, encajar).
    if (cmd.type === 'setPose') return cmd.support !== undefined && cmd.support !== prevSupport;
    if (cmd.type === 'setValve') {
      const last = this.lastValve[cmd.valve];
      const t = this.world.timeS;
      if (last && Math.abs(last.v - cmd.value) < 0.08 && cmd.value > 0.01 && t - last.t < 2) return false;
      this.lastValve[cmd.valve] = { v: cmd.value, t };
    }
    return true;
  }

  private toAction(cmd: FlameCommand, r: FlameDispatchResult): Practice03Event {
    const w = this.world;
    const c = cmd as Record<string, unknown>;
    const id = (c.id as string) ?? (c.tongsId as string) ?? (c.atomizerId as string) ?? undefined;
    const loop = id ? w.loops[id] : undefined;
    return {
      attemptId: this.attemptId,
      sequence: this.actions.length + 1,
      timestampMs: Math.round(w.timeS * 1000),
      action: cmd.type === 'setValve' ? `setValve:${cmd.valve}` : cmd.type,
      toolId: id,
      sourceId: (c.targetId as string) ?? (c.target as string) ?? (c.solutionId as string) ?? undefined,
      targetId: (c.support as string) ?? undefined,
      gasFlow: Math.round(gasFlows(w).burner * 1000) / 1000,
      airMix: Math.round(w.burner.flame.airMix * 1000) / 1000,
      flameState: w.burner.flameState,
      localTemperatureC: loop ? Math.round(loop.temperatureC) : undefined,
      sampleSpecies: loop ? { ...loop.depositedSpeciesMg } : undefined,
      filterAligned: w.glass.alignment > 0.6,
      safetyCode: r.ok ? undefined : r.code,
      stateHash: this.stateHash(),
    };
  }

  stateHash(): string {
    return stableHash({ t: this.world.tick, ...flameSummary(this.world), lit: isLit(this.world) });
  }

  advance(realDtS: number): number {
    if (this.paused || this.world.safety.stoppedByTeacher) return 0;
    const dtS = this.world.params.dtS;
    this.acc += Math.min(realDtS, MAX_FRAME_S) * this.timeScale;
    let n = 0;
    while (this.acc >= dtS && n < MAX_STEPS_PER_FRAME) {
      stepFlame(this.world, this.ctx);
      this.acc -= dtS;
      n++;
    }
    if (n === MAX_STEPS_PER_FRAME) this.acc = 0;
    if (n > 0) this.flush();
    return n;
  }

  private flush() {
    const evs: SimEvent[] = [];
    const all = this.world.events;
    for (let i = all.length - 1; i >= 0; i--) {
      const e = all[i];
      if ((e.seq ?? 0) <= this.lastSeq) break;
      evs.push(e);
    }
    if (!evs.length) return;
    evs.reverse();
    this.lastSeq = evs[evs.length - 1].seq ?? this.lastSeq;
    for (const fn of this.listeners) fn(evs);
  }
}
