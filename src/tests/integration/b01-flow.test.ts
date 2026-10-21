/**
 * B01 — flujo completo por comandos: la ruta ideal llega a COMPLETE por evidencia con varias semillas y escenarios,
 * conserva el líquido y las piezas en todo momento, no comete errores y la nota usa las observaciones propias.
 */
import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { SB, conservedB01, dispatchB01 } from '../../simulation/optical-world/world';
import { practiceB01Machine, b01StageName } from '../../practices/practice-b01/workflow.machine';
import { b01StageEvidence } from '../../practices/practice-b01/evidence';
import { evaluateB01, notebookIssuesB01 } from '../../practices/practice-b01/rubric';
import { emptyB01Notebook } from '../../practices/practice-b01/notebook';
import { sanitizeOnResumeB01 } from '../../practices/practice-b01/resume';
import type { B01Scenario } from '../../practices/practice-b01/error-scenarios';
import { idealAttemptB01, worldB01 } from '../helpersB01';

const CASES: Array<[number, B01Scenario[]]> = [
  [1101, []], [2026, []], [7, [SB.DIRTY_SLIDE]], [8, [SB.BIG_LEAF]], [9, [SB.LIMITED_DROPPER]], [10, [SB.NO_WATER]], [11, [SB.COVER_GRIP]], [12, [SB.LOW_LIGHT, SB.CONDENSER]],
  [13, [SB.STAGE_OFF, SB.CLIP_CLOSED]], [14, [SB.START_40X]], [15, [SB.SIMILAR_SLIDES]], [16, [SB.TWO_PLANES]], [17, [SB.REFLECTIVE]], [18, [SB.STEREO_DEFOCUS]],
  [19, [SB.STEREO_PAIR]], [20, [SB.MONO_2D]], [21, [SB.UNKNOWN_SLIDES]], [22, [SB.RESUME_PREP]],
];

describe('B01 — ruta ideal por comandos', () => {
  for (const [seed, sc] of CASES) {
    it(`semilla ${seed} ${sc.join(',') || 'estándar'}: COMPLETE por evidencia, sin errores y con conservación`, () => {
      const { w, nb } = idealAttemptB01(seed, sc);
      const c = conservedB01(w);
      for (const k of Object.keys(c)) expect(Math.abs(c[k]), k).toBeLessThan(1e-6);
      const actor = createActor(practiceB01Machine).start();
      actor.send({ type: 'START' });
      actor.send({ type: 'PPE_CONFIRMED' });
      actor.send({ type: 'EVIDENCE', flags: b01StageEvidence(w, nb) });
      expect(b01StageName(actor.getSnapshot().value)).toBe('COMPLETE');
      expect(Object.keys(w.evidence).filter((k) => k.startsWith('err:'))).toEqual([]);
      expect(notebookIssuesB01(w, nb)).toEqual([]);
      const ev = evaluateB01(w, nb);
      expect(ev.total).toBeGreaterThan(0.9);
      for (const comp of ev.components.filter((x) => x.id !== 'notebook')) expect(comp.score, comp.id).toBe(1);
    });
  }

  it('con interrupciones entre estaciones (reanudación segura) el resultado es el mismo', () => {
    const resume = (w: Parameters<typeof sanitizeOnResumeB01>[0]) => {
      const c = structuredClone(w);
      sanitizeOnResumeB01(c);
      return c;
    };
    const a = idealAttemptB01(1101, []);
    const b = idealAttemptB01(1101, [], resume);
    expect(evaluateB01(b.w, b.nb).total).toBeCloseTo(evaluateB01(a.w, a.nb).total, 9);
    expect(b.w.observationOrder.length).toBe(a.w.observationOrder.length);
  });

  it('aumento sumado en la libreta (E60), estructura ausente (E61) y muestra equivocada (E62) se detectan', () => {
    const { w, nb } = idealAttemptB01(1101, []);
    const bad = structuredClone(nb);
    bad.micro[0].totalMag = '14';
    bad.micro[1].structures = ['nucleus'];
    bad.stereo.leaf.observationId = nb.stereo.insect.observationId;
    expect(notebookIssuesB01(w, bad).sort()).toEqual(['nb:E60', 'nb:E61', 'nb:E62']);
    expect(evaluateB01(w, bad).total).toBeLessThan(evaluateB01(w, nb).total);
  });
});

describe('B01 — máquina', () => {
  it('no avanza por botones ni por la libreta sola', () => {
    const actor = createActor(practiceB01Machine).start();
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    const w = worldB01();
    actor.send({ type: 'EVIDENCE', flags: b01StageEvidence(w, emptyB01Notebook()) });
    expect(b01StageName(actor.getSnapshot().value)).toBe('INSPECT');
    expect(dispatchB01(w, { type: 'turnCoarse', deltaTurns: 1 }).ok).toBe(false);
    expect(w.evidence['err:E68']).toBe(1);
  });
});
