/**
 * F103: cada clave de texto que usan la interfaz, el motor y la rúbrica existe en español (literales en el código,
 * códigos de comando y de evento del dominio, objetos, banderas de calidad, escenarios, etapas y la rúbrica).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import loc from '../../locales/es/practiceF103.json';
import { buildObjectsF103, F103_STATIONS } from '../../practices/practice-f103/definition';
import { F103_SCENARIOS, SIMULATED_ERRORS_F103 } from '../../practices/practice-f103/error-scenarios';
import { F103_STAGE_ORDER } from '../../practices/practice-f103/workflow.machine';
import { evaluateF103 } from '../../practices/practice-f103/rubric';
import { emptyF103Notebook } from '../../practices/practice-f103/notebook';
import { EVENT_ERR, SHOW_INFO } from '../../app/f103/feedback';
import { worldF3 } from '../helpersF103';

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

describe('F103 · textos', () => {
  it('las claves literales del código existen', () => {
    const missing: string[] = [];
    for (const f of [...files(join(SRC, 'app/f103')), ...files(join(SRC, 'engine/f103'))].filter((x) => /\.tsx?$/.test(x))) {
      for (const m of read(f).matchAll(/['`](f103(?:fb)?\.[A-Za-z0-9_.]+)['`]/g)) if (!has(m[1])) missing.push(`${m[1]} (${f.split('/src/')[1]})`);
    }
    expect(missing).toEqual([]);
  });

  it('comandos, eventos, objetos, banderas, escenarios y etapas tienen texto', () => {
    const world = read(join(SRC, 'simulation/f103-world/world.ts'));
    const ctl = read(join(SRC, 'engine/f103/controller.ts'));
    const missing: string[] = [];
    const need = (k: string) => !has(k) && missing.push(k);
    for (const m of new Set([...world.matchAll(/code: '([A-Z_]+)'/g), ...ctl.matchAll(/code: '([A-Z_]+)'/g)].map((x) => x[1]))) need(`f103.cmd.${m}`);
    for (const m of new Set([...world.matchAll(/emitF3\(w, '([A-Z_]+)'/g)].map((x) => x[1]))) need(`f103.ev.${m}`);
    for (const m of new Set([...world.matchAll(/PPE_ERR[^}]*\}/gs)].flatMap((x) => [...x[0].matchAll(/'([A-Z_]+)'\]/g)].map((y) => y[1])))) need(`f103.ev.${m}`);
    for (const c of SHOW_INFO) need(`f103.ev.${c}`);
    for (const e of Object.values(EVENT_ERR)) need(`f103fb.${e}`);
    for (const m of new Set([...world.matchAll(/flags\.push\(([^)]*)\)/g)].flatMap((x) => [...x[1].matchAll(/'([A-Z_]+)'/g)].map((y) => y[1])))) need(`f103.flag.${m}`);
    for (const o of buildObjectsF103()) {
      need(`f103.obj.${o.id}`);
      need(`f103.kind.${o.kind}`);
    }
    for (const s of F103_SCENARIOS) need(`f103.scenario.${s}`);
    for (const s of F103_STATIONS) need(`f103.station.${s.id}`);
    for (const s of F103_STAGE_ORDER) need(`f103.stage.${s}`);
    for (const x of SIMULATED_ERRORS_F103) need(x.feedbackKey);
    for (const k of ['SPRING_RELEASE', 'ZONE_OPEN']) need(`f103.safety.block.${k}`);
    expect(missing).toEqual([]);
  });

  it('la rúbrica tiene nombre y retroalimentación para cada criterio', () => {
    const ev = evaluateF103(worldF3(), emptyF103Notebook());
    const missing: string[] = [];
    for (const c of ev.components) {
      if (!has(`f103.comp.${c.id}`)) missing.push(`f103.comp.${c.id}`);
      for (const i of c.items) {
        if (!has(`f103.item.${i.key.replace('f103.', '')}`)) missing.push(i.key);
        if (i.feedbackKey && !has(i.feedbackKey)) missing.push(i.feedbackKey);
      }
    }
    expect(missing).toEqual([]);
  });
});
