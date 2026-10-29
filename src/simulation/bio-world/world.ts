/**
 * Mundo B04 «Detectives moleculares» (§6): el mundo celular de B02 (microscopio, caja de láminas fijas) con el estado
 * bioquímico. Cada comando informa un HECHO (gramos en la espátula, inclinación de un frasco, mL aspirados y cómo se
 * descargan, rpm del mando, consigna, profundidad de inmersión, vigor del agitado) y el paso fijo de 0,05 s integra
 * calor, dispersión, extracción, cinética enzimática y reacciones de ensayo con conservación de glucosilos, proteína,
 * cobre, yodo y del balance H/O de la catalasa (§6.6). Determinista: sin Math.random ni reloj.
 */
import { clamp, stableHash } from '../core/math';
import { dispatchCell, cellSummary, conservedCell, stepCellWorld } from '../cell-world/world';
import { emitB, errB, flagB, latchB } from '../optical-world/events';
import type { CellCommand } from '../cell-world/commands';
import {
  SPECIES, adhRate, benedictColor, benedictStep, biuretSignal, copperOf, denatRate, denatured, emulsionIndex, extractionStep, gasVolumeMl, glucosylOf,
  heatCapacity, lugolSignal, mmRate, noSpecies, pHOf, relaxTemp, type Species, type SpeciesId,
} from '../biochem/model';
import type { BioCommand, BioDispatchResult, DispenseMode } from './commands';
import { BIO_ONLY_TYPES } from './commands';
import type { BioInstrument, BioParams, BioReading, BioTube, BioVessel, BioWorld, PrepBatch, ReagentId } from './types';
import { ALL_TUBES, BATH_POS, BOARD_B04, CUVETTES, GEO_B04, bathSlotPos, tubeHome } from './geometry';

/** Escenarios docentes de B04 (§7.3) y el módulo ADH habilitado y calibrado por el docente. */
export const SC_B04 = {
  MILK_VAR: 'SC01', DILUTE_STARCH: 'SC02', DETERGENT: 'SC03', DROPPER_RETAIN: 'SC04', BALANCE_DRIFT: 'SC05', SLOW_BATH: 'SC06', OLD_BENEDICT: 'SC07',
  DILUTE_LUGOL: 'SC08', CU_EXCESS: 'SC09', PIGMENT: 'SC10', FEULGEN_UNDER: 'SC11', FEULGEN_OVER: 'SC12', FEULGEN_MISSING: 'SC13', LOW_CATALASE: 'SC14',
  PREHEATED_LIVER: 'SC15', OLD_PEROXIDE: 'SC16', LOW_AMYLASE: 'SC17', AMYLASE_PH: 'SC18', PHOTOMETER_NO_BLANK: 'SC19', REDUCTANT: 'SC20', MISLABELED: 'SC21',
  OVERFLOW: 'SC22', NAD_LIMIT: 'SC23', COMPETITOR: 'SC24', ADH: 'MOD-ADH',
} as const;
export const scB = (w: BioWorld, s: string) => w.scenarios.includes(s);

export const BEAKER_IDS = ['bk1', 'bk2', 'bk3'] as const;
export const PLATE_IDS = ['hp1', 'hp2'] as const;
export const BAR_IDS = ['sb1', 'sb2', 'sb3'] as const;
export const BATH_IDS = ['ba1', 'ba2'] as const;
export const DROPPER_IDS = ['dI', 'dNa', 'dCu'] as const;
export const PIPETTE_IDS = ['pi', 'pv'] as const;
export const CYLINDER_IDS_B04 = ['g100', 'g10'] as const;
export const WASTE_IDS = ['cw', 'bw', 'tr'] as const;
/** Objeto de la mesada de cada corriente de residuos (donde queda el recipiente desechado). */
const WASTE_OBJECT: Record<(typeof WASTE_IDS)[number], string> = { cw: 'cw', bw: 'bioWaste', tr: 'trashBin' };
export const STAIN_JARS = ['jFix', 'jHcl', 'jWash', 'jSch'] as const;
/** Ensayos que dan nombre a un tubo (`LUG/L-PAP`). */
export const ASSAYS = ['LUG', 'BIU', 'EMU', 'BEN', 'CAT', 'AMY', 'ADH'] as const;
export type AssayId = (typeof ASSAYS)[number];
/** Controles positivos de cada ensayo de biomoléculas (patrones). */
export const POS_CONTROL: Record<'LUG' | 'BIU' | 'EMU' | 'BEN', string[]> = { LUG: ['P1'], BIU: ['sStd'], EMU: ['sOil'], BEN: ['sGlu'] };
/** Código visible (tapa del frasco) de cada lote. */
export const LOT_CODE: Record<string, string> = {
  bW: 'L-AGU', sEgg: 'L-HUE', sMilk: 'L-LEC', sGel: 'L-GEL', sPot: 'L-PAP', sOil: 'L-ACE', sGlu: 'L-GLU', sStd: 'L-PRO', sUnk1: 'L-X1', sUnk2: 'L-X2',
  P1: 'P1', P2: 'P2', P3: 'P3',
};
export const lotOfCode = (code: string) => Object.keys(LOT_CODE).find((k) => LOT_CODE[k] === code) ?? null;

const ok = (extra: Partial<BioDispatchResult> = {}): BioDispatchResult => ({ ok: true, ...extra });
const no = (code: string): BioDispatchResult => ({ ok: false, code });
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
const bp = (w: BioWorld): BioParams => w.params.bio!;
/** Masa molar de un glucosilo del almidón (g/mol). */
export const GLUCOSYL_G = 162.14;

// ─────────────────────────── Recipientes ───────────────────────────

export const emptyBioVessel = (capacityMl: number, tK: number): BioVessel => ({ volumeMl: 0, capacityMl, tK, s: noSpecies(), tags: [], homog01: 1 });

export const vesselOf = (w: BioWorld, id: string): BioVessel | null => w.bio.vessels[id] ?? null;
export const isTube = (w: BioWorld, id: string) => !!w.bio.tubes[id];

/**
 * Mueve una fracción `f` del volumen de un recipiente a otro; `take(s)` (≤ 1) escala la fracción de cada especie
 * (lo que no se lleva queda donde estaba: sólidos sedimentados, tejido). La temperatura se mezcla por volumen.
 */
function moveFraction(from: BioVessel, to: BioVessel, f: number, take: (s: SpeciesId) => number = () => 1) {
  if (f <= 0) return;
  const k = Math.min(1, f);
  const ml = from.volumeMl * k;
  const vTo = to.volumeMl;
  if (vTo + ml > 1e-9) to.tK = (to.tK * vTo + from.tK * ml) / (vTo + ml);
  from.volumeMl = r6(from.volumeMl - ml);
  to.volumeMl = r6(to.volumeMl + ml);
  for (const s of SPECIES) {
    const a = from.s[s] * Math.min(1, k * take(s));
    from.s[s] -= a;
    to.s[s] += a;
  }
  for (const t of from.tags) if (!to.tags.includes(t)) to.tags.push(t);
  // Llegó líquido sin mezclar: la homogeneidad del destino baja en proporción.
  if (vTo + ml > 1e-9) to.homog01 = clamp((to.homog01 * vTo + 0.2 * ml) / (vTo + ml), 0, 1);
  if (from.volumeMl <= 1e-9 && SPECIES.every((s) => Math.abs(from.s[s]) < 1e-12)) from.tags = [];
}

/** Todo el contenido (líquido y sólidos) a otro recipiente. */
function moveAll(from: BioVessel, to: BioVessel) {
  moveFraction(from, to, 1);
  for (const s of SPECIES) {
    to.s[s] += from.s[s];
    from.s[s] = 0;
  }
  from.volumeMl = 0;
  from.tags = [];
}

/** Lo que una pipeta toma de un beaker: solo líquido; el almidón en grumos según la agitación; nunca el tejido ni el polvo. */
const liquidTake = (h: number) => (s: SpeciesId) => (s === 'catTissue' || s === 'catTissueDen' || s === 'amySolid' ? 0 : s === 'starchSolid' ? 0.5 * h : s === 'starch' ? 0.4 + 0.6 * h : 1);

/** Transfiere hasta `ml`; lo que no cabe cae a la mesada (derrame). Devuelve lo que entró. */
function transfer(w: BioWorld, from: BioVessel, to: BioVessel, ml: number, take?: (s: SpeciesId) => number): { moved: number; overflow: number } {
  const amount = Math.min(ml, from.volumeMl);
  if (amount <= 1e-9) return { moved: 0, overflow: 0 };
  const room = Math.max(0, to.capacityMl - to.volumeMl);
  const fit = Math.min(amount, room);
  const tmp = emptyBioVessel(1e9, from.tK);
  moveFraction(from, tmp, amount / from.volumeMl, take);
  moveFraction(tmp, to, fit / Math.max(1e-12, tmp.volumeMl));
  const overflow = tmp.volumeMl;
  if (overflow > 1e-9) moveAll(tmp, w.bio.vessels.spill);
  return { moved: fit, overflow };
}

// ─────────────────────────── Despacho ───────────────────────────

/** Gotero de reactivo → especie que entrega (por gota) y reactivo registrado en el tubo. */
const DROPPER_REAGENT: Record<string, ReagentId> = { dI: 'iodine', dNa: 'naoh', dCu: 'cu' };

export function dispatchBio(w: BioWorld, cmd: BioCommand): BioDispatchResult {
  if (BIO_ONLY_TYPES.has(cmd.type)) {
    if (w.safety.stoppedByTeacher) return no('TEACHER_STOP');
    if (!w.ppe) {
      errB(w, 'E68', 'PPE_REQUIRED', 'CRITICAL');
      return no('PPE');
    }
    return bioOnly(w, cmd);
  }
  if (cmd.type === 'squeezeDropper' && DROPPER_REAGENT[cmd.dispenserId]) {
    if (!w.ppe) return dispatchCell(w, cmd as CellCommand);
    return dropReagent(w, cmd.dispenserId, cmd.targetId, !!cmd.tipContact);
  }
  if (cmd.type === 'closeBench') return closeBench(w);
  // Secar la mesada con papel recoge también el derrame químico; el papel va a residuos químicos.
  if (cmd.type === 'wipe' && cmd.targetId === 'bench' && w.ppe && w.bio.vessels.spill.volumeMl > 1e-6) {
    moveAll(w.bio.vessels.spill, w.bio.vessels.cw);
    flagB(w, 'spillWiped');
    emitB(w, 'SPILL_WIPED', 'INFO', {});
    if (w.benchSpillMl > 0.005) dispatchCell(w, cmd as CellCommand);
    return ok();
  }
  if (cmd.type === 'setPose') {
    const r = beforePose(w, cmd.id, cmd.support);
    if (r) return r;
  }
  const prevSupport = cmd.type === 'setPose' ? w.objects[cmd.id]?.support : undefined;
  const r = dispatchCell(w, cmd as CellCommand);
  if (r.ok && cmd.type === 'setPose') afterPose(w, cmd.id, prevSupport ?? 'bench');
  return r;
}

function bioOnly(w: BioWorld, cmd: BioCommand): BioDispatchResult {
  switch (cmd.type) {
    case 'tare': return tare(w);
    case 'scoopSolid': return scoop(w, cmd.toolId, cmd.sourceId, cmd.massG);
    case 'depositSolid': return deposit(w, cmd.toolId, cmd.targetId);
    case 'emptyBoat': return emptyBoat(w, cmd.targetId);
    case 'dryTool': return dryTool(w, cmd.toolId);
    case 'cutTissue': return cutTissue(w, cmd.sampleId, cmd.toolId, cmd.cutSizeCm);
    case 'addTissue': return addTissue(w, cmd.sampleId, cmd.vesselId);
    case 'insertStirBar': return insertBar(w, cmd.barId, cmd.vesselId);
    case 'retrieveStirBar': return retrieveBar(w, cmd.barId);
    case 'setStirRate': return setStir(w, cmd.plateId, cmd.rpm);
    case 'setHotplatePower': return setPlatePower(w, cmd.plateId, cmd.on);
    case 'setHotplateSetpoint': {
      const pl = w.bio.plates[cmd.plateId];
      if (!pl) return no('NO_OBJECT');
      pl.setK = clamp(cmd.temperatureK, bp(w).ambientK, 573);
      return ok({ value: pl.setK });
    }
    case 'labelVessel': return labelVessel(w, cmd.vesselId, cmd.label);
    case 'startPour': return startPour(w, cmd.sourceId, cmd.targetId, cmd.tiltDeg);
    case 'stopPour':
      if (!w.bio.pours[cmd.sourceId]) return no('NOT_POURING');
      delete w.bio.pours[cmd.sourceId];
      return ok();
    case 'aspirate': return aspirate(w, cmd.toolId, cmd.sourceId, cmd.volumeMl, cmd.speed01 ?? 0.3);
    case 'dispense': return dispense(w, cmd.toolId, cmd.targetId, cmd.mode ?? 'drain');
    case 'rinseTool': return rinse(w, cmd.toolId);
    case 'mixTube': return mixTube(w, cmd.tubeId, cmd.vigor01, cmd.durationS);
    case 'capTube': return capTube(w, cmd.tubeId, cmd.capped);
    case 'tongs': return tongs(w, cmd.tubeId, cmd.to, cmd.depth01 ?? 1);
    case 'setBathPower': {
      const b = w.bio.baths[cmd.bathId];
      if (!b) return no('NO_OBJECT');
      b.on = cmd.on;
      if (cmd.on) flagB(w, `bathOn:${cmd.bathId}`);
      return ok();
    }
    case 'setBathSetpoint': {
      const b = w.bio.baths[cmd.bathId];
      if (!b) return no('NO_OBJECT');
      // El baño de agua no pasa de 100 °C (373,15 K) a presión atmosférica.
      b.setK = clamp(cmd.temperatureK, bp(w).ambientK, 372.15);
      b.readyAt = null;
      return ok({ value: b.setK });
    }
    case 'connectCollector': return connectCollector(w, cmd.tubeId, cmd.sealed);
    case 'disconnectCollector': {
      const t = w.bio.tubes[cmd.tubeId];
      if (!t?.collector) return no('NO_COLLECTOR');
      t.collector = null;
      return ok();
    }
    case 'startTimer': return startTimer(w, cmd.tubeId);
    case 'usePhStrip': return phStrip(w, cmd.vesselId);
    case 'readInstrument': return read(w, cmd.instrument, cmd.targetId, cmd.eyeDeg ?? 0);
    case 'blankPhotometer': return blankPhotometer(w, cmd.cuvetteId);
    case 'disposeVessel': return disposeVessel(w, cmd.vesselId, cmd.wasteId);
    case 'lightBurner': return lightBurner(w, cmd.on);
    case 'requestModule': return requestModule(w, cmd.module);
    case 'requestTimeScale': return requestTimeScale(w, cmd.x);
    default:
      return no('UNKNOWN');
  }
}

/** Reglas de seguridad antes de mover un objeto: recipiente caliente a mano (S01). */
function beforePose(w: BioWorld, id: string, support?: string): BioDispatchResult | null {
  const v = w.bio.vessels[id];
  const o = w.objects[id];
  if (!o || !support || support === o.support) return null;
  if (v && support === 'hand' && v.tK > bp(w).hotTouchK) {
    errB(w, 'S01', 'HOT_HANDLING', 'ALERT', { obj: id });
    w.safety.block = { code: 'HOT', since: w.timeS };
    return no('TOO_HOT');
  }
  // Los tubos entran y salen de los baños solo con la pinza de tubos (`tongs`).
  if (w.bio.tubes[id] && (support.startsWith('ba') || o.support.startsWith('ba'))) return no('USE_TONGS');
  return null;
}

/** Consecuencias de un apoyo nuevo: beaker sobre una placa, lámina en un frasco de Feulgen, bote en la balanza. */
function afterPose(w: BioWorld, id: string, prev: string) {
  const o = w.objects[id];
  if (!o) return;
  for (const pid of PLATE_IDS) {
    const pl = w.bio.plates[pid];
    if (pl.vesselId === id && o.support !== pid) pl.vesselId = null;
    if (o.support === pid && w.bio.vessels[id]) {
      pl.vesselId = id;
      flagB(w, `onPlate:${id}`);
    }
  }
  const fs = w.bio.feulgen[id];
  if (fs) {
    if ((STAIN_JARS as readonly string[]).includes(prev)) fs.jar = null;
    if ((STAIN_JARS as readonly string[]).includes(o.support)) enterJar(w, id, o.support);
  }
  if (w.safety.block?.code === 'HOT') w.safety.block = null;
}

// ─────────────────────────── Sólidos, hígado y balanza ───────────────────────────

const BOAT_G = 2;

function onBalance(w: BioWorld): string[] {
  return Object.values(w.objects).filter((o) => o.support === 'bal').map((o) => o.id);
}

function tare(w: BioWorld): BioDispatchResult {
  w.bio.balance.tareG = r6(balanceGross(w));
  w.bio.balance.tared = true;
  flagB(w, 'balanceTared');
  return ok({ value: 0 });
}

/** Masa bruta sobre el plato (g): bote con su carga y agua arrastrada, hígado, deriva de la balanza desnivelada (SC05). */
function balanceGross(w: BioWorld): number {
  let g = 0;
  for (const id of onBalance(w)) {
    if (id === 'bt') g += BOAT_G + sumLoad(w.bio.boat.load) + w.bio.boat.waterG;
    if (id === 'liv') g += w.bio.liver.massG;
  }
  if (scB(w, SC_B04.BALANCE_DRIFT)) g += 0.002 * w.timeS;
  return g;
}

const sumLoad = (l: Record<string, number>) => Object.values(l).reduce((a, b) => a + b, 0);

function scoop(w: BioWorld, toolId: string, sourceId: string, massG: number): BioDispatchResult {
  if (toolId !== 'spa') return no('BAD_TOOL');
  const have = w.bio.powders[sourceId];
  if (have === undefined) return no('BAD_SOURCE');
  const g = r6(clamp(massG, 0, have));
  if (g <= 1e-6) return no('SOURCE_EMPTY');
  const sp = w.bio.spatula;
  // Espátula húmeda (no se secó tras tocar un líquido): el polvo se apelmaza y arrastra agua (M10).
  if (sp.wet) {
    errB(w, 'M10', 'WET_SOLID', 'WARN', { obj: sourceId });
    w.bio.boat.waterG = r6(w.bio.boat.waterG + 0.3);
  }
  // Restos de otro polvo en la espátula: la carga queda contaminada (PREP09 si llega a la amilasa).
  const other = Object.keys(sp.load).filter((k) => k !== sourceId && sp.load[k] > 1e-6);
  if (other.length) flagB(w, `spatulaMixed:${sourceId}`);
  w.bio.powders[sourceId] = r6(have - g);
  sp.load[sourceId] = r6((sp.load[sourceId] ?? 0) + g);
  return ok({ value: g });
}

/** Polvo de un frasco a un recipiente con líquido (almidón en grumos, amilasa sin disolver). */
function powderInto(w: BioWorld, v: BioVessel, jar: string, g: number) {
  // Las entradas en cero de una carga (polvo ya entregado) no contaminan ni etiquetan.
  if (g <= 1e-9) return;
  if (jar === 'jSt') v.s.starchSolid += (g / GLUCOSYL_G) * 1000;
  if (jar === 'jAm') v.s.amySolid += g * bp(w).activity.amylaseUPerG;
  const tag = jar === 'jSt' ? 'starchPowder' : 'amylasePowder';
  if (!v.tags.includes(tag)) v.tags.push(tag);
}

function deposit(w: BioWorld, toolId: string, targetId: string): BioDispatchResult {
  if (toolId !== 'spa') return no('BAD_TOOL');
  const sp = w.bio.spatula;
  const total = sumLoad(sp.load);
  if (total <= 1e-6) return no('TOOL_EMPTY');
  // El 1 % queda adherido en la espátula (pérdida real que se limpia al secarla).
  const k = 0.99;
  if (targetId === 'bt') {
    for (const [jar, g] of Object.entries(sp.load)) {
      w.bio.boat.load[jar] = r6((w.bio.boat.load[jar] ?? 0) + g * k);
      sp.load[jar] = r6(g * (1 - k));
    }
    return ok({ value: r6(total * k) });
  }
  const v = vesselOf(w, targetId);
  if (!v) {
    spillPowder(w, sp.load, k);
    return ok({ value: 0 });
  }
  const jars = dominant(sp.load);
  for (const [jar, g] of Object.entries(sp.load)) {
    powderInto(w, v, jar, g * k);
    sp.load[jar] = r6(g * (1 - k));
  }
  // La espátula tocó el líquido: queda húmeda hasta secarla (la próxima carga arrastra agua, M10).
  if (v.volumeMl > 0.05) sp.wet = true;
  afterPowder(w, targetId, jars);
  return ok({ value: r6(total * k) });
}

/** Polvo fuera de un recipiente: va a la mesada (el derrame lo cuenta como pérdida trazada). */
function spillPowder(w: BioWorld, load: Record<string, number>, k: number) {
  const spill = w.bio.vessels.spill;
  for (const [jar, g] of Object.entries(load)) {
    powderInto(w, spill, jar, g * k);
    load[jar] = r6(g * (1 - k));
  }
  latchB(w, 'powderSpill', 'POWDER_SPILLED', 'WARN');
}

function emptyBoat(w: BioWorld, targetId: string): BioDispatchResult {
  const b = w.bio.boat;
  const total = sumLoad(b.load);
  if (total <= 1e-6) return no('TOOL_EMPTY');
  const v = vesselOf(w, targetId);
  // Queda un 0,5 % adherido al bote.
  const k = 0.995;
  if (!v) {
    spillPowder(w, b.load, k);
    return ok({ value: 0 });
  }
  const jars = dominant(b.load);
  for (const [jar, g] of Object.entries(b.load)) {
    powderInto(w, v, jar, g * k);
    b.load[jar] = r6(g * (1 - k));
  }
  if (b.waterG > 0) {
    v.volumeMl = r6(v.volumeMl + b.waterG);
    w.bio.boat.waterG = 0;
  }
  afterPowder(w, targetId, jars);
  return ok({ value: r6(total * k) });
}

/** Polvo principal de una carga (los restos de otro polvo no deciden el lote, pero lo contaminan). */
const dominant = (load: Record<string, number>) => {
  const e = Object.entries(load).filter(([, g]) => g > 1e-6).sort((a, b) => b[1] - a[1]);
  return e.map(([k]) => k);
};

/** El polvo convierte el beaker en un lote (P1 almidón, P3 amilasa) o, en un tubo, deja almidón sin dispersar (L02). */
function afterPowder(w: BioWorld, targetId: string, jars: string[]) {
  const v = w.bio.vessels[targetId];
  if (isTube(w, targetId) && jars.includes('jSt')) errB(w, 'L02', 'STARCH_UNDISPERSED', 'WARN', { obj: targetId });
  if (!(BEAKER_IDS as readonly string[]).includes(targetId)) return;
  const id = jars[0] === 'jSt' ? 'P1' : jars[0] === 'jAm' ? 'P3' : null;
  if (!id) return;
  const b = ensurePrep(w, id, targetId);
  if (!b) return;
  b.solidG = r6(id === 'P1' ? (v.s.starchSolid + v.s.starch) * GLUCOSYL_G / 1000 : (v.s.amySolid + v.s.amyAct + v.s.amyDen) / bp(w).activity.amylaseUPerG);
  // Polvo de la otra preparación en la amilasa (espátula sin limpiar): la amilasa queda contaminada (PREP09).
  if (id === 'P3' && v.tags.includes('starchPowder')) flagB(w, 'p3Contaminated');
  if (id === 'P1' && v.tags.includes('amylasePowder')) flagB(w, 'p1Contaminated');
}

/** Lote ligado a un beaker (se crea con el primer polvo o el hígado); el agua previa se toma como agua inicial. */
function ensurePrep(w: BioWorld, id: 'P1' | 'P2' | 'P3', vesselId: string): PrepBatch | null {
  const cur = w.bio.preps[id];
  if (cur) return cur.vesselId === vesselId ? cur : null;
  const v = w.bio.vessels[vesselId];
  const b: PrepBatch = {
    id, vesselId, waterMl: r6(v.volumeMl), solidG: 0, liverG: 0, stirredS: 0, heatedS: 0, maxTK: v.tK, measuredTK: null, homog01: 0, accessible01: 0,
    splashMl: 0, slipS: 0, labeled: false, firstAliquotAt: null,
  };
  w.bio.preps[id] = b;
  if (!v.tags.includes(id)) v.tags.push(id);
  flagB(w, `prep:${id}:started`);
  return b;
}

const prepOf = (w: BioWorld, vesselId: string): PrepBatch | null =>
  (Object.values(w.bio.preps).find((b) => b?.vesselId === vesselId) as PrepBatch | undefined) ?? null;

function dryTool(w: BioWorld, toolId: string): BioDispatchResult {
  if (toolId === 'bt') {
    const b = w.bio.boat;
    for (const [jar, g] of Object.entries(b.load)) {
      if (g > 0) powderInto(w, w.bio.vessels.tr, jar, g);
      b.load[jar] = 0;
    }
    b.waterG = 0;
    flagB(w, 'boatCleaned');
    return ok();
  }
  if (toolId !== 'spa') return no('BAD_TOOL');
  const sp = w.bio.spatula;
  // Lo que quedaba adherido va a residuos comunes con el papel.
  const tr = w.bio.vessels.tr;
  for (const [jar, g] of Object.entries(sp.load)) {
    if (g > 0) powderInto(w, tr, jar, g);
    sp.load[jar] = 0;
  }
  sp.wet = false;
  flagB(w, 'spatulaDried');
  return ok();
}

function cutTissue(w: BioWorld, sampleId: string, toolId: string, cutSizeCm: number): BioDispatchResult {
  if (sampleId !== 'liv') return no('BAD_SOURCE');
  if (toolId !== 'sc') return no('BAD_TOOL');
  const lv = w.bio.liver;
  if (lv.inVessel) return no('ALREADY_IN_WATER');
  if (w.objects.liv?.support !== 'cb') return no('USE_BOARD');
  const size = clamp(cutSizeCm, 0.2, 3);
  lv.sizeCm = lv.sizeCm === null ? size : Math.min(lv.sizeCm, size);
  lv.pieces = Math.max(lv.pieces, Math.round((3 / lv.sizeCm) ** 2));
  flagB(w, 'liverCut');
  emitB(w, 'TISSUE_CUT', 'INFO', { obj: 'liv', cm: lv.sizeCm });
  return ok({ value: lv.sizeCm });
}

function addTissue(w: BioWorld, sampleId: string, vesselId: string): BioDispatchResult {
  if (sampleId !== 'liv') return no('BAD_SOURCE');
  const lv = w.bio.liver;
  if (lv.inVessel) return no('ALREADY_IN_WATER');
  const v = vesselOf(w, vesselId);
  if (!v || !(BEAKER_IDS as readonly string[]).includes(vesselId)) return no('BAD_TARGET');
  const b = ensurePrep(w, 'P2', vesselId);
  if (!b) return no('BAD_TARGET');
  lv.inVessel = vesselId;
  if (lv.sizeCm === null) lv.sizeCm = 3;
  // Hígado precalentado (SC15): parte de la catalasa ya llega inactiva al agua.
  const activeFrac = scB(w, SC_B04.PREHEATED_LIVER) ? 0.35 : 1;
  v.s.catTissue += lv.totalU * activeFrac;
  v.s.catTissueDen += lv.totalU * (1 - activeFrac);
  b.liverG = lv.massG;
  if (!v.tags.includes('liver')) v.tags.push('liver');
  const o = w.objects.liv;
  if (o) {
    o.support = vesselId;
    o.pose = { ...w.objects[vesselId].pose, z: 1 };
  }
  emitB(w, 'TISSUE_ADDED', 'INFO', { obj: vesselId });
  return ok();
}

// ─────────────────────────── Placas y barras ───────────────────────────

function insertBar(w: BioWorld, barId: string, vesselId: string): BioDispatchResult {
  if (!(barId in w.bio.bars)) return no('NO_OBJECT');
  if (w.bio.bars[barId]) return no('IN_USE');
  if (!(BEAKER_IDS as readonly string[]).includes(vesselId)) return no('BAD_TARGET');
  if (Object.values(w.bio.bars).includes(vesselId)) return no('SLOT_BUSY');
  w.bio.bars[barId] = vesselId;
  const o = w.objects[barId];
  if (o) {
    o.support = vesselId;
    o.pose = { ...w.objects[vesselId].pose, z: 0.4 };
  }
  flagB(w, `bar:${vesselId}`);
  return ok();
}

function retrieveBar(w: BioWorld, barId: string): BioDispatchResult {
  const vid = w.bio.bars[barId];
  if (!vid) return no('NOT_IN_VESSEL');
  const pl = PLATE_IDS.map((p) => w.bio.plates[p]).find((p) => p.vesselId === vid);
  if (pl && pl.rpm > 0) return no('STOP_STIRRING');
  w.bio.bars[barId] = null;
  const o = w.objects[barId];
  if (o) {
    o.support = 'bench';
    o.pose = { ...o.pose, x: w.objects[vid].pose.x + 5, y: w.objects[vid].pose.y + 8, z: 0.3 };
  }
  flagB(w, `barRetrieved:${barId}`);
  return ok();
}

function setStir(w: BioWorld, plateId: string, rpm: number): BioDispatchResult {
  const pl = w.bio.plates[plateId];
  if (!pl) return no('NO_OBJECT');
  pl.rpm = clamp(Math.round(rpm), 0, 1500);
  return ok({ value: pl.rpm });
}

function setPlatePower(w: BioWorld, plateId: string, on: boolean): BioDispatchResult {
  const pl = w.bio.plates[plateId];
  if (!pl) return no('NO_OBJECT');
  pl.on = on;
  // Calefacción encendida bajo la suspensión de hígado: la catalasa se calienta (PREP07).
  if (on && pl.vesselId && w.bio.preps.P2?.vesselId === pl.vesselId) errB(w, 'PREP07', 'LIVER_HEATED', 'WARN', { obj: pl.vesselId });
  return ok();
}

/** Rótulo de un tubo (`ENSAYO/CÓDIGO`) o de un lote preparado (`P1`…). Un rótulo repetido es M02. */
function labelVessel(w: BioWorld, vesselId: string, label: string): BioDispatchResult {
  const v = vesselOf(w, vesselId);
  if (!v) return no('NO_OBJECT');
  const t = w.bio.tubes[vesselId];
  if (t) {
    if (!/^(LUG|BIU|EMU|BEN|CAT|AMY|ADH)\/[A-Za-z0-9-]{1,12}$/.test(label)) return no('BAD_LABEL');
    if (Object.entries(w.bio.tubes).some(([id, x]) => id !== vesselId && x.label === label && !x.discarded)) errB(w, 'M02', 'DUPLICATE_LABEL', 'WARN', { obj: vesselId });
    t.label = label;
  } else {
    const b = prepOf(w, vesselId);
    if (!b || label !== b.id) return no('BAD_LABEL');
    b.labeled = true;
    flagB(w, `prepLabeled:${b.id}`);
  }
  const o = w.objects[vesselId];
  if (o) o.label = label;
  return ok();
}

// ─────────────────────────── Vertido, pipetas y goteros ───────────────────────────

const BOTTLE_LIKE = (w: BioWorld, id: string) => {
  const k = w.objects[id]?.kind;
  return k === 'bioBottle' || k === 'bioCylinder' || k === 'bioBeaker';
};

function startPour(w: BioWorld, sourceId: string, targetId: string, tiltDeg: number): BioDispatchResult {
  if (sourceId === 'bMe') return methanolBlock(w);
  if (!BOTTLE_LIKE(w, sourceId)) return no('BAD_SOURCE');
  const src = vesselOf(w, sourceId);
  if (!src || src.volumeMl <= 1e-6) return no('SOURCE_EMPTY');
  if (sourceId === targetId) return no('BAD_TARGET');
  w.bio.pours[sourceId] = { targetId, tiltDeg: clamp(tiltDeg, 0, 120) };
  return ok();
}

/** Metanol concentrado fuera del módulo cerrado de ADH: bloqueo crítico (S05, C-BIO4-07). */
function methanolBlock(w: BioWorld): BioDispatchResult {
  errB(w, 'S05', 'METHANOL_BLOCKED', 'CRITICAL', { obj: 'bMe' });
  w.safety.block = { code: 'METHANOL', since: w.timeS };
  return no('HAZARD_BLOCKED');
}

/** Caudal del pico según la inclinación (mL/s): nada por debajo del ángulo de vertido, máximo cerca de 90°. */
function pourRate(w: BioWorld, sourceId: string, tiltDeg: number) {
  const p = bp(w);
  const max = w.objects[sourceId]?.kind === 'bioCylinder' ? p.pourMaxMlS * 0.7 : p.pourMaxMlS;
  const k = clamp((tiltDeg - p.pourMinTiltDeg) / (90 - p.pourMinTiltDeg), 0, 1);
  return max * k ** 1.5;
}

/** Reactivo que aporta un frasco al tubo (para la secuencia de cada ensayo). */
const BOTTLE_REAGENT: Record<string, ReagentId> = {
  bEt: 'ethanol', bBe: 'benedict', bH: 'h2o2', bHo: 'h2o2', bW: 'water', aNad: 'nad', aAdh: 'adh', aMe: 'methanol', P3: 'amylase',
};

/** Reactivos de lo que llega a un tubo según sus lotes de origen. */
function reagentsOfTags(tags: string[]): ReagentId[] {
  const out = new Set<ReagentId>();
  for (const t of tags) if (BOTTLE_REAGENT[t]) out.add(BOTTLE_REAGENT[t]);
  return [...out];
}

/** Hechos de una entrega de líquido a un recipiente: reactivos, trazabilidad, inicio de reacciones. */
function delivered(w: BioWorld, fromId: string, targetId: string, moved: number, overflow: number, tags: string[]) {
  const p = bp(w);
  if (overflow > 0.01) errB(w, 'M08', 'OVERFILL', 'WARN', { obj: targetId });
  if (moved <= 1e-9) return;
  const v = w.bio.vessels[targetId];
  const t = w.bio.tubes[targetId];
  const b = prepOf(w, targetId);
  if (b && tags.includes('bW') && !b.firstAliquotAt) b.waterMl = r6(b.waterMl + moved);
  if ((BEAKER_IDS as readonly string[]).includes(targetId) && !b && tags.includes('bW')) flagB(w, `water:${targetId}`);
  if (!t) return;
  t.sources.push(fromId);
  for (const r of reagentsOfTags(tags)) markReagent(w, targetId, r);
  if (tags.includes('bH') || tags.includes('bHo')) {
    t.h2o2Ml = r6(t.h2o2Ml + moved);
    if (tags.includes('bHo')) errB(w, 'C01', 'PEROXIDE_EXPIRED', 'WARN', { obj: targetId });
    startCatalase(w, targetId);
  }
  // Agua sobre la mezcla etanólica: empieza la emulsión; agua antes del etanol en exceso (E03).
  if (tags.includes('bW')) {
    if (t.reagents.ethanol !== undefined && t.dilutedAt === null) t.dilutedAt = w.timeS;
    if (t.reagents.ethanol === undefined && v.s.lipidMg > 1e-6 && v.volumeMl > 0 && (v.volumeMl - v.s.ethanolMl) / v.volumeMl > 0.6 && (t.label?.startsWith('EMU') ?? false)) {
      errB(w, 'EMU03', 'WATER_BEFORE_ETHANOL', 'WARN', { obj: targetId });
    }
  }
  if (v.s.amyAct + v.s.amySolid > 1e-9 && v.s.starch + v.s.starchSolid > 1e-9 && t.contactAt === null) startAmylase(w, targetId);
  void p;
}

/** Primer contacto de cada reactivo con un tubo; un tubo sin rótulo que empieza un ensayo es M01. */
function markReagent(w: BioWorld, tubeId: string, r: ReagentId) {
  const t = w.bio.tubes[tubeId];
  const v = w.bio.vessels[tubeId];
  if (t.reagents[r] !== undefined) return;
  t.reagents[r] = w.timeS;
  t.mixedAt = null;
  const analytic: ReagentId[] = ['iodine', 'cu', 'benedict', 'ethanol', 'h2o2'];
  if (analytic.includes(r) && !t.label && v.volumeMl > (r === 'h2o2' ? 0 : 0.05)) errB(w, 'M01', 'UNLABELED_ALIQUOT', 'WARN', { obj: tubeId });
  // Lugol y Benedict sobre la misma alícuota de una hidrólisis (A06) o dos ensayos sobre una alícuota (M09).
  const families = (['iodine', 'cu', 'benedict', 'ethanol'] as ReagentId[]).filter((k) => t.reagents[k] !== undefined && !(k === 'cu' && t.reagents.benedict !== undefined));
  if (t.reagents.iodine !== undefined && t.reagents.benedict !== undefined && (v.tags.includes('P3') || t.sources.some((s) => s.endsWith('*')))) errB(w, 'A06', 'SAME_ALIQUOT', 'WARN', { obj: tubeId });
  else if (families.length > 1) errB(w, 'M09', 'REAGENT_CARRYOVER', 'WARN', { obj: tubeId });
  // Cu(II) de Biuret en un tubo de Lugol (L04).
  if (r === 'cu' && (t.reagents.iodine !== undefined || t.label?.startsWith('LUG'))) errB(w, 'L04', 'COPPER_IN_IODINE', 'WARN', { obj: tubeId });
  flagB(w, `reagent:${tubeId}:${r}`);
}

function aspirate(w: BioWorld, toolId: string, sourceId: string, volumeMl: number, speed01: number): BioDispatchResult {
  if (!(PIPETTE_IDS as readonly string[]).includes(toolId)) return no('BAD_TOOL');
  if (sourceId === 'bMe') return methanolBlock(w);
  const p = bp(w);
  const pi = w.bio.vessels[toolId];
  const src = vesselOf(w, sourceId);
  if (!src || sourceId === toolId || (WASTE_IDS as readonly string[]).includes(sourceId) || sourceId === 'spill') return no('BAD_SOURCE');
  if (src.volumeMl <= 1e-6) return no('SOURCE_EMPTY');
  const pip = w.bio.pipettes[toolId];
  const cap = toolId === 'pv' ? p.volumetricMl : p.pipetteCapMl;
  if (pi.volumeMl > p.pipetteFilmMl + 1e-6 && pip.from !== sourceId) return no('TOOL_BUSY');
  // La pipeta aforada solo se llena hasta su aforo; la graduada, el volumen elegido.
  let want = clamp(toolId === 'pv' ? cap + p.pipetteFilmMl : volumeMl, 0, cap + p.pipetteFilmMl - pi.volumeMl);
  if (want <= 1e-6) return no('TOOL_FULL');
  // Restos de otro reactivo en la pipeta sin enjuagar: la alícuota nueva se contamina (M07).
  const res = pip.residue.filter((r) => r !== sourceId && !src.tags.includes(r));
  if (res.some((r) => BOTTLE_REAGENT[r] || ['dI', 'dNa', 'dCu'].includes(r)) && pi.volumeMl > 1e-9) errB(w, 'M07', 'CROSS_CONTAMINATION', 'WARN', { obj: sourceId });
  // Émbolo brusco: entra aire y se aspira menos líquido (M04).
  if (speed01 > 0.75) {
    want *= 0.82;
    errB(w, 'M04', 'AIR_ASPIRATED', 'WARN', { obj: toolId });
  }
  const b = prepOf(w, sourceId);
  const h = b ? src.homog01 : 1;
  if (b) {
    // Alícuota de un lote sin agitar (A07) y comprobación del lote en su primer trasvase (PREP01–PREP09).
    if (src.homog01 < p.prep.homogReady && b.id !== 'P2') errB(w, 'A07', 'UNMIXED_ALIQUOT', 'WARN', { obj: sourceId });
    if (b.firstAliquotAt === null) {
      b.firstAliquotAt = w.timeS;
      checkPrep(w, b);
    }
  }
  const r = transfer(w, src, pi, want, b ? liquidTake(h) : undefined);
  pip.from = sourceId;
  for (const t of src.tags.length ? src.tags : [sourceId]) if (!pip.residue.includes(t)) pip.residue.push(t);
  if (!pip.residue.includes(sourceId)) pip.residue.push(sourceId);
  // Alícuota de una incubación de amilasa antes del tiempo configurado (A05) o sin pH medido (A03).
  const st = w.bio.tubes[sourceId];
  if (st?.contactAt != null && st.reagents.amylase !== undefined) {
    if (w.timeS - st.contactAt < p.incubationS - 1) errB(w, 'A05', 'INCUBATION_SHORT', 'WARN', { obj: sourceId });
    if (st.phReadAt === null) errB(w, 'A03', 'PH_NOT_MEASURED', 'WARN', { obj: sourceId });
    if (st.timerAt === null) errB(w, 'A02', 'NO_T0', 'WARN', { obj: sourceId });
  }
  emitB(w, 'ASPIRATED', 'INFO', { obj: sourceId });
  return ok({ value: r6(r.moved) });
}

function dispense(w: BioWorld, toolId: string, targetId: string, mode: DispenseMode): BioDispatchResult {
  if (!(PIPETTE_IDS as readonly string[]).includes(toolId)) return no('BAD_TOOL');
  const p = bp(w);
  const pi = w.bio.vessels[toolId];
  const pip = w.bio.pipettes[toolId];
  let dose = pi.volumeMl - p.pipetteFilmMl;
  if (dose <= 1e-6) return no('TOOL_EMPTY');
  // Sin leer el cero antes de la primera entrega: la descalibración pasa inadvertida (M03).
  if (!pip.zeroChecked) {
    errB(w, 'M03', 'PIPETTE_UNCHECKED', 'WARN', { obj: toolId });
    dose = Math.max(0, dose - p.pipetteOffsetMl);
  }
  if (mode === 'quick') {
    dose = Math.max(0, dose - 0.08);
    errB(w, 'M05', 'TIP_RESIDUAL', 'WARN', { obj: toolId });
  }
  if (mode === 'blow' && toolId === 'pv') {
    dose += p.pipetteFilmMl;
    errB(w, 'M06', 'TIP_BLOWN', 'WARN', { obj: toolId });
  }
  const target = vesselOf(w, targetId);
  if (!target || targetId === toolId) {
    transfer(w, pi, w.bio.vessels.spill, dose);
    errB(w, 'M08', 'SPILLED', 'WARN', { obj: toolId });
    return ok({ value: 0 });
  }
  const tags = [...pi.tags];
  const from = pip.from ?? toolId;
  // Alícuota de un tubo que ya tenía reactivo a otro ensayo (M09).
  const fromTube = w.bio.tubes[from];
  if (fromTube && isTube(w, targetId) && (['iodine', 'cu', 'benedict', 'ethanol'] as ReagentId[]).some((k) => fromTube.reagents[k] !== undefined)) {
    errB(w, 'M09', 'REAGENT_CARRYOVER', 'WARN', { obj: targetId });
  }
  const r = transfer(w, pi, target, dose);
  const inc = fromTube?.contactAt != null && fromTube.reagents.amylase !== undefined && w.timeS - fromTube.contactAt >= p.incubationS - 1;
  delivered(w, `${from}${inc ? '*' : ''}`, targetId, r.moved, r.overflow, tags);
  emitB(w, 'DISPENSED', 'INFO', { obj: targetId });
  return ok({ value: r6(r.moved) });
}

function rinse(w: BioWorld, toolId: string): BioDispatchResult {
  if (!(PIPETTE_IDS as readonly string[]).includes(toolId)) return no('BAD_TOOL');
  const pi = w.bio.vessels[toolId];
  if (pi.volumeMl > bp(w).pipetteFilmMl + 1e-6) return no('EMPTY_FIRST');
  moveAll(pi, w.bio.vessels.rb);
  w.bio.pipettes[toolId] = { ...w.bio.pipettes[toolId], from: null, residue: [] };
  flagB(w, `rinsed:${toolId}`);
  return ok();
}

/** Una gota de reactivo (Lugol, NaOH, CuSO₄) sobre un tubo; con la punta tocando el líquido, el gotero se contamina. */
function dropReagent(w: BioWorld, dropperId: string, targetId: string, tipContact: boolean): BioDispatchResult {
  const p = bp(w);
  const d = w.bio.vessels[dropperId];
  const drop = scB(w, SC_B04.DROPPER_RETAIN) ? p.dropMl * 0.6 : p.dropMl;
  if (!d || d.volumeMl < drop - 1e-9) return no('SOURCE_EMPTY');
  const v = w.bio.vessels[targetId];
  const t = w.bio.tubes[targetId];
  if (!v || !t || t.discarded) {
    transfer(w, d, w.bio.vessels.spill, drop);
    emitB(w, 'DROP_SPILLED', 'WARN', { obj: dropperId });
    return ok({ value: 0 });
  }
  if (t.capped) return no('CAPPED');
  transfer(w, d, v, drop);
  markReagent(w, targetId, DROPPER_REAGENT[dropperId]);
  if (tipContact) {
    // La punta arrastra muestra al gotero: las próximas gotas llevan restos (M07).
    moveFraction(v, d, Math.min(0.02, 0.02 / Math.max(0.1, v.volumeMl)));
    errB(w, 'M07', 'DROPPER_CONTAMINATED', 'WARN', { obj: dropperId });
  }
  if (dropperId === 'dCu') biuretPrecipitate(w, targetId);
  emitB(w, 'ASSAY_DROP', 'INFO', { obj: targetId, r: dropperId });
  return ok({ value: drop });
}

/** Cu(II) por encima de lo calibrado en medio alcalino: precipita Cu(OH)₂ (B02, SC09). El citrato de Benedict lo evita. */
function biuretPrecipitate(w: BioWorld, tubeId: string) {
  const v = w.bio.vessels[tubeId];
  const t = w.bio.tubes[tubeId];
  const a = bp(w).assay;
  if (t.reagents.benedict !== undefined || v.volumeMl <= 1e-9) return;
  const max = a.biuretCuMaxMmolMl * v.volumeMl;
  if (v.s.cu > max && pHOf(v.s, v.volumeMl) >= 9) {
    const extra = v.s.cu - max;
    v.s.cu -= extra;
    v.s.cuOH += extra;
    errB(w, 'B02', 'COPPER_EXCESS', 'WARN', { obj: tubeId });
  }
}

// ─────────────────────────── Tubos: mezcla, tapón, baño, gas, cronómetro, pH ───────────────────────────

function mixTube(w: BioWorld, tubeId: string, vigor01: number, durationS: number): BioDispatchResult {
  const t = w.bio.tubes[tubeId];
  const v = w.bio.vessels[tubeId];
  if (!t || !v) return no('NO_OBJECT');
  if (t.discarded) return no('DISCARDED');
  const vig = clamp(vigor01, 0, 1);
  const dur = clamp(durationS, 0, 60);
  v.homog01 = clamp(1 - (1 - v.homog01) * Math.exp(-0.6 * vig * dur), 0, 1);
  if (dur >= bp(w).mixReadyS && vig >= 0.3) t.mixedAt = w.timeS;
  // Extracción lipídica durante el agitado (la integra también el paso, aquí el impulso del gesto).
  const ext = extractionStep(bp(w).assay, v.s, v.volumeMl, vig, dur);
  v.s.lipidMg -= ext;
  v.s.lipidExt += ext;
  // Agitar fuerte destapado: salpica y pierde líquido; con etanol, fase orgánica (E06, M15).
  if (vig > 0.8 && !t.capped && v.volumeMl > 0.2) {
    const loss = Math.min(0.04, 0.12 / v.volumeMl);
    const splash = emptyBioVessel(1e9, v.tK);
    moveFraction(v, splash, loss);
    contaminateNeighbors(w, tubeId, splash);
    moveAll(splash, w.bio.vessels.spill);
    errB(w, v.s.ethanolMl > 0.1 ? 'EMU06' : 'M15', 'SPLASH', 'WARN', { obj: tubeId });
  }
  // Agitar fuerte una catálisis en curso: la espuma deja de representar el O₂ (C06).
  if (vig > 0.7 && t.reagents.h2o2 !== undefined && v.s.h2o2 > 1e-4 && v.s.catAct > 1e-6) {
    t.foamMl = r6(t.foamMl + 2 * vig * dur);
    errB(w, 'C06', 'FOAM', 'WARN', { obj: tubeId });
  }
  flagB(w, `mixed:${tubeId}`);
  return ok({ value: r6(v.homog01) });
}

/** Salpicadura que alcanza los tubos abiertos vecinos de la misma gradilla (M16). */
function contaminateNeighbors(w: BioWorld, tubeId: string, splash: BioVessel) {
  const o = w.objects[tubeId];
  if (!o) return;
  for (const id of ALL_TUBES) {
    if (id === tubeId) continue;
    const n = w.objects[id];
    const t = w.bio.tubes[id];
    if (!n || !t || t.capped || t.discarded || n.support !== o.support) continue;
    if (Math.hypot(n.pose.x - o.pose.x, n.pose.y - o.pose.y) > 3) continue;
    if (w.bio.vessels[id].volumeMl <= 0.05 || splash.volumeMl <= 1e-6) continue;
    moveFraction(splash, w.bio.vessels[id], 0.25);
    errB(w, 'M16', 'NEIGHBOR_CONTAMINATED', 'WARN', { obj: id });
  }
}

function capTube(w: BioWorld, tubeId: string, capped: boolean): BioDispatchResult {
  const t = w.bio.tubes[tubeId];
  if (!t) return no('NO_OBJECT');
  if (t.collector && capped) return no('COLLECTOR_ON');
  // Destapar con reactivo derramado alrededor: exposición (S02).
  if (!capped && t.capped && w.bio.vessels.spill.volumeMl > 0.5) {
    errB(w, 'S02', 'CHEMICAL_SPLASH', 'ALERT', { obj: tubeId });
  }
  t.capped = capped;
  return ok();
}

function tongs(w: BioWorld, tubeId: string, to: string, depth01: number): BioDispatchResult {
  const t = w.bio.tubes[tubeId];
  const o = w.objects[tubeId];
  if (!t || !o || t.discarded) return no('NO_OBJECT');
  if (w.objects.tg?.support === 'hand') {
    // La pinza la sostiene la mano: la operación es posible.
  }
  if ((BATH_IDS as readonly string[]).includes(to)) {
    const used = ALL_TUBES.concat(CUVETTES).filter((id) => w.objects[id]?.support === to).length;
    if (used >= 10) return no('SLOT_BUSY');
    const pos = bathSlotPos(to, used);
    o.support = to;
    o.pose = { x: pos.x, y: pos.y, z: pos.z, rotationRad: 0 };
    const d = clamp(depth01, 0.1, 1);
    t.bath = { id: to, immersion01: d };
    // Inmersión poco profunda: el líquido queda por encima del agua del baño y se calienta desigual (R04).
    if (d < 0.6) errB(w, 'R04', 'SHALLOW_IMMERSION', 'WARN', { obj: tubeId });
    flagB(w, `inBath:${tubeId}:${to}`);
    return ok();
  }
  if (to === 'home' || to.startsWith('rk')) {
    const h = tubeHome(tubeId);
    o.support = h.rack;
    o.pose = { x: h.x, y: h.y, z: h.z, rotationRad: 0 };
    t.bath = null;
    return ok();
  }
  return no('BAD_TARGET');
}

function connectCollector(w: BioWorld, tubeId: string, sealed: boolean): BioDispatchResult {
  const t = w.bio.tubes[tubeId];
  if (!t || t.discarded) return no('NO_OBJECT');
  if (t.collector) return no('COLLECTOR_ON');
  t.capped = false;
  t.collector = { sealed, at: w.timeS };
  flagB(w, `collector:${tubeId}`);
  return ok();
}

function startTimer(w: BioWorld, tubeId: string): BioDispatchResult {
  const t = w.bio.tubes[tubeId];
  if (!t) return no('NO_OBJECT');
  if (t.timerAt !== null) return no('TIMER_RUNNING');
  t.timerAt = w.timeS;
  // Cronómetro iniciado mucho después del contacto amilasa–almidón: conversión previa sin registrar (A02).
  if (t.contactAt !== null && t.reagents.amylase !== undefined && w.timeS - t.contactAt > 10) errB(w, 'A02', 'NO_T0', 'WARN', { obj: tubeId });
  flagB(w, `timer:${tubeId}`);
  return ok();
}

/** Tira de pH: compara color con la escala; el pigmento de la muestra sesga la lectura. */
function phStrip(w: BioWorld, vesselId: string): BioDispatchResult {
  const v = vesselOf(w, vesselId);
  if (!v || v.volumeMl <= 0.05) return no('BAD_TARGET');
  const p = bp(w);
  let pH = pHOf(v.s, v.volumeMl);
  const pig = v.s.pigment / Math.max(0.1, v.volumeMl);
  const biased = pig > 0.3;
  if (biased) pH -= 0.5;
  const r = addReading(w, { instrument: 'ph', targetId: vesselId, value: r6(Math.round(pH / p.readRes.ph) * p.readRes.ph), unit: 'pH', biased });
  const t = w.bio.tubes[vesselId];
  if (t) t.phReadAt = w.timeS;
  return ok({ id: r.id, value: r.value });
}

// ─────────────────────────── Reacciones que empiezan con un gesto ───────────────────────────

/** Condición física de un tubo de enzima al iniciar la reacción: fuente, calor previo y pH. */
function conditionOf(w: BioWorld, tubeId: string, enzyme: 'cat' | 'amy'): string {
  const v = w.bio.vessels[tubeId];
  const t = w.bio.tubes[tubeId];
  const pH = pHOf(v.s, v.volumeMl);
  const ph = pH < 5.5 ? 'acid' : pH > 8.5 ? 'base' : 'neutral';
  if (enzyme === 'cat') {
    const src = v.tags.includes('P2') ? 'liver' : v.tags.includes('sPot') ? 'potato' : 'none';
    if (src === 'none') return 'none';
    return `${src}${t.maxTK > 333 ? '+heat' : ''}${ph !== 'neutral' ? `+${ph}` : ''}`;
  }
  if (v.s.amyAct + v.s.amySolid + v.s.amyDen <= 1e-9) return 'ctrl';
  return `amy@pH${Math.round(pH)}${t.maxTK > bp(w).amylaseTempMaxK ? '+heat' : ''}`;
}

function startCatalase(w: BioWorld, tubeId: string) {
  const t = w.bio.tubes[tubeId];
  const v = w.bio.vessels[tubeId];
  if (t.contactAt !== null) {
    // Exceso de sustrato: más H₂O₂ del protocolo en un tubo que ya reacciona.
    if (t.h2o2Ml > bp(w).catalaseH2O2Ml * 1.5) flagB(w, `h2o2Excess:${tubeId}`);
    return;
  }
  t.contactAt = w.timeS;
  t.condition = conditionOf(w, tubeId, 'cat');
  const liquidBefore = Math.max(0.1, v.volumeMl);
  t.enzymePerMl = r6((v.s.catAct + v.s.catDen) / liquidBefore);
  if (t.condition !== 'none') {
    // Sin la masa del hígado registrada (C02); aliquota precalentada sin medir su temperatura (C03).
    if (v.tags.includes('P2') && w.bio.liver.weighedAt === null) errB(w, 'C02', 'TISSUE_MASS_UNKNOWN', 'WARN', { obj: tubeId });
    if (t.maxTK > 318 && !w.evidence[`read:thermo:${tubeId}`]) errB(w, 'C03', 'PRETREAT_UNRECORDED', 'WARN', { obj: tubeId });
  }
  // Peróxido antes de conectar el colector: lo producido antes no se mide (C04).
  if (!t.collector) errB(w, 'C04', 'GAS_UNMEASURED', 'WARN', { obj: tubeId });
  else if (!t.collector.sealed) errB(w, 'C05', 'GAS_LEAK', 'WARN', { obj: tubeId });
  flagB(w, `catalaseStart:${tubeId}`);
  emitB(w, 'CATALASE_STARTED', 'INFO', { obj: tubeId });
}

function startAmylase(w: BioWorld, tubeId: string) {
  const t = w.bio.tubes[tubeId];
  const v = w.bio.vessels[tubeId];
  t.contactAt = w.timeS;
  t.condition = conditionOf(w, tubeId, 'amy');
  // Una alícuota de una hidrólisis ya incubada (marcada `*`) no es un tubo de reacción nuevo: no se compara su almidón.
  if (t.sources.some((x) => x.endsWith('*'))) {
    // nada
  } else if (!v.tags.includes('P1')) errB(w, 'A01', 'STARCH_BATCH_MISMATCH', 'WARN', { obj: tubeId });
  else {
    // Concentración de almidón distinta entre tubos de amilasa: controles no comparables (A01).
    const c = (v.s.starch + v.s.starchSolid) / Math.max(0.1, v.volumeMl);
    const others = Object.entries(w.bio.tubes).filter(([id, x]) => id !== tubeId && x.contactAt !== null && x.reagents.amylase !== undefined);
    for (const [id] of others) {
      const o = w.bio.vessels[id];
      const co = (o.s.starch + o.s.starchSolid + o.s.dextrin + 2 * o.s.maltose + o.s.glucose) / Math.max(0.1, o.volumeMl);
      if (co > 0 && Math.abs(c - co) / co > 0.35) errB(w, 'A01', 'STARCH_BATCH_MISMATCH', 'WARN', { obj: tubeId });
    }
  }
  if (t.timerAt === null) flagB(w, `contactNoTimer:${tubeId}`);
  flagB(w, `amylaseStart:${tubeId}`);
  emitB(w, 'AMYLASE_CONTACT', 'INFO', { obj: tubeId });
}

// ─────────────────────────── Lecturas ───────────────────────────

function addReading(w: BioWorld, r: Omit<BioReading, 'id' | 'tick' | 't'>): BioReading {
  w.bio.readingSeq += 1;
  const prefix: Record<BioInstrument, string> = { balance: 'm', thermo: 't', eye: 'c', gas: 'gas', ph: 'p', photometer: 'abs', scale: 'v' };
  const id = `${prefix[r.instrument]}${w.bio.readingSeq}`;
  const full: BioReading = { id, tick: w.tick, t: w.timeS, ...r };
  w.bio.readings[id] = full;
  w.bio.readingOrder.push(id);
  flagB(w, `read:${r.instrument}`);
  flagB(w, `read:${r.instrument}:${r.targetId}`);
  return full;
}

const roundTo = (v: number, res: number) => Math.round(v / res) * res;

function read(w: BioWorld, instrument: BioInstrument, targetId: string, eyeDeg: number): BioDispatchResult {
  const p = bp(w);
  switch (instrument) {
    case 'balance': {
      if (targetId !== 'bal') return no('BAD_TARGET');
      const items = onBalance(w);
      if (!items.length) return no('NOTHING_ON_BALANCE');
      // Un recipiente caliente sobre la balanza falsea la lectura y la daña (rechazo).
      const gross = balanceGross(w);
      const net = gross - (w.bio.balance.tared ? w.bio.balance.tareG : 0);
      const r = addReading(w, { instrument, targetId, value: r6(roundTo(net, p.readRes.balance)), unit: 'g', biased: !w.bio.balance.tared || scB(w, SC_B04.BALANCE_DRIFT) });
      if (items.includes('liv')) w.bio.liver.weighedAt = w.timeS;
      return ok({ id: r.id, value: r.value });
    }
    case 'thermo': {
      const v = vesselOf(w, targetId);
      if (!v || v.volumeMl <= 0.5) {
        const b = w.bio.baths[targetId];
        if (!b) return no('BAD_TARGET');
        const r = addReading(w, { instrument, targetId, value: r6(roundTo(b.tK - 273.15, p.readRes.thermo)), unit: '°C' });
        return ok({ id: r.id, value: r.value });
      }
      const r = addReading(w, { instrument, targetId, value: r6(roundTo(v.tK - 273.15, p.readRes.thermo)), unit: '°C' });
      const b = prepOf(w, targetId);
      if (b) b.measuredTK = v.tK;
      return ok({ id: r.id, value: r.value });
    }
    case 'scale': return readScale(w, targetId, eyeDeg);
    case 'eye': return readEye(w, targetId);
    case 'gas': return readGas(w, targetId);
    case 'photometer': return readPhotometer(w, targetId);
    case 'ph': return phStrip(w, targetId);
  }
  return no('BAD_INSTRUMENT');
}

function readScale(w: BioWorld, targetId: string, eyeDeg: number): BioDispatchResult {
  const p = bp(w);
  const v = vesselOf(w, targetId);
  const kind = w.objects[targetId]?.kind;
  if (!v || (kind !== 'bioCylinder' && kind !== 'bioPipette' && kind !== 'bioBeaker')) return no('BAD_TARGET');
  let value = v.volumeMl;
  const biased = Math.abs(eyeDeg) > p.eyeTolDeg;
  if (biased) {
    value += p.parallaxMlPerDeg * eyeDeg * (kind === 'bioCylinder' && targetId === 'g100' ? 4 : 1);
  }
  const res = kind === 'bioPipette' ? 0.05 : targetId === 'g10' ? 0.2 : kind === 'bioBeaker' ? 5 : p.readRes.cylinder;
  // Leer la pipeta comprueba su cero antes de entregar (M03).
  if (kind === 'bioPipette') w.bio.pipettes[targetId].zeroChecked = true;
  const r = addReading(w, { instrument: 'scale', targetId, value: r6(Math.max(0, roundTo(value, res))), unit: 'mL', biased });
  return ok({ id: r.id, value: r.value });
}

/** Lo que se ve en un tubo o recipiente (color, fase, precipitado), según sus especies. */
export function observeVessel(w: BioWorld, id: string): { quality: string; value: number } {
  const v = w.bio.vessels[id];
  const t = w.bio.tubes[id];
  const a = bp(w).assay;
  if (!v || v.volumeMl <= 1e-6) return { quality: 'empty', value: 0 };
  const V = v.volumeMl;
  const has = (r: ReagentId) => !!t && t.reagents[r] !== undefined;
  const iodine = v.s.iodine > 1e-9;
  const benedict = has('benedict');
  const biuret = !benedict && v.s.cu + v.s.cuOH > 1e-9;
  const ethanol = v.s.ethanolMl > 0.05;
  const fam = [iodine, benedict, biuret, ethanol].filter(Boolean).length;
  if (fam > 1) return { quality: 'interference', value: 0 };
  const pig = v.s.pigment / V > 0.3;
  if (iodine) {
    const l = lugolSignal(a, v.s, V, v.homog01);
    const lvl = l.index > 0.7 ? 'black' : l.index > 0.35 ? 'blue' : l.index > 0.1 ? 'faint' : 'yellow';
    return { quality: `lugol:${lvl}${l.localized ? ':spots' : ''}${pig && l.index < 0.35 ? ':pigment' : ''}`, value: r6(l.index) };
  }
  if (biuret) {
    const age = t?.reagents.cu !== undefined ? w.timeS - t.reagents.cu! : 0;
    const b = biuretSignal(a, v.s, V, age);
    return { quality: `biuret:${b.color}`, value: r6(b.index) };
  }
  if (benedict) {
    const c = benedictColor(a, v.s, V);
    return { quality: `benedict:${c}`, value: r6(v.s.cu2o / V) };
  }
  if (ethanol || t?.dilutedAt != null) {
    const age = t?.dilutedAt != null ? w.timeS - t.dilutedAt : 0;
    const idx = emulsionIndex(a, v.s, V, age) + (v.s.detergent / V) * 0.6;
    const q = t?.dilutedAt == null ? (v.s.lipidMg / V > 50 ? 'layers' : 'clear') : idx > 5 ? 'milky' : idx > a.emulsionVisibleMgMl ? 'cloudy' : v.s.lipidMg / V > 50 ? 'layers' : 'clear';
    return { quality: `emulsion:${q}`, value: r6(idx) };
  }
  if (t?.reagents.h2o2 !== undefined) {
    const foam = t.foamMl + (t.o2CollectedMmol + t.o2LostMmol) * 2;
    return { quality: `foam:${foam > 8 ? 'high' : foam > 0.5 ? 'low' : 'none'}`, value: r6(foam) };
  }
  // Observación inicial sin reactivos.
  const turbid = v.s.turbid / V > 0.2 || v.s.lipidMg / V > 5 || v.s.starchSolid > 1e-3 || v.s.detergent / V > 0.5;
  return { quality: `initial:${pig ? 'colored' : turbid ? 'turbid' : 'clear'}`, value: 0 };
}

function readEye(w: BioWorld, targetId: string): BioDispatchResult {
  const p = bp(w);
  const v = vesselOf(w, targetId);
  if (!v) return no('BAD_TARGET');
  const t = w.bio.tubes[targetId];
  if (t?.discarded) return no('DISCARDED');
  const o = observeVessel(w, targetId);
  if (t) {
    const assay = o.quality.split(':')[0];
    const V = v.volumeMl;
    // Lectura en caliente de un tubo de Benedict (R06).
    if (assay === 'benedict' && v.tK > p.readHotK) errB(w, 'R06', 'READ_HOT', 'WARN', { obj: targetId });
    if (assay === 'benedict') {
      if (t.maxTK < p.assay.benedictMinK) errB(w, 'R01', 'NO_HEAT', 'WARN', { obj: targetId });
      else if (t.hotDoseS < p.benedictMinS) errB(w, 'R02', 'HEAT_SHORT', 'WARN', { obj: targetId });
    }
    if (assay === 'lugol') {
      const l = lugolSignal(p.assay, v.s, V, v.homog01);
      const sites = (v.s.starch + 0.3 * v.s.dextrin) / p.assay.iodinePerGlucosyl;
      if (l.freeIodine < 1e-6 && sites > v.s.iodine * 1.5 && l.index < 0.7) errB(w, 'L01', 'IODINE_INSUFFICIENT', 'WARN', { obj: targetId });
      // Grumos del almidón PREPARADO (P1 sin agitar o polvo directo al tubo); los gránulos propios de una muestra se ven, pero no son un error.
      if (l.localized && v.tags.includes('P1')) errB(w, 'L02', 'STARCH_UNDISPERSED', 'WARN', { obj: targetId });
    }
    if (assay === 'biuret') {
      const age = t.reagents.cu !== undefined ? w.timeS - t.reagents.cu : 0;
      if (t.reagents.naoh === undefined || pHOf(v.s, V) < p.assay.biuretMinPH) errB(w, 'B01', 'NO_ALKALI', 'WARN', { obj: targetId });
      if (age < p.assay.biuretDelayS) errB(w, 'B03', 'READ_TOO_EARLY', 'WARN', { obj: targetId });
      const mg = v.s.proteinMg / V;
      if (mg > 1e-6 && mg < p.assay.biuretLodMgMl) errB(w, 'B05', 'BELOW_LOD', 'INFO', { obj: targetId });
      if (t.mixedAt === null || v.homog01 < 0.7) errB(w, 'B06', 'NOT_MIXED', 'WARN', { obj: targetId });
    } else if (assay !== 'initial' && assay !== 'foam' && v.homog01 < 0.7) errB(w, 'M14', 'NOT_MIXED', 'WARN', { obj: targetId });
    if (assay === 'emulsion' || t.label?.startsWith('EMU')) {
      if (t.reagents.ethanol === undefined) errB(w, 'EMU01', 'NO_ETHANOL', 'WARN', { obj: targetId });
      else if (t.dilutedAt === null) errB(w, 'EMU02', 'NO_WATER_STEP', 'WARN', { obj: targetId });
      else if (w.timeS - t.dilutedAt > p.emulsionReadMaxS) errB(w, 'EMU05', 'EMULSION_SEPARATED', 'WARN', { obj: targetId });
    }
    checkLabelSource(w, targetId);
    if (assay === 'initial' && t.initialRead === null) t.initialRead = o.quality;
    if (t.readAt === null && assay !== 'initial') t.readAt = w.timeS;
    if (t.label) flagB(w, `tubeRead:${t.label}`);
  }
  const r = addReading(w, { instrument: 'eye', targetId, value: o.value, unit: 'índice', quality: o.quality });
  emitB(w, 'TUBE_OBSERVED', 'INFO', { obj: targetId, q: o.quality });
  return ok({ id: r.id, value: r.value });
}

/** El código del rótulo nombra un lote que el tubo no recibió (M13): la cadena de muestras lo delata. */
function checkLabelSource(w: BioWorld, tubeId: string) {
  const t = w.bio.tubes[tubeId];
  const code = t.label?.split('/')[1];
  const lot = code ? lotOfCode(code) : null;
  if (!lot) return;
  const v = w.bio.vessels[tubeId];
  if (!v.tags.includes(lot)) errB(w, 'M13', 'SOURCE_LOT_MISMATCH', 'WARN', { obj: tubeId });
}

function readGas(w: BioWorld, tubeId: string): BioDispatchResult {
  const t = w.bio.tubes[tubeId];
  const v = w.bio.vessels[tubeId];
  if (!t || !v) return no('BAD_TARGET');
  if (!t.collector) return no('NO_COLLECTOR');
  const ml = gasVolumeMl(t.o2CollectedMmol, v.tK, bp(w).pressurePa);
  const since = t.contactAt === null ? 0 : w.timeS - t.contactAt;
  t.gasReadsS.push(r6(since));
  const r = addReading(w, { instrument: 'gas', targetId: tubeId, value: r6(Math.round(ml * 10) / 10), unit: 'mL', quality: t.condition ?? 'none' });
  if (t.condition) flagB(w, `gas:${t.condition}`);
  // Comparar tubos con aportes de hígado distintos: la actividad se confunde con la cantidad de enzima (D06).
  if (t.condition?.startsWith('liver') && t.enzymePerMl) {
    const others = Object.values(w.bio.tubes).filter((x) => x !== t && x.condition?.startsWith('liver') && x.enzymePerMl && x.gasReadsS.length);
    if (others.some((x) => Math.abs(x.enzymePerMl! - t.enzymePerMl!) / Math.max(t.enzymePerMl!, x.enzymePerMl!) > 0.3)) errB(w, 'D06', 'UNEQUAL_BATCHES', 'WARN', { obj: tubeId });
  }
  return ok({ id: r.id, value: r.value });
}

function blankPhotometer(w: BioWorld, cuvetteId: string): BioDispatchResult {
  if (!w.bio.adhEnabled) return resourceNo(w, 'photometer', 'RESOURCE_UNAVAILABLE_INSTRUMENT');
  const v = vesselOf(w, cuvetteId);
  if (!v || !CUVETTES.includes(cuvetteId) || v.volumeMl < 1) return no('BAD_TARGET');
  if (v.s.nadh > 1e-9) return no('BLANK_NOT_CLEAR');
  w.bio.photometer.blanked = true;
  flagB(w, 'photometerBlanked');
  return ok();
}

/** Condición de una cubeta de ADH según lo que contiene (no según su rótulo). */
export function cuvetteCondition(v: BioVessel): string {
  if (v.s.adhAct <= 1e-12) return 'noEnzyme';
  if (v.s.ethanolSub <= 1e-12) return 'noSubstrate';
  if (v.s.nad + v.s.nadh <= 1e-12) return 'noCofactor';
  return v.s.methanol > 1e-9 ? 'competitive' : 'full';
}

function readPhotometer(w: BioWorld, cuvetteId: string): BioDispatchResult {
  if (!w.bio.adhEnabled) return resourceNo(w, 'photometer', 'RESOURCE_UNAVAILABLE_INSTRUMENT');
  const p = bp(w);
  const v = vesselOf(w, cuvetteId);
  if (!v || !CUVETTES.includes(cuvetteId) || v.volumeMl < 1) return no('BAD_TARGET');
  let a = p.epsilonNadh * (v.s.nadh / v.volumeMl);
  const biased = !w.bio.photometer.blanked;
  if (biased) {
    a += p.photometerOffset;
    errB(w, 'D02', 'NO_BLANK', 'WARN', { obj: cuvetteId });
  }
  const cond = cuvetteCondition(v);
  if (cond === 'noCofactor') errB(w, 'D01', 'NO_NAD', 'WARN', { obj: cuvetteId });
  const r = addReading(w, { instrument: 'photometer', targetId: cuvetteId, value: r6(Math.round(a * 1000) / 1000), unit: 'A340', quality: cond, biased });
  bumpCount(w, `adhReads:${cond}`);
  return ok({ id: r.id, value: r.value });
}

const bumpCount = (w: BioWorld, k: string) => {
  w.evidence[k] = (w.evidence[k] ?? 0) + 1;
};

// ─────────────────────────── Residuos, mechero, recursos, tiempo ───────────────────────────

function disposeVessel(w: BioWorld, vesselId: string, wasteId: string): BioDispatchResult {
  const v = vesselOf(w, vesselId);
  if (!v || !(WASTE_IDS as readonly string[]).includes(wasteId)) return no('BAD_TARGET');
  if ((WASTE_IDS as readonly string[]).includes(vesselId) || w.objects[vesselId]?.kind === 'bioBottle') return no('BAD_SOURCE');
  const t = w.bio.tubes[vesselId];
  if (t?.discarded) return no('DISCARDED');
  if (w.bio.bars && Object.values(w.bio.bars).includes(vesselId)) return no('RETRIEVE_BAR');
  // Cobre, yodo o etanol a residuos comunes (S03); tejido a residuos químicos se acepta (corriente química).
  if (wasteId === 'tr' && (copperOf(v.s) > 1e-9 || v.s.iodine > 1e-9 || v.s.ethanolMl > 1e-6 || v.s.h2o2 > 1e-6)) errB(w, 'S03', 'WASTE_MISCLASSIFIED', 'WARN', { obj: vesselId });
  if (t && v.volumeMl > 1e-6 && t.readAt === null && Object.keys(t.reagents).length) latchB(w, `unread:${vesselId}`, 'TUBE_DISCARDED_UNREAD', 'INFO', { obj: vesselId });
  if (w.bio.liver.inVessel === vesselId) {
    w.bio.liver.inVessel = 'waste';
    const o = w.objects.liv;
    if (o) o.support = wasteId;
  }
  // El tubo conserva sus lotes como historial: los controles leídos siguen contando después de desecharlo.
  const tags = [...v.tags];
  moveAll(v, w.bio.vessels[wasteId]);
  if (t) {
    v.tags = tags;
    t.discarded = true;
    t.collector = null;
    t.bath = null;
    const o = w.objects[vesselId];
    const bin = w.objects[WASTE_OBJECT[wasteId as (typeof WASTE_IDS)[number]]];
    if (o) {
      o.support = wasteId;
      if (bin) o.pose = { ...bin.pose, z: 3 };
    }
  }
  flagB(w, `disposed:${vesselId}:${wasteId}`);
  return ok();
}

function lightBurner(w: BioWorld, on: boolean): BioDispatchResult {
  if (!on) {
    w.bio.burnerLit = false;
    return ok();
  }
  // Llama con etanol en la mesada: bloqueo crítico (S04).
  const ethanolNear = Object.entries(w.bio.vessels).some(([id, v]) => v.s.ethanolMl > 1e-3 && !(WASTE_IDS as readonly string[]).includes(id));
  if (ethanolNear) {
    errB(w, 'S04', 'IGNITION_BLOCKED', 'CRITICAL', { obj: 'bu' });
    w.safety.block = { code: 'FLAME', since: w.timeS };
    return no('HAZARD_BLOCKED');
  }
  w.bio.burnerLit = true;
  return ok();
}

/** Incidencia de recurso (§9.2): no suma `err:*` ni descuenta; queda en revisión docente. */
function resourceIncident(w: BioWorld, key: string, code: string) {
  if (!w.bio.incidents.includes(key)) w.bio.incidents.push(key);
  flagB(w, `resource:${key}`);
  latchB(w, `incident:${key}`, code, 'INFO', { obj: key });
}
function resourceNo(w: BioWorld, key: string, code: string): BioDispatchResult {
  resourceIncident(w, key, code);
  return no('RESOURCE_UNAVAILABLE');
}

function requestModule(w: BioWorld, module: 'adh' | 'photometer'): BioDispatchResult {
  if (module === 'adh' && !w.bio.adhEnabled) return resourceNo(w, 'adh', 'RESOURCE_UNCALIBRATED_KINETICS');
  if (module === 'photometer' && !w.bio.adhEnabled) return resourceNo(w, 'photometer', 'RESOURCE_UNAVAILABLE_INSTRUMENT');
  return ok();
}

function requestTimeScale(w: BioWorld, x: number): BioDispatchResult {
  if (x <= 1) return ok({ value: 1 });
  // Acelerar mientras se vierte o se pipetea: se bloquea (§6.6).
  const busy = Object.keys(w.bio.pours).length > 0 || PIPETTE_IDS.some((id) => w.bio.vessels[id].volumeMl > bp(w).pipetteFilmMl + 1e-6);
  if (busy) return no('TIME_LOCKED');
  return ok({ value: x });
}

// ─────────────────────────── Feulgen ───────────────────────────

/** Entrar en un frasco del tratamiento: la secuencia fija → hidrólisis → lavado → Schiff decide los errores F01–F04. */
function enterJar(w: BioWorld, slideId: string, jar: string) {
  const f = w.bio.feulgen[slideId];
  const p = bp(w).feulgen;
  f.jar = jar;
  f.order.push(jar);
  if (jar === 'jHcl' && f.fixS < p.fixMinS) errB(w, 'F01', 'NOT_FIXED', 'WARN', { obj: slideId });
  if (jar === 'jSch') {
    if (f.fixS < p.fixMinS) errB(w, 'F01', 'NOT_FIXED', 'WARN', { obj: slideId });
    if (f.hydroS < p.hydroMinS) errB(w, 'F02', 'HYDROLYSIS_SHORT', 'WARN', { obj: slideId });
    else if (f.washAfterHydroS < p.washMinS) errB(w, 'F04', 'NO_WASH', 'WARN', { obj: slideId });
  }
  flagB(w, `feulgen:${slideId}:${jar}`);
}

/** Recurso de la lámina tratada según su historia (nunca una foto ideal por haber pasado por los frascos). */
export function feulgenAsset(w: BioWorld, slideId: string): string {
  const f = w.bio.feulgen[slideId];
  const p = bp(w).feulgen;
  if (f.schiffS < p.schiffMinS) return 'feulgenRaw';
  if (f.fixS < p.fixMinS || f.hydroS > p.hydroMaxS) return 'feulgenDamaged';
  if (f.hydroS < p.hydroMinS || f.washAfterHydroS < p.washMinS) return 'feulgenWeak';
  return 'feulgenBuccal';
}

function stepFeulgen(w: BioWorld, dt: number) {
  const p = bp(w).feulgen;
  for (const [id, f] of Object.entries(w.bio.feulgen)) {
    if (!f.jar) continue;
    if (f.jar === 'jFix') f.fixS = r6(f.fixS + dt);
    if (f.jar === 'jHcl') {
      f.hydroS = r6(f.hydroS + dt);
      f.washAfterHydroS = 0;
      if (f.hydroS > p.hydroMaxS) errB(w, 'F03', 'HYDROLYSIS_LONG', 'WARN', { obj: id });
    }
    if (f.jar === 'jWash') f.washAfterHydroS = r6(f.washAfterHydroS + dt);
    if (f.jar === 'jSch') f.schiffS = r6(f.schiffS + dt);
    const asset = feulgenAsset(w, id);
    if (w.slides[id] && w.slides[id].assetId !== asset) w.slides[id].assetId = asset;
  }
}

// ─────────────────────────── Paso fijo ───────────────────────────

export function stepBioWorld(w: BioWorld): void {
  stepCellWorld(w);
  const dt = w.params.dtS;
  stepPours(w, dt);
  stepBaths(w, dt);
  stepPlates(w, dt);
  for (const [id, v] of Object.entries(w.bio.vessels)) stepVessel(w, id, v, dt);
  stepFeulgen(w, dt);
}

function stepPours(w: BioWorld, dt: number) {
  for (const [srcId, pour] of Object.entries(w.bio.pours)) {
    const src = vesselOf(w, srcId);
    if (!src || src.volumeMl <= 1e-9) {
      delete w.bio.pours[srcId];
      continue;
    }
    const ml = pourRate(w, srcId, pour.tiltDeg) * dt;
    if (ml <= 0) continue;
    const target = vesselOf(w, pour.targetId);
    if (!target || (PIPETTE_IDS as readonly string[]).includes(pour.targetId) || w.bio.tubes[pour.targetId]?.capped) {
      transfer(w, src, w.bio.vessels.spill, ml);
      errB(w, 'M08', 'SPILLED', 'WARN', { obj: srcId });
      continue;
    }
    const tags = src.tags.length ? [...src.tags] : [srcId];
    const r = transfer(w, src, target, ml);
    delivered(w, srcId, pour.targetId, r.moved, r.overflow, tags);
  }
}

function stepBaths(w: BioWorld, dt: number) {
  const p = bp(w);
  for (const id of BATH_IDS) {
    const b = w.bio.baths[id];
    const power = b.on && b.tK < b.setK ? p.bath.powerW * (scB(w, SC_B04.SLOW_BATH) ? 0.3 : 1) : 0;
    b.tK = b.tK + ((power - p.bath.lossUA * (b.tK - p.ambientK)) * dt) / p.bath.heatCapJPerK;
    if (b.on && Math.abs(b.tK - b.setK) < 2 && b.readyAt === null) b.readyAt = w.timeS;
  }
}

/** Placa calefactora con agitador: temperatura de la placa (termostato sobre la placa, no sobre el líquido) y agitación. */
function stepPlates(w: BioWorld, dt: number) {
  const p = bp(w);
  const pr = p.prep;
  for (const pid of PLATE_IDS) {
    const pl = w.bio.plates[pid];
    const v = pl.vesselId ? w.bio.vessels[pl.vesselId] : null;
    const power = pl.on && pl.plateK < pl.setK ? pr.plateW : 0;
    const toLiquid = v && v.volumeMl > 0.5 ? pr.plateUA * (pl.plateK - v.tK) : 0;
    pl.plateK += ((power - toLiquid - 0.4 * (pl.plateK - p.ambientK)) * dt) / pr.plateC;
    if (!v || !pl.vesselId) continue;
    if (v.volumeMl > 0.5) {
      const C = heatCapacity(v.volumeMl, 60);
      v.tK += ((toLiquid - pr.liquidUA * (v.tK - p.ambientK)) * dt) / C;
    }
    const b = prepOf(w, pl.vesselId);
    const coupled = w.bio.bars && Object.values(w.bio.bars).includes(pl.vesselId) && v.volumeMl > 1;
    const viscous = (v.s.starch + v.s.starchSolid) / Math.max(1, v.volumeMl) > 0.6;
    const slip = coupled && pl.rpm > (viscous ? pr.slipRpmViscous : pr.slipRpmWater);
    const stir01 = coupled ? (slip ? 0.15 : clamp(pl.rpm / pr.rpmFull, 0, 1)) : 0;
    stirVessel(w, pl.vesselId, v, stir01, dt);
    if (b) {
      if (stir01 > 0.25) b.stirredS = r6(b.stirredS + dt);
      if (pl.on) b.heatedS = r6(b.heatedS + dt);
      b.maxTK = Math.max(b.maxTK, v.tK);
      if (slip) {
        // Barra desacoplada a demasiadas rpm: golpea, salpica y la dispersión cae (PREP05).
        b.slipS = r6(b.slipS + dt);
        const loss = Math.min(v.volumeMl, 0.03 * dt);
        transfer(w, v, w.bio.vessels.spill, loss);
        b.splashMl = r6(b.splashMl + loss);
        if (b.slipS > 1) errB(w, 'PREP05', 'BAR_SLIP', 'WARN', { obj: pl.vesselId });
      }
      b.homog01 = v.homog01;
      b.accessible01 = accessibleOf(w, b);
    }
  }
}

/** Fracción accesible del lote: almidón disperso, catalasa extraída o amilasa disuelta. */
function accessibleOf(w: BioWorld, b: PrepBatch): number {
  const v = w.bio.vessels[b.vesselId];
  if (b.id === 'P1') return (v.s.starch + v.s.starchSolid) > 1e-9 ? v.s.starch / (v.s.starch + v.s.starchSolid) : 0;
  if (b.id === 'P2') return w.bio.liver.totalU > 0 ? (v.s.catAct + v.s.catDen) / w.bio.liver.totalU : 0;
  const tot = v.s.amyAct + v.s.amyDen + v.s.amySolid;
  return tot > 1e-9 ? (v.s.amyAct + v.s.amyDen) / tot : 0;
}

/** Agitación de un beaker: homogeneidad, dispersión del almidón, extracción de la catalasa y disolución de la amilasa. */
function stirVessel(w: BioWorld, id: string, v: BioVessel, stir01: number, dt: number) {
  const pr = bp(w).prep;
  v.homog01 = clamp(v.homog01 + (0.08 * stir01 * (1 - v.homog01) - pr.settleK * (1 - stir01) * v.homog01) * dt, 0, 1);
  if (v.volumeMl < 0.5) return;
  // Almidón: los grumos se dispersan con agitación (un poco más rápido tibio); sin agitar, la suspensión sedimenta.
  const fT = 1 + Math.max(0, v.tK - 298.15) / 20;
  const disp = v.s.starchSolid * (1 - Math.exp(-pr.disperseK * stir01 * fT * dt));
  const settle = v.s.starch * (1 - Math.exp(-pr.settleK * 0.3 * (1 - stir01) * dt));
  v.s.starchSolid += settle - disp;
  v.s.starch += disp - settle;
  // Catalasa del tejido: se extrae hasta un tope que depende del tamaño de los trozos.
  const lv = w.bio.liver;
  if (lv.inVessel === id && v.s.catTissue > 1e-9) {
    const size = lv.sizeCm ?? 3;
    const fmax = size <= pr.liverMaxCm ? 0.8 : 0.35;
    const floor = (1 - fmax) * lv.totalU * (v.s.catTissue / Math.max(1e-9, v.s.catTissue + v.s.catTissueDen + v.s.catAct + v.s.catDen) || 0);
    const k = pr.extractK * (0.15 + stir01) * clamp(pr.liverMaxCm / size, 0.2, 1);
    const ex = Math.max(0, v.s.catTissue - floor) * (1 - Math.exp(-k * dt));
    v.s.catTissue -= ex;
    v.s.catAct += ex;
  }
  // Amilasa en polvo: se disuelve más rápido con agitación.
  if (v.s.amySolid > 1e-9) {
    const d = v.s.amySolid * (1 - Math.exp(-pr.dissolveK * (0.1 + stir01) * dt));
    v.s.amySolid -= d;
    v.s.amyAct += d;
  }
}

/** Temperatura, desnaturalización y reacciones de un recipiente en un paso. */
function stepVessel(w: BioWorld, id: string, v: BioVessel, dt: number) {
  const p = bp(w);
  if (v.volumeMl <= 1e-9 || w.objects[id]?.kind === 'bioBottle' || id === 'spill' || (WASTE_IDS as readonly string[]).includes(id)) return;
  const t = w.bio.tubes[id];
  const onPlate = PLATE_IDS.some((pid) => w.bio.plates[pid].vesselId === id);
  // Calor: tubos en un baño, el resto hacia el ambiente (las placas ya integraron su beaker).
  if (t?.bath) {
    const b = w.bio.baths[t.bath.id];
    v.tK = relaxTemp(v.tK, b.tK, p.bath.tubeUA * t.bath.immersion01, heatCapacity(v.volumeMl, p.tubeGlassJPerK), dt);
  } else if (!onPlate) {
    v.tK = relaxTemp(v.tK, p.ambientK, p.bath.airUA, heatCapacity(v.volumeMl, p.tubeGlassJPerK), dt);
  }
  if (!onPlate) stirVesselPassive(w, v, dt);
  const pH = pHOf(v.s, v.volumeMl);
  // Desnaturalización de cada enzima (también la del tejido) por temperatura y pH.
  if (v.s.catAct + v.s.catTissue > 1e-12) {
    const k = denatRate(p.catalase, v.tK, pH);
    const a = denatured(v.s.catAct, k, dt);
    const b = denatured(v.s.catTissue, k, dt);
    v.s.catAct -= a;
    v.s.catDen += a;
    v.s.catTissue -= b;
    v.s.catTissueDen += b;
  }
  if (v.s.amyAct > 1e-12) {
    const a = denatured(v.s.amyAct, denatRate(p.amylase, v.tK, pH), dt);
    v.s.amyAct -= a;
    v.s.amyDen += a;
  }
  // Catalasa: 2 H₂O₂ → 2 H₂O + O₂ (el gas va al colector sellado, en parte se pierde con uno flojo, todo sin colector).
  if (v.s.catAct > 1e-12 && v.s.h2o2 > 1e-12) {
    const rate = mmRate(p.catalase, v.s.catAct, v.s.h2o2, v.volumeMl, v.tK, pH);
    const n = Math.min(v.s.h2o2, rate * dt);
    v.s.h2o2 -= n;
    w.bio.waterFormedMmol += n;
    v.volumeMl = r6(v.volumeMl + n * 0.018);
    const o2 = n / 2;
    if (t?.collector) {
      const f = t.collector.sealed ? 1 : 0.45;
      t.o2CollectedMmol += o2 * f;
      t.o2LostMmol += o2 * (1 - f);
    } else if (t) t.o2LostMmol += o2;
    else w.bio.o2LostMmol += o2;
    if (t) catalaseFoam(w, id, t, v, o2);
  }
  // Amilasa: hidrólisis del almidón disperso a dextrinas y de las dextrinas a maltosa (glucosilos conservados).
  const inhibited = v.s.iodine > 1e-9 || v.s.cu > 1e-9 || v.s.ethanolMl > 0.05;
  if (v.s.amyAct > 1e-12 && v.s.starch + v.s.dextrin > 1e-12 && !inhibited) {
    const S = v.s.starch + v.s.dextrin;
    const rate = mmRate(p.amylase, v.s.amyAct, S, v.volumeMl, v.tK, pH);
    const n = Math.min(S, rate * dt);
    const fs = v.s.starch / S;
    const a = Math.min(v.s.starch, n * fs);
    const b = Math.min(v.s.dextrin, n * (1 - fs) * p.amyDextrinToMaltose);
    v.s.starch -= a;
    v.s.dextrin += a - b;
    v.s.maltose += (b * 0.95) / 2;
    v.s.glucose += b * 0.05;
    if (t && t.contactAt !== null && v.tK > p.amylaseTempMaxK) errB(w, 'A04', 'AMYLASE_TEMPERATURE', 'WARN', { obj: id });
  }
  // ADH (módulo cerrado): etanol + NAD⁺ → acetaldehído + NADH.
  if (v.s.adhAct > 1e-12) {
    const n = Math.min(v.s.nad, v.s.ethanolSub, adhRate(p.adh, v.s.adhAct, v.s, v.volumeMl) * dt);
    v.s.nad -= n;
    v.s.ethanolSub -= n;
    v.s.nadh += n;
  }
  // Benedict: reducción del Cu(II) con calor.
  if (v.s.cu > 1e-12 && t?.reagents.benedict !== undefined) {
    const r = benedictStep(p.assay, v.s, v.volumeMl, v.tK, dt);
    if (r.cu2o > 0) consumeReducing(v.s, p, r.red, r.cu2o);
  }
  // Extracción lipídica pasiva y emulsión.
  if (v.s.lipidMg > 1e-9 && v.s.ethanolMl > 0.05) {
    const ext = extractionStep(p.assay, v.s, v.volumeMl, 0, dt);
    v.s.lipidMg -= ext;
    v.s.lipidExt += ext;
  }
  if (t) {
    t.maxTK = Math.max(t.maxTK, v.tK);
    if (v.tK >= p.assay.benedictMinK + 20) t.hotDoseS = r6(t.hotDoseS + dt);
    if (v.tK > 363) {
      t.boilS = r6(t.boilS + dt);
      // Calentar sin vigilancia: el agua se evapora (R03).
      if (t.boilS > p.benedictMaxS) {
        const ev = Math.min(v.volumeMl * 0.5, 0.004 * dt);
        v.volumeMl = r6(v.volumeMl - ev);
        t.evaporatedMl = r6(t.evaporatedMl + ev);
        w.bio.evaporatedMl = r6(w.bio.evaporatedMl + ev);
        if (t.evaporatedMl > 0.15) errB(w, 'R03', 'OVERHEATED', 'WARN', { obj: id });
      }
    }
  }
}

/** Fuera de la placa: un beaker o tubo sin agitar sedimenta y pierde homogeneidad lentamente. */
function stirVesselPassive(w: BioWorld, v: BioVessel, dt: number) {
  const pr = bp(w).prep;
  if (v.s.starch > 1e-9) {
    const settle = v.s.starch * (1 - Math.exp(-pr.settleK * 0.05 * dt));
    v.s.starch -= settle;
    v.s.starchSolid += settle;
  }
  if (v.s.amySolid > 1e-9) {
    const d = v.s.amySolid * (1 - Math.exp(-pr.dissolveK * 0.05 * dt));
    v.s.amySolid -= d;
    v.s.amyAct += d;
  }
}

/** Reparte el consumo de reductores de Benedict en proporción a cada especie reductora (equivalentes conservados). */
function consumeReducing(s: Species, p: BioParams, red: number, cu2o: number) {
  const parts: Array<[SpeciesId, number]> = [['glucose', s.glucose], ['maltose', s.maltose], ['lactose', s.lactose], ['dextrin', p.assay.dextrinReducing * s.dextrin], ['reductant', s.reductant]];
  const tot = parts.reduce((a, [, x]) => a + x, 0);
  if (tot <= 1e-15) return;
  for (const [k, x] of parts) {
    const take = (red * x) / tot;
    // Un equivalente oxidado deja de ser reductor, pero sigue contando como glucosilo: pasa a la forma «oxidada» (ácido).
    if (k === 'dextrin') s.dextrin -= take / p.assay.dextrinReducing;
    else s[k] -= take;
    if (k === 'glucose' || k === 'maltose' || k === 'dextrin') s.oxidized += k === 'maltose' ? 2 * take : k === 'dextrin' ? take / p.assay.dextrinReducing : take;
  }
  s.cu -= 2 * cu2o;
  s.cu2o += cu2o;
}

/** Espuma de la catálisis y rebose (C09) cuando el gas y la espuma superan el espacio libre del tubo. */
function catalaseFoam(w: BioWorld, id: string, t: BioTube, v: BioVessel, o2: number) {
  const p = bp(w);
  const k = scB(w, SC_B04.OVERFLOW) ? 900 : 300;
  t.foamMl = r6(Math.max(0, t.foamMl + o2 * k - 0.05 * t.foamMl * w.params.dtS));
  const room = v.capacityMl - v.volumeMl;
  if (t.foamMl > room + p.tubeHeadroomMl && v.volumeMl > 0.2) {
    const loss = Math.min(v.volumeMl * 0.1, 0.02);
    transfer(w, v, w.bio.vessels.spill, loss);
    t.foamMl = r6(room);
    latchB(w, `overflow:${id}`, 'CATALASE_OVERFLOW', 'WARN', { obj: id });
    if (t.h2o2Ml > p.catalaseH2O2Ml * 1.5) errB(w, 'C09', 'SUBSTRATE_OVERFLOW', 'WARN', { obj: id });
    flagB(w, `overflowed:${id}`);
  }
}

// ─────────────────────────── Preparaciones: verificación al usar el lote ───────────────────────────

/** Al tomar la primera alícuota de un lote se verifica cómo se preparó (PREP01–PREP09). */
function checkPrep(w: BioWorld, b: PrepBatch) {
  const pr = bp(w).prep;
  const v = w.bio.vessels[b.vesselId];
  const bar = Object.values(w.bio.bars).includes(b.vesselId) || w.evidence[`bar:${b.vesselId}`];
  if (b.id === 'P1') {
    if (Math.abs(b.solidG - pr.starchG) > pr.tolG) errB(w, 'PREP01', 'STARCH_MASS', 'WARN', { obj: b.vesselId, g: r6(b.solidG) });
    if (Math.abs(b.waterMl - pr.starchWaterMl) > pr.tolMl) errB(w, 'PREP02', 'STARCH_WATER', 'WARN', { obj: b.vesselId, ml: r6(b.waterMl) });
    if (!bar || b.stirredS < pr.minStirS) errB(w, 'PREP03', 'STARCH_NOT_STIRRED', 'WARN', { obj: b.vesselId });
    if (b.measuredTK === null || b.measuredTK < pr.starchTargetK - pr.tolK) errB(w, 'PREP04', 'STARCH_TEMPERATURE', 'WARN', { obj: b.vesselId });
  }
  if (b.id === 'P2') {
    if ((w.bio.liver.sizeCm ?? 3) > pr.liverMaxCm || !bar || b.stirredS < pr.minStirS) errB(w, 'PREP06', 'LIVER_NOT_DISPERSED', 'WARN', { obj: b.vesselId });
    if (Math.abs(b.waterMl - pr.catalaseWaterMl) > pr.tolMl * 0.5 || b.heatedS > 0) errB(w, 'PREP07', 'LIVER_WATER', 'WARN', { obj: b.vesselId });
  }
  if (b.id === 'P3') {
    if (Math.abs(b.solidG - pr.amylaseG) > pr.amylaseTolG) errB(w, 'PREP08', 'AMYLASE_MASS', 'WARN', { obj: b.vesselId, g: r6(b.solidG) });
    if (Math.abs(b.waterMl - pr.amylaseWaterMl) > pr.amylaseTolMl || !bar || b.stirredS < pr.minStirS * 0.5 || w.evidence.p3Contaminated) {
      errB(w, 'PREP09', 'AMYLASE_PREP', 'WARN', { obj: b.vesselId });
    }
  }
  void v;
}

// ─────────────────────────── Conservación ───────────────────────────

/** Totales actuales del balance (§6.6): glucosilos, proteína, lípido, cobre, yodo, H/O de la catalasa y enzimas. */
export function bioTotals(w: BioWorld): Record<string, number> {
  const vs = Object.values(w.bio.vessels);
  const sum = (f: (s: Species) => number) => vs.reduce((a, v) => a + f(v.s), 0);
  const powders = (jar: string) => (w.bio.powders[jar] ?? 0) + (w.bio.spatula.load[jar] ?? 0) + (w.bio.boat.load[jar] ?? 0);
  const tubes = Object.values(w.bio.tubes);
  const o2 = tubes.reduce((a, t) => a + t.o2CollectedMmol + t.o2LostMmol, 0) + w.bio.o2LostMmol;
  return {
    glucosyl: sum((s) => glucosylOf(s) + s.oxidized) + (powders('jSt') / GLUCOSYL_G) * 1000,
    protein: sum((s) => s.proteinMg),
    lipid: sum((s) => s.lipidMg + s.lipidExt),
    copper: sum(copperOf),
    iodine: sum((s) => s.iodine),
    // Balance de oxígeno: H₂O₂ + 2·O₂ y de hidrógeno: H₂O₂ + agua formada.
    oxygen: sum((s) => s.h2o2) + 2 * o2,
    hydrogen: sum((s) => s.h2o2) + w.bio.waterFormedMmol,
    catalase: sum((s) => s.catAct + s.catDen + s.catTissue + s.catTissueDen) + (w.bio.liver.inVessel ? 0 : w.bio.liver.totalU),
    amylase: sum((s) => s.amyAct + s.amyDen + s.amySolid) + powders('jAm') * bp(w).activity.amylaseUPerG,
    nad: sum((s) => s.nad + s.nadh),
  };
}

/** Balance de B04 (deben ser ~0) más los de B02 (montajes, colorantes, biomasa). */
export function conservedBio(w: BioWorld): Record<string, number> {
  const out = conservedCell(w);
  const now = bioTotals(w);
  for (const [k, v] of Object.entries(now)) out[`bio:${k}`] = (w.bio.initial[k] ?? 0) - v;
  return out;
}

export function bioSummary(w: BioWorld) {
  return {
    ...cellSummary(w),
    bio: stableHash({
      v: Object.keys(w.bio.vessels).sort().map((id) => [id, Math.round(w.bio.vessels[id].volumeMl * 1000), Math.round(w.bio.vessels[id].tK * 10)]),
      t: Object.keys(w.bio.tubes).sort().map((id) => [w.bio.tubes[id].label, w.bio.tubes[id].discarded]),
      r: w.bio.readingSeq,
    }),
  };
}

/** Lo que el cierre de B04 agrega: placas y baños encendidos, barras sin recuperar, tubos sin desechar, derrames. */
export function bioOutstanding(w: BioWorld): string[] {
  const out: string[] = [];
  for (const id of PLATE_IDS) if (w.bio.plates[id].on || w.bio.plates[id].rpm > 0) out.push(`plate:${id}`);
  for (const id of BATH_IDS) if (w.bio.baths[id].on) out.push(`bath:${id}`);
  for (const [bar, v] of Object.entries(w.bio.bars)) if (v) out.push(`bar:${bar}`);
  for (const id of [...ALL_TUBES, ...CUVETTES]) {
    const t = w.bio.tubes[id];
    if (t && !t.discarded && w.bio.vessels[id].volumeMl > 1e-6) out.push(id);
  }
  for (const id of BEAKER_IDS) if (w.bio.vessels[id].volumeMl > 0.5) out.push(id);
  for (const id of PIPETTE_IDS) if (w.bio.vessels[id].volumeMl > bp(w).pipetteFilmMl + 1e-6) out.push(id);
  if (w.bio.vessels.spill.volumeMl > 0.05) out.push('spill');
  if (Object.keys(w.bio.pours).length) out.push('pour');
  if (w.bio.burnerLit) out.push('burner');
  return out;
}

/** Controles que faltaron en los ensayos hechos (M11/M12, L05, C07): se juzgan al cerrar la mesada. */
export function missingControls(w: BioWorld): string[] {
  const out: string[] = [];
  const read = Object.entries(w.bio.tubes).filter(([, t]) => t.readAt !== null);
  const assayOf = (t: BioTube): string | null => (t.reagents.iodine !== undefined ? 'LUG' : t.reagents.benedict !== undefined ? 'BEN' : t.reagents.cu !== undefined ? 'BIU' : t.reagents.ethanol !== undefined ? 'EMU' : null);
  for (const a of ['LUG', 'BIU', 'EMU', 'BEN'] as const) {
    const tubes = read.filter(([, t]) => assayOf(t) === a && !t.sources.some((s) => s.endsWith('*')));
    if (!tubes.length) continue;
    const tagsOf = (id: string) => w.bio.vessels[id].tags.filter((x) => LOT_CODE[x] || x === 'P1');
    const neg = tubes.some(([id]) => { const tg = tagsOf(id); return tg.length === 1 && tg[0] === 'bW'; });
    const pos = tubes.some(([id]) => tagsOf(id).some((x) => POS_CONTROL[a].includes(x)));
    if (!neg) out.push(`neg:${a}`);
    if (!pos) out.push(`pos:${a}`);
  }
  const cat = Object.values(w.bio.tubes).filter((t) => t.gasReadsS.length);
  if (cat.length && !cat.some((t) => t.condition === 'none')) out.push('blank:CAT');
  return out;
}

/** Cierre: el de B02 más placas, baños, barras, tubos, pipetas y derrames de B04; y el juicio de controles. */
function closeBench(w: BioWorld): BioDispatchResult {
  for (const m of missingControls(w)) {
    if (m.startsWith('neg:')) errB(w, m === 'neg:LUG' ? 'L05' : 'M11', 'CONTROL_MISSING', 'WARN', { obj: m });
    if (m.startsWith('pos:')) errB(w, 'M12', 'CONTROL_MISSING', 'WARN', { obj: m });
    if (m === 'blank:CAT') errB(w, 'C07', 'BLANK_MISSING', 'WARN', { obj: m });
  }
  for (const b of Object.values(w.bio.preps)) if (b && b.firstAliquotAt === null) checkPrep(w, b);
  const had = !!w.evidence.benchRestored;
  const r = dispatchCell(w, { type: 'closeBench' });
  const extra = bioOutstanding(w);
  if (extra.length) {
    if (!had) delete w.evidence.benchRestored;
    emitB(w, 'BIO_BENCH_INCOMPLETE', 'WARN', { n: extra.length });
    return { ...r, value: 0 };
  }
  return r;
}

export function runBioFor(w: BioWorld, seconds: number): void {
  const n = Math.round(seconds / w.params.dtS);
  for (let i = 0; i < n; i++) stepBioWorld(w);
}

export { BOARD_B04, BATH_POS, GEO_B04 };
