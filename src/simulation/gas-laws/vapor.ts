/**
 * Presión de vapor del agua (§14.2–14.3). Modo curricular: tabla de la guía (20–26 °C) con interpolación lineal y sin
 * redondear la temperatura antes. Modo avanzado (y fuera de la tabla): ecuación de Antoine (NIST, 1–100 °C).
 */

/** Tabla curricular (°C → mmHg). */
export const VAPOR_TABLE_MMHG: Array<[number, number]> = [
  [20, 17.5],
  [21, 18.7],
  [22, 19.8],
  [23, 21.1],
  [24, 22.4],
  [25, 23.8],
  [26, 25.2],
];

/** Antoine para el agua, P en mmHg y T en °C (A = 8,07131; B = 1730,63; C = 233,426). */
export function antoineWaterMmHg(tC: number): number {
  return 10 ** (8.07131 - 1730.63 / (233.426 + tC));
}

/** Interpolación lineal en la tabla de la guía; fuera de ella, Antoine. */
export function vaporTableMmHg(tC: number): number {
  const t = VAPOR_TABLE_MMHG;
  if (tC < t[0][0] || tC > t[t.length - 1][0]) return antoineWaterMmHg(tC);
  for (let i = 0; i < t.length - 1; i++) {
    const [t0, p0] = t[i];
    const [t1, p1] = t[i + 1];
    if (tC >= t0 && tC <= t1) return p0 + ((p1 - p0) * (tC - t0)) / (t1 - t0);
  }
  return t[t.length - 1][1];
}

export type VaporModel = 'TABLE' | 'ANTOINE';

export const waterVaporMmHg = (tC: number, model: VaporModel = 'TABLE') => (model === 'TABLE' ? vaporTableMmHg(tC) : antoineWaterMmHg(tC));
