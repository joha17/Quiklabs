/**
 * Máquina de la Práctica 10 (§29.1) con XState v5. Avanza por EVIDENCIA (nunca por botones «Siguiente»); las
 * transiciones `always` encadenan las etapas cumplidas. Las máquinas del reactor (§29.2), la bureta (§29.3) y la
 * jeringa (§29.4) son estados del dominio (`reactor.stage`, `burette.stage`, `syringe.stage`).
 */
import { assign, setup } from 'xstate';
import type { P10StageFlags } from './evidence';

export interface P10WorkflowContext {
  flags: Partial<P10StageFlags>;
}

export type P10WorkflowEvent =
  | { type: 'START' }
  | { type: 'PPE_CONFIRMED' }
  | { type: 'EVIDENCE'; flags: P10StageFlags }
  | { type: 'SUBMIT' }
  | { type: 'CONFIRM' }
  | { type: 'CANCEL' };

const has = (k: keyof P10StageFlags) => ({ context }: { context: P10WorkflowContext }) => !!context.flags[k];

export const practice10Machine = setup({
  types: { context: {} as P10WorkflowContext, events: {} as P10WorkflowEvent },
  guards: {
    inventory: has('inventory'),
    gasSetup: has('gasSetup'),
    weighing: has('weighing'),
    solution: has('solution'),
    aliquot: has('aliquot'),
    reactionSetup: has('reactionSetup'),
    generation: has('generation'),
    equilibration: has('equilibration'),
    measurements: has('measurements'),
    rCalc: has('rCalc'),
    secondReplicate: has('secondReplicate'),
    boyleSetup: has('boyleSetup'),
    boyleCollection: has('boyleCollection'),
    curveAnalysis: has('curveAnalysis'),
    activities: has('activities'),
    report: has('report'),
  },
  actions: {
    storeFlags: assign({ flags: ({ event }) => (event.type === 'EVIDENCE' ? event.flags : {}) }),
  },
}).createMachine({
  id: 'practice10',
  initial: 'INTRO',
  context: { flags: {} },
  states: {
    INTRO: { on: { START: 'PPE_CHECK' } },
    PPE_CHECK: { on: { PPE_CONFIRMED: 'LAB' } },
    LAB: {
      initial: 'INVENTORY',
      on: { EVIDENCE: { actions: 'storeFlags' }, SUBMIT: 'SUBMISSION' },
      states: {
        INVENTORY: { always: { target: 'GAS_COLLECTION_SETUP', guard: 'inventory' } },
        GAS_COLLECTION_SETUP: { always: { target: 'BICARBONATE_WEIGHING', guard: 'gasSetup' } },
        BICARBONATE_WEIGHING: { always: { target: 'SOLUTION_PREPARATION', guard: 'weighing' } },
        SOLUTION_PREPARATION: { always: { target: 'ALIQUOT_TRANSFER', guard: 'solution' } },
        ALIQUOT_TRANSFER: { always: { target: 'REACTION_SETUP', guard: 'aliquot' } },
        REACTION_SETUP: { always: { target: 'CO2_GENERATION', guard: 'reactionSetup' } },
        CO2_GENERATION: { always: { target: 'EQUILIBRATION', guard: 'generation' } },
        EQUILIBRATION: { always: { target: 'GAS_MEASUREMENTS', guard: 'equilibration' } },
        GAS_MEASUREMENTS: { always: { target: 'R_CALCULATION', guard: 'measurements' } },
        R_CALCULATION: { always: { target: 'SECOND_REPLICATE', guard: 'rCalc' } },
        SECOND_REPLICATE: { always: { target: 'BOYLE_SETUP', guard: 'secondReplicate' } },
        BOYLE_SETUP: { always: { target: 'BOYLE_COLLECTION', guard: 'boyleSetup' } },
        BOYLE_COLLECTION: { always: { target: 'CURVE_ANALYSIS', guard: 'boyleCollection' } },
        CURVE_ANALYSIS: { always: { target: 'LEARNING_ACTIVITIES', guard: 'curveAnalysis' } },
        LEARNING_ACTIVITIES: { always: { target: 'REPORT', guard: 'activities' } },
        REPORT: { always: { target: 'COMPLETE', guard: 'report' } },
        COMPLETE: {},
        hist: { type: 'history', history: 'shallow' },
      },
    },
    SUBMISSION: { on: { CONFIRM: 'REVIEW', CANCEL: 'LAB.hist' } },
    REVIEW: { type: 'final' },
  },
});

export const P10_STAGE_ORDER = [
  'INVENTORY', 'GAS_COLLECTION_SETUP', 'BICARBONATE_WEIGHING', 'SOLUTION_PREPARATION', 'ALIQUOT_TRANSFER', 'REACTION_SETUP', 'CO2_GENERATION',
  'EQUILIBRATION', 'GAS_MEASUREMENTS', 'R_CALCULATION', 'SECOND_REPLICATE', 'BOYLE_SETUP', 'BOYLE_COLLECTION', 'CURVE_ANALYSIS',
  'LEARNING_ACTIVITIES', 'REPORT', 'COMPLETE',
] as const;

export function p10StageName(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'LAB' in value) return String((value as { LAB: string }).LAB);
  return 'INTRO';
}
