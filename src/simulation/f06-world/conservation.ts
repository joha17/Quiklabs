/**
 * Balances de F06 (§6, `conservation.ts` propio de la práctica):
 * - Masa: carro, pesas, porta-pesas y esfera no cambian (solo se mudan entre estante, soporte, carro y balanza).
 * - Energía: elástica de cada resorte (½ k x² en el tramo lineal, con la rigidización más allá de x_lin), cinética y
 *   potencial gravitatoria del carro sobre el perfil del riel, de la carga colgada del soporte y de la esfera del
 *   péndulo. Rodadura, patín, amortiguadores, freno, histéresis de un resorte dañado, el émbolo que se detiene y los
 *   golpes son energía DISIPADA; la mano (comprimir, empujar, cargar, levantar la columna o apartar la esfera) es
 *   trabajo EXTERNO. En todo instante E_mecánica + E_disipada − W_externo ≈ 0.
 */
import type { F06World } from './types';
import { GEOF06, trackSlope, trackZ } from './geometry';

/** Rigidez efectiva (N/m) de un resorte: nominal × factor propio × daño. */
export function springKOf(w: F06World, id: string): number {
  const s = w.springs[id];
  if (!s) return w.params.springK;
  return w.params.springK * s.kFactor * (s.damaged ? w.params.damagedFactor : 1);
}

/** Fuerza del resorte (N) para una deformación x (m): lineal hasta x_lin y más rígido después. */
export function springForce(w: F06World, id: string, x: number): number {
  const k = springKOf(w, id);
  const a = Math.abs(x);
  const extra = a > w.params.xLin ? w.params.kNL * k * (a - w.params.xLin) ** 2 : 0;
  return Math.sign(x) * (k * a + extra);
}

/** Energía elástica (J) para una deformación x (m). */
export function springEnergy(w: F06World, id: string, x: number): number {
  const k = springKOf(w, id);
  const a = Math.abs(x);
  const extra = a > w.params.xLin ? (w.params.kNL * k * (a - w.params.xLin) ** 3) / 3 : 0;
  return 0.5 * k * a * a + extra;
}

export const springAt = (w: F06World, at: 'stand' | 'launcher') => Object.keys(w.springs).find((id) => w.springs[id].at === at) ?? null;

/** Masa colgada del resorte del soporte (kg): porta-pesas y pesas ranuradas. */
export function hangingKg(w: F06World): number {
  if (!w.stand.hangerOn) return 0;
  let m = w.params.hangerKg;
  for (const [id, o] of Object.entries(w.objects)) if (o.kind === 'slotMass' && o.support === 'hanger') m += w.params.slotKg[id] ?? 0;
  return m;
}

export const slotsOnHanger = (w: F06World) => Object.values(w.objects).filter((o) => o.kind === 'slotMass' && o.support === 'hanger').length;

export function cartLoadKg(w: F06World): number {
  let m = 0;
  for (const [id, o] of Object.entries(w.objects)) if (o.kind === 'cartMass' && o.support === 'cart') m += w.params.cartMassKg[id] ?? 0;
  return m;
}

export const cartKgF6 = (w: F06World) => w.params.cartKg + cartLoadKg(w);

/** Compresión del resorte del lanzador (m) con el carro donde está. */
export function launcherCompression(w: F06World): number {
  const c = w.cart;
  if (c.on !== 'track' || !springAt(w, 'launcher')) return 0;
  if (c.latched) return c.compression;
  return Math.max(0, GEOF06.launcher.plunger0 - (c.s - GEOF06.cart.halfM));
}

export function standEnergyJ(w: F06World): number {
  const id = springAt(w, 'stand');
  if (!id || !w.stand.hangerOn) return 0;
  const m = hangingKg(w);
  const st = w.stand;
  return 0.5 * m * st.v * st.v + springEnergy(w, id, st.x) - m * w.params.g * st.x;
}

export function cartEnergyJ(w: F06World): number {
  const c = w.cart;
  if (c.on !== 'track') return 0;
  const m = cartKgF6(w);
  const h = w.track.h;
  const zp = trackSlope(c.s, h);
  const comp = launcherCompression(w);
  const sp = springAt(w, 'launcher');
  const plunger = comp > 0 && !c.latched ? 0.5 * w.params.plungerKg * c.v * c.v : 0;
  return 0.5 * m * (1 + zp * zp) * c.v * c.v + plunger + m * w.params.g * trackZ(c.s, h) + (sp ? springEnergy(w, sp, comp) : 0);
}

export function pendEnergyJ(w: F06World): number {
  const p = w.pend;
  const m = w.params.bobKg;
  const g = w.params.g;
  const th = (p.thetaDeg * Math.PI) / 180;
  return 0.5 * m * p.L * p.L * p.omega * p.omega + m * g * p.L * (1 - Math.cos(th)) + 0.5 * m * p.vy * p.vy + 0.5 * m * (g / p.L) * p.y * p.y;
}

export function mechanicalEnergyJ(w: F06World): number {
  return standEnergyJ(w) + cartEnergyJ(w) + pendEnergyJ(w);
}

/** Residuo del balance (J): debería quedar en el orden del error del integrador. */
export const energyResidualJ = (w: F06World) => mechanicalEnergyJ(w) + w.energy.dissipatedJ - w.energy.externalJ;

export function massesTotalG(w: F06World): number {
  const p = w.params;
  const sum = (r: Record<string, number>) => Object.values(r).reduce((s, x) => s + x, 0);
  return (p.hangerKg + sum(p.slotKg) + p.cartKg + sum(p.cartMassKg) + p.bobKg) * 1000;
}

export function conservedTotalsF06(w: F06World): Record<string, number> {
  return { massesG: massesTotalG(w) };
}
