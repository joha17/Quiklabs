/**
 * Mundo B03 «Fronteras celulares» (§6): el mundo celular de B02 (microscopio, montajes húmedos de Elodea) con el
 * estado de transporte. Cada comando informa un HECHO (inclinación de un frasco, mL aspirados, vueltas de la
 * abrazadera, ángulo del ojo) y el paso fijo integra difusión, ósmosis, fugas y evaporación con conservación de
 * volumen y de cada soluto (§6.6). Los ensayos de Biuret y AgNO₃ ocurren en los tubos, nunca en las cámaras.
 */
import { clamp, stableHash } from '../core/math';
import { dispatchCell, cellSummary, conservedCell, stepCellWorld } from '../cell-world/world';
import { emitB, errB, flagB, latchB } from '../optical-world/events';
import { liquidMl } from '../specimens/mount-world';
import type { FreshMount } from '../specimens/mount-world';
import {
  SOLUTES, absorbance, agclPrecipitate, biuretReading, chlorideReading, diffusiveStep, elodeaState, hydrostaticKPa, noAmounts, osmolarity,
  osmoticPressureKPa, osmoticStep, protoplastTarget, relaxProtoplast, tracerLevel, type Amounts,
} from '../membrane-transport/model';
import type { CellCommand } from '../cell-world/commands';
import type { PermCommand, PermDispatchResult, PermInstrument } from './commands';
import { PERM_ONLY_TYPES } from './commands';
import type { InstrumentReading, PermParams, PermWorld, Side, TwoChamber, Vessel } from './types';

/** Escenarios docentes de B03 (§10). */
export const SC_B03 = {
  IDEAL: 'SC-01', WEAK_CLAMP: 'SC-02', CELLOPHANE: 'SC-03', PROTEIN_LEAK: 'SC-04', TRACER_BLOCKED: 'SC-05', CURVE: 'SC-06', NO_COLORIMETER: 'SC-07',
  VALID_SYRUP: 'SC-08', UNKNOWN_SYRUP: 'SC-09', LOW_GRADIENT: 'SC-10', HEAD_DIFF: 'SC-11', CONTROL_TUBES: 'SC-12', INTERFERENCE: 'SC-13',
  PHOTOS_ALL: 'SC-14', TIME_SERIES: 'SC-15', SINGLE_PHOTO: 'SC-16', NONISO_09: 'SC-17', PENDING_PHOTO: 'SC-18', BIASED_CYLINDER: 'SC-19', VARIABLE_PORES: 'SC-20',
} as const;
export const scP = (w: PermWorld, s: string) => w.scenarios.includes(s);

export const CELL_IDS = ['c1', 'c2', 'c3'] as const;
export const TUBE_IDS = ['t1', 't2', 't3', 't4', 't5', 't6', 't7'] as const;
export const TUBE_LABELS = ['A-Biuret', 'A-Ag', 'B-Biuret', 'B-Ag', 'blank', 'pos-protein', 'pos-chloride'] as const;
export const BOTTLE_IDS = ['bW', 'bI', 'bE', 'bN', 'bS', 'bSc', 'bL'] as const;
export const CYLINDER_IDS = ['g1', 'g2'] as const;
/** Goteros de los ensayos (en los tubos) y goteros de medios de Elodea (en los portaobjetos, mundo celular). */
export const ASSAY_DROPPERS = ['dBi', 'dAg'] as const;
export const SALINE_DROPPERS = ['n09', 'n5'] as const;

const ok = (extra: Partial<PermDispatchResult> = {}): PermDispatchResult => ({ ok: true, ...extra });
const no = (code: string): PermDispatchResult => ({ ok: false, code });
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
const pp = (w: PermWorld): PermParams => w.params.perm!;

// ─────────────────────────── Recipientes ───────────────────────────

export const emptyVessel = (capacityMl: number): Vessel => ({ volumeMl: 0, capacityMl, amounts: noAmounts(), biuretMl: 0, silverMmol: 0, pptMmol: 0, tags: [] });

/** `c1:A` → lado de la cámara; el resto, recipiente con nombre. */
export function vesselOf(w: PermWorld, id: string): Vessel | null {
  const [cid, side] = id.split(':');
  if (side === 'A' || side === 'B') return w.perm.cells[cid]?.sides[side] ?? null;
  return w.perm.vessels[id] ?? null;
}
export const sideOf = (id: string): { cellId: string; side: Side } | null => {
  const [cid, side] = id.split(':');
  return side === 'A' || side === 'B' ? { cellId: cid, side } : null;
};
const other = (s: Side): Side => (s === 'A' ? 'B' : 'A');

/** Mueve una fracción de todo el contenido (volumen, solutos, reactivos y precipitado) de un recipiente a otro. */
function moveFraction(from: Vessel, to: Vessel, f: number) {
  if (f <= 0) return;
  const k = Math.min(1, f);
  const ml = from.volumeMl * k;
  from.volumeMl = r6(from.volumeMl - ml);
  to.volumeMl = r6(to.volumeMl + ml);
  for (const s of SOLUTES) {
    const a = from.amounts[s] * k;
    from.amounts[s] -= a;
    to.amounts[s] += a;
  }
  const b = from.biuretMl * k;
  from.biuretMl -= b;
  to.biuretMl += b;
  const ag = from.silverMmol * k;
  from.silverMmol -= ag;
  to.silverMmol += ag;
  const p = from.pptMmol * k;
  from.pptMmol -= p;
  to.pptMmol += p;
  for (const t of from.tags) if (!to.tags.includes(t)) to.tags.push(t);
  if (k >= 1 - 1e-12) {
    from.volumeMl = 0;
    from.amounts = noAmounts();
    from.biuretMl = 0;
    from.silverMmol = 0;
    from.pptMmol = 0;
    from.tags = [];
  }
}

/** Transfiere hasta `ml`; lo que no cabe en el destino cae a la mesada (derrame). Devuelve lo que entró. */
function transfer(w: PermWorld, from: Vessel, to: Vessel, ml: number): { moved: number; overflow: number; solutes: Amounts } {
  const take = Math.min(ml, from.volumeMl);
  if (take <= 1e-9) return { moved: 0, overflow: 0, solutes: noAmounts() };
  const before = { ...to.amounts };
  const room = Math.max(0, to.capacityMl - to.volumeMl);
  const fit = Math.min(take, room);
  const f = take / from.volumeMl;
  // Lo que cabe va al destino; el resto, a la mesada (mismo contenido proporcional).
  const toTarget = fit / take;
  const tmp = emptyVessel(Infinity);
  moveFraction(from, tmp, f);
  moveFraction(tmp, to, toTarget);
  const overflow = tmp.volumeMl;
  if (overflow > 1e-9) moveFraction(tmp, w.perm.vessels.spill, 1);
  const solutes = noAmounts();
  for (const s of SOLUTES) solutes[s] = to.amounts[s] - before[s];
  react(to);
  return { moved: fit, overflow, solutes };
}

/** AgCl en el recipiente: el cloruro disuelto y la plata reaccionan por estequiometría (precipitado sólido). */
function react(v: Vessel) {
  if (v.silverMmol <= 1e-12 || v.amounts.salt <= 1e-12) return;
  const r = agclPrecipitate(v.amounts.salt, v.silverMmol);
  v.pptMmol += r.pptMmol;
  v.amounts.salt = r.chlorideLeft;
  v.silverMmol = r.silverLeft;
}

const solutesIn = (a: Amounts) => a.salt + a.tracer + a.glucose + a.protein > 1e-9;
const sealTurnsOf = (w: PermWorld, c: TwoChamber) => pp(w).sealTurns + (c.membraneId && w.perm.membranes[c.membraneId]?.edgeContaminated ? 0.8 : 0);
const sealed = (w: PermWorld, c: TwoChamber) => !!c.membraneId && c.clampTurns >= sealTurnsOf(w, c);

// ─────────────────────────── Despacho ───────────────────────────

export function dispatchPerm(w: PermWorld, cmd: PermCommand): PermDispatchResult {
  if (PERM_ONLY_TYPES.has(cmd.type)) {
    if (w.safety.stoppedByTeacher) return no('TEACHER_STOP');
    if (!w.ppe) {
      errB(w, 'E68', 'PPE_REQUIRED', 'CRITICAL');
      return no('PPE');
    }
    const r = permOnly(w, cmd);
    syncElodeaAssets(w);
    return r;
  }
  if (cmd.type === 'squeezeDropper' && (ASSAY_DROPPERS as readonly string[]).includes(cmd.dispenserId)) {
    if (!w.ppe) return dispatchCell(w, cmd as CellCommand);
    return assayDrop(w, cmd.dispenserId, cmd.targetId);
  }
  if (cmd.type === 'closeBench') return closeBench(w);
  const leafBefore = w.cell.held.fc?.kind === 'elodea';
  const r = dispatchCell(w, cmd as CellCommand);
  if (r.ok) afterCell(w, cmd, r, leafBefore);
  syncElodeaAssets(w);
  return r;
}

function permOnly(w: PermWorld, cmd: PermCommand): PermDispatchResult {
  switch (cmd.type) {
    case 'insertMembrane': return insertMembrane(w, cmd.membraneId, cmd.cellId, cmd.offsetCm);
    case 'removeMembrane': return removeMembrane(w, cmd.cellId);
    case 'turnClamp': return turnClamp(w, cmd.cellId, cmd.deltaTurns);
    case 'startPour': return startPour(w, cmd.sourceId, cmd.targetId, cmd.tiltDeg);
    case 'stopPour':
      if (!w.perm.pours[cmd.sourceId]) return no('NOT_POURING');
      delete w.perm.pours[cmd.sourceId];
      return ok();
    case 'aspirate': return aspirate(w, cmd.toolId, cmd.sourceId, cmd.volumeMl);
    case 'dispense': return dispense(w, cmd.toolId, cmd.targetId);
    case 'rinseTool': return rinse(w, cmd.toolId);
    case 'setMixing': return setMixing(w, cmd.cellId, cmd.side, cmd.rate01);
    case 'setLid': {
      const c = w.perm.cells[cmd.cellId];
      if (!c) return no('NO_OBJECT');
      c.lidClosed = cmd.closed;
      return ok();
    }
    case 'labelTube': return labelTube(w, cmd.tubeId, cmd.label);
    case 'readInstrument': return read(w, cmd.instrument, cmd.targetId, cmd.eyeDeg ?? 0);
    case 'zeroColorimeter':
      if (scP(w, SC_B03.NO_COLORIMETER)) return no('NO_INSTRUMENT');
      w.perm.colorimeterZeroed = true;
      flagB(w, 'colorimeterZeroed');
      return ok();
    case 'disposeTube': return disposeTube(w, cmd.tubeId);
    case 'drainCell': return drainCell(w, cmd.cellId);
    case 'requestTimeScale': return requestTimeScale(w, cmd.x);
    case 'requestSeries':
      // Serie temporal auténtica solo si el docente la cargó (SC-15); si no, es una limitación del recurso.
      if (!scP(w, SC_B03.TIME_SERIES)) {
        resourceIncident(w, 'series');
        return no('ASSET_UNAVAILABLE');
      }
      flagB(w, 'series:viewed');
      return ok();
    default:
      return no('UNKNOWN');
  }
}

/** Consecuencias B03 de los gestos del mundo celular (pinza con la hoja, goteros de medios, capturas, limpieza). */
function afterCell(w: PermWorld, cmd: PermCommand, r: PermDispatchResult, leafBefore: boolean) {
  const p = pp(w);
  if (cmd.type === 'pickSpecimen' && cmd.sourceId === 'el' && w.cell.held.fc?.kind === 'elodea') w.perm.leafOutSince = w.timeS;
  if (cmd.type === 'placeSpecimen' && leafBefore && w.cell.held.fc == null) {
    const since = w.perm.leafOutSince;
    w.perm.leafOutSince = null;
    const m = w.mounts[cmd.targetId];
    if (m && since !== null && w.timeS - since > p.elodea.leafOutMaxS) {
      // Hoja expuesta al aire demasiado tiempo: llega deshidratada a la preparación (PERM46).
      cellOf(w, cmd.targetId).dried = true;
      m.hydrated01 = Math.min(m.hydrated01, 0.55);
      errB(w, 'PERM46', 'LEAF_DRIED', 'WARN', { obj: cmd.targetId });
    }
  }
  if (cmd.type === 'squeezeDropper') {
    const m = w.mounts[cmd.targetId];
    if (m?.cell) {
      // Dos medios distintos sobre la misma lámina: la exposición real ya no es la rotulada (PERM47).
      if (mediaOf(m).filter((x) => x.ml > 0.008).length > 1) errB(w, 'PERM47', 'MEDIA_MIXED', 'WARN', { obj: cmd.targetId });
    }
  }
  if (cmd.type === 'captureObservation' && r.id) {
    const o = w.observations[r.id];
    const m = o?.slideId ? w.mounts[o.slideId] : null;
    if (m?.cell?.zones.some((z) => z.kind === 'elodea' && !z.premade)) {
      const e = cellOf(w, o.slideId!);
      const st = elodeaState(e.v, p.elodea.incipientBelow, p.elodea.plasmolyzedBelow);
      w.perm.elodeaCaptures[r.id] = { medium: mediumLabel(m), state: st, v: r6(e.v), slideId: o.slideId! };
      if (o.isObservationValid) flagB(w, `elodeaCapture:${mediumLabel(m)}:${o.objectiveX ?? 0}`);
    }
  }
  // Papel sobre la mesada: también recoge lo derramado de las cámaras y probetas (va a residuos químicos).
  if (cmd.type === 'wipe' && cmd.targetId === 'bench' && cmd.toolId === 'pp' && w.perm.vessels.spill.volumeMl > 0) {
    moveFraction(w.perm.vessels.spill, w.perm.vessels.cw, 1);
    flagB(w, 'permSpillCleaned');
  }
  if (cmd.type === 'setPose') syncSoak(w);
}

// ─────────────────────────── Membranas y cámaras ───────────────────────────

function insertMembrane(w: PermWorld, membraneId: string, cellId: string, offsetCm: number): PermDispatchResult {
  const p = pp(w);
  const mem = w.perm.membranes[membraneId];
  const c = w.perm.cells[cellId];
  if (!mem || !c) return no('NO_OBJECT');
  if (c.membraneId) return no('SLOT_BUSY');
  if (mem.installedIn) return no('IN_USE');
  if (c.sides.A.volumeMl + c.sides.B.volumeMl > 0.05) return no('DRAIN_FIRST');
  if (c.clampTurns > 0.01) return no('CLAMP_CLOSED');
  c.membraneId = membraneId;
  mem.installedIn = cellId;
  mem.inSoak = false;
  if (!mem.usedIn.includes(cellId)) mem.usedIn.push(cellId);
  const o = w.objects[membraneId];
  if (o) {
    o.support = cellId;
    o.pose = { ...w.objects[cellId].pose, z: 4 };
  }
  // Fuera de centro: menos ventana útil (PERM01).
  const off = Math.abs(offsetCm);
  mem.areaFactor = 1;
  if (off > p.centerTolCm) {
    mem.areaFactor = clamp(1 - (off - p.centerTolCm) * 0.35, 0.3, 1);
    errB(w, 'PERM01', 'MEMBRANE_OFF_CENTER', 'WARN', { obj: cellId });
  }
  // Junta con proteína: el borde de la membrana sella irregular (PERM06).
  if (c.gasketProtein) {
    mem.edgeContaminated = true;
    mem.areaFactor *= 0.85;
    errB(w, 'PERM06', 'SEAL_CONTAMINATED', 'WARN', { obj: cellId });
  }
  const spec = p.materials[mem.material];
  if (spec.needsPreWet && mem.wet01 < p.wetMin) errB(w, 'PERM04', 'MEMBRANE_DRY', 'WARN', { obj: membraneId });
  // Material: el de poro ancho en la cámara de diálisis deja pasar proteína (PERM21); otro material no asignado (PERM05).
  if (mem.material !== w.perm.assigned.membrane) {
    if (mem.material === 'dialysisWide' && cellId === 'c2') errB(w, 'PERM21', 'WIDE_PORES', 'WARN', { obj: membraneId });
    else errB(w, 'PERM05', 'WRONG_MEMBRANE', 'WARN', { obj: membraneId });
  }
  if (solutesIn(mem.carry)) errB(w, 'PERM10', 'MEMBRANE_CARRYOVER', 'WARN', { obj: membraneId });
  if (mem.intact && mem.material === w.perm.assigned.membrane) flagB(w, `membraneOk:${cellId}`);
  flagB(w, 'membraneInstalled');
  emitB(w, 'MEMBRANE_INSERTED', 'INFO', { obj: membraneId, cell: cellId });
  return ok({ value: r6(mem.areaFactor) });
}

function removeMembrane(w: PermWorld, cellId: string): PermDispatchResult {
  const c = w.perm.cells[cellId];
  if (!c?.membraneId) return no('NO_MEMBRANE');
  if (c.sides.A.volumeMl + c.sides.B.volumeMl > 0.05) return no('DRAIN_FIRST');
  if (c.clampTurns > 0.01) return no('CLAMP_CLOSED');
  const mem = w.perm.membranes[c.membraneId];
  mem.installedIn = null;
  const o = w.objects[c.membraneId];
  if (o) {
    o.support = 'bench';
    o.pose = { ...o.pose, x: w.objects[cellId].pose.x, y: w.objects[cellId].pose.y + 9, z: 0.2 };
  }
  c.membraneId = null;
  return ok();
}

function turnClamp(w: PermWorld, cellId: string, delta: number): PermDispatchResult {
  const c = w.perm.cells[cellId];
  if (!c) return no('NO_OBJECT');
  if (!c.membraneId && delta > 0) return no('NO_MEMBRANE');
  c.clampTurns = r6(clamp(c.clampTurns + delta, 0, 4));
  const mem = c.membraneId ? w.perm.membranes[c.membraneId] : null;
  if (mem && mem.intact && c.clampTurns > pp(w).materials[mem.material].tearTurns) {
    // Apriete por encima de lo que resiste la película: se rasga (PERM03).
    mem.intact = false;
    mem.tornBy = 'clamp';
    errB(w, 'PERM03', 'MEMBRANE_TORN', 'ALERT', { obj: c.membraneId! });
  }
  if (sealed(w, c)) flagB(w, `sealed:${cellId}`);
  return ok({ value: c.clampTurns });
}

function setMixing(w: PermWorld, cellId: string, side: Side, rate: number): PermDispatchResult {
  const c = w.perm.cells[cellId];
  if (!c) return no('NO_OBJECT');
  const p = pp(w);
  c.mixing[side] = clamp(rate, 0, 1);
  const v = c.sides[side];
  // Agitar fuerte un lado casi lleno: el líquido salta el tabique y moja la mesada (PERM15 / PERM25).
  if (c.mixing[side] > p.slosh.mix && v.volumeMl > v.capacityMl * p.slosh.fill) {
    const cross = emptyVessel(Infinity);
    moveFraction(v, cross, 0.04);
    moveFraction(cross, w.perm.vessels.spill, 0.25);
    transfer(w, cross, c.sides[other(side)], cross.volumeMl);
    if (cross.volumeMl > 0) moveFraction(cross, w.perm.vessels.spill, 1);
    c.crossContaminated = true;
    errB(w, cellId === 'c2' ? 'PERM25' : 'PERM15', 'CROSS_SPLASH', 'WARN', { obj: cellId });
  }
  return ok();
}

function drainCell(w: PermWorld, cellId: string): PermDispatchResult {
  const c = w.perm.cells[cellId];
  if (!c) return no('NO_OBJECT');
  if (cellId === 'c3') closeOsmosis(w);
  const mem = c.membraneId ? w.perm.membranes[c.membraneId] : null;
  for (const s of ['A', 'B'] as Side[]) {
    const v = c.sides[s];
    if (mem) {
      // La membrana queda impregnada con una pequeña parte de lo que contenía la cámara (PERM10 si se reutiliza).
      for (const k of SOLUTES) {
        const a = v.amounts[k] * 0.01;
        v.amounts[k] -= a;
        mem.carry[k] += a;
      }
    }
    moveFraction(v, w.perm.vessels.cw, 1);
  }
  Object.assign(c, { tracerAt: null, tracerSide: null, tracerMl: 0, loadedAt: null, startReadAt: null, syrupSide: null, crossContaminated: false, lidOpenS: 0 });
  delete w.perm.leakTestStart[cellId];
  flagB(w, `drained:${cellId}`);
  return ok();
}

/** Cierre de la ósmosis: se juzga la duración y la temperatura al vaciar la cámara o cerrar la mesada. */
function closeOsmosis(w: PermWorld) {
  const c = w.perm.cells.c3;
  if (!c || c.startReadAt === null || c.sides.A.volumeMl + c.sides.B.volumeMl < 0.5) return;
  const last = c.lastScaleAt ?? c.startReadAt;
  if (last - c.startReadAt < pp(w).osmosis.incubationS - 1) errB(w, 'PERM44', 'OSMOSIS_SHORT', 'WARN', { obj: 'c3' });
  if (!w.evidence['read:thermo']) errB(w, 'PERM41', 'NO_TEMPERATURE', 'WARN', { obj: 'c3' });
}

function syncSoak(w: PermWorld) {
  for (const [id, mem] of Object.entries(w.perm.membranes)) {
    const inSoak = w.objects[id]?.support === 'sk';
    if (inSoak && !mem.inSoak) flagB(w, `soaked:${id}`);
    mem.inSoak = inSoak;
  }
}

// ─────────────────────────── Vertido, pipeta y tubos ───────────────────────────

const POUR_SOURCES = new Set<string>([...BOTTLE_IDS, ...CYLINDER_IDS, 'rb']);

function startPour(w: PermWorld, sourceId: string, targetId: string, tiltDeg: number): PermDispatchResult {
  if (!POUR_SOURCES.has(sourceId)) return no('BAD_SOURCE');
  const src = vesselOf(w, sourceId);
  if (!src || src.volumeMl <= 1e-6) return no('SOURCE_EMPTY');
  if (sourceId === targetId) return no('BAD_TARGET');
  w.perm.pours[sourceId] = { targetId, tiltDeg: clamp(tiltDeg, 0, 120) };
  return ok();
}

/** Caudal del pico según la inclinación (mL/s): nada por debajo del ángulo de vertido, máximo cerca de 90°. */
function pourRate(w: PermWorld, sourceId: string, tiltDeg: number) {
  const p = pp(w);
  const max = (CYLINDER_IDS as readonly string[]).includes(sourceId) ? p.pourMaxMlS.cylinder : p.pourMaxMlS.bottle;
  const k = clamp((tiltDeg - p.pourMinTiltDeg) / (90 - p.pourMinTiltDeg), 0, 1);
  return max * k ** 1.5;
}

/** Hechos de una entrega de líquido a un recipiente (cámara, tubo) desde `from` (frasco, probeta o pipeta). */
function delivered(w: PermWorld, fromId: string, targetId: string, moved: number, overflow: number, solutes: Amounts, origin: string[]) {
  const p = pp(w);
  if (overflow > 0.01) errB(w, 'PERM08', 'OVERFILL', 'WARN', { obj: targetId });
  const sd = sideOf(targetId);
  if (!sd || moved <= 1e-9) return;
  const c = w.perm.cells[sd.cellId];
  const mem = c.membraneId ? w.perm.membranes[c.membraneId] : null;
  const hasSolute = solutesIn(solutes);
  if (hasSolute && !w.perm.leakTestPassed.length) errB(w, 'PERM07', 'NO_LEAK_TEST', 'WARN', { obj: sd.cellId });
  // Líquido proteico con el marco sin sellar: la proteína llega a la junta (PERM06).
  if (solutes.protein > 1e-6 && !sealed(w, c)) {
    if (mem) mem.edgeContaminated = true;
    else c.gasketProtein = true;
    errB(w, 'PERM06', 'SEAL_CONTAMINATED', 'WARN', { obj: sd.cellId });
  }
  if (sd.cellId === 'c1' && solutes.tracer > 1e-9) {
    if (c.tracerAt === null) {
      c.tracerAt = w.timeS;
      c.tracerSide = sd.side;
      if (sd.side !== 'A') errB(w, 'PERM11', 'GRADIENT_REVERSED', 'WARN', { obj: targetId });
    } else if (sd.side !== c.tracerSide) errB(w, 'PERM14', 'DIRECT_TRANSFER', 'WARN', { obj: targetId });
    c.tracerMl = r6(c.tracerMl + moved);
    if (mem && p.materials[mem.material].p.tracer <= 0 && mem.intact) errB(w, 'PERM17', 'TRACER_IMPERMEABLE', 'INFO', { obj: c.membraneId! });
    flagB(w, 'tracerLoaded');
  }
  if (sd.cellId === 'c2' && c.loadedAt === null && c.sides.A.volumeMl > 1 && c.sides.B.volumeMl > 1 && c.sides.B.amounts.protein + c.sides.B.amounts.salt > 0) {
    c.loadedAt = w.timeS;
    flagB(w, 'dialysisLoaded');
  }
  if (sd.cellId === 'c3') {
    if (c.startReadAt !== null) errB(w, 'PERM45', 'OSMOSIS_CHANGED', 'WARN', { obj: targetId });
    if (solutes.glucose > 1e-9) {
      if (c.syrupSide === null) {
        c.syrupSide = sd.side;
        if (sd.side !== 'A') errB(w, 'PERM36', 'SYRUP_SIDE_SWAPPED', 'WARN', { obj: targetId });
      }
      if (origin.includes('bSc')) errB(w, 'PERM37', 'SYRUP_OSMOLALITY', 'WARN', { obj: fromId });
      if (origin.includes('bL')) errB(w, 'PERM38', 'LIGHT_SYRUP', 'WARN', { obj: fromId });
      flagB(w, 'syrupLoaded');
    }
  }
}

function aspirate(w: PermWorld, toolId: string, sourceId: string, volumeMl: number): PermDispatchResult {
  if (toolId !== 'pi') return no('BAD_TOOL');
  const p = pp(w);
  const pi = w.perm.vessels.pi;
  const src = vesselOf(w, sourceId);
  if (!src || sourceId === 'pi' || sourceId === 'spill' || sourceId === 'cw') return no('BAD_SOURCE');
  if (src.volumeMl <= 1e-6) return no('SOURCE_EMPTY');
  const pip = w.perm.pipette;
  if (pi.volumeMl > p.pipetteFilmMl + 1e-6 && pip.from !== sourceId) return no('TOOL_BUSY');
  const want = clamp(volumeMl, 0, p.pipetteCapMl - pi.volumeMl);
  if (want <= 1e-6) return no('TOOL_FULL');
  // Restos del otro compartimento en la pipeta sin lavar: la alícuota se contamina (PERM27).
  const res = pip.residueFrom;
  const sd = sideOf(sourceId);
  if (res && res !== sourceId && pi.volumeMl > 1e-9) {
    const rs = sideOf(res);
    if (sd && rs && rs.cellId === sd.cellId) errB(w, 'PERM27', 'PIPETTE_CARRYOVER', 'WARN', { obj: sourceId });
  }
  const r = transfer(w, src, pi, want);
  pip.from = sourceId;
  pip.residueFrom = sourceId;
  if (sd?.cellId === 'c2') {
    const c = w.perm.cells.c2;
    if (want > p.assay.aliquotMaxMl + 1e-9) errB(w, 'PERM28', 'ALIQUOT_LARGE', 'WARN', { obj: sourceId });
    if (!w.perm.dialysisChecked) {
      w.perm.dialysisChecked = true;
      const protein = c.sides.A.amounts.protein + c.sides.B.amounts.protein + r.solutes.protein;
      const salt = c.sides.A.amounts.salt + c.sides.B.amounts.salt + r.solutes.salt;
      const nominal = p.dialysis.saltNominalMl * w.perm.saltMmolMl;
      if (protein < p.dialysis.minProteinMg) errB(w, 'PERM22', 'PROTEIN_LOW', 'WARN', { obj: 'c2' });
      if (salt <= 1e-6) errB(w, 'PERM23', 'NO_CHLORIDE', 'WARN', { obj: 'c2' });
      else if (Math.abs(salt - nominal) > p.dialysis.tolFrac * nominal) errB(w, 'PERM24', 'SALT_VOLUME', 'WARN', { obj: 'c2' });
    }
  }
  emitB(w, 'ASPIRATED', 'INFO', { obj: sourceId });
  return ok({ value: r6(r.moved) });
}

function dispense(w: PermWorld, toolId: string, targetId: string): PermDispatchResult {
  if (toolId !== 'pi') return no('BAD_TOOL');
  const p = pp(w);
  const pi = w.perm.vessels.pi;
  const dose = pi.volumeMl - p.pipetteFilmMl;
  if (dose <= 1e-6) return no('TOOL_EMPTY');
  const target = vesselOf(w, targetId);
  if (!target || targetId === 'pi') {
    // Fuera de un recipiente: a la mesada.
    transfer(w, pi, w.perm.vessels.spill, dose);
    return ok({ value: 0 });
  }
  const origin = [...pi.tags];
  const from = w.perm.pipette.from ?? '';
  const r = transfer(w, pi, target, dose);
  delivered(w, 'pi', targetId, r.moved, r.overflow, r.solutes, origin);
  const tube = w.perm.tubes[targetId];
  if (tube) {
    const fs = sideOf(from);
    const c2 = w.perm.cells.c2;
    const inc = fs?.cellId === 'c2' && c2.loadedAt !== null && w.timeS - c2.loadedAt >= p.dialysis.incubationS - 1;
    tube.sources.push(`${from}${inc ? '*' : ''}`);
    tube.sampleMl = r6(tube.sampleMl + r.moved);
    if (fs?.cellId === 'c2' && r.moved < p.assay.aliquotMinMl - 1e-9) errB(w, 'PERM29', 'ALIQUOT_SMALL', 'WARN', { obj: targetId });
    checkTubeSide(w, targetId);
    if (inc) flagB(w, `aliquot:${fs!.side}`);
  }
  emitB(w, 'DISPENSED', 'INFO', { obj: targetId });
  return ok({ value: r6(r.moved) });
}

function rinse(w: PermWorld, toolId: string): PermDispatchResult {
  if (toolId !== 'pi') return no('BAD_TOOL');
  const pi = w.perm.vessels.pi;
  if (pi.volumeMl > pp(w).pipetteFilmMl + 1e-6) return no('EMPTY_FIRST');
  moveFraction(pi, w.perm.vessels.rb, 1);
  w.perm.pipette = { from: null, residueFrom: null };
  flagB(w, 'pipetteRinsed');
  return ok();
}

/** Lado que indica la etiqueta de un tubo (`A-Biuret` → A; controles → null). */
const labelSide = (label: string | null): Side | null => (label?.startsWith('A-') ? 'A' : label?.startsWith('B-') ? 'B' : null);

/** Etiqueta y procedencia discordantes (PERM26): la prueba corresponde al lado real, no al rotulado. */
function checkTubeSide(w: PermWorld, tubeId: string) {
  const t = w.perm.tubes[tubeId];
  const ls = labelSide(t.label);
  if (!ls) return;
  if (t.sources.some((s) => s.startsWith(`c2:${other(ls)}`))) errB(w, 'PERM26', 'LABEL_MISMATCH', 'WARN', { obj: tubeId });
}

function labelTube(w: PermWorld, tubeId: string, label: string): PermDispatchResult {
  const t = w.perm.tubes[tubeId];
  if (!t) return no('NO_OBJECT');
  if (!(TUBE_LABELS as readonly string[]).includes(label)) return no('BAD_LABEL');
  if (Object.entries(w.perm.tubes).some(([id, x]) => id !== tubeId && x.label === label && !x.discarded)) return no('LABEL_TAKEN');
  t.label = label;
  checkTubeSide(w, tubeId);
  const o = w.objects[tubeId];
  if (o) o.label = label;
  return ok();
}

/** Una gota de reactivo de ensayo sobre un tubo (o, fuera de él, sobre la mesada). */
function assayDrop(w: PermWorld, dropperId: string, targetId: string): PermDispatchResult {
  const p = pp(w);
  const d = w.perm.vessels[dropperId];
  if (!d || d.volumeMl < p.dropMl - 1e-9) return no('SOURCE_EMPTY');
  const t = w.perm.tubes[targetId];
  const tv = w.perm.vessels[targetId];
  if (!t || !tv || t.discarded) {
    transfer(w, d, w.perm.vessels.spill, p.dropMl);
    emitB(w, 'DROP_SPILLED', 'WARN', { obj: dropperId });
    return ok({ value: 0 });
  }
  const biuret = dropperId === 'dBi';
  // Reactivo cambiado de tubo (PERM30 / PERM31): la mezcla queda no interpretable.
  if (!biuret && (t.label?.endsWith('Biuret') || t.label === 'pos-protein' || tv.biuretMl > 0)) errB(w, 'PERM30', 'SILVER_IN_BIURET', 'WARN', { obj: targetId });
  if (biuret && (t.label?.endsWith('-Ag') || t.label === 'pos-chloride' || tv.silverMmol + tv.pptMmol > 0)) errB(w, 'PERM31', 'BIURET_IN_SILVER', 'WARN', { obj: targetId });
  transfer(w, d, tv, p.dropMl);
  if (t.reagentAt === null) t.reagentAt = w.timeS;
  if (biuret) t.gotBiuret = true;
  else t.gotSilver = true;
  flagB(w, `reagent:${targetId}:${biuret ? 'biuret' : 'ag'}`);
  emitB(w, 'ASSAY_DROP', 'INFO', { obj: targetId, r: biuret ? 'biuret' : 'ag' });
  return ok({ value: p.dropMl });
}

function disposeTube(w: PermWorld, tubeId: string): PermDispatchResult {
  const t = w.perm.tubes[tubeId];
  const v = w.perm.vessels[tubeId];
  if (!t || !v) return no('NO_OBJECT');
  if (t.discarded) return no('DISCARDED');
  // Tubo con muestra descartado antes de registrar su resultado (PERM35).
  if (v.volumeMl > 1e-6 && t.readAt === null) errB(w, 'PERM35', 'TUBE_DISCARDED_UNREAD', 'WARN', { obj: tubeId });
  moveFraction(v, w.perm.vessels.cw, 1);
  t.discarded = true;
  const o = w.objects[tubeId];
  if (o) {
    o.support = 'cw';
    o.pose = { ...w.objects.cw.pose, z: 3 };
  }
  return ok();
}

function requestTimeScale(w: PermWorld, x: number): PermDispatchResult {
  if (x <= 1) return ok({ value: 1 });
  // Acelerar mientras se vierte, se aspira o se lleva una hoja: se bloquea (PERM18).
  const busy = Object.keys(w.perm.pours).length > 0 || w.perm.vessels.pi.volumeMl > pp(w).pipetteFilmMl + 1e-6 || !!w.cell.held.fc;
  if (busy) {
    errB(w, 'PERM18', 'TIME_LOCKED', 'WARN');
    return no('TIME_LOCKED');
  }
  return ok({ value: x });
}

// ─────────────────────────── Lecturas ───────────────────────────

function addReading(w: PermWorld, r: Omit<InstrumentReading, 'id' | 'tick' | 't'>): InstrumentReading {
  w.perm.readingSeq += 1;
  const id = `r${w.perm.readingSeq}`;
  const full: InstrumentReading = { id, tick: w.tick, t: w.timeS, ...r };
  w.perm.readings[id] = full;
  w.perm.readingOrder.push(id);
  flagB(w, `read:${r.instrument}`);
  flagB(w, `read:${r.instrument}:${r.targetId}`);
  return full;
}

const roundTo = (v: number, res: number) => Math.round(v / res) * res;

function read(w: PermWorld, instrument: PermInstrument, targetId: string, eyeDeg: number): PermDispatchResult {
  const p = pp(w);
  if (instrument === 'thermo') {
    const r = addReading(w, { instrument, targetId, value: r6(roundTo(p.temperatureK - 273.15, p.readRes.thermo)), unit: '°C' });
    return ok({ id: r.id, value: r.value });
  }
  if (instrument === 'scale') return readScale(w, targetId, eyeDeg);
  const tube = w.perm.tubes[targetId];
  if (tube) return readTube(w, targetId, instrument);
  const sd = sideOf(targetId);
  const v = vesselOf(w, targetId);
  if (!v) return no('BAD_TARGET');
  const c = v.volumeMl > 1e-6 ? v.amounts.tracer / v.volumeMl : 0;
  let r: InstrumentReading;
  if (instrument === 'colorimeter') {
    if (scP(w, SC_B03.NO_COLORIMETER)) return no('NO_INSTRUMENT');
    let a = absorbance(c, p.tracer.epsilon, p.tracer.pathCm);
    const biased = !w.perm.colorimeterZeroed;
    // Sin el cero con el blanco, la lectura arrastra el sesgo del sensor (PERM19).
    if (biased) {
      a += 0.06;
      errB(w, 'PERM19', 'SENSOR_UNCALIBRATED', 'WARN', { obj: targetId });
    }
    r = addReading(w, { instrument, targetId, value: r6(Math.round(a * 1000) / 1000), unit: 'A', biased });
  } else {
    const lvl = tracerLevel(c, p.tracer.levels);
    r = addReading(w, { instrument: 'eye', targetId, value: lvl, unit: 'nivel', quality: `tracer:${lvl}` });
  }
  if (sd?.cellId === 'c1') diffusionReading(w);
  return ok({ id: r.id, value: r.value });
}

/** Lectura de la serie de difusión: momento respecto al primer contacto del trazador (t = 0) y dosis cargada. */
function diffusionReading(w: PermWorld) {
  const p = pp(w);
  const c = w.perm.cells.c1;
  if (c.tracerAt === null) return;
  const dt = w.timeS - c.tracerAt;
  const first = !w.evidence['diff:any'];
  flagB(w, 'diff:any');
  if (dt <= p.tracer.t0WindowS) flagB(w, 'diff:t0');
  else if (first) errB(w, 'PERM16', 'MISSED_T0', 'WARN', { obj: 'c1' });
  if (Math.abs(dt - 30) <= 8) flagB(w, 'diff:t30');
  if (Math.abs(dt - 60) <= 10) flagB(w, 'diff:t60');
  if (!w.perm.tracerChecked) {
    w.perm.tracerChecked = true;
    if (c.tracerMl < p.tracer.nominalMl * 0.7) errB(w, 'PERM12', 'TRACER_LOW', 'WARN', { obj: 'c1' });
    else if (c.tracerMl > p.tracer.nominalMl * 1.3) errB(w, 'PERM13', 'TRACER_HIGH', 'WARN', { obj: 'c1' });
  }
}

function readScale(w: PermWorld, targetId: string, eyeDeg: number): PermDispatchResult {
  const p = pp(w);
  const v = vesselOf(w, targetId);
  const sd = sideOf(targetId);
  const isCyl = (CYLINDER_IDS as readonly string[]).includes(targetId);
  if (!v || (!isCyl && !sd)) return no('BAD_TARGET');
  const res = isCyl ? p.readRes.cylinder : p.readRes.column;
  let value = v.volumeMl;
  // Descalibración conocida de la probeta 1 (SC-19): la escala marca de más.
  if (targetId === 'g1' && scP(w, SC_B03.BIASED_CYLINDER)) value += 0.6;
  // Ojo por encima o por debajo del menisco: error de paralaje (PERM40).
  const biased = Math.abs(eyeDeg) > p.eyeTolDeg;
  if (biased) {
    value += p.parallaxMlPerDeg * eyeDeg;
    errB(w, 'PERM40', 'PARALLAX', 'WARN', { obj: targetId });
  }
  const r = addReading(w, { instrument: 'scale', targetId, value: r6(Math.max(0, roundTo(value, res))), unit: 'mL', biased });
  if (sd) {
    const c = w.perm.cells[sd.cellId];
    c.lastScaleAt = w.timeS;
    leakTestReading(w, sd.cellId);
    if (sd.cellId === 'c3') osmosisReading(w, sd.side);
  }
  return ok({ id: r.id, value: r.value });
}

/** Prueba de fugas: dos lecturas separadas por `leakTestS` con agua sola en ambos lados y el marco cerrado. */
function leakTestReading(w: PermWorld, cellId: string) {
  const p = pp(w);
  const c = w.perm.cells[cellId];
  const waterOnly = (['A', 'B'] as Side[]).every((s) => c.sides[s].volumeMl >= 5 && !solutesIn(c.sides[s].amounts));
  if (!waterOnly || !c.membraneId) return;
  const lost = c.leakOutMl + c.leakCrossMl;
  const st = w.perm.leakTestStart[cellId];
  if (!st) {
    w.perm.leakTestStart[cellId] = { t: w.timeS, leakMl: lost };
    flagB(w, 'leakTest:started');
    return;
  }
  if (w.timeS - st.t < p.leakTestS) return;
  if (lost - st.leakMl < 0.05 && sealed(w, c) && w.perm.membranes[c.membraneId].intact) {
    if (!w.perm.leakTestPassed.includes(cellId)) w.perm.leakTestPassed.push(cellId);
    flagB(w, 'leakTest:ok');
    emitB(w, 'LEAK_TEST_OK', 'INFO', { obj: cellId });
  } else {
    flagB(w, 'leakTest:found');
    emitB(w, 'LEAK_TEST_FAILED', 'WARN', { obj: cellId });
    delete w.perm.leakTestStart[cellId];
  }
}

function osmosisReading(w: PermWorld, side: Side) {
  const p = pp(w);
  const c = w.perm.cells.c3;
  if (c.sides.A.volumeMl < 1 || c.sides.B.volumeMl < 1) return;
  if (c.startReadAt === null) {
    c.startReadAt = w.timeS;
    // Volumen inicial distinto del protocolo (PERM39): otra columna y otra presión hidrostática.
    const sv = c.sides[c.syrupSide ?? 'A'].volumeMl;
    if (Math.abs(sv - p.osmosis.syrupNominalMl) > p.osmosis.tolMl) errB(w, 'PERM39', 'SYRUP_VOLUME', 'WARN', { obj: 'c3' });
  }
  const dt = w.timeS - c.startReadAt;
  if (dt <= 60) flagB(w, `osm:start:${side}`);
  else w.evidence[`osm:end:${side}`] = w.timeS;
  if (dt >= p.osmosis.incubationS - 1) flagB(w, `osm:full:${side}`);
}

function readTube(w: PermWorld, tubeId: string, instrument: PermInstrument): PermDispatchResult {
  const p = pp(w);
  const t = w.perm.tubes[tubeId];
  const v = w.perm.vessels[tubeId];
  if (t.discarded) return no('DISCARDED');
  if (instrument !== 'eye') return no('BAD_INSTRUMENT');
  const age = t.reagentAt === null ? 0 : w.timeS - t.reagentAt;
  const protein = v.volumeMl > 1e-6 ? v.amounts.protein / v.volumeMl : 0;
  const hasAg = v.silverMmol + v.pptMmol > 1e-12;
  const b = biuretReading(protein, { biuretMl: v.biuretMl, ageS: age, delayS: p.assay.biuretDelayS, silver: hasAg, minMgMl: p.assay.biuretMinMgMl });
  const cl = chlorideReading(v.pptMmol, { biuret: v.biuretMl > 1e-9, silverAdded: hasAg, visibleMinMmol: p.assay.aggVisibleMmol });
  const label = t.label ?? '';
  const wantsBiuret = label.endsWith('Biuret') || label === 'pos-protein';
  const wantsAg = label.endsWith('-Ag') || label === 'pos-chloride';
  // Leer sin haber puesto el reactivo del tubo (PERM32 / PERM33) o antes de que el color se estabilice (PERM34).
  if (wantsBiuret && v.biuretMl <= 1e-9 && v.volumeMl > 1e-6) errB(w, 'PERM32', 'BIURET_OMITTED', 'WARN', { obj: tubeId });
  if (wantsAg && !hasAg && v.volumeMl > 1e-6) errB(w, 'PERM33', 'SILVER_OMITTED', 'WARN', { obj: tubeId });
  if (v.biuretMl > 1e-9 && age < p.assay.biuretDelayS) errB(w, 'PERM34', 'READ_TOO_EARLY', 'WARN', { obj: tubeId });
  const quality = b !== 'none' && cl !== 'none' ? 'interference' : b !== 'none' ? `biuret:${b}` : cl !== 'none' ? `cl:${cl}` : 'none';
  const code = ['none', 'blue', 'weak', 'violet', 'interference'].indexOf(b);
  const r = addReading(w, { instrument: 'eye', targetId: tubeId, value: b !== 'none' ? code : ['none', 'faint', 'turbid', 'precipitate', 'interference'].indexOf(cl), unit: 'nivel', quality });
  if (t.readAt === null) t.readAt = w.timeS;
  if (label) flagB(w, `tubeRead:${label}`);
  return ok({ id: r.id, value: r.value });
}

// ─────────────────────────── Elodea ───────────────────────────

/** Medios presentes en un montaje (mL): agua de los goteros de agua y soluciones salinas registradas. */
export function mediaOf(m: FreshMount): Array<{ id: 'water' | 'nacl-0.9' | 'nacl-5'; ml: number }> {
  const st = m.cell?.stainMl ?? {};
  return [
    { id: 'water' as const, ml: m.waterMl },
    { id: 'nacl-0.9' as const, ml: st['nacl-0.9'] ?? 0 },
    { id: 'nacl-5' as const, ml: st['nacl-5'] ?? 0 },
  ];
}

/** Medio dominante (o `mixed` si dos superan el 15 %), como etiqueta física del tratamiento real. */
export function mediumLabel(m: FreshMount): string {
  const media = mediaOf(m);
  const tot = media.reduce((a, x) => a + x.ml, 0);
  if (tot <= 1e-6) return 'none';
  const sig = media.filter((x) => x.ml / tot > 0.15);
  if (sig.length > 1) return 'mixed';
  return [...media].sort((a, b) => b.ml - a.ml)[0].id;
}

function cellOf(w: PermWorld, slideId: string) {
  return (w.perm.elodea[slideId] ??= { v: 1, extOsm: 0, exposureS: 0, dried: false });
}

/** Osmolaridad del medio de montaje (ideal, del frasco declarado; el agua aporta 0). */
function extOsm(w: PermWorld, m: FreshMount) {
  const media = mediaOf(m);
  const tot = media.reduce((a, x) => a + x.ml, 0);
  if (tot <= 1e-9) return 0;
  return media.reduce((a, x) => a + x.ml * (pp(w).salineOsm[x.id] ?? 0), 0) / tot;
}

function resourceIncident(w: PermWorld, key: string) {
  if (!w.perm.incidents.includes(key)) w.perm.incidents.push(key);
  flagB(w, `asset:unavailable:${key}`);
  latchB(w, `incident:${key}`, 'ASSET_UNAVAILABLE', 'INFO', { obj: key });
}

/** Recurso de cada hoja según el estado hídrico de SU célula; nunca se deforma una foto (§6.5-10). */
function syncElodeaAssets(w: PermWorld) {
  const p = pp(w).elodea;
  for (const m of Object.values(w.mounts)) {
    if (!m.cell) continue;
    const z0 = m.cell.zones[0];
    if (!z0 || z0.kind !== 'elodea' || z0.premade) continue;
    const e = cellOf(w, m.slideId);
    const st = elodeaState(e.v, p.incipientBelow, p.plasmolyzedBelow);
    let asset = st === 'plasmolyzed' ? 'elodeaPlasmo' : st === 'incipient' ? 'elodeaPlasmoMild' : 'elodea';
    // Foto pendiente de aprobación (SC-18): incidencia sin descuento (PERMRES).
    if (w.cell.missingAssets.includes(asset)) asset = `missing:${asset}`;
    for (const z of m.cell.zones) if (z.kind === 'elodea') z.asset = asset;
    m.specimenAsset = asset;
  }
}

// ─────────────────────────── Paso fijo ───────────────────────────

export function stepPermWorld(w: PermWorld): void {
  stepCellWorld(w);
  const p = pp(w);
  const dt = w.params.dtS;
  stepPours(w, dt);
  for (const id of CELL_IDS) stepCell(w, id, dt);
  // Membranas en el agua de remojo: se hidratan y sueltan lo que tenían impregnado.
  for (const mem of Object.values(w.perm.membranes)) {
    if (mem.inSoak) {
      mem.wet01 = Math.min(1, mem.wet01 + p.wetPerS * dt);
      if (solutesIn(mem.carry)) {
        for (const s of SOLUTES) w.perm.vessels.sk.amounts[s] += mem.carry[s];
        mem.carry = noAmounts();
      }
    }
  }
  stepElodea(w, dt);
  if (w.tick % 4 === 0) syncElodeaAssets(w);
}

function stepPours(w: PermWorld, dt: number) {
  for (const [srcId, pour] of Object.entries(w.perm.pours)) {
    const src = vesselOf(w, srcId);
    if (!src || src.volumeMl <= 1e-9) {
      delete w.perm.pours[srcId];
      continue;
    }
    const ml = pourRate(w, srcId, pour.tiltDeg) * dt;
    if (ml <= 0) continue;
    const target = vesselOf(w, pour.targetId);
    if (!target || pour.targetId === 'pi') {
      // Chorro fuera de una boca: derrame.
      transfer(w, src, w.perm.vessels.spill, ml);
      latchB(w, `pourSpill:${srcId}`, 'POUR_SPILLED', 'WARN', { obj: srcId });
      continue;
    }
    const origin = [...src.tags];
    const r = transfer(w, src, target, ml);
    delivered(w, srcId, pour.targetId, r.moved, r.overflow, r.solutes, origin);
  }
}

function stepCell(w: PermWorld, id: string, dt: number) {
  const p = pp(w);
  const c = w.perm.cells[id];
  const A = c.sides.A;
  const B = c.sides.B;
  const geom = p.cells[id];
  if (A.volumeMl + B.volumeMl <= 1e-9) return;
  const mem = c.membraneId ? w.perm.membranes[c.membraneId] : null;
  const both = A.volumeMl > 0.5 && B.volumeMl > 0.5;
  // Evaporación con la tapa abierta (relevante en la ósmosis, PERM42).
  if (!c.lidClosed) {
    for (const v of [A, B]) {
      const ev = Math.min(v.volumeMl, p.evapMlS * dt);
      v.volumeMl = r6(v.volumeMl - ev);
      w.perm.evaporatedMl = r6(w.perm.evaporatedMl + ev);
    }
    if (id === 'c3' && c.startReadAt !== null) {
      c.lidOpenS = r6(c.lidOpenS + dt);
      if (c.lidOpenS > p.lidOpenMaxS) errB(w, 'PERM42', 'EVAPORATION', 'WARN', { obj: id });
    }
  }
  if (!mem) {
    // Sin membrana la ventana está abierta: los dos lados se mezclan libremente y la junta gotea.
    if (both) mixAcross(w, c, 0.2 * dt);
    leakOut(w, c, p.leakMaxMlS * dt);
    if (A.volumeMl + B.volumeMl > 0.5) errB(w, id === 'c3' ? 'PERM43' : 'PERM02', 'LEAK', 'WARN', { obj: id });
    return;
  }
  const spec = p.materials[mem.material];
  // Membrana impregnada: lo que arrastra pasa al primer lado con líquido (PERM10).
  if (solutesIn(mem.carry)) {
    const v = A.volumeMl > 0.5 ? A : B.volumeMl > 0.5 ? B : null;
    if (v) {
      for (const s of SOLUTES) v.amounts[s] += mem.carry[s];
      mem.carry = noAmounts();
    }
  }
  if (A.volumeMl > 0.2 || B.volumeMl > 0.2) mem.wet01 = Math.min(1, mem.wet01 + p.wetPerS * 0.5 * dt);
  // Fuga por la junta: el marco sin el apriete necesario pierde líquido hacia afuera y entre los lados (PERM02 / PERM43).
  const seal = sealTurnsOf(w, c);
  if (c.clampTurns < seal) {
    const open = 1 - c.clampTurns / seal;
    const rate = p.leakMaxMlS * open * dt;
    const lostOut = leakOut(w, c, rate * p.dripFraction);
    if (both) mixAcross(w, c, (rate * (1 - p.dripFraction)) / Math.max(1, (A.volumeMl + B.volumeMl) / 2));
    if (lostOut > 1e-6 || both) errB(w, id === 'c3' ? 'PERM43' : 'PERM02', 'LEAK', 'WARN', { obj: id });
  }
  if (!both) return;
  if (!mem.intact) {
    if (mem.tornBy === 'factory') errB(w, 'PERM09', 'MEMBRANE_BROKEN', 'ALERT', { obj: c.membraneId! });
  }
  // Difusión de cada soluto: P·A·ΔC·dt con el área útil y la humectación de la película.
  const area = geom.windowCm2 * mem.areaFactor;
  const wet = spec.needsPreWet ? clamp(mem.wet01, 0.15, 1) : 1;
  const mixK = 0.8 + 0.1 * (c.mixing.A + c.mixing.B);
  for (const s of SOLUTES) {
    const P = mem.intact ? spec.p[s] * wet * mixK : p.tornP;
    if (P <= 0) continue;
    const d = diffusiveStep(P, area, A.amounts[s], A.volumeMl, B.amounts[s], B.volumeMl, dt);
    A.amounts[s] -= d;
    B.amounts[s] += d;
    if (A.amounts[s] < 0) A.amounts[s] = 0;
    if (B.amounts[s] < 0) B.amounts[s] = 0;
  }
  // Agua: ΔV_B = Lp·A·((π_B − π_A) − (P_B − P_A))·dt; positivo de A hacia B.
  const T = p.temperatureK;
  const lp = mem.intact ? spec.lp * wet : p.tornLp;
  const piA = osmoticPressureKPa(osmolarity(A.amounts, A.volumeMl), T);
  const piB = osmoticPressureKPa(osmolarity(B.amounts, B.volumeMl), T);
  const hA = hydrostaticKPa(A.volumeMl / geom.columnCm2A);
  const hB = hydrostaticKPa(B.volumeMl / geom.columnCm2B);
  let dv = osmoticStep(lp, area, piA, piB, hA, hB, dt);
  dv = clamp(dv, -Math.max(0, B.volumeMl - 0.1), Math.max(0, A.volumeMl - 0.1));
  if (Math.abs(dv) > 1e-12) {
    A.volumeMl = r6(A.volumeMl - dv);
    B.volumeMl = r6(B.volumeMl + dv);
    // Una columna que rebasa su capacidad derrama a la mesada.
    for (const v of [A, B]) if (v.volumeMl > v.capacityMl) moveFraction(v, w.perm.vessels.spill, (v.volumeMl - v.capacityMl) / v.volumeMl);
  }
}

/** Mezcla convectiva de una fracción `f` de cada lado (fuga entre compartimentos, ventana sin membrana). */
function mixAcross(w: PermWorld, c: TwoChamber, f: number) {
  const k = clamp(f, 0, 0.5);
  if (k <= 0) return;
  const a = emptyVessel(Infinity);
  const b = emptyVessel(Infinity);
  moveFraction(c.sides.A, a, k);
  moveFraction(c.sides.B, b, k);
  c.leakCrossMl = r6(c.leakCrossMl + Math.abs(a.volumeMl - b.volumeMl) + Math.min(a.volumeMl, b.volumeMl));
  moveFraction(a, c.sides.B, 1);
  moveFraction(b, c.sides.A, 1);
  void w;
}

/** Goteo hacia la mesada repartido entre los lados según su volumen (mL perdidos). */
function leakOut(w: PermWorld, c: TwoChamber, ml: number): number {
  const tot = c.sides.A.volumeMl + c.sides.B.volumeMl;
  if (tot <= 1e-9 || ml <= 0) return 0;
  const f = Math.min(1, ml / tot);
  const before = w.perm.vessels.spill.volumeMl;
  moveFraction(c.sides.A, w.perm.vessels.spill, f);
  moveFraction(c.sides.B, w.perm.vessels.spill, f);
  const lost = w.perm.vessels.spill.volumeMl - before;
  c.leakOutMl = r6(c.leakOutMl + lost);
  return lost;
}

function stepElodea(w: PermWorld, dt: number) {
  const p = pp(w).elodea;
  for (const m of Object.values(w.mounts)) {
    const z0 = m.cell?.zones[0];
    if (!z0 || z0.kind !== 'elodea' || z0.premade) continue;
    const e = cellOf(w, m.slideId);
    const wet = liquidMl(m) > 0.005;
    if (!wet && m.hydrated01 < 0.4) e.dried = true;
    e.extOsm = r6(extOsm(w, m));
    if (e.extOsm > 0) e.exposureS = r6(e.exposureS + dt);
    let target = wet ? protoplastTarget(e.extOsm, p.innerOsm, p.nonOsmotic) : 0.85;
    if (e.dried) target = Math.min(target, 0.85);
    e.v = r6(relaxProtoplast(e.v, target, p.tauS, dt));
  }
}

// ─────────────────────────── Conservación ───────────────────────────

/** Recipientes con líquido que el balance de B03 recorre (sin el de la pipeta y los derrames, que se suman aparte). */
function allVessels(w: PermWorld): Vessel[] {
  return [...Object.values(w.perm.vessels), ...Object.values(w.perm.cells).flatMap((c) => [c.sides.A, c.sides.B])];
}

/** Totales actuales: volumen (con evaporado), cada soluto (con lo impregnado y el cloruro precipitado), plata y Biuret. */
export function permTotals(w: PermWorld) {
  const vs = allVessels(w);
  const amounts = noAmounts();
  for (const v of vs) for (const s of SOLUTES) amounts[s] += v.amounts[s];
  for (const mem of Object.values(w.perm.membranes)) for (const s of SOLUTES) amounts[s] += mem.carry[s];
  const ppt = vs.reduce((a, v) => a + v.pptMmol, 0);
  amounts.salt += ppt;
  return {
    volumeMl: vs.reduce((a, v) => a + v.volumeMl, 0) + w.perm.evaporatedMl,
    amounts,
    silverMmol: vs.reduce((a, v) => a + v.silverMmol, 0) + ppt,
    biuretMl: vs.reduce((a, v) => a + v.biuretMl, 0),
  };
}

/** Balance de B03 (deben ser ~0) más los de B02 (montajes, colorantes, biomasa). */
export function conservedPerm(w: PermWorld): Record<string, number> {
  const out = conservedCell(w);
  const now = permTotals(w);
  const i = w.perm.initial;
  out['perm:volume'] = i.volumeMl - now.volumeMl;
  for (const s of SOLUTES) out[`perm:${s}`] = i.amounts[s] - now.amounts[s];
  out['perm:silver'] = i.silverMmol - now.silverMmol;
  out['perm:biuret'] = i.biuretMl - now.biuretMl;
  return out;
}

export function permSummary(w: PermWorld) {
  const c = w.perm.cells;
  return {
    ...cellSummary(w),
    perm: stableHash({
      v: CELL_IDS.map((id) => [Math.round(c[id].sides.A.volumeMl * 1000), Math.round(c[id].sides.B.volumeMl * 1000), c[id].membraneId, Math.round(c[id].clampTurns * 100)]),
      t: TUBE_IDS.map((id) => [w.perm.tubes[id].label, Math.round(w.perm.vessels[id].volumeMl * 1000)]),
      r: w.perm.readingSeq,
    }),
  };
}

/** Lo que el cierre de B03 agrega: cámaras sin vaciar, tubos usados sin desechar, pipeta con líquido, derrames. */
export function permOutstanding(w: PermWorld): string[] {
  const out: string[] = [];
  for (const id of CELL_IDS) {
    const c = w.perm.cells[id];
    if (c.sides.A.volumeMl + c.sides.B.volumeMl > 0.5) out.push(`drain:${id}`);
  }
  for (const id of TUBE_IDS) if (!w.perm.tubes[id].discarded && w.perm.vessels[id].volumeMl > 1e-6 && (w.perm.vessels[id].biuretMl > 0 || w.perm.vessels[id].silverMmol + w.perm.vessels[id].pptMmol > 0)) out.push(id);
  if (w.perm.vessels.pi.volumeMl > pp(w).pipetteFilmMl + 1e-6) out.push('pi');
  if (w.perm.vessels.spill.volumeMl > 0.05) out.push('spill');
  if (Object.keys(w.perm.pours).length) out.push('pour');
  return out;
}

/** Cierre: el de B02 más las cámaras, los tubos, la pipeta y los derrames de B03. */
function closeBench(w: PermWorld): PermDispatchResult {
  closeOsmosis(w);
  const had = !!w.evidence.benchRestored;
  const r = dispatchCell(w, { type: 'closeBench' });
  const extra = permOutstanding(w);
  if (extra.length) {
    if (!had) delete w.evidence.benchRestored;
    emitB(w, 'PERM_BENCH_INCOMPLETE', 'WARN', { n: extra.length });
    return { ...r, value: 0 };
  }
  return r;
}

export function runPermFor(w: PermWorld, seconds: number): void {
  const n = Math.round(seconds / w.params.dtS);
  for (let i = 0; i < n; i++) stepPermWorld(w);
}
