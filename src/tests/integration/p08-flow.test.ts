/**
 * Práctica 8 — flujo completo por comandos (§17.3, ítems 13–15 y 19): las tres rutas ideales con varias semillas
 * llegan a COMPLETE por evidencia, conservan los elementos y obtienen nota alta; dos intentos independientes
 * (`compareTwo`) no mezclan moles ni lecturas; la máquina no avanza por botones ni por la libreta sola.
 */
import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import type { RouteId } from '../../simulation/organic-world/types';
import { conservedTotals08, dispatchP08 } from '../../simulation/organic-world/world';
import { practice08Machine, p08StageName } from '../../practices/practice-08/workflow.machine';
import { p08StageEvidence } from '../../practices/practice-08/evidence';
import { evaluateP08, notebookIssues08 } from '../../practices/practice-08/rubric';
import { emptyP08Notebook } from '../../practices/practice-08/notebook';
import { newPractice08World } from '../../practices/practice-08';
import { idealAttempt, world08 } from '../helpers08';

const ROUTES: RouteId[] = ['ISO', 'ASA', 'MS'];

describe('Práctica 8 — rutas ideales (A → F)', () => {
  for (const route of ROUTES) {
    for (const seed of [808, 31337]) {
      it(`${route}, semilla ${seed}: COMPLETE por evidencia, elementos conservados y nota alta`, () => {
        const { w, nb } = idealAttempt(route, seed);
        const e0 = conservedTotals08(newPractice08World({ mode: 'PRACTICE', seed, route }));
        const e1 = conservedTotals08(w);
        for (const k of Object.keys(e0)) expect(Math.abs(e1[k] - e0[k]), k).toBeLessThan(1e-9 * Math.max(1, e0[k]));
        const actor = createActor(practice08Machine).start();
        actor.send({ type: 'START' });
        expect(actor.getSnapshot().value).toBe('INTRO');
        actor.send({ type: 'ROUTE', route });
        actor.send({ type: 'START' });
        actor.send({ type: 'PPE_CONFIRMED' });
        actor.send({ type: 'EVIDENCE', flags: p08StageEvidence(w, nb) });
        expect(p08StageName(actor.getSnapshot().value)).toBe('COMPLETE');
        expect(actor.getSnapshot().context.route).toBe(route);
        actor.send({ type: 'ROUTE', route: route === 'ISO' ? 'MS' : 'ISO' });
        expect(actor.getSnapshot().context.route).toBe(route);
        expect(notebookIssues08(w, nb)).toEqual([]);
        const ev = evaluateP08(w, nb);
        expect(ev.total).toBeGreaterThan(0.9);
        for (const c of ev.components.filter((x) => x.id !== 'interpretation')) expect(c.score, c.id).toBe(1);
        expect(ev.needsTeacherReview).toEqual(expect.arrayContaining(['p8.answers', 'p8.diagnosis']));
        expect(Object.keys(w.evidence).filter((k) => k.startsWith('err:'))).toEqual([]);
        // Rendimientos plausibles y pureza medida (no se recortan).
        const app = Number(nb.tableC.apparentYield.replace(',', '.'));
        expect(app).toBeGreaterThan(35);
        expect(app).toBeLessThan(105);
      }, 120000);
    }
  }
});

describe('Práctica 8 — máquina y libreta', () => {
  it('la máquina no avanza sin evidencia real (ni por la libreta sola, ni sin ruta)', () => {
    const actor = createActor(practice08Machine).start();
    actor.send({ type: 'START' });
    expect(actor.getSnapshot().value).toBe('INTRO');
    actor.send({ type: 'ROUTE', route: 'ASA' });
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    const w = world08({ route: 'ASA' });
    const nb = emptyP08Notebook('ASA');
    nb.tableA = { ...nb.tableA, reactionType: 'acetylation', limiting: 'SA', theoreticalG: '2,6', savedAtS: 0 };
    actor.send({ type: 'EVIDENCE', flags: p08StageEvidence(w, nb) });
    expect(p08StageName(actor.getSnapshot().value)).toBe('PREPARE_AND_PREDICT');
    expect(dispatchP08(w, { type: 'setPour', sourceId: 'btAA', targetId: 'rf', tiltDeg: 120 }).ok).toBe(false);
  });

  it('compareTwo: dos intentos independientes no comparten moles, lecturas ni rendimientos', () => {
    const a = idealAttempt('ASA', 808);
    const b = idealAttempt('MS', 808);
    expect(a.nb.attemptId).not.toBe('');
    expect(a.w.route).toBe('ASA');
    expect(b.w.route).toBe('MS');
    expect(a.w.vessels.vialP).toBeUndefined();
    expect(b.w.vessels.fpFine).toBeUndefined();
    // Citar en una libreta una lectura del otro intento se detecta (ORG60).
    const mixed = JSON.parse(JSON.stringify(a.nb));
    mixed.tableC.grossMass = { ...b.nb.tableC.grossMass, attemptId: b.nb.attemptId };
    expect(notebookIssues08(a.w, mixed)).toContain('nb:ORG60');
  }, 120000);

  it('en Evaluación la libreta no recibe valores internos: solo lecturas observadas', () => {
    const { w, nb } = idealAttempt('ISO', 808);
    for (const id of [nb.tableC.grossMass.readingId, nb.tableC.purity.readingId]) expect(w.readings[id!]).toBeDefined();
    const pur = w.readings[nb.tableC.purity.readingId!];
    expect(pur.kind).toBe('purity');
    expect(nb.tableC.purity.value.replace(',', '.')).toBe((pur.value / 100).toFixed(3));
  }, 120000);
});
