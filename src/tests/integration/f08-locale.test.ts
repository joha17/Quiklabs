/**
 * F08 — textos: cada código del dominio (rechazos, eventos, banderas de calidad, bloqueos de seguridad), cada etapa,
 * escenario, objeto, componente e ítem de la rúbrica y cada paso de la demostración tiene su texto en español.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import es from '../../locales/es/practiceF08.json';
import { SIMULATED_ERRORS_F08, F08_SCENARIOS } from '../../practices/practice-f08/error-scenarios';
import { F08_STAGE_ORDER } from '../../practices/practice-f08/workflow.machine';
import { f08StageEvidence } from '../../practices/practice-f08/evidence';
import { evaluateF08 } from '../../practices/practice-f08/rubric';
import { CALC_FIELDS_F8, INSTRUMENTS_F8, MCQ_OPTIONS_F8, QUESTIONS_F8, SETUP_FIELDS_F8, emptyF08Notebook } from '../../practices/practice-f08/notebook';
import { buildObjectsF08 } from '../../practices/practice-f08/definition';
import { EVENT_ERR, SHOW_INFO } from '../../app/f08/feedback';
import { buildDemoScriptF08 } from '../../app/f08/demo/script';
import { fillNotebookF8, idealRouteF8, worldF8 } from '../helpersF08';

const get = (path: string): unknown => path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), es);
const has = (path: string) => typeof get(path) === 'string' || Array.isArray(get(path));
const src = readFileSync(new URL('../../simulation/f08-world/world.ts', import.meta.url), 'utf8');

describe('F08 · textos', () => {
  it('no pisa las claves globales', () => {
    expect(Object.keys(es).sort()).toEqual(['f08', 'f08fb']);
  });

  it('cada error simulado tiene retroalimentación y cada evento de error apunta a uno existente', () => {
    expect(SIMULATED_ERRORS_F08).toHaveLength(40);
    for (const e of SIMULATED_ERRORS_F08) expect(has(e.feedbackKey), e.feedbackKey).toBe(true);
    for (const [ev, code] of Object.entries(EVENT_ERR)) expect(has(`f08fb.${code}`), ev).toBe(true);
  });

  it('cada rechazo del dominio tiene texto', () => {
    const codes = new Set([...src.matchAll(/code: '([A-Z_]+)'/g)].map((m) => m[1]));
    expect(codes.size).toBeGreaterThan(20);
    for (const c of codes) expect(has(`f08.cmd.${c}`), c).toBe(true);
  });

  it('cada evento que emite el mundo, las banderas de calidad y los bloqueos tienen texto', () => {
    for (const c of SHOW_INFO) expect(has(`f08.ev.${c}`), c).toBe(true);
    const lines = src.split('\n').filter((l) => /(emit|latch)F8\(w, /.test(l) && !/errF8/.test(l));
    const emitted = new Set(lines.flatMap((l) => [...l.matchAll(/'([A-Z][A-Z_]+)'/g)].map((m) => m[1])).filter((c) => !['INFO', 'WARN', 'ALERT', 'CRITICAL'].includes(c)));
    expect(emitted.size).toBeGreaterThan(40);
    for (const c of emitted) expect(has(`f08.ev.${c}`), c).toBe(true);
    const flags = new Set([...src.matchAll(/(?:qf|flags|out)\.push\('([A-Z_]+)'\)/g)].map((m) => m[1]));
    expect(flags.size).toBeGreaterThan(10);
    for (const f of flags) expect(has(`f08.flag.${f}`), f).toBe(true);
    for (const b of ['HAND_IN_PLANE', 'SPINNING_DISMOUNT']) expect(has(`f08.safety.block.${b}`), b).toBe(true);
  });

  it('etapas, banderas de evidencia, escenarios, objetos y libreta tienen texto', () => {
    for (const s of F08_STAGE_ORDER) expect(has(`f08.stage.${s}`), s).toBe(true);
    for (const f of Object.keys(f08StageEvidence(worldF8(), emptyF08Notebook()))) expect(has(`f08.stageFlag.${f}`), f).toBe(true);
    expect(F08_SCENARIOS).toHaveLength(12);
    for (const id of F08_SCENARIOS) expect(has(`f08.scenario.${id}`), id).toBe(true);
    for (const o of buildObjectsF08()) {
      expect(has(`f08.obj.${o.id}`), o.id).toBe(true);
      expect(has(`f08.kind.${o.kind}`), o.kind).toBe(true);
    }
    for (const q of QUESTIONS_F8) expect(has(`f08.nb.f.analysis.${q}`), q).toBe(true);
    for (const k of SETUP_FIELDS_F8) expect(has(`f08.nb.setupF.${k}`), k).toBe(true);
    for (const k of CALC_FIELDS_F8) expect(has(`f08.nb.calc.${k}`), k).toBe(true);
    for (const k of INSTRUMENTS_F8) expect(has(`f08.nb.inst.${k}`), k).toBe(true);
    for (const k of MCQ_OPTIONS_F8) expect(has(`f08.nb.mcqOpt.${k}`), k).toBe(true);
  });

  it('componentes, ítems y retroalimentación de la rúbrica tienen texto', () => {
    const out = idealRouteF8(108);
    const ev = evaluateF08(out.w, fillNotebookF8(out.w, out.ids));
    for (const c of ev.components) {
      expect(has(`f08.comp.${c.id}`), c.id).toBe(true);
      for (const i of c.items) {
        expect(has(`f08.item.${i.key.replace('f08.', '')}`), i.key).toBe(true);
        if (i.feedbackKey) expect(has(i.feedbackKey), i.feedbackKey).toBe(true);
      }
    }
  });

  it('cada paso de la demostración tiene título y texto', () => {
    const steps = buildDemoScriptF08({ notebook: () => undefined, edit: () => undefined });
    expect(steps.length).toBeGreaterThanOrEqual(8);
    for (const s of steps) {
      expect(has(`f08.demo.steps.${s.key}.title`), s.key).toBe(true);
      expect(has(`f08.demo.steps.${s.key}.text`), s.key).toBe(true);
      expect(has(`f08.demo.ui.part${s.part}`), s.part).toBe(true);
    }
  });
});
