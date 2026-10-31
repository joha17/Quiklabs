/**
 * Máquina de B07 (§15.1) con XState v5: avanza por EVIDENCIA, nunca por «Siguiente».
 * INTRO → PPE_CHECK → LAB.{MEDIA, PLATES, DISTRIBUTION, STAIN, OPTICS, INTERPRETATION, CLEANUP, COMPLETE} → SUBMISSION → REVIEW.
 */
import { assign, setup } from 'xstate';
import type { B07StageFlags } from './evidence';

export interface B07WorkflowContext {
  flags: Partial<B07StageFlags>;
}

export type B07WorkflowEvent =
  | { type: 'START' }
  | { type: 'PPE_CONFIRMED' }
  | { type: 'EVIDENCE'; flags: B07StageFlags }
  | { type: 'SUBMIT' }
  | { type: 'CONFIRM' }
  | { type: 'CANCEL' };

const f = (ctx: B07WorkflowContext, k: keyof B07StageFlags) => !!ctx.flags[k];

export const practiceB07Machine = setup({
  types: { context: {} as B07WorkflowContext, events: {} as B07WorkflowEvent },
  guards: {
    media: ({ context: c }) => f(c, 'ppe') && f(c, 'media'),
    plates: ({ context: c }) => f(c, 'plates'),
    distribution: ({ context: c }) => f(c, 'distribution'),
    stain: ({ context: c }) => f(c, 'stain'),
    optics: ({ context: c }) => f(c, 'optics'),
    interpretation: ({ context: c }) => f(c, 'interpretation'),
    cleanup: ({ context: c }) => f(c, 'safeParked') && f(c, 'benchRestored') && f(c, 'notebook'),
  },
  actions: {
    storeFlags: assign({ flags: ({ event }) => (event.type === 'EVIDENCE' ? event.flags : {}) }),
  },
}).createMachine({
  id: 'practiceB07',
  initial: 'INTRO',
  context: { flags: {} },
  states: {
    INTRO: { on: { START: 'PPE_CHECK' } },
    PPE_CHECK: { on: { PPE_CONFIRMED: 'LAB' } },
    LAB: {
      initial: 'MEDIA',
      on: { EVIDENCE: { actions: 'storeFlags' }, SUBMIT: 'SUBMISSION' },
      states: {
        MEDIA: { always: { target: 'PLATES', guard: 'media' } },
        PLATES: { always: { target: 'DISTRIBUTION', guard: 'plates' } },
        DISTRIBUTION: { always: { target: 'STAIN', guard: 'distribution' } },
        STAIN: { always: { target: 'OPTICS', guard: 'stain' } },
        OPTICS: { always: { target: 'INTERPRETATION', guard: 'optics' } },
        INTERPRETATION: { always: { target: 'CLEANUP', guard: 'interpretation' } },
        CLEANUP: { always: { target: 'COMPLETE', guard: 'cleanup' } },
        COMPLETE: {},
        hist: { type: 'history', history: 'shallow' },
      },
    },
    SUBMISSION: { on: { CONFIRM: 'REVIEW', CANCEL: 'LAB.hist' } },
    REVIEW: { type: 'final' },
  },
});

export const B07_STAGE_ORDER = ['MEDIA', 'PLATES', 'DISTRIBUTION', 'STAIN', 'OPTICS', 'INTERPRETATION', 'CLEANUP', 'COMPLETE'] as const;

export { b01StageName as b07StageName } from '../practice-b01/workflow.machine';
