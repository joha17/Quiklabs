/**
 * Sensor de fuerza y acelerómetro de carro, reutilizables (F04 §4 C, §6). La indicación deriva de la fuerza (o la
 * aceleración propia) verdadera a lo largo del eje del sensor:
 *
 * - Proyección: un sensor montado a un ángulo α de la línea de la fuerza mide F cos α (F04-E26; a ≥ 60° casi nada, E07).
 * - Pendiente de calibración (`scale`, 1 calibrado), corrimiento de origen (`offset`, 0 tras el cero) y ruido gaussiano.
 * - Rango: fuera de ±rango la señal queda recortada (`clipped`) y se cuantiza a la resolución del rango elegido.
 * - Convención de signo cruda: tracción +, compresión −; la interfaz puede invertir el eje de proyección.
 */

export interface ForceSensorParams {
  ranges: number[];
  resolutions: number[];
  /** Pendiente sin calibrar (factor), corrimiento sin cero (N, máximo) y ruido (N, desviación). */
  uncalScale: number;
  offsetN: number;
  noiseN: number;
}

export interface SensorReadout {
  value: number;
  clipped: boolean;
}

const quant = (x: number, res: number) => {
  const dec = Math.max(0, Math.ceil(-Math.log10(res) - 1e-9));
  return Number((Math.round(x / res) * res).toFixed(dec));
};

/** Indicación de un sensor de fuerza para una fuerza verdadera `f` (N, tracción +). */
export function forceIndication(f: number, s: { offset: number; scale: number; angleDeg: number; rangeIdx: number; axisSign?: number }, p: ForceSensorParams, noise = 0): SensorReadout {
  const range = p.ranges[s.rangeIdx] ?? p.ranges[1];
  const res = p.resolutions[s.rangeIdx] ?? p.resolutions[1];
  const raw = f * Math.cos((s.angleDeg * Math.PI) / 180) * s.scale + s.offset + noise * p.noiseN;
  const clipped = Math.abs(raw) > range;
  const v = Math.max(-range, Math.min(range, raw)) * (s.axisSign ?? 1);
  return { value: quant(v, res), clipped };
}

/** Indicación del acelerómetro del carro: aceleración propia a lo largo del carril (m/s²). */
export function accelIndication(aProper: number, offset: number, range: number, res: number, noise: number): SensorReadout {
  const raw = aProper + offset + noise;
  const clipped = Math.abs(raw) > range;
  return { value: quant(Math.max(-range, Math.min(range, raw)), res), clipped };
}

export { quant as quantizeReading };
