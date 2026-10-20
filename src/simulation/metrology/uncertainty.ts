/**
 * Metrología de la Práctica 1 (§3.3, §7): incertidumbres estándar de entradas independientes, propagación lineal
 * (orden uno) y estadística de repeticiones. Es una SIMPLIFICACIÓN docente declarada al estudiante, no una ley
 * universal: no hay covarianzas salvo donde se indica.
 *
 * Convenciones (una por intento, visible en la libreta):
 * - 'DIRECT': la incertidumbre del instrumento se toma tal cual (u = a).
 * - 'RECTANGULAR': un semiancho ±a con distribución uniforme da u = a/√3.
 */

export type UncertaintyConvention = 'DIRECT' | 'RECTANGULAR';

/** Incertidumbre estándar a partir de un semiancho ±a según la convención. */
export function standardFromHalfWidth(a: number, conv: UncertaintyConvention): number {
  if (!Number.isFinite(a) || a < 0) return NaN;
  return conv === 'RECTANGULAR' ? a / Math.sqrt(3) : a;
}

/** u(a ± b) para entradas independientes: √(u(a)² + u(b)²). */
export function uncertaintySubtract(ua: number, ub: number): number {
  if (![ua, ub].every((x) => Number.isFinite(x) && x >= 0)) return NaN;
  return Math.hypot(ua, ub);
}

/** u(ρ) de ρ = m/V con entradas independientes: ρ √((u(m)/m)² + (u(V)/V)²). */
export function uncertaintyDensity(m: number, um: number, V: number, uV: number): number {
  if (!(m > 0) || !(V > 0) || !(um >= 0) || !(uV >= 0)) return NaN;
  const rho = m / V;
  return rho * Math.hypot(um / m, uV / V);
}

/** u(V) de V = π(d/2)²h: V √((2u(d)/d)² + (u(h)/h)²). */
export function uncertaintyCylinderVolume(d: number, ud: number, h: number, uh: number): number {
  if (!(d > 0) || !(h > 0) || !(ud >= 0) || !(uh >= 0)) return NaN;
  const V = Math.PI * (d / 2) ** 2 * h;
  return V * Math.hypot((2 * ud) / d, uh / h);
}

/** Media aritmética. */
export function mean(xs: number[]): number {
  const v = xs.filter(Number.isFinite);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN;
}

/** Desviación absoluta media: Σ|xᵢ − x̄|/n (con valor absoluto: los desvíos con signo suman cero). */
export function meanAbsoluteDeviation(xs: number[]): number {
  const v = xs.filter(Number.isFinite);
  if (!v.length) return NaN;
  const m = mean(v);
  return v.reduce((s, x) => s + Math.abs(x - m), 0) / v.length;
}

/** Desviación estándar muestral s = √(Σ(xᵢ − x̄)²/(n − 1)), n ≥ 2. */
export function sampleStdDev(xs: number[]): number {
  const v = xs.filter(Number.isFinite);
  if (v.length < 2) return NaN;
  const m = mean(v);
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
}

/** Incertidumbre de la media s/√n (no es lo mismo que s ni que la desviación absoluta media). */
export function stdErrorOfMean(xs: number[]): number {
  const v = xs.filter(Number.isFinite);
  const s = sampleStdDev(v);
  return Number.isFinite(s) ? s / Math.sqrt(v.length) : NaN;
}

/** Redondea a la resolución de un instrumento (lo que la pantalla o la escala permite leer). */
export function quantize(x: number, resolution: number): number {
  if (!Number.isFinite(x) || !(resolution > 0)) return NaN;
  const q = Math.round(x / resolution) * resolution;
  const dec = Math.max(0, Math.ceil(-Math.log10(resolution) - 1e-9));
  return Number(q.toFixed(dec));
}

/** Cantidad de decimales de un número escrito (para detectar cifras imposibles según la lectura). */
export function decimalsOf(text: string): number {
  const m = /[.,](\d+)/.exec(text.trim());
  return m ? m[1].length : 0;
}
