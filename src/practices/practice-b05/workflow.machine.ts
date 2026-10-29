/**
 * Máquina de B05 (§6.7) con XState v5: avanza por EVIDENCIA con transiciones `always`, nunca por «Siguiente».
 * INTRO → PPE_CHECK → LAB.{SETUP, PREP, CONTROLS, CATALASE, FACTORS, AMY_SETUP, AMY_ASSAYS, MICRO, ADH, ANALYSIS,
 * COMPLETE} → SUBMISSION → REVIEW. Las banderas fijadas permiten trabajar las estaciones en cualquier orden (la amilasa
 * incuba mientras se mide la catalasa).
 */
import { assign, setup } from 'xstate';
import type { B05StageFlags } from './evidence';

export interface B05WorkflowContext {
  flags: Partial<B05StageFlags>;
}

export type B05WorkflowEvent =
  | { type: 'START' }
  | { type: 'PPE_CONFIRMED' }
  | { type: 'EVIDENCE'; flags: B05StageFlags }
  | { type: 'SUBMIT' }
  | { type: 'CONFIRM' }
  | { type: 'CANCEL' };

const f = (ctx: B05WorkflowContext, k: keyof B05StageFlags) => !!ctx.flags[k];

export const practiceB05Machine = setup({
  types: { context: {} as B05WorkflowContext, events: {} as B05WorkflowEvent },
  guards: {
    setup: ({ context: c }) => f(c, 'ppe') && f(c, 'hypothesis'),
    prep: ({ context: c }) => f(c, 'starch_batch_ready') && f(c, 'catalase_suspension_ready') && f(c, 'amylase_batch_ready'),
    controls: ({ context: c }) => f(c, 'controls'),
    catalase: ({ context: c }) => f(c, 'cat_baseline'),
    factors: ({ context: c }) => f(c, 'cat_factors'),
    amySetup: ({ context: c }) => f(c, 'amy_setup'),
    amyAssays: ({ context: c }) => f(c, 'amy_assays'),
    micro: ({ context: c }) => f(c, 'micro'),
    adh: ({ context: c }) => f(c, 'adh_evidence'),
    analysis: ({ context: c }) => f(c, 'safeParked') && f(c, 'benchRestored') && f(c, 'notebook'),
  },
  actions: {
    storeFlags: assign({ flags: ({ event }) => (event.type === 'EVIDENCE' ? event.flags : {}) }),
  },
}).createMachine({
  id: 'practiceB05',
  initial: 'INTRO',
  context: { flags: {} },
  states: {
    INTRO: { on: { START: 'PPE_CHECK' } },
    PPE_CHECK: { on: { PPE_CONFIRMED: 'LAB' } },
    LAB: {
      initial: 'SETUP',
      on: { EVIDENCE: { actions: 'storeFlags' }, SUBMIT: 'SUBMISSION' },
      states: {
        SETUP: { always: { target: 'PREP', guard: 'setup' } },
        PREP: { always: { target: 'CONTROLS', guard: 'prep' } },
        CONTROLS: { always: { target: 'CATALASE', guard: 'controls' } },
        CATALASE: { always: { target: 'FACTORS', guard: 'catalase' } },
        FACTORS: { always: { target: 'AMY_SETUP', guard: 'factors' } },
        AMY_SETUP: { always: { target: 'AMY_ASSAYS', guard: 'amySetup' } },
        AMY_ASSAYS: { always: { target: 'MICRO', guard: 'amyAssays' } },
        MICRO: { always: { target: 'ADH', guard: 'micro' } },
        ADH: { always: { target: 'ANALYSIS', guard: 'adh' } },
        ANALYSIS: { always: { target: 'COMPLETE', guard: 'analysis' } },
        COMPLETE: {},
        hist: { type: 'history', history: 'shallow' },
      },
    },
    SUBMISSION: { on: { CONFIRM: 'REVIEW', CANCEL: 'LAB.hist' } },
    REVIEW: { type: 'final' },
  },
});

export const B05_STAGE_ORDER = ['SETUP', 'PREP', 'CONTROLS', 'CATALASE', 'FACTORS', 'AMY_SETUP', 'AMY_ASSAYS', 'MICRO', 'ADH', 'ANALYSIS', 'COMPLETE'] as const;

export { b01StageName as b05StageName } from '../practice-b01/workflow.machine';
