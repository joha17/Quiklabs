/**
 * F10 — textos: cada código del dominio (rechazos, eventos, banderas de calidad, bloqueos de seguridad), cada etapa,
 * escenario, objeto, componente e ítem de la rúbrica y cada paso de la demostración tiene su texto en español.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import es from '../../locales/es/practiceF10.json';
import { SIMULATED_ERRORS_F10, F10_SCENARIOS } from '../../practices/practice-f10/error-scenarios';
import { F10_STAGE_ORDER } from '../../practices/practice-f10/workflow.machine';
import { f10StageEvidence } from '../../practices/practice-f10/evidence';
import { evaluateF10 } from '../../practices/practice-f10/rubric';
import { CALC_FIELDS_F10, INSTRUMENTS_F10, MCQ_OPTIONS_F10, QUESTIONS_F10, SETUP_FIELDS_F10, emptyF10Notebook } from '../../practices/practice-f10/notebook';
import { buildObjectsF10 } from '../../practices/practice-f10/definition';
import { EVENT_ERR, SHOW_INFO } from '../../app/f10/feedback';
import { buildDemoScriptF10 } from '../../app/f10/demo/script';
import { fillNotebookF10, idealRouteF10, worldF10 } from '../helpersF10';

const get = (path: string): unknown => path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), es);
const has = (path: string) => typeof get(path) === 'string' || Array.isArray(get(path));
const src = readFileSync(new URL('../../simulation/f10-world/world.ts', import.meta.url), 'utf8');

describe('F10 · textos', () => {
  it('no pisa las claves globales', () => {
    expect(Object.keys(es).sort()).toEqual(['f10', 'f10fb']);
  });

  it('cada error simulado tiene retroalimentación y cada evento de error apunta a uno existente', () => {
    expect(SIMULATED_ERRORS_F10).toHaveLength(40);
    for (const e of SIMULATED_ERRORS_F10) expect(has(e.feedbackKey), e.feedbackKey).toBe(true);
    for (const [ev, code] of Object.entries(EVENT_ERR)) expect(has(`f10fb.${code}`), ev).toBe(true);
  });

  it('cada rechazo del dominio tiene texto', () => {
    const codes = new Set([...src.matchAll(/code: '([A-Z_]+)'/g)].map((m) => m[1]));
    expect(codes.size).toBeGreaterThan(20);
    for (const c of codes) expect(has(`f10.cmd.${c}`), c).toBe(true);
  });

  it('cada evento que emite el mundo, las banderas de calidad y los bloqueos tienen texto', () => {
    for (const c of SHOW_INFO) expect(has(`f10.ev.${c}`), c).toBe(true);
    const lines = src.split('\n').filter((l) => /(emit|latch)F10\(w, /.test(l) && !/errF10/.test(l));
    const emitted = new Set(lines.flatMap((l) => [...l.matchAll(/'([A-Z][A-Z_]+)'/g)].map((m) => m[1])).filter((c) => !['INFO', 'WARN', 'ALERT', 'CRITICAL'].includes(c)));
    expect(emitted.size).toBeGreaterThan(40);
    for (const c of emitted) expect(has(`f10.ev.${c}`), c).toBe(true);
    const flags = new Set([...src.matchAll(/(?:qf|flags|out)\.push\('([A-Z_]+)'\)/g)].map((m) => m[1]));
    expect(flags.size).toBeGreaterThan(10);
    for (const f of flags) expect(has(`f10.flag.${f}`), f).toBe(true);
    for (const b of ['BEAM_TIPPED', 'MASS_DROPPED']) expect(has(`f10.safety.block.${b}`), b).toBe(true);
  });

  it('etapas, banderas de evidencia, escenarios, objetos y libreta tienen texto', () => {
    for (const s of F10_STAGE_ORDER) expect(has(`f10.stage.${s}`), s).toBe(true);
    for (const f of Object.keys(f10StageEvidence(worldF10(), emptyF10Notebook()))) expect(has(`f10.stageFlag.${f}`), f).toBe(true);
    expect(F10_SCENARIOS).toHaveLength(12);
    for (const id of F10_SCENARIOS) expect(has(`f10.scenario.${id}`), id).toBe(true);
    for (const o of buildObjectsF10()) {
      expect(has(`f10.obj.${o.id}`), o.id).toBe(true);
      expect(has(`f10.kind.${o.kind}`), o.kind).toBe(true);
    }
    for (const q of QUESTIONS_F10) expect(has(`f10.nb.f.analysis.${q}`), q).toBe(true);
    for (const k of SETUP_FIELDS_F10) expect(has(`f10.nb.setupF.${k}`), k).toBe(true);
    for (const k of CALC_FIELDS_F10) expect(has(`f10.nb.calc.${k}`), k).toBe(true);
    for (const k of INSTRUMENTS_F10) expect(has(`f10.nb.inst.${k}`), k).toBe(true);
    for (const k of MCQ_OPTIONS_F10) expect(has(`f10.nb.mcqOpt.${k}`), k).toBe(true);
  });

  it('componentes, ítems y retroalimentación de la rúbrica tienen texto', () => {
    const out = idealRouteF10(110);
    const ev = evaluateF10(out.w, fillNotebookF10(out.w, out.ids));
    for (const c of ev.components) {
      expect(has(`f10.comp.${c.id}`), c.id).toBe(true);
      for (const i of c.items) {
        expect(has(`f10.item.${i.key.replace('f10.', '')}`), i.key).toBe(true);
        if (i.feedbackKey) expect(has(i.feedbackKey), i.feedbackKey).toBe(true);
      }
    }
  });

  it('cada paso de la demostración tiene título y texto', () => {
    const steps = buildDemoScriptF10({ notebook: () => undefined, edit: () => undefined });
    expect(steps.length).toBeGreaterThanOrEqual(8);
    for (const s of steps) {
      expect(has(`f10.demo.steps.${s.key}.title`), s.key).toBe(true);
      expect(has(`f10.demo.steps.${s.key}.text`), s.key).toBe(true);
      expect(has(`f10.demo.ui.part${s.part}`), s.part).toBe(true);
    }
  });
});
