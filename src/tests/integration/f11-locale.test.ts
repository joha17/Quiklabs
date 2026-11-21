/**
 * F11 — textos: cada código del dominio (rechazos, eventos, banderas de calidad, bloqueos de seguridad), cada etapa,
 * escenario, objeto, componente e ítem de la rúbrica y cada paso de la demostración tiene su texto en español.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import es from '../../locales/es/practiceF11.json';
import { SIMULATED_ERRORS_F11, F11_SCENARIOS } from '../../practices/practice-f11/error-scenarios';
import { F11_STAGE_ORDER } from '../../practices/practice-f11/workflow.machine';
import { f11StageEvidence } from '../../practices/practice-f11/evidence';
import { evaluateF11 } from '../../practices/practice-f11/rubric';
import { CALC_FIELDS_F11, INSTRUMENTS_F11, MCQ_OPTIONS_F11, QUESTIONS_F11, SETUP_FIELDS_F11, emptyF11Notebook } from '../../practices/practice-f11/notebook';
import { buildObjectsF11 } from '../../practices/practice-f11/definition';
import { EVENT_ERR, SHOW_INFO } from '../../app/f11/feedback';
import { buildDemoScriptF11 } from '../../app/f11/demo/script';
import { fillNotebookF11, idealRouteF11, worldF11 } from '../helpersF11';

const get = (path: string): unknown => path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), es);
const has = (path: string) => typeof get(path) === 'string' || Array.isArray(get(path));
const src = readFileSync(new URL('../../simulation/f11-world/world.ts', import.meta.url), 'utf8');

describe('F11 · textos', () => {
  it('no pisa las claves globales', () => {
    expect(Object.keys(es).sort()).toEqual(['f11', 'f11fb']);
  });

  it('cada error simulado tiene retroalimentación y cada evento de error apunta a uno existente', () => {
    expect(SIMULATED_ERRORS_F11).toHaveLength(40);
    for (const e of SIMULATED_ERRORS_F11) expect(has(e.feedbackKey), e.feedbackKey).toBe(true);
    for (const [ev, code] of Object.entries(EVENT_ERR)) expect(has(`f11fb.${code}`), ev).toBe(true);
  });

  it('cada rechazo del dominio tiene texto', () => {
    const codes = new Set([...src.matchAll(/code: '([A-Z_]+)'/g)].map((m) => m[1]));
    expect(codes.size).toBeGreaterThan(20);
    for (const c of codes) expect(has(`f11.cmd.${c}`), c).toBe(true);
  });

  it('cada evento que emite el mundo, las banderas de calidad y los bloqueos tienen texto', () => {
    for (const c of SHOW_INFO) expect(has(`f11.ev.${c}`), c).toBe(true);
    const lines = src.split('\n').filter((l) => /(emit|latch)F11\(w, /.test(l) && !/errF11/.test(l));
    const emitted = new Set(lines.flatMap((l) => [...l.matchAll(/'([A-Z][A-Z_]+)'/g)].map((m) => m[1])).filter((c) => !['INFO', 'WARN', 'ALERT', 'CRITICAL'].includes(c)));
    expect(emitted.size).toBeGreaterThan(40);
    for (const c of emitted) expect(has(`f11.ev.${c}`), c).toBe(true);
    const flags = new Set([...src.matchAll(/(?:qf|flags|out)\.push\('([A-Z_]+)'\)/g)].map((m) => m[1]));
    expect(flags.size).toBeGreaterThan(10);
    for (const f of flags) expect(has(`f11.flag.${f}`), f).toBe(true);
    for (const b of ['TANK_SPILL']) expect(has(`f11.safety.block.${b}`), b).toBe(true);
  });

  it('etapas, banderas de evidencia, escenarios, objetos y libreta tienen texto', () => {
    for (const s of F11_STAGE_ORDER) expect(has(`f11.stage.${s}`), s).toBe(true);
    for (const f of Object.keys(f11StageEvidence(worldF11(), emptyF11Notebook()))) expect(has(`f11.stageFlag.${f}`), f).toBe(true);
    expect(F11_SCENARIOS).toHaveLength(12);
    for (const id of F11_SCENARIOS) expect(has(`f11.scenario.${id}`), id).toBe(true);
    for (const o of buildObjectsF11()) {
      expect(has(`f11.obj.${o.id}`), o.id).toBe(true);
      expect(has(`f11.kind.${o.kind}`), o.kind).toBe(true);
    }
    for (const q of QUESTIONS_F11) expect(has(`f11.nb.f.analysis.${q}`), q).toBe(true);
    for (const k of SETUP_FIELDS_F11) expect(has(`f11.nb.setupF.${k}`), k).toBe(true);
    for (const k of CALC_FIELDS_F11) expect(has(`f11.nb.calc.${k}`), k).toBe(true);
    for (const k of INSTRUMENTS_F11) expect(has(`f11.nb.inst.${k}`), k).toBe(true);
    for (const k of MCQ_OPTIONS_F11) expect(has(`f11.nb.mcqOpt.${k}`), k).toBe(true);
  });

  it('componentes, ítems y retroalimentación de la rúbrica tienen texto', () => {
    const out = idealRouteF11(110);
    const ev = evaluateF11(out.w, fillNotebookF11(out.w, out.ids));
    for (const c of ev.components) {
      expect(has(`f11.comp.${c.id}`), c.id).toBe(true);
      for (const i of c.items) {
        expect(has(`f11.item.${i.key.replace('f11.', '')}`), i.key).toBe(true);
        if (i.feedbackKey) expect(has(i.feedbackKey), i.feedbackKey).toBe(true);
      }
    }
  });

  it('cada paso de la demostración tiene título y texto', () => {
    const steps = buildDemoScriptF11({ notebook: () => undefined, edit: () => undefined });
    expect(steps.length).toBeGreaterThanOrEqual(8);
    for (const s of steps) {
      expect(has(`f11.demo.steps.${s.key}.title`), s.key).toBe(true);
      expect(has(`f11.demo.steps.${s.key}.text`), s.key).toBe(true);
      expect(has(`f11.demo.ui.part${s.part}`), s.part).toBe(true);
    }
  });
});
