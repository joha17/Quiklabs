/**
 * Máquina de la Práctica 8 (§17.2) con XState v5: avanza por EVIDENCIA con transiciones `always`, nunca por un botón
 * «Siguiente». INTRO → PPE_CHECK → LAB.{PREPARE_AND_PREDICT → DOSING → REACTION → ISOLATE → CHARACTERIZE → NOTEBOOK}
 * → SUBMISSION → REVIEW. La ruta se fija en la intro (ROUTE_ASSIGNED) y no cambia dentro del intento.
 */
import { assign, setup } from 'xstate';
import type { RouteId } from '../../simulation/organic-world/types';
import type { P08StageFlags } from './evidence';

export interface P08WorkflowContext {
  route: RouteId | null;
  flags: Partial<P08StageFlags>;
}

export type P08WorkflowEvent =
  | { type: 'ROUTE'; route: RouteId }
  | { type: 'START' }
  | { type: 'PPE_CONFIRMED' }
  | { type: 'EVIDENCE'; flags: P08StageFlags }
  | { type: 'SUBMIT' }
  | { type: 'CONFIRM' }
  | { type: 'CANCEL' };

const f = (ctx: P08WorkflowContext, k: keyof P08StageFlags) => !!ctx.flags[k];

export const practice08Machine = setup({
  types: { context: {} as P08WorkflowContext, events: {} as P08WorkflowEvent },
  guards: {
    prepared: ({ context: c }) => f(c, 'safety') && f(c, 'hypothesis'),
    dosed: ({ context: c }) => f(c, 'reagents_ready'),
    reacted: ({ context: c }) => f(c, 'reaction_observed'),
    isolated: ({ context: c }) => f(c, 'product_isolated'),
    characterized: ({ context: c }) => f(c, 'product_characterized'),
    reported: ({ context: c }) => f(c, 'report_ready'),
    hasRoute: ({ context: c }) => c.route !== null,
  },
  actions: {
    storeFlags: assign({ flags: ({ event }) => (event.type === 'EVIDENCE' ? event.flags : {}) }),
    storeRoute: assign({ route: ({ context, event }) => (event.type === 'ROUTE' && context.route === null ? event.route : context.route) }),
  },
}).createMachine({
  id: 'practice08',
  initial: 'INTRO',
  context: { route: null, flags: {} },
  states: {
    INTRO: { on: { ROUTE: { actions: 'storeRoute' }, START: { target: 'PPE_CHECK', guard: 'hasRoute' } } },
    PPE_CHECK: { on: { PPE_CONFIRMED: 'LAB' } },
    LAB: {
      initial: 'PREPARE_AND_PREDICT',
      on: { EVIDENCE: { actions: 'storeFlags' }, SUBMIT: 'SUBMISSION' },
      states: {
        PREPARE_AND_PREDICT: { always: { target: 'DOSING', guard: 'prepared' } },
        DOSING: { always: { target: 'REACTION', guard: 'dosed' } },
        REACTION: { always: { target: 'ISOLATE', guard: 'reacted' } },
        ISOLATE: { always: { target: 'CHARACTERIZE', guard: 'isolated' } },
        CHARACTERIZE: { always: { target: 'NOTEBOOK', guard: 'characterized' } },
        NOTEBOOK: { always: { target: 'COMPLETE', guard: 'reported' } },
        COMPLETE: {},
        hist: { type: 'history', history: 'shallow' },
      },
    },
    SUBMISSION: { on: { CONFIRM: 'REVIEW', CANCEL: 'LAB.hist' } },
    REVIEW: { type: 'final' },
  },
});

export const P08_STAGE_ORDER = ['PREPARE_AND_PREDICT', 'DOSING', 'REACTION', 'ISOLATE', 'CHARACTERIZE', 'NOTEBOOK', 'COMPLETE'] as const;

export function p08StageName(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'LAB' in value) return String((value as { LAB: string }).LAB);
  return 'INTRO';
}
