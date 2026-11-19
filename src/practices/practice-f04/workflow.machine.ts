/**
 * Máquina de F04 (§5) con XState v5. Avanza por EVIDENCIA, nunca por un botón «Siguiente»: las transiciones `always`
 * encadenan las etapas cumplidas (inventario de fuerzas → polea → aceleración → tercera ley → análisis → informe).
 */
import { assign, setup } from 'xstate';
import type { F04StageFlags } from './evidence';

export interface F04WorkflowContext {
  flags: Partial<F04StageFlags>;
}

export type F04WorkflowEvent =
  | { type: 'START' }
  | { type: 'PPE_CONFIRMED' }
  | { type: 'EVIDENCE'; flags: F04StageFlags }
  | { type: 'SUBMIT' }
  | { type: 'CONFIRM' }
  | { type: 'CANCEL' };

const f = (ctx: F04WorkflowContext, k: keyof F04StageFlags) => !!ctx.flags[k];

export const practiceF04Machine = setup({
  types: { context: {} as F04WorkflowContext, events: {} as F04WorkflowEvent },
  guards: {
    inventory: ({ context: c }) => f(c, 'instrumentsInspected') && f(c, 'massesWeighed') && f(c, 'fbdDone'),
    pulley: ({ context: c }) => f(c, 'trackLevel') && f(c, 'stringReady') && f(c, 'gatesRead'),
    acceleration: ({ context: c }) => f(c, 'sensorsReady') && f(c, 'repeatedRuns') && f(c, 'massRuns'),
    thirdLaw: ({ context: c }) => f(c, 'pairsDone'),
    analysis: ({ context: c }) => f(c, 'tables') && f(c, 'calculations') && f(c, 'contrast') && f(c, 'stationClosed'),
    report: ({ context: c }) => f(c, 'reflection'),
  },
  actions: {
    storeFlags: assign({ flags: ({ event }) => (event.type === 'EVIDENCE' ? event.flags : {}) }),
  },
}).createMachine({
  id: 'practiceF04',
  initial: 'INTRO',
  context: { flags: {} },
  states: {
    INTRO: { on: { START: 'PPE_CHECK' } },
    PPE_CHECK: { on: { PPE_CONFIRMED: 'LAB' } },
    LAB: {
      initial: 'INVENTORY',
      on: { EVIDENCE: { actions: 'storeFlags' }, SUBMIT: 'SUBMISSION' },
      states: {
        INVENTORY: { always: { target: 'PULLEY', guard: 'inventory' } },
        PULLEY: { always: { target: 'ACCELERATION', guard: 'pulley' } },
        ACCELERATION: { always: { target: 'THIRD_LAW', guard: 'acceleration' } },
        THIRD_LAW: { always: { target: 'ANALYSIS', guard: 'thirdLaw' } },
        ANALYSIS: { always: { target: 'REPORT', guard: 'analysis' } },
        REPORT: { always: { target: 'COMPLETE', guard: 'report' } },
        COMPLETE: {},
        hist: { type: 'history', history: 'shallow' },
      },
    },
    SUBMISSION: { on: { CONFIRM: 'REVIEW', CANCEL: 'LAB.hist' } },
    REVIEW: { type: 'final' },
  },
});

export const F04_STAGE_ORDER = ['INVENTORY', 'PULLEY', 'ACCELERATION', 'THIRD_LAW', 'ANALYSIS', 'REPORT', 'COMPLETE'] as const;

export function f04StageName(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'LAB' in value) return String((value as { LAB: string }).LAB);
  return 'INTRO';
}
