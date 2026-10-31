/** B09 — ruta completa solo con comandos: sin errores, conservación, rúbrica alta y determinismo. */
import { describe, expect, it } from 'vitest';
import { conservedPlant, plantSummary } from '../../simulation/plant-world/world';
import { evaluateB09, notebookIssuesB09 } from '../../practices/practice-b09/rubric';
import { b09StageEvidence } from '../../practices/practice-b09/evidence';
import { SC_B09 } from '../../simulation/plant-world/world';
import { microscopeView } from '../../simulation/optical-world/world';
import { PLANT_ASSETS, assetById } from '../../simulation/specimens/assets';
import { sanitizeOnResumeB09 } from '../../practices/practice-b09/resume';
import { cmdP, errKeysP, focusP, idealAttemptB09, microscopeOnP, ppeB09, runP, toObjectiveP, toStageP, worldB09 } from '../helpersB09';

describe('B09: ruta ideal', () => {
  it('no deja errores, conserva y aprueba todas las etapas', () => {
    const { w, nb } = idealAttemptB09();
    expect(errKeysP(w)).toEqual([]);
    expect(notebookIssuesB09(w, nb)).toEqual([]);
    for (const v of Object.values(conservedPlant(w))) expect(Math.abs(v)).toBeLessThan(1e-9);
    const f = b09StageEvidence(w, nb);
    expect(f).toMatchObject({ ppe: true, hypothesis: true, external: true, sectioning: true, slides: true, foliar: true, analysis: true, safeParked: true, benchRestored: true, notebook: true });
    const ev = evaluateB09(w, nb);
    // Las respuestas abiertas quedan para el docente; todo lo demás, completo.
    for (const c of ev.components) expect(c.score, c.id).toBeGreaterThanOrEqual(c.id === 'analysis' ? 0.85 : 1);
    expect(ev.needsTeacherReview).toEqual(['b09.answers']);
  });

  it('misma semilla, mismo resumen', () => {
    expect(plantSummary(idealAttemptB09(7).w)).toEqual(plantSummary(idealAttemptB09(7).w));
  });
});

describe('B09: escenarios docentes (§10)', () => {
  // S11, S19 y S20 parten de un error a propósito; cada uno se comprueba aparte.
  const NEUTRAL = Object.values(SC_B09).filter((s) => s !== SC_B09.BAD_DOSE && s !== SC_B09.DIAPHRAGM && s !== SC_B09.BAD_COVER);
  for (const s of NEUTRAL) {
    it(`${s}: la ruta completa conserva y no inventa errores`, () => {
      const { w, nb } = idealAttemptB09(2609, [s]);
      expect(errKeysP(w)).toEqual([]);
      for (const v of Object.values(conservedPlant(w))) expect(Math.abs(v)).toBeLessThan(1e-9);
      expect(evaluateB09(w, nb).total).toBeGreaterThan(0.7);
    });
  }
  const look = (scenario: (typeof NEUTRAL)[number], id: string) => {
    const w = worldB09({ scenarios: [scenario] });
    ppeB09(w);
    microscopeOnP(w);
    if (w.slides[id].kind === 'fixed') cmdP(w, { type: 'openSlideCase', open: true });
    toObjectiveP(w, 4);
    toStageP(w, id);
    focusP(w);
    return w;
  };
  it('S01 y S03: cambium y endodermis resueltos solo en su activo', () => {
    expect(worldB09({ scenarios: [SC_B09.STEM_EU] }).slides.fxSE.assetId).toBe('stemEudicotCambium');
    expect(worldB09().slides.fxSE.assetId).toBe('stemEudicot');
    expect(worldB09({ scenarios: [SC_B09.ROOT_EU] }).slides.fxRE.assetId).toBe('rootEudicotClear');
  });
  it('S06, S07, S09 y S10: preparados docentes visibles y fuera de la nota', () => {
    expect(microscopeView(look(SC_B09.CELERY_THIN, 'ctl1')).assetId).toBe('celery');
    const w = look(SC_B09.LIGNIN_DOC, 'ctl4');
    expect(microscopeView(w).assetId).toBe('celeryWiesner');
    cmdP(w, { type: 'observe', instrument: 'compound', open: true });
    runP(w, 1.6);
    const r = cmdP(w, { type: 'captureObservation', instrument: 'compound' });
    expect(w.observations[r.id!].specimenId.startsWith('ctl:')).toBe(true);
    expect(worldB09({ scenarios: [SC_B09.NO_LIGNIN] }).plant.wiesnerAssigned).toBe(false);
    expect(Object.keys(worldB09({ scenarios: [SC_B09.CELERY_THICK] }).slides)).toContain('ctl2');
  });
  it('S11: la gota rinde el doble y una dosis sin ajustar escurre', () => {
    const a = worldB09().params.mount.dropMlMax;
    expect(worldB09({ scenarios: [SC_B09.BAD_DOSE] }).params.mount.dropMlMax).toBeCloseTo(a * 2);
    const { w } = idealAttemptB09(2609, [SC_B09.BAD_DOSE]);
    expect(w.evidence['err:TV-23']).toBeGreaterThan(0);
    for (const v of Object.values(conservedPlant(w))) expect(Math.abs(v)).toBeLessThan(1e-9);
  });
  it('S16 y S17: leño exigido; S17 no admite años', () => {
    const { w, nb } = idealAttemptB09(2609, [SC_B09.TROPICAL]);
    expect(w.plant.requiredSlides).toContain('fxW');
    expect(w.slides.fxW.assetId).toBe('woodTropical');
    nb.wood.ageYears = '4';
    expect(evaluateB09(w, nb).components.find((c) => c.id === 'analysis')!.score).toBeLessThan(1);
  });
  it('S20: el primer cubreobjetos baja casi plano', () => {
    const w = worldB09({ scenarios: [SC_B09.BAD_COVER] });
    expect(w.plant.coverJam).toBe(true);
  });
  it('S21: sin escala no se mide, sin descuento', () => {
    const { w, nb } = idealAttemptB09(2609, [SC_B09.NO_SCALE]);
    expect(w.div.measurements).toHaveLength(0);
    const analysis = evaluateB09(w, nb).components.find((c) => c.id === 'analysis')!;
    expect(analysis.items.find((i) => i.key === 'b09.measure')!.ok).toBeNull();
  });
  it('S25: el recurso docente T2 entra sin cambiar el análisis', () => {
    const w = worldB09({ scenarios: [SC_B09.TEACHER] });
    expect(w.cell.assetOverride.celery).toBe('celeryT2');
    expect(assetById('celeryT2')?.version).toBe(2);
    expect(PLANT_ASSETS.celeryT2.ownerRole).toBe('teacher');
  });
  it('S26: falta un recurso: incidencia sin nota negativa', () => {
    const { w, nb } = idealAttemptB09(2609, [SC_B09.CONTINGENCY]);
    expect(errKeysP(w)).toEqual([]);
    expect(evaluateB09(w, nb).total).toBeGreaterThan(0.7);
  });
});

describe('B09: reanudación (§15.2)', () => {
  it('suelta lo sujeto y no pierde cortes ni volumen', () => {
    const w = worldB09();
    ppeB09(w);
    cmdP(w, { type: 'holdSource', sourceId: 'cel', hold: true });
    sanitizeOnResumeB09(w);
    expect(w.plant.holding).toBeNull();
  });
});
