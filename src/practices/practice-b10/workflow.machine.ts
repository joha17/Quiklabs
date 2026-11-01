/**
 * Máquina de B10 (§5) con XState v5: avanza por EVIDENCIA con transiciones `always`, nunca por «Siguiente».
 * INTRO → PPE_CHECK → LAB.{ORIENTATION, HISTOLOGY, INVERTEBRATES, SMALL, MUSCLE, ZOOLOGY, SKULLS, CLEANUP, COMPLETE} → SUBMISSION → REVIEW.
 * Las banderas fijadas permiten trabajar las estaciones en cualquier orden.
 */
import { assign, setup } from 'xstate';
import type { B10StageFlags } from './evidence';

export interface B10WorkflowContext {
  flags: Partial<B10StageFlags>;
}

export type B10WorkflowEvent =
  | { type: 'START' }
  | { type: 'PPE_CONFIRMED' }
  | { type: 'EVIDENCE'; flags: B10StageFlags }
  | { type: 'SUBMIT' }
  | { type: 'CONFIRM' }
  | { type: 'CANCEL' };

const f = (ctx: B10WorkflowContext, k: keyof B10StageFlags) => !!ctx.flags[k];

export const practiceB10Machine = setup({
  types: { context: {} as B10WorkflowContext, events: {} as B10WorkflowEvent },
  guards: {
    orientation: ({ context: c }) => f(c, 'ppe') && f(c, 'orientation'),
    histology: ({ context: c }) => f(c, 'histology'),
    invertebrates: ({ context: c }) => f(c, 'invertebrates'),
    small: ({ context: c }) => f(c, 'small'),
    muscle: ({ context: c }) => f(c, 'muscle'),
    zoology: ({ context: c }) => f(c, 'zoology'),
    skulls: ({ context: c }) => f(c, 'skulls'),
    cleanup: ({ context: c }) => f(c, 'safeParked') && f(c, 'benchRestored') && f(c, 'notebook'),
  },
  actions: {
    storeFlags: assign({ flags: ({ event }) => (event.type === 'EVIDENCE' ? event.flags : {}) }),
  },
}).createMachine({
  id: 'practiceB10',
  initial: 'INTRO',
  context: { flags: {} },
  states: {
    INTRO: { on: { START: 'PPE_CHECK' } },
    PPE_CHECK: { on: { PPE_CONFIRMED: 'LAB' } },
    LAB: {
      initial: 'ORIENTATION',
      on: { EVIDENCE: { actions: 'storeFlags' }, SUBMIT: 'SUBMISSION' },
      states: {
        ORIENTATION: { always: { target: 'HISTOLOGY', guard: 'orientation' } },
        HISTOLOGY: { always: { target: 'INVERTEBRATES', guard: 'histology' } },
        INVERTEBRATES: { always: { target: 'SMALL', guard: 'invertebrates' } },
        SMALL: { always: { target: 'MUSCLE', guard: 'small' } },
        MUSCLE: { always: { target: 'ZOOLOGY', guard: 'muscle' } },
        ZOOLOGY: { always: { target: 'SKULLS', guard: 'zoology' } },
        SKULLS: { always: { target: 'CLEANUP', guard: 'skulls' } },
        CLEANUP: { always: { target: 'COMPLETE', guard: 'cleanup' } },
        COMPLETE: {},
        hist: { type: 'history', history: 'shallow' },
      },
    },
    SUBMISSION: { on: { CONFIRM: 'REVIEW', CANCEL: 'LAB.hist' } },
    REVIEW: { type: 'final' },
  },
});

export const B10_STAGE_ORDER = ['ORIENTATION', 'HISTOLOGY', 'INVERTEBRATES', 'SMALL', 'MUSCLE', 'ZOOLOGY', 'SKULLS', 'CLEANUP', 'COMPLETE'] as const;

export { b01StageName as b10StageName } from '../practice-b01/workflow.machine';
