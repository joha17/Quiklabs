/**
 * Máquina de B04 (§6.7) con XState v5: avanza por EVIDENCIA con transiciones `always`, nunca por «Siguiente».
 * INTRO → PPE_CHECK → LAB.{CONTROLS, STARCH_PREPARATION, STARCH, PROTEINS, LIPIDS, REDUCING_SUGARS, DNA,
 * CATALASE_EXTRACT_PREPARATION, CATALASE, AMYLASE_SOLUTION_PREPARATION, AMYLASE, ADH_OPTIONAL, INTERPRETATION,
 * COMPLETE} → SUBMISSION → REVIEW. Las banderas fijadas permiten trabajar en otro orden; el ADN sin recurso se salta
 * (SKIPPED_BY_RESOURCE) y ADH solo entra si el docente habilitó el módulo.
 */
import { assign, setup } from 'xstate';
import type { B04StageFlags } from './evidence';

export interface B04WorkflowContext {
  flags: Partial<B04StageFlags>;
}

export type B04WorkflowEvent =
  | { type: 'START' }
  | { type: 'PPE_CONFIRMED' }
  | { type: 'EVIDENCE'; flags: B04StageFlags }
  | { type: 'SUBMIT' }
  | { type: 'CONFIRM' }
  | { type: 'CANCEL' };

const f = (ctx: B04WorkflowContext, k: keyof B04StageFlags) => !!ctx.flags[k];

export const practiceB04Machine = setup({
  types: { context: {} as B04WorkflowContext, events: {} as B04WorkflowEvent },
  guards: {
    controls: ({ context: c }) => f(c, 'ppe') && f(c, 'controlsReady'),
    starchPrep: ({ context: c }) => f(c, 'starchBatchReady'),
    starch: ({ context: c }) => f(c, 'iodineControlled'),
    proteins: ({ context: c }) => f(c, 'proteinsTested'),
    lipids: ({ context: c }) => f(c, 'lipidsCompared'),
    reducing: ({ context: c }) => f(c, 'reducingTested'),
    dna: ({ context: c }) => f(c, 'dnaObserved') || f(c, 'dnaSkipped'),
    catalasePrep: ({ context: c }) => f(c, 'catalaseSuspensionReady'),
    catalase: ({ context: c }) => f(c, 'catalaseCurve'),
    amylasePrep: ({ context: c }) => f(c, 'amylaseBatchReady'),
    amylaseToAdh: ({ context: c }) => f(c, 'amylaseContrasted') && f(c, 'adhEnabled'),
    amylaseToEnd: ({ context: c }) => f(c, 'amylaseContrasted') && !f(c, 'adhEnabled'),
    adh: ({ context: c }) => f(c, 'adhEvaluated'),
    interpretation: ({ context: c }) => f(c, 'safeParked') && f(c, 'benchRestored') && f(c, 'notebook'),
  },
  actions: {
    storeFlags: assign({ flags: ({ event }) => (event.type === 'EVIDENCE' ? event.flags : {}) }),
  },
}).createMachine({
  id: 'practiceB04',
  initial: 'INTRO',
  context: { flags: {} },
  states: {
    INTRO: { on: { START: 'PPE_CHECK' } },
    PPE_CHECK: { on: { PPE_CONFIRMED: 'LAB' } },
    LAB: {
      initial: 'CONTROLS',
      on: { EVIDENCE: { actions: 'storeFlags' }, SUBMIT: 'SUBMISSION' },
      states: {
        CONTROLS: { always: { target: 'STARCH_PREPARATION', guard: 'controls' } },
        STARCH_PREPARATION: { always: { target: 'STARCH', guard: 'starchPrep' } },
        STARCH: { always: { target: 'PROTEINS', guard: 'starch' } },
        PROTEINS: { always: { target: 'LIPIDS', guard: 'proteins' } },
        LIPIDS: { always: { target: 'REDUCING_SUGARS', guard: 'lipids' } },
        REDUCING_SUGARS: { always: { target: 'DNA', guard: 'reducing' } },
        DNA: { always: { target: 'CATALASE_EXTRACT_PREPARATION', guard: 'dna' } },
        CATALASE_EXTRACT_PREPARATION: { always: { target: 'CATALASE', guard: 'catalasePrep' } },
        CATALASE: { always: { target: 'AMYLASE_SOLUTION_PREPARATION', guard: 'catalase' } },
        AMYLASE_SOLUTION_PREPARATION: { always: { target: 'AMYLASE', guard: 'amylasePrep' } },
        AMYLASE: { always: [{ target: 'ADH_OPTIONAL', guard: 'amylaseToAdh' }, { target: 'INTERPRETATION', guard: 'amylaseToEnd' }] },
        ADH_OPTIONAL: { always: { target: 'INTERPRETATION', guard: 'adh' } },
        INTERPRETATION: { always: { target: 'COMPLETE', guard: 'interpretation' } },
        COMPLETE: {},
        hist: { type: 'history', history: 'shallow' },
      },
    },
    SUBMISSION: { on: { CONFIRM: 'REVIEW', CANCEL: 'LAB.hist' } },
    REVIEW: { type: 'final' },
  },
});

export const B04_STAGE_ORDER = [
  'CONTROLS', 'STARCH_PREPARATION', 'STARCH', 'PROTEINS', 'LIPIDS', 'REDUCING_SUGARS', 'DNA', 'CATALASE_EXTRACT_PREPARATION', 'CATALASE',
  'AMYLASE_SOLUTION_PREPARATION', 'AMYLASE', 'ADH_OPTIONAL', 'INTERPRETATION', 'COMPLETE',
] as const;

export { b01StageName as b04StageName } from '../practice-b01/workflow.machine';
