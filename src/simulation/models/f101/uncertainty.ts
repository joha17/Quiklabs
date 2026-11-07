/**
 * Incertidumbre de F101 (§3.3): separación tipo A (repetibilidad) / tipo B (instrumento) y propagación de primer orden
 * u²(f) = Σ (∂f/∂xᵢ)² u²(xᵢ) para entradas INDEPENDIENTES. Es la simplificación docente declarada: la parte tipo B de
 * un mismo instrumento es común a todas las repeticiones y no se divide entre √n (F101-E18).
 */
import { DEG } from './equations';

const finite = (...v: number[]) => v.every((x) => Number.isFinite(x));

export function mean(xs: number[]): number {
  const v = xs.filter(Number.isFinite);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN;
}

/** Desviación estándar muestral (n − 1), n ≥ 2. */
export function sampleStd(xs: number[]): number {
  const v = xs.filter(Number.isFinite);
  if (v.length < 2) return NaN;
  const m = mean(v);
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
}

/** Tipo A de la media: s/√n (0 si todas las repeticiones coinciden; NaN con menos de dos). */
export function typeA(xs: number[]): number {
  const v = xs.filter(Number.isFinite);
  const s = sampleStd(v);
  return Number.isFinite(s) ? s / Math.sqrt(v.length) : NaN;
}

/** Combinada de la media de repeticiones: √(u_A² + u_B²). Con una sola lectura, solo u_B. */
export function combinedMean(xs: number[], uB: number): number {
  const a = typeA(xs);
  return Number.isFinite(a) ? Math.hypot(a, uB) : uB;
}

/** u(V) del cilindro V = π d² h/4: V √((2u_d/d)² + (u_h/h)²). */
export function uCylinderVolume(d: number, ud: number, h: number, uh: number): number {
  if (!finite(d, ud, h, uh) || d <= 0 || h <= 0) return NaN;
  const V = (Math.PI * d * d * h) / 4;
  return V * Math.hypot((2 * ud) / d, uh / h);
}

/** u(V) de la esfera V = π d³/6: 3 V u_d/d. */
export function uSphereVolume(d: number, ud: number): number {
  if (!finite(d, ud) || d <= 0) return NaN;
  return ((Math.PI * d ** 3) / 6) * ((3 * ud) / d);
}

/** u(ρ) de ρ = m/V: ρ √((u_m/m)² + (u_V/V)²). */
export function uDensity(m: number, um: number, V: number, uV: number): number {
  if (!finite(m, um, V, uV) || m <= 0 || V <= 0) return NaN;
  return (m / V) * Math.hypot(um / m, uV / V);
}

/** u de una resta de entradas independientes: √(u_a² + u_b²). */
export const uDifference = (ua: number, ub: number) => (finite(ua, ub) ? Math.hypot(ua, ub) : NaN);

/** u de las componentes de F (N) con u_F (N) y u_θ (grados). */
export function uComponents(F: number, uF: number, thetaDeg: number, uThetaDeg: number): { ux: number; uy: number } {
  const t = thetaDeg * DEG;
  const ut = uThetaDeg * DEG;
  return {
    ux: Math.hypot(Math.cos(t) * uF, F * Math.sin(t) * ut),
    uy: Math.hypot(Math.sin(t) * uF, F * Math.cos(t) * ut),
  };
}

/** Redondea a la resolución (lo que la escala permite leer). */
export function quantize(x: number, res: number): number {
  if (!Number.isFinite(x) || !(res > 0)) return NaN;
  const dec = Math.max(0, Math.ceil(-Math.log10(res) - 1e-9));
  return Number((Math.round(x / res) * res).toFixed(dec));
}

/** Decimales escritos en un número (detección de cifras imposibles o redondeo prematuro). */
export function decimalsOf(text: string): number {
  const m = /[.,](\d+)/.exec((text ?? '').trim());
  return m ? m[1].length : 0;
}
