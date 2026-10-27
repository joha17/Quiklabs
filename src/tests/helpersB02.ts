/**
 * Ruta del estudiante de la práctica B02 hecha SOLO con comandos: EPP e inspección, seis preparaciones frescas
 * (Elodea, papa + Lugol, tomate, chile, pera y frotis bucal con azul de metileno), cada una a 4X y 40X con el mismo
 * enfoque por búsqueda de B01, y cierre del puesto (hisopo a residuos biológicos, herramientas limpias).
 */
import { expect } from 'vitest';
import type { CellCommand } from '../simulation/cell-world/commands';
import type { CellWorld } from '../simulation/cell-world/types';
import { dispatchCell, runCellFor } from '../simulation/cell-world/world';
import { microscopeView } from '../simulation/optical-world/world';
import { BIO_WASTE, CLEAN_TRAY, PREP_SPOT, STAGE_SEAT, stageTopZCm } from '../simulation/optical-world/geometry';
import { PREP2_SPOT } from '../simulation/cell-world/geometry';
import { newPracticeB02World, type PracticeB02Options } from '../practices/practice-b02';
import type { B02Scenario } from '../practices/practice-b02/error-scenarios';
import { emptyB02Notebook, QUESTIONS_B02, type B02Notebook } from '../practices/practice-b02/notebook';
import type { CellKind } from '../simulation/specimens/thin-section';

export function worldB02(opts: Partial<PracticeB02Options> & { scenarios?: B02Scenario[] } = {}): CellWorld {
  return newPracticeB02World({ mode: 'PRACTICE', seed: 2202, ...opts });
}

export function cmdC(w: CellWorld, c: CellCommand, expectOk = true) {
  const r = dispatchCell(w, c);
  if (expectOk) expect(r.ok, `${c.type}: ${r.code ?? ''}`).toBe(true);
  return r;
}

export const runC = (w: CellWorld, s: number) => runCellFor(w, s);
const P = (x: number, y: number, z = 0) => ({ x, y, z, rotationRad: 0 });

export function placeC(w: CellWorld, id: string, support: string, at?: { x: number; y: number; z?: number }, expectOk = true) {
  const o = w.objects[id];
  return cmdC(w, { type: 'setPose', id, pose: P(at?.x ?? o.pose.x, at?.y ?? o.pose.y, at?.z ?? 0), support }, expectOk);
}

export function ppeB02(w: CellWorld) {
  for (const item of ['coat', 'shoes', 'hair', 'hands'] as const) cmdC(w, { type: 'setPPE', item, enabled: true });
  cmdC(w, { type: 'startWork' });
  for (const t of ['glassBin', 'bioWaste', 'trashBin']) cmdC(w, { type: 'inspect', target: t });
}

/** Portaobjetos al área de preparación (limpio si traía residuos). */
export function slideToPrep(w: CellWorld, slideId: string, area: 'prep' | 'prep2' = 'prep') {
  placeC(w, slideId, area, area === 'prep' ? PREP_SPOT : PREP2_SPOT);
  if (w.slides[slideId].dirty01 > 0.2) cmdC(w, { type: 'wipe', targetId: slideId, toolId: 'lp' });
}

/** Cubreobjetos desde un borde, lento, con la pinza limpia; luego se seca el borde. */
export function coverC(w: CellWorld, slideId: string, coverId: string, opts: { dx?: number; speed?: number } = {}) {
  cmdC(w, { type: 'wipe', targetId: 'fc', toolId: 'lp' });
  cmdC(w, { type: 'grabCover', coverId, toolId: 'fc' });
  cmdC(w, { type: 'setCoverTilt', coverId, angleDeg: 45 });
  cmdC(w, { type: 'lowerCover', coverId, slideId, speedCmS: opts.speed ?? 0.4, dxCm: opts.dx ?? 0, dyCm: 0 });
}

/** Corte fino con bisturí → tabla → pinza → portaobjetos (y herramientas limpias). */
export function cutMount(w: CellWorld, sourceId: string, slideId: string, opts: { thicknessMm?: number; lengthCm?: number; dx?: number } = {}) {
  cmdC(w, { type: 'cutSource', sourceId, toolId: 'sc', thicknessMm: opts.thicknessMm ?? 0.15, lengthCm: opts.lengthCm ?? 0.8 });
  cmdC(w, { type: 'pickSpecimen', toolId: 'fc', sourceId: 'board' });
  cmdC(w, { type: 'placeSpecimen', toolId: 'fc', targetId: slideId, dxCm: opts.dx ?? 0, dyCm: 0 });
  cmdC(w, { type: 'wipe', targetId: 'sc', toolId: 'lp' });
}

export function dropC(w: CellWorld, dispenserId: string, slideId: string, force01 = 0.5) {
  return cmdC(w, { type: 'squeezeDropper', dispenserId, targetId: slideId, force01, dxCm: 0, dyCm: 0 });
}

/** Elodea: hoja con pinza, gota de agua y cubreobjetos. */
export function elodeaMount(w: CellWorld, slideId: string, coverId: string) {
  slideToPrep(w, slideId);
  cmdC(w, { type: 'pickSpecimen', toolId: 'fc', sourceId: 'el' });
  cmdC(w, { type: 'placeSpecimen', toolId: 'fc', targetId: slideId, dxCm: 0, dyCm: 0 });
  dropC(w, 'dw', slideId);
  coverC(w, slideId, coverId);
}

/** Papa: raspado con espátula, Lugol y cubreobjetos; espera el contacto mínimo. */
export function potatoMount(w: CellWorld, slideId: string, coverId: string, opts: { stain?: string; waitS?: number } = {}) {
  slideToPrep(w, slideId);
  cmdC(w, { type: 'scrape', sourceId: 'pot', toolId: 'sp', distanceCm: 1.2, pressure01: 0.4 });
  cmdC(w, { type: 'placeSpecimen', toolId: 'sp', targetId: slideId, dxCm: 0, dyCm: 0 });
  cmdC(w, { type: 'wipe', targetId: 'sp', toolId: 'lp' });
  dropC(w, opts.stain ?? 'iod', slideId);
  coverC(w, slideId, coverId);
  runC(w, opts.waitS ?? 25);
}

/** Corte de fruto con agua (tomate, chile, zanahoria, pera). */
export function fruitMount(w: CellWorld, sourceId: string, slideId: string, coverId: string, stain = 'dw') {
  slideToPrep(w, slideId);
  cutMount(w, sourceId, slideId);
  dropC(w, stain, slideId);
  coverC(w, slideId, coverId);
}

/** Frotis bucal en el área animal: hisopo, extendido, colorante, cubreobjetos y el hisopo a residuos biológicos. */
export function buccalMount(w: CellWorld, slideId: string, coverId: string, opts: { stain?: string; swabId?: string } = {}) {
  const sw = opts.swabId ?? 'sw1';
  slideToPrep(w, slideId, 'prep2');
  placeC(w, sw, 'hand');
  cmdC(w, { type: 'swab', swabId: sw, sourceId: 'bucc', durationS: 4, pressure01: 0.5 });
  cmdC(w, { type: 'smear', swabId: sw, slideId, lengthCm: 1.6, pressure01: 0.4, dxCm: 0, dyCm: 0 });
  cmdC(w, { type: 'dispose', objectId: sw, containerId: 'bioWaste' });
  if (opts.stain !== 'none') dropC(w, opts.stain ?? 'mb', slideId);
  coverC(w, slideId, coverId);
}

const seat = () => ({ x: STAGE_SEAT.x, y: STAGE_SEAT.y, z: stageTopZCm(6) });

export function toStageC(w: CellWorld, id: string) {
  if (!w.microscope.clipOpen) cmdC(w, { type: 'openClip', open: true });
  placeC(w, id, 'stage', seat());
  cmdC(w, { type: 'openClip', open: false });
}

export function toObjectiveC(w: CellWorld, x: 4 | 10 | 40) {
  const target = { 4: 0, 10: 120, 40: 240 }[x];
  if (w.microscope.turretDeg !== target) cmdC(w, { type: 'turnTurret', deltaDeg: target - w.microscope.turretDeg });
}

export function focusC(w: CellWorld) {
  const obj = microscopeView(w).objectiveX ?? 4;
  if (obj === 4) {
    cmdC(w, { type: 'checkSide' });
    for (let i = 0; i < 80 && microscopeView(w).sharpness01 < 0.25; i++) cmdC(w, { type: 'turnCoarse', deltaTurns: 0.1 });
  }
  let best = microscopeView(w).sharpness01;
  for (const dir of [1, -1]) {
    for (let i = 0; i < 40; i++) {
      cmdC(w, { type: 'turnFine', deltaTurns: dir * 0.05 });
      const s = microscopeView(w).sharpness01;
      if (s + 1e-9 < best) {
        cmdC(w, { type: 'turnFine', deltaTurns: -dir * 0.05 });
        break;
      }
      best = s;
    }
  }
}

export function captureC(w: CellWorld, expectOk = true) {
  if (w.view.instrument !== 'compound') cmdC(w, { type: 'observe', instrument: 'compound', open: true });
  runC(w, 1.6);
  return cmdC(w, { type: 'captureObservation', instrument: 'compound' }, expectOk).id!;
}

export function removeFromStageC(w: CellWorld, id: string, support = 'cleanTray', at: { x: number; y: number; z?: number } = CLEAN_TRAY) {
  if (w.view.instrument) cmdC(w, { type: 'observe', instrument: 'compound', open: false });
  toObjectiveC(w, 4);
  cmdC(w, { type: 'turnCoarse', deltaTurns: -w.microscope.coarseTurns });
  cmdC(w, { type: 'turnFine', deltaTurns: -w.microscope.fineTurns });
  cmdC(w, { type: 'openClip', open: true });
  placeC(w, id, support, at);
}

export function microscopeOn(w: CellWorld) {
  cmdC(w, { type: 'setPower', device: 'microscope', on: true });
  if (w.microscope.light01 < 0.2) cmdC(w, { type: 'setIllumination', device: 'microscope', value01: 0.4 });
}

/** Observación 4X → 10X → 40X de la lámina en la platina; devuelve las capturas por objetivo. */
export function observeSlide(w: CellWorld, slideId: string, objectives: Array<4 | 10 | 40> = [4, 40]) {
  const out: Record<number, string> = {};
  toObjectiveC(w, 4);
  toStageC(w, slideId);
  focusC(w);
  for (const x of [4, 10, 40] as const) {
    if (x !== 4) {
      toObjectiveC(w, x);
      focusC(w);
    }
    cmdC(w, { type: 'setDiaphragm', value01: x === 40 ? 0.6 : 0.5 });
    if (objectives.includes(x)) out[x] = captureC(w);
  }
  cmdC(w, { type: 'setDiaphragm', value01: 0.5 });
  removeFromStageC(w, slideId);
  return out;
}

export interface IdealResB02 {
  elodea: Record<number, string>;
  potato: Record<number, string>;
  tomato: Record<number, string>;
  pepper: Record<number, string>;
  pear: Record<number, string>;
  buccal: Record<number, string>;
}

export function idealRouteB02(w0: CellWorld, resume: (w: CellWorld) => CellWorld = (w) => w) {
  let w = w0;
  ppeB02(w);
  microscopeOn(w);
  const res = {} as IdealResB02;
  const steps: Array<[keyof IdealResB02, string, string, (w: CellWorld) => void]> = [
    ['elodea', 'sl1', 'cv1', (x) => elodeaMount(x, 'sl1', 'cv1')],
    ['potato', 'sl2', 'cv2', (x) => potatoMount(x, 'sl2', 'cv2')],
    ['tomato', 'sl3', 'cv3', (x) => fruitMount(x, 'tom', 'sl3', 'cv3')],
    ['pepper', 'sl4', 'cv4', (x) => fruitMount(x, 'pep', 'sl4', 'cv4')],
    ['pear', 'sl5', 'cv5', (x) => fruitMount(x, 'pea', 'sl5', 'cv5')],
    ['buccal', 'sl6', 'cv6', (x) => buccalMount(x, 'sl6', 'cv6')],
  ];
  for (const [key, slide, , prep] of steps) {
    prep(w);
    w = resume(w);
    res[key] = observeSlide(w, slide);
  }
  // Controles del docente: se observan si están y van a la bandeja de limpieza.
  for (const id of Object.keys(w.slides).filter((s) => s.startsWith('ctl'))) placeC(w, id, 'cleanTray', CLEAN_TRAY);
  cmdC(w, { type: 'wipe', targetId: 'fc', toolId: 'lp' });
  cmdC(w, { type: 'setPower', device: 'microscope', on: false });
  cmdC(w, { type: 'closeBench' });
  return { w, res };
}

const ANSWER = 'Respuesta argumentada con mis capturas propias, separando lo observado, lo inferido y lo no demostrable.';

export function fillNotebookB02(w: CellWorld, nb: B02Notebook, res: IdealResB02) {
  const oc = w.params.microscope.ocularX;
  nb.hypotheses = [
    { material: 'potato', expected: 'amyloplast', reason: 'Tubérculo de reserva' },
    { material: 'tomato', expected: 'chromoplast', reason: 'Fruto rojo pigmentado' },
    { material: 'elodea', expected: 'chloroplast', reason: 'Hoja fotosintética' },
  ];
  nb.prep = [
    { specimen: 'elodea', technique: 'leaf', reagent: 'water', cover: 'clean', state: 'Montaje sin burbujas' },
    { specimen: 'potato', technique: 'scrape', reagent: 'lugol', cover: 'clean', state: 'Raspado fino' },
    { specimen: 'tomato', technique: 'cut', reagent: 'water', cover: 'clean', state: 'Corte delgado' },
    { specimen: 'buccal', technique: 'smear', reagent: 'methylene-blue', cover: 'clean', state: 'Extendido fino' },
  ];
  const row = (kind: CellKind, id: string, plastid: B02Notebook['atlas'][number]['plastid'], color: string) => {
    const o = w.observations[id];
    return { observationId: id, specimen: kind, totalMag: String(oc * (o.objectiveX ?? 4)), plastid, color, structures: o.visibleRegionIds.filter((s) => s !== 'nucleus').slice(0, 2) };
  };
  nb.atlas = [row('tomato', res.tomato[40], 'chromoplast', 'rojo'), row('pepper', res.pepper[40], 'chromoplast', 'amarillo'), row('elodea', res.elodea[40], 'chloroplast', 'verde'), row('potato', res.potato[40], 'amyloplast', 'azul oscuro con Lugol')];
  const po = w.observations[res.potato[40]];
  nb.potato = { observationId: po.id, stained: 'yes', grains: po.visibleRegionIds.includes('starchGrains') ? 'visible' : 'notVisible', interpretation: 'El Lugol tiñe los gránulos de almidón' };
  nb.sclereids = { observationId: res.pear[40], fruit: 'pear', region: 'Pulpa cercana al corazón', walls: 'thick', eosinShows: 'notUsed', wallCause: 'secondaryWall' };
  const bo = w.observations[res.buccal[40]];
  nb.buccal = { observationId: bo.id, stain: 'methylene-blue', smear: 'Extendido en una dirección', structures: bo.visibleRegionIds.filter((s) => ['cellBorder', 'nucleus', 'cytoplasm'].includes(s)) };
  const eo = w.observations[res.elodea[40]];
  nb.elodea = { observationId: eo.id, totalMag: String(oc * 40), structures: eo.visibleRegionIds.filter((s) => s === 'chloroplasts' || s === 'cellWall'), motion: 'needsVideo' };
  nb.comparison = { plantAnimal: 'La célula vegetal tiene pared y plastidios; la bucal no', plastids: 'Cloroplastos verdes, cromoplastos con pigmento, amiloplastos con almidón', limits: 'La membrana plasmática no se resuelve a campo claro' };
  nb.log = { action: 'Corte de tomate', failure: 'Ninguna', correction: '—', consequence: 'Capturas válidas a 4X y 40X' };
  nb.figures = [{ observationId: res.tomato[40], specimen: 'tomato', caption: 'Figura 1. Cromoplastos de tomate, 400X' }, { observationId: res.elodea[40], specimen: 'elodea', caption: 'Figura 2. Cloroplastos de Elodea, 400X' }];
  for (const q of QUESTIONS_B02) nb.analysis[q] = ANSWER;
}

export function idealAttemptB02(seed = 2202, scenarios: B02Scenario[] = [], resume: (w: CellWorld) => CellWorld = (w) => w) {
  const w0 = worldB02({ seed, scenarios });
  const nb = emptyB02Notebook(`b02-${seed.toString(36)}-test`);
  const { w, res } = idealRouteB02(w0, resume);
  fillNotebookB02(w, nb, res);
  return { w, nb, res };
}

export const errKeys = (w: CellWorld) => Object.keys(w.evidence).filter((k) => k.startsWith('err:'));

export { PREP_SPOT, PREP2_SPOT, CLEAN_TRAY, BIO_WASTE };
