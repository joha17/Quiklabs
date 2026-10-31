/** B07 — ruta completa solo con comandos: etapas por evidencia, conservación, nota alta y reanudación segura. */
import { describe, expect, it } from 'vitest';
import { b07StageEvidence } from '../../practices/practice-b07/evidence';
import { evaluateB07, notebookIssuesB07 } from '../../practices/practice-b07/rubric';
import { B07_SCENARIOS } from '../../practices/practice-b07/error-scenarios';
import { admissibleReadings } from '../../practices/practice-b07/expected-results';
import { emptyB07Notebook, gramRow } from '../../practices/practice-b07/notebook';
import { SC_B07, coloniesOf, conservedMicro, dispatchMicro } from '../../simulation/micro-world/world';
import type { MicroWorld } from '../../simulation/micro-world/types';
import { cmdM, distributionB07, fillNotebookB07, gramB07, idealRouteB07, mediaB07, observeM, platesB07, ppeB07, smearB07, toViewer, worldB07 } from '../helpersB07';

describe('B07: ruta ideal', () => {
  it('acredita todas las etapas, conserva y no acumula errores', () => {
    const out = idealRouteB07(worldB07());
    const nb = fillNotebookB07(out);
    const f = b07StageEvidence(out.w, nb);
    expect(f).toMatchObject({ ppe: true, media: true, plates: true, distribution: true, stain: true, optics: true, interpretation: true, benchRestored: true, notebook: true });
    expect(Object.keys(out.w.evidence).filter((k) => k.startsWith('err:'))).toEqual([]);
    expect(notebookIssuesB07(out.w, nb)).toEqual([]);
    for (const v of Object.values(conservedMicro(out.w))) expect(Math.abs(v)).toBeLessThan(1e-9);
    const ev = evaluateB07(out.w, nb);
    const bad = ev.components.flatMap((c) => c.items.filter((i) => i.ok === false).map((i) => i.key));
    expect(bad).toEqual([]);
    expect(ev.total).toBeGreaterThan(0.85);
  });
});

describe('B07: escenarios S01–S22', () => {
  const route = (w: MicroWorld) => {
    ppeB07(w);
    mediaB07(w);
    platesB07(w);
    distributionB07(w);
    smearB07(w);
    gramB07(w);
    return observeM(w, 'sl1');
  };
  it.each(B07_SCENARIOS.map((s) => s.id))('%s corre la ruta y conserva', (id) => {
    const w = worldB07({ scenarios: [id] });
    route(w);
    for (const v of Object.values(conservedMicro(w))) expect(Math.abs(v)).toBeLessThan(1e-9);
  });
  it('S21: «evidencia insuficiente» sobre datos incompatibles recibe el crédito', () => {
    const w = worldB07({ scenarios: [SC_B07.INCOMPATIBLE] });
    const obs = route(w);
    expect(w.slides.sl1.assetId).toBe('gramIncompatible');
    const nb = emptyB07Notebook('x');
    nb.gram[0] = { ...gramRow(), observationId: obs[obs.length - 1], interpretation: 'indeterminate', limits: 'Datos incompatibles' };
    expect(notebookIssuesB07(w, nb)).not.toContain('nb:MIC-54');
    nb.gram[0].interpretation = 'gram-positive';
    expect(notebookIssuesB07(w, nb)).toContain('nb:MIC-54');
  });
  it('S11: la preparación mixta validada solo admite una lectura mixta', () => {
    expect(admissibleReadings('gramMixed')).toEqual(['mixed', 'indeterminate']);
  });
  it('S04: confluente no da una medida válida; deja la incidencia', () => {
    const w = worldB07({ scenarios: [SC_B07.CONFLUENT] });
    ppeB07(w);
    toViewer(w, 'plA');
    const c = coloniesOf(w, 'plA')[0];
    cmdM(w, { type: 'measureColony', plateId: 'plA', colonyId: c.id, ax: c.x - 1, ay: c.y, bx: c.x + 1, by: c.y, scale: 'calibration' });
    expect(w.micro.measures[0].valid).toBe(false);
    expect(w.cell.incidents.length).toBeGreaterThan(0);
  });
  it('S20: el ítem de diámetro queda en revisión, no tachado', () => {
    const w = worldB07({ scenarios: [SC_B07.NO_SCALE] });
    const ev = evaluateB07(w, emptyB07Notebook());
    expect(ev.components.flatMap((c) => c.items).find((i) => i.key === 'b07.diameter')?.ok).toBeNull();
  });
  it('S18: pedir 100X sin módulo no descuenta', () => {
    const w = worldB07({ scenarios: [SC_B07.ONLY_40X] });
    ppeB07(w);
    dispatchMicro(w, { type: 'selectObjective', objectiveX: 100 });
    expect(Object.keys(w.evidence).filter((k) => k.startsWith('err:'))).toEqual([]);
    expect(w.cell.incidents.length).toBeGreaterThan(0);
  });
});
