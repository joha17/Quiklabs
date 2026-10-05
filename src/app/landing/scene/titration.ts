/**
 * Simulador mínimo de la página de inicio: valoración de HCl con NaOH y fenolftaleína.
 * Mismo modelo que la Práctica 4 (ácido y base fuertes, balance de protones con Kw), en una sola función pura.
 */
export const TITRATION = {
  acidMl: 25,
  acidM: 0.1,
  baseM: 0.1,
  /** Volumen máximo de la bureta que recorre la escena (mL). */
  maxMl: 35,
  kw: 1e-14,
} as const;

/** Volumen de NaOH en el punto de equivalencia (mL). */
export const EQUIVALENCE_ML = (TITRATION.acidM * TITRATION.acidMl) / TITRATION.baseM;

/** pH tras añadir `baseMl` mL de NaOH: h = (d + √(d² + 4·Kw)) / 2, con d = exceso neto de H⁺ (mol/L). */
export function titrationPH(baseMl: number): number {
  const v = Math.max(0, baseMl);
  const nH = (TITRATION.acidM * TITRATION.acidMl) / 1000;
  const nOH = (TITRATION.baseM * v) / 1000;
  const volL = (TITRATION.acidMl + v) / 1000;
  const d = (nH - nOH) / volL;
  const h = (d + Math.sqrt(d * d + 4 * TITRATION.kw)) / 2;
  return -Math.log10(h);
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Intensidad del rosa de la fenolftaleína (0 incolora, 1 fucsia): vira entre pH 8,2 y 10. */
export function phenolphthaleinPink(pH: number): number {
  return smoothstep(8.2, 10, pH);
}
