/**
 * Ruta ideal de F103 por COMANDOS (los mismos del panel accesible y la escena). La usan las pruebas de integración, la
 * repetición del intento y, paso a paso, la demostración. No es una ayuda para el estudiante.
 */
import type { F103Command, F103DispatchResult } from '../../simulation/f103-world/commands';
import type { F103World } from '../../simulation/f103-world/types';
import { GEOF103 } from '../../simulation/f103-world/geometry';
import { dragOn, muzzleF3 } from '../../simulation/f103-world/world';
import { rangeWithDrop } from '../../simulation/models/f103/equations';

/** Lecturas que la ruta tomó, por cuadro de la libreta. */
export interface RouteIdsF3 {
  tilt: string;
  height: string;
  plumb: string;
  gate: string[];
  angles: Array<{ angle: string; tape: string; impact: string }>;
  conditions: Array<{ height: string; tape: string; impact: string }>;
  trajAngle: string;
  trajectory: Array<{ tape: string; mark: string }>;
}

export const emptyRouteIdsF3 = (): RouteIdsF3 => ({ tilt: '', height: '', plumb: '', gate: [], angles: [], conditions: [], trajAngle: '', trajectory: [] });

export const INSPECT_F3 = ['launcher01', 'stand01', 'gate01', 'timer01', 'platform01', 'screen01', 'floorTape01', 'heightRuler01', 'fan01', 'ballA'];
/** Ángulos del barrido (°) y distancias de la pantalla a la boca (cm) para la trayectoria. */
export const SWEEP_ANGLES = [20, 35, 45, 60];
export const TRAJ_ANGLE = 35;
export const TRAJ_SCREEN_CM = [60, 120, 180, 240];
export const ROUTE_NOTCH = 2;

type Cmd = (c: F103Command) => F103DispatchResult;
type Run = (s: number) => void;

/** Rapidez media de las lecturas de fotopuerta (diámetro rotulado / Δt), como la calcula el estudiante. */
export function gateMeanF3(w: F103World, ids: string[]): number {
  const v = ids.map((id) => w.readings[id]).filter((r) => r && Number.isFinite(r.value) && r.value > 0).map((r) => (r.setup?.ballCm ?? 2.5) / 100 / r.value);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN;
}

/**
 * Centro (cm de la sala) donde conviene poner la plataforma para un ángulo: la predicción con la v₀ medida y la caída
 * desde la boca hasta la cara de la placa; con aire, un 3 % más corto (el estudiante lo ve en el primer disparo).
 */
export function platformTargetCm(w: F103World, v0: number, angleDeg: number): { x: number; y: number } {
  const m = muzzleF3(w);
  const drop = m.z - (GEOF103.platform.h / 100 + 0.0125);
  const R = rangeWithDrop(v0, angleDeg, drop, w.params.g) * (dragOn(w) ? 0.97 : 1);
  return { x: Math.round((m.x + R) * 1000) / 10, y: GEOF103.lane.yc };
}

/** Espera (tiempo del mundo) a que la esfera del último disparo quede quieta. */
export function waitLanded(w: () => F103World, run: Run, max = 8) {
  for (let i = 0; i < max / 0.25 && !(w().lastShot?.landed ?? true); i++) run(0.25);
}

/** Lleva el nivel del deck a cero: lee la burbuja y gira el tornillo las vueltas que indica (0,1° por vuelta). */
export function levelStand(cmd: Cmd, run: Run): string {
  let id = '';
  for (let i = 0; i < 4; i++) {
    run(2);
    const r = cmd({ type: 'readLevel' });
    id = r.id ?? id;
    const deg = r.value ?? 0;
    if (Math.abs(deg) < 0.05) break;
    cmd({ type: 'turnLevelScrew', turns: -Math.round(deg / 0.1) });
  }
  return id;
}

/** Un disparo completo: carga, muesca, cordón, espera a que la esfera se detenga y la devuelve a la bandeja. */
export function shoot(w: () => F103World, cmd: Cmd, run: Run, opts: { ball?: string; notch?: number; read?: 'gate' | 'impact' | 'screen' | null; collect?: boolean } = {}) {
  const ball = opts.ball ?? 'ballA';
  cmd({ type: 'loadBall', ball });
  cmd({ type: 'cock', notch: opts.notch ?? ROUTE_NOTCH });
  cmd({ type: 'fire' });
  run(0.2);
  waitLanded(w, run);
  const r = opts.read === 'gate' ? cmd({ type: 'readGate' }) : opts.read === 'impact' ? cmd({ type: 'readImpact' }) : opts.read === 'screen' ? cmd({ type: 'readScreen', viewDeg: 0 }) : { ok: true };
  if (opts.collect ?? true) cmd({ type: 'collectBall', ball });
  return r;
}

/** Ángulo con el mando, espera a que el puntero se asiente y lee el transportador de frente. */
export function setAndRead(cmd: Cmd, run: Run, deg: number): string {
  cmd({ type: 'setAngle', deg });
  run(2);
  return cmd({ type: 'readProtractor', viewDeg: 0 }).id ?? '';
}

/** Disparo sobre la plataforma: la coloca en la predicción, espera que se asiente, lee la cinta y el impacto. */
export function platformShot(w: () => F103World, cmd: Cmd, run: Run, v0: number, angleDeg: number) {
  const t = platformTargetCm(w(), v0, angleDeg);
  cmd({ type: 'movePlatform', xCm: t.x, yCm: t.y });
  run(1.5);
  const tape = cmd({ type: 'readTape', target: 'platform', mark: 'index', viewDeg: 0 }).id ?? '';
  const impact = shoot(w, cmd, run, { read: 'impact' }).id ?? '';
  return { tape, impact };
}

/**
 * Ruta completa: EPP y reconocimiento; soporte orientado, anclado y nivelado; cero del transportador; altura de la boca;
 * plomada y cinta; fotopuerta a 100 kHz y tres disparos contra la pantalla cercana; barrido de cuatro ángulos sobre la
 * plataforma; otra altura y una corrida con viento; trayectoria con la pantalla en cuatro posiciones; cierre.
 */
export function idealRouteCommandsF3(w: () => F103World, cmd: Cmd, run: Run, opts: { resume?: () => void } = {}): RouteIdsF3 {
  const ids = emptyRouteIdsF3();
  for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) cmd({ type: 'equipPpe', item, on: true });
  cmd({ type: 'startWork' });
  for (const t of INSPECT_F3) cmd({ type: 'inspect', target: t });
  opts.resume?.();
  // A — orientar en el eje de la pista, anclar, nivelar, cero, altura de la boca, plomada y cinta.
  if (w().launcher.yawDeg !== 0) cmd({ type: 'setYaw', deg: 0 });
  cmd({ type: 'anchorStand', on: true });
  ids.tilt = levelStand(cmd, run);
  cmd({ type: 'setAngle', deg: 0 });
  run(2);
  cmd({ type: 'zeroProtractor' });
  cmd({ type: 'readProtractor', viewDeg: 0 });
  ids.height = cmd({ type: 'readHeight', mark: 'muzzle', viewDeg: 0 }).id ?? '';
  cmd({ type: 'dropPlumb' });
  cmd({ type: 'alignTape' });
  ids.plumb = cmd({ type: 'readTape', target: 'plumb', mark: 'index', viewDeg: 0 }).id ?? '';
  // B — fotopuerta e interfaz; tres disparos horizontales contra la pantalla segura (70 cm).
  cmd({ type: 'mountGate', on: true });
  if (w().gate.offsetMm !== 0) cmd({ type: 'setGateOffset', mm: 0 });
  cmd({ type: 'connect', target: 'gate', on: true });
  cmd({ type: 'connect', target: 'platform', on: true });
  cmd({ type: 'setTimerRate', hz: 100000 });
  cmd({ type: 'setClockRange', range: 'long' });
  cmd({ type: 'calibratePlatform' });
  cmd({ type: 'moveScreen', xCm: Math.round(w().launcher.x * 1000) / 10 + 70, inLane: true });
  cmd({ type: 'closeBarrier', on: true });
  cmd({ type: 'setCap', on: false });
  for (let i = 0; i < 3; i++) ids.gate.push(shoot(w, cmd, run, { read: 'gate' }).id ?? '');
  cmd({ type: 'moveScreen', xCm: Math.round(w().launcher.x * 1000) / 10 + 100, inLane: false });
  const v0 = gateMeanF3(w(), ids.gate);
  // C — barrido de ángulos sobre la plataforma.
  for (const a of SWEEP_ANGLES) {
    const angle = setAndRead(cmd, run, a);
    ids.angles.push({ angle, ...platformShot(w, cmd, run, v0, a) });
  }
  // E — otra altura del soporte (dos disparos a 45°) y uno con el ventilador de costado.
  const alt = w().stand.heightCm >= 60 ? 30 : 60;
  cmd({ type: 'setStandHeight', cm: alt });
  run(2);
  const h2 = cmd({ type: 'readHeight', mark: 'muzzle', viewDeg: 0 }).id ?? '';
  setAndRead(cmd, run, 45);
  for (let i = 0; i < 2; i++) ids.conditions.push({ height: h2, ...platformShot(w, cmd, run, v0, 45) });
  cmd({ type: 'setFan', speed: 1, dir: 'side' });
  run(1);
  ids.conditions.push({ height: h2, ...platformShot(w, cmd, run, v0, 45) });
  cmd({ type: 'setFan', speed: 0 });
  // D — trayectoria: pantalla en cuatro posiciones, plataforma retirada al fondo.
  cmd({ type: 'movePlatform', xCm: 650, yCm: GEOF103.lane.yc });
  ids.trajAngle = setAndRead(cmd, run, TRAJ_ANGLE);
  const x0 = Math.round(w().launcher.x * 1000) / 10;
  for (const d of TRAJ_SCREEN_CM) {
    cmd({ type: 'moveScreen', xCm: x0 + d, inLane: true });
    cmd({ type: 'clearScreen' });
    const tape = cmd({ type: 'readTape', target: 'screen', mark: 'index', viewDeg: 0 }).id ?? '';
    const mark = shoot(w, cmd, run, { read: 'screen' }).id ?? '';
    ids.trajectory.push({ tape, mark });
  }
  cmd({ type: 'moveScreen', xCm: x0 + 100, inLane: false });
  // Cierre: protector puesto, ventilador apagado, esferas en la bandeja.
  cmd({ type: 'setCap', on: true });
  cmd({ type: 'closeStation' });
  return ids;
}
