/**
 * Mundo de la Práctica 7 — enlaces y propiedades: paso fijo determinista (§6).
 *
 * - Materia: inventario por componente (g) en fase polar, fase apolar y sólido sin disolver de cada recipiente; las
 *   herramientas (gotero, espátula, película de la sonda), los derrames y los residuos también son compartimentos. Nada
 *   se crea ni se borra (§6.5); los iones se derivan de lo disuelto (conservation.ts).
 * - Mezcla: el destino de cada líquido lo decide su par soluto–disolvente con ficha (solvent-pairs.ts); un par sin
 *   ficha no se simula (§6.2). Los sólidos se disuelven hacia el equilibrio de solubilidad; agitar acelera, nunca
 *   cambia c_sat (§3.2). Dos líquidos inmiscibles forman dos fases; agitar fuerte deja una emulsión pasajera.
 * - Detector de sólidos: fuente limitada, resistencia de contacto (óxido), resistividad efectiva de la muestra con
 *   su recorrido (anisotropía del grafito) y película superficial (sal húmeda); I = V/R_total (§3.5).
 * - Conductímetro: κ del contenido realmente muestreado (fase en la que está la celda), temperatura con su sonda,
 *   factor de celda real y calibración, compensación de temperatura, película arrastrada, rango y estabilidad (§3.4).
 */
import type { GloveType, P07Command, P07DispatchResult, PpeItem } from './commands';
import type { Comp, MaterialId, P07Object, P07Params, P07World, Pose, Reading07, ReadingSnapshot, SpecimenState, SurfaceHit, Vessel } from './types';
import { hashRandom, rand } from '../core/rng';
import { bump07, emit07, err07, flag07, gauss07, latch07 } from './events';
import { FLASK_MARK_Z, GEO07, liquidHeightCm } from './geometry';
import { MATERIALS, isLiquid, usable } from '../solution-properties/materials';
import { pairValidated, solventPair } from '../solution-properties/solvent-pairs';
import { dissolveStep, equilibriumDissolvedG } from '../solution-properties/solubility';
import { conductivityAtConcentration, temperatureFactor, TEMP_ALPHA_PER_K } from '../solution-properties/conductivity';
import { aqueousIons, compAddInto, compTake, compTotal, formalM, liquidMl, materialsIn } from '../solution-properties/conservation';
import { quantize } from '../metrology/uncertainty';
import { balanceIndication, newAnalyticalBalance, stepAnalyticalBalance } from '../instruments/analytical-balance';

export { emit07, latch07, bump07, flag07, err07 } from './events';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const sc = (w: P07World, s: string) => w.scenarios.includes(s);

/** Escenarios docentes (§10). */
export const S = {
  STANDARD: 'P07-S01_standard',
  PROBE_NOT_RINSED: 'P07-S02_probe_not_rinsed',
  BALANCE_OFFSET: 'P07-S03_balance_offset',
  DRY_IONIC_CRYSTAL: 'P07-S04_dry_ionic_crystal',
  HUMID_CRYSTAL: 'P07-S05_humid_crystal',
  OXIDIZED_ALUMINUM: 'P07-S06_oxidized_aluminum',
  WEAK_ACID: 'P07-S07_weak_acid',
  GRAPHITE_SAMPLE: 'P07-S08_graphite_sample',
  SOLUBILITY_LIMIT: 'P07-S09_solubility_limit',
  UNKNOWNS_BLINDED: 'P07-S10_unknowns_blinded',
  WRONG_RANGE: 'P07-S11_conductivity_wrong_range',
  SUGAR_WITH_SALT: 'P07-S12_sugar_with_salt_trace',
  MULTIPHASE: 'P07-S13_multiphase',
  COMMERCIAL_SOLVENT: 'P07-S14_commercial_solvent_disabled',
  PROBE_TEMPERATURE: 'P07-S15_probe_temperature',
  UNVERIFIED_ALLOY: 'P07-S16_unverified_alloy',
} as const;

export interface BondingWorldSpec {
  objects: P07Object[];
  vessels: Vessel[];
  specimens: SpecimenState[];
  unknowns: P07World['unknowns'];
  scenarios: string[];
  mode: string;
}

/** Líquidos que se integran a la fase POLAR (los demás, a la apolar). */
const POLAR_LIQUIDS = new Set<MaterialId>(['water', 'glycerol', 'ethanol', 'isopropanol', 'acetone', 'acetic']);
/** Frascos de disolventes orgánicos que no deben quedar abiertos (L08) y que exigen guantes de nitrilo (L03). */
const ORGANIC = new Set<MaterialId>(['heptane', 'mineralOil', 'acetone', 'ethanol', 'isopropanol', 'petEther']);
const LATEX_INCOMPATIBLE = new Set<MaterialId>(['heptane', 'mineralOil', 'acetone', 'petEther']);
/** Conductividad propia de líquidos puros (S/m) `[PENDIENTE]`; el agua usa el fondo de los parámetros. */
const INTRINSIC_S_PER_M: Partial<Record<MaterialId, number>> = { ethanol: 1.5e-5, isopropanol: 6e-6, acetone: 5e-6, glycerol: 6e-6, acetic: 6e-5, heptane: 1e-11, mineralOil: 1e-11 };
/** Caudal de vertido por forma (mL/s a 30° sobre el umbral). */
const POUR_K: Record<string, number> = { bottle250: 6, bottle100: 4, cylinder10: 1.6, tube: 1.2, beaker50: 3, flask100: 3, vial: 2.5 };
/** Película que queda al vaciar (mL de líquido). */
const HOLD_ML: Record<string, number> = { tube: 0.05, cylinder10: 0.08, beaker50: 0.25, flask100: 0.3, bottle100: 0.3, bottle250: 0.4, vial: 0.2, watchGlass: 0.02, jar: 0 };
const CONTACT_GAP_CM = 0.02;
const DETECTOR_PAD = 'det01pad';
const PAD_OHM = 100;

// ─────────────────────────── Creación ───────────────────────────

export function createBondingWorld(spec: BondingWorldSpec, seed: number, params: P07Params): P07World {
  const has = (s: string) => spec.scenarios.includes(s);
  const objects: Record<string, P07Object> = {};
  for (const o of spec.objects) objects[o.id] = { ...o, pose: { ...o.pose } };
  const vessels: Record<string, Vessel> = {};
  for (const v of spec.vessels) vessels[v.id] = structuredClone(v);
  const specimens: Record<string, SpecimenState> = {};
  for (const sp of spec.specimens) specimens[sp.id] = { ...sp };
  const w: P07World = {
    schemaVersion: 1, timeS: 0, tick: 0, seed, rng: seed >>> 0 || 1, params, mode: spec.mode, objects, vessels, pours: {},
    droppers: { dp1: { content: {}, lastPhase: null, squeeze01: 0, from: [] }, dp2: { content: {}, lastPhase: null, squeeze01: 0, from: [] } },
    spatula: { load: {}, residue: {}, from: [] },
    specimens,
    detector: { powered: false, range: 'HIGH', cablesOk: true, controlTest: 'none', inspected: false, a: null, b: null, contactSince: null, currentMA: 0, shownMA: 0, indicator01: 0 },
    meter: {
      powered: false, range: has(S.WRONG_RANGE) ? 'LOW' : 'MID', atc: true, standardSetting: 1413,
      cellError: 1 + (hashRandom(seed, 'cell') - 0.5) * 0.08 + 0.03, calibFactor: 1, calibratedWith: null, inspected: false,
      vesselId: null, immersionCm: 0, bottomContact: false, probeTempC: has(S.PROBE_TEMPERATURE) ? params.initialTemperatureC + 7 : params.initialTemperatureC,
      film: has(S.PROBE_NOT_RINSED) ? { water: 0.05, NaCl: 0.0025 } : { water: 0.04 }, filmFrom: has(S.PROBE_NOT_RINSED) ? 'previous' : null,
      shownSPerM: 0, refSPerM: 0, quietS: 0, stable: false,
    },
    balance: { ...newAnalyticalBalance({ levelErrorDeg: 0, doorsOpen: false }), powered: false, panIds: [], zeroBiasG: has(S.BALANCE_OFFSET) ? 0.12 : 0, tareSession: 0 },
    spills: { bench: {}, electrics: {} },
    unknowns: structuredClone(spec.unknowns),
    readings: {}, readingOrder: [],
    safety: { ppe: { coat: false, goggles: false, shoes: false, gloves: 'none' }, block: null, stoppedByTeacher: false },
    events: [], evidence: {}, scenarios: [...spec.scenarios], ppe: false, paused: false,
    initialTotals: {},
  };
  w.initialTotals = materialTotals(w);
  return w;
}

// ─────────────────────────── Consultas ───────────────────────────

export const vesselMl = (v: Vessel) => liquidMl(v.polar) + liquidMl(v.apolar);
export const vesselG = (v: Vessel) => compTotal(v.polar) + compTotal(v.apolar) + compTotal(v.solid);
/** Altura de cada fase (cm sobre el fondo interior): la polar (más densa en este inventario) queda abajo. */
export function phaseHeights(v: Vessel): { polar: number; total: number } {
  return { polar: liquidHeightCm(v.shape, liquidMl(v.polar)), total: liquidHeightCm(v.shape, vesselMl(v)) };
}
/** Nivel de la superficie (cm sobre la mesada) de un recipiente apoyado. */
export function surfaceZ(w: P07World, id: string): number {
  const v = w.vessels[id];
  const o = w.objects[id];
  if (!v || !o) return 0;
  return o.pose.z + v.floorCm + phaseHeights(v).total;
}

/** Inventario total de cada componente en todo el mundo (§6.5). */
export function materialTotals(w: P07World): Comp {
  const t: Comp = {};
  for (const v of Object.values(w.vessels)) {
    compAddInto(t, v.polar);
    compAddInto(t, v.apolar);
    compAddInto(t, v.solid);
  }
  for (const d of Object.values(w.droppers)) compAddInto(t, d.content);
  compAddInto(t, w.spatula.load);
  compAddInto(t, w.spatula.residue);
  compAddInto(t, w.meter.film);
  compAddInto(t, w.spills.bench);
  compAddInto(t, w.spills.electrics);
  for (const sp of Object.values(w.specimens)) {
    if (sp.surfaceWaterG > 0) t.water = (t.water ?? 0) + sp.surfaceWaterG;
    if (sp.surfaceSaltG > 0) t.NaCl = (t.NaCl ?? 0) + sp.surfaceSaltG;
  }
  return t;
}

export function conservedTotals(w: P07World): Record<string, number> {
  const t = materialTotals(w);
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(t)) out[k] = Math.round((v ?? 0) * 1e9) / 1e9;
  return out;
}

/** κ verdadero (S/m) de la fase polar de un recipiente a SU temperatura. */
export function trueKappaSPerM(w: P07World, v: Vessel, phase: 'polar' | 'apolar' = 'polar'): number {
  const ph = phase === 'polar' ? v.polar : v.apolar;
  const ml = liquidMl(ph);
  if (ml <= 1e-6) return 0;
  let bg = 0;
  for (const [k, g] of Object.entries(ph) as Array<[MaterialId, number]>) {
    if (!isLiquid(k)) continue;
    const frac = (g / MATERIALS[k].densityGml) / ml;
    bg += frac * (k === 'water' ? w.params.waterBackgroundSPerM : INTRINSIC_S_PER_M[k] ?? 0);
  }
  if (phase === 'apolar' || !(ph.water && ph.water > 0)) return bg;
  return (conductivityAtConcentration(aqueousIons(ph)) + bg) * temperatureFactor(v.tempC);
}

/** Masa iónica disuelta (mol de iones) en una composición, para decidir si una película contamina. */
function ionicMol(c: Comp): number {
  let mol = 0;
  for (const [k, g] of Object.entries(c) as Array<[MaterialId, number]>) {
    const m = MATERIALS[k];
    if (m.molarMassGmol && (m.dissociation || m.weakAcid)) mol += (g ?? 0) / m.molarMassGmol;
  }
  return mol;
}

const isVessel = (w: P07World, id: string | null | undefined): id is string => !!id && !!w.vessels[id];

/** Disolvente dominante de cada fase (para elegir el par con ficha). */
function solventsOf(v: Vessel): Array<'water' | 'heptane'> {
  const out: Array<'water' | 'heptane'> = [];
  if ((v.polar.water ?? 0) > 0.01) out.push('water');
  if ((v.apolar.heptane ?? 0) > 0.01) out.push('heptane');
  return out;
}

// ─────────────────────────── Comandos ───────────────────────────

const BEFORE_PPE = new Set<P07Command['type']>(['setPPE', 'setGloves', 'startWork', 'teacherStop', 'acknowledge', 'inspect', 'pause']);
const DURING_BLOCK = new Set<P07Command['type']>(['acknowledge', 'teacherStop', 'cleanSpill', 'inspect', 'setPose', 'setCap', 'pause', 'setPPE', 'setGloves']);

export function dispatchP07(w: P07World, cmd: P07Command): P07DispatchResult {
  if (w.safety.stoppedByTeacher && cmd.type !== 'teacherStop') return { ok: false, code: 'TEACHER_STOP' };
  if (!w.ppe && !BEFORE_PPE.has(cmd.type)) {
    // L01/L02: tocar materiales sin el equipo bloquea el montaje y no cambia ninguna cantidad.
    if (!w.safety.ppe.goggles) err07(w, 'no_goggles', 'PPE_GOGGLES_MISSING', 'ALERT');
    if (!w.safety.ppe.coat) err07(w, 'no_coat', 'PPE_COAT_MISSING', 'ALERT');
    return { ok: false, code: 'PPE' };
  }
  if (w.safety.block && w.safety.block.code === 'UNCAPPED' && !DURING_BLOCK.has(cmd.type)) return { ok: false, code: 'UNCAPPED' };
  switch (cmd.type) {
    case 'setPPE':
      w.safety.ppe[cmd.item] = cmd.enabled;
      return { ok: true };
    case 'setGloves':
      w.safety.ppe.gloves = cmd.gloves;
      return { ok: true };
    case 'startWork':
      return startWork(w);
    case 'inspect':
      return inspect(w, cmd.target);
    case 'setPose':
      return setPose(w, cmd.id, cmd.pose, cmd.support);
    case 'setCap':
      return setCap(w, cmd.vesselId, cmd.capped);
    case 'labelTube':
      if (!w.objects[cmd.tubeId]) return { ok: false, code: 'NO_OBJECT' };
      w.objects[cmd.tubeId].label = cmd.label.slice(0, 24);
      return { ok: true };
    case 'powerBalance':
      return powerBalance(w, cmd.on);
    case 'tare':
      return tare(w);
    case 'readBalance':
      return readBalance(w);
    case 'setPour':
      return setPour(w, cmd.sourceId, cmd.targetId, cmd.tiltDeg);
    case 'stopPour': {
      const pr = w.pours[cmd.sourceId];
      if (!pr) return { ok: true };
      delete w.pours[cmd.sourceId];
      emit07(w, 'POUR_DONE', 'INFO', { g: Math.round(pr.transferredG * 100) / 100, from: cmd.sourceId, to: pr.targetId ?? 'bench' });
      return { ok: true, value: pr.transferredG };
    }
    case 'setDropper': {
      const d = w.droppers[cmd.dropperId];
      if (!d) return { ok: false, code: 'NO_OBJECT' };
      d.squeeze01 = clamp(cmd.squeeze01, -1, 1);
      return { ok: true };
    }
    case 'scoop':
      return scoop(w, cmd.sourceId);
    case 'dropSpatula':
      return dropSpatula(w, cmd.targetId);
    case 'cleanTool':
      return cleanTool(w, cmd.toolId);
    case 'squeezeWash':
      return squeezeWash(w, cmd.targetId, cmd.ml);
    case 'setStir':
      return setStir(w, cmd.vesselId, cmd.motion01);
    case 'readVolume':
      return readVolume(w, cmd.vesselId, cmd.eyeDzCm);
    case 'observe':
      return observe(w, cmd.vesselId);
    case 'dispose':
      return dispose(w, cmd.vesselId, cmd.wasteId);
    case 'rotateSpecimen': {
      const sp = w.specimens[cmd.specimenId];
      if (!sp) return { ok: false, code: 'NO_OBJECT' };
      sp.orientation = sp.orientation === 'flat' ? 'edge' : 'flat';
      openCircuit(w);
      return { ok: true };
    }
    case 'wetSpecimen':
      return wetSpecimen(w, cmd.specimenId);
    case 'drySpecimen':
      return drySpecimen(w, cmd.specimenId);
    case 'powerDetector':
      if (cmd.on && compTotal(w.spills.electrics) > 0.3) {
        err07(w, 'wet_electrics', 'WET_ELECTRICS', 'CRITICAL');
        w.safety.block = { code: 'WET_ELECTRICS', since: w.timeS };
        return { ok: false, code: 'WET_ELECTRICS' };
      }
      w.detector.powered = cmd.on;
      return { ok: true };
    case 'setDetectorRange':
      w.detector.range = cmd.range;
      return { ok: true };
    case 'setDetectorCables':
      w.detector.cablesOk = cmd.connected;
      if (!cmd.connected) w.detector.controlTest = w.detector.controlTest === 'passed' ? 'none' : w.detector.controlTest;
      return { ok: true };
    case 'setElectrodeContacts':
      return setContacts(w, cmd.a, cmd.b);
    case 'readDetector':
      return readDetector(w);
    case 'powerMeter':
      if (cmd.on && compTotal(w.spills.electrics) > 0.3) {
        err07(w, 'wet_electrics', 'WET_ELECTRICS', 'CRITICAL');
        w.safety.block = { code: 'WET_ELECTRICS', since: w.timeS };
        return { ok: false, code: 'WET_ELECTRICS' };
      }
      w.meter.powered = cmd.on;
      return { ok: true };
    case 'setMeterRange':
      w.meter.range = cmd.range;
      w.meter.quietS = 0;
      w.meter.stable = false;
      return { ok: true };
    case 'setAtc':
      w.meter.atc = cmd.on;
      w.meter.quietS = 0;
      w.meter.stable = false;
      return { ok: true };
    case 'setStandard':
      w.meter.standardSetting = cmd.value;
      return { ok: true };
    case 'setProbeDepth':
      return setProbeDepth(w, cmd.vesselId, cmd.immersionCm, cmd.bottomContact);
    case 'rinseProbe':
      return rinseProbe(w, cmd.wasteId);
    case 'calibrateConductivity':
      return calibrate(w, cmd.standardId);
    case 'readConductivity':
      return readConductivity(w);
    case 'cleanSpill':
      return cleanSpill(w, cmd.where);
    case 'pause':
      return pause(w, cmd.on);
    case 'acknowledge':
      return acknowledge(w);
    case 'teacherStop':
      w.safety.stoppedByTeacher = cmd.on;
      return { ok: true };
  }
  return { ok: false, code: 'UNKNOWN' };
}

// ─────────────────────────── Seguridad e inspección ───────────────────────────

const PPE_ERR: Record<PpeItem, [string, string]> = {
  goggles: ['no_goggles', 'PPE_GOGGLES_MISSING'],
  coat: ['no_coat', 'PPE_COAT_MISSING'],
  shoes: ['no_shoes', 'PPE_SHOES_MISSING'],
};

function startWork(w: P07World): P07DispatchResult {
  const missing = (Object.keys(PPE_ERR) as PpeItem[]).filter((k) => !w.safety.ppe[k]);
  const glovesMissing = w.safety.ppe.gloves === 'none';
  if (missing.length || glovesMissing) {
    for (const k of missing) err07(w, PPE_ERR[k][0], PPE_ERR[k][1], 'ALERT');
    if (glovesMissing) emit07(w, 'PPE_GLOVES_MISSING', 'ALERT');
    return { ok: false, code: 'PPE_MISSING' };
  }
  w.ppe = true;
  flag07(w, 'ppe');
  emit07(w, 'PPE_OK', 'INFO', { gloves: w.safety.ppe.gloves });
  return { ok: true };
}

function inspect(w: P07World, target: string): P07DispatchResult {
  flag07(w, `inspected:${target}`);
  const p = w.params;
  switch (target) {
    case 'det01': {
      const d = w.detector;
      d.inspected = true;
      emit07(w, 'INSPECT_DETECTOR', 'INFO', { v: p.detectorVoltageV, th: p.detectorThresholdMA });
      if (!d.cablesOk) emit07(w, 'DETECTOR_CABLE_LOOSE', 'WARN');
      break;
    }
    case 'cond01':
      w.meter.inspected = true;
      emit07(w, 'INSPECT_METER', 'INFO', { range: w.meter.range, atc: w.meter.atc ? 1 : 0, cal: w.meter.calibratedWith ? 1 : 0 });
      if (ionicMol(w.meter.film) > 1e-7) emit07(w, 'PROBE_RESIDUE_FOUND', 'WARN');
      break;
    case 'balance01':
      emit07(w, 'INSPECT_BALANCE', 'INFO', { res: p.balance.resolutionG, cap: p.balance.capacityG });
      break;
    case 'stdUnknown':
      emit07(w, 'STANDARD_UNVERIFIED', 'WARN');
      break;
    case 'jarDamaged':
      emit07(w, 'LABEL_DAMAGED', 'WARN');
      break;
    case 'jarNaOH':
      emit07(w, 'RESTRICTED_SAMPLE', 'WARN');
      break;
    case 'btPetEther':
      emit07(w, 'PAIR_PENDING', 'WARN', { obj: 'btPetEther' });
      break;
    default: {
      const v = w.vessels[target];
      if (v) emit07(w, 'INSPECTED_VESSEL', 'INFO', { obj: target, ml: Math.round(vesselMl(v) * 10) / 10 });
      else emit07(w, 'INSPECTED', 'INFO', { obj: target });
    }
  }
  return { ok: true };
}

function setCap(w: P07World, id: string, capped: boolean): P07DispatchResult {
  const v = w.vessels[id];
  if (!v || v.capped === undefined) return { ok: false, code: 'NO_CAP' };
  v.capped = capped;
  if (capped && w.safety.block?.code === 'UNCAPPED' && !uncappedSolvents(w).length) {
    w.safety.block = null;
    emit07(w, 'BLOCK_CLEARED', 'INFO');
  }
  return { ok: true };
}

const uncappedSolvents = (w: P07World) =>
  Object.values(w.vessels).filter((v) => v.capped === false && materialsIn({ ...v.polar, ...v.apolar }).some((m) => ORGANIC.has(m)));

/** L08: pausar con un frasco de disolvente abierto deja la mesada en condición insegura. */
function pause(w: P07World, on: boolean): P07DispatchResult {
  w.paused = on;
  if (on && uncappedSolvents(w).length) {
    err07(w, 'solvent_uncapped', 'SOLVENT_UNCAPPED', 'ALERT', { obj: uncappedSolvents(w)[0].id });
    if (w.mode === 'EVALUATION') w.safety.block = { code: 'UNCAPPED', since: w.timeS };
  }
  return { ok: true };
}

function acknowledge(w: P07World): P07DispatchResult {
  const b = w.safety.block;
  if (!b) return { ok: true };
  if (b.code === 'WET_ELECTRICS' && compTotal(w.spills.electrics) > 0.3) return { ok: false, code: 'STILL_WET' };
  if (b.code === 'UNCAPPED' && uncappedSolvents(w).length) return { ok: false, code: 'UNCAPPED' };
  w.safety.block = null;
  emit07(w, 'BLOCK_CLEARED', 'INFO');
  return { ok: true };
}

/** L03 y L10: protección incompatible con el disolvente o muestra de acceso restringido. */
function handlingRefused(w: P07World, sourceId: string): string | null {
  const v = w.vessels[sourceId];
  if (!v) return null;
  const mats = materialsIn({ ...v.polar, ...v.apolar, ...v.solid });
  if (mats.some((m) => MATERIALS[m].status === 'restricted') && !w.params.allowRestricted) {
    err07(w, 'restricted_sample', 'RESTRICTED_SAMPLE', 'CRITICAL', { obj: sourceId });
    return 'RESTRICTED';
  }
  if (mats.some((m) => MATERIALS[m].status === 'pending')) {
    emit07(w, 'PAIR_PENDING', 'WARN', { obj: sourceId });
    return 'PAIR_PENDING';
  }
  if (w.safety.ppe.gloves === 'latex' && mats.some((m) => LATEX_INCOMPATIBLE.has(m))) {
    err07(w, 'incompatible_gloves', 'GLOVES_INCOMPATIBLE', 'ALERT', { obj: sourceId });
    return 'GLOVES';
  }
  if (v.capped) return 'CAPPED';
  return null;
}

// ─────────────────────────── Poses y apoyos ───────────────────────────

function setPose(w: P07World, id: string, pose: Pose, support?: string): P07DispatchResult {
  const o = w.objects[id];
  if (!o) return { ok: false, code: 'NO_OBJECT' };
  const prev = o.support;
  if (support && support !== prev) {
    // El frasco de NaOH no se toma sin permiso docente (L10).
    if (support === 'hand' && o.kind === 'jar' && (w.vessels[id]?.solid.NaOH ?? 0) > 0 && !w.params.allowRestricted) {
      err07(w, 'restricted_sample', 'RESTRICTED_SAMPLE', 'CRITICAL', { obj: id });
      return { ok: false, code: 'RESTRICTED' };
    }
    if (prev === 'pan') leavePan(w, id);
    if (support === 'pan') enterPan(w, id);
    // Puntas del detector dentro de un líquido: mal uso del instrumento (L39).
    if (o.kind === 'tip' && isVessel(w, support) && vesselMl(w.vessels[support]) > 0.2) {
      err07(w, 'instrument_misuse', 'INSTRUMENT_MISUSE', 'WARN', { obj: support });
    }
    if (o.kind === 'stirRod' && !isVessel(w, support)) for (const v of Object.values(w.vessels)) if (v.stir01 > 0) v.stir01 = 0;
  }
  o.pose = { ...pose };
  if (support) o.support = support;
  return { ok: true };
}

function enterPan(w: P07World, id: string) {
  const b = w.balance;
  if (!b.panIds.includes(id)) b.panIds.push(id);
  b.disturbedAt = w.timeS;
  b.stable = false;
  b.quietS = 0;
}

function leavePan(w: P07World, id: string) {
  const b = w.balance;
  b.panIds = b.panIds.filter((x) => x !== id);
  b.disturbedAt = w.timeS;
  b.stable = false;
  b.quietS = 0;
}

// ─────────────────────────── Balanza ───────────────────────────

/** Masa física sobre el platillo (g): objetos vacíos + contenido + lo que tengan encima. */
export function panLoadG(w: P07World): number {
  let g = 0;
  const seen = new Set<string>();
  const add = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const o = w.objects[id];
    if (!o) return;
    g += o.massG ?? 0;
    const v = w.vessels[id];
    if (v) g += vesselG(v);
    for (const other of Object.values(w.objects)) if (other.support === id && other.kind !== 'tip' && other.kind !== 'probe') add(other.id);
  };
  for (const id of w.balance.panIds) add(id);
  return g;
}

const zeroBias = (w: P07World) => w.balance.zeroBiasG;

function powerBalance(w: P07World, on: boolean): P07DispatchResult {
  const b = w.balance;
  if (on === b.powered) return { ok: true };
  b.powered = on;
  if (on) {
    b.tareG = balanceIndication({ ...b, tareG: 0 }, panLoadG(w), w.params.balance, w.timeS);
    b.shownG = 0;
    b.refG = 0;
    b.taredAt = w.timeS;
    b.tareSession += 1;
    b.disturbedAt = w.timeS;
    w.evidence.__tareLoad = panLoadG(w);
    w.evidence.__tareIds = 0;
    emit07(w, 'BALANCE_ON', 'INFO');
  }
  return { ok: true };
}

function hashIds(ids: string[]): number {
  let h = 7;
  for (const id of [...ids].sort()) for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 1000003;
  return ids.length ? h : 0;
}

function tare(w: P07World): P07DispatchResult {
  const b = w.balance;
  if (!b.powered) return { ok: false, code: 'BALANCE_OFF' };
  const load = panLoadG(w);
  b.tareG = balanceIndication({ ...b, tareG: 0 }, load, w.params.balance, w.timeS) + b.noiseG;
  b.shownG = 0;
  b.refG = 0;
  b.taredAt = w.timeS;
  b.disturbedAt = w.timeS;
  b.tareSession += 1;
  b.stable = false;
  b.quietS = 0;
  w.evidence.__tareLoad = load;
  // Qué había en el platillo al tarar y cuánto contenían (para detectar «sin tarar», L15).
  w.evidence.__tareIds = hashIds(b.panIds);
  w.evidence.__tareContentG = b.panIds.reduce((s, id) => s + (w.vessels[id] ? vesselG(w.vessels[id]) : 0), 0);
  flag07(w, 'tared');
  return { ok: true };
}

function readBalance(w: P07World): P07DispatchResult {
  const b = w.balance;
  if (!b.powered) return { ok: false, code: 'BALANCE_OFF' };
  const p = w.params;
  const load = panLoadG(w);
  const flags: string[] = [];
  const shown = quantize(b.shownG, p.balance.resolutionG);
  const ids = [...b.panIds];
  if (!b.stable) flags.push('UNSTABLE');
  // L15: un soporte con muestra pesado sin haber tarado ese soporte vacío: la lectura incluye el vidrio.
  const glass = ids.find((id) => w.objects[id]?.kind === 'watchGlass' || w.objects[id]?.kind === 'beaker');
  if (glass && w.evidence.__tareIds !== hashIds(ids) && vesselG(w.vessels[glass]) > 0.005) {
    flags.push('NO_TARE');
    err07(w, 'untared_balance', 'UNTARED_BALANCE');
  }
  const mats = ids.flatMap((id) => (w.vessels[id] ? materialsIn({ ...w.vessels[id].polar, ...w.vessels[id].apolar, ...w.vessels[id].solid }) : []));
  const r = addReading(w, {
    kind: 'mass', instrumentId: 'balance01', targetId: ids[0] ?? 'pan', value: shown, unit: 'g', resolution: p.balance.resolutionG,
    standardUncertainty: p.balance.uncertaintyG, valid: b.stable, stable: b.stable, qualityFlags: flags, trueValue: load - (w.evidence.__tareLoad ?? 0),
    snapshot: { materials: [...new Set(mats)], tareSession: b.tareSession },
  });
  if (b.stable) emit07(w, 'MASS_READ', 'INFO', { g: shown });
  else emit07(w, 'MASS_UNSTABLE', 'WARN');
  return { ok: b.stable, id: r.id, value: shown };
}

// ─────────────────────────── Lecturas ───────────────────────────

function addReading(w: P07World, r: Omit<Reading07, 'id' | 't' | 'tick'>): Reading07 {
  const n = w.readingOrder.length + 1;
  const prefix = { mass: 'm', volume: 'v', temperature: 't', conductivity: 'k', current: 'i', observation: 'o' }[r.kind];
  const reading: Reading07 = { ...r, id: `${prefix}${n}`, t: w.timeS, tick: w.tick };
  w.readings[reading.id] = reading;
  w.readingOrder.push(reading.id);
  return reading;
}

/** Probeta, vaso, matraz o gotero: lectura de escala con paralaje según la altura real del ojo (§14.1). */
function readVolume(w: P07World, vesselId: string, eyeDzCm: number): P07DispatchResult {
  const isDropper = !!w.droppers[vesselId];
  const v = w.vessels[vesselId];
  if (!v && !isDropper) return { ok: false, code: 'NO_OBJECT' };
  const ml = isDropper ? liquidMl(w.droppers[vesselId].content) : vesselMl(v!);
  const shape = isDropper ? 'dropper' : v!.shape;
  const div = shape === 'cylinder10' ? w.params.cylinderDivisionMl : shape === 'dropper' ? 0.5 : shape === 'beaker50' ? 10 : shape === 'flask100' ? 0.2 : 1;
  const area = shape === 'dropper' ? Math.PI * GEO07.dropper.r ** 2 : shape === 'flask100' ? Math.PI * GEO07.flask100.neckR ** 2 : v!.areaCm2;
  // El ojo fuera del plano del menisco desplaza la marca aparente (pendiente de paralaje compartida).
  const parallaxMl = Math.abs(eyeDzCm) > 1 ? -Math.sign(eyeDzCm) * Math.min(4, Math.abs(eyeDzCm)) * w.params.parallaxSlopeThreshold * area * 0.5 : 0;
  const half = shape === 'beaker50' ? 5 : div / 2;
  const value = shape === 'flask100' ? Math.round((ml + parallaxMl) * 10) / 10 : quantize(ml + parallaxMl, shape === 'beaker50' ? 1 : div);
  const flags = Math.abs(eyeDzCm) > 1 ? ['PARALLAX'] : [];
  if (shape === 'beaker50') flags.push('APPROXIMATE');
  const src = isDropper ? w.droppers[vesselId].content : { ...v!.polar, ...v!.apolar };
  const r = addReading(w, {
    kind: 'volume', instrumentId: vesselId, targetId: vesselId, value, unit: 'mL', resolution: div, standardUncertainty: half / Math.sqrt(3),
    valid: !flags.includes('PARALLAX'), stable: true, qualityFlags: flags, trueValue: ml, snapshot: { materials: materialsIn(src) },
  });
  if (shape === 'flask100' && Math.abs(ml - 100) <= 0.15 && !flags.includes('PARALLAX')) flag07(w, `flaskAtMark:${vesselId}`);
  emit07(w, flags.includes('PARALLAX') ? 'PARALLAX' : 'VOLUME_READ', flags.includes('PARALLAX') ? 'WARN' : 'INFO', { ml: value, obj: vesselId });
  return { ok: r.valid, id: r.id, value };
}

/**
 * Observación de una mezcla (§5.B): fases, sólido remanente, turbidez y tiempo desde la última adición. Se guarda
 * siempre (es lo que el estudiante vio), con banderas que indican si el equilibrio todavía no se alcanzó.
 */
function observe(w: P07World, vesselId: string): P07DispatchResult {
  const v = w.vessels[vesselId];
  if (!v) return { ok: false, code: 'NO_OBJECT' };
  if (vesselMl(v) < 0.05 && compTotal(v.solid) < 0.001) return { ok: false, code: 'EMPTY' };
  const since = w.timeS - v.lastAddS;
  const undissolved = compTotal(v.solid);
  const phases = (liquidMl(v.polar) > 0.05 ? 1 : 0) + (liquidMl(v.apolar) > 0.05 ? 1 : 0);
  const turbid = v.emulsion01 > 0.2 || (undissolved > 0.002 && v.stir01 > 0.2);
  const flags: string[] = [];
  // L17: sólido aún presente que SÍ terminaría de disolverse: la observación es prematura.
  const willDissolve = materialsIn(v.solid).some((m) => {
    const sol = solventsOf(v)[0];
    if (!sol) return false;
    const pm = solventPair(m, sol).model;
    if (pm.kind !== 'solubility') return false;
    const ph = sol === 'water' ? v.polar : v.apolar;
    const total = (v.solid[m] ?? 0) + (ph[m] ?? 0);
    return equilibriumDissolvedG(total, pm.csatGL, liquidMl(ph)) > (ph[m] ?? 0) + 0.002;
  });
  if (undissolved > 0.002 && willDissolve && since < w.params.mixObservationS * 3) {
    flags.push('NOT_EQUILIBRATED');
    err07(w, 'premature_solubility_call', 'PREMATURE_OBSERVATION', 'WARN', { obj: vesselId });
  }
  if (since < w.params.mixObservationS) flags.push('EARLY');
  // L19: en el equilibrio queda sólido porque se superó la solubilidad.
  if (undissolved > 0.002 && !willDissolve && since >= w.params.mixObservationS) {
    const soluble = materialsIn(v.solid).some((m) => {
      const sol = solventsOf(v)[0];
      return sol ? solventPair(m, sol).model.kind === 'solubility' && (solventPair(m, sol).model as { csatGL: number }).csatGL > 10 : false;
    });
    if (soluble) {
      flags.push('SATURATED');
      err07(w, 'solubility_exceeded', 'SOLUBILITY_EXCEEDED', 'INFO', { obj: vesselId });
    }
  }
  const r = addReading(w, {
    kind: 'observation', instrumentId: 'eye', targetId: vesselId, value: phases, unit: '', resolution: 0, standardUncertainty: 0, valid: true, stable: !flags.includes('EARLY'),
    qualityFlags: flags, trueValue: phases,
    snapshot: { materials: [...new Set(v.history)], sources: [...v.from, v.id], phases, undissolvedG: Math.round(undissolved * 1e4) / 1e4, turbid, sinceAddS: Math.round(since * 10) / 10, solvents: solventsOf(v), tempC: v.tempC },
  });
  flag07(w, `observed:${vesselId}`);
  emit07(w, 'OBSERVATION_SAVED', 'INFO', { obj: vesselId, s: Math.round(since) });
  return { ok: true, id: r.id };
}

// ─────────────────────────── Trasvases ───────────────────────────

/**
 * Lo que se traslada de un compartimento a otro, SEPARADO por compartimento: un soluto disuelto viaja disuelto en
 * su fase (no vuelve a ser sólido al llegar), y el sedimento viaja como sólido.
 */
export interface Parcel {
  polar: Comp;
  apolar: Comp;
  solid: Comp;
}

const parcel = (p: Partial<Parcel> = {}): Parcel => ({ polar: p.polar ?? {}, apolar: p.apolar ?? {}, solid: p.solid ?? {} });
export const flat = (p: Parcel): Comp => compAddInto(compAddInto(compAddInto({}, p.polar), p.apolar), p.solid);
const parcelMl = (p: Parcel) => liquidMl(p.polar) + liquidMl(p.apolar);
/** Un inventario «líquido» (película, gotero, derrame) se reparte por tipo: los solutos van con el agua si la hay. */
function parcelFromLiquid(c: Comp): Parcel {
  const p = parcel();
  for (const [m, g] of Object.entries(c) as Array<[MaterialId, number]>) {
    if (!(g > 0)) continue;
    if (isLiquid(m)) (POLAR_LIQUIDS.has(m) ? p.polar : p.apolar)[m] = g;
    else if ((c.water ?? 0) > 0) p.polar[m] = g;
    else if ((c.heptane ?? 0) > 0 || (c.mineralOil ?? 0) > 0) p.apolar[m] = g;
    else p.solid[m] = g;
  }
  return p;
}

/** ¿Algún líquido del envío no tiene ficha con el disolvente del destino? Entonces no se mezcla (§6.2). */
function pairRefusal(target: Vessel, add: Parcel): string | null {
  for (const m of materialsIn({ ...add.polar, ...add.apolar })) {
    if (!isLiquid(m)) continue;
    const otherSolvent: MaterialId | null = POLAR_LIQUIDS.has(m) ? ((target.apolar.heptane ?? 0) > 0.01 ? 'heptane' : null) : (target.polar.water ?? 0) > 0.01 ? 'water' : null;
    if (otherSolvent && !pairValidated(m, otherSolvent as 'water' | 'heptane')) return 'PAIR_PENDING';
  }
  return null;
}

/** Procedencia: el recipiente destino hereda la de la fuente y la fuente misma. */
function inherit(dst: string[], src: string[], srcId?: string) {
  for (const id of srcId ? [...src, srcId] : src) if (!dst.includes(id)) dst.push(id);
}

/** Vuelca un envío en un recipiente sin controles (residuos, devoluciones). */
function addBack(v: Vessel, p: Parcel) {
  compAddInto(v.polar, p.polar);
  compAddInto(v.apolar, p.apolar);
  compAddInto(v.solid, p.solid);
}

function addTo(w: P07World, v: Vessel, add: Parcel, from: string[] = []) {
  inherit(v.from, from);
  const before = vesselMl(v) + compTotal(v.solid);
  // Un líquido apolar que llega en la parte «polar» (o al revés) se ubica en su fase real.
  const fixed = parcel();
  for (const ph of ['polar', 'apolar'] as const) {
    for (const [m, g] of Object.entries(add[ph]) as Array<[MaterialId, number]>) {
      const to = isLiquid(m) ? (POLAR_LIQUIDS.has(m) ? 'polar' : 'apolar') : ph;
      fixed[to][m] = (fixed[to][m] ?? 0) + g;
    }
  }
  compAddInto(fixed.solid, add.solid);
  addBack(v, fixed);
  for (const m of materialsIn(flat(fixed))) if (!v.history.includes(m) && m !== 'water' && m !== 'heptane') v.history.push(m);
  const added = parcelMl(fixed) + compTotal(fixed.solid);
  const total = vesselMl(v) + compTotal(v.solid);
  if (total > 0) v.mixed01 = clamp((v.mixed01 * before) / Math.max(total, 1e-9) + (before <= 1e-6 ? 1 : 0), 0, 1);
  if (added > 1e-6) v.lastAddS = w.timeS;
  // Rebalse: lo que excede el borde va a la mesada, con su composición (L13).
  const over = vesselMl(v) - v.brimMl;
  if (over > 0.01) {
    const f = over / vesselMl(v);
    compAddInto(w.spills.bench, compTake(v.apolar, f));
    compAddInto(w.spills.bench, compTake(v.polar, f));
    err07(w, 'container_overfill', 'CONTAINER_OVERFILL', 'WARN', { obj: v.id });
  }
  // Matraz pasado del aforo: se agregó volumen en vez de completar HASTA la marca (L42).
  if (v.shape === 'flask100' && vesselMl(v) > 101.5) err07(w, 'added_instead_of_final_volume', 'FLASK_OVER_MARK', 'WARN', { obj: v.id });
}

/**
 * Toma `ml` de líquido de un recipiente: primero la fase de arriba (apolar), luego la polar; si se lleva casi todo,
 * arrastra el sólido. Con una mezcla poco homogénea la alícuota no representa al conjunto (L43).
 */
function takeLiquid(v: Vessel, ml: number, fromPhase?: 'polar' | 'apolar'): Parcel {
  const out = parcel();
  let left = ml;
  const phases: Array<'polar' | 'apolar'> = fromPhase ? [fromPhase] : ['apolar', 'polar'];
  const totalBefore = vesselMl(v);
  for (const ph of phases) {
    const comp = v[ph];
    const have = liquidMl(comp);
    if (have <= 1e-9 || left <= 0) continue;
    const f = Math.min(1, left / have);
    if (v.mixed01 < 0.999 && f < 0.99) {
      // Lo recién agregado aún no se repartió: la alícuota lleva menos de los solutos (no del disolvente).
      const k = 0.3 + 0.7 * v.mixed01;
      for (const [m, g] of Object.entries(comp) as Array<[MaterialId, number]>) {
        const solvent = m === 'water' || m === 'heptane';
        const take = (g ?? 0) * f * (solvent ? 1 : k);
        comp[m] = (g ?? 0) - take;
        out[ph][m] = (out[ph][m] ?? 0) + take;
      }
    } else compAddInto(out[ph], compTake(comp, f));
    left -= have * f;
  }
  if (totalBefore > 0 && ml >= totalBefore * 0.9) compAddInto(out.solid, compTake(v.solid, 1));
  return out;
}

function pourRateMlS(v: Vessel, tiltDeg: number): number {
  const ml = vesselMl(v);
  const fill = clamp(ml / Math.max(1, v.capacityMl), 0, 1.2);
  const tilt0 = 100 - 88 * Math.min(1, fill);
  if (tiltDeg <= tilt0 || ml <= 0.001) return 0;
  return (POUR_K[v.shape] ?? 2) * ((tiltDeg - tilt0) / 30) ** 1.5;
}

function setPour(w: P07World, sourceId: string, targetId: string | null, tiltDeg: number): P07DispatchResult {
  const src = w.vessels[sourceId];
  if (!src || POUR_K[src.shape] === undefined) return { ok: false, code: 'NOT_POURABLE' };
  if (targetId && targetId !== 'electrics' && !w.vessels[targetId]) return { ok: false, code: 'BAD_TARGET' };
  const pr = w.pours[sourceId];
  if (!pr) {
    const refused = handlingRefused(w, sourceId);
    if (refused) return { ok: false, code: refused };
    w.pours[sourceId] = { sourceId, targetId, tiltDeg, startedS: w.timeS, transferredG: 0 };
  } else {
    pr.targetId = targetId;
    pr.tiltDeg = tiltDeg;
  }
  return { ok: true };
}

function transfer(w: P07World, sourceId: string, targetId: string | null, ml: number, fromPhase?: 'polar' | 'apolar'): number {
  const src = w.vessels[sourceId];
  if (!src) return 0;
  // Verter sobre el detector o el conductímetro: el líquido moja el equipo eléctrico (L09).
  if (targetId === 'electrics') {
    const moved = takeLiquid(src, Math.min(ml, vesselMl(src)), fromPhase);
    compAddInto(w.spills.electrics, flat(moved));
    if (compTotal(w.spills.electrics) > 0.3) {
      w.detector.powered = false;
      w.meter.powered = false;
      latch07(w, 'electricsSpill', 'ELECTRICS_SPILL', 'CRITICAL');
    }
    return compTotal(flat(moved));
  }
  const tgt = targetId ? w.vessels[targetId] : null;
  // Un par sin ficha no se mezcla (se detiene antes de verter).
  if (tgt) {
    const probe = takeLiquid(structuredClone(src), Math.min(ml, vesselMl(src)), fromPhase);
    const refusal = pairRefusal(tgt, probe);
    if (refusal) {
      emit07(w, 'PAIR_PENDING', 'WARN', { obj: sourceId });
      delete w.pours[sourceId];
      return 0;
    }
  }
  const moved = takeLiquid(src, Math.min(ml, vesselMl(src)), fromPhase);
  const g = compTotal(flat(moved));
  if (g <= 0) return 0;
  if (tgt) {
    checkTubeSolvent(w, tgt, flat(moved));
    checkCrossContamination(w, tgt, flat(moved));
    addTo(w, tgt, moved, [...src.from, src.id]);
  } else {
    compAddInto(w.spills.bench, flat(moved));
    latch07(w, 'benchSpill', 'BENCH_SPILL', 'WARN', { obj: sourceId });
  }
  return g;
}

/** L18: el disolvente vertido no coincide con lo que dice la etiqueta del tubo. */
function checkTubeSolvent(w: P07World, tgt: Vessel, moved: Comp) {
  const label = w.objects[tgt.id]?.label ?? '';
  if (!label || w.objects[tgt.id]?.kind !== 'tube') return;
  const water = (moved.water ?? 0) > 0.005;
  const apolar = (moved.heptane ?? 0) > 0.005;
  if ((label.endsWith('-A') && apolar) || (label.endsWith('-B') && water)) err07(w, 'wrong_solvent', 'WRONG_SOLVENT', 'WARN', { obj: tgt.id });
}

/** L11: un tubo con restos de otra muestra recibe una nueva sin lavarse. */
function checkCrossContamination(w: P07World, tgt: Vessel, moved: Comp) {
  if (w.objects[tgt.id]?.kind !== 'tube') return;
  const incoming = materialsIn(moved).filter((m) => m !== 'water' && m !== 'heptane');
  const residue = materialsIn({ ...tgt.polar, ...tgt.apolar, ...tgt.solid }, 1e-6).filter((m) => m !== 'water' && m !== 'heptane');
  if (incoming.length && residue.length && incoming.some((m) => !residue.includes(m)) && residue.some((m) => !incoming.includes(m))) {
    err07(w, 'cross_contaminated_tube', 'TUBE_CROSS_CONTAMINATED', 'WARN', { obj: tgt.id });
  }
}

/** Vaciar un recipiente en otro (residuo o trasvase completo, con la película que queda). */
function dispose(w: P07World, vesselId: string, targetId: string): P07DispatchResult {
  const v = w.vessels[vesselId];
  const t = w.vessels[targetId];
  if (!v || !t) return { ok: false, code: 'NO_OBJECT' };
  const hold = HOLD_ML[v.shape] ?? 0.05;
  const ml = vesselMl(v);
  const f = ml > 0 ? Math.max(0, ml - hold) / ml : 0;
  const moved = parcel({ apolar: compTake(v.apolar, f), polar: compTake(v.polar, f) });
  // Sólido: casi todo pasa; una pizca queda pegada (2 %).
  moved.solid = compTake(v.solid, compTotal(v.solid) > 0.001 ? 0.98 : 1);
  const isWaste = targetId.startsWith('waste');
  if (isWaste) {
    const organic = materialsIn(moved.apolar).some((m) => isLiquid(m));
    const aqueous = (moved.polar.water ?? 0) > 0.1;
    const solidOnly = parcelMl(moved) < 0.05 && compTotal(moved.solid) > 0;
    if ((targetId === 'wasteAq' && organic) || (targetId === 'wasteOrg' && aqueous && !organic) || (targetId === 'wasteSolid' && !solidOnly && (aqueous || organic))) {
      err07(w, 'waste_crossmix', 'WASTE_CROSSMIX', 'WARN', { obj: targetId });
    }
    for (const m of materialsIn(flat(moved))) if (!t.history.includes(m)) t.history.push(m);
    addBack(t, moved);
  } else {
    const refusal = pairRefusal(t, moved);
    if (refusal) {
      // Se devuelve todo: no se mezcla un par sin ficha.
      addBack(v, moved);
      emit07(w, 'PAIR_PENDING', 'WARN', { obj: vesselId });
      return { ok: false, code: refusal };
    }
    checkCrossContamination(w, t, flat(moved));
    addTo(w, t, moved, [...v.from, v.id]);
  }
  emit07(w, 'EMPTIED', 'INFO', { from: vesselId, to: targetId });
  return { ok: true };
}

/** Piseta: agua purificada hacia un recipiente (enrase, enjuague de un vidrio). */
function squeezeWash(w: P07World, targetId: string, ml: number): P07DispatchResult {
  const wb = w.vessels.washBottle;
  const t = w.vessels[targetId];
  if (!wb) return { ok: false, code: 'NO_OBJECT' };
  const moved = takeLiquid(wb, Math.min(ml, vesselMl(wb)), 'polar');
  if (!t) {
    compAddInto(w.spills.bench, flat(moved));
    return { ok: true };
  }
  addTo(w, t, moved);
  return { ok: true };
}

// ─────────────────────────── Gotero y espátula ───────────────────────────

function stepDroppers(w: P07World, dt: number) {
  for (const [id, d] of Object.entries(w.droppers)) {
    if (d.squeeze01 === 0) continue;
    const o = w.objects[id];
    const at = o?.support ?? '';
    const v = w.vessels[at];
    const rate = Math.abs(d.squeeze01) * 1.0 * dt;
    if (d.squeeze01 < 0) {
      // Aspirar: de la fase en la que está la punta (la polar queda abajo).
      const room = 5.2 - liquidMl(d.content);
      if (!v || room <= 0) continue;
      const tipH = o.pose.z - (w.objects[at]?.pose.z ?? 0) - v.floorCm;
      const ph: 'polar' | 'apolar' = liquidMl(v.apolar) > 0.01 && (liquidMl(v.polar) <= 0.01 || tipH > phaseHeights(v).polar) ? 'apolar' : 'polar';
      if (tipH > phaseHeights(v).total) continue;
      if (!w.evidence[`__dpAsp:${id}`]) {
        // Restos apolares de un uso anterior que ahora entran en una fuente acuosa (L20).
        const prevApolar = materialsIn(d.content, 1e-6).some((x) => x === 'heptane' || x === 'mineralOil');
        w.evidence[`__dpApolarResidue:${id}`] = prevApolar && ph === 'polar' && (v.polar.water ?? 0) > 0.5 ? 1 : 0;
        const refused = handlingRefused(w, at);
        if (refused) {
          if (refused === 'CAPPED') emit07(w, 'CAPPED', 'WARN', { obj: at });
          d.squeeze01 = 0;
          continue;
        }
        if (v.mixed01 < 0.7 && vesselMl(v) > 1) err07(w, 'aliquot_unmixed', 'ALIQUOT_UNMIXED', 'WARN', { obj: at });
        w.evidence[`__dpAsp:${id}`] = 1;
      }
      const got = flat(takeLiquid(v, Math.min(rate, room), ph));
      compAddInto(d.content, got);
      inherit(d.from, v.from, v.id);
      if (compTotal(got) > 0) d.lastPhase = ph;
    } else {
      w.evidence[`__dpAsp:${id}`] = 0;
      const have = liquidMl(d.content);
      if (have <= 1e-6) continue;
      const out = compTake(d.content, Math.min(1, rate / have) * (have > 0.02 ? 1 : 0));
      // El gotero retiene una película (0,02 mL) que contamina lo siguiente si no se limpia.
      if (liquidMl(d.content) < 0.02 && have > 0.02) compAddInto(d.content, compTake(out, Math.min(1, 0.02 / Math.max(0.02, liquidMl(out)))));
      if (v) {
        if (pairRefusal(v, parcelFromLiquid(out))) {
          compAddInto(d.content, out);
          d.squeeze01 = 0;
          emit07(w, 'PAIR_PENDING', 'WARN', { obj: at });
          continue;
        }
        // L20: el gotero venía de una fase apolar sin limpiar y entrega gotas de hidrocarburo en agua.
        if ((v.polar.water ?? 0) > 0.5 && w.evidence[`__dpApolarResidue:${id}`] && materialsIn(out).some((m) => m === 'heptane' || m === 'mineralOil')) {
          err07(w, 'apolar_carryover', 'APOLAR_CARRYOVER', 'WARN', { obj: at });
        }
        checkTubeSolvent(w, v, out);
        checkCrossContamination(w, v, out);
        addTo(w, v, parcelFromLiquid(out), d.from);
      } else {
        compAddInto(w.spills.bench, out);
        latch07(w, 'benchSpill', 'BENCH_SPILL', 'WARN', { obj: id });
      }
    }
  }
}

/** Cargar la espátula desde un frasco de sólido (la punta dentro del frasco). */
function scoop(w: P07World, sourceId: string): P07DispatchResult {
  const v = w.vessels[sourceId];
  if (!v) return { ok: false, code: 'NO_OBJECT' };
  if (w.objects.spatula?.support !== sourceId) return { ok: false, code: 'NOT_IN_JAR' };
  const refused = handlingRefused(w, sourceId);
  if (refused && refused !== 'CAPPED') return { ok: false, code: refused };
  if (v.capped) return { ok: false, code: 'CAPPED' };
  const mats = materialsIn(v.solid);
  if (!mats.length) return { ok: false, code: 'EMPTY' };
  if (compTotal(w.spatula.load) > 0.6) return { ok: false, code: 'FULL' };
  const g = Math.min(compTotal(v.solid), w.params.spatulaScoopG * (0.75 + 0.5 * rand(w)));
  const got = compTake(v.solid, g / compTotal(v.solid));
  // L14: restos iónicos en la espátula pasan a la carga de un sólido molecular.
  const resIonic = materialsIn(w.spatula.residue, 1e-6).filter((m) => MATERIALS[m].dissociation);
  if (resIonic.length && mats.some((m) => !MATERIALS[m].dissociation && !resIonic.includes(m))) err07(w, 'ionic_carryover', 'IONIC_CARRYOVER', 'WARN', { obj: sourceId });
  if (sourceId === 'jarDamaged') err07(w, 'sample_identity_unverified', 'IDENTITY_UNVERIFIED', 'WARN', { obj: sourceId });
  compAddInto(w.spatula.load, w.spatula.residue);
  w.spatula.residue = {};
  compAddInto(w.spatula.load, got);
  inherit(w.spatula.from, v.from, v.id);
  flag07(w, `scooped:${mats[0]}`);
  emit07(w, 'SCOOPED', 'INFO', { obj: sourceId });
  return { ok: true, value: compTotal(got) };
}

/** Descargar la espátula sobre un vidrio de reloj, un tubo, un vaso o un matraz; queda una película. */
function dropSpatula(w: P07World, targetId: string): P07DispatchResult {
  const t = w.vessels[targetId];
  const load = w.spatula.load;
  if (compTotal(load) <= 1e-9) return { ok: false, code: 'EMPTY' };
  const residue = compTake(load, w.params.spatulaResidueFraction);
  const moved = compTake(load, 1);
  w.spatula.residue = compAddInto(w.spatula.residue, residue);
  if (!t) {
    compAddInto(w.spills.bench, moved);
    latch07(w, 'solidSpill', 'BENCH_SPILL', 'WARN', { obj: 'spatula' });
    return { ok: true };
  }
  checkCrossContamination(w, t, moved);
  addTo(w, t, parcel({ solid: moved }), w.spatula.from);
  w.spatula.from = [];
  emit07(w, 'SOLID_ADDED', 'INFO', { obj: targetId });
  return { ok: true, value: compTotal(moved) };
}

function cleanTool(w: P07World, toolId: string): P07DispatchResult {
  const waste = w.vessels.wasteSolid;
  if (toolId === 'spatula') {
    compAddInto(waste.solid, w.spatula.residue);
    compAddInto(waste.solid, w.spatula.load);
    w.spatula = { load: {}, residue: {}, from: [] };
    return { ok: true };
  }
  const d = w.droppers[toolId];
  if (d) {
    const organic = materialsIn(d.content).some((m) => isLiquid(m) && !POLAR_LIQUIDS.has(m));
    const dest = organic ? w.vessels.wasteOrg : w.vessels.wasteAq;
    addBack(dest, parcelFromLiquid(d.content));
    d.content = {};
    d.lastPhase = null;
    d.from = [];
    w.evidence[`__dpApolarResidue:${toolId}`] = 0;
    // Enjuagado con agua de la piseta que también va al residuo.
    const wb = w.vessels.washBottle;
    if (wb) addBack(dest, takeLiquid(wb, 1, 'polar'));
    return { ok: true };
  }
  return { ok: false, code: 'NO_OBJECT' };
}

// ─────────────────────────── Agitación, disolución, fases ───────────────────────────

function setStir(w: P07World, vesselId: string, motion01: number): P07DispatchResult {
  const v = w.vessels[vesselId];
  if (!v) return { ok: false, code: 'NO_OBJECT' };
  const held = w.objects[vesselId]?.support === 'hand';
  const rod = Object.values(w.objects).some((o) => o.kind === 'stirRod' && o.support === vesselId);
  if (motion01 > 0 && !held && !rod) return { ok: false, code: 'NO_STIRRER' };
  v.stir01 = clamp(motion01, 0, 1);
  return { ok: true };
}

function stepVessels(w: P07World, dt: number) {
  const T = w.params.initialTemperatureC;
  for (const v of Object.values(w.vessels)) {
    const ml = vesselMl(v);
    // Mezcla de líquidos miscibles: difusión lenta, agitar homogeneiza.
    if (v.mixed01 < 1) v.mixed01 = Math.min(1, v.mixed01 + dt * (0.03 + 1.2 * v.stir01));
    // Emulsión pasajera de dos fases agitadas.
    const twoPhases = liquidMl(v.polar) > 0.05 && liquidMl(v.apolar) > 0.05;
    if (twoPhases && v.stir01 > 0.4) v.emulsion01 = Math.min(1, v.emulsion01 + dt * 1.5 * v.stir01);
    else v.emulsion01 = Math.max(0, v.emulsion01 - dt * 0.12);
    // Agitar muy fuerte un recipiente casi lleno salpica (L16).
    if (v.stir01 > 0.85 && ml > v.capacityMl * 0.7) {
      const f = 0.02 * dt;
      compAddInto(w.spills.bench, compTake(v.apolar, f));
      compAddInto(w.spills.bench, compTake(v.polar, f));
      err07(w, 'mixing_spill', 'MIXING_SPILL', 'WARN', { obj: v.id });
    }
    // Disolución de cada sólido hacia el equilibrio de su par con ficha (§3.2). Lo disuelto en exceso precipita.
    for (const ph of ['polar', 'apolar'] as const) {
      const comp = v[ph];
      const solvent: 'water' | 'heptane' | null = ph === 'polar' ? ((comp.water ?? 0) > 0.01 ? 'water' : null) : (comp.heptane ?? 0) > 0.01 ? 'heptane' : null;
      if (!solvent) continue;
      const phMl = liquidMl(comp);
      const mats = new Set<MaterialId>([...materialsIn(v.solid), ...materialsIn(comp).filter((m) => !isLiquid(m))]);
      for (const m of mats) {
        const pm = solventPair(m, solvent).model;
        if (pm.kind !== 'solubility') continue;
        const total = (v.solid[m] ?? 0) + (comp[m] ?? 0);
        const next = dissolveStep(comp[m] ?? 0, total, pm.csatGL, phMl, pm.kdS, v.stir01, dt);
        const d = next - (comp[m] ?? 0);
        if (Math.abs(d) < 1e-15) continue;
        comp[m] = next;
        v.solid[m] = total - next;
        if ((v.solid[m] ?? 0) < 1e-12) delete v.solid[m];
        if ((comp[m] ?? 0) < 1e-15) delete comp[m];
      }
    }
    // Temperatura hacia el ambiente (relajación lenta).
    v.tempC += (T - v.tempC) * Math.min(1, dt / 600);
  }
}

function stepPours(w: P07World, dt: number) {
  for (const pr of Object.values(w.pours)) {
    const src = w.vessels[pr.sourceId];
    if (!src) continue;
    const rate = pourRateMlS(src, pr.tiltDeg);
    if (rate <= 0) continue;
    pr.transferredG += transfer(w, pr.sourceId, pr.targetId, rate * dt);
  }
}

// ─────────────────────────── Muestras sólidas ───────────────────────────

function wetSpecimen(w: P07World, id: string): P07DispatchResult {
  const sp = w.specimens[id];
  const wb = w.vessels.washBottle;
  if (!sp || !wb) return { ok: false, code: 'NO_OBJECT' };
  const water = takeLiquid(wb, 0.05, 'polar');
  sp.surfaceWaterG += water.polar.water ?? 0;
  // Una sal mojada disuelve un poco de su superficie: la película queda iónica.
  if (MATERIALS[sp.material].dissociation && sp.surfaceSaltG < 0.004) sp.surfaceSaltG += 0.004;
  if (MATERIALS[sp.material].dissociation) w.evidence[`__wetSaltFromPiece:${id}`] = (w.evidence[`__wetSaltFromPiece:${id}`] ?? 0) + 0.004;
  openCircuit(w);
  return { ok: true };
}

function drySpecimen(w: P07World, id: string): P07DispatchResult {
  const sp = w.specimens[id];
  if (!sp) return { ok: false, code: 'NO_OBJECT' };
  const waste = w.vessels.wasteSolid;
  // El papel con la película va al residuo sólido (no desaparece).
  waste.solid.water = (waste.solid.water ?? 0) + sp.surfaceWaterG;
  if (sp.surfaceSaltG > 0) waste.solid.NaCl = (waste.solid.NaCl ?? 0) + sp.surfaceSaltG;
  sp.surfaceWaterG = 0;
  sp.surfaceSaltG = 0;
  return { ok: true };
}

// ─────────────────────────── Detector de sólidos ───────────────────────────

function openCircuit(w: P07World) {
  const d = w.detector;
  d.contactSince = null;
}

function setContacts(w: P07World, a: SurfaceHit | null, b: SurfaceHit | null): P07DispatchResult {
  const d = w.detector;
  const same = (x: SurfaceHit | null, y: SurfaceHit | null) => (!x && !y) || (!!x && !!y && x.targetId === y.targetId && Math.abs(x.gapCm - y.gapCm) < 1e-6 && Math.abs(x.u - y.u) < 0.05 && Math.abs(x.v - y.v) < 0.05);
  if (!same(a, d.a) || !same(b, d.b)) {
    const wasClosed = circuitPath(w).closed;
    d.a = a;
    d.b = b;
    const nowClosed = circuitPath(w).closed;
    if (nowClosed && (!wasClosed || d.contactSince === null)) d.contactSince = w.timeS;
    if (!nowClosed) d.contactSince = null;
  }
  return { ok: true };
}

interface PathResult {
  closed: boolean;
  /** Por qué no hay una medición válida (L21–L25, L39). */
  problem?: 'single_contact' | 'electrode_short' | 'different_specimens' | 'electrode_gap' | 'instrument_misuse' | 'open';
  ohm: number;
  specimenId?: string;
  path?: 'inPlane' | 'perpendicular' | 'iso';
  control?: boolean;
  oxide?: boolean;
  wet?: boolean;
}

/** Resistencia del recorrido entre las dos puntas (Ω) y validez geométrica del montaje (§3.5). */
export function circuitPath(w: P07World): PathResult {
  const { a, b } = w.detector;
  const p = w.params;
  const touching = (h: SurfaceHit | null) => !!h && h.gapCm <= CONTACT_GAP_CM && h.targetId !== 'air';
  if (a && b && (a.targetId === 'tipB' || b.targetId === 'tipA')) return { closed: true, problem: 'electrode_short', ohm: 2 * p.contactOhm };
  if (!touching(a) && !touching(b)) {
    if ((a && a.gapCm > CONTACT_GAP_CM && a.targetId !== 'air') || (b && b.gapCm > CONTACT_GAP_CM && b.targetId !== 'air')) return { closed: false, problem: 'electrode_gap', ohm: Infinity };
    return { closed: false, problem: 'open', ohm: Infinity };
  }
  if (!touching(a) || !touching(b)) {
    const other = touching(a) ? b : a;
    return { closed: false, problem: other && other.gapCm > CONTACT_GAP_CM && other.targetId !== 'air' ? 'electrode_gap' : 'single_contact', ohm: Infinity };
  }
  if (isVessel(w, a!.targetId) || isVessel(w, b!.targetId)) return { closed: false, problem: 'instrument_misuse', ohm: Infinity };
  if (a!.targetId !== b!.targetId) return { closed: false, problem: 'different_specimens', ohm: Infinity };
  if (a!.targetId === DETECTOR_PAD) return { closed: true, ohm: PAD_OHM + 2 * p.contactOhm, control: true };
  const sp = w.specimens[a!.targetId];
  if (!sp) return { closed: false, problem: 'open', ohm: Infinity };
  const el = MATERIALS[sp.material].electrical ?? { rhoOhmM: 1e14 };
  let rho = el.rhoOhmM;
  let lenCm = Math.max(0.3, Math.hypot(a!.u - b!.u, a!.v - b!.v));
  let areaCm2 = sp.widthCm * sp.thickCm;
  let path: PathResult['path'] = 'iso';
  if (el.rhoPerpOhmM) {
    if (sp.orientation === 'edge') {
      // Placa de canto: las puntas en las dos caras grandes, el recorrido cruza las capas.
      rho = el.rhoPerpOhmM;
      lenCm = sp.thickCm;
      areaCm2 = 0.05;
      path = 'perpendicular';
    } else path = 'inPlane';
  }
  const bulk = (rho * (lenCm / 100)) / (areaCm2 / 1e4);
  // Película superficial: una solución iónica abre un camino en paralelo (sal húmeda, L26).
  const wet = sp.surfaceWaterG > 0.002;
  const surf = wet ? (sp.surfaceSaltG > 0 ? 4000 * (0.02 / Math.max(0.005, sp.surfaceWaterG)) * lenCm : 2e5 * lenCm) : Infinity;
  const r = 1 / (1 / bulk + 1 / surf);
  const contact = (h: SurfaceHit) => (sp.oxide ? p.oxideContactOhm * (1 - 0.8 * clamp(h.force01, 0, 1)) : p.contactOhm);
  return { closed: true, ohm: r + contact(a!) + contact(b!), specimenId: sp.id, path, oxide: sp.oxide, wet };
}

/** Corriente del circuito (mA): fuente limitada; sin cables o apagado no circula nada. */
export function detectorCurrentMA(w: P07World): number {
  const d = w.detector;
  const p = w.params;
  if (!d.powered || !d.cablesOk) return 0;
  const path = circuitPath(w);
  if (!path.closed || !Number.isFinite(path.ohm)) return 0;
  return (p.detectorVoltageV / (p.detectorLimitOhm + path.ohm)) * 1000;
}

const DETECTOR_RANGE = { LOW: { max: 2, res: 0.001 }, HIGH: { max: 20, res: 0.01 } } as const;

function stepDetector(w: P07World, dt: number) {
  const d = w.detector;
  d.currentMA = detectorCurrentMA(w);
  d.shownMA += (d.currentMA - d.shownMA) * Math.min(1, dt / 0.25);
  d.indicator01 = d.currentMA < w.params.detectorThresholdMA ? 0 : clamp(Math.log10(d.currentMA / w.params.detectorThresholdMA) / 2.5, 0.08, 1);
}

function readDetector(w: P07World): P07DispatchResult {
  const d = w.detector;
  const p = w.params;
  if (!d.powered) return { ok: false, code: 'DETECTOR_OFF' };
  const path = circuitPath(w);
  const flags: string[] = [];
  const rng = DETECTOR_RANGE[d.range];
  let valid = true;
  if (path.problem && path.problem !== 'open') {
    flags.push(path.problem.toUpperCase());
    err07(w, path.problem, `DETECTOR_${path.problem.toUpperCase()}`, 'WARN');
    valid = false;
  } else if (!path.closed) {
    flags.push('OPEN');
    valid = false;
  }
  if (!d.cablesOk) {
    flags.push('CABLE');
    valid = false;
  }
  const held = d.contactSince === null ? 0 : w.timeS - d.contactSince;
  if (path.closed && held < p.detectorStabilityS) {
    flags.push('UNSTABLE');
    err07(w, 'unstable_contact', 'DETECTOR_UNSTABLE', 'WARN');
    valid = false;
  }
  const I = d.currentMA;
  if (I > rng.max) {
    flags.push('SATURATED');
    err07(w, 'detector_out_of_range', 'DETECTOR_OUT_OF_RANGE', 'WARN');
    valid = false;
  }
  // Prueba de control del circuito con el panel incorporado.
  if (path.control) {
    const passed = d.cablesOk && I > p.detectorThresholdMA;
    d.controlTest = passed ? 'passed' : 'failed';
    flag07(w, passed ? 'detectorControlPassed' : 'detectorControlFailed');
    emit07(w, passed ? 'CONTROL_PASSED' : 'CONTROL_FAILED', passed ? 'INFO' : 'WARN');
  }
  if (!path.control) {
    if (d.controlTest !== 'passed' && !d.inspected) {
      flags.push('UNVERIFIED');
      err07(w, 'unverified_detector', 'DETECTOR_UNVERIFIED', 'WARN');
    }
    if (path.oxide && I < p.detectorThresholdMA * 20) {
      flags.push('OXIDE');
      err07(w, 'oxidized_contact', 'OXIDIZED_CONTACT', 'INFO');
    }
    if (path.wet) {
      flags.push('WET');
      if (path.specimenId && MATERIALS[w.specimens[path.specimenId].material].dissociation) err07(w, 'wet_salt_surface', 'WET_SALT_SURFACE', 'WARN');
    }
    // L30: «no conduce» con un circuito que no pasó (o no hizo) la prueba de control.
    if ((d.controlTest === 'failed' || !d.cablesOk) && I < p.detectorThresholdMA && path.closed) err07(w, 'failed_control_circuit', 'FAILED_CONTROL_CIRCUIT', 'WARN');
    if (path.specimenId && w.specimens[path.specimenId].material === 'bronze' && sc(w, S.UNVERIFIED_ALLOY)) flags.push('UNVERIFIED_MATERIAL');
  }
  const shown = quantize(Math.min(I, rng.max), rng.res);
  const sp = path.specimenId ? w.specimens[path.specimenId] : undefined;
  const r = addReading(w, {
    kind: 'current', instrumentId: 'det01', targetId: path.control ? DETECTOR_PAD : sp?.id ?? 'air', value: shown, unit: 'mA', resolution: rng.res,
    standardUncertainty: rng.res / Math.sqrt(3) + I * 0.01, valid: valid && !flags.includes('UNVERIFIED_MATERIAL'), stable: !flags.includes('UNSTABLE'), qualityFlags: flags, trueValue: I,
    snapshot: { materials: sp ? [sp.material] : [], range: d.range, specimenId: sp?.id, path: path.path, wetSurface: !!path.wet },
  });
  if (valid) {
    flag07(w, `detector:${path.control ? 'control' : sp?.id}`);
    emit07(w, 'CURRENT_READ', 'INFO', { ma: shown, on: I >= p.detectorThresholdMA ? 1 : 0 });
  }
  return { ok: r.valid, id: r.id, value: shown };
}

// ─────────────────────────── Conductímetro ───────────────────────────

/** Concentración del patrón de KCl que da exactamente su valor certificado con el modelo del mundo (§3.4). */
export function standardKclMolL(targetUsPerCm: number): number {
  let lo = 0;
  let hi = 0.5;
  for (let i = 0; i < 60; i++) {
    const c = (lo + hi) / 2;
    const k = conductivityAtConcentration({ 'K+': c, 'Cl-': c }) * 1e4;
    if (k > targetUsPerCm) hi = c;
    else lo = c;
  }
  return (lo + hi) / 2;
}

/** Valor certificado de cada vial patrón (µS/cm a 25 °C); el vial sin rótulo no tiene. */
export const STANDARD_US: Record<string, number | null> = { std1413: 1413, std12880: 12880, stdUnknown: null };

function setProbeDepth(w: P07World, vesselId: string | null, immersionCm: number, bottomContact: boolean): P07DispatchResult {
  const m = w.meter;
  // Sonda sobre una muestra sólida: no es un líquido (L39).
  if (vesselId && w.specimens[vesselId]) {
    err07(w, 'instrument_misuse', 'INSTRUMENT_MISUSE', 'WARN', { obj: vesselId });
    return { ok: false, code: 'MISUSE' };
  }
  const v = vesselId ? w.vessels[vesselId] : null;
  const newVessel = v && immersionCm > 0 ? vesselId : null;
  if (newVessel !== m.vesselId) {
    // Sale del recipiente anterior: se lleva una película de su contenido.
    const prev = m.vesselId ? w.vessels[m.vesselId] : null;
    if (prev && vesselMl(prev) > 0.1) {
      const took = takeLiquid(prev, Math.min(w.params.probeFilmMl, vesselMl(prev) * 0.5), 'polar');
      compAddInto(m.film, flat(took));
      m.filmFrom = prev.id;
    }
    // Entra a uno nuevo: la película se mezcla allí (contaminación trazable, L33 y L38).
    if (v && newVessel) {
      const filmIons = ionicMol(m.film);
      const vesselIons = ionicMol(v.polar);
      if (filmIons > 2e-7 && m.filmFrom !== newVessel && filmIons > vesselIons * 0.01) {
        err07(w, 'probe_contamination', 'PROBE_CONTAMINATION', 'WARN', { obj: newVessel });
        if ((m.film.CuSO4_5H2O ?? 0) > 1e-6) err07(w, 'colored_solution_carryover', 'COLORED_CARRYOVER', 'WARN', { obj: newVessel });
      }
      addTo(w, v, parcelFromLiquid(m.film));
      v.lastAddS = Math.min(v.lastAddS, w.timeS);
      m.film = {};
    }
    m.vesselId = newVessel;
    m.quietS = 0;
    m.stable = false;
  }
  m.immersionCm = Math.max(0, immersionCm);
  m.bottomContact = bottomContact;
  return { ok: true };
}

/** Enjuague de la sonda con la piseta sobre el residuo acuoso: desplaza la película (§6.1). */
function rinseProbe(w: P07World, wasteId: string): P07DispatchResult {
  const m = w.meter;
  if (m.vesselId) return { ok: false, code: 'PROBE_IMMERSED' };
  const waste = w.vessels[wasteId];
  const wb = w.vessels.washBottle;
  if (!waste || !wb) return { ok: false, code: 'NO_OBJECT' };
  const water = takeLiquid(wb, 2, 'polar').polar;
  // El agua arrastra el 98 % de la película al residuo; queda una película de agua limpia.
  const removed = compTake(m.film, 0.98);
  addBack(waste, parcelFromLiquid(removed));
  const keep = compTake(water, Math.min(1, w.params.probeFilmMl / Math.max(0.01, liquidMl(water))));
  compAddInto(waste.polar, water);
  compAddInto(m.film, keep);
  m.filmFrom = 'rinse';
  if (wasteId !== 'wasteAq') err07(w, 'waste_crossmix', 'WASTE_CROSSMIX', 'WARN', { obj: wasteId });
  bump07(w, 'probeRinses');
  flag07(w, 'probeRinsed');
  emit07(w, 'PROBE_RINSED', 'INFO');
  return { ok: true };
}

/** Fase en la que quedan las celdas de la sonda: la polar si su punta está por debajo de la interfase. */
function probePhase(w: P07World, v: Vessel): 'polar' | 'apolar' {
  const h = phaseHeights(v);
  const tipH = h.total - w.meter.immersionCm;
  if (liquidMl(v.polar) <= 0.05) return 'apolar';
  return liquidMl(v.apolar) > 0.05 && tipH > h.polar ? 'apolar' : 'polar';
}

/** Lo que «ve» la celda (S/m) antes del filtro de la pantalla. */
function meterTarget(w: P07World): number {
  const m = w.meter;
  const p = w.params;
  if (!m.vesselId) return 0;
  const v = w.vessels[m.vesselId];
  const phase = probePhase(w, v);
  let k = trueKappaSPerM(w, v, phase) * m.cellError * m.calibFactor;
  // Compensación automática con la temperatura de la SONDA (que puede ir rezagada).
  if (m.atc) k /= temperatureFactor(m.probeTempC, TEMP_ALPHA_PER_K);
  // Celda cubierta a medias: señal parcial (L31). Contra el fondo: geometría distorsionada (L32).
  if (m.immersionCm < p.probeMinImmersionCm) k *= m.immersionCm / p.probeMinImmersionCm;
  if (m.bottomContact) k *= 0.82;
  return k;
}

function stepMeter(w: P07World, dt: number) {
  const m = w.meter;
  const p = w.params;
  const v = m.vesselId ? w.vessels[m.vesselId] : null;
  const envT = v ? v.tempC : p.initialTemperatureC;
  m.probeTempC += (envT - m.probeTempC) * Math.min(1, dt / (v ? 12 : 120));
  if (!m.powered) {
    m.shownSPerM = 0;
    m.quietS = 0;
    m.stable = false;
    return;
  }
  const target = meterTarget(w);
  const shallow = !!v && m.immersionCm < p.probeMinImmersionCm;
  const noise = target * (shallow ? 0.08 : 0.001) * gauss07(w);
  m.shownSPerM += (target + noise - m.shownSPerM) * Math.min(1, dt / p.probeResponseTauS);
  // Estable: la indicación se queda dentro de una banda (2 divisiones o 1 %) durante el tiempo de estabilización.
  const res = p.meterRanges[m.range].resolutionUsPerCm / 1e4;
  const band = Math.max(2 * res, Math.abs(m.shownSPerM) * 0.01);
  if (Math.abs(m.shownSPerM - m.refSPerM) > band) {
    m.refSPerM = m.shownSPerM;
    m.quietS = 0;
  } else m.quietS = !v || shallow ? 0 : m.quietS + dt;
  m.stable = m.quietS >= p.probeStabilityS;
}

/** Lo que muestra la pantalla: valor en la unidad del rango, o fuera de rango. */
export function meterDisplay(w: P07World): { value: number; unit: 'µS/cm' | 'mS/cm'; over: boolean } {
  const m = w.meter;
  const rg = w.params.meterRanges[m.range];
  const us = m.shownSPerM * 1e4;
  const over = us > rg.maxUsPerCm;
  if (m.range === 'HIGH') return { value: quantize(us / 1000, rg.resolutionUsPerCm / 1000), unit: 'mS/cm', over };
  return { value: quantize(us, rg.resolutionUsPerCm), unit: 'µS/cm', over };
}

function calibrate(w: P07World, standardId: string): P07DispatchResult {
  const m = w.meter;
  if (!m.powered) return { ok: false, code: 'METER_OFF' };
  if (m.vesselId !== standardId) return { ok: false, code: 'NOT_IN_STANDARD' };
  const certified = STANDARD_US[standardId];
  // L04: un vial sin identidad verificada no sirve como patrón.
  if (certified === undefined || certified === null) {
    err07(w, 'unknown_standard', 'STANDARD_UNVERIFIED', 'WARN');
    return { ok: false, code: 'UNVERIFIED_STANDARD' };
  }
  if (!m.stable || m.immersionCm < w.params.probeMinImmersionCm) return { ok: false, code: 'NOT_STABLE' };
  // La calibración ajusta el factor para que la lectura actual iguale el valor ELEGIDO en el equipo.
  const raw = (meterTarget(w) / m.calibFactor) * 1e4;
  m.calibFactor = m.standardSetting / raw;
  m.calibratedWith = standardId;
  m.quietS = 0;
  m.stable = false;
  // L34: el valor elegido no corresponde al vial: el factor queda sesgado.
  if (m.standardSetting !== certified) err07(w, 'wrong_calibration_standard', 'WRONG_STANDARD', 'WARN', { set: m.standardSetting, std: certified });
  else flag07(w, 'meterCalibrated');
  emit07(w, 'METER_CALIBRATED', 'INFO', { std: m.standardSetting });
  return { ok: true };
}

function readConductivity(w: P07World): P07DispatchResult {
  const m = w.meter;
  const p = w.params;
  if (!m.powered) return { ok: false, code: 'METER_OFF' };
  const flags: string[] = [];
  let valid = true;
  const v = m.vesselId ? w.vessels[m.vesselId] : null;
  if (!v) {
    flags.push('NOT_IMMERSED');
    valid = false;
  } else {
    if (m.immersionCm < p.probeMinImmersionCm) {
      flags.push('SHALLOW');
      err07(w, 'probe_too_shallow', 'PROBE_TOO_SHALLOW', 'WARN');
      valid = false;
    }
    if (m.bottomContact) {
      flags.push('BOTTOM');
      err07(w, 'probe_bottom_contact', 'PROBE_BOTTOM', 'WARN');
      valid = false;
    }
  }
  const disp = meterDisplay(w);
  if (disp.over) {
    flags.push('OVER_RANGE');
    err07(w, 'conductivity_over_range', 'OVER_RANGE', 'WARN');
    valid = false;
  }
  if (!m.stable) {
    flags.push('UNSTABLE');
    err07(w, 'conductivity_not_stable', 'KAPPA_UNSTABLE', 'WARN');
    valid = false;
  }
  if (!m.calibratedWith) flags.push('UNCALIBRATED');
  if (v && !m.atc && Math.abs(v.tempC - 25) > 1.5) {
    flags.push('TEMP_UNCOMPENSATED');
    err07(w, 'temperature_uncompensated', 'TEMP_UNCOMPENSATED', 'WARN');
  }
  if (v && m.atc && Math.abs(m.probeTempC - v.tempC) > 1) flags.push('PROBE_NOT_EQUILIBRATED');
  const phase = v ? probePhase(w, v) : 'polar';
  const truth = v ? trueKappaSPerM(w, v, phase) / (m.atc && phase === 'polar' ? temperatureFactor(v.tempC) : 1) : 0;
  // Lo que contenía la fase medida (las trazas de películas, por debajo de 10 µg, no cambian qué se midió).
  const mats = v ? [...new Set([...materialsIn(v[phase], 1e-5), ...(phase === 'polar' ? materialsIn(v.solid, 1e-5) : [])])] : [];
  const unit = disp.unit;
  const rg = p.meterRanges[m.range];
  const r = addReading(w, {
    kind: 'conductivity', instrumentId: 'cond01', targetId: v?.id ?? 'air', value: disp.over ? NaN : disp.value, unit, resolution: unit === 'mS/cm' ? rg.resolutionUsPerCm / 1000 : rg.resolutionUsPerCm,
    standardUncertainty: (unit === 'mS/cm' ? disp.value * 0.02 : disp.value * 0.02) + (unit === 'mS/cm' ? rg.resolutionUsPerCm / 1000 : rg.resolutionUsPerCm) / Math.sqrt(3),
    valid, stable: m.stable, qualityFlags: flags, trueValue: unit === 'mS/cm' ? truth * 10 : truth * 1e4,
    snapshot: {
      materials: mats, sources: v ? [...v.from, v.id] : [], undissolvedG: v ? Math.round(compTotal(v.solid) * 1e4) / 1e4 : 0, tempC: Math.round(m.probeTempC * 10) / 10, range: m.range, calibrated: !!m.calibratedWith, atc: m.atc,
      trueConcM: v ? Math.max(0, ...mats.filter((x) => MATERIALS[x].molarMassGmol && !isLiquid(x) || x === 'acetic').map((x) => formalM(v[phase], x))) : 0,
      phase,
    },
  });
  if (valid) {
    flag07(w, `kappa:${v!.id}`);
    emit07(w, 'KAPPA_READ', 'INFO', { k: disp.value, unit });
  }
  return { ok: valid, id: r.id, value: disp.value };
}

// ─────────────────────────── Limpieza ───────────────────────────

function cleanSpill(w: P07World, where: 'bench' | 'electrics'): P07DispatchResult {
  const src = w.spills[where];
  if (compTotal(src) <= 1e-9) return { ok: true };
  const organic = materialsIn(src).some((m) => isLiquid(m) && !POLAR_LIQUIDS.has(m));
  // El papel absorbente con lo derramado va al residuo correspondiente (nunca se borra materia).
  addBack(organic ? w.vessels.wasteOrg : w.vessels.wasteSolid, parcelFromLiquid(src));
  w.spills[where] = {};
  if (where === 'electrics' && w.safety.block?.code === 'WET_ELECTRICS') w.safety.block = null;
  emit07(w, 'SPILL_CLEANED', 'INFO');
  return { ok: true };
}

// ─────────────────────────── Paso ───────────────────────────

export function stepP07World(w: P07World): void {
  if (w.paused) return;
  const p = w.params;
  const dt = p.dtS;
  w.timeS = Math.round((w.timeS + dt) * 1e6) / 1e6;
  w.tick++;
  stepPours(w, dt);
  stepDroppers(w, dt);
  stepVessels(w, dt);
  stepDetector(w, dt);
  stepMeter(w, dt);
  const b = w.balance;
  if (b.powered) stepAnalyticalBalance(b, panLoadG(w) + zeroBias(w), p.balance, dt, w.timeS, gauss07(w));
}

export function runP07For(w: P07World, seconds: number) {
  const n = Math.round(seconds / w.params.dtS);
  for (let i = 0; i < n; i++) stepP07World(w);
}

export function p07Summary(w: P07World) {
  const t = materialTotals(w);
  return {
    water: Math.round((t.water ?? 0) * 1e6) / 1e6,
    readings: w.readingOrder.length,
    kappa: Math.round(w.meter.shownSPerM * 1e6) / 1e6,
    current: Math.round(w.detector.currentMA * 1e4) / 1e4,
    bal: Math.round(w.balance.shownG * 1e4) / 1e4,
  };
}

/** ¿Se puede despachar sin ficha? (para la interfaz: pares sin datos). */
export const materialUsable = (w: P07World, id: MaterialId) => usable(id, w.params.allowRestricted);

/** Utilidad para la definición: recipiente vacío con su forma. */
export function emptyVessel(id: string, shape: Vessel['shape'], spec: { capacityMl: number; brimMl: number; areaCm2: number; floorCm: number }, tempC: number, contents: { polar?: Comp; apolar?: Comp; solid?: Comp } = {}, capped?: boolean): Vessel {
  return {
    id, shape, ...spec, polar: { ...(contents.polar ?? {}) }, apolar: { ...(contents.apolar ?? {}) }, solid: { ...(contents.solid ?? {}) }, tempC,
    mixed01: 1, emulsion01: 0, lastAddS: -1e6, stir01: 0, capped, history: [], from: [],
  };
}

/** Composición con una concentración formal dada (mol/L) en `ml` de agua. */
export function solutionComp(id: MaterialId, molL: number, ml: number): Comp {
  const m = MATERIALS[id];
  const water = ml * MATERIALS.water.densityGml;
  if (!m.molarMassGmol) return { water };
  return { water, [id]: (molL * (ml / 1000) * m.molarMassGmol) / m.purity };
}

export const P07_GEOMETRY = { flaskMarkZ: FLASK_MARK_Z };

export type { GloveType, SpecimenState, ReadingSnapshot };
