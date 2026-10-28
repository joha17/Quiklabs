/**
 * Puente entre la simulación de B01 (paso fijo, determinista) y la aplicación.
 * - `dispatch(command)` aplica el comando y registra solo las acciones con significado: los movimientos continuos
 *   (arrastre, giros de mandos, platina, inclinación del cubreobjetos) no van a la bitácora, pero sí a la cinta del intento;
 *   un gesto sobre una pieza del equipo se anota una sola vez, al soltarla.
 * - `advance(dt)` acumula tiempo real × escala y ejecuta pasos fijos (el resultado no depende de los fps).
 */
import type { OpticalWorld, SimEvent } from '../../simulation/optical-world/types';
import { UNLOGGED_B01_COMMANDS, type B01Command, type B01DispatchResult } from '../../simulation/optical-world/commands';
import { dispatchB01, b01Summary, stepB01World } from '../../simulation/optical-world/world';
import { stableHash } from '../../simulation/core/math';
import type { TapeRecorder } from '../platform/tape';
import type { PermCommand as CellCommand } from '../../simulation/perm-world/commands';

/** Simulación que mueve el runtime: la de B01 por omisión; B02 inyecta la del mundo celular (mismo equipo). */
export interface OpticalSim {
  dispatch(w: OpticalWorld, c: CellCommand): B01DispatchResult;
  step(w: OpticalWorld): void;
  summary(w: OpticalWorld): Record<string, unknown>;
  unlogged?: Set<string>;
}

const B01_SIM: OpticalSim = { dispatch: (w, c) => dispatchB01(w, c as B01Command), step: stepB01World, summary: b01Summary };

/** Evento de la práctica 9 (encadenado por hash con el anterior). */
export interface PracticeB01Event {
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
/** Pasos que emite un gesto continuo sobre los mandos (fuera de la bitácora mientras dura el gesto). */
const GESTURE_STEPS = new Set<B01Command['type']>(['turnTurret', 'setIllumination', 'setDiaphragm', 'setCondenser', 'setStereoZoom', 'setStereoHead', 'setInterpupillary', 'setDiopter']);
const MAX_FRAME_S = 0.25;

export class OpticalRuntime<W extends OpticalWorld = OpticalWorld> {
  /** Cinta de comandos para repetir el intento (verificación de la entrega); null en la demostración. */
  tape: TapeRecorder | null = null;
  actions: PracticeB01Event[];
  timeScale = 1;
  paused = false;
  private acc = 0;
  private lastSeq: number;
  private listeners = new Set<Listener>();

  constructor(public world: W, public attemptId: string, actions: PracticeB01Event[] = [], private sim: OpticalSim = B01_SIM) {
    this.actions = actions;
    this.lastSeq = world.evidence.__eventSeq ?? 0;
  }

  onEvents(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  dispatch(cmd: CellCommand): B01DispatchResult {
    const w = this.world;
    this.tape?.record(w.tick, cmd);
    const prevSupport = cmd.type === 'setPose' ? w.objects[cmd.id]?.support : undefined;
    const inGesture = !!w.gesture;
    const r = this.sim.dispatch(w, cmd);
    if (this.shouldLog(cmd, prevSupport, inGesture)) this.actions.push(this.toAction(cmd, r));
    this.flush();
    return r;
  }

  private shouldLog(cmd: CellCommand, prevSupport?: string, inGesture = false): boolean {
    if (cmd.type === 'setPose') return cmd.support !== undefined && cmd.support !== prevSupport && cmd.support !== 'hand';
    // Un arrastre sobre una pieza se registra una vez, al soltarla (no cada paso del mando).
    if (cmd.type === 'gesture') return cmd.phase === 'end';
    if (inGesture && GESTURE_STEPS.has(cmd.type as B01Command['type'])) return false;
    if (UNLOGGED_B01_COMMANDS.has(cmd.type as B01Command['type']) || this.sim.unlogged?.has(cmd.type)) return false;
    return true;
  }

  private toAction(cmd: CellCommand, r: B01DispatchResult): PracticeB01Event {
    const w = this.world;
    const { type, ...payload } = cmd as Record<string, unknown> & { type: string };
    const ids = ['id', 'sourceId', 'targetId', 'slideId', 'coverId', 'toolId', 'dispenserId', 'observationId', 'swabId', 'objectId', 'containerId'].map((k) => payload[k]).filter((x): x is string => typeof x === 'string');
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
      stateHash: stableHash({ prev, t: w.tick, a: type, ...this.sim.summary(w) }),
    };
  }

  stateHash(): string {
    return stableHash({ t: this.world.tick, ...this.sim.summary(this.world) });
  }

  advance(realDtS: number): number {
    if (this.paused || this.world.safety.stoppedByTeacher) return 0;
    const dtS = this.world.params.dtS;
    this.acc += Math.min(realDtS, MAX_FRAME_S) * this.timeScale;
    let n = 0;
    while (this.acc >= dtS && n < MAX_STEPS_PER_FRAME) {
      this.sim.step(this.world);
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
