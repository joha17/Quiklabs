/**
 * Reacciones de la Práctica 8 (§3.1, §5.3) como matrices estequiométricas enteras y cálculo del reactivo limitante
 * (§3.3): ξ_max = min_i(n_i,0/ν_i), n_P = ν_P·ξ_max, m_teórica = M_P·n_P. Las cantidades de partida son las REALMENTE
 * dispensadas (con su pureza), nunca las de las instrucciones.
 */
import { ELEMENTS, SPECIES, type Element, type Mol, type SpeciesId } from './species';

export type RouteId = 'ISO' | 'ASA' | 'MS';

export interface Reaction {
  id: string;
  /** Coeficientes: negativos = reactivos, positivos = productos. */
  nu: Partial<Record<SpeciesId, number>>;
}

/** Reacción principal de cada ruta (r0). */
export const MAIN_REACTION: Record<RouteId, Reaction> = {
  ISO: { id: 'fischer_iso', nu: { IAA: -1, AcOH: -1, IAAc: 1, H2O: 1 } },
  ASA: { id: 'acetylation', nu: { SA: -1, AA: -1, ASA: 1, AcOH: 1 } },
  MS: { id: 'fischer_ms', nu: { SA: -1, MeOH: -1, MeSal: 1, H2O: 1 } },
};

/** Reacciones laterales y de lavado (r1…). */
export const SIDE_REACTIONS: Record<string, Reaction> = {
  /** Hidrólisis del anhídrido (ASA, r1). */
  anhydride_hydrolysis: { id: 'anhydride_hydrolysis', nu: { AA: -1, H2O: -1, AcOH: 2 } },
  /** Neutralización en el lavado con bicarbonato. */
  neut_acetic: { id: 'neut_acetic', nu: { AcOH: -1, NaHCO3: -1, NaOAc: 1, H2O: 1, CO2: 1 } },
  neut_salicylic: { id: 'neut_salicylic', nu: { SA: -1, NaHCO3: -1, NaSal: 1, H2O: 1, CO2: 1 } },
  neut_sulfuric: { id: 'neut_sulfuric', nu: { H2SO4: -1, NaHCO3: -2, Na2SO4: 1, H2O: 2, CO2: 2 } },
};

/** Producto deseado de cada ruta. */
export const PRODUCT: Record<RouteId, SpeciesId> = { ISO: 'IAAc', ASA: 'ASA', MS: 'MeSal' };

/** Balance elemental de una reacción: debe ser cero para cada elemento. */
export function elementBalance(r: Reaction): Record<Element, number> {
  const out = Object.fromEntries(ELEMENTS.map((e) => [e, 0])) as Record<Element, number>;
  for (const [s, nu] of Object.entries(r.nu) as Array<[SpeciesId, number]>) for (const [e, a] of Object.entries(SPECIES[s].atoms) as Array<[Element, number]>) out[e] += nu * a;
  return out;
}

/** Extensión máxima y reactivo limitante para una reacción con las cantidades disponibles (mol). */
export function limiting(r: Reaction, available: Mol): { xiMax: number; limiting: SpeciesId | null } {
  let xi = Infinity;
  let lim: SpeciesId | null = null;
  for (const [s, nu] of Object.entries(r.nu) as Array<[SpeciesId, number]>) {
    if (nu >= 0) continue;
    const x = (available[s] ?? 0) / -nu;
    if (x < xi) {
      xi = x;
      lim = s;
    }
  }
  return { xiMax: Number.isFinite(xi) ? xi : 0, limiting: lim };
}

/** Masa teórica del producto (g) desde los moles disponibles de los reactivos (§3.3). */
export function theoreticalMassG(route: RouteId, available: Mol): number {
  const r = MAIN_REACTION[route];
  const p = PRODUCT[route];
  return limiting(r, available).xiMax * (r.nu[p] ?? 1) * SPECIES[p].molarMass;
}

/** Aplica Δξ de una reacción a un inventario, acotado por la disponibilidad (nunca negativo). */
export function applyExtent(m: Mol, r: Reaction, dXi: number): number {
  let x = dXi;
  if (x > 0) {
    for (const [s, nu] of Object.entries(r.nu) as Array<[SpeciesId, number]>) if (nu < 0) x = Math.min(x, (m[s] ?? 0) / -nu);
  } else if (x < 0) {
    for (const [s, nu] of Object.entries(r.nu) as Array<[SpeciesId, number]>) if (nu > 0) x = Math.max(x, -(m[s] ?? 0) / nu);
  }
  if (x === 0) return 0;
  for (const [s, nu] of Object.entries(r.nu) as Array<[SpeciesId, number]>) {
    const n = (m[s] ?? 0) + nu * x;
    if (n <= 1e-15) delete m[s];
    else m[s] = n;
  }
  return x;
}

/** Rendimientos de la libreta (§3.3): aparente, y corregido solo con pureza cuantitativa. Nunca se recorta a 100 %. */
export function yields(isolatedG: number, theoreticalG: number, purityMassFraction: number | null) {
  const apparent = theoreticalG > 0 ? (100 * isolatedG) / theoreticalG : NaN;
  const corrected = purityMassFraction === null || theoreticalG <= 0 ? null : (100 * isolatedG * purityMassFraction) / theoreticalG;
  return { apparent, corrected };
}
