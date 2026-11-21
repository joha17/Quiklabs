/**
 * Balances de F11 (§6, `conservation.ts` propio de la práctica):
 * - Volumen y masa de líquido: tanque + depósito B + vaso de rebose + colector + probeta + residuos + derrame + tubo de
 *   rebose − agua aportada por el grifo = lo inicial (§3.4). El grifo es el único flujo externo y se contabiliza.
 * - Masa de los sólidos: bloques, botella y lastres no cambian (solo se mudan entre estante, tanque, balanza y soporte).
 * - Superficie libre horizontal: el nivel del tanque es (V_líquido + Σ V_sumergido) / A; el del vaso de rebose, igual.
 * No hay energía relevante almacenada (los transitorios de flotación se amortiguan por viscosidad).
 */
import type { F11World, FloatId, FluidId, Volumes } from './types';

export const FLOATS: FloatId[] = ['float1', 'bottle1', 'alu1'];

export const tankAreaCm2 = (w: F11World) => w.params.tank.L * w.params.tank.W;
export const canAreaCm2 = (w: F11World) => (Math.PI * w.params.can.dCm ** 2) / 4;
export const sumVol = (v: Volumes) => v.A + v.B;
export const rhoOf = (w: F11World, f: FluidId) => (f === 'A' ? w.params.rhoA : w.params.rhoB);
export const massOfG = (w: F11World, v: Volumes) => (v.A * w.params.rhoA + v.B * w.params.rhoB) / 1000;

/** Densidad media del líquido del tanque (kg/m³; 0 vacío). */
export function tankRho(w: F11World): number {
  const V = sumVol(w.tank.vol);
  return V > 1e-9 ? (massOfG(w, w.tank.vol) * 1000) / V : 0;
}

/** Fracción minoritaria del tanque (0 puro; 0,5 mitad y mitad). */
export function minorityFraction(w: F11World): number {
  const V = sumVol(w.tank.vol);
  return V > 1e-9 ? Math.min(w.tank.vol.A, w.tank.vol.B) / V : 0;
}

/** Medidas del sólido de un objeto (cm). La botella se trata como cilindro de base circular. */
export function solidOf(w: F11World, id: FloatId): { area: number; H: number; footprint: number } {
  const p = w.params;
  if (id === 'bottle1') return { area: (Math.PI * p.bottle.L ** 2) / 4, H: p.bottle.H, footprint: p.bottle.L };
  const s = id === 'alu1' ? p.alu : p.block;
  return { area: s.L * s.W, H: s.H, footprint: s.L };
}

export const volumeOf = (w: F11World, id: FloatId) => solidOf(w, id).area * solidOf(w, id).H;

/** Masa del objeto (g), con el lastre de la botella. */
export function massOfObjG(w: F11World, id: FloatId): number {
  const p = w.params;
  if (id === 'bottle1') return p.bottle.dryG + w.floats.bottle1.ballastG;
  const s = id === 'alu1' ? p.alu : p.block;
  return (s.rho * s.L * s.W * s.H) / 1000;
}

/** Volumen sumergido de un objeto del tanque con el nivel L (cm³). */
export function subVolume(w: F11World, id: FloatId, L: number): number {
  const f = w.floats[id];
  if (f.where !== 'tank') return 0;
  const s = solidOf(w, id);
  return s.area * Math.max(0, Math.min(s.H, L - f.zb));
}

/** Nivel del tanque (cm) con los objetos sumergidos: se resuelve por punto fijo (converge en pocas pasadas). */
export function tankLevel(w: F11World): number {
  const A = tankAreaCm2(w);
  const V = sumVol(w.tank.vol);
  let L = V / A;
  for (let i = 0; i < 6; i++) {
    const sub = FLOATS.reduce((s, id) => s + subVolume(w, id, L), 0);
    L = (V + sub) / A;
  }
  return L;
}

/** Volumen sumergido del bloque del dinamómetro y nivel del vaso de rebose (cm³, cm) con el bloque a zb. */
export function canState(w: F11World, vol: number = w.can.vol): { level: number; sub: number } {
  const Ac = canAreaCm2(w);
  const a = w.params.alu;
  const Ab = a.L * a.W;
  const L0 = vol / Ac;
  if (!w.dyn.holding || w.stand.zb >= L0) return { level: L0, sub: 0 };
  const zb = Math.max(0, w.stand.zb);
  let L = (vol - Ab * zb) / (Ac - Ab);
  if (L - zb > a.H) L = (vol + Ab * a.H) / Ac;
  const sub = Ab * Math.max(0, Math.min(a.H, L - zb));
  return { level: L, sub };
}

export const massesTotalG = (w: F11World) => {
  const p = w.params;
  return massOfObjG(w, 'float1') + massOfObjG(w, 'alu1') + p.bottle.dryG + p.ballasts[p.ballasts.length - 1] + p.cyl.dryG + p.catchDryG;
};

/** Volumen total de líquido del sistema menos lo aportado por el grifo (cm³): se conserva. */
export function liquidTotal(w: F11World): number {
  return sumVol(w.tank.vol) + w.resB + w.can.vol + w.can.catchVol + w.cyl.vol + sumVol(w.waste) + sumVol(w.spill) + sumVol(w.overflow) - w.supplied;
}

export function conservedTotalsF11(w: F11World): Record<string, number> {
  return { liquidCm3: liquidTotal(w), massesG: massesTotalG(w) };
}
