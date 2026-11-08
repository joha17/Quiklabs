/**
 * Mundo de F101 — metrología experimental y suma vectorial: paso fijo determinista de 0,05 s (§6).
 *
 * - Calibrador y micrómetro: modelos instrumentales compartidos (`instruments/`). La pieza entre las caras tiene su
 *   geometría real (ovalización según el giro, extensión proyectada si está oblicua, rigidez del material); el gesto
 *   solo pide una posición del cursor o un ángulo de tambor y el contacto convierte el exceso en fuerza.
 * - Balanza de 2 kg / 0,01 g: nivel, tara por sesión con lo que había en el platillo, estabilidad (ruido mayor con la
 *   base desnivelada) y carga real (cápsula, piezas mojadas).
 * - Probeta de 100 mL: nivel = (agua + piezas sumergidas)/sección; la altura de suelta decide si la pieza entra
 *   suave, salpica (agua a la mesada, nivel oscilante, espuma) o rompe el vidrio (fuga que sigue, datos posteriores
 *   marcados). La lectura depende de la altura real del ojo y de la línea de vista.
 * - Mesa de fuerzas: el anillo es un cuerpo con masa (anillo + masas colgantes) en el plano, tirado por hilos cuya
 *   dirección sale de la GEOMETRÍA (anillo → polea), con tensión m·g (reducida si el hilo roza el borde), fricción de
 *   poleas y anillo, resorte del dinamómetro y perno central como restricción unilateral. 10 subpasos de 5 ms.
 *   El sensor 2D del perno mide la fuerza que el anillo le aplica: la resultante cuando el perno lo retiene.
 */
import type { CaliperDim, F101Command, F101DispatchResult, PpeItem } from './commands';
import type { F101Object, F101Params, F101World, MassPiece, Pose, ReadingF, SolidPart } from './types';
import { hashRandom } from '../core/rng';
import { bumpF, emitF, errF, flagF, gaussF, rearmErrF } from './events';
import { GEOF101, GRADCYL_AREA } from './geometry';
import { newAnalyticalBalance, stepAnalyticalBalance, balanceIndication } from '../instruments/analytical-balance';
import { caliperReadingMm, newCaliper, projectedExtentMm, releaseCaliperThumb, setCaliperTarget } from '../instruments/vernier-caliper';
import { micrometerReadingMm, newMicrometer, turnMicrometer } from '../instruments/micrometer';
import { cylinderVolume, sphereVolume } from '../models/f101/equations';
import { quantize } from '../models/f101/uncertainty';

export { emitF, latchF, rearmF, bumpF, flagF, errF } from './events';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const sc = (w: F101World, s: string) => w.scenarios.includes(s);
const DEG = Math.PI / 180;

/** Escenarios docentes (§10). */
export const SF = {
  CALIPER_ZERO: 'F101-S01_caliper_zero',
  RIGID_RATCHET: 'F101-S02_rigid_ratchet',
  BALANCE_UNLEVEL: 'F101-S03_balance_unlevel',
  RING_FRICTION: 'F101-S04_ring_friction',
  FOAM: 'F101-S05_foam',
  ELEVATED_CAMERA: 'F101-S06_elevated_camera',
  PULLEY_FRICTION: 'F101-S07_pulley_friction',
  OBLIQUE_FORCES: 'F101-S08_oblique_forces',
  SENSOR_SATURATED: 'F101-S09_sensor_saturated',
  UNCERTIFIED_STANDARD: 'F101-S10_uncertified_standard',
  SOFT_BODY: 'F101-S11_soft_body',
  NO_HINTS: 'F101-S12_no_hints',
} as const;

export interface F101WorldSpec {
  objects: F101Object[];
  scenarios: string[];
  mode: string;
}

export const PULLEYS = ['pulley1', 'pulley2', 'pulley3'] as const;
export const HANGERS = ['hanger1', 'hanger2', 'hanger3'] as const;
export const SLOT_MASSES: Array<[string, number]> = [
  ['s200a', 200], ['s200b', 200], ['s100a', 100], ['s100b', 100], ['s100c', 100], ['s50a', 50], ['s50b', 50], ['s50c', 50], ['s20a', 20], ['s20b', 20], ['s20c', 20],
];
export const PARTS = ['gaugeBlock01', 'metalCyl01', 'steelBall01', 'massStd01'] as const;

/** Holgura del anillo alrededor del perno y recorrido máximo sin perno (m). */
const RING_GAP_M = GEOF101.forceTable.ringGapCm / 100;
const RING_LIMIT_M = GEOF101.forceTable.ringLimitCm / 100;
const TABLE_R_M = GEOF101.forceTable.r / 100;
/** Fricción del hilo fuera de la rueda contra el borde (cabrestante, ≈ 90°): T = m g e^(−μ π/2). */
const ROPE_RIM_FACTOR = Math.exp(-0.3 * (Math.PI / 2));
/** Amortiguamiento viscoso del péndulo de masas colgantes y del aire (N·s/m). */
const RING_DAMPING = 6;
/** Velocidad por debajo de la cual el anillo se considera quieto (m/s). */
const STILL_V = 0.0015;

// ─────────────────────────── Creación ───────────────────────────

export function createF101World(spec: F101WorldSpec, seed: number, params: F101Params): F101World {
  const has = (s: string) => spec.scenarios.includes(s);
  const objects: Record<string, F101Object> = {};
  for (const o of spec.objects) objects[o.id] = { ...o, pose: { ...o.pose } };
  const h = (k: string) => hashRandom(seed, k) - 0.5;
  const soft = has(SF.SOFT_BODY);
  const dCyl = params.cylinderDiameterMm + h('cylD') * 0.06;
  const hCyl = params.cylinderHeightMm + h('cylH') * 0.1;
  const dBall = params.ballDiameterMm + h('ball') * 0.004;
  const rhoCyl = soft ? 1.14 : 2.7;
  const parts: Record<string, SolidPart> = {
    gaugeBlock01: { id: 'gaugeBlock01', shape: 'block', material: 'steel', dMm: params.gaugeBlockMm, hMm: 9, ovalMm: 0, massG: 49.5, stiffNPerMm: 4e4, wetG: 0, certified: { nominal: params.gaugeBlockMm, unit: 'mm', status: params.calibration.gaugeBlock01 ?? 'verified' } },
    metalCyl01: { id: 'metalCyl01', shape: 'cylinder', material: soft ? 'nylon' : 'aluminum', dMm: dCyl, hMm: hCyl, ovalMm: 0.012, massG: (rhoCyl * cylinderVolume(dCyl, hCyl)) / 1000, stiffNPerMm: soft ? 55 : 2e4, wetG: 0 },
    steelBall01: { id: 'steelBall01', shape: 'sphere', material: 'steel', dMm: dBall, hMm: dBall, ovalMm: 0, massG: (7.85 * sphereVolume(dBall)) / 1000, stiffNPerMm: 3e4, wetG: 0 },
    massStd01: {
      id: 'massStd01', shape: 'block', material: 'brass', dMm: 26, hMm: 26, ovalMm: 0, stiffNPerMm: 3e4, wetG: 0,
      massG: params.standardMassG + (has(SF.UNCERTIFIED_STANDARD) ? 0.04 : 0),
      certified: { nominal: params.standardMassG, unit: 'g', status: has(SF.UNCERTIFIED_STANDARD) ? 'pending' : (params.calibration.massStd01 ?? 'verified') },
    },
  };
  const masses: Record<string, MassPiece> = {};
  for (const id of HANGERS) masses[id] = { id, nominalG: params.hangerMassG, trueG: params.hangerMassG * (1 + h(id) * 2 * params.uB.massRel) };
  for (const [id, g] of SLOT_MASSES) masses[id] = { id, nominalG: g, trueG: g * (1 + h(id) * 2 * params.uB.massRel) };
  const pulleys: F101World['table']['pulleys'] = {};
  const startAngles = [0, 120, 240];
  PULLEYS.forEach((id, i) => {
    pulleys[id] = { angleDeg: startAngles[i], seated: true, threaded: true, looseOffsetDeg: (hashRandom(seed, `loose:${id}`) > 0.5 ? 1 : -1) * 4 };
  });
  const water0 = Math.round((params.gradCylInitialMl + h('water') * 4) * 10) / 10;
  const w: F101World = {
    timeS: 0, tick: 0, seed, rng: seed >>> 0 || 1, params, mode: spec.mode, objects, parts, masses,
    caliper: newCaliper(has(SF.CALIPER_ZERO) ? 0.06 : 0),
    micrometer: newMicrometer(0, 0.01),
    balance: {
      ...newAnalyticalBalance({ levelErrorDeg: has(SF.BALANCE_UNLEVEL) ? 2.0 : 0, doorsOpen: false }),
      powered: false, panIds: [], tareSession: 0, tareLoadG: 0, tareKey: '',
    },
    gradCyl: { waterMl: water0, foamMl: has(SF.FOAM) ? 0.8 : 0, unsettledUntil: 0, cracked: false, leakedMl: 0, parts: [], serial: 1 },
    table: {
      ring: { x: 0, y: 0, vx: 0, vy: 0 }, pinIn: true, touching: false, pinForce: { x: 0, y: 0 }, applied: { x: 0, y: 0 },
      levelDeg: 1.5, levelDirDeg: hashRandom(seed, 'lvl') * 360, pulleys,
      dyn: { onRim: false, angleDeg: 300, tensionMm: 0, alignDeg: 6, zeroOffsetN: 0.12, zeroed: false, zeroedLoaded: false },
      sensor: { connected: false, rangeN: has(SF.SENSOR_SATURATED) ? 2 : 10, rateHz: 5, scale: 1.06, calibrated: false, capture: null },
      stillS: 0, stuck: false, tapUntil: 0, limitHit: false, configVersion: 1, peakSpeed: 0,
    },
    water: { benchMl: 0, discardedMl: 0 },
    trial: 1,
    readings: {}, readingOrder: [],
    safety: { ppe: { coat: false, goggles: false, shoes: false, hair: false }, block: null, stoppedByTeacher: false },
    events: [], evidence: {}, scenarios: [...spec.scenarios], ppe: false,
    initialTotals: { waterMl: 0, metalG: 0, massesG: 0 },
  };
  if (has(SF.RIGID_RATCHET)) w.params = { ...params, micrometer: { ...params.micrometer, ratchetN: params.micrometer.ratchetN * 3 } };
  w.initialTotals = { waterMl: waterTotal(w), metalG: partsMassG(w), massesG: massesTotal(w) };
  return w;
}

// ─────────────────────────── Consultas ───────────────────────────

const PART_WET_G: Record<string, number> = { metalCyl01: 0.15, steelBall01: 0.06, gaugeBlock01: 0.05, massStd01: 0.1 };

export function waterTotal(w: F101World): number {
  let ml = w.gradCyl.waterMl + w.water.benchMl + w.water.discardedMl;
  for (const p of Object.values(w.parts)) ml += p.wetG;
  return ml;
}
export const partsMassG = (w: F101World) => Object.values(w.parts).reduce((s, p) => s + p.massG, 0);
export const massesTotal = (w: F101World) => Object.values(w.masses).reduce((s, m) => s + m.trueG, 0);

export function conservedTotals(w: F101World): Record<string, number> {
  return { waterMl: waterTotal(w), metalG: partsMassG(w), massesG: massesTotal(w) };
}

/** Volumen de una pieza (mL). */
export function partVolumeMl(w: F101World, id: string): number {
  const p = w.parts[id];
  if (!p) return 0;
  if (p.shape === 'cylinder') return cylinderVolume(p.dMm, p.hMm) / 1000;
  if (p.shape === 'sphere') return sphereVolume(p.dMm) / 1000;
  return (p.dMm * p.hMm * 35) / 1000;
}

/** Lo que hay en la probeta por debajo del menisco (mL) y la altura del menisco (cm). */
export const cylinderContentMl = (w: F101World) => w.gradCyl.waterMl + w.gradCyl.parts.reduce((s, id) => s + partVolumeMl(w, id), 0);
export const cylinderLevelCm = (w: F101World) => GEOF101.gradCyl.floor + cylinderContentMl(w) / GRADCYL_AREA;

/** Extensión real de la pieza a lo largo de las caras (mm), con la ovalización del giro. */
export function partExtentMm(p: SolidPart, dim: CaliperDim, spinDeg: number): number {
  if (p.shape === 'block') return dim === 'L' ? p.dMm : p.hMm;
  if (p.shape === 'sphere') return p.dMm + p.ovalMm * Math.cos(2 * spinDeg * DEG);
  if (dim === 'h') return p.hMm;
  return p.dMm + p.ovalMm * Math.cos(2 * spinDeg * DEG);
}
function partCrossMm(p: SolidPart, dim: CaliperDim): number {
  if (p.shape === 'sphere') return p.dMm;
  if (p.shape === 'block') return dim === 'L' ? p.hMm : p.dMm;
  return dim === 'h' ? p.dMm : p.hMm;
}

/** Masa física de un objeto (g), con el agua adherida. */
export function objectMassG(w: F101World, id: string): number {
  if (w.parts[id]) return w.parts[id].massG + w.parts[id].wetG;
  if (w.masses[id]) return w.masses[id].trueG;
  if (id === 'dish01') return 24.6;
  return 0;
}

/** Objetos que apoyan sobre otro (recursivo): la cápsula lleva sus piezas al platillo. */
function loadOn(w: F101World, support: string): string[] {
  const out: string[] = [];
  for (const o of Object.values(w.objects)) if (o.support === support) out.push(o.id, ...loadOn(w, o.id));
  return out;
}
export const panIds = (w: F101World) => loadOn(w, 'pan');
export const panLoadG = (w: F101World) => panIds(w).reduce((s, id) => s + objectMassG(w, id), 0);
export const balanceDisplayG = (w: F101World) => (w.balance.powered ? quantize(w.balance.shownG, w.params.balance.resolutionG) : NaN);

/** Masa colgada de una polea (g, real y rotulada). */
export function hangingOn(w: F101World, pulleyId: string): { trueG: number; nominalG: number; hangerId: string | null } {
  const hanger = HANGERS.find((h) => w.objects[h]?.support === pulleyId) ?? null;
  if (!hanger) return { trueG: 0, nominalG: 0, hangerId: null };
  let t = w.masses[hanger].trueG;
  let n = w.masses[hanger].nominalG;
  for (const [id] of SLOT_MASSES) {
    if (w.objects[id]?.support === hanger) {
      t += w.masses[id].trueG;
      n += w.masses[id].nominalG;
    }
  }
  return { trueG: t, nominalG: n, hangerId: hanger };
}

/** Dirección real (°) del hilo en la polea: la prensa floja gira bajo la carga. */
const pulleyTrueAngle = (w: F101World, id: string) => {
  const p = w.table.pulleys[id];
  return p.angleDeg + (p.seated ? 0 : p.looseOffsetDeg);
};

export interface StringForce {
  source: string;
  T: number;
  ux: number;
  uy: number;
}

/** Fuerzas de los hilos y del dinamómetro sobre el anillo en la posición r (m, N). */
export function stringForces(w: F101World, rx = w.table.ring.x, ry = w.table.ring.y): StringForce[] {
  const g = w.params.g;
  const out: StringForce[] = [];
  const R = TABLE_R_M + GEOF101.forceTable.pulleyOut / 100;
  for (const id of PULLEYS) {
    const m = hangingOn(w, id);
    if (!m.hangerId) continue;
    const a = pulleyTrueAngle(w, id) * DEG;
    const dx = R * Math.cos(a) - rx;
    const dy = R * Math.sin(a) - ry;
    const L = Math.hypot(dx, dy) || 1;
    const T = (m.trueG / 1000) * g * (w.table.pulleys[id].threaded ? 1 : ROPE_RIM_FACTOR);
    out.push({ source: id, T, ux: dx / L, uy: dy / L });
  }
  const d = w.table.dyn;
  if (d.onRim) {
    const a = d.angleDeg * DEG;
    const Ax = (TABLE_R_M + 0.2) * Math.cos(a);
    const Ay = (TABLE_R_M + 0.2) * Math.sin(a);
    const dx = Ax - rx;
    const dy = Ay - ry;
    const L = Math.hypot(dx, dy) || 1;
    const extMm = d.tensionMm + (L - Math.hypot(Ax, Ay)) * 1000;
    const T = Math.max(0, w.params.dynStiffNPerMm * extMm);
    out.push({ source: 'dynamometer01', T, ux: dx / L, uy: dy / L });
  }
  return out;
}

export function dynamometerForceN(w: F101World): number {
  return stringForces(w).find((f) => f.source === 'dynamometer01')?.T ?? 0;
}

/** Peso efectivo que mueve el anillo (kg): anillo + masas colgantes. */
function ringInertiaKg(w: F101World): number {
  let m = w.params.ringMassG / 1000;
  for (const id of PULLEYS) m += hangingOn(w, id).trueG / 1000;
  return m;
}

function frictionCapN(w: F101World, forces: StringForce[]): number {
  if (w.params.scientificMode === 'CURRICULAR') return 0;
  if (w.timeS < w.table.tapUntil) return 0;
  const mu = w.params.pulleyFriction;
  let cap = w.params.ringFrictionN;
  for (const f of forces) if (f.source !== 'dynamometer01') cap += mu * f.T;
  return cap;
}

export const ringOffsetMm = (w: F101World) => Math.hypot(w.table.ring.x, w.table.ring.y) * 1000;
export const ringSpeed = (w: F101World) => Math.hypot(w.table.ring.vx, w.table.ring.vy);

// ─────────────────────────── Despacho ───────────────────────────

const BEFORE_PPE = new Set<F101Command['type']>(['equipPpe', 'startWork', 'teacherStop', 'acknowledge', 'inspect']);
const DURING_BLOCK = new Set<F101Command['type']>(['acknowledge', 'teacherStop', 'inspect', 'setPose', 'setPin', 'replaceCylinder', 'wipeBench', 'setDynTension', 'mountDynamometer', 'hang', 'loadMass', 'stopCapture']);
/** Comandos que cambian el montaje de la mesa (nuevo ensayo; E32 si hay captura en curso). */
const TABLE_CONFIG = new Set<F101Command['type']>(['setPulleyAngle', 'hang', 'loadMass', 'mountDynamometer', 'setDynAngle', 'setDynTension', 'threadString', 'seatPulley']);

export function dispatchF101(w: F101World, cmd: F101Command): F101DispatchResult {
  if (w.safety.stoppedByTeacher && cmd.type !== 'teacherStop') return { ok: false, code: 'TEACHER_STOP' };
  if (!w.ppe && !BEFORE_PPE.has(cmd.type)) return { ok: false, code: 'PPE' };
  if (w.safety.block && !DURING_BLOCK.has(cmd.type)) return { ok: false, code: 'BLOCKED' };
  const before = w.table.configVersion;
  const res = route(w, cmd);
  if (res.ok && TABLE_CONFIG.has(cmd.type)) {
    if (w.table.configVersion === before) w.table.configVersion++;
    const cap = w.table.sensor.capture;
    if (cap && cap.configAtStart !== w.table.configVersion) cap.configChanged = true;
  }
  return res;
}

function route(w: F101World, cmd: F101Command): F101DispatchResult {
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
    case 'placeInCaliper':
      return placeInCaliper(w, cmd.partId, cmd.dimension, cmd.tiltDeg, cmd.spinDeg);
    case 'setCaliperSlide':
      setCaliperTarget(w.caliper, clamp(cmd.targetMm, -2, p.caliper.rangeMm), p.caliper);
      return { ok: !w.caliper.locked, code: w.caliper.locked ? 'LOCKED' : undefined, value: w.caliper.forceN };
    case 'releaseCaliper':
      releaseCaliperThumb(w.caliper);
      return { ok: true };
    case 'lockCaliper':
      w.caliper.locked = cmd.on;
      return { ok: true };
    case 'readCaliper':
      return readCaliper(w, cmd.viewDeg);
    case 'placeInMicrometer':
      return placeInMicrometer(w, cmd.partId, cmd.spinDeg);
    case 'turnMicrometer': {
      const m = w.micrometer;
      if (m.locked) return { ok: false, code: 'LOCKED' };
      turnMicrometer(m, clamp(cmd.deltaDeg, -3600, 3600), cmd.via, p.micrometer);
      if (m.slipped) flagF(w, 'ratchetClicked');
      return { ok: true, value: m.forceN };
    }
    case 'lockMicrometer':
      w.micrometer.locked = cmd.on;
      return { ok: true };
    case 'cleanFaces':
      if (w.micrometer.part) return { ok: false, code: 'PART_INSIDE' };
      w.micrometer.facesDirty = false;
      flagF(w, 'facesCleaned');
      emitF(w, 'FACES_CLEANED', 'INFO');
      return { ok: true };
    case 'readMicrometer':
      return readMicrometer(w, cmd.viewDeg);
    case 'readRuler':
      return readRuler(w, cmd.partId, cmd.viewDeg);
    case 'powerBalance':
      return powerBalance(w, cmd.on);
    case 'levelBalance':
      w.balance.levelErrorDeg = 0;
      w.balance.disturbedAt = w.timeS;
      flagF(w, 'balanceLeveled');
      emitF(w, 'BALANCE_LEVELED', 'INFO');
      return { ok: true };
    case 'tare':
      return tare(w);
    case 'readBalance':
      return readBalance(w);
    case 'dropIntoCylinder':
      return dropIntoCylinder(w, cmd.partId, cmd.heightCm);
    case 'retrievePart':
      return retrievePart(w, cmd.partId);
    case 'dryPart': {
      const part = w.parts[cmd.partId];
      if (!part) return { ok: false, code: 'NO_PART' };
      w.water.discardedMl += part.wetG;
      part.wetG = 0;
      flagF(w, `dried:${cmd.partId}`);
      return { ok: true };
    }
    case 'readVolume':
      return readVolume(w, cmd.eyeDzCm, cmd.occluded);
    case 'tapCylinder':
      flagF(w, 'cylinderTapped');
      w.gradCyl.foamMl = 0;
      w.gradCyl.unsettledUntil = Math.max(w.gradCyl.unsettledUntil, w.timeS + 0.8);
      return { ok: true };
    case 'replaceCylinder':
      return replaceCylinder(w);
    case 'wipeBench':
      w.water.discardedMl += w.water.benchMl;
      w.water.benchMl = 0;
      flagF(w, 'benchWiped');
      return { ok: true };
    case 'setPulleyAngle':
      return setPulleyAngle(w, cmd.pulleyId, cmd.angleDeg);
    case 'seatPulley': {
      const pl = w.table.pulleys[cmd.pulleyId];
      if (!pl) return { ok: false, code: 'NO_PULLEY' };
      pl.seated = cmd.on;
      if (cmd.on) rearmErrF(w, 'E11');
      return { ok: true };
    }
    case 'threadString': {
      const pl = w.table.pulleys[cmd.pulleyId];
      if (!pl) return { ok: false, code: 'NO_PULLEY' };
      pl.threaded = cmd.on;
      if (cmd.on) rearmErrF(w, 'E12');
      return { ok: true };
    }
    case 'hang':
      return hang(w, cmd.hangerId, cmd.pulleyId);
    case 'loadMass':
      return loadMass(w, cmd.massId, cmd.hangerId);
    case 'setPin': {
      w.table.pinIn = cmd.on;
      if (cmd.on) return { ok: true };
      flagF(w, 'pinRemoved');
      // Al liberar el anillo, las cargas actúan: una prensa floja o un hilo fuera de la rueda desvían la fuerza.
      const loaded = PULLEYS.filter((id) => hangingOn(w, id).hangerId);
      if (loaded.some((id) => !w.table.pulleys[id].seated)) errF(w, 'E11', 'PULLEY_UNSEATED');
      if (loaded.some((id) => !w.table.pulleys[id].threaded)) errF(w, 'E12', 'STRING_OFF_WHEEL');
      return { ok: true };
    }
    case 'nudgeRing': {
      const t = w.table;
      t.ring.x += clamp(cmd.dxCm, -2, 2) / 100;
      t.ring.y += clamp(cmd.dyCm, -2, 2) / 100;
      t.ring.vx = 0;
      t.ring.vy = 0;
      t.stuck = false;
      constrainRing(w);
      return { ok: true };
    }
    case 'tapTable':
      w.table.tapUntil = w.timeS + 0.3;
      w.table.stuck = false;
      flagF(w, 'tableTapped');
      return { ok: true };
    case 'levelTable':
      if (w.objects.level01?.support !== 'forceTable01') return { ok: false, code: 'NEED_LEVEL' };
      w.table.levelDeg = 0;
      flagF(w, 'tableLeveled');
      rearmErrF(w, 'E28');
      emitF(w, 'TABLE_LEVELED', 'INFO');
      return { ok: true };
    case 'recordEquilibrium':
      return recordEquilibrium(w, cmd.viewElevDeg);
    case 'mountDynamometer':
      return mountDynamometer(w, cmd.on, cmd.angleDeg);
    case 'setDynAngle':
      if (!w.table.dyn.onRim) return { ok: false, code: 'NOT_MOUNTED' };
      w.table.dyn.angleDeg = ((cmd.angleDeg % 360) + 360) % 360;
      return { ok: true };
    case 'setDynTension':
      if (!w.table.dyn.onRim) return { ok: false, code: 'NOT_MOUNTED' };
      w.table.dyn.tensionMm = clamp(cmd.mm, 0, 220);
      w.table.stuck = false;
      return { ok: true };
    case 'alignDynamometer':
      w.table.dyn.alignDeg = clamp(cmd.alignDeg, -20, 20);
      if (Math.abs(w.table.dyn.alignDeg) <= 1) rearmErrF(w, 'E26');
      return { ok: true };
    case 'zeroDynamometer':
      return zeroDynamometer(w);
    case 'readDynamometer':
      return readDynamometer(w, cmd.viewDeg);
    case 'connectSensor':
      w.table.sensor.connected = cmd.on;
      if (cmd.on) {
        flagF(w, 'sensorConnected');
        rearmErrF(w, 'E23');
      }
      return { ok: true };
    case 'setSensorRange':
      w.table.sensor.rangeN = cmd.rangeN;
      return { ok: true };
    case 'setSensorRate':
      w.table.sensor.rateHz = cmd.hz;
      return { ok: true };
    case 'calibrateSensor':
      return calibrateSensor(w);
    case 'startCapture':
      return startCapture(w);
    case 'stopCapture':
      return stopCapture(w);
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

function startWork(w: F101World): F101DispatchResult {
  const missing = (Object.keys(PPE_ERR) as PpeItem[]).filter((k) => !w.safety.ppe[k]);
  if (missing.length) {
    for (const k of missing) {
      bumpF(w, `err:${PPE_ERR[k][0]}`);
      emitF(w, PPE_ERR[k][1], 'CRITICAL');
    }
    return { ok: false, code: 'PPE_MISSING' };
  }
  w.ppe = true;
  flagF(w, 'ppe');
  emitF(w, 'PPE_OK', 'INFO');
  return { ok: true };
}

function inspect(w: F101World, target: string): F101DispatchResult {
  flagF(w, `inspected:${target}`);
  const p = w.params;
  switch (target) {
    case 'caliper01':
      emitF(w, 'INSPECT_CALIPER', 'INFO', { res: p.caliper.resolutionMm, range: p.caliper.rangeMm });
      break;
    case 'micrometer01':
      emitF(w, 'INSPECT_MICROMETER', 'INFO', { res: p.micrometer.resolutionMm, range: p.micrometer.rangeMm });
      if (w.micrometer.facesDirty) emitF(w, 'FACES_DIRTY_FOUND', 'WARN');
      break;
    case 'ruler01':
      emitF(w, 'INSPECT_RULER', 'INFO', { res: p.rulerResolutionMm });
      break;
    case 'balance01':
      emitF(w, 'INSPECT_BALANCE', 'INFO', { res: p.balance.resolutionG, cap: p.balance.capacityG });
      if (w.balance.levelErrorDeg > 0.5) emitF(w, 'BALANCE_UNLEVEL', 'WARN');
      break;
    case 'gradCyl01':
      emitF(w, 'INSPECT_GRADCYL', 'INFO', { cap: p.gradCylCapacityMl, div: p.gradCylDivisionMl });
      if (w.gradCyl.cracked) emitF(w, 'CRACK_FOUND', 'ALERT');
      break;
    case 'forceTable01':
      emitF(w, 'INSPECT_TABLE', 'INFO', { div: p.angleDivisionDeg });
      if (w.table.levelDeg > 0.3) emitF(w, 'TABLE_UNLEVEL', 'WARN', { deg: w.table.levelDeg });
      break;
    case 'dynamometer01':
      emitF(w, 'INSPECT_DYN', 'INFO', { range: p.dynRangeN, div: p.dynDivisionN });
      break;
    case 'sensorBox01':
      emitF(w, 'INSPECT_SENSOR', 'INFO', { range: w.table.sensor.rangeN, hz: w.table.sensor.rateHz, cal: w.table.sensor.calibrated ? 1 : 0 });
      break;
    case 'massStd01':
    case 'gaugeBlock01': {
      const c = w.parts[target]?.certified;
      emitF(w, 'INSPECT_STANDARD', c?.status === 'pending' ? 'WARN' : 'INFO', { status: c?.status ?? 'none', nominal: c?.nominal ?? 0 });
      break;
    }
    default:
      emitF(w, 'INSPECTED', 'INFO', { target });
  }
  return { ok: true };
}

/** Lugares donde una pieza puede apoyarse (el resto se rechaza: no hay acople allí). */
const SUPPORTS = new Set(['bench', 'hand', 'pan', 'dish01', 'tray', 'rack', 'forceTable01', 'sensor01']);

function setPose(w: F101World, id: string, pose: Pose, support?: string): F101DispatchResult {
  const o = w.objects[id];
  if (!o) return { ok: false, code: 'NO_OBJECT' };
  if (!o.movable) return { ok: false, code: 'FIXED' };
  const prev = o.support;
  if (support && support !== prev) {
    if (!SUPPORTS.has(support)) return { ok: false, code: 'NO_SEAT' };
    if (prev === 'gradCyl01') return { ok: false, code: 'USE_RETRIEVE' };
    if (prev === 'caliper01' || prev === 'micrometer01') detachFromInstrument(w, id);
    if (HANGERS.includes(id as never) && PULLEYS.includes(prev as never)) return { ok: false, code: 'USE_UNHANG' };
    if (prev === 'pan' || support === 'pan' || prev === 'dish01' || support === 'dish01') disturbBalance(w);
  }
  o.pose = { ...pose };
  if (support) o.support = support;
  return { ok: true };
}

function disturbBalance(w: F101World) {
  const b = w.balance;
  b.disturbedAt = w.timeS;
  b.stable = false;
  b.quietS = 0;
}

function detachFromInstrument(w: F101World, id: string) {
  if (w.caliper.part?.id === id) {
    w.caliper.part = null;
    w.caliper.forceN = 0;
  }
  if (w.micrometer.part?.id === id) {
    w.micrometer.part = null;
    w.micrometer.forceN = 0;
  }
}

// ─────────────────────────── Calibrador, micrómetro y regla ───────────────────────────

function placeInCaliper(w: F101World, partId: string | null, dim: CaliperDim, tiltDeg: number, spinDeg: number): F101DispatchResult {
  const c = w.caliper;
  if (c.locked) return { ok: false, code: 'LOCKED' };
  if (partId === null) {
    if (c.part) {
      const o = w.objects[c.part.id];
      if (o) o.support = 'bench';
    }
    c.part = null;
    c.forceN = 0;
    return { ok: true };
  }
  const part = w.parts[partId];
  const o = w.objects[partId];
  if (!part || !o) return { ok: false, code: 'NO_PART' };
  if (o.support === 'gradCyl01') return { ok: false, code: 'USE_RETRIEVE' };
  if (o.support === 'micrometer01') detachFromInstrument(w, partId);
  const extent = partExtentMm(part, dim, spinDeg);
  const part0 = { id: partId, extentMm: extent, crossMm: partCrossMm(part, dim), stiffNPerMm: part.stiffNPerMm, tiltDeg: clamp(tiltDeg, -45, 45) };
  if (c.jawMm < extent * Math.cos(part0.tiltDeg * DEG) - 0.01) return { ok: false, code: 'JAWS_CLOSED' };
  c.part = part0;
  c.forceN = 0;
  o.support = 'caliper01';
  o.spinDeg = spinDeg;
  o.orient = dim === 'h' ? 'lying' : 'upright';
  w.evidence.__calDim = dim === 'd' ? 1 : dim === 'h' ? 2 : 3;
  return { ok: true };
}

function addReading(w: F101World, r: Omit<ReadingF, 'id' | 't' | 'tick' | 'trialId'>): ReadingF {
  const n = w.readingOrder.length + 1;
  const prefix = { length: 'L', mass: 'm', volume: 'v', force: 'f', equilibrium: 'q', vector: 's' }[r.kind];
  const reading: ReadingF = { ...r, id: `${prefix}${n}`, trialId: `T${w.trial}`, t: w.timeS, tick: w.tick };
  w.readings[reading.id] = reading;
  w.readingOrder.push(reading.id);
  return reading;
}

function readCaliper(w: F101World, viewDeg: number): F101DispatchResult {
  const c = w.caliper;
  const p = w.params.caliper;
  const { value, parallax } = caliperReadingMm(c, p, viewDeg);
  const flags: string[] = [];
  const part = c.part;
  const dimCode = w.evidence.__calDim ?? 1;
  const dim: CaliperDim = dimCode === 2 ? 'h' : dimCode === 3 ? 'L' : 'd';
  if (parallax) {
    flags.push('PARALLAX');
    errF(w, 'E06', 'SCALE_PARALLAX');
  }
  if (!part) {
    // Comprobación del cero: mordazas cerradas sin pieza.
    if (c.jawMm > 0.05) return { ok: false, code: 'JAWS_OPEN' };
    c.zeroChecked = true;
    flagF(w, 'caliperZero');
    const r = addReading(w, { kind: 'length', instrumentId: 'caliper01', value, unit: 'mm', resolution: p.resolutionMm, uncertainty: w.params.uB.caliperMm, sourceObjectIds: [], qualityFlags: ['ZERO', ...flags], trueValue: 0, target: 'empty', dimension: 'empty' });
    emitF(w, 'CALIPER_ZERO_READ', 'INFO', { mm: value });
    return { ok: true, id: r.id, value };
  }
  const sp = w.parts[part.id];
  if (c.forceN <= 0 && c.jawMm > projectedExtentMm(part) + 0.01) return { ok: false, code: 'NO_CONTACT' };
  if (!c.zeroChecked) {
    flags.push('NOT_ZEROED');
    errF(w, 'E01', 'CALIPER_ZERO_UNCHECKED');
  }
  if (c.forceN > p.forceLimitN) {
    flags.push('FORCE');
    errF(w, 'E02', 'CALIPER_OVERFORCE', 'WARN', { n: Math.round(c.forceN * 10) / 10 });
  }
  if (Math.abs(part.tiltDeg) > 2) {
    flags.push('OBLIQUE');
    errF(w, 'E03', 'CALIPER_OBLIQUE', 'WARN', { deg: Math.round(part.tiltDeg) });
  }
  if (sp && sp.wetG > 0.01) flags.push('WET');
  const r = addReading(w, {
    kind: 'length', instrumentId: 'caliper01', value, unit: 'mm', resolution: p.resolutionMm, uncertainty: w.params.uB.caliperMm,
    sourceObjectIds: [part.id], qualityFlags: flags, trueValue: part.extentMm, target: part.id, dimension: dim, spinDeg: w.objects[part.id]?.spinDeg ?? 0,
  });
  flagF(w, `measured:${part.id}`);
  emitF(w, 'LENGTH_READ', 'INFO', { mm: value, inst: 'caliper01' });
  return { ok: true, id: r.id, value };
}

function placeInMicrometer(w: F101World, partId: string | null, spinDeg: number): F101DispatchResult {
  const m = w.micrometer;
  if (m.locked) return { ok: false, code: 'LOCKED' };
  if (partId === null) {
    if (m.part) {
      const o = w.objects[m.part.id];
      if (o) o.support = 'bench';
    }
    m.part = null;
    m.forceN = 0;
    return { ok: true };
  }
  const part = w.parts[partId];
  const o = w.objects[partId];
  if (!part || !o) return { ok: false, code: 'NO_PART' };
  if (o.support === 'gradCyl01') return { ok: false, code: 'USE_RETRIEVE' };
  const dim: CaliperDim = part.shape === 'block' ? 'L' : 'd';
  const extent = partExtentMm(part, dim, spinDeg);
  if (extent > w.params.micrometer.rangeMm) return { ok: false, code: 'TOO_LARGE' };
  if (m.spindleMm < extent + (m.facesDirty ? m.residueMm : 0)) return { ok: false, code: 'SPINDLE_CLOSED' };
  if (o.support === 'caliper01') detachFromInstrument(w, partId);
  m.part = { id: partId, extentMm: extent };
  m.forceN = 0;
  o.support = 'micrometer01';
  o.spinDeg = spinDeg;
  return { ok: true };
}

function readMicrometer(w: F101World, viewDeg: number): F101DispatchResult {
  const m = w.micrometer;
  const p = w.params.micrometer;
  const { value, parallax } = micrometerReadingMm(m, p, viewDeg);
  const flags: string[] = [];
  if (m.forceN <= 0) return { ok: false, code: 'NO_CONTACT' };
  if (parallax) {
    flags.push('PARALLAX');
    errF(w, 'E06', 'SCALE_PARALLAX');
  }
  if (m.facesDirty) {
    flags.push('DIRTY');
    errF(w, 'E05', 'MICROMETER_DIRTY');
  }
  if (m.lastDrive === 'thimble' && m.forceN > p.forceLimitN) {
    flags.push('FORCE');
    errF(w, 'E04', 'MICROMETER_NO_RATCHET', 'WARN', { n: Math.round(m.forceN) });
  }
  if (!m.part) {
    m.zeroChecked = true;
    flagF(w, 'microZero');
    const r = addReading(w, { kind: 'length', instrumentId: 'micrometer01', value, unit: 'mm', resolution: p.resolutionMm, uncertainty: w.params.uB.micrometerMm, sourceObjectIds: [], qualityFlags: ['ZERO', ...flags], trueValue: 0, target: 'empty', dimension: 'empty' });
    emitF(w, 'MICRO_ZERO_READ', 'INFO', { mm: value });
    return { ok: true, id: r.id, value };
  }
  if (!m.zeroChecked) {
    flags.push('NOT_ZEROED');
    errF(w, 'E21', 'INSTRUMENT_ZERO_SKIPPED', 'WARN', { inst: 'micrometer01' });
  }
  const sp = w.parts[m.part.id];
  if (sp && sp.wetG > 0.01) flags.push('WET');
  const r = addReading(w, {
    kind: 'length', instrumentId: 'micrometer01', value, unit: 'mm', resolution: p.resolutionMm, uncertainty: w.params.uB.micrometerMm,
    sourceObjectIds: [m.part.id], qualityFlags: flags, trueValue: m.part.extentMm, target: m.part.id, dimension: sp?.shape === 'block' ? 'L' : 'd', spinDeg: w.objects[m.part.id]?.spinDeg ?? 0,
  });
  flagF(w, `measured:${m.part.id}`);
  emitF(w, 'LENGTH_READ', 'INFO', { mm: value, inst: 'micrometer01' });
  return { ok: true, id: r.id, value };
}

function readRuler(w: F101World, partId: string, viewDeg: number): F101DispatchResult {
  const part = w.parts[partId];
  const o = w.objects[partId];
  if (!part || !o) return { ok: false, code: 'NO_PART' };
  if (o.support !== 'bench' && o.support !== 'hand' && o.support !== 'tray') return { ok: false, code: 'NOT_ON_RULER' };
  const dim: CaliperDim = part.shape === 'block' ? 'L' : part.shape === 'cylinder' ? 'h' : 'd';
  const res = w.params.rulerResolutionMm;
  const parallax = Math.abs(viewDeg) > 20;
  const extent = partExtentMm(part, dim, 0);
  const value = quantize(extent + (parallax ? Math.sign(viewDeg) * res : 0), res);
  const flags = parallax ? ['PARALLAX'] : [];
  if (parallax) errF(w, 'E06', 'SCALE_PARALLAX');
  const r = addReading(w, { kind: 'length', instrumentId: 'ruler01', value, unit: 'mm', resolution: res, uncertainty: w.params.uB.rulerMm, sourceObjectIds: [partId], qualityFlags: flags, trueValue: extent, target: partId, dimension: dim });
  flagF(w, `measured:${partId}`);
  flagF(w, 'rulerUsed');
  return { ok: true, id: r.id, value };
}

// ─────────────────────────── Balanza ───────────────────────────

function powerBalance(w: F101World, on: boolean): F101DispatchResult {
  const b = w.balance;
  if (on === b.powered) return { ok: true };
  b.powered = on;
  if (on) {
    const load = panLoadG(w);
    b.tareG = balanceIndication({ ...b, tareG: 0 }, load, w.params.balance, w.timeS);
    b.shownG = 0;
    b.refG = 0;
    b.taredAt = w.timeS;
    b.tareSession += 1;
    b.tareLoadG = load;
    b.tareKey = panIds(w).sort().join(',');
    disturbBalance(w);
    flagF(w, 'balanceOn');
    emitF(w, 'BALANCE_ON', 'INFO');
  }
  return { ok: true };
}

function tare(w: F101World): F101DispatchResult {
  const b = w.balance;
  if (!b.powered) return { ok: false, code: 'BALANCE_OFF' };
  const load = panLoadG(w);
  b.tareG = balanceIndication({ ...b, tareG: 0 }, load, w.params.balance, w.timeS) + b.noiseG;
  b.shownG = 0;
  b.refG = 0;
  b.taredAt = w.timeS;
  b.tareSession += 1;
  b.tareLoadG = load;
  b.tareKey = panIds(w).sort().join(',');
  disturbBalance(w);
  flagF(w, 'tared');
  if (b.tareKey.includes('dish01')) flagF(w, 'taredWithDish');
  emitF(w, 'TARED', 'INFO', { with: b.tareKey || 'empty' });
  return { ok: true, value: 0 };
}

function readBalance(w: F101World): F101DispatchResult {
  const b = w.balance;
  if (!b.powered) return { ok: false, code: 'BALANCE_OFF' };
  const p = w.params;
  const ids = panIds(w);
  const load = panLoadG(w);
  const shown = quantize(b.shownG, p.balance.resolutionG);
  const flags: string[] = [];
  if (load > p.balance.capacityG) return { ok: false, code: 'OVERLOAD' };
  if (!b.stable) {
    flags.push('UNSTABLE');
    errF(w, 'E30', 'READ_BEFORE_STABLE', 'WARN', { inst: 'balance01' });
  }
  if (b.levelErrorDeg > 0.5) {
    flags.push('UNLEVELED');
    if (ids.length) errF(w, 'E07', 'BALANCE_UNSTABLE_SUPPORT');
  }
  // Pieza sobre la cápsula sin haber tarado con la cápsula: la «masa» incluye el recipiente (E08).
  if (ids.includes('dish01') && ids.length > 1 && !b.tareKey.split(',').includes('dish01')) {
    flags.push('NO_TARE');
    errF(w, 'E08', 'TARE_MISSING');
  }
  const wet = ids.filter((id) => (w.parts[id]?.wetG ?? 0) > 0.01);
  if (wet.length) flags.push('WET');
  const target = ids.find((id) => w.parts[id]) ?? ids.find((id) => id !== 'dish01') ?? (ids.length ? ids[0] : undefined);
  const r = addReading(w, {
    kind: 'mass', instrumentId: 'balance01', value: shown, unit: 'g', resolution: p.balance.resolutionG, uncertainty: p.uB.balanceG,
    sourceObjectIds: ids, qualityFlags: flags, trueValue: load - b.tareLoadG, tareSession: b.tareSession, target,
  });
  if (!flags.includes('UNSTABLE')) {
    emitF(w, 'MASS_READ', 'INFO', { g: shown });
    if (target) flagF(w, `weighed:${target}`);
  }
  return { ok: !flags.includes('UNSTABLE'), id: r.id, value: shown };
}

// ─────────────────────────── Probeta ───────────────────────────

/** Altura de suelta (cm sobre el agua) a partir de la cual la pieza salpica y a partir de la cual el vidrio se raja. */
export const DROP_SPLASH_CM = 3;
export const DROP_CRACK_CM = 12;

function dropIntoCylinder(w: F101World, partId: string, heightCm: number): F101DispatchResult {
  const part = w.parts[partId];
  const o = w.objects[partId];
  const g = w.gradCyl;
  if (!part || !o) return { ok: false, code: 'NO_PART' };
  if (partId === 'gaugeBlock01' || partId === 'massStd01') return { ok: false, code: 'NOT_FOR_IMMERSION' };
  if (g.parts.includes(partId)) return { ok: false, code: 'ALREADY_INSIDE' };
  if (part.shape === 'cylinder' && part.dMm / 10 > GEOF101.gradCyl.r * 2 - 0.1) return { ok: false, code: 'TOO_WIDE' };
  detachFromInstrument(w, partId);
  const vol = partVolumeMl(w, partId);
  if (cylinderContentMl(w) + vol > w.params.gradCylCapacityMl) return { ok: false, code: 'WOULD_OVERFLOW' };
  const h = Math.max(0, heightCm);
  g.parts.push(partId);
  o.support = 'gradCyl01';
  if (h > DROP_SPLASH_CM) {
    // Salpicadura: el agua desplazada bruscamente sale por la boca y cae a la mesada (sigue contabilizada).
    const lost = Math.min(g.waterMl, Math.round((0.6 + 0.35 * (h - DROP_SPLASH_CM)) * 10) / 10);
    g.waterMl -= lost;
    w.water.benchMl += lost;
    g.unsettledUntil = w.timeS + 3;
    g.foamMl = Math.max(g.foamMl, 0.6);
    errF(w, 'E09', 'PART_DROPPED', 'ALERT', { cm: Math.round(h), ml: lost });
    if (h > DROP_CRACK_CM && part.massG > 20) {
      // El impacto raja el fondo: la probeta pierde agua mientras se usa hasta reemplazarla.
      g.cracked = true;
      emitF(w, 'CYLINDER_CRACKED', 'CRITICAL');
    }
  } else {
    g.unsettledUntil = w.timeS + 0.6;
    flagF(w, 'gentleImmersion');
  }
  flagF(w, `immersed:${partId}`);
  return { ok: true };
}

function retrievePart(w: F101World, partId: string): F101DispatchResult {
  const g = w.gradCyl;
  const part = w.parts[partId];
  if (!part || !g.parts.includes(partId)) return { ok: false, code: 'NOT_INSIDE' };
  g.parts = g.parts.filter((x) => x !== partId);
  const wet = Math.min(g.waterMl, PART_WET_G[partId] ?? 0.05);
  g.waterMl -= wet;
  part.wetG += wet;
  g.unsettledUntil = w.timeS + 1;
  const o = w.objects[partId];
  if (o) o.support = 'bench';
  return { ok: true };
}

function readVolume(w: F101World, eyeDzCm: number, occluded: boolean): F101DispatchResult {
  const g = w.gradCyl;
  const p = w.params;
  if (occluded) {
    errF(w, 'E25', 'LINE_OF_SIGHT_BLOCKED');
    return { ok: false, code: 'OCCLUDED' };
  }
  const flags: string[] = [];
  const trueMl = cylinderContentMl(w);
  // Ojo por encima del menisco: se ve el borde alto y la lectura sube; por debajo, baja (1 división cada 1,5 cm).
  const shift = Math.abs(eyeDzCm) <= 1 ? 0 : Math.sign(eyeDzCm) * Math.min(3, Math.ceil((Math.abs(eyeDzCm) - 1) / 1.5)) * p.gradCylDivisionMl;
  const foam = g.foamMl > 0.2 ? g.foamMl : 0;
  const unsettled = w.timeS < g.unsettledUntil;
  const wobble = unsettled ? gaussF(w) * 0.8 : 0;
  const value = quantize(trueMl + shift + foam + wobble, p.gradCylDivisionMl);
  if (shift !== 0) {
    flags.push('PARALLAX');
    errF(w, 'E10', 'MENISCUS_MISREAD', 'WARN', { dz: Math.round(eyeDzCm * 10) / 10 });
  }
  if (foam) {
    flags.push('FOAM');
    errF(w, 'E10', 'MENISCUS_MISREAD', 'WARN', { foam: 1 });
  }
  if (unsettled) {
    flags.push('UNSTABLE');
    errF(w, 'E30', 'READ_BEFORE_STABLE', 'WARN', { inst: 'gradCyl01' });
  }
  if (g.cracked) {
    flags.push('POST_IMPACT');
    errF(w, 'E39', 'DATA_AFTER_DAMAGE', 'ALERT');
  }
  const r = addReading(w, {
    kind: 'volume', instrumentId: 'gradCyl01', value, unit: 'mL', resolution: p.gradCylDivisionMl, uncertainty: p.uB.gradCylMl,
    sourceObjectIds: [...g.parts], qualityFlags: flags, trueValue: trueMl, partsInside: [...g.parts], target: g.parts[0] ?? 'water',
  });
  if (!flags.length) flagF(w, g.parts.length ? 'volumeWithPart' : 'volumeInitial');
  if (Math.abs(eyeDzCm) <= 1) flagF(w, 'meniscusEyeLevel');
  emitF(w, 'VOLUME_READ', 'INFO', { ml: value });
  return { ok: true, id: r.id, value };
}

function replaceCylinder(w: F101World): F101DispatchResult {
  const g = w.gradCyl;
  if (!g.cracked) return { ok: false, code: 'NOT_DAMAGED' };
  if (w.water.benchMl > 0.05) return { ok: false, code: 'WIPE_FIRST' };
  // Las piezas se recuperan mojadas; el agua de la probeta rota se descarta y la nueva se llena al volumen inicial.
  for (const id of g.parts) {
    const part = w.parts[id];
    if (part) part.wetG += PART_WET_G[id] ?? 0.05;
    g.waterMl -= PART_WET_G[id] ?? 0.05;
    const o = w.objects[id];
    if (o) o.support = 'tray';
  }
  w.water.discardedMl += Math.max(0, g.waterMl);
  const fresh = w.params.gradCylInitialMl;
  // El agua nueva entra desde fuera del sistema: se registra como aporte (la conservación lo contabiliza).
  w.initialTotals.waterMl += fresh;
  g.waterMl = fresh;
  g.parts = [];
  g.cracked = false;
  g.foamMl = 0;
  g.serial += 1;
  g.unsettledUntil = w.timeS + 1;
  emitF(w, 'CYLINDER_REPLACED', 'INFO');
  flagF(w, 'cylinderReplaced');
  return { ok: true };
}

// ─────────────────────────── Mesa de fuerzas ───────────────────────────

function setPulleyAngle(w: F101World, id: string, angleDeg: number): F101DispatchResult {
  const pl = w.table.pulleys[id];
  if (!pl) return { ok: false, code: 'NO_PULLEY' };
  const a = ((angleDeg % 360) + 360) % 360;
  // Las prensas son sólidos: dos poleas no pueden ocupar el mismo sector (≥ 12°) ni el del dinamómetro.
  const others = PULLEYS.filter((x) => x !== id).map((x) => w.table.pulleys[x].angleDeg);
  if (w.table.dyn.onRim) others.push(w.table.dyn.angleDeg);
  if (others.some((o) => Math.abs(((a - o + 540) % 360) - 180) < 12)) return { ok: false, code: 'COLLISION' };
  // Mover la prensa exige aflojarla: queda floja hasta que se aprieta (§14).
  pl.angleDeg = a;
  pl.seated = false;
  w.table.stuck = false;
  return { ok: true };
}

function hang(w: F101World, hangerId: string, pulleyId: string | null): F101DispatchResult {
  const o = w.objects[hangerId];
  if (!o || !HANGERS.includes(hangerId as never)) return { ok: false, code: 'NO_HANGER' };
  const t = w.table;
  if (pulleyId === null) {
    if (!PULLEYS.includes(o.support as never)) return { ok: true };
    const loaded = hangingOn(w, o.support).trueG;
    o.support = 'rack';
    t.stuck = false;
    if (!t.pinIn && loaded > 0) {
      // Quitar una carga con el anillo libre: el resto lo arrastra hasta el tope y las masas caen (masa suelta).
      const others = PULLEYS.some((p) => hangingOn(w, p).hangerId);
      if (others) {
        errF(w, 'E40', 'UNSAFE_DISASSEMBLY', 'CRITICAL', { what: 'hanger' });
        w.safety.block = { code: 'RING_LOOSE', since: w.timeS };
      } else errF(w, 'E19', 'MASS_CHANGED_UNSECURED');
    }
    return { ok: true };
  }
  if (!t.pulleys[pulleyId]) return { ok: false, code: 'NO_PULLEY' };
  if (hangingOn(w, pulleyId).hangerId) return { ok: false, code: 'OCCUPIED' };
  o.support = pulleyId;
  t.stuck = false;
  // Colgar de un hilo que no pasa por la rueda: la carga no tira en la dirección de la polea (E12).
  if (!t.pulleys[pulleyId].threaded) errF(w, 'E12', 'STRING_OFF_WHEEL');
  if (!t.pinIn) {
    errF(w, 'E19', 'MASS_CHANGED_UNSECURED');
    kickRing(w);
  }
  flagF(w, 'hung');
  return { ok: true };
}

function loadMass(w: F101World, massId: string, hangerId: string | null): F101DispatchResult {
  const o = w.objects[massId];
  if (!o || !w.masses[massId] || HANGERS.includes(massId as never)) return { ok: false, code: 'NO_MASS' };
  if (hangerId !== null && !HANGERS.includes(hangerId as never)) return { ok: false, code: 'NO_HANGER' };
  o.support = hangerId ?? 'rack';
  w.table.stuck = false;
  if (!w.table.pinIn && (hangerId === null || PULLEYS.includes(w.objects[hangerId]?.support as never))) {
    errF(w, 'E19', 'MASS_CHANGED_UNSECURED');
    kickRing(w);
  }
  return { ok: true };
}

/** Cambiar una carga con el anillo libre lo sacude (transitorio que el sensor registra). */
function kickRing(w: F101World) {
  const r = w.table.ring;
  r.vx += gaussF(w) * 0.05;
  r.vy += gaussF(w) * 0.05;
}

function constrainRing(w: F101World) {
  const t = w.table;
  const r = t.ring;
  const d = Math.hypot(r.x, r.y);
  const lim = t.pinIn ? RING_GAP_M : RING_LIMIT_M;
  t.limitHit = false;
  if (d > lim) {
    const k = lim / d;
    r.x *= k;
    r.y *= k;
    const nx = r.x / lim;
    const ny = r.y / lim;
    const vn = r.vx * nx + r.vy * ny;
    if (vn > 0) {
      r.vx -= vn * nx;
      r.vy -= vn * ny;
    }
  }
  if (!t.pinIn) t.limitHit = Math.hypot(r.x, r.y) >= RING_LIMIT_M - 1e-6;
}

function stepRing(w: F101World, dt: number) {
  const t = w.table;
  const r = t.ring;
  const n = w.params.subSteps;
  const h = dt / n;
  const M = ringInertiaKg(w);
  let peak = 0;
  let pinFx = 0;
  let pinFy = 0;
  let touching = false;
  for (let i = 0; i < n; i++) {
    const forces = stringForces(w, r.x, r.y);
    let Fx = 0;
    let Fy = 0;
    for (const f of forces) {
      Fx += f.T * f.ux;
      Fy += f.T * f.uy;
    }
    // Mesa inclinada: el anillo y los tramos de hilo sobre el tablero (≈ 20 g) tienden a bajar la pendiente.
    const tilt = 0.02 * w.params.g * Math.sin(t.levelDeg * DEG);
    Fx += tilt * Math.cos(t.levelDirDeg * DEG);
    Fy += tilt * Math.sin(t.levelDirDeg * DEG);
    t.applied = { x: Fx, y: Fy };
    // Perno: restricción unilateral; en contacto, el perno soporta la componente radial que empuja hacia afuera.
    pinFx = 0;
    pinFy = 0;
    touching = false;
    const d = Math.hypot(r.x, r.y);
    if (t.pinIn && d >= RING_GAP_M - 1e-6) {
      const nx = r.x / d;
      const ny = r.y / d;
      const Fn = Fx * nx + Fy * ny;
      if (Fn > 0) {
        pinFx = Fn * nx;
        pinFy = Fn * ny;
        Fx -= pinFx;
        Fy -= pinFy;
        touching = true;
      }
    }
    if (!t.pinIn && d >= RING_LIMIT_M - 1e-6) {
      const nx = r.x / d;
      const ny = r.y / d;
      const Fn = Fx * nx + Fy * ny;
      if (Fn > 0) {
        Fx -= Fn * nx;
        Fy -= Fn * ny;
      }
    }
    const cap = frictionCapN(w, forces);
    const v = Math.hypot(r.vx, r.vy);
    const Fm = Math.hypot(Fx, Fy);
    if (v < 1e-4 && Fm <= cap) {
      r.vx = 0;
      r.vy = 0;
      t.stuck = cap > 0;
      continue;
    }
    t.stuck = false;
    let fx = Fx - RING_DAMPING * r.vx;
    let fy = Fy - RING_DAMPING * r.vy;
    if (cap > 0) {
      const ux = v > 1e-4 ? r.vx / v : Fx / (Fm || 1);
      const uy = v > 1e-4 ? r.vy / v : Fy / (Fm || 1);
      fx -= cap * ux;
      fy -= cap * uy;
    }
    const ovx = r.vx;
    const ovy = r.vy;
    r.vx += (fx / M) * h;
    r.vy += (fy / M) * h;
    // La fricción frena pero no invierte el movimiento: si el sentido se da vuelta en el subpaso, el anillo se detiene.
    if (cap > 0 && v > 1e-4 && r.vx * ovx + r.vy * ovy < 0) {
      r.vx = 0;
      r.vy = 0;
    }
    r.x += r.vx * h;
    r.y += r.vy * h;
    constrainRing(w);
    peak = Math.max(peak, Math.hypot(r.vx, r.vy));
  }
  t.pinForce = { x: pinFx, y: pinFy };
  t.touching = touching;
  t.peakSpeed = Math.max(t.peakSpeed * 0.9, peak);
  t.stillS = ringSpeed(w) < STILL_V ? t.stillS + dt : 0;
}

function recordEquilibrium(w: F101World, viewElevDeg: number): F101DispatchResult {
  const t = w.table;
  const p = w.params;
  const flags: string[] = [];
  const loaded = PULLEYS.filter((id) => hangingOn(w, id).hangerId);
  const nForces = loaded.length + (t.dyn.onRim && dynamometerForceN(w) > 0.05 ? 1 : 0);
  if (nForces < 2) return { ok: false, code: 'NEED_FORCES' };
  const off = ringOffsetMm(w);
  if (t.limitHit || off > 5) return { ok: false, code: 'NOT_CENTERED', value: Math.round(off) };
  if (ringSpeed(w) > STILL_V || t.stillS < 1) {
    flags.push('MOVING');
    errF(w, 'E30', 'READ_BEFORE_STABLE', 'WARN', { inst: 'forceTable01' });
  }
  if (t.pinIn && t.touching) {
    flags.push('TOUCHING');
    errF(w, 'E13', 'RING_TOUCHES_PIN');
  }
  if (loaded.some((id) => !t.pulleys[id].seated)) {
    flags.push('UNSEATED');
    errF(w, 'E11', 'PULLEY_UNSEATED');
  }
  if (loaded.some((id) => !t.pulleys[id].threaded)) {
    flags.push('UNTHREADED');
    errF(w, 'E12', 'STRING_OFF_WHEEL');
  }
  if (t.levelDeg > 0.3) {
    flags.push('NOT_LEVEL');
    errF(w, 'E28', 'TABLE_NOT_LEVEL');
  }
  // Paralaje del índice angular: la escala está en el tablero; se lee desde arriba (≥ 60° de elevación).
  const parallax = viewElevDeg < 60;
  if (parallax) {
    flags.push('PARALLAX');
    errF(w, 'E29', 'ANGLE_PARALLAX');
  }
  const pShift = parallax ? (hashRandom(w.seed, `par:${w.tick}`) > 0.5 ? 1 : -1) * Math.ceil((60 - viewElevDeg) / 20) : 0;
  const sf = stringForces(w);
  const forces: NonNullable<ReadingF['forces']> = loaded.map((id) => {
    const m = hangingOn(w, id);
    const T = sf.find((f) => f.source === id)?.T ?? 0;
    return {
      source: id, massG: m.nominalG, angleRead: quantize((t.pulleys[id].angleDeg + pShift + 360) % 360, p.angleDivisionDeg),
      angleTrue: Math.round(pulleyTrueAngle(w, id) * 100) / 100, trueN: Math.round(T * 1e4) / 1e4,
    };
  });
  if (t.dyn.onRim) {
    const F = dynamometerForceN(w);
    forces.push({ source: 'dynamometer01', readN: dynIndication(w).value, angleRead: quantize((t.dyn.angleDeg + pShift + 360) % 360, p.angleDivisionDeg), angleTrue: t.dyn.angleDeg, trueN: Math.round(F * 1e4) / 1e4 });
  }
  const r = addReading(w, {
    kind: 'equilibrium', instrumentId: 'forceTable01', value: forces.length, unit: 'N', resolution: p.angleDivisionDeg, uncertainty: p.uB.angleDeg,
    sourceObjectIds: forces.map((f) => f.source), qualityFlags: flags, trueValue: Math.hypot(t.applied.x, t.applied.y), forces, ringOffsetMm: Math.round(off * 10) / 10, configVersion: t.configVersion,
  });
  const valid = !flags.some((f) => f === 'TOUCHING' || f === 'MOVING');
  if (valid) {
    flagF(w, 'equilibrium');
    if (forces.length >= 3) flagF(w, 'equilibrium3');
  }
  emitF(w, 'EQUILIBRIUM_RECORDED', valid ? 'INFO' : 'WARN', { n: forces.length, mm: Math.round(off * 10) / 10 });
  return { ok: true, id: r.id, value: forces.length };
}

// ─────────────────────────── Dinamómetro y sensor ───────────────────────────

function mountDynamometer(w: F101World, on: boolean, angleDeg: number): F101DispatchResult {
  const d = w.table.dyn;
  const o = w.objects.dynamometer01;
  if (on) {
    const a = ((angleDeg % 360) + 360) % 360;
    if (PULLEYS.some((id) => Math.abs(((a - w.table.pulleys[id].angleDeg + 540) % 360) - 180) < 12)) return { ok: false, code: 'COLLISION' };
    d.onRim = true;
    d.angleDeg = a;
    d.tensionMm = 0;
    if (o) o.support = 'rim';
    return { ok: true };
  }
  if (!d.onRim) return { ok: true };
  const F = dynamometerForceN(w);
  if (F > 0.2) {
    // Soltar el resorte cargado: el gancho salta y el anillo se dispara (energía residual).
    errF(w, 'E40', 'UNSAFE_DISASSEMBLY', 'CRITICAL', { what: 'dynamometer', n: Math.round(F * 10) / 10 });
    w.safety.block = { code: 'DYN_SNAP', since: w.timeS };
  }
  d.onRim = false;
  d.tensionMm = 0;
  if (o) o.support = 'bench';
  return { ok: true };
}

function zeroDynamometer(w: F101World): F101DispatchResult {
  const d = w.table.dyn;
  if (d.onRim && dynamometerForceN(w) > 0.02) return { ok: false, code: 'LOADED' };
  d.zeroed = true;
  // El cero ajustado en vertical no vale en horizontal: solo el ajuste en la posición de uso quita el desplazamiento.
  if (d.onRim) {
    d.zeroOffsetN = 0;
    d.zeroedLoaded = true;
    rearmErrF(w, 'E21');
  }
  flagF(w, 'dynZeroed');
  emitF(w, 'DYN_ZEROED', 'INFO', { inUse: d.onRim ? 1 : 0 });
  return { ok: true };
}

function dynIndication(w: F101World): { value: number; over: boolean } {
  const d = w.table.dyn;
  const p = w.params;
  const F = dynamometerForceN(w);
  const ind = F * Math.cos(d.alignDeg * DEG) + d.zeroOffsetN;
  return { value: quantize(Math.min(p.dynRangeN, ind), p.dynDivisionN), over: ind > p.dynRangeN };
}

function readDynamometer(w: F101World, viewDeg: number): F101DispatchResult {
  const d = w.table.dyn;
  const p = w.params;
  if (!d.onRim) return { ok: false, code: 'NOT_MOUNTED' };
  const flags: string[] = [];
  const ind = dynIndication(w);
  let value = ind.value;
  if (ind.over) flags.push('OVERRANGE');
  if (d.zeroOffsetN !== 0) {
    flags.push('NOT_ZEROED');
    errF(w, 'E21', 'INSTRUMENT_ZERO_SKIPPED', 'WARN', { inst: 'dynamometer01' });
  }
  if (Math.abs(d.alignDeg) > 3) {
    flags.push('TILTED');
    errF(w, 'E26', 'INSTRUMENT_TILTED', 'WARN', { deg: Math.round(d.alignDeg) });
  }
  if (Math.abs(viewDeg) > 15) {
    flags.push('PARALLAX');
    value = quantize(value + Math.sign(viewDeg) * p.dynDivisionN, p.dynDivisionN);
    errF(w, 'E06', 'SCALE_PARALLAX');
  }
  if (ringSpeed(w) > STILL_V || w.table.stillS < 1) {
    flags.push('MOVING');
    errF(w, 'E30', 'READ_BEFORE_STABLE', 'WARN', { inst: 'dynamometer01' });
  }
  const F = dynamometerForceN(w);
  const r = addReading(w, { kind: 'force', instrumentId: 'dynamometer01', value, unit: 'N', resolution: p.dynDivisionN, uncertainty: p.uB.dynamometerN, sourceObjectIds: ['dynamometer01'], qualityFlags: flags, trueValue: F, configVersion: w.table.configVersion });
  flagF(w, 'dynRead');
  return { ok: true, id: r.id, value };
}

function calibrateSensor(w: F101World): F101DispatchResult {
  const s = w.table.sensor;
  if (!s.connected) {
    errF(w, 'E23', 'SENSOR_NOT_CONNECTED');
    return { ok: false, code: 'NOT_CONNECTED' };
  }
  if (w.objects.massStd01?.support !== 'sensor01') return { ok: false, code: 'NEED_STANDARD' };
  s.scale = 1;
  s.calibrated = true;
  rearmErrF(w, 'E27');
  const status = w.parts.massStd01.certified?.status ?? 'verified';
  w.evidence.__sensorCalPending = status === 'pending' ? 1 : 0;
  // La calibración usa el patrón como verdad: si el patrón no está certificado, el sensor hereda su sesgo.
  if (status === 'pending') s.scale = w.params.standardMassG / w.parts.massStd01.massG;
  flagF(w, 'sensorCalibrated');
  emitF(w, 'SENSOR_CALIBRATED', status === 'pending' ? 'WARN' : 'INFO', { status });
  return { ok: true };
}

function startCapture(w: F101World): F101DispatchResult {
  const s = w.table.sensor;
  if (!s.connected) {
    errF(w, 'E23', 'SENSOR_NOT_CONNECTED');
    return { ok: false, code: 'NOT_CONNECTED' };
  }
  if (s.capture) return { ok: false, code: 'CAPTURING' };
  s.capture = { startedS: w.timeS, samples: [], transient: false, configAtStart: w.table.configVersion, configChanged: false, nextS: w.timeS };
  return { ok: true };
}

function sampleSensor(w: F101World) {
  const s = w.table.sensor;
  const c = s.capture;
  if (!c || w.timeS + 1e-9 < c.nextS) return;
  c.nextS = Math.round((c.nextS + 1 / s.rateHz) * 1e6) / 1e6;
  const fx = w.table.pinForce.x * s.scale + gaussF(w) * 0.004;
  const fy = w.table.pinForce.y * s.scale + gaussF(w) * 0.004;
  c.samples.push([w.timeS, clamp(fx, -s.rangeN, s.rangeN), clamp(fy, -s.rangeN, s.rangeN)]);
  if (Math.abs(fx) > s.rangeN || Math.abs(fy) > s.rangeN) w.evidence.__clipped = 1;
  if (ringSpeed(w) > 0.01) c.transient = true;
  if (c.samples.length > 600) c.samples.shift();
}

function stopCapture(w: F101World): F101DispatchResult {
  const s = w.table.sensor;
  const c = s.capture;
  if (!c) return { ok: false, code: 'NOT_CAPTURING' };
  s.capture = null;
  if (c.samples.length < 2) return { ok: false, code: 'TOO_SHORT' };
  const flags: string[] = [];
  const n = c.samples.length;
  const mx = c.samples.reduce((a, x) => a + x[1], 0) / n;
  const my = c.samples.reduce((a, x) => a + x[2], 0) / n;
  if (c.samples.some((x) => Math.abs(x[1]) >= s.rangeN - 1e-9 || Math.abs(x[2]) >= s.rangeN - 1e-9)) {
    flags.push('CLIPPED');
    errF(w, 'E22', 'SENSOR_CLIPPED', 'WARN', { range: s.rangeN });
  }
  if (!s.calibrated) {
    flags.push('UNCALIBRATED');
    errF(w, 'E27', 'SENSOR_UNCALIBRATED');
  }
  if (s.rateHz === 5 && (n < 10 || c.transient)) {
    flags.push('LOW_RATE');
    errF(w, 'E24', 'SAMPLING_TOO_LOW');
  }
  if (c.transient) {
    flags.push('MOVING');
    errF(w, 'E30', 'READ_BEFORE_STABLE', 'WARN', { inst: 'sensor01' });
  }
  if (c.configChanged) {
    flags.push('CONFIG_CHANGED');
    errF(w, 'E32', 'CONFIG_CHANGED_MIDRUN');
  }
  if (!w.table.pinIn) flags.push('NO_PIN');
  const trueV = { x: w.table.pinForce.x, y: w.table.pinForce.y };
  const r = addReading(w, {
    kind: 'vector', instrumentId: 'sensor01', value: Math.round(Math.hypot(mx, my) * 1e4) / 1e4, unit: 'N', resolution: 0.001, uncertainty: 0.01,
    sourceObjectIds: ['sensor01'], qualityFlags: flags, trueValue: Math.hypot(trueV.x, trueV.y), vector: { x: Math.round(mx * 1e4) / 1e4, y: Math.round(my * 1e4) / 1e4 }, configVersion: w.table.configVersion,
  });
  if (!flags.includes('CLIPPED') && w.table.pinIn && Math.hypot(mx, my) > 0.05) flagF(w, 'sensorCaptured');
  emitF(w, 'CAPTURE_DONE', 'INFO', { n, mag: r.value });
  return { ok: true, id: r.id, value: r.value };
}

// ─────────────────────────── Cierre y bloqueos ───────────────────────────

function closeStation(w: F101World): F101DispatchResult {
  const hung = PULLEYS.filter((id) => hangingOn(w, id).hangerId);
  if (hung.length) {
    errF(w, 'E20', 'MASSES_LEFT_ON', 'WARN', { n: hung.length });
    return { ok: false, code: 'MASSES_ON' };
  }
  if (w.table.dyn.onRim && dynamometerForceN(w) > 0.05) return { ok: false, code: 'DYN_TENSIONED' };
  if (w.table.sensor.capture) return { ok: false, code: 'CAPTURING' };
  if (w.water.benchMl > 0.05) return { ok: false, code: 'WATER_ON_BENCH' };
  if (w.gradCyl.parts.length) return { ok: false, code: 'PARTS_IN_CYLINDER' };
  if (w.gradCyl.cracked) return { ok: false, code: 'CYLINDER_DAMAGED' };
  if (w.caliper.part || w.micrometer.part) return { ok: false, code: 'PART_IN_INSTRUMENT' };
  w.table.pinIn = true;
  w.balance.powered = false;
  flagF(w, 'stationClosed');
  emitF(w, 'STATION_CLOSED', 'INFO');
  return { ok: true };
}

function acknowledge(w: F101World): F101DispatchResult {
  const b = w.safety.block;
  if (!b) return { ok: true };
  if (b.code === 'RING_LOOSE' && !w.table.pinIn) return { ok: false, code: 'INSERT_PIN' };
  if (b.code === 'DYN_SNAP' && w.table.dyn.onRim) return { ok: false, code: 'DISMOUNT' };
  w.safety.block = null;
  emitF(w, 'STATION_RESET', 'INFO', { code: b.code });
  return { ok: true };
}

// ─────────────────────────── Paso de simulación ───────────────────────────

function stepCylinder(w: F101World, dt: number) {
  const g = w.gradCyl;
  if (g.cracked && g.waterMl > 0) {
    const leak = Math.min(g.waterMl, 0.4 * dt);
    g.waterMl -= leak;
    g.leakedMl += leak;
    w.water.benchMl += leak;
  }
  // La espuma se deshace con el tiempo; en el escenario S05 una capa fina persiste hasta golpear suavemente.
  const floor = sc(w, SF.FOAM) && !w.evidence.cylinderTapped ? 0.8 : 0;
  if (g.foamMl > floor) g.foamMl = Math.max(floor, g.foamMl - 0.08 * dt);
}

export function stepF101World(w: F101World): void {
  const p = w.params;
  const dt = p.dtS;
  w.timeS = Math.round((w.timeS + dt) * 1e6) / 1e6;
  w.tick++;
  stepRing(w, dt);
  sampleSensor(w);
  stepCylinder(w, dt);
  const b = w.balance;
  if (b.powered) {
    // Base inestable o desnivelada: la lectura oscila (ruido 20×) y no estabiliza (E07).
    const bp = b.levelErrorDeg > 0.5 ? { ...p.balance, noiseClosedG: p.balance.noiseClosedG * 20 } : p.balance;
    stepAnalyticalBalance(b, panLoadG(w), bp, dt, w.timeS, gaussF(w));
  }
}

export function runF101For(w: F101World, seconds: number) {
  const n = Math.round(seconds / w.params.dtS);
  for (let i = 0; i < n; i++) stepF101World(w);
}

export function f101Summary(w: F101World) {
  return {
    water: Math.round(waterTotal(w) * 1e6) / 1e6,
    cyl: Math.round(cylinderContentMl(w) * 1e4) / 1e4,
    ring: [Math.round(w.table.ring.x * 1e6) / 1e6, Math.round(w.table.ring.y * 1e6) / 1e6],
    readings: w.readingOrder.length,
    bal: Math.round(w.balance.shownG * 1e4) / 1e4,
    cfg: w.table.configVersion,
  };
}
