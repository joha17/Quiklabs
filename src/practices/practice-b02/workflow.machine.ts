/**
 * Máquina de B02 (§5) con XState v5: avanza por EVIDENCIA con transiciones `always`, nunca por «Siguiente».
 * INTRO → PPE_CHECK → LAB.{PREDICT, PIGMENTS, STARCH, WALLS, ANIMAL, ELODEA, COMPARE, CLOSURE, COMPLETE} →
 * SUBMISSION → REVIEW. Las banderas fijadas permiten trabajar las muestras en cualquier orden.
 */
import { assign, setup } from 'xstate';
import type { B02StageFlags } from './evidence';

export interface B02WorkflowContext {
  flags: Partial<B02StageFlags>;
}

export type B02WorkflowEvent =
  | { type: 'START' }
  | { type: 'PPE_CONFIRMED' }
  | { type: 'EVIDENCE'; flags: B02StageFlags }
  | { type: 'SUBMIT' }
  | { type: 'CONFIRM' }
  | { type: 'CANCEL' };

const f = (ctx: B02WorkflowContext, k: keyof B02StageFlags) => !!ctx.flags[k];

export const practiceB02Machine = setup({
  types: { context: {} as B02WorkflowContext, events: {} as B02WorkflowEvent },
  guards: {
    predict: ({ context: c }) => f(c, 'ppe') && f(c, 'predict'),
    pigments: ({ context: c }) => f(c, 'pigments'),
    starch: ({ context: c }) => f(c, 'starch'),
    walls: ({ context: c }) => f(c, 'walls'),
    animal: ({ context: c }) => f(c, 'animal'),
    elodea: ({ context: c }) => f(c, 'elodea'),
    compare: ({ context: c }) => f(c, 'compare'),
    closure: ({ context: c }) => f(c, 'safeParked') && f(c, 'benchRestored') && f(c, 'notebook'),
  },
  actions: {
    storeFlags: assign({ flags: ({ event }) => (event.type === 'EVIDENCE' ? event.flags : {}) }),
  },
}).createMachine({
  id: 'practiceB02',
  initial: 'INTRO',
  context: { flags: {} },
  states: {
    INTRO: { on: { START: 'PPE_CHECK' } },
    PPE_CHECK: { on: { PPE_CONFIRMED: 'LAB' } },
    LAB: {
      initial: 'PREDICT',
      on: { EVIDENCE: { actions: 'storeFlags' }, SUBMIT: 'SUBMISSION' },
      states: {
        PREDICT: { always: { target: 'PIGMENTS', guard: 'predict' } },
        PIGMENTS: { always: { target: 'STARCH', guard: 'pigments' } },
        STARCH: { always: { target: 'WALLS', guard: 'starch' } },
        WALLS: { always: { target: 'ANIMAL', guard: 'walls' } },
        ANIMAL: { always: { target: 'ELODEA', guard: 'animal' } },
        ELODEA: { always: { target: 'COMPARE', guard: 'elodea' } },
        COMPARE: { always: { target: 'CLOSURE', guard: 'compare' } },
        CLOSURE: { always: { target: 'COMPLETE', guard: 'closure' } },
        COMPLETE: {},
        hist: { type: 'history', history: 'shallow' },
      },
    },
    SUBMISSION: { on: { CONFIRM: 'REVIEW', CANCEL: 'LAB.hist' } },
    REVIEW: { type: 'final' },
  },
});

export const B02_STAGE_ORDER = ['PREDICT', 'PIGMENTS', 'STARCH', 'WALLS', 'ANIMAL', 'ELODEA', 'COMPARE', 'CLOSURE', 'COMPLETE'] as const;

export { b01StageName as b02StageName } from '../practice-b01/workflow.machine';
