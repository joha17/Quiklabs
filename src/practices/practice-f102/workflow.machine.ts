/**
 * Máquina de F102 (§5) con XState v5. Avanza por EVIDENCIA, nunca por un botón «Siguiente»: las transiciones `always`
 * encadenan las etapas cumplidas (calibrar → MRU → MRUA → caída → análisis → informe).
 */
import { assign, setup } from 'xstate';
import type { F102StageFlags } from './evidence';

export interface F102WorkflowContext {
  flags: Partial<F102StageFlags>;
}

export type F102WorkflowEvent =
  | { type: 'START' }
  | { type: 'PPE_CONFIRMED' }
  | { type: 'EVIDENCE'; flags: F102StageFlags }
  | { type: 'SUBMIT' }
  | { type: 'CONFIRM' }
  | { type: 'CANCEL' };

const f = (ctx: F102WorkflowContext, k: keyof F102StageFlags) => !!ctx.flags[k];

export const practiceF102Machine = setup({
  types: { context: {} as F102WorkflowContext, events: {} as F102WorkflowEvent },
  guards: {
    calibrate: ({ context: c }) => f(c, 'instrumentsInspected') && f(c, 'inclinometerZeroed') && f(c, 'trackLevel') && f(c, 'gatesReady') && f(c, 'setupMeasured'),
    uniform: ({ context: c }) => f(c, 'uniformRuns'),
    accelerated: ({ context: c }) => f(c, 'accelRuns'),
    fall: ({ context: c }) => f(c, 'fallRuns') && f(c, 'dragRuns'),
    analysis: ({ context: c }) => f(c, 'tables') && f(c, 'calculations') && f(c, 'contrast') && f(c, 'stationClosed'),
    report: ({ context: c }) => f(c, 'reflection'),
  },
  actions: {
    storeFlags: assign({ flags: ({ event }) => (event.type === 'EVIDENCE' ? event.flags : {}) }),
  },
}).createMachine({
  id: 'practiceF102',
  initial: 'INTRO',
  context: { flags: {} },
  states: {
    INTRO: { on: { START: 'PPE_CHECK' } },
    PPE_CHECK: { on: { PPE_CONFIRMED: 'LAB' } },
    LAB: {
      initial: 'CALIBRATE',
      on: { EVIDENCE: { actions: 'storeFlags' }, SUBMIT: 'SUBMISSION' },
      states: {
        CALIBRATE: { always: { target: 'UNIFORM', guard: 'calibrate' } },
        UNIFORM: { always: { target: 'ACCELERATED', guard: 'uniform' } },
        ACCELERATED: { always: { target: 'FALL', guard: 'accelerated' } },
        FALL: { always: { target: 'ANALYSIS', guard: 'fall' } },
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

export const F102_STAGE_ORDER = ['CALIBRATE', 'UNIFORM', 'ACCELERATED', 'FALL', 'ANALYSIS', 'REPORT', 'COMPLETE'] as const;

export function f102StageName(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'LAB' in value) return String((value as { LAB: string }).LAB);
  return 'INTRO';
}
