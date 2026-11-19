/**
 * Ecuaciones de F05 (§3): fuerza normal sobre plano horizontal e inclinado, coeficientes de rozamiento estático y
 * cinético, ángulo crítico, aceleración en el plano con roce cinético y trabajo del rozamiento.
 */
const finite = (...v: number[]) => v.every((x) => Number.isFinite(x));
const RAD = Math.PI / 180;

/** N = m g cos θ − T sen α (α: inclinación del cable sobre el tablero, 0 si el cable es paralelo). */
export function normalForce(m: number, g: number, thetaDeg = 0, T = 0, alphaDeg = 0): number {
  if (!finite(m, g, thetaDeg, T, alphaDeg)) return NaN;
  return m * g * Math.cos(thetaDeg * RAD) - T * Math.sin(alphaDeg * RAD);
}

/** μ = F / N (estático con el pico, cinético con la meseta). */
export function muFrom(F: number, N: number): number {
  if (!finite(F, N) || N <= 0) return NaN;
  return F / N;
}

/** μ_s = tan θ_c. */
export function muFromAngle(thetaDeg: number): number {
  if (!finite(thetaDeg) || thetaDeg <= 0 || thetaDeg >= 90) return NaN;
  return Math.tan(thetaDeg * RAD);
}

/** θ_c = arctan μ_s (°). */
export function criticalAngle(mu: number): number {
  if (!finite(mu) || mu <= 0) return NaN;
  return Math.atan(mu) / RAD;
}

/** a hacia abajo del plano = g (sen θ − μ_k cos θ); 0 si el roce alcanza a retener. */
export function slideAccel(g: number, thetaDeg: number, muK: number): number {
  if (!finite(g, thetaDeg, muK)) return NaN;
  const a = g * (Math.sin(thetaDeg * RAD) - muK * Math.cos(thetaDeg * RAD));
  return a > 0 ? a : 0;
}

/** μ_k = tan θ − a / (g cos θ) a partir de la aceleración medida en la bajada. */
export function muKFromSlide(a: number, g: number, thetaDeg: number): number {
  if (!finite(a, g, thetaDeg) || g <= 0) return NaN;
  const c = Math.cos(thetaDeg * RAD);
  if (c <= 0) return NaN;
  return Math.tan(thetaDeg * RAD) - a / (g * c);
}

/** W_roce = −μ_k N d (J, siempre negativo). */
export function frictionWork(muK: number, N: number, d: number): number {
  if (!finite(muK, N, d)) return NaN;
  return -Math.abs(muK * N * d);
}

/** a = (v₂² − v₁²) / (2 d) entre dos fotopuertas separadas d. */
export function kinematicAccel(v1: number, v2: number, d: number): number {
  if (!finite(v1, v2, d) || d <= 0) return NaN;
  return (v2 * v2 - v1 * v1) / (2 * d);
}

/** Rapidez media en una fotopuerta: ancho de la bandera / tiempo de bloqueo. */
export function gateSpeed(flagW: number, dt: number): number {
  if (!finite(flagW, dt) || dt <= 0) return NaN;
  return flagW / dt;
}

export { linFit } from '../f04/equations';
