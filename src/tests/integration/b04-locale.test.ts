import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import es from '../../locales/es/practiceB04.json';
import es2 from '../../locales/es/practiceB02.json';
import { SIMULATED_ERRORS_B04, B04_SCENARIOS } from '../../practices/practice-b04/error-scenarios';
import { B04_STAGE_ORDER } from '../../practices/practice-b04/workflow.machine';
import { b04StageEvidence } from '../../practices/practice-b04/evidence';
import { evaluateB04 } from '../../practices/practice-b04/rubric';
import { emptyB04Notebook, QUESTIONS_B04 } from '../../practices/practice-b04/notebook';
import { ASSAYS, bioTotals } from '../../simulation/bio-world/world';
import { FEULGEN_ASSETS } from '../../simulation/specimens/assets';
import { cmdB, drops, eye, label, mix, pipette, ppeB04, runB, worldB04 } from '../helpersB04';

const all = { ...es2, ...es } as Record<string, unknown>;
const get = (path: string): unknown => path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), all);
const has = (path: string) => typeof get(path) === 'string' || Array.isArray(get(path));

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? sources(join(dir, d.name)) : /\.tsx?$/.test(d.name) ? [join(dir, d.name)] : []));
}

describe('B04 · textos', () => {
  it('no pisa las claves de otros laboratorios (los JSON se fusionan por nivel superior)', () => {
    expect(Object.keys(es).sort()).toEqual(['b04', 'b04fb']);
  });

  it('cada error simulable tiene retroalimentación', () => {
    for (const e of SIMULATED_ERRORS_B04) expect(has(e.feedbackKey), e.feedbackKey).toBe(true);
  });

  it('etapas, guías, banderas, escenarios, ensayos, balance y preguntas tienen texto', () => {
    for (const s of B04_STAGE_ORDER) expect(has(`b04.stage.${s}`), s).toBe(true);
    for (const s of B04_STAGE_ORDER.filter((x) => x !== 'COMPLETE')) expect(has(`b04.guide.${s}`), s).toBe(true);
    for (const f of Object.keys(b04StageEvidence(worldB04(), emptyB04Notebook()))) expect(has(`b04.flag.${f}`), f).toBe(true);
    for (const { id } of B04_SCENARIOS) expect(has(`b04.scenario.${id}`), id).toBe(true);
    for (const a of ASSAYS) expect(has(`b04.assay.${a}`), a).toBe(true);
    for (const k of Object.keys(bioTotals(worldB04()))) expect(has(`b04.balance.${k}`), k).toBe(true);
    for (const a of Object.keys(FEULGEN_ASSETS)) expect(has(`b04.asset.${a}`), a).toBe(true);
    for (const q of QUESTIONS_B04) expect(has(`b04.nb.q.${q}`), q).toBe(true);
  });

  it('componentes, ítems y retroalimentación de la rúbrica tienen texto', () => {
    const w = worldB04();
    const ev = evaluateB04(w, emptyB04Notebook());
    for (const c of ev.components) {
      expect(has(`b04.comp.${c.id}`), c.id).toBe(true);
      for (const i of c.items) {
        expect(has(`b04.item.${i.key.replace('b04.', '')}`), i.key).toBe(true);
        if (i.feedbackKey) expect(has(i.feedbackKey), i.feedbackKey).toBe(true);
      }
    }
  });

  it('las lecturas con la vista tienen descripción (i18next no corta en «:»: se usa «_»)', () => {
    const w = worldB04();
    ppeB04(w);
    label(w, 'A1', 'LUG/L-PAP');
    pipette(w, 'sPot', 'A1', 2);
    drops(w, 'dI', 'A1', 3);
    mix(w, 'A1');
    label(w, 'A2', 'BIU/L-PRO');
    pipette(w, 'sStd', 'A2', 2);
    drops(w, 'dNa', 'A2', 10);
    drops(w, 'dCu', 'A2', 3);
    mix(w, 'A2');
    runB(w, 90);
    for (const t of ['A1', 'A2']) {
      const r = eye(w, t);
      expect(has(`b04.instrument.${r.instrument}`)).toBe(true);
      expect(has(`b04.look.${r.quality!.replace(/:/g, '_')}`), r.quality).toBe(true);
    }
    const g = cmdB(w, { type: 'readInstrument', instrument: 'balance', targetId: 'bal' }, false);
    if (g.ok) expect(has('b04.instrument.balance')).toBe(true);
  });

  it('cada clave literal b04.* / b04fb.* del código existe', () => {
    const files = [...sources('src/app/b04'), 'src/engine/optical/bioController.ts', ...sources('src/practices/practice-b04')];
    const missing = new Set<string>();
    for (const f of files) {
      for (const m of readFileSync(f, 'utf8').matchAll(/['"`](b04(?:fb)?\.[A-Za-z0-9_.-]+)['"`]/g)) {
        const k = m[1];
        if (k.endsWith('.')) continue;
        const prefix = typeof get(k) === 'object';
        const item = /^b04\.[A-Za-z]+$/.test(k) && has(`b04.item.${k.slice(4)}`);
        if (!has(k) && !prefix && !item) missing.add(`${k} (${f})`);
      }
    }
    expect([...missing]).toEqual([]);
  });
});
