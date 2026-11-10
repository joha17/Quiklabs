/**
 * Mundo de F04 — leyes de Newton y sistemas acoplados: paso fijo determinista de 0,05 s con 10 subpasos de 5 ms (§6).
 * La escena solo dibuja este estado y envía hechos geométricos.
 *
 * - Carro, cordel, polea y portapesas: con el cordel TENSO el sistema se mueve junto con masa efectiva
 *   M = m_c + m_h + I/r² bajo m_h g + m_c g sen θ menos el roce del carril, el del cable que arrastra, el del rodamiento
 *   (τ/r), el del cordel enredado en el eje, el de la abrazadera floja y el freno magnético (b v). Las tensiones salen de
 *   las ecuaciones de cada cuerpo: T₂ = m_h (g − a) y T₁ = T₂ − (I/r²) a − τ/r; si T₁ quedara negativa el cordel se
 *   AFLOJA y cada cuerpo sigue su propia ecuación hasta que vuelve a tensarse con un tirón inelástico (impulso común).
 * - El portapesas aterriza en el suelo (pierde su energía) y el carro sigue libre; el tope devuelve el carro con
 *   restitución; un choque fuerte deja corrido el acelerómetro (F04-E39) hasta reasentarlo.
 * - Pareja de carros (estación D): parachoques de resorte amortiguado k entre P y Q integrados con micro-pasos de 1 ms;
 *   la mano empuja P con un pulso de medio seno. Los dinamómetros de cada carro leen la compresión con su signo.
 * - Instrumentos: balanza de 1 g, acelerómetro del carro (aceleración propia a − g sen θ), sensor de fuerza en el gancho
 *   (`instruments/force-sensor`), dos fotopuertas sobre la bandera (`instruments/photogate`) y registrador a 10–200 Hz.
 */
import type { F04Command, F04DispatchResult, FbdBody, FbdDir, FbdForce, FbdPartner, ForceId, MassPlace, PpeItem, SensorId } from './commands';
import type { F04Object, F04Params, F04World, PairRecord, Pose, ReadingF4, RunRecord, RunSetup, SensorState } from './types';
import { hashRandom } from '../core/rng';
import { bumpF4, emitF4, errF4, flagF4, gaussF4, rearmErrF4 } from './events';
import { CART_START_S, FLOOR_DEPTH, GEOF04, PAIR_TOUCH_M, PULLEY_S, STRING_FREE_M } from './geometry';
import { cartMassKg, conservedTotalsF04, hangMassKg, mechanicalEnergyJ, pairEnergyJ, pulleyMassKg } from './conservation';
import { newGate, timerIndication, updateGate } from '../instruments/photogate';
import { accelIndication, forceIndication, quantizeReading } from '../instruments/force-sensor';

export { emitF4, latchF4, rearmF4, bumpF4, flagF4, errF4 } from './events';
export { conservedTotalsF04, cartMassKg, hangMassKg };

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, num(v, a)));
const DEG = Math.PI / 180;
const HL = GEOF04.cart.halfLenM;
const PAIR_LEN = (GEOF04.pairTrack.x1 - GEOF04.pairTrack.x0) / 100;
const PAIR_HALF = GEOF04.pairCart.len / 200;
/** Posiciones de reposo de la pareja (m desde el extremo izquierdo de su pista). */
export const PAIR_P0 = 0.3;

/** Escenarios docentes (§10). */
export const SF4 = {
  IDEAL: 'F04-S01_ideal',
  FRICTION: 'F04-S02_friction',
  PULLEY_INERTIA: 'F04-S03_pulley_inertia',
  SATURATED: 'F04-S04_saturated_sensor',
  SMALL_HANG: 'F04-S05_small_hanging_mass',
  LARGE_HANG: 'F04-S06_large_hanging_mass',
  SLACK: 'F04-S07_slack_string',
  SLOPE: 'F04-S08_sloped_track',
  BILATERAL: 'F04-S09_bilateral_sensors',
  LOSSY: 'F04-S10_lossy_rotation',
  CLOSE_STOP: 'F04-S11_close_stops',
  REPEATED: 'F04-S12_repeated_trial',
} as const;

export interface F04WorldSpec {
  objects: F04Object[];
  scenarios: string[];
  mode: string;
}

export const SLOT_MASSES = ['m10a', 'm10b', 'm20a', 'm50a'] as const;
export const FORCE_IDS: ForceId[] = ['forceA', 'dynP', 'dynQ'];

// ─────────────────────────── Creación ───────────────────────────

const sensor = (offset: number, rangeIdx = 1, axisSign: 1 | -1 = 1): SensorState => ({ connected: false, offset, zeroed: false, scale: 1, calibrated: false, rangeIdx, angleDeg: 0, axisSign });

export function createF04World(spec: F04WorldSpec, seed: number, params: F04Params): F04World {
  const has = (s: string) => spec.scenarios.includes(s);
  const objects: Record<string, F04Object> = {};
  for (const o of spec.objects) objects[o.id] = { ...o, pose: { ...o.pose } };
  const h = (k: string) => hashRandom(seed, k) - 0.5;
  const sign = (k: string) => (h(k) > 0 ? 1 : -1);
  const offs = (k: string) => Math.round(sign(`${k}s`) * params.force.offsetN * (0.4 + (h(k) + 0.5) * 0.6) * 1000) / 1000;
  const tilt = has(SF4.SLOPE) ? 2.5 : Math.round(sign('tiltSign') * (0.4 + (h('tilt') + 0.5) * 0.6) * 100) / 100;
  const stopS = has(SF4.CLOSE_STOP) ? 1.04 : GEOF04.stop.s;
  const dynRange = has(SF4.SATURATED) ? 0 : 1;
  const sens = {
    forceA: sensor(offs('fA')),
    dynP: sensor(offs('dP'), dynRange, has(SF4.BILATERAL) ? 1 : -1),
    dynQ: sensor(offs('dQ'), dynRange, 1),
    accel01: sensor(0, 0),
  };
  for (const id of FORCE_IDS) sens[id].scale = params.force.uncalScale;
  sens.accel01.scale = 1;
  sens.accel01.calibrated = true;
  sens.accel01.zeroed = true;
  const w: F04World = {
    timeS: 0, tick: 0, seed, rng: seed >>> 0 || 1, params, mode: spec.mode, objects,
    track: { tiltDeg: tilt, touchedS: -10, levelVersion: 0 },
    cart: { s: CART_START_S, v: 0, latched: true, on: 'track', shock: false },
    string: { path: 'none', attached: false, hung: false, held: false, slack: 0, depth: 0, vh: 0, landed: false, pulleyAngle: 0, clamped: false },
    brake: { on: true, s: stopS - GEOF04.brake.gapToStop - GEOF04.brake.len },
    stopS,
    gates: { gate1: newGate(0.3), gate2: newGate(0.7) },
    sensors: sens,
    logger: { rateHz: params.rates[0], gatesConnected: false, cableClipped: false },
    balance: { on: null, placedS: -10, offsetG: Math.round(sign('balS') * (2 + (h('bal') + 0.5) * 2)), tared: false },
    run: null,
    runs: [],
    pair: { xP: PAIR_P0, vP: 0, xQ: PAIR_P0 + PAIR_TOUCH_M, vQ: 0, push: null, contactN: 0, active: false },
    pairRec: null,
    fbd: { cart: { arrows: [], locked: false }, hanger: { arrows: [], locked: false }, cartP: { arrows: [], locked: false } },
    energy: { dissipatedJ: 0, externalJ: 0 },
    momentum: { handImpulse: 0 },
    trial: 0,
    configVersion: 1,
    readings: {}, readingOrder: [],
    safety: { ppe: { coat: false, goggles: false, shoes: false, hair: false }, block: null, stoppedByTeacher: false },
    events: [], evidence: {}, scenarios: [...spec.scenarios], ppe: false,
    initialTotals: { massesG: 0 },
  };
  w.initialTotals = { massesG: conservedTotalsF04(w).massesG };
  w.energy.externalJ = mechanicalEnergyJ(w);
  return w;
}

// ─────────────────────────── Consultas ───────────────────────────

/** Centro máximo del carro contra el tope (m). */
export const sMaxF4 = (w: F04World) => w.stopS - HL;
/** Zona del freno magnético [inicio, fin] (m de carril). */
export const brakeZoneF4 = (w: F04World): [number, number] => [w.brake.s, w.brake.s + GEOF04.brake.len];
/** Profundidad del gancho con el cordel tenso para el carro en s (m). */
export const tautDepth = (s: number) => STRING_FREE_M - (PULLEY_S - (s + HL));
/** El portapesas cuelga libre del cordel (no sostenido ni en el suelo). */
export const hangingF4 = (w: F04World) => w.string.hung && !w.string.held && !w.string.landed;
export const runningF4 = (w: F04World) => !!w.run && !w.run.done;
export const sinTilt = (w: F04World) => Math.sin(w.track.tiltDeg * DEG);
/** Cuerpos sobre los que se dibujan diagramas. */
export const FBD_BODIES: FbdBody[] = ['cart', 'hanger', 'cartP'];
/** ¿Una compuerta queda dentro de un sólido (freno o pestillo) que tapa su haz? */
export function gateOccluded(w: F04World, id: string): boolean {
  const g = w.gates[id];
  if (!g) return false;
  const [b0, b1] = brakeZoneF4(w);
  return (g.s > b0 - 0.01 && g.s < b1 + 0.01) || g.s < GEOF04.latch.s + 0.04;
}

// ─────────────────────────── Despacho ───────────────────────────

const BEFORE_PPE = new Set<F04Command['type']>(['equipPpe', 'startWork', 'teacherStop', 'acknowledge', 'inspect']);
const DURING_BLOCK = new Set<F04Command['type']>(['acknowledge', 'teacherStop', 'inspect', 'setPose', 'hangHanger', 'placeMass']);
/** Comandos que cambian la condición física del ensayo (nuevo montaje; E32 si el carro está en marcha). */
const CONFIG = new Set<F04Command['type']>([
  'turnLevelScrew', 'clampPulley', 'threadString', 'attachString', 'hangHanger', 'placeMass', 'setBrake', 'moveBrake', 'moveStop', 'moveGate', 'mountSensor', 'setRange', 'setRate',
  'clipCable', 'connect', 'zeroSensor', 'calibrateSensor', 'setAxisSign',
]);

export function dispatchF04(w: F04World, cmd: F04Command): F04DispatchResult {
  if (!cmd || typeof cmd !== 'object') return { ok: false, code: 'UNKNOWN' };
  if (w.safety.stoppedByTeacher && cmd.type !== 'teacherStop') return { ok: false, code: 'TEACHER_STOP' };
  if (!w.ppe && !BEFORE_PPE.has(cmd.type)) return { ok: false, code: 'PPE' };
  if (w.safety.block && !DURING_BLOCK.has(cmd.type)) return { ok: false, code: 'BLOCKED' };
  // Trabajo externo: lo que el gesto cambia en (energía mecánica + disipada): subir pesas, empujar, devolver el carro.
  const S0 = mechanicalEnergyJ(w) + w.energy.dissipatedJ;
  const before = w.configVersion;
  const moving = runningF4(w) && (Math.abs(w.cart.v) > 1e-3 || !w.cart.latched);
  const res = route(w, cmd);
  w.energy.externalJ += mechanicalEnergyJ(w) + w.energy.dissipatedJ - S0;
  if (res.ok && CONFIG.has(cmd.type)) {
    if (w.configVersion === before) w.configVersion++;
    const r = w.run;
    if (r && !r.done && moving && r.configChangedT === null) {
      r.configChangedT = Math.round((w.timeS - r.releasedS) * 1e4) / 1e4;
      errF4(w, 'E32', 'CONFIG_DURING_RUN', 'WARN', { cmd: cmd.type });
    }
  }
  return res;
}

function route(w: F04World, cmd: F04Command): F04DispatchResult {
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
    // Balanza e inventario
    case 'tareBalance':
      if (w.balance.on) return { ok: false, code: 'PAN_NOT_EMPTY' };
      w.balance.offsetG = 0;
      w.balance.tared = true;
      rearmErrF4(w, 'E21');
      flagF4(w, 'balanceTared');
      emitF4(w, 'BALANCE_TARED', 'INFO');
      return { ok: true };
    case 'placeOnBalance':
      return placeOnBalance(w, String(cmd.id));
    case 'removeFromBalance':
      return removeFromBalance(w);
    case 'readBalance':
      return readBalance(w);
    case 'placeMass':
      return placeMass(w, String(cmd.id), cmd.on);
    // Diagramas
    case 'drawForce':
      return drawForce(w, cmd.body, cmd.force, cmd.dir, cmd.partner);
    case 'eraseForce': {
      const f = w.fbd[cmd.body];
      if (!f) return { ok: false, code: 'UNKNOWN' };
      if (f.locked) return { ok: false, code: 'LOCKED' };
      const i = Math.floor(num(cmd.index, -1));
      if (i < 0 || i >= f.arrows.length) return { ok: false, code: 'NO_ARROW' };
      f.arrows.splice(i, 1);
      return { ok: true };
    }
    case 'lockFbd':
      return lockFbd(w, cmd.body);
    // Carril, polea, cordel
    case 'turnLevelScrew': {
      const t = clamp(cmd.turns, -40, 40);
      w.track.tiltDeg = Math.round(clamp(w.track.tiltDeg + t * w.params.levelDegPerTurn, -4, 4) * 1e4) / 1e4;
      w.track.touchedS = w.timeS;
      w.track.levelVersion++;
      return { ok: true, value: w.track.tiltDeg };
    }
    case 'readTilt':
      return readTilt(w);
    case 'clampPulley':
      w.string.clamped = !!cmd.on;
      if (cmd.on) rearmErrF4(w, 'E28');
      emitF4(w, cmd.on ? 'PULLEY_CLAMPED' : 'PULLEY_LOOSE', 'INFO');
      return { ok: true };
    case 'threadString':
      return threadString(w, cmd.path);
    case 'attachString':
      return attachString(w, !!cmd.on);
    case 'hangHanger':
      return hangHanger(w, !!cmd.on);
    case 'tensionString':
      return tensionString(w);
    case 'setBrake':
      w.brake.on = !!cmd.on;
      emitF4(w, cmd.on ? 'BRAKE_ON' : 'BRAKE_OFF', cmd.on ? 'INFO' : 'WARN');
      return { ok: true };
    case 'moveBrake': {
      const max = sMaxF4(w) - GEOF04.brake.len + HL - 0.02;
      w.brake.s = Math.round(clamp(cmd.s, 0.3, Math.max(0.3, max)) * 1e4) / 1e4;
      return { ok: true, value: w.brake.s };
    }
    case 'moveStop': {
      if (runningF4(w)) return { ok: false, code: 'BUSY' };
      w.stopS = Math.round(clamp(cmd.s, 0.8, GEOF04.stop.s) * 1e4) / 1e4;
      w.brake.s = Math.min(w.brake.s, w.stopS - GEOF04.brake.gapToStop - GEOF04.brake.len);
      return { ok: true, value: w.stopS };
    }
    case 'moveGate': {
      const g = w.gates[cmd.id];
      if (!g) return { ok: false, code: 'NO_OBJECT' };
      g.s = Math.round(clamp(cmd.s, 0.05, 1.45) * 1e4) / 1e4;
      return { ok: true, value: g.s };
    }
    case 'readScale':
      return readScale(w, cmd.target, num(cmd.viewDeg));
    // Sensores e interfaz
    case 'connect': {
      if (cmd.channel === 'gates') w.logger.gatesConnected = !!cmd.on;
      else if (w.sensors[cmd.channel]) w.sensors[cmd.channel].connected = !!cmd.on;
      else return { ok: false, code: 'UNKNOWN' };
      if (cmd.on) {
        rearmErrF4(w, 'E23');
        flagF4(w, `connected:${cmd.channel}`);
      }
      emitF4(w, cmd.on ? 'CHANNEL_ON' : 'CHANNEL_OFF', 'INFO', { ch: cmd.channel });
      return { ok: true };
    }
    case 'clipCable':
      w.logger.cableClipped = !!cmd.on;
      if (cmd.on) rearmErrF4(w, 'E18');
      return { ok: true };
    case 'zeroSensor':
      return zeroSensor(w, cmd.id);
    case 'calibrateSensor':
      return calibrateSensor(w, cmd.id);
    case 'setRange': {
      const s = w.sensors[cmd.id];
      if (!s) return { ok: false, code: 'UNKNOWN' };
      s.rangeIdx = Math.round(clamp(cmd.n, 0, w.params.force.ranges.length - 1));
      if (s.rangeIdx > 0) rearmErrF4(w, 'E22');
      return { ok: true, value: w.params.force.ranges[s.rangeIdx] };
    }
    case 'mountSensor': {
      const s = w.sensors[cmd.id];
      if (!s) return { ok: false, code: 'UNKNOWN' };
      s.angleDeg = Math.round(clamp(cmd.angleDeg, 0, 90) * 10) / 10;
      if (s.angleDeg < 3) {
        rearmErrF4(w, 'E26');
        rearmErrF4(w, 'E07');
      }
      return { ok: true, value: s.angleDeg };
    }
    case 'setAxisSign': {
      const s = w.sensors[cmd.id];
      if (!s) return { ok: false, code: 'UNKNOWN' };
      s.axisSign = cmd.sign === -1 ? -1 : 1;
      rearmErrF4(w, 'E13');
      return { ok: true };
    }
    case 'setRate': {
      const hz = Math.round(num(cmd.hz));
      if (!w.params.rates.includes(hz)) return { ok: false, code: 'BAD_RATE' };
      w.logger.rateHz = hz;
      if (hz >= 50) rearmErrF4(w, 'E24');
      return { ok: true, value: hz };
    }
    // Ensayo del carro
    case 'release':
      return release(w, 0);
    case 'pushCart':
      return release(w, clamp(cmd.ms, 0.05, 1.5));
    case 'returnCart':
      return returnCart(w);
    case 'readRun':
      return readRun(w, num(cmd.t0, NaN), num(cmd.t1, NaN));
    // Pareja
    case 'push':
      return pushPair(w, clamp(cmd.forceN, 0.2, 10), clamp(cmd.durationS, 0.05, 1));
    case 'resetPair': {
      const pr = w.pair;
      if (w.objects.cartP.support !== 'pairTrack' || w.objects.cartQ.support !== 'pairTrack') return { ok: false, code: 'CART_AWAY' };
      pr.xP = PAIR_P0;
      pr.xQ = PAIR_P0 + PAIR_TOUCH_M;
      pr.vP = 0;
      pr.vQ = 0;
      pr.push = null;
      pr.contactN = 0;
      pr.active = false;
      if (w.pairRec) w.pairRec.done = true;
      return { ok: true };
    }
    case 'readPair':
      return readPair(w);
    // Cierre y seguridad
    case 'closeStation':
      return closeStation(w);
    case 'acknowledge':
      return acknowledge(w);
    case 'teacherStop':
      w.safety.stoppedByTeacher = !!cmd.on;
      emitF4(w, cmd.on ? 'TEACHER_STOP' : 'TEACHER_RESUME', cmd.on ? 'CRITICAL' : 'INFO');
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

function startWork(w: F04World): F04DispatchResult {
  const missing = (Object.keys(PPE_ERR) as PpeItem[]).filter((k) => !w.safety.ppe[k]);
  if (missing.length) {
    for (const k of missing) {
      bumpF4(w, `err:${PPE_ERR[k][0]}`);
      emitF4(w, PPE_ERR[k][1], 'CRITICAL');
    }
    return { ok: false, code: 'PPE_MISSING' };
  }
  w.ppe = true;
  flagF4(w, 'ppe');
  emitF4(w, 'PPE_OK', 'INFO');
  return { ok: true };
}

function inspect(w: F04World, target: string): F04DispatchResult {
  if (!w.objects[target]) return { ok: false, code: 'NO_OBJECT' };
  flagF4(w, `inspected:${target}`);
  const p = w.params;
  const o = w.objects[target];
  switch (o.kind) {
    case 'track':
      emitF4(w, 'INSPECT_TRACK', 'INFO', { cm: GEOF04.track.length, deg: p.levelDegPerTurn });
      break;
    case 'cart':
      emitF4(w, 'INSPECT_CART', w.cart.shock ? 'WARN' : 'INFO', { g: Math.round(p.cartBodyKg * 1000) });
      break;
    case 'pulley':
      emitF4(w, 'INSPECT_PULLEY', w.string.clamped ? 'INFO' : 'WARN', { r: p.pulleyR, I: p.pulleyI });
      break;
    case 'hanger':
      emitF4(w, 'INSPECT_HANGER', 'INFO', { g: Math.round(p.hangerKg * 1000) });
      break;
    case 'forceSensor': {
      const s = w.sensors[target as ForceId];
      emitF4(w, 'INSPECT_FORCE', s && !s.calibrated ? 'WARN' : 'INFO', { range: p.force.ranges[s?.rangeIdx ?? 1], res: p.force.resolutions[s?.rangeIdx ?? 1] });
      break;
    }
    case 'accelerometer':
      emitF4(w, 'INSPECT_ACCEL', w.cart.shock ? 'WARN' : 'INFO', { range: p.accelRange, res: p.accelResolution });
      break;
    case 'logger':
      emitF4(w, 'INSPECT_LOGGER', 'INFO', { hz: w.logger.rateHz });
      break;
    case 'gate':
      emitF4(w, 'INSPECT_GATE', gateOccluded(w, target) ? 'WARN' : 'INFO', { res: p.gate.resolutionS });
      break;
    case 'balance':
      emitF4(w, 'INSPECT_BALANCE', w.balance.tared ? 'INFO' : 'WARN', { res: p.balanceResolutionG });
      break;
    case 'slotMass':
      emitF4(w, 'INSPECT_MASS', 'INFO', { g: Math.round((p.slotKg[target] ?? 0) * 1000) });
      break;
    default:
      emitF4(w, 'INSPECTED', 'INFO', { target });
  }
  return { ok: true };
}

const SUPPORTS = new Set(['bench', 'rack', 'hand']);

function setPose(w: F04World, id: string, pose: Pose, support?: string): F04DispatchResult {
  const o = w.objects[id];
  if (!o) return { ok: false, code: 'NO_OBJECT' };
  if (!o.movable) return { ok: false, code: 'FIXED' };
  if (!pose || ![pose.x, pose.y, pose.z].every((v) => Number.isFinite(v))) return { ok: false, code: 'BAD_POSE' };
  if (support && support !== o.support && !SUPPORTS.has(support)) return { ok: false, code: 'NO_SEAT' };
  o.pose = { x: pose.x, y: pose.y, z: pose.z, rotationRad: num(pose.rotationRad) };
  if (support) o.support = support;
  return { ok: true };
}

// ─────────────────────────── Lecturas ───────────────────────────

const PREFIX: Record<ReadingF4['kind'], string> = { mass: 'm', accelRest: 'n', length: 'L', run: 'r', pair: 'p' };

function addReading(w: F04World, r: Omit<ReadingF4, 'id' | 't' | 'tick' | 'trialId' | 'configVersion'> & { configVersion?: number; trial?: number }): ReadingF4 {
  const n = w.readingOrder.length + 1;
  const { trial, ...rest } = r;
  const reading: ReadingF4 = { ...rest, configVersion: r.configVersion ?? w.configVersion, id: `${PREFIX[r.kind]}${n}`, trialId: `T${trial ?? w.trial}`, t: w.timeS, tick: w.tick };
  if (!Number.isFinite(reading.value)) reading.valid = false;
  if (!Number.isFinite(reading.trueValue)) reading.trueValue = 0;
  w.readings[reading.id] = reading;
  w.readingOrder.push(reading.id);
  return reading;
}

const quant = quantizeReading;

/** Masa (g) del objeto sobre la balanza con lo que lleva encima. */
export function loadOnBalanceG(w: F04World, id: string): number {
  const p = w.params;
  const slots = (on: string) => SLOT_MASSES.filter((m) => w.objects[m]?.support === on).reduce((s, m) => s + (p.slotKg[m] ?? 0), 0);
  if (id === 'cart01') return (cartMassKg(w)) * 1000;
  if (id === 'hanger01') return (p.hangerKg + slots('hanger01')) * 1000;
  if (id === 'cartP') return p.pairPKg * 1000;
  if (id === 'cartQ') return p.pairQKg * 1000;
  return (p.slotKg[id] ?? 0) * 1000;
}

const WEIGHABLE = new Set(['cart01', 'hanger01', 'cartP', 'cartQ', ...SLOT_MASSES]);

function placeOnBalance(w: F04World, id: string): F04DispatchResult {
  if (!WEIGHABLE.has(id) || !w.objects[id]) return { ok: false, code: 'NO_OBJECT' };
  if (w.balance.on) return { ok: false, code: 'PAN_BUSY' };
  const o = w.objects[id];
  if (id === 'cart01') {
    if (w.string.attached) return { ok: false, code: 'DETACH_FIRST' };
    if (runningF4(w) || !w.cart.latched) return { ok: false, code: 'BUSY' };
    w.cart.on = 'balance';
  } else if (id === 'hanger01') {
    if (w.string.hung) return { ok: false, code: 'UNHANG_FIRST' };
    if (o.support !== 'rack') return { ok: false, code: 'NOT_ON_RACK' };
  } else if (id === 'cartP' || id === 'cartQ') {
    if (w.pair.active) return { ok: false, code: 'BUSY' };
  } else if (o.support !== 'rack') return { ok: false, code: 'NOT_ON_RACK' };
  o.support = 'balance';
  w.balance.on = id;
  w.balance.placedS = w.timeS;
  emitF4(w, 'ON_BALANCE', 'INFO', { id });
  return { ok: true };
}

function removeFromBalance(w: F04World): F04DispatchResult {
  const id = w.balance.on;
  if (!id) return { ok: true };
  const o = w.objects[id];
  if (id === 'cart01') {
    w.cart.on = 'track';
    w.cart.s = CART_START_S;
    w.cart.v = 0;
    w.cart.latched = true;
    o.support = 'track';
  } else if (id === 'cartP' || id === 'cartQ') o.support = 'pairTrack';
  else o.support = 'rack';
  w.balance.on = null;
  return { ok: true };
}

function readBalance(w: F04World): F04DispatchResult {
  const p = w.params;
  const id = w.balance.on;
  const trueG = id ? loadOnBalanceG(w, id) : 0;
  const flags: string[] = [];
  const settling = id !== null && w.timeS - w.balance.placedS < 1.5;
  let shown = trueG + w.balance.offsetG;
  if (settling) {
    flags.push('UNSTABLE');
    shown += gaussF4(w) * 4;
    errF4(w, 'E30', 'READ_BEFORE_STABLE', 'WARN', { inst: 'balance01' });
  }
  if (!w.balance.tared) {
    flags.push('NOT_ZEROED');
    errF4(w, 'E21', 'NOT_ZEROED', 'WARN', { inst: 'balance01' });
  }
  if (!id) flags.push('EMPTY');
  const value = quant(shown, p.balanceResolutionG);
  const slots = id === 'hanger01' || id === 'cart01' ? SLOT_MASSES.filter((m) => w.objects[m]?.support === id).reduce((s, m) => s + (p.slotKg[m] ?? 0) * 1000, 0) : 0;
  const r = addReading(w, {
    kind: 'mass', instrumentId: 'balance01', value, unit: 'g', resolution: p.balanceResolutionG, uncertainty: p.uB.balanceG, sourceObjectIds: ['balance01', ...(id ? [id] : [])], qualityFlags: flags,
    trueValue: trueG, target: id ?? 'empty', setup: { load: Math.round(slots) },
  });
  if (id && !flags.length) flagF4(w, `weighed:${id}`);
  emitF4(w, 'BALANCE_READ', 'INFO', { g: value });
  return { ok: true, id: r.id, value };
}

function placeMass(w: F04World, id: string, on: MassPlace): F04DispatchResult {
  const o = w.objects[id];
  if (!o || o.kind !== 'slotMass') return { ok: false, code: 'NO_OBJECT' };
  if (o.support === 'balance') return { ok: false, code: 'ON_BALANCE' };
  if (on === 'hanger') {
    const h = w.objects.hanger01;
    if (h.support === 'balance') return { ok: false, code: 'ON_BALANCE' };
    if (h.support === 'floor' && w.string.hung && !w.string.landed) return { ok: false, code: 'NO_SEAT' };
    o.support = 'hanger01';
  } else if (on === 'cart') {
    if (w.cart.on !== 'track') return { ok: false, code: 'ON_BALANCE' };
    o.support = 'cart01';
  } else if (on === 'rack') o.support = 'rack';
  else return { ok: false, code: 'NO_SEAT' };
  emitF4(w, 'MASS_MOVED', 'INFO', { id, on });
  return { ok: true };
}

function readTilt(w: F04World): F04DispatchResult {
  const p = w.params;
  const s = w.sensors.accel01;
  if (w.cart.on !== 'track') return { ok: false, code: 'CART_AWAY' };
  if (!w.cart.latched || runningF4(w)) return { ok: false, code: 'MOVING' };
  const flags: string[] = [];
  const settling = w.timeS - w.track.touchedS < 1.5;
  const trueA = -p.g * sinTilt(w);
  let value = NaN;
  if (!s.connected) {
    flags.push('UNPLUGGED');
    errF4(w, 'E23', 'NO_SIGNAL', 'WARN', { inst: 'accel01' });
  } else {
    const noise = gaussF4(w) * p.accelNoise * p.noiseFactor + (settling ? gaussF4(w) * 0.05 : 0);
    value = accelIndication(trueA, w.cart.shock ? p.shockOffset : 0, p.accelRange, p.accelResolution, noise).value;
  }
  if (settling) {
    flags.push('UNSTABLE');
    errF4(w, 'E30', 'READ_BEFORE_STABLE', 'WARN', { inst: 'accel01' });
  }
  if (w.cart.shock) flags.push('POST_IMPACT');
  const r = addReading(w, {
    kind: 'accelRest', instrumentId: 'accel01', value, unit: 'm/s²', resolution: p.accelResolution, uncertainty: p.uB.accel, sourceObjectIds: ['accel01', 'track01'], qualityFlags: flags,
    trueValue: trueA, target: 'track', setup: { levelVersion: w.track.levelVersion, tiltDeg: w.track.tiltDeg },
  });
  if (!flags.length && Math.abs(w.track.tiltDeg) <= 0.1) {
    flagF4(w, 'trackLevel');
    rearmErrF4(w, 'E02');
  }
  emitF4(w, 'TILT_READ', 'INFO', { a: value });
  return { ok: true, id: r.id, value };
}

function readScale(w: F04World, target: 'gate1' | 'gate2', viewDeg: number): F04DispatchResult {
  const p = w.params;
  const g = w.gates[target];
  if (!g) return { ok: false, code: 'NO_OBJECT' };
  const res = p.scaleResolutionCm;
  const flags: string[] = [];
  let shown = g.s * 100;
  if (Math.abs(viewDeg) > 8) {
    shown += Math.sign(viewDeg) * 3 * res;
    flags.push('PARALLAX');
    errF4(w, 'E29', 'SCALE_PARALLAX', 'WARN', { inst: 'track01' });
  }
  const value = quant(shown, res);
  const r = addReading(w, {
    kind: 'length', instrumentId: 'track01', value, unit: 'cm', resolution: res, uncertainty: p.uB.scaleCm, sourceObjectIds: ['track01', target], qualityFlags: flags,
    trueValue: g.s * 100, target, setup: { posCm: Math.round(g.s * 1e4) / 100 },
  });
  if (!flags.length) flagF4(w, `scale:${target}`);
  emitF4(w, 'SCALE_READ', 'INFO', { cm: value });
  return { ok: true, id: r.id, value };
}

// ─────────────────────────── Diagramas de cuerpo libre ───────────────────────────

type Need = [FbdForce, FbdDir, FbdPartner];
const FBD_REQUIRED: Record<FbdBody, Need[]> = {
  cart: [['weight', 'down', 'earth'], ['normal', 'up', 'track'], ['tension', 'left', 'string']],
  hanger: [['weight', 'down', 'earth'], ['tension', 'up', 'string']],
  cartP: [['weight', 'down', 'earth'], ['normal', 'up', 'track'], ['push', 'right', 'hand'], ['contact', 'left', 'cartQ']],
};
const FBD_OPTIONAL: Record<FbdBody, Need[]> = {
  cart: [['friction', 'right', 'track']],
  hanger: [],
  cartP: [['friction', 'left', 'track']],
};
export const fbdNeeds = (b: FbdBody) => FBD_REQUIRED[b];

function drawForce(w: F04World, body: FbdBody, force: FbdForce, dir: FbdDir, partner: FbdPartner): F04DispatchResult {
  const f = w.fbd[body];
  if (!f) return { ok: false, code: 'UNKNOWN' };
  if (f.locked) return { ok: false, code: 'LOCKED' };
  if (f.arrows.length >= 8) return { ok: false, code: 'FULL' };
  f.arrows.push({ force, dir, partner });
  if (force === 'weight' && dir !== 'down') errF4(w, 'E11', 'FBD_WEIGHT_NOT_DOWN', 'WARN', { body });
  const self = body === 'cart' ? 'cart' : body === 'hanger' ? 'hanger' : 'cartP';
  if (partner === self || (body === 'cartP' && force === 'contact' && dir === 'right')) errF4(w, 'E12', 'FBD_SAME_BODY_PAIR', 'WARN', { body });
  if ((force === 'weight' && partner !== 'earth') || (force === 'normal' && partner !== 'track')) errF4(w, 'E15', 'FBD_WRONG_PARTNER', 'WARN', { body });
  emitF4(w, 'FORCE_DRAWN', 'INFO', { body, force, dir });
  return { ok: true, value: f.arrows.length - 1 };
}

export function fbdCorrect(w: F04World, body: FbdBody): boolean {
  const f = w.fbd[body];
  const key = (a: { force: string; dir: string; partner: string }) => `${a.force}/${a.dir}/${a.partner}`;
  const req = FBD_REQUIRED[body].map(([a, b, c]) => `${a}/${b}/${c}`);
  const opt = FBD_OPTIONAL[body].map(([a, b, c]) => `${a}/${b}/${c}`);
  const got = f.arrows.map(key);
  if (new Set(got).size !== got.length) return false;
  return req.every((k) => got.includes(k)) && got.every((k) => req.includes(k) || opt.includes(k));
}

function lockFbd(w: F04World, body: FbdBody): F04DispatchResult {
  const f = w.fbd[body];
  if (!f) return { ok: false, code: 'UNKNOWN' };
  if (!fbdCorrect(w, body)) {
    emitF4(w, 'FBD_INCOHERENT', 'WARN', { body });
    return { ok: false, code: 'FBD_INCOHERENT' };
  }
  f.locked = true;
  flagF4(w, `fbdOk:${body}`);
  emitF4(w, 'FBD_LOCKED', 'INFO', { body });
  return { ok: true };
}

// ─────────────────────────── Cordel y portapesas ───────────────────────────

function threadString(w: F04World, path: 'groove' | 'axle' | 'none'): F04DispatchResult {
  if (!['groove', 'axle', 'none'].includes(path)) return { ok: false, code: 'UNKNOWN' };
  if (w.string.hung) return { ok: false, code: 'UNHANG_FIRST' };
  w.string.path = path;
  if (path === 'groove') {
    rearmErrF4(w, 'E04');
    flagF4(w, 'stringGroove');
  }
  emitF4(w, 'STRING_THREADED', path === 'axle' ? 'WARN' : 'INFO', { path });
  return { ok: true };
}

/** Energía del portapesas colgado (J) para cargarla a lo disipado cuando cae. */
const hangerEnergy = (w: F04World) => {
  const mh = hangMassKg(w);
  return 0.5 * (mh + pulleyMassKg(w)) * w.string.vh * w.string.vh + mh * w.params.g * ((GEOF04.pulley.axisZ + GEOF04.pulley.r) / 100 - w.string.depth);
};

function attachString(w: F04World, on: boolean): F04DispatchResult {
  const st = w.string;
  if (on) {
    if (w.cart.on !== 'track') return { ok: false, code: 'CART_AWAY' };
    st.attached = true;
    flagF4(w, 'stringAttached');
    return { ok: true };
  }
  if (!st.attached) return { ok: true };
  if (st.hung && st.held) {
    st.hung = false;
    st.held = false;
    w.objects.hanger01.support = 'rack';
  } else if (st.hung) {
    // Se suelta el extremo del cordel con el portapesas colgado: cae al suelo (F04-E40).
    if (!st.landed) w.energy.dissipatedJ += hangerEnergy(w);
    st.hung = false;
    st.landed = false;
    st.vh = 0;
    w.objects.hanger01.support = 'floor';
    bumpF4(w, 'massFell');
    errF4(w, 'E40', 'MASS_FALL', 'CRITICAL');
    w.safety.block = { code: 'MASS_FALL', since: w.timeS };
  }
  st.attached = false;
  st.slack = 0;
  return { ok: true };
}

function hangHanger(w: F04World, on: boolean): F04DispatchResult {
  const st = w.string;
  const h = w.objects.hanger01;
  if (on) {
    if (st.hung) return { ok: true };
    if (st.path === 'none') return { ok: false, code: 'THREAD_FIRST' };
    if (!st.attached) return { ok: false, code: 'ATTACH_FIRST' };
    if (!w.cart.latched || w.cart.on !== 'track') return { ok: false, code: 'LATCH_FIRST' };
    if (h.support !== 'rack') return { ok: false, code: 'NOT_ON_RACK' };
    st.hung = true;
    st.held = true;
    st.landed = false;
    st.slack = w.params.holdSlackM;
    st.depth = tautDepth(w.cart.s) - st.slack;
    st.vh = 0;
    h.support = 'string';
    flagF4(w, 'hung');
    emitF4(w, 'HANGER_HUNG', 'INFO');
    return { ok: true };
  }
  if (h.support === 'floor' && !st.hung) {
    h.support = 'rack';
    return { ok: true };
  }
  if (!st.hung) return { ok: true };
  if (runningF4(w) && !st.landed) return { ok: false, code: 'BUSY' };
  if (!w.cart.latched && !st.landed && !st.held) return { ok: false, code: 'LATCH_FIRST' };
  st.hung = false;
  st.held = false;
  st.landed = false;
  st.slack = 0;
  st.vh = 0;
  h.support = 'rack';
  return { ok: true };
}

function tensionString(w: F04World): F04DispatchResult {
  const st = w.string;
  if (!st.hung) return { ok: false, code: 'NOT_HUNG' };
  if (!st.held && st.slack <= 1e-9) return { ok: true };
  if (!w.cart.latched) return { ok: false, code: 'LATCH_FIRST' };
  st.held = false;
  st.slack = 0;
  st.landed = false;
  st.depth = tautDepth(w.cart.s);
  st.vh = 0;
  rearmErrF4(w, 'E03');
  flagF4(w, 'taut');
  emitF4(w, 'STRING_TAUT', 'INFO');
  return { ok: true };
}

// ─────────────────────────── Sensores ───────────────────────────

/** Fuerza verdadera en el gancho del sensor A (tensión del cordel del lado del carro, N). */
export function hookForceN(w: F04World): number {
  const st = w.string;
  if (!st.attached || !st.hung || st.held || st.landed || st.slack > 1e-9) return 0;
  if (w.cart.latched) return hangMassKg(w) * w.params.g;
  return w.evidence.__T1 ?? 0;
}

function zeroSensor(w: F04World, id: SensorId): F04DispatchResult {
  const s = w.sensors[id];
  if (!s) return { ok: false, code: 'UNKNOWN' };
  if (!s.connected) return { ok: false, code: 'NOT_CONNECTED' };
  if (id === 'accel01') {
    if (!w.cart.latched || w.cart.on !== 'track') return { ok: false, code: 'MOVING' };
    if (w.cart.shock) {
      w.cart.shock = false;
      rearmErrF4(w, 'E39');
      emitF4(w, 'ACCEL_RESEATED', 'INFO');
    }
    return { ok: true };
  }
  let f = 0;
  if (id === 'forceA') f = hookForceN(w);
  else f = w.pair.contactN > 0 ? -w.pair.contactN : 0;
  s.offset = -f * Math.cos(s.angleDeg * DEG) * s.scale;
  s.zeroed = Math.abs(f) < 0.01;
  if (s.zeroed) {
    rearmErrF4(w, 'E21');
    flagF4(w, `zeroed:${id}`);
  }
  emitF4(w, s.zeroed ? 'SENSOR_ZEROED' : 'SENSOR_ZEROED_LOADED', s.zeroed ? 'INFO' : 'WARN', { id });
  return { ok: true };
}

function calibrateSensor(w: F04World, id: ForceId): F04DispatchResult {
  const s = w.sensors[id];
  if (!s) return { ok: false, code: 'UNKNOWN' };
  if (!s.connected) return { ok: false, code: 'NOT_CONNECTED' };
  if (id === 'forceA' && w.string.attached) return { ok: false, code: 'UNLOAD_FIRST' };
  if (id !== 'forceA' && w.pair.active) return { ok: false, code: 'BUSY' };
  s.scale = 1;
  s.calibrated = true;
  rearmErrF4(w, 'E27');
  flagF4(w, `calibrated:${id}`);
  emitF4(w, 'SENSOR_CALIBRATED', 'INFO', { id, g: 200 });
  return { ok: true };
}

// ─────────────────────────── Ensayo del carro ───────────────────────────

function runSetup(w: F04World): RunSetup {
  const fa = w.sensors.forceA;
  const slotsOn = (on: string) => SLOT_MASSES.filter((m) => w.objects[m]?.support === on).reduce((s, m) => s + (w.params.slotKg[m] ?? 0) * 1000, 0);
  return {
    hangLoad: Math.round(hangMassKg(w) * 1e4) / 10,
    cartLoad: Math.round(slotsOn('cart01') * 10) / 10,
    g1: Math.round(w.gates.gate1.s * 1e4) / 100,
    g2: Math.round(w.gates.gate2.s * 1e4) / 100,
    rateHz: w.logger.rateHz,
    brakeOn: w.brake.on,
    levelVersion: w.track.levelVersion,
    tiltDeg: w.track.tiltDeg,
    path: w.string.path,
    clamped: w.string.clamped,
    cableClipped: w.logger.cableClipped,
    forceA: { zeroed: fa.zeroed, calibrated: fa.calibrated, angleDeg: fa.angleDeg, connected: fa.connected, range: fa.rangeIdx },
    accel: { connected: w.sensors.accel01.connected },
    gatesOn: w.logger.gatesConnected,
    occluded: ['gate1', 'gate2'].filter((g) => gateOccluded(w, g)),
    shock: w.cart.shock,
  };
}

const READ_ERRS = ['E05', 'E07', 'E08', 'E21', 'E22', 'E23', 'E24', 'E25', 'E26', 'E27', 'E32', 'E39'];

function release(w: F04World, handMs: number): F04DispatchResult {
  const c = w.cart;
  const st = w.string;
  if (c.on !== 'track') return { ok: false, code: 'CART_AWAY' };
  if (!c.latched) return { ok: false, code: 'NOT_LATCHED' };
  if (runningF4(w)) return { ok: false, code: 'BUSY' };
  for (const e of READ_ERRS) rearmErrF4(w, e);
  const p = w.params;
  const slackAtRelease = st.hung && (st.held || st.slack > 0.005);
  if (Math.abs(w.track.tiltDeg) > 0.15) errF4(w, 'E02', 'TRACK_NOT_LEVEL', 'WARN', { deg: Math.round(w.track.tiltDeg * 100) / 100 });
  if (slackAtRelease) errF4(w, 'E03', 'SLACK_AT_RELEASE', 'WARN', { cm: Math.round(st.slack * 1000) / 10 });
  if (st.hung && st.path === 'axle') errF4(w, 'E04', 'STRING_ON_AXLE', 'WARN');
  if (w.sensors.forceA.connected && !w.logger.cableClipped) errF4(w, 'E18', 'CABLE_DRAG', 'WARN');
  if (st.hung && !st.clamped) errF4(w, 'E28', 'PULLEY_LOOSE', 'WARN');
  if (handMs > 0) errF4(w, 'E09', 'HAND_RELEASE', 'WARN', { ms: handMs });
  if (st.hung && st.attached && st.path === 'groove' && st.clamped && !slackAtRelease) flagF4(w, 'stringOk');
  w.trial++;
  st.held = false;
  c.latched = false;
  c.v = handMs > 0 ? handMs : gaussF4(w) * p.releaseJitter;
  if (Math.abs(c.v) > 1e-9 && st.hung && st.slack <= 1e-9 && !st.landed) st.vh = c.v;
  for (const [id, g] of Object.entries(w.gates)) {
    g.events = [];
    g.blocked = false;
    g.onTrack = !gateOccluded(w, id);
  }
  const rec: RunRecord = {
    id: w.trial, releasedS: w.timeS, samples: [], gates: { gate1: [], gate2: [] }, slackT: slackAtRelease ? 0 : null, landedT: null, brakeT: null, impactT: null, impactV: 0, configChangedT: null, clippedT: null,
    done: false, nextT: 0, stillS: 0, hand: handMs > 0, slackAtRelease, setup: runSetup(w), configVersion: w.configVersion,
  };
  w.run = rec;
  w.runs.push(rec);
  // Solo se conservan las muestras de los últimos cuatro ensayos (las lecturas guardan lo que se midió).
  for (const old of w.runs.slice(0, -4)) old.samples = [];
  if (w.runs.length > 12) w.runs.splice(0, w.runs.length - 12);
  emitF4(w, handMs > 0 ? 'CART_PUSHED' : 'CART_RELEASED', handMs > 0 ? 'WARN' : 'INFO', { trial: w.trial });
  return { ok: true, value: w.trial };
}

function returnCart(w: F04World): F04DispatchResult {
  const c = w.cart;
  const st = w.string;
  if (c.on !== 'track') return { ok: false, code: 'CART_AWAY' };
  if (c.latched) return { ok: true };
  // La mano atrapa el carro si va despacio; a más de 0,3 m/s hay que esperar al freno o al tope.
  if (Math.abs(c.v) > 0.3 || (st.hung && !st.landed && Math.abs(st.vh) > 0.3)) return { ok: false, code: 'MOVING' };
  if (w.run && !w.run.done) w.run.done = true;
  c.s = CART_START_S;
  c.v = 0;
  c.latched = true;
  if (st.hung) {
    st.landed = false;
    st.held = false;
    st.slack = 0;
    st.depth = tautDepth(c.s);
    st.vh = 0;
    w.objects.hanger01.support = 'string';
  }
  emitF4(w, 'CART_RETURNED', 'INFO');
  return { ok: true };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);

/** Flags de calidad del sensor A en un montaje. */
function forceFlags(s: { zeroed: boolean; calibrated: boolean; angleDeg: number; connected: boolean }, out: string[]) {
  if (!s.connected) out.push('UNPLUGGED');
  if (!s.zeroed) out.push('NOT_ZEROED');
  if (!s.calibrated) out.push('UNCALIBRATED');
  if (s.angleDeg >= 60) out.push('PERPENDICULAR');
  else if (s.angleDeg >= 3) out.push('TILTED_SENSOR');
}

const FLAG_ERR: Record<string, [string, string]> = {
  LANDED: ['E05', 'READ_AFTER_LANDING'],
  CLIPPED: ['E08', 'READ_CLIPPED'],
  NOT_ZEROED: ['E21', 'NOT_ZEROED'],
  UNPLUGGED: ['E23', 'NO_SIGNAL'],
  LOW_RATE: ['E24', 'LOW_RATE'],
  OCCLUDED: ['E25', 'GATE_OCCLUDED'],
  TILTED_SENSOR: ['E26', 'SENSOR_TILTED'],
  PERPENDICULAR: ['E07', 'SENSOR_PERPENDICULAR'],
  UNCALIBRATED: ['E27', 'SENSOR_UNCALIBRATED'],
  POST_IMPACT: ['E39', 'READ_AFTER_IMPACT'],
  SAME_SIGN: ['E13', 'PAIR_SAME_SIGN'],
};

function readRun(w: F04World, t0: number, t1: number): F04DispatchResult {
  const rec = w.runs[w.runs.length - 1];
  if (!rec) return { ok: false, code: 'NO_RUN' };
  if (!rec.samples.length) return { ok: false, code: 'NO_DATA' };
  const p = w.params;
  const dur = rec.samples[rec.samples.length - 1][0];
  const a0 = clamp(t0, 0, dur);
  const a1 = clamp(t1, 0, dur);
  if (!(a1 - a0 >= 0.05)) return { ok: false, code: 'BAD_WINDOW' };
  const win = rec.samples.filter((x) => x[0] >= a0 - 1e-9 && x[0] <= a1 + 1e-9);
  const su = rec.setup;
  const flags: string[] = [];
  const within = (t: number | null) => t !== null && t <= a1;
  if (within(rec.slackT) || rec.slackAtRelease) flags.push('SLACK');
  if (within(rec.landedT)) flags.push('LANDED');
  if (within(rec.brakeT)) flags.push('BRAKING');
  if ((rec.impactT !== null && rec.impactT <= a1 && rec.impactV > 0.05) || su.shock) flags.push('POST_IMPACT');
  if (Math.abs(su.tiltDeg) > 0.15) flags.push('TILTED');
  if (rec.hand) flags.push('HAND_RELEASE');
  if (su.path === 'axle') flags.push('AXLE');
  if (su.forceA.connected && !su.cableClipped) flags.push('CABLE_DRAG');
  if (!su.clamped) flags.push('LOOSE_CLAMP');
  if (su.occluded.length) flags.push('OCCLUDED');
  forceFlags(su.forceA, flags);
  if (!su.accel.connected || !su.gatesOn) flags.push('UNPLUGGED');
  if (win.some((x) => x[5] > 0)) flags.push('CLIPPED');
  if (su.rateHz < 50) flags.push('LOW_RATE');
  if (within(rec.configChangedT)) flags.push('CONFIG_CHANGED');
  if (win.length < 5) flags.push('FEW_SAMPLES');
  const qf = [...new Set(flags)];
  for (const f of qf) if (FLAG_ERR[f]) errF4(w, FLAG_ERR[f][0], FLAG_ERR[f][1], 'WARN', { inst: 'logger01' });
  const aMean = su.accel.connected ? mean(win.map((x) => x[1])) : NaN;
  const TMean = su.forceA.connected ? mean(win.map((x) => x[2])) : NaN;
  const g1 = rec.gates.gate1?.[0];
  const g2 = rec.gates.gate2?.[0];
  const gp = p.gate;
  const ind = (t: number | null | undefined) => (su.gatesOn ? timerIndication(t ?? null, gp) : null);
  const dtOf = (e: [number, number | null] | undefined) => (e && e[1] !== null && su.gatesOn ? timerIndication(e[1] - e[0], gp, gaussF4(w)) : null);
  const dt1 = dtOf(g1);
  const dt2 = dtOf(g2);
  const value = Number.isFinite(aMean) ? Math.round(aMean * 1e4) / 1e4 : NaN;
  const r = addReading(w, {
    kind: 'run', instrumentId: 'logger01', value, unit: 'm/s²', resolution: p.accelResolution, uncertainty: p.uB.accel, sourceObjectIds: ['logger01', 'accel01', 'forceA', 'gate1', 'gate2', 'cart01'], qualityFlags: qf,
    trueValue: mean(win.map((x) => x[3])), target: 'cart01', trial: rec.id, configVersion: rec.configVersion,
    run: {
      a: value, T: Number.isFinite(TMean) ? Math.round(TMean * 1e4) / 1e4 : NaN, t0: a0, t1: a1, n: win.length, dt1: dt1 ?? NaN, dt2: dt2 ?? NaN, t1g: ind(g1?.[0]) ?? NaN, t2g: ind(g2?.[0]) ?? NaN,
      trueA: mean(win.map((x) => x[3])), trueT: mean(win.map((x) => x[4])),
    },
    setup: { ...su },
  });
  emitF4(w, 'RUN_READ', qf.length ? 'WARN' : 'INFO', { a: value, n: win.length });
  return { ok: true, id: r.id, value };
}

// ─────────────────────────── Pareja de carros ───────────────────────────

function pushPair(w: F04World, forceN: number, durationS: number): F04DispatchResult {
  const pr = w.pair;
  if (w.objects.cartP.support !== 'pairTrack' || w.objects.cartQ.support !== 'pairTrack') return { ok: false, code: 'CART_AWAY' };
  if (pr.push || Math.abs(pr.vP) > 0.02 || Math.abs(pr.vQ) > 0.02) return { ok: false, code: 'BUSY' };
  if (pr.xQ - pr.xP > PAIR_TOUCH_M + 0.005) return { ok: false, code: 'NOT_TOUCHING' };
  for (const e of ['E07', 'E08', 'E13', 'E21', 'E22', 'E23', 'E24', 'E26', 'E27']) rearmErrF4(w, e);
  pr.push = { forceN, durationS, t: 0 };
  pr.active = true;
  w.trial++;
  const sP = w.sensors.dynP;
  const sQ = w.sensors.dynQ;
  const rec: PairRecord = {
    id: w.trial, startS: w.timeS, samples: [], forceN, durationS, done: false, nextT: 0,
    setup: {
      rateHz: w.logger.rateHz, signA: sP.axisSign, signB: sQ.axisSign, zeroed: sP.zeroed && sQ.zeroed, calibrated: sP.calibrated && sQ.calibrated, angleA: sP.angleDeg, angleB: sQ.angleDeg,
      rangeA: sP.rangeIdx, rangeB: sQ.rangeIdx, connected: sP.connected && sQ.connected,
    },
    configVersion: w.configVersion,
  };
  w.pairRec = rec;
  emitF4(w, 'PAIR_PUSHED', 'INFO', { n: forceN });
  return { ok: true, value: w.trial };
}

function readPair(w: F04World): F04DispatchResult {
  const rec = w.pairRec;
  if (!rec) return { ok: false, code: 'NO_RUN' };
  if (!rec.samples.length) return { ok: false, code: 'NO_DATA' };
  const p = w.params;
  // El registrador toma el pico del contacto MIENTRAS empuja la mano (después, los carros chocan contra los topes).
  let k = 0;
  rec.samples.forEach((x, i) => {
    if (x[0] <= rec.durationS + 0.02 && Math.abs(x[3]) > Math.abs(rec.samples[k][3])) k = i;
  });
  const smp = rec.samples[k];
  const su = rec.setup;
  const flags: string[] = [];
  if (!su.connected) flags.push('UNPLUGGED');
  if (!su.zeroed) flags.push('NOT_ZEROED');
  if (!su.calibrated) flags.push('UNCALIBRATED');
  const maxAng = Math.max(su.angleA, su.angleB);
  if (maxAng >= 60) flags.push('PERPENDICULAR');
  else if (maxAng >= 3) flags.push('TILTED_SENSOR');
  if (rec.samples.slice(Math.max(0, k - 1), k + 2).some((x) => x[4] > 0)) flags.push('CLIPPED');
  if (su.rateHz < 50) flags.push('LOW_RATE');
  const FA = w.sensors.dynP.connected ? smp[1] : NaN;
  const FB = w.sensors.dynQ.connected ? smp[2] : NaN;
  if (Number.isFinite(FA) && Number.isFinite(FB) && Math.abs(FA) > 0.05 && Math.abs(FB) > 0.05 && Math.sign(FA) === Math.sign(FB)) flags.push('SAME_SIGN');
  if (smp[3] < 0.05) flags.push('NO_CONTACT');
  for (const f of flags) if (FLAG_ERR[f]) errF4(w, FLAG_ERR[f][0], FLAG_ERR[f][1], 'WARN', { inst: 'dynP' });
  const r = addReading(w, {
    kind: 'pair', instrumentId: 'dynP', value: FA, unit: 'N', resolution: p.force.resolutions[su.rangeA] ?? 0.01, uncertainty: p.uB.forceN, sourceObjectIds: ['dynP', 'dynQ', 'cartP', 'cartQ'], qualityFlags: flags,
    trueValue: smp[3], target: 'pair', trial: rec.id, configVersion: rec.configVersion, pair: { FA, FB, t: smp[0], trueC: smp[3] },
    setup: { rateHz: su.rateHz },
  });
  emitF4(w, 'PAIR_READ', flags.length ? 'WARN' : 'INFO', { a: FA, b: FB });
  return { ok: true, id: r.id, value: FA };
}

// ─────────────────────────── Cierre y bloqueos ───────────────────────────

function closeStation(w: F04World): F04DispatchResult {
  if (w.cart.on !== 'track' || !w.cart.latched) return { ok: false, code: 'CART_FREE' };
  if (w.string.hung) return { ok: false, code: 'HANGER_HUNG' };
  if (w.objects.hanger01.support !== 'rack') return { ok: false, code: 'HANGER_OUT' };
  if (SLOT_MASSES.some((m) => w.objects[m].support !== 'rack')) return { ok: false, code: 'MASSES_OUT' };
  if (w.balance.on) return { ok: false, code: 'PAN_BUSY' };
  if (w.pair.active && (Math.abs(w.pair.vP) > 0.01 || Math.abs(w.pair.vQ) > 0.01 || w.pair.push)) return { ok: false, code: 'PAIR_MOVING' };
  if (!w.brake.on) return { ok: false, code: 'BRAKE_OFF' };
  flagF4(w, 'stationClosed');
  emitF4(w, 'STATION_CLOSED', 'INFO');
  return { ok: true };
}

function acknowledge(w: F04World): F04DispatchResult {
  const b = w.safety.block;
  if (!b) return { ok: true };
  if (b.code === 'MASS_FALL' && w.objects.hanger01.support === 'floor') return { ok: false, code: 'SECURE_FIRST' };
  w.safety.block = null;
  emitF4(w, 'STATION_RESET', 'INFO', { code: b.code });
  return { ok: true };
}

// ─────────────────────────── Paso: carro, cordel y polea ───────────────────────────

const sgn = (x: number) => (x > 0 ? 1 : x < 0 ? -1 : 0);

/** Roces de Coulomb del lado del carro (N) y del lado de la polea (N, equivalentes en el cordel). */
function resistances(w: F04World): { cart: number; pulley: number } {
  const p = w.params;
  const st = w.string;
  const cart = p.rollingN + (w.sensors.forceA.connected && !w.logger.cableClipped ? p.cableDragN : 0);
  const pulley = (p.pulleyR > 0 ? p.bearingTorque / p.pulleyR : 0) + (st.path === 'axle' ? p.axleN : 0) + (!st.clamped ? p.looseClampN : 0);
  return { cart, pulley };
}

function inBrake(w: F04World, s: number) {
  const [b0, b1] = brakeZoneF4(w);
  return w.brake.on && s >= b0 && s <= b1;
}

/** Integra una variable con roce de Coulomb y viscoso; devuelve [v', Δx, trabajo disipado]. */
function integrate(v: number, drive: number, coulomb: number, b: number, m: number, h: number): [number, number, number] {
  let a: number;
  if (Math.abs(v) < 1e-6) {
    if (Math.abs(drive) <= coulomb) return [0, 0, 0];
    a = (drive - sgn(drive) * coulomb) / m;
  } else a = (drive - sgn(v) * coulomb - b * v) / m;
  let v1 = v + a * h;
  if (Math.abs(v) >= 1e-6 && sgn(v1) !== sgn(v) && Math.abs(drive) <= coulomb + b * Math.abs(v)) v1 = 0;
  const dx = ((v + v1) / 2) * h;
  // Teorema de la energía en el subpaso: lo que las fuerzas motrices (conservativas) entregaron y no quedó como cinética
  // lo disiparon el roce y el freno. Nunca es negativo (la prueba lo exige): ningún contacto crea energía.
  return [v1, dx, Math.max(0, drive * dx - 0.5 * m * (v1 * v1 - v * v))];
}

function stepCart(w: F04World, t0: number, h: number) {
  const c = w.cart;
  const st = w.string;
  const p = w.params;
  if (c.on !== 'track') return;
  const rec = w.run && !w.run.done ? w.run : null;
  const tRel = rec ? t0 + h - rec.releasedS : 0;
  const mc = cartMassKg(w);
  const mh = hangMassKg(w);
  const mp = pulleyMassKg(w);
  const sinT = sinTilt(w);
  const res = resistances(w);
  const b = inBrake(w, c.s) ? p.brakeB : 0;
  let aCart = 0;
  let T1 = 0;
  const s0 = c.s;
  if (c.latched) {
    c.v = 0;
    T1 = hookForceN(w);
  } else {
    const coupled = st.hung && st.attached && !st.held && !st.landed && st.slack <= 1e-9;
    let didCoupled = false;
    if (coupled) {
      const M = mc + mh + mp;
      const drive = mh * p.g + mc * p.g * sinT;
      const [v1, dx, diss] = integrate(c.v, drive, res.cart + res.pulley, b, M, h);
      const a = (v1 - c.v) / h;
      // Tensión del lado del carro: m_c a = T₁ + m_c g sen θ − roces del carro − b v.
      const vm = (c.v + v1) / 2;
      const cartFric = Math.abs(vm) > 1e-9 ? sgn(vm) * res.cart : 0;
      T1 = mc * a - mc * p.g * sinT + cartFric + b * vm;
      if (T1 >= -1e-9 || Math.abs(c.v) < 1e-6) {
        didCoupled = true;
        T1 = Math.max(0, T1);
        c.v = v1;
        c.s += dx;
        st.vh = v1;
        st.depth = tautDepth(c.s);
        aCart = a;
        w.energy.dissipatedJ += diss;
      }
    }
    if (!didCoupled) {
      const [v1, dx, diss] = integrate(c.v, mc * p.g * sinT, res.cart, b, mc, h);
      aCart = (v1 - c.v) / h;
      c.v = v1;
      c.s += dx;
      w.energy.dissipatedJ += diss;
      if (st.hung && !st.held && !st.landed) {
        const [vh1, dd, dissH] = integrate(st.vh, mh * p.g, res.pulley, 0, mh + mp, h);
        st.vh = vh1;
        st.depth += dd;
        w.energy.dissipatedJ += dissH;
      }
      if (st.hung && st.attached && !st.held) {
        const slack = tautDepth(c.s) - st.depth;
        if (slack < -1e-12) {
          // El cordel se tensa de golpe: impulso común (choque inelástico del cordel).
          const mH = st.landed ? 0 : mh + mp;
          const vc = (mc * c.v + mH * st.vh) / (mc + mh + mp);
          const kin0 = 0.5 * mc * c.v * c.v + 0.5 * mH * st.vh * st.vh;
          const kin1 = 0.5 * (mc + mh + mp) * vc * vc;
          w.energy.dissipatedJ += kin0 - kin1;
          c.v = vc;
          st.vh = vc;
          if (st.landed) {
            st.landed = false;
            w.objects.hanger01.support = 'string';
          }
          // La pequeña corrección de posición lleva el portapesas al largo del cordel: su energía potencial cuenta.
          const dz = tautDepth(c.s) - st.depth;
          st.depth = tautDepth(c.s);
          w.energy.dissipatedJ += mh * p.g * dz;
          st.slack = 0;
          if (rec && tRel > 0.02 && Math.abs(kin0 - kin1) > 1e-5 && rec.slackT === null) rec.slackT = Math.round(tRel * 1e4) / 1e4;
        } else {
          if (slack > 1e-6 && rec && rec.slackT === null && !st.landed && tRel > 0.02 && hangingF4(w)) rec.slackT = Math.round(tRel * 1e4) / 1e4;
          st.slack = Math.max(0, slack);
        }
      }
    }
    // Tope final y parachoques de la partida.
    const sMax = sMaxF4(w);
    if (c.s > sMax && c.v > 0) {
      const v0 = c.v;
      c.s = sMax;
      c.v = -p.stopRestitution * v0;
      w.energy.dissipatedJ += 0.5 * mc * (v0 * v0 - c.v * c.v);
      if (rec && rec.impactT === null) {
        rec.impactT = Math.round(tRel * 1e4) / 1e4;
        rec.impactV = Math.round(v0 * 1000) / 1000;
      }
      if (v0 >= p.impactMs) errF4(w, 'E10', 'CART_HIT_STOP', 'WARN', { ms: Math.round(v0 * 100) / 100 });
      if (v0 >= p.shockMs && !c.shock) {
        c.shock = true;
        emitF4(w, 'ACCEL_SHOCK', 'WARN');
      }
      if (st.hung && !st.landed && !st.held) {
        st.slack = Math.max(0, tautDepth(c.s) - st.depth);
      }
    }
    if (c.s < CART_START_S && c.v < 0) {
      const v0 = c.v;
      c.s = CART_START_S;
      c.v = -p.stopRestitution * v0;
      w.energy.dissipatedJ += 0.5 * mc * (v0 * v0 - c.v * c.v);
    }
    if (rec && b > 0 && rec.brakeT === null) rec.brakeT = Math.round(tRel * 1e4) / 1e4;
  }
  // Aterrizaje del portapesas.
  if (st.hung && !st.held && !st.landed && st.depth >= FLOOR_DEPTH) {
    // Pierde su cinética al tocar el suelo; el pequeño exceso del subpaso (por debajo del suelo) se devuelve a la potencial.
    w.energy.dissipatedJ += 0.5 * (mh + mp) * st.vh * st.vh - mh * p.g * (st.depth - FLOOR_DEPTH);
    st.depth = FLOOR_DEPTH;
    st.vh = 0;
    st.landed = true;
    w.objects.hanger01.support = 'floor';
    if (rec && rec.landedT === null) rec.landedT = Math.round(tRel * 1e4) / 1e4;
    emitF4(w, 'HANGER_LANDED', 'INFO');
  }
  if (st.hung && !st.held && st.attached) st.slack = Math.max(0, tautDepth(c.s) - st.depth);
  st.pulleyAngle = (st.pulleyAngle + (st.hung && !st.landed ? st.vh : 0) * h / (p.pulleyR || 0.025)) % (2 * Math.PI);
  w.evidence.__T1 = T1;
  // Compuertas sobre la bandera (centro del carro).
  if (rec) {
    for (const [id, g] of Object.entries(w.gates)) {
      updateGate(g, s0, c.s, t0, h, GEOF04.cart.flagW / 100, p.gate, rec.releasedS);
      rec.gates[id] = g.events.map((e) => [e[0], e[1]] as [number, number | null]);
    }
    // Registrador: muestreo por reloj físico.
    const fa = w.sensors.forceA;
    const ac = w.sensors.accel01;
    while (rec.nextT <= tRel + 1e-9) {
      const aProper = aCart - p.g * sinT;
      const nA = gaussF4(w) * p.accelNoise * p.noiseFactor;
      const ai = accelIndication(aProper, c.shock ? p.shockOffset : 0, p.accelRange, p.accelResolution, nA);
      const fi = forceIndication(T1, fa, p.force, gaussF4(w) * p.noiseFactor);
      const clipped = (ac.connected && ai.clipped) || (fa.connected && fi.clipped) ? 1 : 0;
      // Saturación en el tramo que se analiza (antes del aterrizaje, del freno o del tope): el rango no alcanza (E22).
      const clean = rec.landedT === null && rec.brakeT === null && rec.impactT === null;
      if (clipped && rec.clippedT === null && clean) {
        rec.clippedT = rec.nextT;
        errF4(w, 'E22', 'SENSOR_SATURATED', 'WARN', { inst: ai.clipped ? 'accel01' : 'forceA' });
      }
      rec.samples.push([Math.round(rec.nextT * 1e4) / 1e4, ai.value, fi.value, Math.round(aCart * 1e5) / 1e5, Math.round(T1 * 1e5) / 1e5, clipped]);
      rec.nextT = Math.round((rec.nextT + 1 / w.logger.rateHz) * 1e6) / 1e6;
    }
    rec.stillS = Math.abs(c.v) < 1e-4 && (!st.hung || st.landed || Math.abs(st.vh) < 1e-4) ? rec.stillS + h : 0;
    if (tRel >= 4 || (rec.stillS >= 0.3 && tRel > 0.5)) {
      rec.done = true;
      emitF4(w, 'RUN_DONE', 'INFO', { trial: rec.id, n: rec.samples.length });
    }
  }
}

// ─────────────────────────── Paso: pareja con micro-pasos ───────────────────────────

function stepPair(w: F04World, h: number) {
  const pr = w.pair;
  if (!pr.active) return;
  const p = w.params;
  // Micro-pasos de 1 ms: el parachoques (k = 2000 N/m) oscila con ω ≈ 100 rad/s y ω·Δt queda en 0,1.
  const n = Math.max(1, Math.round(h / 0.001));
  const dt = h / n;
  const mP = p.pairPKg;
  const mQ = p.pairQKg;
  const rec = w.pairRec && !w.pairRec.done ? w.pairRec : null;
  for (let i = 0; i < n; i++) {
    let Fh = 0;
    if (pr.push) {
      const t = pr.push.t;
      Fh = t < pr.push.durationS ? pr.push.forceN * Math.sin((Math.PI * t) / pr.push.durationS) : 0;
      pr.push.t = Math.round((t + dt) * 1e7) / 1e7;
      if (pr.push.t >= pr.push.durationS) pr.push = null;
    }
    const E0 = pairEnergyJ(w);
    const d = PAIR_TOUCH_M - (pr.xQ - pr.xP);
    let C = 0;
    if (d > 0) C = Math.max(0, p.pairK * d + p.pairDamping * (pr.vP - pr.vQ));
    pr.contactN = C;
    const [vP1, dxP] = integrate(pr.vP, Fh - C, p.pairRollingN, 0, mP, dt);
    const [vQ1, dxQ] = integrate(pr.vQ, C, p.pairRollingN, 0, mQ, dt);
    const wHand = Fh * dxP;
    w.energy.externalJ += wHand;
    w.momentum.handImpulse += Fh * dt;
    pr.vP = vP1;
    pr.vQ = vQ1;
    pr.xP += dxP;
    pr.xQ += dxQ;
    // Topes de la pista corta (restitución 0,3).
    if (pr.xP < PAIR_HALF && pr.vP < 0) {
      pr.xP = PAIR_HALF;
      pr.vP = -0.3 * pr.vP;
    }
    if (pr.xQ > PAIR_LEN - PAIR_HALF && pr.vQ > 0) {
      pr.xQ = PAIR_LEN - PAIR_HALF;
      pr.vQ = -0.3 * pr.vQ;
    }
    // Lo que la mano entregó y no quedó en la pareja (cinética + elástica) lo disiparon roce, amortiguador y topes.
    w.energy.dissipatedJ += wHand - (pairEnergyJ(w) - E0);
  }
  if (rec) {
    const tRel = w.timeS - rec.startS;
    const sP = w.sensors.dynP;
    const sQ = w.sensors.dynQ;
    while (rec.nextT <= tRel + 1e-9) {
      const C = pr.contactN;
      const a = forceIndication(-C, sP, p.force, gaussF4(w) * p.noiseFactor);
      const b2 = forceIndication(-C, sQ, p.force, gaussF4(w) * p.noiseFactor);
      const clipped = (sP.connected && a.clipped) || (sQ.connected && b2.clipped) ? 1 : 0;
      if (clipped && rec.nextT <= rec.durationS) errF4(w, 'E22', 'SENSOR_SATURATED', 'WARN', { inst: 'dynP' });
      rec.samples.push([Math.round(rec.nextT * 1e4) / 1e4, a.value, b2.value, Math.round(C * 1e4) / 1e4, clipped]);
      rec.nextT = Math.round((rec.nextT + 1 / w.logger.rateHz) * 1e6) / 1e6;
    }
    if (tRel >= rec.durationS + 0.3) rec.done = true;
  }
  if (!pr.push && pr.contactN === 0 && Math.abs(pr.vP) < 1e-4 && Math.abs(pr.vQ) < 1e-4) {
    pr.vP = 0;
    pr.vQ = 0;
    pr.active = false;
  }
}

// ─────────────────────────── Paso de simulación ───────────────────────────

export function stepF04World(w: F04World): void {
  const dt = w.params.dtS;
  const n = Math.max(1, w.params.subSteps);
  const h = dt / n;
  const tStart = w.timeS;
  w.timeS = Math.round((w.timeS + dt) * 1e6) / 1e6;
  w.tick++;
  for (let i = 0; i < n; i++) {
    stepCart(w, tStart + i * h, h);
  }
  stepPair(w, dt);
}

export function runF04For(w: F04World, seconds: number) {
  const n = Math.round(seconds / w.params.dtS);
  for (let i = 0; i < n; i++) stepF04World(w);
}

export function f04Summary(w: F04World) {
  return {
    s: Math.round(w.cart.s * 1e6) / 1e6,
    v: Math.round(w.cart.v * 1e6) / 1e6,
    depth: Math.round(w.string.depth * 1e6) / 1e6,
    pair: Math.round((w.pair.xQ - w.pair.xP) * 1e6) / 1e6,
    trial: w.trial,
    readings: w.readingOrder.length,
    cfg: w.configVersion,
  };
}
