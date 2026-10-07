/**
 * Mundo de la Práctica 10 — Parte A (determinación de R con CO₂): paso fijo determinista.
 *
 * - Sólido y disoluciones: el NaHCO₃ se conserva entre frasco, vidrio de reloj, espátula, beaker, embudo, balón,
 *   pipeta, Erlenmeyer, derrames y desechos (§10.4). El balón guarda un gradiente hasta homogeneizar (§10.3).
 * - Reacción CH₃COOH + NaHCO₃ → CH₃COONa + CO₂ + H₂O con reactivo limitante, mezcla y espuma (§12); el CO₂ pasa
 *   por CO₂(aq) y se desgasifica hacia el espacio de cabeza; en modo realista queda parte disuelta (ley de Henry).
 * - Transporte (§13): el exceso de gas del reactor fluye por las mangueras (dobleces, líquido, fugas) hasta la
 *   bureta invertida. La presión del gas de la bureta es P_atm − ρ·g·h con h = nivel interno − externo (§15); su
 *   volumen sale de n·R·T/(P − P_H₂O) resolviendo juntos niveles y presión. El agua desplazada sube el nivel externo.
 * La Parte B (ley de Boyle) está en `boyle-rig.ts`.
 */
import type { P10Command, P10DispatchResult } from './commands';
import type {
  BaroReading, GasRun, HeightReading, LiquidVessel, MassReading, P10Object, P10Params, P10World, Pose, TempReading, VolumeReading,
} from './types';
import { hashRandom, hashRange } from '../core/rng';
import { bump10, emit10, flag10, gauss10, latch10, rearm10 } from './events';
import { GEO10, KPA_PER_CM_WATER, R_KPA_ML } from './geometry';
import { MOLAR, limiting } from '../gas-laws/stoich';
import { waterVaporMmHg } from '../gas-laws/vapor';
import { co2Saturation } from '../gas-laws/henry';
import { MMHG_PER_ATM, KPA_PER_ATM } from '../gas-laws/ideal-gas';
import { balanceValidity, displayedBalance, newAnalyticalBalance, stepAnalyticalBalance } from '../instruments/analytical-balance';
import { newSensor } from '../instruments/pressure-sensor';
import { dispatchBoyle, newSyringe, stepBoyle } from './boyle-rig';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const MMHG_TO_KPA = KPA_PER_ATM / MMHG_PER_ATM;

export interface GasWorldSpec {
  objects: Array<Omit<P10Object, 'pose'> & { pose: Pose }>;
  liquids: LiquidVessel[];
  scenarios: string[];
}

export { emit10, latch10, rearm10, bump10, flag10, gauss10 } from './events';

const sc = (w: P10World, s: string) => w.scenarios.includes(s);

// ─────────────────────────── Creación ───────────────────────────

export function createGasWorld(spec: GasWorldSpec, seed: number, params: P10Params): P10World {
  const has = (s: string) => spec.scenarios.includes(s);
  const amb = params.ambientC;
  const objects: Record<string, P10Object> = {};
  for (const o of spec.objects) objects[o.id] = { ...o, pose: { ...o.pose } };
  const liquids: Record<string, LiquidVessel> = {};
  for (const v of spec.liquids) liquids[v.id] = { ...v, tempC: v.id === 'tap_jug' ? params.tapWaterC : amb };
  // El agua del baño: fresca o ya saturada de CO₂ (§13.3).
  const flaskTrue = params.flaskMl + (hashRandom(seed, 'flask') - 0.5) * 2 * params.flaskTolMl;
  const pipTrue = params.pipetteMl + (hashRandom(seed, 'pip') - 0.5) * 2 * params.pipetteTolMl;
  const model = params.model;
  const sensor = newSensor(params.sensorModel, has('SENSOR_OFFSET') ? 3.5 : (hashRandom(seed, 'soff') - 0.5) * (model === 'REALISTIC' ? 1.2 : 0), 1, params.sensorInternalMl ?? undefined);
  const w: P10World = {
    timeS: 0, tick: 0, seed, rng: seed >>> 0 || 1, params, objects,
    balance: newAnalyticalBalance({ levelErrorDeg: has('UNLEVEL') ? 2.5 : 0, doorsOpen: false }),
    liquids, pours: {},
    solids: { jarG: 50, watchGlassG: 0, spatulaG: 0, spilledG: 0, funnelG: 0, watchGlassWetG: has('WET_WATCH_GLASS') ? 0.012 : 0 },
    watchGlassGlassG: Math.round(hashRange(seed, 'wg', 18.2, 24.6) * 10000) / 10000,
    flask: { nominalMl: params.flaskMl, trueMarkMl: flaskTrue, stoppered: false, mix: 1, inversions: 0, fastFinish: false },
    pipette: {
      nominalMl: params.pipetteMl, trueDeliverMl: pipTrue, propipette: false, conditioned: false, waterFilmMl: 0.06, ml: 0, nBicarb: 0,
      aboveMarkMl: 0, adjusted: false, bubble: false, blown: false,
    },
    connections: {
      c_stopper: { id: 'c_stopper', connectedFrom: 'stopper', connectedTo: null, internalVolumeMl: 1.2, leakConductanceMolPerSKPa: params.looseLeakMolPerSKPa, kinkFraction: 0, wetFraction: 0, secured: false },
      c_hose_u: { id: 'c_hose_u', connectedFrom: 'hose', connectedTo: null, internalVolumeMl: 0.8, leakConductanceMolPerSKPa: params.looseLeakMolPerSKPa, kinkFraction: has('KINKED_HOSE') ? 0.85 : 0, wetFraction: 0, secured: false },
      c_tip: { id: 'c_tip', connectedFrom: 'u_tube', connectedTo: null, internalVolumeMl: 0, leakConductanceMolPerSKPa: 0, kinkFraction: 0, wetFraction: 0, secured: true },
    },
    reactor: {
      stage: 'OPEN', stoppered: false, totalVolumeMl: GEO10.erlenmeyer.volumeUnderStopperMl, nAir: 0, nCo2Gas: 0, pressureKPa: params.pressureKPa, foam: 0, stir: 0,
      mixing: 0, co2Generated: 0, co2Escaped: 0, co2Leaked: 0, acidAddedAt: null, sealedAt: null, completeAt: null, quietS: 0,
    },
    burette: {
      stage: 'EMPTY', waterMl: 0, inverted: false, topUngraduatedMl: Math.round(hashRange(seed, 'btop', 3.1, 3.9) * 100) / 100, mouthUngraduatedMl: 2.2,
      nAir: 0, nCo2: 0, gasC: amb, nCo2Aq: 0, stopcockOpen: false, clamped: false, tiltDeg: 0, mouthAboveFloorCm: 1.5, overflowMol: 0, initialAirMl: 0,
    },
    thermometer: { displayedC: amb, timeConstantS: params.thermometer.timeConstantS, resolutionC: params.thermometer.resolutionC, offsetC: has('THERMO_OFFSET') ? 0.8 : 0, where: 'air', touching: false },
    bathC: amb,
    syringe: newSyringe(params, has('DAMAGED_SEAL')),
    sensor,
    points: [], runs: [], massReadings: [], volumeReadings: [], tempReadings: [], heightReadings: [], baroReadings: [],
    series: { sensor: [] },
    safety: { ppe: false, block: null, incident: null, stoppedByTeacher: false, lastInteractionS: 0 },
    events: [], evidence: {}, scenarios: [...spec.scenarios], ppe: false, initialElements: {},
  };
  w.initialElements = elementTotals(w);
  return w;
}

// ─────────────────────────── Consultas ───────────────────────────

export const pvKPa = (w: P10World, tC: number) => waterVaporMmHg(tC, w.params.vapor) * MMHG_TO_KPA;
export const bicarbMol = (g: number) => g / MOLAR.NaHCO3;

/** Moles totales de cada elemento (C, Na y los H/O que no son del agua solvente) en todo el sistema (§3.3, §12.4). */
export function elementTotals(w: P10World): Record<string, number> {
  let nB = bicarbMol(w.solids.jarG + w.solids.watchGlassG + w.solids.spatulaG + w.solids.spilledG + w.solids.funnelG);
  let nA = 0;
  let nAc = 0;
  let co2 = 0;
  for (const v of Object.values(w.liquids)) {
    nB += v.nBicarb + bicarbMol(v.solidBicarbG);
    nA += v.nAcid;
    nAc += v.nAcetate;
    co2 += v.nCo2Aq;
  }
  nB += w.pipette.nBicarb;
  const r = w.reactor;
  co2 += r.nCo2Gas + r.co2Escaped + r.co2Leaked + w.burette.nCo2 + w.burette.nCo2Aq + (w.evidence.__co2Overflow ?? 0);
  const h2o = w.evidence.__h2oProduced ?? 0;
  return { C: nB + 2 * nA + 2 * nAc + co2, Na: nB + nAc, H: nB + 4 * nA + 3 * nAc + 2 * h2o, O: 3 * nB + 2 * nA + 2 * nAc + 2 * co2 + h2o };
}

/** Masa (g) de lo que hay en el platillo de la balanza. */
export function objectMassG(w: P10World, id: string): number {
  if (id === 'watch_glass') return w.watchGlassGlassG + w.solids.watchGlassG + w.solids.watchGlassWetG + (w.evidence.__greaseG ?? 0);
  const v = w.liquids[id];
  if (v) return (id === 'beaker150' ? 68.4 : 40) + v.ml + v.wetMl + v.solidBicarbG + v.nBicarb * MOLAR.NaHCO3;
  return 5;
}
export const panLoadG = (w: P10World) => (w.balance.panObjectId ? objectMassG(w, w.balance.panObjectId) : 0);

/** Volumen del espacio de cabeza del reactor más las líneas conectadas (mL). */
export function headVolumeMl(w: P10World): number {
  const e = w.liquids.erlenmeyer;
  const lines = w.connections.c_stopper.connectedTo ? w.params.linesVolumeMl : 0;
  return Math.max(5, w.reactor.totalVolumeMl - e.ml - e.solidBicarbG / 2.2 + lines);
}

const buretteTotalMl = (w: P10World) => w.burette.topUngraduatedMl + GEO10.burette.gradMl + w.burette.mouthUngraduatedMl;
const beakerArea = () => Math.PI * GEO10.beaker600.r ** 2 - GEO10.burette.outerAreaCm2;

/** Nivel del agua del baño sobre la mesada (cm). */
export const outerLevelCm = (w: P10World) => GEO10.beaker600.floor + w.liquids.beaker600.ml / beakerArea();

export interface BuretteSolution {
  gasMl: number;
  pKPa: number;
  zInCm: number;
  zOutCm: number;
  zTopCm: number;
  zMouthCm: number;
  /** h = nivel interno − externo (mm, con signo) (§15.1). */
  hMm: number;
  /** Lectura de la escala impresa en el menisco (mL) o null si queda fuera de la escala. */
  readingMl: number | null;
  mouthSubmerged: boolean;
}

/** Resuelve juntos el volumen del gas de la bureta, su presión y los niveles (§15–16). */
export function solveBurette(w: P10World): BuretteSolution {
  const b = w.burette;
  const p = w.params;
  const A = GEO10.burette.areaCm2;
  const zMouth = GEO10.beaker600.floor + b.mouthAboveFloorCm;
  const zTop = zMouth + buretteTotalMl(w) / A;
  const zOut = outerLevelCm(w);
  const n = b.nAir + b.nCo2;
  const T = b.gasC + 273.15;
  const pv = pvKPa(w, b.gasC);
  let v = n > 0 ? (n * R_KPA_ML * T) / Math.max(1, p.pressureKPa - pv) : 0;
  let P = p.pressureKPa;
  for (let i = 0; i < 6 && n > 0; i++) {
    P = p.pressureKPa - KPA_PER_CM_WATER * (zTop - v / A - zOut);
    v = (n * R_KPA_ML * T) / Math.max(1, P - pv);
  }
  if (n <= 0) P = p.pressureKPa - KPA_PER_CM_WATER * (zTop - zOut);
  const zIn = zTop - v / A;
  const top = b.topUngraduatedMl;
  const readingMl = v < top - 1e-6 || v > top + GEO10.burette.gradMl ? null : GEO10.burette.gradMl - (v - top);
  return { gasMl: v, pKPa: P, zInCm: zIn, zOutCm: zOut, zTopCm: zTop, zMouthCm: zMouth, hMm: (zIn - zOut) * 10, readingMl, mouthSubmerged: zMouth < zOut };
}

/** ¿El gas del reactor puede llegar a la bureta? (mangueras conectadas y punta bajo el agua dentro de la bureta). */
export function chainOk(w: P10World): boolean {
  const c = w.connections;
  const b = w.burette;
  if (!c.c_stopper.connectedTo || !c.c_hose_u.connectedTo || !c.c_tip.connectedTo) return false;
  return b.inverted && w.objects.burette.support !== 'bench' && solveBurette(w).mouthSubmerged;
}

/** La punta del tubo en U apoya en el fondo del beaker (obstruida). */
export const tipObstructed = (w: P10World) => w.connections.c_tip.connectedTo !== null && w.burette.mouthAboveFloorCm < 0.25;

export const activeRun = (w: P10World): GasRun | null => {
  const r = w.runs[w.runs.length - 1];
  return r && r.endedS === null ? r : null;
};

/** Temperatura que «ve» el bulbo del termómetro. */
function thermoTarget(w: P10World): number {
  const t = w.thermometer;
  if (t.where === 'beaker600' && w.liquids.beaker600.ml > 20) return w.bathC + (t.touching ? (w.params.ambientC - w.bathC) * 0.3 : 0);
  if (t.where === 'erlenmeyer' && w.liquids.erlenmeyer.ml > 5) return w.liquids.erlenmeyer.tempC;
  return w.params.ambientC;
}

// ─────────────────────────── Comandos ───────────────────────────

export function dispatchGas(w: P10World, cmd: P10Command): P10DispatchResult {
  if (w.safety.stoppedByTeacher && cmd.type !== 'teacherStop') return { ok: false, code: 'TEACHER_STOP' };
  if (cmd.type !== 'setPose' && cmd.type !== 'setPlunger') w.safety.lastInteractionS = w.timeS;
  if (w.safety.block && !['acknowledge', 'teacherStop', 'setPose', 'inspect', 'readThermometer', 'readBarometer'].includes(cmd.type)) return { ok: false, code: 'BLOCKED' };
  switch (cmd.type) {
    case 'confirmPpe':
      w.ppe = true;
      w.safety.ppe = true;
      flag10(w, 'ppe');
      return { ok: true };
    case 'setPose':
      return setPose(w, cmd.id, cmd.pose, cmd.support);
    case 'inspect':
      return inspect(w, cmd.target);
    case 'levelBalance':
      w.balance.levelErrorDeg = 0;
      w.balance.disturbedAt = w.timeS;
      flag10(w, 'balanceLeveled');
      emit10(w, 'BALANCE_LEVELED', 'INFO');
      return { ok: true };
    case 'setDoors':
      w.balance.doorsOpen = cmd.open;
      w.balance.disturbedAt = w.timeS;
      return { ok: true };
    case 'tare': {
      const b = w.balance;
      if (b.doorsOpen) {
        emit10(w, 'TARE_DOORS_OPEN', 'WARN');
        bump10(w, 'err:tareDoorsOpen');
      }
      b.tareG = panLoadG(w) + b.noiseG;
      b.taredAt = w.timeS;
      b.disturbedAt = w.timeS;
      b.shownG = 0;
      if (b.panObjectId) {
        // Tarar con el vidrio en el platillo: la masa del vidrio deja de verse (se confunde tara con diferencia).
        flag10(w, 'taredWithLoad');
        emit10(w, 'TARED_WITH_LOAD', 'INFO', { obj: b.panObjectId });
      } else flag10(w, 'taredEmpty');
      w.massReadings.push({ id: `m${w.massReadings.length + 1}`, t: w.timeS, displayedG: 0, trueG: panLoadG(w), objectId: b.panObjectId, bicarbG: 0, stable: b.stable, doorsOpen: b.doorsOpen, valid: true, tare: true });
      return { ok: true };
    }
    case 'readBalance': {
      const m = readBalance(w);
      return { ok: m.valid, code: m.invalidReason, id: m.id, value: m.displayedG };
    }
    case 'touchGlass':
      w.evidence.__greaseG = (w.evidence.__greaseG ?? 0) + 0.0004;
      emit10(w, 'FINGERPRINTS', 'WARN');
      bump10(w, 'err:fingers');
      return { ok: true };
    case 'scoop':
      return scoop(w, cmd.amountG);
    case 'tapSpatula':
      return tapSpatula(w, cmd.targetId, cmd.fraction);
    case 'returnSpatula': {
      if (w.solids.spatulaG <= 0) return { ok: true };
      w.liquids.waste.solidBicarbG += w.solids.spatulaG;
      w.solids.spatulaG = 0;
      return { ok: true };
    }
    case 'transferSolid':
      return transferSolid(w, cmd.toId, cmd.careful);
    case 'rinseInto':
      return rinseInto(w, cmd.sourceId, cmd.targetId, cmd.ml);
    case 'swirl':
      return swirl(w, cmd.id, cmd.intensity);
    case 'setPour':
      return setPour(w, cmd.sourceId, cmd.targetId, cmd.tiltDeg);
    case 'stopPour': {
      const pr = w.pours[cmd.sourceId];
      if (!pr) return { ok: true };
      delete w.pours[cmd.sourceId];
      emit10(w, 'POUR_DONE', 'INFO', { ml: Math.round(pr.transferredMl * 10) / 10, from: cmd.sourceId, to: pr.targetId ?? 'bench' });
      return { ok: true, value: pr.transferredMl };
    }
    case 'squeeze': {
      const src = w.liquids.wash;
      const ml = Math.min(src.ml, Math.max(0, Math.round(cmd.drops)) * 0.05);
      if (ml <= 0) return { ok: false, code: 'EMPTY' };
      transferLiquid(w, 'wash', cmd.targetId, ml);
      if (cmd.targetId === 'flask') checkFlaskMark(w, false);
      return { ok: true, value: ml };
    }
    case 'readVolume':
      return readVolume(w, cmd.instrument, cmd.eyeDzCm);
    case 'stopperFlask':
      w.flask.stoppered = cmd.on;
      return { ok: true };
    case 'invertFlask': {
      const f = w.flask;
      if (!f.stoppered) {
        // Invertir sin tapón: se derrama.
        const lost = Math.min(w.liquids.flask.ml, 4);
        transferLiquid(w, 'flask', null, lost);
        emit10(w, 'FLASK_SPILLED', 'WARN');
        bump10(w, 'err:invertOpen');
        return { ok: false, code: 'NOT_STOPPERED' };
      }
      f.inversions += 1;
      f.mix += (1 - f.mix) * 0.35;
      // El sólido que llegó sin disolver se disuelve al invertir.
      const v = w.liquids.flask;
      if (v.solidBicarbG > 0) {
        const d = v.solidBicarbG * 0.5;
        v.solidBicarbG -= d;
        v.nBicarb += bicarbMol(d);
      }
      if (f.mix > 0.97) flag10(w, 'homogenized');
      return { ok: true, value: f.mix };
    }
    case 'attachPropipette':
      w.pipette.propipette = cmd.on;
      return { ok: true };
    case 'conditionPipette':
      return conditionPipette(w);
    case 'aspirate':
      return aspirate(w, cmd.ml);
    case 'adjustPipette':
      return adjustPipette(w, cmd.eyeDzCm);
    case 'deliverPipette':
      return deliverPipette(w, cmd.targetId, cmd.blow);
    case 'fillBurette':
      return fillBurette(w, cmd.ml);
    case 'invertBurette':
      return invertBurette(w, cmd.mouthSubmerged);
    case 'clampBurette': {
      const b = w.burette;
      if (!b.inverted) return { ok: false, code: 'NOT_INVERTED' };
      b.clamped = true;
      b.tiltDeg = cmd.tiltDeg;
      w.objects.burette.support = 'clamp';
      if (b.stage === 'SUBMERGED') b.stage = 'CLAMPED';
      if (Math.abs(cmd.tiltDeg) > 2) {
        emit10(w, 'BURETTE_TILTED', 'WARN');
        bump10(w, 'err:tilt');
      }
      flag10(w, 'buretteClamped');
      return { ok: true };
    }
    case 'setBuretteDepth': {
      const b = w.burette;
      if (!b.inverted) return { ok: false, code: 'NOT_INVERTED' };
      b.mouthAboveFloorCm = clamp(cmd.mouthAboveFloorCm, 0, 8);
      if (!solveBurette(w).mouthSubmerged) {
        // La boca salió del agua: entra aire y el agua cae al baño.
        breakColumn(w);
      }
      return { ok: true };
    }
    case 'setStopcock': {
      const b = w.burette;
      if (!b.inverted) return { ok: false, code: 'NOT_INVERTED' };
      b.stopcockOpen = cmd.open;
      if (cmd.open && activeRun(w)) {
        emit10(w, 'STOPCOCK_DURING_RUN', 'ALERT');
        bump10(w, 'err:stopcockRun');
      }
      if (!cmd.open) {
        const s = solveBurette(w);
        if (s.readingMl !== null && Math.abs(s.readingMl - 50) <= 0.3) {
          b.stage = 'BASELINE_READY';
          flag10(w, 'aforo50');
        }
      }
      return { ok: true };
    }
    case 'connect':
      return connect(w, cmd.id, cmd.secured);
    case 'secure': {
      const c = w.connections[cmd.id];
      if (!c?.connectedTo) return { ok: false, code: 'NOT_CONNECTED' };
      c.secured = true;
      return { ok: true };
    }
    case 'kink': {
      const c = w.connections[cmd.id];
      if (!c) return { ok: false };
      c.kinkFraction = clamp(cmd.fraction, 0, 1);
      if (c.kinkFraction > 0.4) latch10(w, `kink:${cmd.id}`, 'HOSE_KINKED', 'WARN');
      else rearm10(w, `kink:${cmd.id}`);
      return { ok: true };
    }
    case 'leakTest':
      return leakTest(w);
    case 'addVinegar':
      return addVinegar(w);
    case 'insertStopper':
      return insertStopper(w, cmd.on);
    case 'readThermometer': {
      const t = w.thermometer;
      const v = Math.round((t.displayedC + t.offsetC) / t.resolutionC) * t.resolutionC;
      const changing = Math.abs(thermoTarget(w) - t.displayedC) > 0.15;
      const r: TempReading = { id: `t${w.tempReadings.length + 1}`, t: w.timeS, valueC: Math.round(v * 100) / 100, where: t.where, changing };
      w.tempReadings.push(r);
      if (changing) {
        emit10(w, 'THERMO_NOT_STABLE', 'WARN');
        bump10(w, 'err:tempUnstable');
      }
      if (t.where === 'beaker600') flag10(w, 'tempBath');
      if (t.touching) bump10(w, 'err:thermoTouch');
      return { ok: !changing, id: r.id, value: r.valueC };
    }
    case 'readBarometer': {
      const p = w.params;
      const local = (p.pressureKPa / MMHG_TO_KPA);
      const mmHg = cmd.source === 'LOCAL' ? local : local * Math.exp(p.altitudeM / 8434);
      const noise = (hashRandom(w.seed, `baro${w.baroReadings.length}`) - 0.5) * p.barometer.resolutionMmHg;
      const r: BaroReading = { id: `p${w.baroReadings.length + 1}`, t: w.timeS, mmHg: Math.round((mmHg + noise) / p.barometer.resolutionMmHg) * p.barometer.resolutionMmHg, source: cmd.source };
      r.mmHg = Math.round(r.mmHg * 10) / 10;
      w.baroReadings.push(r);
      if (cmd.source === 'WEATHER_SEA_LEVEL' && p.altitudeM > 50) {
        emit10(w, 'NON_LOCAL_PRESSURE', 'WARN');
        bump10(w, 'err:weatherPressure');
      } else flag10(w, 'baroLocal');
      return { ok: true, id: r.id, value: r.mmHg };
    }
    case 'alignRuler':
      w.evidence.__rulerAligned = cmd.aligned ? 1 : 0;
      return { ok: true };
    case 'measureHeight':
      return measureHeight(w, cmd.eyeDzCm);
    case 'newRun':
      return newRun(w);
    case 'emptyReactor':
      return emptyReactor(w);
    case 'setPlunger':
    case 'connectSyringe':
    case 'setValve':
    case 'startCollection':
    case 'keepPoint':
    case 'deletePoint':
      return dispatchBoyle(w, cmd);
    case 'acknowledge': {
      const b = w.safety.block;
      if (!b) {
        if (w.safety.incident) {
          w.safety.incident = null;
          emit10(w, 'INCIDENT_RESOLVED', 'INFO');
        }
        return { ok: true };
      }
      if (b.code === 'STOPPER_POPPED' && w.reactor.pressureKPa > w.params.pressureKPa + 2) return { ok: false, code: 'STILL_PRESSURIZED' };
      w.safety.block = null;
      emit10(w, 'STATION_RESET', 'INFO', { code: b.code });
      return { ok: true };
    }
    case 'teacherStop':
      w.safety.stoppedByTeacher = cmd.on;
      return { ok: true };
  }
  return { ok: false, code: 'UNKNOWN' };
}

export function setBlock10(w: P10World, code: string) {
  if (w.safety.block?.code === code) return;
  w.safety.block = { code, since: w.timeS };
}

function inspect(w: P10World, target: string): P10DispatchResult {
  flag10(w, `inspected:${target}`);
  if (target === 'abalance') {
    if (w.balance.levelErrorDeg > 0.5) emit10(w, 'BALANCE_UNLEVEL', 'WARN');
  }
  if (target === 'watch_glass' && w.solids.watchGlassWetG > 0.001) emit10(w, 'WATCH_GLASS_WET', 'WARN');
  if (target === 'burette' && sc(w, 'CRACKED_BURETTE')) emit10(w, 'BURETTE_CRACK_FOUND', 'WARN');
  if (target === 'thermometer' && w.thermometer.offsetC !== 0) emit10(w, 'THERMO_OFFSET_FOUND', 'WARN');
  if (target === 'hose') {
    for (const c of Object.values(w.connections)) if (c.kinkFraction > 0.4) emit10(w, 'HOSE_KINKED', 'WARN');
  }
  if (target === 'syringe' && w.syringe.sealDamaged) emit10(w, 'SEAL_DAMAGE_FOUND', 'WARN');
  if (target === 'sensor') {
    flag10(w, 'sensorChecked');
    emit10(w, 'SENSOR_AMBIENT', 'INFO', { kPa: Math.round(w.sensor.displayedPressureKPa * 10) / 10 });
  }
  emit10(w, 'INSPECTED', 'INFO', { target });
  return { ok: true };
}

function setPose(w: P10World, id: string, pose: Pose, support?: string): P10DispatchResult {
  const o = w.objects[id];
  if (!o) return { ok: false, code: 'NO_OBJECT' };
  const prev = o.support;
  if (support && support !== prev) {
    if (prev === 'pan') {
      w.balance.panObjectId = null;
      w.balance.touching = false;
      w.balance.disturbedAt = w.timeS;
    }
    if (support === 'pan') {
      if (!w.balance.doorsOpen) return { ok: false, code: 'DOORS_CLOSED' };
      if (w.balance.panObjectId && w.balance.panObjectId !== id) return { ok: false, code: 'PAN_BUSY' };
      w.balance.panObjectId = id;
      w.balance.disturbedAt = w.timeS;
      const bp = w.objects.abalance.pose;
      w.balance.touching = Math.hypot(pose.x - bp.x, pose.y - bp.y) > 4.5;
      if (w.balance.touching) emit10(w, 'TOUCHING_CABIN', 'WARN');
    }
    if (id === 'funnel' && prev.startsWith('funnel:')) emit10(w, 'FUNNEL_REMOVED', 'INFO');
    if (id === 'thermometer') {
      w.thermometer.where = support === 'beaker600' || support === 'erlenmeyer' ? support : 'air';
      w.thermometer.touching = false;
    }
    if (id === 'u_tube') {
      const c = w.connections.c_tip;
      c.connectedTo = support === 'burette' ? 'burette' : null;
      if (support === 'burette') emit10(w, 'TIP_IN_BURETTE', 'INFO');
    }
    if (id === 'burette' && (prev === 'clamp' || prev === 'beaker600') && support !== 'clamp' && support !== 'beaker600') {
      // Sacar la bureta del baño para volver a llenarla: el gas sale al ambiente.
      if (w.burette.inverted) breakColumn(w, true);
      w.burette.inverted = false;
      w.burette.clamped = false;
      w.burette.stage = w.burette.waterMl > 0 ? 'WATER_FILLED' : 'EMPTY';
    }
    if (id === 'syringe' && prev === 'sensor' && support !== 'sensor') dispatchBoyle(w, { type: 'connectSyringe', on: false });
    if (id === 'stopper' && prev === 'erlenmeyer' && support !== 'erlenmeyer') insertStopper(w, false);
  }
  o.pose = { ...pose };
  if (support) o.support = support;
  return { ok: true };
}

// ─────────────────────────── Sólido ───────────────────────────

function scoop(w: P10World, amountG: number): P10DispatchResult {
  if (w.solids.spatulaG > 0.001) return { ok: false, code: 'SPATULA_LOADED' };
  const g = Math.min(w.solids.jarG, clamp(amountG, 0.02, 1.2) * (0.85 + hashRandom(w.seed, `sc${w.tick}`) * 0.3));
  w.solids.jarG -= g;
  w.solids.spatulaG = g;
  return { ok: true, value: g };
}

function tapSpatula(w: P10World, targetId: string, fraction: number): P10DispatchResult {
  const s = w.solids;
  if (s.spatulaG <= 0) return { ok: false, code: 'EMPTY' };
  const g = s.spatulaG * clamp(fraction, 0, 1);
  s.spatulaG -= g;
  if (targetId === 'watch_glass') {
    // Agregar el sólido con el vidrio sobre el platillo: parte cae al platillo (§8.3).
    if (w.objects.watch_glass.support === 'pan') {
      const spill = g * 0.04;
      s.spilledG += spill;
      s.watchGlassG += g - spill;
      latch10(w, 'panSpill', 'SPILLED_ON_PAN', 'WARN');
      bump10(w, 'err:addInsideCabin');
      w.balance.disturbedAt = w.timeS;
    } else s.watchGlassG += g;
    return { ok: true, value: g };
  }
  const v = w.liquids[targetId];
  if (v) {
    v.solidBicarbG += g;
    return { ok: true, value: g };
  }
  s.spilledG += g;
  return { ok: true, value: g };
}

function transferSolid(w: P10World, toId: string, careful: boolean): P10DispatchResult {
  const s = w.solids;
  const to = w.liquids[toId];
  if (!to) return { ok: false, code: 'BAD_TARGET' };
  if (s.watchGlassG <= 0) return { ok: false, code: 'EMPTY' };
  const residue = s.watchGlassG * (careful ? 0.012 : 0.03);
  const spill = careful ? 0 : s.watchGlassG * 0.03;
  const moved = s.watchGlassG - residue - spill;
  s.watchGlassG = residue;
  s.spilledG += spill;
  to.solidBicarbG += moved;
  if (spill > 0) {
    emit10(w, 'SOLID_SPILLED', 'WARN');
    bump10(w, 'err:solidSpill');
  }
  flag10(w, 'solidTransferred');
  return { ok: true, value: moved };
}

/** Lavado cuantitativo con la piseta (§10.1): arrastra el residuo hacia el destino. */
function rinseInto(w: P10World, sourceId: 'watch_glass' | 'beaker150' | 'funnel', targetId: string, ml: number): P10DispatchResult {
  const wash = w.liquids.wash;
  const target = w.liquids[targetId];
  if (!target) return { ok: false, code: 'BAD_TARGET' };
  const water = Math.min(wash.ml, clamp(ml, 0.5, 30));
  wash.ml -= water;
  if (sourceId === 'watch_glass') {
    target.solidBicarbG += w.solids.watchGlassG;
    w.solids.watchGlassG = 0;
    target.ml += water;
    bump10(w, 'rinse:watch_glass');
    return { ok: true };
  }
  if (sourceId === 'funnel') {
    const f = w.liquids.funnel;
    const into = targetId === 'flask' ? 'flask' : targetId;
    w.liquids[into].ml += water + f.ml;
    w.liquids[into].nBicarb += f.nBicarb;
    w.liquids[into].solidBicarbG += f.solidBicarbG + w.solids.funnelG;
    f.ml = 0;
    f.nBicarb = 0;
    f.solidBicarbG = 0;
    w.solids.funnelG = 0;
    bump10(w, 'rinse:funnel');
    if (into === 'flask') checkFlaskMark(w, false);
    return { ok: true };
  }
  // Beaker: el agua de lavado arrastra la película de disolución y lo que quedó sin disolver.
  const b = w.liquids.beaker150;
  b.ml += water;
  b.ml += b.wetMl;
  b.wetMl = 0;
  transferLiquid(w, 'beaker150', targetId, b.ml);
  bump10(w, 'rinse:beaker150');
  if (targetId === 'flask') checkFlaskMark(w, false);
  return { ok: true };
}

function swirl(w: P10World, id: string, intensity: number): P10DispatchResult {
  const s = clamp(intensity, 0, 1);
  if (id === 'erlenmeyer') {
    w.reactor.stir = Math.max(w.reactor.stir, s);
    if (s > 0.85) {
      latch10(w, 'violentSwirl', 'VIOLENT_SWIRL', 'WARN');
      bump10(w, 'err:violentSwirl');
    }
    return { ok: true };
  }
  const v = w.liquids[id];
  if (!v) return { ok: false };
  // Disolver agitando (beaker de 150 mL).
  if (v.solidBicarbG > 0 && v.ml > 5) {
    const solubleMol = (v.ml / 1000) * 1.14 - v.nBicarb; // ≈ 96 g/L a 20 °C
    const d = Math.min(v.solidBicarbG, Math.max(0, solubleMol) * MOLAR.NaHCO3, v.solidBicarbG * 0.25 * (0.3 + s));
    v.solidBicarbG -= d;
    v.nBicarb += bicarbMol(d);
  }
  return { ok: true };
}

// ─────────────────────────── Líquidos ───────────────────────────

const POUR_K: Record<string, number> = { water_bottle: 14, tap_jug: 40, vinegar_bottle: 6, beaker150: 8, cylinder: 4, erlenmeyer: 10, flask: 6, waste: 20, beaker600: 25 };

function setPour(w: P10World, sourceId: string, targetId: string | null, tiltDeg: number): P10DispatchResult {
  const src = w.liquids[sourceId];
  if (!src || !POUR_K[sourceId]) return { ok: false, code: 'NOT_POURABLE' };
  if (targetId && !w.liquids[targetId]) return { ok: false, code: 'BAD_TARGET' };
  if (sourceId === 'flask' && w.flask.stoppered) return { ok: false, code: 'STOPPERED' };
  if (targetId === 'erlenmeyer' && w.reactor.stoppered) return { ok: false, code: 'STOPPERED' };
  const pr = w.pours[sourceId];
  if (pr) {
    pr.targetId = targetId;
    pr.tiltDeg = tiltDeg;
  } else w.pours[sourceId] = { sourceId, targetId, tiltDeg, startedS: w.timeS, transferredMl: 0 };
  return { ok: true };
}

function pourRate(v: LiquidVessel, tiltDeg: number, k: number): number {
  const fill = clamp(v.ml / Math.max(1, v.capacityMl), 0, 1.2);
  const tilt0 = 100 - 88 * Math.min(1, fill);
  if (tiltDeg <= tilt0 || v.ml <= 0) return 0;
  return k * ((tiltDeg - tilt0) / 30) ** 1.5;
}

/**
 * Pasa `ml` de disolución de un recipiente a otro (o a la mesada) con sus solutos y su temperatura. Al balón se
 * entra por el embudo (que retiene una película); sin embudo, parte se derrama.
 */
export function transferLiquid(w: P10World, fromId: string, toId: string | null, ml: number): number {
  const from = w.liquids[fromId];
  const mm = Math.min(ml, from.ml);
  if (mm <= 0) return 0;
  const f = mm / from.ml;
  const part = {
    ml: mm, nBicarb: from.nBicarb * f, nAcid: from.nAcid * f, nAcetate: from.nAcetate * f, nCo2Aq: from.nCo2Aq * f,
    solid: from.solidBicarbG * Math.min(1, f * 1.2), tempC: from.tempC,
  };
  from.ml -= mm;
  from.nBicarb -= part.nBicarb;
  from.nAcid -= part.nAcid;
  from.nAcetate -= part.nAcetate;
  from.nCo2Aq -= part.nCo2Aq;
  from.solidBicarbG -= part.solid;
  const dest = toId;
  if (dest === 'flask' && fromId !== 'wash') {
    if (w.objects.funnel.support === 'funnel:flask') {
      // Pasa por el embudo: queda una película de disolución en sus paredes.
      const fun = w.liquids.funnel;
      const keep = Math.max(0, Math.min(0.25 - fun.ml, part.ml * 0.3));
      if (keep > 0) {
        const k = keep / part.ml;
        fun.ml += keep;
        fun.nBicarb += part.nBicarb * k;
        part.nBicarb *= 1 - k;
        part.ml -= keep;
      }
      fun.solidBicarbG += part.solid * 0.15;
      part.solid *= 0.85;
    } else {
      const lost = 0.12;
      addInto(w, 'spill', scalePart(part, lost));
      Object.assign(part, scalePart(part, 1 - lost));
      latch10(w, 'noFunnel', 'NO_FUNNEL', 'WARN');
      bump10(w, 'err:noFunnel');
    }
  }
  if (!dest) {
    addInto(w, 'spill', part);
    latch10(w, `spill:${fromId}`, 'LIQUID_SPILLED', 'WARN');
    bump10(w, 'err:spill');
    return mm;
  }
  const to = w.liquids[dest];
  const room = Math.max(0, to.capacityMl * 1.03 - to.ml);
  if (part.ml > room) {
    const over = (part.ml - room) / part.ml;
    addInto(w, 'spill', scalePart(part, over));
    Object.assign(part, scalePart(part, 1 - over));
    latch10(w, `over:${dest}`, 'OVERFLOW', 'WARN', { id: dest });
    bump10(w, 'err:overflow');
  }
  addInto(w, dest, part);
  if (dest === 'erlenmeyer') {
    w.reactor.mixing = Math.max(w.reactor.mixing, 0.45);
    if (part.nAcid > 0) acidEntered(w, part.nAcid, part.ml);
  }
  return mm;
}

type Part = { ml: number; nBicarb: number; nAcid: number; nAcetate: number; nCo2Aq: number; solid: number; tempC: number };
const scalePart = (p: Part, k: number): Part => ({ ml: p.ml * k, nBicarb: p.nBicarb * k, nAcid: p.nAcid * k, nAcetate: p.nAcetate * k, nCo2Aq: p.nCo2Aq * k, solid: p.solid * k, tempC: p.tempC });

function addInto(w: P10World, id: string, p: Part) {
  const to = w.liquids[id];
  to.tempC = to.ml + p.ml > 0 ? (to.ml * to.tempC + p.ml * p.tempC) / (to.ml + p.ml) : to.tempC;
  to.ml += p.ml;
  to.nBicarb += p.nBicarb;
  to.nAcid += p.nAcid;
  to.nAcetate += p.nAcetate;
  to.nCo2Aq += p.nCo2Aq;
  to.solidBicarbG += p.solid;
  if (id === 'flask' && p.ml > 0) {
    // Agua nueva sobre la disolución: el balón deja de estar homogéneo (§10.3).
    const v = w.liquids.flask;
    if (v.nBicarb > 0 && p.nBicarb < v.nBicarb * 0.5) w.flask.mix = Math.min(w.flask.mix, Math.max(0.05, 1 - p.ml / Math.max(1, v.ml)) * w.flask.mix);
    else if (v.nBicarb > 0) w.flask.mix = Math.min(w.flask.mix, 0.3);
  }
}

function stepPours(w: P10World, dt: number) {
  for (const pr of Object.values(w.pours)) {
    const src = w.liquids[pr.sourceId];
    const rate = pourRate(src, pr.tiltDeg, POUR_K[pr.sourceId] ?? 8);
    if (rate <= 0) continue;
    const ml = Math.min(rate * dt, src.ml);
    if (ml <= 0) continue;
    pr.transferredMl += transferLiquid(w, pr.sourceId, pr.targetId, ml);
    if (pr.targetId === 'flask') {
      checkFlaskMark(w, rate > 1.5);
    }
  }
}

/** Aforo del balón (§9.1): pasarse de la marca no tiene arreglo; completar con chorro rápido es arriesgado. */
function checkFlaskMark(w: P10World, fast: boolean) {
  const v = w.liquids.flask;
  const over = v.ml - w.flask.trueMarkMl;
  if (fast && over > -3) {
    w.flask.fastFinish = true;
    latch10(w, 'fastFinish', 'FAST_FINISH', 'WARN');
  }
  if (over > 0.06) {
    latch10(w, 'flaskOver', 'FLASK_OVERSHOT', 'WARN', { ml: Math.round(over * 100) / 100 });
    if (!w.evidence['err:flaskOver']) bump10(w, 'err:flaskOver');
  }
}

function readVolume(w: P10World, instrument: VolumeReading['instrument'], eyeDzCm: number): P10DispatchResult {
  const atEye = Math.abs(eyeDzCm) < 1;
  const noise = (hashRandom(w.seed, `vol${w.volumeReadings.length}`) - 0.5);
  let valueMl = 0;
  let trueMl = 0;
  let invalid: VolumeReading['invalid'];
  let changing = false;
  if (instrument === 'cylinder') {
    trueMl = w.liquids.cylinder.ml;
    valueMl = Math.round((trueMl + clamp(eyeDzCm * 0.06, -1, 1) + noise * 0.1) * 10) / 10;
  } else if (instrument === 'flask') {
    // Distancia del menisco a la marca (mL; + = pasado).
    trueMl = w.liquids.flask.ml - w.flask.trueMarkMl;
    valueMl = Math.round((trueMl + clamp(eyeDzCm * 0.02, -0.3, 0.3)) * 100) / 100;
  } else if (instrument === 'pipette') {
    trueMl = w.pipette.aboveMarkMl;
    valueMl = Math.round((trueMl + clamp(eyeDzCm * 0.004, -0.05, 0.05)) * 100) / 100;
  } else {
    const b = w.burette;
    if (!b.inverted) {
      invalid = 'NOT_INVERTED';
    } else {
      const s = solveBurette(w);
      trueMl = s.readingMl ?? NaN;
      if (s.readingMl === null) invalid = 'OFF_SCALE';
      else if (Math.abs(b.tiltDeg) > 2) invalid = 'TILTED';
      const prev = w.evidence.__vbPrev ?? s.gasMl;
      changing = Math.abs(s.gasMl - prev) > 0.0015;
      valueMl = Math.round(((s.readingMl ?? 0) - clamp(eyeDzCm * 0.05, -0.6, 0.6) + noise * 0.04) * 100) / 100;
    }
  }
  const r: VolumeReading = { id: `v${w.volumeReadings.length + 1}`, t: w.timeS, instrument, valueMl, trueMl, eyeDzCm, atEyeLevel: atEye, invalid, changing };
  w.volumeReadings.push(r);
  if (!atEye) {
    emit10(w, 'PARALLAX', 'WARN', { dir: eyeDzCm > 0 ? 'above' : 'below', inst: instrument });
    bump10(w, 'err:parallax');
  } else emit10(w, 'VOLUME_READ', 'INFO', { ml: valueMl, inst: instrument });
  if (invalid) emit10(w, `BURETTE_${invalid}`, 'WARN');
  if (changing) {
    emit10(w, 'LEVEL_STILL_MOVING', 'WARN');
    bump10(w, 'err:readMoving');
  }
  if (instrument === 'cylinder' && atEye) flag10(w, 'vinegarRead');
  if (instrument === 'burette' && atEye && !invalid) flag10(w, `buretteRead:${w.runs.length}`);
  return { ok: atEye && !invalid, id: r.id, value: valueMl, code: invalid ?? (atEye ? undefined : 'PARALLAX') };
}

// ─────────────────────────── Pipeta (§9.2) ───────────────────────────

/** Concentración que toma la pipeta del balón: sin homogeneizar, la parte de arriba está más diluida (§10.3). */
function flaskTakeConc(w: P10World): number {
  const v = w.liquids.flask;
  if (v.ml <= 0) return 0;
  return (v.nBicarb / v.ml) * (1 - 0.45 * (1 - w.flask.mix));
}

function conditionPipette(w: P10World): P10DispatchResult {
  const p = w.pipette;
  if (!p.propipette) return mouthPipetting(w);
  const v = w.liquids.flask;
  if (v.ml < 5) return { ok: false, code: 'NO_SOLUTION' };
  // Se enjuaga con ~3 mL de la disolución, que van al desecho.
  const ml = 3;
  const c = flaskTakeConc(w);
  v.ml -= ml;
  v.nBicarb -= c * ml;
  w.liquids.waste.ml += ml;
  w.liquids.waste.nBicarb += c * ml;
  p.waterFilmMl = 0;
  p.conditioned = true;
  flag10(w, 'pipetteConditioned');
  return { ok: true };
}

function mouthPipetting(w: P10World): P10DispatchResult {
  emit10(w, 'MOUTH_PIPETTING', 'ALERT');
  bump10(w, 'err:mouthPipette');
  return { ok: false, code: 'NO_PROPIPETTE' };
}

function aspirate(w: P10World, ml: number): P10DispatchResult {
  const p = w.pipette;
  if (!p.propipette) return mouthPipetting(w);
  if (w.objects.pipette.support !== 'flask') return { ok: false, code: 'NOT_IN_SOLUTION' };
  const v = w.liquids.flask;
  const want = clamp(ml, 0, p.nominalMl + 4);
  let take = Math.min(want, v.ml - 3);
  if (take <= 0) return { ok: false, code: 'NO_SOLUTION' };
  // Si la punta sale del líquido al aspirar, entra aire (burbuja).
  if (v.ml - take < 6 || sc(w, 'PIPETTE_BUBBLE')) {
    p.bubble = true;
    latch10(w, 'pipBubble', 'PIPETTE_BUBBLE', 'WARN');
  }
  take = Math.max(0, take);
  const c = flaskTakeConc(w);
  v.ml -= take;
  v.nBicarb -= c * take;
  p.ml = take;
  p.nBicarb = c * take + 0;
  // El agua de las paredes (sin acondicionar) diluye la alícuota.
  p.ml += p.waterFilmMl;
  p.waterFilmMl = 0;
  // A la marca, una pipeta TD contiene lo que entrega más la película calibrada (0,03 mL).
  p.aboveMarkMl = p.ml - p.trueDeliverMl - 0.03;
  p.adjusted = false;
  p.blown = false;
  if (!p.conditioned) {
    latch10(w, 'unconditioned', 'PIPETTE_NOT_CONDITIONED', 'WARN');
    bump10(w, 'err:unconditioned');
  }
  if (p.aboveMarkMl < 0) emit10(w, 'BELOW_MARK', 'WARN');
  return { ok: true, value: take };
}

function adjustPipette(w: P10World, eyeDzCm: number): P10DispatchResult {
  const p = w.pipette;
  if (p.ml <= 0) return { ok: false, code: 'EMPTY' };
  if (p.aboveMarkMl < 0) return { ok: false, code: 'BELOW_MARK' };
  // Se deja salir hasta la marca; el ojo fuera de nivel deja el menisco corrido.
  const bias = clamp(eyeDzCm * 0.004, -0.05, 0.05);
  const drain = p.aboveMarkMl - bias;
  const c = p.nBicarb / p.ml;
  p.ml -= drain;
  p.nBicarb -= c * drain;
  w.liquids.waste.ml += drain;
  w.liquids.waste.nBicarb += c * drain;
  p.aboveMarkMl = bias;
  p.adjusted = true;
  if (Math.abs(eyeDzCm) >= 1) {
    emit10(w, 'PARALLAX', 'WARN', { dir: eyeDzCm > 0 ? 'above' : 'below', inst: 'pipette' });
    bump10(w, 'err:parallax');
  } else flag10(w, 'pipetteAdjusted');
  return { ok: true };
}

function deliverPipette(w: P10World, targetId: string, blow: boolean): P10DispatchResult {
  const p = w.pipette;
  const to = w.liquids[targetId];
  if (!to) return { ok: false, code: 'BAD_TARGET' };
  if (p.ml <= 0) return { ok: false, code: 'EMPTY' };
  if (!p.adjusted) {
    emit10(w, 'NOT_ADJUSTED', 'WARN');
    bump10(w, 'err:pipetteNotAdjusted');
  }
  // TD: queda una película calibrada; soplarla entrega de más (§9.2).
  const film = blow ? 0 : 0.03;
  const bubble = p.bubble ? 0.18 : 0;
  const out = Math.max(0, p.ml - film - bubble);
  const c = p.nBicarb / p.ml;
  addInto(w, targetId, { ml: out, nBicarb: c * out, nAcid: 0, nAcetate: 0, nCo2Aq: 0, solid: 0, tempC: w.params.ambientC });
  // Lo que no salió (película, burbuja) queda en la pipeta y luego va al desecho.
  w.liquids.waste.ml += p.ml - out;
  w.liquids.waste.nBicarb += c * (p.ml - out);
  p.ml = 0;
  p.nBicarb = 0;
  p.blown = blow;
  p.bubble = false;
  p.adjusted = false;
  p.waterFilmMl = 0.02;
  if (blow) {
    emit10(w, 'PIPETTE_BLOWN', 'WARN');
    bump10(w, 'err:blowTD');
  }
  if (targetId === 'erlenmeyer') {
    flag10(w, 'aliquotDelivered');
    if (w.reactor.stage === 'OPEN') w.reactor.stage = 'ALIQUOT_LOADED';
  }
  return { ok: true, value: out };
}

// ─────────────────────────── Bureta y montaje (§11) ───────────────────────────

function fillBurette(w: P10World, ml: number): P10DispatchResult {
  const b = w.burette;
  if (b.inverted) return { ok: false, code: 'INVERTED' };
  const cap = buretteTotalMl(w);
  const src = w.liquids.water_bottle;
  const add = Math.min(clamp(ml, 0, cap - b.waterMl), src.ml);
  src.ml -= add;
  b.waterMl += add;
  if (b.waterMl > cap - 0.02) flag10(w, 'buretteFull');
  b.stage = b.waterMl > 0 ? 'WATER_FILLED' : 'EMPTY';
  return { ok: true, value: b.waterMl };
}

function invertBurette(w: P10World, mouthSubmerged: boolean): P10DispatchResult {
  const b = w.burette;
  const bath = w.liquids.beaker600;
  if (b.inverted) return { ok: false, code: 'ALREADY' };
  if (b.waterMl <= 0) return { ok: false, code: 'EMPTY' };
  if (bath.ml < 150) return { ok: false, code: 'BATH_LOW' };
  const cap = buretteTotalMl(w);
  b.stage = 'INVERTING';
  let air = cap - b.waterMl;
  if (!mouthSubmerged) {
    // Invertir con la boca fuera del agua: entra aire y cae agua.
    air += 6 + hashRandom(w.seed, `inv${w.tick}`) * 4;
    emit10(w, 'INVERTED_IN_AIR', 'WARN');
    bump10(w, 'err:invertInAir');
  }
  air = Math.min(cap, air);
  b.inverted = true;
  b.initialAirMl = air;
  const T = w.bathC + 273.15;
  b.gasC = w.bathC;
  w.reactor.co2Escaped += b.nCo2;
  b.nAir = air > 0 ? ((w.params.pressureKPa - pvKPa(w, w.bathC)) * air) / (R_KPA_ML * T) : 0;
  b.nCo2 = 0;
  b.overflowMol = 0;
  b.stopcockOpen = false;
  // El agua que no cabe sale al baño.
  bath.ml += b.waterMl - (cap - air);
  b.waterMl = 0;
  w.objects.burette.support = 'beaker600';
  b.stage = 'SUBMERGED';
  w.evidence.__vbPrev = solveBurette(w).gasMl;
  if (air > 0.3) {
    latch10(w, `airBubble:${w.runs.length}`, 'BURETTE_AIR_BUBBLE', 'WARN', { ml: Math.round(air * 10) / 10 });
    w.evidence.__airBubbleMl = air;
  } else {
    w.evidence.__airBubbleMl = 0;
    flag10(w, 'buretteNoBubble');
  }
  return { ok: true, value: air };
}

/**
 * La boca salió del agua: el agua de la bureta cae al baño y entra aire; el CO₂ que había sale al ambiente.
 * Sacarla a propósito (para volver a llenarla) no es un error; perder la columna durante el ensayo, sí.
 */
function breakColumn(w: P10World, deliberate = false) {
  const b = w.burette;
  const s = solveBurette(w);
  const water = buretteTotalMl(w) - s.gasMl;
  w.liquids.beaker600.ml += Math.max(0, water);
  w.reactor.co2Escaped += b.nCo2;
  b.nAir = ((w.params.pressureKPa - pvKPa(w, b.gasC)) * buretteTotalMl(w)) / (R_KPA_ML * (b.gasC + 273.15));
  b.nCo2 = 0;
  w.evidence.__vbPrev = solveBurette(w).gasMl;
  if (deliberate) return;
  emit10(w, 'COLUMN_LOST', 'WARN');
  bump10(w, 'err:columnLost');
}

function connect(w: P10World, id: string, secured: boolean): P10DispatchResult {
  const c = w.connections[id];
  if (!c) return { ok: false, code: 'NO_CONNECTION' };
  c.connectedTo = id === 'c_stopper' ? 'hose' : id === 'c_hose_u' ? 'u_tube' : 'burette';
  c.secured = secured;
  if (!secured) latch10(w, `loose:${id}`, 'LOOSE_CONNECTION', 'INFO', { id });
  return { ok: true };
}

function leakTest(w: P10World): P10DispatchResult {
  if (w.reactor.acidAddedAt !== null && activeRun(w)) return { ok: false, code: 'REACTION_STARTED' };
  const c = w.connections;
  const loose = Object.values(c).filter((x) => x.connectedTo && !x.secured).map((x) => x.id);
  const missing = Object.values(c).filter((x) => !x.connectedTo).map((x) => x.id);
  const kinked = Object.values(c).filter((x) => x.kinkFraction > 0.4).map((x) => x.id);
  if (missing.length) {
    emit10(w, 'LEAK_TEST_INCOMPLETE', 'WARN', { missing: missing.join(',') });
    return { ok: false, code: 'NOT_CONNECTED' };
  }
  if (!w.reactor.stoppered) return { ok: false, code: 'NOT_STOPPERED' };
  flag10(w, 'leakTested');
  if (loose.length || sc(w, 'CRACKED_BURETTE')) {
    emit10(w, 'LEAK_FOUND', 'WARN', { at: loose.join(',') || 'burette' });
    return { ok: false, code: 'LEAK', value: loose.length };
  }
  if (kinked.length) emit10(w, 'FLOW_RESTRICTED', 'WARN', { at: kinked.join(',') });
  flag10(w, 'leakTestOk');
  emit10(w, 'LEAK_TEST_OK', 'INFO');
  return { ok: true };
}

// ─────────────────────────── Reacción (§12, §18) ───────────────────────────

function addVinegar(w: P10World): P10DispatchResult {
  const cyl = w.liquids.cylinder;
  if (cyl.ml <= 0) return { ok: false, code: 'EMPTY' };
  if (w.reactor.stoppered) return { ok: false, code: 'STOPPERED' };
  transferLiquid(w, 'cylinder', 'erlenmeyer', cyl.ml);
  return { ok: true };
}

/** El ácido entra al Erlenmeyer: el primer contacto con la alícuota inicia un ensayo (§17.4). */
function acidEntered(w: P10World, nAcid: number, ml: number) {
  const e = w.liquids.erlenmeyer;
  const r = w.reactor;
  let run = activeRun(w);
  if (!run) {
    if (e.nBicarb <= 0) return;
    r.acidAddedAt = w.timeS;
    r.stage = 'ACID_ADDED';
    r.mixing = Math.max(r.mixing, 0.5);
    run = {
      index: w.runs.length + 1, aliquotMl: e.ml - ml, nBicarb: e.nBicarb, nAcid: 0, limiting: 'NONE',
      acidAddedAt: w.timeS, sealedAt: null, buretteGasMlAtSeal: null, co2Generated: 0, co2Collected: 0, co2Dissolved: 0, co2Leaked: 0, co2Escaped: 0, endedS: null,
    };
    w.runs.push(run);
    w.evidence.__vbAtStart = solveBurette(w).gasMl;
    if (!chainOk(w)) latch10(w, `chain:${run.index}`, 'NOT_CONNECTED_AT_START', 'WARN');
    emit10(w, 'ACID_ADDED', 'INFO');
  }
  run.nAcid += nAcid;
  run.limiting = limiting(run.nAcid, run.nBicarb).limiting;
}

function insertStopper(w: P10World, on: boolean): P10DispatchResult {
  const r = w.reactor;
  if (on) {
    if (r.stoppered) return { ok: true };
    r.stoppered = true;
    w.objects.stopper.support = 'erlenmeyer';
    // Al tapar, el espacio de cabeza queda con aire a la presión ambiente (y saturado de vapor).
    const T = w.liquids.erlenmeyer.tempC + 273.15;
    const nCap = ((w.params.pressureKPa - pvKPa(w, w.liquids.erlenmeyer.tempC)) * headVolumeMl(w)) / (R_KPA_ML * T);
    const n = r.nAir + r.nCo2Gas;
    if (n <= 0) r.nAir = nCap;
    else {
      const k = nCap / n;
      r.nAir *= k;
      const lostCo2 = r.nCo2Gas * (1 - k);
      if (lostCo2 > 0) r.co2Escaped += lostCo2;
      r.nCo2Gas *= Math.min(1, k);
    }
    if (r.acidAddedAt !== null) {
      r.sealedAt = w.timeS;
      r.stage = 'REACTING';
      const run = activeRun(w);
      if (run && run.sealedAt === null) {
        run.sealedAt = w.timeS;
        run.buretteGasMlAtSeal = solveBurette(w).gasMl;
        const delay = w.timeS - run.acidAddedAt;
        w.evidence[`sealDelay:${run.index}`] = delay;
        if (delay > 4) {
          emit10(w, 'LATE_SEAL', 'WARN', { s: Math.round(delay) });
          bump10(w, 'err:lateSeal');
        } else flag10(w, `quickSeal:${run.index}`);
      }
    } else if (w.liquids.erlenmeyer.nBicarb > 0) r.stage = 'CONNECTED';
    return { ok: true };
  }
  if (!r.stoppered) return { ok: true };
  if (r.stage === 'REACTING' || r.stage === 'DEGASSING') {
    emit10(w, 'OPENED_DURING_REACTION', 'WARN');
    bump10(w, 'err:openedEarly');
  }
  r.stoppered = false;
  if (w.objects.stopper.support === 'erlenmeyer') w.objects.stopper.support = 'bench';
  if (r.stage === 'COMPLETE') r.stage = 'SAFE_TO_OPEN';
  return { ok: true };
}

function newRun(w: P10World): P10DispatchResult {
  const run = activeRun(w);
  if (run) {
    run.endedS = w.timeS;
    emit10(w, 'RUN_CLOSED', 'INFO', { index: run.index });
  }
  return { ok: true };
}

function emptyReactor(w: P10World): P10DispatchResult {
  const r = w.reactor;
  if (r.stoppered) return { ok: false, code: 'STOPPERED' };
  const run = activeRun(w);
  if (run) run.endedS = w.timeS;
  const e = w.liquids.erlenmeyer;
  // El CO₂ que queda disuelto se cuenta como desgasificado al ambiente.
  r.co2Escaped += r.nCo2Gas;
  r.nCo2Gas = 0;
  transferLiquid(w, 'erlenmeyer', 'waste', e.ml);
  const wst = w.liquids.waste;
  r.co2Escaped += wst.nCo2Aq;
  wst.nCo2Aq = 0;
  // Se enjuaga: el reactor queda listo para otra alícuota.
  e.ml = 0;
  e.wetMl = 0.4;
  r.stage = 'OPEN';
  r.acidAddedAt = null;
  r.sealedAt = null;
  r.completeAt = null;
  r.foam = 0;
  r.mixing = 0;
  r.quietS = 0;
  r.nAir = 0;
  return { ok: true };
}

function measureHeight(w: P10World, eyeDzCm: number): P10DispatchResult {
  if (!w.burette.inverted) return { ok: false, code: 'NOT_INVERTED' };
  const s = solveBurette(w);
  const aligned = (w.evidence.__rulerAligned ?? 0) > 0;
  const p = w.params.ruler;
  // Sin la regla alineada (vista con perspectiva) la diferencia sale sesgada (§15.5).
  const persp = aligned ? 0 : 6 + hashRandom(w.seed, `h${w.heightReadings.length}`) * 6;
  const bias = eyeDzCm * 0.8 + persp;
  const value = Math.round((s.hMm + bias) / p.resolutionMm) * p.resolutionMm;
  const r: HeightReading = { id: `h${w.heightReadings.length + 1}`, t: w.timeS, valueMm: value, trueMm: s.hMm, eyeDzCm, rulerAligned: aligned };
  w.heightReadings.push(r);
  if (!aligned) {
    emit10(w, 'RULER_NOT_ALIGNED', 'WARN');
    bump10(w, 'err:perspective');
  } else if (Math.abs(eyeDzCm) >= 1) {
    emit10(w, 'PARALLAX', 'WARN', { dir: eyeDzCm > 0 ? 'above' : 'below', inst: 'ruler' });
    bump10(w, 'err:parallax');
  } else flag10(w, `height:${w.runs.length}`);
  return { ok: aligned && Math.abs(eyeDzCm) < 1, id: r.id, value };
}

// ─────────────────────────── Balanza ───────────────────────────

function readBalance(w: P10World): MassReading {
  const b = w.balance;
  const p = w.params.balance;
  const load = panLoadG(w);
  const invalid = balanceValidity(b, p, load);
  const displayed = displayedBalance(b, p, load);
  const objectId = b.panObjectId;
  const m: MassReading = {
    id: `m${w.massReadings.length + 1}`, t: w.timeS, displayedG: Math.round(displayed * 10000) / 10000, trueG: load - b.tareG, objectId,
    bicarbG: objectId === 'watch_glass' ? w.solids.watchGlassG : 0, stable: b.stable, doorsOpen: b.doorsOpen, valid: !invalid, invalidReason: invalid, tare: false,
  };
  w.massReadings.push(m);
  if (invalid) {
    emit10(w, `BALANCE_${invalid}`, 'WARN');
    bump10(w, invalid === 'DOORS_OPEN' ? 'err:doorsOpen' : invalid === 'UNSTABLE' ? 'err:unstableMass' : 'err:badMass');
  } else {
    emit10(w, 'MASS_READ', 'INFO', { g: m.displayedG });
    if (objectId === 'watch_glass' && w.solids.watchGlassG < 0.001) flag10(w, 'emptyGlassWeighed');
    if (objectId === 'watch_glass' && w.solids.watchGlassG > 0.3) flag10(w, 'glassWithSampleWeighed');
    if (b.levelErrorDeg > 0.5) bump10(w, 'err:unlevelReading');
  }
  return m;
}

// ─────────────────────────── Pasos de simulación ───────────────────────────

function stepReaction(w: P10World, dt: number) {
  const e = w.liquids.erlenmeyer;
  const r = w.reactor;
  const p = w.params;
  r.stir = Math.max(0, r.stir - dt * 0.6);
  r.mixing = Math.min(1, r.mixing + dt * (0.004 + 0.25 * r.stir));
  let rate = 0;
  if (e.nAcid > 1e-12 && e.nBicarb > 1e-12 && e.ml > 0) {
    // r = k(T)·f_mezcla·n_lim (§12.3); la efervescencia mezcla por sí misma.
    const kT = p.reactionK * Math.exp(0.05 * (e.tempC - 25));
    const lim = Math.min(e.nAcid, e.nBicarb);
    const n = Math.min(lim, lim * (1 - Math.exp(-kT * (0.15 + 0.85 * r.mixing) * dt)));
    e.nAcid -= n;
    e.nBicarb -= n;
    e.nAcetate += n;
    e.nCo2Aq += n;
    r.co2Generated += n;
    w.evidence.__h2oProduced = (w.evidence.__h2oProduced ?? 0) + n;
    const run = activeRun(w);
    if (run) run.co2Generated += n;
    // Ligeramente endotérmica (HCO₃⁻ + H⁺ → CO₂ + H₂O).
    e.tempC -= (n * 9400) / (Math.max(1, e.ml) * 4.18);
    rate = n / dt;
    // Espuma: aumenta con la efervescencia y mucho con una agitación violenta (§18.3).
    r.foam += rate * dt * (120 + 14000 * r.stir * r.stir);
  }
  r.foam = Math.max(0, r.foam - dt * 0.12 * r.foam);
  if (r.foam > 1 && r.stoppered) {
    // La espuma sube al tapón: líquido en la manguera.
    const c = w.connections.c_stopper;
    if (c.wetFraction < 0.6) {
      c.wetFraction = Math.min(0.9, c.wetFraction + dt * 0.3);
      latch10(w, 'foamHose', 'LIQUID_IN_HOSE', 'WARN');
      bump10(w, 'err:foamHose', dt);
    }
  }
  // Desgasificación hacia el espacio de cabeza; en modo realista queda el CO₂ de equilibrio (Henry).
  const T = e.tempC + 273.15;
  let nEq = 0;
  if (p.model === 'REALISTIC' && e.ml > 0) {
    const nGas = r.nAir + r.nCo2Gas;
    const head = headVolumeMl(w);
    const pHead = nGas > 0 ? (nGas * R_KPA_ML * T) / head : 0;
    const pCo2Atm = nGas > 0 ? ((r.nCo2Gas / nGas) * pHead) / KPA_PER_ATM : 0;
    nEq = co2Saturation(pCo2Atm, T) * (e.ml / 1000);
  }
  const kd = p.degasK * (p.model === 'REALISTIC' ? 1 : 4) * (1 + 3 * r.stir + Math.min(2, rate * 3000));
  const d = Math.max(0, e.nCo2Aq - nEq) * (1 - Math.exp(-kd * dt));
  e.nCo2Aq -= d;
  r.nCo2Gas += d;
  // Fin de la reacción (§12.5): limitante agotado, generación lenta y sin burbujas nuevas sostenidamente.
  if (r.acidAddedAt !== null) {
    const quiet = rate < 2e-7 && d / dt < 3e-7;
    r.quietS = quiet ? r.quietS + dt : 0;
    if (r.stage === 'REACTING' && rate < 2e-7) r.stage = 'DEGASSING';
    if ((r.stage === 'DEGASSING' || r.stage === 'REACTING') && r.quietS > 20) {
      r.stage = 'COMPLETE';
      r.completeAt = w.timeS;
      emit10(w, 'REACTION_COMPLETE', 'INFO');
      flag10(w, `reactionComplete:${w.runs.length}`);
    }
  }
  e.tempC += (p.ambientC - e.tempC) * Math.min(1, dt / 400);
}

function stepGas(w: P10World, dt: number) {
  const r = w.reactor;
  const e = w.liquids.erlenmeyer;
  const p = w.params;
  const b = w.burette;
  const run = activeRun(w);
  const T = e.tempC + 273.15;
  const pv = pvKPa(w, e.tempC);
  const head = headVolumeMl(w);
  const nGas = r.nAir + r.nCo2Gas;
  const fracCo2 = nGas > 0 ? r.nCo2Gas / nGas : 0;
  const take = (mol: number) => {
    const c = mol * fracCo2;
    r.nCo2Gas -= c;
    r.nAir -= mol - c;
    return c;
  };
  if (!r.stoppered) {
    // Reactor abierto: el exceso sale al aire y el CO₂ difunde fuera lentamente.
    const nCap = ((p.pressureKPa - pv) * head) / (R_KPA_ML * T);
    const excess = nGas - nCap;
    if (excess > 0) {
      const c = take(excess);
      r.co2Escaped += c;
      if (run) run.co2Escaped += c;
    } else r.nAir += -excess;
    const diff = r.nCo2Gas * Math.min(1, dt * 0.02);
    r.nCo2Gas -= diff;
    r.nAir += diff;
    r.co2Escaped += diff;
    if (run) run.co2Escaped += diff;
    r.pressureKPa = p.pressureKPa;
    return;
  }
  r.pressureKPa = (nGas * R_KPA_ML * T) / head + pv;
  // Fugas en uniones flojas o con líquido (§13.4).
  for (const c of Object.values(w.connections)) {
    if (!c.connectedTo || c.secured) continue;
    const mol = Math.min(r.nAir + r.nCo2Gas, c.leakConductanceMolPerSKPa * Math.max(0, r.pressureKPa - p.pressureKPa) * dt);
    if (mol <= 0) continue;
    const co2 = take(mol);
    r.co2Leaked += co2;
    if (run) run.co2Leaked += co2;
  }
  // Salida hacia la bureta.
  const ok = chainOk(w);
  const s = solveBurette(w);
  const tipDepthCm = Math.max(0, s.zOutCm - (s.zMouthCm + 1.5));
  const pOut = ok ? p.pressureKPa + (p.model === 'REALISTIC' ? KPA_PER_CM_WATER * tipDepthCm : 0) : p.pressureKPa;
  const nCap = ((pOut - pv) * head) / (R_KPA_ML * T);
  const excess = r.nAir + r.nCo2Gas - nCap;
  const c = w.connections;
  const kink = Math.max(c.c_stopper.kinkFraction, c.c_hose_u.kinkFraction);
  const wet = Math.max(c.c_stopper.wetFraction, c.c_hose_u.wetFraction);
  const G = tipObstructed(w) ? 0 : 3 * (1 - kink) * (1 - 0.85 * wet);
  if (excess > 0 && G > 0) {
    let mol = excess * (1 - Math.exp(-G * dt));
    // Una unión floja desvía parte del gas que pasa (fuga pequeña que no se ve, §13.4).
    const loose = Object.values(c).filter((x) => x.connectedTo && !x.secured && x.id !== 'c_tip').length;
    if (loose > 0) {
      const lm = mol * (1 - 0.88 ** loose);
      const lc = take(lm);
      r.co2Leaked += lc;
      if (run) run.co2Leaked += lc;
      mol -= lm;
    }
    const co2 = take(mol);
    if (ok) {
      // Llega a la bureta: el gas entra a la temperatura del reactor.
      const nb = b.nAir + b.nCo2;
      b.gasC = (nb * b.gasC + mol * e.tempC) / Math.max(1e-12, nb + mol);
      b.nCo2 += co2;
      b.nAir += mol - co2;
      if (run) run.co2Collected += mol;
      if (b.stage === 'BASELINE_READY' || b.stage === 'CLAMPED' || b.stage === 'SUBMERGED') b.stage = 'GAS_COLLECTING';
    } else {
      r.co2Escaped += co2;
      if (run) run.co2Escaped += co2;
      latch10(w, `escape:${w.runs.length}`, 'GAS_ESCAPING', 'WARN');
    }
  }
  // Sobrepresión (manguera doblada u obstruida): el tapón salta (§27.3).
  if (r.pressureKPa - p.pressureKPa > 10) {
    emit10(w, 'STOPPER_POPPED', 'ALERT');
    bump10(w, 'err:overpressure');
    setBlock10(w, 'STOPPER_POPPED');
    w.safety.incident = { code: 'STOPPER_POPPED', since: w.timeS, needs: ['RELEASE'], done: [] };
    r.stoppered = false;
    w.objects.stopper.support = 'bench';
  } else if (r.pressureKPa - p.pressureKPa > 4) latch10(w, 'pressureRising', 'REACTOR_PRESSURE_RISING', 'WARN');
}

function stepBurette(w: P10World, dt: number) {
  const b = w.burette;
  const p = w.params;
  if (!b.inverted) return;
  // Aire por la llave abierta (aforo a 50,0 mL): entra mientras la presión interna sea menor que la atmosférica.
  let s = solveBurette(w);
  if (b.stopcockOpen) {
    const qMl = 0.22 * Math.max(0, p.pressureKPa - s.pKPa) * dt;
    b.nAir += ((p.pressureKPa - pvKPa(w, b.gasC)) * qMl) / (R_KPA_ML * (b.gasC + 273.15));
  }
  // Temperatura del gas → agua del baño.
  b.gasC += (w.bathC - b.gasC) * Math.min(1, dt / (p.model === 'REALISTIC' ? 45 : 20));
  // Disolución del CO₂ en el agua de la bureta (modo realista, §13.3).
  if (p.model === 'REALISTIC' && b.nCo2 > 0) {
    const nb = b.nAir + b.nCo2;
    const pCo2Atm = ((b.nCo2 / nb) * (s.pKPa - pvKPa(w, b.gasC))) / KPA_PER_ATM;
    const film = 2.5 / 1000;
    const sat = co2Saturation(pCo2Atm, b.gasC + 273.15) * film;
    const k = p.buretteKla * (p.bathWater === 'SATURATED' ? 0.1 : 1);
    const d = (sat - b.nCo2Aq) * (1 - Math.exp(-k * dt));
    if (d > 0) {
      const dd = Math.min(d, b.nCo2);
      b.nCo2 -= dd;
      b.nCo2Aq += dd;
      const run = activeRun(w);
      if (run) run.co2Dissolved += dd;
    }
  }
  s = solveBurette(w);
  // Capacidad (§16.3): si el gas no cabe, burbujea por la boca.
  const cap = buretteTotalMl(w);
  if (s.gasMl > cap) {
    const nb = b.nAir + b.nCo2;
    const keep = cap / s.gasMl;
    const lost = nb * (1 - keep);
    const lostCo2 = b.nCo2 * (1 - keep);
    b.nCo2 *= keep;
    b.nAir *= keep;
    b.overflowMol += lost;
    w.evidence.__co2Overflow = (w.evidence.__co2Overflow ?? 0) + lostCo2;
    latch10(w, `overflow:${w.runs.length}`, 'BURETTE_OVERFLOW', 'WARN');
    bump10(w, 'err:overflowBurette');
    s = solveBurette(w);
  }
  if (!s.mouthSubmerged) {
    breakColumn(w);
    s = solveBurette(w);
  }
  // El agua que sale de la bureta sube el nivel del baño (conservación de volumen).
  const prev = w.evidence.__vbPrev ?? s.gasMl;
  w.liquids.beaker600.ml += s.gasMl - prev;
  w.evidence.__vbPrev = s.gasMl;
  const r = w.reactor;
  if (b.stage === 'GAS_COLLECTING' && (r.stage === 'COMPLETE' || r.stage === 'SAFE_TO_OPEN')) b.stage = 'EQUILIBRATING';
  if (b.stage === 'EQUILIBRATING' && Math.abs(b.gasC - w.bathC) < 0.05) b.stage = 'READABLE';
}

function stepThermal(w: P10World, dt: number) {
  const p = w.params;
  // El baño toma la temperatura del agua que se le echó y tiende lentamente al ambiente.
  const bath = w.liquids.beaker600;
  if (bath.ml > 0) bath.tempC += (p.ambientC - bath.tempC) * Math.min(1, dt / 2400);
  w.bathC = bath.ml > 0 ? bath.tempC : p.ambientC;
  const t = w.thermometer;
  t.displayedC += (thermoTarget(w) - t.displayedC) * Math.min(1, dt / t.timeConstantS);
}

export function stepGasWorld(w: P10World): void {
  const p = w.params;
  const dt = p.dtS;
  w.timeS = Math.round((w.timeS + dt) * 1e6) / 1e6;
  w.tick++;
  stepPours(w, dt);
  stepReaction(w, dt);
  stepGas(w, dt);
  stepBurette(w, dt);
  stepThermal(w, dt);
  stepAnalyticalBalance(w.balance, panLoadG(w), p.balance, dt, w.timeS, gauss10(w));
  // El vidrio de reloj mojado se seca de a poco (la masa aparente baja).
  if (w.solids.watchGlassWetG > 0) w.solids.watchGlassWetG = Math.max(0, w.solids.watchGlassWetG - dt * 0.00002);
  stepBoyle(w, dt);
}

export function runGasFor(w: P10World, seconds: number) {
  const n = Math.round(seconds / w.params.dtS);
  for (let i = 0; i < n; i++) stepGasWorld(w);
}

export function p10Summary(w: P10World) {
  const s = solveBurette(w);
  return {
    gas: Math.round(s.gasMl * 1000) / 1000,
    h: Math.round(s.hMm * 10) / 10,
    co2: Math.round(w.reactor.co2Generated * 1e8) / 1e8,
    runs: w.runs.length,
    mark: Math.round(w.syringe.markMl * 1000) / 1000,
    p: Math.round(w.syringe.pressureKPa * 100) / 100,
    points: w.points.length,
  };
}
