/**
 * Ecuaciones de F101 (§3) en SI, puras y con dominio explícito: lo que está fuera de dominio devuelve NaN, nunca un
 * número engañoso. Los ángulos de la mesa de fuerzas se miden en GRADOS desde +x en sentido antihorario (vista
 * superior); las funciones trigonométricas convierten explícitamente (no se mezclan grados y radianes).
 */

export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 extends Vec2 {
  z: number;
}

const ok = (...v: number[]) => v.every(Number.isFinite);

export const DEG = Math.PI / 180;
export const degToRad = (deg: number) => deg * DEG;
export const radToDeg = (rad: number) => rad / DEG;

/** Peso de una masa colgante: F = m·g (m en kg, g en m/s², F en N). */
export function weightN(massKg: number, g: number): number {
  if (!ok(massKg, g) || massKg < 0 || g <= 0) return NaN;
  return massKg * g;
}

/** Componentes de un vector de módulo F y ángulo θ (grados desde +x, antihorario). */
export function components(F: number, thetaDeg: number): Vec2 {
  if (!ok(F, thetaDeg)) return { x: NaN, y: NaN };
  return { x: F * Math.cos(degToRad(thetaDeg)), y: F * Math.sin(degToRad(thetaDeg)) };
}

export const add = (...vs: Vec2[]): Vec2 => vs.reduce((s, v) => ({ x: s.x + v.x, y: s.y + v.y }), { x: 0, y: 0 });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k });
export const norm = (a: Vec2): number => Math.hypot(a.x, a.y);

/** Ángulo (grados en [0, 360)) de un vector; NaN para el vector nulo. */
export function angleDeg(a: Vec2): number {
  if (!ok(a.x, a.y) || (a.x === 0 && a.y === 0)) return NaN;
  const d = radToDeg(Math.atan2(a.y, a.x));
  return d < 0 ? d + 360 : d;
}

/** Vector unitario (NaN para el nulo). */
export function unit(a: Vec2): Vec2 {
  const n = norm(a);
  return n > 0 ? { x: a.x / n, y: a.y / n } : { x: NaN, y: NaN };
}

/** Producto escalar A·B (en 3D; z = 0 para la mesa). */
export function dot(a: Vec2 | Vec3, b: Vec2 | Vec3): number {
  return a.x * b.x + a.y * b.y + ('z' in a && 'z' in b ? a.z * b.z : 0);
}

/** Producto vectorial A×B por determinante en la base (î, ĵ, k̂), regla de la mano derecha. */
export function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

/** Componente z del momento τ = r × F de una fuerza del plano aplicada en r (N·m). */
export const torqueZ = (r: Vec2, F: Vec2) => r.x * F.y - r.y * F.x;

/** Diferencia angular más corta a − b, en (−180, 180] grados. */
export function angleDiffDeg(a: number, b: number): number {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/** Volumen de un cilindro V = π d² h / 4 (mismas unidades al cubo). */
export function cylinderVolume(d: number, h: number): number {
  if (!ok(d, h) || d <= 0 || h <= 0) return NaN;
  return (Math.PI * d * d * h) / 4;
}

/** Volumen de una esfera V = π d³ / 6. */
export function sphereVolume(d: number): number {
  if (!ok(d) || d <= 0) return NaN;
  return (Math.PI * d ** 3) / 6;
}

/** Densidad ρ = m / V (NaN si V ≤ 0 o m < 0). */
export function density(m: number, V: number): number {
  if (!ok(m, V) || m < 0 || V <= 0) return NaN;
  return m / V;
}

/** Error relativo en porcentaje, con signo: 100 (x − ref)/ref. */
export function relErrorPct(x: number, ref: number): number {
  if (!ok(x, ref) || ref === 0) return NaN;
  return (100 * (x - ref)) / Math.abs(ref);
}

/** Conversiones explícitas (la libreta conserva la unidad del instrumento y su paso a SI). */
export const mmToM = (mm: number) => mm / 1000;
export const gToKg = (g: number) => g / 1000;
export const mlToM3 = (ml: number) => ml * 1e-6;
export const mm3ToCm3 = (mm3: number) => mm3 / 1000;
