/**
 * Reacciones de la Práctica 4 (§8–§14): ecuaciones balanceadas que usa el motor (el avance se aplica siempre con
 * estos coeficientes) y ecuaciones de referencia por ensayo para el editor y la evaluación (§15).
 * Constantes a 25 °C (nivel educativo, configurables): Ksp de NIST/CRC redondeados; pKa del sistema carbonato 6,35 y
 * 10,33; primera hidrólisis del Fe³⁺ pKa 2,19.
 */
import type { ChemContext, ReactionDef } from '../../simulation/chemistry/types';
import { SPECIES } from './species';

const R = (id: string, kind: ReactionDef['kind'], nu: Record<string, number>, extra: Partial<ReactionDef> = {}): ReactionDef => ({ id, kind, nu, ...extra });

/** Ksp → log K de formación del sólido. */
const fromKsp = (ksp: number) => -Math.log10(ksp);
const FE_OH3_LOGK = fromKsp(4e-38);

export const REACTIONS: Record<string, ReactionDef> = {
  // ── Equilibrios rápidos (ácido–base e hidrólisis) ──
  carbonate1: R('carbonate1', 'ACID_BASE', { 'CO3^2-': -1, H2O: -1, 'HCO3-': 1, 'OH-': 1 }, { logK: -(14 - 10.33) }),
  // HCO₃⁻ + H₂O ⇌ H₂CO₃ + OH⁻ y H₂CO₃ ⇌ CO₂(ac) + H₂O: en total, HCO₃⁻ ⇌ CO₂(ac) + OH⁻.
  carbonate2: R('carbonate2', 'ACID_BASE', { 'HCO3-': -1, 'CO2(aq)': 1, 'OH-': 1 }, { logK: -(14 - 6.35) }),
  ironHydrolysis: R('ironHydrolysis', 'HYDROLYSIS', { 'Fe^3+': -1, H2O: -1, 'FeOH^2+': 1, 'H+': 1 }, { logK: -2.19 }),
  // ── Precipitaciones (formación del sólido, K = 1/Ksp) ──
  caco3: R('caco3', 'PRECIPITATION', { 'Ca^2+': -1, 'CO3^2-': -1, 'CaCO3(s)': 1 }, { logK: fromKsp(3.36e-9), kPrecip: 3.5, kDissolve: 0.01 }),
  // Fe(OH)₃ amorfo recién precipitado (ferrihidrita, log Ksp ≈ −37,4): el FeCl₃ 0,15 M ácido por hidrólisis no
  // precipita solo, y con OH⁻ insuficiente precipita lo que permite la estequiometría 1:3.
  feoh3: R('feoh3', 'PRECIPITATION', { 'Fe^3+': -1, 'OH-': -3, 'Fe(OH)3(s)': 1 }, { logK: FE_OH3_LOGK, kPrecip: 6, kDissolve: 0.05 }),
  // Misma fase sólida desde el hidroxocomplejo (consistente: log K = log K₁ + log Kw − log Ka).
  feoh3b: R('feoh3b', 'PRECIPITATION', { 'FeOH^2+': -1, 'OH-': -2, 'Fe(OH)3(s)': 1 }, { logK: FE_OH3_LOGK - 14 + 2.19, kPrecip: 6, kDissolve: 0.05 }),
  cuoh2: R('cuoh2', 'PRECIPITATION', { 'Cu^2+': -1, 'OH-': -2, 'Cu(OH)2(s)': 1 }, { logK: fromKsp(2.2e-20), kPrecip: 5, kDissolve: 0.05 }),
  caoh2: R('caoh2', 'PRECIPITATION', { 'Ca^2+': -1, 'OH-': -2, 'Ca(OH)2(s)': 1 }, { logK: fromKsp(5.02e-6), kPrecip: 0.8, kDissolve: 0.2 }),
  cuco3: R('cuco3', 'PRECIPITATION', { 'Cu^2+': -1, 'CO3^2-': -1, 'CuCO3(s)': 1 }, { logK: fromKsp(1.4e-10), kPrecip: 3, kDissolve: 0.02 }),
  feoh2: R('feoh2', 'PRECIPITATION', { 'Fe^2+': -1, 'OH-': -2, 'Fe(OH)2(s)': 1 }, { logK: fromKsp(4.87e-17), kPrecip: 4, kDissolve: 0.05 }),
  mgoh2: R('mgoh2', 'PRECIPITATION', { 'Mg^2+': -1, 'OH-': -2, 'Mg(OH)2(s)': 1 }, { logK: fromKsp(5.61e-12), kPrecip: 2, kDissolve: 0.04 }),
  mgco3: R('mgco3', 'PRECIPITATION', { 'Mg^2+': -1, 'CO3^2-': -1, 'MgCO3(s)': 1 }, { logK: fromKsp(6.82e-6), kPrecip: 0.3, kDissolve: 0.05 }),
  aloh3: R('aloh3', 'PRECIPITATION', { 'Al^3+': -1, 'OH-': -3, 'Al(OH)3(s)': 1 }, { logK: fromKsp(3e-34), kPrecip: 4, kDissolve: 0.05 }),
  // ── Cinéticas (las aplica el mundo con su ley de velocidad) ──
  co2Release: R('co2Release', 'GAS_RELEASE', { 'CO2(aq)': -1, 'CO2(g)': 1 }),
  feCu: R('feCu', 'REDOX', { 'Fe(s)': -1, 'Cu^2+': -1, 'Fe^2+': 1, 'Cu(s)': 1 }),
  alCu: R('alCu', 'REDOX', { 'Al(s)': -2, 'Cu^2+': -3, 'Al^3+': 2, 'Cu(s)': 3 }),
  mgO2: R('mgO2', 'COMBUSTION', { 'Mg(s)': -2, 'O2(g)': -1, 'MgO(s)': 2 }),
  mgN2: R('mgN2', 'COMBUSTION', { 'Mg(s)': -3, 'N2(g)': -1, 'Mg3N2(s)': 1 }),
  mgoHydration: R('mgoHydration', 'HYDRATION', { 'MgO(s)': -1, H2O: -1, 'Mg(OH)2(s)': 1 }),
};

export const CHEM: ChemContext = {
  species: SPECIES,
  reactions: REACTIONS,
  fast: [REACTIONS.carbonate1, REACTIONS.carbonate2, REACTIONS.ironHydrolysis],
  precip: ['caco3', 'feoh3', 'feoh3b', 'cuoh2', 'caoh2', 'cuco3', 'feoh2', 'mgoh2', 'mgco3', 'aloh3'].map((k) => REACTIONS[k]),
};

/** ΔH de una reacción por mol de avance (kJ), por la ley de Hess. */
export function reactionEnthalpyKJ(r: ReactionDef): number {
  let h = 0;
  for (const [id, v] of Object.entries(r.nu)) h += v * (SPECIES[id]?.dHf ?? 0);
  return h;
}

// ─────────────────────────── Ecuaciones de referencia por ensayo (§8.2, §9.2, §10.2, §12.2, §13.3, §14.2) ───────────────────────────

export type ExperimentId = 'A' | 'B1' | 'B2' | 'C1' | 'C2' | 'C3';
export const EXPERIMENTS: ExperimentId[] = ['A', 'B1', 'B2', 'C1', 'C2', 'C3'];

export type EqKind = 'MOLECULAR' | 'COMPLETE_IONIC' | 'NET_IONIC' | 'OXIDATION' | 'REDUCTION';

export interface RefTerm {
  coef: number;
  formula: string;
  state: 's' | 'l' | 'g' | 'ac';
}

export interface ExperimentRef {
  id: ExperimentId;
  /** Ecuaciones que pide la libreta para este ensayo. */
  kinds: EqKind[];
  molecular: { reactants: RefTerm[]; products: RefTerm[] };
  net: { reactants: RefTerm[]; products: RefTerm[] };
  spectators: string[];
  oxidation?: { reactants: RefTerm[]; products: RefTerm[] };
  reduction?: { reactants: RefTerm[]; products: RefTerm[] };
  /** Tipo de reacción (§1.1-6). */
  type: 'ACIDO_BASE' | 'PRECIPITACION' | 'REDOX' | 'COMBUSTION' | 'HIDRATACION';
  /** Especie oxidada y reducida (redox). */
  oxidized?: string;
  reduced?: string;
  /** Fórmulas sugeridas para el editor (fichas que se pueden arrastrar). */
  palette: string[];
}

const T = (coef: number, formula: string, state: RefTerm['state']): RefTerm => ({ coef, formula, state });

export const EXPERIMENT_REFS: Record<ExperimentId, ExperimentRef> = {
  A: {
    id: 'A', type: 'ACIDO_BASE', kinds: ['MOLECULAR', 'COMPLETE_IONIC', 'NET_IONIC'],
    molecular: { reactants: [T(1, 'HCl', 'ac'), T(1, 'NaOH', 'ac')], products: [T(1, 'NaCl', 'ac'), T(1, 'H2O', 'l')] },
    net: { reactants: [T(1, 'H^+', 'ac'), T(1, 'OH^-', 'ac')], products: [T(1, 'H2O', 'l')] },
    spectators: ['Na^+', 'Cl^-'],
    palette: ['HCl', 'NaOH', 'NaCl', 'H2O', 'H^+', 'OH^-', 'Na^+', 'Cl^-', 'H3O^+'],
  },
  B1: {
    id: 'B1', type: 'PRECIPITACION', kinds: ['MOLECULAR', 'COMPLETE_IONIC', 'NET_IONIC'],
    molecular: { reactants: [T(1, 'Na2CO3', 'ac'), T(1, 'CaCl2', 'ac')], products: [T(1, 'CaCO3', 's'), T(2, 'NaCl', 'ac')] },
    net: { reactants: [T(1, 'Ca^2+', 'ac'), T(1, 'CO3^2-', 'ac')], products: [T(1, 'CaCO3', 's')] },
    spectators: ['Na^+', 'Cl^-'],
    palette: ['Na2CO3', 'CaCl2', 'CaCO3', 'NaCl', 'Na^+', 'CO3^2-', 'Ca^2+', 'Cl^-'],
  },
  B2: {
    id: 'B2', type: 'PRECIPITACION', kinds: ['MOLECULAR', 'COMPLETE_IONIC', 'NET_IONIC'],
    molecular: { reactants: [T(1, 'FeCl3', 'ac'), T(3, 'NaOH', 'ac')], products: [T(1, 'Fe(OH)3', 's'), T(3, 'NaCl', 'ac')] },
    net: { reactants: [T(1, 'Fe^3+', 'ac'), T(3, 'OH^-', 'ac')], products: [T(1, 'Fe(OH)3', 's')] },
    spectators: ['Na^+', 'Cl^-'],
    palette: ['FeCl3', 'NaOH', 'Fe(OH)3', 'NaCl', 'Fe^3+', 'Cl^-', 'Na^+', 'OH^-'],
  },
  C1: {
    id: 'C1', type: 'REDOX', kinds: ['MOLECULAR', 'COMPLETE_IONIC', 'NET_IONIC', 'OXIDATION', 'REDUCTION'],
    molecular: { reactants: [T(1, 'Fe', 's'), T(1, 'CuSO4', 'ac')], products: [T(1, 'FeSO4', 'ac'), T(1, 'Cu', 's')] },
    net: { reactants: [T(1, 'Fe', 's'), T(1, 'Cu^2+', 'ac')], products: [T(1, 'Fe^2+', 'ac'), T(1, 'Cu', 's')] },
    spectators: ['SO4^2-'],
    oxidation: { reactants: [T(1, 'Fe', 's')], products: [T(1, 'Fe^2+', 'ac'), T(2, 'e-', 'ac')] },
    reduction: { reactants: [T(1, 'Cu^2+', 'ac'), T(2, 'e-', 'ac')], products: [T(1, 'Cu', 's')] },
    oxidized: 'Fe', reduced: 'Cu^2+',
    palette: ['Fe', 'CuSO4', 'FeSO4', 'Cu', 'Cu^2+', 'Fe^2+', 'SO4^2-', 'e-'],
  },
  C2: {
    id: 'C2', type: 'COMBUSTION', kinds: ['MOLECULAR', 'OXIDATION', 'REDUCTION'],
    molecular: { reactants: [T(2, 'Mg', 's'), T(1, 'O2', 'g')], products: [T(2, 'MgO', 's')] },
    net: { reactants: [T(2, 'Mg', 's'), T(1, 'O2', 'g')], products: [T(2, 'MgO', 's')] },
    spectators: [],
    oxidation: { reactants: [T(1, 'Mg', 's')], products: [T(1, 'Mg^2+', 'ac'), T(2, 'e-', 'ac')] },
    reduction: { reactants: [T(1, 'O2', 'g'), T(4, 'e-', 'ac')], products: [T(2, 'O^2-', 'ac')] },
    oxidized: 'Mg', reduced: 'O2',
    palette: ['Mg', 'O2', 'MgO', 'Mg^2+', 'O^2-', 'e-', 'N2', 'Mg3N2'],
  },
  C3: {
    id: 'C3', type: 'HIDRATACION', kinds: ['MOLECULAR'],
    molecular: { reactants: [T(1, 'MgO', 's'), T(1, 'H2O', 'l')], products: [T(1, 'Mg(OH)2', 's')] },
    net: { reactants: [T(1, 'MgO', 's'), T(1, 'H2O', 'l')], products: [T(1, 'Mg(OH)2', 's')] },
    spectators: [],
    palette: ['MgO', 'H2O', 'Mg(OH)2', 'Mg^2+', 'OH^-'],
  },
};

/** Ejemplo conceptual de complejos (§25): NO se ejecuta; NH₃ no forma parte de los reactivos de la práctica. */
export const COMPLEX_EXAMPLE = {
  reactants: [T(1, 'Cu^2+', 'ac'), T(4, 'NH3', 'ac')],
  products: [T(1, 'Cu(NH3)4^2+', 'ac')],
};
