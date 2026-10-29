import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { conservedDiv } from '../../simulation/div-world/world';
import { b06StageEvidence } from '../../practices/practice-b06/evidence';
import { evaluateB06 } from '../../practices/practice-b06/rubric';
import { practiceB06Machine, b06StageName } from '../../practices/practice-b06/workflow.machine';
import { sanitizeOnResumeB06 } from '../../practices/practice-b06/resume';
import { emptyB06Notebook } from '../../practices/practice-b06/notebook';
import { errKeys, idealAttemptB06, worldB06 } from '../helpersB06';

describe('B06 — ruta ideal por comandos', () => {
  it('completa todas las rutas sin errores, con capturas válidas, marcas y una medición, y conserva los balances', () => {
    const { w, nb, res } = idealAttemptB06();
    expect(errKeys(w)).toEqual([]);
    for (const k of ['tradescantia', 'buccal', 'paramecium', 'euglena', 'elodea', 'blood'] as const) {
      expect(w.observations[res[k][40]].isObservationValid, `${k} 40X ${w.observations[res[k][40]].issues}`).toBe(true);
    }
    expect(w.observations[res.bacillus[40]].visibleRegionIds).toContain('bacilli');
    expect(w.observations[res.tradescantia[40]].visibleRegionIds).toContain('stoma');
    expect(w.div.marks.every((m) => m.verdict === 'valid')).toBe(true);
    expect(res.measurement).not.toBeNull();
    const flags = b06StageEvidence(w, nb);
    expect(Object.values(flags).every(Boolean), JSON.stringify(flags)).toBe(true);
    for (const [k, v] of Object.entries(conservedDiv(w))) expect(Math.abs(v), k).toBeLessThan(1e-6);
    const ev = evaluateB06(w, nb);
    expect(ev.components.flatMap((c) => c.items).filter((i) => i.ok === false).map((i) => i.key)).toEqual([]);
    expect(ev.total).toBeGreaterThan(0.9);
    expect(ev.needsTeacherReview).toEqual(['b06.open', 'b06.answers']);
  });

  it('con el módulo de inmersión acredita el 100X con aceite y deja lente y lámina limpias', () => {
    const { w, nb, res } = idealAttemptB06(2606, ['SC-BACT-IMMERSION']);
    expect(errKeys(w)).toEqual([]);
    expect(w.observations[res.bacillus[100]].isObservationValid).toBe(true);
    expect(w.observations[res.bacillus[100]].visibleRegionIds).toContain('cellChain');
    expect(Object.keys(w.div.lensOil)).toEqual([]);
    expect(evaluateB06(w, nb).components.find((c) => c.id === 'optics')!.items.find((i) => i.key === 'b06.immersion')!.ok).toBe(true);
  });

  it('la máquina avanza solo por evidencia hasta COMPLETE', () => {
    const { w, nb } = idealAttemptB06();
    const a = createActor(practiceB06Machine).start();
    a.send({ type: 'START' });
    a.send({ type: 'PPE_CONFIRMED' });
    expect(b06StageName(a.getSnapshot().value)).toBe('CLASSIFICATION');
    a.send({ type: 'EVIDENCE', flags: b06StageEvidence(worldB06(), emptyB06Notebook()) });
    expect(b06StageName(a.getSnapshot().value)).toBe('CLASSIFICATION');
    a.send({ type: 'EVIDENCE', flags: b06StageEvidence(w, nb) });
    expect(b06StageName(a.getSnapshot().value)).toBe('COMPLETE');
  });

  it('es determinista y tolera reanudaciones entre preparaciones', () => {
    const a = idealAttemptB06(77);
    const b = idealAttemptB06(77, [], (w) => {
      const c = structuredClone(w);
      sanitizeOnResumeB06(c);
      return c;
    });
    expect(Object.keys(b.w.observations)).toEqual(Object.keys(a.w.observations));
    expect(errKeys(b.w)).toEqual([]);
  });

  it('recurso de Euglena ausente: incidencia sin descuento y ruta de protistas acreditada con Paramecium', () => {
    const { w, nb } = idealAttemptB06(9, ['SC-RESOURCE-OUTAGE']);
    expect(errKeys(w)).toEqual([]);
    expect(w.cell.missingAssets).toContain('euglena');
    expect(b06StageEvidence(w, nb).protists).toBe(true);
    expect(evaluateB06(w, nb).components.find((c) => c.id === 'safety')!.score).toBe(1);
  });

  it('sin escala: la medición queda diferida (null) y no descuenta', () => {
    const { w, nb } = idealAttemptB06(11, ['SC-NO-SCALE']);
    const ev = evaluateB06(w, nb);
    expect(ev.needsTeacherReview).toContain('b06.measure');
    expect(ev.components.flatMap((c) => c.items).filter((i) => i.ok === false)).toEqual([]);
  });
});
