import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import es from '../../locales/es/practiceB03.json';
import es2 from '../../locales/es/practiceB02.json';
import { SIMULATED_ERRORS_B03, B03_SCENARIOS } from '../../practices/practice-b03/error-scenarios';
import { B03_STAGE_ORDER } from '../../practices/practice-b03/workflow.machine';
import { b03StageEvidence } from '../../practices/practice-b03/evidence';
import { evaluateB03 } from '../../practices/practice-b03/rubric';
import { emptyB03Notebook, QUESTIONS_B03 } from '../../practices/practice-b03/notebook';
import { TUBE_LABELS } from '../../simulation/perm-world/world';
import { idealAttemptB03, worldB03 } from '../helpersB03';
import { b03NameOf } from '../../app/b03/describe';

const all = { ...es2, ...es } as Record<string, unknown>;
const get = (path: string): unknown => path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), all);
const has = (path: string) => typeof get(path) === 'string' || Array.isArray(get(path));

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? sources(join(dir, d.name)) : /\.tsx?$/.test(d.name) ? [join(dir, d.name)] : []));
}

describe('B03 · textos', () => {
  it('no pisa las claves de otros laboratorios (los JSON se fusionan por nivel superior)', () => {
    expect(Object.keys(es).sort()).toEqual(['b03', 'b03fb']);
  });

  it('cada código PERM tiene retroalimentación', () => {
    for (const e of SIMULATED_ERRORS_B03) expect(has(e.feedbackKey), e.feedbackKey).toBe(true);
  });

  it('etapas, guías, banderas, escenarios, rótulos y preguntas tienen texto', () => {
    for (const s of B03_STAGE_ORDER) expect(has(`b03.stage.${s}`), s).toBe(true);
    for (const s of B03_STAGE_ORDER.filter((x) => x !== 'COMPLETE')) expect(has(`b03.guide.${s}`), s).toBe(true);
    for (const f of Object.keys(b03StageEvidence(worldB03(), emptyB03Notebook()))) expect(has(`b03.flag.${f}`), f).toBe(true);
    for (const { id } of B03_SCENARIOS) expect(has(`b03.scenario.${id}`), id).toBe(true);
    for (const l of TUBE_LABELS) expect(has(`b03.tubeLabel.${l}`), l).toBe(true);
    for (const q of QUESTIONS_B03) expect(has(`b03.nb.q.${q}`), q).toBe(true);
  });

  it('componentes, ítems y retroalimentación de la rúbrica tienen texto', () => {
    const { w, nb } = idealAttemptB03();
    const ev = evaluateB03(w, nb);
    for (const c of ev.components) {
      expect(has(`b03.comp.${c.id}`), c.id).toBe(true);
      for (const i of c.items) {
        expect(has(`b03.item.${i.key.replace('b03.', '')}`), i.key).toBe(true);
        if (i.feedbackKey) expect(has(i.feedbackKey), i.feedbackKey).toBe(true);
      }
    }
  });

  it('las lecturas del intento ideal tienen nombre de instrumento y calidad', () => {
    const { w } = idealAttemptB03();
    for (const r of Object.values(w.perm.readings)) {
      expect(has(`b03.instrument.${r.instrument}`), r.instrument).toBe(true);
      if (r.quality) expect(has(`b03.quality.${r.quality.replace(':', '_')}`), r.quality).toBe(true);
    }
  });

  it('los lados de las cámaras se nombran con la cámara (i18next no corta en «:»)', () => {
    const w = worldB03();
    expect(b03NameOf(w, 'c1:A')).toBe(`${b03NameOf(w, 'c1')} — Lado A`);
    expect(b03NameOf(w, 'c3:B')).toContain('Lado B');
  });

  it('cada clave literal b03.* / b03fb.* del código existe', () => {
    const files = [...sources('src/app/b03'), 'src/engine/optical/permController.ts', ...sources('src/practices/practice-b03')];
    const missing = new Set<string>();
    for (const f of files) {
      for (const m of readFileSync(f, 'utf8').matchAll(/['"`](b03(?:fb)?\.[A-Za-z0-9_.-]+)['"`]/g)) {
        const k = m[1];
        if (k.endsWith('.')) continue;
        // Prefijos de grupo (`b03.medium` + `.${v}`) e ids de ítems de la rúbrica (`b03.fit` → `b03.item.fit`).
        const prefix = typeof get(k) === 'object';
        const item = /^b03\.[A-Za-z]+$/.test(k) && has(`b03.item.${k.slice(4)}`);
        if (!has(k) && !prefix && !item) missing.add(`${k} (${f})`);
      }
    }
    expect([...missing]).toEqual([]);
  });
});
