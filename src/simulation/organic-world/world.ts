/**
 * Mundo de la Práctica 8 — síntesis orgánica comparativa: paso fijo determinista (§5, §6).
 *
 * - Materia: moles por especie en el líquido y el sólido de cada recipiente, la película exterior, el gas del espacio
 *   de cabeza, las herramientas, la muestra del analizador, la mesada y la extracción de la campana. Nada se crea ni se
 *   borra: la conservación se comprueba por elementos (§3.1, §5.3).
 * - Reacciones en CUALQUIER recipiente donde estén los reactivos: Fischer reversible (ISO, MS), acetilación e
 *   hidrólisis del anhídrido (ASA), neutralización con bicarbonato en los lavados. El catalizador cambia la velocidad,
 *   nunca la constante de equilibrio (§6.2).
 * - Calor: placa con baño de agua (estado distinto del líquido), baño de hielo, estufa y aire; el líquido no supera su
 *   ebullición; sin reflujo los volátiles pasan a la campana (§6.1).
 * - Separación: reparto en el equilibrio en el embudo, llave que descarga primero la fase de abajo, presión de CO₂ que
 *   obliga a ventear; filtración al vacío con retención de líquido en la torta y finos por el papel; secado por
 *   desecante (capacidad finita) y por estufa; módulo de fracciones curricular (§6.4, §6.5).
 * - Lecturas: balanza (tara, estabilidad, sobrecarga, película exterior, objeto caliente), probetas con paralaje,
 *   termómetro dentro o fuera del líquido y con sesgo, analizador de pureza, densidad y punto de fusión (§6.6, §8.2).
 */
import type { P08Command, P08DispatchResult, PpeItem08 } from './commands';
import type { Mol, P08Object, P08Params, P08World, Pose, Reading08, RouteId, SpeciesId, Vessel08 } from './types';
import { hashRandom, rand } from '../core/rng';
import { emit08, err08, flag08, gauss08, latch08 } from './events';
import { GEO08, liquidHeightCm08 } from './geometry';
import { SPECIES, elementTotals, liquidMl, massG, molAddInto, molTake, molTotal, speciesIn, type Element } from '../organic-chemistry/species';
import { MAIN_REACTION, PRODUCT, SIDE_REACTIONS, applyExtent, limiting } from '../organic-chemistry/stoichiometry';
import { KINETICS, acetylationRate, catalystFactor, fischerRate, hydrolysisRate } from '../organic-chemistry/kinetics';
import { asaSolubilityGL, fractionate, phaseDensity, splitPhases } from '../organic-chemistry/separation';
import { quantize } from '../metrology/uncertainty';
import { balanceIndication, newAnalyticalBalance, stepAnalyticalBalance } from '../instruments/analytical-balance';

export { emit08, latch08, bump08, flag08, err08 } from './events';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const sc = (w: P08World, s: string) => w.scenarios.includes(s);

/** Escenarios docentes (§10). */
export const S8 = {
  MASS_OFFSET: 'P08-SC01_mass_offset',
  THERM_BIAS: 'P08-SC02_therm_bias',
  UNPURE_START: 'P08-SC03_unpure_start',
  WET_VESSEL: 'P08-SC04_wet_vessel',
  HEAT_LOSS: 'P08-SC05_heat_loss',
  SLOW_STIR: 'P08-SC06_slow_stir',
  REFLUX_LEAK: 'P08-SC07_reflux_leak',
  LIMITING_SWITCH: 'P08-SC08_limiting_switch',
  FILTER_TEAR: 'P08-SC09_filter_tear',
  FILTER_WET: 'P08-SC10_filter_wet',
  ASA_SOLUBILITY: 'P08-SC11_asa_solubility',
  DRYING_LOW: 'P08-SC12_drying_low',
  LAYER_EMULSION: 'P08-SC13_layer_emulsion',
  WATER_LOAD: 'P08-SC14_water_load',
  FRACTION_CROSSOVER: 'P08-SC15_fraction_crossover',
  ANALYZER_OFFSET: 'P08-SC16_analyzer_offset',
} as const;

export interface OrganicWorldSpec {
  route: RouteId;
  objects: P08Object[];
  vessels: Vessel08[];
  scenarios: string[];
  mode: string;
}

/** Catalizador asignado a cada ruta (§3.4: H₃PO₄ es ácido FOSFÓRICO, el de la ruta ASA). */
export const CATALYST: Record<RouteId, SpeciesId> = { ISO: 'H2SO4', ASA: 'H3PO4', MS: 'H2SO4' };
/** Reactivo cuyo consumo define el avance (el que la guía pone en defecto). */
export const KEY_REAGENT: Record<RouteId, SpeciesId> = { ISO: 'IAA', ASA: 'SA', MS: 'SA' };
/** Frascos «parecidos» de cada ruta (ORG05) y alcohol equivocado de la ruta MS (ORG44). */
export const LOOKALIKE: Record<RouteId, string> = { ISO: 'btAcOH30', ASA: 'btAcOH', MS: 'btMeOH70' };

const POUR_K: Partial<Record<Vessel08['shape'], number>> = {
  bottle250: 6, bottle100: 4, dropperBottle: 1.5, cyl10: 1.6, cyl25: 2.2, beaker50: 3, beaker100: 3.5, erlenmeyer: 3, roundFlask: 2.5, vial: 1.5, sepFunnel: 3,
  kitasato: 4, plasticCup: 3, watchGlass: 1,
};
const HOLD_ML: Partial<Record<Vessel08['shape'], number>> = { roundFlask: 0.3, beaker50: 0.25, beaker100: 0.3, erlenmeyer: 0.3, cyl10: 0.08, cyl25: 0.12, sepFunnel: 0.4, vial: 0.05, filterPaper: 0, watchGlass: 0.02 };
const HOT_C = 45;

// ─────────────────────────── Creación ───────────────────────────

export function createOrganicWorld(spec: OrganicWorldSpec, seed: number, params: P08Params): P08World {
  const has = (s: string) => spec.scenarios.includes(s);
  const objects: Record<string, P08Object> = {};
  for (const o of spec.objects) objects[o.id] = { ...o, pose: { ...o.pose } };
  const vessels: Record<string, Vessel08> = {};
  for (const v of spec.vessels) vessels[v.id] = structuredClone(v);
  const w: P08World = {
    schemaVersion: 1, timeS: 0, tick: 0, seed, rng: seed >>> 0 || 1, params, mode: spec.mode, route: spec.route, objects, vessels, pours: {},
    droppers: { dp1: { content: {}, squeeze01: 0, from: [] } },
    spatula: { load: {}, residue: {}, from: [] },
    plate: { on: false, setpointC: 25, stir01: 0, bathTempC: params.ambientTempC },
    reflux: { attached: false, waterOn: false, leakFraction: has(S8.REFLUX_LEAK) ? 0.3 : 0.02 },
    thermometer: { where: 'air', inLiquid: false, shownC: params.ambientTempC, biasC: has(S8.THERM_BIAS) ? 3 + hashRandom(seed, 'tb') : 0, checkedAtIce: false },
    filtration: { sealed: false, vacuum: false, paperId: null },
    oven: { on: false },
    // Corte genérico de fábrica (demasiado ancho para cualquier producto): el estudiante lo ajusta.
    fractions: { cutLoC: 100, cutHiC: 200, running: false, doneAt: null, progress01: 0 },
    analyzer: { sample: {}, sampleFrom: null, sampleTempC: params.ambientTempC, method: null, readyAt: null, offset: has(S8.ANALYZER_OFFSET) ? 0.03 : 0 },
    burner: { lit: false },
    tongs: false,
    balance: { ...newAnalyticalBalance({ levelErrorDeg: 0, doorsOpen: false }), powered: false, panIds: [], zeroBiasG: has(S8.MASS_OFFSET) ? 0.035 : 0, tareSession: 0 },
    outside: { bench: {}, exhaust: {}, analyzerWaste: {} },
    readings: {}, readingOrder: [],
    safety: { ppe: { goggles: false, coat: false, gloves: false, hair: false }, block: null, incident: null, stoppedByTeacher: false },
    events: [], evidence: {}, scenarios: [...spec.scenarios], ppe: false,
    initialElements: { C: 0, H: 0, O: 0, Na: 0, P: 0, S: 0 },
  };
  w.initialElements = worldElements(w);
  return w;
}

// ─────────────────────────── Consultas ───────────────────────────

export const vesselMl = (v: Vessel08) => liquidMl(v.liq);
export const vesselContentG = (v: Vessel08) => massG(v.liq) + massG(v.solid);

/** Todo el inventario del mundo (mol por especie). */
export function worldInventory(w: P08World): Mol {
  const t: Mol = {};
  for (const v of Object.values(w.vessels)) {
    molAddInto(t, v.liq);
    molAddInto(t, v.solid);
    molAddInto(t, v.ext);
    molAddInto(t, v.gas);
  }
  for (const d of Object.values(w.droppers)) molAddInto(t, d.content);
  molAddInto(t, w.spatula.load);
  molAddInto(t, w.spatula.residue);
  molAddInto(t, w.analyzer.sample);
  molAddInto(t, w.outside.bench);
  molAddInto(t, w.outside.exhaust);
  molAddInto(t, w.outside.analyzerWaste);
  return t;
}

export const worldElements = (w: P08World): Record<Element, number> => elementTotals(worldInventory(w));

export function conservedTotals08(w: P08World): Record<string, number> {
  const e = worldElements(w);
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(e)) out[k] = Math.round(v * 1e12) / 1e12;
  return out;
}

/** Fases del contenido líquido (derivadas, equilibrio de reparto). La de abajo es la más densa. */
export function phasesOf(v: Vessel08) {
  const s = splitPhases(v.liq);
  if (!s.twoPhases) return { ...s, bottom: s.org, top: {} as Mol, bottomIsOrganic: true };
  const orgDense = phaseDensity(s.org) > phaseDensity(s.aq);
  return { ...s, bottom: orgDense ? s.org : s.aq, top: orgDense ? s.aq : s.org, bottomIsOrganic: orgDense };
}

/** Superficie y fondo del líquido (z sobre la mesada) de un recipiente apoyado. */
export function levels08(w: P08World, id: string) {
  const v = w.vessels[id];
  const o = w.objects[id];
  const base = (o?.pose.z ?? 0) + (v?.floorCm ?? 0);
  if (!v) return { floor: base, interface: base, surface: base };
  const ph = phasesOf(v);
  return { floor: base, interface: base + liquidHeightCm08(v.shape, liquidMl(ph.bottom)), surface: base + liquidHeightCm08(v.shape, vesselMl(v)) };
}

const productOf = (w: P08World) => PRODUCT[w.route];
const flammableIn = (m: Mol) => speciesIn(m, 1e-6).some((k) => SPECIES[k].flammable);

/** Avance de la reacción principal: producto formado (en todo el mundo) sobre el limitante inicial. */
/** Moles iniciales reales del reactivo limitante (registrados al mezclar, antes de calentar). */
export function limitingMol0(w: P08World): number {
  let lim = Infinity;
  for (const [k, nu] of Object.entries(MAIN_REACTION[w.route].nu) as Array<[SpeciesId, number]>) if (nu < 0) lim = Math.min(lim, (w.evidence[`n0:${k}`] ?? 0) / -nu);
  return Number.isFinite(lim) ? lim : 0;
}

export function conversion(w: P08World): number {
  const n0 = limitingMol0(w);
  if (!(n0 > 0)) return 0;
  const p = productOf(w);
  let made = 0;
  for (const v of Object.values(w.vessels)) made += (v.liq[p] ?? 0) + (v.solid[p] ?? 0);
  for (const m of [w.outside.bench, w.outside.exhaust, w.analyzer.sample, w.outside.analyzerWaste]) made += m[p] ?? 0;
  return clamp(made / n0, 0, 1);
}

// ─────────────────────────── Comandos ───────────────────────────

const BEFORE_PPE = new Set<P08Command['type']>(['setPPE', 'startWork', 'teacherStop', 'acknowledge', 'inspect', 'pause']);
const DURING_BLOCK = new Set<P08Command['type']>(['acknowledge', 'teacherStop', 'inspect', 'setPose', 'vent', 'setBurner', 'setCap', 'setPlate', 'pause', 'setCondenserWater', 'useTongs']);

export function dispatchP08(w: P08World, cmd: P08Command): P08DispatchResult {
  if (w.safety.stoppedByTeacher && cmd.type !== 'teacherStop') return { ok: false, code: 'TEACHER_STOP' };
  if (!w.ppe && !BEFORE_PPE.has(cmd.type)) {
    // ORG01/ORG02: sin EPP no se manipula nada (no cambia ninguna cantidad).
    if (!w.safety.ppe.goggles) err08(w, 'ORG01', 'PPE_GOGGLES_MISSING', 'CRITICAL');
    if (!w.safety.ppe.coat || !w.safety.ppe.gloves) err08(w, 'ORG02', 'PPE_COAT_GLOVES_MISSING', 'CRITICAL');
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
    case 'useTongs':
      w.tongs = cmd.on;
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
      emit08(w, 'POUR_DONE', 'INFO', { g: Math.round(pr.transferredG * 100) / 100, from: cmd.sourceId, to: pr.targetId ?? 'bench' });
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
    case 'readVolume':
      return readVolume(w, cmd.vesselId, cmd.eyeDzCm);
    case 'dispose':
      return dispose(w, cmd.vesselId, cmd.targetId);
    case 'setStir': {
      const v = w.vessels[cmd.vesselId];
      if (!v) return { ok: false, code: 'NO_OBJECT' };
      v.stir01 = clamp(cmd.motion01, 0, 1);
      return { ok: true };
    }
    case 'setPlate':
      return setPlate(w, cmd.on, cmd.setpointC);
    case 'setMagneticStir':
      w.plate.stir01 = clamp(cmd.level01, 0, 1);
      return { ok: true };
    case 'setCondenserWater':
      w.reflux.waterOn = cmd.on;
      return { ok: true };
    case 'readThermometer':
      return readThermometer(w);
    case 'setBurner':
      return setBurner(w, cmd.on);
    case 'setStopper': {
      const f = w.vessels.sf;
      if (!f) return { ok: false, code: 'NO_OBJECT' };
      f.stoppered = cmd.on;
      return { ok: true };
    }
    case 'shakeFunnel':
      return shakeFunnel(w, cmd.on);
    case 'vent':
      return vent(w);
    case 'setValve':
      return setValve(w, cmd.opening01, cmd.receiverId);
    case 'sealBuchner':
      w.filtration.sealed = cmd.on;
      return { ok: true };
    case 'setVacuum':
      w.filtration.vacuum = cmd.on;
      return { ok: true };
    case 'setOven':
      w.oven.on = cmd.on;
      return { ok: true };
    case 'setFractionCut':
      if (!(cmd.hiC > cmd.loC)) return { ok: false, code: 'BAD_CUT' };
      w.fractions.cutLoC = cmd.loC;
      w.fractions.cutHiC = cmd.hiC;
      return { ok: true };
    case 'runFractions':
      return runFractions(w);
    case 'takeSample':
      return takeSample(w, cmd.sourceId);
    case 'requestAnalysis':
      return requestAnalysis(w, cmd.method);
    case 'cleanSpill': {
      const b = w.outside.bench;
      if (molTotal(b) <= 1e-12) return { ok: true };
      // El papel absorbente con lo derramado va al residuo sólido (nunca se borra materia).
      const waste = w.vessels.wasteSolid;
      molAddInto(waste.solid, b);
      w.outside.bench = {};
      emit08(w, 'SPILL_CLEANED', 'INFO');
      return { ok: true };
    }
    case 'acknowledge':
      return acknowledge(w);
    case 'pause':
      return { ok: true };
    case 'teacherStop':
      w.safety.stoppedByTeacher = cmd.on;
      return { ok: true };
  }
  return { ok: false, code: 'UNKNOWN' };
}

// ─────────────────────────── Seguridad ───────────────────────────

const PPE_ERR: Record<PpeItem08, [string, string]> = {
  goggles: ['ORG01', 'PPE_GOGGLES_MISSING'],
  coat: ['ORG02', 'PPE_COAT_GLOVES_MISSING'],
  gloves: ['ORG02', 'PPE_COAT_GLOVES_MISSING'],
  hair: ['hair_untied', 'HAIR_UNTIED'],
};

function startWork(w: P08World): P08DispatchResult {
  const missing = (Object.keys(PPE_ERR) as PpeItem08[]).filter((k) => !w.safety.ppe[k]);
  if (missing.length) {
    for (const k of missing) err08(w, PPE_ERR[k][0], PPE_ERR[k][1], 'CRITICAL');
    return { ok: false, code: 'PPE_MISSING' };
  }
  w.ppe = true;
  flag08(w, 'ppe');
  emit08(w, 'PPE_OK', 'INFO');
  return { ok: true };
}

function inspect(w: P08World, target: string): P08DispatchResult {
  flag08(w, `inspected:${target}`);
  const v = w.vessels[target];
  if (target === 'th01') {
    emit08(w, 'INSPECT_THERMO', 'INFO');
  } else if (target === 'balance01') {
    emit08(w, 'INSPECT_BALANCE', 'INFO', { res: w.params.balance.resolutionG, cap: w.params.balance.capacityG });
  } else if (v) {
    const sp = speciesIn({ ...v.liq, ...v.solid }, 1e-6);
    const hazard = sp.some((k) => SPECIES[k].flammable) ? 'flammable' : sp.some((k) => SPECIES[k].corrosive) ? 'corrosive' : sp.some((k) => SPECIES[k].toxic) ? 'toxic' : 'none';
    emit08(w, 'INSPECT_REAGENT', 'INFO', { obj: target, hazard });
  } else emit08(w, 'INSPECTED', 'INFO', { obj: target });
  return { ok: true };
}

function acknowledge(w: P08World): P08DispatchResult {
  const b = w.safety.block;
  if (!b) return { ok: true };
  if (b.code === 'PRESSURE' && pressureKPa(w) > w.params.funnelVentKPa) return { ok: false, code: 'STILL_PRESSURIZED' };
  if (b.code === 'FLAME' && w.burner.lit) return { ok: false, code: 'FLAME_ON' };
  w.safety.block = null;
  emit08(w, 'BLOCK_CLEARED', 'INFO');
  return { ok: true };
}

/** ORG45: no se enciende una llama con inflamables abiertos o en el montaje (bloqueo crítico, §11.2). */
function setBurner(w: P08World, on: boolean): P08DispatchResult {
  if (!on) {
    w.burner.lit = false;
    return { ok: true };
  }
  const openFlammable = Object.values(w.vessels).some((v) => (v.capped === false || v.capped === undefined) && flammableIn(v.liq) && v.shape !== 'waste');
  if (openFlammable) {
    err08(w, 'ORG45', 'FLAME_NEAR_FLAMMABLE', 'CRITICAL');
    w.safety.block = { code: 'FLAME', since: w.timeS };
    return { ok: false, code: 'FLAME' };
  }
  // Ninguna ruta usa llama abierta: el calentamiento es sin llama (§11.1).
  emit08(w, 'NO_FLAME_NEEDED', 'WARN');
  return { ok: false, code: 'NO_FLAME_NEEDED' };
}

// ─────────────────────────── Poses y apoyos ───────────────────────────

function setPose(w: P08World, id: string, pose: Pose, support?: string): P08DispatchResult {
  const o = w.objects[id];
  if (!o) return { ok: false, code: 'NO_OBJECT' };
  const v = w.vessels[id];
  const prev = o.support;
  if (support && support !== prev) {
    // ORG22: el balón caliente no se toma con la mano.
    if (support === 'hand' && v && o.kind === 'roundFlask' && v.tempC > HOT_C && !w.tongs) {
      err08(w, 'ORG22', 'HOT_FLASK_HANDLED', 'ALERT');
      return { ok: false, code: 'HOT' };
    }
    // ORG46: no se abre el reflujo caliente (vapores).
    if (o.kind === 'condenser' && prev === 'rf' && (w.vessels.rf?.tempC ?? 0) > 50) {
      err08(w, 'ORG46', 'HOT_REFLUX_OPENED', 'ALERT');
      return { ok: false, code: 'HOT_REFLUX' };
    }
    // ORG03: el vaso de plástico no va al baño caliente.
    if (o.kind === 'plasticCup' && (support === 'bath01' || support === 'oven01')) {
      err08(w, 'ORG03', 'INCOMPATIBLE_VESSEL', 'WARN', { obj: id });
      return { ok: false, code: 'INCOMPATIBLE' };
    }
    if (prev === 'pan') leavePan(w, id);
    if (support === 'pan') enterPan(w, id);
    // Al moverlo, la película exterior gotea a la mesada (ORG10, se pierde).
    if (v && molTotal(v.ext) > 0 && prev === 'pan') {
      molAddInto(w.outside.bench, v.ext);
      v.ext = {};
    }
    if (o.kind === 'condenser') w.reflux.attached = support === 'rf';
    if (o.kind === 'thermometer') updateThermometerPlace(w, support);
    if (o.kind === 'filterPaper') w.filtration.paperId = support === 'buchner' ? id : w.filtration.paperId === id ? null : w.filtration.paperId;
    if (o.kind === 'sepFunnel' && w.vessels.sf) w.vessels.sf.receiverId = null;
  }
  o.pose = { ...pose };
  if (support) o.support = support;
  // ORG04: el balón de fondo redondo no se sostiene solo sobre la mesada: se vuelca.
  if (support === 'bench' && o.kind === 'roundFlask' && v && (vesselMl(v) > 0.01 || molTotal(v.solid) > 0)) {
    molAddInto(w.outside.bench, molTake(v.liq, 1));
    molAddInto(w.outside.bench, molTake(v.solid, 1));
    o.pose = { ...pose, rotationRad: Math.PI / 2 };
    err08(w, 'ORG04', 'FLASK_TIPPED', 'ALERT');
    // Derrame consumado de corrosivos/inflamables: incidente (anula la seguridad en la rúbrica, §13).
    w.safety.incident ??= { code: 'ORG04', since: w.timeS };
  }
  return { ok: true };
}

function updateThermometerPlace(w: P08World, support: string) {
  const t = w.thermometer;
  t.where = support;
  const v = w.vessels[support];
  t.inLiquid = !!v && vesselMl(v) > 1;
  if (support === 'ice01') t.inLiquid = true;
}

function enterPan(w: P08World, id: string) {
  const b = w.balance;
  if (!b.panIds.includes(id)) b.panIds.push(id);
  b.disturbedAt = w.timeS;
  b.stable = false;
  b.quietS = 0;
}

function leavePan(w: P08World, id: string) {
  const b = w.balance;
  b.panIds = b.panIds.filter((x) => x !== id);
  b.disturbedAt = w.timeS;
  b.stable = false;
  b.quietS = 0;
}

// ─────────────────────────── Balanza ───────────────────────────

/** Masa física sobre el platillo (g): objetos vacíos + contenido + película exterior + lo que tengan encima. */
export function panLoadG08(w: P08World): number {
  let g = 0;
  const seen = new Set<string>();
  const add = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const o = w.objects[id];
    if (!o) return;
    g += o.massG ?? 0;
    const v = w.vessels[id];
    if (v) g += vesselContentG(v) + massG(v.ext);
    for (const other of Object.values(w.objects)) if (other.support === id && other.kind !== 'thermometer' && other.kind !== 'dropper' && other.kind !== 'spatula') add(other.id);
  };
  for (const id of w.balance.panIds) add(id);
  return g;
}

/** Objetos calientes leen menos en la balanza (corrientes de convección, ORG32) `[MODELO]`. */
function hotBiasG(w: P08World): number {
  let bias = 0;
  for (const id of w.balance.panIds) {
    const v = w.vessels[id];
    const t = v?.tempC ?? w.params.ambientTempC;
    if (t > w.params.ambientTempC + 5) bias -= 0.0012 * (t - w.params.ambientTempC);
  }
  return bias;
}

function powerBalance(w: P08World, on: boolean): P08DispatchResult {
  const b = w.balance;
  if (on === b.powered) return { ok: true };
  b.powered = on;
  if (on) {
    b.tareG = balanceIndication({ ...b, tareG: 0 }, panLoadG08(w), w.params.balance, w.timeS);
    b.shownG = 0;
    b.refG = 0;
    b.taredAt = w.timeS;
    b.tareSession += 1;
    b.disturbedAt = w.timeS;
    w.evidence.__tareLoad = panLoadG08(w);
    w.evidence.__tareIds = 0;
    emit08(w, 'BALANCE_ON', 'INFO');
  }
  return { ok: true };
}

function hashIds(ids: string[]): number {
  let h = 7;
  for (const id of [...ids].sort()) for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 1000003;
  return ids.length ? h : 0;
}

function tare(w: P08World): P08DispatchResult {
  const b = w.balance;
  if (!b.powered) return { ok: false, code: 'BALANCE_OFF' };
  const load = panLoadG08(w);
  b.tareG = balanceIndication({ ...b, tareG: 0 }, load + zeroBias(w), w.params.balance, w.timeS) + b.noiseG;
  b.shownG = 0;
  b.refG = 0;
  b.taredAt = w.timeS;
  b.disturbedAt = w.timeS;
  b.tareSession += 1;
  b.stable = false;
  b.quietS = 0;
  w.evidence.__tareLoad = load;
  w.evidence.__tareIds = hashIds(b.panIds);
  for (const id of b.panIds) if (w.vessels[id] && vesselContentG(w.vessels[id]) <= 0.002) w.evidence[`emptyKnown:${id}`] = 1;
  flag08(w, 'tared');
  return { ok: true };
}

const zeroBias = (w: P08World) => w.balance.zeroBiasG;

function readBalance(w: P08World): P08DispatchResult {
  const b = w.balance;
  if (!b.powered) return { ok: false, code: 'BALANCE_OFF' };
  const p = w.params;
  const load = panLoadG08(w);
  const flags: string[] = [];
  let valid = true;
  const ids = [...b.panIds];
  // ORG08: sobrecarga → lectura inválida.
  if (load > p.balance.capacityG) {
    flags.push('OVERLOAD');
    err08(w, 'ORG08', 'BALANCE_OVERLOAD', 'WARN');
    valid = false;
  }
  if (!b.stable) {
    flags.push('UNSTABLE');
    err08(w, 'ORG07', 'MASS_UNSTABLE', 'WARN');
    valid = false;
  }
  // ORG06: un recipiente con contenido que nunca se pesó vacío ni se taró: la indicación incluye el recipiente.
  const inPan = ids.flatMap((id) => [id, ...Object.values(w.objects).filter((o) => o.support === id).map((o) => o.id)]);
  for (const id of inPan) {
    const v = w.vessels[id];
    if (!v) continue;
    if (vesselContentG(v) <= 0.002) {
      if (valid) w.evidence[`emptyKnown:${id}`] = 1;
    }
    else if (!w.evidence[`emptyKnown:${id}`] && (w.objects[id]?.massG ?? 0) > 0) {
      flags.push('NO_TARE');
      err08(w, 'ORG06', 'UNTARED', 'WARN', { obj: id });
    }
  }
  // ORG10: película de líquido por fuera del recipiente.
  if (ids.some((id) => w.vessels[id] && massG(w.vessels[id].ext) > 0.005)) {
    flags.push('WET_OUTSIDE');
    err08(w, 'ORG10', 'WET_OUTSIDE', 'WARN');
  }
  // ORG32: objeto caliente.
  if (ids.some((id) => (w.vessels[id]?.tempC ?? 0) > p.hotObjectThresholdC)) {
    flags.push('HOT');
    err08(w, 'ORG32', 'WEIGHED_HOT', 'WARN');
  }
  // ORG31: cristales húmedos (la torta retiene agua o ácido acético).
  const paper = ids.flatMap((id) => [id, ...Object.values(w.objects).filter((o) => o.support === id).map((o) => o.id)]).find((id) => w.objects[id]?.kind === 'filterPaper');
  if (paper) {
    const pv = w.vessels[paper];
    const crystals = massG(pv.solid);
    if (crystals > 0.05 && massG(pv.liq) > 0.05 * crystals) {
      flags.push('WET');
      err08(w, 'ORG31', 'WET_CRYSTALS', 'WARN');
    }
  }
  // ORG43: ácido salicílico pesado sobre un vidrio húmedo (ruta MS).
  const glass = ids.find((id) => w.objects[id]?.kind === 'watchGlass');
  if (glass && w.route === 'MS' && (w.vessels[glass].liq.H2O ?? 0) * 18 > 0.01 && (w.vessels[glass].solid.SA ?? 0) > 0) err08(w, 'ORG43', 'WET_WEIGHING_GLASS', 'WARN');
  const shown = quantize(b.shownG, p.balance.resolutionG);
  const prodSp = productOf(w);
  const inside = ids.flatMap((id) => [id, ...Object.values(w.objects).filter((o) => o.support === id).map((o) => o.id)]).filter((id) => w.vessels[id]);
  const productG = inside.reduce((s, id) => s + ((w.vessels[id].liq[prodSp] ?? 0) + (w.vessels[id].solid[prodSp] ?? 0)) * SPECIES[prodSp].molarMass, 0);
  const waterG = inside.reduce((s, id) => s + ((w.vessels[id].liq.H2O ?? 0) + (w.vessels[id].solid.H2O ?? 0)) * 18.015, 0);
  const r = addReading(w, {
    kind: 'mass', instrumentId: 'balance01', targetId: ids[0] ?? 'pan', value: valid ? shown : NaN, unit: 'g', resolution: p.balance.resolutionG,
    standardUncertainty: p.balance.uncertaintyG, valid, stable: b.stable, qualityFlags: flags, trueValue: load - (w.evidence.__tareLoad ?? 0),
    snapshot: { species: [...new Set(inside.flatMap((id) => speciesIn({ ...w.vessels[id].liq, ...w.vessels[id].solid }, 1e-7)))], sources: inside, tareSession: b.tareSession, productG, waterG, tempC: w.vessels[ids[0]]?.tempC },
  });
  if (valid) emit08(w, 'MASS_READ', 'INFO', { g: shown });
  return { ok: valid, id: r.id, value: shown };
}

// ─────────────────────────── Lecturas ───────────────────────────

function addReading(w: P08World, r: Omit<Reading08, 'id' | 't' | 'tick'>): Reading08 {
  const n = w.readingOrder.length + 1;
  const prefix = { mass: 'm', volume: 'v', temperature: 't', purity: 'p', mp: 'f', density: 'd' }[r.kind];
  const reading: Reading08 = { ...r, id: `${prefix}${n}`, t: w.timeS, tick: w.tick };
  w.readings[reading.id] = reading;
  w.readingOrder.push(reading.id);
  return reading;
}

/** Probetas: lectura del menisco con paralaje según la altura real del ojo (ORG09). */
function readVolume(w: P08World, vesselId: string, eyeDzCm: number): P08DispatchResult {
  const v = w.vessels[vesselId];
  if (!v) return { ok: false, code: 'NO_OBJECT' };
  const ml = vesselMl(v);
  const div = vesselId === 'cyl10' || vesselId === 'cyl25' ? w.params.cylinderDivisionMl[vesselId] : 1;
  const parallaxMl = Math.abs(eyeDzCm) > 1 ? -Math.sign(eyeDzCm) * Math.min(4, Math.abs(eyeDzCm)) * 0.08 * v.areaCm2 * 0.5 : 0;
  const flags = Math.abs(eyeDzCm) > 1 ? ['PARALLAX'] : [];
  if (flags.length) err08(w, 'ORG09', 'PARALLAX', 'WARN', { obj: vesselId });
  const value = quantize(ml + parallaxMl, div);
  const r = addReading(w, {
    kind: 'volume', instrumentId: vesselId, targetId: vesselId, value, unit: 'mL', resolution: div, standardUncertainty: div / 2 / Math.sqrt(3), valid: !flags.length, stable: true,
    qualityFlags: flags, trueValue: ml, snapshot: { species: speciesIn(v.liq, 1e-7), tempC: v.tempC },
  });
  emit08(w, flags.length ? 'PARALLAX' : 'VOLUME_READ', flags.length ? 'WARN' : 'INFO', { ml: value, obj: vesselId });
  return { ok: r.valid, id: r.id, value };
}

function readThermometer(w: P08World): P08DispatchResult {
  const t = w.thermometer;
  const flags: string[] = [];
  // ORG14: fuera del líquido la sonda ve casi el ambiente.
  if (!t.inLiquid) {
    flags.push('NOT_IN_LIQUID');
    err08(w, 'ORG14', 'THERMO_NOT_IN_LIQUID', 'WARN');
  }
  // ORG18: termómetro con sesgo sin comprobar contra el agua con hielo.
  if (t.biasC !== 0 && !t.checkedAtIce && t.where !== 'ice01') {
    flags.push('UNCHECKED');
    err08(w, 'ORG18', 'THERMO_UNCHECKED', 'WARN');
  }
  if (t.where === 'ice01') t.checkedAtIce = true;
  const value = quantize(t.shownC, 0.1);
  const truth = thermoTarget(w);
  const r = addReading(w, {
    kind: 'temperature', instrumentId: 'th01', targetId: t.where, value, unit: '°C', resolution: 0.1, standardUncertainty: 0.3, valid: t.inLiquid, stable: Math.abs(t.shownC - truth - t.biasC) < 0.3,
    qualityFlags: flags, trueValue: truth, snapshot: { species: [], tempC: truth },
  });
  emit08(w, 'TEMP_READ', 'INFO', { c: value });
  return { ok: true, id: r.id, value };
}

/** Lo que mide la sonda del termómetro (sin el sesgo): el líquido, el baño o el aire. */
function thermoTarget(w: P08World): number {
  const t = w.thermometer;
  const amb = w.params.ambientTempC;
  if (t.where === 'bath01' || t.where === 'plate01') return w.plate.bathTempC;
  if (t.where === 'ice01') return w.params.iceTempC;
  const v = w.vessels[t.where];
  if (!v) return amb;
  if (!t.inLiquid) return amb + 0.25 * (v.tempC - amb);
  return v.tempC;
}

// ─────────────────────────── Trasvases ───────────────────────────

/** Lo trasladado, separado por compartimento: lo disuelto viaja disuelto y el sólido como sólido. */
interface Parcel08 {
  liq: Mol;
  solid: Mol;
}

const parcelG = (p: Parcel08) => massG(p.liq) + massG(p.solid);
const flatP = (p: Parcel08): Mol => molAddInto(molAddInto({}, p.liq), p.solid);

function inherit(dst: string[], src: string[], srcId?: string) {
  for (const id of srcId ? [...src, srcId] : src) if (!dst.includes(id)) dst.push(id);
}

/** Cristales en suspensión (ASA o SA en medio acuoso) viajan con el líquido; el desecante se queda. */
const SUSPENDED = new Set<SpeciesId>(['ASA', 'SA']);

function takeLiquid(v: Vessel08, ml: number, fromBottom = false): Parcel08 {
  const have = vesselMl(v);
  const out: Parcel08 = { liq: {}, solid: {} };
  if (have <= 1e-9) return out;
  const f = Math.min(1, ml / have);
  if (fromBottom) {
    const ph = phasesOf(v);
    const bottomMl = liquidMl(ph.bottom);
    const fb = Math.min(1, ml / Math.max(1e-9, bottomMl));
    const takeB: Mol = {};
    for (const [k, n] of Object.entries(ph.bottom) as Array<[SpeciesId, number]>) takeB[k] = n * fb;
    const left = ml - bottomMl * fb;
    if (left > 1e-9 && ph.twoPhases) {
      const ft = Math.min(1, left / Math.max(1e-9, liquidMl(ph.top)));
      for (const [k, n] of Object.entries(ph.top) as Array<[SpeciesId, number]>) takeB[k] = (takeB[k] ?? 0) + n * ft;
    }
    for (const [k, n] of Object.entries(takeB) as Array<[SpeciesId, number]>) {
      const real = Math.min(n, v.liq[k] ?? 0);
      out.liq[k] = real;
      v.liq[k] = (v.liq[k] ?? 0) - real;
      if ((v.liq[k] ?? 0) <= 1e-15) delete v.liq[k];
    }
  } else molAddInto(out.liq, molTake(v.liq, f));
  // Suspensión de cristales: se van en proporción al líquido (o todo si se vacía).
  for (const [k, n] of Object.entries(v.solid) as Array<[SpeciesId, number]>) {
    if (!SUSPENDED.has(k)) continue;
    const share = f >= 0.9 ? n : n * f;
    out.solid[k] = share;
    v.solid[k] = n - share;
    if ((v.solid[k] ?? 0) <= 1e-15) delete v.solid[k];
  }
  return out;
}

function addTo(w: P08World, v: Vessel08, p: Parcel08, from: string[] = []) {
  inherit(v.from, from);
  molAddInto(v.liq, p.liq);
  molAddInto(v.solid, p.solid);
  for (const k of speciesIn(flatP(p), 1e-9)) if (!v.history.includes(k)) v.history.push(k);
  if (parcelG(p) > 1e-6) v.lastAddS = w.timeS;
  const over = vesselMl(v) - v.brimMl;
  if (over > 0.01) {
    const f = over / vesselMl(v);
    molAddInto(w.outside.bench, molTake(v.liq, f));
    latch08(w, `overfill:${v.id}`, 'OVERFILL', 'WARN', { obj: v.id });
  }
}

function pourRateMlS(v: Vessel08, tiltDeg: number): number {
  const ml = vesselMl(v);
  const fill = clamp(ml / Math.max(1, v.capacityMl), 0, 1.2);
  const tilt0 = 100 - 88 * Math.min(1, fill);
  // La película que moja el vidrio no sale al verter (queda en el recipiente).
  if (tiltDeg <= tilt0 || ml <= (HOLD_ML[v.shape] ?? 0.02)) return 0;
  return (POUR_K[v.shape] ?? 2) * ((tiltDeg - tilt0) / 30) ** 1.5;
}

/** Comprobaciones al empezar un vertido: rechazos seguros (ORG03, ORG25, ORG44) y llama. */
function pourRefusal(w: P08World, sourceId: string, targetId: string | null): string | null {
  const src = w.vessels[sourceId];
  const tgt = targetId ? w.vessels[targetId] : null;
  if (src.capped) return 'CAPPED';
  if (tgt?.shape === 'plasticCup' && (flammableIn(src.liq) || speciesIn(src.liq).some((k) => SPECIES[k].corrosive) || src.tempC > 40)) {
    err08(w, 'ORG03', 'INCOMPATIBLE_VESSEL', 'WARN', { obj: targetId ?? '' });
    return 'INCOMPATIBLE';
  }
  if (targetId === 'rf') {
    if (w.route === 'ASA' && (src.liq.H2SO4 ?? 0) > 0) {
      err08(w, 'ORG25', 'UNASSIGNED_CATALYST', 'ALERT');
      return 'UNASSIGNED_CATALYST';
    }
    if (w.route === 'MS' && (src.liq.IAA ?? 0) > 0) {
      err08(w, 'ORG44', 'WRONG_ALCOHOL', 'ALERT');
      return 'WRONG_ALCOHOL';
    }
    // Agua sobre el anhídrido activo y caliente: bloqueo hasta la condición segura (§11.2).
    const rf = w.vessels.rf;
    if (w.route === 'ASA' && (src.liq.H2O ?? 0) > 0 && (rf.liq.AA ?? 0) > 1e-3 && rf.tempC > 50) {
      emit08(w, 'WATER_HOT_ANHYDRIDE', 'ALERT');
      return 'WATER_HOT';
    }
  }
  return null;
}

function setPour(w: P08World, sourceId: string, targetId: string | null, tiltDeg: number): P08DispatchResult {
  const src = w.vessels[sourceId];
  if (!src || POUR_K[src.shape] === undefined) return { ok: false, code: 'NOT_POURABLE' };
  if (targetId && !w.vessels[targetId] && targetId !== 'buchner') return { ok: false, code: 'BAD_TARGET' };
  const pr = w.pours[sourceId];
  if (!pr) {
    const refused = pourRefusal(w, sourceId, targetId);
    if (refused) return { ok: false, code: refused };
    w.pours[sourceId] = { sourceId, targetId, tiltDeg, startedS: w.timeS, transferredG: 0 };
    if (targetId === 'rf' && sourceId === LOOKALIKE[w.route]) err08(w, 'ORG05', 'WRONG_LABEL', 'WARN', { obj: sourceId });
  } else {
    pr.targetId = targetId;
    pr.tiltDeg = tiltDeg;
  }
  return { ok: true };
}

function transfer(w: P08World, sourceId: string, targetId: string | null, ml: number, tilt = 60): number {
  const src = w.vessels[sourceId];
  if (!src) return 0;
  const moved = takeLiquid(src, Math.min(ml, vesselMl(src)));
  const g = parcelG(moved);
  if (g <= 0) return 0;
  deliver(w, src, targetId, moved, tilt);
  return g;
}

/** Entrega un paquete a un destino: recipiente, Büchner (al papel o al kitasato) o mesada. */
function deliver(w: P08World, src: Vessel08 | null, targetId: string | null, moved: Parcel08, tilt = 60) {
  const from = src ? [...src.from, src.id] : [];
  if (targetId === 'buchner') return intoBuchner(w, moved, from);
  const tgt = targetId ? w.vessels[targetId] : null;
  if (!tgt) {
    molAddInto(w.outside.bench, flatP(moved));
    err08(w, 'ORG11', 'POUR_UNCOUPLED', 'WARN', { obj: src?.id ?? 'bench' });
    return;
  }
  // ORG21: el embudo con la llave abierta deja pasar lo que se vierte.
  if (tgt.shape === 'sepFunnel' && (tgt.valve01 ?? 0) > 0.05) {
    err08(w, 'ORG21', 'VALVE_LEFT_OPEN', 'WARN');
    const rec = tgt.receiverId ? w.vessels[tgt.receiverId] : null;
    if (rec) addTo(w, rec, moved, from);
    else molAddInto(w.outside.bench, flatP(moved));
    return;
  }
  // ORG10: un vertido muy inclinado escurre por fuera del recipiente receptor.
  if (tilt > 125) {
    const drip = molTake(moved.liq, 0.04);
    molAddInto(tgt.ext, drip);
  }
  checkProductToWaste(w, tgt, flatP(moved), src);
  checkAqueousAsProduct(w, tgt, moved.liq);
  checkTransferContamination(w, tgt, moved, src);
  addTo(w, tgt, moved, from);
}

/** ORG37/ORG50: el producto se va al residuo (capa equivocada o embudo descartado con producto). */
function checkProductToWaste(w: P08World, tgt: Vessel08, m: Mol, src: Vessel08 | null) {
  if (tgt.shape !== 'waste') return;
  const p = productOf(w);
  if (w.route === 'ASA' || !((m[p] ?? 0) > 0)) return;
  // Acumulado: lo que de verdad llega al residuo a lo largo de los vertidos o descargas.
  w.evidence.__productToWaste = (w.evidence.__productToWaste ?? 0) + (m[p] ?? 0);
  const total = totalOf(w, p);
  if (total > 0 && w.evidence.__productToWaste > 0.1 * total) err08(w, w.route === 'ISO' ? 'ORG37' : 'ORG50', 'PRODUCT_DISCARDED', 'WARN', { obj: tgt.id });
  void src;
}

/** ORG49: guardar la fase acuosa como si fuera el producto (MS). */
function checkAqueousAsProduct(w: P08World, tgt: Vessel08, liq: Mol) {
  if (tgt.id !== 'vialP' && tgt.id !== 'fracPot') return;
  // Se juzga el contenido que queda en el recipiente del producto (con lo que llega ahora).
  const all = molAddInto({ ...tgt.liq }, liq);
  const g = massG(all);
  if (g > 0.2 && ((all.H2O ?? 0) * 18.015) / g > 0.5) err08(w, w.route === 'ISO' ? 'ORG37' : 'ORG49', 'AQUEOUS_AS_PRODUCT', 'WARN', { obj: tgt.id });
}

/** ORG40/ORG42 se juzgan al aislar; aquí, ORG12: herramienta o recipiente con restos de otra especie. */
function checkTransferContamination(w: P08World, tgt: Vessel08, p: Parcel08, src: Vessel08 | null) {
  void w;
  void tgt;
  void p;
  void src;
}

const totalOf = (w: P08World, s: SpeciesId) => worldInventory(w)[s] ?? 0;

/** Al Büchner: el líquido al papel (charco) y los cristales al papel, salvo los finos que el poro deja pasar. */
function intoBuchner(w: P08World, moved: Parcel08, from: string[]) {
  const f = w.filtration;
  const kit = w.vessels.kitasato;
  const paper = f.paperId ? w.vessels[f.paperId] : null;
  if (!paper) {
    // Sin papel todo pasa al kitasato (también los cristales).
    addTo(w, kit, moved, from);
    return;
  }
  // Comprobaciones de la filtración (ORG26–ORG30), una vez por vertido.
  const asaS = moved.solid.ASA ?? 0;
  const asaL = moved.liq.ASA ?? 0;
  if (w.route === 'ASA' && asaS + asaL > 1e-5) {
    if (asaS / (asaS + asaL) < 0.6) err08(w, 'ORG27', 'FILTERED_BEFORE_CRYSTALS', 'WARN');
    const srcT = w.vessels[from[from.length - 1]]?.tempC ?? 25;
    if (srcT > 15) err08(w, 'ORG28', 'FILTERED_WARM', 'WARN');
    if (f.paperId === 'fpCoarse') err08(w, 'ORG29', 'COARSE_PAPER', 'WARN');
    if (f.vacuum && !f.sealed) err08(w, 'ORG30', 'BUCHNER_NOT_SEALED', 'WARN');
    const srcV = w.vessels[from[from.length - 1]];
    if (srcV && massG(srcV.liq) + massG(moved.liq) > 0 && (moved.liq.H2O ?? 0) * 18.015 + (srcV.liq.H2O ?? 0) * 18.015 > 40) err08(w, 'ORG26', 'TOO_MUCH_LIQUID', 'WARN');
  }
  const finesFrac = f.paperId === 'fpCoarse' ? w.params.coarsePaperFines : sc(w, S8.FILTER_TEAR) ? 0.08 : 0;
  const fines: Mol = {};
  for (const [k, n] of Object.entries(moved.solid) as Array<[SpeciesId, number]>) fines[k] = n * finesFrac;
  molAddInto(moved.solid, fines, -1);
  addTo(w, kit, { liq: {}, solid: fines }, from);
  addTo(w, paper, moved, from);
}

/** Vaciar un recipiente en otro (residuo o trasvase completo, dejando la película). */
function dispose(w: P08World, vesselId: string, targetId: string): P08DispatchResult {
  const v = w.vessels[vesselId];
  if (!v || (!w.vessels[targetId] && targetId !== 'buchner')) return { ok: false, code: 'NO_OBJECT' };
  if (vesselId === 'rf' && v.tempC > HOT_C && !w.tongs) {
    err08(w, 'ORG22', 'HOT_FLASK_HANDLED', 'ALERT');
    return { ok: false, code: 'HOT' };
  }
  const refused = targetId === 'buchner' ? null : pourRefusal(w, vesselId, targetId);
  if (refused && refused !== 'CAPPED') return { ok: false, code: refused };
  const hold = HOLD_ML[v.shape] ?? 0.05;
  const ml = vesselMl(v);
  const moved = takeLiquid(v, Math.max(0, ml - hold));
  // El sólido que no está en suspensión también pasa casi entero (raspado), salvo una pizca.
  for (const [k, n] of Object.entries(v.solid) as Array<[SpeciesId, number]>) {
    const share = n * 0.98;
    moved.solid[k] = (moved.solid[k] ?? 0) + share;
    v.solid[k] = n - share;
  }
  deliver(w, v, targetId, moved);
  emit08(w, 'EMPTIED', 'INFO', { from: vesselId, to: targetId });
  return { ok: true };
}

function squeezeWash(w: P08World, targetId: string, ml: number): P08DispatchResult {
  const wb = w.vessels.washBottle;
  if (!wb) return { ok: false, code: 'NO_OBJECT' };
  const moved = takeLiquid(wb, Math.min(ml, vesselMl(wb)));
  if (targetId === 'buchner') {
    intoBuchner(w, moved, ['washBottle']);
    return { ok: true };
  }
  const t = w.vessels[targetId];
  if (!t) {
    molAddInto(w.outside.bench, flatP(moved));
    return { ok: true };
  }
  if (targetId === 'rf') {
    const refused = pourRefusal(w, 'washBottle', 'rf');
    if (refused) {
      addTo(w, wb, moved);
      return { ok: false, code: refused };
    }
    noteWaterIntoReaction(w);
  }
  addTo(w, t, moved, ['washBottle']);
  return { ok: true };
}

/** ORG23: agua sobre el anhídrido antes de terminar la acetilación (ruta ASA). */
function noteWaterIntoReaction(w: P08World) {
  if (w.route !== 'ASA') return;
  const rf = w.vessels.rf;
  if ((rf.liq.AA ?? 0) > 1e-3 && conversion(w) < 0.8) err08(w, 'ORG23', 'WATER_BEFORE_ACETYLATION', 'WARN');
}

// ─────────────────────────── Gotero y espátula ───────────────────────────

function stepDroppers(w: P08World, dt: number) {
  for (const [id, d] of Object.entries(w.droppers)) {
    if (d.squeeze01 === 0) continue;
    const o = w.objects[id];
    const at = o?.support ?? '';
    const v = w.vessels[at];
    const rate = Math.abs(d.squeeze01) * 0.25 * dt;
    if (d.squeeze01 < 0) {
      if (!v || v.capped) {
        if (v?.capped) emit08(w, 'CAPPED', 'WARN', { obj: at });
        d.squeeze01 = 0;
        continue;
      }
      const room = 2 - liquidMl(d.content);
      if (room <= 0) continue;
      const got = takeLiquid(v, Math.min(rate, room));
      molAddInto(d.content, got.liq);
      inherit(d.from, v.from, v.id);
    } else {
      const have = liquidMl(d.content);
      if (have <= 1e-6) continue;
      const out: Parcel08 = { liq: molTake(d.content, Math.min(1, rate / have)), solid: {} };
      if (v && at === 'rf') {
        const refusalSrc = (out.liq.H2SO4 ?? 0) > 0 && w.route === 'ASA';
        if (refusalSrc) {
          molAddInto(d.content, out.liq);
          d.squeeze01 = 0;
          err08(w, 'ORG25', 'UNASSIGNED_CATALYST', 'ALERT');
          continue;
        }
        if ((out.liq.H2O ?? 0) > 0 && w.route === 'ASA' && (v.liq.AA ?? 0) > 1e-3 && v.tempC > 50 && (out.liq.H3PO4 ?? 0) === 0) {
          molAddInto(d.content, out.liq);
          d.squeeze01 = 0;
          emit08(w, 'WATER_HOT_ANHYDRIDE', 'ALERT');
          continue;
        }
        if ((out.liq.H2O ?? 0) > 0.01 && (out.liq.H3PO4 ?? 0) === 0 && (out.liq.H2SO4 ?? 0) === 0) noteWaterIntoReaction(w);
      }
      deliver(w, null, v ? at : null, out);
      if (v) inherit(v.from, d.from);
    }
  }
}

function scoop(w: P08World, sourceId: string): P08DispatchResult {
  const v = w.vessels[sourceId];
  if (!v) return { ok: false, code: 'NO_OBJECT' };
  if (w.objects.spatula?.support !== sourceId) return { ok: false, code: 'NOT_IN_JAR' };
  if (v.capped) return { ok: false, code: 'CAPPED' };
  const total = massG(v.solid);
  if (total <= 1e-6) return { ok: false, code: 'EMPTY' };
  if (massG(w.spatula.load) > 0.8) return { ok: false, code: 'FULL' };
  const g = Math.min(total, w.params.spatulaScoopG * (0.75 + 0.5 * rand(w)));
  const got = molTake(v.solid, g / total);
  // ORG12: restos de otra sustancia en la espátula (contaminación cruzada).
  const res = speciesIn(w.spatula.residue, 1e-8);
  if (res.length && speciesIn(got).some((k) => !res.includes(k))) w.evidence.__spatulaCross = 1;
  if (sourceId === 'jarNa2SO4used') err08(w, 'ORG41', 'SATURATED_DESICCANT', 'WARN');
  molAddInto(w.spatula.load, w.spatula.residue);
  w.spatula.residue = {};
  molAddInto(w.spatula.load, got);
  inherit(w.spatula.from, v.from, v.id);
  emit08(w, 'SCOOPED', 'INFO', { obj: sourceId });
  return { ok: true, value: massG(got) };
}

function dropSpatula(w: P08World, targetId: string): P08DispatchResult {
  const load = w.spatula.load;
  if (molTotal(load) <= 1e-12) return { ok: false, code: 'EMPTY' };
  const residue = molTake(load, w.params.spatulaResidueFraction);
  const moved = molTake(load, 1);
  w.spatula.residue = molAddInto(w.spatula.residue, residue);
  const t = w.vessels[targetId];
  if (!t) {
    molAddInto(w.outside.bench, moved);
    return { ok: true };
  }
  if (w.evidence.__spatulaCross && (targetId === 'rf' || w.objects[targetId]?.kind === 'watchGlass')) err08(w, 'ORG12', 'CROSS_CONTAMINATION', 'WARN', { obj: targetId });
  w.evidence.__spatulaCross = 0;
  addTo(w, t, { liq: {}, solid: moved }, w.spatula.from);
  w.spatula.from = [];
  emit08(w, 'SOLID_ADDED', 'INFO', { obj: targetId });
  return { ok: true, value: massG(moved) };
}

function cleanTool(w: P08World, toolId: string): P08DispatchResult {
  const waste = w.vessels.wasteSolid;
  if (toolId === 'spatula') {
    molAddInto(waste.solid, w.spatula.residue);
    molAddInto(waste.solid, w.spatula.load);
    w.spatula = { load: {}, residue: {}, from: [] };
    return { ok: true };
  }
  const d = w.droppers[toolId];
  if (d) {
    molAddInto(w.vessels.wasteAcid.liq, d.content);
    d.content = {};
    d.from = [];
    return { ok: true };
  }
  return { ok: false, code: 'NO_OBJECT' };
}

// ─────────────────────────── Calor, reflujo y llama ───────────────────────────

function setPlate(w: P08World, on: boolean, setpointC: number): P08DispatchResult {
  w.plate.on = on;
  w.plate.setpointC = clamp(setpointC, 20, 100);
  if (on) flag08(w, 'plateOn');
  return { ok: true };
}

/** Temperatura de ebullición de la mezcla: la del componente volátil mayoritario más bajo (curricular). */
function boilingCap(v: Vessel08): number {
  const tot = molTotal(v.liq);
  if (tot <= 0) return 200;
  let cap = 250;
  for (const [k, n] of Object.entries(v.liq) as Array<[SpeciesId, number]>) {
    const bp = SPECIES[k].bpC;
    if (bp !== undefined && (n ?? 0) / tot > 0.25) cap = Math.min(cap, bp + 0.5);
  }
  return cap;
}

function stepThermal(w: P08World, dt: number) {
  const p = w.params;
  const amb = p.ambientTempC;
  // Baño de agua sobre la placa: sube hacia la consigna limitado por la potencia; apagada, se enfría.
  const pl = w.plate;
  if (pl.on) {
    const d = pl.setpointC - pl.bathTempC;
    pl.bathTempC += Math.sign(d) * Math.min(Math.abs(d), p.plateMaxRateCs * dt) * (d > 0 ? 1 : 0.3);
  } else pl.bathTempC += (amb - pl.bathTempC) * Math.min(1, dt / 1500);
  const contactK = sc(w, S8.HEAT_LOSS) ? 4 : 1;
  const stirEff = sc(w, S8.SLOW_STIR) ? Math.min(pl.stir01, 0.25) : pl.stir01;
  for (const v of Object.values(w.vessels)) {
    const o = w.objects[v.id];
    if (!o) continue;
    if (v.shape === 'bath' || v.shape === 'iceBath') continue;
    let target = amb;
    let tau = v.shape === 'filterPaper' || v.shape === 'watchGlass' || v.shape === 'vial' ? 240 : p.airTauS;
    const sup = o.support;
    if (sup === 'bath01') {
      target = pl.bathTempC;
      tau = p.bathTauS * contactK * (stirEff < 0.2 ? 1.8 : 1);
      v.stir01 = Math.max(v.stir01 * 0, stirEff);
    } else if (sup === 'ice01') {
      target = p.iceTempC;
      tau = 80;
    } else if (sup === 'oven01' || w.objects[sup]?.support === 'oven01') {
      target = w.oven.on ? p.ovenTempC : amb;
      tau = 200;
    }
    v.tempC += (target - v.tempC) * Math.min(1, dt / tau);
    v.tempC = Math.min(v.tempC, boilingCap(v));
  }
  // Termómetro: primer orden hacia lo que ve la sonda, con su sesgo.
  const t = w.thermometer;
  const tw = w.vessels[t.where];
  if (tw) t.inLiquid = vesselMl(tw) > 1;
  t.shownC += (thermoTarget(w) + t.biasC - t.shownC) * Math.min(1, dt / 4);
}

/** Pérdida de volátiles a la campana: sin condensador, todo; con agua y sellado, casi nada (§6.1). */
function stepEvaporation(w: P08World, dt: number) {
  for (const v of Object.values(w.vessels)) {
    if (v.tempC < 40 || vesselMl(v) <= 0.01) continue;
    let k = 1;
    if (v.id === 'rf' && w.reflux.attached) k = w.reflux.waterOn ? w.reflux.leakFraction : 0.7;
    if (v.stoppered) k = 0.02;
    for (const [s, n] of Object.entries(v.liq) as Array<[SpeciesId, number]>) {
      const bp = SPECIES[s].bpC;
      if (bp === undefined) continue;
      const f = 0.0006 * Math.exp((v.tempC - bp) / 12) * k * dt;
      if (f <= 0) continue;
      const loss = (n ?? 0) * Math.min(0.05, f);
      v.liq[s] = (n ?? 0) - loss;
      w.outside.exhaust[s] = (w.outside.exhaust[s] ?? 0) + loss;
    }
  }
}

// ─────────────────────────── Química ───────────────────────────

function stepChemistry(w: P08World, dt: number) {
  const route = w.route;
  const r0 = MAIN_REACTION[route];
  for (const v of Object.values(w.vessels)) {
    const liq = v.liq;
    const vL = liquidMl(liq) / 1000;
    if (vL < 5e-5) continue;
    const tK = v.tempC + 273.15;
    const mix = 0.35 + 0.65 * clamp(v.stir01, 0, 1);
    const c = (s: SpeciesId) => (liq[s] ?? 0) / vL;
    const lim = limiting(r0, liq).xiMax || ((liq[KEY_REAGENT[route]] ?? 0) + 1e-12);
    if (route === 'ASA') {
      if ((liq.SA ?? 0) > 0 && (liq.AA ?? 0) > 0) {
        const cat = catalystFactor(liq.H3PO4 ?? 0, lim, KINETICS.ASA.uncatalyzedFactor);
        applyExtent(liq, r0, acetylationRate(tK, c('SA'), c('AA'), cat) * vL * mix * dt);
      }
    } else if ((liq[route === 'ISO' ? 'AcOH' : 'SA'] ?? 0) > 0 || (liq[PRODUCT[route]] ?? 0) > 0) {
      const acid = route === 'ISO' ? 'AcOH' : 'SA';
      const alcohol = route === 'ISO' ? 'IAA' : 'MeOH';
      const ester = PRODUCT[route];
      const cat = catalystFactor(liq.H2SO4 ?? 0, lim, KINETICS[route].uncatalyzedFactor);
      const r = fischerRate(route, tK, c(acid), c(alcohol), c(ester), c('H2O'), cat);
      applyExtent(liq, r0, r * vL * mix * dt);
    }
    // Hidrólisis del anhídrido (compite por él cuando hay agua).
    if ((liq.AA ?? 0) > 0 && (liq.H2O ?? 0) > 0) applyExtent(liq, SIDE_REACTIONS.anhydride_hydrolysis, hydrolysisRate(tK, c('AA'), c('H2O')) * vL * dt);
    // Neutralización con bicarbonato: rápida si se agita; el CO₂ va al espacio de cabeza o a la campana.
    if ((liq.NaHCO3 ?? 0) > 0) {
      const kN = KINETICS.neutralization.kPerS * (0.08 + clamp(v.stir01, 0, 1)) * dt;
      for (const rx of [SIDE_REACTIONS.neut_sulfuric, SIDE_REACTIONS.neut_acetic, SIDE_REACTIONS.neut_salicylic]) {
        const acidSp = Object.keys(rx.nu).find((k) => (rx.nu[k as SpeciesId] ?? 0) < 0 && k !== 'NaHCO3') as SpeciesId;
        const avail = Math.min(liq[acidSp] ?? 0, (liq.NaHCO3 ?? 0) / -(rx.nu.NaHCO3 ?? -1));
        if (avail <= 0) continue;
        const done = applyExtent(liq, rx, avail * Math.min(1, kN));
        const co2 = done * (rx.nu.CO2 ?? 0);
        if (co2 > 0) {
          liq.CO2 = (liq.CO2 ?? 0) - co2;
          if ((liq.CO2 ?? 0) <= 1e-15) delete liq.CO2;
          if (v.stoppered) v.gas.CO2 = (v.gas.CO2 ?? 0) + co2;
          else w.outside.exhaust.CO2 = (w.outside.exhaust.CO2 ?? 0) + co2;
        }
      }
    }
  }
}

/** Disolución y cristalización de SA y ASA según el medio (acuoso: tabla de solubilidad; orgánico: muy soluble). */
function stepSolids(w: P08World, dt: number) {
  for (const v of Object.values(w.vessels)) {
    const ml = vesselMl(v);
    for (const s of ['SA', 'ASA'] as SpeciesId[]) {
      const total = (v.liq[s] ?? 0) + (v.solid[s] ?? 0);
      if (total <= 0) continue;
      const liqG = massG(v.liq);
      const waterFrac = liqG > 0 ? ((v.liq.H2O ?? 0) * 18.015) / liqG : 0;
      let capG: number;
      if (ml < 0.05) capG = 0;
      else if (waterFrac > 0.5) {
        const acidBoost = sc(w, S8.ASA_SOLUBILITY) ? 1.6 : 1;
        capG = (asaSolubilityGL(v.tempC) * (s === 'SA' ? 0.65 : 1) * acidBoost * ml) / 1000;
      } else capG = (250 * (1 + v.tempC / 50) * ml) / 1000;
      const capMol = capG / SPECIES[s].molarMass;
      const target = Math.min(total, capMol);
      const cur = v.liq[s] ?? 0;
      const tau = target > cur ? 15 / (0.3 + clamp(v.stir01, 0, 1)) : 40;
      const next = target + (cur - target) * Math.exp(-dt / tau);
      v.liq[s] = next;
      v.solid[s] = total - next;
      if ((v.liq[s] ?? 0) <= 1e-15) delete v.liq[s];
      if ((v.solid[s] ?? 0) <= 1e-15) delete v.solid[s];
    }
    // Desecante: el Na₂SO₄ anhidro toma agua del líquido hasta su capacidad (ORG40, ORG41).
    const na = v.solid.Na2SO4 ?? 0;
    if (na > 0 && (v.liq.H2O ?? 0) > 0) {
      const cap = (na * SPECIES.Na2SO4.molarMass * w.params.dryingCapacity * (sc(w, S8.DRYING_LOW) ? 0.4 : 1)) / 18.015;
      const room = Math.max(0, cap - (v.solid.Na2SO4w ?? 0));
      const take = Math.min(room, v.liq.H2O ?? 0) * Math.min(1, dt * 0.08 * (0.3 + clamp(v.stir01, 0, 1)));
      if (take > 0) {
        v.liq.H2O = (v.liq.H2O ?? 0) - take;
        v.solid.Na2SO4w = (v.solid.Na2SO4w ?? 0) + take;
        if (w.objects[v.id]?.kind === 'erlenmeyer') flag08(w, 'dried');
      }
    }
  }
}

// ─────────────────────────── Embudo de separación ───────────────────────────

/** Presión manométrica del CO₂ en el embudo tapado (kPa) `[MODELO]`: gas ideal en el espacio de cabeza. */
export function pressureKPa(w: P08World): number {
  const f = w.vessels.sf;
  if (!f) return 0;
  const headL = Math.max(0.005, (f.capacityMl - vesselMl(f)) / 1000);
  // n·R·T / V con V en litros da directamente kPa.
  return ((f.gas.CO2 ?? 0) * 8.314 * (f.tempC + 273.15)) / headL;
}

function shakeFunnel(w: P08World, on: boolean): P08DispatchResult {
  const f = w.vessels.sf;
  if (!f) return { ok: false, code: 'NO_OBJECT' };
  if (on && !f.stoppered) return { ok: false, code: 'NO_STOPPER' };
  if (on && w.objects.sf?.support !== 'hand') return { ok: false, code: 'NOT_HELD' };
  f.stir01 = on ? 1 : 0;
  if (on) {
    f.emulsion01 = 1;
    flag08(w, 'shaken');
  }
  return { ok: true };
}

function vent(w: P08World): P08DispatchResult {
  const f = w.vessels.sf;
  if (!f) return { ok: false, code: 'NO_OBJECT' };
  molAddInto(w.outside.exhaust, f.gas);
  f.gas = {};
  if (w.safety.block?.code === 'PRESSURE') w.safety.block = null;
  flag08(w, 'vented');
  emit08(w, 'VENTED', 'INFO');
  return { ok: true };
}

function setValve(w: P08World, opening01: number, receiverId: string | null): P08DispatchResult {
  const f = w.vessels.sf;
  if (!f) return { ok: false, code: 'NO_OBJECT' };
  const wasOpen = (f.valve01 ?? 0) > 0.05;
  f.valve01 = clamp(opening01, 0, 1);
  f.receiverId = receiverId;
  const nowOpen = f.valve01 > 0.05;
  if (nowOpen && !wasOpen) {
    // Comienza una descarga: se anota qué fase está abajo para detectar si se pasa de la interfase (ORG38).
    const ph = phasesOf(f);
    w.evidence.__drainBottomOrg = ph.bottomIsOrganic ? 1 : 0;
    // Sin interfase (una sola fase, o apenas unas gotas abajo) no hay «pasarse de la interfase».
    w.evidence.__drainBottomMl = ph.twoPhases && liquidMl(ph.bottom) > 0.3 ? liquidMl(ph.bottom) : 1e9;
    w.evidence.__drained = 0;
    w.evidence.__drainProd0 = f.liq[productOf(w)] ?? 0;
  }
  if (!nowOpen && wasOpen) {
    // ORG50: cerrar demasiado pronto deja buena parte de la capa del producto en el embudo (ruta MS).
    const p = productOf(w);
    const ph = phasesOf(f);
    const bottomP = ph.bottom[p] ?? 0;
    const started = w.evidence.__drainProd0 ?? 0;
    if (w.route === 'MS' && ph.twoPhases && ph.bottomIsOrganic && started > 0 && bottomP > 0.25 * started && liquidMl(ph.bottom) > 0.3) err08(w, 'ORG50', 'VALVE_CLOSED_EARLY', 'WARN');
  }
  return { ok: true };
}

function stepFunnel(w: P08World, dt: number) {
  const f = w.vessels.sf;
  if (!f) return;
  // La emulsión se deshace con el tiempo (más despacio en S13).
  const tauE = sc(w, S8.LAYER_EMULSION) ? 120 : 25;
  if (f.stir01 === 0) f.emulsion01 = Math.max(0, f.emulsion01 - dt / tauE);
  // Agitar tapado con CO₂ acumulado sin ventear: bloqueo de seguridad (ORG39).
  if (f.stoppered && f.stir01 > 0 && pressureKPa(w) > w.params.funnelVentKPa && !w.safety.block) {
    err08(w, 'ORG39', 'FUNNEL_PRESSURE', 'CRITICAL');
    w.safety.block = { code: 'PRESSURE', since: w.timeS };
    f.stir01 = 0;
  }
  const open = f.valve01 ?? 0;
  if (open <= 0.05 || vesselMl(f) <= 0.001) return;
  // Descarga por la llave: primero la fase de abajo; con emulsión, sale mezclada.
  const ml = Math.min(vesselMl(f), 1.5 * open * dt);
  const ph = phasesOf(f);
  const bottomMl = liquidMl(ph.bottom);
  let moved: Parcel08;
  if (f.emulsion01 > 0.3) moved = takeLiquid(f, ml);
  else moved = takeLiquid(f, ml, true);
  // Había interfase al abrir y la fase de abajo ya se agotó: lo que sigue saliendo es la otra fase.
  const hadInterface = (w.evidence.__drainBottomMl ?? 1e9) < 1e8;
  if (hadInterface && (!ph.twoPhases || bottomMl < 0.02)) w.evidence.__drained = (w.evidence.__drained ?? 0) + ml;
  if ((w.evidence.__drained ?? 0) > 0.3) err08(w, 'ORG38', 'PAST_INTERFACE', 'WARN');
  const rec = f.receiverId ? w.vessels[f.receiverId] : null;
  if (rec) {
    checkProductToWaste(w, rec, moved.liq, f);
    checkAqueousAsProduct(w, rec, moved.liq);
    addTo(w, rec, moved, [...f.from, 'sf']);
  } else {
    molAddInto(w.outside.bench, flatP(moved));
    latch08(w, 'funnelSpill', 'BENCH_SPILL', 'WARN', { obj: 'sf' });
  }
}

// ─────────────────────────── Filtración, secado y fracciones ───────────────────────────

function stepFiltration(w: P08World, dt: number) {
  const f = w.filtration;
  if (!f.paperId) return;
  const paper = w.vessels[f.paperId];
  const kit = w.vessels.kitasato;
  if (!paper || !kit || w.objects.buchner?.support !== 'kitasato' || w.objects[f.paperId]?.support !== 'buchner') return;
  const crystalsG = massG(paper.solid);
  const retention = (f.vacuum && f.sealed ? w.params.cakeRetentionSealed : w.params.cakeRetentionUnsealed) * crystalsG;
  const liqG = massG(paper.liq);
  const rate = f.vacuum ? (f.sealed ? 3 : 0.8) : 0.25;
  const excess = liqG - retention;
  if (excess > 0) {
    const mlOut = Math.min(vesselMl(paper), rate * dt);
    const frac = Math.min(1, mlOut / Math.max(1e-6, vesselMl(paper)), excess / Math.max(1e-9, liqG));
    const moved = molTake(paper.liq, frac);
    molAddInto(kit.liq, moved);
  } else if (f.vacuum && f.sealed && liqG > 0) {
    // Con vacío sostenido, el aire arrastra parte del líquido retenido hacia el kitasato.
    const minRet = 0.25 * crystalsG;
    if (liqG > minRet) molAddInto(kit.liq, molTake(paper.liq, Math.min(0.01 * dt, (liqG - minRet) / liqG)));
  }
  if (crystalsG > 0.05) flag08(w, 'filtered');
}

/** Secado en la estufa o al aire: el agua y el ácido acético de la torta pasan a la campana. */
function stepDrying(w: P08World, dt: number) {
  for (const v of Object.values(w.vessels)) {
    if (v.shape !== 'filterPaper' && v.shape !== 'watchGlass') continue;
    const o = w.objects[v.id];
    if (!o) continue;
    const inOven = (o.support === 'oven01' || w.objects[o.support]?.support === 'oven01') && w.oven.on;
    if (o.support === 'buchner') continue;
    const k = (inOven ? 0.012 : 0.0004) * (sc(w, S8.DRYING_LOW) ? 0.3 : 1) * dt;
    for (const s of ['H2O', 'AcOH', 'MeOH'] as SpeciesId[]) {
      const n = v.liq[s] ?? 0;
      if (n <= 0) continue;
      const loss = n * Math.min(1, k);
      v.liq[s] = n - loss;
      w.outside.exhaust[s] = (w.outside.exhaust[s] ?? 0) + loss;
      if ((v.liq[s] ?? 0) <= 1e-15) delete v.liq[s];
    }
    // Al secarse, el ASA disuelto en el líquido retenido vuelve a ser sólido.
    if (vesselMl(v) < 0.01 && (v.liq.ASA ?? 0) > 0) {
      v.solid.ASA = (v.solid.ASA ?? 0) + (v.liq.ASA ?? 0);
      delete v.liq.ASA;
    }
    if (inOven) flag08(w, 'ovenDried');
  }
}

function runFractions(w: P08World): P08DispatchResult {
  const pot = w.vessels.fracPot;
  const vial = w.vessels.vialP;
  if (!pot || !vial) return { ok: false, code: 'NO_OBJECT' };
  if (vesselMl(pot) < 0.1) return { ok: false, code: 'EMPTY' };
  if (w.objects.vialP?.support !== 'frac01') return { ok: false, code: 'NO_COLLECTOR' };
  const fr = w.fractions;
  if (!(fr.cutHiC > fr.cutLoC)) return { ok: false, code: 'BAD_CUT' };
  fr.running = true;
  fr.progress01 = 0;
  fr.doneAt = w.timeS + 60;
  emit08(w, 'FRACTIONS_STARTED', 'INFO', { lo: fr.cutLoC, hi: fr.cutHiC });
  return { ok: true };
}

function stepFractions(w: P08World, dt: number) {
  const fr = w.fractions;
  if (!fr.running || fr.doneAt === null) return;
  fr.progress01 = clamp(1 - (fr.doneAt - w.timeS) / 60, 0, 1);
  if (w.timeS < fr.doneAt) return;
  void dt;
  fr.running = false;
  const pot = w.vessels.fracPot;
  const sigma = sc(w, S8.FRACTION_CROSSOVER) ? 8 : undefined;
  const { head, fraction, residue } = fractionate(pot.liq, fr.cutLoC, fr.cutHiC, sigma);
  // El agua no secada co-destila con el éster (heteroazeótropo, curricular): parte pasa a la fracción (ORG40).
  const carried = (head.H2O ?? 0) * 0.6;
  if (carried > 0) {
    head.H2O = (head.H2O ?? 0) - carried;
    fraction.H2O = (fraction.H2O ?? 0) + carried;
  }
  pot.liq = residue;
  molAddInto(w.vessels.fracHead.liq, head);
  // ORG40: agua en el destilado porque no se secó la fase orgánica; ORG42: fracción demasiado ancha.
  const fracG = massG(fraction);
  if (fracG > 0.01) {
    const waterFrac = ((fraction.H2O ?? 0) * 18.015) / fracG;
    if (waterFrac > 0.004) err08(w, 'ORG40', 'WATER_IN_PRODUCT', 'WARN');
    const p = productOf(w);
    const other = 1 - ((fraction[p] ?? 0) * SPECIES[p].molarMass) / fracG - waterFrac;
    if (other > 0.05 || fr.cutHiC - fr.cutLoC > 16) err08(w, 'ORG42', 'FRACTION_TOO_WIDE', 'WARN');
  }
  addTo(w, w.vessels.vialP, { liq: fraction, solid: {} }, ['fracPot']);
  flag08(w, 'fractionCollected');
  emit08(w, 'FRACTIONS_DONE', 'INFO', { g: Math.round(fracG * 1000) / 1000 });
}

// ─────────────────────────── Análisis ───────────────────────────

function takeSample(w: P08World, sourceId: string): P08DispatchResult {
  const v = w.vessels[sourceId];
  if (!v) return { ok: false, code: 'NO_OBJECT' };
  const a = w.analyzer;
  if (a.readyAt !== null) return { ok: false, code: 'ANALYZER_BUSY' };
  // La muestra previa sin analizar vuelve a su residuo.
  molAddInto(w.outside.analyzerWaste, a.sample);
  const g = vesselContentG(v);
  if (g < 0.005) return { ok: false, code: 'EMPTY' };
  const f = Math.min(1, 0.03 / g);
  a.sample = molAddInto(molTake(v.liq, f), molTake(v.solid, f));
  a.sampleFrom = sourceId;
  a.sampleTempC = v.tempC;
  emit08(w, 'SAMPLE_TAKEN', 'INFO', { obj: sourceId });
  return { ok: true };
}

function requestAnalysis(w: P08World, method: 'purity' | 'density' | 'mp'): P08DispatchResult {
  const a = w.analyzer;
  if (molTotal(a.sample) <= 0) return { ok: false, code: 'NO_SAMPLE' };
  if (a.readyAt !== null) return { ok: false, code: 'ANALYZER_BUSY' };
  if (method === 'mp' && w.route !== 'ASA') return { ok: false, code: 'NOT_FOR_LIQUID' };
  if (method === 'density' && w.route === 'ASA') return { ok: false, code: 'NOT_FOR_SOLID' };
  a.method = method;
  a.readyAt = w.timeS + (method === 'mp' ? 45 : 20);
  emit08(w, 'ANALYSIS_STARTED', 'INFO', { method });
  return { ok: true };
}

function stepAnalyzer(w: P08World) {
  const a = w.analyzer;
  if (a.readyAt === null || w.timeS < a.readyAt) return;
  const m = a.sample;
  const p = productOf(w);
  const g = massG(m);
  const prodG = (m[p] ?? 0) * SPECIES[p].molarMass;
  const truth = g > 0 ? prodG / g : 0;
  const sp = speciesIn(m, 1e-9);
  const method = a.method!;
  if (method === 'purity') {
    const shown = clamp(truth + a.offset + w.params.analyzerUncertainty * 0.3 * gauss08(w), 0, 1);
    addReading(w, {
      kind: 'purity', instrumentId: 'analyzer01', targetId: a.sampleFrom ?? '', value: Math.round(shown * 1000) / 10, unit: '%', resolution: 0.1, standardUncertainty: w.params.analyzerUncertainty * 100,
      valid: true, stable: true, qualityFlags: a.offset ? ['OFFSET'] : [], trueValue: truth * 100,
      snapshot: { species: sp, sources: [a.sampleFrom ?? ''], impurities: sp.filter((k) => k !== p && (m[k] ?? 0) * SPECIES[k].molarMass > 0.002 * g), route: w.route },
    });
    flag08(w, 'purityMeasured');
  } else if (method === 'density') {
    const ml = liquidMl(m);
    const rho = ml > 0 ? (massG(m) / ml) * (1 - 0.001 * (a.sampleTempC - 25)) : NaN;
    addReading(w, {
      kind: 'density', instrumentId: 'analyzer01', targetId: a.sampleFrom ?? '', value: Math.round(rho * 1000) / 1000, unit: 'g/mL', resolution: 0.001, standardUncertainty: 0.002,
      valid: Number.isFinite(rho), stable: true, qualityFlags: [], trueValue: rho, snapshot: { species: sp, tempC: Math.round(a.sampleTempC * 10) / 10, route: w.route },
    });
  } else {
    // Intervalo de fusión `[MODELO]`: las impurezas lo bajan y lo ensanchan (no da un % de pureza).
    const nTot = molTotal(m);
    const xImp = nTot > 0 ? 1 - (m.ASA ?? 0) / nTot : 1;
    const onset = 134.5 - 45 * xImp;
    const clear = 136 - 45 * xImp + 30 * xImp;
    addReading(w, {
      kind: 'mp', instrumentId: 'mp01', targetId: a.sampleFrom ?? '', value: Math.round(onset * 10) / 10, value2: Math.round(Math.max(onset + 0.5, clear) * 10) / 10, unit: '°C', resolution: 0.1, standardUncertainty: 0.5,
      valid: true, stable: true, qualityFlags: [], trueValue: onset, snapshot: { species: sp, route: w.route },
    });
    flag08(w, 'mpMeasured');
  }
  // La muestra analizada va al residuo del analizador (no desaparece).
  molAddInto(w.outside.analyzerWaste, m);
  a.sample = {};
  a.readyAt = null;
  a.method = null;
  emit08(w, 'ANALYSIS_DONE', 'INFO', { method });
}

// ─────────────────────────── Paso ───────────────────────────

function stepPours(w: P08World, dt: number) {
  for (const pr of Object.values(w.pours)) {
    const src = w.vessels[pr.sourceId];
    if (!src) continue;
    const rate = pourRateMlS(src, pr.tiltDeg);
    if (rate <= 0) continue;
    pr.transferredG += transfer(w, pr.sourceId, pr.targetId, rate * dt, pr.tiltDeg);
  }
}

/** Vigilancia de técnica que depende del tiempo (ORG13, ORG15, ORG16, ORG17, ORG20, ORG24/33, ORG35/48, ORG36). */
function stepWatch(w: P08World, dt: number) {
  const rf = w.vessels.rf;
  const o = w.objects.rf;
  if (!rf || !o) return;
  const inBath = o.support === 'bath01';
  const route = w.route;
  // Cantidad inicial del reactivo clave (la primera vez que el balón tiene ambos reactivos).
  const r0 = MAIN_REACTION[route];
  const both = Object.entries(r0.nu).filter(([, n]) => (n ?? 0) < 0).every(([k]) => (rf.liq[k as SpeciesId] ?? 0) + (rf.solid[k as SpeciesId] ?? 0) > 0);
  // Cantidades de partida REALES (máximo antes de calentar): base del limitante y de la conversión.
  if (both && !w.evidence.heated) {
    flag08(w, 'reactantsMixed');
    for (const [k, nu] of Object.entries(r0.nu) as Array<[SpeciesId, number]>) {
      if (nu >= 0) continue;
      const n = (rf.liq[k] ?? 0) + (rf.solid[k] ?? 0);
      if (n > (w.evidence[`n0:${k}`] ?? 0)) w.evidence[`n0:${k}`] = n;
    }
    const key = w.evidence[`n0:${KEY_REAGENT[route]}`] ?? 0;
    if (key > (w.evidence.__key0 ?? 0)) w.evidence.__key0 = key;
  }
  // ORG13: placa encendida con consigna alta sin el balón en el baño.
  if (w.plate.on && w.plate.setpointC > 40 && !inBath && both) {
    w.evidence.__noContactS = (w.evidence.__noContactS ?? 0) + dt;
    if (w.evidence.__noContactS > 30) err08(w, 'ORG13', 'NO_THERMAL_CONTACT', 'WARN');
  }
  const heating = inBath && rf.tempC > 45;
  if (heating) {
    w.evidence.__heatS = (w.evidence.__heatS ?? 0) + dt;
    flag08(w, 'heated');
    // ORG35/ORG48: agua inicial en exceso al empezar a calentar (Fischer).
    if (!w.evidence.__heatStartChecked) {
      w.evidence.__heatStartChecked = 1;
      // Catalizador presente al empezar a calentar (mol por mol de limitante).
      const lim0 = limitingMol0(w);
      if (lim0 > 0) w.evidence[`cat:${CATALYST[route]}`] = Math.round(((rf.liq[CATALYST[route]] ?? 0) / lim0) * 1e6) / 1e6;
      const lim = limiting(r0, rf.liq).xiMax;
      if ((route === 'ISO' || route === 'MS') && (rf.liq.H2O ?? 0) > 0.3 * Math.max(lim, 1e-9)) err08(w, route === 'ISO' ? 'ORG35' : 'ORG48', 'EXCESS_WATER', 'WARN');
    }
    // ORG15: sin agitar mientras se calienta.
    if (w.plate.stir01 < 0.15 || (sc(w, S8.SLOW_STIR) && w.plate.stir01 > 0)) {
      w.evidence.__noStirS = (w.evidence.__noStirS ?? 0) + dt;
      if (w.evidence.__noStirS > 60 && w.plate.stir01 < 0.15) err08(w, 'ORG15', 'NOT_STIRRED', 'WARN');
    }
    // ORG16: agitación intensa con el balón abierto: salpica.
    if (w.plate.stir01 > 0.85 && !w.reflux.attached) {
      molAddInto(w.outside.bench, molTake(rf.liq, 0.004 * dt));
      err08(w, 'ORG16', 'SPLASHING', 'WARN');
    }
    if (route === 'ISO' || route === 'MS') {
      // ORG36: sin reflujo (ISO); ORG20: condensador sin agua.
      if (!w.reflux.attached && rf.tempC > 60) err08(w, route === 'ISO' ? 'ORG36' : 'ORG20', 'NO_REFLUX', 'WARN');
      if (w.reflux.attached && !w.reflux.waterOn && rf.tempC > 50) err08(w, 'ORG20', 'CONDENSER_DRY', 'WARN');
    }
    // ORG24/ORG33: calentar sin catalizador (la reacción va lenta; el equilibrio no cambia).
    const cat = rf.liq[CATALYST[route]] ?? 0;
    if (cat <= 1e-9 && (w.evidence.__heatS ?? 0) > 120) err08(w, route === 'ASA' ? 'ORG24' : 'ORG33', 'NO_CATALYST', 'WARN');
  }
  // ORG17: se saca del baño (o se apaga la placa) con la reacción lejos de su avance esperable.
  const wasHeating = !!w.evidence.__wasHeating;
  const nowHeating = inBath && w.plate.on;
  if (wasHeating && !nowHeating && (w.evidence.__heatS ?? 0) > 20) {
    const conv = conversion(w);
    const target = route === 'ASA' ? 0.8 : 0.7;
    if (conv < target) err08(w, 'ORG17', 'HEATING_STOPPED_EARLY', 'WARN');
    flag08(w, 'heatingEnded');
  }
  w.evidence.__wasHeating = nowHeating ? 1 : 0;
}

export function stepP08World(w: P08World): void {
  const p = w.params;
  const dt = p.dtS;
  w.timeS = Math.round((w.timeS + dt) * 1e6) / 1e6;
  w.tick++;
  stepPours(w, dt);
  stepDroppers(w, dt);
  stepThermal(w, dt);
  stepChemistry(w, dt);
  stepSolids(w, dt);
  stepEvaporation(w, dt);
  stepFunnel(w, dt);
  stepFiltration(w, dt);
  stepDrying(w, dt);
  stepFractions(w, dt);
  stepAnalyzer(w);
  stepWatch(w, dt);
  for (const v of Object.values(w.vessels)) {
    if (v.emulsion01 > 0 && v.stir01 === 0 && v.id !== 'sf') v.emulsion01 = Math.max(0, v.emulsion01 - dt / 20);
  }
  const b = w.balance;
  if (b.powered) stepAnalyticalBalance(b, panLoadG08(w) + zeroBias(w) + hotBiasG(w), p.balance, dt, w.timeS, gauss08(w));
}

export function runP08For(w: P08World, seconds: number) {
  const n = Math.round(seconds / w.params.dtS);
  for (let i = 0; i < n; i++) stepP08World(w);
}

export function p08Summary(w: P08World) {
  const e = worldElements(w);
  return { C: Math.round(e.C * 1e9) / 1e9, readings: w.readingOrder.length, conv: Math.round(conversion(w) * 1e4) / 1e4, bal: Math.round(w.balance.shownG * 1e4) / 1e4, T: Math.round((w.vessels.rf?.tempC ?? 0) * 100) / 100 };
}

export function emptyVessel08(id: string, shape: Vessel08['shape'], spec: { capacityMl: number; brimMl: number; areaCm2: number; floorCm: number }, tempC: number, contents: { liq?: Mol; solid?: Mol } = {}, capped?: boolean): Vessel08 {
  return {
    id, shape, ...spec, liq: { ...(contents.liq ?? {}) }, solid: { ...(contents.solid ?? {}) }, ext: {}, gas: {}, tempC, stir01: 0, emulsion01: 0, capped,
    stoppered: shape === 'sepFunnel' ? false : undefined, valve01: shape === 'sepFunnel' ? 0 : undefined, receiverId: null, lastAddS: -1e6, history: [], from: [],
  };
}

export const GEO = GEO08;
