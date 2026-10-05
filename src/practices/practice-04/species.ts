/**
 * Especies químicas de la Práctica 4 (§6, §7.1): fase, entalpía de formación (25 °C), color y comportamiento de
 * los precipitados. Datos configurables; las composiciones y masas molares se derivan de la fórmula.
 * Fuentes: NIST Chemistry WebBook y tablas termodinámicas estándar (valores redondeados de nivel educativo).
 */
import { molarMass, parseFormula } from '../../simulation/chemistry/formula';
import type { Phase, SpeciesDef } from '../../simulation/chemistry/types';

type Spec = Omit<SpeciesDef, 'charge' | 'elements' | 'molarMass'>;

function def(s: Spec): SpeciesDef {
  const p = parseFormula(s.formula);
  if (!p) throw new Error(`Fórmula inválida: ${s.formula}`);
  return { ...s, charge: p.charge, elements: p.elements, molarMass: molarMass(p.elements) };
}

const aq = (id: string, formula: string, dHf: number, extra: Partial<Spec> = {}): Spec => ({ id, formula, phase: 'AQUEOUS' as Phase, dHf, ...extra });
const solid = (id: string, formula: string, dHf: number, rgb: [number, number, number], density: number, extra: Partial<Spec> = {}): Spec => ({
  id, formula, phase: 'SOLID' as Phase, dHf, solidRgb: rgb, densityGcm3: density, ...extra,
});

export const SPECIES_LIST: SpeciesDef[] = [
  def({ id: 'H2O', formula: 'H2O', phase: 'LIQUID', dHf: -285.83 }),
  def(aq('H+', 'H^+', 0)),
  def(aq('OH-', 'OH^-', -230.0)),
  def(aq('Na+', 'Na^+', -240.1)),
  def(aq('Cl-', 'Cl^-', -167.2)),
  def(aq('CO3^2-', 'CO3^2-', -677.1)),
  def(aq('HCO3-', 'HCO3^-', -692.0)),
  def(aq('CO2(aq)', 'CO2', -413.8)),
  def(aq('Ca^2+', 'Ca^2+', -542.8)),
  // Fe³⁺ e hidroxocomplejo: absorben en el azul (disolución amarilla); el color depende de la concentración.
  def(aq('Fe^3+', 'Fe^3+', -48.5, { absorbRgb: [0.02, 0.5, 9] })),
  def(aq('FeOH^2+', 'FeOH^2+', -290.8, { absorbRgb: [0.05, 1.1, 16] })),
  def(aq('Fe^2+', 'Fe^2+', -89.1, { absorbRgb: [0.6, 0.05, 0.16] })),
  // Cu²⁺ hidratado: absorbe el rojo (λmáx ≈ 800 nm) → azul.
  def(aq('Cu^2+', 'Cu^2+', 64.8, { absorbRgb: [5, 0.6, 0.12] })),
  def(aq('SO4^2-', 'SO4^2-', -909.3)),
  def(aq('Al^3+', 'Al^3+', -531.0)),
  def(aq('Mg^2+', 'Mg^2+', -466.9)),
  // Fenolftaleína (forma incolora; el color rosado se calcula con el pH) y etanol del disolvente.
  def(aq('HIn', 'C20H14O4', -650)),
  def({ id: 'EtOH', formula: 'C2H6O', phase: 'LIQUID', dHf: -277.6 }),
  def({ id: 'CO2(g)', formula: 'CO2', phase: 'GAS', dHf: -393.5 }),
  def({ id: 'O2(g)', formula: 'O2', phase: 'GAS', dHf: 0 }),
  def({ id: 'N2(g)', formula: 'N2', phase: 'GAS', dHf: 0 }),
  def(solid('CaCO3(s)', 'CaCO3', -1207.6, [0.95, 0.95, 0.93], 2.71, { settleMmS: 0.06 })),
  def(solid('Fe(OH)3(s)', 'Fe(OH)3', -823.0, [0.47, 0.19, 0.07], 3.4, { settleMmS: 0.012, gelatinous: true })),
  def(solid('Cu(OH)2(s)', 'Cu(OH)2', -449.8, [0.33, 0.6, 0.86], 3.37, { settleMmS: 0.015, gelatinous: true })),
  def(solid('Ca(OH)2(s)', 'Ca(OH)2', -985.2, [0.94, 0.94, 0.93], 2.21, { settleMmS: 0.05 })),
  def(solid('CuCO3(s)', 'CuCO3', -595.0, [0.4, 0.7, 0.64], 4.0, { settleMmS: 0.04 })),
  def(solid('Fe(OH)2(s)', 'Fe(OH)2', -569.0, [0.36, 0.48, 0.33], 3.4, { settleMmS: 0.015, gelatinous: true })),
  def(solid('Mg(OH)2(s)', 'Mg(OH)2', -924.5, [0.94, 0.94, 0.93], 2.34, { settleMmS: 0.03, gelatinous: true })),
  def(solid('MgCO3(s)', 'MgCO3', -1095.8, [0.95, 0.95, 0.94], 2.96, { settleMmS: 0.05 })),
  def(solid('Al(OH)3(s)', 'Al(OH)3', -1276.0, [0.93, 0.93, 0.93], 2.42, { settleMmS: 0.015, gelatinous: true })),
  def(solid('MgO(s)', 'MgO', -601.6, [0.97, 0.97, 0.96], 3.58, { settleMmS: 0.25 })),
  def(solid('Mg3N2(s)', 'Mg3N2', -461.0, [0.86, 0.8, 0.56], 2.71, { settleMmS: 0.4 })),
  def(solid('Mg(s)', 'Mg', 0, [0.72, 0.74, 0.76], 1.738, { settleMmS: 2 })),
  def(solid('Cu(s)', 'Cu', 0, [0.66, 0.31, 0.17], 8.96, { settleMmS: 1.5 })),
  def(solid('Fe(s)', 'Fe', 0, [0.45, 0.46, 0.47], 7.87, { settleMmS: 5 })),
  def(solid('Al(s)', 'Al', 0, [0.8, 0.82, 0.84], 2.7, { settleMmS: 5 })),
  def(solid('Al2O3(s)', 'Al2O3', -1675.7, [0.9, 0.9, 0.9], 3.95, { settleMmS: 0.5 })),
];

export const SPECIES: Record<string, SpeciesDef> = Object.fromEntries(SPECIES_LIST.map((s) => [s.id, s]));

/**
 * Electrolitos fuertes solubles de la práctica (se escriben disociados en las ecuaciones iónicas) y fase correcta
 * de cada compuesto en las ecuaciones moleculares (§15.2). Clave: composición elemental + carga (formula.ts).
 */
export const COMPOUNDS: Array<{ formula: string; state: 's' | 'l' | 'g' | 'ac'; strong?: boolean; ions?: Array<[number, string]> }> = [
  { formula: 'HCl', state: 'ac', strong: true, ions: [[1, 'H^+'], [1, 'Cl^-']] },
  { formula: 'NaOH', state: 'ac', strong: true, ions: [[1, 'Na^+'], [1, 'OH^-']] },
  { formula: 'NaCl', state: 'ac', strong: true, ions: [[1, 'Na^+'], [1, 'Cl^-']] },
  { formula: 'Na2CO3', state: 'ac', strong: true, ions: [[2, 'Na^+'], [1, 'CO3^2-']] },
  { formula: 'CaCl2', state: 'ac', strong: true, ions: [[1, 'Ca^2+'], [2, 'Cl^-']] },
  { formula: 'FeCl3', state: 'ac', strong: true, ions: [[1, 'Fe^3+'], [3, 'Cl^-']] },
  { formula: 'CuSO4', state: 'ac', strong: true, ions: [[1, 'Cu^2+'], [1, 'SO4^2-']] },
  { formula: 'FeSO4', state: 'ac', strong: true, ions: [[1, 'Fe^2+'], [1, 'SO4^2-']] },
  { formula: 'Al2(SO4)3', state: 'ac', strong: true, ions: [[2, 'Al^3+'], [3, 'SO4^2-']] },
  { formula: 'Na2SO4', state: 'ac', strong: true, ions: [[2, 'Na^+'], [1, 'SO4^2-']] },
  { formula: 'MgCl2', state: 'ac', strong: true, ions: [[1, 'Mg^2+'], [2, 'Cl^-']] },
  { formula: 'CaCO3', state: 's' },
  { formula: 'Fe(OH)3', state: 's' },
  { formula: 'Cu(OH)2', state: 's' },
  { formula: 'Mg(OH)2', state: 's' },
  { formula: 'MgO', state: 's' },
  { formula: 'Mg', state: 's' },
  { formula: 'Fe', state: 's' },
  { formula: 'Cu', state: 's' },
  { formula: 'Al', state: 's' },
  { formula: 'Mg3N2', state: 's' },
  { formula: 'H2O', state: 'l' },
  { formula: 'O2', state: 'g' },
  { formula: 'N2', state: 'g' },
  { formula: 'CO2', state: 'g' },
  { formula: 'H^+', state: 'ac' },
  { formula: 'OH^-', state: 'ac' },
  { formula: 'Na^+', state: 'ac' },
  { formula: 'Cl^-', state: 'ac' },
  { formula: 'CO3^2-', state: 'ac' },
  { formula: 'Ca^2+', state: 'ac' },
  { formula: 'Fe^3+', state: 'ac' },
  { formula: 'Fe^2+', state: 'ac' },
  { formula: 'Cu^2+', state: 'ac' },
  { formula: 'SO4^2-', state: 'ac' },
  { formula: 'Al^3+', state: 'ac' },
  { formula: 'Mg^2+', state: 'ac' },
  { formula: 'H3O^+', state: 'ac' },
];
