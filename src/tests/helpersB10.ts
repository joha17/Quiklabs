/**
 * Ruta del estudiante de la práctica B10 hecha SOLO con comandos: EPP, clasificación, láminas, muestras al estereoscopio, modelos 3D girados
 * y rotulados mirando cada región, aves, cráneos, huellas con la luz movida, marcas y el cierre.
 */
import { expect } from 'vitest';
import type { AnimalCommand } from '../simulation/animal-world/commands';
import type { AnimalWorld } from '../simulation/animal-world/types';
import { dispatchAnimal, runAnimalFor } from '../simulation/animal-world/world';
import { modelById, orientationFor } from '../simulation/animal-world/catalog';
import { MATERIALS } from '../simulation/animal-world/materials';
import { microscopeView, stereoView } from '../simulation/optical-world/world';
import { STAGE_SEAT, caseSlotIndex, caseSlotPos, stageTopZCm, SAMPLE_TRAY } from '../simulation/optical-world/geometry';
import { assetById, type StructureId } from '../simulation/specimens/assets';
import type { MarkStructure } from '../simulation/div-world/types';
import { newPracticeB10World, type PracticeB10Options } from '../practices/practice-b10';
import type { B10Scenario } from '../practices/practice-b10/error-scenarios';
import { TISSUE_OF_ASSET } from '../practices/practice-b10/expected-results';
import { emptyB10Notebook, QUESTIONS_B10, invertRow, tissueRow, type B10Notebook } from '../practices/practice-b10/notebook';

export function worldB10(opts: Partial<PracticeB10Options> & { scenarios?: B10Scenario[] } = {}): AnimalWorld {
  return newPracticeB10World({ mode: 'PRACTICE', seed: 2610, ...opts });
}

export function cmdA(w: AnimalWorld, c: AnimalCommand, expectOk = true) {
  const r = dispatchAnimal(w, c);
  if (expectOk) expect(r.ok, `${c.type}: ${r.code ?? ''}`).toBe(true);
  return r;
}

export const runA = (w: AnimalWorld, s: number) => runAnimalFor(w, s);
const P = (x: number, y: number, z = 0) => ({ x, y, z, rotationRad: 0 });

export function placeA(w: AnimalWorld, id: string, support: string, at?: { x: number; y: number; z?: number }, expectOk = true) {
  const o = w.objects[id];
  return cmdA(w, { type: 'setPose', id, pose: P(at?.x ?? o.pose.x, at?.y ?? o.pose.y, at?.z ?? 0), support }, expectOk);
}

export function ppeB10(w: AnimalWorld) {
  for (const item of w.params.ppeRequired ?? []) cmdA(w, { type: 'setPPE', item, enabled: true });
  cmdA(w, { type: 'startWork' });
  for (const t of ['glassBin', 'bioWaste', 'trashBin', 'mic', 'case']) cmdA(w, { type: 'inspect', target: t });
}

export function classifyAll(w: AnimalWorld) {
  for (const [id, m] of Object.entries(MATERIALS)) cmdA(w, { type: 'classifyMaterial', materialId: id, materialClass: m.materialClass, instrument: m.instrument });
}

export function focusA(w: AnimalWorld) {
  const obj = microscopeView(w).objectiveX ?? 4;
  if (obj === 4) {
    cmdA(w, { type: 'checkSide' });
    for (let i = 0; i < 80 && microscopeView(w).sharpness01 < 0.25; i++) cmdA(w, { type: 'turnCoarse', deltaTurns: 0.1 });
  }
  let best = microscopeView(w).sharpness01;
  for (const dir of [1, -1]) {
    for (let i = 0; i < 60; i++) {
      cmdA(w, { type: 'turnFine', deltaTurns: dir * 0.02 });
      const s = microscopeView(w).sharpness01;
      if (s + 1e-9 < best) {
        cmdA(w, { type: 'turnFine', deltaTurns: -dir * 0.02 });
        break;
      }
      best = s;
    }
  }
}

/** Lo que hay que centrar a 4X antes de subir: en estas láminas el centro del portaobjetos queda vacío o lejos de lo que interesa. */
export const AIM: Record<string, StructureId> = { fxCO: 'polyp', fxME: 'mesoglea', fxCE: 'scolexS', fxFL: 'oralSuckerS', fxPL: 'pharynxS', fxMS: 'strobila', fxLS: 'nit', fxNE: 'neuronBody', fxSP: 'choanocyte', fxNM: 'nematodeGut', fxEW: 'wormGut' };

/** Mueve el carro hasta que el campo quede centrado en la estructura; el sentido se comprueba, no se supone. */
export function centerOn(w: AnimalWorld, s: StructureId) {
  const v0 = microscopeView(w);
  const a = assetById(v0.assetId ?? '');
  const p = a?.annotations.find((x) => x.structureId === s)?.polygonNormalized;
  if (!a || !p) return;
  const tx = (p.reduce((q, r) => q + r[0], 0) / p.length - 0.5) * a.extentMm[0];
  const ty = (p.reduce((q, r) => q + r[1], 0) / p.length - 0.5) * a.extentMm[1];
  const { stageXmm: sx, stageYmm: sy } = w.microscope;
  cmdA(w, { type: 'setStageXY', xMm: sx + 0.1, yMm: sy + 0.1 });
  const v1 = microscopeView(w);
  const kx = Math.sign(v1.centerMm![0] - v0.centerMm![0]) || 1;
  const ky = Math.sign(v1.centerMm![1] - v0.centerMm![1]) || 1;
  cmdA(w, { type: 'setStageXY', xMm: sx + kx * (tx - v0.centerMm![0]), yMm: sy + ky * (ty - v0.centerMm![1]) });
}

/** Observación 4X → 10X → 40X de una lámina de la caja, que vuelve a su ranura. */
export function fixedRouteA(w: AnimalWorld, id: string, objectives: Array<4 | 10 | 40> = [10]) {
  const out: Record<number, string> = {};
  if (!w.slideCase.open) cmdA(w, { type: 'openSlideCase', open: true });
  cmdA(w, { type: 'readSlideLabel', slideId: id });
  placeA(w, id, 'hand');
  if (microscopeView(w).objectiveX !== 4) cmdA(w, { type: 'selectObjective', objectiveX: 4 });
  if (!w.microscope.clipOpen) cmdA(w, { type: 'openClip', open: true });
  placeA(w, id, 'stage', { x: STAGE_SEAT.x, y: STAGE_SEAT.y, z: stageTopZCm(6) });
  cmdA(w, { type: 'openClip', open: false });
  focusA(w);
  cmdA(w, { type: 'observe', instrument: 'compound', open: true });
  runA(w, 1);
  if (AIM[id]) centerOn(w, AIM[id]);
  for (const x of [4, 10, 40] as const) {
    if (x !== 4) {
      cmdA(w, { type: 'selectObjective', objectiveX: x });
      focusA(w);
    }
    cmdA(w, { type: 'setDiaphragm', value01: x === 40 ? 0.6 : 0.5 });
    if (objectives.includes(x)) {
      runA(w, 1.6);
      out[x] = cmdA(w, { type: 'captureObservation', instrument: 'compound' }).id!;
    }
  }
  cmdA(w, { type: 'setDiaphragm', value01: 0.5 });
  cmdA(w, { type: 'observe', instrument: 'compound', open: false });
  cmdA(w, { type: 'selectObjective', objectiveX: 4 });
  cmdA(w, { type: 'turnCoarse', deltaTurns: -w.microscope.coarseTurns });
  cmdA(w, { type: 'turnFine', deltaTurns: -w.microscope.fineTurns });
  cmdA(w, { type: 'openClip', open: true });
  const home = w.slideCase.home[id];
  placeA(w, id, `case:${home}`, caseSlotPos(caseSlotIndex(home)));
  return out;
}

function focusStereoA(w: AnimalWorld) {
  const lim = w.params.stereo.focusRangeMm / w.params.stereo.focusPitchMmPerTurn - 0.5;
  cmdA(w, { type: 'setStereoFocus', deltaTurns: -lim - w.stereo.focusTurns });
  let best = -1;
  let bestAt = w.stereo.focusTurns;
  for (let i = 0; w.stereo.focusTurns + 0.25 <= lim && i < 200; i++) {
    const s = stereoView(w).sharpness01;
    if (s > best) {
      best = s;
      bestAt = w.stereo.focusTurns;
    }
    cmdA(w, { type: 'setStereoFocus', deltaTurns: 0.25 });
  }
  cmdA(w, { type: 'setStereoFocus', deltaTurns: bestAt - w.stereo.focusTurns });
}

export function stereoRouteA(w: AnimalWorld, id: string) {
  cmdA(w, { type: 'wipe', targetId: 'fc', toolId: 'lp' });
  cmdA(w, { type: 'pickSpecimen', toolId: 'fc', sourceId: id, pressure01: 0.3 });
  cmdA(w, { type: 'placeSpecimen', toolId: 'fc', targetId: 'stereoBase', dxCm: 0, dyCm: 0 });
  cmdA(w, { type: 'setStereoZoom', zoomX: 1 });
  focusStereoA(w);
  cmdA(w, { type: 'observe', instrument: 'stereo', open: true });
  runA(w, 1.6);
  const cap = cmdA(w, { type: 'captureObservation', instrument: 'stereo' }).id!;
  cmdA(w, { type: 'observe', instrument: 'stereo', open: false });
  cmdA(w, { type: 'pickSpecimen', toolId: 'fc', sourceId: id, pressure01: 0.3 });
  cmdA(w, { type: 'placeSpecimen', toolId: 'fc', targetId: 'sampleTray', dxCm: SAMPLE_TRAY.x - w.objects[id].pose.x, dyCm: 0 }, false);
  return cap;
}

/** Abre el modelo, lo gira de verdad y rotula cada región mirándola. */
export function modelRoute(w: AnimalWorld, id: string) {
  const m = modelById(id)!;
  cmdA(w, { type: 'openModel', modelId: id });
  if (m.group !== 'track') {
    for (const yaw of [60, 120, 180, 240]) cmdA(w, { type: 'orientModel', modelId: id, yawDeg: yaw, pitchDeg: 0, zoom: 1 });
  }
  if (m.group === 'invertebrate' || m.group === 'vertebrate') cmdA(w, { type: 'identifyModel', modelId: id, guess: id });
  for (const r of m.regions) {
    const o = orientationFor(r);
    if (m.group !== 'track') cmdA(w, { type: 'orientModel', modelId: id, yawDeg: o.yawDeg, pitchDeg: o.pitchDeg, zoom: 1 });
    cmdA(w, { type: 'labelRegion', modelId: id, regionId: r.id, part: r.part });
  }
}

export function birdRoute(w: AnimalWorld, id: string) {
  modelRoute(w, id);
  const m = modelById(id)!;
  cmdA(w, { type: 'answerBird', modelId: id, beak: m.beak ?? null, foot: m.foot ?? null });
}

export function skullRoute(w: AnimalWorld, id: string) {
  modelRoute(w, id);
  const m = modelById(id)!;
  cmdA(w, { type: 'answerSkull', modelId: id, taxon: m.taxon, diet: m.diet ?? '' });
}

export function trackRoute(w: AnimalWorld, id: string) {
  modelRoute(w, id);
  for (const az of [0, 40, 80]) cmdA(w, { type: 'setTrackLight', trackId: id, azimuthDeg: az, elevationDeg: 30 });
  const t = modelById(id)!.track!;
  cmdA(w, { type: 'answerTrack', trackId: id, digits: t.digits, support: t.support, claws: t.claws });
}

export function centerOfA(w: AnimalWorld, obsId: string, structure: StructureId): [number, number] | null {
  const o = w.observations[obsId];
  const a = assetById(o.assetId);
  if (!a) return null;
  const [cx, cy, vw, vh] = o.normalizedViewport;
  for (const an of a.annotations.filter((x) => x.structureId === structure)) {
    const p = an.polygonNormalized;
    const u = 0.5 + (p.reduce((s, q) => s + q[0], 0) / p.length - cx) / vw;
    const v = 0.5 + (p.reduce((s, q) => s + q[1], 0) / p.length - cy) / vh;
    if (u > 0.02 && u < 0.98 && v > 0.02 && v < 0.98) return [u, v];
  }
  return null;
}

export function markA(w: AnimalWorld, obsId: string, structure: MarkStructure, expectOk = true) {
  const pt = centerOfA(w, obsId, structure as StructureId) ?? [0.5, 0.5];
  return cmdA(w, { type: 'markRegion', observationId: obsId, structure, u: pt[0], v: pt[1] }, expectOk);
}

export interface IdealResB10 { slides: Record<string, Record<number, string>>; stereo: Record<string, string> }

export function idealRouteB10(w0: AnimalWorld, resume: (w: AnimalWorld) => AnimalWorld = (w) => w) {
  let w = w0;
  const a = () => w.animal;
  ppeB10(w);
  classifyAll(w);
  cmdA(w, { type: 'setPower', device: 'microscope', on: true });
  if (w.microscope.light01 < 0.2) cmdA(w, { type: 'setIllumination', device: 'microscope', value01: 0.4 });
  const res: IdealResB10 = { slides: {}, stereo: {} };
  for (const id of a().requiredSlides) {
    res.slides[id] = fixedRouteA(w, id, id === 'fxSK' || id === 'fxCA' ? [10, 40] : [10]);
    w = resume(w);
  }
  cmdA(w, { type: 'openSlideCase', open: false });
  if (a().stereoRequired.length) {
    cmdA(w, { type: 'setPower', device: 'stereo', on: true });
    cmdA(w, { type: 'setIllumination', device: 'stereo-incident', value01: 0.5 });
    if (w.stereo.channelMode === 'stereo-pair') {
      cmdA(w, { type: 'setInterpupillary', valueMm: w.params.stereo.userIpdMm });
      cmdA(w, { type: 'setDiopter', side: 'left', value: 0 });
      cmdA(w, { type: 'setDiopter', side: 'right', value: 0 });
    }
    for (const id of a().stereoRequired) res.stereo[id] = stereoRouteA(w, id);
    cmdA(w, { type: 'setPower', device: 'stereo', on: false });
    w = resume(w);
  }
  for (const id of a().requiredModels) {
    const g = modelById(id)!.group;
    if (g === 'bird') birdRoute(w, id);
    else if (g === 'skull') skullRoute(w, id);
    else modelRoute(w, id);
  }
  for (const id of a().requiredTracks) trackRoute(w, id);
  if (a().requiredModels.includes('boneFish') && a().requiredModels.includes('cartFish')) cmdA(w, { type: 'compareModels', a: 'boneFish', b: 'cartFish' });
  else if (a().requiredModels.length >= 2) cmdA(w, { type: 'compareModels', a: a().requiredModels[0], b: a().requiredModels[1] });
  if (a().requiredModels.includes('skullHorse') && a().requiredModels.includes('skullCow')) cmdA(w, { type: 'compareModels', a: 'skullHorse', b: 'skullCow' });
  cmdA(w, { type: 'openModel', modelId: null });
  const mk = (id: string, x: number, s: MarkStructure) => {
    const cap = res.slides[id]?.[x];
    if (cap) markA(w, cap, s);
  };
  mk('fxSK', 40, 'striations');
  mk('fxCE', 10, 'scolexS');
  mk('fxFL', 10, 'oralSuckerS');
  for (const t of ['fc', 'sc']) cmdA(w, { type: 'wipe', targetId: t, toolId: 'lp' });
  cmdA(w, { type: 'setPower', device: 'microscope', on: false });
  cmdA(w, { type: 'closeBench' });
  return { w, res };
}

const ANSWER = 'Respuesta argumentada con mis capturas propias, separando lo observado, lo inferido y lo que no puedo demostrar.';

export function fillNotebookB10(w: AnimalWorld, nb: B10Notebook, res: IdealResB10) {
  const oc = w.params.microscope.ocularX;
  nb.prereport = { hypothesis: 'La organización cambia entre grupos y se reconoce en rasgos observables', instruments: 'Microscopio, estereoscopio y visor 3D', precautions: 'Empezar a 4X y bajar la platina antes de retirar' };
  const tissueIds = Object.keys(res.slides).filter((id) => ['fxEP', 'fxCT', 'fxNE'].includes(id));
  nb.tissues = tissueIds.map((id) => {
    const o = w.observations[res.slides[id][10]];
    return { ...tissueRow(), observationId: o.id, tissue: TISSUE_OF_ASSET[o.assetId], level: 'tissue' as const, structures: 'Células y matriz', functionText: 'Revestimiento o sostén', basis: 'observedFeature' as const, totalMag: String(oc * (o.objectiveX ?? 10)) };
  });
  if (res.slides.fxSK) {
    nb.muscle.skeletalObservationId = res.slides.fxSK[10];
    nb.muscle.skeletalGuess = 'skeletal';
    nb.muscle.skeletalNuclei = 'notResolved';
  }
  if (res.slides.fxCA) {
    nb.muscle.cardiacObservationId = res.slides.fxCA[10];
    nb.muscle.cardiacGuess = 'cardiac';
    nb.muscle.cardiacDiscs = 'notResolved';
    nb.muscle.cardiacBranching = 'visible';
  }
  nb.muscle.prepQuality = 'considered';
  const organism: Record<string, B10Notebook['inverts'][number]['organism']> = { fxSP: 'sponge', fxCO: 'coral', fxME: 'medusa', fxPL: 'planaria', fxFL: 'fluke', fxNM: 'nematode', fxCE: 'cestode', fxEW: 'earthworm' };
  nb.inverts = Object.keys(res.slides).filter((id) => organism[id]).map((id) => ({
    ...invertRow(), observationId: res.slides[id][10], organism: organism[id],
    organization: id === 'fxSP' ? 'cellular' as const : 'trueTissues' as const,
    symmetry: id === 'fxSP' ? 'none' as const : id === 'fxCO' || id === 'fxME' ? 'radial' as const : 'bilateral' as const,
    form: id === 'fxME' ? 'medusa' as const : id === 'fxCO' ? 'colony' as const : 'notApplicable' as const,
    segmented: id === 'fxEW' ? 'yes' as const : 'no' as const, trait: 'Rasgo visto en mi captura',
  }));
  nb.small = Object.entries(res.stereo).map(([id, cap]) => ({ observationId: cap, organism: id === 'stDaphnia' ? 'daphnia' as const : 'louse' as const, instrument: 'stereo' as const, stage: 'notDetermined' as const, motion: 'notEvaluable' as const, trait: 'Apéndices visibles' }));
  nb.zoo = [{ modelId: 'boneFish', groupName: 'Peces óseos', trait: 'Opérculo', comparedWith: 'cartFish', difference: 'Hendiduras a la vista' }];
  nb.birdsFunction = 'El pico ganchudo se relaciona con desgarrar; el ancho, con filtrar.';
  nb.skull = { horseTrait: 'Incisivos arriba y abajo con diastema largo', cowTrait: 'Rodete dentario sin incisivos superiores', dietInference: 'Mesas de molar anchas: moler vegetales' };
  nb.trackRows = [{ trackId: 'trackCow', justification: 'Dos marcas alargadas y una hendidura' }];
  nb.atlas = { conclusions: 'El atlas reúne mis capturas y rótulos, y distingue lo observado de lo inferido.', delivered: true };
  nb.closure = { notes: 'Mesa recogida' };
  for (const q of QUESTIONS_B10) nb.analysis[q] = ANSWER;
}

export function idealAttemptB10(seed = 2610, scenarios: B10Scenario[] = [], resume: (w: AnimalWorld) => AnimalWorld = (w) => w) {
  const w0 = worldB10({ seed, scenarios });
  const nb = emptyB10Notebook(`b10-${seed.toString(36)}-test`);
  const { w, res } = idealRouteB10(w0, resume);
  fillNotebookB10(w, nb, res);
  return { w, nb, res };
}

export const errKeysA = (w: AnimalWorld) => Object.keys(w.evidence).filter((k) => k.startsWith('err:'));
