/**
 * Mundo B10: tejidos animales y anatomía comparada (§5, §6). `dispatchAnimal` resuelve los gestos del visor (clasificar materiales,
 * girar, rotular regiones, tipos de pico y pata, cráneos, luz rasante de huellas) y deja el resto a `dispatchDiv`, con los catálogos
 * anteriores traducidos a TA-NN por `params.codeMap`. El catálogo decide qué es cada región y desde dónde se ve; el gesto nunca
 * trae la respuesta. `stepAnimalWorld` avanza 0,05 s. Determinista: aquí no hay azar.
 */
import { clamp } from '../core/math';
import { incident } from '../cell-world/world';
import type { CellWorldExtras } from '../cell-world/world';
import { conservedDiv, createDivWorld, dispatchDiv, divOutstanding, divSummary, stepDivWorld, type DivWorldExtras } from '../div-world/world';
import type { DivCommand } from '../div-world/commands';
import { emitB, errB, flagB } from '../optical-world/events';
import type { OpticalWorldSpec } from '../optical-world/world';
import { microscopeView, outstanding } from '../optical-world/world';
import { liquidMl } from '../specimens/mount-world';
import { modelById, regionVisible, type AnatomyPart, type AnatomyRegion } from './catalog';
import { TA } from './codes';
import type { AnimalCommand, AnimalDispatchResult, AnimalOnlyCommand } from './commands';
import { ANIMAL_ONLY_TYPES } from './commands';
import { MATERIALS } from './materials';
import type { AnimalParams, AnimalState, AnimalWorld, ModelView } from './types';

export const SC_B10 = {
  HISTOLOGY: 'TA-S01', MUSCLE: 'TA-S02', SPONGE_CNIDARIA: 'TA-S03', FLATWORMS: 'TA-S04', ANNELIDS: 'TA-S05', ARTHROPODS: 'TA-S06', DAPHNIA_LOUSE: 'TA-S07', MEDUSA_STAGES: 'TA-S08', WORM_MODELS: 'TA-S09', EARTHWORM: 'TA-S10',
  INSECT_ARACHNID: 'TA-S11', FISH: 'TA-S12', TETRAPODS: 'TA-S13', BIRDS: 'TA-S14', MAMMALS: 'TA-S15', SKULLS: 'TA-S16', TEETH: 'TA-S17', TRACKS: 'TA-S18', SKULL_TEETH_TRACKS: 'TA-S19', HORSE: 'TA-S20',
  COW: 'TA-S21', HORSE_COW: 'TA-S22', DIETS: 'TA-S23', EVAL_4: 'TA-S24', EVAL_8: 'TA-S25', EVAL_12: 'TA-S26', ADMIN: 'TA-S27', TEACHER: 'TA-S28', FRESH: 'TA-S29', NO_FRESH: 'TA-S30',
  VIDEO: 'TA-S31', STILLS: 'TA-S32', INCIDENT: 'TA-S33', DEMO: 'TA-S34', REVIEW: 'TA-S35',
} as const;

const ok = (extra: Partial<AnimalDispatchResult> = {}): AnimalDispatchResult => ({ ok: true, ...extra });
const no = (code: string): AnimalDispatchResult => ({ ok: false, code });
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const pa = (w: AnimalWorld): AnimalParams => w.params.animal!;

const emptyView = (): ModelView => ({ yawDeg: 0, pitchDeg: 0, zoom: 1, rotatedDeg: 0, opened: false });

// ─────────────────────────── Despacho ───────────────────────────

/**
 * Un número no finito nunca es un hecho físico, y un id como `constructor` encontraría algo en cualquier mapa del mundo. Ninguno sale de la
 * interfaz, pero una cinta sí puede traerlos: se rechazan antes de tocar el estado.
 */
function malformed(cmd: AnimalCommand): boolean {
  const bad = (o: object) => Object.values(o).some((v) => (typeof v === 'number' && !Number.isFinite(v)) || (typeof v === 'string' && v in Object.prototype));
  const pose = (cmd as { pose?: object }).pose;
  return bad(cmd) || (!!pose && bad(pose));
}

export function dispatchAnimal(w: AnimalWorld, cmd: AnimalCommand): AnimalDispatchResult {
  if (malformed(cmd)) return no('BAD_COMMAND');
  // Las capas heredadas no devuelven nada ante un tipo desconocido.
  return dispatchKnown(w, cmd) ?? no('BAD_COMMAND');
}

function dispatchKnown(w: AnimalWorld, cmd: AnimalCommand): AnimalDispatchResult {
  if (ANIMAL_ONLY_TYPES.has(cmd.type)) {
    if (w.safety.stoppedByTeacher) return no('TEACHER_STOP');
    if (!w.ppe) {
      errB(w, 'E68', 'PPE_REQUIRED', 'CRITICAL');
      return no('PPE');
    }
    return animalOnly(w, cmd as AnimalOnlyCommand);
  }
  const c = cmd as DivCommand;
  if (!w.ppe) return dispatchDiv(w, c);
  switch (c.type) {
    case 'setPose': {
      // Una lámina a la platina sin leer su etiqueta: se puede, pero queda registrado.
      if (c.support === 'stage' && w.slides[c.id]?.kind === 'fixed' && !w.animal.labelsRead.includes(c.id)) errB(w, TA.LABEL_UNREAD, 'LABEL_UNREAD', 'WARN', { obj: c.id });
      return dispatchDiv(w, c);
    }
    case 'flipSlide':
      // Voltear un montaje fresco deja la muestra del lado que no se pidió observar.
      if (w.mounts[c.slideId]?.cell?.zones.length && w.slides[c.slideId]?.kind !== 'fixed') errB(w, TA.SAMPLE_INVERTED, 'SAMPLE_INVERTED', 'WARN', { obj: c.slideId });
      return dispatchDiv(w, c);
    case 'selectObjective':
      if (c.objectiveX === 100) {
        flagB(w, 'asset:missingMagnification');
        incident(w, 'objective:100');
      }
      return dispatchDiv(w, c);
    case 'markRegion':
      return mark(w, c);
    case 'closeBench':
      return closeBench(w);
    default:
      return dispatchDiv(w, c);
  }
}

function animalOnly(w: AnimalWorld, cmd: AnimalOnlyCommand): AnimalDispatchResult {
  const a = w.animal;
  switch (cmd.type) {
    case 'classifyMaterial':
      return classifyMaterial(w, cmd);
    case 'readSlideLabel': {
      if (w.slides[cmd.slideId]?.kind !== 'fixed') return no('BAD_TARGET');
      if (!a.labelsRead.includes(cmd.slideId)) a.labelsRead.push(cmd.slideId);
      return ok();
    }
    case 'openModel': {
      if (cmd.modelId === null) {
        a.openModel = null;
        a.compareWith = null;
        a.showStudyLabels = false;
        return ok();
      }
      if (!modelById(cmd.modelId)) return no('BAD_MODEL');
      // Modelo incompleto (S33): incidencia sin descuento; el ejercicio deja de exigirse.
      if (a.faultyModel === cmd.modelId) {
        flagB(w, 'asset:incompleteModel');
        incident(w, `model:${cmd.modelId}`);
      }
      a.openModel = cmd.modelId;
      a.views[cmd.modelId] ??= emptyView();
      a.views[cmd.modelId].opened = true;
      flagB(w, `opened:${cmd.modelId}`);
      return ok();
    }
    case 'orientModel':
      return orient(w, cmd);
    case 'setStudyLabels': {
      if (cmd.on && !a.studyAllowed) return no('STUDY_LOCKED');
      a.showStudyLabels = cmd.on;
      return ok();
    }
    case 'labelRegion':
      return labelRegion(w, cmd);
    case 'identifyModel':
      return identify(w, cmd);
    case 'answerBird':
      return answerBird(w, cmd);
    case 'answerSkull':
      return answerSkull(w, cmd);
    case 'compareModels': {
      if (!modelById(cmd.a) || (cmd.b && !modelById(cmd.b))) return no('BAD_MODEL');
      a.openModel = cmd.a;
      a.compareWith = cmd.b;
      a.views[cmd.a] ??= emptyView();
      if (cmd.b) {
        a.views[cmd.b] ??= emptyView();
        a.views[cmd.a].opened = true;
        a.views[cmd.b].opened = true;
        const key = [cmd.a, cmd.b].sort().join('+');
        if (!a.compared.includes(key)) a.compared.push(key);
        flagB(w, `compared:${key}`);
      }
      return ok();
    }
    case 'setTrackLight':
      return trackLight(w, cmd);
    case 'answerTrack':
      return answerTrack(w, cmd);
    case 'requestVideo': {
      // Sin video cargado no se finge el movimiento: incidencia sin descuento.
      flagB(w, 'asset:videoMissing');
      incident(w, `video:${cmd.subject}`);
      return no('VIDEO_UNAVAILABLE');
    }
    case 'reportAsset': {
      if (!a.reportedAssets.includes(cmd.assetId)) a.reportedAssets.push(cmd.assetId);
      incident(w, `${cmd.problem}:${cmd.assetId}`);
      emitB(w, 'ASSET_REPORTED', 'INFO', { obj: cmd.assetId });
      return ok();
    }
  }
}

// ─────────────────────────── Clasificación inicial ───────────────────────────

function classifyMaterial(w: AnimalWorld, cmd: Extract<AnimalOnlyCommand, { type: 'classifyMaterial' }>): AnimalDispatchResult {
  const truth = MATERIALS[cmd.materialId];
  if (!truth) return no('BAD_MATERIAL');
  const classOk = cmd.materialClass === truth.materialClass;
  const instrumentOk = cmd.instrument === truth.instrument;
  if (!instrumentOk) {
    if (truth.instrument === 'viewer' && cmd.instrument === 'microscope') errB(w, TA.MODEL_TO_MICROSCOPE, 'MODEL_TO_MICROSCOPE', 'WARN', { obj: cmd.materialId });
    else if (truth.materialClass === 'slide' && cmd.instrument === 'stereo') errB(w, TA.SLIDE_TO_STEREO, 'SLIDE_TO_STEREO', 'WARN', { obj: cmd.materialId });
    else errB(w, TA.WRONG_INSTRUMENT, 'WRONG_INSTRUMENT', 'WARN', { obj: cmd.materialId });
  }
  if (truth.materialClass === 'track' && cmd.materialClass === 'model') errB(w, TA.TRACK_AS_MODEL, 'TRACK_AS_MODEL', 'WARN', { obj: cmd.materialId });
  w.animal.cards[cmd.materialId] = { materialClass: cmd.materialClass, instrument: cmd.instrument, classOk, instrumentOk };
  return ok({ value: classOk && instrumentOk ? 1 : 0 });
}

export const classifiedOk = (w: AnimalWorld) => Object.values(w.animal.cards).filter((c) => c.classOk && c.instrumentOk).length;
export const classifyEnough = (w: AnimalWorld) => classifiedOk(w) >= Math.ceil(pa(w).classifyMin * Object.keys(MATERIALS).length);

// ─────────────────────────── Orientación ───────────────────────────

function orient(w: AnimalWorld, cmd: Extract<AnimalOnlyCommand, { type: 'orientModel' }>): AnimalDispatchResult {
  if (!modelById(cmd.modelId)) return no('BAD_MODEL');
  const v = (w.animal.views[cmd.modelId] ??= emptyView());
  const yaw = ((cmd.yawDeg % 360) + 360) % 360;
  const pitch = clamp(cmd.pitchDeg, -89, 89);
  const dy = Math.abs(((yaw - v.yawDeg + 540) % 360) - 180);
  const moved = dy + Math.abs(pitch - v.pitchDeg);
  v.yawDeg = r3(yaw);
  v.pitchDeg = r3(pitch);
  v.zoom = r3(clamp(cmd.zoom, 0.6, 3));
  v.rotatedDeg = r3(v.rotatedDeg + moved);
  if (v.rotatedDeg >= pa(w).rotateEvidenceDeg) flagB(w, `rotated:${cmd.modelId}`);
  return ok({ value: v.rotatedDeg });
}

// ─────────────────────────── Rótulos sobre regiones ───────────────────────────

const JAW = new Set<AnatomyPart>(['mandible', 'maxilla', 'premaxilla']);
const APPENDAGES = new Set<AnatomyPart>(['antenna', 'pedipalp', 'chelicera', 'proboscis']);
const LIMBS = new Set<AnatomyPart>(['dorsalFin', 'caudalFin', 'pectoralFin', 'wing', 'forelimb', 'hindlimb', 'leg', 'heterocercalTail']);
const GILLS = new Set<AnatomyPart>(['operculum', 'gillSlit']);
const TEETH = new Set<AnatomyPart>(['incisor', 'canine', 'premolar', 'molar']);

/** Confusión típica entre lo que hay y lo que se escribió → código. Un rótulo errado sin confusión conocida no agrega otro código. */
function confusionCode(truth: AnatomyPart, part: AnatomyPart, modelId: string, taxon: string): string | null {
  const pair = (a: AnatomyPart, b: AnatomyPart) => (truth === a && part === b) || (truth === b && part === a);
  if (pair('incisor', 'canine')) return TA.INCISOR_CANINE;
  if (pair('molar', 'premolar')) return TA.MOLAR_PREMOLAR;
  if (part === 'tusk' && TEETH.has(truth)) return TA.TUSK_ANY_TOOTH;
  if (truth === 'orbit' || part === 'orbit') return TA.ORBIT_LABEL;
  if (JAW.has(truth) && JAW.has(part)) return TA.JAW_LABEL;
  if (truth === 'diastema') return TA.DIASTEMA_MISSED;
  if (truth === 'scolex' || truth === 'proglottid') return TA.SCOLEX_MISSED;
  if (truth === 'clitellum') return TA.CLITELLUM_MISSED;
  if (part === 'segment' && (modelId === 'nematode' || modelId === 'planaria' || modelId === 'fluke')) return TA.SEGMENTS_WRONG;
  if (taxon === 'arachnida' && (part === 'head' || part === 'thorax')) return TA.THREE_TAGMATA;
  if (APPENDAGES.has(truth)) return TA.APPENDAGE_MISSED;
  if (GILLS.has(truth) || GILLS.has(part)) return TA.GILL_LABEL;
  if (LIMBS.has(truth)) return TA.LIMB_MISSED;
  return null;
}

function labelRegion(w: AnimalWorld, cmd: Extract<AnimalOnlyCommand, { type: 'labelRegion' }>): AnimalDispatchResult {
  const a = w.animal;
  const model = modelById(cmd.modelId);
  const region: AnatomyRegion | undefined = model?.regions.find((r) => r.id === cmd.regionId);
  if (!model || !region) return no('BAD_REGION');
  if (a.openModel !== cmd.modelId && a.compareWith !== cmd.modelId) return no('MODEL_CLOSED');
  const v = (a.views[cmd.modelId] ??= emptyView());
  // Región de espaldas: no se puede señalar lo que no se está mirando (TA-WRONG_VIEW).
  if (!regionVisible(region, v.yawDeg, v.pitchDeg)) {
    errB(w, TA.WRONG_VIEW_LABEL, 'WRONG_VIEW_LABEL', 'WARN', { obj: cmd.modelId });
    return no('REGION_HIDDEN');
  }
  const good = region.part === cmd.part;
  if (good) a.wrongStreak[cmd.modelId] = 0;
  else {
    const code = confusionCode(region.part, cmd.part, cmd.modelId, model.taxon);
    if (code) errB(w, code, 'LABEL_CONFUSED', 'WARN', { obj: cmd.modelId });
    a.wrongStreak[cmd.modelId] = (a.wrongStreak[cmd.modelId] ?? 0) + 1;
    if (a.wrongStreak[cmd.modelId] >= pa(w).trialErrorLimit) errB(w, TA.TRIAL_AND_ERROR, 'TRIAL_AND_ERROR', 'WARN', { obj: cmd.modelId });
  }
  const label = { modelId: cmd.modelId, regionId: cmd.regionId, part: cmd.part, ok: good, hidden: false, studyLabels: a.showStudyLabels };
  const prev = a.labels.findIndex((l) => l.modelId === cmd.modelId && l.regionId === cmd.regionId);
  if (prev >= 0) a.labels[prev] = label;
  else a.labels.push(label);
  emitB(w, 'REGION_LABELED', good ? 'INFO' : 'WARN', { obj: cmd.modelId });
  return ok({ value: good ? 1 : 0 });
}

/** Organismo que parece cada modelo. La confusión típica deja su código; la identidad la fija el catálogo. */
const CONFUSIONS: Array<[string, string, keyof typeof TA]> = [
  ['planaria', 'fluke', 'PLANARIA_FLUKE'], ['fluke', 'cestode', 'FLUKE_CESTODE'], ['nematode', 'earthworm', 'NEMATODE_ANNELID'], ['spider', 'scorpion', 'SPIDER_SCORPION'], ['scorpion', 'opilion', 'SCORPION_OPILION'],
  ['boneFish', 'cartFish', 'BONY_CARTILAGINOUS'], ['frog', 'lizard', 'AMPHIBIAN_REPTILE'], ['mammal', 'birdFinch', 'BIRD_MAMMAL_SIZE'],
];
const INSECTS = ['grasshopper', 'butterfly'];
const ARACHNIDS = ['spider', 'scorpion', 'opilion'];

function identify(w: AnimalWorld, cmd: Extract<AnimalOnlyCommand, { type: 'identifyModel' }>): AnimalDispatchResult {
  if (!modelById(cmd.modelId)) return no('BAD_MODEL');
  if (w.animal.openModel !== cmd.modelId && w.animal.compareWith !== cmd.modelId) return no('MODEL_CLOSED');
  const good = cmd.guess === cmd.modelId;
  if (!good) {
    const c = CONFUSIONS.find(([x, y]) => (x === cmd.modelId && y === cmd.guess) || (y === cmd.modelId && x === cmd.guess));
    if (c) errB(w, TA[c[2]], 'MODEL_CONFUSED', 'WARN', { obj: cmd.modelId });
    else if ((INSECTS.includes(cmd.modelId) && ARACHNIDS.includes(cmd.guess)) || (ARACHNIDS.includes(cmd.modelId) && INSECTS.includes(cmd.guess))) errB(w, TA.INSECT_ARACHNID, 'MODEL_CONFUSED', 'WARN', { obj: cmd.modelId });
  }
  w.animal.identified[cmd.modelId] = { guess: cmd.guess, ok: good };
  return ok({ value: good ? 1 : 0 });
}

function answerBird(w: AnimalWorld, cmd: Extract<AnimalOnlyCommand, { type: 'answerBird' }>): AnimalDispatchResult {
  const m = modelById(cmd.modelId);
  if (!m || m.group !== 'bird') return no('BAD_MODEL');
  if (!w.evidence[`opened:${m.id}`]) return no('MODEL_CLOSED');
  // Lo que el modelo no muestra con claridad no se evalúa (§3.6): queda `null`.
  const beakOk = m.beak ? (cmd.beak === null ? null : cmd.beak === m.beak) : null;
  const footOk = m.foot ? (cmd.foot === null ? null : cmd.foot === m.foot) : null;
  if (beakOk === false) errB(w, TA.BEAK_CONFUSED, 'BEAK_CONFUSED', 'WARN', { obj: m.id });
  if (footOk === false) errB(w, TA.FOOT_CONFUSED, 'FOOT_CONFUSED', 'WARN', { obj: m.id });
  w.animal.birds[m.id] = { beak: cmd.beak, foot: cmd.foot, beakOk, footOk };
  return ok();
}

function answerSkull(w: AnimalWorld, cmd: Extract<AnimalOnlyCommand, { type: 'answerSkull' }>): AnimalDispatchResult {
  const m = modelById(cmd.modelId);
  if (!m || m.group !== 'skull') return no('BAD_MODEL');
  if (!w.evidence[`opened:${m.id}`]) return no('MODEL_CLOSED');
  const good = cmd.taxon === m.taxon && (!cmd.diet || cmd.diet === m.diet);
  if (!good && ((m.taxon === 'horse' && cmd.taxon === 'cow') || (m.taxon === 'cow' && cmd.taxon === 'horse'))) errB(w, TA.HORSE_COW, 'HORSE_COW', 'WARN', { obj: m.id });
  w.animal.skulls[m.id] = { taxon: cmd.taxon, diet: cmd.diet, ok: good };
  return ok({ value: good ? 1 : 0 });
}

// ─────────────────────────── Huellas ───────────────────────────

function trackLight(w: AnimalWorld, cmd: Extract<AnimalOnlyCommand, { type: 'setTrackLight' }>): AnimalDispatchResult {
  if (modelById(cmd.trackId)?.group !== 'track') return no('BAD_MODEL');
  const az = clamp(cmd.azimuthDeg, 0, 360);
  const el = clamp(cmd.elevationDeg, 5, 90);
  const l = (w.animal.lights[cmd.trackId] ??= { azimuthDeg: az, elevationDeg: el, minAz: az, maxAz: az });
  l.azimuthDeg = r3(az);
  l.elevationDeg = r3(el);
  l.minAz = Math.min(l.minAz, az);
  l.maxAz = Math.max(l.maxAz, az);
  return ok();
}

/** La luz se movió lo bastante y estuvo rasante: es lo que deja leer el relieve y no solo el color. */
export const sawRelief = (w: AnimalWorld, id: string) => {
  const l = w.animal.lights[id];
  return !!l && l.maxAz - l.minAz >= pa(w).lightSweepDeg && l.elevationDeg <= 55;
};

function answerTrack(w: AnimalWorld, cmd: Extract<AnimalOnlyCommand, { type: 'answerTrack' }>): AnimalDispatchResult {
  const m = modelById(cmd.trackId);
  if (!m?.track) return no('BAD_MODEL');
  if (!w.evidence[`opened:${m.id}`]) return no('MODEL_CLOSED');
  const relief = sawRelief(w, m.id);
  if (!relief) {
    errB(w, TA.TRACK_BY_INTUITION, 'TRACK_BY_INTUITION', 'WARN', { obj: m.id });
    if ((w.animal.lights[m.id]?.elevationDeg ?? 90) > 70) errB(w, TA.RELIEF_AS_COLOR, 'RELIEF_AS_COLOR', 'WARN', { obj: m.id });
  }
  const t = m.track;
  const hoofVsDigit = (t.support === 'unguligrade' && cmd.support === 'digitigrade') || (t.support === 'digitigrade' && cmd.support === 'unguligrade');
  if (hoofVsDigit) errB(w, TA.HOOF_DIGITIGRADE, 'HOOF_DIGITIGRADE', 'WARN', { obj: m.id });
  w.animal.tracks[m.id] = { digits: cmd.digits, support: cmd.support, claws: cmd.claws, digitsOk: cmd.digits === t.digits, supportOk: cmd.support === t.support, clawsOk: cmd.claws === t.claws, sawRelief: relief };
  return ok();
}

// ─────────────────────────── Marcas sobre capturas ───────────────────────────

/** La marca la decide el manifiesto (B06); aquí se traducen los excesos típicos de la histología. */
function mark(w: AnimalWorld, cmd: Extract<DivCommand, { type: 'markRegion' }>): AnimalDispatchResult {
  const r = dispatchDiv(w, cmd);
  if (!r.ok || !r.id) return r;
  const mk = w.div.marks.find((x) => x.id === r.id)!;
  if (mk.verdict === 'valid') return r;
  const s = cmd.structure as string;
  if (s === 'intercalatedDisc') errB(w, TA.DISCS_OVERCLAIM, 'DISCS_OVERCLAIM', 'WARN', { obj: cmd.observationId });
  else if (s === 'nucleolus') errB(w, TA.ORGANELLES_UNRESOLVED, 'ORGANELLES_UNRESOLVED', 'WARN', { obj: cmd.observationId });
  else if (s === 'mesoglea' || s === 'gastrodermis') errB(w, TA.CNIDARIAN_LAYERS, 'CNIDARIAN_LAYERS', 'WARN', { obj: cmd.observationId });
  else errB(w, TA.STRUCTURE_INVENTED, 'STRUCTURE_INVENTED', 'WARN', { obj: cmd.observationId });
  return r;
}

// ─────────────────────────── Cierre ───────────────────────────

export function animalOutstanding(w: AnimalWorld): string[] {
  return [...new Set([...outstanding(w), ...divOutstanding(w)])];
}

function closeBench(w: AnimalWorld): AnimalDispatchResult {
  const a = w.animal;
  // Muestra que pedía el estereoscopio y nunca pasó por él.
  for (const id of a.stereoRequired) {
    const seen = w.observationOrder.some((o) => w.observations[o].instrument === 'stereo' && w.observations[o].specimenId === id && w.observations[o].isObservationValid);
    if (!seen) errB(w, TA.STEREO_NOT_USED, 'STEREO_NOT_USED', 'WARN', { obj: id });
  }
  if (a.faultyModel && w.evidence[`opened:${a.faultyModel}`] && !a.reportedAssets.includes(a.faultyModel)) errB(w, TA.MISSING_ASSET_UNREPORTED, 'MISSING_ASSET_UNREPORTED', 'WARN', { obj: a.faultyModel });
  a.openModel = null;
  a.compareWith = null;
  return dispatchDiv(w, { type: 'closeBench' });
}

// ─────────────────────────── Paso fijo ───────────────────────────

export function stepAnimalWorld(w: AnimalWorld): void {
  stepDivWorld(w);
  // Enfocar la lámina a 4X ya es localizarla (B06-14).
  if (w.view.instrument === 'compound' && w.tick % 4 === 0 && !w.evidence.located4x) {
    const v = microscopeView(w);
    if (v.objectiveX === 4 && v.slideId && v.assetId && v.sharpness01 >= w.params.microscope.sharpnessValid && !v.lightIssues.includes('LIGHT_OFF')) flagB(w, 'located4x');
  }
  // Tejido fresco sin medio: se seca (TA-SAMPLE_DRY).
  const mp = w.params.mount;
  for (const m of Object.values(w.mounts)) {
    const z = m.cell?.zones[0];
    if (z && !z.premade && z.kind === 'muscleFresh' && m.hydrated01 < 0.6 && liquidMl(m) < mp.needMl * 0.5) errB(w, TA.SAMPLE_DRY, 'SAMPLE_DRY', 'WARN', { obj: m.slideId });
  }
}

export function runAnimalFor(w: AnimalWorld, seconds: number): void {
  const n = Math.round(seconds / w.params.dtS);
  for (let i = 0; i < n; i++) stepAnimalWorld(w);
}

// ─────────────────────────── Consultas ───────────────────────────

/** Rótulos correctos hechos sin los nombres de estudio a la vista. */
export const labelsOk = (w: AnimalWorld, modelId: string) => w.animal.labels.filter((l) => l.modelId === modelId && l.ok && !l.studyLabels).length;

/** Modelo acreditado: se giró, se identificó (si aplica) y todas sus regiones quedaron bien rotuladas. Un modelo en falla no se exige. */
export function modelDone(w: AnimalWorld, modelId: string): boolean {
  const m = modelById(modelId);
  if (!m) return false;
  if (w.animal.faultyModel === modelId) return true;
  const rotated = m.group === 'track' || !!w.evidence[`rotated:${modelId}`];
  const identified = m.group === 'invertebrate' || m.group === 'vertebrate' ? !!w.animal.identified[modelId]?.ok : true;
  return rotated && identified && labelsOk(w, modelId) === m.regions.length;
}

export const conservedAnimal = (w: AnimalWorld): Record<string, number> => conservedDiv(w);

export function animalSummary(w: AnimalWorld) {
  return {
    ...divSummary(w),
    labels: w.animal.labels.map((l) => [l.modelId, l.regionId, l.part, l.ok]),
    views: Object.entries(w.animal.views).map(([k, v]) => [k, Math.round(v.rotatedDeg)]),
    tracks: Object.entries(w.animal.tracks).map(([k, v]) => [k, v.digits, v.support, v.claws]),
    birds: Object.entries(w.animal.birds).map(([k, v]) => [k, v.beak, v.foot]),
  };
}

// ─────────────────────────── Creación ───────────────────────────

export type AnimalStateExtras = Pick<AnimalState, 'modules' | 'requiredSlides' | 'requiredModels' | 'requiredTracks' | 'stereoRequired' | 'freshMount' | 'neutralNames' | 'studyAllowed' | 'videoAssigned' | 'faultyModel' | 'assetScope'>;

export function createAnimalWorld(spec: OpticalWorldSpec, cx: CellWorldExtras, dx: DivWorldExtras, x: AnimalStateExtras): AnimalWorld {
  const w = createDivWorld(spec, cx, dx) as AnimalWorld;
  w.animal = {
    ...structuredClone(x), openModel: null, compareWith: null, showStudyLabels: false, views: {}, labels: [], wrongStreak: {}, lights: {}, cards: {}, identified: {}, birds: {}, skulls: {}, tracks: {}, labelsRead: [], compared: [], reportedAssets: [],
  };
  return w;
}
