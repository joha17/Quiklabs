/**
 * Puente entre la simulación de la F07 (paso fijo, determinista) y la aplicación.
 * - `dispatch(command)` aplica el comando y registra solo las acciones con significado: los movimientos continuos
 *   (tornillo de nivelación, compuertas, giro del sensor, carros arrastrados) no van a la bitácora, pero sí a la cinta del intento.
 * - `advance(dt)` acumula tiempo real × escala y ejecuta pasos fijos (el resultado no depende de los fps).
 */
import type { F07World, SimEvent } from '../../simulation/f07-world/types';
import { UNLOGGED_F07_COMMANDS, type F07Command, type F07DispatchResult } from '../../simulation/f07-world/commands';
import { dispatchF07, f07Summary, stepF07World } from '../../simulation/f07-world/world';
import { stableHash } from '../../simulation/core/math';
import type { TapeRecorder } from '../platform/tape';

/** Evento de F07 (encadenado por hash con el anterior). */
export interface PracticeF07Event {
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

export class F07Runtime {
  /** Cinta de comandos para repetir el intento (verificación de la entrega); null en la demostración. */
  tape: TapeRecorder | null = null;
  actions: PracticeF07Event[];
  timeScale = 1;
  paused = false;
  private acc = 0;
  private lastSeq: number;
  private listeners = new Set<Listener>();

  constructor(public world: F07World, public attemptId: string, actions: PracticeF07Event[] = []) {
    this.actions = actions;
    this.lastSeq = world.evidence.__eventSeq ?? 0;
  }

  onEvents(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  dispatch(cmd: F07Command): F07DispatchResult {
    const w = this.world;
    this.tape?.record(w.tick, cmd);
    const prevSupport = cmd.type === 'setPose' ? w.objects[cmd.id]?.support : undefined;
    const r = dispatchF07(w, cmd);
    if (this.shouldLog(cmd, prevSupport)) this.actions.push(this.toAction(cmd, r));
    this.flush();
    return r;
  }

  private shouldLog(cmd: F07Command, prevSupport?: string): boolean {
    if (cmd.type === 'setPose') return cmd.support !== undefined && cmd.support !== prevSupport && cmd.support !== 'hand';
    if (UNLOGGED_F07_COMMANDS.has(cmd.type)) return false;
    return true;
  }

  private toAction(cmd: F07Command, r: F07DispatchResult): PracticeF07Event {
    const w = this.world;
    const { type, ...payload } = cmd as Record<string, unknown> & { type: string };
    const ids = ['id', 'target', 'channel', 'body'].map((k) => payload[k]).filter((x): x is string => typeof x === 'string');
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
      stateHash: stableHash({ prev, t: w.tick, a: type, ...f07Summary(w) }),
    };
  }

  stateHash(): string {
    return stableHash({ t: this.world.tick, ...f07Summary(this.world) });
  }

  advance(realDtS: number): number {
    if (this.paused || this.world.safety.stoppedByTeacher) return 0;
    const dtS = this.world.params.dtS;
    this.acc += Math.min(realDtS, MAX_FRAME_S) * this.timeScale;
    let n = 0;
    while (this.acc >= dtS && n < MAX_STEPS_PER_FRAME) {
      stepF07World(this.world);
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
