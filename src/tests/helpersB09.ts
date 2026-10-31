/**
 * Ruta del estudiante de la práctica B09 hecha SOLO con comandos: EPP, morfología externa de ambas plántulas, cortes de
 * apio y pera, reacción de Wiesner en la zona ventilada, láminas de raíz, tallo y hoja, marcas, una medición y el cierre.
 */
import { expect } from 'vitest';
import type { PlantCommand } from '../simulation/plant-world/commands';
import type { CutPlane, PlantSpecimenId, PlantWorld } from '../simulation/plant-world/types';
import { dispatchPlant, runPlantFor } from '../simulation/plant-world/world';
import { EXTERNAL_REGIONS, SOURCE_REGION } from '../simulation/plant-world/model';
import { microscopeView } from '../simulation/optical-world/world';
import { CLEAN_TRAY, PREP_SPOT, STAGE_SEAT, caseSlotIndex, caseSlotPos, stageTopZCm } from '../simulation/optical-world/geometry';
import { PREP2_SPOT } from '../simulation/cell-world/geometry';
import { assetById, type StructureId } from '../simulation/specimens/assets';
import type { MarkStructure } from '../simulation/div-world/types';
import { newPracticeB09World, type PracticeB09Options } from '../practices/practice-b09';
import type { B09Scenario } from '../practices/practice-b09/error-scenarios';
import { emptyB09Notebook, QUESTIONS_B09, type B09Notebook } from '../practices/practice-b09/notebook';

export function worldB09(opts: Partial<PracticeB09Options> & { scenarios?: B09Scenario[] } = {}): PlantWorld {
  return newPracticeB09World({ mode: 'PRACTICE', seed: 2609, ...opts });
}

export function cmdP(w: PlantWorld, c: PlantCommand, expectOk = true) {
  const r = dispatchPlant(w, c);
  if (expectOk) expect(r.ok, `${c.type}: ${r.code ?? ''}`).toBe(true);
  return r;
}

export const runP = (w: PlantWorld, s: number) => runPlantFor(w, s);
const P = (x: number, y: number, z = 0) => ({ x, y, z, rotationRad: 0 });

export function placeP(w: PlantWorld, id: string, support: string, at?: { x: number; y: number; z?: number }, expectOk = true) {
  const o = w.objects[id];
  return cmdP(w, { type: 'setPose', id, pose: P(at?.x ?? o.pose.x, at?.y ?? o.pose.y, at?.z ?? 0), support }, expectOk);
}

export function ppeB09(w: PlantWorld) {
  for (const item of w.params.ppeRequired ?? []) cmdP(w, { type: 'setPPE', item, enabled: true });
  cmdP(w, { type: 'startWork' });
  for (const t of ['glassBin', 'bioWaste', 'trashBin', 'mic', 'case']) cmdP(w, { type: 'inspect', target: t });
}

/** Gira la plántula y rotula todas sus zonas con el órgano correcto. */
export function externalRoute(w: PlantWorld, specimen: PlantSpecimenId) {
  cmdP(w, { type: 'rotatePlant', specimen, deg: 200 });
  for (const [regionId, part] of Object.entries(EXTERNAL_REGIONS[specimen])) cmdP(w, { type: 'labelExternal', specimen, regionId, part });
}

export function slideToZone(w: PlantWorld, slideId: string, area: 'prep' | 'prep2' = 'prep') {
  placeP(w, slideId, area, area === 'prep' ? PREP_SPOT : PREP2_SPOT);
  if (w.slides[slideId].dirty01 > 0.2) cmdP(w, { type: 'wipe', targetId: slideId, toolId: 'lp' });
}

export interface CutOpts { plane?: CutPlane; thicknessUm?: number; region?: string; pressure01?: number; held?: boolean; handInPath?: boolean; lengthCm?: number }

/** Sujeta la fuente y corta con el bisturí limpio. */
export function cutP(w: PlantWorld, sourceId: string, o: CutOpts = {}, expectOk = true) {
  cmdP(w, { type: 'wipe', targetId: 'sc', toolId: 'lp' });
  if (o.held !== false) cmdP(w, { type: 'holdSource', sourceId, hold: true });
  return cmdP(w, {
    type: 'cutSection', sourceId, plane: o.plane ?? 'transverse', thicknessUm: o.thicknessUm ?? 80, lengthCm: o.lengthCm ?? 0.8,
    region: o.region ?? SOURCE_REGION[sourceId].region, pressure01: o.pressure01 ?? 0.3, ...(o.handInPath ? { handInPath: true } : {}),
  }, expectOk);
}

/** Lleva la sección de la tabla al portaobjetos con la pinza limpia. */
export function transfer(w: PlantWorld, slideId: string, dxCm = 0) {
  cmdP(w, { type: 'wipe', targetId: 'fc', toolId: 'lp' });
  cmdP(w, { type: 'pickSpecimen', toolId: 'fc', sourceId: 'board' });
  cmdP(w, { type: 'placeSpecimen', toolId: 'fc', targetId: slideId, dxCm, dyCm: 0 });
}

export function dropP(w: PlantWorld, dispenserId: string, slideId: string, force01 = 0.5, expectOk = true) {
  return cmdP(w, { type: 'squeezeDropper', dispenserId, targetId: slideId, force01, dxCm: 0, dyCm: 0 }, expectOk);
}

export function coverP(w: PlantWorld, slideId: string, coverId: string, opts: { speed?: number; angle?: number } = {}) {
  cmdP(w, { type: 'wipe', targetId: 'fc', toolId: 'lp' });
  cmdP(w, { type: 'grabCover', coverId, toolId: 'fc' });
  cmdP(w, { type: 'setCoverTilt', coverId, angleDeg: opts.angle ?? 45 });
  return cmdP(w, { type: 'lowerCover', coverId, slideId, speedCmS: opts.speed ?? 0.4, dxCm: 0, dyCm: 0 });
}

/** Sección fresca en agua: corte, transferencia, gota y cubreobjetos. */
export function waterMount(w: PlantWorld, sourceId: string, slideId: string, coverId: string, cut: CutOpts = {}) {
  slideToZone(w, slideId);
  cutP(w, sourceId, cut);
  transfer(w, slideId);
  dropP(w, 'dw', slideId);
  coverP(w, slideId, coverId);
}

/** Wiesner en la zona ventilada: floroglucinol, ácido, 60 s de contacto y cubreobjetos. */
export function wiesnerMount(w: PlantWorld, sourceId: string, slideId: string, coverId: string, contactS = 60) {
  slideToZone(w, slideId, 'prep2');
  cutP(w, sourceId);
  transfer(w, slideId);
  dropP(w, 'flo', slideId);
  dropP(w, 'hcl', slideId);
  runP(w, contactS);
  coverP(w, slideId, coverId);
}

export function microscopeOnP(w: PlantWorld) {
  cmdP(w, { type: 'setPower', device: 'microscope', on: true });
  if (w.microscope.light01 < 0.2) cmdP(w, { type: 'setIllumination', device: 'microscope', value01: 0.4 });
}

const seat = () => ({ x: STAGE_SEAT.x, y: STAGE_SEAT.y, z: stageTopZCm(6) });

export function toStageP(w: PlantWorld, id: string) {
  if (!w.microscope.clipOpen) cmdP(w, { type: 'openClip', open: true });
  placeP(w, id, 'stage', seat());
  cmdP(w, { type: 'openClip', open: false });
}

export function toObjectiveP(w: PlantWorld, x: 4 | 10 | 40 | 100) {
  if (microscopeView(w).objectiveX !== x) cmdP(w, { type: 'selectObjective', objectiveX: x });
}

export function focusP(w: PlantWorld) {
  const obj = microscopeView(w).objectiveX ?? 4;
  if (obj === 4) {
    cmdP(w, { type: 'checkSide' });
    for (let i = 0; i < 80 && microscopeView(w).sharpness01 < 0.25; i++) cmdP(w, { type: 'turnCoarse', deltaTurns: 0.1 });
  }
  let best = microscopeView(w).sharpness01;
  for (const dir of [1, -1]) {
    for (let i = 0; i < 60; i++) {
      cmdP(w, { type: 'turnFine', deltaTurns: dir * 0.02 });
      const s = microscopeView(w).sharpness01;
      if (s + 1e-9 < best) {
        cmdP(w, { type: 'turnFine', deltaTurns: -dir * 0.02 });
        break;
      }
      best = s;
    }
  }
}

export function captureP(w: PlantWorld, expectOk = true) {
  if (w.view.instrument !== 'compound') cmdP(w, { type: 'observe', instrument: 'compound', open: true });
  runP(w, 1.6);
  return cmdP(w, { type: 'captureObservation', instrument: 'compound' }, expectOk).id!;
}

export function removeFromStageP(w: PlantWorld, id: string, support = 'cleanTray', at: { x: number; y: number; z?: number } = CLEAN_TRAY) {
  if (w.view.instrument) cmdP(w, { type: 'observe', instrument: 'compound', open: false });
  toObjectiveP(w, 4);
  cmdP(w, { type: 'turnCoarse', deltaTurns: -w.microscope.coarseTurns });
  cmdP(w, { type: 'turnFine', deltaTurns: -w.microscope.fineTurns });
  cmdP(w, { type: 'openClip', open: true });
  placeP(w, id, support, at);
}

/** Observación 4X → 10X → 40X de la lámina (sin retirarla); capturas por objetivo. */
export function observeOnStageP(w: PlantWorld, slideId: string, objectives: Array<4 | 10 | 40> = [4, 10, 40]) {
  const out: Record<number, string> = {};
  toObjectiveP(w, 4);
  toStageP(w, slideId);
  focusP(w);
  // Mirar por el ocular a 4X: es lo que localiza la región antes de subir de aumento.
  cmdP(w, { type: 'observe', instrument: 'compound', open: true });
  runP(w, 1);
  for (const x of [4, 10, 40] as const) {
    if (x !== 4) {
      toObjectiveP(w, x);
      focusP(w);
    }
    cmdP(w, { type: 'setDiaphragm', value01: x === 40 ? 0.6 : 0.5 });
    if (objectives.includes(x)) out[x] = captureP(w);
  }
  cmdP(w, { type: 'setDiaphragm', value01: 0.5 });
  return out;
}

export function fixedRoute(w: PlantWorld, id: string, objectives: Array<4 | 10 | 40> = [4, 10, 40]) {
  if (!w.slideCase.open) cmdP(w, { type: 'openSlideCase', open: true });
  placeP(w, id, 'hand');
  const out = observeOnStageP(w, id, objectives);
  const home = w.slideCase.home[id];
  removeFromStageP(w, id, `case:${home}`, caseSlotPos(caseSlotIndex(home)));
  return out;
}

/** Centro (u, v en la captura) de la primera región de la estructura que cae dentro del campo. */
export function centerOfP(w: PlantWorld, obsId: string, structure: StructureId): [number, number] | null {
  const o = w.observations[obsId];
  const a = assetById(o.assetId);
  if (!a) return null;
  const [cx, cy, vw, vh] = o.normalizedViewport;
  for (const an of a.annotations.filter((x) => x.structureId === structure)) {
    const p = an.polygonNormalized;
    const ux = p.reduce((s, q) => s + q[0], 0) / p.length;
    const uy = p.reduce((s, q) => s + q[1], 0) / p.length;
    const u = 0.5 + (ux - cx) / vw;
    const v = 0.5 + (uy - cy) / vh;
    if (u > 0.02 && u < 0.98 && v > 0.02 && v < 0.98) return [u, v];
  }
  return null;
}

export function markP(w: PlantWorld, obsId: string, structure: MarkStructure, expectOk = true) {
  const pt = centerOfP(w, obsId, structure as StructureId) ?? [0.5, 0.5];
  return cmdP(w, { type: 'markRegion', observationId: obsId, structure, u: pt[0], v: pt[1] }, expectOk);
}

export interface IdealResB09 {
  celery: Record<number, string>;
  celeryW: Record<number, string>;
  pear: Record<number, string>;
  slides: Record<string, Record<number, string>>;
  stereo: string[];
  measurement: string | null;
}

export function idealRouteB09(w0: PlantWorld, resume: (w: PlantWorld) => PlantWorld = (w) => w) {
  let w = w0;
  ppeB09(w);
  externalRoute(w, 'bean');
  externalRoute(w, 'maize');
  microscopeOnP(w);
  const res = { slides: {}, stereo: [], measurement: null } as unknown as IdealResB09;
  // C — preparaciones frescas: control en agua y la misma serie con Wiesner.
  waterMount(w, 'cel', 'sl1', 'cv1');
  w = resume(w);
  res.celery = observeOnStageP(w, 'sl1', [10, 40]);
  removeFromStageP(w, 'sl1');
  if (w.plant.wiesnerAssigned) {
    wiesnerMount(w, 'cel', 'sl2', 'cv2');
    w = resume(w);
    res.celeryW = observeOnStageP(w, 'sl2', [10, 40]);
    removeFromStageP(w, 'sl2');
  }
  waterMount(w, 'pea', 'sl3', 'cv3');
  res.pear = observeOnStageP(w, 'sl3', [10]);
  removeFromStageP(w, 'sl3');
  // D y E — láminas permanentes con 4X, 10X y 40X.
  for (const id of w.plant.requiredSlides) {
    res.slides[id] = fixedRoute(w, id);
    w = resume(w);
  }
  cmdP(w, { type: 'openSlideCase', open: false });
  const mk = (id: string, x: number, s: MarkStructure) => markP(w, res.slides[id][x], s);
  mk('fxRT', 10, 'rootCap' as MarkStructure);
  mk('fxRE', 10, 'stele' as MarkStructure);
  mk('fxRM', 10, 'xylem' as MarkStructure);
  mk('fxSE', 10, 'vascularBundle' as MarkStructure);
  mk('fxSM', 10, 'vascularBundle' as MarkStructure);
  mk('fxLE', 10, 'palisade' as MarkStructure);
  mk('fxLM', 10, 'vascularBundle' as MarkStructure);
  if (w.div.scale.available) res.measurement = cmdP(w, { type: 'measure', observationId: res.slides.fxSE[40], ax: 300, ay: 500, bx: 700, by: 500, scale: 'calibration' }).id ?? null;
  // F — cierre.
  for (const id of ['sl1', 'sl2', 'sl3']) if (w.mounts[id]?.cell?.zones.length) cmdP(w, { type: 'dispose', objectId: id, containerId: 'bioWaste' });
  for (const id of Object.keys(w.slides).filter((s) => s.startsWith('ctl'))) placeP(w, id, 'cleanTray', CLEAN_TRAY);
  for (const t of ['fc', 'sc']) cmdP(w, { type: 'wipe', targetId: t, toolId: 'lp' });
  cmdP(w, { type: 'setPower', device: 'microscope', on: false });
  cmdP(w, { type: 'closeBench' });
  return { w, res };
}

const ANSWER = 'Respuesta argumentada con mis capturas propias, separando lo observado, lo inferido y lo que no puedo demostrar.';

export function fillNotebookB09(w: PlantWorld, nb: B09Notebook, res: IdealResB09) {
  const oc = w.params.microscope.ocularX;
  nb.prereport = { hypothesis: 'Los haces cambian de disposición entre raíz, tallo y hoja', instruments: 'Microscopio, estereoscopio y bisturí', precautions: 'Ácido solo en la zona ventilada' };
  nb.external = [
    { specimen: 'bean', taxon: 'Phaseolus vulgaris, invernadero', rootPattern: 'taproot', venation: 'reticulate', petiole: 'present', stereoObservationId: res.stereo[0] ?? null },
    { specimen: 'maize', taxon: 'Zea mays, invernadero', rootPattern: 'fibrous', venation: 'parallel', petiole: 'absent', stereoObservationId: res.stereo[1] ?? null },
  ];
  nb.sections = [{ observationId: res.celery[10], organ: 'celery', plane: 'transverse', thicknessUm: '80', treatment: 'water', cover: 'Ángulo 45°', result: 'Haces visibles' }];
  if (res.celeryW) nb.sections.push({ observationId: res.celeryW[10], organ: 'celery', plane: 'transverse', thicknessUm: '80', treatment: 'wiesner', cover: 'Ángulo 45°', result: 'Paredes rojas' });
  nb.stain = { observationId: res.celeryW?.[10] ?? null, controlObservationId: res.celery[10], redMeans: 'lignifiedWall', collenchymaLignified: 'notDiagnosed', treatmentOfCapture: res.celeryW ? 'wiesner' : '', limits: 'No cuantifica lignina' };
  const base = { pith: 'visible', endodermis: 'notResolved', cambium: 'notResolved', casparian: 'notResolved', basis: 'observedFeature' } as const;
  nb.roots = [
    { ...base, observationId: res.slides.fxRE[10], group: 'eudicot', plane: 'transverse', xylemPattern: 'star', pith: 'absent' },
    { ...base, observationId: res.slides.fxRM[10], group: 'monocot', plane: 'transverse', xylemPattern: 'ring' },
    { ...base, observationId: res.slides.fxRT[10], group: 'monocot', plane: 'longitudinal', xylemPattern: 'notResolved', pith: 'notResolved' },
  ];
  nb.stems = [
    { observationId: res.slides.fxSE[10], group: 'eudicot', bundles: 'ring', pith: 'visible', cambium: 'notResolved', collenchyma: 'visible', xylemSide: 'inner', basis: 'observedFeature' },
    { observationId: res.slides.fxSM[10], group: 'monocot', bundles: 'scattered', pith: 'absent', cambium: 'absent', collenchyma: 'notResolved', xylemSide: 'inner', basis: 'observedFeature' },
  ];
  nb.leaves = [
    { observationId: res.slides.fxLE[10], group: 'eudicot', mesophyll: 'dorsiventral', stoma: 'visible', orientationChecked: true, xylemFace: 'adaxial' },
    { observationId: res.slides.fxLM[10], group: 'monocot', mesophyll: 'undifferentiated', stoma: 'notResolved', orientationChecked: true, xylemFace: 'adaxial' },
  ];
  nb.wood = { observationId: res.slides.fxW?.[4] ?? null, ringCount: res.slides.fxW ? '4' : '', ageYears: '', limit: 'Sin datos ambientales no equivalen a años' };
  const m = res.measurement ? w.div.measurements.find((x) => x.id === res.measurement)! : null;
  nb.measures = m
    ? [{ observationId: m.observationId, measurementId: m.id, structure: 'Haz vascular', pixels: String(m.rawPixelDistance), umPerPx: String(m.umPerPx), lengthUm: String(m.lengthUm), uncertaintyUm: String(m.uncertaintyUm), unit: 'um', totalMag: String(oc * 40), usedFieldAsCell: false }]
    : [{ observationId: res.slides.fxSE[40], measurementId: null, structure: 'Haz (cualitativo)', pixels: '', umPerPx: '', lengthUm: '', uncertaintyUm: '', unit: '', totalMag: String(oc * 40), usedFieldAsCell: false }];
  nb.matrix = [
    { organ: 'root', system: 'vascular', evidenceObservationId: res.slides.fxRE[10], observation: 'Xilema central', inference: 'Conducción' },
    { organ: 'stem', system: 'vascular', evidenceObservationId: res.slides.fxSE[10], observation: 'Haces en anillo', inference: 'Sostén y conducción' },
    { organ: 'leaf', system: 'ground', evidenceObservationId: res.slides.fxLE[10], observation: 'Empalizada y esponjoso', inference: 'Fotosíntesis' },
  ];
  nb.closure = { notes: 'Mesa recogida' };
  for (const q of QUESTIONS_B09) nb.analysis[q] = ANSWER;
}

export function idealAttemptB09(seed = 2609, scenarios: B09Scenario[] = [], resume: (w: PlantWorld) => PlantWorld = (w) => w) {
  const w0 = worldB09({ seed, scenarios });
  const nb = emptyB09Notebook(`b09-${seed.toString(36)}-test`);
  const { w, res } = idealRouteB09(w0, resume);
  fillNotebookB09(w, nb, res);
  return { w, nb, res };
}

export const errKeysP = (w: PlantWorld) => Object.keys(w.evidence).filter((k) => k.startsWith('err:'));
