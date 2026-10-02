export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Masa nula por debajo de 1 µg para evitar ruido numérico. */
export const EPS_G = 1e-6;

export const nz = (v: number): number => (Math.abs(v) < EPS_G ? 0 : v);

/**
 * Interpolación lineal en una tabla [x, y] ordenada por x.
 * Fuera de rango se satura al extremo (no se extrapola, §4.4).
 */
export function interpolateTable(table: ReadonlyArray<readonly [number, number]>, x: number): number {
  if (table.length === 0) return 0;
  if (x <= table[0][0]) return table[0][1];
  const last = table[table.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i];
    if (x <= x1) {
      const [x0, y0] = table[i - 1];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return last[1];
}

/** Redondeo para presentación (no se usa en el modelo). */
export const round = (v: number, d = 2): number => {
  const f = 10 ** d;
  return Math.round(v * f) / f;
};

/** Hash corto y estable de un objeto serializable (para `stateHash`). */
export function stableHash(obj: unknown): string {
  const s = JSON.stringify(obj);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
