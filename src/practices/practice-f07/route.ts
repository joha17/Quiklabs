/**
 * Ruta ideal de F07 por COMANDOS (los mismos del panel accesible y la escena). La usan las pruebas de integración, la
 * repetición del intento y, paso a paso, la demostración. No es una ayuda para el estudiante.
 */
import type { F07Command, F07DispatchResult } from '../../simulation/f07-world/commands';
import type { F07World } from '../../simulation/f07-world/types';
import { GEOF07 } from '../../simulation/f07-world/geometry';
import { CART_MASSES } from '../../simulation/f07-world/world';

/** Lecturas que la ruta tomó, por cuadro de la libreta. */
export interface RouteIdsF7 {
  mA: string;
  mB: string;
  flagA: string;
  flagB: string;
  level: string;
  elastic: string[];
  forces: string[];
  stick: string;
  cm: string;
  cmMassB: string;
}

export const emptyRouteIdsF7 = (): RouteIdsF7 => ({ mA: '', mB: '', flagA: '', flagB: '', level: '', elastic: [], forces: [], stick: '', cm: '', cmMassB: '' });

export const INSPECT_F7 = ['track01', 'ends01', 'launcherA', 'launcherB', 'level01', 'cartA', 'cartB', 'cw100a', 'cw200', 'bumpers01', 'gateA', 'gateB', 'force01', 'logger01', 'camera01', 'ruler01', 'balance01', 'caliper01'];
/** Muesca de la ruta (cm): la de referencia del lanzador. */
export const ROUTE_COCK = 3;
/** Pesa que la ruta pone en el carro B para el ensayo del centro de masa. */
export const CM_MASS = 'cw200';

type Cmd = (c: F07Command) => F07DispatchResult;
type Run = (s: number) => void;

/** Espera (tiempo del mundo) a que termine el ensayo en curso. */
export function waitRun(w: () => F07World, run: Run, max = 16) {
  for (let i = 0; i < max / 0.25 && !!w().run && !w().run!.done; i++) run(0.25);
}

/** Pesa un objeto en la balanza tarada esperando que se estabilice. */
export function weigh(cmd: Cmd, run: Run, id: string): string {
  cmd({ type: 'placeOnBalance', id });
  run(2);
  const r = cmd({ type: 'readBalance' }).id ?? '';
  cmd({ type: 'removeFromBalance' });
  return r;
}

/** Nivela el riel con el tornillo leyendo la burbuja de frente y ya quieta; devuelve la última lectura. */
export function levelTrack(w: () => F07World, cmd: Cmd, run: Run): string {
  run(1.2);
  let id = '';
  for (let i = 0; i < 4; i++) {
    const r = cmd({ type: 'readLevel', viewDeg: 0 });
    id = r.id ?? '';
    if (Math.abs(r.value ?? 0) < 0.025) break;
    cmd({ type: 'setLevelScrew', deg: w().track.screwDeg - (r.value ?? 0) });
    run(1.5);
  }
  return id;
}

/**
 * Un choque: el blanco quieto en el centro (o lanzado desde la derecha si v₂ ≠ 0), el carro A trabado en la muesca de
 * referencia, suelta sin empujar, espera a que los dos queden frenados en los topes y lee fotopuertas (y fuerza o cámara).
 */
export function collisionTrial(w: () => F07World, cmd: Cmd, run: Run, read: { force?: boolean; motion?: boolean } = {}, cockB = ROUTE_COCK): { gates: string; force: string; motion: string } {
  if (w().bumper.joined) cmd({ type: 'separateCarts' });
  cmd({ type: 'cock', cart: 'cartA', cm: ROUTE_COCK });
  if (Math.abs(w().params.v2) > 1e-6 && cockB > 0) cmd({ type: 'cock', cart: 'cartB', cm: cockB });
  else cmd({ type: 'placeCart', cart: 'cartB', s: GEOF07.cartB0 });
  run(0.3);
  cmd({ type: 'release' });
  run(0.5);
  waitRun(w, run);
  const gates = cmd({ type: 'readGates' }).id ?? '';
  const force = read.force ? (cmd({ type: 'readForce' }).id ?? '') : '';
  const motion = read.motion ? (cmd({ type: 'readMotion' }).id ?? '') : '';
  return { gates, force, motion };
}

/** Prepara el montaje de la etapa 1: balanza, calibre, nivel, topes, carros, fotopuertas y sensor de fuerza. */
export function calibrateRoute(w: () => F07World, cmd: Cmd, run: Run, ids: RouteIdsF7) {
  for (const m of CART_MASSES) {
    const o = w().objects[m];
    if (o.support === 'cartA' || o.support === 'cartB') cmd({ type: 'loadCart', id: m, cart: o.support, on: false });
  }
  // Con los frenos puestos: pesar, medir las banderas y nivelar (un carro suelto rodaría por la pendiente).
  cmd({ type: 'tareBalance' });
  ids.mA = weigh(cmd, run, 'cartA');
  ids.mB = weigh(cmd, run, 'cartB');
  ids.flagA = cmd({ type: 'measureFlag', cart: 'cartA' }).id ?? '';
  ids.flagB = cmd({ type: 'measureFlag', cart: 'cartB' }).id ?? '';
  ids.level = levelTrack(w, cmd, run);
  for (const c of ['cartA', 'cartB'] as const) {
    cmd({ type: 'setCartBrake', cart: c, on: false });
    cmd({ type: 'freeWheel', cart: c });
    cmd({ type: 'centerCart', cart: c });
    cmd({ type: 'alignFlag', cart: c });
    if (w().carts[c].damaged) cmd({ type: 'repairCart', cart: c });
  }
  cmd({ type: 'setEndDampers', on: true });
  for (const ch of ['gates', 'force', 'camera'] as const) cmd({ type: 'connect', channel: ch, on: true });
  cmd({ type: 'clampGates', on: true });
  cmd({ type: 'moveGate', id: 'gateA', s: GEOF07.gate.sA });
  cmd({ type: 'moveGate', id: 'gateB', s: GEOF07.gate.sB });
  cmd({ type: 'setRange', n: 1 });
  if (w().sensor.angleDeg !== 0) cmd({ type: 'mountSensor', angleDeg: 0 });
  cmd({ type: 'setRate', hz: 5000 });
  cmd({ type: 'calibrateSensor' });
  cmd({ type: 'zeroSensor' });
  if (w().bumper.type === 'magnet' && !w().bumper.polarityOk) cmd({ type: 'flipMagnet' });
}

/**
 * Ruta completa: EPP y reconocimiento; carros pesados en la balanza tarada y banderas medidas con el calibre; riel
 * nivelado; topes amortiguados; frenos sueltos, ruedas libres, carros centrados; fotopuertas sujetas y conectadas;
 * sensor de fuerza calibrado y en cero a 5000 Hz con rango de 50 N; tres choques elásticos (fuerza en el primero);
 * un choque con velcro fijado; el carro B cargado y pesado para el centro de masa con la cámara; cierre con frenos.
 */
export function idealRouteCommandsF7(w: () => F07World, cmd: Cmd, run: Run, opts: { resume?: () => void } = {}): RouteIdsF7 {
  const ids = emptyRouteIdsF7();
  for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) cmd({ type: 'equipPpe', item, on: true });
  cmd({ type: 'startWork' });
  for (const t of INSPECT_F7) cmd({ type: 'inspect', target: t });
  opts.resume?.();
  calibrateRoute(w, cmd, run, ids);
  // Etapa 2 — choques elásticos con el paragolpes de resorte.
  if (w().bumper.type !== 'spring') cmd({ type: 'setBumper', bumper: 'spring' });
  for (let i = 0; i < 3; i++) {
    const r = collisionTrial(w, cmd, run, { force: true });
    ids.elastic.push(r.gates);
    ids.forces.push(r.force);
  }
  // Etapa 3 — choque perfectamente inelástico: velcro apretado y fijado.
  cmd({ type: 'setBumper', bumper: 'velcro' });
  cmd({ type: 'fixVelcro', on: true });
  // Con velcro el blanco espera quieto en el centro aunque el escenario lance los dos carros: así la pareja pegada
  // conserva rapidez para pasar la fotopuerta después del choque.
  ids.stick = collisionTrial(w, cmd, run, {}, 0).gates;
  cmd({ type: 'separateCarts' });
  cmd({ type: 'setBumper', bumper: 'spring' });
  // Etapa 4 — centro de masa: carga en B, pesada, y un choque registrado por la cámara.
  cmd({ type: 'loadCart', id: CM_MASS, cart: 'cartB', on: true });
  ids.cmMassB = weigh(cmd, run, 'cartB');
  ids.cm = collisionTrial(w, cmd, run, { motion: true }).motion;
  // Cierre: carros quietos y separados, pesa al estante, frenos puestos.
  if (w().bumper.joined) cmd({ type: 'separateCarts' });
  cmd({ type: 'loadCart', id: CM_MASS, cart: 'cartB', on: false });
  for (const c of ['cartA', 'cartB'] as const) cmd({ type: 'setCartBrake', cart: c, on: true });
  cmd({ type: 'closeStation' });
  return ids;
}
