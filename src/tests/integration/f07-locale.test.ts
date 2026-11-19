/**
 * F07 — textos: cada código del dominio (rechazos, eventos, banderas de calidad, bloqueos de seguridad), cada etapa,
 * escenario, objeto, componente e ítem de la rúbrica y cada paso de la demostración tiene su texto en español.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import es from '../../locales/es/practiceF07.json';
import { SIMULATED_ERRORS_F07, F07_SCENARIOS } from '../../practices/practice-f07/error-scenarios';
import { F07_STAGE_ORDER } from '../../practices/practice-f07/workflow.machine';
import { f07StageEvidence } from '../../practices/practice-f07/evidence';
import { evaluateF07 } from '../../practices/practice-f07/rubric';
import { CALC_FIELDS_F7, INSTRUMENTS_F7, MCQ_OPTIONS_F7, QUESTIONS_F7, SETUP_FIELDS_F7, emptyF07Notebook } from '../../practices/practice-f07/notebook';
import { buildObjectsF07 } from '../../practices/practice-f07/definition';
import { EVENT_ERR, SHOW_INFO } from '../../app/f07/feedback';
import { buildDemoScriptF07 } from '../../app/f07/demo/script';
import { fillNotebookF7, idealRouteF7, worldF7 } from '../helpersF07';

const get = (path: string): unknown => path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), es);
const has = (path: string) => typeof get(path) === 'string' || Array.isArray(get(path));
const src = readFileSync(new URL('../../simulation/f07-world/world.ts', import.meta.url), 'utf8');

describe('F07 · textos', () => {
  it('no pisa las claves globales', () => {
    expect(Object.keys(es).sort()).toEqual(['f07', 'f07fb']);
  });

  it('cada error simulado tiene retroalimentación y cada evento de error apunta a uno existente', () => {
    expect(SIMULATED_ERRORS_F07).toHaveLength(40);
    for (const e of SIMULATED_ERRORS_F07) expect(has(e.feedbackKey), e.feedbackKey).toBe(true);
    for (const [ev, code] of Object.entries(EVENT_ERR)) expect(has(`f07fb.${code}`), ev).toBe(true);
  });

  it('cada rechazo del dominio tiene texto', () => {
    const codes = new Set([...src.matchAll(/code: '([A-Z_]+)'/g)].map((m) => m[1]));
    expect(codes.size).toBeGreaterThan(20);
    for (const c of codes) expect(has(`f07.cmd.${c}`), c).toBe(true);
  });

  it('cada evento que emite el mundo, las banderas de calidad y los bloqueos tienen texto', () => {
    for (const c of SHOW_INFO) expect(has(`f07.ev.${c}`), c).toBe(true);
    const lines = src.split('\n').filter((l) => /(emit|latch)F7\(w, /.test(l) && !/errF7/.test(l));
    const emitted = new Set(lines.flatMap((l) => [...l.matchAll(/'([A-Z][A-Z_]+)'/g)].map((m) => m[1])).filter((c) => !['INFO', 'WARN', 'ALERT', 'CRITICAL'].includes(c)));
    expect(emitted.size).toBeGreaterThan(40);
    for (const c of emitted) expect(has(`f07.ev.${c}`), c).toBe(true);
    const flags = new Set([...src.matchAll(/(?:qf|flags|out)\.push\('([A-Z_]+)'\)/g)].map((m) => m[1]));
    expect(flags.size).toBeGreaterThan(10);
    for (const f of flags) expect(has(`f07.flag.${f}`), f).toBe(true);
    for (const b of ['CART_CRASH', 'LAUNCHER_FIRED']) expect(has(`f07.safety.block.${b}`), b).toBe(true);
  });

  it('etapas, banderas de evidencia, escenarios, objetos y libreta tienen texto', () => {
    for (const s of F07_STAGE_ORDER) expect(has(`f07.stage.${s}`), s).toBe(true);
    for (const f of Object.keys(f07StageEvidence(worldF7(), emptyF07Notebook()))) expect(has(`f07.stageFlag.${f}`), f).toBe(true);
    expect(F07_SCENARIOS).toHaveLength(12);
    for (const id of F07_SCENARIOS) expect(has(`f07.scenario.${id}`), id).toBe(true);
    for (const o of buildObjectsF07()) {
      expect(has(`f07.obj.${o.id}`), o.id).toBe(true);
      expect(has(`f07.kind.${o.kind}`), o.kind).toBe(true);
    }
    for (const q of QUESTIONS_F7) expect(has(`f07.nb.f.analysis.${q}`), q).toBe(true);
    for (const k of SETUP_FIELDS_F7) expect(has(`f07.nb.setupF.${k}`), k).toBe(true);
    for (const k of CALC_FIELDS_F7) expect(has(`f07.nb.calc.${k}`), k).toBe(true);
    for (const k of INSTRUMENTS_F7) expect(has(`f07.nb.inst.${k}`), k).toBe(true);
    for (const k of MCQ_OPTIONS_F7) expect(has(`f07.nb.mcqOpt.${k}`), k).toBe(true);
    for (const b of ['spring', 'magnet', 'velcro']) expect(has(`f07.bumper.${b}`), b).toBe(true);
  });

  it('componentes, ítems y retroalimentación de la rúbrica tienen texto', () => {
    const out = idealRouteF7(107);
    const ev = evaluateF07(out.w, fillNotebookF7(out.w, out.ids));
    for (const c of ev.components) {
      expect(has(`f07.comp.${c.id}`), c.id).toBe(true);
      for (const i of c.items) {
        expect(has(`f07.item.${i.key.replace('f07.', '')}`), i.key).toBe(true);
        if (i.feedbackKey) expect(has(i.feedbackKey), i.feedbackKey).toBe(true);
      }
    }
  });

  it('cada paso de la demostración tiene título y texto', () => {
    const steps = buildDemoScriptF07({ notebook: () => undefined, edit: () => undefined });
    expect(steps.length).toBeGreaterThanOrEqual(8);
    for (const s of steps) {
      expect(has(`f07.demo.steps.${s.key}.title`), s.key).toBe(true);
      expect(has(`f07.demo.steps.${s.key}.text`), s.key).toBe(true);
      expect(has(`f07.demo.ui.part${s.part}`), s.part).toBe(true);
    }
  });
});
