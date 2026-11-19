/**
 * Mundo de F103 — proyectiles y trayectorias bidimensionales: paso fijo determinista de 0,05 s con 10 subpasos de 5 ms
 * (§6). La escena solo dibuja este estado y envía hechos geométricos.
 *
 * - Lanzador de resorte: la muesca comprime el resorte (energía ½ k x²); al tirar del cordón, esfera y émbolo se aceleran
 *   juntos con el rendimiento del modo activo, el émbolo se detiene en el tope y la esfera sale con la elevación REAL
 *   (mando + inclinación del deck) y el azimut del lanzador. Sin anclar, el soporte retrocede con el impulso opuesto y lo
 *   frena el roce con el suelo (se desplaza la boca).
 * - Vuelo 3D: m dv/dt = m g − ½ ρ C_d A |v − v_aire| (v − v_aire), integrado con punto medio en cada subpaso; en modo
 *   curricular la aceleración es constante y el resultado es la parábola exacta.
 * - Contactos con CCD: el instante exacto en que la esfera toca la plataforma, el suelo, la pantalla o el colchón se
 *   resuelve dentro del subpaso (nunca atraviesa un sólido). El primer contacto define el alcance; los rebotes (con
 *   restitución e) se registran aparte.
 * - Instrumentos: fotopuerta de esfera en la boca (`instruments/ball-gate`) y plataforma con reloj de evento
 *   (`instruments/impact-platform`), conectados a la interfaz.
 */
import type { F103Command, F103DispatchResult, PpeItem, TapeTarget } from './commands';
import type { Contact, F103Object, F103Params, F103World, Flight, Pose, ReadingF3, ShotSetup } from './types';
import { hashRandom } from '../core/rng';
import { bumpF3, emitF3, errF3, flagF3, gaussF3, rearmErrF3 } from './events';
import { FLOOR_Z, GEOF103, MUZZLE0 } from './geometry';
import { conservedTotalsF103, flightEnergyJ, mechanicalEnergyJ, springEnergyJ } from './conservation';
import { gateCrossing, resolvedAt, sampledInterval } from '../instruments/ball-gate';
import { clockIndication, onPlatform, platformIndication } from '../instruments/impact-platform';

export { emitF3, latchF3, rearmF3, bumpF3, flagF3, errF3 } from './events';
export { conservedTotalsF103 };

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, num(v, a)));
const DEG = Math.PI / 180;
const L = GEOF103.lane;
const LANE_YC = L.yc / 100;
const PLAT_H = GEOF103.platform.h / 100;
const SCREEN_H = GEOF103.screen.h / 100;
const BACKSTOP_X = L.backstopX / 100;
/** Distancia máxima a la boca (m) a la que la pantalla cuenta como «pantalla segura» de calibración. */
export const SAFE_SCREEN_M = 1.5;

/** Escenarios docentes (§10). */
export const SF3 = {
  NO_AIR: 'F103-S01_no_air',
  DRAG: 'F103-S02_drag',
  LIGHT_BALL: 'F103-S03_light_ball',
  HIGH_ANGLE: 'F103-S04_high_angle',
  SIDE_PLATFORM: 'F103-S05_side_platform',
  RAISED_BASE: 'F103-S06_raised_base',
  WEAK_SPRING: 'F103-S07_weak_spring',
  SIDE_WIND: 'F103-S08_side_wind',
  SENSOR_DELAY: 'F103-S09_sensor_delay',
  BOUNCY_FLOOR: 'F103-S10_bouncy_floor',
  GATE_CALIBRATION: 'F103-S11_gate_calibration',
  OUT_OF_PLANE: 'F103-S12_out_of_plane',
} as const;

export interface F103WorldSpec {
  objects: F103Object[];
  scenarios: string[];
  mode: string;
}

/** Esferas: tres estándar (Ø 2,50 cm), una ligera hueca del mismo diámetro y una grande (Ø 4,0 cm) de la misma masa. */
export const BALLS_F3 = ['ballA', 'ballB', 'ballC', 'ballL', 'ballX'] as const;
export const STD_BALLS = ['ballA', 'ballB', 'ballC'] as const;

// ─────────────────────────── Creación ───────────────────────────

export function createF103World(spec: F103WorldSpec, seed: number, params: F103Params): F103World {
  const has = (s: string) => spec.scenarios.includes(s);
  const objects: Record<string, F103Object> = {};
  for (const o of spec.objects) objects[o.id] = { ...o, pose: { ...o.pose } };
  const h = (k: string) => hashRandom(seed, k) - 0.5;
  const sign = (k: string) => (h(k) > 0 ? 1 : -1);
  const tilt = Math.round(sign('tiltSign') * (0.5 + (h('tilt') + 0.5) * 0.6) * 10) / 10;
  const offset = Math.round(sign('protSign') * params.protractorOffsetDeg * (0.7 + (h('prot') + 0.5) * 0.6) * 10) / 10;
  const stdG = has(SF3.LIGHT_BALL) ? 10 : 20;
  const balls: F103World['balls'] = {};
  for (const id of STD_BALLS) balls[id] = { massKg: (stdG * (1 + h(id) * 0.006)) / 1000, diameterM: 0.025 * (1 + h(`${id}d`) * 0.002), nominalCm: 2.5, nominalG: stdG, damaged: false };
  balls.ballL = { massKg: (6 * (1 + h('ballL') * 0.01)) / 1000, diameterM: 0.025 * (1 + h('ballLd') * 0.002), nominalCm: 2.5, nominalG: 6, damaged: false };
  balls.ballX = { massKg: (20 * (1 + h('ballX') * 0.006)) / 1000, diameterM: 0.04 * (1 + h('ballXd') * 0.002), nominalCm: 4.0, nominalG: 20, damaged: false };
  const mx = MUZZLE0.x / 100;
  const w: F103World = {
    timeS: 0, tick: 0, seed, rng: seed >>> 0 || 1, params, mode: spec.mode, objects,
    stand: { heightCm: has(SF3.RAISED_BASE) ? 90 : 30, tiltDeg: tilt, anchored: false, touchedS: 0 },
    launcher: {
      angleDeg: has(SF3.HIGH_ANGLE) ? 75 : 30, yawDeg: has(SF3.OUT_OF_PLANE) ? 4 : 0, x: mx, y: MUZZLE0.y / 100, notch: 0, loaded: null, capOn: true,
      protractorOffsetDeg: offset, zeroed: false, levelRefDeg: 0, touchedS: 0,
    },
    gate: { mounted: false, offsetMm: has(SF3.GATE_CALIBRATION) ? 9 : 0, connected: false },
    timer: { rateHz: params.gate.rates[0], range: 'short' },
    platform: { x: 3.0, y: has(SF3.SIDE_PLATFORM) ? LANE_YC - 0.3 : LANE_YC, calibrated: false, connected: false, movedS: -10 },
    screen: { x: mx + 1.0, inLane: false, marks: [] },
    fan: { speed: 0, dir: 'side' },
    barrierClosed: false,
    tapeZeroX: Math.round((mx + 0.025 + (h('tape') + 0.5) * 0.03) * 1e4) / 1e4,
    plumbMark: null,
    balls,
    flight: null,
    lastShot: null,
    energy: { dissipatedJ: 0, externalJ: 0 },
    recoil: { impulse: 0, shots: 0 },
    trial: 1,
    shots: 0,
    configVersion: 1,
    readings: {}, readingOrder: [],
    safety: { ppe: { coat: false, goggles: false, shoes: false, hair: false }, block: null, stoppedByTeacher: false },
    events: [], evidence: {}, scenarios: [...spec.scenarios], ppe: false,
    initialTotals: { massesG: 0, balls: 0 },
  };
  const tot = conservedTotalsF103(w);
  w.initialTotals = { massesG: tot.massesG, balls: tot.balls };
  w.energy.externalJ = mechanicalEnergyJ(w);
  return w;
}

// ─────────────────────────── Consultas ───────────────────────────

/** Boca del lanzador (eje de giro): posición sobre el suelo (m). */
export function muzzleF3(w: F103World): { x: number; y: number; z: number } {
  return { x: w.launcher.x, y: w.launcher.y, z: (w.stand.heightCm + GEOF103.stand.pivotDz) / 100 };
}
/** Elevación real del cañón respecto de la horizontal (°): mando + inclinación del deck. */
export const elevationF3 = (w: F103World) => w.launcher.angleDeg + w.stand.tiltDeg;
export const ballFlying = (w: F103World) => !!w.flight && !w.flight.done;
/** Viento en la pista (m/s): ventilador y corriente ambiental del escenario S08. */
export function windF3(w: F103World): { x: number; y: number } {
  const p = w.params;
  const ms = p.fanMs[w.fan.speed] ?? 0;
  const amb = w.scenarios.includes(SF3.SIDE_WIND) ? p.ambientSideMs : 0;
  const f = w.fan.dir === 'side' ? { x: 0, y: ms } : w.fan.dir === 'head' ? { x: -ms, y: 0 } : { x: ms, y: 0 };
  return { x: f.x, y: f.y + amb };
}
export const windSpeedF3 = (w: F103World) => Math.hypot(windF3(w).x, windF3(w).y);
export const dragOn = (w: F103World) => w.params.scientificMode === 'REALISTIC' || w.params.dragAlways;
/** ¿La esfera está en la bandeja del soporte? */
export const inTray = (w: F103World, id: string) => w.objects[id]?.support === 'tray';
export const ballsInTray = (w: F103World) => BALLS_F3.filter((b) => inTray(w, b)).length;
/** Inclinación del deck respecto de la referencia con que se ajustó el cero del transportador (°). */
export const tiltErrorF3 = (w: F103World) => w.stand.tiltDeg - (w.launcher.zeroed ? w.launcher.levelRefDeg : 0);

// ─────────────────────────── Despacho ───────────────────────────

const BEFORE_PPE = new Set<F103Command['type']>(['equipPpe', 'startWork', 'teacherStop', 'acknowledge', 'inspect']);
const DURING_BLOCK = new Set<F103Command['type']>(['acknowledge', 'teacherStop', 'inspect', 'setPose', 'setCap', 'closeBarrier', 'cock', 'collectBall', 'setFan']);
/** Comandos que cambian la condición física del ensayo (nuevo montaje; E32 si hay una esfera en vuelo). */
const CONFIG = new Set<F103Command['type']>(['setStandHeight', 'turnLevelScrew', 'setAngle', 'setYaw', 'cock', 'mountGate', 'setGateOffset', 'moveScreen', 'movePlatform', 'setFan', 'anchorStand', 'loadBall']);

export function dispatchF103(w: F103World, cmd: F103Command): F103DispatchResult {
  if (!cmd || typeof cmd !== 'object') return { ok: false, code: 'UNKNOWN' };
  if (w.safety.stoppedByTeacher && cmd.type !== 'teacherStop') return { ok: false, code: 'TEACHER_STOP' };
  if (!w.ppe && !BEFORE_PPE.has(cmd.type)) return { ok: false, code: 'PPE' };
  if (w.safety.block && !DURING_BLOCK.has(cmd.type)) return { ok: false, code: 'BLOCKED' };
  // Trabajo externo: lo que el gesto cambia en (energía mecánica + disipada). Las conversiones internas (resorte →
  // esfera + pérdidas) dejan esa suma igual; cargar el resorte o subir la esfera hasta la boca no.
  const S0 = mechanicalEnergyJ(w) + w.energy.dissipatedJ;
  const before = w.configVersion;
  const res = route(w, cmd);
  w.energy.externalJ += mechanicalEnergyJ(w) + w.energy.dissipatedJ - S0;
  if (res.ok && CONFIG.has(cmd.type)) {
    if (w.configVersion === before) w.configVersion++;
    const f = w.flight;
    if (f && !f.done) {
      if (cmd.type === 'setFan') f.windChanged = true;
      else f.configChanged = true;
    }
  }
  return res;
}

function route(w: F103World, cmd: F103Command): F103DispatchResult {
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
    // A
    case 'anchorStand':
      w.stand.anchored = !!cmd.on;
      if (cmd.on) {
        rearmErrF3(w, 'E01');
        rearmErrF3(w, 'E28');
        flagF3(w, 'anchored');
      }
      emitF3(w, cmd.on ? 'STAND_ANCHORED' : 'STAND_FREED', 'INFO');
      return { ok: true };
    case 'setStandHeight':
      w.stand.heightCm = Math.round(clamp(cmd.cm, GEOF103.stand.minCm, GEOF103.stand.maxCm) * 100) / 100;
      w.stand.touchedS = w.timeS;
      w.launcher.touchedS = w.timeS;
      return { ok: true, value: w.stand.heightCm };
    case 'turnLevelScrew':
      w.stand.tiltDeg = Math.round(clamp(w.stand.tiltDeg + clamp(cmd.turns, -40, 40) * 0.1, -5, 5) * 1000) / 1000;
      w.stand.touchedS = w.timeS;
      w.launcher.touchedS = w.timeS;
      return { ok: true, value: w.stand.tiltDeg };
    case 'readLevel':
      return readLevel(w);
    case 'readHeight':
      return readHeight(w, cmd.mark === 'deck' ? 'deck' : 'muzzle', num(cmd.viewDeg));
    case 'dropPlumb': {
      const m = muzzleF3(w);
      w.plumbMark = { x: m.x, y: m.y };
      flagF3(w, 'plumbDropped');
      emitF3(w, 'PLUMB_MARKED', 'INFO');
      return { ok: true };
    }
    case 'alignTape':
      if (!w.plumbMark) return { ok: false, code: 'NO_PLUMB' };
      w.tapeZeroX = w.plumbMark.x;
      if (Math.abs(w.tapeZeroX - w.launcher.x) <= 0.003) {
        rearmErrF3(w, 'E18');
        flagF3(w, 'tapeAligned');
      }
      emitF3(w, 'TAPE_ALIGNED', 'INFO');
      return { ok: true };
    case 'readTape':
      return readTape(w, cmd.target, cmd.mark === 'base' ? 'base' : 'index', num(cmd.viewDeg));
    // B
    case 'setAngle':
      return setAngle(w, cmd.deg);
    case 'setYaw':
      if (w.stand.anchored) return { ok: false, code: 'ANCHORED' };
      w.launcher.yawDeg = Math.round(clamp(cmd.deg, -10, 10) * 100) / 100;
      if (Math.abs(w.launcher.yawDeg) <= 1) rearmErrF3(w, 'E19');
      return { ok: true };
    case 'zeroProtractor': {
      const l = w.launcher;
      if (l.angleDeg > 2) return { ok: false, code: 'NOT_HORIZONTAL' };
      // Con el nivel sobre el cañón horizontal, el dial pasa a indicar la elevación real con este deck.
      l.protractorOffsetDeg = w.stand.tiltDeg;
      l.levelRefDeg = w.stand.tiltDeg;
      l.zeroed = true;
      rearmErrF3(w, 'E21');
      rearmErrF3(w, 'E26');
      flagF3(w, 'protractorZeroed');
      emitF3(w, 'PROTRACTOR_ZEROED', 'INFO');
      return { ok: true };
    }
    case 'readProtractor':
      return readProtractor(w, num(cmd.viewDeg));
    case 'setCap':
      if (!cmd.on && ballFlying(w)) return { ok: false, code: 'BUSY' };
      w.launcher.capOn = !!cmd.on;
      return { ok: true };
    case 'loadBall':
      return loadBall(w, String(cmd.ball));
    case 'unloadBall':
      return unloadBall(w);
    case 'cock':
      return cock(w, cmd.notch);
    case 'mountGate':
      w.gate.mounted = !!cmd.on;
      if (cmd.on) flagF3(w, 'gateMounted');
      return { ok: true };
    case 'setGateOffset':
      w.gate.offsetMm = Math.round(clamp(cmd.mm, -15, 15) * 10) / 10;
      if (Math.abs(w.gate.offsetMm) <= 2) rearmErrF3(w, 'E02');
      return { ok: true };
    case 'connect':
      if (cmd.target !== 'gate' && cmd.target !== 'platform') return { ok: false, code: 'UNKNOWN' };
      w[cmd.target].connected = !!cmd.on;
      if (cmd.on) {
        flagF3(w, `connected:${cmd.target}`);
        if (w.gate.connected && w.platform.connected) rearmErrF3(w, 'E23');
      }
      return { ok: true };
    case 'setTimerRate': {
      const hz = w.params.gate.rates.find((r) => r === cmd.hz);
      if (!hz) return { ok: false, code: 'BAD_RATE' };
      w.timer.rateHz = hz;
      if (hz >= 10000) rearmErrF3(w, 'E24');
      return { ok: true };
    }
    case 'setClockRange':
      w.timer.range = cmd.range === 'long' ? 'long' : 'short';
      if (cmd.range === 'long') rearmErrF3(w, 'E22');
      return { ok: true };
    case 'closeBarrier':
      w.barrierClosed = !!cmd.on;
      if (cmd.on) {
        rearmErrF3(w, 'E08');
        flagF3(w, 'barrierClosed');
      }
      return { ok: true };
    case 'fire':
      return fire(w);
    case 'readGate':
      return readGate(w);
    // C/D
    case 'moveScreen':
      return moveScreen(w, cmd.xCm, !!cmd.inLane);
    case 'clearScreen':
      w.screen.marks = [];
      return { ok: true };
    case 'readScreen':
      return readScreen(w, num(cmd.viewDeg));
    case 'movePlatform':
      return movePlatform(w, cmd.xCm, cmd.yCm);
    case 'calibratePlatform':
      w.platform.calibrated = true;
      rearmErrF3(w, 'E27');
      flagF3(w, 'platformCalibrated');
      emitF3(w, 'PLATFORM_CALIBRATED', 'INFO');
      return { ok: true };
    case 'readImpact':
      return readImpact(w);
    case 'collectBall':
      return collectBall(w, String(cmd.ball));
    // E
    case 'setFan': {
      const sp = Math.round(clamp(cmd.speed, 0, w.params.fanMs.length - 1));
      w.fan.speed = sp;
      if (cmd.dir === 'side' || cmd.dir === 'head' || cmd.dir === 'tail') w.fan.dir = cmd.dir;
      emitF3(w, sp ? 'FAN_ON' : 'FAN_OFF', 'INFO', { v: w.params.fanMs[sp] ?? 0 });
      return { ok: true };
    }
    // Cierre
    case 'closeStation':
      return closeStation(w);
    case 'acknowledge':
      return acknowledge(w);
    case 'teacherStop':
      w.safety.stoppedByTeacher = !!cmd.on;
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

function startWork(w: F103World): F103DispatchResult {
  const missing = (Object.keys(PPE_ERR) as PpeItem[]).filter((k) => !w.safety.ppe[k]);
  if (missing.length) {
    for (const k of missing) {
      bumpF3(w, `err:${PPE_ERR[k][0]}`);
      emitF3(w, PPE_ERR[k][1], 'CRITICAL');
    }
    return { ok: false, code: 'PPE_MISSING' };
  }
  w.ppe = true;
  flagF3(w, 'ppe');
  emitF3(w, 'PPE_OK', 'INFO');
  return { ok: true };
}

function inspect(w: F103World, target: string): F103DispatchResult {
  if (!w.objects[target]) return { ok: false, code: 'NO_OBJECT' };
  flagF3(w, `inspected:${target}`);
  const p = w.params;
  switch (target) {
    case 'launcher01':
      emitF3(w, 'INSPECT_LAUNCHER', 'INFO', { res: p.protractorResolutionDeg, k: Math.round(p.springK) });
      break;
    case 'stand01':
      emitF3(w, 'INSPECT_STAND', w.stand.anchored ? 'INFO' : 'WARN');
      break;
    case 'gate01':
      emitF3(w, 'INSPECT_GATE', Math.abs(w.gate.offsetMm) > 2 ? 'WARN' : 'INFO', { mm: Math.abs(w.gate.offsetMm) });
      break;
    case 'timer01':
      emitF3(w, 'INSPECT_TIMER', 'INFO', { hz: w.timer.rateHz });
      break;
    case 'platform01':
      emitF3(w, 'INSPECT_PLATFORM', w.platform.calibrated ? 'INFO' : 'WARN', { res: p.platform.gridResolutionCm });
      break;
    case 'screen01':
      emitF3(w, 'INSPECT_SCREEN', 'INFO', { res: p.screenResolutionCm });
      break;
    case 'floorTape01':
      emitF3(w, 'INSPECT_TAPE', 'INFO', { res: p.tapeResolutionCm });
      break;
    case 'heightRuler01':
      emitF3(w, 'INSPECT_RULER', 'INFO', { res: p.rulerResolutionCm });
      break;
    case 'fan01':
      emitF3(w, 'INSPECT_FAN', 'INFO');
      break;
    default: {
      const b = w.balls[target];
      if (b) emitF3(w, 'INSPECT_BALL', b.damaged ? 'WARN' : 'INFO', { g: b.nominalG, cm: b.nominalCm });
      else emitF3(w, 'INSPECTED', 'INFO', { target });
    }
  }
  return { ok: true };
}

/** Lugares donde una esfera puede quedar al soltarla (el resto se rechaza: no hay apoyo allí). */
const SUPPORTS = new Set(['floor', 'tray', 'hand', 'bench']);

function setPose(w: F103World, id: string, pose: Pose, support?: string): F103DispatchResult {
  const o = w.objects[id];
  if (!o) return { ok: false, code: 'NO_OBJECT' };
  if (!o.movable) return { ok: false, code: 'FIXED' };
  if (!pose || ![pose.x, pose.y, pose.z].every((v) => Number.isFinite(v))) return { ok: false, code: 'BAD_POSE' };
  if (support && support !== o.support) {
    if (!SUPPORTS.has(support)) return { ok: false, code: 'NO_SEAT' };
    if (o.support === 'air') return { ok: false, code: 'FLYING' };
    if (o.support === 'launcher') return { ok: false, code: 'USE_UNLOAD' };
  }
  if (o.support === 'air') return { ok: false, code: 'FLYING' };
  o.pose = { x: pose.x, y: pose.y, z: pose.z, rotationRad: num(pose.rotationRad) };
  if (support) o.support = support;
  return { ok: true };
}

// ─────────────────────────── Lecturas ───────────────────────────

function addReading(w: F103World, r: Omit<ReadingF3, 'id' | 't' | 'tick' | 'trialId' | 'configVersion'> & { configVersion?: number; shot?: number }): ReadingF3 {
  const n = w.readingOrder.length + 1;
  const prefix = { angle: 'a', level: 'n', length: 'L', height: 'h', gate: 'g', impact: 'i', mark: 'm' }[r.kind];
  const trial = r.shot ?? w.trial;
  const reading: ReadingF3 = { ...r, configVersion: r.configVersion ?? w.configVersion, id: `${prefix}${n}`, trialId: `T${trial}`, t: w.timeS, tick: w.tick };
  if (!Number.isFinite(reading.value)) reading.valid = false;
  if (!Number.isFinite(reading.trueValue)) reading.trueValue = 0;
  if (reading.impact && !Number.isFinite(reading.impact.tFlight)) reading.impact.tFlight = -1;
  w.readings[reading.id] = reading;
  w.readingOrder.push(reading.id);
  return reading;
}

const quant = (x: number, res: number) => {
  const dec = Math.max(0, Math.ceil(-Math.log10(res) - 1e-9));
  return Number((Math.round(x / res) * res).toFixed(dec));
};

function readLevel(w: F103World): F103DispatchResult {
  const p = w.params;
  const settling = w.timeS - w.stand.touchedS < 1.5;
  const flags: string[] = [];
  const wobble = settling ? gaussF3(w) * 0.3 : 0;
  if (settling) {
    flags.push('UNSTABLE');
    errF3(w, 'E30', 'READ_BEFORE_STABLE', 'WARN', { inst: 'stand01' });
  }
  const value = quant(w.stand.tiltDeg + wobble, p.levelResolutionDeg);
  const r = addReading(w, { kind: 'level', instrumentId: 'stand01', value, unit: '°', resolution: p.levelResolutionDeg, uncertainty: p.uB.levelDeg, sourceObjectIds: ['stand01'], qualityFlags: flags, trueValue: w.stand.tiltDeg, target: 'stand' });
  if (!settling) {
    flagF3(w, 'levelRead');
    if (Math.abs(w.stand.tiltDeg) <= 0.15) flagF3(w, 'standLevel');
  }
  emitF3(w, 'LEVEL_READ', 'INFO', { deg: value });
  return { ok: true, id: r.id, value };
}

function readHeight(w: F103World, mark: 'muzzle' | 'deck', viewDeg: number): F103DispatchResult {
  const p = w.params;
  const res = p.rulerResolutionCm;
  const m = muzzleF3(w);
  const trueCm = mark === 'deck' ? w.stand.heightCm : m.z * 100;
  let shown = trueCm;
  const flags: string[] = [];
  if (mark === 'deck') {
    flags.push('DECK');
    errF3(w, 'E06', 'MEASURED_FROM_BASE', 'WARN');
  }
  if (Math.abs(viewDeg) > 20) {
    shown += Math.sign(viewDeg) * 2 * res;
    flags.push('PARALLAX');
    errF3(w, 'E29', 'SCALE_PARALLAX', 'WARN', { inst: 'heightRuler01' });
  }
  const value = quant(shown, res);
  const r = addReading(w, { kind: 'height', instrumentId: 'heightRuler01', value, unit: 'cm', resolution: res, uncertainty: p.uB.rulerCm, sourceObjectIds: ['launcher01', 'stand01'], qualityFlags: flags, trueValue: m.z * 100, target: mark, setup: { standCm: w.stand.heightCm } });
  if (!flags.length) flagF3(w, 'heightRead');
  emitF3(w, 'LENGTH_READ', 'INFO', { cm: value });
  return { ok: true, id: r.id, value };
}

/** Posición real (m) de lo que se lee en la cinta del suelo. */
function tapeTargetX(w: F103World, target: TapeTarget, mark: 'index' | 'base'): number | null {
  if (target === 'plumb') {
    if (mark === 'base') return w.launcher.x + 0.06; // pata delantera del soporte, 6 cm por delante de la boca
    return w.plumbMark ? w.plumbMark.x : null;
  }
  if (target === 'platform') return w.platform.x - GEOF103.platform.size / 200;
  if (target === 'screen') return w.screen.inLane ? w.screen.x : null;
  return null;
}

function readTape(w: F103World, target: TapeTarget, mark: 'index' | 'base', viewDeg: number): F103DispatchResult {
  const p = w.params;
  const res = p.tapeResolutionCm;
  const x = tapeTargetX(w, target, mark);
  if (x === null) return { ok: false, code: target === 'plumb' ? 'NO_PLUMB' : 'NOT_IN_LANE' };
  const trueCm = (x - w.tapeZeroX) * 100;
  let shown = trueCm;
  const flags: string[] = [];
  if (mark === 'base') {
    flags.push('BASE');
    errF3(w, 'E06', 'MEASURED_FROM_BASE', 'WARN');
  }
  // El cero de la cinta no está bajo la boca (sin plomada, o el soporte se movió después): las distancias se corren.
  if (Math.abs(w.tapeZeroX - w.launcher.x) > 0.003) {
    flags.push('UNALIGNED');
    if (target !== 'plumb') errF3(w, 'E18', 'TAPE_NOT_ALIGNED', 'WARN', { cm: Math.round(Math.abs(w.tapeZeroX - w.launcher.x) * 1000) / 10 });
  }
  if (Math.abs(viewDeg) > 20) {
    shown += Math.sign(viewDeg) * 2 * res;
    flags.push('PARALLAX');
    errF3(w, 'E29', 'SCALE_PARALLAX', 'WARN', { inst: 'floorTape01' });
  }
  const value = quant(shown, res);
  const r = addReading(w, {
    kind: 'length', instrumentId: 'floorTape01', value, unit: 'cm', resolution: res, uncertainty: p.uB.tapeCm, sourceObjectIds: [target === 'plumb' ? 'plumb01' : `${target}01`],
    qualityFlags: flags, trueValue: (x - w.launcher.x) * 100, target, setup: { posCm: Math.round(x * 1e4) / 100 },
  });
  if (!flags.length) flagF3(w, `tape:${target}`);
  emitF3(w, 'LENGTH_READ', 'INFO', { cm: value });
  return { ok: true, id: r.id, value };
}

function readProtractor(w: F103World, viewDeg: number): F103DispatchResult {
  const p = w.params;
  const l = w.launcher;
  const res = p.protractorResolutionDeg;
  const flags: string[] = [];
  const settling = w.timeS - l.touchedS < 1.5;
  const wobble = settling ? gaussF3(w) * 1.2 : 0;
  let shown = l.angleDeg + l.protractorOffsetDeg + wobble;
  if (settling) {
    flags.push('UNSTABLE');
    errF3(w, 'E30', 'READ_BEFORE_STABLE', 'WARN', { inst: 'launcher01' });
  }
  if (!l.zeroed && Math.abs(l.protractorOffsetDeg) > 0.2) {
    flags.push('NOT_ZEROED');
    errF3(w, 'E21', 'INSTRUMENT_ZERO_SKIPPED', 'WARN', { inst: 'launcher01' });
  }
  if (Math.abs(tiltErrorF3(w)) > 0.3) {
    flags.push('TILTED');
    errF3(w, 'E26', 'INSTRUMENT_TILTED', 'WARN', { deg: Math.round(Math.abs(tiltErrorF3(w)) * 10) / 10 });
  }
  if (Math.abs(viewDeg) > 20) {
    shown += Math.sign(viewDeg) * 2 * res;
    flags.push('PARALLAX');
    errF3(w, 'E29', 'SCALE_PARALLAX', 'WARN', { inst: 'launcher01' });
  }
  const value = quant(shown, res);
  const r = addReading(w, {
    kind: 'angle', instrumentId: 'launcher01', value, unit: '°', resolution: res, uncertainty: p.uB.protractorDeg, sourceObjectIds: ['launcher01'], qualityFlags: flags,
    trueValue: elevationF3(w), target: 'launcher', setup: { angleDeg: l.angleDeg, standCm: w.stand.heightCm },
  });
  if (!flags.length) flagF3(w, 'angleRead');
  emitF3(w, 'ANGLE_READ', 'INFO', { deg: value });
  return { ok: true, id: r.id, value };
}

// ─────────────────────────── B — ángulo, resorte, carga ───────────────────────────

function setAngle(w: F103World, deg: number): F103DispatchResult {
  const l = w.launcher;
  const to = Math.round(clamp(deg, 0, 85) * 100) / 100;
  const d = to - l.angleDeg;
  l.angleDeg = to;
  l.touchedS = w.timeS;
  // Sin anclar, el par del mando hace rodar el soporte: la boca se corre, gira y el deck se inclina.
  if (!w.stand.anchored && Math.abs(d) > 0.5) {
    l.x = Math.round((l.x - 0.0005 * Math.abs(d)) * 1e5) / 1e5;
    l.yawDeg = Math.round(clamp(l.yawDeg + 0.03 * d, -10, 10) * 1000) / 1000;
    w.stand.tiltDeg = Math.round(clamp(w.stand.tiltDeg + 0.01 * d, -5, 5) * 1000) / 1000;
    w.stand.touchedS = w.timeS;
    errF3(w, 'E01', 'ANGLE_CHANGED_UNANCHORED', 'WARN', { cm: Math.round(0.05 * Math.abs(d) * 10) / 10 });
  }
  return { ok: true, value: to };
}

function loadBall(w: F103World, ball: string): F103DispatchResult {
  const l = w.launcher;
  const o = w.objects[ball];
  if (!o || !w.balls[ball]) return { ok: false, code: 'NO_BALL' };
  if (l.capOn) return { ok: false, code: 'CAP_ON' };
  if (l.loaded) return { ok: false, code: 'LOADED' };
  if (l.notch > 0) return { ok: false, code: 'COCKED' };
  if (o.support === 'air') return { ok: false, code: 'FLYING' };
  if (o.support === 'floor') return { ok: false, code: 'COLLECT_FIRST' };
  l.loaded = ball;
  o.support = 'launcher';
  return { ok: true };
}

function unloadBall(w: F103World): F103DispatchResult {
  const l = w.launcher;
  if (!l.loaded) return { ok: false, code: 'EMPTY' };
  const ball = l.loaded;
  if (l.notch > 0) {
    // Sacar la esfera de un resorte cargado: el émbolo se dispara al soltar el seguro y la esfera cae a los pies.
    w.energy.dissipatedJ += springEnergyJ(w);
    l.notch = 0;
    l.loaded = null;
    const m = muzzleF3(w);
    w.objects[ball].support = 'floor';
    w.objects[ball].pose = { x: m.x * 100 + 8, y: m.y * 100 - 6, z: FLOOR_Z, rotationRad: 0 };
    errF3(w, 'E40', 'UNSAFE_DISASSEMBLY', 'CRITICAL', { what: 'launcher01' });
    w.safety.block = { code: 'SPRING_RELEASE', since: w.timeS };
    return { ok: true };
  }
  l.loaded = null;
  w.objects[ball].support = 'tray';
  w.objects[ball].pose = trayPose(w, ball);
  return { ok: true };
}

function cock(w: F103World, notch: number): F103DispatchResult {
  const l = w.launcher;
  const n = Math.round(clamp(notch, 0, w.params.notchM.length - 1));
  if (l.capOn) return { ok: false, code: 'CAP_ON' };
  if (ballFlying(w)) return { ok: false, code: 'BUSY' };
  if (n < l.notch) {
    // Descargar con la baqueta (retenida con la mano): solo sin esfera.
    if (l.loaded) return { ok: false, code: 'UNLOAD_BY_FIRING' };
    w.energy.dissipatedJ += springEnergyJ(w);
    l.notch = 0;
    return { ok: true, value: 0 };
  }
  l.notch = n;
  return { ok: true, value: n };
}

export function trayPose(w: F103World, ball: string): Pose {
  const i = Math.max(0, BALLS_F3.indexOf(ball as never));
  const m = muzzleF3(w);
  const T = GEOF103.tray;
  return { x: m.x * 100 - 40 + (i % 5) * 3.6 - T.w / 2 + 3, y: m.y * 100 + 14, z: FLOOR_Z + w.stand.heightCm + 0.6, rotationRad: 0 };
}

function collectBall(w: F103World, ball: string): F103DispatchResult {
  const o = w.objects[ball];
  if (!o || !w.balls[ball]) return { ok: false, code: 'NO_BALL' };
  if (o.support === 'air') return { ok: false, code: 'FLYING' };
  if (o.support === 'launcher') return { ok: false, code: 'USE_UNLOAD' };
  o.support = 'tray';
  o.pose = trayPose(w, ball);
  return { ok: true };
}

// ─────────────────────────── Disparo ───────────────────────────

function shotSetup(w: F103World, ball: string): ShotSetup {
  const wind = windF3(w);
  const m = muzzleF3(w);
  return {
    notch: w.launcher.notch, angleDeg: w.launcher.angleDeg, standCm: w.stand.heightCm, ball, ballCm: w.balls[ball]?.nominalCm ?? 0,
    windMs: Math.round(Math.hypot(wind.x, wind.y) * 100) / 100, windDir: w.fan.dir, yawDeg: w.launcher.yawDeg,
    screenCm: w.screen.inLane ? Math.round((w.screen.x - m.x) * 1000) / 10 : null,
  };
}

function fire(w: F103World): F103DispatchResult {
  const l = w.launcher;
  const p = w.params;
  if (l.notch <= 0) return { ok: false, code: 'NOT_COCKED' };
  if (l.capOn) return { ok: false, code: 'CAP_ON' };
  if (ballFlying(w)) return { ok: false, code: 'BUSY' };
  if (!w.barrierClosed) {
    // Enclavamiento: con la zona de lanzamiento abierta el disparador no libera el resorte y el ensayo se suspende.
    errF3(w, 'E08', 'ZONE_OPEN', 'ALERT');
    w.safety.block = { code: 'ZONE_OPEN', since: w.timeS };
    return { ok: false, code: 'ZONE_OPEN' };
  }
  const Es = springEnergyJ(w);
  const setupNotch = l.notch;
  const ball = l.loaded;
  l.notch = 0;
  if (!ball) {
    // Disparo en vacío: el émbolo descarga toda la energía contra su tope.
    w.energy.dissipatedJ += Es;
    errF3(w, 'E03', 'DRY_FIRE', 'WARN');
    return { ok: true };
  }
  const b = w.balls[ball];
  const realistic = p.scientificMode === 'REALISTIC';
  const jit = realistic ? gaussF3(w) * p.shotJitter : 0;
  // Energía útil: rendimiento del resorte y dispersión de la compresión en cada disparo.
  const Eu = Es * (realistic ? p.springEfficiency : 1) * (1 + 2 * jit);
  const mm = b.massKg + p.pistonKg;
  const anchored = w.stand.anchored;
  // Esfera y émbolo salen juntos; sin anclar, el soporte retrocede con el impulso opuesto (se conserva el momento).
  const v0 = Math.sqrt((2 * Eu) / (mm * (anchored ? 1 : 1 + mm / p.standKg)));
  const elev = elevationF3(w) * DEG;
  const yaw = l.yawDeg * DEG;
  const m0 = muzzleF3(w);
  const shot = w.trial;
  w.trial++;
  w.shots++;
  const setup = { ...shotSetup(w, ball), notch: setupNotch };
  if (!anchored) {
    const P = mm * v0 * Math.cos(elev);
    const V = P / p.standKg;
    const d = (V * V) / (2 * p.standFloorMu * p.g);
    l.x = Math.round((l.x - d * Math.cos(yaw)) * 1e6) / 1e6;
    l.y = Math.round((l.y - d * Math.sin(yaw)) * 1e6) / 1e6;
    w.recoil.impulse += P;
    w.recoil.shots++;
    errF3(w, 'E28', 'SUPPORT_LOOSE', 'WARN', { mm: Math.round(d * 10000) / 10 });
  }
  // Todo lo que no es energía cinética de la esfera se pierde: rendimiento, tope del émbolo y retroceso frenado.
  w.energy.dissipatedJ += Es - 0.5 * b.massKg * v0 * v0;
  const r = b.diameterM / 2;
  const f: Flight = {
    ball, shot, x: m0.x, y: m0.y, z: m0.z, vx: v0 * Math.cos(elev) * Math.cos(yaw), vy: v0 * Math.cos(elev) * Math.sin(yaw), vz: v0 * Math.sin(elev),
    massKg: b.massKg, radius: r, area: Math.PI * r * r, launchedS: w.timeS, v0, gateIn: null, gateOut: null, chord: 0, contacts: [], peakZ: m0.z, done: false,
    windChanged: false, configChanged: false, dragFrac: 0,
  };
  // Fotopuerta en la boca: la cuerda real que corta el haz (esfera abollada: la cara plana acorta la cuerda).
  const gateOn = w.gate.mounted && w.gate.connected;
  let gateMissed = false;
  let gateDt: number | null = null;
  let gateUsable = false;
  if (w.gate.mounted) {
    const rEff = r * (b.damaged ? 0.94 : 1);
    const c = gateCrossing(w.timeS, v0, p.g * Math.sin(elev), GEOF103.launcher.gateDz / 100, rEff, w.gate.offsetMm / 1000);
    f.chord = c.chord;
    if (c.tIn === null || c.tOut === null) gateMissed = true;
    else {
      f.gateIn = c.tIn;
      f.gateOut = c.tOut;
      if (gateOn) {
        gateDt = c.tOut - c.tIn;
        gateUsable = true;
      }
    }
  }
  w.flight = f;
  w.objects[ball].support = 'air';
  l.loaded = null;
  const settled = w.timeS - w.platform.movedS >= p.platform.settleS;
  w.lastShot = {
    shot, ball, launchedS: w.timeS, gateDt, gateMissed, gateUsable, platformContact: null, platformIndex: -1, firstOn: null,
    platformAt: { x: w.platform.x, y: w.platform.y, settled, calibrated: w.platform.calibrated, connected: w.platform.connected },
    setup, configVersion: w.configVersion, unanchored: !anchored, tilted: Math.abs(tiltErrorF3(w)) > 0.3, damaged: b.damaged,
    windChanged: false, configChanged: false, landed: false, readGate: false, readImpact: false,
  };
  if (w.platform.connected && !settled) errF3(w, 'E17', 'PLATFORM_UNSETTLED', 'WARN');
  emitF3(w, 'LAUNCHED', 'INFO', { v: Math.round(v0 * 100) / 100 });
  return { ok: true, value: shot };
}

function readGate(w: F103World): F103DispatchResult {
  const s = w.lastShot;
  const p = w.params;
  if (!s) return { ok: false, code: 'NO_SHOT' };
  if (!w.gate.mounted && s.gateDt === null && !s.gateMissed) return { ok: false, code: 'NOT_MOUNTED' };
  if (!w.gate.connected || (!s.gateUsable && !s.gateMissed)) {
    errF3(w, 'E23', 'SENSOR_NOT_CONNECTED', 'WARN', { inst: 'gate01' });
    return { ok: false, code: 'NO_SIGNAL' };
  }
  const flags: string[] = [];
  let value = NaN;
  let trueDt = NaN;
  if (s.gateMissed) {
    flags.push('MISSED');
    errF3(w, 'E02', 'GATE_MISSED', 'WARN', { mm: Math.abs(w.gate.offsetMm) });
  } else if (s.gateDt !== null) {
    trueDt = s.gateDt;
    const jitter = p.scientificMode === 'REALISTIC' ? gaussF3(w) * 2e-6 : 0;
    value = sampledInterval(s.gateDt, w.timer.rateHz, jitter);
    const f = w.flight && w.flight.shot === s.shot ? w.flight : null;
    const d = w.balls[s.ball]?.diameterM ?? 0.025;
    if (f && f.chord < d * 0.995) {
      flags.push('EDGE');
      errF3(w, 'E02', 'GATE_EDGE', 'WARN', { mm: Math.abs(w.gate.offsetMm) });
    }
    if (!resolvedAt(s.gateDt, w.timer.rateHz, p.gate)) {
      flags.push('LOW_RATE');
      errF3(w, 'E24', 'SAMPLING_TOO_LOW', 'WARN', { hz: w.timer.rateHz });
    }
  }
  if (s.unanchored) flags.push('UNANCHORED');
  if (s.damaged) {
    flags.push('POST_IMPACT');
    errF3(w, 'E39', 'DATA_AFTER_DAMAGE', 'ALERT');
  }
  s.readGate = true;
  const r = addReading(w, {
    kind: 'gate', instrumentId: 'gate01', value, unit: 's', resolution: 1 / w.timer.rateHz, uncertainty: Math.max(p.uB.gateS, 1 / w.timer.rateHz / Math.sqrt(3)),
    sourceObjectIds: ['gate01', s.ball], qualityFlags: flags, trueValue: trueDt, target: 'gate', setup: { ...s.setup }, shot: s.shot, configVersion: s.configVersion,
  });
  emitF3(w, 'GATE_READ', 'INFO', { s: Number.isFinite(value) ? value : 0 });
  return { ok: true, id: r.id, value };
}

function readImpact(w: F103World): F103DispatchResult {
  const s = w.lastShot;
  const p = w.params;
  if (!s) return { ok: false, code: 'NO_SHOT' };
  if (!s.landed) return { ok: false, code: 'RUNNING' };
  if (!s.platformAt.connected) {
    errF3(w, 'E23', 'SENSOR_NOT_CONNECTED', 'WARN', { inst: 'platform01' });
    return { ok: false, code: 'NO_SIGNAL' };
  }
  const flags: string[] = [];
  const c = s.platformContact;
  const common = { instrumentId: 'platform01', unit: 'cm' as const, resolution: p.platform.gridResolutionCm, uncertainty: p.uB.platformCm, sourceObjectIds: ['platform01', s.ball], target: 'platform', shot: s.shot, configVersion: s.configVersion };
  const setup = { ...s.setup, posCm: Math.round((s.platformAt.x - p.platform.sizeM / 2) * 1e4) / 100 };
  if (!c) {
    if (s.firstOn === 'screen' || s.firstOn === 'backstop') {
      flags.push('OCCLUDED');
      errF3(w, 'E25', 'LINE_OF_SIGHT_BLOCKED', 'WARN');
    } else flags.push('MISSED_PLATFORM');
    const r = addReading(w, { ...common, kind: 'impact', value: NaN, qualityFlags: flags, trueValue: NaN, setup, impact: { xCm: NaN, yCm: NaN, tFlight: NaN, index: -1 } });
    emitF3(w, 'IMPACT_NONE', 'WARN');
    return { ok: true, id: r.id, value: NaN };
  }
  if (s.platformIndex > 0) flags.push('BOUNCE');
  let noise = 0;
  if (!s.platformAt.settled) {
    flags.push('UNSETTLED');
    noise = gaussF3(w) * 1.0;
  }
  const scale = s.platformAt.calibrated ? 1 : p.platform.uncalScale;
  if (!s.platformAt.calibrated) {
    flags.push('UNCALIBRATED');
    errF3(w, 'E27', 'SENSOR_UNCALIBRATED', 'WARN');
  }
  const ind = platformIndication(c.x, c.y, s.platformAt.x, s.platformAt.y, scale, p.platform, noise);
  const tTrue = s.gateUsable && w.flight && w.flight.gateIn !== null && w.flight.shot === s.shot ? c.t - w.flight.gateIn : NaN;
  let tShown = NaN;
  if (Number.isFinite(tTrue)) {
    const ck = clockIndication(tTrue, w.timer.range, p.platform);
    tShown = ck.s;
    if (ck.clipped) {
      flags.push('CLIPPED');
      errF3(w, 'E22', 'SENSOR_CLIPPED', 'WARN', { s: p.platform.ranges[w.timer.range].maxS });
    }
  } else flags.push('NO_TIME');
  if (Math.abs(ind.yCm) > 3) {
    flags.push('LATERAL');
    if (Math.abs(s.setup.yawDeg) > 1) errF3(w, 'E19', 'LAUNCHER_YAWED', 'WARN', { deg: Math.round(Math.abs(s.setup.yawDeg) * 10) / 10 });
  }
  if (s.tilted) flags.push('TILTED');
  if (s.unanchored) flags.push('UNANCHORED');
  if (s.windChanged) {
    flags.push('WIND_CHANGED');
    errF3(w, 'E16', 'WIND_CHANGED_MIDFLIGHT', 'WARN');
  }
  if (s.configChanged) {
    flags.push('CONFIG_CHANGED');
    errF3(w, 'E32', 'CONFIG_CHANGED_MIDRUN');
  }
  if (s.damaged) {
    flags.push('POST_IMPACT');
    errF3(w, 'E39', 'DATA_AFTER_DAMAGE', 'ALERT');
  }
  s.readImpact = true;
  const x0 = s.platformAt.x - p.platform.sizeM / 2;
  const r = addReading(w, { ...common, kind: 'impact', value: ind.xCm, qualityFlags: flags, trueValue: (c.x - x0) * 100, setup, impact: { xCm: ind.xCm, yCm: ind.yCm, tFlight: tShown, index: s.platformIndex } });
  emitF3(w, 'IMPACT_READ', 'INFO', { cm: ind.xCm });
  return { ok: true, id: r.id, value: ind.xCm };
}

// ─────────────────────────── C/D — pantalla y plataforma ───────────────────────────

const screenHitsPlatform = (sx: number, inLane: boolean, px: number, py: number) =>
  inLane && Math.abs(sx - px) < GEOF103.platform.size / 200 + GEOF103.screen.d / 200 + 0.01 && Math.abs(py - LANE_YC) < GEOF103.screen.w / 200 + GEOF103.platform.size / 200;

function moveScreen(w: F103World, xCm: number, inLane: boolean): F103DispatchResult {
  const s = w.screen;
  const x = clamp(num(xCm, s.x * 100) / 100, w.launcher.x + 0.3, BACKSTOP_X - 0.3);
  if (screenHitsPlatform(x, inLane, w.platform.x, w.platform.y)) return { ok: false, code: 'COLLISION' };
  s.x = Math.round(x * 1e4) / 1e4;
  if (inLane !== s.inLane) s.marks = [];
  s.inLane = inLane;
  return { ok: true };
}

function movePlatform(w: F103World, xCm: number, yCm: number): F103DispatchResult {
  const pl = w.platform;
  const half = GEOF103.platform.size / 200;
  const x = clamp(num(xCm, pl.x * 100) / 100, w.launcher.x + 0.25 + half, BACKSTOP_X - half - 0.05);
  const y = clamp(num(yCm, pl.y * 100) / 100, LANE_YC - L.halfW / 100 + half, LANE_YC + L.halfW / 100 - half);
  if (screenHitsPlatform(w.screen.x, w.screen.inLane, x, y)) return { ok: false, code: 'COLLISION' };
  if (Math.abs(x - pl.x) < 1e-6 && Math.abs(y - pl.y) < 1e-6) return { ok: true };
  pl.x = Math.round(x * 1e4) / 1e4;
  pl.y = Math.round(y * 1e4) / 1e4;
  pl.movedS = w.timeS;
  return { ok: true };
}

function readScreen(w: F103World, viewDeg: number): F103DispatchResult {
  const p = w.params;
  const s = w.screen;
  if (!s.inLane) return { ok: false, code: 'NOT_IN_LANE' };
  const mk = s.marks[s.marks.length - 1];
  if (!mk) return { ok: false, code: 'NO_MARK' };
  const res = p.screenResolutionCm;
  const flags: string[] = [];
  let shown = mk.z * 100;
  if (Math.abs(viewDeg) > 20) {
    shown += Math.sign(viewDeg) * 2 * res;
    flags.push('PARALLAX');
    errF3(w, 'E29', 'SCALE_PARALLAX', 'WARN', { inst: 'screen01' });
  }
  const shot = w.lastShot && w.lastShot.shot === mk.shot ? w.lastShot : null;
  if (shot?.configChanged) flags.push('CONFIG_CHANGED');
  if (shot?.windChanged) flags.push('WIND_CHANGED');
  if (shot?.unanchored) flags.push('UNANCHORED');
  if (shot?.damaged) flags.push('POST_IMPACT');
  const value = quant(shown, res);
  const r = addReading(w, {
    kind: 'mark', instrumentId: 'screen01', value, unit: 'cm', resolution: res, uncertainty: p.uB.screenCm, sourceObjectIds: ['screen01'], qualityFlags: flags, trueValue: mk.z * 100,
    target: 'screen', setup: { ...(shot?.setup ?? {}), posCm: Math.round(s.x * 1e4) / 100 }, shot: mk.shot, configVersion: shot?.configVersion,
  });
  emitF3(w, 'MARK_READ', 'INFO', { cm: value });
  return { ok: true, id: r.id, value };
}

// ─────────────────────────── Cierre y bloqueos ───────────────────────────

function closeStation(w: F103World): F103DispatchResult {
  const l = w.launcher;
  if (l.notch > 0) return { ok: false, code: 'SPRING_LOADED' };
  if (l.loaded) return { ok: false, code: 'BALL_LOADED' };
  if (ballFlying(w)) return { ok: false, code: 'BUSY' };
  if (!l.capOn) return { ok: false, code: 'CAP_OFF' };
  if (w.fan.speed > 0) return { ok: false, code: 'FAN_ON' };
  const out = BALLS_F3.filter((b) => !inTray(w, b));
  if (out.length) return { ok: false, code: 'BALLS_OUT' };
  flagF3(w, 'stationClosed');
  emitF3(w, 'STATION_CLOSED', 'INFO', { n: BALLS_F3.length });
  return { ok: true };
}

function acknowledge(w: F103World): F103DispatchResult {
  const b = w.safety.block;
  if (!b) return { ok: true };
  if (b.code === 'ZONE_OPEN' && !w.barrierClosed) return { ok: false, code: 'SECURE_FIRST' };
  if (b.code === 'SPRING_RELEASE' && (!w.launcher.capOn || w.launcher.notch > 0)) return { ok: false, code: 'SECURE_FIRST' };
  w.safety.block = null;
  emitF3(w, 'STATION_RESET', 'INFO', { code: b.code });
  return { ok: true };
}

// ─────────────────────────── Paso: vuelo con CCD ───────────────────────────

/** Primer instante τ ∈ [0, h] en que d(τ) = d0 + v τ + ½ a τ² llega a 0 desde d0 ≥ 0; null si no ocurre. */
export function firstRoot(d0: number, v: number, a: number, h: number): number | null {
  if (d0 <= 0) return v < 0 || (v === 0 && a < 0) ? 0 : null;
  if (Math.abs(a) < 1e-12) {
    if (v >= 0) return null;
    const t = -d0 / v;
    return t <= h ? t : null;
  }
  const disc = v * v - 2 * a * d0;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const roots = [(-v - s) / a, (-v + s) / a].filter((t) => t >= 0 && t <= h).sort((x, y) => x - y);
  return roots.length ? roots[0] : null;
}

function accel(w: F103World, vx: number, vy: number, vz: number, k: number, wind: { x: number; y: number }) {
  const rx = vx - wind.x;
  const ry = vy - wind.y;
  const rz = vz;
  const sp = Math.hypot(rx, ry, rz);
  return { ax: -k * sp * rx, ay: -k * sp * ry, az: -w.params.g - k * sp * rz, sp, rx, ry, rz };
}

function settleBall(w: F103World, f: Flight) {
  w.energy.dissipatedJ += flightEnergyJ(w);
  f.done = true;
  f.vx = 0;
  f.vy = 0;
  f.vz = 0;
  const o = w.objects[f.ball];
  o.support = 'floor';
  o.pose = { x: Math.round(f.x * 1e4) / 100, y: Math.round(f.y * 1e4) / 100, z: FLOOR_Z + Math.round((f.z - f.radius) * 1e4) / 100, rotationRad: 0 };
  const s = w.lastShot;
  if (s && s.shot === f.shot) {
    s.landed = true;
    s.windChanged = f.windChanged;
    s.configChanged = f.configChanged;
  }
  emitF3(w, 'BALL_RESTED', 'INFO');
}

function contact(w: F103World, f: Flight, on: Contact['on'], v: number) {
  const c: Contact = { t: Math.round(w.timeS * 1e6) / 1e6, x: f.x, y: f.y, z: f.z, on, v: Math.round(v * 1000) / 1000 };
  return c;
}

function stepFlight(w: F103World, dt: number) {
  const f = w.flight;
  if (!f || f.done) return;
  const p = w.params;
  const span = Math.min(dt, w.timeS - f.launchedS);
  if (span <= 0) return;
  const n = p.subSteps;
  const h = span / n;
  const k = dragOn(w) ? (0.5 * p.airDensity * p.sphereCd * f.area) / f.massKg : 0;
  const pl = w.platform;
  const sc = w.screen;
  const t0 = w.timeS - span;
  for (let i = 0; i < n && !f.done; i++) {
    let rem = h;
    let tCur = t0 + i * h;
    for (let guard = 0; guard < 6 && rem > 1e-12 && !f.done; guard++) {
      const wind = windF3(w);
      const a0 = accel(w, f.vx, f.vy, f.vz, k, wind);
      const am = accel(w, f.vx + a0.ax * rem * 0.5, f.vy + a0.ay * rem * 0.5, f.vz + a0.az * rem * 0.5, k, wind);
      const ax = am.ax;
      const ay = am.ay;
      const az = am.az;
      const r = f.radius;
      // Candidatos de contacto dentro de lo que queda del subpaso (CCD).
      type Ev = { t: number; on: Contact['on'] };
      const evs: Ev[] = [];
      const posAt = (t: number) => ({ x: f.x + f.vx * t + 0.5 * ax * t * t, y: f.y + f.vy * t + 0.5 * ay * t * t });
      const tPlat = firstRoot(f.z - (PLAT_H + r), f.vz, az, rem);
      if (tPlat !== null) {
        const q = posAt(tPlat);
        if (onPlatform(q.x, q.y, pl.x, pl.y, p.platform)) evs.push({ t: tPlat, on: 'platform' });
      }
      const tFloor = firstRoot(f.z - r, f.vz, az, rem);
      if (tFloor !== null) {
        const q = posAt(tFloor);
        if (!onPlatform(q.x, q.y, pl.x, pl.y, p.platform)) evs.push({ t: tFloor, on: 'floor' });
      }
      if (sc.inLane && f.x < sc.x - r + 1e-9) {
        const tS = firstRoot(sc.x - r - f.x, -f.vx, -ax, rem);
        if (tS !== null) {
          const zAt = f.z + f.vz * tS + 0.5 * az * tS * tS;
          const q = posAt(tS);
          if (zAt < SCREEN_H && zAt > r && Math.abs(q.y - LANE_YC) < GEOF103.screen.w / 200) evs.push({ t: tS, on: 'screen' });
        }
      }
      if (f.x < BACKSTOP_X - r + 1e-9) {
        const tB = firstRoot(BACKSTOP_X - r - f.x, -f.vx, -ax, rem);
        if (tB !== null) evs.push({ t: tB, on: 'backstop' });
      }
      evs.sort((a, b) => a.t - b.t);
      const ev = evs[0];
      const tau = ev ? ev.t : rem;
      // Avance hasta el evento (o el final del subpaso) con la aceleración del punto medio.
      const vmx = f.vx + 0.5 * ax * tau;
      const vmy = f.vy + 0.5 * ay * tau;
      const vmz = f.vz + 0.5 * az * tau;
      const rel = Math.hypot(vmx - wind.x, vmy - wind.y, vmz);
      // Trabajo del aire sobre la esfera (el viento a favor puede entregar energía: entra como disipación negativa).
      w.energy.dissipatedJ += f.massKg * k * rel * ((vmx - wind.x) * vmx + (vmy - wind.y) * vmy + vmz * vmz) * tau;
      if (k > 0) f.dragFrac = Math.max(f.dragFrac, (k * rel * rel) / p.g);
      f.x += f.vx * tau + 0.5 * ax * tau * tau;
      f.y += f.vy * tau + 0.5 * ay * tau * tau;
      f.z += f.vz * tau + 0.5 * az * tau * tau;
      f.vx += ax * tau;
      f.vy += ay * tau;
      f.vz += az * tau;
      f.peakZ = Math.max(f.peakZ, f.z);
      rem -= tau;
      tCur += tau;
      if (!ev) break;
      const savedT = w.timeS;
      w.timeS = tCur;
      handleContact(w, f, ev.on);
      w.timeS = savedT;
    }
    if (!f.done && w.timeS - f.launchedS > 6) settleBall(w, f);
  }
}

function handleContact(w: F103World, f: Flight, on: Contact['on']) {
  const p = w.params;
  const ke0 = 0.5 * f.massKg * (f.vx * f.vx + f.vy * f.vy + f.vz * f.vz);
  const speed = Math.hypot(f.vx, f.vy, f.vz);
  if (on === 'platform' || on === 'floor') {
    const c = contact(w, f, on, Math.abs(f.vz));
    f.contacts.push(c);
    const s = w.lastShot;
    if (s && s.shot === f.shot) {
      if (s.firstOn === null) s.firstOn = on;
      if (on === 'platform' && !s.platformContact) {
        s.platformContact = c;
        s.platformIndex = f.contacts.length - 1;
      }
      if (f.contacts.length === 1 && on === 'floor' && s.platformAt.connected && !w.screen.inLane) errF3(w, 'E07', 'PLATFORM_MISSED', 'WARN');
    }
    f.vz = -p.restitution * f.vz;
    f.vx *= p.bounceKeep;
    f.vy *= p.bounceKeep;
    if (on === 'platform') f.z = Math.max(f.z, PLAT_H + f.radius);
    else f.z = Math.max(f.z, f.radius);
    emitF3(w, f.contacts.length === 1 ? 'FIRST_IMPACT' : 'BOUNCE', 'INFO', { v: Math.round(c.v * 100) / 100 });
  } else {
    // Pantalla o colchón: plano vertical; la esfera deja su marca, pierde casi toda la velocidad normal y cae.
    const c = contact(w, f, on, Math.abs(f.vx));
    f.contacts.push(c);
    const s = w.lastShot;
    if (s && s.shot === f.shot && s.firstOn === null) s.firstOn = on;
    if (on === 'screen') w.screen.marks.push({ z: Math.round(f.z * 1e5) / 1e5, y: Math.round(f.y * 1e5) / 1e5, shot: f.shot });
    if (speed > p.damageMs && !w.balls[f.ball].damaged) {
      w.balls[f.ball].damaged = true;
      flagF3(w, 'ballDamaged');
      emitF3(w, 'BALL_DAMAGED', 'ALERT', { v: Math.round(speed * 10) / 10 });
    }
    f.vx = -0.15 * f.vx;
    f.vy *= 0.4;
    f.vz *= 0.4;
    f.x = on === 'screen' ? w.screen.x - f.radius - 1e-4 : BACKSTOP_X - f.radius - 1e-4;
    emitF3(w, on === 'screen' ? 'SCREEN_HIT' : 'BACKSTOP_HIT', 'INFO', { v: Math.round(speed * 10) / 10 });
  }
  const ke1 = 0.5 * f.massKg * (f.vx * f.vx + f.vy * f.vy + f.vz * f.vz);
  w.energy.dissipatedJ += ke0 - ke1;
  // Rebote muy bajo: rueda y se detiene.
  const floorish = on === 'platform' || on === 'floor';
  if (floorish && (Math.abs(f.vz) < 0.35 || f.contacts.length >= 8)) {
    // Lo que queda de energía (incluida la altura de la placa al rodar fuera de ella) se pierde rodando.
    const eBefore = flightEnergyJ(w);
    const vh = Math.hypot(f.vx, f.vy);
    const roll = Math.min(1.5, (vh * vh) / (2 * 0.3 * p.g));
    if (vh > 1e-6) {
      f.x = Math.min(BACKSTOP_X - f.radius, f.x + (f.vx / vh) * roll);
      f.y += (f.vy / vh) * roll;
    }
    f.z = onPlatform(f.x, f.y, w.platform.x, w.platform.y, p.platform) ? PLAT_H + f.radius : f.radius;
    w.energy.dissipatedJ += eBefore - flightEnergyJ(w);
    settleBall(w, f);
  }
}

// ─────────────────────────── Paso de simulación ───────────────────────────

export function stepF103World(w: F103World): void {
  const dt = w.params.dtS;
  w.timeS = Math.round((w.timeS + dt) * 1e6) / 1e6;
  w.tick++;
  stepFlight(w, dt);
}

export function runF103For(w: F103World, seconds: number) {
  const n = Math.round(seconds / w.params.dtS);
  for (let i = 0; i < n; i++) stepF103World(w);
}

export function f103Summary(w: F103World) {
  const f = w.flight;
  return {
    x: f ? Math.round(f.x * 1e6) / 1e6 : -1,
    z: f ? Math.round(f.z * 1e6) / 1e6 : -1,
    lx: Math.round(w.launcher.x * 1e6) / 1e6,
    ang: w.launcher.angleDeg,
    shots: w.shots,
    readings: w.readingOrder.length,
    cfg: w.configVersion,
  };
}
