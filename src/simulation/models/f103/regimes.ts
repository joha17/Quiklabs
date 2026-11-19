/**
 * Regímenes de validez de F103 (§3.4). La parábola vale mientras el arrastre sea una fracción pequeña del peso, no haya
 * viento y el disparo esté en el plano vertical de la pista; el primer contacto define el alcance (los rebotes no).
 */
const finite = (...v: number[]) => v.every((x) => Number.isFinite(x));

/** Arrastre cuadrático como fracción del peso a la rapidez v: ½ ρ C_d A v² / (m g). */
export function dragFraction(v: number, m: number, g: number, rho: number, cd: number, area: number): number {
  if (!finite(v, m, g, rho, cd, area) || m <= 0 || g <= 0) return NaN;
  return (0.5 * rho * cd * area * v * v) / (m * g);
}

/** ¿La parábola ideal es un buen modelo (arrastre < 3 % del peso a la rapidez de salida)? */
export const parabolaValid = (v0: number, m: number, g: number, rho: number, cd: number, area: number) => {
  const f = dragFraction(v0, m, g, rho, cd, area);
  return Number.isFinite(f) && f < 0.03;
};

export type ProjectileRegime = 'ideal' | 'drag' | 'wind' | 'out_of_plane' | 'invalid';

export function classifyShot(flags: string[], dragFrac: number): ProjectileRegime {
  if (flags.some((f) => ['MISSED', 'MISSED_PLATFORM', 'OCCLUDED', 'BOUNCE', 'CONFIG_CHANGED', 'WIND_CHANGED', 'POST_IMPACT', 'UNSETTLED'].includes(f))) return 'invalid';
  if (flags.includes('LATERAL')) return 'out_of_plane';
  if (flags.includes('WIND')) return 'wind';
  return Number.isFinite(dragFrac) && dragFrac >= 0.03 ? 'drag' : 'ideal';
}
