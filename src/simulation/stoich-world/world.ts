/**
 * Mundo de la Práctica 5: balanza granataria, preparación por diferencia, mezcla, montaje, calentamiento del
 * KClO₃ con MnO₂ (cinética de Arrhenius, calor de reacción, salida de O₂, arrastre de sólido), enfriamiento,
 * pesadas hasta masa constante y seguridad. Puro y determinista: paso fijo `params.dtS`.
 *
 * Convenciones: cm sobre la mesada; g; mol; °C; s. El mechero es el sub-mundo de la Práctica 3 (`w.gas`).
 */
import { clamp } from '../core/math';
import { hashRange, rand } from '../core/rng';
import { createFlameWorld, dispatchFlame, hasOpenFlame, isLit, localContact, localTemperature, mouthPos, stepFlame, type FlameContext } from '../flame-world/world';
import type { FlameCommand, FlameDispatchResult } from '../flame-world/commands';
import type { Practice3Params } from '../flame-world/types';
import { MOLAR_MASS, roundTo } from '../stoichiometry/stoich';
import type { P5Command, P5DispatchResult } from './commands';
import type {
  BalanceState, P5Measurement, P5Object, P5ObjKind, P5Params, P5World, Pose, Severity, SimEvent, SpatulaState, TubeState,
} from './types';

export interface StoichContext {
  gasCtx: FlameContext;
  geo: {
    stand: { x: number; y: number };
    clampArm: number;
    tube: { length: number; outerR: number; glassMassG: number };
    balance: { x: number; y: number; panDx: number; panDy: number; panZ: number };
    rack: { x: number; y: number };
  };
}

export interface StoichWorldSpec {
  objects: Array<{ id: string; kind: P5ObjKind; pose: Pose; support: string; movable: boolean }>;
  gasObjects: Array<{ id: string; kind: never | string; pose: Pose; support: string; movable: boolean }>;
  gasParams: Practice3Params;
  scenarios: string[];
}

const R = 8.314;
const SIGMA = 5.67e-8;
const SPECIES = ['KClO3', 'KCl', 'MnO2'] as const;
const zeroSolids = () => ({ KClO3: 0, KCl: 0, MnO2: 0 });

// ─────────────────────────── Eventos y utilidades ───────────────────────────

export function emit5(w: P5World, code: string, severity: Severity, params?: SimEvent['params'], id?: string): SimEvent {
  const seq = (w.evidence.__eventSeq ?? 0) + 1;
  w.evidence.__eventSeq = seq;
  const e: SimEvent = { seq, t: w.timeS, code, severity, params, vesselId: id };
  w.events.push(e);
  if (w.events.length > 600) w.events.splice(0, w.events.length - 600);
  return e;
}

/** Emite una sola vez hasta que la condición se rearme. */
function latch(w: P5World, key: string, code: string, severity: Severity, params?: SimEvent['params']) {
  if (w.evidence[`latch:${key}`]) return;
  w.evidence[`latch:${key}`] = 1;
  emit5(w, code, severity, params);
}
const rearm = (w: P5World, key: string) => {
  if (w.evidence[`latch:${key}`]) w.evidence[`latch:${key}`] = 0;
};
export const bump = (w: P5World, key: string, by = 1) => {
  w.evidence[key] = (w.evidence[key] ?? 0) + by;
};
export const flag = (w: P5World, key: string) => {
  if (!w.evidence[key]) w.evidence[key] = Math.max(0.01, Math.round(w.timeS * 100) / 100);
};

function forwardGasEvents(w: P5World) {
  const last = w.evidence.__gasSeq ?? 0;
  const evs = w.gas.events;
  let i = evs.length - 1;
  while (i >= 0 && (evs[i].seq ?? 0) > last) i--;
  for (let k = i + 1; k < evs.length; k++) {
    const e = evs[k];
    emit5(w, e.code, e.severity, { ...(e.params ?? {}), gas: true }, e.vesselId);
  }
  if (evs.length) w.evidence.__gasSeq = evs[evs.length - 1].seq ?? last;
}

// ─────────────────────────── Masas ───────────────────────────

export function solidsMassG(m: { KClO3: number; KCl: number; MnO2: number }): number {
  return m.KClO3 * MOLAR_MASS.KClO3 + m.KCl * MOLAR_MASS.KCl + m.MnO2 * MOLAR_MASS.MnO2;
}

/** Masa verdadera del tubo con su contenido (g). */
export function tubeMassG(t: TubeState): number {
  return t.glassMassG + solidsMassG(t.contents) + t.contents.waterG + (t.contents.contamination.length ? 0.02 : 0);
}

/** Temperatura representativa del tubo para tocarlo o pesarlo (la del vidrio más caliente). */
export const tubeTempC = (t: TubeState) => Math.max(t.glassC, t.sampleC, t.upperC);

/** Masa verdadera sobre el platillo (g). */
export function panTrueMassG(w: P5World): number {
  const b = w.balance;
  const load = b.panObjectId === 'tube' ? tubeMassG(w.tube) : b.panObjectId ? objectMassG(w, b.panObjectId) : 0;
  return load + solidsMassG(b.panResidueMol);
}

function objectMassG(w: P5World, id: string): number {
  const o = w.objects[id];
  if (!o) return 0;
  const M: Partial<Record<P5ObjKind, number>> = { stopper: 6.2, spatula: 11.4, weighPaper: 0.9, tubeTongs: 38, irThermometer: 140, brush: 9 };
  return M[o.kind] ?? 50;
}

// ─────────────────────────── Creación ───────────────────────────

export function createStoichWorld(spec: StoichWorldSpec, seed: number, params: P5Params, _ctx: StoichContext): P5World {
  const objects: Record<string, P5Object> = {};
  for (const o of spec.objects) objects[o.id] = { ...o, pose: { ...o.pose } };
  const gas = createFlameWorld(
    {
      objects: spec.gasObjects as never, solutions: [], loops: [], atomizers: [],
      unknown: { number: 0, cation: '', intensityFactor: 1, background: {} },
      hose: { cracked: spec.scenarios.includes('CRACKED_HOSE') }, room: { ventilation: 0.3, draft: 0 }, fuel: 'PROPANE',
    },
    seed,
    spec.gasParams,
  );
  const amb = params.ambientC;
  const sc = (s: string) => spec.scenarios.includes(s);
  const balance: BalanceState = {
    capacityG: params.capacityG, resolutionG: params.resolutionG, uncertaintyG: params.uncertaintyG,
    riders: sc('RIDERS_NOT_ZERO') ? [0, 10, 2.4] : [0, 0, 0],
    zeroScrewG: 0,
    // La balanza llega con el cero desajustado (hay que calibrar): ±0,1–0,4 g, o más en el escenario.
    zeroErrorG: (hashRange(seed, 'zero', 0, 1) < 0.5 ? -1 : 1) * hashRange(seed, 'zeroMag', 0.12, 0.4) * (sc('ZERO_OFF') ? 3 : 1),
    levelErrorDeg: sc('UNLEVEL') ? 2.5 : 0,
    panObjectId: null, panResidueMol: zeroSolids(), noiseG: 0, quietS: 0, pointer: 0, pointerVel: 0,
    airCurrent: sc('DRAFT') ? 0.6 : 0.03, vibration: 0.02,
    calibratedAt: null, stable: true, state: 'UNLOADED', disturbedAt: 0,
  };
  const tube: TubeState = {
    id: 'tube', glassMassG: Math.round(hashRange(seed, 'tubeMass', 16.6, 18.2) * 1000) / 1000,
    contents: { KClO3: 0, KCl: 0, MnO2: 0, waterG: sc('WET_TUBE') ? 0.32 : 0, contamination: [] },
    homogeneity: 0, compaction: 0, glassC: amb, sampleC: amb, upperC: amb, stress: 0, cracked: false, preCracked: sc('CRACKED_TUBE'),
    inspected: false, stoppered: false, o2ReleasedMol: 0, o2RateMolS: 0, waterLostG: 0, lostMol: zeroSolids(), reactionHeatJ: 0,
    cycles: [], state: 'CLEAN_DRY',
  };
  const spatula = (id: string, dedicatedTo: 'KClO3' | 'MnO2'): SpatulaState => ({
    id, dedicatedTo, loadMol: { KClO3: 0, MnO2: 0 }, residueMol: { KClO3: 0, MnO2: 0 }, contaminant: null, crossed: false,
  });
  const w: P5World = {
    timeS: 0, tick: 0, seed, rng: seed >>> 0 || 1, params, objects,
    balance, tube,
    clamp: { nutTight: false, grip: 0.5, angleDeg: 45, mouthYawDeg: 0, heightCm: 28, gripAt: 0.66 },
    spatulas: { spatula_kclo3: spatula('spatula_kclo3', 'KClO3'), spatula_mno2: spatula('spatula_mno2', 'MnO2') },
    bottles: {
      bottle_kclo3: { id: 'bottle_kclo3', species: 'KClO3', mol: 100 / MOLAR_MASS.KClO3, open: false, contaminated: false },
      bottle_mno2: { id: 'bottle_mno2', species: 'MnO2', mol: 25 / MOLAR_MASS.MnO2, open: false, contaminated: false },
    },
    spills: [], measurements: [],
    safety: { ppe: false, shieldPlaced: false, block: null, incident: null, stoppedByTeacher: false, lastInteractionS: 0, burns: 0 },
    stopwatch: { running: false, startedAt: null, accumulatedS: 0 },
    gas, events: [], evidence: {}, scenarios: [...spec.scenarios], initialElements: {}, ppe: false,
  };
  if (sc('GREASY_SPATULA')) w.spatulas.spatula_kclo3.contaminant = 'grasa';
  w.initialElements = elementTotals(w);
  return w;
}

// ─────────────────────────── Balance de elementos (§11.5) ───────────────────────────

/** Moles de K, Cl, O y Mn en todo el sistema (tubo, pérdidas, derrames, espátulas, platillo, frascos, O₂ liberado). */
export function elementTotals(w: P5World): Record<string, number> {
  const acc = zeroSolids();
  const add = (m: { KClO3?: number; KCl?: number; MnO2?: number }) => {
    for (const s of SPECIES) acc[s] += m[s] ?? 0;
  };
  add(w.tube.contents);
  add(w.tube.lostMol);
  add(w.balance.panResidueMol);
  for (const sp of w.spills) add(sp.mol);
  for (const s of Object.values(w.spatulas)) {
    add(s.loadMol);
    add(s.residueMol);
  }
  for (const b of Object.values(w.bottles)) add({ [b.species]: b.mol });
  add({ KClO3: w.evidence.__disposedKClO3 ?? 0, KCl: w.evidence.__disposedKCl ?? 0, MnO2: w.evidence.__disposedMnO2 ?? 0 });
  const o2 = w.tube.o2ReleasedMol + (w.evidence.__o2InLost ?? 0);
  return {
    K: acc.KClO3 + acc.KCl,
    Cl: acc.KClO3 + acc.KCl,
    O: 3 * acc.KClO3 + 2 * acc.MnO2 + 2 * o2,
    Mn: acc.MnO2,
  };
}

// ─────────────────────────── Geometría del montaje ───────────────────────────

export interface TubeAxis {
  bottom: { x: number; y: number; z: number };
  mouth: { x: number; y: number; z: number };
  dir: { x: number; y: number; z: number };
  /** Punto de la muestra (fondo interior). */
  sample: { x: number; y: number; z: number };
  clamped: boolean;
}

/** Eje del tubo: inclinado en la pinza, o vertical donde esté apoyado. */
export function tubeAxis(w: P5World, ctx: StoichContext): TubeAxis {
  const o = w.objects.tube;
  const L = ctx.geo.tube.length;
  if (o.support === 'clamp') {
    const c = w.clamp;
    const th = (c.angleDeg * Math.PI) / 180;
    const ya = (c.mouthYawDeg * Math.PI) / 180;
    const dir = { x: Math.cos(th) * Math.sin(ya), y: Math.cos(th) * Math.cos(ya), z: Math.sin(th) };
    const J = { x: ctx.geo.stand.x, y: ctx.geo.stand.y - ctx.geo.clampArm, z: c.heightCm };
    const bottom = { x: J.x - dir.x * c.gripAt * L, y: J.y - dir.y * c.gripAt * L, z: J.z - dir.z * c.gripAt * L };
    const mouth = { x: bottom.x + dir.x * L, y: bottom.y + dir.y * L, z: bottom.z + dir.z * L };
    // La muestra queda en el fondo (lado bajo); a más inclinación, más concentrada.
    const s = 0.9 + (1 - Math.sin(th)) * 1.4;
    return { bottom, mouth, dir, sample: { x: bottom.x + dir.x * s, y: bottom.y + dir.y * s, z: bottom.z + dir.z * s - ctx.geo.tube.outerR * Math.cos(th) * 0.6 }, clamped: true };
  }
  const p = o.pose;
  return { bottom: { x: p.x, y: p.y, z: p.z }, mouth: { x: p.x, y: p.y, z: p.z + L }, dir: { x: 0, y: 0, z: 1 }, sample: { x: p.x, y: p.y, z: p.z + 0.8 }, clamped: false };
}

/** ¿La boca apunta hacia la persona? (frente de la mesada, y < 0). */
export const mouthTowardPerson = (w: P5World) => w.objects.tube.support === 'clamp' && yawDistance(w.clamp.mouthYawDeg, 180) < 60;

/** Distancia angular (0–180°) entre dos direcciones. */
export const yawDistance = (a: number, b: number) => Math.abs(((((a - b) % 360) + 540) % 360) - 180);

// ─────────────────────────── Lectura de la balanza ───────────────────────────

/** Desequilibrio aparente (g) que ve el fiel: carga + error de cero − tornillo + desnivel + empuje de carga caliente − pesas. */
function balanceNet(w: P5World, noise: number): number {
  const b = w.balance;
  const p = w.params;
  const load = panTrueMassG(w);
  const T = b.panObjectId === 'tube' ? tubeTempC(w.tube) : p.ambientC;
  const hot = Math.max(0, T - p.ambientC);
  // La corriente de aire caliente que sube desde la carga empuja el platillo hacia arriba: masa aparente menor.
  const lift = p.hotLiftGPerK * hot;
  const level = b.levelErrorDeg * 0.06 + load * b.levelErrorDeg * 0.0005;
  const riders = b.riders[0] + b.riders[1] + b.riders[2];
  return load + (b.zeroErrorG - b.zeroScrewG) + level - lift + noise - riders;
}

/** Masa que equilibra el fiel ahora mismo, sin ruido (lo que un estudiante cuidadoso encontraría moviendo las pesas). */
export function balanceTargetG(w: P5World): number {
  const b = w.balance;
  return balanceNet(w, 0) + b.riders[0] + b.riders[1] + b.riders[2];
}

function stepBalance(w: P5World, dt: number) {
  const b = w.balance;
  const p = w.params;
    const T = b.panObjectId === 'tube' ? tubeTempC(w.tube) : p.ambientC;
  const hot = Math.max(0, T - p.ambientC);
  // Fluctuación: aire caliente, corrientes de aire y vibración.
  const noiseAmp = p.hotFluctuationGPerK * hot + b.airCurrent * 0.06 + b.vibration * 0.01;
  // Proceso de Ornstein–Uhlenbeck (τ ≈ 1,5 s): las corrientes de aire cambian despacio, no a cada paso.
  const tau = 1.5;
  const gauss = (rand(w) + rand(w) + rand(w) - 1.5) * 2;
  b.noiseG += (-b.noiseG / tau) * dt + noiseAmp * Math.sqrt((2 * dt) / tau) * gauss;
  const net = balanceNet(w, b.noiseG);
  const load = panTrueMassG(w);
  const over = load > b.capacityG;
  const eq = over ? 1 : clamp(net / p.pointerSpanG, -1, 1);
  const w0 = (2 * Math.PI) / p.pointerPeriodS;
  const acc = -w0 * w0 * (b.pointer - eq) - 2 * p.pointerDamping * w0 * b.pointerVel;
  b.pointerVel += acc * dt;
  b.pointer += b.pointerVel * dt;
  // Topes mecánicos del fiel.
  // Topes mecánicos del fiel: rebota hacia adentro perdiendo energía.
  if (b.pointer > 1.1) {
    b.pointer = 1.1;
    if (b.pointerVel > 0) b.pointerVel *= -0.3;
  }
  if (b.pointer < -1.1) {
    b.pointer = -1.1;
    if (b.pointerVel < 0) b.pointerVel *= -0.3;
  }
  // «Estable» = el fiel lleva al menos 1 s casi quieto (como lo juzga quien mira la balanza).
  // En el tope el fiel no está «quieto en equilibrio»; y cada cambio de carga o de pesas reinicia la espera.
  const quiet = Math.abs(eq) < 0.95 && Math.abs(b.pointerVel) < 0.08 && Math.abs(b.pointer - eq) < 0.05 && noiseAmp < 0.025 && w.timeS - b.disturbedAt > 0.5;
  b.quietS = quiet ? b.quietS + dt : 0;
  b.stable = b.quietS >= 1;
  b.state = over ? 'OVERLOADED'
    : b.panObjectId && hot > p.allowedDeltaC ? 'HOT_LOAD'
      : b.airCurrent > 0.3 ? 'UNSTABLE_SURFACE'
        : solidsMassG(b.panResidueMol) > 0.005 ? 'CONTAMINATED'
          : !b.panObjectId ? (b.calibratedAt !== null ? 'READY' : 'UNLOADED')
            : b.stable && Math.abs(b.pointer) < 0.05 ? 'BALANCED' : 'LOADED_OSCILLATING';
}

/** ¿El cero está bien ajustado? (el tornillo compensa el error de fábrica y la balanza está nivelada). */
export const zeroOk = (b: BalanceState) => Math.abs(b.zeroErrorG - b.zeroScrewG + b.levelErrorDeg * 0.06) <= 0.05;

/** Registra la lectura actual (§6.3: la suma de las pesas cuando el fiel está en equilibrio). */
function readBalance(w: P5World): P5Measurement {
  const b = w.balance;
  const p = w.params;
  const riders = b.riders[0] + b.riders[1] + b.riders[2];
  const onPan = b.panObjectId;
  const T = onPan === 'tube' ? tubeTempC(w.tube) : p.ambientC;
  const centered = Math.abs(b.pointer) < 0.06;
  const zeroCheck = !onPan && riders < 1e-9;
  const calibrated = b.calibratedAt !== null && zeroOk(b);
  let invalidReason: P5Measurement['invalidReason'];
  if (panTrueMassG(w) > b.capacityG) invalidReason = 'OVERLOAD';
  else if (T > p.ambientC + p.allowedDeltaC) invalidReason = 'HOT_LOAD';
  else if (!b.stable || !centered) invalidReason = 'UNSTABLE';
  else if (!calibrated && !zeroCheck) invalidReason = 'NOT_CALIBRATED';
  else if (!onPan && !zeroCheck) invalidReason = 'EMPTY';
  const t = w.tube.contents;
  const m: P5Measurement = {
    id: `m${w.measurements.length + 1}`,
    displayedMassG: roundTo(riders, b.resolutionG),
    trueMassG: panTrueMassG(w),
    resolutionG: b.resolutionG,
    uncertaintyG: b.uncertaintyG,
    stable: b.stable && centered,
    zeroCorrected: calibrated,
    loadTemperatureC: Math.round(T * 10) / 10,
    timestampMs: Math.round(w.timeS * 1000),
    objectId: onPan,
    valid: !invalidReason,
    invalidReason,
    contents: onPan === 'tube' ? { KClO3: t.KClO3, KCl: t.KCl, MnO2: t.MnO2, waterG: t.waterG } : null,
    cycle: w.tube.cycles.filter((c) => c.endS !== null).length,
    zeroCheck,
  };
  w.measurements.push(m);
  if (zeroCheck) {
    if (b.stable && centered && zeroOk(b)) {
      b.calibratedAt = w.timeS;
      flag(w, 'calibrated');
      emit5(w, 'BALANCE_CALIBRATED', 'INFO');
    } else {
      emit5(w, b.stable ? 'ZERO_NOT_ADJUSTED' : 'BALANCE_NOT_SETTLED', 'WARN');
      bump(w, 'err:zero');
    }
  } else if (invalidReason === 'HOT_LOAD') {
    emit5(w, 'HOT_WEIGHING', 'WARN', { tempC: Math.round(T) });
    bump(w, 'err:hotWeigh');
  } else if (invalidReason === 'UNSTABLE') {
    emit5(w, 'READING_UNSTABLE', 'WARN');
    bump(w, 'err:unstable');
  } else if (invalidReason === 'NOT_CALIBRATED') {
    emit5(w, 'READING_UNCALIBRATED', 'WARN');
    bump(w, 'err:uncalibrated');
  } else if (m.valid) {
    emit5(w, 'READING_RECORDED', 'INFO', { g: m.displayedMassG });
    if (w.tube.state === 'ROOM_TEMPERATURE' || w.tube.state === 'COOLING') w.tube.state = 'WEIGHED';
    // §13.3: dos lecturas válidas consecutivas del tubo tras calentar, dentro del criterio.
    const prev = w.measurements.slice(0, -1).reverse().find((x) => x.valid && x.objectId === 'tube');
    if (prev && m.cycle > 0 && prev.cycle > 0 && prev.cycle < m.cycle && Math.abs(prev.displayedMassG - m.displayedMassG) <= p.constantMassCriterionG + 1e-9) {
      flag(w, 'constantMass');
      emit5(w, 'CONSTANT_MASS', 'INFO', { g: m.displayedMassG });
    }
  }
  return m;
}

// ─────────────────────────── Comandos ───────────────────────────

export function dispatchStoich(w: P5World, cmd: P5Command, ctx: StoichContext): P5DispatchResult {
  if (cmd.type !== 'setPose' && cmd.type !== 'measureIR') w.safety.lastInteractionS = w.timeS;
  if (w.safety.stoppedByTeacher && cmd.type !== 'teacherStop') return { ok: false, code: 'TEACHER_STOP' };
  const t = w.tube;
  switch (cmd.type) {
    case 'confirmPpe':
      w.ppe = true;
      w.safety.ppe = true;
      flag(w, 'ppe');
      dispatchFlame(w.gas, { type: 'confirmPpe' }, ctx.gasCtx);
      return { ok: true };
    case 'gas':
      return gasCommand(w, ctx, cmd.cmd);
    case 'setPose':
      if (GAS_OBJECTS.has(cmd.id)) return gasCommand(w, ctx, { type: 'setPose', id: cmd.id, pose: cmd.pose, support: cmd.support });
      return setPose(w, ctx, cmd.id, cmd.pose, cmd.support);
    case 'inspect': {
      flag(w, `inspected:${cmd.target}`);
      if (cmd.target === 'tube') {
        t.inspected = true;
        if (t.preCracked) emit5(w, 'TUBE_CRACK_FOUND', 'WARN');
        if (t.contents.waterG > 0.01) emit5(w, 'TUBE_WET', 'WARN');
      }
      if (cmd.target === 'balance') {
        if (w.balance.levelErrorDeg > 0.5) emit5(w, 'BALANCE_UNLEVEL', 'WARN');
        if (w.balance.airCurrent > 0.3) emit5(w, 'DRAFT_NEAR_BALANCE', 'WARN');
      }
      if (cmd.target === 'spatula_kclo3' || cmd.target === 'spatula_mno2') {
        const s = w.spatulas[cmd.target];
        if (s.contaminant) emit5(w, 'SPATULA_DIRTY', 'WARN', { what: s.contaminant });
      }
      if (['extinguisher', 'blanket', 'estop', 'gas_tap', 'co_detector', 'hose', 'burner', 'extractor'].includes(cmd.target)) {
        const r = dispatchFlame(w.gas, { type: 'inspect', target: cmd.target }, ctx.gasCtx);
        forwardGasEvents(w);
        return r;
      }
      emit5(w, 'INSPECTED', 'INFO', { target: cmd.target });
      return { ok: true };
    }
    // ── Balanza ──
    case 'setRider': {
      const b = w.balance;
      const v = cmd.beam === 0 ? clamp(Math.round(cmd.valueG / 100) * 100, 0, 500)
        : cmd.beam === 1 ? clamp(Math.round(cmd.valueG / 10) * 10, 0, 90)
          : clamp(Math.round(cmd.valueG * 100) / 100, 0, 10);
      b.riders[cmd.beam] = v;
      b.disturbedAt = w.timeS;
      return { ok: true, value: v };
    }
    case 'turnZeroScrew': {
      const b = w.balance;
      b.zeroScrewG = clamp(b.zeroScrewG + cmd.deltaG, -3, 3);
      b.disturbedAt = w.timeS;
      // Ajustar el cero con carga o con pesas fuera de cero descalibra la balanza.
      if (b.panObjectId || b.riders.some((r) => r > 0)) {
        b.calibratedAt = null;
        emit5(w, 'ZERO_ADJUSTED_WITH_LOAD', 'WARN');
        bump(w, 'err:zeroWithLoad');
      } else if (b.calibratedAt !== null && Math.abs(cmd.deltaG) > 1e-9) b.calibratedAt = null;
      return { ok: true, value: b.zeroScrewG };
    }
    case 'levelBalance':
      w.balance.levelErrorDeg = 0;
      w.balance.calibratedAt = null;
      emit5(w, 'BALANCE_LEVELED', 'INFO');
      return { ok: true };
    case 'readBalance': {
      const m = readBalance(w);
      return { ok: m.valid, code: m.invalidReason, id: m.id, value: m.displayedMassG };
    }
    case 'cleanPan': {
      const b = w.balance;
      if (b.panObjectId) return { ok: false, code: 'PAN_NOT_EMPTY' };
      if (solidsMassG(b.panResidueMol) > 0) {
        w.spills.push({ id: `s${w.spills.length + 1}`, t: w.timeS, x: ctx.geo.balance.x, y: ctx.geo.balance.y - 8, mol: { ...b.panResidueMol }, cleaned: true });
        b.panResidueMol = zeroSolids();
        b.calibratedAt = null;
        emit5(w, 'PAN_CLEANED', 'INFO');
      }
      return { ok: true };
    }
    case 'shieldDraft':
      w.balance.airCurrent = cmd.on ? 0.03 : 0.6;
      return { ok: true };
    // ── Reactivos ──
    case 'openBottle': {
      const b = w.bottles[cmd.id];
      if (!b) return { ok: false };
      b.open = cmd.open;
      if (!cmd.open) rearm(w, `open:${cmd.id}`);
      return { ok: true };
    }
    case 'scoop':
      return scoop(w, cmd.spatulaId, cmd.bottleId, cmd.amount);
    case 'tip':
      return tip(w, ctx, cmd.spatulaId, cmd.targetId, cmd.fraction);
    case 'returnToBottle': {
      const s = w.spatulas[cmd.spatulaId];
      const b = w.bottles[cmd.bottleId];
      if (!s || !b) return { ok: false };
      const load = s.loadMol[b.species];
      if (load <= 0) return { ok: false, code: 'EMPTY' };
      b.mol += load;
      s.loadMol[b.species] = 0;
      b.contaminated = true;
      emit5(w, 'RETURNED_TO_BOTTLE', 'WARN', { bottle: b.id });
      bump(w, 'err:returnToBottle');
      return { ok: true };
    }
    case 'wipeSpatula': {
      const s = w.spatulas[cmd.spatulaId];
      if (!s) return { ok: false };
      const residue = { KClO3: s.residueMol.KClO3 + s.loadMol.KClO3, KCl: 0, MnO2: s.residueMol.MnO2 + s.loadMol.MnO2 };
      if (residue.KClO3 + residue.MnO2 > 0) w.spills.push({ id: `s${w.spills.length + 1}`, t: w.timeS, x: w.objects[s.id].pose.x, y: w.objects[s.id].pose.y, mol: residue, cleaned: true });
      s.residueMol = { KClO3: 0, MnO2: 0 };
      s.loadMol = { KClO3: 0, MnO2: 0 };
      if (s.contaminant) {
        s.contaminant = null;
        emit5(w, 'SPATULA_CLEANED', 'INFO');
      }
      s.crossed = false;
      return { ok: true };
    }
    case 'dryTube':
      if (tubeTempC(t) > w.params.ambientC + 20) return { ok: false, code: 'HOT' };
      if (t.contents.KClO3 + t.contents.MnO2 + t.contents.KCl > 0) return { ok: false, code: 'NOT_EMPTY' };
      t.contents.waterG = 0;
      emit5(w, 'TUBE_DRIED', 'INFO');
      return { ok: true };
    // ── Mezcla ──
    case 'tap': {
      const sup = w.objects.tube.support;
      if (sup !== 'hand' && sup !== 'tongs') return { ok: false, code: 'HOLD_TUBE' };
      if (tubeTempC(t) > w.params.ambientC + 25) return { ok: false, code: 'HOT' };
      const s = clamp(cmd.strength, 0, 1);
      const solids = solidsMassG(t.contents);
      if (solids <= 0) return { ok: true };
      t.homogeneity = clamp(t.homogeneity + (1 - t.homogeneity) * w.params.tapGain * (0.3 + s), 0, 1);
      t.compaction = clamp(t.compaction + 0.02 * s, 0, 1);
      if (t.state === 'REACTANT_LOADED' && t.homogeneity > 0.6) t.state = 'MIXED';
      flag(w, 'tapped');
      bump(w, 'taps');
      if (s > w.params.tapLossThreshold) {
        // Golpe violento: sale polvo por la boca.
        const f = 0.004 * (s - w.params.tapLossThreshold) * 10;
        const lost = takeSolids(t.contents, f);
        const p = w.objects.tube.pose;
        w.spills.push({ id: `s${w.spills.length + 1}`, t: w.timeS, x: p.x + 3, y: p.y - 3, mol: lost, cleaned: false });
        emit5(w, 'VIOLENT_TAP', 'WARN', { g: Math.round(solidsMassG(lost) * 1000) / 1000 });
        bump(w, 'err:violentTap');
      }
      return { ok: true };
    }
    case 'grind':
      // §9.1: triturar o moler el oxidante está prohibido (fricción): se detiene sin efecto.
      setBlock(w, ctx, 'GRINDING');
      emit5(w, 'GRINDING_BLOCKED', 'CRITICAL');
      bump(w, 'err:grind');
      return { ok: false, code: 'GRINDING' };
    case 'stopper':
      t.stoppered = cmd.on;
      w.objects.stopper.support = cmd.on ? 'tube' : 'bench';
      if (cmd.on) emit5(w, 'TUBE_STOPPERED', 'WARN');
      return { ok: true };
    // ── Montaje ──
    case 'setClamp': {
      const c = w.clamp;
      const hot = w.objects.tube.support === 'clamp' && tubeTempC(t) > w.params.ambientC + 40;
      if (cmd.angleDeg !== undefined) {
        if (hot && Math.abs(cmd.angleDeg - c.angleDeg) > 1) emit5(w, 'ADJUST_HOT', 'WARN');
        c.angleDeg = clamp(cmd.angleDeg, 0, 85);
      }
      if (cmd.mouthYawDeg !== undefined) c.mouthYawDeg = ((cmd.mouthYawDeg % 360) + 360) % 360;
      if (cmd.grip !== undefined) c.grip = clamp(cmd.grip, 0, 1);
      if (cmd.heightCm !== undefined) c.heightCm = clamp(cmd.heightCm, 12, 45);
      if (cmd.gripAt !== undefined) c.gripAt = clamp(cmd.gripAt, 0.3, 0.9);
      if (cmd.nutTight !== undefined) c.nutTight = cmd.nutTight;
      return { ok: true };
    }
    case 'setShield':
      w.safety.shieldPlaced = cmd.placed;
      if (cmd.placed) flag(w, 'shield');
      return { ok: true };
    // ── Enfriamiento y lectura ──
    case 'measureIR': {
      flag(w, 'irUsed');
      return { ok: true, value: Math.round(tubeTempC(t)) };
    }
    case 'waterOnTube':
      if (tubeTempC(t) > w.params.ambientC + 30) {
        // §10.3: enfriar con agua un vidrio caliente causa choque térmico: no se permite.
        emit5(w, 'WATER_ON_HOT_TUBE', 'CRITICAL');
        bump(w, 'err:waterOnHot');
        setBlock(w, ctx, 'THERMAL_SHOCK');
        return { ok: false, code: 'THERMAL_SHOCK' };
      }
      t.contents.waterG += 0.4;
      emit5(w, 'TUBE_WET', 'WARN');
      return { ok: true };
    case 'touchTube':
      if (tubeTempC(t) > 55) {
        w.safety.burns += 1;
        emit5(w, 'BURN_HOT_TUBE', 'ALERT', { tempC: Math.round(tubeTempC(t)) });
        bump(w, 'err:burn');
        return { ok: false, code: 'BURN' };
      }
      return { ok: true };
    case 'cleanSpill': {
      const sp = w.spills.find((x) => x.id === cmd.spillId);
      if (!sp) return { ok: false };
      sp.cleaned = true;
      return { ok: true };
    }
    case 'disposeResidue': {
      if (tubeTempC(t) > w.params.ambientC + 10) return { ok: false, code: 'HOT' };
      w.evidence.__disposedKClO3 = (w.evidence.__disposedKClO3 ?? 0) + t.contents.KClO3;
      w.evidence.__disposedKCl = (w.evidence.__disposedKCl ?? 0) + t.contents.KCl;
      w.evidence.__disposedMnO2 = (w.evidence.__disposedMnO2 ?? 0) + t.contents.MnO2;
      t.contents.KClO3 = 0;
      t.contents.KCl = 0;
      t.contents.MnO2 = 0;
      flag(w, 'disposed');
      emit5(w, 'RESIDUE_DISPOSED', 'INFO');
      return { ok: true };
    }
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
    case 'acknowledge':
      return acknowledge(w, ctx);
    case 'teacherStop':
      w.safety.stoppedByTeacher = cmd.on;
      dispatchFlame(w.gas, { type: 'teacherStop', on: cmd.on }, ctx.gasCtx);
      return { ok: true };
  }
  return { ok: false, code: 'UNKNOWN' };
}

export const GAS_OBJECTS = new Set(['burner', 'gas_tap', 'lighter', 'extinguisher', 'blanket', 'estop', 'extractor', 'co_detector']);

function gasCommand(w: P5World, ctx: StoichContext, cmd: FlameCommand): FlameDispatchResult {
  if (cmd.type === 'spark' && cmd.on) {
    const missing = heatingBlockers(w, ctx);
    const critical = missing.filter((m) => CRITICAL_SETUP.has(m));
    if (critical.length) {
      setBlock(w, ctx, critical[0], critical);
      emit5(w, critical[0], 'CRITICAL');
      bump(w, `err:${critical[0]}`);
      return { ok: false, code: critical[0] };
    }
  }
  if (cmd.type === 'acknowledge') return acknowledge(w, ctx);
  const r = dispatchFlame(w.gas, cmd, ctx.gasCtx);
  forwardGasEvents(w);
  return r;
}

/** Bloqueos que impiden calentar la muestra (§19.5). */
const CRITICAL_SETUP = new Set(['CONTAMINATED_MIXTURE', 'TUBE_STOPPERED', 'MOUTH_TOWARD_PERSON', 'CRACKED_TUBE', 'KCLO3_OVER_LIMIT']);

export function heatingBlockers(w: P5World, _ctx: StoichContext): string[] {
  const t = w.tube;
  const out: string[] = [];
  if (t.contents.contamination.length) out.push('CONTAMINATED_MIXTURE');
  if (t.stoppered) out.push('TUBE_STOPPERED');
  if (mouthTowardPerson(w)) out.push('MOUTH_TOWARD_PERSON');
  if (t.cracked || t.preCracked) out.push('CRACKED_TUBE');
  if (t.contents.KClO3 * MOLAR_MASS.KClO3 > w.params.kclo3MaxG + 0.05 && t.contents.KCl === 0) out.push('KCLO3_OVER_LIMIT');
  if (!w.safety.shieldPlaced) out.push('SHIELD_MISSING');
  if (!w.ppe) out.push('PPE_MISSING');
  if (w.objects.tube.support === 'clamp' && !w.clamp.nutTight) out.push('NUT_LOOSE');
  return out;
}

function setBlock(w: P5World, ctx: StoichContext, code: string, reasons?: string[]) {
  if (w.safety.block?.code === code) return;
  w.safety.block = { code, since: w.timeS, reasons };
  // Parada segura: se cierra el gas del mechero (sin espectáculo, §12.5).
  if (isLit(w.gas) || w.gas.burner.needleGasValve > 0) {
    dispatchFlame(w.gas, { type: 'setValve', valve: 'NEEDLE', value: 0 }, ctx.gasCtx);
    dispatchFlame(w.gas, { type: 'setValve', valve: 'TABLE', value: 0 }, ctx.gasCtx);
    forwardGasEvents(w);
  }
}

function acknowledge(w: P5World, ctx: StoichContext): P5DispatchResult {
  const blk = w.safety.block;
  if (blk) {
    const still = heatingBlockers(w, ctx).filter((m) => CRITICAL_SETUP.has(m));
    if (blk.code === 'THERMAL_SHOCK' && tubeTempC(w.tube) > w.params.ambientC + 30) return { ok: false, code: 'WAIT_COOL' };
    if (CRITICAL_SETUP.has(blk.code) && still.includes(blk.code)) return { ok: false, code: blk.code };
    if (blk.code === 'UNATTENDED' && isLit(w.gas)) return { ok: false, code: 'GAS_OPEN' };
    w.safety.block = null;
    emit5(w, 'STATION_RESET', 'INFO', { code: blk.code });
    return { ok: true };
  }
  const r = dispatchFlame(w.gas, { type: 'acknowledge' }, ctx.gasCtx);
  forwardGasEvents(w);
  return r;
}

function takeSolids(m: { KClO3: number; KCl: number; MnO2: number }, f: number) {
  const out = zeroSolids();
  for (const s of SPECIES) {
    out[s] = m[s] * f;
    m[s] -= out[s];
  }
  return out;
}

function setPose(w: P5World, ctx: StoichContext, id: string, pose: Pose, support?: string): P5DispatchResult {
  const o = w.objects[id];
  if (!o) return { ok: false, code: 'NO_OBJECT' };
  const prev = o.support;
  const t = w.tube;
  if (id === 'tube' && support && support !== prev) {
    const T = tubeTempC(t);
    // Tomar con la mano un tubo caliente: quemadura simulada (se usa la pinza para tubo).
    if (support === 'hand' && T > 55) {
      w.safety.burns += 1;
      emit5(w, 'BURN_HOT_TUBE', 'ALERT', { tempC: Math.round(T) });
      bump(w, 'err:burn');
      return { ok: false, code: 'BURN' };
    }
    if (prev === 'pan') {
      w.balance.panObjectId = null;
      w.balance.disturbedAt = w.timeS;
    }
    if (support === 'pan') {
      if (w.balance.panObjectId && w.balance.panObjectId !== 'tube') return { ok: false, code: 'PAN_BUSY' };
      w.balance.panObjectId = 'tube';
      w.balance.disturbedAt = w.timeS;
      if (T > w.params.ambientC + w.params.allowedDeltaC) {
        latch(w, 'hotOnPan', 'HOT_ON_BALANCE', 'WARN', { tempC: Math.round(T) });
      }
    } else rearm(w, 'hotOnPan');
    if (support === 'clamp') {
      if (!w.clamp.nutTight) emit5(w, 'NUT_LOOSE', 'WARN');
      if (w.clamp.grip < 0.25) emit5(w, 'CLAMP_LOOSE', 'WARN');
      if (w.clamp.grip > 0.8) emit5(w, 'CLAMP_TOO_TIGHT', 'WARN');
      if (t.state === 'REACTANT_LOADED' || t.state === 'MIXED' || t.state === 'CATALYST_LOADED') t.state = 'CLAMPED';
      flag(w, 'clamped');
      if (t.homogeneity < 0.5 && t.contents.KClO3 > 0) latch(w, 'unmixed', 'POORLY_MIXED', 'WARN');
    }
    if (prev === 'clamp' && T > w.params.ambientC + 40 && support !== 'tongs') {
      // Sacar el tubo caliente de la pinza sin la pinza para tubo.
      emit5(w, 'HOT_TUBE_HANDLING', 'WARN');
    }
    if (support === 'rack' && T > w.params.ambientC + 5) flag(w, 'cooledOnRack');
  }
  if (id === 'shield') {
    // La pantalla cuenta como colocada si queda de pie entre el montaje y el observador.
    const placed = support === 'bench' && Math.abs(pose.x - ctx.geo.stand.x) < 40 && pose.y < ctx.geo.stand.y - 8;
    w.safety.shieldPlaced = placed;
    if (placed) flag(w, 'shield');
  }
  if ((id === 'weigh_paper' || id === 'sugar' || id === 'pestle') && support === 'pan') emit5(w, 'INCOMPATIBLE_ON_PAN', 'WARN', { obj: id });
  o.pose = { ...pose };
  if (support) o.support = support;
  return { ok: true };
}

/** Cantidades típicas de una carga de espátula (g). */
const SCOOP_G: Record<'KClO3' | 'MnO2', Record<'tip' | 'small' | 'level', [number, number]>> = {
  KClO3: { tip: [0.12, 0.2], small: [0.3, 0.45], level: [0.55, 0.8] },
  MnO2: { tip: [0.06, 0.11], small: [0.15, 0.25], level: [0.35, 0.5] },
};

function scoop(w: P5World, spatulaId: string, bottleId: string, amount: 'tip' | 'small' | 'level'): P5DispatchResult {
  const s = w.spatulas[spatulaId];
  const b = w.bottles[bottleId];
  if (!s || !b) return { ok: false };
  if (!b.open) return { ok: false, code: 'BOTTLE_CLOSED' };
  if (s.loadMol.KClO3 + s.loadMol.MnO2 > 0) return { ok: false, code: 'SPATULA_LOADED' };
  if (s.dedicatedTo !== b.species) {
    // Espátula del otro reactivo: lleva su residuo al frasco (contaminación cruzada).
    s.crossed = true;
    if (s.residueMol.KClO3 + s.residueMol.MnO2 > 0) b.contaminated = true;
    emit5(w, 'WRONG_SPATULA', 'WARN', { spatula: spatulaId, bottle: bottleId });
    bump(w, 'err:wrongSpatula');
  }
  if (s.contaminant && b.species === 'KClO3') {
    b.contaminated = true;
    emit5(w, 'DIRTY_SPATULA_IN_OXIDANT', 'ALERT', { what: s.contaminant });
    bump(w, 'err:dirtySpatula');
  }
  const [lo, hi] = SCOOP_G[b.species][amount];
  const g = lo + (hi - lo) * rand(w);
  const mol = Math.min(b.mol, g / MOLAR_MASS[b.species]);
  b.mol -= mol;
  s.loadMol[b.species] += mol;
  return { ok: true, value: Math.round(mol * MOLAR_MASS[b.species] * 1000) / 1000 };
}

function tip(w: P5World, ctx: StoichContext, spatulaId: string, targetId: string, fraction: number): P5DispatchResult {
  const s = w.spatulas[spatulaId];
  if (!s) return { ok: false };
  const f = clamp(fraction, 0, 1);
  const moved = { KClO3: s.loadMol.KClO3 * f, MnO2: s.loadMol.MnO2 * f };
  if (moved.KClO3 + moved.MnO2 <= 0) return { ok: false, code: 'EMPTY' };
  s.loadMol.KClO3 -= moved.KClO3;
  s.loadMol.MnO2 -= moved.MnO2;
  if (targetId !== 'tube') {
    // Fuera del tubo (papel, mesada): queda como derrame; en papel además contamina si luego se usa.
    const p = w.objects[targetId]?.pose ?? w.objects[spatulaId].pose;
    w.spills.push({ id: `s${w.spills.length + 1}`, t: w.timeS, x: p.x, y: p.y, mol: { ...moved, KCl: 0 }, cleaned: false });
    emit5(w, targetId === 'weigh_paper' ? 'SOLID_ON_PAPER' : 'SOLID_SPILLED', 'WARN');
    bump(w, 'err:spill');
    return { ok: true };
  }
  const t = w.tube;
  if (w.objects.tube.support === 'clamp' && tubeTempC(t) > w.params.ambientC + 30) return { ok: false, code: 'TUBE_HOT' };
  // Una parte cae fuera del tubo (al platillo si está en la balanza) y otra queda en la espátula.
  const outF = 0.01 + 0.04 * rand(w);
  const resF = 0.015;
  const inTube = { KClO3: moved.KClO3 * (1 - outF - resF), MnO2: moved.MnO2 * (1 - outF - resF) };
  const out = { KClO3: moved.KClO3 * outF, MnO2: moved.MnO2 * outF, KCl: 0 };
  s.residueMol.KClO3 += moved.KClO3 * resF;
  s.residueMol.MnO2 += moved.MnO2 * resF;
  if (w.objects.tube.support === 'pan') {
    w.balance.panResidueMol.KClO3 += out.KClO3;
    w.balance.panResidueMol.MnO2 += out.MnO2;
    latch(w, 'panPowder', 'POWDER_ON_PAN', 'WARN');
  } else {
    const p = w.objects.tube.pose;
    w.spills.push({ id: `s${w.spills.length + 1}`, t: w.timeS, x: p.x + 1, y: p.y - 1, mol: out, cleaned: false });
  }
  const hadKClO3 = t.contents.KClO3 > 0;
  t.contents.KClO3 += inTube.KClO3;
  t.contents.MnO2 += inTube.MnO2;
  if (s.contaminant) {
    if (!t.contents.contamination.includes(s.contaminant)) t.contents.contamination.push(s.contaminant);
    emit5(w, 'MIXTURE_CONTAMINATED', 'CRITICAL', { what: s.contaminant });
    bump(w, 'err:contamination');
  }
  if (s.crossed || w.bottles[s.dedicatedTo === 'KClO3' ? 'bottle_kclo3' : 'bottle_mno2']?.contaminated) flag(w, 'crossUsed');
  // Orden de la pesada por diferencia (§8.1): tubo → MnO₂ → KClO₃.
  if (inTube.KClO3 > 0 && t.contents.MnO2 <= 0) {
    latch(w, 'order', 'ORDER_KCLO3_FIRST', 'WARN');
    bump(w, 'err:order');
  }
  if (inTube.MnO2 > 0 && hadKClO3) {
    latch(w, 'orderMn', 'MNO2_AFTER_KCLO3', 'WARN');
    bump(w, 'err:order');
  }
  // La mezcla recién cargada está en capas.
  if (inTube.KClO3 > 0) t.homogeneity *= hadKClO3 ? 0.85 : 0.1;
  t.state = t.contents.KClO3 > 0 ? 'REACTANT_LOADED' : t.contents.MnO2 > 0 ? 'CATALYST_LOADED' : t.state;
  void ctx;
  return { ok: true };
}

// ─────────────────────────── Paso fijo ───────────────────────────

/** Actividad catalítica efectiva (§17.2): cantidad relativa de MnO₂ (saturable) × homogeneidad × accesibilidad. */
export function catalystActivity(w: P5World): number {
  const c = w.tube.contents;
  const mK = c.KClO3 * MOLAR_MASS.KClO3 + c.KCl * MOLAR_MASS.KCl;
  if (mK <= 0 || c.MnO2 <= 0) return 0;
  const ratio = (c.MnO2 * MOLAR_MASS.MnO2) / mK;
  const amount = Math.min(1, ratio / w.params.catalystSaturation);
  const mix = 0.18 + 0.82 * Math.pow(clamp(w.tube.homogeneity, 0, 1), 0.8);
  const access = 1 - 0.3 * w.tube.compaction;
  return amount * mix * access;
}

/** Constante de velocidad total (s⁻¹) a la temperatura de la muestra. */
export function rateConstant(w: P5World, tempC: number): { k: number; kCat: number; kUncat: number } {
  const p = w.params;
  const T = tempC + 273.15;
  const act = catalystActivity(w);
  // Saturación: k_ef = k / (1 + k/k_max) — sobre el catalizador la rapidez no crece sin límite con T.
  const kc = p.catA * Math.exp(-p.catEaJ / (R * T)) * act;
  const kCat = kc / (1 + kc / (p.kMax * Math.max(0.05, act)));
  const ku = p.uncatA * Math.exp(-p.uncatEaJ / (R * T));
  const kUncat = ku / (1 + ku / (p.kMax * 0.5));
  return { k: kCat + kUncat, kCat, kUncat };
}

function stepTube(w: P5World, ctx: StoichContext, dt: number) {
  const t = w.tube;
  const p = w.params;
  const amb = p.ambientC;
  const sup = w.objects.tube.support;
  const ax = tubeAxis(w, ctx);
  // Llama en el punto de la muestra y en el vidrio de abajo.
  const flameOn = hasOpenFlame(w.gas);
  const Tf = flameOn ? localTemperature(w.gas, ctx.gasCtx, ax.sample) : amb;
  const contact = flameOn ? Math.max(localContact(w.gas, ctx.gasCtx, ax.sample), 0.6 * localContact(w.gas, ctx.gasCtx, ax.bottom)) : 0;
  const inFlame = contact > 0.02 && Tf > amb + 50;
  const solidsG = solidsMassG(t.contents);
  const Cs = Math.max(0.05, solidsG * p.sampleHeatCapJGK + t.contents.waterG * 4.18);
  const Cg = p.glassHeatCapJK;
  const Kg = t.glassC + 273.15;
  const rad = 0.85 * SIGMA * 3.5e-4 * (Kg ** 4 - (amb + 273.15) ** 4);
  // Calor de la llama sobre el vidrio: una fracción de su potencia (una llama chica calienta menos), según el contacto
  // (o el penacho caliente si no toca) y lo que queda de diferencia de temperatura.
  const heatW = flameOn ? w.gas.burner.flame.heatW : 0;
  const Tmax = Math.max(Tf, w.gas.burner.flame.maxTempC || Tf);
  const plume = !inFlame && Tf > amb + 30 ? 0.15 * clamp((Tf - amb) / Math.max(1, Tmax - amb), 0, 1) : 0;
  const drive = clamp((Tf - t.glassC) / Math.max(1, Tf - amb), 0, 1);
  const qFlame = heatW * p.flameCaptureFrac * (inFlame ? contact : plume) * drive;
  const qRack = sup === 'rack' ? p.rackCouplingWK * (t.glassC - amb) : 0;
  const qGS = p.glassSampleWK * (t.glassC - t.sampleC);
  const qGU = p.upperCouplingWK * (t.glassC - t.upperC);
  const dGlass = (qFlame - p.glassAirWK * (t.glassC - amb) - rad - qGS - qGU - qRack) / Cg;
  // Cinética (§11.2).
  const { k } = rateConstant(w, t.sampleC);
  let ext = Math.min(t.contents.KClO3, t.contents.KClO3 * (1 - Math.exp(-k * dt)));
  if (ext < 1e-15) ext = 0;
  const qRx = (-p.reactionHJPerMol * ext) / dt;
  // Evaporación del agua de humedad (calor latente) por encima de ~100 °C.
  let evap = 0;
  if (t.contents.waterG > 0 && t.sampleC > 95) evap = Math.min(t.contents.waterG, 0.004 * (t.sampleC - 95) * dt);
  const qEvap = (evap * 2257) / dt;
  const dSample = (qGS + qRx - qEvap - p.sampleAirWK * (t.sampleC - amb)) / Cs;
  const dUpper = (qGU - 0.002 * (t.upperC - amb)) / 1.6;
  const prevGlass = t.glassC;
  t.glassC += dGlass * dt;
  t.sampleC += dSample * dt;
  t.upperC += dUpper * dt;
  if (evap > 0) {
    t.contents.waterG -= evap;
    t.waterLostG += evap;
  }
  // Reacción: 2 KClO₃ → 2 KCl + 3 O₂ (el MnO₂ no se consume).
  const o2 = 1.5 * ext;
  t.contents.KClO3 -= ext;
  t.contents.KCl += ext;
  t.o2RateMolS = o2 / dt;
  t.reactionHeatJ += qRx * dt;
  // §12.5 — arrastre de sólido: si el gas sale demasiado rápido respecto a la muestra.
  const solidsMol = t.contents.KClO3 + t.contents.KCl + t.contents.MnO2;
  const specific = solidsMol > 0 ? t.o2RateMolS / solidsMol : 0;
  // §12.5 — generación violenta: mucho O₂ mientras la muestra se calienta deprisa (el gas sale a borbotones).
  const sampleRamp = dSample;
  const burst = specific > p.expulsionThreshold ? Math.max(0, sampleRamp - p.expulsionRampKs) * (specific / p.expulsionThreshold) : 0;
  let lostG = 0;
  if (burst > 0 && solidsMol > 0) {
    const tilt = ax.clamped ? 0.6 + 1.2 * Math.max(0, Math.sin((w.clamp.angleDeg * Math.PI) / 180) - 0.2) : 1.6;
    const f = Math.min(0.2, p.expulsionGain * burst * tilt * dt);
    const lost = takeSolids(t.contents, f);
    for (const s of SPECIES) t.lostMol[s] += lost[s];
    lostG = solidsMassG(lost);
    latch(w, 'expel', 'SOLID_EXPELLED', 'ALERT');
    bump(w, 'err:expelled');
  } else if (burst <= 0) rearm(w, 'expel');
  t.o2ReleasedMol += o2;
  // §10.3 — tensión térmica: gradiente vidrio caliente / parte fría, calentamiento brusco, pinza apretada.
  const ramp = (t.glassC - prevGlass) / dt;
  const grad = Math.max(0, t.glassC - t.upperC - 420);
  const tight = sup === 'clamp' && w.clamp.grip > 0.8 ? (w.clamp.grip - 0.8) * 2 : 0;
  t.stress += (p.stressGradientK * grad + p.stressRampK * Math.max(0, ramp - 9) * 0.1 + tight * 0.0006 * Math.max(0, t.glassC - 150) / 100) * dt;
  t.stress = Math.max(0, t.stress - p.stressRelax * dt * (t.glassC < 200 ? 1 : 0.2));
  if (!t.cracked && (t.stress >= 1 || (t.preCracked && t.glassC > 180))) {
    t.cracked = true;
    t.state = 'BROKEN';
    emit5(w, 'TUBE_CRACKED', 'CRITICAL');
    bump(w, 'err:cracked');
    setBlock(w, ctx, 'CRACKED_TUBE');
  }
  if (ramp > 12 && inFlame) latch(w, 'fastHeat', 'HEATING_TOO_FAST', 'WARN');
  else if (ramp < 4) rearm(w, 'fastHeat');
  // Ciclos de calentamiento (§13): empiezan cuando la llama toca el tubo con muestra.
  let cyc = t.cycles[t.cycles.length - 1];
  const open = cyc && cyc.endS === null;
  if (inFlame && sup === 'clamp' && solidsMol > 0) {
    if (!open) {
      cyc = { index: t.cycles.length + 1, startS: w.timeS, endS: null, heatedS: 0, maxSampleC: t.sampleC, o2MolReleased: 0, solidLossG: 0, peakRateMolS: 0 };
      t.cycles.push(cyc);
      emit5(w, 'HEATING_STARTED', 'INFO', { cycle: cyc.index });
      if (!w.safety.shieldPlaced) emit5(w, 'SHIELD_MISSING', 'WARN');
      const angle = w.clamp.angleDeg;
      if (angle < p.angleMinDeg || angle > p.angleMaxDeg) {
        emit5(w, angle > p.angleMaxDeg ? 'TUBE_TOO_STEEP' : 'TUBE_TOO_FLAT', 'WARN', { deg: Math.round(angle) });
        bump(w, 'err:angle');
      }
    }
    cyc!.heatedS += dt;
  } else if (open && !inFlame && t.sampleC < cyc!.maxSampleC - 40) {
    cyc!.endS = w.timeS;
    emit5(w, 'HEATING_ENDED', 'INFO', { cycle: cyc!.index, s: Math.round(cyc!.heatedS) });
    if (cyc!.index === 1 && cyc!.heatedS < p.firstCycleS * 0.8) {
      emit5(w, 'FIRST_CYCLE_SHORT', 'WARN', { s: Math.round(cyc!.heatedS) });
      bump(w, 'err:shortCycle');
    }
  }
  if (cyc && cyc.endS === null) {
    cyc.maxSampleC = Math.max(cyc.maxSampleC, t.sampleC);
    cyc.o2MolReleased += o2;
    cyc.solidLossG += lostG;
    cyc.peakRateMolS = Math.max(cyc.peakRateMolS, t.o2RateMolS);
  }
  if (o2 > 0 && t.o2RateMolS > 2e-6) latch(w, 'o2', 'O2_RELEASING', 'INFO');
  // Estado del tubo (§23.3).
  const T = tubeTempC(t);
  if (t.state !== 'BROKEN') {
    if (inFlame) t.state = t.o2RateMolS > 2e-6 ? 'REACTING' : 'HEATING';
    else if (T > amb + 60 && (t.state === 'REACTING' || t.state === 'HEATING')) t.state = 'HOT_RESIDUE';
    else if (T > amb + p.allowedDeltaC && t.cycles.length > 0 && t.state !== 'WEIGHED') t.state = 'COOLING';
    else if (T <= amb + p.allowedDeltaC && t.state === 'COOLING') t.state = 'ROOM_TEMPERATURE';
  }
  // Seguridad durante el calentamiento (§19.5).
  if (inFlame) {
    const crit = heatingBlockers(w, ctx).filter((m) => CRITICAL_SETUP.has(m));
    if (crit.length && !w.safety.block) {
      setBlock(w, ctx, crit[0], crit);
      emit5(w, crit[0], 'CRITICAL');
      bump(w, `err:${crit[0]}`);
    }
    if (sup === 'clamp' && w.clamp.grip < 0.2) {
      // Pinza floja: el tubo gira y cae a la mesada; el contenido se derrama.
      const lost = takeSolids(t.contents, 0.6);
      w.spills.push({ id: `s${w.spills.length + 1}`, t: w.timeS, x: ax.bottom.x, y: ax.bottom.y, mol: { ...lost }, cleaned: false });
      w.objects.tube.support = 'bench';
      w.objects.tube.pose = { x: ax.bottom.x + 4, y: ax.bottom.y - 4, z: 0.9, rotationRad: 0 };
      emit5(w, 'TUBE_FELL', 'CRITICAL');
      bump(w, 'err:tubeFell');
      setBlock(w, ctx, 'TUBE_FELL');
    }
    if (w.timeS - w.safety.lastInteractionS > p.unattendedS && !w.safety.block) {
      setBlock(w, ctx, 'UNATTENDED');
      emit5(w, 'UNATTENDED', 'CRITICAL');
      bump(w, 'err:unattended');
    }
    // Llama fija sobre un punto: zona caliente persistente.
    const bp = w.gas.objects.burner.pose;
    const key = `${Math.round(bp.x * 4)},${Math.round(bp.y * 4)}`;
    if (w.evidence.__burnerKey !== hashKey(key)) {
      w.evidence.__burnerKey = hashKey(key);
      w.evidence.__burnerStill = 0;
      bump(w, 'burnerMoves');
    } else w.evidence.__burnerStill = (w.evidence.__burnerStill ?? 0) + dt;
    if ((w.evidence.__burnerStill ?? 0) > 180 && contact > 0.7) latch(w, 'hotspot', 'FIXED_HOT_SPOT', 'WARN');
  }
}

const hashKey = (s: string) => {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1_000_003;
  return h;
};

export function stepStoich(w: P5World, ctx: StoichContext): void {
  const dt = w.params.dtS;
  w.tick++;
  w.timeS = Math.round((w.timeS + dt) * 1e6) / 1e6;
  w.gas.ppe = w.ppe;
  stepFlame(w.gas, ctx.gasCtx);
  forwardGasEvents(w);
  stepTube(w, ctx, dt);
  stepBalance(w, dt);
  if (w.stopwatch.running && w.stopwatch.startedAt === null) w.stopwatch.startedAt = w.timeS;
}

export function runStoichFor(w: P5World, seconds: number, ctx: StoichContext) {
  const n = Math.round(seconds / w.params.dtS);
  for (let i = 0; i < n; i++) stepStoich(w, ctx);
}

/** Tiempo del cronómetro (s). */
export const stopwatchS = (w: P5World) => w.stopwatch.accumulatedS + (w.stopwatch.running && w.stopwatch.startedAt !== null ? w.timeS - w.stopwatch.startedAt : 0);

/** Presión interna (Pa): con el tubo abierto el gas fluye y se mantiene cerca de la ambiente (§12.4). */
export function tubePressurePa(w: P5World): number {
  const t = w.tube;
  const ambient = 101_325;
  if (!t.stoppered) return ambient + t.o2RateMolS * 2e5;
  const freeM3 = 25e-6;
  return ambient + (t.o2ReleasedMol * R * (t.sampleC + 273.15)) / freeM3;
}

/** Resumen para el hash de estado de la bitácora y la depuración. */
export function p5Summary(w: P5World) {
  const t = w.tube;
  return {
    mass: Math.round(tubeMassG(t) * 1e5) / 1e5,
    kclo3: Math.round(t.contents.KClO3 * 1e8) / 1e8,
    kcl: Math.round(t.contents.KCl * 1e8) / 1e8,
    mno2: Math.round(t.contents.MnO2 * 1e8) / 1e8,
    o2: Math.round(t.o2ReleasedMol * 1e8) / 1e8,
    T: Math.round(t.sampleC * 10) / 10,
    riders: w.balance.riders.join(','),
    support: w.objects.tube.support,
  };
}

/** Conversión (0–1) de lo que queda en el tubo: KCl / (KCl + KClO₃). Las pérdidas mecánicas van aparte. */
export function conversion(w: P5World): number {
  const c = w.tube.contents;
  const total = c.KClO3 + c.KCl;
  return total > 0 ? c.KCl / total : 0;
}

/** Sólido perdido por expulsión (g). */
export const expelledG = (w: P5World) => solidsMassG(w.tube.lostMol);

export { isLit, mouthPos };
