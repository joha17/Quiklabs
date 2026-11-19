/**
 * Ecuaciones de F103 (§3): proyectil con aceleración constante (sin aire) lanzado desde una altura y₀ con rapidez v₀ y
 * elevación θ. Funciones puras en SI con el ángulo en grados y dominio explícito: fuera de dominio devuelven NaN.
 */
const finite = (...v: number[]) => v.every((x) => Number.isFinite(x));
export const DEG = Math.PI / 180;

/** Componentes de la velocidad inicial (m/s). */
export function components(v0: number, thetaDeg: number): { vx: number; vy: number } {
  if (!finite(v0, thetaDeg)) return { vx: NaN, vy: NaN };
  return { vx: v0 * Math.cos(thetaDeg * DEG), vy: v0 * Math.sin(thetaDeg * DEG) };
}

/**
 * Tiempo de vuelo hasta la cota de llegada: y(t) = y₀ + v₀ sen θ t − ½ g t² = yEnd, con la raíz positiva mayor.
 * `drop` = y₀ − y_llegada (positivo si se llega más abajo). NaN si la trayectoria no alcanza esa cota.
 */
export function flightTime(v0: number, thetaDeg: number, drop: number, g: number): number {
  if (!finite(v0, thetaDeg, drop, g) || v0 < 0 || g <= 0) return NaN;
  const vy = v0 * Math.sin(thetaDeg * DEG);
  const disc = vy * vy + 2 * g * drop;
  if (disc < 0) return NaN;
  const t = (vy + Math.sqrt(disc)) / g;
  return t > 0 ? t : NaN;
}

/** Alcance horizontal hasta la cota de llegada: R = v₀ cos θ · t_vuelo (m). */
export function rangeWithDrop(v0: number, thetaDeg: number, drop: number, g: number): number {
  const t = flightTime(v0, thetaDeg, drop, g);
  return Number.isFinite(t) ? v0 * Math.cos(thetaDeg * DEG) * t : NaN;
}

/** Alcance a nivel (y₀ = y_llegada): R = v₀² sen 2θ / g. */
export const levelRange = (v0: number, thetaDeg: number, g: number) => (finite(v0, thetaDeg, g) && g > 0 ? (v0 * v0 * Math.sin(2 * thetaDeg * DEG)) / g : NaN);
/** Tiempo de vuelo a nivel: T = 2 v₀ sen θ / g. */
export const levelTime = (v0: number, thetaDeg: number, g: number) => (finite(v0, thetaDeg, g) && g > 0 ? (2 * v0 * Math.sin(thetaDeg * DEG)) / g : NaN);
/** Altura máxima sobre la boca: H = (v₀ sen θ)² / (2 g). */
export const maxHeight = (v0: number, thetaDeg: number, g: number) => (finite(v0, thetaDeg, g) && g > 0 ? (v0 * Math.sin(thetaDeg * DEG)) ** 2 / (2 * g) : NaN);
/** Instante del vértice: t = v₀ sen θ / g (no es el tiempo de vuelo, F103-E12). */
export const peakTime = (v0: number, thetaDeg: number, g: number) => (finite(v0, thetaDeg, g) && g > 0 ? (v0 * Math.sin(thetaDeg * DEG)) / g : NaN);

/** Altura de la trayectoria sobre la boca a la distancia horizontal x: y = x tan θ − g x² / (2 v₀² cos² θ). */
export function trajectoryY(v0: number, thetaDeg: number, x: number, g: number): number {
  if (!finite(v0, thetaDeg, x, g) || v0 <= 0) return NaN;
  const c = Math.cos(thetaDeg * DEG);
  if (Math.abs(c) < 1e-9) return NaN;
  return x * Math.tan(thetaDeg * DEG) - (g * x * x) / (2 * v0 * v0 * c * c);
}

/** Velocidad vertical en t: v_y = v₀ sen θ − g t. */
export const vyAt = (v0: number, thetaDeg: number, t: number, g: number) => (finite(v0, thetaDeg, t, g) ? v0 * Math.sin(thetaDeg * DEG) - g * t : NaN);

/** Rapidez de salida desde la fotopuerta: v₀ = d / Δt (diámetro de la esfera / tiempo de bloqueo). */
export const gateSpeed = (d: number, dt: number) => (finite(d, dt) && d > 0 && dt > 0 ? d / dt : NaN);

/** v₀ que explica un alcance R con caída `drop` (inversión numérica por bisección; NaN si no hay solución). */
export function v0FromRange(R: number, thetaDeg: number, drop: number, g: number): number {
  if (!finite(R, thetaDeg, drop, g) || R <= 0 || g <= 0) return NaN;
  let lo = 0.01;
  let hi = 100;
  if (!(rangeWithDrop(hi, thetaDeg, drop, g) > R)) return NaN;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const r = rangeWithDrop(mid, thetaDeg, drop, g);
    if (!Number.isFinite(r) || r < R) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Error relativo porcentual respecto de una referencia. */
export const relErrorPct = (x: number, ref: number) => (finite(x, ref) && ref !== 0 ? (100 * (x - ref)) / Math.abs(ref) : NaN);

/**
 * Ajuste parabólico de la trayectoria y(x) = c₀ + c₁ x + c₂ x² por mínimos cuadrados (n ≥ 3). Devuelve los
 * coeficientes, la elevación θ = atan(c₁) y la rapidez v₀ = √(−g (1 + c₁²) / (2 c₂)) que implican.
 */
export function trajectoryFit(pts: Array<[number, number]>, g: number): { c0: number; c1: number; c2: number; thetaDeg: number; v0: number; rms: number } {
  const nan = { c0: NaN, c1: NaN, c2: NaN, thetaDeg: NaN, v0: NaN, rms: NaN };
  const n = pts.length;
  if (n < 3 || !pts.every(([x, y]) => finite(x, y))) return nan;
  const xm = pts.reduce((s, p) => s + p[0], 0) / n;
  const S = Array.from({ length: 5 }, (_, k) => pts.reduce((s, [x]) => s + (x - xm) ** k, 0));
  const B = Array.from({ length: 3 }, (_, k) => pts.reduce((s, [x, y]) => s + y * (x - xm) ** k, 0));
  const inv = invert3([[S[0], S[1], S[2]], [S[1], S[2], S[3]], [S[2], S[3], S[4]]]);
  if (!inv) return nan;
  const c = inv.map((row) => row[0] * B[0] + row[1] * B[1] + row[2] * B[2]);
  const c2 = c[2];
  const c1 = c[1] - 2 * c[2] * xm;
  const c0 = c[0] - c[1] * xm + c[2] * xm * xm;
  const ss = pts.reduce((s, [x, y]) => s + (y - (c0 + c1 * x + c2 * x * x)) ** 2, 0);
  const v0 = c2 < 0 ? Math.sqrt((-g * (1 + c1 * c1)) / (2 * c2)) : NaN;
  return { c0, c1, c2, thetaDeg: Math.atan(c1) / DEG, v0, rms: Math.sqrt(ss / n) };
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
