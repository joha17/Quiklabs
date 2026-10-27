import { describe, expect, it } from 'vitest';
import es from '../../locales/es/practiceB02.json';
import { SIMULATED_ERRORS_B02, B02_SCENARIOS } from '../../practices/practice-b02/error-scenarios';
import { B02_STAGE_ORDER } from '../../practices/practice-b02/workflow.machine';
import { b02StageEvidence } from '../../practices/practice-b02/evidence';
import { evaluateB02 } from '../../practices/practice-b02/rubric';
import { emptyB02Notebook, QUESTIONS_B02 } from '../../practices/practice-b02/notebook';
import { CELL_KINDS, STAINS } from '../../simulation/specimens/thin-section';
import { idealAttemptB02, worldB02 } from '../helpersB02';

const get = (path: string): unknown => path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), es);
const has = (path: string) => typeof get(path) === 'string' || Array.isArray(get(path));

describe('B02 · textos', () => {
  it('no pisa las claves globales de B01 (los JSON se fusionan por nivel superior)', () => {
    expect(Object.keys(es).sort()).toEqual(['b02', 'b02fb']);
  });

  it('cada código CEL tiene retroalimentación', () => {
    for (const e of SIMULATED_ERRORS_B02) expect(has(e.feedbackKey), e.feedbackKey).toBe(true);
  });

  it('etapas, banderas, escenarios, muestras, reactivos y preguntas tienen texto', () => {
    for (const s of B02_STAGE_ORDER) expect(has(`b02.stage.${s}`), s).toBe(true);
    for (const s of B02_STAGE_ORDER.filter((x) => x !== 'COMPLETE')) expect(has(`b02.guide.${s}`), s).toBe(true);
    for (const f of Object.keys(b02StageEvidence(worldB02(), emptyB02Notebook()))) expect(has(`b02.flag.${f}`), f).toBe(true);
    for (const { id } of B02_SCENARIOS) expect(has(`b02.scenario.${id}`), id).toBe(true);
    for (const k of CELL_KINDS) expect(has(`b02.specimen.${k}`), k).toBe(true);
    for (const r of ['water', ...STAINS]) expect(has(`b02.reagent.${r}`), r).toBe(true);
    for (const q of QUESTIONS_B02) expect(has(`b02.nb.f.analysis.${q}`), q).toBe(true);
  });

  it('componentes, ítems y retroalimentación de la rúbrica tienen texto', () => {
    const { w, nb } = idealAttemptB02();
    const ev = evaluateB02(w, nb);
    for (const c of ev.components) {
      expect(has(`b02.comp.${c.id}`), c.id).toBe(true);
      for (const i of c.items) {
        expect(has(`b02.item.${i.key.replace('b02.', '')}`), i.key).toBe(true);
        if (i.feedbackKey) expect(has(i.feedbackKey), i.feedbackKey).toBe(true);
      }
    }
  });

  it('las estructuras que pueden aparecer en las capturas tienen nombre', () => {
    const { w } = idealAttemptB02();
    for (const o of Object.values(w.observations)) for (const s of o.visibleRegionIds) expect(has(`b02.structure.${s}`), s).toBe(true);
  });
});
