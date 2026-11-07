/**
 * F102: cada clave de texto que usan la interfaz, el motor y la rúbrica existe en español (literales en el código,
 * códigos de comando y de evento del dominio, objetos, banderas de calidad, escenarios, etapas y la rúbrica).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import loc from '../../locales/es/practiceF102.json';
import { buildObjectsF102, F102_STATIONS } from '../../practices/practice-f102/definition';
import { F102_SCENARIOS, SIMULATED_ERRORS_F102 } from '../../practices/practice-f102/error-scenarios';
import { F102_STAGE_ORDER } from '../../practices/practice-f102/workflow.machine';
import { evaluateF102 } from '../../practices/practice-f102/rubric';
import { emptyF102Notebook } from '../../practices/practice-f102/notebook';
import { EVENT_ERR, SHOW_INFO } from '../../app/f102/feedback';
import { worldF2 } from '../helpersF102';

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

describe('F102 · textos', () => {
  it('las claves literales del código existen', () => {
    const missing: string[] = [];
    for (const f of [...files(join(SRC, 'app/f102')), ...files(join(SRC, 'engine/f102'))].filter((x) => /\.tsx?$/.test(x))) {
      for (const m of read(f).matchAll(/['`](f102(?:fb)?\.[A-Za-z0-9_.]+)['`]/g)) if (!has(m[1])) missing.push(`${m[1]} (${f.split('/src/')[1]})`);
    }
    expect(missing).toEqual([]);
  });

  it('comandos, eventos, objetos, banderas, escenarios y etapas tienen texto', () => {
    const world = read(join(SRC, 'simulation/f102-world/world.ts'));
    const ctl = read(join(SRC, 'engine/f102/controller.ts'));
    const missing: string[] = [];
    const need = (k: string) => !has(k) && missing.push(k);
    for (const m of new Set([...world.matchAll(/code: '([A-Z_]+)'/g), ...ctl.matchAll(/code: '([A-Z_]+)'/g)].map((x) => x[1]))) need(`f102.cmd.${m}`);
    for (const m of new Set([...world.matchAll(/emitF2\(w, '([A-Z_]+)'/g)].map((x) => x[1]))) need(`f102.ev.${m}`);
    for (const m of new Set([...world.matchAll(/PPE_ERR[^}]*\}/gs)].flatMap((x) => [...x[0].matchAll(/'([A-Z_]+)'\]/g)].map((y) => y[1])))) need(`f102.ev.${m}`);
    for (const c of SHOW_INFO) need(`f102.ev.${c}`);
    for (const e of Object.values(EVENT_ERR)) need(`f102fb.${e}`);
    for (const m of new Set([...world.matchAll(/flags\.push\(([^)]*)\)/g)].flatMap((x) => [...x[1].matchAll(/'([A-Z_]+)'/g)].map((y) => y[1])))) need(`f102.flag.${m}`);
    for (const o of buildObjectsF102()) {
      need(`f102.obj.${o.id}`);
      need(`f102.kind.${o.kind}`);
    }
    for (const s of F102_SCENARIOS) need(`f102.scenario.${s}`);
    for (const s of F102_STATIONS) need(`f102.station.${s.id}`);
    for (const s of F102_STAGE_ORDER) need(`f102.stage.${s}`);
    for (const x of SIMULATED_ERRORS_F102) need(x.feedbackKey);
    for (const k of ['MASS_FALL']) need(`f102.safety.block.${k}`);
    expect(missing).toEqual([]);
  });

  it('la rúbrica tiene nombre y retroalimentación para cada criterio', () => {
    const ev = evaluateF102(worldF2(), emptyF102Notebook());
    const missing: string[] = [];
    for (const c of ev.components) {
      if (!has(`f102.comp.${c.id}`)) missing.push(`f102.comp.${c.id}`);
      for (const i of c.items) {
        if (!has(`f102.item.${i.key.replace('f102.', '')}`)) missing.push(i.key);
        if (i.feedbackKey && !has(i.feedbackKey)) missing.push(i.feedbackKey);
      }
    }
    expect(missing).toEqual([]);
  });
});
