/**
 * Puente entre la simulación de la Práctica 5 (paso fijo, determinista) y la aplicación.
 * - `dispatch(command)` aplica el comando y registra solo las acciones con significado (§22.3).
 * - `advance(dt)` acumula tiempo real × escala y ejecuta pasos fijos (el resultado no depende de los fps).
 */
import type { P5World, SimEvent } from '../../simulation/stoich-world/types';
import { UNLOGGED_P5_COMMANDS, type P5Command, type P5DispatchResult } from '../../simulation/stoich-world/commands';
import { dispatchStoich, p5Summary, stepStoich, tubeTempC, type StoichContext } from '../../simulation/stoich-world/world';
import { stableHash } from '../../simulation/core/math';
import { CTX5 } from '../../practices/practice-05';

/** §22.3 — evento de la práctica 5. */
export interface Practice05Event {
  attemptId: string;
  sequence: number;
  timestampMs: number;
  action: string;
  objectId?: string;
  targetId?: string;
  /** Lectura de la balanza asociada (id y masa mostrada). */
  measurementId?: string;
  massG?: number;
  tubeTemperatureC?: number;
  heatingCycle?: number;
  safetyCode?: string;
  stateHash: string;
}

type Listener = (events: SimEvent[]) => void;

const MAX_STEPS_PER_FRAME = 500;
const MAX_FRAME_S = 0.25;

export class StoichRuntime {
  readonly ctx: StoichContext = CTX5;
  actions: Practice05Event[];
  timeScale = 1;
  paused = false;
  private acc = 0;
  private lastSeq: number;
  private listeners = new Set<Listener>();
  private lastValve: Record<string, { v: number; t: number }> = {};
  private lastRider: Record<number, number> = {};

  constructor(public world: P5World, public attemptId: string, actions: Practice05Event[] = []) {
    this.actions = actions;
    this.lastSeq = world.evidence.__eventSeq ?? 0;
  }

  onEvents(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  dispatch(cmd: P5Command): P5DispatchResult {
    const w = this.world;
    const prevSupport = cmd.type === 'setPose' ? w.objects[cmd.id]?.support : undefined;
    const r = dispatchStoich(w, cmd, this.ctx);
    if (this.shouldLog(cmd, prevSupport)) this.actions.push(this.toAction(cmd, r));
    this.flush();
    return r;
  }

  private shouldLog(cmd: P5Command, prevSupport?: string): boolean {
    if (UNLOGGED_P5_COMMANDS.has(cmd.type) && cmd.type !== 'setPose') return false;
    if (cmd.type === 'setPose') return cmd.support !== undefined && cmd.support !== prevSupport && cmd.support !== 'hand';
    if (cmd.type === 'setRider') {
      // Arrastrar la pesa fina produce muchos ajustes: se registra uno cada 2 s por brazo.
      const t = this.world.timeS;
      if (t - (this.lastRider[cmd.beam] ?? -99) < 2) return false;
      this.lastRider[cmd.beam] = t;
      return true;
    }
    if (cmd.type === 'turnZeroScrew') return Math.abs(cmd.deltaG) >= 0.02 || this.actions[this.actions.length - 1]?.action !== 'turnZeroScrew';
    if (cmd.type === 'gas') {
      const c = cmd.cmd;
      if (c.type === 'setPose') return c.support !== undefined && c.support !== this.world.gas.objects[c.id]?.support && c.support !== 'hand';
      if (c.type === 'setHoseMid' || c.type === 'setFilterAlignment') return false;
      if (c.type === 'setValve') {
        const last = this.lastValve[c.valve];
        const t = this.world.timeS;
        if (last && Math.abs(last.v - c.value) < 0.08 && c.value > 0.01 && t - last.t < 2) return false;
        this.lastValve[c.valve] = { v: c.value, t };
      }
    }
    return true;
  }

  private toAction(cmd: P5Command, r: P5DispatchResult): Practice05Event {
    const w = this.world;
    const c = cmd as Record<string, unknown>;
    const action = cmd.type === 'gas' ? `gas:${cmd.cmd.type}${cmd.cmd.type === 'setValve' ? `:${cmd.cmd.valve}` : ''}` : cmd.type;
    const m = cmd.type === 'readBalance' ? w.measurements[w.measurements.length - 1] : undefined;
    return {
      attemptId: this.attemptId,
      sequence: this.actions.length + 1,
      timestampMs: Math.round(w.timeS * 1000),
      action,
      objectId: (c.id as string) ?? (c.spatulaId as string) ?? undefined,
      targetId: (c.targetId as string) ?? (c.bottleId as string) ?? (c.support as string) ?? undefined,
      measurementId: m?.id,
      massG: m?.displayedMassG,
      tubeTemperatureC: Math.round(tubeTempC(w.tube) * 10) / 10,
      heatingCycle: w.tube.cycles.length,
      safetyCode: r.ok ? undefined : r.code,
      stateHash: this.stateHash(),
    };
  }

  stateHash(): string {
    return stableHash({ t: this.world.tick, ...p5Summary(this.world) });
  }

  advance(realDtS: number): number {
    if (this.paused || this.world.safety.stoppedByTeacher) return 0;
    const dtS = this.world.params.dtS;
    this.acc += Math.min(realDtS, MAX_FRAME_S) * this.timeScale;
    let n = 0;
    while (this.acc >= dtS && n < MAX_STEPS_PER_FRAME) {
      stepStoich(this.world, this.ctx);
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
