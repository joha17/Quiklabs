/**
 * Estequiometría de la producción de CO₂ (§1.3, §10.2, §12.2):
 *   CH₃COOH(aq) + NaHCO₃(aq) → CH₃COONa(aq) + CO₂(g) + H₂O(l)   (1 : 1 : 1)
 * El vinagre declara la base de su porcentaje (m/m, m/v o v/v): los moles de ácido dependen de ella.
 */

export const MOLAR = {
  NaHCO3: 84.0066,
  CH3COOH: 60.052,
  CH3COONa: 82.0338,
  CO2: 44.0095,
  H2O: 18.0153,
} as const;

export type Species = keyof typeof MOLAR;
type Formula = Partial<Record<'C' | 'H' | 'O' | 'Na', number>>;

export const FORMULA: Record<Species, Formula> = {
  NaHCO3: { Na: 1, H: 1, C: 1, O: 3 },
  CH3COOH: { C: 2, H: 4, O: 2 },
  CH3COONa: { C: 2, H: 3, O: 2, Na: 1 },
  CO2: { C: 1, O: 2 },
  H2O: { H: 2, O: 1 },
};

export interface EquationSide {
  [s: string]: number;
}

/** Diferencia de átomos (productos − reactivos) de una ecuación; vacía si está balanceada. */
export function atomImbalance(reactants: EquationSide, products: EquationSide): Record<string, number> {
  const acc: Record<string, number> = {};
  const add = (side: EquationSide, sign: number) => {
    for (const [sp, k] of Object.entries(side)) {
      const f = FORMULA[sp as Species];
      if (!f) continue;
      for (const [el, n] of Object.entries(f)) acc[el] = (acc[el] ?? 0) + sign * k * (n ?? 0);
    }
  };
  add(products, 1);
  add(reactants, -1);
  return Object.fromEntries(Object.entries(acc).filter(([, v]) => Math.abs(v) > 1e-12));
}

/** La ecuación correcta de la práctica. */
export const REACTION = { reactants: { CH3COOH: 1, NaHCO3: 1 }, products: { CH3COONa: 1, CO2: 1, H2O: 1 } };

export type VinegarBasis = 'm/m' | 'm/v' | 'v/v';

export interface VinegarProfile {
  /** Porcentaje declarado de ácido acético. */
  percent: number;
  basis: VinegarBasis;
  /** Densidad del vinagre (g/mL). */
  densityGmL: number;
  /** Fracción del ácido declarado realmente presente (pureza). */
  purity: number;
  /** Incertidumbre relativa del porcentaje. */
  uRel: number;
}

/** Densidad del ácido acético glacial (g/mL), para la base v/v. */
const ACETIC_DENSITY = 1.049;

/** Masa de ácido acético (g) en `ml` mL de vinagre según la base declarada. */
export function aceticGrams(v: VinegarProfile, ml: number): number {
  const f = v.percent / 100;
  const g = v.basis === 'm/m' ? f * ml * v.densityGmL : v.basis === 'm/v' ? f * ml : f * ml * ACETIC_DENSITY;
  return g * v.purity;
}

export const aceticMoles = (v: VinegarProfile, ml: number) => aceticGrams(v, ml) / MOLAR.CH3COOH;

/** Moles de NaHCO₃ en una alícuota (§10.2). */
export function aliquotMoles(massG: number, flaskMl: number, aliquotMl: number): { nTotal: number; conc: number; nAliquot: number } {
  const nTotal = massG / MOLAR.NaHCO3;
  const conc = nTotal / (flaskMl / 1000);
  return { nTotal, conc, nAliquot: conc * (aliquotMl / 1000) };
}

/** Reactivo limitante y CO₂ máximo (§12.2). */
export function limiting(nAcid: number, nBicarb: number): { limiting: 'CH3COOH' | 'NaHCO3' | 'NONE'; nCO2: number } {
  if (nAcid <= 0 || nBicarb <= 0) return { limiting: 'NONE', nCO2: 0 };
  return { limiting: nAcid < nBicarb ? 'CH3COOH' : 'NaHCO3', nCO2: Math.min(nAcid, nBicarb) };
}
