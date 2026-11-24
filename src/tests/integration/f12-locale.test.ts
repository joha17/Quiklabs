/**
 * F12 — textos: cada código del dominio (rechazos, eventos, banderas de calidad, bloqueos de seguridad), cada etapa,
 * escenario, objeto, componente e ítem de la rúbrica y cada paso de la demostración tiene su texto en español.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import es from '../../locales/es/practiceF12.json';
import { SIMULATED_ERRORS_F12, F12_SCENARIOS } from '../../practices/practice-f12/error-scenarios';
import { F12_STAGE_ORDER } from '../../practices/practice-f12/workflow.machine';
import { f12StageEvidence } from '../../practices/practice-f12/evidence';
import { evaluateF12 } from '../../practices/practice-f12/rubric';
import { CALC_FIELDS_F12, INSTRUMENTS_F12, MCQ_OPTIONS_F12, QUESTIONS_F12, SETUP_FIELDS_F12, emptyF12Notebook } from '../../practices/practice-f12/notebook';
import { buildObjectsF12 } from '../../practices/practice-f12/definition';
import { EVENT_ERR, SHOW_INFO } from '../../app/f12/feedback';
import { buildDemoScriptF12 } from '../../app/f12/demo/script';
import { fillNotebookF12, idealRouteF12, worldF12 } from '../helpersF12';

const get = (path: string): unknown => path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), es);
const has = (path: string) => typeof get(path) === 'string' || Array.isArray(get(path));
const src = readFileSync(new URL('../../simulation/f12-world/world.ts', import.meta.url), 'utf8');

describe('F12 · textos', () => {
  it('no pisa las claves globales', () => {
    expect(Object.keys(es).sort()).toEqual(['f12', 'f12fb']);
  });

  it('cada error simulado tiene retroalimentación y cada evento de error apunta a uno existente', () => {
    expect(SIMULATED_ERRORS_F12).toHaveLength(40);
    for (const e of SIMULATED_ERRORS_F12) expect(has(e.feedbackKey), e.feedbackKey).toBe(true);
    for (const [ev, code] of Object.entries(EVENT_ERR)) expect(has(`f12fb.${code}`), ev).toBe(true);
  });

  it('cada rechazo del dominio tiene texto', () => {
    const codes = new Set([...src.matchAll(/code: '([A-Z_]+)'/g)].map((m) => m[1]));
    expect(codes.size).toBeGreaterThan(20);
    for (const c of codes) expect(has(`f12.cmd.${c}`), c).toBe(true);
  });

  it('cada evento que emite el mundo, las banderas de calidad y los bloqueos tienen texto', () => {
    for (const c of SHOW_INFO) expect(has(`f12.ev.${c}`), c).toBe(true);
    const lines = src.split('\n').filter((l) => /(emit|latch)F12\(w, /.test(l) && !/errF12/.test(l));
    const emitted = new Set(lines.flatMap((l) => [...l.matchAll(/'([A-Z][A-Z_]+)'/g)].map((m) => m[1])).filter((c) => !['INFO', 'WARN', 'ALERT', 'CRITICAL'].includes(c)));
    expect(emitted.size).toBeGreaterThan(40);
    for (const c of emitted) expect(has(`f12.ev.${c}`), c).toBe(true);
    const flags = new Set([...src.matchAll(/(?:qf|flags|out)\.push\('([A-Z_]+)'\)/g)].map((m) => m[1]));
    expect(flags.size).toBeGreaterThan(10);
    for (const f of flags) expect(has(`f12.flag.${f}`), f).toBe(true);
    for (const b of ['OVERPRESSURE', 'SPRAY']) expect(has(`f12.safety.block.${b}`), b).toBe(true);
  });

  it('etapas, banderas de evidencia, escenarios, objetos y libreta tienen texto', () => {
    for (const s of F12_STAGE_ORDER) expect(has(`f12.stage.${s}`), s).toBe(true);
    for (const f of Object.keys(f12StageEvidence(worldF12(), emptyF12Notebook()))) expect(has(`f12.stageFlag.${f}`), f).toBe(true);
    expect(F12_SCENARIOS).toHaveLength(12);
    for (const id of F12_SCENARIOS) expect(has(`f12.scenario.${id}`), id).toBe(true);
    for (const o of buildObjectsF12()) {
      expect(has(`f12.obj.${o.id}`), o.id).toBe(true);
      expect(has(`f12.kind.${o.kind}`), o.kind).toBe(true);
    }
    for (const q of QUESTIONS_F12) expect(has(`f12.nb.f.analysis.${q}`), q).toBe(true);
    for (const k of SETUP_FIELDS_F12) expect(has(`f12.nb.setupF.${k}`), k).toBe(true);
    for (const k of CALC_FIELDS_F12) expect(has(`f12.nb.calc.${k}`), k).toBe(true);
    for (const k of INSTRUMENTS_F12) expect(has(`f12.nb.inst.${k}`), k).toBe(true);
    for (const k of MCQ_OPTIONS_F12) expect(has(`f12.nb.mcqOpt.${k}`), k).toBe(true);
  });

  it('componentes, ítems y retroalimentación de la rúbrica tienen texto', () => {
    const out = idealRouteF12(110);
    const ev = evaluateF12(out.w, fillNotebookF12(out.w, out.ids));
    for (const c of ev.components) {
      expect(has(`f12.comp.${c.id}`), c.id).toBe(true);
      for (const i of c.items) {
        expect(has(`f12.item.${i.key.replace('f12.', '')}`), i.key).toBe(true);
        if (i.feedbackKey) expect(has(i.feedbackKey), i.feedbackKey).toBe(true);
      }
    }
  });

  it('cada paso de la demostración tiene título y texto', () => {
    const steps = buildDemoScriptF12({ notebook: () => undefined, edit: () => undefined });
    expect(steps.length).toBeGreaterThanOrEqual(8);
    for (const s of steps) {
      expect(has(`f12.demo.steps.${s.key}.title`), s.key).toBe(true);
      expect(has(`f12.demo.steps.${s.key}.text`), s.key).toBe(true);
      expect(has(`f12.demo.ui.part${s.part}`), s.part).toBe(true);
    }
  });
});
