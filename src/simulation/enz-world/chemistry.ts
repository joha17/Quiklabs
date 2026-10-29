/**
 * Química de B05 sobre un recipiente (§3). Funciones PURAS: pH con tampón, factores de actividad por T y pH (reversibles)
 * y constante de desnaturalización (irreversible), velocidad de Michaelis–Menten, señales de Lugol y Benedict
 * calculadas desde las ESPECIES presentes (nunca desde el rótulo del tubo) y la velocidad de la ADH con el metanol
 * como sustrato competidor. Coeficientes de software `pending` (calibración docente), no medidas publicadas.
 */
import { SPECIES_B05, type EnzParams, type EnzymeK, type Species } from './types';

export const noSpecies = (): Species => Object.fromEntries(SPECIES_B05.map((s) => [s, 0])) as Species;

/** Equivalentes glucosilo (invariante de la hidrólisis, §3.3). */
export const glucosylOf = (s: Species) => s.starch + s.starchSolid + s.dextrin + s.sugar;
/** Cobre total (mmol de átomos): Cu(II) disuelto y Cu₂O (2 Cu). */
export const copperOf = (s: Species) => s.cu + 2 * s.cu2o;
/** Catalasa total (U), activa o no, libre o en el tejido. */
export const catalaseOf = (s: Species) => s.catAct + s.catDen + s.catTissue + s.catTissueDen;
export const amylaseOf = (s: Species) => s.amyAct + s.amyDen + s.amySolid;

/**
 * pH con un tampón de pKa 7 (capacidad β = 0,58·C) más la del agua; `acid` es el ácido fuerte neto (mmol, negativo =
 * base). Aproximación lineal acotada a 1–13,5: suficiente para gotas de HCl/NaOH, no una especiación exacta.
 */
export function pHOf(s: Species, volumeMl: number): number {
  if (volumeMl <= 1e-9) return 7;
  const beta = 0.58 * s.buf + 0.0015 * volumeMl;
  return Math.min(13.5, Math.max(1, 7 - s.acid / beta));
}

/** Factor reversible de T y pH (0–1); no cambia la cantidad de enzima activa. */
export function activityFactor(k: EnzymeK, tK: number, pH: number): number {
  return Math.exp(-(((tK - k.tOptK) / k.tWidthK) ** 2)) * Math.exp(-(((pH - k.pHOpt) / k.pHWidth) ** 2));
}

/** k_den(T, pH) en s⁻¹ (§3.2): térmica exponencial más la de pH fuera del intervalo seguro. */
export function denatRate(k: EnzymeK, tK: number, pH: number): number {
  return k.k0 * Math.exp((tK - k.tDenK) / k.tScaleK) + k.kpH * Math.max(0, Math.abs(pH - k.pHOpt) - k.pHSafe);
}

/** Michaelis–Menten (mmol/s) con el sustrato en mmol dentro de V mL y la enzima activa en U. */
export function mmRate(k: EnzymeK, eU: number, substrateMmol: number, volumeMl: number, tK: number, pH: number): number {
  if (eU <= 0 || substrateMmol <= 0 || volumeMl <= 1e-9) return 0;
  const c = substrateMmol / volumeMl;
  return k.kcatPerU * eU * activityFactor(k, tK, pH) * (c / (k.km + c));
}

/** ADH (§3.4): etanol + NAD⁺ → acetaldehído + NADH con el metanol compitiendo por el sitio; sin NAD⁺ no hay señal. */
export function adhRates(p: EnzParams['adh'], eU: number, s: Species, volumeMl: number): { eth: number; meth: number } {
  if (eU <= 0 || volumeMl <= 1e-9 || s.nad <= 0) return { eth: 0, meth: 0 };
  const e = s.ethanol / volumeMl;
  const m = s.methanol / volumeMl;
  const n = s.nad / volumeMl;
  const nf = n / (p.kmNad + n);
  const eth = e > 0 ? p.kcatPerU * eU * (e / (p.kmEtOH * (1 + m / p.kiMeOH) + e)) * nf : 0;
  const meth = m > 0 ? p.methanolRel * p.kcatPerU * eU * (m / (p.kmMeOH * (1 + e / p.kmEtOH) + m)) * nf : 0;
  return { eth, meth };
}

/** Complejo con yodo de las dextrinas relativo al almidón (las cadenas cortas tiñen poco y rojizo). */
const DEXTRIN_I2 = 0.15;

export type LugolColor = 'none' | 'amber' | 'redbrown' | 'violet' | 'blue' | 'blueblack';

/**
 * Lugol (§3.3): el yodo forma complejo con el almidón disperso, menos con dextrinas y con los gránulos sin dispersar
 * (manchas localizadas); el I₂ disponible limita la señal (poco Lugol → débil). El pigmento de la matriz (SC19) tiñe.
 */
export function lugolSignal(lp: EnzParams['lugol'], s: Species, volumeMl: number): { color: LugolColor; index: number; tinted: boolean; localized: boolean } {
  if (volumeMl <= 1e-9 || s.iodine <= 1e-9) return { color: 'none', index: 0, tinted: false, localized: false };
  const sites = s.starch + DEXTRIN_I2 * s.dextrin + 0.6 * s.starchSolid;
  const bound = Math.min(s.iodine * lp.glucosylPerI2, sites);
  const c = bound / volumeMl;
  const index = c / (lp.halfMmolMl + c);
  const dextrinShare = sites > 1e-12 ? (DEXTRIN_I2 * s.dextrin) / sites : 0;
  const color: LugolColor = index < 0.06 ? 'amber' : dextrinShare > 0.6 && index < 0.55 ? 'redbrown' : index < 0.3 ? 'violet' : index < 0.65 ? 'blue' : 'blueblack';
  return { color, index, tinted: s.pigment / volumeMl > 0.002, localized: s.starchSolid > s.starch && s.starchSolid / volumeMl > 0.002 };
}

/** Equivalentes reductores disponibles (mmol): extremos de azúcares y una fracción de las dextrinas, menos lo oxidado. */
export const reducingEq = (s: Species) => Math.max(0, 0.5 * s.sugar + 0.05 * s.dextrin - s.redUsed);

/**
 * Benedict en dt (§3.3): 2 Cu(II) + reductor → Cu₂O, solo en caliente (≥ minK) y en medio alcalino; el yodo de un
 * ensayo previo interfiere (A07). Devuelve el Cu₂O formado (= reductor consumido, mmol).
 */
export function benedictStep(bp: EnzParams['benedict'], s: Species, volumeMl: number, tK: number, dt: number): number {
  if (volumeMl <= 1e-9 || tK < bp.minK || s.cu <= 1e-12) return 0;
  const red = reducingEq(s);
  if (red <= 1e-12 || pHOf(s, volumeMl) < 8) return 0;
  const k = bp.k0 * Math.exp((tK - 373.15) / bp.scaleK) * (s.iodine > 1e-6 ? 0.35 : 1);
  return Math.min((k * red * s.cu * dt) / volumeMl, s.cu / 2, red);
}

export type BenedictColor = 'blue' | 'green' | 'yellow' | 'orange' | 'brick';

export function benedictColor(bp: EnzParams['benedict'], s: Species, volumeMl: number): BenedictColor {
  if (volumeMl <= 1e-9) return 'blue';
  const c = s.cu2o / volumeMl;
  if (c < bp.visibleMmolMl) return 'blue';
  if (c < bp.redMmolMl * 0.25) return 'green';
  if (c < bp.redMmolMl * 0.5) return 'yellow';
  if (c < bp.redMmolMl) return 'orange';
  return 'brick';
}
