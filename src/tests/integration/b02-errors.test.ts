/**
 * B02 — los 67 errores atribuibles (§9) y la incidencia técnica CEL68: cada fixture ejecuta el gesto real y comprueba
 * la CONSECUENCIA en el estado, la observación o la libreta (no solo el aviso). CEL68 no deja ningún `err:*`.
 */
import { describe, expect, it } from 'vitest';
import type { CellWorld } from '../../simulation/cell-world/types';
import { SC, conservedCell, dispatchCell } from '../../simulation/cell-world/world';
import { microscopeView } from '../../simulation/optical-world/world';
import { STAGE_SEAT, caseSlotPos, stageTopZCm } from '../../simulation/optical-world/geometry';
import { SIMULATED_ERRORS_B02, type B02Scenario } from '../../practices/practice-b02/error-scenarios';
import { evaluateB02, notebookIssuesB02 } from '../../practices/practice-b02/rubric';
import { emptyB02Notebook } from '../../practices/practice-b02/notebook';
import { focusStereo } from '../helpersB01';
import {
  buccalMount, cmdC, coverC, dropC, elodeaMount, errKeys, focusC, fruitMount, idealAttemptB02, microscopeOn, placeC, potatoMount, ppeB02, runC, slideToPrep, toObjectiveC,
  toStageC, worldB02,
} from '../helpersB02';

const err = (w: CellWorld, code: string) => w.evidence[`err:${code}`] ?? 0;
const base = (scenarios: B02Scenario[] = []) => {
  const w = worldB02({ scenarios });
  ppeB02(w);
  return w;
};
const onPrep = (fn: (w: CellWorld) => void, scenarios: B02Scenario[] = []) => {
  const w = base(scenarios);
  slideToPrep(w, 'sl1');
  fn(w);
  return w;
};
/** Lámina ya montada en la platina, 4X enfocado, ocular abierto. */
const onStage = (prep: (w: CellWorld) => void = (w) => elodeaMount(w, 'sl1', 'cv1'), scenarios: B02Scenario[] = []) => {
  const w = base(scenarios);
  prep(w);
  microscopeOn(w);
  toObjectiveC(w, 4);
  toStageC(w, 'sl1');
  focusC(w);
  cmdC(w, { type: 'observe', instrument: 'compound', open: true });
  return w;
};
const capture = (w: CellWorld, instrument: 'compound' | 'stereo' = 'compound') => {
  runC(w, 1.6);
  const r = dispatchCell(w, { type: 'captureObservation', instrument });
  return r.id ? w.observations[r.id] : null;
};
/** Captura a 40X tras pasar por 10X (la observación de una preparación). */
const at40 = (w: CellWorld) => {
  capture(w);
  for (const x of [10, 40] as const) {
    toObjectiveC(w, x);
    focusC(w);
  }
  cmdC(w, { type: 'setDiaphragm', value01: 0.6 });
  return capture(w)!;
};
const cut = (w: CellWorld, sourceId: string, thicknessMm = 0.15, lengthCm = 0.8, expectOk = true) => cmdC(w, { type: 'cutSource', sourceId, toolId: 'sc', thicknessMm, lengthCm }, expectOk);
const pickPlace = (w: CellWorld, dx = 0, slideId = 'sl1') => {
  cmdC(w, { type: 'pickSpecimen', toolId: 'fc', sourceId: 'board' });
  return cmdC(w, { type: 'placeSpecimen', toolId: 'fc', targetId: slideId, dxCm: dx, dyCm: 0 });
};
const seat = { x: STAGE_SEAT.x, y: STAGE_SEAT.y, z: stageTopZCm(6) };
const stereoOn = (w: CellWorld, id = 'leaf1') => {
  cmdC(w, { type: 'setPower', device: 'stereo', on: true });
  cmdC(w, { type: 'setIllumination', device: 'stereo-incident', value01: 0.5 });
  cmdC(w, { type: 'pickSpecimen', toolId: 'fc', sourceId: id, pressure01: 0.3 });
  cmdC(w, { type: 'placeSpecimen', toolId: 'fc', targetId: 'stereoBase', dxCm: 0, dyCm: 0 });
  focusStereo(w);
  cmdC(w, { type: 'observe', instrument: 'stereo', open: true });
};
/** Libreta sobre la ruta ideal, para los errores de interpretación. */
const nbCase = (edit: (r: ReturnType<typeof idealAttemptB02>) => void, code: string) => {
  const r = idealAttemptB02();
  expect(notebookIssuesB02(r.w, r.nb)).not.toContain(`nb:${code}`);
  edit(r);
  expect(notebookIssuesB02(r.w, r.nb)).toContain(`nb:${code}`);
  return r;
};

const FIXTURES: Record<string, () => void> = {
  CEL01: () => {
    const w = onStage((w) => {
      slideToPrep(w, 'sl1');
      cut(w, 'tom', 0.8);
      pickPlace(w);
      dropC(w, 'dw', 'sl1');
      coverC(w, 'sl1', 'cv1');
    });
    expect(err(w, 'CEL01')).toBe(1);
    const o = at40(w);
    expect(o.issues).toContain('THICK');
    expect(o.visibleRegionIds).not.toContain('chromoplasts');
  },
  CEL02: () => {
    const w = onStage((w) => {
      slideToPrep(w, 'sl1');
      cut(w, 'tom', 0.15, 0.2);
      pickPlace(w);
      dropC(w, 'dw', 'sl1');
      coverC(w, 'sl1', 'cv1');
    });
    expect(err(w, 'CEL02')).toBe(1);
    expect(capture(w)!.issues).toContain('TOO_SMALL');
  },
  CEL03: () => {
    const w = onPrep((w) => cmdC(w, { type: 'scrape', sourceId: 'pot', toolId: 'sp', distanceCm: 1.2, pressure01: 0.95 }));
    expect(err(w, 'CEL03')).toBe(1);
    expect(w.cell.held.sp!.tear01).toBeGreaterThan(w.params.cellPrep!.tearMax);
  },
  CEL04: () => {
    const w = onPrep((w) => cmdC(w, { type: 'scrape', sourceId: 'pot', toolId: 'sp', distanceCm: 0.3, pressure01: 0.4 }));
    expect(err(w, 'CEL04')).toBe(1);
    expect(w.cell.held.sp!.areaMm2).toBeLessThan(w.params.cellPrep!.minAreaMm2);
  },
  CEL05: () => {
    const w = base();
    const before = w.cell.sources.tom.massMg;
    const r = cmdC(w, { type: 'cutSource', sourceId: 'tom', toolId: 'sp', thicknessMm: 0.15, lengthCm: 0.8 }, false);
    expect(r.ok).toBe(false);
    expect(err(w, 'CEL05')).toBe(1);
    expect(w.cell.sources.tom.massMg).toBe(before);
  },
  CEL06: () => {
    const w = base();
    const r = cut(w, 'app', 0.15, 0.8, false);
    expect(r.ok).toBe(false);
    expect(err(w, 'CEL06')).toBe(1);
    expect(w.cell.board).toBeNull();
  },
  CEL07: () => {
    const w = onPrep((w) => {
      cut(w, 'tom');
      pickPlace(w, 5);
    });
    expect(err(w, 'CEL07')).toBe(1);
    expect(w.cell.biomass.wasteMg).toBeGreaterThan(0);
    expect(w.mounts.sl1?.cell?.zones.length ?? 0).toBe(0);
  },
  CEL08: () => {
    const w = onPrep((w) => {
      cut(w, 'tom');
      pickPlace(w, 1.4);
    });
    expect(err(w, 'CEL08')).toBe(1);
    expect(w.mounts.sl1.cell!.zones[0].centerCm[0]).toBeCloseTo(1.4, 6);
  },
  CEL09: () => {
    const w = base();
    placeC(w, 'sl6', 'prep', { x: 140, y: 24, z: 0.8 });
    cut(w, 'tom');
    pickPlace(w, 0, 'sl6');
    expect(err(w, 'CEL09')).toBe(1);
    expect(w.mounts.sl6.contamination01).toBeGreaterThan(0.3);
  },
  CEL10: () => {
    const w = onPrep((w) => {
      cut(w, 'tom');
      pickPlace(w);
      cut(w, 'pep');
    });
    expect(err(w, 'CEL10')).toBe(1);
    expect(w.cell.board!.contamination01).toBeGreaterThan(0.3);
  },
  CEL11: () => {
    const w = onPrep((w) => {
      cut(w, 'tom');
      pickPlace(w, -0.2);
      cmdC(w, { type: 'wipe', targetId: 'sc', toolId: 'lp' });
      cmdC(w, { type: 'wipe', targetId: 'fc', toolId: 'lp' });
      cut(w, 'pep');
      pickPlace(w, 0.2);
    });
    expect(err(w, 'CEL11')).toBe(1);
    expect(w.mounts.sl1.cell!.mixed).toBe(true);
  },
  CEL12: () => {
    const w = base();
    slideToPrep(w, 'sl1', 'prep2');
    cmdC(w, { type: 'swab', swabId: 'sw1', sourceId: 'bucc', durationS: 4, pressure01: 1 });
    cmdC(w, { type: 'smear', swabId: 'sw1', slideId: 'sl1', lengthCm: 0.3, pressure01: 1, dxCm: 0, dyCm: 0 });
    expect(err(w, 'CEL12')).toBe(1);
    expect(w.mounts.sl1.cell!.smearDensity01).toBeGreaterThan(w.params.cellPrep!.smearDenseMax);
  },
  CEL13: () => {
    const w = base();
    slideToPrep(w, 'sl1', 'prep2');
    cmdC(w, { type: 'smear', swabId: 'sw1', slideId: 'sl1', lengthCm: 1.6, pressure01: 0.4, dxCm: 0, dyCm: 0 });
    expect(err(w, 'CEL13')).toBe(1);
    expect(w.mounts.sl1.specimenId).toBeNull();
  },
  CEL14: () => {
    const w = onPrep((w) => {
      cmdC(w, { type: 'pickSpecimen', toolId: 'fc', sourceId: 'el' });
      cmdC(w, { type: 'placeSpecimen', toolId: 'fc', targetId: 'sl1', dxCm: 0, dyCm: 0 });
      dropC(w, 'dw', 'sl1');
      cmdC(w, { type: 'wipe', targetId: 'fc', toolId: 'lp' });
      cmdC(w, { type: 'grabCover', coverId: 'cv1', toolId: 'fc' });
      cmdC(w, { type: 'setCoverTilt', coverId: 'cv1', angleDeg: 4 });
      cmdC(w, { type: 'lowerCover', coverId: 'cv1', slideId: 'sl1', speedCmS: 2, dxCm: 0, dyCm: 0 });
    });
    expect(err(w, 'CEL14')).toBe(1);
    expect(w.mounts.sl1.bubbleFraction).toBeGreaterThan(0.3);
  },
  CEL15: () => {
    const w = onPrep((w) => {
      cut(w, 'tom');
      pickPlace(w);
      dropC(w, 'dw', 'sl1');
      coverC(w, 'sl1', 'cv1', { dx: 1 });
    });
    expect(err(w, 'CEL15')).toBe(1);
    expect(Math.abs(w.mounts.sl1.cell!.zones[0].centerCm[0])).toBeGreaterThan(0.3);
  },
  CEL16: () => {
    const w = base();
    elodeaMount(w, 'sl1', 'cv1');
    cmdC(w, { type: 'pressCover', slideId: 'sl1', force01: 0.95 });
    expect(err(w, 'CEL16')).toBe(1);
    expect(w.mounts.sl1.broken).toBe(true);
  },
  CEL17: () => {
    const w = base();
    fruitMount(w, 'tom', 'sl1', 'cv1');
    cmdC(w, { type: 'wipe', targetId: 'sl1', toolId: 'pp', dxCm: 0.9, dyCm: 0, strong: true });
    expect(err(w, 'CEL17')).toBe(1);
    expect(w.mounts.sl1.waterMl + w.mounts.sl1.reagentMl).toBeLessThan(w.params.mount.needMl);
  },
  CEL18: () => {
    const w = onPrep((w) => {
      cmdC(w, { type: 'pickSpecimen', toolId: 'fc', sourceId: 'el' });
      cmdC(w, { type: 'placeSpecimen', toolId: 'fc', targetId: 'sl1', dxCm: 0, dyCm: 0 });
      coverC(w, 'sl1', 'cv1');
    });
    runC(w, 30);
    expect(err(w, 'CEL18')).toBe(1);
    expect(w.mounts.sl1.hydrated01).toBeLessThan(0.6);
  },
  CEL19: () => {
    const w = onPrep((w) => {
      cmdC(w, { type: 'pickSpecimen', toolId: 'fc', sourceId: 'el' });
      cmdC(w, { type: 'placeSpecimen', toolId: 'fc', targetId: 'sl1', dxCm: 0, dyCm: 0 });
      for (let i = 0; i < 4; i++) dropC(w, 'dw', 'sl1', 1);
      coverC(w, 'sl1', 'cv1');
    });
    expect(err(w, 'CEL19')).toBe(1);
    expect(w.fluids.spilledMl).toBeGreaterThan(0);
  },
  CEL20: () => {
    const w = onStage((w) => potatoMount(w, 'sl1', 'cv1', { stain: 'dw' }));
    const o = at40(w);
    expect(err(w, 'CEL20')).toBeGreaterThan(0);
    expect(o.assetId).toBe('potatoPlain');
    expect(o.visibleRegionIds).not.toContain('starchGrains');
  },
  CEL21: () => {
    const w = base();
    potatoMount(w, 'sl1', 'cv1', { stain: 'mb' });
    expect(err(w, 'CEL21')).toBe(1);
    expect(w.mounts.sl1.cell!.incompatible).toBe(true);
  },
  CEL22: () => {
    const w = onPrep((w) => cmdC(w, { type: 'squeezeDropper', dispenserId: 'iod', targetId: 'sl1', force01: 0.5, dxCm: 5, dyCm: 0 }));
    expect(err(w, 'CEL22')).toBe(1);
    expect(w.cell.stainLedger.lugol.spilledMl).toBeGreaterThan(0);
    expect(w.mounts.sl1?.cell?.stainMl.lugol ?? 0).toBe(0);
  },
  CEL23: () => {
    const w = onPrep((w) => {
      cmdC(w, { type: 'scrape', sourceId: 'pot', toolId: 'sp', distanceCm: 1.2, pressure01: 0.4 });
      cmdC(w, { type: 'placeSpecimen', toolId: 'sp', targetId: 'sl1', dxCm: 0, dyCm: 0 });
      for (let i = 0; i < 3; i++) dropC(w, 'iod', 'sl1', 1);
    });
    expect(err(w, 'CEL23')).toBe(1);
    expect(w.mounts.sl1.cell!.overstain01).toBeGreaterThan(0.6);
  },
  CEL24: () => {
    const w = onStage((w) => potatoMount(w, 'sl1', 'cv1', { waitS: 0 }));
    const o = capture(w)!;
    expect(err(w, 'CEL24')).toBe(1);
    expect(o.assetId).toBe('potatoPlain');
  },
  CEL25: () => nbCase(({ nb }) => (nb.sclereids.eosinShows = 'lignin'), 'CEL25'),
  CEL26: () => {
    const w = onStage((w) => buccalMount(w, 'sl1', 'cv1', { stain: 'eo' }));
    const o = at40(w);
    expect(o.assetId).toBe('buccalEosin');
    const nb = emptyB02Notebook();
    nb.buccal = { observationId: o.id, stain: 'eosin-1pct', smear: '', structures: ['nucleus'] };
    expect(notebookIssuesB02(w, nb)).toContain('nb:CEL26');
  },
  CEL27: () => {
    const w = onStage((w) => buccalMount(w, 'sl1', 'cv1', { stain: 'none' }));
    const o = capture(w)!;
    expect(err(w, 'CEL27')).toBe(1);
    expect(o.assetId).toBe('buccalPlain');
    expect(o.visibleRegionIds).not.toContain('nucleus');
  },
  CEL28: () => {
    const w = base();
    fruitMount(w, 'tom', 'sl1', 'cv1', 'mb');
    expect(err(w, 'CEL28')).toBe(1);
    expect(w.mounts.sl1.cell!.incompatible).toBe(true);
  },
  CEL29: () => {
    const w = onPrep((w) => cmdC(w, { type: 'squeezeDropper', dispenserId: 'dw', targetId: 'sl1', force01: 0.5, dxCm: 0, dyCm: 0, tipContact: true }));
    expect(err(w, 'CEL29')).toBe(1);
    placeC(w, 'sl2', 'prep2', { x: 316, y: 14, z: 0.8 });
    dropC(w, 'dw', 'sl2');
    expect(w.mounts.sl2.contamination01).toBeGreaterThan(0.2);
  },
  CEL30: () => {
    const w = base();
    const before = w.dispensers.iod.ml;
    const r = cmdC(w, { type: 'recoverSpill', dispenserId: 'iod' }, false);
    expect(r.ok).toBe(false);
    expect(err(w, 'CEL30')).toBe(1);
    expect(w.dispensers.iod.ml).toBe(before);
  },
  CEL31: () => {
    const w = base();
    elodeaMount(w, 'sl1', 'cv1');
    cmdC(w, { type: 'openClip', open: false });
    const r = placeC(w, 'sl1', 'stage', seat, false);
    expect(r.ok).toBe(false);
    expect(err(w, 'CEL31')).toBe(1);
    expect(w.microscope.slideOnStage).toBeNull();
  },
  CEL32: () => {
    const w = base();
    elodeaMount(w, 'sl1', 'cv1');
    placeC(w, 'sl1', 'stage', seat);
    cmdC(w, { type: 'setStageXY', xMm: 4, yMm: 0 });
    expect(err(w, 'CEL32')).toBe(1);
    expect(w.microscope.slideOffsetMm[0]).toBeCloseTo(-2, 6);
  },
  CEL33: () => {
    const w = base();
    microscopeOn(w);
    const r = cmdC(w, { type: 'observe', instrument: 'compound', open: true }, false);
    expect(r.ok).toBe(false);
    expect(err(w, 'CEL33')).toBe(1);
    expect(w.view.instrument).toBeNull();
  },
  CEL34: () => {
    const w = base();
    elodeaMount(w, 'sl1', 'cv1');
    toStageC(w, 'sl1');
    toObjectiveC(w, 40);
    expect(err(w, 'CEL34')).toBe(1);
  },
  CEL35: () => {
    const w = onStage();
    capture(w);
    toObjectiveC(w, 10);
    toObjectiveC(w, 40);
    focusC(w);
    for (let i = 0; i < 40 && !err(w, 'CEL35'); i++) dispatchCell(w, { type: 'turnFine', deltaTurns: 0.5 });
    expect(err(w, 'CEL35')).toBe(1);
    expect(w.microscope.impactCount).toBe(1);
  },
  CEL36: () => {
    const w = onStage();
    capture(w);
    toObjectiveC(w, 10);
    toObjectiveC(w, 40);
    dispatchCell(w, { type: 'turnCoarse', deltaTurns: 0.2 });
    expect(err(w, 'CEL36')).toBeGreaterThan(0);
    expect(microscopeView(w).gapMm).toBeLessThan(w.params.microscope.gapSafeRemoveMm);
  },
  CEL37: () => {
    const w = base();
    cmdC(w, { type: 'turnCoarse', deltaTurns: 40 });
    expect(err(w, 'CEL37')).toBe(1);
  },
  CEL38: () => {
    const w = onStage();
    capture(w);
    cmdC(w, { type: 'setStageXY', xMm: -2.6, yMm: 0 });
    toObjectiveC(w, 10);
    expect(err(w, 'CEL38')).toBe(1);
    expect(microscopeView(w).visible).toEqual([]);
  },
  CEL39: () => {
    const w = onStage();
    cmdC(w, { type: 'turnTurret', deltaDeg: 60 });
    expect(capture(w)!.isObservationValid).toBe(false);
    expect(err(w, 'CEL39')).toBe(1);
  },
  CEL40: () => {
    const w = onStage();
    cmdC(w, { type: 'setIllumination', device: 'microscope', value01: 0.05 });
    expect(capture(w)!.isObservationValid).toBe(false);
    expect(err(w, 'CEL40')).toBe(1);
  },
  CEL41: () => {
    const w = onStage();
    cmdC(w, { type: 'setIllumination', device: 'microscope', value01: 1 });
    cmdC(w, { type: 'setDiaphragm', value01: 0.6 });
    expect(capture(w)!.isObservationValid).toBe(false);
    expect(err(w, 'CEL41')).toBe(1);
  },
  CEL42: () => {
    const w = onStage();
    cmdC(w, { type: 'setIllumination', device: 'microscope', value01: 0 });
    expect(capture(w)!.isObservationValid).toBe(false);
    expect(err(w, 'CEL42')).toBe(1);
  },
  CEL43: () => {
    const w = base();
    cmdC(w, { type: 'setStageXY', xMm: 40, yMm: 0 });
    expect(err(w, 'CEL43')).toBe(1);
    expect(w.microscope.stageXmm).toBe(w.params.microscope.stageXYRangeMm[1]);
  },
  CEL44: () => {
    const w = onStage();
    capture(w);
    toObjectiveC(w, 10);
    toObjectiveC(w, 40);
    expect(capture(w)!.isObservationValid).toBe(false);
    expect(err(w, 'CEL44')).toBe(1);
  },
  CEL45: () => {
    const w = onStage();
    capture(w);
    toObjectiveC(w, 10);
    toObjectiveC(w, 40);
    cmdC(w, { type: 'openClip', open: true });
    const r = placeC(w, 'sl1', 'bench', { x: 260, y: 14 }, false);
    expect(r.ok).toBe(false);
    expect(err(w, 'CEL45')).toBe(1);
  },
  CEL46: () => nbCase(({ nb }) => (nb.atlas[0].plastid = 'amyloplast'), 'CEL46'),
  CEL47: () => nbCase(({ nb }) => nb.buccal.structures.push('chloroplasts'), 'CEL47'),
  CEL48: () => nbCase(({ nb }) => nb.elodea.structures.push('cellMembrane'), 'CEL48'),
  CEL49: () => nbCase(({ nb }) => nb.atlas[0].structures.push('nucleus'), 'CEL49'),
  CEL50: () => nbCase(({ nb }) => (nb.elodea.motion = 'observed'), 'CEL50'),
  CEL51: () => nbCase(({ nb }) => (nb.sclereids.wallCause = 'eosinLignin'), 'CEL51'),
  CEL52: () => {
    const w = onStage((w) => elodeaMount(w, 'sl1', 'cv1'), [SC.BUBBLE_SLIDE]);
    capture(w);
    // Preparado de control con burbuja: lo que se señala como «vacuola» es la burbuja del montaje.
    cmdC(w, { type: 'observe', instrument: 'compound', open: false });
    cmdC(w, { type: 'turnCoarse', deltaTurns: -w.microscope.coarseTurns });
    cmdC(w, { type: 'turnFine', deltaTurns: -w.microscope.fineTurns });
    cmdC(w, { type: 'openClip', open: true });
    placeC(w, 'sl1', 'cleanTray', { x: 505, y: 20 });
    toStageC(w, 'ctl4');
    focusC(w);
    cmdC(w, { type: 'observe', instrument: 'compound', open: true });
    const o = capture(w)!;
    const nb = emptyB02Notebook();
    nb.elodea = { observationId: o.id, totalMag: '40', structures: ['vacuole'], motion: '' };
    expect(w.mounts.ctl4.bubbles.length).toBeGreaterThan(0);
    expect(notebookIssuesB02(w, nb)).toContain('nb:CEL52');
  },
  CEL53: () => {
    const w = onStage();
    cmdC(w, { type: 'turnCoarse', deltaTurns: -1 });
    expect(capture(w)!.isObservationValid).toBe(false);
    expect(err(w, 'CEL53')).toBe(1);
  },
  CEL54: () => {
    const r = nbCase(({ nb }) => (nb.scaleUm = '25'), 'CEL54');
    expect(evaluateB02(r.w, r.nb).components.find((c) => c.id === 'notebook')!.items.find((i) => i.key === 'b02.interpretation')!.ok).toBe(false);
  },
  CEL55: () => nbCase(({ nb }) => (nb.figures[0].specimen = 'pepper'), 'CEL55'),
  CEL56: () => {
    const w = base();
    microscopeOn(w);
    cmdC(w, { type: 'openSlideCase', open: true });
    placeC(w, 'fx2', 'hand');
    toStageC(w, 'fx2');
    focusC(w);
    cmdC(w, { type: 'observe', instrument: 'compound', open: true });
    expect(capture(w)!.isObservationValid).toBe(false);
    expect(err(w, 'CEL56')).toBe(1);
  },
  CEL57: () => {
    const w = base();
    const r = cmdC(w, { type: 'squeezeDropper', dispenserId: 'dw', targetId: 'fx1', force01: 0.5, dxCm: 0, dyCm: 0 }, false);
    expect(r.ok).toBe(false);
    expect(err(w, 'CEL57')).toBe(1);
    expect(w.mounts.fx1).toBeUndefined();
  },
  CEL58: () => {
    const w = base();
    cmdC(w, { type: 'openSlideCase', open: true });
    placeC(w, 'fx1', 'hand');
    placeC(w, 'fx1', 'case:s01', caseSlotPos(0));
    expect(err(w, 'CEL58')).toBe(1);
    expect(w.slideCase.slots.s01).toBe('fx1');
  },
  CEL59: () => {
    const w = base();
    elodeaMount(w, 'sl1', 'cv1');
    cmdC(w, { type: 'pressCover', slideId: 'sl1', force01: 0.95 });
    const r = placeC(w, 'cv1', 'hand', undefined, false);
    expect(r.ok).toBe(false);
    expect(err(w, 'CEL59')).toBe(1);
    expect(w.safety.block?.code).toBe('SHARDS');
  },
  CEL60: () => {
    const w = base();
    placeC(w, 'sw1', 'hand');
    cmdC(w, { type: 'swab', swabId: 'sw1', sourceId: 'bucc', durationS: 4, pressure01: 0.5 });
    cmdC(w, { type: 'dispose', objectId: 'sw1', containerId: 'trashBin' });
    expect(err(w, 'CEL60')).toBe(1);
    expect(w.objects.sw1.support).toBe('trashBin');
  },
  CEL61: () => {
    const w = base();
    cut(w, 'tom');
    cmdC(w, { type: 'closeBench' });
    expect(err(w, 'CEL61')).toBeGreaterThan(0);
    expect(w.evidence.benchRestored).toBeUndefined();
  },
  CEL62: () => {
    const w = onPrep((w) => {
      cut(w, 'tom');
      pickPlace(w);
    });
    const r = cmdC(w, { type: 'cutSpecimen', slideId: 'sl1', toolId: 'sc', keepFraction: 0.5, pressure01: 0.5 }, false);
    expect(r.ok).toBe(false);
    expect(err(w, 'CEL62')).toBe(1);
    expect(w.mounts.sl1.cell!.zones[0].areaMm2).toBeGreaterThan(0);
  },
  CEL63: () => {
    const w = onStage();
    cmdC(w, { type: 'setCondenser', value01: 0.3 });
    const o = capture(w)!;
    expect(err(w, 'CEL63')).toBe(1);
    expect(o.contrast01).toBeLessThan(0.8);
  },
  CEL64: () => {
    const w = base();
    microscopeOn(w);
    cmdC(w, { type: 'closeBench' });
    expect(err(w, 'CEL64')).toBe(1);
    expect(w.evidence.benchRestored).toBeUndefined();
  },
  CEL65: () => {
    const w = onStage();
    cmdC(w, { type: 'observe', instrument: 'compound', open: false });
    cmdC(w, { type: 'closeBench' });
    expect(err(w, 'CEL65')).toBe(1);
    expect(w.microscope.slideOnStage).toBe('sl1');
  },
  CEL66: () => {
    const w = base();
    stereoOn(w);
    cmdC(w, { type: 'setPower', device: 'stereo', on: false });
    expect(capture(w, 'stereo')!.isObservationValid).toBe(false);
    expect(err(w, 'CEL66')).toBe(1);
  },
  CEL67: () => {
    const w = base();
    stereoOn(w);
    const o = capture(w, 'stereo')!;
    const nb = emptyB02Notebook();
    nb.stereo = { observationId: o.id, light: 'incident', features: 'Se ve el núcleo de cada célula' };
    expect(notebookIssuesB02(w, nb)).toContain('nb:CEL67');
  },
  CEL68: () => {
    const w = onStage((w) => fruitMount(w, 'pep', 'sl1', 'cv1'), [SC.MISSING_ASSET]);
    const o = capture(w)!;
    expect(o.isObservationValid).toBe(false);
    expect(o.issues).toContain('ASSET_MISSING');
    expect(w.cell.incidents).toEqual(['pepper']);
    expect(w.evidence['asset:unavailable:pepper']).toBeTruthy();
    expect(errKeys(w)).toEqual([]);
  },
};

describe('B02 — 67 errores con consecuencia causal y una incidencia técnica (§9)', () => {
  it('el catálogo tiene 68 casos únicos y una fixture por cada uno', () => {
    const codes = SIMULATED_ERRORS_B02.map((e) => e.code);
    expect(new Set(codes).size).toBe(68);
    expect(Object.keys(FIXTURES).sort()).toEqual([...codes].sort());
  });
  for (const e of SIMULATED_ERRORS_B02) it(`${e.code} — ${e.trigger} → ${e.effect}`, () => FIXTURES[e.code]());
  it('el camino correcto no comete ninguno y conserva los balances', () => {
    const { w } = idealAttemptB02(31);
    expect(errKeys(w)).toEqual([]);
    for (const [k, v] of Object.entries(conservedCell(w))) expect(Math.abs(v), k).toBeLessThan(1e-6);
  });
  it('ningún código de B01 sin traducir llega a la evidencia de B02', () => {
    const { w } = idealAttemptB02(31);
    const w2 = base();
    cmdC(w2, { type: 'squeezeDropper', dispenserId: 'dw', targetId: 'bench', force01: 0.5, dxCm: 0, dyCm: 0 });
    for (const k of [...errKeys(w), ...errKeys(w2)]) expect(k).toMatch(/^err:(CEL\d\d|PPE)$/);
  });
});
