/**
 * Mundo de la Práctica 3 (mechero de Bunsen y prueba de llama): creación, comandos y paso fijo determinista.
 * Orden de cada paso: mechero (flujo, ignición, régimen) → sala (gas acumulado, CO) → manguera → cápsula →
 * asas y disoluciones → atomizadores → vidrio → observaciones → seguridad.
 * El dominio nunca depende de los fotogramas: misma semilla + mismos comandos ⇒ mismo resultado.
 */
import { clamp } from '../core/math';
import { rand } from '../core/rng';
import {
  baseFlameSpectrum, combustionProducts, computeAirMix, excitation, FUELS, flameContact, flameShape, flameTemperatureAt,
  MOLAR_VOLUME_ML, outerRadiusAt, regimeOf, type CombustionParams, type FlameRegime, type FlameState, type FuelId,
} from '../combustion/combustion';
import {
  addComponents, addScaled, applyFilter, colorRegion, emptySpectrum, N_BINS, observe, spectrumToXyz,
  type SpectralComponent, type Spectrum,
} from '../spectroscopy/spectrum';
import type { FlameCommand, FlameDispatchResult } from './commands';
import type {
  AtomizerState, BurnerState, CationObservation, FlameStateName, FlameWorld, LoopPhase, NichromeLoopState, ObjKind,
  Practice3Object, Practice3Params, Pose, Severity, SimEvent, SolutionState, UnknownSample,
} from './types';

// ─────────────────────────── Contexto (perfiles y geometría inyectados por la práctica) ───────────────────────────

export interface EmissionProfile {
  components: SpectralComponent[];
  volatilityFactor: number;
  sodiumSensitivity: number;
}

export interface FlameGeometry {
  burner: { mouthZ: number; mouthR: number; inlet: { dx: number; dy: number; z: number } };
  tapNozzleDy: number;
  tube: { innerR: number; height: number; bottomZ: number; cmPerMl: number };
  loopTouchCm: number;
  capsule: { rimR: number; height: number };
  glass: { halfW: number; halfH: number };
  hcl: { r: number; h: number };
  rinse: { r: number; waterZ: number };
}

export interface FlameContext {
  profiles: Record<string, EmissionProfile>;
  blueFlame: SpectralComponent[];
  cobalt: Spectrum;
  geo: FlameGeometry;
}

export interface FlameWorldSpec {
  objects: Array<{ id: string; kind: ObjKind; pose: Pose; support: string; movable: boolean }>;
  solutions: SolutionState[];
  loops: Array<{ id: string; assignedSolutionId?: string; contamination?: Record<string, number> }>;
  atomizers: Array<{ id: string; solutionId: string }>;
  unknown: UnknownSample;
  hose?: { cracked: boolean };
  room?: { ventilation?: number; draft?: number };
  fuel?: FuelId;
}

// ─────────────────────────── Utilidades ───────────────────────────

const MAX_EVENTS = 3000;

export function emit3(w: FlameWorld, code: string, severity: Severity, params?: SimEvent['params'], id?: string): SimEvent {
  const seq = (w.evidence.__eventSeq ?? 0) + 1;
  w.evidence.__eventSeq = seq;
  const e: SimEvent = { seq, t: Math.round(w.timeS * 100) / 100, code, severity, ...(id ? { vesselId: id } : {}), ...(params ? { params } : {}) };
  w.events.push(e);
  if (w.events.length > MAX_EVENTS) w.events.splice(0, w.events.length - MAX_EVENTS);
  return e;
}

/** Emite una vez hasta que la condición se rearme con `rearm(w, key)`. */
function emitLatched(w: FlameWorld, key: string, code: string, severity: Severity, params?: SimEvent['params'], id?: string) {
  const k = `latch:${key}`;
  if (w.evidence[k]) return;
  w.evidence[k] = 1;
  emit3(w, code, severity, params, id);
}
function rearm(w: FlameWorld, key: string) {
  if (w.evidence[`latch:${key}`]) w.evidence[`latch:${key}`] = 0;
}
function bump(w: FlameWorld, key: string, by = 1) {
  w.evidence[key] = (w.evidence[key] ?? 0) + by;
}
function flag(w: FlameWorld, key: string) {
  if (!w.evidence[key]) w.evidence[key] = Math.max(0.01, Math.round(w.timeS * 100) / 100);
}

export function combustionParams(p: Practice3Params): CombustionParams {
  return {
    nominalMaxFlowMlS: p.nominalMaxFlowMlS, intakeEfficiency: p.intakeEfficiency, yellowMax: p.yellowMax, transitionalMax: p.transitionalMax,
    blueMax: p.blueMax, minFlow: p.minFlow, flashbackAirMix: p.flashbackAirMix, flashbackMaxFlow: p.flashbackMaxFlow, liftAirMix: p.liftAirMix,
    liftMinFlow: p.liftMinFlow, liftHighFlow: p.liftHighFlow, sootShare: p.sootShare,
  };
}

const LIT_STATES: FlameStateName[] = ['IGNITING', 'YELLOW_LUMINOUS', 'TRANSITIONAL', 'BLUE_STABLE', 'LIFTED', 'FLASHBACK'];
export const isLit = (w: FlameWorld): boolean => LIT_STATES.includes(w.burner.flameState);
/** Llama visible fuera del cañón. */
export const hasOpenFlame = (w: FlameWorld): boolean => isLit(w) && w.burner.flameState !== 'FLASHBACK' && w.burner.flame.heightCm > 0;

function offFlame(fuelFlow = 0, airMix = 0): FlameState {
  return {
    isLit: false, fuelFlow, airMix, heightCm: 0, innerConeHeightCm: 0, radiusCm: 0, blueness: 0, luminosity: 0, maxTempC: 0, liftGapCm: 0,
    flashback: false, stability: 1, regime: 'YELLOW', sootRateMgS: 0, coRateMgS: 0, completeFraction: 0, heatW: 0, temperatureFieldId: 'off',
  };
}

/** Boca del mechero en coordenadas de la mesada. */
export function mouthPos(w: FlameWorld, ctx: FlameContext): { x: number; y: number; z: number } {
  const b = w.objects.burner.pose;
  return { x: b.x, y: b.y, z: b.z + ctx.geo.burner.mouthZ };
}

/** Coordenadas relativas a la llama (r horizontal al eje, z sobre la boca). */
export function flameRelative(w: FlameWorld, ctx: FlameContext, p: { x: number; y: number; z: number }): { r: number; z: number } {
  const m = mouthPos(w, ctx);
  return { r: Math.hypot(p.x - m.x, p.y - m.y), z: p.z - m.z };
}

export function localTemperature(w: FlameWorld, ctx: FlameContext, p: { x: number; y: number; z: number }): number {
  const f = hasOpenFlame(w) || w.burner.flameState === 'FLASHBACK' ? w.burner.flame : null;
  const q = flameRelative(w, ctx, p);
  return flameTemperatureAt(f, q.r, q.z, w.params.ambientC);
}

export function localContact(w: FlameWorld, ctx: FlameContext, p: { x: number; y: number; z: number }): number {
  if (!hasOpenFlame(w)) return 0;
  const q = flameRelative(w, ctx, p);
  return flameContact(w.burner.flame, q.r, q.z);
}

const burnerUpright = (w: FlameWorld): boolean => {
  const q = w.objects.burner.pose.quat;
  return !q || (Math.abs(q[0]) < 0.12 && Math.abs(q[2]) < 0.12);
};

// ─────────────────────────── Creación ───────────────────────────

export function createFlameWorld(spec: FlameWorldSpec, seed: number, params: Practice3Params): FlameWorld {
  const objects: Record<string, Practice3Object> = {};
  for (const o of spec.objects) objects[o.id] = { id: o.id, kind: o.kind, pose: { ...o.pose }, support: o.support, temperatureC: params.ambientC, movable: o.movable };
  const solutions: Record<string, SolutionState> = {};
  for (const s of spec.solutions) solutions[s.id] = structuredClone(s);
  const loops: Record<string, NichromeLoopState> = {};
  for (const l of spec.loops) loops[l.id] = newLoop(l.id, params.ambientC, l.assignedSolutionId, l.contamination);
  const atomizers: Record<string, AtomizerState> = {};
  for (const a of spec.atomizers) atomizers[a.id] = { solutionId: a.solutionId, yawRad: Math.PI / 2, residueMg: {}, bursts: 0, aerosolInFlameMg: {}, lastHitFraction: 0 };
  const tap = objects.gas_tap?.pose ?? { x: 0, y: 63, z: 12, rotationRad: 0 };
  const bp = objects.burner?.pose ?? { x: 0, y: 30, z: 0, rotationRad: 0 };
  const cracked = !!spec.hose?.cracked;
  const observations: Record<string, CationObservation> = {};
  for (const id of Object.keys(solutions)) observations[id] = emptyObservation();
  const baseVent = spec.room?.ventilation ?? 0.3;
  const burner: BurnerState = {
    tableGasValve: 0, needleGasValve: 0, airCollar: 0, hoseConnected: false, hoseIntegrity: cracked ? 0.72 : 1, hoseDistanceFromFlameCm: 30,
    ventilation: baseVent, ignitionSourceAtMouth: false, accumulatedFuelMl: 0, fuel: spec.fuel ?? 'PROPANE', flameState: 'OFF',
    bodyTemperatureC: params.ambientC, supplyOn: true, flame: offFlame(), ignitingS: 0, liftedS: 0, flashbackS: 0, flareS: 0, needleHistory: [], litOnceAt: null,
  };
  return {
    kind: 'practice-03',
    seed,
    rng: seed >>> 0 || 1,
    tick: 0,
    timeS: 0,
    params,
    ppe: false,
    burner,
    hose: { mid: { x: (tap.x + bp.x) / 2 + 6, y: (tap.y + bp.y) / 2 + 4, z: 0.8 }, temperatureC: params.ambientC, cracked, crackFound: false, inspected: false, soapTested: false, replaced: 0 },
    lighter: { sparking: false, sparks: 0 },
    capsule: { sootMassMg: 0, sootCoverage: 0, sootByRegimeMg: {}, exposures: [], activeExposure: null, wipes: 0, cleanedAt: null, clampedBy: null, gripQuality: 0, burned: false },
    tongs: Object.fromEntries(Object.values(objects).filter((o) => o.kind === 'tongs').map((o) => [o.id, { holding: null }])),
    loops,
    solutions,
    glass: { type: 'COBALT_BLUE_GLASS', transmissionCurveId: 'cobalt-default', cleanliness: 1, alignment: 0, distanceToCameraCm: 0, damaged: false },
    atomizers,
    hcl: { open: false, openedS: 0, dips: 0, hotDips: 0 },
    objects,
    room: { ventilation: baseVent, extractionOn: false, draft: spec.room?.draft ?? 0, coPpm: 0, gasAccumMl: 0, alarm: false, ambientSodium: 1 },
    safety: { block: null, incident: null, burns: 0, located: {}, stoppedByTeacher: false },
    unknown: spec.unknown,
    parts: { answers: {}, attempts: 0, wrong: 0 },
    observations,
    flameLog: { yellowSeenS: 0, blueSeenS: 0, transitionSeen: false, heightOkS: 0, twoConesS: 0, maxBlueHeightCm: 0 },
    evidence: {},
    events: [],
  };
}

export function newLoop(id: string, ambientC: number, assignedSolutionId?: string, contamination?: Record<string, number>): NichromeLoopState {
  return {
    id, assignedSolutionId, temperatureC: ambientC, surfaceWaterMg: 0, depositedSpeciesMg: {}, contaminationSpeciesMg: { ...(contamination ?? {}) },
    oxideCondition: 0.1, isCleanForTest: !contamination || Object.values(contamination).every((v) => v < 2e-4), phase: 'COOL_CLEAN', emission: 0,
    inFlameS: 0, checkedClean: false, acidWet: false, immersedIn: null, immersionDepthCm: 0, restingOn: null, spare: false,
    emissionRates: {}, loadedSinceClean: false, overloaded: false, sputtered: false,
  };
}

function emptyObservation(): CationObservation {
  return { noFilter: null, filter: null, emittingS: 0, yellowFlameS: 0, maxContaminationShare: 0, tests: 0 };
}

export function loopResidueMg(l: NichromeLoopState): number {
  let s = 0;
  for (const v of Object.values(l.depositedSpeciesMg)) s += v;
  for (const v of Object.values(l.contaminationSpeciesMg)) s += v;
  return s;
}

// ─────────────────────────── Comandos ───────────────────────────

export function dispatchFlame(w: FlameWorld, cmd: FlameCommand, ctx: FlameContext): FlameDispatchResult {
  const b = w.burner;
  switch (cmd.type) {
    case 'confirmPpe':
      w.ppe = true;
      return { ok: true };
    case 'setValve': {
      const v = clamp(cmd.value, 0, 1);
      if (cmd.valve === 'TABLE') b.tableGasValve = v;
      else if (cmd.valve === 'NEEDLE') b.needleGasValve = v;
      else b.airCollar = v;
      trackSequence(w, cmd.valve, v);
      return { ok: true };
    }
    case 'connectHose': {
      if (!cmd.connected && b.tableGasValve > 0.02) {
        // Retirar la manguera con gas abierto: fuga crítica (§14.4).
        emit3(w, 'HOSE_REMOVED_GAS_OPEN', 'CRITICAL');
        bump(w, 'err:hoseRemovedOpen');
      }
      b.hoseConnected = cmd.connected;
      emit3(w, cmd.connected ? 'HOSE_CONNECTED' : 'HOSE_DISCONNECTED', 'INFO');
      return { ok: true };
    }
    case 'replaceHose': {
      if (b.tableGasValve > 0.02 || isLit(w)) return { ok: false, code: 'CLOSE_GAS_FIRST' };
      w.hose.cracked = false;
      w.hose.crackFound = false;
      w.hose.temperatureC = w.params.ambientC;
      b.hoseIntegrity = 1;
      w.hose.replaced++;
      b.hoseConnected = false;
      emit3(w, 'HOSE_REPLACED', 'INFO');
      return { ok: true };
    }
    case 'setHoseMid':
      w.hose.mid = { x: cmd.x, y: clamp(cmd.y, -2, 66), z: clamp(cmd.z, 0.5, 40) };
      return { ok: true };
    case 'spark': {
      const was = w.lighter.sparking;
      w.lighter.sparking = cmd.on;
      if (cmd.on && !was) {
        w.lighter.sparks++;
        w.evidence.sparkStartedAt = w.timeS;
        // Buscar fugas con llama (§7.1, §15.1): prohibido.
        const lp = w.objects.lighter?.pose;
        if (lp && hoseDistanceTo(w, ctx, lp) < 4) {
          emit3(w, 'LEAK_TEST_WITH_FLAME', 'CRITICAL');
          bump(w, 'err:leakFlameTest');
          setBlock(w, 'LEAK_FLAME_TEST');
        }
      }
      return { ok: true };
    }
    case 'setPose':
      return setPose(w, ctx, cmd.id, cmd.pose, cmd.support);
    case 'pickUp': {
      const o = w.objects[cmd.id];
      if (!o) return { ok: false, code: 'NO_OBJECT' };
      if (w.safety.incident) return { ok: false, code: 'INCIDENT' };
      if (cmd.tool === 'HAND') {
        const t = o.kind === 'capsule' ? o.temperatureC : o.kind === 'burner' ? Math.min(o.temperatureC, 40) : o.kind === 'glass' ? o.temperatureC : 0;
        if (t > 60) {
          // Quemadura simulada (§14.2): sin dramatizar, primeros auxilios virtuales.
          w.safety.burns++;
          if (o.kind === 'capsule') w.capsule.burned = true;
          emit3(w, 'BURN_HOT_OBJECT', 'CRITICAL', { obj: o.kind, t: Math.round(t) }, o.id);
          bump(w, 'err:burn');
          w.safety.incident = { code: 'BURN', since: w.timeS, needs: ['FIRST_AID'], done: [] };
          return { ok: false, code: 'BURN' };
        }
        if (t > 40) emit3(w, 'HOT_TO_TOUCH', 'WARN', { t: Math.round(t) }, o.id);
      }
      if (o.kind === 'burner' && isLit(w)) {
        emit3(w, 'BURNER_MOVED_LIT', 'ALERT');
        bump(w, 'err:movedLit');
      }
      return { ok: true };
    }
    case 'clamp': {
      const tg = w.tongs[cmd.tongsId];
      const target = w.objects[cmd.targetId];
      if (!tg || !target) return { ok: false, code: 'NO_OBJECT' };
      if (tg.holding) return { ok: false, code: 'TONGS_BUSY' };
      if (target.kind !== 'capsule') return { ok: false, code: 'NOT_GRIPPABLE' };
      if (cmd.grip < 0.15) return { ok: false, code: 'GRIP_MISSED' };
      tg.holding = target.id;
      w.capsule.clampedBy = cmd.tongsId;
      w.capsule.gripQuality = clamp(cmd.grip, 0, 1);
      target.support = `tongs:${cmd.tongsId}`;
      w.evidence.slipDist = 0;
      if (cmd.grip < 0.45) emit3(w, 'GRIP_POOR', 'WARN');
      flag(w, 'usedTongs');
      return { ok: true };
    }
    case 'unclamp': {
      const tg = w.tongs[cmd.tongsId];
      if (!tg?.holding) return { ok: false, code: 'NOT_HOLDING' };
      const target = w.objects[tg.holding];
      tg.holding = null;
      w.capsule.clampedBy = null;
      if (target && target.support.startsWith('tongs:')) target.support = 'falling';
      return { ok: true };
    }
    case 'wipeCapsule': {
      const c = w.objects.capsule;
      if (!c) return { ok: false };
      if (c.temperatureC > 45) {
        // Limpiar sin enfriar: alerta; no borra la temperatura ni el hollín (§26.2-5).
        emit3(w, 'CLEAN_HOT_CAPSULE', 'ALERT', { t: Math.round(c.temperatureC) });
        bump(w, 'err:cleanHot');
        return { ok: false, code: 'CAPSULE_HOT' };
      }
      const k = 0.22;
      w.capsule.sootMassMg *= k;
      for (const key of Object.keys(w.capsule.sootByRegimeMg)) w.capsule.sootByRegimeMg[key as FlameStateName]! *= k;
      if (w.capsule.sootMassMg < 0.004) {
        w.capsule.sootMassMg = 0;
        w.capsule.sootByRegimeMg = {};
      }
      w.capsule.sootCoverage = coverageFromMass(w.capsule.sootMassMg);
      w.capsule.wipes++;
      w.capsule.cleanedAt = w.timeS;
      emit3(w, w.capsule.sootMassMg < 0.05 ? 'CAPSULE_CLEAN' : 'CAPSULE_WIPED', 'INFO', { left: Math.round(w.capsule.sootMassMg * 100) / 100 });
      return { ok: true };
    }
    case 'inspect': {
      const tgt = cmd.target;
      if (['extinguisher', 'blanket', 'estop', 'extractor', 'co_detector'].includes(tgt)) {
        w.safety.located[tgt] = true;
      } else if (tgt === 'hose') {
        w.hose.inspected = true;
        if (w.hose.cracked || w.burner.hoseIntegrity < 0.85) {
          w.hose.crackFound = true;
          emit3(w, 'HOSE_CRACK_FOUND', 'ALERT');
        } else emit3(w, 'HOSE_OK', 'INFO', { connected: w.burner.hoseConnected });
        flag(w, 'inspectedHose');
      } else if (tgt === 'burner') {
        flag(w, 'inspectedBurner');
        const closed = b.tableGasValve < 0.02 && b.needleGasValve < 0.02 && b.airCollar < 0.05;
        if (closed) flag(w, 'valvesConfirmedClosed');
        // Tras el apagado: confirmar ausencia de llama, sonido y flujo (§7.3-4).
        if (w.evidence.shutdownStarted && !isLit(w) && b.tableGasValve < 0.02 && b.needleGasValve < 0.02) flag(w, 'shutdownConfirmed');
        emit3(w, 'BURNER_INSPECTED', 'INFO', { closed });
      } else if (w.solutions[tgt]) {
        flag(w, `inspectedSolution:${tgt}`);
      }
      return { ok: true };
    }
    case 'soapTest': {
      w.hose.soapTested = true;
      const pressurized = b.tableGasValve > 0.02 && b.supplyOn;
      const leaking = pressurized && (w.hose.cracked || b.hoseIntegrity < 0.85 || !b.hoseConnected);
      if (leaking) w.hose.crackFound = true;
      emit3(w, leaking ? 'SOAP_BUBBLES' : pressurized ? 'SOAP_NO_BUBBLES' : 'SOAP_NO_PRESSURE', leaking ? 'ALERT' : 'INFO');
      flag(w, 'soapTested');
      return { ok: true };
    }
    case 'identifyPart': {
      w.parts.attempts++;
      if (cmd.part === cmd.answer) {
        w.parts.answers[cmd.answer] = cmd.part;
        emit3(w, 'PART_IDENTIFIED', 'INFO', { part: cmd.part });
        return { ok: true };
      }
      w.parts.wrong++;
      emit3(w, 'PART_WRONG', 'WARN', { part: cmd.part, answer: cmd.answer });
      return { ok: false, code: 'WRONG_PART' };
    }
    case 'setExtraction':
      w.room.extractionOn = cmd.on;
      w.room.ventilation = cmd.on ? 1 : (w.evidence.baseVentilation ?? 0.3);
      b.ventilation = w.room.ventilation;
      if (cmd.on) {
        flag(w, 'extractionOn');
        w.safety.located.extractor = true;
      }
      return { ok: true };
    case 'emergencyShutoff':
      b.supplyOn = false;
      w.lighter.sparking = false;
      emit3(w, 'EMERGENCY_SHUTOFF', 'ALERT');
      flag(w, 'usedShutoff');
      if (w.safety.incident?.needs.includes('SHUTOFF') && !w.safety.incident.done.includes('SHUTOFF')) w.safety.incident.done.push('SHUTOFF');
      return { ok: true };
    case 'restoreSupply':
      if (w.safety.incident) return { ok: false, code: 'INCIDENT' };
      if (b.tableGasValve > 0.02 || b.needleGasValve > 0.02) return { ok: false, code: 'CLOSE_VALVES_FIRST' };
      b.supplyOn = true;
      emit3(w, 'SUPPLY_RESTORED', 'INFO');
      return { ok: true };
    case 'useBlanket':
    case 'useExtinguisher': {
      const need = cmd.type === 'useBlanket' ? 'BLANKET' : 'EXTINGUISHER';
      const inc = w.safety.incident;
      if (!inc || !inc.needs.includes(need)) {
        emit3(w, cmd.type === 'useBlanket' ? 'BLANKET_UNNEEDED' : 'EXTINGUISHER_UNNEEDED', 'WARN');
        return { ok: false, code: 'NOT_NEEDED' };
      }
      if (!inc.done.includes(need)) inc.done.push(need);
      emit3(w, cmd.type === 'useBlanket' ? 'BLANKET_USED' : 'EXTINGUISHER_USED', 'INFO');
      return { ok: true };
    }
    case 'firstAid': {
      const inc = w.safety.incident;
      if (inc?.needs.includes('FIRST_AID') && !inc.done.includes('FIRST_AID')) inc.done.push('FIRST_AID');
      emit3(w, 'FIRST_AID', 'INFO');
      return { ok: true };
    }
    case 'raiseAlarm':
      w.room.alarm = true;
      emit3(w, 'ALARM_RAISED', 'ALERT');
      flag(w, 'alarmRaised');
      return { ok: true };
    case 'acknowledge':
      return acknowledge(w);
    case 'setHcl': {
      if (!w.objects.hcl) return { ok: false, code: 'NO_HCL' };
      if (cmd.open && !w.ppe) return { ok: false, code: 'PPE' };
      w.hcl.open = cmd.open;
      if (cmd.open) w.hcl.openedS = 0;
      emit3(w, cmd.open ? 'HCL_OPENED' : 'HCL_CLOSED', 'INFO');
      if (!cmd.open) rearm(w, 'hclNearFlame');
      return { ok: true };
    }
    case 'setFilterAlignment':
      w.glass.alignment = clamp(cmd.alignment, 0, 1);
      w.glass.distanceToCameraCm = cmd.distanceCm;
      return { ok: true };
    case 'cleanGlass':
      w.glass.cleanliness = Math.min(1, w.glass.cleanliness + 0.6);
      emit3(w, 'GLASS_CLEANED', 'INFO');
      return { ok: true };
    case 'requestSpareLoop': {
      const sol = w.solutions[cmd.solutionId];
      if (!sol && cmd.solutionId !== 'shared') return { ok: false, code: 'NO_SOLUTION' };
      let n = 2;
      const base = cmd.solutionId === 'shared' ? 'loop_shared' : `loop_${cmd.solutionId.replace('sol_', '')}`;
      while (w.loops[`${base}_${n}`]) n++;
      const id = `${base}_${n}`;
      const holder = w.objects.holder?.pose ?? { x: 100, y: 20, z: 0, rotationRad: 0 };
      w.loops[id] = newLoop(id, w.params.ambientC, sol ? cmd.solutionId : undefined);
      w.loops[id].spare = true;
      w.objects[id] = { id, kind: 'loop', pose: { x: holder.x + 22 + (n - 2) * 2, y: holder.y - 4, z: 0.6, rotationRad: 0 }, support: 'bench', temperatureC: w.params.ambientC, movable: true };
      emit3(w, 'SPARE_LOOP', 'INFO', { id });
      bump(w, 'spareLoops');
      return { ok: true, id };
    }
    case 'spray':
      return spray(w, ctx, cmd.atomizerId);
    case 'setAtomizerYaw': {
      const a = w.atomizers[cmd.id];
      if (!a) return { ok: false };
      a.yawRad = cmd.yawRad;
      return { ok: true };
    }
    case 'teacherStop':
      w.safety.stoppedByTeacher = cmd.on;
      if (cmd.on) {
        b.tableGasValve = 0;
        b.needleGasValve = 0;
        w.lighter.sparking = false;
        emit3(w, 'TEACHER_STOP', 'ALERT');
      }
      return { ok: true };
  }
}

function setBlock(w: FlameWorld, code: string) {
  if (w.safety.block?.code === code) return;
  w.safety.block = { code, since: w.timeS };
}

function acknowledge(w: FlameWorld): FlameDispatchResult {
  const b = w.burner;
  const inc = w.safety.incident;
  if (inc) {
    const pending = inc.needs.filter((n) => !inc.done.includes(n));
    if (pending.length) return { ok: false, code: `PENDING_${pending[0]}` };
    w.safety.incident = null;
    emit3(w, 'INCIDENT_RESOLVED', 'INFO');
    return { ok: true };
  }
  const blk = w.safety.block;
  if (!blk) return { ok: true };
  if (blk.code === 'GAS_ACCUMULATION' || blk.code === 'LEAK_FLAME_TEST') {
    // Cerrar, ventilar y reiniciar la estación (§6.3).
    if (b.tableGasValve > 0.02 || b.needleGasValve > 0.02) return { ok: false, code: 'CLOSE_VALVES_FIRST' };
    if (w.room.gasAccumMl > 15) return { ok: false, code: 'VENTILATE_FIRST' };
  }
  if (blk.code === 'CO_HIGH') {
    if (w.room.coPpm > w.params.coWarnPpm) return { ok: false, code: 'VENTILATE_FIRST' };
    if (b.tableGasValve > 0.02 || b.needleGasValve > 0.02) return { ok: false, code: 'CLOSE_VALVES_FIRST' };
    b.supplyOn = true;
  }
  if (blk.code === 'PPE') {
    if (!w.ppe) return { ok: false, code: 'PPE' };
  }
  w.safety.block = null;
  w.room.alarm = false;
  emit3(w, 'STATION_RESET', 'INFO', { code: blk.code });
  return { ok: true };
}

/** Secuencias de encendido y apagado (§7.2–7.3): se registran los instantes de cada maniobra. */
function trackSequence(w: FlameWorld, valve: 'TABLE' | 'NEEDLE' | 'AIR', v: number) {
  const ev = w.evidence;
  const t = w.timeS;
  const b = w.burner;
  if (valve === 'TABLE' && v > 0.05 && !ev.tableOpenedAt) ev.tableOpenedAt = t;
  if (valve === 'NEEDLE' && v > 0.04 && (ev.needleOpenedAt ?? 0) <= (ev.needleClosedAt ?? -1)) ev.needleOpenedAt = t;
  if (valve === 'NEEDLE' && v <= 0.02) ev.needleClosedAt = t;
  if (valve === 'TABLE' && v <= 0.02) ev.tableClosedAt = t;
  if (valve === 'AIR' && v <= 0.05) ev.airClosedAt = t;
  if (valve === 'AIR' && v > 0.05) ev.airOpenedAt = t;
  // Apagado después de haber tenido llama: orden aire → aguja → mesa.
  if (b.litOnceAt !== null && (valve === 'NEEDLE' || valve === 'TABLE') && v <= 0.02) {
    if (!ev.shutdownStarted) ev.shutdownStarted = t;
    if (valve === 'NEEDLE') ev.shutdownAirFirst = b.airCollar <= 0.05 ? 1 : -1;
    if (valve === 'TABLE') {
      ev.shutdownNeedleFirst = b.needleGasValve <= 0.02 ? 1 : -1;
      if (b.needleGasValve > 0.02 && isLit(w)) emit3(w, 'TABLE_CLOSED_FIRST', 'WARN');
    }
  }
}

function setPose(w: FlameWorld, ctx: FlameContext, id: string, pose: Pose, support?: string): FlameDispatchResult {
  const o = w.objects[id];
  if (!o) return { ok: false, code: 'NO_OBJECT' };
  const prev = o.pose;
  const moved = Math.hypot(pose.x - prev.x, pose.y - prev.y, pose.z - prev.z);
  o.pose = { ...pose };
  if (support !== undefined) o.support = support;
  if (o.kind === 'burner' && support === 'hand' && moved > 0.5 && isLit(w)) {
    // Mover el mechero encendido: la llama se apaga y el gas sigue saliendo (§14.1).
    w.burner.flameState = 'EXTINGUISHED';
    w.burner.flame = offFlame(w.burner.flame.fuelFlow, w.burner.flame.airMix);
    emitLatched(w, 'movedLit', 'FLAME_OUT_MOVED', 'ALERT');
  }
  if (o.kind === 'tongs' && w.tongs[id]?.holding) {
    // Agarre deficiente: la cápsula puede resbalar al desplazarla (§13.3).
    const cap = w.objects[w.tongs[id].holding!];
    if (w.capsule.gripQuality < 0.45) {
      w.evidence.slipDist = (w.evidence.slipDist ?? 0) + moved * (1 - w.capsule.gripQuality);
      if ((w.evidence.slipDist ?? 0) > 18) {
        w.tongs[id].holding = null;
        w.capsule.clampedBy = null;
        if (cap) cap.support = 'falling';
        emit3(w, 'CAPSULE_SLIPPED', 'WARN');
        bump(w, 'err:slipped');
      }
    }
  }
  if (o.kind === 'capsule' && (support === 'bench' || support === 'tile') && o.temperatureC > 60) {
    if (support === 'bench') {
      emit3(w, 'HOT_ON_BENCH', 'WARN', { t: Math.round(o.temperatureC) }, id);
      bump(w, 'err:hotOnBench');
    }
  }
  if (o.kind === 'loop' && support?.startsWith('holder:')) {
    const l = w.loops[id];
    const slot = Number(support.split(':')[1]);
    const expected = l?.assignedSolutionId ? Object.keys(w.solutions).indexOf(l.assignedSolutionId) : slot;
    if (l && l.assignedSolutionId && expected !== slot && !l.spare) emit3(w, 'LOOP_WRONG_SLOT', 'WARN', undefined, id);
    if (l && l.temperatureC > 200) emit3(w, 'LOOP_STORED_HOT', 'WARN', undefined, id);
  }
  if (o.kind === 'tube' && pose.quat) {
    const up = Math.abs(pose.quat[0]) < 0.35 && Math.abs(pose.quat[2]) < 0.35;
    const sol = w.solutions[id];
    if (!up && sol && !sol.spilled) {
      sol.spilled = true;
      sol.volumeMl = 0;
      emit3(w, 'TUBE_SPILLED', 'ALERT', undefined, id);
      bump(w, 'err:spill');
    }
  }
  if (o.kind === 'glass') {
    const q = flameRelative(w, ctx, pose);
    if (hasOpenFlame(w) && q.z > -1 && q.z < w.burner.flame.heightCm + 1 && q.r < outerRadiusAt(w.burner.flame, Math.max(0, q.z)) + 1.5) {
      emitLatched(w, 'glassFlame', 'GLASS_IN_FLAME', 'ALERT');
      bump(w, 'err:glassInFlame');
      w.glass.damaged = true;
      w.glass.cleanliness = Math.max(0.2, w.glass.cleanliness - 0.3);
    } else rearm(w, 'glassFlame');
  }
  return { ok: true };
}

// ─────────────────────────── Paso fijo ───────────────────────────

export function stepFlame(w: FlameWorld, ctx: FlameContext): void {
  const dt = w.params.dtS;
  w.tick++;
  w.timeS = Math.round((w.timeS + dt) * 1e6) / 1e6;
  if (w.evidence.baseVentilation === undefined) w.evidence.baseVentilation = w.room.extractionOn ? 0.3 : w.room.ventilation;
  updateBurner(w, ctx, dt);
  updateRoom(w, dt);
  updateHose(w, ctx, dt);
  updateCapsule(w, ctx, dt);
  updateLoops(w, ctx, dt);
  updateAtomizers(w, ctx, dt);
  updateObjects(w, ctx, dt);
  if (w.tick % 4 === 0) updateObservations(w, ctx, dt * 4);
  updateSafety(w, dt);
}

export function runFlameFor(w: FlameWorld, seconds: number, ctx: FlameContext): void {
  const n = Math.round(seconds / w.params.dtS);
  for (let i = 0; i < n; i++) stepFlame(w, ctx);
}

/** Flujos normalizados: lo que llega a la boca y lo que se fuga. */
export function gasFlows(w: FlameWorld): { burner: number; leak: number } {
  const b = w.burner;
  const table = b.supplyOn ? b.tableGasValve : 0;
  const leakFrac = w.hose.cracked || b.hoseIntegrity < 0.9 ? clamp((1 - b.hoseIntegrity) * 1.2, 0.05, 1) : 0;
  if (!b.hoseConnected) return { burner: 0, leak: table };
  return { burner: table * b.needleGasValve * (1 - leakFrac), leak: table * leakFrac * 0.35 };
}

function ignitionSourceAtMouth(w: FlameWorld, ctx: FlameContext): boolean {
  const lp = w.objects.lighter?.pose;
  if (!w.lighter.sparking || !lp) return false;
  const q = flameRelative(w, ctx, lp);
  return q.r < 3.2 && q.z > -1.2 && q.z < 4.5;
}

function updateBurner(w: FlameWorld, ctx: FlameContext, dt: number) {
  const b = w.burner;
  const p = w.params;
  const cp = combustionParams(p);
  const flows = gasFlows(w);
  const flow = flows.burner;
  const airMix = computeAirMix(b.airCollar, flow, 1 + 0.3 * w.room.draft, cp);
  b.ignitionSourceAtMouth = ignitionSourceAtMouth(w, ctx);
  b.needleHistory.push(b.needleGasValve);
  if (b.needleHistory.length > 20) b.needleHistory.shift();
  b.flareS = Math.max(0, b.flareS - dt);
  const upright = burnerUpright(w);

  if (!isLit(w)) {
    b.flame = offFlame(flow, airMix);
    if (flow > 0.005) {
      if (b.flameState === 'OFF') b.flameState = 'GAS_RELEASED';
      if (w.evidence.lowFlowOutAt && w.timeS - w.evidence.lowFlowOutAt > 1.5) {
        emit3(w, 'FLAME_OUT_LOW_FLOW', 'WARN');
        w.evidence.lowFlowOutAt = 0;
      }
      w.evidence.unlitFlowS = (w.evidence.unlitFlowS ?? 0) + dt;
      if ((w.evidence.unlitFlowS ?? 0) > 8) {
        emitLatched(w, 'unlitFlow', 'GAS_FLOWING_UNLIT', 'CRITICAL');
        bump(w, 'err:gasUnlit', dt);
      }
    } else {
      w.evidence.lowFlowOutAt = 0;
      if (b.flameState === 'GAS_RELEASED' || b.flameState === 'EXTINGUISHED') b.flameState = 'OFF';
      w.evidence.unlitFlowS = 0;
      rearm(w, 'unlitFlow');
    }
    if (b.ignitionSourceAtMouth && flow >= p.minFlow && upright) tryIgnite(w, flow, airMix);
    return;
  }

  // ── Encendido ──
  if (!upright) {
    b.flameState = 'EXTINGUISHED';
    b.flame = offFlame(flow, airMix);
    emit3(w, 'BURNER_TIPPED', 'CRITICAL');
    bump(w, 'err:tipped');
    return;
  }
  if (flow < p.minFlow) {
    b.flameState = flow > 0.005 ? 'EXTINGUISHED' : 'OFF';
    b.flame = offFlame(flow, airMix);
    // Al cerrar la aguja poco a poco el flujo pasa un instante por debajo del mínimo: solo se avisa si el gas
    // sigue saliendo un rato después de apagarse la llama (ver la rama sin llama).
    if (flow > 0.005) w.evidence.lowFlowOutAt = w.timeS;
    return;
  }
  // Corriente de aire fuerte con flujo bajo: desviación y posible extinción (§7.4).
  if (w.room.draft > 0.7 && flow < 0.3) {
    w.evidence.draftS = (w.evidence.draftS ?? 0) + dt;
    if ((w.evidence.draftS ?? 0) > 3) {
      b.flameState = 'EXTINGUISHED';
      b.flame = offFlame(flow, airMix);
      emit3(w, 'FLAME_OUT_DRAFT', 'WARN');
      w.evidence.draftS = 0;
      return;
    }
  } else w.evidence.draftS = 0;

  const reg = regimeOf(airMix, flow, cp);
  if (b.flameState === 'IGNITING') {
    b.ignitingS -= dt;
    if (b.ignitingS > 0) {
      setFlame(w, flow, airMix, reg, 0.7);
      return;
    }
  }
  if (reg === 'FLASHBACK' || b.flameState === 'FLASHBACK') {
    if (b.flameState !== 'FLASHBACK') {
      b.flameState = 'FLASHBACK';
      b.flashbackS = 0;
      emit3(w, 'FLASHBACK', 'ALERT');
      bump(w, 'err:flashback');
    }
    b.flashbackS += dt;
    if (b.flashbackS > 6) emitLatched(w, 'flashbackLong', 'FLASHBACK_PERSISTENT', 'CRITICAL');
    setFlame(w, flow, airMix, 'FLASHBACK', 0.2);
    return;
  }
  if (reg === 'LIFTED') {
    if (b.flameState !== 'LIFTED') {
      b.liftedS = 0;
      emit3(w, 'FLAME_LIFTED', 'WARN');
      bump(w, 'err:lifted');
    }
    b.flameState = 'LIFTED';
    b.liftedS += dt;
    if ((airMix > 1.3 || flow > 0.95) && b.liftedS > 2.5) {
      b.flameState = 'EXTINGUISHED';
      b.flame = offFlame(flow, airMix);
      emit3(w, 'FLAME_BLOWN_OFF', 'ALERT');
      return;
    }
    setFlame(w, flow, airMix, 'LIFTED', 0.35);
    return;
  }
  b.liftedS = 0;
  b.flameState = reg === 'YELLOW' ? 'YELLOW_LUMINOUS' : reg === 'TRANSITIONAL' ? 'TRANSITIONAL' : 'BLUE_STABLE';
  const noisy = airMix > p.blueMax ? clamp((airMix - p.blueMax) * 2.5, 0, 0.6) : 0;
  setFlame(w, flow, airMix, reg, 1 - 0.35 * w.room.draft - noisy);
  if (noisy > 0.2) emitLatched(w, 'roaring', 'FLAME_ROARING', 'WARN');
  else rearm(w, 'roaring');
}

function setFlame(w: FlameWorld, flow: number, airMix: number, regime: FlameRegime, stability: number) {
  const b = w.burner;
  const p = w.params;
  const cp = combustionParams(p);
  const st = clamp(stability, 0.05, 1);
  const shape = flameShape(flow, airMix, st, regime, cp);
  const fuel = FUELS[b.fuel];
  const molS = (flow * p.nominalMaxFlowMlS) / MOLAR_VOLUME_ML;
  const prod = combustionProducts(fuel, molS, airMix, cp);
  b.flame = {
    ...shape,
    isLit: true,
    fuelFlow: flow,
    airMix,
    stability: st,
    regime,
    sootRateMgS: regime === 'FLASHBACK' ? 0 : prod.sootMolS * 12000,
    coRateMgS: prod.coMolS * 28000,
    completeFraction: prod.co2MolS / Math.max(1e-12, prod.co2MolS + prod.coMolS + prod.sootMolS),
    heatW: prod.heatW,
    temperatureFieldId: `${regime}:${shape.heightCm.toFixed(1)}`,
  };
}

function tryIgnite(w: FlameWorld, flow: number, airMix: number) {
  const b = w.burner;
  const p = w.params;
  const ev = w.evidence;
  if (w.safety.block || w.safety.incident) {
    emitLatched(w, 'ignBlocked', 'IGNITION_BLOCKED', 'CRITICAL', { code: w.safety.block?.code ?? w.safety.incident?.code ?? '' });
    return;
  }
  if (!w.ppe) {
    setBlock(w, 'PPE');
    emit3(w, 'IGNITION_BLOCKED_PPE', 'CRITICAL');
    return;
  }
  if (w.room.gasAccumMl > p.gasBlockMl) {
    // Nunca se representa una explosión: se bloquea y se exige cerrar, ventilar y reiniciar.
    setBlock(w, 'GAS_ACCUMULATION');
    emit3(w, 'IGNITION_BLOCKED_GAS', 'CRITICAL');
    bump(w, 'err:igniteAccumulated');
    return;
  }
  rearm(w, 'ignBlocked');
  const first = b.litOnceAt === null;
  // Inspección previa y secuencia (§7.1–7.2): se evalúa, no se impone salvo la seguridad crítica.
  if (first) {
    if (!precheckComplete(w)) {
      emit3(w, 'IGNITION_WITHOUT_PRECHECK', 'WARN');
      ev.ignitionWithoutPrecheck = 1;
    }
    if (!w.room.extractionOn) emit3(w, 'IGNITION_NO_EXTRACTION', 'WARN');
  }
  const sparkAt = ev.sparkStartedAt ?? w.timeS;
  const needleAt = ev.needleOpenedAt ?? w.timeS;
  const gasFirst = needleAt < sparkAt - 1.5 || w.room.gasAccumMl > p.gasWarnMl;
  const airOpen = b.airCollar > 0.08;
  const recent = b.needleHistory.length ? b.needleHistory[b.needleHistory.length - 1] - b.needleHistory[0] : 0;
  const abrupt = recent > 0.5 || flow > 0.8;
  ev.ignitions = (ev.ignitions ?? 0) + 1;
  if (gasFirst) {
    emit3(w, 'GAS_BEFORE_SPARK', 'WARN');
    bump(w, 'err:gasBeforeSpark');
    if (w.room.gasAccumMl > p.gasWarnMl) b.flareS = 0.6;
  }
  if (airOpen) {
    emit3(w, 'IGNITION_AIR_OPEN', 'WARN');
    bump(w, 'err:ignitionAirOpen');
  }
  if (abrupt) {
    emit3(w, 'IGNITION_ABRUPT', 'WARN');
    bump(w, 'err:abruptIgnition');
    b.flareS = Math.max(b.flareS, 0.8);
  }
  if (first) ev.firstIgnitionOrderOk = !gasFirst && !airOpen && !abrupt && (ev.tableOpenedAt ?? Infinity) <= sparkAt + 0.01 ? 1 : -1;
  w.room.gasAccumMl *= 0.2;
  if (airMix > p.blueMax) {
    // Aire muy abierto: ignición difícil, inestable o con retroceso (§7.4).
    if (rand(w) < 0.55) {
      b.flameState = 'FLASHBACK';
      b.flashbackS = 0;
      emit3(w, 'FLASHBACK', 'ALERT');
      bump(w, 'err:flashback');
      setFlame(w, flow, airMix, 'FLASHBACK', 0.2);
    } else {
      b.flameState = 'LIFTED';
      b.liftedS = 0;
      emit3(w, 'IGNITION_UNSTABLE', 'WARN');
      setFlame(w, flow, airMix, 'LIFTED', 0.3);
    }
  } else {
    b.flameState = 'IGNITING';
    b.ignitingS = 0.35;
    setFlame(w, flow, airMix, regimeOf(airMix, flow, combustionParams(p)), 0.7);
    emit3(w, 'IGNITED', 'INFO');
  }
  if (first) b.litOnceAt = w.timeS;
  w.evidence.lastIgnitionAt = w.timeS;
  w.evidence.lowFlowOutAt = 0;
}

/** §7.1 — inspección previa completa. */
export function precheckComplete(w: FlameWorld): boolean {
  const s = w.safety.located;
  return !!(w.ppe && s.extinguisher && s.blanket && s.estop && (w.room.extractionOn || s.extractor) && w.hose.inspected && w.evidence.inspectedBurner && w.evidence.valvesConfirmedClosed);
}

function updateRoom(w: FlameWorld, dt: number) {
  const b = w.burner;
  const p = w.params;
  const r = w.room;
  const flows = gasFlows(w);
  const burningOutside = isLit(w) && b.flameState !== 'FLASHBACK';
  const unburnt = (flows.leak + (isLit(w) ? 0 : flows.burner)) * p.nominalMaxFlowMlS;
  const k = 0.02 + 0.06 * r.ventilation;
  r.gasAccumMl = Math.max(0, r.gasAccumMl + unburnt * dt - k * r.gasAccumMl * dt);
  b.accumulatedFuelMl = r.gasAccumMl;
  if (r.gasAccumMl > p.gasWarnMl) emitLatched(w, 'gasWarn', 'GAS_SMELL', 'WARN');
  else if (r.gasAccumMl < p.gasWarnMl * 0.6) rearm(w, 'gasWarn');
  if (r.gasAccumMl > p.gasAlarmMl) {
    emitLatched(w, 'gasAlarm', 'GAS_ALARM', 'ALERT');
    r.alarm = true;
  } else if (r.gasAccumMl < p.gasAlarmMl * 0.6) rearm(w, 'gasAlarm');
  if (r.gasAccumMl > p.gasBlockMl) {
    if (w.safety.block?.code !== 'GAS_ACCUMULATION') {
      setBlock(w, 'GAS_ACCUMULATION');
      emit3(w, 'GAS_ACCUMULATION', 'CRITICAL');
      bump(w, 'err:gasAccumulation');
    }
  }
  // Un escape cerca de la llama abierta: incidente que requiere el corte maestro y el extintor.
  if (burningOutside && flows.leak > 0.05 && b.hoseDistanceFromFlameCm < 10 && !w.safety.incident) {
    w.safety.incident = { code: 'HOSE_FIRE', since: w.timeS, needs: ['SHUTOFF', 'EXTINGUISHER'], done: [] };
    emit3(w, 'HOSE_FIRE', 'CRITICAL');
    bump(w, 'err:hoseFire');
  }
  // CO: incoloro e inodoro; solo variable ambiental y alarma (§15.2).
  const coMolS = isLit(w) ? b.flame.coRateMgS / 28000 : 0;
  const kCo = 0.004 + 0.06 * r.ventilation;
  r.coPpm = Math.max(0, r.coPpm + (coMolS / p.roomAirMol) * 1e6 * dt - kCo * r.coPpm * dt);
  if (r.coPpm > p.coWarnPpm) emitLatched(w, 'coWarn', 'CO_WARN', 'WARN', { ppm: Math.round(r.coPpm) });
  else if (r.coPpm < p.coWarnPpm * 0.7) rearm(w, 'coWarn');
  if (r.coPpm > p.coAlarmPpm) {
    emitLatched(w, 'coAlarm', 'CO_ALARM', 'ALERT', { ppm: Math.round(r.coPpm) });
    r.alarm = true;
  } else if (r.coPpm < p.coAlarmPpm * 0.7) rearm(w, 'coAlarm');
  if (r.coPpm > p.coShutdownPpm && b.supplyOn) {
    b.supplyOn = false;
    setBlock(w, 'CO_HIGH');
    emit3(w, 'CO_AUTO_SHUTOFF', 'CRITICAL', { ppm: Math.round(r.coPpm) });
    bump(w, 'err:coShutdown');
  }
  if (r.coPpm > p.coWarnPpm) bump(w, 'coExposureS', dt);
  // Cuerpo del mechero: se calienta con la llama (mucho con retroceso) y se enfría despacio.
  const amb = p.ambientC;
  const target = amb + (burningOutside ? 70 + 110 * b.flame.blueness : 0) + (b.flameState === 'FLASHBACK' ? 420 : 0);
  const tau = target > b.bodyTemperatureC ? 35 : 150;
  b.bodyTemperatureC += ((target - b.bodyTemperatureC) * dt) / tau;
  if (w.objects.burner) w.objects.burner.temperatureC = b.bodyTemperatureC;
  // Llave de mesa abierta tras cerrar la aguja (§7.3).
  if (b.litOnceAt !== null && !isLit(w) && b.needleGasValve <= 0.02 && b.tableGasValve > 0.02 && w.evidence.shutdownStarted) {
    w.evidence.tableOpenAfterShutdownS = (w.evidence.tableOpenAfterShutdownS ?? 0) + dt;
    if ((w.evidence.tableOpenAfterShutdownS ?? 0) > 10) emitLatched(w, 'tableOpen', 'TABLE_VALVE_LEFT_OPEN', 'WARN');
  } else {
    w.evidence.tableOpenAfterShutdownS = 0;
    rearm(w, 'tableOpen');
  }
}

/** Puntos de la manguera: curva cuadrática toma → punto medio → entrada del mechero. */
export function hosePoints(w: FlameWorld, ctx: FlameContext, n = 14): Array<{ x: number; y: number; z: number }> {
  const tap = w.objects.gas_tap?.pose;
  const bp = w.objects.burner?.pose;
  if (!tap || !bp) return [];
  const a = { x: tap.x, y: tap.y + ctx.geo.tapNozzleDy, z: tap.z - 1.5 };
  const i = ctx.geo.burner.inlet;
  const c = { x: bp.x + i.dx, y: bp.y + i.dy, z: bp.z + i.z };
  const m = w.hose.mid;
  const k = { x: 2 * m.x - (a.x + c.x) / 2, y: 2 * m.y - (a.y + c.y) / 2, z: 2 * m.z - (a.z + c.z) / 2 };
  const out = [];
  for (let s = 0; s <= n; s++) {
    const t = s / n;
    const u = 1 - t;
    out.push({ x: u * u * a.x + 2 * u * t * k.x + t * t * c.x, y: u * u * a.y + 2 * u * t * k.y + t * t * c.y, z: Math.max(0.4, u * u * a.z + 2 * u * t * k.z + t * t * c.z) });
  }
  return out;
}

function hoseDistanceTo(w: FlameWorld, ctx: FlameContext, p: { x: number; y: number; z: number }): number {
  let d = Infinity;
  for (const q of hosePoints(w, ctx, 10)) d = Math.min(d, Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z));
  return d;
}

/** Distancia mínima de la manguera a la llama (o a la columna de una llama nominal de 10 cm si está apagado). */
export function hoseFlameDistance(w: FlameWorld, ctx: FlameContext): number {
  const pts = hosePoints(w, ctx, 14);
  const H = hasOpenFlame(w) ? w.burner.flame.heightCm + w.burner.flame.liftGapCm : 10;
  const R = hasOpenFlame(w) ? w.burner.flame.radiusCm : 1.2;
  let d = Infinity;
  // Se ignoran los últimos puntos (la manguera llega por fuerza a la entrada, en la base del mechero).
  for (const q of pts.slice(0, -2)) {
    const rel = flameRelative(w, ctx, q);
    const dr = Math.max(0, rel.r - R);
    const dz = rel.z < 0 ? -rel.z : rel.z > H ? rel.z - H : 0;
    d = Math.min(d, Math.hypot(dr, dz));
  }
  return d;
}

function updateHose(w: FlameWorld, ctx: FlameContext, dt: number) {
  const b = w.burner;
  const h = w.hose;
  const amb = w.params.ambientC;
  const d = hoseFlameDistance(w, ctx);
  b.hoseDistanceFromFlameCm = d;
  const target = amb + (hasOpenFlame(w) ? 650 * Math.exp(-d / 2.5) : 0);
  h.temperatureC += ((target - h.temperatureC) * dt) / (target > h.temperatureC ? 6 : 30);
  if (hasOpenFlame(w) && d < 6) {
    emitLatched(w, 'hoseNear', 'HOSE_NEAR_FLAME', 'WARN');
    bump(w, 'hoseNearFlameS', dt);
  } else if (d > 9) rearm(w, 'hoseNear');
  if (h.temperatureC > 70) emitLatched(w, 'hoseHot', 'HOSE_HEATING', 'ALERT');
  else if (h.temperatureC < 50) rearm(w, 'hoseHot');
  if (h.temperatureC > 90) {
    b.hoseIntegrity = Math.max(0, b.hoseIntegrity - ((h.temperatureC - 90) / 300) * 0.08 * dt);
    if (b.hoseIntegrity < 0.7) emitLatched(w, 'hoseDamaged', 'HOSE_DAMAGED', 'CRITICAL');
  }
}

export function coverageFromMass(mg: number): number {
  return 1 - Math.exp(-mg / 1.2);
}

function updateCapsule(w: FlameWorld, ctx: FlameContext, dt: number) {
  const o = w.objects.capsule;
  if (!o) return;
  const c = w.capsule;
  const amb = w.params.ambientC;
  const r = ctx.geo.capsule.rimR * 0.5;
  const pts = [o.pose, { ...o.pose, x: o.pose.x + r }, { ...o.pose, x: o.pose.x - r }, { ...o.pose, y: o.pose.y + r }, { ...o.pose, y: o.pose.y - r }];
  // La llama que choca con la base se ensancha bajo la cápsula: cuenta el punto de mayor contacto.
  let contact = 0;
  let tl = amb;
  for (const p of pts) {
    contact = Math.max(contact, localContact(w, ctx, p));
    tl = Math.max(tl, localTemperature(w, ctx, p));
  }
  const f = w.burner.flame;
  const coupling = 0.42 + 0.18 * f.blueness;
  const eff = amb + (tl - amb) * coupling * (0.4 + 0.6 * Math.min(1, contact * 2));
  if (eff > o.temperatureC) o.temperatureC += ((eff - o.temperatureC) * dt) / 16;
  else o.temperatureC += ((amb - o.temperatureC) * dt) / (o.support === 'tile' ? 140 : 110);
  // §8.2 — depósito de hollín: producción × contacto × eficiencia de captura de la superficie fría.
  const inFlame = contact > 0.04 && hasOpenFlame(w);
  if (inFlame) {
    const capture = 0.35 * clamp(1 - (o.temperatureC - 300) / 600, 0.2, 1);
    const dep = f.sootRateMgS * contact * capture * dt;
    c.sootMassMg += dep;
    const st = w.burner.flameState;
    c.sootByRegimeMg[st] = (c.sootByRegimeMg[st] ?? 0) + dep;
    if (!c.activeExposure) {
      c.activeExposure = { startS: w.timeS, durationS: 0, regimeS: {}, sootBeforeMg: c.sootMassMg - dep, sootAfterMg: c.sootMassMg, maxTempC: o.temperatureC, maxContact: contact, tongs: !!c.clampedBy };
    }
    const e = c.activeExposure;
    e.durationS += dt;
    e.regimeS[st] = (e.regimeS[st] ?? 0) + dt;
    e.sootAfterMg = c.sootMassMg;
    e.maxTempC = Math.max(e.maxTempC, o.temperatureC);
    e.maxContact = Math.max(e.maxContact, contact);
    if (!c.clampedBy) e.tongs = false;
    if (e.durationS > 45 || o.temperatureC > 480) emitLatched(w, 'capsuleLong', 'CAPSULE_TOO_LONG', 'WARN');
    w.evidence.capsuleOutS = 0;
  } else if (c.activeExposure) {
    w.evidence.capsuleOutS = (w.evidence.capsuleOutS ?? 0) + dt;
    if ((w.evidence.capsuleOutS ?? 0) > 0.6) {
      const e = c.activeExposure;
      e.maxTempC = Math.max(e.maxTempC, o.temperatureC);
      c.exposures.push(e);
      c.activeExposure = null;
      rearm(w, 'capsuleLong');
      if (e.sootAfterMg - e.sootBeforeMg > 0.25) emit3(w, 'CAPSULE_SOOTED', 'INFO', { mg: Math.round((e.sootAfterMg - e.sootBeforeMg) * 100) / 100 });
      else if (e.durationS > 3) emit3(w, 'CAPSULE_HEATED_CLEAN', 'INFO');
      if (e.maxContact < 0.15 && e.durationS > 2) emit3(w, 'CAPSULE_OUT_OF_FLAME', 'WARN');
    }
  }
  c.sootCoverage = coverageFromMass(c.sootMassMg);
}

/** Concentración (fracción de masa de sal) por especie de una disolución, incluida su contaminación. */
export function solutionFractions(w: FlameWorld, sol: SolutionState): Record<string, number> {
  const out: Record<string, number> = {};
  const mass = Math.max(1, sol.volumeMl * 1000);
  const k = sol.id === 'sol_unknown' ? w.unknown.intensityFactor : 1;
  for (const [s, f] of Object.entries(sol.species)) out[s] = (out[s] ?? 0) + f * k;
  for (const [s, mg] of Object.entries(sol.contamination)) out[s] = (out[s] ?? 0) + mg / mass;
  return out;
}

function liquidSurfaceZ(ctx: FlameContext, tube: Practice3Object, sol: SolutionState): number {
  return tube.pose.z + ctx.geo.tube.bottomZ + sol.volumeMl * ctx.geo.tube.cmPerMl;
}

function moveSpecies(from: Record<string, number>, to: Record<string, number>, frac: number, filter?: (s: string) => boolean) {
  for (const [s, v] of Object.entries(from)) {
    if (filter && !filter(s)) continue;
    const m = v * frac;
    from[s] = v - m;
    to[s] = (to[s] ?? 0) + m;
  }
}

function updateLoops(w: FlameWorld, ctx: FlameContext, dt: number) {
  const p = w.params;
  const amb = p.ambientC;
  const lit = hasOpenFlame(w);
  const ids = Object.keys(w.loops);
  for (const id of ids) {
    const l = w.loops[id];
    const L = l;
    const o = w.objects[id];
    if (!o) continue;
    const pos = o.pose;
    const tl = localTemperature(w, ctx, pos);
    const contact = localContact(w, ctx, pos);
    // Térmica del alambre: sube rápido en la llama y se enfría en segundos (nunca al instante).
    if (tl > l.temperatureC) l.temperatureC += ((0.92 * tl - l.temperatureC) * dt) / 0.35;
    else l.temperatureC += ((amb - l.temperatureC) * dt) / 3.5;
    if (l.surfaceWaterMg > 0 && l.temperatureC > 100) {
      // Mientras haya agua, el aro queda cerca de 100 °C (evaporación).
      const evap = 2.6 * clamp((tl - 100) / 600, 0.03, 1.5) * dt;
      if (L.overloaded && !L.sputtered && tl > 700) {
        L.sputtered = true;
        emit3(w, 'LOOP_SPUTTER', 'WARN', undefined, id);
        bump(w, 'err:overload');
        for (const rec of [l.depositedSpeciesMg, l.contaminationSpeciesMg]) for (const s of Object.keys(rec)) rec[s] *= 0.7;
      }
      l.surfaceWaterMg = Math.max(0, l.surfaceWaterMg - evap);
      l.temperatureC = Math.min(l.temperatureC, 104);
      if (l.surfaceWaterMg === 0) L.overloaded = false;
    }
    if (l.temperatureC > 700) l.oxideCondition = Math.min(1, l.oxideCondition + 0.0015 * dt);

    // ── Emisión y consumo de la muestra (§9.6) ──
    L.emissionRates = {};
    let total = 0;
    if (l.surfaceWaterMg < 0.05 && l.temperatureC > 450) {
      const e = excitation(l.temperatureC) * clamp(contact * 1.6 + (tl > 800 ? 0.3 : 0), 0, 1);
      for (const rec of [l.depositedSpeciesMg, l.contaminationSpeciesMg]) {
        for (const [s, m] of Object.entries(rec)) {
          if (m <= 0) continue;
          const prof = ctx.profiles[s];
          const rate = m * p.sampleConsumption * (prof?.volatilityFactor ?? 1) * e;
          rec[s] = Math.max(0, m - rate * dt);
          if (rec[s] < 1e-9) delete rec[s];
          L.emissionRates[s] = (L.emissionRates[s] ?? 0) + rate;
          total += rate * (prof?.sodiumSensitivity ?? 1);
        }
      }
    }
    l.emission = total;
    if (contact > 0.2 && lit) l.inFlameS += dt;

    // ── Inmersión en tubos (§13.4) ──
    let immersed: string | null = null;
    let depth = 0;
    for (const sol of Object.values(w.solutions)) {
      const tube = w.objects[sol.id];
      if (!tube || sol.spilled || sol.volumeMl <= 0.05) continue;
      if (Math.hypot(pos.x - tube.pose.x, pos.y - tube.pose.y) > ctx.geo.tube.innerR) continue;
      const surf = liquidSurfaceZ(ctx, tube, sol);
      if (pos.z < surf && pos.z > tube.pose.z) {
        immersed = sol.id;
        depth = surf - pos.z;
        break;
      }
    }
    if (immersed !== l.immersedIn) {
      if (immersed) onLoopEnterSolution(w, l, w.solutions[immersed]);
      l.immersedIn = immersed;
    }
    l.immersionDepthCm = depth;
    if (immersed) {
      const sol = w.solutions[immersed];
      const cap = p.loopRingCapacityMg + p.loopStemCapacityMgPerCm * Math.max(0, depth - 0.9);
      if (l.surfaceWaterMg < cap) {
        const add = (cap - l.surfaceWaterMg) * Math.min(1, 4 * dt);
        l.surfaceWaterMg += add;
        const fr = solutionFractions(w, sol);
        const own = new Set(Object.keys(sol.species));
        for (const [s, f] of Object.entries(fr)) {
          const rec = own.has(s) && (!l.assignedSolutionId || l.assignedSolutionId === sol.id) ? l.depositedSpeciesMg : l.contaminationSpeciesMg;
          rec[s] = (rec[s] ?? 0) + add * f;
        }
        sol.volumeMl = Math.max(0, sol.volumeMl - add / 1000);
        L.loadedSinceClean = true;
        if (l.surfaceWaterMg > p.loopRingCapacityMg * 1.6) L.overloaded = true;
      }
    }

    // ── Estación de limpieza (§10.2) ──
    let cleaning = false;
    const hcl = w.objects.hcl;
    if (hcl && Math.hypot(pos.x - hcl.pose.x, pos.y - hcl.pose.y) < ctx.geo.hcl.r && pos.z > hcl.pose.z && pos.z < hcl.pose.z + ctx.geo.hcl.h - 1) {
      if (!w.hcl.open) emitLatched(w, `hclClosed:${id}`, 'HCL_CLOSED_LID', 'INFO');
      else {
        cleaning = true;
        if (!w.evidence[`inHcl:${id}`]) {
          w.evidence[`inHcl:${id}`] = 1;
          w.hcl.dips++;
          if (l.temperatureC > 60) {
            w.hcl.hotDips++;
            emit3(w, 'HOT_LOOP_IN_HCL', 'ALERT', undefined, id);
            bump(w, 'err:hotHcl');
          }
        }
        if (l.temperatureC <= 60) {
          const k = Math.exp(-1.6 * dt);
          for (const rec of [l.depositedSpeciesMg, l.contaminationSpeciesMg]) for (const s of Object.keys(rec)) rec[s] *= k;
          l.acidWet = true;
          L.loadedSinceClean = false;
          l.checkedClean = false;
        }
      }
    } else w.evidence[`inHcl:${id}`] = 0;
    const rinse = w.objects.rinse;
    if (rinse && Math.hypot(pos.x - rinse.pose.x, pos.y - rinse.pose.y) < ctx.geo.rinse.r && pos.z < rinse.pose.z + ctx.geo.rinse.waterZ && pos.z > rinse.pose.z) {
      cleaning = true;
      l.acidWet = false;
      const k = Math.exp(-0.25 * dt);
      for (const rec of [l.depositedSpeciesMg, l.contaminationSpeciesMg]) for (const s of Object.keys(rec)) rec[s] *= k;
      l.surfaceWaterMg = Math.max(l.surfaceWaterMg, p.loopRingCapacityMg);
      if (l.temperatureC > 60) emitLatched(w, `hotRinse:${id}`, 'HOT_LOOP_IN_WATER', 'WARN', undefined, id);
      flag(w, `rinsed:${id}`);
    } else rearm(w, `hotRinse:${id}`);

    // Asa apoyada en la mesada: adquiere Na ambiental (§10.3).
    if (o.support === 'bench' || o.support === 'falling') {
      l.contaminationSpeciesMg['Na+'] = (l.contaminationSpeciesMg['Na+'] ?? 0) + 4e-6 * w.room.ambientSodium * dt;
    }
    // HCl abierto mientras el asa vuelve a la llama.
    if (w.hcl.open && contact > 0.1) emitLatched(w, 'hclNearFlame', 'HCL_OPEN_NEAR_FLAME', 'WARN');

    // Comprobación de limpieza (§11.7): llama sin color con el asa caliente antes de cargarla.
    if (contact > 0.25 && l.temperatureC > 650 && l.surfaceWaterMg === 0 && !L.loadedSinceClean) {
      if (total * p.emissionScale > 0.25) {
        emitLatched(w, `dirty:${id}`, 'LOOP_CONTAMINATED_SIGNAL', 'WARN', undefined, id);
        w.evidence[`dirtySeen:${id}`] = 1;
        l.checkedClean = false;
        w.evidence[`cleanCheckS:${id}`] = 0;
      } else {
        w.evidence[`cleanCheckS:${id}`] = (w.evidence[`cleanCheckS:${id}`] ?? 0) + dt;
        if ((w.evidence[`cleanCheckS:${id}`] ?? 0) > 1.5 && !l.checkedClean) {
          l.checkedClean = true;
          rearm(w, `dirty:${id}`);
          emit3(w, 'LOOP_CLEAN_CONFIRMED', 'INFO', undefined, id);
          flag(w, `cleanChecked:${id}`);
        }
      }
    }
    l.isCleanForTest = loopResidueMg(l) < 2e-4;
    l.phase = loopPhase(l, contact, cleaning);
  }
  // Asas que se tocan (§10.3): transferencia de residuos en ambos sentidos.
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = w.objects[ids[i]];
      const c = w.objects[ids[j]];
      if (!a || !c) continue;
      const key = `touch:${ids[i]}:${ids[j]}`;
      const d = Math.hypot(a.pose.x - c.pose.x, a.pose.y - c.pose.y, a.pose.z - c.pose.z);
      if (d < ctx.geo.loopTouchCm && (a.support === 'hand' || c.support === 'hand')) {
        if (!w.evidence[key]) {
          w.evidence[key] = 1;
          const la = w.loops[ids[i]];
          const lc = w.loops[ids[j]];
          const ta: Record<string, number> = {};
          const tc: Record<string, number> = {};
          moveSpecies({ ...la.depositedSpeciesMg, ...la.contaminationSpeciesMg }, ta, 0.3);
          moveSpecies({ ...lc.depositedSpeciesMg, ...lc.contaminationSpeciesMg }, tc, 0.3);
          for (const [s, m] of Object.entries(ta)) lc.contaminationSpeciesMg[s] = (lc.contaminationSpeciesMg[s] ?? 0) + m;
          for (const [s, m] of Object.entries(tc)) la.contaminationSpeciesMg[s] = (la.contaminationSpeciesMg[s] ?? 0) + m;
          emit3(w, 'LOOPS_TOUCHED', 'WARN', { a: ids[i], b: ids[j] });
          bump(w, 'err:loopsTouched');
        }
      } else if (d > ctx.geo.loopTouchCm * 2) w.evidence[key] = 0;
    }
  }
}

function onLoopEnterSolution(w: FlameWorld, l: NichromeLoopState, sol: SolutionState) {
  const L = l;
  // Asa caliente en el tubo: hierve la película, salpica y contamina la disolución (§13.4).
  if (l.temperatureC > 60) {
    emit3(w, 'HOT_LOOP_IN_TUBE', 'WARN', { t: Math.round(l.temperatureC) }, sol.id);
    bump(w, 'err:hotLoopTube');
    moveSpecies(l.depositedSpeciesMg, sol.contamination, 0.6);
    moveSpecies(l.contaminationSpeciesMg, sol.contamination, 0.6);
    sol.volumeMl = Math.max(0, sol.volumeMl - 0.02);
    l.temperatureC = Math.min(l.temperatureC, 100);
  }
  // Residuos del asa que no son de esta disolución pasan al tubo (contaminación de patrones).
  const own = new Set(Object.keys(sol.species));
  moveSpecies(l.depositedSpeciesMg, sol.contamination, 0.5, (s) => !own.has(s));
  moveSpecies(l.contaminationSpeciesMg, sol.contamination, 0.5, (s) => !own.has(s));
  if (l.assignedSolutionId && l.assignedSolutionId !== sol.id) {
    emit3(w, 'WRONG_LOOP', 'WARN', { loop: l.id }, sol.id);
    bump(w, 'err:wrongLoop');
    if (!sol.foreignLoops.includes(l.id)) sol.foreignLoops.push(l.id);
    // A partir de aquí, lo que cargue esta asa cuenta como contaminación de su propia disolución.
  }
  if (l.lastContact && l.lastContact !== sol.id && !l.assignedSolutionId && L.loadedSinceClean && loopResidueMg(l) > 2e-4) {
    emit3(w, 'SHARED_LOOP_NOT_CLEANED', 'WARN', { from: l.lastContact }, sol.id);
    bump(w, 'err:sharedNotCleaned');
  }
  l.lastContact = sol.id;
  l.inFlameS = 0;
  L.sputtered = false;
}

function loopPhase(l: NichromeLoopState, contact: number, cleaning: boolean): LoopPhase {
  if (l.immersedIn) return 'SAMPLE_LOADING';
  if (cleaning) return 'CLEANING';
  if (contact > 0.05 && l.surfaceWaterMg > 0) return l.temperatureC < 90 ? 'ENTERING_FLAME' : 'WATER_EVAPORATING';
  if (l.emission > 0.05) return 'EMITTING';
  const residue = loopResidueMg(l);
  if (l.temperatureC > 200) return 'DEPLETED_HOT';
  if (l.temperatureC > 45) return 'COOLING';
  if (l.surfaceWaterMg > 0 && residue > 2e-4) return 'LOADED';
  return residue < 2e-4 ? 'COOL_CLEAN' : 'COOL_CONTAMINATED';
}

// ─────────────────────────── Atomizador (§16) ───────────────────────────

export function atomizerAim(w: FlameWorld, ctx: FlameContext, id: string): { along: number; miss: number; hit: number } {
  const a = w.atomizers[id];
  const o = w.objects[id];
  if (!a || !o) return { along: 0, miss: 99, hit: 0 };
  const m = mouthPos(w, ctx);
  const H = hasOpenFlame(w) ? w.burner.flame.heightCm : 10;
  const f = { x: m.x, y: m.y, z: m.z + H * 0.45 };
  const d = { x: Math.cos(a.yawRad), y: Math.sin(a.yawRad), z: 0.05 };
  const nozzle = { x: o.pose.x, y: o.pose.y, z: o.pose.z + 9 };
  const v = { x: f.x - nozzle.x, y: f.y - nozzle.y, z: f.z - nozzle.z };
  const along = v.x * d.x + v.y * d.y + v.z * d.z;
  const miss = Math.hypot(v.x - along * d.x, v.y - along * d.y, v.z - along * d.z);
  const spread = 0.3 + Math.max(0, along) * Math.tan((12 * Math.PI) / 180);
  const R = hasOpenFlame(w) ? w.burner.flame.radiusCm : 0;
  let hit = along > 0 ? clamp(1 - miss / (spread + R + 0.5), 0, 1) : 0;
  if (along > 45) hit *= clamp(1 - (along - 45) / 15, 0, 1);
  return { along, miss, hit };
}

function spray(w: FlameWorld, ctx: FlameContext, id: string): FlameDispatchResult {
  const a = w.atomizers[id];
  if (!a) return { ok: false, code: 'NO_ATOMIZER' };
  const sol = w.solutions[a.solutionId];
  if (!sol) return { ok: false, code: 'NO_SOLUTION' };
  const aim = atomizerAim(w, ctx, id);
  a.bursts++;
  a.lastHitFraction = aim.hit;
  const liquidMg = 25;
  const fr = solutionFractions(w, sol);
  if (Math.sin(a.yawRad) < -0.7) {
    emit3(w, 'ATOMIZER_TOWARD_PERSON', 'ALERT');
    bump(w, 'err:sprayPerson');
  }
  if (!hasOpenFlame(w)) {
    bump(w, 'atomizerMissMg', liquidMg);
    emit3(w, 'ATOMIZER_NO_FLAME', 'WARN');
    return { ok: true };
  }
  if (aim.along > 0 && aim.along < 8) {
    // Demasiado cerca: el exceso enfría y deforma la llama; repetido, la apaga.
    w.evidence.closeBursts = (w.evidence.closeBursts ?? 0) + 1;
    emit3(w, 'ATOMIZER_TOO_CLOSE', 'WARN');
    if ((w.evidence.closeBursts ?? 0) >= 3) {
      w.burner.flameState = 'EXTINGUISHED';
      w.burner.flame = offFlame(w.burner.flame.fuelFlow, w.burner.flame.airMix);
      emit3(w, 'FLAME_QUENCHED', 'ALERT');
      w.evidence.closeBursts = 0;
    }
  }
  for (const [s, f] of Object.entries(fr)) {
    a.aerosolInFlameMg[s] = (a.aerosolInFlameMg[s] ?? 0) + liquidMg * f * aim.hit;
    a.residueMg[s] = (a.residueMg[s] ?? 0) + liquidMg * f * 0.01;
  }
  if (aim.hit < 0.3) {
    emit3(w, 'ATOMIZER_MISSED', 'WARN', { hit: Math.round(aim.hit * 100) });
    bump(w, 'atomizerMissMg', liquidMg * (1 - aim.hit));
  }
  sol.volumeMl = Math.max(0, sol.volumeMl - liquidMg / 1000);
  flag(w, `sprayed:${a.solutionId}`);
  return { ok: true };
}

function updateAtomizers(w: FlameWorld, ctx: FlameContext, dt: number) {
  for (const a of Object.values(w.atomizers)) {
    for (const [s, m] of Object.entries(a.aerosolInFlameMg)) {
      const prof = ctx.profiles[s];
      const rate = m * 3 * (prof?.volatilityFactor ?? 1) * (hasOpenFlame(w) ? 1 : 0);
      a.aerosolInFlameMg[s] = Math.max(0, m - rate * dt - (hasOpenFlame(w) ? 0 : m * 2 * dt));
      if (a.aerosolInFlameMg[s] < 1e-7) delete a.aerosolInFlameMg[s];
    }
  }
}

function updateObjects(w: FlameWorld, ctx: FlameContext, dt: number) {
  const amb = w.params.ambientC;
  for (const o of Object.values(w.objects)) {
    if (o.kind === 'glass' || o.kind === 'tongs' || o.kind === 'lighter') {
      const tl = localTemperature(w, ctx, o.pose);
      const tau = tl > o.temperatureC ? (o.kind === 'glass' ? 12 : 8) : 60;
      o.temperatureC += (((tl > o.temperatureC ? amb + (tl - amb) * 0.6 : amb) - o.temperatureC) * dt) / tau;
    }
    if (o.kind === 'loop' && w.loops[o.id]) o.temperatureC = w.loops[o.id].temperatureC;
  }
  // La pinza sostiene la cápsula: se calienta por conducción desde ella.
  const cap = w.objects.capsule;
  if (cap && w.capsule.clampedBy && w.objects[w.capsule.clampedBy]) {
    const tg = w.objects[w.capsule.clampedBy];
    tg.temperatureC += ((cap.temperatureC * 0.4 - tg.temperatureC) * dt) / 30;
  }
}

// ─────────────────────────── Espectro y observación (§9.4) ───────────────────────────

/** Emisión espectral de las especies que se consumen (mg/s) en un emisor (asa o aerosol). */
export function emitterSpectrum(rates: Record<string, number>, ctx: FlameContext, scale: number): Spectrum {
  const s = emptySpectrum();
  for (const [sp, r] of Object.entries(rates)) {
    const prof = ctx.profiles[sp];
    if (!prof || r <= 0) continue;
    addComponents(s, prof.components, r * prof.sodiumSensitivity * scale);
  }
  return s;
}

export function flameBaseSpectrum(w: FlameWorld, ctx: FlameContext): Spectrum {
  if (!hasOpenFlame(w)) return emptySpectrum();
  const s = baseFlameSpectrum(w.burner.flame, w.burner.flame.fuelFlow, ctx.blueFlame);
  // Na ambiental: interferencia débil siempre presente (§10.3).
  const na = ctx.profiles['Na+'];
  if (na) addComponents(s, na.components, 0.00002 * na.sodiumSensitivity * w.room.ambientSodium);
  return s;
}

export interface EmitterView {
  id: string;
  /** Posición del emisor (cm de mesada). */
  x: number;
  y: number;
  z: number;
  noFilter: { rgb: [number, number, number]; intensity: number };
  filter: { rgb: [number, number, number]; intensity: number };
  /** Solo la emisión de la muestra (sin la llama base): para dibujarla sobre la llama, que se dibuja aparte. */
  emission: { noFilter: [number, number, number]; filter: [number, number, number] };
  sodiumShare: number;
}

/** Observación de un emisor sobre la llama base (con y sin filtro). La usan la escena y la evidencia. */
export function observeEmitter(w: FlameWorld, ctx: FlameContext, rates: Record<string, number>): { noFilter: ReturnType<typeof observe>; filter: ReturnType<typeof observe>; sodiumShare: number } {
  const base = flameBaseSpectrum(w, ctx);
  const em = emitterSpectrum(rates, ctx, w.params.emissionScale);
  const s = emptySpectrum();
  addScaled(s, base, 1);
  addScaled(s, em, 1);
  const naRates: Record<string, number> = rates['Na+'] ? { 'Na+': rates['Na+'] } : {};
  const yNa = spectrumToXyz(emitterSpectrum(naRates, ctx, w.params.emissionScale))[1];
  const yAll = spectrumToXyz(em)[1];
  const noFilter = observe(s, w.params.exposure, base);
  const filter = observe(applyFilter(s, ctx.cobalt, w.glass.cleanliness), w.params.exposure, applyFilter(base, ctx.cobalt, w.glass.cleanliness));
  return { noFilter, filter, sodiumShare: yAll > 0 ? yNa / yAll : 0 };
}

function emissionOnly(w: FlameWorld, ctx: FlameContext, rates: Record<string, number>): EmitterView['emission'] {
  const em = emitterSpectrum(rates, ctx, w.params.emissionScale);
  return {
    noFilter: observe(em, w.params.exposure).displayRgb,
    filter: observe(applyFilter(em, ctx.cobalt, w.glass.cleanliness), w.params.exposure).displayRgb,
  };
}

/** Emisores activos (asas y aerosoles) para la escena. */
export function activeEmitters(w: FlameWorld, ctx: FlameContext): EmitterView[] {
  const out: EmitterView[] = [];
  for (const l of Object.values(w.loops)) {
    const rates = l.emissionRates;
    if (!rates || l.emission * w.params.emissionScale < 0.004) continue;
    const o = w.objects[l.id];
    if (!o) continue;
    const ob = observeEmitter(w, ctx, rates);
    out.push({ id: l.id, x: o.pose.x, y: o.pose.y, z: o.pose.z, noFilter: { rgb: ob.noFilter.displayRgb, intensity: ob.noFilter.intensity }, filter: { rgb: ob.filter.displayRgb, intensity: ob.filter.intensity }, emission: emissionOnly(w, ctx, rates), sodiumShare: ob.sodiumShare });
  }
  for (const [id, a] of Object.entries(w.atomizers)) {
    const rates: Record<string, number> = {};
    let total = 0;
    for (const [s, m] of Object.entries(a.aerosolInFlameMg)) {
      rates[s] = m * 3 * (ctx.profiles[s]?.volatilityFactor ?? 1);
      total += rates[s] * (ctx.profiles[s]?.sodiumSensitivity ?? 1) * w.params.emissionScale;
    }
    if (total < 0.004) continue;
    const m = mouthPos(w, ctx);
    const ob = observeEmitter(w, ctx, rates);
    out.push({ id, x: m.x, y: m.y, z: m.z + w.burner.flame.heightCm * 0.45, noFilter: { rgb: ob.noFilter.displayRgb, intensity: ob.noFilter.intensity }, filter: { rgb: ob.filter.displayRgb, intensity: ob.filter.intensity }, emission: emissionOnly(w, ctx, rates), sodiumShare: ob.sodiumShare });
  }
  return out;
}

function updateObservations(w: FlameWorld, ctx: FlameContext, dt: number) {
  const b = w.burner;
  const fl = w.flameLog;
  if (hasOpenFlame(w)) {
    if (b.flameState === 'YELLOW_LUMINOUS') fl.yellowSeenS += dt;
    if (b.flameState === 'TRANSITIONAL' && fl.yellowSeenS > 1) fl.transitionSeen = true;
    if (b.flameState === 'BLUE_STABLE' && b.flame.stability > 0.6) {
      fl.blueSeenS += dt;
      fl.maxBlueHeightCm = Math.max(fl.maxBlueHeightCm, b.flame.heightCm);
      if (b.flame.blueness > 0.85) fl.twoConesS += dt;
    }
    if (Math.abs(b.flame.heightCm - w.params.targetFlameCm) <= w.params.flameToleranceCm) {
      fl.heightOkS += dt;
      if (b.flameState === 'YELLOW_LUMINOUS') bump(w, 'heightOkYellowS', dt);
      if (b.flameState === 'BLUE_STABLE') bump(w, 'heightOkBlueS', dt);
    }
  }
  for (const l of Object.values(w.loops)) {
    const rates = l.emissionRates;
    if (!rates || l.emission * w.params.emissionScale < 0.02 || !l.lastContact) continue;
    const obs = w.observations[l.lastContact];
    if (!obs) continue;
    const r = observeEmitter(w, ctx, rates);
    const sol = w.solutions[l.lastContact];
    const own = new Set(Object.keys(sol?.species ?? {}));
    let foreign = 0;
    let all = 0;
    for (const [s, v] of Object.entries(rates)) {
      const k = v * (ctx.profiles[s]?.sodiumSensitivity ?? 1);
      all += k;
      if (!own.has(s)) foreign += k;
    }
    obs.maxContaminationShare = Math.max(obs.maxContaminationShare, all > 0 ? foreign / all : 0);
    obs.emittingS += dt;
    if (b.flameState !== 'BLUE_STABLE') obs.yellowFlameS += dt;
    const filtered = w.glass.alignment > 0.6;
    const o = filtered ? r.filter : r.noFilter;
    const rec = { rgb: o.displayRgb, intensity: o.intensity, region: colorRegion(o.displayRgb), dominantNm: o.dominantWavelengthNm, sodiumShare: r.sodiumShare, t: w.timeS };
    const prev = filtered ? obs.filter : obs.noFilter;
    if (!prev || o.intensity > prev.intensity) {
      if (filtered) obs.filter = rec;
      else obs.noFilter = rec;
    }
    if (!w.evidence[`testing:${l.id}`]) {
      w.evidence[`testing:${l.id}`] = 1;
      obs.tests++;
    }
  }
  for (const l of Object.values(w.loops)) if (l.emission * w.params.emissionScale < 0.005) w.evidence[`testing:${l.id}`] = 0;
}

// ─────────────────────────── Seguridad ───────────────────────────

function updateSafety(w: FlameWorld, dt: number) {
  if (w.hcl.open) {
    w.hcl.openedS += dt;
    if (w.hcl.openedS > 60) emitLatched(w, 'hclOpenLong', 'HCL_LEFT_OPEN', 'WARN');
  } else rearm(w, 'hclOpenLong');
  // Material caliente fuera de su soporte.
  const cap = w.objects.capsule;
  if (cap && cap.support === 'bench' && cap.temperatureC > 60) bump(w, 'hotOnBenchS', dt);
  if (hasOpenFlame(w)) bump(w, 'litS', dt);
  if (hasOpenFlame(w) && !w.room.extractionOn) bump(w, 'litNoExtractionS', dt);
}

/** Motivos que impiden entregar (§11.11, §30): gas abierto, fuga, llama, material caliente mal dispuesto, HCl abierto. */
export function submissionBlockers(w: FlameWorld): string[] {
  const out: string[] = [];
  const b = w.burner;
  if (isLit(w)) out.push('FLAME_LIT');
  if (b.tableGasValve > 0.02 && b.supplyOn) out.push('TABLE_OPEN');
  if (b.needleGasValve > 0.02) out.push('NEEDLE_OPEN');
  const fl = gasFlows(w);
  if (fl.leak > 0.005) out.push('LEAK');
  if (w.hcl.open) out.push('HCL_OPEN');
  if (w.safety.incident) out.push('INCIDENT');
  const cap = w.objects.capsule;
  if (cap && cap.temperatureC > 60 && cap.support !== 'tile') out.push('HOT_CAPSULE');
  for (const l of Object.values(w.loops)) {
    const o = w.objects[l.id];
    if (o && l.temperatureC > 60 && !o.support.startsWith('holder:')) {
      out.push('HOT_LOOP');
      break;
    }
  }
  return out;
}

/** Resumen numérico para la vista docente y el hash de estado. */
export function flameSummary(w: FlameWorld): Record<string, number | string> {
  const b = w.burner;
  return {
    state: b.flameState, flow: Math.round(gasFlows(w).burner * 1000) / 1000, air: Math.round(b.flame.airMix * 1000) / 1000, h: Math.round(b.flame.heightCm * 10) / 10,
    co: Math.round(w.room.coPpm), gas: Math.round(w.room.gasAccumMl), soot: Math.round(w.capsule.sootMassMg * 1000) / 1000, cap: Math.round(w.objects.capsule?.temperatureC ?? 0),
  };
}

export { N_BINS };
