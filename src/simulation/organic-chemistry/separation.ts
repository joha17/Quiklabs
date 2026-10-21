/**
 * Separación de la Práctica 8 (§6.4, §6.5), con modelos CURRICULARES declarados `[PENDIENTE]`:
 * - Reparto entre fase orgánica y acuosa con K_D = c_org/c_aq por especie (solo en el sistema de lavado de esta
 *   práctica); las sales y los ácidos minerales quedan en el agua; el agua se disuelve poco en la fase orgánica.
 * - Solubilidad del ácido acetilsalicílico en el medio acuoso S(T) (g/L) por interpolación en una tabla didáctica.
 * - Módulo de fracciones: cada especie destila en una ventana centrada en su ebullición (ancho ±σ); lo que cae dentro
 *   del corte elegido pasa a la fracción y el resto queda en el balón. No es una simulación rigurosa de destilación.
 * Todas las funciones conservan los moles: lo que no va a un lado, va al otro.
 */
import { SPECIES, liquidMl, molAddInto, molTotal, type Mol, type SpeciesId } from './species';
import { interpolateTable } from '../core/math';

/** Especies que forman la fase ORGÁNICA cuando hay agua en exceso (líquidos poco solubles en agua). */
const ORGANIC_SOLVENTS = new Set<SpeciesId>(['IAA', 'IAAc', 'MeSal']);

export interface PhaseSplit {
  aq: Mol;
  org: Mol;
  /** ¿Hay dos fases líquidas? */
  twoPhases: boolean;
}

/**
 * Reparto en el equilibrio. Hay dos fases solo si hay agua y un líquido orgánico poco soluble en cantidad apreciable;
 * con alcoholes cortos o poca agua la mezcla es una sola fase (no se dibujan capas, §6.5).
 */
export function splitPhases(liq: Mol): PhaseSplit {
  const water = liq.H2O ?? 0;
  const orgSolvent = [...ORGANIC_SOLVENTS].reduce((s, k) => s + (liq[k] ?? 0) * SPECIES[k].molarMass, 0);
  const waterG = water * SPECIES.H2O.molarMass;
  // Agua que excede la saturación de la fase orgánica (~1,5 % de su masa).
  const excessWaterG = waterG - 0.015 * orgSolvent;
  // El ácido acético y el metanol actúan de codisolventes: con poca agua la mezcla de reacción es homogénea.
  const cosolventG = (liq.MeOH ?? 0) * SPECIES.MeOH.molarMass + (liq.AcOH ?? 0) * SPECIES.AcOH.molarMass;
  const twoPhases = orgSolvent > 0.05 && excessWaterG > 0.05 && excessWaterG > 0.35 * cosolventG;
  if (!twoPhases) return { aq: {}, org: { ...liq }, twoPhases: false };
  // Volúmenes aproximados de cada fase para el reparto: dos iteraciones bastan con estos K_D.
  let vOrg = Math.max(0.01, [...ORGANIC_SOLVENTS].reduce((s, k) => s + ((liq[k] ?? 0) * SPECIES[k].molarMass) / (SPECIES[k].densityGml ?? 1), 0));
  let vAq = Math.max(0.01, waterG / SPECIES.H2O.densityGml!);
  const aq: Mol = {};
  const org: Mol = {};
  for (let it = 0; it < 3; it++) {
    for (const k of Object.keys(aq)) delete aq[k as SpeciesId];
    for (const k of Object.keys(org)) delete org[k as SpeciesId];
    for (const [k, n] of Object.entries(liq) as Array<[SpeciesId, number]>) {
      const s = SPECIES[k];
      if (s.aqueousOnly) {
        aq[k] = n;
        continue;
      }
      const kd = k === 'H2O' ? 0 : s.kD ?? 1;
      const fOrg = (kd * vOrg) / (kd * vOrg + vAq);
      if (fOrg > 0) org[k] = n * fOrg;
      if (fOrg < 1) aq[k] = n * (1 - fOrg);
    }
    // El agua se disuelve en la fase orgánica hasta ~1,5 % de su masa (saturación didáctica).
    const orgMass = Object.entries(org).reduce((s, [k, n]) => s + (n ?? 0) * SPECIES[k as SpeciesId].molarMass, 0);
    const wOrg = Math.min(water, (0.015 * orgMass) / SPECIES.H2O.molarMass);
    org.H2O = wOrg;
    aq.H2O = water - wOrg;
    vOrg = Math.max(0.01, liquidMl(org));
    vAq = Math.max(0.01, liquidMl(aq));
  }
  for (const m of [aq, org]) for (const [k, n] of Object.entries(m)) if (!((n ?? 0) > 1e-15)) delete m[k as SpeciesId];
  return { aq, org, twoPhases: true };
}

/** Densidad de una fase (g/mL), para saber cuál queda abajo (§14.2). */
export function phaseDensity(m: Mol): number {
  const ml = liquidMl(m);
  if (ml <= 0) return 1;
  const g = Object.entries(m).reduce((s, [k, n]) => s + (n ?? 0) * SPECIES[k as SpeciesId].molarMass, 0);
  return g / ml;
}

/** Solubilidad didáctica del ácido acetilsalicílico en el medio acuoso (g/L) frente a T (°C) `[PENDIENTE]`. */
export const ASA_SOLUBILITY_GL: ReadonlyArray<readonly [number, number]> = [
  [0, 1.4], [10, 2.0], [20, 2.9], [25, 3.3], [37, 4.6], [50, 7.0], [70, 14], [90, 25],
];

export const asaSolubilityGL = (tC: number) => interpolateTable(ASA_SOLUBILITY_GL, tC);

/** Ancho de la ventana de destilación de cada especie en el módulo de fracciones (°C) `[MODELO]`. */
export const FRACTION_SIGMA_C = 4;

/** Fracción de una especie con ebullición bp que destila dentro del corte [lo, hi] (perfil normal de ancho σ). */
export function fractionShare(bpC: number, lo: number, hi: number, sigma = FRACTION_SIGMA_C): number {
  const erf = (x: number) => {
    const t = 1 / (1 + 0.3275911 * Math.abs(x));
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) * Math.exp(-x * x);
    return x >= 0 ? y : -y;
  };
  const cdf = (x: number) => 0.5 * (1 + erf((x - bpC) / (sigma * Math.SQRT2)));
  return Math.max(0, Math.min(1, cdf(hi) - cdf(lo)));
}

/**
 * Corte de fracciones: devuelve lo recolectado y deja el resto en el balón. Lo que destila ANTES del corte (más
 * volátil que `lo`) va a la cabeza (descartada), lo que no destila queda como residuo.
 */
export function fractionate(pot: Mol, lo: number, hi: number, sigma = FRACTION_SIGMA_C): { head: Mol; fraction: Mol; residue: Mol } {
  const head: Mol = {};
  const fraction: Mol = {};
  const residue: Mol = {};
  for (const [k, n] of Object.entries(pot) as Array<[SpeciesId, number]>) {
    const bp = SPECIES[k].bpC;
    if (bp === undefined || SPECIES[k].phase !== 'liquid') {
      residue[k] = n;
      continue;
    }
    const inCut = fractionShare(bp, lo, hi, sigma);
    const before = fractionShare(bp, -273, lo, sigma);
    if (inCut > 0) fraction[k] = n * inCut;
    if (before > 0) head[k] = n * before;
    const rest = n * Math.max(0, 1 - inCut - before);
    if (rest > 0) residue[k] = rest;
  }
  return { head, fraction, residue };
}

/** Suma de control: todo lo que entró salió (para pruebas). */
export const conservedSplit = (a: Mol, parts: Mol[]) => Math.abs(molTotal(a) - parts.reduce((s, p) => s + molTotal(p), 0));

export const mergeMol = (...parts: Mol[]): Mol => parts.reduce((acc, p) => molAddInto(acc, p), {} as Mol);
