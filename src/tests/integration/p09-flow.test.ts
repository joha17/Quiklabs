/**
 * Práctica 9 — flujo completo por comandos (§17: `flow:evidence`, `flow:scenario`): la ruta ideal llega a COMPLETE por
 * evidencia con varias semillas y escenarios, conserva elementos y carga, no comete errores y la identificación se
 * evalúa contra la composición de ESE intento (no una respuesta fija de tres cationes).
 */
import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { S9, conservedTotals09, dispatchP09 } from '../../simulation/cation-analysis-world/world';
import { practice09Machine, p09StageName } from '../../practices/practice-09/workflow.machine';
import { p09StageEvidence } from '../../practices/practice-09/evidence';
import { evaluateP09, notebookIssues09 } from '../../practices/practice-09/rubric';
import { inferable } from '../../practices/practice-09/expected-results';
import { emptyP09Notebook } from '../../practices/practice-09/notebook';
import { newPractice09World } from '../../practices/practice-09';
import type { P09Scenario } from '../../practices/practice-09/error-scenarios';
import { idealAttempt09, world09 } from '../helpers09';

const CASES: Array<[number, P09Scenario[]]> = [[9009, []], [2026, []], [77, [S9.NO_SR]], [78, [S9.NO_FE]], [79, [S9.NO_K]], [80, [S9.ONLY_K]], [81, [S9.NA_CONTAMINANT]]];

describe('Práctica 9 — ruta ideal (A → F)', () => {
  for (const [seed, sc] of CASES) {
    it(`semilla ${seed} ${sc.join(',') || 'S01'}: COMPLETE por evidencia, balance conservado e identificación según el escenario`, () => {
      const { w, nb } = idealAttempt09(seed, sc);
      const e0 = conservedTotals09(newPractice09World({ mode: 'PRACTICE', seed, scenarios: sc }));
      const e1 = conservedTotals09(w);
      for (const k of Object.keys(e0)) expect(Math.abs(e1[k] - e0[k]), k).toBeLessThan(1e-12);
      const actor = createActor(practice09Machine).start();
      actor.send({ type: 'START' });
      actor.send({ type: 'PPE_CONFIRMED' });
      actor.send({ type: 'EVIDENCE', flags: p09StageEvidence(w, nb) });
      expect(p09StageName(actor.getSnapshot().value)).toBe('COMPLETE');
      expect(Object.keys(w.evidence).filter((k) => k.startsWith('err:'))).toEqual([]);
      expect(notebookIssues09(w, nb)).toEqual([]);
      const inf = inferable(w);
      for (const c of ['Sr2+', 'Fe3+', 'K+'] as const) expect(inf[c], c).toBe(w.unknown.cations.includes(c) ? 'detected' : 'notDetected');
      const ev = evaluateP09(w, nb);
      expect(ev.total).toBeGreaterThan(0.9);
      for (const c of ev.components.filter((x) => x.id !== 'notebook')) expect(c.score, c.id).toBe(1);
    }, 120000);
  }

  it('una conclusión fija («los tres presentes») se penaliza cuando el escenario no los tiene', () => {
    const { w, nb } = idealAttempt09(79, [S9.NO_K]);
    const wrong = JSON.parse(JSON.stringify(nb));
    wrong.tableF['K+'].status = 'detected';
    expect(evaluateP09(w, wrong).total).toBeLessThan(evaluateP09(w, nb).total);
  }, 120000);
});

describe('Práctica 9 — máquina', () => {
  it('no avanza por botones ni por la libreta sola', () => {
    const actor = createActor(practice09Machine).start();
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    const w = world09();
    const nb = emptyP09Notebook();
    nb.tableF['Sr2+'].status = 'detected';
    actor.send({ type: 'EVIDENCE', flags: p09StageEvidence(w, nb) });
    expect(p09StageName(actor.getSnapshot().value)).toBe('A_OBSERVE');
    expect(dispatchP09(w, { type: 'setIgnition', on: true }).ok).toBe(false);
  });
});
