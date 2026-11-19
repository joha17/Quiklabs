/**
 * Balances de F05 (§6, `conservation.ts` propio de la práctica):
 * - Masa: bloque y lastres no cambian (los lastres solo se mudan entre el estante, el bloque, la balanza o la mesada).
 * - Energía: cinética del bloque, potencial gravitatoria a lo largo del plano (m g s sen θ) y elástica del resorte del
 *   dinamómetro. El roce de Coulomb, el amortiguador del resorte y los golpes contra el tope son energía DISIPADA; el
 *   tirador (husillo o motor) y la mano (elevar el tablero con el bloque encima, devolver el bloque) son trabajo
 *   EXTERNO. En todo instante E_mecánica + E_disipada − W_externo ≈ 0 (salvo el error del integrador). Un roce con el
 *   signo invertido (F05-E12) daría energía sin fuente: la prueba de conservación lo detectaría.
 */
import type { F05World } from './types';

export const blockLoadKg = (w: F05World) => {
  let m = 0;
  for (const [id, o] of Object.entries(w.objects)) if (o.kind === 'ballast' && o.support === 'block01') m += w.params.ballastKg[id] ?? 0;
  return m;
};

export const blockMassKg = (w: F05World) => w.params.blockKg + blockLoadKg(w);

export const thetaDegF5 = (w: F05World) => w.plane.relDeg + w.plane.baseDeg;

export function mechanicalEnergyJ(w: F05World): number {
  const b = w.block;
  const pu = w.puller;
  const spring = 0.5 * w.params.springK * Math.max(0, pu.ext) ** 2;
  if (b.on !== 'plane') return spring;
  const m = blockMassKg(w);
  const sin = Math.sin((thetaDegF5(w) * Math.PI) / 180);
  return 0.5 * m * b.v * b.v + m * w.params.g * sin * b.s + spring;
}

/** Residuo del balance (J): debería quedar en el orden del error del integrador. */
export const energyResidualJ = (w: F05World) => mechanicalEnergyJ(w) + w.energy.dissipatedJ - w.energy.externalJ;

export function massesTotalG(w: F05World): number {
  const p = w.params;
  return (p.blockKg + Object.values(p.ballastKg).reduce((s, x) => s + x, 0)) * 1000;
}

export function conservedTotalsF05(w: F05World): Record<string, number> {
  return { massesG: massesTotalG(w) };
}
