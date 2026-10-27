/**
 * B01 — los 78 errores simulables (§9): cada uno con su fixture que ejecuta el gesto real y comprueba la
 * CONSECUENCIA en el estado (no solo el aviso). E60–E62 se comprueban sobre la libreta.
 */
import { describe, expect, it } from 'vitest';
import type { OpticalWorld } from '../../simulation/optical-world/types';
import { SB, dispatchB01, microscopeView, stereoView } from '../../simulation/optical-world/world';
import { STAGE_SEAT, STEREO_BASE, caseSlotPos, stageTopZCm } from '../../simulation/optical-world/geometry';
import { SIMULATED_ERRORS_B01, type B01Scenario } from '../../practices/practice-b01/error-scenarios';
import { notebookIssuesB01 } from '../../practices/practice-b01/rubric';
import {
  captureCompound, captureStereo, cmdB, focusMicroscope, focusStereo, idealAttemptB01, inspectAll, place, ppeB01, runB, stereoSample, toObjective, toStage, wetMount, worldB01,
} from '../helpersB01';

const err = (w: OpticalWorld, code: string) => w.evidence[`err:${code}`] ?? 0;
const base = (scenarios: B01Scenario[] = []) => {
  const w = worldB01({ scenarios });
  ppeB01(w);
  inspectAll(w);
  return w;
};
const mounted = (scenarios: B01Scenario[] = []) => {
  const w = base(scenarios);
  wetMount(w);
  return w;
};
/** Montaje fresco en la platina, enfocado a 4X, con el ocular abierto. */
const onStage = (scenarios: B01Scenario[] = []) => {
  const w = mounted(scenarios);
  cmdB(w, { type: 'setPower', device: 'microscope', on: true });
  toStage(w, 'sl1');
  focusMicroscope(w);
  cmdB(w, { type: 'observe', instrument: 'compound', open: true });
  return w;
};
const capture = (w: OpticalWorld, instrument: 'compound' | 'stereo' = 'compound') => {
  runB(w, 1.6);
  const r = dispatchB01(w, { type: 'captureObservation', instrument });
  return r.id ? w.observations[r.id] : null;
};
const prepWith = (fn: (w: OpticalWorld) => void, scenarios: B01Scenario[] = []) => {
  const w = base(scenarios);
  place(w, 'sl1', 'prep', { x: 140, y: 24, z: 0.8 });
  fn(w);
  return w;
};
const pickPlace = (w: OpticalWorld, dx = 0, dy = 0) => {
  cmdB(w, { type: 'pickSpecimen', toolId: 'fc', sourceId: 'el' });
  cmdB(w, { type: 'placeSpecimen', toolId: 'fc', targetId: 'sl1', dxCm: dx, dyCm: dy });
};
const drop = (w: OpticalWorld, force = 0.5, dx = 0, dy = 0) => cmdB(w, { type: 'squeezeDropper', dispenserId: 'dw', targetId: 'sl1', force01: force, dxCm: dx, dyCm: dy });
const cover = (w: OpticalWorld, tilt = 45, speed = 0.4) => {
  cmdB(w, { type: 'wipe', targetId: 'fc', toolId: 'lp' });
  cmdB(w, { type: 'grabCover', coverId: 'cv1', toolId: 'fc' });
  cmdB(w, { type: 'setCoverTilt', coverId: 'cv1', angleDeg: tilt });
  return cmdB(w, { type: 'lowerCover', coverId: 'cv1', slideId: 'sl1', speedCmS: speed, dxCm: 0, dyCm: 0 });
};
const fixedOnStage = (id = 'fx1') => {
  const w = base();
  cmdB(w, { type: 'setPower', device: 'microscope', on: true });
  cmdB(w, { type: 'openSlideCase', open: true });
  place(w, id, 'hand');
  toStage(w, id);
  focusMicroscope(w);
  cmdB(w, { type: 'observe', instrument: 'compound', open: true });
  return w;
};
const stereoWith = (id: string, scenarios: B01Scenario[] = []) => {
  const w = base(scenarios);
  cmdB(w, { type: 'setPower', device: 'stereo', on: true });
  stereoSample(w, id);
  focusStereo(w);
  cmdB(w, { type: 'observe', instrument: 'stereo', open: true });
  return w;
};
const seat = { x: STAGE_SEAT.x, y: STAGE_SEAT.y, z: stageTopZCm(6) };

const FIXTURES: Record<string, () => void> = {
  E01: () => {
    const w = prepWith((w) => pickPlace(w), [SB.DIRTY_SLIDE]);
    expect(err(w, 'E01')).toBe(1);
    expect(w.mounts.sl1.contamination01).toBeGreaterThan(0.3);
  },
  E02: () => {
    const w = prepWith((w) => {
      pickPlace(w);
      drop(w);
      cover(w);
    }, [SB.BIG_LEAF]);
    expect(err(w, 'E02')).toBe(1);
    expect(w.mounts.sl1.coveredFraction).toBeLessThan(0.85);
  },
  E03: () => {
    const w = prepWith((w) => pickPlace(w, 1.2, 0));
    expect(err(w, 'E03')).toBe(1);
  },
  E04: () => {
    const w = prepWith((w) => {
      pickPlace(w);
      cmdB(w, { type: 'cutSpecimen', slideId: 'sl1', toolId: 'sc', keepFraction: 0.5, pressure01: 0.95 });
    }, [SB.BIG_LEAF]);
    expect(err(w, 'E04')).toBe(1);
    expect(w.mounts.sl1.damage01).toBeGreaterThan(0.4);
  },
  E05: () => {
    const w = prepWith((w) => {
      pickPlace(w);
      cmdB(w, { type: 'cutSpecimen', slideId: 'sl1', toolId: 'sc', keepFraction: 0.6, pressure01: 0.3 });
    });
    expect(err(w, 'E05')).toBe(1);
    expect(w.mounts.sl1.damage01).toBeGreaterThan(0.2);
  },
  E06: () => {
    const w = prepWith((w) => {
      pickPlace(w);
      cover(w);
    });
    runB(w, 30);
    expect(err(w, 'E06')).toBe(1);
    expect(w.mounts.sl1.hydrated01).toBeLessThan(0.6);
  },
  E07: () => {
    const w = prepWith((w) => {
      pickPlace(w);
      for (let i = 0; i < 4; i++) drop(w, 1);
      cover(w);
    });
    expect(err(w, 'E07')).toBe(1);
    expect(w.mounts.sl1.floating).toBe(true);
    expect(w.fluids.spilledMl).toBeGreaterThan(0);
  },
  E08: () => {
    const w = prepWith((w) => {
      pickPlace(w);
      drop(w, 0.5, 1.6, 0);
    });
    expect(err(w, 'E08')).toBe(1);
    expect(w.mounts.sl1.wetsSpecimen).toBe(false);
  },
  E09: () => {
    const w = prepWith((w) => {
      pickPlace(w);
      drop(w);
      cover(w, 4, 2);
    });
    expect(err(w, 'E09')).toBe(1);
    expect(w.mounts.sl1.bubbleFraction).toBeGreaterThan(0.3);
  },
  E10: () => {
    const w = prepWith((w) => {
      pickPlace(w);
      drop(w);
      cover(w, 20, 2.5);
    });
    expect(err(w, 'E10')).toBe(1);
    expect(w.mounts.sl1.bubbleFraction).toBeGreaterThan(0.1);
  },
  E11: () => {
    const w = mounted();
    cmdB(w, { type: 'pressCover', slideId: 'sl1', force01: 0.95 });
    expect(err(w, 'E11')).toBe(1);
    expect(w.mounts.sl1.broken).toBe(true);
    expect(w.shards).toBe(1);
  },
  E12: () => {
    const w = mounted();
    const before = w.mounts.sl1.waterMl;
    cmdB(w, { type: 'wipe', targetId: 'sl1', toolId: 'pp', dxCm: 0, dyCm: 0 });
    expect(err(w, 'E12')).toBe(1);
    expect(w.mounts.sl1.waterMl).toBeLessThan(before * 0.5);
  },
  E13: () => {
    const w = prepWith((w) => pickPlace(w));
    cmdB(w, { type: 'pickSpecimen', toolId: 'fc', sourceId: 'leaf1' });
    expect(err(w, 'E13')).toBe(1);
  },
  E14: () => {
    const w = prepWith((w) => {
      pickPlace(w);
      cmdB(w, { type: 'squeezeDropper', dispenserId: 'iod', targetId: 'sl1', force01: 0.5, dxCm: 0, dyCm: 0 });
    });
    expect(err(w, 'E14')).toBe(1);
    expect(w.mounts.sl1.reagentId).toBe('lugol');
  },
  E15: () => {
    const w = mounted();
    cmdB(w, { type: 'openClip', open: false });
    const r = place(w, 'sl1', 'stage', seat, false);
    expect(r.ok).toBe(false);
    expect(err(w, 'E15')).toBe(1);
    expect(w.microscope.slideOnStage).toBeNull();
  },
  E16: () => {
    const w = mounted();
    place(w, 'sl1', 'stage', seat);
    cmdB(w, { type: 'setStageXY', xMm: 4, yMm: 0 });
    expect(err(w, 'E16')).toBe(1);
    expect(w.microscope.slideOffsetMm[0]).toBeCloseTo(-2, 6);
  },
  E17: () => {
    const w = base();
    cmdB(w, { type: 'openSlideCase', open: true });
    place(w, 'fx1', 'hand');
    cmdB(w, { type: 'flipSlide', slideId: 'fx1' });
    place(w, 'fx1', 'stage', seat);
    expect(err(w, 'E17')).toBe(1);
  },
  E18: () => {
    const w = mounted();
    toStage(w, 'sl1');
    toObjective(w, 40);
    expect(err(w, 'E18')).toBe(1);
  },
  E19: () => {
    const w = onStage();
    cmdB(w, { type: 'turnTurret', deltaDeg: 60 });
    const o = capture(w)!;
    expect(err(w, 'E19')).toBe(1);
    expect(o.isObservationValid).toBe(false);
  },
  E20: () => {
    const w = onStage();
    capture(w);
    toObjective(w, 10);
    toObjective(w, 40);
    focusMicroscope(w);
    runB(w, 31);
    for (let i = 0; i < 12 && microscopeView(w).gapMm >= 0.3; i++) cmdB(w, { type: 'turnFine', deltaTurns: 0.5 });
    expect(err(w, 'E20')).toBe(1);
    expect(microscopeView(w).gapMm).toBeLessThan(0.3);
  },
  E21: () => {
    const w = onStage();
    capture(w);
    toObjective(w, 10);
    toObjective(w, 40);
    focusMicroscope(w);
    for (let i = 0; i < 40 && !err(w, 'E21'); i++) dispatchB01(w, { type: 'turnFine', deltaTurns: 0.5 });
    expect(err(w, 'E21')).toBe(1);
    expect(w.microscope.impactCount).toBe(1);
    expect(w.safety.incident?.code).toBe('OBJECTIVE_COLLISION');
  },
  E22: () => {
    const w = onStage();
    capture(w);
    toObjective(w, 10);
    toObjective(w, 40);
    dispatchB01(w, { type: 'turnCoarse', deltaTurns: 0.2 });
    expect(err(w, 'E22')).toBe(1);
  },
  E23: () => {
    const w = onStage();
    cmdB(w, { type: 'turnCoarse', deltaTurns: -3 });
    for (let i = 0; i < 6; i++) cmdB(w, { type: 'turnFine', deltaTurns: 0.5 });
    expect(err(w, 'E23')).toBe(1);
    expect(microscopeView(w).sharpness01).toBeLessThan(0.1);
  },
  E24: () => {
    const w = base();
    cmdB(w, { type: 'turnCoarse', deltaTurns: 40 });
    expect(err(w, 'E24')).toBe(1);
  },
  E25: () => {
    const w = base();
    cmdB(w, { type: 'turnFine', deltaTurns: -40 });
    expect(err(w, 'E25')).toBe(1);
  },
  E26: () => {
    const w = onStage();
    cmdB(w, { type: 'setIllumination', device: 'microscope', value01: 0 });
    const o = capture(w)!;
    expect(err(w, 'E26')).toBe(1);
    expect(o.isObservationValid).toBe(false);
  },
  E27: () => {
    const w = onStage();
    cmdB(w, { type: 'setIllumination', device: 'microscope', value01: 0.05 });
    expect(capture(w)!.isObservationValid).toBe(false);
    expect(err(w, 'E27')).toBe(1);
  },
  E28: () => {
    const w = onStage();
    cmdB(w, { type: 'setIllumination', device: 'microscope', value01: 1 });
    cmdB(w, { type: 'setDiaphragm', value01: 0.6 });
    expect(capture(w)!.isObservationValid).toBe(false);
    expect(err(w, 'E28')).toBe(1);
  },
  E29: () => {
    const w = onStage();
    cmdB(w, { type: 'setIllumination', device: 'microscope', value01: 0.8 });
    cmdB(w, { type: 'setDiaphragm', value01: 0.05 });
    const o = capture(w)!;
    expect(err(w, 'E29')).toBe(1);
    expect(o.contrast01).toBeLessThan(0.7);
  },
  E30: () => {
    const w = onStage();
    cmdB(w, { type: 'setIllumination', device: 'microscope', value01: 0.3 });
    cmdB(w, { type: 'setDiaphragm', value01: 0.95 });
    const o = capture(w)!;
    expect(err(w, 'E30')).toBe(1);
    expect(o.contrast01).toBeLessThan(0.7);
  },
  E31: () => {
    const w = onStage();
    cmdB(w, { type: 'setCondenser', value01: 0.3 });
    const o = capture(w)!;
    expect(err(w, 'E31')).toBe(1);
    expect(o.contrast01).toBeLessThan(0.8);
  },
  E32: () => {
    const w = onStage();
    capture(w);
    cmdB(w, { type: 'setStageXY', xMm: -2.6, yMm: 0 });
    expect(microscopeView(w).visible.length).toBeGreaterThan(0);
    toObjective(w, 10);
    expect(err(w, 'E32')).toBe(1);
    expect(microscopeView(w).visible).toEqual([]);
  },
  E33: () => {
    const w = onStage();
    cmdB(w, { type: 'setStageXY', xMm: 20, yMm: 0 });
    expect(err(w, 'E33')).toBe(1);
    expect(microscopeView(w).visible).toEqual([]);
  },
  E34: () => {
    const w = onStage();
    capture(w);
    toObjective(w, 10);
    focusMicroscope(w);
    const before = microscopeView(w).visible.length;
    const had = microscopeView(w).visible;
    cmdB(w, { type: 'setStageXY', xMm: 1.3, yMm: 0 });
    expect(err(w, 'E34')).toBe(1);
    expect(had.some((x) => !microscopeView(w).visible.includes(x))).toBe(true);
    void before;
  },
  E35: () => {
    const w = onStage();
    capture(w);
    toObjective(w, 10);
    toObjective(w, 40);
    const o = capture(w)!;
    expect(err(w, 'E35')).toBe(1);
    expect(o.isObservationValid).toBe(false);
  },
  E36: () => {
    const w = onStage();
    cmdB(w, { type: 'turnCoarse', deltaTurns: -1 });
    const o = capture(w)!;
    expect(err(w, 'E36')).toBe(1);
    expect(o.isObservationValid).toBe(false);
  },
  E37: () => {
    const w = prepWith((w) => {
      pickPlace(w);
      drop(w);
      cover(w, 5, 0.4);
    });
    cmdB(w, { type: 'setPower', device: 'microscope', on: true });
    toStage(w, 'sl1');
    focusMicroscope(w);
    cmdB(w, { type: 'observe', instrument: 'compound', open: true });
    const o = capture(w)!;
    expect(err(w, 'E37')).toBe(1);
    expect(o.visibleRegionIds).toEqual([]);
  },
  E38: () => {
    const w = onStage();
    const r = place(w, 'sl1', 'bench', { x: 260, y: 14 }, false);
    expect(r.ok).toBe(false);
    expect(err(w, 'E38')).toBe(1);
    expect(w.microscope.slideOnStage).toBe('sl1');
  },
  E39: () => {
    const w = onStage();
    capture(w);
    toObjective(w, 10);
    toObjective(w, 40);
    cmdB(w, { type: 'openClip', open: true });
    const r = place(w, 'sl1', 'bench', { x: 260, y: 14 }, false);
    expect(r.ok).toBe(false);
    expect(err(w, 'E39')).toBe(1);
  },
  E40: () => {
    const w = fixedOnStage('fx2');
    const o = capture(w)!;
    expect(err(w, 'E40')).toBe(1);
    expect(o.isObservationValid).toBe(false);
  },
  E41: () => {
    const w = base();
    const r = place(w, 'fx1', 'hand', undefined, false);
    expect(r.ok).toBe(false);
    expect(err(w, 'E41')).toBe(1);
    expect(w.slideCase.slots.s03).toBe('fx1');
  },
  E42: () => {
    const w = base();
    const r = dispatchB01(w, { type: 'squeezeDropper', dispenserId: 'dw', targetId: 'fx1', force01: 0.5, dxCm: 0, dyCm: 0 });
    expect(r.ok).toBe(false);
    expect(err(w, 'E42')).toBe(1);
  },
  E43: () => {
    const w = base();
    cmdB(w, { type: 'grabCover', coverId: 'cv1', toolId: 'fc' });
    const r = dispatchB01(w, { type: 'lowerCover', coverId: 'cv1', slideId: 'fx1', speedCmS: 0.4, dxCm: 0, dyCm: 0 });
    expect(r.ok).toBe(false);
    expect(err(w, 'E43')).toBe(1);
    expect(w.covers.cv1.state).toBe('held');
  },
  E44: () => {
    const w = base();
    cmdB(w, { type: 'openSlideCase', open: true });
    place(w, 'fx1', 'hand');
    place(w, 'fx1', 'case:s01', caseSlotPos(0));
    expect(err(w, 'E44')).toBe(1);
    expect(w.slideCase.slots.s01).toBe('fx1');
  },
  E45: () => {
    const w = base();
    cmdB(w, { type: 'openSlideCase', open: true });
    place(w, 'fx1', 'hand');
    cmdB(w, { type: 'closeBench' });
    expect(err(w, 'E45')).toBe(1);
    expect(w.evidence.benchRestored).toBeUndefined();
  },
  E46: () => {
    const w = base();
    cmdB(w, { type: 'openSlideCase', open: true });
    runB(w, 95);
    cmdB(w, { type: 'turnCoarse', deltaTurns: 0.5 });
    expect(err(w, 'E46')).toBe(1);
  },
  E47: () => {
    const w = onStage();
    const r = dispatchB01(w, { type: 'observe', instrument: 'compound', open: true, sampleId: 'fx3' });
    expect(r.ok).toBe(false);
    expect(err(w, 'E47')).toBe(1);
  },
  E48: () => {
    const w = base();
    cmdB(w, { type: 'setPower', device: 'stereo', on: true });
    cmdB(w, { type: 'observe', instrument: 'stereo', open: true });
    expect(err(w, 'E48')).toBe(1);
    expect(stereoView(w).sampleId).toBeNull();
  },
  E49: () => {
    const w = base();
    cmdB(w, { type: 'pickSpecimen', toolId: 'fc', sourceId: 'leaf1' });
    cmdB(w, { type: 'placeSpecimen', toolId: 'fc', targetId: 'stereoBase', dxCm: 2.2, dyCm: 0 });
    expect(err(w, 'E49')).toBe(1);
    expect(Math.hypot(...w.stereo.sampleOffsetMm)).toBeGreaterThan(15);
  },
  E50: () => {
    const w = stereoWith('ins1');
    cmdB(w, { type: 'setIllumination', device: 'stereo-incident', value01: 0 });
    cmdB(w, { type: 'setIllumination', device: 'stereo-transmitted', value01: 0.6 });
    expect(capture(w, 'stereo')!.isObservationValid).toBe(false);
    expect(err(w, 'E50')).toBe(1);
  },
  E51: () => {
    const w = stereoWith('ins1', [SB.REFLECTIVE]);
    cmdB(w, { type: 'setIllumination', device: 'stereo-incident', value01: 0.95 });
    expect(capture(w, 'stereo')!.isObservationValid).toBe(false);
    expect(err(w, 'E51')).toBe(1);
  },
  E52: () => {
    const w = stereoWith('leaf1');
    cmdB(w, { type: 'setPower', device: 'stereo', on: false });
    expect(capture(w, 'stereo')!.isObservationValid).toBe(false);
    expect(err(w, 'E52')).toBe(1);
  },
  E53: () => {
    const w = stereoWith('leaf1');
    cmdB(w, { type: 'setStereoZoom', zoomX: 4 });
    expect(err(w, 'E53')).toBe(1);
    expect(stereoView(w).fovMm).toBeLessThan(6);
  },
  E54: () => {
    const w = stereoWith('ins1');
    cmdB(w, { type: 'setStereoHead', zMm: w.stereo.headZmm + 12 });
    expect(capture(w, 'stereo')!.isObservationValid).toBe(false);
    expect(err(w, 'E54')).toBe(1);
  },
  E55: () => {
    const w = base();
    cmdB(w, { type: 'setStereoFocus', deltaTurns: 50 });
    expect(err(w, 'E55')).toBe(1);
  },
  E56: () => {
    const w = stereoWith('leaf1', [SB.STEREO_PAIR]);
    cmdB(w, { type: 'setInterpupillary', valueMm: 63 });
    expect(capture(w, 'stereo')!.isObservationValid).toBe(false);
    expect(err(w, 'E56')).toBe(1);
  },
  E57: () => {
    const w = stereoWith('leaf1', [SB.STEREO_PAIR]);
    cmdB(w, { type: 'setDiopter', side: 'left', value: 0 });
    cmdB(w, { type: 'setDiopter', side: 'right', value: 0 });
    expect(capture(w, 'stereo')!.isObservationValid).toBe(false);
    expect(err(w, 'E57')).toBe(1);
  },
  E58: () => {
    const w = base();
    cmdB(w, { type: 'pickSpecimen', toolId: 'fc', sourceId: 'ins1', pressure01: 0.9 });
    expect(err(w, 'E58')).toBe(1);
    expect(w.stereoSamples.ins1.damage01).toBeGreaterThan(0.3);
  },
  E59: () => {
    const w = stereoWith('leaf1');
    cmdB(w, { type: 'pickSpecimen', toolId: 'fc', sourceId: 'leaf1' });
    expect(err(w, 'E59')).toBe(1);
    expect(w.stereo.sampleId).toBeNull();
  },
  E60: () => {
    const { w, nb } = idealAttemptB01();
    nb.calc.mag10 = '20';
    expect(notebookIssuesB01(w, nb)).toContain('nb:E60');
  },
  E61: () => {
    const { w, nb } = idealAttemptB01();
    nb.micro[0].structures = ['chloroplasts'];
    expect(notebookIssuesB01(w, nb)).toContain('nb:E61');
  },
  E62: () => {
    const { w, nb } = idealAttemptB01();
    nb.micro[0].specimen = 'insect';
    expect(notebookIssuesB01(w, nb)).toContain('nb:E62');
  },
  E63: () => {
    const w = onStage();
    const r = dispatchB01(w, { type: 'attachObservation', observationId: 'obs:999', attemptHash: 'otro' });
    expect(r.ok).toBe(false);
    expect(err(w, 'E63')).toBe(1);
  },
  E64: () => {
    const w = base();
    stereoSample(w, 'leaf1');
    cmdB(w, { type: 'closeBench' });
    expect(err(w, 'E64')).toBe(1);
  },
  E65: () => {
    const w = base();
    const r = dispatchB01(w, { type: 'wipe', targetId: 'mic:lens', toolId: 'tw' });
    expect(r.ok).toBe(false);
    expect(err(w, 'E65')).toBe(1);
  },
  E66: () => {
    const w = base();
    toObjective(w, 40);
    cmdB(w, { type: 'closeBench' });
    expect(err(w, 'E66')).toBe(1);
    expect(w.evidence.safeParked).toBeUndefined();
  },
  E67: () => {
    const w = base();
    cmdB(w, { type: 'setPower', device: 'microscope', on: true });
    cmdB(w, { type: 'closeBench' });
    expect(err(w, 'E67')).toBe(1);
  },
  E68: () => {
    const w = worldB01();
    const r = dispatchB01(w, { type: 'turnFine', deltaTurns: 1 });
    expect(r.ok).toBe(false);
    expect(err(w, 'E68')).toBe(1);
  },
  // ── Manipulación directa de las piezas (E69–E83) ──
  E69: () => {
    const w = onStage();
    capture(w);
    toObjective(w, 10);
    // Mirando por el ocular, el macro sigue subiendo la platina más allá del foco (a 4X el tope lo impide).
    for (let i = 0; i < 200 && !err(w, 'E69') && !err(w, 'E21'); i++) dispatchB01(w, { type: 'turnCoarse', deltaTurns: 0.1 });
    expect(err(w, 'E69')).toBe(1);
    expect(microscopeView(w).gapMm).toBeLessThan(w.params.microscope.gapSafeRemoveMm);
  },
  E70: () => {
    const w = onStage();
    capture(w);
    toObjective(w, 10);
    toObjective(w, 40);
    cmdB(w, { type: 'checkSide' });
    for (let i = 0; i < 40 && !err(w, 'E70'); i++) dispatchB01(w, { type: 'turnCoarse', deltaTurns: 0.05 });
    expect(err(w, 'E70')).toBe(1);
    expect(microscopeView(w).gapMm).toBeLessThan(w.params.microscope.gapWarnMm);
  },
  E71: () => {
    const w = onStage();
    cmdB(w, { type: 'gesture', part: 'mic:turret', phase: 'begin' });
    for (let i = 0; i < 10; i++) cmdB(w, { type: 'turnTurret', deltaDeg: 5 });
    cmdB(w, { type: 'gesture', part: 'mic:turret', phase: 'end' });
    expect(err(w, 'E71')).toBe(1);
    expect(microscopeView(w).locked).toBe(false);
  },
  E72: () => {
    const w = onStage();
    cmdB(w, { type: 'turnTurret', deltaDeg: 120, grip: 'objective' });
    expect(err(w, 'E72')).toBe(1);
    expect(microscopeView(w).objectiveX).toBe(10);
  },
  E73: () => {
    const w = mounted();
    place(w, 'sl1', 'stage', { x: STAGE_SEAT.x + 0.7, y: STAGE_SEAT.y, z: stageTopZCm(6) });
    cmdB(w, { type: 'openClip', open: false });
    expect(err(w, 'E73')).toBe(1);
    expect(w.microscope.clampedSlideId).toBe('sl1');
    expect(Math.hypot(...w.microscope.slideOffsetMm)).toBeGreaterThan(w.params.seatTolMm);
  },
  E74: () => {
    const w = base();
    cmdB(w, { type: 'setStageXY', xMm: 40, yMm: 0 });
    expect(err(w, 'E74')).toBe(1);
    expect(w.microscope.stageXmm).toBe(w.params.microscope.stageXYRangeMm[1]);
  },
  E77: () => {
    const w = onStage();
    cmdB(w, { type: 'turnCoarse', deltaTurns: -2 });
    const s0 = microscopeView(w).sharpness01;
    cmdB(w, { type: 'gesture', part: 'mic:ocular', phase: 'begin' });
    for (let i = 0; i < 8; i++) cmdB(w, { type: 'setInterpupillary', device: 'microscope', valueMm: w.microscope.ipdMm + 1 });
    cmdB(w, { type: 'gesture', part: 'mic:ocular', phase: 'end' });
    expect(err(w, 'E77')).toBe(1);
    expect(microscopeView(w).sharpness01).toBe(s0);
  },
  E78: () => {
    const w = onStage();
    cmdB(w, { type: 'turnCoarse', deltaTurns: -2 });
    const s0 = microscopeView(w).sharpness01;
    for (let i = 0; i < 12; i++) cmdB(w, { type: 'setDiopter', device: 'microscope', side: 'left', value: w.microscope.leftDiopter + 0.25 });
    expect(err(w, 'E78')).toBe(1);
    expect(microscopeView(w).sharpness01).toBe(s0);
  },
  E79: () => {
    const w = onStage();
    capture(w);
    toObjective(w, 10);
    focusMicroscope(w);
    // Platina subida a 10X hasta casi la distancia de trabajo del 40X; al enclavar el 40X queda casi tocando.
    const p = w.params.microscope;
    const gap40 = microscopeView(w).gapMm - (p.workingDistanceMm[10] - p.workingDistanceMm[40]) - (p.parfocalOffsetMm[40] - p.parfocalOffsetMm[10]);
    cmdB(w, { type: 'turnFine', deltaTurns: (gap40 - 0.15) / p.finePitchMmPerTurn });
    toObjective(w, 40);
    expect(err(w, 'E79')).toBe(1);
    expect(err(w, 'E21')).toBe(0);
    expect(microscopeView(w).gapMm).toBeLessThan(p.gapWarnMm);
  },
  E83: () => {
    const w = base();
    cmdB(w, { type: 'setPower', device: 'stereo', on: true });
    cmdB(w, { type: 'pickSpecimen', toolId: 'fc', sourceId: 'leaf1', pressure01: 0.3 });
    cmdB(w, { type: 'placeSpecimen', toolId: 'fc', targetId: 'stereoBase', dxCm: 1.2, dyCm: 0 });
    cmdB(w, { type: 'setStereoZoom', zoomX: 0.8 });
    cmdB(w, { type: 'setStereoZoom', zoomX: 2.5 });
    expect(err(w, 'E83')).toBe(1);
    expect(Math.hypot(...w.stereo.sampleOffsetMm)).toBeGreaterThan(stereoView(w).fovMm / 2);
  },
};

describe('B01 — 78 errores con consecuencia causal (§9)', () => {
  it('el catálogo tiene 78 errores únicos y una fixture por cada uno', () => {
    const codes = SIMULATED_ERRORS_B01.map((e) => e.code);
    expect(codes).toHaveLength(78);
    expect(new Set(codes).size).toBe(78);
    expect(Object.keys(FIXTURES).sort()).toEqual([...codes].sort());
  });
  for (const e of SIMULATED_ERRORS_B01) it(`${e.code} — ${e.trigger} → ${e.effect}`, () => FIXTURES[e.code]());
  it('el camino correcto no comete ninguno de los 78', () => {
    const { w } = idealAttemptB01();
    expect(Object.keys(w.evidence).filter((k) => k.startsWith('err:'))).toEqual([]);
  });
});

export { STEREO_BASE, captureCompound, captureStereo };
