/**
 * Ruta ideal de F09 por COMANDOS (los mismos del panel accesible y la escena). La usan las pruebas de integración, la
 * repetición del intento y, paso a paso, la demostración. No es una ayuda para el estudiante.
 */
import type { F09Command, F09DispatchResult } from '../../simulation/f09-world/commands';
import type { F09World } from '../../simulation/f09-world/types';
import { routeOrbitRF09, routeSpeedsF09 } from './index';

/** Lecturas que la ruta tomó, por cuadro de la libreta. */
export interface RouteIdsF9 {
  mOrb: string;
  mSlide: string;
  rOrb: string;
  rArm1: string;
  rArm2: string;
  rSlideC: string;
  forces: string[];
  periods: string[];
  dyns: string[];
  encs: string[];
  w1: string;
  w2: string;
  r1: string;
  r2: string;
}

export const emptyRouteIdsF9 = (): RouteIdsF9 => ({ mOrb: '', mSlide: '', rOrb: '', rArm1: '', rArm2: '', rSlideC: '', forces: [], periods: [], dyns: [], encs: [], w1: '', w2: '', r1: '', r2: '' });

export const INSPECT_F9 = ['base01', 'level01', 'guard01', 'hub01', 'guide01', 'orbit01', 'slide1', 'pull01', 'drum01', 'dyn01', 'brake01', 'motor01', 'force01', 'gate01', 'encoder01', 'logger01', 'balance01', 'ruler01'];
/** Vueltas cronometradas en cada velocidad, brazos (cm) y fuerza del carro (N) de los tirones, radios de las masas (cm). */
export const ROUTE_TURNS = 5;
export const ROUTE_ARMS = [20, 10] as const;
export const ROUTE_PULL = 2;
export const ROUTE_SLIDE_C = 15;
export const ROUTE_SLIDE_OUT = 25;
export const ROUTE_SLIDE_IN = 6;
export const ROUTE_SPIN_D = 50;
/** Paso máximo de consigna del motor (rpm) para subir sin saltos bruscos. */
export const RAMP_RPM = 25;

type Cmd = (c: F09Command) => F09DispatchResult;
type Run = (s: number) => void;

/** Espera (tiempo del mundo) a que termine el tirón en curso. */
export function waitRun(w: () => F09World, run: Run, max = 40) {
  for (let i = 0; i < max / 0.25 && !!w().run && !w().run!.done; i++) run(0.25);
}

/** Espera a que termine el cronometraje en curso. */
export function waitTiming(w: () => F09World, run: Run, max = 40) {
  for (let i = 0; i < max / 0.25 && !!w().timing; i++) run(0.25);
}

/** Espera a que el cordón central termine de recoger. */
export function waitPull(w: () => F09World, run: Run, max = 10) {
  for (let i = 0; i < max / 0.25 && w().pullTarget !== null; i++) run(0.25);
}

/** Pesa un objeto en la balanza tarada esperando que se estabilice. */
export function weigh(cmd: Cmd, run: Run, id: string): string {
  cmd({ type: 'placeOnBalance', id });
  run(2);
  const r = cmd({ type: 'readBalance' }).id ?? '';
  cmd({ type: 'removeFromBalance' });
  return r;
}

/** Sube (o baja) la consigna del motor en pasos de a lo sumo RAMP_RPM, esperando a que la mesa siga cada paso. */
export function rampTo(w: () => F09World, cmd: Cmd, run: Run, rpm: number) {
  const cur = () => (Math.abs(w().rotor.omega) * 60) / (2 * Math.PI);
  for (let i = 0; i < 12 && Math.abs(rpm - cur()) > RAMP_RPM; i++) {
    cmd({ type: 'setMotor', rpm: cur() + Math.sign(rpm - cur()) * RAMP_RPM });
    run(1);
  }
  cmd({ type: 'setMotor', rpm });
}

/** Detiene la mesa: consigna cero, embrague fuera, freno de retención y espera a que quede quieta. */
export function stopTable(w: () => F09World, cmd: Cmd, run: Run) {
  if (w().motor.clutch && Math.abs(w().rotor.omega) > 0.05) {
    cmd({ type: 'setMotor', rpm: 0 });
    run(1.5);
  }
  cmd({ type: 'setMotor', rpm: 0 });
  cmd({ type: 'setClutch', on: false });
  cmd({ type: 'setBrake', level: 2 });
  for (let i = 0; i < 30 && Math.abs(w().rotor.omega) > 1e-3; i++) run(0.5);
  run(0.5);
}

/** Lleva las dos masas radiales a un radio (mesa quieta, guarda abierta) y las bloquea. */
export function placeSlides(cmd: Cmd, rCm: number) {
  cmd({ type: 'setGuard', closed: false });
  for (const s of ['slide1', 'slide2'] as const) {
    cmd({ type: 'lockMass', id: s, on: false });
    cmd({ type: 'setSlide', id: s, rCm });
    cmd({ type: 'lockMass', id: s, on: true });
  }
}

/** Etapa 1 — preparar giro: balanza, base, nivel, sensores, masas gemelas bloqueadas y masa orbitante en su tope. */
export function prepareRoute(w: () => F09World, cmd: Cmd, run: Run, ids: RouteIdsF9) {
  cmd({ type: 'setGuard', closed: false });
  cmd({ type: 'tareBalance' });
  ids.mOrb = weigh(cmd, run, 'orbit01');
  ids.mSlide = weigh(cmd, run, 'slide1');
  cmd({ type: 'clampBase', on: true });
  cmd({ type: 'levelAxis' });
  for (const ch of ['encoder', 'force', 'gate'] as const) cmd({ type: 'connect', channel: ch, on: true });
  cmd({ type: 'calibrateEncoder' });
  cmd({ type: 'routeCable', on: true });
  if (w().force.angleDeg !== 0) cmd({ type: 'mountForce', angleDeg: 0 });
  cmd({ type: 'zeroForce' });
  cmd({ type: 'setForceRange', n: 1 });
  cmd({ type: 'setRate', hz: 200 });
  cmd({ type: 'zeroDyn' });
  if (w().drum.aimDeg !== 0) cmd({ type: 'aimDyn', deg: 0 });
  placeSlides(cmd, ROUTE_SLIDE_C);
  cmd({ type: 'mountOrbit', on: true });
  cmd({ type: 'tightenCord' });
  cmd({ type: 'setOrbitRadius', rCm: routeOrbitRF09(w().scenarios) });
  cmd({ type: 'lockStop', on: true });
  ids.rOrb = cmd({ type: 'readRadius', target: 'orbit01', ref: 'center', viewDeg: 0 }).id ?? '';
  cmd({ type: 'setArm', rCm: ROUTE_ARMS[0] });
  ids.rArm1 = cmd({ type: 'readRadius', target: 'arm', ref: 'center', viewDeg: 0 }).id ?? '';
  ids.rSlideC = cmd({ type: 'readRadius', target: 'slide1', ref: 'center', viewDeg: 0 }).id ?? '';
  cmd({ type: 'readRadius', target: 'slide2', ref: 'center', viewDeg: 0 });
  cmd({ type: 'setGuard', closed: true });
  cmd({ type: 'setBrake', level: 0 });
}

/** Etapa 2 — fuerza centrípeta: cuatro consignas crecientes; en cada una, fuerza estable y cinco vueltas cronometradas. */
export function centripetalRoute(w: () => F09World, cmd: Cmd, run: Run, ids: RouteIdsF9) {
  cmd({ type: 'setClutch', on: true });
  for (const rpm of routeSpeedsF09(w().scenarios)) {
    rampTo(w, cmd, run, rpm);
    run(3);
    ids.forces.push(cmd({ type: 'readForce' }).id ?? '');
    cmd({ type: 'timeTurns', turns: ROUTE_TURNS });
    run(0.1);
    waitTiming(w, run);
    const last = w().readingOrder[w().readingOrder.length - 1];
    ids.periods.push(w().readings[last]?.kind === 'period' ? last : '');
  }
  stopTable(w, cmd, run);
}

/** Un tirón: cordón enrollado una vuelta en la ranura elegida, carro a la fuerza de la ruta, lectura del dinamómetro. */
export function torqueTrial(w: () => F09World, cmd: Cmd, run: Run, armCm: number): { dyn: string; enc: string; arm: string } {
  cmd({ type: 'setGuard', closed: false });
  cmd({ type: 'setArm', rCm: armCm });
  const arm = cmd({ type: 'readRadius', target: 'arm', ref: 'center', viewDeg: 0 }).id ?? '';
  cmd({ type: 'windCord', turns: 1, dir: 1 });
  cmd({ type: 'setPull', forceN: ROUTE_PULL });
  cmd({ type: 'setGuard', closed: true });
  cmd({ type: 'setBrake', level: 0 });
  cmd({ type: 'startPull' });
  run(0.4);
  const dyn = cmd({ type: 'readDyn', viewDeg: 0 }).id ?? '';
  waitRun(w, run);
  const enc = cmd({ type: 'readEncoder' }).id ?? '';
  stopTable(w, cmd, run);
  return { dyn, enc, arm };
}

/** Etapa 3 — torque: masa orbitante al estante, dos tirones con brazos de 20 y 10 cm. */
export function torqueRoute(w: () => F09World, cmd: Cmd, run: Run, ids: RouteIdsF9) {
  cmd({ type: 'setGuard', closed: false });
  cmd({ type: 'lockStop', on: false });
  cmd({ type: 'mountOrbit', on: false });
  ROUTE_ARMS.forEach((a, i) => {
    const r = torqueTrial(w, cmd, run, a);
    ids.dyns.push(r.dyn);
    ids.encs.push(r.enc);
    if (i === 1) ids.rArm2 = r.arm;
  });
}

/** Etapa 4 — momento angular: masas a 25 cm, giro a 50 rpm, motor desacoplado, ω₁, recoger a 6 cm, ω₂. */
export function momentumRoute(w: () => F09World, cmd: Cmd, run: Run, ids: RouteIdsF9) {
  placeSlides(cmd, ROUTE_SLIDE_OUT);
  ids.r1 = cmd({ type: 'readRadius', target: 'slide1', ref: 'center', viewDeg: 0 }).id ?? '';
  cmd({ type: 'readRadius', target: 'slide2', ref: 'center', viewDeg: 0 });
  cmd({ type: 'setGuard', closed: true });
  cmd({ type: 'setBrake', level: 0 });
  cmd({ type: 'setClutch', on: true });
  rampTo(w, cmd, run, ROUTE_SPIN_D);
  run(3);
  cmd({ type: 'setClutch', on: false });
  run(1);
  ids.w1 = cmd({ type: 'readOmega' }).id ?? '';
  cmd({ type: 'pullIn', rCm: ROUTE_SLIDE_IN });
  run(0.2);
  waitPull(w, run);
  run(1);
  ids.w2 = cmd({ type: 'readOmega' }).id ?? '';
  stopTable(w, cmd, run);
  cmd({ type: 'setGuard', closed: false });
  ids.r2 = cmd({ type: 'readRadius', target: 'slide1', ref: 'center', viewDeg: 0 }).id ?? '';
  cmd({ type: 'readRadius', target: 'slide2', ref: 'center', viewDeg: 0 });
}

/** Cierre: mesa frenada y quieta, motor desacoplado, masas bloqueadas, guarda cerrada. */
export function closeRoute(w: () => F09World, cmd: Cmd, run: Run) {
  stopTable(w, cmd, run);
  cmd({ type: 'setGuard', closed: false });
  for (const s of ['slide1', 'slide2'] as const) cmd({ type: 'lockMass', id: s, on: true });
  if (w().objects.orbit01.support !== 'rack') cmd({ type: 'mountOrbit', on: false });
  cmd({ type: 'setGuard', closed: true });
  cmd({ type: 'closeStation' });
}

/**
 * Ruta completa: EPP y reconocimiento; masas pesadas en la balanza tarada; base sujeta, eje nivelado, sensores
 * conectados, en cero y calibrados; masas gemelas bloqueadas a 15 cm; masa orbitante en su tope con el cordón tenso y el
 * radio leído; cuatro velocidades con fuerza y cinco vueltas; dos tirones del dinamómetro; conservación del momento
 * angular al recoger las masas de 25 a 6 cm con el motor desacoplado; cierre seguro.
 */
export function idealRouteCommandsF9(w: () => F09World, cmd: Cmd, run: Run, opts: { resume?: () => void } = {}): RouteIdsF9 {
  const ids = emptyRouteIdsF9();
  for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) cmd({ type: 'equipPpe', item, on: true });
  cmd({ type: 'startWork' });
  for (const t of INSPECT_F9) cmd({ type: 'inspect', target: t });
  opts.resume?.();
  prepareRoute(w, cmd, run, ids);
  centripetalRoute(w, cmd, run, ids);
  torqueRoute(w, cmd, run, ids);
  momentumRoute(w, cmd, run, ids);
  closeRoute(w, cmd, run);
  return ids;
}
