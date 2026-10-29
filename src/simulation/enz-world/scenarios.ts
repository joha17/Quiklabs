/**
 * Escenarios docentes de B05 (§10): configuran CONDICIONES INICIALES (lotes, instrumentos, baños, módulo ADH), nunca
 * el resultado de una prueba. Viven en el dominio porque el mundo los consulta al crear el estado y en cada paso.
 */
export const SC_B05 = {
  IDEAL: 'SC01', LOW_ACTIVITY: 'SC02', OTHER_LOT: 'SC03', OLD_PEROXIDE: 'SC04', COLLECTOR_LEAK: 'SC05', COLLECTOR_BIAS: 'SC06',
  BATH_INERTIA: 'SC07', BATH_OFFSET: 'SC08', PREHEATED: 'SC09', PH_EXTREME: 'SC10', STRIPS_COARSE: 'SC11', WEAK_BUFFER: 'SC12',
  PIPETTE_BUBBLE: 'SC13', AMBIGUOUS_LABELS: 'SC14', FOAM: 'SC15', FAST_CATALASE: 'SC16', AMYLASE_LOW: 'SC17', AMYLASE_HIGH: 'SC18',
  PIGMENTED_STARCH: 'SC19', BENEDICT_IRREGULAR: 'SC20', AMYLASE_UNKNOWN: 'SC21', BLIND: 'SC22', ADH_NAD_LIMIT: 'SC23',
  ADH_COMPETITOR: 'SC24', UV_NO_BLANK: 'SC25', NO_UV_CURVE: 'SC26', INHIBITION_MODEL: 'SC27', TONGS_MISPLACED: 'SC28',
} as const;

export type B05Scenario = (typeof SC_B05)[keyof typeof SC_B05];

/** Escenarios que habilitan el módulo ADH (§10: `advancedADH`), salvo que SC26 indique que falta la curva UV. */
export const ADH_SCENARIOS: B05Scenario[] = [SC_B05.ADH_NAD_LIMIT, SC_B05.ADH_COMPETITOR, SC_B05.UV_NO_BLANK, SC_B05.INHIBITION_MODEL];
