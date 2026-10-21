/**
 * Mundo de la Práctica 9 — identificación de cationes Sr²⁺, Fe³⁺ y K⁺ (§6): paso fijo determinista.
 *
 * - Materia: moles por especie en el líquido y el sólido de cada recipiente, la pipeta, el asa (carga y residuo), la
 *   mesada, la bandeja y el conducto de la campana. Nada se crea ni se borra; la conservación se verifica por elementos
 *   y la carga total por electroneutralidad (§3.3, §6.4).
 * - Química en CUALQUIER recipiente: neutralización, SrSO₄ y Fe(OH)₃ hacia su equilibrio curricular (precipitation.ts).
 * - Sólidos: fracción en suspensión que sedimenta por gravedad (lento) o en la centrífuga (rápido); la decantación
 *   arrastra lo suspendido y, si se inclina bruscamente, parte del sedimento (§6.2).
 * - Llama VIRTUAL dentro de la campana (§4.1, §10): solo con extracción válida y mampara en rango; el asa, el vidrio de
 *   reloj virtual y el portamuestras refractario llevan a la zona emisora lo que realmente se cargó; lo vaporizado va al
 *   conducto (no desaparece) y una fracción queda como residuo del soporte. El color percibido sale del espectro
 *   (emission-spectrum.ts) y de la luz LOCAL de observación.
 * - 50 errores E01–E50 (los de técnica aquí; los de interpretación en la libreta, §9).
 */
import type { P09Command, P09DispatchResult, PpeItem09 } from './commands';
import type { Mol, P09Object, P09Params, P09World, Pose, Reading09, SolidId, SpeciesId, Vessel09 } from './types';
import { hashRandom, rand } from '../core/rng';
import { emit09, err09, flag09, gauss09, latch09 } from './events';
import { GEO09, liquidHeightCm09 } from './geometry';
import { SPECIES, chargeTotal, elementTotals, massG, molAddInto, molTake, molTotal, speciesIn, volumeMl, type Element } from './species';
import { KSP, feoh3EquilibriumShift, srso4EquilibriumShift, stepPrecipitation } from './precipitation';
import { EMITTERS, lineIntensities, perceive, type EmitterId } from './emission-spectrum';
import { quantize } from '../metrology/uncertainty';
import { balanceIndication, newAnalyticalBalance, stepAnalyticalBalance } from '../instruments/analytical-balance';

export { emit09, latch09, flag09, err09 } from './events';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const sc = (w: P09World, s: string) => w.scenarios.includes(s);
const SOLIDS: SolidId[] = ['SrSO4(s)', 'FeOH3(s)'];

/** Escenarios docentes (§7). */
export const S9 = {
  COMPLETE: 'P09-S01_complete',
  NO_SR: 'P09-S02_no_sr',
  NO_FE: 'P09-S03_no_fe',
  NO_K: 'P09-S04_no_k',
  ONLY_K: 'P09-S05_only_k',
  NA_CONTAMINANT: 'P09-S06_na_contaminant',
  DIRTY_LOOP: 'P09-S07_dirty_loop',
  SUPPORT_RESIDUE: 'P09-S08_support_residue',
  SULFATE_CLOGGED: 'P09-S09_sulfate_clogged',
  ALKALI_CONTAMINATED: 'P09-S10_alkali_contaminated',
  MISLABELED: 'P09-S11_mislabeled',
  UNBALANCED: 'P09-S12_unbalanced',
  SLOW_SETTLING: 'P09-S13_slow_settling',
  BRIGHT_ROOM: 'P09-S14_bright_room',
  LOW_FLOW: 'P09-S15_low_flow',
  NEAR_LIMIT: 'P09-S16_near_limit',
} as const;

export interface CationWorldSpec {
  objects: P09Object[];
  vessels: Vessel09[];
  scenarios: string[];
  mode: string;
  unknown: P09World['unknown'];
  loopResidue?: Mol;
}

/** Reactivos de la marcha (frascos gotero). */
export const REAGENT = { sulfate: 'dbSO4', alkali: 'dbOH', water: 'dbH2O' } as const;
/** Frascos de origen (raíces de trazabilidad): controles, blanco, muestra incógnita. */
export const ROOTS = ['ctlSr', 'ctlK', 'ctlNa', 'ctlLi', 'ctlCa', 'ctlBlank', 'ctlNaK', 'smp1', 'preT1', 'preT2'] as const;

// ─────────────────────────── Creación ───────────────────────────

export function createCationWorld(spec: CationWorldSpec, seed: number, params: P09Params): P09World {
  const objects: Record<string, P09Object> = {};
  for (const o of spec.objects) objects[o.id] = { ...o, pose: { ...o.pose } };
  const vessels: Record<string, Vessel09> = {};
  for (const v of spec.vessels) vessels[v.id] = structuredClone(v);
  const w: P09World = {
    schemaVersion: 1, timeS: 0, tick: 0, seed, rng: seed >>> 0 || 1, params, mode: spec.mode, objects, vessels, pours: {},
    pipette: { content: {}, solid: {}, squeeze01: 0, from: [] },
    loop: { load: {}, residue: { ...(spec.loopResidue ?? {}) }, root: null, from: [], tempC: params.ambientTempC },
    flame: { ignited: false, ignitedAt: null, emitting: {}, glassStress: 0, glassCracked: false },
    hood: { fanOn: false, sashCm: 60, lightPct: 100 },
    centrifuge: { lidClosed: false, rpm: 0, targetRpm: 0, spinUntil: null, lastSpinS: 0, lastSpinEndedAt: null },
    balance: { ...newAnalyticalBalance({ levelErrorDeg: 0, doorsOpen: false }), powered: false, panIds: [], tareSession: 0 },
    outside: { bench: {}, exhaust: {}, hoodTray: {} },
    readings: {}, readingOrder: [],
    safety: { ppe: { goggles: false, coat: false, gloves: false }, block: null, incident: null, stoppedByTeacher: false },
    events: [], evidence: {}, scenarios: [...spec.scenarios], unknown: spec.unknown, ppe: false,
    initialElements: { Sr: 0, Fe: 0, K: 0, Na: 0, Li: 0, Ca: 0, S: 0, N: 0, Cl: 0, O: 0, H: 0 },
  };
  w.initialElements = worldElements(w);
  return w;
}

// ─────────────────────────── Consultas ───────────────────────────

export const vesselMl = (v: Vessel09) => volumeMl(v.liq);

export function worldInventory(w: P09World): Mol {
  const t: Mol = {};
  for (const v of Object.values(w.vessels)) {
    molAddInto(t, v.liq);
    molAddInto(t, v.solid);
  }
  molAddInto(t, w.pipette.content);
  molAddInto(t, w.pipette.solid);
  molAddInto(t, w.loop.load);
  molAddInto(t, w.loop.residue);
  for (const m of Object.values(w.outside)) molAddInto(t, m);
  return t;
}

export const worldElements = (w: P09World): Record<Element, number> => elementTotals(worldInventory(w));
export const worldCharge = (w: P09World) => chargeTotal(worldInventory(w));

export function conservedTotals09(w: P09World): Record<string, number> {
  const e = worldElements(w);
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(e)) out[k] = Math.round(v * 1e12) / 1e12;
  out.charge = Math.round(worldCharge(w) * 1e12) / 1e12;
  return out;
}

/** Sólido en suspensión y sedimentado (mol) de un recipiente. */
export function solidSplit(v: Vessel09) {
  let susp = 0;
  let pellet = 0;
  for (const s of SOLIDS) {
    const n = v.solid[s] ?? 0;
    const f = v.suspended[s] ?? 1;
    susp += n * f;
    pellet += n * (1 - f);
  }
  return { susp, pellet };
}

const suspendedG = (v: Vessel09) => SOLIDS.reduce((g, s) => g + (v.solid[s] ?? 0) * (v.suspended[s] ?? 1) * SPECIES[s].molarMass, 0);
const pelletG = (v: Vessel09) => SOLIDS.reduce((g, s) => g + (v.solid[s] ?? 0) * (1 - (v.suspended[s] ?? 1)) * SPECIES[s].molarMass, 0);

/** Niveles (z) del sedimento y de la superficie de un recipiente apoyado. */
export function levels09(w: P09World, id: string) {
  const v = w.vessels[id];
  const o = w.objects[id];
  const base = (o?.pose.z ?? 0) + (v?.floorCm ?? 0);
  if (!v) return { floor: base, pellet: base, surface: base };
  const pelletH = Math.min(1.2, pelletG(v) * 40);
  return { floor: base, pellet: base + pelletH, surface: base + liquidHeightCm09(v.shape, vesselMl(v)) };
}

/** Raíz de trazabilidad del contenido (el frasco del que vino la muestra). */
export function rootOf(w: P09World, id: string): string | null {
  const v = w.vessels[id];
  if (!v) return null;
  if ((ROOTS as readonly string[]).includes(id)) return id;
  const r = v.from.find((x) => (ROOTS as readonly string[]).includes(x) && x !== 'ctlBlank');
  if (r) return r;
  return v.from.includes('ctlBlank') ? 'ctlBlank' : null;
}

export const flowStatus = (w: P09World): 'valid' | 'low' | 'off' => (!w.hood.fanOn ? 'off' : sc(w, S9.LOW_FLOW) ? 'low' : 'valid');
export const sashOK = (w: P09World) => w.hood.sashCm <= w.params.sashMaxCm;
/** Luz efectiva en la zona de observación (S14 suma la luz de una sala muy iluminada). */
export const effectiveLight = (w: P09World) => Math.min(130, w.hood.lightPct + (sc(w, S9.BRIGHT_ROOM) ? 40 : 0));

// ─────────────────────────── Comandos ───────────────────────────

const BEFORE_PPE = new Set<P09Command['type']>(['setPPE', 'startWork', 'teacherStop', 'acknowledge', 'inspect', 'pause']);
const DURING_BLOCK = new Set<P09Command['type']>(['acknowledge', 'teacherStop', 'inspect', 'setPose', 'setIgnition', 'setHoodFan', 'setSash', 'setLid', 'pause', 'setObservationLight']);

export function dispatchP09(w: P09World, cmd: P09Command): P09DispatchResult {
  if (w.safety.stoppedByTeacher && cmd.type !== 'teacherStop') return { ok: false, code: 'TEACHER_STOP' };
  if (!w.ppe && !BEFORE_PPE.has(cmd.type)) {
    err09(w, 'E01', 'PPE_REQUIRED', 'CRITICAL');
    return { ok: false, code: 'PPE' };
  }
  if (w.safety.block && !DURING_BLOCK.has(cmd.type)) return { ok: false, code: w.safety.block.code };
  switch (cmd.type) {
    case 'setPPE':
      w.safety.ppe[cmd.item] = cmd.enabled;
      return { ok: true };
    case 'startWork':
      return startWork(w);
    case 'inspect':
      return inspect(w, cmd.target);
    case 'setPose':
      return setPose(w, cmd.id, cmd.pose, cmd.support);
    case 'setCap': {
      const v = w.vessels[cmd.vesselId];
      if (!v || v.capped === undefined) return { ok: false, code: 'NO_CAP' };
      v.capped = cmd.capped;
      return { ok: true };
    }
    case 'setLabel':
      return setLabel(w, cmd.vesselId, cmd.label);
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
      emit09(w, 'POUR_DONE', 'INFO', { ml: Math.round(pr.transferredMl * 100) / 100, from: cmd.sourceId, to: pr.targetId ?? 'bench' });
      return { ok: true, value: pr.transferredMl };
    }
    case 'squeezeDropper':
      return squeezeDropper(w, cmd.sourceId, cmd.targetId, cmd.drops);
    case 'setPipette':
      w.pipette.squeeze01 = clamp(cmd.squeeze01, -1, 1);
      return { ok: true };
    case 'squeezeWash':
      return squeezeWash(w, cmd.targetId, cmd.ml);
    case 'setStir':
      return setStir(w, cmd.vesselId, cmd.motion01);
    case 'readVolume':
      return readVolume(w, cmd.vesselId, cmd.eyeDzCm);
    case 'dispose':
      return dispose(w, cmd.vesselId, cmd.targetId);
    case 'readTurbidity':
      return readTurbidity(w);
    case 'observeTube':
      return observeTube(w, cmd.vesselId);
    case 'setLid':
      return setLid(w, cmd.closed);
    case 'spin':
      return spin(w, cmd.seconds);
    case 'setHoodFan':
      w.hood.fanOn = cmd.on;
      if (!cmd.on && w.flame.ignited) extinguish(w, 'E04', 'FLOW_INTERRUPTED');
      return { ok: true };
    case 'setSash':
      w.hood.sashCm = clamp(cmd.heightCm, 0, GEO09.hood.sashMax);
      if (!sashOK(w) && w.flame.ignited) extinguish(w, 'E03', 'SASH_TOO_HIGH');
      return { ok: true };
    case 'setObservationLight':
      return setLight(w, cmd.pct, cmd.scope);
    case 'setIgnition':
      return setIgnition(w, cmd.on);
    case 'sampleEmission':
      return sampleEmission(w, cmd.zone);
    case 'readSpectrum':
      return readSpectrum(w, cmd.gain);
    case 'cleanSupport':
      return cleanSupport(w, cmd.supportId);
    case 'cleanSpill': {
      if (molTotal(w.outside.bench) <= 1e-15) return { ok: true };
      molAddInto(w.vessels.wasteSol.solid, w.outside.bench);
      w.outside.bench = {};
      emit09(w, 'SPILL_CLEANED', 'INFO');
      return { ok: true };
    }
    case 'acknowledge':
      if (w.safety.block) {
        if (w.safety.block.code === 'IGNITION' && w.flame.ignited) return { ok: false, code: 'FLAME_ON' };
        w.safety.block = null;
        emit09(w, 'BLOCK_CLEARED', 'INFO');
      }
      return { ok: true };
    case 'pause':
      return { ok: true };
    case 'teacherStop':
      w.safety.stoppedByTeacher = cmd.on;
      return { ok: true };
  }
  return { ok: false, code: 'UNKNOWN' };
}

const PPE_ITEMS: PpeItem09[] = ['goggles', 'coat', 'gloves'];

function startWork(w: P09World): P09DispatchResult {
  const missing = PPE_ITEMS.filter((k) => !w.safety.ppe[k]);
  if (missing.length) {
    err09(w, 'E01', 'PPE_REQUIRED', 'CRITICAL', { n: missing.length });
    return { ok: false, code: 'PPE_MISSING' };
  }
  w.ppe = true;
  flag09(w, 'ppe');
  emit09(w, 'PPE_OK', 'INFO');
  return { ok: true };
}

function inspect(w: P09World, target: string): P09DispatchResult {
  flag09(w, `inspected:${target}`);
  if (target === 'hood01') emit09(w, 'INSPECT_HOOD', 'INFO', { flow: flowStatus(w), sash: Math.round(w.hood.sashCm) });
  else if (target === 'cf01') emit09(w, 'INSPECT_CENTRIFUGE', 'INFO', { rpm: Math.round(w.centrifuge.rpm) });
  else emit09(w, 'INSPECTED', 'INFO', { obj: target });
  return { ok: true };
}

/** Códigos impresos o escritos que remiten a un frasco de origen (para detectar tubos mal rotulados, E21). */
function labelRoot(w: P09World, label: string): string | null {
  const t = label.trim().toLowerCase();
  if (!t) return null;
  if (t === w.unknown.code.toLowerCase()) return 'smp1';
  const map: Record<string, string> = { sr: 'ctlSr', 'control sr': 'ctlSr', k: 'ctlK', 'control k': 'ctlK', na: 'ctlNa', li: 'ctlLi', ca: 'ctlCa', blanco: 'ctlBlank' };
  return map[t] ?? null;
}

function setLabel(w: P09World, id: string, label: string): P09DispatchResult {
  const v = w.vessels[id];
  if (!v) return { ok: false, code: 'NO_OBJECT' };
  v.label = label.slice(0, 24);
  checkLabel(w, v);
  return { ok: true };
}

function checkLabel(w: P09World, v: Vessel09) {
  if (!v.label) return;
  const want = labelRoot(w, v.label);
  const have = rootOf(w, v.id);
  if (want && have && want !== have && vesselMl(v) > 0.05) err09(w, 'E21', 'MISLABELED', 'WARN', { obj: v.id });
}

// ─────────────────────────── Poses y apoyos ───────────────────────────

function setPose(w: P09World, id: string, pose: Pose, support?: string): P09DispatchResult {
  const o = w.objects[id];
  if (!o) return { ok: false, code: 'NO_OBJECT' };
  const prev = o.support;
  if (support && support !== prev) {
    // E39: nada entra ni sale del rotor mientras gira.
    if ((prev.startsWith('cf:') || support.startsWith('cf:')) && w.centrifuge.rpm > 1) {
      err09(w, 'E39', 'ROTOR_MOVING', 'ALERT');
      return { ok: false, code: 'ROTOR_MOVING' };
    }
    if (support.startsWith('cf:') && !(w.centrifuge.lidClosed === false)) return { ok: false, code: 'LID_CLOSED' };
    if (support.startsWith('cf:') && Object.values(w.objects).some((x) => x.id !== id && x.support === support)) return { ok: false, code: 'SLOT_BUSY' };
    if (support === 'flamePad' && Object.values(w.objects).some((x) => x.id !== id && x.support === 'flamePad')) return { ok: false, code: 'SLOT_BUSY' };
    if (prev === 'pan') leavePan(w, id);
    if (support === 'pan') enterPan(w, id);
    if (id === 'pip' && w.vessels[prev] && w.evidence.__pipDispensedIn === hashId(prev) && molTotal(w.pipette.content) > 0 && volumeMl(w.pipette.content) > 0.1) {
      // E24: la pipeta sale del recipiente con líquido todavía dentro: llegó menos de lo previsto.
      err09(w, 'E24', 'TRANSFER_INCOMPLETE', 'WARN', { obj: prev });
    }
    if (id === 'pip') w.evidence.__pipDispensedIn = 0;
    if (id === 'loop01') loopMoved(w, prev, support);
    if (o.kind === 'tube' && prev.startsWith('cf:')) flag09(w, `fromRotor:${id}`);
  }
  o.pose = { ...pose };
  if (support) o.support = support;
  return { ok: true };
}

const hashId = (s: string) => {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1000003;
  return h;
};

/** El asa se carga al sumergirla en un líquido y se calienta en la zona emisora. */
function loopMoved(w: P09World, prev: string, support: string) {
  const l = w.loop;
  const v = w.vessels[support];
  if (v && support !== 'clean01' && vesselMl(v) > 0.05) {
    const root = rootOf(w, support);
    // E14: el asa no se limpió desde otra muestra (carga o residuo apreciables de otro origen).
    const salts = (m: Mol) => massG(m) - (m.H2O ?? 0) * SPECIES.H2O.molarMass;
    if ((salts(l.load) > 1e-7 || salts(l.residue) > 2e-7) && l.root !== root) err09(w, 'E14', 'LOOP_NOT_CLEANED', 'WARN');
    const f = Math.min(1, w.params.loopLoadMl / vesselMl(v));
    molAddInto(l.load, molTake(v.liq, f));
    l.root = root;
    l.from = [...v.from, support];
    flag09(w, 'loopLoaded');
  }
  if (support === 'flame') w.evidence.__sampleAt = w.timeS;
  void prev;
}

function enterPan(w: P09World, id: string) {
  const b = w.balance;
  if (!b.panIds.includes(id)) b.panIds.push(id);
  b.disturbedAt = w.timeS;
  b.stable = false;
  b.quietS = 0;
}

function leavePan(w: P09World, id: string) {
  const b = w.balance;
  b.panIds = b.panIds.filter((x) => x !== id);
  b.disturbedAt = w.timeS;
  b.stable = false;
  b.quietS = 0;
}

// ─────────────────────────── Balanza ───────────────────────────

export const objectMassG = (w: P09World, id: string) => (w.objects[id]?.massG ?? 0) + (w.vessels[id] ? massG(w.vessels[id].liq) + massG(w.vessels[id].solid) : 0);

export function panLoadG09(w: P09World): number {
  return w.balance.panIds.reduce((g, id) => g + objectMassG(w, id), 0);
}

function powerBalance(w: P09World, on: boolean): P09DispatchResult {
  const b = w.balance;
  if (on === b.powered) return { ok: true };
  b.powered = on;
  if (on) {
    b.tareG = 0;
    b.shownG = 0;
    b.taredAt = w.timeS;
    b.disturbedAt = w.timeS;
    emit09(w, 'BALANCE_ON', 'INFO');
  }
  return { ok: true };
}

function tare(w: P09World): P09DispatchResult {
  const b = w.balance;
  if (!b.powered) return { ok: false, code: 'BALANCE_OFF' };
  b.tareG = balanceIndication({ ...b, tareG: 0 }, panLoadG09(w), w.params.balance, w.timeS) + b.noiseG;
  b.shownG = 0;
  b.refG = 0;
  b.taredAt = w.timeS;
  b.disturbedAt = w.timeS;
  b.tareSession += 1;
  b.stable = false;
  b.quietS = 0;
  return { ok: true };
}

function readBalance(w: P09World): P09DispatchResult {
  const b = w.balance;
  if (!b.powered) return { ok: false, code: 'BALANCE_OFF' };
  const p = w.params.balance;
  const load = panLoadG09(w);
  const flags: string[] = [];
  let valid = true;
  if (load > p.capacityG) {
    flags.push('OVERLOAD');
    valid = false;
  }
  if (!b.stable) {
    flags.push('UNSTABLE');
    valid = false;
  }
  const shown = quantize(b.shownG, p.resolutionG);
  const r = addReading(w, {
    kind: 'mass', instrumentId: 'balance01', targetId: b.panIds[0] ?? 'pan', value: valid ? shown : NaN, unit: 'g', resolution: p.resolutionG, standardUncertainty: p.uncertaintyG,
    valid, qualityFlags: flags, trueValue: load, snapshot: {},
  });
  if (valid) emit09(w, 'MASS_READ', 'INFO', { g: shown });
  return { ok: valid, id: r.id, value: shown };
}

function addReading(w: P09World, r: Omit<Reading09, 'id' | 't' | 'tick'>): Reading09 {
  const n = w.readingOrder.length + 1;
  const prefix = { mass: 'm', volume: 'v', turbidity: 'u', observation: 'o', emission: 'e', spectrum: 's' }[r.kind];
  const reading: Reading09 = { ...r, id: `${prefix}${n}`, t: w.timeS, tick: w.tick };
  w.readings[reading.id] = reading;
  w.readingOrder.push(reading.id);
  return reading;
}

// ─────────────────────────── Líquidos ───────────────────────────

/** Lo trasladado: líquido y sólido (suspendido o arrastrado) por separado. */
interface Parcel09 {
  liq: Mol;
  solid: Mol;
}

function inherit(dst: string[], src: string[], srcId?: string) {
  for (const id of srcId ? [...src, srcId] : src) if (!dst.includes(id)) dst.push(id);
}

/** Toma `ml` del líquido con lo suspendido proporcional y, si la inclinación es brusca, parte del sedimento. */
function takeLiquid(v: Vessel09, ml: number, entrain = 0): Parcel09 {
  const have = vesselMl(v);
  const out: Parcel09 = { liq: {}, solid: {} };
  if (have <= 1e-9) return out;
  const f = Math.min(1, ml / have);
  out.liq = molTake(v.liq, f);
  for (const s of SOLIDS) {
    const n = v.solid[s] ?? 0;
    if (n <= 0) continue;
    const susp = v.suspended[s] ?? 1;
    const moved = n * (susp * f + (1 - susp) * Math.min(1, entrain * f));
    if (moved <= 0) continue;
    const suspLeft = n * susp * (1 - f);
    const pelletLeft = n - moved - suspLeft;
    out.solid[s] = moved;
    const left = n - moved;
    if (left <= 1e-18) {
      delete v.solid[s];
      delete v.suspended[s];
    } else {
      v.solid[s] = left;
      v.suspended[s] = clamp(suspLeft / left, 0, 1);
      void pelletLeft;
    }
  }
  return out;
}

function addTo(w: P09World, v: Vessel09, p: Parcel09, from: string[] = [], reagents: string[] = []) {
  inherit(v.from, from);
  for (const r of reagents) if (!v.reagents.includes(r)) v.reagents.push(r);
  molAddInto(v.liq, p.liq);
  for (const s of SOLIDS) {
    const add = p.solid[s] ?? 0;
    if (add <= 0) continue;
    const had = v.solid[s] ?? 0;
    const suspHad = had * (v.suspended[s] ?? 1);
    v.solid[s] = had + add;
    // Lo que llega se resuspende (cae sobre el líquido).
    v.suspended[s] = clamp((suspHad + add) / (had + add), 0, 1);
  }
  for (const k of Object.keys(p.solid) as SpeciesId[]) if (!SOLIDS.includes(k as SolidId)) molAddInto(v.solid, { [k]: p.solid[k] });
  const over = vesselMl(v) - v.capacityMl;
  if (over > 0.01) {
    molAddInto(w.outside.bench, molTake(v.liq, over / vesselMl(v)));
    latch09(w, `overfill:${v.id}`, 'OVERFILL', 'WARN', { obj: v.id });
  }
  checkLabel(w, v);
}

const POUR_K: Partial<Record<Vessel09['shape'], number>> = { tube: 0.8, cylinder: 1.4, beaker: 3, bottle: 3, dropperBottle: 1, watchGlass: 0.5 };
const HOLD_ML: Partial<Record<Vessel09['shape'], number>> = { tube: 0.05, cylinder: 0.06, beaker: 0.2, watchGlass: 0.02 };

function pourRateMlS(v: Vessel09, tiltDeg: number): number {
  const ml = vesselMl(v);
  const fill = clamp(ml / Math.max(1, v.capacityMl), 0, 1.2);
  const tilt0 = 100 - 88 * Math.min(1, fill);
  if (tiltDeg <= tilt0 || ml <= (HOLD_ML[v.shape] ?? 0.02)) return 0;
  return (POUR_K[v.shape] ?? 1) * ((tiltDeg - tilt0) / 30) ** 1.5;
}

function setPour(w: P09World, sourceId: string, targetId: string | null, tiltDeg: number): P09DispatchResult {
  const src = w.vessels[sourceId];
  if (!src || POUR_K[src.shape] === undefined) return { ok: false, code: 'NOT_POURABLE' };
  if (targetId && !w.vessels[targetId]) return { ok: false, code: 'BAD_TARGET' };
  if (src.capped) return { ok: false, code: 'CAPPED' };
  const pr = w.pours[sourceId];
  if (!pr) {
    w.pours[sourceId] = { sourceId, targetId, tiltDeg, transferredMl: 0 };
    beginDecant(w, src, targetId, tiltDeg);
  } else {
    pr.targetId = targetId;
    pr.tiltDeg = tiltDeg;
  }
  return { ok: true };
}

/** Comprobaciones al empezar a separar un líquido de su sólido (decantación) — E26, E28, E29, E32, E35, E40, E43. */
function beginDecant(w: P09World, src: Vessel09, targetId: string | null, tiltDeg: number) {
  const tgt = targetId ? w.vessels[targetId] : null;
  const hasSolid = SOLIDS.some((s) => (src.solid[s] ?? 0) > 1e-9);
  if (src.shape === 'tube' && src.reagents.length) {
    if (!src.mixedSinceReagent) err09(w, 'E28', 'NOT_MIXED', 'WARN', { obj: src.id });
    const volL = vesselMl(src) / 1000;
    const srTot = (src.liq['Sr2+'] ?? 0) + (src.solid['SrSO4(s)'] ?? 0);
    const feTot = (src.liq['Fe3+'] ?? 0) + (src.solid['FeOH3(s)'] ?? 0);
    const srPending = srso4EquilibriumShift(src.liq['Sr2+'] ?? 0, src.liq['SO4^2-'] ?? 0, src.solid['SrSO4(s)'] ?? 0, volL);
    const fePending = feoh3EquilibriumShift(src.liq['Fe3+'] ?? 0, src.liq['OH-'] ?? 0, src.solid['FeOH3(s)'] ?? 0, volL);
    // E29: todavía se está formando sólido (lo que falta pasa al sobrenadante).
    if (srPending > 0.1 * Math.max(srTot, 1e-12) || fePending > 0.1 * Math.max(feTot, 1e-12)) err09(w, 'E29', 'SEPARATED_TOO_SOON', 'WARN', { obj: src.id });
    if (w.evidence[`dosed:${src.id}:${REAGENT.sulfate}`] && srTot > 0 && (src.liq['Sr2+'] ?? 0) > 0.1 * srTot && srPending <= 0.1 * srTot) err09(w, 'E26', 'SULFATE_INSUFFICIENT', 'WARN', { obj: src.id });
    if (w.evidence[`dosed:${src.id}:${REAGENT.alkali}`] && feTot > 0 && (src.liq['Fe3+'] ?? 0) > 0.05 * feTot && fePending <= 0.1 * feTot) {
      err09(w, 'E32', 'ALKALI_INSUFFICIENT', 'WARN', { obj: src.id });
      if ((w.evidence[`neut:${src.id}`] ?? 0) > 0.4 * Math.max(w.evidence[`ohAdded:${src.id}`] ?? 1e-12, 1e-12)) err09(w, 'E35', 'PH_UNSUITABLE', 'WARN', { obj: src.id });
    }
    if (hasSolid) {
      const susp = solidSplit(src);
      const frac = susp.susp / Math.max(susp.susp + susp.pellet, 1e-15);
      if (frac > 0.25 && w.evidence[`spun:${src.id}`] && w.centrifuge.lastSpinS < 30) err09(w, 'E40', 'SPIN_TOO_SHORT', 'WARN', { obj: src.id });
      if (tiltDeg > 120 && susp.pellet > 0) err09(w, 'E42', 'ABRUPT_TILT', 'WARN', { obj: src.id });
    }
  }
  // E43: un sobrenadante con potasio de la muestra al residuo, sin haberlo ensayado.
  if (tgt && tgt.shape === 'waste' && (src.liq['K+'] ?? 0) > 1e-7 && rootOf(w, src.id) === 'smp1' && !w.evidence.kTested) err09(w, 'E43', 'USEFUL_DISCARDED', 'WARN', { obj: src.id });
  if (src.shape === 'tube' && (hasSolid || w.evidence[`spun:${src.id}`])) flag09(w, `decant:${src.id}`);
}

function stepPours(w: P09World, dt: number) {
  for (const pr of Object.values(w.pours)) {
    const src = w.vessels[pr.sourceId];
    if (!src) continue;
    const rate = pourRateMlS(src, pr.tiltDeg);
    if (rate <= 0) continue;
    const ml = Math.min(vesselMl(src), rate * dt);
    const entrain = pr.tiltDeg > 120 ? 0.35 : pr.tiltDeg > 105 ? 0.04 : 0.002;
    const moved = takeLiquid(src, ml, entrain);
    pr.transferredMl += volumeMl(moved.liq);
    const tgt = pr.targetId ? w.vessels[pr.targetId] : null;
    if (!tgt) {
      molAddInto(w.outside.bench, moved.liq);
      molAddInto(w.outside.bench, moved.solid);
      latch09(w, `pourBench:${pr.sourceId}`, 'POUR_UNCOUPLED', 'WARN', { obj: pr.sourceId });
      continue;
    }
    // E25: chorro brusco sobre una boca angosta: salpica fuera.
    if (pr.tiltDeg > 135 && tgt.shape === 'tube') {
      const spill = molTake(moved.liq, 0.1);
      molAddInto(w.outside.bench, spill);
      err09(w, 'E25', 'SPLASH', 'WARN', { obj: tgt.id });
    }
    addTo(w, tgt, moved, [...src.from, src.id], src.reagents);
    if (src.shape === 'tube' && SOLIDS.some((s) => (moved.solid[s] ?? 0) > 0)) flag09(w, `carry:${tgt.id}`);
  }
}

/** Gotas de un frasco gotero sobre un recipiente (volumen de gota con su variabilidad; S09 obstruido). */
function squeezeDropper(w: P09World, sourceId: string, targetId: string | null, drops: number): P09DispatchResult {
  const src = w.vessels[sourceId];
  if (!src || src.shape !== 'dropperBottle') return { ok: false, code: 'NOT_DROPPER' };
  if (src.capped) return { ok: false, code: 'CAPPED' };
  const tgt = targetId ? w.vessels[targetId] : null;
  const p = w.params;
  const clogged = sourceId === REAGENT.sulfate && sc(w, S9.SULFATE_CLOGGED);
  let total = 0;
  const parcel: Parcel09 = { liq: {}, solid: {} };
  for (let i = 0; i < Math.max(0, Math.min(40, Math.round(drops))); i++) {
    const cv = clogged ? 0.4 : p.dropCV;
    const vol = Math.max(0.005, p.dropMl * (clogged ? 0.45 : 1) * (1 + cv * gauss09(w)));
    const have = vesselMl(src);
    if (have <= 0.01) break;
    molAddInto(parcel.liq, molTake(src.liq, Math.min(1, vol / have)));
    total += vol;
  }
  if (total <= 0) return { ok: false, code: 'EMPTY' };
  if (!tgt) {
    molAddInto(w.outside.bench, parcel.liq);
    latch09(w, `dropBench:${sourceId}`, 'POUR_UNCOUPLED', 'WARN', { obj: sourceId });
    return { ok: true, value: total };
  }
  reagentChecks(w, sourceId, tgt, parcel.liq);
  addTo(w, tgt, parcel, [sourceId], sourceId === REAGENT.sulfate || sourceId === REAGENT.alkali ? [sourceId] : []);
  if (sourceId === REAGENT.sulfate || sourceId === REAGENT.alkali) {
    w.evidence[`dosed:${tgt.id}:${sourceId}`] = 1;
    w.evidence[`vol:${tgt.id}:${sourceId}`] = (w.evidence[`vol:${tgt.id}:${sourceId}`] ?? 0) + total;
    tgt.lastReagentS = w.timeS;
    tgt.mixedSinceReagent = false;
  }
  emit09(w, 'DROPS_ADDED', 'INFO', { n: Math.round(drops), obj: tgt.id });
  return { ok: true, value: total };
}

/** Errores de orden y de reactivo al dosificar (E27, E31, E33, E34). */
function reagentChecks(w: P09World, sourceId: string, tgt: Vessel09, add: Mol) {
  const sr = (tgt.liq['Sr2+'] ?? 0) + (tgt.solid['SrSO4(s)'] ?? 0);
  const fe = tgt.liq['Fe3+'] ?? 0;
  if (sourceId === REAGENT.alkali) {
    w.evidence[`ohAdded:${tgt.id}`] = (w.evidence[`ohAdded:${tgt.id}`] ?? 0) + (add['OH-'] ?? 0);
    w.evidence[`neut:${tgt.id}`] = (w.evidence[`neut:${tgt.id}`] ?? 0) + Math.min(add['OH-'] ?? 0, tgt.liq['H+'] ?? 0);
    // E31: álcali sobre la mezcla original con Sr²⁺ aún en solución y sin haber separado con sulfato.
    if ((tgt.liq['Sr2+'] ?? 0) > 1e-7 && fe > 1e-7 && !tgt.reagents.includes(REAGENT.sulfate)) err09(w, 'E31', 'ALKALI_ON_ORIGINAL', 'WARN', { obj: tgt.id });
    if (sc(w, S9.ALKALI_CONTAMINATED)) err09(w, 'E34', 'REAGENT_CONTAMINATED', 'WARN', { obj: tgt.id });
  }
  if (sourceId === REAGENT.sulfate && sr > 0) {
    const so4 = (tgt.liq['SO4^2-'] ?? 0) + (add['SO4^2-'] ?? 0) + (tgt.solid['SrSO4(s)'] ?? 0);
    if (so4 > 5 * sr) err09(w, 'E27', 'SULFATE_EXCESS', 'WARN', { obj: tgt.id });
  }
  if (sourceId === REAGENT.water && (rootOf(w, tgt.id) === 'smp1') && !tgt.reagents.length && (sr > 0 || fe > 0)) err09(w, 'E33', 'WATER_FOR_REAGENT', 'WARN', { obj: tgt.id });
}

function squeezeWash(w: P09World, targetId: string, ml: number): P09DispatchResult {
  const wb = w.vessels.washBottle;
  const t = w.vessels[targetId];
  const have = vesselMl(wb);
  if (have <= 0.01) return { ok: false, code: 'EMPTY' };
  const moved = takeLiquid(wb, Math.min(ml, have));
  if (!t) {
    molAddInto(w.outside.bench, moved.liq);
    return { ok: true };
  }
  addTo(w, t, moved, []);
  return { ok: true };
}

function setStir(w: P09World, id: string, motion01: number): P09DispatchResult {
  const v = w.vessels[id];
  if (!v) return { ok: false, code: 'NO_OBJECT' };
  v.stir01 = clamp(motion01, 0, 1);
  if (v.stir01 > 0) {
    v.mixedSinceReagent = true;
    // E41: agitar un tubo ya centrifugado resuspende el sedimento antes de decantar.
    const { pellet } = solidSplit(v);
    if (pellet > 1e-9 && w.evidence[`spun:${id}`] && !w.evidence[`decant:${id}`]) err09(w, 'E41', 'PELLET_RESUSPENDED', 'WARN', { obj: id });
    for (const s of SOLIDS) if ((v.solid[s] ?? 0) > 0) v.suspended[s] = 1;
  }
  return { ok: true };
}

function readVolume(w: P09World, id: string, eyeDzCm: number): P09DispatchResult {
  const v = w.vessels[id];
  if (!v || (v.shape !== 'cylinder' && v.shape !== 'tube')) return { ok: false, code: 'NOT_GRADUATED' };
  const ml = vesselMl(v);
  const div = v.shape === 'cylinder' ? w.params.cylinderDivisionMl : 0.1;
  const parallax = Math.abs(eyeDzCm) > 1;
  const value = quantize(ml + (parallax ? -Math.sign(eyeDzCm) * Math.min(4, Math.abs(eyeDzCm)) * 0.05 * v.areaCm2 : 0), div);
  if (parallax) err09(w, 'E22', 'PARALLAX', 'WARN', { obj: id });
  const r = addReading(w, {
    kind: 'volume', instrumentId: id, targetId: id, value, unit: 'mL', resolution: div, standardUncertainty: div / 2 / Math.sqrt(3), valid: !parallax,
    qualityFlags: parallax ? ['PARALLAX'] : [], trueValue: ml, snapshot: { volumeMl: ml },
  });
  emit09(w, parallax ? 'PARALLAX' : 'VOLUME_READ', parallax ? 'WARN' : 'INFO', { ml: value, obj: id });
  return { ok: !parallax, id: r.id, value };
}

function dispose(w: P09World, id: string, targetId: string): P09DispatchResult {
  const v = w.vessels[id];
  const t = w.vessels[targetId];
  if (!v || !t) return { ok: false, code: 'NO_OBJECT' };
  beginDecant(w, v, targetId, 90);
  const moved = takeLiquid(v, Math.max(0, vesselMl(v) - (HOLD_ML[v.shape] ?? 0.02)), 1);
  addTo(w, t, moved, [...v.from, id], v.reagents);
  emit09(w, 'EMPTIED', 'INFO', { from: id, to: targetId });
  return { ok: true };
}

// ─────────────────────────── Pipeta ───────────────────────────

function stepPipette(w: P09World, dt: number) {
  const p = w.pipette;
  if (p.squeeze01 === 0) return;
  const o = w.objects.pip;
  const v = o ? w.vessels[o.support] : undefined;
  const rate = Math.abs(p.squeeze01) * 1.0 * dt;
  if (p.squeeze01 < 0) {
    if (!v || v.capped) {
      p.squeeze01 = 0;
      return;
    }
    const room = 5 - volumeMl(p.content);
    if (room <= 0) return;
    // La punta junto al fondo con sedimento aspira el sedimento (E44).
    const lv = levels09(w, v.id);
    const atPellet = o.pose.z <= lv.pellet + 0.1 && solidSplit(v).pellet > 1e-9;
    const got = takeLiquid(v, Math.min(rate, room), atPellet ? 1 : 0);
    if (atPellet && SOLIDS.some((s) => (got.solid[s] ?? 0) > 0)) err09(w, 'E44', 'PELLET_ASPIRATED', 'WARN', { obj: v.id });
    molAddInto(p.content, got.liq);
    molAddInto(p.solid, got.solid);
    inherit(p.from, v.from, v.id);
  } else {
    const have = volumeMl(p.content);
    if (have <= 1e-6) return;
    const f = Math.min(1, rate / have);
    const parcel: Parcel09 = { liq: molTake(p.content, f), solid: molTake(p.solid, f) };
    if (!v) {
      molAddInto(w.outside.bench, parcel.liq);
      molAddInto(w.outside.bench, parcel.solid);
      latch09(w, 'pipBench', 'POUR_UNCOUPLED', 'WARN', { obj: 'pip' });
      return;
    }
    // E18: muestra depositada sobre un soporte de llama con residuo de otra muestra.
    if ((v.id === 'wgFlame' || v.id === 'cupFlame') && massG(v.solid) > 1e-7) {
      const resRoot = w.evidence[`resRoot:${v.id}`] ?? 0;
      const root = rootOfFrom(p.from);
      if (resRoot !== hashId(root ?? '')) err09(w, 'E18', 'SUPPORT_RESIDUE', 'WARN', { obj: v.id });
    }
    addTo(w, v, parcel, p.from);
    if (v.id === 'wgFlame' || v.id === 'cupFlame') w.evidence[`resRoot:${v.id}`] = hashId(rootOfFrom(p.from) ?? '');
    w.evidence.__pipDispensedIn = hashId(v.id);
    if (volumeMl(p.content) <= 1e-6) p.from = [];
  }
}

const rootOfFrom = (from: string[]) => from.find((x) => (ROOTS as readonly string[]).includes(x) && x !== 'ctlBlank') ?? (from.includes('ctlBlank') ? 'ctlBlank' : null);

// ─────────────────────────── Observación de tubos ───────────────────────────

/** Turbidez simulada en unidades arbitrarias (UT), proporcional a la masa en suspensión por volumen `[MODELO]`. */
export function turbidityUT(v: Vessel09) {
  const ml = vesselMl(v);
  return ml > 0.05 ? (suspendedG(v) / (ml / 1000)) * 120 : 0;
}

function readTurbidity(w: P09World): P09DispatchResult {
  const id = Object.values(w.objects).find((o) => o.support === 'turb01')?.id;
  const v = id ? w.vessels[id] : undefined;
  if (!v) return { ok: false, code: 'NO_TUBE' };
  const ut = turbidityUT(v);
  const value = quantize(ut * (1 + 0.02 * gauss09(w)), 1);
  const r = addReading(w, {
    kind: 'turbidity', instrumentId: 'turb01', targetId: v.id, value, unit: 'UT', resolution: 1, standardUncertainty: 2, valid: vesselMl(v) > 0.5,
    qualityFlags: vesselMl(v) > 0.5 ? [] : ['LOW_VOLUME'], trueValue: ut, snapshot: { solids: SOLIDS.filter((s) => (v.solid[s] ?? 0) > 1e-9), root: rootOf(w, v.id), volumeMl: vesselMl(v) },
  });
  emit09(w, 'TURBIDITY_READ', 'INFO', { ut: value });
  return { ok: true, id: r.id, value };
}

/** Observación visual de un tubo: sólido (color), sedimento, tinte del líquido. No dice qué ion es. */
function observeTube(w: P09World, id: string): P09DispatchResult {
  const v = w.vessels[id];
  if (!v) return { ok: false, code: 'NO_OBJECT' };
  const sr = v.solid['SrSO4(s)'] ?? 0;
  const fe = v.solid['FeOH3(s)'] ?? 0;
  const visible = (n: number, M: number) => n * M > 1e-3;
  let category = 'clear';
  if (visible(fe, SPECIES['FeOH3(s)'].molarMass)) category = visible(sr, SPECIES['SrSO4(s)'].molarMass) ? 'brownAndWhite' : 'brown';
  else if (visible(sr, SPECIES['SrSO4(s)'].molarMass)) category = 'white';
  const tint = (v.liq['Fe3+'] ?? 0) / Math.max(vesselMl(v) / 1000, 1e-9) > 0.005 ? 'yellow' : 'colorless';
  const { pellet } = solidSplit(v);
  const r = addReading(w, {
    kind: 'observation', instrumentId: 'eye', targetId: id, value: turbidityUT(v), unit: '', resolution: 1, standardUncertainty: 0, valid: true, qualityFlags: [], trueValue: 0,
    category: `${category}|${tint}`,
    snapshot: { solids: SOLIDS.filter((s) => (v.solid[s] ?? 0) > 1e-9), pellet: pellet > 1e-8, root: rootOf(w, id), ions: speciesIn(v.liq, 1e-9).filter((k) => k !== 'H2O'), volumeMl: vesselMl(v) },
  });
  if (category === 'white' || category === 'brownAndWhite') flag09(w, `srSeen:${id}`);
  if (category === 'brown' || category === 'brownAndWhite') flag09(w, `feSeen:${id}`);
  emit09(w, 'TUBE_OBSERVED', 'INFO', { obj: id, cat: category, tint });
  return { ok: true, id: r.id };
}

// ─────────────────────────── Centrífuga ───────────────────────────

const OPPOSITE: Record<number, number> = { 0: 2, 1: 3, 2: 0, 3: 1 };
const rotorTubes = (w: P09World) => Object.values(w.objects).filter((o) => o.support.startsWith('cf:')).map((o) => ({ id: o.id, slot: Number(o.support.slice(3)) }));

function setLid(w: P09World, closed: boolean): P09DispatchResult {
  if (!closed && w.centrifuge.rpm > 1) {
    err09(w, 'E39', 'ROTOR_MOVING', 'ALERT');
    return { ok: false, code: 'ROTOR_MOVING' };
  }
  w.centrifuge.lidClosed = closed;
  return { ok: true };
}

function spin(w: P09World, seconds: number): P09DispatchResult {
  const c = w.centrifuge;
  if (c.rpm > 1) return { ok: false, code: 'ROTOR_MOVING' };
  if (!c.lidClosed) {
    err09(w, 'E38', 'LID_OPEN', 'ALERT');
    return { ok: false, code: 'LID_OPEN' };
  }
  const tubes = rotorTubes(w);
  if (!tubes.length) return { ok: false, code: 'EMPTY_ROTOR' };
  // E37: cada tubo necesita su par en la posición opuesta.
  for (const t of tubes) {
    if (!tubes.some((u) => u.slot === OPPOSITE[t.slot])) {
      err09(w, 'E37', 'ASYMMETRIC', 'ALERT');
      return { ok: false, code: 'ASYMMETRIC' };
    }
  }
  // E36: masas de los pares opuestos dentro de la tolerancia del rotor.
  for (const t of tubes) {
    const u = tubes.find((x) => x.slot === OPPOSITE[t.slot])!;
    if (Math.abs(objectMassG(w, t.id) - objectMassG(w, u.id)) > w.params.maxRotorImbalanceG) {
      err09(w, 'E36', 'IMBALANCE', 'ALERT');
      return { ok: false, code: 'IMBALANCE' };
    }
  }
  c.targetRpm = w.params.centrifugeRpm;
  c.spinUntil = w.timeS + Math.max(5, Math.min(600, seconds));
  c.lastSpinS = Math.max(5, Math.min(600, seconds));
  for (const t of tubes) {
    // E28 también al centrifugar sin haber mezclado el reactivo.
    const v = w.vessels[t.id];
    if (v && v.reagents.length && !v.mixedSinceReagent) err09(w, 'E28', 'NOT_MIXED', 'WARN', { obj: t.id });
    flag09(w, `spun:${t.id}`);
  }
  emit09(w, 'SPIN_STARTED', 'INFO', { s: Math.round(c.lastSpinS) });
  return { ok: true };
}

function stepCentrifuge(w: P09World, dt: number) {
  const c = w.centrifuge;
  if (c.spinUntil !== null && w.timeS >= c.spinUntil) {
    c.targetRpm = 0;
    c.spinUntil = null;
  }
  const d = c.targetRpm - c.rpm;
  c.rpm = clamp(c.rpm + Math.sign(d) * Math.min(Math.abs(d), 800 * dt), 0, w.params.centrifugeRpm);
  if (c.rpm < 1 && c.targetRpm === 0 && c.lastSpinEndedAt === null && c.lastSpinS > 0) {
    c.lastSpinEndedAt = w.timeS;
    flag09(w, 'spinDone');
    emit09(w, 'SPIN_DONE', 'INFO');
  }
  if (c.rpm > 1) c.lastSpinEndedAt = null;
}

// ─────────────────────────── Campana y llama virtual ───────────────────────────

function setLight(w: P09World, pct: number, scope: 'local' | 'room'): P09DispatchResult {
  if (scope === 'room') {
    // E05: no se oscurece la sala, ni la señalización ni los controles.
    err09(w, 'E05', 'SAFETY_LIGHT_LOCKED', 'WARN');
    return { ok: false, code: 'SAFETY_LIGHT_LOCKED' };
  }
  w.hood.lightPct = pct >= 72 ? 100 : pct >= 32 ? 45 : 20;
  flag09(w, `light:${w.hood.lightPct}`);
  return { ok: true };
}

function setIgnition(w: P09World, on: boolean): P09DispatchResult {
  const f = w.flame;
  if (!on) {
    f.ignited = false;
    f.ignitedAt = null;
    f.emitting = {};
    return { ok: true };
  }
  if (flowStatus(w) !== 'valid') {
    err09(w, 'E02', 'HOOD_FLOW', 'CRITICAL', { flow: flowStatus(w) });
    w.safety.block = { code: 'IGNITION', since: w.timeS };
    return { ok: false, code: 'HOOD_FLOW' };
  }
  if (!sashOK(w)) {
    err09(w, 'E03', 'SASH_TOO_HIGH', 'CRITICAL');
    w.safety.block = { code: 'IGNITION', since: w.timeS };
    return { ok: false, code: 'SASH_TOO_HIGH' };
  }
  f.ignited = true;
  f.ignitedAt = w.timeS;
  flag09(w, 'ignited');
  emit09(w, 'FLAME_ON', 'INFO');
  return { ok: true };
}

function extinguish(w: P09World, code: string, ev: string) {
  w.flame.ignited = false;
  w.flame.ignitedAt = null;
  w.flame.emitting = {};
  err09(w, code, ev, 'CRITICAL');
  emit09(w, 'FLAME_OFF', 'WARN');
}

/** Soporte sobre el emisor y su vaporización: devuelve lo que entra a la zona emisora por emisor (mol/s). */
function stepFlame(w: P09World, dt: number) {
  const f = w.flame;
  const p = w.params;
  const wg = w.vessels.wgFlame;
  const onPad = Object.values(w.objects).find((o) => o.support === 'flamePad');
  if (!f.ignited) {
    f.glassStress = Math.max(0, f.glassStress - 0.3 * dt);
    return;
  }
  // E04: si la extracción cae (escenario o ventilador), la llama virtual se suspende.
  if (flowStatus(w) !== 'valid') return extinguish(w, 'E04', 'FLOW_INTERRUPTED');
  const emitting: Partial<Record<EmitterId, number>> = {};
  const addEmit = (m: Mol) => {
    for (const e of EMITTERS) {
      const n = m[e] ?? 0;
      if (n > 0) emitting[e] = (emitting[e] ?? 0) + n / dt;
    }
  };
  // Asa en la llama: la carga se vaporiza (al conducto); una fracción queda como residuo en el alambre.
  if (w.objects.loop01?.support === 'flame') {
    const l = w.loop;
    const moved = molTake(l.load, Math.min(1, dt / p.loopTauS));
    // El agua se evapora; una fracción de las sales queda como residuo en el alambre.
    const salts: Mol = { ...moved };
    delete salts.H2O;
    const res = molTake(salts, p.residueFraction);
    molAddInto(moved, res, -1);
    molAddInto(l.residue, res);
    addEmit(moved);
    molAddInto(w.outside.exhaust, moved);
    const fromRes = molTake(l.residue, Math.min(1, dt / (p.loopTauS * 25)));
    addEmit(fromRes);
    molAddInto(w.outside.exhaust, fromRes);
    l.tempC = Math.min(900, l.tempC + 400 * dt);
  } else w.loop.tempC += (p.ambientTempC - w.loop.tempC) * Math.min(1, dt / 4);
  // Vidrio de reloj o portamuestras sobre el emisor (representación virtual, §4.1).
  if (onPad && w.vessels[onPad.id]) {
    const v = w.vessels[onPad.id];
    const tau = onPad.id === 'wgFlame' ? p.glassTauS : p.cupTauS;
    const water = molTake({ H2O: v.liq.H2O ?? 0 }, Math.min(1, dt / (tau * 0.6)));
    v.liq.H2O = (v.liq.H2O ?? 0) - (water.H2O ?? 0);
    if ((v.liq.H2O ?? 0) <= 1e-15) delete v.liq.H2O;
    molAddInto(w.outside.exhaust, water);
    const rest: Mol = { ...v.liq };
    delete rest.H2O;
    const moved = molTake(rest, Math.min(1, dt / tau));
    molAddInto(v.liq, moved, -1);
    const res = molTake(moved, p.residueFraction * 3);
    molAddInto(v.solid, res);
    addEmit(moved);
    molAddInto(w.outside.exhaust, moved);
    const fromRes = molTake(v.solid, Math.min(1, dt / (tau * 3)));
    for (const s of SOLIDS) if (fromRes[s]) molAddInto(v.solid, { [s]: fromRes[s] });
    for (const s of SOLIDS) delete fromRes[s];
    addEmit(fromRes);
    molAddInto(w.outside.exhaust, fromRes);
    if (onPad.id === 'wgFlame' && wg) {
      f.glassStress += dt;
      if (f.glassStress > p.glassStressMax && !f.glassCracked) {
        // E17: el vidrio común sobrecalentado se fisura (virtual): el ensayo se corta y el contenido cae a la bandeja.
        f.glassCracked = true;
        molAddInto(w.outside.hoodTray, molTake(wg.liq, 1));
        molAddInto(w.outside.hoodTray, molTake(wg.solid, 1));
        err09(w, 'E17', 'GLASS_CRACKED', 'ALERT');
        w.objects.wgFlame.support = 'hoodTray';
      }
    }
  } else f.glassStress = Math.max(0, f.glassStress - 0.3 * dt);
  f.emitting = emitting;
}

/** Lo que el observador ve ahora en la llama (sin registrar). */
export function flameView(w: P09World) {
  const lines = lineIntensities(w.flame.ignited ? w.flame.emitting : {});
  return { lines, ...perceive(lines, effectiveLight(w)) };
}

function emissionSourceInfo(w: P09World) {
  const atFlame = w.objects.loop01?.support === 'flame';
  const pad = Object.values(w.objects).find((o) => o.support === 'flamePad');
  const support: 'loop' | 'watchGlass' | 'refractoryCup' | undefined = atFlame ? 'loop' : pad?.id === 'wgFlame' ? 'watchGlass' : pad?.id === 'cupFlame' ? 'refractoryCup' : undefined;
  const root = support === 'loop' ? w.loop.root : pad ? rootOfFrom(w.vessels[pad.id]?.from ?? []) : null;
  // Emisores que vienen del residuo del soporte y no de la muestra (contaminación, E12/E13).
  const resMol = support === 'loop' ? w.loop.residue : pad ? w.vessels[pad.id]?.solid ?? {} : {};
  const loadMol = support === 'loop' ? w.loop.load : pad ? w.vessels[pad.id]?.liq ?? {} : {};
  // Emisores ajenos a la muestra de origen: vienen del residuo o de una carga anterior del soporte (E12, E13).
  const rootLiq = root ? w.vessels[root]?.liq ?? {} : {};
  const fromResidue = EMITTERS.filter((e) => (resMol[e] ?? 0) + (loadMol[e] ?? 0) > 1e-9 && !((rootLiq[e] ?? 0) > 0));
  // Recipiente del que se tomó la muestra (último eslabón de la trazabilidad).
  const fromList = support === 'loop' ? w.loop.from : pad ? w.vessels[pad.id]?.from ?? [] : [];
  const source = fromList.length ? fromList[fromList.length - 1] : null;
  return { support, root, fromResidue, source };
}

function sampleEmission(w: P09World, zone: 'whole' | 'core'): P09DispatchResult {
  const f = w.flame;
  const info = emissionSourceInfo(w);
  const flags: string[] = [];
  let valid = true;
  if (!f.ignited) {
    flags.push('NO_FLAME');
    valid = false;
  }
  const total = Object.values(f.emitting).reduce((s: number, n) => s + (n ?? 0), 0);
  if (f.ignited && (!info.support || total <= 1e-14) && info.root !== 'ctlBlank') {
    flags.push('NO_SIGNAL');
    valid = false;
  }
  // E20: registrar una llama apagada o sin muestra como observación.
  if (!valid) err09(w, 'E20', 'NO_FLAME_READING', 'WARN');
  const since = f.ignitedAt !== null ? w.timeS - Math.max(f.ignitedAt, w.evidence.__sampleAt ?? 0) : 0;
  if (valid && since < 1.0) {
    flags.push('EARLY');
    err09(w, 'E09', 'EARLY_READING', 'WARN');
  }
  let scale = 1;
  if (zone === 'core') {
    // E15: solo la zona más brillante: la intensidad registrada no es reproducible.
    scale = 0.5 + rand(w);
    flags.push('CORE_ONLY');
    err09(w, 'E15', 'CORE_ZONE', 'WARN');
  }
  const em: Partial<Record<EmitterId, number>> = {};
  for (const [k, n] of Object.entries(f.emitting) as Array<[EmitterId, number]>) em[k] = n * scale * (1 + w.params.emissionNoise * gauss09(w));
  const lines = lineIntensities(f.ignited ? em : {});
  const light = effectiveLight(w);
  const pcv = perceive(lines, light);
  if (valid && light >= 100 && pcv.contrast < 0.35 && total > 1e-14) {
    flags.push('AMBIENT_HIGH');
    err09(w, 'E06', 'AMBIENT_TOO_BRIGHT', 'WARN');
  }
  if (valid && info.fromResidue.includes('Na+') && (f.emitting['Na+'] ?? 0) > 0) err09(w, 'E12', 'NA_ON_LOOP', 'WARN');
  if (valid && info.fromResidue.includes('Sr2+')) err09(w, 'E13', 'SR_CARRYOVER', 'WARN');
  const emitMax = Math.max(0, ...EMITTERS.map((e) => f.emitting[e] ?? 0));
  const emitters = EMITTERS.filter((e) => (f.emitting[e] ?? 0) > Math.max(1e-10, 0.02 * emitMax));
  const r = addReading(w, {
    kind: 'emission', instrumentId: 'eye', targetId: info.support ?? 'flame', value: Math.round(pcv.contrast * 100) / 100, unit: 'u.a.', resolution: 0.01, standardUncertainty: 0.05,
    valid, qualityFlags: flags, trueValue: pcv.contrast, category: valid ? pcv.category : 'none', rgb: [pcv.rgb.r, pcv.rgb.g, pcv.rgb.b],
    snapshot: { support: info.support, root: info.root, source: info.source, lightPct: light, sinceIgnitionS: Math.round(since * 10) / 10, emitters, fromResidue: info.fromResidue },
  });
  if (valid && emitters.includes('K+')) w.evidence.kTested = 1;
  emit09(w, 'EMISSION_READ', valid ? 'INFO' : 'WARN', { cat: valid ? pcv.category : 'none' });
  return { ok: valid, id: r.id };
}

/** Vista espectral virtual (apoyo pedagógico, §3.2): líneas sobre el ruido, con ganancia y saturación (E10). */
function readSpectrum(w: P09World, gain: 1 | 4 | 16): P09DispatchResult {
  const f = w.flame;
  const info = emissionSourceInfo(w);
  if (!f.ignited) {
    err09(w, 'E20', 'NO_FLAME_READING', 'WARN');
    return { ok: false, code: 'NO_FLAME' };
  }
  const lines = lineIntensities(f.emitting).map((l) => ({ nm: l.nm, intensity: l.intensity * gain * (1 + w.params.emissionNoise * gauss09(w)) }));
  const saturated = lines.some((l) => l.intensity > 1);
  const visible = lines.filter((l) => l.intensity > w.params.spectrumNoiseFloor).map((l) => ({ nm: Math.round(l.nm * 10) / 10, intensity: Math.round(Math.min(1, l.intensity) * 1000) / 1000 }));
  if (saturated) err09(w, 'E10', 'SPECTRUM_SATURATED', 'WARN');
  const r = addReading(w, {
    kind: 'spectrum', instrumentId: 'spec01', targetId: info.support ?? 'flame', value: visible.length, unit: '', resolution: 0.1, standardUncertainty: 0.5, valid: !saturated,
    qualityFlags: saturated ? ['SATURATED'] : [], trueValue: visible.length, lines: visible,
    snapshot: { support: info.support, root: info.root, source: info.source, gain, lightPct: effectiveLight(w), emitters: EMITTERS.filter((e) => (f.emitting[e] ?? 0) > 1e-12), fromResidue: info.fromResidue },
  });
  if (!saturated && (f.emitting['K+'] ?? 0) > 0) w.evidence.kTested = 1;
  emit09(w, 'SPECTRUM_READ', saturated ? 'WARN' : 'INFO', { n: visible.length });
  return { ok: !saturated, id: r.id };
}

function cleanSupport(w: P09World, id: 'loop01' | 'wgFlame' | 'cupFlame'): P09DispatchResult {
  if (id === 'loop01') {
    if (w.objects.loop01?.support !== 'clean01') return { ok: false, code: 'NOT_AT_CLEAN' };
    const cup = w.vessels.clean01;
    molAddInto(cup.liq, molTake(w.loop.load, 1));
    molAddInto(cup.liq, molTake(w.loop.residue, 0.98));
    w.loop.root = null;
    w.loop.from = [];
    flag09(w, 'loopCleaned');
    emit09(w, 'SUPPORT_CLEANED', 'INFO', { obj: id });
    return { ok: true };
  }
  const v = w.vessels[id];
  if (!v) return { ok: false, code: 'NO_OBJECT' };
  if (w.objects[id]?.support === 'flamePad' && w.flame.ignited) return { ok: false, code: 'FLAME_ON' };
  molAddInto(w.vessels.wasteLiq.liq, molTake(v.liq, 1));
  molAddInto(w.vessels.wasteLiq.solid, molTake(v.solid, 1));
  v.suspended = {};
  v.from = [];
  w.evidence[`resRoot:${id}`] = 0;
  emit09(w, 'SUPPORT_CLEANED', 'INFO', { obj: id });
  return { ok: true };
}

// ─────────────────────────── Química y sedimentación ───────────────────────────

function stepChemistry(w: P09World, dt: number) {
  const p = w.params;
  const cf = w.centrifuge;
  const settleCf = p.settleCentrifugePerS * (sc(w, S9.SLOW_SETTLING) ? 0.25 : 1) * (cf.rpm / Math.max(1, p.centrifugeRpm));
  for (const v of Object.values(w.vessels)) {
    const ml = vesselMl(v);
    if (ml > 0.02 && v.shape !== 'waste') {
      const before: Partial<Record<SolidId, number>> = { 'SrSO4(s)': v.solid['SrSO4(s)'] ?? 0, 'FeOH3(s)': v.solid['FeOH3(s)'] ?? 0 };
      stepPrecipitation(v.liq, v.solid, ml / 1000, dt, p.kPrecipPerS, v.stir01 > 0 || v.mixedSinceReagent ? 1 : 0, KSP);
      // Lo recién formado nace en suspensión.
      for (const s of SOLIDS) {
        const now = v.solid[s] ?? 0;
        const made = now - (before[s] ?? 0);
        if (now <= 0) {
          delete v.suspended[s];
          continue;
        }
        if (made > 0) v.suspended[s] = clamp(((v.suspended[s] ?? 1) * (before[s] ?? 0) + made) / now, 0, 1);
      }
    }
    // Sedimentación: por gravedad en reposo; rápida en el rotor girando.
    const inRotor = w.objects[v.id]?.support.startsWith('cf:');
    const k = v.stir01 > 0 ? 0 : p.settleGravityPerS + (inRotor ? settleCf : 0);
    if (k > 0) for (const s of SOLIDS) if ((v.suspended[s] ?? 0) > 0) v.suspended[s] = (v.suspended[s] ?? 0) * Math.exp(-k * dt);
  }
}

// ─────────────────────────── Paso ───────────────────────────

export function stepP09World(w: P09World): void {
  const p = w.params;
  const dt = p.dtS;
  w.timeS = Math.round((w.timeS + dt) * 1e6) / 1e6;
  w.tick++;
  stepPours(w, dt);
  stepPipette(w, dt);
  stepChemistry(w, dt);
  stepCentrifuge(w, dt);
  stepFlame(w, dt);
  const b = w.balance;
  if (b.powered) stepAnalyticalBalance(b, panLoadG09(w), p.balance, dt, w.timeS, gauss09(w));
}

export function runP09For(w: P09World, seconds: number) {
  const n = Math.round(seconds / w.params.dtS);
  for (let i = 0; i < n; i++) stepP09World(w);
}

export function p09Summary(w: P09World) {
  const e = worldElements(w);
  return { Sr: Math.round(e.Sr * 1e12) / 1e12, readings: w.readingOrder.length, rpm: Math.round(w.centrifuge.rpm), flame: w.flame.ignited ? 1 : 0, bal: Math.round(w.balance.shownG * 1e4) / 1e4 };
}

export function emptyVessel09(id: string, shape: Vessel09['shape'], spec: { capacityMl: number; areaCm2: number; floorCm: number }, tempC: number, contents: { liq?: Mol; solid?: Mol } = {}, capped?: boolean, from: string[] = []): Vessel09 {
  return {
    id, shape, ...spec, liq: { ...(contents.liq ?? {}) }, solid: { ...(contents.solid ?? {}) }, suspended: {}, capped, stir01: 0, lastReagentS: -1e6, mixedSinceReagent: true, tempC, from: [...from], reagents: [],
  };
}

export { hashRandom, SOLIDS };
