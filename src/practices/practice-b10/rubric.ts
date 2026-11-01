/**
 * Rúbrica pura de B10 (§13): 15 % instrumentos, 15 % tejidos, 20 % invertebrados y estadios, 15 % zoología y vertebrados 3D, 10 % picos y
 * patas, 15 % cráneos, dentición y huellas, 15 % libreta y análisis. Compara contra lo que el estudiante observó y el activo que tenía
 * delante. Lo no asignado no se evalúa y las incidencias de recursos nunca tachan un ítem; las respuestas abiertas quedan
 * para el docente.
 */
import { finalizeComponent, item, type Evaluation } from '../../simulation/scoring/types';
import type { AnimalWorld } from '../../simulation/animal-world/types';
import { TA, type TaName } from '../../simulation/animal-world/codes';
import { classifiedOk, classifyEnough, modelDone } from '../../simulation/animal-world/world';
import { b10StageEvidence } from './evidence';
import { ORGANISM_OF_ASSET, SMALL_OF_ASSET, TISSUE_OF_ASSET, allReturned, birdDone, hasModule, modelsAssigned, modelsDoneOf, observation, ownCaptures, skullDone, slideObserved, stereoCaptures, trackDone, validMarks } from './expected-results';
import { answeredCount, parseNum, type B10Notebook } from './notebook';

export const B10_WEIGHTS = { instruments: 0.15, tissues: 0.15, invertebrates: 0.2, zoology: 0.15, birds: 0.1, skulls: 0.15, notebook: 0.15 } as const;

const n = (w: AnimalWorld, k: string) => w.evidence[k] ?? 0;
const filled = (s: string) => (s ?? '').trim() !== '';

/** Errores de la libreta (`nb:TA-NN`): lo escrito contrastado con la captura propia y sus metadatos. */
export function notebookIssuesB10(w: AnimalWorld, nb: B10Notebook): string[] {
  const out: string[] = [];
  const add = (x: TaName) => out.push(`nb:${TA[x]}`);
  const assetOf = (id: string | null) => observation(w, id)?.assetId ?? '';
  const oc = w.params.microscope.ocularX;
  const confuse = (truth: string, guess: string) => {
    if (!guess || guess === truth) return;
    const pair = (a: string, b: string) => (truth === a && guess === b) || (truth === b && guess === a);
    if (truth === 'cardiac' && guess === 'skeletal') add('CARDIAC_AS_SKELETAL');
    if (pair('skeletal', 'smooth')) add('SKELETAL_AS_SMOOTH');
    if (pair('epithelial', 'connective')) add('EPITHELIUM_AS_CONNECTIVE');
    if (truth === 'nervous' && ['skeletal', 'cardiac', 'smooth'].includes(guess)) add('NERVE_AS_MUSCLE');
  };
  for (const r of nb.tissues) {
    if (!r.observationId && !r.tissue) continue;
    // Sin captura propia la respuesta salió de la miniatura o de la caja.
    if (r.tissue && !observation(w, r.observationId)?.isObservationValid) add('THUMBNAIL_ANSWER');
    const asset = assetOf(r.observationId);
    if (r.observationId) {
      const truth = TISSUE_OF_ASSET[asset];
      if (truth) confuse(truth, r.tissue);
      // La captura importada es de otra cosa que la fila dice describir.
      else if (r.tissue) add('MIXED_OBSERVATIONS');
    }
    if (r.level === 'organism' && TISSUE_OF_ASSET[asset]) add('TISSUE_AS_ORGANISM');
    if (r.functionText.trim() && r.basis === 'memory') add('FUNCTION_UNSUPPORTED');
    const o = observation(w, r.observationId);
    if (o?.objectiveX && filled(r.totalMag) && parseNum(r.totalMag) !== oc * o.objectiveX) add('MAG_CONFUSED');
  }
  const m = nb.muscle;
  const skAsset = assetOf(m.skeletalObservationId);
  const caAsset = assetOf(m.cardiacObservationId);
  if (m.skeletalObservationId && TISSUE_OF_ASSET[skAsset]) confuse(TISSUE_OF_ASSET[skAsset], m.skeletalGuess);
  if (m.cardiacObservationId && TISSUE_OF_ASSET[caAsset]) confuse(TISSUE_OF_ASSET[caAsset], m.cardiacGuess);
  // Discos o núcleos afirmados sobre una captura que no los resuelve (§3.8).
  if (m.cardiacDiscs === 'visible' && !observation(w, m.cardiacObservationId)?.visibleRegionIds.includes('intercalatedDisc')) add('DISCS_OVERCLAIM');
  if (m.skeletalNuclei === 'multi' && !observation(w, m.skeletalObservationId)?.visibleRegionIds.includes('nucleus')) add('NUCLEI_OVERCLAIM');
  if (m.prepQuality === 'ignored') add('BAD_PREP_IGNORED');
  for (const r of nb.inverts) {
    if (!r.organism) continue;
    if (!observation(w, r.observationId)?.isObservationValid) add('THUMBNAIL_ANSWER');
    const truth = ORGANISM_OF_ASSET[assetOf(r.observationId)];
    if (truth && truth !== r.organism) {
      if ((truth === 'coral' && r.organism === 'medusa') || (truth === 'medusa' && r.organism === 'coral')) add('CORAL_AS_MEDUSA');
      else add('MIXED_OBSERVATIONS');
    }
    if (r.organism === 'sponge' && r.organization === 'trueTissues') add('SPONGE_TRUE_TISSUES');
    if ((r.organism === 'coral' || r.organism === 'medusa') && r.symmetry === 'bilateral') add('SYMMETRY_CONFUSED');
    if (['planaria', 'fluke', 'nematode', 'earthworm', 'cestode'].includes(r.organism) && r.symmetry === 'radial') add('SYMMETRY_CONFUSED');
    if (r.organism === 'medusa' && r.form === 'polyp') add('POLYP_MEDUSA');
    if (r.organism === 'coral' && r.form === 'medusa') add('COLONY_AS_MEDUSA');
    if ((r.organism === 'nematode' || r.organism === 'planaria' || r.organism === 'fluke') && r.segmented === 'yes') add('SAME_ORGANIZATION');
  }
  if (nb.claims.allGroupsSameOrganization) add('SAME_ORGANIZATION');
  if (nb.claims.allSpongesTrueTissues) add('SPONGE_TRUE_TISSUES');
  for (const r of nb.small) {
    if (!r.organism) continue;
    const truth = SMALL_OF_ASSET[assetOf(r.observationId)];
    if (truth && truth !== r.organism) add('DAPHNIA_LOUSE');
    // Una imagen fija no muestra movimiento.
    if (r.motion === 'observed') add('MOTION_FROM_STILL');
  }
  // La comparación era parte del ejercicio y quedó sin hacer.
  if (hasModule(w, 'zoology') && modelsAssigned(w, 'invertebrate').length + modelsAssigned(w, 'vertebrate').length >= 2 && w.evidence.benchRestored && !nb.zoo.some((r) => r.comparedWith && filled(r.difference))) add('NO_COMPARISON');
  // Mesa cerrada con trabajo del visor pero sin nada de eso en la libreta.
  if (w.evidence.benchRestored && w.animal.labels.length > 0 && !nb.zoo.some((r) => r.modelId) && !nb.trackRows.some((r) => r.trackId) && !filled(nb.skull.horseTrait)) add('CLOSED_UNSAVED');
  if (w.evidence.benchRestored && !nb.atlas.delivered) add('NO_ATLAS');
  return [...new Set(out)];
}

const firstOf = (w: AnimalWorld, names: TaName[], fallback: string, issues: string[] = []) => {
  const c = names.map((x) => TA[x]).find((k) => n(w, `err:${k}`) > 0 || issues.includes(`nb:${k}`));
  return c ? `b10fb.${c}` : `b10fb.${fallback}`;
};

export function evaluateB10(w: AnimalWorld, nb: B10Notebook): Evaluation {
  const flags = b10StageEvidence(w, nb);
  const issues = notebookIssuesB10(w, nb);
  const has = (...xs: TaName[]) => xs.some((x) => issues.includes(`nb:${TA[x]}`));
  const errs = (...xs: TaName[]) => xs.reduce((s, x) => s + n(w, `err:${TA[x]}`), 0);
  // Lo no asignado no se evalúa ni reparte puntos: el ítem desaparece (§10).
  const gated = (assigned: boolean, ...a: Parameters<typeof item>) => (assigned ? [item(...a)] : []);

  // ── Uso de instrumentos (15) ──
  const req = w.animal.requiredSlides;
  const seen = req.filter((id) => slideObserved(w, id)).length;
  const needsScope = req.length > 0;
  const needsStereo = w.animal.stereoRequired.length > 0;
  let instruments = [
    item('b10.classify', classifyEnough(w) && errs('WRONG_INSTRUMENT', 'MODEL_TO_MICROSCOPE', 'SLIDE_TO_STEREO', 'TRACK_AS_MODEL') === 0, 3, firstOf(w, ['MODEL_TO_MICROSCOPE', 'SLIDE_TO_STEREO', 'TRACK_AS_MODEL', 'WRONG_INSTRUMENT'], 'classify'), { n: classifiedOk(w) }, classifyEnough(w) ? 0.5 : 0),
    gated(needsScope, 'b10.scope', seen === req.length && errs('START_40X', 'SLIDE_BADLY_SEATED', 'SLIDE_UNCLAMPED', 'OFF_CENTER', 'CHANGE_UNCENTERED', 'LABEL_UNREAD', 'WRONG_SLIDE') === 0, 3, firstOf(w, ['WRONG_SLIDE', 'LABEL_UNREAD', 'START_40X', 'SLIDE_BADLY_SEATED', 'SLIDE_UNCLAMPED', 'OFF_CENTER', 'CHANGE_UNCENTERED'], 'scope'), { n: seen }, needsScope ? Math.min(1, seen / req.length) * 0.7 : 0),
    gated(needsScope, 'b10.focusLight', ownCaptures(w).length > 0 && errs('BLURRY_CONCLUSION', 'LIGHT_OFF', 'LIGHT_LOW', 'LIGHT_EXCESS') === 0, 3, firstOf(w, ['BLURRY_CONCLUSION', 'LIGHT_OFF', 'LIGHT_LOW', 'LIGHT_EXCESS'], 'focusLight')),
    gated(needsStereo, 'b10.stereo', w.animal.stereoRequired.every((id) => stereoCaptures(w, id).length > 0) && errs('STEREO_SAMPLE_MISPLACED', 'STEREO_LIGHT', 'STEREO_ZOOM_FIRST', 'STEREO_UNFOCUSED', 'STEREO_OUT_OF_FIELD', 'STEREO_NOT_USED') === 0, 3, firstOf(w, ['STEREO_NOT_USED', 'STEREO_SAMPLE_MISPLACED', 'STEREO_LIGHT', 'STEREO_ZOOM_FIRST', 'STEREO_UNFOCUSED', 'STEREO_OUT_OF_FIELD'], 'stereo')),
    item('b10.care', errs('COLLISION', 'COARSE_HIGH', 'REMOVE_UNSAFE', 'BAD_SHUTDOWN', 'WRONG_SLOT', 'FIXED_AS_FRESH', 'COVER_BROKEN', 'OIL_NOT_CLEANED', 'STEREO_NOT_CLEARED') === 0 && flags.safeParked && flags.benchRestored && allReturned(w), 3, firstOf(w, ['COLLISION', 'COARSE_HIGH', 'REMOVE_UNSAFE', 'FIXED_AS_FRESH', 'COVER_BROKEN', 'WRONG_SLOT', 'OIL_NOT_CLEANED', 'BAD_SHUTDOWN', 'STEREO_NOT_CLEARED'], 'care')),
  ].flat();
  if (w.safety.incident) instruments = instruments.map((i) => ({ ...i, ok: false, points: 0, feedbackKey: 'b10fb.incident' }));

  // ── Tejidos animales (15) ──
  const hist = hasModule(w, 'histology');
  const musc = hasModule(w, 'muscle');
  const tissueRows = nb.tissues.filter((r) => observation(w, r.observationId)?.isObservationValid && r.tissue && TISSUE_OF_ASSET[observation(w, r.observationId)!.assetId] === r.tissue).length;
  const tissueNeed = req.filter((id) => ['fxEP', 'fxCT', 'fxNE'].includes(id)).length;
  const sk = observation(w, nb.muscle.skeletalObservationId);
  const ca = observation(w, nb.muscle.cardiacObservationId);
  const muscleOk = TISSUE_OF_ASSET[sk?.assetId ?? ''] === 'skeletal' && TISSUE_OF_ASSET[ca?.assetId ?? ''] === 'cardiac' && nb.muscle.skeletalGuess === 'skeletal' && nb.muscle.cardiacGuess === 'cardiac';
  const tissues = [
    gated(hist, 'b10.tissueTable', tissueRows >= tissueNeed && !has('EPITHELIUM_AS_CONNECTIVE', 'NERVE_AS_MUSCLE', 'TISSUE_AS_ORGANISM', 'THUMBNAIL_ANSWER'), 5, firstOf(w, ['EPITHELIUM_AS_CONNECTIVE', 'NERVE_AS_MUSCLE', 'TISSUE_AS_ORGANISM', 'THUMBNAIL_ANSWER'], 'tissueTable', issues), { n: tissueRows }, tissueNeed ? Math.min(1, tissueRows / tissueNeed) * 0.6 : 0),
    gated(musc, 'b10.muscle', muscleOk && !has('CARDIAC_AS_SKELETAL', 'SKELETAL_AS_SMOOTH'), 5, firstOf(w, ['CARDIAC_AS_SKELETAL', 'SKELETAL_AS_SMOOTH'], 'muscle', issues)),
    gated(hist || musc, 'b10.noInvention', errs('DISCS_OVERCLAIM', 'ORGANELLES_UNRESOLVED') === 0 && !has('DISCS_OVERCLAIM', 'NUCLEI_OVERCLAIM', 'FUNCTION_UNSUPPORTED', 'BAD_PREP_IGNORED', 'MIXED_OBSERVATIONS'), 3, firstOf(w, ['DISCS_OVERCLAIM', 'NUCLEI_OVERCLAIM', 'ORGANELLES_UNRESOLVED', 'FUNCTION_UNSUPPORTED', 'BAD_PREP_IGNORED', 'MIXED_OBSERVATIONS'], 'noInvention', issues)),
    gated(musc, 'b10.tissueMarks', validMarks(w, 'striations', 'fxSK').length > 0 || validMarks(w, 'striations', 'fxCA').length > 0, 2, 'b10fb.tissueMarks'),
  ].flat();

  // ── Invertebrados y estadios (20) ──
  const inv = hasModule(w, 'invertebrates');
  const small = hasModule(w, 'small');
  const invertSlides = req.filter((id) => ['fxSP', 'fxCO', 'fxME', 'fxPL', 'fxFL', 'fxNM', 'fxCE', 'fxEW'].includes(id));
  const invRows = nb.inverts.filter((r) => r.organism && observation(w, r.observationId)?.isObservationValid && ORGANISM_OF_ASSET[observation(w, r.observationId)!.assetId] === r.organism).length;
  const smallRows = nb.small.filter((r) => r.organism && (observation(w, r.observationId)?.isObservationValid)).length;
  const scolexOk = !req.includes('fxCE') || validMarks(w, 'scolexS', 'fxCE').length > 0;
  const flukeOk = !req.includes('fxFL') || validMarks(w, 'oralSuckerS', 'fxFL').length > 0;
  const invertebrates = [
    gated(inv, 'b10.invertSlides', invertSlides.every((id) => slideObserved(w, id)), 5, 'b10fb.invertSlides'),
    gated(inv, 'b10.invertTable', invRows >= Math.min(invertSlides.length, 4) && !has('SPONGE_TRUE_TISSUES', 'CORAL_AS_MEDUSA', 'SYMMETRY_CONFUSED', 'POLYP_MEDUSA', 'COLONY_AS_MEDUSA', 'SAME_ORGANIZATION'), 6, firstOf(w, ['SPONGE_TRUE_TISSUES', 'CORAL_AS_MEDUSA', 'SYMMETRY_CONFUSED', 'POLYP_MEDUSA', 'COLONY_AS_MEDUSA', 'SAME_ORGANIZATION'], 'invertTable', issues), { n: invRows }, Math.min(1, invRows / 4) * 0.6),
    gated(inv, 'b10.invertMarks', scolexOk && flukeOk && errs('STRUCTURE_INVENTED', 'CNIDARIAN_LAYERS') === 0, 4, firstOf(w, ['STRUCTURE_INVENTED', 'CNIDARIAN_LAYERS'], 'invertMarks')),
    gated(small, 'b10.small', smallRows >= Math.min(1, w.animal.stereoRequired.length) && !has('DAPHNIA_LOUSE', 'MOTION_FROM_STILL'), 5, firstOf(w, ['DAPHNIA_LOUSE', 'MOTION_FROM_STILL'], 'small', issues)),
  ].flat();

  // ── Zoología comparada y vertebrados 3D (15) ──
  const zooMod = hasModule(w, 'zoology');
  const invIds = modelsAssigned(w, 'invertebrate');
  const verIds = modelsAssigned(w, 'vertebrate');
  const zooDone = modelsDoneOf(w, [...invIds, ...verIds]).length;
  const zooTotal = invIds.length + verIds.length;
  const anyCompared = w.animal.compared.length > 0;
  const zoology = [
    gated(zooMod, 'b10.models', zooDone === zooTotal && errs('WRONG_VIEW_LABEL', 'TRIAL_AND_ERROR') === 0, 7, firstOf(w, ['WRONG_VIEW_LABEL', 'TRIAL_AND_ERROR'], 'models'), { n: zooDone }, zooTotal ? Math.min(1, zooDone / zooTotal) * 0.7 : 0),
    gated(zooMod, 'b10.confusions', errs('PLANARIA_FLUKE', 'FLUKE_CESTODE', 'NEMATODE_ANNELID', 'INSECT_ARACHNID', 'SPIDER_SCORPION', 'SCORPION_OPILION', 'BONY_CARTILAGINOUS', 'AMPHIBIAN_REPTILE', 'BIRD_MAMMAL_SIZE', 'APPENDAGE_MISSED', 'THREE_TAGMATA', 'LIMB_MISSED', 'GILL_LABEL', 'SCOLEX_MISSED', 'CLITELLUM_MISSED', 'SEGMENTS_WRONG') === 0, 4, firstOf(w, ['PLANARIA_FLUKE', 'FLUKE_CESTODE', 'NEMATODE_ANNELID', 'INSECT_ARACHNID', 'SPIDER_SCORPION', 'SCORPION_OPILION', 'BONY_CARTILAGINOUS', 'AMPHIBIAN_REPTILE', 'BIRD_MAMMAL_SIZE', 'APPENDAGE_MISSED', 'THREE_TAGMATA', 'LIMB_MISSED', 'GILL_LABEL', 'SCOLEX_MISSED', 'CLITELLUM_MISSED', 'SEGMENTS_WRONG'], 'confusions')),
    gated(zooMod && zooTotal >= 2, 'b10.compare', anyCompared && !has('NO_COMPARISON'), 4, has('NO_COMPARISON') ? `b10fb.${TA.NO_COMPARISON}` : 'b10fb.compare'),
  ].flat();

  // ── Picos y patas (10) ──
  const birdMod = hasModule(w, 'birds');
  const birdIds = modelsAssigned(w, 'bird');
  const birdsOk = birdIds.filter((id) => birdDone(w, id)).length;
  const birdLabels = modelsDoneOf(w, birdIds).length;
  const birds = [
    gated(birdMod, 'b10.birdTypes', birdsOk === birdIds.length && errs('BEAK_CONFUSED', 'FOOT_CONFUSED') === 0, 6, firstOf(w, ['BEAK_CONFUSED', 'FOOT_CONFUSED'], 'birdTypes'), { n: birdsOk }, birdIds.length ? Math.min(1, birdsOk / birdIds.length) * 0.7 : 0),
    gated(birdMod, 'b10.birdParts', birdLabels === birdIds.length, 2, 'b10fb.birdParts', { n: birdLabels }, birdIds.length ? birdLabels / birdIds.length : 0),
    gated(birdMod, 'b10.birdFunction', nb.birdsFunction.trim().length > 15, 2, 'b10fb.birdFunction'),
  ].flat();

  // ── Cráneos, dentición y huellas (15) ──
  const skullMod = hasModule(w, 'skulls');
  const trackMod = hasModule(w, 'tracks');
  const skullIds = modelsAssigned(w, 'skull');
  const skullsOk = skullIds.filter((id) => skullDone(w, id)).length;
  const tracksOk = w.animal.requiredTracks.filter((id) => trackDone(w, id)).length;
  const needBoth = skullIds.includes('skullHorse') && skullIds.includes('skullCow');
  const skulls = [
    gated(skullMod, 'b10.skulls', skullsOk === skullIds.length && errs('HORSE_COW', 'ORBIT_LABEL', 'JAW_LABEL', 'WRONG_VIEW_LABEL') === 0, 5, firstOf(w, ['HORSE_COW', 'ORBIT_LABEL', 'JAW_LABEL', 'WRONG_VIEW_LABEL'], 'skulls'), { n: skullsOk }, skullIds.length ? Math.min(1, skullsOk / skullIds.length) * 0.7 : 0),
    gated(skullMod, 'b10.teeth', skullIds.every((id) => modelDone(w, id)) && errs('INCISOR_CANINE', 'MOLAR_PREMOLAR', 'TUSK_ANY_TOOTH', 'DIASTEMA_MISSED') === 0, 3, firstOf(w, ['INCISOR_CANINE', 'MOLAR_PREMOLAR', 'TUSK_ANY_TOOTH', 'DIASTEMA_MISSED'], 'teeth')),
    gated(needBoth, 'b10.horseCow', filled(nb.skull.horseTrait) && filled(nb.skull.cowTrait) && w.animal.compared.includes('skullCow+skullHorse'), 2, 'b10fb.horseCow'),
    gated(trackMod, 'b10.tracks', tracksOk === w.animal.requiredTracks.length && errs('TRACK_BY_INTUITION', 'HOOF_DIGITIGRADE', 'RELIEF_AS_COLOR') === 0, 5, firstOf(w, ['TRACK_BY_INTUITION', 'HOOF_DIGITIGRADE', 'RELIEF_AS_COLOR'], 'tracks'), { n: tracksOk }, w.animal.requiredTracks.length ? Math.min(1, tracksOk / w.animal.requiredTracks.length) * 0.7 : 0),
  ].flat();

  // ── Libreta, atlas y análisis (15) ──
  const k = answeredCount(nb);
  const notebook = [
    item('b10.prereport', filled(nb.prereport.hypothesis) && filled(nb.prereport.instruments), 2, 'b10fb.prereport'),
    item('b10.atlas', nb.atlas.delivered && nb.atlas.conclusions.trim().length > 25 && !has('NO_ATLAS', 'CLOSED_UNSAVED'), 4, firstOf(w, ['NO_ATLAS', 'CLOSED_UNSAVED'], 'atlas', issues)),
    item('b10.traceable', errs('WRONG_CAPTURE', 'MISSING_ASSET_UNREPORTED') === 0 && !has('MAG_CONFUSED', 'MIXED_OBSERVATIONS'), 3, firstOf(w, ['WRONG_CAPTURE', 'MISSING_ASSET_UNREPORTED', 'MAG_CONFUSED', 'MIXED_OBSERVATIONS'], 'traceable', issues)),
    item('b10.answers', k >= 5 ? null : false, 6, 'b10fb.answers', { n: k }, Math.min(1, k / 8) * 0.6),
  ];

  const components = [
    finalizeComponent('instruments', B10_WEIGHTS.instruments, instruments),
    finalizeComponent('tissues', B10_WEIGHTS.tissues, tissues),
    finalizeComponent('invertebrates', B10_WEIGHTS.invertebrates, invertebrates),
    finalizeComponent('zoology', B10_WEIGHTS.zoology, zoology),
    finalizeComponent('birds', B10_WEIGHTS.birds, birds),
    finalizeComponent('skulls', B10_WEIGHTS.skulls, skulls),
    finalizeComponent('notebook', B10_WEIGHTS.notebook, notebook),
  ];
  // Un componente sin ítems asignados no cuenta: su peso se reparte entre los demás (§10).
  const activeWeight = components.reduce((s, c) => s + (c.items.length ? c.weight : 0), 0) || 1;
  const total = components.reduce((s, c) => s + (c.items.length ? (c.weight * c.score) / activeWeight : 0), 0);
  const needsTeacherReview = components.flatMap((c) => c.items.filter((i) => i.ok === null).map((i) => i.key));
  return { components, total, needsTeacherReview };
}
