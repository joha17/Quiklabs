import { describe, expect, it } from 'vitest';
import es from '../../locales/es/practiceB07.json';
import { SIMULATED_ERRORS_B07, B07_SCENARIOS } from '../../practices/practice-b07/error-scenarios';
import { B07_STAGE_ORDER } from '../../practices/practice-b07/workflow.machine';
import { b07StageEvidence } from '../../practices/practice-b07/evidence';
import { evaluateB07 } from '../../practices/practice-b07/rubric';
import { emptyB07Notebook, QUESTIONS_B07 } from '../../practices/practice-b07/notebook';
import { fillNotebookB07, idealRouteB07, worldB07 } from '../helpersB07';
import { MICRO_ASSETS } from '../../simulation/specimens/assets';

const get = (path: string): unknown => path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), es);
const has = (path: string) => typeof get(path) === 'string' || Array.isArray(get(path));

describe('B07 · textos', () => {
  it('no pisa las claves globales', () => {
    expect(Object.keys(es).sort()).toEqual(['b07', 'b07fb']);
  });
  it('cada código tiene retroalimentación y los rechazos tienen texto', () => {
    for (const e of SIMULATED_ERRORS_B07) expect(has(e.feedbackKey), e.feedbackKey).toBe(true);
    for (const c of ['UNCALIBRATED_SCALE', 'RESTRICTED_PLATE', 'SEALED', 'FLAME_FORBIDDEN', 'NOT_ON_RACK', 'NOT_ON_PAD', 'LOOP_EMPTY', 'WRONG_WASTE', 'FOREIGN_MEASUREMENT', 'ASSET_SCOPE_DENIED']) expect(has(`b07.cmd.${c}`), c).toBe(true);
  });
  it('etapas, banderas, escenarios, preguntas y recursos tienen texto', () => {
    for (const s of B07_STAGE_ORDER) expect(has(`b07.stage.${s}`), s).toBe(true);
    for (const s of B07_STAGE_ORDER.filter((x) => x !== 'COMPLETE')) expect(has(`b07.guide.${s}`), s).toBe(true);
    for (const f of Object.keys(b07StageEvidence(worldB07(), emptyB07Notebook()))) expect(has(`b07.flag.${f}`), f).toBe(true);
    for (const { id } of B07_SCENARIOS) expect(has(`b07.scenario.${id}`), id).toBe(true);
    for (const q of QUESTIONS_B07) expect(has(`b07.nb.f.analysis.${q}`), q).toBe(true);
    for (const a of Object.values(MICRO_ASSETS)) for (const an of a.annotations) expect(has(`b07.structure.${an.structureId}`), an.structureId).toBe(true);
  });
  it('componentes, ítems y retroalimentación de la rúbrica tienen texto', () => {
    const out = idealRouteB07(worldB07());
    const ev = evaluateB07(out.w, fillNotebookB07(out));
    for (const c of ev.components) {
      expect(has(`b07.comp.${c.id}`), c.id).toBe(true);
      for (const i of c.items) {
        expect(has(`b07.item.${i.key.replace('b07.', '')}`), i.key).toBe(true);
        if (i.feedbackKey) expect(has(i.feedbackKey), i.feedbackKey).toBe(true);
      }
    }
  });
});
