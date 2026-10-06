/**
 * Puente entre la simulación de la Práctica 6 (paso fijo, determinista) y la aplicación.
 * - `dispatch(command)` aplica el comando y registra solo las acciones con significado (§22.3).
 * - `advance(dt)` acumula tiempo real × escala y ejecuta pasos fijos (el resultado no depende de los fps).
 */
import type { P6World, SimEvent } from '../../simulation/calorimetry-world/types';
import { UNLOGGED_P6_COMMANDS, type P6Command, type P6DispatchResult } from '../../simulation/calorimetry-world/commands';
import { dispatchCalor, p6Summary, stepCalor, cupWaterC } from '../../simulation/calorimetry-world/world';
import { stableHash } from '../../simulation/core/math';
import type { TapeRecorder } from '../platform/tape';

/** §28.2 — evento de la práctica 6 (encadenado por hash con el anterior). */
export interface Practice06Event {
  attemptId: string;
  sequence: number;
  timestampMs: number;
  action: string;
  objectId?: string;
  targetId?: string;
  /** Lectura asociada (balanza `m…`, termómetro `t…` o probeta `v…`) y su valor. */
  readingId?: string;
  value?: number;
  calorimeterC?: number;
  runs?: number;
  safetyCode?: string;
  previousHash: string;
  stateHash: string;
}

type Listener = (events: SimEvent[]) => void;

const MAX_STEPS_PER_FRAME = 500;
const MAX_FRAME_S = 0.25;

export class CalorRuntime {
  /** Cinta de comandos para repetir el intento (verificación de la entrega); null en la demostración. */
  tape: TapeRecorder | null = null;
  actions: Practice06Event[];
  timeScale = 1;
  paused = false;
  private acc = 0;
  private lastSeq: number;
  private listeners = new Set<Listener>();
  private lastRider: Record<number, number> = {};
  private lastStir = -99;

  constructor(public world: P6World, public attemptId: string, actions: Practice06Event[] = []) {
    this.actions = actions;
    this.lastSeq = world.evidence.__eventSeq ?? 0;
  }

  onEvents(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  dispatch(cmd: P6Command): P6DispatchResult {
    const w = this.world;
    const prevSupport = cmd.type === 'setPose' ? w.objects[cmd.id]?.support : undefined;
    this.tape?.record(w.tick, cmd);
    const r = dispatchCalor(w, cmd);
    if (this.shouldLog(cmd, prevSupport)) this.actions.push(this.toAction(cmd, r));
    this.flush();
    return r;
  }

  private shouldLog(cmd: P6Command, prevSupport?: string): boolean {
    if (UNLOGGED_P6_COMMANDS.has(cmd.type) && cmd.type !== 'setPose') return false;
    if (cmd.type === 'setPose') return cmd.support !== undefined && cmd.support !== prevSupport && cmd.support !== 'hand';
    if (cmd.type === 'setRider') {
      // Arrastrar la pesa fina produce muchos ajustes: se registra uno cada 2 s por brazo.
      const t = this.world.timeS;
      if (t - (this.lastRider[cmd.beam] ?? -99) < 2) return false;
      this.lastRider[cmd.beam] = t;
      return true;
    }
    if (cmd.type === 'turnZeroScrew') return Math.abs(cmd.deltaG) >= 0.02 || this.actions[this.actions.length - 1]?.action !== 'turnZeroScrew';
    if (cmd.type === 'stir') {
      // Agitar produce muchos comandos: uno registrado cada 3 s.
      if (this.world.timeS - this.lastStir < 3) return false;
      this.lastStir = this.world.timeS;
    }
    if (cmd.type === 'setPour') return !this.world.pours[cmd.sourceId] || this.world.pours[cmd.sourceId].startedS === this.world.timeS;
    if (cmd.type === 'setThermoDepth' || cmd.type === 'setTubeDepth') return false;
    return true;
  }

  private toAction(cmd: P6Command, r: P6DispatchResult): Practice06Event {
    const w = this.world;
    const c = cmd as Record<string, unknown>;
    const action = cmd.type === 'bomb' ? `bomb:${cmd.cmd.type}` : cmd.type;
    const prev = this.actions[this.actions.length - 1]?.stateHash ?? '0';
    return {
      attemptId: this.attemptId,
      sequence: this.actions.length + 1,
      timestampMs: Math.round(w.timeS * 1000),
      action,
      objectId: (c.id as string) ?? (c.sourceId as string) ?? (c.tubeId as string) ?? undefined,
      targetId: (c.targetId as string) ?? (c.support as string) ?? (c.to as string) ?? (c.from as string) ?? undefined,
      readingId: r.id,
      value: r.value,
      calorimeterC: Math.round(cupWaterC(w) * 1000) / 1000,
      runs: w.runs.length,
      safetyCode: r.ok ? undefined : r.code,
      previousHash: prev,
      stateHash: stableHash({ prev, t: w.tick, a: action, ...p6Summary(w) }),
    };
  }

  stateHash(): string {
    return stableHash({ t: this.world.tick, ...p6Summary(this.world) });
  }

  advance(realDtS: number): number {
    if (this.paused || this.world.safety.stoppedByTeacher) return 0;
    const dtS = this.world.params.dtS;
    this.acc += Math.min(realDtS, MAX_FRAME_S) * this.timeScale;
    let n = 0;
    while (this.acc >= dtS && n < MAX_STEPS_PER_FRAME) {
      stepCalor(this.world);
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
