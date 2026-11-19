/**
 * F04: cada clave de texto que usan la interfaz, el motor y la rúbrica existe en español (literales en el código,
 * códigos de comando y de evento del dominio, objetos, banderas de calidad, escenarios, etapas y la rúbrica).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import loc from '../../locales/es/practiceF04.json';
import { buildObjectsF04, F04_STATIONS } from '../../practices/practice-f04/definition';
import { F04_SCENARIOS, SIMULATED_ERRORS_F04 } from '../../practices/practice-f04/error-scenarios';
import { F04_STAGE_ORDER } from '../../practices/practice-f04/workflow.machine';
import { evaluateF04 } from '../../practices/practice-f04/rubric';
import { emptyF04Notebook } from '../../practices/practice-f04/notebook';
import { EVENT_ERR, SHOW_INFO } from '../../app/f04/feedback';
import { worldF4 } from '../helpersF04';

const has = (key: string) => {
  let cur: unknown = loc;
  for (const part of key.split('.')) {
    if (!cur || typeof cur !== 'object' || !(part in (cur as Record<string, unknown>))) return false;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string' || Array.isArray(cur);
};

const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]));
const SRC = join(__dirname, '../..');
const read = (p: string) => readFileSync(p, 'utf8');

describe('F04 · textos', () => {
  it('las claves literales del código existen', () => {
    const missing: string[] = [];
    for (const f of [...files(join(SRC, 'app/f04')), ...files(join(SRC, 'engine/f04'))].filter((x) => /\.tsx?$/.test(x))) {
      for (const m of read(f).matchAll(/['`](f04(?:fb)?\.[A-Za-z0-9_.]+)['`]/g)) if (!has(m[1])) missing.push(`${m[1]} (${f.split('/src/')[1]})`);
    }
    expect(missing).toEqual([]);
  });

  it('comandos, eventos, objetos, banderas, escenarios y etapas tienen texto', () => {
    const world = read(join(SRC, 'simulation/f04-world/world.ts'));
    const ctl = read(join(SRC, 'engine/f04/controller.ts'));
    const missing: string[] = [];
    const need = (k: string) => !has(k) && missing.push(k);
    for (const m of new Set([...world.matchAll(/code: '([A-Z_]+)'/g), ...ctl.matchAll(/code: '([A-Z_]+)'/g)].map((x) => x[1]))) need(`f04.cmd.${m}`);
    for (const m of new Set([...world.matchAll(/emitF4\(w, '([A-Z_]+)'/g)].map((x) => x[1]))) need(`f04.ev.${m}`);
    for (const m of world.matchAll(/emitF4\(w, [^']*\? '([A-Z_]+)' : '([A-Z_]+)'/g)) for (const c of [m[1], m[2]]) need(`f04.ev.${c}`);
    for (const m of new Set([...world.matchAll(/PPE_ERR[^}]*\}/gs)].flatMap((x) => [...x[0].matchAll(/'([A-Z_]+)'\]/g)].map((y) => y[1])))) need(`f04.ev.${m}`);
    for (const c of SHOW_INFO) need(`f04.ev.${c}`);
    for (const e of Object.values(EVENT_ERR)) need(`f04fb.${e}`);
    for (const m of new Set([...world.matchAll(/flags\.push\(([^)]*)\)/g)].flatMap((x) => [...x[1].matchAll(/'([A-Z_]+)'/g)].map((y) => y[1])))) need(`f04.flag.${m}`);
    for (const o of buildObjectsF04()) {
      need(`f04.obj.${o.id}`);
      need(`f04.kind.${o.kind}`);
    }
    for (const s of F04_SCENARIOS) need(`f04.scenario.${s}`);
    for (const s of F04_STATIONS) need(`f04.station.${s.id}`);
    for (const s of F04_STAGE_ORDER) need(`f04.stage.${s}`);
    for (const x of SIMULATED_ERRORS_F04) need(x.feedbackKey);
    for (const k of ['MASS_FALL']) need(`f04.safety.block.${k}`);
    expect(missing).toEqual([]);
  });

  it('la rúbrica tiene nombre y retroalimentación para cada criterio', () => {
    const ev = evaluateF04(worldF4(), emptyF04Notebook());
    const missing: string[] = [];
    for (const c of ev.components) {
      if (!has(`f04.comp.${c.id}`)) missing.push(`f04.comp.${c.id}`);
      for (const i of c.items) {
        if (!has(`f04.item.${i.key.replace('f04.', '')}`)) missing.push(i.key);
        if (i.feedbackKey && !has(i.feedbackKey)) missing.push(i.feedbackKey);
      }
    }
    expect(missing).toEqual([]);
  });
});
