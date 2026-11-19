/**
 * Mundo de F09 — movimiento circular, torque y momento angular: paso fijo determinista de 0,05 s con 10 subpasos de
 * 5 ms (§6). La escena solo dibuja este estado y envía hechos geométricos.
 *
 * - Mesa giratoria: I = I₀ + m_o r_o² + Σ m r². En cada subpaso el torque motor (control proporcional del motor con
 *   embrague, limitado), el del cordón del tambor (r F cos β del dinamómetro) y el roce de Coulomb (eje, freno,
 *   desbalance k U ω², inclinación del eje) son constantes: α = (τ_m + τ_c − sgn(ω) τ_f)/I, integrada exacta; si ω cruza
 *   cero el roce la detiene. El trabajo del motor y del dinamómetro es externo; el roce, disipado.
 * - Masa orbitante: el cordón que pasa por el eje hasta el sensor de fuerza sostiene T = m ω² r (la guía da la fuerza
 *   tangencial cuando ω cambia). Más allá del tope radial, o con el tope suelto, la masa sale de la guía al girar y
 *   golpea la guarda (F09-E01).
 * - Masas radiales: el cordón central las acerca a la velocidad de recogida; en cada subpaso I cambia y ω = L/I (sin
 *   torque externo L se conserva y K aumenta en el trabajo del cordón).
 * - Instrumentos: balanza de 0,1 g, regla radial de 0,1 cm, sensor de fuerza en el mástil (`instruments/force-sensor`),
 *   fotopuerta con cronómetro de 0,1 ms en el borde de la plataforma, encoder de 0,001 rad/s con ajuste lineal ω(t) y
 *   el dinamómetro del carro de fuerza constante (0,05 N, alcance 5 N).
 */
import type { Channel, F09Command, F09DispatchResult, PpeItem, RadiusTarget } from './commands';
import type { F09Object, F09Params, F09World, Pose, PullRun, ReadingF9, RunSetup, SlideId, SpinTrial } from './types';
import { hashRandom } from '../core/rng';
import { bumpF9, emitF9, errF9, flagF9, gaussF9, rearmErrF9 } from './events';
import {
  MASSES, SLIDES, angularMomentum, centripetalN, conservedTotalsF09, imbalance, mechanicalEnergyJ, orbitOnGuide, rotorI, slideAsymmetry, slideOnBar,
} from './conservation';
import { timerIndication } from '../instruments/photogate';
import { forceIndication, quantizeReading } from '../instruments/force-sensor';

export { emitF9, latchF9, rearmF9, bumpF9, flagF9, errF9 } from './events';
export { conservedTotalsF09, rotorI, angularMomentum, imbalance, centripetalN };

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, num(v, a)));
const DEG = Math.PI / 180;
const TAU = 2 * Math.PI;
const sgn = (x: number) => (x > 0 ? 1 : x < 0 ? -1 : 0);
const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
const isSlide = (s: unknown): s is SlideId => SLIDES.includes(s as SlideId);
const isMass = (s: unknown): s is (typeof MASSES)[number] => MASSES.includes(s as (typeof MASSES)[number]);
/** ω por debajo de la cual la mesa se considera quieta para las manos (rad/s). */
const HAND_SAFE = 0.3;
/** |dω/dt| por encima de la cual una lectura no es estacionaria (rad/s²). */
const ACCEL_LIM = 0.15;
const RPM = 60 / TAU;

/** Escenarios docentes (§10). */
export const SF9 = {
  SLOW: 'F09-S01_slow_orbit',
  FAST: 'F09-S02_fast_orbit',
  SMALL_R: 'F09-S03_small_radius',
  LARGE_R: 'F09-S04_large_radius',
  BRAKE: 'F09-S05_external_brake',
  MOVING: 'F09-S06_moving_masses',
  LOW_FRICTION: 'F09-S07_low_friction',
  TILTED: 'F09-S08_tilted_axis',
  SATURATED: 'F09-S09_saturated_sensor',
  TANGENTIAL: 'F09-S10_tangential_torque',
  OBLIQUE: 'F09-S11_oblique_torque',
  ASYM: 'F09-S12_asymmetric_pair',
} as const;

export interface F09WorldSpec {
  objects: F09Object[];
  scenarios: string[];
  mode: string;
}

// ─────────────────────────── Creación ───────────────────────────

export function createF09World(spec: F09WorldSpec, seed: number, params: F09Params): F09World {
  const has = (s: string) => spec.scenarios.includes(s);
  const objects: Record<string, F09Object> = {};
  for (const o of spec.objects) objects[o.id] = { ...o, pose: { ...o.pose } };
  const h = (k: string) => hashRandom(seed, k) - 0.5;
  const sign = (k: string) => (h(k) > 0 ? 1 : -1);
  const realistic = params.scientificMode === 'REALISTIC';
  const offs = Math.round(sign('fS') * params.force.offsetN * (0.4 + (h('f') + 0.5) * 0.6) * 1000) / 1000;
  const dynOff = Math.round(sign('dS') * params.dyn.offsetN * (0.5 + (h('d') + 0.5) * 0.5) * 100) / 100;
  const tilt = has(SF9.TILTED) ? 4 : realistic ? Math.round((0.6 + (h('tilt') + 0.5) * 0.6) * 10) / 10 : 0;
  const theta0 = Math.round((h('th') + 0.5) * TAU * 1e4) / 1e4;
  const w: F09World = {
    timeS: 0, tick: 0, seed, rng: seed >>> 0 || 1, params, mode: spec.mode, objects,
    rotor: { theta: theta0, omega: 0, brake: has(SF9.BRAKE) ? 1 : 2, tiltDeg: tilt, tripped: false },
    orbit: { r: 0.2, stopLocked: false, slackM: realistic ? params.slackM : 0, off: false },
    slides: has(SF9.ASYM)
      ? { slide1: { r: 0.25, locked: true }, slide2: { r: 0.15, locked: true } }
      : has(SF9.MOVING)
        ? { slide1: { r: 0.12, locked: false }, slide2: { r: 0.18, locked: false } }
        : { slide1: { r: 0.15, locked: true }, slide2: { r: 0.15, locked: true } },
    pullTarget: null,
    drum: { armR: params.armRadii[0] ?? 0.1, turns: 0, dir: 1, unwound: 0, pullN: 0, aimDeg: has(SF9.OBLIQUE) ? 25 : 0, pulling: false },
    motor: { target: 0, clutch: false, tau: 0 },
    base: { clamped: false, driftRad: 0, guardClosed: false },
    encoder: { connected: false, scale: params.encoderUncalScale, calibrated: false },
    force: { connected: false, offset: offs, zeroed: false, scale: params.force.uncalScale, rangeIdx: has(SF9.SATURATED) ? 0 : 1, angleDeg: 0 },
    gate: { connected: false, cableRouted: false },
    dyn: { offset: dynOff, zeroed: Math.abs(dynOff) < 1e-9 },
    logger: { rateHz: params.rates[1] ?? 20 },
    damaged: false,
    balance: { on: null, placedS: -10, offsetG: Math.round(sign('balS') * (0.5 + (h('bal') + 0.5) * 1.5) * 10) / 10, tared: false },
    spin: null, timing: null, run: null, runs: [], omegaLog: [],
    energy: { dissipatedJ: 0, externalJ: 0, motorJ: 0, pullJ: 0 },
    trial: 0,
    configVersion: 1,
    readings: {}, readingOrder: [],
    safety: { ppe: { coat: false, goggles: false, shoes: false, hair: false }, block: null, stoppedByTeacher: false },
    events: [], evidence: {}, scenarios: [...spec.scenarios], ppe: false,
    initialTotals: { massesG: 0 },
  };
  w.initialTotals = { massesG: conservedTotalsF09(w).massesG };
  w.energy.externalJ = mechanicalEnergyJ(w);
  return w;
}

// ─────────────────────────── Consultas ───────────────────────────

export const pullingF9 = (w: F09World) => !!w.run && !w.run.done;
export const spinningF9 = (w: F09World, lim = 1e-3) => Math.abs(w.rotor.omega) > lim;
/** El motor está acoplado con una consigna distinta de cero. */
export const motorOnF9 = (w: F09World) => w.motor.clutch && Math.abs(w.motor.target) > 1e-9;
export const busyF9 = (w: F09World) => pullingF9(w) || !!w.timing || w.pullTarget !== null;
/** El haz de la fotopuerta queda tapado por el cable suelto del sensor de fuerza. */
export const gateOccludedF9 = (w: F09World) => !w.gate.cableRouted;

/** Aceleración angular máxima de la mesa en el último segundo (rad/s²), desde el registro de ω. */
export function recentAccel(w: F09World, windowS = 1): number {
  const L = w.omegaLog;
  let m = 0;
  for (let i = 1; i < L.length; i++) {
    if (L[i][0] < w.timeS - windowS) continue;
    const dt = L[i][0] - L[i - 1][0];
    if (dt > 0) m = Math.max(m, Math.abs((L[i][1] - L[i - 1][1]) / dt));
  }
  return m;
}

/** ω media de la ventana más reciente (rad/s). */
function windowOmega(w: F09World, windowS: number): number {
  const xs = w.omegaLog.filter((x) => x[0] > w.timeS - windowS - 1e-9).map((x) => x[1]);
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : w.rotor.omega;
}

// ─────────────────────────── Despacho ───────────────────────────

const BEFORE_PPE = new Set<F09Command['type']>(['equipPpe', 'startWork', 'teacherStop', 'acknowledge', 'inspect']);
const DURING_BLOCK = new Set<F09Command['type']>(['acknowledge', 'teacherStop', 'inspect', 'setPose', 'setBrake', 'setGuard', 'setMotor', 'setClutch', 'reseatOrbit', 'repairGuide', 'stopPull']);
/** Comandos que cambian la condición física del ensayo (nuevo montaje; F09-E32 si la mesa gira con un ensayo abierto). */
const CONFIG = new Set<F09Command['type']>([
  'clampBase', 'levelAxis', 'mountOrbit', 'setOrbitRadius', 'lockStop', 'tightenCord', 'setArm', 'aimDyn', 'setSlide', 'lockMass', 'connect', 'zeroForce', 'setForceRange',
  'mountForce', 'routeCable', 'calibrateEncoder', 'setRate', 'zeroDyn',
]);
/** Gestos con la mano dentro de la guarda. */
const HAND_IN_PLANE = new Set<F09Command['type']>(['mountOrbit', 'setOrbitRadius', 'lockStop', 'tightenCord', 'reseatOrbit', 'repairGuide', 'setSlide', 'lockMass', 'setArm', 'windCord', 'handBrake']);

export function dispatchF09(w: F09World, cmd: F09Command): F09DispatchResult {
  if (!cmd || typeof cmd !== 'object') return { ok: false, code: 'UNKNOWN' };
  if (w.safety.stoppedByTeacher && cmd.type !== 'teacherStop') return { ok: false, code: 'TEACHER_STOP' };
  if (!w.ppe && !BEFORE_PPE.has(cmd.type)) return { ok: false, code: 'PPE' };
  if (w.safety.block && !DURING_BLOCK.has(cmd.type)) return { ok: false, code: 'BLOCKED' };
  // Trabajo externo: lo que el gesto cambia en la energía (mecánica + disipada).
  const S0 = mechanicalEnergyJ(w) + w.energy.dissipatedJ;
  const before = w.configVersion;
  const moving = spinningF9(w, 0.05) && !!w.spin;
  const res = route(w, cmd);
  w.energy.externalJ += mechanicalEnergyJ(w) + w.energy.dissipatedJ - S0;
  if (res.ok && CONFIG.has(cmd.type)) {
    if (w.configVersion === before) w.configVersion++;
    const sp = moving ? w.spin : null;
    if (sp && sp.configChangedT === null) {
      sp.configChangedT = r4(w.timeS - sp.startS);
      if (w.run && !w.run.done) w.run.configChangedT ??= r4(w.timeS - w.run.startS);
      errF9(w, 'E32', 'CONFIG_DURING_RUN', 'WARN', { cmd: cmd.type });
    }
  }
  return res;
}

function route(w: F09World, cmd: F09Command): F09DispatchResult {
  // Mano dentro de la guarda con la mesa girando (F09-E20): freno de emergencia y bloqueo de contacto.
  if (HAND_IN_PLANE.has(cmd.type)) {
    if (w.base.guardClosed) return { ok: false, code: 'GUARD_CLOSED' };
    if (spinningF9(w, HAND_SAFE)) {
      w.rotor.brake = 2;
      w.motor.clutch = false;
      w.motor.target = 0;
      bumpF9(w, 'handContact');
      errF9(w, 'E20', 'HAND_CONTACT', 'CRITICAL', { omega: Math.round(Math.abs(w.rotor.omega) * 10) / 10 });
      w.safety.block = { code: 'HAND_CONTACT', since: w.timeS };
      return { ok: false, code: 'HAND_CONTACT' };
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
    // Balanza y regla
    case 'tareBalance':
      if (w.balance.on) return { ok: false, code: 'PAN_NOT_EMPTY' };
      w.balance.offsetG = 0;
      w.balance.tared = true;
      rearmErrF9(w, 'E21');
      flagF9(w, 'balanceTared');
      emitF9(w, 'BALANCE_TARED', 'INFO');
      return { ok: true };
    case 'placeOnBalance':
      return placeOnBalance(w, String(cmd.id));
    case 'removeFromBalance':
      return removeFromBalance(w);
    case 'readBalance':
      return readBalance(w);
    case 'readRadius':
      return readRadius(w, cmd.target, cmd.ref === 'edge' ? 'edge' : 'center', num(cmd.viewDeg));
    // Base, nivel, guarda, freno y motor
    case 'clampBase':
      w.base.clamped = !!cmd.on;
      if (cmd.on) {
        rearmErrF9(w, 'E28');
        flagF9(w, 'baseClamped');
      }
      emitF9(w, cmd.on ? 'BASE_CLAMPED' : 'BASE_LOOSE', cmd.on ? 'INFO' : 'WARN');
      return { ok: true };
    case 'levelAxis':
      if (spinningF9(w)) return { ok: false, code: 'BUSY' };
      w.rotor.tiltDeg = 0;
      rearmErrF9(w, 'E17');
      flagF9(w, 'axisLevelled');
      emitF9(w, 'AXIS_LEVELLED', 'INFO');
      return { ok: true };
    case 'setGuard':
      if (!cmd.closed && motorOnF9(w)) return { ok: false, code: 'MOTOR_ON' };
      w.base.guardClosed = !!cmd.closed;
      emitF9(w, cmd.closed ? 'GUARD_CLOSED' : 'GUARD_OPENED', 'INFO');
      return { ok: true };
    case 'setBrake': {
      const lv = Math.round(clamp(cmd.level, 0, 2)) as 0 | 1 | 2;
      w.rotor.brake = lv;
      if (lv === 0 && !spinningF9(w)) w.rotor.tripped = false;
      if (lv === 0) rearmErrF9(w, 'E10');
      if (lv > 0 && spinningF9(w, 0.05) && w.spin) w.spin.brakeT ??= r4(w.timeS - w.spin.startS);
      if (lv > 0 && w.run && !w.run.done) w.run.brakeT ??= r4(w.timeS - w.run.startS);
      emitF9(w, `BRAKE_${lv}`, 'INFO');
      return { ok: true, value: lv };
    }
    case 'handBrake': {
      // Con la mesa quieta, apoyar la mano no hace nada (la regla de arriba ya bloqueó si giraba).
      emitF9(w, 'HAND_ON_TABLE', 'INFO');
      return { ok: true };
    }
    case 'setClutch':
      return setClutch(w, !!cmd.on);
    case 'setMotor':
      return setMotor(w, num(cmd.rpm));
    // Masa orbitante
    case 'mountOrbit':
      return mountOrbit(w, !!cmd.on);
    case 'setOrbitRadius': {
      if (!orbitOnGuide(w)) return { ok: false, code: 'NOT_ON_GUIDE' };
      if (w.orbit.stopLocked) return { ok: false, code: 'LOCKED' };
      const p = w.params;
      w.orbit.r = Math.round(clamp(cmd.rCm / 100, p.orbitMinR, p.orbitMaxR) * 1e4) / 1e4;
      return { ok: true, value: w.orbit.r * 100 };
    }
    case 'lockStop':
      if (!orbitOnGuide(w)) return { ok: false, code: 'NOT_ON_GUIDE' };
      w.orbit.stopLocked = !!cmd.on;
      if (cmd.on && w.orbit.r <= w.params.orbitStopR + 1e-9) {
        rearmErrF9(w, 'E01');
        flagF9(w, 'stopLocked');
      }
      emitF9(w, cmd.on ? 'STOP_LOCKED' : 'STOP_UNLOCKED', 'INFO', { cm: Math.round(w.orbit.r * 1000) / 10 });
      return { ok: true };
    case 'tightenCord':
      if (!orbitOnGuide(w)) return { ok: false, code: 'NOT_ON_GUIDE' };
      w.orbit.slackM = 0;
      rearmErrF9(w, 'E19');
      flagF9(w, 'cordTight');
      emitF9(w, 'CORD_TIGHT', 'INFO');
      return { ok: true };
    case 'reseatOrbit': {
      if (!w.orbit.off) return { ok: true };
      if (spinningF9(w)) return { ok: false, code: 'BUSY' };
      if (w.base.guardClosed) return { ok: false, code: 'GUARD_CLOSED' };
      w.orbit.off = false;
      w.orbit.r = Math.min(w.orbit.r, w.params.orbitStopR - 0.02);
      w.orbit.stopLocked = false;
      emitF9(w, 'ORBIT_RESEATED', 'INFO');
      return { ok: true };
    }
    case 'repairGuide':
      if (spinningF9(w)) return { ok: false, code: 'BUSY' };
      if (!w.damaged) return { ok: true };
      w.damaged = false;
      rearmErrF9(w, 'E39');
      emitF9(w, 'GUIDE_REPAIRED', 'INFO');
      return { ok: true };
    // Tambor, cordón y dinamómetro
    case 'setArm': {
      const d = w.drum;
      if (d.turns > 0 || pullingF9(w)) return { ok: false, code: 'CORD_WOUND' };
      const r = w.params.armRadii.find((x) => Math.abs(x * 100 - num(cmd.rCm)) < 0.05);
      if (r === undefined) return { ok: false, code: 'NO_STEP' };
      d.armR = r;
      emitF9(w, 'ARM_SET', 'INFO', { cm: Math.round(r * 1000) / 10 });
      return { ok: true, value: r * 100 };
    }
    case 'windCord':
      return windCord(w, num(cmd.turns), num(cmd.dir, 1) < 0 ? -1 : 1);
    case 'aimDyn': {
      if (pullingF9(w)) return { ok: false, code: 'BUSY' };
      w.drum.aimDeg = Math.round(clamp(cmd.deg, 0, 60) * 10) / 10;
      if (w.drum.aimDeg < 3) rearmErrF9(w, 'E03');
      return { ok: true, value: w.drum.aimDeg };
    }
    case 'setPull': {
      if (pullingF9(w)) return { ok: false, code: 'BUSY' };
      w.drum.pullN = Math.round(clamp(cmd.forceN, 0, 8) * 100) / 100;
      if (w.drum.pullN <= w.params.dyn.rangeN) rearmErrF9(w, 'E18');
      return { ok: true, value: w.drum.pullN };
    }
    case 'startPull':
      return startPull(w);
    case 'stopPull':
      if (!w.drum.pulling) return { ok: true };
      endPull(w);
      return { ok: true };
    case 'zeroDyn':
      if (w.drum.pulling) return { ok: false, code: 'LOADED' };
      w.dyn.offset = 0;
      w.dyn.zeroed = true;
      flagF9(w, 'dynZeroed');
      emitF9(w, 'DYN_ZEROED', 'INFO');
      return { ok: true };
    case 'readDyn':
      return readDyn(w, num(cmd.viewDeg));
    // Masas radiales
    case 'setSlide': {
      if (!isSlide(cmd.id)) return { ok: false, code: 'NO_OBJECT' };
      if (!slideOnBar(w, cmd.id)) return { ok: false, code: 'NOT_ON_BAR' };
      if (w.pullTarget !== null) return { ok: false, code: 'BUSY' };
      const s = w.slides[cmd.id];
      if (s.locked) return { ok: false, code: 'LOCKED' };
      s.r = Math.round(clamp(cmd.rCm / 100, w.params.slideMinR, w.params.slideMaxR) * 1e4) / 1e4;
      return { ok: true, value: s.r * 100 };
    }
    case 'lockMass': {
      if (!isSlide(cmd.id)) return { ok: false, code: 'NO_OBJECT' };
      if (!slideOnBar(w, cmd.id)) return { ok: false, code: 'NOT_ON_BAR' };
      w.slides[cmd.id].locked = !!cmd.on;
      if (SLIDES.every((k) => w.slides[k].locked)) rearmErrF9(w, 'E04');
      emitF9(w, cmd.on ? 'MASS_LOCKED' : 'MASS_UNLOCKED', 'INFO', { id: cmd.id });
      return { ok: true };
    }
    case 'pullIn':
      return pullIn(w, num(cmd.rCm));
    // Sensores
    case 'connect':
      return connect(w, cmd.channel, !!cmd.on);
    case 'zeroForce': {
      const f = w.force;
      if (!f.connected) return { ok: false, code: 'NOT_CONNECTED' };
      const T = centripetalN(w);
      f.offset = -T * Math.cos(f.angleDeg * DEG) * f.scale;
      f.zeroed = Math.abs(T) < 0.005;
      if (f.zeroed) {
        rearmErrF9(w, 'E21');
        flagF9(w, 'forceZeroed');
      }
      emitF9(w, f.zeroed ? 'FORCE_ZEROED' : 'FORCE_ZEROED_LOADED', f.zeroed ? 'INFO' : 'WARN');
      return { ok: true };
    }
    case 'setForceRange': {
      w.force.rangeIdx = Math.round(clamp(cmd.n, 0, w.params.force.ranges.length - 1));
      if (w.force.rangeIdx > 0) rearmErrF9(w, 'E22');
      return { ok: true, value: w.params.force.ranges[w.force.rangeIdx] };
    }
    case 'mountForce': {
      w.force.angleDeg = Math.round(clamp(cmd.angleDeg, 0, 90) * 10) / 10;
      if (w.force.angleDeg < 3) rearmErrF9(w, 'E26');
      return { ok: true, value: w.force.angleDeg };
    }
    case 'routeCable':
      w.gate.cableRouted = !!cmd.on;
      if (cmd.on) {
        rearmErrF9(w, 'E25');
        flagF9(w, 'cableRouted');
      }
      emitF9(w, cmd.on ? 'CABLE_ROUTED' : 'CABLE_LOOSE', cmd.on ? 'INFO' : 'WARN');
      return { ok: true };
    case 'calibrateEncoder': {
      const e = w.encoder;
      if (!e.connected) return { ok: false, code: 'NOT_CONNECTED' };
      if (spinningF9(w)) return { ok: false, code: 'BUSY' };
      e.scale = 1;
      e.calibrated = true;
      rearmErrF9(w, 'E27');
      flagF9(w, 'encCalibrated');
      emitF9(w, 'ENCODER_CALIBRATED', 'INFO', { turns: 1 });
      return { ok: true };
    }
    case 'setRate': {
      const hz = Math.round(num(cmd.hz));
      if (!w.params.rates.includes(hz)) return { ok: false, code: 'BAD_RATE' };
      w.logger.rateHz = hz;
      if (hz >= 50) rearmErrF9(w, 'E24');
      return { ok: true, value: hz };
    }
    case 'readForce':
      return readForce(w);
    case 'timeTurns':
      return timeTurns(w, num(cmd.turns));
    case 'readOmega':
      return readOmega(w);
    case 'readEncoder':
      return readEncoder(w);
    // Cierre y seguridad
    case 'closeStation':
      return closeStation(w);
    case 'acknowledge':
      return acknowledge(w);
    case 'teacherStop':
      w.safety.stoppedByTeacher = !!cmd.on;
      if (cmd.on) {
        w.rotor.brake = 2;
        w.motor.target = 0;
        w.motor.clutch = false;
        if (w.drum.pulling) endPull(w);
      }
      emitF9(w, cmd.on ? 'TEACHER_STOP' : 'TEACHER_RESUME', cmd.on ? 'CRITICAL' : 'INFO');
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

function startWork(w: F09World): F09DispatchResult {
  const missing = (Object.keys(PPE_ERR) as PpeItem[]).filter((k) => !w.safety.ppe[k]);
  if (missing.length) {
    for (const k of missing) {
      bumpF9(w, `err:${PPE_ERR[k][0]}`);
      emitF9(w, PPE_ERR[k][1], 'CRITICAL');
    }
    return { ok: false, code: 'PPE_MISSING' };
  }
  w.ppe = true;
  flagF9(w, 'ppe');
  emitF9(w, 'PPE_OK', 'INFO');
  return { ok: true };
}

function inspect(w: F09World, target: string): F09DispatchResult {
  const o = w.objects[target];
  if (!o) return { ok: false, code: 'NO_OBJECT' };
  flagF9(w, `inspected:${target}`);
  const p = w.params;
  switch (o.kind) {
    case 'base':
      emitF9(w, 'INSPECT_BASE', w.base.clamped ? 'INFO' : 'WARN');
      break;
    case 'level':
      emitF9(w, w.rotor.tiltDeg > 0.5 ? 'INSPECT_LEVEL_BAD' : 'INSPECT_LEVEL', w.rotor.tiltDeg > 0.5 ? 'WARN' : 'INFO', { deg: w.rotor.tiltDeg });
      break;
    case 'guard':
      emitF9(w, 'INSPECT_GUARD', 'INFO', { cm: Math.round(p.guardR * 1000) / 10 });
      break;
    case 'hub':
      emitF9(w, 'INSPECT_HUB', 'INFO', { max: Math.round(p.omegaMax * RPM) });
      break;
    case 'guide':
      emitF9(w, w.damaged ? 'INSPECT_GUIDE_BAD' : 'INSPECT_GUIDE', w.damaged ? 'WARN' : 'INFO', { stop: Math.round(p.orbitStopR * 1000) / 10 });
      break;
    case 'orbitMass':
      emitF9(w, w.orbit.slackM > 0 ? 'INSPECT_ORBIT_SLACK' : 'INSPECT_ORBIT', w.orbit.slackM > 0 ? 'WARN' : 'INFO', { g: Math.round(p.orbitKg * 1000) });
      break;
    case 'radialMass': {
      const sl = w.slides[target as SlideId];
      emitF9(w, sl?.locked ? 'INSPECT_SLIDE' : 'INSPECT_SLIDE_LOOSE', sl?.locked ? 'INFO' : 'WARN', { g: Math.round(p.slideKg * 1000), cm: Math.round((sl?.r ?? 0) * 1000) / 10 });
      break;
    }
    case 'pullRing':
      emitF9(w, 'INSPECT_PULL', 'INFO');
      break;
    case 'drum':
      emitF9(w, 'INSPECT_DRUM', 'INFO', { radii: p.armRadii.map((r) => Math.round(r * 100)).join(' / ') });
      break;
    case 'dynamometer':
      emitF9(w, w.dyn.zeroed ? 'INSPECT_DYN' : 'INSPECT_DYN_OFF', w.dyn.zeroed ? 'INFO' : 'WARN', { range: p.dyn.rangeN, res: p.dyn.resN });
      break;
    case 'brake':
      emitF9(w, 'INSPECT_BRAKE', 'INFO', { lv: w.rotor.brake });
      break;
    case 'motor':
      emitF9(w, 'INSPECT_MOTOR', 'INFO', { max: Math.round(p.omegaMax * RPM) });
      break;
    case 'forceSensor':
      emitF9(w, w.force.zeroed ? 'INSPECT_FORCE' : 'INSPECT_FORCE_OFF', w.force.zeroed ? 'INFO' : 'WARN', { range: p.force.ranges[w.force.rangeIdx], res: p.force.resolutions[w.force.rangeIdx] });
      break;
    case 'gate':
      emitF9(w, w.gate.cableRouted ? 'INSPECT_GATE' : 'INSPECT_GATE_BLOCKED', w.gate.cableRouted ? 'INFO' : 'WARN', { res: p.gate.resolutionS * 1000 });
      break;
    case 'encoder':
      emitF9(w, w.encoder.calibrated ? 'INSPECT_ENCODER' : 'INSPECT_ENCODER_UNCAL', w.encoder.calibrated ? 'INFO' : 'WARN', { res: p.encoderResRad });
      break;
    case 'logger':
      emitF9(w, 'INSPECT_LOGGER', w.logger.rateHz >= 50 ? 'INFO' : 'WARN', { hz: w.logger.rateHz });
      break;
    case 'balance':
      emitF9(w, 'INSPECT_BALANCE', w.balance.tared ? 'INFO' : 'WARN', { res: p.balanceResolutionG });
      break;
    case 'radialRuler':
      emitF9(w, 'INSPECT_RULER', 'INFO', { res: p.rulerResCm * 10 });
      break;
    default:
      emitF9(w, 'INSPECTED', 'INFO', { target });
  }
  return { ok: true };
}

const SUPPORTS = new Set(['bench', 'rack', 'hand']);

function setPose(w: F09World, id: string, pose: Pose, support?: string): F09DispatchResult {
  const o = w.objects[id];
  if (!o) return { ok: false, code: 'NO_OBJECT' };
  if (!o.movable) return { ok: false, code: 'FIXED' };
  if (!pose || ![pose.x, pose.y, pose.z].every((v) => Number.isFinite(v))) return { ok: false, code: 'BAD_POSE' };
  if (support && support !== o.support && !SUPPORTS.has(support)) return { ok: false, code: 'NO_SEAT' };
  if (['guide', 'bar', 'balance'].includes(o.support)) return { ok: false, code: 'NO_SEAT' };
  o.pose = { x: pose.x, y: pose.y, z: pose.z, rotationRad: num(pose.rotationRad) };
  if (support) o.support = support;
  return { ok: true };
}

// ─────────────────────────── Lecturas estáticas ───────────────────────────

const PREFIX: Record<ReadingF9['kind'], string> = { mass: 'm', radius: 'r', force: 'f', period: 'p', omega: 'w', encoder: 'e', dyn: 'd' };

function addReading(w: F09World, r: Omit<ReadingF9, 'id' | 't' | 'tick' | 'trialId' | 'configVersion'> & { configVersion?: number; trial?: number }): ReadingF9 {
  const n = w.readingOrder.length + 1;
  const { trial, ...rest } = r;
  const reading: ReadingF9 = { ...rest, configVersion: r.configVersion ?? w.configVersion, id: `${PREFIX[r.kind]}${n}`, trialId: `T${trial ?? w.trial}`, t: w.timeS, tick: w.tick };
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
export function massOfG(w: F09World, id: string): number {
  if (id === 'orbit01') return w.params.orbitKg * 1000;
  if (isSlide(id)) return w.params.slideKg * 1000;
  return 0;
}

const HANDLED = (w: F09World) => !w.base.guardClosed && !spinningF9(w, HAND_SAFE);

function placeOnBalance(w: F09World, id: string): F09DispatchResult {
  const o = w.objects[id];
  if (!o || !isMass(id)) return { ok: false, code: 'NO_OBJECT' };
  if (w.balance.on) return { ok: false, code: 'PAN_BUSY' };
  if (o.support !== 'rack') {
    // Sacar una masa de la mesa exige la guarda abierta y la mesa quieta.
    if (spinningF9(w) || busyF9(w)) return { ok: false, code: 'BUSY' };
    if (!HANDLED(w)) return { ok: false, code: 'GUARD_CLOSED' };
    if (isSlide(id) && w.slides[id].locked === false && w.pullTarget !== null) return { ok: false, code: 'BUSY' };
  }
  w.evidence[`from:${id}`] = o.support === 'guide' ? 1 : o.support === 'bar' ? 2 : 3;
  o.support = 'balance';
  w.balance.on = id;
  w.balance.placedS = w.timeS;
  emitF9(w, 'ON_BALANCE', 'INFO', { id });
  return { ok: true };
}

function removeFromBalance(w: F09World): F09DispatchResult {
  const id = w.balance.on;
  if (!id) return { ok: true };
  const from = w.evidence[`from:${id}`] ?? 3;
  w.objects[id].support = from === 1 ? 'guide' : from === 2 ? 'bar' : 'rack';
  if (w.objects[id].support !== 'rack' && w.base.guardClosed) w.objects[id].support = 'rack';
  w.balance.on = null;
  return { ok: true };
}

function readBalance(w: F09World): F09DispatchResult {
  const p = w.params;
  const id = w.balance.on;
  const trueG = id ? massOfG(w, id) : 0;
  const flags: string[] = [];
  let shown = trueG + w.balance.offsetG;
  if (id !== null && w.timeS - w.balance.placedS < 1.5) {
    flags.push('UNSTABLE');
    shown += gaussF9(w) * 0.6;
    errF9(w, 'E30', 'READ_BEFORE_STABLE', 'WARN', { inst: 'balance01' });
  }
  if (!w.balance.tared) {
    flags.push('NOT_ZEROED');
    errF9(w, 'E21', 'NOT_ZEROED', 'WARN', { inst: 'balance01' });
  }
  if (!id) flags.push('EMPTY');
  const value = quant(shown, p.balanceResolutionG);
  const r = addReading(w, {
    kind: 'mass', instrumentId: 'balance01', value, unit: 'g', resolution: p.balanceResolutionG, uncertainty: p.uB.balanceG, sourceObjectIds: ['balance01', ...(id ? [id] : [])], qualityFlags: flags,
    trueValue: trueG, target: id ?? 'empty',
  });
  if (id && !flags.length) flagF9(w, `weighed:${id}`);
  emitF9(w, 'BALANCE_READ', 'INFO', { g: value });
  return { ok: true, id: r.id, value };
}

/** Radio verdadero del centro (m) y medio ancho (m) de cada blanco de la regla radial. */
function radiusTarget(w: F09World, t: RadiusTarget): { r: number; half: number } | null {
  if (t === 'orbit01') return orbitOnGuide(w) ? { r: w.orbit.r, half: w.params.orbitHalf } : null;
  if (t === 'arm') return { r: w.drum.armR, half: 0 };
  if (isSlide(t)) return slideOnBar(w, t) ? { r: w.slides[t].r, half: 0.02 } : null;
  return null;
}

function readRadius(w: F09World, target: RadiusTarget, ref: 'center' | 'edge', viewDeg: number): F09DispatchResult {
  const tg = radiusTarget(w, target);
  if (!tg) return { ok: false, code: 'NO_OBJECT' };
  const p = w.params;
  const res = p.rulerResCm;
  const flags: string[] = [];
  const tv = tg.r * 100;
  let shown = tv;
  if (ref === 'edge' && tg.half > 0) {
    // Medir hasta el borde de la masa y no hasta su centro (F09-E05).
    shown -= tg.half * 100;
    flags.push('EDGE_REF');
    errF9(w, 'E05', 'RADIUS_TO_EDGE', 'WARN', { id: target });
  }
  if (Math.abs(viewDeg) > 8) {
    shown += Math.sign(viewDeg) * 3 * res;
    flags.push('PARALLAX');
    errF9(w, 'E29', 'SCALE_PARALLAX', 'WARN', { inst: 'ruler01' });
  }
  if (spinningF9(w)) {
    flags.push('UNSTABLE');
    errF9(w, 'E30', 'READ_BEFORE_STABLE', 'WARN', { inst: 'ruler01' });
  }
  const value = quant(shown, res);
  const r = addReading(w, {
    kind: 'radius', instrumentId: 'ruler01', value, unit: 'cm', resolution: res, uncertainty: p.uB.rulerCm, sourceObjectIds: ['ruler01', target === 'arm' ? 'drum01' : target], qualityFlags: flags, trueValue: tv,
    target, setup: { locked: [w.slides.slide1.locked, w.slides.slide2.locked], slides: [w.slides.slide1.r, w.slides.slide2.r], orbitR: w.orbit.r, armR: w.drum.armR },
  });
  emitF9(w, 'RADIUS_READ', flags.length ? 'WARN' : 'INFO', { id: target, cm: value });
  return { ok: true, id: r.id, value };
}

// ─────────────────────────── Motor y ensayos de giro ───────────────────────────

/** Abre una condición de giro (nuevo trialId). */
function openSpin(w: F09World): SpinTrial {
  w.trial++;
  const sp: SpinTrial = {
    id: w.trial, startS: w.timeS, surge: false, configChangedT: null, driftRad: 0, brakeT: w.rotor.brake > 0 ? 0 : null, motorDuringPull: false, asymPull: false, pulledIn: false,
    forceRead: false,
  };
  w.spin = sp;
  return sp;
}

/** Al poner en marcha (motor o tirón): la base o el eje sin preparar y las masas gemelas sin bloquear. */
function startChecks(w: F09World) {
  if (!w.base.clamped) errF9(w, 'E28', 'SUPPORT_LOOSE', 'WARN');
  if (w.rotor.tiltDeg > 0.5) errF9(w, 'E17', 'AXIS_TILTED', 'WARN', { deg: w.rotor.tiltDeg });
  const loose = SLIDES.filter((k) => slideOnBar(w, k) && !w.slides[k].locked);
  if (loose.length && w.pullTarget === null) {
    // Masas gemelas sin bloquear (F09-E04): al arrancar el cordón central se estira y una corre más que la otra.
    const s = w.slides[loose[0]];
    if (s.r < w.params.slideMaxR - 1e-9) {
      const L = angularMomentum(w);
      const E0 = mechanicalEnergyJ(w);
      s.r = r6(Math.min(w.params.slideMaxR, s.r + w.params.creepSlideM));
      w.rotor.omega = L / rotorI(w);
      w.energy.dissipatedJ += E0 - mechanicalEnergyJ(w);
    }
    errF9(w, 'E04', 'TWINS_UNLOCKED', 'WARN');
  }
}

function setClutch(w: F09World, on: boolean): F09DispatchResult {
  if (on && !w.base.guardClosed) {
    bumpF9(w, 'interlock');
    errF9(w, 'E02', 'GUARD_INTERLOCK', 'WARN');
    return { ok: false, code: 'GUARD_OPEN' };
  }
  if (on && pullingF9(w)) return { ok: false, code: 'BUSY' };
  const was = w.motor.clutch;
  w.motor.clutch = on;
  if (!on) w.motor.tau = 0;
  else {
    rearmErrF9(w, 'E02');
    if (!was && w.motor.target > 0) {
      startChecks(w);
      // Acoplar con la consigna lejos de ω es otro salto brusco (F09-E09).
      if (Math.abs(w.motor.target - Math.abs(w.rotor.omega)) > w.params.surgeRad) {
        if (w.spin) w.spin.surge = true;
        errF9(w, 'E09', 'SPEED_JUMP', 'WARN', { rpm: Math.round(w.motor.target * RPM) });
      }
    }
  }
  emitF9(w, on ? 'CLUTCH_ON' : 'CLUTCH_OFF', 'INFO');
  return { ok: true };
}

function setMotor(w: F09World, rpm: number): F09DispatchResult {
  const p = w.params;
  const target = Math.round(clamp(rpm, 0, p.omegaMax * RPM * 0.96)) / RPM;
  if (target > 0 && !w.base.guardClosed) {
    // Encendido con la guarda abierta: el enclavamiento lo impide (F09-E02).
    bumpF9(w, 'interlock');
    errF9(w, 'E02', 'GUARD_INTERLOCK', 'WARN');
    return { ok: false, code: 'GUARD_OPEN' };
  }
  if (target > 0 && pullingF9(w)) return { ok: false, code: 'BUSY' };
  if (target > 0 && w.rotor.brake === 2) return { ok: false, code: 'BRAKE_ON' };
  const prev = w.motor.target;
  w.motor.target = r6(target);
  if (Math.abs(target - prev) < 1e-9) return { ok: true, value: Math.round(target * RPM) };
  rearmErrF9(w, 'E02');
  const sp = target > 0 ? openSpin(w) : w.spin;
  if (target > 0 && w.motor.clutch) {
    if (!spinningF9(w, 0.3)) startChecks(w);
    if (Math.abs(target - Math.abs(w.rotor.omega)) > p.surgeRad) {
      // Elevar ω de golpe (F09-E09): el motor entrega su torque máximo y el sensor de fuerza se sobreesfuerza.
      if (sp) sp.surge = true;
      if (orbitOnGuide(w) && target > Math.abs(w.rotor.omega)) {
        w.force.offset += 0.04;
        w.force.zeroed = false;
      }
      errF9(w, 'E09', 'SPEED_JUMP', 'WARN', { rpm: Math.round(target * RPM) });
    } else rearmErrF9(w, 'E09');
  }
  emitF9(w, 'MOTOR_SET', 'INFO', { rpm: Math.round(target * RPM) });
  return { ok: true, value: Math.round(target * RPM) };
}

// ─────────────────────────── Masa orbitante ───────────────────────────

function mountOrbit(w: F09World, on: boolean): F09DispatchResult {
  const o = w.objects.orbit01;
  if (busyF9(w) || spinningF9(w)) return { ok: false, code: 'BUSY' };
  if (on) {
    if (o.support === 'guide') return { ok: true };
    if (o.support !== 'rack') return { ok: false, code: 'NOT_ON_RACK' };
    o.support = 'guide';
    w.orbit.off = false;
    w.orbit.stopLocked = false;
    w.orbit.r = Math.min(Math.max(w.orbit.r, w.params.orbitMinR), w.params.orbitStopR);
    emitF9(w, 'ORBIT_MOUNTED', 'INFO');
    return { ok: true };
  }
  if (o.support !== 'guide' && !w.orbit.off) return { ok: true };
  o.support = 'rack';
  w.orbit.off = false;
  w.orbit.stopLocked = false;
  emitF9(w, 'ORBIT_REMOVED', 'INFO');
  return { ok: true };
}

/** La masa orbitante sale de la guía al girar (más allá del tope o con el tope suelto): golpea la guarda. */
function orbitCheck(w: F09World) {
  if (!orbitOnGuide(w) || Math.abs(w.rotor.omega) < 1) return;
  const p = w.params;
  const beyond = w.orbit.r > p.orbitStopR + 1e-9;
  if (!beyond && w.orbit.stopLocked) return;
  const E0 = mechanicalEnergyJ(w);
  if (!beyond) {
    // Tope suelto: la masa se desliza hasta el fin de la guía conservando L.
    const L = angularMomentum(w);
    w.orbit.r = p.orbitMaxR;
    w.rotor.omega = L / rotorI(w);
  }
  // Al salir de la guía la masa se lleva su propio momento: ω no cambia y su energía se disipa contra la guarda.
  w.orbit.off = true;
  w.energy.dissipatedJ += E0 - mechanicalEnergyJ(w);
  w.damaged = true;
  w.motor.target = 0;
  w.motor.clutch = false;
  w.rotor.brake = 2;
  bumpF9(w, 'orbitOff');
  errF9(w, 'E01', 'ORBIT_OFF_GUIDE', 'CRITICAL', { cm: Math.round(w.orbit.r * 1000) / 10 });
  w.safety.block = { code: 'ORBIT_OFF_GUIDE', since: w.timeS };
}

// ─────────────────────────── Tambor y dinamómetro ───────────────────────────

function windCord(w: F09World, turns: number, dir: 1 | -1): F09DispatchResult {
  const d = w.drum;
  if (busyF9(w) || spinningF9(w)) return { ok: false, code: 'BUSY' };
  const n = Math.round(clamp(turns, 0, w.params.maxCordTurns) * 4) / 4;
  // Enrollar gira la mesa en sentido contrario al del tirón.
  w.rotor.theta = r6(w.rotor.theta - dir * (n - (d.dir === dir ? d.turns : 0)) * TAU);
  d.turns = n;
  d.dir = dir;
  d.unwound = 0;
  if (dir === 1) rearmErrF9(w, 'E15');
  emitF9(w, 'CORD_WOUND', 'INFO', { turns: n, dir });
  return { ok: true, value: n };
}

function runSetup(w: F09World): RunSetup {
  const sl = w.slides;
  const e = w.encoder;
  const f = w.force;
  return {
    orbitR: w.orbit.r, orbitOn: orbitOnGuide(w), slack: w.orbit.slackM > 0, slides: [sl.slide1.r, sl.slide2.r], locked: [sl.slide1.locked, sl.slide2.locked],
    armR: w.drum.armR, dir: w.drum.dir, turns: w.drum.turns, pullN: w.drum.pullN, aimDeg: w.drum.aimDeg, brake: w.rotor.brake, clutch: w.motor.clutch, motorTarget: r6(w.motor.target),
    tiltDeg: w.rotor.tiltDeg, baseClamped: w.base.clamped, guardClosed: w.base.guardClosed,
    enc: { connected: e.connected, calibrated: e.calibrated, scale: e.scale },
    force: { connected: f.connected, zeroed: f.zeroed, angleDeg: f.angleDeg, range: f.rangeIdx },
    gate: { connected: w.gate.connected, cableRouted: w.gate.cableRouted },
    rateHz: w.logger.rateHz, damaged: w.damaged, trueI: r6(rotorI(w)), frictionNm: r6(frictionNm(w)),
  };
}

const RUN_ERRS = ['E03', 'E04', 'E10', 'E15', 'E17', 'E18', 'E28', 'E32'];

function startPull(w: F09World): F09DispatchResult {
  const d = w.drum;
  if (d.turns <= 0) return { ok: false, code: 'NOT_WOUND' };
  if (busyF9(w)) return { ok: false, code: 'BUSY' };
  if (!w.base.guardClosed) return { ok: false, code: 'GUARD_OPEN' };
  if (w.motor.clutch) return { ok: false, code: 'CLUTCH_ON' };
  if (w.rotor.brake === 2) return { ok: false, code: 'BRAKE_ON' };
  if (d.pullN <= 0) return { ok: false, code: 'NO_FORCE' };
  for (const e of RUN_ERRS) rearmErrF9(w, e);
  const sp = openSpin(w);
  startChecks(w);
  const setup = runSetup(w);
  const rec: PullRun = {
    id: sp.id, startS: w.timeS, samples: [], endT: null, endOmega: null, startOmega: r4(w.rotor.omega), peakOmega: Math.abs(w.rotor.omega), overspeedT: null,
    brakeT: w.rotor.brake > 0 ? 0 : null, configChangedT: null, driftRad: 0, done: false, nextT: 0, setup, configVersion: w.configVersion,
  };
  const warn = (on: boolean, code: string, ev: string) => on && errF9(w, code, ev, 'WARN');
  warn(d.aimDeg >= 3, 'E03', 'DYN_OBLIQUE');
  warn(d.dir < 0, 'E15', 'TORQUE_REVERSED');
  warn(d.pullN > w.params.dyn.rangeN, 'E18', 'DYN_OVER_RANGE');
  warn(w.rotor.brake > 0, 'E10', 'BRAKE_DURING_RUN');
  d.pulling = true;
  w.run = rec;
  w.runs.push(rec);
  for (const old of w.runs.slice(0, -4)) old.samples = [];
  if (w.runs.length > 16) w.runs.splice(0, w.runs.length - 16);
  emitF9(w, 'PULL_STARTED', 'INFO', { trial: w.trial, N: d.pullN });
  return { ok: true, value: w.trial };
}

/** El cordón se suelta del tambor (desenrollado del todo o soltado a mano). */
function endPull(w: F09World) {
  const d = w.drum;
  d.pulling = false;
  d.turns = 0;
  d.unwound = 0;
  const run = w.run;
  if (run && run.endT === null) {
    run.endT = r6(w.timeS - run.startS);
    run.endOmega = r6(w.rotor.omega);
  }
  emitF9(w, 'CORD_RELEASED', 'INFO');
}

/** Torque del cordón sobre el tambor (N·m, con signo): r F cos β en el sentido del enrollado. */
export const cordTorque = (w: F09World) => (w.drum.pulling ? w.drum.dir * w.drum.armR * w.drum.pullN * Math.cos(w.drum.aimDeg * DEG) : 0);

function readDyn(w: F09World, viewDeg: number): F09DispatchResult {
  const p = w.params;
  const flags: string[] = [];
  const load = w.drum.pulling ? w.drum.pullN : 0;
  let shown = load + w.dyn.offset;
  if (shown > p.dyn.rangeN) {
    shown = p.dyn.rangeN;
    flags.push('OVER_RANGE');
    errF9(w, 'E18', 'DYN_OVER_RANGE', 'WARN');
  }
  if (!w.dyn.zeroed) {
    flags.push('NOT_ZEROED');
    errF9(w, 'E21', 'NOT_ZEROED', 'WARN', { inst: 'dyn01' });
  }
  if (Math.abs(viewDeg) > 8) {
    shown += Math.sign(viewDeg) * 2 * p.dyn.resN;
    flags.push('PARALLAX');
    errF9(w, 'E29', 'SCALE_PARALLAX', 'WARN', { inst: 'dyn01' });
  }
  if (!w.drum.pulling) flags.push('NO_LOAD');
  if (w.drum.pulling && w.drum.aimDeg >= 3) flags.push('OBLIQUE');
  const value = quant(shown + gaussF9(w) * 0.01 * p.noiseFactor, p.dyn.resN);
  const run = w.run && !w.run.done ? w.run : null;
  const r = addReading(w, {
    kind: 'dyn', instrumentId: 'dyn01', value, unit: 'N', resolution: p.dyn.resN, uncertainty: p.uB.dynN, sourceObjectIds: ['dyn01', 'drum01'], qualityFlags: flags, trueValue: load,
    target: 'cord', trial: run?.id ?? w.trial, setup: run ? { ...run.setup } : runSetup(w),
  });
  emitF9(w, 'DYN_READ', flags.length ? 'WARN' : 'INFO', { N: value });
  return { ok: true, id: r.id, value };
}

// ─────────────────────────── Masas radiales ───────────────────────────

function pullIn(w: F09World, rCm: number): F09DispatchResult {
  const p = w.params;
  const target = Math.round(clamp(rCm / 100, p.slideMinR, p.slideMaxR) * 1e4) / 1e4;
  if (!SLIDES.every((k) => slideOnBar(w, k))) return { ok: false, code: 'NOT_ON_BAR' };
  if (w.pullTarget !== null || pullingF9(w)) return { ok: false, code: 'BUSY' };
  if (SLIDES.every((k) => w.slides[k].r <= target + 1e-6)) return { ok: false, code: 'ALREADY_IN' };
  // El primer tramo del anillo suelta los pasadores de las dos masas; desde ahí solo las sostiene el cordón central.
  for (const k of SLIDES) w.slides[k].locked = false;
  const sp = w.spin && spinningF9(w, 0.05) ? w.spin : null;
  if (sp) sp.pulledIn = true;
  if (slideAsymmetry(w) > 0.005) {
    // Masas a radios distintos: se mueven distinto, I cambia asimétricamente y la mesa se desbalancea (F09-E12).
    if (sp) sp.asymPull = true;
    errF9(w, 'E12', 'ASYMMETRIC_PULL', 'WARN');
  } else rearmErrF9(w, 'E12');
  if (motorOnF9(w) && spinningF9(w, 0.05)) {
    // Recoger con el motor acoplado (F09-E11): el motor sostiene ω y L no se conserva.
    if (sp) sp.motorDuringPull = true;
    errF9(w, 'E11', 'MOTOR_DURING_PULL', 'WARN');
  } else rearmErrF9(w, 'E11');
  w.pullTarget = target;
  emitF9(w, 'PULL_IN', 'INFO', { cm: Math.round(target * 1000) / 10 });
  return { ok: true, value: target * 100 };
}

/** El cordón central acerca las masas sueltas a la velocidad de recogida; L se conserva (I cambia, ω = L/I). */
function pullStep(w: F09World, h: number) {
  if (w.pullTarget === null) return;
  const p = w.params;
  const free = SLIDES.filter((k) => slideOnBar(w, k) && !w.slides[k].locked);
  const L = angularMomentum(w);
  const E0 = mechanicalEnergyJ(w);
  let moving = false;
  for (const k of free) {
    const s = w.slides[k];
    if (s.r > w.pullTarget + 1e-9) {
      s.r = r6(Math.max(w.pullTarget, s.r - p.pullSpeed * h));
      moving = true;
    }
  }
  w.rotor.omega = L / rotorI(w);
  const dE = mechanicalEnergyJ(w) - E0;
  w.energy.pullJ += dE;
  w.energy.externalJ += dE;
  if (!moving) {
    w.pullTarget = null;
    emitF9(w, 'PULL_DONE', 'INFO');
  }
}

// ─────────────────────────── Sensores ───────────────────────────

function connect(w: F09World, ch: Channel, on: boolean): F09DispatchResult {
  if (ch === 'encoder') w.encoder.connected = on;
  else if (ch === 'force') w.force.connected = on;
  else if (ch === 'gate') w.gate.connected = on;
  else return { ok: false, code: 'UNKNOWN' };
  if (on) {
    rearmErrF9(w, 'E23');
    flagF9(w, `connected:${ch}`);
  }
  emitF9(w, on ? 'CHANNEL_ON' : 'CHANNEL_OFF', 'INFO', { ch });
  return { ok: true };
}

const FLAG_ERR: Record<string, [string, string]> = {
  OBLIQUE: ['E03', 'DYN_OBLIQUE'],
  ASYMMETRIC: ['E04', 'TWINS_UNLOCKED'],
  SPEED_JUMP: ['E09', 'SPEED_JUMP'],
  BRAKING: ['E10', 'BRAKE_DURING_RUN'],
  MOTOR_TORQUE: ['E11', 'MOTOR_DURING_PULL'],
  ASYM_PULL: ['E12', 'ASYMMETRIC_PULL'],
  REVERSED: ['E15', 'TORQUE_REVERSED'],
  AXIS_TILTED: ['E17', 'AXIS_TILTED'],
  SLACK: ['E19', 'CORD_SLACK'],
  NOT_ZEROED: ['E21', 'NOT_ZEROED'],
  CLIPPED: ['E22', 'SENSOR_SATURATED'],
  UNPLUGGED: ['E23', 'NO_SIGNAL'],
  LOW_RATE: ['E24', 'LOW_RATE'],
  OCCLUDED: ['E25', 'BEAM_OCCLUDED'],
  TILTED_SENSOR: ['E26', 'SENSOR_TILTED'],
  UNCALIBRATED: ['E27', 'ENCODER_UNCALIBRATED'],
  SUPPORT_MOVED: ['E28', 'SUPPORT_MOVED'],
  UNSTABLE: ['E30', 'READ_BEFORE_STABLE'],
  CONFIG_CHANGED: ['E32', 'CONFIG_DURING_RUN'],
  POST_IMPACT: ['E39', 'READ_AFTER_IMPACT'],
};

const raiseFlags = (w: F09World, qf: string[], inst: string) => {
  for (const f of qf) if (FLAG_ERR[f]) errF9(w, FLAG_ERR[f][0], FLAG_ERR[f][1], 'WARN', { inst });
};

/** Banderas del montaje vivo y de la condición de giro abierta. */
function liveFlags(w: F09World, out: string[]) {
  const sp = w.spin;
  if (w.rotor.tiltDeg > 0.5) out.push('AXIS_TILTED');
  if (!w.base.clamped && w.base.driftRad > 1e-4) out.push('SUPPORT_MOVED');
  if (w.damaged) out.push('POST_IMPACT');
  if (SLIDES.some((k) => slideOnBar(w, k) && !w.slides[k].locked) && w.pullTarget === null && slideAsymmetry(w) > 0.005 && !sp?.pulledIn) out.push('ASYMMETRIC');
  if (w.rotor.brake > 0 && spinningF9(w, 0.05)) out.push('BRAKING');
  if (sp) {
    if (sp.surge) out.push('SPEED_JUMP');
    if (sp.configChangedT !== null) out.push('CONFIG_CHANGED');
    if (sp.brakeT !== null && spinningF9(w, 0.05)) out.push('BRAKING');
    if (sp.motorDuringPull) out.push('MOTOR_TORQUE');
    if (sp.asymPull) out.push('ASYM_PULL');
  }
}

function readForce(w: F09World): F09DispatchResult {
  const p = w.params;
  const f = w.force;
  const flags: string[] = [];
  liveFlags(w, flags);
  if (!orbitOnGuide(w)) flags.push('NO_MASS');
  if (!f.connected) flags.push('UNPLUGGED');
  if (!f.zeroed) flags.push('NOT_ZEROED');
  if (f.angleDeg >= 3) flags.push('TILTED_SENSOR');
  const accel = recentAccel(w);
  if (accel > ACCEL_LIM || w.pullTarget !== null) flags.push('UNSTABLE');
  let T = centripetalN(w);
  const sp = w.spin;
  if (!spinningF9(w, 0.05)) {
    // Leer la fuerza con la mesa ya detenida (F09-E13): el registro de esa velocidad queda vacío.
    flags.push('EMPTY');
    if (sp && !sp.forceRead && sp.startS < w.timeS) errF9(w, 'E13', 'FORCE_AFTER_STOP', 'WARN');
  }
  if (w.orbit.slackM > 0 && orbitOnGuide(w) && spinningF9(w, 0.5)) {
    // Cordón con holgura (F09-E19): la masa golpetea contra el cordón y la tensión cae a cero a ratos.
    flags.push('SLACK');
    T = 0.6 * p.orbitKg * w.rotor.omega ** 2 * (w.orbit.r + w.orbit.slackM) + Math.abs(gaussF9(w)) * 0.05;
  }
  const fi = forceIndication(T, { offset: f.offset, scale: f.scale, angleDeg: f.angleDeg, rangeIdx: f.rangeIdx }, p.force, gaussF9(w) * p.noiseFactor);
  if (fi.clipped) flags.push('CLIPPED');
  const qf = [...new Set(flags)];
  raiseFlags(w, qf, 'force01');
  const value = f.connected ? fi.value : NaN;
  if (sp && spinningF9(w, 0.05)) sp.forceRead = true;
  const r = addReading(w, {
    kind: 'force', instrumentId: 'force01', value, unit: 'N', resolution: p.force.resolutions[f.rangeIdx] ?? 0.001, uncertainty: p.uB.forceN, sourceObjectIds: ['force01', 'orbit01'], qualityFlags: qf,
    trueValue: centripetalN(w), target: 'orbit01', setup: runSetup(w),
  });
  emitF9(w, 'FORCE_READ', qf.length ? 'WARN' : 'INFO', { N: value });
  return { ok: true, id: r.id, value };
}

/** Empieza a cronometrar n vueltas con la fotopuerta (el borde de la plataforma corta el haz una vez por vuelta). */
function timeTurns(w: F09World, turns: number): F09DispatchResult {
  if (w.timing) return { ok: false, code: 'BUSY' };
  const n = turns === 0.5 ? 0.5 : Math.round(clamp(turns, 1, 10));
  const p = w.params;
  const flags: string[] = [];
  if (!w.gate.connected) flags.push('UNPLUGGED');
  if (gateOccludedF9(w)) flags.push('OCCLUDED');
  if (flags.length || !spinningF9(w, 0.2)) {
    if (!flags.length) return { ok: false, code: 'NOT_SPINNING' };
    // Sin señal (canal sin conectar o haz tapado por el cable suelto): el cronómetro no arranca.
    liveFlags(w, flags);
    const qf = [...new Set(flags)];
    raiseFlags(w, qf, 'gate01');
    const r = addReading(w, {
      kind: 'period', instrumentId: 'gate01', value: NaN, unit: 's', resolution: p.gate.resolutionS, uncertainty: p.uB.gateS, sourceObjectIds: ['gate01', 'hub01'], qualityFlags: qf,
      trueValue: Math.abs(TAU / (w.rotor.omega || 1)) * n, target: 'rotor', turns: n, setup: runSetup(w),
    });
    emitF9(w, 'PERIOD_READ', 'WARN', { s: '—' });
    return { ok: true, id: r.id, value: NaN };
  }
  if (n === 0.5) errF9(w, 'E06', 'HALF_TURN', 'WARN');
  else rearmErrF9(w, 'E06');
  w.timing = { turns: n, startS: w.timeS, startTheta: w.rotor.theta, trial: w.trial, accel: recentAccel(w) > ACCEL_LIM };
  emitF9(w, 'TIMING_STARTED', 'INFO', { n });
  return { ok: true };
}

function timingStep(w: F09World) {
  const tm = w.timing;
  if (!tm) return;
  if (recentAccel(w, 0.2) > ACCEL_LIM || w.pullTarget !== null) tm.accel = true;
  const done = Math.abs(w.rotor.theta - tm.startTheta) >= tm.turns * TAU - 1e-9;
  const stalled = w.timeS - tm.startS > 30 || !spinningF9(w, 0.05);
  if (!done && !stalled) return;
  w.timing = null;
  const p = w.params;
  const flags: string[] = [];
  liveFlags(w, flags);
  if (tm.turns === 0.5) flags.push('HALF_TURN');
  if (tm.accel) flags.push('UNSTABLE');
  if (tm.trial !== w.trial) flags.push('CONFIG_CHANGED');
  if (!done) flags.push('NO_PASS');
  const qf = [...new Set(flags)];
  raiseFlags(w, qf.filter((f) => f !== 'HALF_TURN'), 'gate01');
  const el = w.timeS - tm.startS;
  // Instante exacto del cruce interpolado dentro del último paso (el haz se corta en el borde, no en el tick).
  const over = done ? (Math.abs(w.rotor.theta - tm.startTheta) - tm.turns * TAU) / Math.max(1e-9, Math.abs(w.rotor.omega)) : 0;
  const trueT = el - over;
  const value = done ? timerIndication(trueT, p.gate, gaussF9(w)) : NaN;
  const r = addReading(w, {
    kind: 'period', instrumentId: 'gate01', value, unit: 's', resolution: p.gate.resolutionS, uncertainty: p.uB.gateS, sourceObjectIds: ['gate01', 'hub01'], qualityFlags: qf, trueValue: trueT,
    target: 'rotor', turns: tm.turns, trial: tm.trial, setup: runSetup(w),
  });
  emitF9(w, 'PERIOD_READ', qf.length ? 'WARN' : 'INFO', { s: value, n: tm.turns, id: r.id });
}

function readOmega(w: F09World): F09DispatchResult {
  const p = w.params;
  const e = w.encoder;
  const flags: string[] = [];
  liveFlags(w, flags);
  if (!e.connected) flags.push('UNPLUGGED');
  if (!e.calibrated) flags.push('UNCALIBRATED');
  if (recentAccel(w, 0.5) > ACCEL_LIM || w.pullTarget !== null) flags.push('UNSTABLE');
  if (pullingF9(w)) flags.push('UNSTABLE');
  const qf = [...new Set(flags)];
  raiseFlags(w, qf, 'encoder01');
  const tw = windowOmega(w, 0.5);
  const value = e.connected ? quant(e.scale * tw + gaussF9(w) * 0.002 * p.noiseFactor, p.encoderResRad) : NaN;
  const r = addReading(w, {
    kind: 'omega', instrumentId: 'encoder01', value, unit: 'rad/s', resolution: p.encoderResRad, uncertainty: p.uB.encoderRad, sourceObjectIds: ['encoder01', 'hub01'], qualityFlags: qf, trueValue: tw,
    target: 'rotor', setup: runSetup(w),
  });
  emitF9(w, 'OMEGA_READ', qf.length ? 'WARN' : 'INFO', { w: value });
  return { ok: true, id: r.id, value };
}

/** Ajuste lineal por mínimos cuadrados y = a + b t (null con menos de 3 puntos). */
export function linFitF9(ts: number[], ys: number[]): { a: number; b: number } | null {
  const n = ts.length;
  if (n < 3) return null;
  const tm = ts.reduce((s, x) => s + x, 0) / n;
  const ym = ys.reduce((s, x) => s + x, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (ts[i] - tm) ** 2;
    sxy += (ts[i] - tm) * (ys[i] - ym);
  }
  if (sxx < 1e-18) return null;
  const b = sxy / sxx;
  return { a: ym - b * tm, b };
}

const lastRun = (w: F09World) => w.runs[w.runs.length - 1];

function readEncoder(w: F09World): F09DispatchResult {
  const rec = lastRun(w);
  if (!rec) return { ok: false, code: 'NO_RUN' };
  if (!rec.done) return { ok: false, code: 'BUSY' };
  const p = w.params;
  const su = rec.setup;
  const e = su.enc;
  const flags: string[] = [];
  if (su.tiltDeg > 0.5) flags.push('AXIS_TILTED');
  if (!su.baseClamped && rec.driftRad > 1e-4) flags.push('SUPPORT_MOVED');
  if (su.damaged) flags.push('POST_IMPACT');
  if (su.locked.some((x) => !x) && Math.abs(su.slides[0] - su.slides[1]) > 0.005) flags.push('ASYMMETRIC');
  if (su.aimDeg >= 3) flags.push('OBLIQUE');
  if (su.dir < 0) flags.push('REVERSED');
  if (rec.brakeT !== null) flags.push('BRAKING');
  if (rec.configChangedT !== null) flags.push('CONFIG_CHANGED');
  if (rec.overspeedT !== null) flags.push('OVERSPEED');
  if (Math.abs(rec.startOmega) > 0.05) flags.push('SPINNING_START');
  if (!e.connected) flags.push('UNPLUGGED');
  if (!e.calibrated) flags.push('UNCALIBRATED');
  if (su.rateHz < 50) flags.push('LOW_RATE');
  if (rec.endT === null) flags.push('NO_END');
  const qf = [...new Set(flags)];
  raiseFlags(w, qf, 'encoder01');
  const ind = (om: number) => quant(e.scale * om + gaussF9(w) * 0.003 * p.noiseFactor, p.encoderResRad);
  const tE = rec.endT ?? Infinity;
  const pull = rec.samples.filter((x) => x[0] > 0.02 && x[0] < tE - 0.02);
  const coast = rec.samples.filter((x) => x[0] > tE + 0.1 && Math.abs(x[2]) > 1e-3);
  const fitP = e.connected ? linFitF9(pull.map((x) => x[0]), pull.map((x) => ind(x[2]))) : null;
  const fitC = e.connected ? linFitF9(coast.map((x) => x[0]), coast.map((x) => ind(x[2]))) : null;
  const tp = linFitF9(pull.map((x) => x[0]), pull.map((x) => x[2]));
  const tc = linFitF9(coast.map((x) => x[0]), coast.map((x) => x[2]));
  const rr = (x: number | undefined) => (x === undefined ? NaN : Math.round(x * 1e4) / 1e4);
  const value = rr(fitP?.b);
  const tau = pull.length ? pull.reduce((s, x) => s + x[3], 0) / pull.length : NaN;
  const r = addReading(w, {
    kind: 'encoder', instrumentId: 'encoder01', value, unit: 'rad/s²', resolution: 1e-4, uncertainty: p.uB.encoderRad, sourceObjectIds: ['encoder01', 'logger01', 'hub01'], qualityFlags: qf,
    trueValue: tp ? tp.b : NaN, target: 'rotor', trial: rec.id, configVersion: rec.configVersion,
    fit: { alpha: fin(value), alphaC: fin(rr(fitC?.b)), n: pull.length, nc: coast.length, trueAlpha: fin(tp?.b), trueAlphaC: fin(tc?.b), trueTau: fin(tau), trueI: su.trueI },
    setup: { ...su },
  });
  emitF9(w, 'ENCODER_READ', qf.length ? 'WARN' : 'INFO', { a: value, n: pull.length });
  return { ok: true, id: r.id, value };
}

// ─────────────────────────── Cierre y bloqueos ───────────────────────────

function closeStation(w: F09World): F09DispatchResult {
  if (spinningF9(w) || motorOnF9(w) || w.drum.pulling || w.pullTarget !== null) {
    // Desmontar sin llevar el equipo a estado seguro (F09-E40): queda movimiento o energía y el cierre se bloquea.
    errF9(w, 'E40', 'UNSAFE_CLOSE', 'WARN');
    return { ok: false, code: 'NOT_SAFE' };
  }
  if (w.rotor.brake !== 2) return { ok: false, code: 'BRAKE_OFF' };
  if (w.motor.clutch) return { ok: false, code: 'CLUTCH_ON' };
  if (w.objects.orbit01.support !== 'rack') return { ok: false, code: 'ITEMS_OUT' };
  if (w.drum.turns > 0) return { ok: false, code: 'CORD_WOUND' };
  if (!w.base.guardClosed) return { ok: false, code: 'GUARD_OPEN' };
  if (w.balance.on) return { ok: false, code: 'PAN_BUSY' };
  if (SLIDES.some((k) => !slideOnBar(w, k) || !w.slides[k].locked)) return { ok: false, code: 'MASSES_LOOSE' };
  rearmErrF9(w, 'E40');
  flagF9(w, 'stationClosed');
  emitF9(w, 'STATION_CLOSED', 'INFO');
  return { ok: true };
}

function acknowledge(w: F09World): F09DispatchResult {
  const b = w.safety.block;
  if (!b) return { ok: true };
  if (spinningF9(w) || w.rotor.brake !== 2 || motorOnF9(w)) return { ok: false, code: 'SECURE_FIRST' };
  if (b.code === 'HAND_CONTACT' && !w.base.guardClosed) return { ok: false, code: 'SECURE_FIRST' };
  if (b.code === 'ORBIT_OFF_GUIDE' && w.orbit.off) return { ok: false, code: 'SECURE_FIRST' };
  w.safety.block = null;
  emitF9(w, 'STATION_RESET', 'INFO', { code: b.code });
  return { ok: true };
}

// ─────────────────────────── Paso: mesa giratoria ───────────────────────────

/** Torque de roce total (N·m, ≥ 0) para la velocidad actual. */
export function frictionNm(w: F09World): number {
  const p = w.params;
  const r = w.rotor;
  let f = (p.scientificMode === 'REALISTIC' ? p.bearingNm : 0) + p.frictionNm;
  f += p.imbalanceK * imbalance(w) * r.omega * r.omega;
  f += p.tiltNmPerDeg * r.tiltDeg;
  f += p.brakeNm[r.brake] ?? 0;
  if (w.orbit.off) f += 0.05;
  return f;
}

function overspeed(w: F09World) {
  const r = w.rotor;
  if (r.tripped) return;
  // Protección de sobrevelocidad: el freno actúa solo y el motor se desacopla.
  r.tripped = true;
  r.brake = 2;
  w.motor.clutch = false;
  w.motor.target = 0;
  if (w.run && !w.run.done) w.run.overspeedT ??= r4(w.timeS - w.run.startS);
  if (w.spin) w.spin.surge = true;
  errF9(w, 'E09', 'OVERSPEED', 'WARN', { rpm: Math.round(Math.abs(r.omega) * RPM) });
}

function stepRotor(w: F09World, t0: number, h: number) {
  const p = w.params;
  const rot = w.rotor;
  pullStep(w, h);
  orbitCheck(w);
  const I = rotorI(w);
  const m = w.motor;
  m.tau = m.clutch ? Math.max(-p.motorMaxNm, Math.min(p.motorMaxNm, p.motorKp * (m.target - rot.omega))) : 0;
  const tc = cordTorque(w);
  const drive = m.tau + tc;
  const tf = frictionNm(w);
  const w0 = rot.omega;
  let w1: number;
  let path: number;
  let dth: number;
  const startFrom = (dur: number) => {
    // Desde el reposo: arranca solo si el torque motor vence al roce estático.
    if (Math.abs(drive) <= tf) return { w: 0, th: 0 };
    const a = (drive - sgn(drive) * tf) / I;
    return { w: a * dur, th: 0.5 * a * dur * dur };
  };
  if (Math.abs(w0) < 1e-9) {
    const st = startFrom(h);
    w1 = st.w;
    dth = st.th;
    path = Math.abs(dth);
  } else {
    const a = (drive - sgn(w0) * tf) / I;
    const wn = w0 + a * h;
    if (tf > 0 && sgn(wn) !== sgn(w0)) {
      // Pasó por cero dentro del subpaso: desde ahí el roce cambia de sentido (o la deja quieta).
      const tz = Math.abs(w0 / a);
      const th1 = 0.5 * w0 * tz;
      const st = startFrom(h - tz);
      w1 = st.w;
      dth = th1 + st.th;
      path = Math.abs(th1) + Math.abs(st.th);
    } else {
      w1 = wn;
      dth = 0.5 * (w0 + wn) * h;
      path = Math.abs(dth);
    }
  }
  rot.omega = w1;
  rot.theta += dth;
  // Trabajo exacto para torques constantes: motor y cordón (externos) y roce τ_f |Δθ| (disipado).
  w.energy.externalJ += drive * dth;
  w.energy.motorJ += m.tau * dth;
  w.energy.dissipatedJ += tf * path;
  // Base sin sujetar: la reacción del torque la hace girar sobre la mesada (F09-E28).
  if (!w.base.clamped && Math.abs(drive) > 0.02 && w.base.driftRad < p.baseCreepMax) {
    const dd = Math.min(p.baseCreepMax - w.base.driftRad, p.baseCreepK * Math.abs(drive) * h);
    w.base.driftRad = r6(w.base.driftRad + dd);
    if (w.spin) w.spin.driftRad = r6(w.spin.driftRad + dd);
    if (w.run && !w.run.done) w.run.driftRad = r6(w.run.driftRad + dd);
  }
  const d = w.drum;
  if (d.pulling) {
    d.unwound += dth;
    if (d.dir * d.unwound >= d.turns * TAU - 1e-9) endPull(w);
  }
  if (Math.abs(rot.omega) > p.omegaMax) overspeed(w);
  const run = w.run && !w.run.done ? w.run : null;
  if (run) {
    const tRel = t0 + h - run.startS;
    run.peakOmega = Math.max(run.peakOmega, Math.abs(rot.omega));
    sample(w, run, tRel, tc);
    finishCheck(w, run, tRel);
  }
}

/** Registrador: [t, θ, ω, τ del cordón] al ritmo elegido (múltiplo del subpaso de 5 ms). */
function sample(w: F09World, run: PullRun, tRel: number, tc: number) {
  while (run.nextT <= tRel + 1e-9) {
    run.samples.push([r6(run.nextT), r6(w.rotor.theta), r6(w.rotor.omega), r6(tc)]);
    run.nextT = r6(run.nextT + 1 / w.logger.rateHz);
  }
}

function finishCheck(w: F09World, run: PullRun, tRel: number) {
  const coastDone = run.endT !== null && tRel - run.endT >= 2.5;
  const stopped = run.endT !== null && !spinningF9(w) && tRel - run.endT > 0.3;
  if (tRel >= 30 || coastDone || stopped) {
    if (w.drum.pulling) endPull(w);
    run.done = true;
    emitF9(w, 'RUN_DONE', 'INFO', { trial: run.id, s: Math.round(tRel * 100) / 100 });
  }
}

// ─────────────────────────── Paso de simulación ───────────────────────────

export function stepF09World(w: F09World): void {
  const dt = w.params.dtS;
  const n = Math.max(1, w.params.subSteps);
  const h = dt / n;
  const tStart = w.timeS;
  w.timeS = Math.round((w.timeS + dt) * 1e6) / 1e6;
  w.tick++;
  for (let i = 0; i < n; i++) stepRotor(w, tStart + i * h, h);
  w.rotor.theta = r6(w.rotor.theta);
  w.rotor.omega = Math.abs(w.rotor.omega) < 1e-9 ? 0 : w.rotor.omega;
  w.omegaLog.push([w.timeS, w.rotor.omega]);
  if (w.omegaLog.length > 41) w.omegaLog.splice(0, w.omegaLog.length - 41);
  timingStep(w);
}

export function runF09For(w: F09World, seconds: number) {
  const n = Math.round(seconds / w.params.dtS);
  for (let i = 0; i < n; i++) stepF09World(w);
}

export function f09Summary(w: F09World) {
  return {
    theta: r6(w.rotor.theta),
    omega: r6(w.rotor.omega),
    orbitR: w.orbit.r,
    slides: [w.slides.slide1.r, w.slides.slide2.r],
    trial: w.trial,
    readings: w.readingOrder.length,
    cfg: w.configVersion,
  };
}

export { SLIDES, MASSES };
