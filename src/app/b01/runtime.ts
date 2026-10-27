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

export class OpticalRuntime {
  /** Cinta de comandos para repetir el intento (verificación de la entrega); null en la demostración. */
  tape: TapeRecorder | null = null;
  actions: PracticeB01Event[];
  timeScale = 1;
  paused = false;
  private acc = 0;
  private lastSeq: number;
  private listeners = new Set<Listener>();

  constructor(public world: OpticalWorld, public attemptId: string, actions: PracticeB01Event[] = []) {
    this.actions = actions;
    this.lastSeq = world.evidence.__eventSeq ?? 0;
  }

  onEvents(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  dispatch(cmd: B01Command): B01DispatchResult {
    const w = this.world;
    this.tape?.record(w.tick, cmd);
    const prevSupport = cmd.type === 'setPose' ? w.objects[cmd.id]?.support : undefined;
    const inGesture = !!w.gesture;
    const r = dispatchB01(w, cmd);
    if (this.shouldLog(cmd, prevSupport, inGesture)) this.actions.push(this.toAction(cmd, r));
    this.flush();
    return r;
  }

  private shouldLog(cmd: B01Command, prevSupport?: string, inGesture = false): boolean {
    if (cmd.type === 'setPose') return cmd.support !== undefined && cmd.support !== prevSupport && cmd.support !== 'hand';
    // Un arrastre sobre una pieza se registra una vez, al soltarla (no cada paso del mando).
    if (cmd.type === 'gesture') return cmd.phase === 'end';
    if (inGesture && GESTURE_STEPS.has(cmd.type)) return false;
    if (UNLOGGED_B01_COMMANDS.has(cmd.type)) return false;
    return true;
  }

  private toAction(cmd: B01Command, r: B01DispatchResult): PracticeB01Event {
    const w = this.world;
    const { type, ...payload } = cmd as Record<string, unknown> & { type: string };
    const ids = ['id', 'sourceId', 'targetId', 'slideId', 'coverId', 'toolId', 'dispenserId', 'observationId'].map((k) => payload[k]).filter((x): x is string => typeof x === 'string');
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
      stateHash: stableHash({ prev, t: w.tick, a: type, ...b01Summary(w) }),
    };
  }

  stateHash(): string {
    return stableHash({ t: this.world.tick, ...b01Summary(this.world) });
  }

  advance(realDtS: number): number {
    if (this.paused || this.world.safety.stoppedByTeacher) return 0;
    const dtS = this.world.params.dtS;
    this.acc += Math.min(realDtS, MAX_FRAME_S) * this.timeScale;
    let n = 0;
    while (this.acc >= dtS && n < MAX_STEPS_PER_FRAME) {
      stepB01World(this.world);
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
