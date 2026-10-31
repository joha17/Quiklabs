/**
 * Ruta del estudiante de la práctica B07 hecha SOLO con comandos: EPP, medios, placas, trazados, frotis y tinción por
 * fases, controles y frotis al microscopio, medición calibrada y cierre.
 */
import { expect } from 'vitest';
import type { MicroCommand } from '../simulation/micro-world/commands';
import type { MicroWorld } from '../simulation/micro-world/types';
import { coloniesOf, dispatchMicro, runMicroFor } from '../simulation/micro-world/world';
import { microscopeView } from '../simulation/optical-world/world';
import { CLEAN_TRAY, STAGE_SEAT, caseSlotIndex, caseSlotPos, stageTopZCm } from '../simulation/optical-world/geometry';
import { PLATE_TRAY, SMEAR_PAD, STAIN_RACK, VIEWER } from '../simulation/micro-world/geometry';
import { newPracticeB07World, type PracticeB07Options } from '../practices/practice-b07';
import { emptyB07Notebook, QUESTIONS_B07, type B07Notebook } from '../practices/practice-b07/notebook';
import type { MediumId } from '../simulation/micro-world/model';
import { MEDIA } from '../simulation/micro-world/model';

export function worldB07(opts: Partial<PracticeB07Options> = {}): MicroWorld {
  return newPracticeB07World({ mode: 'PRACTICE', seed: 2607, ...opts });
}

export function cmdM(w: MicroWorld, c: MicroCommand, expectOk = true) {
  const r = dispatchMicro(w, c);
  if (expectOk) expect(r.ok, `${c.type}: ${r.code ?? ''}`).toBe(true);
  return r;
}
export const runM = (w: MicroWorld, s: number) => runMicroFor(w, s);
const P = (x: number, y: number, z = 0) => ({ x, y, z, rotationRad: 0 });

export function placeM(w: MicroWorld, id: string, support: string, at?: { x: number; y: number; z?: number }, expectOk = true) {
  const o = w.objects[id];
  return cmdM(w, { type: 'setPose', id, pose: P(at?.x ?? o.pose.x, at?.y ?? o.pose.y, at?.z ?? 0), support }, expectOk);
}
export function ppeB07(w: MicroWorld) {
  for (const item of ['coat', 'shoes', 'hair', 'hands'] as const) cmdM(w, { type: 'setPPE', item, enabled: true });
  cmdM(w, { type: 'startWork' });
}
export function mediaB07(w: MicroWorld) {
  for (const id of Object.keys(MEDIA) as MediumId[]) {
    cmdM(w, { type: 'inspectMedia', mediaId: id });
    cmdM(w, { type: 'classifyMedia', mediaId: id, consistency: MEDIA[id].consistency, func: MEDIA[id].func });
  }
  cmdM(w, { type: 'commitMedia' });
}
export const toViewer = (w: MicroWorld, id: string, expectOk = true) => placeM(w, id, 'viewer', VIEWER, expectOk);
export const toTray = (w: MicroWorld, id: string) => placeM(w, id, 'plateTray', { x: w.objects[id].pose.x, y: PLATE_TRAY.y, z: PLATE_TRAY.z });
/** Mira el control del lote, luego la placa asignada (colonia 1), y deja la asignada en el visor. */
export function platesB07(w: MicroWorld) {
  toViewer(w, 'plC');
  toTray(w, 'plC');
  toViewer(w, 'plB');
  const b = coloniesOf(w, 'plB')[0];
  const rb = cmdM(w, { type: 'recordColony', plateId: 'plB', colonyId: b.id });
  toTray(w, 'plB');
  toViewer(w, 'plA');
  const a = coloniesOf(w, 'plA')[0];
  const ra = cmdM(w, { type: 'recordColony', plateId: 'plA', colonyId: a.id });
  return { a, b, readA: ra.id!, readB: rb.id! };
}
/** Cuatro zonas sin cruces y siembra de una sola línea. */
export const FOUR_ZONES: number[][][] = [
  [[-3, -3], [-1, -3], [-3, -2.4], [-1, -2.4]],
  [[1, -3], [3, -3], [1, -2.4], [3, -2.4]],
  [[1, 1.4], [3, 1.4], [1, 2], [3, 2]],
  [[-3, 1.4], [-1, 1.4], [-3, 2], [-1, 2]],
];
export const CROSSED: number[][][] = [...FOUR_ZONES, [[-3.2, -3], [3.2, 2]], [[-3.2, 2], [3.2, -3]]];
export const SINGLE: number[][][] = [[[-3, 0], [3, 0]]];
export function distributionB07(w: MicroWorld) {
  const a = cmdM(w, { type: 'strokePlate', technique: 'fourZone', strokes: FOUR_ZONES });
  const b = cmdM(w, { type: 'strokePlate', technique: 'single', strokes: SINGLE });
  cmdM(w, { type: 'compareMethods' });
  return { t1: a.id!, t2: b.id! };
}
export function smearB07(w: MicroWorld, slide = 'sl1', plate = 'plA', coverage = 0.35) {
  const col = coloniesOf(w, plate)[0];
  if (w.objects[plate].support !== 'viewer') toViewer(w, plate);
  cmdM(w, { type: 'pickColony', plateId: plate, colonyId: col.id });
  placeM(w, slide, 'smearPad', SMEAR_PAD);
  cmdM(w, { type: 'prepareVirtualSmear', slideId: slide, declaredPlateId: plate, coverage01: coverage });
  runM(w, w.params.micro!.dryVirtualS + 0.2);
  cmdM(w, { type: 'markSmearDry', slideId: slide });
  placeM(w, slide, 'rack', STAIN_RACK);
}
export function gramB07(w: MicroWorld, slide = 'sl1', u = 1) {
  for (const phase of ['primary', 'mordant', 'decolorizer', 'counterstain'] as const) {
    cmdM(w, { type: 'applyStainPhase', slideId: slide, phase, index: phase === 'decolorizer' ? u : undefined });
    cmdM(w, { type: 'rinseVirtualSlide', slideId: slide });
  }
}
export const focusOn = (w: MicroWorld) => {
  for (let i = 0; i < 400 && microscopeView(w).sharpness01 < 0.97; i++) {
    const before = microscopeView(w).sharpness01;
    cmdM(w, { type: i < 200 && before < 0.25 ? 'turnCoarse' : 'turnFine', deltaTurns: i < 200 && before < 0.25 ? 0.1 : 0.05 } as MicroCommand, false);
    if (microscopeView(w).sharpness01 < before - 1e-9) {
      cmdM(w, { type: 'turnFine', deltaTurns: -0.05 }, false);
      break;
    }
    runM(w, 0.05);
  }
};
export function mountM(w: MicroWorld, slide: string) {
  if (w.objects[slide].support.startsWith('case:') && !w.slideCase.open) cmdM(w, { type: 'openSlideCase', open: true });
  cmdM(w, { type: 'selectObjective', objectiveX: 4 });
  if (!w.microscope.clipOpen) cmdM(w, { type: 'openClip', open: true });
  placeM(w, slide, 'stage', { x: STAGE_SEAT.x, y: STAGE_SEAT.y, z: stageTopZCm(6) });
  cmdM(w, { type: 'openClip', open: false });
  cmdM(w, { type: 'setPower', device: 'microscope', on: true });
  cmdM(w, { type: 'setIllumination', device: 'microscope', value01: 0.55 });
}
export function observeM(w: MicroWorld, slide: string, up: number[] = [10, 40]) {
  mountM(w, slide);
  cmdM(w, { type: 'observe', instrument: 'compound', open: true });
  focusOn(w);
  runM(w, w.params.observationHoldS + 0.3);
  const ids: string[] = [cmdM(w, { type: 'captureObservation', instrument: 'compound' }, false).id ?? ''];
  for (const x of up) {
    cmdM(w, { type: 'selectObjective', objectiveX: x });
    focusOn(w);
    runM(w, w.params.observationHoldS + 0.3);
    ids.push(cmdM(w, { type: 'captureObservation', instrument: 'compound' }, false).id ?? '');
  }
  cmdM(w, { type: 'observe', instrument: 'compound', open: false });
  return ids;
}
export function unmountM(w: MicroWorld, slide: string, to: 'home' | 'rack' | 'clean') {
  cmdM(w, { type: 'selectObjective', objectiveX: 4 });
  cmdM(w, { type: 'openClip', open: true });
  if (to === 'home') {
    const slot = w.slideCase.home[slide];
    const sp = caseSlotPos(caseSlotIndex(slot));
    placeM(w, slide, `case:${slot}`, { x: sp.x, y: sp.y, z: sp.z });
  } else if (to === 'rack') placeM(w, slide, 'rack', STAIN_RACK);
  else placeM(w, slide, 'cleanTray', { x: CLEAN_TRAY.x, y: CLEAN_TRAY.y, z: CLEAN_TRAY.z });
}
export function closeB07(w: MicroWorld) {
  if (w.objects.plA.support !== 'plateTray') toTray(w, 'plA');
  if (w.slideCase.open) cmdM(w, { type: 'openSlideCase', open: false });
  cmdM(w, { type: 'setPower', device: 'microscope', on: false });
  cmdM(w, { type: 'closeBench' }, false);
}
export function idealRouteB07(w: MicroWorld, resume: (w: MicroWorld) => MicroWorld = (x) => x) {
  ppeB07(w);
  mediaB07(w);
  const pl = platesB07(w);
  const dist = distributionB07(w);
  const c = pl.a;
  const dm = cmdM(w, { type: 'measureColony', plateId: 'plA', colonyId: c.id, ax: c.x - c.rPx, ay: c.y, bx: c.x + c.rPx, by: c.y, scale: 'calibration' }).id!;
  w = resume(w);
  smearB07(w);
  gramB07(w);
  const own = observeM(w, 'sl1');
  unmountM(w, 'sl1', 'rack');
  const pos = observeM(w, 'fxP');
  unmountM(w, 'fxP', 'home');
  const neg = observeM(w, 'fxN');
  unmountM(w, 'fxN', 'home');
  closeB07(w);
  return { w, pl, dist, dm, own, pos, neg };
}
export function fillNotebookB07(out: ReturnType<typeof idealRouteB07>, nb: B07Notebook = emptyB07Notebook('b07-test')): B07Notebook {
  const { w, pl, dist, dm, own, pos, neg } = out;
  for (const r of nb.media) {
    const t = MEDIA[r.mediaId as MediumId];
    Object.assign(r, { consistency: t.consistency, formulation: t.formulation, func: t.func, compositionSource: 'card', appearance: 'Según ficha', justification: 'Lo declara su ficha autorizada' });
    if (r.mediaId === 'mEMB') Object.assign(r, { selectiveMeans: 'inhibits', differentialMeans: 'distinguishes' });
  }
  const m = w.micro.measures.find((x) => x.id === dm)!;
  const c = pl.a;
  nb.colonies[0] = { readingId: pl.readA, plateId: 'plA', colonyId: c.id, form: c.form, margin: c.margin, elevation: c.elevation, surface: c.surface, pigment: c.pigment, measureId: dm, diameter: m.mm.toFixed(2), uncertainty: m.uMm.toFixed(2), unit: 'mm', borderDeclared: c.hiddenEdge ?? false, count: '18', countUnit: 'visibleColonies', identity: 'preliminary' };
  const b = pl.b;
  nb.colonies[1] = { readingId: pl.readB, plateId: 'plB', colonyId: b.id, form: b.form, margin: b.margin, elevation: b.elevation, surface: b.surface, pigment: b.pigment, measureId: null, diameter: '', uncertainty: '', unit: '', borderDeclared: false, count: '18', countUnit: 'visibleColonies', identity: 'preliminary' };
  const tr = (id: string, technique: string) => {
    const x = w.micro.trials.find((t) => t.id === id)!;
    return { trialId: id, technique, overlap: x.overlap01.toFixed(2), separation: x.separation01.toFixed(2), limits: 'Índice geométrico, no un recuento', replicates: false };
  };
  nb.techniques = [tr(dist.t1, 'fourZone'), tr(dist.t2, 'single')];
  const hi = own[own.length - 1];
  nb.gram[0] = { observationId: hi, sampleCode: 'U1', controlPosObs: pos[pos.length - 1], controlNegObs: neg[neg.length - 1], quality: 'Fases completas y lavados', color: 'violet', shape: 'cocci', interpretation: 'gram-positive', species: '', limits: 'El Gram no identifica la especie', membraneVisible: false, negativeStainSame: false };
  const o = w.observations[hi];
  nb.optics[0] = { observationId: hi, objective: String(o.objectiveX), ocular: String(w.params.microscope.ocularX), totalMag: String(w.params.microscope.ocularX * (o.objectiveX ?? 0)), oil: false, focus: 'Nítido', zone: 'Central' };
  nb.integrative = { hypothesis: 'Colonias crema con cocos', medium: 'Agar nutritivo', colony: 'Circular y convexa', gram: 'Violeta frente a controles', contradictions: 'Ninguna', confidence: 'Media', claim: 'preliminary', conclusion: 'Compatible con un organismo Gram positivo; sin especie', nextTest: 'Prueba bioquímica de forma conceptual' };
  for (const q of QUESTIONS_B07) nb.analysis[q] = 'Respuesta argumentada con evidencia propia, citando captura y ficha.';
  return nb;
}
