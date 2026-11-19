/**
 * Ruta ideal de F08 por COMANDOS (los mismos del panel accesible y la escena). La usan las pruebas de integración, la
 * repetición del intento y, paso a paso, la demostración. No es una ayuda para el estudiante.
 */
import type { F08Command, F08DispatchResult } from '../../simulation/f08-world/commands';
import type { DropId, F08World, SolidId } from '../../simulation/f08-world/types';
import { routeDropF08 } from './index';

/** Lecturas que la ruta tomó, por cuadro de la libreta. */
export interface RouteIdsF8 {
  mDisc: string;
  mRing: string;
  mDrop: string;
  mSlide: string;
  dDisc: string;
  dRing: string;
  dDrum: string;
  wFlag: string;
  dHole: string;
  axle: string;
  disks: string[];
  tension: string;
  tach: string;
  gate: string;
  ring: string;
  masses: string[];
  radii: string[];
  parallel: string;
}

export const emptyRouteIdsF8 = (): RouteIdsF8 => ({
  mDisc: '', mRing: '', mDrop: '', mSlide: '', dDisc: '', dRing: '', dDrum: '', wFlag: '', dHole: '', axle: '', disks: [], tension: '', tach: '', gate: '', ring: '', masses: [], radii: [], parallel: '',
});

export const INSPECT_F8 = ['base01', 'guard01', 'hub01', 'disc01', 'ring01', 'bar01', 'slide1', 'pulley01', 'drop50', 'column01', 'catch01', 'gate01', 'encoder01', 'tach01', 'tension01', 'logger01', 'balance01', 'caliper01', 'ruler01'];
/** Vueltas de cuerda de la ruta (una sola capa), altura del tope y de la fotopuerta (cm). */
export const ROUTE_TURNS = 5;
export const ROUTE_CATCH = -70;
export const ROUTE_GATE = -67.5;
/** Radios de las masas corredizas en los dos ensayos de la barra (cm) y agujero del eje desplazado (m). */
export const ROUTE_RADII = [10, 25] as const;
export const ROUTE_HOLE = 0.05;

type Cmd = (c: F08Command) => F08DispatchResult;
type Run = (s: number) => void;

/** Espera (tiempo del mundo) a que termine el ensayo en curso. */
export function waitRun(w: () => F08World, run: Run, max = 45) {
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

/** Frena el rotor y espera a que quede quieto. */
export function stopRotor(w: () => F08World, cmd: Cmd, run: Run) {
  cmd({ type: 'setBrake', on: true });
  for (let i = 0; i < 30 && Math.abs(w().rotor.omega) > 1e-3; i++) run(0.5);
  run(0.5);
}

/** Saca el sólido acoplado (rotor frenado y quieto, guarda abierta). */
export function dismount(w: () => F08World, cmd: Cmd, run: Run) {
  if (!w().rotor.solid) return;
  stopRotor(w, cmd, run);
  cmd({ type: 'setGuard', closed: false });
  cmd({ type: 'removeSolid' });
}

/** Acopla un sólido en un agujero y, si es el aro, lo centra. */
export function mount(w: () => F08World, cmd: Cmd, run: Run, id: SolidId, hole = 0) {
  dismount(w, cmd, run);
  cmd({ type: 'setGuard', closed: false });
  cmd({ type: 'mountSolid', id, hole });
  if (w().rotor.ecc > 0) cmd({ type: 'centerSolid' });
  if (w().damaged[id]) cmd({ type: 'repairSolid', id });
}

/**
 * Un ensayo: cuerda enrollada en una capa, masa colgada y sostenida, guarda cerrada, freno suelto con el rotor quieto,
 * suelta, espera a que la masa se apoye en el tope y el rotor gire libre 2,5 s, frena y lee el encoder (y lo pedido).
 */
export function torqueTrial(w: () => F08World, cmd: Cmd, run: Run, drop: DropId, read: { tension?: boolean; energy?: boolean } = {}): { enc: string; tension: string; tach: string; gate: string } {
  const s = w().string;
  if (s.mass) cmd({ type: 'hangMass', id: s.mass, on: false });
  cmd({ type: 'setBrake', on: true });
  cmd({ type: 'windString', turns: ROUTE_TURNS });
  cmd({ type: 'hangMass', id: drop, on: true });
  cmd({ type: 'setGuard', closed: true });
  run(0.5);
  cmd({ type: 'setBrake', on: false });
  cmd({ type: 'release' });
  run(1);
  waitRun(w, run);
  stopRotor(w, cmd, run);
  const enc = cmd({ type: 'readEncoder' }).id ?? '';
  const tension = read.tension ? (cmd({ type: 'readTension' }).id ?? '') : '';
  const tach = read.energy ? (cmd({ type: 'readTach' }).id ?? '') : '';
  const gate = read.energy ? (cmd({ type: 'readGate' }).id ?? '') : '';
  return { enc, tension, tach, gate };
}

/** Etapa 1 — montaje: balanza, calibre, base sujeta, polea alineada, tope y fotopuerta. */
export function mountRoute(w: () => F08World, cmd: Cmd, run: Run, ids: RouteIdsF8, drop: DropId) {
  dismount(w, cmd, run);
  cmd({ type: 'tareBalance' });
  ids.mDisc = weigh(cmd, run, 'disc01');
  ids.mRing = weigh(cmd, run, 'ring01');
  ids.mDrop = weigh(cmd, run, drop);
  ids.mSlide = weigh(cmd, run, 'slide1');
  ids.dDisc = cmd({ type: 'measure', target: 'disc01' }).id ?? '';
  ids.dRing = cmd({ type: 'measure', target: 'ring01' }).id ?? '';
  ids.dDrum = cmd({ type: 'measure', target: 'drum' }).id ?? '';
  ids.wFlag = cmd({ type: 'measure', target: 'flag' }).id ?? '';
  ids.dHole = cmd({ type: 'measure', target: 'hole' }).id ?? '';
  cmd({ type: 'clampBase', on: true });
  cmd({ type: 'alignPulley' });
  cmd({ type: 'setCatch', on: true, zCm: ROUTE_CATCH });
  cmd({ type: 'moveGate', zCm: ROUTE_GATE });
}

/** Etapa 2 — encoder y sensores: canales, calibración, cero en la marca del transportador, sentido, tensión y registro. */
export function encoderRoute(w: () => F08World, cmd: Cmd, run: Run) {
  for (const ch of ['encoder', 'tension', 'tach', 'gate'] as const) cmd({ type: 'connect', channel: ch, on: true });
  cmd({ type: 'calibrateEncoder' });
  // Llevar la marca de la plataforma al 0 del transportador leyendo de frente, y poner el cero ahí.
  const a = cmd({ type: 'readScale', viewDeg: 0 }).value ?? 0;
  cmd({ type: 'turnByHand', deg: -a });
  const b = cmd({ type: 'readScale', viewDeg: 0 }).value ?? 0;
  if (Math.abs(b) >= 1) cmd({ type: 'turnByHand', deg: -b });
  cmd({ type: 'zeroEncoder' });
  // Comprobar el sentido: un cuarto de vuelta en el sentido de caída debe leer +90°.
  cmd({ type: 'turnByHand', deg: 90 });
  const q = cmd({ type: 'readEncoderAngle' }).value ?? 0;
  if (q < 0) cmd({ type: 'setEncoderDir', dir: 1 });
  cmd({ type: 'turnByHand', deg: -90 });
  if (w().tension.angleDeg !== 0) cmd({ type: 'mountTension', angleDeg: 0 });
  cmd({ type: 'zeroTension' });
  cmd({ type: 'setTachRange', n: 1 });
  cmd({ type: 'setRate', hz: 200 });
  run(0.5);
}

/**
 * Ruta completa: EPP y reconocimiento; masas pesadas en la balanza tarada y diámetros medidos con el calibre; base
 * sujeta, polea alineada, tope y fotopuerta; encoder calibrado y en cero en la marca, sentido comprobado; sensores en
 * cero; eje solo; tres ensayos con el disco (tensión, tacómetro y fotopuerta en el primero); aro centrado; barra con las
 * masas fijas a 10 y 25 cm; disco en el agujero de 5 cm; cierre con el rotor frenado y todo en su lugar.
 */
export function idealRouteCommandsF8(w: () => F08World, cmd: Cmd, run: Run, opts: { resume?: () => void } = {}): RouteIdsF8 {
  const ids = emptyRouteIdsF8();
  const drop = routeDropF08(w().scenarios);
  for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) cmd({ type: 'equipPpe', item, on: true });
  cmd({ type: 'startWork' });
  for (const t of INSPECT_F8) cmd({ type: 'inspect', target: t });
  opts.resume?.();
  mountRoute(w, cmd, run, ids, drop);
  encoderRoute(w, cmd, run);
  // Etapa 3 — torque: eje solo, disco ×3 y aro.
  ids.axle = torqueTrial(w, cmd, run, drop).enc;
  mount(w, cmd, run, 'disc01');
  for (let i = 0; i < 3; i++) {
    const r = torqueTrial(w, cmd, run, drop, i === 0 ? { tension: true, energy: true } : {});
    ids.disks.push(r.enc);
    if (i === 0) {
      ids.tension = r.tension;
      ids.tach = r.tach;
      ids.gate = r.gate;
    }
  }
  mount(w, cmd, run, 'ring01');
  ids.ring = torqueTrial(w, cmd, run, drop).enc;
  // Etapa 4 — masas corredizas simétricas y fijas a dos radios; eje desplazado.
  mount(w, cmd, run, 'bar01');
  for (const rc of ROUTE_RADII) {
    cmd({ type: 'setGuard', closed: false });
    for (const s of ['slide1', 'slide2'] as const) {
      cmd({ type: 'lockMass', id: s, on: false });
      cmd({ type: 'slideMass', id: s, rCm: rc });
      cmd({ type: 'lockMass', id: s, on: true });
    }
    ids.radii.push(cmd({ type: 'readRadius', id: 'slide1', viewDeg: 0 }).id ?? '');
    cmd({ type: 'readRadius', id: 'slide2', viewDeg: 0 });
    ids.masses.push(torqueTrial(w, cmd, run, drop).enc);
  }
  mount(w, cmd, run, 'disc01', ROUTE_HOLE);
  ids.parallel = torqueTrial(w, cmd, run, drop).enc;
  // Cierre: rotor frenado y quieto, masa al estante, sólido a la bandeja, guarda cerrada.
  stopRotor(w, cmd, run);
  const m = w().string.mass;
  if (m) cmd({ type: 'hangMass', id: m, on: false });
  dismount(w, cmd, run);
  cmd({ type: 'setGuard', closed: true });
  cmd({ type: 'closeStation' });
  return ids;
}
