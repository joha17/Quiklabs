/**
 * Máquina de la Práctica 5 (§23.1) con XState v5. Avanza por EVIDENCIA (nunca por botones «Siguiente»); las
 * transiciones `always` encadenan las etapas cumplidas. El ciclo calentamiento → enfriamiento → pesada se repite
 * hasta la masa constante: mientras no la haya, la etapa vuelve a «Calentamiento».
 * Las máquinas de la balanza (§23.2) y del tubo (§23.3) son estados derivados del dominio.
 */
import { assign, setup } from 'xstate';
import type { P5StageFlags } from './evidence';

export interface P5WorkflowContext {
  flags: Partial<P5StageFlags>;
}

export type P5WorkflowEvent =
  | { type: 'START' }
  | { type: 'PPE_CONFIRMED' }
  | { type: 'EVIDENCE'; flags: P5StageFlags }
  | { type: 'SUBMIT' }
  | { type: 'CONFIRM' }
  | { type: 'CANCEL' };

const has = (k: keyof P5StageFlags) => ({ context }: { context: P5WorkflowContext }) => !!context.flags[k];

export const practice5Machine = setup({
  types: { context: {} as P5WorkflowContext, events: {} as P5WorkflowEvent },
  guards: {
    ppe: has('ppe'),
    calibrated: has('calibrated'),
    emptyTube: has('emptyTube'),
    catalyst: has('catalyst'),
    reactant: has('reactant'),
    mixed: has('mixed'),
    assembled: has('assembled'),
    heated: has('heated'),
    cooledWeighed: has('cooledWeighed'),
    constantMass: has('constantMass'),
    stoichiometry: has('stoichiometry'),
    analysis: has('analysis'),
    waste: has('waste'),
  },
  actions: {
    storeFlags: assign({ flags: ({ event }) => (event.type === 'EVIDENCE' ? event.flags : {}) }),
  },
}).createMachine({
  id: 'practice05',
  initial: 'INTRO',
  context: { flags: {} },
  states: {
    INTRO: { on: { START: 'PPE_CHECK' } },
    PPE_CHECK: { on: { PPE_CONFIRMED: 'LAB' } },
    LAB: {
      initial: 'PPE_AND_HAZARD_CHECK',
      on: { EVIDENCE: { actions: 'storeFlags' }, SUBMIT: 'SUBMISSION' },
      states: {
        PPE_AND_HAZARD_CHECK: { always: { target: 'BALANCE_CALIBRATION', guard: 'ppe' } },
        BALANCE_CALIBRATION: { always: { target: 'EMPTY_TUBE_WEIGHING', guard: 'calibrated' } },
        EMPTY_TUBE_WEIGHING: { always: { target: 'CATALYST_ADDITION_WEIGHING', guard: 'emptyTube' } },
        CATALYST_ADDITION_WEIGHING: { always: { target: 'KClO3_ADDITION_WEIGHING', guard: 'catalyst' } },
        KClO3_ADDITION_WEIGHING: { always: { target: 'SAFE_MIXING', guard: 'reactant' } },
        SAFE_MIXING: { always: { target: 'APPARATUS_ASSEMBLY', guard: 'mixed' } },
        APPARATUS_ASSEMBLY: { always: { target: 'HEATING_CYCLE', guard: 'assembled' } },
        HEATING_CYCLE: { always: { target: 'COOLING', guard: 'heated' } },
        COOLING: { always: { target: 'CONSTANT_MASS_CHECK', guard: 'cooledWeighed' } },
        // Sin masa constante se vuelve a calentar; con ella se pasa a los cálculos.
        CONSTANT_MASS_CHECK: { always: { target: 'STOICHIOMETRY', guard: 'constantMass' } },
        STOICHIOMETRY: { always: { target: 'YIELD_ANALYSIS', guard: 'stoichiometry' } },
        YIELD_ANALYSIS: { always: { target: 'WASTE_AND_SHUTDOWN', guard: 'analysis' } },
        WASTE_AND_SHUTDOWN: { always: { target: 'DONE', guard: 'waste' } },
        DONE: {},
        hist: { type: 'history', history: 'shallow' },
      },
    },
    SUBMISSION: { on: { CONFIRM: 'REVIEW', CANCEL: 'LAB.hist' } },
    REVIEW: { type: 'final' },
  },
});

export const P5_STAGE_ORDER = [
  'PPE_AND_HAZARD_CHECK', 'BALANCE_CALIBRATION', 'EMPTY_TUBE_WEIGHING', 'CATALYST_ADDITION_WEIGHING', 'KClO3_ADDITION_WEIGHING',
  'SAFE_MIXING', 'APPARATUS_ASSEMBLY', 'HEATING_CYCLE', 'COOLING', 'CONSTANT_MASS_CHECK', 'STOICHIOMETRY', 'YIELD_ANALYSIS',
  'WASTE_AND_SHUTDOWN', 'DONE',
] as const;

export function p5StageName(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'LAB' in value) return String((value as { LAB: string }).LAB);
  return 'INTRO';
}
