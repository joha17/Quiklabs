/**
 * §21.1–21.2 — editor de la ecuación de la Práctica 5: coeficientes, fórmulas, estados, flecha y condiciones sobre la
 * flecha (Δ y MnO₂). Se valida por átomos (no por texto): balance, coeficientes mínimos, estados y catalizador como
 * condición (nunca como reactivo consumido ni producto neto).
 */
import { parseFormula } from '../../simulation/chemistry/formula';

export interface P5Term {
  coef: number;
  formula: string;
  state: '' | 's' | 'l' | 'g' | 'aq';
}

export interface P5Equation {
  reactants: P5Term[];
  products: P5Term[];
  /** Texto sobre la flecha (p. ej. «MnO2») y si se marcó calor (Δ). */
  catalyst: string;
  heat: boolean;
}

export interface StoichiometricEquationValidation {
  atomsBalanced: boolean;
  coefficients: number[];
  lowestWholeNumberRatio: boolean;
  statesCorrect: boolean;
  catalystPlacedAsCondition: boolean;
  catalystIncorrectlyConsumed: boolean;
  heatMarked: boolean;
  speciesCorrect: boolean;
  unknownFormulas: string[];
  ok: boolean;
}

export const emptyP5Equation = (): P5Equation => ({
  reactants: [{ coef: 1, formula: '', state: '' }],
  products: [{ coef: 1, formula: '', state: '' }, { coef: 1, formula: '', state: '' }],
  catalyst: '',
  heat: false,
});

/** Ecuación de referencia (§1.2). */
export const REFERENCE_EQUATION: P5Equation = {
  reactants: [{ coef: 2, formula: 'KClO3', state: 's' }],
  products: [{ coef: 2, formula: 'KCl', state: 's' }, { coef: 3, formula: 'O2', state: 'g' }],
  catalyst: 'MnO2',
  heat: true,
};

const EXPECTED_STATE: Record<string, P5Term['state']> = { KClO3: 's', KCl: 's', O2: 'g' };
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

export function validateP5Equation(eq: P5Equation): StoichiometricEquationValidation {
  const unknownFormulas: string[] = [];
  const totals = (terms: P5Term[]) => {
    const acc: Record<string, number> = {};
    for (const t of terms) {
      if (!t.formula.trim()) continue;
      const p = parseFormula(t.formula);
      if (!p) {
        unknownFormulas.push(t.formula);
        continue;
      }
      for (const [el, n] of Object.entries(p.elements)) acc[el] = (acc[el] ?? 0) + n * t.coef;
    }
    return acc;
  };
  const key = (f: string) => parseFormula(f)?.key ?? f.trim();
  const r = totals(eq.reactants);
  const p = totals(eq.products);
  const els = new Set([...Object.keys(r), ...Object.keys(p)]);
  const atomsBalanced = els.size > 0 && [...els].every((e) => (r[e] ?? 0) === (p[e] ?? 0));
  const all = [...eq.reactants, ...eq.products].filter((t) => t.formula.trim());
  const coefficients = all.map((t) => t.coef);
  const g = coefficients.reduce((a, b) => gcd(a, b), 0);
  const lowestWholeNumberRatio = coefficients.every((c) => Number.isInteger(c) && c > 0) && g === 1;
  const statesCorrect = all.every((t) => {
    const k = key(t.formula);
    return EXPECTED_STATE[k] ? t.state === EXPECTED_STATE[k] : true;
  });
  const mnInTerms = all.some((t) => key(t.formula) === 'MnO2');
  const catalystPlacedAsCondition = key(eq.catalyst || '') === 'MnO2';
  const rk = eq.reactants.filter((t) => t.formula.trim()).map((t) => key(t.formula)).sort().join('+');
  const pk = eq.products.filter((t) => t.formula.trim()).map((t) => key(t.formula)).sort().join('+');
  const speciesCorrect = rk === 'KClO3' && pk === 'KCl+O2';
  return {
    atomsBalanced, coefficients, lowestWholeNumberRatio, statesCorrect, catalystPlacedAsCondition,
    catalystIncorrectlyConsumed: mnInTerms, heatMarked: eq.heat, speciesCorrect, unknownFormulas,
    ok: atomsBalanced && lowestWholeNumberRatio && statesCorrect && catalystPlacedAsCondition && !mnInTerms && eq.heat && speciesCorrect && unknownFormulas.length === 0,
  };
}
