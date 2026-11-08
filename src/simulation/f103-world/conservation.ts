/**
 * Balances de F103 (§6, `conservation.ts` propio de la práctica):
 * - Masa e inventario de esferas (ninguna se pierde ni aparece: «balance de proyectiles» del cierre).
 * - Energía: resorte cargado + energía mecánica de la esfera en vuelo (cinética + m g z con z del centro sobre el suelo).
 *   Cargar el resorte o lanzar a mano es trabajo EXTERNO; el rendimiento del resorte, el tope del émbolo, el retroceso del
 *   soporte frenado por el suelo, el arrastre del aire y los choques son energía DISIPADA. En todo instante:
 *   E_mecánica + E_disipada − W_externo = 0 (salvo el error del integrador, que la prueba acota).
 * - Momento: en un disparo sin anclar, el impulso que recibe el soporte es igual y opuesto al de la esfera y el émbolo.
 */
import type { F103World } from './types';

export const springEnergyJ = (w: F103World) => {
  const p = w.params;
  const x = p.notchM[w.launcher.notch] ?? 0;
  return 0.5 * p.springK * p.springTrueFactor * x * x;
};

export function flightEnergyJ(w: F103World): number {
  const f = w.flight;
  if (!f || f.done) return 0;
  return 0.5 * f.massKg * (f.vx * f.vx + f.vy * f.vy + f.vz * f.vz) + f.massKg * w.params.g * f.z;
}

export const mechanicalEnergyJ = (w: F103World) => springEnergyJ(w) + flightEnergyJ(w);

/** Residuo del balance (J): debería quedar en el orden del error del integrador. */
export const energyResidualJ = (w: F103World) => mechanicalEnergyJ(w) + w.energy.dissipatedJ - w.energy.externalJ;

export const massesTotalG = (w: F103World) => Object.values(w.balls).reduce((s, b) => s + b.massKg * 1000, 0);

export function conservedTotalsF103(w: F103World): Record<string, number> {
  return { massesG: massesTotalG(w), balls: Object.keys(w.balls).length };
}
