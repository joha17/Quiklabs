/**
 * B03 — los 65 errores atribuibles (§9) y la incidencia técnica PERMRES: cada fixture ejecuta el gesto real y
 * comprueba la CONSECUENCIA en el estado (volúmenes, solutos, membrana, tubos, lecturas) o en la libreta, no solo el
 * aviso. PERMRES no deja ningún `err:*`.
 */
import { describe, expect, it } from 'vitest';
import type { PermWorld } from '../../simulation/perm-world/types';
import { conservedPerm, dispatchPerm } from '../../simulation/perm-world/world';
import { microscopeView } from '../../simulation/optical-world/world';
import { PREP_SPOT, STAGE_SEAT, stageTopZCm } from '../../simulation/optical-world/geometry';
import { SIMULATED_ERRORS_B03, type B03Scenario } from '../../practices/practice-b03/error-scenarios';
import { notebookIssuesB03 } from '../../practices/practice-b03/rubric';
import { emptyB03Notebook } from '../../practices/practice-b03/notebook';
import {
  cmdP, drops, elodeaMountP, emptyInto, errKeysB03, eye, focusP, idealAttemptB03, loadOsmosis, microscopeOnP, mountMembrane, pipette, placeP, pourTo, ppeB03,
  runP, scale, toObjectiveP, toStageP, worldB03,
} from '../helpersB03';

const err = (w: PermWorld, code: string) => w.evidence[`err:${code}`] ?? 0;
const base = (scenarios: B03Scenario[] = []) => {
  const w = worldB03({ scenarios });
  ppeB03(w);
  return w;
};
/** Cámara 1 sellada con agua y prueba de fugas superada. */
const leakTested = (scenarios: B03Scenario[] = []) => {
  const w = base(scenarios);
  mountMembrane(w, 'md1', 'c1');
  pourTo(w, 'bW', 'c1:A', 15);
  pourTo(w, 'bW', 'c1:B', 15);
  scale(w, 'c1:A');
  runP(w, 22);
  scale(w, 'c1:A');
  expect(w.perm.leakTestPassed).toEqual(['c1']);
  return w;
};
/** Diálisis cargada (agua en A; clara y NaCl en B). */
const dialysis = (opts: { egg?: number; salt?: number; membrane?: string } = {}) => {
  const w = leakTested();
  mountMembrane(w, opts.membrane ?? 'md2', 'c2');
  pourTo(w, 'bW', 'c2:A', 15);
  // La pipeta toma 5 mL como máximo: la clara se carga en tandas.
  for (let left = opts.egg ?? 10; left > 1e-9; left -= 5) pipette(w, 'bE', 'c2:B', Math.min(5, left));
  cmdP(w, { type: 'rinseTool', toolId: 'pi' });
  if ((opts.salt ?? 5) > 0) pipette(w, 'bN', 'c2:B', opts.salt ?? 5);
  cmdP(w, { type: 'rinseTool', toolId: 'pi' });
  return w;
};
/** Ósmosis montada con lecturas iniciales. */
const osmosis = (opts: { syrup?: string; side?: 'A' | 'B'; turns?: number } = {}) => {
  const w = leakTested();
  mountMembrane(w, 'md3', 'c3', { turns: opts.turns });
  loadOsmosis(w, opts.syrup ?? 'bS', opts.side ?? 'A');
  scale(w, 'c3:A');
  scale(w, 'c3:B');
  return w;
};
const seat = { x: STAGE_SEAT.x, y: STAGE_SEAT.y, z: stageTopZCm(6) };
/** Lámina de Elodea en agua, en la platina a 4X enfocada y con el ocular abierto. */
const onStage = (scenarios: B03Scenario[] = [], dropper = 'dw') => {
  const w = base(scenarios);
  microscopeOnP(w);
  elodeaMountP(w, 'sl1', 'cv1', dropper, 60);
  toObjectiveP(w, 4);
  toStageP(w, 'sl1');
  focusP(w);
  cmdP(w, { type: 'observe', instrument: 'compound', open: true });
  return w;
};
const capture = (w: PermWorld) => {
  runP(w, 1.6);
  const r = dispatchPerm(w, { type: 'captureObservation', instrument: 'compound' });
  return r.id ? w.observations[r.id] : null;
};
const tubeWith = (w: PermWorld, tube: string, label: string, source: string, ml = 2) => {
  cmdP(w, { type: 'labelTube', tubeId: tube, label });
  pipette(w, source, tube, ml);
};
const nbIssues = (w: PermWorld, fill: (nb: ReturnType<typeof emptyB03Notebook>) => void) => {
  const nb = emptyB03Notebook('x');
  fill(nb);
  return notebookIssuesB03(w, nb);
};

const FIXTURES: Record<string, () => void> = {
  PERM01: () => {
    const w = base();
    mountMembrane(w, 'md1', 'c1', { offset: 2 });
    expect(err(w, 'PERM01')).toBe(1);
    expect(w.perm.membranes.md1.areaFactor).toBeLessThan(0.7);
  },
  PERM02: () => {
    const w = base();
    mountMembrane(w, 'md1', 'c1', { turns: 0.5 });
    pourTo(w, 'bW', 'c1:A', 15);
    pourTo(w, 'bW', 'c1:B', 15);
    runP(w, 10);
    expect(err(w, 'PERM02')).toBe(1);
    expect(w.perm.cells.c1.leakOutMl).toBeGreaterThan(0);
    expect(w.perm.vessels.spill.volumeMl).toBeGreaterThan(0);
  },
  PERM03: () => {
    const w = base();
    mountMembrane(w, 'md1', 'c1');
    cmdP(w, { type: 'turnClamp', cellId: 'c1', deltaTurns: 1.5 });
    expect(err(w, 'PERM03')).toBe(1);
    expect(w.perm.membranes.md1.intact).toBe(false);
  },
  PERM04: () => {
    const w = base();
    placeP(w, 'md1', 'hand');
    cmdP(w, { type: 'insertMembrane', membraneId: 'md1', cellId: 'c1', offsetCm: 0 });
    expect(err(w, 'PERM04')).toBe(1);
    expect(w.perm.membranes.md1.wet01).toBeLessThan(0.6);
  },
  PERM05: () => {
    const w = base();
    mountMembrane(w, 'mce', 'c1');
    expect(err(w, 'PERM05')).toBe(1);
    expect(w.perm.membranes[w.perm.cells.c1.membraneId!].material).toBe('cellophane');
  },
  PERM06: () => {
    const w = base();
    mountMembrane(w, 'md1', 'c1', { turns: 0 });
    pourTo(w, 'bE', 'c1:A', 3);
    expect(err(w, 'PERM06')).toBe(1);
    expect(w.perm.membranes.md1.edgeContaminated).toBe(true);
  },
  PERM07: () => {
    const w = base();
    mountMembrane(w, 'md1', 'c1');
    pourTo(w, 'bN', 'c1:A', 5);
    expect(err(w, 'PERM07')).toBe(1);
    expect(w.perm.leakTestPassed).toEqual([]);
  },
  PERM08: () => {
    const w = base();
    mountMembrane(w, 'md1', 'c1');
    pourTo(w, 'bW', 'c1:A', 35);
    expect(err(w, 'PERM08')).toBe(1);
    expect(w.perm.cells.c1.sides.A.volumeMl).toBeCloseTo(30, 3);
    expect(w.perm.vessels.spill.volumeMl).toBeGreaterThan(1);
  },
  PERM09: () => {
    const w = base();
    mountMembrane(w, 'mdx', 'c1');
    pourTo(w, 'bW', 'c1:A', 15);
    pipette(w, 'bE', 'c1:B', 5);
    runP(w, 5);
    expect(err(w, 'PERM09')).toBe(1);
    // Rota: la proteína pasa al otro lado (no hay selectividad).
    expect(w.perm.cells.c1.sides.A.amounts.protein).toBeGreaterThan(0);
  },
  PERM10: () => {
    const w = leakTested();
    pipette(w, 'bI', 'c1:A', 5);
    cmdP(w, { type: 'drainCell', cellId: 'c1' });
    cmdP(w, { type: 'turnClamp', cellId: 'c1', deltaTurns: -2 });
    cmdP(w, { type: 'removeMembrane', cellId: 'c1' });
    expect(w.perm.membranes.md1.carry.tracer).toBeGreaterThan(0);
    cmdP(w, { type: 'insertMembrane', membraneId: 'md1', cellId: 'c2', offsetCm: 0 });
    cmdP(w, { type: 'turnClamp', cellId: 'c2', deltaTurns: 2 });
    pourTo(w, 'bW', 'c2:A', 10);
    runP(w, 0.1);
    expect(err(w, 'PERM10')).toBe(1);
    expect(w.perm.cells.c2.sides.A.amounts.tracer).toBeGreaterThan(0);
  },
  PERM11: () => {
    const w = leakTested();
    pipette(w, 'bI', 'c1:B', 5);
    expect(err(w, 'PERM11')).toBe(1);
    expect(w.perm.cells.c1.tracerSide).toBe('B');
  },
  PERM12: () => {
    const w = leakTested();
    pipette(w, 'bI', 'c1:A', 2);
    eye(w, 'c1:B');
    expect(err(w, 'PERM12')).toBe(1);
    expect(w.perm.cells.c1.tracerMl).toBeLessThan(3.5);
  },
  PERM13: () => {
    const w = leakTested();
    pipette(w, 'bI', 'c1:A', 5);
    pipette(w, 'bI', 'c1:A', 3);
    eye(w, 'c1:B');
    expect(err(w, 'PERM13')).toBe(1);
    expect(w.perm.cells.c1.tracerMl).toBeGreaterThan(6.5);
  },
  PERM14: () => {
    const w = leakTested();
    pipette(w, 'bI', 'c1:A', 5);
    pipette(w, 'bI', 'c1:B', 1);
    expect(err(w, 'PERM14')).toBe(1);
    expect(w.perm.cells.c1.sides.B.amounts.tracer).toBeGreaterThan(0.04);
  },
  PERM15: () => {
    const w = leakTested();
    pourTo(w, 'bW', 'c1:A', 12);
    cmdP(w, { type: 'setMixing', cellId: 'c1', side: 'A', rate01: 0.95 });
    expect(err(w, 'PERM15')).toBe(1);
    expect(w.perm.cells.c1.crossContaminated).toBe(true);
  },
  PERM16: () => {
    const w = leakTested();
    pipette(w, 'bI', 'c1:A', 5);
    runP(w, 25);
    eye(w, 'c1:B');
    expect(err(w, 'PERM16')).toBe(1);
    expect(w.evidence['diff:t0']).toBeFalsy();
  },
  PERM17: () => {
    const w = leakTested(['SC-05']);
    pipette(w, 'bI', 'c1:A', 5);
    runP(w, 60);
    expect(err(w, 'PERM17')).toBe(1);
    expect(w.perm.cells.c1.sides.B.amounts.tracer).toBe(0);
  },
  PERM18: () => {
    const w = base();
    mountMembrane(w, 'md1', 'c1');
    cmdP(w, { type: 'startPour', sourceId: 'bW', targetId: 'c1:A', tiltDeg: 60 });
    const r = cmdP(w, { type: 'requestTimeScale', x: 10 }, false);
    expect(r.ok).toBe(false);
    expect(err(w, 'PERM18')).toBe(1);
  },
  PERM19: () => {
    const w = leakTested();
    pipette(w, 'bI', 'c1:A', 5);
    const id = cmdP(w, { type: 'readInstrument', instrument: 'colorimeter', targetId: 'c1:B' }).id!;
    expect(err(w, 'PERM19')).toBe(1);
    expect(w.perm.readings[id].biased).toBe(true);
    expect(w.perm.readings[id].value).toBeGreaterThan(0.05);
  },
  PERM20: () => {
    const w = base();
    expect(nbIssues(w, (nb) => (nb.diffusion.rows[0].concentration = '0,002'))).toContain('nb:PERM20');
    const w6 = base(['SC-06']);
    expect(nbIssues(w6, (nb) => (nb.diffusion.rows[0].concentration = '0,002'))).not.toContain('nb:PERM20');
  },
  PERM21: () => {
    const w = dialysis({ membrane: 'mwp' });
    runP(w, 300);
    expect(err(w, 'PERM21')).toBe(1);
    expect(err(w, 'PERM05')).toBe(0);
    expect(w.perm.cells.c2.sides.A.amounts.protein).toBeGreaterThan(0);
  },
  PERM22: () => {
    const w = dialysis({ egg: 1 });
    cmdP(w, { type: 'aspirate', toolId: 'pi', sourceId: 'c2:B', volumeMl: 2 });
    expect(err(w, 'PERM22')).toBe(1);
  },
  PERM23: () => {
    const w = dialysis({ salt: 0 });
    cmdP(w, { type: 'aspirate', toolId: 'pi', sourceId: 'c2:A', volumeMl: 2 });
    expect(err(w, 'PERM23')).toBe(1);
    expect(w.perm.cells.c2.sides.B.amounts.salt).toBe(0);
  },
  PERM24: () => {
    const w = dialysis({ salt: 2 });
    cmdP(w, { type: 'aspirate', toolId: 'pi', sourceId: 'c2:A', volumeMl: 2 });
    expect(err(w, 'PERM24')).toBe(1);
  },
  PERM25: () => {
    const w = dialysis();
    // El lado B (clara + sal) casi lleno salpica al A por encima del tabique.
    pourTo(w, 'bW', 'c2:B', 12);
    cmdP(w, { type: 'setMixing', cellId: 'c2', side: 'B', rate01: 0.95 });
    expect(err(w, 'PERM25')).toBe(1);
    expect(w.perm.cells.c2.sides.A.amounts.protein).toBeGreaterThan(0);
  },
  PERM26: () => {
    const w = dialysis();
    tubeWith(w, 't1', 'A-Biuret', 'c2:B');
    expect(err(w, 'PERM26')).toBe(1);
    expect(w.perm.vessels.t1.amounts.protein).toBeGreaterThan(0);
  },
  PERM27: () => {
    const w = dialysis();
    pipette(w, 'c2:B', 't3', 2);
    cmdP(w, { type: 'aspirate', toolId: 'pi', sourceId: 'c2:A', volumeMl: 2 });
    expect(err(w, 'PERM27')).toBe(1);
    expect(w.perm.vessels.pi.amounts.protein).toBeGreaterThan(0);
  },
  PERM28: () => {
    const w = dialysis();
    const before = w.perm.cells.c2.sides.A.volumeMl;
    cmdP(w, { type: 'aspirate', toolId: 'pi', sourceId: 'c2:A', volumeMl: 4.5 });
    expect(err(w, 'PERM28')).toBe(1);
    expect(w.perm.cells.c2.sides.A.volumeMl).toBeCloseTo(before - 4.5, 6);
  },
  PERM29: () => {
    const w = dialysis();
    pipette(w, 'c2:A', 't1', 0.4);
    expect(err(w, 'PERM29')).toBe(1);
  },
  PERM30: () => {
    const w = dialysis();
    tubeWith(w, 't1', 'A-Biuret', 'c2:A');
    drops(w, 'dAg', 't1', 2);
    expect(err(w, 'PERM30')).toBe(1);
    expect(w.perm.tubes.t1.gotSilver).toBe(true);
  },
  PERM31: () => {
    const w = dialysis();
    tubeWith(w, 't2', 'A-Ag', 'c2:A');
    drops(w, 'dBi', 't2', 2);
    expect(err(w, 'PERM31')).toBe(1);
    expect(w.perm.vessels.t2.biuretMl).toBeGreaterThan(0);
  },
  PERM32: () => {
    const w = dialysis();
    tubeWith(w, 't3', 'B-Biuret', 'c2:B');
    const id = eye(w, 't3');
    expect(err(w, 'PERM32')).toBe(1);
    expect(w.perm.readings[id].quality).toBe('none');
  },
  PERM33: () => {
    const w = dialysis();
    tubeWith(w, 't4', 'B-Ag', 'c2:B');
    const id = eye(w, 't4');
    expect(err(w, 'PERM33')).toBe(1);
    expect(w.perm.readings[id].quality).toBe('none');
  },
  PERM34: () => {
    const w = dialysis();
    tubeWith(w, 't3', 'B-Biuret', 'c2:B');
    drops(w, 'dBi', 't3');
    const early = eye(w, 't3');
    runP(w, 130);
    const late = eye(w, 't3');
    expect(err(w, 'PERM34')).toBe(1);
    expect(w.perm.readings[early].value).toBeLessThan(w.perm.readings[late].value);
  },
  PERM35: () => {
    const w = dialysis();
    tubeWith(w, 't1', 'A-Biuret', 'c2:A');
    cmdP(w, { type: 'disposeTube', tubeId: 't1' });
    expect(err(w, 'PERM35')).toBe(1);
    expect(w.perm.tubes.t1.readAt).toBeNull();
  },
  PERM36: () => {
    const w = osmosis({ side: 'B' });
    runP(w, 300);
    expect(err(w, 'PERM36')).toBe(1);
    // El agua va hacia el jarabe (B): el lado A baja.
    expect(w.perm.cells.c3.sides.A.volumeMl).toBeLessThan(20);
  },
  PERM37: () => {
    const w = osmosis({ syrup: 'bSc' });
    expect(err(w, 'PERM37')).toBe(1);
    expect(w.perm.cells.c3.sides.A.tags).toContain('bSc');
  },
  PERM38: () => {
    const w = osmosis({ syrup: 'bL' });
    expect(err(w, 'PERM38')).toBe(1);
    expect(w.perm.cells.c3.sides.A.tags).toContain('bL');
  },
  PERM39: () => {
    const w = leakTested();
    mountMembrane(w, 'md3', 'c3');
    pourTo(w, 'bS', 'g2', 12, 55);
    emptyInto(w, 'g2', 'c3:A');
    pourTo(w, 'bW', 'g2', 20, 55);
    emptyInto(w, 'g2', 'c3:B');
    scale(w, 'c3:A');
    expect(err(w, 'PERM39')).toBe(1);
    expect(w.perm.cells.c3.sides.A.volumeMl).toBeLessThan(18);
  },
  PERM40: () => {
    const w = base();
    pourTo(w, 'bW', 'g1', 10, 50);
    const id = scale(w, 'g1', 30);
    expect(err(w, 'PERM40')).toBe(1);
    expect(w.perm.readings[id].biased).toBe(true);
    expect(Math.abs(w.perm.readings[id].value - w.perm.vessels.g1.volumeMl)).toBeGreaterThan(0.4);
  },
  PERM41: () => {
    const w = osmosis();
    runP(w, 1205);
    scale(w, 'c3:A');
    scale(w, 'c3:B');
    cmdP(w, { type: 'drainCell', cellId: 'c3' });
    expect(err(w, 'PERM41')).toBe(1);
    expect(w.evidence['read:thermo']).toBeFalsy();
  },
  PERM42: () => {
    const w = osmosis();
    cmdP(w, { type: 'setLid', cellId: 'c3', closed: false });
    runP(w, 90);
    expect(err(w, 'PERM42')).toBe(1);
    expect(w.perm.evaporatedMl).toBeGreaterThan(0);
  },
  PERM43: () => {
    const w = osmosis({ turns: 0.5 });
    runP(w, 30);
    expect(err(w, 'PERM43')).toBe(1);
    expect(w.perm.cells.c3.leakOutMl).toBeGreaterThan(0);
  },
  PERM44: () => {
    const w = osmosis();
    runP(w, 120);
    scale(w, 'c3:A');
    scale(w, 'c3:B');
    cmdP(w, { type: 'drainCell', cellId: 'c3' });
    expect(err(w, 'PERM44')).toBe(1);
  },
  PERM45: () => {
    const w = osmosis();
    pipette(w, 'bW', 'c3:B', 3);
    expect(err(w, 'PERM45')).toBe(1);
    expect(w.perm.cells.c3.sides.B.volumeMl).toBeGreaterThan(22);
  },
  PERM46: () => {
    const w = base();
    placeP(w, 'sl1', 'prep', PREP_SPOT);
    cmdP(w, { type: 'pickSpecimen', toolId: 'fc', sourceId: 'el' });
    runP(w, 100);
    cmdP(w, { type: 'placeSpecimen', toolId: 'fc', targetId: 'sl1', dxCm: 0, dyCm: 0 });
    expect(err(w, 'PERM46')).toBe(1);
    expect(w.perm.elodea.sl1.dried).toBe(true);
  },
  PERM47: () => {
    const w = base();
    elodeaMountP(w, 'sl1', 'cv1', 'dw', 1);
    cmdP(w, { type: 'squeezeDropper', dispenserId: 'n5', targetId: 'sl1', force01: 0.5, dxCm: 0, dyCm: 0 });
    expect(err(w, 'PERM47')).toBe(1);
    expect(w.perm.elodea.sl1.extOsm).toBeGreaterThanOrEqual(0);
  },
  PERM48: () => {
    const w = base();
    placeP(w, 'sl1', 'prep', PREP_SPOT);
    cmdP(w, { type: 'pickSpecimen', toolId: 'fc', sourceId: 'el' });
    cmdP(w, { type: 'placeSpecimen', toolId: 'fc', targetId: 'sl1', dxCm: 0, dyCm: 0 });
    for (let i = 0; i < 4; i++) cmdP(w, { type: 'squeezeDropper', dispenserId: 'n09', targetId: 'sl1', force01: 1, dxCm: 0, dyCm: 0 });
    cmdP(w, { type: 'wipe', targetId: 'fc', toolId: 'lp' });
    cmdP(w, { type: 'grabCover', coverId: 'cv1', toolId: 'fc' });
    cmdP(w, { type: 'setCoverTilt', coverId: 'cv1', angleDeg: 45 });
    cmdP(w, { type: 'lowerCover', coverId: 'cv1', slideId: 'sl1', speedCmS: 0.4, dxCm: 0, dyCm: 0 });
    expect(err(w, 'PERM48')).toBe(1);
    expect(w.fluids.spilledMl).toBeGreaterThan(0);
  },
  PERM49: () => {
    const w = base();
    placeP(w, 'sl1', 'prep', PREP_SPOT);
    cmdP(w, { type: 'pickSpecimen', toolId: 'fc', sourceId: 'el' });
    cmdP(w, { type: 'placeSpecimen', toolId: 'fc', targetId: 'sl1', dxCm: 0, dyCm: 0 });
    runP(w, 40);
    expect(err(w, 'PERM49')).toBe(1);
    expect(w.mounts.sl1.hydrated01).toBeLessThan(0.6);
  },
  PERM50: () => {
    const w = base();
    placeP(w, 'sl1', 'prep', PREP_SPOT);
    cmdP(w, { type: 'pickSpecimen', toolId: 'fc', sourceId: 'el' });
    cmdP(w, { type: 'placeSpecimen', toolId: 'fc', targetId: 'sl1', dxCm: 0, dyCm: 0 });
    cmdP(w, { type: 'squeezeDropper', dispenserId: 'dw', targetId: 'sl1', force01: 0.5, dxCm: 0, dyCm: 0 });
    cmdP(w, { type: 'wipe', targetId: 'fc', toolId: 'lp' });
    cmdP(w, { type: 'grabCover', coverId: 'cv1', toolId: 'fc' });
    cmdP(w, { type: 'setCoverTilt', coverId: 'cv1', angleDeg: 4 });
    cmdP(w, { type: 'lowerCover', coverId: 'cv1', slideId: 'sl1', speedCmS: 2, dxCm: 0, dyCm: 0 });
    expect(err(w, 'PERM50')).toBe(1);
    expect(w.mounts.sl1.bubbleFraction).toBeGreaterThan(0.3);
  },
  PERM51: () => {
    const w = base();
    elodeaMountP(w, 'sl1', 'cv1', 'dw', 1);
    cmdP(w, { type: 'openClip', open: false });
    const r = placeP(w, 'sl1', 'stage', seat, false);
    expect(r.ok).toBe(false);
    expect(err(w, 'PERM51')).toBe(1);
    expect(w.microscope.slideOnStage).toBeNull();
  },
  PERM52: () => {
    const w = base();
    elodeaMountP(w, 'sl1', 'cv1', 'dw', 1);
    toStageP(w, 'sl1');
    toObjectiveP(w, 40);
    expect(err(w, 'PERM52')).toBe(1);
  },
  PERM53: () => {
    const w = onStage();
    capture(w);
    toObjectiveP(w, 10);
    toObjectiveP(w, 40);
    focusP(w);
    for (let i = 0; i < 40 && !err(w, 'PERM53'); i++) dispatchPerm(w, { type: 'turnFine', deltaTurns: 0.5 });
    expect(err(w, 'PERM53')).toBe(1);
    expect(w.microscope.impactCount).toBe(1);
  },
  PERM54: () => {
    const w = onStage();
    capture(w);
    toObjectiveP(w, 10);
    toObjectiveP(w, 40);
    dispatchPerm(w, { type: 'turnCoarse', deltaTurns: 0.2 });
    expect(err(w, 'PERM54')).toBeGreaterThan(0);
    expect(microscopeView(w).gapMm).toBeLessThan(w.params.microscope.gapSafeRemoveMm);
  },
  PERM55: () => {
    const w = onStage();
    capture(w);
    cmdP(w, { type: 'setStageXY', xMm: -2.6, yMm: 0 });
    toObjectiveP(w, 10);
    expect(err(w, 'PERM55')).toBe(1);
  },
  PERM56: () => {
    const w = onStage();
    cmdP(w, { type: 'setIllumination', device: 'microscope', value01: 0.05 });
    expect(capture(w)!.isObservationValid).toBe(false);
    expect(err(w, 'PERM56')).toBe(1);
  },
  PERM57: () => {
    const w = onStage();
    const o = capture(w)!;
    const issues = nbIssues(w, (nb) => (nb.micro.rows[0] = { observationId: o.id, treatment: 'water', totalMag: '40', condition: 'plasmolyzed', structures: [] }));
    expect(issues).toContain('nb:PERM57');
    expect(o.assetId).toBe('elodea');
  },
  PERM58: () => {
    const w = onStage();
    const o = capture(w)!;
    expect(nbIssues(w, (nb) => (nb.micro.rows[0] = { observationId: o.id, treatment: 'nacl-5', totalMag: '40', condition: 'turgid', structures: [] }))).toContain('nb:PERM58');
  },
  PERM59: () => {
    const w = onStage();
    toObjectiveP(w, 10);
    cmdP(w, { type: 'closeBench' });
    expect(err(w, 'PERM59')).toBe(1);
    expect(w.evidence.safeParked).toBeFalsy();
  },
  PERM60: () => {
    const w = base();
    expect(nbIssues(w, (nb) => (nb.micro.iso09 = 'isotonic'))).toContain('nb:PERM60');
  },
  PERM61: () => {
    const w = base();
    expect(nbIssues(w, (nb) => (nb.dialysis.silverShows = 'allMinerals'))).toContain('nb:PERM61');
  },
  PERM62: () => {
    const w = base();
    mountMembrane(w, 'md1', 'c1', { turns: 0.5 });
    pourTo(w, 'bW', 'c1:A', 15);
    pourTo(w, 'bW', 'c1:B', 15);
    runP(w, 20);
    expect(nbIssues(w, (nb) => (nb.diffusion.attribution = 'diffusion'))).toContain('nb:PERM62');
    expect(nbIssues(w, (nb) => (nb.diffusion.attribution = 'leak'))).not.toContain('nb:PERM62');
  },
  PERM63: () => {
    const w = osmosis();
    const temp = cmdP(w, { type: 'readInstrument', instrument: 'thermo', targetId: 'c3' }).id!;
    const issues = nbIssues(w, (nb) => {
      nb.osmosis.tempReadingId = temp;
      nb.osmosis.deltaOsm = '2';
      nb.osmosis.piKPa = (8.314462618 * 25 * 2).toFixed(1);
    });
    expect(issues).toContain('nb:PERM63');
  },
  PERM64: () => {
    const { w, nb } = idealAttemptB03(64);
    nb.osmosis.fluxMlS = nb.osmosis.dVB.replace('-', '');
    expect(notebookIssuesB03(w, nb)).toContain('nb:PERM64');
  },
  PERM65: () => {
    const { w, nb } = idealAttemptB03(65);
    nb.osmosis.dVB = nb.osmosis.dVB.startsWith('-') ? nb.osmosis.dVB.slice(1) : `-${nb.osmosis.dVB}`;
    expect(notebookIssuesB03(w, nb)).toContain('nb:PERM65');
  },
  PERMRES: () => {
    const w = onStage(['SC-18'], 'n5');
    runP(w, 150);
    const o = capture(w)!;
    expect(o.isObservationValid).toBe(false);
    expect(o.issues).toContain('ASSET_MISSING');
    expect(w.cell.incidents).toEqual(['elodeaPlasmo']);
    expect(errKeysB03(w)).toEqual([]);
  },
};

describe('B03 — 65 errores con consecuencia causal y una incidencia técnica (§9)', () => {
  it('el catálogo tiene 66 casos únicos y una fixture por cada uno', () => {
    const codes = SIMULATED_ERRORS_B03.map((e) => e.code);
    expect(new Set(codes).size).toBe(66);
    expect(Object.keys(FIXTURES).sort()).toEqual([...codes].sort());
  });
  for (const e of SIMULATED_ERRORS_B03) it(`${e.code} — ${e.trigger} → ${e.effect}`, () => FIXTURES[e.code]());
  it('el camino correcto no comete ninguno y conserva los balances', () => {
    const { w } = idealAttemptB03(31);
    expect(errKeysB03(w)).toEqual([]);
    for (const [k, v] of Object.entries(conservedPerm(w))) expect(Math.abs(v), k).toBeLessThan(1e-6);
  });
  it('ningún código de B01/B02 sin traducir llega a la evidencia de B03', () => {
    const { w } = idealAttemptB03(31);
    const w2 = base();
    cmdP(w2, { type: 'squeezeDropper', dispenserId: 'dw', targetId: 'bench', force01: 0.5, dxCm: 0, dyCm: 0 });
    for (const k of [...errKeysB03(w), ...errKeysB03(w2)]) expect(k).toMatch(/^err:(PERM\d\d|PPE)$/);
  });
  it('los errores conservan volumen y solutos (las fugas y derrames van al balance)', () => {
    for (const code of ['PERM02', 'PERM08', 'PERM09', 'PERM15', 'PERM25', 'PERM27', 'PERM42']) {
      const w = base();
      void code;
      mountMembrane(w, 'md1', 'c1', { turns: 0.5 });
      pourTo(w, 'bW', 'c1:A', 28);
      pipette(w, 'bE', 'c1:B', 5);
      cmdP(w, { type: 'setMixing', cellId: 'c1', side: 'A', rate01: 1 });
      runP(w, 30);
      for (const [k, v] of Object.entries(conservedPerm(w))) expect(Math.abs(v), k).toBeLessThan(1e-6);
    }
  });
});
