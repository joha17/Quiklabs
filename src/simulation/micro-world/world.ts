/**
 * Mundo B07: medios, colonias y Gram (§6). `dispatchMicro` resuelve los gestos propios (fichas, placas, visor calibrado,
 * trazado digital, frotis y fases de tinción) y delega el resto en `dispatchDiv` (microscopio, aceite, marcas, capturas),
 * con los catálogos anteriores traducidos a MIC-NN por `params.codeMap`. `stepMicroWorld` avanza 0,05 s. Determinista.
 */
import { stableHash } from '../core/math';
import { incident, scC } from '../cell-world/world';
import { conservedDiv, createDivWorld, dispatchDiv, divOutstanding, divSummary, stepDivWorld, type DivWorldExtras } from '../div-world/world';
import type { CellWorldExtras } from '../cell-world/world';
import { emitB, errB, flagB } from '../optical-world/events';
import type { OpticalWorldSpec } from '../optical-world/world';
import { microscopeView } from '../optical-world/world';
import { turretObjective } from '../instruments/optical/microscope-model';
import type { MicroCommand, MicroDispatchResult, MicroOnlyCommand } from './commands';
import { MICRO_ONLY_TYPES } from './commands';
import { MEDIA, colonyDiameter, plateLayout, retentionNeg, retentionPos, streakMetrics, type Colony, type GramClass, type MediumId } from './model';
import type { MicroParams, MicroState, MicroWorld, PlateState, Smear, StainPhase, Technique } from './types';
import { STAIN_BOTTLE } from './types';
import type { DivCommand } from '../div-world/commands';

export const SC_B07 = {
  IDEAL: 'S01', LOOKALIKE: 'S02', PIGMENTED: 'S03', CONFLUENT: 'S04', ISOLATED: 'S05', EMB_VARIANTS: 'S06', BROTH_TURBID: 'S07', BROTH_CLEAR: 'S08',
  CTRL_POS: 'S09', CTRL_NEG: 'S10', MIXED: 'S11', OVER_RESOURCE: 'S12', UNDER_RESOURCE: 'S13', THICK: 'S14', SWAPPED: 'S15', BRIGHT: 'S16', OFFCENTER: 'S17',
  ONLY_40X: 'S18', IMMERSION: 'S19', NO_SCALE: 'S20', INCOMPATIBLE: 'S21', TEACHER: 'S22',
} as const;

const ok = (extra: Partial<MicroDispatchResult> = {}): MicroDispatchResult => ({ ok: true, ...extra });
const no = (code: string): MicroDispatchResult => ({ ok: false, code });
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
const mp = (w: MicroWorld): MicroParams => w.params.micro!;

const lockedObjective = (w: MicroWorld) => turretObjective(w.microscope.turretDeg, w.params.microscope).objectiveX;
export const coloniesOf = (w: MicroWorld, plateId: string): Colony[] => {
  const p = w.micro.plates[plateId];
  return p ? plateLayout(plateId, p.profile) : [];
};
export const colonyOf = (w: MicroWorld, plateId: string, colonyId: string) => coloniesOf(w, plateId).find((c) => c.id === colonyId) ?? null;

/** Activo que muestra un frotis según lo que realmente le pasó (§3.2): calidad primero, luego fases y retención. */
export function smearAsset(w: MicroWorld, s: Smear): string {
  if (s.thick) return 'gramThick';
  if (s.sparse) return 'gramSparse';
  if (s.invalidOrder) return 'gramInvalid';
  if (!s.phases.length) return 'gramUnstained';
  const has = (p: StainPhase) => s.phases.includes(p);
  if (!has('primary')) return has('counterstain') ? 'gramNoPrimary' : 'gramUnstained';
  if (!has('mordant')) return 'gramNoMordant';
  if (!has('counterstain')) return has('decolorizer') ? 'gramNoCounter' : 'gramPrimaryOnly';
  if (s.washMissed) return 'gramDirty';
  const u = s.decolorU ?? 0;
  const violet = (r: number) => r >= mp(w).retentionViolet;
  const gram: GramClass = s.mixed ? 'mixed' : s.gram;
  if (gram === 'incompatible') return 'gramIncompatible';
  if (gram === 'mixed') return 'gramMixed';
  if (gram === 'pos') return violet(retentionPos(u)) ? 'gramPosV' : 'gramPosP';
  return violet(retentionNeg(u)) ? 'gramNegV' : 'gramNegP';
}

function refresh(w: MicroWorld, slideId: string) {
  const s = w.micro.smears[slideId];
  if (s) w.slides[slideId].assetId = smearAsset(w, s);
}

// ─────────────────────────── Despacho ───────────────────────────

export function dispatchMicro(w: MicroWorld, cmd: MicroCommand): MicroDispatchResult {
  if (MICRO_ONLY_TYPES.has(cmd.type)) {
    if (w.safety.stoppedByTeacher) return no('TEACHER_STOP');
    if (!w.ppe) {
      errB(w, 'E68', 'PPE_REQUIRED', 'CRITICAL');
      return no('PPE');
    }
    return microOnly(w, cmd as MicroOnlyCommand);
  }
  const c = cmd as DivCommand;
  if (!w.ppe) return dispatchDiv(w, c);
  switch (c.type) {
    case 'setPose':
      return setPose(w, c);
    case 'dispose':
      if (isSharp(w, c.objectId) && c.containerId !== 'glassBin') {
        errB(w, 'MIC-61', 'SHARPS_WRONG_WASTE', 'ALERT', { obj: c.objectId });
        return no('WRONG_WASTE');
      }
      return dispatchDiv(w, c);
    case 'turnTurret':
    case 'selectObjective': {
      if (c.type === 'selectObjective' && c.objectiveX === 100 && !w.div.immersion && scC(w, SC_B07.ONLY_40X)) incident(w, 'objective100');
      const r = dispatchDiv(w, c);
      markImmersion(w);
      return r;
    }
    case 'wipe': {
      const r = dispatchDiv(w, c);
      if (r.ok && c.targetId === 'mic:lens' && c.toolId === 'lp' && lockedObjective(w) === 100) {
        w.micro.immersionDirty = false;
        flagB(w, 'immersionCleaned');
      }
      return r;
    }
    case 'captureObservation':
      return capture(w, c);
    case 'closeBench':
      return closeBench(w);
    default:
      return dispatchDiv(w, c);
  }
}

const isSharp = (w: MicroWorld, id: string) => w.div.brokenSlides.includes(id) || w.div.brokenFixed.includes(id);

/** El 100X entró en la gota: la lente queda con aceite hasta limpiarla con papel óptico. */
function markImmersion(w: MicroWorld) {
  const slide = w.microscope.slideOnStage;
  if (slide && lockedObjective(w) === 100 && (w.div.oil[slide] ?? 0) > 1e-9) {
    w.micro.immersionDirty = true;
    flagB(w, 'immersionUsed');
  }
}

function setPose(w: MicroWorld, cmd: Extract<DivCommand, { type: 'setPose' }>): MicroDispatchResult {
  const { id, support } = cmd;
  const o = w.objects[id];
  if (!o || !support || support === o.support) return dispatchDiv(w, cmd);
  const m = w.micro;
  // Vidrio roto: va solo al contenedor de vidrio; el frotis no se prepara sobre él.
  if (isSharp(w, id)) {
    if (support === 'trashBin' || support === 'bioWaste') {
      errB(w, 'MIC-61', 'SHARPS_WRONG_WASTE', 'ALERT', { obj: id });
      return no('WRONG_WASTE');
    }
    if (support === 'smearPad' || support === 'rack') {
      errB(w, 'CEL-003', 'BROKEN_SLIDE', 'WARN', { obj: id });
      return no('BROKEN_SLIDE');
    }
  }
  if (m.plates[id]) {
    if (support === 'viewer') {
      const r = selectPlate(w, id);
      if (!r.ok) return r;
    } else if (support === 'stage' || support === 'smearPad' || support === 'rack') return no('BAD_TARGET');
  }
  if (support === 'stage' && m.immersionDirty && w.slides[id]) errB(w, 'MIC-48', 'IMMERSION_NOT_CLEANED', 'WARN', { obj: id });
  if (support.startsWith('case:') && (w.div.oil[id] ?? 0) > 1e-9) errB(w, 'MIC-60', 'OILY_SLIDE_RETURN', 'WARN', { obj: id });
  if (support === 'rack' && !w.slides[id]) return no('BAD_TARGET');
  return dispatchDiv(w, cmd);
}

function selectPlate(w: MicroWorld, plateId: string): MicroDispatchResult {
  const p = w.micro.plates[plateId];
  if (!p) return no('NO_PLATE');
  if (p.restricted) {
    errB(w, 'MIC-58', 'RESTRICTED_PLATE', 'CRITICAL', { obj: plateId });
    w.safety.block = { code: 'RESTRICTED_PLATE', since: w.timeS };
    return no('RESTRICTED_PLATE');
  }
  if (!p.assigned && !p.control) errB(w, 'MIC-09', 'WRONG_PLATE', 'WARN', { obj: plateId });
  w.micro.selectedPlate = plateId;
  if (!w.micro.platesViewed.includes(plateId)) w.micro.platesViewed.push(plateId);
  if (p.control) flagB(w, 'controlPlateSeen');
  emitB(w, 'PLATE_SELECTED', 'INFO', { obj: plateId });
  return ok();
}

function microOnly(w: MicroWorld, cmd: MicroOnlyCommand): MicroDispatchResult {
  const m = w.micro;
  switch (cmd.type) {
    case 'inspectMedia':
      if (!MEDIA[cmd.mediaId as MediumId]) return no('NO_MEDIUM');
      if (!m.inspected.includes(cmd.mediaId)) m.inspected.push(cmd.mediaId);
      flagB(w, `mediaInspected:${cmd.mediaId}`);
      return ok();
    case 'classifyMedia':
      if (!MEDIA[cmd.mediaId as MediumId]) return no('NO_MEDIUM');
      // Clasificar sin leer la ficha: la trazabilidad se rompe aunque la respuesta acierte.
      if (!m.inspected.includes(cmd.mediaId)) errB(w, 'MIC-05', 'MEDIA_NOT_INSPECTED', 'WARN', { obj: cmd.mediaId });
      m.classified[cmd.mediaId] = { consistency: cmd.consistency, func: cmd.func };
      return ok();
    case 'labelMedia':
      m.labels[cmd.mediaId] = cmd.label;
      if (cmd.label !== cmd.mediaId) errB(w, 'MIC-06', 'MEDIA_LABEL_SWAP', 'WARN', { obj: cmd.mediaId });
      return ok();
    case 'commitMedia':
      if (Object.keys(MEDIA).some((k) => !m.classified[k])) return no('MEDIA_INCOMPLETE');
      m.mediaCommitted = true;
      flagB(w, 'mediaCommitted');
      return ok();
    case 'selectPlate':
      return selectPlate(w, cmd.plateId);
    case 'openPlate':
      if (m.plates[cmd.plateId]?.restricted) return selectPlate(w, cmd.plateId);
      // Las placas son recursos sellados: se observan cerradas.
      return no('SEALED');
    case 'attemptFlame':
      errB(w, 'MIC-59', 'FLAME_FORBIDDEN', 'CRITICAL');
      w.safety.block = { code: 'FLAME', since: w.timeS };
      return no('FLAME_FORBIDDEN');
    case 'cropViewer':
      m.viewer.zoom = Math.max(1, Math.min(4, r6(cmd.zoom)));
      return ok();
    case 'recalibrateViewer':
      m.viewer.calibratedZoom = m.viewer.zoom;
      return ok();
    case 'recordColony':
      return recordColony(w, cmd.plateId, cmd.colonyId);
    case 'measureColony':
      return measureColony(w, cmd);
    case 'strokePlate':
      return stroke(w, cmd.technique, cmd.strokes);
    case 'compareMethods': {
      if (new Set(m.trials.map((t) => t.technique)).size < 2) return no('NEED_TWO_TRIALS');
      m.methodsCompared = true;
      flagB(w, 'methodsCompared');
      return ok();
    }
    case 'pickColony': {
      const c = colonyOf(w, cmd.plateId, cmd.colonyId);
      if (!c) return no('NO_COLONY');
      if (m.selectedPlate !== cmd.plateId) return no('PLATE_NOT_SELECTED');
      m.loop = { plateId: cmd.plateId, colonyId: cmd.colonyId };
      flagB(w, 'regionSelected');
      return ok();
    }
    case 'prepareVirtualSmear':
      return prepareSmear(w, cmd.slideId, cmd.declaredPlateId, cmd.coverage01);
    case 'markSmearDry': {
      const s = m.smears[cmd.slideId];
      if (!s) return no('NO_SMEAR');
      if (w.timeS < s.dryAt) {
        s.prematureDry = true;
        s.dryAt = w.timeS;
        errB(w, 'MIC-32', 'PREMATURE_DRY', 'WARN', { obj: cmd.slideId });
      }
      flagB(w, `dry:${cmd.slideId}`);
      return ok();
    }
    case 'applyStainPhase':
      return applyPhase(w, cmd.slideId, cmd.phase, cmd.index);
    case 'rinseVirtualSlide':
      return rinse(w, cmd.slideId);
    case 'recordHypothesis': {
      const o = w.observations[cmd.observationId];
      if (!o) return no('NO_OBSERVATION');
      // Una microfotografía de control no sustituye a la muestra incógnita (la conclusión cita otro activo).
      if (o.slideId && !m.smears[o.slideId] && cmd.sampleCode.startsWith('U')) errB(w, 'MIC-53', 'CONTROL_AS_UNKNOWN', 'WARN', { obj: cmd.observationId });
      m.hypotheses.push({ sampleCode: cmd.sampleCode, observationId: cmd.observationId, interpretation: cmd.interpretation });
      return ok();
    }
    case 'importMeasurement':
      if (!m.measures.some((x) => x.id === cmd.measurementId)) {
        errB(w, 'MIC-56', 'FOREIGN_MEASUREMENT', 'WARN', { obj: cmd.measurementId });
        return no('FOREIGN_MEASUREMENT');
      }
      return ok();
    case 'requestAsset':
      if (!m.assetScope.includes(cmd.assetId)) {
        errB(w, 'MIC-63', 'ASSET_SCOPE_DENIED', 'WARN', { obj: cmd.assetId });
        return no('ASSET_SCOPE_DENIED');
      }
      return ok();
  }
}

// ─────────────────────────── Placas ───────────────────────────

function recordColony(w: MicroWorld, plateId: string, colonyId: string): MicroDispatchResult {
  const m = w.micro;
  if (m.selectedPlate !== plateId) return no('PLATE_NOT_SELECTED');
  if (!colonyOf(w, plateId, colonyId)) return no('NO_COLONY');
  // Sin mirar el control del lote la apariencia no tiene punto de contraste.
  if (!w.evidence.controlPlateSeen) errB(w, 'MIC-13', 'CONTROL_UNSEEN', 'WARN', { obj: plateId });
  const id = `rd${++m.seq}`;
  m.readings.push({ id, tick: w.tick, plateId, colonyId, assetRef: `plate:${plateId}@1` });
  if (m.plates[plateId].assigned) flagB(w, 'colonyObservationSaved');
  emitB(w, 'COLONY_RECORDED', 'INFO', { obj: plateId });
  return ok({ id });
}

function measureColony(w: MicroWorld, c: Extract<MicroCommand, { type: 'measureColony' }>): MicroDispatchResult {
  const m = w.micro;
  if (m.selectedPlate !== c.plateId) return no('PLATE_NOT_SELECTED');
  if (c.scale === 'assumed') {
    errB(w, 'MIC-17', 'MEASURE_WITHOUT_SCALE', 'WARN', { obj: c.plateId });
    return no('UNCALIBRATED_SCALE');
  }
  if (!m.scaleAvailable) {
    // Foto sin escala (S20): la morfometría queda cualitativa, sin penalización.
    incident(w, `scale:${c.plateId}`);
    return no('UNCALIBRATED_SCALE');
  }
  const p = mp(w);
  const zoom = m.viewer.zoom;
  const px = r6(Math.hypot(c.bx - c.ax, c.by - c.ay));
  if (px <= 0) return no('ZERO_LENGTH');
  // La vista se amplía desde el centro de la imagen: se vuelve a píxeles de la imagen para saber qué colonia se tocó.
  const toImg = (v: number) => p.imagePx / 2 + (v - p.imagePx / 2) / zoom;
  const cols = coloniesOf(w, c.plateId);
  const near = (x: number, y: number) => cols.find((k) => Math.hypot(k.x - toImg(x), k.y - toImg(y)) <= k.rPx * 1.2);
  const a = near(c.ax, c.ay);
  const b = near(c.bx, c.by);
  const merged = !!a && !!b && a.id !== b.id;
  if (merged) errB(w, 'MIC-19', 'MERGED_COLONIES', 'WARN', { obj: c.plateId });
  if (m.plates[c.plateId].profile === 'confluent') {
    incident(w, `confluent:${c.plateId}`);
    flagB(w, 'confluentSeen');
  }
  const stale = zoom !== m.viewer.calibratedZoom;
  if (stale) errB(w, 'MIC-21', 'CROP_NOT_CALIBRATED', 'WARN', { obj: c.plateId });
  const mmPerPx = r6(p.mmPerPx / m.viewer.calibratedZoom);
  const { mm, uMm } = colonyDiameter(px, mmPerPx, p.uPx, p.uScaleMmPerPx);
  const id = `dm${++m.seq}`;
  const target = c.colonyId ?? a?.id ?? null;
  const valid = !merged && !stale && m.plates[c.plateId].profile !== 'confluent' && !!a && !!b;
  m.measures.push({ id, tick: w.tick, plateId: c.plateId, colonyId: target, px, mmPerPx, mm, uMm, valid, hiddenEdge: !!(a?.hiddenEdge) });
  if (valid) flagB(w, 'colonyMeasured');
  return ok({ id, value: mm });
}

function stroke(w: MicroWorld, technique: Technique, strokes: number[][][]): MicroDispatchResult {
  const m = w.micro;
  if (!strokes.length || strokes.every((s) => s.length < 2)) return no('EMPTY_STROKE');
  const metrics = streakMetrics(strokes);
  const id = `tr${++m.seq}`;
  m.trials.push({ id, tick: w.tick, technique, strokes: strokes.map((s) => s.map(([x, y]) => [r6(x), r6(y)])), ...metrics });
  if (metrics.overlap01 > mp(w).streakOverlapThreshold) errB(w, 'MIC-10', 'STREAK_OVERLAP', 'WARN', { obj: id });
  flagB(w, 'distributionTrial');
  emitB(w, 'STREAK_RECORDED', 'INFO', { obj: id });
  return ok({ id, value: metrics.overlap01 });
}

// ─────────────────────────── Frotis y tinción ───────────────────────────

function prepareSmear(w: MicroWorld, slideId: string, declared: string, coverage01: number): MicroDispatchResult {
  const m = w.micro;
  const p = mp(w);
  const slide = w.slides[slideId];
  if (!slide) return no('BAD_TARGET');
  if (isSharp(w, slideId)) {
    errB(w, 'CEL-003', 'BROKEN_SLIDE', 'WARN', { obj: slideId });
    return no('BROKEN_SLIDE');
  }
  if (!(slideId in m.smears) && slide.assetId !== 'smearBlank') {
    errB(w, 'MIC-31', 'FIXED_SLIDE_EDIT', 'WARN', { obj: slideId });
    return no('FIXED_SLIDE');
  }
  if (w.objects[slideId]?.support !== 'smearPad') return no('NOT_ON_PAD');
  if (!m.loop) return no('LOOP_EMPTY');
  const col = colonyOf(w, m.loop.plateId, m.loop.colonyId)!;
  const cov = r6(Math.max(0, Math.min(1, coverage01)));
  const prev = m.smears[slideId];
  if (declared !== m.loop.plateId) errB(w, 'MIC-27', 'REGION_PLATE_MISMATCH', 'WARN', { obj: slideId });
  let mixed = false;
  if (prev && prev.colonyId !== m.loop.colonyId) {
    mixed = true;
    errB(w, 'MIC-28', 'MIXED_SMEAR', 'WARN', { obj: slideId });
  }
  if (cov > p.coverageMax) errB(w, 'MIC-25', 'SMEAR_TOO_THICK', 'WARN', { obj: slideId });
  if (cov < p.coverageMin) errB(w, 'MIC-26', 'SMEAR_UNDER_COVERAGE', 'WARN', { obj: slideId });
  m.smears[slideId] = {
    plateId: m.loop.plateId, colonyId: m.loop.colonyId, declaredPlateId: declared, gram: col.gram, coverage01: cov, thick: cov > p.coverageMax, sparse: cov < p.coverageMin, mixed: mixed || !!prev?.mixed,
    dryAt: r6(w.timeS + p.dryVirtualS), prematureDry: false, phases: [], decolorU: null, rinsed: [], invalidOrder: false, washMissed: false, ml: {},
  };
  m.loop = null;
  refresh(w, slideId);
  flagB(w, 'slidePrepared');
  emitB(w, 'SMEAR_MADE', 'INFO', { obj: slideId });
  return ok({ value: cov });
}

function applyPhase(w: MicroWorld, slideId: string, phase: StainPhase, index?: number): MicroDispatchResult {
  const m = w.micro;
  const p = mp(w);
  const smear = m.smears[slideId];
  if (!w.slides[slideId]) return no('BAD_TARGET');
  // Un reactivo sobre una lámina permanente: es un recurso no editable.
  if (!smear) {
    errB(w, 'MIC-31', 'FIXED_SLIDE_EDIT', 'WARN', { obj: slideId });
    return no('FIXED_SLIDE');
  }
  if (w.objects[slideId].support !== 'rack') {
    errB(w, 'MIC-30', 'STAIN_WITHOUT_RACK', 'WARN', { obj: slideId });
    return no('NOT_ON_RACK');
  }
  const bottle = STAIN_BOTTLE[phase];
  if (m.bottles[bottle] < p.stainDropMl - 1e-9) return no('EMPTY');
  const done = smear.phases;
  const washed = done.length === 0 || smear.rinsed[done.length - 1];
  if (!washed) {
    smear.washMissed = true;
    errB(w, 'MIC-39', 'WASH_OMITTED', 'WARN', { obj: slideId });
  }
  if (phase === 'mordant' && !done.includes('primary')) {
    smear.invalidOrder = true;
    errB(w, 'MIC-38', 'STAIN_ORDER_INVALID', 'WARN', { obj: slideId });
  }
  if (phase === 'decolorizer') {
    if (!done.includes('primary')) errB(w, 'MIC-33', 'PRIMARY_MISSING', 'WARN', { obj: slideId });
    else if (!done.includes('mordant')) errB(w, 'MIC-34', 'MORDANT_MISSING', 'WARN', { obj: slideId });
    const u = r6(Math.max(0, index ?? 1));
    smear.decolorU = u;
    if (u > p.decolorOverU) errB(w, 'MIC-36', 'OVER_DECOLORIZATION', 'WARN', { obj: slideId });
  }
  if (phase === 'counterstain') {
    if (!done.includes('primary')) errB(w, 'MIC-33', 'PRIMARY_MISSING', 'WARN', { obj: slideId });
    else if (!done.includes('mordant')) errB(w, 'MIC-34', 'MORDANT_MISSING', 'WARN', { obj: slideId });
    if (!done.includes('decolorizer')) errB(w, 'MIC-35', 'DECOLORIZATION_MISSING', 'WARN', { obj: slideId });
  }
  m.bottles[bottle] = r6(m.bottles[bottle] - p.stainDropMl);
  smear.ml[phase] = r6((smear.ml[phase] ?? 0) + p.stainDropMl);
  done.push(phase);
  smear.rinsed.push(false);
  refresh(w, slideId);
  flagB(w, `phase:${phase}`);
  emitB(w, 'STAIN_PHASE', 'INFO', { obj: slideId, phase });
  return ok({ value: done.length });
}

function rinse(w: MicroWorld, slideId: string): MicroDispatchResult {
  const m = w.micro;
  const s = m.smears[slideId];
  if (!s) return no('NO_SMEAR');
  if (w.objects[slideId].support !== 'rack') return no('NOT_ON_RACK');
  if (!s.phases.length) return no('NOTHING_TO_RINSE');
  const p = mp(w);
  if (m.bottles.stW < p.washMl - 1e-9) return no('EMPTY');
  m.bottles.stW = r6(m.bottles.stW - p.washMl);
  m.ledger.stW.wasteMl = r6(m.ledger.stW.wasteMl + p.washMl);
  for (const ph of Object.keys(s.ml) as StainPhase[]) {
    m.ledger[STAIN_BOTTLE[ph]].wasteMl = r6(m.ledger[STAIN_BOTTLE[ph]].wasteMl + (s.ml[ph] ?? 0));
    s.ml[ph] = 0;
  }
  s.rinsed[s.rinsed.length - 1] = true;
  refresh(w, slideId);
  return ok();
}

/** Fases exigidas de un frotis completo y correcto (se usa en la evidencia y la rúbrica). */
export const gramComplete = (s: Smear | undefined) => !!s && ['primary', 'mordant', 'decolorizer', 'counterstain'].every((p) => s.phases.includes(p as StainPhase));

// ─────────────────────────── Observación y cierre ───────────────────────────

function capture(w: MicroWorld, cmd: Extract<DivCommand, { type: 'captureObservation' }>): MicroDispatchResult {
  const v = cmd.instrument === 'compound' ? microscopeView(w) : null;
  const slide = v?.slideId ?? null;
  const s = slide ? w.micro.smears[slide] : undefined;
  if (s) {
    // La falta de una fase se ve al mirar: rastro atribuible a lo que no se hizo.
    if (!s.phases.includes('primary')) errB(w, 'MIC-33', 'PRIMARY_MISSING', 'WARN', { obj: slide! });
    else if (!s.phases.includes('mordant')) errB(w, 'MIC-34', 'MORDANT_MISSING', 'WARN', { obj: slide! });
    if (s.phases.includes('primary') && !s.phases.includes('decolorizer')) errB(w, 'MIC-35', 'DECOLORIZATION_MISSING', 'WARN', { obj: slide! });
    if (s.phases.includes('decolorizer') && !s.phases.includes('counterstain')) errB(w, 'MIC-37', 'COUNTERSTAIN_MISSING', 'WARN', { obj: slide! });
  }
  const r = dispatchDiv(w, cmd);
  if (!r.ok || !r.id) return r;
  const o = w.observations[r.id];
  // Objetivo sin limpiar: la imagen arrastra el aceite anterior y no se acredita.
  const stale = w.micro.immersionDirty && (w.div.oil[o.slideId ?? ''] ?? 0) <= 1e-9;
  if (stale && !o.issues.includes('LENS_OIL')) {
    o.issues.push('LENS_OIL');
    o.isObservationValid = false;
    o.visibleRegionIds = [];
    o.captureHash = stableHash({ a: w.assignment.assignmentHash, o: { ...o, captureHash: '' } });
  }
  if (o.isObservationValid && s) {
    flagB(w, `smearCapture:${o.objectiveX ?? 0}`);
    if ((o.objectiveX ?? 0) >= 40) flagB(w, 'validHighPowerObservation');
  }
  if (o.isObservationValid && !s) flagB(w, `controlCapture:${o.slideId}`);
  return r;
}

/** Lo que el cierre de B07 agrega al de B06: placas fuera de su bandeja, asa cargada, frotis sin descartar y lente con aceite. */
export function microOutstanding(w: MicroWorld): string[] {
  const out = divOutstanding(w);
  for (const id of Object.keys(w.micro.plates)) if (w.objects[id] && !['plateTray', 'restrictedRack'].includes(w.objects[id].support)) out.push(id);
  if (w.micro.loop) out.push('loop');
  if (w.micro.immersionDirty) out.push('lens100');
  for (const id of Object.keys(w.micro.smears)) if (!['rack', 'cleanTray', 'glassBin'].includes(w.objects[id]?.support ?? '')) out.push(id);
  return out;
}

function closeBench(w: MicroWorld): MicroDispatchResult {
  const plates = Object.keys(w.micro.plates).filter((id) => w.objects[id] && w.objects[id].support !== 'plateTray' && !w.micro.plates[id].restricted);
  if (plates.length) errB(w, 'MIC-64', 'PLATE_NOT_RETURNED', 'WARN', { n: plates.length });
  if (w.micro.immersionDirty) errB(w, 'MIC-48', 'IMMERSION_NOT_CLEANED', 'WARN');
  const base = divOutstanding(w);
  const extra = microOutstanding(w).filter((x) => !base.includes(x));
  const had = w.evidence.benchRestored;
  const r = dispatchDiv(w, { type: 'closeBench' });
  if (extra.length) {
    if (!had) delete w.evidence.benchRestored;
    return { ...r, value: 0 };
  }
  return r;
}

// ─────────────────────────── Paso fijo ───────────────────────────

export function stepMicroWorld(w: MicroWorld): void {
  stepDivWorld(w);
  markImmersion(w);
  if (w.tick % 4 === 0) {
    for (const [id, s] of Object.entries(w.micro.smears)) if (w.timeS >= s.dryAt) flagB(w, `dried:${id}`);
    if (w.safety.block && (w.safety.block.code === 'RESTRICTED_PLATE' || w.safety.block.code === 'FLAME') && w.timeS - w.safety.block.since > 6) w.safety.block = null;
  }
}

export function runMicroFor(w: MicroWorld, seconds: number): void {
  const n = Math.round(seconds / w.params.dtS);
  for (let i = 0; i < n; i++) stepMicroWorld(w);
}

/** Balances de B06 más cada frasco de tinción: frasco + sobre láminas + residuo = inicial (mL; deben ser 0). */
export function conservedMicro(w: MicroWorld): Record<string, number> {
  const out = conservedDiv(w);
  const m = w.micro;
  for (const [phase, bottle] of Object.entries(STAIN_BOTTLE) as Array<[StainPhase, string]>) {
    const on = Object.values(m.smears).reduce((a, s) => a + (s.ml[phase] ?? 0), 0);
    out[`stain:${bottle}`] = r6(m.ledger[bottle].initialMl - (m.bottles[bottle] + on + m.ledger[bottle].wasteMl));
  }
  out['stain:stW'] = r6(m.ledger.stW.initialMl - (m.bottles.stW + m.ledger.stW.wasteMl));
  return out;
}

export function microSummary(w: MicroWorld) {
  const m = w.micro;
  return {
    ...divSummary(w),
    plate: m.selectedPlate,
    trials: m.trials.map((t) => Math.round(t.overlap01 * 1000)),
    smears: Object.entries(m.smears).map(([id, s]) => [id, s.phases.length, w.slides[id].assetId]),
    dm: m.measures.map((x) => Math.round(x.mm * 1000)),
  };
}

// ─────────────────────────── Creación ───────────────────────────

export interface MicroWorldExtras {
  plates: Record<string, PlateState>;
  smearSlides: string[];
  stainMl: number;
  washMl: number;
  scaleAvailable: boolean;
  assetScope: string[];
}

export function createMicroWorld(spec: OpticalWorldSpec, cx: CellWorldExtras, dx: DivWorldExtras, x: MicroWorldExtras): MicroWorld {
  const w = createDivWorld(spec, cx, dx) as MicroWorld;
  const bottles = { stP: x.stainMl, stM: x.stainMl, stD: x.stainMl, stC: x.stainMl, stW: x.washMl };
  const micro: MicroState = {
    plates: x.plates, inspected: [], classified: {}, labels: {}, mediaCommitted: false, selectedPlate: null, platesViewed: [], viewer: { zoom: 1, calibratedZoom: 1 },
    loop: null, readings: [], measures: [], trials: [], methodsCompared: false, smears: {}, bottles,
    ledger: Object.fromEntries(Object.entries(bottles).map(([k, v]) => [k, { initialMl: v, wasteMl: 0 }])),
    immersionDirty: false, hypotheses: [], scaleAvailable: x.scaleAvailable, assetScope: x.assetScope, seq: 0,
  };
  w.micro = micro;
  return w;
}
