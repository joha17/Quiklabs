/**
 * F101: cada clave de texto que usan la interfaz, el motor y la rúbrica existe en español (literales en el código,
 * códigos de comando y de evento del dominio, objetos, banderas de calidad, escenarios, etapas y la rúbrica).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import loc from '../../locales/es/practiceF101.json';
import { buildObjectsF101, F101_STATIONS } from '../../practices/practice-f101/definition';
import { F101_SCENARIOS, SIMULATED_ERRORS_F101 } from '../../practices/practice-f101/error-scenarios';
import { F101_STAGE_ORDER } from '../../practices/practice-f101/workflow.machine';
import { evaluateF101 } from '../../practices/practice-f101/rubric';
import { emptyF101Notebook } from '../../practices/practice-f101/notebook';
import { EVENT_ERR, SHOW_INFO } from '../../app/f101/feedback';
import { worldF } from '../helpersF101';

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

describe('F101 · textos', () => {
  it('las claves literales del código existen', () => {
    const missing: string[] = [];
    for (const f of [...files(join(SRC, 'app/f101')), ...files(join(SRC, 'engine/f101'))].filter((x) => /\.tsx?$/.test(x))) {
      for (const m of read(f).matchAll(/['`](f101(?:fb)?\.[A-Za-z0-9_.]+)['`]/g)) if (!has(m[1])) missing.push(`${m[1]} (${f.split('/src/')[1]})`);
    }
    expect(missing).toEqual([]);
  });

  it('comandos, eventos, objetos, banderas, escenarios y etapas tienen texto', () => {
    const world = read(join(SRC, 'simulation/f101-world/world.ts'));
    const ctl = read(join(SRC, 'engine/f101/controller.ts'));
    const missing: string[] = [];
    const need = (k: string) => !has(k) && missing.push(k);
    for (const m of new Set([...world.matchAll(/code: '([A-Z_]+)'/g), ...ctl.matchAll(/code: '([A-Z_]+)'/g)].map((x) => x[1]))) need(`f101.cmd.${m}`);
    for (const m of new Set([...world.matchAll(/emitF\(w, '([A-Z_]+)'/g)].map((x) => x[1]))) need(`f101.ev.${m}`);
    for (const m of new Set([...world.matchAll(/PPE_ERR[^}]*\}/gs)].flatMap((x) => [...x[0].matchAll(/'([A-Z_]+)'\]/g)].map((y) => y[1])))) need(`f101.ev.${m}`);
    for (const c of SHOW_INFO) need(`f101.ev.${c}`);
    for (const e of Object.values(EVENT_ERR)) need(`f101fb.${e}`);
    for (const m of new Set([...world.matchAll(/flags\.push\(([^)]*)\)/g)].flatMap((x) => [...x[1].matchAll(/'([A-Z_]+)'/g)].map((y) => y[1])))) need(`f101.flag.${m}`);
    for (const o of buildObjectsF101()) {
      need(`f101.obj.${o.id}`);
      need(`f101.kind.${o.kind}`);
    }
    for (const s of F101_SCENARIOS) need(`f101.scenario.${s}`);
    for (const s of F101_STATIONS) need(`f101.station.${s.id}`);
    for (const s of F101_STAGE_ORDER) need(`f101.stage.${s}`);
    for (const x of SIMULATED_ERRORS_F101) need(x.feedbackKey);
    for (const k of ['RING_LOOSE', 'DYN_SNAP']) need(`f101.safety.block.${k}`);
    expect(missing).toEqual([]);
  });

  it('la rúbrica tiene nombre y retroalimentación para cada criterio', () => {
    const ev = evaluateF101(worldF(), emptyF101Notebook());
    const missing: string[] = [];
    for (const c of ev.components) {
      if (!has(`f101.comp.${c.id}`)) missing.push(`f101.comp.${c.id}`);
      for (const i of c.items) {
        if (!has(`f101.item.${i.key.replace('f101.', '')}`)) missing.push(i.key);
        if (i.feedbackKey && !has(i.feedbackKey)) missing.push(i.feedbackKey);
      }
    }
    expect(missing).toEqual([]);
  });
});
