/**
 * Ecuaciones de F10 (§3): equilibrio de una viga rígida en dos apoyos (ΣF = 0, Στ = 0), torque de un peso respecto
 * de un punto, ley de Hooke en tracción (σ = F/A, ε = ΔL/L₀, E = σ/ε, ΔL = F L₀ / (E A)) y deformación residual.
 */
const finite = (...v: number[]) => v.every((x) => Number.isFinite(x));

/** Área de una sección circular de diámetro d (mismas unidades al cuadrado). */
export const circleArea = (d: number) => (finite(d) && d > 0 ? (Math.PI * d * d) / 4 : NaN);

/**
 * Reacción del apoyo B (N) de una viga de peso Wb con centro de masa en xCG y cargas {W, x}, apoyada en xA y xB
 * (todas las coordenadas en la misma unidad, medidas sobre la escala de la viga): Στ_A = 0.
 */
export function reactionB(Wb: number, xCG: number, loads: Array<{ W: number; x: number }>, xA: number, xB: number): number {
  if (!finite(Wb, xCG, xA, xB) || Math.abs(xB - xA) < 1e-12) return NaN;
  let M = Wb * (xCG - xA);
  for (const l of loads) {
    if (!finite(l.W, l.x)) return NaN;
    M += l.W * (l.x - xA);
  }
  return M / (xB - xA);
}

/** Reacción del apoyo A (N) por ΣF = 0. */
export function reactionA(Wb: number, xCG: number, loads: Array<{ W: number; x: number }>, xA: number, xB: number): number {
  const RB = reactionB(Wb, xCG, loads, xA, xB);
  return Number.isFinite(RB) ? Wb + loads.reduce((s, l) => s + l.W, 0) - RB : NaN;
}

/** Torque (N·m) de una fuerza vertical F (N, + hacia abajo) aplicada en x respecto de x0 (m): τ = F (x − x0). */
export const torqueAbout = (F: number, x: number, x0: number) => (finite(F, x, x0) ? F * (x - x0) : NaN);

/** Vuelca si alguna reacción saldría negativa (apoyos que solo empujan). */
export const tipsOver = (RA: number, RB: number) => RA < 0 || RB < 0;

/** σ = F / A (Pa con F en N y A en m²). */
export const stress = (F: number, A: number) => (finite(F, A) && A > 0 ? F / A : NaN);
/** ε = ΔL / L₀ (adimensional). */
export const strain = (dL: number, L0: number) => (finite(dL, L0) && L0 > 0 ? dL / L0 : NaN);
/** E = σ / ε (Pa). */
export const youngModulus = (sigma: number, eps: number) => (finite(sigma, eps) && eps !== 0 ? sigma / eps : NaN);
/** Alargamiento elástico de Hooke: ΔL = F L₀ / (E A). */
export const hookeElongation = (F: number, L0: number, E: number, A: number) => (finite(F, L0, E, A) && E > 0 && A > 0 ? (F * L0) / (E * A) : NaN);

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
  return { a, b, ub: Math.sqrt(ss / (n - 2) / sxx) };
}

/** Pendiente por el origen y = k x. */
export function slopeThroughOrigin(xs: number[], ys: number[]): number {
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < Math.min(xs.length, ys.length); i++) {
    if (!finite(xs[i], ys[i])) continue;
    sxx += xs[i] * xs[i];
    sxy += xs[i] * ys[i];
  }
  return sxx > 0 ? sxy / sxx : NaN;
}
