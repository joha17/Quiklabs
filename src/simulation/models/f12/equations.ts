/**
 * Ecuaciones de F12 (§3): continuidad incompresible A₁v₁ = A₂v₂ = Q, Bernoulli horizontal p₁ + ½ρv₁² = p₂ + ½ρv₂²,
 * modelo real con ρgz, pérdidas Δp = ½ρKv² y potencia disipada P = Q·Δp. Todo en SI.
 */
const finite = (...v: number[]) => v.every((x) => Number.isFinite(x));

/** Área de una sección circular (m²) de diámetro D (m). */
export const area = (D: number) => (finite(D) && D > 0 ? (Math.PI * D * D) / 4 : NaN);

/** Velocidad media (m/s) de un caudal Q (m³/s) por un área A (m²). */
export const velocity = (Q: number, A: number) => (finite(Q, A) && A > 0 ? Q / A : NaN);

/** Caída ideal de presión entre dos secciones horizontales (Pa): ½ρ(v₂² − v₁²). */
export const bernoulliDrop = (rho: number, v1: number, v2: number) => (finite(rho, v1, v2) ? 0.5 * rho * (v2 * v2 - v1 * v1) : NaN);

/** Caída ideal de un Venturi (Pa) para Q, D₁ y D₂: ½ρQ²(1/A₂² − 1/A₁²). */
export function venturiDrop(rho: number, Q: number, D1: number, D2: number): number {
  const a1 = area(D1);
  const a2 = area(D2);
  return finite(rho, Q, a1, a2) ? 0.5 * rho * Q * Q * (1 / (a2 * a2) - 1 / (a1 * a1)) : NaN;
}

/** Caudal de un Venturi ideal (m³/s) a partir de la caída medida Δp (Pa). */
export function venturiFlow(rho: number, dp: number, D1: number, D2: number): number {
  const a1 = area(D1);
  const a2 = area(D2);
  if (!finite(rho, dp, a1, a2) || dp < 0) return NaN;
  return a2 * Math.sqrt((2 * dp) / (rho * (1 - (a2 / a1) ** 2)));
}

/** Pérdida de presión (Pa) con coeficiente K a la velocidad v. */
export const lossPressure = (rho: number, K: number, v: number) => (finite(rho, K, v) ? 0.5 * rho * K * v * v : NaN);

/** Coeficiente de pérdida a partir de una caída medida (sin cambio de sección), con la corrección de altura. */
export function lossCoefficient(rho: number, g: number, dp: number, dz: number, v: number): number {
  if (!finite(rho, g, dp, dz, v) || v <= 0) return NaN;
  return (dp - rho * g * dz) / (0.5 * rho * v * v);
}

/** Potencia disipada (W). */
export const dissipatedPower = (Q: number, dp: number) => (finite(Q, dp) ? Q * dp : NaN);

/** Presión total (Pa) que lee una sonda de Pitot de frente al flujo. */
export const totalPressure = (p: number, rho: number, v: number) => (finite(p, rho, v) ? p + 0.5 * rho * v * v : NaN);

/** Caudal volumétrico (L/s) de un volumen en mL y un tiempo en s. */
export const volumetricFlow = (vML: number, tS: number) => (finite(vML, tS) && tS > 0 ? vML / 1000 / tS : NaN);

/** Número de Mach de un gas ideal (para el límite de incompresibilidad, Ma < 0,3). */
export const mach = (v: number, c: number) => (finite(v, c) && c > 0 ? v / c : NaN);

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

/** Recta por el origen y = b x (la caída ideal no tiene ordenada) con u(b). */
export function originFit(xs: number[], ys: number[]): { b: number; ub: number } | null {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < Math.min(xs.length, ys.length); i++) if (finite(xs[i], ys[i])) pts.push([xs[i], ys[i]]);
  const n = pts.length;
  if (n < 3) return null;
  const sxx = pts.reduce((s, p) => s + p[0] * p[0], 0);
  if (sxx <= 0) return null;
  const b = pts.reduce((s, p) => s + p[0] * p[1], 0) / sxx;
  const ss = pts.reduce((s, [x, y]) => s + (y - b * x) ** 2, 0);
  return { b, ub: Math.sqrt(ss / (n - 1) / sxx) };
}
