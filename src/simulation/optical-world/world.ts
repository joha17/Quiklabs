/**
 * Mundo B01: microscopía y estereoscopía experimental (§5, §6). `dispatchB01` valida y aplica un comando (hecho del
 * gesto); `stepB01World` avanza 0,05 s (hidratación, evaporación, estabilidad de la vista, banda de separación baja).
 * Lo que se ve por el ocular se DERIVA del estado físico (platina, objetivo, foco, luz, montaje) y de las regiones
 * anotadas del activo asignado; los errores E01–E59 y E63–E68 se detectan aquí con su consecuencia (E60–E62 son de la
 * libreta, en la rúbrica). Determinista: solo `rand(w)`.
 */
import { clamp, stableHash } from '../core/math';
import { rand } from '../core/rng';
import { OBJECTIVES, type ObjectiveX } from '../instruments/optical/microscope-types';
import {
  coarseTurnLimits, fieldOfViewMm, fineTurnLimit, gapAndFocus, illumination, sharpness01, totalMagnification, turretObjective, viewCenterOnSlide, type SlideStack,
} from '../instruments/optical/microscope-model';
import { binocular, stereoFocus, stereoFovMm, stereoLight, stereoMagnification } from '../instruments/optical/stereo-model';
import { misplaced, outsideCase, slotOf } from '../instruments/optical/slide-carrier';
import { bubbleFractionFor, coveredFractionFor, dropVolumeMl, emptyMount, mountAboveMm, mountUsable, type FreshMount } from '../specimens/mount-world';
import { ledgerError } from '../specimens/volumes';
import { assetById, centerOnSpecimen, nearestStructureMm, visibleStructures, type ObservationAssetManifest, type StructureId } from '../specimens/assets';
import type { B01Command, B01DispatchResult } from './commands';
import { bumpB, emitB, errB, flagB, latchB } from './events';
import type { LabObservation, OpticalObject, OpticalWorld, Pose } from './types';
import { CLEAN_TRAY, PREP_SPOT, SAMPLE_TRAY, STAGE_SEAT, STEREO_BASE, caseSlotId } from './geometry';

export const SB = {
  DIRTY_SLIDE: 'B01-S01_dirty_slide',
  BIG_LEAF: 'B01-S02_big_leaf',
  LIMITED_DROPPER: 'B01-S03_limited_dropper',
  NO_WATER: 'B01-S04_no_water',
  COVER_GRIP: 'B01-S05_cover_grip',
  LOW_LIGHT: 'B01-S06_low_light',
  CONDENSER: 'B01-S07_condenser',
  STAGE_OFF: 'B01-S08_stage_off',
  CLIP_CLOSED: 'B01-S09_clip_closed',
  START_40X: 'B01-S10_start_40x',
  SIMILAR_SLIDES: 'B01-S11_similar_slides',
  TWO_PLANES: 'B01-S12_two_planes',
  REFLECTIVE: 'B01-S13_reflective_insect',
  STEREO_DEFOCUS: 'B01-S14_stereo_defocus',
  STEREO_PAIR: 'B01-S15_stereo_pair',
  MONO_2D: 'B01-S16_mono_2d',
  UNKNOWN_SLIDES: 'B01-S17_unknown_slides',
  RESUME_PREP: 'B01-S18_resume_prep',
} as const;

export const sc = (w: OpticalWorld, s: string) => w.scenarios.includes(s);

const ok = (extra: Partial<B01DispatchResult> = {}): B01DispatchResult => ({ ok: true, ...extra });
const no = (code: string): B01DispatchResult => ({ ok: false, code });

// ─────────────────────────── Vistas derivadas ───────────────────────────

/** Pila sobre la platina de una lámina (portaobjetos + preparación). */
export function stackFor(w: OpticalWorld, slideId: string): SlideStack | null {
  const s = w.slides[slideId];
  if (!s) return null;
  const p = w.params;
  if (s.kind === 'fixed') return { slideMm: p.slideThicknessMm, aboveMm: p.fixedAboveMm, specimenDepthMm: p.specimenDepthMm, faceDown: s.faceDown };
  const m = w.mounts[slideId];
  const above = m ? mountAboveMm(m, p.coverThicknessMm) : 0;
  return { slideMm: p.slideThicknessMm, aboveMm: above, specimenDepthMm: m?.specimenId ? Math.min(p.specimenDepthMm, above) : 0, faceDown: s.faceDown };
}

/** Activo y centro del campo sobre la imagen (mm desde su centro) de la lámina en la platina. */
function slideAsset(w: OpticalWorld, slideId: string, centerSlideMm: [number, number]): { asset: ObservationAssetManifest; centerMm: [number, number]; specimenId: string; mount: FreshMount | null } | null {
  const s = w.slides[slideId];
  if (!s) return null;
  if (s.kind === 'fixed' && s.assetId) {
    const asset = assetById(s.assetId);
    return asset ? { asset, centerMm: centerSlideMm, specimenId: slideId, mount: null } : null;
  }
  const m = w.mounts[slideId];
  if (!m?.specimenId || !m.specimenAsset) return null;
  const asset = assetById(m.specimenAsset);
  if (!asset) return null;
  return { asset, centerMm: [centerSlideMm[0] - m.centerCm[0] * 10, centerSlideMm[1] - m.centerCm[1] * 10], specimenId: m.specimenId, mount: m };
}

export interface MicroscopeView {
  objectiveX: ObjectiveX | null;
  locked: boolean;
  gapMm: number;
  focusErrorMm: number;
  sharpness01: number;
  stageZmm: number;
  luminance01: number;
  contrast01: number;
  lightIssues: string[];
  fovMm: number;
  magnification: number;
  slideId: string | null;
  assetId: string | null;
  specimenId: string | null;
  centerMm: [number, number];
  visible: StructureId[];
  onBubble: boolean;
  /** Plano focal (0/1) de las fuentes con dos planos (S12). */
  focusPlane: number;
}

export function microscopeView(w: OpticalWorld): MicroscopeView {
  const m = w.microscope;
  const p = w.params.microscope;
  const t = turretObjective(m.turretDeg, p);
  const obj = t.objectiveX ?? OBJECTIVES[t.index];
  const slideId = m.slideOnStage;
  const stack = slideId ? stackFor(w, slideId) : null;
  const g = gapAndFocus(m, p, obj, stack);
  const light = illumination(m, p, obj);
  const fov = fieldOfViewMm(p.fieldNumberMm, obj);
  const center = viewCenterOnSlide(m, m.slideOffsetMm);
  const sa = slideId ? slideAsset(w, slideId, center) : null;
  let sharp = Number.isFinite(g.focusErrorMm) ? sharpness01(g.focusErrorMm, p.focusSigmaMm[obj]) : 0;
  let focusPlane = 0;
  // Dos planos focales (S12): el segundo plano queda 0,6σ más abajo; el micro elige cuál se ve nítido.
  if (sa && sc(w, SB.TWO_PLANES) && sa.asset.sampleKind === 'fixed') {
    const e2 = Math.abs(g.focusErrorMm - 1.2 * p.focusSigmaMm[obj]);
    const s2 = sharpness01(e2, p.focusSigmaMm[obj]);
    if (s2 > sharp) {
      sharp = s2;
      focusPlane = 1;
    }
  }
  let visible: StructureId[] = [];
  let onBubble = false;
  if (sa && t.locked) {
    visible = visibleStructures(sa.asset, sa.centerMm, fov, { objectiveX: obj });
    if (sa.mount) {
      const cm = sa.mount;
      const rel: [number, number] = [center[0] - cm.coverOffsetCm[0] * 10, center[1] - cm.coverOffsetCm[1] * 10];
      onBubble = cm.bubbles.some((b) => Math.hypot(rel[0] - b.x, rel[1] - b.y) < b.r);
      // Fuera del cubreobjetos el tejido no está cubierto ni en el plano de la preparación.
      if (cm.coveredFraction < 0.7 && Math.abs(rel[1]) > (w.params.mount.coverSizeCm * 10) / 2) visible = [];
    }
    if (w.slides[slideId!]?.faceDown) visible = visible.filter((_, i) => i === 0);
  }
  return {
    objectiveX: t.objectiveX, locked: t.locked, gapMm: g.gapMm, focusErrorMm: g.focusErrorMm, sharpness01: sharp, stageZmm: g.stageZ,
    luminance01: light.luminance01, contrast01: light.contrast01 * (sa?.mount ? 1 - 0.7 * sa.mount.contamination01 : 1) * (1 - 0.8 * m.lensDamage01), lightIssues: light.issues,
    fovMm: fov, magnification: totalMagnification(p.ocularX, obj), slideId, assetId: sa?.asset.assetId ?? null, specimenId: sa?.specimenId ?? null, centerMm: sa?.centerMm ?? center,
    visible, onBubble, focusPlane,
  };
}

export interface StereoView {
  sampleId: string | null;
  assetId: string | null;
  zoomX: number;
  magnification: number;
  fovMm: number;
  focusErrorMm: number;
  sharpness01: number;
  contrast01: number;
  lightIssues: string[];
  centerMm: [number, number];
  visible: StructureId[];
  fused: boolean;
  diopterMismatch: boolean;
  ipdMismatch: boolean;
}

const SAMPLE_HEIGHT_MM: Record<string, number> = { leaf: 0.5, insect: 4, insectShiny: 4 };

export function stereoView(w: OpticalWorld): StereoView {
  const s = w.stereo;
  const p = w.params.stereo;
  const sample = s.sampleId ? w.stereoSamples[s.sampleId] : null;
  const asset = sample ? assetById(sample.assetId) : undefined;
  const top = asset ? SAMPLE_HEIGHT_MM[asset.assetId] ?? 1 : 0;
  const f = stereoFocus(s, p, top);
  const light = stereoLight(s, p, asset ? { opaque: !!asset.opaque, reflective: !!asset.reflective } : null);
  const fov = stereoFovMm(p, s.zoomX);
  const center: [number, number] = [-s.sampleOffsetMm[0], -s.sampleOffsetMm[1]];
  const bin = binocular(s, p);
  let visible = asset ? visibleStructures(asset, center, fov, { zoomX: s.zoomX }) : [];
  // Daño por manipulación (E58): los apéndices dejan de distinguirse.
  if (sample && sample.damage01 > 0.3) visible = visible.filter((x) => x !== 'antenna' && x !== 'leg');
  return {
    sampleId: s.sampleId, assetId: asset?.assetId ?? null, zoomX: s.zoomX, magnification: stereoMagnification(p, s.zoomX), fovMm: fov, focusErrorMm: f.focusErrorMm,
    sharpness01: f.sharpness01, contrast01: light.contrast01, lightIssues: light.issues, centerMm: center, visible, ...bin,
  };
}

/** Separación objetivo–preparación baja (banda persistente). */
export const gapLow = (w: OpticalWorld) => !!w.microscope.slideOnStage && microscopeView(w).gapMm < w.params.microscope.gapWarnMm;

// ─────────────────────────── Conservación ───────────────────────────

export function mountedMl(w: OpticalWorld): number {
  return Object.values(w.mounts).reduce((a, m) => a + m.waterMl + m.reagentMl, 0);
}

/** Balance del líquido (error, mL) y de las piezas de vidrio (debe ser 0). */
export function conservedB01(w: OpticalWorld): Record<string, number> {
  const reservoir = Object.values(w.dispensers).reduce((a, d) => a + d.ml, 0);
  const f = { ...w.fluids, reservoirMl: reservoir, mountMl: mountedMl(w) };
  const covers = Object.values(w.covers).length;
  return {
    water: ledgerError(f),
    covers: w.material.initialCounts.covers - covers,
    coversBroken: Object.values(w.covers).filter((c) => c.state === 'broken').length - (w.material.brokenCounts.covers ?? 0),
    slides: w.material.initialCounts.slides - Object.keys(w.slides).length,
  };
}

// ─────────────────────────── Creación ───────────────────────────

export interface OpticalWorldSpec {
  seed: number;
  mode: string;
  params: OpticalWorld['params'];
  scenarios: string[];
  objects: OpticalObject[];
  slides: OpticalWorld['slides'];
  covers: OpticalWorld['covers'];
  dispensers: OpticalWorld['dispensers'];
  dish: OpticalWorld['dish'];
  stereoSamples: OpticalWorld['stereoSamples'];
  slideCase: { slots: Record<string, string | null>; home: Record<string, string> };
  assignment: Omit<OpticalWorld['assignment'], 'assetHashes' | 'assignmentHash'>;
  microscope: Partial<OpticalWorld['microscope']>;
  stereo: Partial<OpticalWorld['stereo']>;
  mounts?: OpticalWorld['mounts'];
}

export function createOpticalWorld(spec: OpticalWorldSpec): OpticalWorld {
  const p = spec.params;
  const objects: Record<string, OpticalObject> = {};
  for (const o of spec.objects) objects[o.id] = structuredClone(o);
  const assetIds = [spec.assignment.freshAsset, ...spec.assignment.fixedSlideIds.map((id) => spec.slides[id]?.assetId ?? ''), ...spec.assignment.stereoSampleIds.map((id) => spec.stereoSamples[id]?.assetId ?? '')].filter(Boolean);
  const assetHashes: Record<string, string> = {};
  for (const a of assetIds) assetHashes[a] = assetById(a)?.contentHash ?? 'missing';
  const initialMl = Object.values(spec.dispensers).reduce((a, d) => a + d.ml, 0) + Object.values(spec.mounts ?? {}).reduce((a, m) => a + m.waterMl + m.reagentMl, 0);
  const w: OpticalWorld = {
    schemaVersion: 1,
    timeS: 0,
    tick: 0,
    seed: spec.seed,
    rng: spec.seed >>> 0 || 1,
    params: p,
    mode: spec.mode,
    scientificMode: 'curricular',
    assignment: { ...spec.assignment, assetHashes, assignmentHash: stableHash({ a: spec.assignment, h: assetHashes }) },
    objects,
    slides: structuredClone(spec.slides),
    mounts: structuredClone(spec.mounts ?? {}),
    covers: structuredClone(spec.covers),
    forceps: { holding: null, dirty01: 0, residueFrom: null },
    dispensers: structuredClone(spec.dispensers),
    dish: { ...spec.dish },
    stereoSamples: structuredClone(spec.stereoSamples),
    microscope: {
      power: false, light01: 0.4, diaphragm01: 0.5, condenser01: 0.9, turretDeg: 0, stageXmm: 0, stageYmm: 0, coarseTurns: 0, fineTurns: 0, clipOpen: true,
      clampedSlideId: null, sideCheckedAt: null, impactCount: 0, lensDamage01: 0, slideOnStage: null, slideOffsetMm: [0, 0], ...spec.microscope,
    },
    stereo: {
      power: false, incident01: 0.5, transmitted01: 0, zoomX: 1, headZmm: 112, focusTurns: -6, ipdMm: p.stereo.userIpdMm, leftDiopter: 0, rightDiopter: 0, sampleId: null,
      channelMode: 'mono', sampleOffsetMm: [0, 0], headMovedAt: null, focusedAt: null, locatedLowZoom: false, ...spec.stereo,
    },
    slideCase: { open: false, slots: { ...spec.slideCase.slots }, home: { ...spec.slideCase.home }, openedAt: null },
    view: { instrument: null, openedAt: 0, stableSince: 0, capturedSinceOpen: false },
    observations: {},
    observationOrder: [],
    fluids: { initialMl, reservoirMl: 0, mountMl: 0, wasteMl: 0, spilledMl: 0, evaporatedMl: 0 },
    material: { initialCounts: { covers: Object.keys(spec.covers).length, slides: Object.keys(spec.slides).length }, brokenCounts: { covers: 0 } },
    shards: 0,
    benchSpillMl: 0,
    safety: { ppe: { coat: false, shoes: false, hair: false, hands: false, gloves: false }, block: null, incident: null, stoppedByTeacher: false },
    events: [],
    evidence: {},
    scenarios: [...spec.scenarios],
    ppe: false,
  };
  for (const s of w.scenarios) w.evidence[`scenario:${s}`] = 1;
  return w;
}

// ─────────────────────────── Despacho ───────────────────────────

/** Comandos permitidos sin EPP confirmado. */
const PRE_PPE = new Set<B01Command['type']>(['setPPE', 'startWork', 'inspect', 'pause', 'teacherStop', 'acknowledge']);

export function dispatchB01(w: OpticalWorld, cmd: B01Command): B01DispatchResult {
  if (w.safety.stoppedByTeacher && cmd.type !== 'teacherStop' && cmd.type !== 'pause') return no('TEACHER_STOP');
  if (!w.ppe && !PRE_PPE.has(cmd.type)) {
    errB(w, 'E68', 'PPE_REQUIRED', 'CRITICAL');
    return no('PPE');
  }
  switch (cmd.type) {
    case 'setPPE':
      w.safety.ppe[cmd.item] = cmd.enabled;
      return ok();
    case 'startWork': {
      const s = w.safety.ppe;
      const missing = (['coat', 'shoes', 'hair', 'hands'] as const).filter((k) => !s[k]);
      if (missing.length) {
        errB(w, 'E68', 'PPE_REQUIRED', 'CRITICAL', { n: missing.length });
        return no('PPE_MISSING');
      }
      w.ppe = true;
      flagB(w, 'ppe');
      emitB(w, 'PPE_OK', 'INFO');
      return ok();
    }
    case 'inspect':
      return inspect(w, cmd.target);
    case 'setPose':
      return setPose(w, cmd.id, cmd.pose, cmd.support);
    case 'pickSpecimen':
      return pickSpecimen(w, cmd.toolId, cmd.sourceId, cmd.pressure01 ?? 0.3);
    case 'placeSpecimen':
      return placeSpecimen(w, cmd.toolId, cmd.targetId, cmd.dxCm, cmd.dyCm);
    case 'cutSpecimen':
      return cutSpecimen(w, cmd.slideId, cmd.toolId, cmd.keepFraction, cmd.pressure01);
    case 'squeezeDropper':
      return squeezeDropper(w, cmd.dispenserId, cmd.targetId, cmd.force01, cmd.dxCm, cmd.dyCm);
    case 'grabCover':
      return grabCover(w, cmd.coverId, cmd.toolId);
    case 'setCoverTilt': {
      const c = w.covers[cmd.coverId];
      if (!c || c.state !== 'held') return no('NOT_HELD');
      c.tiltDeg = clamp(cmd.angleDeg, 0, 90);
      return ok();
    }
    case 'lowerCover':
      return lowerCover(w, cmd.coverId, cmd.slideId, cmd.speedCmS, cmd.dxCm, cmd.dyCm);
    case 'liftCover':
      return liftCover(w, cmd.slideId, cmd.toolId);
    case 'pressCover':
      return pressCover(w, cmd.slideId, cmd.force01);
    case 'wipe':
      return wipe(w, cmd.targetId, cmd.toolId, cmd.dxCm ?? 0, cmd.dyCm ?? 0);
    case 'flipSlide': {
      const s = w.slides[cmd.slideId];
      const o = w.objects[cmd.slideId];
      if (!s || !o) return no('NO_OBJECT');
      if (o.support !== 'hand' && o.support !== 'bench') return no('NOT_HELD');
      if (w.mounts[cmd.slideId]?.specimenId) return no('MOUNTED');
      s.faceDown = !s.faceDown;
      return ok();
    }
    case 'cleanShards':
      if (w.shards <= 0) return no('NOTHING');
      w.shards = 0;
      flagB(w, 'shardsCleaned');
      if (w.safety.block?.code === 'SHARDS') w.safety.block = null;
      emitB(w, 'SHARDS_CLEANED', 'INFO');
      return ok();
    case 'openClip':
      return openClip(w, cmd.open);
    case 'setStageXY':
      return setStageXY(w, cmd.xMm, cmd.yMm);
    case 'turnCoarse':
      return turnFocus(w, 'coarse', cmd.deltaTurns);
    case 'turnFine':
      return turnFocus(w, 'fine', cmd.deltaTurns);
    case 'turnTurret':
      return turnTurret(w, cmd.deltaDeg);
    case 'setPower':
      return setPower(w, cmd.device, cmd.on);
    case 'setIllumination': {
      const v = clamp(cmd.value01, 0, 1);
      if (cmd.device === 'microscope') w.microscope.light01 = v;
      else if (cmd.device === 'stereo-incident') w.stereo.incident01 = v;
      else w.stereo.transmitted01 = v;
      used(w, cmd.device === 'microscope' ? 'mic:light' : cmd.device === 'stereo-incident' ? 'ste:incident' : 'ste:transmitted');
      changed(w);
      return ok();
    }
    case 'setDiaphragm':
      w.microscope.diaphragm01 = clamp(cmd.value01, 0, 1);
      used(w, 'mic:diaphragm');
      changed(w);
      return ok();
    case 'setCondenser':
      w.microscope.condenser01 = clamp(cmd.value01, 0, 1);
      used(w, 'mic:condenser');
      changed(w);
      return ok();
    case 'checkSide':
      w.microscope.sideCheckedAt = w.timeS;
      flagB(w, 'sideChecked');
      return ok();
    case 'setStereoZoom':
      return setStereoZoom(w, cmd.zoomX);
    case 'setStereoFocus':
      return setStereoFocus(w, cmd.deltaTurns);
    case 'setStereoHead': {
      const p = w.params.stereo;
      const z = clamp(cmd.zMm, p.headZRangeMm[0], p.headZRangeMm[1]);
      if (Math.abs(z - w.stereo.headZmm) > 0.01) w.stereo.headMovedAt = seqB(w);
      w.stereo.headZmm = z;
      used(w, 'ste:head');
      changed(w);
      return ok();
    }
    case 'setInterpupillary':
      w.stereo.ipdMm = clamp(cmd.valueMm, 50, 76);
      used(w, 'ste:interpupillary');
      changed(w);
      return ok();
    case 'setDiopter':
      if (cmd.side === 'left') w.stereo.leftDiopter = clamp(cmd.value, -5, 5);
      else w.stereo.rightDiopter = clamp(cmd.value, -5, 5);
      used(w, 'ste:diopter');
      changed(w);
      return ok();
    case 'openSlideCase':
      w.slideCase.open = cmd.open;
      w.slideCase.openedAt = cmd.open ? w.timeS : null;
      if (cmd.open) flagB(w, 'caseOpened');
      return ok();
    case 'observe':
      return observe(w, cmd.instrument, cmd.open, cmd.sampleId);
    case 'captureObservation':
      return capture(w, cmd.instrument);
    case 'attachObservation': {
      const o = w.observations[cmd.observationId];
      if (!o || cmd.attemptHash !== w.assignment.assignmentHash) {
        errB(w, 'E63', 'FOREIGN_CAPTURE', 'WARN');
        return no('FOREIGN_OBSERVATION');
      }
      return ok({ id: o.id });
    }
    case 'closeBench':
      return closeBench(w);
    case 'acknowledge':
      if (w.safety.block) {
        if (w.safety.block.code === 'GAP_LOW' && gapLow(w)) return no('GAP_LOW');
        if (w.safety.block.code === 'COLLISION' && microscopeView(w).gapMm < w.params.microscope.gapSafeRemoveMm) return no('GAP_LOW');
        if (w.safety.block.code === 'SHARDS' && w.shards > 0) return no('SHARDS');
        if (w.safety.block.code === 'SPILL' && w.benchSpillMl > 0.005) return no('SPILL');
        w.safety.block = null;
        emitB(w, 'BLOCK_CLEARED', 'INFO');
      }
      return ok();
    case 'pause':
      return ok();
    case 'teacherStop':
      w.safety.stoppedByTeacher = cmd.on;
      return ok();
  }
}

/** Orden de los gestos (para «antes/después» dentro del mismo tic). */
const seqB = (w: OpticalWorld) => (w.evidence.__seq = (w.evidence.__seq ?? 0) + 1);

/** Registro de uso de una parte (Cuadros 1–2) y reinicio de la estabilidad de la vista. */
const used = (w: OpticalWorld, part: string) => flagB(w, `used:${part}`);
const changed = (w: OpticalWorld) => {
  w.view.stableSince = w.timeS;
};

function inspect(w: OpticalWorld, target: string): B01DispatchResult {
  if (target.startsWith('mic:') || target.startsWith('ste:')) {
    flagB(w, `part:${target}`);
    emitB(w, 'PART_LOCATED', 'INFO', { part: target });
    return ok();
  }
  const o = w.objects[target];
  if (!o) return no('NO_OBJECT');
  flagB(w, `inspected:${target}`);
  const s = w.slides[target];
  if (s?.kind === 'blank' && s.dirty01 > 0.2) {
    flagB(w, `residueSeen:${target}`);
    emitB(w, 'RESIDUE_SEEN', 'WARN', { obj: target });
  } else emitB(w, 'INSPECTED', 'INFO', { obj: target });
  return ok();
}

// ─────────────────────────── Poses y apoyos ───────────────────────────

const FIXED = (w: OpticalWorld, id: string) => w.slides[id]?.kind === 'fixed';

function setPose(w: OpticalWorld, id: string, pose: Pose, support?: string): B01DispatchResult {
  const o = w.objects[id];
  if (!o) return no('NO_OBJECT');
  const prev = o.support;
  if (support && support !== prev) {
    // Caja de láminas: retirar con la tapa cerrada no es posible (E41).
    if (prev.startsWith('case:') && !w.slideCase.open) {
      errB(w, 'E41', 'CASE_CLOSED', 'WARN', { obj: id });
      return no('CASE_CLOSED');
    }
    if (support.startsWith('case:')) {
      if (!w.slideCase.open) return no('CASE_CLOSED');
      if (!FIXED(w, id)) return no('BAD_TARGET');
      const slot = support.slice(5);
      if (w.slideCase.slots[slot] && w.slideCase.slots[slot] !== id) return no('SLOT_BUSY');
    }
    // Platina: entrar con la pinza cerrada (E15), salir sujeta (E38) o con el objetivo cerca (E39).
    if (support === 'stage') {
      if (!w.slides[id]) return no('BAD_TARGET');
      if (w.microscope.slideOnStage && w.microscope.slideOnStage !== id) return no('SLOT_BUSY');
      if (!w.microscope.clipOpen) {
        errB(w, 'E15', 'CLIP_CLOSED', 'WARN', { obj: id });
        return no('CLIP_CLOSED');
      }
    }
    if (prev === 'stage') {
      if (w.microscope.clampedSlideId === id && !w.microscope.clipOpen) {
        errB(w, 'E38', 'SLIDE_CLAMPED', 'WARN', { obj: id });
        return no('SLIDE_CLAMPED');
      }
      if (microscopeView(w).gapMm < w.params.microscope.gapSafeRemoveMm) {
        errB(w, 'E39', 'REMOVE_GAP_UNSAFE', 'ALERT', { obj: id });
        return no('GAP_UNSAFE');
      }
    }
    // Estereoscopio: retirar la muestra con el ocular abierto y sin registrar (E59).
    if (prev === 'stereoBase' && w.view.instrument === 'stereo' && !w.view.capturedSinceOpen) errB(w, 'E59', 'STEREO_INTERRUPTED', 'WARN', { obj: id });
    if (support === 'stereoBase' && !w.stereoSamples[id]) return no('BAD_TARGET');
    if (support === 'prep' && !w.slides[id]) return no('BAD_TARGET');
    if (support === 'prep' && Object.values(w.objects).some((x) => x.id !== id && x.support === 'prep')) return no('SLOT_BUSY');
  }
  o.pose = { ...pose };
  if (support && support !== prev) {
    o.support = support;
    leave(w, id, prev);
    enter(w, id, support);
  } else if (o.support === 'stereoBase') {
    w.stereo.sampleOffsetMm = [(pose.x - STEREO_BASE.x) * 10, (pose.y - STEREO_BASE.y) * 10];
    changed(w);
  } else if (o.support === 'stage') {
    w.microscope.slideOffsetMm = [(pose.x - STAGE_SEAT.x) * 10, (pose.y - STAGE_SEAT.y) * 10];
    changed(w);
  }
  return ok();
}

function leave(w: OpticalWorld, id: string, from: string) {
  if (from.startsWith('case:')) {
    const slot = from.slice(5);
    if (w.slideCase.slots[slot] === id) w.slideCase.slots[slot] = null;
  }
  if (from === 'stage' && w.microscope.slideOnStage === id) {
    w.microscope.slideOnStage = null;
    w.microscope.clampedSlideId = null;
    w.microscope.slideOffsetMm = [0, 0];
    changed(w);
    emitB(w, 'SLIDE_REMOVED', 'INFO', { obj: id });
  }
  if (from === 'stereoBase' && w.stereo.sampleId === id) {
    w.stereo.sampleId = null;
    changed(w);
  }
}

function enter(w: OpticalWorld, id: string, to: string) {
  const o = w.objects[id];
  if (to.startsWith('case:')) {
    const slot = to.slice(5);
    w.slideCase.slots[slot] = id;
    if (w.slideCase.home[id] !== slot) errB(w, 'E44', 'WRONG_SLOT', 'WARN', { obj: id });
    else flagB(w, `returned:${id}`);
  }
  if (to === 'stage') {
    const m = w.microscope;
    m.slideOnStage = id;
    m.slideOffsetMm = [(o.pose.x - STAGE_SEAT.x) * 10, (o.pose.y - STAGE_SEAT.y) * 10];
    changed(w);
    used(w, 'mic:stage');
    const s = w.slides[id];
    // Invertida o fuera del asiento: la muestra no queda en el eje ni en el plano de la preparación (E17).
    if (s.faceDown || Math.hypot(...m.slideOffsetMm) > w.params.seatTolMm) errB(w, 'E17', 'SLIDE_MISPLACED', 'WARN', { obj: id });
    // Líquido derramado en la platina, cerca del sistema eléctrico.
    const mt = w.mounts[id];
    if (mt?.floating) {
      const spill = Math.max(0, mt.waterMl - w.params.mount.excessMl * 0.5);
      mt.waterMl -= spill;
      w.benchSpillMl += spill;
      w.fluids.spilledMl += spill;
      w.safety.block = { code: 'SPILL', since: w.timeS };
      emitB(w, 'LIQUID_SPILL', 'ALERT', { obj: id });
    }
    flagB(w, `onStage:${id}`);
  }
  if (to === 'stereoBase') {
    w.stereo.sampleId = id;
    w.stereo.sampleOffsetMm = [(o.pose.x - STEREO_BASE.x) * 10, (o.pose.y - STEREO_BASE.y) * 10];
    changed(w);
    used(w, 'ste:base');
    if (Math.hypot(...w.stereo.sampleOffsetMm) > w.params.stereo.centerTolMm) errB(w, 'E49', 'STEREO_OFF_CENTER', 'WARN', { obj: id });
    flagB(w, `onStereo:${id}`);
  }
  if (to === 'sampleTray' && w.stereoSamples[id]) flagB(w, `sampleReturned:${id}`);
  if (to === 'cleanTray' && w.slides[id]?.kind === 'blank') flagB(w, `toCleanTray:${id}`);
}

// ─────────────────────────── Preparación ───────────────────────────

function mountOn(w: OpticalWorld, slideId: string): FreshMount | null {
  const s = w.slides[slideId];
  if (!s || s.kind !== 'blank') return null;
  if (!w.mounts[slideId]) w.mounts[slideId] = emptyMount(slideId);
  return w.mounts[slideId];
}

function pickSpecimen(w: OpticalWorld, toolId: string, sourceId: string, pressure01: number): B01DispatchResult {
  if (toolId !== 'fc') return no('BAD_TOOL');
  const f = w.forceps;
  if (f.holding) return no('TOOL_BUSY');
  // Pinza con restos de otra muestra (E13): se contamina lo que se toma.
  const dirtyFromOther = f.dirty01 > 0.3 && f.residueFrom !== sourceId;
  if (sourceId === 'el') {
    if (w.dish.leaves <= 0) return no('EMPTY');
    w.dish.leaves -= 1;
    f.holding = { kind: 'specimen', assetId: w.assignment.freshAsset, sourceId, fragmentCm: w.dish.leafCm };
  } else if (w.stereoSamples[sourceId]) {
    const o = w.objects[sourceId];
    if (o.support === 'stereoBase') {
      if (w.view.instrument === 'stereo' && !w.view.capturedSinceOpen) errB(w, 'E59', 'STEREO_INTERRUPTED', 'WARN', { obj: sourceId });
      leave(w, sourceId, 'stereoBase');
    }
    o.support = 'fc';
    f.holding = { kind: 'sample', sampleId: sourceId };
    // Insecto: apretarlo deforma los apéndices (E58).
    if (w.stereoSamples[sourceId].assetId.startsWith('insect') && pressure01 > 0.6) {
      w.stereoSamples[sourceId].damage01 = clamp(w.stereoSamples[sourceId].damage01 + 0.5, 0, 1);
      errB(w, 'E58', 'INSECT_DAMAGED', 'WARN', { obj: sourceId });
    }
  } else return no('BAD_SOURCE');
  if (dirtyFromOther) {
    errB(w, 'E13', 'TOOL_CONTAMINATED', 'WARN', { obj: sourceId });
    flagB(w, 'carryContamination');
  }
  return ok();
}

function placeSpecimen(w: OpticalWorld, toolId: string, targetId: string, dxCm: number, dyCm: number): B01DispatchResult {
  const f = w.forceps;
  if (toolId !== 'fc' || !f.holding) return no('NOTHING_HELD');
  if (f.holding.kind === 'sample') {
    const id = f.holding.sampleId;
    const target = targetId === 'stereoBase' ? STEREO_BASE : targetId === 'sampleTray' ? SAMPLE_TRAY : null;
    if (!target) return no('BAD_TARGET');
    f.holding = null;
    f.dirty01 = Math.max(f.dirty01, 0.2);
    f.residueFrom = id;
    const o = w.objects[id];
    o.pose = { x: target.x + dxCm, y: target.y + dyCm, z: target.z, rotationRad: 0 };
    o.support = targetId;
    enter(w, id, targetId);
    return ok();
  }
  if (f.holding.kind !== 'specimen') return no('NOTHING_HELD');
  if (FIXED(w, targetId)) {
    errB(w, 'E42', 'FIXED_SLIDE_PERMANENT', 'WARN', { obj: targetId });
    return no('FIXED_SLIDE');
  }
  const m = mountOn(w, targetId);
  if (!m) return no('BAD_TARGET');
  if (w.objects[targetId].support !== 'prep') return no('NOT_ON_PREP');
  if (m.specimenId) return no('ALREADY_MOUNTED');
  const h = f.holding;
  m.specimenId = `${h.assetId}@${targetId}`;
  m.specimenAsset = h.assetId;
  m.fragmentCm = h.fragmentCm;
  m.centerCm = [dxCm, dyCm];
  m.cutState = 'intact';
  m.hydrated01 = 1;
  f.holding = null;
  // La pinza queda con restos de este tejido.
  f.dirty01 = 0.6;
  f.residueFrom = h.sourceId;
  if (w.evidence.carryContamination) m.contamination01 = clamp(m.contamination01 + 0.35, 0, 1);
  // Vidrio con residuo sin limpiar (E01).
  const s = w.slides[targetId];
  if (s.dirty01 > 0.2) {
    m.contamination01 = clamp(m.contamination01 + s.dirty01 * 0.8, 0, 1);
    errB(w, 'E01', 'DIRTY_SLIDE', 'WARN', { obj: targetId });
  }
  // Fragmento en el borde o diminuto (E03).
  if (Math.hypot(dxCm, dyCm) > w.params.mount.edgeCm || h.fragmentCm < w.params.mount.minFragmentCm) errB(w, 'E03', 'FRAGMENT_POORLY_PLACED', 'WARN', { obj: targetId });
  // El líquido ya presente humedece el fragmento si está cerca.
  if (m.waterMl > 0 && Math.hypot(m.waterCenterCm[0] - dxCm, m.waterCenterCm[1] - dyCm) <= w.params.mount.dropReachCm) m.wetsSpecimen = true;
  flagB(w, 'specimenPlaced');
  emitB(w, 'SPECIMEN_PLACED', 'INFO', { obj: targetId });
  return ok();
}

function cutSpecimen(w: OpticalWorld, slideId: string, toolId: string, keepFraction: number, pressure01: number): B01DispatchResult {
  if (toolId !== 'sc') return no('BAD_TOOL');
  const o = w.objects[slideId];
  const m = w.mounts[slideId];
  if (!o || !m?.specimenId) return no('NO_SPECIMEN');
  // Corte fuera del área de montaje: superficie insegura.
  if (o.support !== 'prep') {
    emitB(w, 'CUT_UNSAFE', 'ALERT', { obj: slideId });
    return no('CUT_UNSAFE');
  }
  if (m.coverId) return no('COVERED');
  const keep = clamp(keepFraction, 0.05, 1);
  m.fragmentCm *= keep;
  m.cutState = 'prepared';
  if (!w.dish.cutRequired) {
    m.damage01 = clamp(m.damage01 + 0.3, 0, 1);
    m.cutState = 'damaged';
    errB(w, 'E05', 'NEEDLESS_CUT', 'WARN', { obj: slideId });
  } else if (pressure01 > 0.75) {
    m.damage01 = clamp(m.damage01 + 0.45, 0, 1);
    m.cutState = 'damaged';
    errB(w, 'E04', 'DEEP_CUT', 'WARN', { obj: slideId });
  }
  if (m.fragmentCm < w.params.mount.minFragmentCm) errB(w, 'E03', 'FRAGMENT_POORLY_PLACED', 'WARN', { obj: slideId });
  flagB(w, 'specimenCut');
  emitB(w, 'SPECIMEN_CUT', 'INFO', { obj: slideId, cm: Math.round(m.fragmentCm * 100) / 100 });
  return ok();
}

function squeezeDropper(w: OpticalWorld, dispenserId: string, targetId: string, force01: number, dxCm: number, dyCm: number): B01DispatchResult {
  const d = w.dispensers[dispenserId];
  if (!d) return no('NOT_DROPPER');
  if (FIXED(w, targetId)) {
    errB(w, 'E42', 'FIXED_SLIDE_PERMANENT', 'WARN', { obj: targetId });
    return no('FIXED_SLIDE');
  }
  if (d.ml <= 1e-9) return no('EMPTY');
  const vol = Math.min(d.ml, dropVolumeMl(w.params.mount, force01));
  d.ml -= vol;
  const m = mountOn(w, targetId);
  if (!m || w.objects[targetId]?.support !== 'prep') {
    w.benchSpillMl += vol;
    w.fluids.spilledMl += vol;
    emitB(w, 'DROP_SPILLED', 'WARN', { obj: dispenserId });
    return ok({ value: vol });
  }
  if (m.coverId) return ok({ value: vol, ...(void (m.waterMl += vol), {}) });
  if (d.reagent === 'water') {
    const prev = m.waterMl;
    m.waterMl += vol;
    m.waterCenterCm = prev > 0 ? [(m.waterCenterCm[0] * prev + dxCm * vol) / m.waterMl, (m.waterCenterCm[1] * prev + dyCm * vol) / m.waterMl] : [dxCm, dyCm];
  } else {
    m.reagentMl += vol;
    m.reagentId = d.reagent;
    // Reactivo no asignado a esta muestra (E14).
    errB(w, 'E14', 'REAGENT_NOT_ASSIGNED', 'WARN', { obj: targetId });
  }
  if (m.specimenId) {
    const dist = Math.hypot(dxCm - m.centerCm[0], dyCm - m.centerCm[1]);
    if (dist <= w.params.mount.dropReachCm) m.wetsSpecimen = true;
    // La gota cayó lejos de la hoja (E08): no la humedece.
    else if (!m.wetsSpecimen) errB(w, 'E08', 'DROP_MISSED', 'WARN', { obj: targetId });
  }
  flagB(w, 'dropAdded');
  emitB(w, 'DROP_ADDED', 'INFO', { obj: targetId, ml: Math.round(vol * 1000) / 1000 });
  return ok({ value: vol });
}

function grabCover(w: OpticalWorld, coverId: string, toolId: string): B01DispatchResult {
  const c = w.covers[coverId];
  if (!c) return no('NO_OBJECT');
  if (toolId !== 'fc') return no('BAD_TOOL');
  if (w.forceps.holding) return no('TOOL_BUSY');
  if (c.state !== 'box') return no('NOT_AVAILABLE');
  c.state = 'held';
  c.tiltDeg = sc(w, SB.COVER_GRIP) ? 5 : 45;
  w.forceps.holding = { kind: 'cover', coverId };
  w.objects[coverId].support = 'fc';
  return ok();
}

function lowerCover(w: OpticalWorld, coverId: string, slideId: string, speedCmS: number, dxCm: number, dyCm: number): B01DispatchResult {
  const c = w.covers[coverId];
  if (!c || c.state !== 'held') return no('NOT_HELD');
  if (FIXED(w, slideId)) {
    errB(w, 'E43', 'FIXED_ALREADY_COVERED', 'WARN', { obj: slideId });
    return no('FIXED_SLIDE');
  }
  const m = mountOn(w, slideId);
  if (!m || w.objects[slideId].support !== 'prep') return no('NOT_ON_PREP');
  if (m.coverId) return no('ALREADY_COVERED');
  const p = w.params.mount;
  c.state = 'placed';
  c.onSlide = slideId;
  w.forceps.holding = null;
  const o = w.objects[coverId];
  o.support = slideId;
  m.coverId = coverId;
  m.coverOffsetCm = [dxCm, dyCm];
  const angle = c.tiltDeg;
  m.bubbleFraction = bubbleFractionFor(p, angle, speedCmS, m.waterMl);
  // Burbujas: posiciones del RNG serializable; su número y tamaño, de la fracción.
  const n = Math.round(m.bubbleFraction * 14);
  const half = (p.coverSizeCm * 10) / 2;
  m.bubbles = Array.from({ length: n }, () => {
    const r = 0.25 + rand(w) * (0.4 + m.bubbleFraction * 2.2);
    return { x: (rand(w) * 2 - 1) * (half - r), y: (rand(w) * 2 - 1) * (half - r), r: Math.round(r * 1000) / 1000 };
  });
  // Siempre una burbuja sobre el centro cuando el descenso fue plano (oculta el tejido).
  if (angle < 12 && m.specimenId) m.bubbles.push({ x: m.centerCm[0] * 10 - dxCm * 10, y: m.centerCm[1] * 10 - dyCm * 10, r: 1.2 });
  m.coveredFraction = coveredFractionFor(p, m.fragmentCm, m.centerCm, m.coverOffsetCm);
  if (angle < 12) errB(w, 'E09', 'COVER_DROPPED_FLAT', 'WARN', { obj: slideId });
  else if (speedCmS > p.coverMaxSpeedCmS && angle < 30) errB(w, 'E10', 'COVER_FAST', 'WARN', { obj: slideId });
  if (m.specimenId && m.coveredFraction < 0.85 && m.fragmentCm > p.maxFragmentCm) errB(w, 'E02', 'FRAGMENT_TOO_BIG', 'WARN', { obj: slideId });
  if (m.waterMl < p.needMl && m.specimenId) errB(w, 'E06', 'NO_MOUNT_LIQUID', 'WARN', { obj: slideId });
  if (m.waterMl > p.excessMl) {
    m.floating = true;
    const spill = (m.waterMl - p.excessMl) * 0.5;
    m.waterMl -= spill;
    w.benchSpillMl += spill;
    w.fluids.spilledMl += spill;
    errB(w, 'E07', 'TOO_MUCH_LIQUID', 'WARN', { obj: slideId });
  }
  // Vidrio con residuo (E01) también si el residuo queda bajo la cubierta.
  if (w.slides[slideId].dirty01 > 0.2 && !w.evidence['err:E01']) {
    m.contamination01 = clamp(m.contamination01 + w.slides[slideId].dirty01 * 0.8, 0, 1);
    errB(w, 'E01', 'DIRTY_SLIDE', 'WARN', { obj: slideId });
  }
  if (mountUsable(p, m)) flagB(w, 'mountUsable');
  flagB(w, 'coverApplied');
  emitB(w, 'COVER_LOWERED', 'INFO', { obj: slideId, bubbles: Math.round(m.bubbleFraction * 100) });
  return ok({ value: m.bubbleFraction });
}

function liftCover(w: OpticalWorld, slideId: string, toolId: string): B01DispatchResult {
  const m = w.mounts[slideId];
  if (!m?.coverId || toolId !== 'fc') return no('NOT_COVERED');
  if (w.objects[slideId].support !== 'prep') return no('NOT_ON_PREP');
  if (w.forceps.holding) return no('TOOL_BUSY');
  const c = w.covers[m.coverId];
  if (m.broken) return no('BROKEN');
  c.state = 'held';
  c.onSlide = null;
  c.tiltDeg = 45;
  w.objects[m.coverId].support = 'fc';
  w.forceps.holding = { kind: 'cover', coverId: m.coverId };
  m.coverId = null;
  m.bubbles = [];
  m.bubbleFraction = 0;
  m.floating = false;
  flagB(w, 'coverLifted');
  emitB(w, 'COVER_LIFTED', 'INFO', { obj: slideId });
  return ok();
}

function pressCover(w: OpticalWorld, slideId: string, force01: number): B01DispatchResult {
  const m = w.mounts[slideId];
  if (!m?.coverId) return no('NOT_COVERED');
  if (force01 > w.params.mount.coverBreakForce01 && !m.broken) {
    m.broken = true;
    m.damage01 = clamp(m.damage01 + 0.4, 0, 1);
    w.covers[m.coverId].state = 'broken';
    w.material.brokenCounts.covers = (w.material.brokenCounts.covers ?? 0) + 1;
    w.shards += 1;
    w.safety.block = { code: 'SHARDS', since: w.timeS };
    errB(w, 'E11', 'COVER_CRACKED', 'ALERT', { obj: slideId });
    emitB(w, 'COVER_BROKEN', 'ALERT', { obj: slideId });
    return ok();
  }
  // Presión suave: expulsa burbujas pequeñas del borde.
  if (force01 > 0.15 && m.bubbleFraction > 0.02) {
    m.bubbleFraction = Math.max(0.02, m.bubbleFraction * 0.8);
    m.bubbles = m.bubbles.filter((b) => b.r > 0.6);
  }
  return ok();
}

function wipe(w: OpticalWorld, targetId: string, toolId: string, dxCm: number, dyCm: number): B01DispatchResult {
  // Lente del objetivo: solo papel de lente (E65).
  if (targetId === 'mic:lens') {
    if (toolId !== 'lp') {
      errB(w, 'E65', 'ABRASIVE_LENS_CLEANING', 'ALERT');
      emitB(w, 'LENS_CLEANING_INVALID', 'WARN');
      return no('ABRASIVE');
    }
    w.microscope.lensDamage01 = 0;
    flagB(w, 'lensCleaned');
    return ok();
  }
  if (targetId === 'fc') {
    if (toolId !== 'lp' && toolId !== 'pp') return no('BAD_TOOL');
    w.forceps.dirty01 = 0;
    w.forceps.residueFrom = null;
    delete w.evidence.carryContamination;
    flagB(w, 'forcepsCleaned');
    return ok();
  }
  if (targetId === 'bench' || targetId === 'stage') {
    if (toolId !== 'pp') return no('BAD_TOOL');
    w.fluids.spilledMl -= w.benchSpillMl;
    w.fluids.wasteMl += w.benchSpillMl;
    w.benchSpillMl = 0;
    if (w.safety.block?.code === 'SPILL') w.safety.block = null;
    emitB(w, 'SPILL_CLEANED', 'INFO');
    return ok();
  }
  const s = w.slides[targetId];
  if (!s) return no('NO_OBJECT');
  const m = w.mounts[targetId];
  // Portaobjetos sin preparación: limpieza del vidrio.
  if (!m?.specimenId && !m?.coverId && (m?.waterMl ?? 0) < 1e-9) {
    if (toolId !== 'lp') return no('BAD_TOOL');
    s.dirty01 = 0;
    flagB(w, `cleaned:${targetId}`);
    emitB(w, 'SLIDE_CLEANED', 'INFO', { obj: targetId });
    return ok();
  }
  if (!m) return no('NO_OBJECT');
  if (toolId !== 'pp') return no('BAD_TOOL');
  const dist = Math.hypot(dxCm - m.centerCm[0], dyCm - m.centerCm[1]);
  // Papel sobre la muestra (E12): se lleva el líquido útil y daña el tejido.
  if (dist < 0.5 && m.specimenId) {
    const take = m.waterMl * 0.7;
    m.waterMl -= take;
    w.fluids.wasteMl += take;
    m.damage01 = clamp(m.damage01 + 0.25, 0, 1);
    m.wetsSpecimen = m.waterMl >= w.params.mount.needMl;
    errB(w, 'E12', 'PAPER_ON_SPECIMEN', 'WARN', { obj: targetId });
    return ok();
  }
  // Borde: retira el exceso sin arrastrar la muestra.
  const excess = Math.max(0, m.waterMl - w.params.mount.excessMl * 0.6);
  m.waterMl -= excess;
  w.fluids.wasteMl += excess;
  if (m.floating && m.waterMl <= w.params.mount.excessMl) m.floating = false;
  if (mountUsable(w.params.mount, m)) flagB(w, 'mountUsable');
  flagB(w, 'edgeWiped');
  emitB(w, 'EDGE_WIPED', 'INFO', { obj: targetId, ml: Math.round(excess * 1000) / 1000 });
  return ok({ value: excess });
}

// ─────────────────────────── Microscopio ───────────────────────────

function openClip(w: OpticalWorld, open: boolean): B01DispatchResult {
  const m = w.microscope;
  m.clipOpen = open;
  used(w, 'mic:clip');
  if (!open && m.slideOnStage) {
    m.clampedSlideId = m.slideOnStage;
    flagB(w, 'slideClamped');
  }
  if (open) m.clampedSlideId = null;
  changed(w);
  return ok();
}

function setStageXY(w: OpticalWorld, xMm: number, yMm: number): B01DispatchResult {
  const m = w.microscope;
  const r = w.params.microscope.stageXYRangeMm;
  const before = microscopeView(w);
  const nx = clamp(xMm, r[0], r[1]);
  const ny = clamp(yMm, r[0], r[1]);
  const dx = nx - m.stageXmm;
  const dy = ny - m.stageYmm;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return ok();
  m.stageXmm = nx;
  m.stageYmm = ny;
  used(w, 'mic:stageKnobs');
  changed(w);
  // Lámina suelta (E16): no acompaña del todo el movimiento de la platina.
  if (m.slideOnStage && m.clampedSlideId !== m.slideOnStage) {
    m.slideOffsetMm = [m.slideOffsetMm[0] - dx * 0.5, m.slideOffsetMm[1] - dy * 0.5];
    errB(w, 'E16', 'SLIDE_UNCLAMPED', 'WARN', { obj: m.slideOnStage });
    emitB(w, 'SLIDE_UNCLAMPED', 'WARN');
  }
  const after = microscopeView(w);
  if (before.assetId && after.assetId && before.locked) {
    const a = assetById(after.assetId)!;
    // Fuera de la muestra (E33) o alejándose de la estructura (E34).
    if (!centerOnSpecimen(a, after.centerMm, after.fovMm)) {
      if (before.visible.length) errB(w, 'E33', 'STAGE_OFF_SPECIMEN', 'WARN');
    } else {
      const d0 = nearestStructureMm(a, before.centerMm);
      const d1 = nearestStructureMm(a, after.centerMm);
      if (d0 < before.fovMm && d1 > d0 + 0.4 * before.fovMm && before.visible.some((x) => !after.visible.includes(x))) errB(w, 'E34', 'STAGE_WRONG_WAY', 'WARN');
    }
  }
  return ok();
}

function turnFocus(w: OpticalWorld, knob: 'coarse' | 'fine', deltaTurns: number): B01DispatchResult {
  const m = w.microscope;
  const p = w.params.microscope;
  if (!deltaTurns) return ok();
  const before = microscopeView(w);
  const obj = before.objectiveX ?? OBJECTIVES[turretObjective(m.turretDeg, p).index];
  riskyWithCaseOpen(w);
  if (knob === 'coarse') {
    // En la zona de separación baja no se permite seguir acercando con el macro (banda persistente).
    if (deltaTurns > 0 && m.slideOnStage && before.gapMm < p.gapWarnMm) {
      w.safety.block = { code: 'GAP_LOW', since: w.timeS };
      emitB(w, 'OPTICAL_GAP_LOW', 'ALERT');
      return no('GAP_LOW');
    }
    if (obj === 40 && deltaTurns > 0 && Math.abs(deltaTurns) > p.coarseAt40MaxTurns && m.slideOnStage) errB(w, 'E22', 'COARSE_AT_40X', 'ALERT');
    const [lo, hi] = coarseTurnLimits(m, p);
    const target = m.coarseTurns + deltaTurns;
    if (target > hi + 1e-9 || target < lo - 1e-9) errB(w, 'E24', 'COARSE_LIMIT', 'WARN');
    m.coarseTurns = clamp(target, lo, hi);
    w.evidence.__fineFar = 0;
    used(w, 'mic:coarse');
  } else {
    const lim = fineTurnLimit(p);
    const target = m.fineTurns + deltaTurns;
    if (Math.abs(target) > lim + 1e-9) errB(w, 'E25', 'FINE_LIMIT', 'WARN');
    m.fineTurns = clamp(target, -lim, lim);
    used(w, 'mic:fine');
    flagB(w, `fineAfter:${w.evidence.__objChange ?? 0}`);
    // Micro sin haber localizado el foco con el macro (E23).
    if (w.view.instrument === 'compound' && m.slideOnStage && before.focusErrorMm > 8 * p.focusSigmaMm[obj] && (obj === 4 || obj === 10)) {
      bumpB(w, '__fineFar', Math.abs(deltaTurns));
      if ((w.evidence.__fineFar ?? 0) > 2) errB(w, 'E23', 'FINE_WITHOUT_COARSE', 'WARN');
    }
  }
  changed(w);
  if (m.slideOnStage) {
    const after = microscopeView(w);
    if (after.gapMm <= 0) collide(w, after.gapMm);
    else if (after.gapMm < p.gapWarnMm) {
      const checked = m.sideCheckedAt !== null && w.timeS - m.sideCheckedAt <= p.sideCheckValidS;
      if (!checked) errB(w, 'E20', 'GAP_UNCHECKED', 'ALERT');
      latchB(w, `gapLow:${Math.floor(w.timeS / 30)}`, 'OPTICAL_GAP_LOW', 'ALERT');
    }
  }
  return ok();
}

/** Choque objetivo–preparación (E21): daño, accidente consumado y la platina queda en contacto. */
function collide(w: OpticalWorld, gapMm: number) {
  const m = w.microscope;
  const p = w.params.microscope;
  // La platina no atraviesa el objetivo: se deshace lo que excede el contacto.
  m.coarseTurns -= -gapMm / p.coarsePitchMmPerTurn;
  m.impactCount += 1;
  const mt = m.slideOnStage ? w.mounts[m.slideOnStage] : null;
  if (mt?.coverId && !mt.broken) {
    mt.broken = true;
    mt.damage01 = clamp(mt.damage01 + 0.5, 0, 1);
    w.covers[mt.coverId].state = 'broken';
    w.material.brokenCounts.covers = (w.material.brokenCounts.covers ?? 0) + 1;
    w.shards += 1;
  }
  m.lensDamage01 = clamp(m.lensDamage01 + 0.3, 0, 1);
  w.safety.incident = w.safety.incident ?? { code: 'OBJECTIVE_COLLISION', since: w.timeS };
  w.safety.block = { code: 'COLLISION', since: w.timeS };
  errB(w, 'E21', 'OBJECTIVE_COLLISION', 'CRITICAL');
  emitB(w, 'OBJECTIVE_COLLISION', 'CRITICAL');
}

function turnTurret(w: OpticalWorld, deltaDeg: number): B01DispatchResult {
  const m = w.microscope;
  const p = w.params.microscope;
  riskyWithCaseOpen(w);
  const before = microscopeView(w);
  const prevObj = before.objectiveX;
  const next = clamp(m.turretDeg + deltaDeg, 0, (OBJECTIVES.length - 1) * p.turretDetentDeg);
  m.turretDeg = next;
  used(w, 'mic:turret');
  changed(w);
  const t = turretObjective(next, p);
  if (!t.locked) return ok();
  // Enclavado: el objetivo nuevo puede quedar muy cerca de una preparación gruesa.
  if (t.objectiveX !== prevObj) {
    w.evidence.__objChange = (w.evidence.__objChange ?? 0) + 1;
    flagB(w, `objective:${t.objectiveX}`);
    emitB(w, 'OBJECTIVE_LOCKED', 'INFO', { x: t.objectiveX! });
    const after = microscopeView(w);
    if (m.slideOnStage) {
      if (t.objectiveX === 40 && !w.evidence.located4x) errB(w, 'E18', 'HIGH_FIRST', 'WARN');
      if (prevObj && t.objectiveX! > prevObj && before.visible.length && !after.visible.length) errB(w, 'E32', 'NOT_CENTERED_BEFORE_ZOOM', 'WARN');
      if (after.gapMm <= 0) collide(w, after.gapMm);
    }
  }
  return ok();
}

function setPower(w: OpticalWorld, device: 'microscope' | 'stereo', on: boolean): B01DispatchResult {
  if (on && w.safety.block?.code === 'SPILL') return no('SPILL');
  if (device === 'microscope') {
    w.microscope.power = on;
    used(w, 'mic:light');
  } else {
    w.stereo.power = on;
    used(w, 'ste:incident');
  }
  changed(w);
  emitB(w, on ? 'POWER_ON' : 'POWER_OFF', 'INFO', { obj: device });
  return ok();
}

/** Caja abierta mientras se manipula el microscopio (E46). */
function riskyWithCaseOpen(w: OpticalWorld) {
  if (w.slideCase.open && w.slideCase.openedAt !== null && w.timeS - w.slideCase.openedAt > w.params.caseOpenRiskS) errB(w, 'E46', 'CASE_LEFT_OPEN', 'WARN');
}

// ─────────────────────────── Estereoscopio ───────────────────────────

function setStereoZoom(w: OpticalWorld, zoomX: number): B01DispatchResult {
  const s = w.stereo;
  const p = w.params.stereo;
  const z = clamp(zoomX, p.zoomRange[0], p.zoomRange[1]);
  if (z >= p.highZoom && s.zoomX < p.highZoom && s.sampleId && !s.locatedLowZoom) errB(w, 'E53', 'STEREO_ZOOM_FIRST', 'WARN');
  s.zoomX = z;
  used(w, 'ste:zoom');
  changed(w);
  return ok();
}

function setStereoFocus(w: OpticalWorld, deltaTurns: number): B01DispatchResult {
  const s = w.stereo;
  const p = w.params.stereo;
  const lim = p.focusRangeMm / p.focusPitchMmPerTurn;
  const target = s.focusTurns + deltaTurns;
  if (Math.abs(target) > lim + 1e-9) errB(w, 'E55', 'STEREO_FOCUS_LIMIT', 'WARN');
  s.focusTurns = clamp(target, -lim, lim);
  s.focusedAt = seqB(w);
  used(w, 'ste:focus');
  changed(w);
  return ok();
}

// ─────────────────────────── Observación ───────────────────────────

function observe(w: OpticalWorld, instrument: 'compound' | 'stereo', open: boolean, sampleId?: string): B01DispatchResult {
  if (!open) {
    if (w.view.instrument === instrument) w.view.instrument = null;
    return ok();
  }
  if (instrument === 'compound') {
    const v = microscopeView(w);
    // La vista pedida no corresponde a la lámina colocada (E47).
    if (sampleId && sampleId !== (v.slideId ?? '')) {
      errB(w, 'E47', 'VIEW_MISMATCH', 'WARN');
      return no('VIEW_NOT_ASSIGNED');
    }
    used(w, 'mic:ocular');
    if (v.slideId && v.objectiveX === 40 && !w.evidence.located4x) errB(w, 'E18', 'HIGH_FIRST', 'WARN');
  } else {
    if (sampleId && sampleId !== (w.stereo.sampleId ?? '')) {
      errB(w, 'E47', 'VIEW_MISMATCH', 'WARN');
      return no('VIEW_NOT_ASSIGNED');
    }
    used(w, 'ste:oculars');
    if (!w.stereo.sampleId) errB(w, 'E48', 'STEREO_NO_SAMPLE', 'WARN');
  }
  w.view = { instrument, openedAt: w.timeS, stableSince: w.timeS, capturedSinceOpen: false };
  flagB(w, `viewed:${instrument}`);
  return ok();
}

function obsId(w: OpticalWorld) {
  const n = w.observationOrder.length + 1;
  return `obs:${String(n).padStart(3, '0')}`;
}

function capture(w: OpticalWorld, instrument: 'compound' | 'stereo'): B01DispatchResult {
  if (w.view.instrument !== instrument) return no('NOT_VIEWING');
  if (w.timeS - w.view.stableSince < w.params.observationHoldS - 1e-9) return no('NOT_OBSERVED');
  const issues: string[] = [];
  let obs: LabObservation;
  if (instrument === 'compound') {
    const v = microscopeView(w);
    const m = w.microscope;
    const p = w.params.microscope;
    if (!v.slideId) return no('NO_SAMPLE');
    const asset = v.assetId ? assetById(v.assetId) : undefined;
    if (!v.locked) {
      issues.push('NO_OBJECTIVE');
      errB(w, 'E19', 'TURRET_NOT_LOCKED', 'WARN');
    }
    if (v.lightIssues.includes('LIGHT_OFF')) {
      issues.push('LIGHT_OFF');
      errB(w, 'E26', 'LIGHT_OFF', 'WARN');
    } else if (v.lightIssues.includes('LOW_LIGHT')) {
      issues.push('LOW_LIGHT');
      errB(w, 'E27', 'LOW_LIGHT', 'WARN');
    } else if (v.lightIssues.includes('WASHED')) {
      issues.push('WASHED');
      errB(w, 'E28', 'WASHED_OUT', 'WARN');
    }
    if (v.lightIssues.includes('DIAPHRAGM_CLOSED')) {
      issues.push('DIAPHRAGM_CLOSED');
      errB(w, 'E29', 'DIAPHRAGM_TOO_CLOSED', 'WARN');
    } else if (v.lightIssues.includes('DIAPHRAGM_OPEN')) {
      issues.push('DIAPHRAGM_OPEN');
      errB(w, 'E30', 'DIAPHRAGM_TOO_OPEN', 'WARN');
    }
    if (v.lightIssues.includes('CONDENSER')) {
      issues.push('CONDENSER');
      errB(w, 'E31', 'CONDENSER_MISSET', 'WARN');
    }
    if (v.sharpness01 < p.sharpnessValid) {
      issues.push('OUT_OF_FOCUS');
      const lastChange = w.evidence.__objChange ?? 0;
      if (lastChange > 0 && !w.evidence[`fineAfter:${lastChange}`]) errB(w, 'E35', 'NO_REFOCUS_AFTER_CHANGE', 'WARN');
      else errB(w, 'E36', 'CAPTURE_OUT_OF_FOCUS', 'WARN');
    }
    if (v.onBubble) {
      issues.push('BUBBLE');
      errB(w, 'E37', 'CAPTURE_ON_BUBBLE', 'WARN');
    }
    if (v.locked && !v.visible.length && !v.onBubble) {
      issues.push('EMPTY_FIELD');
      if (asset && !centerOnSpecimen(asset, v.centerMm, v.fovMm)) errB(w, 'E33', 'STAGE_OFF_SPECIMEN', 'WARN');
    }
    const s = w.slides[v.slideId];
    const mt = w.mounts[v.slideId];
    if (s.faceDown) issues.push('FACE_DOWN');
    if (s.kind === 'blank') {
      if (!mt?.specimenId) issues.push('NO_SPECIMEN');
      else {
        if (mt.broken) issues.push('BROKEN');
        if (mt.reagentId) issues.push('REAGENT');
        if (mt.hydrated01 < 0.6) issues.push('DRY');
        if (mt.contamination01 > 0.3) issues.push('ARTIFACTS');
        if (mt.damage01 >= 0.5) issues.push('DAMAGED');
        if (mt.floating) issues.push('FLOATING');
      }
    } else if (!w.assignment.fixedSlideIds.includes(v.slideId)) {
      issues.push('NOT_ASSIGNED');
      errB(w, 'E40', 'WRONG_FIXED_SLIDE', 'WARN', { obj: v.slideId });
    }
    if (v.contrast01 < 0.5 && !issues.some((i) => ['LIGHT_OFF', 'LOW_LIGHT', 'WASHED'].includes(i))) issues.push('LOW_CONTRAST');
    const blocking = ['NO_OBJECTIVE', 'LIGHT_OFF', 'LOW_LIGHT', 'WASHED', 'OUT_OF_FOCUS', 'BUBBLE', 'EMPTY_FIELD', 'FACE_DOWN', 'NO_SPECIMEN', 'BROKEN', 'REAGENT', 'DRY', 'DAMAGED', 'FLOATING', 'NOT_ASSIGNED', 'LOW_CONTRAST'];
    const valid = !issues.some((i) => blocking.includes(i)) && !!asset;
    const obj = v.objectiveX ?? 4;
    const ext = asset?.extentMm ?? [10, 10];
    obs = {
      id: obsId(w), tick: w.tick, t: w.timeS, instrument: 'compound', specimenId: v.specimenId ?? v.slideId, slideId: v.slideId, assetId: asset?.assetId ?? '', assetVersion: asset?.version ?? 0,
      assetHash: asset?.contentHash ?? '', viewId: `x${obj}`, objectiveX: v.objectiveX ?? undefined, ocularX: p.ocularX, magnification: v.magnification, fovMm: v.fovMm,
      normalizedViewport: [0.5 + v.centerMm[0] / ext[0], 0.5 + v.centerMm[1] / ext[1], v.fovMm / ext[0], v.fovMm / ext[1]],
      focusErrorMm: round6(v.focusErrorMm), sharpness01: round6(v.sharpness01), light01: round6(m.light01), contrast01: round6(v.contrast01), issues,
      visibleRegionIds: valid ? v.visible : [], captureHash: '', isObservationValid: valid, channel: 'mono',
    };
    if (valid) {
      if (obj === 4) flagB(w, 'located4x');
      if (s.kind === 'blank') flagB(w, `freshCapture:${obj}`);
      else flagB(w, `fixedCapture:${v.slideId}`);
      if (sc(w, SB.TWO_PLANES) && s.kind === 'fixed') flagB(w, `plane:${v.focusPlane}`);
    }
  } else {
    const v = stereoView(w);
    const p = w.params.stereo;
    if (!v.sampleId) {
      errB(w, 'E48', 'STEREO_NO_SAMPLE', 'WARN');
      return no('NO_SAMPLE');
    }
    const asset = assetById(v.assetId!)!;
    if (v.lightIssues.includes('LIGHT_OFF')) {
      issues.push('LIGHT_OFF');
      errB(w, 'E52', 'STEREO_LIGHT_OFF', 'WARN');
    } else if (v.lightIssues.includes('NO_INCIDENT')) {
      issues.push('NO_INCIDENT');
      errB(w, 'E50', 'STEREO_NO_INCIDENT', 'WARN');
    } else if (v.lightIssues.includes('LOW_LIGHT')) {
      issues.push('LOW_LIGHT');
      errB(w, 'E52', 'STEREO_LIGHT_OFF', 'WARN');
    }
    if (v.lightIssues.includes('GLARE')) {
      issues.push('GLARE');
      errB(w, 'E51', 'STEREO_GLARE', 'WARN');
    }
    if (v.sharpness01 < p.sharpnessValid) {
      issues.push('OUT_OF_FOCUS');
      const s = w.stereo;
      if (s.headMovedAt !== null && (s.focusedAt === null || s.focusedAt < s.headMovedAt)) errB(w, 'E54', 'STEREO_NO_REFOCUS', 'WARN');
    }
    if (v.diopterMismatch) {
      issues.push('DIOPTER');
      errB(w, 'E56', 'DIOPTER_MISMATCH', 'WARN');
    }
    if (v.ipdMismatch) {
      issues.push('IPD');
      errB(w, 'E57', 'IPD_MISMATCH', 'WARN');
    }
    if (!v.visible.length) issues.push('EMPTY_FIELD');
    if (w.stereoSamples[v.sampleId].damage01 > 0.3) issues.push('DAMAGED');
    const blocking = ['LIGHT_OFF', 'NO_INCIDENT', 'LOW_LIGHT', 'GLARE', 'OUT_OF_FOCUS', 'DIOPTER', 'IPD', 'EMPTY_FIELD'];
    const valid = !issues.some((i) => blocking.includes(i));
    const ext = asset.extentMm;
    obs = {
      id: obsId(w), tick: w.tick, t: w.timeS, instrument: 'stereo', specimenId: v.sampleId, assetId: asset.assetId, assetVersion: asset.version, assetHash: asset.contentHash,
      viewId: w.stereo.channelMode === 'stereo-pair' ? 'pair' : 'mono', ocularX: p.ocularX, zoomX: v.zoomX, magnification: v.magnification, fovMm: v.fovMm,
      normalizedViewport: [0.5 + v.centerMm[0] / ext[0], 0.5 + v.centerMm[1] / ext[1], v.fovMm / ext[0], v.fovMm / ext[1]],
      focusErrorMm: round6(v.focusErrorMm), sharpness01: round6(v.sharpness01), light01: round6(Math.max(w.stereo.incident01, w.stereo.transmitted01)), contrast01: round6(v.contrast01),
      issues, visibleRegionIds: valid ? v.visible : [], captureHash: '', isObservationValid: valid, channel: w.stereo.channelMode,
    };
    if (valid) {
      flagB(w, `stereoCapture:${v.sampleId}`);
      if (v.zoomX <= p.locateZoomMax) w.stereo.locatedLowZoom = true;
    }
  }
  obs.captureHash = stableHash({ a: w.assignment.assignmentHash, o: { ...obs, captureHash: '' } });
  w.observations[obs.id] = obs;
  w.observationOrder.push(obs.id);
  w.view.capturedSinceOpen = true;
  emitB(w, 'OBSERVATION_RECORDED', obs.isObservationValid ? 'INFO' : 'WARN', { id: obs.id, n: obs.visibleRegionIds.length });
  return ok({ id: obs.id, value: obs.isObservationValid ? 1 : 0 });
}

const round6 = (v: number) => (Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : 999);

// ─────────────────────────── Cierre ───────────────────────────

/** Puesto en orden: lo que falta guardar o devolver. */
export function outstanding(w: OpticalWorld): string[] {
  const out: string[] = [];
  if (w.microscope.slideOnStage) out.push(w.microscope.slideOnStage);
  for (const id of outsideCase(w.slideCase)) out.push(id);
  for (const id of Object.keys(w.stereoSamples)) if (w.objects[id]?.support !== 'sampleTray') out.push(id);
  for (const id of Object.keys(w.slides)) if (w.slides[id].kind === 'blank' && w.mounts[id]?.specimenId && !['cleanTray', 'bioWaste'].includes(w.objects[id]?.support ?? '')) out.push(id);
  if (w.forceps.holding) out.push('fc');
  return [...new Set(out)];
}

export function safeParked(w: OpticalWorld): boolean {
  const t = turretObjective(w.microscope.turretDeg, w.params.microscope);
  return t.locked && t.objectiveX === 4 && !w.microscope.slideOnStage;
}

function closeBench(w: OpticalWorld): B01DispatchResult {
  const out = outstanding(w);
  const left = outsideCase(w.slideCase);
  if (left.length) errB(w, 'E45', 'FIXED_SLIDE_NOT_RETURNED', 'WARN', { n: left.length });
  if (out.filter((x) => !left.includes(x)).length) errB(w, 'E64', 'BENCH_INCOMPLETE', 'WARN', { n: out.length });
  const t = turretObjective(w.microscope.turretDeg, w.params.microscope);
  if (!(t.locked && t.objectiveX === 4)) errB(w, 'E66', 'NOT_PARKED_LOW', 'WARN');
  if (w.microscope.power || w.stereo.power) errB(w, 'E67', 'LEFT_ON', 'WARN');
  if (misplaced(w.slideCase).length) errB(w, 'E44', 'WRONG_SLOT', 'WARN');
  const parked = safeParked(w);
  const restored = !out.length && !w.microscope.power && !w.stereo.power && !w.slideCase.open && w.shards === 0 && w.benchSpillMl < 0.005;
  if (parked) flagB(w, 'safeParked');
  if (restored) flagB(w, 'benchRestored');
  flagB(w, 'closeAttempted');
  emitB(w, 'BENCH_CLOSED', parked && restored ? 'INFO' : 'WARN', { n: out.length });
  return ok({ value: parked && restored ? 1 : 0 });
}

// ─────────────────────────── Paso fijo ───────────────────────────

export function stepB01World(w: OpticalWorld): void {
  const dt = w.params.dtS;
  w.tick += 1;
  w.timeS = Math.round(w.tick * dt * 1e6) / 1e6;
  const p = w.params.mount;
  for (const m of Object.values(w.mounts)) {
    const covered = !!m.coverId && !m.broken;
    const rate = covered ? p.evapCoveredMlS : p.evapOpenMlS;
    const ev = Math.min(m.waterMl, rate * dt);
    m.waterMl -= ev;
    w.fluids.evaporatedMl += ev;
    if (!m.specimenId) continue;
    const wet = m.wetsSpecimen && m.waterMl >= p.needMl * 0.5;
    if (!wet) {
      m.hydrated01 = clamp(m.hydrated01 - p.dehydratePerS * dt, 0, 1);
      if (m.hydrated01 < 0.6) errB(w, 'E06', 'NO_MOUNT_LIQUID', 'WARN', { obj: m.slideId });
    } else m.hydrated01 = clamp(m.hydrated01 + 0.02 * dt, 0, 1);
  }
  // Localización a 4X mientras se mira (habilita el paso seguro a 40X).
  if (w.view.instrument === 'compound' && w.tick % 4 === 0) {
    const v = microscopeView(w);
    if (v.objectiveX === 4 && v.sharpness01 >= w.params.microscope.sharpnessValid && v.visible.length && !v.lightIssues.includes('LIGHT_OFF')) flagB(w, 'located4x');
  }
  if (w.view.instrument === 'stereo' && w.tick % 4 === 0) {
    const v = stereoView(w);
    if (v.zoomX <= w.params.stereo.locateZoomMax && v.sharpness01 >= w.params.stereo.sharpnessValid && v.visible.length) w.stereo.locatedLowZoom = true;
  }
  if (w.safety.block?.code === 'GAP_LOW' && !gapLow(w)) w.safety.block = null;
}

export function runB01For(w: OpticalWorld, seconds: number): void {
  const n = Math.round(seconds / w.params.dtS);
  for (let i = 0; i < n; i++) stepB01World(w);
}

/** Resumen para el hash de la bitácora. */
export function b01Summary(w: OpticalWorld) {
  const m = w.microscope;
  return {
    stage: [Math.round(m.stageXmm * 100), Math.round(m.stageYmm * 100), Math.round(m.coarseTurns * 1000), Math.round(m.fineTurns * 1000)],
    tur: m.turretDeg,
    slide: m.slideOnStage,
    obs: w.observationOrder.length,
    mounts: Object.values(w.mounts).map((x) => [x.slideId, Math.round(x.waterMl * 1e5), Math.round(x.bubbleFraction * 1000)]),
    errs: Object.keys(w.evidence).filter((k) => k.startsWith('err:')).length,
  };
}

export { slotOf, caseSlotId, PREP_SPOT, CLEAN_TRAY };
