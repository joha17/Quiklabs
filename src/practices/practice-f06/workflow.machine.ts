/**
 * Máquina de F06 (§5) con XState v5. Avanza por EVIDENCIA, nunca por un botón «Siguiente»: las transiciones `always`
 * encadenan las etapas cumplidas (materiales → calibrar resorte → almacenar energía → explorar alturas → observar
 * pérdidas → comprobar y cerrar → informe).
 */
import { assign, setup } from 'xstate';
import type { F06StageFlags } from './evidence';

export interface F06WorkflowContext {
  flags: Partial<F06StageFlags>;
}

export type F06WorkflowEvent =
  | { type: 'START' }
  | { type: 'PPE_CONFIRMED' }
  | { type: 'EVIDENCE'; flags: F06StageFlags }
  | { type: 'SUBMIT' }
  | { type: 'CONFIRM' }
  | { type: 'CANCEL' };

const f = (ctx: F06WorkflowContext, k: keyof F06StageFlags) => !!ctx.flags[k];

export const practiceF06Machine = setup({
  types: { context: {} as F06WorkflowContext, events: {} as F06WorkflowEvent },
  guards: {
    materials: ({ context: c }) => f(c, 'instrumentsInspected') && f(c, 'massesWeighed'),
    spring: ({ context: c }) => f(c, 'springCalibrated'),
    store: ({ context: c }) => f(c, 'springMounted') && f(c, 'sensorReady') && f(c, 'energyStored'),
    heights: ({ context: c }) => f(c, 'heightsExplored') && f(c, 'pendulumDone'),
    losses: ({ context: c }) => f(c, 'lossesObserved'),
    check: ({ context: c }) => f(c, 'tables') && f(c, 'calculations') && f(c, 'contrast') && f(c, 'stationClosed'),
    report: ({ context: c }) => f(c, 'reflection'),
  },
  actions: {
    storeFlags: assign({ flags: ({ event }) => (event.type === 'EVIDENCE' ? event.flags : {}) }),
  },
}).createMachine({
  id: 'practiceF06',
  initial: 'INTRO',
  context: { flags: {} },
  states: {
    INTRO: { on: { START: 'PPE_CHECK' } },
    PPE_CHECK: { on: { PPE_CONFIRMED: 'LAB' } },
    LAB: {
      initial: 'MATERIALS',
      on: { EVIDENCE: { actions: 'storeFlags' }, SUBMIT: 'SUBMISSION' },
      states: {
        MATERIALS: { always: { target: 'SPRING', guard: 'materials' } },
        SPRING: { always: { target: 'STORE', guard: 'spring' } },
        STORE: { always: { target: 'HEIGHTS', guard: 'store' } },
        HEIGHTS: { always: { target: 'LOSSES', guard: 'heights' } },
        LOSSES: { always: { target: 'CHECK', guard: 'losses' } },
        CHECK: { always: { target: 'REPORT', guard: 'check' } },
        REPORT: { always: { target: 'COMPLETE', guard: 'report' } },
        COMPLETE: {},
        hist: { type: 'history', history: 'shallow' },
      },
    },
    SUBMISSION: { on: { CONFIRM: 'REVIEW', CANCEL: 'LAB.hist' } },
    REVIEW: { type: 'final' },
  },
});

export const F06_STAGE_ORDER = ['MATERIALS', 'SPRING', 'STORE', 'HEIGHTS', 'LOSSES', 'CHECK', 'REPORT', 'COMPLETE'] as const;

export function f06StageName(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'LAB' in value) return String((value as { LAB: string }).LAB);
  return 'INTRO';
}
