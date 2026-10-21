/**
 * Máquina de B01 (§5) con XState v5: avanza por EVIDENCIA con transiciones `always`, nunca por «Siguiente».
 * INTRO → PPE_CHECK → LAB.{INSPECT, PREPARE, FRESH, FIXED, STEREO, CLOSE, COMPLETE} → SUBMISSION → REVIEW.
 */
import { assign, setup } from 'xstate';
import type { B01StageFlags } from './evidence';

export interface B01WorkflowContext {
  flags: Partial<B01StageFlags>;
}

export type B01WorkflowEvent =
  | { type: 'START' }
  | { type: 'PPE_CONFIRMED' }
  | { type: 'EVIDENCE'; flags: B01StageFlags }
  | { type: 'SUBMIT' }
  | { type: 'CONFIRM' }
  | { type: 'CANCEL' };

const f = (ctx: B01WorkflowContext, k: keyof B01StageFlags) => !!ctx.flags[k];

export const practiceB01Machine = setup({
  types: { context: {} as B01WorkflowContext, events: {} as B01WorkflowEvent },
  guards: {
    inspect: ({ context: c }) => f(c, 'ppe') && f(c, 'partsLocated') && f(c, 'safetyInspected'),
    prepare: ({ context: c }) => f(c, 'mountUsable'),
    fresh: ({ context: c }) => f(c, 'freshObserved') && f(c, 'freshImported'),
    fixed: ({ context: c }) => f(c, 'fixedObserved') && f(c, 'fixedReturned'),
    stereo: ({ context: c }) => f(c, 'stereoObserved') && f(c, 'samplesReturned'),
    close: ({ context: c }) => f(c, 'safeParked') && f(c, 'benchRestored') && f(c, 'notebook'),
  },
  actions: {
    storeFlags: assign({ flags: ({ event }) => (event.type === 'EVIDENCE' ? event.flags : {}) }),
  },
}).createMachine({
  id: 'practiceB01',
  initial: 'INTRO',
  context: { flags: {} },
  states: {
    INTRO: { on: { START: 'PPE_CHECK' } },
    PPE_CHECK: { on: { PPE_CONFIRMED: 'LAB' } },
    LAB: {
      initial: 'INSPECT',
      on: { EVIDENCE: { actions: 'storeFlags' }, SUBMIT: 'SUBMISSION' },
      states: {
        INSPECT: { always: { target: 'PREPARE', guard: 'inspect' } },
        PREPARE: { always: { target: 'FRESH', guard: 'prepare' } },
        FRESH: { always: { target: 'FIXED', guard: 'fresh' } },
        FIXED: { always: { target: 'STEREO', guard: 'fixed' } },
        STEREO: { always: { target: 'CLOSE', guard: 'stereo' } },
        CLOSE: { always: { target: 'COMPLETE', guard: 'close' } },
        COMPLETE: {},
        hist: { type: 'history', history: 'shallow' },
      },
    },
    SUBMISSION: { on: { CONFIRM: 'REVIEW', CANCEL: 'LAB.hist' } },
    REVIEW: { type: 'final' },
  },
});

export const B01_STAGE_ORDER = ['INSPECT', 'PREPARE', 'FRESH', 'FIXED', 'STEREO', 'CLOSE', 'COMPLETE'] as const;

export function b01StageName(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'LAB' in value) return String((value as { LAB: string }).LAB);
  return 'INTRO';
}
