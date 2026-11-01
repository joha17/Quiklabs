import { describe, expect, it } from 'vitest';
import es from '../../locales/es/practiceB10.json';
import { SIMULATED_ERRORS_B10, B10_SCENARIOS } from '../../practices/practice-b10/error-scenarios';
import { B10_STAGE_ORDER } from '../../practices/practice-b10/workflow.machine';
import { b10StageEvidence } from '../../practices/practice-b10/evidence';
import { evaluateB10 } from '../../practices/practice-b10/rubric';
import { emptyB10Notebook, QUESTIONS_B10 } from '../../practices/practice-b10/notebook';
import { ANIMAL_ASSETS } from '../../simulation/specimens/assets';
import { ANATOMY_MODELS } from '../../simulation/animal-world/catalog';
import { buildDemoScriptB10 } from '../../app/b10/demo/script';
import { idealAttemptB10, worldB10 } from '../helpersB10';

const get = (path: string): unknown => path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), es);
const has = (path: string) => typeof get(path) === 'string' || Array.isArray(get(path));

describe('B10 · textos', () => {
  it('no pisa las claves globales', () => {
    expect(Object.keys(es).sort()).toEqual(['b10', 'b10fb']);
  });
  it('cada código tiene retroalimentación y los rechazos propios tienen texto', () => {
    for (const e of SIMULATED_ERRORS_B10) expect(has(e.feedbackKey), e.feedbackKey).toBe(true);
    for (const c of ['MODEL_CLOSED', 'REGION_HIDDEN', 'STUDY_LOCKED', 'BAD_MODEL', 'BAD_REGION', 'BAD_MATERIAL', 'VIDEO_UNAVAILABLE', 'BAD_TARGET', 'NOT_OBSERVED']) expect(has(`b10.cmd.${c}`), c).toBe(true);
  });
  it('etapas, banderas, escenarios, preguntas y estructuras tienen texto', () => {
    for (const s of B10_STAGE_ORDER) expect(has(`b10.stage.${s}`), s).toBe(true);
    for (const s of B10_STAGE_ORDER.filter((x) => x !== 'COMPLETE')) expect(has(`b10.guide.${s}`), s).toBe(true);
    for (const f of Object.keys(b10StageEvidence(worldB10(), emptyB10Notebook()))) expect(has(`b10.flag.${f}`), f).toBe(true);
    for (const { id } of B10_SCENARIOS) expect(has(`b10.scenario.${id}`), id).toBe(true);
    for (const q of QUESTIONS_B10) expect(has(`b10.nb.f.analysis.${q}`), q).toBe(true);
    for (const m of ANATOMY_MODELS) for (const r of m.regions) expect(has(`b10.anat.${r.part}`), r.part).toBe(true);
    for (const a of Object.values(ANIMAL_ASSETS)) for (const an of a.annotations) expect(has(`b10.structure.${an.structureId}`), an.structureId).toBe(true);
  });
  it('los eventos propios del mundo tienen texto y la demo está completa', () => {
    for (const c of ['LABEL_UNREAD', 'MODEL_TO_MICROSCOPE', 'SLIDE_TO_STEREO', 'WRONG_INSTRUMENT', 'TRACK_AS_MODEL', 'WRONG_VIEW_LABEL', 'LABEL_CONFUSED', 'TRIAL_AND_ERROR', 'MODEL_CONFUSED', 'BEAK_CONFUSED', 'FOOT_CONFUSED', 'HORSE_COW', 'TRACK_BY_INTUITION', 'RELIEF_AS_COLOR', 'HOOF_DIGITIGRADE', 'DISCS_OVERCLAIM', 'ORGANELLES_UNRESOLVED', 'CNIDARIAN_LAYERS', 'STRUCTURE_INVENTED', 'STEREO_NOT_USED', 'MISSING_ASSET_UNREPORTED', 'SAMPLE_INVERTED', 'ASSET_REPORTED']) expect(has(`b10.ev.${c}`), c).toBe(true);
    for (const s of buildDemoScriptB10({ notebook: () => {}, edit: () => {} })) {
      expect(has(`b10.demo.steps.${s.key}.title`), s.key).toBe(true);
      expect(has(`b10.demo.steps.${s.key}.text`), s.key).toBe(true);
      expect(has(`b10.demo.ui.part${s.part}`), s.part).toBe(true);
    }
  });
  it('componentes, ítems y retroalimentación de la rúbrica tienen texto', () => {
    const { w, nb } = idealAttemptB10();
    const ev = evaluateB10(w, nb);
    for (const c of ev.components) {
      expect(has(`b10.comp.${c.id}`), c.id).toBe(true);
      for (const i of c.items) {
        expect(has(`b10.item.${i.key.replace('b10.', '')}`), i.key).toBe(true);
        if (i.feedbackKey) expect(has(i.feedbackKey), i.feedbackKey).toBe(true);
      }
    }
  });
});
