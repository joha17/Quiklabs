/**
 * B10 — errores atribuibles (§9): cada fixture ejecuta el gesto real y comprueba su CONSECUENCIA. Al final, todos los códigos `err` del
 * catálogo deben haberse visto disparar, y todos los `nb` deben salir de una libreta real. TA-ASSET-* son incidencias: no dejan ningún `err:*`.
 */
import { afterAll, describe, expect, it } from 'vitest';
import type { AnimalWorld } from '../../simulation/animal-world/types';
import { SC_B10, dispatchAnimal } from '../../simulation/animal-world/world';
import { TA, type TaName } from '../../simulation/animal-world/codes';
import { modelById, orientationFor } from '../../simulation/animal-world/catalog';
import { MATERIALS } from '../../simulation/animal-world/materials';
import { microscopeView, stereoView } from '../../simulation/optical-world/world';
import { CLEAN_TRAY, PREP_SPOT, STAGE_SEAT, caseSlotIndex, caseSlotPos, stageTopZCm } from '../../simulation/optical-world/geometry';
import { SIMULATED_ERRORS_B10, incidentCode, type B10Scenario } from '../../practices/practice-b10/error-scenarios';
import { evaluateB10, notebookIssuesB10 } from '../../practices/practice-b10/rubric';
import { emptyB10Notebook, type B10Notebook } from '../../practices/practice-b10/notebook';
import { centerOn, classifyAll, cmdA, errKeysA, fixedRouteA, focusA, idealAttemptB10, markA, placeA, ppeB10, runA, worldB10 } from '../helpersB10';

const seenErr = new Set<string>();
const seenNb = new Set<string>();
const code = (n: TaName) => TA[n];
const fired = (w: AnimalWorld, n: TaName) => {
  const v = w.evidence[`err:${code(n)}`] ?? 0;
  if (v > 0) seenErr.add(code(n));
  return v;
};
const base = (scenarios: B10Scenario[] = []) => {
  const w = worldB10({ scenarios });
  ppeB10(w);
  return w;
};
const seat = { x: STAGE_SEAT.x, y: STAGE_SEAT.y, z: stageTopZCm(6) };
const micOn = (w: AnimalWorld) => {
  cmdA(w, { type: 'setPower', device: 'microscope', on: true });
  if (w.microscope.light01 < 0.2) cmdA(w, { type: 'setIllumination', device: 'microscope', value01: 0.4 });
};
const stage = (w: AnimalWorld, id: string) => {
  if (!w.slideCase.open) cmdA(w, { type: 'openSlideCase', open: true });
  cmdA(w, { type: 'readSlideLabel', slideId: id });
  placeA(w, id, 'hand');
  if (!w.microscope.clipOpen) cmdA(w, { type: 'openClip', open: true });
  placeA(w, id, 'stage', seat);
  cmdA(w, { type: 'openClip', open: false });
};
const onStage = (id = 'fxSK', scenarios: B10Scenario[] = []) => {
  const w = base(scenarios);
  micOn(w);
  stage(w, id);
  focusA(w);
  cmdA(w, { type: 'observe', instrument: 'compound', open: true });
  runA(w, 1);
  return w;
};
const capture = (w: AnimalWorld) => {
  runA(w, 1.6);
  const r = dispatchAnimal(w, { type: 'captureObservation', instrument: 'compound' });
  return r.id ? w.observations[r.id] : null;
};
const open = (w: AnimalWorld, id: string) => cmdA(w, { type: 'openModel', modelId: id });
const view = (w: AnimalWorld, id: string, regionId: string) => {
  const o = orientationFor(modelById(id)!.regions.find((r) => r.id === regionId)!);
  cmdA(w, { type: 'orientModel', modelId: id, yawDeg: o.yawDeg, pitchDeg: o.pitchDeg, zoom: 1 });
};
const regionOf = (id: string, part: string) => modelById(id)!.regions.find((r) => r.part === part)!.id;
/** Rotula con un nombre equivocado mirando la región: el rótulo queda sin validar y deja el código. */
const mislabel = (id: string, truth: string, wrong: string, n: TaName) => {
  const w = base();
  open(w, id);
  const r = regionOf(id, truth);
  view(w, id, r);
  cmdA(w, { type: 'labelRegion', modelId: id, regionId: r, part: wrong as never });
  expect(fired(w, n), n).toBeGreaterThan(0);
  expect(w.animal.labels[0].ok).toBe(false);
};
const misidentify = (id: string, guess: string, n: TaName) => {
  const w = base();
  open(w, id);
  cmdA(w, { type: 'identifyModel', modelId: id, guess });
  expect(fired(w, n), n).toBe(1);
  expect(w.animal.identified[id].ok).toBe(false);
};

describe('B10: clasificación y selección', () => {
  it('TA instrumento equivocado, modelo al microscopio, lámina al estereoscopio y huella como modelo', () => {
    const w = base();
    cmdA(w, { type: 'classifyMaterial', materialId: 'matDaphnia', materialClass: 'specimen', instrument: 'viewer' });
    expect(fired(w, 'WRONG_INSTRUMENT')).toBe(1);
    cmdA(w, { type: 'classifyMaterial', materialId: 'matScorpion', materialClass: 'model', instrument: 'microscope' });
    expect(fired(w, 'MODEL_TO_MICROSCOPE')).toBe(1);
    cmdA(w, { type: 'classifyMaterial', materialId: 'matMuscle', materialClass: 'slide', instrument: 'stereo' });
    expect(fired(w, 'SLIDE_TO_STEREO')).toBe(1);
    cmdA(w, { type: 'classifyMaterial', materialId: 'matTrack', materialClass: 'model', instrument: 'viewer' });
    expect(fired(w, 'TRACK_AS_MODEL')).toBe(1);
    expect(w.animal.cards.matTrack.classOk).toBe(false);
  });
  it('TA lámina sin leer la etiqueta queda registrada, y la leída no', () => {
    const w = base();
    micOn(w);
    cmdA(w, { type: 'openSlideCase', open: true });
    placeA(w, 'fxSK', 'hand');
    cmdA(w, { type: 'openClip', open: true });
    placeA(w, 'fxSK', 'stage', seat);
    expect(fired(w, 'LABEL_UNREAD')).toBe(1);
    const w2 = base();
    micOn(w2);
    stage(w2, 'fxSK');
    expect(w2.evidence[`err:${code('LABEL_UNREAD')}`] ?? 0).toBe(0);
  });
  it('TA lámina no asignada, otra ranura y fijada como fresca', () => {
    const w = base();
    micOn(w);
    cmdA(w, { type: 'openSlideCase', open: true });
    placeA(w, 'fxO', 'hand');
    cmdA(w, { type: 'openClip', open: true });
    placeA(w, 'fxO', 'stage', seat);
    cmdA(w, { type: 'openClip', open: false });
    focusA(w);
    cmdA(w, { type: 'observe', instrument: 'compound', open: true });
    expect(capture(w)?.issues).toContain('NOT_ASSIGNED');
    expect(fired(w, 'WRONG_SLIDE')).toBeGreaterThan(0);
    const w2 = base();
    cmdA(w2, { type: 'openSlideCase', open: true });
    placeA(w2, 'fxSK', 'hand');
    const home = caseSlotIndex(w2.slideCase.home.fxO);
    placeA(w2, 'fxO', 'cleanTray', CLEAN_TRAY);
    placeA(w2, 'fxSK', `case:${w2.slideCase.home.fxO}`, caseSlotPos(home));
    expect(fired(w2, 'WRONG_SLOT')).toBeGreaterThan(0);
    const w3 = onStage('fxSK');
    cmdA(w3, { type: 'wipe', targetId: 'fc', toolId: 'lp' });
    cmdA(w3, { type: 'grabCover', coverId: 'cv1', toolId: 'fc' });
    cmdA(w3, { type: 'setCoverTilt', coverId: 'cv1', angleDeg: 45 });
    expect(dispatchAnimal(w3, { type: 'lowerCover', coverId: 'cv1', slideId: 'fxSK', speedCmS: 0.4, dxCm: 0, dyCm: 0 }).ok).toBe(false);
    expect(fired(w3, 'FIXED_AS_FRESH')).toBeGreaterThan(0);
  });
});

describe('B10: microscopio', () => {
  it('TA empezar a 40X sin localizar', () => {
    const w = base();
    micOn(w);
    stage(w, 'fxSK');
    cmdA(w, { type: 'selectObjective', objectiveX: 40 });
    expect(fired(w, 'START_40X')).toBeGreaterThan(0);
  });
  it('TA luz apagada, baja y excesiva quedan en la captura', () => {
    const w = onStage();
    cmdA(w, { type: 'setPower', device: 'microscope', on: false });
    const o = capture(w);
    expect(fired(w, 'LIGHT_OFF')).toBeGreaterThan(0);
    expect(o?.isObservationValid ?? false).toBe(false);
    const w2 = onStage();
    cmdA(w2, { type: 'setIllumination', device: 'microscope', value01: 0.03 });
    capture(w2);
    expect(fired(w2, 'LIGHT_LOW')).toBeGreaterThan(0);
    const w3 = onStage();
    cmdA(w3, { type: 'setIllumination', device: 'microscope', value01: 1 });
    cmdA(w3, { type: 'setDiaphragm', value01: 1 });
    capture(w3);
    expect(fired(w3, 'LIGHT_EXCESS')).toBeGreaterThan(0);
  });
  it('TA lámina mal asentada y suelta', () => {
    const w = base();
    micOn(w);
    cmdA(w, { type: 'openSlideCase', open: true });
    cmdA(w, { type: 'readSlideLabel', slideId: 'fxSK' });
    placeA(w, 'fxSK', 'hand');
    cmdA(w, { type: 'openClip', open: false });
    dispatchAnimal(w, { type: 'setPose', id: 'fxSK', pose: { ...seat, rotationRad: 0 }, support: 'stage' });
    expect(fired(w, 'SLIDE_BADLY_SEATED')).toBeGreaterThan(0);
    const w2 = base();
    micOn(w2);
    cmdA(w2, { type: 'openSlideCase', open: true });
    cmdA(w2, { type: 'readSlideLabel', slideId: 'fxSK' });
    placeA(w2, 'fxSK', 'hand');
    cmdA(w2, { type: 'openClip', open: true });
    placeA(w2, 'fxSK', 'stage', seat);
    focusA(w2);
    cmdA(w2, { type: 'setStageXY', xMm: 1, yMm: 1 });
    expect(fired(w2, 'SLIDE_UNCLAMPED')).toBeGreaterThan(0);
  });
  it('TA fuera del centro y cambio de objetivo sin centrar', () => {
    const w = onStage();
    cmdA(w, { type: 'setStageXY', xMm: 9, yMm: 9 });
    expect(fired(w, 'OFF_CENTER')).toBeGreaterThan(0);
    const w2 = onStage('fxCO', [SC_B10.SPONGE_CNIDARIA]);
    cmdA(w2, { type: 'selectObjective', objectiveX: 40 });
    expect(fired(w2, 'CHANGE_UNCENTERED')).toBeGreaterThan(0);
  });
  it('TA macrométrico en alto aumento y choque', () => {
    const w = onStage();
    cmdA(w, { type: 'selectObjective', objectiveX: 40 });
    dispatchAnimal(w, { type: 'turnCoarse', deltaTurns: 3 });
    expect(fired(w, 'COARSE_HIGH')).toBeGreaterThan(0);
    expect(fired(w, 'COLLISION')).toBeGreaterThan(0);
  });
  it('TA retirar sin margen y cierre incompleto', () => {
    const w = onStage();
    cmdA(w, { type: 'selectObjective', objectiveX: 40 });
    focusA(w);
    cmdA(w, { type: 'openClip', open: true });
    dispatchAnimal(w, { type: 'setPose', id: 'fxSK', pose: { x: CLEAN_TRAY.x, y: CLEAN_TRAY.y, z: 0, rotationRad: 0 }, support: 'cleanTray' });
    expect(fired(w, 'REMOVE_UNSAFE')).toBeGreaterThan(0);
    const w2 = onStage();
    cmdA(w2, { type: 'selectObjective', objectiveX: 10 });
    dispatchAnimal(w2, { type: 'closeBench' });
    expect(fired(w2, 'BAD_SHUTDOWN')).toBeGreaterThan(0);
  });
  it('TA conclusión borrosa: la captura no vale', () => {
    const w = onStage();
    cmdA(w, { type: 'turnFine', deltaTurns: 4 });
    const o = capture(w);
    expect(fired(w, 'BLURRY_CONCLUSION')).toBeGreaterThan(0);
    expect(o?.isObservationValid ?? false).toBe(false);
  });
  it('TA medir sin escala trazable y aceite sin limpiar', () => {
    const w = onStage();
    const o = capture(w)!;
    const r = dispatchAnimal(w, { type: 'measure', observationId: o.id, ax: 300, ay: 500, bx: 700, by: 500, scale: 'assumed' });
    expect(r.ok).toBe(false);
    expect(fired(w, 'MEASURE_NO_SCALE')).toBeGreaterThan(0);
    const w2 = onStage();
    dispatchAnimal(w2, { type: 'addImmersionOil', slideId: 'fxSK', drops: 1 });
    dispatchAnimal(w2, { type: 'closeBench' });
    expect(fired(w2, 'OIL_NOT_CLEANED')).toBeGreaterThan(0);
  });
  it('TA captura ajena: no se puede adjuntar', () => {
    const w = onStage();
    const o = capture(w)!;
    expect(dispatchAnimal(w, { type: 'attachObservation', observationId: o.id, attemptHash: 'otro' } as never).ok).toBe(false);
    expect(fired(w, 'WRONG_CAPTURE')).toBeGreaterThan(0);
  });
});

describe('B10: estereoscopio', () => {
  const stereo = (light = true) => {
    const w = base();
    cmdA(w, { type: 'setPower', device: 'stereo', on: true });
    if (light) cmdA(w, { type: 'setIllumination', device: 'stereo-incident', value01: 0.5 });
    return w;
  };
  const put = (w: AnimalWorld, id = 'stDaphnia', dx = 0) => {
    cmdA(w, { type: 'wipe', targetId: 'fc', toolId: 'lp' });
    cmdA(w, { type: 'pickSpecimen', toolId: 'fc', sourceId: id, pressure01: 0.3 });
    cmdA(w, { type: 'placeSpecimen', toolId: 'fc', targetId: 'stereoBase', dxCm: dx, dyCm: 0 });
  };
  const cap = (w: AnimalWorld) => {
    dispatchAnimal(w, { type: 'observe', instrument: 'stereo', open: true });
    runA(w, 1.6);
    return dispatchAnimal(w, { type: 'captureObservation', instrument: 'stereo' });
  };
  it('TA muestra mal puesta o fuera de campo', () => {
    const w = stereo();
    cap(w);
    expect(fired(w, 'STEREO_SAMPLE_MISPLACED')).toBeGreaterThan(0);
    const w2 = stereo();
    cmdA(w2, { type: 'setStereoZoom', zoomX: 1 });
    const wide = stereoView(w2).fovMm;
    cmdA(w2, { type: 'setStereoZoom', zoomX: 3 });
    const tight = stereoView(w2).fovMm;
    cmdA(w2, { type: 'setStereoZoom', zoomX: 1 });
    put(w2, 'stDaphnia', (wide + tight) / 40);
    cmdA(w2, { type: 'setStereoZoom', zoomX: 3 });
    expect(fired(w2, 'STEREO_OUT_OF_FIELD')).toBeGreaterThan(0);
  });
  it('TA sin luz incidente o apagado, y empezar con zoom alto', () => {
    const w = stereo(false);
    cmdA(w, { type: 'setIllumination', device: 'stereo-incident', value01: 0 });
    put(w);
    cap(w);
    expect(fired(w, 'STEREO_LIGHT')).toBeGreaterThan(0);
    const w2 = stereo();
    put(w2);
    cmdA(w2, { type: 'setStereoZoom', zoomX: 4 });
    expect(fired(w2, 'STEREO_ZOOM_FIRST')).toBeGreaterThan(0);
  });
  it('TA desenfocada y no despejar la base al cerrar', () => {
    const w = stereo();
    put(w);
    cmdA(w, { type: 'setStereoZoom', zoomX: 1 });
    dispatchAnimal(w, { type: 'setStereoFocus', deltaTurns: 500 });
    expect(fired(w, 'STEREO_UNFOCUSED')).toBeGreaterThan(0);
    dispatchAnimal(w, { type: 'closeBench' });
    expect(fired(w, 'STEREO_NOT_CLEARED')).toBeGreaterThan(0);
  });
  it('TA estereoscopio exigido y sin usar', () => {
    const w = base();
    dispatchAnimal(w, { type: 'closeBench' });
    expect(fired(w, 'STEREO_NOT_USED')).toBeGreaterThan(0);
  });
});

describe('B10: montaje fresco (S29)', () => {
  const cut = (w: AnimalWorld) => {
    placeA(w, 'sl1', 'prep', PREP_SPOT);
    cmdA(w, { type: 'wipe', targetId: 'sc', toolId: 'lp' });
    cmdA(w, { type: 'cutSource', sourceId: 'mus', toolId: 'sc', thicknessMm: 0.3, lengthCm: 0.5 });
    cmdA(w, { type: 'wipe', targetId: 'fc', toolId: 'lp' });
    cmdA(w, { type: 'pickSpecimen', toolId: 'fc', sourceId: 'board' });
  };
  const fresh = () => base([SC_B10.FRESH]);
  it('un buen montaje se observa con fibras de músculo crudo', () => {
    const w = fresh();
    cut(w);
    cmdA(w, { type: 'placeSpecimen', toolId: 'fc', targetId: 'sl1', dxCm: 0, dyCm: 0 });
    cmdA(w, { type: 'squeezeDropper', dispenserId: 'dw', targetId: 'sl1', force01: 0.5, dxCm: 0, dyCm: 0 });
    cmdA(w, { type: 'wipe', targetId: 'fc', toolId: 'lp' });
    cmdA(w, { type: 'grabCover', coverId: 'cv1', toolId: 'fc' });
    cmdA(w, { type: 'setCoverTilt', coverId: 'cv1', angleDeg: 45 });
    cmdA(w, { type: 'lowerCover', coverId: 'cv1', slideId: 'sl1', speedCmS: 0.4, dxCm: 0, dyCm: 0 });
    micOn(w);
    cmdA(w, { type: 'openClip', open: true });
    placeA(w, 'sl1', 'stage', seat);
    cmdA(w, { type: 'openClip', open: false });
    focusA(w);
    cmdA(w, { type: 'observe', instrument: 'compound', open: true });
    const o = capture(w)!;
    expect(o.assetId).toBe('muscleFresh');
    expect(o.isObservationValid).toBe(true);
  });
  it('TA fuera del centro, sin líquido, exceso, cubreobjetos de golpe, roto, burbujas', () => {
    const w = fresh();
    cut(w);
    cmdA(w, { type: 'placeSpecimen', toolId: 'fc', targetId: 'sl1', dxCm: 2, dyCm: 0 });
    expect(fired(w, 'MOUNT_OFF_CENTER')).toBeGreaterThan(0);
    const w2 = fresh();
    cut(w2);
    cmdA(w2, { type: 'placeSpecimen', toolId: 'fc', targetId: 'sl1', dxCm: 0, dyCm: 0 });
    cmdA(w2, { type: 'wipe', targetId: 'fc', toolId: 'lp' });
    cmdA(w2, { type: 'grabCover', coverId: 'cv1', toolId: 'fc' });
    cmdA(w2, { type: 'setCoverTilt', coverId: 'cv1', angleDeg: 5 });
    dispatchAnimal(w2, { type: 'lowerCover', coverId: 'cv1', slideId: 'sl1', speedCmS: 3, dxCm: 0, dyCm: 0 });
    expect(fired(w2, 'LIQUID_MISSING')).toBeGreaterThan(0);
    expect(fired(w2, 'COVER_DROPPED')).toBeGreaterThan(0);
    const w3 = fresh();
    cut(w3);
    cmdA(w3, { type: 'placeSpecimen', toolId: 'fc', targetId: 'sl1', dxCm: 0, dyCm: 0 });
    for (let i = 0; i < 6; i++) cmdA(w3, { type: 'squeezeDropper', dispenserId: 'dw', targetId: 'sl1', force01: 1, dxCm: 0, dyCm: 0 });
    cmdA(w3, { type: 'wipe', targetId: 'fc', toolId: 'lp' });
    cmdA(w3, { type: 'grabCover', coverId: 'cv1', toolId: 'fc' });
    cmdA(w3, { type: 'setCoverTilt', coverId: 'cv1', angleDeg: 5 });
    dispatchAnimal(w3, { type: 'lowerCover', coverId: 'cv1', slideId: 'sl1', speedCmS: 3, dxCm: 0, dyCm: 0 });
    expect(fired(w3, 'LIQUID_EXCESS')).toBeGreaterThan(0);
    // El descenso plano deja una burbuja sobre el centro: lo que se captura ahí no sirve.
    micOn(w3);
    cmdA(w3, { type: 'openClip', open: true });
    placeA(w3, 'sl1', 'stage', seat);
    cmdA(w3, { type: 'openClip', open: false });
    focusA(w3);
    cmdA(w3, { type: 'observe', instrument: 'compound', open: true });
    capture(w3);
    expect(fired(w3, 'BUBBLES')).toBeGreaterThan(0);
    dispatchAnimal(w3, { type: 'pressCover', slideId: 'sl1', force01: 1 });
    expect(fired(w3, 'COVER_BROKEN')).toBeGreaterThan(0);
    expect(w3.mounts.sl1.broken).toBe(true);
  });
  it('TA sucio, contaminación, volteado y muestra seca', () => {
    const w = fresh();
    w.slides.sl1.dirty01 = 0.9;
    w.evidence['residueSeen:sl1'] = 1;
    cut(w);
    cmdA(w, { type: 'placeSpecimen', toolId: 'fc', targetId: 'sl1', dxCm: 0, dyCm: 0 });
    expect(fired(w, 'DIRTY_SLIDE')).toBeGreaterThan(0);
    runA(w, 400);
    expect(fired(w, 'SAMPLE_DRY')).toBeGreaterThan(0);
    dispatchAnimal(w, { type: 'flipSlide', slideId: 'sl1' });
    expect(fired(w, 'SAMPLE_INVERTED')).toBe(1);
    const w2 = fresh();
    cut(w2);
    cmdA(w2, { type: 'placeSpecimen', toolId: 'fc', targetId: 'sl1', dxCm: 0, dyCm: 0 });
    cmdA(w2, { type: 'cutSource', sourceId: 'mus', toolId: 'sc', thicknessMm: 0.3, lengthCm: 0.5 });
    w2.cell.toolResidue.fc = 'buccal';
    cmdA(w2, { type: 'pickSpecimen', toolId: 'fc', sourceId: 'board' });
    cmdA(w2, { type: 'placeSpecimen', toolId: 'fc', targetId: 'sl2', dxCm: 0, dyCm: 0 }, false);
    expect(fired(w2, 'CROSS_CONTAMINATION')).toBeGreaterThan(0);
  });
});

describe('B10: histología y marcas', () => {
  it('TA discos no resueltos y estructura inventada: la marca no vale', () => {
    const w = onStage('fxCA');
    cmdA(w, { type: 'selectObjective', objectiveX: 10 });
    focusA(w);
    cmdA(w, { type: 'selectObjective', objectiveX: 40 });
    focusA(w);
    cmdA(w, { type: 'setDiaphragm', value01: 0.6 });
    const o = capture(w)!;
    expect(markA(w, o.id, 'intercalatedDisc').value).toBe(0);
    expect(fired(w, 'DISCS_OVERCLAIM')).toBe(1);
    expect(markA(w, o.id, 'nucleolus').value).toBe(0);
    expect(fired(w, 'ORGANELLES_UNRESOLVED')).toBe(1);
    expect(markA(w, o.id, 'scolexS').value).toBe(0);
    expect(fired(w, 'STRUCTURE_INVENTED')).toBe(1);
  });
  it('los discos solo valen en el activo del docente que los resuelve (S28)', () => {
    const w = onStage('fxCA', [SC_B10.TEACHER]);
    cmdA(w, { type: 'selectObjective', objectiveX: 10 });
    focusA(w);
    cmdA(w, { type: 'selectObjective', objectiveX: 40 });
    focusA(w);
    cmdA(w, { type: 'setDiaphragm', value01: 0.6 });
    const o = capture(w)!;
    expect(o.assetId).toBe('muscleCardiacDiscs');
    expect(markA(w, o.id, 'intercalatedDisc').value).toBe(1);
  });
  it('TA capas de cnidario señaladas donde no están', () => {
    const w = onStage('fxSP');
    centerOn(w, 'choanocyte');
    cmdA(w, { type: 'selectObjective', objectiveX: 10 });
    focusA(w);
    const o = capture(w)!;
    expect(markA(w, o.id, 'mesoglea').value).toBe(0);
    expect(fired(w, 'CNIDARIAN_LAYERS')).toBe(1);
  });
});

describe('B10: modelos', () => {
  it('rotular de espaldas se rechaza y deja el código; girando, sí', () => {
    const w = base();
    open(w, 'skullHorse');
    const r = regionOf('skullHorse', 'foramenMagnum');
    const res = dispatchAnimal(w, { type: 'labelRegion', modelId: 'skullHorse', regionId: r, part: 'foramenMagnum' });
    expect(res.code).toBe('REGION_HIDDEN');
    expect(fired(w, 'WRONG_VIEW_LABEL')).toBe(1);
    expect(w.animal.labels).toEqual([]);
    view(w, 'skullHorse', r);
    cmdA(w, { type: 'labelRegion', modelId: 'skullHorse', regionId: r, part: 'foramenMagnum' });
    expect(w.animal.labels[0].ok).toBe(true);
  });
  it('rótulos con modelo cerrado no valen', () => {
    const w = base();
    expect(dispatchAnimal(w, { type: 'labelRegion', modelId: 'spider', regionId: 'a', part: 'cephalothorax' }).code).toBe('MODEL_CLOSED');
  });
  it('TA confusiones de organismos', () => {
    misidentify('planaria', 'fluke', 'PLANARIA_FLUKE');
    misidentify('fluke', 'cestode', 'FLUKE_CESTODE');
    misidentify('nematode', 'earthworm', 'NEMATODE_ANNELID');
    misidentify('spider', 'scorpion', 'SPIDER_SCORPION');
    misidentify('scorpion', 'opilion', 'SCORPION_OPILION');
    misidentify('grasshopper', 'spider', 'INSECT_ARACHNID');
    misidentify('boneFish', 'cartFish', 'BONY_CARTILAGINOUS');
    misidentify('frog', 'lizard', 'AMPHIBIAN_REPTILE');
    misidentify('mammal', 'birdFinch', 'BIRD_MAMMAL_SIZE');
  });
  it('TA rótulos confundidos', () => {
    mislabel('cestode', 'scolex', 'neck', 'SCOLEX_MISSED');
    mislabel('earthworm', 'clitellum', 'prostomium', 'CLITELLUM_MISSED');
    mislabel('nematode', 'cuticle', 'segment', 'SEGMENTS_WRONG');
    mislabel('spider', 'cephalothorax', 'head', 'THREE_TAGMATA');
    mislabel('grasshopper', 'antenna', 'leg', 'APPENDAGE_MISSED');
    mislabel('frog', 'forelimb', 'hindlimb', 'LIMB_MISSED');
    mislabel('boneFish', 'operculum', 'lateralLine', 'GILL_LABEL');
    mislabel('skullHorse', 'incisor', 'canine', 'INCISOR_CANINE');
    mislabel('skullHorse', 'molar', 'premolar', 'MOLAR_PREMOLAR');
    mislabel('skullHorse', 'premolar', 'tusk', 'TUSK_ANY_TOOTH');
    mislabel('skullHorse', 'orbit', 'zygomaticArch', 'ORBIT_LABEL');
    mislabel('skullHorse', 'mandible', 'maxilla', 'JAW_LABEL');
    mislabel('skullHorse', 'diastema', 'molar', 'DIASTEMA_MISSED');
  });
  it('TA tanteo: varios rótulos errados seguidos', () => {
    const w = base();
    open(w, 'skullHorse');
    const r = regionOf('skullHorse', 'orbit');
    view(w, 'skullHorse', r);
    for (const p of ['molar', 'canine', 'tusk', 'incisor'] as const) cmdA(w, { type: 'labelRegion', modelId: 'skullHorse', regionId: r, part: p });
    expect(fired(w, 'TRIAL_AND_ERROR')).toBeGreaterThan(0);
  });
  it('TA picos, patas y caballo contra vaca', () => {
    const w = base();
    open(w, 'birdRaptor');
    cmdA(w, { type: 'answerBird', modelId: 'birdRaptor', beak: 'seed', foot: 'webbed' });
    expect(fired(w, 'BEAK_CONFUSED')).toBe(1);
    expect(fired(w, 'FOOT_CONFUSED')).toBe(1);
    open(w, 'skullCow');
    cmdA(w, { type: 'answerSkull', modelId: 'skullCow', taxon: 'horse', diet: 'grazer' });
    expect(fired(w, 'HORSE_COW')).toBe(1);
    expect(w.animal.skulls.skullCow.ok).toBe(false);
  });
  it('TA huella por intuición, relieve como color y casco como dedos', () => {
    const w = base();
    open(w, 'trackCow');
    cmdA(w, { type: 'answerTrack', trackId: 'trackCow', digits: 2, support: 'digitigrade', claws: false });
    expect(fired(w, 'TRACK_BY_INTUITION')).toBe(1);
    expect(fired(w, 'RELIEF_AS_COLOR')).toBe(1);
    expect(fired(w, 'HOOF_DIGITIGRADE')).toBe(1);
    expect(w.animal.tracks.trackCow.sawRelief).toBe(false);
  });
  it('TA modelo con falla sin informar; informarlo no deja error ni descuento', () => {
    const w = base([SC_B10.INCIDENT]);
    open(w, 'opilion');
    dispatchAnimal(w, { type: 'closeBench' });
    expect(fired(w, 'MISSING_ASSET_UNREPORTED')).toBe(1);
    const w2 = base([SC_B10.INCIDENT]);
    open(w2, 'opilion');
    cmdA(w2, { type: 'reportAsset', assetId: 'opilion', problem: 'incomplete' });
    dispatchAnimal(w2, { type: 'closeBench' });
    expect(w2.evidence[`err:${code('MISSING_ASSET_UNREPORTED')}`] ?? 0).toBe(0);
    expect(w2.cell.incidents.map(incidentCode)).toContain('TA-ASSET-04');
  });
  it('incidencias: no dejan err ni bajan la nota', () => {
    const { w, nb } = idealAttemptB10();
    const before = evaluateB10(w, nb).total;
    dispatchAnimal(w, { type: 'requestVideo', subject: 'daphnia' });
    for (const p of ['missing', 'incomplete', 'noScale', 'lowResolution', 'lowRelief'] as const) dispatchAnimal(w, { type: 'reportAsset', assetId: 'x', problem: p });
    expect(errKeysA(w)).toEqual([]);
    expect(evaluateB10(w, nb).total).toBe(before);
    expect(new Set(w.cell.incidents.map(incidentCode)).size).toBeGreaterThanOrEqual(5);
  });
  it('los nombres de estudio se bloquean en Evaluación y no acreditan en repaso', () => {
    const w = base([SC_B10.EVAL_4]);
    expect(dispatchAnimal(w, { type: 'setStudyLabels', on: true }).code).toBe('STUDY_LOCKED');
    const w2 = base();
    cmdA(w2, { type: 'setStudyLabels', on: true });
    open(w2, 'nematode');
    cmdA(w2, { type: 'labelRegion', modelId: 'nematode', regionId: 'a', part: 'anteriorEnd' });
    expect(w2.animal.labels[0].ok).toBe(true);
    expect(w2.animal.labels[0].studyLabels).toBe(true);
    expect(modelById('nematode')).toBeTruthy();
  });
});

describe('B10: libreta', () => {
  const ideal = idealAttemptB10();
  const issue = (fn: (n: B10Notebook) => void, world = ideal.w) => {
    const nb = structuredClone(ideal.nb);
    fn(nb);
    const out = notebookIssuesB10(world, nb);
    for (const k of out) seenNb.add(k.slice(3));
    return out;
  };
  const nbCode = (n: TaName) => `nb:${code(n)}`;
  it('cada confusión escrita deja su código', () => {
    expect(issue((n) => { n.muscle.cardiacGuess = 'skeletal'; })).toContain(nbCode('CARDIAC_AS_SKELETAL'));
    expect(issue((n) => { n.muscle.skeletalGuess = 'smooth'; })).toContain(nbCode('SKELETAL_AS_SMOOTH'));
    expect(issue((n) => { n.muscle.skeletalNuclei = 'multi'; n.muscle.skeletalObservationId = Object.values(ideal.res.slides.fxSP)[0]; })).toContain(nbCode('NUCLEI_OVERCLAIM'));
    expect(issue((n) => { n.muscle.cardiacDiscs = 'visible'; })).toContain(nbCode('DISCS_OVERCLAIM'));
    expect(issue((n) => { n.muscle.prepQuality = 'ignored'; })).toContain(nbCode('BAD_PREP_IGNORED'));
    expect(issue((n) => { n.tissues[0].tissue = 'connective'; })).toContain(nbCode('EPITHELIUM_AS_CONNECTIVE'));
    expect(issue((n) => { n.tissues[2].tissue = 'skeletal'; })).toContain(nbCode('NERVE_AS_MUSCLE'));
    expect(issue((n) => { n.tissues[0].level = 'organism'; })).toContain(nbCode('TISSUE_AS_ORGANISM'));
    expect(issue((n) => { n.tissues[0].basis = 'memory'; })).toContain(nbCode('FUNCTION_UNSUPPORTED'));
    expect(issue((n) => { n.tissues[0].totalMag = '10'; })).toContain(nbCode('MAG_CONFUSED'));
    expect(issue((n) => { n.tissues[0].observationId = null; })).toContain(nbCode('THUMBNAIL_ANSWER'));
    expect(issue((n) => { n.tissues[0].observationId = n.muscle.skeletalObservationId; n.tissues[0].tissue = 'skeletal'; n.inverts[0].organism = 'coral'; })).toContain(nbCode('MIXED_OBSERVATIONS'));
    expect(issue((n) => { n.inverts[0].organization = 'trueTissues'; })).toContain(nbCode('SPONGE_TRUE_TISSUES'));
    expect(issue((n) => { n.claims.allSpongesTrueTissues = true; })).toContain(nbCode('SPONGE_TRUE_TISSUES'));
    expect(issue((n) => { n.inverts[1].symmetry = 'bilateral'; })).toContain(nbCode('SYMMETRY_CONFUSED'));
    expect(issue((n) => { n.inverts[1].form = 'polyp'; })).toContain(nbCode('POLYP_MEDUSA'));
    expect(issue((n) => { n.claims.allGroupsSameOrganization = true; })).toContain(nbCode('SAME_ORGANIZATION'));
    expect(issue((n) => { n.small[0].motion = 'observed'; })).toContain(nbCode('MOTION_FROM_STILL'));
    expect(issue((n) => { n.small[0].organism = 'louse'; })).toContain(nbCode('DAPHNIA_LOUSE'));
    expect(issue((n) => { n.zoo = []; })).toContain(nbCode('NO_COMPARISON'));
    expect(issue((n) => { n.atlas.delivered = false; })).toContain(nbCode('NO_ATLAS'));
    expect(issue((n) => { n.zoo = []; n.trackRows = []; n.skull.horseTrait = ''; })).toContain(nbCode('CLOSED_UNSAVED'));
  });
  it('coral y medusa se contrastan con la captura propia', () => {
    const c = idealAttemptB10(2610, [SC_B10.SPONGE_CNIDARIA]);
    const row = c.nb.inverts.findIndex((r) => r.organism === 'coral');
    const nb = structuredClone(c.nb);
    nb.inverts[row].organism = 'medusa';
    const out = notebookIssuesB10(c.w, nb);
    expect(out).toContain(nbCode('CORAL_AS_MEDUSA'));
    const nb2 = structuredClone(c.nb);
    nb2.inverts[row].form = 'medusa';
    const out2 = notebookIssuesB10(c.w, nb2);
    expect(out2).toContain(nbCode('COLONY_AS_MEDUSA'));
    for (const k of [...out, ...out2]) seenNb.add(k.slice(3));
  });
  it('una libreta vacía no acredita nada propio', () => {
    const w = worldB10();
    ppeB10(w);
    const ev = evaluateB10(w, emptyB10Notebook());
    expect(ev.total).toBeLessThan(0.2);
    classifyAll(w);
    expect(Object.keys(MATERIALS).length).toBe(8);
    expect(microscopeView(w).objectiveX).toBe(4);
    expect(fixedRouteA).toBeTruthy();
  });
});

afterAll(() => {
  const errCodes = SIMULATED_ERRORS_B10.filter((e) => e.kind === 'err').map((e) => e.code);
  const nbCodes = SIMULATED_ERRORS_B10.filter((e) => e.kind === 'nb').map((e) => e.code);
  expect(errCodes.filter((c) => !seenErr.has(c)), 'err sin gesto').toEqual([]);
  expect(nbCodes.filter((c) => !seenNb.has(c)), 'nb sin libreta').toEqual([]);
});
