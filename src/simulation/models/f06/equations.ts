/**
 * Ecuaciones de F06 (§3): ley elástica y energía del resorte, trabajo como área bajo F–x, energías cinética y
 * potencial gravitatoria, teorema trabajo–energía, trabajo no conservativo y potencia instantánea.
 */
const finite = (...v: number[]) => v.every((x) => Number.isFinite(x));
const RAD = Math.PI / 180;

/** |F| = k x en el régimen lineal (N). */
export function hookeForce(k: number, x: number): number {
  if (!finite(k, x)) return NaN;
  return k * x;
}

/** U_el = ½ k x² (J). */
export function elasticEnergy(k: number, x: number): number {
  if (!finite(k, x) || k < 0) return NaN;
  return 0.5 * k * x * x;
}

/** K = ½ m v² (J). */
export function kineticEnergy(m: number, v: number): number {
  if (!finite(m, v) || m < 0) return NaN;
  return 0.5 * m * v * v;
}

/** U_g = m g h (J). */
export function gravEnergy(m: number, g: number, h: number): number {
  if (!finite(m, g, h)) return NaN;
  return m * g * h;
}

/** Rapidez en una fotopuerta: ancho de la bandera / tiempo de bloqueo (m/s). */
export function gateSpeed(flagW: number, dt: number): number {
  if (!finite(flagW, dt) || dt <= 0) return NaN;
  return flagW / dt;
}

/** W = ∫ F dx por trapecios sobre puntos (x, F) ordenados (J). */
export function areaUnder(pts: Array<[number, number]>): number {
  if (pts.length < 2 || !pts.every(([x, F]) => finite(x, F))) return NaN;
  let W = 0;
  for (let i = 0; i + 1 < pts.length; i++) W += ((pts[i][1] + pts[i + 1][1]) / 2) * (pts[i + 1][0] - pts[i][0]);
  return W;
}

/** W_nc = ΔE_mec = (K₂ + U₂) − (K₁ + U₁) (J); negativo cuando hay pérdidas. */
export function nonConservativeWork(K1: number, U1: number, K2: number, U2: number): number {
  if (!finite(K1, U1, K2, U2)) return NaN;
  return K2 + U2 - (K1 + U1);
}

/** Rapidez en la parte alta predicha por la conservación: v₂ = √(v₁² − 2 g h) (m/s), NaN si no llega. */
export function topSpeed(v1: number, g: number, h: number): number {
  if (!finite(v1, g, h)) return NaN;
  const s = v1 * v1 - 2 * g * h;
  return s >= 0 ? Math.sqrt(s) : NaN;
}

/** Caída de altura del péndulo: h = L (1 − cos θ₀) (m). */
export function pendulumDrop(L: number, thetaDeg: number): number {
  if (!finite(L, thetaDeg)) return NaN;
  return L * (1 - Math.cos(thetaDeg * RAD));
}

/** Potencia instantánea P = F v (W). */
export function power(F: number, v: number): number {
  if (!finite(F, v)) return NaN;
  return F * v;
}

/** Discrepancia relativa (%) de a respecto de b. */
export function relDiff(a: number, b: number): number {
  if (!finite(a, b) || b === 0) return NaN;
  return (100 * (a - b)) / b;
}

export { linFit } from '../f04/equations';
