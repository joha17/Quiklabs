/**
 * Mundo B02: células bajo la lente (§5, §6). `dispatchCell` aplica un comando: los gestos de obtención de tejido
 * (corte, raspado, hisopado, extendido) y la tinción se resuelven aquí; los instrumentos, el cubreobjetos, la caja de
 * láminas y el registro son los de B01 (`dispatchB01`), con su catálogo traducido a los códigos CEL por
 * `params.codeMap`. `stepCellWorld` avanza 0,05 s: el paso de B01 más el contacto de cada colorante, la hidratación y
 * el recurso que corresponde a la condición de cada zona. Determinista: solo `rand(w)`.
 */
import { clamp, stableHash } from '../core/math';
import { rand } from '../core/rng';
import { b01Summary, conservedB01, createOpticalWorld, dispatchB01, drainMount, isPrep, microscopeView, mountOn, nearestZone, stepB01World } from '../optical-world/world';
import { emitB, errB, flagB, latchB } from '../optical-world/events';
import { BIO_WASTE, GLASS_BIN } from '../optical-world/geometry';
import type { Pose } from '../optical-world/types';
import type { OpticalWorldSpec } from '../optical-world/world';
import { coveredFractionFor, dropVolumeMl, liquidMl, mountUsable, type FreshMount } from '../specimens/mount-world';
import {
  STAINS, cutFragment, emptyCellInfo, scrapeFragment, smearDensity, swabLoadMg, type CellFragment, type CellKind, type CellMountInfo, type CellPrepParams, type CellZone, type StainId,
} from '../specimens/thin-section';
import { CELL_RECIPES, assetFor, hasStain, lugolDeveloped, requiredStainPresent, type AssetChoice } from '../specimens/stain-model';
import type { CellCommand, CellDispatchResult } from './commands';
import type { CellWorld } from './types';
import { SLIDE_HALF, TRASH_BIN } from './geometry';

export const SC = {
  LUGOL_CONTROL: 'B02-S01_lugol_control',
  PLAIN_CONTROL: 'B02-S02_plain_control',
  THICK_SCRAPE: 'B02-S03_thick_scrape',
  BUBBLE_SLIDE: 'B02-S04_bubble_slide',
  DROPPER_JITTER: 'B02-S05_dropper_jitter',
  DENSE_ELODEA: 'B02-S06_dense_elodea',
  HARD_FOCUS: 'B02-S07_hard_focus',
  CYCLOSIS_VIDEO: 'B02-S08_cyclosis_video',
  CONTRAST_FRUITS: 'B02-S09_contrasting_fruits',
  SIMILAR_FRUITS: 'B02-S10_similar_fruits',
  CLEAR_SCLEREIDS: 'B02-S11_clear_sclereids',
  GUAVA: 'B02-S12_guava_unvalidated',
  METHYLENE_BLUE: 'B02-S13_methylene_blue',
  EOSIN_ONLY: 'B02-S14_eosin_only',
  FIXED_SLIDES: 'B02-S15_fixed_slides',
  STEREO: 'B02-S16_stereo',
  TEACHER_ASSETS: 'B02-S17_teacher_assets',
  MISSING_ASSET: 'B02-S18_missing_asset',
} as const;

export const scC = (w: CellWorld, s: string) => w.scenarios.includes(s);

const ok = (extra: Partial<CellDispatchResult> = {}): CellDispatchResult => ({ ok: true, ...extra });
const no = (code: string): CellDispatchResult => ({ ok: false, code });
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
const prep = (w: CellWorld): CellPrepParams => w.params.cellPrep!;
const CHROMO: CellKind[] = ['tomato', 'pepper', 'carrot'];

/** Comandos permitidos sin EPP confirmado (los mismos de B01). */
const PRE_PPE = new Set<CellCommand['type']>(['setPPE', 'startWork', 'inspect', 'pause', 'teacherStop', 'acknowledge']);

// ─────────────────────────── Recursos por condición ───────────────────────────

export function assetChoice(w: CellWorld): AssetChoice {
  return {
    denseElodea: scC(w, SC.DENSE_ELODEA), similarFruits: scC(w, SC.SIMILAR_FRUITS), clearSclereids: scC(w, SC.CLEAR_SCLEREIDS),
    override: w.cell.assetOverride, missing: w.cell.missingAssets,
    ...(w.cell.variants ? { div: w.cell.variants } : {}),
  };
}

/** Recurso de cada zona según su condición actual; el montaje expone el de la primera zona. */
export function refreshAssets(w: CellWorld, m: FreshMount) {
  if (!m.cell) return;
  const c = assetChoice(w);
  for (const z of m.cell.zones) z.asset = assetFor(z, m.cell, c, prep(w).lugolMinContactS);
  const z0 = m.cell.zones[0];
  m.specimenId = z0?.specimenId ?? null;
  m.specimenAsset = z0?.asset ?? null;
}

/** Largo equivalente de un fragmento (cm) para el cubrimiento del cubreobjetos (área = largo² / 2). */
const lengthOf = (z: { areaMm2: number }) => Math.max(0.2, Math.sqrt(2 * z.areaMm2) / 10);

/** Incidencia técnica sin culpa (CEL68): recurso faltante o video no disponible. Nunca es `err:*`. */
export function incident(w: CellWorld, key: string) {
  if (!w.cell.incidents.includes(key)) w.cell.incidents.push(key);
  flagB(w, `asset:unavailable:${key}`);
  latchB(w, `incident:${key}`, 'ASSET_UNAVAILABLE', 'INFO', { obj: key });
}

// ─────────────────────────── Despacho ───────────────────────────

export function dispatchCell(w: CellWorld, cmd: CellCommand): CellDispatchResult {
  if (w.safety.stoppedByTeacher && cmd.type !== 'teacherStop' && cmd.type !== 'pause') return no('TEACHER_STOP');
  if (!w.ppe && !PRE_PPE.has(cmd.type)) {
    errB(w, 'E68', 'PPE_REQUIRED', 'CRITICAL');
    return no('PPE');
  }
  switch (cmd.type) {
    case 'cutSource':
      return cutSource(w, cmd.sourceId, cmd.toolId, cmd.thicknessMm, cmd.lengthCm);
    case 'scrape':
      return scrape(w, cmd.sourceId, cmd.toolId, cmd.distanceCm, cmd.pressure01);
    case 'swab':
      return swab(w, cmd.swabId, cmd.sourceId, cmd.durationS, cmd.pressure01);
    case 'smear':
      return smear(w, cmd.swabId, cmd.slideId, cmd.lengthCm, cmd.pressure01, cmd.dxCm, cmd.dyCm);
    case 'dispose':
      return dispose(w, cmd.objectId, cmd.containerId);
    case 'recoverSpill':
      // El colorante derramado es residuo: no vuelve al gotero (CEL30).
      errB(w, 'CEL30', 'SPILL_REUSE', 'WARN', { obj: cmd.dispenserId });
      return no('SPILL_IS_WASTE');
    case 'requestVideo':
      if (!w.cell.routes.video) return no('NOT_ASSIGNED');
      // No hay un video auténtico de ciclosis en la biblioteca: incidencia sin descuento (§4.3-6, PNN-5).
      incident(w, 'cyclosis');
      return no('ASSET_UNAVAILABLE');
    case 'pickSpecimen':
      return pick(w, cmd);
    case 'placeSpecimen':
      return place(w, cmd);
    case 'cutSpecimen':
      // Cortar sobre el portaobjetos: la hoja choca contra el vidrio (CEL62); el corte se hace en la tabla.
      errB(w, 'CEL62', 'BLADE_ON_GLASS', 'ALERT', { obj: cmd.slideId });
      return no('CUT_UNSAFE');
    case 'squeezeDropper':
      return squeeze(w, cmd.dispenserId, cmd.targetId, cmd.force01, cmd.dxCm, cmd.dyCm, !!cmd.tipContact);
    case 'wipe':
      return wipe(w, cmd);
    case 'lowerCover':
      return lowerCover(w, cmd);
    case 'setPose':
      return setPose(w, cmd.id, cmd.pose, cmd.support);
    case 'observe':
      if (cmd.instrument === 'compound' && cmd.open && !w.microscope.slideOnStage) {
        errB(w, 'CEL33', 'NO_SLIDE', 'WARN');
        return no('NO_SLIDE');
      }
      return dispatchB01(w, cmd);
    case 'captureObservation':
      return capture(w, cmd);
    case 'closeBench':
      return closeBench(w);
    default:
      return dispatchB01(w, cmd);
  }
}

// ─────────────────────────── Obtención de tejido ───────────────────────────

/** Herramienta con restos de otra muestra: lo que toma queda contaminado (CEL10). */
function residue(w: CellWorld, tool: string, f: CellFragment) {
  const prev = w.cell.toolResidue[tool];
  if (prev && prev !== f.kind) {
    f.contamination01 = clamp(f.contamination01 + 0.4, 0, 1);
    errB(w, 'CEL10', 'CROSS_CONTAMINATION', 'WARN', { obj: tool });
  }
  w.cell.toolResidue[tool] = f.kind;
}

function sourceFor(w: CellWorld, sourceId: string, tool: string): { src: CellWorld['cell']['sources'][string] } | CellDispatchResult {
  const src = w.cell.sources[sourceId];
  if (!src) return no('BAD_SOURCE');
  if (src.kind === 'elodea') return no('USE_FORCEPS');
  if (src.kind === 'buccal') return no('USE_SWAB');
  if (!w.cell.assigned.includes(src.kind)) {
    errB(w, 'CEL06', 'MATERIAL_NOT_ASSIGNED', 'WARN', { obj: sourceId });
    return no('MATERIAL_NOT_ASSIGNED');
  }
  void tool;
  return { src };
}

function cutSource(w: CellWorld, sourceId: string, toolId: string, thicknessMm: number, lengthCm: number): CellDispatchResult {
  if (!w.cell.sources[sourceId]) return no('BAD_SOURCE');
  // Solo el bisturí corta; la espátula o la pinza desgarran el fruto (CEL05).
  if (toolId !== 'sc') {
    errB(w, 'CEL05', 'WRONG_TOOL', 'ALERT', { obj: sourceId });
    return no('WRONG_TOOL');
  }
  const s = sourceFor(w, sourceId, toolId);
  if ('ok' in s) return s;
  const { src } = s;
  if (!CELL_RECIPES[src.kind].preps.includes('cut')) return no('USE_SCRAPE');
  if (w.cell.board) return no('BOARD_BUSY');
  const p = prep(w);
  const f = cutFragment(p, src.kind, sourceId, thicknessMm, lengthCm);
  if (f.massMg > src.massMg) return no('EMPTY');
  residue(w, 'sc', f);
  src.massMg = r6(src.massMg - f.massMg);
  w.cell.board = f;
  if (f.thicknessMm > p.thickMaxMm) errB(w, 'CEL01', 'CUT_TOO_THICK', 'WARN', { obj: sourceId, mm: f.thicknessMm });
  if (f.areaMm2 < p.minAreaMm2) errB(w, 'CEL02', 'FRAGMENT_TOO_SMALL', 'WARN', { obj: sourceId });
  flagB(w, `cut:${src.kind}`);
  emitB(w, 'TISSUE_CUT', 'INFO', { obj: sourceId, mm: f.thicknessMm });
  return ok({ value: f.thicknessMm });
}

function scrape(w: CellWorld, sourceId: string, toolId: string, distanceCm: number, pressure01: number): CellDispatchResult {
  if (!w.cell.sources[sourceId]) return no('BAD_SOURCE');
  if (toolId !== 'sp' && toolId !== 'sc') {
    errB(w, 'CEL05', 'WRONG_TOOL', 'ALERT', { obj: sourceId });
    return no('WRONG_TOOL');
  }
  const s = sourceFor(w, sourceId, toolId);
  if ('ok' in s) return s;
  const { src } = s;
  if (!CELL_RECIPES[src.kind].preps.includes('scrape')) return no('USE_CUT');
  if (toolId === 'sp' ? w.cell.held.sp : w.cell.board) return no(toolId === 'sp' ? 'TOOL_BUSY' : 'BOARD_BUSY');
  const p = prep(w);
  const f = scrapeFragment(p, src.kind, sourceId, distanceCm, pressure01);
  if (f.massMg > src.massMg) return no('EMPTY');
  residue(w, toolId, f);
  src.massMg = r6(src.massMg - f.massMg);
  if (toolId === 'sp') w.cell.held.sp = f;
  else w.cell.board = f;
  if (distanceCm < p.scrapeMinCm) errB(w, 'CEL04', 'SCRAPE_INSUFFICIENT', 'WARN', { obj: sourceId });
  if (f.tear01 > 0) errB(w, 'CEL03', 'SCRAPE_TORN', 'WARN', { obj: sourceId });
  flagB(w, `scrape:${src.kind}`);
  emitB(w, 'TISSUE_SCRAPED', 'INFO', { obj: sourceId, mg: f.massMg });
  return ok({ value: f.massMg });
}

function swab(w: CellWorld, swabId: string, sourceId: string, durationS: number, pressure01: number): CellDispatchResult {
  const sw = w.cell.swabs[swabId];
  if (!sw) return no('NO_OBJECT');
  const src = w.cell.sources[sourceId];
  if (!src || src.kind !== 'buccal') return no('BAD_SOURCE');
  if (!w.cell.assigned.includes('buccal')) {
    errB(w, 'CEL06', 'MATERIAL_NOT_ASSIGNED', 'WARN', { obj: sourceId });
    return no('MATERIAL_NOT_ASSIGNED');
  }
  if (sw.state === 'used') return no('SWAB_USED');
  if (sw.state === 'loaded') return no('ALREADY_LOADED');
  const load = Math.min(src.massMg, swabLoadMg(prep(w), durationS, pressure01));
  src.massMg = r6(src.massMg - load);
  sw.loadedMg = load;
  sw.state = 'loaded';
  flagB(w, 'swabbed');
  emitB(w, 'SWAB_TAKEN', 'INFO', { obj: swabId, mg: load });
  return ok({ value: load });
}

function smear(w: CellWorld, swabId: string, slideId: string, lengthCm: number, pressure01: number, dx: number, dy: number): CellDispatchResult {
  const sw = w.cell.swabs[swabId];
  if (!sw) return no('NO_OBJECT');
  if (w.slides[slideId]?.kind === 'fixed') {
    errB(w, 'E42', 'FIXED_SLIDE_PERMANENT', 'WARN', { obj: slideId });
    return no('FIXED_SLIDE');
  }
  if (!w.slides[slideId] || !isPrep(w.objects[slideId]?.support)) return no('NOT_ON_PREP');
  if (sw.state === 'used') return no('SWAB_USED');
  const m = mountOn(w, slideId)!;
  if (m.coverId) return no('COVERED');
  m.cell ??= emptyCellInfo();
  if (m.cell.zones.length) return no('ONE_SPECIMEN_PER_SLIDE');
  // Hisopo sin células: el portaobjetos queda sin material (CEL13).
  if (sw.state !== 'loaded' || sw.loadedMg <= 1e-9) {
    sw.state = 'used';
    errB(w, 'CEL13', 'EMPTY_SWAB', 'WARN', { obj: swabId });
    return ok({ value: 0 });
  }
  const p = prep(w);
  const density = smearDensity(sw.loadedMg, lengthCm, pressure01);
  const z: CellZone = {
    specimenId: `m:buccal:${++w.cell.zoneSeq}`, kind: 'buccal', asset: '', centerCm: [r6(dx), r6(dy)], prep: 'smear', thicknessMm: 0.02,
    areaMm2: r6(clamp(lengthCm, 0.2, 3) * 10 * 6), tear01: 0, massMg: sw.loadedMg,
  };
  sw.loadedMg = 0;
  sw.state = 'used';
  m.cell.smearDensity01 = density;
  addZone(w, m, z, slideId, 0);
  if (density > p.smearDenseMax) errB(w, 'CEL12', 'DENSE_SMEAR', 'WARN', { obj: slideId });
  flagB(w, 'smeared');
  emitB(w, 'SMEAR_MADE', 'INFO', { obj: slideId, d: Math.round(density * 100) });
  return ok({ value: density });
}

/** Coloca una zona sobre el montaje: contaminación del vidrio, centrado, reactivos ya presentes y recurso. */
export function addZone(w: CellWorld, m: FreshMount, z: CellZone, slideId: string, contamination01: number) {
  const info = m.cell!;
  info.zones.push(z);
  if (info.zones.length === 1) info.allowed = [...CELL_RECIPES[z.kind].reagents, ...(w.cell.extraAllowed?.[z.kind] ?? [])];
  m.contamination01 = clamp(m.contamination01 + contamination01, 0, 1);
  // Vidrio con restos de un preparado anterior (CEL09).
  const s = w.slides[slideId];
  if (s.dirty01 > 0.2) {
    m.contamination01 = clamp(m.contamination01 + s.dirty01 * 0.8, 0, 1);
    errB(w, 'E01', 'DIRTY_SLIDE', 'WARN', { obj: slideId });
  }
  if (Math.hypot(...z.centerCm) > w.params.mount.edgeCm) errB(w, 'CEL08', 'SPECIMEN_OFF_CENTER', 'WARN', { obj: slideId });
  const z0 = info.zones[0];
  m.fragmentCm = lengthOf(z0);
  m.centerCm = [...z0.centerCm];
  m.cutState = 'prepared';
  if (info.zones.length === 1) m.hydrated01 = 1;
  if (liquidMl(m) > 0 && Math.hypot(m.waterCenterCm[0] - z.centerCm[0], m.waterCenterCm[1] - z.centerCm[1]) <= w.params.mount.dropReachCm) m.wetsSpecimen = true;
  checkReagents(w, m);
  refreshAssets(w, m);
  flagB(w, 'specimenPlaced');
  flagB(w, `placed:${z.kind}`);
  emitB(w, 'SPECIMEN_PLACED', 'INFO', { obj: slideId, kind: z.kind });
}

/** Reactivo que la receta no admite: la preparación queda marcada como incompatible (CEL21 en papa, CEL28 el resto). */
function checkReagents(w: CellWorld, m: FreshMount) {
  const info = m.cell!;
  const z0 = info.zones[0];
  if (!z0 || info.incompatible) return;
  const present = (Object.keys(info.stainMl) as StainId[]).filter((s) => (info.stainMl[s] ?? 0) > 1e-9);
  if (present.some((s) => !info.allowed.includes(s))) {
    info.incompatible = true;
    if (z0.kind === 'potato') errB(w, 'CEL21', 'WRONG_REAGENT', 'WARN', { obj: m.slideId });
    else errB(w, 'CEL28', 'WRONG_DROPPER', 'WARN', { obj: m.slideId });
  }
}

function pick(w: CellWorld, cmd: Extract<CellCommand, { type: 'pickSpecimen' }>): CellDispatchResult {
  const { toolId, sourceId } = cmd;
  const fromBoard = sourceId === 'board';
  if (sourceId !== 'el' && !fromBoard) {
    if (w.cell.sources[sourceId]) return no('NEED_CUT');
    return dispatchB01(w, cmd);
  }
  if (toolId !== 'fc') return no('BAD_TOOL');
  if (w.forceps.holding || w.cell.held.fc) return no('TOOL_BUSY');
  let f: CellFragment;
  if (fromBoard) {
    if (!w.cell.board) return no('EMPTY');
    f = w.cell.board;
    w.cell.board = null;
  } else {
    if (w.dish.leaves <= 0) return no('EMPTY');
    const p = prep(w);
    const src = w.cell.sources.el;
    const area = r6((w.dish.leafCm * 10) ** 2 * 0.5);
    f = { kind: 'elodea', sourceId: 'el', prep: 'leaf', thicknessMm: 0.05, areaMm2: area, tear01: 0, contamination01: 0, massMg: Math.min(src.massMg, p.leafMassMg) };
    w.dish.leaves -= 1;
    src.massMg = r6(src.massMg - f.massMg);
  }
  residue(w, 'fc', f);
  w.cell.held.fc = f;
  w.forceps.holding = { kind: 'specimen', assetId: f.kind, sourceId: f.sourceId, fragmentCm: lengthOf(f) };
  return ok();
}

function place(w: CellWorld, cmd: Extract<CellCommand, { type: 'placeSpecimen' }>): CellDispatchResult {
  const { toolId, targetId } = cmd;
  const f = w.cell.held[toolId];
  if (!f) return toolId === 'fc' ? dispatchB01(w, cmd) : no('NOTHING_HELD');
  if (w.slides[targetId]?.kind === 'fixed') {
    errB(w, 'E42', 'FIXED_SLIDE_PERMANENT', 'WARN', { obj: targetId });
    return no('FIXED_SLIDE');
  }
  const slide = w.slides[targetId];
  const off = Math.abs(cmd.dxCm) > SLIDE_HALF.x || Math.abs(cmd.dyCm) > SLIDE_HALF.y;
  if (!slide && targetId !== 'bench') return no('BAD_TARGET');
  // Fuera del portaobjetos el fragmento cae a la mesa: es residuo (CEL07).
  if (!slide || off) {
    w.cell.biomass.wasteMg = r6(w.cell.biomass.wasteMg + f.massMg);
    release(w, toolId);
    errB(w, 'CEL07', 'FRAGMENT_DROPPED', 'WARN', { obj: targetId });
    return ok();
  }
  if (!isPrep(w.objects[targetId].support)) return no('NOT_ON_PREP');
  const m = mountOn(w, targetId)!;
  if (m.coverId) return no('COVERED');
  m.cell ??= emptyCellInfo();
  const info = m.cell;
  const p = prep(w);
  if (info.zones.length) {
    const z0 = info.zones[0];
    // Solo frutos pigmentados comparten un portaobjetos, cada uno en su zona (PNN-6).
    if (!CHROMO.includes(z0.kind) || !CHROMO.includes(f.kind)) return no('ONE_SPECIMEN_PER_SLIDE');
    if (info.zones.length >= p.maxZones) return no('SLIDE_FULL');
    if (info.zones.some((z) => Math.hypot(z.centerCm[0] - cmd.dxCm, z.centerCm[1] - cmd.dyCm) < p.zoneSepCm)) {
      info.mixed = true;
      errB(w, 'CEL11', 'ZONES_OVERLAP', 'WARN', { obj: targetId });
    }
  }
  const z: CellZone = {
    specimenId: `m:${f.kind}:${++w.cell.zoneSeq}`, kind: f.kind, asset: '', centerCm: [r6(cmd.dxCm), r6(cmd.dyCm)], prep: f.prep, thicknessMm: f.thicknessMm,
    areaMm2: f.areaMm2, tear01: f.tear01, massMg: f.massMg,
  };
  if (f.contamination01 > 0.3 && CHROMO.includes(f.kind)) info.mixed = true;
  release(w, toolId);
  addZone(w, m, z, targetId, f.contamination01);
  return ok();
}

function release(w: CellWorld, toolId: string) {
  w.cell.held[toolId] = null;
  if (toolId === 'fc') {
    w.forceps.holding = null;
    w.forceps.dirty01 = 0.6;
  }
}

// ─────────────────────────── Gotero y papel ───────────────────────────

function squeeze(w: CellWorld, dispenserId: string, targetId: string, force01: number, dx: number, dy: number, tipContact: boolean): CellDispatchResult {
  const d = w.dispensers[dispenserId];
  if (!d) return no('NOT_DROPPER');
  if (w.slides[targetId]?.kind === 'fixed') {
    errB(w, 'E42', 'FIXED_SLIDE_PERMANENT', 'WARN', { obj: targetId });
    return no('FIXED_SLIDE');
  }
  if (d.ml <= 1e-9) return no('EMPTY');
  const p = prep(w);
  let vol = dropVolumeMl(w.params.mount, force01);
  // Gotero sin calibrar (S05): cada gota varía (RNG serializable).
  if (scC(w, SC.DROPPER_JITTER)) vol *= 1 + (rand(w) * 2 - 1) * p.dropJitter;
  vol = Math.min(d.ml, r6(vol));
  d.ml = r6(d.ml - vol);
  const stain = d.reagent as StainId;
  if (tipContact) {
    w.cell.dropperTip[dispenserId] = 1;
    errB(w, 'CEL29', 'DROPPER_TIP_CONTAMINATED', 'WARN', { obj: dispenserId });
  }
  const slide = w.slides[targetId];
  const m = slide && isPrep(w.objects[targetId]?.support) ? mountOn(w, targetId) : null;
  const off = Math.abs(dx) > SLIDE_HALF.x || Math.abs(dy) > SLIDE_HALF.y;
  if (!m || off) {
    w.fluids.spilledMl += vol;
    w.benchSpillMl += vol;
    if (stain !== 'water') {
      w.cell.stainLedger[stain].spilledMl += vol;
      w.cell.benchStainMl[stain] = (w.cell.benchStainMl[stain] ?? 0) + vol;
    }
    if (stain === 'lugol') errB(w, 'CEL22', 'LUGOL_SPILLED', 'WARN', { obj: targetId });
    emitB(w, 'DROP_SPILLED', 'WARN', { obj: dispenserId });
    return ok({ value: vol });
  }
  m.cell ??= emptyCellInfo();
  const info = m.cell;
  if (stain === 'water') {
    const prev = m.waterMl;
    m.waterMl += vol;
    if (!m.coverId) m.waterCenterCm = prev > 0 ? [r6((m.waterCenterCm[0] * prev + dx * vol) / m.waterMl), r6((m.waterCenterCm[1] * prev + dy * vol) / m.waterMl)] : [r6(dx), r6(dy)];
  } else {
    if (liquidMl(m) <= 1e-9 && !m.coverId) m.waterCenterCm = [r6(dx), r6(dy)];
    m.reagentMl += vol;
    info.stainMl[stain] = (info.stainMl[stain] ?? 0) + vol;
    m.reagentId = stain;
  }
  // Bajo el cubreobjetos el líquido entra por capilaridad y moja el tejido.
  if (m.coverId) m.wetsSpecimen = info.zones.length > 0;
  else if (info.zones.some((z) => Math.hypot(dx - z.centerCm[0], dy - z.centerCm[1]) <= w.params.mount.dropReachCm)) m.wetsSpecimen = true;
  // Gotero contaminado en un uso anterior: arrastra restos a este montaje (CEL29).
  if (!tipContact && (w.cell.dropperTip[dispenserId] ?? 0) > 0.5) m.contamination01 = clamp(m.contamination01 + 0.3, 0, 1);
  checkReagents(w, m);
  if (stain === 'lugol') {
    const l = info.stainMl.lugol ?? 0;
    info.overstain01 = r6(l > p.lugolOverMl ? clamp(0.7 + (0.3 * (l - p.lugolOverMl)) / p.lugolOverMl, 0, 1) : (0.5 * l) / p.lugolOverMl);
    if (l > p.lugolOverMl) errB(w, 'CEL23', 'LUGOL_EXCESS', 'WARN', { obj: targetId });
  }
  refreshAssets(w, m);
  flagB(w, 'dropAdded');
  flagB(w, `stain:${stain}`);
  emitB(w, 'DROP_ADDED', 'INFO', { obj: targetId, ml: Math.round(vol * 1000) / 1000, r: stain });
  return ok({ value: vol });
}

function wipe(w: CellWorld, cmd: Extract<CellCommand, { type: 'wipe' }>): CellDispatchResult {
  const { targetId, toolId } = cmd;
  // Limpieza de las herramientas: quita los restos de tejido (contaminación cruzada).
  if (targetId === 'sp' || targetId === 'sc' || targetId === 'fc') {
    if (toolId !== 'lp' && toolId !== 'pp') return no('BAD_TOOL');
    if (w.cell.held[targetId]) return no('TOOL_BUSY');
    w.cell.toolResidue[targetId] = null;
    if (targetId === 'fc') return dispatchB01(w, cmd);
    flagB(w, `toolCleaned:${targetId}`);
    return ok();
  }
  if (targetId === 'bench' || targetId === 'stage') {
    if (toolId === 'pp') {
      for (const s of ledgerKeys(w)) {
        const v = w.cell.benchStainMl[s] ?? 0;
        w.cell.stainLedger[s].spilledMl -= v;
        w.cell.stainLedger[s].wasteMl += v;
        w.cell.benchStainMl[s] = 0;
      }
    }
    return dispatchB01(w, cmd);
  }
  const m = w.mounts[targetId];
  if (!m?.cell || toolId !== 'pp' || (!m.specimenId && liquidMl(m) <= 1e-9)) return dispatchB01(w, cmd);
  const mp = w.params.mount;
  // Portaobjetos sin tejido: el papel retira todo el líquido.
  if (!m.specimenId) {
    drainMount(w, m, liquidMl(m), 'waste');
    return ok();
  }
  const z = nearestZone(m, [(cmd.dxCm ?? 0) * 10, (cmd.dyCm ?? 0) * 10]);
  const onTissue = !!z && Math.hypot((cmd.dxCm ?? 0) - z.centerCm[0], (cmd.dyCm ?? 0) - z.centerCm[1]) < 0.5;
  if (onTissue || cmd.strong) {
    // Papel apoyado sobre el tejido o hasta absorber todo el borde: se lleva el medio (y daña el tejido si lo toca).
    drainMount(w, m, liquidMl(m) * (cmd.strong ? 0.95 : 0.7), 'waste');
    if (onTissue) m.damage01 = clamp(m.damage01 + 0.25, 0, 1);
    m.wetsSpecimen = liquidMl(m) >= mp.needMl;
    if (liquidMl(m) < mp.needMl) errB(w, 'CEL17', 'MOUNT_DRAINED', 'WARN', { obj: targetId });
    return ok();
  }
  const excess = Math.max(0, liquidMl(m) - mp.excessMl * 0.6);
  drainMount(w, m, excess, 'waste');
  if (m.floating && liquidMl(m) <= mp.excessMl) m.floating = false;
  if (mountUsable(mp, m)) flagB(w, 'mountUsable');
  flagB(w, 'edgeWiped');
  emitB(w, 'EDGE_WIPED', 'INFO', { obj: targetId, ml: Math.round(excess * 1000) / 1000 });
  return ok({ value: excess });
}

/** Cubreobjetos bajado lejos del tejido: al apoyarse arrastra la muestra fuera del centro (CEL15). */
function lowerCover(w: CellWorld, cmd: Extract<CellCommand, { type: 'lowerCover' }>): CellDispatchResult {
  const m = w.mounts[cmd.slideId];
  const c = w.covers[cmd.coverId];
  const z0 = m?.cell?.zones[0];
  if (m?.cell && z0 && c?.state === 'held' && !m.coverId && isPrep(w.objects[cmd.slideId]?.support)) {
    const off = Math.hypot(cmd.dxCm - z0.centerCm[0], cmd.dyCm - z0.centerCm[1]);
    if (off > prep(w).coverDragCm) {
      const ux = (z0.centerCm[0] - cmd.dxCm) / off;
      const uy = (z0.centerCm[1] - cmd.dyCm) / off;
      for (const z of m.cell.zones) z.centerCm = [r6(z.centerCm[0] + ux * 0.4), r6(z.centerCm[1] + uy * 0.4)];
      m.centerCm = [...z0.centerCm];
      errB(w, 'CEL15', 'COVER_DRAGGED_TISSUE', 'WARN', { obj: cmd.slideId });
    }
  }
  const r = dispatchB01(w, cmd);
  if (r.ok && m) m.coveredFraction = coveredFractionFor(w.params.mount, m.fragmentCm, m.centerCm, m.coverOffsetCm);
  return r;
}

const CONTAINER_POS: Record<string, { x: number; y: number }> = { bioWaste: BIO_WASTE, trashBin: TRASH_BIN, glassBin: GLASS_BIN };

function setPose(w: CellWorld, id: string, pose: Pose, support?: string): CellDispatchResult {
  const sw = w.cell.swabs[id];
  const c = w.covers[id];
  // Vidrio roto tomado con la mano (CEL59): se rechaza y queda la alerta.
  if (c?.state === 'broken' && support === 'hand') {
    errB(w, 'CEL59', 'BROKEN_GLASS_BY_HAND', 'ALERT', { obj: id });
    w.safety.block = { code: 'SHARDS', since: w.timeS };
    return no('USE_TOOL');
  }
  if (sw && support === 'swabBox' && sw.state !== 'box') return no('SWAB_USED');
  const r = dispatchB01(w, { type: 'setPose', id, pose, support });
  // Hisopo con contacto biológico en residuos comunes (CEL60).
  if (r.ok && sw && support === 'trashBin' && sw.state !== 'box') errB(w, 'CEL60', 'SWAB_IN_TRASH', 'ALERT', { obj: id });
  if (r.ok && sw && support === 'bioWaste') flagB(w, `swabDisposed:${id}`);
  return r;
}

function dispose(w: CellWorld, objectId: string, containerId: 'bioWaste' | 'trashBin' | 'glassBin'): CellDispatchResult {
  // Fragmento que quedó en la tabla o en una herramienta: residuo biológico.
  if (objectId === 'board' || objectId === 'sp' || objectId === 'fc') {
    const f = objectId === 'board' ? w.cell.board : w.cell.held[objectId];
    if (!f) return no('NOTHING');
    w.cell.biomass.wasteMg = r6(w.cell.biomass.wasteMg + f.massMg);
    if (objectId === 'board') w.cell.board = null;
    else release(w, objectId);
    emitB(w, 'TISSUE_DISCARDED', 'INFO', { obj: objectId });
    return ok();
  }
  const o = w.objects[objectId];
  const at = CONTAINER_POS[containerId];
  if (!o || !at) return no('NO_OBJECT');
  return setPose(w, objectId, { x: at.x, y: at.y, z: 2, rotationRad: 0 }, containerId);
}

// ─────────────────────────── Observación y cierre ───────────────────────────

function capture(w: CellWorld, cmd: Extract<CellCommand, { type: 'captureObservation' }>): CellDispatchResult {
  const r = dispatchB01(w, cmd);
  if (!r.ok) {
    if (cmd.instrument === 'compound' && r.code === 'NO_SAMPLE') errB(w, 'CEL33', 'NO_SLIDE', 'WARN');
    return r;
  }
  const o = w.observations[r.id!];
  const m = o.instrument === 'compound' && o.slideId ? w.mounts[o.slideId] : null;
  if (!m?.cell) return r;
  const v = microscopeView(w);
  const z = m.cell.zones.find((x) => x.specimenId === o.specimenId) ?? v.zone ?? nearestZone(m, [v.centerMm[0] + v.originMm[0], v.centerMm[1] + v.originMm[1]]);
  if (!z) return r;
  const info: CellMountInfo = m.cell;
  if (!z.premade) {
    if (z.kind === 'potato') {
      if (!hasStain(info, 'lugol')) {
        if (!scC(w, SC.PLAIN_CONTROL)) errB(w, 'CEL20', 'LUGOL_OMITTED', 'WARN', { obj: o.slideId! });
      } else if (!lugolDeveloped(info, prep(w).lugolMinContactS)) errB(w, 'CEL24', 'LUGOL_CONTACT_SHORT', 'WARN', { obj: o.slideId! });
    }
    if (z.kind === 'buccal' && !requiredStainPresent('buccal', info)) errB(w, 'CEL27', 'SMEAR_UNSTAINED', 'WARN', { obj: o.slideId! });
  }
  // Recurso faltante (S18): la captura no se evalúa y queda la incidencia, sin descuento (CEL68).
  if (o.issues.includes('ASSET_MISSING')) {
    incident(w, z.asset.replace('missing:', ''));
    o.specimenId = z.specimenId;
    o.captureHash = stableHash({ a: w.assignment.assignmentHash, o: { ...o, captureHash: '' } });
  }
  if (o.isObservationValid && !z.premade) flagB(w, `cellCapture:${z.kind}:${o.objectiveX ?? 0}`);
  return r;
}

/** Lo que el cierre de B02 agrega al de B01: hisopos usados, herramientas con restos y tejido suelto. */
export function cellOutstanding(w: CellWorld): string[] {
  const out: string[] = [];
  for (const [id, s] of Object.entries(w.cell.swabs)) if (s.state !== 'box' && !['bioWaste', 'trashBin'].includes(w.objects[id]?.support ?? '')) out.push(id);
  for (const [tool, k] of Object.entries(w.cell.toolResidue)) if (k) out.push(`clean:${tool}`);
  for (const [tool, f] of Object.entries(w.cell.held)) if (f) out.push(tool);
  if (w.cell.board) out.push('board');
  return out;
}

function closeBench(w: CellWorld): CellDispatchResult {
  const id = w.microscope.slideOnStage;
  const m = id ? w.mounts[id] : null;
  // Preparación húmeda olvidada en la platina (CEL65).
  if (m && liquidMl(m) > 0.002) errB(w, 'CEL65', 'WET_SLIDE_LEFT', 'WARN', { obj: id! });
  const extra = cellOutstanding(w);
  const had = w.evidence.benchRestored;
  const r = dispatchB01(w, { type: 'closeBench' });
  if (extra.length) {
    errB(w, 'CEL61', 'TOOLS_NOT_RETURNED', 'WARN', { n: extra.length });
    if (!had) delete w.evidence.benchRestored;
    return { ...r, value: 0 };
  }
  return r;
}

// ─────────────────────────── Paso fijo ───────────────────────────

export function stepCellWorld(w: CellWorld): void {
  stepB01World(w);
  const dt = w.params.dtS;
  const mp = w.params.mount;
  for (const m of Object.values(w.mounts)) {
    if (!m.cell || !m.specimenId) continue;
    const wet = m.wetsSpecimen && liquidMl(m) >= mp.needMl * 0.5;
    // Contacto de cada colorante con el tejido humedecido.
    if (wet) for (const s of ledgerKeys(w)) if ((m.cell.stainMl[s] ?? 0) > 1e-9) m.cell.contactS[s] = r6((m.cell.contactS[s] ?? 0) + dt);
    const premade = m.cell.zones.every((z) => z.premade);
    if (!wet) {
      m.hydrated01 = clamp(m.hydrated01 - mp.dehydratePerS * dt, 0, 1);
      // Elodea sin medio acuoso (CEL18); en los demás tejidos la consecuencia es la captura «seca».
      if (m.hydrated01 < 0.6 && !premade && m.cell.zones[0]?.kind === 'elodea') errB(w, 'E06', 'NO_MOUNT_LIQUID', 'WARN', { obj: m.slideId });
    } else m.hydrated01 = clamp(m.hydrated01 + 0.02 * dt, 0, 1);
    if (w.tick % 4 === 0) refreshAssets(w, m);
  }
}

export function runCellFor(w: CellWorld, seconds: number): void {
  const n = Math.round(seconds / w.params.dtS);
  for (let i = 0; i < n; i++) stepCellWorld(w);
}

// ─────────────────────────── Conservación ───────────────────────────

/** Balance total de líquido y de vidrio (B01), por colorante y de biomasa didáctica (deben ser 0). */
export function conservedCell(w: CellWorld): Record<string, number> {
  const out = { ...conservedB01(w) };
  for (const s of ledgerKeys(w)) {
    const led = w.cell.stainLedger[s];
    const reservoir = Object.values(w.dispensers).filter((d) => d.reagent === s).reduce((a, d) => a + d.ml, 0);
    const mounted = Object.values(w.mounts).reduce((a, m) => a + (m.cell?.stainMl[s] ?? 0), 0);
    out[`stain:${s}`] = led.initialMl - (reservoir + mounted + led.wasteMl + led.spilledMl);
  }
  const c = w.cell;
  const sources = Object.values(c.sources).reduce((a, s) => a + s.massMg, 0);
  const held = Object.values(c.held).reduce((a, f) => a + (f?.massMg ?? 0), 0) + (c.board?.massMg ?? 0);
  const swabs = Object.values(c.swabs).reduce((a, s) => a + s.loadedMg, 0);
  const zones = Object.values(w.mounts).reduce((a, m) => a + (m.cell?.zones.reduce((b, z) => b + z.massMg, 0) ?? 0), 0);
  out.biomass = c.biomass.initialMg - (sources + held + swabs + zones + c.biomass.wasteMg);
  return out;
}

/** Resumen para el hash de la bitácora. */
export function cellSummary(w: CellWorld) {
  return {
    ...b01Summary(w),
    held: Object.entries(w.cell.held).filter(([, f]) => f).map(([k, f]) => [k, f!.kind, Math.round(f!.massMg * 1000)]),
    board: w.cell.board ? [w.cell.board.kind, Math.round(w.cell.board.massMg * 1000)] : null,
    zones: Object.values(w.mounts).flatMap((m) => m.cell?.zones.map((z) => z.specimenId) ?? []),
  };
}

// ─────────────────────────── Creación ───────────────────────────

export interface CellWorldExtras {
  assigned: CellKind[];
  routes: CellWorld['cell']['routes'];
  sources: Array<{ id: string; kind: CellKind; massMg: number }>;
  swabs: string[];
  assetOverride?: Record<string, string>;
  missingAssets?: string[];
  /** Medios con balance propio (B02: los colorantes; B03 agrega las soluciones salinas). */
  stains?: Exclude<StainId, 'water'>[];
  /** Medios que una muestra admite además de su receta (B03: NaCl sobre Elodea). */
  extraAllowed?: Partial<Record<CellKind, StainId[]>>;
  /** Variantes de recurso de B06. */
  variants?: CellWorld['cell']['variants'];
}

/** Medios con balance en este mundo, en el orden en que se crearon. */
export const ledgerKeys = (w: CellWorld) => Object.keys(w.cell.stainLedger) as Exclude<StainId, 'water'>[];

/** Mundo B02: el mundo óptico de B01 creado con la mesada de B02, más el estado celular y sus balances iniciales. */
export function createCellWorld(spec: OpticalWorldSpec, x: CellWorldExtras): CellWorld {
  const w = createOpticalWorld(spec) as CellWorld;
  const sources: CellWorld['cell']['sources'] = Object.fromEntries(x.sources.map((s) => [s.id, { kind: s.kind, massMg: s.massMg, initialMg: s.massMg }]));
  sources.el = { kind: 'elodea', massMg: spec.dish.leaves * spec.params.cellPrep!.leafMassMg, initialMg: spec.dish.leaves * spec.params.cellPrep!.leafMassMg };
  sources.bucc = { kind: 'buccal', massMg: 20, initialMg: 20 };
  const stainLedger = Object.fromEntries(
    (x.stains ?? STAINS).map((s) => {
      const res = Object.values(spec.dispensers).filter((d) => d.reagent === s).reduce((a, d) => a + d.ml, 0);
      const mounted = Object.values(spec.mounts ?? {}).reduce((a, m) => a + (m.cell?.stainMl[s] ?? 0), 0);
      return [s, { initialMl: res + mounted, wasteMl: 0, spilledMl: 0 }];
    }),
  ) as CellWorld['cell']['stainLedger'];
  w.cell = {
    assigned: [...x.assigned],
    routes: { ...x.routes },
    sources,
    board: null,
    held: { fc: null, sp: null },
    toolResidue: { fc: null, sc: null, sp: null },
    swabs: Object.fromEntries(x.swabs.map((id) => [id, { state: 'box' as const, loadedMg: 0 }])),
    dropperTip: {},
    stainLedger,
    benchStainMl: {},
    biomass: { initialMg: Object.values(sources).reduce((a, s) => a + s.massMg, 0), wasteMg: 0 },
    assetOverride: { ...(x.assetOverride ?? {}) },
    missingAssets: [...(x.missingAssets ?? [])],
    incidents: [],
    zoneSeq: 0,
  };
  if (x.extraAllowed) w.cell.extraAllowed = structuredClone(x.extraAllowed);
  if (x.variants) w.cell.variants = { ...x.variants };
  for (const m of Object.values(w.mounts)) refreshAssets(w, m);
  return w;
}
