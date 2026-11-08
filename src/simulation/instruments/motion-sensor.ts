/**
 * Sensor de movimiento ultrasónico, reutilizable (F102 §4 E, §6). Mide el tiempo de ida y vuelta del eco hasta la
 * primera superficie dentro de su cono y lo convierte en distancia con la velocidad del sonido que tiene configurada:
 *
 * - Sin calibrar contra una distancia patrón, la escala sale con el factor de fábrica (F102-E27).
 * - Montado inclinado `α`, el eco recorre la oblicua: d / cos α (F102-E26).
 * - Fuera de su rango (`near` / `far`) la lectura satura en el límite (F102-E22); por debajo del mínimo no hay eco.
 * - Muestrea por reloj físico a 10 o 50 Hz (F102-E24), con ruido gaussiano serializable y cuantización de 1 mm.
 */

export interface MotionSensorParams {
  minM: number;
  nearMaxM: number;
  farMaxM: number;
  noiseM: number;
  resolutionMm: number;
  /** Semiángulo del cono (°). */
  coneDeg: number;
  /** Factor de escala sin calibrar (velocidad del sonido de fábrica frente a la de la sala). */
  uncalScale: number;
}

export interface MotionCapture {
  startedS: number;
  nextS: number;
  samples: Array<[number, number]>;
  clipped: boolean;
  occluded: boolean;
  lost: number;
  configAtStart: number;
  configChanged: boolean;
  /** Cuerpo que cayó durante la captura y si lo hizo dando tumbos o con geometría mezclada. */
  body: string | null;
  tumbling: boolean;
  mixed: boolean;
  filters: number;
  movingSamples: number;
}

export interface MotionSensorState {
  connected: boolean;
  range: 'near' | 'far';
  rateHz: 10 | 50;
  calibrated: boolean;
  scale: number;
  /** Inclinación del sensor respecto de la vertical (°). */
  aimDeg: number;
  capture: MotionCapture | null;
}

export function newMotionSensor(p: MotionSensorParams): MotionSensorState {
  return { connected: false, range: 'near', rateHz: 10, calibrated: false, scale: p.uncalScale, aimDeg: 4, capture: null };
}

export const motionMaxM = (s: MotionSensorState, p: MotionSensorParams) => (s.range === 'near' ? p.nearMaxM : p.farMaxM);

/**
 * Indicación (mm) para una distancia vertical real `trueM`: escala, oblicua, saturación y ruido. `null` si el eco
 * cae por debajo del mínimo (sin lectura).
 */
export function motionIndication(trueM: number, s: MotionSensorState, p: MotionSensorParams, gauss: number): { mm: number | null; clipped: boolean } {
  const slant = trueM / Math.cos((s.aimDeg * Math.PI) / 180);
  const d = slant * s.scale + gauss * p.noiseM;
  if (d < p.minM) return { mm: null, clipped: false };
  const max = motionMaxM(s, p);
  const clipped = d > max;
  const v = Math.min(d, max) * 1000;
  return { mm: Math.round(v / p.resolutionMm) * p.resolutionMm, clipped };
}
