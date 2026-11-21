/**
 * Máquina de F11 (§5) con XState v5. Avanza por EVIDENCIA, nunca por un botón «Siguiente»: las transiciones `always`
 * encadenan las etapas cumplidas (calibrar el tanque → explorar la profundidad → comparar densidades → observar el
 * empuje → ensayar la flotación → comparar → informe).
 */
import { assign, setup } from 'xstate';
import type { F11StageFlags } from './evidence';

export interface F11WorkflowContext {
  flags: Partial<F11StageFlags>;
}

export type F11WorkflowEvent =
  | { type: 'START' }
  | { type: 'PPE_CONFIRMED' }
  | { type: 'EVIDENCE'; flags: F11StageFlags }
  | { type: 'SUBMIT' }
  | { type: 'CONFIRM' }
  | { type: 'CANCEL' };

const f = (ctx: F11WorkflowContext, k: keyof F11StageFlags) => !!ctx.flags[k];

export const practiceF11Machine = setup({
  types: { context: {} as F11WorkflowContext, events: {} as F11WorkflowEvent },
  guards: {
    calibrate: ({ context: c }) => f(c, 'instrumentsInspected') && f(c, 'tankFilled'),
    depth: ({ context: c }) => f(c, 'profileA'),
    densities: ({ context: c }) => f(c, 'profileB') && f(c, 'densityCyl'),
    buoyancy: ({ context: c }) => f(c, 'buoyancy'),
    flotation: ({ context: c }) => f(c, 'flotation'),
    compare: ({ context: c }) => f(c, 'tables') && f(c, 'calculations') && f(c, 'contrast') && f(c, 'stationClosed'),
    report: ({ context: c }) => f(c, 'reflection'),
  },
  actions: {
    storeFlags: assign({ flags: ({ event }) => (event.type === 'EVIDENCE' ? event.flags : {}) }),
  },
}).createMachine({
  id: 'practiceF11',
  initial: 'INTRO',
  context: { flags: {} },
  states: {
    INTRO: { on: { START: 'PPE_CHECK' } },
    PPE_CHECK: { on: { PPE_CONFIRMED: 'LAB' } },
    LAB: {
      initial: 'CALIBRATE',
      on: { EVIDENCE: { actions: 'storeFlags' }, SUBMIT: 'SUBMISSION' },
      states: {
        CALIBRATE: { always: { target: 'DEPTH', guard: 'calibrate' } },
        DEPTH: { always: { target: 'DENSITIES', guard: 'depth' } },
        DENSITIES: { always: { target: 'BUOYANCY', guard: 'densities' } },
        BUOYANCY: { always: { target: 'FLOTATION', guard: 'buoyancy' } },
        FLOTATION: { always: { target: 'COMPARE', guard: 'flotation' } },
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

export const F11_STAGE_ORDER = ['CALIBRATE', 'DEPTH', 'DENSITIES', 'BUOYANCY', 'FLOTATION', 'COMPARE', 'REPORT', 'COMPLETE'] as const;

export function f11StageName(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'LAB' in value) return String((value as { LAB: string }).LAB);
  return 'INTRO';
}
