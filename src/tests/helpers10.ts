/**
 * Ayudantes de prueba de la Práctica 10: rutas del estudiante expresadas con los mismos comandos que la interfaz.
 */
import type { P10Command, P10DispatchResult } from '../simulation/gas-world/commands';
import type { P10Params, P10World, Pose } from '../simulation/gas-world/types';
import { dispatchGas, runGasFor, solveBurette } from '../simulation/gas-world/world';
import { newPractice10World } from '../practices/practice-10';
import type { P10Scenario } from '../practices/practice-10/error-scenarios';
import { ABALANCE_PAN } from '../practices/practice-10/definition';
import { sensorStable } from '../simulation/gas-world/boyle-rig';

export const pose = (x: number, y: number, z = 0): Pose => ({ x, y, z, rotationRad: 0 });

export function world10(opts: { seed?: number; scenarios?: P10Scenario[]; params?: Partial<P10Params> } = {}): P10World {
  return newPractice10World({ mode: 'PRACTICE', seed: opts.seed ?? 1010, scenarios: opts.scenarios, params: opts.params });
}
export const cmd10 = (w: P10World, c: P10Command): P10DispatchResult => dispatchGas(w, c);
export const run10 = (w: P10World, s: number) => runGasFor(w, s);

const onPan = (w: P10World, id: string) => cmd10(w, { type: 'setPose', id, pose: pose(ABALANCE_PAN.x, ABALANCE_PAN.y, ABALANCE_PAN.z), support: 'pan' });
const offPan = (w: P10World, id: string, at = pose(38, 22)) => cmd10(w, { type: 'setPose', id, pose: at, support: 'bench' });

/** Lectura estable con las puertas cerradas. */
export function readMass(w: P10World, waitS = 2) {
  cmd10(w, { type: 'setDoors', open: false });
  run10(w, waitS);
  for (let i = 0; i < 60 && !w.balance.stable; i++) run10(w, 0.5);
  const r = cmd10(w, { type: 'readBalance' });
  return w.massReadings.find((m) => m.id === r.id)!;
}

/** Pesada por diferencia (§8.2): nivelar, tarar vacía, pesar el vidrio, cargar fuera de la cabina y pesar de nuevo. */
export function weighBicarb(w: P10World, targetG = 0.5) {
  cmd10(w, { type: 'inspect', target: 'abalance' });
  cmd10(w, { type: 'levelBalance' });
  cmd10(w, { type: 'setDoors', open: false });
  run10(w, 3);
  cmd10(w, { type: 'tare' });
  cmd10(w, { type: 'setDoors', open: true });
  onPan(w, 'watch_glass');
  const empty = readMass(w);
  cmd10(w, { type: 'setDoors', open: true });
  offPan(w, 'watch_glass');
  // Cargar con la espátula fuera de la cabina, en porciones.
  let added = 0;
  while (added < targetG - 0.01) {
    cmd10(w, { type: 'scoop', amountG: Math.min(0.2, targetG - added + 0.02) });
    const before = w.solids.watchGlassG;
    cmd10(w, { type: 'tapSpatula', targetId: 'watch_glass', fraction: 1 });
    added += w.solids.watchGlassG - before;
  }
  cmd10(w, { type: 'setDoors', open: true });
  onPan(w, 'watch_glass');
  const full = readMass(w);
  cmd10(w, { type: 'setDoors', open: true });
  offPan(w, 'watch_glass');
  return { empty, full, massG: full.displayedG - empty.displayedG };
}

/** Disolución y transferencia cuantitativa al balón con aforo y homogeneización (§10.1). */
export function prepareSolution(w: P10World, opts: { homogenize?: number } = {}) {
  cmd10(w, { type: 'transferSolid', fromId: 'watch_glass', toId: 'beaker150', careful: true });
  cmd10(w, { type: 'rinseInto', sourceId: 'watch_glass', targetId: 'beaker150', ml: 10 });
  pourMl(w, 'water_bottle', 'beaker150', 40);
  for (let i = 0; i < 12; i++) {
    cmd10(w, { type: 'swirl', id: 'beaker150', intensity: 0.5 });
    run10(w, 1);
  }
  cmd10(w, { type: 'setPose', id: 'funnel', pose: pose(160, 40, 18), support: 'funnel:flask' });
  pourMl(w, 'beaker150', 'flask', 60);
  for (let i = 0; i < 3; i++) cmd10(w, { type: 'rinseInto', sourceId: 'beaker150', targetId: 'flask', ml: 8 });
  // Agua hasta cerca del aforo por el embudo, lavado del embudo y luego gota a gota con la piseta.
  pourMl(w, 'water_bottle', 'flask', Math.max(0, w.flask.trueMarkMl - 6 - w.liquids.flask.ml), 105);
  cmd10(w, { type: 'rinseInto', sourceId: 'funnel', targetId: 'flask', ml: 2 });
  cmd10(w, { type: 'setPose', id: 'funnel', pose: pose(140, 12), support: 'bench' });
  while (w.liquids.flask.ml < w.flask.trueMarkMl - 1) cmd10(w, { type: 'squeeze', targetId: 'flask', drops: 10 });
  while (w.liquids.flask.ml < w.flask.trueMarkMl - 0.025) cmd10(w, { type: 'squeeze', targetId: 'flask', drops: 1 });
  cmd10(w, { type: 'readVolume', instrument: 'flask', eyeDzCm: 0 });
  cmd10(w, { type: 'stopperFlask', on: true });
  for (let i = 0; i < (opts.homogenize ?? 12); i++) cmd10(w, { type: 'invertFlask' });
  cmd10(w, { type: 'stopperFlask', on: false });
}

/** Vierte inclinando hasta pasar aproximadamente `ml`. */
export function pourMl(w: P10World, src: string, target: string | null, ml: number, tilt = 120) {
  if (ml <= 0) return 0;
  cmd10(w, { type: 'setPour', sourceId: src, targetId: target, tiltDeg: tilt });
  let moved = 0;
  for (let i = 0; i < 20000 && moved < ml - 0.02; i++) {
    run10(w, w.params.dtS);
    moved = w.pours[src]?.transferredMl ?? moved;
    const left = ml - moved;
    if (left < 3) cmd10(w, { type: 'setPour', sourceId: src, targetId: target, tiltDeg: Math.min(tilt, left < 1 ? 92 : 100) });
  }
  cmd10(w, { type: 'stopPour', sourceId: src });
  return moved;
}

/** Baño, bureta llena e invertida sin burbujas, sujeta y aforada a 50,0 mL; tubo en U y mangueras (§11). */
export function setupGas(w: P10World, opts: { secure?: boolean; mouthSubmerged?: boolean; fill?: number } = {}) {
  if (w.liquids.beaker600.ml < 200) pourMl(w, 'tap_jug', 'beaker600', w.params.bathWaterMl);
  cmd10(w, { type: 'inspect', target: 'burette' });
  cmd10(w, { type: 'fillBurette', ml: opts.fill ?? 100 });
  cmd10(w, { type: 'invertBurette', mouthSubmerged: opts.mouthSubmerged ?? true });
  cmd10(w, { type: 'clampBurette', tiltDeg: 0 });
  aforo(w);
  cmd10(w, { type: 'setPose', id: 'u_tube', pose: pose(332, 34, 2), support: 'burette' });
  cmd10(w, { type: 'connect', id: 'c_stopper', secured: opts.secure ?? true });
  cmd10(w, { type: 'connect', id: 'c_hose_u', secured: opts.secure ?? true });
}

/** Abre la llave hasta que el menisco llega a 50,0 mL. */
export function aforo(w: P10World) {
  const s0 = solveBurette(w);
  if (s0.readingMl !== null && s0.readingMl < 50) return s0.readingMl;
  cmd10(w, { type: 'setStopcock', open: true });
  for (let i = 0; i < 4000; i++) {
    run10(w, w.params.dtS);
    const s = solveBurette(w);
    if (s.readingMl !== null && s.readingMl <= 50.02) break;
  }
  cmd10(w, { type: 'setStopcock', open: false });
  run10(w, 2);
  return solveBurette(w).readingMl;
}

/** Pipetea la alícuota al Erlenmeyer (§9.2). */
export function pipetteAliquot(w: P10World, opts: { condition?: boolean; blow?: boolean } = {}) {
  cmd10(w, { type: 'attachPropipette', on: true });
  cmd10(w, { type: 'setPose', id: 'pipette', pose: pose(160, 40, 6), support: 'flask' });
  if (opts.condition ?? true) cmd10(w, { type: 'conditionPipette' });
  cmd10(w, { type: 'aspirate', ml: w.params.pipetteMl + 1.2 });
  cmd10(w, { type: 'adjustPipette', eyeDzCm: 0 });
  cmd10(w, { type: 'setPose', id: 'pipette', pose: pose(240, 32, 8), support: 'erlenmeyer' });
  cmd10(w, { type: 'deliverPipette', targetId: 'erlenmeyer', blow: opts.blow ?? false });
}

/** Mide el vinagre en la probeta (§9.3). */
export function measureVinegar(w: P10World, ml = 10) {
  pourMl(w, 'vinegar_bottle', 'cylinder', ml - w.liquids.cylinder.ml, 110);
  return cmd10(w, { type: 'readVolume', instrument: 'cylinder', eyeDzCm: 0 }).value!;
}

/** Ensayo: prueba de hermeticidad, vinagre, tapado rápido, agitación suave y espera al equilibrio (§18). */
export function runReaction(w: P10World, opts: { sealDelayS?: number; swirl?: number; waitS?: number } = {}) {
  cmd10(w, { type: 'insertStopper', on: true });
  const lt = cmd10(w, { type: 'leakTest' });
  cmd10(w, { type: 'insertStopper', on: false });
  cmd10(w, { type: 'addVinegar' });
  run10(w, opts.sealDelayS ?? 1);
  cmd10(w, { type: 'insertStopper', on: true });
  for (let i = 0; i < 90; i++) {
    cmd10(w, { type: 'swirl', id: 'erlenmeyer', intensity: opts.swirl ?? 0.35 });
    run10(w, 1);
  }
  run10(w, opts.waitS ?? 300);
  return lt;
}

/** Lecturas para el cálculo de R (§18.1, pasos 15–19). */
export function gasMeasurements(w: P10World) {
  cmd10(w, { type: 'setPose', id: 'thermometer', pose: pose(336, 30, 4), support: 'beaker600' });
  run10(w, 60);
  const T = cmd10(w, { type: 'readThermometer' }).value!;
  const V = cmd10(w, { type: 'readVolume', instrument: 'burette', eyeDzCm: 0 });
  const P = cmd10(w, { type: 'readBarometer', source: 'LOCAL' }).value!;
  cmd10(w, { type: 'setPose', id: 'ruler', pose: pose(337, 30, 0), support: 'beaker600' });
  cmd10(w, { type: 'alignRuler', aligned: true });
  const h = cmd10(w, { type: 'measureHeight', eyeDzCm: 0 }).value!;
  return { tC: T, readingMl: V.value!, readOk: V.ok, mmHg: P, hMm: h };
}

/** Lleva el émbolo a una marca sosteniéndolo y espera la estabilidad (§23.2). */
export function plungerTo(w: P10World, ml: number, opts: { holdS?: number; speedMlS?: number } = {}) {
  const s = w.syringe;
  const speed = opts.speedMlS ?? 2;
  const steps = Math.max(1, Math.ceil(Math.abs(ml - s.targetMl) / (speed * w.params.dtS)));
  const from = s.targetMl;
  for (let i = 1; i <= steps; i++) {
    cmd10(w, { type: 'setPlunger', targetMl: from + ((ml - from) * i) / steps, held: true });
    run10(w, w.params.dtS);
  }
  // El estudiante corrige hasta que el borde del sello queda en la marca.
  for (let k = 0; k < 6; k++) {
    run10(w, 0.3);
    const err = ml - s.markMl;
    if (Math.abs(err) < 0.02) break;
    cmd10(w, { type: 'setPlunger', targetMl: s.targetMl + err, held: true });
  }
  run10(w, opts.holdS ?? 6);
  return s.markMl;
}

export function boyleSetup(w: P10World) {
  cmd10(w, { type: 'inspect', target: 'sensor' });
  cmd10(w, { type: 'inspect', target: 'syringe' });
  cmd10(w, { type: 'setPlunger', targetMl: 10, held: true });
  run10(w, 2);
  cmd10(w, { type: 'setPlunger', targetMl: 10, held: false });
  run10(w, 1);
  cmd10(w, { type: 'setPose', id: 'syringe', pose: pose(440, 34, 4), support: 'sensor' });
  cmd10(w, { type: 'connectSyringe', on: true });
  cmd10(w, { type: 'startCollection', on: true });
}

export function boyleCollect(w: P10World, marks = [5, 7, 9, 11, 13, 15, 17, 19], opts: { dead?: number; speedMlS?: number; holdS?: number } = {}) {
  const dead = opts.dead ?? w.sensor.internalVolumeMl;
  for (const m of marks) {
    plungerTo(w, m, { speedMlS: opts.speedMlS, holdS: opts.holdS });
    let r = cmd10(w, { type: 'keepPoint', enteredTotalMl: m + dead });
    for (let k = 0; k < 10 && !r.ok && r.code === 'UNSTABLE'; k++) {
      run10(w, 2);
      r = cmd10(w, { type: 'keepPoint', enteredTotalMl: m + dead });
    }
  }
  return w.points;
}

export { sensorStable };

/** Ruta ideal completa de la Parte A (una réplica): devuelve la lectura inicial y las mediciones. */
export function partA(w: P10World, opts: { sealDelayS?: number; swirl?: number; secure?: boolean; mouthSubmerged?: boolean; condition?: boolean; homogenize?: number; vinegarMl?: number } = {}) {
  cmd10(w, { type: 'confirmPpe' });
  for (const t of ['abalance', 'burette', 'hose', 'syringe']) cmd10(w, { type: 'inspect', target: t });
  setupGas(w, { secure: opts.secure, mouthSubmerged: opts.mouthSubmerged });
  const r0 = cmd10(w, { type: 'readVolume', instrument: 'burette', eyeDzCm: 0 });
  const m = weighBicarb(w);
  prepareSolution(w, { homogenize: opts.homogenize });
  pipetteAliquot(w, { condition: opts.condition });
  const vin = measureVinegar(w, opts.vinegarMl ?? 10);
  const lt = runReaction(w, { sealDelayS: opts.sealDelayS, swirl: opts.swirl });
  const g = gasMeasurements(w);
  return { r0: r0.value!, r0ok: r0.ok, m, vin, lt, g };
}

/** Segunda réplica con el sistema preparado: reactor vacío, bureta llena e invertida de nuevo, nueva alícuota. */
export function secondReplicate(w: P10World) {
  cmd10(w, { type: 'insertStopper', on: false });
  cmd10(w, { type: 'emptyReactor' });
  cmd10(w, { type: 'setPose', id: 'thermometer', pose: pose(364, 16, 0.6), support: 'bench' });
  cmd10(w, { type: 'setPose', id: 'ruler', pose: pose(316, 20, 0.2), support: 'bench' });
  cmd10(w, { type: 'setPose', id: 'burette', pose: pose(300, 14, 0.7), support: 'bench' });
  cmd10(w, { type: 'fillBurette', ml: 100 });
  cmd10(w, { type: 'invertBurette', mouthSubmerged: true });
  cmd10(w, { type: 'clampBurette', tiltDeg: 0 });
  aforo(w);
  const r0 = cmd10(w, { type: 'readVolume', instrument: 'burette', eyeDzCm: 0 });
  pipetteAliquot(w);
  const vin = measureVinegar(w, 10);
  runReaction(w);
  const g = gasMeasurements(w);
  return { r0: r0.value!, vin, g };
}
