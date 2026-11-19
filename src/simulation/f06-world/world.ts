/**
 * Mundo de F06 — trabajo, resortes y conservación de la energía: paso fijo determinista de 0,05 s con 10 subpasos de
 * 5 ms (§6). La escena solo dibuja este estado y envía hechos geométricos.
 *
 * - Resorte con límites mecánicos: F = k x hasta x_lin y más rígido después (F = k x + k_NL k (x − x_lin)²); pasarse lo
 *   daña (rigidez menor e histéresis, F06-E01/E18). El mismo resorte se calibra colgado en el soporte (masa colgada con
 *   amortiguamiento del aire) y se monta en el lanzador del riel.
 * - Carro sobre el perfil z(s) del riel (coordenada horizontal s): M_ef s̈ = F_resorte − m g z' − m z' z'' ṡ² + F_t √(1+z'²),
 *   con M_ef = m (1 + z'²) (+ el émbolo mientras empuja). F_t reúne la rodadura, el patín del tramo de pérdidas, el
 *   amortiguador magnético y el freno del extremo alto. El émbolo se detiene al separarse (su energía se disipa).
 * - Péndulo simple: θ̈ = −(g/L) sen θ − γ θ̇, con un movimiento lateral independiente si la mano empujó al soltar (E17).
 * - El integrador semi-implícito se corrige con una proyección de energía: en cada subpaso la energía mecánica cae
 *   exactamente lo que disipan las fuerzas no conservativas (así el balance no acumula error numérico).
 * - Instrumentos: balanza de 1 g, regla de 1 mm, medidor de altura, sensor de fuerza en la placa del lanzador
 *   (`instruments/force-sensor`), sensor de posición ultrasónico, fotopuertas (`instruments/photogate`) y captador
 *   angular del péndulo.
 */
import type { Channel, F06Command, F06DispatchResult, HeightRef, PpeItem, SpringPlace, TrackGate } from './commands';
import type { F06Object, F06Params, F06World, PendRecord, Pose, ReadingF6, RunRecord, RunSetup } from './types';
import { hashRandom } from '../core/rng';
import { bumpF6, emitF6, errF6, flagF6, gaussF6, rearmErrF6 } from './events';
import { CART_MAX_S, CART_START_S, GEOF06, maxAmplitudeDeg, onBottomFlat, onTopFlat, trackCurv, trackSlope, trackZ } from './geometry';
import {
  cartEnergyJ, cartKgF6, cartLoadKg, conservedTotalsF06, hangingKg, launcherCompression, mechanicalEnergyJ, pendEnergyJ, slotsOnHanger, springAt, springEnergy, springForce, springKOf, standEnergyJ,
} from './conservation';
import { newGate, timerIndication, updateGate } from '../instruments/photogate';
import { forceIndication, quantizeReading } from '../instruments/force-sensor';

export { emitF6, latchF6, rearmF6, bumpF6, flagF6, errF6 } from './events';
export { conservedTotalsF06, cartKgF6, springAt };

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, num(v, a)));
const DEG = Math.PI / 180;
const HM = GEOF06.cart.halfM;
const TR = GEOF06.track;
const LA = GEOF06.launcher;
const sgn = (x: number) => (x > 0 ? 1 : x < 0 ? -1 : 0);
const r4 = (x: number) => Math.round(x * 1e4) / 1e4;

/** Escenarios docentes (§10). */
export const SF6 = {
  IDEAL: 'F06-S01_ideal_system',
  STIFF: 'F06-S02_stiff_spring',
  SOFT: 'F06-S03_soft_spring',
  TRACK_FRICTION: 'F06-S04_track_friction',
  WEAK_DAMPER: 'F06-S05_weak_damper',
  STRONG_DAMPER: 'F06-S06_strong_damper',
  RAISED: 'F06-S07_raised_track',
  LOW_AMP: 'F06-S08_low_amplitude',
  HIGH_AMP: 'F06-S09_high_amplitude',
  NO_ZERO: 'F06-S10_sensor_no_zero',
  LIMIT: 'F06-S11_limit_deformation',
  DECOUPLED: 'F06-S12_decoupled_time',
} as const;

export interface F06WorldSpec {
  objects: F06Object[];
  scenarios: string[];
  mode: string;
}

export const SLOTS = ['m100a', 'm100b', 'm100c', 'm100d'] as const;
export const CART_MASSES = ['cw1', 'cw2'] as const;
export const SPRINGS = ['spring01', 'spring02'] as const;

// ─────────────────────────── Creación ───────────────────────────

export function createF06World(spec: F06WorldSpec, seed: number, params: F06Params): F06World {
  const has = (s: string) => spec.scenarios.includes(s);
  const objects: Record<string, F06Object> = {};
  for (const o of spec.objects) objects[o.id] = { ...o, pose: { ...o.pose } };
  const h = (k: string) => hashRandom(seed, k) - 0.5;
  const sign = (k: string) => (h(k) > 0 ? 1 : -1);
  const offs = has(SF6.NO_ZERO) ? 0.8 * sign('offS') : Math.round(sign('fS') * params.force.offsetN * (0.4 + (h('f') + 0.5) * 0.6) * 1000) / 1000;
  const w: F06World = {
    timeS: 0, tick: 0, seed, rng: seed >>> 0 || 1, params, mode: spec.mode, objects,
    springs: { spring01: { at: 'stand', kFactor: 1, damaged: false }, spring02: { at: 'rack', kFactor: params.spareFactor, damaged: false } },
    stand: { hangerOn: false, x: 0, v: 0, rulerOffsetCm: Math.round(sign('rulS') * (0.4 + (h('rul') + 0.5) * 0.5) * 10) / 10, zeroLoaded: false, loadedS: -10 },
    cart: { on: 'track', s: CART_START_S, v: 0, latched: false, compression: 0, damaged: false, held: false },
    track: { h: params.h0, clamped: false, version: 0, touchedS: -10, brakeOn: false, frictionN: params.frictionN0, damperC: params.damperC0, springSecured: false },
    sensor: { connected: false, offset: offs, zeroed: false, scale: params.force.uncalScale, calibrated: false, rangeIdx: 0, angleDeg: 0 },
    logger: { rateHz: params.rates[0], posConnected: false, gatesConnected: false, angleConnected: false, synced: false },
    gates: { gate1: newGate(GEOF06.gate.s1), gate2: newGate(GEOF06.gate.s2), gate3: newGate(0) },
    pend: { L: params.pendL0, thetaDeg: 0, omega: 0, y: 0, vy: 0, held: false, touchedS: -10 },
    balance: { on: null, placedS: -10, offsetG: Math.round(sign('balS') * (2 + (h('bal') + 0.5) * 2)), tared: false },
    run: null, runs: [], swing: null, swings: [],
    energy: { dissipatedJ: 0, externalJ: 0 },
    trial: 0,
    configVersion: 1,
    readings: {}, readingOrder: [],
    safety: { ppe: { coat: false, goggles: false, shoes: false, hair: false }, block: null, stoppedByTeacher: false },
    events: [], evidence: {}, scenarios: [...spec.scenarios], ppe: false,
    initialTotals: { massesG: 0 },
  };
  w.initialTotals = { massesG: conservedTotalsF06(w).massesG };
  w.energy.externalJ = mechanicalEnergyJ(w);
  return w;
}

// ─────────────────────────── Consultas ───────────────────────────

export const runningRunF6 = (w: F06World) => !!w.run && !w.run.done;
export const runningSwingF6 = (w: F06World) => !!w.swing && !w.swing.done;
export const busyF6 = (w: F06World) => runningRunF6(w);
export const cartMovingF6 = (w: F06World) => w.cart.on === 'track' && Math.abs(w.cart.v) > 1e-4;
export const bobMovingF6 = (w: F06World) => !w.pend.held && (Math.abs(w.pend.omega) > 1e-4 || Math.abs(w.pend.thetaDeg) > 0.01 || Math.abs(w.pend.vy) > 1e-4);
/** Posición de equilibrio de la carga colgada (m). */
/** Oscilación que queda en el soporte (cm): amplitud estimada con la posición y la velocidad respecto del equilibrio. */
export function standAmplitudeCm(w: F06World): number {
  const sp = springAt(w, 'stand');
  if (!sp) return 0;
  const st = w.stand;
  const m = hangingKg(w);
  const om = m > 0 ? Math.sqrt(springKOf(w, sp) / m) : 1;
  return Math.hypot(st.x - standEquilibrium(w), st.v / om) * 100;
}

export function standEquilibrium(w: F06World): number {
  const id = springAt(w, 'stand');
  if (!id || !w.stand.hangerOn) return 0;
  const F = hangingKg(w) * w.params.g;
  let x = F / springKOf(w, id);
  for (let i = 0; i < 20; i++) x -= (springForce(w, id, x) - F) / Math.max(1e-6, springKOf(w, id));
  return x;
}

// ─────────────────────────── Despacho ───────────────────────────

const BEFORE_PPE = new Set<F06Command['type']>(['equipPpe', 'startWork', 'teacherStop', 'acknowledge', 'inspect']);
const DURING_BLOCK = new Set<F06Command['type']>(['acknowledge', 'teacherStop', 'inspect', 'setPose', 'returnCart', 'setBrake', 'mountSpring', 'stopBob']);
/** Comandos que cambian la condición física del ensayo (nuevo montaje; E32 si hay un ensayo en marcha). */
const CONFIG = new Set<F06Command['type']>([
  'mountSpring', 'secureSpring', 'setHeight', 'clampTrack', 'moveGate', 'connect', 'zeroSensor', 'calibrateSensor', 'setRange', 'mountSensor', 'setRate', 'syncChannels', 'setFriction',
  'setDamper', 'setBrake', 'setLength',
]);

export function dispatchF06(w: F06World, cmd: F06Command): F06DispatchResult {
  if (!cmd || typeof cmd !== 'object') return { ok: false, code: 'UNKNOWN' };
  if (w.safety.stoppedByTeacher && cmd.type !== 'teacherStop') return { ok: false, code: 'TEACHER_STOP' };
  if (!w.ppe && !BEFORE_PPE.has(cmd.type)) return { ok: false, code: 'PPE' };
  if (w.safety.block && !DURING_BLOCK.has(cmd.type)) return { ok: false, code: 'BLOCKED' };
  // Trabajo externo: lo que el gesto cambia en (energía mecánica + disipada): comprimir, empujar, cargar, levantar.
  const S0 = mechanicalEnergyJ(w) + w.energy.dissipatedJ;
  const before = w.configVersion;
  const runMoving = runningRunF6(w) && cartMovingF6(w);
  const swingMoving = runningSwingF6(w) && bobMovingF6(w);
  const res = route(w, cmd);
  w.energy.externalJ += mechanicalEnergyJ(w) + w.energy.dissipatedJ - S0;
  if (res.ok && CONFIG.has(cmd.type)) {
    if (w.configVersion === before) w.configVersion++;
    const r = cmd.type === 'setLength' ? (swingMoving ? w.swing : null) : runMoving ? w.run : null;
    if (r && r.configChangedT === null) {
      r.configChangedT = r4(w.timeS - r.startS);
      errF6(w, 'E32', 'CONFIG_DURING_RUN', 'WARN', { cmd: cmd.type });
    }
  }
  return res;
}

function route(w: F06World, cmd: F06Command): F06DispatchResult {
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
    // Balanza
    case 'tareBalance':
      if (w.balance.on) return { ok: false, code: 'PAN_NOT_EMPTY' };
      w.balance.offsetG = 0;
      w.balance.tared = true;
      rearmErrF6(w, 'E21');
      flagF6(w, 'balanceTared');
      emitF6(w, 'BALANCE_TARED', 'INFO');
      return { ok: true };
    case 'placeOnBalance':
      return placeOnBalance(w, String(cmd.id));
    case 'removeFromBalance':
      return removeFromBalance(w);
    case 'readBalance':
      return readBalance(w);
    // Resorte y soporte
    case 'mountSpring':
      return mountSpring(w, String(cmd.id), cmd.at);
    case 'secureSpring': {
      if (!springAt(w, 'launcher')) return { ok: false, code: 'NO_SPRING' };
      if (busyF6(w)) return { ok: false, code: 'BUSY' };
      w.track.springSecured = !!cmd.on;
      if (cmd.on) rearmErrF6(w, 'E02');
      emitF6(w, cmd.on ? 'SPRING_SECURED' : 'SPRING_UNSECURED', cmd.on ? 'INFO' : 'WARN');
      return { ok: true };
    }
    case 'hangHanger':
      return hangHanger(w, !!cmd.on);
    case 'hangMass':
      return hangMass(w, String(cmd.id), !!cmd.on);
    case 'alignRuler': {
      if (!springAt(w, 'stand')) return { ok: false, code: 'NO_SPRING' };
      const st = w.stand;
      st.rulerOffsetCm = -Math.round(st.x * 1000) / 10;
      st.zeroLoaded = st.hangerOn;
      if (!st.zeroLoaded) rearmErrF6(w, 'E03');
      flagF6(w, 'rulerAligned');
      emitF6(w, 'RULER_ALIGNED', st.zeroLoaded ? 'WARN' : 'INFO');
      return { ok: true };
    }
    case 'readRuler':
      return readRuler(w, num(cmd.viewDeg));
    // Carro, lanzador y riel
    case 'loadCart':
      return loadCart(w, String(cmd.id), !!cmd.on);
    case 'compress':
      return compress(w, num(cmd.x, 0));
    case 'releaseCart':
      return releaseCart(w, Math.max(0, num(cmd.pushMs)));
    case 'returnCart':
      return returnCart(w);
    case 'setBrake': {
      const t = w.track;
      t.brakeOn = !!cmd.on;
      if (!t.brakeOn && w.cart.held) w.cart.held = false;
      if (t.brakeOn) rearmErrF6(w, 'E13');
      emitF6(w, cmd.on ? 'BRAKE_ON' : 'BRAKE_OFF', cmd.on ? 'INFO' : 'WARN');
      return { ok: true };
    }
    case 'repairCart':
      if (busyF6(w)) return { ok: false, code: 'BUSY' };
      if (!w.cart.damaged) return { ok: true };
      w.cart.damaged = false;
      rearmErrF6(w, 'E39');
      emitF6(w, 'CART_REPAIRED', 'INFO');
      return { ok: true };
    case 'setHeight':
      return setHeight(w, num(cmd.m, w.track.h));
    case 'clampTrack':
      w.track.clamped = !!cmd.on;
      if (cmd.on) rearmErrF6(w, 'E28');
      emitF6(w, cmd.on ? 'TRACK_CLAMPED' : 'TRACK_LOOSE', 'INFO');
      return { ok: true };
    case 'readHeight':
      return readHeight(w, cmd.ref === 'bench' ? 'bench' : 'launcher', num(cmd.viewDeg));
    case 'moveGate': {
      const id = cmd.id as TrackGate;
      if (id !== 'gate1' && id !== 'gate2') return { ok: false, code: 'NO_OBJECT' };
      if (busyF6(w)) return { ok: false, code: 'BUSY' };
      w.gates[id].s = Math.round(clamp(cmd.s, GEOF06.gate.min, GEOF06.gate.max) * 1e4) / 1e4;
      return { ok: true, value: w.gates[id].s };
    }
    // Sensores
    case 'connect':
      return connect(w, cmd.channel, !!cmd.on);
    case 'zeroSensor':
      return zeroSensor(w);
    case 'calibrateSensor':
      return calibrateSensor(w);
    case 'setRange': {
      const s = w.sensor;
      s.rangeIdx = Math.round(clamp(cmd.n, 0, w.params.force.ranges.length - 1));
      if (s.rangeIdx > 0) rearmErrF6(w, 'E22');
      return { ok: true, value: w.params.force.ranges[s.rangeIdx] };
    }
    case 'mountSensor': {
      const s = w.sensor;
      s.angleDeg = Math.round(clamp(cmd.angleDeg, 0, 90) * 10) / 10;
      if (s.angleDeg < 3) rearmErrF6(w, 'E26');
      return { ok: true, value: s.angleDeg };
    }
    case 'setRate': {
      const hz = Math.round(num(cmd.hz));
      if (!w.params.rates.includes(hz)) return { ok: false, code: 'BAD_RATE' };
      w.logger.rateHz = hz;
      if (hz >= 1000) rearmErrF6(w, 'E24');
      return { ok: true, value: hz };
    }
    case 'syncChannels':
      w.logger.synced = !!cmd.on;
      if (cmd.on) {
        rearmErrF6(w, 'E15');
        flagF6(w, 'synced');
      }
      emitF6(w, cmd.on ? 'CHANNELS_SYNCED' : 'CHANNELS_UNSYNCED', cmd.on ? 'INFO' : 'WARN');
      return { ok: true };
    case 'readLaunch':
      return readLaunch(w);
    case 'readGates':
      return readGates(w);
    // Pérdidas
    case 'setFriction':
      w.track.frictionN = Math.round(clamp(cmd.n, 0, 0.4) * 1000) / 1000;
      return { ok: true, value: w.track.frictionN };
    case 'setDamper':
      w.track.damperC = Math.round(clamp(cmd.c, 0, 1) * 1000) / 1000;
      return { ok: true, value: w.track.damperC };
    // Péndulo
    case 'setLength': {
      const p = w.pend;
      if (p.held) return { ok: false, code: 'HELD' };
      if (bobMovingF6(w) && !runningSwingF6(w)) return { ok: false, code: 'BUSY' };
      p.L = Math.round(clamp(cmd.m, GEOF06.pend.minL, GEOF06.pend.maxL) * 1000) / 1000;
      p.touchedS = w.timeS;
      return { ok: true, value: p.L };
    }
    case 'holdBob':
      return holdBob(w, num(cmd.deg));
    case 'releaseBob':
      return releaseBob(w, Math.max(0, num(cmd.lateralMs)));
    case 'stopBob': {
      const p = w.pend;
      p.held = false;
      p.thetaDeg = 0;
      p.omega = 0;
      p.y = 0;
      p.vy = 0;
      if (w.swing && !w.swing.done) w.swing.done = true;
      return { ok: true };
    }
    case 'readPendulum':
      return readPendulum(w);
    case 'readPendScale':
      return readPendScale(w, num(cmd.viewDeg));
    // Cierre y seguridad
    case 'closeStation':
      return closeStation(w);
    case 'acknowledge':
      return acknowledge(w);
    case 'teacherStop':
      w.safety.stoppedByTeacher = !!cmd.on;
      emitF6(w, cmd.on ? 'TEACHER_STOP' : 'TEACHER_RESUME', cmd.on ? 'CRITICAL' : 'INFO');
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

function startWork(w: F06World): F06DispatchResult {
  const missing = (Object.keys(PPE_ERR) as PpeItem[]).filter((k) => !w.safety.ppe[k]);
  if (missing.length) {
    for (const k of missing) {
      bumpF6(w, `err:${PPE_ERR[k][0]}`);
      emitF6(w, PPE_ERR[k][1], 'CRITICAL');
    }
    return { ok: false, code: 'PPE_MISSING' };
  }
  w.ppe = true;
  flagF6(w, 'ppe');
  emitF6(w, 'PPE_OK', 'INFO');
  return { ok: true };
}

function inspect(w: F06World, target: string): F06DispatchResult {
  const o = w.objects[target];
  if (!o) return { ok: false, code: 'NO_OBJECT' };
  flagF6(w, `inspected:${target}`);
  const p = w.params;
  switch (o.kind) {
    case 'stand':
      emitF6(w, 'INSPECT_STAND', 'INFO', { cm: GEOF06.stand.rodH });
      break;
    case 'ruler':
      emitF6(w, 'INSPECT_RULER', Math.abs(w.stand.rulerOffsetCm) > 0.05 && !w.evidence.rulerAligned ? 'WARN' : 'INFO', { res: p.rulerResCm * 10 });
      break;
    case 'spring': {
      const s = w.springs[target];
      emitF6(w, 'INSPECT_SPRING', s?.damaged ? 'WARN' : 'INFO', { cm: GEOF06.spring.natCm, lim: Math.round(p.xLin * 100), damaged: s?.damaged ? 1 : 0 });
      break;
    }
    case 'hanger':
      emitF6(w, 'INSPECT_HANGER', 'INFO', { g: Math.round(p.hangerKg * 1000) });
      break;
    case 'slotMass':
      emitF6(w, 'INSPECT_SLOT', 'INFO', { g: Math.round((p.slotKg[target] ?? 0) * 1000) });
      break;
    case 'cartMass':
      emitF6(w, 'INSPECT_CARTMASS', 'INFO', { g: Math.round((p.cartMassKg[target] ?? 0) * 1000) });
      break;
    case 'track':
      emitF6(w, 'INSPECT_TRACK', w.track.clamped ? 'INFO' : 'WARN', { cm: TR.len * 100, max: TR.maxH * 100 });
      break;
    case 'launcher':
      emitF6(w, 'INSPECT_LAUNCHER', springAt(w, 'launcher') && !w.track.springSecured ? 'WARN' : 'INFO', { max: LA.maxComp * 100 });
      break;
    case 'cart':
      emitF6(w, 'INSPECT_CART', w.cart.damaged ? 'WARN' : 'INFO', { g: Math.round(p.cartKg * 1000), flag: GEOF06.cart.flagW });
      break;
    case 'brake':
      emitF6(w, 'INSPECT_BRAKE', w.track.brakeOn ? 'INFO' : 'WARN');
      break;
    case 'gauge':
      emitF6(w, 'INSPECT_GAUGE', 'INFO', { res: p.gaugeResCm * 10 });
      break;
    case 'gate':
      emitF6(w, 'INSPECT_GATE', 'INFO', { res: p.gate.resolutionS });
      break;
    case 'pad':
      emitF6(w, 'INSPECT_PAD', 'INFO', { n: w.track.frictionN });
      break;
    case 'damper':
      emitF6(w, 'INSPECT_DAMPER', 'INFO', { c: w.track.damperC });
      break;
    case 'forceSensor':
      emitF6(w, 'INSPECT_FORCE', w.sensor.calibrated ? 'INFO' : 'WARN', { range: p.force.ranges[w.sensor.rangeIdx], res: p.force.resolutions[w.sensor.rangeIdx] });
      break;
    case 'posSensor':
      emitF6(w, 'INSPECT_POS', 'INFO', { res: p.posResM * 1000 });
      break;
    case 'logger':
      emitF6(w, 'INSPECT_LOGGER', w.logger.synced ? 'INFO' : 'WARN', { hz: w.logger.rateHz });
      break;
    case 'pendulum':
      emitF6(w, 'INSPECT_PENDULUM', 'INFO', { g: Math.round(p.bobKg * 1000), d: p.bobD * 100 });
      break;
    case 'angleSensor':
      emitF6(w, 'INSPECT_ANGLE', 'INFO', { res: p.angleResDeg });
      break;
    case 'balance':
      emitF6(w, 'INSPECT_BALANCE', w.balance.tared ? 'INFO' : 'WARN', { res: p.balanceResolutionG });
      break;
    default:
      emitF6(w, 'INSPECTED', 'INFO', { target });
  }
  return { ok: true };
}

const SUPPORTS = new Set(['bench', 'rack', 'hand']);

function setPose(w: F06World, id: string, pose: Pose, support?: string): F06DispatchResult {
  const o = w.objects[id];
  if (!o) return { ok: false, code: 'NO_OBJECT' };
  if (!o.movable) return { ok: false, code: 'FIXED' };
  if (!pose || ![pose.x, pose.y, pose.z].every((v) => Number.isFinite(v))) return { ok: false, code: 'BAD_POSE' };
  if (support && support !== o.support && !SUPPORTS.has(support)) return { ok: false, code: 'NO_SEAT' };
  if (['hanger', 'cart', 'balance', 'stand', 'launcher'].includes(o.support)) return { ok: false, code: 'NO_SEAT' };
  o.pose = { x: pose.x, y: pose.y, z: pose.z, rotationRad: num(pose.rotationRad) };
  if (support) o.support = support;
  return { ok: true };
}

// ─────────────────────────── Lecturas ───────────────────────────

const PREFIX: Record<ReadingF6['kind'], string> = { mass: 'm', length: 'L', height: 'h', launch: 'w', gates: 'v', pendulum: 'p' };

function addReading(w: F06World, r: Omit<ReadingF6, 'id' | 't' | 'tick' | 'trialId' | 'configVersion'> & { configVersion?: number; trial?: number }): ReadingF6 {
  const n = w.readingOrder.length + 1;
  const { trial, ...rest } = r;
  const reading: ReadingF6 = { ...rest, configVersion: r.configVersion ?? w.configVersion, id: `${PREFIX[r.kind]}${n}`, trialId: `T${trial ?? w.trial}`, t: w.timeS, tick: w.tick };
  if (!Number.isFinite(reading.value)) reading.valid = false;
  if (!Number.isFinite(reading.trueValue)) reading.trueValue = 0;
  w.readings[reading.id] = reading;
  w.readingOrder.push(reading.id);
  return reading;
}

const quant = quantizeReading;
/** Número finito o null (la cinta se guarda en JSON y NaN no sobrevive). */
const fin = (x: number | null | undefined): number | null => (x !== null && x !== undefined && Number.isFinite(x) ? x : null);

/** Masa (g) del objeto sobre la balanza con lo que lleva encima. */
export function loadOnBalanceG(w: F06World, id: string): number {
  const p = w.params;
  if (id === 'cart01') return cartKgF6(w) * 1000;
  if (id === 'hanger01') return p.hangerKg * 1000;
  return ((p.slotKg[id] ?? 0) + (p.cartMassKg[id] ?? 0)) * 1000;
}

const WEIGHABLE = new Set(['cart01', 'hanger01', ...SLOTS, ...CART_MASSES]);

function placeOnBalance(w: F06World, id: string): F06DispatchResult {
  if (!WEIGHABLE.has(id) || !w.objects[id]) return { ok: false, code: 'NO_OBJECT' };
  if (w.balance.on) return { ok: false, code: 'PAN_BUSY' };
  const o = w.objects[id];
  if (id === 'cart01') {
    const c = w.cart;
    if (busyF6(w) || cartMovingF6(w) || c.latched || c.held) return { ok: false, code: 'BUSY' };
    c.on = 'balance';
  } else if (o.support !== 'rack') return { ok: false, code: 'NOT_ON_RACK' };
  o.support = 'balance';
  w.balance.on = id;
  w.balance.placedS = w.timeS;
  emitF6(w, 'ON_BALANCE', 'INFO', { id });
  return { ok: true };
}

function putCartAtStart(w: F06World) {
  const c = w.cart;
  c.on = 'track';
  c.s = CART_START_S;
  c.v = 0;
  c.latched = false;
  c.compression = 0;
  c.held = false;
  w.objects.cart01.support = 'track';
}

function removeFromBalance(w: F06World): F06DispatchResult {
  const id = w.balance.on;
  if (!id) return { ok: true };
  if (id === 'cart01') putCartAtStart(w);
  else w.objects[id].support = 'rack';
  w.balance.on = null;
  return { ok: true };
}

function readBalance(w: F06World): F06DispatchResult {
  const p = w.params;
  const id = w.balance.on;
  const trueG = id ? loadOnBalanceG(w, id) : 0;
  const flags: string[] = [];
  let shown = trueG + w.balance.offsetG;
  if (id !== null && w.timeS - w.balance.placedS < 1.5) {
    flags.push('UNSTABLE');
    shown += gaussF6(w) * 4;
    errF6(w, 'E30', 'READ_BEFORE_STABLE', 'WARN', { inst: 'balance01' });
  }
  if (!w.balance.tared) {
    flags.push('NOT_ZEROED');
    errF6(w, 'E21', 'NOT_ZEROED', 'WARN', { inst: 'balance01' });
  }
  if (!id) flags.push('EMPTY');
  const value = quant(shown, p.balanceResolutionG);
  const load = id === 'cart01' ? Math.round(cartLoadKg(w) * 1000) : 0;
  const r = addReading(w, {
    kind: 'mass', instrumentId: 'balance01', value, unit: 'g', resolution: p.balanceResolutionG, uncertainty: p.uB.balanceG, sourceObjectIds: ['balance01', ...(id ? [id] : [])], qualityFlags: flags,
    trueValue: trueG, target: id ?? 'empty', setup: { cartLoadG: load },
  });
  if (id && !flags.length) flagF6(w, `weighed:${id}`);
  emitF6(w, 'BALANCE_READ', 'INFO', { g: value });
  return { ok: true, id: r.id, value };
}

function readRuler(w: F06World, viewDeg: number): F06DispatchResult {
  const p = w.params;
  const sp = springAt(w, 'stand');
  if (!sp) return { ok: false, code: 'NO_SPRING' };
  const st = w.stand;
  const flags: string[] = [];
  const res = p.rulerResCm;
  let shown = st.x * 100 + st.rulerOffsetCm;
  if (Math.abs(st.rulerOffsetCm) > 0.05 || st.zeroLoaded) {
    flags.push('ZERO_OFFSET');
    errF6(w, 'E03', 'RULER_ZERO_OFFSET', 'WARN');
  }
  const amp = standAmplitudeCm(w);
  if (st.hangerOn && amp > 0.05) {
    flags.push('OSCILLATING');
    errF6(w, 'E05', 'READ_OSCILLATING', 'WARN');
  }
  if (Math.abs(viewDeg) > 8) {
    shown += Math.sign(viewDeg) * 3 * res;
    flags.push('PARALLAX');
    errF6(w, 'E29', 'SCALE_PARALLAX', 'WARN', { inst: 'ruler01' });
  }
  if (w.springs[sp].damaged) {
    flags.push('DAMAGED');
    errF6(w, 'E18', 'DAMAGED_SPRING', 'WARN', { id: sp });
  }
  const value = quant(shown, res);
  const n = slotsOnHanger(w);
  const r = addReading(w, {
    kind: 'length', instrumentId: 'ruler01', value, unit: 'cm', resolution: res, uncertainty: p.uB.rulerCm, sourceObjectIds: ['ruler01', sp, 'hanger01'], qualityFlags: flags,
    trueValue: st.x * 100, target: 'ruler01', setup: { slots: n, hanger: st.hangerOn, springId: sp, springDamaged: w.springs[sp].damaged },
  });
  if (!flags.length) flagF6(w, `ruler:${st.hangerOn ? n : -1}`);
  emitF6(w, 'RULER_READ', flags.length ? 'WARN' : 'INFO', { cm: value });
  return { ok: true, id: r.id, value };
}

function readHeight(w: F06World, ref: HeightRef, viewDeg: number): F06DispatchResult {
  const p = w.params;
  const t = w.track;
  const res = p.gaugeResCm;
  const flags: string[] = [];
  let shown = t.h * 100 + (ref === 'bench' ? TR.z0 : 0);
  if (ref === 'bench') {
    flags.push('REF_BENCH');
    errF6(w, 'E06', 'HEIGHT_REFERENCE', 'WARN');
  }
  if (Math.abs(viewDeg) > 8) {
    shown += Math.sign(viewDeg) * 3 * res;
    flags.push('PARALLAX');
    errF6(w, 'E29', 'SCALE_PARALLAX', 'WARN', { inst: 'gauge01' });
  }
  if (w.timeS - t.touchedS < 1) {
    flags.push('UNSTABLE');
    errF6(w, 'E30', 'READ_BEFORE_STABLE', 'WARN', { inst: 'gauge01' });
  }
  const value = quant(shown, res);
  const r = addReading(w, {
    kind: 'height', instrumentId: 'gauge01', value, unit: 'cm', resolution: res, uncertainty: p.uB.gaugeCm, sourceObjectIds: ['gauge01', 'track01'], qualityFlags: flags,
    trueValue: t.h * 100, target: 'gauge01', setup: { h: t.h, heightVersion: t.version, ref },
  });
  emitF6(w, 'HEIGHT_READ', flags.length ? 'WARN' : 'INFO', { cm: value });
  return { ok: true, id: r.id, value };
}

function readPendScale(w: F06World, viewDeg: number): F06DispatchResult {
  const p = w.params;
  const res = p.scaleResCm;
  const flags: string[] = [];
  let shown = w.pend.L * 100;
  if (Math.abs(viewDeg) > 8) {
    shown += Math.sign(viewDeg) * 3 * res;
    flags.push('PARALLAX');
    errF6(w, 'E29', 'SCALE_PARALLAX', 'WARN', { inst: 'pend01' });
  }
  if (w.timeS - w.pend.touchedS < 1) {
    flags.push('UNSTABLE');
    errF6(w, 'E30', 'READ_BEFORE_STABLE', 'WARN', { inst: 'pend01' });
  }
  const value = quant(shown, res);
  const r = addReading(w, {
    kind: 'length', instrumentId: 'pend01', value, unit: 'cm', resolution: res, uncertainty: p.uB.scaleCm, sourceObjectIds: ['pend01'], qualityFlags: flags, trueValue: w.pend.L * 100,
    target: 'pendulum', setup: { L: w.pend.L },
  });
  emitF6(w, 'SCALE_READ', flags.length ? 'WARN' : 'INFO', { cm: value });
  return { ok: true, id: r.id, value };
}

// ─────────────────────────── Resortes, soporte y pesas ───────────────────────────

function mountSpring(w: F06World, id: string, at: SpringPlace): F06DispatchResult {
  const s = w.springs[id];
  if (!s || !w.objects[id]) return { ok: false, code: 'NO_OBJECT' };
  if (!['stand', 'launcher', 'rack'].includes(at)) return { ok: false, code: 'NO_SEAT' };
  if (s.at === at) return { ok: true };
  if (s.at === 'stand' && w.stand.hangerOn) return { ok: false, code: 'UNLOAD_FIRST' };
  if (s.at === 'launcher') {
    if (busyF6(w) && cartMovingF6(w)) return { ok: false, code: 'BUSY' };
    if (w.cart.latched && w.cart.compression > 0) {
      // Desmontar el resorte comprimido: la energía guardada se libera de golpe (F06-E40).
      const sp = springEnergy(w, id, w.cart.compression);
      w.energy.dissipatedJ += sp;
      w.cart.latched = false;
      w.cart.compression = 0;
      s.at = 'rack';
      w.objects[id].support = 'bench';
      w.track.springSecured = false;
      bumpF6(w, 'springRelease');
      errF6(w, 'E40', 'SPRING_RELEASE', 'CRITICAL');
      w.safety.block = { code: 'SPRING_RELEASE', since: w.timeS };
      return { ok: false, code: 'SPRING_RELEASE' };
    }
  }
  if (w.safety.block) return { ok: false, code: 'BLOCKED' };
  if (at !== 'rack' && springAt(w, at)) return { ok: false, code: 'OCCUPIED' };
  if (at === 'launcher' && (w.cart.on !== 'track' || w.cart.s < CART_START_S - 1e-6 || busyF6(w))) return { ok: false, code: 'CART_IN_WAY' };
  if (s.at === 'launcher' || at === 'launcher') w.track.springSecured = false;
  s.at = at;
  w.objects[id].support = at;
  if (at === 'stand') {
    w.stand.x = 0;
    w.stand.v = 0;
  }
  emitF6(w, 'SPRING_MOUNTED', 'INFO', { id, at });
  return { ok: true };
}

function hangHanger(w: F06World, on: boolean): F06DispatchResult {
  const st = w.stand;
  if (on === st.hangerOn) return { ok: true };
  if (on) {
    if (!springAt(w, 'stand')) return { ok: false, code: 'NO_SPRING' };
    if (w.objects.hanger01.support !== 'rack') return { ok: false, code: 'NOT_ON_RACK' };
    st.hangerOn = true;
    w.objects.hanger01.support = 'stand';
  } else {
    for (const m of SLOTS) if (w.objects[m].support === 'hanger') w.objects[m].support = 'rack';
    st.hangerOn = false;
    st.x = 0;
    st.v = 0;
    w.objects.hanger01.support = 'rack';
  }
  st.loadedS = w.timeS;
  rearmErrF6(w, 'E05');
  emitF6(w, on ? 'HANGER_ON' : 'HANGER_OFF', 'INFO');
  return { ok: true };
}

function hangMass(w: F06World, id: string, on: boolean): F06DispatchResult {
  const o = w.objects[id];
  if (!o || o.kind !== 'slotMass') return { ok: false, code: 'NO_OBJECT' };
  if (o.support === 'balance') return { ok: false, code: 'ON_BALANCE' };
  if (on) {
    if (!w.stand.hangerOn) return { ok: false, code: 'NO_HANGER' };
    if (o.support === 'hanger') return { ok: true };
    o.support = 'hanger';
  } else {
    if (o.support !== 'hanger') return { ok: true };
    o.support = 'rack';
  }
  w.stand.loadedS = w.timeS;
  rearmErrF6(w, 'E05');
  emitF6(w, 'MASS_HUNG', 'INFO', { id, n: slotsOnHanger(w) });
  return { ok: true };
}

// ─────────────────────────── Carro, lanzador y riel ───────────────────────────

function loadCart(w: F06World, id: string, on: boolean): F06DispatchResult {
  const o = w.objects[id];
  if (!o || o.kind !== 'cartMass') return { ok: false, code: 'NO_OBJECT' };
  if (o.support === 'balance') return { ok: false, code: 'ON_BALANCE' };
  const c = w.cart;
  if (c.on === 'balance') return { ok: false, code: 'CART_AWAY' };
  if ((on && o.support === 'cart') || (!on && o.support !== 'cart')) return { ok: true };
  const moving = runningRunF6(w) && cartMovingF6(w);
  if (on) {
    if (moving) {
      // Cargar el carro en marcha: choque inelástico con la pesa (se conserva el momento, se pierde energía, F06-E04).
      const E0 = cartEnergyJ(w);
      const zp = trackSlope(c.s, w.track.h);
      const m0 = cartKgF6(w);
      const dm = w.params.cartMassKg[id] ?? 0;
      const Kbefore = 0.5 * m0 * (1 + zp * zp) * c.v * c.v;
      c.v = (m0 * c.v) / (m0 + dm);
      o.support = 'cart';
      const Kafter = 0.5 * (m0 + dm) * (1 + zp * zp) * c.v * c.v;
      w.energy.dissipatedJ += Kbefore - Kafter;
      void E0;
    } else o.support = 'cart';
  } else o.support = 'rack';
  if (moving && w.run && w.run.massChangedT === null) {
    w.run.massChangedT = r4(w.timeS - w.run.startS);
    errF6(w, 'E04', 'MASS_CHANGED_IN_MOTION', 'WARN', { id });
  }
  emitF6(w, 'CART_LOADED', moving ? 'WARN' : 'INFO', { id, on: on ? 1 : 0 });
  return { ok: true };
}

function compress(w: F06World, xIn: number): F06DispatchResult {
  const sp = springAt(w, 'launcher');
  if (!sp) return { ok: false, code: 'NO_SPRING' };
  const c = w.cart;
  if (c.on !== 'track') return { ok: false, code: 'CART_AWAY' };
  if (busyF6(w) || cartMovingF6(w) || c.held) return { ok: false, code: 'BUSY' };
  if (c.s > TR.flat1) return { ok: false, code: 'CART_AWAY' };
  // El trinquete tiene muescas cada 1 cm; el émbolo no pasa de 25 cm.
  const x = Math.round(clamp(xIn, 0, LA.maxComp) * 100) / 100;
  c.compression = x;
  c.latched = x > 0;
  c.s = CART_START_S - x;
  c.v = 0;
  if (x > w.params.xLin + 1e-9) errF6(w, 'E01', 'SPRING_OVERLOAD', 'WARN', { cm: Math.round(x * 100), lim: Math.round(w.params.xLin * 100) });
  else rearmErrF6(w, 'E01');
  emitF6(w, 'CART_COMPRESSED', 'INFO', { cm: Math.round(x * 100) });
  return { ok: true, value: x };
}

function runSetup(w: F06World, pushMs: number): RunSetup {
  const s = w.sensor;
  const sp = springAt(w, 'launcher') ?? '';
  const t = w.track;
  const lossy = t.frictionN > 0 || t.damperC > 0;
  return {
    h: t.h, heightVersion: t.version, compression: w.cart.compression, cartKg: Math.round(cartKgF6(w) * 1e5) / 1e5, cartLoadG: Math.round(cartLoadKg(w) * 1000),
    frictionN: t.frictionN, damperC: t.damperC, losses: lossy, brakeOn: t.brakeOn, g1: Math.round(w.gates.gate1.s * 1e4) / 1e4, g2: Math.round(w.gates.gate2.s * 1e4) / 1e4,
    rateHz: w.logger.rateHz, springId: sp, springDamaged: sp ? w.springs[sp].damaged : false, secured: t.springSecured, pushMs: Math.round(pushMs * 1000) / 1000,
    sensor: { connected: s.connected, zeroed: s.zeroed, calibrated: s.calibrated, angleDeg: s.angleDeg, range: s.rangeIdx },
    posConnected: w.logger.posConnected, gatesConnected: w.logger.gatesConnected, synced: w.logger.synced,
    occluded: ['gate1', 'gate2'].some((g) => w.gates[g].s < GEOF06.posBeam.s1), clamped: t.clamped, cartDamaged: w.cart.damaged,
  };
}

const RUN_ERRS = ['E02', 'E04', 'E08', 'E14', 'E15', 'E18', 'E20', 'E21', 'E22', 'E23', 'E24', 'E25', 'E26', 'E27', 'E28', 'E32', 'E39'];

function releaseCart(w: F06World, pushMs: number): F06DispatchResult {
  const c = w.cart;
  if (!c.latched) return { ok: false, code: 'NOT_LATCHED' };
  if (busyF6(w)) return { ok: false, code: 'BUSY' };
  const sp = springAt(w, 'launcher');
  if (!sp) return { ok: false, code: 'NO_SPRING' };
  for (const e of RUN_ERRS) rearmErrF6(w, e);
  w.trial++;
  const setup = runSetup(w, pushMs);
  const x0 = c.compression;
  // Pasarse del límite elástico deja el resorte dañado: la deformación permanente absorbe energía al soltar.
  if (x0 > w.params.xLin + 1e-9 && !w.springs[sp].damaged) {
    const E0 = cartEnergyJ(w);
    w.springs[sp].damaged = true;
    w.energy.dissipatedJ += E0 - cartEnergyJ(w);
    emitF6(w, 'SPRING_DAMAGED', 'WARN', { id: sp });
  }
  const uel = springEnergy(w, sp, x0);
  c.latched = false;
  c.compression = 0;
  c.v = 0;
  if (pushMs > 0.05) {
    // Soltar empujando: la mano entrega energía extra (F06-E08).
    c.v = pushMs;
    errF6(w, 'E08', 'PUSHED_RELEASE', 'WARN', { v: Math.round(pushMs * 100) / 100 });
  }
  for (const id of ['gate1', 'gate2']) {
    const g = w.gates[id];
    g.events = [];
    g.blocked = false;
    g.onTrack = true;
  }
  const rec: RunRecord = {
    id: w.trial, startS: w.timeS, launch: [], track: [], gates: { gate1: [], gate2: [] }, sepT: null, impactT: null, impactV: 0, slipT: null, massChangedT: null, configChangedT: null,
    x0, uel: Math.round(uel * 1e6) / 1e6, maxZ: 0, crested: false, done: false, nextT: 0, nextTrackT: 0, stillS: 0, setup, configVersion: w.configVersion,
  };
  if (!setup.secured) errF6(w, 'E02', 'SPRING_NOT_SECURED', 'WARN');
  w.run = rec;
  w.runs.push(rec);
  for (const old of w.runs.slice(0, -4)) {
    old.launch = [];
    old.track = [];
  }
  if (w.runs.length > 16) w.runs.splice(0, w.runs.length - 16);
  emitF6(w, 'CART_RELEASED', 'INFO', { trial: w.trial });
  return { ok: true, value: w.trial };
}

function returnCart(w: F06World): F06DispatchResult {
  const c = w.cart;
  if (c.on === 'balance') return { ok: false, code: 'ON_BALANCE' };
  putCartAtStart(w);
  if (w.run && !w.run.done) w.run.done = true;
  emitF6(w, 'CART_RETURNED', 'INFO');
  return { ok: true };
}

function setHeight(w: F06World, m: number): F06DispatchResult {
  const t = w.track;
  const next = Math.round(clamp(m, 0, TR.maxH) * 1000) / 1000;
  if (next === t.h) return { ok: true, value: t.h };
  t.h = next;
  t.version++;
  t.touchedS = w.timeS;
  return { ok: true, value: t.h };
}

// ─────────────────────────── Sensores ───────────────────────────

function connect(w: F06World, ch: Channel, on: boolean): F06DispatchResult {
  if (ch === 'force') w.sensor.connected = on;
  else if (ch === 'position') w.logger.posConnected = on;
  else if (ch === 'gates') w.logger.gatesConnected = on;
  else if (ch === 'angle') w.logger.angleConnected = on;
  else return { ok: false, code: 'UNKNOWN' };
  if (on) {
    rearmErrF6(w, 'E23');
    flagF6(w, `connected:${ch}`);
  }
  emitF6(w, on ? 'CHANNEL_ON' : 'CHANNEL_OFF', 'INFO', { ch });
  return { ok: true };
}

/** Fuerza verdadera sobre la placa del lanzador (N): el resorte comprimido más su histéresis si está dañado. */
function launcherForce(w: F06World): number {
  const sp = springAt(w, 'launcher');
  if (!sp || w.cart.on !== 'track') return 0;
  const comp = launcherCompression(w);
  if (comp <= 0) return 0;
  const hyst = w.springs[sp].damaged && !w.cart.latched ? -w.params.hysteresisC * w.cart.v : 0;
  return Math.max(0, springForce(w, sp, comp) + hyst);
}

function zeroSensor(w: F06World): F06DispatchResult {
  const s = w.sensor;
  if (!s.connected) return { ok: false, code: 'NOT_CONNECTED' };
  const f = launcherForce(w);
  s.offset = -f * Math.cos(s.angleDeg * DEG) * s.scale;
  s.zeroed = Math.abs(f) < 0.01;
  if (s.zeroed) {
    rearmErrF6(w, 'E21');
    flagF6(w, 'zeroed');
  }
  emitF6(w, s.zeroed ? 'SENSOR_ZEROED' : 'SENSOR_ZEROED_LOADED', s.zeroed ? 'INFO' : 'WARN');
  return { ok: true };
}

function calibrateSensor(w: F06World): F06DispatchResult {
  const s = w.sensor;
  if (!s.connected) return { ok: false, code: 'NOT_CONNECTED' };
  if (launcherForce(w) > 0.01) return { ok: false, code: 'UNLOAD_FIRST' };
  s.scale = 1;
  s.calibrated = true;
  rearmErrF6(w, 'E27');
  flagF6(w, 'calibrated');
  emitF6(w, 'SENSOR_CALIBRATED', 'INFO', { n: 10 });
  return { ok: true };
}

const FLAG_ERR: Record<string, [string, string]> = {
  DETACHED: ['E02', 'SPRING_NOT_SECURED'],
  MASS_CHANGED: ['E04', 'MASS_CHANGED_IN_MOTION'],
  PUSHED: ['E08', 'PUSHED_RELEASE'],
  OFF_FLAT: ['E14', 'GATE_NOT_ON_FLAT'],
  UNSYNCED: ['E15', 'CHANNELS_UNSYNCED'],
  DAMAGED: ['E18', 'DAMAGED_SPRING'],
  NONLINEAR: ['E20', 'NONLINEAR_RANGE'],
  NOT_ZEROED: ['E21', 'NOT_ZEROED'],
  CLIPPED: ['E22', 'SENSOR_SATURATED'],
  UNPLUGGED: ['E23', 'NO_SIGNAL'],
  LOW_RATE: ['E24', 'LOW_RATE'],
  OCCLUDED: ['E25', 'BEAM_OCCLUDED'],
  TILTED_SENSOR: ['E26', 'SENSOR_TILTED'],
  UNCALIBRATED: ['E27', 'SENSOR_UNCALIBRATED'],
  BASE_SLIP: ['E28', 'RISER_SLIPPED'],
  CONFIG_CHANGED: ['E32', 'CONFIG_DURING_RUN'],
  POST_IMPACT: ['E39', 'READ_AFTER_IMPACT'],
  LATERAL: ['E17', 'LATERAL_PUSH'],
};

function runFlags(w: F06World, rec: RunRecord, out: string[]) {
  const su = rec.setup;
  if (!su.secured) out.push('DETACHED');
  if (su.pushMs > 0.05) out.push('PUSHED');
  if (su.springDamaged) out.push('DAMAGED');
  if (rec.x0 > w.params.xLin + 1e-9) out.push('NONLINEAR');
  if (rec.massChangedT !== null) out.push('MASS_CHANGED');
  if (rec.configChangedT !== null) out.push('CONFIG_CHANGED');
}

function readLaunch(w: F06World): F06DispatchResult {
  const rec = w.runs[w.runs.length - 1];
  if (!rec) return { ok: false, code: 'NO_RUN' };
  if (!rec.launch.length) return { ok: false, code: 'NO_DATA' };
  if (rec.sepT === null && !rec.done) return { ok: false, code: 'BUSY' };
  const p = w.params;
  const su = rec.setup;
  const flags: string[] = [];
  runFlags(w, rec, flags);
  const s = su.sensor;
  if (!s.connected || !su.posConnected) flags.push('UNPLUGGED');
  if (!s.zeroed) flags.push('NOT_ZEROED');
  if (!s.calibrated) flags.push('UNCALIBRATED');
  if (s.angleDeg >= 3) flags.push('TILTED_SENSOR');
  if (!su.synced) flags.push('UNSYNCED');
  if (su.occluded) flags.push('OCCLUDED');
  const sep = rec.sepT ?? rec.launch[rec.launch.length - 1][0];
  const push = rec.launch.filter((x) => x[0] <= sep + 1e-9);
  if (rec.launch.some((x) => x[0] <= sep + 1e-9 && Math.abs(x[1]) >= p.force.ranges[s.range] - 1e-9)) flags.push('CLIPPED');
  if (push.length < 25) flags.push('LOW_RATE');
  const qf = [...new Set(flags)];
  for (const f of qf) if (FLAG_ERR[f]) errF6(w, FLAG_ERR[f][0], FLAG_ERR[f][1], 'WARN', { inst: 'logger01' });
  // Posición indicada: sin sincronizar llega retrasada `lag` respecto de la fuerza (se interpola en la serie propia).
  const lag = su.synced ? 0 : p.lagS * (w.scenarios.includes(SF6.DECOUPLED) ? 2.5 : 1);
  const ts = rec.launch.map((x) => x[0]);
  const ps = rec.launch.map((x) => x[3]);
  const posAt = (t: number) => {
    if (t <= ts[0]) return ps[0];
    for (let i = 1; i < ts.length; i++) if (ts[i] >= t) return ps[i - 1] + ((ps[i] - ps[i - 1]) * (t - ts[i - 1])) / Math.max(1e-9, ts[i] - ts[i - 1]);
    return ps[ps.length - 1];
  };
  const posOk = su.posConnected && !su.occluded;
  const fOk = s.connected;
  // Compresión observada: el sensor mide la distancia a la cara trasera del carro; el émbolo libre queda a d₀.
  const d0 = LA.plunger0 - LA.back;
  const xs = push.map((x) => d0 - posAt(x[0] - lag));
  const Fs = push.map((x) => x[1]);
  let W = 0;
  let Pmax = 0;
  for (let i = 0; i + 1 < push.length; i++) W += ((Fs[i] + Fs[i + 1]) / 2) * (xs[i] - xs[i + 1]);
  if (push.length >= 2) W += (Fs[push.length - 1] / 2) * Math.max(0, xs[push.length - 1]);
  for (let i = 1; i + 1 < push.length; i++) {
    const v = -(xs[i + 1] - xs[i - 1]) / Math.max(1e-9, push[i + 1][0] - push[i - 1][0]);
    Pmax = Math.max(Pmax, Fs[i] * v);
  }
  const tPush = push.length ? push[push.length - 1][0] - push[0][0] : NaN;
  const ok = posOk && fOk && push.length >= 2;
  const value = ok ? Math.round(W * 1e4) / 1e4 : NaN;
  const Fmax = fOk && Fs.length ? Math.max(...Fs) : NaN;
  const xmax = posOk && xs.length ? Math.max(...xs) : NaN;
  const r = addReading(w, {
    kind: 'launch', instrumentId: 'logger01', value, unit: 'J', resolution: 1e-4, uncertainty: p.uB.forceN * 0.1, sourceObjectIds: ['logger01', 'force01', 'pos01', 'launcher01', 'cart01'],
    qualityFlags: qf, trueValue: rec.uel, target: 'cart01', trial: rec.id, configVersion: rec.configVersion,
    launch: {
      W: fin(value), Fmax: fin(Number.isFinite(Fmax) ? Math.round(Fmax * 1e4) / 1e4 : NaN), xmax: fin(Number.isFinite(xmax) ? Math.round(xmax * 1e5) / 1e5 : NaN),
      Pmax: fin(ok ? Math.round(Pmax * 1e4) / 1e4 : NaN), Pavg: fin(ok && tPush > 0 ? Math.round((W / tPush) * 1e4) / 1e4 : NaN), tPush: fin(Number.isFinite(tPush) ? r4(tPush) : NaN), n: push.length,
      trueW: fin(rec.uel),
    },
    setup: { ...su },
  });
  emitF6(w, 'LAUNCH_READ', qf.length ? 'WARN' : 'INFO', { W: value, n: push.length });
  return { ok: true, id: r.id, value };
}

function readGates(w: F06World): F06DispatchResult {
  const rec = w.runs[w.runs.length - 1];
  if (!rec) return { ok: false, code: 'NO_RUN' };
  if (!rec.done) return { ok: false, code: 'BUSY' };
  const p = w.params;
  const su = rec.setup;
  const flags: string[] = [];
  runFlags(w, rec, flags);
  if (!su.gatesConnected) flags.push('UNPLUGGED');
  if (!onBottomFlat(su.g1) || !onTopFlat(su.g2)) flags.push('OFF_FLAT');
  if (su.cartDamaged) flags.push('POST_IMPACT');
  if (rec.slipT !== null) flags.push('BASE_SLIP');
  const g1 = rec.gates.gate1?.[0];
  const g2 = rec.gates.gate2?.[0];
  const crested = !!g2 && g2[1] !== null;
  if (!crested) flags.push('NOT_CRESTED');
  if (!g1 || g1[1] === null) flags.push('NO_PASS');
  const qf = [...new Set(flags)];
  for (const f of qf) if (FLAG_ERR[f]) errF6(w, FLAG_ERR[f][0], FLAG_ERR[f][1], 'WARN', { inst: 'gate1' });
  const dtOf = (e: [number, number | null] | undefined) => (e && e[1] !== null && su.gatesConnected ? timerIndication(e[1] - e[0], p.gate, gaussF6(w)) : null);
  const raw = (e: [number, number | null] | undefined) => (e && e[1] !== null ? e[1] - e[0] : NaN);
  const fw = GEOF06.cart.flagW / 100;
  const dt1 = dtOf(g1);
  const dt2 = dtOf(g2);
  const value = dt1 ?? NaN;
  const r = addReading(w, {
    kind: 'gates', instrumentId: 'gate1', value, unit: 's', resolution: p.gate.resolutionS, uncertainty: p.uB.gateS, sourceObjectIds: ['gate1', 'gate2', 'cart01', 'logger01'], qualityFlags: qf,
    trueValue: fw / raw(g1), target: 'cart01', trial: rec.id, configVersion: rec.configVersion,
    gates: { dt1: fin(dt1), dt2: fin(dt2), crested, trueV1: fin(fw / raw(g1)), trueV2: fin(fw / raw(g2)) },
    setup: { ...su },
  });
  emitF6(w, 'GATES_READ', qf.length ? 'WARN' : 'INFO', { dt: value });
  return { ok: true, id: r.id, value };
}

// ─────────────────────────── Péndulo ───────────────────────────

function holdBob(w: F06World, deg: number): F06DispatchResult {
  const p = w.pend;
  const lim = maxAmplitudeDeg(p.L);
  p.thetaDeg = Math.round(clamp(deg, -lim, lim) * 100) / 100;
  p.omega = 0;
  p.y = 0;
  p.vy = 0;
  p.held = true;
  if (w.swing && !w.swing.done) w.swing.done = true;
  return { ok: true, value: p.thetaDeg };
}

function releaseBob(w: F06World, lateralMs: number): F06DispatchResult {
  const p = w.pend;
  if (!p.held) return { ok: false, code: 'NOT_HELD' };
  if (Math.abs(p.thetaDeg) < 0.5) return { ok: false, code: 'NO_AMPLITUDE' };
  rearmErrF6(w, 'E17');
  rearmErrF6(w, 'E32');
  rearmErrF6(w, 'E23');
  w.trial++;
  p.held = false;
  p.vy = lateralMs;
  const g = w.gates.gate3;
  g.events = [];
  g.blocked = false;
  g.onTrack = true;
  const angleShown = w.logger.angleConnected ? quant(Math.abs(p.thetaDeg) + gaussF6(w) * 0.03 * w.params.noiseFactor, w.params.angleResDeg) : null;
  const rec: PendRecord = {
    id: w.trial, startS: w.timeS, theta0: Math.abs(p.thetaDeg), L: p.L, lateralMs, gate: [], angleShown, vBottom: 0, configChangedT: null, done: false,
    setup: { L: p.L, theta0: Math.abs(p.thetaDeg), angleConnected: w.logger.angleConnected, gatesConnected: w.logger.gatesConnected, lateralMs, bobKg: w.params.bobKg },
    configVersion: w.configVersion,
  };
  if (lateralMs > 0.02) errF6(w, 'E17', 'LATERAL_PUSH', 'WARN', { v: Math.round(lateralMs * 100) / 100 });
  w.swing = rec;
  w.swings.push(rec);
  if (w.swings.length > 12) w.swings.splice(0, w.swings.length - 12);
  emitF6(w, 'BOB_RELEASED', 'INFO', { trial: w.trial, deg: rec.theta0 });
  return { ok: true, value: w.trial };
}

function readPendulum(w: F06World): F06DispatchResult {
  const rec = w.swings[w.swings.length - 1];
  if (!rec) return { ok: false, code: 'NO_RUN' };
  const e = rec.gate[0];
  if (!e || e[1] === null) return { ok: false, code: 'NO_DATA' };
  const p = w.params;
  const su = rec.setup;
  const flags: string[] = [];
  if (!su.angleConnected || !su.gatesConnected) flags.push('UNPLUGGED');
  if (su.lateralMs > 0.02) flags.push('LATERAL');
  if (rec.configChangedT !== null) flags.push('CONFIG_CHANGED');
  const qf = [...new Set(flags)];
  for (const f of qf) if (FLAG_ERR[f]) errF6(w, FLAG_ERR[f][0], FLAG_ERR[f][1], 'WARN', { inst: 'angle01' });
  const dt = su.gatesConnected ? timerIndication(e[1] - e[0], p.gate, gaussF6(w)) : null;
  const value = rec.angleShown ?? NaN;
  const r = addReading(w, {
    kind: 'pendulum', instrumentId: 'angle01', value, unit: '°', resolution: p.angleResDeg, uncertainty: p.uB.angleDeg, sourceObjectIds: ['angle01', 'gate3', 'pend01'], qualityFlags: qf,
    trueValue: rec.theta0, target: 'pendulum', trial: rec.id, configVersion: rec.configVersion,
    pend: { theta0: fin(rec.angleShown), dt: fin(dt), L: rec.L, trueV: fin(rec.vBottom) },
    setup: { L: su.L, theta0: su.theta0 },
  });
  emitF6(w, 'PENDULUM_READ', qf.length ? 'WARN' : 'INFO', { deg: value });
  return { ok: true, id: r.id, value };
}

// ─────────────────────────── Cierre y bloqueos ───────────────────────────

function closeStation(w: F06World): F06DispatchResult {
  const c = w.cart;
  if (c.latched) return { ok: false, code: 'LATCHED' };
  if (busyF6(w) || cartMovingF6(w)) return { ok: false, code: 'BUSY' };
  if (c.on !== 'track' || Math.abs(c.s - CART_START_S) > 0.005) return { ok: false, code: 'CART_AWAY' };
  if ([...SLOTS, ...CART_MASSES].some((m) => w.objects[m].support !== 'rack') || w.stand.hangerOn) return { ok: false, code: 'MASSES_OUT' };
  if (w.pend.held || bobMovingF6(w)) return { ok: false, code: 'BOB_MOVING' };
  if (w.balance.on) return { ok: false, code: 'PAN_BUSY' };
  flagF6(w, 'stationClosed');
  emitF6(w, 'STATION_CLOSED', 'INFO');
  return { ok: true };
}

function acknowledge(w: F06World): F06DispatchResult {
  const b = w.safety.block;
  if (!b) return { ok: true };
  const atRest = w.cart.on === 'track' && !cartMovingF6(w) && !w.cart.latched && Math.abs(w.cart.s - CART_START_S) < 0.005;
  if (b.code === 'SPRING_RELEASE' && !atRest) return { ok: false, code: 'SECURE_FIRST' };
  if (b.code === 'CART_CRASH' && (!atRest || !w.track.brakeOn)) return { ok: false, code: 'SECURE_FIRST' };
  w.safety.block = null;
  emitF6(w, 'STATION_RESET', 'INFO', { code: b.code });
  return { ok: true };
}

// ─────────────────────────── Paso: soporte ───────────────────────────

function stepStand(w: F06World, h: number) {
  const st = w.stand;
  const sp = springAt(w, 'stand');
  if (!sp || !st.hangerOn) {
    st.x = 0;
    st.v = 0;
    return;
  }
  const p = w.params;
  const m = hangingKg(w);
  const v0 = st.v;
  const E0 = standEnergyJ(w);
  const F = m * p.g - springForce(w, sp, st.x);
  st.v = (v0 + (F / m) * h) / (1 + (p.standC * h) / m);
  st.x += ((v0 + st.v) / 2) * h;
  const diss = p.standC * h * st.v * ((v0 + st.v) / 2);
  // Proyección de energía (como en el carro): la mecánica cae exactamente lo disipado por el aire.
  const drift = E0 - diss - standEnergyJ(w);
  if (Math.abs(st.v) > 1e-5) {
    const K = 0.5 * m * st.v * st.v;
    if (K + drift > 0 && Math.abs(drift) < 0.5 * K + 1e-6) st.v = sgn(st.v) * Math.sqrt((2 * (K + drift)) / m);
  }
  w.energy.dissipatedJ += diss;
}

// ─────────────────────────── Paso: carro ───────────────────────────

function cartInertia(w: F06World, s: number, contact: boolean): number {
  const zp = trackSlope(s, w.track.h);
  return cartKgF6(w) * (1 + zp * zp) + (contact ? w.params.plungerKg : 0);
}

function stepCart(w: F06World, t0: number, h: number) {
  const c = w.cart;
  if (c.on !== 'track' || c.latched) return;
  const p = w.params;
  const tr = w.track;
  const run = runningRunF6(w) ? w.run : null;
  const sp = springAt(w, 'launcher');
  // Resorte sin presilla: salta de su asiento a mitad de carrera y su energía restante se pierde (F06-E02).
  if (run && sp && !run.setup.secured && run.sepT === null) {
    const comp = launcherCompression(w);
    if (comp > 0 && comp < 0.55 * run.x0) {
      const E0 = cartEnergyJ(w);
      w.springs[sp].at = 'rack';
      w.objects[sp].support = 'track';
      w.track.springSecured = false;
      w.energy.dissipatedJ += E0 - cartEnergyJ(w);
      run.sepT = r4(t0 - run.startS);
      emitF6(w, 'SPRING_JUMPED', 'WARN');
    }
  }
  if (c.held) {
    c.v = 0;
    recordRun(w, run, t0, h, c.s, 0);
    return;
  }
  const m = cartKgF6(w);
  const hh = tr.h;
  const s0 = c.s;
  const v0 = c.v;
  const E0 = cartEnergyJ(w);
  const comp0 = launcherCompression(w);
  const contact = comp0 > 0;
  const zp = trackSlope(s0, hh);
  const zpp = trackCurv(s0, hh);
  const root = Math.sqrt(1 + zp * zp);
  const spr = contact && springAt(w, 'launcher') ? springForce(w, springAt(w, 'launcher')!, comp0) : 0;
  const damaged = contact && sp ? w.springs[sp]?.damaged : false;
  const hystC = damaged ? p.hysteresisC : 0;
  const inLoss = s0 >= GEOF06.loss.s0 && s0 <= GEOF06.loss.s1;
  const inBrake = tr.brakeOn && s0 >= GEOF06.brake.s0;
  const fric = p.rollN + (c.damaged ? p.damagedRollN : 0) + (inLoss ? tr.frictionN : 0);
  const visc = (inLoss ? tr.damperC : 0) + (inBrake ? p.brakeC : 0);
  const M = cartInertia(w, s0, contact);
  // Fuerza motriz (sin roces) a lo largo de s.
  const D = spr - m * p.g * zp - m * zp * zpp * v0 * v0;
  // Roces de Coulomb explícitos y términos viscosos implícitos (estables con el freno): ½M(v₀² − v₁²) = trabajo disipado.
  const cv = visc * (1 + zp * zp) + hystC;
  let v1: number;
  let diss = 0;
  let stopped = false;
  if (Math.abs(v0) < 1e-6) {
    if (Math.abs(D) <= fric * root) v1 = 0;
    else v1 = ((D - sgn(D) * fric * root) / M) * h / (1 + (cv * h) / M);
  } else {
    v1 = (v0 + ((D - sgn(v0) * fric * root) / M) * h) / (1 + (cv * h) / M);
    if (sgn(v1) !== sgn(v0)) {
      v1 = 0;
      stopped = true;
    }
  }
  const ds = ((v0 + v1) / 2) * h;
  diss += fric * Math.abs(ds) * root + cv * h * v1 * ((v0 + v1) / 2);
  c.s = s0 + ds;
  c.v = v1;
  // El émbolo se detiene al quedar libre: su energía cinética se pierde en el tope del lanzador.
  if (contact && launcherCompression(w) <= 0) {
    diss += 0.5 * p.plungerKg * v1 * v1;
    if (run && run.sepT === null) run.sepT = r4(t0 + h - run.startS);
  }
  const E1 = cartEnergyJ(w);
  if (stopped) {
    // El roce detuvo el carro dentro del subpaso: todo lo que faltaba se lo llevó el roce.
    diss = E0 - E1;
  } else {
    // Proyección de energía: la mecánica cae exactamente lo disipado (corrige el error del integrador).
    const drift = E0 - diss - E1;
    if (Math.abs(c.v) > 1e-4 && drift !== 0) {
      const I = cartInertia(w, c.s, launcherCompression(w) > 0);
      const K = 0.5 * I * c.v * c.v;
      const Kt = K + drift;
      if (Kt > 0 && Math.abs(drift) < 0.5 * K + 1e-3) c.v = sgn(c.v) * Math.sqrt((2 * Kt) / I);
    }
  }
  w.energy.dissipatedJ += diss;
  // Topes: placa trasera del lanzador (sin resorte) y tope del extremo alto.
  const minS = LA.back + HM;
  if (c.s < minS && c.v < 0) {
    const Ea = cartEnergyJ(w);
    c.s = minS;
    c.v = -0.3 * c.v;
    w.energy.dissipatedJ += Ea - cartEnergyJ(w);
  }
  if (c.s > CART_MAX_S && c.v > 0) {
    const vi = c.v;
    const Ea = cartEnergyJ(w);
    c.s = CART_MAX_S;
    c.v = -0.3 * vi;
    w.energy.dissipatedJ += Ea - cartEnergyJ(w);
    if (run && run.impactT === null) {
      run.impactT = r4(t0 + h - run.startS);
      run.impactV = Math.round(vi * 1000) / 1000;
    }
    if (!tr.brakeOn && vi > 0.3) {
      // Sin freno el carro golpea el soporte del extremo (F06-E13): se tuerce una rueda y se bloquea el puesto.
      if (vi > 0.6 && !c.damaged) {
        c.damaged = true;
        emitF6(w, 'CART_DAMAGED', 'WARN');
      }
      errF6(w, 'E13', 'CART_CRASH', 'CRITICAL', { v: Math.round(vi * 100) / 100 });
      if (!w.safety.block) w.safety.block = { code: 'CART_CRASH', since: w.timeS };
    }
  }
  // Freno magnético: retiene el carro cuando queda casi quieto en su tramo.
  if (tr.brakeOn && c.s >= GEOF06.brake.s0 && Math.abs(c.v) < 0.03) {
    const Ea = cartEnergyJ(w);
    c.v = 0;
    c.held = true;
    w.energy.dissipatedJ += Ea - cartEnergyJ(w);
  }
  // Columna sin abrazadera: cede cuando el carro la pasa por arriba (F06-E28).
  if (run && !tr.clamped && run.slipT === null && s0 < TR.riserS && c.s >= TR.riserS && tr.h > 0.02) {
    const Ea = cartEnergyJ(w);
    tr.h = Math.max(0, Math.round((tr.h - p.riserSlipM) * 1000) / 1000);
    tr.version++;
    run.slipT = r4(t0 + h - run.startS);
    w.energy.dissipatedJ += Ea - cartEnergyJ(w);
    errF6(w, 'E28', 'RISER_SLIPPED', 'WARN');
  }
  recordRun(w, run, t0, h, s0, c.s);
}

function recordRun(w: F06World, run: RunRecord | null, t0: number, h: number, s0: number, s1: number) {
  if (!run) return;
  const c = w.cart;
  const p = w.params;
  const tRel = t0 + h - run.startS;
  const fw = GEOF06.cart.flagW / 100;
  for (const id of ['gate1', 'gate2']) {
    const g = w.gates[id];
    const zp = trackSlope(g.s, w.track.h);
    updateGate(g, s0, s1, t0, h, fw / Math.sqrt(1 + zp * zp), p.gate, run.startS);
    run.gates[id] = g.events.map((e) => [e[0], e[1]] as [number, number | null]);
  }
  const z = trackZ(c.s, w.track.h);
  if (z > run.maxZ) run.maxZ = z;
  if (c.s >= TR.flat1 + TR.rise) run.crested = true;
  // Señales del disparo (fuerza en la placa y posición del carro) mientras dura el empuje y un poco después.
  const limit = run.sepT === null ? 1.0 : Math.min(1.0, run.sepT + 0.1);
  while (run.nextT <= tRel + 1e-9 && run.nextT <= limit + 1e-9) {
    const Ft = launcherForce(w);
    const fi = forceIndication(Ft, w.sensor, p.force, gaussF6(w) * p.noiseFactor);
    const rear = c.s - HM - LA.back;
    const pos = quant(rear + gaussF6(w) * 0.00005 * p.noiseFactor, p.posResM);
    run.launch.push([Math.round(run.nextT * 1e5) / 1e5, w.sensor.connected ? fi.value : 0, Math.round(Ft * 1e5) / 1e5, w.logger.posConnected && !run.setup.occluded ? pos : 0, Math.round(launcherCompression(w) * 1e6) / 1e6, Math.round(c.v * 1e5) / 1e5]);
    run.nextT = Math.round((run.nextT + 1 / w.logger.rateHz) * 1e6) / 1e6;
  }
  while (run.nextTrackT <= tRel + 1e-9) {
    run.track.push([Math.round(run.nextTrackT * 1e3) / 1e3, Math.round(c.s * 1e4) / 1e4, Math.round(c.v * 1e4) / 1e4, Math.round(z * 1e4) / 1e4]);
    run.nextTrackT = Math.round((run.nextTrackT + 0.05) * 1e6) / 1e6;
  }
  run.stillS = Math.abs(c.v) < 1e-4 ? run.stillS + h : 0;
  if (tRel >= 8 || (run.stillS >= 0.4 && tRel > 0.5) || (c.held && tRel > 0.3)) {
    run.done = true;
    emitF6(w, 'RUN_DONE', 'INFO', { trial: run.id, crest: run.crested ? 1 : 0 });
  }
}

// ─────────────────────────── Paso: péndulo ───────────────────────────

function stepPend(w: F06World, t0: number, h: number) {
  const pd = w.pend;
  if (pd.held) return;
  if (Math.abs(pd.omega) < 1e-9 && Math.abs(pd.thetaDeg) < 1e-9 && Math.abs(pd.vy) < 1e-9 && Math.abs(pd.y) < 1e-9) return;
  const p = w.params;
  const L = pd.L;
  const m = p.bobKg;
  const E0 = pendEnergyJ(w);
  const th0 = pd.thetaDeg * DEG;
  const om0 = pd.omega;
  const gam = p.airGamma;
  pd.omega = (om0 - (p.g / L) * Math.sin(th0) * h) / (1 + gam * h);
  const th1 = th0 + ((om0 + pd.omega) / 2) * h;
  const vy0 = pd.vy;
  pd.vy = (vy0 - (p.g / L) * pd.y * h) / (1 + gam * h);
  pd.y += ((vy0 + pd.vy) / 2) * h;
  pd.thetaDeg = th1 / DEG;
  const diss = gam * h * m * (L * L * pd.omega * ((om0 + pd.omega) / 2) + pd.vy * ((vy0 + pd.vy) / 2));
  const E1 = pendEnergyJ(w);
  const drift = E0 - diss - E1;
  if (Math.abs(pd.omega) > 1e-4) {
    const K = 0.5 * m * L * L * pd.omega * pd.omega;
    const Kt = K + drift;
    if (Kt > 0 && Math.abs(drift) < 0.5 * K + 1e-4) pd.omega = sgn(pd.omega) * Math.sqrt((2 * Kt) / (m * L * L));
  }
  w.energy.dissipatedJ += diss;
  const sw = runningSwingF6(w) ? w.swing : null;
  if (sw) {
    // La esfera corta el haz con una cuerda 2√(r² − y²): con movimiento lateral la cuerda es menor o no lo corta.
    const r = p.bobD / 2;
    const chord = Math.abs(pd.y) < r ? 2 * Math.sqrt(r * r - pd.y * pd.y) : 0;
    const g = w.gates.gate3;
    updateGate(g, L * th0, L * th1, t0, h, chord, p.gate, sw.startS);
    sw.gate = g.events.map((e) => [e[0], e[1]] as [number, number | null]);
    // Rapidez verdadera en el punto más bajo (cruce de θ = 0), solo para el docente.
    if (th0 * th1 <= 0 && sw.vBottom === 0) sw.vBottom = Math.round(Math.abs(L * pd.omega) * 1e5) / 1e5;
    if (sw.gate.length && sw.gate[0][1] !== null) sw.done = true;
  }
}

// ─────────────────────────── Paso de simulación ───────────────────────────

export function stepF06World(w: F06World): void {
  const dt = w.params.dtS;
  const n = Math.max(1, w.params.subSteps);
  const h = dt / n;
  const tStart = w.timeS;
  w.timeS = Math.round((w.timeS + dt) * 1e6) / 1e6;
  w.tick++;
  for (let i = 0; i < n; i++) {
    const t0 = tStart + i * h;
    stepStand(w, h);
    stepCart(w, t0, h);
    stepPend(w, t0, h);
  }
}

export function runF06For(w: F06World, seconds: number) {
  const n = Math.round(seconds / w.params.dtS);
  for (let i = 0; i < n; i++) stepF06World(w);
}

export function f06Summary(w: F06World) {
  return {
    s: Math.round(w.cart.s * 1e6) / 1e6,
    v: Math.round(w.cart.v * 1e6) / 1e6,
    x: Math.round(w.stand.x * 1e6) / 1e6,
    th: Math.round(w.pend.thetaDeg * 1e4) / 1e4,
    h: w.track.h,
    trial: w.trial,
    readings: w.readingOrder.length,
    cfg: w.configVersion,
  };
}
