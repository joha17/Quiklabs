/**
 * Mundo de F102 — cinemática rectilínea, aceleración y caída libre: paso fijo determinista de 0,05 s con 10 subpasos
 * de 5 ms (§6). La escena solo dibuja este estado y envía hechos geométricos.
 *
 * - Carril: el carro es un cuerpo 1D sobre la guía (coordenada s) con rodadura real: gravedad por la inclinación
 *   que fija el pie roscado, rozamiento viscoso y de rodadura (modo realista), arrastre de la cinta del registrador,
 *   resorte del lanzador como contacto (el émbolo empuja mientras la cola del carro está detrás de su cara) y tope
 *   final con restitución (CCD: nunca atraviesa el tope; un choque fuerte dobla la bandera).
 * - Cordel y polea: la masa colgante es un segundo cuerpo unido por una restricción unilateral (cordel tenso o flojo);
 *   tenso, el sistema acelera con a = (m_h g + F_carro)/(m_c + m_h + I/r²); flojo, la masa cae libre hasta tensarlo
 *   (tirón inelástico) o tocar el suelo (la tensión se anula). Cordel fuera de la ranura: rozamiento de cabrestante.
 * - Fotocompuertas: detección geométrica de la bandera real, tiempos interpolados en el subpaso (`instruments/photogate`).
 * - Torre: el cuerpo que cae se integra con Verlet y arrastre −½ ρ C_d A |v_r| v_r sobre la velocidad relativa al
 *   aire (viento lateral del escenario S08); el cruce del haz y el contacto con la almohadilla se resuelven con el
 *   instante exacto dentro del subpaso (CCD). El electroimán suelta con su retardo de desmagnetización.
 * - Sensor de movimiento: eco a la primera superficie del cono (brazo del electroimán, cuerpo, almohadilla).
 */
import type { F102Command, F102DispatchResult, PpeItem, RulerTarget } from './commands';
import type { FallingBody, F102Object, F102Params, F102World, Pose, ReadingF2 } from './types';
import { hashRandom } from '../core/rng';
import { bumpF2, emitF2, errF2, flagF2, gaussF2, rearmErrF2 } from './events';
import { CART_END_S, GEOF102, PULLEY_S } from './geometry';
import { conservedTotalsF102, hangMassKg, hangNominalG, hanging, mechanicalEnergyJ, tautDepth } from './conservation';
import { newGate, timerIndication, updateGate } from '../instruments/photogate';
import { motionIndication, newMotionSensor } from '../instruments/motion-sensor';

export { emitF2, latchF2, rearmF2, bumpF2, flagF2, errF2 } from './events';
export { conservedTotalsF102 };

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const DEG = Math.PI / 180;
const HALF = GEOF102.cart.halfLenM;
const BEAM_Z = GEOF102.tower.beamZ / 100;
const PAD_TOP = GEOF102.tower.padTop / 100;
const BASE_TOP = GEOF102.tower.baseH / 100;
const SENSOR_Z = GEOF102.tower.sensorZ / 100;
/** Velocidad por debajo de la cual el carro se considera quieto (m/s). */
const STILL_V = 0.002;
/** Corrimiento del índice de la base hasta su borde (cm, E10). */
const EDGE_CM = GEOF102.gate.baseHalfCm;

/** Escenarios docentes (§10). */
export const SF2 = {
  LEVEL_TRACK: 'F102-S01_level_track',
  SLOPED_TRACK: 'F102-S02_sloped_track',
  NARROW_FLAG: 'F102-S03_narrow_flag',
  MISPLACED_GATE: 'F102-S04_misplaced_gate',
  PULLEY_INERTIA: 'F102-S05_pulley_inertia',
  CART_FRICTION: 'F102-S06_cart_friction',
  FILTER_MASSES: 'F102-S07_filter_masses',
  SIDE_WIND: 'F102-S08_side_wind',
  NOISY_SENSOR: 'F102-S09_noisy_sensor',
  BOUNCY_CART: 'F102-S10_bouncy_cart',
  DRAG_SPHERE: 'F102-S11_drag_sphere',
  TIMER_OFFSET: 'F102-S12_timer_offset',
} as const;

export interface F102WorldSpec {
  objects: F102Object[];
  scenarios: string[];
  mode: string;
}

export const GATES = ['gate1', 'gate2'] as const;
export const SLOT_MASSES_F2: Array<[string, number]> = [['m10a', 10], ['m10b', 10], ['m20a', 20], ['m20b', 20], ['m50a', 50]];
export const BARS = ['bar1', 'bar2'] as const;
export const SPHERES = ['sphereS', 'sphereL'] as const;
export const FILTERS = ['f1', 'f2', 'f3', 'f4'] as const;

// ─────────────────────────── Creación ───────────────────────────

export function createF102World(spec: F102WorldSpec, seed: number, params: F102Params): F102World {
  const has = (s: string) => spec.scenarios.includes(s);
  const objects: Record<string, F102Object> = {};
  for (const o of spec.objects) objects[o.id] = { ...o, pose: { ...o.pose } };
  const h = (k: string) => hashRandom(seed, k) - 0.5;
  const spanMm = params.feetSpanM * 1000;
  // Desnivel inicial del pie (±0,35–0,70°) salvo los escenarios de carril nivelado (S01) o en pendiente (S02).
  const sign = h('footSign') > 0 ? 1 : -1;
  const startDeg = has(SF2.LEVEL_TRACK) ? 0 : has(SF2.SLOPED_TRACK) ? 2 : sign * (0.35 + (h('foot') + 0.5) * 0.35);
  const footMm = Math.round(Math.tan(startDeg * DEG) * spanMm * 10) / 10;
  const masses: F102World['masses'] = {
    cart01: { nominalG: params.cartMassKg * 1000, trueG: params.cartMassKg * 1000 * (1 + h('cart') * 0.008) },
    hanger01: { nominalG: 10, trueG: 10 * (1 + h('hanger') * 0.01) },
  };
  for (const [id, g] of SLOT_MASSES_F2) masses[id] = { nominalG: g, trueG: g * (1 + h(id) * 0.01) };
  for (const id of BARS) masses[id] = { nominalG: params.barMassKg * 1000, trueG: params.barMassKg * 1000 * (1 + h(id) * 0.006) };
  // Esferas de acero (Ø 2,00 y 2,54 cm); S11 cambia la pequeña por una hueca de 4 cm con inserto de acero.
  const rhoSteel = 7.85;
  const vol = (dCm: number) => (Math.PI * dCm ** 3) / 6;
  masses.sphereS = has(SF2.DRAG_SPHERE) ? { nominalG: 6, trueG: 6 * (1 + h('sS') * 0.01) } : { nominalG: 32.9, trueG: rhoSteel * vol(2) * (1 + h('sS') * 0.002) };
  masses.sphereL = { nominalG: 67.4, trueG: rhoSteel * vol(2.54) * (1 + h('sL') * 0.002) };
  const filters: F102World['filters'] = {};
  const fm = has(SF2.FILTER_MASSES) ? [0.8, 1.1, 1.5, 1.9] : [1.1, 1.1, 1.1, 1.1];
  FILTERS.forEach((id, i) => {
    filters[id] = { massKg: (fm[i] * (1 + h(id) * 0.02)) / 1000, crumpled: false, offCenter: false };
  });
  const cartKg = masses.cart01.trueG / 1000;
  const w: F102World = {
    timeS: 0, tick: 0, seed, rng: seed >>> 0 || 1, params, mode: spec.mode, objects,
    track: { footMm, angleDeg: footToDeg(footMm, params) },
    cart: { s: 0.3, v: 0, held: true, massKg: cartKg, bars: [], flagW: params.flagWidthM, flagBent: false, wheelRad: 0 },
    launcher: { notchCm: 0, latched: false },
    string: { attached: false, onWheel: false, lengthM: params.stringLengthM, depth: 0, vd: 0, taut: false, landed: false, tensionN: 0, wheelRad: 0 },
    gates: { gate1: newGate(0.2), gate2: newGate(0.25, has(SF2.MISPLACED_GATE) ? 14 : 0) },
    gateTimer: { running: false, startedS: 0, connected: { gate1: false, gate2: false }, configAtStart: 0, configChanged: false, impactS: null, landedS: null, sMin: 0, sMax: 0 },
    tape: { attached: false, slack: true, running: false, startedS: 0, lateStart: false, nextS: 0, dots: [], impactS: null, landedS: null, configAtStart: 0, configChanged: false },
    inclinometer: { zeroed: false, offsetDeg: (h('incl') > 0 ? 1 : -1) * params.inclinometerOffsetDeg, placedS: 0 },
    magnet: { on: false, h: 0.8, clampTight: true, armIn: true, holding: null, offsetM: 0, releaseAt: null },
    fallTimer: { armed: false, startS: null, stopS: null, running: false },
    photocellCapped: true,
    fall: null,
    motion: newMotionSensor(params.motion),
    filters,
    masses,
    energy: { dissipatedJ: 0, externalJ: 0 },
    run: { pushed: false, launched: false, startS: 0 },
    trial: 1,
    configVersion: 1,
    readings: {}, readingOrder: [],
    safety: { ppe: { coat: false, goggles: false, shoes: false, hair: false }, block: null, stoppedByTeacher: false },
    events: [], evidence: {}, scenarios: [...spec.scenarios], ppe: false,
    initialTotals: { massesG: 0 },
  };
  w.initialTotals = { massesG: conservedTotalsF102(w).massesG };
  w.energy.externalJ = mechanicalEnergyJ(w);
  return w;
}

const footToDeg = (footMm: number, p: F102Params) => Math.atan(footMm / (p.feetSpanM * 1000)) / DEG;

// ─────────────────────────── Consultas ───────────────────────────

export const cartSpeed = (w: F102World) => Math.abs(w.cart.v);
export const cartMoving = (w: F102World) => !w.cart.held && Math.abs(w.cart.v) > STILL_V;
export const bodyFalling = (w: F102World) => !!w.fall && !w.fall.landed;
export const gateSeparationCm = (w: F102World) => Math.abs(w.gates.gate2.s - w.gates.gate1.s) * 100;
export const flagEffectiveW = (w: F102World) => w.cart.flagW * (w.cart.flagBent ? 1.15 : 1);
export { hangMassKg, hangNominalG, hanging, tautDepth };

/** Filtros apilados con su base (el de más abajo) incluida; vacío si `id` no es un filtro. */
export function filterStack(w: F102World, id: string): string[] {
  if (!w.filters[id]) return [];
  let base = id;
  for (let i = 0; i < 6 && w.filters[w.objects[base].support]; i++) base = w.objects[base].support;
  const out = [base];
  for (let i = 0; i < 6; i++) {
    const next = FILTERS.find((f) => w.objects[f].support === out[out.length - 1]);
    if (!next) break;
    out.push(next);
  }
  return out;
}

/** Propiedades físicas de un cuerpo que puede caer (esfera o pila de filtros). */
export function bodyProps(w: F102World, id: string): { massKg: number; area: number; cd: number; radius: number; heightM: number; tumbling: boolean; mixed: boolean; n: number } | null {
  const p = w.params;
  if (SPHERES.includes(id as never)) {
    const hollow = id === 'sphereS' && w.scenarios.includes(SF2.DRAG_SPHERE);
    const dM = hollow ? 0.04 : id === 'sphereS' ? 0.02 : 0.0254;
    return { massKg: w.masses[id].trueG / 1000, area: (Math.PI * dM * dM) / 4, cd: p.sphereCd, radius: dM / 2, heightM: dM, tumbling: false, mixed: false, n: 0 };
  }
  const stack = filterStack(w, id);
  if (!stack.length) return null;
  const fs = stack.map((f) => w.filters[f]);
  const allCrumpled = fs.every((f) => f.crumpled);
  const mixed = fs.some((f) => f.crumpled) && !allCrumpled;
  const R = allCrumpled ? 0.025 : p.filterRadiusM;
  return {
    massKg: fs.reduce((s, f) => s + f.massKg, 0), area: Math.PI * R * R, cd: allCrumpled ? 0.8 : p.filterCd, radius: R,
    heightM: (GEOF102.filter.h + GEOF102.filter.nest * (stack.length - 1)) / 100, tumbling: fs.slice(1).some((f) => f.offCenter) || mixed, mixed, n: stack.length,
  };
}

/** Altura del borde inferior de lo que sostiene el electroimán (m sobre la mesada). */
export function heldBottomZ(w: F102World): number | null {
  const m = w.magnet;
  if (!m.holding) return null;
  const b = bodyProps(w, m.holding);
  return BEAM_Z + m.h - (b?.heightM ?? 0);
}

// ─────────────────────────── Despacho ───────────────────────────

const BEFORE_PPE = new Set<F102Command['type']>(['equipPpe', 'startWork', 'teacherStop', 'acknowledge', 'inspect']);
const DURING_BLOCK = new Set<F102Command['type']>(['acknowledge', 'teacherStop', 'inspect', 'setPose', 'holdCart', 'hangHanger', 'loadMass', 'attachString', 'stopTape', 'stopMotion', 'switchMagnet', 'pickUpBody']);
/** Comandos que cambian la condición física del ensayo (nuevo montaje; E32 si hay una corrida en curso). */
const CONFIG = new Set<F102Command['type']>(['turnFootScrew', 'setGatePos', 'setGateYaw', 'loadBar', 'attachString', 'seatString', 'hangHanger', 'loadMass', 'attachTape', 'tensionTape', 'setMagnetHeight', 'stackFilter', 'crumpleFilter', 'setMotionRange', 'setMotionRate', 'aimMotion']);

export function dispatchF102(w: F102World, cmd: F102Command): F102DispatchResult {
  if (w.safety.stoppedByTeacher && cmd.type !== 'teacherStop') return { ok: false, code: 'TEACHER_STOP' };
  if (!w.ppe && !BEFORE_PPE.has(cmd.type)) return { ok: false, code: 'PPE' };
  if (w.safety.block && !DURING_BLOCK.has(cmd.type)) return { ok: false, code: 'BLOCKED' };
  const E0 = mechanicalEnergyJ(w);
  const before = w.configVersion;
  const res = route(w, cmd);
  // Todo gesto que cambia la energía mecánica (mano, resorte, masa nueva) es trabajo externo en el balance.
  w.energy.externalJ += mechanicalEnergyJ(w) - E0;
  if (res.ok && CONFIG.has(cmd.type)) {
    if (w.configVersion === before) w.configVersion++;
    // Cambiar el montaje con el carro en marcha o un cuerpo cayendo mezcla dos condiciones en la misma réplica.
    const live = cartMoving(w) || bodyFalling(w);
    if (live && w.gateTimer.running) w.gateTimer.configChanged = true;
    if (live && w.tape.running) w.tape.configChanged = true;
    if (live && w.motion.capture) w.motion.capture.configChanged = true;
  }
  return res;
}

function route(w: F102World, cmd: F102Command): F102DispatchResult {
  const p = w.params;
  switch (cmd.type) {
    case 'equipPpe':
      w.safety.ppe[cmd.item] = cmd.on;
      return { ok: true };
    case 'startWork':
      return startWork(w);
    case 'inspect':
      return inspect(w, cmd.target);
    case 'setPose':
      return setPose(w, cmd.id, cmd.pose, cmd.support);
    // A — nivelación
    case 'turnFootScrew': {
      const t = w.track;
      t.footMm = Math.round(clamp(t.footMm + clamp(cmd.turns, -40, 40) * p.footPitchMm, -60, 60) * 1000) / 1000;
      t.angleDeg = footToDeg(t.footMm, p);
      if (w.objects.inclinometer01?.support === 'track01') w.inclinometer.placedS = w.timeS;
      flagF2(w, 'footTurned');
      return { ok: true, value: t.angleDeg };
    }
    case 'placeInclinometer':
      return placeInclinometer(w, cmd.where);
    case 'zeroInclinometer':
      return zeroInclinometer(w);
    case 'readInclinometer':
      return readInclinometer(w);
    // B
    case 'setGatePos':
      return setGatePos(w, cmd.gateId, cmd.sCm);
    case 'setGateYaw': {
      const g = w.gates[cmd.gateId];
      if (!g) return { ok: false, code: 'NO_GATE' };
      g.yawDeg = clamp(cmd.yawDeg, -25, 25);
      if (Math.abs(g.yawDeg) <= p.gateTimer.missYawDeg) rearmErrF2(w, 'E03');
      return { ok: true };
    }
    case 'connectGate': {
      if (!w.gates[cmd.gateId]) return { ok: false, code: 'NO_GATE' };
      w.gateTimer.connected[cmd.gateId] = cmd.on;
      if (cmd.on) {
        flagF2(w, `connected:${cmd.gateId}`);
        if (Object.values(w.gateTimer.connected).every(Boolean)) rearmErrF2(w, 'E23');
      }
      return { ok: true };
    }
    case 'readRuler':
      return readRuler(w, cmd.target, cmd.mark, cmd.viewDeg);
    case 'cockLauncher':
      return cockLauncher(w, cmd.notchCm);
    case 'pullLatch':
      return pullLatch(w);
    case 'holdCart':
      return holdCart(w, cmd.sCm);
    case 'releaseCart':
      return releaseCart(w, cmd.pushMs, false);
    case 'armGateTimer':
      return armGateTimer(w);
    case 'readGateTimer':
      return readGateTimer(w);
    case 'loadBar':
      return loadBar(w, cmd.barId, cmd.on);
    case 'replaceFlag':
      if (!w.cart.flagBent) return { ok: false, code: 'NOT_DAMAGED' };
      w.cart.flagBent = false;
      rearmErrF2(w, 'E39');
      flagF2(w, 'flagReplaced');
      emitF2(w, 'FLAG_REPLACED', 'INFO');
      return { ok: true };
    // C
    case 'attachString':
      return attachString(w, cmd.on);
    case 'seatString':
      if (!w.string.attached) return { ok: false, code: 'NO_STRING' };
      w.string.onWheel = cmd.on;
      if (cmd.on) rearmErrF2(w, 'E08');
      return { ok: true };
    case 'hangHanger':
      return hangHanger(w, cmd.on);
    case 'loadMass':
      return loadMass(w, cmd.massId, cmd.on);
    case 'attachTape':
      if (cmd.on && w.tape.running) return { ok: false, code: 'TAPE_RUNNING' };
      w.tape.attached = cmd.on;
      // La cinta queda floja sobre la guía hasta que se la pasa por la ranura y se tensa.
      w.tape.slack = true;
      return { ok: true };
    case 'tensionTape':
      if (!w.tape.attached) return { ok: false, code: 'NO_TAPE' };
      w.tape.slack = false;
      rearmErrF2(w, 'E06');
      flagF2(w, 'tapeTensioned');
      return { ok: true };
    case 'startTape':
      return startTape(w);
    case 'stopTape':
      return stopTape(w);
    // D
    case 'setMagnetHeight': {
      const m = w.magnet;
      if (m.clampTight) return { ok: false, code: 'CLAMP_TIGHT' };
      m.h = Math.round(clamp(cmd.hCm / 100, 0.5, 1.5) * 1e5) / 1e5;
      return { ok: true };
    }
    case 'tightenClamp':
      w.magnet.clampTight = cmd.on;
      if (cmd.on) rearmErrF2(w, 'E28');
      return { ok: true };
    case 'swingMagnetArm':
      if (w.magnet.holding) return { ok: false, code: 'HOLDING' };
      w.magnet.armIn = cmd.armIn;
      return { ok: true };
    case 'switchMagnet':
      return switchMagnet(w, cmd.on);
    case 'attachToMagnet':
      return attachToMagnet(w, cmd.id, cmd.offsetMm);
    case 'dropByHand':
      return dropByHand(w, cmd.id, cmd.heightCm, cmd.offsetMm, cmd.pushMs);
    case 'readTowerScale':
      return readTowerScale(w, cmd.viewDeg);
    case 'capPhotocell':
      w.photocellCapped = cmd.on;
      if (!cmd.on) {
        flagF2(w, 'photocellUncapped');
        rearmErrF2(w, 'E13');
      }
      return { ok: true };
    case 'armFallTimer':
      w.fallTimer = { armed: true, startS: null, stopS: null, running: false };
      return { ok: true };
    case 'readFallTimer':
      return readFallTimer(w);
    case 'pickUpBody':
      return pickUpBody(w, cmd.id);
    // E
    case 'stackFilter':
      return stackFilter(w, cmd.filterId, cmd.onto, cmd.offsetMm);
    case 'crumpleFilter': {
      const f = w.filters[cmd.filterId];
      if (!f) return { ok: false, code: 'NO_FILTER' };
      if (w.objects[cmd.filterId].support === 'air' || w.objects[cmd.filterId].support === 'magnet01') return { ok: false, code: 'IN_USE' };
      f.crumpled = true;
      emitF2(w, 'FILTER_CRUMPLED', 'INFO');
      return { ok: true };
    }
    case 'connectMotion':
      w.motion.connected = cmd.on;
      if (cmd.on) {
        flagF2(w, 'motionConnected');
        rearmErrF2(w, 'E23');
      }
      return { ok: true };
    case 'setMotionRange':
      w.motion.range = cmd.range;
      if (cmd.range === 'far') rearmErrF2(w, 'E22');
      return { ok: true };
    case 'setMotionRate':
      w.motion.rateHz = cmd.hz;
      if (cmd.hz === 50) rearmErrF2(w, 'E24');
      return { ok: true };
    case 'aimMotion':
      w.motion.aimDeg = clamp(cmd.aimDeg, -15, 15);
      if (Math.abs(w.motion.aimDeg) <= 1) rearmErrF2(w, 'E26');
      return { ok: true };
    case 'calibrateMotion':
      return calibrateMotion(w);
    case 'startMotion':
      return startMotion(w);
    case 'stopMotion':
      return stopMotion(w);
    // Cierre
    case 'closeStation':
      return closeStation(w);
    case 'acknowledge':
      return acknowledge(w);
    case 'teacherStop':
      w.safety.stoppedByTeacher = cmd.on;
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

function startWork(w: F102World): F102DispatchResult {
  const missing = (Object.keys(PPE_ERR) as PpeItem[]).filter((k) => !w.safety.ppe[k]);
  if (missing.length) {
    for (const k of missing) {
      bumpF2(w, `err:${PPE_ERR[k][0]}`);
      emitF2(w, PPE_ERR[k][1], 'CRITICAL');
    }
    return { ok: false, code: 'PPE_MISSING' };
  }
  w.ppe = true;
  flagF2(w, 'ppe');
  emitF2(w, 'PPE_OK', 'INFO');
  return { ok: true };
}

function inspect(w: F102World, target: string): F102DispatchResult {
  flagF2(w, `inspected:${target}`);
  const p = w.params;
  switch (target) {
    case 'track01':
      emitF2(w, 'INSPECT_TRACK', 'INFO', { res: p.rulerResolutionCm });
      break;
    case 'inclinometer01':
      emitF2(w, 'INSPECT_INCLINOMETER', 'INFO', { res: p.inclinometerResolutionDeg });
      break;
    case 'gate1':
    case 'gate2': {
      const g = w.gates[target];
      emitF2(w, 'INSPECT_GATE', Math.abs(g.yawDeg) > 3 ? 'WARN' : 'INFO', { deg: Math.round(Math.abs(g.yawDeg)) });
      break;
    }
    case 'gateTimer01':
      emitF2(w, 'INSPECT_TIMER', 'INFO', { res: p.gateTimer.resolutionS * 1000 });
      break;
    case 'cart01':
      emitF2(w, 'INSPECT_CART', w.cart.flagBent ? 'WARN' : 'INFO', { g: w.masses.cart01.nominalG, w: Math.round(w.cart.flagW * 1000) / 10 });
      break;
    case 'tapeTimer01':
      emitF2(w, 'INSPECT_TAPE', 'INFO', { hz: p.tapeRateHz });
      break;
    case 'tower01':
      emitF2(w, 'INSPECT_TOWER', 'INFO', { res: p.towerScaleResolutionCm });
      break;
    case 'photocell01':
      emitF2(w, w.photocellCapped ? 'PHOTOCELL_CAPPED' : 'INSPECT_PHOTOCELL', w.photocellCapped ? 'WARN' : 'INFO');
      break;
    case 'motionSensor01':
      emitF2(w, 'INSPECT_MOTION', Math.abs(w.motion.aimDeg) > 1 ? 'WARN' : 'INFO', { deg: Math.round(w.motion.aimDeg) });
      break;
    case 'pulley01':
      emitF2(w, 'INSPECT_PULLEY', 'INFO');
      break;
    default:
      emitF2(w, 'INSPECTED', 'INFO', { target });
  }
  return { ok: true };
}

/** Lugares donde una pieza puede apoyarse (el resto se rechaza: no hay acople allí). */
const SUPPORTS = new Set(['bench', 'hand', 'rack', 'tray', 'base', 'pad01']);

function setPose(w: F102World, id: string, pose: Pose, support?: string): F102DispatchResult {
  const o = w.objects[id];
  if (!o) return { ok: false, code: 'NO_OBJECT' };
  if (!o.movable) return { ok: false, code: 'FIXED' };
  const prev = o.support;
  if (support && support !== prev) {
    if (!SUPPORTS.has(support)) return { ok: false, code: 'NO_SEAT' };
    if (prev === 'air') return { ok: false, code: 'FALLING' };
    if (prev === 'magnet01') return { ok: false, code: 'USE_MAGNET' };
    if (prev === 'string') return { ok: false, code: 'USE_UNHANG' };
    if (prev === 'cart01' && o.kind === 'cartBar') return { ok: false, code: 'USE_UNLOAD' };
    if (prev === 'hanger01' && o.kind === 'slotMass') return { ok: false, code: 'USE_UNLOAD' };
    if (o.kind === 'inclinometer') return { ok: false, code: 'USE_PLACE' };
    // Un filtro con otros encima lleva la pila; uno anidado se separa de la pila al tomarlo.
    if (w.fall && w.fall.id === id && w.fall.landed) w.fall = null;
    if (o.kind === 'filter' && w.filters[prev]) w.filters[id].offCenter = false;
  }
  o.pose = { ...pose };
  if (support) o.support = support;
  // Los filtros apilados acompañan a su base.
  if (o.kind === 'filter') moveStackAbove(w, id);
  return { ok: true };
}

function moveStackAbove(w: F102World, id: string) {
  let cur = id;
  for (let i = 0; i < 6; i++) {
    const next = FILTERS.find((f) => w.objects[f].support === cur);
    if (!next) return;
    const b = w.objects[cur].pose;
    w.objects[next].pose = { x: b.x + (w.filters[next].offCenter ? 0.8 : 0), y: b.y, z: b.z + GEOF102.filter.nest, rotationRad: b.rotationRad };
    cur = next;
  }
}

// ─────────────────────────── A — nivelación ───────────────────────────

function placeInclinometer(w: F102World, where: 'bench' | 'track' | 'off'): F102DispatchResult {
  const o = w.objects.inclinometer01;
  if (!o) return { ok: false, code: 'NO_OBJECT' };
  o.support = where === 'track' ? 'track01' : 'bench';
  o.pose = where === 'track' ? { x: GEOF102.track.xLauncher - 70, y: GEOF102.track.y, z: GEOF102.track.railZ + 0.3, rotationRad: 0 } : { x: 182, y: 46, z: 0, rotationRad: 0 };
  w.inclinometer.placedS = w.timeS;
  return { ok: true };
}

function zeroInclinometer(w: F102World): F102DispatchResult {
  const inc = w.inclinometer;
  const onTrack = w.objects.inclinometer01?.support === 'track01';
  // El cero se ajusta sobre la superficie de apoyo: en la mesada (horizontal) quita el desplazamiento; sobre el carril
  // inclinado, lo «pone a cero» en la pendiente y esconde el desnivel.
  inc.offsetDeg = onTrack ? -w.track.angleDeg : 0;
  inc.zeroed = true;
  inc.placedS = Math.min(inc.placedS, w.timeS - 2);
  if (!onTrack) {
    rearmErrF2(w, 'E21');
    flagF2(w, 'inclinometerZeroed');
  }
  emitF2(w, 'INCLINOMETER_ZEROED', onTrack ? 'WARN' : 'INFO', { onTrack: onTrack ? 1 : 0 });
  return { ok: true };
}

function addReading(w: F102World, r: Omit<ReadingF2, 'id' | 't' | 'tick' | 'trialId' | 'configVersion'> & { configVersion?: number }): ReadingF2 {
  const n = w.readingOrder.length + 1;
  const prefix = { angle: 'a', length: 'L', gates: 'g', tape: 'c', fall: 'f', motion: 'm' }[r.kind];
  const reading: ReadingF2 = { ...r, configVersion: r.configVersion ?? w.configVersion, id: `${prefix}${n}`, trialId: `T${w.trial}`, t: w.timeS, tick: w.tick };
  // Sin valor (falta un cruce, el cronómetro no paró): la lectura queda marcada inválida; nunca un NaN «válido».
  if (!Number.isFinite(reading.value)) reading.valid = false;
  if (!Number.isFinite(reading.trueValue)) reading.trueValue = 0;
  w.readings[reading.id] = reading;
  w.readingOrder.push(reading.id);
  return reading;
}

const quant = (x: number, res: number) => {
  const dec = Math.max(0, Math.ceil(-Math.log10(res) - 1e-9));
  return Number((Math.round(x / res) * res).toFixed(dec));
};

function readInclinometer(w: F102World): F102DispatchResult {
  const inc = w.inclinometer;
  const p = w.params;
  const onTrack = w.objects.inclinometer01?.support === 'track01';
  const trueDeg = onTrack ? w.track.angleDeg : 0;
  const flags: string[] = [];
  const settling = w.timeS - inc.placedS < 1.5;
  const wobble = settling ? gaussF2(w) * 0.3 : 0;
  const value = quant(trueDeg + inc.offsetDeg + wobble, p.inclinometerResolutionDeg);
  if (settling) {
    flags.push('UNSTABLE');
    errF2(w, 'E30', 'READ_BEFORE_STABLE', 'WARN', { inst: 'inclinometer01' });
  }
  if (inc.offsetDeg !== 0 && onTrack) {
    flags.push('NOT_ZEROED');
    errF2(w, 'E21', 'INSTRUMENT_ZERO_SKIPPED', 'WARN', { inst: 'inclinometer01' });
  }
  if (!onTrack) flags.push('ZERO');
  const r = addReading(w, { kind: 'angle', instrumentId: 'inclinometer01', value, unit: '°', resolution: p.inclinometerResolutionDeg, uncertainty: p.uB.angleDeg, sourceObjectIds: ['track01'], qualityFlags: flags, trueValue: trueDeg, target: onTrack ? 'track' : 'bench' });
  if (onTrack && !settling && inc.offsetDeg === 0) {
    flagF2(w, 'trackAngleRead');
    if (Math.abs(w.track.angleDeg) <= 0.1) flagF2(w, 'trackLevel');
  }
  emitF2(w, 'ANGLE_READ', 'INFO', { deg: value });
  return { ok: true, id: r.id, value };
}

// ─────────────────────────── B — compuertas, regla, lanzador ───────────────────────────

function setGatePos(w: F102World, gateId: string, sCm: number): F102DispatchResult {
  const g = w.gates[gateId];
  if (!g) return { ok: false, code: 'NO_GATE' };
  const s = clamp(sCm / 100, 0.12, 1.4);
  // Las bases son sólidos: dos compuertas no pueden ocupar el mismo tramo (base de 3 cm, ≥ 3,2 cm entre índices).
  const other = GATES.filter((x) => x !== gateId).map((x) => w.gates[x]);
  if (other.some((o) => o.onTrack && Math.abs(o.s - s) < 0.015)) return { ok: false, code: 'COLLISION' };
  // No se puede deslizar la base a través del carro.
  const c = w.cart;
  if (Math.min(g.s, s) < c.s + HALF && Math.max(g.s, s) > c.s - HALF && Math.abs(s - g.s) > 0.001 && !c.held) return { ok: false, code: 'CART_IN_WAY' };
  g.s = Math.round(s * 1e5) / 1e5;
  g.onTrack = true;
  return { ok: true };
}

function readRuler(w: F102World, target: RulerTarget, mark: 'index' | 'edge', viewDeg: number): F102DispatchResult {
  const p = w.params;
  const res = p.rulerResolutionCm;
  const flags: string[] = [];
  let trueCm: number;
  let shown: number;
  if (target === 'flag') {
    trueCm = w.cart.flagW * 100;
    shown = trueCm;
    if (w.cart.flagBent) flags.push('POST_IMPACT');
  } else {
    const g = w.gates[target];
    if (!g || !g.onTrack) return { ok: false, code: 'NO_GATE' };
    trueCm = g.s * 100;
    // Leer en el borde de la base corre la posición medio ancho de base (hacia el lanzador).
    shown = trueCm - (mark === 'edge' ? EDGE_CM : 0);
    if (mark === 'edge') {
      flags.push('EDGE');
      errF2(w, 'E10', 'GATE_EDGE_READ', 'WARN', { cm: EDGE_CM });
    }
  }
  if (Math.abs(viewDeg) > 20) {
    shown += Math.sign(viewDeg) * res;
    flags.push('PARALLAX');
    errF2(w, 'E29', 'SCALE_PARALLAX', 'WARN', { inst: 'track01' });
  }
  const value = quant(shown, res);
  const r = addReading(w, { kind: 'length', instrumentId: 'track01', value, unit: 'cm', resolution: res, uncertainty: p.uB.rulerCm, sourceObjectIds: [target], qualityFlags: flags, trueValue: trueCm, target });
  if (!flags.length) flagF2(w, `ruler:${target}`);
  emitF2(w, 'LENGTH_READ', 'INFO', { cm: value });
  return { ok: true, id: r.id, value };
}

function cockLauncher(w: F102World, notchCm: number): F102DispatchResult {
  const n = Math.round(clamp(notchCm, 0, 3));
  const rear = w.cart.s - HALF;
  // Con el carro apoyado en el émbolo no se puede tirar de él hacia atrás: el carro lo impide.
  if (rear < -n / 100 + 1e-6 && n > w.launcher.notchCm) return { ok: false, code: 'CART_IN_WAY' };
  w.launcher.notchCm = n;
  w.launcher.latched = n > 0;
  return { ok: true, value: n };
}

function pullLatch(w: F102World): F102DispatchResult {
  const l = w.launcher;
  if (!l.latched) return { ok: false, code: 'NOT_COCKED' };
  l.latched = false;
  const touching = w.cart.s - HALF < 0.002 && !w.cart.held;
  // Sin el carro apoyado, el émbolo se dispara en vacío: su energía se disipa en el tope del émbolo.
  if (!touching) {
    w.energy.dissipatedJ += 0.5 * w.params.launcherKNPerM * (l.notchCm / 100) ** 2;
    l.notchCm = 0;
    emitF2(w, 'LAUNCHER_DRY_FIRE', 'WARN');
    return { ok: true };
  }
  l.notchCm = 0;
  // Disparo real: el émbolo no queda exactamente en la muesca (±0,2 mm), así las corridas repetidas difieren.
  if (w.params.scientificMode === 'REALISTIC') {
    const ds = gaussF2(w) * 0.0002;
    const rear = w.cart.s - HALF;
    const E0 = 0.5 * w.params.launcherKNPerM * rear * rear;
    w.cart.s = Math.min(w.cart.s, HALF) + ds;
    w.energy.externalJ += 0.5 * w.params.launcherKNPerM * Math.min(0, w.cart.s - HALF) ** 2 - E0;
  }
  w.run = { pushed: false, launched: true, startS: w.timeS };
  flagF2(w, 'launched');
  emitF2(w, 'LAUNCHED', 'INFO');
  return { ok: true };
}

function cartLimits(w: F102World) {
  const minRear = w.launcher.latched ? -w.launcher.notchCm / 100 : -GEOF102.launcher.maxM;
  // Con la masa colgada, el portapesas no puede subir más allá de la polea (3 cm bajo el eje).
  const minHang = hanging(w) ? PULLEY_S - HALF - (w.string.lengthM - 0.03) : -Infinity;
  return { min: Math.max(minRear + HALF, minHang), max: CART_END_S };
}

function holdCart(w: F102World, sCm: number): F102DispatchResult {
  const c = w.cart;
  const lim = cartLimits(w);
  let s = clamp(sCm / 100, lim.min, lim.max);
  // Las bases de las compuertas no cruzan el carro: se lo puede llevar por debajo del haz (la base pasa por fuera).
  c.s = s = Math.round(s * 1e6) / 1e6;
  c.v = 0;
  c.held = true;
  if (hanging(w)) {
    const d = tautDepth(w, s);
    const st = w.string;
    st.landed = d >= w.params.floorDepthM;
    st.depth = Math.min(d, w.params.floorDepthM);
    st.vd = 0;
    st.taut = !st.landed;
  }
  return { ok: true };
}

function releaseCart(w: F102World, pushMs: number, _internal: boolean): F102DispatchResult {
  const c = w.cart;
  if (!c.held) return { ok: true };
  c.held = false;
  const push = clamp(pushMs, -2, 2);
  // La mano nunca suelta perfectamente quieta: un temblor de ±3 mm/s (modo realista) separa las réplicas.
  const tremor = w.params.scientificMode === 'REALISTIC' && Math.abs(push) <= 0.02 ? clamp(gaussF2(w) * 0.003, -0.008, 0.008) : 0;
  c.v = Math.abs(push) > 0.02 ? push : tremor;
  w.run = { pushed: Math.abs(push) > 0.02, launched: false, startS: w.timeS };
  if (w.run.pushed) {
    errF2(w, 'E02', 'CART_PUSHED', 'WARN', { v: Math.round(Math.abs(push) * 100) / 100 });
  } else rearmErrF2(w, 'E02');
  if (hanging(w)) {
    w.string.vd = w.string.taut ? c.v : 0;
    flagF2(w, 'releasedWithMass');
  }
  return { ok: true };
}

function armGateTimer(w: F102World): F102DispatchResult {
  const gt = w.gateTimer;
  gt.running = true;
  gt.startedS = w.timeS;
  gt.configAtStart = w.configVersion;
  gt.configChanged = false;
  gt.impactS = null;
  gt.landedS = null;
  gt.sMin = w.cart.s;
  gt.sMax = w.cart.s;
  for (const g of Object.values(w.gates)) {
    g.events = [];
    g.blocked = false;
  }
  flagF2(w, 'timerArmed');
  return { ok: true };
}

function firstCrossing(ev: Array<[number, number | null]>): [number | null, number | null] {
  const e = ev.find((x) => x[1] !== null) ?? ev[0];
  return e ? [e[0], e[1]] : [null, null];
}

function readGateTimer(w: F102World): F102DispatchResult {
  const gt = w.gateTimer;
  const p = w.params;
  if (!gt.running) return { ok: false, code: 'TIMER_NOT_ARMED' };
  const flags: string[] = [];
  const conn = GATES.filter((g) => gt.connected[g]);
  if (conn.length < GATES.length) {
    flags.push('UNPLUGGED');
    errF2(w, 'E23', 'SENSOR_NOT_CONNECTED', 'WARN', { inst: 'gateTimer01' });
    if (!conn.length) {
      gt.running = false;
      return { ok: false, code: 'NO_SIGNAL' };
    }
  }
  const ev = (g: string) => (gt.connected[g] ? w.gates[g].events : []);
  const [t1In, t1Out] = firstCrossing(ev('gate1'));
  const [t2In, t2Out] = firstCrossing(ev('gate2'));
  // Compuerta girada: el carro pasó por el haz y no quedó registro.
  for (const g of GATES) {
    const gs = w.gates[g];
    const passed = gt.sMin < gs.s && gt.sMax > gs.s;
    if (passed && gt.connected[g] && !gs.events.length && Math.abs(gs.yawDeg) > p.gateTimer.missYawDeg) {
      flags.push('MISSED');
      errF2(w, 'E03', 'GATE_MISALIGNED', 'WARN', { deg: Math.round(Math.abs(gs.yawDeg)) });
    }
  }
  // Separación menor que la bandera: la bandera tapa las dos a la vez (los cruces se superponen).
  if (t1In !== null && t2In !== null && t1Out !== null && t2Out !== null && Math.max(t1In, t2In) < Math.min(t1Out, t2Out)) {
    flags.push('OVERLAP');
    errF2(w, 'E04', 'GATES_OVERLAP', 'WARN', { cm: Math.round(gateSeparationCm(w) * 10) / 10 });
  }
  if (cartMoving(w) && (t1Out === null || t2Out === null || GATES.some((g) => w.gates[g].blocked))) {
    flags.push('MOVING');
    errF2(w, 'E30', 'READ_BEFORE_STABLE', 'WARN', { inst: 'gateTimer01' });
  }
  if (w.run.pushed && w.run.startS >= gt.startedS - 30) flags.push('PUSHED');
  const uniformRun = !hanging(w);
  if (uniformRun && Math.abs(w.track.angleDeg) > 0.15 && (t1In !== null || t2In !== null)) {
    flags.push('UNLEVELED');
    errF2(w, 'E01', 'TRACK_NOT_LEVEL', 'WARN', { deg: Math.round(Math.abs(w.track.angleDeg) * 10) / 10 });
  }
  const multi = GATES.some((g) => ev(g).length > 1);
  if (gt.impactS !== null && multi) {
    flags.push('IMPACT');
    errF2(w, 'E09', 'CART_HIT_STOP', 'WARN');
  }
  if (w.cart.flagBent) {
    flags.push('POST_IMPACT');
    errF2(w, 'E39', 'DATA_AFTER_DAMAGE', 'ALERT');
  }
  if (gt.configChanged) {
    flags.push('CONFIG_CHANGED');
    errF2(w, 'E32', 'CONFIG_CHANGED_MIDRUN');
  }
  if (hanging(w) && !w.string.onWheel) {
    flags.push('OFF_WHEEL');
    errF2(w, 'E08', 'STRING_OFF_WHEEL');
  }
  if (hanging(w) && gt.landedS !== null && (t2In === null || gt.landedS - gt.startedS < t2In)) {
    flags.push('LANDED');
    errF2(w, 'E07', 'MASS_LANDED_EARLY');
  }
  if (w.tape.attached && w.tape.slack) {
    flags.push('SLACK_TAPE');
    errF2(w, 'E06', 'TAPE_SLACK');
  }
  const j = () => (p.gateTimer.jitterS > 0 ? gaussF2(w) : 0);
  const q = (t: number | null) => timerIndication(t, p.gateTimer, j());
  const gates = { t1In: q(t1In), t1Out: q(t1Out), t2In: q(t2In), t2Out: q(t2Out) };
  const between = gates.t1In !== null && gates.t2In !== null ? quant(gates.t2In - gates.t1In, p.gateTimer.resolutionS) : NaN;
  gt.running = false;
  const r = addReading(w, {
    kind: 'gates', instrumentId: 'gateTimer01', value: between, unit: 's', resolution: p.gateTimer.resolutionS, uncertainty: p.uB.gateS,
    sourceObjectIds: [...conn], qualityFlags: flags, trueValue: t1In !== null && t2In !== null ? t2In - t1In : NaN, target: 'gates', gates,
    setup: { hangG: hangNominalG(w), cartG: cartNominalG(w), gateSepCm: Math.round(gateSeparationCm(w) * 100) / 100, launcherCm: w.run.launched ? 1 : 0 },
    configVersion: gt.configAtStart,
  });
  w.trial++;
  emitF2(w, 'GATES_READ', 'INFO', { s: Number.isFinite(between) ? between : 0 });
  return { ok: true, id: r.id, value: between };
}

export const cartNominalG = (w: F102World) => w.masses.cart01.nominalG + w.cart.bars.reduce((s, b) => s + w.masses[b].nominalG, 0);

function loadBar(w: F102World, barId: string, on: boolean): F102DispatchResult {
  const o = w.objects[barId];
  if (!o || !BARS.includes(barId as never)) return { ok: false, code: 'NO_OBJECT' };
  const c = w.cart;
  if (on) {
    if (c.bars.includes(barId)) return { ok: true };
    c.bars.push(barId);
    o.support = 'cart01';
  } else {
    c.bars = c.bars.filter((b) => b !== barId);
    o.support = 'rack';
  }
  // Masa nueva con el carro en marcha: se conserva el momento (v·m antes = v·m después).
  const m0 = c.massKg;
  c.massKg = (w.masses.cart01.trueG + c.bars.reduce((s, b) => s + w.masses[b].trueG, 0)) / 1000;
  c.v = (c.v * m0) / c.massKg;
  return { ok: true };
}

// ─────────────────────────── C — cordel, masa colgante, cinta ───────────────────────────

function attachString(w: F102World, on: boolean): F102DispatchResult {
  const st = w.string;
  if (on === st.attached) return { ok: true };
  if (on) {
    st.attached = true;
    st.onWheel = false;
    syncHang(w);
    return { ok: true };
  }
  // Soltar el cordel con la masa colgando y el carro libre: la masa cae al suelo (energía sin control).
  if (hanging(w) && !w.cart.held && !st.landed) {
    errF2(w, 'E40', 'UNSAFE_DISASSEMBLY', 'CRITICAL', { what: 'string' });
    w.safety.block = { code: 'MASS_FALL', since: w.timeS };
    w.energy.dissipatedJ += 0.5 * hangMassKg(w) * st.vd * st.vd + hangMassKg(w) * w.params.g * (w.params.floorDepthM - st.depth);
    w.objects.hanger01.support = 'floor';
    for (const o of Object.values(w.objects)) if (o.kind === 'slotMass' && o.support === 'hanger01') o.support = 'floor';
  }
  st.attached = false;
  st.taut = false;
  st.landed = false;
  st.tensionN = 0;
  return { ok: true };
}

/** Coloca la masa colgada en la posición que le da el cordel (tenso o apoyada en el suelo). */
function syncHang(w: F102World) {
  const st = w.string;
  if (!hanging(w)) return;
  const d = tautDepth(w);
  st.landed = d >= w.params.floorDepthM;
  st.depth = Math.min(d, w.params.floorDepthM);
  st.vd = w.cart.held || st.landed ? 0 : w.cart.v;
  st.taut = !st.landed;
}

function hangHanger(w: F102World, on: boolean): F102DispatchResult {
  const o = w.objects.hanger01;
  if (!o) return { ok: false, code: 'NO_OBJECT' };
  if (on) {
    if (!w.string.attached) return { ok: false, code: 'NO_STRING' };
    if (o.support === 'string') return { ok: true };
    o.support = 'string';
    syncHang(w);
    flagF2(w, 'hung');
    return { ok: true };
  }
  if (o.support !== 'string' && o.support !== 'floor') return { ok: true };
  o.support = 'rack';
  for (const m of Object.values(w.objects)) if (m.kind === 'slotMass' && m.support === 'floor') m.support = 'hanger01';
  w.string.taut = false;
  w.string.landed = false;
  w.string.tensionN = 0;
  return { ok: true };
}

function loadMass(w: F102World, massId: string, on: boolean): F102DispatchResult {
  const o = w.objects[massId];
  if (!o || o.kind !== 'slotMass') return { ok: false, code: 'NO_MASS' };
  o.support = on ? 'hanger01' : 'rack';
  return { ok: true };
}

function startTape(w: F102World): F102DispatchResult {
  const t = w.tape;
  if (!t.attached) return { ok: false, code: 'NO_TAPE' };
  if (t.running) return { ok: false, code: 'TAPE_RUNNING' };
  // Arrancar con el carro ya en marcha: el origen temporal queda después de la liberación (E05).
  const late = cartMoving(w) && Math.abs(w.cart.v) > 0.01;
  Object.assign(t, { running: true, startedS: w.timeS, lateStart: late, nextS: w.timeS, dots: [], impactS: null, landedS: null, configAtStart: w.configVersion, configChanged: false });
  return { ok: true };
}

function stopTape(w: F102World): F102DispatchResult {
  const t = w.tape;
  const p = w.params;
  if (!t.running) return { ok: false, code: 'TAPE_NOT_RUNNING' };
  t.running = false;
  if (t.dots.length < 3) return { ok: false, code: 'TOO_SHORT' };
  const flags: string[] = [];
  const x0 = t.dots[0][1];
  const samples: Array<[number, number]> = t.dots.map(([tt, s]) => [Math.round(tt * 1e4) / 1e4, quant(s * 100 - x0 * 100, 0.1)]);
  const moving = movingDots(samples);
  if (t.lateStart) {
    flags.push('LATE_START');
    errF2(w, 'E05', 'TIMER_STARTED_LATE');
  }
  if (t.slack) {
    flags.push('SLACK_TAPE');
    errF2(w, 'E06', 'TAPE_SLACK');
  }
  if (w.run.pushed && w.run.startS >= t.startedS - 30) flags.push('PUSHED');
  if (hanging(w) && !w.string.onWheel) {
    flags.push('OFF_WHEEL');
    errF2(w, 'E08', 'STRING_OFF_WHEEL');
  }
  const cut = [t.landedS, t.impactS].filter((x): x is number => x !== null).map((x) => x - t.startedS);
  const cutS = cut.length ? Math.round(Math.min(...cut) * 1e4) / 1e4 : undefined;
  if (t.landedS !== null) {
    flags.push('LANDED');
    const before = moving.filter(([tt]) => cutS === undefined || tt <= cutS).length;
    if (before < 8) errF2(w, 'E07', 'MASS_LANDED_EARLY');
  }
  if (t.impactS !== null) {
    flags.push('IMPACT');
    errF2(w, 'E09', 'CART_HIT_STOP', 'WARN');
  }
  if (t.configChanged) {
    flags.push('CONFIG_CHANGED');
    errF2(w, 'E32', 'CONFIG_CHANGED_MIDRUN');
  }
  const r = addReading(w, {
    kind: 'tape', instrumentId: 'tapeTimer01', value: samples.length, unit: 'cm', resolution: 0.1, uncertainty: p.uB.tapeCm,
    sourceObjectIds: ['tapeTimer01', 'cart01'], qualityFlags: flags, trueValue: samples.length, target: 'tape', samples, cutS,
    setup: { hangG: hangNominalG(w), cartG: cartNominalG(w) }, configVersion: t.configAtStart,
  });
  w.trial++;
  emitF2(w, 'TAPE_READ', 'INFO', { n: samples.length });
  return { ok: true, id: r.id, value: samples.length };
}

/** Puntos de cinta con el carro ya en marcha (los superpuestos del inicio quedan fuera). */
export function movingDots(samples: Array<[number, number]>): Array<[number, number]> {
  const i = samples.findIndex((x, k) => k > 0 && Math.abs(x[1] - samples[k - 1][1]) >= 0.05);
  return i < 0 ? [] : samples.slice(Math.max(0, i - 1));
}

// ─────────────────────────── D — torre de caída ───────────────────────────

function switchMagnet(w: F102World, on: boolean): F102DispatchResult {
  const m = w.magnet;
  if (on === m.on) return { ok: true };
  m.on = on;
  if (on) {
    m.releaseAt = null;
    return { ok: true };
  }
  // El cronómetro arranca con el corte de corriente; el cuerpo se suelta tras el retardo de desmagnetización.
  if (w.fallTimer.armed && w.fallTimer.startS === null) {
    w.fallTimer.startS = w.timeS;
    w.fallTimer.running = true;
  }
  if (m.holding) {
    // El retardo de desmagnetización varía de una suelta a otra (±0,3 ms en modo realista).
    const jitter = w.params.scientificMode === 'REALISTIC' ? Math.abs(gaussF2(w)) * 0.0003 : 0;
    const delay = w.params.magnetDelayS + jitter + (w.scenarios.includes(SF2.TIMER_OFFSET) ? 0.015 : 0);
    m.releaseAt = Math.round((w.timeS + delay) * 1e6) / 1e6;
  }
  return { ok: true };
}

function attachToMagnet(w: F102World, id: string, offsetMm: number): F102DispatchResult {
  const m = w.magnet;
  const o = w.objects[id];
  if (!o) return { ok: false, code: 'NO_OBJECT' };
  if (!m.on) return { ok: false, code: 'MAGNET_OFF' };
  if (!m.armIn) return { ok: false, code: 'ARM_OUT' };
  if (m.holding) return { ok: false, code: 'OCCUPIED' };
  const props = bodyProps(w, id);
  if (!props) return { ok: false, code: 'NOT_MAGNETIC' };
  if (o.support === 'air') return { ok: false, code: 'FALLING' };
  const base = o.kind === 'filter' ? filterStack(w, id)[0] : id;
  if (w.fall && (w.fall.id === base || w.fall.id === id)) w.fall = null;
  m.holding = base;
  m.offsetM = clamp(offsetMm, -20, 20) / 1000;
  w.objects[base].support = 'magnet01';
  emitF2(w, 'BODY_ATTACHED', Math.abs(offsetMm) > 2 ? 'WARN' : 'INFO', { mm: Math.round(Math.abs(offsetMm) * 10) / 10 });
  return { ok: true };
}

function startFall(w: F102World, id: string, x: number, z: number, vx: number, by: 'magnet' | 'hand') {
  const b = bodyProps(w, id)!;
  const fall: FallingBody = {
    id, x, y: 0, z, vx, vy: 0, vz: 0, massKg: b.massKg, area: b.area, cd: b.cd, radius: b.radius, tumbling: b.tumbling, releasedS: w.timeS, releasedBy: by,
    landed: false, landedOn: null, impactV: 0, beamS: null, dragFrac: 0,
  };
  w.fall = fall;
  w.objects[id].support = 'air';
  const cap = w.motion.capture;
  if (cap) {
    cap.body = id;
    cap.tumbling = b.tumbling;
    cap.mixed = b.mixed;
    cap.filters = b.n;
  }
  if (b.mixed) errF2(w, 'E15', 'FILTER_GEOMETRY_MIXED');
  if (b.tumbling && !b.mixed) errF2(w, 'E16', 'FILTERS_TUMBLE');
}

function releaseFromMagnet(w: F102World) {
  const m = w.magnet;
  const id = m.holding;
  m.releaseAt = null;
  if (!id) return;
  const z = heldBottomZ(w)!;
  m.holding = null;
  // Colgado fuera del polo, el cuerpo se separa girando: sale con una velocidad lateral proporcional al desplazamiento.
  const off = m.offsetM;
  const vx = Math.abs(off) > 0.002 ? off * 18 : 0;
  w.evidence.__releaseOffMm = Math.round(Math.abs(off) * 1e4) / 10;
  w.evidence.__releaseLoose = m.clampTight ? 0 : 1;
  w.evidence.__releaseH = Math.round((z - BEAM_Z) * 1e5) / 1e5;
  if (Math.abs(off) > 0.002) errF2(w, 'E12', 'LATERAL_RELEASE', 'WARN', { mm: Math.round(Math.abs(off) * 1e4) / 10 });
  startFall(w, id, off, z, vx, 'magnet');
  // Suelto por el electroimán (fuera del despacho), el cuerpo entra al balance con su energía potencial y lateral.
  w.energy.externalJ += 0.5 * w.fall!.massKg * vx * vx + w.fall!.massKg * w.params.g * z;
}

function dropByHand(w: F102World, id: string, heightCm: number, offsetMm: number, pushMs: number): F102DispatchResult {
  const o = w.objects[id];
  if (!o) return { ok: false, code: 'NO_OBJECT' };
  if (bodyFalling(w)) return { ok: false, code: 'BUSY' };
  const props = bodyProps(w, id);
  if (!props) return { ok: false, code: 'NOT_DROPPABLE' };
  const base = o.kind === 'filter' ? filterStack(w, id)[0] : id;
  if (w.objects[base].support === 'magnet01') return { ok: false, code: 'USE_MAGNET' };
  const z = clamp(heightCm / 100, 0.05, SENSOR_Z - 0.1);
  // Con el brazo del electroimán sobre el eje, la mano no puede subir el cuerpo por encima de él.
  if (w.magnet.armIn && z > BEAM_Z + w.magnet.h - 0.03) return { ok: false, code: 'ARM_IN_WAY' };
  startFall(w, base, clamp(offsetMm, -200, 200) / 1000, z, clamp(pushMs, -1, 1), 'hand');
  w.evidence.__handDrops = (w.evidence.__handDrops ?? 0) + 1;
  return { ok: true };
}

function readTowerScale(w: F102World, viewDeg: number): F102DispatchResult {
  const p = w.params;
  const res = p.towerScaleResolutionCm;
  const bottom = heldBottomZ(w);
  // El puntero deslizante toca el borde inferior de lo que cuelga del electroimán (o la cara del polo si está vacío).
  const trueCm = ((bottom ?? BEAM_Z + w.magnet.h) - BEAM_Z) * 100;
  const flags: string[] = [];
  let shown = trueCm;
  if (Math.abs(viewDeg) > 20) {
    shown += Math.sign(viewDeg) * 2 * res;
    flags.push('PARALLAX');
    errF2(w, 'E29', 'SCALE_PARALLAX', 'WARN', { inst: 'tower01' });
  }
  if (!w.magnet.clampTight) flags.push('LOOSE_CLAMP');
  const value = quant(shown, res);
  const r = addReading(w, {
    kind: 'length', instrumentId: 'tower01', value, unit: 'cm', resolution: res, uncertainty: p.uB.towerCm, sourceObjectIds: ['magnet01'], qualityFlags: flags, trueValue: trueCm,
    target: w.magnet.holding ? `h:${w.magnet.holding}` : 'magnet',
  });
  if (!flags.length && w.magnet.holding) flagF2(w, 'heightRead');
  emitF2(w, 'LENGTH_READ', 'INFO', { cm: value });
  return { ok: true, id: r.id, value };
}

function readFallTimer(w: F102World): F102DispatchResult {
  const ft = w.fallTimer;
  const p = w.params;
  if (!ft.armed || ft.startS === null) return { ok: false, code: 'TIMER_NOT_STARTED' };
  const b = w.fall;
  if (ft.stopS === null) {
    if (b && !b.landed) return { ok: false, code: 'RUNNING' };
    if (w.photocellCapped) errF2(w, 'E13', 'PHOTOCELL_BLOCKED', 'WARN');
    else emitF2(w, 'BEAM_MISSED', 'WARN');
    ft.armed = false;
    ft.running = false;
    return { ok: false, code: 'NO_STOP' };
  }
  const flags: string[] = [];
  if ((w.evidence.__releaseOffMm ?? 0) > 2) flags.push('LATERAL');
  if (w.evidence.__releaseLoose) {
    flags.push('LOOSE_CLAMP');
    errF2(w, 'E28', 'SUPPORT_LOOSE', 'WARN');
  }
  if (b && b.dragFrac > 0.02) flags.push('DRAG');
  if (b && b.tumbling) flags.push('TUMBLING');
  const j = p.gateTimer.jitterS > 0 ? gaussF2(w) : 0;
  const tTrue = ft.stopS - ft.startS;
  const value = timerIndication(tTrue, p.gateTimer, j) ?? NaN;
  ft.armed = false;
  ft.running = false;
  const id = b?.id ?? 'body';
  const props = b ? bodyProps(w, b.id) : null;
  const r = addReading(w, {
    kind: 'fall', instrumentId: 'photocell01', value, unit: 's', resolution: p.gateTimer.resolutionS, uncertainty: p.uB.fallS,
    sourceObjectIds: [id], qualityFlags: flags, trueValue: tTrue, target: id,
    setup: { hCm: Math.round((w.evidence.__releaseH ?? 0) * 1e5) / 1e3, body: id, filters: props?.n || undefined },
  });
  w.trial++;
  emitF2(w, 'FALL_READ', 'INFO', { s: value });
  return { ok: true, id: r.id, value };
}

function pickUpBody(w: F102World, id: string): F102DispatchResult {
  const o = w.objects[id];
  if (!o) return { ok: false, code: 'NO_OBJECT' };
  if (o.support === 'air') return { ok: false, code: 'FALLING' };
  if (o.support === 'magnet01') {
    // Quitarlo del electroimán con la mano (sin cortar la corriente).
    w.magnet.holding = null;
    w.magnet.releaseAt = null;
  }
  if (w.fall && w.fall.id === id) w.fall = null;
  o.support = 'hand';
  return { ok: true };
}

// ─────────────────────────── E — filtros y sensor de movimiento ───────────────────────────

function stackFilter(w: F102World, filterId: string, onto: string | null, offsetMm: number): F102DispatchResult {
  const f = w.filters[filterId];
  const o = w.objects[filterId];
  if (!f || !o) return { ok: false, code: 'NO_FILTER' };
  if (o.support === 'air' || o.support === 'magnet01') return { ok: false, code: 'IN_USE' };
  if (onto === null) {
    if (w.filters[o.support]) {
      o.support = 'bench';
      o.pose = { ...o.pose, x: o.pose.x + 14, z: 0 };
      f.offCenter = false;
      moveStackAbove(w, filterId);
    }
    return { ok: true };
  }
  const base = w.objects[onto];
  if (!base || !w.filters[onto] || onto === filterId) return { ok: false, code: 'NO_FILTER' };
  if (filterStack(w, onto).includes(filterId)) return { ok: false, code: 'LOOP' };
  // Solo se anida sobre el filtro de más arriba de una pila.
  const stack = filterStack(w, onto);
  const top = stack[stack.length - 1];
  if (w.objects[stack[0]].support === 'air' || w.objects[stack[0]].support === 'magnet01') return { ok: false, code: 'IN_USE' };
  if (FILTERS.some((x) => w.objects[x].support === filterId)) return { ok: false, code: 'HAS_STACK' };
  o.support = top;
  f.offCenter = Math.abs(offsetMm) > 4;
  moveStackAbove(w, stack[0]);
  if (f.offCenter) emitF2(w, 'FILTER_OFF_CENTER', 'WARN', { mm: Math.round(Math.abs(offsetMm)) });
  else rearmErrF2(w, 'E16');
  return { ok: true, value: stack.length + 1 };
}

function calibrateMotion(w: F102World): F102DispatchResult {
  const s = w.motion;
  if (!s.connected) {
    errF2(w, 'E23', 'SENSOR_NOT_CONNECTED', 'WARN', { inst: 'motionSensor01' });
    return { ok: false, code: 'NOT_CONNECTED' };
  }
  // La distancia patrón es la base de la torre (su altura la da la escala); el brazo encima taparía el eco.
  if (w.magnet.armIn) return { ok: false, code: 'OCCLUDED' };
  s.scale = 1;
  s.calibrated = true;
  rearmErrF2(w, 'E27');
  flagF2(w, 'motionCalibrated');
  emitF2(w, 'MOTION_CALIBRATED', 'INFO');
  return { ok: true };
}

function startMotion(w: F102World): F102DispatchResult {
  const s = w.motion;
  if (!s.connected) {
    errF2(w, 'E23', 'SENSOR_NOT_CONNECTED', 'WARN', { inst: 'motionSensor01' });
    return { ok: false, code: 'NOT_CONNECTED' };
  }
  if (s.capture) return { ok: false, code: 'CAPTURING' };
  s.capture = { startedS: w.timeS, nextS: w.timeS, samples: [], clipped: false, occluded: false, lost: 0, configAtStart: w.configVersion, configChanged: false, body: null, tumbling: false, mixed: false, filters: 0, movingSamples: 0 };
  return { ok: true };
}

/** Distancia vertical del sensor a la primera superficie de su cono (m) y qué la produce. */
export function motionTarget(w: F102World): { d: number; what: string } {
  const m = w.magnet;
  if (m.armIn) return { d: SENSOR_Z - (BEAM_Z + m.h + 0.03), what: 'arm' };
  const cone = Math.tan(w.params.motion.coneDeg * DEG);
  const b = w.fall;
  if (b) {
    const top = b.z + (bodyProps(w, b.id)?.heightM ?? 0);
    const d = SENSOR_Z - top;
    if (Math.hypot(b.x, b.y) <= cone * d + b.radius) return { d, what: b.id };
  }
  return { d: SENSOR_Z - PAD_TOP, what: 'pad' };
}

function sampleMotion(w: F102World) {
  const s = w.motion;
  const c = s.capture;
  if (!c || w.timeS + 1e-9 < c.nextS) return;
  c.nextS = Math.round((c.nextS + 1 / s.rateHz) * 1e6) / 1e6;
  const tg = motionTarget(w);
  const noise = w.params.motion.noiseM > 0 ? gaussF2(w) : 0;
  const ind = motionIndication(tg.d, s, w.params.motion, noise);
  if (tg.what === 'arm') c.occluded = true;
  if (ind.clipped) c.clipped = true;
  if (bodyFalling(w)) {
    if (tg.what === w.fall!.id) c.movingSamples++;
    else c.lost++;
  }
  if (ind.mm === null) return;
  c.samples.push([Math.round((w.timeS - c.startedS) * 1e4) / 1e4, ind.mm]);
  if (c.samples.length > 600) c.samples.shift();
}

function stopMotion(w: F102World): F102DispatchResult {
  const s = w.motion;
  const c = s.capture;
  const p = w.params;
  if (!c) return { ok: false, code: 'NOT_CAPTURING' };
  s.capture = null;
  if (c.samples.length < 3) return { ok: false, code: 'TOO_SHORT' };
  const flags: string[] = [];
  if (c.clipped) {
    flags.push('CLIPPED');
    errF2(w, 'E22', 'SENSOR_CLIPPED', 'WARN', { m: s.range === 'near' ? p.motion.nearMaxM : p.motion.farMaxM });
  }
  if (c.body && c.movingSamples < 8) {
    flags.push('LOW_RATE');
    if (s.rateHz === 10) errF2(w, 'E24', 'SAMPLING_TOO_LOW');
  }
  if (c.occluded) {
    flags.push('OCCLUDED');
    errF2(w, 'E25', 'LINE_OF_SIGHT_BLOCKED');
  }
  if (Math.abs(s.aimDeg) > 3) {
    flags.push('TILTED');
    errF2(w, 'E26', 'INSTRUMENT_TILTED', 'WARN', { deg: Math.round(Math.abs(s.aimDeg)) });
  }
  if (!s.calibrated) {
    flags.push('UNCALIBRATED');
    errF2(w, 'E27', 'SENSOR_UNCALIBRATED');
  }
  if (c.configChanged) {
    flags.push('CONFIG_CHANGED');
    errF2(w, 'E32', 'CONFIG_CHANGED_MIDRUN');
  }
  if (c.tumbling) flags.push('TUMBLING');
  if (c.mixed) flags.push('MIXED');
  if (!c.body) flags.push('NO_BODY');
  const r = addReading(w, {
    kind: 'motion', instrumentId: 'motionSensor01', value: c.samples.length, unit: 'mm', resolution: p.motion.resolutionMm / 1000, uncertainty: p.uB.motionMm,
    sourceObjectIds: ['motionSensor01', ...(c.body ? [c.body] : [])], qualityFlags: flags, trueValue: c.samples.length, target: c.body ?? 'none', samples: c.samples,
    setup: { body: c.body ?? undefined, filters: c.filters || undefined }, configVersion: c.configAtStart,
  });
  w.trial++;
  emitF2(w, 'MOTION_READ', 'INFO', { n: c.samples.length });
  return { ok: true, id: r.id, value: c.samples.length };
}

// ─────────────────────────── Cierre y bloqueos ───────────────────────────

function closeStation(w: F102World): F102DispatchResult {
  if (w.launcher.latched) return { ok: false, code: 'SPRING_LOADED' };
  if (cartMoving(w)) return { ok: false, code: 'CART_MOVING' };
  if (w.cart.s > 0.45) return { ok: false, code: 'PARK_CART' };
  if (w.string.attached || w.objects.hanger01.support === 'string') return { ok: false, code: 'STRING_ON' };
  if (w.tape.running || w.gateTimer.running || w.motion.capture) return { ok: false, code: 'CAPTURING' };
  if (w.magnet.on || w.magnet.holding) return { ok: false, code: 'MAGNET_ON' };
  if (bodyFalling(w)) return { ok: false, code: 'BUSY' };
  w.cart.held = true;
  w.cart.v = 0;
  w.tape.attached = false;
  flagF2(w, 'stationClosed');
  emitF2(w, 'STATION_CLOSED', 'INFO');
  return { ok: true };
}

function acknowledge(w: F102World): F102DispatchResult {
  const b = w.safety.block;
  if (!b) return { ok: true };
  if (b.code === 'MASS_FALL' && (w.objects.hanger01.support === 'floor' || !w.cart.held)) return { ok: false, code: 'SECURE_FIRST' };
  w.safety.block = null;
  emitF2(w, 'STATION_RESET', 'INFO', { code: b.code });
  return { ok: true };
}

// ─────────────────────────── Paso: carril ───────────────────────────

function stepTrack(w: F102World, dt: number) {
  const c = w.cart;
  const st = w.string;
  const p = w.params;
  const n = p.subSteps;
  const H = dt / n;
  const gt = w.gateTimer;
  const hung = hanging(w);
  const mh = hung ? hangMassKg(w) : 0;
  if (c.held) {
    c.v = 0;
    if (hung) {
      st.tensionN = st.landed ? 0 : mh * p.g;
      if (!st.landed && !st.taut) syncHang(w);
    }
    for (const g of GATES) updateGate(w.gates[g], c.s, c.s, w.timeS - dt, dt, flagEffectiveW(w), p.gateTimer, gt.running ? gt.startedS : null);
    tapeDots(w, c.s, c.s, w.timeS - dt, dt);
    return;
  }
  const realistic = p.scientificMode === 'REALISTIC';
  const sin = Math.sin(w.track.angleDeg * DEG);
  const rollN = realistic ? p.rollingN : 0;
  const tapeN = w.tape.attached ? (w.tape.slack ? p.tapeSlackDragN : realistic ? p.tapeDragN : 0) : 0;
  const wheelK = st.onWheel ? 1 : Math.exp(-0.3 * (Math.PI / 4));
  const pulleyN = hung && realistic ? p.pulleyFrictionN + (st.onWheel ? 0 : 0.2 * mh * p.g) : 0;
  const t0 = w.timeS - dt;
  for (let i = 0; i < n; i++) {
    // Contacto con el émbolo (resorte rígido): micro-pasos para que el impulso del lanzador no dependa del paso.
    const springNear = !w.launcher.latched && c.s - HALF + Math.min(0, c.v) * H < 0;
    const micro = springNear ? 40 : 1;
    const h = H / micro;
    for (let j = 0; j < micro; j++) {
      const s0 = c.s;
      const ti = t0 + i * H + j * h;
      const rear = c.s - HALF;
      // Fuerzas sobre el carro sin el cordel (N, + hacia la polea).
      let F = c.massKg * p.g * sin - p.cartDragNsPerM * c.v;
      if (!w.launcher.latched && rear < 0) F += p.launcherKNPerM * -rear;
      const coulomb = rollN + tapeN + (st.taut ? pulleyN : 0);
      // Cordel: tenso si la masa ya está a la profundidad que fija la geometría.
      const dTaut = tautDepth(w);
      let taut = hung && !st.landed && st.depth >= dTaut - 1e-7;
      let M = c.massKg;
      let drive = F;
      if (taut) {
        M = c.massKg + mh + p.pulleyEqKg;
        drive = F + wheelK * mh * p.g;
        // El cordel solo tira: si el carro «adelantara» a la masa, se afloja.
        const aTry = (drive - Math.sign(c.v || drive) * coulomb) / M;
        if (aTry > p.g + 1e-9) taut = false;
      }
      if (!taut) {
        M = c.massKg;
        drive = F;
      }
      // Rozamiento de Coulomb (rodadura, cinta, polea): estático si está quieto y la fuerza no lo vence.
      let a: number;
      if (Math.abs(c.v) < 1e-4 && Math.abs(drive) <= coulomb) {
        a = 0;
        c.v = 0;
      } else {
        const dir = Math.abs(c.v) >= 1e-4 ? Math.sign(c.v) : Math.sign(drive);
        a = (drive - dir * coulomb) / M;
      }
      const v0 = c.v;
      c.s += c.v * h + 0.5 * a * h * h;
      // Verlet de velocidad para el resorte (la única fuerza que depende de la posición).
      const springF = (r: number) => (!w.launcher.latched && r < 0 ? p.launcherKNPerM * -r : 0);
      const dA = a === 0 && Math.abs(drive) <= coulomb ? 0 : (springF(c.s - HALF) - springF(rear)) / M;
      c.v += (a + 0.5 * dA) * h;
      // El rozamiento frena pero no invierte el movimiento dentro del subpaso.
      if (coulomb > 0 && v0 !== 0 && c.v * v0 < 0 && Math.abs(drive) <= coulomb) c.v = 0;
      w.energy.dissipatedJ += (p.cartDragNsPerM * (0.5 * (v0 + c.v)) ** 2 + coulomb * Math.abs(0.5 * (v0 + c.v))) * h;
      if (taut) {
        st.taut = true;
        st.depth = tautDepth(w);
        st.vd = c.v;
        st.tensionN = Math.max(0, mh * (p.g - a));
      } else if (hung && !st.landed) {
        if (st.taut) {
          // Al aflojarse, la polea deja de girar con el cordel: su energía se pierde en el eje.
          w.energy.dissipatedJ += 0.5 * p.pulleyEqKg * v0 * v0;
        }
        st.taut = false;
        st.tensionN = 0;
        st.depth += st.vd * h + 0.5 * p.g * h * h;
        st.vd += p.g * h;
        const d = tautDepth(w);
        if (st.depth >= d) {
          // Tirón: el cordel se tensa de golpe; se conserva el momento a lo largo del cordel (choque inelástico).
          const Ma = c.massKg + mh + p.pulleyEqKg;
          const vNew = (c.massKg * c.v + mh * st.vd) / Ma;
          w.energy.dissipatedJ += 0.5 * c.massKg * c.v * c.v + 0.5 * mh * st.vd * st.vd - 0.5 * Ma * vNew * vNew;
          c.v = vNew;
          st.vd = vNew;
          st.depth = d;
          st.taut = true;
        }
      }
      // Suelo: la masa se apoya y el cordel deja de tirar (E07).
      if (hung && !st.landed && st.depth >= p.floorDepthM) {
        w.energy.dissipatedJ += 0.5 * mh * st.vd * st.vd - mh * p.g * (st.depth - p.floorDepthM);
        if (st.taut) w.energy.dissipatedJ += 0.5 * p.pulleyEqKg * c.v * c.v;
        st.depth = p.floorDepthM;
        st.vd = 0;
        st.landed = true;
        st.taut = false;
        st.tensionN = 0;
        emitF2(w, 'MASS_LANDED', 'INFO');
        if (gt.running && gt.landedS === null) gt.landedS = ti + h;
        if (w.tape.running && w.tape.landedS === null) w.tape.landedS = ti + h;
      } else if (hung && st.landed && tautDepth(w) < p.floorDepthM - 1e-6) {
        st.landed = false;
        st.taut = true;
        st.depth = tautDepth(w);
      }
      // Tope final (CCD: la posición nunca pasa la cara del tope).
      if (c.s > CART_END_S) {
        const vi = c.v;
        const e = p.endStopRestitution;
        c.s = CART_END_S - (c.s - CART_END_S) * e;
        const ke0 = 0.5 * c.massKg * vi * vi;
        c.v = Math.abs(vi) < 0.02 ? 0 : -e * vi;
        w.energy.dissipatedJ += ke0 - 0.5 * c.massKg * c.v * c.v;
        if (st.taut) {
          w.energy.dissipatedJ += 0.5 * p.pulleyEqKg * vi * vi;
          st.taut = false;
        }
        if (Math.abs(vi) > 0.02) {
          emitF2(w, 'CART_IMPACT', Math.abs(vi) > p.flagBendMs ? 'ALERT' : 'INFO', { v: Math.round(Math.abs(vi) * 100) / 100 });
          if (gt.running && gt.impactS === null) gt.impactS = ti + h;
          if (w.tape.running && w.tape.impactS === null) w.tape.impactS = ti + h;
        }
        if (Math.abs(vi) > p.flagBendMs && !c.flagBent) {
          c.flagBent = true;
          flagF2(w, 'flagBent');
          emitF2(w, 'FLAG_BENT', 'ALERT');
        }
      }
      // Cola del carro contra el émbolo retenido o contra el fondo de su carrera.
      const minRear = w.launcher.latched ? -w.launcher.notchCm / 100 : -GEOF102.launcher.maxM;
      if (c.s - HALF < minRear) {
        const vi = c.v;
        c.s = minRear + HALF;
        c.v = vi < 0 ? (Math.abs(vi) < 0.02 ? 0 : -0.3 * vi) : vi;
        w.energy.dissipatedJ += 0.5 * c.massKg * (vi * vi - c.v * c.v);
      }
      for (const g of GATES) updateGate(w.gates[g], s0, c.s, ti, h, flagEffectiveW(w), p.gateTimer, gt.running && gt.connected[g] ? gt.startedS : null);
      if (gt.running) {
        gt.sMin = Math.min(gt.sMin, c.s);
        gt.sMax = Math.max(gt.sMax, c.s);
      }
      tapeDots(w, s0, c.s, ti, h);
      c.wheelRad += (c.s - s0) / (GEOF102.cart.wheelR / 100);
      if (st.taut) st.wheelRad += (c.s - s0) / (GEOF102.pulley.r / 100);
    }
  }
  if (Math.abs(c.v) < 1e-5) c.v = 0;
}

/** Puntos del registrador en el intervalo [ti, ti + h]: posición interpolada en el instante exacto de cada chispa. */
function tapeDots(w: F102World, s0: number, s1: number, ti: number, h: number) {
  const t = w.tape;
  if (!t.running || !t.attached) return;
  while (ti + h + 1e-9 >= t.nextS) {
    const f = h > 0 ? clamp((t.nextS - ti) / h, 0, 1) : 1;
    t.dots.push([Math.round((t.nextS - t.startedS) * 1e6) / 1e6, s0 + (s1 - s0) * f]);
    t.nextS = Math.round((t.nextS + 1 / w.params.tapeRateHz) * 1e6) / 1e6;
    if (t.dots.length > 400) {
      t.running = false;
      break;
    }
  }
}

// ─────────────────────────── Paso: torre ───────────────────────────

function stepTower(w: F102World, dt: number) {
  const m = w.magnet;
  const p = w.params;
  // Prensa floja: el electroimán con carga se desliza por la columna.
  if (!m.clampTight && m.holding && m.h > 0.5) m.h = Math.max(0.5, Math.round((m.h - 0.006 * dt) * 1e7) / 1e7);
  if (m.releaseAt !== null && w.timeS + 1e-9 >= m.releaseAt) {
    const at = m.releaseAt;
    releaseFromMagnet(w);
    // La suelta ocurre dentro del paso: el cuerpo cae desde ese instante, no desde el final del paso.
    if (w.fall) w.fall.releasedS = Math.max(at, w.timeS - dt);
  }
  const b = w.fall;
  if (!b || b.landed) return;
  const n = p.subSteps;
  const span = Math.min(dt, w.timeS - b.releasedS);
  if (span <= 0) return;
  const h = span / n;
  const realistic = p.scientificMode === 'REALISTIC';
  const isFilter = !!w.filters[b.id];
  const dragOn = isFilter || realistic || w.scenarios.includes(SF2.DRAG_SPHERE);
  const wind = w.scenarios.includes(SF2.SIDE_WIND) ? p.windMs : 0;
  const t0 = w.timeS - span;
  const padPose = w.objects.pad01?.pose;
  const towerX = GEOF102.tower.x;
  const towerY = GEOF102.tower.y;
  for (let i = 0; i < n; i++) {
    const ti = t0 + i * h;
    // Corriente de aire de una ventana alta (S08): solo actúa en el tramo superior de la torre.
    const vrx = b.vx - (b.z > BEAM_Z + 0.95 ? wind : 0);
    const vry = b.vy;
    const vrz = b.vz;
    const sp = Math.hypot(vrx, vry, vrz);
    let cd = b.cd;
    let ax = 0;
    if (b.tumbling) {
      // Tumbos: el área frontal cambia con el giro; la pila se desvía de lado.
      const ph = (ti - b.releasedS) * 2 * Math.PI * 2.5;
      cd *= 0.65 + 0.3 * Math.sin(ph);
      ax += 0.6 * Math.cos(ph);
    }
    const k = dragOn ? (0.5 * p.airDensity * cd * b.area) / b.massKg : 0;
    ax += -k * sp * vrx;
    const ay = -k * sp * vry;
    const az = -p.g - k * sp * vrz;
    if (dragOn) b.dragFrac = Math.max(b.dragFrac, (k * sp * sp) / p.g);
    const z0 = b.z;
    const vz0 = b.vz;
    b.x += b.vx * h + 0.5 * ax * h * h;
    b.y += b.vy * h + 0.5 * ay * h * h;
    b.z += b.vz * h + 0.5 * az * h * h;
    b.vx += ax * h;
    b.vy += ay * h;
    b.vz += az * h;
    w.energy.dissipatedJ += b.massKg * k * sp * sp * sp * h;
    // Haz de la fotocelda: instante exacto del cruce del borde inferior (CCD sobre la parábola del subpaso).
    if (b.beamS === null && z0 > BEAM_Z && b.z <= BEAM_Z) {
      const tau = crossTau(z0 - BEAM_Z, vz0, az, h);
      const inBeam = Math.abs(b.y) < 0.01 + b.radius && Math.abs(b.x) < GEOF102.tower.beamHalfCm / 100;
      if (inBeam) {
        b.beamS = ti + tau;
        if (!w.photocellCapped && w.fallTimer.running && w.fallTimer.stopS === null) {
          w.fallTimer.stopS = b.beamS;
          w.fallTimer.running = false;
        }
      }
    }
    // Contacto: almohadilla (si cae dentro de ella) o base de la torre (CCD).
    const wx = towerX + b.x * 100;
    const wy = towerY + b.y * 100;
    const onPad = !!padPose && Math.hypot(wx - padPose.x, wy - padPose.y) <= GEOF102.tower.padR && w.objects.pad01.support !== 'hand';
    const floor = onPad ? PAD_TOP : BASE_TOP;
    if (b.z <= floor) {
      const tau = crossTau(z0 - floor, vz0, az, h);
      const vImp = Math.abs(vz0 + az * tau);
      // Energía en el instante del contacto (no al final del subpaso, que ya atravesó el apoyo).
      const vxc = b.vx - ax * (h - tau);
      const vyc = b.vy - ay * (h - tau);
      w.energy.dissipatedJ += 0.5 * b.massKg * (vxc * vxc + vyc * vyc + vImp * vImp) + b.massKg * p.g * floor;
      w.energy.dissipatedJ -= b.massKg * k * sp * sp * sp * (h - tau);
      b.z = floor;
      b.impactV = vImp;
      b.vx = 0;
      b.vy = 0;
      b.vz = 0;
      b.landed = true;
      b.landedOn = onPad ? 'pad' : 'bench';
      const o = w.objects[b.id];
      o.support = onPad ? 'pad01' : 'base';
      o.pose = { x: wx, y: wy, z: floor * 100, rotationRad: 0 };
      if (isFilter) moveStackAbove(w, b.id);
      if (w.fallTimer.running && w.fallTimer.stopS === null) w.fallTimer.running = false;
      if (!onPad && !isFilter) errF2(w, 'E14', 'BALL_HIT_BENCH', 'ALERT', { v: Math.round(vImp * 10) / 10 });
      else emitF2(w, 'BODY_LANDED', 'INFO', { v: Math.round(vImp * 100) / 100 });
      break;
    }
  }
}

/** Instante τ ∈ [0, h] en que z(τ) = z0 + v τ + ½ a τ² llega a 0 (z0 ≥ 0, cayendo). */
function crossTau(z0: number, v: number, a: number, h: number): number {
  if (Math.abs(a) < 1e-12) return v < 0 ? clamp(-z0 / v, 0, h) : h;
  const disc = v * v - 2 * a * z0;
  if (disc < 0) return h;
  const r1 = (-v - Math.sqrt(disc)) / a;
  const r2 = (-v + Math.sqrt(disc)) / a;
  const cands = [r1, r2].filter((r) => r >= -1e-12 && r <= h + 1e-12);
  return cands.length ? clamp(Math.min(...cands), 0, h) : h;
}

// ─────────────────────────── Paso de simulación ───────────────────────────

export function stepF102World(w: F102World): void {
  const p = w.params;
  const dt = p.dtS;
  w.timeS = Math.round((w.timeS + dt) * 1e6) / 1e6;
  w.tick++;
  stepTrack(w, dt);
  stepTower(w, dt);
  sampleMotion(w);
}

export function runF102For(w: F102World, seconds: number) {
  const n = Math.round(seconds / w.params.dtS);
  for (let i = 0; i < n; i++) stepF102World(w);
}

export function f102Summary(w: F102World) {
  return {
    s: Math.round(w.cart.s * 1e6) / 1e6,
    v: Math.round(w.cart.v * 1e6) / 1e6,
    d: Math.round(w.string.depth * 1e6) / 1e6,
    z: w.fall ? Math.round(w.fall.z * 1e6) / 1e6 : -1,
    readings: w.readingOrder.length,
    cfg: w.configVersion,
  };
}
