/**
 * Disolución de sólidos (§3.2): el equilibrio lo fija la SOLUBILIDAD y no la duración de una animación.
 *   m* = min(m_total, c_sat·V_fase)       dm/dt = k_d·A_eff·(m* − m_disuelto)
 * Agitar multiplica k_d (transporte), nunca c_sat. Funciones puras.
 */

/** Masa disuelta en el equilibrio (g): c_sat en g/L, volumen de la fase en mL. */
export function equilibriumDissolvedG(totalG: number, csatGL: number, phaseMl: number): number {
  return Math.max(0, Math.min(totalG, (csatGL * phaseMl) / 1000));
}

/** Paso cinético hacia el equilibrio (g disueltos al final del paso), sin sobrepasarlo ni perder masa. */
export function dissolveStep(dissolvedG: number, totalG: number, csatGL: number, phaseMl: number, kdS: number, stir01: number, dtS: number): number {
  const target = equilibriumDissolvedG(totalG, csatGL, phaseMl);
  // Agitar acelera hasta ×6; un sólido quieto en el fondo apenas se disuelve (×0,25).
  const k = kdS * (0.25 + 5.75 * Math.max(0, Math.min(1, stir01)));
  const next = target + (dissolvedG - target) * Math.exp(-k * dtS);
  return Math.max(0, Math.min(totalG, next));
}

/** Tiempo característico (s) para llegar al 95 % del equilibrio con una agitación dada. */
export const time95S = (kdS: number, stir01: number) => 3 / (kdS * (0.25 + 5.75 * Math.max(0, Math.min(1, stir01))));
