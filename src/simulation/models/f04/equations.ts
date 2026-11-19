/**
 * Ecuaciones de F04 (§3): segunda ley para el sistema carro + masa colgante, polea con inercia y roce, tensiones de
 * cada tramo, rapidez en las fotopuertas y aceleración cinemática, y ajuste lineal por mínimos cuadrados.
 */
const finite = (...v: number[]) => v.every((x) => Number.isFinite(x));

/** a = m_h g / (m_c + m_h) (ideal: sin roce, polea sin masa, carril nivelado). */
export function idealAccel(mc: number, mh: number, g: number): number {
  if (!finite(mc, mh, g) || mc + mh <= 0) return NaN;
  return (mh * g) / (mc + mh);
}

/** T = m_c a (ideal). */
export const idealTension = (mc: number, mh: number, g: number) => mc * idealAccel(mc, mh, g);

/** Masa efectiva con la inercia de la polea: m_c + m_h + I/r². */
export function effectiveMass(mc: number, mh: number, I: number, r: number): number {
  if (!finite(mc, mh, I, r) || r <= 0) return NaN;
  return mc + mh + I / (r * r);
}

/**
 * Aceleración con polea real, roce del carril f (N), torque de roce de la polea τ (N·m) e inclinación θ (°, + hacia la
 * polea): a = (m_h g + m_c g sen θ − f − τ/r) / (m_c + m_h + I/r²); 0 si no alcanza a vencer el roce.
 */
export function realAccel(mc: number, mh: number, g: number, I: number, r: number, f = 0, tau = 0, thetaDeg = 0): number {
  const M = effectiveMass(mc, mh, I, r);
  if (!finite(M, f, tau, thetaDeg)) return NaN;
  const drive = mh * g + mc * g * Math.sin((thetaDeg * Math.PI) / 180) - f - tau / r;
  return drive > 0 ? drive / M : 0;
}

/** Tensiones de cada tramo: T₂ = m_h (g − a) del lado colgante; T₁ = T₂ − (I/r²) a − τ/r del lado del carro. */
export function tensions(mh: number, g: number, a: number, I: number, r: number, tau = 0): { T1: number; T2: number } {
  if (!finite(mh, g, a, I, r, tau) || r <= 0) return { T1: NaN, T2: NaN };
  const T2 = mh * (g - a);
  return { T1: T2 - (I / (r * r)) * a - tau / r, T2 };
}

/** Rapidez media en una fotopuerta: ancho de la bandera / tiempo de bloqueo. */
export function gateSpeed(flagW: number, dt: number): number {
  if (!finite(flagW, dt) || dt <= 0) return NaN;
  return flagW / dt;
}

/** a = (v₂² − v₁²) / (2 d) entre dos fotopuertas separadas d. */
export function kinematicAccel(v1: number, v2: number, d: number): number {
  if (!finite(v1, v2, d) || d <= 0) return NaN;
  return (v2 * v2 - v1 * v1) / (2 * d);
}

/** Recta de mínimos cuadrados y = m x + b. */
export function linFit(pts: Array<[number, number]>): { m: number; b: number } {
  const p = pts.filter(([x, y]) => finite(x, y));
  if (p.length < 2) return { m: NaN, b: NaN };
  const n = p.length;
  const sx = p.reduce((s, [x]) => s + x, 0);
  const sy = p.reduce((s, [, y]) => s + y, 0);
  const sxx = p.reduce((s, [x]) => s + x * x, 0);
  const sxy = p.reduce((s, [x, y]) => s + x * y, 0);
  const d = n * sxx - sx * sx;
  if (Math.abs(d) < 1e-15) return { m: NaN, b: NaN };
  const m = (n * sxy - sx * sy) / d;
  return { m, b: (sy - m * sx) / n };
}

/** Inclinación (°) a partir de la aceleración propia en reposo del acelerómetro: a = −g sen θ. */
export function tiltFromRest(aRest: number, g: number): number {
  if (!finite(aRest, g) || g <= 0 || Math.abs(aRest) > g) return NaN;
  return (-Math.asin(aRest / g) * 180) / Math.PI;
}
