import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { conservedEnz } from '../../simulation/enz-world/world';
import { b05StageEvidence } from '../../practices/practice-b05/evidence';
import { evaluateB05, notebookIssuesB05 } from '../../practices/practice-b05/rubric';
import { practiceB05Machine, b05StageName } from '../../practices/practice-b05/workflow.machine';
import { sanitizeOnResumeB05 } from '../../practices/practice-b05/resume';
import { errKeysB05, idealAttemptB05 } from '../helpersB05';

describe('B05 — ruta ideal por comandos', () => {
  it('completa todas las etapas sin errores y conserva volumen, oxígeno, glucosilos, cobre y enzimas', () => {
    const { w, nb, res } = idealAttemptB05();
    expect(errKeysB05(w)).toEqual([]);
    expect(notebookIssuesB05(w, nb)).toEqual([]);
    expect(w.observations[res.potato].isObservationValid, String(w.observations[res.potato].issues)).toBe(true);
    // Lugol: azul negro al inicio, sin azul a los 600 s; Benedict: azul a 0 s, ladrillo a 600 s; control con almidón.
    expect(w.enz.readings[res.amy.L0].quality).toMatch(/^lugol:blue/);
    expect(w.enz.readings[res.amy.L3].quality).not.toMatch(/blue/);
    expect(w.enz.readings[res.amy.B0].quality).toMatch(/benedict:blue/);
    expect(w.enz.readings[res.amy.B3].quality).toMatch(/benedict:(orange|brick)/);
    expect(w.enz.readings[res.amy.Lc].quality).toMatch(/^lugol:blue/);
    // Catalasa: la línea base produce gas; el blanco y el extracto hervido casi nada.
    const lastOf = (k: string) => w.enz.readings[res.gas[k][res.gas[k].length - 1]].value;
    expect(lastOf('cat-base')).toBeGreaterThan(2);
    expect(lastOf('cat-blank')).toBeLessThan(0.6);
    expect(lastOf('cat-heat')).toBeLessThan(lastOf('cat-base') / 3);
    const flags = b05StageEvidence(w, nb);
    expect(flags).toMatchObject({ ppe: true, hypothesis: true, starch_batch_ready: true, catalase_suspension_ready: true, amylase_batch_ready: true, controls: true, cat_baseline: true, cat_factors: true, amy_setup: true, amy_assays: true, micro: true, adh_evidence: true, benchRestored: true, notebook: true });
    for (const [k, v] of Object.entries(conservedEnz(w))) expect(Math.abs(v), k).toBeLessThan(1e-9);
    const ev = evaluateB05(w, nb);
    const auto = ev.components.flatMap((c) => c.items).filter((i) => i.ok === false);
    expect(auto.map((i) => i.key)).toEqual([]);
    expect(ev.total).toBeGreaterThan(0.85);
  });

  it('la máquina avanza solo por evidencia hasta COMPLETE', () => {
    const { w, nb } = idealAttemptB05();
    const a = createActor(practiceB05Machine).start();
    a.send({ type: 'START' });
    a.send({ type: 'PPE_CONFIRMED' });
    expect(b05StageName(a.getSnapshot().value)).toBe('SETUP');
    a.send({ type: 'EVIDENCE', flags: b05StageEvidence(w, nb) });
    expect(b05StageName(a.getSnapshot().value)).toBe('COMPLETE');
  });

  it('es determinista y tolera reanudaciones entre estaciones', () => {
    const a = idealAttemptB05(77);
    const b = idealAttemptB05(77, [], (w) => {
      const c = structuredClone(w);
      sanitizeOnResumeB05(c);
      return c;
    });
    expect(Object.keys(b.w.enz.readings)).toEqual(Object.keys(a.w.enz.readings));
    expect(errKeysB05(b.w)).toEqual([]);
  });
});
