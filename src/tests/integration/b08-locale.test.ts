import { describe, expect, it } from 'vitest';
import es from '../../locales/es/practiceB08.json';
import { SIMULATED_ERRORS_B08, B08_SCENARIOS } from '../../practices/practice-b08/error-scenarios';
import { B08_STAGE_ORDER } from '../../practices/practice-b08/workflow.machine';
import { b08StageEvidence } from '../../practices/practice-b08/evidence';
import { evaluateB08 } from '../../practices/practice-b08/rubric';
import { emptyB08Notebook, QUESTIONS_B08 } from '../../practices/practice-b08/notebook';
import { fillNotebookB08, idealRouteB08, worldB08 } from '../helpersB08';

const get = (path: string): unknown => path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), es);
const has = (path: string) => typeof get(path) === 'string' || Array.isArray(get(path));

describe('B08 · textos', () => {
  it('no pisa las claves globales', () => {
    expect(Object.keys(es).sort()).toEqual(['b08', 'b08fb']);
  });
  it('cada código tiene retroalimentación y los rechazos tienen texto', () => {
    for (const e of SIMULATED_ERRORS_B08) expect(has(e.feedbackKey), e.feedbackKey).toBe(true);
    for (const c of ['OUTSIDE_HOOD', 'GOGGLES', 'HOOD_OFF', 'FRONT_LOST', 'NOT_SEALED', 'CLIP_UNSECURED', 'WRONG_WASTE', 'FLAME_FORBIDDEN', 'RUN_ACTIVE', 'NOT_REMOVED', 'NO_SPRIG']) expect(has(`b08.cmd.${c}`), c).toBe(true);
  });
  it('etapas, banderas, escenarios, preguntas y recursos tienen texto', () => {
    for (const s of B08_STAGE_ORDER) expect(has(`b08.stage.${s}`), s).toBe(true);
    for (const s of B08_STAGE_ORDER.filter((x) => x !== 'COMPLETE')) expect(has(`b08.guide.${s}`), s).toBe(true);
    for (const f of Object.keys(b08StageEvidence(worldB08(), emptyB08Notebook()))) expect(has(`b08.flag.${f}`), f).toBe(true);
    for (const { id } of B08_SCENARIOS) expect(has(`b08.scenario.${id}`), id).toBe(true);
    for (const q of QUESTIONS_B08) expect(has(`b08.nb.f.analysis.${q}`), q).toBe(true);
  });
  it('componentes, ítems y retroalimentación de la rúbrica tienen texto', () => {
    const out = idealRouteB08(worldB08());
    const ev = evaluateB08(out.w, fillNotebookB08(out));
    for (const c of ev.components) {
      expect(has(`b08.comp.${c.id}`), c.id).toBe(true);
      for (const i of c.items) {
        expect(has(`b08.item.${i.key.replace('b08.', '')}`), i.key).toBe(true);
        if (i.feedbackKey) expect(has(i.feedbackKey), i.feedbackKey).toBe(true);
      }
    }
  });
});
