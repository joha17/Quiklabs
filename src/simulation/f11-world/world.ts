/**
 * Mundo de F11 — hidrostática, densidad y flotación: paso fijo determinista de 0,05 s con 10 subpasos de 5 ms (§6). La
 * escena solo dibuja este estado y envía hechos geométricos.
 *
 * - Tanque de 60 × 35 × 45 cm con superficie libre horizontal: el nivel es (V_líquido + Σ V_sumergido) / A. Grifo de
 *   agua (A), bomba de salmuera (B) desde el depósito y llave de vaciado a residuos; la mezcla tiene la densidad media de
 *   sus volúmenes. Sobre el borde se derrama (bloqueo) salvo que haya tubo de rebose (F11-S06).
 * - Presión: p = ρ g h con h = nivel − cota de la membrana; con la salmuera estratificada (F11-S10) se integra ρ(z)
 *   lineal hasta que el agitador la homogeniza. El oleaje (vertido, agitador, objetos soltados) suma ρ g η(t).
 * - Sonda de 2/20 kPa con retardo de primer orden (τ 0,4 s; 4 s con burbuja), escala, cero, rango y registrador.
 * - Flotación: cada objeto es un cuerpo vertical de 1 grado de libertad con empuje ρ g V_sub, peso, masa añadida y
 *   amortiguamiento viscoso; choca con el fondo, el hilo tenso lo retiene y un objeto puede quedar apoyado en otro.
 * - Empuje: bloque de aluminio colgado del dinamómetro que el brazo del soporte baja dentro del vaso de rebose; el agua
 *   desplazada sale por el pico (Q = 200 (L − L_pico) cm³/s) al colector o, sin él, a la mesada.
 * - Densidad: probeta de 250 mL llenada del depósito B y balanza de 0,1 g con tara.
 */
import type { F11Command, F11DispatchResult, PpeItem } from './commands';
import type { BalanceItem, CatchPlace, F11Object, F11Params, F11Setup, F11World, FloatId, Pose, ProbeMount, ReadingF11, Volumes } from './types';
import { hashRandom } from '../core/rng';
import { bumpF11, emitF11, errF11, flagF11, gaussF11, rearmErrF11 } from './events';
import {
  FLOATS, canAreaCm2, canState, conservedTotalsF11, massOfObjG, minorityFraction, solidOf, subVolume, sumVol, tankAreaCm2, tankLevel, tankRho, volumeOf,
} from './conservation';
import { quantizeReading } from '../instruments/force-sensor';

export { emitF11, latchF11, rearmF11, bumpF11, flagF11, errF11 } from './events';
export { conservedTotalsF11, tankLevel, tankRho, canState, volumeOf, massOfObjG };

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, num(v, a)));
const DEG = Math.PI / 180;
const r2 = (x: number) => Math.round(x * 100) / 100;
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
const isFloat = (s: unknown): s is FloatId => s === 'float1' || s === 'bottle1' || s === 'alu1';
const BAL_ITEMS: BalanceItem[] = ['float1', 'bottle1', 'alu1', 'cyl', 'catch'];
const isBalItem = (s: unknown): s is BalanceItem => BAL_ITEMS.includes(s as BalanceItem);
/** Holgura de la membrana sobre el fondo (cm): más abajo golpea. */
const FLOOR_GAP = 0.3;
/** Coeficiente de descarga del pico del vaso de rebose (cm²/s): Q = K (L − L_pico). */
const SPOUT_K = 200;

/** Escenarios docentes (§10). */
export const SF11 = {
  FRESH: 'F11-S01_fresh_water',
  SALINE: 'F11-S02_saline_water',
  FLOATING: 'F11-S03_floating_block',
  SINKING: 'F11-S04_sinking_object',
  BUBBLE: 'F11-S05_probe_bubble',
  OVERFLOW: 'F11-S06_overflow_tank',
  GAUGE: 'F11-S07_gauge_sensor',
  ABSOLUTE: 'F11-S08_absolute_sensor',
  PARTIAL: 'F11-S09_partial_immersion',
  PROFILE: 'F11-S10_density_profile',
  STIRRED: 'F11-S11_stirred_tank',
  UNCAL: 'F11-S12_uncalibrated_probe',
} as const;

export interface F11WorldSpec {
  objects: F11Object[];
  scenarios: string[];
  mode: string;
}

// ─────────────────────────── Creación ───────────────────────────

export function createF11World(spec: F11WorldSpec, seed: number, params: F11Params): F11World {
  const has = (s: string) => spec.scenarios.includes(s);
  const objects: Record<string, F11Object> = {};
  for (const o of spec.objects) objects[o.id] = { ...o, pose: { ...o.pose } };
  const h = (k: string) => hashRandom(seed, k) - 0.5;
  const sign = (k: string) => (h(k) > 0 ? 1 : -1);
  const realistic = params.scientificMode === 'REALISTIC';
  const absolute = has(SF11.ABSOLUTE);
  const pr = params.probe;
  const can = params.can;
  const fl = (ballastG = 0) => ({ where: 'rack' as const, x: 30, zb: 0, v: 0, tethered: true, on: null, ballastG, sank: false });
  const w: F11World = {
    timeS: 0, tick: 0, seed, rng: seed >>> 0 || 1, params, mode: spec.mode, objects,
    tank: { vol: { A: 0, B: 0 }, strat: 0, waveUntil: 0, overflowPipe: has(SF11.OVERFLOW), agitatedS: 0 },
    valves: { tap: false, pump: false, drain: false, agitator: has(SF11.STIRRED) },
    resB: params.resB0,
    waste: { A: 0, B: 0 }, spill: { A: 0, B: 0 }, overflow: { A: 0, B: 0 }, supplied: 0,
    probe: {
      mount: 'holder', gx: 30, z: 44, locked: false, driftCm: 0, connected: false, rangeIdx: 0, absolute,
      offset: absolute ? 0 : r3(sign('pS') * pr.offsetKPa * (0.5 + (h('p') + 0.5) * 0.5)), zeroed: false, badZero: false,
      scale: has(SF11.UNCAL) ? 1.08 : realistic ? r4(1 + sign('pk') * (pr.uncalScale - 1) * (0.7 + (h('pk2') + 0.5) * 0.3)) : 1, calibrated: false,
      bubble: false, bubbleArmed: has(SF11.BUBBLE) || (realistic && hashRandom(seed, 'bubble') < pr.bubbleChance), wetted: false, lagKPa: 0, damaged: false, movedAt: -10,
    },
    logger: { rateHz: params.rates[1] ?? 5 },
    series: { id: 1, n: 0, rho0: null, configChanged: false },
    floats: { float1: fl(), bottle1: fl(), alu1: fl() },
    can: { vol: r2(can.initCm * (Math.PI * can.dCm ** 2) / 4), catchAt: 'rack', catchVol: 0, episode: false, catchUnprimed: false, catchSpill: false, catchDripping: false, dripUntil: -10 },
    stand: { zb: 20, target: 20, ref: null, badRef: false, movedAt: -10 },
    dyn: { offset: Math.round(sign('dS') * params.dyn.offsetN * (0.5 + (h('d') + 0.5) * 0.5) / params.dyn.resN) * params.dyn.resN, zeroed: false, aimDeg: 0, holding: false, hungAt: -10 },
    balance: { on: null, offset: Math.round(sign('bS') * params.balance.offsetG * (0.5 + (h('b') + 0.5) * 0.5) * 10) / 10, zeroed: false, taredWith: null, taredEmpty: false },
    cyl: { vol: 0, where: 'rack' },
    trial: 0,
    configVersion: 1,
    readings: {}, readingOrder: [],
    safety: { ppe: { coat: false, goggles: false, shoes: false, hair: false }, block: null, stoppedByTeacher: false },
    events: [], evidence: {}, scenarios: [...spec.scenarios], ppe: false,
    initialTotals: { liquidCm3: 0, massesG: 0 },
  };
  const t0 = conservedTotalsF11(w);
  w.initialTotals = { liquidCm3: t0.liquidCm3, massesG: t0.massesG };
  return w;
}

// ─────────────────────────── Consultas ───────────────────────────

export const levelF11 = (w: F11World) => tankLevel(w);
/** Profundidad de la membrana bajo la superficie (cm; negativa fuera del líquido o en el porta-sonda). */
export const probeDepthF11 = (w: F11World) => (w.probe.mount === 'guide' ? tankLevel(w) - w.probe.z : -1);
export const wavesF11 = (w: F11World) => w.timeS < w.tank.waveUntil;
export const standMovingF11 = (w: F11World) => Math.abs(w.stand.target - w.stand.zb) > 1e-9;
export const floatsMovingF11 = (w: F11World) => FLOATS.some((id) => w.floats[id].where === 'tank' && Math.abs(w.floats[id].v) > 0.05);
export const flowingF11 = (w: F11World) => w.valves.tap || w.valves.pump || w.valves.drain;
export const busyF11 = (w: F11World) => flowingF11(w) || standMovingF11(w) || floatsMovingF11(w);
export const canAreaF11 = canAreaCm2;
/** Qué líquido hay en el tanque. */
export function tankFluidF11(w: F11World): F11Setup['fluid'] {
  const V = sumVol(w.tank.vol);
  if (V < 1) return 'empty';
  if (minorityFraction(w) > 0.02) return 'mix';
  return w.tank.vol.B > w.tank.vol.A ? 'B' : 'A';
}
const wallTouch = (w: F11World) => w.probe.mount === 'guide' && (w.probe.gx < 2 || w.probe.gx > w.params.tank.L - 2);

/** Elevación de la superficie por el oleaje (cm): decae al terminar la perturbación. */
export function waveEtaF11(w: F11World, t: number = w.timeS): number {
  const rem = w.tank.waveUntil - t;
  if (rem <= 0) return 0;
  return w.params.waveAmpCm * Math.min(1, rem / w.params.waveS) * Math.sin(2 * Math.PI * 1.3 * t);
}

/** Presión manométrica verdadera (Pa) a una profundidad h (cm) del tanque con nivel L (cm), con su estratificación. */
export function hydrostaticPa(w: F11World, hCm: number, L: number = tankLevel(w)): number {
  if (!(hCm > 0) || !(L > 0)) return 0;
  const h = Math.min(hCm, L) / 100;
  const Lm = L / 100;
  const rho = tankRho(w);
  const d = w.params.stratDelta * w.tank.strat;
  return w.params.g * (rho * h - (d * h * (Lm - h)) / (2 * Lm));
}

/** Lo que la membrana «ve» (kPa relativos, antes de escala y cero): presión, oleaje, burbuja, pared y golpe. */
function probeTargetKPa(w: F11World): number {
  const pr = w.probe;
  const p = w.params;
  let k = pr.damaged ? p.probe.damageKPa : 0;
  if (pr.mount !== 'guide') return k;
  const L = tankLevel(w);
  const hCm = L - pr.z;
  if (hCm <= 0) return k;
  k += hydrostaticPa(w, hCm, L) / 1000 + (tankRho(w) * p.g * waveEtaF11(w)) / 1e5;
  if (pr.bubble) k += p.probe.bubbleKPa;
  if (wallTouch(w)) k += p.probe.wallKPa;
  return k;
}

const rangeOf = (w: F11World) => (w.probe.absolute ? w.params.probe.absRange : w.params.probe.ranges[w.probe.rangeIdx]);
const resOf = (w: F11World) => (w.probe.absolute ? w.params.probe.absRes : w.params.probe.resolutions[w.probe.rangeIdx]);

/** Lo que muestran las pantallas en vivo (sin ruido, para la vista 3D y la interfaz). */
export function probeDisplayF11(w: F11World): number {
  const pr = w.probe;
  if (!pr.connected) return NaN;
  const shown = pr.scale * pr.lagKPa + pr.offset + (pr.absolute ? w.params.pAtmKPa : 0);
  const range = rangeOf(w);
  return Math.max(-range, Math.min(range, shown));
}
export const probeResF11 = (w: F11World) => resOf(w);
export const probeRangeF11 = (w: F11World) => rangeOf(w);
export function balanceDisplayF11(w: F11World): number {
  return Math.min(w.params.balance.rangeG, balanceLoadG(w) + w.balance.offset);
}
export function dynDisplayF11(w: F11World): number {
  const p = w.params;
  const d = w.dyn;
  if (!d.holding) return Math.max(0, d.offset);
  const W = (massOfObjG(w, 'alu1') / 1000) * p.g;
  const Fb = p.rhoA * p.g * canState(w).sub * 1e-6;
  const T = w.stand.zb <= 0.05 ? 0.1 * (W - Fb) : W - Fb;
  return Math.max(0, Math.min(p.dyn.rangeN * 1.03, T * Math.cos(d.aimDeg * DEG) + d.offset));
}

// ─────────────────────────── Despacho ───────────────────────────

const BEFORE_PPE = new Set<F11Command['type']>(['equipPpe', 'startWork', 'teacherStop', 'acknowledge', 'inspect']);
const DURING_BLOCK = new Set<F11Command['type']>(['acknowledge', 'teacherStop', 'inspect', 'setPose', 'setTap', 'setPump', 'setDrain', 'setAgitator', 'mopSpill', 'recoverObject', 'unhangBlock', 'setStand']);
/** Comandos que cambian la configuración de la sonda (F11-E32 si la serie ya tiene lecturas). */
const CONFIG = new Set<F11Command['type']>(['connectProbe', 'setRange', 'setRate', 'zeroProbe', 'calibrateProbe']);

export function dispatchF11(w: F11World, cmd: F11Command): F11DispatchResult {
  if (!cmd || typeof cmd !== 'object') return { ok: false, code: 'UNKNOWN' };
  if (w.safety.stoppedByTeacher && cmd.type !== 'teacherStop') return { ok: false, code: 'TEACHER_STOP' };
  if (!w.ppe && !BEFORE_PPE.has(cmd.type)) return { ok: false, code: 'PPE' };
  if (w.safety.block && !DURING_BLOCK.has(cmd.type)) return { ok: false, code: 'BLOCKED' };
  const before = w.configVersion;
  const res = route(w, cmd);
  if (res.ok && CONFIG.has(cmd.type)) {
    if (w.configVersion === before) w.configVersion++;
    const s = w.series;
    if (s.n > 0 && !s.configChanged) {
      s.configChanged = true;
      errF11(w, 'E32', 'CONFIG_DURING_SERIES', 'WARN', { cmd: cmd.type });
    }
  }
  return res;
}

function route(w: F11World, cmd: F11Command): F11DispatchResult {
  const p = w.params;
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
    // A — tanque
    case 'setTap':
      return setValve(w, 'tap', !!cmd.on);
    case 'setPump':
      if (cmd.on && w.resB < 1) return { ok: false, code: 'RES_EMPTY' };
      return setValve(w, 'pump', !!cmd.on);
    case 'setDrain':
      return setValve(w, 'drain', !!cmd.on);
    case 'setAgitator':
      w.valves.agitator = !!cmd.on;
      if (cmd.on) wave(w);
      else w.tank.waveUntil = Math.max(w.tank.waveUntil, r6(w.timeS + p.waveS));
      w.trial++;
      emitF11(w, cmd.on ? 'AGITATOR_ON' : 'AGITATOR_OFF', 'INFO');
      return { ok: true };
    case 'mopSpill': {
      const s = sumVol(w.spill);
      if (s < 1e-9) return { ok: true };
      w.waste.A += w.spill.A;
      w.waste.B += w.spill.B;
      w.spill = { A: 0, B: 0 };
      flagF11(w, 'mopped');
      emitF11(w, 'SPILL_MOPPED', 'INFO', { mL: Math.round(s) });
      return { ok: true };
    }
    case 'readLevel':
      return readLevel(w, num(cmd.viewDeg));
    // B — sonda
    case 'mountProbe':
      return mountProbe(w, cmd.where);
    case 'setGuide': {
      const x = Math.round(clamp(cmd.xCm, 0, p.tank.L) * 100) / 100;
      if (x === w.probe.gx) return { ok: true, value: x };
      w.probe.gx = x;
      w.probe.movedAt = w.timeS;
      w.trial++;
      if (wallTouch(w)) emitF11(w, 'PROBE_AT_WALL', 'WARN');
      else rearmErrF11(w, 'E04');
      return { ok: true, value: x };
    }
    case 'setProbeZ':
      return setProbeZ(w, num(cmd.zCm, w.probe.z));
    case 'lockGuide':
      w.probe.locked = !!cmd.on;
      emitF11(w, cmd.on ? 'GUIDE_LOCKED' : 'GUIDE_FREE', 'INFO');
      return { ok: true };
    case 'connectProbe':
      w.probe.connected = !!cmd.on;
      if (cmd.on) {
        rearmErrF11(w, 'E23');
        flagF11(w, 'probeConnected');
      }
      emitF11(w, cmd.on ? 'PROBE_CONNECTED' : 'PROBE_DISCONNECTED', 'INFO');
      return { ok: true };
    case 'setRange': {
      if (w.probe.absolute) return { ok: false, code: 'ABSOLUTE' };
      const i = Math.round(clamp(cmd.idx, 0, p.probe.ranges.length - 1));
      w.probe.rangeIdx = i;
      if (i > 0) rearmErrF11(w, 'E22');
      return { ok: true, value: p.probe.ranges[i] };
    }
    case 'setRate': {
      const hz = Math.round(num(cmd.hz));
      if (!p.rates.includes(hz)) return { ok: false, code: 'BAD_RATE' };
      w.logger.rateHz = hz;
      if (hz >= 20) rearmErrF11(w, 'E24');
      return { ok: true, value: hz };
    }
    case 'zeroProbe':
      return zeroProbe(w);
    case 'calibrateProbe': {
      const pr = w.probe;
      if (!pr.connected) return { ok: false, code: 'NOT_CONNECTED' };
      if (pr.mount !== 'holder') return { ok: false, code: 'NOT_IN_HOLDER' };
      pr.scale = 1;
      pr.calibrated = true;
      rearmErrF11(w, 'E27');
      flagF11(w, 'probeCalibrated');
      emitF11(w, 'PROBE_CALIBRATED', 'INFO', { kPa: 10 });
      return { ok: true };
    }
    case 'purgeProbe': {
      const pr = w.probe;
      if (!(probeDepthF11(w) > 0)) return { ok: false, code: 'NOT_SUBMERGED' };
      const had = pr.bubble;
      pr.bubble = false;
      pr.bubbleArmed = false;
      pr.movedAt = w.timeS;
      rearmErrF11(w, 'E03');
      flagF11(w, 'probePurged');
      emitF11(w, had ? 'BUBBLE_PURGED' : 'PROBE_PURGED', 'INFO');
      return { ok: true };
    }
    case 'newSeries':
      w.series = { id: w.series.id + 1, n: 0, rho0: null, configChanged: false };
      w.trial++;
      rearmErrF11(w, 'E14');
      rearmErrF11(w, 'E32');
      emitF11(w, 'SERIES_STARTED', 'INFO', { n: w.series.id });
      return { ok: true, value: w.series.id };
    case 'readProbe':
      return readProbe(w);
    case 'readRuler':
      return readRuler(w, num(cmd.viewDeg));
    // C — flotación
    case 'setBallast': {
      const g = Math.round(num(cmd.grams, -1));
      if (!p.ballasts.includes(g)) return { ok: false, code: 'BAD_BALLAST' };
      if (w.floats.bottle1.where !== 'rack') return { ok: false, code: 'NOT_ON_RACK' };
      w.floats.bottle1.ballastG = g;
      w.trial++;
      emitF11(w, 'BALLAST_SET', 'INFO', { g });
      return { ok: true, value: g };
    }
    case 'releaseObject':
      if (!isFloat(cmd.id)) return { ok: false, code: 'NO_OBJECT' };
      return releaseObject(w, cmd.id, num(cmd.xCm, 30));
    case 'untieThread': {
      if (!isFloat(cmd.id)) return { ok: false, code: 'NO_OBJECT' };
      const f = w.floats[cmd.id];
      if (!f.tethered) return { ok: true };
      f.tethered = false;
      rearmErrF11(w, 'E09');
      w.trial++;
      emitF11(w, 'THREAD_UNTIED', 'INFO', { id: cmd.id });
      return { ok: true };
    }
    case 'recoverObject':
      if (!isFloat(cmd.id)) return { ok: false, code: 'NO_OBJECT' };
      return recoverObject(w, cmd.id);
    case 'readDraft':
      if (!isFloat(cmd.id)) return { ok: false, code: 'NO_OBJECT' };
      return readDraft(w, cmd.id, num(cmd.viewDeg));
    // D — balanza, probeta y vaso de rebose
    case 'placeOnBalance':
      if (!isBalItem(cmd.item)) return { ok: false, code: 'NO_OBJECT' };
      return placeOnBalance(w, cmd.item);
    case 'clearBalance':
      return clearBalance(w);
    case 'tareBalance': {
      const b = w.balance;
      b.offset = -balanceLoadG(w);
      b.zeroed = true;
      b.taredWith = b.on;
      b.taredEmpty = b.on === null || (b.on === 'cyl' ? w.cyl.vol < 0.5 : b.on === 'catch' ? w.can.catchVol < 0.5 : false);
      rearmErrF11(w, 'E21');
      if (b.taredEmpty && b.on) rearmErrF11(w, 'E10');
      flagF11(w, 'balanceTared');
      emitF11(w, 'BALANCE_TARED', 'INFO', { item: b.on ?? 'empty' });
      return { ok: true };
    }
    case 'readBalance':
      return readBalance(w);
    case 'fillCylinder': {
      const c = w.cyl;
      if (c.vol > 0.5) return { ok: false, code: 'NOT_EMPTY' };
      const n = (w.evidence.__cylFills ?? 0) + 1;
      w.evidence.__cylFills = n;
      const v = Math.round(p.cyl.fillML + (hashRandom(w.seed, `cyl${n}`) - 0.5) * 2 * p.cyl.spreadML * (p.scientificMode === 'REALISTIC' ? 1 : 0.5));
      if (w.resB < v) return { ok: false, code: 'RES_EMPTY' };
      w.resB -= v;
      c.vol = v;
      w.trial++;
      emitF11(w, 'CYLINDER_FILLED', 'INFO');
      return { ok: true };
    }
    case 'emptyCylinder': {
      const c = w.cyl;
      if (c.vol < 1e-9) return { ok: true };
      w.resB += c.vol;
      c.vol = 0;
      w.trial++;
      emitF11(w, 'CYLINDER_EMPTIED', 'INFO');
      return { ok: true };
    }
    case 'readCylinder':
      return readCylinder(w, num(cmd.viewDeg));
    case 'placeCatch':
      return placeCatch(w, cmd.at);
    case 'emptyCatch': {
      const c = w.can;
      if (c.catchAt === 'spout') return { ok: false, code: 'UNDER_SPOUT' };
      w.waste.A += c.catchVol;
      c.catchVol = 0;
      c.catchUnprimed = false;
      c.catchSpill = false;
      c.catchDripping = false;
      rearmErrF11(w, 'E11');
      w.trial++;
      emitF11(w, 'CATCH_EMPTIED', 'INFO');
      return { ok: true };
    }
    case 'primeCan':
      return primeCan(w);
    // E — dinamómetro y soporte
    case 'hangBlock': {
      const a = w.floats.alu1;
      if (w.dyn.holding) return { ok: true };
      if (a.where !== 'rack') return { ok: false, code: 'NOT_ON_RACK' };
      a.where = 'dyn';
      w.dyn.holding = true;
      w.dyn.hungAt = w.timeS;
      w.trial++;
      emitF11(w, 'BLOCK_HUNG', 'INFO');
      return { ok: true };
    }
    case 'unhangBlock': {
      if (!w.dyn.holding) return { ok: true };
      w.dyn.holding = false;
      w.floats.alu1.where = 'rack';
      w.trial++;
      emitF11(w, 'BLOCK_UNHUNG', 'INFO');
      return { ok: true };
    }
    case 'aimDyn':
      w.dyn.aimDeg = Math.round(clamp(cmd.deg, 0, 30) * 10) / 10;
      if (w.dyn.aimDeg < 3) rearmErrF11(w, 'E26');
      return { ok: true, value: w.dyn.aimDeg };
    case 'zeroDyn':
      if (w.dyn.holding) return { ok: false, code: 'LOADED' };
      w.dyn.offset = 0;
      w.dyn.zeroed = true;
      rearmErrF11(w, 'E21');
      flagF11(w, 'dynZeroed');
      emitF11(w, 'DYN_ZEROED', 'INFO');
      return { ok: true };
    case 'setStand': {
      const t = Math.round(clamp(cmd.cm, 0, p.stand.maxCm) * 100) / 100;
      if (Math.abs(t - w.stand.target) < 1e-9) return { ok: true, value: t };
      w.stand.target = t;
      w.trial++;
      return { ok: true, value: t };
    }
    case 'zeroStand': {
      const s = w.stand;
      if (!w.dyn.holding) return { ok: false, code: 'NO_BLOCK' };
      const L0 = w.can.vol / canAreaCm2(w);
      s.ref = s.zb;
      s.badRef = Math.abs(s.zb - L0) > 0.2;
      if (!s.badRef) {
        rearmErrF11(w, 'E21');
        flagF11(w, 'standZeroed');
      }
      emitF11(w, s.badRef ? 'STAND_ZERO_OFF' : 'STAND_ZEROED', s.badRef ? 'WARN' : 'INFO');
      return { ok: true };
    }
    case 'readDyn':
      return readDyn(w, num(cmd.viewDeg));
    case 'readStand':
      return readStand(w, num(cmd.viewDeg));
    // Cierre y seguridad
    case 'closeStation':
      return closeStation(w);
    case 'acknowledge':
      return acknowledge(w);
    case 'teacherStop':
      w.safety.stoppedByTeacher = !!cmd.on;
      if (cmd.on) {
        w.valves.tap = false;
        w.valves.pump = false;
        w.valves.drain = false;
        w.stand.target = w.stand.zb;
      }
      emitF11(w, cmd.on ? 'TEACHER_STOP' : 'TEACHER_RESUME', cmd.on ? 'CRITICAL' : 'INFO');
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

function startWork(w: F11World): F11DispatchResult {
  const missing = (Object.keys(PPE_ERR) as PpeItem[]).filter((k) => !w.safety.ppe[k]);
  if (missing.length) {
    for (const k of missing) {
      bumpF11(w, `err:${PPE_ERR[k][0]}`);
      emitF11(w, PPE_ERR[k][1], 'CRITICAL');
    }
    return { ok: false, code: 'PPE_MISSING' };
  }
  w.ppe = true;
  flagF11(w, 'ppe');
  emitF11(w, 'PPE_OK', 'INFO');
  return { ok: true };
}

function inspect(w: F11World, target: string): F11DispatchResult {
  const o = w.objects[target];
  if (!o) return { ok: false, code: 'NO_OBJECT' };
  flagF11(w, `inspected:${target}`);
  const p = w.params;
  const pr = w.probe;
  const ok = (good: boolean, a: string, b: string, params?: Record<string, number | string>) => emitF11(w, good ? a : b, good ? 'INFO' : 'WARN', params);
  switch (o.kind) {
    case 'tank':
      emitF11(w, 'INSPECT_TANK', 'INFO', { L: p.tank.L, W: p.tank.W, H: p.tank.H, pipe: w.tank.overflowPipe ? 1 : 0 });
      break;
    case 'tap':
      emitF11(w, 'INSPECT_TAP', 'INFO', { Ls: p.flows.tap / 1000 });
      break;
    case 'reservoir':
      emitF11(w, 'INSPECT_RESERVOIR', 'INFO', { L: Math.round(w.resB / 1000) });
      break;
    case 'pump':
      emitF11(w, 'INSPECT_PUMP', 'INFO', { Ls: p.flows.pump / 1000 });
      break;
    case 'drain':
      emitF11(w, 'INSPECT_DRAIN', 'INFO');
      break;
    case 'agitator':
      ok(!w.valves.agitator, 'INSPECT_AGITATOR', 'INSPECT_AGITATOR_ON');
      break;
    case 'scale':
      emitF11(w, 'INSPECT_SCALE', 'INFO', { mm: p.levelResCm * 10 });
      break;
    case 'guide':
      ok(pr.locked, 'INSPECT_GUIDE', 'INSPECT_GUIDE_FREE');
      break;
    case 'probe':
      if (pr.absolute) emitF11(w, 'INSPECT_PROBE_ABS', 'WARN', { kPa: p.probe.absRange });
      else if (pr.bubble) emitF11(w, 'INSPECT_PROBE_BUBBLE', 'WARN');
      else ok(pr.calibrated && !pr.damaged, 'INSPECT_PROBE', 'INSPECT_PROBE_UNCAL', { kPa: p.probe.ranges[p.probe.ranges.length - 1], res: p.probe.resolutions[p.probe.resolutions.length - 1] * 1000 });
      break;
    case 'ruler':
      emitF11(w, 'INSPECT_RULER', 'INFO', { mm: p.rulerResCm * 10 });
      break;
    case 'holder':
      emitF11(w, 'INSPECT_HOLDER', 'INFO');
      break;
    case 'logger':
      ok(w.logger.rateHz >= 20, 'INSPECT_LOGGER', 'INSPECT_LOGGER_LOW', { hz: w.logger.rateHz });
      break;
    case 'floater':
      emitF11(w, 'INSPECT_FLOATER', 'INFO', { V: Math.round(volumeOf(w, 'float1')), H: p.block.H, mat: p.block.rho > 1000 ? 'pvc' : 'wood' });
      break;
    case 'bottle':
      emitF11(w, 'INSPECT_BOTTLE', 'INFO', { V: Math.round(volumeOf(w, 'bottle1') * 10) / 10, H: p.bottle.H });
      break;
    case 'block':
      emitF11(w, 'INSPECT_BLOCK', 'INFO', { V: Math.round(volumeOf(w, 'alu1')) });
      break;
    case 'ballast':
      emitF11(w, 'INSPECT_BALLAST', 'INFO', { max: p.ballasts[p.ballasts.length - 1] });
      break;
    case 'rack':
      emitF11(w, 'INSPECT_RACK', 'INFO');
      break;
    case 'balance':
      ok(w.balance.zeroed, 'INSPECT_BALANCE', 'INSPECT_BALANCE_OFF', { kg: p.balance.rangeG / 1000, res: p.balance.resG });
      break;
    case 'cylinder':
      emitF11(w, 'INSPECT_CYLINDER', 'INFO', { mL: p.cyl.capML, res: p.cyl.resML });
      break;
    case 'can':
      emitF11(w, 'INSPECT_CAN', 'INFO', { d: p.can.dCm, spout: p.can.spoutCm });
      break;
    case 'catch':
      emitF11(w, 'INSPECT_CATCH', 'INFO');
      break;
    case 'dynamometer':
      ok(w.dyn.zeroed, 'INSPECT_DYN', 'INSPECT_DYN_OFF', { range: p.dyn.rangeN, res: p.dyn.resN });
      break;
    case 'stand':
      emitF11(w, 'INSPECT_STAND', 'INFO', { mm: p.standResCm * 10 });
      break;
    case 'towel':
      emitF11(w, 'INSPECT_TOWEL', 'INFO');
      break;
    case 'waste':
      emitF11(w, 'INSPECT_WASTE', 'INFO');
      break;
    default:
      emitF11(w, 'INSPECTED', 'INFO', { target });
  }
  return { ok: true };
}

const POSE_SUPPORTS = new Set(['bench', 'rack', 'hand', 'holder01']);

function setPose(w: F11World, id: string, pose: Pose, support?: string): F11DispatchResult {
  const o = w.objects[id];
  if (!o) return { ok: false, code: 'NO_OBJECT' };
  if (!o.movable) return { ok: false, code: 'FIXED' };
  if (!pose || ![pose.x, pose.y, pose.z].every((v) => Number.isFinite(v))) return { ok: false, code: 'BAD_POSE' };
  if (support && support !== o.support && !POSE_SUPPORTS.has(support)) return { ok: false, code: 'NO_SEAT' };
  if (isFloat(id) && w.floats[id].where !== 'rack') return { ok: false, code: 'NO_SEAT' };
  o.pose = { x: pose.x, y: pose.y, z: pose.z, rotationRad: num(pose.rotationRad) };
  if (support) o.support = support;
  return { ok: true };
}

// ─────────────────────────── Tanque ───────────────────────────

const wave = (w: F11World, s: number = w.params.waveS) => {
  w.tank.waveUntil = Math.max(w.tank.waveUntil, r6(w.timeS + s));
};

function setValve(w: F11World, k: 'tap' | 'pump' | 'drain', on: boolean): F11DispatchResult {
  if (w.valves[k] === on) return { ok: true };
  w.valves[k] = on;
  wave(w);
  w.trial++;
  const code = { tap: ['TAP_OPEN', 'TAP_CLOSED'], pump: ['PUMP_ON', 'PUMP_OFF'], drain: ['DRAIN_OPEN', 'DRAIN_CLOSED'] }[k][on ? 0 : 1];
  emitF11(w, code, 'INFO', { L: r2(tankLevel(w)) });
  return { ok: true };
}

/** Saca un volumen del tanque repartido según la composición (cm³) y lo devuelve por líquido. */
function takeFromTank(w: F11World, v: number): Volumes {
  const V = sumVol(w.tank.vol);
  if (V <= 1e-12 || v <= 0) return { A: 0, B: 0 };
  const k = Math.min(1, v / V);
  const out = { A: w.tank.vol.A * k, B: w.tank.vol.B * k };
  w.tank.vol.A -= out.A;
  w.tank.vol.B -= out.B;
  if (sumVol(w.tank.vol) < 1e-6) w.tank.vol = { A: 0, B: 0 };
  return out;
}

const addTo = (dst: Volumes, v: Volumes) => {
  dst.A += v.A;
  dst.B += v.B;
};

function stepTank(w: F11World, h: number) {
  const p = w.params;
  const T = w.tank;
  const V0 = sumVol(T.vol);
  if (w.valves.tap) {
    const add = p.flows.tap * h;
    T.vol.A += add;
    w.supplied += add;
    wave(w);
  }
  if (w.valves.pump) {
    const add = Math.min(w.resB, p.flows.pump * h);
    w.resB -= add;
    T.vol.B += add;
    wave(w);
    // La salmuera del depósito sale estratificada (F11-S10): el tanque hereda el perfil hasta agitarlo.
    if (w.scenarios.includes(SF11.PROFILE) && add > 0) {
      T.strat = 1;
      T.agitatedS = 0;
    }
    if (w.resB < 1e-9) {
      w.valves.pump = false;
      emitF11(w, 'RES_EMPTY', 'WARN');
    }
  }
  if (w.valves.drain) {
    addTo(w.waste, takeFromTank(w, p.flows.drain * h));
    if (V0 > 0 && sumVol(T.vol) < 1e-9) emitF11(w, 'TANK_EMPTY', 'INFO');
  }
  if (w.valves.agitator) {
    if (sumVol(T.vol) > 1) wave(w);
    T.agitatedS += h;
    T.strat *= Math.exp(-h / p.agitateTauS);
    if (T.strat < 0.01) T.strat = 0;
  }
  if (sumVol(T.vol) < 1e-9) T.strat = 0;
  // Superficie sobre el borde: rebose por el tubo (F11-S06) o derrame sobre la mesada (bloqueo, F11-E11).
  const L = tankLevel(w);
  const lim = T.overflowPipe ? p.tank.overflowCm : p.tank.H;
  if (L > lim) {
    const out = takeFromTank(w, (L - lim) * tankAreaCm2(w));
    if (T.overflowPipe) addTo(w.overflow, out);
    else {
      addTo(w.spill, out);
      if (!w.safety.block) {
        bumpF11(w, 'tankSpill');
        errF11(w, 'E11', 'TANK_SPILLED', 'CRITICAL');
        w.safety.block = { code: 'TANK_SPILL', since: w.timeS };
      }
    }
  }
  // Mezcla de líquidos sin vaciar (F11-E05): se cuenta una vez por llenado.
  if (sumVol(T.vol) > 2000 && minorityFraction(w) > 0.02) errF11(w, 'E05', 'FLUIDS_MIXED', 'WARN', { pct: Math.round(minorityFraction(w) * 100) });
  if (sumVol(T.vol) < 100) rearmErrF11(w, 'E05');
}

// ─────────────────────────── Sonda ───────────────────────────

function mountProbe(w: F11World, where: ProbeMount): F11DispatchResult {
  if (where !== 'holder' && where !== 'guide') return { ok: false, code: 'UNKNOWN' };
  const pr = w.probe;
  if (pr.mount === where) return { ok: true };
  pr.mount = where;
  pr.movedAt = w.timeS;
  pr.driftCm = 0;
  if (where === 'guide') pr.z = Math.max(pr.z, Math.min(44, tankLevel(w) + 2));
  w.trial++;
  emitF11(w, where === 'guide' ? 'PROBE_IN_GUIDE' : 'PROBE_IN_HOLDER', 'INFO');
  return { ok: true };
}

function probeImpact(w: F11World) {
  const pr = w.probe;
  pr.z = FLOOR_GAP;
  if (!pr.damaged) {
    pr.damaged = true;
    bumpF11(w, 'probeImpact');
    emitF11(w, 'PROBE_IMPACT', 'CRITICAL');
  }
}

function setProbeZ(w: F11World, zCm: number): F11DispatchResult {
  const pr = w.probe;
  if (pr.mount !== 'guide') return { ok: false, code: 'NOT_IN_GUIDE' };
  const z = Math.round(clamp(zCm, 0, 44) * 100) / 100;
  if (Math.abs(z - pr.z) < 1e-9 && pr.driftCm === 0) return { ok: true, value: z };
  pr.z = z;
  pr.driftCm = 0;
  rearmErrF11(w, 'E28');
  pr.movedAt = w.timeS;
  w.trial++;
  if (z < FLOOR_GAP) probeImpact(w);
  return { ok: true, value: pr.z };
}

function zeroProbe(w: F11World): F11DispatchResult {
  const pr = w.probe;
  if (pr.absolute) return { ok: false, code: 'ABSOLUTE' };
  if (!pr.connected) return { ok: false, code: 'NOT_CONNECTED' };
  const h = probeDepthF11(w);
  const inAir = h <= 0;
  pr.badZero = !(inAir || h <= 0.3);
  // Re-referenciar en el aire asienta la membrana golpeada (F11-E39).
  if (pr.damaged && inAir) {
    pr.damaged = false;
    rearmErrF11(w, 'E39');
    emitF11(w, 'PROBE_REPAIRED', 'INFO');
  }
  pr.offset = r6(-pr.scale * probeTargetKPa(w));
  pr.zeroed = true;
  if (!pr.badZero) {
    rearmErrF11(w, 'E01');
    flagF11(w, 'probeZeroed');
  }
  emitF11(w, pr.badZero ? 'PROBE_ZEROED_SUBMERGED' : 'PROBE_ZEROED', pr.badZero ? 'WARN' : 'INFO');
  return { ok: true };
}

function stepProbe(w: F11World, h: number) {
  const pr = w.probe;
  const p = w.params;
  if (pr.mount === 'guide' && !pr.locked && pr.z > FLOOR_GAP) {
    // Guía floja: la varilla baja por su peso (F11-E28).
    const dz = Math.min(pr.z - FLOOR_GAP + 1e-9, p.probe.driftCmS * h);
    pr.z = r6(pr.z - dz);
    pr.driftCm = r6(pr.driftCm + dz);
    if (pr.z <= FLOOR_GAP + 1e-9) probeImpact(w);
  }
  const submerged = probeDepthF11(w) > 0;
  if (submerged && !pr.wetted) {
    pr.wetted = true;
    if (pr.bubbleArmed) pr.bubble = true;
  }
  const target = probeTargetKPa(w);
  const tau = pr.bubble && submerged ? p.probe.bubbleTauS : p.probe.tauS;
  pr.lagKPa = pr.lagKPa + (target - pr.lagKPa) * (1 - Math.exp(-h / tau));
}

// ─────────────────────────── Flotación ───────────────────────────

const footprint = (w: F11World, id: FloatId) => solidOf(w, id).footprint;
const rootOf = (w: F11World, id: FloatId): FloatId => {
  let r = id;
  for (let i = 0; i < 4 && w.floats[r].on; i++) r = w.floats[r].on!;
  return r;
};
const stackOn = (w: F11World, id: FloatId) => FLOATS.filter((o) => o !== id && w.floats[o].where === 'tank' && w.floats[o].on === id);

function releaseObject(w: F11World, id: FloatId, xCm: number): F11DispatchResult {
  const f = w.floats[id];
  if (f.where === 'tank') return { ok: true };
  if (f.where !== 'rack') return { ok: false, code: 'NOT_ON_RACK' };
  const p = w.params;
  w.trial++;
  if (!(xCm >= 0 && xCm <= p.tank.L)) {
    // Soltado fuera del tanque: cae a la mesada y no desplaza líquido (F11-E17).
    f.where = 'bench';
    f.v = 0;
    errF11(w, 'E17', 'OBJECT_OUTSIDE', 'WARN', { id });
    return { ok: true };
  }
  const fp = footprint(w, id);
  f.x = Math.round(clamp(xCm, fp / 2 + 0.5, p.tank.L - fp / 2 - 0.5) * 100) / 100;
  f.where = 'tank';
  f.v = 0;
  f.sank = false;
  f.on = null;
  const L = tankLevel(w);
  // ¿Cae sobre otro objeto? (F11-E15): queda apoyado en su cara superior.
  const under = FLOATS.find((o) => o !== id && w.floats[o].where === 'tank' && Math.abs(w.floats[o].x - f.x) < (fp + footprint(w, o)) / 2 && stackOn(w, o).length === 0);
  if (under) {
    f.on = under;
    f.zb = w.floats[under].zb + solidOf(w, under).H;
    emitF11(w, 'OBJECT_STACKED', 'WARN', { id, on: under });
  } else {
    f.zb = Math.max(0, L);
    emitF11(w, 'OBJECT_RELEASED', 'INFO', { id });
  }
  wave(w);
  return { ok: true };
}

function recoverObject(w: F11World, id: FloatId): F11DispatchResult {
  const f = w.floats[id];
  if (f.where === 'rack') return { ok: true };
  if (f.where !== 'tank' && f.where !== 'bench') return { ok: false, code: 'NOT_FREE' };
  const wasTank = f.where === 'tank';
  for (const o of stackOn(w, id)) w.floats[o].on = null;
  f.where = 'rack';
  f.tethered = true;
  f.on = null;
  f.v = 0;
  f.zb = 0;
  f.sank = false;
  if (wasTank) wave(w);
  w.trial++;
  emitF11(w, 'OBJECT_RECOVERED', 'INFO', { id });
  return { ok: true };
}

/** Amortiguamiento relativo de la flotación según la viscosidad del líquido. */
const zetaOf = (w: F11World) => 0.35 * Math.pow(Math.max(1e-4, w.params.viscosity) / 0.001, 0.25);

function stepFloats(w: F11World, t: number, h: number) {
  const p = w.params;
  const rho = tankRho(w);
  const L = tankLevel(w);
  for (const id of FLOATS) {
    const f = w.floats[id];
    if (f.where !== 'tank' || f.on) continue;
    const bodies = [id, ...stackOn(w, id)];
    let F = 0;
    let m = 0;
    for (const b of bodies) {
      const mb = massOfObjG(w, b) / 1000;
      m += mb;
      F += rho * p.g * subVolume(w, b, L) * 1e-6 - mb * p.g;
    }
    const s = solidOf(w, id);
    const sub = subVolume(w, id, L);
    const mEff = m + 0.5 * rho * sub * 1e-6;
    const k = Math.max(1e-6, rho * p.g * s.area * 1e-4);
    const c = 2 * zetaOf(w) * Math.sqrt(k * mEff);
    // Hilo tenso (F11-E09): la mano lo sostiene con la base 1 cm bajo la superficie.
    const a = (F - (c * f.v) / 100) / mEff;
    f.v += a * 100 * h;
    f.zb += f.v * h;
    if (f.tethered && f.zb < L - 1) {
      f.zb = L - 1;
      if (f.v < 0) f.v = 0;
    }
    if (f.zb <= 0) {
      f.zb = 0;
      if (f.v < 0) f.v = 0;
      if (F < 0 && !f.sank) {
        f.sank = true;
        flagF11(w, `sank:${id}`);
        emitF11(w, 'OBJECT_SANK', 'INFO', { id });
      }
    } else if (f.zb > 0.05) f.sank = false;
    if (Math.abs(f.v) > 2) wave(w, 1);
    let top = f.zb + s.H;
    for (const b of bodies.slice(1)) {
      w.floats[b].zb = top;
      w.floats[b].v = f.v;
      top += solidOf(w, b).H;
    }
  }
  void t;
}

// ─────────────────────────── Vaso de rebose y soporte ───────────────────────────

function primeCan(w: F11World): F11DispatchResult {
  const c = w.can;
  const p = w.params;
  if (c.catchAt === 'spout') return { ok: false, code: 'CATCH_UNDER_SPOUT' };
  const Ac = canAreaCm2(w);
  // Volumen que deja el nivel en el pico con el bloque como esté (búsqueda binaria: el nivel crece con el volumen).
  let lo = 0;
  let hi = Ac * (p.can.spoutCm + 5);
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (canState(w, mid).level < p.can.spoutCm) lo = mid;
    else hi = mid;
  }
  const target = (lo + hi) / 2;
  // Se vierte hasta que rebosa: el excedente gotea por el pico a la bandeja durante unos segundos.
  const extra = 24;
  const add = Math.max(0, target + extra - c.vol);
  c.vol += add;
  w.supplied += add;
  c.dripUntil = r6(w.timeS + 4);
  w.trial++;
  flagF11(w, 'canPrimed');
  emitF11(w, 'CAN_PRIMED', 'INFO');
  return { ok: true };
}

function placeCatch(w: F11World, at: CatchPlace): F11DispatchResult {
  const c = w.can;
  if (!['rack', 'spout', 'balance'].includes(at)) return { ok: false, code: 'UNKNOWN' };
  if (c.catchAt === at) return { ok: true };
  if (at === 'balance') return placeOnBalance(w, 'catch');
  if (c.catchAt === 'spout' && canState(w).level > w.params.can.spoutCm + 0.02) c.catchDripping = true;
  if (c.catchAt === 'balance') w.balance.on = null;
  c.catchAt = at;
  w.trial++;
  emitF11(w, at === 'spout' ? 'CATCH_AT_SPOUT' : 'CATCH_AWAY', 'INFO');
  return { ok: true };
}

function stepCan(w: F11World, t: number, h: number) {
  const p = w.params;
  const s = w.stand;
  const du = s.target - s.zb;
  if (Math.abs(du) > 1e-12) {
    const step = Math.min(Math.abs(du), p.stand.speedCmS * h);
    s.zb = r6(s.zb + Math.sign(du) * step);
    if (Math.abs(s.target - s.zb) < 1e-9) s.zb = s.target;
    s.movedAt = r6(t + h);
  }
  const c = w.can;
  const st = canState(w);
  const sp = p.can.spoutCm;
  if (st.level > sp + 1e-9) {
    const out = Math.min(SPOUT_K * (st.level - sp) * h, Math.max(0, c.vol - canVolForLevel(w, sp)));
    c.vol -= out;
    if (c.catchAt === 'spout') c.catchVol += out;
    else if (t < c.dripUntil) w.waste.A += out;
    else {
      w.spill.A += out;
      if (c.episode && out > 0.05) {
        c.catchSpill = true;
        errF11(w, 'E11', 'OVERFLOW_SPILLED', 'WARN');
      }
    }
  }
  const st2 = canState(w);
  if (st2.sub > 0.5 && !c.episode) {
    c.episode = true;
    // La inmersión empieza con el vaso sin cebar: lo desplazado primero llena el vaso (F11-E11).
    if (c.vol / canAreaCm2(w) < sp - 0.05) {
      c.catchUnprimed = true;
      emitF11(w, 'CAN_NOT_PRIMED', 'WARN');
    }
  } else if (st2.sub <= 0.5 && c.episode) c.episode = false;
}

/** Volumen del vaso que deja el nivel en L con el bloque como está. */
function canVolForLevel(w: F11World, L: number): number {
  let lo = 0;
  let hi = canAreaCm2(w) * (L + 6);
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (canState(w, mid).level < L) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// ─────────────────────────── Balanza ───────────────────────────

/** Carga real del plato (g). */
function balanceLoadG(w: F11World): number {
  const p = w.params;
  const it = w.balance.on;
  if (!it) return 0;
  if (it === 'cyl') return p.cyl.dryG + (w.cyl.vol * p.rhoB) / 1000;
  if (it === 'catch') return p.catchDryG + (w.can.catchVol * p.rhoA) / 1000;
  return massOfObjG(w, it);
}

function placeOnBalance(w: F11World, item: BalanceItem): F11DispatchResult {
  const b = w.balance;
  if (b.on === item) return { ok: true };
  if (b.on) return { ok: false, code: 'BALANCE_BUSY' };
  if (isFloat(item)) {
    if (w.floats[item].where !== 'rack') return { ok: false, code: 'NOT_ON_RACK' };
    w.floats[item].where = 'balance';
  } else if (item === 'cyl') w.cyl.where = 'balance';
  else {
    const c = w.can;
    if (c.catchAt === 'spout' && canState(w).level > w.params.can.spoutCm + 0.02) c.catchDripping = true;
    c.catchAt = 'balance';
  }
  b.on = item;
  w.trial++;
  emitF11(w, 'ON_BALANCE', 'INFO', { item });
  return { ok: true };
}

function clearBalance(w: F11World): F11DispatchResult {
  const b = w.balance;
  if (!b.on) return { ok: true };
  if (isFloat(b.on)) w.floats[b.on].where = 'rack';
  else if (b.on === 'cyl') w.cyl.where = 'rack';
  else w.can.catchAt = 'rack';
  b.on = null;
  w.trial++;
  emitF11(w, 'BALANCE_CLEARED', 'INFO');
  return { ok: true };
}

// ─────────────────────────── Lecturas ───────────────────────────

const PREFIX: Record<ReadingF11['kind'], string> = { pressure: 'p', ruler: 'z', level: 'l', draft: 'd', weight: 'w', mass: 'm', volume: 'v', immersion: 'i' };

function addReading(w: F11World, r: Omit<ReadingF11, 'id' | 't' | 'tick' | 'trialId' | 'configVersion'> & { configVersion?: number }): ReadingF11 {
  const n = w.readingOrder.length + 1;
  const reading: ReadingF11 = { ...r, configVersion: r.configVersion ?? w.configVersion, id: `${PREFIX[r.kind]}${n}`, trialId: `T${w.trial}`, t: w.timeS, tick: w.tick };
  if (!Number.isFinite(reading.value)) reading.valid = false;
  if (!Number.isFinite(reading.trueValue)) reading.trueValue = 0;
  w.readings[reading.id] = reading;
  w.readingOrder.push(reading.id);
  return reading;
}

const quant = quantizeReading;

const FLAG_ERR: Record<string, [string, string]> = {
  NO_ZERO: ['E01', 'PROBE_NOT_ZEROED'],
  BUBBLE: ['E03', 'PROBE_BUBBLE'],
  WALL: ['E04', 'PROBE_ON_WALL'],
  MIXED: ['E05', 'FLUIDS_MIXED'],
  ON_BOTTOM: ['E08', 'BLOCK_ON_BOTTOM'],
  TETHERED: ['E09', 'OBJECT_TETHERED'],
  NOT_TARED: ['E10', 'CONTAINER_NOT_TARED'],
  NOT_PRIMED: ['E11', 'CAN_NOT_PRIMED'],
  SPILL: ['E11', 'OVERFLOW_SPILLED'],
  WAVES: ['E12', 'READ_DURING_WAVES'],
  RHO_CHANGED: ['E14', 'DENSITY_CHANGED'],
  STACKED: ['E15', 'OBJECT_STACKED'],
  MOVING: ['E19', 'BODY_MOVING'],
  NOT_ZEROED: ['E21', 'NOT_ZEROED'],
  CLIPPED: ['E22', 'SENSOR_SATURATED'],
  UNPLUGGED: ['E23', 'NO_SIGNAL'],
  LOW_RATE: ['E24', 'LOW_RATE'],
  OCCLUDED: ['E25', 'SCALE_OCCLUDED'],
  OBLIQUE: ['E26', 'DYN_OBLIQUE'],
  UNCALIBRATED: ['E27', 'PROBE_UNCALIBRATED'],
  DRIFT: ['E28', 'GUIDE_DRIFT'],
  PARALLAX: ['E29', 'SCALE_PARALLAX'],
  UNSTABLE: ['E30', 'READ_BEFORE_STABLE'],
  CONFIG_CHANGED: ['E32', 'CONFIG_DURING_SERIES'],
  POST_IMPACT: ['E39', 'READ_AFTER_IMPACT'],
};

const raiseFlags = (w: F11World, qf: string[], inst: string) => {
  for (const f of qf) {
    if (!FLAG_ERR[f]) continue;
    errF11(w, FLAG_ERR[f][0], FLAG_ERR[f][1], 'WARN', { inst });
    // Por instrumento, para que la rúbrica sepa cuál se operó mal (F11-E21 vale para varios).
    bumpF11(w, `inst:${inst}:${FLAG_ERR[f][0]}`);
  }
};

/** Copia del montaje del tanque (con la verdad solo para el docente). */
function tankSetup(w: F11World): F11Setup {
  const L = tankLevel(w);
  return {
    fluid: tankFluidF11(w), level: r4(L), z: r4(w.probe.z), gx: w.probe.gx, sensor: w.probe.absolute ? 'absolute' : 'gauge', range: rangeOf(w), rateHz: w.logger.rateHz, series: w.series.id,
    trueRho: r4(tankRho(w)), trueH: r4(w.probe.mount === 'guide' ? L - w.probe.z : -1), strat: r4(w.tank.strat),
  };
}

const parallax = (viewDeg: number, res: number, k: number, flags: string[]) => {
  if (Math.abs(viewDeg) <= 8) return 0;
  flags.push('PARALLAX');
  return Math.sign(viewDeg) * k * res;
};

function readProbe(w: F11World): F11DispatchResult {
  const p = w.params;
  const pr = w.probe;
  const flags: string[] = [];
  const hCm = probeDepthF11(w);
  const submerged = hCm > 0;
  const res = resOf(w);
  const range = rangeOf(w);
  const target = probeTargetKPa(w);
  if (!pr.connected) flags.push('UNPLUGGED');
  if (pr.mount === 'holder') flags.push('IN_AIR');
  if (pr.absolute) flags.push('ABSOLUTE');
  else if (!pr.zeroed || pr.badZero) flags.push('NO_ZERO');
  if (!pr.calibrated) flags.push('UNCALIBRATED');
  if (submerged && pr.bubble) flags.push('BUBBLE');
  if (wallTouch(w)) flags.push('WALL');
  if (pr.damaged) flags.push('POST_IMPACT');
  if (Math.abs(target - pr.lagKPa) > Math.max(res, 0.005)) flags.push('UNSTABLE');
  if (submerged && wavesF11(w)) flags.push('WAVES');
  if (pr.mount === 'guide' && pr.driftCm > 0.05) flags.push('DRIFT');
  if (submerged && tankFluidF11(w) === 'mix') flags.push('MIXED');
  if (submerged && w.tank.strat > 0.05) flags.push('STRATIFIED');
  if (w.logger.rateHz < 20) flags.push('LOW_RATE');
  if (w.series.configChanged) flags.push('CONFIG_CHANGED');
  const rho = tankRho(w);
  if (submerged && w.series.rho0 !== null && Math.abs(rho - w.series.rho0) > 2) flags.push('RHO_CHANGED');
  // El registrador promedia 1 s de muestras: el ruido baja con √(n); a baja frecuencia el oleaje se cuela sin promediar.
  let shown = pr.scale * pr.lagKPa + pr.offset + (pr.absolute ? p.pAtmKPa : 0);
  shown += gaussF11(w) * p.probe.noiseKPa * Math.sqrt(20 / w.logger.rateHz) * p.noiseFactor;
  if (flags.includes('WAVES')) shown += gaussF11(w) * 0.03 * (w.logger.rateHz < 20 ? 2 : 1);
  if (Math.abs(shown) > range) {
    shown = Math.sign(shown) * range;
    flags.push('CLIPPED');
  }
  const qf = [...new Set(flags)];
  raiseFlags(w, qf, 'probe01');
  const value = pr.connected ? quant(shown, res) : NaN;
  const truth = (submerged ? hydrostaticPa(w, hCm) / 1000 : 0) + (pr.absolute ? p.pAtmKPa : 0);
  w.series.n++;
  if (submerged && w.series.rho0 === null) w.series.rho0 = rho;
  const r = addReading(w, {
    kind: 'pressure', instrumentId: 'probe01', value, unit: 'kPa', resolution: res, uncertainty: p.uB.probeKPa, sourceObjectIds: ['probe01', 'logger01', 'tank01'], qualityFlags: qf, trueValue: truth,
    target: submerged ? 'tank' : 'surface', series: w.series.id, fluid: tankFluidF11(w), setup: tankSetup(w),
  });
  emitF11(w, 'PROBE_READ', qf.some((f) => FLAG_ERR[f]) ? 'WARN' : 'INFO', { kPa: value });
  return { ok: true, id: r.id, value };
}

function readRuler(w: F11World, viewDeg: number): F11DispatchResult {
  const pr = w.probe;
  if (pr.mount !== 'guide') return { ok: false, code: 'NOT_IN_GUIDE' };
  const p = w.params;
  const flags: string[] = [];
  let shown = pr.z + parallax(viewDeg, p.rulerResCm, 3, flags);
  if (pr.driftCm > 0.05) flags.push('DRIFT');
  const qf = [...new Set(flags)];
  raiseFlags(w, qf, 'ruler01');
  shown = quant(shown, p.rulerResCm);
  const r = addReading(w, {
    kind: 'ruler', instrumentId: 'ruler01', value: shown, unit: 'cm', resolution: p.rulerResCm, uncertainty: p.uB.rulerCm, sourceObjectIds: ['ruler01', 'probe01'], qualityFlags: qf, trueValue: pr.z,
    target: 'probe', series: w.series.id, fluid: tankFluidF11(w), setup: tankSetup(w),
  });
  emitF11(w, 'RULER_READ', qf.length ? 'WARN' : 'INFO', { cm: shown });
  return { ok: true, id: r.id, value: shown };
}

function readLevel(w: F11World, viewDeg: number): F11DispatchResult {
  const p = w.params;
  const flags: string[] = [];
  const L = tankLevel(w);
  let shown = L + parallax(viewDeg, p.levelResCm, 3, flags);
  if (wavesF11(w) && L > 0) {
    flags.push('WAVES');
    shown += waveEtaF11(w) + gaussF11(w) * 0.1;
  }
  // El carro de la guía tapa la escala impresa (F11-E25): se lee el borde del carro, 4 mm por encima.
  if (w.probe.gx < 8) {
    flags.push('OCCLUDED');
    shown += 0.4;
  }
  const qf = [...new Set(flags)];
  raiseFlags(w, qf, 'scale01');
  const value = quant(Math.max(0, shown), p.levelResCm);
  const r = addReading(w, {
    kind: 'level', instrumentId: 'scale01', value, unit: 'cm', resolution: p.levelResCm, uncertainty: p.uB.levelCm, sourceObjectIds: ['scale01', 'tank01'], qualityFlags: qf, trueValue: L,
    target: 'tank', fluid: tankFluidF11(w), setup: tankSetup(w),
  });
  emitF11(w, 'LEVEL_READ', qf.length ? 'WARN' : 'INFO', { cm: value });
  return { ok: true, id: r.id, value };
}

function readDraft(w: F11World, id: FloatId, viewDeg: number): F11DispatchResult {
  const f = w.floats[id];
  if (f.where !== 'tank') return { ok: false, code: 'NOT_IN_TANK' };
  const p = w.params;
  const s = solidOf(w, id);
  const L = tankLevel(w);
  const tv = Math.max(0, Math.min(s.H, L - f.zb));
  const flags: string[] = [];
  let shown = tv + parallax(viewDeg, p.draftResCm, 3, flags);
  if (wavesF11(w)) {
    flags.push('WAVES');
    shown += waveEtaF11(w);
  }
  if (Math.abs(f.v) > 0.05) flags.push('MOVING');
  if (f.on || stackOn(w, id).length) flags.push('STACKED');
  if (f.tethered) flags.push('TETHERED');
  if (tv >= s.H - 1e-6) flags.push('SUBMERGED');
  if (f.sank) flags.push('SANK');
  const qf = [...new Set(flags)];
  raiseFlags(w, qf, 'draft01');
  const value = quant(Math.max(0, Math.min(s.H, shown)), p.draftResCm);
  const r = addReading(w, {
    kind: 'draft', instrumentId: 'draft01', value, unit: 'cm', resolution: p.draftResCm, uncertainty: p.uB.draftCm, sourceObjectIds: [id, 'tank01'], qualityFlags: qf, trueValue: tv,
    target: id, fluid: tankFluidF11(w), setup: tankSetup(w), ballastG: id === 'bottle1' ? f.ballastG : undefined,
  });
  emitF11(w, 'DRAFT_READ', qf.some((x) => FLAG_ERR[x]) ? 'WARN' : 'INFO', { id, cm: value });
  return { ok: true, id: r.id, value };
}

function readDyn(w: F11World, viewDeg: number): F11DispatchResult {
  const p = w.params;
  const d = w.dyn;
  const flags: string[] = [];
  const st = canState(w);
  const W = (massOfObjG(w, 'alu1') / 1000) * p.g;
  const Fb = d.holding ? p.rhoA * p.g * st.sub * 1e-6 : 0;
  // Bloque apoyado en el fondo del vaso (F11-E08): el hilo se afloja y el dinamómetro marca casi nada.
  const onBottom = d.holding && w.stand.zb <= 0.05;
  const T = d.holding ? (onBottom ? 0.1 * (W - Fb) : W - Fb) : 0;
  let shown = T * Math.cos(d.aimDeg * DEG) + d.offset;
  if (!d.holding) flags.push('EMPTY');
  if (onBottom) flags.push('ON_BOTTOM');
  if (d.aimDeg >= 3 && d.holding) flags.push('OBLIQUE');
  if (!d.zeroed) flags.push('NOT_ZEROED');
  if (d.holding && w.timeS - d.hungAt < p.settleS) {
    flags.push('UNSTABLE');
    shown += gaussF11(w) * 0.2 * Math.max(0.2, 1 - (w.timeS - d.hungAt) / p.settleS);
  }
  if (d.holding && (standMovingF11(w) || w.timeS - w.stand.movedAt < p.settleS)) {
    flags.push('MOVING');
    shown += gaussF11(w) * 0.15;
  }
  shown += parallax(viewDeg, p.dyn.resN, 2, flags);
  if (shown > p.dyn.rangeN) {
    shown = p.dyn.rangeN;
    flags.push('CLIPPED');
  }
  const qf = [...new Set(flags)];
  raiseFlags(w, qf, 'dyn01');
  const value = quant(shown + gaussF11(w) * 0.005 * p.noiseFactor, p.dyn.resN);
  const r = addReading(w, {
    kind: 'weight', instrumentId: 'dyn01', value, unit: 'N', resolution: p.dyn.resN, uncertainty: p.uB.dynN, sourceObjectIds: ['dyn01', ...(d.holding ? ['alu1'] : [])], qualityFlags: qf, trueValue: T,
    target: !d.holding ? 'empty' : st.sub > 0.5 ? 'water' : 'air', fluid: 'A',
  });
  emitF11(w, 'DYN_READ', qf.some((x) => FLAG_ERR[x]) ? 'WARN' : 'INFO', { N: value });
  return { ok: true, id: r.id, value };
}

function readStand(w: F11World, viewDeg: number): F11DispatchResult {
  const p = w.params;
  const s = w.stand;
  const flags: string[] = [];
  const raw = s.ref !== null ? s.ref - s.zb : s.zb;
  if (s.ref === null || s.badRef) flags.push('NOT_ZEROED');
  if (standMovingF11(w)) flags.push('MOVING');
  let shown = raw + parallax(viewDeg, p.standResCm, 3, flags);
  const qf = [...new Set(flags)];
  raiseFlags(w, qf, 'stand01');
  shown = quant(shown, p.standResCm);
  const L0 = w.can.vol / canAreaCm2(w);
  const st = canState(w);
  const r = addReading(w, {
    kind: 'immersion', instrumentId: 'stand01', value: shown, unit: 'cm', resolution: p.standResCm, uncertainty: p.uB.standCm, sourceObjectIds: ['stand01', 'alu1'], qualityFlags: qf,
    trueValue: w.dyn.holding ? Math.max(0, Math.min(p.alu.H, st.level - s.zb)) : 0, target: 'immersion', fluid: 'A',
  });
  void L0;
  emitF11(w, 'STAND_READ', qf.length ? 'WARN' : 'INFO', { cm: shown });
  return { ok: true, id: r.id, value: shown };
}

function readBalance(w: F11World): F11DispatchResult {
  const p = w.params;
  const b = w.balance;
  if (!b.on) return { ok: false, code: 'EMPTY' };
  const it = b.on;
  const flags: string[] = [];
  const load = balanceLoadG(w);
  const container = it === 'cyl' || it === 'catch';
  if (!b.zeroed) flags.push('NOT_ZEROED');
  else if (container && (b.taredWith !== it || !b.taredEmpty)) flags.push('NOT_TARED');
  else if (!container && b.taredWith !== null) flags.push('NOT_ZEROED');
  if (it === 'catch') {
    if (w.can.catchUnprimed) flags.push('NOT_PRIMED');
    if (w.can.catchSpill) flags.push('SPILL');
    if (w.can.catchDripping) flags.push('UNSTABLE');
  }
  let shown = load + b.offset;
  if (shown > p.balance.rangeG) {
    shown = p.balance.rangeG;
    flags.push('CLIPPED');
  }
  const qf = [...new Set(flags)];
  raiseFlags(w, qf, 'balance01');
  const value = quant(shown + gaussF11(w) * 0.03 * p.noiseFactor, p.balance.resG);
  const content = it === 'cyl' ? (w.cyl.vol * p.rhoB) / 1000 : it === 'catch' ? (w.can.catchVol * p.rhoA) / 1000 : load;
  const r = addReading(w, {
    kind: 'mass', instrumentId: 'balance01', value, unit: 'g', resolution: p.balance.resG, uncertainty: p.uB.balanceG, sourceObjectIds: ['balance01', it === 'cyl' ? 'cyl01' : it === 'catch' ? 'catch01' : it], qualityFlags: qf,
    trueValue: content, target: it, fluid: it === 'cyl' ? 'B' : it === 'catch' ? 'A' : undefined, ballastG: it === 'bottle1' ? w.floats.bottle1.ballastG : undefined,
  });
  emitF11(w, 'BALANCE_READ', qf.some((x) => FLAG_ERR[x]) ? 'WARN' : 'INFO', { g: value });
  return { ok: true, id: r.id, value };
}

function readCylinder(w: F11World, viewDeg: number): F11DispatchResult {
  const p = w.params;
  const flags: string[] = [];
  if (w.cyl.vol < 0.5) flags.push('EMPTY');
  let shown = w.cyl.vol + parallax(viewDeg, p.cyl.resML, 1, flags);
  const qf = [...new Set(flags)];
  raiseFlags(w, qf, 'cyl01');
  shown = quant(Math.max(0, shown), p.cyl.resML);
  const r = addReading(w, {
    kind: 'volume', instrumentId: 'cyl01', value: shown, unit: 'mL', resolution: p.cyl.resML, uncertainty: p.uB.cylML, sourceObjectIds: ['cyl01'], qualityFlags: qf, trueValue: w.cyl.vol, target: 'cyl', fluid: 'B',
  });
  emitF11(w, 'CYLINDER_READ', qf.length ? 'WARN' : 'INFO', { mL: shown });
  return { ok: true, id: r.id, value: shown };
}

// ─────────────────────────── Cierre y bloqueos ───────────────────────────

function closeStation(w: F11World): F11DispatchResult {
  const v = w.valves;
  if (v.tap || v.pump || v.drain || v.agitator || w.dyn.holding || standMovingF11(w)) {
    // Desmontar sin llevar el equipo a estado seguro (F11-E40): queda flujo, agitación o una carga colgada.
    errF11(w, 'E40', 'UNSAFE_CLOSE', 'WARN');
    return { ok: false, code: 'NOT_SAFE' };
  }
  if (FLOATS.some((id) => w.floats[id].where === 'tank' || w.floats[id].where === 'bench')) {
    // Cerrar con objetos en el tanque o sobre la mesada (F11-E20): el inventario y el volumen inicial quedan mal.
    errF11(w, 'E20', 'ITEMS_LEFT', 'WARN');
    return { ok: false, code: 'ITEMS_OUT' };
  }
  if (w.probe.mount !== 'holder') return { ok: false, code: 'PROBE_OUT' };
  if (w.balance.on) return { ok: false, code: 'BALANCE_BUSY' };
  if (w.cyl.vol > 0.5) return { ok: false, code: 'CYL_FULL' };
  if (w.can.catchAt === 'spout') return { ok: false, code: 'CATCH_OUT' };
  if (sumVol(w.spill) > 1) return { ok: false, code: 'SPILL' };
  rearmErrF11(w, 'E40');
  rearmErrF11(w, 'E20');
  flagF11(w, 'stationClosed');
  emitF11(w, 'STATION_CLOSED', 'INFO');
  return { ok: true };
}

function acknowledge(w: F11World): F11DispatchResult {
  const b = w.safety.block;
  if (!b) return { ok: true };
  if (b.code === 'TANK_SPILL' && (w.valves.tap || w.valves.pump || sumVol(w.spill) > 1)) return { ok: false, code: 'SECURE_FIRST' };
  w.safety.block = null;
  emitF11(w, 'STATION_RESET', 'INFO', { code: b.code });
  return { ok: true };
}

// ─────────────────────────── Paso de simulación ───────────────────────────

export function stepF11World(w: F11World): void {
  const dt = w.params.dtS;
  const n = Math.max(1, w.params.subSteps);
  const hh = dt / n;
  const tStart = w.timeS;
  w.timeS = Math.round((w.timeS + dt) * 1e6) / 1e6;
  w.tick++;
  for (let i = 0; i < n; i++) {
    const t = tStart + i * hh;
    stepTank(w, hh);
    stepFloats(w, t, hh);
    stepProbe(w, hh);
    stepCan(w, t, hh);
  }
  for (const id of FLOATS) {
    const f = w.floats[id];
    f.zb = Math.round(f.zb * 1e9) / 1e9;
    f.v = Math.round(f.v * 1e9) / 1e9;
  }
  w.probe.lagKPa = Math.round(w.probe.lagKPa * 1e9) / 1e9;
}

export function runF11For(w: F11World, seconds: number) {
  const n = Math.round(seconds / w.params.dtS);
  for (let i = 0; i < n; i++) stepF11World(w);
}

export function f11Summary(w: F11World) {
  return {
    L: r4(tankLevel(w)),
    rho: r2(tankRho(w)),
    z: r4(w.probe.z),
    stand: r4(w.stand.zb),
    can: r2(w.can.vol),
    catch: r2(w.can.catchVol),
    trial: w.trial,
    readings: w.readingOrder.length,
    cfg: w.configVersion,
  };
}

export { FLOATS, rootOf };
