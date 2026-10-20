/**
 * Ayudantes de prueba de la Práctica 1: rutas del estudiante expresadas con los MISMOS comandos que la interfaz
 * (nada de atajos del dominio). Sirven a las pruebas de integración y de repetición.
 */
import type { P01Command, P01DispatchResult } from '../simulation/density-world/commands';
import type { P01Params, P01World, Pose, Reading01 } from '../simulation/density-world/types';
import { dispatchP01, fluidMl, pipetteAboveMarkMl, runP01For } from '../simulation/density-world/world';
import { newPractice01World } from '../practices/practice-01';
import type { P01Scenario } from '../practices/practice-01/error-scenarios';
import { PAN_POS } from '../practices/practice-01/definition';

export const pose = (x: number, y: number, z = 0): Pose => ({ x, y, z, rotationRad: 0 });

export function world01(opts: { seed?: number; scenarios?: P01Scenario[]; params?: Partial<P01Params> } = {}): P01World {
  return newPractice01World({ mode: 'PRACTICE', seed: opts.seed ?? 101, scenarios: opts.scenarios, params: opts.params });
}
export const cmd01 = (w: P01World, c: P01Command): P01DispatchResult => dispatchP01(w, c);
export const run01 = (w: P01World, s: number) => runP01For(w, s);
const reading = (w: P01World, r: P01DispatchResult): Reading01 => w.readings[r.id!];

export function ppe(w: P01World) {
  for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) cmd01(w, { type: 'equipPpe', item, on: true });
  return cmd01(w, { type: 'startWork' });
}

export function recognize(w: P01World) {
  for (const t of ['balance01', 'pipette25', 'cylinder50', 'thermometer01', 'caliper01']) cmd01(w, { type: 'inspect', target: t });
}

/** Encender, nivelar, esperar el calentamiento y poner en cero con el platillo vacío. */
export function balanceCheck(w: P01World) {
  cmd01(w, { type: 'powerBalance', on: true });
  cmd01(w, { type: 'levelBalance' });
  run01(w, 10);
  cmd01(w, { type: 'tare' });
  run01(w, 2);
}

export const onPan = (w: P01World, id: string) => cmd01(w, { type: 'setPose', id, pose: pose(PAN_POS.x, PAN_POS.y, PAN_POS.z), support: 'pan' });
export const offPan = (w: P01World, id: string, at = pose(180, 20)) => cmd01(w, { type: 'setPose', id, pose: at, support: 'bench' });

/** Cero con el platillo vacío (antes de pesar por diferencia). */
export function zeroEmpty(w: P01World) {
  run01(w, 2);
  cmd01(w, { type: 'tare' });
  run01(w, 1);
}

/** Lectura estable de la balanza. */
export function readMass(w: P01World, waitS = 2): Reading01 {
  run01(w, waitS);
  for (let i = 0; i < 40 && !w.balance.stable; i++) run01(w, 0.5);
  return reading(w, cmd01(w, { type: 'readBalance' }));
}

/** Pone la punta de la pipeta en un recipiente (como al soltarla allí). */
export const pipetteTo = (w: P01World, where: string) => cmd01(w, { type: 'setPose', id: 'pipette25', pose: { ...w.objects[where].pose, z: 6 }, support: where });

/** Llena la pipeta por encima de la marca, ajusta el menisco con el ojo a nivel y limpia la gota exterior. */
export function fillPipette(w: P01World, source: string, opts: { eyeDz?: number; wipe?: boolean } = {}) {
  if (!w.pipette.fillerAttached) cmd01(w, { type: 'attachFiller', on: true });
  pipetteTo(w, source);
  cmd01(w, { type: 'setAspirate', suction01: 0.6 });
  for (let i = 0; i < 400 && pipetteAboveMarkMl(w) < 0.6; i++) run01(w, 0.05);
  cmd01(w, { type: 'setAspirate', suction01: 0 });
  cmd01(w, { type: 'adjustMeniscus', eyeDzCm: opts.eyeDz ?? 0 });
  // Se saca del agua (queda una gota por fuera) y se limpia el exterior.
  cmd01(w, { type: 'setPose', id: 'pipette25', pose: { ...w.objects.pipette25.pose, z: 16 }, support: 'hand' });
  if (opts.wipe !== false) cmd01(w, { type: 'wipeTip', method: 'outside' });
}

/** Descarga completa en el receptor: abre, espera el tiempo de escurrido y retira la pipeta. */
export function deliver(w: P01World, flask = 'erlenmeyer150', waitS = 17) {
  pipetteTo(w, flask);
  cmd01(w, { type: 'setPipetteRelease', release01: 1 });
  run01(w, waitS);
  cmd01(w, { type: 'setPipetteRelease', release01: 0 });
  cmd01(w, { type: 'setPose', id: 'pipette25', pose: pose(146, 10, 0.6), support: 'bench' });
}

/** Lecturas de prueba de 25 mL (§5.A): la probeta llenada desde el depósito y la pipeta a la marca. */
export function trials(w: P01World) {
  pourInto(w, 'waterRoom01', 'cylinder50', 25);
  run01(w, 2);
  const probe = reading(w, cmd01(w, { type: 'readVolume', instrumentId: 'cylinder50', eyeDzCm: 0 }));
  cmd01(w, { type: 'emptyInto', sourceId: 'cylinder50', targetId: 'waste01' });
  fillPipette(w, 'waterRoom01');
  const pip = reading(w, cmd01(w, { type: 'readVolume', instrumentId: 'pipette25', eyeDzCm: 0 }));
  // De vuelta al depósito.
  pipetteTo(w, 'waterRoom01');
  cmd01(w, { type: 'setPipetteRelease', release01: 1 });
  run01(w, 14);
  cmd01(w, { type: 'setPipetteRelease', release01: 0 });
  return { probe, pip };
}

/** Vierte de un recipiente a otro hasta que el receptor tenga `ml` (aprox.), con la piseta para enrasar. */
export function pourInto(w: P01World, src: string, dst: string, ml: number) {
  cmd01(w, { type: 'setPour', sourceId: src, targetId: dst, tiltDeg: 100 });
  for (let i = 0; i < 600 && fluidMl(w.fluids[dst]) < ml - 1.5; i++) run01(w, 0.05);
  cmd01(w, { type: 'stopPour', sourceId: src });
  for (let i = 0; i < 200 && fluidMl(w.fluids[dst]) < ml - 0.04; i++) cmd01(w, { type: 'squeeze', targetId: dst, drops: 1 });
}

/** Una serie de agua (§5.B) con la técnica correcta. */
export function waterSeries(w: P01World, series: 'room' | 'cold') {
  const src = series === 'room' ? 'waterRoom01' : 'waterCold01';
  onPan(w, 'erlenmeyer150');
  run01(w, 2.5);
  cmd01(w, { type: 'tare' });
  if (w.pipette.residueFrom && w.pipette.residueFrom !== src) {
    pipetteTo(w, src);
    cmd01(w, { type: 'rinsePipette' });
  }
  fillPipette(w, src);
  deliver(w);
  const mass = readMass(w, 3);
  cmd01(w, { type: 'setPose', id: 'thermometer01', pose: { ...w.objects.erlenmeyer150.pose, z: 3 }, support: 'erlenmeyer150' });
  run01(w, 25);
  const temp = reading(w, cmd01(w, { type: 'readThermometer' }));
  cmd01(w, { type: 'setPose', id: 'thermometer01', pose: pose(150, 24, 0.6), support: 'bench' });
  offPan(w, 'erlenmeyer150', pose(172, 24));
  cmd01(w, { type: 'emptyInto', sourceId: 'erlenmeyer150', targetId: 'waste01' });
  cmd01(w, { type: 'cleanObject', objectId: 'erlenmeyer150', action: 'dry' });
  return { mass, temp };
}

/** Enfría el depósito en el baño con hielo hasta que de verdad esté frío. */
export function coolReservoir(w: P01World, s = 300) {
  cmd01(w, { type: 'setPose', id: 'waterCold01', pose: pose(120, 50, 2), support: 'iceBath01' });
  run01(w, s);
  cmd01(w, { type: 'setPose', id: 'waterCold01', pose: pose(128, 26), support: 'bench' });
}

/** Clavos por desplazamiento (§5.C) con la técnica correcta. */
export function displacement(w: P01World, opts: { gentle?: boolean; eyeDz?: number; tap?: boolean } = {}) {
  zeroEmpty(w);
  onPan(w, 'weighBoat01');
  const boat = readMass(w, 2.5);
  cmd01(w, { type: 'transferNails', from: 'nailsBatch01', to: 'weighBoat01', count: 6, gentle: true, tool: 'tongs' });
  const boatNails = readMass(w, 2.5);
  offPan(w, 'weighBoat01', pose(248, 12, 0.1));
  pourInto(w, 'waterRoom01', 'cylinder50', 20);
  run01(w, 2);
  const vI = reading(w, cmd01(w, { type: 'readVolume', instrumentId: 'cylinder50', eyeDzCm: 0 }));
  cmd01(w, { type: 'transferNails', from: 'weighBoat01', to: 'cylinder50', count: 6, gentle: opts.gentle ?? true, tool: 'tongs' });
  run01(w, 2);
  if (opts.tap !== false) cmd01(w, { type: 'tapCylinder' });
  run01(w, 2);
  const vF = reading(w, cmd01(w, { type: 'readVolume', instrumentId: 'cylinder50', eyeDzCm: opts.eyeDz ?? 0 }));
  return { boat, boatNails, vI, vF };
}

/** Cilindro por geometría (§5.D) con la técnica correcta. */
export function geometry(w: P01World) {
  zeroEmpty(w);
  onPan(w, 'watchGlass01');
  const glass = readMass(w, 2.5);
  cmd01(w, { type: 'setPose', id: 'solidCylinder01', pose: { ...w.objects.watchGlass01.pose, z: PAN_POS.z + 0.4 }, support: 'watchGlass01' });
  const total = readMass(w, 2.5);
  offPan(w, 'watchGlass01', pose(338, 28));
  cmd01(w, { type: 'setPose', id: 'solidCylinder01', pose: pose(352, 40), support: 'bench' });
  cmd01(w, { type: 'setCaliper', target: 'empty', angleDeg: 0, force01: 0.4, orientationDeg: 0 });
  cmd01(w, { type: 'readCaliper' });
  const read = (target: 'diameter' | 'height', orientationDeg: number) => {
    cmd01(w, { type: 'setCaliper', target, angleDeg: 0, force01: 0.4, orientationDeg });
    return reading(w, cmd01(w, { type: 'readCaliper' }));
  };
  return { glass, total, d1: read('diameter', 0), d2: read('diameter', 90), h1: read('height', 0), h2: read('height', 180) };
}
