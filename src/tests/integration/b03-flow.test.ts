import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { conservedPerm } from '../../simulation/perm-world/world';
import { b03StageEvidence } from '../../practices/practice-b03/evidence';
import { evaluateB03, notebookIssuesB03 } from '../../practices/practice-b03/rubric';
import { practiceB03Machine, b03StageName } from '../../practices/practice-b03/workflow.machine';
import { sanitizeOnResumeB03 } from '../../practices/practice-b03/resume';
import { errKeysB03, idealAttemptB03 } from '../helpersB03';

describe('B03 — ruta ideal por comandos', () => {
  it('completa todas las etapas sin errores y conserva volumen, solutos, plata y Biuret', () => {
    const { w, nb, res } = idealAttemptB03();
    expect(errKeysB03(w)).toEqual([]);
    expect(notebookIssuesB03(w, nb)).toEqual([]);
    for (const m of ['water', 'nacl-0.9', 'nacl-5'] as const) {
      for (const x of [4, 10, 40]) expect(w.observations[res.elodea[m][x]].isObservationValid, `${m} ${x}X ${w.observations[res.elodea[m][x]].issues}`).toBe(true);
    }
    expect(w.observations[res.elodea.water[40]].assetId).toBe('elodea');
    expect(w.observations[res.elodea['nacl-0.9'][40]].assetId).toBe('elodea');
    expect(w.observations[res.elodea['nacl-5'][40]].assetId).toBe('elodeaPlasmo');
    const flags = b03StageEvidence(w, nb);
    expect(flags).toMatchObject({ setup: true, diffusion: true, dialysis: true, osmosis: true, microscopy: true, safeParked: true, benchRestored: true, notebook: true });
    for (const [k, v] of Object.entries(conservedPerm(w))) expect(Math.abs(v), k).toBeLessThan(1e-6);
    const ev = evaluateB03(w, nb);
    const auto = ev.components.flatMap((c) => c.items).filter((i) => i.ok === false);
    expect(auto.map((i) => i.key)).toEqual([]);
    expect(ev.total).toBeGreaterThan(0.85);
  });

  it('la máquina avanza solo por evidencia hasta COMPLETE', () => {
    const { w, nb } = idealAttemptB03();
    const a = createActor(practiceB03Machine).start();
    a.send({ type: 'START' });
    a.send({ type: 'PPE_CONFIRMED' });
    expect(b03StageName(a.getSnapshot().value)).toBe('SETUP');
    a.send({ type: 'EVIDENCE', flags: b03StageEvidence(w, nb) });
    expect(b03StageName(a.getSnapshot().value)).toBe('COMPLETE');
  });

  it('es determinista y tolera reanudaciones entre estaciones', () => {
    const a = idealAttemptB03(77);
    const b = idealAttemptB03(77, [], (w) => {
      const c = structuredClone(w);
      sanitizeOnResumeB03(c);
      return c;
    });
    expect(Object.keys(b.w.perm.readings)).toEqual(Object.keys(a.w.perm.readings));
    expect(errKeysB03(b.w)).toEqual([]);
  });
});
