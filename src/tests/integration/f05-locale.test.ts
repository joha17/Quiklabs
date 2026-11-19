/**
 * F05 — textos: cada código del dominio (rechazos, eventos, banderas de calidad, bloqueos de seguridad), cada etapa,
 * escenario, objeto, componente e ítem de la rúbrica y cada paso de la demostración tiene su texto en español.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import es from '../../locales/es/practiceF05.json';
import { SIMULATED_ERRORS_F05, F05_SCENARIOS } from '../../practices/practice-f05/error-scenarios';
import { F05_STAGE_ORDER } from '../../practices/practice-f05/workflow.machine';
import { f05StageEvidence } from '../../practices/practice-f05/evidence';
import { evaluateF05 } from '../../practices/practice-f05/rubric';
import { CALC_FIELDS_F5, INSTRUMENTS_F5, QUESTIONS_F5, SETUP_FIELDS_F5, emptyF05Notebook } from '../../practices/practice-f05/notebook';
import { buildObjectsF05 } from '../../practices/practice-f05/definition';
import { EVENT_ERR, SHOW_INFO } from '../../app/f05/feedback';
import { buildDemoScriptF05 } from '../../app/f05/demo/script';
import { fillNotebookF5, idealRouteF5, worldF5 } from '../helpersF05';

const get = (path: string): unknown => path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), es);
const has = (path: string) => typeof get(path) === 'string' || Array.isArray(get(path));
const src = readFileSync(new URL('../../simulation/f05-world/world.ts', import.meta.url), 'utf8');

describe('F05 · textos', () => {
  it('no pisa las claves globales', () => {
    expect(Object.keys(es).sort()).toEqual(['f05', 'f05fb']);
  });

  it('cada error simulado tiene retroalimentación y cada evento de error apunta a uno existente', () => {
    for (const e of SIMULATED_ERRORS_F05) expect(has(e.feedbackKey), e.feedbackKey).toBe(true);
    for (const [ev, code] of Object.entries(EVENT_ERR)) expect(has(`f05fb.${code}`), ev).toBe(true);
  });

  it('cada rechazo del dominio tiene texto', () => {
    const codes = new Set([...src.matchAll(/code: '([A-Z_]+)'/g)].map((m) => m[1]));
    expect(codes.size).toBeGreaterThan(20);
    for (const c of codes) expect(has(`f05.cmd.${c}`), c).toBe(true);
  });

  it('los eventos informativos que se muestran, las banderas de calidad y los bloqueos tienen texto', () => {
    for (const c of SHOW_INFO) expect(has(`f05.ev.${c}`), c).toBe(true);
    const flags = new Set([...src.matchAll(/(?:qf|flags)\.push\('([A-Z_]+)'\)/g)].map((m) => m[1]));
    expect(flags.size).toBeGreaterThan(10);
    for (const f of flags) expect(has(`f05.flag.${f}`), f).toBe(true);
    for (const b of ['PLANE_SLAM', 'CABLE_SNAP']) expect(has(`f05.safety.block.${b}`), b).toBe(true);
  });

  it('etapas, banderas de evidencia, escenarios, objetos y libreta tienen texto', () => {
    for (const s of F05_STAGE_ORDER) expect(has(`f05.stage.${s}`), s).toBe(true);
    for (const f of Object.keys(f05StageEvidence(worldF5(), emptyF05Notebook()))) expect(has(`f05.stageFlag.${f}`), f).toBe(true);
    for (const id of F05_SCENARIOS) expect(has(`f05.scenario.${id}`), id).toBe(true);
    for (const o of buildObjectsF05()) {
      expect(has(`f05.obj.${o.id}`), o.id).toBe(true);
      expect(has(`f05.kind.${o.kind}`), o.kind).toBe(true);
    }
    for (const q of QUESTIONS_F5) expect(has(`f05.nb.f.analysis.${q}`), q).toBe(true);
    for (const k of SETUP_FIELDS_F5) expect(has(`f05.nb.setupF.${k}`), k).toBe(true);
    for (const k of CALC_FIELDS_F5) expect(has(`f05.nb.calc.${k}`), k).toBe(true);
    for (const k of INSTRUMENTS_F5) expect(has(`f05.nb.inst.${k}`), k).toBe(true);
  });

  it('componentes, ítems y retroalimentación de la rúbrica tienen texto', () => {
    const out = idealRouteF5(105);
    const ev = evaluateF05(out.w, fillNotebookF5(out.w, out.ids));
    for (const c of ev.components) {
      expect(has(`f05.comp.${c.id}`), c.id).toBe(true);
      for (const i of c.items) {
        expect(has(`f05.item.${i.key.replace('f05.', '')}`), i.key).toBe(true);
        if (i.feedbackKey) expect(has(i.feedbackKey), i.feedbackKey).toBe(true);
      }
    }
  });

  it('cada paso de la demostración tiene título y texto', () => {
    const steps = buildDemoScriptF05({ notebook: () => undefined, edit: () => undefined });
    for (const s of steps) {
      expect(has(`f05.demo.steps.${s.key}.title`), s.key).toBe(true);
      expect(has(`f05.demo.steps.${s.key}.text`), s.key).toBe(true);
      expect(has(`f05.demo.ui.part${s.part}`), s.part).toBe(true);
    }
  });
});
