/**
 * Ayudantes de prueba de la Práctica 6: rutas del estudiante expresadas con los mismos comandos que la interfaz.
 */
import type { P6Command, P6DispatchResult, BombCommand } from '../simulation/calorimetry-world/commands';
import type { MassReading, P6World, Pose } from '../simulation/calorimetry-world/types';
import { balanceTargetG, dispatchCalor, displayedSlope, displayedValue, metalGAt, runCalorFor, stepCalor } from '../simulation/calorimetry-world/world';
import { newPractice6World } from '../practices/practice-06';
import type { P6Scenario } from '../practices/practice-06/error-scenarios';
import type { MetalId } from '../simulation/calorimetry/materials';
import type { P6Params } from '../simulation/calorimetry-world/types';
import { BALANCE_POS6, PLATE_POS } from '../practices/practice-06/definition';

export const pose = (x: number, y: number, z = 0): Pose => ({ x, y, z, rotationRad: 0 });

export function world6(opts: { seed?: number; scenarios?: P6Scenario[]; unknown?: MetalId; params?: Partial<P6Params> } = {}): P6World {
  return newPractice6World({ mode: 'PRACTICE', seed: opts.seed ?? 606, scenarios: opts.scenarios, unknown: opts.unknown, params: opts.params });
}
export const cmd6 = (w: P6World, c: P6Command): P6DispatchResult => dispatchCalor(w, c);
export const bomb6 = (w: P6World, c: BombCommand) => dispatchCalor(w, { type: 'bomb', cmd: c });
export const run6 = (w: P6World, s: number) => runCalorFor(w, s);
export const step6 = (w: P6World) => stepCalor(w);

const PAN = () => pose(BALANCE_POS6.x - 16, BALANCE_POS6.y, 9.5);

export function balanceAndRead(w: P6World, waitS = 12): MassReading {
  for (let pass = 0; pass < 3; pass++) {
    const target = balanceTargetG(w);
    const r0 = Math.max(0, Math.min(500, Math.floor(target / 100) * 100));
    const r1 = Math.max(0, Math.min(90, Math.floor((target - r0) / 10) * 10));
    const r2 = Math.max(0, Math.min(10, Math.round((target - r0 - r1) * 100) / 100));
    cmd6(w, { type: 'setRider', beam: 0, valueG: r0 });
    cmd6(w, { type: 'setRider', beam: 1, valueG: r1 });
    cmd6(w, { type: 'setRider', beam: 2, valueG: r2 });
    run6(w, waitS / 3);
  }
  cmd6(w, { type: 'readBalance' });
  return w.massReadings[w.massReadings.length - 1];
}

export function calibrate(w: P6World) {
  for (const b of [0, 1, 2] as const) cmd6(w, { type: 'setRider', beam: b, valueG: 0 });
  if (w.balance.levelErrorDeg) cmd6(w, { type: 'levelBalance' });
  run6(w, 6);
  const err = w.balance.zeroErrorG - w.balance.zeroScrewG + w.balance.levelErrorDeg * 0.06;
  cmd6(w, { type: 'turnZeroScrew', deltaG: err });
  run6(w, 10);
  return cmd6(w, { type: 'readBalance' });
}

/** Pesa un objeto (al platillo, equilibra, lee y lo devuelve a su lugar). */
export function weigh(w: P6World, id: string, back: Pose = pose(130, 24), backSupport = 'bench'): MassReading {
  cmd6(w, { type: 'setPose', id, pose: PAN(), support: 'pan' });
  const m = balanceAndRead(w);
  cmd6(w, { type: 'setPose', id, pose: back, support: backSupport });
  for (const b of [0, 1, 2] as const) cmd6(w, { type: 'setRider', beam: b, valueG: 0 });
  return m;
}

/** Llena la probeta hasta `ml` (botella y luego piseta gota a gota) y la lee a nivel del ojo. */
export function fillCylinder(w: P6World, ml = 50) {
  const c = w.vessels.cylinder;
  cmd6(w, { type: 'setPour', sourceId: 'water_bottle', targetId: 'cylinder', tiltDeg: 60 });
  for (let i = 0; i < 400 && c.waterG < ml - 2.5; i++) step6(w);
  cmd6(w, { type: 'stopPour', sourceId: 'water_bottle' });
  for (let i = 0; i < 200 && c.waterG / 0.9978 < ml - 0.04; i++) cmd6(w, { type: 'squeeze', targetId: 'cylinder', drops: 1 });
  run6(w, 2);
  return cmd6(w, { type: 'readCylinder', eyeDzCm: 0 });
}

export function pourCylinderToCup(w: P6World) {
  cmd6(w, { type: 'setLid', closed: false });
  cmd6(w, { type: 'setPose', id: 'cylinder', pose: pose(205, 30, 10), support: 'hand' });
  cmd6(w, { type: 'setPour', sourceId: 'cylinder', targetId: 'cup', tiltDeg: 140 });
  for (let i = 0; i < 600 && w.vessels.cylinder.waterG > 0.01; i++) step6(w);
  cmd6(w, { type: 'stopPour', sourceId: 'cylinder' });
  cmd6(w, { type: 'setPose', id: 'cylinder', pose: pose(130, 24), support: 'bench' });
}

export function assembleCup(w: P6World) {
  cmd6(w, { type: 'setPose', id: 'therm_cal', pose: pose(205, 36, 4), support: 'cup' });
  cmd6(w, { type: 'setThermoDepth', id: 'therm_cal', depth: 0.5 });
  cmd6(w, { type: 'setPose', id: 'stirrer', pose: pose(207, 36, 4), support: 'cup' });
  cmd6(w, { type: 'setLid', closed: true });
}

export function fillBath(w: P6World, g = 330) {
  cmd6(w, { type: 'setPose', id: 'beaker', pose: pose(PLATE_POS.x, PLATE_POS.y, 8), support: 'plate' });
  cmd6(w, { type: 'setPose', id: 'water_bottle', pose: pose(PLATE_POS.x, PLATE_POS.y - 10, 18), support: 'hand' });
  cmd6(w, { type: 'setPour', sourceId: 'water_bottle', targetId: 'beaker', tiltDeg: 70 });
  for (let i = 0; i < 2000 && w.vessels.beaker.waterG < g; i++) step6(w);
  cmd6(w, { type: 'stopPour', sourceId: 'water_bottle' });
  cmd6(w, { type: 'setPose', id: 'water_bottle', pose: pose(150, 52), support: 'bench' });
  cmd6(w, { type: 'setPose', id: 'therm_bath', pose: pose(PLATE_POS.x + 2, PLATE_POS.y + 1, 10), support: 'bath' });
  cmd6(w, { type: 'setThermoDepth', id: 'therm_bath', depth: 0.5 });
}

/** Agrega piezas con la espátula hasta acercarse a `g` (sin pasarse mucho). */
export function addMetal(w: P6World, tube: string, jar: string, g = 25) {
  for (let i = 0; i < 30 && metalGAt(w, `tube:${tube}`) < g - 1.2; i++) {
    cmd6(w, { type: 'pickPiece', from: `jar:${jar}` });
    cmd6(w, { type: 'dropPiece', to: `tube:${tube}` });
  }
}

export function tubeToBath(w: P6World, tube: string, bottomCm = 0.8) {
  cmd6(w, { type: 'setPose', id: tube, pose: pose(PLATE_POS.x - 1, PLATE_POS.y, bottomCm), support: 'bath' });
  cmd6(w, { type: 'setTubeDepth', tubeId: tube, bottomAboveFloorCm: bottomCm });
}

/** Lleva el baño a ebullición y la mantiene suave `soakS` segundos (interactuando, como lo haría el estudiante). */
export function boil(w: P6World, soakS = 600, knobHigh = 0.6, knobLow = 0.3) {
  cmd6(w, { type: 'setPlate', knob: knobHigh });
  for (let i = 0; i < 120 && w.vessels.beaker.waterC < w.bath.boilingC - 0.3; i++) run6(w, 10);
  cmd6(w, { type: 'setPlate', knob: knobLow });
  for (let t = 0; t < soakS; t += 30) {
    run6(w, 30);
    cmd6(w, { type: 'readThermometer', id: 'therm_bath' });
  }
}

/** Traslado con la pinza y vertido del metal; luego agita y registra el máximo cuando deja de subir. */
export function transferAndPeak(w: P6World, tube: string, opts: { transferS?: number; stir?: number; lidOpenS?: number; peakDelayS?: number } = {}) {
  cmd6(w, { type: 'readThermometer', id: 'therm_bath' });
  cmd6(w, { type: 'setPlate', knob: 0 });
  cmd6(w, { type: 'setPose', id: tube, pose: pose(300, 30, 20), support: 'tongs' });
  run6(w, opts.transferS ?? 5);
  cmd6(w, { type: 'setLid', closed: false });
  const r = cmd6(w, { type: 'pourMetal', tubeId: tube, targetId: 'cup', dropHeightCm: 4, offsetCm: 0 });
  run6(w, opts.lidOpenS ?? 1);
  cmd6(w, { type: 'setLid', closed: true });
  cmd6(w, { type: 'setPose', id: tube, pose: pose(30 + (tube === 'tube_fe' ? -3 : 3), 38, 0.6), support: 'rack' });
  const stir = opts.stir ?? 0.6;
  let t = 0;
  for (; t < 400; t += 1) {
    if (stir > 0) cmd6(w, { type: 'stir', intensity: stir });
    run6(w, 1);
    if (t > 20 && displayedSlope(w, 'cal', 8) <= 0.002) break;
  }
  if (opts.peakDelayS) {
    for (let k = 0; k < opts.peakDelayS; k++) {
      if (stir > 0) cmd6(w, { type: 'stir', intensity: stir });
      run6(w, 1);
    }
  }
  cmd6(w, { type: 'readThermometer', id: 'therm_cal', peak: true });
  return { pour: r, peak: displayedValue(w, 'therm_cal'), t };
}

/** Ruta completa de un ensayo: agua medida, calorímetro armado, metal pesado y calentado, transferencia. */
export function fullRun(w: P6World, tube: 'tube_fe' | 'tube_x', jar: 'jar_fe' | 'jar_x', opts: { transferS?: number; stir?: number; soakS?: number; peakDelayS?: number } = {}) {
  const cylEmpty = weigh(w, 'cylinder');
  fillCylinder(w, 50);
  const cylWater = weigh(w, 'cylinder');
  pourCylinderToCup(w);
  assembleCup(w);
  const tubeEmpty = weigh(w, tube, pose(30, 38, 0.6), 'rack');
  addMetal(w, tube, jar, 25);
  const tubeMetal = weigh(w, tube, pose(30, 38, 0.6), 'rack');
  if (w.vessels.beaker.waterG < 320) fillBath(w);
  tubeToBath(w, tube);
  boil(w, opts.soakS ?? 600);
  const bath = cmd6(w, { type: 'readThermometer', id: 'therm_bath' });
  const tiw = cmd6(w, { type: 'readThermometer', id: 'therm_cal' });
  const tp = transferAndPeak(w, tube, opts);
  return { cylEmpty, cylWater, tubeEmpty, tubeMetal, bath: bath.value!, tiw: tiw.value!, peak: tp.peak, run: w.runs[w.runs.length - 1] };
}
