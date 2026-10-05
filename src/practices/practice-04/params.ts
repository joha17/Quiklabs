/**
 * Constantes del modelo de la Práctica 4 (§7, §12.4, §13.5, §14.4, §20). Todas configurables por el docente;
 * son de calibración educativa, no mediciones (ver docs/PRACTICA4.md).
 */
import type { P4Params } from '../../simulation/reaction-world/types';

export const DEFAULT_P4_PARAMS: P4Params = {
  dtS: 0.05,
  ambientC: 23,
  dropMl: 0.05,
  phenolDropMl: 0.05,
  holdupMl: { CYL10: 0.06, CYL25: 0.12, BEAKER100: 0.25, TUBE: 0.05, CAPSULE: 0.1, DROPPER: 0.02, BOTTLE: 0.5, DROPPER_BOTTLE: 0.3 },
  mixBase: 0.035,
  mixStir: 2.4,
  entrainment: 0.6,
  // Clavo lijado en CuSO₄ 0,25 M: ≈ 30–45 % del Cu²⁺ en 10 min; oxidado, bastante menos.
  kRedoxFe: 1.9e-6,
  kRedoxAl: 1.6e-6,
  cuCoatRefMgCm2: 4,
  oxideDissolveTauS: 1500,
  mgIgnitionC: 650,
  mgBurnCmS: 0.8,
  mgNitrideFrac: 0,
  oxygenAvailability: 1,
  kHydration: 0.006,
  ethanolSafeCm: 30,
  redoxObserveS: 600,
  waste: { allowNeutralDrain: false },
  aluminumEnabled: false,
  excessBaseDemo: false,
  feComparison: false,
  naohSingle: null,
};
