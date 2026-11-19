/**
 * Ruta ideal de F04 por COMANDOS (los mismos del panel accesible y la escena). La usan las pruebas de integración, la
 * repetición del intento y, paso a paso, la demostración. No es una ayuda para el estudiante.
 */
import type { F04Command, F04DispatchResult, FbdBody, FbdDir, FbdForce, FbdPartner } from '../../simulation/f04-world/commands';
import type { F04World, RunRecord } from '../../simulation/f04-world/types';
import { fbdNeeds } from '../../simulation/f04-world/world';

/** Lecturas que la ruta tomó, por cuadro de la libreta. */
export interface RouteIdsF4 {
  cartM: string;
  hangerM: string;
  g1: string;
  g2: string;
  aRest: string;
  runs: string[];
  massRuns: string[];
  pairs: string[];
}

export const emptyRouteIdsF4 = (): RouteIdsF4 => ({ cartM: '', hangerM: '', g1: '', g2: '', aRest: '', runs: [], massRuns: [], pairs: [] });

export const INSPECT_F4 = ['track01', 'cart01', 'pulley01', 'hanger01', 'forceA', 'accel01', 'logger01', 'gate1', 'gate2', 'balance01', 'dynP', 'dynQ', 'brake01', 'm10a'];
/** Pesas que se suman al portapesas en el barrido y empujes de la tercera ley (N). */
export const SWEEP_MASSES = ['m10a', 'm10b'] as const;
export const PAIR_PUSHES = [3, 6];

type Cmd = (c: F04Command) => F04DispatchResult;
type Run = (s: number) => void;

/** Espera (tiempo del mundo) a que termine el ensayo en curso. */
export function waitRunDone(w: () => F04World, run: Run, max = 6) {
  for (let i = 0; i < max / 0.25 && w().run && !w().run!.done; i++) run(0.25);
}

/**
 * Ventana de análisis de un ensayo: desde 0,15 s (pasado el arranque) hasta 0,05 s antes del primer suceso que cambia la
 * dinámica (aterrizaje del portapesas, freno, choque o cordel flojo).
 */
export function cleanWindow(rec: RunRecord): { t0: number; t1: number } {
  const end = rec.samples.length ? rec.samples[rec.samples.length - 1][0] : 0;
  const ev = [rec.landedT, rec.brakeT, rec.impactT, rec.slackT].filter((t): t is number => t !== null && t > 0.2);
  const t1 = Math.min(end, ...ev) - 0.05;
  return { t0: 0.15, t1: Math.round(t1 * 1000) / 1000 };
}

/** Lleva el carril a nivel: lee el acelerómetro en reposo y gira el tornillo las vueltas que indica (0,05° por vuelta). */
export function levelTrack(w: () => F04World, cmd: Cmd, run: Run): string {
  let id = '';
  for (let i = 0; i < 6; i++) {
    run(2);
    const r = cmd({ type: 'readTilt' });
    id = r.id ?? id;
    const a = r.value ?? 0;
    const deg = (-Math.asin(Math.max(-1, Math.min(1, a / w().params.g))) * 180) / Math.PI;
    if (Math.abs(a) <= 0.01 && Math.abs(w().track.tiltDeg) <= 0.1) break;
    cmd({ type: 'turnLevelScrew', turns: Math.max(-40, Math.min(40, -Math.round(deg / w().params.levelDegPerTurn))) });
  }
  return id;
}

/** Dibuja el diagrama correcto de un cuerpo y lo fija. */
export function drawFbd(cmd: Cmd, body: FbdBody) {
  for (const [force, dir, partner] of fbdNeeds(body)) cmd({ type: 'drawForce', body, force: force as FbdForce, dir: dir as FbdDir, partner: partner as FbdPartner });
  return cmd({ type: 'lockFbd', body });
}

/** Un ensayo completo: suelta el pestillo, espera que termine, lee la ventana limpia y devuelve el carro. */
export function runTrial(w: () => F04World, cmd: Cmd, run: Run): string {
  cmd({ type: 'release' });
  run(0.5);
  waitRunDone(w, run);
  const rec = w().runs[w().runs.length - 1];
  const win = cleanWindow(rec);
  const id = cmd({ type: 'readRun', t0: win.t0, t1: win.t1 }).id ?? '';
  cmd({ type: 'returnCart' });
  return id;
}

/** Empuje de la pareja, lectura simultánea de los dos dinamómetros y regreso al contacto. */
export function pairTrial(cmd: Cmd, run: Run, forceN: number): string {
  cmd({ type: 'push', forceN, durationS: 0.3 });
  run(0.8);
  const id = cmd({ type: 'readPair' }).id ?? '';
  cmd({ type: 'resetPair' });
  return id;
}

/**
 * Ruta completa: EPP y reconocimiento; masas del carro y del portapesas en la balanza tarada; diagramas del carro y del
 * portapesas; sensores conectados, calibrados y en cero; carril nivelado con el acelerómetro; polea sujeta, cordel por
 * la garganta, portapesas colgado y cordel tenso; compuertas antes del aterrizaje y del freno; tres ensayos iguales;
 * dos masas colgantes más; tercera ley con dos empujes; cierre seguro.
 */
export function idealRouteCommandsF4(w: () => F04World, cmd: Cmd, run: Run, opts: { resume?: () => void } = {}): RouteIdsF4 {
  const ids = emptyRouteIdsF4();
  for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) cmd({ type: 'equipPpe', item, on: true });
  cmd({ type: 'startWork' });
  for (const t of INSPECT_F4) cmd({ type: 'inspect', target: t });
  opts.resume?.();
  // E/A — inventario de masas en la balanza tarada.
  cmd({ type: 'tareBalance' });
  for (const [obj, key] of [['cart01', 'cartM'], ['hanger01', 'hangerM']] as const) {
    cmd({ type: 'placeOnBalance', id: obj });
    run(2);
    ids[key] = cmd({ type: 'readBalance' }).id ?? '';
    cmd({ type: 'removeFromBalance' });
  }
  // F — diagramas de cuerpo libre antes del ensayo.
  drawFbd(cmd, 'cart');
  drawFbd(cmd, 'hanger');
  // C — sensores e interfaz (el sensor A se calibra y se pone en cero sin carga).
  for (const ch of ['accel01', 'forceA', 'gates'] as const) cmd({ type: 'connect', channel: ch, on: true });
  cmd({ type: 'setRate', hz: 200 });
  cmd({ type: 'clipCable', on: true });
  if (w().sensors.forceA.angleDeg !== 0) cmd({ type: 'mountSensor', id: 'forceA', angleDeg: 0 });
  cmd({ type: 'calibrateSensor', id: 'forceA' });
  cmd({ type: 'zeroSensor', id: 'forceA' });
  // A — nivelar con el acelerómetro.
  ids.aRest = levelTrack(w, cmd, run);
  // B — polea, cordel y portapesas.
  cmd({ type: 'clampPulley', on: true });
  cmd({ type: 'threadString', path: 'groove' });
  cmd({ type: 'attachString', on: true });
  cmd({ type: 'hangHanger', on: true });
  cmd({ type: 'tensionString' });
  // E — compuertas antes del aterrizaje (s ≈ 0,87 m) y lejos del freno; posiciones leídas de frente en la escala.
  const g2 = Math.min(0.7, Math.round((w().brake.s - 0.08) * 100) / 100);
  const g1 = Math.min(0.3, Math.round((g2 - 0.25) * 100) / 100);
  if (w().gates.gate2.s !== g2) cmd({ type: 'moveGate', id: 'gate2', s: g2 });
  if (w().gates.gate1.s !== g1) cmd({ type: 'moveGate', id: 'gate1', s: g1 });
  ids.g1 = cmd({ type: 'readScale', target: 'gate1', viewDeg: 0 }).id ?? '';
  ids.g2 = cmd({ type: 'readScale', target: 'gate2', viewDeg: 0 }).id ?? '';
  // Ensayos repetidos con la misma configuración.
  for (let i = 0; i < 3; i++) ids.runs.push(runTrial(w, cmd, run));
  // Barrido de masa colgante: +10 g y +20 g.
  ids.massRuns.push(ids.runs[0]);
  for (const m of SWEEP_MASSES) {
    cmd({ type: 'placeMass', id: m, on: 'hanger' });
    ids.massRuns.push(runTrial(w, cmd, run));
  }
  for (const m of SWEEP_MASSES) cmd({ type: 'placeMass', id: m, on: 'rack' });
  // D — tercera ley: dinamómetros conectados, calibrados, en cero y proyectados en sentidos opuestos.
  for (const ch of ['dynP', 'dynQ'] as const) {
    cmd({ type: 'connect', channel: ch, on: true });
    if (w().sensors[ch].rangeIdx < 1) cmd({ type: 'setRange', id: ch, n: 1 });
    cmd({ type: 'calibrateSensor', id: ch });
    cmd({ type: 'zeroSensor', id: ch });
  }
  if (w().sensors.dynP.axisSign === w().sensors.dynQ.axisSign) cmd({ type: 'setAxisSign', id: 'dynP', sign: -1 });
  drawFbd(cmd, 'cartP');
  for (const f of PAIR_PUSHES) ids.pairs.push(pairTrial(cmd, run, f));
  // Cierre: portapesas al estante, cordel suelto, freno puesto, carro retenido.
  cmd({ type: 'hangHanger', on: false });
  cmd({ type: 'attachString', on: false });
  cmd({ type: 'closeStation' });
  return ids;
}
