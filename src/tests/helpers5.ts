/**
 * Ayudantes de prueba de la Práctica 5: rutas del estudiante expresadas con los mismos comandos que la interfaz.
 */
import type { P5Command, P5DispatchResult } from '../simulation/stoich-world/commands';
import type { FlameCommand } from '../simulation/flame-world/commands';
import type { P5Measurement, P5World, Pose } from '../simulation/stoich-world/types';
import { balanceTargetG, dispatchStoich, mouthPos, runStoichFor, stepStoich, tubeAxis, tubeTempC } from '../simulation/stoich-world/world';
import { CTX5, newPractice5World } from '../practices/practice-05';
import type { P5Scenario } from '../practices/practice-05/error-scenarios';
import { MOLAR_MASS } from '../simulation/stoichiometry/stoich';

export const ctx5 = CTX5;
export const pose = (x: number, y: number, z = 0): Pose => ({ x, y, z, rotationRad: 0 });

export function world5(opts: { seed?: number; scenarios?: P5Scenario[] } = {}): P5World {
  return newPractice5World({ mode: 'PRACTICE', seed: opts.seed ?? 1234, scenarios: opts.scenarios });
}
export const cmd5 = (w: P5World, c: P5Command): P5DispatchResult => dispatchStoich(w, c, ctx5);
export const gas5 = (w: P5World, c: FlameCommand) => dispatchStoich(w, { type: 'gas', cmd: c }, ctx5);
export const run5 = (w: P5World, s: number) => runStoichFor(w, s, ctx5);
export const step5 = (w: P5World) => stepStoich(w, ctx5);

/** Mueve las pesas hasta equilibrar (como un estudiante: 100 g, 10 g y luego la pesa fina), espera y lee. */
export function balanceAndRead(w: P5World, waitS = 12): P5Measurement {
  for (let pass = 0; pass < 3; pass++) {
    const target = balanceTargetG(w);
    const r0 = Math.max(0, Math.min(500, Math.floor(target / 100) * 100));
    const r1 = Math.max(0, Math.min(90, Math.floor((target - r0) / 10) * 10));
    const r2 = Math.max(0, Math.min(10, Math.round((target - r0 - r1) * 100) / 100));
    cmd5(w, { type: 'setRider', beam: 0, valueG: r0 });
    cmd5(w, { type: 'setRider', beam: 1, valueG: r1 });
    cmd5(w, { type: 'setRider', beam: 2, valueG: r2 });
    run5(w, waitS / 3);
  }
  cmd5(w, { type: 'readBalance' });
  return w.measurements[w.measurements.length - 1];
}

/** §6.4 — calibración: platillo vacío, pesas en cero, esperar, ajustar el tornillo, comprobar. */
export function calibrate(w: P5World) {
  for (const b of [0, 1, 2] as const) cmd5(w, { type: 'setRider', beam: b, valueG: 0 });
  if (w.balance.levelErrorDeg) cmd5(w, { type: 'levelBalance' });
  run5(w, 6);
  const err = w.balance.zeroErrorG - w.balance.zeroScrewG + w.balance.levelErrorDeg * 0.06;
  cmd5(w, { type: 'turnZeroScrew', deltaG: err });
  run5(w, 10);
  return cmd5(w, { type: 'readBalance' });
}

export function weighTube(w: P5World, waitS = 12): P5Measurement {
  const t = w.objects.tube;
  if (t.support !== 'pan') cmd5(w, { type: 'setPose', id: 'tube', pose: pose(70, 38, 9.5), support: 'pan' });
  const m = balanceAndRead(w, waitS);
  cmd5(w, { type: 'setPose', id: 'tube', pose: pose(100, 26, 0), support: 'hand' });
  return m;
}

/** Añade un sólido con su espátula dedicada hasta acercarse a la masa pedida (g). */
export function addSolid(w: P5World, species: 'KClO3' | 'MnO2', targetG: number) {
  const spat = species === 'KClO3' ? 'spatula_kclo3' : 'spatula_mno2';
  const bottle = species === 'KClO3' ? 'bottle_kclo3' : 'bottle_mno2';
  cmd5(w, { type: 'openBottle', id: bottle, open: true });
  const inTube = () => w.tube.contents[species] * MOLAR_MASS[species];
  for (let i = 0; i < 12 && inTube() < targetG * 0.97; i++) {
    const left = targetG - inTube();
    const amount = species === 'MnO2' ? 'tip' : left > 0.6 ? 'level' : left > 0.3 ? 'small' : 'tip';
    cmd5(w, { type: 'scoop', spatulaId: spat, bottleId: bottle, amount });
    cmd5(w, { type: 'tip', spatulaId: spat, targetId: 'tube', fraction: 1 });
  }
  cmd5(w, { type: 'openBottle', id: bottle, open: false });
}

export function mix(w: P5World, taps = 14, strength = 0.5) {
  cmd5(w, { type: 'setPose', id: 'tube', pose: pose(205, 26, 8), support: 'hand' });
  for (let i = 0; i < taps; i++) cmd5(w, { type: 'tap', strength });
}

/** §10.1 — montaje: nuez apretada, sujeción en el tercio superior, inclinado, boca hacia el fondo, pantalla. */
export function mount(w: P5World, opts: { angleDeg?: number; yawDeg?: number; grip?: number; heightCm?: number } = {}) {
  cmd5(w, { type: 'setClamp', nutTight: true, grip: opts.grip ?? 0.5, angleDeg: opts.angleDeg ?? 20, mouthYawDeg: opts.yawDeg ?? 0, heightCm: opts.heightCm ?? 23, gripAt: 0.66 });
  cmd5(w, { type: 'setPose', id: 'tube', pose: pose(420, 33, 23), support: 'clamp' });
  cmd5(w, { type: 'setPose', id: 'shield', pose: pose(430, 12, 0), support: 'bench' });
}

/** Lleva el mechero bajo la muestra, con la boca a `dz` cm por debajo del punto de la muestra. */
export function burnerUnderSample(w: P5World, offsetCm = 0) {
  const ax = tubeAxis(w, ctx5);
  gas5(w, { type: 'setPose', id: 'burner', pose: pose(ax.sample.x + offsetCm, ax.sample.y, 0), support: 'bench' });
}

/** Enciende el mechero (llama azul) con la técnica de la Práctica 3; `needle` regula el tamaño. */
export function lightBurner(w: P5World, needle = 0.5, air = 0.7) {
  for (const t of ['extinguisher', 'blanket', 'estop', 'hose', 'burner']) cmd5(w, { type: 'inspect', target: t });
  gas5(w, { type: 'setExtraction', on: true });
  gas5(w, { type: 'connectHose', connected: true });
  const m = mouthPos(w.gas, ctx5.gasCtx);
  gas5(w, { type: 'setValve', valve: 'AIR', value: 0 });
  gas5(w, { type: 'setValve', valve: 'TABLE', value: 1 });
  gas5(w, { type: 'setPose', id: 'lighter', pose: pose(m.x + 1, m.y - 2, m.z + 0.6), support: 'hand' });
  gas5(w, { type: 'spark', on: true });
  for (let i = 1; i <= 12; i++) {
    gas5(w, { type: 'setValve', valve: 'NEEDLE', value: (0.3 * i) / 12 });
    step5(w);
  }
  gas5(w, { type: 'spark', on: false });
  gas5(w, { type: 'setPose', id: 'lighter', pose: pose(396, 12, 1.2), support: 'bench' });
  run5(w, 1);
  for (const a of [0.15, 0.3, 0.45, 0.6, 0.7].filter((x) => x <= air + 1e-9)) {
    gas5(w, { type: 'setValve', valve: 'AIR', value: a });
    run5(w, 0.5);
  }
  gas5(w, { type: 'setValve', valve: 'AIR', value: air });
  gas5(w, { type: 'setValve', valve: 'NEEDLE', value: needle });
  run5(w, 1);
}

/** Regula la llama: aguja y aire juntos (llama chica = menos gas y menos aire, sin retroceso). */
export function setFlame(w: P5World, needle: number, air: number) {
  gas5(w, { type: 'setValve', valve: 'AIR', value: air });
  gas5(w, { type: 'setValve', valve: 'NEEDLE', value: needle });
}

export function burnerOff(w: P5World) {
  gas5(w, { type: 'setValve', valve: 'AIR', value: 0 });
  run5(w, 0.3);
  gas5(w, { type: 'setValve', valve: 'NEEDLE', value: 0 });
  run5(w, 0.3);
  gas5(w, { type: 'setValve', valve: 'TABLE', value: 0 });
  run5(w, 0.5);
}

/**
 * Calentamiento gradual (§12.2): llama moderada (poco gas y poco aire) los primeros minutos, luego llama azul normal;
 * la llama se mueve suavemente bajo la muestra y el estudiante interactúa cada pocos segundos.
 */
export function heatGradually(w: P5World, totalS = 600, opts: { gentleS?: number } = {}) {
  const gentle = opts.gentleS ?? 300;
  let t = 0;
  let k = 0;
  while (t < totalS) {
    if (t === 0) setFlame(w, 0.3, 0.35);
    if (t >= gentle && t - 20 < gentle) setFlame(w, 0.5, 0.6);
    burnerUnderSample(w, k % 2 ? 0.4 : -0.4);
    cmd5(w, { type: 'stopwatch', action: 'START' });
    run5(w, 20);
    t += 20;
    k++;
  }
}

/** Retira la llama, deja enfriar en la pinza y pasa el tubo a la gradilla con la pinza para tubo. */
export function cool(w: P5World, maxS = 1800) {
  burnerOff(w);
  run5(w, 120);
  cmd5(w, { type: 'setPose', id: 'tube', pose: pose(420, 20, 10), support: 'tongs' });
  cmd5(w, { type: 'setPose', id: 'tube', pose: pose(297, 42, 0.6), support: 'rack' });
  for (let i = 0; i < maxS / 20 && tubeTempC(w.tube) > w.params.ambientC + 2; i++) {
    run5(w, 20);
    cmd5(w, { type: 'measureIR' });
    cmd5(w, { type: 'stopwatch', action: 'STOP' });
  }
}

export const g = (mol: number, sp: keyof typeof MOLAR_MASS) => mol * MOLAR_MASS[sp];
