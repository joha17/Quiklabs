/**
 * Máquina de la Práctica 6 (§24.1) con XState v5. Avanza por EVIDENCIA (nunca por botones «Siguiente»); las
 * transiciones `always` encadenan las etapas cumplidas. La máquina del calorímetro (§24.3) y la del objeto caliente
 * (§24.2) son estados derivados del dominio.
 */
import { assign, setup } from 'xstate';
import type { P6StageFlags } from './evidence';

export interface P6WorkflowContext {
  flags: Partial<P6StageFlags>;
}

export type P6WorkflowEvent =
  | { type: 'START' }
  | { type: 'PPE_CONFIRMED' }
  | { type: 'EVIDENCE'; flags: P6StageFlags }
  | { type: 'SUBMIT' }
  | { type: 'CONFIRM' }
  | { type: 'CANCEL' };

const has = (k: keyof P6StageFlags) => ({ context }: { context: P6WorkflowContext }) => !!context.flags[k];

export const practice6Machine = setup({
  types: { context: {} as P6WorkflowContext, events: {} as P6WorkflowEvent },
  guards: {
    inspected: has('inspected'),
    waterMass: has('waterMass'),
    calSetup: has('calSetup'),
    metalMass: has('metalMass'),
    bath: has('bath'),
    heating: has('heating'),
    transfer: has('transfer'),
    mixing: has('mixing'),
    peak: has('peak'),
    calculation: has('calculation'),
    unknownRepeat: has('unknownRepeat'),
    identification: has('identification'),
    bomb: has('bomb'),
    report: has('report'),
  },
  actions: {
    storeFlags: assign({ flags: ({ event }) => (event.type === 'EVIDENCE' ? event.flags : {}) }),
  },
}).createMachine({
  id: 'practice06',
  initial: 'INTRO',
  context: { flags: {} },
  states: {
    INTRO: { on: { START: 'PPE_CHECK' } },
    PPE_CHECK: { on: { PPE_CONFIRMED: 'LAB' } },
    LAB: {
      initial: 'INSTRUMENT_INSPECTION',
      on: { EVIDENCE: { actions: 'storeFlags' }, SUBMIT: 'SUBMISSION' },
      states: {
        INSTRUMENT_INSPECTION: { always: { target: 'WATER_MASS', guard: 'inspected' } },
        WATER_MASS: { always: { target: 'CALORIMETER_SETUP', guard: 'waterMass' } },
        CALORIMETER_SETUP: { always: { target: 'METAL_MASS', guard: 'calSetup' } },
        METAL_MASS: { always: { target: 'WATER_BATH', guard: 'metalMass' } },
        WATER_BATH: { always: { target: 'METAL_HEATING', guard: 'bath' } },
        METAL_HEATING: { always: { target: 'TRANSFER', guard: 'heating' } },
        TRANSFER: { always: { target: 'MIXING', guard: 'transfer' } },
        MIXING: { always: { target: 'PEAK_RECORDED', guard: 'mixing' } },
        PEAK_RECORDED: { always: { target: 'CALCULATION', guard: 'peak' } },
        CALCULATION: { always: { target: 'UNKNOWN_REPEAT', guard: 'calculation' } },
        UNKNOWN_REPEAT: { always: { target: 'IDENTIFICATION', guard: 'unknownRepeat' } },
        IDENTIFICATION: { always: { target: 'OPTIONAL_BOMB_MODULE', guard: 'identification' } },
        OPTIONAL_BOMB_MODULE: { always: { target: 'REPORT', guard: 'bomb' } },
        REPORT: { always: { target: 'COMPLETE', guard: 'report' } },
        COMPLETE: {},
        hist: { type: 'history', history: 'shallow' },
      },
    },
    SUBMISSION: { on: { CONFIRM: 'REVIEW', CANCEL: 'LAB.hist' } },
    REVIEW: { type: 'final' },
  },
});

export const P6_STAGE_ORDER = [
  'INSTRUMENT_INSPECTION', 'WATER_MASS', 'CALORIMETER_SETUP', 'METAL_MASS', 'WATER_BATH', 'METAL_HEATING', 'TRANSFER', 'MIXING', 'PEAK_RECORDED',
  'CALCULATION', 'UNKNOWN_REPEAT', 'IDENTIFICATION', 'OPTIONAL_BOMB_MODULE', 'REPORT', 'COMPLETE',
] as const;

export function p6StageName(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'LAB' in value) return String((value as { LAB: string }).LAB);
  return 'INTRO';
}
