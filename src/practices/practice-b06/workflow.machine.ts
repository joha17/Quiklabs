/**
 * Máquina de B06 (§6.4) con XState v5: avanza por EVIDENCIA con transiciones `always`, nunca por «Siguiente».
 * INTRO → PPE_CHECK → LAB.{CLASSIFICATION, PREPARATION, PROTISTS, FIXED_SLIDES, COMPARISONS, ANALYSIS, CLEANUP,
 * COMPLETE} → SUBMISSION → REVIEW. Las banderas fijadas permiten trabajar las rutas en cualquier orden.
 */
import { assign, setup } from 'xstate';
import type { B06StageFlags } from './evidence';

export interface B06WorkflowContext {
  flags: Partial<B06StageFlags>;
}

export type B06WorkflowEvent =
  | { type: 'START' }
  | { type: 'PPE_CONFIRMED' }
  | { type: 'EVIDENCE'; flags: B06StageFlags }
  | { type: 'SUBMIT' }
  | { type: 'CONFIRM' }
  | { type: 'CANCEL' };

const f = (ctx: B06WorkflowContext, k: keyof B06StageFlags) => !!ctx.flags[k];

export const practiceB06Machine = setup({
  types: { context: {} as B06WorkflowContext, events: {} as B06WorkflowEvent },
  guards: {
    classification: ({ context: c }) => f(c, 'ppe') && f(c, 'classification'),
    preparation: ({ context: c }) => f(c, 'preparation'),
    protists: ({ context: c }) => f(c, 'protists'),
    fixedSlides: ({ context: c }) => f(c, 'fixedSlides'),
    comparisons: ({ context: c }) => f(c, 'comparisons'),
    analysis: ({ context: c }) => f(c, 'analysis'),
    cleanup: ({ context: c }) => f(c, 'safeParked') && f(c, 'benchRestored') && f(c, 'notebook'),
  },
  actions: {
    storeFlags: assign({ flags: ({ event }) => (event.type === 'EVIDENCE' ? event.flags : {}) }),
  },
}).createMachine({
  id: 'practiceB06',
  initial: 'INTRO',
  context: { flags: {} },
  states: {
    INTRO: { on: { START: 'PPE_CHECK' } },
    PPE_CHECK: { on: { PPE_CONFIRMED: 'LAB' } },
    LAB: {
      initial: 'CLASSIFICATION',
      on: { EVIDENCE: { actions: 'storeFlags' }, SUBMIT: 'SUBMISSION' },
      states: {
        CLASSIFICATION: { always: { target: 'PREPARATION', guard: 'classification' } },
        PREPARATION: { always: { target: 'PROTISTS', guard: 'preparation' } },
        PROTISTS: { always: { target: 'FIXED_SLIDES', guard: 'protists' } },
        FIXED_SLIDES: { always: { target: 'COMPARISONS', guard: 'fixedSlides' } },
        COMPARISONS: { always: { target: 'ANALYSIS', guard: 'comparisons' } },
        ANALYSIS: { always: { target: 'CLEANUP', guard: 'analysis' } },
        CLEANUP: { always: { target: 'COMPLETE', guard: 'cleanup' } },
        COMPLETE: {},
        hist: { type: 'history', history: 'shallow' },
      },
    },
    SUBMISSION: { on: { CONFIRM: 'REVIEW', CANCEL: 'LAB.hist' } },
    REVIEW: { type: 'final' },
  },
});

export const B06_STAGE_ORDER = ['CLASSIFICATION', 'PREPARATION', 'PROTISTS', 'FIXED_SLIDES', 'COMPARISONS', 'ANALYSIS', 'CLEANUP', 'COMPLETE'] as const;

export { b01StageName as b06StageName } from '../practice-b01/workflow.machine';
