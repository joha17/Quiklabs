import { describe, expect, it } from 'vitest';
import es from '../../locales/es/practiceB09.json';
import { SIMULATED_ERRORS_B09, B09_SCENARIOS } from '../../practices/practice-b09/error-scenarios';
import { B09_STAGE_ORDER } from '../../practices/practice-b09/workflow.machine';
import { b09StageEvidence } from '../../practices/practice-b09/evidence';
import { evaluateB09 } from '../../practices/practice-b09/rubric';
import { emptyB09Notebook, QUESTIONS_B09 } from '../../practices/practice-b09/notebook';
import { PLANT_ASSETS } from '../../simulation/specimens/assets';
import { buildDemoScriptB09 } from '../../app/b09/demo/script';
import { idealAttemptB09, worldB09 } from '../helpersB09';

const get = (path: string): unknown => path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), es);
const has = (path: string) => typeof get(path) === 'string' || Array.isArray(get(path));

describe('B09 · textos', () => {
  it('no pisa las claves globales', () => {
    expect(Object.keys(es).sort()).toEqual(['b09', 'b09fb']);
  });
  it('cada código tiene retroalimentación y los rechazos propios tienen texto', () => {
    for (const e of SIMULATED_ERRORS_B09) expect(has(e.feedbackKey), e.feedbackKey).toBe(true);
    for (const c of ['ACID_ZONE', 'BLADE_HAND', 'TRANSPORT_GRIP', 'NOT_OBSERVED', 'BAD_AREA', 'BAD_REGION', 'FIXED_SLIDE']) expect(has(`b09.cmd.${c}`), c).toBe(true);
  });
  it('etapas, banderas, escenarios, preguntas y estructuras tienen texto', () => {
    for (const s of B09_STAGE_ORDER) expect(has(`b09.stage.${s}`), s).toBe(true);
    for (const s of B09_STAGE_ORDER.filter((x) => x !== 'COMPLETE')) expect(has(`b09.guide.${s}`), s).toBe(true);
    for (const f of Object.keys(b09StageEvidence(worldB09(), emptyB09Notebook()))) expect(has(`b09.flag.${f}`), f).toBe(true);
    for (const { id } of B09_SCENARIOS) expect(has(`b09.scenario.${id}`), id).toBe(true);
    for (const q of QUESTIONS_B09) expect(has(`b09.nb.f.analysis.${q}`), q).toBe(true);
    for (const a of Object.values(PLANT_ASSETS)) for (const an of a.annotations) expect(has(`b09.structure.${an.structureId}`), an.structureId).toBe(true);
  });
  it('los eventos propios del mundo tienen texto y la demo está completa', () => {
    for (const c of ['SECTION_CUT', 'ACID_OUTSIDE_ZONE', 'WRONG_PLANE', 'STAIN_MISMATCH', 'GLASS_IN_TRASH', 'DOUBLE_LAYER', 'SECTION_DRY', 'COVER_PRESSED']) expect(has(`b09.ev.${c}`), c).toBe(true);
    for (const s of buildDemoScriptB09({ notebook: () => {}, edit: () => {} })) {
      expect(has(`b09.demo.steps.${s.key}.title`), s.key).toBe(true);
      expect(has(`b09.demo.steps.${s.key}.text`), s.key).toBe(true);
      expect(has(`b09.demo.ui.part${s.part}`), s.part).toBe(true);
    }
  });
  it('componentes, ítems y retroalimentación de la rúbrica tienen texto', () => {
    const { w, nb } = idealAttemptB09();
    const ev = evaluateB09(w, nb);
    for (const c of ev.components) {
      expect(has(`b09.comp.${c.id}`), c.id).toBe(true);
      for (const i of c.items) {
        expect(has(`b09.item.${i.key.replace('b09.', '')}`), i.key).toBe(true);
        if (i.feedbackKey) expect(has(i.feedbackKey), i.feedbackKey).toBe(true);
      }
    }
  });
});
