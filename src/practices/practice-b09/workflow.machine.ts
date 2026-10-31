/**
 * Máquina de B09 (§6.4) con XState v5: avanza por EVIDENCIA con transiciones `always`, nunca por «Siguiente».
 * INTRO → PPE_CHECK → LAB.{HYPOTHESIS, EXTERNAL, SECTIONING, SLIDES, FOLIAR, ANALYSIS, CLEANUP, COMPLETE} → SUBMISSION → REVIEW.
 * Las banderas fijadas permiten trabajar las rutas B a E en cualquier orden.
 */
import { assign, setup } from 'xstate';
import type { B09StageFlags } from './evidence';

export interface B09WorkflowContext {
  flags: Partial<B09StageFlags>;
}

export type B09WorkflowEvent =
  | { type: 'START' }
  | { type: 'PPE_CONFIRMED' }
  | { type: 'EVIDENCE'; flags: B09StageFlags }
  | { type: 'SUBMIT' }
  | { type: 'CONFIRM' }
  | { type: 'CANCEL' };

const f = (ctx: B09WorkflowContext, k: keyof B09StageFlags) => !!ctx.flags[k];

export const practiceB09Machine = setup({
  types: { context: {} as B09WorkflowContext, events: {} as B09WorkflowEvent },
  guards: {
    hypothesis: ({ context: c }) => f(c, 'ppe') && f(c, 'hypothesis'),
    external: ({ context: c }) => f(c, 'external'),
    sectioning: ({ context: c }) => f(c, 'sectioning'),
    slides: ({ context: c }) => f(c, 'slides'),
    foliar: ({ context: c }) => f(c, 'foliar'),
    analysis: ({ context: c }) => f(c, 'analysis'),
    cleanup: ({ context: c }) => f(c, 'safeParked') && f(c, 'benchRestored') && f(c, 'notebook'),
  },
  actions: {
    storeFlags: assign({ flags: ({ event }) => (event.type === 'EVIDENCE' ? event.flags : {}) }),
  },
}).createMachine({
  id: 'practiceB09',
  initial: 'INTRO',
  context: { flags: {} },
  states: {
    INTRO: { on: { START: 'PPE_CHECK' } },
    PPE_CHECK: { on: { PPE_CONFIRMED: 'LAB' } },
    LAB: {
      initial: 'HYPOTHESIS',
      on: { EVIDENCE: { actions: 'storeFlags' }, SUBMIT: 'SUBMISSION' },
      states: {
        HYPOTHESIS: { always: { target: 'EXTERNAL', guard: 'hypothesis' } },
        EXTERNAL: { always: { target: 'SECTIONING', guard: 'external' } },
        SECTIONING: { always: { target: 'SLIDES', guard: 'sectioning' } },
        SLIDES: { always: { target: 'FOLIAR', guard: 'slides' } },
        FOLIAR: { always: { target: 'ANALYSIS', guard: 'foliar' } },
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

export const B09_STAGE_ORDER = ['HYPOTHESIS', 'EXTERNAL', 'SECTIONING', 'SLIDES', 'FOLIAR', 'ANALYSIS', 'CLEANUP', 'COMPLETE'] as const;

export { b01StageName as b09StageName } from '../practice-b01/workflow.machine';
