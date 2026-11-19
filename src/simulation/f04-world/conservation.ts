/**
 * Balances de F04 (§6, `conservation.ts` propio de la práctica):
 * - Masa: la suma de cuerpo del carro, sensores, portapesas, pesas ranuradas y carros de la pareja no cambia (las pesas
 *   solo se mudan entre el estante, el portapesas, el carro y la balanza).
 * - Energía: cinética del carro y del portapesas, rotacional de la polea, potencial del portapesas (y del carro en el
 *   carril inclinado), cinética de la pareja y elástica de sus parachoques. El roce, el freno, los tirones del cordel, el
 *   aterrizaje del portapesas y los choques son energía DISIPADA; el empuje de la mano y lo que el estudiante sube o baja
 *   es trabajo EXTERNO. En todo instante E_mecánica + E_disipada − W_externo ≈ 0 (salvo el error del integrador).
 * - Momento: en la pareja, el impulso de la mano iguala al momento total más el que se llevaron el roce y los topes.
 */
import type { F04World } from './types';
import { PAIR_TOUCH_M, STRING_Z } from './geometry';

export const hangMassKg = (w: F04World) => {
  if (!w.string.hung) return 0;
  const p = w.params;
  let m = p.hangerKg;
  for (const [id, o] of Object.entries(w.objects)) if (o.kind === 'slotMass' && o.support === 'hanger01') m += p.slotKg[id] ?? 0;
  return m;
};

export const cartMassKg = (w: F04World) => {
  const p = w.params;
  let m = p.cartBodyKg + p.forceSensorKg + p.accelKg;
  for (const [id, o] of Object.entries(w.objects)) if (o.kind === 'slotMass' && o.support === 'cart01') m += p.slotKg[id] ?? 0;
  return m;
};

export const pulleyMassKg = (w: F04World) => (w.params.pulleyR > 0 ? w.params.pulleyI / (w.params.pulleyR * w.params.pulleyR) : 0);

export function cartEnergyJ(w: F04World): number {
  const p = w.params;
  const mc = cartMassKg(w);
  const sin = Math.sin((w.track.tiltDeg * Math.PI) / 180);
  let e = 0.5 * mc * w.cart.v * w.cart.v - mc * p.g * sin * w.cart.s;
  if (w.string.hung && !w.string.held) {
    const mh = hangMassKg(w);
    e += 0.5 * (mh + pulleyMassKg(w)) * w.string.vh * w.string.vh + mh * p.g * (STRING_Z / 100 - w.string.depth);
  }
  return e;
}

export function pairEnergyJ(w: F04World): number {
  const p = w.params;
  const pr = w.pair;
  const d = Math.max(0, PAIR_TOUCH_M - (pr.xQ - pr.xP));
  return 0.5 * p.pairPKg * pr.vP * pr.vP + 0.5 * p.pairQKg * pr.vQ * pr.vQ + 0.5 * p.pairK * d * d;
}

export const mechanicalEnergyJ = (w: F04World) => cartEnergyJ(w) + pairEnergyJ(w);

/** Residuo del balance (J): debería quedar en el orden del error del integrador. */
export const energyResidualJ = (w: F04World) => mechanicalEnergyJ(w) + w.energy.dissipatedJ - w.energy.externalJ;

export function massesTotalG(w: F04World): number {
  const p = w.params;
  return (p.cartBodyKg + p.forceSensorKg + p.accelKg + p.hangerKg + Object.values(p.slotKg).reduce((s, x) => s + x, 0) + p.pairPKg + p.pairQKg) * 1000;
}

export const pairMomentum = (w: F04World) => w.params.pairPKg * w.pair.vP + w.params.pairQKg * w.pair.vQ;

export function conservedTotalsF04(w: F04World): Record<string, number> {
  return { massesG: massesTotalG(w) };
}
