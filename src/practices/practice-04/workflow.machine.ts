/**
 * Máquina de la Práctica 4 (§23.1) con XState v5. Avanza por EVIDENCIA; las transiciones `always` encadenan las
 * etapas ya cumplidas, de modo que las estaciones pueden hacerse en otro orden seguro (§22.2): la etapa mostrada es
 * la primera pendiente. Las máquinas de recipiente (§23.2) y del metal (§23.3) son estados derivados del dominio.
 */
import { assign, setup } from 'xstate';
import type { P4StageFlags } from './evidence';

export interface P4WorkflowContext {
  flags: Partial<P4StageFlags>;
}

export type P4WorkflowEvent =
  | { type: 'START' }
  | { type: 'PPE_CONFIRMED' }
  | { type: 'EVIDENCE'; flags: P4StageFlags }
  | { type: 'SUBMIT' }
  | { type: 'CONFIRM' }
  | { type: 'CANCEL' };

const has = (k: keyof P4StageFlags) => ({ context }: { context: P4WorkflowContext }) => !!context.flags[k];

export const practice4Machine = setup({
  types: { context: {} as P4WorkflowContext, events: {} as P4WorkflowEvent },
  guards: {
    ppeSetup: has('ppeSetup'),
    neutralization: has('neutralization'),
    caco3: has('caco3'),
    feoh3: has('feoh3'),
    redox: has('redox'),
    mgSetup: has('mgSetup'),
    mgCombustion: has('mgCombustion'),
    mgHydration: has('mgHydration'),
    equations: has('equations'),
    waste: has('waste'),
  },
  actions: {
    storeFlags: assign({ flags: ({ event }) => (event.type === 'EVIDENCE' ? event.flags : {}) }),
  },
}).createMachine({
  id: 'practice04',
  initial: 'INTRO',
  context: { flags: {} },
  states: {
    INTRO: { on: { START: 'PPE_CHECK' } },
    PPE_CHECK: { on: { PPE_CONFIRMED: 'LAB' } },
    LAB: {
      initial: 'PPE_AND_SETUP',
      on: {
        EVIDENCE: { actions: 'storeFlags' },
        SUBMIT: 'SUBMISSION',
      },
      states: {
        PPE_AND_SETUP: { always: { target: 'NEUTRALIZATION', guard: 'ppeSetup' } },
        NEUTRALIZATION: { always: { target: 'PRECIPITATION_CACO3', guard: 'neutralization' } },
        PRECIPITATION_CACO3: { always: { target: 'PRECIPITATION_FEOH3', guard: 'caco3' } },
        PRECIPITATION_FEOH3: { always: { target: 'REDOX_FE_CU', guard: 'feoh3' } },
        REDOX_FE_CU: { always: { target: 'MAGNESIUM_SETUP', guard: 'redox' } },
        MAGNESIUM_SETUP: { always: { target: 'MAGNESIUM_COMBUSTION', guard: 'mgSetup' } },
        MAGNESIUM_COMBUSTION: { always: { target: 'MAGNESIUM_HYDRATION', guard: 'mgCombustion' } },
        MAGNESIUM_HYDRATION: { always: { target: 'EQUATION_ANALYSIS', guard: 'mgHydration' } },
        EQUATION_ANALYSIS: { always: { target: 'WASTE_DISPOSAL', guard: 'equations' } },
        WASTE_DISPOSAL: { always: { target: 'NOTEBOOK', guard: 'waste' } },
        NOTEBOOK: {},
        hist: { type: 'history', history: 'shallow' },
      },
    },
    SUBMISSION: { on: { CONFIRM: 'REVIEW', CANCEL: 'LAB.hist' } },
    REVIEW: { type: 'final' },
  },
});

export const P4_STAGE_ORDER = [
  'PPE_AND_SETUP', 'NEUTRALIZATION', 'PRECIPITATION_CACO3', 'PRECIPITATION_FEOH3', 'REDOX_FE_CU', 'MAGNESIUM_SETUP', 'MAGNESIUM_COMBUSTION',
  'MAGNESIUM_HYDRATION', 'EQUATION_ANALYSIS', 'WASTE_DISPOSAL', 'NOTEBOOK',
] as const;

export function p4StageName(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'LAB' in value) return String((value as { LAB: string }).LAB);
  return 'INTRO';
}
