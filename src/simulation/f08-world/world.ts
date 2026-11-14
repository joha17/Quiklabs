/**
 * Mundo de F08 — rotación de cuerpos rígidos y momento de inercia: paso fijo determinista de 0,05 s con 10 subpasos de
 * 5 ms (§6). La escena solo dibuja este estado y envía hechos geométricos.
 *
 * - Rotor: plataforma con eje y tambor (I₀) más el sólido acoplado (disco ½MR², aro MR², barra ML²/12 con dos masas
 *   corredizas m r²) y el teorema de Steiner para el agujero desplazado o la holgura del aro.
 * - Cuerda tensa: la masa colgante m baja v = r ω; con la cuerda inclinada un ángulo φ el torque es T r cos φ. En cada
 *   subpaso la aceleración angular es constante, α = (m g r cos φ − τ_f)/(I + m r² cos φ), y se integra exacta con roce
 *   de Coulomb (si ω cambia de signo el roce lo detiene). T = m (g − α r).
 * - Roce: rodamientos (modo realista), roce adicional del docente, desbalance k U ω², freno, dedo sobre el eje y la guarda
 *   rozada. Todo se contabiliza como energía disipada; la mano es trabajo externo.
 * - La masa aterriza en el tope blando (o golpea el piso, F08-E12); el lazo se suelta del pasador y el rotor sigue libre.
 * - Instrumentos: balanza de 1 g, calibre de 0,01 cm, transportador de 1°, regla radial de 0,1 cm, encoder de 0,1° con
 *   ajuste cuadrático, sensor de tensión en línea (`instruments/force-sensor`), tacómetro óptico y fotopuerta
 *   (`instruments/photogate`, cronómetro de 10 µs) en la columna de caída.
 */
import type { CaliperTarget, Channel, F08Command, F08DispatchResult, PpeItem } from './commands';
import type { DropId, F08Object, F08Params, F08World, Pose, ReadingF8, RunRecord, RunSetup, SlideId, SolidId } from './types';
import { hashRandom } from '../core/rng';
import { bumpF8, emitF8, errF8, flagF8, gaussF8, rearmErrF8 } from './events';
import { GEOF08, massStartZ, maxTurns } from './geometry';
import {
  DROPS, SLIDES, SLIDE_HALF, SOLIDS, angularMomentum, conservedTotalsF08, dropKgF8, effectiveR, imbalance, massZ, mechanicalEnergyJ, rotorI, rotorReach, slidesOnRotor, solidSpec,
} from './conservation';
import { timerIndication } from '../instruments/photogate';
import { forceIndication, quantizeReading } from '../instruments/force-sensor';

export { emitF8, latchF8, rearmF8, bumpF8, flagF8, errF8 } from './events';
export { conservedTotalsF08, rotorI, angularMomentum, imbalance, massZ };

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, num(v, a)));
const DEG = Math.PI / 180;
const TAU = 2 * Math.PI;
const sgn = (x: number) => (x > 0 ? 1 : x < 0 ? -1 : 0);
const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
const isSolid = (s: unknown): s is SolidId => SOLIDS.includes(s as SolidId);
const isSlide = (s: unknown): s is SlideId => SLIDES.includes(s as SlideId);
const isDrop = (s: unknown): s is DropId => DROPS.includes(s as DropId);
/** Ángulo envuelto a (−π, π]. */
const wrap = (a: number) => {
  const x = (((a + Math.PI) % TAU) + TAU) % TAU;
  return x - Math.PI;
};
/** Roce de la guarda rozada por una masa corrediza (N·m). */
const GUARD_RUB = 0.05;
/** ω por debajo de la cual el rotor se considera quieto para las manos (rad/s). */
const HAND_SAFE = 0.3;

/** Escenarios docentes (§10). */
export const SF8 = {
  DISC: 'F08-S01_disc',
  RING: 'F08-S02_ring',
  BAR: 'F08-S03_bar',
  CENTERED: 'F08-S04_centered_masses',
  ASYM: 'F08-S05_asymmetric_masses',
  FRICTION: 'F08-S06_friction',
  FRICTIONLESS: 'F08-S07_frictionless',
  LOW_TORQUE: 'F08-S08_low_torque',
  HIGH_TORQUE: 'F08-S09_high_torque',
  ENC_MISCAL: 'F08-S10_encoder_miscal',
  OFFSET_AXIS: 'F08-S11_offset_axis',
  CATCH: 'F08-S12_catch',
} as const;

export interface F08WorldSpec {
  objects: F08Object[];
  scenarios: string[];
  mode: string;
}

// ─────────────────────────── Creación ───────────────────────────

export function createF08World(spec: F08WorldSpec, seed: number, params: F08Params): F08World {
  const has = (s: string) => spec.scenarios.includes(s);
  const objects: Record<string, F08Object> = {};
  for (const o of spec.objects) objects[o.id] = { ...o, pose: { ...o.pose } };
  const h = (k: string) => hashRandom(seed, k) - 0.5;
  const sign = (k: string) => (h(k) > 0 ? 1 : -1);
  const realistic = params.scientificMode === 'REALISTIC';
  const offs = Math.round(sign('tS') * params.tension.offsetN * (0.4 + (h('t') + 0.5) * 0.6) * 1000) / 1000;
  const play = Math.round((0.5 + (h('ring') + 0.5) * 0.5) * params.ringEccMaxMm * 10) / 10000;
  const dz = Math.round(sign('pz') * params.pulleyDzMax * (0.75 + (h('p') + 0.5) * 0.25) * 10) / 10;
  const theta0 = Math.round((h('th') + 0.5) * TAU * 1e4) / 1e4;
  const w: F08World = {
    timeS: 0, tick: 0, seed, rng: seed >>> 0 || 1, params, mode: spec.mode, objects,
    rotor: { theta: theta0, omega: 0, solid: null, hole: 0, ecc: 0, brake: true, touch: false, tripped: false },
    slides: { slide1: { r: 0.15, locked: false }, slide2: { r: 0.15, locked: false } },
    string: { drumR: params.drumRadii[1] ?? 0.02, turns: 0, unwound: 0, attached: true, mass: null, held: false, z0: GEOF08.column.zFull, y: 0, v: 0, landed: false, pulleyDzCm: realistic ? dz : 0 },
    column: { catchOn: has(SF8.CATCH), catchZ: has(SF8.CATCH) ? -50 : -70, gateZ: has(SF8.CATCH) ? -44 : -64 },
    base: { clamped: false, driftM: 0, guardClosed: false },
    encoder: {
      connected: false, zeroAt: 0, zeroed: false, zeroErr: wrap(theta0), scale: has(SF8.ENC_MISCAL) ? 1.2 : params.encoderUncalScale, calibrated: false,
      dir: has(SF8.ENC_MISCAL) ? -1 : sign('dir') > 0 ? 1 : -1,
    },
    tension: { connected: false, offset: offs, zeroed: false, scale: params.tension.uncalScale, rangeIdx: 0, angleDeg: 0 },
    tach: { connected: false, rangeIdx: 0 },
    logger: { rateHz: params.rates[1] ?? 20, gateConnected: false },
    damaged: { disc01: false, ring01: false, bar01: false },
    ringPlay: play,
    markTheta: 0,
    balance: { on: null, placedS: -10, offsetG: Math.round(sign('balS') * (2 + (h('bal') + 0.5) * 2)), tared: false },
    run: null, runs: [],
    energy: { dissipatedJ: 0, externalJ: 0 },
    lastT: 0,
    trial: 0,
    configVersion: 1,
    readings: {}, readingOrder: [],
    safety: { ppe: { coat: false, goggles: false, shoes: false, hair: false }, block: null, stoppedByTeacher: false },
    events: [], evidence: {}, scenarios: [...spec.scenarios], ppe: false,
    initialTotals: { massesG: 0 },
  };
  const mount = (id: SolidId, hole: number) => {
    w.rotor.solid = id;
    w.rotor.hole = hole;
    w.rotor.ecc = id === 'ring01' ? play : 0;
    objects[id].support = 'hub';
  };
  if (has(SF8.DISC)) mount('disc01', 0);
  if (has(SF8.OFFSET_AXIS)) mount('disc01', params.holes[params.holes.length - 1] ?? 0.05);
  if (has(SF8.RING)) mount('ring01', 0);
  if (has(SF8.BAR) || has(SF8.CENTERED) || has(SF8.ASYM)) mount('bar01', 0);
  if (has(SF8.CENTERED)) w.slides = { slide1: { r: 0.1, locked: true }, slide2: { r: 0.1, locked: true } };
  if (has(SF8.ASYM)) w.slides = { slide1: { r: 0.06, locked: false }, slide2: { r: 0.22, locked: false } };
  w.initialTotals = { massesG: conservedTotalsF08(w).massesG };
  w.energy.externalJ = mechanicalEnergyJ(w);
  return w;
}

// ─────────────────────────── Consultas ───────────────────────────

export const runningRunF8 = (w: F08World) => !!w.run && !w.run.done;
export const busyF8 = (w: F08World) => runningRunF8(w);
export const spinningF8 = (w: F08World, lim = 1e-3) => Math.abs(w.rotor.omega) > lim;
/** ¿La cuerda tira del tambor? */
export const tautF8 = (w: F08World) => !!w.string.mass && w.string.attached && !w.string.held && !w.string.landed;
/** Inclinación de la cuerda entre tambor y polea (rad). */
export const stringPhi = (w: F08World) => Math.atan2(w.string.pulleyDzCm / 100, w.params.pulleyDist);
/** Altura donde se detiene la masa (cm): el tope blando si está puesto, si no el piso. */
export const stopZF8 = (w: F08World) => (w.column.catchOn ? w.column.catchZ : GEOF08.column.floor);
/** Ángulo del rotor relativo a la marca 0 del transportador (°, en (−180, 180]). */
export const markAngleDeg = (w: F08World) => wrap(w.rotor.theta - w.markTheta) / DEG;
/** La guarda está rozada por una masa corrediza. */
const scraping = (w: F08World) => w.base.guardClosed && w.rotor.solid === 'bar01' && slidesOnRotor(w) && rotorReach(w) > w.params.guardR;

/** Indicación cruda del encoder para un ángulo verdadero θ (°). */
export function encoderDeg(w: F08World, theta: number): number {
  const e = w.encoder;
  return e.dir * e.scale * ((theta - e.zeroAt) / DEG);
}

// ─────────────────────────── Despacho ───────────────────────────

const BEFORE_PPE = new Set<F08Command['type']>(['equipPpe', 'startWork', 'teacherStop', 'acknowledge', 'inspect']);
const DURING_BLOCK = new Set<F08Command['type']>(['acknowledge', 'teacherStop', 'inspect', 'setPose', 'setBrake', 'setGuard']);
/** Comandos que cambian la condición física del ensayo (nuevo montaje; E32 si hay un ensayo en marcha). */
const CONFIG = new Set<F08Command['type']>([
  'clampBase', 'setBrake', 'mountSolid', 'centerSolid', 'slideMass', 'lockMass', 'setDrum', 'alignPulley', 'setCatch', 'moveGate', 'connect', 'zeroEncoder', 'calibrateEncoder', 'setEncoderDir',
  'zeroTension', 'mountTension', 'setTachRange', 'setRate',
]);
/** Gestos con la mano dentro del plano de giro (con la guarda abierta). */
const HAND_IN_PLANE = new Set<F08Command['type']>(['mountSolid', 'centerSolid', 'repairSolid', 'slideMass', 'lockMass', 'spinByHand']);

export function dispatchF08(w: F08World, cmd: F08Command): F08DispatchResult {
  if (!cmd || typeof cmd !== 'object') return { ok: false, code: 'UNKNOWN' };
  if (w.safety.stoppedByTeacher && cmd.type !== 'teacherStop') return { ok: false, code: 'TEACHER_STOP' };
  if (!w.ppe && !BEFORE_PPE.has(cmd.type)) return { ok: false, code: 'PPE' };
  if (w.safety.block && !DURING_BLOCK.has(cmd.type)) return { ok: false, code: 'BLOCKED' };
  // Trabajo externo: lo que el gesto cambia en la energía (mecánica + disipada).
  const S0 = mechanicalEnergyJ(w) + w.energy.dissipatedJ;
  const before = w.configVersion;
  const moving = runningRunF8(w) && (spinningF8(w) || tautF8(w));
  const res = route(w, cmd);
  w.energy.externalJ += mechanicalEnergyJ(w) + w.energy.dissipatedJ - S0;
  if (res.ok && CONFIG.has(cmd.type)) {
    if (w.configVersion === before) w.configVersion++;
    const r = moving ? w.run : null;
    if (r && r.configChangedT === null) {
      r.configChangedT = r4(w.timeS - r.startS);
      errF8(w, 'E32', 'CONFIG_DURING_RUN', 'WARN', { cmd: cmd.type });
    }
  }
  return res;
}

function route(w: F08World, cmd: F08Command): F08DispatchResult {
  // Mano en el plano de giro con el rotor en marcha y la guarda abierta (F08-E19): freno de emergencia y bloqueo.
  if (HAND_IN_PLANE.has(cmd.type)) {
    if (w.base.guardClosed) return { ok: false, code: 'GUARD_CLOSED' };
    if (spinningF8(w, HAND_SAFE)) {
      w.rotor.brake = true;
      bumpF8(w, 'handInPlane');
      errF8(w, 'E19', 'HAND_IN_PLANE', 'CRITICAL', { omega: Math.round(Math.abs(w.rotor.omega) * 10) / 10 });
      w.safety.block = { code: 'HAND_IN_PLANE', since: w.timeS };
      return { ok: false, code: 'HAND_IN_PLANE' };
    }
  }
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
      rearmErrF8(w, 'E21');
      flagF8(w, 'balanceTared');
      emitF8(w, 'BALANCE_TARED', 'INFO');
      return { ok: true };
    case 'placeOnBalance':
      return placeOnBalance(w, String(cmd.id));
    case 'removeFromBalance':
      return removeFromBalance(w);
    case 'readBalance':
      return readBalance(w);
    case 'measure':
      return measure(w, cmd.target);
    // Soporte, guarda y freno
    case 'clampBase':
      w.base.clamped = !!cmd.on;
      if (cmd.on) {
        rearmErrF8(w, 'E28');
        flagF8(w, 'baseClamped');
      }
      emitF8(w, cmd.on ? 'BASE_CLAMPED' : 'BASE_LOOSE', cmd.on ? 'INFO' : 'WARN');
      return { ok: true };
    case 'setGuard':
      w.base.guardClosed = !!cmd.closed;
      emitF8(w, cmd.closed ? 'GUARD_CLOSED' : 'GUARD_OPENED', 'INFO');
      return { ok: true };
    case 'setBrake': {
      const r = w.rotor;
      r.brake = !!cmd.on;
      if (!cmd.on && !spinningF8(w)) r.tripped = false;
      emitF8(w, cmd.on ? 'BRAKE_ON' : 'BRAKE_OFF', 'INFO');
      return { ok: true };
    }
    case 'turnByHand':
      return turnByHand(w, num(cmd.deg));
    case 'spinByHand':
      return spinByHand(w, num(cmd.omega));
    case 'touchHub':
      return touchHub(w, !!cmd.on);
    // Sólidos y masas corredizas
    case 'mountSolid':
      return mountSolid(w, cmd.id, num(cmd.hole));
    case 'removeSolid':
      return removeSolid(w);
    case 'centerSolid': {
      if (!w.rotor.solid) return { ok: false, code: 'NO_SOLID' };
      if (busyF8(w)) return { ok: false, code: 'BUSY' };
      w.rotor.ecc = 0;
      rearmErrF8(w, 'E01');
      flagF8(w, `centered:${w.rotor.solid}`);
      emitF8(w, 'SOLID_CENTERED', 'INFO', { id: w.rotor.solid });
      return { ok: true };
    }
    case 'repairSolid': {
      if (!isSolid(cmd.id)) return { ok: false, code: 'NO_OBJECT' };
      if (busyF8(w)) return { ok: false, code: 'BUSY' };
      if (!w.damaged[cmd.id]) return { ok: true };
      w.damaged[cmd.id] = false;
      rearmErrF8(w, 'E39');
      emitF8(w, 'SOLID_REPAIRED', 'INFO', { id: cmd.id });
      return { ok: true };
    }
    case 'slideMass': {
      if (!isSlide(cmd.id)) return { ok: false, code: 'NO_OBJECT' };
      if (w.objects[cmd.id].support !== 'bar01') return { ok: false, code: 'NOT_ON_BAR' };
      const s = w.slides[cmd.id];
      if (s.locked) return { ok: false, code: 'LOCKED' };
      s.r = Math.round(clamp(cmd.rCm / 100, w.params.slideMinR, w.params.slideMaxR) * 1e4) / 1e4;
      return { ok: true, value: s.r * 100 };
    }
    case 'lockMass': {
      if (!isSlide(cmd.id)) return { ok: false, code: 'NO_OBJECT' };
      if (w.objects[cmd.id].support !== 'bar01') return { ok: false, code: 'NOT_ON_BAR' };
      w.slides[cmd.id].locked = !!cmd.on;
      if (cmd.on && SLIDES.every((k) => w.slides[k].locked)) rearmErrF8(w, 'E03');
      emitF8(w, cmd.on ? 'MASS_LOCKED' : 'MASS_UNLOCKED', 'INFO', { id: cmd.id });
      return { ok: true };
    }
    case 'readRadius':
      return readRadius(w, cmd.id, num(cmd.viewDeg));
    // Cuerda, polea, masa, tope y fotopuerta
    case 'setDrum': {
      const s = w.string;
      if (s.mass || s.turns > 0) return { ok: false, code: 'STRING_WOUND' };
      const r = w.params.drumRadii.find((x) => Math.abs(x * 100 - num(cmd.rCm)) < 0.05);
      if (r === undefined) return { ok: false, code: 'NO_STEP' };
      s.drumR = r;
      emitF8(w, 'DRUM_SET', 'INFO', { cm: Math.round(r * 1000) / 10 });
      return { ok: true, value: r * 100 };
    }
    case 'windString':
      return windString(w, num(cmd.turns));
    case 'hangMass':
      return hangMass(w, cmd.id, !!cmd.on);
    case 'alignPulley':
      if (busyF8(w)) return { ok: false, code: 'BUSY' };
      w.string.pulleyDzCm = 0;
      rearmErrF8(w, 'E10');
      flagF8(w, 'pulleyAligned');
      emitF8(w, 'PULLEY_ALIGNED', 'INFO');
      return { ok: true };
    case 'setCatch': {
      if (busyF8(w)) return { ok: false, code: 'BUSY' };
      const c = w.column;
      c.catchOn = !!cmd.on;
      c.catchZ = Math.round(clamp(cmd.zCm, GEOF08.column.zMin, GEOF08.column.zMax) * 10) / 10;
      if (c.catchOn) rearmErrF8(w, 'E12');
      if (Math.abs(c.catchZ - c.gateZ) >= 2 || !c.catchOn) rearmErrF8(w, 'E25');
      emitF8(w, c.catchOn ? 'CATCH_SET' : 'CATCH_REMOVED', c.catchOn ? 'INFO' : 'WARN', { z: c.catchZ });
      return { ok: true, value: c.catchZ };
    }
    case 'moveGate': {
      if (busyF8(w)) return { ok: false, code: 'BUSY' };
      const c = w.column;
      c.gateZ = Math.round(clamp(cmd.zCm, GEOF08.column.zMin, GEOF08.column.zMax) * 10) / 10;
      if (Math.abs(c.catchZ - c.gateZ) >= 2 || !c.catchOn) rearmErrF8(w, 'E25');
      return { ok: true, value: c.gateZ };
    }
    case 'release':
      return release(w);
    // Sensores
    case 'connect':
      return connect(w, cmd.channel, !!cmd.on);
    case 'readScale':
      return readScale(w, num(cmd.viewDeg));
    case 'zeroEncoder':
      return zeroEncoder(w);
    case 'calibrateEncoder': {
      const e = w.encoder;
      if (!e.connected) return { ok: false, code: 'NOT_CONNECTED' };
      if (spinningF8(w)) return { ok: false, code: 'BUSY' };
      e.scale = 1;
      e.calibrated = true;
      rearmErrF8(w, 'E27');
      flagF8(w, 'encCalibrated');
      emitF8(w, 'ENCODER_CALIBRATED', 'INFO', { turns: 1 });
      return { ok: true };
    }
    case 'setEncoderDir': {
      const e = w.encoder;
      e.dir = num(cmd.dir) < 0 ? -1 : 1;
      if (e.dir === 1) rearmErrF8(w, 'E07');
      emitF8(w, 'ENCODER_DIR', 'INFO', { dir: e.dir });
      return { ok: true, value: e.dir };
    }
    case 'readEncoderAngle':
      return readEncoderAngle(w);
    case 'zeroTension':
      return zeroTension(w);
    case 'mountTension': {
      const t = w.tension;
      t.angleDeg = Math.round(clamp(cmd.angleDeg, 0, 90) * 10) / 10;
      if (t.angleDeg < 3) rearmErrF8(w, 'E26');
      return { ok: true, value: t.angleDeg };
    }
    case 'setTachRange': {
      const t = w.tach;
      t.rangeIdx = Math.round(clamp(cmd.n, 0, w.params.tach.ranges.length - 1));
      if (t.rangeIdx > 0) rearmErrF8(w, 'E22');
      return { ok: true, value: w.params.tach.ranges[t.rangeIdx] };
    }
    case 'setRate': {
      const hz = Math.round(num(cmd.hz));
      if (!w.params.rates.includes(hz)) return { ok: false, code: 'BAD_RATE' };
      w.logger.rateHz = hz;
      if (hz >= 50) rearmErrF8(w, 'E24');
      return { ok: true, value: hz };
    }
    case 'readEncoder':
      return readEncoder(w);
    case 'readTension':
      return readTension(w);
    case 'readTach':
      return readTach(w);
    case 'readGate':
      return readGate(w);
    // Cierre y seguridad
    case 'closeStation':
      return closeStation(w);
    case 'acknowledge':
      return acknowledge(w);
    case 'teacherStop':
      w.safety.stoppedByTeacher = !!cmd.on;
      if (cmd.on) w.rotor.brake = true;
      emitF8(w, cmd.on ? 'TEACHER_STOP' : 'TEACHER_RESUME', cmd.on ? 'CRITICAL' : 'INFO');
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

function startWork(w: F08World): F08DispatchResult {
  const missing = (Object.keys(PPE_ERR) as PpeItem[]).filter((k) => !w.safety.ppe[k]);
  if (missing.length) {
    for (const k of missing) {
      bumpF8(w, `err:${PPE_ERR[k][0]}`);
      emitF8(w, PPE_ERR[k][1], 'CRITICAL');
    }
    return { ok: false, code: 'PPE_MISSING' };
  }
  w.ppe = true;
  flagF8(w, 'ppe');
  emitF8(w, 'PPE_OK', 'INFO');
  return { ok: true };
}

function inspect(w: F08World, target: string): F08DispatchResult {
  const o = w.objects[target];
  if (!o) return { ok: false, code: 'NO_OBJECT' };
  flagF8(w, `inspected:${target}`);
  const p = w.params;
  switch (o.kind) {
    case 'base':
      emitF8(w, 'INSPECT_BASE', w.base.clamped ? 'INFO' : 'WARN', { res: p.protractorResDeg });
      break;
    case 'guard':
      emitF8(w, 'INSPECT_GUARD', 'INFO', { cm: Math.round(p.guardR * 1000) / 10 });
      break;
    case 'hub':
      emitF8(w, 'INSPECT_HUB', 'INFO', { I0: p.I0, max: Math.round((p.omegaMax * 60) / TAU) });
      break;
    case 'solid': {
      const id = target as SolidId;
      const s = solidSpec(w, id);
      const bad = w.damaged[id] || (id === 'ring01' && w.ringPlay > 0.001);
      emitF8(w, bad ? 'INSPECT_SOLID_BAD' : 'INSPECT_SOLID', bad ? 'WARN' : 'INFO', { id, g: Math.round(s.M * 1000), cm: Math.round(s.R * 1000) / 10 });
      break;
    }
    case 'slideMass': {
      const sl = w.slides[target as SlideId];
      emitF8(w, sl?.locked ? 'INSPECT_SLIDE' : 'INSPECT_SLIDE_LOOSE', sl?.locked ? 'INFO' : 'WARN', { g: Math.round(p.slideKg * 1000), cm: Math.round((sl?.r ?? 0) * 1000) / 10 });
      break;
    }
    case 'pulley':
      emitF8(w, Math.abs(w.string.pulleyDzCm) > 0.5 ? 'INSPECT_PULLEY_BAD' : 'INSPECT_PULLEY', Math.abs(w.string.pulleyDzCm) > 0.5 ? 'WARN' : 'INFO', { dz: w.string.pulleyDzCm });
      break;
    case 'dropMass':
      emitF8(w, 'INSPECT_DROP', 'INFO', { g: Math.round((p.dropKg[target as DropId] ?? 0) * 1000) });
      break;
    case 'dropColumn':
      emitF8(w, 'INSPECT_COLUMN', w.column.catchOn ? 'INFO' : 'WARN', { floor: -GEOF08.column.floor });
      break;
    case 'catch':
      emitF8(w, 'INSPECT_CATCH', w.column.catchOn ? 'INFO' : 'WARN', { z: w.column.catchZ });
      break;
    case 'gate':
      emitF8(w, 'INSPECT_GATE', 'INFO', { res: p.gate.resolutionS });
      break;
    case 'encoder':
      emitF8(w, w.encoder.calibrated ? 'INSPECT_ENCODER' : 'INSPECT_ENCODER_UNCAL', w.encoder.calibrated ? 'INFO' : 'WARN', { res: p.encoderResDeg });
      break;
    case 'tach':
      emitF8(w, 'INSPECT_TACH', 'INFO', { range: p.tach.ranges[w.tach.rangeIdx] });
      break;
    case 'tensionSensor':
      emitF8(w, 'INSPECT_TENSION', w.tension.zeroed ? 'INFO' : 'WARN', { range: p.tension.ranges[w.tension.rangeIdx], res: p.tension.resolutions[w.tension.rangeIdx] });
      break;
    case 'logger':
      emitF8(w, 'INSPECT_LOGGER', w.logger.rateHz >= 50 ? 'INFO' : 'WARN', { hz: w.logger.rateHz });
      break;
    case 'balance':
      emitF8(w, 'INSPECT_BALANCE', w.balance.tared ? 'INFO' : 'WARN', { res: p.balanceResolutionG });
      break;
    case 'caliper':
      emitF8(w, 'INSPECT_CALIPER', 'INFO', { res: p.caliperResCm * 10 });
      break;
    case 'radialRuler':
      emitF8(w, 'INSPECT_RULER', 'INFO', { res: p.rulerResCm * 10 });
      break;
    default:
      emitF8(w, 'INSPECTED', 'INFO', { target });
  }
  return { ok: true };
}

const SUPPORTS = new Set(['bench', 'rack', 'massRack', 'hand']);

function setPose(w: F08World, id: string, pose: Pose, support?: string): F08DispatchResult {
  const o = w.objects[id];
  if (!o) return { ok: false, code: 'NO_OBJECT' };
  if (!o.movable) return { ok: false, code: 'FIXED' };
  if (!pose || ![pose.x, pose.y, pose.z].every((v) => Number.isFinite(v))) return { ok: false, code: 'BAD_POSE' };
  if (support && support !== o.support && !SUPPORTS.has(support)) return { ok: false, code: 'NO_SEAT' };
  if (['hub', 'bar01', 'hook', 'balance'].includes(o.support)) return { ok: false, code: 'NO_SEAT' };
  o.pose = { x: pose.x, y: pose.y, z: pose.z, rotationRad: num(pose.rotationRad) };
  if (support) o.support = support;
  return { ok: true };
}

// ─────────────────────────── Lecturas estáticas ───────────────────────────

const PREFIX: Record<ReadingF8['kind'], string> = { mass: 'm', length: 'L', scale: 'p', angle: 'a', radius: 'r', encoder: 'e', tension: 't', tach: 'w', gate: 'g' };

function addReading(w: F08World, r: Omit<ReadingF8, 'id' | 't' | 'tick' | 'trialId' | 'configVersion'> & { configVersion?: number; trial?: number }): ReadingF8 {
  const n = w.readingOrder.length + 1;
  const { trial, ...rest } = r;
  const reading: ReadingF8 = { ...rest, configVersion: r.configVersion ?? w.configVersion, id: `${PREFIX[r.kind]}${n}`, trialId: `T${trial ?? w.trial}`, t: w.timeS, tick: w.tick };
  if (!Number.isFinite(reading.value)) reading.valid = false;
  if (!Number.isFinite(reading.trueValue)) reading.trueValue = 0;
  w.readings[reading.id] = reading;
  w.readingOrder.push(reading.id);
  return reading;
}

const quant = quantizeReading;
/** Número finito o null (la cinta se guarda en JSON y NaN no sobrevive). */
const fin = (x: number | null | undefined): number | null => (x !== null && x !== undefined && Number.isFinite(x) ? x : null);

/** Masa (g) del objeto sobre la balanza. */
export function massOfG(w: F08World, id: string): number {
  const p = w.params;
  if (isSolid(id)) return solidSpec(w, id).M * 1000;
  if (isSlide(id)) return p.slideKg * 1000;
  if (isDrop(id)) return (p.dropKg[id] ?? 0) * 1000;
  return 0;
}

const homeOf = (id: string) => (isSolid(id) ? 'rack' : isSlide(id) ? 'bar01' : 'massRack');

function placeOnBalance(w: F08World, id: string): F08DispatchResult {
  const o = w.objects[id];
  if (!o || !(isSolid(id) || isSlide(id) || isDrop(id))) return { ok: false, code: 'NO_OBJECT' };
  if (w.balance.on) return { ok: false, code: 'PAN_BUSY' };
  if (isSlide(id) && w.objects.bar01.support !== 'rack') return { ok: false, code: 'ON_ROTOR' };
  if (o.support !== homeOf(id)) return { ok: false, code: o.support === 'hub' ? 'ON_ROTOR' : 'NOT_ON_RACK' };
  o.support = 'balance';
  w.balance.on = id;
  w.balance.placedS = w.timeS;
  emitF8(w, 'ON_BALANCE', 'INFO', { id });
  return { ok: true };
}

function removeFromBalance(w: F08World): F08DispatchResult {
  const id = w.balance.on;
  if (!id) return { ok: true };
  w.objects[id].support = homeOf(id);
  w.balance.on = null;
  return { ok: true };
}

function readBalance(w: F08World): F08DispatchResult {
  const p = w.params;
  const id = w.balance.on;
  const trueG = id ? massOfG(w, id) : 0;
  const flags: string[] = [];
  let shown = trueG + w.balance.offsetG;
  if (id !== null && w.timeS - w.balance.placedS < 1.5) {
    flags.push('UNSTABLE');
    shown += gaussF8(w) * 4;
    errF8(w, 'E30', 'READ_BEFORE_STABLE', 'WARN', { inst: 'balance01' });
  }
  if (!w.balance.tared) {
    flags.push('NOT_ZEROED');
    errF8(w, 'E21', 'NOT_ZEROED', 'WARN', { inst: 'balance01' });
  }
  if (!id) flags.push('EMPTY');
  const value = quant(shown, p.balanceResolutionG);
  const r = addReading(w, {
    kind: 'mass', instrumentId: 'balance01', value, unit: 'g', resolution: p.balanceResolutionG, uncertainty: p.uB.balanceG, sourceObjectIds: ['balance01', ...(id ? [id] : [])], qualityFlags: flags,
    trueValue: trueG, target: id ?? 'empty',
  });
  if (id && !flags.length) flagF8(w, `weighed:${id}`);
  emitF8(w, 'BALANCE_READ', 'INFO', { g: value });
  return { ok: true, id: r.id, value };
}

/** Medida verdadera (cm) de cada blanco del calibre. */
function caliperTrue(w: F08World, t: CaliperTarget): number {
  const p = w.params;
  if (t === 'disc01') return p.disc.R * 200;
  if (t === 'ring01') return p.ring.R * 200;
  if (t === 'drum') return w.string.drumR * 200;
  if (t === 'flag') return GEOF08.mass.flag;
  if (t === 'hole') return (p.holes[p.holes.length - 1] ?? 0) * 100;
  return NaN;
}

function measure(w: F08World, target: CaliperTarget): F08DispatchResult {
  const tv = caliperTrue(w, target);
  if (!Number.isFinite(tv)) return { ok: false, code: 'NO_OBJECT' };
  if ((target === 'disc01' || target === 'ring01' || target === 'hole') && w.objects[target === 'hole' ? 'disc01' : target]?.support !== 'rack') return { ok: false, code: 'ON_ROTOR' };
  if (target === 'drum' && (w.string.turns > 0 || spinningF8(w))) return { ok: false, code: 'STRING_WOUND' };
  const p = w.params;
  const value = quant(tv + gaussF8(w) * 0.002 * p.noiseFactor, p.caliperResCm);
  const r = addReading(w, {
    kind: 'length', instrumentId: 'caliper01', value, unit: 'cm', resolution: p.caliperResCm, uncertainty: p.uB.caliperCm, sourceObjectIds: ['caliper01'], qualityFlags: [], trueValue: tv, target,
  });
  flagF8(w, `measured:${target}`);
  emitF8(w, 'CALIPER_READ', 'INFO', { target, cm: value });
  return { ok: true, id: r.id, value };
}

function readScale(w: F08World, viewDeg: number): F08DispatchResult {
  const p = w.params;
  const res = p.protractorResDeg;
  const flags: string[] = [];
  let shown = markAngleDeg(w);
  if (Math.abs(viewDeg) > 8) {
    shown += Math.sign(viewDeg) * 2 * res;
    flags.push('PARALLAX');
    errF8(w, 'E29', 'SCALE_PARALLAX', 'WARN', { inst: 'base01' });
  }
  if (spinningF8(w)) {
    flags.push('UNSTABLE');
    errF8(w, 'E30', 'READ_BEFORE_STABLE', 'WARN', { inst: 'base01' });
  }
  const value = quant(shown, res);
  const r = addReading(w, {
    kind: 'scale', instrumentId: 'base01', value, unit: '°', resolution: res, uncertainty: p.uB.protractorDeg, sourceObjectIds: ['base01', 'hub01'], qualityFlags: flags, trueValue: markAngleDeg(w), target: 'rotor',
  });
  emitF8(w, 'SCALE_READ', flags.length ? 'WARN' : 'INFO', { deg: value });
  return { ok: true, id: r.id, value };
}

function readRadius(w: F08World, id: SlideId, viewDeg: number): F08DispatchResult {
  if (!isSlide(id)) return { ok: false, code: 'NO_OBJECT' };
  if (w.objects[id].support !== 'bar01') return { ok: false, code: 'NOT_ON_BAR' };
  const p = w.params;
  const res = p.rulerResCm;
  const flags: string[] = [];
  const tv = w.slides[id].r * 100;
  let shown = tv;
  if (Math.abs(viewDeg) > 8) {
    shown += Math.sign(viewDeg) * 3 * res;
    flags.push('PARALLAX');
    errF8(w, 'E29', 'SCALE_PARALLAX', 'WARN', { inst: 'ruler01' });
  }
  if (spinningF8(w)) {
    flags.push('UNSTABLE');
    errF8(w, 'E30', 'READ_BEFORE_STABLE', 'WARN', { inst: 'ruler01' });
  }
  const value = quant(shown, res);
  const r = addReading(w, {
    kind: 'radius', instrumentId: 'ruler01', value, unit: 'cm', resolution: res, uncertainty: p.uB.rulerCm, sourceObjectIds: ['ruler01', id, 'bar01'], qualityFlags: flags, trueValue: tv, target: id,
    setup: { locked: [w.slides.slide1.locked, w.slides.slide2.locked], slides: [w.slides.slide1.r, w.slides.slide2.r] },
  });
  emitF8(w, 'RADIUS_READ', flags.length ? 'WARN' : 'INFO', { id, cm: value });
  return { ok: true, id: r.id, value };
}

function readEncoderAngle(w: F08World): F08DispatchResult {
  const e = w.encoder;
  const p = w.params;
  const flags: string[] = [];
  if (!e.connected) flags.push('UNPLUGGED');
  if (spinningF8(w)) {
    flags.push('UNSTABLE');
    errF8(w, 'E30', 'READ_BEFORE_STABLE', 'WARN', { inst: 'encoder01' });
  }
  if (!e.zeroed) flags.push('ENC_OFFSET');
  if (!e.calibrated) flags.push('UNCALIBRATED');
  if (flags.includes('UNPLUGGED')) errF8(w, 'E23', 'NO_SIGNAL', 'WARN', { inst: 'encoder01' });
  const value = e.connected ? quant(encoderDeg(w, w.rotor.theta) + gaussF8(w) * 0.02 * p.noiseFactor, p.encoderResDeg) : NaN;
  const r = addReading(w, {
    kind: 'angle', instrumentId: 'encoder01', value, unit: '°', resolution: p.encoderResDeg, uncertainty: p.uB.encoderDeg, sourceObjectIds: ['encoder01', 'hub01'], qualityFlags: flags,
    trueValue: (w.rotor.theta - e.zeroAt) / DEG, target: 'rotor', setup: { enc: { connected: e.connected, zeroed: e.zeroed, zeroErrDeg: r4(e.zeroErr / DEG), calibrated: e.calibrated, dir: e.dir, scale: e.scale } },
  });
  emitF8(w, 'ENCODER_ANGLE_READ', flags.length ? 'WARN' : 'INFO', { deg: value });
  return { ok: true, id: r.id, value };
}

// ─────────────────────────── Rotor, sólidos y cuerda ───────────────────────────

function turnByHand(w: F08World, deg: number): F08DispatchResult {
  if (busyF8(w) || spinningF8(w)) return { ok: false, code: 'BUSY' };
  if (w.string.mass && !w.string.held) return { ok: false, code: 'STRING_LOADED' };
  const d = clamp(deg, -720, 720);
  w.rotor.theta = r6(w.rotor.theta + d * DEG);
  return { ok: true, value: r4(markAngleDeg(w)) };
}

function spinByHand(w: F08World, omega: number): F08DispatchResult {
  if (busyF8(w)) return { ok: false, code: 'BUSY' };
  if (w.string.mass && !w.string.held) return { ok: false, code: 'STRING_LOADED' };
  const r = w.rotor;
  if (r.brake) return { ok: false, code: 'BRAKE_ON' };
  r.omega = Math.round(clamp(omega, -45, 45) * 1000) / 1000;
  emitF8(w, 'SPUN_BY_HAND', 'INFO', { omega: r.omega });
  if (Math.abs(r.omega) > w.params.omegaMax) overspeed(w, null);
  return { ok: true, value: r.omega };
}

function touchHub(w: F08World, on: boolean): F08DispatchResult {
  w.rotor.touch = on;
  const run = runningRunF8(w) ? w.run : null;
  if (on && run && (spinningF8(w) || tautF8(w))) {
    run.touchT ??= r4(w.timeS - run.startS);
    errF8(w, 'E11', 'HUB_TOUCHED', 'WARN');
  }
  emitF8(w, on ? 'HUB_TOUCH' : 'HUB_RELEASED', 'INFO');
  return { ok: true };
}

function mountSolid(w: F08World, id: SolidId, hole: number): F08DispatchResult {
  if (!isSolid(id)) return { ok: false, code: 'NO_OBJECT' };
  if (busyF8(w)) return { ok: false, code: 'BUSY' };
  if (w.rotor.solid) return { ok: false, code: 'HUB_BUSY' };
  if (w.objects[id].support !== 'rack') return { ok: false, code: 'NOT_ON_RACK' };
  const h = w.params.holes.find((x) => Math.abs(x - hole) < 0.002);
  if (h === undefined || (id !== 'disc01' && h !== 0)) return { ok: false, code: 'NO_HOLE' };
  const r = w.rotor;
  // Acoplar con el rotor girando despacio: la mano frena la plataforma (choque inelástico, se conserva L).
  const L = angularMomentum(w);
  r.solid = id;
  r.hole = h;
  r.ecc = id === 'ring01' ? w.ringPlay : 0;
  r.omega = L / rotorI(w);
  w.objects[id].support = 'hub';
  emitF8(w, 'SOLID_MOUNTED', 'INFO', { id, cm: Math.round(h * 1000) / 10 });
  return { ok: true };
}

function removeSolid(w: F08World): F08DispatchResult {
  const r = w.rotor;
  const id = r.solid;
  if (!id) return { ok: false, code: 'NO_SOLID' };
  if (w.base.guardClosed) return { ok: false, code: 'GUARD_CLOSED' };
  if (busyF8(w) && !spinningF8(w, HAND_SAFE)) return { ok: false, code: 'BUSY' };
  if (spinningF8(w, HAND_SAFE)) {
    // Desmontar un sólido que gira (F08-E40): sale despedido con su energía; freno de emergencia y bloqueo.
    const E0 = mechanicalEnergyJ(w);
    r.solid = null;
    r.hole = 0;
    r.ecc = 0;
    r.brake = true;
    w.objects[id].support = 'rack';
    w.damaged[id] = true;
    w.energy.dissipatedJ += E0 - mechanicalEnergyJ(w);
    bumpF8(w, 'spinningDismount');
    errF8(w, 'E40', 'SPINNING_DISMOUNT', 'CRITICAL', { id });
    w.safety.block = { code: 'SPINNING_DISMOUNT', since: w.timeS };
    return { ok: false, code: 'SPINNING_DISMOUNT' };
  }
  r.solid = null;
  r.hole = 0;
  r.ecc = 0;
  w.objects[id].support = 'rack';
  emitF8(w, 'SOLID_REMOVED', 'INFO', { id });
  return { ok: true };
}

function windString(w: F08World, turns: number): F08DispatchResult {
  const s = w.string;
  if (busyF8(w) || spinningF8(w)) return { ok: false, code: 'BUSY' };
  if (s.mass) return { ok: false, code: 'MASS_HUNG' };
  const n = Math.round(clamp(turns, 0, 20) * 2) / 2;
  if (n > maxTurns(s.drumR) + 1e-9) return { ok: false, code: 'TOO_HIGH' };
  // Enrollar gira el tambor en sentido contrario a la caída.
  w.rotor.theta = r6(w.rotor.theta - (n - s.turns) * TAU);
  s.turns = n;
  s.unwound = 0;
  s.attached = n > 0;
  s.landed = false;
  s.y = 0;
  s.v = 0;
  s.z0 = massStartZ(s.drumR, n);
  if (n <= w.params.layerTurns) rearmErrF8(w, 'E05');
  emitF8(w, n > w.params.layerTurns ? 'STRING_OVERLAP' : 'STRING_WOUND', n > w.params.layerTurns ? 'WARN' : 'INFO', { turns: n });
  return { ok: true, value: n };
}

function hangMass(w: F08World, id: DropId, on: boolean): F08DispatchResult {
  if (!isDrop(id)) return { ok: false, code: 'NO_OBJECT' };
  const s = w.string;
  const o = w.objects[id];
  if (busyF8(w)) return { ok: false, code: 'BUSY' };
  if (on) {
    if (s.mass === id) return { ok: true };
    if (s.mass) return { ok: false, code: 'HOOK_BUSY' };
    if (s.turns <= 0 || !s.attached) return { ok: false, code: 'NOT_WOUND' };
    if (o.support !== 'massRack') return { ok: false, code: 'NOT_ON_RACK' };
    s.mass = id;
    s.held = true;
    s.y = 0;
    s.v = 0;
    s.landed = false;
    o.support = 'hook';
    emitF8(w, 'MASS_HUNG', 'INFO', { id, g: Math.round(w.params.dropKg[id] * 1000) });
    return { ok: true };
  }
  if (s.mass !== id) return { ok: true };
  if (tautF8(w)) return { ok: false, code: 'BUSY' };
  s.mass = null;
  s.held = false;
  s.v = 0;
  if (s.landed || !s.attached) {
    // El lazo ya se soltó del pasador: la cuerda queda desenrollada.
    s.turns = 0;
    s.y = 0;
    s.landed = false;
    s.attached = false;
  }
  o.support = 'massRack';
  emitF8(w, 'MASS_UNHOOKED', 'INFO', { id });
  return { ok: true };
}

function runSetup(w: F08World): RunSetup {
  const s = w.string;
  const e = w.encoder;
  const t = w.tension;
  const sl = w.slides;
  const onRotor = slidesOnRotor(w);
  const m = dropKgF8(w, s.mass);
  return {
    solid: w.rotor.solid, hole: w.rotor.hole, eccMm: Math.round(w.rotor.ecc * 10000) / 10, slides: [sl.slide1.r, sl.slide2.r], locked: [sl.slide1.locked, sl.slide2.locked],
    drumR: s.drumR, turns: s.turns, mass: s.mass, massKg: m, catchOn: w.column.catchOn, catchZ: w.column.catchZ, gateZ: w.column.gateZ, z0: r4(s.z0),
    stringDeg: Math.round((stringPhi(w) / DEG) * 100) / 100, baseClamped: w.base.clamped, guardClosed: w.base.guardClosed,
    enc: { connected: e.connected, zeroed: e.zeroed, zeroErrDeg: r4(e.zeroErr / DEG), calibrated: e.calibrated, dir: e.dir, scale: e.scale },
    ten: { connected: t.connected, zeroed: t.zeroed, angleDeg: t.angleDeg, range: t.rangeIdx },
    tach: { connected: w.tach.connected, range: w.tach.rangeIdx },
    gateConnected: w.logger.gateConnected, rateHz: w.logger.rateHz, damaged: !!w.rotor.solid && w.damaged[w.rotor.solid], startOmega: r4(w.rotor.omega),
    overlap: s.turns > w.params.layerTurns, asym: onRotor && Math.abs(sl.slide1.r - sl.slide2.r) > 0.005,
    trueI: r6(rotorI(w)), frictionNm: r6(frictionNm(w)),
  };
}

const RUN_ERRS = ['E01', 'E03', 'E04', 'E05', 'E06', 'E07', 'E10', 'E11', 'E12', 'E14', 'E18', 'E21', 'E22', 'E23', 'E24', 'E25', 'E26', 'E27', 'E28', 'E32', 'E39'];

function release(w: F08World): F08DispatchResult {
  const s = w.string;
  if (!s.mass || !s.held) return { ok: false, code: 'NOT_READY' };
  if (busyF8(w)) return { ok: false, code: 'BUSY' };
  if (!w.base.guardClosed) return { ok: false, code: 'GUARD_OPEN' };
  if (w.rotor.brake) return { ok: false, code: 'BRAKE_ON' };
  for (const e of RUN_ERRS) rearmErrF8(w, e);
  w.trial++;
  const setup = runSetup(w);
  // Soltar con el rotor girando (F08-E14): la cuerda se tensa de golpe y la masa toma la velocidad del tambor.
  const r = effectiveR(w);
  const m = setup.massKg;
  const I = rotorI(w);
  const E0 = mechanicalEnergyJ(w);
  s.held = false;
  if (Math.abs(w.rotor.omega) > 1e-6) {
    w.rotor.omega = (I * w.rotor.omega) / (I + m * r * r);
    s.v = w.rotor.omega * r;
    w.energy.dissipatedJ += E0 - mechanicalEnergyJ(w);
  }
  const rec: RunRecord = {
    id: w.trial, startS: w.timeS, samples: [], slackT: null, slackTheta: null, slackOmega: null, peakOmega: Math.abs(w.rotor.omega), gateIn: null, gateOut: null, gateV: null, groundT: null,
    touchT: null, overspeedT: null, slidT: null, configChangedT: null, guardHitT: null, driftM: 0, done: false, nextT: 0, stillS: 0, setup, configVersion: w.configVersion,
  };
  const warn = (on: boolean, code: string, ev: string) => on && errF8(w, code, ev, 'WARN');
  warn(setup.eccMm > 1, 'E01', 'RING_ECCENTRIC');
  warn(setup.asym, 'E04', 'ASYMMETRIC_MASSES');
  warn(setup.overlap, 'E05', 'STRING_OVERLAP');
  warn(Math.abs(setup.stringDeg) > 3, 'E10', 'STRING_INCLINED');
  warn(Math.abs(setup.startOmega) > 0.05, 'E14', 'SPINNING_START');
  warn(!setup.baseClamped, 'E28', 'SUPPORT_LOOSE');
  if (w.rotor.touch) {
    rec.touchT = 0;
    errF8(w, 'E11', 'HUB_TOUCHED', 'WARN');
  }
  w.run = rec;
  w.runs.push(rec);
  for (const old of w.runs.slice(0, -4)) old.samples = [];
  if (w.runs.length > 16) w.runs.splice(0, w.runs.length - 16);
  emitF8(w, 'MASS_RELEASED', 'INFO', { trial: w.trial });
  return { ok: true, value: w.trial };
}

// ─────────────────────────── Sensores ───────────────────────────

function connect(w: F08World, ch: Channel, on: boolean): F08DispatchResult {
  if (ch === 'encoder') w.encoder.connected = on;
  else if (ch === 'tension') w.tension.connected = on;
  else if (ch === 'tach') w.tach.connected = on;
  else if (ch === 'gate') w.logger.gateConnected = on;
  else return { ok: false, code: 'UNKNOWN' };
  if (on) {
    rearmErrF8(w, 'E23');
    flagF8(w, `connected:${ch}`);
  }
  emitF8(w, on ? 'CHANNEL_ON' : 'CHANNEL_OFF', 'INFO', { ch });
  return { ok: true };
}

function zeroEncoder(w: F08World): F08DispatchResult {
  const e = w.encoder;
  if (!e.connected) return { ok: false, code: 'NOT_CONNECTED' };
  if (spinningF8(w)) return { ok: false, code: 'BUSY' };
  e.zeroAt = w.rotor.theta;
  e.zeroErr = wrap(w.rotor.theta - w.markTheta);
  e.zeroed = true;
  const ok = Math.abs(e.zeroErr) <= 1 * DEG;
  if (ok) {
    rearmErrF8(w, 'E06');
    flagF8(w, 'encZeroed');
  }
  emitF8(w, ok ? 'ENCODER_ZEROED' : 'ENCODER_ZEROED_OFF', ok ? 'INFO' : 'WARN', { deg: Math.round((e.zeroErr / DEG) * 10) / 10 });
  return { ok: true };
}

/** Tensión verdadera de la cuerda en este instante (N). */
function tensionNow(w: F08World): number {
  return tautF8(w) ? w.lastT : 0;
}

function zeroTension(w: F08World): F08DispatchResult {
  const t = w.tension;
  if (!t.connected) return { ok: false, code: 'NOT_CONNECTED' };
  const f = tensionNow(w);
  t.offset = -f * Math.cos(t.angleDeg * DEG) * t.scale;
  t.zeroed = Math.abs(f) < 0.005;
  if (t.zeroed) {
    rearmErrF8(w, 'E21');
    flagF8(w, 'tensionZeroed');
  }
  emitF8(w, t.zeroed ? 'TENSION_ZEROED' : 'TENSION_ZEROED_LOADED', t.zeroed ? 'INFO' : 'WARN');
  return { ok: true };
}

const FLAG_ERR: Record<string, [string, string]> = {
  ECCENTRIC: ['E01', 'RING_ECCENTRIC'],
  MASS_SLID: ['E03', 'MASS_SLID'],
  ASYMMETRIC: ['E04', 'ASYMMETRIC_MASSES'],
  OVERLAP: ['E05', 'STRING_OVERLAP'],
  ENC_OFFSET: ['E06', 'ENCODER_OFFSET'],
  REVERSED: ['E07', 'ENCODER_REVERSED'],
  STRING_INCLINED: ['E10', 'STRING_INCLINED'],
  TOUCHED: ['E11', 'HUB_TOUCHED'],
  GROUND_HIT: ['E12', 'GROUND_HIT'],
  SPINNING_START: ['E14', 'SPINNING_START'],
  OVERSPEED: ['E18', 'OVERSPEED'],
  NOT_ZEROED: ['E21', 'NOT_ZEROED'],
  CLIPPED: ['E22', 'TACH_SATURATED'],
  UNPLUGGED: ['E23', 'NO_SIGNAL'],
  LOW_RATE: ['E24', 'LOW_RATE'],
  OCCLUDED: ['E25', 'BEAM_OCCLUDED'],
  TILTED_SENSOR: ['E26', 'SENSOR_TILTED'],
  UNCALIBRATED: ['E27', 'ENCODER_UNCALIBRATED'],
  SUPPORT_MOVED: ['E28', 'SUPPORT_MOVED'],
  CONFIG_CHANGED: ['E32', 'CONFIG_DURING_RUN'],
  POST_IMPACT: ['E39', 'READ_AFTER_IMPACT'],
};

/** Banderas de calidad comunes a todas las lecturas de un ensayo. */
function runFlags(rec: RunRecord, out: string[]) {
  const su = rec.setup;
  if (su.eccMm > 1) out.push('ECCENTRIC');
  if (su.asym) out.push('ASYMMETRIC');
  if (su.overlap) out.push('OVERLAP');
  if (Math.abs(su.stringDeg) > 3) out.push('STRING_INCLINED');
  if (Math.abs(su.startOmega) > 0.05) out.push('SPINNING_START');
  if (!su.baseClamped || rec.driftM > 0.001) out.push('SUPPORT_MOVED');
  if (su.damaged || rec.guardHitT !== null) out.push('POST_IMPACT');
  if (rec.slidT !== null) out.push('MASS_SLID');
  if (rec.touchT !== null) out.push('TOUCHED');
  if (rec.groundT !== null) out.push('GROUND_HIT');
  if (rec.overspeedT !== null) out.push('OVERSPEED');
  if (rec.configChangedT !== null) out.push('CONFIG_CHANGED');
}

const raiseFlags = (w: F08World, qf: string[], inst: string) => {
  for (const f of qf) if (FLAG_ERR[f]) errF8(w, FLAG_ERR[f][0], FLAG_ERR[f][1], 'WARN', { inst });
};

/** Ajuste cuadrático por mínimos cuadrados y = a + b t + c t² (null con menos de 3 puntos). */
export function quadFit(ts: number[], ys: number[]): { a: number; b: number; c: number } | null {
  const n = ts.length;
  if (n < 3) return null;
  // Centrado en t para estabilidad numérica.
  const tm = ts.reduce((s, x) => s + x, 0) / n;
  let s1 = 0, s2 = 0, s3 = 0, s4 = 0, y0 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < n; i++) {
    const u = ts[i] - tm;
    const u2 = u * u;
    s1 += u; s2 += u2; s3 += u2 * u; s4 += u2 * u2;
    y0 += ys[i]; y1 += ys[i] * u; y2 += ys[i] * u2;
  }
  const M = [[n, s1, s2], [s1, s2, s3], [s2, s3, s4]];
  const det = (m: number[][]) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(M);
  if (!Number.isFinite(D) || Math.abs(D) < 1e-18) return null;
  const col = (k: number) => M.map((row, i) => row.map((v, j) => (j === k ? [y0, y1, y2][i] : v)));
  const A = det(col(0)) / D;
  const B = det(col(1)) / D;
  const C = det(col(2)) / D;
  // Volver al origen de t: y = A + B (t − tm) + C (t − tm)².
  return { a: A - B * tm + C * tm * tm, b: B - 2 * C * tm, c: C };
}

const lastRun = (w: F08World) => w.runs[w.runs.length - 1];

function readEncoder(w: F08World): F08DispatchResult {
  const rec = lastRun(w);
  if (!rec) return { ok: false, code: 'NO_RUN' };
  if (!rec.done) return { ok: false, code: 'BUSY' };
  const p = w.params;
  const su = rec.setup;
  const e = su.enc;
  const flags: string[] = [];
  runFlags(rec, flags);
  if (!e.connected) flags.push('UNPLUGGED');
  if (!e.zeroed || Math.abs(e.zeroErrDeg) > 1) flags.push('ENC_OFFSET');
  if (!e.calibrated) flags.push('UNCALIBRATED');
  if (e.dir < 0) flags.push('REVERSED');
  if (su.rateHz < 50) flags.push('LOW_RATE');
  if (rec.slackT === null) flags.push('NO_SLACK');
  const qf = [...new Set(flags)];
  raiseFlags(w, qf, 'encoder01');
  // Indicación del encoder en cada muestra (con el estado del encoder al soltar), cuantizada a 0,1°.
  const zeroAt = w.encoder.zeroAt;
  const ind = (th: number) => quant(e.dir * e.scale * ((th - zeroAt) / DEG) + gaussF8(w) * 0.03 * p.noiseFactor, p.encoderResDeg) * DEG;
  const tS = rec.slackT ?? Infinity;
  const pull = rec.samples.filter((x) => x[0] > 0.02 && x[0] < tS - 0.02);
  const coast = rec.samples.filter((x) => x[0] > tS + 0.1 && Math.abs(x[2]) > 1e-3);
  const fitP = e.connected ? quadFit(pull.map((x) => x[0]), pull.map((x) => ind(x[1]))) : null;
  const fitC = e.connected ? quadFit(coast.map((x) => x[0]), coast.map((x) => ind(x[1]))) : null;
  const tp = quadFit(pull.map((x) => x[0]), pull.map((x) => x[1]));
  const tc = quadFit(coast.map((x) => x[0]), coast.map((x) => x[1]));
  const rr = (x: number | undefined) => (x === undefined ? NaN : Math.round(x * 1e5) / 1e5);
  const value = rr(fitP?.c);
  const r = addReading(w, {
    kind: 'encoder', instrumentId: 'encoder01', value, unit: 'rad/s²', resolution: 1e-5, uncertainty: p.uB.encoderDeg * DEG, sourceObjectIds: ['encoder01', 'logger01', 'hub01'], qualityFlags: qf,
    trueValue: tp ? tp.c : NaN, target: 'rotor', trial: rec.id, configVersion: rec.configVersion,
    fit: {
      a: fin(rr(fitP?.a)), b: fin(rr(fitP?.b)), c: fin(value), cc: fin(rr(fitC?.c)), tS: fin(rec.slackT), n: pull.length, nc: coast.length,
      trueAlpha: fin(tp ? 2 * tp.c : NaN), trueAlphaC: fin(tc ? 2 * tc.c : NaN), trueOmegaS: fin(rec.slackOmega), trueThetaS: fin(rec.slackTheta), trueI: su.trueI,
    },
    setup: { ...su },
  });
  emitF8(w, 'ENCODER_READ', qf.length ? 'WARN' : 'INFO', { c: value, n: pull.length });
  return { ok: true, id: r.id, value };
}

function readTension(w: F08World): F08DispatchResult {
  const rec = lastRun(w);
  if (!rec) return { ok: false, code: 'NO_RUN' };
  if (!rec.done) return { ok: false, code: 'BUSY' };
  const p = w.params;
  const su = rec.setup;
  const t = su.ten;
  const flags: string[] = [];
  runFlags(rec, flags);
  if (!t.connected) flags.push('UNPLUGGED');
  if (!t.zeroed) flags.push('NOT_ZEROED');
  if (t.angleDeg >= 3) flags.push('TILTED_SENSOR');
  const tS = rec.slackT ?? Infinity;
  const rows = rec.samples.filter((x) => x[0] > 0.1 && x[0] < tS - 0.05);
  if (rows.length < 3) flags.push('NO_DATA');
  const st = { offset: w.tension.offset, scale: w.tension.scale, angleDeg: t.angleDeg, rangeIdx: t.range };
  let clipped = false;
  const vals = rows.map((x) => {
    const fi = forceIndication(x[3], st, p.tension, gaussF8(w) * p.noiseFactor);
    clipped ||= fi.clipped;
    return fi.value;
  });
  if (clipped) flags.push('CLIPPED');
  const qf = [...new Set(flags)];
  raiseFlags(w, qf.filter((f) => f !== 'CLIPPED'), 'tension01');
  const trueT = rows.length ? rows.reduce((s, x) => s + x[3], 0) / rows.length : NaN;
  const value = t.connected && vals.length ? quant(vals.reduce((s, x) => s + x, 0) / vals.length, p.tension.resolutions[t.range] ?? 0.001) : NaN;
  const r = addReading(w, {
    kind: 'tension', instrumentId: 'tension01', value, unit: 'N', resolution: p.tension.resolutions[t.range] ?? 0.001, uncertainty: p.uB.tensionN, sourceObjectIds: ['tension01', 'logger01'], qualityFlags: qf,
    trueValue: trueT, target: 'string', trial: rec.id, configVersion: rec.configVersion, setup: { ...su },
  });
  emitF8(w, 'TENSION_READ', qf.length ? 'WARN' : 'INFO', { N: value });
  return { ok: true, id: r.id, value };
}

function readTach(w: F08World): F08DispatchResult {
  const p = w.params;
  const t = w.tach;
  const live = runningRunF8(w) || (!lastRun(w) && spinningF8(w));
  const rec = lastRun(w);
  if (!live && !rec) return { ok: false, code: 'NO_RUN' };
  const flags: string[] = [];
  if (rec && !live) runFlags(rec, flags);
  if (!t.connected) flags.push('UNPLUGGED');
  if (live) {
    flags.push('UNSTABLE');
    errF8(w, 'E30', 'READ_BEFORE_STABLE', 'WARN', { inst: 'tach01' });
  }
  const omega = live ? Math.abs(w.rotor.omega) : rec!.peakOmega;
  const trueRpm = (omega * 60) / TAU;
  const range = p.tach.ranges[t.rangeIdx];
  const raw = trueRpm + gaussF8(w) * p.tach.noiseRpm * p.noiseFactor;
  if (raw > range) flags.push('CLIPPED');
  const qf = [...new Set(flags)];
  raiseFlags(w, qf, 'tach01');
  const value = t.connected ? quant(Math.min(range, raw), p.tach.resolutions[t.rangeIdx]) : NaN;
  const r = addReading(w, {
    kind: 'tach', instrumentId: 'tach01', value, unit: 'rpm', resolution: p.tach.resolutions[t.rangeIdx], uncertainty: p.uB.tachRpm, sourceObjectIds: ['tach01', 'hub01'], qualityFlags: qf,
    trueValue: trueRpm, target: 'rotor', trial: rec?.id ?? w.trial, configVersion: rec?.configVersion ?? w.configVersion,
    tach: { peak: !live, trueRpm: fin(trueRpm) }, setup: rec ? { ...rec.setup } : undefined,
  });
  emitF8(w, 'TACH_READ', qf.length ? 'WARN' : 'INFO', { rpm: value });
  return { ok: true, id: r.id, value };
}

function readGate(w: F08World): F08DispatchResult {
  const rec = lastRun(w);
  if (!rec) return { ok: false, code: 'NO_RUN' };
  if (!rec.done) return { ok: false, code: 'BUSY' };
  const p = w.params;
  const su = rec.setup;
  const flags: string[] = [];
  runFlags(rec, flags);
  if (!su.gateConnected) flags.push('UNPLUGGED');
  if (su.catchOn && Math.abs(su.catchZ - su.gateZ) < 2) flags.push('OCCLUDED');
  if (rec.gateOut === null || rec.gateIn === null) flags.push('NO_PASS');
  const qf = [...new Set(flags)];
  raiseFlags(w, qf, 'gate01');
  const ok = su.gateConnected && !qf.includes('OCCLUDED') && rec.gateIn !== null && rec.gateOut !== null;
  const dt = ok ? timerIndication((rec.gateOut as number) - (rec.gateIn as number), p.gate, gaussF8(w)) : null;
  const value = dt ?? NaN;
  const r = addReading(w, {
    kind: 'gate', instrumentId: 'gate01', value, unit: 's', resolution: p.gate.resolutionS, uncertainty: p.uB.gateS, sourceObjectIds: ['gate01', 'logger01', su.mass ?? 'drop50'], qualityFlags: qf,
    trueValue: rec.gateIn !== null && rec.gateOut !== null ? rec.gateOut - rec.gateIn : NaN, target: su.mass ?? 'mass', trial: rec.id, configVersion: rec.configVersion,
    gate: { dt: fin(value), trueV: fin(rec.gateV) }, setup: { ...su },
  });
  emitF8(w, 'GATE_READ', qf.length ? 'WARN' : 'INFO', { s: value });
  return { ok: true, id: r.id, value };
}

// ─────────────────────────── Cierre y bloqueos ───────────────────────────

function closeStation(w: F08World): F08DispatchResult {
  if (busyF8(w) || spinningF8(w)) return { ok: false, code: 'BUSY' };
  if (!w.rotor.brake) return { ok: false, code: 'BRAKE_OFF' };
  if (w.string.mass) return { ok: false, code: 'MASS_HUNG' };
  if (w.rotor.solid) return { ok: false, code: 'SOLID_MOUNTED' };
  if (!w.base.guardClosed) return { ok: false, code: 'GUARD_OPEN' };
  if (w.balance.on) return { ok: false, code: 'PAN_BUSY' };
  if (DROPS.some((d) => w.objects[d].support !== 'massRack') || SOLIDS.some((s) => w.objects[s].support !== 'rack')) return { ok: false, code: 'ITEMS_OUT' };
  flagF8(w, 'stationClosed');
  emitF8(w, 'STATION_CLOSED', 'INFO');
  return { ok: true };
}

function acknowledge(w: F08World): F08DispatchResult {
  const b = w.safety.block;
  if (!b) return { ok: true };
  if (spinningF8(w) || !w.rotor.brake) return { ok: false, code: 'SECURE_FIRST' };
  if (b.code === 'HAND_IN_PLANE' && !w.base.guardClosed) return { ok: false, code: 'SECURE_FIRST' };
  w.safety.block = null;
  emitF8(w, 'STATION_RESET', 'INFO', { code: b.code });
  return { ok: true };
}

// ─────────────────────────── Paso: rotor y masa ───────────────────────────

/** Torque de roce total (N·m, ≥ 0) para la velocidad actual. */
export function frictionNm(w: F08World): number {
  const p = w.params;
  const r = w.rotor;
  let f = (p.scientificMode === 'REALISTIC' ? p.bearingNm : 0) + p.frictionNm;
  f += p.imbalanceK * imbalance(w) * r.omega * r.omega;
  if (r.brake) f += p.brakeNm;
  if (r.touch) f += p.touchNm;
  if (scraping(w)) f += GUARD_RUB;
  return f;
}

function overspeed(w: F08World, run: RunRecord | null) {
  const r = w.rotor;
  if (r.tripped) return;
  // Protección de sobrevelocidad: el freno del eje actúa solo (F08-E18).
  r.tripped = true;
  r.brake = true;
  if (run && run.overspeedT === null) run.overspeedT = r4(w.timeS - run.startS);
  errF8(w, 'E18', 'OVERSPEED', 'WARN', { rpm: Math.round((Math.abs(r.omega) * 60) / TAU) });
}

/** Masas corredizas sueltas: se deslizan hacia afuera si ω² r supera μ g (se conserva L del rotor). */
function slideStep(w: F08World, run: RunRecord | null, h: number) {
  if (!slidesOnRotor(w)) return;
  const p = w.params;
  for (const k of SLIDES) {
    const s = w.slides[k];
    if (s.locked || s.r >= p.slideMaxR - 1e-9) continue;
    if (w.rotor.omega ** 2 * s.r <= p.slideMu * p.g) continue;
    const E0 = mechanicalEnergyJ(w);
    const L = angularMomentum(w);
    s.r = Math.min(p.slideMaxR, s.r + 0.5 * h);
    w.rotor.omega = L / rotorI(w);
    if (tautF8(w)) w.string.v = w.rotor.omega * effectiveR(w);
    w.energy.dissipatedJ += E0 - mechanicalEnergyJ(w);
    if (run && run.slidT === null) {
      run.slidT = r4(w.timeS - run.startS);
      errF8(w, 'E03', 'MASS_SLID', 'WARN', { id: k });
    }
  }
}

/** Golpe de una masa corrediza contra la guarda cerrada: el rotor se detiene y la barra queda marcada. */
function guardCheck(w: F08World, run: RunRecord | null) {
  if (!scraping(w) || !spinningF8(w, 0.05)) return;
  if (w.evidence.__guardHit === w.trial + 1) return;
  w.evidence.__guardHit = w.trial + 1;
  const E0 = mechanicalEnergyJ(w);
  w.rotor.omega = 0;
  if (tautF8(w)) w.string.v = 0;
  w.energy.dissipatedJ += E0 - mechanicalEnergyJ(w);
  w.damaged.bar01 = true;
  if (run && run.guardHitT === null) run.guardHitT = r4(w.timeS - run.startS);
  bumpF8(w, 'guardHit');
  emitF8(w, 'GUARD_HIT', 'WARN', { id: 'bar01' });
}

function stepRotor(w: F08World, t0: number, h: number) {
  const run = runningRunF8(w) ? w.run : null;
  const p = w.params;
  const rot = w.rotor;
  const s = w.string;
  slideStep(w, run, h);
  guardCheck(w, run);
  const taut = tautF8(w);
  const I = rotorI(w);
  const r = effectiveR(w);
  const c = Math.cos(stringPhi(w));
  const m = taut ? dropKgF8(w, s.mass) : 0;
  const drive = m * p.g * r * c;
  const Ieff = I + m * r * r * c;
  const tf = frictionNm(w);
  const w0 = rot.omega;
  let w1: number;
  let path: number;
  let dth: number;
  let alpha: number;
  const startFrom = (dur: number) => {
    // Desde el reposo: arranca solo si el torque motor vence al roce estático.
    if (Math.abs(drive) <= tf) return { w: 0, th: 0, a: 0 };
    const a = (drive - sgn(drive) * tf) / Ieff;
    return { w: a * dur, th: 0.5 * a * dur * dur, a };
  };
  if (Math.abs(w0) < 1e-9) {
    const st = startFrom(h);
    w1 = st.w;
    dth = st.th;
    path = Math.abs(dth);
    alpha = st.a;
  } else {
    const a = (drive - sgn(w0) * tf) / Ieff;
    const wn = w0 + a * h;
    if (tf > 0 && sgn(wn) !== sgn(w0)) {
      // Pasó por cero dentro del subpaso: desde ahí el roce cambia de sentido (o lo deja quieto).
      const tz = Math.abs(w0 / a);
      const th1 = 0.5 * w0 * tz;
      const st = startFrom(h - tz);
      w1 = st.w;
      dth = th1 + st.th;
      path = Math.abs(th1) + Math.abs(st.th);
      alpha = st.a || a;
    } else {
      w1 = wn;
      dth = 0.5 * (w0 + wn) * h;
      path = Math.abs(dth);
      alpha = a;
    }
  }
  rot.omega = w1;
  rot.theta += dth;
  w.lastT = taut ? m * (p.g - alpha * r) : 0;
  // Energía disipada exacta para torque constante: roce τ_f |Δθ| y roce de la cuerda inclinada T (1 − cos φ) Δy.
  w.energy.dissipatedJ += tf * path + (taut ? w.lastT * (1 - c) * r * dth : 0);
  if (taut) {
    s.unwound += dth;
    s.y += r * dth;
    s.v = r * w1;
    // Base sin sujetar: la tensión la arrastra hacia la polea y la masa baja un poco más (F08-E28).
    if (!w.base.clamped && w.lastT > 0 && w.base.driftM < p.creepMax) {
      const dd = Math.min(p.creepMax - w.base.driftM, p.creepK * w.lastT * h);
      w.base.driftM += dd;
      s.y += dd;
      w.energy.dissipatedJ += m * p.g * dd;
      if (run) run.driftM = r6(run.driftM + dd);
    }
  }
  if (Math.abs(rot.omega) > p.omegaMax) overspeed(w, run);
  if (run) {
    const tRel = t0 + h - run.startS;
    run.peakOmega = Math.max(run.peakOmega, Math.abs(rot.omega));
    if (taut) gateCheck(w, run, t0, h);
    if (taut) landCheck(w, run, tRel);
    sample(w, run, tRel);
    finishCheck(w, run, tRel, h);
  } else if (taut) landCheck(w, null, 0);
}

/** La bandera bajo la masa cruza el haz de la fotopuerta: entrada y salida interpoladas dentro del subpaso. */
function gateCheck(w: F08World, run: RunRecord, t0: number, h: number) {
  const s = w.string;
  const z1 = massZ(w);
  const v = s.v;
  if (v <= 0) return;
  const z0 = z1 + v * h * 100;
  const g = w.column.gateZ;
  const fw = GEOF08.mass.flag;
  const at = (zEdge: number) => t0 - run.startS + Math.max(0, Math.min(1, (z0 - zEdge) / (z0 - z1))) * h;
  // Entrada: la base de la bandera llega al haz; salida: su borde superior lo deja.
  if (run.gateIn === null && z0 > g && z1 <= g) run.gateIn = r6(at(g));
  if (run.gateIn !== null && run.gateOut === null && z0 > g - fw && z1 <= g - fw) {
    run.gateOut = r6(at(g - fw));
    run.gateV = r6(v);
  }
}

function landCheck(w: F08World, run: RunRecord | null, tRel: number) {
  const s = w.string;
  const stop = stopZF8(w);
  if (massZ(w) > stop) return;
  const m = dropKgF8(w, s.mass);
  const vi = s.v;
  // La masa se detiene: su cinética se disipa (tope blando o piso) y el lazo se suelta del pasador.
  w.energy.dissipatedJ += 0.5 * m * vi * vi;
  s.v = 0;
  s.landed = true;
  s.attached = false;
  w.lastT = 0;
  if (run && run.slackT === null) {
    run.slackT = r6(tRel);
    run.slackTheta = r6(s.unwound);
    run.slackOmega = r6(w.rotor.omega);
  }
  if (!w.column.catchOn) {
    if (run) run.groundT ??= r4(tRel);
    bumpF8(w, 'groundHit');
    errF8(w, 'E12', 'GROUND_HIT', 'WARN', { v: Math.round(vi * 100) / 100 });
  } else emitF8(w, 'MASS_CAUGHT', 'INFO', { v: Math.round(vi * 100) / 100 });
}

/** Registrador: [t, θ, ω, T, y] al ritmo elegido (múltiplo del subpaso de 5 ms). */
function sample(w: F08World, run: RunRecord, tRel: number) {
  const s = w.string;
  while (run.nextT <= tRel + 1e-9) {
    run.samples.push([r6(run.nextT), r6(w.rotor.theta), r6(w.rotor.omega), r6(w.lastT), r6(s.y)]);
    run.nextT = r6(run.nextT + 1 / w.logger.rateHz);
  }
}

function finishCheck(w: F08World, run: RunRecord, tRel: number, h: number) {
  run.stillS = !spinningF8(w) ? run.stillS + h : 0;
  const coastDone = run.slackT !== null && tRel - run.slackT >= 2.5;
  if (tRel >= 40 || coastDone || (run.stillS >= 0.4 && tRel > 0.5)) {
    run.done = true;
    emitF8(w, 'RUN_DONE', 'INFO', { trial: run.id, s: Math.round(tRel * 100) / 100 });
  }
}

// ─────────────────────────── Paso de simulación ───────────────────────────

export function stepF08World(w: F08World): void {
  const dt = w.params.dtS;
  const n = Math.max(1, w.params.subSteps);
  const h = dt / n;
  const tStart = w.timeS;
  w.timeS = Math.round((w.timeS + dt) * 1e6) / 1e6;
  w.tick++;
  for (let i = 0; i < n; i++) stepRotor(w, tStart + i * h, h);
  w.rotor.theta = r6(w.rotor.theta);
  w.rotor.omega = Math.abs(w.rotor.omega) < 1e-9 ? 0 : w.rotor.omega;
}

export function runF08For(w: F08World, seconds: number) {
  const n = Math.round(seconds / w.params.dtS);
  for (let i = 0; i < n; i++) stepF08World(w);
}

export function f08Summary(w: F08World) {
  return {
    theta: r6(w.rotor.theta),
    omega: r6(w.rotor.omega),
    y: r6(w.string.y),
    solid: w.rotor.solid,
    trial: w.trial,
    readings: w.readingOrder.length,
    cfg: w.configVersion,
  };
}

export { DROPS, SLIDES, SOLIDS, SLIDE_HALF };
