/**
 * Máquina de la Práctica 1 (§5) con XState v5. Avanza por EVIDENCIA, nunca por un botón «Siguiente»: las
 * transiciones `always` encadenan las etapas cumplidas, así que el orden B→C→D puede variar sin romper nada.
 */
import { assign, setup } from 'xstate';
import type { P01StageFlags } from './evidence';

export interface P01WorkflowContext {
  flags: Partial<P01StageFlags>;
}

export type P01WorkflowEvent =
  | { type: 'START' }
  | { type: 'PPE_CONFIRMED' }
  | { type: 'EVIDENCE'; flags: P01StageFlags }
  | { type: 'SUBMIT' }
  | { type: 'CONFIRM' }
  | { type: 'CANCEL' };

const f = (ctx: P01WorkflowContext, k: keyof P01StageFlags) => !!ctx.flags[k];

export const practice01Machine = setup({
  types: { context: {} as P01WorkflowContext, events: {} as P01WorkflowEvent },
  guards: {
    recognition: ({ context: c }) => f(c, 'identifiedInstruments') && f(c, 'scaleCompared') && f(c, 'balanceChecked'),
    water: ({ context: c }) => f(c, 'waterAmbientSampled') && f(c, 'waterColdSampled') && f(c, 'twoMassReadings') && f(c, 'twoThermometerReadings') && f(c, 'waterTableComplete'),
    displacement: ({ context: c }) => f(c, 'nailsNetMass') && f(c, 'initialLevelRead') && f(c, 'nailsSubmerged') && f(c, 'finalLevelRead') && f(c, 'displacementAnalysis'),
    geometry: ({ context: c }) => f(c, 'watchGlassMass') && f(c, 'cylinderCombinedMass') && f(c, 'caliperDiameterRepeats') && f(c, 'caliperHeightRepeats') && f(c, 'cylinderDensity'),
    analysis: ({ context: c }) => f(c, 'allRequiredTables') && f(c, 'calculationsPresent'),
    report: ({ context: c }) => f(c, 'reflectionRecorded'),
  },
  actions: {
    storeFlags: assign({ flags: ({ event }) => (event.type === 'EVIDENCE' ? event.flags : {}) }),
  },
}).createMachine({
  id: 'practice01',
  initial: 'INTRO',
  context: { flags: {} },
  states: {
    INTRO: { on: { START: 'PPE_CHECK' } },
    PPE_CHECK: { on: { PPE_CONFIRMED: 'LAB' } },
    LAB: {
      initial: 'RECOGNITION',
      on: { EVIDENCE: { actions: 'storeFlags' }, SUBMIT: 'SUBMISSION' },
      states: {
        RECOGNITION: { always: { target: 'WATER', guard: 'recognition' } },
        WATER: { always: { target: 'DISPLACEMENT', guard: 'water' } },
        DISPLACEMENT: { always: { target: 'GEOMETRY', guard: 'displacement' } },
        GEOMETRY: { always: { target: 'ANALYSIS', guard: 'geometry' } },
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

export const P01_STAGE_ORDER = ['RECOGNITION', 'WATER', 'DISPLACEMENT', 'GEOMETRY', 'ANALYSIS', 'REPORT', 'COMPLETE'] as const;

export function p01StageName(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'LAB' in value) return String((value as { LAB: string }).LAB);
  return 'INTRO';
}
