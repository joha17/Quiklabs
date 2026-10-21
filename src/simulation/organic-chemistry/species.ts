/**
 * Especies de la Práctica 8 (síntesis orgánica comparativa, §3): fórmula elemental, masa molar, densidad del líquido,
 * fase de referencia, punto de ebullición, reparto entre fases y peligrosidad. Las masas molares provienen de las
 * fórmulas y de PubChem (§3.2); el resto de propiedades son valores CURRICULARES `[PENDIENTE]` (densidades, puntos de
 * ebullición, coeficientes de reparto) que deben cotejarse antes de publicar (§7).
 *
 * Toda la materia del mundo se guarda como MOLES de estas especies por compartimento; la masa es Σ n·M.
 */

export type SpeciesId =
  | 'SA' | 'AA' | 'ASA' | 'AcOH' | 'IAA' | 'IAAc' | 'MeOH' | 'MeSal' | 'H2O'
  | 'H3PO4' | 'H2SO4' | 'NaHCO3' | 'NaOAc' | 'NaSal' | 'Na2SO4' | 'CO2' | 'Na2SO4w';

export type Element = 'C' | 'H' | 'O' | 'Na' | 'P' | 'S';

export interface SpeciesSpec {
  id: SpeciesId;
  formula: string;
  atoms: Partial<Record<Element, number>>;
  /** g/mol (calculada desde la fórmula con masas atómicas estándar). */
  molarMass: number;
  /** Fase a 25 °C. */
  phase: 'solid' | 'liquid' | 'gas';
  /** Densidad del líquido puro (g/mL) a 25 °C (curricular). */
  densityGml?: number;
  /** Punto de ebullición normal (°C), para volatilidad y el módulo de fracciones (curricular). */
  bpC?: number;
  /** Reparto orgánico/acuoso K_D = c_org/c_aq en el sistema de lavado de esta práctica (curricular). */
  kD?: number;
  /** Se disuelve en la fase acuosa como sal o soluto iónico (no pasa a la orgánica). */
  aqueousOnly?: boolean;
  flammable?: boolean;
  corrosive?: boolean;
  toxic?: boolean;
  refs: string[];
}

const ATOMIC: Record<Element, number> = { C: 12.011, H: 1.008, O: 15.999, Na: 22.99, P: 30.974, S: 32.06 };
const mm = (atoms: Partial<Record<Element, number>>) => Object.entries(atoms).reduce((s, [e, n]) => s + ATOMIC[e as Element] * (n ?? 0), 0);
const PEND = '[PENDIENTE] densidad, ebullición y reparto curriculares: cotejar con bibliografía experimental';

/** Masas molares de la tabla §3.2 (PubChem); las demás se calculan desde la fórmula. La conservación se verifica por ÁTOMOS. */
const TABLE_M: Partial<Record<SpeciesId, number>> = { SA: 138.12, AA: 102.09, ASA: 180.16, AcOH: 60.05, IAA: 88.15, IAAc: 130.18, MeOH: 32.042, MeSal: 152.15, H2O: 18.015 };

const S = (id: SpeciesId, formula: string, atoms: SpeciesSpec['atoms'], rest: Omit<SpeciesSpec, 'id' | 'formula' | 'atoms' | 'molarMass'>): SpeciesSpec => ({ id, formula, atoms, molarMass: TABLE_M[id] ?? mm(atoms), ...rest });

export const SPECIES: Record<SpeciesId, SpeciesSpec> = {
  SA: S('SA', 'C7H6O3', { C: 7, H: 6, O: 3 }, { phase: 'solid', kD: 15, refs: ['PubChem CID 338', PEND] }),
  AA: S('AA', 'C4H6O3', { C: 4, H: 6, O: 3 }, { phase: 'liquid', densityGml: 1.08, bpC: 139.8, kD: 2, corrosive: true, refs: [PEND] }),
  ASA: S('ASA', 'C9H8O4', { C: 9, H: 8, O: 4 }, { phase: 'solid', kD: 10, refs: ['PubChem CID 2244', PEND] }),
  AcOH: S('AcOH', 'C2H4O2', { C: 2, H: 4, O: 2 }, { phase: 'liquid', densityGml: 1.049, bpC: 118, kD: 0.3, corrosive: true, flammable: true, refs: ['PubChem CID 176', PEND] }),
  IAA: S('IAA', 'C5H12O', { C: 5, H: 12, O: 1 }, { phase: 'liquid', densityGml: 0.81, bpC: 131, kD: 30, flammable: true, refs: ['PubChem CID 31260', PEND] }),
  IAAc: S('IAAc', 'C7H14O2', { C: 7, H: 14, O: 2 }, { phase: 'liquid', densityGml: 0.876, bpC: 142, kD: 400, flammable: true, refs: ['PubChem CID 31276', PEND] }),
  MeOH: S('MeOH', 'CH4O', { C: 1, H: 4, O: 1 }, { phase: 'liquid', densityGml: 0.792, bpC: 64.7, kD: 0.1, flammable: true, toxic: true, refs: ['PubChem CID 887', PEND] }),
  MeSal: S('MeSal', 'C8H8O3', { C: 8, H: 8, O: 3 }, { phase: 'liquid', densityGml: 1.174, bpC: 222, kD: 500, refs: ['PubChem CID 4133', PEND] }),
  H2O: S('H2O', 'H2O', { H: 2, O: 1 }, { phase: 'liquid', densityGml: 0.997, bpC: 100, kD: 0.004, refs: ['masa molar estándar'] }),
  H3PO4: S('H3PO4', 'H3PO4', { H: 3, P: 1, O: 4 }, { phase: 'liquid', densityGml: 1.685, kD: 0.001, aqueousOnly: true, corrosive: true, refs: ['catalizador de la ruta ASA (ácido FOSFÓRICO, §3.4)', PEND] }),
  H2SO4: S('H2SO4', 'H2SO4', { H: 2, S: 1, O: 4 }, { phase: 'liquid', densityGml: 1.83, kD: 0.001, aqueousOnly: true, corrosive: true, refs: ['catalizador de Fischer (rutas ISO y MS)', PEND] }),
  NaHCO3: S('NaHCO3', 'NaHCO3', { Na: 1, H: 1, C: 1, O: 3 }, { phase: 'solid', aqueousOnly: true, refs: [PEND] }),
  NaOAc: S('NaOAc', 'C2H3NaO2', { C: 2, H: 3, Na: 1, O: 2 }, { phase: 'solid', aqueousOnly: true, refs: [PEND] }),
  NaSal: S('NaSal', 'C7H5NaO3', { C: 7, H: 5, Na: 1, O: 3 }, { phase: 'solid', aqueousOnly: true, refs: [PEND] }),
  Na2SO4: S('Na2SO4', 'Na2SO4', { Na: 2, S: 1, O: 4 }, { phase: 'solid', aqueousOnly: true, refs: ['agente desecante anhidro', PEND] }),
  /** Agua retenida por el desecante (hidrato): se cuenta como H2O, pero en el sólido del desecante. */
  Na2SO4w: S('Na2SO4w', 'H2O (hidrato)', { H: 2, O: 1 }, { phase: 'solid', refs: ['agua de hidratación del desecante'] }),
  CO2: S('CO2', 'CO2', { C: 1, O: 2 }, { phase: 'gas', refs: ['producto de neutralizar con bicarbonato'] }),
};

export const ELEMENTS: Element[] = ['C', 'H', 'O', 'Na', 'P', 'S'];

/** Moles de cada especie (≥ 0). */
export type Mol = Partial<Record<SpeciesId, number>>;

export function molTotal(m: Mol): number {
  let s = 0;
  for (const v of Object.values(m)) s += v ?? 0;
  return s;
}

/** Masa total (g) = Σ n·M. */
export function massG(m: Mol): number {
  let g = 0;
  for (const [k, n] of Object.entries(m) as Array<[SpeciesId, number]>) g += (n ?? 0) * SPECIES[k].molarMass;
  return g;
}

/** Átomos de cada elemento (mol de átomos) en un inventario. */
export function elementTotals(m: Mol): Record<Element, number> {
  const out: Record<Element, number> = { C: 0, H: 0, O: 0, Na: 0, P: 0, S: 0 };
  for (const [k, n] of Object.entries(m) as Array<[SpeciesId, number]>) for (const [e, a] of Object.entries(SPECIES[k].atoms) as Array<[Element, number]>) out[e] += (n ?? 0) * a;
  return out;
}

/** a += b·f (en el lugar), limpiando restos numéricos. */
export function molAddInto(a: Mol, b: Mol, f = 1): Mol {
  for (const [k, v] of Object.entries(b) as Array<[SpeciesId, number]>) {
    const n = (a[k] ?? 0) + (v ?? 0) * f;
    if (Math.abs(n) < 1e-15) delete a[k];
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

/** Volumen de los LÍQUIDOS (mL, aditivo: simplificación curricular). Los solutos sólidos disueltos no suman volumen. */
export function liquidMl(m: Mol): number {
  let ml = 0;
  for (const [k, n] of Object.entries(m) as Array<[SpeciesId, number]>) {
    const s = SPECIES[k];
    if (s.phase === 'liquid' && s.densityGml) ml += ((n ?? 0) * s.molarMass) / s.densityGml;
  }
  return ml;
}

export const fromGrams = (id: SpeciesId, g: number): Mol => ({ [id]: g / SPECIES[id].molarMass });
export const fromMl = (id: SpeciesId, ml: number, massFraction = 1): Mol => ({ [id]: (ml * (SPECIES[id].densityGml ?? 1) * massFraction) / SPECIES[id].molarMass });
export const speciesIn = (m: Mol, min = 1e-12): SpeciesId[] => (Object.entries(m) as Array<[SpeciesId, number]>).filter(([, n]) => (n ?? 0) > min).map(([k]) => k);
