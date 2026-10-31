import { describe, expect, it } from 'vitest';
import { conservedPhoto } from '../../simulation/photo-world/world';
import { b08StageEvidence } from '../../practices/practice-b08/evidence';
import { evaluateB08, notebookIssuesB08 } from '../../practices/practice-b08/rubric';
import { B08_SCENARIOS } from '../../practices/practice-b08/error-scenarios';
import { fillNotebookB08, idealRouteB08, worldB08 } from '../helpersB08';

describe('B08: ruta ideal A → D → E → B → C → F', () => {
  const out = idealRouteB08(worldB08());
  const nb = fillNotebookB08(out);
  const w = out.w;
  it('sin errores de técnica ni de libreta', () => {
    expect(Object.keys(w.evidence).filter((k) => k.startsWith('err:'))).toEqual([]);
    expect(notebookIssuesB08(w, nb)).toEqual([]);
  });
  it('etapas por evidencia', () => {
    const f = b08StageEvidence(w, nb);
    for (const [k, v] of Object.entries(f)) expect(v, k).toBe(true);
  });
  it('la luz sube la columna y la oscuridad la baja, cerca del caso de referencia', () => {
    const dh = (a: string, b: string) => w.photo.readings.find((r) => r.id === b)!.value - w.photo.readings.find((r) => r.id === a)!.value;
    expect(dh(out.base.baseL, out.fin.finalL)).toBeGreaterThanOrEqual(15);
    expect(dh(out.base.baseL, out.fin.finalL)).toBeLessThanOrEqual(19);
    expect(dh(out.base.baseD, out.fin.finalD)).toBe(-6);
  });
  it('BTB: el control y la oscuridad siguen en amarillo; la planta iluminada vira a azul', () => {
    const col = (id: string) => w.photo.readings.find((r) => r.id === out.b1[id])!.color;
    expect(col('bN')).toBe('yellow');
    expect(col('bD')).toBe('yellow');
    expect(col('bL')).toBe('blue');
    expect(w.photo.btb.bN.biomassUmol).toBe(0);
  });
  it('conservación en todos los balances', () => {
    for (const [k, v] of Object.entries(conservedPhoto(w))) expect(Math.abs(v), k).toBeLessThan(1e-6);
  });
  it('nota completa salvo revisión docente', () => {
    const ev = evaluateB08(w, nb);
    const bad = ev.components.flatMap((c) => c.items.filter((i) => i.ok === false).map((i) => i.key));
    expect(bad).toEqual([]);
    expect(Math.abs(ev.components.reduce((s, c) => s + c.weight, 0) - 1)).toBeLessThan(1e-9);
    expect(ev.needsTeacherReview.length).toBeGreaterThan(0);
  });
});

describe('B08: escenarios S01–S28', () => {
  it.each(B08_SCENARIOS.map((s) => s.id))('%s corre la ruta posible y conserva', (id) => {
    const w0 = worldB08({ scenarios: [id] });
    const out = idealRouteB08(w0);
    for (const [k, v] of Object.entries(conservedPhoto(out.w))) expect(Math.abs(v), k).toBeLessThan(1e-6);
  }, 60000);
});
