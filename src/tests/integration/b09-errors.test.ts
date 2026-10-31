/**
 * B09 — errores atribuibles (§9): cada fixture ejecuta el gesto real y comprueba la CONSECUENCIA en el estado, la observación
 * o la libreta (no solo el aviso). TV-40, TV-53 y TV-ASSET-* son incidencias: no dejan ningún `err:*`.
 */
import { afterAll, describe, expect, it } from 'vitest';
import type { PlantWorld } from '../../simulation/plant-world/types';
import { SC_B09, conservedPlant, dispatchPlant } from '../../simulation/plant-world/world';
import { microscopeView } from '../../simulation/optical-world/world';
import { STAGE_SEAT, STEREO_BASE, stageTopZCm } from '../../simulation/optical-world/geometry';
import { SIMULATED_ERRORS_B09, incidentCode, type B09Scenario } from '../../practices/practice-b09/error-scenarios';
import { notebookIssuesB09 } from '../../practices/practice-b09/rubric';
import { emptyB09Notebook } from '../../practices/practice-b09/notebook';
import {
  cmdP, coverP, cutP, dropP, errKeysP, focusP, idealAttemptB09, microscopeOnP, placeP, ppeB09, runP, slideToZone,
  toObjectiveP, toStageP, transfer, waterMount, wiesnerMount, worldB09,
} from '../helpersB09';

/** Códigos cuyo gesto real ya se vio disparar: al final deben estar todos los del catálogo. */
const seen = new Set<string>();
const err = (w: PlantWorld, n: number) => {
  const code = `TV-${String(n).padStart(2, '0')}`;
  const v = w.evidence[`err:${code}`] ?? 0;
  if (v > 0) seen.add(code);
  return v;
};
const base = (scenarios: B09Scenario[] = []) => {
  const w = worldB09({ scenarios });
  ppeB09(w);
  return w;
};
const seat = { x: STAGE_SEAT.x, y: STAGE_SEAT.y, z: stageTopZCm(6) };
/** Montaje en agua en la platina, 4X enfocado y ocular abierto. */
const onStage = (scenarios: B09Scenario[] = []) => {
  const w = base(scenarios);
  waterMount(w, 'cel', 'sl1', 'cv1');
  microscopeOnP(w);
  toObjectiveP(w, 4);
  toStageP(w, 'sl1');
  focusP(w);
  cmdP(w, { type: 'observe', instrument: 'compound', open: true });
  runP(w, 1);
  return w;
};
const fixedOnStage = (id: string, scenarios: B09Scenario[] = []) => {
  const w = base(scenarios);
  microscopeOnP(w);
  cmdP(w, { type: 'openSlideCase', open: true });
  placeP(w, id, 'hand');
  toObjectiveP(w, 4);
  toStageP(w, id);
  focusP(w);
  cmdP(w, { type: 'observe', instrument: 'compound', open: true });
  runP(w, 1);
  return w;
};
const capture = (w: PlantWorld) => {
  runP(w, 1.6);
  const r = dispatchPlant(w, { type: 'captureObservation', instrument: 'compound' });
  return r.id ? w.observations[r.id] : null;
};
const to10 = (w: PlantWorld) => {
  toObjectiveP(w, 10);
  focusP(w);
  return capture(w)!;
};

describe('B09: morfología externa', () => {
  it('TV-02 a TV-04: el rótulo equivocado no cambia la planta y queda sin validar', () => {
    const w = base();
    cmdP(w, { type: 'labelExternal', specimen: 'bean', regionId: 'e', part: 'apicalBud' });
    expect(err(w, 2)).toBe(1);
    cmdP(w, { type: 'labelExternal', specimen: 'bean', regionId: 'e', part: 'node' });
    expect(err(w, 3)).toBe(1);
    cmdP(w, { type: 'labelExternal', specimen: 'maize', regionId: 'b', part: 'petiole' });
    expect(err(w, 4)).toBe(1);
    expect(w.plant.labels.every((l) => !l.ok)).toBe(true);
  });
});

describe('B09: corte', () => {
  it('TV-09 plano no solicitado: la captura no es válida', () => {
    const w = base();
    waterMount(w, 'cel', 'sl1', 'cv1', { plane: 'longitudinal' });
    expect(err(w, 9)).toBe(1);
    microscopeOnP(w);
    toObjectiveP(w, 4);
    toStageP(w, 'sl1');
    focusP(w);
    cmdP(w, { type: 'observe', instrument: 'compound', open: true });
    const o = capture(w)!;
    expect(o.issues).toContain('WRONG_PLANE');
    expect(o.isObservationValid).toBe(false);
  });
  it('TV-10 grueso, TV-11 fino y TV-13 aplastado bajan la calidad de la sección', () => {
    const w = base();
    cutP(w, 'cel', { thicknessUm: 400 });
    expect(err(w, 10)).toBe(1);
    expect(w.plant.sections[0].viableAreaFraction).toBeLessThan(0.5);
    cmdP(w, { type: 'dispose', objectId: 'board', containerId: 'bioWaste' }, false);
    const w2 = base();
    cutP(w2, 'cel', { thicknessUm: 10 });
    expect(err(w2, 11)).toBe(1);
    expect(w2.plant.sections[0].integrity01).toBeLessThan(0.7);
    const w3 = base();
    cutP(w3, 'cel', { pressure01: 0.9 });
    expect(err(w3, 13)).toBe(1);
    expect(w3.plant.sections[0].crushed).toBe(true);
    expect(w3.plant.sections[0].integrity01).toBeLessThan(0.7);
  });
  it('TV-12 región equivocada y TV-14 sin sujetar invalidan la captura', () => {
    const w = base();
    waterMount(w, 'cel', 'sl1', 'cv1', { region: 'other' });
    expect(err(w, 12)).toBe(1);
    const w2 = base();
    waterMount(w2, 'cel', 'sl1', 'cv1', { held: false });
    expect(err(w2, 14)).toBe(1);
    expect(w2.plant.sections[0].actualPlane).toBe('oblique');
  });
  it('TV-15 bisturí con restos de otra muestra', () => {
    const w = base();
    cmdP(w, { type: 'holdSource', sourceId: 'cel', hold: true });
    cmdP(w, { type: 'cutSection', sourceId: 'cel', plane: 'transverse', thicknessUm: 80, lengthCm: 0.8, region: 'petiole', pressure01: 0.3 });
    slideToZone(w, 'sl1');
    transfer(w, 'sl1');
    cmdP(w, { type: 'holdSource', sourceId: 'pea', hold: true });
    cmdP(w, { type: 'cutSection', sourceId: 'pea', plane: 'transverse', thicknessUm: 80, lengthCm: 0.8, region: 'flesh', pressure01: 0.3 });
    expect(err(w, 15)).toBeGreaterThan(0);
  });
  it('TV-18 dos secciones sobre la misma lámina suman espesor', () => {
    const w = base();
    slideToZone(w, 'sl1');
    cutP(w, 'cel');
    transfer(w, 'sl1');
    const before = w.mounts.sl1.cell!.zones[0].thicknessMm;
    cutP(w, 'cel');
    transfer(w, 'sl1');
    expect(err(w, 18)).toBe(1);
    expect(w.mounts.sl1.cell!.zones[0].thicknessMm).toBeGreaterThan(before);
    expect(Math.abs(conservedPlant(w).tissue ?? 0)).toBeLessThan(1e-9);
  });
  it('TV-19 sección sin medio acuoso', () => {
    const w = base();
    slideToZone(w, 'sl1');
    cutP(w, 'cel');
    transfer(w, 'sl1');
    runP(w, 300);
    expect(err(w, 19)).toBeGreaterThan(0);
  });
  it('TV-20 presión sin romper y TV-66 rotura del cubreobjetos', () => {
    const w = base();
    waterMount(w, 'cel', 'sl1', 'cv1');
    const v0 = w.plant.sections[0].viableAreaFraction;
    cmdP(w, { type: 'pressCover', slideId: 'sl1', force01: 0.6 });
    expect(err(w, 20)).toBe(1);
    expect(w.plant.sections[0].viableAreaFraction).toBeLessThan(v0);
    cmdP(w, { type: 'pressCover', slideId: 'sl1', force01: 1 });
    expect(err(w, 66)).toBeGreaterThan(0);
    expect(w.mounts.sl1.broken).toBe(true);
  });
  it('TV-17 sección que cae pasa a residuos y no se reutiliza', () => {
    const w = base();
    cutP(w, 'cel');
    cmdP(w, { type: 'wipe', targetId: 'fc', toolId: 'lp' });
    cmdP(w, { type: 'pickSpecimen', toolId: 'fc', sourceId: 'board' });
    const waste = w.cell.biomass.wasteMg;
    dispatchPlant(w, { type: 'placeSpecimen', toolId: 'fc', targetId: 'bench', dxCm: 0, dyCm: 0 });
    expect(err(w, 17)).toBe(1);
    expect(w.cell.held.fc).toBeNull();
    expect(w.cell.biomass.wasteMg).toBeGreaterThan(waste);
  });
  it('TV-16 fuera del centro', () => {
    const w = base();
    slideToZone(w, 'sl1');
    cutP(w, 'cel');
    transfer(w, 'sl1', 2);
    expect(err(w, 16)).toBeGreaterThan(0);
  });
});

describe('B09: tinción', () => {
  it('TV-21 reactivo sobre lámina fija: rechazado y el activo no cambia', () => {
    const w = fixedOnStage('fxSE');
    const before = w.slides.fxSE.assetId;
    expect(dropP(w, 'flo', 'fxSE', 0.5, false).ok).toBe(false);
    expect(err(w, 21)).toBe(1);
    expect(w.slides.fxSE.assetId).toBe(before);
    expect(w.dispensers.flo.ml).toBe(5);
  });
  it('TV-22 falta un reactivo: no hay foto teñida', () => {
    const w = base();
    slideToZone(w, 'sl1', 'prep2');
    cutP(w, 'cel');
    transfer(w, 'sl1');
    dropP(w, 'flo', 'sl1');
    coverP(w, 'sl1', 'cv1');
    microscopeOnP(w);
    toStageP(w, 'sl1');
    focusP(w);
    cmdP(w, { type: 'observe', instrument: 'compound', open: true });
    const o = capture(w)!;
    expect(err(w, 22)).toBeGreaterThan(0);
    expect(o.assetId).not.toBe('celeryWiesner');
  });
  it('TV-23 exceso: escurre y desplaza la sección', () => {
    const w = base();
    slideToZone(w, 'sl1', 'prep2');
    cutP(w, 'cel');
    transfer(w, 'sl1');
    for (let i = 0; i < 6; i++) dropP(w, 'flo', 'sl1');
    expect(err(w, 23)).toBeGreaterThan(0);
  });
  it('TV-24 ácido sin muestra: consumido y a residuos, balance cero', () => {
    const w = base();
    slideToZone(w, 'sl1', 'prep2');
    const v0 = w.dispensers.hcl.ml;
    dropP(w, 'hcl', 'sl1');
    expect(err(w, 24)).toBe(1);
    expect(w.dispensers.hcl.ml).toBeLessThan(v0);
    expect(w.mounts.sl1?.cell?.stainMl.hcl ?? 0).toBe(0);
    for (const v of Object.values(conservedPlant(w))) expect(Math.abs(v)).toBeLessThan(1e-9);
  });
  it('TV-25 contacto fuera de la ventana: foto sin validar', () => {
    const w = base();
    wiesnerMount(w, 'cel', 'sl1', 'cv1', 5);
    microscopeOnP(w);
    toStageP(w, 'sl1');
    focusP(w);
    cmdP(w, { type: 'observe', instrument: 'compound', open: true });
    const o = capture(w)!;
    expect(err(w, 25)).toBeGreaterThan(0);
    expect(o.assetId).not.toBe('celeryWiesner');
    expect(o.issues).toContain('UNVERIFIED_PHOTO');
  });
  it('TV-28 cubreobjetos de golpe sobre la tinción', () => {
    const w = base();
    slideToZone(w, 'sl1', 'prep2');
    cutP(w, 'cel');
    transfer(w, 'sl1');
    dropP(w, 'flo', 'sl1');
    dropP(w, 'hcl', 'sl1');
    coverP(w, 'sl1', 'cv1', { speed: 6, angle: 8 });
    expect(err(w, 28)).toBe(1);
  });
  it('TV-29 lavado excesivo: la sección se desprende y la masa va a residuos', () => {
    const w = base();
    slideToZone(w, 'sl1', 'prep2');
    cutP(w, 'cel');
    transfer(w, 'sl1');
    const m0 = w.mounts.sl1.cell!.zones[0].massMg;
    cmdP(w, { type: 'rinseSection', slideId: 'sl1', volumeMl: 1.2 });
    expect(err(w, 29)).toBe(1);
    expect(w.mounts.sl1.cell!.zones[0].massMg).toBeLessThan(m0);
    for (const v of Object.values(conservedPlant(w))) expect(Math.abs(v)).toBeLessThan(1e-9);
  });
});

describe('B09: óptica', () => {
  it('TV-33 40X sin localizar a 4X y TV-35 macrométrico a 40X', () => {
    const w = onStage();
    delete w.evidence.located4x;
    toObjectiveP(w, 40);
    expect(err(w, 33)).toBeGreaterThan(0);
    dispatchPlant(w, { type: 'turnCoarse', deltaTurns: 0.5 });
    expect(err(w, 35)).toBeGreaterThan(0);
  });
  it('TV-37 diafragma casi cerrado de partida (S19) afecta la lectura', () => {
    const w = onStage([SC_B09.DIAPHRAGM]);
    expect(microscopeView(w).lightIssues.length).toBeGreaterThan(0);
    capture(w);
    expect(err(w, 37)).toBeGreaterThan(0);
  });
  it('TV-31 pinza cerrada, TV-32 lámina suelta, TV-41 cara invertida y TV-42 retirar sin margen', () => {
    const w = base();
    waterMount(w, 'cel', 'sl1', 'cv1');
    cmdP(w, { type: 'openClip', open: false });
    expect(dispatchPlant(w, { type: 'setPose', id: 'sl1', pose: { ...seat, rotationRad: 0 }, support: 'stage' }).ok).toBe(false);
    expect(err(w, 31)).toBe(1);
    cmdP(w, { type: 'openClip', open: true });
    placeP(w, 'sl2', 'hand');
    cmdP(w, { type: 'flipSlide', slideId: 'sl2' });
    placeP(w, 'sl2', 'stage', seat);
    expect(err(w, 41)).toBe(1);
    dispatchPlant(w, { type: 'setStageXY', xMm: 1, yMm: 0 });
    expect(err(w, 32)).toBeGreaterThan(0);
    const g = onStage();
    capture(g);
    toObjectiveP(g, 10);
    toObjectiveP(g, 40);
    cmdP(g, { type: 'openClip', open: true });
    expect(dispatchPlant(g, { type: 'setPose', id: 'sl1', pose: { x: 260, y: 14, z: 0, rotationRad: 0 }, support: 'bench' }).ok).toBe(false);
    expect(err(g, 42)).toBeGreaterThan(0);
  });
  it('TV-34 acercar sin mirar de lado', () => {
    const w = onStage();
    capture(w);
    toObjectiveP(w, 10);
    for (let i = 0; i < 200 && !err(w, 34); i++) dispatchPlant(w, { type: 'turnCoarse', deltaTurns: 0.1 });
    expect(err(w, 34)).toBeGreaterThan(0);
  });
  it('TV-36 sin ajustar el foco, TV-38 luz excesiva y TV-39 sin centrar', () => {
    const w = onStage();
    cmdP(w, { type: 'turnFine', deltaTurns: 3 });
    const o = capture(w);
    expect(o?.isObservationValid).toBe(false);
    expect(err(w, 36)).toBeGreaterThan(0);
    const l = onStage();
    cmdP(l, { type: 'setIllumination', device: 'microscope', value01: 1 });
    cmdP(l, { type: 'setDiaphragm', value01: 0.6 });
    capture(l);
    expect(err(l, 38)).toBeGreaterThan(0);
    const c = fixedOnStage('fxLM');
    capture(c);
    cmdP(c, { type: 'setStageXY', xMm: -2.6, yMm: 0 });
    toObjectiveP(c, 10);
    toObjectiveP(c, 40);
    expect(err(c, 39)).toBeGreaterThan(0);
  });
  it('TV-40 aumento sin recurso: incidencia sin descuento', () => {
    const w = onStage();
    dispatchPlant(w, { type: 'selectObjective', objectiveX: 100 });
    expect(w.evidence['asset:missingMagnification']).toBeGreaterThan(0);
    expect(w.cell.incidents).toContain('objective:100');
    expect(incidentCode('objective:100')).toBe('TV-ASSET-03');
  });
});

describe('B09: láminas fijas y marcas', () => {
  it('TV-45 estela fuera del centro, TV-46 cambium no distinguible', () => {
    const w = fixedOnStage('fxRE');
    const o = to10(w);
    const r = cmdP(w, { type: 'markRegion', observationId: o.id, structure: 'stele', u: 0.03, v: 0.03 });
    expect(err(w, 45)).toBe(1);
    expect(w.div.marks.find((m) => m.id === r.id)!.verdict).not.toBe('valid');
    cmdP(w, { type: 'markRegion', observationId: o.id, structure: 'cambium', u: 0.5, v: 0.5 });
    expect(err(w, 46)).toBe(1);
  });
  it('TV-60 y TV-61 no se validan lo que no se resuelve', () => {
    const w = fixedOnStage('fxSE');
    const o = to10(w);
    cmdP(w, { type: 'markRegion', observationId: o.id, structure: 'companionCell', u: 0.5, v: 0.5 });
    expect(err(w, 60)).toBe(1);
    cmdP(w, { type: 'markRegion', observationId: o.id, structure: 'casparian', u: 0.5, v: 0.5 });
    expect(err(w, 61)).toBe(1);
  });
  it('TV-43 lámina no asignada, TV-49 otra ranura y TV-50 fuera de la caja', () => {
    const w = fixedOnStage('fxO');
    const o = capture(w);
    expect(o?.issues).toContain('NOT_ASSIGNED');
    expect(err(w, 43)).toBeGreaterThan(0);
    const r = base();
    cmdP(r, { type: 'openSlideCase', open: true });
    placeP(r, 'fxRT', 'hand');
    placeP(r, 'fxRT', 'case:s2');
    expect(err(r, 49)).toBeGreaterThan(0);
    const f = base();
    cmdP(f, { type: 'openSlideCase', open: true });
    placeP(f, 'fxRT', 'bench', { x: 330, y: 12 });
    cmdP(f, { type: 'closeBench' });
    expect(err(f, 50)).toBeGreaterThan(0);
  });
  it('TV-51 aceite sin objetivo de inmersión', () => {
    const w = fixedOnStage('fxSE');
    dispatchPlant(w, { type: 'addImmersionOil', slideId: 'fxSE', drops: 1 });
    expect(err(w, 51)).toBe(1);
  });
  it('S18: la etiqueta discordante deja incidencia, nunca un error', () => {
    const w = fixedOnStage('fxRM', [SC_B09.MISLABELED]);
    capture(w);
    expect(w.cell.incidents.some((k) => k.startsWith('label:'))).toBe(true);
    expect(errKeysP(w)).toEqual([]);
  });
});

describe('B09: seguridad', () => {
  it('TV-63 bisturí sin EPP: el corte no empieza', () => {
    const w = worldB09();
    const r = dispatchPlant(w, { type: 'cutSection', sourceId: 'cel', plane: 'transverse', thicknessUm: 80, lengthCm: 0.8, region: 'petiole', pressure01: 0.3 });
    expect(r.ok).toBe(false);
    expect(err(w, 63)).toBe(1);
    expect(w.plant.sections).toHaveLength(0);
  });
  it('TV-64 ácido sin EPP o fuera de la zona: no se transfiere volumen', () => {
    const w = worldB09();
    expect(dispatchPlant(w, { type: 'squeezeDropper', dispenserId: 'hcl', targetId: 'sl1', force01: 0.5, dxCm: 0, dyCm: 0 }).ok).toBe(false);
    expect(err(w, 64)).toBe(1);
    const w2 = base();
    slideToZone(w2, 'sl1');
    expect(dropP(w2, 'hcl', 'sl1', 0.5, false).ok).toBe(false);
    expect(err(w2, 64)).toBe(1);
    expect(w2.dispensers.hcl.ml).toBe(5);
  });
  it('TV-65 hoja hacia la mano: se detiene y no hay sección', () => {
    const w = base();
    cmdP(w, { type: 'holdSource', sourceId: 'cel', hold: true });
    const r = dispatchPlant(w, { type: 'cutSection', sourceId: 'cel', plane: 'transverse', thicknessUm: 80, lengthCm: 0.8, region: 'petiole', pressure01: 0.3, handInPath: true });
    expect(r.ok).toBe(false);
    expect(err(w, 65)).toBe(1);
    expect(w.plant.sections).toHaveLength(0);
  });
  it('TV-69 ácido derramado bloquea el cierre hasta limpiarlo', () => {
    const w = base();
    dropP(w, 'hcl', 'prep2', 0.5, false);
    w.cell.benchStainMl.hcl = 0.05;
    cmdP(w, { type: 'closeBench' });
    expect(err(w, 69)).toBe(1);
    expect(w.evidence.benchRestored).toBeUndefined();
  });
  it('TV-67 vidrio roto en residuo común y TV-68 pañuelo sobre la lente', () => {
    const w = base();
    waterMount(w, 'cel', 'sl1', 'cv1');
    cmdP(w, { type: 'pressCover', slideId: 'sl1', force01: 1 });
    dispatchPlant(w, { type: 'dispose', objectId: 'sl1', containerId: 'trashBin' });
    expect(err(w, 67)).toBeGreaterThan(0);
    const l = base();
    expect(dispatchPlant(l, { type: 'wipe', targetId: 'mic:lens', toolId: 'tw' }).ok).toBe(false);
    expect(err(l, 68)).toBeGreaterThan(0);
  });
  it('TV-06 sin luz incidente y TV-07 zoom sin centrar en el estereoscopio', () => {
    const w = base();
    cmdP(w, { type: 'setPower', device: 'stereo', on: true });
    cmdP(w, { type: 'setIllumination', device: 'stereo-incident', value01: 0 });
    cmdP(w, { type: 'setIllumination', device: 'stereo-transmitted', value01: 0.6 });
    placeP(w, 'leafNet', 'stereoBase', STEREO_BASE);
    cmdP(w, { type: 'observe', instrument: 'stereo', open: true });
    runP(w, 1.6);
    dispatchPlant(w, { type: 'captureObservation', instrument: 'stereo' });
    expect(err(w, 6)).toBeGreaterThan(0);
    const z = base();
    cmdP(z, { type: 'setPower', device: 'stereo', on: true });
    cmdP(z, { type: 'pickSpecimen', toolId: 'fc', sourceId: 'leafNet', pressure01: 0.3 });
    cmdP(z, { type: 'placeSpecimen', toolId: 'fc', targetId: 'stereoBase', dxCm: 1.2, dyCm: 0 });
    cmdP(z, { type: 'setStereoZoom', zoomX: 0.8 });
    cmdP(z, { type: 'setStereoZoom', zoomX: 2.5 });
    expect(err(z, 7)).toBeGreaterThan(0);
  });
  it('TV-70 por los oculares: bloqueado; por brazo y base, permitido', () => {
    const w = base();
    expect(dispatchPlant(w, { type: 'moveMicroscope', grip: 'eyepiece' }).ok).toBe(false);
    expect(err(w, 70)).toBe(1);
    expect(w.safety.block?.code).toBe('TRANSPORT');
    cmdP(w, { type: 'moveMicroscope', grip: 'armBase' });
    expect(w.safety.block).toBeNull();
  });
  it('TV-71 cerrar sin 4X y TV-72 lámina en la platina', () => {
    const w = onStage();
    toObjectiveP(w, 10);
    cmdP(w, { type: 'closeBench' });
    expect(err(w, 71)).toBeGreaterThan(0);
    expect(err(w, 72)).toBeGreaterThan(0);
    expect(w.evidence.safeParked).toBeUndefined();
  });
});

describe('B09: libreta', () => {
  it('cada error de libreta sale de lo escrito frente a la captura propia', () => {
    const { w, nb, res } = idealAttemptB09();
    expect(notebookIssuesB09(w, nb)).toEqual([]);
    const issue = (fn: (n: typeof nb) => void) => {
      const n = structuredClone(nb);
      fn(n);
      return notebookIssuesB09(w, n);
    };
    expect(issue((n) => { n.external[0].rootPattern = 'fibrous'; })).toContain('nb:TV-01');
    expect(issue((n) => { n.external[0].venation = 'parallel'; })).toContain('nb:TV-05');
    expect(issue((n) => { n.external[0].taxon = ''; })).toContain('nb:TV-08');
    expect(issue((n) => { n.stain.redMeans = 'xylemOnly'; })).toContain('nb:TV-26');
    expect(issue((n) => { n.stain.collenchymaLignified = 'yes'; })).toContain('nb:TV-27');
    expect(issue((n) => { n.stain.treatmentOfCapture = 'water'; })).toContain('nb:TV-30');
    expect(issue((n) => { n.roots[0].basis = 'labelOnly'; })).toContain('nb:TV-44');
    expect(issue((n) => { n.roots[0].plane = 'longitudinal'; })).toContain('nb:TV-47');
    expect(issue((n) => { n.leaves[0].orientationChecked = false; })).toContain('nb:TV-48');
    expect(issue((n) => { n.stems[0].observationId = res.slides.fxRE[10]; })).toContain('nb:TV-52');
    expect(issue((n) => { n.measures[0].usedFieldAsCell = true; })).toContain('nb:TV-54');
    expect(issue((n) => { n.measures[0].unit = 'px'; })).toContain('nb:TV-55');
    expect(issue((n) => { n.measures[0].totalMag = '40'; })).toContain('nb:TV-56');
    expect(issue((n) => { n.stems[0].xylemSide = 'outer'; })).toContain('nb:TV-57');
    expect(issue((n) => { n.wood.ageYears = '4'; })).toContain('nb:TV-58');
    expect(issue((n) => { n.claims.allMonocotsNoPetiole = true; })).toContain('nb:TV-59');
    expect(issue((n) => { n.claims.allParenchymaStarch = true; })).toContain('nb:TV-62');
    expect(emptyB09Notebook().attemptId).toBe('');
  });
});

describe('B09: catálogo', () => {
  it('72 errores y cinco incidencias; los 26 escenarios arrancan', () => {
    expect(SIMULATED_ERRORS_B09.filter((e) => e.code.startsWith('TV-') && !e.code.includes('ASSET'))).toHaveLength(72);
    expect(SIMULATED_ERRORS_B09.filter((e) => e.code.includes('ASSET'))).toHaveLength(5);
    for (const s of Object.values(SC_B09)) expect(worldB09({ scenarios: [s] }).scenarios).toContain(s);
  });
});

afterAll(() => {
  const missing = SIMULATED_ERRORS_B09.filter((e) => e.kind === 'err' && !seen.has(e.code)).map((e) => e.code);
  expect(missing, 'errores sin fixture que los dispare').toEqual([]);
});
