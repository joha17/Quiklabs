/** Recorrido de B10 con comandos: el intento ideal llega al final sin errores, conserva el líquido y acredita cada etapa. */
import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { b10StageEvidence } from '../../practices/practice-b10/evidence';
import { evaluateB10, notebookIssuesB10 } from '../../practices/practice-b10/rubric';
import { practiceB10Machine } from '../../practices/practice-b10/workflow.machine';
import { sanitizeOnResumeB10 } from '../../practices/practice-b10/resume';
import { conservedAnimal } from '../../simulation/animal-world/world';
import { SC_B10 } from '../../simulation/animal-world/world';
import { errKeysA, idealAttemptB10 } from '../helpersB10';

describe('B10 — recorrido ideal', () => {
  const { w, nb } = idealAttemptB10();

  it('no deja errores ni incidentes', () => {
    expect(errKeysA(w)).toEqual([]);
    expect(notebookIssuesB10(w, nb)).toEqual([]);
    expect(w.safety.incident).toBeFalsy();
  });
  it('acredita todas las etapas y la máquina llega a COMPLETE', () => {
    const f = b10StageEvidence(w, nb);
    expect(Object.entries(f).filter(([, v]) => !v).map(([k]) => k)).toEqual([]);
    const a = createActor(practiceB10Machine).start();
    a.send({ type: 'START' });
    a.send({ type: 'PPE_CONFIRMED' });
    a.send({ type: 'EVIDENCE', flags: f });
    expect(a.getSnapshot().value).toEqual({ LAB: 'COMPLETE' });
  });
  it('obtiene puntaje completo salvo lo que corrige el docente', () => {
    const ev = evaluateB10(w, nb);
    const fails = ev.components.flatMap((c) => c.items.filter((i) => i.ok === false).map((i) => i.key));
    expect(fails).toEqual([]);
    expect(ev.needsTeacherReview).toEqual(['b10.answers']);
    expect(ev.total).toBeGreaterThan(0.9);
    expect(ev.total).toBeLessThan(1);
  });
  it('conserva el líquido y deja las láminas en su ranura', () => {
    const c = conservedAnimal(w);
    for (const k of Object.keys(c)) expect(Math.abs(c[k]), k).toBeLessThan(1e-6);
    for (const id of w.assignment.fixedSlideIds) expect(w.objects[id].support).toBe(`case:${w.slideCase.home[id]}`);
  });
  it('sobrevive a guardar y reanudar a mitad de camino', () => {
    const resumed = idealAttemptB10(2610, [], (x) => {
      const copy = JSON.parse(JSON.stringify(x));
      sanitizeOnResumeB10(copy);
      return copy;
    });
    expect(errKeysA(resumed.w)).toEqual([]);
    expect(b10StageEvidence(resumed.w, resumed.nb).benchRestored).toBe(true);
  });
  it('es determinista con la misma semilla', () => {
    const b = idealAttemptB10();
    expect(b.w.evidence.benchRestored !== undefined).toBe(true);
    expect(Object.keys(b.w.observations)).toEqual(Object.keys(w.observations));
  });
});

describe('B10 — cada escenario se puede completar', () => {
  for (const s of Object.values(SC_B10)) {
    it(s, () => {
      const { w, nb } = idealAttemptB10(2610, [s]);
      expect(errKeysA(w), s).toEqual([]);
      expect(evaluateB10(w, nb).components.flatMap((c) => c.items.filter((i) => i.ok === false).map((i) => i.key)), s).toEqual([]);
    });
  }
});
