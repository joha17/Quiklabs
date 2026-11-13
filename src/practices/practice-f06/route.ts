/**
 * Ruta ideal de F06 por COMANDOS (los mismos del panel accesible y la escena). La usan las pruebas de integración, la
 * repetición del intento y, paso a paso, la demostración. No es una ayuda para el estudiante.
 */
import type { F06Command, F06DispatchResult } from '../../simulation/f06-world/commands';
import type { F06World } from '../../simulation/f06-world/types';
import { GEOF06 } from '../../simulation/f06-world/geometry';
import { SLOTS } from '../../simulation/f06-world/world';

/** Lecturas que la ruta tomó, por cuadro de la libreta. */
export interface RouteIdsF6 {
  cartM: string;
  hangerM: string;
  slotM: string;
  ruler: string[];
  launches: string[];
  reps: string[];
  heights: Array<{ gates: string; height: string }>;
  pendScale: string;
  pendulums: string[];
  loss: { gates: string; height: string };
}

export const emptyRouteIdsF6 = (): RouteIdsF6 => ({ cartM: '', hangerM: '', slotM: '', ruler: [], launches: [], reps: [], heights: [], pendScale: '', pendulums: [], loss: { gates: '', height: '' } });

export const INSPECT_F6 = ['stand01', 'ruler01', 'spring01', 'hanger01', 'launcher01', 'cart01', 'track01', 'brake01', 'gauge01', 'gate1', 'gate2', 'pad01', 'damper01', 'force01', 'pos01', 'logger01', 'pend01', 'angle01', 'gate3', 'balance01'];
/** Patín de roce de la ruta en el tramo de pérdidas (N). */
export const ROUTE_PAD = 0.15;

type Cmd = (c: F06Command) => F06DispatchResult;
type Run = (s: number) => void;

/** Compresión de la ruta (m): ~1,1 J almacenados sin salir del 90 % del tramo lineal. */
export function routeCompression(w: F06World): number {
  const p = w.params;
  const want = Math.sqrt(2.2 / p.springK);
  const cap = Math.floor(0.9 * p.xLin * 100) / 100;
  return Math.max(0.05, Math.min(cap, Math.round(want * 100) / 100));
}

/** Alturas de la ruta (m): la de referencia deja ~45 % de la energía como cinética arriba; luego 60 % y 30 % de ella. */
export function routeHeights(w: F06World): number[] {
  const p = w.params;
  const x = routeCompression(w);
  const U = 0.5 * p.springK * x * x;
  const ref = Math.min(0.25, Math.floor((55 * U) / (p.cartKg * p.g)) / 100);
  return [ref, Math.round(ref * 60) / 100, Math.round(ref * 30) / 100];
}

/** Espera (tiempo del mundo) a que termine el recorrido del carro en curso. */
export function waitRun(w: () => F06World, run: Run, max = 10) {
  for (let i = 0; i < max / 0.25 && !!w().run && !w().run!.done; i++) run(0.25);
}

/** Espera a que la esfera pase por la compuerta de abajo. */
export function waitSwing(w: () => F06World, run: Run, max = 4) {
  for (let i = 0; i < max / 0.1 && !!w().swing && !w().swing!.done; i++) run(0.1);
}

/** Un disparo: comprime, suelta sin empujar, espera, lee y devuelve el carro al lanzador. */
export function launchTrial(w: () => F06World, cmd: Cmd, run: Run, x: number, readLaunch = false): { launch: string; gates: string } {
  cmd({ type: 'compress', x });
  run(0.3);
  cmd({ type: 'releaseCart', pushMs: 0 });
  run(0.5);
  waitRun(w, run);
  const launch = readLaunch ? (cmd({ type: 'readLaunch' }).id ?? '') : '';
  const gates = cmd({ type: 'readGates' }).id ?? '';
  cmd({ type: 'returnCart' });
  return { launch, gates };
}

/** Lleva la parte alta a h y la lee de frente desde el tramo del lanzador, ya quieta. */
export function heightTo(cmd: Cmd, run: Run, h: number): string {
  cmd({ type: 'setHeight', m: h });
  run(1.5);
  return cmd({ type: 'readHeight', ref: 'launcher', viewDeg: 0 }).id ?? '';
}

/** Una oscilación del péndulo: aparta la esfera, la suelta sin empuje lateral y lee el captador y la compuerta. */
export function swingTrial(w: () => F06World, cmd: Cmd, run: Run, deg: number): string {
  cmd({ type: 'holdBob', deg });
  run(0.5);
  cmd({ type: 'releaseBob', lateralMs: 0 });
  run(0.2);
  waitSwing(w, run);
  const id = cmd({ type: 'readPendulum' }).id ?? '';
  cmd({ type: 'stopBob' });
  return id;
}

/**
 * Ruta completa: EPP y reconocimiento; carro, porta-pesas y una pesa en la balanza tarada; regla alineada con el resorte
 * descargado y cinco lecturas (porta-pesas solo y con 1–4 pesas) esperando el reposo; resorte al lanzador con su
 * presilla; sensores conectados, calibrados, en cero, sincronizados a 1000 Hz con rango de 50 N; columna sujeta y freno
 * puesto; tres disparos a la altura de referencia; dos alturas más; dos amplitudes del péndulo; un disparo con el patín
 * de roce; cierre seguro.
 */
export function idealRouteCommandsF6(w: () => F06World, cmd: Cmd, run: Run, opts: { resume?: () => void } = {}): RouteIdsF6 {
  const ids = emptyRouteIdsF6();
  for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) cmd({ type: 'equipPpe', item, on: true });
  cmd({ type: 'startWork' });
  for (const t of INSPECT_F6) cmd({ type: 'inspect', target: t });
  opts.resume?.();
  // Balanza tarada: carro sin pesas, porta-pesas y una pesa ranurada.
  for (const m of ['cw1', 'cw2']) if (w().objects[m].support !== 'rack') cmd({ type: 'loadCart', id: m, on: false });
  cmd({ type: 'tareBalance' });
  for (const [obj, key] of [['cart01', 'cartM'], ['hanger01', 'hangerM'], ['m100a', 'slotM']] as const) {
    cmd({ type: 'placeOnBalance', id: obj });
    run(2);
    ids[key] = cmd({ type: 'readBalance' }).id ?? '';
    cmd({ type: 'removeFromBalance' });
  }
  // A — resorte colgado: regla alineada sin carga; porta-pesas y pesas de a una, leyendo ya en reposo.
  if (w().springs.spring01.at !== 'stand') cmd({ type: 'mountSpring', id: 'spring01', at: 'stand' });
  cmd({ type: 'alignRuler' });
  cmd({ type: 'hangHanger', on: true });
  run(8);
  ids.ruler.push(cmd({ type: 'readRuler', viewDeg: 0 }).id ?? '');
  for (const m of SLOTS) {
    cmd({ type: 'hangMass', id: m, on: true });
    run(8);
    ids.ruler.push(cmd({ type: 'readRuler', viewDeg: 0 }).id ?? '');
  }
  cmd({ type: 'hangHanger', on: false });
  // B/D — el mismo resorte al lanzador con su presilla; sensores listos.
  cmd({ type: 'mountSpring', id: 'spring01', at: 'launcher' });
  cmd({ type: 'secureSpring', on: true });
  for (const ch of ['force', 'position', 'gates', 'angle'] as const) cmd({ type: 'connect', channel: ch, on: true });
  cmd({ type: 'setRange', n: 1 });
  if (w().sensor.angleDeg !== 0) cmd({ type: 'mountSensor', angleDeg: 0 });
  cmd({ type: 'setRate', hz: 1000 });
  cmd({ type: 'syncChannels', on: true });
  cmd({ type: 'calibrateSensor' });
  cmd({ type: 'zeroSensor' });
  cmd({ type: 'clampTrack', on: true });
  cmd({ type: 'setBrake', on: true });
  cmd({ type: 'setFriction', n: 0 });
  cmd({ type: 'setDamper', c: 0 });
  cmd({ type: 'moveGate', id: 'gate1', s: GEOF06.gate.s1 });
  cmd({ type: 'moveGate', id: 'gate2', s: GEOF06.gate.s2 });
  const x = routeCompression(w());
  const hs = routeHeights(w());
  // Etapa 2 — tres disparos a la altura de referencia.
  const href = heightTo(cmd, run, hs[0]);
  for (let i = 0; i < 3; i++) {
    const r = launchTrial(w, cmd, run, x, true);
    ids.launches.push(r.launch);
    ids.reps.push(r.gates);
  }
  // Etapa 3 — alturas: la de referencia y dos más; luego el péndulo con dos amplitudes.
  ids.heights.push({ gates: ids.reps[0], height: href });
  for (const h of hs.slice(1)) {
    const height = heightTo(cmd, run, h);
    ids.heights.push({ gates: launchTrial(w, cmd, run, x).gates, height });
  }
  if (Math.abs(w().pend.L - w().params.pendL0) > 1e-6) cmd({ type: 'setLength', m: w().params.pendL0 });
  run(1.5);
  ids.pendScale = cmd({ type: 'readPendScale', viewDeg: 0 }).id ?? '';
  for (const a of w().params.pendAmps) ids.pendulums.push(swingTrial(w, cmd, run, a));
  // Etapa 4 — pérdidas: patín de roce en el tramo entre compuertas, a la altura de referencia.
  const hl = heightTo(cmd, run, hs[0]);
  cmd({ type: 'setFriction', n: ROUTE_PAD });
  ids.loss = { gates: launchTrial(w, cmd, run, x).gates, height: hl };
  cmd({ type: 'setFriction', n: 0 });
  // Cierre: carro en el lanzador sin trabar, pesas y porta-pesas en el estante, esfera quieta.
  cmd({ type: 'returnCart' });
  cmd({ type: 'closeStation' });
  return ids;
}
