import type { SubstanceTable } from '../substances/types';
import type { Mixture, Severity, SimEvent, Vessel, World } from '../entities/types';
import {
  addAmounts, addMix, liquidVolumeMl, mixAmounts, pourInto, solidVolumeMl, takeAllFraction,
} from '../solutions/mixture';

export interface SimContext {
  subs: SubstanceTable;
}

const MAX_EVENTS = 3000;

export function emit(
  w: World,
  code: string,
  severity: Severity,
  extra?: { vesselId?: string; params?: SimEvent['params'] },
): SimEvent {
  const seq = (w.evidence.__eventSeq ?? 0) + 1;
  w.evidence.__eventSeq = seq;
  const e: SimEvent = { seq, t: Math.round(w.timeS * 100) / 100, code, severity, ...extra };
  w.events.push(e);
  if (w.events.length > MAX_EVENTS) w.events.splice(0, w.events.length - MAX_EVENTS);
  return e;
}

/** Emite un evento solo una vez por clave (bandera en `evidence`). */
export function emitOnce(
  w: World,
  key: string,
  code: string,
  severity: Severity,
  extra?: { vesselId?: string; params?: SimEvent['params'] },
): void {
  const k = `once:${key}`;
  if (w.evidence[k]) return;
  w.evidence[k] = 1;
  emit(w, code, severity, extra);
}

export function bump(w: World, key: string, by = 1): void {
  w.evidence[key] = (w.evidence[key] ?? 0) + by;
}

/** Derrame sobre la mesada: se contabiliza como «derramada» (§4.8). */
export function spill(w: World, part: Mixture, ctx: SimContext, reason: string): void {
  const a = mixAmounts(part);
  if (Object.keys(a).length === 0) return;
  addAmounts(w.ledger.spilled, a);
  const ml = liquidVolumeMl(part, ctx.subs);
  w.bench.spillMl += ml;
  bump(w, `spill:${reason}`, ml);
  bump(w, 'spillTotalMl', ml);
  if (w.bench.spillMl >= w.params.safety.majorSpillMl && !w.bench.spillOpen) {
    w.bench.spillOpen = true;
    w.safety.block = { code: 'SPILL_UNCLEANED' };
    emit(w, 'SAFETY_SPILL_MAJOR', 'CRITICAL', { params: { ml: Math.round(w.bench.spillMl * 10) / 10 } });
  }
}

/** Volumen ocupado (líquido + sólidos) en mL. */
export function occupiedMl(v: Vessel, ctx: SimContext): number {
  return liquidVolumeMl(v.mix, ctx.subs) + solidVolumeMl(v.mix, ctx.subs);
}

/**
 * Entrega una porción a un recipiente receptor. Lo que excede su capacidad rebosa y se derrama.
 * Si el receptor no existe o está roto, todo es derrame.
 */
export function deliver(
  w: World,
  part: Mixture,
  tempC: number,
  target: Vessel | null,
  ctx: SimContext,
  reason: string,
): void {
  if (!target || target.integrity === 0 || target.tipped) {
    spill(w, part, ctx, reason);
    return;
  }
  pourInto(target, part, tempC, ctx.subs, w.params.cpWater);
  const occ = occupiedMl(target, ctx);
  if (occ > target.capacityMl && target.type !== 'WASTE') {
    const lv = liquidVolumeMl(target.mix, ctx.subs);
    if (lv > 0) {
      const over = Math.min(lv, occ - target.capacityMl);
      const out = takeAllFraction(target.mix, over / Math.max(occ, 1e-9));
      spill(w, out, ctx, 'overflow');
      emitOnce(w, `overflow:${target.id}:${Math.floor(w.timeS / 10)}`, 'VESSEL_OVERFLOW', 'ALERT', { vesselId: target.id });
    }
  }
}

/** Añade sin mezcla térmica (para herramientas). */
export function addRaw(target: Vessel, part: Mixture): void {
  addMix(target.mix, part);
}
