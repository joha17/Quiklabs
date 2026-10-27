import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { conservedCell } from '../../simulation/cell-world/world';
import { b02StageEvidence } from '../../practices/practice-b02/evidence';
import { evaluateB02 } from '../../practices/practice-b02/rubric';
import { practiceB02Machine, b02StageName } from '../../practices/practice-b02/workflow.machine';
import { sanitizeOnResumeB02 } from '../../practices/practice-b02/resume';
import { SC } from '../../simulation/cell-world/world';
import { errKeys, idealAttemptB02 } from '../helpersB02';

describe('B02 — ruta ideal por comandos', () => {
  it('completa todas las etapas sin errores y conserva líquido, colorantes y biomasa', () => {
    const { w, nb, res } = idealAttemptB02();
    expect(errKeys(w)).toEqual([]);
    for (const k of Object.keys(res) as Array<keyof typeof res>) {
      expect(w.observations[res[k][4]].isObservationValid, `${k} 4X ${w.observations[res[k][4]].issues}`).toBe(true);
      expect(w.observations[res[k][40]].isObservationValid, `${k} 40X ${w.observations[res[k][40]].issues}`).toBe(true);
    }
    expect(w.observations[res.potato[40]].assetId).toBe('potatoLugol');
    expect(w.observations[res.potato[40]].visibleRegionIds).toContain('starchGrains');
    expect(w.observations[res.tomato[40]].visibleRegionIds).toContain('chromoplasts');
    expect(w.observations[res.pear[40]].visibleRegionIds).toContain('sclereids');
    expect(w.observations[res.buccal[40]].assetId).toBe('buccalMB');
    expect(w.observations[res.buccal[40]].visibleRegionIds).toContain('nucleus');
    const flags = b02StageEvidence(w, nb);
    expect(flags).toMatchObject({ predict: true, pigments: true, starch: true, walls: true, animal: true, elodea: true, compare: true, safeParked: true, benchRestored: true, notebook: true });
    for (const [k, v] of Object.entries(conservedCell(w))) expect(Math.abs(v), k).toBeLessThan(1e-6);
    const ev = evaluateB02(w, nb);
    const auto = ev.components.flatMap((c) => c.items).filter((i) => i.ok === false);
    expect(auto.map((i) => i.key)).toEqual([]);
    expect(ev.total).toBeGreaterThan(0.85);
  });

  it('la máquina avanza solo por evidencia hasta COMPLETE', () => {
    const { w, nb } = idealAttemptB02();
    const a = createActor(practiceB02Machine).start();
    a.send({ type: 'START' });
    a.send({ type: 'PPE_CONFIRMED' });
    expect(b02StageName(a.getSnapshot().value)).toBe('PREDICT');
    a.send({ type: 'EVIDENCE', flags: b02StageEvidence(w, nb) });
    expect(b02StageName(a.getSnapshot().value)).toBe('COMPLETE');
  });

  it('es determinista y tolera reanudaciones entre preparaciones', () => {
    const a = idealAttemptB02(77);
    const b = idealAttemptB02(77, [], (w) => {
      const c = structuredClone(w);
      sanitizeOnResumeB02(c);
      return c;
    });
    expect(Object.keys(b.w.observations)).toEqual(Object.keys(a.w.observations));
    expect(errKeys(b.w)).toEqual([]);
  });

  it('con controles del docente y escenarios de recursos sigue sin errores atribuibles', () => {
    const { w, nb } = idealAttemptB02(5, [SC.LUGOL_CONTROL, SC.PLAIN_CONTROL, SC.BUBBLE_SLIDE, SC.TEACHER_ASSETS, SC.HARD_FOCUS, SC.DROPPER_JITTER]);
    expect(errKeys(w)).toEqual([]);
    expect(b02StageEvidence(w, nb).benchRestored).toBe(true);
  });

  it('recurso faltante (S18): incidencia sin descuento, ítem diferido', () => {
    const { w, nb } = idealAttemptB02(9, [SC.MISSING_ASSET]);
    expect(errKeys(w)).toEqual([]);
    expect(w.cell.incidents).toContain('pepper');
    const ev = evaluateB02(w, nb);
    expect(ev.needsTeacherReview).toContain('b02.chromoplasts');
    expect(ev.components.find((c) => c.id === 'safety')!.score).toBe(1);
  });
});
