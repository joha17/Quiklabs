/**
 * Ruta del estudiante de la práctica B06 hecha SOLO con comandos: EPP, fichas del reto, epidermis de Tradescantia,
 * frotis bucal con azul de metileno, Paramecium con metilcelulosa, Euglena, Elodea, láminas permanentes (bacterias y
 * sangre; 100X con aceite si hay módulo de inmersión), marcas de región, una medición calibrada y el cierre.
 */
import { expect } from 'vitest';
import type { DivCommand } from '../simulation/div-world/commands';
import type { DivWorld } from '../simulation/div-world/types';
import { dispatchDiv, runDivFor } from '../simulation/div-world/world';
import { microscopeView } from '../simulation/optical-world/world';
import { BIO_WASTE, CLEAN_TRAY, PREP_SPOT, STAGE_SEAT, caseSlotIndex, caseSlotPos, stageTopZCm } from '../simulation/optical-world/geometry';
import { PREP2_SPOT } from '../simulation/cell-world/geometry';
import { newPracticeB06World, type PracticeB06Options } from '../practices/practice-b06';
import type { B06Scenario } from '../practices/practice-b06/error-scenarios';
import type { MarkStructure } from '../simulation/div-world/types';
import { DIV_SPECIMENS } from '../simulation/div-world/types';
import { assetById } from '../simulation/specimens/assets';
import type { DivSpecimen } from '../simulation/div-world/types';
import { emptyB06Notebook, QUESTIONS_B06, type B06Notebook } from '../practices/practice-b06/notebook';

export function worldB06(opts: Partial<PracticeB06Options> & { scenarios?: B06Scenario[] } = {}): DivWorld {
  return newPracticeB06World({ mode: 'PRACTICE', seed: 2606, ...opts });
}

export function cmdD(w: DivWorld, c: DivCommand, expectOk = true) {
  const r = dispatchDiv(w, c);
  if (expectOk) expect(r.ok, `${c.type}: ${r.code ?? ''}`).toBe(true);
  return r;
}

export const runD = (w: DivWorld, s: number) => runDivFor(w, s);
const P = (x: number, y: number, z = 0) => ({ x, y, z, rotationRad: 0 });

export function placeD(w: DivWorld, id: string, support: string, at?: { x: number; y: number; z?: number }, expectOk = true) {
  const o = w.objects[id];
  return cmdD(w, { type: 'setPose', id, pose: P(at?.x ?? o.pose.x, at?.y ?? o.pose.y, at?.z ?? 0), support }, expectOk);
}

export function ppeB06(w: DivWorld) {
  for (const item of ['coat', 'shoes', 'hair', 'hands'] as const) cmdD(w, { type: 'setPPE', item, enabled: true });
  cmdD(w, { type: 'startWork' });
  for (const t of ['glassBin', 'bioWaste', 'trashBin', 'mic']) cmdD(w, { type: 'inspect', target: t });
}

/** Reto de clasificación: siete fichas (y la cianobacteria si está asignada). */
export function classifyAll(w: DivWorld) {
  for (const s of DIV_SPECIMENS) cmdD(w, { type: 'classifySample', specimen: s, choice: s === 'bacillus' || s === 'blood' ? 'fixed' : 'fresh' });
}

/** Portaobjetos al área de preparación (limpio si traía residuos). */
export function slideToPrep(w: DivWorld, slideId: string, area: 'prep' | 'prep2' = 'prep') {
  placeD(w, slideId, area, area === 'prep' ? PREP_SPOT : PREP2_SPOT);
  if (w.slides[slideId].dirty01 > 0.2) cmdD(w, { type: 'wipe', targetId: slideId, toolId: 'lp' });
}

export function coverD(w: DivWorld, slideId: string, coverId: string, opts: { dx?: number; speed?: number; angle?: number } = {}) {
  cmdD(w, { type: 'wipe', targetId: 'fc', toolId: 'lp' });
  cmdD(w, { type: 'grabCover', coverId, toolId: 'fc' });
  cmdD(w, { type: 'setCoverTilt', coverId, angleDeg: opts.angle ?? 45 });
  return cmdD(w, { type: 'lowerCover', coverId, slideId, speedCmS: opts.speed ?? 0.4, dxCm: opts.dx ?? 0, dyCm: 0 });
}

export function dropD(w: DivWorld, dispenserId: string, slideId: string, force01 = 0.5, expectOk = true) {
  return cmdD(w, { type: 'squeezeDropper', dispenserId, targetId: slideId, force01, dxCm: 0, dyCm: 0 }, expectOk);
}

/** Elodea: hoja con pinza, gota de agua y cubreobjetos. */
export function elodeaMount(w: DivWorld, slideId: string, coverId: string) {
  slideToPrep(w, slideId);
  cmdD(w, { type: 'pickSpecimen', toolId: 'fc', sourceId: 'el' });
  cmdD(w, { type: 'placeSpecimen', toolId: 'fc', targetId: slideId, dxCm: 0, dyCm: 0 });
  dropD(w, 'dw', slideId);
  coverD(w, slideId, coverId);
}

/** Tradescantia: epidermis separada con pinza, gota de agua y cubreobjetos. */
export function tradesMount(w: DivWorld, slideId: string, coverId: string, opts: { thicknessMm?: number } = {}) {
  slideToPrep(w, slideId);
  cmdD(w, { type: 'peelEpidermis', sourceId: 'tra', toolId: 'fc', thicknessMm: opts.thicknessMm ?? 0.12, lengthCm: 0.8 });
  cmdD(w, { type: 'placeSpecimen', toolId: 'fc', targetId: slideId, dxCm: 0, dyCm: 0 });
  dropD(w, 'dw', slideId);
  coverD(w, slideId, coverId);
}

/** Protista: gota de cultivo (con metilcelulosa si se pide), etiqueta y cubreobjetos. */
export function cultureMount(w: DivWorld, kind: 'paramecium' | 'euglena', slideId: string, coverId: string, opts: { mc?: boolean; label?: string } = {}) {
  slideToPrep(w, slideId);
  dropD(w, kind === 'paramecium' ? 'cuP' : 'cuE', slideId);
  if (opts.mc) dropD(w, 'mc', slideId);
  cmdD(w, { type: 'labelSlide', slideId, label: opts.label ?? kind });
  coverD(w, slideId, coverId);
}

/** Frotis bucal en el área animal: hisopo, extendido, azul de metileno y cubreobjetos. */
export function buccalMount(w: DivWorld, slideId: string, coverId: string, opts: { stain?: string; swabId?: string; lengthCm?: number } = {}) {
  const sw = opts.swabId ?? 'sw1';
  slideToPrep(w, slideId, 'prep2');
  placeD(w, sw, 'hand');
  cmdD(w, { type: 'swab', swabId: sw, sourceId: 'bucc', durationS: 4, pressure01: 0.5 });
  cmdD(w, { type: 'smear', swabId: sw, slideId, lengthCm: opts.lengthCm ?? 1.6, pressure01: 0.4, dxCm: 0, dyCm: 0 });
  cmdD(w, { type: 'dispose', objectId: sw, containerId: 'bioWaste' });
  if (opts.stain !== 'none') dropD(w, opts.stain ?? 'mb', slideId);
  coverD(w, slideId, coverId);
}

const seat = () => ({ x: STAGE_SEAT.x, y: STAGE_SEAT.y, z: stageTopZCm(6) });

export function toStageD(w: DivWorld, id: string) {
  if (!w.microscope.clipOpen) cmdD(w, { type: 'openClip', open: true });
  placeD(w, id, 'stage', seat());
  cmdD(w, { type: 'openClip', open: false });
}

export function toObjectiveD(w: DivWorld, x: 4 | 10 | 40 | 100) {
  if (microscopeView(w).objectiveX !== x) cmdD(w, { type: 'selectObjective', objectiveX: x });
}

export function focusD(w: DivWorld) {
  const obj = microscopeView(w).objectiveX ?? 4;
  if (obj === 4) {
    cmdD(w, { type: 'checkSide' });
    for (let i = 0; i < 80 && microscopeView(w).sharpness01 < 0.25; i++) cmdD(w, { type: 'turnCoarse', deltaTurns: 0.1 });
  }
  let best = microscopeView(w).sharpness01;
  for (const dir of [1, -1]) {
    for (let i = 0; i < 60; i++) {
      cmdD(w, { type: 'turnFine', deltaTurns: dir * 0.02 });
      const s = microscopeView(w).sharpness01;
      if (s + 1e-9 < best) {
        cmdD(w, { type: 'turnFine', deltaTurns: -dir * 0.02 });
        break;
      }
      best = s;
    }
  }
}

export function captureD(w: DivWorld, expectOk = true) {
  if (w.view.instrument !== 'compound') cmdD(w, { type: 'observe', instrument: 'compound', open: true });
  runD(w, 1.6);
  return cmdD(w, { type: 'captureObservation', instrument: 'compound' }, expectOk).id!;
}

export function removeFromStageD(w: DivWorld, id: string, support = 'cleanTray', at: { x: number; y: number; z?: number } = CLEAN_TRAY) {
  if (w.view.instrument) cmdD(w, { type: 'observe', instrument: 'compound', open: false });
  toObjectiveD(w, 4);
  cmdD(w, { type: 'turnCoarse', deltaTurns: -w.microscope.coarseTurns });
  cmdD(w, { type: 'turnFine', deltaTurns: -w.microscope.fineTurns });
  cmdD(w, { type: 'openClip', open: true });
  placeD(w, id, support, at);
}

export function microscopeOn(w: DivWorld) {
  cmdD(w, { type: 'setPower', device: 'microscope', on: true });
  if (w.microscope.light01 < 0.2) cmdD(w, { type: 'setIllumination', device: 'microscope', value01: 0.4 });
}

/** Observación 4X → 10X → 40X de la lámina en la platina (sin retirarla); devuelve las capturas por objetivo. */
export function observeOnStage(w: DivWorld, slideId: string, objectives: Array<4 | 10 | 40> = [4, 40]) {
  const out: Record<number, string> = {};
  toObjectiveD(w, 4);
  toStageD(w, slideId);
  focusD(w);
  for (const x of [4, 10, 40] as const) {
    if (x !== 4) {
      toObjectiveD(w, x);
      focusD(w);
    }
    cmdD(w, { type: 'setDiaphragm', value01: x === 40 ? 0.6 : 0.5 });
    if (objectives.includes(x)) out[x] = captureD(w);
  }
  cmdD(w, { type: 'setDiaphragm', value01: 0.5 });
  return out;
}

export function observeSlide(w: DivWorld, slideId: string, objectives: Array<4 | 10 | 40> = [4, 40]) {
  const out = observeOnStage(w, slideId, objectives);
  removeFromStageD(w, slideId);
  return out;
}

/** Marca de una estructura en el centro de su primera región anotada visible dentro de la captura. */
export function markAt(w: DivWorld, obsId: string, structure: MarkStructure, expectOk = true) {
  const pt = centerOf(w, obsId, structure) ?? [0.5, 0.5];
  return cmdD(w, { type: 'markRegion', observationId: obsId, structure, u: pt[0], v: pt[1] }, expectOk);
}

/** Centro (u, v en la captura) de la primera región de la estructura que cae dentro del campo. */
export function centerOf(w: DivWorld, obsId: string, structure: string): [number, number] | null {
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


/** Lámina permanente: de la caja a la platina, observada y devuelta a su ranura. */
export function fixedSlideRoute(w: DivWorld, id: string, objectives: Array<4 | 10 | 40> = [10, 40], opts: { oil100?: boolean; keepOnStage?: boolean } = {}) {
  if (!w.slideCase.open) cmdD(w, { type: 'openSlideCase', open: true });
  placeD(w, id, 'hand');
  const out = observeOnStage(w, id, objectives);
  if (opts.oil100) {
    // 100X: revólver entre posiciones, gota de aceite, 100X y solo micrométrico.
    cmdD(w, { type: 'turnTurret', deltaDeg: 45 });
    cmdD(w, { type: 'addImmersionOil', slideId: id, drops: 1 });
    toObjectiveD(w, 100);
    cmdD(w, { type: 'setDiaphragm', value01: 0.7 });
    focusD(w);
    out[100] = captureD(w);
    if (w.view.instrument) cmdD(w, { type: 'observe', instrument: 'compound', open: false });
    // Lente del 100X y lámina, con papel óptico.
    cmdD(w, { type: 'wipe', targetId: 'mic:lens', toolId: 'lp' });
    cmdD(w, { type: 'turnFine', deltaTurns: -w.microscope.fineTurns });
    cmdD(w, { type: 'turnCoarse', deltaTurns: -w.microscope.coarseTurns });
    cmdD(w, { type: 'turnTurret', deltaDeg: 45 });
    cmdD(w, { type: 'setDiaphragm', value01: 0.5 });
  }
  if (opts.keepOnStage) return out;
  const home = w.slideCase.home[id];
  if (opts.oil100) {
    removeFromStageD(w, id, 'bench', { x: 330, y: 12 });
    cmdD(w, { type: 'wipe', targetId: id, toolId: 'lp' });
    placeD(w, id, `case:${home}`, caseSlotPos(caseSlotIndex(home)));
  } else removeFromStageD(w, id, `case:${home}`, caseSlotPos(caseSlotIndex(home)));
  return out;
}

export interface IdealResB06 {
  tradescantia: Record<number, string>;
  buccal: Record<number, string>;
  paramecium: Record<number, string>;
  euglena: Record<number, string>;
  elodea: Record<number, string>;
  bacillus: Record<number, string>;
  blood: Record<number, string>;
  marks: Record<string, string>;
  measurement: string | null;
}

export function idealRouteB06(w0: DivWorld, resume: (w: DivWorld) => DivWorld = (w) => w) {
  let w = w0;
  ppeB06(w);
  classifyAll(w);
  microscopeOn(w);
  const res = { marks: {}, measurement: null } as unknown as IdealResB06;
  // B — epidermis y frotis (animal/vegetal).
  tradesMount(w, 'sl1', 'cv1');
  w = resume(w);
  res.tradescantia = observeSlide(w, 'sl1');
  buccalMount(w, 'sl2', 'cv2');
  w = resume(w);
  res.buccal = observeSlide(w, 'sl2');
  // C — protistas vivos: movilidad registrada antes de retirar.
  cultureMount(w, 'paramecium', 'sl3', 'cv3', { mc: true });
  w = resume(w);
  res.paramecium = observeOnStage(w, 'sl3', [4, 10, 40]);
  cmdD(w, { type: 'observe', instrument: 'compound', open: true });
  cmdD(w, { type: 'recordMotility', slideId: 'sl3' });
  removeFromStageD(w, 'sl3');
  cultureMount(w, 'euglena', 'sl4', 'cv4');
  w = resume(w);
  res.euglena = observeOnStage(w, 'sl4', [10, 40]);
  cmdD(w, { type: 'observe', instrument: 'compound', open: true });
  cmdD(w, { type: 'recordMotility', slideId: 'sl4' }, !w.cell.missingAssets.includes('euglena'));
  removeFromStageD(w, 'sl4');
  // E — Elodea comparativa.
  elodeaMount(w, 'sl5', 'cv5');
  w = resume(w);
  res.elodea = observeSlide(w, 'sl5');
  // D — láminas permanentes.
  res.bacillus = fixedSlideRoute(w, 'fxB', [40], { oil100: w.div.immersion });
  w = resume(w);
  res.blood = fixedSlideRoute(w, 'fxS', [10, 40]);
  cmdD(w, { type: 'openSlideCase', open: false });
  // Marcas sobre capturas propias y una medición calibrada.
  const mk = (key: string, obs: string | undefined, s: MarkStructure) => {
    if (!obs || !centerOf(w, obs, s)) return;
    res.marks[key] = markAt(w, obs, s).id!;
  };
  mk('stoma', res.tradescantia[40], 'stoma');
  mk('buccalNucleus', res.buccal[40], 'nucleus');
  mk('paramecium', res.paramecium[40], 'parameciumCell');
  mk('euglena', res.euglena[40], 'euglenaCell');
  mk('chloroplasts', res.elodea[40], 'chloroplasts');
  mk('bacilli', res.bacillus[100] ?? res.bacillus[40], 'bacilli');
  mk('erythrocyte', res.blood[40], 'erythrocyte');
  mk('leukocyte', res.blood[40], 'leukocyte');
  if (w.div.scale.available) res.measurement = cmdD(w, { type: 'measure', observationId: res.paramecium[40], ax: 100, ay: 500, bx: 900, by: 500, scale: 'calibration' }).id!;
  // F — cierre.
  for (const id of Object.keys(w.slides).filter((s) => s.startsWith('ctl'))) placeD(w, id, 'cleanTray', CLEAN_TRAY);
  cmdD(w, { type: 'wipe', targetId: 'fc', toolId: 'lp' });
  cmdD(w, { type: 'setPower', device: 'microscope', on: false });
  cmdD(w, { type: 'closeBench' });
  return { w, res };
}

const ANSWER = 'Respuesta argumentada con mis capturas propias, separando lo observado, lo inferido y lo no demostrable.';

export function fillNotebookB06(w: DivWorld, nb: B06Notebook, res: IdealResB06) {
  const oc = w.params.microscope.ocularX;
  nb.prereport = { hypothesis: 'La bacteria no tendrá núcleo ni nucléolo; los protistas sí', expected: 'Estomas, cloroplastos, núcleo bucal', precautions: 'Aceite solo con el 100X; sin sangre fresca' };
  nb.prep = [
    { observationId: res.tradescantia[40], specimen: 'tradescantia', material: 'fresh', stain: 'agua', volumeMl: '0.04', timeS: '0', quality: 'Tira delgada' },
    { observationId: res.buccal[40], specimen: 'buccal', material: 'fresh', stain: 'azul de metileno', volumeMl: '0.04', timeS: '60', quality: 'Extendido fino' },
    { observationId: res.paramecium[40], specimen: 'paramecium', material: 'fresh', stain: 'metilcelulosa', volumeMl: '0.04', timeS: '0', quality: 'Sin burbujas' },
    { observationId: res.bacillus[40], specimen: 'bacillus', material: 'fixed', stain: 'preparado', volumeMl: '0', timeS: '0', quality: 'Permanente' },
  ];
  const org = (id: string, specimen: DivSpecimen, cellType: 'prokaryote' | 'eukaryote', group: 'bacteria' | 'protist' | 'plant' | 'animal', cells: 'uni' | 'multi') => ({
    observationId: id, specimen, cellType, group, motility: 'notEvaluable' as const, cells, wall: 'inferred' as const, nucleus: 'inferred' as const,
  });
  nb.organisms = [
    org(res.bacillus[40], 'bacillus', 'prokaryote', 'bacteria', 'uni'),
    org(res.paramecium[40], 'paramecium', 'eukaryote', 'protist', 'uni'),
    org(res.tradescantia[40], 'tradescantia', 'eukaryote', 'plant', 'multi'),
    org(res.buccal[40], 'buccal', 'eukaryote', 'animal', 'multi'),
    org(res.euglena[40], 'euglena', 'eukaryote', 'protist', 'uni'),
  ];
  // Euglena sin recurso (SC-RESOURCE-OUTAGE): no hay captura que importar; la fila queda vacía.
  const eugMissing = w.cell.missingAssets.includes('euglena');
  if (eugMissing) nb.organisms.pop();
  nb.protists = {
    euglena: { observationId: eugMissing ? null : res.euglena[40], features: eugMissing ? '' : 'Forma fusiforme verde', motilityEvidence: 'model', treatment: 'plain', speedUmS: '', reserve: 'unknown', reserveMethod: 'none', photosynthesisProven: false },
    paramecium: { observationId: res.paramecium[40], features: 'Contorno ovalado y vacuolas', motilityEvidence: 'model', treatment: 'methylcellulose', speedUmS: '', reserve: '', reserveMethod: '', photosynthesisProven: false },
    comparison: 'Sin video no comparo velocidades; solo describo formas',
  };
  nb.epidermis = { observationId: res.tradescantia[40], specimen: 'tradescantia', totalMag: String(oc * 40), stoma: w.cell.variants?.blurStomata ? 'inferred' : 'visible', chloroplasts: 'notVisible', limits: 'La apertura estomática no se evalúa' };
  const bo = res.bacillus[100] ?? res.bacillus[40];
  nb.fixed = [
    { observationId: bo, label: w.slides.fxB.label ?? '', technique: 'Preparado permanente', objective: String(w.observations[bo].objectiveX), oil: !!res.bacillus[100], region: 'Centro', returned: true },
    { observationId: res.blood[40], label: w.slides.fxS.label ?? '', technique: 'Frotis teñido', objective: '40', oil: false, region: 'Monocapa', returned: true },
  ];
  nb.bacteria = { observationId: bo, shape: 'Bacilos en cadenas', nucleolus: 'absent' };
  nb.blood = { observationId: res.blood[40], cells: ['erythrocyte', 'leukocyte'], nuclear: 'Leucocito con núcleo', contrast: 'Bueno', subtype: '' };
  const m = res.measurement ? w.div.measurements.find((x) => x.id === res.measurement)! : null;
  nb.morpho = m
    ? [{ observationId: m.observationId, measurementId: m.id, pixels: String(m.rawPixelDistance), umPerPx: String(m.umPerPx), lengthUm: String(m.lengthUm), uncertaintyUm: String(m.uncertaintyUm), unit: 'um', lengthMm: String(m.lengthUm / 1000) }]
    : [];
  nb.comparison = [
    { specimen: 'bacillus', domain: 'prokaryote', organization: 'uni', evidence: 'observed' },
    { specimen: 'paramecium', domain: 'eukaryote', organization: 'uni', evidence: 'observed' },
    { specimen: 'tradescantia', domain: 'eukaryote', organization: 'multi', evidence: 'observed' },
    { specimen: 'buccal', domain: 'eukaryote', organization: 'multi', evidence: 'inferred' },
  ];
  nb.open = { notes: 'Dibujo del estoma', limitations: 'Sin video no hay velocidad; sin escala no hay medida', errors: 'Ninguno' };
  for (const q of QUESTIONS_B06) nb.analysis[q] = ANSWER;
}

export function idealAttemptB06(seed = 2606, scenarios: B06Scenario[] = [], resume: (w: DivWorld) => DivWorld = (w) => w) {
  const w0 = worldB06({ seed, scenarios });
  const nb = emptyB06Notebook(`b06-${seed.toString(36)}-test`);
  const { w, res } = idealRouteB06(w0, resume);
  fillNotebookB06(w, nb, res);
  return { w, nb, res };
}

export const errKeys = (w: DivWorld) => Object.keys(w.evidence).filter((k) => k.startsWith('err:'));

export { PREP_SPOT, PREP2_SPOT, CLEAN_TRAY, BIO_WASTE };
