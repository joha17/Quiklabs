/**
 * Solubilidad del CO₂ en agua (§13.3, NIST): ley de Henry `C* = kH(T)·P_CO₂` con
 * kH(298,15 K) = 0,034 mol·L⁻¹·atm⁻¹ y d(ln kH)/d(1/T) = 2400 K. En la disolución ácida del reactor el CO₂ disuelto
 * permanece como CO₂(aq) (el bicarbonato reacciona); en el agua del baño se trata igual (modelo simplificado).
 */
export const KH_298 = 0.034;
export const KH_DT = 2400;

/** kH (mol·L⁻¹·atm⁻¹) a la temperatura `tK`. */
export const henryK = (tK: number) => KH_298 * Math.exp(KH_DT * (1 / tK - 1 / 298.15));

/** Concentración de equilibrio (mol/L) para una presión parcial de CO₂ en atm. */
export const co2Saturation = (pCo2Atm: number, tK: number) => henryK(tK) * Math.max(0, pCo2Atm);
