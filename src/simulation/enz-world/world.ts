/**
 * Mundo B05 «Cinética en acción» (§6): el mundo celular de B02 (microscopio, montaje de papa con Lugol) con el estado
 * enzimático. Cada comando informa un HECHO (gramos de la espátula, rpm, consigna, inclinación, mL aspirados, sello del
 * captador, vigor del agitado) y el paso fijo integra temperatura, dispersión, extracción, catálisis, hidrólisis,
 * Benedict, ADH, desnaturalización y el reparto del O₂ con conservación de volumen, glucosilos, oxígeno, cobre, enzimas,
 * tejido, yodo, ácido y cofactor (§6.5). Las respuestas de color salen de las especies, nunca del rótulo del tubo.
 */
import { clamp, stableHash } from '../core/math';
import { cellOutstanding, cellSummary, conservedCell, dispatchCell, stepCellWorld } from '../cell-world/world';
import type { CellCommand } from '../cell-world/commands';
import { emitB, errB, flagB, latchB } from '../optical-world/events';
import {
  activityFactor, adhRates, amylaseOf, benedictColor, benedictStep, catalaseOf, copperOf, denatRate, glucosylOf, lugolSignal, noSpecies, pHOf,
} from './chemistry';
import { collectorReading, gasMl, gasMol, partitionO2, stripPH } from './kinetics';
import type { EnzCommand, EnzDispatchResult } from './commands';
import { ENZ_ONLY_TYPES } from './commands';
import { SC_B05 } from './scenarios';
import {
  ADH_BOTTLES, BATH_IDS_B05, BEAKER_IDS_B05, BURNER_POS_B05, CUVETTE_IDS_B05, CYLINDER_IDS_B05, DROPPER_IDS_B05, PIPETTE_IDS_B05, PLATE_IDS_B05,
  TUBE_IDS_B05, WASTE_IDS_B05, bathSlot, tubeHome,
} from './geometry';
import { SPECIES_B05, type EnzInstrument, type EnzParams, type EnzReading, type EnzTube, type EnzVessel, type EnzWorld, type PrepBatch, type Species, type SpeciesB05 } from './types';

export { SC_B05 };
export const scE = (w: EnzWorld, s: string) => w.scenarios.includes(s);

const ok = (extra: Partial<EnzDispatchResult> = {}): EnzDispatchResult => ({ ok: true, ...extra });
const no = (code: string): EnzDispatchResult => ({ ok: false, code });
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
const ep = (w: EnzWorld): EnzParams => w.params.enz!;
const roundTo = (v: number, res: number) => Math.round(v / res) * res;

/** Especies sólidas en suspensión: se toman con la homogeneidad del recipiente (M06, A09, PREP03). */
const SOLIDS: SpeciesB05[] = ['starchSolid', 'tissueMg', 'catTissue', 'catTissueDen', 'amySolid'];
const SOLID_SET = new Set<SpeciesB05>(SOLIDS);
/** Masa de 1 mmol de unidades glucosilo (g) para pasar el polvo a equivalentes. */
const G_PER_MMOL_GLY = 0.16214;
export const BOAT_MASS_G = 1.2;
/** Clases de residuo de cada contenedor (§11.1). */
export const WASTE_CLASS: Record<string, 'aq' | 'cu' | 'bio'> = { wAq: 'aq', wCu: 'cu', wBio: 'bio' };
/** Bloqueos propios de B05 (banda roja, §11.2). */
export const ENZ_BLOCKS = new Set(['PRESSURE', 'HOT', 'IGNITION', 'METHANOL', 'CAUSTIC']);
/** Rótulos de los tratamientos (para los que el calor o el pH son el diseño, no un error). */
const HEAT_LABELS = new Set(['cat-heat']);
const ACID_LABELS = new Set(['cat-acid']);
/** Ebullición práctica del baño (K): evaporación y sobrecalentamiento del Benedict (A13). */
const BOIL_K = 368.15;
const BASE_LABELS = new Set(['cat-base-ph']);

// ─────────────────────────── Recipientes ───────────────────────────

export const emptyVesselB05 = (capacityMl: number, tK = 298.15): EnzVessel => ({ volumeMl: 0, capacityMl, tK, s: noSpecies(), tags: [], homog01: 1, mixed01: 1 });

export const vesselOf = (w: EnzWorld, id: string): EnzVessel | null => w.enz.vessels[id] ?? null;
export const tubeOf = (w: EnzWorld, id: string): EnzTube | null => w.enz.tubes[id] ?? null;
const isTube = (id: string) => (TUBE_IDS_B05 as readonly string[]).includes(id);
const isCuvette = (id: string) => (CUVETTE_IDS_B05 as readonly string[]).includes(id);
const isPipette = (id: string) => (PIPETTE_IDS_B05 as readonly string[]).includes(id);
const isAdhId = (id: string) => (ADH_BOTTLES as readonly string[]).includes(id) || isCuvette(id) || id === 'uv';
export const hasSolids = (v: EnzVessel) => SOLIDS.some((k) => v.s[k] > 1e-9);
const solidFactor = (v: EnzVessel) => v.homog01 + (1 - v.homog01) * 0.35;
export const clockS = (w: EnzWorld, id: string) => {
  const c = w.enz.clocks[id];
  return c ? r6(c.accumS + (c.running ? w.timeS - c.startedAt : 0)) : 0;
};

/**
 * Mueve una fracción del contenido de un recipiente a otro. El líquido y lo disuelto van con `f`; lo sólido en
 * suspensión, con `f·(homog + (1 − homog)·0,35)` (una alícuota de un lote sedimentado lleva menos sólido). Mezcla la
 * temperatura por volumen; el destino queda sin homogeneizar si recibe sólido.
 */
function moveFraction(from: EnzVessel, to: EnzVessel, f: number) {
  if (f <= 0) return;
  const k = Math.min(1, f);
  const all = k >= 1 - 1e-12;
  const ks = all ? 1 : Math.min(1, k * solidFactor(from));
  const ml = all ? from.volumeMl : from.volumeMl * k;
  if (to.volumeMl + ml > 1e-12) to.tK = (to.tK * to.volumeMl + from.tK * ml) / (to.volumeMl + ml);
  from.volumeMl = all ? 0 : r6(from.volumeMl - ml);
  to.volumeMl = r6(to.volumeMl + ml);
  let solid = false;
  for (const s of SPECIES_B05) {
    const a = from.s[s] * (SOLID_SET.has(s) ? ks : k);
    if (a === 0) continue;
    from.s[s] -= a;
    to.s[s] += a;
    if (SOLID_SET.has(s) && a > 1e-9) solid = true;
  }
  if (all) from.s = noSpecies();
  for (const t of from.tags) if (!to.tags.includes(t)) to.tags.push(t);
  if (solid) to.homog01 = Math.min(to.homog01, 0.5);
  to.mixed01 = Math.min(to.mixed01, Math.max(from.mixed01, 0.6));
  if (all) from.tags = [];
}

/** Transfiere hasta `ml`; lo que no cabe en el destino cae a la mesada (derrame). */
function transfer(w: EnzWorld, from: EnzVessel, to: EnzVessel, ml: number): { moved: number; overflow: number } {
  const take = Math.min(ml, from.volumeMl);
  if (take <= 1e-9) return { moved: 0, overflow: 0 };
  const room = Math.max(0, to.capacityMl - to.volumeMl);
  const fit = Math.min(take, room);
  const tmp = emptyVesselB05(1e9, from.tK);
  moveFraction(from, tmp, take / from.volumeMl);
  moveFraction(tmp, to, fit / take);
  const overflow = tmp.volumeMl;
  if (overflow > 1e-9) moveFraction(tmp, w.enz.vessels.spill, 1);
  return { moved: fit, overflow };
}

// ─────────────────────────── Despacho ───────────────────────────

export function dispatchEnz(w: EnzWorld, cmd: EnzCommand): EnzDispatchResult {
  if (ENZ_ONLY_TYPES.has(cmd.type)) {
    if (w.safety.stoppedByTeacher) return no('TEACHER_STOP');
    if (!w.ppe) {
      errB(w, 'E68', 'PPE_REQUIRED', 'CRITICAL');
      return no('PPE');
    }
    return enzOnly(w, cmd);
  }
  if (cmd.type === 'squeezeDropper' && (DROPPER_IDS_B05 as readonly string[]).includes(cmd.dispenserId)) {
    if (!w.ppe) {
      errB(w, 'E68', 'PPE_REQUIRED', 'CRITICAL');
      return no('PPE');
    }
    return enzDrop(w, cmd.dispenserId, cmd.targetId, !!cmd.tipContact);
  }
  if (cmd.type === 'setPose') return setPoseEnz(w, cmd.id, cmd.pose, cmd.support);
  if (cmd.type === 'acknowledge' && w.safety.block && ENZ_BLOCKS.has(w.safety.block.code)) return acknowledge(w);
  if (cmd.type === 'closeBench') return closeBench(w);
  // Secar la mesada recoge también el derrame de B05 (al contenedor de su clase) además del charco de B02.
  if (cmd.type === 'wipe' && cmd.targetId === 'bench') {
    const had = w.enz.vessels.spill.volumeMl > 0 || hasSolids(w.enz.vessels.spill);
    cleanSpill(w);
    const r = dispatchCell(w, cmd as CellCommand);
    return had && !r.ok ? ok() : r;
  }
  return dispatchCell(w, cmd as CellCommand);
}

function enzOnly(w: EnzWorld, cmd: EnzCommand): EnzDispatchResult {
  switch (cmd.type) {
    case 'tare': {
      if (cmd.balanceId !== 'bal') return no('NO_OBJECT');
      w.enz.balance = { tareG: grossMass(w), tared: true };
      flagB(w, 'balanceTared');
      return ok();
    }
    case 'scoop': return scoop(w, cmd.toolId, cmd.sourceId, cmd.massG);
    case 'transferSolid': return transferSolid(w, cmd.fromId, cmd.toId);
    case 'cutTissue': return cutTissue(w, cmd.sourceId, cmd.toolId, cmd.massG);
    case 'mince': {
      const b = w.enz.board;
      if (!b) return no('NOTHING');
      if (cmd.toolId !== 'ls') return no('BAD_TOOL');
      b.pieces = Math.min(4096, b.pieces * 2 ** clamp(Math.round(cmd.strokes), 0, 6));
      b.sizeCm = r6(2 / Math.cbrt(b.pieces));
      return ok({ value: b.sizeCm });
    }
    case 'insertStirBar': {
      if (!(cmd.barId in w.enz.bars)) return no('NO_OBJECT');
      const v = vesselOf(w, cmd.vesselId);
      if (!v || !(BEAKER_IDS_B05 as readonly string[]).includes(cmd.vesselId)) return no('BAD_TARGET');
      if (Object.values(w.enz.bars).includes(cmd.vesselId)) return no('SLOT_BUSY');
      w.enz.bars[cmd.barId] = cmd.vesselId;
      const b = batchOf(w, cmd.vesselId);
      if (b) flagB(w, `bar:${b.id}`);
      return ok();
    }
    case 'removeStirBar':
      if (!w.enz.bars[cmd.barId]) return no('NOTHING');
      w.enz.bars[cmd.barId] = null;
      return ok();
    case 'setStir': {
      const p = w.enz.plates[cmd.plateId];
      if (!p) return no('NO_OBJECT');
      p.rpm = clamp(Math.round(cmd.rpm), 0, 2000);
      return ok();
    }
    case 'setHeat': {
      const p = w.enz.plates[cmd.plateId];
      if (!p) return no('NO_OBJECT');
      p.heatOn = cmd.on;
      if (cmd.setpointK !== undefined) p.setK = clamp(cmd.setpointK, 293.15, 573.15);
      return ok();
    }
    case 'startPour': return startPour(w, cmd.sourceId, cmd.targetId, cmd.tiltDeg);
    case 'stopPour':
      if (!w.enz.pours[cmd.sourceId]) return no('NOT_POURING');
      delete w.enz.pours[cmd.sourceId];
      return ok();
    case 'aspirate': return aspirate(w, cmd.toolId, cmd.sourceId, cmd.volumeMl, cmd.speed01 ?? 0.4);
    case 'dispense': return dispense(w, cmd.toolId, cmd.targetId);
    case 'rinseTool': return rinseTool(w, cmd.toolId);
    case 'labelTube': {
      const t = tubeOf(w, cmd.tubeId);
      if (!t) return no('NO_OBJECT');
      t.label = cmd.label.trim().slice(0, 24) || null;
      for (const id of ['bk1', 'bk2', 'bk3']) void id;
      return ok();
    }
    case 'shake': return shake(w, cmd.targetId, cmd.strength01);
    case 'stopperTube': {
      const t = tubeOf(w, cmd.tubeId);
      if (!t) return no('NO_OBJECT');
      t.stoppered = cmd.closed;
      if (!cmd.closed) releaseTrapped(w, cmd.tubeId);
      return ok();
    }
    case 'setCollector': return setCollector(w, cmd.tubeId, cmd.seal01 ?? 1);
    case 'setStopcock':
      w.enz.collector.stopcockOpen = cmd.open;
      if (cmd.open && w.enz.collector.tubeId) releaseTrapped(w, w.enz.collector.tubeId, true);
      return ok();
    case 'resetCollector': {
      const c = w.enz.collector;
      w.enz.o2.vented += c.gasMmol;
      c.gasMmol = 0;
      return ok();
    }
    case 'tongs': return tongs(w, cmd.tubeId, cmd.to, cmd.depth01 ?? 1);
    case 'setBath': return setBath(w, cmd.bathId, cmd.on, cmd.setpointK);
    case 'dipStrip': return dipStrip(w, cmd.targetId, !!cmd.reuse);
    case 'clock': {
      const c = w.enz.clocks[cmd.clockId];
      if (!c) return no('NO_OBJECT');
      if (cmd.action === 'start' && !c.running) {
        c.running = true;
        c.startedAt = w.timeS;
        if (cmd.clockId === 'sw1') checkLateClock(w);
      } else if (cmd.action === 'stop' && c.running) {
        c.accumS = clockS(w, cmd.clockId);
        c.running = false;
      } else if (cmd.action === 'reset') {
        c.accumS = 0;
        c.startedAt = w.timeS;
      }
      return ok({ value: clockS(w, cmd.clockId) });
    }
    case 'readInstrument': return read(w, cmd.instrument, cmd.targetId, cmd.eyeDeg ?? 0);
    case 'discardLiquid': return discardLiquid(w, cmd.vesselId, cmd.wasteId);
    case 'rinseVessel': {
      const v = vesselOf(w, cmd.vesselId);
      if (!v) return no('NO_OBJECT');
      if (v.volumeMl > 0.3) return no('EMPTY_FIRST');
      moveFraction(v, w.enz.vessels.wAq, 1);
      v.tags = [];
      const t = tubeOf(w, cmd.vesselId);
      if (t) t.film = false;
      return ok();
    }
    case 'setUVBlank': {
      if (!w.enz.adhEnabled) return no('UNAUTHORIZED_ADH');
      const v = vesselOf(w, cmd.cuvetteId);
      if (!v || !isCuvette(cmd.cuvetteId)) return no('BAD_TARGET');
      if (cmd.cuvetteId === 'cp') {
        errB(w, 'H03', 'UV_CUVETTE', 'WARN', { obj: cmd.cuvetteId });
        return no('UV_CUVETTE');
      }
      if (v.volumeMl < 0.5) return no('EMPTY');
      w.enz.uv = { blankA: rawA340(w, cmd.cuvetteId), blankCuvette: cmd.cuvetteId };
      flagB(w, 'uvBlank');
      return ok({ value: w.enz.uv.blankA ?? 0 });
    }
    case 'setBurner': {
      if (!cmd.on) {
        w.enz.burnerLit = false;
        return ok();
      }
      // Etanol cerca de la llama (S01): la ignición se impide y queda la banda roja.
      const eth = w.objects.eth;
      if (eth && eth.support !== 'wAq' && Math.hypot(eth.pose.x - BURNER_POS_B05.x, eth.pose.y - BURNER_POS_B05.y) < ep(w).ignitionDistanceCm) {
        errB(w, 'S01', 'IGNITION_RISK', 'CRITICAL', { obj: 'bn' });
        w.safety.block = { code: 'IGNITION', since: w.timeS };
        return no('IGNITION_RISK');
      }
      w.enz.burnerLit = true;
      return ok();
    }
    case 'requestTimeScale': {
      if (cmd.x <= 1) return ok({ value: 1 });
      const busy = Object.keys(w.enz.pours).length > 0 || PIPETTE_IDS_B05.some((id) => w.enz.vessels[id].volumeMl > ep(w).pipettes[id].filmMl + 1e-6);
      if (busy) return no('TIME_LOCKED');
      return ok({ value: cmd.x });
    }
    default:
      return no('UNKNOWN');
  }
}

function acknowledge(w: EnzWorld): EnzDispatchResult {
  const code = w.safety.block!.code;
  if (code === 'PRESSURE' && Object.values(w.enz.o2.trapped).some((x) => x > 1e-6)) return no('PRESSURE');
  if (code === 'IGNITION' && w.enz.burnerLit) return no('IGNITION');
  w.safety.block = null;
  emitB(w, 'BLOCK_CLEARED', 'INFO');
  return ok();
}

// ─────────────────────────── Sólidos: polvos e hígado ───────────────────────────

const grossMass = (w: EnzWorld) => {
  if (w.objects.wb?.support !== 'bal') return 0;
  const powder = Object.values(w.enz.boat).reduce((a, g) => a + g, 0);
  return BOAT_MASS_G + powder + (w.enz.boatTissue?.massG ?? 0);
};

function scoop(w: EnzWorld, toolId: string, sourceId: string, massG: number): EnzDispatchResult {
  if (toolId !== 'sp2') return no('BAD_TOOL');
  const have = w.enz.powders[sourceId];
  if (have === undefined) return no('BAD_SOURCE');
  const g = clamp(massG, 0, Math.min(have, 15));
  if (g <= 1e-6) return no('SOURCE_EMPTY');
  w.enz.powders[sourceId] = r6(have - g);
  w.enz.spatula[sourceId] = r6((w.enz.spatula[sourceId] ?? 0) + g);
  return ok({ value: r6(g) });
}

/** Polvo agregado a un recipiente: almidón como gránulos (equivalentes glucosilo) y amilasa sin disolver (U). */
function addPowder(w: EnzWorld, v: EnzVessel, vesselId: string, load: Record<string, number>) {
  for (const [src, g] of Object.entries(load)) {
    if (g <= 0) continue;
    if (src === 'jS') v.s.starchSolid += g / G_PER_MMOL_GLY;
    // Almidón con pigmento de la matriz (SC19): tiñe el Lugol sin cambiar los glucosilos.
    if (src === 'jS' && scE(w, SC_B05.PIGMENTED_STARCH)) v.s.pigment += g * 0.004;
    if (src === 'jA') v.s.amySolid += g * amylaseUPerGOf(w);
    if (!v.tags.includes(src)) v.tags.push(src);
    const b = ensureBatch(w, vesselId, src === 'jS' ? 'P1' : 'P3');
    if (b) b.solidG = r6(b.solidG + g);
  }
  v.homog01 = Math.min(v.homog01, 0.2);
}

/** Actividad por gramo del producto comercial (SC21: dilución desconocida sorteada con la semilla). */
export const amylaseUPerGOf = (w: EnzWorld) => ep(w).activity.amylaseUPerG;

function transferSolid(w: EnzWorld, fromId: string, toId: string): EnzDispatchResult {
  const target = vesselOf(w, toId);
  if (fromId === 'sp2') {
    const load = { ...w.enz.spatula };
    if (!Object.values(load).some((g) => g > 1e-9)) return no('NOTHING');
    // Un poco de polvo queda en la espátula (se arrastra al siguiente uso si no se limpia).
    const keep = 0.01;
    for (const k of Object.keys(load)) {
      w.enz.spatula[k] = r6(load[k] * keep);
      load[k] = r6(load[k] * (1 - keep));
    }
    if (toId === 'wb') {
      if (w.objects.wb?.support !== 'bal') return no('BOAT_OFF_BALANCE');
      for (const [k, g] of Object.entries(load)) w.enz.boat[k] = r6((w.enz.boat[k] ?? 0) + g);
      return ok();
    }
    if (!target || !(BEAKER_IDS_B05 as readonly string[]).includes(toId)) {
      spillPowder(w, load);
      return ok({ value: 0 });
    }
    addPowder(w, target, toId, load);
    return ok();
  }
  if (fromId === 'wb') {
    if (!target) return no('BAD_TARGET');
    const load = { ...w.enz.boat };
    const tissue = w.enz.boatTissue;
    if (!Object.values(load).some((g) => g > 1e-9) && !tissue) return no('NOTHING');
    // Polvo adherido al bote: pérdida real que queda registrada (§5 P1-3).
    for (const k of Object.keys(load)) {
      w.enz.boat[k] = r6(load[k] * 0.005);
      load[k] = r6(load[k] * 0.995);
    }
    addPowder(w, target, toId, load);
    if (tissue) {
      addTissue(w, target, toId, tissue, w.enz.board?.sizeCm ?? null);
      w.enz.boatTissue = null;
    }
    return ok();
  }
  if (fromId === 'bdL') {
    const b = w.enz.board;
    if (!b) return no('NOTHING');
    if (toId === 'wb') {
      if (w.objects.wb?.support !== 'bal') return no('BOAT_OFF_BALANCE');
      if (w.enz.boatTissue) return no('SLOT_BUSY');
      w.enz.boatTissue = { sourceId: b.sourceId, massG: b.massG, catU: b.catU, catDenU: b.catDenU };
      w.enz.board = { ...b, massG: 0, catU: 0, catDenU: 0 };
      return ok();
    }
    if (!target) return no('BAD_TARGET');
    addTissue(w, target, toId, b, b.sizeCm);
    w.enz.board = { ...b, massG: 0, catU: 0, catDenU: 0 };
    return ok();
  }
  return no('BAD_SOURCE');
}

function spillPowder(w: EnzWorld, load: Record<string, number>) {
  const s = w.enz.vessels.spill;
  addPowderRaw(w, s, load);
  latchB(w, 'powderSpill', 'POWDER_SPILLED', 'WARN');
}
const addPowderRaw = (w: EnzWorld, v: EnzVessel, load: Record<string, number>) => {
  for (const [src, g] of Object.entries(load)) {
    if (src === 'jS') v.s.starchSolid += g / G_PER_MMOL_GLY;
    if (src === 'jA') v.s.amySolid += g * amylaseUPerGOf(w);
  }
};

function addTissue(w: EnzWorld, v: EnzVessel, vesselId: string, t: { sourceId: string; massG: number; catU: number; catDenU: number }, sizeCm: number | null) {
  if (t.massG <= 0) return;
  v.s.tissueMg += t.massG * 1000;
  v.s.catTissue += t.catU;
  v.s.catTissueDen += t.catDenU;
  if (!v.tags.includes(t.sourceId)) v.tags.push(t.sourceId);
  v.homog01 = Math.min(v.homog01, 0.2);
  const b = ensureBatch(w, vesselId, 'P2');
  if (b) {
    b.liverG = r6(b.liverG + t.massG);
    b.sizeCm = sizeCm;
  }
}

function cutTissue(w: EnzWorld, sourceId: string, toolId: string, massG: number): EnzDispatchResult {
  if (toolId !== 'ls') return no('BAD_TOOL');
  const src = w.enz.liver[sourceId];
  if (!src) return no('BAD_SOURCE');
  if (w.enz.board && w.enz.board.massG > 1e-6 && w.enz.board.sourceId !== sourceId) return no('BOARD_BUSY');
  const g = clamp(massG, 0, src.massG);
  if (g <= 1e-6) return no('SOURCE_EMPTY');
  const f = g / src.massG;
  const cu = src.catU * f;
  const cd = src.catDenU * f;
  src.massG = r6(src.massG - g);
  src.catU -= cu;
  src.catDenU -= cd;
  const b = w.enz.board;
  if (b && b.massG > 1e-6) {
    b.massG = r6(b.massG + g);
    b.catU += cu;
    b.catDenU += cd;
  } else w.enz.board = { sourceId, massG: r6(g), catU: cu, catDenU: cd, pieces: 1, sizeCm: 2 };
  return ok({ value: r6(g) });
}

// ─────────────────────────── Lotes P1–P3 ───────────────────────────

function ensureBatch(w: EnzWorld, vesselId: string, id: 'P1' | 'P2' | 'P3'): PrepBatch | null {
  const cur = w.enz.batches[id];
  if (cur) return cur.vesselId === vesselId ? cur : null;
  if (!(BEAKER_IDS_B05 as readonly string[]).includes(vesselId)) return null;
  const b: PrepBatch = {
    id, vesselId, waterMl: 0, solidG: 0, liverG: 0, stirredS: 0, heatedS: 0, maxTK: w.enz.vessels[vesselId].tK, measuredTK: null, slipS: 0, splashMl: 0,
    labeled: false, firstAliquotAt: null, sizeCm: null, contaminated: false,
  };
  w.enz.batches[id] = b;
  return b;
}

export const batchOf = (w: EnzWorld, vesselId: string): PrepBatch | null => Object.values(w.enz.batches).find((b) => b?.vesselId === vesselId) ?? null;

/** Primera alícuota de un lote: se congela el agua real y se verifican las cantidades y la técnica (PREP01–PREP09). */
function batchAliquot(w: EnzWorld, vesselId: string) {
  const b = batchOf(w, vesselId);
  if (!b) return;
  const p = ep(w).prep;
  const v = w.enz.vessels[vesselId];
  if (b.firstAliquotAt === null) {
    b.firstAliquotAt = w.timeS;
    b.waterMl = r6(v.volumeMl + b.splashMl);
    const stirred = b.stirredS >= p.minStirS;
    if (b.id === 'P1') {
      if (Math.abs(b.solidG - p.starchG) > p.tolG) errB(w, 'PREP01', 'STARCH_MASS', 'WARN', { obj: vesselId });
      if (Math.abs(b.waterMl - p.starchWaterMl) > p.tolMl) errB(w, 'PREP02', 'STARCH_WATER', 'WARN', { obj: vesselId });
      if (!stirred) errB(w, 'PREP03', 'STARCH_NOT_STIRRED', 'WARN', { obj: vesselId });
      if (b.measuredTK === null || Math.abs(b.measuredTK - p.starchTargetK) > p.tolK) errB(w, 'PREP04', 'STARCH_TEMP', 'WARN', { obj: vesselId });
    }
    if (b.id === 'P2') {
      if ((b.sizeCm ?? 2) > p.liverMaxCm || !stirred) errB(w, 'PREP06', 'LIVER_COARSE', 'WARN', { obj: vesselId });
      if (Math.abs(b.waterMl - p.catalaseWaterMl) > 1 || b.heatedS > 0) errB(w, 'PREP07', 'LIVER_WATER_HEAT', 'WARN', { obj: vesselId });
    }
    if (b.id === 'P3') {
      if (Math.abs(b.solidG - p.amylaseG) > p.amylaseTolG) errB(w, 'PREP08', 'AMYLASE_MASS', 'WARN', { obj: vesselId });
      b.contaminated = v.s.starch + v.s.starchSolid > 0.01;
      if (Math.abs(b.waterMl - p.amylaseWaterMl) > p.amylaseTolMl || !stirred || b.contaminated) errB(w, 'PREP09', 'AMYLASE_PREP', 'WARN', { obj: vesselId });
    }
    flagB(w, `batch:${b.id}:aliquot`);
    return;
  }
  // Lote ya preparado que sedimentó y se toma sin volver a agitar (M06).
  if (hasSolids(v) && v.homog01 < p.homogReady && !stirringNow(w, vesselId)) errB(w, 'M06', 'NOT_HOMOGENEOUS', 'WARN', { obj: vesselId });
}

/** Placa donde está apoyado un recipiente (o null). */
const plateOf = (w: EnzWorld, vesselId: string) => {
  const s = w.objects[vesselId]?.support;
  return s && (PLATE_IDS_B05 as readonly string[]).includes(s) ? s : null;
};
/** Agitación efectiva (0–1) de un recipiente: pastilla dentro, sobre una placa con rpm, sin deslizar. */
function stirOf(w: EnzWorld, vesselId: string): { stir01: number; slipping: boolean } {
  const plate = plateOf(w, vesselId);
  if (!plate || !Object.values(w.enz.bars).includes(vesselId)) return { stir01: 0, slipping: false };
  const pl = w.enz.plates[plate];
  if (pl.rpm <= 0) return { stir01: 0, slipping: false };
  const p = ep(w).prep;
  const v = w.enz.vessels[vesselId];
  const viscous = v.volumeMl > 1e-6 && (v.s.starchSolid + v.s.starch) / v.volumeMl > 0.5;
  const slip = viscous ? p.slipRpmViscous : p.slipRpmWater;
  if (pl.rpm > slip) return { stir01: 0.25, slipping: true };
  return { stir01: Math.min(1, pl.rpm / p.rpmFull), slipping: false };
}
const stirringNow = (w: EnzWorld, vesselId: string) => stirOf(w, vesselId).stir01 > 0.05;

// ─────────────────────────── Vertido, pipetas, goteros ───────────────────────────

const POUR_SOURCES = new Set<string>(['bW', 'hp', 'hpOld', 'st1', 'naoh', ...ADH_BOTTLES, ...CYLINDER_IDS_B05, ...BEAKER_IDS_B05]);

function adhGate(w: EnzWorld, id: string): EnzDispatchResult | null {
  if (!isAdhId(id) || w.enz.adhEnabled) return null;
  if (id === 'meth') {
    errB(w, 'S02', 'RESTRICTED_METHANOL', 'CRITICAL', { obj: id });
    w.safety.block = { code: 'METHANOL', since: w.timeS };
    return no('RESTRICTED_METHANOL');
  }
  return no('UNAUTHORIZED_ADH');
}

function startPour(w: EnzWorld, sourceId: string, targetId: string, tiltDeg: number): EnzDispatchResult {
  if (!POUR_SOURCES.has(sourceId)) return no('BAD_SOURCE');
  const gate = adhGate(w, sourceId) ?? adhGate(w, targetId);
  if (gate) return gate;
  // Solución cáustica directamente del frasco madre (S07): se exige el gotero.
  if (sourceId === 'naoh') {
    errB(w, 'S07', 'CAUSTIC_DIRECT', 'CRITICAL', { obj: sourceId });
    w.safety.block = { code: 'CAUSTIC', since: w.timeS };
    return no('USE_DROPPER');
  }
  const src = vesselOf(w, sourceId);
  if (!src || src.volumeMl <= 1e-6) return no('SOURCE_EMPTY');
  if (sourceId === targetId) return no('BAD_TARGET');
  // El mismo chorro con otra inclinación (la mano afina el caudal): no es una nueva toma ni una nueva dosis.
  const cur = w.enz.pours[sourceId];
  if (cur && cur.targetId === targetId) {
    cur.tiltDeg = clamp(tiltDeg, 0, 120);
    return ok();
  }
  // Probeta para un volumen de tubo (M04): la resolución de la probeta no alcanza.
  if ((CYLINDER_IDS_B05 as readonly string[]).includes(sourceId) && isTube(targetId)) errB(w, 'M04', 'CYLINDER_FOR_PIPETTE', 'WARN', { obj: sourceId });
  if ((BEAKER_IDS_B05 as readonly string[]).includes(sourceId)) batchAliquot(w, sourceId);
  if (isTube(targetId) && src.s.h2o2 > 1e-6) noteH2O2Dose(w, targetId);
  w.enz.pours[sourceId] = { targetId, tiltDeg: clamp(tiltDeg, 0, 120) };
  return ok();
}

function pourRate(w: EnzWorld, tiltDeg: number) {
  const p = ep(w);
  const k = clamp((tiltDeg - p.pourMinTiltDeg) / (90 - p.pourMinTiltDeg), 0, 1);
  return p.pourMaxMlS * k ** 1.5;
}

function aspirate(w: EnzWorld, toolId: string, sourceId: string, volumeMl: number, speed01: number): EnzDispatchResult {
  if (!isPipette(toolId)) return no('BAD_TOOL');
  const gate = adhGate(w, sourceId);
  if (gate) return gate;
  const p = ep(w);
  const pv = w.enz.vessels[toolId];
  const pip = w.enz.pipettes[toolId];
  const src = vesselOf(w, sourceId);
  if (!src || isPipette(sourceId) || sourceId === 'spill' || (WASTE_IDS_B05 as readonly string[]).includes(sourceId)) return no('BAD_SOURCE');
  if (src.volumeMl <= 1e-6) return no('SOURCE_EMPTY');
  const cap = p.pipettes[toolId];
  if (pv.volumeMl > cap.filmMl + 1e-6 && pip.from !== sourceId) return no('TOOL_BUSY');
  let want = clamp(volumeMl, 0, cap.capMl - pv.volumeMl);
  if (want <= 1e-6) return no('TOOL_FULL');
  // Película de otro recipiente en la pipeta sin enjuagar: la nueva toma se contamina (M10).
  if (pip.residueFrom && pip.residueFrom !== sourceId && pv.volumeMl > 1e-9 && pv.tags.some((t) => !src.tags.includes(t))) errB(w, 'M10', 'VESSEL_RESIDUE', 'WARN', { obj: toolId });
  // Émbolo brusco (M05) o burbuja inicial de la pipeta (SC13): entra aire y la alícuota es menor.
  if (speed01 > 0.8) {
    want *= 1 - p.bubbleLoss;
    errB(w, 'M05', 'PIPETTE_BUBBLE', 'WARN', { obj: toolId });
  } else if (pip.bubble) {
    want *= 1 - p.bubbleLoss;
    pip.bubble = false;
    incident(w, 'SC13:bubble');
  }
  const st = tubeOf(w, sourceId);
  if (st) aliquotChecks(w, sourceId, st);
  if ((BEAKER_IDS_B05 as readonly string[]).includes(sourceId)) batchAliquot(w, sourceId);
  const r = transfer(w, src, pv, want);
  pip.from = sourceId;
  pip.residueFrom = sourceId;
  emitB(w, 'ASPIRATED', 'INFO', { obj: sourceId });
  return ok({ value: r6(r.moved) });
}

/** Retiro de una alícuota de un tubo: mezcla en reacción (C16) o incubación de amilasa (A01, A02, A09). */
function aliquotChecks(w: EnzWorld, tubeId: string, t: EnzTube) {
  const v = w.enz.vessels[tubeId];
  if (t.reactionAt !== null && (t.catAtStart ?? 0) > 0 && v.s.h2o2 > 1e-4 && w.timeS - t.reactionAt < ep(w).catalaseObservationS * 2) errB(w, 'C16', 'REACTION_DISTURBED', 'WARN', { obj: tubeId });
  const amyTube = t.label === 'amy' || amylaseOf(v.s) > 1e-9;
  if (amyTube && t.aliquotOf === null) {
    if (glucosylOf(v.s) <= 1e-9) errB(w, 'A02', 'NO_STARCH', 'WARN', { obj: tubeId });
    else if (t.label === 'amy' && amylaseOf(v.s) <= 1e-9) errB(w, 'A01', 'NO_AMYLASE', 'WARN', { obj: tubeId });
    if (t.contactAt !== null && hasSolids(v) && v.homog01 < 0.6) errB(w, 'A09', 'NOT_MIXED', 'WARN', { obj: tubeId });
  }
}

function dispense(w: EnzWorld, toolId: string, targetId: string): EnzDispatchResult {
  if (!isPipette(toolId)) return no('BAD_TOOL');
  const gate = adhGate(w, targetId);
  if (gate) return gate;
  const p = ep(w);
  const pv = w.enz.vessels[toolId];
  const dose = pv.volumeMl - p.pipettes[toolId].filmMl;
  if (dose <= 1e-6) return no('TOOL_EMPTY');
  const target = vesselOf(w, targetId);
  const from = w.enz.pipettes[toolId].from ?? '';
  if (!target || isPipette(targetId)) {
    spillFrom(w, pv, dose, toolId);
    return ok({ value: 0 });
  }
  const before = beforeDelivery(w, targetId, pv);
  if (pv.s.h2o2 > 1e-6 && isTube(targetId)) noteH2O2Dose(w, targetId);
  const r = transfer(w, pv, target, dose);
  delivered(w, from, targetId, r.moved, r.overflow, before);
  emitB(w, 'DISPENSED', 'INFO', { obj: targetId });
  return ok({ value: r6(r.moved) });
}

/** Líquido fuera de un recipiente: a la mesada (M08; con extracto, C12). */
function spillFrom(w: EnzWorld, v: EnzVessel, ml: number, obj: string) {
  const enzyme = catalaseOf(v.s) > 1e-9;
  transfer(w, v, w.enz.vessels.spill, ml);
  if (enzyme) errB(w, 'C12', 'EXTRACT_SPILLED', 'WARN', { obj });
  else errB(w, 'M08', 'POURED_OUTSIDE', 'WARN', { obj });
}

function rinseTool(w: EnzWorld, toolId: string): EnzDispatchResult {
  if (toolId === 'sp2' || toolId === 'wb') {
    // Espátula o bote de pesaje: el polvo adherido se lava a los residuos acuosos.
    const store = toolId === 'sp2' ? 'spatula' : 'boat';
    addPowderRaw(w, w.enz.vessels.wAq, { ...w.enz[store] });
    w.enz[store] = {};
    return ok();
  }
  if (!isPipette(toolId)) return no('BAD_TOOL');
  const pv = w.enz.vessels[toolId];
  if (pv.volumeMl > ep(w).pipettes[toolId].filmMl + 1e-6) return no('EMPTY_FIRST');
  moveFraction(pv, w.enz.vessels.rb, 1);
  w.enz.pipettes[toolId] = { from: null, residueFrom: null, bubble: false };
  flagB(w, 'pipetteRinsed');
  return ok();
}

interface Before { h2o2: number; cat: number; amy: number; gly: number; film: boolean; empty: boolean }
function beforeDelivery(w: EnzWorld, targetId: string, src: EnzVessel): Before {
  const v = w.enz.vessels[targetId];
  const t = tubeOf(w, targetId);
  void src;
  return { h2o2: v.s.h2o2, cat: catalaseOf(v.s), amy: amylaseOf(v.s), gly: glucosylOf(v.s), film: !!t?.film, empty: v.volumeMl < 0.01 };
}

function noteH2O2Dose(w: EnzWorld, tubeId: string) {
  const t = tubeOf(w, tubeId)!;
  t.h2o2Adds += 1;
  // Segunda dosis de peróxido en el mismo tubo (C11): más sustrato que el previsto.
  if (t.h2o2Adds >= 2 && t.reactionAt !== null) errB(w, 'C11', 'EXTRA_PEROXIDE', 'WARN', { obj: tubeId });
}

/** Hechos de una entrega a un recipiente: inicio de catálisis, contacto amilasa–almidón, alícuotas, película. */
function delivered(w: EnzWorld, fromId: string, targetId: string, moved: number, overflow: number, b: Before) {
  if (overflow > 0.01) latchB(w, `overflow:${targetId}`, 'OVERFILL', 'WARN', { obj: targetId });
  if (moved <= 1e-9) return;
  const t = tubeOf(w, targetId);
  const v = w.enz.vessels[targetId];
  if (b.film && b.empty) errB(w, 'M10', 'VESSEL_RESIDUE', 'WARN', { obj: targetId });
  if (!t) return;
  t.discarded = false;
  t.film = false;
  t.sources.push(fromId);
  // Alícuota de una incubación de amilasa: momento real desde el contacto y lectura del cronómetro 2.
  const src = tubeOf(w, fromId.split('@')[0]);
  const srcId = fromId;
  if (src && src.contactAt !== null && t.aliquotOf === null) {
    const p = ep(w);
    t.aliquotOf = srcId;
    t.sampledAfterS = r6(w.timeS - src.contactAt);
    t.sampledClockS = clockS(w, 'sw2');
    t.aliquotMl = r6(moved);
    t.sources[t.sources.length - 1] = `${srcId}@${Math.round(t.sampledAfterS)}`;
    const siblings = TUBE_IDS_B05.map((id) => w.enz.tubes[id]).filter((x) => x !== t && x.aliquotOf === srcId);
    if (!siblings.length && t.sampledAfterS > p.samplingTolS + p.amylaseSamplingS[0]) errB(w, 'A05', 'LATE_FIRST_ALIQUOT', 'WARN', { obj: targetId });
    const first = siblings.find((x) => x.aliquotMl > 0);
    if (first && Math.abs(moved - first.aliquotMl) > 0.1 * first.aliquotMl) errB(w, 'A06', 'ALIQUOT_VOLUMES', 'WARN', { obj: targetId });
    flagB(w, `aliquot:${srcId}`);
  }
  // Catálisis: el peróxido y la catalasa se encuentran en el tubo (o el peróxido entra en un blanco).
  const cat = catalaseOf(v.s);
  if (v.s.h2o2 > 1e-6 && (t.reactionAt === null || ((t.catAtStart ?? 0) <= 1e-9 && cat > 1e-9))) startReaction(w, targetId, t, v);
  // Amilasa en contacto con el almidón: inicio de la hidrólisis.
  if (t.contactAt === null && t.aliquotOf === null && amylaseOf(v.s) > 1e-9 && glucosylOf(v.s) > 1e-9) {
    t.contactAt = w.timeS;
    t.glyAtContact = r6(glucosylOf(v.s));
    const c = w.enz.clocks.sw2;
    if (c.running && clockS(w, 'sw2') > 5) errB(w, 'A04', 'CLOCK_EARLY', 'WARN', { obj: targetId });
    if (v.tags.includes('st1')) errB(w, 'A03', 'STARCH_CONCENTRATION', 'WARN', { obj: targetId });
    if (t.bath && !bathStable(w, t.bath.id)) errB(w, 'T01', 'BATH_UNSTABLE', 'WARN', { obj: targetId });
    if (v.mixed01 < 0.6 && t.drops.acid + t.drops.base > 0) errB(w, 'T09', 'PH_NOT_MIXED', 'WARN', { obj: targetId });
    flagB(w, `contact:${targetId}`);
  }
  // Agua del gotero/frasco sobre una mezcla de ensayo ya armada (M09) se evalúa en el gotero.
}

function startReaction(w: EnzWorld, tubeId: string, t: EnzTube, v: EnzVessel) {
  t.reactionAt = w.timeS;
  t.catAtStart = r6(catalaseOf(v.s));
  t.tissueAtStartMg = r6(v.s.tissueMg);
  t.tSum = 0;
  t.tN = 0;
  t.shakes = [];
  if (t.catAtStart <= 1e-9) return;
  const c = w.enz.collector;
  if (c.tubeId !== tubeId) errB(w, 'C06', 'COLLECTOR_DISCONNECTED', 'WARN', { obj: tubeId });
  if (!w.enz.clocks.sw1.running) w.enz.pending.c05 = { tubeId, at: w.timeS };
  if (t.bath && !bathStable(w, t.bath.id)) errB(w, 'T01', 'BATH_UNSTABLE', 'WARN', { obj: tubeId });
  if (v.mixed01 < 0.6 && t.drops.acid + t.drops.base > 0) errB(w, 'T09', 'PH_NOT_MIXED', 'WARN', { obj: tubeId });
  if (v.tags.includes('livB')) errB(w, 'C02', 'OTHER_LOT', 'WARN', { obj: tubeId });
  if (v.tags.includes('livH')) errB(w, 'C03', 'PREHEATED_TISSUE', 'WARN', { obj: tubeId });
  if (v.tags.includes('hpOld')) errB(w, 'C04', 'OLD_PEROXIDE', 'WARN', { obj: tubeId });
  // Menos tejido que la línea base en un tubo comparado (C01).
  const base = TUBE_IDS_B05.map((id) => w.enz.tubes[id]).find((x) => x.label === 'cat-base' && x !== t && (x.tissueAtStartMg ?? 0) > 0);
  if (base && t.label !== 'cat-base' && t.label !== 'cat-blank' && (t.tissueAtStartMg ?? 0) < 0.85 * base.tissueAtStartMg!) errB(w, 'C01', 'LESS_TISSUE', 'WARN', { obj: tubeId });
  if (base && t.label === 'cat-base' && (base.tissueAtStartMg ?? 0) < 0.85 * (t.tissueAtStartMg ?? 0)) void 0;
  flagB(w, `reaction:${tubeId}`);
}

/** Peróxido agregado con el cronómetro detenido: si se inicia más de 2 s después, la curva pierde su tramo inicial (C05). */
function checkLateClock(w: EnzWorld) {
  const pc = w.enz.pending.c05;
  if (!pc) return;
  if (w.timeS - pc.at > 2) errB(w, 'C05', 'CLOCK_LATE', 'WARN', { obj: pc.tubeId });
  w.enz.pending.c05 = null;
}

/** Gotero de B05 sobre un tubo (o un recipiente): Lugol, Benedict, HCl, NaOH o agua. */
function enzDrop(w: EnzWorld, dropperId: string, targetId: string, tipContact: boolean): EnzDispatchResult {
  const p = ep(w);
  const d = w.enz.vessels[dropperId];
  const target = vesselOf(w, targetId);
  const ml = dropperId === 'dB' ? p.benedict.squeezeMl : dropperId === 'dw2' ? 0.5 : p.dropMl;
  if (d.volumeMl < ml * 0.5) return no('DROPPER_EMPTY');
  if (!target) {
    spillFrom(w, d, ml, dropperId);
    return ok({ value: 0 });
  }
  const t = tubeOf(w, targetId);
  // Punta contaminada en un tubo anterior (M07): arrastra parte de aquel contenido.
  const tip = w.enz.dropperTip[dropperId];
  if (tip && tip !== targetId) {
    const prev = vesselOf(w, tip);
    if (prev && prev.volumeMl > 0.01) transfer(w, prev, target, Math.min(0.01, prev.volumeMl));
    errB(w, 'M07', 'DROPPER_CONTAMINATED', 'WARN', { obj: dropperId });
    w.enz.dropperTip[dropperId] = null;
  }
  if (tipContact && target.volumeMl > 0.05) w.enz.dropperTip[dropperId] = targetId;
  if (t) {
    const v = target;
    const assayed = v.s.iodine > 1e-9 || v.s.cu > 1e-9 || (t.reactionAt !== null && (t.catAtStart ?? 0) > 0) || t.contactAt !== null;
    if (dropperId === 'dw2' && assayed) errB(w, 'M09', 'WRONG_DROPPER', 'WARN', { obj: targetId });
    if (dropperId === 'dL') {
      t.drops.lugol += 1;
      if (t.drops.benedict > 0) errB(w, 'A07', 'SAME_TUBE_ASSAYS', 'WARN', { obj: targetId });
    }
    if (dropperId === 'dB') {
      t.drops.benedict += 1;
      if (t.drops.lugol > 0) errB(w, 'A07', 'SAME_TUBE_ASSAYS', 'WARN', { obj: targetId });
      // Benedict en la mezcla de incubación (no en una alícuota): consume el poder reductor de todo el lote (T12).
      if (t.contactAt !== null && t.aliquotOf === null) errB(w, 'T12', 'BENEDICT_PREMATURE', 'WARN', { obj: targetId });
    }
    if (dropperId === 'dH') {
      t.drops.acid += 1;
      if (!ACID_LABELS.has(t.label ?? '') || t.drops.acid > p.acidDropsAssigned + 1) errB(w, 'T06', 'EXCESS_ACID', 'WARN', { obj: targetId });
    }
    if (dropperId === 'dN') {
      t.drops.base += 1;
      if (!BASE_LABELS.has(t.label ?? '') || t.drops.base > p.baseDropsAssigned + 1) errB(w, 'T07', 'EXCESS_BASE', 'WARN', { obj: targetId });
    }
    if (dropperId === 'dw2') t.drops.water += 1;
  }
  const before = beforeDelivery(w, targetId, d);
  const r = transfer(w, d, target, ml);
  if (dropperId === 'dH' || dropperId === 'dN') target.mixed01 = 0.2;
  delivered(w, dropperId, targetId, r.moved, r.overflow, before);
  return ok({ value: r6(r.moved) });
}

function shake(w: EnzWorld, targetId: string, strength01: number): EnzDispatchResult {
  const v = vesselOf(w, targetId);
  if (!v) return no('NO_OBJECT');
  const s = clamp(strength01, 0, 1);
  const t = tubeOf(w, targetId);
  // Tubo sobrellenado agitado con fuerza (S04): se derrama parte de la muestra.
  if (s > 0.6 && v.volumeMl > 0.85 * v.capacityMl) {
    transfer(w, v, w.enz.vessels.spill, v.volumeMl * 0.15);
    errB(w, 'S04', 'SHAKE_OVERFILLED', 'WARN', { obj: targetId });
  }
  if (s >= 0.2) {
    v.homog01 = Math.max(v.homog01, 0.6 + 0.4 * s);
    v.mixed01 = 1;
  }
  // El agitado libera el O₂ sobresaturado; la fuerza importa en la comparación (C09).
  const sat = ep(w).o2SatMmolMl * v.volumeMl;
  const excess = Math.max(0, v.s.o2 - sat) * s;
  if (excess > 0) {
    v.s.o2 -= excess;
    routeGas(w, targetId, excess);
  }
  if (t && t.reactionAt !== null && (t.catAtStart ?? 0) > 0 && w.timeS - t.reactionAt < ep(w).catalaseObservationS * 1.5) {
    t.shakes.push(r6(s));
    const strengths = TUBE_IDS_B05.map((id) => w.enz.tubes[id]).filter((x) => x.reactionAt !== null && (x.catAtStart ?? 0) > 0 && x.shakes.length).map((x) => Math.max(...x.shakes));
    if (strengths.length >= 2 && Math.max(...strengths) - Math.min(...strengths) > 0.3) errB(w, 'C09', 'UNEQUAL_SHAKING', 'WARN', { obj: targetId });
  }
  return ok();
}

// ─────────────────────────── Colector, tapón y presión ───────────────────────────

function setCollector(w: EnzWorld, tubeId: string | null, seal01: number): EnzDispatchResult {
  const c = w.enz.collector;
  if (tubeId === null) {
    c.tubeId = null;
    c.connectedAt = null;
    return ok();
  }
  if (!tubeOf(w, tubeId)) return no('BAD_TARGET');
  c.tubeId = tubeId;
  c.seal01 = clamp(seal01, 0, 1);
  c.connectedAt = w.timeS;
  // Unión floja (C07): una fracción del gas escapa por la junta.
  if (c.seal01 < ep(w).collector.sealOk) errB(w, 'C07', 'COLLECTOR_LEAK', 'WARN', { obj: tubeId });
  flagB(w, `collector:${tubeId}`);
  return ok();
}

/** Fuga total del captador: la del ajuste de la unión más la microfuga del escenario SC05. */
const leakOf = (w: EnzWorld) => clamp(1 - w.enz.collector.seal01 + (scE(w, SC_B05.COLLECTOR_LEAK) ? 0.15 : 0), 0, 1);

/** Gas libre que sale de un recipiente: al colector, atrapado bajo tapón/llave cerrada o al ambiente. */
function routeGas(w: EnzWorld, vesselId: string, gasMmol: number) {
  if (gasMmol <= 0) return;
  const c = w.enz.collector;
  const t = tubeOf(w, vesselId);
  const part = partitionO2(gasMmol, {
    dissolvedRoomMmol: 0, collector: c.tubeId === vesselId, stopcockOpen: c.stopcockOpen, stoppered: !!t?.stoppered,
    efficiency01: ep(w).collector.efficiency01, leak01: leakOf(w),
  });
  if (part.collected > 0) {
    c.gasMmol += part.collected;
    const capMmol = gasMol(ep(w).collector.capacityMl, ep(w).ambientK, ep(w).pressureKPa) * 1000;
    if (c.gasMmol > capMmol) {
      w.enz.o2.vented += c.gasMmol - capMmol;
      c.gasMmol = capMmol;
      errB(w, 'C15', 'COLLECTOR_FULL', 'WARN', { obj: vesselId });
    }
  }
  w.enz.o2.vented += part.vented;
  if (part.trapped > 0) {
    w.enz.o2.trapped[vesselId] = (w.enz.o2.trapped[vesselId] ?? 0) + part.trapped;
    if (w.enz.o2.trapped[vesselId] > ep(w).collector.reliefMmol) {
      // Sobrepresión: el alivio se abre, el gas se pierde y queda la banda roja (C10 tapón; S06 llave del colector).
      if (c.tubeId === vesselId && !c.stopcockOpen) errB(w, 'S06', 'STOPCOCK_PRESSURE', 'ALERT', { obj: vesselId });
      else errB(w, 'C10', 'STOPPER_PRESSURE', 'ALERT', { obj: vesselId });
      releaseTrapped(w, vesselId);
      w.safety.block = { code: 'PRESSURE', since: w.timeS };
    }
  }
  if (t) t.foamMl = r6(t.foamMl + gasMl(gasMmol / 1000) * 0.6 * (scE(w, SC_B05.FOAM) ? 3 : 1));
}

function releaseTrapped(w: EnzWorld, vesselId: string, toCollector = false) {
  const g = w.enz.o2.trapped[vesselId] ?? 0;
  if (g <= 0) return;
  delete w.enz.o2.trapped[vesselId];
  if (toCollector) routeGas(w, vesselId, g);
  else w.enz.o2.vented += g;
}

// ─────────────────────────── Baños, pinza, tiras ───────────────────────────

export const bathStable = (w: EnzWorld, id: string) => {
  const b = w.enz.baths[id];
  return !!b && b.on && b.stableSince !== null && w.timeS - b.stableSince >= ep(w).bath.holdS;
};

function setBath(w: EnzWorld, bathId: string, on: boolean | undefined, setK: number | undefined): EnzDispatchResult {
  const b = w.enz.baths[bathId];
  if (!b) return no('NO_OBJECT');
  if (setK !== undefined) {
    b.setK = clamp(setK, 293.15, 368.15);
    b.stableSince = null;
  }
  if (on !== undefined) {
    // Apagar con una incubación de amilasa en curso dentro del baño (T11).
    if (!on && b.on) {
      const inc = TUBE_IDS_B05.some((id) => {
        const t = w.enz.tubes[id];
        return t.bath?.id === bathId && t.contactAt !== null && t.aliquotOf === null && w.timeS - t.contactAt < ep(w).amylaseIncubationS && !t.discarded;
      });
      if (inc) errB(w, 'T11', 'BATH_OFF_EARLY', 'WARN', { obj: bathId });
    }
    b.on = on;
    b.stableSince = null;
  }
  return ok();
}

function placeInBath(w: EnzWorld, tubeId: string, bathId: string, depth01: number) {
  const t = w.enz.tubes[tubeId];
  t.bath = { id: bathId, depth01: clamp(depth01, 0, 1) };
  const v = w.enz.vessels[tubeId];
  // Inmersión parcial (T02): la mezcla queda a una temperatura intermedia.
  if (t.bath.depth01 < 0.6 && v.volumeMl > 0.1) errB(w, 'T02', 'PARTIAL_IMMERSION', 'WARN', { obj: tubeId });
  if (t.contactAt !== null && t.aliquotOf === null && w.timeS - t.contactAt < 60 && !bathStable(w, bathId)) errB(w, 'T01', 'BATH_UNSTABLE', 'WARN', { obj: tubeId });
  flagB(w, `bath:${bathId}:${tubeId}`);
}

function tongs(w: EnzWorld, tubeId: string, to: string, depth01: number): EnzDispatchResult {
  const t = tubeOf(w, tubeId);
  const o = w.objects[tubeId];
  if (!t || !o) return no('NO_OBJECT');
  // Pinza mal colocada (SC28): hay que devolverla a su lugar antes de usarla.
  if (w.objects.tg?.support === 'wb2') return no('TONGS_MISPLACED');
  if (to === 'rack') {
    const h = tubeHome(tubeId);
    o.pose = { x: h.x, y: h.y, z: h.z, rotationRad: 0 };
    o.support = tubeId <= 't8' && tubeId.length === 2 ? 'rk1' : (tubeId === 't9' || tubeId.length === 3) ? 'rk2' : 'rk1';
    o.support = (['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8'].includes(tubeId)) ? 'rk1' : 'rk2';
    t.bath = null;
    return ok();
  }
  if (!(BATH_IDS_B05 as readonly string[]).includes(to)) return no('BAD_TARGET');
  const used = TUBE_IDS_B05.filter((id) => w.enz.tubes[id].bath?.id === to && id !== tubeId).length;
  if (used >= 8) return no('SLOT_BUSY');
  const s = bathSlot(to, used);
  o.pose = { x: s.x, y: s.y, z: s.z, rotationRad: 0 };
  o.support = to;
  placeInBath(w, tubeId, to, depth01);
  return ok();
}

function dipStrip(w: EnzWorld, targetId: string, reuse: boolean): EnzDispatchResult {
  const v = vesselOf(w, targetId);
  if (!v || v.volumeMl < 0.2) return no('BAD_TARGET');
  const p = ep(w);
  const res = scE(w, SC_B05.STRIPS_COARSE) ? 2 : p.stripResolution;
  let pH = pHOf(v.s, v.volumeMl);
  let quality = 'strip';
  // Tira ya mojada en otro recipiente (T08): el color mezcla los dos y la lectura queda incierta.
  if (reuse && w.enz.strip && w.enz.strip !== targetId) {
    const prev = vesselOf(w, w.enz.strip);
    if (prev && prev.volumeMl > 0) pH = (pH + pHOf(prev.s, prev.volumeMl)) / 2;
    quality = 'interfered';
    errB(w, 'T08', 'STRIP_REUSED', 'WARN', { obj: targetId });
  }
  w.enz.strip = targetId;
  const r = addReading(w, { instrument: 'ph', targetId, value: stripPH(pH, res), unit: 'pH', quality, biased: quality === 'interfered' });
  return ok({ id: r.id, value: r.value });
}

// ─────────────────────────── Residuos ───────────────────────────

export function wasteClassOf(v: EnzVessel): 'aq' | 'cu' | 'bio' {
  if (copperOf(v.s) > 1e-9 || v.s.iodine > 1e-9) return 'cu';
  if (v.s.tissueMg > 1e-6) return 'bio';
  return 'aq';
}

function discardLiquid(w: EnzWorld, vesselId: string, wasteId: string): EnzDispatchResult {
  const v = vesselOf(w, vesselId);
  const waste = vesselOf(w, wasteId);
  if (!v || !waste || !(wasteId in WASTE_CLASS)) return no('BAD_TARGET');
  if (v.volumeMl <= 1e-6 && !hasSolids(v)) return no('EMPTY');
  if (Object.values(w.enz.bars).includes(vesselId)) return no('BAR_INSIDE');
  // Clase de residuo incompatible (S05): el descarte se rechaza y la mezcla queda en el recipiente.
  if (WASTE_CLASS[wasteId] !== wasteClassOf(v)) {
    errB(w, 'S05', 'WASTE_INCOMPATIBLE', 'ALERT', { obj: vesselId });
    return no('WASTE_INCOMPATIBLE');
  }
  const t = tubeOf(w, vesselId);
  if (t && t.readAt === null && (v.s.iodine > 0 || v.s.cu > 0)) latchB(w, `unread:${vesselId}`, 'TUBE_DISCARDED_UNREAD', 'WARN', { obj: vesselId });
  const nonWater = v.tags.some((x) => x !== 'bW');
  // Queda una película del contenido (se elimina enjuagando, M10).
  moveFraction(v, waste, v.volumeMl > 0.06 ? 1 - 0.04 / v.volumeMl : 1);
  if (t) {
    t.discarded = true;
    t.film = nonWater;
    t.bath = null;
  }
  const o = w.objects[vesselId];
  if (o && o.support.startsWith('wb') && t) {
    const h = tubeHome(vesselId);
    o.pose = { x: h.x, y: h.y, z: h.z, rotationRad: 0 };
  }
  return ok();
}

// ─────────────────────────── Poses: baños, placas, tubos calientes, ADH ───────────────────────────

function setPoseEnz(w: EnzWorld, id: string, pose: { x: number; y: number; z: number; rotationRad: number }, support?: string): EnzDispatchResult {
  const o = w.objects[id];
  if (!o) return dispatchCell(w, { type: 'setPose', id, pose, support });
  const gate = support && support !== o.support ? adhGate(w, id) : null;
  if (gate) return gate;
  const t = tubeOf(w, id);
  const v = vesselOf(w, id);
  // Tubo caliente tomado con la mano (S03): accidente térmico, el tubo cae con pérdidas.
  if (t && v && support === 'hand' && o.support !== 'hand' && v.tK > ep(w).hotTouchK) {
    transfer(w, v, w.enz.vessels.spill, v.volumeMl * 0.3);
    errB(w, 'S03', 'HOT_WITHOUT_TONGS', 'CRITICAL', { obj: id });
    w.safety.incident = w.safety.incident ?? { code: 'S03', since: w.timeS };
    w.safety.block = { code: 'HOT', since: w.timeS };
    return no('HOT_WITHOUT_TONGS');
  }
  if (support && (BATH_IDS_B05 as readonly string[]).includes(support)) {
    if (!t && id !== 'tg' && id !== 'th') return no('BAD_TARGET');
    if (support === 'wb2' && w.objects.tg?.support === 'wb2' && id !== 'tg') return no('SLOT_BUSY');
  }
  const r = dispatchCell(w, { type: 'setPose', id, pose, support });
  if (!r.ok || !support) return r;
  if (t) {
    if ((BATH_IDS_B05 as readonly string[]).includes(support)) {
      if (t.bath?.id !== support) placeInBath(w, id, support, 1);
    } else if (support !== 'hand') t.bath = null;
    else t.bath = null;
  }
  return r;
}

// ─────────────────────────── Lecturas ───────────────────────────

const PREFIX: Record<EnzInstrument, string> = { balance: 'm', scale: 'v', thermo: 't', clock: 'h', ph: 'p', collector: 'g', uv: 'a', eye: 'c', foam: 'f' };

function addReading(w: EnzWorld, r: Omit<EnzReading, 'id' | 'tick' | 't'>): EnzReading {
  w.enz.readingSeq += 1;
  const id = `${PREFIX[r.instrument]}${w.enz.readingSeq}`;
  const full: EnzReading = { id, tick: w.tick, t: w.timeS, ...r };
  w.enz.readings[id] = full;
  w.enz.readingOrder.push(id);
  flagB(w, `read:${r.instrument}`);
  flagB(w, `read:${r.instrument}:${r.targetId}`);
  return full;
}

/** Absorbancia bruta a 340 nm de una cubeta (§8.4): ε·l·[NADH] más el fondo de la matriz. */
function rawA340(w: EnzWorld, cuvetteId: string): number {
  const p = ep(w).uv;
  const v = w.enz.vessels[cuvetteId];
  if (v.volumeMl <= 1e-6) return 0;
  const matrix = scE(w, SC_B05.UV_NO_BLANK) ? 0.04 : p.matrixA;
  return p.epsilon * (p.path[cuvetteId] ?? 1) * (v.s.nadh / v.volumeMl) + matrix;
}

function read(w: EnzWorld, instrument: EnzInstrument, targetId: string, eyeDeg: number): EnzDispatchResult {
  const p = ep(w);
  if (instrument === 'balance') {
    if (targetId !== 'bal') return no('BAD_TARGET');
    const r = addReading(w, { instrument, targetId, value: r6(roundTo(grossMass(w) - w.enz.balance.tareG, p.readRes.balance)), unit: 'g', biased: !w.enz.balance.tared });
    return ok({ id: r.id, value: r.value });
  }
  if (instrument === 'clock') {
    if (!w.enz.clocks[targetId]) return no('BAD_TARGET');
    const r = addReading(w, { instrument, targetId, value: r6(roundTo(clockS(w, targetId), 0.1)), unit: 's', clockS: clockS(w, targetId) });
    return ok({ id: r.id, value: r.value });
  }
  if (instrument === 'thermo') {
    const bath = w.enz.baths[targetId];
    const v = vesselOf(w, targetId);
    if (!bath && (!v || v.volumeMl < 0.5)) return no('BAD_TARGET');
    const tK = bath ? bath.tK : v!.tK;
    const r = addReading(w, { instrument, targetId, value: r6(roundTo(tK - 273.15, p.readRes.thermo)), unit: '°C', clockS: clockS(w, isTube(targetId) && w.enz.tubes[targetId].contactAt !== null ? 'sw2' : 'sw1') });
    const b = batchOf(w, targetId);
    if (b) b.measuredTK = tK;
    return ok({ id: r.id, value: r.value });
  }
  if (instrument === 'collector') {
    if (targetId !== 'gc') return no('BAD_TARGET');
    const c = w.enz.collector;
    const trueMl = gasMl(c.gasMmol / 1000, p.ambientK, p.pressureKPa);
    const biased = Math.abs(eyeDeg) > p.eyeTolDeg;
    if (biased) errB(w, 'M11', 'PARALLAX', 'WARN', { obj: targetId });
    const rd = collectorReading(trueMl, { offsetMl: c.offsetMl, scale: c.scale, capacityMl: p.collector.capacityMl, resolutionMl: p.collector.resolutionMl, parallaxMlPerDeg: p.parallaxMlPerDeg, eyeDeg: biased ? eyeDeg : 0 });
    checkLabels(w);
    const r = addReading(w, { instrument, targetId: c.tubeId ? `gc:${c.tubeId}` : 'gc', value: r6(rd.value), unit: 'mL', quality: rd.full ? 'full' : undefined, biased, clockS: clockS(w, 'sw1') });
    return ok({ id: r.id, value: r.value });
  }
  if (instrument === 'foam') {
    const t = tubeOf(w, targetId);
    if (!t) return no('BAD_TARGET');
    const r = addReading(w, { instrument, targetId, value: r6(roundTo((t.foamMl / (Math.PI * 0.8 * 0.8)) * 10, 1)), unit: 'mm', clockS: clockS(w, 'sw1') });
    return ok({ id: r.id, value: r.value });
  }
  if (instrument === 'scale') return readScale(w, targetId, eyeDeg);
  if (instrument === 'uv') return readUV(w, targetId);
  if (instrument === 'ph') return no('USE_STRIP');
  // Ojo: color del tubo derivado de las especies presentes.
  const t = tubeOf(w, targetId);
  const v = vesselOf(w, targetId);
  if (!v || v.volumeMl < 0.05) return no('BAD_TARGET');
  let quality = 'clear';
  let value = 0;
  if (v.s.iodine > 1e-9) {
    const sig = lugolSignal(p.lugol, v.s, v.volumeMl);
    quality = `lugol:${sig.color}${sig.tinted ? ':tinted' : ''}${sig.localized ? ':granules' : ''}`;
    value = roundTo(sig.index, 0.05);
    if (t) {
      if (t.drops.lugol < p.lugol.dropsMin) errB(w, 'A10', 'LUGOL_LOW', 'WARN', { obj: targetId });
      if (t.drops.lugol > p.lugol.dropsMax) errB(w, 'A11', 'LUGOL_HIGH', 'WARN', { obj: targetId });
    }
  }
  if (v.s.cu + v.s.cu2o > 1e-9) {
    const col = benedictColor(p.benedict, v.s, v.volumeMl);
    quality = quality === 'clear' ? `benedict:${col}` : `${quality}|benedict:${col}`;
    value = roundTo(Math.min(1, v.s.cu2o / v.volumeMl / p.benedict.redMmolMl), 0.05);
    if (t) {
      if (t.hotDoseS < p.benedict.minS) errB(w, 'A12', 'BENEDICT_UNDERHEATED', 'WARN', { obj: targetId });
      if (t.boilS > p.benedict.maxS || t.hotDoseS > 2 * p.benedict.maxS) {
        errB(w, 'A13', 'BENEDICT_OVERHEATED', 'WARN', { obj: targetId });
        quality += ':altered';
      }
    }
  }
  if (quality === 'clear' && hasSolids(v)) quality = 'turbid';
  if (t) t.readAt = w.timeS;
  const r = addReading(w, { instrument: 'eye', targetId, value: r6(value), unit: 'índice', quality, clockS: clockS(w, 'sw2') });
  return ok({ id: r.id, value: r.value });
}

function readScale(w: EnzWorld, targetId: string, eyeDeg: number): EnzDispatchResult {
  const p = ep(w);
  const v = vesselOf(w, targetId);
  const isCyl = (CYLINDER_IDS_B05 as readonly string[]).includes(targetId);
  const isBk = (BEAKER_IDS_B05 as readonly string[]).includes(targetId);
  if (!v || (!isCyl && !isBk && !isPipette(targetId))) return no('BAD_TARGET');
  const res = isCyl ? (targetId === 'g100' ? 1 : targetId === 'g25' ? 0.5 : p.readRes.cylinder) : isBk ? p.readRes.beaker : 0.05;
  let value = v.volumeMl;
  const biased = !isPipette(targetId) && Math.abs(eyeDeg) > p.eyeTolDeg;
  if (biased) {
    value += p.parallaxMlPerDeg * eyeDeg * (isCyl ? 1 : 3);
    errB(w, 'M11', 'PARALLAX', 'WARN', { obj: targetId });
  }
  const r = addReading(w, { instrument: 'scale', targetId, value: r6(Math.max(0, roundTo(value, res))), unit: 'mL', biased });
  return ok({ id: r.id, value: r.value });
}

function readUV(w: EnzWorld, cuvetteId: string): EnzDispatchResult {
  if (!w.enz.adhEnabled) return no('UNAUTHORIZED_ADH');
  const v = vesselOf(w, cuvetteId);
  if (!v || !isCuvette(cuvetteId)) return no('BAD_TARGET');
  if (w.objects[cuvetteId]?.support !== 'uv') return no('NOT_IN_PHOTOMETER');
  if (cuvetteId === 'cp') {
    errB(w, 'H03', 'UV_CUVETTE', 'WARN', { obj: cuvetteId });
    return no('UV_CUVETTE');
  }
  if (v.volumeMl < 0.5) return no('EMPTY');
  if (v.s.adhAct + v.s.adhDen > 1e-9 && v.s.ethanol > 1e-9 && v.s.nad + v.s.nadh <= 1e-12) errB(w, 'H01', 'NO_NAD', 'WARN', { obj: cuvetteId });
  // Competidor en otra concentración que la prescrita (H05).
  if (v.s.methanol + v.s.formaldehyde > 1e-9) {
    const nominal = ep(w).competitorMl * 0.5;
    const have = v.s.methanol + v.s.formaldehyde;
    if (Math.abs(have - nominal) > 0.1 * nominal) errB(w, 'H05', 'COMPETITOR_DOSE', 'WARN', { obj: cuvetteId });
  }
  const raw = rawA340(w, cuvetteId);
  const blank = w.enz.uv.blankA;
  if (blank === null) errB(w, 'H02', 'UV_NO_BLANK', 'WARN', { obj: cuvetteId });
  const value = Math.round((blank === null ? raw : raw - blank) * 1000) / 1000;
  const r = addReading(w, { instrument: 'uv', targetId: cuvetteId, value, unit: 'A340', quality: blank === null ? 'raw' : 'corrected', biased: blank === null, clockS: clockS(w, 'sw2') });
  return ok({ id: r.id, value: r.value });
}

/** Rótulos intercambiados (M01): el «blanco» tiene tejido y el tubo de catalasa no. */
function checkLabels(w: EnzWorld) {
  const ts = TUBE_IDS_B05.map((id) => [w.enz.tubes[id], w.enz.vessels[id]] as const);
  const blankWithTissue = ts.some(([t, v]) => t.label === 'cat-blank' && catalaseOf(v.s) > 1e-6 && v.s.h2o2 + (t.reactionAt !== null ? 1 : 0) > 0);
  const baseWithout = ts.some(([t, v]) => t.label === 'cat-base' && t.reactionAt !== null && catalaseOf(v.s) <= 1e-9);
  if (blankWithTissue && baseWithout) errB(w, 'M01', 'LABELS_SWAPPED', 'WARN');
}

function incident(w: EnzWorld, key: string) {
  if (w.enz.incidents.includes(key)) return;
  w.enz.incidents.push(key);
  flagB(w, 'incident:B05RES');
  emitB(w, 'RESOURCE_INCIDENT', 'INFO', { obj: key });
}

// ─────────────────────────── Paso fijo ───────────────────────────

export function stepEnzWorld(w: EnzWorld): void {
  stepCellWorld(w);
  const p = ep(w);
  const dt = w.params.dtS;
  stepBaths(w, dt);
  stepPlates(w, dt);
  stepPours(w, dt);
  for (const [id, v] of Object.entries(w.enz.vessels)) {
    if (v.volumeMl <= 1e-9 && !hasSolids(v)) continue;
    stepTemperature(w, id, v, dt);
    stepVessel(w, id, v, dt);
  }
  for (const id of TUBE_IDS_B05) stepTubeStats(w, id, dt);
  const pc = w.enz.pending.c05;
  if (pc && w.timeS - pc.at > 30) {
    errB(w, 'C05', 'CLOCK_LATE', 'WARN', { obj: pc.tubeId });
    w.enz.pending.c05 = null;
  }
  void p;
}

function stepBaths(w: EnzWorld, dt: number) {
  const p = ep(w);
  for (const [id, b] of Object.entries(w.enz.baths)) {
    let target = b.on ? b.setK + b.offsetK : p.ambientK;
    // Baño de Benedict irregular (SC20): la temperatura oscila ±5 K alrededor de la consigna.
    if (id === 'wb2' && b.on && scE(w, SC_B05.BENEDICT_IRREGULAR)) target += 5 * Math.sin(w.timeS / 40);
    b.tK = target + (b.tK - target) * Math.exp(-dt / b.tauS);
    const stable = b.on && Math.abs(b.tK - (b.setK + b.offsetK)) <= p.bath.stabilityK;
    if (stable && b.stableSince === null) b.stableSince = w.timeS;
    if (!stable) b.stableSince = null;
  }
}

function stepPlates(w: EnzWorld, dt: number) {
  const p = ep(w).prep;
  for (const id of BEAKER_IDS_B05) {
    const v = w.enz.vessels[id];
    const b = batchOf(w, id);
    const { stir01, slipping } = stirOf(w, id);
    const plate = plateOf(w, id);
    if (b && plate) {
      if (stir01 > 0.05 && !slipping) b.stirredS = r6(b.stirredS + dt);
      if (w.enz.plates[plate].heatOn) b.heatedS = r6(b.heatedS + dt);
    }
    if (b) b.maxTK = Math.max(b.maxTK, v.tK);
    // Barra que desliza con la suspensión viscosa: salpica y se pierde masa (PREP05).
    if (slipping && v.volumeMl > 1) {
      const ml = Math.min(v.volumeMl, p.splashMlS * dt);
      transfer(w, v, w.enz.vessels.spill, ml);
      if (b) {
        b.slipS = r6(b.slipS + dt);
        b.splashMl = r6(b.splashMl + ml);
        if (b.slipS > 2) errB(w, 'PREP05', 'BAR_SLIP', 'WARN', { obj: id });
      }
    }
    mixStep(w, v, stir01, dt);
  }
}

/** Dispersión del almidón (sin disolución completa), extracción de la catalasa y disolución de la amilasa. */
function mixStep(w: EnzWorld, v: EnzVessel, stir01: number, dt: number) {
  const p = ep(w).prep;
  if (v.volumeMl <= 1e-6) return;
  const solids = hasSolids(v);
  if (solids) {
    if (stir01 > 0.05) v.homog01 = Math.min(1, v.homog01 + (1 - v.homog01) * (1 - Math.exp(-0.05 * stir01 * dt)));
    else v.homog01 = Math.max(0, v.homog01 - v.homog01 * p.settleK * dt);
  }
  if (stir01 > 0.05) v.mixed01 = Math.min(1, v.mixed01 + 0.2 * stir01 * dt);
  const mixF = 0.1 + stir01;
  // Almidón: los gránulos se dispersan hasta una fracción accesible máxima (mayor si se gelatiniza por encima de 333 K).
  const gly = v.s.starch + v.s.starchSolid;
  if (v.s.starchSolid > 1e-9 && gly > 0) {
    const cap = v.tK > 333 ? 0.97 : Math.min(0.85, p.accessMax + 0.004 * (v.tK - 298.15));
    const accessible = v.s.starch / gly;
    if (accessible < cap) {
      const d = Math.min(v.s.starchSolid, gly * (cap - accessible) * (1 - Math.exp(-p.disperseK * mixF * dt)));
      v.s.starchSolid -= d;
      v.s.starch += d;
    }
  }
  // Catalasa del tejido al líquido: depende del tamaño de los fragmentos y de la agitación.
  if (v.s.catTissue + v.s.catTissueDen > 1e-12) {
    const b = Object.values(w.enz.batches).find((x) => x?.vesselId && w.enz.vessels[x.vesselId] === v);
    const size = b?.sizeCm ?? 0.6;
    const k = p.extractK * mixF * Math.min(1, p.liverMaxCm / Math.max(0.05, size));
    const f = 1 - Math.exp(-k * dt);
    const a = v.s.catTissue * f * 0.8;
    const d = v.s.catTissueDen * f * 0.8;
    v.s.catTissue -= a;
    v.s.catAct += a;
    v.s.catTissueDen -= d;
    v.s.catDen += d;
  }
  if (v.s.amySolid > 1e-12) {
    const a = v.s.amySolid * (1 - Math.exp(-p.dissolveK * mixF * dt));
    v.s.amySolid -= a;
    v.s.amyAct += a;
  }
}

function stepPours(w: EnzWorld, dt: number) {
  for (const [srcId, pour] of Object.entries(w.enz.pours)) {
    const src = vesselOf(w, srcId);
    if (!src || src.volumeMl <= 1e-9) {
      delete w.enz.pours[srcId];
      continue;
    }
    const ml = pourRate(w, pour.tiltDeg) * dt;
    if (ml <= 0) continue;
    const target = vesselOf(w, pour.targetId);
    if (!target || isPipette(pour.targetId)) {
      spillFrom(w, src, ml, srcId);
      continue;
    }
    const before = beforeDelivery(w, pour.targetId, src);
    const r = transfer(w, src, target, ml);
    delivered(w, srcId, pour.targetId, r.moved, r.overflow, before);
  }
}

/** Temperatura de un recipiente: baño (con su inmersión), placa encendida o ambiente. */
function stepTemperature(w: EnzWorld, id: string, v: EnzVessel, dt: number) {
  const p = ep(w);
  if ((WASTE_IDS_B05 as readonly string[]).includes(id) || id === 'spill') return;
  const t = w.enz.tubes[id];
  let env = p.ambientK;
  let tau = Math.max(60, 3 * p.prep.plateTauSPerMl * v.volumeMl);
  if (t?.bath) {
    const b = w.enz.baths[t.bath.id];
    env = t.bath.depth01 * b.tK + (1 - t.bath.depth01) * p.ambientK;
    tau = p.bath.tubeTauS / (0.3 + 0.7 * t.bath.depth01);
  } else {
    const plate = plateOf(w, id);
    if (plate && w.enz.plates[plate].heatOn) {
      env = w.enz.plates[plate].setK;
      tau = Math.max(20, p.prep.plateTauSPerMl * v.volumeMl);
    }
  }
  v.tK = env + (v.tK - env) * Math.exp(-dt / tau);
}

function stepVessel(w: EnzWorld, id: string, v: EnzVessel, dt: number) {
  const p = ep(w);
  const s = v.s;
  const vol = v.volumeMl;
  if (vol <= 1e-6) return;
  const pH = pHOf(s, vol);
  // Ácido o base sin mezclar: una fracción del líquido está a un pH más extremo (T09).
  const pHLocal = v.mixed01 < 1 ? pHOf({ ...s, acid: s.acid * 3 }, vol) : pH;
  if (v.mixed01 < 1) v.mixed01 = Math.min(1, v.mixed01 + 0.004 * dt);
  const eff = (k: EnzParams['catalase']) => v.mixed01 * activityFactor(k, v.tK, pH) + (1 - v.mixed01) * activityFactor(k, v.tK, pHLocal);
  // Catalasa: 2 H₂O₂ → 2 H₂O + O₂ (libre y, en menor medida, la del tejido en suspensión), más la descomposición espontánea.
  if (s.h2o2 > 1e-12) {
    const c = p.catalase;
    const e = s.catAct + 0.3 * s.catTissue;
    const conc = s.h2o2 / vol;
    const rate = (e > 0 ? c.kcatPerU * e * eff(c) * (conc / (c.km + conc)) : 0) + p.h2o2SpontK * s.h2o2;
    const dh = Math.min(s.h2o2, rate * dt);
    if (dh > 0) {
      s.h2o2 -= dh;
      const o2 = dh / 2;
      const room = Math.max(0, p.supersat * p.o2SatMmolMl * vol - s.o2);
      const diss = Math.min(o2, room);
      s.o2 += diss;
      if (o2 - diss > 0) routeGas(w, id, o2 - diss);
    }
  }
  // Amilasa: almidón disperso → dextrinas → azúcares reductores; los gránulos se hidrolizan mucho más lento. El yodo la
  // inhibe casi por completo y el Cu(II) del Benedict la detiene.
  if (s.amyAct > 1e-12 && s.starch + s.starchSolid + s.dextrin > 1e-12) {
    const k = p.amylase;
    const inhib = s.cu > 1e-9 ? 0 : s.iodine > 1e-9 ? 0.05 : 1;
    const a = eff(k) * inhib * k.kcatPerU * s.amyAct;
    if (a > 0) {
      const cS = s.starch / vol;
      const d1 = Math.min(s.starch, a * (cS / (k.km + cS)) * dt);
      const cG = s.starchSolid / vol;
      const d1s = Math.min(s.starchSolid, p.solidHydrolysis * a * (cG / (k.km + cG)) * dt);
      const cD = s.dextrin / vol;
      const d2 = Math.min(s.dextrin, p.dextrinFactor * a * (cD / (p.dextrinKm + cD)) * dt);
      s.starch -= d1;
      s.starchSolid -= d1s;
      s.dextrin += d1 + d1s - d2;
      s.sugar += d2;
    }
  }
  // Benedict en caliente.
  if (s.cu > 1e-12) {
    const n = benedictStep(p.benedict, s, vol, v.tK, dt);
    if (n > 0) {
      s.cu -= 2 * n;
      s.cu2o += n;
      s.redUsed += n;
    }
  }
  // ADH (módulo cerrado): etanol + NAD⁺ → acetaldehído + NADH; metanol como sustrato competidor.
  if (s.adhAct > 1e-12 && s.nad > 1e-12) {
    const r = adhRates(p.adh, s.adhAct, s, vol);
    const de = Math.min(s.ethanol, r.eth * dt);
    const dm = Math.min(s.methanol, r.meth * dt);
    const tot = Math.min(s.nad, de + dm);
    const f = de + dm > 0 ? tot / (de + dm) : 0;
    s.ethanol -= de * f;
    s.acetaldehyde += de * f;
    s.methanol -= dm * f;
    s.formaldehyde += dm * f;
    s.nad -= tot;
    s.nadh += tot;
  }
  // Desnaturalización irreversible (§3.2): la fracción perdida no vuelve al enfriar.
  const kc = denatRate(p.catalase, v.tK, pH);
  if (kc > 0 && s.catAct + s.catTissue > 1e-12) {
    const f = 1 - Math.exp(-kc * dt);
    const a = s.catAct * f;
    const b = s.catTissue * f;
    s.catAct -= a;
    s.catDen += a;
    s.catTissue -= b;
    s.catTissueDen += b;
  }
  const ka = denatRate(p.amylase, v.tK, pH);
  if (ka > 0 && s.amyAct > 1e-12) {
    const a = s.amyAct * (1 - Math.exp(-ka * dt));
    s.amyAct -= a;
    s.amyDen += a;
  }
  if (s.adhAct > 1e-12) {
    const a = s.adhAct * (1 - Math.exp(-denatRate(p.catalase, v.tK, pH) * dt));
    s.adhAct -= a;
    s.adhDen += a;
  }
  // Tubos: sedimentación del sólido sin agitar (A09) y espuma que se desarma con el tiempo.
  const t = w.enz.tubes[id];
  if (t) {
    if (hasSolids(v)) v.homog01 = Math.max(0, v.homog01 - v.homog01 * p.prep.settleK * dt);
    if (t.foamMl > 0) t.foamMl = r6(t.foamMl * Math.exp(-dt / 40));
  }
  // Benedict hirviendo: evaporación (A13).
  if (v.tK > BOIL_K && s.cu + s.cu2o > 1e-9) {
    const ml = Math.min(v.volumeMl * 0.5, 0.0015 * dt);
    v.volumeMl = r6(v.volumeMl - ml);
    w.enz.evaporatedMl = r6(w.enz.evaporatedMl + ml);
  }
}

function stepTubeStats(w: EnzWorld, id: string, dt: number) {
  const t = w.enz.tubes[id];
  const v = w.enz.vessels[id];
  if (v.volumeMl <= 1e-6) return;
  const p = ep(w);
  t.maxTK = Math.max(t.maxTK, v.tK);
  if (v.tK >= p.benedict.minK) t.hotDoseS = r6(t.hotDoseS + dt);
  if (v.tK >= BOIL_K) t.boilS = r6(t.boilS + dt);
  if (t.reactionAt !== null && w.timeS - t.reactionAt <= p.catalaseObservationS) {
    t.tSum += v.tK;
    t.tN += 1;
  }
  // Enzima expuesta a temperatura dañina fuera de un tratamiento térmico (T04).
  const enzyme = v.s.catAct + v.s.catTissue + v.s.amyAct;
  if (v.tK > p.harmK && enzyme + v.s.catDen + v.s.amyDen > 1e-9 && v.s.cu <= 1e-9) {
    t.harmS = r6(t.harmS + dt);
    if (t.harmS > p.harmMaxS && !HEAT_LABELS.has(t.label ?? '')) errB(w, 'T04', 'THERMAL_DAMAGE', 'WARN', { obj: id });
  }
}

// ─────────────────────────── Conservación y cierre ───────────────────────────

/** Totales del intento (§6.5): en recipientes, en polvo, en el hígado, en el colector, venteado y atrapado. */
export function enzTotals(w: EnzWorld): Record<string, number> {
  const p = ep(w);
  const vs = Object.values(w.enz.vessels);
  const sum = (f: (s: Species) => number) => vs.reduce((a, v) => a + f(v.s), 0);
  const powder = (k: string) => (w.enz.powders[k] ?? 0) + (w.enz.spatula[k] ?? 0) + (w.enz.boat[k] ?? 0);
  const liverG = Object.values(w.enz.liver).reduce((a, l) => a + l.massG, 0) + (w.enz.board?.massG ?? 0) + (w.enz.boatTissue?.massG ?? 0);
  const liverU = Object.values(w.enz.liver).reduce((a, l) => a + l.catU + l.catDenU, 0) + (w.enz.board ? w.enz.board.catU + w.enz.board.catDenU : 0) + (w.enz.boatTissue ? w.enz.boatTissue.catU + w.enz.boatTissue.catDenU : 0);
  const trapped = Object.values(w.enz.o2.trapped).reduce((a, x) => a + x, 0);
  return {
    volume: vs.reduce((a, v) => a + v.volumeMl, 0) + w.enz.evaporatedMl,
    glucosyl: sum(glucosylOf) + (powder('jS') / G_PER_MMOL_GLY),
    oxygen: sum((s) => s.h2o2 + 2 * s.o2) + 2 * (w.enz.collector.gasMmol + w.enz.o2.vented + trapped),
    copper: sum(copperOf),
    catalase: sum(catalaseOf) + liverU,
    amylase: sum(amylaseOf) + powder('jA') * amylaseUPerGOf(w),
    tissue: sum((s) => s.tissueMg) + liverG * 1000,
    iodine: sum((s) => s.iodine),
    acid: sum((s) => s.acid),
    nad: sum((s) => s.nad + s.nadh),
    ethanol: sum((s) => s.ethanol + s.acetaldehyde),
    methanol: sum((s) => s.methanol + s.formaldehyde),
    adh: sum((s) => s.adhAct + s.adhDen),
    _p: p ? 0 : 0,
  };
}

/** Balance de B05 (deben ser ~0) más los de B02 (montajes, colorantes, biomasa). */
export function conservedEnz(w: EnzWorld): Record<string, number> {
  const out = conservedCell(w);
  const now = enzTotals(w);
  for (const [k, v] of Object.entries(now)) if (!k.startsWith('_')) out[`enz:${k}`] = (w.enz.initial[k] ?? 0) - v;
  return out;
}

export function enzSummary(w: EnzWorld) {
  return {
    ...cellSummary(w),
    enz: stableHash({
      t: TUBE_IDS_B05.map((id) => [w.enz.tubes[id].label, Math.round(w.enz.vessels[id].volumeMl * 1000), Math.round(w.enz.vessels[id].s.h2o2 * 1e6)]),
      g: Math.round(w.enz.collector.gasMmol * 1e6),
      r: w.enz.readingSeq,
      b: BEAKER_IDS_B05.map((id) => Math.round(w.enz.vessels[id].volumeMl * 100)),
    }),
  };
}

/** Lo que el cierre de B05 agrega: recipientes con mezcla, pipetas cargadas, derrames, pastillas dentro y fuentes térmicas. */
export function enzOutstanding(w: EnzWorld): string[] {
  const out: string[] = [];
  for (const id of [...TUBE_IDS_B05, ...BEAKER_IDS_B05, ...CUVETTE_IDS_B05]) {
    const v = w.enz.vessels[id];
    if (v.volumeMl > 0.05 && v.tags.some((x) => x !== 'bW')) out.push(id);
  }
  for (const id of PIPETTE_IDS_B05) if (w.enz.vessels[id].volumeMl > ep(w).pipettes[id].filmMl + 1e-6) out.push(id);
  if (w.enz.vessels.spill.volumeMl > 0.05) out.push('spill');
  if (Object.keys(w.enz.pours).length) out.push('pour');
  for (const [bar, at] of Object.entries(w.enz.bars)) if (at) out.push(bar);
  if (heatSourcesOn(w).length) out.push('heat');
  return out;
}

export const heatSourcesOn = (w: EnzWorld) => [
  ...Object.entries(w.enz.plates).filter(([, p]) => p.heatOn || p.rpm > 0).map(([id]) => id),
  ...Object.entries(w.enz.baths).filter(([, b]) => b.on).map(([id]) => id),
  ...(w.enz.burnerLit ? ['bn'] : []),
];

/** Papel sobre la mesada: también recoge lo derramado (va a los residuos acuosos). */
export function cleanSpill(w: EnzWorld) {
  const s = w.enz.vessels.spill;
  if (s.volumeMl <= 0 && !hasSolids(s)) return;
  const target = wasteClassOf(s) === 'cu' ? 'wCu' : wasteClassOf(s) === 'bio' ? 'wBio' : 'wAq';
  moveFraction(s, w.enz.vessels[target], 1);
  flagB(w, 'enzSpillCleaned');
}

/** Cierre: el de B02 más los recipientes, pipetas, derrames, pastillas y fuentes térmicas de B05 (S08). */
function closeBench(w: EnzWorld): EnzDispatchResult {
  if (heatSourcesOn(w).some((id) => id !== 'hp1' && id !== 'hp2') || Object.values(w.enz.plates).some((p) => p.heatOn) || w.enz.burnerLit) errB(w, 'S08', 'HEAT_LEFT_ON', 'WARN');
  const had = !!w.evidence.benchRestored;
  const r = dispatchCell(w, { type: 'closeBench' });
  const extra = enzOutstanding(w);
  if (extra.length) {
    if (!had) delete w.evidence.benchRestored;
    emitB(w, 'ENZ_BENCH_INCOMPLETE', 'WARN', { n: extra.length });
    return { ...r, value: 0 };
  }
  return r;
}

export function runEnzFor(w: EnzWorld, seconds: number): void {
  const n = Math.round(seconds / w.params.dtS);
  for (let i = 0; i < n; i++) stepEnzWorld(w);
}

export { cellOutstanding };
