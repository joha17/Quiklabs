/**
 * F06 — textos: cada código del dominio (rechazos, eventos, banderas de calidad, bloqueos de seguridad), cada etapa,
 * escenario, objeto, componente e ítem de la rúbrica y cada paso de la demostración tiene su texto en español.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import es from '../../locales/es/practiceF06.json';
import { SIMULATED_ERRORS_F06, F06_SCENARIOS } from '../../practices/practice-f06/error-scenarios';
import { F06_STAGE_ORDER } from '../../practices/practice-f06/workflow.machine';
import { f06StageEvidence } from '../../practices/practice-f06/evidence';
import { evaluateF06 } from '../../practices/practice-f06/rubric';
import { CALC_FIELDS_F6, INSTRUMENTS_F6, QUESTIONS_F6, SETUP_FIELDS_F6, emptyF06Notebook } from '../../practices/practice-f06/notebook';
import { buildObjectsF06 } from '../../practices/practice-f06/definition';
import { EVENT_ERR, SHOW_INFO } from '../../app/f06/feedback';
import { buildDemoScriptF06 } from '../../app/f06/demo/script';
import { fillNotebookF6, idealRouteF6, worldF6 } from '../helpersF06';

const get = (path: string): unknown => path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), es);
const has = (path: string) => typeof get(path) === 'string' || Array.isArray(get(path));
const src = readFileSync(new URL('../../simulation/f06-world/world.ts', import.meta.url), 'utf8');

describe('F06 · textos', () => {
  it('no pisa las claves globales', () => {
    expect(Object.keys(es).sort()).toEqual(['f06', 'f06fb']);
  });

  it('cada error simulado tiene retroalimentación y cada evento de error apunta a uno existente', () => {
    for (const e of SIMULATED_ERRORS_F06) expect(has(e.feedbackKey), e.feedbackKey).toBe(true);
    for (const [ev, code] of Object.entries(EVENT_ERR)) expect(has(`f06fb.${code}`), ev).toBe(true);
  });

  it('cada rechazo del dominio tiene texto', () => {
    const codes = new Set([...src.matchAll(/code: '([A-Z_]+)'/g)].map((m) => m[1]));
    expect(codes.size).toBeGreaterThan(20);
    for (const c of codes) expect(has(`f06.cmd.${c}`), c).toBe(true);
  });

  it('los eventos informativos que se muestran, las banderas de calidad y los bloqueos tienen texto', () => {
    for (const c of SHOW_INFO) expect(has(`f06.ev.${c}`), c).toBe(true);
    const flags = new Set([...src.matchAll(/(?:qf|flags)\.push\('([A-Z_]+)'\)/g)].map((m) => m[1]));
    expect(flags.size).toBeGreaterThan(10);
    for (const f of flags) expect(has(`f06.flag.${f}`), f).toBe(true);
    for (const b of ['SPRING_RELEASE', 'CART_CRASH']) expect(has(`f06.safety.block.${b}`), b).toBe(true);
  });

  it('etapas, banderas de evidencia, escenarios, objetos y libreta tienen texto', () => {
    for (const s of F06_STAGE_ORDER) expect(has(`f06.stage.${s}`), s).toBe(true);
    for (const f of Object.keys(f06StageEvidence(worldF6(), emptyF06Notebook()))) expect(has(`f06.stageFlag.${f}`), f).toBe(true);
    for (const id of F06_SCENARIOS) expect(has(`f06.scenario.${id}`), id).toBe(true);
    for (const o of buildObjectsF06()) {
      expect(has(`f06.obj.${o.id}`), o.id).toBe(true);
      expect(has(`f06.kind.${o.kind}`), o.kind).toBe(true);
    }
    for (const q of QUESTIONS_F6) expect(has(`f06.nb.f.analysis.${q}`), q).toBe(true);
    for (const k of SETUP_FIELDS_F6) expect(has(`f06.nb.setupF.${k}`), k).toBe(true);
    for (const k of CALC_FIELDS_F6) expect(has(`f06.nb.calc.${k}`), k).toBe(true);
    for (const k of INSTRUMENTS_F6) expect(has(`f06.nb.inst.${k}`), k).toBe(true);
  });

  it('componentes, ítems y retroalimentación de la rúbrica tienen texto', () => {
    const out = idealRouteF6(106);
    const ev = evaluateF06(out.w, fillNotebookF6(out.w, out.ids));
    for (const c of ev.components) {
      expect(has(`f06.comp.${c.id}`), c.id).toBe(true);
      for (const i of c.items) {
        expect(has(`f06.item.${i.key.replace('f06.', '')}`), i.key).toBe(true);
        if (i.feedbackKey) expect(has(i.feedbackKey), i.feedbackKey).toBe(true);
      }
    }
  });

  it('cada paso de la demostración tiene título y texto', () => {
    const steps = buildDemoScriptF06({ notebook: () => undefined, edit: () => undefined });
    for (const s of steps) {
      expect(has(`f06.demo.steps.${s.key}.title`), s.key).toBe(true);
      expect(has(`f06.demo.steps.${s.key}.text`), s.key).toBe(true);
      expect(has(`f06.demo.ui.part${s.part}`), s.part).toBe(true);
    }
  });
});
