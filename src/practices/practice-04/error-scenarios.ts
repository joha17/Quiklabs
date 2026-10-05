/**
 * Escenarios de error configurables por el docente (§17, §20) y catálogo de errores simulables con consecuencia
 * observable (§29-13: al menos 25). El estudiante detecta los escenarios con las mismas herramientas que en el
 * laboratorio (inspeccionar, observar, medir).
 */
export type P4Scenario = 'WET_BEAKER' | 'CONTAMINATED_DROPPER' | 'RUSTY_NAIL' | 'DIRTY_TUBE' | 'CRACKED_HOSE';

export const P4_SCENARIOS: P4Scenario[] = ['WET_BEAKER', 'CONTAMINATED_DROPPER', 'RUSTY_NAIL', 'DIRTY_TUBE', 'CRACKED_HOSE'];

/** Código de evento del dominio → sección de la especificación. */
export const SIMULATED_ERRORS_P4: Array<{ code: string; section: string }> = [
  { code: 'VESSEL_WET', section: '8.7' },
  { code: 'VESSEL_DIRTY', section: '17' },
  { code: 'POUR_SPILLED', section: '17' },
  { code: 'VESSEL_TIPPED', section: '5.1' },
  { code: 'OVERFLOW', section: '16.2' },
  { code: 'SPLASH', section: '16.3' },
  { code: 'GLASS_BROKEN', section: '16.3' },
  { code: 'CROSS_DROPPER', section: '17' },
  { code: 'BOTTLE_CONTAMINATED', section: '17' },
  { code: 'DROPPER_WRONG_BOTTLE', section: '17' },
  { code: 'DROP_SPILLED', section: '16.2' },
  { code: 'GAS_BUBBLES', section: '9.5' },
  { code: 'METAL_WRONG_SOLUTION', section: '12.6' },
  { code: 'METAL_REMOVED_EARLY', section: '12.6' },
  { code: 'COPPER_DETACHED', section: '12.6' },
  { code: 'WRONG_TONGS_MG', section: '13.6' },
  { code: 'MG_SETUP_INCOMPLETE', section: '18.3' },
  { code: 'MG_IN_HAND', section: '18.3' },
  { code: 'MG_ABRUPT_IGNITION', section: '13.6' },
  { code: 'MG_WENT_OUT', section: '13.6' },
  { code: 'MG_NO_CAPSULE_BELOW', section: '13.6' },
  { code: 'RESIDUE_LOST', section: '13.6' },
  { code: 'LOOK_DIRECT', section: '13.6' },
  { code: 'WATER_ON_HOT_MG', section: '18.3' },
  { code: 'BURN_HOT_OBJECT', section: '13.6' },
  { code: 'HOT_ON_BENCH', section: '16.5' },
  { code: 'ETHANOL_NEAR_FLAME', section: '18.3' },
  { code: 'PROBE_ON_BOTTOM', section: '16.5' },
  { code: 'WASTE_MISCLASSIFIED', section: '18.4' },
  { code: 'DRAIN_METALS', section: '18.3' },
  { code: 'DRAIN_SOLIDS', section: '18.4' },
  { code: 'SPILL_NOT_CLEANED', section: '18.3' },
  { code: 'SPILL_NO_GLOVES', section: '18.1' },
  { code: 'GAS_FLOWING_UNLIT', section: '29-14' },
  { code: 'FLASHBACK', section: '29-14' },
];
