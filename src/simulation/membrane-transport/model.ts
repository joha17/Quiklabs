/**
 * Transporte a través de membranas y ensayos analíticos de la práctica B03 (§3.2, §6.5). Funciones PURAS en unidades
 * explícitas: volúmenes en mL, cantidades en mmol (la proteína en mg), concentraciones en mmol/mL (= mol/L), presiones
 * en kPa, temperatura en K (nunca °C dentro de van 't Hoff). Modelo CURRICULAR de diluciones ideales: los valores de
 * permeabilidad, Lp y osmolalidad del jarabe son de software (`pending`), no medidas de un material.
 */

/** Constante de los gases en kPa·L·mol⁻¹·K⁻¹ (= kPa·mL·mmol⁻¹·K⁻¹). */
export const R_KPA_L = 8.314462618;
export const NACL_MOLAR_MASS = 58.44;
/** Densidad del agua (g/mL) y gravedad (m/s²) para la presión hidrostática de una columna. */
const RHO = 1;
const G = 9.81;

/** Solutos que el modelo sigue por compartimento. `protein` en mg; el resto en mmol. */
export type SoluteId = 'salt' | 'tracer' | 'glucose' | 'protein';
export const SOLUTES: SoluteId[] = ['salt', 'tracer', 'glucose', 'protein'];
export type Amounts = Record<SoluteId, number>;
export const noAmounts = (): Amounts => ({ salt: 0, tracer: 0, glucose: 0, protein: 0 });

/** % m/v de NaCl → mol/L (REF-01: 0,9 % → 0,1540; REF-02: 5 % → 0,8556). */
export const molarityFromWv = (pctWv: number, molarMass = NACL_MOLAR_MASS) => (pctWv * 10) / molarMass;

/**
 * Osmolaridad ideal (Osm/L) de un compartimento: el NaCl aporta 2 partículas por fórmula (aproximación ideal; la real
 * requiere coeficiente osmótico), el jarabe sus osmoles equivalentes, el trazador 1 y la proteína ≈ 0 (macromolécula).
 */
export function osmolarity(a: Amounts, volumeMl: number): number {
  if (volumeMl <= 1e-9) return 0;
  return (2 * a.salt + a.glucose + a.tracer) / volumeMl;
}

/** Presión osmótica ideal (kPa) de una osmolaridad (Osm/L) a T (K): π = R·T·C (REF-05). */
export const osmoticPressureKPa = (osmMolL: number, temperatureK: number) => R_KPA_L * temperatureK * osmMolL;

/** Presión hidrostática (kPa) de una columna de líquido de altura h (cm). */
export const hydrostaticKPa = (heightCm: number) => (RHO * 1000 * G * (heightCm / 100)) / 1000;

/**
 * Transferencia difusiva de un soluto en un paso dt (REF-03): Δn_B = P·A·(C_A − C_B)·dt, positiva A → B, limitada para
 * no invertir el gradiente ni dejar cantidades negativas (limitador conservativo).
 */
export function diffusiveStep(pCmS: number, areaCm2: number, nA: number, vA: number, nB: number, vB: number, dtS: number): number {
  if (pCmS <= 0 || areaCm2 <= 0 || vA <= 1e-9 || vB <= 1e-9) return 0;
  const cA = nA / vA;
  const cB = nB / vB;
  const d = pCmS * areaCm2 * (cA - cB) * dtS;
  // Límite: a lo sumo hasta igualar concentraciones (C_A = C_B), nunca más de lo que hay en el lado de origen.
  const eq = (nA + nB) / (vA + vB);
  return d > 0 ? Math.min(d, Math.max(0, nA - eq * vA)) : Math.max(d, -Math.max(0, nB - eq * vB));
}

/**
 * Flujo de agua en un paso (REF-06): ΔV_B = Lp·A·((π_B − π_A) − (P_B − P_A))·dt (mL), positivo A → B: el agua va hacia
 * el lado hiperosmótico salvo que la presión hidrostática la contrarreste.
 */
export function osmoticStep(lp: number, areaCm2: number, piA: number, piB: number, pA: number, pB: number, dtS: number): number {
  if (lp <= 0 || areaCm2 <= 0) return 0;
  return lp * areaCm2 * (piB - piA - (pB - pA)) * dtS;
}

// ─────────────────────────── Ensayos ───────────────────────────

/** Precipitado de AgCl (REF-07): reacción por estequiometría, limitada por el reactivo en defecto. */
export function agclPrecipitate(chlorideMmol: number, silverMmol: number) {
  const ppt = Math.max(0, Math.min(chlorideMmol, silverMmol));
  return { pptMmol: ppt, chlorideLeft: chlorideMmol - ppt, silverLeft: silverMmol - ppt };
}

/** Turbidez blanca observable a simple vista por el precipitado (mmol en el tubo). */
export type ChlorideReading = 'none' | 'faint' | 'turbid' | 'precipitate' | 'interference';
export function chlorideReading(pptMmol: number, opts: { biuret: boolean; silverAdded: boolean; visibleMinMmol: number }): ChlorideReading {
  if (!opts.silverAdded) return 'none';
  if (opts.biuret) return 'interference';
  if (pptMmol >= opts.visibleMinMmol * 8) return 'precipitate';
  if (pptMmol >= opts.visibleMinMmol * 2) return 'turbid';
  if (pptMmol >= opts.visibleMinMmol) return 'faint';
  return 'none';
}

/**
 * Señal del reactivo de Biuret: violeta con enlaces peptídicos si la proteína (mg/mL en el tubo) supera el umbral y el
 * complejo tuvo tiempo de formarse; si no, queda el azul del reactivo. Con nitrato de plata en el tubo, no interpretable.
 */
export type BiuretReading = 'none' | 'blue' | 'weak' | 'violet' | 'interference';
export function biuretReading(proteinMgMl: number, opts: { biuretMl: number; ageS: number; delayS: number; silver: boolean; minMgMl: number }): BiuretReading {
  if (opts.biuretMl <= 1e-9) return 'none';
  if (opts.silver) return 'interference';
  const developed = Math.min(1, opts.ageS / Math.max(1e-9, opts.delayS));
  const signal = (proteinMgMl / opts.minMgMl) * developed;
  if (signal >= 3) return 'violet';
  if (signal >= 1) return 'weak';
  return 'blue';
}

/**
 * Intensidad de color del trazador (yodo/yoduro, ámbar) en un nivel cualitativo 0–4 por umbrales DIDÁCTICOS
 * (sin curva de calibración no se convierte en concentración, §3.3-4). Con curva, absorbancia A = ε·l·c.
 */
export function tracerLevel(cMmolMl: number, thresholds: number[]): number {
  let lvl = 0;
  for (const t of thresholds) if (cMmolMl >= t) lvl++;
  return lvl;
}
export const absorbance = (cMmolMl: number, epsilonMlPerMmolCm: number, pathCm: number) => epsilonMlPerMmolCm * pathCm * cMmolMl;

// ─────────────────────────── Célula de Elodea ───────────────────────────

/**
 * Volumen relativo de equilibrio del protoplasto (Boyle–van 't Hoff con fracción no osmótica b): en un medio
 * hipoosmótico la pared lo limita (1, turgencia); por encima de la osmolaridad interna se retrae (plasmólisis).
 * La etiqueta «isotónico» NO se deduce del %: depende de `innerOsm` de la célula configurada (§3.3-1).
 */
export function protoplastTarget(extOsm: number, innerOsm: number, nonOsmotic01: number): number {
  if (extOsm <= innerOsm) return 1;
  return nonOsmotic01 + (1 - nonOsmotic01) * (innerOsm / extOsm);
}

/** Relajación exponencial del volumen del protoplasto hacia su equilibrio (constante de tiempo τ, s). */
export const relaxProtoplast = (v: number, target: number, tauS: number, dtS: number) => v + (target - v) * (1 - Math.exp(-dtS / Math.max(1e-9, tauS)));

/** Estado observable de la célula según el volumen relativo del protoplasto. */
export type ElodeaState = 'turgid' | 'incipient' | 'plasmolyzed';
export function elodeaState(v: number, incipientBelow: number, plasmolyzedBelow: number): ElodeaState {
  if (v < plasmolyzedBelow) return 'plasmolyzed';
  if (v < incipientBelow) return 'incipient';
  return 'turgid';
}
