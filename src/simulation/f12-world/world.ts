/**
 * Mundo de F12 — presión en flujo y continuidad: paso fijo determinista de 0,05 s con 10 subpasos de 5 ms (§6). La
 * escena solo dibuja este estado y envía hechos geométricos.
 *
 * - Circuito cerrado: depósito → bomba centrífuga (Δp = H0 n² − kq Q², rotor con inercia) → caudalímetro → J1 →
 *   Venturi (toma 1 en la entrada Ø 4 cm, toma 2 en la garganta Ø 2 cm, difusor) → J2 → tramo liso o rugoso → toma 3
 *   (con la purga) → J3 → válvula rotativa → desviador → depósito o vaso volumétrico.
 * - Caudal: ρ ΣL/A · dQ/dt = Δp_bomba − Σ ½ρK v² (inercia hidráulica real; la válvula gira en 0,3 s). Con la válvula
 *   cerrada de golpe con caudal, sobrepresión de Joukowsky ρ c Δv atenuada por 2L/(c T_cierre).
 * - Presión en cada toma: Bernoulli con las pérdidas ½ρKv² de cada tramo, ρgz de cada toma y ρ(L/A) dQ/dt.
 * - Continuidad: una junta sin empaquetadura (o gastada, o aflojada) pierde Q_fuga = k √p; aguas abajo hay menos caudal.
 * - Llenado y purga: el agua desplaza el aire del circuito; sin purgar queda una bolsa en el punto alto y los tubos de
 *   los sensores (respuesta lenta y sesgo). La purga abierta sin aire tira agua a la mesada.
 * - Sensores 0–10/25 kPa con cero, escala, retardo, rango, modo absoluto o manométrico, toma tapada o de Pitot, tubos
 *   cruzados y daño por sobrepresión; caudalímetro de turbina 0–2 L/s; vaso de 1 L y cronómetro; calibre con inclinación.
 */
import type { F12Command, F12DispatchResult, PpeItem } from './commands';
import type { F12Object, F12Params, F12Setup, F12World, JointId, Pose, PortId, ReadingF12, SensorId, SpoolKind } from './types';
import { hashRandom } from '../core/rng';
import { bumpF12, emitF12, errF12, flagF12, gaussF12, rearmErrF12 } from './events';
import { A1, A2, circuitWater, conservedTotalsF12 } from './conservation';
import { GEOF12 } from './geometry';
import { quantizeReading } from '../instruments/force-sensor';

export { emitF12, latchF12, rearmF12, bumpF12, flagF12, errF12 } from './events';
export { conservedTotalsF12, A1, A2, circuitWater };

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, num(v, a)));
const DEG = Math.PI / 180;
const r2 = (x: number) => Math.round(x * 100) / 100;
const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
const JOINTS: JointId[] = ['J1', 'J2', 'J3'];
const PORTS: PortId[] = [1, 2, 3];
const SENSORS: SensorId[] = [1, 2, 3];
const isJoint = (s: unknown): s is JointId => s === 'J1' || s === 'J2' || s === 'J3';
const isPort = (s: unknown): s is PortId => s === 1 || s === 2 || s === 3;
/** Caudal mínimo que cuenta como «hay flujo» (m³/s). */
const FLOWING = 2e-5;
/** Volumen del tramo intercambiable (cm³): se vacía al cambiarlo. */
const SPOOL_CM3 = 377;
/** Tiempo que lleva girar la válvula una posición (s). */
const VALVE_TURN_S = 0.3;
/** Aire en los tubos de los sensores a partir del cual se nota (cm³). */
const AIR_LINES = 30;
/** Resistencia del rodete detenido (Pa·s/m³): el caudal se apaga en ≈ 0,15 s al parar la bomba. */
const STOPPED_R = 2e7;
/** Ventana de promedio del registrador (s). */
const LOGGER_AVG_S = 1;

/** Escenarios docentes (§10). */
export const SF12 = {
  IDEAL: 'F12-S01_ideal_venturi',
  LOSSY: 'F12-S02_lossy_venturi',
  ROUGH: 'F12-S03_rough_pipe',
  VALVE: 'F12-S04_partial_valve',
  AIR: 'F12-S05_residual_air',
  MISCAL: 'F12-S06_miscalibrated_sensor',
  LOW: 'F12-S07_low_flow_pump',
  HIGH: 'F12-S08_high_flow_pump',
  SWAPPED: 'F12-S09_swapped_section',
  ELEVATION: 'F12-S10_tap_elevation',
  TRANSIENT: 'F12-S11_transient_flow',
  LEAK: 'F12-S12_joint_leak',
} as const;

export interface F12WorldSpec {
  objects: F12Object[];
  scenarios: string[];
  mode: string;
}

// ─────────────────────────── Creación ───────────────────────────

export function createF12World(spec: F12WorldSpec, seed: number, params: F12Params): F12World {
  const has = (s: string) => spec.scenarios.includes(s);
  const objects: Record<string, F12Object> = {};
  for (const o of spec.objects) objects[o.id] = { ...o, pose: { ...o.pose } };
  const h = (k: string) => hashRandom(seed, k) - 0.5;
  const sign = (k: string) => (h(k) > 0 ? 1 : -1);
  const realistic = params.scientificMode === 'REALISTIC';
  const sp = params.sensor;
  const sensor = (i: SensorId) => ({
    port: null, zeroed: false, badZero: false, calibrated: false, lagKPa: 0, avgKPa: 0, damaged: false,
    offset: Math.round(sign(`o${i}`) * sp.offsetKPa * (0.4 + (h(`oo${i}`) + 0.5) * 0.6) * 1000) / 1000,
    scale: has(SF12.MISCAL) && i === 2 ? 1.06 : realistic ? r4(1 + sign(`k${i}`) * (sp.uncalScale - 1) * (0.5 + (h(`kk${i}`) + 0.5) * 0.5)) : 1,
  });
  const joint = (j: JointId) => ({ connected: false, gasket: false, worn: has(SF12.LEAK) && j === 'J1', loose: false });
  const z0 = GEOF12.axisZ;
  const w: F12World = {
    timeS: 0, tick: 0, seed, rng: seed >>> 0 || 1, params, mode: spec.mode, objects,
    circuit: {
      joints: { J1: joint('J1'), J2: joint('J2'), J3: joint('J3') }, airCm3: params.pipeCm3, purgeOpen: false,
      spool: has(SF12.ROUGH) ? 'rough' : 'smooth', obstructed: false, clamped: false, driftCm: 0,
    },
    pump: { on: false, set: 0, n: 0 },
    valve: { pos: has(SF12.VALVE) ? 1 : 3, kEff: 0, moveStart: -10, fromPos: 3, lastT: -10 } as F12World['valve'],
    flow: { Q: 0, dQdt: 0, Qavg: 0, meterQ: 0, surgePa: 0, surgeUntil: -1 },
    ports: { 1: { capped: true, probe: 'static' }, 2: { capped: true, probe: 'static' }, 3: { capped: true, probe: 'static' } },
    sensors: { 1: sensor(1), 2: sensor(2), 3: sensor(3) },
    logger: { rateHz: params.rates[1] ?? 5, mode: 'gauge', rangeIdx: 0 },
    series: { id: 1, n: 0, configChanged: false, spoolChanged: false },
    collect: { diverter: 'sump', beakerAt: 'bench', beakerVol: 0, startT: -10, endT: -10, overflowed: false },
    timer: { running: false, startT: 0, elapsed: 0, startedAt: -10, stoppedAt: -10 },
    sump: params.sump0, spill: 0, mopped: 0,
    stopper: 'bench',
    tapZ: { 1: z0, 2: z0, 3: z0 + (has(SF12.ELEVATION) ? GEOF12.riserCm : 0) },
    reversed: has(SF12.SWAPPED),
    trial: 0,
    configVersion: 1,
    readings: {}, readingOrder: [],
    safety: { ppe: { coat: false, goggles: false, shoes: false, hair: false }, block: null, stoppedByTeacher: false },
    events: [], evidence: {}, scenarios: [...spec.scenarios], ppe: false,
    initialTotals: { waterCm3: 0 },
  };
  w.valve.kEff = params.K.valve[w.valve.pos];
  w.valve.fromPos = w.valve.pos;
  w.initialTotals = { waterCm3: conservedTotalsF12(w).waterCm3 };
  return w;
}

// ─────────────────────────── Hidráulica ───────────────────────────

const leaky = (w: F12World, j: JointId) => {
  const s = w.circuit.joints[j];
  return s.connected && (!s.gasket || s.worn || s.loose);
};
export const leakingF12 = (w: F12World) => JOINTS.some((j) => leaky(w, j));
export const circuitClosedF12 = (w: F12World) => JOINTS.every((j) => w.circuit.joints[j].connected);
const spoolK = (w: F12World, k: SpoolKind = w.circuit.spool) => (k === 'rough' ? w.params.K.rough : w.params.K.smooth);
const convK = (w: F12World) => (w.reversed ? w.params.K.diff : w.params.K.conv);
const diffK = (w: F12World) => (w.reversed ? Math.max(w.params.K.diff, 0.5) : w.params.K.diff) + (w.circuit.obstructed ? 1.2 : 0);

/** K verdadero entre las tomas 1 y 3 referido a v1 (cono, difusor y tramo), para la revisión. */
export const trueLossKF12 = (w: F12World, k: SpoolKind = w.circuit.spool) => (convK(w) + diffK(w)) * (A1(w) / A2(w)) ** 2 + spoolK(w, k);

export interface Hydraulics {
  /** Presiones manométricas (Pa) en las tomas, salida de la bomba y juntas. */
  p: Record<PortId, number>;
  pOut: number;
  /** Caudales (m³/s): bomba, Venturi, después de J2 y en la salida; fugas por junta. */
  Q: number;
  Qv: number;
  Q3: number;
  Qo: number;
  leak: Record<JointId, number>;
  v: Record<PortId, number>;
  /** Pérdidas entre la toma 1 y la toma 3 (Pa) y potencia disipada (W). */
  loss13: number;
  power: number;
}

/** Inercia hidráulica total (Pa·s²/m³). */
const inertance = (w: F12World) => (w.params.rho * (w.params.lenM.up + w.params.lenM.test + w.params.lenM.down)) / A1(w);

/** Presiones y caudales del circuito para un caudal Q (m³/s) y su derivada. */
export function hydraulicsF12(w: F12World, Q: number = w.flow.Q, dQdt: number = w.flow.dQdt, withSurge = true): Hydraulics {
  const p = w.params;
  const rho = p.rho;
  const a1 = A1(w);
  const a2 = A2(w);
  const half = 0.5 * rho;
  const L = p.lenM;
  const surge = withSurge && w.timeS < w.flow.surgeUntil ? w.flow.surgePa : 0;
  // El retorno descarga por el desviador, más alto que la tubería: el tramo queda lleno y con presión estática.
  const zOut = GEOF12.outlet.z / 100;
  const z = { 1: w.tapZ[1] / 100, 2: w.tapZ[2] / 100, 3: w.tapZ[3] / 100 };
  const closed = w.valve.pos <= 0;
  // Fugas con las presiones sin fuga (una pasada basta: son caudales chicos).
  const est = (q: number) => {
    const vv = q / a1;
    const v2 = q / a2;
    const p3 = rho * p.g * (zOut - z[3]) + half * (w.valve.kEff + p.K.ret) * vv * vv;
    const pJ2 = p3 + half * spoolK(w) * vv * vv;
    const p2 = pJ2 + half * (vv * vv - v2 * v2) + diffK(w) * half * v2 * v2;
    const p1 = p2 + half * (v2 * v2 - vv * vv) + convK(w) * half * v2 * v2;
    return { p1, pJ2, p3 };
  };
  const leak: Record<JointId, number> = { J1: 0, J2: 0, J3: 0 };
  if (!closed && Q > 0) {
    const e = est(Q);
    if (leaky(w, 'J1')) leak.J1 = p.leakK * Math.sqrt(Math.max(0, e.p1));
    if (leaky(w, 'J2')) leak.J2 = p.leakK * Math.sqrt(Math.max(0, e.pJ2));
    if (leaky(w, 'J3')) leak.J3 = p.leakK * Math.sqrt(Math.max(0, e.p3));
  }
  const Qv = Math.max(0, Q - leak.J1);
  const Q3 = Math.max(0, Qv - leak.J2);
  const Qo = Math.max(0, Q3 - leak.J3);
  const v1 = Qv / a1;
  const v2 = Qv / a2;
  const v3 = Q3 / a1;
  const vo = Qo / a1;
  let p1: number;
  let p2: number;
  let p3: number;
  let pOut: number;
  if (closed) {
    // Válvula cerrada: sin caudal, todo el tramo queda a la presión de cierre de la bomba (con su ρgz).
    pOut = Math.max(0, p.pump.H0 * w.pump.n * w.pump.n);
    p1 = pOut + rho * p.g * (zOut - z[1]);
    p2 = pOut + rho * p.g * (zOut - z[2]);
    p3 = pOut + rho * p.g * (zOut - z[3]);
  } else {
    const iDown = (rho * L.down) / a1;
    const iTest = (rho * L.test) / a1;
    p3 = rho * p.g * (zOut - z[3]) + half * (w.valve.kEff + p.K.ret) * vo * vo + iDown * dQdt;
    const pJ2 = p3 + half * spoolK(w) * v3 * v3 + rho * p.g * (z[3] - z[2]) + 0.5 * iTest * dQdt;
    p2 = pJ2 + half * (v3 * v3 - v2 * v2) + diffK(w) * half * v2 * v2;
    p1 = p2 + half * (v2 * v2 - v1 * v1) + rho * p.g * (z[2] - z[1]) + convK(w) * half * v2 * v2 + 0.1 * iTest * dQdt;
    pOut = p1 + half * p.K.up * (Q / a1) ** 2 + ((rho * L.up) / a1 + 0.4 * iTest) * dQdt;
  }
  const loss13 = closed ? 0 : convK(w) * half * v2 * v2 + diffK(w) * half * v2 * v2 + half * spoolK(w) * v3 * v3;
  return {
    p: { 1: p1 + surge, 2: p2 + surge, 3: p3 + surge }, pOut: pOut + surge, Q, Qv, Q3, Qo, leak, v: { 1: v1, 2: v2, 3: v3 }, loss13, power: Qv * loss13,
  };
}

/** Altura de la bomba (Pa) con la velocidad real del rotor (con la pulsación de F12-S11). */
function pumpHead(w: F12World, Q: number, t: number = w.timeS): number {
  const p = w.params.pump;
  const n = w.sump < 1000 ? 0 : w.pump.n * (1 + p.pulse * Math.sin(2 * Math.PI * p.pulseHz * t));
  return headOf(w, n, Q);
}

/** Curva de la bomba: Δp = H0 n² − kq Q², más el rodete casi detenido que frena el agua (≈ 0 en marcha). */
function headOf(w: F12World, n: number, Q: number): number {
  const p = w.params.pump;
  return p.H0 * n * n - p.kq * Q * Q - STOPPED_R * (1 - Math.min(1, n)) ** 6 * Q;
}

/** Caudal de régimen para la velocidad actual del rotor (bisección: la presión del circuito crece con Q). */
export function steadyQF12(w: F12World, n: number = w.pump.n): number {
  if (w.valve.pos <= 0 || n <= 0) return 0;
  const head = (q: number) => headOf(w, n, q);
  let lo = 0;
  let hi = 0.006;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (head(mid) > hydraulicsF12(w, mid, 0, false).pOut) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// ─────────────────────────── Consultas ───────────────────────────

export const flowingF12 = (w: F12World) => w.flow.Q > FLOWING;
export const pumpSettledF12 = (w: F12World) => Math.abs((w.pump.on ? w.pump.set : 0) - w.pump.n) < 0.005;
/** Caudal en régimen estacionario (rotor asentado y promedio de 1,5 s en el caudal de régimen). */
export function steadyF12(w: F12World): boolean {
  if (!pumpSettledF12(w)) return false;
  const qs = steadyQF12(w);
  // Con la bomba pulsando (F12-S11) el promedio oscila alrededor del régimen: se tolera esa oscilación.
  return Math.abs(w.flow.Qavg - qs) <= Math.max(3e-6, (0.004 + 1.5 * w.params.pump.pulse) * qs);
}
export const busyF12 = (w: F12World) => w.pump.on || flowingF12(w) || w.timer.running || w.collect.diverter === 'beaker';
export const surgeF12 = (w: F12World) => w.timeS < w.flow.surgeUntil;
export const rangeKPaF12 = (w: F12World) => w.params.sensor.ranges[w.logger.rangeIdx];
export const resKPaF12 = (w: F12World) => w.params.sensor.resolutions[w.logger.rangeIdx];
export const sumpLevelF12 = (w: F12World) => w.sump / (GEOF12.sump.w * GEOF12.sump.d);
export const timerValueF12 = (w: F12World) => (w.timer.running ? w.timer.elapsed + (w.timeS - w.timer.startT) : w.timer.elapsed);
export const airInLinesF12 = (w: F12World) => w.circuit.airCm3 > AIR_LINES;
/** Sensores conectados ya asentados en lo que ven y caudalímetro en su valor. */
export function settledF12(w: F12World): boolean {
  const hy = hydraulicsF12(w);
  for (const i of [1, 2, 3] as const) {
    const s = w.sensors[i];
    if (s.port === null) continue;
    const t = sensorTargetKPa(w, i, hy);
    const tol = sensorTolKPa(w, s.lagKPa) * 0.5;
    if (Math.abs(t - s.lagKPa) > tol || Math.abs(t - s.avgKPa) > tol + 2.5 * w.params.pump.pulse * Math.abs(t)) return false;
  }
  return Math.abs(w.flow.meterQ - w.flow.Q * w.params.meter.k) <= meterTol(w) * 0.5;
}

/** Diferencia tolerada entre lo que ve la membrana y su respuesta (kPa): resolución y pulsación de la bomba. */
const sensorTolKPa = (w: F12World, kPa: number) => Math.max(resKPaF12(w), 0.01) + 5 * w.params.pump.pulse * Math.abs(kPa);
const meterTol = (w: F12World) => w.params.meter.resLs * 1e-3 + 1.5 * w.params.pump.pulse * w.flow.Q * w.params.meter.k;

/** Presión del agua en la toma a la que va el sensor (kPa; 0 si está suelto o la toma tapada). */
function portKPa(w: F12World, i: SensorId, hy: Hydraulics = hydraulicsF12(w)): number {
  const s = w.sensors[i];
  if (s.port === null) return 0;
  const port = w.ports[s.port];
  if (port.capped) return 0;
  let pa = hy.p[s.port];
  if (port.probe === 'pitot') pa += 0.5 * w.params.rho * hy.v[s.port] ** 2;
  return pa / 1000;
}

/** Lo que «ve» la membrana del sensor (kPa, antes de escala y cero): la toma, el aire de los tubos y el daño. */
function sensorTargetKPa(w: F12World, i: SensorId, hy: Hydraulics = hydraulicsF12(w)): number {
  const s = w.sensors[i];
  const pr = w.params.sensor;
  let k = s.damaged ? pr.damageKPa : 0;
  if (s.port === null) return k;
  k += portKPa(w, i, hy);
  if (airInLinesF12(w) && !w.ports[s.port].capped) k += pr.airKPa;
  return k;
}

/** Lo que muestra el canal en vivo (sin ruido; NaN sin sensor). */
export function channelDisplayF12(w: F12World, i: SensorId): number {
  const s = w.sensors[i];
  if (s.port === null) return NaN;
  const shown = s.scale * s.lagKPa + s.offset + (w.logger.mode === 'abs' ? w.params.pAtmKPa : 0);
  const range = rangeKPaF12(w) + (w.logger.mode === 'abs' ? w.params.pAtmKPa : 0);
  return Math.max(w.logger.mode === 'abs' ? 0 : 0, Math.min(range, shown));
}
export const meterDisplayF12 = (w: F12World) => Math.min(w.params.meter.rangeLs, Math.max(0, w.flow.meterQ * 1000));

// ─────────────────────────── Despacho ───────────────────────────

const BEFORE_PPE = new Set<F12Command['type']>(['equipPpe', 'startWork', 'teacherStop', 'acknowledge', 'inspect']);
const DURING_BLOCK = new Set<F12Command['type']>(['acknowledge', 'teacherStop', 'inspect', 'setPose', 'setPump', 'setSpeed', 'setValve', 'mopSpill', 'setPurge', 'setDiverter']);
/** Comandos que cambian la configuración de los sensores (F12-E32 si la serie ya tiene lecturas). */
const CONFIG = new Set<F12Command['type']>(['connectSensor', 'setRange', 'setRate', 'setPressureMode', 'zeroSensors', 'calibrateSensors', 'capPort', 'setProbe']);

export function dispatchF12(w: F12World, cmd: F12Command): F12DispatchResult {
  if (!cmd || typeof cmd !== 'object') return { ok: false, code: 'UNKNOWN' };
  if (w.safety.stoppedByTeacher && cmd.type !== 'teacherStop') return { ok: false, code: 'TEACHER_STOP' };
  if (!w.ppe && !BEFORE_PPE.has(cmd.type)) return { ok: false, code: 'PPE' };
  if (w.safety.block && !DURING_BLOCK.has(cmd.type)) return { ok: false, code: 'BLOCKED' };
  const before = w.configVersion;
  const res = route(w, cmd);
  if (res.ok && CONFIG.has(cmd.type)) {
    if (w.configVersion === before) w.configVersion++;
    const s = w.series;
    if (s.n > 0 && !s.configChanged) {
      s.configChanged = true;
      errF12(w, 'E32', 'CONFIG_DURING_SERIES', 'WARN', { cmd: cmd.type });
    }
  }
  return res;
}

/** Con presión en el circuito (bomba girando o caudal), abrir algo rocía agua (F12-E40). */
const pressurized = (w: F12World) => w.pump.on || w.pump.n > 0.02 || flowingF12(w);

function spray(w: F12World, what: string): F12DispatchResult {
  const v = 250;
  const take = Math.min(v, circuitWater(w));
  w.circuit.airCm3 += take;
  w.spill += take;
  errF12(w, 'E40', 'OPENED_UNDER_PRESSURE', 'CRITICAL', { what });
  bumpF12(w, 'spray');
  if (!w.safety.block) w.safety.block = { code: 'SPRAY', since: w.timeS };
  return { ok: false, code: 'PRESSURIZED' };
}

function route(w: F12World, cmd: F12Command): F12DispatchResult {
  const p = w.params;
  switch (cmd.type) {
    case 'equipPpe':
      if (!(cmd.item in w.safety.ppe)) return { ok: false, code: 'UNKNOWN' };
      w.safety.ppe[cmd.item] = !!cmd.on;
      return { ok: true };
    case 'startWork':
      return startWork(w);
    case 'inspect':
      return inspect(w, String(cmd.target));
    case 'setPose':
      return setPose(w, cmd.id, cmd.pose, cmd.support);
    // A — circuito
    case 'fitGasket': {
      if (!isJoint(cmd.joint)) return { ok: false, code: 'UNKNOWN' };
      const j = w.circuit.joints[cmd.joint];
      if (j.connected) return { ok: false, code: 'JOINT_CLOSED' };
      j.gasket = true;
      j.worn = false;
      emitF12(w, 'GASKET_FITTED', 'INFO', { joint: cmd.joint });
      return { ok: true };
    }
    case 'connectJoint':
      return connectJoint(w, cmd.joint, !!cmd.on);
    case 'setPurge':
      if (w.circuit.purgeOpen === !!cmd.open) return { ok: true };
      w.circuit.purgeOpen = !!cmd.open;
      w.trial++;
      emitF12(w, cmd.open ? 'PURGE_OPEN' : 'PURGE_CLOSED', 'INFO');
      return { ok: true };
    case 'clampVenturi':
      w.circuit.clamped = !!cmd.on;
      if (cmd.on) rearmErrF12(w, 'E28');
      w.trial++;
      emitF12(w, cmd.on ? 'CLAMPED' : 'UNCLAMPED', 'INFO');
      return { ok: true };
    case 'swapSpool':
      return swapSpool(w, cmd.kind);
    case 'insertStopper': {
      if (w.stopper !== 'bench') return { ok: true };
      if (w.circuit.joints.J1.connected) return { ok: false, code: 'JOINT_CLOSED' };
      // El tapón entra por la boca abierta del Venturi y se aloja en la garganta (F12-E18).
      w.stopper = 'pipe';
      w.circuit.obstructed = true;
      w.trial++;
      emitF12(w, 'STOPPER_IN_PIPE', 'WARN');
      return { ok: true };
    }
    case 'removeStopper': {
      if (w.stopper !== 'pipe') return { ok: true };
      if (pressurized(w)) return spray(w, 'stopper');
      if (w.circuit.joints.J1.connected) return { ok: false, code: 'JOINT_CLOSED' };
      w.stopper = 'bench';
      w.circuit.obstructed = false;
      rearmErrF12(w, 'E18');
      w.trial++;
      emitF12(w, 'STOPPER_REMOVED', 'INFO');
      return { ok: true };
    }
    case 'mopSpill': {
      if (w.spill < 1e-9) return { ok: true };
      const s = w.spill;
      w.mopped += s;
      w.spill = 0;
      flagF12(w, 'mopped');
      emitF12(w, 'SPILL_MOPPED', 'INFO', { mL: Math.round(s) });
      return { ok: true };
    }
    case 'readSump':
      return readSump(w, num(cmd.viewDeg));
    // C — bomba y válvula
    case 'setPump':
      return setPump(w, !!cmd.on);
    case 'setSpeed': {
      const v = Math.round(clamp(cmd.value, 0, 1) * 1000) / 1000;
      if (Math.abs(v - w.pump.set) < 1e-9) return { ok: true, value: v };
      w.pump.set = v;
      if (w.pump.on) w.trial++;
      return { ok: true, value: v };
    }
    case 'setValve':
      return setValve(w, Math.round(clamp(cmd.pos, 0, p.K.valve.length - 1)));
    // D — tomas y sensores
    case 'capPort': {
      if (!isPort(cmd.port)) return { ok: false, code: 'UNKNOWN' };
      const port = w.ports[cmd.port];
      if (port.capped === !!cmd.on) return { ok: true };
      if (!cmd.on && pressurized(w) && !SENSORS.some((i) => w.sensors[i].port === cmd.port)) return spray(w, `port${cmd.port}`);
      port.capped = !!cmd.on;
      if (!cmd.on) rearmErrF12(w, 'E06');
      w.trial++;
      emitF12(w, cmd.on ? 'PORT_CAPPED' : 'PORT_OPEN', 'INFO', { port: cmd.port });
      return { ok: true };
    }
    case 'setProbe': {
      if (!isPort(cmd.port) || (cmd.kind !== 'static' && cmd.kind !== 'pitot')) return { ok: false, code: 'UNKNOWN' };
      if (pressurized(w)) return spray(w, `port${cmd.port}`);
      w.ports[cmd.port].probe = cmd.kind;
      if (cmd.kind === 'static') rearmErrF12(w, 'E07');
      w.trial++;
      emitF12(w, cmd.kind === 'pitot' ? 'PITOT_FITTED' : 'STATIC_FITTED', cmd.kind === 'pitot' ? 'WARN' : 'INFO', { port: cmd.port });
      return { ok: true };
    }
    case 'connectSensor': {
      const i = cmd.sensor;
      if (i !== 1 && i !== 2 && i !== 3) return { ok: false, code: 'UNKNOWN' };
      const port = cmd.port === null ? null : isPort(cmd.port) ? cmd.port : undefined;
      if (port === undefined) return { ok: false, code: 'UNKNOWN' };
      if (port !== null && SENSORS.some((k) => k !== i && w.sensors[k].port === port)) return { ok: false, code: 'PORT_BUSY' };
      w.sensors[i].port = port;
      w.trial++;
      if (port === i) {
        rearmErrF12(w, 'E23');
        if (SENSORS.every((k) => w.sensors[k].port === null || w.sensors[k].port === k)) rearmErrF12(w, 'E08');
      }
      emitF12(w, port === null ? 'SENSOR_DISCONNECTED' : 'SENSOR_CONNECTED', 'INFO', { sensor: i, port: port ?? 0 });
      return { ok: true };
    }
    case 'setRange': {
      const i = Math.round(clamp(cmd.idx, 0, p.sensor.ranges.length - 1));
      w.logger.rangeIdx = i;
      if (i === p.sensor.ranges.length - 1) rearmErrF12(w, 'E22');
      return { ok: true, value: p.sensor.ranges[i] };
    }
    case 'setRate': {
      const hz = Math.round(num(cmd.hz));
      if (!p.rates.includes(hz)) return { ok: false, code: 'BAD_RATE' };
      w.logger.rateHz = hz;
      if (hz >= 20) rearmErrF12(w, 'E24');
      return { ok: true, value: hz };
    }
    case 'setPressureMode':
      if (cmd.mode !== 'gauge' && cmd.mode !== 'abs') return { ok: false, code: 'UNKNOWN' };
      w.logger.mode = cmd.mode;
      if (cmd.mode === 'gauge') rearmErrF12(w, 'E12');
      return { ok: true };
    case 'zeroSensors':
      return zeroSensors(w);
    case 'calibrateSensors': {
      const con = SENSORS.filter((i) => w.sensors[i].port !== null);
      if (!con.length) return { ok: false, code: 'NOT_CONNECTED' };
      if (pressurized(w)) return { ok: false, code: 'FLOWING' };
      for (const i of con) {
        w.sensors[i].scale = 1;
        w.sensors[i].calibrated = true;
      }
      rearmErrF12(w, 'E27');
      flagF12(w, 'sensorsCalibrated');
      emitF12(w, 'SENSORS_CALIBRATED', 'INFO', { kPa: 10, n: con.length });
      return { ok: true };
    }
    case 'newSeries':
      w.series = { id: w.series.id + 1, n: 0, configChanged: false, spoolChanged: false };
      w.trial++;
      rearmErrF12(w, 'E32');
      rearmErrF12(w, 'E10');
      emitF12(w, 'SERIES_STARTED', 'INFO', { n: w.series.id });
      return { ok: true, value: w.series.id };
    case 'readPressures':
      return readPressures(w);
    case 'readTapHeight':
      if (!isPort(cmd.port)) return { ok: false, code: 'UNKNOWN' };
      return readTapHeight(w, cmd.port, num(cmd.viewDeg));
    // E — caudal y geometría
    case 'readFlow':
      return readFlow(w);
    case 'setDiverter':
      return setDiverter(w, cmd.to);
    case 'moveBeaker': {
      const c = w.collect;
      if (cmd.to !== 'outlet' && cmd.to !== 'bench') return { ok: false, code: 'UNKNOWN' };
      if (c.beakerAt === cmd.to) return { ok: true };
      c.beakerAt = cmd.to;
      w.trial++;
      emitF12(w, cmd.to === 'outlet' ? 'BEAKER_AT_OUTLET' : 'BEAKER_ON_BENCH', 'INFO');
      return { ok: true };
    }
    case 'emptyBeaker': {
      const c = w.collect;
      if (c.beakerAt === 'outlet' && c.diverter === 'beaker') return { ok: false, code: 'COLLECTING' };
      w.sump += c.beakerVol;
      c.beakerVol = 0;
      c.overflowed = false;
      rearmErrF12(w, 'E14');
      w.trial++;
      emitF12(w, 'BEAKER_EMPTIED', 'INFO');
      return { ok: true };
    }
    case 'readBeaker':
      return readBeaker(w, num(cmd.viewDeg));
    case 'timer': {
      const tm = w.timer;
      if (cmd.action === 'start') {
        if (tm.running) return { ok: true };
        tm.running = true;
        tm.startT = w.timeS;
        tm.startedAt = w.timeS;
      } else if (cmd.action === 'stop') {
        if (!tm.running) return { ok: true };
        tm.elapsed = r6(tm.elapsed + w.timeS - tm.startT);
        tm.running = false;
        tm.stoppedAt = w.timeS;
      } else if (cmd.action === 'reset') {
        if (tm.running) return { ok: false, code: 'RUNNING' };
        tm.elapsed = 0;
        tm.startedAt = -10;
        tm.stoppedAt = -10;
      } else return { ok: false, code: 'UNKNOWN' };
      emitF12(w, `TIMER_${cmd.action.toUpperCase()}`, 'INFO');
      return { ok: true };
    }
    case 'readTimer':
      return readTimer(w);
    case 'measureDiameter':
      return measureDiameter(w, cmd.section, cmd.face, num(cmd.tiltDeg));
    // Cierre y seguridad
    case 'closeStation':
      return closeStation(w);
    case 'acknowledge':
      return acknowledge(w);
    case 'teacherStop':
      w.safety.stoppedByTeacher = !!cmd.on;
      if (cmd.on) {
        w.pump.on = false;
        w.timer.running = false;
      }
      emitF12(w, cmd.on ? 'TEACHER_STOP' : 'TEACHER_RESUME', cmd.on ? 'CRITICAL' : 'INFO');
      return { ok: true };
  }
  return { ok: false, code: 'UNKNOWN' };
}

// ─────────────────────────── Seguridad y reconocimiento ───────────────────────────

const PPE_ERR: Record<PpeItem, [string, string]> = {
  goggles: ['ppe_goggles', 'PPE_GOGGLES_MISSING'],
  coat: ['ppe_coat', 'PPE_COAT_MISSING'],
  shoes: ['ppe_shoes', 'PPE_SHOES_MISSING'],
  hair: ['hair_untied', 'HAIR_UNTIED'],
};

function startWork(w: F12World): F12DispatchResult {
  const missing = (Object.keys(PPE_ERR) as PpeItem[]).filter((k) => !w.safety.ppe[k]);
  if (missing.length) {
    for (const k of missing) {
      bumpF12(w, `err:${PPE_ERR[k][0]}`);
      emitF12(w, PPE_ERR[k][1], 'CRITICAL');
    }
    return { ok: false, code: 'PPE_MISSING' };
  }
  w.ppe = true;
  flagF12(w, 'ppe');
  emitF12(w, 'PPE_OK', 'INFO');
  return { ok: true };
}

function inspect(w: F12World, target: string): F12DispatchResult {
  const o = w.objects[target];
  if (!o) return { ok: false, code: 'NO_OBJECT' };
  flagF12(w, `inspected:${target}`);
  const p = w.params;
  const ok = (good: boolean, a: string, b: string, params?: Record<string, number | string>) => emitF12(w, good ? a : b, good ? 'INFO' : 'WARN', params);
  switch (o.kind) {
    case 'sump':
      emitF12(w, 'INSPECT_SUMP', 'INFO', { L: Math.round(w.sump / 100) / 10 });
      break;
    case 'pump':
      emitF12(w, 'INSPECT_PUMP', 'INFO', { kPa: Math.round(p.pump.H0 / 100) / 10 });
      break;
    case 'meter':
      emitF12(w, 'INSPECT_METER', 'INFO', { range: p.meter.rangeLs, res: p.meter.resLs });
      break;
    case 'joint': {
      const j = (target.replace('joint', '') as JointId) || 'J1';
      const s = w.circuit.joints[j];
      if (s && s.worn) emitF12(w, 'INSPECT_JOINT_WORN', 'WARN', { joint: j });
      else ok(!!s && (s.connected ? s.gasket : true), 'INSPECT_JOINT', 'INSPECT_JOINT_NO_GASKET', { joint: j });
      break;
    }
    case 'venturi':
      emitF12(w, 'INSPECT_VENTURI', 'INFO', { L: GEOF12.venturi.inlet + GEOF12.venturi.conv + GEOF12.venturi.throat + GEOF12.venturi.diff, rev: w.reversed ? 1 : 0 });
      break;
    case 'clamp':
      ok(w.circuit.clamped, 'INSPECT_CLAMP', 'INSPECT_CLAMP_FREE');
      break;
    case 'spool':
      emitF12(w, 'INSPECT_SPOOL', 'INFO', { kind: w.circuit.spool });
      break;
    case 'tapPiece':
      emitF12(w, 'INSPECT_TAPS', w.tapZ[3] !== w.tapZ[1] ? 'WARN' : 'INFO', { dz: Math.round(w.tapZ[3] - w.tapZ[1]) });
      break;
    case 'purge':
      ok(!w.circuit.purgeOpen, 'INSPECT_PURGE', 'INSPECT_PURGE_OPEN');
      break;
    case 'valve':
      emitF12(w, 'INSPECT_VALVE', 'INFO', { pos: w.valve.pos, n: p.K.valve.length - 1 });
      break;
    case 'outlet':
      emitF12(w, 'INSPECT_OUTLET', 'INFO');
      break;
    case 'beaker':
      emitF12(w, 'INSPECT_BEAKER', 'INFO', { mL: p.beaker.capML, res: p.beaker.resML });
      break;
    case 'timer':
      emitF12(w, 'INSPECT_TIMER', 'INFO', { res: p.timerResS });
      break;
    case 'panel':
      emitF12(w, 'INSPECT_PANEL', 'INFO', { kPa: p.sensor.ranges[p.sensor.ranges.length - 1] });
      break;
    case 'logger':
      ok(w.logger.rateHz >= 20 && w.logger.mode === 'gauge', 'INSPECT_LOGGER', 'INSPECT_LOGGER_LOW', { hz: w.logger.rateHz });
      break;
    case 'ruler':
      emitF12(w, 'INSPECT_RULER', 'INFO', { mm: p.rulerResCm * 10 });
      break;
    case 'gaskets':
      emitF12(w, 'INSPECT_GASKETS', 'INFO');
      break;
    case 'spare':
      emitF12(w, 'INSPECT_SPARE', 'INFO', { kind: w.circuit.spool === 'rough' ? 'smooth' : 'rough' });
      break;
    case 'caliper':
      emitF12(w, 'INSPECT_CALIPER', 'INFO', { mm: Math.round(p.caliperResCm * 1000) / 100 });
      break;
    case 'sample':
      emitF12(w, 'INSPECT_SAMPLE', 'INFO');
      break;
    case 'pitot':
      emitF12(w, 'INSPECT_PITOT', 'INFO');
      break;
    case 'stopper':
      emitF12(w, 'INSPECT_STOPPER', 'INFO');
      break;
    case 'towel':
      emitF12(w, 'INSPECT_TOWEL', 'INFO');
      break;
    default:
      emitF12(w, 'INSPECTED', 'INFO', { target });
  }
  return { ok: true };
}

const POSE_SUPPORTS = new Set(['bench', 'hand']);

function setPose(w: F12World, id: string, pose: Pose, support?: string): F12DispatchResult {
  const o = w.objects[id];
  if (!o) return { ok: false, code: 'NO_OBJECT' };
  if (!o.movable) return { ok: false, code: 'FIXED' };
  if (!pose || ![pose.x, pose.y, pose.z].every((v) => Number.isFinite(v))) return { ok: false, code: 'BAD_POSE' };
  if (support && support !== o.support && !POSE_SUPPORTS.has(support)) return { ok: false, code: 'NO_SEAT' };
  o.pose = { x: pose.x, y: pose.y, z: pose.z, rotationRad: num(pose.rotationRad) };
  if (support) o.support = support;
  return { ok: true };
}

// ─────────────────────────── Circuito ───────────────────────────

function connectJoint(w: F12World, j: JointId, on: boolean): F12DispatchResult {
  if (!isJoint(j)) return { ok: false, code: 'UNKNOWN' };
  const s = w.circuit.joints[j];
  if (s.connected === on) return { ok: true };
  if (!on && pressurized(w)) return spray(w, j);
  w.trial++;
  if (on) {
    s.connected = true;
    s.loose = false;
    if (j === 'J1' || j === 'J2') w.circuit.driftCm = 0;
    if (!s.gasket) emitF12(w, 'JOINT_NO_GASKET', 'WARN', { joint: j });
    else emitF12(w, 'JOINT_CONNECTED', 'INFO', { joint: j });
    if (!leakingF12(w)) rearmErrF12(w, 'E01');
    return { ok: true };
  }
  // Abrir una junta sin presión: lo que hay en el tramo vecino escurre a la bandeja y entra aire.
  s.connected = false;
  const drain = Math.min(circuitWater(w), 150);
  w.circuit.airCm3 += drain;
  w.sump += drain;
  emitF12(w, 'JOINT_OPENED', 'INFO', { joint: j });
  return { ok: true };
}

function swapSpool(w: F12World, kind: SpoolKind): F12DispatchResult {
  if (kind !== 'smooth' && kind !== 'rough') return { ok: false, code: 'UNKNOWN' };
  if (w.circuit.spool === kind) return { ok: true };
  if (pressurized(w)) return spray(w, 'spool');
  w.circuit.spool = kind;
  // El tramo sale con su agua (a la bandeja que vuelve al depósito) y entra aire: hay que purgar de nuevo.
  const drain = Math.min(circuitWater(w), SPOOL_CM3);
  w.circuit.airCm3 += drain;
  w.sump += drain;
  w.trial++;
  if (w.series.n > 0 && !w.series.spoolChanged) {
    // Cambiar la rugosidad con la serie empezada y sin anotarlo (F12-E10).
    w.series.spoolChanged = true;
    errF12(w, 'E10', 'SPOOL_CHANGED_IN_SERIES', 'WARN', { kind });
  }
  emitF12(w, 'SPOOL_SWAPPED', 'INFO', { kind });
  return { ok: true };
}

function setPump(w: F12World, on: boolean): F12DispatchResult {
  if (w.pump.on === on) return { ok: true };
  if (on && !circuitClosedF12(w)) return { ok: false, code: 'CIRCUIT_OPEN' };
  if (on && w.safety.block) return { ok: false, code: 'BLOCKED' };
  w.pump.on = on;
  w.trial++;
  emitF12(w, on ? 'PUMP_ON' : 'PUMP_OFF', 'INFO', { pct: Math.round(w.pump.set * 100) });
  return { ok: true };
}

function setValve(w: F12World, pos: number): F12DispatchResult {
  const v = w.valve;
  if (pos === v.pos) return { ok: true, value: pos };
  const t = w.timeS;
  // Un giro continuo (pasos separados menos de 0,5 s) es una sola maniobra desde donde empezó.
  if (t - v.lastT > w.params.slowCloseS) {
    v.moveStart = t;
    v.fromPos = v.pos;
  }
  v.lastT = t;
  const prev = v.pos;
  v.pos = pos;
  w.trial++;
  if (pos === 0 && flowingF12(w)) {
    // Cierre total con caudal: Joukowsky ρ c Δv, atenuado si la maniobra dura más que la ida y vuelta de la onda.
    const p = w.params;
    const hy = hydraulicsF12(w, w.flow.Q, 0, false);
    const Tc = Math.max(VALVE_TURN_S * Math.max(1, v.fromPos - pos) * 0.5, t - v.moveStart + VALVE_TURN_S);
    const Tw = (2 * (p.lenM.up + p.lenM.test + p.lenM.down)) / p.waveC;
    const dp = p.rho * p.waveC * hy.v[1] * Math.min(1, Tw / Tc);
    w.flow.Q = 0;
    w.flow.dQdt = 0;
    w.flow.surgePa = dp;
    w.flow.surgeUntil = r6(t + 0.4);
    if (dp > 3000) {
      errF12(w, 'E05', 'WATER_HAMMER', 'CRITICAL', { kPa: Math.round(dp / 100) / 10 });
      bumpF12(w, 'hammer');
    }
    overpressureCheck(w, hydraulicsF12(w, 0, 0, true), 'E05');
  } else if (pos > 0) rearmErrF12(w, 'E05');
  emitF12(w, 'VALVE_SET', 'INFO', { pos, from: prev });
  return { ok: true, value: pos };
}

/** Sobrepresión: abre el alivio, para la bomba por su presostato y daña los sensores expuestos. */
function overpressureCheck(w: F12World, hy: Hydraulics, code: 'E05' | 'E11'): void {
  const p = w.params;
  for (const i of SENSORS) {
    const s = w.sensors[i];
    if (s.port !== null && !w.ports[s.port].capped && hy.p[s.port] > p.pDamage && !s.damaged) {
      s.damaged = true;
      emitF12(w, 'SENSOR_DAMAGED', 'CRITICAL', { sensor: i });
      bumpF12(w, 'sensorDamage');
    }
  }
  if (hy.pOut <= p.pSafe || w.safety.block) return;
  w.pump.on = false;
  bumpF12(w, 'overpressure');
  if (code === 'E11') errF12(w, 'E11', 'OVERPRESSURE', 'CRITICAL', { kPa: Math.round(hy.pOut / 100) / 10 });
  else emitF12(w, 'RELIEF_OPEN', 'CRITICAL', { kPa: Math.round(hy.pOut / 100) / 10 });
  w.safety.block = { code: 'OVERPRESSURE', since: w.timeS };
}

function stepFlow(w: F12World, t: number, h: number) {
  const p = w.params;
  const pm = w.pump;
  const set = pm.on ? pm.set : 0;
  pm.n += (set - pm.n) * (1 - Math.exp(-h / p.pump.tauS));
  if (Math.abs(set - pm.n) < 1e-6) pm.n = set;
  const v = w.valve;
  // La válvula gira en 0,3 s: el coeficiente efectivo va al de la posición nueva en escala logarítmica.
  const kT = p.K.valve[v.pos];
  if (v.pos > 0) {
    if (v.kEff >= 1e8) v.kEff = kT * 50;
    const lk = Math.log(v.kEff) + (Math.log(kT) - Math.log(v.kEff)) * Math.min(1, h / VALVE_TURN_S * 3);
    v.kEff = Math.abs(lk - Math.log(kT)) < 1e-4 ? kT : Math.exp(lk);
  } else v.kEff = kT;
  const f = w.flow;
  if (v.pos <= 0) {
    f.Q = 0;
    f.dQdt = 0;
  } else {
    const I = inertance(w);
    const res = hydraulicsF12(w, f.Q, 0, false).pOut;
    const dQ = (pumpHead(w, f.Q, t) - res) / I;
    f.Q = Math.max(0, f.Q + dQ * h);
    if (f.Q < 1e-9 && pm.n < 1e-3) f.Q = 0;
    f.dQdt = f.Q > 0 ? dQ : 0;
  }
  const kAvg = 1 - Math.exp(-h / 1.5);
  f.Qavg += (f.Q - f.Qavg) * kAvg;
  f.meterQ += (f.Q * p.meter.k - f.meterQ) * (1 - Math.exp(-h / p.meter.tauS));
  const hy = hydraulicsF12(w);
  overpressureCheck(w, hy, surgeF12(w) ? 'E05' : 'E11');
  // Aire: el agua llena el circuito; sin purga queda la bolsa del punto alto y de los tubos de los sensores.
  const c = w.circuit;
  const qCm3 = f.Q * 1e6 * h;
  const air0 = c.airCm3;
  if (f.Q > FLOWING) {
    if (c.airCm3 > p.trapCm3) c.airCm3 = Math.max(p.trapCm3, c.airCm3 - qCm3);
    if (c.purgeOpen) c.airCm3 = Math.max(0, c.airCm3 - p.purgeCm3S * h);
  }
  const filled = air0 - c.airCm3;
  w.sump -= filled;
  if (c.purgeOpen && c.airCm3 <= 1e-9 && hy.p[3] > 0) {
    // Purga abierta sin aire: sale agua a la mesada.
    const out = Math.min(w.sump, 8 * Math.sqrt(hy.p[3] / 10000) * h);
    w.sump -= out;
    w.spill += out;
    if (!w.evidence['latch:purgeWater']) {
      w.evidence['latch:purgeWater'] = 1;
      emitF12(w, 'PURGE_WATER', 'WARN');
    }
  } else if (!c.purgeOpen) w.evidence['latch:purgeWater'] = 0;
  if (c.airCm3 <= 1e-9 && air0 > 1e-9) emitF12(w, 'CIRCUIT_PURGED', 'INFO');
  // Fugas: van a la mesada.
  const lk = (hy.leak.J1 + hy.leak.J2 + hy.leak.J3) * 1e6 * h;
  if (lk > 0) {
    const out = Math.min(w.sump, lk);
    w.sump -= out;
    w.spill += out;
    if (!w.evidence['latch:leakSeen']) {
      w.evidence['latch:leakSeen'] = 1;
      errF12(w, 'E01', 'JOINT_LEAK', 'WARN');
    }
  }
  // Desviador: el retorno va al vaso (o a la mesada si el vaso no está debajo).
  const col = w.collect;
  if (col.diverter === 'beaker') {
    const out = Math.min(w.sump, hy.Qo * 1e6 * h);
    w.sump -= out;
    if (col.beakerAt === 'outlet') {
      col.beakerVol += out;
      if (col.beakerVol > p.beaker.overML) {
        const ex = col.beakerVol - p.beaker.overML;
        col.beakerVol = p.beaker.overML;
        w.spill += ex;
        if (!col.overflowed) {
          col.overflowed = true;
          errF12(w, 'E14', 'BEAKER_OVERFLOW', 'WARN');
        }
      }
    } else w.spill += out;
  }
  // Venturi sin abrazaderas: el empuje del flujo lo corre y afloja J1 (F12-E28).
  if (!c.clamped && f.Q > 2e-4 && c.joints.J1.connected) {
    c.driftCm = r6(c.driftCm + p.clampDriftCmS * h * (f.Q / 1e-3));
    if (c.driftCm > 1 && !c.joints.J1.loose) {
      c.joints.J1.loose = true;
      errF12(w, 'E28', 'VENTURI_DRIFT', 'WARN', { cm: r2(c.driftCm) });
    }
  }
  // El depósito sin agua: la bomba aspira aire.
  if (w.sump < 1000 && pm.on && !w.evidence['latch:sumpLow']) {
    w.evidence['latch:sumpLow'] = 1;
    emitF12(w, 'SUMP_LOW', 'WARN');
  }
}

function stepSensors(w: F12World, h: number) {
  const p = w.params.sensor;
  const hy = hydraulicsF12(w);
  for (const i of SENSORS) {
    const s = w.sensors[i];
    const target = sensorTargetKPa(w, i, hy);
    const tau = airInLinesF12(w) && s.port !== null ? p.airTauS : p.tauS;
    s.lagKPa += (target - s.lagKPa) * (1 - Math.exp(-h / tau));
    s.avgKPa += (s.lagKPa - s.avgKPa) * (1 - Math.exp(-h / LOGGER_AVG_S));
  }
}

function stepTimer(w: F12World) {
  void w;
}

// ─────────────────────────── Sensores ───────────────────────────

function zeroSensors(w: F12World): F12DispatchResult {
  const con = SENSORS.filter((i) => w.sensors[i].port !== null);
  if (!con.length) return { ok: false, code: 'NOT_CONNECTED' };
  const bad = pressurized(w) || surgeF12(w);
  for (const i of con) {
    const s = w.sensors[i];
    // Re-referenciar con la bomba detenida asienta la membrana dañada (F12-E39).
    if (s.damaged && !bad) {
      s.damaged = false;
      s.lagKPa -= w.params.sensor.damageKPa;
      s.avgKPa -= w.params.sensor.damageKPa;
      rearmErrF12(w, 'E39');
      emitF12(w, 'SENSOR_REPAIRED', 'INFO', { sensor: i });
    }
    // El cero se hace con la llave del sensor abierta a la atmósfera: solo quita lo propio de la membrana.
    s.offset = r6(-s.scale * (s.lagKPa - portKPa(w, i)));
    s.zeroed = true;
    s.badZero = bad;
  }
  if (!bad) {
    rearmErrF12(w, 'E21');
    flagF12(w, 'sensorsZeroed');
  }
  emitF12(w, bad ? 'ZEROED_WITH_FLOW' : 'SENSORS_ZEROED', bad ? 'WARN' : 'INFO');
  return { ok: true };
}

// ─────────────────────────── Recolección ───────────────────────────

function setDiverter(w: F12World, to: 'sump' | 'beaker'): F12DispatchResult {
  const c = w.collect;
  if (to !== 'sump' && to !== 'beaker') return { ok: false, code: 'UNKNOWN' };
  if (c.diverter === to) return { ok: true };
  if (to === 'beaker' && c.beakerVol > 5) return { ok: false, code: 'BEAKER_NOT_EMPTY' };
  c.diverter = to;
  if (to === 'beaker') {
    c.startT = w.timeS;
    c.endT = -10;
  } else c.endT = w.timeS;
  emitF12(w, to === 'beaker' ? 'DIVERT_BEAKER' : 'DIVERT_SUMP', 'INFO');
  return { ok: true };
}

// ─────────────────────────── Lecturas ───────────────────────────

const PREFIX: Record<ReadingF12['kind'], string> = { pressure: 'p', flow: 'q', diameter: 'd', height: 'z', level: 'l', volume: 'v', time: 't' };

function addReading(w: F12World, r: Omit<ReadingF12, 'id' | 't' | 'tick' | 'trialId' | 'configVersion'> & { configVersion?: number }): ReadingF12 {
  const n = w.readingOrder.length + 1;
  const reading: ReadingF12 = { ...r, configVersion: r.configVersion ?? w.configVersion, id: `${PREFIX[r.kind]}${n}`, trialId: `T${w.trial}`, t: w.timeS, tick: w.tick };
  if (!Number.isFinite(reading.value)) reading.valid = false;
  if (!Number.isFinite(reading.trueValue)) reading.trueValue = 0;
  w.readings[reading.id] = reading;
  w.readingOrder.push(reading.id);
  return reading;
}

const quant = quantizeReading;

const FLAG_ERR: Record<string, [string, string]> = {
  LEAK: ['E01', 'JOINT_LEAK'],
  AIR: ['E02', 'AIR_IN_LINES'],
  TRANSIENT: ['E04', 'FLOW_TRANSIENT'],
  BLOCKED: ['E06', 'PORT_BLOCKED'],
  PITOT: ['E07', 'PITOT_READING'],
  CROSSED: ['E08', 'SENSORS_CROSSED'],
  SPOOL_CHANGED: ['E10', 'SPOOL_CHANGED_IN_SERIES'],
  ABSOLUTE: ['E12', 'ABSOLUTE_MODE'],
  NO_TIMER: ['E13', 'NO_TIMER'],
  TIMING: ['E13', 'TIMER_MISMATCH'],
  OVERFLOW: ['E14', 'BEAKER_OVERFLOW'],
  BELOW: ['E17', 'NEGATIVE_PRESSURE'],
  OBSTRUCTED: ['E18', 'THROAT_OBSTRUCTED'],
  NO_ZERO: ['E21', 'NOT_ZEROED'],
  CLIPPED: ['E22', 'SENSOR_SATURATED'],
  UNPLUGGED: ['E23', 'NO_SIGNAL'],
  LOW_RATE: ['E24', 'LOW_RATE'],
  OCCLUDED: ['E25', 'SCALE_OCCLUDED'],
  OBLIQUE: ['E26', 'CALIPER_OBLIQUE'],
  UNCALIBRATED: ['E27', 'SENSOR_UNCALIBRATED'],
  DRIFT: ['E28', 'VENTURI_DRIFT'],
  PARALLAX: ['E29', 'SCALE_PARALLAX'],
  UNSTABLE: ['E30', 'READ_BEFORE_STABLE'],
  CONFIG_CHANGED: ['E32', 'CONFIG_DURING_SERIES'],
  POST_DAMAGE: ['E39', 'READ_AFTER_DAMAGE'],
};

const raiseFlags = (w: F12World, qf: string[], inst: string) => {
  for (const f of qf) {
    if (!FLAG_ERR[f]) continue;
    errF12(w, FLAG_ERR[f][0], FLAG_ERR[f][1], 'WARN', { inst });
    bumpF12(w, `inst:${inst}:${FLAG_ERR[f][0]}`);
  }
};

function setupOf(w: F12World, hy: Hydraulics = hydraulicsF12(w)): F12Setup {
  return {
    speed: w.pump.set, valve: w.valve.pos, spool: w.circuit.spool, series: w.series.id, rateHz: w.logger.rateHz, mode: w.logger.mode, range: rangeKPaF12(w),
    trueQ: r4(hy.Qv * 1000), trueV2: r4(hy.v[2]),
  };
}

const parallax = (viewDeg: number, res: number, k: number, flags: string[]) => {
  if (Math.abs(viewDeg) <= 8) return 0;
  flags.push('PARALLAX');
  return Math.sign(viewDeg) * k * res;
};

/** Banderas del caudal comunes a presiones y caudalímetro. */
function flowFlags(w: F12World, flags: string[]) {
  if (flowingF12(w) && !steadyF12(w)) flags.push('TRANSIENT');
  if (flowingF12(w) && leakingF12(w)) flags.push('LEAK');
  if (w.circuit.obstructed) flags.push('OBSTRUCTED');
  if (w.circuit.driftCm > 0.05 && !w.circuit.clamped) flags.push('DRIFT');
  if (w.series.spoolChanged) flags.push('SPOOL_CHANGED');
}

function readPressures(w: F12World): F12DispatchResult {
  const p = w.params;
  const hy = hydraulicsF12(w);
  const res = resKPaF12(w);
  const range = rangeKPaF12(w);
  const abs = w.logger.mode === 'abs';
  const ids: string[] = [];
  const common: string[] = [];
  flowFlags(w, common);
  if (w.logger.rateHz < 20) common.push('LOW_RATE');
  if (w.series.configChanged) common.push('CONFIG_CHANGED');
  if (abs) common.push('ABSOLUTE');
  if (airInLinesF12(w)) common.push('AIR');
  const flowing = flowingF12(w);
  const setup = setupOf(w, hy);
  for (const i of SENSORS) {
    const s = w.sensors[i];
    const flags = [...common];
    if (s.port === null) flags.push('UNPLUGGED');
    else {
      if (s.port !== i) flags.push('CROSSED');
      if (w.ports[s.port].capped) flags.push('BLOCKED');
      if (w.ports[s.port].probe === 'pitot') flags.push('PITOT');
    }
    if (!s.zeroed || s.badZero) flags.push('NO_ZERO');
    if (!s.calibrated) flags.push('UNCALIBRATED');
    if (s.damaged) flags.push('POST_DAMAGE');
    const target = sensorTargetKPa(w, i, hy);
    // A 20 Hz el registrador promedia 1 s (filtra la pulsación); a menos toma una muestra suelta con más ruido.
    const base = w.logger.rateHz >= 20 ? s.avgKPa : s.lagKPa;
    if (Math.abs(target - s.lagKPa) > sensorTolKPa(w, s.lagKPa) || Math.abs(target - base) > sensorTolKPa(w, target) + 0.01) flags.push('UNSTABLE');
    let shown = s.scale * base + s.offset;
    shown += gaussF12(w) * p.sensor.noiseKPa * Math.sqrt(20 / w.logger.rateHz) * p.noiseFactor;
    if (p.pump.pulse > 0 && w.logger.rateHz < 20 && flowing) shown += gaussF12(w) * p.pump.pulse * 2 * s.lagKPa;
    if (shown < -res / 2) {
      flags.push('BELOW');
      shown = 0;
    } else if (shown > range) {
      flags.push('CLIPPED');
      shown = range;
    }
    if (abs) shown += p.pAtmKPa;
    const qf = [...new Set(flags)];
    raiseFlags(w, qf, `sensor${i}`);
    const value = s.port === null ? NaN : quant(shown, res);
    const truth = s.port === null ? 0 : hy.p[s.port] / 1000 + (abs ? p.pAtmKPa : 0);
    const r = addReading(w, {
      kind: 'pressure', instrumentId: `sensor${i}`, value, unit: 'kPa', resolution: res, uncertainty: p.uB.sensorKPa, sourceObjectIds: [`sensor${i}`, 'logger01', ...(s.port ? [`tap${s.port}`] : [])],
      qualityFlags: qf, trueValue: truth, target: `ch${i}`, series: w.series.id, flowing, spool: w.circuit.spool, setup,
    });
    ids.push(r.id);
  }
  w.series.n++;
  const bad = ids.some((id) => w.readings[id].qualityFlags.some((f) => FLAG_ERR[f]));
  emitF12(w, 'PRESSURES_READ', bad ? 'WARN' : 'INFO', {
    p1: w.readings[ids[0]].value, p2: w.readings[ids[1]].value, p3: w.readings[ids[2]].value,
  });
  return { ok: true, ids, id: ids[0] };
}

function readFlow(w: F12World): F12DispatchResult {
  const p = w.params;
  const flags: string[] = [];
  flowFlags(w, flags);
  if (Math.abs(w.flow.meterQ - w.flow.Q * p.meter.k) > meterTol(w)) flags.push('UNSTABLE');
  let shown = w.flow.meterQ * 1000 + gaussF12(w) * p.meter.noiseLs * p.noiseFactor * (w.flow.Q > FLOWING ? 1 : 0);
  if (shown > p.meter.rangeLs) {
    shown = p.meter.rangeLs;
    flags.push('CLIPPED');
  }
  const qf = [...new Set(flags)];
  raiseFlags(w, qf, 'meter01');
  const value = quant(Math.max(0, shown), p.meter.resLs);
  const hy = hydraulicsF12(w);
  const r = addReading(w, {
    kind: 'flow', instrumentId: 'meter01', value, unit: 'L/s', resolution: p.meter.resLs, uncertainty: p.uB.meterLs, sourceObjectIds: ['meter01'], qualityFlags: qf,
    trueValue: hy.Q * 1000, target: 'meter', series: w.series.id, flowing: flowingF12(w), spool: w.circuit.spool, setup: setupOf(w, hy),
  });
  emitF12(w, 'FLOW_READ', qf.some((f) => FLAG_ERR[f]) ? 'WARN' : 'INFO', { Ls: value });
  return { ok: true, id: r.id, value };
}

function readSump(w: F12World, viewDeg: number): F12DispatchResult {
  const p = w.params;
  const flags: string[] = [];
  const L = sumpLevelF12(w);
  let shown = L + parallax(viewDeg, p.sumpResCm, 3, flags);
  if (flowingF12(w)) flags.push('UNSTABLE');
  // Con aire en el circuito el depósito todavía no cedió toda el agua del llenado.
  if (w.circuit.airCm3 >= 5) flags.push('UNPURGED');
  const qf = [...new Set(flags)];
  raiseFlags(w, qf, 'sump01');
  shown = quant(Math.max(0, shown), p.sumpResCm);
  const r = addReading(w, {
    kind: 'level', instrumentId: 'sump01', value: shown, unit: 'cm', resolution: p.sumpResCm, uncertainty: p.uB.sumpCm, sourceObjectIds: ['sump01'], qualityFlags: qf, trueValue: L, target: 'sump',
    flowing: flowingF12(w),
  });
  emitF12(w, 'SUMP_READ', qf.length ? 'WARN' : 'INFO', { cm: shown });
  return { ok: true, id: r.id, value: shown };
}

function readTapHeight(w: F12World, port: PortId, viewDeg: number): F12DispatchResult {
  const p = w.params;
  const flags: string[] = [];
  const z = w.tapZ[port];
  const shown = quant(z + parallax(viewDeg, p.rulerResCm, 3, flags), p.rulerResCm);
  const qf = [...new Set(flags)];
  raiseFlags(w, qf, 'ruler01');
  const r = addReading(w, {
    kind: 'height', instrumentId: 'ruler01', value: shown, unit: 'cm', resolution: p.rulerResCm, uncertainty: p.uB.rulerCm, sourceObjectIds: ['ruler01', `tap${port}`], qualityFlags: qf,
    trueValue: z, target: `port${port}`,
  });
  emitF12(w, 'HEIGHT_READ', qf.length ? 'WARN' : 'INFO', { port, cm: shown });
  return { ok: true, id: r.id, value: shown };
}

function readBeaker(w: F12World, viewDeg: number): F12DispatchResult {
  const p = w.params;
  const c = w.collect;
  const tm = w.timer;
  const flags: string[] = [];
  if (c.beakerVol < 5) flags.push('EMPTY');
  if (c.beakerAt === 'outlet') flags.push('OCCLUDED');
  if (c.diverter === 'beaker') flags.push('UNSTABLE');
  if (c.overflowed) flags.push('OVERFLOW');
  // ¿Se cronometró esta recolección? (F12-E13)
  const timed = tm.startedAt >= c.startT - p.timingS && tm.startedAt > -5;
  if (c.startT > -5 && !timed) flags.push('NO_TIMER');
  else if (timed && (Math.abs(tm.startedAt - c.startT) > p.timingS || (c.endT > -5 && Math.abs(tm.stoppedAt - c.endT) > p.timingS))) flags.push('TIMING');
  let shown = c.beakerVol + parallax(viewDeg, p.beaker.resML, 1, flags);
  const qf = [...new Set(flags)];
  raiseFlags(w, qf, 'beaker01');
  shown = quant(Math.max(0, Math.min(p.beaker.overML, shown)), p.beaker.resML);
  const r = addReading(w, {
    kind: 'volume', instrumentId: 'beaker01', value: shown, unit: 'mL', resolution: p.beaker.resML, uncertainty: p.uB.beakerML, sourceObjectIds: ['beaker01'], qualityFlags: qf,
    trueValue: c.beakerVol, target: 'beaker',
  });
  emitF12(w, 'BEAKER_READ', qf.some((f) => FLAG_ERR[f]) ? 'WARN' : 'INFO', { mL: shown });
  return { ok: true, id: r.id, value: shown };
}

function readTimer(w: F12World): F12DispatchResult {
  const p = w.params;
  const flags: string[] = [];
  if (w.timer.running) flags.push('RUNNING');
  const t = timerValueF12(w);
  const value = quant(t, p.timerResS);
  const c = w.collect;
  const r = addReading(w, {
    kind: 'time', instrumentId: 'timer01', value, unit: 's', resolution: p.timerResS, uncertainty: p.uB.timerS, sourceObjectIds: ['timer01'], qualityFlags: flags,
    trueValue: c.endT > c.startT ? c.endT - c.startT : t, target: 'timer',
  });
  emitF12(w, 'TIMER_READ', 'INFO', { s: value });
  return { ok: true, id: r.id, value };
}

function measureDiameter(w: F12World, section: 'D1' | 'D2', face: 'inner' | 'outer', tiltDeg: number): F12DispatchResult {
  if ((section !== 'D1' && section !== 'D2') || (face !== 'inner' && face !== 'outer')) return { ok: false, code: 'UNKNOWN' };
  const p = w.params;
  const D = (section === 'D1' ? p.D1 : p.D2) * 100 + (face === 'outer' ? 2 * p.wallM * 100 : 0);
  const tilt = clamp(tiltDeg, 0, 30);
  const flags: string[] = [];
  if (tilt >= 3) flags.push('OBLIQUE');
  if (face === 'outer') flags.push('OUTER');
  // Calibre inclinado sobre un cilindro: mide el eje mayor de la sección oblicua, D / cos α.
  const shown = quant(D / Math.cos(tilt * DEG) + gaussF12(w) * 0.001 * p.noiseFactor, p.caliperResCm);
  const qf = [...new Set(flags)];
  raiseFlags(w, qf, 'caliper01');
  const r = addReading(w, {
    kind: 'diameter', instrumentId: 'caliper01', value: shown, unit: 'cm', resolution: p.caliperResCm, uncertainty: p.uB.caliperCm, sourceObjectIds: ['caliper01', 'sample01'], qualityFlags: qf,
    trueValue: D, target: section, face,
  });
  emitF12(w, 'DIAMETER_READ', qf.some((f) => FLAG_ERR[f]) ? 'WARN' : 'INFO', { cm: shown });
  return { ok: true, id: r.id, value: shown };
}

// ─────────────────────────── Cierre y bloqueos ───────────────────────────

function closeStation(w: F12World): F12DispatchResult {
  if (w.pump.on || flowingF12(w)) {
    // Cerrar con la bomba en marcha (F12-E20): el circuito sigue presurizado y suena la alarma.
    errF12(w, 'E20', 'CLOSE_PUMP_ON', 'WARN');
    return { ok: false, code: 'PUMP_ON' };
  }
  if (w.collect.diverter === 'beaker' || w.timer.running) return { ok: false, code: 'COLLECTING' };
  if (w.collect.beakerVol > 5 || w.collect.beakerAt !== 'bench') return { ok: false, code: 'BEAKER_FULL' };
  if (w.circuit.purgeOpen) return { ok: false, code: 'PURGE_OPEN' };
  if (w.stopper !== 'bench') return { ok: false, code: 'STOPPER_IN' };
  if (w.spill > 1) return { ok: false, code: 'SPILL' };
  rearmErrF12(w, 'E20');
  flagF12(w, 'stationClosed');
  emitF12(w, 'STATION_CLOSED', 'INFO');
  return { ok: true };
}

function acknowledge(w: F12World): F12DispatchResult {
  const b = w.safety.block;
  if (!b) return { ok: true };
  if (w.pump.on || w.pump.n > 0.02) return { ok: false, code: 'SECURE_FIRST' };
  w.safety.block = null;
  emitF12(w, 'STATION_RESET', 'INFO', { code: b.code });
  return { ok: true };
}

// ─────────────────────────── Paso de simulación ───────────────────────────

export function stepF12World(w: F12World): void {
  const dt = w.params.dtS;
  const n = Math.max(1, w.params.subSteps);
  const hh = dt / n;
  const tStart = w.timeS;
  w.timeS = Math.round((w.timeS + dt) * 1e6) / 1e6;
  w.tick++;
  for (let i = 0; i < n; i++) {
    const t = tStart + i * hh;
    stepFlow(w, t, hh);
    stepSensors(w, hh);
  }
  stepTimer(w);
  const f = w.flow;
  f.Q = Math.round(f.Q * 1e12) / 1e12;
  f.dQdt = Math.round(f.dQdt * 1e9) / 1e9;
  f.Qavg = Math.round(f.Qavg * 1e12) / 1e12;
  f.meterQ = Math.round(f.meterQ * 1e12) / 1e12;
  w.pump.n = Math.round(w.pump.n * 1e9) / 1e9;
  w.valve.kEff = Math.round(w.valve.kEff * 1e6) / 1e6;
  for (const i of SENSORS) {
    w.sensors[i].lagKPa = Math.round(w.sensors[i].lagKPa * 1e9) / 1e9;
    w.sensors[i].avgKPa = Math.round(w.sensors[i].avgKPa * 1e9) / 1e9;
  }
  w.circuit.airCm3 = Math.round(w.circuit.airCm3 * 1e6) / 1e6;
}

export function runF12For(w: F12World, seconds: number) {
  const n = Math.round(seconds / w.params.dtS);
  for (let i = 0; i < n; i++) stepF12World(w);
}

export function f12Summary(w: F12World) {
  return {
    Q: r4(w.flow.Q * 1000),
    n: r4(w.pump.n),
    valve: w.valve.pos,
    air: r2(w.circuit.airCm3),
    sump: r2(w.sump),
    beaker: r2(w.collect.beakerVol),
    trial: w.trial,
    readings: w.readingOrder.length,
    cfg: w.configVersion,
  };
}

export { JOINTS, PORTS, SENSORS };
