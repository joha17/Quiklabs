/**
 * Ecuaciones de F102 (§3): cinemática rectilínea con aceleración constante, dinámica del carro con masa colgante,
 * caída libre y velocidad límite con arrastre cuadrático. Funciones puras en SI con dominio explícito: fuera de
 * dominio devuelven NaN (nunca un número inventado).
 */
const finite = (...v: number[]) => v.every((x) => Number.isFinite(x));

/** Posición x(t) = x₀ + v₀ t + ½ a t² (m). */
export const positionMRUA = (x0: number, v0: number, a: number, t: number) => (finite(x0, v0, a, t) && t >= 0 ? x0 + v0 * t + 0.5 * a * t * t : NaN);
/** Velocidad v(t) = v₀ + a t (m/s). */
export const velocityMRUA = (v0: number, a: number, t: number) => (finite(v0, a, t) && t >= 0 ? v0 + a * t : NaN);
/** v² = v₀² + 2 a Δx; NaN si no hay solución real. */
export function velocityFromDisplacement(v0: number, a: number, dx: number): number {
  if (!finite(v0, a, dx)) return NaN;
  const v2 = v0 * v0 + 2 * a * dx;
  return v2 < 0 ? NaN : Math.sqrt(v2);
}
/** Velocidad media d/t (m/s). */
export const meanVelocity = (d: number, t: number) => (finite(d, t) && t > 0 ? d / t : NaN);
/** Velocidad instantánea con compuerta: ancho de bandera / tiempo de bloqueo (m/s). */
export const gateVelocity = (flagW: number, dtBlock: number) => (finite(flagW, dtBlock) && flagW > 0 && dtBlock > 0 ? flagW / dtBlock : NaN);
/** a = (v₂² − v₁²)/(2 d) entre dos compuertas. */
export const accelFromGates = (v1: number, v2: number, d: number) => (finite(v1, v2, d) && d > 0 ? (v2 * v2 - v1 * v1) / (2 * d) : NaN);
/** Aceleración ideal del carro con masa colgante: a = m g / (M + m + I/r²) − (F_r)/(M + m + I/r²). */
export function atwoodAccel(mCart: number, mHang: number, g: number, iEq = 0, frictionN = 0): number {
  if (!finite(mCart, mHang, g, iEq, frictionN) || mCart <= 0 || mHang < 0 || iEq < 0) return NaN;
  return (mHang * g - frictionN) / (mCart + mHang + iEq);
}
/** Tensión del cordel T = m (g − a). */
export const stringTension = (mHang: number, g: number, a: number) => (finite(mHang, g, a) && mHang >= 0 ? mHang * (g - a) : NaN);
/** Componente de la gravedad a lo largo de un plano inclinado: g sen θ (θ en grados). */
export const inclineAccel = (g: number, thetaDeg: number) => (finite(g, thetaDeg) ? g * Math.sin((thetaDeg * Math.PI) / 180) : NaN);
/** Tiempo de caída libre desde el reposo: t = √(2 h / g). */
export const fallTime = (h: number, g: number) => (finite(h, g) && h >= 0 && g > 0 ? Math.sqrt((2 * h) / g) : NaN);
/** g a partir de h y t: g = 2 h / t². */
export const gFromFall = (h: number, t: number) => (finite(h, t) && h > 0 && t > 0 ? (2 * h) / (t * t) : NaN);
/** Velocidad límite con arrastre cuadrático: v_t = √(2 m g / (ρ C_d A)). */
export function terminalVelocity(m: number, g: number, rho: number, cd: number, area: number): number {
  if (!finite(m, g, rho, cd, area) || m <= 0 || g <= 0 || rho <= 0 || cd <= 0 || area <= 0) return NaN;
  return Math.sqrt((2 * m * g) / (rho * cd * area));
}
/** Error relativo porcentual respecto de una referencia. */
export const relErrorPct = (x: number, ref: number) => (finite(x, ref) && ref !== 0 ? (100 * (x - ref)) / Math.abs(ref) : NaN);

/**
 * Ajuste cuadrático por mínimos cuadrados x(t) = c₀ + c₁ t + c₂ t² → { x0: c₀, v0: c₁, a: 2 c₂ }, con las
 * incertidumbres estándar de v₀ y a a partir de los residuos (n ≥ 4). NaN si los datos no alcanzan.
 */
export function quadraticFit(pts: Array<[number, number]>): { x0: number; v0: number; a: number; ua: number; uv0: number; rms: number } {
  const n = pts.length;
  const nan = { x0: NaN, v0: NaN, a: NaN, ua: NaN, uv0: NaN, rms: NaN };
  if (n < 3 || !pts.every(([t, x]) => finite(t, x))) return nan;
  // Centrar el tiempo mejora el condicionamiento; luego se vuelve al origen.
  const tm = pts.reduce((s, p) => s + p[0], 0) / n;
  const S = Array.from({ length: 5 }, (_, k) => pts.reduce((s, [t]) => s + (t - tm) ** k, 0));
  const B = Array.from({ length: 3 }, (_, k) => pts.reduce((s, [t, x]) => s + x * (t - tm) ** k, 0));
  const A = [[S[0], S[1], S[2]], [S[1], S[2], S[3]], [S[2], S[3], S[4]]];
  const inv = invert3(A);
  if (!inv) return nan;
  const c = inv.map((row) => row[0] * B[0] + row[1] * B[1] + row[2] * B[2]);
  const res = pts.map(([t, x]) => x - (c[0] + c[1] * (t - tm) + c[2] * (t - tm) ** 2));
  const ss = res.reduce((s, r) => s + r * r, 0);
  const s2 = n > 3 ? ss / (n - 3) : NaN;
  // Volver al origen t = 0: x = a0 + a1 t + a2 t².
  const a2 = c[2];
  const a1 = c[1] - 2 * c[2] * tm;
  const a0 = c[0] - c[1] * tm + c[2] * tm * tm;
  const uA2 = Math.sqrt(s2 * inv[2][2]);
  // u(a1) con la covarianza de (c1, c2): a1 = c1 − 2 tm c2.
  const uA1 = Math.sqrt(s2 * (inv[1][1] + 4 * tm * tm * inv[2][2] - 4 * tm * inv[1][2]));
  return { x0: a0, v0: a1, a: 2 * a2, ua: 2 * uA2, uv0: uA1, rms: Math.sqrt(ss / n) };
}

function invert3(m: number[][]): number[][] | null {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-18) return null;
  const r = 1 / det;
  return [
    [A * r, -(b * i - c * h) * r, (b * f - c * e) * r],
    [B * r, (a * i - c * g) * r, -(a * f - c * d) * r],
    [C * r, -(a * h - b * g) * r, (a * e - b * d) * r],
  ];
}

/** Velocidades por diferencias centrales de una serie (t, x): [(t_i, (x_{i+1} − x_{i−1})/(t_{i+1} − t_{i−1}))]. */
export function centralVelocities(pts: Array<[number, number]>): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const dt = pts[i + 1][0] - pts[i - 1][0];
    if (dt > 0) out.push([pts[i][0], (pts[i + 1][1] - pts[i - 1][1]) / dt]);
  }
  return out;
}
