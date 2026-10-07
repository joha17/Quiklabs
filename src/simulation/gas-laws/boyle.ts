/**
 * Análisis de la ley de Boyle (§24): productos PV, ajuste potencial libre `P = A·Vⁿ` (regresión ln P – ln V),
 * ajustes con exponente fijo (n = −1 y n = +1), linealización `P = a·(1/V) + b`, R², RMSE y residuos.
 * Todos los ajustes rechazan valores no positivos (no hay logaritmos de 0 o negativos).
 */

export interface PvPoint {
  vMl: number;
  pKPa: number;
}

export interface FitQuality {
  r2: number;
  rmse: number;
  residuals: number[];
}

function quality(points: PvPoint[], predict: (v: number) => number): FitQuality {
  const ps = points.map((q) => q.pKPa);
  const mean = ps.reduce((s, v) => s + v, 0) / ps.length;
  const residuals = points.map((q) => q.pKPa - predict(q.vMl));
  const ssRes = residuals.reduce((s, r) => s + r * r, 0);
  const ssTot = ps.reduce((s, p) => s + (p - mean) ** 2, 0);
  return { r2: ssTot > 0 ? 1 - ssRes / ssTot : 1, rmse: Math.sqrt(ssRes / ps.length), residuals };
}

export const validPoints = (pts: PvPoint[]) => pts.filter((q) => Number.isFinite(q.vMl) && Number.isFinite(q.pKPa) && q.vMl > 0 && q.pKPa > 0);

/** Regresión lineal y = a·x + b. */
export function linearFit(xs: number[], ys: number[]) {
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  const a = sxx > 0 ? sxy / sxx : 0;
  const b = my - a * mx;
  const r2 = sxx > 0 && syy > 0 ? (sxy * sxy) / (sxx * syy) : 1;
  return { a, b, r2 };
}

/** Ajuste libre `P = A·Vⁿ` (en escala logarítmica); la calidad se informa en la escala de P. */
export function powerFitFree(pts: PvPoint[]): ({ A: number; n: number } & FitQuality) | null {
  const p = validPoints(pts);
  if (p.length < 3) return null;
  const f = linearFit(p.map((q) => Math.log(q.vMl)), p.map((q) => Math.log(q.pKPa)));
  const A = Math.exp(f.b);
  return { A, n: f.a, ...quality(p, (v) => A * v ** f.a) };
}

/** Ajuste con exponente fijo `P = A·Vⁿ` por mínimos cuadrados en P. */
export function powerFitFixed(pts: PvPoint[], n: number): ({ A: number; n: number } & FitQuality) | null {
  const p = validPoints(pts);
  if (p.length < 2) return null;
  const num = p.reduce((s, q) => s + q.pKPa * q.vMl ** n, 0);
  const den = p.reduce((s, q) => s + q.vMl ** (2 * n), 0);
  const A = num / den;
  return { A, n, ...quality(p, (v) => A * v ** n) };
}

/** Linealización `P = a·(1/V) + b` (§24.3): idealmente b ≈ 0. */
export function inverseFit(pts: PvPoint[]): ({ a: number; b: number } & FitQuality) | null {
  const p = validPoints(pts);
  if (p.length < 3) return null;
  const f = linearFit(p.map((q) => 1 / q.vMl), p.map((q) => q.pKPa));
  return { a: f.a, b: f.b, ...quality(p, (v) => f.a / v + f.b) };
}

/** Productos K = P·V (kPa·mL) con media, desviación y coeficiente de variación (§24.1). */
export function pvProducts(pts: PvPoint[]) {
  const ks = validPoints(pts).map((q) => q.pKPa * q.vMl);
  const n = ks.length;
  const mean = n ? ks.reduce((s, v) => s + v, 0) / n : 0;
  const sd = n > 1 ? Math.sqrt(ks.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)) : 0;
  return { ks, mean, sd, cvPct: mean ? (sd / mean) * 100 : 0 };
}

/** Presiones ideales de la tabla de referencia (§23.3): `P₀·V₀ / V`. */
export const idealBoyleKPa = (v0Ml: number, p0KPa: number, vMl: number) => (p0KPa * v0Ml) / vMl;

/** Cambios de signo de una secuencia de residuos (prueba de rachas). */
const signChanges = (rs: number[]) => rs.slice(1).filter((r, i) => Math.sign(r) !== Math.sign(rs[i]) && r !== 0 && rs[i] !== 0).length;

/**
 * Diagnóstico del patrón de residuos del ajuste n = −1 (§24.5): sistemático según V (curvatura, p. ej. volumen muerto
 * mal sumado), sistemático según el orden de toma (deriva por fuga) o aleatorio. `minRmse` evita llamar sistemático
 * a lo que no supera la resolución del sensor.
 */
export function residualPattern(pts: PvPoint[], minRmse = 0.15): 'RANDOM' | 'CURVED' | 'DRIFT' | 'INSUFFICIENT' {
  const fit = powerFitFixed(pts, -1);
  const p = validPoints(pts);
  if (!fit || p.length < 5) return 'INSUFFICIENT';
  if (fit.rmse < minRmse) return 'RANDOM';
  const byV = p.map((q, i) => ({ v: q.vMl, r: fit.residuals[i] })).sort((a, b) => a.v - b.v).map((o) => o.r);
  const byT = fit.residuals;
  const monotonic = p.every((q, i) => i === 0 || q.vMl > p[i - 1].vMl) || p.every((q, i) => i === 0 || q.vMl < p[i - 1].vMl);
  const fewV = signChanges(byV) <= 2;
  const fewT = signChanges(byT) <= 1;
  if (!monotonic && fewT && !fewV) return 'DRIFT';
  if (fewV) return 'CURVED';
  return 'RANDOM';
}
