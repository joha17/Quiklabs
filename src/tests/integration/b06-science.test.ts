/**
 * Casos de referencia de B06 (§8, REF-01…12): aumento, campo visual, longitud con incertidumbre, escala ausente,
 * bacteria sin nucléolo, velocidad sin video, sangre según el manifiesto, determinismo y reconstrucción del estado.
 */
import { describe, expect, it } from 'vitest';
import { fieldUm, lengthWithUncertainty, totalMag, viscosityOf, predictedSpeedUmS } from '../../simulation/div-world/world';
import { assetById, visibleStructures } from '../../simulation/specimens/assets';
import { evaluateB06 } from '../../practices/practice-b06/rubric';
import { sanitizeOnResumeB06 } from '../../practices/practice-b06/resume';
import { cmdD, cultureMount, fixedSlideRoute, idealAttemptB06, markAt, microscopeOn, observeOnStage, ppeB06, worldB06 } from '../helpersB06';

describe('B06 · ciencia (§8)', () => {
  it('REF-01: ocular 10X × objetivo 40X = 400X', () => {
    expect(totalMag(10, 40)).toBe(400);
    expect(worldB06().params.microscope.ocularX * 40).toBe(400);
  });

  it('REF-02…04: campo visual con FN 18 mm a 4X, 40X y 100X', () => {
    expect(fieldUm(18, 4)).toBe(4500);
    expect(fieldUm(18, 40)).toBe(450);
    expect(fieldUm(18, 100)).toBe(180);
  });

  it('REF-05/06: L = p·s y u_L = √((p·u_s)² + (s·u_p)²)', () => {
    expect(lengthWithUncertainty(80, 0.25, 0, 0).lengthUm).toBe(20);
    expect(lengthWithUncertainty(100, 0.2, 0, 0).lengthUm).toBe(20);
    const r = lengthWithUncertainty(80, 0.25, 0.005, 2);
    expect(r.uncertaintyUm).toBeCloseTo(Math.sqrt((80 * 0.005) ** 2 + (0.25 * 2) ** 2), 6);
  });

  it('REF-05 en el mundo: la escala µm/px sale del campo del objetivo y la medición coincide', () => {
    const { w, res } = idealAttemptB06();
    const m = w.div.measurements.find((x) => x.id === res.measurement)!;
    expect(m.umPerPx).toBeCloseTo(fieldUm(w.params.microscope.fieldNumberMm ?? 18, m.objectiveX) / w.params.div!.imagePx, 6);
    expect(m.lengthUm).toBeCloseTo(m.rawPixelDistance * m.umPerPx, 6);
    expect(m.uncertaintyUm).toBeGreaterThan(0);
  });

  it('REF-07: sin escala certificada la medición se rechaza con UNCALIBRATED_SCALE y sin error del estudiante', () => {
    const { w, res } = idealAttemptB06(2606, ['SC-NO-SCALE']);
    expect(res.measurement).toBeNull();
    const obs = res.paramecium[40];
    const r = cmdD(w, { type: 'measure', observationId: obs, ax: 100, ay: 500, bx: 900, by: 500, scale: 'calibration' }, false);
    expect(r).toMatchObject({ ok: false, code: 'UNCALIBRATED_SCALE' });
    expect(Object.keys(w.evidence).filter((k) => k.startsWith('err:'))).toEqual([]);
    expect(w.cell.incidents.some((k) => k.startsWith('scale:'))).toBe(true);
  });

  it('REF-08: el nucléolo bacteriano nunca vale, sea cual sea la imagen', () => {
    for (const id of ['bacillus', 'cyano']) expect(assetById(id)!.annotations.some((a) => (a.structureId as string) === 'nucleolus' || a.structureId === 'nucleus')).toBe(false);
    const w = worldB06();
    ppeB06(w);
    microscopeOn(w);
    const bo = fixedSlideRoute(w, 'fxB', [40]);
    const r = cmdD(w, { type: 'markRegion', observationId: bo[40], structure: 'nucleolus', u: 0.5, v: 0.5 });
    expect(w.div.marks.find((m) => m.id === r.id)?.verdict).toBe('never');
    expect(w.evidence['err:CEL-054']).toBeGreaterThan(0);
  });

  it('REF-09: velocidad de Paramecium con foto estática → no evaluable (sin trayectoria inventada)', () => {
    const w = worldB06({ scenarios: ['SC-PAR-MOTILITY'] });
    ppeB06(w);
    microscopeOn(w);
    cultureMount(w, 'paramecium', 'sl3', 'cv3');
    observeOnStage(w, 'sl3', [4, 10, 40]);
    const r = cmdD(w, { type: 'estimateSpeed', slideId: 'sl3' }, false);
    expect(r).toMatchObject({ ok: false, code: 'NOT_EVALUABLE' });
    // El modelo cualitativo frena a los ciliados con metilcelulosa (viscosidad > 1), pero no publica un número.
    expect(viscosityOf(w, 'sl3')).toBe(1);
    expect(predictedSpeedUmS(w, 'sl3')).toBeGreaterThan(0);
  });

  it('REF-10: en la sangre solo valen las regiones visibles del manifiesto; no hay punción', () => {
    const a = assetById('blood')!;
    const vis = visibleStructures(a, [0, 0], 0.45, { objectiveX: 40 });
    expect(vis).toEqual(expect.arrayContaining(['erythrocyte', 'leukocyte']));
    const w = worldB06();
    ppeB06(w);
    microscopeOn(w);
    const so = fixedSlideRoute(w, 'fxS', [10, 40]);
    expect(markAt(w, so[40], 'erythrocyte').ok).toBe(true);
    expect(w.div.marks.at(-1)!.verdict).toBe('valid');
    expect(cmdD(w, { type: 'useLancet' }, false).ok).toBe(false);
    expect(w.evidence['err:CEL-005']).toBeGreaterThan(0);
  });

  it('REF-11: misma semilla, comandos y activos → mismos hashes y misma rúbrica', () => {
    const a = idealAttemptB06(4242);
    const b = idealAttemptB06(4242);
    expect(Object.values(b.w.observations).map((o) => o.captureHash)).toEqual(Object.values(a.w.observations).map((o) => o.captureHash));
    expect(JSON.stringify(b.w.div.measurements)).toBe(JSON.stringify(a.w.div.measurements));
    expect(evaluateB06(b.w, b.nb).total).toBe(evaluateB06(a.w, a.nb).total);
  });

  it('REF-12: reconstruir el estado (serializar y reanudar) conserva mediciones y puntuación', () => {
    const a = idealAttemptB06(31);
    const c = JSON.parse(JSON.stringify(a.w));
    sanitizeOnResumeB06(c);
    expect(c.div.measurements).toEqual(a.w.div.measurements);
    expect(c.div.marks).toEqual(a.w.div.marks);
    expect(evaluateB06(c, a.nb).total).toBe(evaluateB06(a.w, a.nb).total);
  });
});
