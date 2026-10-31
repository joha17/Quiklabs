/**
 * Máquina de B08 (§5) con XState v5: avanza por EVIDENCIA, nunca por «Siguiente».
 * INTRO → PPE_CHECK → LAB.{HYPOTHESIS, GAS, BTB, EXTRACT, CHROM, CLEANUP, COMPLETE} → SUBMISSION → REVIEW.
 */
import { assign, setup } from 'xstate';
import type { B08StageFlags } from './evidence';

export interface B08WorkflowContext {
  flags: Partial<B08StageFlags>;
}

export type B08WorkflowEvent =
  | { type: 'START' }
  | { type: 'PPE_CONFIRMED' }
  | { type: 'EVIDENCE'; flags: B08StageFlags }
  | { type: 'SUBMIT' }
  | { type: 'CONFIRM' }
  | { type: 'CANCEL' };

const f = (ctx: B08WorkflowContext, k: keyof B08StageFlags) => !!ctx.flags[k];

export const practiceB08Machine = setup({
  types: { context: {} as B08WorkflowContext, events: {} as B08WorkflowEvent },
  guards: {
    hypothesis: ({ context: c }) => f(c, 'ppe') && f(c, 'hypothesis'),
    gas: ({ context: c }) => f(c, 'gas'),
    btb: ({ context: c }) => f(c, 'btb'),
    extract: ({ context: c }) => f(c, 'extract'),
    chrom: ({ context: c }) => f(c, 'chrom'),
    cleanup: ({ context: c }) => f(c, 'safeParked') && f(c, 'benchRestored') && f(c, 'notebook'),
  },
  actions: {
    storeFlags: assign({ flags: ({ event }) => (event.type === 'EVIDENCE' ? event.flags : {}) }),
  },
}).createMachine({
  id: 'practiceB08',
  initial: 'INTRO',
  context: { flags: {} },
  states: {
    INTRO: { on: { START: 'PPE_CHECK' } },
    PPE_CHECK: { on: { PPE_CONFIRMED: 'LAB' } },
    LAB: {
      initial: 'HYPOTHESIS',
      on: { EVIDENCE: { actions: 'storeFlags' }, SUBMIT: 'SUBMISSION' },
      states: {
        HYPOTHESIS: { always: { target: 'GAS', guard: 'hypothesis' } },
        GAS: { always: { target: 'BTB', guard: 'gas' } },
        BTB: { always: { target: 'EXTRACT', guard: 'btb' } },
        EXTRACT: { always: { target: 'CHROM', guard: 'extract' } },
        CHROM: { always: { target: 'CLEANUP', guard: 'chrom' } },
        CLEANUP: { always: { target: 'COMPLETE', guard: 'cleanup' } },
        COMPLETE: {},
        hist: { type: 'history', history: 'shallow' },
      },
    },
    SUBMISSION: { on: { CONFIRM: 'REVIEW', CANCEL: 'LAB.hist' } },
    REVIEW: { type: 'final' },
  },
});

export const B08_STAGE_ORDER = ['HYPOTHESIS', 'GAS', 'BTB', 'EXTRACT', 'CHROM', 'CLEANUP', 'COMPLETE'] as const;

export { b01StageName as b08StageName } from '../practice-b01/workflow.machine';
