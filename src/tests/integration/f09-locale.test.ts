/**
 * F09 — textos: cada código del dominio (rechazos, eventos, banderas de calidad, bloqueos de seguridad), cada etapa,
 * escenario, objeto, componente e ítem de la rúbrica y cada paso de la demostración tiene su texto en español.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import es from '../../locales/es/practiceF09.json';
import { SIMULATED_ERRORS_F09, F09_SCENARIOS } from '../../practices/practice-f09/error-scenarios';
import { F09_STAGE_ORDER } from '../../practices/practice-f09/workflow.machine';
import { f09StageEvidence } from '../../practices/practice-f09/evidence';
import { evaluateF09 } from '../../practices/practice-f09/rubric';
import { CALC_FIELDS_F9, INSTRUMENTS_F9, MCQ_OPTIONS_F9, QUESTIONS_F9, SETUP_FIELDS_F9, emptyF09Notebook } from '../../practices/practice-f09/notebook';
import { buildObjectsF09 } from '../../practices/practice-f09/definition';
import { EVENT_ERR, SHOW_INFO } from '../../app/f09/feedback';
import { buildDemoScriptF09 } from '../../app/f09/demo/script';
import { fillNotebookF9, idealRouteF9, worldF9 } from '../helpersF09';

const get = (path: string): unknown => path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), es);
const has = (path: string) => typeof get(path) === 'string' || Array.isArray(get(path));
const src = readFileSync(new URL('../../simulation/f09-world/world.ts', import.meta.url), 'utf8');

describe('F09 · textos', () => {
  it('no pisa las claves globales', () => {
    expect(Object.keys(es).sort()).toEqual(['f09', 'f09fb']);
  });

  it('cada error simulado tiene retroalimentación y cada evento de error apunta a uno existente', () => {
    expect(SIMULATED_ERRORS_F09).toHaveLength(40);
    for (const e of SIMULATED_ERRORS_F09) expect(has(e.feedbackKey), e.feedbackKey).toBe(true);
    for (const [ev, code] of Object.entries(EVENT_ERR)) expect(has(`f09fb.${code}`), ev).toBe(true);
  });

  it('cada rechazo del dominio tiene texto', () => {
    const codes = new Set([...src.matchAll(/code: '([A-Z_]+)'/g)].map((m) => m[1]));
    expect(codes.size).toBeGreaterThan(20);
    for (const c of codes) expect(has(`f09.cmd.${c}`), c).toBe(true);
  });

  it('cada evento que emite el mundo, las banderas de calidad y los bloqueos tienen texto', () => {
    for (const c of SHOW_INFO) expect(has(`f09.ev.${c}`), c).toBe(true);
    const lines = src.split('\n').filter((l) => /(emit|latch)F9\(w, /.test(l) && !/errF9/.test(l));
    const emitted = new Set(lines.flatMap((l) => [...l.matchAll(/'([A-Z][A-Z_]+)'/g)].map((m) => m[1])).filter((c) => !['INFO', 'WARN', 'ALERT', 'CRITICAL'].includes(c)));
    expect(emitted.size).toBeGreaterThan(40);
    for (const c of emitted) expect(has(`f09.ev.${c}`), c).toBe(true);
    const flags = new Set([...src.matchAll(/(?:qf|flags|out)\.push\('([A-Z_]+)'\)/g)].map((m) => m[1]));
    expect(flags.size).toBeGreaterThan(10);
    for (const f of flags) expect(has(`f09.flag.${f}`), f).toBe(true);
    for (const b of ['HAND_CONTACT', 'ORBIT_OFF_GUIDE']) expect(has(`f09.safety.block.${b}`), b).toBe(true);
  });

  it('etapas, banderas de evidencia, escenarios, objetos y libreta tienen texto', () => {
    for (const s of F09_STAGE_ORDER) expect(has(`f09.stage.${s}`), s).toBe(true);
    for (const f of Object.keys(f09StageEvidence(worldF9(), emptyF09Notebook()))) expect(has(`f09.stageFlag.${f}`), f).toBe(true);
    expect(F09_SCENARIOS).toHaveLength(12);
    for (const id of F09_SCENARIOS) expect(has(`f09.scenario.${id}`), id).toBe(true);
    for (const o of buildObjectsF09()) {
      expect(has(`f09.obj.${o.id}`), o.id).toBe(true);
      expect(has(`f09.kind.${o.kind}`), o.kind).toBe(true);
    }
    for (const q of QUESTIONS_F9) expect(has(`f09.nb.f.analysis.${q}`), q).toBe(true);
    for (const k of SETUP_FIELDS_F9) expect(has(`f09.nb.setupF.${k}`), k).toBe(true);
    for (const k of CALC_FIELDS_F9) expect(has(`f09.nb.calc.${k}`), k).toBe(true);
    for (const k of INSTRUMENTS_F9) expect(has(`f09.nb.inst.${k}`), k).toBe(true);
    for (const k of MCQ_OPTIONS_F9) expect(has(`f09.nb.mcqOpt.${k}`), k).toBe(true);
  });

  it('componentes, ítems y retroalimentación de la rúbrica tienen texto', () => {
    const out = idealRouteF9(109);
    const ev = evaluateF09(out.w, fillNotebookF9(out.w, out.ids));
    for (const c of ev.components) {
      expect(has(`f09.comp.${c.id}`), c.id).toBe(true);
      for (const i of c.items) {
        expect(has(`f09.item.${i.key.replace('f09.', '')}`), i.key).toBe(true);
        if (i.feedbackKey) expect(has(i.feedbackKey), i.feedbackKey).toBe(true);
      }
    }
  });

  it('cada paso de la demostración tiene título y texto', () => {
    const steps = buildDemoScriptF09({ notebook: () => undefined, edit: () => undefined });
    expect(steps.length).toBeGreaterThanOrEqual(8);
    for (const s of steps) {
      expect(has(`f09.demo.steps.${s.key}.title`), s.key).toBe(true);
      expect(has(`f09.demo.steps.${s.key}.text`), s.key).toBe(true);
      expect(has(`f09.demo.ui.part${s.part}`), s.part).toBe(true);
    }
  });
});
