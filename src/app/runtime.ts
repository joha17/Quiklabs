/**
 * Puente entre la simulación (paso fijo, determinista) y el resto de la aplicación.
 * - `dispatch(command)` aplica el comando de inmediato y registra la acción con significado (§12).
 * - `advance(dt)` acumula tiempo real × escala y ejecuta pasos fijos (el resultado no depende de los fps, §15).
 */
import type { SimEvent, World } from '../simulation/entities/types';
import type { Command } from '../simulation/world/commands';
import { UNLOGGED_COMMANDS } from '../simulation/world/commands';
import { dispatchMut, stepMut, type DispatchResult } from '../simulation/world/world';
import { mixAmounts } from '../simulation/solutions/mixture';
import { stableHash } from '../simulation/core/math';
import { CTX } from '../practices/practice-02';
import type { TapeRecorder } from './platform/tape';

export interface LabActionEvent {
  attemptId: string;
  sequence: number;
  timestampMs: number;
  action: string;
  actorToolId?: string;
  sourceId?: string;
  targetId?: string;
  quantities?: Record<string, number>;
  stateHash: string;
  safetyCode?: string;
}

type Listener = (events: SimEvent[]) => void;

/** Máximo de pasos por fotograma (evita espirales si el equipo es lento). */
const MAX_STEPS_PER_FRAME = 400;
/** Si la pestaña estuvo oculta, no se "recupera" el tiempo perdido (§14). */
const MAX_FRAME_S = 0.25;

export class LabRuntime {
  /** Cinta de comandos para repetir el intento (verificación de la entrega); null en la demostración. */
  tape: TapeRecorder | null = null;
  readonly ctx = CTX;
  actions: LabActionEvent[];
  timeScale = 1;
  paused = false;
  private acc = 0;
  private lastSeq: number;
  private listeners = new Set<Listener>();

  constructor(public world: World, public attemptId: string, actions: LabActionEvent[] = []) {
    this.actions = actions;
    this.lastSeq = world.evidence.__eventSeq ?? 0;
  }

  onEvents(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  dispatch(cmd: Command): DispatchResult {
    const w = this.world;
    const prevPour = cmd.type === 'setPour' ? w.pours[cmd.sourceId] : undefined;
    this.tape?.record(w.tick, cmd);
    const r = dispatchMut(w, cmd, this.ctx);
    const newPour = cmd.type === 'setPour' && (!prevPour || prevPour.targetId !== cmd.targetId);
    const log = !UNLOGGED_COMMANDS.has(cmd.type) && (cmd.type !== 'setPour' || newPour) && !(cmd.type === 'stopPour' && !(cmd.sourceId in w.pours) && !r.ok);
    if (log && (cmd.type !== 'setPour' || cmd.liquidRateMlS > 0 || cmd.solidRateGS > 0)) {
      this.actions.push(this.toAction(cmd, r));
    }
    this.flush();
    return r;
  }

  private toAction(cmd: Command, r: DispatchResult): LabActionEvent {
    const c = cmd as Record<string, unknown>;
    const quantities: Record<string, number> = {};
    for (const k of ['pct', 'ml', 'drops', 'g', 'cm', 'liquidRateMlS', 'solidRateGS', 'tiltDeg', 'intensity']) {
      if (typeof c[k] === 'number') quantities[k] = c[k] as number;
    }
    return {
      attemptId: this.attemptId,
      sequence: this.actions.length + 1,
      timestampMs: Math.round(this.world.timeS * 1000),
      action: cmd.type,
      actorToolId: (c.toolId as string) ?? undefined,
      sourceId: (c.sourceId as string) ?? (c.id as string) ?? (c.vesselId as string) ?? (c.paperId as string) ?? undefined,
      targetId: (c.targetId as string) ?? (c.support as string) ?? undefined,
      quantities: Object.keys(quantities).length ? quantities : undefined,
      stateHash: this.stateHash(),
      safetyCode: r.ok ? undefined : r.code,
    };
  }

  stateHash(): string {
    const w = this.world;
    const summary: Record<string, unknown> = { t: w.tick };
    for (const id in w.vessels) summary[id] = mixAmounts(w.vessels[id].mix);
    return stableHash(summary);
  }

  /** Avanza la simulación con el tiempo real transcurrido. Devuelve los pasos ejecutados. */
  advance(realDtS: number): number {
    if (this.paused) return 0;
    const dtS = this.world.params.dtS;
    this.acc += Math.min(realDtS, MAX_FRAME_S) * this.timeScale;
    let n = 0;
    while (this.acc >= dtS && n < MAX_STEPS_PER_FRAME) {
      stepMut(this.world, this.ctx);
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
