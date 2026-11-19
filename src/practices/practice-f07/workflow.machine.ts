/**
 * Máquina de F07 (§5) con XState v5. Avanza por EVIDENCIA, nunca por un botón «Siguiente»: las transiciones `always`
 * encadenan las etapas cumplidas (calibrar el movimiento → choque elástico → choque inelástico con velcro → centro
 * de masa → analizar y cerrar → informe).
 */
import { assign, setup } from 'xstate';
import type { F07StageFlags } from './evidence';

export interface F07WorkflowContext {
  flags: Partial<F07StageFlags>;
}

export type F07WorkflowEvent =
  | { type: 'START' }
  | { type: 'PPE_CONFIRMED' }
  | { type: 'EVIDENCE'; flags: F07StageFlags }
  | { type: 'SUBMIT' }
  | { type: 'CONFIRM' }
  | { type: 'CANCEL' };

const f = (ctx: F07WorkflowContext, k: keyof F07StageFlags) => !!ctx.flags[k];

export const practiceF07Machine = setup({
  types: { context: {} as F07WorkflowContext, events: {} as F07WorkflowEvent },
  guards: {
    calibrate: ({ context: c }) => f(c, 'instrumentsInspected') && f(c, 'cartsWeighed') && f(c, 'trackLeveled') && f(c, 'gatesReady') && f(c, 'sensorReady'),
    elastic: ({ context: c }) => f(c, 'elasticDone') && f(c, 'impulseMeasured'),
    stick: ({ context: c }) => f(c, 'stickDone'),
    center: ({ context: c }) => f(c, 'cmDone'),
    analyse: ({ context: c }) => f(c, 'tables') && f(c, 'calculations') && f(c, 'contrast') && f(c, 'stationClosed'),
    report: ({ context: c }) => f(c, 'reflection'),
  },
  actions: {
    storeFlags: assign({ flags: ({ event }) => (event.type === 'EVIDENCE' ? event.flags : {}) }),
  },
}).createMachine({
  id: 'practiceF07',
  initial: 'INTRO',
  context: { flags: {} },
  states: {
    INTRO: { on: { START: 'PPE_CHECK' } },
    PPE_CHECK: { on: { PPE_CONFIRMED: 'LAB' } },
    LAB: {
      initial: 'CALIBRATE',
      on: { EVIDENCE: { actions: 'storeFlags' }, SUBMIT: 'SUBMISSION' },
      states: {
        CALIBRATE: { always: { target: 'ELASTIC', guard: 'calibrate' } },
        ELASTIC: { always: { target: 'INELASTIC', guard: 'elastic' } },
        INELASTIC: { always: { target: 'CENTER', guard: 'stick' } },
        CENTER: { always: { target: 'ANALYSIS', guard: 'center' } },
        ANALYSIS: { always: { target: 'REPORT', guard: 'analyse' } },
        REPORT: { always: { target: 'COMPLETE', guard: 'report' } },
        COMPLETE: {},
        hist: { type: 'history', history: 'shallow' },
      },
    },
    SUBMISSION: { on: { CONFIRM: 'REVIEW', CANCEL: 'LAB.hist' } },
    REVIEW: { type: 'final' },
  },
});

export const F07_STAGE_ORDER = ['CALIBRATE', 'ELASTIC', 'INELASTIC', 'CENTER', 'ANALYSIS', 'REPORT', 'COMPLETE'] as const;

export function f07StageName(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'LAB' in value) return String((value as { LAB: string }).LAB);
  return 'INTRO';
}
