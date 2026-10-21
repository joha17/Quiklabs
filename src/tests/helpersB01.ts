/**
 * Ruta del estudiante de la práctica B01 hecha SOLO con comandos (sin inyectar banderas de etapa): EPP e
 * identificación de partes, montaje húmedo de Elodea, microscopio 4X → 10X → 40X con enfoque por búsqueda (como
 * quien mira por el ocular), lámina fija de la caja y devolución, estereoscopio con hoja e insecto, y cierre del puesto.
 */
import { expect } from 'vitest';
import type { B01Command } from '../simulation/optical-world/commands';
import type { OpticalWorld } from '../simulation/optical-world/types';
import { dispatchB01, microscopeView, runB01For, stereoView } from '../simulation/optical-world/world';
import { CLEAN_TRAY, PREP_SPOT, SAMPLE_TRAY, STAGE_SEAT, STEREO_BASE, caseSlotIndex, caseSlotPos, stageTopZCm } from '../simulation/optical-world/geometry';
import { MICROSCOPE_PARTS } from '../simulation/instruments/optical/microscope-types';
import { STEREO_PARTS } from '../simulation/instruments/optical/stereo-types';
import { newPracticeB01World, type PracticeB01Options } from '../practices/practice-b01';
import type { B01Scenario } from '../practices/practice-b01/error-scenarios';
import { emptyB01Notebook, QUESTIONS_B01, type B01Notebook } from '../practices/practice-b01/notebook';

export function worldB01(opts: Partial<PracticeB01Options> & { scenarios?: B01Scenario[] } = {}): OpticalWorld {
  return newPracticeB01World({ mode: 'PRACTICE', seed: 1101, ...opts });
}

export function cmdB(w: OpticalWorld, c: B01Command, expectOk = true) {
  const r = dispatchB01(w, c);
  if (expectOk) expect(r.ok, `${c.type}: ${r.code ?? ''}`).toBe(true);
  return r;
}

export const runB = (w: OpticalWorld, s: number) => runB01For(w, s);
const P = (x: number, y: number, z = 0) => ({ x, y, z, rotationRad: 0 });

export function place(w: OpticalWorld, id: string, support: string, at?: { x: number; y: number; z?: number }, expectOk = true) {
  const o = w.objects[id];
  return cmdB(w, { type: 'setPose', id, pose: P(at?.x ?? o.pose.x, at?.y ?? o.pose.y, at?.z ?? 0), support }, expectOk);
}

export function ppeB01(w: OpticalWorld) {
  for (const item of ['coat', 'shoes', 'hair', 'hands'] as const) cmdB(w, { type: 'setPPE', item, enabled: true });
  cmdB(w, { type: 'startWork' });
}

export function inspectAll(w: OpticalWorld) {
  for (const p of MICROSCOPE_PARTS) cmdB(w, { type: 'inspect', target: `mic:${p}` });
  for (const p of STEREO_PARTS) cmdB(w, { type: 'inspect', target: `ste:${p}` });
  for (const t of ['glassBin', 'bioWaste', 'sl1', 'el']) cmdB(w, { type: 'inspect', target: t });
}

/** Montaje húmedo de Elodea en sl1 (limpia el vidrio si tiene residuo y la pinza al terminar). */
export function wetMount(w: OpticalWorld, opts: { tilt?: number; speed?: number; force?: number } = {}) {
  if (w.objects.sl1.support !== 'prep') place(w, 'sl1', 'prep', PREP_SPOT);
  if (w.slides.sl1.dirty01 > 0.2) cmdB(w, { type: 'wipe', targetId: 'sl1', toolId: 'lp' });
  if (!w.mounts.sl1?.specimenId) {
    cmdB(w, { type: 'pickSpecimen', toolId: 'fc', sourceId: 'el' });
    cmdB(w, { type: 'placeSpecimen', toolId: 'fc', targetId: 'sl1', dxCm: 0, dyCm: 0 });
  }
  if (w.dish.cutRequired) cmdB(w, { type: 'cutSpecimen', slideId: 'sl1', toolId: 'sc', keepFraction: 0.45, pressure01: 0.4 });
  if ((w.mounts.sl1?.waterMl ?? 0) < 0.02) cmdB(w, { type: 'squeezeDropper', dispenserId: 'dw', targetId: 'sl1', force01: opts.force ?? 0.5, dxCm: 0, dyCm: 0 });
  cmdB(w, { type: 'wipe', targetId: 'fc', toolId: 'lp' });
  cmdB(w, { type: 'grabCover', coverId: 'cv1', toolId: 'fc' });
  cmdB(w, { type: 'setCoverTilt', coverId: 'cv1', angleDeg: opts.tilt ?? 45 });
  cmdB(w, { type: 'lowerCover', coverId: 'cv1', slideId: 'sl1', speedCmS: opts.speed ?? 0.4, dxCm: 0, dyCm: 0 });
}

const seat = () => ({ x: STAGE_SEAT.x, y: STAGE_SEAT.y, z: stageTopZCm(6) });

/** A la platina con la pinza abierta, y sujeta. */
export function toStage(w: OpticalWorld, id: string) {
  if (!w.microscope.clipOpen) cmdB(w, { type: 'openClip', open: true });
  place(w, id, 'stage', seat());
  cmdB(w, { type: 'openClip', open: false });
}

/** Enfoque como quien mira: macro en pasos hasta ver nítido y micro alrededor del máximo. */
export function focusMicroscope(w: OpticalWorld) {
  const v0 = microscopeView(w);
  const obj = v0.objectiveX ?? 4;
  if (obj === 4) {
    cmdB(w, { type: 'checkSide' });
    for (let i = 0; i < 80 && microscopeView(w).sharpness01 < 0.25; i++) cmdB(w, { type: 'turnCoarse', deltaTurns: 0.1 });
  }
  let best = microscopeView(w).sharpness01;
  for (const dir of [1, -1]) {
    for (let i = 0; i < 40; i++) {
      cmdB(w, { type: 'turnFine', deltaTurns: dir * 0.05 });
      const s = microscopeView(w).sharpness01;
      if (s + 1e-9 < best) {
        cmdB(w, { type: 'turnFine', deltaTurns: -dir * 0.05 });
        break;
      }
      best = s;
    }
  }
}

export function captureCompound(w: OpticalWorld) {
  if (w.view.instrument !== 'compound') cmdB(w, { type: 'observe', instrument: 'compound', open: true });
  runB(w, 1.6);
  return cmdB(w, { type: 'captureObservation', instrument: 'compound' }).id!;
}

/** Revólver al objetivo pedido (giros de 120° enclavados). */
export function toObjective(w: OpticalWorld, x: 4 | 10 | 40) {
  const target = { 4: 0, 10: 120, 40: 240 }[x];
  if (w.microscope.turretDeg !== target) cmdB(w, { type: 'turnTurret', deltaDeg: target - w.microscope.turretDeg });
}

/** Baja la platina a distancia segura, abre la pinza y retira la lámina hacia `support`. */
export function removeFromStage(w: OpticalWorld, id: string, support: string, at: { x: number; y: number; z?: number }) {
  toObjective(w, 4);
  cmdB(w, { type: 'turnCoarse', deltaTurns: -w.microscope.coarseTurns });
  cmdB(w, { type: 'turnFine', deltaTurns: -w.microscope.fineTurns });
  cmdB(w, { type: 'openClip', open: true });
  place(w, id, support, at);
}

export function captureStereo(w: OpticalWorld) {
  if (w.view.instrument !== 'stereo') cmdB(w, { type: 'observe', instrument: 'stereo', open: true });
  runB(w, 1.6);
  return cmdB(w, { type: 'captureObservation', instrument: 'stereo' }).id!;
}

export function focusStereo(w: OpticalWorld) {
  // Barrido de la perilla dentro de su recorrido (sin forzar el tope) y vuelta a la posición más nítida.
  const lim = w.params.stereo.focusRangeMm / w.params.stereo.focusPitchMmPerTurn - 0.5;
  cmdB(w, { type: 'setStereoFocus', deltaTurns: -lim - w.stereo.focusTurns });
  let best = -1;
  let bestAt = w.stereo.focusTurns;
  for (let i = 0; w.stereo.focusTurns + 0.25 <= lim && i < 200; i++) {
    const s = stereoView(w).sharpness01;
    if (s > best) {
      best = s;
      bestAt = w.stereo.focusTurns;
    }
    cmdB(w, { type: 'setStereoFocus', deltaTurns: 0.25 });
  }
  cmdB(w, { type: 'setStereoFocus', deltaTurns: bestAt - w.stereo.focusTurns });
}

export function stereoSample(w: OpticalWorld, id: string) {
  if (w.forceps.dirty01 > 0.3) cmdB(w, { type: 'wipe', targetId: 'fc', toolId: 'lp' });
  cmdB(w, { type: 'pickSpecimen', toolId: 'fc', sourceId: id, pressure01: 0.3 });
  cmdB(w, { type: 'placeSpecimen', toolId: 'fc', targetId: 'stereoBase', dxCm: 0, dyCm: 0 });
}

export function returnSample(w: OpticalWorld, id: string) {
  cmdB(w, { type: 'pickSpecimen', toolId: 'fc', sourceId: id, pressure01: 0.3 });
  cmdB(w, { type: 'placeSpecimen', toolId: 'fc', targetId: 'sampleTray', dxCm: id === 'leaf1' ? -3 : 3, dyCm: 0 });
  cmdB(w, { type: 'wipe', targetId: 'fc', toolId: 'lp' });
}

export interface IdealResB01 {
  fresh: Record<number, string>;
  fixed: string[];
  leaf: string[];
  insect: string[];
}

/** Ruta ideal completa por comandos; `resume` (opcional) simula interrupciones entre estaciones. */
export function idealRouteB01(w0: OpticalWorld, resume: (w: OpticalWorld) => OpticalWorld = (w) => w) {
  let w = w0;
  const res: IdealResB01 = { fresh: {}, fixed: [], leaf: [], insect: [] };
  ppeB01(w);
  inspectAll(w);
  wetMount(w);
  w = resume(w);
  // C — microscopio con el montaje fresco.
  cmdB(w, { type: 'setPower', device: 'microscope', on: true });
  if (w.microscope.light01 < 0.2) cmdB(w, { type: 'setIllumination', device: 'microscope', value01: 0.4 });
  if (w.microscope.condenser01 < 0.6) cmdB(w, { type: 'setCondenser', value01: 0.9 });
  if (w.microscope.stageXmm || w.microscope.stageYmm) cmdB(w, { type: 'setStageXY', xMm: 0, yMm: 0 });
  toObjective(w, 4);
  toStage(w, 'sl1');
  focusMicroscope(w);
  res.fresh[4] = captureCompound(w);
  for (const x of [10, 40] as const) {
    toObjective(w, x);
    focusMicroscope(w);
    if (x === 40) cmdB(w, { type: 'setDiaphragm', value01: 0.6 });
    res.fresh[x] = captureCompound(w);
  }
  cmdB(w, { type: 'setDiaphragm', value01: 0.5 });
  cmdB(w, { type: 'observe', instrument: 'compound', open: false });
  removeFromStage(w, 'sl1', 'cleanTray', CLEAN_TRAY);
  w = resume(w);
  // D — lámina fija asignada, de la caja a la platina y de vuelta a su ranura.
  cmdB(w, { type: 'openSlideCase', open: true });
  for (const id of w.assignment.fixedSlideIds) {
    place(w, id, 'hand');
    toStage(w, id);
    focusMicroscope(w);
    res.fixed.push(captureCompound(w));
    toObjective(w, 10);
    focusMicroscope(w);
    res.fixed.push(captureCompound(w));
    cmdB(w, { type: 'observe', instrument: 'compound', open: false });
    const home = w.slideCase.home[id];
    removeFromStage(w, id, `case:${home}`, caseSlotPos(caseSlotIndex(home)));
  }
  cmdB(w, { type: 'openSlideCase', open: false });
  w = resume(w);
  // E — estereoscopio: hoja e insecto por separado.
  cmdB(w, { type: 'setPower', device: 'stereo', on: true });
  cmdB(w, { type: 'setIllumination', device: 'stereo-incident', value01: 0.5 });
  if (w.stereo.channelMode === 'stereo-pair') {
    cmdB(w, { type: 'setInterpupillary', valueMm: w.params.stereo.userIpdMm });
    cmdB(w, { type: 'setDiopter', side: 'left', value: 0 });
    cmdB(w, { type: 'setDiopter', side: 'right', value: 0 });
  }
  for (const id of ['leaf1', 'ins1']) {
    stereoSample(w, id);
    cmdB(w, { type: 'setStereoZoom', zoomX: 1 });
    focusStereo(w);
    (id === 'leaf1' ? res.leaf : res.insect).push(captureStereo(w));
    cmdB(w, { type: 'setStereoZoom', zoomX: id === 'leaf1' ? 3 : 2 });
    focusStereo(w);
    (id === 'leaf1' ? res.leaf : res.insect).push(captureStereo(w));
    cmdB(w, { type: 'observe', instrument: 'stereo', open: false });
    returnSample(w, id);
  }
  // F — cierre del puesto.
  cmdB(w, { type: 'setPower', device: 'microscope', on: false });
  cmdB(w, { type: 'setPower', device: 'stereo', on: false });
  cmdB(w, { type: 'closeBench' });
  return { w, res };
}

const ANSWER = 'Respuesta argumentada con mis capturas, los mandos que usé, los aumentos y sus límites.';

/** Libreta coherente con las observaciones propias. */
export function fillNotebookB01(w: OpticalWorld, nb: B01Notebook, res: IdealResB01) {
  for (const p of Object.keys(nb.parts) as Array<keyof B01Notebook['parts']>) nb.parts[p] = { action: 'Lo giré / lo usé durante la observación', function: 'Función de la parte en el sistema óptico' };
  for (const p of Object.keys(nb.stereoParts) as Array<keyof B01Notebook['stereoParts']>) nb.stereoParts[p] = { action: 'Ajustado', function: 'Función de la parte del estereoscopio' };
  nb.prep = { specimen: 'elodea', cutType: w.dish.cutRequired ? 'fragment' : 'none', waterMl: '0,05', cover: 'angled', incidents: 'Sin incidentes' };
  const oc = w.params.microscope.ocularX;
  nb.micro = ([4, 10, 40] as const).map((x) => {
    const o = w.observations[res.fresh[x]];
    return { observationId: o.id, specimen: 'elodea' as const, totalMag: String(oc * x), region: 'Centro de la hoja', structures: o.visibleRegionIds.slice(0, 2) };
  });
  const fo = w.observations[res.fixed[res.fixed.length - 1]];
  const home = w.slideCase.home[fo.slideId!];
  nb.fixed = [{ observationId: fo.id, label: w.slides[fo.slideId!].label ?? '', slot: home, description: 'Células epidérmicas con núcleo teñido', returned: true }];
  const lo = w.observations[res.leaf[res.leaf.length - 1]];
  const io = w.observations[res.insect[res.insect.length - 1]];
  nb.stereo = { leaf: { observationId: lo.id, light: 'incident', structures: lo.visibleRegionIds.slice(0, 2) }, insect: { observationId: io.id, light: 'incident', structures: io.visibleRegionIds.slice(0, 3) } };
  nb.comparison = { fov: 'El estereoscopio tiene un campo mucho mayor', depth: 'Mayor profundidad de campo en el estereoscopio', purpose: 'El compuesto para células; el estereoscopio para superficie y relieve' };
  nb.incidents = { error: 'Ninguno', consequence: 'Ninguna consecuencia apreciable en las capturas', recovery: '—', inventory: 'Todo devuelto' };
  nb.calc = { mag4: '40', mag10: '100', mag40: '400', fov4: '4,5', fov10: '1,8', fov40: '0,45' };
  for (const q of QUESTIONS_B01) nb.analysis[q] = ANSWER;
}

export function idealAttemptB01(seed = 1101, scenarios: B01Scenario[] = [], resume: (w: OpticalWorld) => OpticalWorld = (w) => w) {
  const w0 = worldB01({ seed, scenarios });
  const nb = emptyB01Notebook(`b01-${seed.toString(36)}-test`);
  const { w, res } = idealRouteB01(w0, resume);
  fillNotebookB01(w, nb, res);
  return { w, nb, res };
}

export { PREP_SPOT, SAMPLE_TRAY, STEREO_BASE, CLEAN_TRAY };
