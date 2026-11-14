/**
 * Mundo de F07 — impulso, colisiones y momento lineal: paso fijo determinista de 0,05 s con 10 subpasos de 5 ms (§6).
 * La escena solo dibuja este estado y envía hechos geométricos.
 *
 * - Dos carros sobre un riel de 200 cm con lanzadores de émbolo en los extremos (el émbolo libre hace de tope; con los
 *   amortiguadores puestos el carro queda frenado, sin ellos rebota y puede golpearse).
 * - Contacto de Kelvin–Voigt entre los paragolpes: F = k δ + c δ̇ (F ≥ 0), con c elegida para la restitución e (resorte o
 *   imanes; los imanes son más blandos y actúan desde 2 cm). El velcro fijado (o imanes con la polaridad invertida) se
 *   pega en la compresión máxima: los carros siguen unidos con la velocidad del centro de masa. Mientras el contacto es
 *   posible el subpaso se divide en 40 microsubpasos de 0,125 ms (el choque dura 10–40 ms).
 * - Las fuerzas internas son iguales y opuestas: Σp solo cambia por el impulso externo (roce, rodadura, pendiente,
 *   rieles laterales en un choque oblicuo, topes, mano y lanzadores), que se acumula aparte.
 * - Instrumentos: balanza de 1 g, calibre de 0,01 cm para las banderas, nivel de burbuja, dos fotopuertas
 *   (`instruments/photogate`, cronómetro de 10 µs), sensor de fuerza en el paragolpes de B (`instruments/force-sensor`),
 *   cámara lateral a 20 Hz y regla de posición.
 */
import type { Channel, F07Command, F07DispatchResult, PpeItem, TrackGate } from './commands';
import type { BumperType, CartId, CartState, Crossing, F07Object, F07Params, F07World, Pose, ReadingF7, RunRecord, RunSetup } from './types';
import { hashRandom } from '../core/rng';
import { bumpF7, emitF7, errF7, flagF7, gaussF7, rearmErrF7 } from './events';
import { CART_A_START, CART_B_LAUNCH, CART_MAX_S, CART_MIN_S, CONTACT_D, GEOF07 } from './geometry';
import { CARTS, cartKgF7, cartLoadKg, centerOfMass, conservedTotalsF07, contactForce, contactModel, launcherK, mechanicalEnergyJ, totalMomentum } from './conservation';
import { newGate, timerIndication } from '../instruments/photogate';
import { forceIndication, quantizeReading } from '../instruments/force-sensor';

export { emitF7, latchF7, rearmF7, bumpF7, flagF7, errF7 } from './events';
export { conservedTotalsF07, cartKgF7, totalMomentum, centerOfMass };

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, num(v, a)));
const DEG = Math.PI / 180;
const LA = GEOF07.launcher;
const sgn = (x: number) => (x > 0 ? 1 : x < 0 ? -1 : 0);
const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
const isCart = (c: unknown): c is CartId => c === 'cartA' || c === 'cartB';
const other = (c: CartId): CartId => (c === 'cartA' ? 'cartB' : 'cartA');
/** Microsubpasos por subpaso mientras el contacto es posible. */
const MICRO = 40;

/** Escenarios docentes (§10). */
export const SF7 = {
  ELASTIC: 'F07-S01_elastic',
  PARTIAL: 'F07-S02_partially_inelastic',
  VELCRO: 'F07-S03_velcro',
  EQUAL: 'F07-S04_equal_masses',
  UNEQUAL: 'F07-S05_unequal_masses',
  BOTH_MOVING: 'F07-S06_both_moving',
  SLOPED: 'F07-S07_sloped_track',
  FRICTION: 'F07-S08_small_friction',
  OBLIQUE: 'F07-S09_oblique',
  FLAG_TILT: 'F07-S10_misaligned_flag',
  SOFT: 'F07-S11_soft_contact',
  SIDE_LIMIT: 'F07-S12_side_limit',
} as const;

export interface F07WorldSpec {
  objects: F07Object[];
  scenarios: string[];
  mode: string;
}

export const CART_MASSES = ['cw100a', 'cw100b', 'cw200'] as const;
export const GATES: TrackGate[] = ['gateA', 'gateB'];

// ─────────────────────────── Creación ───────────────────────────

export function createF07World(spec: F07WorldSpec, seed: number, params: F07Params): F07World {
  const has = (s: string) => spec.scenarios.includes(s);
  const objects: Record<string, F07Object> = {};
  for (const o of spec.objects) objects[o.id] = { ...o, pose: { ...o.pose } };
  const h = (k: string) => hashRandom(seed, k) - 0.5;
  const sign = (k: string) => (h(k) > 0 ? 1 : -1);
  const offs = Math.round(sign('fS') * params.force.offsetN * (0.4 + (h('f') + 0.5) * 0.6) * 1000) / 1000;
  const tilt = has(SF7.SLOPED) ? 1.2 * sign('tS') : Math.round(sign('tS') * params.baseTiltMax * (0.5 + (h('t') + 0.5) * 0.5) * 100) / 100;
  const off = (k: string) => Math.round(h(k) * 2 * params.offsetMaxMm * 10) / 10;
  const cart = (s: number, flagW: number, k: string): CartState => ({
    on: 'track', s, v: 0, latched: false, compression: 0, brake: true, wheelBind: hashRandom(seed, `bind${k}`) < 0.4, offsetMm: off(`off${k}`), flagW, flagYawDeg: 0, damaged: false,
  });
  const w: F07World = {
    timeS: 0, tick: 0, seed, rng: seed >>> 0 || 1, params, mode: spec.mode, objects,
    carts: { cartA: cart(CART_A_START, 2, 'A'), cartB: cart(GEOF07.cartB0, 3, 'B') },
    bumper: { type: has(SF7.VELCRO) ? 'velcro' : 'spring', polarityOk: hashRandom(seed, 'pol') > 0.5, velcroFixed: false, joined: false },
    track: { baseTiltDeg: tilt, screwDeg: 0, touchedS: -10, endDampers: false, gatesClamped: false },
    sensor: { connected: false, offset: offs, zeroed: false, scale: params.force.uncalScale, calibrated: false, rangeIdx: 0, angleDeg: 0 },
    logger: { rateHz: params.rates[0], gatesConnected: false, cameraOn: false },
    gates: { gateA: newGate(GEOF07.gate.sA), gateB: newGate(GEOF07.gate.sB) },
    balance: { on: null, placedS: -10, offsetG: Math.round(sign('balS') * (2 + (h('bal') + 0.5) * 2)), tared: false },
    weighed: { cartA: -1, cartB: -1 },
    flagMeasured: { cartA: 0, cartB: 0 },
    run: null, runs: [],
    energy: { dissipatedJ: 0, externalJ: 0 },
    momentum: { externalNs: 0 },
    trial: 0,
    configVersion: 1,
    readings: {}, readingOrder: [],
    safety: { ppe: { coat: false, goggles: false, shoes: false, hair: false }, block: null, stoppedByTeacher: false },
    events: [], evidence: {}, scenarios: [...spec.scenarios], ppe: false,
    initialTotals: { massesG: 0 },
  };
  if (has(SF7.OBLIQUE)) {
    w.carts.cartA.offsetMm = 8 * sign('oA');
    w.carts.cartB.offsetMm = -w.carts.cartA.offsetMm;
  }
  if (has(SF7.FLAG_TILT)) w.carts.cartA.flagYawDeg = params.flagYaw0 || 7;
  w.initialTotals = { massesG: conservedTotalsF07(w).massesG };
  w.energy.externalJ = mechanicalEnergyJ(w);
  return w;
}

// ─────────────────────────── Consultas ───────────────────────────

export const runningRunF7 = (w: F07World) => !!w.run && !w.run.done;
export const busyF7 = (w: F07World) => runningRunF7(w);
export const cartMovingF7 = (w: F07World, c?: CartId) => (c ? [c] : CARTS).some((id) => w.carts[id].on === 'track' && Math.abs(w.carts[id].v) > 1e-4);
export const tiltDegF7 = (w: F07World) => w.track.baseTiltDeg + w.track.screwDeg;
/** Separación entre paragolpes (m, negativa si se superponen). */
export const gapF7 = (w: F07World) => w.carts.cartB.s - w.carts.cartA.s - CONTACT_D;
/** Ancho efectivo de la bandera para el haz (m): la bandera girada corta el haz en diagonal. */
const flagEff = (c: CartState) => c.flagW / 100 / Math.cos(c.flagYawDeg * DEG);
/** ¿La bandera del carro está dentro del haz de la compuerta? */
const inBeam = (w: F07World, g: string, c: CartState) => c.on === 'track' && Math.abs(c.s - w.gates[g].s) < flagEff(c) / 2;

// ─────────────────────────── Despacho ───────────────────────────

const BEFORE_PPE = new Set<F07Command['type']>(['equipPpe', 'startWork', 'teacherStop', 'acknowledge', 'inspect']);
const DURING_BLOCK = new Set<F07Command['type']>(['acknowledge', 'teacherStop', 'inspect', 'setPose', 'stopCart', 'placeCart', 'setCartBrake', 'setEndDampers', 'separateCarts', 'repairCart']);
/** Comandos que cambian la condición física del ensayo (nuevo montaje; E32 si hay un ensayo en marcha). */
const CONFIG = new Set<F07Command['type']>([
  'setLevelScrew', 'setEndDampers', 'setCartBrake', 'freeWheel', 'centerCart', 'setBumper', 'flipMagnet', 'fixVelcro', 'moveGate', 'clampGates', 'setFlag', 'alignFlag', 'connect', 'zeroSensor',
  'calibrateSensor', 'setRange', 'mountSensor', 'setRate',
]);

export function dispatchF07(w: F07World, cmd: F07Command): F07DispatchResult {
  if (!cmd || typeof cmd !== 'object') return { ok: false, code: 'UNKNOWN' };
  if (w.safety.stoppedByTeacher && cmd.type !== 'teacherStop') return { ok: false, code: 'TEACHER_STOP' };
  if (!w.ppe && !BEFORE_PPE.has(cmd.type)) return { ok: false, code: 'PPE' };
  if (w.safety.block && !DURING_BLOCK.has(cmd.type)) return { ok: false, code: 'BLOCKED' };
  // Trabajo e impulso externos: lo que el gesto cambia en la energía (mecánica + disipada) y en Σp.
  const S0 = mechanicalEnergyJ(w) + w.energy.dissipatedJ;
  const P0 = totalMomentum(w);
  const before = w.configVersion;
  const moving = runningRunF7(w) && cartMovingF7(w);
  const res = route(w, cmd);
  w.energy.externalJ += mechanicalEnergyJ(w) + w.energy.dissipatedJ - S0;
  w.momentum.externalNs += totalMomentum(w) - P0;
  if (res.ok && CONFIG.has(cmd.type)) {
    if (w.configVersion === before) w.configVersion++;
    const r = moving ? w.run : null;
    if (r && r.configChangedT === null) {
      r.configChangedT = r4(w.timeS - r.startS);
      errF7(w, 'E32', 'CONFIG_DURING_RUN', 'WARN', { cmd: cmd.type });
    }
  }
  return res;
}

function route(w: F07World, cmd: F07Command): F07DispatchResult {
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
    // Balanza y calibre
    case 'tareBalance':
      if (w.balance.on) return { ok: false, code: 'PAN_NOT_EMPTY' };
      w.balance.offsetG = 0;
      w.balance.tared = true;
      rearmErrF7(w, 'E21');
      flagF7(w, 'balanceTared');
      emitF7(w, 'BALANCE_TARED', 'INFO');
      return { ok: true };
    case 'placeOnBalance':
      return placeOnBalance(w, String(cmd.id));
    case 'removeFromBalance':
      return removeFromBalance(w);
    case 'readBalance':
      return readBalance(w);
    case 'measureFlag':
      return measureFlag(w, cmd.cart);
    // Riel
    case 'setLevelScrew': {
      const t = w.track;
      const next = Math.round(clamp(cmd.deg, -2, 2) * 100) / 100;
      if (next === t.screwDeg) return { ok: true, value: t.screwDeg };
      t.screwDeg = next;
      t.touchedS = w.timeS;
      return { ok: true, value: t.screwDeg };
    }
    case 'readLevel':
      return readLevel(w, num(cmd.viewDeg));
    case 'setEndDampers':
      w.track.endDampers = !!cmd.on;
      emitF7(w, cmd.on ? 'DAMPERS_ON' : 'DAMPERS_OFF', cmd.on ? 'INFO' : 'WARN');
      return { ok: true };
    // Carros y paragolpes
    case 'placeCart':
      return placeCart(w, cmd.cart, num(cmd.s, NaN));
    case 'setCartBrake': {
      if (!isCart(cmd.cart)) return { ok: false, code: 'NO_OBJECT' };
      w.carts[cmd.cart].brake = !!cmd.on;
      if (!cmd.on) rearmErrF7(w, 'E10');
      emitF7(w, cmd.on ? 'BRAKE_ON' : 'BRAKE_OFF', 'INFO', { cart: cmd.cart });
      return { ok: true };
    }
    case 'freeWheel': {
      if (!isCart(cmd.cart)) return { ok: false, code: 'NO_OBJECT' };
      if (cartMovingF7(w, cmd.cart)) return { ok: false, code: 'BUSY' };
      const was = w.carts[cmd.cart].wheelBind;
      w.carts[cmd.cart].wheelBind = false;
      rearmErrF7(w, 'E16');
      flagF7(w, `wheels:${cmd.cart}`);
      emitF7(w, was ? 'WHEEL_FREED' : 'WHEEL_OK', 'INFO', { cart: cmd.cart });
      return { ok: true };
    }
    case 'centerCart': {
      if (!isCart(cmd.cart)) return { ok: false, code: 'NO_OBJECT' };
      if (cartMovingF7(w, cmd.cart)) return { ok: false, code: 'BUSY' };
      w.carts[cmd.cart].offsetMm = 0;
      rearmErrF7(w, 'E15');
      emitF7(w, 'CART_CENTERED', 'INFO', { cart: cmd.cart });
      return { ok: true };
    }
    case 'repairCart': {
      if (!isCart(cmd.cart)) return { ok: false, code: 'NO_OBJECT' };
      if (busyF7(w)) return { ok: false, code: 'BUSY' };
      if (!w.carts[cmd.cart].damaged) return { ok: true };
      w.carts[cmd.cart].damaged = false;
      rearmErrF7(w, 'E39');
      emitF7(w, 'CART_REPAIRED', 'INFO', { cart: cmd.cart });
      return { ok: true };
    }
    case 'setBumper':
      return setBumper(w, cmd.bumper);
    case 'flipMagnet':
      if (w.bumper.type !== 'magnet') return { ok: false, code: 'NO_MAGNET' };
      if (busyF7(w)) return { ok: false, code: 'BUSY' };
      w.bumper.polarityOk = !w.bumper.polarityOk;
      if (w.bumper.polarityOk) rearmErrF7(w, 'E07');
      emitF7(w, 'MAGNET_FLIPPED', 'INFO', { ok: w.bumper.polarityOk ? 1 : 0 });
      return { ok: true };
    case 'fixVelcro':
      if (w.bumper.type !== 'velcro') return { ok: false, code: 'NO_VELCRO' };
      if (busyF7(w)) return { ok: false, code: 'BUSY' };
      w.bumper.velcroFixed = !!cmd.on;
      if (cmd.on) rearmErrF7(w, 'E06');
      emitF7(w, cmd.on ? 'VELCRO_FIXED' : 'VELCRO_LOOSE', 'INFO');
      return { ok: true };
    case 'separateCarts':
      return separateCarts(w);
    case 'cock':
      return cock(w, cmd.cart, num(cmd.cm));
    case 'release':
      return release(w);
    case 'pushCart':
      return handOnCart(w, cmd.cart, num(cmd.v), 'push');
    case 'stopCart':
      return handOnCart(w, cmd.cart, 0, 'stop');
    // Fotopuertas, banderas y sensor
    case 'moveGate': {
      const id = cmd.id;
      if (id !== 'gateA' && id !== 'gateB') return { ok: false, code: 'NO_OBJECT' };
      if (busyF7(w)) return { ok: false, code: 'BUSY' };
      w.gates[id].s = Math.round(clamp(cmd.s, GEOF07.gate.min, GEOF07.gate.max) * 1e4) / 1e4;
      return { ok: true, value: w.gates[id].s };
    }
    case 'clampGates':
      w.track.gatesClamped = !!cmd.on;
      if (cmd.on) rearmErrF7(w, 'E28');
      emitF7(w, cmd.on ? 'GATES_CLAMPED' : 'GATES_LOOSE', 'INFO');
      return { ok: true };
    case 'setFlag': {
      if (!isCart(cmd.cart)) return { ok: false, code: 'NO_OBJECT' };
      if (busyF7(w)) return { ok: false, code: 'BUSY' };
      const cm = Math.round(num(cmd.cm));
      if (!GEOF07.cart.flags.includes(cm)) return { ok: false, code: 'NO_FLAG' };
      w.carts[cmd.cart].flagW = cm;
      emitF7(w, 'FLAG_SET', 'INFO', { cart: cmd.cart, cm });
      return { ok: true, value: cm };
    }
    case 'alignFlag':
      if (!isCart(cmd.cart)) return { ok: false, code: 'NO_OBJECT' };
      if (busyF7(w)) return { ok: false, code: 'BUSY' };
      w.carts[cmd.cart].flagYawDeg = 0;
      rearmErrF7(w, 'E04');
      emitF7(w, 'FLAG_ALIGNED', 'INFO', { cart: cmd.cart });
      return { ok: true };
    case 'connect':
      return connect(w, cmd.channel, !!cmd.on);
    case 'zeroSensor':
      return zeroSensor(w);
    case 'calibrateSensor':
      return calibrateSensor(w);
    case 'setRange': {
      const s = w.sensor;
      s.rangeIdx = Math.round(clamp(cmd.n, 0, w.params.force.ranges.length - 1));
      if (s.rangeIdx > 0) rearmErrF7(w, 'E22');
      return { ok: true, value: w.params.force.ranges[s.rangeIdx] };
    }
    case 'mountSensor': {
      const s = w.sensor;
      s.angleDeg = Math.round(clamp(cmd.angleDeg, 0, 90) * 10) / 10;
      if (s.angleDeg < 3) rearmErrF7(w, 'E26');
      return { ok: true, value: s.angleDeg };
    }
    case 'setRate': {
      const hz = Math.round(num(cmd.hz));
      if (!w.params.rates.includes(hz)) return { ok: false, code: 'BAD_RATE' };
      w.logger.rateHz = hz;
      if (hz >= 1000) rearmErrF7(w, 'E24');
      return { ok: true, value: hz };
    }
    case 'readGates':
      return readGates(w);
    case 'readForce':
      return readForce(w);
    // Masas adicionales
    case 'loadCart':
      return loadCart(w, String(cmd.id), cmd.cart, !!cmd.on);
    // Cámara y regla
    case 'readPosition':
      return readPosition(w, cmd.cart, num(cmd.viewDeg));
    case 'readMotion':
      return readMotion(w);
    // Cierre y seguridad
    case 'closeStation':
      return closeStation(w);
    case 'acknowledge':
      return acknowledge(w);
    case 'teacherStop':
      w.safety.stoppedByTeacher = !!cmd.on;
      emitF7(w, cmd.on ? 'TEACHER_STOP' : 'TEACHER_RESUME', cmd.on ? 'CRITICAL' : 'INFO');
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

function startWork(w: F07World): F07DispatchResult {
  const missing = (Object.keys(PPE_ERR) as PpeItem[]).filter((k) => !w.safety.ppe[k]);
  if (missing.length) {
    for (const k of missing) {
      bumpF7(w, `err:${PPE_ERR[k][0]}`);
      emitF7(w, PPE_ERR[k][1], 'CRITICAL');
    }
    return { ok: false, code: 'PPE_MISSING' };
  }
  w.ppe = true;
  flagF7(w, 'ppe');
  emitF7(w, 'PPE_OK', 'INFO');
  return { ok: true };
}

function inspect(w: F07World, target: string): F07DispatchResult {
  const o = w.objects[target];
  if (!o) return { ok: false, code: 'NO_OBJECT' };
  flagF7(w, `inspected:${target}`);
  const p = w.params;
  switch (o.kind) {
    case 'track':
      emitF7(w, 'INSPECT_TRACK', 'INFO', { cm: GEOF07.track.len * 100 });
      break;
    case 'endStop':
      emitF7(w, 'INSPECT_ENDS', w.track.endDampers ? 'INFO' : 'WARN');
      break;
    case 'launcher':
      emitF7(w, 'INSPECT_LAUNCHER', 'INFO', { max: LA.maxComp * 100 });
      break;
    case 'level':
      emitF7(w, 'INSPECT_LEVEL', 'INFO', { res: p.levelResDeg });
      break;
    case 'cart': {
      const c = w.carts[target as CartId];
      emitF7(w, c?.wheelBind || c?.damaged ? 'INSPECT_CART_BAD' : 'INSPECT_CART', c?.wheelBind || c?.damaged ? 'WARN' : 'INFO', {
        g: Math.round((target === 'cartA' ? p.m1 : p.m2) * 1000), flag: c?.flagW ?? 0, off: c?.offsetMm ?? 0,
      });
      break;
    }
    case 'cartMass':
      emitF7(w, 'INSPECT_CARTMASS', 'INFO', { g: Math.round((p.cartMassKg[target] ?? 0) * 1000) });
      break;
    case 'bumperKit': {
      const b = w.bumper;
      emitF7(w, b.type === 'magnet' && !b.polarityOk ? 'INSPECT_BUMPER_POLARITY' : 'INSPECT_BUMPER', b.type === 'magnet' && !b.polarityOk ? 'WARN' : 'INFO', { type: b.type });
      break;
    }
    case 'caliper':
      emitF7(w, 'INSPECT_CALIPER', 'INFO', { res: p.caliperResCm * 10 });
      break;
    case 'gate':
      emitF7(w, 'INSPECT_GATE', w.track.gatesClamped ? 'INFO' : 'WARN', { res: p.gate.resolutionS });
      break;
    case 'forceSensor':
      emitF7(w, 'INSPECT_FORCE', w.sensor.calibrated ? 'INFO' : 'WARN', { range: p.force.ranges[w.sensor.rangeIdx], res: p.force.resolutions[w.sensor.rangeIdx] });
      break;
    case 'logger':
      emitF7(w, 'INSPECT_LOGGER', w.logger.rateHz >= 1000 ? 'INFO' : 'WARN', { hz: w.logger.rateHz });
      break;
    case 'camera':
      emitF7(w, 'INSPECT_CAMERA', 'INFO', { hz: 20 });
      break;
    case 'posRuler':
      emitF7(w, 'INSPECT_RULER', 'INFO', { res: p.rulerResCm * 10 });
      break;
    case 'balance':
      emitF7(w, 'INSPECT_BALANCE', w.balance.tared ? 'INFO' : 'WARN', { res: p.balanceResolutionG });
      break;
    default:
      emitF7(w, 'INSPECTED', 'INFO', { target });
  }
  return { ok: true };
}

const SUPPORTS = new Set(['bench', 'rack', 'hand']);

function setPose(w: F07World, id: string, pose: Pose, support?: string): F07DispatchResult {
  const o = w.objects[id];
  if (!o) return { ok: false, code: 'NO_OBJECT' };
  if (!o.movable) return { ok: false, code: 'FIXED' };
  if (!pose || ![pose.x, pose.y, pose.z].every((v) => Number.isFinite(v))) return { ok: false, code: 'BAD_POSE' };
  if (support && support !== o.support && !SUPPORTS.has(support)) return { ok: false, code: 'NO_SEAT' };
  if (['cartA', 'cartB', 'balance', 'track'].includes(o.support)) return { ok: false, code: 'NO_SEAT' };
  o.pose = { x: pose.x, y: pose.y, z: pose.z, rotationRad: num(pose.rotationRad) };
  if (support) o.support = support;
  return { ok: true };
}

// ─────────────────────────── Lecturas estáticas ───────────────────────────

const PREFIX: Record<ReadingF7['kind'], string> = { mass: 'm', length: 'L', level: 'n', position: 'x', gates: 'v', force: 'j', motion: 'c' };

function addReading(w: F07World, r: Omit<ReadingF7, 'id' | 't' | 'tick' | 'trialId' | 'configVersion'> & { configVersion?: number; trial?: number }): ReadingF7 {
  const n = w.readingOrder.length + 1;
  const { trial, ...rest } = r;
  const reading: ReadingF7 = { ...rest, configVersion: r.configVersion ?? w.configVersion, id: `${PREFIX[r.kind]}${n}`, trialId: `T${trial ?? w.trial}`, t: w.timeS, tick: w.tick };
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
export function loadOnBalanceG(w: F07World, id: string): number {
  if (isCart(id)) return cartKgF7(w, id) * 1000;
  return (w.params.cartMassKg[id] ?? 0) * 1000;
}

const WEIGHABLE = new Set<string>(['cartA', 'cartB', ...CART_MASSES]);

function placeOnBalance(w: F07World, id: string): F07DispatchResult {
  if (!WEIGHABLE.has(id) || !w.objects[id]) return { ok: false, code: 'NO_OBJECT' };
  if (w.balance.on) return { ok: false, code: 'PAN_BUSY' };
  const o = w.objects[id];
  if (isCart(id)) {
    const c = w.carts[id];
    if (c.latched) {
      // Levantar un carro trabado: el émbolo se dispara de golpe contra la mano (F07-E40).
      const E = 0.5 * launcherK(w, id) * c.compression * c.compression;
      w.energy.dissipatedJ += E;
      c.latched = false;
      c.compression = 0;
      c.s = id === 'cartA' ? CART_A_START : CART_B_LAUNCH;
      bumpF7(w, 'launcherFired');
      errF7(w, 'E40', 'LAUNCHER_FIRED', 'CRITICAL', { cart: id });
      w.safety.block = { code: 'LAUNCHER_FIRED', since: w.timeS };
      return { ok: false, code: 'LAUNCHER_FIRED' };
    }
    if (busyF7(w) || cartMovingF7(w, id) || w.bumper.joined) return { ok: false, code: 'BUSY' };
    c.on = 'balance';
    c.v = 0;
  } else if (o.support !== 'rack') return { ok: false, code: 'NOT_ON_RACK' };
  o.support = 'balance';
  w.balance.on = id;
  w.balance.placedS = w.timeS;
  emitF7(w, 'ON_BALANCE', 'INFO', { id });
  return { ok: true };
}

/** Lugar libre para devolver un carro al riel: su lanzador (A) o el centro del riel (B), sin superponerse. */
function freeSpot(w: F07World, id: CartId): number {
  const o = w.carts[other(id)];
  if (id === 'cartA') return o.on === 'track' ? Math.min(CART_A_START, o.s - CONTACT_D - 0.01) : CART_A_START;
  const s0 = GEOF07.cartB0;
  return o.on === 'track' ? Math.max(s0, o.s + CONTACT_D + 0.01) : s0;
}

function removeFromBalance(w: F07World): F07DispatchResult {
  const id = w.balance.on;
  if (!id) return { ok: true };
  if (isCart(id)) {
    const c = w.carts[id];
    c.on = 'track';
    c.s = freeSpot(w, id);
    c.v = 0;
    w.objects[id].support = 'track';
  } else w.objects[id].support = 'rack';
  w.balance.on = null;
  return { ok: true };
}

function readBalance(w: F07World): F07DispatchResult {
  const p = w.params;
  const id = w.balance.on;
  const trueG = id ? loadOnBalanceG(w, id) : 0;
  const flags: string[] = [];
  let shown = trueG + w.balance.offsetG;
  if (id !== null && w.timeS - w.balance.placedS < 1.5) {
    flags.push('UNSTABLE');
    shown += gaussF7(w) * 4;
    errF7(w, 'E30', 'READ_BEFORE_STABLE', 'WARN', { inst: 'balance01' });
  }
  if (!w.balance.tared) {
    flags.push('NOT_ZEROED');
    errF7(w, 'E21', 'NOT_ZEROED', 'WARN', { inst: 'balance01' });
  }
  if (!id) flags.push('EMPTY');
  const value = quant(shown, p.balanceResolutionG);
  const load = id && isCart(id) ? Math.round(cartLoadKg(w, id) * 1000) : 0;
  const r = addReading(w, {
    kind: 'mass', instrumentId: 'balance01', value, unit: 'g', resolution: p.balanceResolutionG, uncertainty: p.uB.balanceG, sourceObjectIds: ['balance01', ...(id ? [id] : [])], qualityFlags: flags,
    trueValue: trueG, target: id ?? 'empty', setup: { load },
  });
  if (id && !flags.length) {
    flagF7(w, `weighed:${id}`);
    if (isCart(id)) w.weighed[id] = load;
  }
  emitF7(w, 'BALANCE_READ', 'INFO', { g: value });
  return { ok: true, id: r.id, value };
}

function measureFlag(w: F07World, cart: CartId): F07DispatchResult {
  if (!isCart(cart)) return { ok: false, code: 'NO_OBJECT' };
  const p = w.params;
  const c = w.carts[cart];
  if (cartMovingF7(w, cart)) return { ok: false, code: 'BUSY' };
  const value = quant(c.flagW + gaussF7(w) * 0.002 * p.noiseFactor, p.caliperResCm);
  w.flagMeasured[cart] = c.flagW;
  const r = addReading(w, {
    kind: 'length', instrumentId: 'caliper01', value, unit: 'cm', resolution: p.caliperResCm, uncertainty: p.uB.caliperCm, sourceObjectIds: ['caliper01', cart], qualityFlags: [],
    trueValue: c.flagW, target: cart, setup: { cart, flag: c.flagW },
  });
  flagF7(w, `flag:${cart}`);
  emitF7(w, 'FLAG_MEASURED', 'INFO', { cart, cm: value });
  return { ok: true, id: r.id, value };
}

function readLevel(w: F07World, viewDeg: number): F07DispatchResult {
  const p = w.params;
  const res = p.levelResDeg;
  const flags: string[] = [];
  let shown = tiltDegF7(w);
  if (Math.abs(viewDeg) > 8) {
    shown += Math.sign(viewDeg) * 2 * res;
    flags.push('PARALLAX');
    errF7(w, 'E29', 'SCALE_PARALLAX', 'WARN', { inst: 'level01' });
  }
  if (w.timeS - w.track.touchedS < 1) {
    flags.push('UNSTABLE');
    errF7(w, 'E30', 'READ_BEFORE_STABLE', 'WARN', { inst: 'level01' });
  }
  const value = quant(shown, res);
  const r = addReading(w, {
    kind: 'level', instrumentId: 'level01', value, unit: '°', resolution: res, uncertainty: p.uB.levelDeg, sourceObjectIds: ['level01', 'track01'], qualityFlags: flags,
    trueValue: tiltDegF7(w), target: 'track01', setup: { screw: w.track.screwDeg, tiltDeg: tiltDegF7(w) },
  });
  if (!flags.length && Math.abs(tiltDegF7(w)) <= 0.1) flagF7(w, 'leveled');
  emitF7(w, 'LEVEL_READ', flags.length ? 'WARN' : 'INFO', { deg: value });
  return { ok: true, id: r.id, value };
}

function readPosition(w: F07World, cart: CartId, viewDeg: number): F07DispatchResult {
  if (!isCart(cart)) return { ok: false, code: 'NO_OBJECT' };
  const c = w.carts[cart];
  if (c.on !== 'track') return { ok: false, code: 'CART_AWAY' };
  const p = w.params;
  const res = p.rulerResCm;
  const flags: string[] = [];
  let shown = c.s * 100;
  if (Math.abs(viewDeg) > 8) {
    shown += Math.sign(viewDeg) * 3 * res;
    flags.push('PARALLAX');
    errF7(w, 'E29', 'SCALE_PARALLAX', 'WARN', { inst: 'ruler01' });
  }
  if (Math.abs(c.v) > 1e-3) {
    flags.push('UNSTABLE');
    errF7(w, 'E30', 'READ_BEFORE_STABLE', 'WARN', { inst: 'ruler01' });
  }
  const value = quant(shown, res);
  const r = addReading(w, {
    kind: 'position', instrumentId: 'ruler01', value, unit: 'cm', resolution: res, uncertainty: p.uB.rulerCm, sourceObjectIds: ['ruler01', cart], qualityFlags: flags,
    trueValue: c.s * 100, target: cart, setup: { cart, load: Math.round(cartLoadKg(w, cart) * 1000) },
  });
  emitF7(w, 'POSITION_READ', flags.length ? 'WARN' : 'INFO', { cart, cm: value });
  return { ok: true, id: r.id, value };
}

// ─────────────────────────── Carros, paragolpes y lanzadores ───────────────────────────

function placeCart(w: F07World, cart: CartId, s: number): F07DispatchResult {
  if (!isCart(cart)) return { ok: false, code: 'NO_OBJECT' };
  const c = w.carts[cart];
  if (c.on !== 'track') return { ok: false, code: 'CART_AWAY' };
  if (!Number.isFinite(s)) return { ok: false, code: 'BAD_POSE' };
  if (busyF7(w) || cartMovingF7(w, cart) || c.latched || w.bumper.joined) return { ok: false, code: 'BUSY' };
  const o = w.carts[other(cart)];
  let x = clamp(s, CART_MIN_S, CART_MAX_S);
  // El otro carro es sólido: la mano lo deja como mucho tocándolo (paragolpes contra paragolpes).
  if (o.on === 'track') x = cart === 'cartA' ? Math.min(x, o.s - CONTACT_D) : Math.max(x, o.s + CONTACT_D);
  if (x < CART_MIN_S - 1e-9 || x > CART_MAX_S + 1e-9) return { ok: false, code: 'NO_ROOM' };
  c.s = r6(x);
  c.v = 0;
  return { ok: true, value: c.s };
}

function setBumper(w: F07World, b: BumperType): F07DispatchResult {
  if (!['spring', 'magnet', 'velcro'].includes(b)) return { ok: false, code: 'UNKNOWN' };
  if (busyF7(w) || cartMovingF7(w)) return { ok: false, code: 'BUSY' };
  if (w.bumper.joined) return { ok: false, code: 'JOINED' };
  if (w.bumper.type === b) return { ok: true };
  w.bumper.type = b;
  if (b !== 'velcro') w.bumper.velcroFixed = false;
  emitF7(w, 'BUMPER_SET', 'INFO', { type: b });
  return { ok: true };
}

function separateCarts(w: F07World): F07DispatchResult {
  if (!w.bumper.joined) return { ok: true };
  if (cartMovingF7(w)) return { ok: false, code: 'BUSY' };
  w.bumper.joined = false;
  const A = w.carts.cartA;
  const B = w.carts.cartB;
  // Se despegan a mano y quedan separados 2 cm (dentro del riel).
  B.s = Math.min(CART_MAX_S, A.s + CONTACT_D + 0.02);
  A.s = Math.min(A.s, B.s - CONTACT_D - 0.02);
  if (w.run && !w.run.done) w.run.done = true;
  emitF7(w, 'CARTS_SEPARATED', 'INFO');
  return { ok: true };
}

function cock(w: F07World, cart: CartId, cm: number): F07DispatchResult {
  if (!isCart(cart)) return { ok: false, code: 'NO_OBJECT' };
  const c = w.carts[cart];
  if (c.on !== 'track') return { ok: false, code: 'CART_AWAY' };
  if (busyF7(w) || cartMovingF7(w) || w.bumper.joined) return { ok: false, code: 'BUSY' };
  // El émbolo tiene muescas cada 1 cm, hasta 6 cm.
  const x = Math.round(clamp(cm, 0, LA.maxComp * 100)) / 100;
  const o = w.carts[other(cart)];
  const s = cart === 'cartA' ? CART_A_START - x : CART_B_LAUNCH + x;
  const home = cart === 'cartA' ? CART_A_START : CART_B_LAUNCH;
  // Para llegar al lanzador el carro no puede pasar por encima del otro.
  if (o.on === 'track' && (cart === 'cartA' ? o.s - CONTACT_D < home - 1e-6 : o.s + CONTACT_D > home + 1e-6)) return { ok: false, code: 'CART_IN_WAY' };
  c.s = r6(s);
  c.v = 0;
  c.compression = x;
  c.latched = x > 0;
  emitF7(w, 'CART_COCKED', 'INFO', { cart, cm: Math.round(x * 100) });
  return { ok: true, value: x };
}

function runSetup(w: F07World): RunSetup {
  const s = w.sensor;
  const A = w.carts.cartA;
  const B = w.carts.cartB;
  const t = w.track;
  const off = Math.abs(A.offsetMm - B.offsetMm);
  return {
    mA: r6(cartKgF7(w, 'cartA')), mB: r6(cartKgF7(w, 'cartB')), loadA: Math.round(cartLoadKg(w, 'cartA') * 1000), loadB: Math.round(cartLoadKg(w, 'cartB') * 1000),
    bumper: w.bumper.type, polarityOk: w.bumper.polarityOk, velcroFixed: w.bumper.velcroFixed, tiltDeg: Math.round(tiltDegF7(w) * 100) / 100,
    gA: w.gates.gateA.s, gB: w.gates.gateB.s, flagA: A.flagW, flagB: B.flagW, cockA: A.latched ? A.compression : 0, cockB: B.latched ? B.compression : 0,
    rateHz: w.logger.rateHz, sensor: { connected: s.connected, zeroed: s.zeroed, calibrated: s.calibrated, angleDeg: s.angleDeg, range: s.rangeIdx },
    gatesConnected: w.logger.gatesConnected, cameraOn: w.logger.cameraOn, gatesClamped: t.gatesClamped, endDampers: t.endDampers, brakes: A.brake || B.brake,
    wheelBind: A.wheelBind || B.wheelBind, oblique: off > 3, overlap: gapF7(w) < 0.002, occluded: GATES.some((g) => inBeam(w, g, A) || inBeam(w, g, B)),
    damaged: A.damaged || B.damaged, frictionN: w.params.frictionN,
  };
}

const RUN_ERRS = ['E01', 'E02', 'E03', 'E04', 'E05', 'E06', 'E07', 'E08', 'E09', 'E10', 'E14', 'E15', 'E16', 'E18', 'E19', 'E21', 'E22', 'E23', 'E24', 'E25', 'E26', 'E27', 'E28', 'E32', 'E39'];

function release(w: F07World): F07DispatchResult {
  const latched = CARTS.filter((id) => w.carts[id].latched);
  if (!latched.length) return { ok: false, code: 'NOT_LATCHED' };
  if (busyF7(w)) return { ok: false, code: 'BUSY' };
  for (const e of RUN_ERRS) rearmErrF7(w, e);
  w.trial++;
  const setup = runSetup(w);
  for (const id of latched) {
    const c = w.carts[id];
    // El émbolo devuelve su energía al carro: ½ k x² = ½ m v² (en el modo realista pierde un 2 % en el tope).
    const m = cartKgF7(w, id);
    const eta = w.params.scientificMode === 'REALISTIC' ? 0.98 : 1;
    const v = c.compression * Math.sqrt((launcherK(w, id) * eta) / m);
    w.energy.dissipatedJ += 0.5 * launcherK(w, id) * c.compression * c.compression * (1 - eta);
    c.s = id === 'cartA' ? CART_A_START : CART_B_LAUNCH;
    c.v = id === 'cartA' ? v : -v;
    c.latched = false;
    c.compression = 0;
  }
  const rec: RunRecord = {
    id: w.trial, startS: w.timeS, force: [], track: [], crossings: [], contactT: null, contactEndT: null, pBefore: null, pAfter: null, vBefore: null, vAfter: null, trueJ: 0, extJ: 0,
    stuck: false, endHitT: null, stopT: null, massChangedT: null, configChangedT: null, pushedT: null, handInGateT: null, slipT: null, targetMoving: false, gateInZone: false,
    postCrossed: { cartA: false, cartB: false }, done: false, nextT: 0, nextTrackT: 0, stillS: 0, setup, configVersion: w.configVersion,
  };
  const warn = (on: boolean, code: string, ev: string) => on && errF7(w, code, ev, 'WARN');
  warn(Math.abs(setup.tiltDeg) > 0.1, 'E01', 'TRACK_INCLINED');
  warn(setup.bumper === 'velcro' && !setup.velcroFixed, 'E06', 'VELCRO_LOOSE');
  warn(setup.bumper === 'magnet' && !setup.polarityOk, 'E07', 'MAGNET_POLARITY');
  warn(setup.overlap, 'E08', 'CARTS_OVERLAP');
  warn(setup.brakes, 'E10', 'BRAKE_LEFT_ON');
  warn(setup.oblique, 'E15', 'OBLIQUE_COLLISION');
  warn(setup.wheelBind, 'E16', 'WHEEL_BIND');
  warn(setup.occluded, 'E25', 'BEAM_OCCLUDED');
  w.run = rec;
  w.runs.push(rec);
  for (const old of w.runs.slice(0, -4)) {
    old.force = [];
    old.track = [];
  }
  if (w.runs.length > 16) w.runs.splice(0, w.runs.length - 16);
  emitF7(w, 'CARTS_RELEASED', 'INFO', { trial: w.trial });
  return { ok: true, value: w.trial };
}

/** La mano empuja o detiene un carro. Durante un ensayo es un impulso externo (E09); con la bandera en el haz, E19. */
function handOnCart(w: F07World, cart: CartId, v: number, kind: 'push' | 'stop'): F07DispatchResult {
  if (!isCart(cart)) return { ok: false, code: 'NO_OBJECT' };
  const c = w.carts[cart];
  if (c.on !== 'track' || c.latched) return { ok: false, code: 'CART_AWAY' };
  const run = runningRunF7(w) ? w.run : null;
  const vv = clamp(v, -2.5, 2.5);
  if (run && GATES.some((g) => inBeam(w, g, c))) {
    run.handInGateT ??= r4(w.timeS - run.startS);
    errF7(w, 'E19', 'HAND_IN_GATE', 'WARN', { cart });
  }
  if (run && kind === 'push') {
    run.pushedT ??= r4(w.timeS - run.startS);
    errF7(w, 'E09', 'PUSHED_DURING_RUN', 'WARN', { cart });
  }
  const before = c.v;
  if (w.bumper.joined) {
    w.carts.cartA.v = vv;
    w.carts.cartB.v = vv;
  } else c.v = vv;
  if (!run && kind === 'push' && Math.abs(vv) > 0) emitF7(w, 'CART_PUSHED', 'INFO', { cart });
  if (kind === 'stop' && Math.abs(before) > 1e-4) emitF7(w, 'CART_STOPPED', 'INFO', { cart });
  return { ok: true };
}

function loadCart(w: F07World, id: string, cart: CartId, on: boolean): F07DispatchResult {
  const o = w.objects[id];
  if (!o || o.kind !== 'cartMass' || !isCart(cart)) return { ok: false, code: 'NO_OBJECT' };
  if (o.support === 'balance') return { ok: false, code: 'ON_BALANCE' };
  const c = w.carts[cart];
  if (c.on === 'balance') return { ok: false, code: 'CART_AWAY' };
  if (on && o.support !== 'rack' && o.support !== cart) return { ok: false, code: 'ON_OTHER_CART' };
  if ((on && o.support === cart) || (!on && o.support !== cart)) return { ok: true };
  const moving = runningRunF7(w) && cartMovingF7(w, cart);
  if (on && moving) {
    // Cargar un carro en marcha: la pesa se suma en un choque inelástico (Σp se conserva, se pierde energía, F07-E18).
    const m0 = cartKgF7(w, cart);
    const dm = w.params.cartMassKg[id] ?? 0;
    const K0 = 0.5 * m0 * c.v * c.v;
    const v = (m0 * c.v) / (m0 + dm);
    o.support = cart;
    if (w.bumper.joined) {
      const mt = cartKgF7(w, 'cartA') + cartKgF7(w, 'cartB');
      w.carts.cartA.v = w.carts.cartB.v = ((mt - dm) * c.v) / mt;
    } else c.v = v;
    w.energy.dissipatedJ += K0 - 0.5 * (m0 + dm) * c.v * c.v;
  } else o.support = on ? cart : 'rack';
  if (moving && w.run && w.run.massChangedT === null) {
    w.run.massChangedT = r4(w.timeS - w.run.startS);
    errF7(w, 'E18', 'MASS_CHANGED_IN_MOTION', 'WARN', { id });
  }
  emitF7(w, 'CART_LOADED', moving ? 'WARN' : 'INFO', { id, cart, on: on ? 1 : 0 });
  return { ok: true };
}

// ─────────────────────────── Sensores ───────────────────────────

function connect(w: F07World, ch: Channel, on: boolean): F07DispatchResult {
  if (ch === 'force') w.sensor.connected = on;
  else if (ch === 'gates') w.logger.gatesConnected = on;
  else if (ch === 'camera') w.logger.cameraOn = on;
  else return { ok: false, code: 'UNKNOWN' };
  if (on) {
    rearmErrF7(w, 'E23');
    flagF7(w, `connected:${ch}`);
  }
  emitF7(w, on ? 'CHANNEL_ON' : 'CHANNEL_OFF', 'INFO', { ch });
  return { ok: true };
}

function zeroSensor(w: F07World): F07DispatchResult {
  const s = w.sensor;
  if (!s.connected) return { ok: false, code: 'NOT_CONNECTED' };
  const f = contactForce(w).F;
  s.offset = -f * Math.cos(s.angleDeg * DEG) * s.scale;
  s.zeroed = Math.abs(f) < 0.01;
  if (s.zeroed) {
    rearmErrF7(w, 'E21');
    flagF7(w, 'zeroed');
  }
  emitF7(w, s.zeroed ? 'SENSOR_ZEROED' : 'SENSOR_ZEROED_LOADED', s.zeroed ? 'INFO' : 'WARN');
  return { ok: true };
}

function calibrateSensor(w: F07World): F07DispatchResult {
  const s = w.sensor;
  if (!s.connected) return { ok: false, code: 'NOT_CONNECTED' };
  if (contactForce(w).F > 0.01) return { ok: false, code: 'UNLOAD_FIRST' };
  s.scale = 1;
  s.calibrated = true;
  rearmErrF7(w, 'E27');
  flagF7(w, 'calibrated');
  emitF7(w, 'SENSOR_CALIBRATED', 'INFO', { n: 5 });
  return { ok: true };
}

const FLAG_ERR: Record<string, [string, string]> = {
  INCLINED: ['E01', 'TRACK_INCLINED'],
  UNWEIGHED: ['E02', 'MASS_NOT_WEIGHED'],
  TARGET_MOVING: ['E03', 'TARGET_MOVING'],
  FLAG_WIDTH: ['E04', 'FLAG_WIDTH'],
  FLAG_TILT: ['E04', 'FLAG_WIDTH'],
  GATE_IN_ZONE: ['E05', 'GATE_IN_COLLISION_ZONE'],
  VELCRO_LOOSE: ['E06', 'VELCRO_LOOSE'],
  MAGNET_POLARITY: ['E07', 'MAGNET_POLARITY'],
  OVERLAP: ['E08', 'CARTS_OVERLAP'],
  PUSHED: ['E09', 'PUSHED_DURING_RUN'],
  BRAKE_ON: ['E10', 'BRAKE_LEFT_ON'],
  END_HIT: ['E14', 'END_STOP_HIT'],
  OBLIQUE: ['E15', 'OBLIQUE_COLLISION'],
  WHEEL_BIND: ['E16', 'WHEEL_BIND'],
  MASS_CHANGED: ['E18', 'MASS_CHANGED_IN_MOTION'],
  HAND_IN_GATE: ['E19', 'HAND_IN_GATE'],
  NOT_ZEROED: ['E21', 'NOT_ZEROED'],
  CLIPPED: ['E22', 'SENSOR_SATURATED'],
  UNPLUGGED: ['E23', 'NO_SIGNAL'],
  LOW_RATE: ['E24', 'LOW_RATE'],
  OCCLUDED: ['E25', 'BEAM_OCCLUDED'],
  TILTED_SENSOR: ['E26', 'SENSOR_TILTED'],
  UNCALIBRATED: ['E27', 'SENSOR_UNCALIBRATED'],
  GATE_SLIP: ['E28', 'GATE_SLIPPED'],
  CONFIG_CHANGED: ['E32', 'CONFIG_DURING_RUN'],
  POST_IMPACT: ['E39', 'READ_AFTER_IMPACT'],
};

/** Banderas de calidad comunes a todas las lecturas de un ensayo. */
function runFlags(rec: RunRecord, out: string[]) {
  const su = rec.setup;
  if (Math.abs(su.tiltDeg) > 0.1) out.push('INCLINED');
  if (su.bumper === 'velcro' && !su.velcroFixed) out.push('VELCRO_LOOSE');
  if (su.bumper === 'magnet' && !su.polarityOk) out.push('MAGNET_POLARITY');
  if (su.overlap) out.push('OVERLAP');
  if (su.brakes) out.push('BRAKE_ON');
  if (su.oblique) out.push('OBLIQUE');
  if (su.wheelBind) out.push('WHEEL_BIND');
  if (su.damaged) out.push('POST_IMPACT');
  if (rec.targetMoving) out.push('TARGET_MOVING');
  if (rec.gateInZone) out.push('GATE_IN_ZONE');
  if (rec.pushedT !== null) out.push('PUSHED');
  if (rec.handInGateT !== null) out.push('HAND_IN_GATE');
  if (rec.massChangedT !== null) out.push('MASS_CHANGED');
  if (rec.configChangedT !== null) out.push('CONFIG_CHANGED');
  if (rec.endHitT !== null) out.push('END_HIT');
}

const raiseFlags = (w: F07World, qf: string[], inst: string) => {
  for (const f of qf) if (FLAG_ERR[f]) errF7(w, FLAG_ERR[f][0], FLAG_ERR[f][1], 'WARN', { inst });
};

function readGates(w: F07World): F07DispatchResult {
  const rec = w.runs[w.runs.length - 1];
  if (!rec) return { ok: false, code: 'NO_RUN' };
  if (!rec.done) return { ok: false, code: 'BUSY' };
  const p = w.params;
  const su = rec.setup;
  const flags: string[] = [];
  runFlags(rec, flags);
  if (!su.gatesConnected) flags.push('UNPLUGGED');
  if (su.occluded) flags.push('OCCLUDED');
  if (rec.slipT !== null) flags.push('GATE_SLIP');
  if (su.loadA !== w.weighed.cartA || su.loadB !== w.weighed.cartB) flags.push('UNWEIGHED');
  if (su.flagA !== su.flagB && (w.flagMeasured.cartA !== su.flagA || w.flagMeasured.cartB !== su.flagB)) flags.push('FLAG_WIDTH');
  if (CARTS.some((id) => w.carts[id].flagYawDeg > 2)) flags.push('FLAG_TILT');
  if (rec.contactT === null) flags.push('NO_COLLISION');
  const crossings = rec.crossings
    .filter((c) => c[3] !== null)
    .map((c) => ({ g: c[0], cart: c[1], t: r4(c[2]), dt: su.gatesConnected ? timerIndication((c[3] as number) - c[2], p.gate, gaussF7(w)) : null, dir: c[4] }));
  const tc = rec.contactT;
  const before = tc === null ? crossings : crossings.filter((c) => c.t < tc);
  const after = tc === null ? [] : crossings.filter((c) => c.t > tc);
  if (!before.length || !after.length) flags.push('NO_PASS');
  const qf = [...new Set(flags)];
  raiseFlags(w, qf, 'gateA');
  const value = before[0]?.dt ?? NaN;
  const vb = rec.vBefore;
  const va = rec.vAfter;
  const r = addReading(w, {
    kind: 'gates', instrumentId: 'gateA', value, unit: 's', resolution: p.gate.resolutionS, uncertainty: p.uB.gateS, sourceObjectIds: ['gateA', 'gateB', 'cartA', 'cartB', 'logger01'],
    qualityFlags: qf, trueValue: vb ? vb[0] : NaN, target: 'carts', trial: rec.id, configVersion: rec.configVersion,
    gates: { crossings, tc: fin(tc), stuck: rec.stuck, restAfter: CARTS.filter((id) => tc !== null && !after.some((c) => c.cart === id) && Math.abs(w.carts[id].v) < 0.005), trueV: { A1: fin(vb?.[0]), B1: fin(vb?.[1]), A2: fin(va?.[0]), B2: fin(va?.[1]) } },
    setup: { ...su },
  });
  emitF7(w, 'GATES_READ', qf.length ? 'WARN' : 'INFO', { n: crossings.length });
  return { ok: true, id: r.id, value };
}

function readForce(w: F07World): F07DispatchResult {
  const rec = w.runs[w.runs.length - 1];
  if (!rec) return { ok: false, code: 'NO_RUN' };
  if (rec.contactT === null) return { ok: false, code: 'NO_DATA' };
  if (rec.contactEndT === null && !rec.done) return { ok: false, code: 'BUSY' };
  const p = w.params;
  const su = rec.setup;
  const s = su.sensor;
  const flags: string[] = [];
  runFlags(rec, flags);
  if (!s.connected) flags.push('UNPLUGGED');
  if (!s.zeroed) flags.push('NOT_ZEROED');
  if (!s.calibrated) flags.push('UNCALIBRATED');
  if (s.angleDeg >= 3) flags.push('TILTED_SENSOR');
  const t0 = rec.contactT;
  const t1 = rec.contactEndT ?? t0;
  const inContact = rec.force.filter((x) => x[0] >= t0 - 1e-9 && x[0] <= t1 + 1e-9);
  if (rec.force.some((x) => Math.abs(x[1]) >= p.force.ranges[s.range] - 1e-9)) flags.push('CLIPPED');
  if (inContact.length < 20) flags.push('LOW_RATE');
  const qf = [...new Set(flags.filter((f) => f !== 'END_HIT'))];
  raiseFlags(w, qf, 'force01');
  // Impulso: área bajo F–t de toda la ventana registrada (con el corrimiento de un sensor sin cero incluido).
  const S = rec.force;
  let J = 0;
  for (let i = 0; i + 1 < S.length; i++) J += ((S[i][1] + S[i + 1][1]) / 2) * (S[i + 1][0] - S[i][0]);
  const ok = s.connected && S.length >= 2;
  const value = ok ? Math.round(J * 1e5) / 1e5 : NaN;
  const Fmax = ok ? Math.max(...S.map((x) => Math.abs(x[1]))) : NaN;
  const r = addReading(w, {
    kind: 'force', instrumentId: 'force01', value, unit: 'N·s', resolution: 1e-5, uncertainty: p.uB.forceN * 0.01, sourceObjectIds: ['force01', 'logger01', 'cartB'], qualityFlags: qf,
    trueValue: rec.trueJ, target: 'cartB', trial: rec.id, configVersion: rec.configVersion,
    force: { J: fin(value), Fmax: fin(Number.isFinite(Fmax) ? Math.round(Fmax * 1e4) / 1e4 : NaN), tContact: fin(rec.contactEndT !== null ? r4(t1 - t0) : NaN), n: inContact.length, trueJ: fin(rec.trueJ) },
    setup: { ...su },
  });
  emitF7(w, 'FORCE_READ', qf.length ? 'WARN' : 'INFO', { J: value, n: inContact.length });
  return { ok: true, id: r.id, value };
}

/** Ajuste lineal y = a + b t (pendiente b). */
function slope(ts: number[], ys: number[]): number {
  const n = ts.length;
  if (n < 2) return NaN;
  const mt = ts.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, x) => s + x, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (ts[i] - mt) * (ys[i] - my);
    sxx += (ts[i] - mt) ** 2;
  }
  return sxx > 0 ? sxy / sxx : NaN;
}

function readMotion(w: F07World): F07DispatchResult {
  const rec = w.runs[w.runs.length - 1];
  if (!rec) return { ok: false, code: 'NO_RUN' };
  if (!rec.done) return { ok: false, code: 'BUSY' };
  const p = w.params;
  const su = rec.setup;
  const flags: string[] = [];
  runFlags(rec, flags);
  if (!su.cameraOn) flags.push('UNPLUGGED');
  if (rec.contactT === null) flags.push('NO_COLLISION');
  const qf = [...new Set(flags.filter((f) => f !== 'END_HIT'))];
  raiseFlags(w, qf, 'camera01');
  const tc = rec.contactT ?? Infinity;
  const te = rec.contactEndT ?? tc;
  const tEnd = Math.min(rec.endHitT ?? Infinity, rec.stopT ?? Infinity);
  // La cámara ve cada carro con 1 mm de resolución: velocidad = pendiente de x(t) antes y después del choque.
  const xs = rec.track.map((x) => [x[0], quant(x[1] + gaussF7(w) * 0.0005 * p.noiseFactor, 0.001), quant(x[2] + gaussF7(w) * 0.0005 * p.noiseFactor, 0.001)] as const);
  const pre = xs.filter((x) => x[0] > 0.05 && x[0] < tc - 0.02);
  const post = xs.filter((x) => x[0] > te + 0.02 && x[0] < tEnd - 0.02);
  const fit = (rows: typeof xs, k: 1 | 2) => (su.cameraOn && rows.length >= 3 ? Math.round(slope(rows.map((x) => x[0]), rows.map((x) => x[k])) * 1e4) / 1e4 : NaN);
  const vA1 = fit(pre, 1);
  const trueV = rec.pBefore !== null ? rec.pBefore / (su.mA + su.mB) : NaN;
  const r = addReading(w, {
    kind: 'motion', instrumentId: 'camera01', value: vA1, unit: 'm/s', resolution: 1e-4, uncertainty: p.uB.cameraMs, sourceObjectIds: ['camera01', 'cartA', 'cartB'], qualityFlags: qf,
    trueValue: trueV, target: 'carts', trial: rec.id, configVersion: rec.configVersion,
    motion: { vA1: fin(vA1), vB1: fin(fit(pre, 2)), vA2: fin(fit(post, 1)), vB2: fin(fit(post, 2)), n: xs.length, trueVcm: fin(trueV) },
    setup: { ...su },
  });
  emitF7(w, 'MOTION_READ', qf.length ? 'WARN' : 'INFO', { v: vA1 });
  return { ok: true, id: r.id, value: vA1 };
}

// ─────────────────────────── Cierre y bloqueos ───────────────────────────

function closeStation(w: F07World): F07DispatchResult {
  if (CARTS.some((id) => w.carts[id].latched)) return { ok: false, code: 'LATCHED' };
  if (busyF7(w) || cartMovingF7(w)) return { ok: false, code: 'BUSY' };
  if (w.bumper.joined) return { ok: false, code: 'JOINED' };
  if (CARTS.some((id) => w.carts[id].on !== 'track' || !w.carts[id].brake)) return { ok: false, code: 'CARTS_LOOSE' };
  if (CART_MASSES.some((m) => w.objects[m].support !== 'rack')) return { ok: false, code: 'MASSES_OUT' };
  if (w.balance.on) return { ok: false, code: 'PAN_BUSY' };
  flagF7(w, 'stationClosed');
  emitF7(w, 'STATION_CLOSED', 'INFO');
  return { ok: true };
}

function acknowledge(w: F07World): F07DispatchResult {
  const b = w.safety.block;
  if (!b) return { ok: true };
  const atRest = !cartMovingF7(w) && CARTS.every((id) => !w.carts[id].latched);
  if (b.code === 'LAUNCHER_FIRED' && !atRest) return { ok: false, code: 'SECURE_FIRST' };
  if (b.code === 'CART_CRASH' && (!atRest || !w.track.endDampers)) return { ok: false, code: 'SECURE_FIRST' };
  w.safety.block = null;
  emitF7(w, 'STATION_RESET', 'INFO', { code: b.code });
  return { ok: true };
}

// ─────────────────────────── Paso: carros ───────────────────────────

/** Roce de Coulomb total sobre un carro (N): riel, rodadura, rueda trabada, golpe, freno y guía lateral. */
function frictionOf(w: F07World, id: CartId): number {
  const p = w.params;
  const c = w.carts[id];
  return p.frictionN + p.rollN + (c.wheelBind ? p.bindN : 0) + (c.damaged ? p.damagedRollN : 0) + (c.brake ? 1.5 : 0) + (id === 'cartB' && w.scenarios.includes(SF7.SIDE_LIMIT) ? p.sideRubN : 0);
}

/** Velocidad nueva con roce de Coulomb (el roce no invierte el movimiento: lo detiene y sigue con lo que queda). */
function coulomb(v0: number, F: number, f: number, m: number, h: number): number {
  if (Math.abs(v0) < 1e-9) return Math.abs(F) <= f ? 0 : ((F - sgn(F) * f) / m) * h;
  const a = (F - sgn(v0) * f) / m;
  const v1 = v0 + a * h;
  if (f === 0 || sgn(v1) === sgn(v0)) return v1;
  // Pasó por cero dentro del paso: desde ahí el roce cambia de sentido (o lo deja quieto).
  const rest = h - Math.abs(v0 / a);
  return Math.abs(F) <= f ? 0 : ((F - sgn(F) * f) / m) * rest;
}

/** ¿Los paragolpes (o el campo de los imanes) siguen en contacto? */
const touching = (w: F07World) => {
  const m = contactModel(w);
  return !!m && (m.delta > 0 || m.deltaM > 0);
};

function stepCarts(w: F07World, t0: number, h: number) {
  const A = w.carts.cartA;
  const B = w.carts.cartB;
  const run = runningRunF7(w) ? w.run : null;
  const both = A.on === 'track' && B.on === 'track';
  const range = w.bumper.type === 'magnet' && w.bumper.polarityOk ? w.params.magnetRangeM : 0;
  const near = both && !w.bumper.joined && gapF7(w) < range + 0.005 + Math.abs(A.v - B.v) * h;
  const n = near ? MICRO : 1;
  const hm = h / n;
  for (let k = 0; k < n; k++) microStep(w, run, t0 + k * hm, hm);
  if (run) finishCheck(w, run, t0 + h);
}

function microStep(w: F07World, run: RunRecord | null, t0: number, h: number) {
  const p = w.params;
  const A = w.carts.cartA;
  const B = w.carts.cartB;
  const g = p.g * Math.sin(tiltDegF7(w) * DEG);
  const sA0 = A.s;
  const sB0 = B.s;
  const mA = cartKgF7(w, 'cartA');
  const mB = cartKgF7(w, 'cartB');
  const P0 = totalMomentum(w);
  const model = contactModel(w);
  const { F, Fel } = contactForce(w, model);
  const delta0 = model ? model.delta + model.deltaM : 0;
  const rate0 = A.v - B.v;
  const v0: [number, number] = [A.v, B.v];
  let Fend = 0;
  if (w.bumper.joined && A.on === 'track' && B.on === 'track') {
    // Carros unidos: un solo cuerpo.
    const m = mA + mB;
    const v1 = coulomb(A.v, m * g, frictionOf(w, 'cartA') + frictionOf(w, 'cartB'), m, h);
    const ds = ((A.v + v1) / 2) * h;
    w.energy.dissipatedJ += Math.max(0, -((m * (v1 - A.v)) / h - m * g) * ds);
    A.v = B.v = v1;
    A.s += ds;
    B.s += ds;
  } else {
    // Verlet de velocidades (medio impulso, deriva, medio impulso): el error de energía del choque es de 2.º orden.
    // Fricción lateral de las pestañas en un choque oblicuo: proporcional a la fuerza de contacto (externa).
    const obl = Math.min(1, Math.abs(A.offsetMm - B.offsetMm) / 10);
    const kick = (Fc: number, hh: number) => {
      const side = obl > 0.3 ? p.sideMu * Fc * obl : 0;
      for (const [id, c, m, Fi] of [['cartA', A, mA, -Fc], ['cartB', B, mB, Fc]] as const) {
        if (c.on !== 'track' || c.latched) continue;
        const Fg = m * g;
        const v1 = coulomb(c.v, Fg + Fi, frictionOf(w, id) + side, m, hh);
        // Trabajo del roce: el impulso que quitó por el desplazamiento medio del medio paso.
        const fr = m * (v1 - c.v) - (Fg + Fi) * hh;
        w.energy.dissipatedJ += Math.max(0, -fr * ((c.v + v1) / 2));
        c.v = v1;
      }
    };
    kick(F, h / 2);
    for (const c of [A, B]) if (c.on === 'track' && !c.latched) c.s += c.v * h;
    const m1 = contactModel(w);
    const f1 = contactForce(w, m1);
    kick(f1.F, h / 2);
    // Amortiguación del paragolpes: lo que la fuerza se aparta de la elástica, por la compresión que cambió.
    if (model || m1) {
      const delta1 = m1 ? m1.delta + m1.deltaM : 0;
      w.energy.dissipatedJ += ((F - Fel + f1.F - f1.Fel) / 2) * (delta1 - delta0);
    }
    Fend = f1.F;
  }
  if (run) {
    const tRel = t0 + h - run.startS;
    if (F > 0 || Fend > 0) {
      if (run.contactT === null) contactStart(w, run, r6(t0 - run.startS), P0, v0);
      run.trueJ += ((F + Fend) / 2) * h;
      run.extJ += totalMomentum(w) - P0;
    }
    // Velcro o imanes atrayéndose: se pegan en la compresión máxima (δ̇ cambia de signo).
    if (model?.sticks && (F > 0 || Fend > 0) && rate0 > 0 && A.v - B.v <= 0) join(w);
    if (run.contactT !== null && run.contactEndT === null && (w.bumper.joined || !touching(w))) contactEnd(w, run, r6(tRel));
    sampleForce(w, run, tRel);
    recordGates(w, run, 'cartA', sA0, A.s, t0, h);
    recordGates(w, run, 'cartB', sB0, B.s, t0, h);
  }
  ends(w, run, t0 + h);
  w.momentum.externalNs += totalMomentum(w) - P0;
}

function join(w: F07World) {
  const A = w.carts.cartA;
  const B = w.carts.cartB;
  const mA = cartKgF7(w, 'cartA');
  const mB = cartKgF7(w, 'cartB');
  const E0 = mechanicalEnergyJ(w);
  const v = (mA * A.v + mB * B.v) / (mA + mB);
  A.v = B.v = v;
  w.bumper.joined = true;
  // La compresión que queda trabada por el velcro y la diferencia de cinética se disipan.
  w.energy.dissipatedJ += E0 - mechanicalEnergyJ(w);
  if (w.run) w.run.stuck = true;
  emitF7(w, 'CARTS_JOINED', 'INFO');
}

function contactStart(w: F07World, run: RunRecord, t: number, P0: number, v: [number, number]) {
  run.contactT = t;
  run.pBefore = r6(P0);
  run.vBefore = [r6(v[0]), r6(v[1])];
  const launched = (id: CartId) => (id === 'cartA' ? run.setup.cockA : run.setup.cockB) > 0;
  const crossedBefore = (id: CartId) => run.crossings.some((c) => c[1] === id && c[3] !== null);
  for (const id of CARTS) {
    const moving = Math.abs(v[id === 'cartA' ? 0 : 1]) > 0.01;
    if (!moving || crossedBefore(id)) continue;
    if (launched(id)) run.gateInZone = true;
    else run.targetMoving = true;
  }
  if (GATES.some((g) => CARTS.some((id) => inBeam(w, g, w.carts[id])))) run.gateInZone = true;
  if (run.targetMoving) errF7(w, 'E03', 'TARGET_MOVING', 'WARN');
  if (run.gateInZone) errF7(w, 'E05', 'GATE_IN_COLLISION_ZONE', 'WARN');
  emitF7(w, 'COLLISION', 'INFO', { trial: run.id });
}

function contactEnd(w: F07World, run: RunRecord, t: number) {
  run.contactEndT = t;
  run.pAfter = r6(totalMomentum(w));
  run.vAfter = [r6(w.carts.cartA.v), r6(w.carts.cartB.v)];
  run.trueJ = r6(run.trueJ);
  run.extJ = r6(run.extJ);
}

/** Registro del sensor de fuerza: muestras al ritmo del registrador, solo cerca del choque. */
function sampleForce(w: F07World, run: RunRecord, tRel: number) {
  const p = w.params;
  const stopAt = run.contactEndT !== null ? run.contactEndT + 0.02 : Infinity;
  while (run.nextT <= tRel + 1e-9) {
    const t = run.nextT;
    run.nextT = r6(run.nextT + 1 / w.logger.rateHz);
    if (t > stopAt) continue;
    const Ft = contactForce(w).F;
    const fi = forceIndication(Ft, w.sensor, p.force, gaussF7(w) * p.noiseFactor);
    run.force.push([r6(t), w.sensor.connected ? fi.value : 0, Math.round(Ft * 1e5) / 1e5]);
    // Antes del choque solo se guarda una ventana de 20 ms (el registrador tiene disparo por umbral).
    if (run.contactT === null) {
      const keep = Math.max(2, Math.ceil(0.02 * w.logger.rateHz));
      if (run.force.length > keep) run.force.splice(0, run.force.length - keep);
    }
  }
}

function crossTime(s0: number, s1: number, t0: number, h: number, edge: number): number {
  const ds = s1 - s0;
  const f = Math.abs(ds) < 1e-12 ? 0 : Math.max(0, Math.min(1, (edge - s0) / ds));
  return t0 + f * h;
}

/** Cruces de la bandera de un carro por las compuertas (entrada y salida interpoladas dentro del microsubpaso). */
function recordGates(w: F07World, run: RunRecord, id: CartId, s0: number, s1: number, t0: number, h: number) {
  const c = w.carts[id];
  if (c.on !== 'track' || s0 === s1) return;
  const fw = flagEff(c);
  for (const g of GATES) {
    const gs = w.gates[g].s;
    const inside = (s: number) => Math.abs(s - gs) < fw / 2;
    const a = inside(s0);
    const b = inside(s1);
    const dir = sgn(s1 - s0);
    const entry = dir > 0 ? gs - fw / 2 : gs + fw / 2;
    const exit = dir > 0 ? gs + fw / 2 : gs - fw / 2;
    if (!a && b) run.crossings.push([g, id, r6(crossTime(s0, s1, t0, h, entry) - run.startS), null, dir]);
    else if (a && !b) {
      const open = [...run.crossings].reverse().find((x) => x[0] === g && x[1] === id && x[3] === null);
      if (open) {
        open[3] = r6(crossTime(s0, s1, t0, h, exit) - run.startS);
        if (run.contactEndT !== null) run.postCrossed[id] = true;
        // Compuerta sin abrazadera: el golpe del paso la corre 1 cm (F07-E28).
        if (!w.track.gatesClamped && run.slipT === null) {
          w.gates[g].s = r4(w.gates[g].s + w.params.gateSlipM);
          run.slipT = r4(t0 + h - run.startS);
          errF7(w, 'E28', 'GATE_SLIPPED', 'WARN', { g });
        }
      }
    } else if (!a && !b && Math.min(s0, s1) < gs - fw / 2 && Math.max(s0, s1) > gs + fw / 2) {
      run.crossings.push([g, id, r6(crossTime(s0, s1, t0, h, entry) - run.startS), r6(crossTime(s0, s1, t0, h, exit) - run.startS), dir] as Crossing);
      if (run.contactEndT !== null) run.postCrossed[id] = true;
    }
  }
  for (const g of GATES) w.gates[g].blocked = CARTS.some((k) => inBeam(w, g, w.carts[k]));
}

/** Topes de los extremos (el émbolo libre de cada lanzador): con amortiguador frenan el carro, sin él rebota. */
function ends(w: F07World, run: RunRecord | null, t: number) {
  const p = w.params;
  for (const id of CARTS) {
    const c = w.carts[id];
    if (c.on !== 'track' || c.latched) continue;
    const left = c.s < CART_MIN_S && c.v < 0;
    const right = c.s > CART_MAX_S && c.v > 0;
    if (!left && !right) continue;
    const vi = c.v;
    const E0 = mechanicalEnergyJ(w);
    // Un carro que apenas apoya contra el tope (la pendiente lo empuja) queda en reposo contra él.
    const e = Math.abs(vi) < 0.02 ? 0 : w.track.endDampers ? p.endE : p.endHardE;
    const lim = left ? CART_MIN_S : CART_MAX_S;
    const shift = lim - c.s;
    if (w.bumper.joined) {
      w.carts.cartA.s += shift;
      w.carts.cartB.s += shift;
      w.carts.cartA.v = w.carts.cartB.v = -e * vi;
    } else {
      c.s = lim;
      c.v = -e * vi;
    }
    w.energy.dissipatedJ += E0 - mechanicalEnergyJ(w);
    if (run) {
      if (!run.postCrossed[id] && run.endHitT === null) run.endHitT = r4(t - run.startS);
      if (run.contactEndT !== null && run.stopT === null) run.stopT = r4(t - run.startS);
    }
    if (!w.track.endDampers && Math.abs(vi) > 0.5) {
      // Sin amortiguador el carro golpea el tope del extremo: puede torcerse una rueda y se bloquea el puesto.
      if (Math.abs(vi) > 0.8 && !c.damaged) {
        c.damaged = true;
        emitF7(w, 'CART_DAMAGED', 'WARN', { cart: id });
      }
      bumpF7(w, 'crash');
      errF7(w, 'E14', 'CART_CRASH', 'CRITICAL', { v: Math.round(Math.abs(vi) * 100) / 100 });
      if (!w.safety.block) w.safety.block = { code: 'CART_CRASH', since: w.timeS };
    }
  }
}

function finishCheck(w: F07World, run: RunRecord, t: number) {
  const A = w.carts.cartA;
  const B = w.carts.cartB;
  const tRel = t - run.startS;
  // Cámara lateral a 20 Hz.
  while (run.nextTrackT <= tRel + 1e-9) {
    run.track.push([Math.round(run.nextTrackT * 1e3) / 1e3, r4(A.s), r4(B.s), r4(A.v), r4(B.v)]);
    run.nextTrackT = r6(run.nextTrackT + 0.05);
  }
  if (run.track.length > 400) run.track.splice(0, run.track.length - 400);
  run.stillS = !cartMovingF7(w) ? run.stillS + w.params.dtS / w.params.subSteps : 0;
  if (tRel >= 15 || (run.stillS >= 0.4 && tRel > 0.5)) {
    run.done = true;
    if (run.contactT !== null && run.contactEndT === null) contactEnd(w, run, r6(tRel));
    if (run.endHitT !== null) errF7(w, 'E14', 'END_STOP_HIT', 'WARN');
    emitF7(w, 'RUN_DONE', 'INFO', { trial: run.id, hit: run.contactT !== null ? 1 : 0 });
  }
}

// ─────────────────────────── Paso de simulación ───────────────────────────

export function stepF07World(w: F07World): void {
  const dt = w.params.dtS;
  const n = Math.max(1, w.params.subSteps);
  const h = dt / n;
  const tStart = w.timeS;
  w.timeS = Math.round((w.timeS + dt) * 1e6) / 1e6;
  w.tick++;
  for (let i = 0; i < n; i++) stepCarts(w, tStart + i * h, h);
}

export function runF07For(w: F07World, seconds: number) {
  const n = Math.round(seconds / w.params.dtS);
  for (let i = 0; i < n; i++) stepF07World(w);
}

export function f07Summary(w: F07World) {
  return {
    sA: r6(w.carts.cartA.s),
    vA: r6(w.carts.cartA.v),
    sB: r6(w.carts.cartB.s),
    vB: r6(w.carts.cartB.v),
    joined: w.bumper.joined,
    trial: w.trial,
    readings: w.readingOrder.length,
    cfg: w.configVersion,
  };
}
