/**
 * Estática y balances de F10 (§6, `conservation.ts` propio de la práctica):
 * - Masa: viga, carga y probetas no cambian (solo se mudan entre estante, viga, pórtico, cuña y prensa).
 * - Equilibrio de la viga: con apoyos unilaterales (solo empujan), ΣF = 0 y Στ = 0 dan R_A y R_B; si una saldría
 *   negativa, la viga no puede estar en equilibrio y vuelca sobre el otro apoyo.
 * - Energía: en el vuelco la energía potencial de la viga y la carga pasa a cinética y se disipa en el tope. En la
 *   prensa el trabajo de la manivela queda como energía elástica de la probeta (½ F ΔL_e) o se disipa como trabajo
 *   plástico. E_mec + E_elástica + E_disipada − W_externo ≈ 0.
 */
import type { F10World, SupportId } from './types';

/** Fuerzas verticales hacia abajo sobre la viga (N) con su coordenada (cm), incluida la mano si la sostiene. */
export function beamForces(w: F10World): Array<{ F: number; s: number; m: number }> {
  const p = w.params;
  const out = [{ F: p.beamKg * p.g, s: w.cgS, m: p.beamKg }];
  const L = w.loads.load1;
  if (L.where === 'beam') out.push({ F: p.loadKg * p.g, s: L.s, m: p.loadKg });
  if (w.beam.hand) out.push({ F: p.handN, s: p.handS, m: 0 });
  return out;
}

export interface Statics {
  W: number;
  /** Coordenada de la resultante (cm). */
  xr: number;
  RA: number;
  RB: number;
  /** Apoyo de cada lado (lo = el de menor s). */
  lo: SupportId;
  hi: SupportId;
  span: number;
}

/** Reacciones de dos apoyos puntuales (N); pueden salir negativas: eso es la condición de vuelco. */
export function staticsF10(w: F10World): Statics {
  const fs = beamForces(w);
  const W = fs.reduce((a, f) => a + f.F, 0);
  const M = fs.reduce((a, f) => a + f.F * f.s, 0);
  const xr = W > 0 ? M / W : w.cgS;
  const sA = w.supports.A.s;
  const sB = w.supports.B.s;
  const lo: SupportId = sA <= sB ? 'A' : 'B';
  const hi: SupportId = lo === 'A' ? 'B' : 'A';
  const sLo = w.supports[lo].s;
  const sHi = w.supports[hi].s;
  const span = sHi - sLo;
  let Rhi: number;
  if (span < 1e-6) Rhi = Math.abs(xr - sLo) < 1e-9 ? W / 2 : xr > sLo ? Infinity : -Infinity;
  else Rhi = (W * (xr - sLo)) / span;
  const Rlo = W - Rhi;
  return { W, xr, RA: lo === 'A' ? Rlo : Rhi, RB: lo === 'A' ? Rhi : Rlo, lo, hi, span };
}

/** Momento de inercia (kg·m²) de la viga con su carga respecto de un filo en s_p (cm). */
export function pivotInertia(w: F10World, sp: number): number {
  const p = w.params;
  const L = p.beamLenCm / 100;
  let I = p.beamKg * (L * L / 12 + ((w.cgS - sp) / 100) ** 2);
  const ld = w.loads.load1;
  if (ld.where === 'beam') I += p.loadKg * ((ld.s - sp) / 100) ** 2;
  return I;
}

/** Torque de la gravedad respecto del filo (N·m, + baja el extremo derecho) con la viga girada `angle`. */
export function pivotTorque(w: F10World, sp: number, angle: number): number {
  return beamForces(w).filter((f) => f.m > 0).reduce((a, f) => a + f.F * ((f.s - sp) / 100) * Math.cos(angle), 0);
}

/** Energía potencial de la viga que vuelca respecto de la viga nivelada (J). */
export function tipPotentialJ(w: F10World): number {
  const b = w.beam;
  if (!b.pivot) return 0;
  const sp = w.supports[b.pivot].s;
  return -beamForces(w).filter((f) => f.m > 0).reduce((a, f) => a + f.F * ((f.s - sp) / 100) * Math.sin(b.angle), 0);
}

export const tipKineticJ = (w: F10World) => (w.beam.pivot ? 0.5 * pivotInertia(w, w.supports[w.beam.pivot].s) * w.beam.omega ** 2 : 0);

/** Energía elástica almacenada en la probeta (J): ½ F ΔL_e con ΔL_e = F L₀ / (E A). */
export function elasticJ(w: F10World): number {
  const sp = w.press.specimen ? w.specimens[w.press.specimen] : null;
  if (!sp) return 0;
  const m = w.params.materials[w.params.material];
  const A = (Math.PI * (sp.dMm * 1e-3) ** 2) / 4;
  const F = w.press.forceN;
  return (F * F * (w.params.L0mm * 1e-3)) / (2 * m.E * A);
}

export const mechanicalEnergyF10 = (w: F10World) => tipPotentialJ(w) + tipKineticJ(w) + elasticJ(w);

/** Residuo del balance (J): debería quedar en el orden del error del integrador. */
export const energyResidualF10 = (w: F10World) => mechanicalEnergyF10(w) + w.energy.dissipatedJ - w.energy.externalJ;

export const massesTotalG = (w: F10World) => (w.params.beamKg + w.params.loadKg) * 1000 + Object.keys(w.specimens).length * 46;

export function conservedTotalsF10(w: F10World): Record<string, number> {
  return { massesG: massesTotalG(w) };
}
