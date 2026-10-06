/**
 * Parámetros científicos y de protocolo de la Práctica 5 (todos configurables, §31). Las constantes cinéticas y
 * térmicas están calibradas para reproducir el comportamiento esperado (docs/PRACTICA5.md):
 * - con MnO₂ bien mezclado, la descomposición es apreciable desde ~300 °C y rápida a ~380 °C;
 * - sin catalizador hacen falta ~500 °C;
 * - un primer ciclo de 10 min con calentamiento gradual convierte la mayor parte del KClO₃, no siempre todo;
 * - calentar a fondo desde el inicio dispara la reacción (exotérmica) y el O₂ arrastra sólido.
 */
import type { P5Params } from '../../simulation/stoich-world/types';

export const DEFAULT_P5_PARAMS: P5Params = {
  dtS: 0.05,
  ambientC: 23,
  // Balanza granataria (§6.1)
  capacityG: 610,
  resolutionG: 0.1,
  uncertaintyG: 0.05,
  pointerPeriodS: 1.7,
  pointerDamping: 0.18,
  pointerSpanG: 0.6,
  hotLiftGPerK: 0.0035,
  hotFluctuationGPerK: 0.0012,
  allowedDeltaC: 3,
  constantMassCriterionG: 0.1,
  // Mezcla (§9.2)
  tapGain: 0.16,
  tapLossThreshold: 0.8,
  // Cinética (§11.2): k = A·exp(−Ea/RT), s⁻¹
  catA: 9.7e7,
  catEaJ: 120_000,
  uncatA: 3.8e10,
  uncatEaJ: 200_000,
  catalystSaturation: 0.06,
  reactionHJPerMol: -38_800,
  kMax: 0.012,
  expulsionThreshold: 0.006,
  expulsionRampKs: 3,
  expulsionGain: 0.0008,
  // Térmica del tubo (§12.1)
  glassHeatCapJK: 2.6,
  flameCaptureFrac: 0.025,
  glassAirWK: 0.012,
  glassSampleWK: 0.06,
  sampleHeatCapJGK: 0.85,
  sampleAirWK: 0.0015,
  upperCouplingWK: 0.003,
  rackCouplingWK: 0.006,
  stressGradientK: 0.00002,
  stressRampK: 0.004,
  stressRelax: 0.002,
  unattendedS: 300,
  // Protocolo (§8.2, §10.2, §13.1)
  kclo3MinG: 1.0,
  kclo3MaxG: 2.0,
  mno2MinG: 0.05,
  mno2MaxG: 0.15,
  firstCycleS: 600,
  angleMinDeg: 10,
  angleMaxDeg: 30,
};
