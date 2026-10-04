/**
 * Escenarios de error configurables por el docente (§14). Se aplican al crear el intento y quedan
 * registrados en el mundo; el estudiante debe detectarlos con las mismas herramientas que en el laboratorio.
 */
export type P3Scenario = 'CRACKED_HOSE' | 'CONTAMINATED_LOOP' | 'DRAFT' | 'POOR_VENTILATION';

export const P3_SCENARIOS: P3Scenario[] = ['CRACKED_HOSE', 'CONTAMINATED_LOOP', 'DRAFT', 'POOR_VENTILATION'];

export interface ScenarioEffects {
  crackedHose: boolean;
  /** Contaminación inicial por asa (mg de sal). */
  loopContamination: Record<string, Record<string, number>>;
  draft: number;
  ventilation: number;
}

export function scenarioEffects(list: P3Scenario[]): ScenarioEffects {
  const fx: ScenarioEffects = { crackedHose: false, loopContamination: {}, draft: 0, ventilation: 0.3 };
  for (const s of list) {
    if (s === 'CRACKED_HOSE') fx.crackedHose = true;
    // El asa del KCl guardada con residuos de NaCl: la comprobación de limpieza lo revela (§11.7).
    if (s === 'CONTAMINATED_LOOP') fx.loopContamination.loop_kcl = { 'Na+': 0.004 };
    if (s === 'DRAFT') fx.draft = 0.55;
    if (s === 'POOR_VENTILATION') fx.ventilation = 0.08;
  }
  return fx;
}

/**
 * Catálogo de errores simulables con consecuencia observable (§27-13). Clave de evento del dominio → sección.
 * Sirve para documentación, pruebas y la vista docente.
 */
export const SIMULATED_ERRORS: Array<{ code: string; section: string }> = [
  { code: 'IGNITION_BLOCKED_PPE', section: '14.1' },
  { code: 'HOSE_CRACK_FOUND', section: '14.1' },
  { code: 'SOAP_BUBBLES', section: '14.1' },
  { code: 'HOSE_NEAR_FLAME', section: '14.1' },
  { code: 'HOSE_HEATING', section: '14.1' },
  { code: 'IGNITION_AIR_OPEN', section: '14.1' },
  { code: 'FLASHBACK', section: '14.1' },
  { code: 'GAS_BEFORE_SPARK', section: '14.1' },
  { code: 'IGNITION_ABRUPT', section: '14.1' },
  { code: 'GAS_FLOWING_UNLIT', section: '14.1' },
  { code: 'IGNITION_BLOCKED_GAS', section: '14.1' },
  { code: 'FLAME_OUT_MOVED', section: '14.1' },
  { code: 'LEAK_TEST_WITH_FLAME', section: '15.1' },
  { code: 'FLAME_LIFTED', section: '14.2' },
  { code: 'FLAME_BLOWN_OFF', section: '14.2' },
  { code: 'CO_WARN', section: '14.2' },
  { code: 'CAPSULE_OUT_OF_FLAME', section: '14.2' },
  { code: 'CAPSULE_TOO_LONG', section: '14.2' },
  { code: 'BURN_HOT_OBJECT', section: '14.2' },
  { code: 'CLEAN_HOT_CAPSULE', section: '14.2' },
  { code: 'CAPSULE_SLIPPED', section: '13.3' },
  { code: 'LOOP_CONTAMINATED_SIGNAL', section: '14.3' },
  { code: 'WRONG_LOOP', section: '14.3' },
  { code: 'HOT_LOOP_IN_TUBE', section: '14.3' },
  { code: 'LOOP_SPUTTER', section: '14.3' },
  { code: 'LOOPS_TOUCHED', section: '10.3' },
  { code: 'HOT_LOOP_IN_HCL', section: '10.2' },
  { code: 'HCL_OPEN_NEAR_FLAME', section: '15.3' },
  { code: 'GLASS_IN_FLAME', section: '13.6' },
  { code: 'TUBE_SPILLED', section: '5' },
  { code: 'ATOMIZER_MISSED', section: '14.3' },
  { code: 'ATOMIZER_TOWARD_PERSON', section: '15.1' },
  { code: 'TABLE_VALVE_LEFT_OPEN', section: '14.4' },
  { code: 'HOSE_REMOVED_GAS_OPEN', section: '14.4' },
  { code: 'HOT_ON_BENCH', section: '14.4' },
];
