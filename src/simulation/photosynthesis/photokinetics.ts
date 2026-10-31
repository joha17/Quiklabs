/**
 * Fotosíntesis y respiración (§3.1): familia FENOMENOLÓGICA, no constantes fisiológicas. `I` es un índice relativo de
 * lámpara (a.u., no PAR calibrado) y `C` el carbono inorgánico disponible (mmol/L). Dominio puro.
 */
export interface PhotoKinetics {
  /** µmol O₂ · min⁻¹ · g⁻¹ a luz y carbono saturantes (perfil sintético). */
  pMax: number;
  kI: number;
  kC: number;
  /** Respiración a 25 °C (µmol O₂ · min⁻¹ · g⁻¹). */
  r25: number;
  tOptC: number;
  tWidthC: number;
  q10: number;
}

export const fT = (tC: number, k: PhotoKinetics) => Math.exp(-(((tC - k.tOptC) / k.tWidthC) ** 2));

/** P_gross(I, C, T) = Pmax · I/(KI+I) · C/(KC+C) · fT. Sin luz o sin carbono es exactamente 0. */
export function pGross(i: number, c: number, tC: number, k: PhotoKinetics): number {
  if (i <= 0 || c <= 0) return 0;
  return k.pMax * (i / (k.kI + i)) * (c / (k.kC + c)) * fT(tC, k);
}

export const respiration = (tC: number, k: PhotoKinetics) => k.r25 * k.q10 ** ((tC - 25) / 10);

/** Atenuación geométrica de la lámpara: índice = potencia · (d₀/d)², sin superar la potencia a menos de d₀. */
export function lampIndex(powerPct: number, distanceCm: number, refCm: number): number {
  if (powerPct <= 0) return 0;
  return powerPct * Math.min(1, (refCm / Math.max(distanceCm, 1)) ** 2);
}

/** Estimación CONDICIONADA de bruta (§3.1): solo si R_luz ≈ R_oscuro. */
export const grossEstimate = (netLight: number, dark: number) => netLight + Math.abs(dark);
