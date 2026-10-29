import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import es from '../../locales/es/practiceB05.json';
import es2 from '../../locales/es/practiceB02.json';
import { SIMULATED_ERRORS_B05, B05_SCENARIOS } from '../../practices/practice-b05/error-scenarios';
import { B05_STAGE_ORDER } from '../../practices/practice-b05/workflow.machine';
import { b05StageEvidence } from '../../practices/practice-b05/evidence';
import { evaluateB05 } from '../../practices/practice-b05/rubric';
import { emptyB05Notebook, QUESTIONS_B05 } from '../../practices/practice-b05/notebook';
import { B05_STATIONS } from '../../practices/practice-b05/definition';
import { idealAttemptB05, worldB05 } from '../helpersB05';
import { b05NameOf } from '../../app/b05/describe';
import { buildDemoScriptB05 } from '../../app/b05/demo/script';

const all = { ...es2, ...es } as Record<string, unknown>;
const get = (path: string): unknown => path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), all);
const has = (path: string) => typeof get(path) === 'string' || Array.isArray(get(path));

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? sources(join(dir, d.name)) : /\.tsx?$/.test(d.name) ? [join(dir, d.name)] : []));
}

describe('B05 · textos', () => {
  it('no pisa las claves de otros laboratorios (los JSON se fusionan por nivel superior)', () => {
    expect(Object.keys(es).sort()).toEqual(['b05', 'b05fb']);
  });

  it('cada código de error tiene retroalimentación', () => {
    for (const e of SIMULATED_ERRORS_B05) expect(has(e.feedbackKey), e.feedbackKey).toBe(true);
  });

  it('etapas, guías, banderas, escenarios, estaciones, preguntas y pasos de la demo tienen texto', () => {
    for (const s of B05_STAGE_ORDER) expect(has(`b05.stage.${s}`), s).toBe(true);
    for (const s of B05_STAGE_ORDER.filter((x) => x !== 'COMPLETE')) expect(has(`b05.guide.${s}`), s).toBe(true);
    for (const f of Object.keys(b05StageEvidence(worldB05(), emptyB05Notebook()))) expect(has(`b05.flag.${f}`), f).toBe(true);
    for (const { id } of B05_SCENARIOS) expect(has(`b05.scenario.${id}`), id).toBe(true);
    for (const { id } of B05_STATIONS) expect(has(`b05.station.${id}`), id).toBe(true);
    for (const q of QUESTIONS_B05) expect(has(`b05.nb.q.${q}`), q).toBe(true);
    for (const s of buildDemoScriptB05({ notebook: () => {}, edit: () => {} })) {
      expect(has(`b05.demo.steps.${s.key}.title`), s.key).toBe(true);
      expect(has(`b05.demo.steps.${s.key}.text`), s.key).toBe(true);
      expect(has(`b05.demo.ui.part${s.part}`), s.part).toBe(true);
    }
  });

  it('componentes, ítems y retroalimentación de la rúbrica tienen texto', () => {
    const { w, nb } = idealAttemptB05();
    for (const ev of [evaluateB05(w, nb), evaluateB05(worldB05(), emptyB05Notebook())]) {
      for (const c of ev.components) {
        expect(has(`b05.comp.${c.id}`), c.id).toBe(true);
        for (const i of c.items) {
          expect(has(`b05.item.${i.key.replace('b05.', '')}`), i.key).toBe(true);
          if (i.feedbackKey) expect(has(i.feedbackKey), i.feedbackKey).toBe(true);
        }
      }
    }
  });

  it('las lecturas del intento ideal tienen instrumento y cada parte de su calidad tiene texto', () => {
    const { w } = idealAttemptB05();
    for (const r of Object.values(w.enz.readings)) {
      expect(has(`b05.instrument.${r.instrument}`), r.instrument).toBe(true);
      for (const part of (r.quality ?? '').split('|').flatMap((q) => q.split(':')).filter(Boolean)) expect(has(`b05.quality.${part}`), `${r.quality} → ${part}`).toBe(true);
    }
  });

  it('los eventos con texto propio de B05 cubren lo que emite la ruta ideal (o lo cubre B02)', () => {
    const { w } = idealAttemptB05();
    for (const e of w.events.filter((x) => x.severity !== 'INFO')) expect(has(`b05.ev.${e.code}`) || has(`b02.ev.${e.code}`), e.code).toBe(true);
  });

  it('las lecturas del colector se nombran con el tubo (i18next no corta en «:»)', () => {
    const w = worldB05();
    expect(b05NameOf(w, 'gc:t1')).toBe(`${b05NameOf(w, 'gc')} — ${b05NameOf(w, 't1')}`);
  });

  it('cada clave literal b05.* / b05fb.* del código existe', () => {
    const files = [...sources('src/app/b05'), 'src/engine/optical/enzController.ts', ...sources('src/practices/practice-b05')];
    const missing = new Set<string>();
    for (const f of files) {
      for (const m of readFileSync(f, 'utf8').matchAll(/['"`](b05(?:fb)?\.[A-Za-z0-9_.-]+)['"`]/g)) {
        const k = m[1];
        if (k.endsWith('.')) continue;
        const prefix = typeof get(k) === 'object';
        const item = /^b05\.[A-Za-z0-9]+$/.test(k) && has(`b05.item.${k.slice(4)}`);
        if (!has(k) && !prefix && !item) missing.add(`${k} (${f})`);
      }
    }
    expect([...missing]).toEqual([]);
  });
});
