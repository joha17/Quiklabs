/**
 * Ruta ideal de F10 por COMANDOS (los mismos del panel accesible y la escena). La usan las pruebas de integración, la
 * repetición del intento y, paso a paso, la demostración. No es una ayuda para el estudiante.
 */
import type { F10Command, F10DispatchResult } from '../../simulation/f10-world/commands';
import type { F10World } from '../../simulation/f10-world/types';
import { busyF10, pressMovingF10, wedgeTiltF10 } from '../../simulation/f10-world/world';
import { routeLoadsF10, routePlasticF10, routeStepsF10, routeSupportsF10 } from './index';

/** Lecturas que la ruta tomó, por cuadro de la libreta. */
export interface RouteIdsF10 {
  Wb: string;
  W1: string;
  xCG: string;
  xA: string;
  xB: string;
  d: string;
  L0: string;
  ra: string[];
  rb: string[];
  x: string[];
  f: string[];
  e: string[];
  rev: string;
  curve: string;
  res: string;
}

export const emptyRouteIdsF10 = (): RouteIdsF10 => ({ Wb: '', W1: '', xCG: '', xA: '', xB: '', d: '', L0: '', ra: [], rb: [], x: [], f: [], e: [], rev: '', curve: '', res: '' });

export const INSPECT_F10 = ['beam01', 'supportA', 'supportB', 'rail01', 'load1', 'rack01', 'gantry01', 'dyn01', 'wedge01', 'level01', 'tape01', 'caliper01', 'press01', 'spec1', 'gripTop', 'crank01', 'loadCell01', 'gauge01', 'shield01', 'logger01'];

type Cmd = (c: F10Command) => F10DispatchResult;
type Run = (s: number) => void;

/** Espera a que el travesaño llegue a su consigna y la probeta deje de vibrar. */
export function waitPress(w: () => F10World, run: Run, max = 60) {
  for (let i = 0; i < max / 0.25 && pressMovingF10(w()); i++) run(0.25);
  run(w().params.vibrationS + 0.2);
}

/** Espera a que la viga termine de oscilar tras un cambio. */
export const waitBeam = (w: () => F10World, run: Run) => run(Math.max(0.2, w().beam.settleUntil - w().timeS + 0.2));

/** Pesa la viga o la carga colgada del dinamómetro del pórtico, esperando que deje de mecerse. */
export function weighOnDyn(cmd: Cmd, run: Run, id: 'beam' | 'load1'): string {
  cmd({ type: 'hangOnDyn', id });
  run(2);
  const r = cmd({ type: 'readDyn', viewDeg: 0 }).id ?? '';
  cmd({ type: 'unhangDyn' });
  return r;
}

/** Busca el punto de equilibrio sobre la cuña por bisección mirando hacia dónde cae la viga. */
export function findBalance(w: () => F10World, cmd: Cmd) {
  let lo = 20;
  let hi = 100;
  for (let i = 0; i < 20; i++) {
    const t = wedgeTiltF10(w());
    if (t === 'level') return;
    if (t === 'left') hi = w().beam.wedgeS;
    else lo = w().beam.wedgeS;
    cmd({ type: 'slideOnWedge', sCm: (lo + hi) / 2 });
  }
}

/** Etapa 1 — pesar y montar: dinamómetro en cero, pesos, mesada nivelada, centro de masa y apoyos trabados. */
export function weightsRoute(w: () => F10World, cmd: Cmd, run: Run, ids: RouteIdsF10) {
  cmd({ type: 'zeroDyn' });
  if (w().dyn.aimDeg !== 0) cmd({ type: 'aimDyn', deg: 0 });
  ids.Wb = weighOnDyn(cmd, run, 'beam');
  ids.W1 = weighOnDyn(cmd, run, 'load1');
  cmd({ type: 'levelBench' });
  cmd({ type: 'placeBeam', where: 'wedge' });
  findBalance(w, cmd);
  ids.xCG = cmd({ type: 'readTape', target: 'cg', viewDeg: 0 }).id ?? '';
  cmd({ type: 'placeBeam', where: 'rack' });
  const [sA, sB] = routeSupportsF10(w().scenarios);
  cmd({ type: 'setSupport', id: 'A', sCm: sA });
  cmd({ type: 'setSupport', id: 'B', sCm: sB });
  for (const id of ['A', 'B'] as const) {
    cmd({ type: 'clampSupport', id, on: true });
    if (w().supports[id].loose) cmd({ type: 'tightenKnife', id });
  }
  cmd({ type: 'connect', channel: 'cells', on: true });
  cmd({ type: 'zeroCells' });
  cmd({ type: 'placeBeam', where: 'supports' });
  cmd({ type: 'seatBeam' });
  ids.xA = cmd({ type: 'readTape', target: 'supA', viewDeg: 0 }).id ?? '';
  ids.xB = cmd({ type: 'readTape', target: 'supB', viewDeg: 0 }).id ?? '';
}

/** Una posición de la carga: espera a que la viga se quiete y lee las dos reacciones y la posición. */
export function readEquilibrium(w: () => F10World, cmd: Cmd, run: Run, ids: RouteIdsF10) {
  waitBeam(w, run);
  ids.ra.push(cmd({ type: 'readCell', id: 'A' }).id ?? '');
  ids.rb.push(cmd({ type: 'readCell', id: 'B' }).id ?? '');
  ids.x.push(cmd({ type: 'readTape', target: 'load1', viewDeg: 0 }).id ?? '');
}

/** Etapas 2 y 3 — equilibrio y brazo: carga con el gancho cerrado en cuatro posiciones. */
export function equilibriumRoute(w: () => F10World, cmd: Cmd, run: Run, ids: RouteIdsF10) {
  const xs = routeLoadsF10(w().scenarios);
  cmd({ type: 'closeHook', id: 'load1', on: true });
  cmd({ type: 'hangLoad', id: 'load1', sCm: xs[0] });
  readEquilibrium(w, cmd, run, ids);
  for (const x of xs.slice(1)) {
    cmd({ type: 'moveLoad', id: 'load1', sCm: x });
    readEquilibrium(w, cmd, run, ids);
  }
  cmd({ type: 'unhangLoad', id: 'load1' });
  cmd({ type: 'placeBeam', where: 'rack' });
}

/** Montaje de la prensa: probeta medida y alineada, mordazas sin precarga, comparador calibrado y en cero, celda en 10 kN. */
export function pressSetupRoute(w: () => F10World, cmd: Cmd, run: Run, ids: RouteIdsF10) {
  cmd({ type: 'setShield', closed: false });
  ids.d = cmd({ type: 'readCaliper', id: 'spec1' }).id ?? '';
  ids.L0 = cmd({ type: 'readTape', target: 'L0', viewDeg: 0 }).id ?? '';
  cmd({ type: 'installSpecimen', id: 'spec1' });
  cmd({ type: 'alignGrips' });
  cmd({ type: 'lockCrank', on: false });
  cmd({ type: 'clampGrip', grip: 'bottom', on: true });
  cmd({ type: 'clampGrip', grip: 'top', on: true });
  for (const ch of ['press', 'gauge'] as const) cmd({ type: 'connect', channel: ch, on: true });
  cmd({ type: 'calibrateGauge' });
  cmd({ type: 'mountGauge', axis: 'axial' });
  if (w().gauge.angleDeg !== 0) cmd({ type: 'tiltGauge', deg: 0 });
  cmd({ type: 'routeCable', on: true });
  cmd({ type: 'setCellRange', n: 1 });
  cmd({ type: 'setRate', hz: 20 });
  cmd({ type: 'setShield', closed: true });
  run(0.5);
  cmd({ type: 'zeroLoadCell' });
  cmd({ type: 'zeroGauge' });
}

/** Etapa 4a — zona elástica: cinco escalones de la manivela con fuerza y alargamiento, y descarga lenta a cero. */
export function elasticRoute(w: () => F10World, cmd: Cmd, run: Run, ids: RouteIdsF10) {
  for (const mm of routeStepsF10(w().scenarios, w().params.material)) {
    cmd({ type: 'setCrank', mm });
    waitPress(w, run);
    ids.f.push(cmd({ type: 'readLoadCell' }).id ?? '');
    ids.e.push(cmd({ type: 'readGauge' }).id ?? '');
  }
  cmd({ type: 'setCrank', mm: 0 });
  waitPress(w, run);
  ids.rev = cmd({ type: 'readGauge' }).id ?? '';
}

/** Etapa 4b — ciclo plástico registrado: carga más allá de la fluencia, descarga lenta, curva y residual. */
export function plasticRoute(w: () => F10World, cmd: Cmd, run: Run, ids: RouteIdsF10) {
  cmd({ type: 'startLog' });
  cmd({ type: 'setCrank', mm: routePlasticF10(w().scenarios) });
  waitPress(w, run);
  cmd({ type: 'setCrank', mm: 0 });
  waitPress(w, run);
  cmd({ type: 'stopLog' });
  ids.curve = cmd({ type: 'readCurve' }).id ?? '';
  ids.res = cmd({ type: 'readGauge' }).id ?? '';
}

/** Cierre: probeta descargada, manivela en cero y frenada, viga y carga guardadas, protector cerrado. */
export function closeRoute(w: () => F10World, cmd: Cmd, run: Run) {
  if (w().press.target > 0) cmd({ type: 'setCrank', mm: 0 });
  for (let i = 0; i < 120 && busyF10(w()); i++) run(0.5);
  cmd({ type: 'lockCrank', on: true });
  if (w().loads.load1.where !== 'rack') cmd({ type: 'unhangLoad', id: 'load1' });
  if (w().dyn.holding) cmd({ type: 'unhangDyn' });
  if (w().beam.where !== 'rack') cmd({ type: 'placeBeam', where: 'rack' });
  cmd({ type: 'setShield', closed: true });
  cmd({ type: 'closeStation' });
}

/**
 * Ruta completa: EPP y reconocimiento; pesos de la viga y la carga en el dinamómetro en cero; mesada nivelada y centro
 * de masa en la cuña; apoyos trabados con los filos firmes, sensores en cero y viga asentada; cuatro posiciones de la
 * carga con el gancho cerrado; probeta medida, alineada y tomada sin precarga; comparador calibrado, axial y en cero;
 * cinco escalones elásticos, descarga y residual; ciclo plástico registrado a 20 Hz; cierre seguro.
 */
export function idealRouteCommandsF10(w: () => F10World, cmd: Cmd, run: Run, opts: { resume?: () => void } = {}): RouteIdsF10 {
  const ids = emptyRouteIdsF10();
  for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) cmd({ type: 'equipPpe', item, on: true });
  cmd({ type: 'startWork' });
  for (const t of INSPECT_F10) cmd({ type: 'inspect', target: t });
  opts.resume?.();
  weightsRoute(w, cmd, run, ids);
  equilibriumRoute(w, cmd, run, ids);
  pressSetupRoute(w, cmd, run, ids);
  elasticRoute(w, cmd, run, ids);
  plasticRoute(w, cmd, run, ids);
  closeRoute(w, cmd, run);
  return ids;
}
