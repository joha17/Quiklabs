/**
 * Ecuaciones de F11 (§3): presión hidrostática p = p_sup + ρ g h (h positiva hacia abajo), principio de Arquímedes
 * F_b = ρ g V_sub, fracción sumergida de un cuerpo que flota V_sub/V = ρ_obj/ρ_fluido y densidad por masa y volumen.
 */
const finite = (...v: number[]) => v.every((x) => Number.isFinite(x));

/** Presión manométrica (Pa) de un líquido homogéneo quieto a la profundidad h (m). */
export const gaugePressure = (rho: number, g: number, h: number) => (finite(rho, g, h) ? rho * g * h : NaN);

/** Presión absoluta (Pa) con la de la superficie p0 (Pa). */
export const absolutePressure = (p0: number, rho: number, g: number, h: number) => (finite(p0) ? p0 + gaugePressure(rho, g, h) : NaN);

/** Empuje (N) de un volumen sumergido V (m³). */
export const buoyancy = (rho: number, g: number, V: number) => (finite(rho, g, V) && V >= 0 ? rho * g * V : NaN);

/** Fracción sumergida de equilibrio; > 1 significa que se hunde. */
export const floatFraction = (rhoObj: number, rhoFluid: number) => (finite(rhoObj, rhoFluid) && rhoFluid > 0 ? rhoObj / rhoFluid : NaN);

/** ¿Flota libremente? */
export const floats = (rhoObj: number, rhoFluid: number) => Number.isFinite(rhoObj) && Number.isFinite(rhoFluid) && rhoObj <= rhoFluid;

/** Densidad (kg/m³) de una masa en g y un volumen en mL (= cm³). */
export const densityGmL = (mG: number, vML: number) => (finite(mG, vML) && vML > 0 ? (mG / vML) * 1000 : NaN);

/** Peso aparente (N) de un cuerpo de peso W colgado con V_sub sumergido. */
export const apparentWeight = (W: number, rho: number, g: number, V: number) => (finite(W) ? W - buoyancy(rho, g, V) : NaN);

/** Presión con un perfil lineal de densidad (Pa): ρ(z) = ρ̄ + Δ(½ − z/L) con z desde el fondo; L y h en m. */
export function stratifiedPressure(rhoMean: number, delta: number, g: number, L: number, h: number): number {
  if (!finite(rhoMean, delta, g, L, h) || L <= 0) return NaN;
  const hh = Math.max(0, Math.min(h, L));
  return g * (rhoMean * hh - (delta * hh * (L - hh)) / (2 * L));
}

/** Discrepancia relativa (%) de a respecto de b. */
export function relDiff(a: number, b: number): number {
  if (!finite(a, b) || b === 0) return NaN;
  return (100 * (a - b)) / b;
}

/** Recta de mínimos cuadrados y = a + b x con la incertidumbre de la pendiente (null con menos de 3 puntos). */
export function linearFit(xs: number[], ys: number[]): { a: number; b: number; ub: number } | null {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < Math.min(xs.length, ys.length); i++) if (finite(xs[i], ys[i])) pts.push([xs[i], ys[i]]);
  const n = pts.length;
  if (n < 3) return null;
  const xm = pts.reduce((s, p) => s + p[0], 0) / n;
  const ym = pts.reduce((s, p) => s + p[1], 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (const [x, y] of pts) {
    sxx += (x - xm) ** 2;
    sxy += (x - xm) * (y - ym);
  }
  if (sxx <= 0) return null;
  const b = sxy / sxx;
  const a = ym - b * xm;
  const ss = pts.reduce((s, [x, y]) => s + (y - a - b * x) ** 2, 0);
  return { a, b, ub: n > 2 ? Math.sqrt(ss / (n - 2) / sxx) : 0 };
}
