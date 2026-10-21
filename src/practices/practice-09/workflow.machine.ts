/**
 * Máquina de la Práctica 9 (§16) con XState v5: avanza por EVIDENCIA con transiciones `always`, nunca por un botón
 * «Siguiente». INTRO → PPE_CHECK → LAB.{A…F} → SUBMISSION → REVIEW.
 */
import { assign, setup } from 'xstate';
import type { P09StageFlags } from './evidence';

export interface P09WorkflowContext {
  flags: Partial<P09StageFlags>;
}

export type P09WorkflowEvent =
  | { type: 'START' }
  | { type: 'PPE_CONFIRMED' }
  | { type: 'EVIDENCE'; flags: P09StageFlags }
  | { type: 'SUBMIT' }
  | { type: 'CONFIRM' }
  | { type: 'CANCEL' };

const f = (ctx: P09WorkflowContext, k: keyof P09StageFlags) => !!ctx.flags[k];

export const practice09Machine = setup({
  types: { context: {} as P09WorkflowContext, events: {} as P09WorkflowEvent },
  guards: {
    a: ({ context: c }) => f(c, 'ppe') && f(c, 'inspection') && f(c, 'hypotheses'),
    b: ({ context: c }) => f(c, 'controls') && f(c, 'blank') && f(c, 'interference'),
    c: ({ context: c }) => f(c, 'comparison') && f(c, 'twoLights'),
    d: ({ context: c }) => f(c, 'srTested') && f(c, 'feTested') && f(c, 'fractions'),
    e: ({ context: c }) => f(c, 'crossCheck'),
    fDone: ({ context: c }) => f(c, 'notebook') && f(c, 'diagram'),
  },
  actions: {
    storeFlags: assign({ flags: ({ event }) => (event.type === 'EVIDENCE' ? event.flags : {}) }),
  },
}).createMachine({
  id: 'practice09',
  initial: 'INTRO',
  context: { flags: {} },
  states: {
    INTRO: { on: { START: 'PPE_CHECK' } },
    PPE_CHECK: { on: { PPE_CONFIRMED: 'LAB' } },
    LAB: {
      initial: 'A_OBSERVE',
      on: { EVIDENCE: { actions: 'storeFlags' }, SUBMIT: 'SUBMISSION' },
      states: {
        A_OBSERVE: { always: { target: 'B_ATLAS', guard: 'a' } },
        B_ATLAS: { always: { target: 'C_SUPPORTS', guard: 'b' } },
        C_SUPPORTS: { always: { target: 'D_SEPARATION', guard: 'c' } },
        D_SEPARATION: { always: { target: 'E_CONFIRM', guard: 'd' } },
        E_CONFIRM: { always: { target: 'F_AUDIT', guard: 'e' } },
        F_AUDIT: { always: { target: 'COMPLETE', guard: 'fDone' } },
        COMPLETE: {},
        hist: { type: 'history', history: 'shallow' },
      },
    },
    SUBMISSION: { on: { CONFIRM: 'REVIEW', CANCEL: 'LAB.hist' } },
    REVIEW: { type: 'final' },
  },
});

export const P09_STAGE_ORDER = ['A_OBSERVE', 'B_ATLAS', 'C_SUPPORTS', 'D_SEPARATION', 'E_CONFIRM', 'F_AUDIT', 'COMPLETE'] as const;

export function p09StageName(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'LAB' in value) return String((value as { LAB: string }).LAB);
  return 'INTRO';
}
