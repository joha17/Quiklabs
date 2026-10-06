/**
 * Escenarios docentes y catálogo de errores simulables de la Práctica 6 (§21). Cada código es un evento del dominio
 * con una consecuencia observable (masa sesgada, temperatura sesgada, pérdida, bloqueo…).
 */
export type P6Scenario = 'ZERO_OFF' | 'UNLEVEL' | 'DRAFT' | 'WET_CYLINDER' | 'WET_TUBE' | 'CRACKED_TUBE' | 'THERMO_OFFSET' | 'POOR_INSULATION' | 'DAMAGED_SEAL';

export const P6_SCENARIOS: P6Scenario[] = ['ZERO_OFF', 'UNLEVEL', 'DRAFT', 'WET_CYLINDER', 'WET_TUBE', 'CRACKED_TUBE', 'THERMO_OFFSET', 'POOR_INSULATION', 'DAMAGED_SEAL'];

export const SIMULATED_ERRORS_P6: Array<{ code: string; section: string }> = [
  // Metrología (§21.1)
  { code: 'ZERO_NOT_ADJUSTED', section: '21.1' },
  { code: 'BALANCE_NOT_SETTLED', section: '21.1' },
  { code: 'READING_UNSTABLE', section: '21.1' },
  { code: 'READING_UNCALIBRATED', section: '21.1' },
  { code: 'READING_TOUCHING', section: '7.4' },
  { code: 'TOUCHING_HOUSING', section: '7.4' },
  { code: 'ZERO_ADJUSTED_WITH_LOAD', section: '7.4' },
  { code: 'BALANCE_UNLEVEL', section: '7.4' },
  { code: 'DRAFT_NEAR_BALANCE', section: '7.4' },
  { code: 'HOT_ON_BALANCE', section: '7.4' },
  { code: 'HOT_WEIGHING', section: '7.4' },
  { code: 'WEIGHED_WET', section: '21.1' },
  { code: 'VESSEL_WET', section: '21.1' },
  { code: 'PARALLAX', section: '8.2' },
  { code: 'BURN', section: '21.1' },
  { code: 'THERMO_OFFSET_FOUND', section: '9.1' },
  // Agua y metal
  { code: 'WATER_SPILLED', section: '6.4' },
  { code: 'OVERFLOW', section: '6.4' },
  { code: 'POUR_SPLASH', section: '6.2' },
  { code: 'MIXED_METALS', section: '12.1' },
  { code: 'WRONG_TUBE', section: '12.1' },
  { code: 'ADDED_ON_PAN', section: '12.1' },
  { code: 'JAR_CONTAMINATED', section: '12.1' },
  { code: 'PIECE_DROPPED', section: '13.3' },
  // Calentamiento (§21.2)
  { code: 'METAL_ABOVE_LEVEL', section: '21.2' },
  { code: 'TUBE_ON_BOTTOM', section: '21.2' },
  { code: 'TUBE_MOUTH_UNDER', section: '21.2' },
  { code: 'WATER_IN_TUBE', section: '21.2' },
  { code: 'BATH_LOW', section: '21.2' },
  { code: 'BEAKER_DRY', section: '12.5' },
  { code: 'VIGOROUS_BOILING', section: '12.5' },
  { code: 'TUBE_CRACKED', section: '12.5' },
  { code: 'TUBE_CRACK_FOUND', section: '12.5' },
  { code: 'CRACKED_TUBE_IN_BATH', section: '12.5' },
  { code: 'SHORT_SOAK', section: '21.2' },
  { code: 'BATH_NOT_MEASURED', section: '21.2' },
  { code: 'HOT_TUBE_HANDLING', section: '22.2' },
  // Transferencia y equilibrio (§21.3)
  { code: 'SLOW_TRANSFER', section: '21.3' },
  { code: 'LID_LEFT_OPEN', section: '21.3' },
  { code: 'PIECE_LOST', section: '21.3' },
  { code: 'PIECE_STUCK', section: '13.3' },
  { code: 'BATH_WATER_POURED', section: '21.3' },
  { code: 'SPLASH', section: '13.4' },
  { code: 'NOT_STIRRED', section: '21.3' },
  { code: 'VIOLENT_STIRRING', section: '21.3' },
  { code: 'PEAK_TOO_EARLY', section: '21.3' },
  { code: 'PEAK_TOO_LATE', section: '21.3' },
  { code: 'BULB_NOT_IMMERSED', section: '9.3' },
  { code: 'THERMO_TOUCHING', section: '21.3' },
  { code: 'NO_WATER_IN_CUP', section: '13.1' },
  // Bomba (§21.5)
  { code: 'BOMB_NO_PROFILE', section: '21.5' },
  { code: 'BOMB_SEAL_DAMAGED', section: '21.5' },
  { code: 'BOMB_LEAK_TEST_FAILED', section: '21.5' },
  { code: 'BOMB_WIRE_NO_CONTACT', section: '21.5' },
  { code: 'BOMB_WIRE_SHORT', section: '21.5' },
  { code: 'BOMB_OVERPRESSURE', section: '21.5' },
  { code: 'BOMB_INTERLOCK', section: '21.5' },
  { code: 'BOMB_BUCKET_VOLUME', section: '21.5' },
  { code: 'BOMB_INCOMPLETE', section: '21.5' },
  { code: 'BOMB_OPEN_PRESSURIZED', section: '21.5' },
  { code: 'BOMB_SHORT_CIRCUIT', section: '21.5' },
  { code: 'BOMB_IGNITION_FAILED', section: '21.5' },
];
