/**
 * Mundo de F05 — rozamiento y dinámica de planos inclinados: paso fijo determinista de 0,05 s con 10 subpasos de 5 ms
 * (§6). La escena solo dibuja este estado y envía hechos geométricos.
 *
 * - Bloque sobre el tablero inclinado θ = θ_rel + θ_base: normal N = m g cos θ − T sen α, componente paralela del peso
 *   m g sen θ y tensión del cable T cos α (α: inclinación del cable respecto del tablero, F05-E01).
 * - Contacto de Coulomb regularizado: en reposo el bloque resiste hasta μ_s,ef N, con μ_s,ef = μ_k + (μ_s − μ_k)(1 −
 *   e^(−t_reposo/τ)) (la adherencia crece con el tiempo de contacto); deslizando, el roce es −μ_k N sgn(v). Un cruce por
 *   v = 0 detiene el bloque y desde ahí vuelve a decidir la adherencia: no hay fuerzas que aparezcan solas.
 * - Cable con el resorte del dinamómetro (k, amortiguador c): tira solo si está tenso. El tirador de husillo (manivela o
 *   motor a rapidez constante) desplaza el gancho; un tirón brusco (F05-E05) salta 2 cm de golpe.
 * - Tope inferior con espuma (choque inelástico) o sin ella (restitución 0,2; un golpe fuerte tuerce la bandera,
 *   F05-E39). El soporte del elevador sin su abrazadera cede con el golpe (F05-E28).
 * - Instrumentos: balanza de 1 g, termómetro, célula de carga (`instruments/force-sensor`), goniómetro de plomada y
 *   escala del soporte, dos fotopuertas (`instruments/photogate`) sobre la bandera y video de posición a 10–200 Hz.
 */
import type { F05Command, F05DispatchResult, FbdBody, FbdDir, FbdForce, FbdPartner, GateId, Material, MassPlace, PpeItem } from './commands';
import type { F05Object, F05Params, F05World, Pose, PullRecord, PullSetup, ReadingF5, SlideRecord } from './types';
import { hashRandom } from '../core/rng';
import { bumpF5, emitF5, errF5, flagF5, gaussF5, rearmErrF5 } from './events';
import { BLOCK_MIN_S, BLOCK_START_S, BLOCK_TOP_S, CABLE_LEN_M, GEOF05, cableAngleDeg } from './geometry';
import { blockLoadKg, blockMassKg, conservedTotalsF05, mechanicalEnergyJ, thetaDegF5 } from './conservation';
import { newGate, timerIndication, updateGate } from '../instruments/photogate';
import { forceIndication, quantizeReading } from '../instruments/force-sensor';

export { emitF5, latchF5, rearmF5, bumpF5, flagF5, errF5 } from './events';
export { conservedTotalsF05, blockMassKg, thetaDegF5 };

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, num(v, a)));
const DEG = Math.PI / 180;
const HL = GEOF05.block.halfLenM;
const PU = GEOF05.puller;
const sgn = (x: number) => (x > 0 ? 1 : x < 0 ? -1 : 0);

/** Escenarios docentes (§10). */
export const SF5 = {
  DRY_WOOD: 'F05-S01_dry_wood',
  RUBBER: 'F05-S02_rubber',
  HEAVY: 'F05-S03_heavy_block',
  TILTED_PULL: 'F05-S04_tilted_pull',
  OFFSET: 'F05-S05_sensor_offset',
  NEAR_CRITICAL: 'F05-S06_near_critical',
  VARIABLE: 'F05-S07_variable_friction',
  LOADED: 'F05-S08_loaded_block',
  LOOSE_SCREW: 'F05-S09_loose_screw',
  OSCILLATING: 'F05-S10_oscillating_cable',
  WORN: 'F05-S11_worn_surface',
  LOW_THRESHOLD: 'F05-S12_low_threshold',
} as const;

export interface F05WorldSpec {
  objects: F05Object[];
  scenarios: string[];
  mode: string;
}

export const BALLASTS = ['w250a', 'w250b'] as const;
export const MATERIALS: Material[] = ['wood', 'paper', 'rubber'];
export const STRIP_OF: Record<Material, string | null> = { wood: null, paper: 'stripPaper', rubber: 'stripRubber' };

// ─────────────────────────── Creación ───────────────────────────

export function createF05World(spec: F05WorldSpec, seed: number, params: F05Params): F05World {
  const has = (s: string) => spec.scenarios.includes(s);
  const objects: Record<string, F05Object> = {};
  for (const o of spec.objects) objects[o.id] = { ...o, pose: { ...o.pose } };
  const h = (k: string) => hashRandom(seed, k) - 0.5;
  const sign = (k: string) => (h(k) > 0 ? 1 : -1);
  const offs = has(SF5.OFFSET) ? 0.4 * sign('offS') : Math.round(sign('fS') * params.force.offsetN * (0.4 + (h('f') + 0.5) * 0.6) * 1000) / 1000;
  const baseDeg = Math.round(sign('baseS') * (0.1 + (h('base') + 0.5) * 0.3) * 100) / 100;
  const material: Material = has(SF5.RUBBER) ? 'rubber' : 'wood';
  if (material === 'rubber') objects.stripRubber.support = 'plane';
  const w: F05World = {
    timeS: 0, tick: 0, seed, rng: seed >>> 0 || 1, params, mode: spec.mode, objects,
    plane: { relDeg: has(SF5.NEAR_CRITICAL) ? 20 : 0, baseDeg, locked: !has(SF5.LOOSE_SCREW), clamped: false, shifts: 0, touchedS: -10, version: 0, lastStepDeg: 0 },
    surface: { material, worn: { wood: false, paper: has(SF5.WORN), rubber: false }, wornLogged: { wood: false, paper: false, rubber: false } },
    block: { on: 'plane', s: BLOCK_START_S, v: 0, lateralCm: 0, pinned: false, restS: 10, flagBent: false },
    puller: { attached: false, heightCm: has(SF5.TILTED_PULL) ? 9 : GEOF05.cable.hookZ + 1.5, p: PU.s0, driveMs: 0, tensionN: 0, ext: 0 },
    sensor: { connected: false, offset: offs, zeroed: false, scale: params.force.uncalScale, calibrated: false, rangeIdx: 1, angleDeg: 0 },
    logger: { rateHz: params.rates[0], gatesConnected: false, videoOn: false },
    catcherOn: true,
    gates: { gate1: newGate(0.65), gate2: newGate(0.3) },
    balance: { on: null, placedS: -10, offsetG: Math.round(sign('balS') * (2 + (h('bal') + 0.5) * 2)), tared: false },
    seated: { w250a: true, w250b: true },
    pull: null, pulls: [], slide: null, slides: [],
    tilt: { slipRelDeg: null, slipStepDeg: 0, slipVersion: null, material, shifted: false, armed: false },
    fbd: { blockPull: { arrows: [], locked: false }, blockSlide: { arrows: [], locked: false } },
    energy: { dissipatedJ: 0, externalJ: 0 },
    trial: 0,
    configVersion: 1,
    readings: {}, readingOrder: [],
    safety: { ppe: { coat: false, goggles: false, shoes: false, hair: false }, block: null, stoppedByTeacher: false },
    events: [], evidence: {}, scenarios: [...spec.scenarios], ppe: false,
    initialTotals: { massesG: 0 },
  };
  if (has(SF5.LOADED)) objects.w250a.support = 'block01';
  updateCable(w);
  w.initialTotals = { massesG: conservedTotalsF05(w).massesG };
  w.energy.externalJ = mechanicalEnergyJ(w);
  return w;
}

// ─────────────────────────── Consultas ───────────────────────────

export const runningPullF5 = (w: F05World) => !!w.pull && !w.pull.done;
export const runningSlideF5 = (w: F05World) => !!w.slide && !w.slide.done;
export const busyF5 = (w: F05World) => runningPullF5(w) || runningSlideF5(w);
export const sinTheta = (w: F05World) => Math.sin(thetaDegF5(w) * DEG);
export const cosTheta = (w: F05World) => Math.cos(thetaDegF5(w) * DEG);
/** Ángulo del cable respecto del tablero (°). */
export const cableDegF5 = (w: F05World) => cableAngleDeg(w.puller.heightCm, w.block.s, w.puller.p);
/** Cuerpos sobre los que se dibujan diagramas. */
export const FBD_BODIES: FbdBody[] = ['blockPull', 'blockSlide'];

/** Coeficientes del material bajo el bloque en s, con la tira rayada y la variación a lo largo del plano. */
export function muAt(w: F05World, s: number): { s: number; k: number } {
  const p = w.params;
  const m = w.surface.material;
  const base = p.mu[m];
  const f = (w.surface.worn[m] ? p.wornFactor : 1) * (1 + p.muRipple * Math.sin((2 * Math.PI * s) / 0.2));
  return { s: base.s * f, k: base.k * f };
}

/** ¿Una compuerta queda bajo el pasador o dentro de la espuma, donde no ve la bandera? */
export function gateOccluded(w: F05World, id: string): boolean {
  const g = w.gates[id];
  if (!g) return false;
  return g.s > GEOF05.pin.s - 0.03 || g.s < GEOF05.catcher.s + 0.06;
}

/** Recalcula estiramiento y tensión estática del cable tras un cambio de geometría (comando). */
function updateCable(w: F05World) {
  const pu = w.puller;
  if (!pu.attached || w.block.on !== 'plane') {
    pu.ext = 0;
    pu.tensionN = 0;
    return;
  }
  const dx = pu.p - (w.block.s + HL);
  const dz = (pu.heightCm - GEOF05.cable.hookZ) / 100;
  pu.ext = Math.max(0, Math.hypot(dx, dz) - CABLE_LEN_M);
  pu.tensionN = w.params.springK * pu.ext;
}

// ─────────────────────────── Despacho ───────────────────────────

const BEFORE_PPE = new Set<F05Command['type']>(['equipPpe', 'startWork', 'teacherStop', 'acknowledge', 'inspect']);
const DURING_BLOCK = new Set<F05Command['type']>(['acknowledge', 'teacherStop', 'inspect', 'setPose', 'returnPuller', 'setLock', 'placeBlock']);
/** Comandos que cambian la condición física del ensayo (nuevo montaje; E32 si hay un tirón o un deslizamiento en marcha). */
const CONFIG = new Set<F05Command['type']>([
  'setSurface', 'placeMass', 'turnElevator', 'setLock', 'clampBase', 'setCableHeight', 'connect', 'zeroSensor', 'calibrateSensor', 'setRange', 'mountSensor', 'setRate',
  'moveGate', 'setCatcher',
]);

export function dispatchF05(w: F05World, cmd: F05Command): F05DispatchResult {
  if (!cmd || typeof cmd !== 'object') return { ok: false, code: 'UNKNOWN' };
  if (w.safety.stoppedByTeacher && cmd.type !== 'teacherStop') return { ok: false, code: 'TEACHER_STOP' };
  if (!w.ppe && !BEFORE_PPE.has(cmd.type)) return { ok: false, code: 'PPE' };
  if (w.safety.block && !DURING_BLOCK.has(cmd.type)) return { ok: false, code: 'BLOCKED' };
  // Trabajo externo: lo que el gesto cambia en (energía mecánica + disipada): elevar el tablero con el bloque, moverlo.
  const S0 = mechanicalEnergyJ(w) + w.energy.dissipatedJ;
  const before = w.configVersion;
  const moving = (runningPullF5(w) && (Math.abs(w.block.v) > 1e-4 || w.puller.driveMs > 0)) || (runningSlideF5(w) && Math.abs(w.block.v) > 1e-4);
  const res = route(w, cmd);
  updateCable(w);
  w.energy.externalJ += mechanicalEnergyJ(w) + w.energy.dissipatedJ - S0;
  if (res.ok && CONFIG.has(cmd.type)) {
    if (w.configVersion === before) w.configVersion++;
    const r = runningPullF5(w) ? w.pull : runningSlideF5(w) ? w.slide : null;
    if (r && moving && r.configChangedT === null) {
      r.configChangedT = Math.round((w.timeS - r.startS) * 1e4) / 1e4;
      errF5(w, 'E32', 'CONFIG_DURING_RUN', 'WARN', { cmd: cmd.type });
    }
  }
  return res;
}

function route(w: F05World, cmd: F05Command): F05DispatchResult {
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
    // Balanza, termómetro y cargas
    case 'tareBalance':
      if (w.balance.on) return { ok: false, code: 'PAN_NOT_EMPTY' };
      w.balance.offsetG = 0;
      w.balance.tared = true;
      rearmErrF5(w, 'E21');
      flagF5(w, 'balanceTared');
      emitF5(w, 'BALANCE_TARED', 'INFO');
      return { ok: true };
    case 'placeOnBalance':
      return placeOnBalance(w, String(cmd.id));
    case 'removeFromBalance':
      return removeFromBalance(w);
    case 'readBalance':
      return readBalance(w);
    case 'readTemp':
      return readTemp(w);
    case 'placeMass':
      return placeMass(w, String(cmd.id), cmd.on, num(cmd.offsetCm));
    // Superficies y bloque
    case 'setSurface':
      return setSurface(w, cmd.material);
    case 'placeBlock':
      return placeBlock(w, cmd.s, num(cmd.lateralCm));
    case 'releaseBlock':
      return releaseBlock(w);
    case 'reseatFlag':
      if (!w.block.flagBent) return { ok: true };
      if (busyF5(w)) return { ok: false, code: 'BUSY' };
      w.block.flagBent = false;
      rearmErrF5(w, 'E39');
      emitF5(w, 'FLAG_RESEATED', 'INFO');
      return { ok: true };
    case 'setCatcher':
      if (runningSlideF5(w)) return { ok: false, code: 'BUSY' };
      w.catcherOn = !!cmd.on;
      emitF5(w, cmd.on ? 'CATCHER_ON' : 'CATCHER_OFF', cmd.on ? 'INFO' : 'WARN');
      return { ok: true };
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
    // Ángulo
    case 'turnElevator':
      return turnElevator(w, clamp(cmd.turns, -40, 40));
    case 'setLock':
      w.plane.locked = !!cmd.on;
      if (cmd.on) rearmErrF5(w, 'E03');
      emitF5(w, cmd.on ? 'PLANE_LOCKED' : 'PLANE_UNLOCKED', cmd.on ? 'INFO' : 'WARN');
      return { ok: true };
    case 'clampBase':
      w.plane.clamped = !!cmd.on;
      if (cmd.on) rearmErrF5(w, 'E28');
      emitF5(w, cmd.on ? 'SUPPORT_CLAMPED' : 'SUPPORT_LOOSE', 'INFO');
      return { ok: true };
    case 'readAngle':
      return readAngle(w, cmd.target === 'support' ? 'support' : 'plane', num(cmd.viewDeg));
    // Fuerza
    case 'attachCable':
      return attachCable(w, !!cmd.on);
    case 'setCableHeight': {
      w.puller.heightCm = Math.round(clamp(cmd.cm, GEOF05.cable.minZ, GEOF05.cable.maxZ) * 10) / 10;
      if (Math.abs(cableDegF5(w)) <= 3) rearmErrF5(w, 'E01');
      return { ok: true, value: w.puller.heightCm };
    }
    case 'connect': {
      if (cmd.channel === 'gates') w.logger.gatesConnected = !!cmd.on;
      else if (cmd.channel === 'video') w.logger.videoOn = !!cmd.on;
      else if (cmd.channel === 'load01') w.sensor.connected = !!cmd.on;
      else return { ok: false, code: 'UNKNOWN' };
      if (cmd.on) {
        rearmErrF5(w, 'E23');
        flagF5(w, `connected:${cmd.channel}`);
      }
      emitF5(w, cmd.on ? 'CHANNEL_ON' : 'CHANNEL_OFF', 'INFO', { ch: cmd.channel });
      return { ok: true };
    }
    case 'zeroSensor':
      return zeroSensor(w);
    case 'calibrateSensor':
      return calibrateSensor(w);
    case 'setRange': {
      const s = w.sensor;
      s.rangeIdx = Math.round(clamp(cmd.n, 0, w.params.force.ranges.length - 1));
      if (s.rangeIdx > 0) rearmErrF5(w, 'E22');
      return { ok: true, value: w.params.force.ranges[s.rangeIdx] };
    }
    case 'mountSensor': {
      const s = w.sensor;
      s.angleDeg = Math.round(clamp(cmd.angleDeg, 0, 90) * 10) / 10;
      if (s.angleDeg < 3) rearmErrF5(w, 'E26');
      return { ok: true, value: s.angleDeg };
    }
    case 'setRate': {
      const hz = Math.round(num(cmd.hz));
      if (!w.params.rates.includes(hz)) return { ok: false, code: 'BAD_RATE' };
      w.logger.rateHz = hz;
      if (hz >= 50) rearmErrF5(w, 'E24');
      return { ok: true, value: hz };
    }
    case 'setDrive':
      return setDrive(w, num(cmd.cmS));
    case 'turnCrank':
      return turnCrank(w, clamp(cmd.turns, -50, 50));
    case 'jerk':
      return jerk(w);
    case 'returnPuller':
      return returnPuller(w);
    case 'readPull':
      return readPull(w, num(cmd.t0, NaN), num(cmd.t1, NaN));
    // Cinemática
    case 'moveGate': {
      const g = w.gates[cmd.id];
      if (!g) return { ok: false, code: 'NO_OBJECT' };
      if (runningSlideF5(w)) return { ok: false, code: 'BUSY' };
      g.s = Math.round(clamp(cmd.s, 0.06, 0.95) * 1e4) / 1e4;
      return { ok: true, value: g.s };
    }
    case 'readScale':
      return readScale(w, cmd.target, num(cmd.viewDeg));
    case 'readSlide':
      return readSlide(w);
    // Cierre y seguridad
    case 'closeStation':
      return closeStation(w);
    case 'acknowledge':
      return acknowledge(w);
    case 'teacherStop':
      w.safety.stoppedByTeacher = !!cmd.on;
      emitF5(w, cmd.on ? 'TEACHER_STOP' : 'TEACHER_RESUME', cmd.on ? 'CRITICAL' : 'INFO');
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

function startWork(w: F05World): F05DispatchResult {
  const missing = (Object.keys(PPE_ERR) as PpeItem[]).filter((k) => !w.safety.ppe[k]);
  if (missing.length) {
    for (const k of missing) {
      bumpF5(w, `err:${PPE_ERR[k][0]}`);
      emitF5(w, PPE_ERR[k][1], 'CRITICAL');
    }
    return { ok: false, code: 'PPE_MISSING' };
  }
  w.ppe = true;
  flagF5(w, 'ppe');
  emitF5(w, 'PPE_OK', 'INFO');
  return { ok: true };
}

function inspect(w: F05World, target: string): F05DispatchResult {
  if (!w.objects[target]) return { ok: false, code: 'NO_OBJECT' };
  flagF5(w, `inspected:${target}`);
  const p = w.params;
  const o = w.objects[target];
  const m = w.surface.material;
  switch (o.kind) {
    case 'plane':
    case 'strip':
      // Mirar la tira deja registrado su estado: si está rayada, el desgaste queda anotado (F05-E16).
      if (w.surface.worn[m]) {
        w.surface.wornLogged[m] = true;
        rearmErrF5(w, 'E16');
      }
      emitF5(w, o.kind === 'plane' ? 'INSPECT_PLANE' : 'INSPECT_STRIP', w.surface.worn[m] ? 'WARN' : 'INFO', { mat: m, cm: GEOF05.plane.length });
      break;
    case 'block':
      emitF5(w, 'INSPECT_BLOCK', w.block.flagBent ? 'WARN' : 'INFO', { g: Math.round(p.blockKg * 1000) });
      break;
    case 'ballast':
      emitF5(w, 'INSPECT_BALLAST', 'INFO', { g: Math.round((p.ballastKg[target] ?? 0) * 1000) });
      break;
    case 'puller':
      emitF5(w, 'INSPECT_PULLER', 'INFO', { mm: PU.mPerTurn * 1000 });
      break;
    case 'loadCell':
      emitF5(w, 'INSPECT_LOADCELL', w.sensor.calibrated ? 'INFO' : 'WARN', { range: p.force.ranges[w.sensor.rangeIdx], res: p.force.resolutions[w.sensor.rangeIdx] });
      break;
    case 'spring':
      emitF5(w, 'INSPECT_SPRING', 'INFO', { k: p.springK });
      break;
    case 'goniometer':
      emitF5(w, 'INSPECT_GONIO', 'INFO', { res: p.goniometerResDeg });
      break;
    case 'elevator':
      emitF5(w, 'INSPECT_ELEVATOR', w.plane.locked && w.plane.clamped ? 'INFO' : 'WARN', { deg: p.degPerTurn });
      break;
    case 'catcher':
      emitF5(w, 'INSPECT_CATCHER', w.catcherOn ? 'INFO' : 'WARN');
      break;
    case 'logger':
      emitF5(w, 'INSPECT_LOGGER', 'INFO', { hz: w.logger.rateHz });
      break;
    case 'gate':
      emitF5(w, 'INSPECT_GATE', gateOccluded(w, target) ? 'WARN' : 'INFO', { res: p.gate.resolutionS });
      break;
    case 'balance':
      emitF5(w, 'INSPECT_BALANCE', w.balance.tared ? 'INFO' : 'WARN', { res: p.balanceResolutionG });
      break;
    case 'thermometer':
      emitF5(w, 'INSPECT_THERMO', 'INFO', { res: p.thermoResC });
      break;
    default:
      emitF5(w, 'INSPECTED', 'INFO', { target });
  }
  return { ok: true };
}

const SUPPORTS = new Set(['bench', 'rack', 'hand']);

function setPose(w: F05World, id: string, pose: Pose, support?: string): F05DispatchResult {
  const o = w.objects[id];
  if (!o) return { ok: false, code: 'NO_OBJECT' };
  if (!o.movable) return { ok: false, code: 'FIXED' };
  if (!pose || ![pose.x, pose.y, pose.z].every((v) => Number.isFinite(v))) return { ok: false, code: 'BAD_POSE' };
  if (support && support !== o.support && !SUPPORTS.has(support)) return { ok: false, code: 'NO_SEAT' };
  if (o.kind === 'block' && (w.block.on === 'plane' || w.block.on === 'balance')) return { ok: false, code: 'NO_SEAT' };
  o.pose = { x: pose.x, y: pose.y, z: pose.z, rotationRad: num(pose.rotationRad) };
  if (support) o.support = support;
  return { ok: true };
}

// ─────────────────────────── Lecturas ───────────────────────────

const PREFIX: Record<ReadingF5['kind'], string> = { mass: 'm', temp: 'c', length: 'L', angle: 'a', pull: 'f', slide: 's' };

function addReading(w: F05World, r: Omit<ReadingF5, 'id' | 't' | 'tick' | 'trialId' | 'configVersion'> & { configVersion?: number; trial?: number }): ReadingF5 {
  const n = w.readingOrder.length + 1;
  const { trial, ...rest } = r;
  const reading: ReadingF5 = { ...rest, configVersion: r.configVersion ?? w.configVersion, id: `${PREFIX[r.kind]}${n}`, trialId: `T${trial ?? w.trial}`, t: w.timeS, tick: w.tick };
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
export function loadOnBalanceG(w: F05World, id: string): number {
  const p = w.params;
  if (id === 'block01') return blockMassKg(w) * 1000;
  return (p.ballastKg[id] ?? 0) * 1000;
}

const WEIGHABLE = new Set(['block01', ...BALLASTS]);

function placeOnBalance(w: F05World, id: string): F05DispatchResult {
  if (!WEIGHABLE.has(id) || !w.objects[id]) return { ok: false, code: 'NO_OBJECT' };
  if (w.balance.on) return { ok: false, code: 'PAN_BUSY' };
  const o = w.objects[id];
  if (id === 'block01') {
    if (w.puller.attached) return { ok: false, code: 'DETACH_FIRST' };
    if (busyF5(w) || Math.abs(w.block.v) > 1e-4) return { ok: false, code: 'BUSY' };
    w.block.on = 'balance';
    w.block.pinned = false;
  } else if (o.support !== 'rack') return { ok: false, code: 'NOT_ON_RACK' };
  o.support = 'balance';
  w.balance.on = id;
  w.balance.placedS = w.timeS;
  emitF5(w, 'ON_BALANCE', 'INFO', { id });
  return { ok: true };
}

function removeFromBalance(w: F05World): F05DispatchResult {
  const id = w.balance.on;
  if (!id) return { ok: true };
  const o = w.objects[id];
  if (id === 'block01') {
    putBlock(w, BLOCK_START_S, 0, false);
    o.support = 'plane';
  } else o.support = 'rack';
  w.balance.on = null;
  return { ok: true };
}

function readBalance(w: F05World): F05DispatchResult {
  const p = w.params;
  const id = w.balance.on;
  const trueG = id ? loadOnBalanceG(w, id) : 0;
  const flags: string[] = [];
  const settling = id !== null && w.timeS - w.balance.placedS < 1.5;
  let shown = trueG + w.balance.offsetG;
  if (settling) {
    flags.push('UNSTABLE');
    shown += gaussF5(w) * 4;
    errF5(w, 'E30', 'READ_BEFORE_STABLE', 'WARN', { inst: 'balance01' });
  }
  if (!w.balance.tared) {
    flags.push('NOT_ZEROED');
    errF5(w, 'E21', 'BALANCE_NOT_TARED', 'WARN', { inst: 'balance01' });
  }
  if (!id) flags.push('EMPTY');
  const value = quant(shown, p.balanceResolutionG);
  const load = id === 'block01' ? Math.round(blockLoadKg(w) * 1000) : 0;
  const r = addReading(w, {
    kind: 'mass', instrumentId: 'balance01', value, unit: 'g', resolution: p.balanceResolutionG, uncertainty: p.uB.balanceG, sourceObjectIds: ['balance01', ...(id ? [id] : [])], qualityFlags: flags,
    trueValue: trueG, target: id ?? 'empty', setup: { load },
  });
  if (id && !flags.length) flagF5(w, `weighed:${id}`);
  emitF5(w, 'BALANCE_READ', 'INFO', { g: value });
  return { ok: true, id: r.id, value };
}

function readTemp(w: F05World): F05DispatchResult {
  const p = w.params;
  const value = quant(p.roomC + gaussF5(w) * 0.1 * p.noiseFactor, p.thermoResC);
  const r = addReading(w, {
    kind: 'temp', instrumentId: 'thermo01', value, unit: '°C', resolution: p.thermoResC, uncertainty: p.uB.tempC, sourceObjectIds: ['thermo01'], qualityFlags: [], trueValue: p.roomC, target: 'room',
  });
  flagF5(w, 'tempRead');
  emitF5(w, 'TEMP_READ', 'INFO', { c: value });
  return { ok: true, id: r.id, value };
}

function readAngle(w: F05World, target: 'plane' | 'support', viewDeg: number): F05DispatchResult {
  const p = w.params;
  const pl = w.plane;
  const flags: string[] = [];
  const res = target === 'plane' ? p.goniometerResDeg : p.supportResDeg;
  // El goniómetro de plomada mide la inclinación real; la escala del soporte, el ángulo respecto de la base.
  const trueDeg = target === 'plane' ? pl.relDeg + pl.baseDeg : pl.relDeg;
  let shown = trueDeg;
  if (Math.abs(viewDeg) > 8) {
    shown += Math.sign(viewDeg) * 2 * res;
    flags.push('PARALLAX');
    errF5(w, 'E29', 'SCALE_PARALLAX', 'WARN', { inst: target === 'plane' ? 'gonio01' : 'elevator01' });
  }
  if (target === 'support') {
    flags.push('SUPPORT_SCALE');
    errF5(w, 'E10', 'SUPPORT_ANGLE', 'WARN');
  }
  if (!pl.locked && pl.relDeg > 0.01) {
    flags.push('DRIFT');
    errF5(w, 'E03', 'PLANE_DRIFT', 'WARN');
  }
  if (w.timeS - pl.touchedS < 1) {
    flags.push('UNSTABLE');
    errF5(w, 'E30', 'READ_BEFORE_STABLE', 'WARN', { inst: 'gonio01' });
  }
  const t = w.tilt;
  const slipped = t.slipVersion !== null && t.slipVersion === pl.version;
  const coarse = slipped && t.slipStepDeg > p.degPerTurn * 2 + 1e-9;
  if (coarse) flags.push('COARSE');
  if (t.slipVersion !== null && t.shifted) {
    flags.push('SUPPORT_SHIFT');
    errF5(w, 'E28', 'SUPPORT_SHIFTED', 'WARN');
  }
  if (slipped && w.surface.worn[t.material] && !w.surface.wornLogged[t.material]) {
    flags.push('WORN');
    errF5(w, 'E16', 'WORN_SURFACE', 'WARN', { mat: t.material });
  }
  const value = quant(shown, res);
  const r = addReading(w, {
    kind: 'angle', instrumentId: target === 'plane' ? 'gonio01' : 'elevator01', value, unit: '°', resolution: res, uncertainty: p.uB.angleDeg, sourceObjectIds: [target === 'plane' ? 'gonio01' : 'elevator01', 'plane01'],
    qualityFlags: flags, trueValue: trueDeg, target, angle: { slipped, coarse, material: slipped ? t.material : w.surface.material, relDeg: pl.relDeg },
    setup: { material: slipped ? t.material : w.surface.material, relDeg: pl.relDeg, thetaDeg: Math.round((pl.relDeg + pl.baseDeg) * 1e4) / 1e4, loadG: Math.round(blockLoadKg(w) * 1000) },
  });
  if (slipped && !flags.length) flagF5(w, `critical:${t.material}`);
  emitF5(w, 'ANGLE_READ', 'INFO', { deg: value });
  return { ok: true, id: r.id, value };
}

function readScale(w: F05World, target: GateId, viewDeg: number): F05DispatchResult {
  const p = w.params;
  const g = w.gates[target];
  if (!g) return { ok: false, code: 'NO_OBJECT' };
  const res = p.scaleResolutionCm;
  const flags: string[] = [];
  let shown = g.s * 100;
  if (Math.abs(viewDeg) > 8) {
    shown += Math.sign(viewDeg) * 3 * res;
    flags.push('PARALLAX');
    errF5(w, 'E29', 'SCALE_PARALLAX', 'WARN', { inst: 'plane01' });
  }
  const value = quant(shown, res);
  const r = addReading(w, {
    kind: 'length', instrumentId: 'plane01', value, unit: 'cm', resolution: res, uncertainty: p.uB.scaleCm, sourceObjectIds: ['plane01', target], qualityFlags: flags,
    trueValue: g.s * 100, target, setup: { posCm: Math.round(g.s * 1e4) / 100 },
  });
  if (!flags.length) flagF5(w, `scale:${target}`);
  emitF5(w, 'SCALE_READ', 'INFO', { cm: value });
  return { ok: true, id: r.id, value };
}

// ─────────────────────────── Bloque, lastres y superficies ───────────────────────────

function placeMass(w: F05World, id: string, on: MassPlace, offsetCm: number): F05DispatchResult {
  const o = w.objects[id];
  if (!o || o.kind !== 'ballast') return { ok: false, code: 'NO_OBJECT' };
  if (o.support === 'balance') return { ok: false, code: 'ON_BALANCE' };
  if (busyF5(w)) return { ok: false, code: 'BUSY' };
  if (on === 'block') {
    if (w.block.on === 'bench') return { ok: false, code: 'BLOCK_AWAY' };
    o.support = 'block01';
    // El lastre encaja en el perno si se suelta a menos de 1,5 cm del centro; si no, queda suelto (F05-E07).
    w.seated[id] = Math.abs(offsetCm) <= 1.5;
    if (w.seated[id]) rearmErrF5(w, 'E07');
  } else if (on === 'rack') {
    o.support = 'rack';
    w.seated[id] = true;
  } else return { ok: false, code: 'NO_SEAT' };
  emitF5(w, 'MASS_MOVED', w.seated[id] ? 'INFO' : 'WARN', { id, on });
  return { ok: true };
}

function setSurface(w: F05World, material: Material): F05DispatchResult {
  if (!MATERIALS.includes(material)) return { ok: false, code: 'UNKNOWN' };
  if (busyF5(w)) return { ok: false, code: 'BUSY' };
  if (w.block.on === 'plane' && w.puller.attached) return { ok: false, code: 'DETACH_FIRST' };
  // Cambiar de tira monta la de ese material del estante, con su estado (rayada o no): hay que mirarla para registrarlo.
  for (const m of MATERIALS) {
    const id = STRIP_OF[m];
    if (id && w.objects[id]) w.objects[id].support = m === material ? 'plane' : 'rack';
  }
  w.surface.material = material;
  rearmErrF5(w, 'E16');
  w.tilt.slipVersion = null;
  w.tilt.armed = false;
  w.tilt.material = material;
  w.block.restS = 10;
  emitF5(w, 'SURFACE_SET', 'INFO', { mat: material });
  return { ok: true };
}

function putBlock(w: F05World, s: number, lateralCm: number, pinned: boolean) {
  const b = w.block;
  b.on = 'plane';
  b.s = s;
  b.v = 0;
  b.lateralCm = lateralCm;
  b.pinned = pinned;
  b.restS = 10;
  w.objects.block01.support = 'plane';
  w.tilt.slipVersion = null;
  w.tilt.shifted = false;
  w.tilt.armed = false;
  w.tilt.material = w.surface.material;
}

function placeBlock(w: F05World, where: number | 'top', lateralCm: number): F05DispatchResult {
  const b = w.block;
  if (b.on === 'balance') return { ok: false, code: 'ON_BALANCE' };
  if (busyF5(w)) return { ok: false, code: 'BUSY' };
  if (w.puller.attached && where === 'top') return { ok: false, code: 'DETACH_FIRST' };
  const s = where === 'top' ? BLOCK_TOP_S : Math.round(clamp(where, BLOCK_MIN_S, BLOCK_TOP_S) * 1e4) / 1e4;
  const lat = Math.round(clamp(lateralCm, -20, 20) * 10) / 10;
  const edge = GEOF05.plane.w / 2 - GEOF05.block.w / 2;
  if (Math.abs(lat) > edge) {
    // Apoyado fuera del tablero: se cae por el borde a la mesada (F05-E09).
    b.on = 'bench';
    b.v = 0;
    b.pinned = false;
    w.objects.block01.support = 'bench';
    for (const m of BALLASTS) if (w.objects[m].support === 'block01') w.objects[m].support = 'bench';
    errF5(w, 'E09', 'BLOCK_OFF_EDGE', 'WARN');
    return { ok: true, code: 'FELL' };
  }
  putBlock(w, s, lat, where === 'top');
  rearmErrF5(w, 'E09');
  for (const m of BALLASTS) if (w.objects[m].support === 'bench') w.objects[m].support = 'rack';
  emitF5(w, 'BLOCK_PLACED', 'INFO', { cm: Math.round(s * 1000) / 10 });
  return { ok: true };
}

function releaseBlock(w: F05World): F05DispatchResult {
  const b = w.block;
  if (b.on !== 'plane' || !b.pinned) return { ok: false, code: 'NOT_PINNED' };
  if (w.puller.attached) return { ok: false, code: 'DETACH_FIRST' };
  if (busyF5(w)) return { ok: false, code: 'BUSY' };
  for (const e of ['E03', 'E07', 'E16', 'E23', 'E24', 'E25', 'E28', 'E32', 'E39']) rearmErrF5(w, e);
  w.trial++;
  b.pinned = false;
  b.v = -Math.abs(gaussF5(w) * w.params.releaseJitter);
  for (const [id, g] of Object.entries(w.gates)) {
    g.events = [];
    g.blocked = false;
    g.onTrack = !gateOccluded(w, id);
  }
  const m = w.surface.material;
  const rec: SlideRecord = {
    id: w.trial, startS: w.timeS, samples: [], gates: { gate1: [], gate2: [] }, impactT: null, impactV: 0, driftT: null, baseSlipT: null, loadShiftT: null, configChangedT: null,
    done: false, nextT: 0, stillS: 0,
    setup: {
      material: m, relDeg: w.plane.relDeg, thetaDeg: Math.round(thetaDegF5(w) * 1e4) / 1e4, loadG: Math.round(blockLoadKg(w) * 1000), massG: Math.round(blockMassKg(w) * 1e4) / 10,
      g1: Math.round(w.gates.gate1.s * 1e4) / 100, g2: Math.round(w.gates.gate2.s * 1e4) / 100, rateHz: w.logger.rateHz, gatesOn: w.logger.gatesConnected, videoOn: w.logger.videoOn,
      occluded: ['gate1', 'gate2'].filter((g) => gateOccluded(w, g)), flagBent: b.flagBent, worn: w.surface.worn[m], wornLogged: w.surface.wornLogged[m], locked: w.plane.locked,
    },
    configVersion: w.configVersion,
  };
  w.slide = rec;
  w.slides.push(rec);
  for (const old of w.slides.slice(0, -4)) old.samples = [];
  if (w.slides.length > 12) w.slides.splice(0, w.slides.length - 12);
  emitF5(w, 'BLOCK_RELEASED', 'INFO', { trial: w.trial });
  return { ok: true, value: w.trial };
}

// ─────────────────────────── Diagramas de cuerpo libre ───────────────────────────

type Need = [FbdForce, FbdDir, FbdPartner];
const FBD_REQUIRED: Record<FbdBody, Need[]> = {
  blockPull: [['weight', 'down', 'earth'], ['normal', 'perp', 'plane'], ['tension', 'upSlope', 'cable'], ['friction', 'downSlope', 'plane']],
  blockSlide: [['weight', 'down', 'earth'], ['normal', 'perp', 'plane'], ['friction', 'upSlope', 'plane']],
};
export const fbdNeeds = (b: FbdBody) => FBD_REQUIRED[b];

/** Sobre el tablero horizontal «arriba» y «perpendicular a la superficie» son el mismo sentido. */
const normKey = (body: FbdBody, a: { force: string; dir: string; partner: string }) => {
  const dir = body === 'blockPull' && a.dir === 'up' ? 'perp' : a.dir;
  return `${a.force}/${dir}/${a.partner}`;
};

function drawForce(w: F05World, body: FbdBody, force: FbdForce, dir: FbdDir, partner: FbdPartner): F05DispatchResult {
  const f = w.fbd[body];
  if (!f) return { ok: false, code: 'UNKNOWN' };
  if (f.locked) return { ok: false, code: 'LOCKED' };
  if (f.arrows.length >= 8) return { ok: false, code: 'FULL' };
  f.arrows.push({ force, dir, partner });
  // Roce en el sentido del movimiento: el bloque ganaría energía sin fuente (F05-E12).
  if (force === 'friction' && ((body === 'blockPull' && dir === 'upSlope') || (body === 'blockSlide' && dir === 'downSlope'))) errF5(w, 'E12', 'FBD_FRICTION_WITH_MOTION', 'WARN', { body });
  // Tensión vertical cuando el cable tira a lo largo del tablero (F05-E14).
  if (force === 'tension' && (dir === 'up' || dir === 'perp')) errF5(w, 'E14', 'FBD_VERTICAL_PULL', 'WARN', { body });
  emitF5(w, 'FORCE_DRAWN', 'INFO', { body, force, dir });
  return { ok: true, value: f.arrows.length - 1 };
}

export function fbdCorrect(w: F05World, body: FbdBody): boolean {
  const f = w.fbd[body];
  const req = FBD_REQUIRED[body].map(([a, b, c]) => `${a}/${b}/${c}`);
  const got = f.arrows.map((a) => normKey(body, a));
  if (new Set(got).size !== got.length) return false;
  return req.every((k) => got.includes(k)) && got.every((k) => req.includes(k));
}

function lockFbd(w: F05World, body: FbdBody): F05DispatchResult {
  const f = w.fbd[body];
  if (!f) return { ok: false, code: 'UNKNOWN' };
  if (!fbdCorrect(w, body)) {
    emitF5(w, 'FBD_INCOHERENT', 'WARN', { body });
    return { ok: false, code: 'FBD_INCOHERENT' };
  }
  f.locked = true;
  flagF5(w, `fbdOk:${body}`);
  emitF5(w, 'FBD_LOCKED', 'INFO', { body });
  return { ok: true };
}

// ─────────────────────────── Ángulo ───────────────────────────

function turnElevator(w: F05World, turns: number): F05DispatchResult {
  const pl = w.plane;
  const p = w.params;
  const want = pl.relDeg + turns * p.degPerTurn;
  if (want > GEOF05.plane.maxDeg + 1e-9) {
    // Tope mecánico del elevador: el tablero no pasa de 45° y el ensayo en curso se detiene (F05-E19).
    errF5(w, 'E19', 'PLANE_AT_STOP', 'WARN');
    if (w.pull && !w.pull.done) w.pull.done = true;
    if (w.slide && !w.slide.done) w.slide.done = true;
  }
  const next = Math.round(clamp(want, 0, GEOF05.plane.maxDeg) * 1e4) / 1e4;
  pl.lastStepDeg = Math.abs(next - pl.relDeg);
  if (next !== pl.relDeg) {
    pl.relDeg = next;
    pl.version++;
    pl.touchedS = w.timeS;
    // Inclinar con el bloque quieto y suelto arma la detección del ángulo crítico.
    const b = w.block;
    if (b.on === 'plane' && !b.pinned && !w.puller.attached && Math.abs(b.v) < 1e-6 && w.tilt.slipVersion === null) w.tilt.armed = true;
  }
  if (next < GEOF05.plane.maxDeg) rearmErrF5(w, 'E19');
  return { ok: true, value: pl.relDeg };
}

// ─────────────────────────── Cable, célula de carga y tirador ───────────────────────────

function attachCable(w: F05World, on: boolean): F05DispatchResult {
  const pu = w.puller;
  if (on) {
    if (w.block.on !== 'plane') return { ok: false, code: 'BLOCK_AWAY' };
    if (w.block.pinned) return { ok: false, code: 'PINNED' };
    const dx = pu.p - (w.block.s + HL);
    if (Math.hypot(dx, (pu.heightCm - GEOF05.cable.hookZ) / 100) > CABLE_LEN_M + 0.002) return { ok: false, code: 'TOO_SHORT' };
    pu.attached = true;
    flagF5(w, 'cableAttached');
    emitF5(w, 'CABLE_ATTACHED', 'INFO');
    return { ok: true };
  }
  if (!pu.attached) return { ok: true };
  if (pu.tensionN > 0.5) {
    // Soltar el cable con el resorte estirado: el gancho salta y golpea (F05-E40).
    w.energy.dissipatedJ += 0.5 * w.params.springK * pu.ext * pu.ext;
    pu.ext = 0;
    pu.tensionN = 0;
    pu.driveMs = 0;
    bumpF5(w, 'cableSnap');
    errF5(w, 'E40', 'CABLE_SNAP', 'CRITICAL');
    w.safety.block = { code: 'CABLE_SNAP', since: w.timeS };
    if (w.pull && !w.pull.done) w.pull.done = true;
  }
  pu.attached = false;
  return { ok: true };
}

function zeroSensor(w: F05World): F05DispatchResult {
  const s = w.sensor;
  if (!s.connected) return { ok: false, code: 'NOT_CONNECTED' };
  const f = w.puller.tensionN;
  s.offset = -f * Math.cos(s.angleDeg * DEG) * s.scale;
  s.zeroed = Math.abs(f) < 0.01;
  if (s.zeroed) {
    rearmErrF5(w, 'E08');
    flagF5(w, 'zeroed');
  }
  emitF5(w, s.zeroed ? 'SENSOR_ZEROED' : 'SENSOR_ZEROED_LOADED', s.zeroed ? 'INFO' : 'WARN');
  return { ok: true };
}

function calibrateSensor(w: F05World): F05DispatchResult {
  const s = w.sensor;
  if (!s.connected) return { ok: false, code: 'NOT_CONNECTED' };
  if (w.puller.attached) return { ok: false, code: 'UNLOAD_FIRST' };
  s.scale = 1;
  s.calibrated = true;
  rearmErrF5(w, 'E27');
  flagF5(w, 'calibrated');
  emitF5(w, 'SENSOR_CALIBRATED', 'INFO', { g: 500 });
  return { ok: true };
}

function pullSetup(w: F05World): PullSetup {
  const s = w.sensor;
  const m = w.surface.material;
  return {
    material: m,
    loadG: Math.round(blockLoadKg(w) * 1000),
    massG: Math.round(blockMassKg(w) * 1e4) / 10,
    relDeg: w.plane.relDeg,
    thetaDeg: Math.round(thetaDegF5(w) * 1e4) / 1e4,
    cableDeg: Math.round(cableDegF5(w) * 100) / 100,
    rateHz: w.logger.rateHz,
    driveCmS: Math.round(w.puller.driveMs * 1e4) / 100,
    sensor: { zeroed: s.zeroed, calibrated: s.calibrated, angleDeg: s.angleDeg, connected: s.connected, range: s.rangeIdx },
    worn: w.surface.worn[m],
    wornLogged: w.surface.wornLogged[m],
    clamped: w.plane.clamped,
    looseLoad: BALLASTS.some((b) => w.objects[b].support === 'block01' && !w.seated[b]),
  };
}

const PULL_ERRS = ['E01', 'E05', 'E06', 'E07', 'E08', 'E15', 'E16', 'E22', 'E23', 'E24', 'E26', 'E27', 'E32'];

/** Arranca el registro de un tirón si el tirador empieza a mover el cable. */
function ensurePull(w: F05World): boolean {
  if (runningPullF5(w)) return true;
  if (!w.puller.attached || w.block.on !== 'plane') return false;
  for (const e of PULL_ERRS) rearmErrF5(w, e);
  if (Math.abs(cableDegF5(w)) <= 3) flagF5(w, 'cableAligned');
  w.trial++;
  const rec: PullRecord = {
    id: w.trial, startS: w.timeS, samples: [], slipT: null, slipF: 0, jerkT: null, loadShiftT: null, configChangedT: null, clippedT: null, done: false, nextT: 0, stillS: 0,
    setup: pullSetup(w), configVersion: w.configVersion,
  };
  w.pull = rec;
  w.pulls.push(rec);
  for (const old of w.pulls.slice(0, -4)) old.samples = [];
  if (w.pulls.length > 16) w.pulls.splice(0, w.pulls.length - 16);
  emitF5(w, 'PULL_STARTED', 'INFO', { trial: w.trial });
  return true;
}

function setDrive(w: F05World, cmS: number): F05DispatchResult {
  const pu = w.puller;
  if (cmS <= 0) {
    pu.driveMs = 0;
    return { ok: true, value: 0 };
  }
  if (!w.params.drives.includes(cmS)) return { ok: false, code: 'BAD_DRIVE' };
  if (pu.p >= PU.s1 - 1e-6) return { ok: false, code: 'PULLER_END' };
  if (runningPullF5(w) && pu.driveMs > 0 && Math.abs(pu.driveMs - cmS / 100) > 1e-9) {
    const r = w.pull!;
    if (r.configChangedT === null) {
      r.configChangedT = Math.round((w.timeS - r.startS) * 1e4) / 1e4;
      errF5(w, 'E32', 'CONFIG_DURING_RUN', 'WARN', { cmd: 'setDrive' });
    }
  }
  ensurePull(w);
  pu.driveMs = cmS / 100;
  if (w.pull && !w.pull.done && w.pull.samples.length === 0) w.pull.setup.driveCmS = cmS;
  return { ok: true, value: cmS };
}

function turnCrank(w: F05World, turns: number): F05DispatchResult {
  const pu = w.puller;
  if (pu.driveMs > 0) return { ok: false, code: 'MOTOR_ON' };
  const next = clamp(pu.p + turns * PU.mPerTurn, PU.s0, PU.s1);
  if (next === pu.p) return { ok: true, value: pu.p };
  if (next > pu.p) ensurePull(w);
  pu.p = Math.round(next * 1e6) / 1e6;
  if (w.pull && !w.pull.done) w.pull.stillS = 0;
  return { ok: true, value: pu.p };
}

function jerk(w: F05World): F05DispatchResult {
  const pu = w.puller;
  if (!pu.attached) return { ok: false, code: 'NOT_ATTACHED' };
  if (pu.p >= PU.s1 - 1e-6) return { ok: false, code: 'PULLER_END' };
  ensurePull(w);
  pu.p = Math.min(PU.s1, pu.p + w.params.jerkM);
  const r = w.pull!;
  if (r.jerkT === null) r.jerkT = Math.round((w.timeS - r.startS) * 1e4) / 1e4;
  r.stillS = 0;
  errF5(w, 'E05', 'SUDDEN_PULL', 'WARN');
  // El tirón raya la tira bajo el bloque (modo realista).
  if (w.params.scientificMode === 'REALISTIC') scratch(w);
  emitF5(w, 'JERK', 'WARN');
  return { ok: true };
}

function scratch(w: F05World) {
  const m = w.surface.material;
  if (w.surface.worn[m]) return;
  w.surface.worn[m] = true;
  w.surface.wornLogged[m] = false;
  emitF5(w, 'SURFACE_SCRATCHED', 'WARN', { mat: m });
}

function returnPuller(w: F05World): F05DispatchResult {
  const pu = w.puller;
  pu.driveMs = 0;
  pu.p = PU.s0;
  if (w.pull && !w.pull.done) w.pull.done = true;
  emitF5(w, 'PULLER_RETURNED', 'INFO');
  return { ok: true };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
const std = (xs: number[]) => {
  const m = mean(xs);
  return xs.length > 1 ? Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1)) : 0;
};

/** Flags de calidad de la célula en un montaje. */
function sensorFlags(s: PullSetup['sensor'], out: string[]) {
  if (!s.connected) out.push('UNPLUGGED');
  if (!s.zeroed) out.push('NOT_ZEROED');
  if (!s.calibrated) out.push('UNCALIBRATED');
  if (s.angleDeg >= 60) out.push('PERPENDICULAR');
  else if (s.angleDeg >= 3) out.push('TILTED_SENSOR');
}

const FLAG_ERR: Record<string, [string, string]> = {
  CABLE_TILTED: ['E01', 'CABLE_TILTED'],
  JERK: ['E05', 'READ_AFTER_JERK'],
  ACCELERATING: ['E06', 'READ_ACCELERATING'],
  LOAD_SHIFT: ['E07', 'LOAD_SHIFTED'],
  NOT_ZEROED: ['E08', 'NOT_ZEROED'],
  OSCILLATING: ['E15', 'READ_OSCILLATING'],
  CLIPPED: ['E22', 'SENSOR_SATURATED'],
  UNPLUGGED: ['E23', 'NO_SIGNAL'],
  LOW_RATE: ['E24', 'LOW_RATE'],
  OCCLUDED: ['E25', 'GATE_OCCLUDED'],
  TILTED_SENSOR: ['E26', 'SENSOR_TILTED'],
  PERPENDICULAR: ['E26', 'SENSOR_TILTED'],
  UNCALIBRATED: ['E27', 'SENSOR_UNCALIBRATED'],
  BASE_SLIP: ['E28', 'SUPPORT_SHIFTED'],
  CONFIG_CHANGED: ['E32', 'CONFIG_DURING_RUN'],
  POST_IMPACT: ['E39', 'READ_AFTER_IMPACT'],
  DRIFT: ['E03', 'PLANE_DRIFT'],
};

function readPull(w: F05World, t0: number, t1: number): F05DispatchResult {
  const rec = w.pulls[w.pulls.length - 1];
  if (!rec) return { ok: false, code: 'NO_RUN' };
  if (!rec.samples.length) return { ok: false, code: 'NO_DATA' };
  const p = w.params;
  const dur = rec.samples[rec.samples.length - 1][0];
  const a0 = clamp(t0, 0, dur);
  const a1 = clamp(t1, 0, dur);
  if (!(a1 - a0 >= 0.2)) return { ok: false, code: 'BAD_WINDOW' };
  const win = rec.samples.filter((x) => x[0] >= a0 - 1e-9 && x[0] <= a1 + 1e-9);
  const su = rec.setup;
  const flags: string[] = [];
  const within = (t: number | null) => t !== null && t <= a1;
  const slip = rec.slipT;
  if (slip === null) flags.push('NO_SLIP');
  else if (a0 < slip + 0.05) flags.push('BEFORE_SLIP');
  if (within(rec.jerkT)) flags.push('JERK');
  if (within(rec.loadShiftT)) flags.push('LOAD_SHIFT');
  if (within(rec.configChangedT)) flags.push('CONFIG_CHANGED');
  if (Math.abs(su.cableDeg) > 3) flags.push('CABLE_TILTED');
  if (su.relDeg > 0.5) flags.push('INCLINED');
  if (su.worn && !su.wornLogged) {
    flags.push('WORN');
    errF5(w, 'E16', 'WORN_SURFACE', 'WARN', { mat: su.material });
  }
  sensorFlags(su.sensor, flags);
  const peakEnd = Math.max(a1, (slip ?? 0) + 0.1);
  if (rec.samples.some((x) => x[0] <= peakEnd + 1e-9 && x[5] > 0)) flags.push('CLIPPED');
  if (su.rateHz < 50) flags.push('LOW_RATE');
  if (win.length < 5) flags.push('FEW_SAMPLES');
  // Ventana del régimen: aceleración media del bloque y oscilación de su velocidad (filtrado por aceleración, §5).
  const v0 = win[0]?.[4] ?? 0;
  const v1 = win[win.length - 1]?.[4] ?? 0;
  const dtw = (win[win.length - 1]?.[0] ?? 0) - (win[0]?.[0] ?? 0);
  const aMean = dtw > 0 ? (v1 - v0) / dtw : NaN;
  if (slip !== null && !flags.includes('BEFORE_SLIP')) {
    if (Math.abs(aMean) > 0.01) flags.push('ACCELERATING');
    const vStd = std(win.map((x) => x[4]));
    if (vStd > Math.max(0.002, 0.25 * (su.driveCmS / 100))) flags.push('OSCILLATING');
  }
  const qf = [...new Set(flags)];
  for (const f of qf) if (FLAG_ERR[f]) errF5(w, FLAG_ERR[f][0], FLAG_ERR[f][1], 'WARN', { inst: 'load01' });
  const Fmean = su.sensor.connected ? mean(win.map((x) => x[1])) : NaN;
  let Fpeak = NaN;
  let truePeak = NaN;
  if (slip !== null && su.sensor.connected) {
    const pre = rec.samples.filter((x) => x[0] <= slip + 0.05 + 1e-9);
    Fpeak = Math.max(...pre.map((x) => x[1]));
    truePeak = rec.slipF;
  }
  const value = Number.isFinite(Fmean) ? Math.round(Fmean * 1e4) / 1e4 : NaN;
  const trueMean = mean(win.map((x) => x[2]));
  const r = addReading(w, {
    kind: 'pull', instrumentId: 'load01', value, unit: 'N', resolution: p.force.resolutions[su.sensor.range] ?? 0.01, uncertainty: p.uB.forceN, sourceObjectIds: ['load01', 'logger01', 'block01', 'puller01'],
    qualityFlags: qf, trueValue: trueMean, target: 'block01', trial: rec.id, configVersion: rec.configVersion,
    pull: {
      Fpeak: fin(Number.isFinite(Fpeak) ? Math.round(Fpeak * 1e4) / 1e4 : NaN), Fmean: fin(value), t0: a0, t1: a1, n: win.length, slipT: fin(slip), aMean: fin(Number.isFinite(aMean) ? Math.round(aMean * 1e5) / 1e5 : NaN),
      trueMean: fin(trueMean), truePeak: fin(truePeak),
    },
    setup: { ...su },
  });
  emitF5(w, 'PULL_READ', qf.length ? 'WARN' : 'INFO', { F: value, n: win.length });
  return { ok: true, id: r.id, value };
}

/** Recta de mínimos cuadrados para un polinomio de grado 2: devuelve el coeficiente de t² (x = c0 + c1 t + c2 t²). */
function quadFit(pts: Array<[number, number]>): number {
  const n = pts.length;
  if (n < 4) return NaN;
  let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0, y0 = 0, y1 = 0, y2 = 0;
  for (const [t, y] of pts) {
    const t2 = t * t;
    s0 += 1; s1 += t; s2 += t2; s3 += t2 * t; s4 += t2 * t2;
    y0 += y; y1 += y * t; y2 += y * t2;
  }
  // Resolver [[s0 s1 s2][s1 s2 s3][s2 s3 s4]] c = [y0 y1 y2] por Cramer.
  const det = (a: number[][]) => a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
  const M = [[s0, s1, s2], [s1, s2, s3], [s2, s3, s4]];
  const D = det(M);
  if (Math.abs(D) < 1e-18) return NaN;
  const M2 = [[s0, s1, y0], [s1, s2, y1], [s2, s3, y2]];
  return det(M2) / D;
}

function readSlide(w: F05World): F05DispatchResult {
  const rec = w.slides[w.slides.length - 1];
  if (!rec) return { ok: false, code: 'NO_RUN' };
  if (!rec.samples.length) return { ok: false, code: 'NO_DATA' };
  if (!rec.done) return { ok: false, code: 'BUSY' };
  const p = w.params;
  const su = rec.setup;
  const flags: string[] = [];
  const end = rec.impactT ?? rec.samples[rec.samples.length - 1][0];
  const win = rec.samples.filter((x) => x[0] >= 0.05 && x[0] <= end - 0.03 && Math.abs(x[3]) > 1e-4);
  const moved = Math.abs((rec.samples[0]?.[2] ?? 0) - (rec.samples[rec.samples.length - 1]?.[2] ?? 0));
  if (moved < 2) flags.push('NOT_SLID');
  if (su.flagBent) flags.push('POST_IMPACT');
  if (su.occluded.length) flags.push('OCCLUDED');
  if (!su.gatesOn || !su.videoOn) flags.push('UNPLUGGED');
  if (su.rateHz < 50) flags.push('LOW_RATE');
  if (rec.driftT !== null || !su.locked) flags.push('DRIFT');
  if (rec.baseSlipT !== null) flags.push('BASE_SLIP');
  if (rec.loadShiftT !== null) flags.push('LOAD_SHIFT');
  if (rec.configChangedT !== null) flags.push('CONFIG_CHANGED');
  if (su.worn && !su.wornLogged) {
    flags.push('WORN');
    errF5(w, 'E16', 'WORN_SURFACE', 'WARN', { mat: su.material });
  }
  if (win.length < 5) flags.push('FEW_SAMPLES');
  const qf = [...new Set(flags)];
  for (const f of qf) if (FLAG_ERR[f]) errF5(w, FLAG_ERR[f][0], FLAG_ERR[f][1], 'WARN', { inst: 'logger01' });
  // El video mide la posición a lo largo del plano: a hacia abajo = −2 c₂ (cm/s² → m/s²).
  const c2 = su.videoOn ? quadFit(win.map((x) => [x[0], x[1]])) : NaN;
  const a = Number.isFinite(c2) ? Math.round((-2 * c2) / 100 * 1e4) / 1e4 : NaN;
  const gp = p.gate;
  const g1 = rec.gates.gate1?.[0];
  const g2 = rec.gates.gate2?.[0];
  const ind = (t: number | null | undefined) => (su.gatesOn ? timerIndication(t ?? null, gp) : null);
  const dtOf = (e: [number, number | null] | undefined) => (e && e[1] !== null && su.gatesOn ? timerIndication(e[1] - e[0], gp, gaussF5(w)) : null);
  const trueA = mean(win.map((x) => -x[4]));
  const r = addReading(w, {
    kind: 'slide', instrumentId: 'logger01', value: a, unit: 'm/s²', resolution: 0.01, uncertainty: 0.02, sourceObjectIds: ['logger01', 'gate1', 'gate2', 'block01'], qualityFlags: qf,
    trueValue: trueA, target: 'block01', trial: rec.id, configVersion: rec.configVersion,
    slide: { a: fin(a), dt1: fin(dtOf(g1)), dt2: fin(dtOf(g2)), t1g: fin(ind(g1?.[0])), t2g: fin(ind(g2?.[0])), trueA: fin(trueA) },
    setup: { ...su },
  });
  emitF5(w, 'SLIDE_READ', qf.length ? 'WARN' : 'INFO', { a, n: win.length });
  return { ok: true, id: r.id, value: a };
}

// ─────────────────────────── Cierre y bloqueos ───────────────────────────

function closeStation(w: F05World): F05DispatchResult {
  const pl = w.plane;
  if (pl.relDeg > 1) {
    if (!pl.locked) {
      // Cerrar con el tablero alto y el elevador sin bloquear: el mecanismo baja de golpe (F05-E20).
      pl.relDeg = 0;
      pl.version++;
      pl.touchedS = w.timeS;
      if (w.block.on === 'plane') {
        w.energy.dissipatedJ += 0.5 * blockMassKg(w) * w.block.v * w.block.v;
        w.block.v = 0;
      }
      errF5(w, 'E20', 'PLANE_SLAM', 'CRITICAL');
      w.safety.block = { code: 'PLANE_SLAM', since: w.timeS };
      return { ok: false, code: 'PLANE_SLAM' };
    }
    return { ok: false, code: 'LOWER_FIRST' };
  }
  if (busyF5(w) || Math.abs(w.block.v) > 1e-4) return { ok: false, code: 'BUSY' };
  if (w.puller.attached) return { ok: false, code: 'CABLE_ATTACHED' };
  if (w.puller.p > PU.s0 + 1e-6) return { ok: false, code: 'PULLER_OUT' };
  if (BALLASTS.some((m) => w.objects[m].support !== 'rack')) return { ok: false, code: 'MASSES_OUT' };
  if (w.block.on !== 'plane') return { ok: false, code: 'BLOCK_AWAY' };
  if (w.balance.on) return { ok: false, code: 'PAN_BUSY' };
  if (!pl.locked) return { ok: false, code: 'UNLOCKED' };
  flagF5(w, 'stationClosed');
  emitF5(w, 'STATION_CLOSED', 'INFO');
  return { ok: true };
}

function acknowledge(w: F05World): F05DispatchResult {
  const b = w.safety.block;
  if (!b) return { ok: true };
  if (b.code === 'CABLE_SNAP' && w.puller.p > PU.s0 + 1e-6) return { ok: false, code: 'SECURE_FIRST' };
  if (b.code === 'PLANE_SLAM' && !w.plane.locked) return { ok: false, code: 'SECURE_FIRST' };
  w.safety.block = null;
  emitF5(w, 'STATION_RESET', 'INFO', { code: b.code });
  return { ok: true };
}

// ─────────────────────────── Paso: bloque, cable y tirador ───────────────────────────

/** Deja caer los lastres sueltos si el bloque acelera fuerte o el tablero se inclina (F05-E07). */
function shedLoose(w: F05World, a: number, rec: { startS: number; loadShiftT: number | null } | null) {
  const p = w.params;
  for (const m of BALLASTS) {
    if (w.objects[m].support !== 'block01' || w.seated[m]) continue;
    if (Math.abs(a) < p.looseFallA && thetaDegF5(w) < p.looseFallDeg) continue;
    const E0 = mechanicalEnergyJ(w);
    w.objects[m].support = 'bench';
    w.seated[m] = true;
    w.energy.dissipatedJ += E0 - mechanicalEnergyJ(w);
    errF5(w, 'E07', 'BALLAST_FELL', 'WARN', { id: m });
    if (rec && rec.loadShiftT === null) rec.loadShiftT = Math.round((w.timeS - rec.startS) * 1e4) / 1e4;
  }
}

function stepBlock(w: F05World, t0: number, h: number) {
  const b = w.block;
  const pu = w.puller;
  const p = w.params;
  const pull = runningPullF5(w) ? w.pull : null;
  const slide = runningSlideF5(w) ? w.slide : null;
  // Tirador: el motor avanza el gancho a rapidez constante hasta el final del carril.
  const pOld = pu.p;
  if (pu.driveMs > 0) {
    pu.p = Math.min(PU.s1, pu.p + pu.driveMs * h);
    if (pu.p >= PU.s1 - 1e-9) {
      pu.p = PU.s1;
      pu.driveMs = 0;
      emitF5(w, 'PULLER_END', 'INFO');
    }
  }
  const dp = pu.p - pOld;
  if (b.on !== 'plane') {
    pu.ext = 0;
    pu.tensionN = 0;
    return;
  }
  const m = blockMassKg(w);
  const sinT = sinTheta(w);
  const cosT = cosTheta(w);
  const s0 = b.s;
  // Cable: tensión elástica del resorte más su amortiguador, solo si está tenso.
  let T = 0;
  let cosA = 1;
  let sinA = 0;
  let extDot = 0;
  if (pu.attached) {
    const dx = pu.p - (b.s + HL);
    const dz = (pu.heightCm - GEOF05.cable.hookZ) / 100;
    const chord = Math.hypot(dx, dz) || 1e-9;
    cosA = dx / chord;
    sinA = dz / chord;
    pu.ext = Math.max(0, chord - CABLE_LEN_M);
    extDot = (dp / h - b.v) * cosA;
    if (pu.ext > 0) T = Math.max(0, p.springK * pu.ext + p.springC * extDot);
  } else pu.ext = 0;
  pu.tensionN = T;
  const N = Math.max(0, m * p.g * cosT - T * sinA);
  const mu = muAt(w, b.s);
  const fk = mu.k * N;
  const restFrac = 1 - Math.exp(-b.restS / Math.max(1e-6, p.restTau));
  const fs = (mu.k + (mu.s - mu.k) * restFrac) * N;
  const F = T * cosA - m * p.g * sinT;
  let v1 = b.v;
  let dx = 0;
  let fricDiss = 0;
  const wasResting = Math.abs(b.v) < 1e-6;
  if (b.pinned) {
    v1 = 0;
  } else if (wasResting) {
    if (Math.abs(F) > fs) {
      const a = (F - sgn(F) * fk) / m;
      v1 = a * h;
      dx = (v1 / 2) * h;
      fricDiss = fk * Math.abs(dx);
    }
  } else {
    const a = (F - sgn(b.v) * fk) / m;
    v1 = b.v + a * h;
    if (sgn(v1) !== sgn(b.v)) v1 = 0;
    dx = ((b.v + v1) / 2) * h;
    fricDiss = fk * Math.abs(dx);
  }
  const aBlock = (v1 - b.v) / h;
  // Arranque del deslizamiento: pico estático en el tirón o ángulo crítico al inclinar.
  if (wasResting && Math.abs(v1) > 1e-6 && !b.pinned) {
    if (pull && pull.slipT === null && T > 0) {
      pull.slipT = Math.round((t0 + h - pull.startS) * 1e4) / 1e4;
      pull.slipF = Math.round(T * 1e5) / 1e5;
      emitF5(w, 'BLOCK_SLIPPED', 'INFO');
    } else if (T === 0 && !slide && w.tilt.armed && w.plane.relDeg > 1 && w.tilt.slipVersion === null) {
      w.tilt.slipRelDeg = w.plane.relDeg;
      w.tilt.slipStepDeg = w.plane.lastStepDeg;
      w.tilt.slipVersion = w.plane.version;
      w.tilt.material = w.surface.material;
      w.tilt.shifted = false;
      w.tilt.armed = false;
      emitF5(w, 'BLOCK_SLIPPED', 'INFO');
    }
  }
  b.v = v1;
  b.s += dx;
  b.restS = Math.abs(v1) < 1e-6 ? b.restS + h : 0;
  // Energía: trabajo del tirador sobre el cable (externo); roce y amortiguador (disipados).
  w.energy.externalJ += T * cosA * dp;
  w.energy.dissipatedJ += fricDiss + (pu.ext > 0 && T > 0 ? p.springC * extDot * extDot * h : 0);
  // Tope inferior (espuma o goma) y extremo alto del tablero.
  if (b.s < BLOCK_MIN_S && b.v < 0) {
    const vi = -b.v;
    b.s = BLOCK_MIN_S;
    const e = w.catcherOn ? 0 : 0.2;
    b.v = e * vi;
    w.energy.dissipatedJ += 0.5 * m * (vi * vi - b.v * b.v);
    // La energía potencial del pequeño exceso bajo el tope vuelve al balance.
    if (slide && slide.impactT === null) {
      slide.impactT = Math.round((t0 + h - slide.startS) * 1e4) / 1e4;
      slide.impactV = Math.round(vi * 1000) / 1000;
    }
    if (!w.catcherOn && vi >= p.bendMs && !b.flagBent) {
      b.flagBent = true;
      if (p.scientificMode === 'REALISTIC') scratch(w);
      emitF5(w, 'BLOCK_HIT_STOP', 'WARN', { v: Math.round(vi * 100) / 100 });
    }
    // El golpe empuja el tablero: con el soporte suelto, el elevador cede (F05-E28).
    if (!w.plane.clamped && w.plane.relDeg > 8 && vi > 0.1) {
      const E0 = mechanicalEnergyJ(w);
      w.plane.relDeg = Math.max(0, Math.round((w.plane.relDeg - p.supportSlipDeg) * 1e4) / 1e4);
      w.plane.shifts++;
      w.energy.externalJ += mechanicalEnergyJ(w) - E0;
      if (w.tilt.slipVersion !== null) w.tilt.shifted = true;
      if (slide && slide.baseSlipT === null) slide.baseSlipT = slide.impactT;
      errF5(w, 'E28', 'SUPPORT_SHIFTED', 'WARN');
    }
  }
  const sMax = 1 - HL;
  if (b.s > sMax && b.v > 0) {
    w.energy.dissipatedJ += 0.5 * m * b.v * b.v;
    b.s = sMax;
    b.v = 0;
  }
  // Corrección de energía potencial por el recorte de posición en los topes (el exceso del subpaso).
  const clipDs = b.s - (s0 + dx);
  if (Math.abs(clipDs) > 0) w.energy.dissipatedJ -= m * p.g * sinT * clipDs;
  shedLoose(w, aBlock, pull ?? slide);
  // Registros: tirón (célula de carga) y deslizamiento (video y compuertas), con el reloj físico.
  if (pull) {
    const tRel = t0 + h - pull.startS;
    while (pull.nextT <= tRel + 1e-9) {
      const fi = forceIndication(T, w.sensor, p.force, gaussF5(w) * p.noiseFactor);
      const clipped = w.sensor.connected && fi.clipped ? 1 : 0;
      if (clipped && pull.clippedT === null) {
        pull.clippedT = pull.nextT;
        errF5(w, 'E22', 'SENSOR_SATURATED', 'WARN', { inst: 'load01' });
      }
      pull.samples.push([Math.round(pull.nextT * 1e4) / 1e4, w.sensor.connected ? fi.value : 0, Math.round(T * 1e5) / 1e5, Math.round(b.s * 1e5) / 1e3, Math.round(b.v * 1e6) / 1e6, clipped]);
      pull.nextT = Math.round((pull.nextT + 1 / w.logger.rateHz) * 1e6) / 1e6;
    }
    pull.stillS = Math.abs(b.v) < 1e-5 && pu.driveMs === 0 ? pull.stillS + h : 0;
    if (tRel >= 60 || (pull.stillS >= 0.6 && tRel > 0.5)) {
      pull.done = true;
      emitF5(w, 'PULL_DONE', 'INFO', { trial: pull.id, n: pull.samples.length });
    }
  }
  if (slide) {
    const tRel = t0 + h - slide.startS;
    for (const [id, g] of Object.entries(w.gates)) {
      const fw = (GEOF05.block.flagW / 100) * (b.flagBent ? p.bentFactor : 1);
      updateGate(g, s0, b.s, t0, h, fw, p.gate, slide.startS);
      slide.gates[id] = g.events.map((e) => [e[0], e[1]] as [number, number | null]);
    }
    while (slide.nextT <= tRel + 1e-9) {
      const xi = quant(b.s * 100 + gaussF5(w) * 0.05 * p.noiseFactor, p.videoResCm);
      slide.samples.push([Math.round(slide.nextT * 1e4) / 1e4, w.logger.videoOn ? xi : 0, Math.round(b.s * 1e5) / 1e3, Math.round(b.v * 1e5) / 1e5, Math.round(aBlock * 1e4) / 1e4]);
      slide.nextT = Math.round((slide.nextT + 1 / w.logger.rateHz) * 1e6) / 1e6;
    }
    slide.stillS = Math.abs(b.v) < 1e-5 ? slide.stillS + h : 0;
    if (tRel >= 4 || (slide.stillS >= 0.3 && tRel > 0.3)) {
      slide.done = true;
      emitF5(w, 'SLIDE_DONE', 'INFO', { trial: slide.id, n: slide.samples.length });
    }
  }
}

/** El tablero sin la tuerca de bloqueo cede despacio bajo su peso (F05-E03). */
function stepPlane(w: F05World, dt: number) {
  const pl = w.plane;
  if (pl.locked || pl.relDeg <= 0) return;
  const E0 = mechanicalEnergyJ(w);
  pl.relDeg = Math.max(0, Math.round((pl.relDeg - w.params.driftDegS * dt) * 1e6) / 1e6);
  w.energy.externalJ += mechanicalEnergyJ(w) - E0;
  if (w.slide && !w.slide.done && w.slide.driftT === null) w.slide.driftT = Math.round((w.timeS - w.slide.startS) * 1e4) / 1e4;
}

// ─────────────────────────── Paso de simulación ───────────────────────────

export function stepF05World(w: F05World): void {
  const dt = w.params.dtS;
  const n = Math.max(1, w.params.subSteps);
  const h = dt / n;
  const tStart = w.timeS;
  w.timeS = Math.round((w.timeS + dt) * 1e6) / 1e6;
  w.tick++;
  stepPlane(w, dt);
  for (let i = 0; i < n; i++) stepBlock(w, tStart + i * h, h);
}

export function runF05For(w: F05World, seconds: number) {
  const n = Math.round(seconds / w.params.dtS);
  for (let i = 0; i < n; i++) stepF05World(w);
}

export function f05Summary(w: F05World) {
  return {
    s: Math.round(w.block.s * 1e6) / 1e6,
    v: Math.round(w.block.v * 1e6) / 1e6,
    p: Math.round(w.puller.p * 1e6) / 1e6,
    deg: Math.round(w.plane.relDeg * 1e4) / 1e4,
    trial: w.trial,
    readings: w.readingOrder.length,
    cfg: w.configVersion,
  };
}
