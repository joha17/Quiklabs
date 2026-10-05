/**
 * Puente entre la simulación de la Práctica 4 (paso fijo, determinista) y la aplicación.
 * - `dispatch(command)` aplica el comando y registra solo las acciones con significado (§22.3).
 * - `advance(dt)` acumula tiempo real × escala y ejecuta pasos fijos (el resultado no depende de los fps).
 */
import type { P4World, SimEvent } from '../../simulation/reaction-world/types';
import { UNLOGGED_P4_COMMANDS, type P4Command, type P4DispatchResult } from '../../simulation/reaction-world/commands';
import { dispatchReaction, p4Summary, stepReaction, vesselPH, type ReactionContext } from '../../simulation/reaction-world/world';
import { stableHash } from '../../simulation/core/math';
import { contextFor } from '../../practices/practice-04';

/** §22.3 — evento de la práctica 4. */
export interface Practice04Event {
  attemptId: string;
  sequence: number;
  timestampMs: number;
  action: string;
  sourceId?: string;
  targetId?: string;
  transferredVolumeMl?: number;
  transferredSpeciesMol?: Record<string, number>;
  pH?: number;
  temperatureC?: number;
  reactionExtentsMol?: Record<string, number>;
  safetyCode?: string;
  stateHash: string;
}

type Listener = (events: SimEvent[]) => void;

const MAX_STEPS_PER_FRAME = 500;
const MAX_FRAME_S = 0.25;

const round = (v: number, d = 6) => Math.round(v * 10 ** d) / 10 ** d;

export class ReactionRuntime {
  readonly ctx: ReactionContext;
  actions: Practice04Event[];
  timeScale = 1;
  paused = false;
  private acc = 0;
  private lastSeq: number;
  private listeners = new Set<Listener>();
  private lastValve: Record<string, { v: number; t: number }> = {};

  constructor(public world: P4World, public attemptId: string, actions: Practice04Event[] = []) {
    this.ctx = contextFor(world);
    this.actions = actions;
    this.lastSeq = world.evidence.__eventSeq ?? 0;
  }

  onEvents(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  dispatch(cmd: P4Command): P4DispatchResult {
    const w = this.world;
    const prevSupport = cmd.type === 'setPose' ? w.objects[cmd.id]?.support : undefined;
    const r = dispatchReaction(w, cmd, this.ctx);
    if (this.shouldLog(cmd, prevSupport)) this.actions.push(this.toAction(cmd, r));
    this.flush();
    return r;
  }

  private shouldLog(cmd: P4Command, prevSupport?: string): boolean {
    if (UNLOGGED_P4_COMMANDS.has(cmd.type)) return false;
    if (cmd.type === 'setPose') return cmd.support !== undefined && cmd.support !== prevSupport;
    if (cmd.type === 'gas') {
      const c = cmd.cmd;
      if (c.type === 'setPose') return c.support !== undefined && c.support !== this.world.gas.objects[c.id]?.support;
      if (c.type === 'setHoseMid' || c.type === 'setFilterAlignment') return false;
      if (c.type === 'setValve') {
        const last = this.lastValve[c.valve];
        const t = this.world.timeS;
        if (last && Math.abs(last.v - c.value) < 0.08 && c.value > 0.01 && t - last.t < 2) return false;
        this.lastValve[c.valve] = { v: c.value, t };
      }
    }
    // Los vertidos se registran al empezar y al cambiar de receptor, no cada ajuste de caudal.
    if (cmd.type === 'setPour') {
      const p = this.world.pours[cmd.sourceId];
      return !p || p.startedS === this.world.timeS;
    }
    return true;
  }

  private toAction(cmd: P4Command, r: P4DispatchResult): Practice04Event {
    const w = this.world;
    const c = cmd as Record<string, unknown>;
    const source = (c.sourceId as string) ?? (c.dropperId as string) ?? (c.washId as string) ?? (c.id as string) ?? (c.tongsId as string) ?? undefined;
    const target = (c.targetId as string) ?? (c.support as string) ?? undefined;
    const tv = target && w.vessels[target] ? w.vessels[target] : null;
    const last = tv?.additions[tv.additions.length - 1];
    const action = cmd.type === 'gas' ? `gas:${cmd.cmd.type}${cmd.cmd.type === 'setValve' ? `:${cmd.cmd.valve}` : ''}` : cmd.type;
    return {
      attemptId: this.attemptId,
      sequence: this.actions.length + 1,
      timestampMs: Math.round(w.timeS * 1000),
      action,
      sourceId: source,
      targetId: target,
      transferredVolumeMl: cmd.type === 'stopPour' ? round(w.pours[cmd.sourceId]?.transferredMl ?? 0, 3) : last && w.timeS - last.t < 0.2 ? round(last.volumeMl, 3) : undefined,
      transferredSpeciesMol: last && w.timeS - last.t < 0.2 ? Object.fromEntries(Object.entries(last.mol).filter(([k]) => k !== 'H2O').map(([k, v]) => [k, round(v, 9)])) : undefined,
      pH: tv ? round(vesselPH(tv), 2) : undefined,
      temperatureC: tv ? round(tv.temperatureC, 2) : undefined,
      reactionExtentsMol: tv ? Object.fromEntries(Object.entries(tv.extents).map(([k, v]) => [k, round(v, 9)])) : undefined,
      safetyCode: r.ok ? undefined : r.code,
      stateHash: this.stateHash(),
    };
  }

  stateHash(): string {
    return stableHash({ t: this.world.tick, ...p4Summary(this.world) });
  }

  advance(realDtS: number): number {
    if (this.paused || this.world.safety.stoppedByTeacher) return 0;
    const dtS = this.world.params.dtS;
    this.acc += Math.min(realDtS, MAX_FRAME_S) * this.timeScale;
    let n = 0;
    while (this.acc >= dtS && n < MAX_STEPS_PER_FRAME) {
      stepReaction(this.world, this.ctx);
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
