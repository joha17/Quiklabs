/**
 * Máquina de F05 (§5) con XState v5. Avanza por EVIDENCIA, nunca por un botón «Siguiente»: las transiciones `always`
 * encadenan las etapas cumplidas (materiales y montaje → roce estático → roce cinético → plano inclinado → análisis →
 * informe).
 */
import { assign, setup } from 'xstate';
import type { F05StageFlags } from './evidence';

export interface F05WorkflowContext {
  flags: Partial<F05StageFlags>;
}

export type F05WorkflowEvent =
  | { type: 'START' }
  | { type: 'PPE_CONFIRMED' }
  | { type: 'EVIDENCE'; flags: F05StageFlags }
  | { type: 'SUBMIT' }
  | { type: 'CONFIRM' }
  | { type: 'CANCEL' };

const f = (ctx: F05WorkflowContext, k: keyof F05StageFlags) => !!ctx.flags[k];

export const practiceF05Machine = setup({
  types: { context: {} as F05WorkflowContext, events: {} as F05WorkflowEvent },
  guards: {
    materials: ({ context: c }) => f(c, 'instrumentsInspected') && f(c, 'massesWeighed') && f(c, 'fbdDone') && f(c, 'sensorReady') && f(c, 'cableAligned'),
    static: ({ context: c }) => f(c, 'staticRuns'),
    kinetic: ({ context: c }) => f(c, 'kineticRuns') && f(c, 'loadSweep'),
    incline: ({ context: c }) => f(c, 'criticalAngles') && f(c, 'gatesRead') && f(c, 'slideDone'),
    analysis: ({ context: c }) => f(c, 'tables') && f(c, 'calculations') && f(c, 'contrast') && f(c, 'stationClosed'),
    report: ({ context: c }) => f(c, 'reflection'),
  },
  actions: {
    storeFlags: assign({ flags: ({ event }) => (event.type === 'EVIDENCE' ? event.flags : {}) }),
  },
}).createMachine({
  id: 'practiceF05',
  initial: 'INTRO',
  context: { flags: {} },
  states: {
    INTRO: { on: { START: 'PPE_CHECK' } },
    PPE_CHECK: { on: { PPE_CONFIRMED: 'LAB' } },
    LAB: {
      initial: 'MATERIALS',
      on: { EVIDENCE: { actions: 'storeFlags' }, SUBMIT: 'SUBMISSION' },
      states: {
        MATERIALS: { always: { target: 'STATIC', guard: 'materials' } },
        STATIC: { always: { target: 'KINETIC', guard: 'static' } },
        KINETIC: { always: { target: 'INCLINE', guard: 'kinetic' } },
        INCLINE: { always: { target: 'ANALYSIS', guard: 'incline' } },
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

export const F05_STAGE_ORDER = ['MATERIALS', 'STATIC', 'KINETIC', 'INCLINE', 'ANALYSIS', 'REPORT', 'COMPLETE'] as const;

export function f05StageName(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'LAB' in value) return String((value as { LAB: string }).LAB);
  return 'INTRO';
}
