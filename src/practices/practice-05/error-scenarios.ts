/**
 * Escenarios docentes y catálogo de errores simulables de la Práctica 5 (§18). Cada código es un evento del dominio
 * con una consecuencia observable (lectura sesgada, masa perdida, bloqueo, quemadura simulada…).
 */
export type P5Scenario = 'ZERO_OFF' | 'UNLEVEL' | 'DRAFT' | 'RIDERS_NOT_ZERO' | 'WET_TUBE' | 'CRACKED_TUBE' | 'GREASY_SPATULA' | 'CRACKED_HOSE';

export const P5_SCENARIOS: P5Scenario[] = ['ZERO_OFF', 'UNLEVEL', 'DRAFT', 'RIDERS_NOT_ZERO', 'WET_TUBE', 'CRACKED_TUBE', 'GREASY_SPATULA', 'CRACKED_HOSE'];

/** Código de evento → sección de la especificación. */
export const SIMULATED_ERRORS_P5: Array<{ code: string; section: string }> = [
  // Balanza (§18.1)
  { code: 'ZERO_NOT_ADJUSTED', section: '18.1' },
  { code: 'BALANCE_NOT_SETTLED', section: '18.1' },
  { code: 'READING_UNSTABLE', section: '18.1' },
  { code: 'READING_UNCALIBRATED', section: '18.1' },
  { code: 'ZERO_ADJUSTED_WITH_LOAD', section: '18.1' },
  { code: 'BALANCE_UNLEVEL', section: '18.1' },
  { code: 'DRAFT_NEAR_BALANCE', section: '18.1' },
  { code: 'POWDER_ON_PAN', section: '18.1' },
  { code: 'HOT_ON_BALANCE', section: '18.1' },
  { code: 'HOT_WEIGHING', section: '18.1' },
  { code: 'INCOMPATIBLE_ON_PAN', section: '5.1' },
  // Preparación (§18.2)
  { code: 'TUBE_WET', section: '18.2' },
  { code: 'TUBE_CRACK_FOUND', section: '18.2' },
  { code: 'SPATULA_DIRTY', section: '18.2' },
  { code: 'DIRTY_SPATULA_IN_OXIDANT', section: '17.3' },
  { code: 'WRONG_SPATULA', section: '18.2' },
  { code: 'RETURNED_TO_BOTTLE', section: '8.3' },
  { code: 'SOLID_SPILLED', section: '8.3' },
  { code: 'SOLID_ON_PAPER', section: '8.3' },
  { code: 'ORDER_KCLO3_FIRST', section: '18.2' },
  { code: 'MNO2_AFTER_KCLO3', section: '18.2' },
  { code: 'POORLY_MIXED', section: '18.2' },
  { code: 'GRINDING_BLOCKED', section: '18.2' },
  { code: 'VIOLENT_TAP', section: '18.2' },
  { code: 'MIXTURE_CONTAMINATED', section: '19.5' },
  // Montaje y calentamiento (§18.3)
  { code: 'MOUTH_TOWARD_PERSON', section: '18.3' },
  { code: 'TUBE_STOPPERED', section: '18.3' },
  { code: 'NUT_LOOSE', section: '18.3' },
  { code: 'CLAMP_LOOSE', section: '18.3' },
  { code: 'CLAMP_TOO_TIGHT', section: '18.3' },
  { code: 'TUBE_TOO_STEEP', section: '10.2' },
  { code: 'TUBE_TOO_FLAT', section: '10.2' },
  { code: 'HEATING_TOO_FAST', section: '18.3' },
  { code: 'SOLID_EXPELLED', section: '12.5' },
  { code: 'FIXED_HOT_SPOT', section: '18.3' },
  { code: 'FIRST_CYCLE_SHORT', section: '18.3' },
  { code: 'UNATTENDED', section: '18.3' },
  { code: 'SHIELD_MISSING', section: '19.1' },
  { code: 'TUBE_CRACKED', section: '10.3' },
  { code: 'TUBE_FELL', section: '18.3' },
  { code: 'KCLO3_OVER_LIMIT', section: '8.2' },
  // Enfriamiento y pesada (§18.4)
  { code: 'WATER_ON_HOT_TUBE', section: '18.4' },
  { code: 'BURN_HOT_TUBE', section: '18.4' },
  { code: 'HOT_TUBE_HANDLING', section: '18.4' },
  { code: 'ADJUST_HOT', section: '18.3' },
];
