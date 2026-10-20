/**
 * Máquina de la Práctica 7 (§6.4) con XState v5: avanza por EVIDENCIA con transiciones `always`, nunca por un botón
 * «Siguiente». INTRO → PPE_CHECK → LAB.{A…F} → SUBMISSION → REVIEW.
 */
import { assign, setup } from 'xstate';
import type { P07StageFlags } from './evidence';

export interface P07WorkflowContext {
  flags: Partial<P07StageFlags>;
}

export type P07WorkflowEvent =
  | { type: 'START' }
  | { type: 'PPE_CONFIRMED' }
  | { type: 'EVIDENCE'; flags: P07StageFlags }
  | { type: 'SUBMIT' }
  | { type: 'CONFIRM' }
  | { type: 'CANCEL' };

const f = (ctx: P07WorkflowContext, k: keyof P07StageFlags) => !!ctx.flags[k];

export const practice07Machine = setup({
  types: { context: {} as P07WorkflowContext, events: {} as P07WorkflowEvent },
  guards: {
    a: ({ context: c }) => f(c, 'ppeReady') && f(c, 'hypothesesRecorded') && f(c, 'instrumentsChecked') && f(c, 'controlReading'),
    b: ({ context: c }) => f(c, 'pairsCompared') && f(c, 'volumeMeasured') && f(c, 'observationInterval'),
    c: ({ context: c }) => f(c, 'metalContact') && f(c, 'ionicDryContact') && f(c, 'graphiteContact') && f(c, 'controlReading'),
    d: ({ context: c }) => f(c, 'blankKappa') && f(c, 'strongTwoLevels') && f(c, 'contrastKappa'),
    e: ({ context: c }) => f(c, 'unknownsStudied'),
    fDone: ({ context: c }) => f(c, 'tablesComplete') && f(c, 'reflectionRecorded'),
  },
  actions: {
    storeFlags: assign({ flags: ({ event }) => (event.type === 'EVIDENCE' ? event.flags : {}) }),
  },
}).createMachine({
  id: 'practice07',
  initial: 'INTRO',
  context: { flags: {} },
  states: {
    INTRO: { on: { START: 'PPE_CHECK' } },
    PPE_CHECK: { on: { PPE_CONFIRMED: 'LAB' } },
    LAB: {
      initial: 'A_HYPOTHESES',
      on: { EVIDENCE: { actions: 'storeFlags' }, SUBMIT: 'SUBMISSION' },
      states: {
        A_HYPOTHESES: { always: { target: 'B_SOLVENT_PAIRS', guard: 'a' } },
        B_SOLVENT_PAIRS: { always: { target: 'C_SOLID_CONTACT', guard: 'b' } },
        C_SOLID_CONTACT: { always: { target: 'D_AQUEOUS_CONDUCTIVITY', guard: 'c' } },
        D_AQUEOUS_CONDUCTIVITY: { always: { target: 'E_UNKNOWNS', guard: 'd' } },
        E_UNKNOWNS: { always: { target: 'F_CONCLUSIONS', guard: 'e' } },
        F_CONCLUSIONS: { always: { target: 'COMPLETE', guard: 'fDone' } },
        COMPLETE: {},
        hist: { type: 'history', history: 'shallow' },
      },
    },
    SUBMISSION: { on: { CONFIRM: 'REVIEW', CANCEL: 'LAB.hist' } },
    REVIEW: { type: 'final' },
  },
});

export const P07_STAGE_ORDER = ['A_HYPOTHESES', 'B_SOLVENT_PAIRS', 'C_SOLID_CONTACT', 'D_AQUEOUS_CONDUCTIVITY', 'E_UNKNOWNS', 'F_CONCLUSIONS', 'COMPLETE'] as const;

export function p07StageName(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'LAB' in value) return String((value as { LAB: string }).LAB);
  return 'INTRO';
}
