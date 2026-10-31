/**
 * Los 76 errores de §9, cada uno con su disparador contra la ruta correcta, más las incidencias que nunca descuentan.
 * Plantilla: (a) mismo montaje, (b) cambio físico o de validez, (c) evidencia, (e) corregir no borra el historial.
 */
import { describe, expect, it } from 'vitest';
import { bandsOf, conservedPhoto, runPhotoFor } from '../../simulation/photo-world/world';
import type { PhotoWorld } from '../../simulation/photo-world/types';
import { GAS_TUBES } from '../../simulation/photo-world/geometry';
import { evaluateB08, notebookIssuesB08 } from '../../practices/practice-b08/rubric';
import { NB_CODES_B08, SIMULATED_ERRORS_B08 } from '../../practices/practice-b08/error-scenarios';
import { emptyB08Notebook, type B08Notebook } from '../../practices/practice-b08/notebook';
import { chromB08, closeB08, cmdP, extractionB08, fillNotebookB08, hypothesisB08, idealRouteB08, placeP, ppeB08, runGasB08, setupBtbB08, setupGasB08, toHood, tubeB08, worldB08 } from '../helpersB08';

const P = (x: number, y: number, z = 0) => ({ x, y, z, rotationRad: 0 });
const code = (n: number) => `FOT-${String(n).padStart(2, '0')}`;
const has = (w: PhotoWorld, n: number) => (w.evidence[`err:${code(n)}`] ?? 0) > 0;
const fresh = () => {
  const w = worldB08();
  ppeB08(w);
  hypothesisB08(w);
  return w;
};
const start = (w: PhotoWorld) => cmdP(w, { type: 'startGasRun' });
const gasReady = () => {
  const w = fresh();
  setupGasB08(w);
  return w;
};
const btbReady = () => {
  const w = fresh();
  setupBtbB08(w);
  return w;
};
const hoodReady = () => {
  const w = fresh();
  for (const id of ['bA', 'bW', 'bH', 'bE']) toHood(w, id);
  placeP(w, 'leaf', 'balance', { x: 454, y: 20, z: 5 });
  cmdP(w, { type: 'weighLeaf' });
  return w;
};
const paperReady = () => {
  const w = fresh();
  extractionB08(w);
  cmdP(w, { type: 'cutPaper' });
  return w;
};
const spotted = () => {
  const w = paperReady();
  cmdP(w, { type: 'markOrigin', tool: 'pencil', mm: 20 });
  cmdP(w, { type: 'applySpot', size: 'small' });
  return w;
};
const eluted = () => {
  const w = spotted();
  cmdP(w, { type: 'openSolvent', bottleId: 'bE' });
  cmdP(w, { type: 'pourEluent', bottleId: 'bE', levelMm: 10 });
  cmdP(w, { type: 'closeSolvent', bottleId: 'bE' });
  return w;
};
const developed = (s = 584) => {
  const w = eluted();
  cmdP(w, { type: 'hangPaper', tiltDeg: 0, clip: true });
  cmdP(w, { type: 'closeChamber', closed: true });
  runPhotoFor(w, s);
  return w;
};

describe('B08 · errores del mundo', () => {
  const cases: Array<[number, () => PhotoWorld]> = [
    [1, () => { const w = fresh(); tubeB08(w, 'gL', 'el1', 'aqA', 'light'); tubeB08(w, 'gD', 'el3', 'aqB', 'dark'); placeP(w, 'coverG', 'cover:gD'); start(w); return w; }],
    [2, () => { const w = fresh(); tubeB08(w, 'gL', 'el1', 'aqA', 'light'); tubeB08(w, 'gD', 'el4', 'aqB', 'dark'); placeP(w, 'coverG', 'cover:gD'); start(w); return w; }],
    [3, () => { const w = fresh(); tubeB08(w, 'gL', 'el1', 'aqA', 'light'); placeP(w, 'el2', 'tube:gD'); cmdP(w, { type: 'fillTube', tubeId: 'gD', mL: 20, tiltDeg: 10 }); cmdP(w, { type: 'setStopper', tubeId: 'gD', seat01: 1 }); cmdP(w, { type: 'connectCapillary', tubeId: 'gD', contact01: 1 }); start(w); return w; }],
    [4, () => { const w = gasReady(); cmdP(w, { type: 'labelTube', tubeId: 'gD', label: 'light' }); start(w); return w; }],
    [5, () => { const w = gasReady(); cmdP(w, { type: 'recordControls', dicKnown: false, tempC: 25, distanceCm: 20, powerIndex: 100, lightUnit: 'au' }); start(w); return w; }],
    [6, () => { const w = gasReady(); placeP(w, 'gD', 'gasRack', GAS_TUBES.gD); start(w); return w; }],
    [7, () => { const w = gasReady(); cmdP(w, { type: 'setDarkCover', targetId: 'gD', coverage: 0.7 }); start(w); return w; }],
    [8, () => { const w = gasReady(); cmdP(w, { type: 'recordControls', dicKnown: true, tempC: 25, distanceCm: 40, powerIndex: 100, lightUnit: 'au' }); start(w); return w; }],
    [9, () => { const w = gasReady(); start(w); cmdP(w, { type: 'stirTube', tubeId: 'gL' }); runPhotoFor(w, 6); return w; }],
    [10, () => { const w = gasReady(); cmdP(w, { type: 'recordControls', dicKnown: true, tempC: 25, distanceCm: 20, powerIndex: 100, lightUnit: 'par' }); start(w); return w; }],
    [11, () => { const w = fresh(); cmdP(w, { type: 'setStopper', tubeId: 'gL', seat01: 0.5 }); return w; }],
    [12, () => { const w = fresh(); cmdP(w, { type: 'setStopper', tubeId: 'gL', seat01: 1 }); cmdP(w, { type: 'connectCapillary', tubeId: 'gL', contact01: 0.4 }); return w; }],
    [13, () => { const w = fresh(); cmdP(w, { type: 'fillTube', tubeId: 'gL', mL: 30, tiltDeg: 80 }); cmdP(w, { type: 'setStopper', tubeId: 'gL', seat01: 1 }); cmdP(w, { type: 'connectCapillary', tubeId: 'gL', contact01: 1 }); cmdP(w, { type: 'markBaseline', tubeId: 'gL', eyeOffsetCm: 0 }); return w; }],
    [14, () => { const w = fresh(); cmdP(w, { type: 'setStopper', tubeId: 'gL', seat01: 1 }); cmdP(w, { type: 'connectCapillary', tubeId: 'gL', contact01: 1 }); cmdP(w, { type: 'markBaseline', tubeId: 'gL', eyeOffsetCm: 0 }); return w; }],
    [15, () => { const w = fresh(); cmdP(w, { type: 'setStopper', tubeId: 'gL', seat01: 1 }); cmdP(w, { type: 'connectCapillary', tubeId: 'gL', contact01: 1 }); cmdP(w, { type: 'markBaseline', tubeId: 'gL', eyeOffsetCm: 4 }); return w; }],
    [16, () => { const w = fresh(); tubeB08(w, 'gL', 'el1', 'aqA', 'light'); tubeB08(w, 'gD', 'el2', 'aqB', 'dark'); placeP(w, 'coverG', 'cover:gD'); start(w); return w; }],
    [18, () => { const w = gasReady(); start(w); placeP(w, 'gL', 'hand'); return w; }],
    [19, () => { const w = fresh(); tubeB08(w, 'gL', 'el1', 'aqA', 'light'); tubeB08(w, 'gD', 'el2', 'aqB', 'dark'); placeP(w, 'gL', 'bench', { x: 100, y: 30, z: 0 }); placeP(w, 'gD', 'bench', { x: 140, y: 30, z: 0 }); placeP(w, 'coverG', 'cover:gD'); cmdP(w, { type: 'setPose', id: 'lampG', pose: P(100, 20) }); cmdP(w, { type: 'setLamp', lampId: 'lampG', on: true, powerPct: 100 }); start(w); return w; }],
    [20, () => { const w = gasReady(); start(w); cmdP(w, { type: 'openStopper', tubeId: 'gL' }); return w; }],
    [21, () => { const w = fresh(); cmdP(w, { type: 'fillTube', tubeId: 'gL', mL: 70, tiltDeg: 10 }); return w; }],
    [22, () => { const w = fresh(); cmdP(w, { type: 'setStopper', tubeId: 'gL', seat01: 1 }); cmdP(w, { type: 'connectCapillary', tubeId: 'gL', contact01: 1 }); cmdP(w, { type: 'markBaseline', tubeId: 'gL', eyeOffsetCm: 0 }); return w; }],
    [26, () => { const w = btbReady(); w.photo.btb.bN.drops = 0; cmdP(w, { type: 'startSeries' }); return w; }],
    [27, () => { const w = btbReady(); cmdP(w, { type: 'addIndicator', tubeId: 'bL', drops: 3 }); cmdP(w, { type: 'startSeries' }); return w; }],
    [28, () => { const w = btbReady(); cmdP(w, { type: 'doseCO2', tubeId: 'bL', units: 3, aligned: true }); cmdP(w, { type: 'startSeries' }); return w; }],
    [29, () => { const w = fresh(); for (const id of ['bN', 'bL', 'bD']) { cmdP(w, { type: 'fillBtb', tubeId: id, mL: 10 }); cmdP(w, { type: 'addIndicator', tubeId: id, drops: 4 }); } placeP(w, 'elB1', 'tube:bL'); placeP(w, 'elB2', 'tube:bD'); placeP(w, 'el1', 'tube:bN'); cmdP(w, { type: 'startSeries' }); return w; }],
    [30, () => { const w = btbReady(); placeP(w, 'coverB', 'bench', { x: 372, y: 30, z: 0 }); cmdP(w, { type: 'startSeries' }); return w; }],
    [32, () => { const w = btbReady(); cmdP(w, { type: 'startSeries' }); cmdP(w, { type: 'mutateProfile' }, false); return w; }],
    [33, () => { const w = fresh(); cmdP(w, { type: 'fillBtb', tubeId: 'bL', mL: 10 }); cmdP(w, { type: 'doseCO2', tubeId: 'bL', units: 3, aligned: false }); return w; }],
    [34, () => { const w = btbReady(); w.photo.btb.bL.baselineId = null; cmdP(w, { type: 'startSeries' }); return w; }],
    [36, () => { const w = hoodReady(); cmdP(w, { type: 'transferLeaf', g: 1.4, inside: true }); return w; }],
    [37, () => { const w = hoodReady(); cmdP(w, { type: 'transferLeaf', g: 1, inside: true }); cmdP(w, { type: 'grind', strokes: 2 }); for (const [id, mL] of [['bA', 4], ['bW', 4], ['bH', 3]] as const) { cmdP(w, { type: 'openSolvent', bottleId: id }); cmdP(w, { type: 'addSolvent', bottleId: id, mL }); cmdP(w, { type: 'closeSolvent', bottleId: id }); } cmdP(w, { type: 'capSepTube', closed: true }); cmdP(w, { type: 'shake', intensity01: 1, seconds: 10 }); runPhotoFor(w, 21); cmdP(w, { type: 'aspirate', zone: 'upper' }); return w; }],
    [38, () => { const w = hoodReady(); cmdP(w, { type: 'transferLeaf', g: 1, inside: false }); return w; }],
    [39, () => { const w = hoodReady(); cmdP(w, { type: 'transferLeaf', g: 1, inside: true }); cmdP(w, { type: 'openSolvent', bottleId: 'bA' }); cmdP(w, { type: 'addSolvent', bottleId: 'bA', mL: 1 }); cmdP(w, { type: 'capSepTube', closed: true }); cmdP(w, { type: 'shake', intensity01: 1, seconds: 10 }); return w; }],
    [40, () => { const w = hoodReady(); cmdP(w, { type: 'transferLeaf', g: 1, inside: true }); cmdP(w, { type: 'openSolvent', bottleId: 'bA' }); cmdP(w, { type: 'addSolvent', bottleId: 'bA', mL: 4 }); cmdP(w, { type: 'shake', intensity01: 1, seconds: 10 }); return w; }],
    [41, () => { const w = hoodReady(); cmdP(w, { type: 'transferLeaf', g: 1, inside: true }); cmdP(w, { type: 'openSolvent', bottleId: 'bA' }); cmdP(w, { type: 'addSolvent', bottleId: 'bA', mL: 4 }); cmdP(w, { type: 'capSepTube', closed: true }); cmdP(w, { type: 'shake', intensity01: 0.2, seconds: 5 }); runPhotoFor(w, 21); cmdP(w, { type: 'aspirate', zone: 'upper' }); return w; }],
    [42, () => { const w = hoodReady(); cmdP(w, { type: 'transferLeaf', g: 1, inside: true }); cmdP(w, { type: 'openSolvent', bottleId: 'bA' }); cmdP(w, { type: 'addSolvent', bottleId: 'bA', mL: 4 }); cmdP(w, { type: 'capSepTube', closed: true }); cmdP(w, { type: 'shake', intensity01: 1, seconds: 10 }); cmdP(w, { type: 'aspirate', zone: 'upper' }); return w; }],
    [43, () => { const w = hoodReady(); cmdP(w, { type: 'transferLeaf', g: 1, inside: true }); cmdP(w, { type: 'openSolvent', bottleId: 'bA' }); cmdP(w, { type: 'addSolvent', bottleId: 'bA', mL: 4 }); cmdP(w, { type: 'capSepTube', closed: true }); cmdP(w, { type: 'shake', intensity01: 1, seconds: 10 }); runPhotoFor(w, 21); cmdP(w, { type: 'aspirate', zone: 'interface' }); return w; }],
    [44, () => { const w = paperReady(); cmdP(w, { type: 'setPose', id: 'lampB', pose: P(w.objects.vial.pose.x - 20, w.objects.vial.pose.y - 40) }); cmdP(w, { type: 'setPose', id: 'lampG', pose: P(420, 20) }); cmdP(w, { type: 'setPose', id: 'lampG', pose: P(w.objects.vial.pose.x + 45, w.objects.vial.pose.y) }); w.objects.vial.pose = P(470 + 45, 20); cmdP(w, { type: 'setLamp', lampId: 'lampG', on: true, powerPct: 100 }); runPhotoFor(w, 1); return w; }],
    [45, () => { const w = spotted(); cmdP(w, { type: 'openSolvent', bottleId: 'bW' }); cmdP(w, { type: 'pourEluent', bottleId: 'bW', levelMm: 10 }); return w; }],
    [46, () => { const w = paperReady(); cmdP(w, { type: 'markOrigin', tool: 'pen', mm: 20 }); return w; }],
    [47, () => { const w = paperReady(); cmdP(w, { type: 'applySpot', size: 'small' }); cmdP(w, { type: 'hangPaper', tiltDeg: 0, clip: true }); return w; }],
    [48, () => { const w = spotted(); cmdP(w, { type: 'openSolvent', bottleId: 'bE' }); cmdP(w, { type: 'pourEluent', bottleId: 'bE', levelMm: 30 }); cmdP(w, { type: 'hangPaper', tiltDeg: 0, clip: true }); return w; }],
    [49, () => { const w = paperReady(); cmdP(w, { type: 'applySpot', size: 'large' }); return w; }],
    [50, () => { const w = spotted(); cmdP(w, { type: 'applySpot', size: 'small' }); return w; }],
    [51, () => { const w = eluted(); cmdP(w, { type: 'hangPaper', tiltDeg: 15, clip: true }); return w; }],
    [52, () => { const w = eluted(); cmdP(w, { type: 'hangPaper', tiltDeg: 0, clip: true }); runPhotoFor(w, 6); return w; }],
    [53, () => { const w = developed(20); cmdP(w, { type: 'removePaper' }); return w; }],
    [54, () => developed(2200)],
    [55, () => { const w = developed(); cmdP(w, { type: 'removePaper' }); runPhotoFor(w, 31); return w; }],
    [56, () => { const w = developed(); cmdP(w, { type: 'removePaper' }); const b = bandsOf(w)[0]; cmdP(w, { type: 'markBand', bandId: b.id, mm: b.centerMm + b.widthMm }); return w; }],
    [60, () => { const w = worldB08(); ppeB08(w, false); toHood(w, 'bA'); cmdP(w, { type: 'openSolvent', bottleId: 'bA' }, false); return w; }],
    [61, () => { const w = fresh(); cmdP(w, { type: 'openSolvent', bottleId: 'bA' }, false); return w; }],
    [62, () => { const w = fresh(); toHood(w, 'bA'); cmdP(w, { type: 'setPose', id: 'lampG', pose: P(470, 30) }); cmdP(w, { type: 'setLamp', lampId: 'lampG', on: true, powerPct: 50 }); cmdP(w, { type: 'openSolvent', bottleId: 'bA' }, false); return w; }],
    [63, () => { const w = fresh(); toHood(w, 'bA'); cmdP(w, { type: 'setHood', on: false, sashOk: true }); cmdP(w, { type: 'openSolvent', bottleId: 'bA' }, false); return w; }],
    [64, () => { const w = paperReady(); placeP(w, 'vial', 'drain', undefined, false); return w; }],
    [65, () => { const w = fresh(); cmdP(w, { type: 'setLamp', lampId: 'lampG', on: true, powerPct: 50 }); cmdP(w, { type: 'closeBench' }, false); return w; }],
    [66, () => { const w = paperReady(); cmdP(w, { type: 'closeBench' }, false); return w; }],
    [67, () => { const w = spotted(); cmdP(w, { type: 'hangPaper', tiltDeg: 0, clip: false }, false); return w; }],
    [71, () => { const w = fresh(); cmdP(w, { type: 'requestAsset', assetId: 'fotoDeOtroCurso' }, false); return w; }],
  ];
  it.each(cases)('FOT-%i', (n, make) => {
    const w = make();
    expect(has(w, n), code(n)).toBe(true);
  }, 30000);
  it('el catálogo está completo: 76 errores y 5 incidencias', () => {
    const covered = new Set([...cases.map((c) => c[0]), ...NB_CODES_B08]);
    expect(SIMULATED_ERRORS_B08.filter((e) => e.kind !== 'sys').length).toBe(76);
    expect(SIMULATED_ERRORS_B08.filter((e) => e.kind === 'sys').length).toBe(5);
    expect([...Array(76).keys()].map((i) => i + 1).filter((n) => !covered.has(n))).toEqual([]);
  });
});

describe('B08 · consecuencias causales', () => {
  it('una fuga reduce el desplazamiento y conserva el balance', () => {
    const run = (contact: number) => {
      const w = fresh();
      setupGasB08(w);
      cmdP(w, { type: 'connectCapillary', tubeId: 'gL', contact01: contact });
      start(w);
      runPhotoFor(w, 1200);
      return { h: w.photo.tubes.gL.hMm, c: conservedPhoto(w), leak: w.photo.tubes.gL.o2LeakUmol };
    };
    const good = run(1);
    const bad = run(0.5);
    expect(bad.h).toBeLessThan(good.h * 0.9);
    expect(bad.leak).toBeGreaterThan(0);
    for (const v of Object.values(bad.c)) expect(Math.abs(v)).toBeLessThan(1e-6);
  }, 30000);
  it('sin baño, la lámpara cercana mueve el menisco aunque no haya planta: expansión, no fotosíntesis', () => {
    const w = fresh();
    tubeB08(w, 'gL', 'el1', 'aqA', 'light');
    tubeB08(w, 'gD', 'el2', 'aqB', 'dark');
    placeP(w, 'coverG', 'cover:gD');
    placeP(w, 'gL', 'bench', { x: 100, y: 30, z: 0 });
    placeP(w, 'gD', 'bench', { x: 160, y: 30, z: 0 });
    cmdP(w, { type: 'setPose', id: 'lampG', pose: P(100, 20) });
    cmdP(w, { type: 'setLamp', lampId: 'lampG', on: true, powerPct: 100 });
    start(w);
    runPhotoFor(w, 600);
    const t = w.photo.tubes.gL;
    expect(t.tempC).toBeGreaterThan(30);
    expect(t.hMm).toBeGreaterThan(30);
  }, 30000);
  it('a oscuras total no hay fotoproducción: fijación neta negativa', () => {
    const w = gasReady();
    start(w);
    runPhotoFor(w, 600);
    expect(w.photo.tubes.gD.biomassUmol).toBeLessThan(0);
    expect(w.photo.tubes.gD.o2GasUmol).toBeCloseTo(w.photo.tubes.gD.biomassUmol, 9);
  }, 30000);
  it('origen sumergido: el pigmento pasa al depósito y no hay bandas', () => {
    const w = spotted();
    cmdP(w, { type: 'openSolvent', bottleId: 'bE' });
    cmdP(w, { type: 'pourEluent', bottleId: 'bE', levelMm: 30 });
    cmdP(w, { type: 'hangPaper', tiltDeg: 0, clip: true });
    runPhotoFor(w, 300);
    expect(bandsOf(w)).toEqual([]);
    expect(w.photo.ledger.chlA.paper).toBe(0);
    for (const v of Object.values(conservedPhoto(w))) expect(Math.abs(v)).toBeLessThan(1e-6);
  }, 30000);
  it('frente sin marcar: se evapora y ya no se puede leer', () => {
    const w = developed();
    cmdP(w, { type: 'removePaper' });
    runPhotoFor(w, 31);
    expect(cmdP(w, { type: 'markSolventFront', mm: 116 }, false).code).toBe('FRONT_LOST');
  }, 30000);
  it('los interlocks impiden la acción y corregir no borra el historial', () => {
    const w = fresh();
    expect(cmdP(w, { type: 'openSolvent', bottleId: 'bA' }, false).code).toBe('OUTSIDE_HOOD');
    expect(w.photo.solvents.bA.open).toBe(false);
    toHood(w, 'bA');
    cmdP(w, { type: 'openSolvent', bottleId: 'bA' });
    expect(has(w, 61)).toBe(true);
  });
  it('rechaza lo imposible: cerrar sin medir, leer sin corrida, medir sin retirar', () => {
    const w = fresh();
    expect(cmdP(w, { type: 'readMeniscus', tubeId: 'gL', eyeOffsetCm: 0 }, false).code).toBe('RUN_NOT_STARTED');
    expect(cmdP(w, { type: 'startGasRun' }, false).code).toBe('NO_SPRIG');
    expect(cmdP(w, { type: 'markSolventFront', mm: 100 }, false).code).toBe('NOT_REMOVED');
  });
});

describe('B08 · errores de la libreta', () => {
  const out = idealRouteB08(worldB08());
  const base = () => fillNotebookB08(out, emptyB08Notebook('x'));
  const issue = (n: number, fn: (nb: B08Notebook) => void) => {
    const nb = base();
    fn(nb);
    expect(notebookIssuesB08(out.w, nb), code(n)).toContain(`nb:${code(n)}`);
  };
  it('ninguno en la libreta correcta', () => expect(notebookIssuesB08(out.w, base())).toEqual([]));
  it('FOT-17 lectura del tubo equivocado', () => issue(17, (nb) => { nb.gas[0].finalId = out.fin.finalD; }));
  it('FOT-23 radio equivocado', () => issue(23, (nb) => { nb.gas[0].radiusMm = '2,0'; }));
  it('FOT-24 mm/h como µmol/min', () => issue(24, (nb) => { nb.gas[0].slopeUnit = 'umol/min'; }));
  it('FOT-25 gas seco en perfil realista', () => {
    const w = structuredClone(out.w);
    w.params.photo!.gasProfile = 'realistic';
    const nb = base();
    nb.gas[0].umol = '2,31';
    expect(notebookIssuesB08(w, nb)).toContain('nb:FOT-25');
  });
  it('FOT-31 BTB como glucosa', () => issue(31, (nb) => { nb.claims.btbMeasuresGlucose = true; }));
  it('FOT-35 color mal leído', () => issue(35, (nb) => { nb.btb[1].colorEnd = 'yellow'; }));
  it('FOT-57 base como origen', () => issue(57, (nb) => { nb.bands[0].dBand = nb.bands[0].center; }));
  it('FOT-58 Rf > 1', () => issue(58, (nb) => { nb.bands[0].rf = '1,20'; }));
  it('FOT-59 identidad por color', () => issue(59, (nb) => { nb.claims.identityFromColor = true; }));
  it('FOT-68 0,167 h', () => issue(68, (nb) => { nb.gas[0].hours = '0,167'; }));
  it('FOT-69 signo de la bruta', () => issue(69, (nb) => { nb.gross.gross = String(Number(nb.gross.net) - Math.abs(Number(nb.gross.dark))); }));
  it('FOT-70 ausencia de un pigmento', () => issue(70, (nb) => { nb.claims.absentPigment = true; }));
  it('FOT-72 sin unidad', () => issue(72, (nb) => { nb.gas[0].slopeUnit = ''; }));
  it('FOT-73 DIC como CO₂ libre', () => issue(73, (nb) => { nb.claims.dicIsFreeCo2 = true; }));
  it('FOT-74 oscuro igual a respiración en luz', () => issue(74, (nb) => { nb.gross.assumptionStated = false; }));
  it('FOT-75 frente como banda', () => issue(75, (nb) => { nb.bands[0].frontReadingId = nb.bands[0].readingId; }));
  it('FOT-76 recurso sin escala como medida', () => issue(76, (nb) => { nb.claims.photoAsMetric = true; }));
});

describe('B08 · incidencias y módulos: nunca descuentan', () => {
  it('S21 (sin radio certificado): solo mm/h; bruta en revisión, sin tachar', () => {
    const out = idealRouteB08(worldB08({ scenarios: ['S21'] }));
    const nb = fillNotebookB08(out);
    nb.gross = { net: '', dark: '', gross: '', unit: '', assumptionStated: false, humidityCorrected: false };
    const it = evaluateB08(out.w, nb).components.flatMap((c) => c.items).find((i) => i.key === 'b08.gross');
    expect(it?.ok).toBeNull();
    expect(out.w.cell.incidents).toContain('missingOxygenCalibration');
  }, 60000);
  it('S26 (solo cromatografía): la rúbrica se reparte y gas no puntúa', () => {
    const w = worldB08({ scenarios: ['S26'] });
    ppeB08(w);
    hypothesisB08(w);
    extractionB08(w);
    chromB08(w);
    closeB08(w);
    const ev = evaluateB08(w, emptyB08Notebook());
    expect(ev.components.map((c) => c.id)).toEqual(['safety', 'design', 'pigments', 'reporting']);
    expect(Math.abs(ev.components.reduce((s, c) => s + c.weight, 0) - 1)).toBeLessThan(1e-9);
  }, 60000);
  it('S27 (gas + BTB): no exige cromatografía para cerrar', () => {
    const w = worldB08({ scenarios: ['S27'] });
    ppeB08(w);
    hypothesisB08(w);
    setupGasB08(w);
    setupBtbB08(w);
    runGasB08(w);
    expect(evaluateB08(w, emptyB08Notebook()).components.map((c) => c.id)).not.toContain('pigments');
  }, 60000);
  it('S15 solapados: una banda compuesta, no dos Rf forzados; S16: más de cuatro', () => {
    const a = idealRouteB08(worldB08({ scenarios: ['S15'] }));
    expect(a.chrom.bands.length).toBe(3);
    const b = idealRouteB08(worldB08({ scenarios: ['S16'] }));
    expect(b.chrom.bands.length).toBe(5);
  }, 60000);
  it('S04 luz débil produce menos que S03', () => {
    const run = (power: number) => {
      const w = fresh();
      setupGasB08(w);
      cmdP(w, { type: 'setLamp', lampId: 'lampG', on: true, powerPct: power });
      start(w);
      runPhotoFor(w, 600);
      return w.photo.tubes.gL.hMm;
    };
    expect(run(10)).toBeLessThan(run(100));
  }, 30000);
});
