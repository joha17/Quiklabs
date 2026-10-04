/**
 * Máquina de la Práctica 3 (§21.1) con XState v5. Avanza por EVIDENCIA y acepta cualquier orden seguro equivalente:
 * si varias etapas ya están cumplidas, las transiciones `always` encadenan el avance.
 * Las máquinas del encendido (§21.2) y del asa (§21.3) son estados derivados del dominio (`flameState`, `loop.phase`).
 */
import { assign, setup } from 'xstate';
import type { P3StageFlags } from './evidence';

export interface P3WorkflowContext {
  flags: Partial<P3StageFlags>;
}

export type P3WorkflowEvent =
  | { type: 'START' }
  | { type: 'PPE_CONFIRMED' }
  | { type: 'EVIDENCE'; flags: P3StageFlags }
  | { type: 'SUBMIT' }
  | { type: 'CONFIRM' }
  | { type: 'CANCEL' };

const has = (k: keyof P3StageFlags) => ({ context }: { context: P3WorkflowContext }) => !!context.flags[k];

export const practice3Machine = setup({
  types: { context: {} as P3WorkflowContext, events: {} as P3WorkflowEvent },
  guards: {
    safetyDone: has('safetyDone'),
    inspected: has('inspected'),
    partsDone: has('partsDone'),
    ignited: has('ignited'),
    yellowDone: has('yellowDone'),
    capsule1Done: has('capsule1Done'),
    blueDone: has('blueDone'),
    capsule2Done: has('capsule2Done'),
    cationSetup: has('cationSetup'),
    knownDone: has('knownDone'),
    mixDone: has('mixDone'),
    unknownDone: has('unknownDone'),
    shutdownDone: has('shutdownDone'),
  },
  actions: {
    storeFlags: assign({ flags: ({ event }) => (event.type === 'EVIDENCE' ? event.flags : {}) }),
  },
}).createMachine({
  id: 'practice03',
  initial: 'INTRO',
  context: { flags: {} },
  states: {
    INTRO: { on: { START: 'PPE_CHECK' } },
    PPE_CHECK: { on: { PPE_CONFIRMED: 'LAB' } },
    LAB: {
      initial: 'PPE_AND_SAFETY',
      on: {
        EVIDENCE: { actions: 'storeFlags' },
        SUBMIT: 'SUBMISSION',
      },
      states: {
        PPE_AND_SAFETY: { always: { target: 'BURNER_INSPECTION', guard: 'safetyDone' } },
        BURNER_INSPECTION: { always: { target: 'PARTS_IDENTIFICATION', guard: 'inspected' } },
        PARTS_IDENTIFICATION: { always: { target: 'IGNITION_SETUP', guard: 'partsDone' } },
        IGNITION_SETUP: { always: { target: 'YELLOW_FLAME', guard: 'ignited' } },
        YELLOW_FLAME: { always: { target: 'FIRST_CAPSULE_TEST', guard: 'yellowDone' } },
        FIRST_CAPSULE_TEST: { always: { target: 'BLUE_FLAME_ADJUSTMENT', guard: 'capsule1Done' } },
        BLUE_FLAME_ADJUSTMENT: { always: { target: 'SECOND_CAPSULE_TEST', guard: 'blueDone' } },
        SECOND_CAPSULE_TEST: { always: { target: 'CATION_SETUP', guard: 'capsule2Done' } },
        CATION_SETUP: { always: { target: 'KNOWN_CATION_TESTS', guard: 'cationSetup' } },
        KNOWN_CATION_TESTS: { always: { target: 'SODIUM_POTASSIUM_COMPARISON', guard: 'knownDone' } },
        SODIUM_POTASSIUM_COMPARISON: { always: { target: 'UNKNOWN_TEST', guard: 'mixDone' } },
        UNKNOWN_TEST: { always: { target: 'BURNER_SHUTDOWN', guard: 'unknownDone' } },
        BURNER_SHUTDOWN: { always: { target: 'NOTEBOOK', guard: 'shutdownDone' } },
        NOTEBOOK: {},
        hist: { type: 'history', history: 'shallow' },
      },
    },
    SUBMISSION: { on: { CONFIRM: 'REVIEW', CANCEL: 'LAB.hist' } },
    REVIEW: { type: 'final' },
  },
});

export const P3_STAGE_ORDER = [
  'PPE_AND_SAFETY', 'BURNER_INSPECTION', 'PARTS_IDENTIFICATION', 'IGNITION_SETUP', 'YELLOW_FLAME', 'FIRST_CAPSULE_TEST',
  'BLUE_FLAME_ADJUSTMENT', 'SECOND_CAPSULE_TEST', 'CATION_SETUP', 'KNOWN_CATION_TESTS', 'SODIUM_POTASSIUM_COMPARISON', 'UNKNOWN_TEST',
  'BURNER_SHUTDOWN', 'NOTEBOOK',
] as const;

export function p3StageName(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'LAB' in value) return String((value as { LAB: string }).LAB);
  return 'INTRO';
}
