/**
 * Especies de la Práctica 9 (identificación de cationes, §3): iones en disolución, agua y los dos precipitados de la
 * marcha (SrSO₄ y Fe(OH)₃). Toda la materia del mundo está en MOLES por especie y por compartimento; la masa es Σ n·M,
 * la conservación se verifica por ELEMENTOS (Sr, Fe, K, Na, Li, Ca, S, N, Cl, O, H) y la electroneutralidad por la carga
 * (§3.3). Masas molares desde las masas atómicas estándar.
 *
 * Reactivos curriculares `[MODELO]`: el sulfato se dosifica como (NH₄)₂SO₄ y el medio alcalino como NH₄OH modelado
 * como OH⁻ disponible + NH₄⁺, para no introducir sodio ni potasio que interfieran con la llama (decisión P9-04).
 */

export type SpeciesId =
  | 'H2O' | 'H+' | 'OH-' | 'Sr2+' | 'Fe3+' | 'K+' | 'Na+' | 'Li+' | 'Ca2+' | 'SO4^2-' | 'NO3-' | 'Cl-' | 'NH4+'
  | 'SrSO4(s)' | 'FeOH3(s)';

export type Element = 'Sr' | 'Fe' | 'K' | 'Na' | 'Li' | 'Ca' | 'S' | 'N' | 'Cl' | 'O' | 'H';
export const ELEMENTS: Element[] = ['Sr', 'Fe', 'K', 'Na', 'Li', 'Ca', 'S', 'N', 'Cl', 'O', 'H'];

export interface SpeciesSpec {
  id: SpeciesId;
  formula: string;
  atoms: Partial<Record<Element, number>>;
  charge: number;
  molarMass: number;
  phase: 'liquid' | 'aqueous' | 'solid';
}

const ATOMIC: Record<Element, number> = { Sr: 87.62, Fe: 55.845, K: 39.098, Na: 22.99, Li: 6.94, Ca: 40.078, S: 32.06, N: 14.007, Cl: 35.45, O: 15.999, H: 1.008 };
const mm = (atoms: Partial<Record<Element, number>>) => Object.entries(atoms).reduce((s, [e, n]) => s + ATOMIC[e as Element] * (n ?? 0), 0);
const S = (id: SpeciesId, formula: string, atoms: SpeciesSpec['atoms'], charge: number, phase: SpeciesSpec['phase']): SpeciesSpec => ({ id, formula, atoms, charge, phase, molarMass: mm(atoms) });

export const SPECIES: Record<SpeciesId, SpeciesSpec> = {
  'H2O': S('H2O', 'H₂O', { H: 2, O: 1 }, 0, 'liquid'),
  'H+': S('H+', 'H⁺', { H: 1 }, 1, 'aqueous'),
  'OH-': S('OH-', 'OH⁻', { O: 1, H: 1 }, -1, 'aqueous'),
  'Sr2+': S('Sr2+', 'Sr²⁺', { Sr: 1 }, 2, 'aqueous'),
  'Fe3+': S('Fe3+', 'Fe³⁺', { Fe: 1 }, 3, 'aqueous'),
  'K+': S('K+', 'K⁺', { K: 1 }, 1, 'aqueous'),
  'Na+': S('Na+', 'Na⁺', { Na: 1 }, 1, 'aqueous'),
  'Li+': S('Li+', 'Li⁺', { Li: 1 }, 1, 'aqueous'),
  'Ca2+': S('Ca2+', 'Ca²⁺', { Ca: 1 }, 2, 'aqueous'),
  'SO4^2-': S('SO4^2-', 'SO₄²⁻', { S: 1, O: 4 }, -2, 'aqueous'),
  'NO3-': S('NO3-', 'NO₃⁻', { N: 1, O: 3 }, -1, 'aqueous'),
  'Cl-': S('Cl-', 'Cl⁻', { Cl: 1 }, -1, 'aqueous'),
  'NH4+': S('NH4+', 'NH₄⁺', { N: 1, H: 4 }, 1, 'aqueous'),
  'SrSO4(s)': S('SrSO4(s)', 'SrSO₄(s)', { Sr: 1, S: 1, O: 4 }, 0, 'solid'),
  'FeOH3(s)': S('FeOH3(s)', 'Fe(OH)₃(s)', { Fe: 1, O: 3, H: 3 }, 0, 'solid'),
};

export type Mol = Partial<Record<SpeciesId, number>>;

/** Densidad del agua a 25 °C (g/mL); el volumen de una disolución diluida se toma como el de su agua `[MODELO]`. */
export const WATER_DENSITY = 0.997;

export const molTotal = (m: Mol) => Object.values(m).reduce((s: number, n) => s + (n ?? 0), 0);

export function massG(m: Mol): number {
  let g = 0;
  for (const [k, n] of Object.entries(m) as Array<[SpeciesId, number]>) g += (n ?? 0) * SPECIES[k].molarMass;
  return g;
}

export const volumeMl = (m: Mol) => ((m.H2O ?? 0) * SPECIES.H2O.molarMass) / WATER_DENSITY;

export function elementTotals(m: Mol): Record<Element, number> {
  const out = Object.fromEntries(ELEMENTS.map((e) => [e, 0])) as Record<Element, number>;
  for (const [k, n] of Object.entries(m) as Array<[SpeciesId, number]>) for (const [e, a] of Object.entries(SPECIES[k].atoms) as Array<[Element, number]>) out[e] += (n ?? 0) * a;
  return out;
}

export function chargeTotal(m: Mol): number {
  let q = 0;
  for (const [k, n] of Object.entries(m) as Array<[SpeciesId, number]>) q += (n ?? 0) * SPECIES[k].charge;
  return q;
}

/** a += b·f (en el lugar), limpiando restos numéricos. */
export function molAddInto(a: Mol, b: Mol, f = 1): Mol {
  for (const [k, v] of Object.entries(b) as Array<[SpeciesId, number]>) {
    const n = (a[k] ?? 0) + (v ?? 0) * f;
    if (Math.abs(n) < 1e-18) delete a[k];
    else a[k] = n;
  }
  return a;
}

/** Quita una fracción f (0–1) de un inventario y la devuelve. */
export function molTake(m: Mol, f: number): Mol {
  const part: Mol = {};
  const k = Math.max(0, Math.min(1, f));
  for (const [s, n] of Object.entries(m) as Array<[SpeciesId, number]>) part[s] = (n ?? 0) * k;
  molAddInto(m, part, -1);
  return part;
}

export const speciesIn = (m: Mol, min = 1e-15): SpeciesId[] => (Object.entries(m) as Array<[SpeciesId, number]>).filter(([, n]) => (n ?? 0) > min).map(([k]) => k);

/** Disolución de `ml` mL con las sales indicadas (mol/L), electroneutra por construcción. */
export function solution(ml: number, salts: Array<{ salt: Salt; molL: number }>): Mol {
  const out: Mol = { H2O: (ml * WATER_DENSITY) / SPECIES.H2O.molarMass };
  for (const { salt, molL } of salts) {
    const n = (molL * ml) / 1000;
    for (const [ion, nu] of SALTS[salt]) out[ion] = (out[ion] ?? 0) + nu * n;
  }
  return out;
}

/** Sales y reactivos de la práctica como (ion, coeficiente) (§3.1). */
export const SALTS = {
  'Sr(NO3)2': [['Sr2+', 1], ['NO3-', 2]],
  'Fe(NO3)3': [['Fe3+', 1], ['NO3-', 3]],
  'KNO3': [['K+', 1], ['NO3-', 1]],
  'NaCl': [['Na+', 1], ['Cl-', 1]],
  'LiCl': [['Li+', 1], ['Cl-', 1]],
  'CaCl2': [['Ca2+', 1], ['Cl-', 2]],
  'HNO3': [['H+', 1], ['NO3-', 1]],
  '(NH4)2SO4': [['NH4+', 2], ['SO4^2-', 1]],
  'NH4OH': [['NH4+', 1], ['OH-', 1]],
} as const satisfies Record<string, ReadonlyArray<readonly [SpeciesId, number]>>;
export type Salt = keyof typeof SALTS;
