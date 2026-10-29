import { describe, expect, it } from 'vitest';
import es from '../../locales/es/practiceB06.json';
import { SIMULATED_ERRORS_B06, B06_SCENARIOS } from '../../practices/practice-b06/error-scenarios';
import { B06_STAGE_ORDER } from '../../practices/practice-b06/workflow.machine';
import { b06StageEvidence } from '../../practices/practice-b06/evidence';
import { evaluateB06 } from '../../practices/practice-b06/rubric';
import { emptyB06Notebook, QUESTIONS_B06 } from '../../practices/practice-b06/notebook';
import { DIV_MEDIA } from '../../simulation/specimens/thin-section';
import { DIV_SPECIMENS } from '../../simulation/div-world/types';
import { idealAttemptB06, worldB06 } from '../helpersB06';
import { DIV_ASSETS } from '../../simulation/specimens/assets';

const get = (path: string): unknown => path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), es);
const has = (path: string) => typeof get(path) === 'string' || Array.isArray(get(path));

describe('B06 · textos', () => {
  it('no pisa las claves globales de B01 (los JSON se fusionan por nivel superior)', () => {
    expect(Object.keys(es).sort()).toEqual(['b06', 'b06fb']);
  });

  it('cada código CEL tiene retroalimentación y los códigos de rechazo del mundo tienen texto', () => {
    for (const c of ['NO_IMMERSION_MODULE', 'NOT_EVALUABLE', 'UNCALIBRATED_SCALE', 'OBJECTIVE_UNAVAILABLE', 'NOT_VIEWING', 'NO_LIVE_SAMPLE', 'MIC_WET', 'LANCET_FORBIDDEN']) expect(has(`b06.cmd.${c}`), c).toBe(true);
    for (const e of SIMULATED_ERRORS_B06) expect(has(e.feedbackKey), e.feedbackKey).toBe(true);
  });

  it('etapas, banderas, escenarios, muestras, reactivos y preguntas tienen texto', () => {
    for (const s of B06_STAGE_ORDER) expect(has(`b06.stage.${s}`), s).toBe(true);
    for (const s of B06_STAGE_ORDER.filter((x) => x !== 'COMPLETE')) expect(has(`b06.guide.${s}`), s).toBe(true);
    for (const f of Object.keys(b06StageEvidence(worldB06(), emptyB06Notebook()))) expect(has(`b06.flag.${f}`), f).toBe(true);
    for (const { id } of B06_SCENARIOS) expect(has(`b06.scenario.${id}`), id).toBe(true);
    for (const k of [...DIV_SPECIMENS, 'cyano']) expect(has(`b06.specimen.${k}`), k).toBe(true);
    for (const r of ['water', ...DIV_MEDIA]) expect(has(`b06.reagent.${r}`), r).toBe(true);
    for (const q of QUESTIONS_B06) expect(has(`b06.nb.f.analysis.${q}`), q).toBe(true);
  });

  it('componentes, ítems y retroalimentación de la rúbrica tienen texto', () => {
    const { w, nb } = idealAttemptB06();
    const ev = evaluateB06(w, nb);
    for (const c of ev.components) {
      expect(has(`b06.comp.${c.id}`), c.id).toBe(true);
      for (const i of c.items) {
        expect(has(`b06.item.${i.key.replace('b06.', '')}`), i.key).toBe(true);
        if (i.feedbackKey) expect(has(i.feedbackKey), i.feedbackKey).toBe(true);
      }
    }
  });

  it('las estructuras que pueden aparecer en las capturas o marcarse tienen nombre', () => {
    const { w } = idealAttemptB06(2606, ['SC-BACT-IMMERSION', 'SC-BLOOD-DIFFERENTIAL']);
    for (const a of Object.values(DIV_ASSETS)) for (const an of a.annotations) expect(has(`b06.structure.${an.structureId}`), an.structureId).toBe(true);
    for (const s of ['nucleolus', 'eosinophil', 'basophil', 'monocyte']) expect(has(`b06.structure.${s}`), s).toBe(true);
    for (const o of Object.values(w.observations)) for (const s of o.visibleRegionIds) expect(has(`b06.structure.${s}`), s).toBe(true);
  });
});
