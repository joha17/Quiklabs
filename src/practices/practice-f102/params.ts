/**
 * Parámetros de F102 (§7). Son PROPUESTAS DE SIMULACIÓN (`hypothetical`) salvo que se indique `verified`; el docente
 * puede cambiar los permitidos (masa del carro, masa colgante, ángulo, resistencia del carro, altura de la torre) y se
 * congelan al crear el intento. Ningún valor configurado se presenta como «medición real» (decisión F102-2).
 */
import type { F102Params } from '../../simulation/f102-world/types';

export const DEFAULT_F102_PARAMS: F102Params = {
  dtS: 0.05,
  subSteps: 10,
  scientificMode: 'REALISTIC',
  g: 9.81,
  airDensity: 1.2,
  // Carro de 0,25 kg (rango 0,15–0,80 kg con barras de 0,25 kg).
  cartMassKg: 0.25,
  barMassKg: 0.25,
  // Resistencia del carro 0,02 N·s/m (rango 0–0,08) y rodadura 0,004 N.
  cartDragNsPerM: 0.02,
  rollingN: 0.004,
  // Polea de plástico: I/r² ≈ 2 g, rozamiento en el eje 0,002 N.
  pulleyEqKg: 0.002,
  pulleyFrictionN: 0.002,
  // Lanzador de émbolo 600 N/m (muescas de 1, 2 y 3 cm → 0,49 a 1,47 m/s con el carro solo).
  launcherKNPerM: 600,
  endStopRestitution: 0.35,
  flagBendMs: 0.9,
  flagWidthM: 0.02,
  // El cordel deja la masa unos 10 cm bajo la polea con el carro en s = 0,30 m; el suelo está 85 cm bajo el eje.
  stringLengthM: 1.385,
  floorDepthM: 0.85,
  tapeDragN: 0.01,
  tapeSlackDragN: 0.06,
  tapeRateHz: 50,
  rulerResolutionCm: 0.1,
  towerScaleResolutionCm: 0.1,
  inclinometerResolutionDeg: 0.1,
  inclinometerOffsetDeg: 0.4,
  // Tornillo del pie M6 (paso 1 mm); los pies están a 1,40 m.
  footPitchMm: 1,
  feetSpanM: 1.4,
  gateTimer: { resolutionS: 0.0001, jitterS: 0, missYawDeg: 8 },
  motion: { minM: 0.15, nearMaxM: 1.0, farMaxM: 6, noiseM: 0.001, resolutionMm: 1, coneDeg: 10, uncalScale: 1.03 },
  magnetDelayS: 0.002,
  sphereCd: 0.47,
  filterCd: 1.4,
  filterMassKg: 0.0011,
  filterRadiusM: 0.06,
  windMs: 0,
  // Incertidumbres tipo B (estándar, rectangular de media división salvo los cronómetros).
  uB: {
    rulerCm: 0.1 / Math.sqrt(12), gateS: 0.0001 / Math.sqrt(3), tapeCm: 0.1 / Math.sqrt(12), towerCm: 0.1 / Math.sqrt(12),
    fallS: 0.0005, motionMm: 1 / Math.sqrt(12), angleDeg: 0.1 / Math.sqrt(12),
  },
  calibration: {
    track01: 'verified', gateTimer01: 'hypothetical', tapeTimer01: 'hypothetical', tower01: 'verified', photocell01: 'hypothetical',
    motionSensor01: 'pending', inclinometer01: 'hypothetical', pulley01: 'hypothetical', g: 'hypothetical',
  },
};

/** Variante curricular ideal (decisión F102-4): sin rozamiento, polea sin inercia, cinta sin arrastre, sin aire en la esfera. */
export function curricularParams(p: F102Params): F102Params {
  return { ...p, scientificMode: 'CURRICULAR', cartDragNsPerM: 0, rollingN: 0, pulleyEqKg: 0, pulleyFrictionN: 0, tapeDragN: 0, magnetDelayS: 0 };
}

/** Rangos permitidos al docente (§7). */
export const F102_TEACHER_RANGES = {
  cartMassKg: [0.15, 0.8],
  hangMassKg: [0.01, 0.12],
  angleDeg: [-5, 5],
  cartDragNsPerM: [0, 0.08],
  towerHeightM: [0.5, 1.6],
} as const;
