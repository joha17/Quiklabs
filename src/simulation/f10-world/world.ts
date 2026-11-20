/**
 * Mundo de F10 — equilibrio de vigas y elasticidad de materiales: paso fijo determinista de 0,05 s con 10 subpasos de
 * 5 ms (§6). La escena solo dibuja este estado y envía hechos geométricos.
 *
 * - Viga en dos apoyos unilaterales: en cada paso ΣF = 0 y Στ = 0 dan R_A y R_B; si una saldría negativa (la carga
 *   fuera de la zona apoyada, apoyos casi coincidentes) la viga vuelca sobre el otro filo: I_p θ̈ = Σ W_i d_i cos θ,
 *   integrada con subpasos hasta que el extremo golpea el tope de seguridad (la energía cinética se disipa).
 * - Cargas colgadas con gancho: abierto, la carga se suelta a los 0,5 s y golpea la mesada (F10-E07).
 * - Prensa de tracción por desplazamiento: la manivela lleva el travesaño a 0,05 mm/s (2 mm/s con la palanca de
 *   descarga rápida). Material elástico-plástico bilineal con endurecimiento isótropo y descarga elástica; la probeta
 *   solo trabaja a tracción (al aflojarse queda con su deformación residual). Trabajo de la manivela = energía elástica
 *   + trabajo plástico disipado.
 * - Instrumentos: dinamómetro de 0,05 N (0–20 N), sensores de reacción de 0,01 N, cinta de 0,1 cm, calibre de 0,01 mm,
 *   celda de carga de 0,5/1 N (rangos 2 y 10 kN), comparador digital de 0,001 mm y registrador F–ΔL.
 */
import type { Channel, F10Command, F10DispatchResult, Grip, PpeItem, TapeTarget } from './commands';
import type { BeamPlace, CurveRun, F10Object, F10Params, F10Setup, F10World, Pose, PressSetup, ReadingF10, SupportId } from './types';
import { hashRandom } from '../core/rng';
import { bumpF10, emitF10, errF10, flagF10, gaussF10, rearmErrF10 } from './events';
import { conservedTotalsF10, mechanicalEnergyF10, pivotInertia, pivotTorque, staticsF10, tipPotentialJ } from './conservation';
import { quantizeReading } from '../instruments/force-sensor';

export { emitF10, latchF10, rearmF10, bumpF10, flagF10, errF10 } from './events';
export { conservedTotalsF10, staticsF10 };

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, num(v, a)));
const DEG = Math.PI / 180;
const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
const r9 = (x: number) => Math.round(x * 1e9) / 1e9;
const SUPPORTS: SupportId[] = ['A', 'B'];
const isSupport = (s: unknown): s is SupportId => s === 'A' || s === 'B';
const SPECIMENS = ['spec1', 'spec2'];

/** Escenarios docentes (§10). */
export const SF10 = {
  LIGHT: 'F10-S01_light_beam',
  HEAVY: 'F10-S02_heavy_beam',
  CLOSE: 'F10-S03_close_supports',
  OVERHANG: 'F10-S04_overhang_load',
  STEEL: 'F10-S05_steel',
  ALUMINIUM: 'F10-S06_aluminium',
  ELASTIC: 'F10-S07_elastic_zone',
  YIELD: 'F10-S08_yield_load',
  GAUGE_UNCAL: 'F10-S09_uncalibrated_gauge',
  LOOSE: 'F10-S10_loose_support',
  ECCENTRIC: 'F10-S11_eccentric_load',
  SLOW_UNLOAD: 'F10-S12_slow_unload',
} as const;

export interface F10WorldSpec {
  objects: F10Object[];
  scenarios: string[];
  mode: string;
}

// ─────────────────────────── Creación ───────────────────────────

export function createF10World(spec: F10WorldSpec, seed: number, params: F10Params): F10World {
  const has = (s: string) => spec.scenarios.includes(s);
  const objects: Record<string, F10Object> = {};
  for (const o of spec.objects) objects[o.id] = { ...o, pose: { ...o.pose } };
  const h = (k: string) => hashRandom(seed, k) - 0.5;
  const sign = (k: string) => (h(k) > 0 ? 1 : -1);
  const realistic = params.scientificMode === 'REALISTIC';
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  const cg = realistic ? r2(params.beamLenCm / 2 + sign('cgS') * params.cgOffsetCm * (0.6 + (h('cg') + 0.5) * 0.4)) : params.beamLenCm / 2;
  const tilt = realistic ? r2(sign('tS') * params.benchTiltDeg * (0.6 + (h('t') + 0.5) * 0.4)) : 0;
  const m = params.materials[params.material];
  const specimens: F10World['specimens'] = {};
  for (const id of SPECIMENS) {
    const d = realistic ? r3(params.specimenDmm + h(`d${id}`) * 2 * params.dSpreadMm) : params.specimenDmm;
    specimens[id] = { id, dMm: d, epsP: 0, sigmaY: m.sigmaY, yielded: false, reloaded: false };
  }
  const w: F10World = {
    timeS: 0, tick: 0, seed, rng: seed >>> 0 || 1, params, mode: spec.mode, objects,
    beam: { where: 'rack', seated: false, angle: 0, omega: 0, pivot: null, dir: 1, tipped: false, wedgeS: 50, hand: false, settleUntil: 0 },
    supports: {
      A: { s: 30, clamped: false, loose: false, driftCm: 0 },
      B: { s: 90, clamped: false, loose: has(SF10.LOOSE), driftCm: 0 },
    },
    loads: { load1: { where: 'rack', s: 60, hookClosed: false, slipAt: null } },
    cells: {
      A: { offset: r2(sign('cA') * params.cell.offsetN * (0.4 + (h('ca') + 0.5) * 0.6)), tared: false },
      B: { offset: r2(sign('cB') * params.cell.offsetN * (0.4 + (h('cb') + 0.5) * 0.6)), tared: false },
      connected: false,
    },
    dyn: { offset: Math.round(sign('dS') * params.dyn.offsetN * (0.5 + (h('d') + 0.5) * 0.5) * 20) / 20, zeroed: false, aimDeg: 0, holding: null, hungAt: -10 },
    bench: { tiltDeg: tilt },
    cgS: cg,
    specimens,
    press: {
      specimen: null, gripTop: false, gripBottom: false, eccMm: 0, u: 0, target: 0, speed: params.crankSpeedMmS, crankLocked: true, uRef: 0, preloadMm: 0, shieldClosed: false,
      transientUntil: -10, movedAt: -10, forceN: 0, elongMm: 0,
    },
    gauge: {
      mounted: null, connected: false, offset: r3(sign('gS') * params.gauge.offsetMm * (0.5 + (h('g') + 0.5) * 0.5)), zeroed: false,
      scale: has(SF10.GAUGE_UNCAL) ? 1.06 : r4(1 + sign('gk') * (params.gauge.uncalScale - 1) * (0.7 + (h('gk2') + 0.5) * 0.3)), calibrated: false, angleDeg: 0, cableRouted: false,
    },
    loadCell: { connected: false, offset: r2(sign('lS') * params.loadCell.offsetN * (0.5 + (h('l') + 0.5) * 0.5)), zeroed: false, rangeIdx: 0 },
    logger: { rateHz: params.rates[1] ?? 5 },
    run: null, runs: [],
    damaged: false,
    energy: { dissipatedJ: 0, externalJ: 0, crankJ: 0, plasticJ: 0 },
    trial: 0,
    configVersion: 1,
    readings: {}, readingOrder: [],
    safety: { ppe: { coat: false, goggles: false, shoes: false, hair: false }, block: null, stoppedByTeacher: false },
    events: [], evidence: {}, scenarios: [...spec.scenarios], ppe: false,
    initialTotals: { massesG: 0 },
  };
  w.initialTotals = { massesG: conservedTotalsF10(w).massesG };
  return w;
}

// ─────────────────────────── Consultas ───────────────────────────

export const tippingF10 = (w: F10World) => !!w.beam.pivot && !w.beam.tipped;
export const pressMovingF10 = (w: F10World) => Math.abs(w.press.target - w.press.u) > 1e-9;
export const pressGrippedF10 = (w: F10World) => !!w.press.specimen && w.press.gripTop && w.press.gripBottom;
export const loggingF10 = (w: F10World) => !!w.run && !w.run.done;
export const busyF10 = (w: F10World) => pressMovingF10(w) || tippingF10(w) || loggingF10(w);
export const specimenOf = (w: F10World) => (w.press.specimen ? w.specimens[w.press.specimen] : null);
export const areaM2 = (dMm: number) => (Math.PI * (dMm * 1e-3) ** 2) / 4;
export const materialOf = (w: F10World) => w.params.materials[w.params.material];

/** Punto de equilibrio sobre la cuña (cm): el centro de masa corrido por la inclinación de la mesada. */
export const balancePointF10 = (w: F10World) => w.cgS + w.params.hcCm * Math.tan(w.bench.tiltDeg * DEG);

/** Cómo queda la viga sobre la cuña: equilibrada o caída hacia un lado (lo que el estudiante ve). */
export function wedgeTiltF10(w: F10World): 'level' | 'left' | 'right' | null {
  if (w.beam.where !== 'wedge') return null;
  const d = w.beam.wedgeS - balancePointF10(w);
  if (Math.abs(d) <= w.params.wedgeTolCm) return 'level';
  return d > 0 ? 'left' : 'right';
}

// ─────────────────────────── Despacho ───────────────────────────

const BEFORE_PPE = new Set<F10Command['type']>(['equipPpe', 'startWork', 'teacherStop', 'acknowledge', 'inspect']);
const DURING_BLOCK = new Set<F10Command['type']>(['acknowledge', 'teacherStop', 'inspect', 'setPose', 'unhangLoad', 'recoverLoad', 'closeHook', 'resetBeam', 'repairBeam', 'setCrank', 'setShield', 'lockCrank', 'steadyBeam']);
/** Comandos que cambian la condición física del ensayo (nuevo montaje; F10-E32 si el registrador está grabando). */
const CONFIG = new Set<F10Command['type']>([
  'clampSupport', 'tightenKnife', 'levelBench', 'zeroCells', 'clampGrip', 'alignGrips', 'mountGauge', 'tiltGauge', 'routeCable', 'calibrateGauge', 'zeroGauge', 'zeroLoadCell',
  'setCellRange', 'connect', 'setRate', 'installSpecimen', 'removeSpecimen',
]);

export function dispatchF10(w: F10World, cmd: F10Command): F10DispatchResult {
  if (!cmd || typeof cmd !== 'object') return { ok: false, code: 'UNKNOWN' };
  if (w.safety.stoppedByTeacher && cmd.type !== 'teacherStop') return { ok: false, code: 'TEACHER_STOP' };
  if (!w.ppe && !BEFORE_PPE.has(cmd.type)) return { ok: false, code: 'PPE' };
  if (w.safety.block && !DURING_BLOCK.has(cmd.type)) return { ok: false, code: 'BLOCKED' };
  // Trabajo externo: lo que el gesto cambia en la energía (mecánica + disipada).
  const S0 = mechanicalEnergyF10(w) + w.energy.dissipatedJ;
  const before = w.configVersion;
  const res = route(w, cmd);
  w.energy.externalJ += mechanicalEnergyF10(w) + w.energy.dissipatedJ - S0;
  if (res.ok && CONFIG.has(cmd.type)) {
    if (w.configVersion === before) w.configVersion++;
    const run = loggingF10(w) ? w.run : null;
    if (run && run.configChangedT === null) {
      run.configChangedT = r4(w.timeS - run.startS);
      errF10(w, 'E32', 'CONFIG_DURING_RUN', 'WARN', { cmd: cmd.type });
    }
  }
  return res;
}

function route(w: F10World, cmd: F10Command): F10DispatchResult {
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
    // Viga y apoyos
    case 'placeBeam':
      return placeBeam(w, cmd.where);
    case 'seatBeam':
      return seatBeam(w);
    case 'setSupport': {
      if (!isSupport(cmd.id)) return { ok: false, code: 'NO_OBJECT' };
      const s = w.supports[cmd.id];
      if (s.clamped) return { ok: false, code: 'CLAMPED' };
      if (w.beam.where === 'supports' && w.loads.load1.where === 'beam') return { ok: false, code: 'LOADED' };
      if (tippingF10(w) || w.beam.tipped) return { ok: false, code: 'TIPPED' };
      s.s = Math.round(clamp(cmd.sCm, w.params.supportMinCm, w.params.supportMaxCm) * 100) / 100;
      if (w.beam.where === 'supports') beamChanged(w);
      return { ok: true, value: s.s };
    }
    case 'clampSupport': {
      if (!isSupport(cmd.id)) return { ok: false, code: 'NO_OBJECT' };
      w.supports[cmd.id].clamped = !!cmd.on;
      if (cmd.on && SUPPORTS.every((k) => w.supports[k].clamped)) rearmErrF10(w, 'E28');
      emitF10(w, cmd.on ? 'SUPPORT_CLAMPED' : 'SUPPORT_UNCLAMPED', 'INFO', { id: cmd.id });
      return { ok: true };
    }
    case 'tightenKnife': {
      if (!isSupport(cmd.id)) return { ok: false, code: 'NO_OBJECT' };
      w.supports[cmd.id].loose = false;
      emitF10(w, 'KNIFE_TIGHT', 'INFO', { id: cmd.id });
      return { ok: true };
    }
    case 'steadyBeam': {
      if (cmd.on && w.beam.where !== 'supports') return { ok: false, code: 'NO_BEAM' };
      w.beam.hand = !!cmd.on;
      if (!cmd.on) rearmErrF10(w, 'E06');
      emitF10(w, cmd.on ? 'HAND_ON_BEAM' : 'HAND_OFF_BEAM', 'INFO');
      return { ok: true };
    }
    case 'resetBeam':
      return resetBeam(w);
    case 'repairBeam':
      if (tippingF10(w) || w.beam.tipped) return { ok: false, code: 'TIPPED' };
      if (!w.damaged) return { ok: true };
      w.damaged = false;
      rearmErrF10(w, 'E39');
      emitF10(w, 'BEAM_REPAIRED', 'INFO');
      return { ok: true };
    // Cargas y dinamómetro
    case 'hangLoad':
      return hangLoad(w, num(cmd.sCm, 60));
    case 'moveLoad': {
      const L = w.loads.load1;
      if (L.where !== 'beam') return { ok: false, code: 'NOT_ON_BEAM' };
      if (tippingF10(w) || w.beam.tipped) return { ok: false, code: 'TIPPED' };
      L.s = Math.round(clamp(cmd.sCm, 1, w.params.beamLenCm - 1) * 100) / 100;
      beamChanged(w);
      return { ok: true, value: L.s };
    }
    case 'unhangLoad': {
      const L = w.loads.load1;
      if (L.where === 'rack') return { ok: true };
      if (L.where === 'gantry') {
        w.dyn.holding = null;
      }
      const was = L.where;
      L.where = 'rack';
      L.slipAt = null;
      L.hookClosed = false;
      if (was === 'beam') beamChanged(w);
      emitF10(w, 'LOAD_REMOVED', 'INFO');
      return { ok: true };
    }
    case 'closeHook': {
      const L = w.loads.load1;
      L.hookClosed = !!cmd.on;
      if (cmd.on) L.slipAt = null;
      else if (L.where === 'beam') L.slipAt = w.timeS;
      if (cmd.on) rearmErrF10(w, 'E07');
      emitF10(w, cmd.on ? 'HOOK_CLOSED' : 'HOOK_OPENED', cmd.on ? 'INFO' : 'WARN');
      return { ok: true };
    }
    case 'recoverLoad': {
      const L = w.loads.load1;
      if (L.where !== 'bench') return { ok: true };
      L.where = 'rack';
      L.hookClosed = false;
      emitF10(w, 'LOAD_RECOVERED', 'INFO');
      return { ok: true };
    }
    case 'hangOnDyn':
      return hangOnDyn(w, cmd.id);
    case 'unhangDyn': {
      const hd = w.dyn.holding;
      if (!hd) return { ok: true };
      w.dyn.holding = null;
      if (hd === 'beam') w.beam.where = 'rack';
      else w.loads.load1.where = 'rack';
      emitF10(w, 'DYN_UNLOADED', 'INFO');
      return { ok: true };
    }
    case 'aimDyn':
      w.dyn.aimDeg = Math.round(clamp(cmd.deg, 0, 45) * 10) / 10;
      if (w.dyn.aimDeg < 3) rearmErrF10(w, 'E05');
      return { ok: true, value: w.dyn.aimDeg };
    case 'zeroDyn':
      if (w.dyn.holding) return { ok: false, code: 'LOADED' };
      w.dyn.offset = 0;
      w.dyn.zeroed = true;
      flagF10(w, 'dynZeroed');
      emitF10(w, 'DYN_ZEROED', 'INFO');
      return { ok: true };
    case 'readDyn':
      return readDyn(w, num(cmd.viewDeg));
    // Geometría
    case 'slideOnWedge':
      if (w.beam.where !== 'wedge') return { ok: false, code: 'NOT_ON_WEDGE' };
      w.beam.wedgeS = Math.round(clamp(cmd.sCm, 20, 100) * 100) / 100;
      return { ok: true, value: w.beam.wedgeS };
    case 'levelBench':
      w.bench.tiltDeg = 0;
      rearmErrF10(w, 'E20');
      flagF10(w, 'benchLevelled');
      emitF10(w, 'BENCH_LEVELLED', 'INFO');
      return { ok: true };
    case 'readTape':
      return readTape(w, cmd.target, num(cmd.viewDeg));
    case 'readCaliper':
      return readCaliper(w, String(cmd.id));
    // Sensores de reacción
    case 'zeroCells':
      if (w.beam.where === 'supports') return { ok: false, code: 'LOADED' };
      if (!w.cells.connected) return { ok: false, code: 'NOT_CONNECTED' };
      for (const k of SUPPORTS) w.cells[k] = { offset: 0, tared: true };
      flagF10(w, 'cellsZeroed');
      emitF10(w, 'CELLS_ZEROED', 'INFO');
      return { ok: true };
    case 'readCell':
      if (!isSupport(cmd.id)) return { ok: false, code: 'NO_OBJECT' };
      return readCell(w, cmd.id);
    // Prensa
    case 'installSpecimen':
      return installSpecimen(w, String(cmd.id));
    case 'removeSpecimen':
      return removeSpecimen(w);
    case 'clampGrip':
      return clampGrip(w, cmd.grip, !!cmd.on);
    case 'alignGrips':
      if (!w.press.specimen) return { ok: false, code: 'NO_SPECIMEN' };
      if (w.press.gripTop && w.press.gripBottom) return { ok: false, code: 'GRIPPED' };
      w.press.eccMm = 0;
      rearmErrF10(w, 'E15');
      flagF10(w, 'gripsAligned');
      emitF10(w, 'GRIPS_ALIGNED', 'INFO');
      return { ok: true };
    case 'lockCrank':
      w.press.crankLocked = !!cmd.on;
      if (cmd.on) {
        w.press.target = w.press.u;
        w.press.speed = w.params.crankSpeedMmS;
      }
      emitF10(w, cmd.on ? 'CRANK_LOCKED' : 'CRANK_FREE', 'INFO');
      return { ok: true };
    case 'setCrank':
      return setCrank(w, num(cmd.mm));
    case 'releaseCrank':
      return releaseCrank(w);
    case 'setShield':
      w.press.shieldClosed = !!cmd.closed;
      emitF10(w, cmd.closed ? 'SHIELD_CLOSED' : 'SHIELD_OPENED', 'INFO');
      return { ok: true };
    // Comparador, celda y registrador
    case 'mountGauge': {
      const ax = cmd.axis === 'axial' || cmd.axis === 'transverse' ? cmd.axis : null;
      if (ax && !w.press.specimen) return { ok: false, code: 'NO_SPECIMEN' };
      w.gauge.mounted = ax;
      if (ax === 'axial') rearmErrF10(w, 'E11');
      emitF10(w, ax ? (ax === 'axial' ? 'GAUGE_AXIAL' : 'GAUGE_TRANSVERSE') : 'GAUGE_REMOVED', ax === 'transverse' ? 'WARN' : 'INFO');
      return { ok: true };
    }
    case 'tiltGauge':
      w.gauge.angleDeg = Math.round(clamp(cmd.deg, 0, 30) * 10) / 10;
      if (w.gauge.angleDeg < 3) rearmErrF10(w, 'E26');
      return { ok: true, value: w.gauge.angleDeg };
    case 'routeCable':
      w.gauge.cableRouted = !!cmd.on;
      if (cmd.on) {
        rearmErrF10(w, 'E25');
        flagF10(w, 'cableRouted');
      }
      emitF10(w, cmd.on ? 'CABLE_ROUTED' : 'CABLE_LOOSE', cmd.on ? 'INFO' : 'WARN');
      return { ok: true };
    case 'calibrateGauge': {
      const g = w.gauge;
      if (!g.connected) return { ok: false, code: 'NOT_CONNECTED' };
      if (g.mounted) return { ok: false, code: 'MOUNTED' };
      g.scale = 1;
      g.calibrated = true;
      rearmErrF10(w, 'E27');
      flagF10(w, 'gaugeCalibrated');
      emitF10(w, 'GAUGE_CALIBRATED', 'INFO', { mm: 1 });
      return { ok: true };
    }
    case 'zeroGauge': {
      const g = w.gauge;
      if (!g.connected) return { ok: false, code: 'NOT_CONNECTED' };
      if (!g.mounted) return { ok: false, code: 'NO_GAUGE' };
      g.offset = -gaugeRaw(w);
      g.zeroed = w.press.forceN < 5 && !specimenOf(w)?.yielded;
      if (g.zeroed) {
        rearmErrF10(w, 'E21');
        flagF10(w, 'gaugeZeroed');
      }
      emitF10(w, g.zeroed ? 'GAUGE_ZEROED' : 'GAUGE_ZEROED_LOADED', g.zeroed ? 'INFO' : 'WARN');
      return { ok: true };
    }
    case 'zeroLoadCell': {
      const c = w.loadCell;
      if (!c.connected) return { ok: false, code: 'NOT_CONNECTED' };
      c.offset = -w.press.forceN;
      c.zeroed = w.press.forceN < 5;
      if (c.zeroed) {
        rearmErrF10(w, 'E21');
        flagF10(w, 'loadCellZeroed');
      }
      emitF10(w, c.zeroed ? 'LOADCELL_ZEROED' : 'LOADCELL_ZEROED_LOADED', c.zeroed ? 'INFO' : 'WARN');
      return { ok: true };
    }
    case 'setCellRange':
      w.loadCell.rangeIdx = Math.round(clamp(cmd.n, 0, w.params.loadCell.ranges.length - 1));
      if (w.loadCell.rangeIdx > 0) rearmErrF10(w, 'E22');
      return { ok: true, value: w.params.loadCell.ranges[w.loadCell.rangeIdx] };
    case 'connect':
      return connect(w, cmd.channel, !!cmd.on);
    case 'setRate': {
      const hz = Math.round(num(cmd.hz));
      if (!w.params.rates.includes(hz)) return { ok: false, code: 'BAD_RATE' };
      w.logger.rateHz = hz;
      if (hz >= 20) rearmErrF10(w, 'E24');
      return { ok: true, value: hz };
    }
    case 'readLoadCell':
      return readLoadCell(w);
    case 'readGauge':
      return readGauge(w);
    case 'startLog':
      return startLog(w);
    case 'stopLog':
      if (!w.run || w.run.done) return { ok: true };
      w.run.done = true;
      emitF10(w, 'LOG_STOPPED', 'INFO', { n: w.run.samples.length });
      return { ok: true };
    case 'readCurve':
      return readCurve(w);
    // Cierre y seguridad
    case 'closeStation':
      return closeStation(w);
    case 'acknowledge':
      return acknowledge(w);
    case 'teacherStop':
      w.safety.stoppedByTeacher = !!cmd.on;
      if (cmd.on) {
        w.press.target = w.press.u;
        w.beam.hand = false;
      }
      emitF10(w, cmd.on ? 'TEACHER_STOP' : 'TEACHER_RESUME', cmd.on ? 'CRITICAL' : 'INFO');
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

function startWork(w: F10World): F10DispatchResult {
  const missing = (Object.keys(PPE_ERR) as PpeItem[]).filter((k) => !w.safety.ppe[k]);
  if (missing.length) {
    for (const k of missing) {
      bumpF10(w, `err:${PPE_ERR[k][0]}`);
      emitF10(w, PPE_ERR[k][1], 'CRITICAL');
    }
    return { ok: false, code: 'PPE_MISSING' };
  }
  w.ppe = true;
  flagF10(w, 'ppe');
  emitF10(w, 'PPE_OK', 'INFO');
  return { ok: true };
}

function inspect(w: F10World, target: string): F10DispatchResult {
  const o = w.objects[target];
  if (!o) return { ok: false, code: 'NO_OBJECT' };
  flagF10(w, `inspected:${target}`);
  const p = w.params;
  const mat = materialOf(w);
  switch (o.kind) {
    case 'beam':
      emitF10(w, w.damaged ? 'INSPECT_BEAM_BAD' : 'INSPECT_BEAM', w.damaged ? 'WARN' : 'INFO', { cm: p.beamLenCm });
      break;
    case 'support': {
      const id: SupportId = target === 'supportA' ? 'A' : 'B';
      const s = w.supports[id];
      emitF10(w, s.loose ? 'INSPECT_SUPPORT_LOOSE' : s.clamped ? 'INSPECT_SUPPORT' : 'INSPECT_SUPPORT_FREE', s.loose || !s.clamped ? 'WARN' : 'INFO', { id, range: p.cell.rangeN, res: p.cell.resN });
      break;
    }
    case 'rail':
      emitF10(w, 'INSPECT_RAIL', 'INFO');
      break;
    case 'load':
      emitF10(w, w.loads.load1.hookClosed ? 'INSPECT_LOAD' : 'INSPECT_LOAD_OPEN', w.loads.load1.hookClosed ? 'INFO' : 'WARN');
      break;
    case 'dynamometer':
      emitF10(w, w.dyn.zeroed ? 'INSPECT_DYN' : 'INSPECT_DYN_OFF', w.dyn.zeroed ? 'INFO' : 'WARN', { range: p.dyn.rangeN, res: p.dyn.resN });
      break;
    case 'gantry':
      emitF10(w, 'INSPECT_GANTRY', 'INFO');
      break;
    case 'wedge':
      emitF10(w, 'INSPECT_WEDGE', 'INFO');
      break;
    case 'level':
      emitF10(w, Math.abs(w.bench.tiltDeg) > 0.2 ? 'INSPECT_LEVEL_BAD' : 'INSPECT_LEVEL', Math.abs(w.bench.tiltDeg) > 0.2 ? 'WARN' : 'INFO', { deg: Math.abs(w.bench.tiltDeg) });
      break;
    case 'tape':
      emitF10(w, 'INSPECT_TAPE', 'INFO', { res: p.tapeResCm * 10 });
      break;
    case 'caliper':
      emitF10(w, 'INSPECT_CALIPER', 'INFO', { res: p.caliperResMm });
      break;
    case 'press':
      emitF10(w, 'INSPECT_PRESS', 'INFO', { max: p.loadCell.ranges[p.loadCell.ranges.length - 1] / 1000 });
      break;
    case 'specimen':
      emitF10(w, 'INSPECT_SPECIMEN', 'INFO', { mat: w.params.material, L: p.L0mm / 10, GPa: Math.round(mat.E / 1e9) });
      break;
    case 'grip':
      emitF10(w, w.press.eccMm > 0.02 && w.press.specimen ? 'INSPECT_GRIP_ECC' : 'INSPECT_GRIP', w.press.eccMm > 0.02 && w.press.specimen ? 'WARN' : 'INFO');
      break;
    case 'crank':
      emitF10(w, w.press.crankLocked ? 'INSPECT_CRANK_LOCKED' : 'INSPECT_CRANK', 'INFO', { speed: p.crankSpeedMmS });
      break;
    case 'loadCell':
      emitF10(w, w.loadCell.zeroed ? 'INSPECT_LOADCELL' : 'INSPECT_LOADCELL_OFF', w.loadCell.zeroed ? 'INFO' : 'WARN', { range: p.loadCell.ranges[w.loadCell.rangeIdx], res: p.loadCell.resolutions[w.loadCell.rangeIdx] });
      break;
    case 'gauge':
      emitF10(w, w.gauge.calibrated ? 'INSPECT_GAUGE' : 'INSPECT_GAUGE_UNCAL', w.gauge.calibrated ? 'INFO' : 'WARN', { res: p.gauge.resMm });
      break;
    case 'shield':
      emitF10(w, 'INSPECT_SHIELD', 'INFO');
      break;
    case 'logger':
      emitF10(w, 'INSPECT_LOGGER', w.logger.rateHz >= 20 ? 'INFO' : 'WARN', { hz: w.logger.rateHz });
      break;
    case 'rack':
      emitF10(w, 'INSPECT_RACK', 'INFO', { kg: p.loadKg });
      break;
    default:
      emitF10(w, 'INSPECTED', 'INFO', { target });
  }
  return { ok: true };
}

const POSE_SUPPORTS = new Set(['bench', 'rack', 'hand']);

function setPose(w: F10World, id: string, pose: Pose, support?: string): F10DispatchResult {
  const o = w.objects[id];
  if (!o) return { ok: false, code: 'NO_OBJECT' };
  if (!o.movable) return { ok: false, code: 'FIXED' };
  if (!pose || ![pose.x, pose.y, pose.z].every((v) => Number.isFinite(v))) return { ok: false, code: 'BAD_POSE' };
  if (support && support !== o.support && !POSE_SUPPORTS.has(support)) return { ok: false, code: 'NO_SEAT' };
  if (id === 'load1' && w.loads.load1.where !== 'rack') return { ok: false, code: 'NO_SEAT' };
  o.pose = { x: pose.x, y: pose.y, z: pose.z, rotationRad: num(pose.rotationRad) };
  if (support) o.support = support;
  return { ok: true };
}

// ─────────────────────────── Viga, apoyos y cargas ───────────────────────────

/** Cambió la carga de la viga sobre los apoyos: nuevo ensayo, oscila un momento, un apoyo sin trabar corre. */
function beamChanged(w: F10World) {
  w.trial++;
  w.beam.settleUntil = r6(w.timeS + w.params.settleS);
  if (w.beam.where !== 'supports' || w.beam.tipped) return;
  driftCheck(w);
  tipCheck(w);
}

/** Un apoyo sin trabar que recibe carga se corre hacia afuera (F10-E28). */
function driftCheck(w: F10World) {
  const st = staticsF10(w);
  for (const k of SUPPORTS) {
    const s = w.supports[k];
    const R = k === 'A' ? st.RA : st.RB;
    if (s.clamped || s.driftCm > 0 || !(R > 1)) continue;
    const out = k === st.lo ? -1 : 1;
    s.s = Math.round(clamp(s.s + out * w.params.driftCm, w.params.supportMinCm, w.params.supportMaxCm) * 100) / 100;
    s.driftCm = w.params.driftCm;
    errF10(w, 'E28', 'SUPPORT_MOVED', 'WARN', { id: k });
  }
}

/** Si una reacción saldría negativa, la viga no puede estar en equilibrio: vuelca sobre el otro filo. */
function tipCheck(w: F10World) {
  const b = w.beam;
  if (b.where !== 'supports' || b.tipped || b.pivot) return;
  const st = staticsF10(w);
  if (st.RA >= -1e-9 && st.RB >= -1e-9) return;
  const sp = w.supports[st.lo].s;
  const right = st.xr > sp;
  b.pivot = right ? st.hi : st.lo;
  b.dir = right ? 1 : -1;
  b.angle = 0;
  b.omega = 0;
  b.hand = false;
  const outside = w.loads.load1.where === 'beam' && (w.loads.load1.s < Math.min(w.supports.A.s, w.supports.B.s) || w.loads.load1.s > Math.max(w.supports.A.s, w.supports.B.s));
  if (st.span < w.params.illCondCm) errF10(w, 'E09', 'SUPPORTS_COINCIDENT', 'WARN', { cm: Math.round(st.span * 10) / 10 });
  if (outside || st.span >= w.params.illCondCm) errF10(w, 'E02', 'BEAM_TIPPING', 'CRITICAL', { cm: Math.round(st.xr * 10) / 10 });
  else emitF10(w, 'BEAM_TIPPING', 'CRITICAL', { cm: Math.round(st.xr * 10) / 10 });
}

function placeBeam(w: F10World, where: BeamPlace): F10DispatchResult {
  const b = w.beam;
  if (!['rack', 'wedge', 'supports', 'gantry'].includes(where)) return { ok: false, code: 'UNKNOWN' };
  if (b.tipped || b.pivot) return { ok: false, code: 'TIPPED' };
  if (w.loads.load1.where === 'beam') return { ok: false, code: 'LOADED' };
  if (where === 'gantry') return hangOnDyn(w, 'beam');
  if (b.where === where) return { ok: true };
  if (w.dyn.holding === 'beam') w.dyn.holding = null;
  b.where = where;
  b.seated = false;
  b.hand = false;
  if (where === 'wedge') b.wedgeS = 50;
  if (where === 'supports') beamChanged(w);
  emitF10(w, 'BEAM_PLACED', 'INFO', { where });
  return { ok: true };
}

function seatBeam(w: F10World): F10DispatchResult {
  const b = w.beam;
  if (b.where !== 'supports') return { ok: false, code: 'NO_BEAM' };
  if (b.tipped || b.pivot) return { ok: false, code: 'TIPPED' };
  const loose = SUPPORTS.filter((k) => w.supports[k].loose);
  if (loose.length) {
    // Filo flojo en su soporte (F10-S10): la viga se mece sobre él y no asienta.
    emitF10(w, 'KNIFE_LOOSE', 'WARN', { id: loose[0] });
    return { ok: true };
  }
  b.seated = true;
  rearmErrF10(w, 'E01');
  flagF10(w, 'beamSeated');
  beamChanged(w);
  emitF10(w, 'BEAM_SEATED', 'INFO');
  return { ok: true };
}

function resetBeam(w: F10World): F10DispatchResult {
  const b = w.beam;
  if (!b.tipped && !b.pivot) return { ok: true };
  if (tippingF10(w)) return { ok: false, code: 'BUSY' };
  if (w.loads.load1.where === 'beam') return { ok: false, code: 'LOADED' };
  b.tipped = false;
  b.pivot = null;
  b.angle = 0;
  b.omega = 0;
  b.seated = false;
  beamChanged(w);
  emitF10(w, 'BEAM_RESET', 'INFO');
  return { ok: true };
}

function hangLoad(w: F10World, sCm: number): F10DispatchResult {
  const L = w.loads.load1;
  if (L.where === 'beam') return { ok: true };
  if (L.where !== 'rack') return { ok: false, code: 'NOT_ON_RACK' };
  if (w.beam.where !== 'supports') return { ok: false, code: 'NO_BEAM' };
  if (w.beam.tipped || w.beam.pivot) return { ok: false, code: 'TIPPED' };
  L.where = 'beam';
  L.s = Math.round(clamp(sCm, 1, w.params.beamLenCm - 1) * 100) / 100;
  // Gancho abierto: la carga se suelta en cuanto la viga oscila (F10-E07).
  L.slipAt = L.hookClosed ? null : w.timeS;
  emitF10(w, 'LOAD_HUNG', 'INFO', { cm: L.s });
  beamChanged(w);
  return { ok: true, value: L.s };
}

function hangOnDyn(w: F10World, id: 'beam' | 'load1'): F10DispatchResult {
  const d = w.dyn;
  if (d.holding === id) return { ok: true };
  if (d.holding) return { ok: false, code: 'DYN_BUSY' };
  if (id === 'beam') {
    const b = w.beam;
    if (b.tipped || b.pivot) return { ok: false, code: 'TIPPED' };
    if (w.loads.load1.where === 'beam') return { ok: false, code: 'LOADED' };
    const was = b.where;
    b.where = 'gantry';
    b.seated = false;
    b.hand = false;
    if (was === 'supports') w.trial++;
  } else {
    const L = w.loads.load1;
    if (L.where !== 'rack') return { ok: false, code: 'NOT_ON_RACK' };
    L.where = 'gantry';
  }
  d.holding = id;
  d.hungAt = w.timeS;
  emitF10(w, 'ON_DYN', 'INFO', { id });
  return { ok: true };
}

// ─────────────────────────── Lecturas ───────────────────────────

const PREFIX: Record<ReadingF10['kind'], string> = { weight: 'w', position: 'x', reaction: 'r', diameter: 'd', force: 'f', elong: 'e', curve: 'c' };

function addReading(w: F10World, r: Omit<ReadingF10, 'id' | 't' | 'tick' | 'trialId' | 'configVersion'> & { configVersion?: number; trial?: number }): ReadingF10 {
  const n = w.readingOrder.length + 1;
  const { trial, ...rest } = r;
  const reading: ReadingF10 = { ...rest, configVersion: r.configVersion ?? w.configVersion, id: `${PREFIX[r.kind]}${n}`, trialId: `T${trial ?? w.trial}`, t: w.timeS, tick: w.tick };
  if (!Number.isFinite(reading.value)) reading.valid = false;
  if (!Number.isFinite(reading.trueValue)) reading.trueValue = 0;
  w.readings[reading.id] = reading;
  w.readingOrder.push(reading.id);
  return reading;
}

const quant = quantizeReading;
/** Número finito o null (la cinta se guarda en JSON y NaN no sobrevive). */
const fin = (x: number | null | undefined): number | null => (x !== null && x !== undefined && Number.isFinite(x) ? x : null);

const FLAG_ERR: Record<string, [string, string]> = {
  NOT_SEATED: ['E01', 'BEAM_NOT_SEATED'],
  OBLIQUE: ['E05', 'DYN_OBLIQUE'],
  HAND_ON: ['E06', 'HAND_DURING_READ'],
  ILL_COND: ['E09', 'SUPPORTS_COINCIDENT'],
  TRANSVERSE: ['E11', 'GAUGE_TRANSVERSE_READ'],
  TRANSIENT: ['E14', 'READ_AFTER_QUICK_UNLOAD'],
  ECCENTRIC: ['E15', 'ECCENTRIC_GRIP'],
  PREDEFORMED: ['E16', 'RELOAD_PLASTIC'],
  VIBRATION: ['E18', 'GAUGE_NOT_STILL'],
  PRELOAD: ['E19', 'GRIP_PRELOAD'],
  BENCH_TILTED: ['E20', 'BENCH_TILTED'],
  NOT_ZEROED: ['E21', 'NOT_ZEROED'],
  CLIPPED: ['E22', 'SENSOR_SATURATED'],
  UNPLUGGED: ['E23', 'NO_SIGNAL'],
  LOW_RATE: ['E24', 'LOW_RATE'],
  OCCLUDED: ['E25', 'GAUGE_OCCLUDED'],
  TILTED_GAUGE: ['E26', 'GAUGE_TILTED'],
  UNCALIBRATED: ['E27', 'GAUGE_UNCALIBRATED'],
  SUPPORT_MOVED: ['E28', 'SUPPORT_MOVED'],
  PARALLAX: ['E29', 'SCALE_PARALLAX'],
  UNSTABLE: ['E30', 'READ_BEFORE_STABLE'],
  CONFIG_CHANGED: ['E32', 'CONFIG_DURING_RUN'],
  POST_IMPACT: ['E39', 'READ_AFTER_IMPACT'],
};

const raiseFlags = (w: F10World, qf: string[], inst: string) => {
  for (const f of qf) {
    if (!FLAG_ERR[f]) continue;
    errF10(w, FLAG_ERR[f][0], FLAG_ERR[f][1], 'WARN', { inst });
    // Por instrumento, para que la rúbrica sepa cuál se operó mal (F10-E21 vale para todos).
    bumpF10(w, `inst:${inst}:${FLAG_ERR[f][0]}`);
  }
};

/** Copia del montaje de la viga (con la verdad solo para el docente). */
function beamSetup(w: F10World): F10Setup {
  const st = staticsF10(w);
  const on = w.loads.load1.where === 'beam';
  return {
    sA: w.supports.A.s, sB: w.supports.B.s, load: on ? w.loads.load1.s : null, loadOn: on, seated: w.beam.seated, clamped: [w.supports.A.clamped, w.supports.B.clamped], tiltDeg: w.bench.tiltDeg,
    trueCg: w.cgS, trueRA: r6(Number.isFinite(st.RA) ? st.RA : 0), trueRB: r6(Number.isFinite(st.RB) ? st.RB : 0),
  };
}

function readDyn(w: F10World, viewDeg: number): F10DispatchResult {
  const p = w.params;
  const d = w.dyn;
  const flags: string[] = [];
  const W = d.holding === 'beam' ? p.beamKg * p.g : d.holding === 'load1' ? p.loadKg * p.g : 0;
  let shown = W * Math.cos(d.aimDeg * DEG) + d.offset;
  if (!d.holding) flags.push('EMPTY');
  if (d.aimDeg >= 3 && d.holding) flags.push('OBLIQUE');
  if (!d.zeroed) flags.push('NOT_ZEROED');
  if (d.holding && w.timeS - d.hungAt < 1.5) {
    // La carga aún se mece en el resorte.
    flags.push('UNSTABLE');
    shown += gaussF10(w) * 0.25 * Math.max(0.2, 1 - (w.timeS - d.hungAt) / 1.5);
  }
  if (Math.abs(viewDeg) > 8) {
    shown += Math.sign(viewDeg) * 2 * p.dyn.resN;
    flags.push('PARALLAX');
  }
  if (shown > p.dyn.rangeN) {
    shown = p.dyn.rangeN;
    flags.push('CLIPPED');
  }
  const qf = [...new Set(flags)];
  raiseFlags(w, qf, 'dyn01');
  const value = quant(shown + gaussF10(w) * 0.01 * p.noiseFactor, p.dyn.resN);
  const r = addReading(w, {
    kind: 'weight', instrumentId: 'dyn01', value, unit: 'N', resolution: p.dyn.resN, uncertainty: p.uB.dynN, sourceObjectIds: ['dyn01', ...(d.holding ? [d.holding] : [])], qualityFlags: qf, trueValue: W,
    target: d.holding ?? 'empty',
  });
  emitF10(w, 'DYN_READ', qf.length ? 'WARN' : 'INFO', { N: value });
  return { ok: true, id: r.id, value };
}

function readTape(w: F10World, target: TapeTarget, viewDeg: number): F10DispatchResult {
  const p = w.params;
  const flags: string[] = [];
  let tv: number;
  switch (target) {
    case 'supA':
    case 'supB':
      tv = w.supports[target === 'supA' ? 'A' : 'B'].s;
      if (w.beam.tipped || w.beam.pivot) flags.push('TIPPED');
      break;
    case 'load1':
      if (w.loads.load1.where !== 'beam') return { ok: false, code: 'NOT_ON_BEAM' };
      tv = w.loads.load1.s;
      break;
    case 'cg': {
      if (w.beam.where !== 'wedge') return { ok: false, code: 'NOT_ON_WEDGE' };
      tv = w.beam.wedgeS;
      if (wedgeTiltF10(w) !== 'level') flags.push('NOT_BALANCED');
      if (Math.abs(w.bench.tiltDeg) > 0.2) flags.push('BENCH_TILTED');
      break;
    }
    case 'L0':
      tv = p.L0mm / 10;
      break;
    default:
      return { ok: false, code: 'NO_OBJECT' };
  }
  const res = p.tapeResCm;
  let shown = tv;
  if (Math.abs(viewDeg) > 8) {
    shown += Math.sign(viewDeg) * 3 * res;
    flags.push('PARALLAX');
  }
  const qf = [...new Set(flags)];
  raiseFlags(w, qf, 'tape01');
  const value = quant(shown, res);
  const r = addReading(w, {
    kind: 'position', instrumentId: 'tape01', value, unit: 'cm', resolution: res, uncertainty: p.uB.tapeCm, sourceObjectIds: ['tape01', target === 'L0' ? 'gauge01' : target === 'cg' ? 'beam01' : target === 'load1' ? 'load1' : target === 'supA' ? 'supportA' : 'supportB'],
    qualityFlags: qf, trueValue: target === 'cg' ? w.cgS : tv, target, setup: beamSetup(w),
  });
  emitF10(w, 'TAPE_READ', qf.length ? 'WARN' : 'INFO', { id: target, cm: value });
  return { ok: true, id: r.id, value };
}

function readCaliper(w: F10World, id: string): F10DispatchResult {
  const sp = w.specimens[id];
  if (!sp) return { ok: false, code: 'NO_OBJECT' };
  const p = w.params;
  const value = quant(sp.dMm, p.caliperResMm);
  const r = addReading(w, {
    kind: 'diameter', instrumentId: 'caliper01', value, unit: 'mm', resolution: p.caliperResMm, uncertainty: p.uB.caliperMm, sourceObjectIds: ['caliper01', id], qualityFlags: [], trueValue: sp.dMm, target: id,
  });
  emitF10(w, 'CALIPER_READ', 'INFO', { mm: value });
  return { ok: true, id: r.id, value };
}

function readCell(w: F10World, id: SupportId): F10DispatchResult {
  const p = w.params;
  const flags: string[] = [];
  const b = w.beam;
  const on = b.where === 'supports';
  const st = staticsF10(w);
  let R = 0;
  if (on && !b.tipped && !b.pivot) {
    R = id === 'A' ? st.RA : st.RB;
    if (!b.seated) {
      // Viga sin asentar (F10-E01): apoya en una arista del filo, se mece y el peso se reparte mal.
      const k = (hashRandom(w.seed, 'seat') > 0.5 ? 1 : -1) * (id === 'A' ? 1 : -1);
      R += k * p.seatBias * st.W;
      flags.push('NOT_SEATED');
    }
  } else if (on && b.pivot && !b.tipped) R = b.pivot === id ? st.W : 0;
  else if (on && b.tipped) R = b.pivot === id ? st.W * 0.6 : 0;
  if (!on) flags.push('NO_BEAM');
  if (b.pivot) flags.push('TIPPED');
  if (b.hand && on) flags.push('HAND_ON');
  if (on && st.span < p.illCondCm) flags.push('ILL_COND');
  if (on && SUPPORTS.some((k) => !w.supports[k].clamped && w.supports[k].driftCm > 0)) flags.push('SUPPORT_MOVED');
  if (on && w.timeS < b.settleUntil) flags.push('UNSTABLE');
  if (w.damaged) flags.push('POST_IMPACT');
  if (!w.cells[id].tared) flags.push('NOT_ZEROED');
  if (!w.cells.connected) flags.push('UNPLUGGED');
  let noise = gaussF10(w) * 0.004 * p.noiseFactor;
  if (flags.includes('UNSTABLE')) noise += gaussF10(w) * 0.3 * Math.max(0.15, (b.settleUntil - w.timeS) / p.settleS);
  if (flags.includes('ILL_COND')) noise += gaussF10(w) * 0.4;
  let shown = R + w.cells[id].offset + noise;
  if (Math.abs(shown) > p.cell.rangeN) {
    shown = Math.sign(shown) * p.cell.rangeN;
    flags.push('CLIPPED');
  }
  const qf = [...new Set(flags)];
  raiseFlags(w, qf, id === 'A' ? 'supportA' : 'supportB');
  const value = w.cells.connected ? quant(shown, p.cell.resN) : NaN;
  const trueR = id === 'A' ? st.RA : st.RB;
  const r = addReading(w, {
    kind: 'reaction', instrumentId: id === 'A' ? 'supportA' : 'supportB', value, unit: 'N', resolution: p.cell.resN, uncertainty: p.uB.cellN, sourceObjectIds: [id === 'A' ? 'supportA' : 'supportB', 'beam01'],
    qualityFlags: qf, trueValue: Number.isFinite(trueR) ? trueR : 0, target: id, setup: beamSetup(w),
  });
  emitF10(w, 'CELL_READ', qf.length ? 'WARN' : 'INFO', { id, N: value });
  return { ok: true, id: r.id, value };
}

// ─────────────────────────── Prensa ───────────────────────────

function pressSetup(w: F10World): PressSetup {
  const sp = specimenOf(w);
  const g = w.gauge;
  const m = materialOf(w);
  return {
    material: w.params.material, dMm: sp?.dMm ?? 0, eccMm: w.press.eccMm, preloadMm: w.press.preloadMm,
    gauge: { mounted: g.mounted, connected: g.connected, zeroed: g.zeroed, calibrated: g.calibrated, angleDeg: g.angleDeg, cableRouted: g.cableRouted, scale: g.scale },
    cell: { connected: w.loadCell.connected, zeroed: w.loadCell.zeroed, range: w.loadCell.rangeIdx },
    rateHz: w.logger.rateHz, trueE: m.E, trueSigmaY: sp?.sigmaY ?? m.sigmaY, epsP: r9(sp?.epsP ?? 0),
  };
}

function installSpecimen(w: F10World, id: string): F10DispatchResult {
  const pr = w.press;
  const sp = w.specimens[id];
  if (!sp) return { ok: false, code: 'NO_OBJECT' };
  if (pr.specimen === id) return { ok: true };
  if (pr.specimen) return { ok: false, code: 'PRESS_BUSY' };
  if (pr.gripTop || pr.gripBottom) return { ok: false, code: 'GRIPPED' };
  pr.specimen = id;
  const h = hashRandom(w.seed, `ecc${id}`) > 0.5 ? 1 : -1;
  pr.eccMm = w.scenarios.includes(SF10.ECCENTRIC) ? 0.25 : w.params.scientificMode === 'REALISTIC' ? Math.round(w.params.eccMm * (0.7 + 0.3 * Math.abs(h)) * 1000) / 1000 : 0;
  pr.preloadMm = 0;
  pr.uRef = pr.u;
  w.trial++;
  updatePress(w);
  emitF10(w, 'SPECIMEN_INSTALLED', 'INFO', { id });
  return { ok: true };
}

function removeSpecimen(w: F10World): F10DispatchResult {
  const pr = w.press;
  if (!pr.specimen) return { ok: true };
  if (pr.gripTop || pr.gripBottom) return { ok: false, code: 'GRIPPED' };
  pr.specimen = null;
  w.gauge.mounted = null;
  pr.preloadMm = 0;
  w.trial++;
  updatePress(w);
  emitF10(w, 'SPECIMEN_REMOVED', 'INFO');
  return { ok: true };
}

function clampGrip(w: F10World, grip: Grip, on: boolean): F10DispatchResult {
  const pr = w.press;
  if (!pr.specimen) return { ok: false, code: 'NO_SPECIMEN' };
  if (grip !== 'top' && grip !== 'bottom') return { ok: false, code: 'UNKNOWN' };
  if (!on && pr.forceN > 50) return { ok: false, code: 'LOADED' };
  const both0 = pr.gripTop && pr.gripBottom;
  if (grip === 'top') pr.gripTop = on;
  else pr.gripBottom = on;
  const both = pr.gripTop && pr.gripBottom;
  if (both && !both0) {
    pr.uRef = pr.u;
    // Cerrar la segunda mordaza con el freno de la manivela puesto: la cuña tira de la probeta contra un travesaño que
    // no puede acompañarla (F10-E19).
    pr.preloadMm = pr.crankLocked ? w.params.preloadMm : 0;
    if (pr.preloadMm > 0) errF10(w, 'E19', 'GRIP_PRELOAD', 'WARN');
    else rearmErrF10(w, 'E19');
  }
  if (!both) pr.preloadMm = 0;
  w.trial++;
  updatePress(w);
  emitF10(w, on ? 'GRIP_CLOSED' : 'GRIP_OPENED', 'INFO', { grip });
  return { ok: true };
}

function setCrank(w: F10World, mm: number): F10DispatchResult {
  const pr = w.press;
  const p = w.params;
  if (pr.crankLocked) return { ok: false, code: 'CRANK_LOCKED' };
  const target = Math.round(clamp(mm, 0, p.crankMaxMm) * 1e4) / 1e4;
  const loading = target > pr.u + 1e-9;
  if (loading && pressGrippedF10(w) && !pr.shieldClosed) {
    // Enclavamiento: con la probeta tomada no se carga con el protector abierto.
    bumpF10(w, 'interlock');
    emitF10(w, 'SHIELD_INTERLOCK', 'WARN');
    return { ok: false, code: 'SHIELD_OPEN' };
  }
  if (Math.abs(target - pr.target) < 1e-9 && pr.speed === p.crankSpeedMmS) return { ok: true, value: target };
  pr.target = target;
  pr.speed = p.crankSpeedMmS;
  w.trial++;
  if (loading && pressGrippedF10(w)) {
    if (pr.eccMm > 0.02) errF10(w, 'E15', 'ECCENTRIC_GRIP', 'WARN', { mm: pr.eccMm });
    const sp = specimenOf(w);
    if (sp?.yielded && w.evidence[`unloaded:${sp.id}`]) {
      // Recargar una probeta ya plastificada como si fuera nueva (F10-E16).
      sp.reloaded = true;
      errF10(w, 'E16', 'RELOAD_PLASTIC', 'WARN');
    }
  }
  return { ok: true, value: target };
}

function releaseCrank(w: F10World): F10DispatchResult {
  const pr = w.press;
  if (!w.params.quickRelease) return { ok: false, code: 'NO_QUICK' };
  if (pr.crankLocked) return { ok: false, code: 'CRANK_LOCKED' };
  pr.target = 0;
  pr.speed = w.params.quickSpeedMmS;
  w.trial++;
  if (pr.forceN > 100) {
    // Descarga brusca (F10-E14): la probeta y el comparador vibran unos segundos.
    pr.transientUntil = r6(w.timeS + w.params.transientS);
    if (w.run && !w.run.done) w.run.quickT ??= r4(w.timeS - w.run.startS);
    errF10(w, 'E14', 'QUICK_UNLOAD', 'WARN', { N: Math.round(pr.forceN) });
  }
  emitF10(w, 'CRANK_RELEASED', 'INFO');
  return { ok: true };
}

function connect(w: F10World, ch: Channel, on: boolean): F10DispatchResult {
  if (ch === 'cells') w.cells.connected = on;
  else if (ch === 'press') w.loadCell.connected = on;
  else if (ch === 'gauge') w.gauge.connected = on;
  else return { ok: false, code: 'UNKNOWN' };
  if (on) {
    rearmErrF10(w, 'E23');
    flagF10(w, `connected:${ch}`);
  }
  emitF10(w, on ? 'CHANNEL_ON' : 'CHANNEL_OFF', 'INFO', { ch });
  return { ok: true };
}

/** Alargamiento que «ve» el comparador (mm, antes de su escala y su cero). */
function gaugeView(w: F10World): number {
  const g = w.gauge;
  const sp = specimenOf(w);
  if (!g.mounted || !sp) return 0;
  const p = w.params;
  const dL = w.press.elongMm;
  if (g.mounted === 'transverse') {
    // Mide el cambio de diámetro: −ν ε d (F10-E11).
    return -materialOf(w).nu * (dL / p.L0mm) * sp.dMm;
  }
  // Mordazas excéntricas (F10-E15): la flexión suma deformación del lado del comparador (8 e / d).
  const bend = pressGrippedF10(w) ? 1 + (8 * w.press.eccMm) / sp.dMm : 1;
  let v = dL * bend * Math.cos(g.angleDeg * DEG);
  // Cable suelto con el protector cerrado: la puerta lo aprieta contra el vástago (F10-E25).
  if (!g.cableRouted && w.press.shieldClosed) v += 0.05;
  return v;
}

const gaugeRaw = (w: F10World) => w.gauge.scale * gaugeView(w);

/** Banderas comunes de la prensa (montaje y estado de la probeta). */
function pressFlags(w: F10World, out: string[], gaugeToo: boolean) {
  const pr = w.press;
  const sp = specimenOf(w);
  if (!sp) out.push('NO_SPECIMEN');
  if (sp && pr.eccMm > 0.02 && pressGrippedF10(w)) out.push('ECCENTRIC');
  if (pr.preloadMm > 0) out.push('PRELOAD');
  if (sp && sp.epsP > 1e-7) out.push('PLASTIC');
  if (sp?.reloaded) out.push('PREDEFORMED');
  if (w.timeS < pr.transientUntil) out.push('TRANSIENT');
  if (loggingF10(w) && w.run!.configChangedT !== null) out.push('CONFIG_CHANGED');
  if (gaugeToo) {
    const g = w.gauge;
    if (!g.mounted) out.push('NO_GAUGE');
    if (g.mounted === 'transverse') out.push('TRANSVERSE');
    if (g.angleDeg >= 3) out.push('TILTED_GAUGE');
    if (!g.cableRouted && pr.shieldClosed) out.push('OCCLUDED');
  }
}

function readLoadCell(w: F10World): F10DispatchResult {
  const p = w.params;
  const c = w.loadCell;
  const pr = w.press;
  const flags: string[] = [];
  pressFlags(w, flags, false);
  if (!c.connected) flags.push('UNPLUGGED');
  if (!c.zeroed) flags.push('NOT_ZEROED');
  if (pressMovingF10(w) || w.timeS - pr.movedAt < p.vibrationS) flags.push('UNSTABLE');
  const range = p.loadCell.ranges[c.rangeIdx];
  const res = p.loadCell.resolutions[c.rangeIdx];
  let shown = pr.forceN + c.offset + gaussF10(w) * p.loadCell.noiseN * p.noiseFactor;
  if (flags.includes('UNSTABLE') || flags.includes('TRANSIENT')) shown += gaussF10(w) * 8;
  if (Math.abs(shown) > range) {
    shown = Math.sign(shown) * range;
    flags.push('CLIPPED');
  }
  const qf = [...new Set(flags)];
  raiseFlags(w, qf, 'loadCell01');
  const value = c.connected ? quant(shown, res) : NaN;
  const r = addReading(w, {
    kind: 'force', instrumentId: 'loadCell01', value, unit: 'N', resolution: res, uncertainty: p.uB.loadCellN, sourceObjectIds: ['loadCell01', pr.specimen ?? 'press01'], qualityFlags: qf, trueValue: pr.forceN,
    target: pr.specimen ?? 'press', press: pressSetup(w), trueForceN: pr.forceN,
  });
  emitF10(w, 'LOADCELL_READ', qf.length ? 'WARN' : 'INFO', { N: value });
  return { ok: true, id: r.id, value };
}

function readGauge(w: F10World): F10DispatchResult {
  const p = w.params;
  const g = w.gauge;
  const pr = w.press;
  const flags: string[] = [];
  pressFlags(w, flags, true);
  if (!g.connected) flags.push('UNPLUGGED');
  if (!g.zeroed) flags.push('NOT_ZEROED');
  if (!g.calibrated) flags.push('UNCALIBRATED');
  if (pressMovingF10(w) || w.timeS - pr.movedAt < p.vibrationS) flags.push('VIBRATION');
  let shown = gaugeRaw(w) + g.offset + gaussF10(w) * p.gauge.noiseMm * p.noiseFactor;
  if (flags.includes('VIBRATION') || flags.includes('TRANSIENT')) shown += gaussF10(w) * 0.004;
  if (Math.abs(shown) > p.gauge.rangeMm) {
    shown = Math.sign(shown) * p.gauge.rangeMm;
    flags.push('CLIPPED');
  }
  const qf = [...new Set(flags)];
  raiseFlags(w, qf, 'gauge01');
  const value = g.connected && g.mounted ? quant(shown, p.gauge.resMm) : NaN;
  const r = addReading(w, {
    kind: 'elong', instrumentId: 'gauge01', value, unit: 'mm', resolution: p.gauge.resMm, uncertainty: p.uB.gaugeMm, sourceObjectIds: ['gauge01', pr.specimen ?? 'press01'], qualityFlags: qf, trueValue: pr.elongMm,
    target: pr.specimen ?? 'press', press: pressSetup(w), trueForceN: pr.forceN,
  });
  emitF10(w, 'GAUGE_READ', qf.length ? 'WARN' : 'INFO', { mm: value });
  return { ok: true, id: r.id, value };
}

function startLog(w: F10World): F10DispatchResult {
  if (loggingF10(w)) return { ok: false, code: 'BUSY' };
  w.trial++;
  const rec: CurveRun = {
    id: w.trial, startS: w.timeS, samples: [], nextT: 0, done: false, configChangedT: null, quickT: null, clippedT: null, peakTrueN: w.press.forceN, setup: pressSetup(w), configVersion: w.configVersion,
  };
  w.run = rec;
  w.runs.push(rec);
  for (const old of w.runs.slice(0, -3)) old.samples = [];
  if (w.runs.length > 12) w.runs.splice(0, w.runs.length - 12);
  emitF10(w, 'LOG_STARTED', 'INFO', { hz: w.logger.rateHz });
  return { ok: true, value: rec.id };
}

/** Ajuste lineal por mínimos cuadrados y = a + b x (null con menos de 3 puntos). */
export function linFitF10(xs: number[], ys: number[]): { a: number; b: number } | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const xm = xs.slice(0, n).reduce((s, x) => s + x, 0) / n;
  const ym = ys.slice(0, n).reduce((s, x) => s + x, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - xm) ** 2;
    sxy += (xs[i] - xm) * (ys[i] - ym);
  }
  if (sxx < 1e-18) return null;
  const b = sxy / sxx;
  return { a: ym - b * xm, b };
}

/** Rigidez del tramo elástico de la carga (N/mm): muestras crecientes entre el 5 % y el 50 % de la fuerza máxima. */
function elasticStiffness(samples: Array<[number, number]>): number | null {
  if (!samples.length) return null;
  const Fm = Math.max(...samples.map((s) => s[0]));
  const iPeak = samples.findIndex((s) => s[0] === Fm);
  const pts = samples.slice(0, iPeak + 1).filter((s) => s[0] > 0.05 * Fm && s[0] < 0.5 * Fm);
  const f = linFitF10(pts.map((s) => s[1]), pts.map((s) => s[0]));
  return f ? f.b : null;
}

const lastRun = (w: F10World) => w.runs[w.runs.length - 1];

function readCurve(w: F10World): F10DispatchResult {
  const rec = lastRun(w);
  if (!rec) return { ok: false, code: 'NO_RUN' };
  if (!rec.done) return { ok: false, code: 'BUSY' };
  const p = w.params;
  const su = rec.setup;
  const flags: string[] = [];
  if (!su.cell.connected || !su.gauge.connected) flags.push('UNPLUGGED');
  if (!su.cell.zeroed || !su.gauge.zeroed) flags.push('NOT_ZEROED');
  if (!su.gauge.calibrated) flags.push('UNCALIBRATED');
  if (!su.gauge.mounted) flags.push('NO_GAUGE');
  if (su.gauge.mounted === 'transverse') flags.push('TRANSVERSE');
  if (su.gauge.angleDeg >= 3) flags.push('TILTED_GAUGE');
  if (!su.gauge.cableRouted) flags.push('OCCLUDED');
  if (su.eccMm > 0.02) flags.push('ECCENTRIC');
  if (su.preloadMm > 0) flags.push('PRELOAD');
  if (su.epsP > 1e-7) flags.push('PREDEFORMED');
  if (su.rateHz < 20) flags.push('LOW_RATE');
  if (rec.clippedT !== null) flags.push('CLIPPED');
  if (rec.configChangedT !== null) flags.push('CONFIG_CHANGED');
  if (rec.quickT !== null) flags.push('TRANSIENT');
  if (rec.samples.length < 3) flags.push('NO_DATA');
  const qf = [...new Set(flags)];
  raiseFlags(w, qf.filter((f) => f !== 'OCCLUDED' || su.gauge.mounted !== null), 'logger01');
  const ind = rec.samples.filter((s) => Number.isFinite(s[1]) && Number.isFinite(s[2]));
  const k = elasticStiffness(ind.map((s) => [s[1], s[2]]));
  const tk = elasticStiffness(rec.samples.map((s) => [s[3], s[4]]));
  const Fmax = ind.length ? Math.max(...ind.map((s) => s[1])) : NaN;
  const res = ind.length ? ind[ind.length - 1][2] : NaN;
  const last = rec.samples[rec.samples.length - 1];
  const value = Number.isFinite(Fmax) ? quant(Fmax, p.loadCell.resolutions[su.cell.range] ?? 1) : NaN;
  const rr = (x: number | null) => (x === null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
  const r = addReading(w, {
    kind: 'curve', instrumentId: 'logger01', value, unit: 'N', resolution: p.loadCell.resolutions[su.cell.range] ?? 1, uncertainty: p.uB.loadCellN, sourceObjectIds: ['logger01', 'loadCell01', 'gauge01'],
    qualityFlags: qf, trueValue: rec.peakTrueN, target: 'press', trial: rec.id, configVersion: rec.configVersion,
    fit: {
      k: rr(k), Fmax: fin(value), res: fin(Number.isFinite(res) ? quant(res, p.gauge.resMm) : NaN), n: rec.samples.length, trueK: rr(tk), trueFmax: fin(rec.peakTrueN), trueRes: fin(last ? last[4] : NaN),
    },
    press: { ...su },
  });
  emitF10(w, 'CURVE_READ', qf.length ? 'WARN' : 'INFO', { N: value, n: rec.samples.length });
  return { ok: true, id: r.id, value };
}

// ─────────────────────────── Cierre y bloqueos ───────────────────────────

function closeStation(w: F10World): F10DispatchResult {
  if (w.press.forceN > 5 || pressMovingF10(w) || tippingF10(w) || w.timeS < w.press.transientUntil) {
    // Desmontar sin llevar el equipo a estado seguro (F10-E40): queda energía o movimiento y el cierre se bloquea.
    errF10(w, 'E40', 'UNSAFE_CLOSE', 'WARN');
    return { ok: false, code: 'NOT_SAFE' };
  }
  if (w.loads.load1.where !== 'rack') return { ok: false, code: 'ITEMS_OUT' };
  if (w.dyn.holding) return { ok: false, code: 'DYN_LOADED' };
  if (w.beam.where !== 'rack') return { ok: false, code: 'BEAM_OUT' };
  if (w.press.target > 1e-9) return { ok: false, code: 'CRANK_NOT_ZERO' };
  if (!w.press.shieldClosed) return { ok: false, code: 'SHIELD_OPEN' };
  if (loggingF10(w)) return { ok: false, code: 'BUSY' };
  rearmErrF10(w, 'E40');
  flagF10(w, 'stationClosed');
  emitF10(w, 'STATION_CLOSED', 'INFO');
  return { ok: true };
}

function acknowledge(w: F10World): F10DispatchResult {
  const b = w.safety.block;
  if (!b) return { ok: true };
  if (b.code === 'BEAM_TIPPED' && (w.beam.tipped || w.beam.pivot)) return { ok: false, code: 'SECURE_FIRST' };
  if (b.code === 'MASS_DROPPED' && w.loads.load1.where === 'bench') return { ok: false, code: 'SECURE_FIRST' };
  w.safety.block = null;
  emitF10(w, 'STATION_RESET', 'INFO', { code: b.code });
  return { ok: true };
}

// ─────────────────────────── Paso: viga ───────────────────────────

function stepBeam(w: F10World, h: number) {
  const b = w.beam;
  const L = w.loads.load1;
  // Carga con el gancho abierto: se suelta y golpea la mesada (F10-E07).
  if (L.where === 'beam' && L.slipAt !== null && w.timeS >= L.slipAt + 0.5) {
    L.where = 'bench';
    L.slipAt = null;
    w.damaged = true;
    bumpF10(w, 'massDropped');
    errF10(w, 'E07', 'MASS_DROPPED', 'CRITICAL');
    w.safety.block = { code: 'MASS_DROPPED', since: w.timeS };
    beamChanged(w);
  }
  if (!b.pivot || b.tipped) return;
  const sp = w.supports[b.pivot].s;
  const I = pivotInertia(w, sp);
  const tau = pivotTorque(w, sp, b.angle);
  // Paso de posición con la aceleración actual y velocidad desde la energía: la gravedad es conservativa, así que
  // ½ I ω² = −U(θ) exacto (sin la deriva de un integrador explícito) hasta el golpe.
  b.angle += b.omega * h + 0.5 * (tau / I) * h * h;
  const K = Math.max(0, -tipPotentialJ(w));
  b.omega = (b.dir > 0 ? 1 : -1) * Math.sqrt((2 * K) / I);
  const end = b.dir > 0 ? w.params.beamLenCm - sp : sp;
  const maxA = Math.atan(w.params.tipDropCm / Math.max(1, end));
  if (Math.abs(b.angle) >= maxA) {
    // El extremo golpea el tope de seguridad: la energía cinética se disipa.
    const E0 = mechanicalEnergyF10(w);
    b.angle = Math.sign(b.angle) * maxA;
    b.omega = 0;
    w.energy.dissipatedJ += E0 - mechanicalEnergyF10(w);
    b.tipped = true;
    b.seated = false;
    w.damaged = true;
    bumpF10(w, 'beamTipped');
    emitF10(w, 'BEAM_TIPPED', 'CRITICAL');
    w.safety.block = { code: 'BEAM_TIPPED', since: w.timeS };
  }
}

// ─────────────────────────── Paso: prensa ───────────────────────────

/** Fuerza y alargamiento de la probeta para el travesaño actual (con la actualización plástica). */
function updatePress(w: F10World): number {
  const pr = w.press;
  const sp = specimenOf(w);
  const p = w.params;
  if (!sp) {
    pr.forceN = 0;
    pr.elongMm = 0;
    return 0;
  }
  const m = materialOf(w);
  const A = areaM2(sp.dMm);
  let sigma = 0;
  if (pr.gripTop && pr.gripBottom) {
    const eps = (pr.u - pr.uRef + pr.preloadMm) / p.L0mm;
    sigma = m.E * (eps - sp.epsP);
    if (sigma > sp.sigmaY) {
      const Et = m.E * p.hardening;
      const H = (m.E * Et) / (m.E - Et);
      const d = (sigma - sp.sigmaY) / (m.E + H);
      sp.epsP = r9(sp.epsP + d);
      sp.sigmaY += H * d;
      sp.yielded = true;
      sigma = m.E * (eps - sp.epsP);
    }
    // Solo trabaja a tracción: al aflojarse queda con su deformación residual.
    if (sigma < 0) sigma = 0;
  }
  pr.forceN = r6(sigma * A);
  pr.elongMm = r9((sp.epsP + sigma / m.E) * p.L0mm);
  if (sp.yielded && pr.forceN < 5) w.evidence[`unloaded:${sp.id}`] = 1;
  return pr.forceN;
}

function stepPress(w: F10World, t0: number, h: number) {
  const pr = w.press;
  const E0 = mechanicalEnergyF10(w);
  const F0 = pr.forceN;
  const du = pr.target - pr.u;
  let moved = 0;
  if (Math.abs(du) > 1e-12) {
    const step = Math.min(Math.abs(du), pr.speed * h);
    moved = Math.sign(du) * step;
    pr.u = r9(pr.u + moved);
    pr.movedAt = r6(t0 + h);
    if (Math.abs(pr.target - pr.u) < 1e-9) {
      pr.u = pr.target;
      pr.speed = w.params.crankSpeedMmS;
    }
  }
  const F1 = updatePress(w);
  if (moved !== 0) {
    const quick = pr.speed > w.params.crankSpeedMmS * 1.5;
    // Trabajo de la manivela (N·mm = mJ). En la descarga rápida la energía elástica no vuelve a la manivela: se disipa.
    const dW = quick && moved < 0 ? 0 : 0.5 * (F0 + F1) * moved * 1e-3;
    w.energy.externalJ += dW;
    w.energy.crankJ += dW;
    const dissip = dW - (mechanicalEnergyF10(w) - E0);
    w.energy.dissipatedJ += dissip;
    if (!quick) w.energy.plasticJ += dissip;
  }
  const run = w.run && !w.run.done ? w.run : null;
  if (run) {
    const tRel = t0 + h - run.startS;
    run.peakTrueN = Math.max(run.peakTrueN, pr.forceN);
    sampleRun(w, run, tRel);
  }
}

/** Registrador: [t, F indicada, ΔL indicado, F verdadera, ΔL verdadero] al ritmo elegido. */
function sampleRun(w: F10World, run: CurveRun, tRel: number) {
  const p = w.params;
  while (run.nextT <= tRel + 1e-9) {
    const c = w.loadCell;
    const g = w.gauge;
    const range = p.loadCell.ranges[c.rangeIdx];
    let F = w.press.forceN + c.offset + gaussF10(w) * p.loadCell.noiseN * p.noiseFactor;
    if (Math.abs(F) > range) {
      F = Math.sign(F) * range;
      run.clippedT ??= r4(run.nextT);
    }
    const dL = gaugeRaw(w) + g.offset + gaussF10(w) * p.gauge.noiseMm * p.noiseFactor;
    run.samples.push([r6(run.nextT), c.connected ? r4(F) : NaN, g.connected && g.mounted ? r6(dL) : NaN, r6(w.press.forceN), r9(w.press.elongMm)]);
    run.nextT = r6(run.nextT + 1 / w.logger.rateHz);
    if (run.samples.length > 4000) run.done = true;
  }
}

// ─────────────────────────── Paso de simulación ───────────────────────────

export function stepF10World(w: F10World): void {
  const dt = w.params.dtS;
  const n = Math.max(1, w.params.subSteps);
  const hh = dt / n;
  const tStart = w.timeS;
  w.timeS = Math.round((w.timeS + dt) * 1e6) / 1e6;
  w.tick++;
  for (let i = 0; i < n; i++) {
    stepBeam(w, hh);
    stepPress(w, tStart + i * hh, hh);
  }
  w.beam.angle = r9(w.beam.angle);
  w.beam.omega = r9(w.beam.omega);
  tipCheck(w);
}

export function runF10For(w: F10World, seconds: number) {
  const n = Math.round(seconds / w.params.dtS);
  for (let i = 0; i < n; i++) stepF10World(w);
}

export function f10Summary(w: F10World) {
  return {
    sA: w.supports.A.s,
    sB: w.supports.B.s,
    load: w.loads.load1.where === 'beam' ? w.loads.load1.s : -1,
    angle: r6(w.beam.angle),
    u: r6(w.press.u),
    F: r4(w.press.forceN),
    trial: w.trial,
    readings: w.readingOrder.length,
    cfg: w.configVersion,
  };
}

export { SUPPORTS, SPECIMENS };
