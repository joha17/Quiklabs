/**
 * Ayudantes de prueba de F102: rutas del estudiante expresadas con los MISMOS comandos que la escena y el panel
 * accesible (nada de atajos del dominio). Sirven a las pruebas de integración, de repetición y a la demostración.
 */
import type { F102Command, F102DispatchResult } from '../simulation/f102-world/commands';
import type { F102Params, F102World, ReadingF2 } from '../simulation/f102-world/types';
import { dispatchF102, runF102For } from '../simulation/f102-world/world';
import { newPracticeF102World } from '../practices/practice-f102';
import type { F102Scenario } from '../practices/practice-f102/error-scenarios';
import type { RouteIdsF2 } from '../practices/practice-f102/notebook-fill';

export function worldF2(opts: { seed?: number; scenarios?: F102Scenario[]; params?: Partial<F102Params>; scientificMode?: F102Params['scientificMode'] } = {}): F102World {
  return newPracticeF102World({ mode: 'PRACTICE', seed: opts.seed ?? 102, scenarios: opts.scenarios, params: opts.params, scientificMode: opts.scientificMode });
}
export const cmdF2 = (w: F102World, c: F102Command): F102DispatchResult => dispatchF102(w, c);
export const runF2 = (w: F102World, s: number) => runF102For(w, s);
export const readingOfF2 = (w: F102World, r: F102DispatchResult): ReadingF2 => w.readings[r.id!];

export function ppeF2(w: F102World) {
  for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) cmdF2(w, { type: 'equipPpe', item, on: true });
  return cmdF2(w, { type: 'startWork' });
}

export const INSPECT_F2 = ['track01', 'gate1', 'gate2', 'gateTimer01', 'inclinometer01', 'cart01', 'tapeTimer01', 'pulley01', 'tower01', 'photocell01', 'motionSensor01'];
export function exploreF2(w: F102World) {
  for (const t of INSPECT_F2) cmdF2(w, { type: 'inspect', target: t });
}

// ─────────────────────────── A — nivelación ───────────────────────────

/** Cero sobre la mesada, lectura sobre el carril y vueltas del tornillo hasta |θ| ≤ 0,1° (como lo haría el estudiante). */
export function levelTrack(w: F102World, opts: { zero?: boolean; wait?: number } = {}) {
  if (opts.zero ?? true) {
    cmdF2(w, { type: 'placeInclinometer', where: 'bench' });
    runF2(w, 2);
    cmdF2(w, { type: 'zeroInclinometer' });
  }
  cmdF2(w, { type: 'placeInclinometer', where: 'track' });
  let r: F102DispatchResult = { ok: false };
  for (let i = 0; i < 8; i++) {
    runF2(w, opts.wait ?? 2);
    r = cmdF2(w, { type: 'readInclinometer' });
    const deg = r.value ?? 0;
    if (Math.abs(deg) < 0.05) break;
    // Vueltas: Δh = tan θ · separación de los pies, con el paso del tornillo.
    const turns = -Math.round((Math.tan((deg * Math.PI) / 180) * w.params.feetSpanM * 1000) / w.params.footPitchMm);
    cmdF2(w, { type: 'turnFootScrew', turns });
  }
  cmdF2(w, { type: 'placeInclinometer', where: 'bench' });
  return r;
}

// ─────────────────────────── B — compuertas y MRU ───────────────────────────

export function placeGates(w: F102World, g1Cm = 50, g2Cm = 80, opts: { connect?: boolean; align?: boolean } = {}) {
  // Primero la más lejana, para que las bases no se crucen.
  cmdF2(w, { type: 'setGatePos', gateId: 'gate2', sCm: g2Cm });
  cmdF2(w, { type: 'setGatePos', gateId: 'gate1', sCm: g1Cm });
  if (opts.align ?? true) for (const g of ['gate1', 'gate2']) cmdF2(w, { type: 'setGateYaw', gateId: g, yawDeg: 0 });
  if (opts.connect ?? true) for (const g of ['gate1', 'gate2']) cmdF2(w, { type: 'connectGate', gateId: g, on: true });
}

export function measureSetup(w: F102World) {
  return {
    gate1: cmdF2(w, { type: 'readRuler', target: 'gate1', mark: 'index', viewDeg: 0 }).id!,
    gate2: cmdF2(w, { type: 'readRuler', target: 'gate2', mark: 'index', viewDeg: 0 }).id!,
    flag: cmdF2(w, { type: 'readRuler', target: 'flag', mark: 'index', viewDeg: 0 }).id!,
  };
}

/** Corrida con el lanzador: carga la muesca, apoya el carro, arma el temporizador, dispara y lo ataja tras la compuerta 2. */
export function launcherRun(w: F102World, opts: { notch?: number; pushMs?: number; catchIt?: boolean } = {}) {
  cmdF2(w, { type: 'holdCart', sCm: 30 });
  cmdF2(w, { type: 'cockLauncher', notchCm: opts.notch ?? 1 });
  cmdF2(w, { type: 'holdCart', sCm: 0 });
  cmdF2(w, { type: 'releaseCart', pushMs: opts.pushMs ?? 0 });
  runF2(w, 0.2);
  cmdF2(w, { type: 'armGateTimer' });
  cmdF2(w, { type: 'pullLatch' });
  const g2 = w.gates.gate2.s;
  for (let i = 0; i < 120 && w.cart.s < g2 + 0.1 && (opts.catchIt ?? true); i++) runF2(w, 0.05);
  if (!(opts.catchIt ?? true)) runF2(w, 4);
  const r = cmdF2(w, { type: 'readGateTimer' });
  cmdF2(w, { type: 'holdCart', sCm: 30 });
  return r;
}

// ─────────────────────────── C — masa colgante y cinta ───────────────────────────

export function hangMass(w: F102World, masses = ['m20a'], opts: { seat?: boolean } = {}) {
  cmdF2(w, { type: 'holdCart', sCm: 30 });
  cmdF2(w, { type: 'attachString', on: true });
  if (opts.seat ?? true) cmdF2(w, { type: 'seatString', on: true });
  cmdF2(w, { type: 'hangHanger', on: true });
  for (const m of masses) cmdF2(w, { type: 'loadMass', massId: m, on: true });
}

export function prepareTape(w: F102World, tension = true) {
  cmdF2(w, { type: 'attachTape', on: true });
  if (tension) cmdF2(w, { type: 'tensionTape' });
}

export function tapeRun(w: F102World, opts: { seconds?: number; pushMs?: number; lateStart?: boolean } = {}) {
  cmdF2(w, { type: 'holdCart', sCm: 30 });
  if (!opts.lateStart) cmdF2(w, { type: 'startTape' });
  runF2(w, 0.2);
  cmdF2(w, { type: 'releaseCart', pushMs: opts.pushMs ?? 0 });
  if (opts.lateStart) {
    runF2(w, 0.3);
    cmdF2(w, { type: 'startTape' });
  }
  runF2(w, opts.seconds ?? 1.1);
  const r = cmdF2(w, { type: 'stopTape' });
  cmdF2(w, { type: 'holdCart', sCm: 30 });
  return r;
}

export function unhang(w: F102World, masses = ['m20a']) {
  cmdF2(w, { type: 'holdCart', sCm: 30 });
  for (const m of masses) cmdF2(w, { type: 'loadMass', massId: m, on: false });
  cmdF2(w, { type: 'hangHanger', on: false });
  cmdF2(w, { type: 'attachString', on: false });
  cmdF2(w, { type: 'attachTape', on: false });
}

// ─────────────────────────── D — torre ───────────────────────────

export function setMagnet(w: F102World, hCm: number) {
  cmdF2(w, { type: 'tightenClamp', on: false });
  cmdF2(w, { type: 'setMagnetHeight', hCm });
  cmdF2(w, { type: 'tightenClamp', on: true });
}

/** Cuelga el cuerpo del electroimán, lee la escala, arma el cronómetro, corta la corriente y lee el tiempo. */
export function magnetDrop(w: F102World, hCm: number, opts: { body?: string; offsetMm?: number; viewDeg?: number; loose?: boolean } = {}) {
  const body = opts.body ?? 'sphereS';
  setMagnet(w, hCm);
  if (opts.loose) cmdF2(w, { type: 'tightenClamp', on: false });
  cmdF2(w, { type: 'switchMagnet', on: true });
  cmdF2(w, { type: 'attachToMagnet', id: body, offsetMm: opts.offsetMm ?? 0 });
  const h = cmdF2(w, { type: 'readTowerScale', viewDeg: opts.viewDeg ?? 0 });
  cmdF2(w, { type: 'armFallTimer' });
  cmdF2(w, { type: 'switchMagnet', on: false });
  runF2(w, 1.2);
  const t = cmdF2(w, { type: 'readFallTimer' });
  cmdF2(w, { type: 'pickUpBody', id: body });
  if (opts.loose) cmdF2(w, { type: 'tightenClamp', on: true });
  return { h, t };
}

// ─────────────────────────── E — filtros y sensor ───────────────────────────

export function prepareMotion(w: F102World, opts: { range?: 'near' | 'far'; hz?: 10 | 50; aim?: number; calibrate?: boolean; armOut?: boolean; connect?: boolean } = {}) {
  if (opts.armOut ?? true) cmdF2(w, { type: 'swingMagnetArm', armIn: false });
  if (opts.connect ?? true) cmdF2(w, { type: 'connectMotion', on: true });
  cmdF2(w, { type: 'setMotionRange', range: opts.range ?? 'far' });
  cmdF2(w, { type: 'setMotionRate', hz: opts.hz ?? 50 });
  cmdF2(w, { type: 'aimMotion', aimDeg: opts.aim ?? 0 });
  if (opts.calibrate ?? true) cmdF2(w, { type: 'calibrateMotion' });
}

export function filterDrop(w: F102World, base: string, heightCm = 120, opts: { offsetMm?: number; seconds?: number } = {}) {
  cmdF2(w, { type: 'startMotion' });
  runF2(w, 0.2);
  cmdF2(w, { type: 'dropByHand', id: base, heightCm, offsetMm: opts.offsetMm ?? 0, pushMs: 0 });
  runF2(w, opts.seconds ?? 2.6);
  const r = cmdF2(w, { type: 'stopMotion' });
  cmdF2(w, { type: 'pickUpBody', id: base });
  return r;
}

// ─────────────────────────── Ruta ideal ───────────────────────────

export interface IdealResultF2 {
  w: F102World;
  ids: RouteIdsF2;
}

/** Ruta ideal completa por comandos: nivelación, MRU, MRUA, caída libre, filtros y cierre. */
export function idealRouteF2(seed = 102, scenarios: F102Scenario[] = [], mode?: F102Params['scientificMode'], start?: F102World, resume?: (w: F102World) => F102World): IdealResultF2 {
  let w = start ?? worldF2({ seed, scenarios, scientificMode: mode });
  ppeF2(w);
  exploreF2(w);
  if (resume) w = resume(w);
  const angle = levelTrack(w).id!;
  placeGates(w, 50, 80);
  const setup = measureSetup(w);
  const uniform = [launcherRun(w).id!, launcherRun(w).id!];
  placeGates(w, 40, 80);
  uniform.push(launcherRun(w).id!);
  placeGates(w, 50, 80);
  hangMass(w);
  prepareTape(w);
  const tape = [tapeRun(w).id!, tapeRun(w).id!, tapeRun(w).id!];
  unhang(w);
  cmdF2(w, { type: 'capPhotocell', on: false });
  const heights: string[] = [];
  const falls: string[] = [];
  // S11: la esfera pequeña es hueca y siente el aire; la caída libre se mide con la maciza grande.
  const body = scenarios.includes('F102-S11_drag_sphere' as F102Scenario) ? 'sphereL' : 'sphereS';
  for (const h of [60, 90, 120]) {
    const r = magnetDrop(w, h, { body });
    heights.push(r.h.id!);
    falls.push(r.t.id!);
  }
  prepareMotion(w);
  const drag = [filterDrop(w, 'f1').id!];
  cmdF2(w, { type: 'stackFilter', filterId: 'f2', onto: 'f1', offsetMm: 0 });
  drag.push(filterDrop(w, 'f1').id!);
  cmdF2(w, { type: 'closeStation' });
  return { w, ids: { setup, angle, uniform, tape, heights, falls, drag } };
}

export { fillNotebookF2 } from '../practices/practice-f102/notebook-fill';
