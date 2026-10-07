/**
 * Puente entre la simulación de la Práctica 10 (paso fijo, determinista) y la aplicación.
 * - `dispatch(command)` aplica el comando y registra solo las acciones con significado (§33.2): los movimientos
 *   continuos (arrastre, émbolo, agitación) no van a la bitácora, pero sí a la cinta del intento.
 * - `advance(dt)` acumula tiempo real × escala y ejecuta pasos fijos (el resultado no depende de los fps).
 */
import type { P10World, SimEvent } from '../../simulation/gas-world/types';
import { UNLOGGED_P10_COMMANDS, type P10Command, type P10DispatchResult } from '../../simulation/gas-world/commands';
import { dispatchGas, p10Summary, stepGasWorld } from '../../simulation/gas-world/world';
import { stableHash } from '../../simulation/core/math';
import type { TapeRecorder } from '../platform/tape';

/** §33.2 — evento de la práctica 10 (encadenado por hash con el anterior). */
export interface Practice10Event {
  attemptId: string;
  sequence: number;
  timestampMs: number;
  action: string;
  objectIds: string[];
  payload: Record<string, unknown>;
  readingId?: string;
  value?: number;
  safetyCode?: string;
  previousHash: string;
  stateHash: string;
}

type Listener = (events: SimEvent[]) => void;

const MAX_STEPS_PER_FRAME = 500;
const MAX_FRAME_S = 0.25;

export class GasRuntime {
  /** Cinta de comandos para repetir el intento (verificación de la entrega); null en la demostración. */
  tape: TapeRecorder | null = null;
  actions: Practice10Event[];
  timeScale = 1;
  paused = false;
  private acc = 0;
  private lastSeq: number;
  private listeners = new Set<Listener>();

  constructor(public world: P10World, public attemptId: string, actions: Practice10Event[] = []) {
    this.actions = actions;
    this.lastSeq = world.evidence.__eventSeq ?? 0;
  }

  onEvents(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  dispatch(cmd: P10Command): P10DispatchResult {
    const w = this.world;
    this.tape?.record(w.tick, cmd);
    const prevSupport = cmd.type === 'setPose' ? w.objects[cmd.id]?.support : undefined;
    const r = dispatchGas(w, cmd);
    if (this.shouldLog(cmd, prevSupport)) this.actions.push(this.toAction(cmd, r));
    this.flush();
    return r;
  }

  private shouldLog(cmd: P10Command, prevSupport?: string): boolean {
    if (cmd.type === 'setPose') return cmd.support !== undefined && cmd.support !== prevSupport && cmd.support !== 'hand';
    if (UNLOGGED_P10_COMMANDS.has(cmd.type)) return false;
    if (cmd.type === 'setPour') return !this.world.pours[cmd.sourceId] || this.world.pours[cmd.sourceId].startedS === this.world.timeS;
    if (cmd.type === 'squeeze' && cmd.drops < 5) {
      const last = this.actions[this.actions.length - 1];
      return !(last?.action === 'squeeze' && this.world.timeS * 1000 - last.timestampMs < 3000);
    }
    return true;
  }

  private toAction(cmd: P10Command, r: P10DispatchResult): Practice10Event {
    const w = this.world;
    const { type, ...payload } = cmd as Record<string, unknown> & { type: string };
    const ids = ['id', 'sourceId', 'targetId', 'toId', 'fromId'].map((k) => payload[k]).filter((x): x is string => typeof x === 'string');
    const prev = this.actions[this.actions.length - 1]?.stateHash ?? '0';
    return {
      attemptId: this.attemptId,
      sequence: this.actions.length + 1,
      timestampMs: Math.round(w.timeS * 1000),
      action: type,
      objectIds: ids,
      payload: type === 'setPose' ? { support: payload.support } : payload,
      readingId: r.id,
      value: r.value,
      safetyCode: r.ok ? undefined : r.code,
      previousHash: prev,
      stateHash: stableHash({ prev, t: w.tick, a: type, ...p10Summary(w) }),
    };
  }

  stateHash(): string {
    return stableHash({ t: this.world.tick, ...p10Summary(this.world) });
  }

  advance(realDtS: number): number {
    if (this.paused || this.world.safety.stoppedByTeacher) return 0;
    const dtS = this.world.params.dtS;
    this.acc += Math.min(realDtS, MAX_FRAME_S) * this.timeScale;
    let n = 0;
    while (this.acc >= dtS && n < MAX_STEPS_PER_FRAME) {
      stepGasWorld(this.world);
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
