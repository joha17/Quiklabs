/**
 * Máquina general de la práctica (§13) con XState v5.
 * Avanza por EVIDENCIA (no por botones «Siguiente») y acepta cualquier orden seguro equivalente:
 * si varias etapas ya están cumplidas, las transiciones `always` encadenan el avance.
 */
import { assign, setup } from 'xstate';
import type { StageFlags } from './evidence';

export interface WorkflowContext {
  flags: Partial<StageFlags>;
}

export type WorkflowEvent =
  | { type: 'START' }
  | { type: 'PPE_CONFIRMED' }
  | { type: 'EVIDENCE'; flags: StageFlags }
  | { type: 'SUBMIT' }
  | { type: 'CONFIRM' }
  | { type: 'CANCEL' };

const has = (k: keyof StageFlags) => ({ context }: { context: WorkflowContext }) => !!context.flags[k];

export const practiceMachine = setup({
  types: { context: {} as WorkflowContext, events: {} as WorkflowEvent },
  guards: {
    aSetupDone: has('aSetupDone'),
    aSamplesDone: has('aSamplesDone'),
    aSolubilityDone: has('aSolubilityDone'),
    aRecorded: has('aRecorded'),
    bPrepared: has('bPrepared'),
    bHeated: has('bHeated'),
    bFiltered: has('bFiltered'),
    bSplit: has('bSplit'),
    bEvaporated: has('bEvaporated'),
    bCrystallized: has('bCrystallized'),
  },
  actions: {
    storeFlags: assign({ flags: ({ event }) => (event.type === 'EVIDENCE' ? event.flags : {}) }),
  },
}).createMachine({
  id: 'practice02',
  initial: 'INTRO',
  context: { flags: {} },
  states: {
    INTRO: { on: { START: 'PPE_CHECK' } },
    PPE_CHECK: { on: { PPE_CONFIRMED: 'LAB' } },
    LAB: {
      initial: 'PART_A_SETUP',
      on: {
        EVIDENCE: { actions: 'storeFlags' },
        SUBMIT: 'SUBMISSION',
      },
      states: {
        PART_A_SETUP: { always: { target: 'PART_A_OBSERVATION', guard: 'aSetupDone' } },
        PART_A_OBSERVATION: { always: { target: 'PART_A_SOLUBILITY', guard: 'aSamplesDone' } },
        PART_A_SOLUBILITY: { always: { target: 'PART_A_REVIEW', guard: 'aSolubilityDone' } },
        PART_A_REVIEW: { always: { target: 'PART_B_PREPARATION', guard: 'aRecorded' } },
        PART_B_PREPARATION: { always: { target: 'PART_B_HEATING', guard: 'bPrepared' } },
        PART_B_HEATING: { always: { target: 'PART_B_FILTRATION', guard: 'bHeated' } },
        PART_B_FILTRATION: { always: { target: 'PART_B_SPLIT_FILTRATE', guard: 'bFiltered' } },
        PART_B_SPLIT_FILTRATE: { always: { target: 'PART_B_EVAPORATION', guard: 'bSplit' } },
        PART_B_EVAPORATION: { always: { target: 'PART_B_CRYSTALLIZATION', guard: 'bEvaporated' } },
        PART_B_CRYSTALLIZATION: { always: { target: 'NOTEBOOK_COMPLETION', guard: 'bCrystallized' } },
        NOTEBOOK_COMPLETION: {},
        hist: { type: 'history', history: 'shallow' },
      },
    },
    SUBMISSION: { on: { CONFIRM: 'REVIEW', CANCEL: 'LAB.hist' } },
    REVIEW: { type: 'final' },
  },
});

export const STAGE_ORDER = [
  'PART_A_SETUP', 'PART_A_OBSERVATION', 'PART_A_SOLUBILITY', 'PART_A_REVIEW', 'PART_B_PREPARATION', 'PART_B_HEATING',
  'PART_B_FILTRATION', 'PART_B_SPLIT_FILTRATE', 'PART_B_EVAPORATION', 'PART_B_CRYSTALLIZATION', 'NOTEBOOK_COMPLETION',
] as const;

/** Nombre plano de la etapa a partir del valor del estado. */
export function stageName(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'LAB' in value) return String((value as { LAB: string }).LAB);
  return 'INTRO';
}
