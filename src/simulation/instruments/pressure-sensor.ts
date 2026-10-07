/**
 * Sensores de presión (§21). La configuración está en datos (perfiles), no en la interfaz. El GPS-BTA mide presión
 * ABSOLUTA: no se le suma la atmosférica. El volumen interno depende del modelo (no se codifica 0,8 mL para todos).
 * Fuentes: manual Vernier GPS-BTA (rango 0–210 kPa, ±4 kPa, ≈ 0,8 mL internos, sin daño hasta 4 atm).
 */

export type SensorModel = 'GPS_BTA' | 'GDX_GP' | 'GAUGE_DEMO';

export interface SensorProfile {
  model: SensorModel;
  /** 'ABSOLUTE' o 'GAUGE' (manométrica: mide P − P_atm). */
  kind: 'ABSOLUTE' | 'GAUGE';
  rangeKPa: [number, number];
  accuracyKPa: number;
  resolutionKPa: number;
  internalVolumeMl: number;
  /** Presión que soporta sin daño permanente (kPa absolutos). */
  maxTolerableKPa: number;
  responseTimeS: number;
  /** Nota visible sobre el origen del dato. */
  note: string;
}

export const SENSOR_PROFILES: Record<SensorModel, SensorProfile> = {
  GPS_BTA: {
    model: 'GPS_BTA', kind: 'ABSOLUTE', rangeKPa: [0, 210], accuracyKPa: 4, resolutionKPa: 0.05, internalVolumeMl: 0.8, maxTolerableKPa: 405,
    responseTimeS: 0.3, note: 'Vernier GPS-BTA: presión absoluta, 0–210 kPa, ±4 kPa, ≈ 0,8 mL de volumen interno.',
  },
  GDX_GP: {
    model: 'GDX_GP', kind: 'ABSOLUTE', rangeKPa: [0, 400], accuracyKPa: 1, resolutionKPa: 0.01, internalVolumeMl: 0.6, maxTolerableKPa: 600,
    responseTimeS: 0.2, note: 'Perfil genérico de sensor absoluto de mayor rango (volumen interno aproximado configurable).',
  },
  GAUGE_DEMO: {
    model: 'GAUGE_DEMO', kind: 'GAUGE', rangeKPa: [-100, 150], accuracyKPa: 1, resolutionKPa: 0.05, internalVolumeMl: 0.8, maxTolerableKPa: 350,
    responseTimeS: 0.3, note: 'Sensor manométrico de demostración: mide P − P_atm (hay que sumar la atmosférica).',
  },
};

export interface PressureSensorState {
  model: SensorModel;
  /** Presión real en la cámara (kPa absolutos). */
  absolutePressureKPa: number;
  /** Lo que muestra el instrumento (en su escala: absoluta o manométrica). */
  displayedPressureKPa: number;
  offsetKPa: number;
  scale: number;
  responseTimeS: number;
  internalVolumeMl: number;
  /** Líquido que llegó al elemento sensible (0–1): bloquea la medición. */
  liquidIngress: number;
  overload: boolean;
  damage: boolean;
  connected: boolean;
}

export function newSensor(model: SensorModel, offsetKPa: number, scale = 1, internalVolumeMl?: number): PressureSensorState {
  const p = SENSOR_PROFILES[model];
  return {
    model, absolutePressureKPa: 101.325, displayedPressureKPa: p.kind === 'GAUGE' ? 0 : 101.325, offsetKPa, scale,
    responseTimeS: p.responseTimeS, internalVolumeMl: internalVolumeMl ?? p.internalVolumeMl, liquidIngress: 0, overload: false, damage: false, connected: false,
  };
}

/** Un paso del sensor: respuesta de primer orden, sobrecarga y daño (solo si el modelo avanzado lo permite). */
export function stepSensor(s: PressureSensorState, realKPa: number, atmKPa: number, dt: number, allowDamage: boolean) {
  const p = SENSOR_PROFILES[s.model];
  s.absolutePressureKPa = realKPa;
  const measured = (p.kind === 'GAUGE' ? realKPa - atmKPa : realKPa) * s.scale + s.offsetKPa;
  s.displayedPressureKPa += (measured - s.displayedPressureKPa) * Math.min(1, dt / s.responseTimeS);
  s.overload = realKPa > p.rangeKPa[1] + (p.kind === 'GAUGE' ? atmKPa : 0) || realKPa < (p.kind === 'GAUGE' ? atmKPa + p.rangeKPa[0] : p.rangeKPa[0]);
  if (allowDamage && realKPa > p.maxTolerableKPa) s.damage = true;
}

/** Lectura visible: saturada al rango y redondeada a la resolución; NaN si el sensor no puede medir. */
export function sensorReading(s: PressureSensorState): number {
  const p = SENSOR_PROFILES[s.model];
  if (s.damage || s.liquidIngress > 0.05) return NaN;
  const v = Math.max(p.rangeKPa[0], Math.min(p.rangeKPa[1], s.displayedPressureKPa));
  return Math.round(v / p.resolutionKPa) * p.resolutionKPa;
}
