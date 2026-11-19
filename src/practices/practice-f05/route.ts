/**
 * Ruta ideal de F05 por COMANDOS (los mismos del panel accesible y la escena). La usan las pruebas de integración, la
 * repetición del intento y, paso a paso, la demostración. No es una ayuda para el estudiante.
 */
import type { F05Command, F05DispatchResult, FbdBody, Material } from '../../simulation/f05-world/commands';
import type { F05World, PullRecord } from '../../simulation/f05-world/types';
import { BLOCK_START_S } from '../../simulation/f05-world/geometry';
import { fbdNeeds } from '../../simulation/f05-world/world';

/** Lecturas que la ruta tomó, por cuadro de la libreta. */
export interface RouteIdsF5 {
  blockM: string;
  ballastM: string;
  temp: string;
  g1: string;
  g2: string;
  slideTheta: string;
  statics: string[];
  kinetics: string[];
  loads: string[];
  angles: Array<{ id: string; material: Material }>;
  slide: string;
}

export const emptyRouteIdsF5 = (): RouteIdsF5 => ({ blockM: '', ballastM: '', temp: '', g1: '', g2: '', slideTheta: '', statics: [], kinetics: [], loads: [], angles: [], slide: '' });

export const INSPECT_F5 = ['plane01', 'block01', 'puller01', 'load01', 'spring01', 'gonio01', 'elevator01', 'catcher01', 'logger01', 'gate1', 'gate2', 'balance01', 'thermo01', 'w250a'];
/** Rapidez del motor del tirador en la ruta (cm/s), materiales de los ángulos críticos y ángulo de la bajada (°). */
export const ROUTE_DRIVE = 2;
export const ANGLE_MATERIALS: Material[] = ['wood', 'paper'];
export const SLIDE_DEG = 30;

type Cmd = (c: F05Command) => F05DispatchResult;
type Run = (s: number) => void;

/** Espera (tiempo del mundo) a que termine el tirón o la bajada en curso. */
export function waitDone(w: () => F05World, run: Run, max = 65) {
  const busy = () => (!!w().pull && !w().pull!.done) || (!!w().slide && !w().slide!.done);
  for (let i = 0; i < max / 0.25 && busy(); i++) run(0.25);
}

const stdOf = (xs: number[]) => {
  const m = xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
  return xs.length > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)) : 0;
};

/**
 * Ventanas de un tirón: el pico (desde el arranque hasta pasado el deslizamiento) y la meseta, que empieza cuando la
 * oscilación del cable se extinguió (desvío de la velocidad bajo el umbral del registrador) y termina antes de que el
 * motor llegue al final del carril.
 */
export function pullWindows(rec: PullRecord): { peak: { t0: number; t1: number }; plateau: { t0: number; t1: number } } {
  const end = rec.samples.length ? rec.samples[rec.samples.length - 1][0] : 0;
  const slip = rec.slipT ?? 0;
  const moving = rec.samples.filter((x) => x[0] > slip && Math.abs(x[4]) > 1e-4);
  const stopT = moving.length ? moving[moving.length - 1][0] : end;
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  const t1 = Math.max(slip + 2.5, stopT - 1.5);
  const limit = 0.7 * Math.max(0.002, 0.25 * (rec.setup.driveCmS / 100));
  let t0 = slip + 2;
  while (t0 < t1 - 2.5 && stdOf(rec.samples.filter((x) => x[0] >= t0 && x[0] <= t1).map((x) => x[4])) > limit) t0 += 1;
  return { peak: { t0: 0, t1: r3(slip + 0.3) }, plateau: { t0: r3(t0), t1: r3(t1) } };
}

/** Dibuja el diagrama correcto de un cuerpo y lo fija. */
export function drawFbd(cmd: Cmd, body: FbdBody) {
  for (const [force, dir, partner] of fbdNeeds(body)) cmd({ type: 'drawForce', body, force, dir, partner });
  return cmd({ type: 'lockFbd', body });
}

/** Lleva el tablero a un ángulo relativo (°) en giros de a lo sumo 40 vueltas. */
export function tiltTo(w: () => F05World, cmd: Cmd, deg: number) {
  for (let i = 0; i < 10; i++) {
    const turns = Math.round((deg - w().plane.relDeg) / w().params.degPerTurn);
    if (!turns) break;
    cmd({ type: 'turnElevator', turns: Math.max(-40, Math.min(40, turns)) });
  }
}

/** Un tirón completo: engancha, tira a rapidez constante, lee el pico y la meseta, y devuelve todo al inicio. */
export function pullTrial(w: () => F05World, cmd: Cmd, run: Run): { peak: string; mean: string } {
  cmd({ type: 'attachCable', on: true });
  // Con un resorte poco amortiguado se tira más despacio para que la oscilación se extinga antes del final del carril.
  cmd({ type: 'setDrive', cmS: w().params.springC < 2 ? 1 : ROUTE_DRIVE });
  run(0.5);
  waitDone(w, run);
  const rec = w().pulls[w().pulls.length - 1];
  const win = pullWindows(rec);
  const peak = cmd({ type: 'readPull', t0: win.peak.t0, t1: win.peak.t1 }).id ?? '';
  const mean = cmd({ type: 'readPull', t0: win.plateau.t0, t1: win.plateau.t1 }).id ?? '';
  cmd({ type: 'returnPuller' });
  cmd({ type: 'attachCable', on: false });
  cmd({ type: 'placeBlock', s: BLOCK_START_S });
  return { peak, mean };
}

/** Ángulo crítico: inclina rápido hasta 4° antes del esperado y luego de a una vuelta hasta que el bloque arranca. */
export function criticalTrial(w: () => F05World, cmd: Cmd, run: Run, startDeg: number): string {
  tiltTo(w, cmd, startDeg);
  run(1);
  for (let i = 0; i < 200 && w().tilt.slipVersion === null && w().plane.relDeg < 44; i++) {
    cmd({ type: 'turnElevator', turns: 1 });
    run(0.5);
  }
  run(2);
  const id = cmd({ type: 'readAngle', target: 'plane', viewDeg: 0 }).id ?? '';
  tiltTo(w, cmd, 0);
  run(1);
  cmd({ type: 'placeBlock', s: BLOCK_START_S });
  return id;
}

/**
 * Ruta completa: EPP y reconocimiento; bloque y lastre en la balanza tarada y temperatura; diagramas; célula de carga
 * conectada, calibrada y en cero a 200 Hz; cable a la altura del gancho; elevador bloqueado y sujeto; tres tirones con
 * el bloque solo y uno con cada carga; ángulos críticos en madera y papel; bajada a 30° con las compuertas leídas de
 * frente; cierre seguro.
 */
export function idealRouteCommandsF5(w: () => F05World, cmd: Cmd, run: Run, opts: { resume?: () => void } = {}): RouteIdsF5 {
  const ids = emptyRouteIdsF5();
  for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) cmd({ type: 'equipPpe', item, on: true });
  cmd({ type: 'startWork' });
  for (const t of INSPECT_F5) cmd({ type: 'inspect', target: t });
  opts.resume?.();
  // B — masas en la balanza tarada (bloque sin lastres) y temperatura de la sala.
  for (const m of ['w250a', 'w250b']) if (w().objects[m].support !== 'rack') cmd({ type: 'placeMass', id: m, on: 'rack' });
  cmd({ type: 'tareBalance' });
  for (const [obj, key] of [['block01', 'blockM'], ['w250a', 'ballastM']] as const) {
    cmd({ type: 'placeOnBalance', id: obj });
    run(2);
    ids[key] = cmd({ type: 'readBalance' }).id ?? '';
    cmd({ type: 'removeFromBalance' });
  }
  ids.temp = cmd({ type: 'readTemp' }).id ?? '';
  // F — diagramas de cuerpo libre antes de medir.
  drawFbd(cmd, 'blockPull');
  drawFbd(cmd, 'blockSlide');
  // A/D — superficie de madera, elevador bloqueado y su pie sujeto, tablero horizontal.
  if (w().surface.material !== 'wood') cmd({ type: 'setSurface', material: 'wood' });
  cmd({ type: 'setLock', on: true });
  cmd({ type: 'clampBase', on: true });
  tiltTo(w, cmd, 0);
  cmd({ type: 'placeBlock', s: BLOCK_START_S });
  // C — célula de carga: conectada, rango de 20 N, alineada, calibrada y en cero sin carga; registrador a 200 Hz.
  cmd({ type: 'connect', channel: 'load01', on: true });
  if (w().sensor.rangeIdx < 1) cmd({ type: 'setRange', n: 1 });
  if (w().sensor.angleDeg !== 0) cmd({ type: 'mountSensor', angleDeg: 0 });
  cmd({ type: 'setRate', hz: 200 });
  cmd({ type: 'calibrateSensor' });
  cmd({ type: 'zeroSensor' });
  cmd({ type: 'setCableHeight', cm: 2 });
  run(1);
  // Réplicas del bloque solo (pico y meseta de cada tirón).
  for (let i = 0; i < 3; i++) {
    const r = pullTrial(w, cmd, run);
    ids.statics.push(r.peak);
    ids.kinetics.push(r.mean);
  }
  // Barrido de carga: +250 g y +500 g asentados en el perno.
  ids.loads.push(ids.kinetics[0]);
  for (const m of ['w250a', 'w250b']) {
    cmd({ type: 'placeMass', id: m, on: 'block', offsetCm: 0 });
    ids.loads.push(pullTrial(w, cmd, run).mean);
  }
  for (const m of ['w250a', 'w250b']) cmd({ type: 'placeMass', id: m, on: 'rack' });
  // D — ángulos críticos en madera y papel (cable suelto, bloque quieto en la partida).
  for (const mat of ANGLE_MATERIALS) {
    if (w().surface.material !== mat) cmd({ type: 'setSurface', material: mat });
    // Cada superficie montada se mira: si está rayada, el daño queda registrado.
    cmd({ type: 'inspect', target: 'plane01' });
    run(0.5);
    const mu = w().params.mu[mat].s;
    const id = criticalTrial(w, cmd, run, Math.max(0, Math.floor((Math.atan(mu * w().params.wornFactor) * 180) / Math.PI) - 3));
    ids.angles.push({ id, material: mat });
  }
  // E — bajada en madera a 30°: compuertas leídas de frente, canales conectados, bloque retenido y suelto.
  cmd({ type: 'setSurface', material: 'wood' });
  cmd({ type: 'inspect', target: 'plane01' });
  cmd({ type: 'connect', channel: 'gates', on: true });
  cmd({ type: 'connect', channel: 'video', on: true });
  ids.g1 = cmd({ type: 'readScale', target: 'gate1', viewDeg: 0 }).id ?? '';
  ids.g2 = cmd({ type: 'readScale', target: 'gate2', viewDeg: 0 }).id ?? '';
  tiltTo(w, cmd, SLIDE_DEG);
  cmd({ type: 'placeBlock', s: 'top' });
  run(1.5);
  ids.slideTheta = cmd({ type: 'readAngle', target: 'plane', viewDeg: 0 }).id ?? '';
  cmd({ type: 'releaseBlock' });
  run(0.5);
  waitDone(w, run);
  ids.slide = cmd({ type: 'readSlide' }).id ?? '';
  // Cierre: tablero abajo y bloqueado, bloque en la partida, lastres en el estante, tirador al inicio y cable suelto.
  tiltTo(w, cmd, 0);
  run(1);
  cmd({ type: 'placeBlock', s: BLOCK_START_S });
  cmd({ type: 'closeStation' });
  return ids;
}
