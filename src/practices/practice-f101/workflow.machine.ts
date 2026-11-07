/**
 * Máquina de F101 (§5) con XState v5. Avanza por EVIDENCIA, nunca por un botón «Siguiente»: las transiciones `always`
 * encadenan las etapas cumplidas (stage:1…5:complete).
 */
import { assign, setup } from 'xstate';
import type { F101StageFlags } from './evidence';

export interface F101WorkflowContext {
  flags: Partial<F101StageFlags>;
}

export type F101WorkflowEvent =
  | { type: 'START' }
  | { type: 'PPE_CONFIRMED' }
  | { type: 'EVIDENCE'; flags: F101StageFlags }
  | { type: 'SUBMIT' }
  | { type: 'CONFIRM' }
  | { type: 'CANCEL' };

const f = (ctx: F101WorkflowContext, k: keyof F101StageFlags) => !!ctx.flags[k];

export const practiceF101Machine = setup({
  types: { context: {} as F101WorkflowContext, events: {} as F101WorkflowEvent },
  guards: {
    explore: ({ context: c }) => f(c, 'instrumentsInspected') && f(c, 'zerosChecked') && f(c, 'standardMeasured'),
    dimensions: ({ context: c }) => f(c, 'cylDiameterRepeats') && f(c, 'cylHeightRepeats') && f(c, 'ballDiameterRepeats'),
    massVolume: ({ context: c }) => f(c, 'balanceReady') && f(c, 'cylMass') && f(c, 'ballMass') && f(c, 'volumeInitial') && f(c, 'volumeFinal'),
    vectors: ({ context: c }) => f(c, 'equilibrium') && f(c, 'vectorTable'),
    analysis: ({ context: c }) => f(c, 'calculations') && f(c, 'contrast') && f(c, 'stationClosed'),
    report: ({ context: c }) => f(c, 'reflection'),
  },
  actions: {
    storeFlags: assign({ flags: ({ event }) => (event.type === 'EVIDENCE' ? event.flags : {}) }),
  },
}).createMachine({
  id: 'practiceF101',
  initial: 'INTRO',
  context: { flags: {} },
  states: {
    INTRO: { on: { START: 'PPE_CHECK' } },
    PPE_CHECK: { on: { PPE_CONFIRMED: 'LAB' } },
    LAB: {
      initial: 'EXPLORE',
      on: { EVIDENCE: { actions: 'storeFlags' }, SUBMIT: 'SUBMISSION' },
      states: {
        EXPLORE: { always: { target: 'DIMENSIONS', guard: 'explore' } },
        DIMENSIONS: { always: { target: 'MASS_VOLUME', guard: 'dimensions' } },
        MASS_VOLUME: { always: { target: 'VECTORS', guard: 'massVolume' } },
        VECTORS: { always: { target: 'ANALYSIS', guard: 'vectors' } },
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

export const F101_STAGE_ORDER = ['EXPLORE', 'DIMENSIONS', 'MASS_VOLUME', 'VECTORS', 'ANALYSIS', 'REPORT', 'COMPLETE'] as const;

export function f101StageName(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'LAB' in value) return String((value as { LAB: string }).LAB);
  return 'INTRO';
}
