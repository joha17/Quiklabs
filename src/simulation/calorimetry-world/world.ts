/**
 * Mundo de la Práctica 6 (calorimetría): paso fijo determinista. Nodos térmicos acoplados (§12.3, §14.2):
 * plantilla → baño → vidrio del tubo → metal; en el calorímetro, metal → capa inferior del agua ⇄ capa superior →
 * vaso → ambiente. Los termómetros siguen a su sensor con retardo (§9.2). La balanza es la de triple brazo (§7).
 * El agua y el metal conservan su masa entre recipientes, derrames y evaporación (§6.4, §30.1).
 */
import type { P6Command, P6DispatchResult } from './commands';
import type {
  MassReading, P6Object, P6Params, P6World, Pose, Run, Severity, SimEvent, TempReading, TubeState, VolumeReading, WaterVessel,
} from './types';
import { hashRandom, hashRange, rand } from '../core/rng';
import { boilingPointC } from '../calorimetry/heat';
import { METALS, type MetalId } from '../calorimetry/materials';
import { beamTarget, newTripleBeam, readingValidity, riderValue, stepTripleBeam, zeroOk, type BeamLoad } from '../instruments/triple-beam';
import { dispatchBomb, newBombState, stepBomb } from './bomb';

const LATENT_J_PER_G = 2257;
const C_W = 4.18;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export interface CalorWorldSpec {
  objects: Array<Omit<P6Object, 'pose'> & { pose: Pose }>;
  vessels: WaterVessel[];
  /** Frascos de piezas: metal y número de piezas. */
  jars: Array<{ id: string; metal: MetalId; count: number }>;
  tubes: Array<{ id: string; glassMassG: number }>;
  thermometers: string[];
  scenarios: string[];
}

// ─────────────────────────── Eventos y utilidades ───────────────────────────

export function emit6(w: P6World, code: string, severity: Severity, params?: SimEvent['params']): SimEvent {
  const seq = (w.evidence.__eventSeq ?? 0) + 1;
  w.evidence.__eventSeq = seq;
  const e: SimEvent = { seq, t: w.timeS, code, severity, params };
  w.events.push(e);
  if (w.events.length > 600) w.events.splice(0, w.events.length - 600);
  return e;
}
function latch(w: P6World, key: string, code: string, severity: Severity, params?: SimEvent['params']) {
  if (w.evidence[`latch:${key}`]) return;
  w.evidence[`latch:${key}`] = 1;
  emit6(w, code, severity, params);
}
const rearm = (w: P6World, key: string) => {
  if (w.evidence[`latch:${key}`]) w.evidence[`latch:${key}`] = 0;
};
export const bump = (w: P6World, key: string, by = 1) => {
  w.evidence[key] = (w.evidence[key] ?? 0) + by;
};
export const flag = (w: P6World, key: string) => {
  if (!w.evidence[key]) w.evidence[key] = Math.max(0.01, Math.round(w.timeS * 100) / 100);
};
const gauss = (w: P6World) => (rand(w) + rand(w) + rand(w) - 1.5) * 2;

// ─────────────────────────── Creación ───────────────────────────

export function createCalorWorld(spec: CalorWorldSpec, seed: number, params: P6Params): P6World {
  const sc = (s: string) => spec.scenarios.includes(s);
  const amb = params.ambientC;
  const objects: Record<string, P6Object> = {};
  for (const o of spec.objects) objects[o.id] = { ...o, pose: { ...o.pose } };
  const vessels: Record<string, WaterVessel> = {};
  for (const v of spec.vessels) vessels[v.id] = { ...v };
  if (sc('WET_CYLINDER') && vessels.cylinder) vessels.cylinder.wetG = 0.6;
  const sourceWaterC = amb - hashRange(seed, 'srcT', 0.6, 2.0);
  for (const v of Object.values(vessels)) v.waterC = v.waterG > 0 ? sourceWaterC : amb;
  const pieces: P6World['pieces'] = {};
  for (const j of spec.jars) {
    const m = METALS[j.metal];
    for (let i = 0; i < j.count; i++) {
      const id = `${j.id}_${i}`;
      pieces[id] = { id, metal: j.metal, massG: Math.round(hashRange(seed, id, m.pieceMassG[0], m.pieceMassG[1]) * 1000) / 1000, loc: `jar:${j.id}`, tempC: amb };
    }
  }
  const tubes: P6World['tubes'] = {};
  for (const t of spec.tubes) {
    tubes[t.id] = {
      id: t.id, glassMassG: t.glassMassG, glassC: amb, metalC: amb, waterG: 0, wetG: sc('WET_TUBE') && t.id === 'tube_fe' ? 0.35 : 0,
      cracked: sc('CRACKED_TUBE') && t.id === 'tube_x', bottomAboveFloorCm: 2, inspected: false, hot: 'COLD', liftedAt: null, metalCAtLift: null, boilingSoakS: 0,
    };
  }
  // Variación entre muestras reales (§15.3): el valor efectivo cae dentro del intervalo del material.
  const sampleCp: P6World['sampleCp'] = {};
  for (const j of spec.jars) {
    const m = METALS[j.metal];
    const u = (hashRandom(seed, `cp:${j.metal}`) - 0.5) * params.sampleDispersion;
    sampleCp[j.metal] = Math.round((m.cp + u * (m.cpRange[1] - m.cpRange[0])) * 10000) / 10000;
  }
  const thermos: P6World['thermos'] = {};
  for (const id of spec.thermometers) {
    thermos[id] = {
      id, displayedC: amb, timeConstantS: params.thermometer.timeConstantS, resolutionC: params.thermometer.resolutionC,
      offsetC: sc('THERMO_OFFSET') && id === 'therm_cal' ? 0.6 : 0, depth: 0.5, broken: false, sensorC: amb,
    };
  }
  const zero = (hashRange(seed, 'zero', 0, 1) < 0.5 ? -1 : 1) * hashRange(seed, 'zeroMag', 0.12, 0.4) * (sc('ZERO_OFF') ? 3 : 1);
  const w: P6World = {
    timeS: 0, tick: 0, seed, rng: seed >>> 0 || 1, params, objects,
    balance: newTripleBeam(zero, { levelErrorDeg: sc('UNLEVEL') ? 2.5 : 0, airCurrent: sc('DRAFT') ? 0.6 : 0.03 }),
    vessels, pieces, tubes, thermos, sampleCp,
    plate: { knob: 0, plateC: amb, powerW: 0 },
    bath: { boilingC: boilingPointC(params.pressureKPa), vigor: 0, evaporatedG: 0, splashedG: 0 },
    cal: { lidClosed: false, lidOpenS: 0, stir: 0, topC: amb, bottomC: amb, metalC: amb, cupC: amb, splashLossG: 0, evaporatedG: 0, lossToAmbientJ: 0, state: 'EMPTY' },
    sourceWaterC, pours: {}, runs: [], massReadings: [], volumeReadings: [], tempReadings: [],
    series: { cal: [], bath: [], metalTrue: [], waterTrue: [] },
    bomb: newBombState(params, sc('DAMAGED_SEAL')),
    spilledG: 0,
    safety: { ppe: false, block: null, incident: null, stoppedByTeacher: false, burns: 0, lastInteractionS: 0 },
    stopwatch: { running: false, startedAt: null, accumulatedS: 0 },
    events: [], evidence: {}, scenarios: [...spec.scenarios], ppe: false, initialWaterG: 0, initialMetalG: 0,
  };
  w.initialWaterG = totalWaterG(w);
  w.initialMetalG = Object.values(pieces).reduce((s, p) => s + p.massG, 0);
  return w;
}

// ─────────────────────────── Consultas ───────────────────────────

export const piecesAt = (w: P6World, loc: string) => Object.values(w.pieces).filter((p) => p.loc === loc);
export const metalGAt = (w: P6World, loc: string) => piecesAt(w, loc).reduce((s, p) => s + p.massG, 0);

/** Metal (especie) mayoritario en una ubicación. */
export function metalAt(w: P6World, loc: string): MetalId | null {
  const acc: Partial<Record<MetalId, number>> = {};
  for (const p of piecesAt(w, loc)) acc[p.metal] = (acc[p.metal] ?? 0) + p.massG;
  const best = Object.entries(acc).sort((a, b) => b[1] - a[1])[0];
  return best ? (best[0] as MetalId) : null;
}

/** Calor específico efectivo de una pieza (constante o dependiente de T, §14.6). */
export function cpOf(w: P6World, metal: MetalId, tC: number): number {
  const m = METALS[metal];
  const base = w.sampleCp[metal] ?? m.cp;
  return w.params.cpModel === 'T_DEPENDENT' ? base + m.dCpdT * (tC - 25) : base;
}

/** Capacidad calorífica (J/°C) del metal en una ubicación. */
export const metalHeatCap = (w: P6World, loc: string, tC: number) => piecesAt(w, loc).reduce((s, p) => s + p.massG * cpOf(w, p.metal, tC), 0);

export function totalWaterG(w: P6World): number {
  return Object.values(w.vessels).reduce((s, v) => s + v.waterG + v.wetG, 0) + Object.values(w.tubes).reduce((s, t) => s + t.waterG + t.wetG, 0)
    + w.spilledG + w.bath.evaporatedG + w.bath.splashedG + w.cal.splashLossG + w.cal.evaporatedG;
}
export const totalMetalG = (w: P6World) => Object.values(w.pieces).reduce((s, p) => s + p.massG, 0);

/** Temperatura de un tubo para manipularlo (lo más caliente entre vidrio y metal). */
export const tubeTempC = (t: TubeState) => Math.max(t.glassC, t.metalC);

/** Masa y temperatura de lo que hay en el platillo. */
export function panLoad(w: P6World): BeamLoad {
  const id = w.balance.panObjectId;
  if (!id) return { massG: 0, temperatureC: w.params.ambientC };
  return objectLoad(w, id);
}

export function objectLoad(w: P6World, id: string): BeamLoad {
  const v = w.vessels[id];
  if (v) return { massG: v.glassMassG + v.waterG + v.wetG, temperatureC: Math.max(v.waterC, w.params.ambientC) };
  const t = w.tubes[id];
  if (t) return { massG: t.glassMassG + metalGAt(w, `tube:${id}`) + t.waterG + t.wetG, temperatureC: tubeTempC(t) };
  const k = w.objects[id]?.kind;
  return { massG: k === 'spatula' ? 18 : k === 'thermometer' ? 22 : 5, temperatureC: w.params.ambientC };
}

export const balanceTargetG = (w: P6World) => beamTarget(w.balance, panLoad(w), w.params.ambientC, w.params.balance);

/** Geometría del tubo en el baño. */
export function tubeInBath(w: P6World, tubeId: string) {
  const t = w.tubes[tubeId];
  const b = w.vessels.beaker;
  const p = w.params;
  const level = b.waterG / b.areaCm2;
  const pieces = piecesAt(w, `tube:${tubeId}`);
  const vol = pieces.reduce((s, x) => s + x.massG / METALS[x.metal].density, 0) / 0.62;
  const metalH = Math.max(0.3, vol / p.tubeAreaCm2);
  const hb = t.bottomAboveFloorCm;
  const inBath = w.objects[tubeId]?.support === 'bath';
  return {
    inBath, levelCm: level, metalHCm: metalH,
    metalSubmerged: inBath ? clamp((level - hb) / metalH, 0, 1) : 0,
    tubeSubmerged: inBath ? clamp((level - hb) / p.tubeLengthCm, 0, 1) : 0,
    mouthUnder: inBath && hb + p.tubeLengthCm < level + 0.2,
    mouthNearSurface: inBath && hb + p.tubeLengthCm < level + 2,
    onBottom: inBath && hb < 0.3,
  };
}

export const isLidClosed = (w: P6World) => w.cal.lidClosed;
export const cupWaterG = (w: P6World) => w.vessels.cup.waterG;
export const activeRun = (w: P6World): Run | null => {
  const r = w.runs[w.runs.length - 1];
  return r && r.endedS === null ? r : null;
};

/** Temperatura media verdadera del agua del calorímetro. */
export const cupWaterC = (w: P6World) => w.cal.topC * (1 - w.params.bottomFraction) + w.cal.bottomC * w.params.bottomFraction;

/** Energía interna (J) del sistema calorimétrico respecto de 0 °C (para el balance §30.1). */
export function calorimeterEnergyJ(w: P6World): number {
  const p = w.params;
  const mw = w.vessels.cup.waterG;
  const metal = piecesAt(w, 'cup').reduce((s, x) => s + x.massG * cpOf(w, x.metal, w.cal.metalC) * w.cal.metalC, 0);
  const cup = p.model === 'IDEAL' ? 0 : p.cupHeatCapJPerC * w.cal.cupC;
  return mw * C_W * cupWaterC(w) + metal + cup;
}

/** ¿Hay todavía cambio en la lectura del termómetro? (°C/s en los últimos `s` segundos). */
export function displayedSlope(w: P6World, seriesKey: 'cal' | 'bath', s = 8): number {
  const ser = w.series[seriesKey];
  if (ser.length < 2) return 0;
  const last = ser[ser.length - 1];
  let i = ser.length - 1;
  while (i > 0 && last.t - ser[i].t < s) i--;
  const first = ser[i];
  return last.t > first.t ? (last.c - first.c) / (last.t - first.t) : 0;
}

export const thermoWhere = (w: P6World, id: string): TempReading['where'] => {
  const s = w.objects[id]?.support;
  return s === 'cup' ? 'cup' : s === 'bath' ? 'bath' : 'air';
};

// ─────────────────────────── Comandos ───────────────────────────

export function dispatchCalor(w: P6World, cmd: P6Command): P6DispatchResult {
  if (w.safety.stoppedByTeacher && cmd.type !== 'teacherStop') return { ok: false, code: 'TEACHER_STOP' };
  if (cmd.type !== 'setPose') w.safety.lastInteractionS = w.timeS;
  switch (cmd.type) {
    case 'confirmPpe':
      w.ppe = true;
      w.safety.ppe = true;
      flag(w, 'ppe');
      return { ok: true };
    case 'setPose':
      return setPose(w, cmd.id, cmd.pose, cmd.support);
    case 'inspect':
      return inspect(w, cmd.target);
    case 'setRider': {
      w.balance.riders[cmd.beam] = riderValue(cmd.beam, cmd.valueG);
      w.balance.disturbedAt = w.timeS;
      return { ok: true, value: w.balance.riders[cmd.beam] };
    }
    case 'turnZeroScrew': {
      const b = w.balance;
      b.zeroScrewG = clamp(b.zeroScrewG + cmd.deltaG, -3, 3);
      b.disturbedAt = w.timeS;
      if (b.panObjectId || b.riders.some((r) => r > 0)) {
        b.calibratedAt = null;
        emit6(w, 'ZERO_ADJUSTED_WITH_LOAD', 'WARN');
        bump(w, 'err:zeroWithLoad');
      } else if (b.calibratedAt !== null && Math.abs(cmd.deltaG) > 1e-9) b.calibratedAt = null;
      return { ok: true, value: b.zeroScrewG };
    }
    case 'levelBalance':
      w.balance.levelErrorDeg = 0;
      w.balance.calibratedAt = null;
      emit6(w, 'BALANCE_LEVELED', 'INFO');
      return { ok: true };
    case 'readBalance': {
      const m = readBalance(w);
      return { ok: m.valid, code: m.invalidReason, id: m.id, value: m.displayedMassG };
    }
    case 'shieldDraft':
      w.balance.airCurrent = cmd.on ? 0.03 : 0.6;
      return { ok: true };
    case 'setPour':
      return setPour(w, cmd.sourceId, cmd.targetId, cmd.tiltDeg);
    case 'stopPour': {
      const pr = w.pours[cmd.sourceId];
      if (!pr) return { ok: true };
      delete w.pours[cmd.sourceId];
      emit6(w, 'POUR_DONE', 'INFO', { g: Math.round(pr.transferredG * 10) / 10, from: cmd.sourceId, to: pr.targetId ?? 'bench' });
      return { ok: true, value: pr.transferredG };
    }
    case 'squeeze': {
      const src = w.vessels.wash;
      const g = Math.min(src.waterG, Math.max(0, Math.round(cmd.drops)) * 0.05);
      if (g <= 0) return { ok: false, code: 'EMPTY' };
      transferWater(w, 'wash', cmd.targetId, g);
      return { ok: true, value: g };
    }
    case 'readCylinder':
      return readCylinder(w, cmd.eyeDzCm);
    case 'dry': {
      const v = w.vessels[cmd.id];
      const t = w.tubes[cmd.id];
      if (v) {
        if (v.waterG > 0.5) return { ok: false, code: 'NOT_EMPTY' };
        v.wetG = 0;
        v.waterG = 0;
      } else if (t) {
        if (metalGAt(w, `tube:${t.id}`) > 0) return { ok: false, code: 'NOT_EMPTY' };
        if (tubeTempC(t) > w.params.ambientC + 15) return { ok: false, code: 'HOT' };
        t.wetG = 0;
        t.waterG = 0;
      } else return { ok: false };
      emit6(w, 'DRIED', 'INFO', { id: cmd.id });
      return { ok: true };
    }
    case 'pickPiece':
      return pickPiece(w, cmd.from);
    case 'dropPiece':
      return dropPiece(w, cmd.to);
    case 'pourMetal':
      return pourMetal(w, cmd.tubeId, cmd.targetId, cmd.dropHeightCm, cmd.offsetCm);
    case 'emptyCup':
      return emptyCup(w);
    case 'setPlate': {
      w.plate.knob = clamp(cmd.knob, 0, 1);
      if (w.plate.knob > 0.05 && w.objects.beaker.support === 'plate' && w.vessels.beaker.waterG < 40) latch(w, 'dryBeaker', 'BATH_LOW', 'WARN');
      return { ok: true };
    }
    case 'setTubeDepth': {
      const t = w.tubes[cmd.tubeId];
      if (!t || w.objects[cmd.tubeId].support !== 'bath') return { ok: false, code: 'NOT_IN_BATH' };
      t.bottomAboveFloorCm = clamp(cmd.bottomAboveFloorCm, 0, 12);
      checkTubeInBath(w, t.id);
      return { ok: true };
    }
    case 'setLid':
      return setLid(w, cmd.closed);
    case 'stir': {
      if (w.objects.stirrer.support !== 'cup') return { ok: false, code: 'NO_STIRRER' };
      const s = clamp(cmd.intensity, 0, 1);
      w.cal.stir = Math.max(w.cal.stir, s);
      bump(w, 'stirS');
      if (s > 0.85) {
        latch(w, 'violent', 'VIOLENT_STIRRING', 'WARN');
        bump(w, 'err:violentStir');
      }
      return { ok: true };
    }
    case 'setThermoDepth': {
      const th = w.thermos[cmd.id];
      if (!th) return { ok: false };
      th.depth = clamp(cmd.depth, 0, 1);
      return { ok: true };
    }
    case 'readThermometer':
      return readThermometer(w, cmd.id, !!cmd.peak);
    case 'touchHot': {
      const T = hotTemp(w, cmd.id);
      if (T > 55) {
        burn(w, cmd.id, T);
        return { ok: false, code: 'BURN' };
      }
      return { ok: true };
    }
    case 'bomb':
      return dispatchBomb(w, cmd.cmd);
    case 'stopwatch': {
      const sw = w.stopwatch;
      if (cmd.action === 'START' && !sw.running) {
        sw.running = true;
        sw.startedAt = w.timeS;
      } else if (cmd.action === 'STOP' && sw.running) {
        sw.accumulatedS += w.timeS - (sw.startedAt ?? w.timeS);
        sw.running = false;
        sw.startedAt = null;
      } else if (cmd.action === 'RESET') {
        sw.running = false;
        sw.startedAt = null;
        sw.accumulatedS = 0;
      }
      return { ok: true };
    }
    case 'acknowledge': {
      const b = w.safety.block;
      if (!b) {
        if (w.safety.incident) {
          w.safety.incident = null;
          emit6(w, 'INCIDENT_RESOLVED', 'INFO');
        }
        return { ok: true };
      }
      if (b.code === 'BEAKER_DRY' && w.plate.plateC > w.params.ambientC + 60) return { ok: false, code: 'WAIT_COOL' };
      if (b.code === 'OPEN_PRESSURIZED' && w.bomb.pressureAtm > 0) return { ok: false, code: 'STILL_PRESSURIZED' };
      w.safety.block = null;
      emit6(w, 'STATION_RESET', 'INFO', { code: b.code });
      return { ok: true };
    }
    case 'teacherStop':
      w.safety.stoppedByTeacher = cmd.on;
      if (cmd.on) w.plate.knob = 0;
      return { ok: true };
  }
  return { ok: false, code: 'UNKNOWN' };
}

export function setBlock(w: P6World, code: string) {
  if (w.safety.block?.code === code) return;
  w.safety.block = { code, since: w.timeS };
  // Parada segura: se apaga la plantilla.
  w.plate.knob = 0;
}

function burn(w: P6World, id: string, T: number) {
  w.safety.burns += 1;
  emit6(w, 'BURN', 'ALERT', { obj: id, tempC: Math.round(T) });
  bump(w, 'err:burn');
  w.safety.incident = { code: 'BURN', since: w.timeS, needs: ['FIRST_AID'], done: [] };
}

/** Temperatura de contacto de un objeto. */
function hotTemp(w: P6World, id: string): number {
  if (w.tubes[id]) return tubeTempC(w.tubes[id]);
  if (id === 'beaker') return w.vessels.beaker.waterG > 0 ? w.vessels.beaker.waterC : w.plate.plateC * 0.5;
  if (id === 'hotplate') return w.plate.plateC;
  return w.params.ambientC;
}

function inspect(w: P6World, target: string): P6DispatchResult {
  flag(w, `inspected:${target}`);
  const v = w.vessels[target];
  if (v && v.wetG > 0.05 && v.waterG < 0.5) emit6(w, 'VESSEL_WET', 'WARN', { id: target });
  const t = w.tubes[target];
  if (t) {
    t.inspected = true;
    if (t.cracked) emit6(w, 'TUBE_CRACK_FOUND', 'WARN', { id: target });
    if (t.wetG > 0.05) emit6(w, 'VESSEL_WET', 'WARN', { id: target });
  }
  if (target === 'balance') {
    if (w.balance.levelErrorDeg > 0.5) emit6(w, 'BALANCE_UNLEVEL', 'WARN');
    if (w.balance.airCurrent > 0.3) emit6(w, 'DRAFT_NEAR_BALANCE', 'WARN');
  }
  if (target === 'therm_cal' || target === 'therm_bath') {
    const th = w.thermos[target];
    if (th.offsetC !== 0) emit6(w, 'THERMO_OFFSET_FOUND', 'WARN', { id: target });
  }
  emit6(w, 'INSPECTED', 'INFO', { target });
  return { ok: true };
}

function setPose(w: P6World, id: string, pose: Pose, support?: string): P6DispatchResult {
  const o = w.objects[id];
  if (!o) return { ok: false, code: 'NO_OBJECT' };
  const prev = o.support;
  const amb = w.params.ambientC;
  if (support && support !== prev) {
    // Tomar con la mano algo caliente: quemadura simulada (tubos con la pinza; el beaker caliente no se mueve).
    if (support === 'hand' && hotTemp(w, id) > 55 && (w.tubes[id] || id === 'beaker')) {
      burn(w, id, hotTemp(w, id));
      return { ok: false, code: 'BURN' };
    }
    if (prev === 'pan') {
      w.balance.panObjectId = null;
      w.balance.touchingHousing = false;
      w.balance.disturbedAt = w.timeS;
    }
    if (support === 'pan') {
      if (w.balance.panObjectId && w.balance.panObjectId !== id) return { ok: false, code: 'PAN_BUSY' };
      w.balance.panObjectId = id;
      w.balance.disturbedAt = w.timeS;
      // Un objeto mal centrado o muy grande roza la carcasa (§7.4).
      w.balance.touchingHousing = Math.abs(pose.x - (w.objects.balance.pose.x - 16)) > 4.5 || Math.abs(pose.y - w.objects.balance.pose.y) > 4.5;
      if (w.balance.touchingHousing) emit6(w, 'TOUCHING_HOUSING', 'WARN');
      const L = objectLoad(w, id);
      if (L.temperatureC > amb + w.params.balance.allowedDeltaC) latch(w, `hotPan:${id}`, 'HOT_ON_BALANCE', 'WARN', { tempC: Math.round(L.temperatureC) });
    }
    const t = w.tubes[id];
    if (t) {
      if (prev === 'bath') {
        // Sale del baño: empieza el traslado (§13.2).
        t.liftedAt = w.timeS;
        t.metalCAtLift = t.metalC;
        w.evidence[`bathAtLift:${id}`] = w.vessels.beaker.waterC;
        if (support === 'hand' || support === 'bench') {
          emit6(w, 'HOT_TUBE_HANDLING', 'WARN');
          bump(w, 'err:hotHandling');
        }
      }
      if (support === 'bath') {
        if (w.objects.beaker.support !== 'plate' && w.objects.beaker.support !== 'bench') return { ok: false, code: 'NO_BATH' };
        t.liftedAt = null;
        if (t.cracked) emit6(w, 'CRACKED_TUBE_IN_BATH', 'ALERT');
        flag(w, `inBath:${id}`);
        checkTubeInBath(w, id);
      }
    }
    if (id === 'beaker' && support === 'plate') flag(w, 'beakerOnPlate');
    if (w.thermos[id]) {
      if (support === 'cup') flag(w, 'thermoInCup');
      if (support === 'bath') flag(w, 'thermoInBath');
    }
    if (id === 'stirrer' && support === 'cup') flag(w, 'stirrerInCup');
  }
  o.pose = { ...pose };
  if (support) o.support = support;
  return { ok: true };
}

function checkTubeInBath(w: P6World, tubeId: string) {
  const g = tubeInBath(w, tubeId);
  if (!g.inBath) return;
  if (g.mouthUnder) latch(w, `mouth:${tubeId}`, 'TUBE_MOUTH_UNDER', 'WARN');
  else rearm(w, `mouth:${tubeId}`);
  if (g.onBottom) {
    latch(w, `bottom:${tubeId}`, 'TUBE_ON_BOTTOM', 'WARN');
    bump(w, 'err:tubeBottom');
  } else rearm(w, `bottom:${tubeId}`);
  if (metalGAt(w, `tube:${tubeId}`) > 0 && g.metalSubmerged < 0.95) {
    if (!w.evidence[`latch:above:${tubeId}`]) bump(w, 'err:metalAbove');
    latch(w, `above:${tubeId}`, 'METAL_ABOVE_LEVEL', 'WARN');
  }
  else rearm(w, `above:${tubeId}`);
}

// ─────────────────────────── Agua ───────────────────────────

const POUR_K: Record<string, number> = { water_bottle: 30, cylinder: 10, beaker: 22, cup: 14, wash: 6 };
const HOLDUP_G: Record<string, number> = { water_bottle: 2, cylinder: 0.25, beaker: 0.9, cup: 0.6, wash: 1, sink: 0 };

function setPour(w: P6World, sourceId: string, targetId: string | null, tiltDeg: number): P6DispatchResult {
  const src = w.vessels[sourceId];
  if (!src) return { ok: false, code: 'NOT_A_VESSEL' };
  if (targetId === 'cup' && w.cal.lidClosed) return { ok: false, code: 'LID_CLOSED' };
  if (targetId && !w.vessels[targetId]) return { ok: false, code: 'BAD_TARGET' };
  const pr = w.pours[sourceId];
  if (pr) {
    if (pr.targetId !== targetId) {
      pr.targetId = targetId;
    }
    pr.tiltDeg = tiltDeg;
  } else w.pours[sourceId] = { sourceId, targetId, tiltDeg, startedS: w.timeS, transferredG: 0 };
  return { ok: true };
}

/** Caudal (g/s) a partir de la inclinación y el llenado (§6.2): sale cuando la superficie cruza el borde. */
export function pourRate(v: WaterVessel, tiltDeg: number, k: number): number {
  const fill = clamp((v.waterG / Math.max(1, v.capacityMl)), 0, 1.2);
  const tilt0 = 100 - 88 * Math.min(1, fill);
  if (tiltDeg <= tilt0 || v.waterG <= 0) return 0;
  return k * ((tiltDeg - tilt0) / 30) ** 1.5;
}

/** Pasa agua de un recipiente a otro (o a la mesada) mezclando temperaturas. */
export function transferWater(w: P6World, fromId: string, toId: string | null, g: number) {
  const from = w.vessels[fromId];
  const gg = Math.min(g, from.waterG);
  if (gg <= 0) return 0;
  from.waterG -= gg;
  if (!toId) {
    w.spilledG += gg;
    latch(w, `spill:${fromId}`, 'WATER_SPILLED', 'WARN');
    bump(w, 'err:spill');
    return gg;
  }
  const to = w.vessels[toId];
  const cap = to.capacityMl * 1.02;
  const room = Math.max(0, cap - to.waterG);
  const inG = Math.min(gg, room);
  const over = gg - inG;
  if (toId === 'cup') {
    // Entra al calorímetro: mezcla con ambas capas según su proporción.
    const mw = to.waterG;
    const T = mw > 0 ? cupWaterC(w) : w.cal.cupC;
    const Tm = (mw * T + inG * from.waterC) / Math.max(1e-9, mw + inG);
    w.cal.topC = mw > 0 ? (w.cal.topC * mw + inG * from.waterC) / (mw + inG) : Tm;
    w.cal.bottomC = mw > 0 ? (w.cal.bottomC * mw + inG * from.waterC) / (mw + inG) : Tm;
    to.waterC = Tm;
    if (mw <= 0) w.cal.state = 'WATER_LOADED';
  } else {
    to.waterC = (to.waterG * to.waterC + inG * from.waterC) / Math.max(1e-9, to.waterG + inG);
  }
  to.waterG += inG;
  if (over > 0) {
    w.spilledG += over;
    latch(w, `over:${toId}`, 'OVERFLOW', 'WARN', { id: toId });
  }
  if (fromId === 'cylinder' || fromId === 'cup' || fromId === 'beaker') {
    // El recipiente queda mojado: parte del agua no sale.
    const hold = Math.min(HOLDUP_G[fromId] ?? 0, from.waterG);
    if (from.waterG <= HOLDUP_G[fromId]) {
      from.wetG += hold;
      from.waterG -= hold;
    }
  }
  return gg;
}

function stepPours(w: P6World, dt: number) {
  for (const pr of Object.values(w.pours)) {
    const src = w.vessels[pr.sourceId];
    const rate = pourRate(src, pr.tiltDeg, POUR_K[pr.sourceId] ?? 10);
    if (rate <= 0) continue;
    const g = Math.min(rate * dt, Math.max(0, src.waterG - 0));
    if (g <= 0) continue;
    pr.transferredG += transferWater(w, pr.sourceId, pr.targetId, g);
    // Verter muy rápido salpica (§6.2).
    if (rate > 25 && pr.targetId && rand(w) < dt * 0.4) {
      const splash = Math.min(0.5, w.vessels[pr.targetId].waterG * 0.002);
      w.vessels[pr.targetId].waterG -= splash;
      w.spilledG += splash;
      latch(w, `splash:${pr.sourceId}`, 'POUR_SPLASH', 'WARN');
    }
  }
}

function readCylinder(w: P6World, eyeDzCm: number): P6DispatchResult {
  const c = w.vessels.cylinder;
  const o = w.objects.cylinder;
  if (o.support !== 'bench' && o.support !== 'pan') return { ok: false, code: 'NOT_UPRIGHT' };
  const trueMl = c.waterG / 0.9978;
  // Paralaje: mirar desde arriba lee de más; desde abajo, de menos (§8.2).
  const bias = clamp(eyeDzCm * 0.12, -2, 2);
  const noise = (hashRandom(w.seed, `vol${w.volumeReadings.length}`) - 0.5) * 0.2;
  const valueMl = Math.round((trueMl + bias + noise) * 10) / 10;
  const atEye = Math.abs(eyeDzCm) < 1;
  const r: VolumeReading = { id: `v${w.volumeReadings.length + 1}`, t: w.timeS, valueMl, trueMl, eyeDzCm, atEyeLevel: atEye };
  w.volumeReadings.push(r);
  if (!atEye) {
    emit6(w, 'PARALLAX', 'WARN', { dir: eyeDzCm > 0 ? 'above' : 'below' });
    bump(w, 'err:parallax');
  } else emit6(w, 'VOLUME_READ', 'INFO', { ml: valueMl });
  return { ok: atEye, id: r.id, value: valueMl, code: atEye ? undefined : 'PARALLAX' };
}

// ─────────────────────────── Balanza ───────────────────────────

function readBalance(w: P6World): MassReading {
  const b = w.balance;
  const p = w.params;
  const load = panLoad(w);
  const v = readingValidity(b, load, p.ambientC, p.balance);
  const id = b.panObjectId;
  const vessel = id ? w.vessels[id] : undefined;
  const tube = id ? w.tubes[id] : undefined;
  const loc = tube ? `tube:${tube.id}` : '';
  const m: MassReading = {
    id: `m${w.massReadings.length + 1}`,
    displayedMassG: v.displayed,
    trueMassG: load.massG,
    resolutionG: p.balance.resolutionG,
    uncertaintyG: p.balance.uncertaintyG,
    stable: b.stable && v.centered,
    zeroCorrected: v.calibrated,
    loadTemperatureC: Math.round(load.temperatureC * 10) / 10,
    timestampMs: Math.round(w.timeS * 1000),
    objectId: id,
    valid: !v.invalid,
    invalidReason: v.invalid,
    zeroCheck: v.zeroCheck,
    waterG: vessel ? vessel.waterG : tube ? tube.waterG : 0,
    wetG: vessel ? vessel.wetG : tube ? tube.wetG : 0,
    metalG: tube ? metalGAt(w, loc) : 0,
    metal: tube ? metalAt(w, loc) : null,
    runsBefore: w.runs.length,
  };
  w.massReadings.push(m);
  if (v.zeroCheck) {
    if (b.stable && v.centered && zeroOk(b)) {
      b.calibratedAt = w.timeS;
      flag(w, 'calibrated');
      emit6(w, 'BALANCE_CALIBRATED', 'INFO');
    } else {
      emit6(w, b.stable ? 'ZERO_NOT_ADJUSTED' : 'BALANCE_NOT_SETTLED', 'WARN');
      bump(w, 'err:zero');
    }
  } else if (v.invalid === 'HOT_LOAD') {
    emit6(w, 'HOT_WEIGHING', 'WARN', { tempC: Math.round(load.temperatureC) });
    bump(w, 'err:hotWeigh');
  } else if (v.invalid === 'UNSTABLE') {
    emit6(w, 'READING_UNSTABLE', 'WARN');
    bump(w, 'err:unstable');
  } else if (v.invalid === 'NOT_CALIBRATED') {
    emit6(w, 'READING_UNCALIBRATED', 'WARN');
    bump(w, 'err:uncalibrated');
  } else if (v.invalid === 'TOUCHING') {
    emit6(w, 'READING_TOUCHING', 'WARN');
    bump(w, 'err:touching');
  } else if (m.valid) {
    emit6(w, 'READING_RECORDED', 'INFO', { g: m.displayedMassG });
    if (m.wetG > 0.05 && m.waterG < 0.5) {
      // Pesar «vacío» un recipiente mojado (§21.1).
      latch(w, `wetWeigh:${id}`, 'WEIGHED_WET', 'WARN', { id: id ?? '' });
      bump(w, 'err:wetWeigh');
    }
  }
  return m;
}

// ─────────────────────────── Metal ───────────────────────────

function pickPiece(w: P6World, from: string): P6DispatchResult {
  if (piecesAt(w, 'spatula').length) return { ok: false, code: 'SPATULA_LOADED' };
  const src = piecesAt(w, from);
  if (!src.length) return { ok: false, code: 'EMPTY' };
  if (from.startsWith('tube:') && tubeTempC(w.tubes[from.slice(5)]) > w.params.ambientC + 15) return { ok: false, code: 'HOT' };
  const p = src[src.length - 1];
  p.loc = 'spatula';
  return { ok: true, value: p.massG };
}

function dropPiece(w: P6World, to: string): P6DispatchResult {
  const p = piecesAt(w, 'spatula')[0];
  if (!p) return { ok: false, code: 'SPATULA_EMPTY' };
  if (to.startsWith('tube:')) {
    const t = w.tubes[to.slice(5)];
    if (!t) return { ok: false };
    if (tubeTempC(t) > w.params.ambientC + 15) return { ok: false, code: 'HOT' };
    const there = metalAt(w, to);
    if (there && there !== p.metal) {
      latch(w, `mixed:${t.id}`, 'MIXED_METALS', 'WARN');
      bump(w, 'err:mixedMetals');
    }
    // El tubo de cada metal: Fe en tube_fe, el incógnito en tube_x.
    if ((t.id === 'tube_fe' && p.metal !== 'Fe') || (t.id === 'tube_x' && p.metal === 'Fe')) latch(w, `wrongTube:${t.id}`, 'WRONG_TUBE', 'WARN');
    if (w.balance.panObjectId === t.id) latch(w, 'addOnPan', 'ADDED_ON_PAN', 'WARN');
    p.loc = to;
    p.tempC = w.params.ambientC;
    // La pieza toma la temperatura del metal del tubo (mezcla).
    const others = piecesAt(w, to).filter((x) => x.id !== p.id);
    const Cold = others.reduce((s, x) => s + x.massG * cpOf(w, x.metal, t.metalC), 0);
    const Cn = p.massG * cpOf(w, p.metal, p.tempC);
    t.metalC = Cold > 0 ? (Cold * t.metalC + Cn * p.tempC) / (Cold + Cn) : p.tempC;
    return { ok: true, value: p.massG };
  }
  if (to.startsWith('jar:')) {
    const jar = to.slice(4);
    const kind = jar === 'jar_fe' ? 'Fe' : 'X';
    if ((kind === 'Fe') !== (p.metal === 'Fe')) {
      latch(w, 'jarContam', 'JAR_CONTAMINATED', 'WARN');
      bump(w, 'err:jarContam');
    }
    p.loc = to;
    return { ok: true };
  }
  p.loc = to === 'cup' ? 'cup' : 'bench';
  if (p.loc === 'bench') {
    emit6(w, 'PIECE_DROPPED', 'WARN');
    bump(w, 'err:pieceLost');
  }
  return { ok: true };
}

function pourMetal(w: P6World, tubeId: string, targetId: string | null, dropHeightCm: number, offsetCm: number): P6DispatchResult {
  const t = w.tubes[tubeId];
  if (!t) return { ok: false };
  const sup = w.objects[tubeId].support;
  if (sup !== 'hand' && sup !== 'tongs') return { ok: false, code: 'HOLD_TUBE' };
  if (targetId === 'cup' && w.cal.lidClosed) return { ok: false, code: 'LID_CLOSED' };
  const loc = `tube:${tubeId}`;
  const ps = piecesAt(w, loc);
  if (!ps.length) return { ok: false, code: 'EMPTY' };
  const toCup = targetId === 'cup';
  const metalC = t.metalC;
  let inCup = 0;
  let lost = 0;
  let stuck = 0;
  const entering: typeof ps = [];
  for (const p of ps) {
    const stick = 0.02 + (t.waterG > 0.2 || t.wetG > 0.2 ? 0.08 : 0);
    if (rand(w) < stick) {
      stuck++;
      continue;
    }
    const miss = !toCup || offsetCm > 3 || (offsetCm > 1.8 && rand(w) < 0.4) || (dropHeightCm > 22 && rand(w) < 0.25);
    if (miss) {
      p.loc = 'bench';
      p.tempC = metalC;
      lost++;
    } else {
      entering.push(p);
      inCup++;
    }
  }
  if (stuck) {
    emit6(w, 'PIECE_STUCK', 'WARN', { n: stuck });
    bump(w, 'err:pieceStuck');
  }
  if (lost) {
    emit6(w, 'PIECE_LOST', 'WARN', { n: lost });
    bump(w, 'err:pieceLost');
  }
  // El agua que entró al tubo cae también (§13.3).
  const waterIn = t.waterG;
  if (waterIn > 0) {
    if (toCup) {
      const v = w.vessels.cup;
      const T = cupWaterC(w);
      v.waterG += waterIn;
      w.cal.bottomC = (w.cal.bottomC * (v.waterG - waterIn) * w.params.bottomFraction + waterIn * metalC) / Math.max(1e-9, (v.waterG - waterIn) * w.params.bottomFraction + waterIn);
      void T;
      emit6(w, 'BATH_WATER_POURED', 'WARN', { g: Math.round(waterIn * 100) / 100 });
      bump(w, 'err:bathWater');
    } else w.spilledG += waterIn;
    t.waterG = 0;
  }
  if (!toCup || !entering.length) {
    if (!toCup) emit6(w, 'METAL_OUTSIDE', 'WARN');
    return { ok: true, value: inCup };
  }
  // Mezcla térmica del metal que entra con el que ya hubiera (no debería haber).
  const Cold = metalHeatCap(w, 'cup', w.cal.metalC);
  const Cn = entering.reduce((s, x) => s + x.massG * cpOf(w, x.metal, metalC), 0);
  w.cal.metalC = Cold > 0 ? (Cold * w.cal.metalC + Cn * metalC) / (Cold + Cn) : metalC;
  for (const p of entering) p.loc = 'cup';
  // Salpicadura según la altura de caída (§13.4).
  if (dropHeightCm > 6) {
    const loss = Math.min(w.vessels.cup.waterG * 0.002 * (dropHeightCm - 6), 3);
    w.vessels.cup.waterG -= loss;
    w.cal.splashLossG += loss;
    if (loss > 0.05) {
      emit6(w, 'SPLASH', 'WARN', { g: Math.round(loss * 100) / 100 });
      bump(w, 'err:splash');
    }
  }
  if (w.vessels.cup.waterG < 10) {
    emit6(w, 'NO_WATER_IN_CUP', 'ALERT');
    bump(w, 'err:noWater');
  }
  const lift = t.liftedAt ?? w.timeS;
  const metal = metalAt(w, 'cup') ?? 'Fe';
  const run: Run = {
    index: w.runs.length, metal, tubeId, startS: w.timeS,
    metalMassG: metalGAt(w, 'cup'), metalCAtEntry: metalC, metalCAtLift: t.metalCAtLift ?? metalC, bathCAtLift: w.evidence[`bathAtLift:${tubeId}`] ?? metalC,
    transferS: w.timeS - lift, waterMassG: w.vessels.cup.waterG, waterCAtEntry: cupWaterC(w), cupCAtEntry: w.cal.cupC, bathWaterInG: waterIn,
    piecesLost: lost + stuck, dropHeightCm, peakDisplayedC: w.thermos.therm_cal.displayedC, peakT: w.timeS, recorded: null, endedS: null,
  };
  w.runs.push(run);
  w.cal.state = 'METAL_RECEIVED';
  if (t.boilingSoakS < w.params.minSoakS) {
    emit6(w, 'SHORT_SOAK', 'WARN', { min: Math.round(t.boilingSoakS / 6) / 10 });
    bump(w, 'err:shortSoak');
  }
  const bathRead = w.tempReadings.some((r) => r.where === 'bath' && r.t >= lift - 180 && r.t <= lift + 1);
  if (!bathRead) {
    emit6(w, 'BATH_NOT_MEASURED', 'WARN');
    bump(w, 'err:bathNotMeasured');
  }
  w.evidence[`stirAtRun:${run.index}`] = w.evidence.stirS ?? 0;
  if (run.transferS > 15) {
    emit6(w, 'SLOW_TRANSFER', 'WARN', { s: Math.round(run.transferS) });
    bump(w, 'err:slowTransfer');
  }
  emit6(w, 'METAL_IN_CALORIMETER', 'INFO', { g: Math.round(run.metalMassG * 100) / 100 });
  flag(w, `run:${run.index}`);
  return { ok: true, value: inCup };
}

function emptyCup(w: P6World): P6DispatchResult {
  const T = Math.max(cupWaterC(w), w.cal.metalC);
  if (T > 60) return { ok: false, code: 'HOT' };
  const v = w.vessels.cup;
  const run = activeRun(w);
  if (run) run.endedS = w.timeS;
  transferWater(w, 'cup', 'sink', v.waterG);
  for (const p of piecesAt(w, 'cup')) p.loc = 'sink';
  const hold = Math.min(0.6, v.waterG);
  v.waterG -= hold;
  v.wetG += hold;
  w.cal.state = 'EMPTY';
  w.cal.stir = 0;
  w.cal.metalC = w.params.ambientC;
  w.cal.topC = w.cal.bottomC = w.cal.cupC;
  w.cal.lossToAmbientJ = 0;
  emit6(w, 'CUP_EMPTIED', 'INFO');
  flag(w, 'cupEmptied');
  return { ok: true };
}

function setLid(w: P6World, closed: boolean): P6DispatchResult {
  w.cal.lidClosed = closed;
  if (closed) flag(w, 'lidClosed');
  return { ok: true };
}

// ─────────────────────────── Termómetros ───────────────────────────

function readThermometer(w: P6World, id: string, peak: boolean): P6DispatchResult {
  const th = w.thermos[id];
  if (!th) return { ok: false };
  if (th.broken) return { ok: false, code: 'BROKEN' };
  const where = thermoWhere(w, id);
  const value = displayedValue(w, id);
  const slope = displayedSlope(w, where === 'bath' ? 'bath' : 'cal', 8);
  const changing = Math.abs(slope) > 0.02;
  const r: TempReading = { id: `t${w.tempReadings.length + 1}`, thermoId: id, t: w.timeS, valueC: value, where, runsBefore: w.runs.length, peak, changing };
  if (peak) {
    const run = activeRun(w);
    if (!run || where !== 'cup') {
      w.tempReadings.push(r);
      return { ok: false, code: 'NO_RUN', id: r.id, value };
    }
    const sinceStart = w.timeS - run.startS;
    const rising = slope > 0.004;
    const judgement: 'EARLY' | 'OK' | 'LATE' = rising || sinceStart < 8 ? 'EARLY' : value < run.peakDisplayedC - 0.15 ? 'LATE' : 'OK';
    r.judgement = judgement;
    run.recorded = { c: value, t: w.timeS, judgement };
    w.cal.state = 'PEAK_FOUND';
    if (judgement === 'EARLY') {
      emit6(w, 'PEAK_TOO_EARLY', 'WARN');
      bump(w, 'err:peakEarly');
    } else if (judgement === 'LATE') {
      emit6(w, 'PEAK_TOO_LATE', 'WARN', { drop: Math.round((run.peakDisplayedC - value) * 100) / 100 });
      bump(w, 'err:peakLate');
    } else emit6(w, 'PEAK_RECORDED', 'INFO', { c: value });
    flag(w, `peak:${run.index}`);
  } else if (where === 'air') {
    emit6(w, 'THERMO_IN_AIR', 'WARN');
  } else if (th.depth > 0.92) {
    emit6(w, 'THERMO_TOUCHING', 'WARN');
    bump(w, 'err:thermoTouching');
  } else if (th.depth < 0.15) {
    emit6(w, 'BULB_NOT_IMMERSED', 'WARN');
    bump(w, 'err:bulb');
  }
  w.tempReadings.push(r);
  if (!peak) emit6(w, 'TEMP_READ', 'INFO', { c: value, where });
  if (changing && !peak) latch(w, `changing:${id}`, 'READING_CHANGING', 'WARN');
  else rearm(w, `changing:${id}`);
  return { ok: true, id: r.id, value };
}

/** Lo que muestra el termómetro: lectura con retardo, desplazamiento y resolución. */
export function displayedValue(w: P6World, id: string): number {
  const th = w.thermos[id];
  const r = th.resolutionC;
  return Math.round((th.displayedC + th.offsetC) / r) * r;
}

/** Temperatura que ve el sensor según dónde y a qué profundidad está (§9.3). */
function sensorTemp(w: P6World, id: string): number {
  const th = w.thermos[id];
  const amb = w.params.ambientC;
  const where = thermoWhere(w, id);
  if (where === 'cup') {
    const water = w.vessels.cup.waterG;
    if (water < 5 || th.depth < 0.15) return w.cal.topC * 0.3 + amb * 0.7 + (water < 5 ? 0 : 0.3 * (w.cal.topC - amb));
    if (th.depth > 0.92) {
      // Toca el fondo: con metal, el bulbo queda pegado al metal (pico local); sin metal, al vaso.
      const metal = piecesAt(w, 'cup').length > 0;
      return metal ? 0.55 * w.cal.bottomC + 0.45 * w.cal.metalC : 0.5 * w.cal.bottomC + 0.5 * w.cal.cupC;
    }
    // Sin agitar, el sensor (arriba) ve la capa superior.
    return w.cal.topC + (w.cal.bottomC - w.cal.topC) * clamp(w.cal.stir, 0, 1) * 0.5;
  }
  if (where === 'bath') {
    const b = w.vessels.beaker;
    if (b.waterG < 20 || th.depth < 0.15) return (b.waterC + amb) / 2;
    if (th.depth > 0.92) return b.waterC + 0.3 * (w.plate.plateC - b.waterC) * (w.objects.beaker.support === 'plate' ? 1 : 0);
    return b.waterC;
  }
  return amb;
}

// ─────────────────────────── Paso fijo ───────────────────────────

function stepPlateAndBath(w: P6World, dt: number) {
  const p = w.params;
  const amb = p.ambientC;
  const pl = w.plate;
  const setpoint = amb + (p.plateMaxC - amb) * pl.knob;
  pl.powerW = pl.knob > 0.01 ? clamp(30 * (setpoint - pl.plateC), 0, p.plateMaxW) : 0;
  const b = w.vessels.beaker;
  const onPlate = w.objects.beaker.support === 'plate';
  const Cb = b.waterG * C_W + b.glassMassG * b.glassCp;
  const qPB = onPlate ? p.plateBeakerWPerC * (pl.plateC - b.waterC) : 0;
  const qPA = p.plateAirWPerC * (pl.plateC - amb) + 5.67e-8 * 0.9 * 0.02 * ((pl.plateC + 273) ** 4 - (amb + 273) ** 4);
  pl.plateC += ((pl.powerW - qPA - qPB) / p.plateHeatCapJPerC) * dt;
  // Baño: agua + vidrio; pérdidas al aire y evaporación.
  let qTubes = 0;
  for (const t of Object.values(w.tubes)) {
    const g = tubeInBath(w, t.id);
    if (!g.inBath) continue;
    qTubes += p.tubeBathWPerC * (0.25 + 0.75 * g.metalSubmerged) * (b.waterC - t.glassC);
  }
  const qBA = p.beakerAirWPerC * (b.waterC - amb);
  const evapBelow = b.waterC > 70 ? 0.0015 * (b.waterC - 70) / 30 : 0;
  b.waterC += ((qPB - qBA - qTubes - evapBelow * LATENT_J_PER_G) / Math.max(1, Cb)) * dt;
  const evap1 = Math.min(b.waterG, evapBelow * dt);
  b.waterG -= evap1;
  w.bath.evaporatedG += evap1;
  const Tb = w.bath.boilingC;
  w.bath.vigor = 0;
  if (b.waterC > Tb && b.waterG > 0) {
    const excessJ = (b.waterC - Tb) * Cb;
    const g = Math.min(b.waterG, excessJ / LATENT_J_PER_G);
    b.waterG -= g;
    w.bath.evaporatedG += g;
    b.waterC = Tb;
    w.bath.vigor = clamp(g / dt / 0.25, 0, 1);
    flag(w, 'bathBoiling');
    if (w.bath.vigor > 0.7) {
      // Ebullición vigorosa: salpica (§12.5) y puede entrar agua por la boca de un tubo bajo.
      const s = Math.min(b.waterG, 0.04 * w.bath.vigor * dt);
      b.waterG -= s;
      w.bath.splashedG += s;
      latch(w, 'vigorous', 'VIGOROUS_BOILING', 'WARN');
      for (const t of Object.values(w.tubes)) {
        const gm = tubeInBath(w, t.id);
        if (gm.mouthNearSurface && !gm.mouthUnder) t.waterG += 0.01 * w.bath.vigor * dt;
      }
    } else rearm(w, 'vigorous');
  }
  if (onPlate && b.waterG < 15 && pl.plateC > 150) {
    setBlock(w, 'BEAKER_DRY');
    latch(w, 'beakerDry', 'BEAKER_DRY', 'CRITICAL');
    bump(w, 'err:beakerDry');
  }
  // Tubos: vidrio y metal.
  for (const t of Object.values(w.tubes)) {
    const g = tubeInBath(w, t.id);
    const loc = `tube:${t.id}`;
    const Cm = metalHeatCap(w, loc, t.metalC);
    const Cg = t.glassMassG * 0.75 + (t.waterG + t.wetG) * C_W;
    let qBath = 0;
    let qPlate = 0;
    if (g.inBath) {
      qBath = p.tubeBathWPerC * (0.25 + 0.75 * g.metalSubmerged) * (b.waterC - t.glassC);
      if (g.onBottom && onPlate) qPlate = 0.25 * (pl.plateC - t.glassC);
      if (g.mouthUnder) {
        // Entra agua del baño por la boca (§12.5).
        const inflow = Math.min(0.5 * dt, b.waterG);
        b.waterG -= inflow;
        t.waterG += inflow;
        latch(w, `water:${t.id}`, 'WATER_IN_TUBE', 'WARN');
        bump(w, 'err:waterInTube');
      }
      if (b.waterC >= w.bath.boilingC - 1.5 && g.metalSubmerged > 0.95) t.boilingSoakS += dt;
    }
    // En el baño, el vidrio que asoma es una aleta mal acoplada a la zona del metal (lo calienta además el vapor).
    const qAir = p.tubeAirWPerC * (g.inBath ? 0.15 * (1 - g.tubeSubmerged) : 1) * (t.glassC - amb);
    const Gmt = Cm > 0 ? (t.waterG > 0.1 ? p.metalTubeWetWPerC : p.metalTubeWPerC) : 0;
    const qMT = Gmt * (t.metalC - t.glassC);
    t.glassC += ((qBath + qPlate - qAir + qMT) / Math.max(0.5, Cg)) * dt;
    if (Cm > 0) t.metalC -= (qMT / Cm) * dt;
    else t.metalC = t.glassC;
    if (t.glassC > 200 && !t.cracked) {
      t.cracked = true;
      emit6(w, 'TUBE_CRACKED', 'CRITICAL', { id: t.id });
      bump(w, 'err:tubeCracked');
      if (g.inBath) t.waterG += Math.min(3, b.waterG);
    }
    const T = tubeTempC(t);
    t.hot = T > 60 ? (g.inBath ? 'HOT' : 'COOLING') : T > amb + 3 ? (g.inBath ? 'HEATING' : 'COOLING') : g.inBath ? 'HEATING' : T > amb + 1 ? 'SAFE_TO_TOUCH' : 'COLD';
  }
  // Piezas sueltas (mesada) se enfrían; las de la espátula también.
  for (const pc of Object.values(w.pieces)) {
    if (pc.loc === 'bench' || pc.loc === 'spatula') pc.tempC += (amb - pc.tempC) * Math.min(1, dt / 120);
  }
}

function stepCalorimeter(w: P6World, dt: number) {
  const p = w.params;
  const c = w.cal;
  const amb = p.ambientC;
  const ideal = p.model === 'IDEAL';
  const mw = w.vessels.cup.waterG;
  c.stir *= Math.exp(-dt / 1.5);
  if (!c.lidClosed && activeRun(w)) c.lidOpenS += dt;
  const Cm = metalHeatCap(w, 'cup', c.metalC);
  const fb = p.bottomFraction;
  const Ct = mw * (1 - fb) * C_W;
  const Cb = mw * fb * C_W;
  const Cc = ideal ? 0 : p.cupHeatCapJPerC;
  const scale = (p.model === 'REALISTIC' && w.scenarios.includes('POOR_INSULATION')) ? 4 : 1;
  if (mw < 1) {
    // Vaso vacío: el vaso sigue al ambiente; el metal suelto dentro también.
    c.cupC += (amb - c.cupC) * Math.min(1, (dt * 0.02));
    c.topC = c.bottomC = c.cupC;
    if (Cm > 0) c.metalC += ((amb - c.metalC) * 0.05 * dt) / Math.max(1, Cm / 10);
    return;
  }
  const qMB = Cm > 0 ? (p.metalWaterBaseWPerC + p.metalWaterStirWPerC * c.stir) * (c.metalC - c.bottomC) : 0;
  const qBT = (p.mixBaseWPerC + p.mixStirWPerC * c.stir) * (c.bottomC - c.topC);
  const qTC = ideal ? 0 : p.cupWaterGWPerC * (c.topC - c.cupC);
  const qBC = ideal ? 0 : p.cupWaterGWPerC * 0.4 * (c.bottomC - c.cupC);
  const gAmb = ideal ? 0 : (c.lidClosed ? p.waterAmbientLidClosedWPerC : p.waterAmbientLidOpenWPerC) * scale * (1 + (c.lidClosed ? 0 : c.stir));
  const qTA = gAmb * (c.topC - amb);
  const qCA = ideal ? 0 : p.cupAmbientWPerC * scale * (c.cupC - amb);
  if (Cm > 0) c.metalC -= (qMB / Cm) * dt;
  c.bottomC += ((qMB - qBT - qBC) / Math.max(1, Cb)) * dt;
  c.topC += ((qBT - qTC - qTA) / Math.max(1, Ct)) * dt;
  if (Cc > 0) c.cupC += ((qTC + qBC - qCA) / Cc) * dt;
  else c.cupC = c.topC;
  c.lossToAmbientJ += (qTA + qCA) * dt;
  // Agitación violenta: salpica (más con la tapa abierta).
  if (c.stir > 0.85) {
    const loss = Math.min(mw - 1, (c.lidClosed ? 0.004 : 0.03) * dt);
    w.vessels.cup.waterG -= loss;
    c.splashLossG += loss;
  }
  // Evaporación con la tapa abierta y agua tibia.
  if (!ideal && !c.lidClosed && c.topC > amb) {
    const e = Math.min(mw - 1, 0.00004 * (c.topC - amb) * dt);
    w.vessels.cup.waterG -= e;
    c.evaporatedG += e;
  }
  w.vessels.cup.waterC = cupWaterC(w);
  // Estado del calorímetro (§24.3).
  const run = activeRun(w);
  if (run && !run.recorded) {
    if (c.lidOpenS > 10) {
      latch(w, `lid:${run.index}`, 'LID_LEFT_OPEN', 'WARN');
      if (w.evidence[`latch:lid:${run.index}`] === 1 && !w.evidence[`lidErr:${run.index}`]) {
        w.evidence[`lidErr:${run.index}`] = 1;
        bump(w, 'err:lidOpen');
      }
    }
    if (w.timeS - run.startS > 30 && (w.evidence.stirS ?? 0) - (w.evidence[`stirAtRun:${run.index}`] ?? 0) < 3) {
      latch(w, `nostir:${run.index}`, 'NOT_STIRRED', 'WARN');
      if (!w.evidence[`stirErr:${run.index}`]) {
        w.evidence[`stirErr:${run.index}`] = 1;
        bump(w, 'err:notStirred');
      }
    }
  }
  const thIn = w.objects.therm_cal.support === 'cup';
  if (!run) {
    if (thIn && w.objects.stirrer.support === 'cup' && c.lidClosed) {
      c.state = Math.abs(displayedSlope(w, 'cal', 10)) < 0.003 && w.timeS - (w.evidence.lidClosed ?? w.timeS) > 20 ? 'READY' : 'EQUILIBRATING';
    } else c.state = thIn ? 'SENSOR_INSTALLED' : 'WATER_LOADED';
  } else if (!run.recorded) c.state = c.stir > 0.1 ? 'MIXING' : 'METAL_RECEIVED';
  else c.state = displayedValue(w, 'therm_cal') < run.peakDisplayedC - 0.2 ? 'COOLING' : 'PEAK_FOUND';
}

function stepThermometers(w: P6World, dt: number) {
  for (const th of Object.values(w.thermos)) {
    th.sensorC = sensorTemp(w, th.id);
    th.displayedC += ((th.sensorC - th.displayedC) / th.timeConstantS) * dt;
  }
}

function stepSeries(w: P6World) {
  // Una muestra por segundo de simulación.
  if (Math.floor(w.timeS) === Math.floor(w.timeS - w.params.dtS)) return;
  const t = Math.round(w.timeS);
  const push = (arr: P6World['series']['cal'], c: number) => {
    arr.push({ t, c: Math.round(c * 1000) / 1000 });
    if (arr.length > 5400) arr.splice(0, arr.length - 5400);
  };
  push(w.series.cal, displayedValue(w, 'therm_cal'));
  push(w.series.bath, displayedValue(w, 'therm_bath'));
  push(w.series.metalTrue, piecesAt(w, 'cup').length ? w.cal.metalC : w.tubes.tube_fe.metalC);
  push(w.series.waterTrue, cupWaterC(w));
  const run = activeRun(w);
  if (run && w.objects.therm_cal.support === 'cup') {
    const v = displayedValue(w, 'therm_cal');
    if (v > run.peakDisplayedC) {
      run.peakDisplayedC = v;
      run.peakT = w.timeS;
    }
  }
}

export function stepCalor(w: P6World): void {
  const p = w.params;
  const dt = p.dtS;
  w.timeS = Math.round((w.timeS + dt) * 1e6) / 1e6;
  w.tick++;
  stepPours(w, dt);
  stepPlateAndBath(w, dt);
  stepCalorimeter(w, dt);
  // El agua de la probeta y de la botella tiende al ambiente (lentamente).
  for (const id of ['cylinder', 'water_bottle', 'wash']) {
    const v = w.vessels[id];
    if (v && v.waterG > 0) v.waterC += (p.ambientC - v.waterC) * Math.min(1, dt / (id === 'cylinder' ? 1500 : 6000));
  }
  stepThermometers(w, dt);
  const load = panLoad(w);
  stepTripleBeam(w.balance, load, p.ambientC, p.balance, dt, w.timeS, gauss(w));
  stepSeries(w);
  stepBomb(w, dt);
  // Plantilla encendida sin supervisión durante 15 min: se apaga.
  if (w.plate.knob > 0 && w.timeS - w.safety.lastInteractionS > 900) {
    w.plate.knob = 0;
    emit6(w, 'UNATTENDED', 'ALERT');
    bump(w, 'err:unattended');
  }
}

export function runCalorFor(w: P6World, seconds: number) {
  const n = Math.round(seconds / w.params.dtS);
  for (let i = 0; i < n; i++) stepCalor(w);
}

export const stopwatchS = (w: P6World) => w.stopwatch.accumulatedS + (w.stopwatch.running && w.stopwatch.startedAt !== null ? w.timeS - w.stopwatch.startedAt : 0);

export function p6Summary(w: P6World) {
  return {
    water: Math.round(w.vessels.cup.waterG * 1000) / 1000,
    calT: Math.round(cupWaterC(w) * 1000) / 1000,
    metalCup: Math.round(metalGAt(w, 'cup') * 1000) / 1000,
    bathT: Math.round(w.vessels.beaker.waterC * 100) / 100,
    runs: w.runs.length,
    bomb: w.bomb.stage,
  };
}
