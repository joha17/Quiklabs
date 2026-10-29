/**
 * Mundo B06: atlas celular comparado (§5, §6). `dispatchDiv` aplica un comando: los gestos propios (fichas del reto,
 * epidermis separada con pinza, gota de cultivo vivo, aceite de inmersión, marcas de región, mediciones, Wright y los
 * bloqueos de bioseguridad) se resuelven aquí; el resto es el mundo celular de B02 (`dispatchCell`) y, por debajo, el
 * de B01, con sus catálogos traducidos a los códigos CEL-0NN por `params.codeMap`. `stepDivWorld` avanza 0,05 s: el
 * paso de B02 más la viabilidad de los protistas y los tiempos de Wright. Determinista: solo `rand(w)`.
 */
import { clamp, stableHash } from '../core/math';
import { addZone, cellOutstanding, cellSummary, conservedCell, createCellWorld, dispatchCell, incident, refreshAssets, scC, stepCellWorld, type CellWorldExtras } from '../cell-world/world';
import { emitB, errB, flagB } from '../optical-world/events';
import { isPrep, microscopeView, mountOn } from '../optical-world/world';
import type { OpticalWorldSpec } from '../optical-world/world';
import { liquidMl } from '../specimens/mount-world';
import { DIV_LAYOUT, assetById, circleHitsPolygon, type StructureId } from '../specimens/assets';
import { emptyCellInfo, peelFragment, type CellKind, type CellZone } from '../specimens/thin-section';
import { objectivesOf, turretDegFor, turretObjective } from '../instruments/optical/microscope-model';
import type { ObjectiveX } from '../instruments/optical/microscope-types';
import type { CellCommand } from '../cell-world/commands';
import type { DivCommand, DivDispatchResult } from './commands';
import { DIV_ONLY_TYPES } from './commands';
import type { DivParams, DivSpecimen, DivWorld, LiveSample, MarkStructure, RegionMark } from './types';
import { DIV_SPECIMENS } from './types';

export const SC_B06 = {
  FRESH_CLEAR: 'SC-FRESH-CLEAR',
  FRESH_THICK: 'SC-FRESH-THICK',
  FRESH_BUBBLES: 'SC-FRESH-BUBBLES',
  BUCCAL_SPARSE: 'SC-BUCCAL-SPARSE',
  BUCCAL_CLUMPED: 'SC-BUCCAL-CLUMPED',
  BUCCAL_STAINED: 'SC-BUCCAL-STAINED',
  EL_STATIC: 'SC-EL-STATIC',
  EL_LIVE: 'SC-EL-LIVE',
  TRADES_STOMATA: 'SC-TRADES-STOMATA',
  TRADES_BLUR: 'SC-TRADES-BLUR',
  EUG_VISIBLE: 'SC-EUG-VISIBLE',
  EUG_MOTILITY: 'SC-EUG-MOTILITY',
  PAR_MOTILITY: 'SC-PAR-MOTILITY',
  PAR_FINE: 'SC-PAR-FINE',
  PROT_METHYL: 'SC-PROT-METHYL',
  BACT_FIXED: 'SC-BACT-FIXED',
  BACT_IMMERSION: 'SC-BACT-IMMERSION',
  CYANO_OPTION: 'SC-CYANO-OPTION',
  BLOOD_OVERVIEW: 'SC-BLOOD-OVERVIEW',
  BLOOD_DIFFERENTIAL: 'SC-BLOOD-DIFFERENTIAL',
  BLOOD_LOWCONTRAST: 'SC-BLOOD-LOWCONTRAST',
  METROLOGY: 'SC-METROLOGY',
  NO_SCALE: 'SC-NO-SCALE',
  MIXED_UNKNOWN: 'SC-MIXED-UNKNOWN',
  ONLY_ADMIN: 'SC-ONLY-ADMIN',
  TEACHER_OVERRIDE: 'SC-TEACHER-OVERRIDE',
  ACCESSIBILITY: 'SC-ACCESSIBILITY',
  RESOURCE_OUTAGE: 'SC-RESOURCE-OUTAGE',
} as const;

const ok = (extra: Partial<DivDispatchResult> = {}): DivDispatchResult => ({ ok: true, ...extra });
const no = (code: string): DivDispatchResult => ({ ok: false, code });
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
const dp = (w: DivWorld): DivParams => w.params.div!;

/** Cultivos vivos: gotero → protista. */
export const CULTURES: Record<string, 'euglena' | 'paramecium'> = { cuP: 'paramecium', cuE: 'euglena' };
/** Masa didáctica de organismos que lleva una gota de cultivo (mg). */
const DROP_CELLS_MG = 0.4;
/** Láminas permanentes de B06 y su ficha. */
export const FIXED_KIND: Record<string, DivSpecimen> = { fxB: 'bacillus', fxS: 'blood', fxC: 'cyano', wr1: 'blood' };
/** Recurso docente fotografiado a otro objetivo que el declarado (CEL-074): activo → objetivo con que se asignó. */
export const WRONG_OBJECTIVE_ASSETS: Record<string, number> = { bloodT2: 40 };
/** Subtipos leucocitarios que el estudiante puede nombrar; solo valen si el manifiesto los valida. */
const WBC_SUBTYPES: MarkStructure[] = ['neutrophil', 'lymphocyte', 'eosinophil', 'basophil', 'monocyte'];

// ─────────────────────────── Consultas ───────────────────────────

/** Protista de la zona principal de un portaobjetos (si es un cultivo vivo). */
export const liveOf = (w: DivWorld, slideId: string | null | undefined): LiveSample | null => (slideId ? w.div.live[slideId] ?? null : null);

/** Viscosidad relativa del medio (modelo predictivo didáctico): 1 + k·fracción de metilcelulosa (§6.5, PCEL-11). */
export function viscosityOf(w: DivWorld, slideId: string): number {
  const m = w.mounts[slideId];
  if (!m) return 1;
  const liq = liquidMl(m);
  const mc = m.cell?.stainMl.methylcellulose ?? 0;
  return r6(1 + dp(w).mcViscosityK * (liq > 1e-9 ? mc / liq : 0));
}

export const mcFraction = (w: DivWorld, slideId: string) => {
  const m = w.mounts[slideId];
  const liq = m ? liquidMl(m) : 0;
  return liq > 1e-9 ? (m!.cell?.stainMl.methylcellulose ?? 0) / liq : 0;
};

/** Velocidad aparente PREDICHA (µm/s): nunca es evidencia; la evidencia de movimiento exige video (§4.3). */
export function predictedSpeedUmS(w: DivWorld, slideId: string): number {
  const l = liveOf(w, slideId);
  if (!l) return 0;
  return r6((dp(w).speedUmS[l.kind] * l.viability01) / viscosityOf(w, slideId));
}

/** Campo visual (µm) = 1000·FN/objetivo (REF-02…04) y aumento total = ocular × objetivo (REF-01). */
export const fieldUm = (fieldNumberMm: number, objectiveX: number) => r6((1000 * fieldNumberMm) / objectiveX);
export const totalMag = (ocularX: number, objectiveX: number) => ocularX * objectiveX;

/** Longitud e incertidumbre (REF-05/06): L = p·s; u_L = √((p·u_s)² + (s·u_p)²). */
export function lengthWithUncertainty(px: number, umPerPx: number, uScale: number, uPx: number) {
  return { lengthUm: r6(px * umPerPx), uncertaintyUm: r6(Math.sqrt((px * uScale) ** 2 + (umPerPx * uPx) ** 2)) };
}

/** Objetivo enclavado ahora (null entre posiciones). */
const lockedObjective = (w: DivWorld): ObjectiveX | null => turretObjective(w.microscope.turretDeg, w.params.microscope).objectiveX;

// ─────────────────────────── Despacho ───────────────────────────

export function dispatchDiv(w: DivWorld, cmd: DivCommand): DivDispatchResult {
  if (DIV_ONLY_TYPES.has(cmd.type)) {
    if (w.safety.stoppedByTeacher) return no('TEACHER_STOP');
    if (!w.ppe) {
      errB(w, 'E68', 'PPE_REQUIRED', 'CRITICAL');
      return no('PPE');
    }
    return divOnly(w, cmd);
  }
  const c = cmd as CellCommand;
  if (!w.ppe) return dispatchCell(w, c);
  switch (c.type) {
    case 'squeezeDropper':
      return squeeze(w, c);
    case 'setPose':
      return setPose(w, c);
    case 'turnTurret':
      return turret(w, c.deltaDeg, c.grip ?? 'nosepiece');
    case 'turnCoarse': {
      // Macro hacia la preparación con el 100X: zona de contacto inmediato (CEL-029); el macro no se usa a 100X.
      if (lockedObjective(w) === 100 && c.deltaTurns > 0 && w.microscope.slideOnStage) {
        errB(w, 'CEL-029', 'COARSE_AT_100X', 'ALERT');
        return no('COARSE_AT_100X');
      }
      return dispatchCell(w, c);
    }
    case 'setPower':
      if (c.device === 'microscope' && c.on && w.div.micWet) return no('MIC_WET');
      return dispatchCell(w, c);
    case 'wipe':
      return wipe(w, c);
    case 'lowerCover': {
      const r = dispatchCell(w, c);
      if (r.ok) afterCover(w, c.slideId);
      return r;
    }
    case 'captureObservation':
      return capture(w, c);
    case 'closeBench':
      return closeBench(w);
    default:
      return dispatchCell(w, c);
  }
}

function divOnly(w: DivWorld, cmd: DivCommand): DivDispatchResult {
  switch (cmd.type) {
    case 'classifySample': {
      if (!DIV_SPECIMENS.includes(cmd.specimen) && !(cmd.specimen === 'cyano' && scC(w, SC_B06.CYANO_OPTION))) return no('BAD_SPECIMEN');
      w.div.classification[cmd.specimen] = cmd.choice;
      flagB(w, `classified:${cmd.specimen}`);
      emitB(w, 'SAMPLE_CLASSIFIED', 'INFO', { obj: cmd.specimen });
      return ok();
    }
    case 'peelEpidermis':
      return peel(w, cmd.sourceId, cmd.toolId, cmd.thicknessMm, cmd.lengthCm);
    case 'labelSlide':
      return labelSlide(w, cmd.slideId, cmd.label);
    case 'shiftCover':
      return shiftCover(w, cmd.slideId, cmd.dxCm);
    case 'addImmersionOil':
      return addOil(w, cmd.slideId, cmd.drops);
    case 'selectObjective': {
      const p = w.params.microscope;
      if (!(objectivesOf(p) as number[]).includes(cmd.objectiveX)) {
        // Sin módulo de inmersión no hay 100X (CEL-039): el comando se rechaza, no se finge el objetivo.
        errB(w, 'CEL-039', 'OBJECTIVE_UNAVAILABLE', 'WARN', { x: cmd.objectiveX });
        return no('OBJECTIVE_UNAVAILABLE');
      }
      const target = turretDegFor(cmd.objectiveX as ObjectiveX, p);
      let delta = (((target - w.microscope.turretDeg) % 360) + 360) % 360;
      if (delta > 180) delta -= 360;
      return turret(w, r6(delta), 'nosepiece');
    }
    case 'recordMotility':
      return recordMotility(w, cmd.slideId);
    case 'estimateSpeed': {
      // Sin video con escala temporal no hay velocidad (REF-09): el resultado es «no evaluable», nunca un número.
      const l = liveOf(w, cmd.slideId);
      if (!l) return no('NO_LIVE_SAMPLE');
      if (scC(w, SC_B06.EUG_MOTILITY) || scC(w, SC_B06.PAR_MOTILITY)) incident(w, `video:${l.kind}`);
      return no('NOT_EVALUABLE');
    }
    case 'requestProtistVideo': {
      const assigned = cmd.kind === 'euglena' ? scC(w, SC_B06.EUG_MOTILITY) : scC(w, SC_B06.PAR_MOTILITY);
      if (!assigned) return no('NOT_ASSIGNED');
      // La biblioteca no trae videos auténticos de protistas: incidencia sin descuento (§4.3, PCEL-4).
      incident(w, `${cmd.kind}Video`);
      return no('ASSET_UNAVAILABLE');
    }
    case 'markRegion':
      return markRegion(w, cmd.observationId, cmd.structure, cmd.u, cmd.v);
    case 'measure':
      return measure(w, cmd.observationId, cmd.ax, cmd.ay, cmd.bx, cmd.by, cmd.scale);
    case 'goStation': {
      w.div.station = cmd.station;
      // Cambiar de estación con el bisturí en la mano (CEL-004): riesgo persistente hasta depositarlo.
      if (w.objects.sc?.support === 'hand') {
        w.div.sharpCarried = true;
        errB(w, 'CEL-004', 'SHARP_CARRIED', 'ALERT');
      }
      return ok();
    }
    case 'useLancet':
      // No hay punción ni sangre fresca (§3.1, PCEL-3): se ofrece el frotis preparado por el docente.
      errB(w, 'CEL-005', 'LANCET_FORBIDDEN', 'CRITICAL');
      emitB(w, 'USE_PREPARED_SMEAR', 'INFO');
      return no('LANCET_FORBIDDEN');
    case 'openCulture':
      // Cultivo de B. cereus cerrado (§11): no se abre; se observa la lámina permanente.
      errB(w, 'CEL-006', 'OPEN_CULTURE_FORBIDDEN', 'CRITICAL', { obj: cmd.id });
      emitB(w, 'USE_FIXED_SLIDE', 'INFO');
      return no('BIOSAFETY');
    default:
      return dispatchCell(w, cmd as CellCommand);
  }
}

// ─────────────────────────── Preparaciones ───────────────────────────

/** Epidermis inferior de Tradescantia separada con la pinza: el espesor sale del gesto (CEL-011 si es gruesa). */
function peel(w: DivWorld, sourceId: string, toolId: string, thicknessMm: number, lengthCm: number): DivDispatchResult {
  const src = w.cell.sources[sourceId];
  if (!src || src.kind !== 'tradescantia') return no('BAD_SOURCE');
  if (toolId !== 'fc') return no('USE_FORCEPS');
  if (w.forceps.holding || w.cell.held.fc) return no('TOOL_BUSY');
  const p = w.params.cellPrep!;
  const f = peelFragment(p, 'tradescantia', sourceId, thicknessMm, lengthCm);
  if (f.massMg > src.massMg) return no('EMPTY');
  const prev = w.cell.toolResidue.fc;
  if (prev && prev !== 'tradescantia') f.contamination01 = clamp(f.contamination01 + 0.4, 0, 1);
  w.cell.toolResidue.fc = 'tradescantia';
  src.massMg = r6(src.massMg - f.massMg);
  w.cell.held.fc = f;
  w.forceps.holding = { kind: 'specimen', assetId: 'tradescantia', sourceId, fragmentCm: Math.max(0.2, Math.sqrt(2 * f.areaMm2) / 10) };
  if (f.thicknessMm > p.thickMaxMm) errB(w, 'CEL-011', 'PEEL_TOO_THICK', 'WARN', { obj: sourceId, mm: f.thicknessMm });
  flagB(w, 'peeled');
  emitB(w, 'EPIDERMIS_PEELED', 'INFO', { obj: sourceId, mm: f.thicknessMm });
  return ok({ value: f.thicknessMm });
}

/** Etiqueta del portaobjetos: si no coincide con el protista montado, la identidad queda en discrepancia (CEL-020). */
function labelSlide(w: DivWorld, slideId: string, label: string): DivDispatchResult {
  if (!w.slides[slideId] || w.slides[slideId].kind === 'fixed') return no('BAD_TARGET');
  w.div.labels[slideId] = label;
  checkLabel(w, slideId);
  return ok();
}

function checkLabel(w: DivWorld, slideId: string) {
  const label = w.div.labels[slideId];
  const kind = w.mounts[slideId]?.cell?.zones[0]?.kind;
  if (label && kind && (label === 'euglena' || label === 'paramecium') && label !== kind) errB(w, 'CEL-020', 'LABEL_MISMATCH', 'WARN', { obj: slideId });
}

/** Gotero de cultivo vivo: la gota (medio acuoso) se cuenta en el balance de líquido; sus organismos, en la biomasa. */
function cultureDrop(w: DivWorld, cmd: Extract<CellCommand, { type: 'squeezeDropper' }>): DivDispatchResult {
  const kind = CULTURES[cmd.dispenserId];
  const before = w.mounts[cmd.targetId] ? liquidMl(w.mounts[cmd.targetId]) : 0;
  const r = dispatchCell(w, cmd);
  if (!r.ok) return r;
  const m = isPrep(w.objects[cmd.targetId]?.support) ? mountOn(w, cmd.targetId) : null;
  if (!m || liquidMl(m) <= before + 1e-9 || m.coverId) return r;
  m.cell ??= emptyCellInfo();
  const zones = m.cell.zones;
  if (zones.length) {
    // Otro cultivo sobre la misma gota: identidad mezclada (CEL-020), la lámina no sirve para comparar.
    if (zones[0].kind !== kind) {
      m.cell.mixed = true;
      errB(w, 'CEL-020', 'CULTURES_MIXED', 'WARN', { obj: cmd.targetId });
    }
    return r;
  }
  if (zones.length === 0 && m.specimenId) return r;
  const src = w.cell.sources[cmd.dispenserId];
  const mass = Math.min(src.massMg, DROP_CELLS_MG);
  src.massMg = r6(src.massMg - mass);
  const z: CellZone = { specimenId: `m:${kind}:${++w.cell.zoneSeq}`, kind, asset: '', centerCm: [r6(cmd.dxCm), r6(cmd.dyCm)], prep: 'drop', thicknessMm: 0.1, areaMm2: 20, tear01: 0, massMg: mass };
  addZone(w, m, z, cmd.targetId, 0);
  m.wetsSpecimen = true;
  w.div.live[cmd.targetId] = { kind, viability01: 1, lugolAt: null, nigrosinAt: null, heatS: 0, motility: null, motilityAt: null, dragged: false };
  checkLabel(w, cmd.targetId);
  flagB(w, `culture:${kind}`);
  return r;
}

function squeeze(w: DivWorld, cmd: Extract<CellCommand, { type: 'squeezeDropper' }>): DivDispatchResult {
  // Gota directamente sobre el microscopio (CEL-007): derrame, luz cortada y bloqueo eléctrico hasta secarlo.
  if (cmd.targetId === 'mic') {
    const r = dispatchCell(w, { ...cmd, targetId: 'bench', dxCm: 99, dyCm: 99 });
    if (!r.ok) return r;
    w.div.micWet = true;
    w.microscope.power = false;
    w.safety.block = { code: 'MIC_WET', since: w.timeS };
    errB(w, 'CEL-007', 'LIQUID_ON_MICROSCOPE', 'CRITICAL');
    return r;
  }
  if (cmd.dispenserId === 'wri' || cmd.dispenserId === 'buf' || (cmd.dispenserId === 'dw' && w.div.wright[cmd.targetId])) return wright(w, cmd.dispenserId, cmd.targetId);
  if (CULTURES[cmd.dispenserId]) return cultureDrop(w, cmd);
  const reagent = w.dispensers[cmd.dispenserId]?.reagent;
  const r = dispatchCell(w, cmd);
  const l = liveOf(w, cmd.targetId);
  if (!r.ok || !l || (r.value ?? 0) <= 0) return r;
  const m = w.mounts[cmd.targetId];
  if (reagent === 'lugol' && l.lugolAt === null && (m?.cell?.stainMl.lugol ?? 0) > 1e-9) {
    l.lugolAt = w.timeS;
    // Lugol antes de registrar la movilidad (CEL-042): la observación viva queda invalidada.
    if (!l.motility) errB(w, 'CEL-042', 'LUGOL_BEFORE_MOTILITY', 'WARN', { obj: cmd.targetId });
  }
  if (reagent === 'nigrosin' && l.nigrosinAt === null) l.nigrosinAt = w.timeS;
  // Metilcelulosa por encima de la fracción autorizada (CEL-041): viscosidad excesiva que interfiere con la imagen.
  if (reagent === 'methylcellulose' && mcFraction(w, cmd.targetId) > dp(w).mcMaxFraction) errB(w, 'CEL-041', 'METHYLCELLULOSE_EXCESS', 'WARN', { obj: cmd.targetId });
  return r;
}

/** Comparación con metilcelulosa (SC-PROT-METHYL): cubrir sin viscosante antes de tener la preparación con viscosante (CEL-040). */
function afterCover(w: DivWorld, slideId: string) {
  const l = liveOf(w, slideId);
  if (!l || !scC(w, SC_B06.PROT_METHYL)) return;
  const withMc = (id: string) => (w.mounts[id]?.cell?.stainMl.methylcellulose ?? 0) > 1e-9;
  if (withMc(slideId)) flagB(w, `mcMount:${l.kind}`);
  else if (!w.evidence[`mcMount:${l.kind}`]) errB(w, 'CEL-040', 'METHYLCELLULOSE_OMITTED', 'WARN', { obj: slideId });
}

/** Mover el cubreobjetos sobre una muestra viva (CEL-022): arrastra y daña a los organismos. */
function shiftCover(w: DivWorld, slideId: string, dxCm: number): DivDispatchResult {
  const m = w.mounts[slideId];
  if (!m?.coverId) return no('NO_COVER');
  m.coverOffsetCm = [r6(m.coverOffsetCm[0] + dxCm), m.coverOffsetCm[1]];
  const l = liveOf(w, slideId);
  if (l && Math.abs(dxCm) > dp(w).coverDragCm) {
    l.dragged = true;
    l.viability01 = r6(clamp(l.viability01 - 0.5, 0, 1));
    m.damage01 = clamp(m.damage01 + 0.3, 0, 1);
    errB(w, 'CEL-022', 'LIVE_SAMPLE_DRAGGED', 'WARN', { obj: slideId });
  }
  return ok();
}

/** Tinción de Wright de la lámina fijada sin teñir: colorante, tampón y enjuague (CEL-060 si se enjuaga sin tampón). */
function wright(w: DivWorld, dropperId: string, slideId: string): DivDispatchResult {
  const st = w.div.wright[slideId];
  const sup = w.objects[slideId]?.support ?? '';
  if (!st || !(isPrep(sup) || sup === 'bench')) {
    if (dropperId === 'dw') return dispatchCell(w, { type: 'squeezeDropper', dispenserId: 'dw', targetId: slideId, force01: 0.5, dxCm: 0, dyCm: 0 });
    return no('BAD_TARGET');
  }
  const vol = dp(w).stainDropMl;
  if (dropperId === 'dw') {
    const d = w.dispensers.dw;
    if (!d || d.ml < vol) return no('EMPTY');
    if (st.wrightAt === null) return no('NOTHING_TO_RINSE');
    d.ml = r6(d.ml - vol);
    w.fluids.wasteMl = r6(w.fluids.wasteMl + vol);
    w.div.ledger.wri.wasteMl = r6(w.div.ledger.wri.wasteMl + st.wrightMl);
    w.div.ledger.buf.wasteMl = r6(w.div.ledger.buf.wasteMl + st.bufferMl);
    st.wrightMl = 0;
    st.bufferMl = 0;
    st.rinsedAt = w.timeS;
    const p = dp(w);
    const wrightS = (st.bufferAt ?? w.timeS) - st.wrightAt;
    const bufferS = st.bufferAt === null ? 0 : w.timeS - st.bufferAt;
    if (st.bufferAt === null) errB(w, 'CEL-060', 'WRIGHT_WITHOUT_BUFFER', 'WARN', { obj: slideId });
    w.slides[slideId].assetId = st.bufferAt !== null && wrightS >= p.wrightMinS && bufferS >= p.bufferMinS ? 'blood' : 'bloodWrightWeak';
    flagB(w, 'wrightDone');
    emitB(w, 'WRIGHT_RINSED', 'INFO', { obj: slideId });
    return ok();
  }
  const key = dropperId as 'wri' | 'buf';
  if (w.div.bottles[key] < vol) return no('EMPTY');
  if (st.rinsedAt !== null) return no('ALREADY_STAINED');
  if (key === 'buf' && st.wrightAt === null) return no('WRIGHT_FIRST');
  w.div.bottles[key] = r6(w.div.bottles[key] - vol);
  if (key === 'wri') {
    st.wrightMl = r6(st.wrightMl + vol);
    st.wrightAt ??= w.timeS;
  } else {
    st.bufferMl = r6(st.bufferMl + vol);
    st.bufferAt ??= w.timeS;
  }
  emitB(w, 'DROP_ADDED', 'INFO', { obj: slideId, r: key });
  return ok({ value: vol });
}

// ─────────────────────────── Poses, limpieza y aceite ───────────────────────────

function setPose(w: DivWorld, cmd: Extract<CellCommand, { type: 'setPose' }>): DivDispatchResult {
  const { id, support } = cmd;
  const o = w.objects[id];
  if (!o) return dispatchCell(w, cmd);
  const changes = !!support && support !== o.support;
  if (changes) {
    // Portaobjetos ya rajado (CEL-003) y lámina permanente marcada como quebrada (CEL-051): no se montan.
    if (w.div.brokenSlides.includes(id) && (isPrep(support) || support === 'stage')) {
      errB(w, 'CEL-003', 'BROKEN_SLIDE', 'WARN', { obj: id });
      return no('BROKEN_SLIDE');
    }
    if (w.div.brokenFixed.includes(id) && (support === 'stage' || isPrep(support))) {
      errB(w, 'CEL-051', 'BROKEN_FIXED_SLIDE', 'WARN', { obj: id });
      return no('BROKEN_FIXED_SLIDE');
    }
    // Lámina con aceite de vuelta a la caja: primero se limpia con papel óptico (§11).
    if (support!.startsWith('case:') && (w.div.oil[id] ?? 0) > 1e-9) return no('OIL_ON_SLIDE');
  }
  const r = dispatchCell(w, cmd);
  if (!r.ok || !changes) return r;
  // Muestra o portaobjetos apoyado en la zona sin desinfectar (CEL-002): queda contaminado.
  if (support === 'dirtyZone' && w.slides[id]) {
    w.slides[id].dirty01 = Math.max(w.slides[id].dirty01, 0.7);
    const m = w.mounts[id];
    if (m) m.contamination01 = clamp(m.contamination01 + 0.5, 0, 1);
    errB(w, 'CEL-002', 'DIRTY_BENCH', 'WARN', { obj: id });
  }
  // Vidrio roto en residuos comunes (CEL-008): debe ir al contenedor rígido de vidrio.
  const broken = w.div.brokenSlides.includes(id) || w.div.brokenFixed.includes(id) || w.covers[id]?.state === 'broken';
  if (broken && support === 'trashBin') errB(w, 'CEL-008', 'GLASS_IN_TRASH', 'ALERT', { obj: id });
  if (id === 'sc' && support !== 'hand') w.div.sharpCarried = false;
  return r;
}

function wipe(w: DivWorld, cmd: Extract<CellCommand, { type: 'wipe' }>): DivDispatchResult {
  const { targetId, toolId } = cmd;
  // Microscopio mojado: se seca con papel absorbente; recién entonces se rearma la seguridad eléctrica.
  if (targetId === 'mic') {
    if (!w.div.micWet) return no('NOTHING');
    if (toolId !== 'pp') return no('BAD_TOOL');
    w.div.micWet = false;
    if (w.safety.block?.code === 'MIC_WET') w.safety.block = null;
    flagB(w, 'micDried');
    return ok();
  }
  // Lente del objetivo en posición: el papel óptico quita también el aceite; el pañuelo raya (E65 → CEL-038).
  if (targetId === 'mic:lens') {
    const r = dispatchCell(w, cmd);
    if (r.ok) {
      const obj = lockedObjective(w);
      const ml = obj !== null ? w.div.lensOil[obj] : 0;
      if (obj !== null && ml) {
        delete w.div.lensOil[obj];
        w.div.ledger.oil.wasteMl = r6(w.div.ledger.oil.wasteMl + ml);
        w.div.ledger.oil.spilledMl = r6(w.div.ledger.oil.spilledMl - ml);
        flagB(w, `lensOilCleaned:${obj}`);
      }
    }
    return r;
  }
  // Aceite sobre una lámina permanente: papel óptico.
  if ((w.div.oil[targetId] ?? 0) > 1e-9) {
    if (toolId !== 'lp') return no('BAD_TOOL');
    w.div.ledger.oil.wasteMl = r6(w.div.ledger.oil.wasteMl + w.div.oil[targetId]);
    delete w.div.oil[targetId];
    flagB(w, `oilCleaned:${targetId}`);
    emitB(w, 'OIL_CLEANED', 'INFO', { obj: targetId });
    return ok();
  }
  return dispatchCell(w, cmd);
}

/** Aceite que una lente seca arrastra al tocar la gota (mL; pasa del portaobjetos a la lente). */
const LENS_OIL_ML = 0.005;

/** Gota de aceite de inmersión sobre la lámina (solo con el módulo 100X). Con el 40X seco en el camino, lo contamina (CEL-027). */
function addOil(w: DivWorld, slideId: string, drops: number): DivDispatchResult {
  if (!w.div.immersion) return no('NO_IMMERSION_MODULE');
  if (!w.slides[slideId]) return no('BAD_TARGET');
  const vol = r6(clamp(Math.round(drops), 1, 5) * dp(w).oilDropMl);
  if (w.div.bottles.oil < vol) return no('EMPTY');
  w.div.bottles.oil = r6(w.div.bottles.oil - vol);
  w.div.oil[slideId] = r6((w.div.oil[slideId] ?? 0) + vol);
  flagB(w, `oil:${slideId}`);
  emitB(w, 'OIL_ADDED', 'INFO', { obj: slideId, ml: vol });
  const obj = lockedObjective(w);
  if (w.microscope.slideOnStage === slideId && obj !== null && obj !== 100 && obj >= 40) contaminateLens(w, obj, slideId, 'CEL-027');
  return ok({ value: vol });
}

function contaminateLens(w: DivWorld, obj: number, slideId: string, code: 'CEL-027' | 'CEL-053') {
  if (!w.div.lensOil[obj]) {
    // La lente arrastra parte de la gota: ese aceite queda como «derrame» del balance hasta limpiarla.
    const take = r6(Math.min(LENS_OIL_ML, w.div.oil[slideId] ?? 0));
    w.div.oil[slideId] = r6((w.div.oil[slideId] ?? 0) - take);
    w.div.ledger.oil.spilledMl = r6(w.div.ledger.oil.spilledMl + take);
    w.div.lensOil[obj] = Math.max(take, 1e-9);
  }
  errB(w, code, code === 'CEL-027' ? 'OIL_ON_DRY_LENS' : 'OIL_SMEARED', 'WARN', { x: obj });
}

/** Revólver: el 40X seco que entra en una gota de aceite queda contaminado (CEL-027; con exceso de aceite, CEL-053). */
function turret(w: DivWorld, deltaDeg: number, grip: 'nosepiece' | 'objective'): DivDispatchResult {
  const prev = lockedObjective(w);
  const r = dispatchCell(w, { type: 'turnTurret', deltaDeg, grip });
  const obj = lockedObjective(w);
  const slide = w.microscope.slideOnStage;
  if (r.ok && slide && obj !== null && obj !== prev && obj >= 40 && obj !== 100 && (w.div.oil[slide] ?? 0) > 1e-9) {
    contaminateLens(w, obj, slide, (w.div.oil[slide] ?? 0) > dp(w).oilMaxMl ? 'CEL-053' : 'CEL-027');
  }
  return r;
}

// ─────────────────────────── Observación ───────────────────────────

/** Burbujas del montaje en coordenadas normalizadas del activo de la zona observada. */
function bubblesIn(w: DivWorld, slideId: string, originMm: [number, number], extentMm: [number, number]): [number, number, number][] {
  const m = w.mounts[slideId];
  if (!m) return [];
  const out: [number, number, number][] = m.bubbles.map((b) => {
    const x = m.coverOffsetCm[0] * 10 + b.x - originMm[0];
    const y = m.coverOffsetCm[1] * 10 + b.y - originMm[1];
    return [r6(0.5 + x / extentMm[0]), r6(0.5 + y / extentMm[1]), r6(b.r / Math.max(...extentMm))];
  });
  // Un cultivo con aire atrapado muestra la burbuja típica del medio, fuera de los organismos.
  const z = m.cell?.zones[0];
  if (z && (z.kind === 'euglena' || z.kind === 'paramecium') && m.bubbleFraction > 0.05) out.push([...DIV_LAYOUT.cultureBubble]);
  return out;
}

function capture(w: DivWorld, cmd: Extract<CellCommand, { type: 'captureObservation' }>): DivDispatchResult {
  const v = cmd.instrument === 'compound' ? microscopeView(w) : null;
  const r = dispatchCell(w, cmd);
  if (!r.ok || !v || !r.id) return r;
  const o = w.observations[r.id];
  const slide = o.slideId ?? '';
  const obj = o.objectiveX ?? 0;
  const extra: string[] = [];
  const oil = (w.div.oil[slide] ?? 0) >= dp(w).oilMinMl - 1e-9;
  // 100X sin aceite (CEL-026): imagen degradada, no se acredita.
  if (obj === 100 && !oil) {
    extra.push('NO_OIL');
    errB(w, 'CEL-026', 'NO_IMMERSION_OIL', 'WARN', { obj: slide });
  }
  // Lente seca con aceite: «prohibido el alto aumento hasta limpiar» (§11).
  if (obj && w.div.lensOil[obj]) extra.push('LENS_OIL');
  const l = liveOf(w, slide);
  if (l) {
    const p = dp(w);
    const blurUm = predictedSpeedUmS(w, slide) * p.exposureS;
    if (blurUm > o.fovMm * 1000 * p.blurFovFraction) extra.push('MOTION_BLUR');
    if (mcFraction(w, slide) > p.mcMaxFraction) extra.push('VISCOUS');
  }
  const wrong = WRONG_OBJECTIVE_ASSETS[o.assetId];
  if (wrong !== undefined && obj === wrong) {
    // Foto docente tomada a otro objetivo que el declarado (CEL-074): incidencia administrativa, sin descuento.
    extra.push('ASSET_OBJECTIVE');
    incident(w, `objective:${o.assetId}`);
  }
  if (extra.length) {
    for (const x of extra) if (!o.issues.includes(x)) o.issues.push(x);
    if (o.isObservationValid) {
      o.isObservationValid = false;
      o.visibleRegionIds = [];
    }
    o.captureHash = stableHash({ a: w.assignment.assignmentHash, o: { ...o, captureHash: '' } });
  }
  const asset = assetById(o.assetId);
  w.div.obsMeta[o.id] = { bubbles: asset ? bubblesIn(w, slide, v.originMm, asset.extentMm) : [], live: !!l, oil };
  if (o.isObservationValid) {
    const kind = FIXED_KIND[slide] ?? w.mounts[slide]?.cell?.zones.find((z) => z.specimenId === o.specimenId)?.kind ?? null;
    if (kind) flagB(w, `divCapture:${kind}:${obj}`);
  }
  return r;
}

/** Registro cualitativo de movilidad (modelo predictivo, no evidencia temporal): requiere la muestra viva enfocada. */
function recordMotility(w: DivWorld, slideId: string): DivDispatchResult {
  const l = liveOf(w, slideId);
  if (!l) return no('NO_LIVE_SAMPLE');
  if (w.microscope.slideOnStage !== slideId || w.view.instrument !== 'compound') return no('NOT_VIEWING');
  const v = microscopeView(w);
  if (!v.locked || v.sharpness01 < w.params.microscope.sharpnessValid || !v.visible.length) return no('NOT_OBSERVED');
  if (l.lugolAt !== null) {
    l.motility = 'immobile';
    l.motilityAt = w.timeS;
    return ok({ value: 0 });
  }
  if (l.viability01 < dp(w).immobileBelow) {
    l.motility = 'immobile';
    l.motilityAt = w.timeS;
    errB(w, 'CEL-045', 'PROTISTS_IMMOBILE', 'WARN', { obj: slideId });
    return ok({ value: 0 });
  }
  l.motility = 'moving';
  l.motilityAt = w.timeS;
  const mc = (w.mounts[slideId]?.cell?.stainMl.methylcellulose ?? 0) > 1e-9;
  flagB(w, `motility:${l.kind}:${mc ? 'mc' : 'plain'}`);
  emitB(w, 'MOTILITY_RECORDED', 'INFO', { obj: slideId, kind: l.kind });
  return ok({ value: 1 });
}

/** Punto (0–1 en la captura) → coordenadas normalizadas del activo. */
function toAsset(o: { normalizedViewport: [number, number, number, number] }, u: number, v: number): [number, number] {
  const [cx, cy, vw, vh] = o.normalizedViewport;
  return [cx + (clamp(u, 0, 1) - 0.5) * vw, cy + (clamp(v, 0, 1) - 0.5) * vh];
}

/** Marca de región sobre una captura propia: el manifiesto decide si la estructura está anotada, visible y en el punto. */
function markRegion(w: DivWorld, observationId: string, structure: MarkStructure, u: number, v: number): DivDispatchResult {
  const o = w.observations[observationId];
  if (!o || o.instrument !== 'compound') return no('NO_OBSERVATION');
  const meta = w.div.obsMeta[observationId];
  const asset = assetById(o.assetId);
  if (!asset || !meta) return no('NO_OBSERVATION');
  // Sin captura válida no hay región que rotular (CEL-065 en la libreta): se rechaza sin acreditar nada.
  if (!o.isObservationValid) return no('NOT_OBSERVED');
  const [x, y] = toAsset(o, u, v);
  const at = (s: StructureId) => asset.annotations.filter((a) => a.structureId === s && circleHitsPolygon(x, y, 0.004, a.polygonNormalized));
  const kind = FIXED_KIND[o.slideId ?? ''] ?? null;
  const bacterial = asset.assetId === 'bacillus' || asset.assetId === 'cyano' || kind === 'bacillus' || kind === 'cyano';
  let verdict: RegionMark['verdict'];
  let hit: StructureId | null = null;
  const bubble = meta.bubbles.some(([bx, by, br]) => Math.hypot(x - bx, y - by) <= br);
  if (structure === 'nucleolus' && bacterial) {
    // Las bacterias no tienen nucléolo (REF-08, PCEL-1): la marca nunca vale, sea cual sea la imagen.
    verdict = 'never';
    errB(w, 'CEL-054', 'BACTERIAL_NUCLEOLUS', 'WARN', { obj: observationId });
  } else if (bubble) {
    verdict = 'bubble';
    if (structure === 'contractileVacuole' || structure === 'foodVacuole' || structure === 'vacuole') errB(w, 'CEL-049', 'VACUOLE_ON_BUBBLE', 'WARN', { obj: observationId });
    else errB(w, 'CEL-021', 'BUBBLE_AS_CELL', 'WARN', { obj: observationId });
  } else {
    const own = structure === 'nucleolus' ? [] : at(structure as StructureId);
    const visible = own.find((a) => (a.evidence ?? 'visible') === 'visible' && o.visibleRegionIds.includes(structure as StructureId));
    if (visible) {
      verdict = 'valid';
      hit = structure as StructureId;
    } else if (own.length) {
      verdict = 'not-visible';
      hit = structure as StructureId;
      if (structure === 'flagellum') errB(w, 'CEL-044', 'FLAGELLUM_NOT_VALIDATED', 'WARN', { obj: observationId });
      if (structure === 'cilia') errB(w, 'CEL-048', 'CILIA_NOT_VALIDATED', 'WARN', { obj: observationId });
    } else {
      const under = (['erythrocyte', 'leukocyte', 'platelet', 'stoma', 'guardCells', 'parameciumCell', 'euglenaCell'] as StructureId[]).find((s) => at(s).length);
      hit = under ?? null;
      verdict = under ? 'wrong' : 'outside';
      if (structure === 'flagellum') errB(w, 'CEL-044', 'FLAGELLUM_NOT_VALIDATED', 'WARN', { obj: observationId });
      else if (structure === 'cilia') errB(w, 'CEL-048', 'CILIA_NOT_VALIDATED', 'WARN', { obj: observationId });
      else if (WBC_SUBTYPES.includes(structure)) errB(w, 'CEL-058', 'WBC_SUBTYPE_INVENTED', 'WARN', { obj: observationId });
      else if (structure === 'leukocyte' && under === 'erythrocyte') errB(w, 'CEL-056', 'RBC_AS_WBC', 'WARN', { obj: observationId });
      else if (structure === 'erythrocyte' && under === 'platelet') errB(w, 'CEL-057', 'PLATELET_AS_RBC', 'WARN', { obj: observationId });
    }
  }
  const mark: RegionMark = { id: `mk${++w.div.seq}`, observationId, structure, u: r6(u), v: r6(v), verdict, hit, assetId: o.assetId, objectiveX: o.objectiveX ?? 0 };
  w.div.marks.push(mark);
  if (verdict === 'valid') flagB(w, `mark:${structure}`);
  emitB(w, 'REGION_MARKED', verdict === 'valid' ? 'INFO' : 'WARN', { obj: structure, v: verdict });
  return ok({ id: mark.id, value: verdict === 'valid' ? 1 : 0 });
}

/** Medición entre dos puntos (px de la captura): solo con escala certificada (REF-05…07). */
function measure(w: DivWorld, observationId: string, ax: number, ay: number, bx: number, by: number, scale: 'calibration' | 'assumed'): DivDispatchResult {
  const o = w.observations[observationId];
  if (!o || o.instrument !== 'compound') return no('NO_OBSERVATION');
  if (!o.isObservationValid) return no('NOT_OBSERVED');
  // Escala inventada por el estudiante (CEL-055): se rechaza con UNCALIBRATED_SCALE.
  if (scale === 'assumed') {
    errB(w, 'CEL-055', 'MEASURE_WITHOUT_SCALE', 'WARN', { obj: observationId });
    return no('UNCALIBRATED_SCALE');
  }
  // El manifiesto no trae escala (SC-NO-SCALE, CEL-073): no evaluable, sin penalización.
  if (!w.div.scale.available) {
    incident(w, `scale:${o.assetId}`);
    return no('UNCALIBRATED_SCALE');
  }
  const p = dp(w);
  const px = r6(Math.hypot(bx - ax, by - ay));
  if (px <= 0) return no('ZERO_LENGTH');
  const umPerPx = r6((o.fovMm * 1000) / p.imagePx);
  const uS = umPerPx * (w.div.scale.traceable ? p.scaleRelUTraceable : p.scaleRelU);
  const { lengthUm, uncertaintyUm } = lengthWithUncertainty(px, umPerPx, uS, p.pointUPx);
  const id = `len${++w.div.seq}`;
  w.div.measurements.push({
    id, observationId, assetId: o.assetId, objectiveX: o.objectiveX ?? 0, rawPixelDistance: px, umPerPx, lengthUm, uncertaintyUm,
    calibrationHash: stableHash({ fov: o.fovMm, px: p.imagePx, t: w.div.scale.traceable }), seg: [ax, ay, bx, by],
  });
  flagB(w, `len:${id}`);
  emitB(w, 'MEASURED', 'INFO', { obj: observationId, um: Math.round(lengthUm * 100) / 100 });
  return ok({ id, value: lengthUm });
}

// ─────────────────────────── Cierre ───────────────────────────

/** Lo que el cierre de B06 agrega al de B02: lentes y láminas con aceite, microscopio mojado y bisturí en la mano. */
export function divOutstanding(w: DivWorld): string[] {
  const out = cellOutstanding(w);
  for (const obj of Object.keys(w.div.lensOil)) out.push(`lensOil:${obj}`);
  for (const [id, ml] of Object.entries(w.div.oil)) if (ml > 1e-9 && w.slides[id]?.kind === 'fixed') out.push(`oil:${id}`);
  if (w.div.micWet) out.push('micWet');
  if (w.objects.sc?.support === 'hand') out.push('sc');
  for (const id of [...w.div.brokenSlides, ...w.div.brokenFixed]) if (w.objects[id]?.support === 'trashBin') out.push(`glass:${id}`);
  return out;
}

function closeBench(w: DivWorld): DivDispatchResult {
  // Objetivo o lámina con aceite al terminar (CEL-059).
  if (Object.keys(w.div.lensOil).length || Object.entries(w.div.oil).some(([id, ml]) => ml > 1e-9 && w.slides[id]?.kind === 'fixed')) errB(w, 'CEL-059', 'OIL_LEFT', 'WARN');
  const extra = divOutstanding(w).filter((x) => !cellOutstanding(w).includes(x));
  const had = w.evidence.benchRestored;
  const r = dispatchCell(w, { type: 'closeBench' });
  if (extra.length) {
    if (!had) delete w.evidence.benchRestored;
    return { ...r, value: 0 };
  }
  return r;
}

// ─────────────────────────── Paso fijo ───────────────────────────

export function stepDivWorld(w: DivWorld): void {
  stepCellWorld(w);
  // Sangre y bacterias no resuelven ninguna estructura a 4X: enfocar la lámina a 4X ya es localizarla (si no, el paso a
  // 40X contaría como CEL-025 aunque se empezara por el 4X).
  if (w.view.instrument === 'compound' && w.tick % 4 === 0 && !w.evidence.located4x) {
    const v = microscopeView(w);
    if (v.objectiveX === 4 && v.slideId && FIXED_KIND[v.slideId] && v.assetId && v.sharpness01 >= w.params.microscope.sharpnessValid && !v.lightIssues.includes('LIGHT_OFF')) flagB(w, 'located4x');
  }
  const dt = w.params.dtS;
  const p = dp(w);
  const mp = w.params.mount;
  for (const [id, l] of Object.entries(w.div.live)) {
    const m = w.mounts[id];
    if (!m) continue;
    const before = l.viability01;
    let loss = 0;
    // Gota secándose (sin cubreobjetos o sin medio): pierde viabilidad.
    if (liquidMl(m) < mp.needMl * 0.5 || m.hydrated01 < 0.5) loss += p.dryLossPerS * dt;
    if (l.nigrosinAt !== null) loss += p.nigrosinLossPerS * dt;
    if (l.lugolAt !== null && w.timeS - l.lugolAt >= p.lugolKillS) l.viability01 = 0;
    // Lámpara intensa sobre la preparación viva durante mucho tiempo: calor.
    if (w.microscope.slideOnStage === id && w.microscope.power && w.microscope.light01 >= p.lampHotLight01) {
      l.heatS = r6(l.heatS + dt);
      if (l.heatS > p.lampHotS) loss += p.lampLossPerS * dt;
    }
    l.viability01 = r6(clamp(l.viability01 - loss, 0, 1));
    // Inmóviles por manejo (CEL-045): secado, calor o arrastre; el Lugol se juzga aparte (CEL-042).
    if (before >= p.immobileBelow && l.viability01 < p.immobileBelow && l.lugolAt === null) errB(w, 'CEL-045', 'PROTISTS_IMMOBILE', 'WARN', { obj: id });
  }
  // Epidermis de Tradescantia sin medio acuoso (CEL-014, como la Elodea de B02).
  for (const m of Object.values(w.mounts)) {
    const z = m.cell?.zones[0];
    if (z?.kind === 'tradescantia' && !z.premade && m.hydrated01 < 0.6 && liquidMl(m) < mp.needMl * 0.5) errB(w, 'E06', 'NO_MOUNT_LIQUID', 'WARN', { obj: m.slideId });
  }
  if (w.tick % 4 === 0) for (const m of Object.values(w.mounts)) if (m.cell) refreshAssets(w, m);
}

export function runDivFor(w: DivWorld, seconds: number): void {
  const n = Math.round(seconds / w.params.dtS);
  for (let i = 0; i < n; i++) stepDivWorld(w);
}

// ─────────────────────────── Conservación ───────────────────────────

/** Balances de B02 más el aceite, el colorante de Wright y el tampón (mL; deben ser 0). */
export function conservedDiv(w: DivWorld): Record<string, number> {
  const out = conservedCell(w);
  const d = w.div;
  const onSlides = (k: 'wrightMl' | 'bufferMl') => Object.values(d.wright).reduce((a, s) => a + s[k], 0);
  out.oil = r6(d.ledger.oil.initialMl - (d.bottles.oil + Object.values(d.oil).reduce((a, v) => a + v, 0) + d.ledger.oil.wasteMl + d.ledger.oil.spilledMl));
  out.wright = r6(d.ledger.wri.initialMl - (d.bottles.wri + onSlides('wrightMl') + d.ledger.wri.wasteMl + d.ledger.wri.spilledMl));
  out.buffer = r6(d.ledger.buf.initialMl - (d.bottles.buf + onSlides('bufferMl') + d.ledger.buf.wasteMl + d.ledger.buf.spilledMl));
  return out;
}

/** Resumen para el hash de la bitácora. */
export function divSummary(w: DivWorld) {
  return {
    ...cellSummary(w),
    live: Object.entries(w.div.live).map(([id, l]) => [id, l.kind, Math.round(l.viability01 * 1000), l.motility]),
    oil: Object.entries(w.div.oil).map(([id, v]) => [id, Math.round(v * 1e5)]),
    lensOil: Object.keys(w.div.lensOil),
    marks: w.div.marks.map((m) => [m.structure, m.verdict]),
    lens: w.div.measurements.map((m) => Math.round(m.lengthUm * 1000)),
  };
}

// ─────────────────────────── Creación ───────────────────────────

export interface DivWorldExtras {
  immersion: boolean;
  oilMl: number;
  wrightMl: number;
  bufferMl: number;
  brokenSlides: string[];
  brokenFixed: string[];
  wrightSlides: string[];
  scale: { available: boolean; traceable: boolean };
}

/** Mundo B06: el mundo celular de B02 con la mesada de B06, más el estado de diversidad celular y sus balances. */
export function createDivWorld(spec: OpticalWorldSpec, cx: CellWorldExtras, x: DivWorldExtras): DivWorld {
  const w = createCellWorld(spec, cx) as DivWorld;
  const led = (ml: number) => ({ initialMl: ml, wasteMl: 0, spilledMl: 0 });
  w.div = {
    classification: {},
    immersion: x.immersion,
    bottles: { oil: x.immersion ? x.oilMl : 0, wri: x.wrightMl, buf: x.bufferMl },
    ledger: { oil: led(x.immersion ? x.oilMl : 0), wri: led(x.wrightMl), buf: led(x.bufferMl) },
    oil: {},
    lensOil: {},
    live: {},
    labels: {},
    marks: [],
    measurements: [],
    seq: 0,
    brokenSlides: [...x.brokenSlides],
    brokenFixed: [...x.brokenFixed],
    micWet: false,
    sharpCarried: false,
    station: 'A',
    wright: Object.fromEntries(x.wrightSlides.map((id) => [id, { wrightAt: null, bufferAt: null, rinsedAt: null, wrightMl: 0, bufferMl: 0 }])),
    scale: { ...x.scale },
    obsMeta: {},
  };
  return w;
}

/** Muestra (ficha) de una zona o lámina, para la libreta y la rúbrica. */
export function specimenOf(w: DivWorld, slideId: string | undefined, specimenId?: string): DivSpecimen | null {
  if (!slideId) return null;
  if (FIXED_KIND[slideId]) return FIXED_KIND[slideId];
  const k = (w.mounts[slideId]?.cell?.zones.find((z) => z.specimenId === specimenId) ?? w.mounts[slideId]?.cell?.zones[0])?.kind as CellKind | undefined;
  return k && (['euglena', 'paramecium', 'elodea', 'tradescantia', 'buccal'] as string[]).includes(k) ? (k as DivSpecimen) : null;
}

