/**
 * Máquina de B03 (§6.7) con XState v5: avanza por EVIDENCIA con transiciones `always`, nunca por «Siguiente».
 * INTRO → PPE_CHECK → LAB.{SETUP, DIFFUSION, DIALYSIS, OSMOSIS, MICROSCOPY, ANALYSIS, COMPLETE} → SUBMISSION → REVIEW.
 * Las banderas fijadas permiten trabajar las estaciones en cualquier orden (la diálisis y la ósmosis incuban a la vez).
 */
import { assign, setup } from 'xstate';
import type { B03StageFlags } from './evidence';

export interface B03WorkflowContext {
  flags: Partial<B03StageFlags>;
}

export type B03WorkflowEvent =
  | { type: 'START' }
  | { type: 'PPE_CONFIRMED' }
  | { type: 'EVIDENCE'; flags: B03StageFlags }
  | { type: 'SUBMIT' }
  | { type: 'CONFIRM' }
  | { type: 'CANCEL' };

const f = (ctx: B03WorkflowContext, k: keyof B03StageFlags) => !!ctx.flags[k];

export const practiceB03Machine = setup({
  types: { context: {} as B03WorkflowContext, events: {} as B03WorkflowEvent },
  guards: {
    setup: ({ context: c }) => f(c, 'ppe') && f(c, 'setup'),
    diffusion: ({ context: c }) => f(c, 'diffusion'),
    dialysis: ({ context: c }) => f(c, 'dialysis'),
    osmosis: ({ context: c }) => f(c, 'osmosis'),
    microscopy: ({ context: c }) => f(c, 'microscopy'),
    analysis: ({ context: c }) => f(c, 'safeParked') && f(c, 'benchRestored') && f(c, 'notebook'),
  },
  actions: {
    storeFlags: assign({ flags: ({ event }) => (event.type === 'EVIDENCE' ? event.flags : {}) }),
  },
}).createMachine({
  id: 'practiceB03',
  initial: 'INTRO',
  context: { flags: {} },
  states: {
    INTRO: { on: { START: 'PPE_CHECK' } },
    PPE_CHECK: { on: { PPE_CONFIRMED: 'LAB' } },
    LAB: {
      initial: 'SETUP',
      on: { EVIDENCE: { actions: 'storeFlags' }, SUBMIT: 'SUBMISSION' },
      states: {
        SETUP: { always: { target: 'DIFFUSION', guard: 'setup' } },
        DIFFUSION: { always: { target: 'DIALYSIS', guard: 'diffusion' } },
        DIALYSIS: { always: { target: 'OSMOSIS', guard: 'dialysis' } },
        OSMOSIS: { always: { target: 'MICROSCOPY', guard: 'osmosis' } },
        MICROSCOPY: { always: { target: 'ANALYSIS', guard: 'microscopy' } },
        ANALYSIS: { always: { target: 'COMPLETE', guard: 'analysis' } },
        COMPLETE: {},
        hist: { type: 'history', history: 'shallow' },
      },
    },
    SUBMISSION: { on: { CONFIRM: 'REVIEW', CANCEL: 'LAB.hist' } },
    REVIEW: { type: 'final' },
  },
});

export const B03_STAGE_ORDER = ['SETUP', 'DIFFUSION', 'DIALYSIS', 'OSMOSIS', 'MICROSCOPY', 'ANALYSIS', 'COMPLETE'] as const;

export { b01StageName as b03StageName } from '../practice-b01/workflow.machine';
