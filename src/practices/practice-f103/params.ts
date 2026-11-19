/**
 * Parámetros de F103 (§7). Son PROPUESTAS DE SIMULACIÓN (`hypothetical`) salvo que se indique `verified`; el docente
 * puede cambiar los permitidos (muesca máxima, masa de la esfera, altura del soporte, viento, restitución) y se
 * congelan al crear el intento. Ningún valor configurado se presenta como «medición real» (decisión F103-2).
 */
import type { F103Params } from '../../simulation/f103-world/types';

export const DEFAULT_F103_PARAMS: F103Params = {
  dtS: 0.05,
  subSteps: 10,
  scientificMode: 'REALISTIC',
  g: 9.81,
  airDensity: 1.2,
  dragAlways: false,
  sphereCd: 0.47,
  // Resorte de 2133 N/m con muescas de 1, 2 y 3 cm: la muesca 3 deja la esfera de 20 g a 8,0 m/s sin pérdidas.
  springK: 2133,
  springTrueFactor: 1,
  notchM: [0, 0.01, 0.02, 0.03],
  pistonKg: 0.01,
  springEfficiency: 0.94,
  shotJitter: 0.003,
  standKg: 1.5,
  standFloorMu: 0.05,
  restitution: 0.5,
  bounceKeep: 0.75,
  damageMs: 7,
  fanMs: [0, 1.5, 3],
  ambientSideMs: 1.0,
  protractorResolutionDeg: 0.5,
  protractorOffsetDeg: 1.5,
  levelResolutionDeg: 0.1,
  tapeResolutionCm: 0.1,
  rulerResolutionCm: 0.1,
  screenResolutionCm: 0.1,
  gate: { rates: [1000, 10000, 100000], minSamples: 10 },
  platform: { sizeM: 0.4, gridResolutionCm: 0.1, uncalScale: 1.03, settleS: 1, latencyS: 0, ranges: { short: { maxS: 1, resolutionS: 1e-4 }, long: { maxS: 10, resolutionS: 1e-3 } } },
  // Incertidumbres tipo B (estándar, rectangular de media división salvo el temporizador y la plataforma).
  uB: {
    protractorDeg: 0.5 / Math.sqrt(12), levelDeg: 0.1 / Math.sqrt(12), tapeCm: 0.1 / Math.sqrt(12), rulerCm: 0.1 / Math.sqrt(12), screenCm: 0.3,
    gateS: 1e-5, platformCm: 0.2, clockS: 0.001,
  },
  calibration: {
    launcher01: 'hypothetical', gate01: 'hypothetical', timer01: 'hypothetical', platform01: 'pending', screen01: 'verified', floorTape01: 'verified',
    heightRuler01: 'verified', stand01: 'verified', g: 'hypothetical',
  },
};

/** Variante curricular ideal (decisión F103-4): sin aire, resorte sin pérdidas ni dispersión. */
export function curricularParams(p: F103Params): F103Params {
  return { ...p, scientificMode: 'CURRICULAR', springEfficiency: 1, shotJitter: 0 };
}

/** Rangos permitidos al docente (§7). */
export const F103_TEACHER_RANGES = {
  notch: [1, 3],
  ballG: [5, 30],
  standCm: [0, 100],
  windMs: [0, 3],
  restitution: [0.2, 0.8],
} as const;
