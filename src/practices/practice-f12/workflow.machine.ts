/**
 * Máquina de F12 (§5) con XState v5. Avanza por EVIDENCIA, nunca por un botón «Siguiente»: las transiciones `always`
 * encadenan las etapas cumplidas (preparar y purgar → calibrar → variar caudal → introducir pérdidas → comparar →
 * informe).
 */
import { assign, setup } from 'xstate';
import type { F12StageFlags } from './evidence';

export interface F12WorkflowContext {
  flags: Partial<F12StageFlags>;
}

export type F12WorkflowEvent =
  | { type: 'START' }
  | { type: 'PPE_CONFIRMED' }
  | { type: 'EVIDENCE'; flags: F12StageFlags }
  | { type: 'SUBMIT' }
  | { type: 'CONFIRM' }
  | { type: 'CANCEL' };

const f = (ctx: F12WorkflowContext, k: keyof F12StageFlags) => !!ctx.flags[k];

export const practiceF12Machine = setup({
  types: { context: {} as F12WorkflowContext, events: {} as F12WorkflowEvent },
  guards: {
    prepared: ({ context: c }) => f(c, 'instrumentsInspected') && f(c, 'circuitReady'),
    calibrated: ({ context: c }) => f(c, 'calibrated'),
    flow: ({ context: c }) => f(c, 'flowSeries') && f(c, 'volumetric'),
    losses: ({ context: c }) => f(c, 'lossSeries'),
    compare: ({ context: c }) => f(c, 'tables') && f(c, 'calculations') && f(c, 'contrast') && f(c, 'stationClosed'),
    report: ({ context: c }) => f(c, 'reflection'),
  },
  actions: {
    storeFlags: assign({ flags: ({ event }) => (event.type === 'EVIDENCE' ? event.flags : {}) }),
  },
}).createMachine({
  id: 'practiceF12',
  initial: 'INTRO',
  context: { flags: {} },
  states: {
    INTRO: { on: { START: 'PPE_CHECK' } },
    PPE_CHECK: { on: { PPE_CONFIRMED: 'LAB' } },
    LAB: {
      initial: 'PREPARE',
      on: { EVIDENCE: { actions: 'storeFlags' }, SUBMIT: 'SUBMISSION' },
      states: {
        PREPARE: { always: { target: 'CALIBRATE', guard: 'prepared' } },
        CALIBRATE: { always: { target: 'FLOW', guard: 'calibrated' } },
        FLOW: { always: { target: 'LOSSES', guard: 'flow' } },
        LOSSES: { always: { target: 'COMPARE', guard: 'losses' } },
        COMPARE: { always: { target: 'REPORT', guard: 'compare' } },
        REPORT: { always: { target: 'COMPLETE', guard: 'report' } },
        COMPLETE: {},
        hist: { type: 'history', history: 'shallow' },
      },
    },
    SUBMISSION: { on: { CONFIRM: 'REVIEW', CANCEL: 'LAB.hist' } },
    REVIEW: { type: 'final' },
  },
});

export const F12_STAGE_ORDER = ['PREPARE', 'CALIBRATE', 'FLOW', 'LOSSES', 'COMPARE', 'REPORT', 'COMPLETE'] as const;

export function f12StageName(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'LAB' in value) return String((value as { LAB: string }).LAB);
  return 'INTRO';
}
