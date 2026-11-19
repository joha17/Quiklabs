/**
 * Máquina de F08 (§5) con XState v5. Avanza por EVIDENCIA, nunca por un botón «Siguiente»: las transiciones `always`
 * encadenan las etapas cumplidas (montar el sólido → calibrar el encoder → aplicar torque → redistribuir masas →
 * analizar y cerrar → informe).
 */
import { assign, setup } from 'xstate';
import type { F08StageFlags } from './evidence';

export interface F08WorkflowContext {
  flags: Partial<F08StageFlags>;
}

export type F08WorkflowEvent =
  | { type: 'START' }
  | { type: 'PPE_CONFIRMED' }
  | { type: 'EVIDENCE'; flags: F08StageFlags }
  | { type: 'SUBMIT' }
  | { type: 'CONFIRM' }
  | { type: 'CANCEL' };

const f = (ctx: F08WorkflowContext, k: keyof F08StageFlags) => !!ctx.flags[k];

export const practiceF08Machine = setup({
  types: { context: {} as F08WorkflowContext, events: {} as F08WorkflowEvent },
  guards: {
    mount: ({ context: c }) => f(c, 'instrumentsInspected') && f(c, 'massesWeighed') && f(c, 'solidsMeasured') && f(c, 'supportReady'),
    encoder: ({ context: c }) => f(c, 'encoderReady') && f(c, 'sensorsReady'),
    torque: ({ context: c }) => f(c, 'axleDone') && f(c, 'diskDone') && f(c, 'tensionMeasured') && f(c, 'ringDone') && f(c, 'energyDone'),
    masses: ({ context: c }) => f(c, 'massesDone') && f(c, 'parallelDone'),
    analyse: ({ context: c }) => f(c, 'tables') && f(c, 'calculations') && f(c, 'contrast') && f(c, 'stationClosed'),
    report: ({ context: c }) => f(c, 'reflection'),
  },
  actions: {
    storeFlags: assign({ flags: ({ event }) => (event.type === 'EVIDENCE' ? event.flags : {}) }),
  },
}).createMachine({
  id: 'practiceF08',
  initial: 'INTRO',
  context: { flags: {} },
  states: {
    INTRO: { on: { START: 'PPE_CHECK' } },
    PPE_CHECK: { on: { PPE_CONFIRMED: 'LAB' } },
    LAB: {
      initial: 'MOUNT',
      on: { EVIDENCE: { actions: 'storeFlags' }, SUBMIT: 'SUBMISSION' },
      states: {
        MOUNT: { always: { target: 'ENCODER', guard: 'mount' } },
        ENCODER: { always: { target: 'TORQUE', guard: 'encoder' } },
        TORQUE: { always: { target: 'MASSES', guard: 'torque' } },
        MASSES: { always: { target: 'ANALYSIS', guard: 'masses' } },
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

export const F08_STAGE_ORDER = ['MOUNT', 'ENCODER', 'TORQUE', 'MASSES', 'ANALYSIS', 'REPORT', 'COMPLETE'] as const;

export function f08StageName(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'LAB' in value) return String((value as { LAB: string }).LAB);
  return 'INTRO';
}
