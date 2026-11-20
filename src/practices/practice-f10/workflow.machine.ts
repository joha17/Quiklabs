/**
 * Máquina de F10 (§5) con XState v5. Avanza por EVIDENCIA, nunca por un botón «Siguiente»: las transiciones `always`
 * encadenan las etapas cumplidas (pesar y montar → equilibrio → brazo de la carga → deformar la probeta → comparar →
 * informe).
 */
import { assign, setup } from 'xstate';
import type { F10StageFlags } from './evidence';

export interface F10WorkflowContext {
  flags: Partial<F10StageFlags>;
}

export type F10WorkflowEvent =
  | { type: 'START' }
  | { type: 'PPE_CONFIRMED' }
  | { type: 'EVIDENCE'; flags: F10StageFlags }
  | { type: 'SUBMIT' }
  | { type: 'CONFIRM' }
  | { type: 'CANCEL' };

const f = (ctx: F10WorkflowContext, k: keyof F10StageFlags) => !!ctx.flags[k];

export const practiceF10Machine = setup({
  types: { context: {} as F10WorkflowContext, events: {} as F10WorkflowEvent },
  guards: {
    weights: ({ context: c }) => f(c, 'instrumentsInspected') && f(c, 'weighed') && f(c, 'cgFound') && f(c, 'supportsReady'),
    equilibrium: ({ context: c }) => f(c, 'equilibriumDone'),
    arm: ({ context: c }) => f(c, 'armDone'),
    deform: ({ context: c }) => f(c, 'pressReady') && f(c, 'elasticDone') && f(c, 'plasticDone'),
    compare: ({ context: c }) => f(c, 'tables') && f(c, 'calculations') && f(c, 'contrast') && f(c, 'stationClosed'),
    report: ({ context: c }) => f(c, 'reflection'),
  },
  actions: {
    storeFlags: assign({ flags: ({ event }) => (event.type === 'EVIDENCE' ? event.flags : {}) }),
  },
}).createMachine({
  id: 'practiceF10',
  initial: 'INTRO',
  context: { flags: {} },
  states: {
    INTRO: { on: { START: 'PPE_CHECK' } },
    PPE_CHECK: { on: { PPE_CONFIRMED: 'LAB' } },
    LAB: {
      initial: 'WEIGHTS',
      on: { EVIDENCE: { actions: 'storeFlags' }, SUBMIT: 'SUBMISSION' },
      states: {
        WEIGHTS: { always: { target: 'EQUILIBRIUM', guard: 'weights' } },
        EQUILIBRIUM: { always: { target: 'ARM', guard: 'equilibrium' } },
        ARM: { always: { target: 'DEFORM', guard: 'arm' } },
        DEFORM: { always: { target: 'COMPARE', guard: 'deform' } },
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

export const F10_STAGE_ORDER = ['WEIGHTS', 'EQUILIBRIUM', 'ARM', 'DEFORM', 'COMPARE', 'REPORT', 'COMPLETE'] as const;

export function f10StageName(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'LAB' in value) return String((value as { LAB: string }).LAB);
  return 'INTRO';
}
