/**
 * Ruta ideal de F12 por COMANDOS (los mismos del panel accesible y la escena). La usan las pruebas de integración, la
 * repetición del intento y, paso a paso, la demostración. No es una ayuda para el estudiante.
 */
import type { F12Command, F12DispatchResult } from '../../simulation/f12-world/commands';
import type { F12World } from '../../simulation/f12-world/types';
import { busyF12, flowingF12, settledF12, steadyF12, surgeF12 } from '../../simulation/f12-world/world';
import { ROUTE_COLLECT_F12, ROUTE_LOSS_SPEEDS_F12, ROUTE_SPEEDS_F12, ROUTE_VALVE_F12 } from './index';

/** Lecturas que la ruta tomó, por cuadro de la libreta. */
export interface RouteIdsF12 {
  sump: string;
  D1: string;
  D2: string;
  z1: string;
  z3: string;
  /** Juego de presiones con la bomba detenida (canales 1, 2 y 3). */
  p0: string[];
  V: string;
  t: string;
  Qm: string;
  /** Serie con el tramo liso: caudal y tres presiones por punto. */
  q: string[];
  p: string[][];
  /** Serie con el tramo rugoso. */
  lq: string[];
  lp: string[][];
}

export const emptyRouteIdsF12 = (): RouteIdsF12 => ({ sump: '', D1: '', D2: '', z1: '', z3: '', p0: [], V: '', t: '', Qm: '', q: [], p: [], lq: [], lp: [] });

export const INSPECT_F12 = [
  'sump01', 'pump01', 'meter01', 'jointJ1', 'jointJ2', 'jointJ3', 'venturi01', 'clamp01', 'spool01', 'tap1', 'tap2', 'tap3', 'purge01', 'valve01', 'outlet01', 'beaker01',
  'timer01', 'panel01', 'logger01', 'ruler01', 'gaskets01', 'spare01', 'caliper01', 'sample01', 'pitot01', 'stopper01', 'towel01',
];

type Cmd = (c: F12Command) => F12DispatchResult;
type Run = (s: number) => void;

/** Apaga la bomba y espera a que el rotor y el agua queden quietos. */
export function stopPump(w: () => F12World, cmd: Cmd, run: Run) {
  cmd({ type: 'setPump', on: false });
  for (let i = 0; i < 400 && (w().pump.n > 0.01 || flowingF12(w()) || surgeF12(w())); i++) run(0.1);
  run(1);
}

/** Espera el régimen estacionario y a que sensores y caudalímetro lleguen a su valor. */
export function waitSteady(w: () => F12World, run: Run, max = 60) {
  run(1);
  for (let i = 0; i < max / 0.1 && !(steadyF12(w()) && settledF12(w())); i++) run(0.1);
}

/** Con caudal bajo, abre la purga hasta que no queda aire en el punto alto y la cierra. */
export function purge(w: () => F12World, cmd: Cmd, run: Run, speed = 0.5) {
  cmd({ type: 'setSpeed', value: speed });
  cmd({ type: 'setPump', on: true });
  run(2);
  cmd({ type: 'setPurge', open: true });
  for (let i = 0; i < 3000 && w().circuit.airCm3 > 0; i++) run(0.05);
  cmd({ type: 'setPurge', open: false });
}

/** Un punto de la serie: velocidad, régimen, las tres presiones y el caudalímetro en el mismo ensayo. */
export function readPoint(w: () => F12World, cmd: Cmd, run: Run, speed: number, qs: string[], ps: string[][]) {
  cmd({ type: 'setSpeed', value: speed });
  waitSteady(w, run);
  ps.push(cmd({ type: 'readPressures' }).ids ?? []);
  qs.push(cmd({ type: 'readFlow' }).id ?? '');
}

/** Etapa 1 — preparar y purgar: empaquetaduras, juntas, abrazaderas, válvula, sensores en sus tomas, purga y nivel. */
export function prepareRoute(w: () => F12World, cmd: Cmd, run: Run, ids: RouteIdsF12) {
  if (w().stopper === 'pipe') cmd({ type: 'removeStopper' });
  // La serie principal va con el tramo liso; si el banco llegó con el rugoso montado, se cambia antes de cerrar.
  if (w().circuit.spool !== 'smooth') cmd({ type: 'swapSpool', kind: 'smooth' });
  for (const j of ['J1', 'J2', 'J3'] as const) {
    cmd({ type: 'fitGasket', joint: j });
    cmd({ type: 'connectJoint', joint: j, on: true });
  }
  cmd({ type: 'clampVenturi', on: true });
  cmd({ type: 'setValve', pos: ROUTE_VALVE_F12 });
  for (const i of [1, 2, 3] as const) {
    if (w().ports[i].probe !== 'static') cmd({ type: 'setProbe', port: i, kind: 'static' });
    cmd({ type: 'connectSensor', sensor: i, port: i });
    cmd({ type: 'capPort', port: i, on: false });
  }
  cmd({ type: 'setRange', idx: 1 });
  cmd({ type: 'setRate', hz: 20 });
  cmd({ type: 'setPressureMode', mode: 'gauge' });
  purge(w, cmd, run);
  stopPump(w, cmd, run);
  ids.sump = cmd({ type: 'readSump', viewDeg: 0 }).id ?? '';
}

/** Etapa 2 — calibrar: pendiente y cero con la bomba detenida, referencia estática, diámetros internos y cotas. */
export function calibrateRoute(w: () => F12World, cmd: Cmd, run: Run, ids: RouteIdsF12) {
  for (let i = 0; i < 100 && !settledF12(w()); i++) run(0.1);
  cmd({ type: 'calibrateSensors' });
  cmd({ type: 'zeroSensors' });
  cmd({ type: 'newSeries' });
  run(1);
  ids.p0 = cmd({ type: 'readPressures' }).ids ?? [];
  ids.D1 = cmd({ type: 'measureDiameter', section: 'D1', face: 'inner', tiltDeg: 0 }).id ?? '';
  ids.D2 = cmd({ type: 'measureDiameter', section: 'D2', face: 'inner', tiltDeg: 0 }).id ?? '';
  ids.z1 = cmd({ type: 'readTapHeight', port: 1, viewDeg: 0 }).id ?? '';
  ids.z3 = cmd({ type: 'readTapHeight', port: 3, viewDeg: 0 }).id ?? '';
}

/** Etapa 3 — variar el caudal: cinco velocidades con el tramo liso y una recolección cronometrada en el vaso. */
export function flowRoute(w: () => F12World, cmd: Cmd, run: Run, ids: RouteIdsF12) {
  cmd({ type: 'newSeries' });
  cmd({ type: 'setSpeed', value: ROUTE_SPEEDS_F12[0] });
  cmd({ type: 'setPump', on: true });
  for (const s of ROUTE_SPEEDS_F12) readPoint(w, cmd, run, s, ids.q, ids.p);
  // Recolección: vaso bajo el desviador, desviar y arrancar el cronómetro juntos; cortar antes del litro.
  cmd({ type: 'setSpeed', value: ROUTE_COLLECT_F12.speed });
  waitSteady(w, run);
  cmd({ type: 'timer', action: 'reset' });
  cmd({ type: 'moveBeaker', to: 'outlet' });
  cmd({ type: 'setDiverter', to: 'beaker' });
  cmd({ type: 'timer', action: 'start' });
  let read = false;
  for (let i = 0; i < 2000 && w().collect.beakerVol < ROUTE_COLLECT_F12.mL; i++) {
    run(0.05);
    if (!read && w().collect.beakerVol > ROUTE_COLLECT_F12.mL / 3) {
      ids.Qm = cmd({ type: 'readFlow' }).id ?? '';
      read = true;
    }
  }
  cmd({ type: 'setDiverter', to: 'sump' });
  cmd({ type: 'timer', action: 'stop' });
  cmd({ type: 'moveBeaker', to: 'bench' });
  ids.V = cmd({ type: 'readBeaker', viewDeg: 0 }).id ?? '';
  ids.t = cmd({ type: 'readTimer' }).id ?? '';
  cmd({ type: 'emptyBeaker' });
}

/** Etapa 4 — introducir pérdidas: serie nueva, tramo rugoso, nueva purga y tres caudales. */
export function lossRoute(w: () => F12World, cmd: Cmd, run: Run, ids: RouteIdsF12) {
  stopPump(w, cmd, run);
  cmd({ type: 'newSeries' });
  cmd({ type: 'swapSpool', kind: 'rough' });
  purge(w, cmd, run, ROUTE_LOSS_SPEEDS_F12[0]);
  for (const s of ROUTE_LOSS_SPEEDS_F12) readPoint(w, cmd, run, s, ids.lq, ids.lp);
}

/** Cierre: bomba detenida, purga cerrada, vaso vacío en la mesada, mesada seca. */
export function closeRoute(w: () => F12World, cmd: Cmd, run: Run) {
  if (w().collect.diverter === 'beaker') cmd({ type: 'setDiverter', to: 'sump' });
  if (w().timer.running) cmd({ type: 'timer', action: 'stop' });
  stopPump(w, cmd, run);
  if (w().safety.block) cmd({ type: 'acknowledge' });
  cmd({ type: 'setPurge', open: false });
  cmd({ type: 'moveBeaker', to: 'bench' });
  if (w().collect.beakerVol > 0) cmd({ type: 'emptyBeaker' });
  if (w().stopper === 'pipe') cmd({ type: 'removeStopper' });
  for (let i = 0; i < 120 && busyF12(w()); i++) run(0.5);
  cmd({ type: 'mopSpill' });
  cmd({ type: 'closeStation' });
}

/**
 * Ruta completa: EPP y reconocimiento; circuito cerrado con empaquetaduras, abrazaderas, sensores en sus tomas, purga
 * y nivel del depósito; calibración y cero con la bomba detenida, diámetros internos y cotas; cinco caudales con el
 * tramo liso y una recolección cronometrada; tramo rugoso con tres caudales; cierre seguro.
 */
export function idealRouteCommandsF12(w: () => F12World, cmd: Cmd, run: Run, opts: { resume?: () => void } = {}): RouteIdsF12 {
  const ids = emptyRouteIdsF12();
  for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) cmd({ type: 'equipPpe', item, on: true });
  cmd({ type: 'startWork' });
  for (const t of INSPECT_F12) cmd({ type: 'inspect', target: t });
  opts.resume?.();
  prepareRoute(w, cmd, run, ids);
  calibrateRoute(w, cmd, run, ids);
  flowRoute(w, cmd, run, ids);
  lossRoute(w, cmd, run, ids);
  closeRoute(w, cmd, run);
  return ids;
}
