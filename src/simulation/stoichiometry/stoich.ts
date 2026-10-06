/**
 * Estequiometría de la Práctica 5 (§14): 2 KClO₃(s) → 2 KCl(s) + 3 O₂(g), catalizada por MnO₂.
 * Masas molares centralizadas (§7), cálculos teóricos, rendimiento, incertidumbre propagada, masa constante (§13.3) y
 * validación de cadenas de análisis dimensional (§21.3). Funciones puras, sin dependencias de la interfaz.
 */

/** §14.1 — masas molares usadas por la guía (g/mol). */
export const MOLAR_MASS = {
  KClO3: 122.55,
  KCl: 74.55,
  O2: 31.998,
  MnO2: 86.937,
  H2O: 18.015,
} as const;

export type Species = keyof typeof MOLAR_MASS;

/** Coeficientes de la ecuación global. */
export const COEF = { KClO3: 2, KCl: 2, O2: 3 } as const;

export const molesOf = (sp: Species, massG: number) => massG / MOLAR_MASS[sp];
export const massOf = (sp: Species, mol: number) => mol * MOLAR_MASS[sp];

/** §14.2–14.3 — productos teóricos a partir de la masa de KClO₃. */
export function theoretical(mKClO3: number) {
  const n = molesOf('KClO3', mKClO3);
  const nKCl = (n * COEF.KCl) / COEF.KClO3;
  const nO2 = (n * COEF.O2) / COEF.KClO3;
  return { nKClO3: n, nKCl, mKCl: massOf('KCl', nKCl), nO2, mO2: massOf('O2', nO2) };
}

/** §14.5 — porcentaje de rendimiento. */
export const yieldPct = (experimentalG: number, theoreticalG: number) => (theoreticalG > 0 ? (experimentalG / theoreticalG) * 100 : NaN);

/** §14.6 — incertidumbre de una diferencia de masas independientes. */
export const uDiff = (u1: number, u2: number) => Math.sqrt(u1 * u1 + u2 * u2);

/** Incertidumbre relativa propagada al rendimiento (cociente): u(Y)/Y = √((u_exp/m_exp)² + (u_teo/m_teo)²). */
export function uYield(yPct: number, mExp: number, uExp: number, mTeo: number, uTeo: number): number {
  if (!(mExp > 0) || !(mTeo > 0)) return NaN;
  return Math.abs(yPct) * Math.sqrt((uExp / mExp) ** 2 + (uTeo / mTeo) ** 2);
}

/** Redondeo a la resolución del instrumento (sin errores de coma flotante en la presentación). */
export function roundTo(v: number, res: number): number {
  const k = Math.round(v / res);
  const dec = Math.max(0, -Math.floor(Math.log10(res) + 1e-9));
  return Number((k * res).toFixed(dec));
}

/** §6.6 — lectura de masa. */
export interface MassMeasurement {
  id: string;
  displayedMassG: number;
  trueMassG: number;
  resolutionG: number;
  uncertaintyG: number;
  stable: boolean;
  zeroCorrected: boolean;
  loadTemperatureC: number;
  timestampMs: number;
  /** Qué había en el platillo (objeto y contenido) cuando se leyó. */
  objectId: string | null;
  /** Lectura aceptable como dato: estable, carga a temperatura ambiente y balanza calibrada. */
  valid: boolean;
  /** Motivo si no es válida. */
  invalidReason?: 'UNSTABLE' | 'HOT_LOAD' | 'NOT_CALIBRATED' | 'OVERLOAD' | 'EMPTY';
}

/** §13.3 — masa constante entre dos lecturas consecutivas. */
export function isConstantMass(prev: MassMeasurement, cur: MassMeasurement, criterionG: number, ambientC: number, allowedDeltaC: number): boolean {
  return prev.stable && cur.stable
    && prev.loadTemperatureC <= ambientC + allowedDeltaC
    && cur.loadTemperatureC <= ambientC + allowedDeltaC
    && Math.abs(prev.displayedMassG - cur.displayedMassG) <= criterionG + 1e-9;
}

// ─────────────────────────── Análisis dimensional (§21.3) ───────────────────────────

/** Una cantidad con unidad: «g KClO₃», «mol O₂». */
export interface Quantity {
  value: number;
  unit: 'g' | 'mol';
  species: 'KClO3' | 'KCl' | 'O2';
}

/** Un factor de conversión escrito por el estudiante: numerador / denominador. */
export interface Factor {
  num: Quantity;
  den: Quantity;
}

export interface ChainValidation {
  /** Cada factor cancela la unidad anterior. */
  unitsCancel: boolean[];
  /** Cada factor es una equivalencia correcta (masa molar o relación molar de la ecuación). */
  factorsCorrect: boolean[];
  /** La unidad final es la pedida. */
  targetReached: boolean;
  /** Resultado de aplicar la cadena. */
  result: number;
  /** El estudiante usó gramos como si fueran moles (factor ausente). */
  gramsAsMoles: boolean;
  ok: boolean;
}

const same = (a: Quantity, b: Quantity) => a.unit === b.unit && a.species === b.species;
const close = (a: number, b: number, rel = 0.005) => Math.abs(a - b) <= Math.abs(b) * rel + 1e-12;

/** ¿Es el factor una equivalencia válida? Masa molar (g/mol de la misma especie) o relación de coeficientes. */
export function factorCorrect(f: Factor): boolean {
  const { num, den } = f;
  if (!(num.value > 0) || !(den.value > 0)) return false;
  const ratio = num.value / den.value;
  if (num.species === den.species) {
    const M = MOLAR_MASS[num.species];
    if (num.unit === 'g' && den.unit === 'mol') return close(ratio, M);
    if (num.unit === 'mol' && den.unit === 'g') return close(ratio, 1 / M);
    return false;
  }
  if (num.unit === 'mol' && den.unit === 'mol') return close(ratio, COEF[num.species] / COEF[den.species], 0.001);
  return false;
}

/** Valida una cadena «start → … → objetivo» (unidades y factores, no solo el número final). */
export function validateChain(start: Quantity, factors: Factor[], target: { unit: 'g' | 'mol'; species: Quantity['species'] }): ChainValidation {
  let cur: Quantity = { ...start };
  const unitsCancel: boolean[] = [];
  const factorsCorrect: boolean[] = [];
  let value = start.value;
  for (const f of factors) {
    unitsCancel.push(same({ ...f.den, value: 1 }, { ...cur, value: 1 }));
    factorsCorrect.push(factorCorrect(f));
    value = (value * f.num.value) / f.den.value;
    cur = { value, unit: f.num.unit, species: f.num.species };
  }
  const targetReached = cur.unit === target.unit && cur.species === target.species;
  // Error típico: aplicar la relación molar de la ecuación a una cantidad que sigue en gramos.
  const gramsAsMoles = factors.some((f, i) => f.num.unit === 'mol' && f.den.unit === 'mol' && !unitsCancel[i]);
  const ok = factors.length > 0 && unitsCancel.every(Boolean) && factorsCorrect.every(Boolean) && targetReached;
  return { unitsCancel, factorsCorrect, targetReached, result: value, gramsAsMoles, ok };
}

/** Cadenas de referencia (para la retroalimentación y las pruebas). */
export function referenceChains(mKClO3: number) {
  const g = (v: number, species: Quantity['species']): Quantity => ({ value: v, unit: 'g', species });
  const mol = (v: number, species: Quantity['species']): Quantity => ({ value: v, unit: 'mol', species });
  return {
    kcl: { start: g(mKClO3, 'KClO3'), factors: [{ num: mol(1, 'KClO3'), den: g(MOLAR_MASS.KClO3, 'KClO3') }, { num: mol(2, 'KCl'), den: mol(2, 'KClO3') }, { num: g(MOLAR_MASS.KCl, 'KCl'), den: mol(1, 'KCl') }] as Factor[], target: { unit: 'g' as const, species: 'KCl' as const } },
    o2: { start: g(mKClO3, 'KClO3'), factors: [{ num: mol(1, 'KClO3'), den: g(MOLAR_MASS.KClO3, 'KClO3') }, { num: mol(3, 'O2'), den: mol(2, 'KClO3') }, { num: g(MOLAR_MASS.O2, 'O2'), den: mol(1, 'O2') }] as Factor[], target: { unit: 'g' as const, species: 'O2' as const } },
  };
}
