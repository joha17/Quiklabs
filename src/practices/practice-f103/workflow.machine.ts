/**
 * Máquina de F103 (§5) con XState v5. Avanza por EVIDENCIA, nunca por un botón «Siguiente»: las transiciones `always`
 * encadenan las etapas cumplidas (montaje → v₀ → ángulos → condiciones y trayectoria → análisis → informe).
 */
import { assign, setup } from 'xstate';
import type { F103StageFlags } from './evidence';

export interface F103WorkflowContext {
  flags: Partial<F103StageFlags>;
}

export type F103WorkflowEvent =
  | { type: 'START' }
  | { type: 'PPE_CONFIRMED' }
  | { type: 'EVIDENCE'; flags: F103StageFlags }
  | { type: 'SUBMIT' }
  | { type: 'CONFIRM' }
  | { type: 'CANCEL' };

const f = (ctx: F103WorkflowContext, k: keyof F103StageFlags) => !!ctx.flags[k];

export const practiceF103Machine = setup({
  types: { context: {} as F103WorkflowContext, events: {} as F103WorkflowEvent },
  guards: {
    setup: ({ context: c }) => f(c, 'instrumentsInspected') && f(c, 'standAnchored') && f(c, 'standLevel') && f(c, 'protractorZeroed') && f(c, 'setupMeasured'),
    velocity: ({ context: c }) => f(c, 'gateReady') && f(c, 'velocityRuns'),
    angles: ({ context: c }) => f(c, 'angleRuns'),
    conditions: ({ context: c }) => f(c, 'conditionRuns') && f(c, 'trajectoryRuns'),
    analysis: ({ context: c }) => f(c, 'tables') && f(c, 'calculations') && f(c, 'contrast') && f(c, 'stationClosed'),
    report: ({ context: c }) => f(c, 'reflection'),
  },
  actions: {
    storeFlags: assign({ flags: ({ event }) => (event.type === 'EVIDENCE' ? event.flags : {}) }),
  },
}).createMachine({
  id: 'practiceF103',
  initial: 'INTRO',
  context: { flags: {} },
  states: {
    INTRO: { on: { START: 'PPE_CHECK' } },
    PPE_CHECK: { on: { PPE_CONFIRMED: 'LAB' } },
    LAB: {
      initial: 'SETUP',
      on: { EVIDENCE: { actions: 'storeFlags' }, SUBMIT: 'SUBMISSION' },
      states: {
        SETUP: { always: { target: 'VELOCITY', guard: 'setup' } },
        VELOCITY: { always: { target: 'ANGLES', guard: 'velocity' } },
        ANGLES: { always: { target: 'CONDITIONS', guard: 'angles' } },
        CONDITIONS: { always: { target: 'ANALYSIS', guard: 'conditions' } },
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

export const F103_STAGE_ORDER = ['SETUP', 'VELOCITY', 'ANGLES', 'CONDITIONS', 'ANALYSIS', 'REPORT', 'COMPLETE'] as const;

export function f103StageName(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'LAB' in value) return String((value as { LAB: string }).LAB);
  return 'INTRO';
}
