/**
 * Máquina de F09 (§5) con XState v5. Avanza por EVIDENCIA, nunca por un botón «Siguiente»: las transiciones `always`
 * encadenan las etapas cumplidas (preparar giro → medir fuerza centrípeta → aplicar torque → conservar momento →
 * concluir → informe).
 */
import { assign, setup } from 'xstate';
import type { F09StageFlags } from './evidence';

export interface F09WorkflowContext {
  flags: Partial<F09StageFlags>;
}

export type F09WorkflowEvent =
  | { type: 'START' }
  | { type: 'PPE_CONFIRMED' }
  | { type: 'EVIDENCE'; flags: F09StageFlags }
  | { type: 'SUBMIT' }
  | { type: 'CONFIRM' }
  | { type: 'CANCEL' };

const f = (ctx: F09WorkflowContext, k: keyof F09StageFlags) => !!ctx.flags[k];

export const practiceF09Machine = setup({
  types: { context: {} as F09WorkflowContext, events: {} as F09WorkflowEvent },
  guards: {
    prepare: ({ context: c }) => f(c, 'instrumentsInspected') && f(c, 'massesWeighed') && f(c, 'radiusMeasured') && f(c, 'supportReady') && f(c, 'sensorsReady'),
    centripetal: ({ context: c }) => f(c, 'circDone'),
    torque: ({ context: c }) => f(c, 'torqueDone'),
    momentum: ({ context: c }) => f(c, 'momentumDone'),
    analyse: ({ context: c }) => f(c, 'tables') && f(c, 'calculations') && f(c, 'contrast') && f(c, 'stationClosed'),
    report: ({ context: c }) => f(c, 'reflection'),
  },
  actions: {
    storeFlags: assign({ flags: ({ event }) => (event.type === 'EVIDENCE' ? event.flags : {}) }),
  },
}).createMachine({
  id: 'practiceF09',
  initial: 'INTRO',
  context: { flags: {} },
  states: {
    INTRO: { on: { START: 'PPE_CHECK' } },
    PPE_CHECK: { on: { PPE_CONFIRMED: 'LAB' } },
    LAB: {
      initial: 'PREPARE',
      on: { EVIDENCE: { actions: 'storeFlags' }, SUBMIT: 'SUBMISSION' },
      states: {
        PREPARE: { always: { target: 'CENTRIPETAL', guard: 'prepare' } },
        CENTRIPETAL: { always: { target: 'TORQUE', guard: 'centripetal' } },
        TORQUE: { always: { target: 'MOMENTUM', guard: 'torque' } },
        MOMENTUM: { always: { target: 'ANALYSIS', guard: 'momentum' } },
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

export const F09_STAGE_ORDER = ['PREPARE', 'CENTRIPETAL', 'TORQUE', 'MOMENTUM', 'ANALYSIS', 'REPORT', 'COMPLETE'] as const;

export function f09StageName(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'LAB' in value) return String((value as { LAB: string }).LAB);
  return 'INTRO';
}
