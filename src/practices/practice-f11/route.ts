/**
 * Ruta ideal de F11 por COMANDOS (los mismos del panel accesible y la escena). La usan las pruebas de integración, la
 * repetición del intento y, paso a paso, la demostración. No es una ayuda para el estudiante.
 */
import type { F11Command, F11DispatchResult } from '../../simulation/f11-world/commands';
import type { F11World, FloatId } from '../../simulation/f11-world/types';
import { busyF11, canState, floatsMovingF11, standMovingF11, tankLevel, wavesF11 } from '../../simulation/f11-world/world';
import { routeDepthsF11, routeFloatsF11, routeImmersionsF11 } from './index';

/** Lecturas que la ruta tomó, por cuadro de la libreta. */
export interface RouteIdsF11 {
  LA: string;
  LB: string;
  p0: string;
  mCyl: string;
  VCyl: string;
  W: string;
  mOver: string;
  pAp: string[];
  pAz: string[];
  pBp: string[];
  pBz: string[];
  bf: string[];
  bi: string[];
  fm: string[];
  fd: string[];
}

export const emptyRouteIdsF11 = (): RouteIdsF11 => ({ LA: '', LB: '', p0: '', mCyl: '', VCyl: '', W: '', mOver: '', pAp: [], pAz: [], pBp: [], pBz: [], bf: [], bi: [], fm: [], fd: [] });

export const INSPECT_F11 = [
  'tank01', 'tapA', 'resB', 'pumpB', 'drain01', 'waste01', 'agitator01', 'scale01', 'guide01', 'probe01', 'ruler01', 'holder01', 'logger01', 'towel01', 'rack01', 'float1', 'bottle1', 'alu1',
  'ballast01', 'balance01', 'cyl01', 'can01', 'catch01', 'stand01', 'dyn01',
];

type Cmd = (c: F11Command) => F11DispatchResult;
type Run = (s: number) => void;

/** Espera a que la superficie quede quieta (sin oleaje). */
export function waitCalm(w: () => F11World, run: Run, max = 20) {
  for (let i = 0; i < max / 0.25 && wavesF11(w()); i++) run(0.25);
  run(0.3);
}

/** Abre una llave hasta que el nivel llega a la marca (o hasta vaciar con el vaciado) y la cierra. */
export function fillTo(w: () => F11World, cmd: Cmd, run: Run, valve: 'setTap' | 'setPump', level: number) {
  cmd({ type: valve, on: true });
  for (let i = 0; i < 4000 && tankLevel(w()) < level; i++) run(0.05);
  cmd({ type: valve, on: false });
}

export function drainTank(w: () => F11World, cmd: Cmd, run: Run) {
  cmd({ type: 'setDrain', on: true });
  for (let i = 0; i < 4000 && w().tank.vol.A + w().tank.vol.B > 0; i++) run(0.25);
  cmd({ type: 'setDrain', on: false });
}

/** Espera a que el brazo del soporte llegue y el bloque deje de oscilar. */
export function waitStand(w: () => F11World, run: Run) {
  for (let i = 0; i < 200 && standMovingF11(w()); i++) run(0.25);
  run(w().params.settleS + 0.2);
}

/** Espera a que los objetos del tanque queden quietos y la superficie en calma. */
export function waitFloats(w: () => F11World, run: Run, max = 30) {
  run(1);
  for (let i = 0; i < max / 0.25 && (floatsMovingF11(w()) || wavesF11(w())); i++) run(0.25);
  run(0.3);
}

/** Una cota de la sonda: baja la membrana, espera a que la lectura se estabilice y lee presión y regla. */
export function readDepth(w: () => F11World, cmd: Cmd, run: Run, z: number, ps: string[], zs: string[]) {
  cmd({ type: 'setProbeZ', zCm: z });
  run(0.3);
  if (w().probe.bubble) cmd({ type: 'purgeProbe' });
  run(3);
  ps.push(cmd({ type: 'readProbe' }).id ?? '');
  zs.push(cmd({ type: 'readRuler', viewDeg: 0 }).id ?? '');
}

/** Etapa 1 — calibrar el tanque: llenado por vertido, sonda calibrada y en cero en el aire, presión en la superficie. */
export function calibrateRoute(w: () => F11World, cmd: Cmd, run: Run, ids: RouteIdsF11) {
  if (w().valves.agitator) cmd({ type: 'setAgitator', on: false });
  fillTo(w, cmd, run, 'setTap', w().params.fillCm);
  cmd({ type: 'setGuide', xCm: 30 });
  cmd({ type: 'lockGuide', on: true });
  cmd({ type: 'connectProbe', on: true });
  if (!w().probe.absolute) cmd({ type: 'setRange', idx: 1 });
  cmd({ type: 'setRate', hz: 20 });
  cmd({ type: 'calibrateProbe' });
  if (!w().probe.absolute) cmd({ type: 'zeroProbe' });
  cmd({ type: 'newSeries' });
  run(1);
  ids.p0 = cmd({ type: 'readProbe' }).id ?? '';
  waitCalm(w, run);
  ids.LA = cmd({ type: 'readLevel', viewDeg: 0 }).id ?? '';
}

/** Etapa 2 — explorar la profundidad: cinco cotas en el agua, lejos de las paredes. */
export function depthRoute(w: () => F11World, cmd: Cmd, run: Run, ids: RouteIdsF11) {
  cmd({ type: 'mountProbe', where: 'guide' });
  cmd({ type: 'newSeries' });
  for (const z of routeDepthsF11(tankLevel(w()))) readDepth(w, cmd, run, z, ids.pAp, ids.pAz);
  cmd({ type: 'setProbeZ', zCm: 44 });
}

/** Etapa 3 — comparar densidades: vaciado total, llenado con salmuera (homogeneizada), segunda curva y probeta. */
export function densitiesRoute(w: () => F11World, cmd: Cmd, run: Run, ids: RouteIdsF11) {
  drainTank(w, cmd, run);
  fillTo(w, cmd, run, 'setPump', w().params.fillCm);
  if (w().tank.strat > 0.01) {
    cmd({ type: 'setAgitator', on: true });
    for (let i = 0; i < 80 && w().tank.strat > 0; i++) run(0.25);
    cmd({ type: 'setAgitator', on: false });
  }
  waitCalm(w, run);
  ids.LB = cmd({ type: 'readLevel', viewDeg: 0 }).id ?? '';
  cmd({ type: 'newSeries' });
  for (const z of routeDepthsF11(tankLevel(w()))) readDepth(w, cmd, run, z, ids.pBp, ids.pBz);
  cmd({ type: 'setProbeZ', zCm: 44 });
  cmd({ type: 'mountProbe', where: 'holder' });
  // Probeta: tarada vacía, llena con la salmuera del depósito, volumen y masa.
  cmd({ type: 'placeOnBalance', item: 'cyl' });
  cmd({ type: 'tareBalance' });
  cmd({ type: 'clearBalance' });
  cmd({ type: 'fillCylinder' });
  ids.VCyl = cmd({ type: 'readCylinder', viewDeg: 0 }).id ?? '';
  cmd({ type: 'placeOnBalance', item: 'cyl' });
  ids.mCyl = cmd({ type: 'readBalance' }).id ?? '';
  cmd({ type: 'clearBalance' });
  cmd({ type: 'emptyCylinder' });
}

/** Etapa 4 — observar el empuje: peso en el aire, vaso cebado, colector tarado, inmersiones y agua rebosada. */
export function buoyancyRoute(w: () => F11World, cmd: Cmd, run: Run, ids: RouteIdsF11) {
  cmd({ type: 'zeroDyn' });
  if (w().dyn.aimDeg !== 0) cmd({ type: 'aimDyn', deg: 0 });
  cmd({ type: 'hangBlock' });
  run(2);
  ids.W = cmd({ type: 'readDyn', viewDeg: 0 }).id ?? '';
  cmd({ type: 'primeCan' });
  run(5);
  cmd({ type: 'placeOnBalance', item: 'catch' });
  cmd({ type: 'tareBalance' });
  cmd({ type: 'clearBalance' });
  cmd({ type: 'placeCatch', at: 'spout' });
  // Base del bloque a ras de la superficie: cero de la guía de inmersión.
  const L0 = w().can.vol / (Math.PI * w().params.can.dCm ** 2 / 4);
  cmd({ type: 'setStand', cm: Math.round(L0 * 100) / 100 });
  waitStand(w, run);
  cmd({ type: 'zeroStand' });
  const ref = w().stand.ref ?? L0;
  for (const d of routeImmersionsF11(w().scenarios)) {
    cmd({ type: 'setStand', cm: Math.round((ref - d) * 100) / 100 });
    waitStand(w, run);
    ids.bf.push(cmd({ type: 'readDyn', viewDeg: 0 }).id ?? '');
    ids.bi.push(cmd({ type: 'readStand', viewDeg: 0 }).id ?? '');
  }
  // El pico termina de gotear antes de retirar el colector.
  for (let i = 0; i < 40 && canState(w()).level > w().params.can.spoutCm + 0.01; i++) run(0.25);
  run(1);
  cmd({ type: 'placeOnBalance', item: 'catch' });
  ids.mOver = cmd({ type: 'readBalance' }).id ?? '';
  cmd({ type: 'clearBalance' });
  cmd({ type: 'emptyCatch' });
  cmd({ type: 'setStand', cm: 20 });
  waitStand(w, run);
  cmd({ type: 'unhangBlock' });
}

/** Etapa 5 — ensayar la flotación: masa en la balanza en cero, soltar sin hilo, calado en reposo y recuperar. */
export function flotationRoute(w: () => F11World, cmd: Cmd, run: Run, ids: RouteIdsF11) {
  cmd({ type: 'clearBalance' });
  cmd({ type: 'tareBalance' });
  for (const t of routeFloatsF11(w().scenarios)) {
    const id: FloatId = t.id;
    if (id === 'bottle1') cmd({ type: 'setBallast', grams: t.ballast });
    cmd({ type: 'placeOnBalance', item: id });
    ids.fm.push(cmd({ type: 'readBalance' }).id ?? '');
    cmd({ type: 'clearBalance' });
    cmd({ type: 'releaseObject', id, xCm: t.x });
    cmd({ type: 'untieThread', id });
    waitFloats(w, run);
    ids.fd.push(cmd({ type: 'readDraft', id, viewDeg: 0 }).id ?? '');
    cmd({ type: 'recoverObject', id });
    waitCalm(w, run);
  }
}

/** Cierre: llaves cerradas, agitador apagado, objetos y bloque en el estante, sonda en su porta-sonda. */
export function closeRoute(w: () => F11World, cmd: Cmd, run: Run) {
  for (const k of ['setTap', 'setPump', 'setDrain', 'setAgitator'] as const) cmd({ type: k, on: false });
  for (const id of ['float1', 'bottle1', 'alu1'] as const) if (w().floats[id].where === 'tank' || w().floats[id].where === 'bench') cmd({ type: 'recoverObject', id });
  if (w().dyn.holding) cmd({ type: 'unhangBlock' });
  if (w().probe.mount !== 'holder') cmd({ type: 'mountProbe', where: 'holder' });
  cmd({ type: 'clearBalance' });
  if (w().cyl.vol > 0) cmd({ type: 'emptyCylinder' });
  if (w().can.catchAt === 'spout') cmd({ type: 'placeCatch', at: 'rack' });
  cmd({ type: 'mopSpill' });
  for (let i = 0; i < 120 && busyF11(w()); i++) run(0.5);
  cmd({ type: 'closeStation' });
}

/**
 * Ruta completa: EPP y reconocimiento; tanque lleno de agua, sonda calibrada y en cero, presión en la superficie y nivel;
 * cinco cotas en el agua; vaciado total, salmuera homogénea y cinco cotas más; densidad con la probeta; empuje con el
 * vaso cebado y el colector tarado; tres ensayos de flotación sin hilo; cierre seguro.
 */
export function idealRouteCommandsF11(w: () => F11World, cmd: Cmd, run: Run, opts: { resume?: () => void } = {}): RouteIdsF11 {
  const ids = emptyRouteIdsF11();
  for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) cmd({ type: 'equipPpe', item, on: true });
  cmd({ type: 'startWork' });
  for (const t of INSPECT_F11) cmd({ type: 'inspect', target: t });
  opts.resume?.();
  calibrateRoute(w, cmd, run, ids);
  depthRoute(w, cmd, run, ids);
  densitiesRoute(w, cmd, run, ids);
  buoyancyRoute(w, cmd, run, ids);
  flotationRoute(w, cmd, run, ids);
  closeRoute(w, cmd, run);
  return ids;
}
