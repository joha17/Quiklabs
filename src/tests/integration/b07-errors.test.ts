/**
 * B07 — catálogo E01–E64 + I01 (§9), con códigos propios MIC-NN: cada uno se provoca con su hecho y deja consecuencia
 * (rechazo, imagen no acreditada o ítem de la rúbrica tachado). `nb` se detecta en la libreta; `err` en el mundo.
 */
import { describe, expect, it } from 'vitest';
import { SIMULATED_ERRORS_B07 } from '../../practices/practice-b07/error-scenarios';
import { evaluateB07, notebookIssuesB07 } from '../../practices/practice-b07/rubric';
import { sanitizeOnResumeB07 } from '../../practices/practice-b07/resume';
import { emptyB07Notebook, type B07Notebook } from '../../practices/practice-b07/notebook';
import { SC_B07, coloniesOf, dispatchMicro } from '../../simulation/micro-world/world';
import { STAIN_RACK, SMEAR_PAD } from '../../simulation/micro-world/geometry';
import type { MicroWorld } from '../../simulation/micro-world/types';
import { GLASS_BIN } from '../../simulation/optical-world/geometry';
import { TRASH_BIN } from '../../simulation/cell-world/geometry';
import { closeB07, cmdM, CROSSED, fillNotebookB07, focusOn, gramB07, idealRouteB07, mountM, observeM, placeM, ppeB07, runM, smearB07, toViewer, worldB07 } from '../helpersB07';

const lab = (scenarios: string[] = []) => {
  const w = worldB07({ scenarios: scenarios as never });
  ppeB07(w);
  return w;
};
const has = (w: MicroWorld, n: number) => (w.evidence[`err:MIC-${String(n).padStart(2, '0')}`] ?? 0) > 0;
const failedItem = (w: MicroWorld, nb: B07Notebook, key: string) => evaluateB07(w, nb).components.flatMap((c) => c.items).find((i) => i.key === key)?.ok === false;

/** Ruta ideal + una edición de libreta: el error aparece y descuenta. */
function nbCase(edit: (nb: B07Notebook, out: ReturnType<typeof idealRouteB07>) => void) {
  const out = idealRouteB07(worldB07());
  const nb = fillNotebookB07(out);
  edit(nb, out);
  return { w: out.w, nb, issues: notebookIssuesB07(out.w, nb) };
}

describe('catálogo', () => {
  it('declara los 64 errores y la incidencia I01, sin códigos repetidos', () => {
    expect(SIMULATED_ERRORS_B07).toHaveLength(65);
    expect(new Set(SIMULATED_ERRORS_B07.map((e) => e.code)).size).toBe(65);
  });
});

describe('errores de la libreta (nb)', () => {
  const CASES: Array<[number, string, (nb: B07Notebook, o: ReturnType<typeof idealRouteB07>) => void]> = [
    [1, 'b07.classification', (n) => { n.media[2].consistency = 'solid'; }],
    [2, 'b07.classification', (n) => { n.media[1].func = 'general'; }],
    [3, 'b07.function', (n) => { n.media[1].selectiveMeans = 'distinguishes'; }],
    [4, 'b07.claims', (n) => { n.media[0].sterileClaim = true; }],
    [7, 'b07.claims', (n) => { n.media[0].compositionSource = 'invented'; }],
    [8, 'b07.function', (n) => { n.media[2].coloniesExpected = true; }],
    [11, 'b07.distribution', (n) => { n.techniques[1].trialId = null; }],
    [12, 'b07.distribution', (n) => { n.techniques[0].replicates = true; }],
    [14, 'b07.colonyRecord', (n) => { n.colonies[0].surface = 'entire'; }],
    [15, 'b07.colonyRecord', (n) => { n.colonies[0].pigment = 'dark'; }],
    [16, 'b07.cfu', (n) => { n.colonies[0].identity = 'species'; }],
    [18, 'b07.diameter', (n) => { n.colonies[0].unit = 'px'; }],
    [22, 'b07.diameter', (n) => { n.colonies[0].diameter = `${n.colonies[0].diameter}12345`; }],
    [23, 'b07.diameter', (n) => { n.colonies[0].colonyId = ''; }],
    [24, 'b07.cfu', (n) => { n.colonies[0].countUnit = 'bacteria'; }],
    [49, 'b07.limits', (n) => { n.gram[0].species = 'Staphylococcus aureus'; }],
    [50, 'b07.limits', (n) => { n.gram[0].negativeStainSame = true; }],
    [51, 'b07.limits', (n) => { n.gram[0].shape = 'rods'; }],
    [52, 'b07.limits', (n) => { n.gram[0].membraneVisible = true; }],
    [55, 'b07.reading', (n) => { n.gram[0].controlNegObs = null; }],
  ];
  it.each(CASES)('MIC-%i tacha %s', (x, key, edit) => {
    const { w, nb, issues } = nbCase(edit);
    expect(issues).toContain(`nb:MIC-${String(x).padStart(2, '0')}`);
    expect(failedItem(w, nb, key)).toBe(true);
  });

  it('MIC-20: borde oculto sin declarar', () => {
    const { w, nb, issues } = nbCase((n, o) => {
      o.w.micro.measures[0].hiddenEdge = true;
      n.colonies[0].borderDeclared = false;
    });
    expect(issues).toContain('nb:MIC-20');
    expect(failedItem(w, nb, 'b07.diameter')).toBe(true);
  });

  it('MIC-40 y MIC-54: una lectura definitiva de un frotis mixto o ambiguo', () => {
    const mixed = nbCase((n, o) => { o.w.observations[n.gram[0].observationId!].assetId = 'gramMixed'; });
    expect(mixed.issues).toContain('nb:MIC-40');
    const amb = nbCase((n, o) => { o.w.observations[n.gram[0].observationId!].assetId = 'gramThick'; });
    expect(amb.issues).toContain('nb:MIC-54');
    expect(failedItem(amb.w, amb.nb, 'b07.reading')).toBe(true);
  });
});

describe('errores del mundo: medios y placas', () => {
  it('MIC-05: clasificar sin haber leído la ficha', () => {
    const w = lab();
    cmdM(w, { type: 'classifyMedia', mediaId: 'mNA', consistency: 'solid', func: 'general' });
    expect(has(w, 5)).toBe(true);
    expect(failedItem(w, emptyB07Notebook(), 'b07.traceability')).toBe(true);
  });
  it('MIC-06: rótulo de otro medio', () => {
    const w = lab();
    cmdM(w, { type: 'labelMedia', mediaId: 'mNA', label: 'mEMB' });
    expect(has(w, 6)).toBe(true);
  });
  it('MIC-09: placa de otro grupo', () => {
    const w = lab();
    cmdM(w, { type: 'selectPlate', plateId: 'plX' });
    expect(has(w, 9)).toBe(true);
    expect(failedItem(w, emptyB07Notebook(), 'b07.traceability')).toBe(true);
  });
  it('MIC-10: el mismo trazado con cruces solapa más y se señala', () => {
    const w = lab();
    const r = cmdM(w, { type: 'strokePlate', technique: 'fourZone', strokes: [...CROSSED, ...CROSSED, ...CROSSED] });
    expect(r.value!).toBeGreaterThan(w.params.micro!.streakOverlapThreshold);
    expect(has(w, 10)).toBe(true);
  });
  it('MIC-13: registrar colonias sin mirar el control del lote', () => {
    const w = lab();
    toViewer(w, 'plA');
    cmdM(w, { type: 'recordColony', plateId: 'plA', colonyId: coloniesOf(w, 'plA')[0].id });
    expect(has(w, 13)).toBe(true);
  });
});

describe('errores del mundo: medición', () => {
  const ready = () => {
    const w = lab();
    toViewer(w, 'plA');
    return { w, cols: coloniesOf(w, 'plA') };
  };
  it('MIC-17: escala supuesta se rechaza', () => {
    const { w, cols } = ready();
    const c = cols[0];
    expect(dispatchMicro(w, { type: 'measureColony', plateId: 'plA', colonyId: c.id, ax: c.x - 10, ay: c.y, bx: c.x + 10, by: c.y, scale: 'assumed' }).ok).toBe(false);
    expect(has(w, 17)).toBe(true);
  });
  it('MIC-19: extremos en dos colonias invalidan la medida', () => {
    const { w, cols } = ready();
    cmdM(w, { type: 'measureColony', plateId: 'plA', colonyId: null, ax: cols[0].x, ay: cols[0].y, bx: cols[1].x, by: cols[1].y, scale: 'calibration' });
    expect(has(w, 19)).toBe(true);
    expect(w.micro.measures[0].valid).toBe(false);
  });
  it('MIC-21: recorte sin recalibrar; al recalibrar se corrige', () => {
    const { w, cols } = ready();
    const c = cols[0];
    cmdM(w, { type: 'cropViewer', zoom: 2 });
    const m = { type: 'measureColony' as const, plateId: 'plA', colonyId: c.id, ax: c.x, ay: c.y, bx: c.x + 20, by: c.y, scale: 'calibration' as const };
    cmdM(w, m);
    expect(has(w, 21)).toBe(true);
    expect(w.micro.measures[0].valid).toBe(false);
    cmdM(w, { type: 'recalibrateViewer' });
    expect(w.micro.viewer.calibratedZoom).toBe(2);
  });
  it('MIC-56: importar una medición ajena', () => {
    const w = lab();
    expect(dispatchMicro(w, { type: 'importMeasurement', measurementId: 'dm999' }).ok).toBe(false);
    expect(has(w, 56)).toBe(true);
  });
  it('I01: sin escala (S20) no penaliza, solo deja la incidencia', () => {
    const w = lab([SC_B07.NO_SCALE]);
    toViewer(w, 'plA');
    const c = coloniesOf(w, 'plA')[0];
    expect(dispatchMicro(w, { type: 'measureColony', plateId: 'plA', colonyId: c.id, ax: c.x, ay: c.y, bx: c.x + 9, by: c.y, scale: 'calibration' }).code).toBe('UNCALIBRATED_SCALE');
    expect(w.cell.incidents.length).toBeGreaterThan(0);
    expect(Object.keys(w.evidence).filter((k) => k.startsWith('err:'))).toEqual([]);
  });
});

describe('errores del mundo: frotis', () => {
  const pad = (w: MicroWorld) => {
    toViewer(w, 'plC');
    placeM(w, 'plC', 'plateTray');
    toViewer(w, 'plA');
    cmdM(w, { type: 'pickColony', plateId: 'plA', colonyId: coloniesOf(w, 'plA')[0].id });
    placeM(w, 'sl1', 'smearPad', SMEAR_PAD);
  };
  it('MIC-25 y MIC-26: cobertura fuera de rango y su imagen', () => {
    const a = lab();
    pad(a);
    cmdM(a, { type: 'prepareVirtualSmear', slideId: 'sl1', declaredPlateId: 'plA', coverage01: 0.9 });
    expect(has(a, 25)).toBe(true);
    expect(a.slides.sl1.assetId).toBe('gramThick');
    const b = lab();
    pad(b);
    cmdM(b, { type: 'prepareVirtualSmear', slideId: 'sl1', declaredPlateId: 'plA', coverage01: 0.05 });
    expect(has(b, 26)).toBe(true);
    expect(b.slides.sl1.assetId).toBe('gramSparse');
  });
  it('MIC-27: frotis declarado de otra placa', () => {
    const w = lab();
    pad(w);
    cmdM(w, { type: 'prepareVirtualSmear', slideId: 'sl1', declaredPlateId: 'plB', coverage01: 0.35 });
    expect(has(w, 27)).toBe(true);
  });
  it('MIC-28: segunda colonia sobre el mismo frotis deja una mezcla', () => {
    const w = lab();
    pad(w);
    cmdM(w, { type: 'prepareVirtualSmear', slideId: 'sl1', declaredPlateId: 'plA', coverage01: 0.35 });
    cmdM(w, { type: 'pickColony', plateId: 'plA', colonyId: coloniesOf(w, 'plA')[1].id });
    cmdM(w, { type: 'prepareVirtualSmear', slideId: 'sl1', declaredPlateId: 'plA', coverage01: 0.35 });
    expect(has(w, 28)).toBe(true);
    expect(w.micro.smears.sl1.mixed).toBe(true);
  });
  it('MIC-29: el portaobjetos roto no se usa', () => {
    const w = lab();
    expect(dispatchMicro(w, { type: 'setPose', id: 'sl4', pose: { ...SMEAR_PAD, rotationRad: 0 }, support: 'smearPad' }).ok).toBe(false);
    expect(has(w, 29)).toBe(true);
  });
  it('MIC-30: teñir fuera de la rejilla', () => {
    const w = lab();
    pad(w);
    cmdM(w, { type: 'prepareVirtualSmear', slideId: 'sl1', declaredPlateId: 'plA', coverage01: 0.35 });
    expect(dispatchMicro(w, { type: 'applyStainPhase', slideId: 'sl1', phase: 'primary' }).ok).toBe(false);
    expect(has(w, 30)).toBe(true);
  });
  it('MIC-31: una lámina de control no se tiñe', () => {
    const w = lab();
    expect(dispatchMicro(w, { type: 'applyStainPhase', slideId: 'fxP', phase: 'primary' }).ok).toBe(false);
    expect(has(w, 31)).toBe(true);
  });
  it('MIC-32: declarar seco antes de tiempo', () => {
    const w = lab();
    pad(w);
    cmdM(w, { type: 'prepareVirtualSmear', slideId: 'sl1', declaredPlateId: 'plA', coverage01: 0.35 });
    cmdM(w, { type: 'markSmearDry', slideId: 'sl1' });
    expect(has(w, 32)).toBe(true);
  });
});

describe('errores del mundo: tinción', () => {
  const rack = () => {
    const w = lab();
    toViewer(w, 'plC');
    placeM(w, 'plC', 'plateTray');
    smearB07(w);
    return w;
  };
  const phase = (w: MicroWorld, p: 'primary' | 'mordant' | 'decolorizer' | 'counterstain', u?: number) => cmdM(w, { type: 'applyStainPhase', slideId: 'sl1', phase: p, index: u });
  const rinse = (w: MicroWorld) => cmdM(w, { type: 'rinseVirtualSlide', slideId: 'sl1' });
  it('MIC-33: decolorar sin primario', () => {
    const w = rack();
    phase(w, 'decolorizer', 1);
    expect(has(w, 33)).toBe(true);
  });
  it('MIC-34: decolorar sin mordiente deja una imagen tenue', () => {
    const w = rack();
    phase(w, 'primary'); rinse(w);
    phase(w, 'decolorizer', 1); rinse(w);
    phase(w, 'counterstain'); rinse(w);
    expect(has(w, 34)).toBe(true);
    expect(w.slides.sl1.assetId).toBe('gramNoMordant');
  });
  it('MIC-35: contraste sin decolorar', () => {
    const w = rack();
    phase(w, 'primary'); rinse(w);
    phase(w, 'mordant'); rinse(w);
    phase(w, 'counterstain');
    expect(has(w, 35)).toBe(true);
  });
  it('MIC-36: decoloración excesiva vuelve rosado al positivo', () => {
    const w = rack();
    gramB07(w, 'sl1', 2);
    expect(has(w, 36)).toBe(true);
    expect(w.slides.sl1.assetId).toBe('gramPosP');
  });
  it('MIC-37: capturar sin contraste', () => {
    const w = rack();
    phase(w, 'primary'); rinse(w);
    phase(w, 'mordant'); rinse(w);
    phase(w, 'decolorizer', 1); rinse(w);
    observeM(w, 'sl1', []);
    expect(has(w, 37)).toBe(true);
    expect(w.slides.sl1.assetId).toBe('gramNoCounter');
  });
  it('MIC-38: mordiente antes del primario invalida el orden', () => {
    const w = rack();
    phase(w, 'mordant');
    expect(has(w, 38)).toBe(true);
    expect(w.slides.sl1.assetId).toBe('gramInvalid');
  });
  it('MIC-39: fase siguiente sin lavar', () => {
    const w = rack();
    phase(w, 'primary');
    phase(w, 'mordant');
    expect(has(w, 39)).toBe(true);
    expect(w.micro.smears.sl1.washMissed).toBe(true);
  });
});

describe('errores del mundo: microscopio', () => {
  const stageReady = (scenarios: string[] = []) => {
    const w = lab(scenarios);
    mountM(w, 'fxP');
    cmdM(w, { type: 'observe', instrument: 'compound', open: true });
    focusOn(w);
    return w;
  };
  it('MIC-41: lámina con la pinza cerrada', () => {
    const w = lab();
    cmdM(w, { type: 'openSlideCase', open: true });
    cmdM(w, { type: 'openClip', open: false });
    expect(dispatchMicro(w, { type: 'setPose', id: 'fxP', pose: { x: 0, y: 0, z: 0, rotationRad: 0 }, support: 'stage' }).ok).toBe(false);
    expect(has(w, 41)).toBe(true);
  });
  it('MIC-42: alto aumento antes de localizar', () => {
    const w = lab();
    mountM(w, 'fxP');
    cmdM(w, { type: 'selectObjective', objectiveX: 40 }, false);
    expect(has(w, 42)).toBe(true);
  });
  it('MIC-43: bajar el macro con el 100X', () => {
    const w = stageReady([SC_B07.IMMERSION]);
    cmdM(w, { type: 'selectObjective', objectiveX: 100 }, false);
    cmdM(w, { type: 'turnCoarse', deltaTurns: 0.1 }, false);
    expect(has(w, 43)).toBe(true);
  });
  it('MIC-44: 100X sin aceite', () => {
    const w = stageReady([SC_B07.IMMERSION]);
    cmdM(w, { type: 'selectObjective', objectiveX: 100 }, false);
    focusOn(w);
    runM(w, w.params.observationHoldS + 0.3);
    const id = cmdM(w, { type: 'captureObservation', instrument: 'compound' }, false).id;
    expect(has(w, 44)).toBe(true);
    if (id) expect(w.observations[id].isObservationValid).toBe(false);
  });
  it('MIC-45: aceite con el 40X seco en el camino', () => {
    const w = stageReady([SC_B07.IMMERSION]);
    cmdM(w, { type: 'selectObjective', objectiveX: 40 }, false);
    cmdM(w, { type: 'addImmersionOil', slideId: 'fxP', drops: 1 }, false);
    expect(has(w, 45)).toBe(true);
  });
  it('MIC-46: captura fuera de la muestra (S17 descentrada)', () => {
    const w = stageReady();
    cmdM(w, { type: 'setStageXY', xMm: 30, yMm: 30 }, false);
    runM(w, w.params.observationHoldS + 0.3);
    cmdM(w, { type: 'captureObservation', instrument: 'compound' }, false);
    expect(has(w, 46)).toBe(true);
  });
  it('MIC-47: iluminación excesiva lava el campo (S16)', () => {
    const w = stageReady([SC_B07.BRIGHT]);
    cmdM(w, { type: 'setIllumination', device: 'microscope', value01: 1 });
    cmdM(w, { type: 'setDiaphragm', value01: 1 });
    runM(w, w.params.observationHoldS + 0.3);
    cmdM(w, { type: 'captureObservation', instrument: 'compound' }, false);
    expect(has(w, 47)).toBe(true);
  });
  it('MIC-48: otra lámina con la lente del 100X sucia', () => {
    const w = stageReady([SC_B07.IMMERSION]);
    cmdM(w, { type: 'addImmersionOil', slideId: 'fxP', drops: 1 });
    cmdM(w, { type: 'selectObjective', objectiveX: 100 }, false);
    expect(w.micro.immersionDirty).toBe(true);
    cmdM(w, { type: 'closeBench' }, false);
    expect(has(w, 48)).toBe(true);
    cmdM(w, { type: 'wipe', targetId: 'mic:lens', toolId: 'lp' }, false);
    expect(w.micro.immersionDirty).toBe(false);
  });
});

describe('errores del mundo: interpretación y seguridad', () => {
  it('MIC-53: una foto de control citada como incógnita', () => {
    const w = lab();
    const [id] = observeM(w, 'fxP', []);
    cmdM(w, { type: 'recordHypothesis', sampleCode: 'U1', observationId: id, interpretation: 'gram-positive' });
    expect(has(w, 53)).toBe(true);
  });
  it('MIC-57: sin EPP no hay gestos', () => {
    const w = worldB07();
    expect(dispatchMicro(w, { type: 'inspectMedia', mediaId: 'mNA' }).ok).toBe(false);
    expect(has(w, 57)).toBe(true);
  });
  it('MIC-58: la placa restringida se rechaza y bloquea', () => {
    const w = lab();
    expect(dispatchMicro(w, { type: 'openPlate', plateId: 'plR' }).ok).toBe(false);
    expect(has(w, 58)).toBe(true);
    expect(w.safety.block?.code).toBe('RESTRICTED_PLATE');
  });
  it('MIC-59: la llama no existe', () => {
    const w = lab();
    expect(dispatchMicro(w, { type: 'attemptFlame' }).ok).toBe(false);
    expect(has(w, 59)).toBe(true);
  });
  it('MIC-60: lámina con aceite de vuelta a la caja', () => {
    const w = lab([SC_B07.IMMERSION]);
    mountM(w, 'fxP');
    cmdM(w, { type: 'addImmersionOil', slideId: 'fxP', drops: 1 });
    cmdM(w, { type: 'openClip', open: true });
    const slot = w.slideCase.home.fxP;
    dispatchMicro(w, { type: 'setPose', id: 'fxP', pose: { x: 0, y: 0, z: 0, rotationRad: 0 }, support: `case:${slot}` });
    expect(has(w, 60)).toBe(true);
  });
  it('MIC-61: vidrio roto a la basura común; el contenedor rígido sí', () => {
    const w = lab();
    expect(dispatchMicro(w, { type: 'setPose', id: 'sl4', pose: { x: TRASH_BIN.x, y: TRASH_BIN.y, z: 0, rotationRad: 0 }, support: 'trashBin' }).ok).toBe(false);
    expect(has(w, 61)).toBe(true);
    expect(dispatchMicro(w, { type: 'dispose', objectId: 'sl4', containerId: 'glassBin' }).ok).toBe(true);
    expect(GLASS_BIN).toBeTruthy();
  });
  it('MIC-62: reanudar con un objeto en la mano lo libera y lo registra', () => {
    const w = lab();
    w.objects.plA.support = 'hand';
    sanitizeOnResumeB07(w);
    expect(has(w, 62)).toBe(true);
    expect(w.objects.plA.support).toBe('plateTray');
  });
  it('MIC-63: un recurso de otro curso se rechaza', () => {
    const w = lab();
    expect(dispatchMicro(w, { type: 'requestAsset', assetId: 'gramPosVT2' }).ok).toBe(false);
    expect(has(w, 63)).toBe(true);
    expect(dispatchMicro(lab([SC_B07.TEACHER]), { type: 'requestAsset', assetId: 'gramPosVT2' }).ok).toBe(true);
  });
  it('MIC-64: cerrar con una placa fuera de la bandeja', () => {
    const w = lab();
    toViewer(w, 'plA');
    cmdM(w, { type: 'closeBench' }, false);
    expect(has(w, 64)).toBe(true);
    expect(w.evidence.benchRestored).toBeUndefined();
    closeB07(w);
  });
  it('el mapa no filtra códigos de otros catálogos', () => {
    const out = idealRouteB07(worldB07());
    expect(Object.keys(out.w.evidence).filter((k) => k.startsWith('err:') && !k.startsWith('err:MIC-'))).toEqual([]);
    expect(STAIN_RACK).toBeTruthy();
  });
});
