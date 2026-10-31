/**
 * Rúbrica pura de B09 (§13): 15 % seguridad, 20 % preparaciones y tinción, 20 % óptica y láminas fijas, 15 % raíz y tallo, 15 %
 * hoja y morfología externa, 15 % medidas, interpretación y libreta. Compara contra lo que el estudiante midió y el activo que
 * observó; las respuestas abiertas quedan `ok: null`. Una incidencia de recursos difiere el ítem (`null`), nunca lo tacha.
 */
import { finalizeComponent, item, type Evaluation } from '../../simulation/scoring/types';
import type { PlantWorld } from '../../simulation/plant-world/types';
import { lengthUm } from '../../simulation/plant-world/model';
import { PLANT_ASSET_PLANE } from '../../simulation/specimens/assets';
import { b09StageEvidence } from './evidence';
import { allReturned, externalOk, freshCaptures, observation, ownCaptures, slideObserved, stainDeferred, stereoCaptures, validMarks } from './expected-results';
import { answeredCount, parseNum, type B09Notebook } from './notebook';

export const B09_WEIGHTS = { safety: 0.15, fresh: 0.2, optics: 0.2, rootStem: 0.15, foliar: 0.15, analysis: 0.15 } as const;

const n = (w: PlantWorld, k: string) => w.evidence[k] ?? 0;
const near = (a: number, b: number, rel = 0.02) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= rel * Math.max(1e-9, Math.abs(b));
const filled = (s: string) => (s ?? '').trim() !== '';
const TV = (...xs: number[]) => xs.map((x) => `TV-${String(x).padStart(2, '0')}`);

/** Errores de la libreta (`nb:TV-NN`): lo escrito contrastado con la captura propia, sus metadatos y la medición importada. */
export function notebookIssuesB09(w: PlantWorld, nb: B09Notebook): string[] {
  const out: string[] = [];
  const add = (x: number) => out.push(`nb:${TV(x)[0]}`);
  const assetOf = (id: string | null) => observation(w, id)?.assetId ?? '';
  // Morfología externa: TV-01 raíz, TV-05 venación, TV-08 procedencia. La plántula determina la respuesta.
  for (const r of nb.external) {
    if (!r.specimen) continue;
    const taproot = r.specimen === 'bean';
    if (r.rootPattern && (r.rootPattern === 'taproot') !== taproot) add(1);
    if (r.rootPattern && !w.evidence[`rotated:${r.specimen}`]) add(1);
    if (r.venation && (r.venation === 'reticulate') !== taproot) add(5);
    if (!filled(r.taxon)) add(8);
  }
  // Tinción: rojo ≠ xilema exclusivo ni porcentaje (TV-26); colénquima no se diagnostica por color (TV-27); procedencia (TV-30).
  if (nb.stain.redMeans === 'xylemOnly' || nb.stain.redMeans === 'ligninPercent') add(26);
  if (nb.stain.collenchymaLignified === 'yes') add(27);
  const stainedAsset = /Wiesner/.test(assetOf(nb.stain.observationId));
  if (nb.stain.observationId && nb.stain.treatmentOfCapture && (nb.stain.treatmentOfCapture === 'wiesner') !== stainedAsset) add(30);
  for (const r of nb.sections) {
    if (!r.observationId || !r.treatment) continue;
    if ((r.treatment === 'wiesner') !== /Wiesner/.test(assetOf(r.observationId))) add(30);
  }
  // Atlas: base de la conclusión, plano real, cambium y procedencia.
  const ROOT_ASSET = /^(onionRootTip|rootEudicot|rootMonocot)/;
  const STEM_ASSET = /^stem/;
  const LEAF_ASSET = /^leaf/;
  for (const r of nb.roots) {
    if (!r.group && !r.observationId) continue;
    if (r.basis === 'labelOnly' || (r.group && !r.observationId)) add(44);
    if (r.observationId && !ROOT_ASSET.test(assetOf(r.observationId))) add(52);
    if (r.plane && r.plane !== (PLANT_ASSET_PLANE[assetOf(r.observationId)] ?? 'transverse')) add(47);
    if (r.cambium === 'visible' && !observation(w, r.observationId)?.visibleRegionIds.includes('cambium')) add(46);
    if (r.casparian === 'visible' && !observation(w, r.observationId)?.visibleRegionIds.includes('casparian')) add(61);
  }
  for (const r of nb.stems) {
    if (!r.group && !r.observationId) continue;
    if (r.basis === 'labelOnly' || (r.group && !r.observationId)) add(44);
    if (r.observationId && !STEM_ASSET.test(assetOf(r.observationId))) add(52);
    if (r.xylemSide === 'outer') add(57);
    if (r.cambium === 'visible' && !observation(w, r.observationId)?.visibleRegionIds.includes('cambium')) add(46);
  }
  for (const r of nb.leaves) {
    if (!r.observationId) continue;
    if (!LEAF_ASSET.test(assetOf(r.observationId))) add(52);
    if (!r.orientationChecked) add(48);
    if (r.xylemFace === 'abaxial') add(57);
  }
  // Marca de xilema sobre floema o al revés (TV-57).
  if (w.div.marks.some((m) => m.verdict !== 'valid' && ((m.structure === 'xylem' && m.hit === 'phloem') || (m.structure === 'phloem' && m.hit === 'xylem')))) add(57);
  // Anillos: edad en años sin contexto ambiental (TV-58).
  if (filled(nb.wood.ageYears) && !w.plant.ringsAnnualKnown) add(58);
  // Universalizaciones (TV-59, TV-62).
  if (nb.claims.allMonocotsNoPetiole) add(59);
  if (nb.claims.allParenchymaStarch) add(62);
  // Medidas: campo como célula, píxeles sin convertir, aumento total.
  const oc = w.params.microscope.ocularX;
  for (const r of nb.measures) {
    if (!filled(r.lengthUm) && !filled(r.pixels)) continue;
    if (r.usedFieldAsCell) add(54);
    if (r.unit === 'px' || (filled(r.pixels) && !filled(r.umPerPx))) add(55);
    const o = observation(w, r.observationId);
    if (o?.objectiveX && oc !== 1 && filled(r.totalMag) && parseNum(r.totalMag) === o.objectiveX) add(56);
  }
  return [...new Set(out)];
}

const firstOf = (w: PlantWorld, codes: string[], fallback: string, issues: string[] = []) => {
  const c = codes.find((k) => n(w, `err:${k}`) > 0 || issues.includes(`nb:${k}`));
  return c ? `b09fb.${c}` : `b09fb.${fallback}`;
};

export function evaluateB09(w: PlantWorld, nb: B09Notebook): Evaluation {
  const flags = b09StageEvidence(w, nb);
  const issues = notebookIssuesB09(w, nb);
  const has = (...xs: number[]) => TV(...xs).some((k) => issues.includes(`nb:${k}`));
  const errs = (...xs: number[]) => TV(...xs).reduce((s, k) => s + n(w, `err:${k}`), 0);

  // ── Seguridad y cuidado (15) ──
  let safety = [
    item('b09.ppe', flags.ppe && errs(63) === 0 ? true : flags.ppe ? null : false, 3, firstOf(w, TV(63), 'ppe'), undefined, 0.5),
    item('b09.sharps', errs(65, 66, 67) === 0 && w.shards === 0, 3, firstOf(w, TV(65, 66, 67), 'sharps')),
    item('b09.corrosive', errs(64, 69) === 0, 3, firstOf(w, TV(64, 69), 'corrosive')),
    item('b09.equipment', errs(34, 35, 68, 70) === 0, 3, firstOf(w, TV(34, 35, 70, 68), 'equipment')),
    item('b09.closure', flags.safeParked && flags.benchRestored && errs(50, 71, 72) === 0, 3, firstOf(w, TV(50, 71, 72), 'closure')),
  ];
  if (w.safety.incident) safety = safety.map((i) => ({ ...i, ok: false, points: 0, feedbackKey: 'b09fb.incident' }));

  // ── Preparaciones frescas y tinción (20) ──
  const viable = w.plant.sections.filter((s) => s.integrity01 >= w.params.plant!.minSectionIntegrity && s.regionOk && s.actualPlane !== 'oblique' && s.slideId).length;
  const fc = freshCaptures(w);
  const deferred = stainDeferred(w);
  const fresh = [
    item('b09.cuts', viable >= 2 && errs(9, 10, 11, 12, 13, 14) === 0, 6, firstOf(w, TV(14, 9, 12, 10, 11, 13), 'cuts'), { n: viable }, viable >= 1 ? 0.5 : 0),
    item('b09.mounts', fc.length >= 2 && errs(15, 16, 17, 18, 19, 20) === 0, 5, firstOf(w, TV(19, 20, 18, 16, 17, 15), 'mounts'), { n: fc.length }, fc.length >= 1 ? 0.5 : 0),
    item('b09.stain', deferred ? null : !!w.evidence['stain:documented'] && errs(22, 23, 24, 25, 28, 29) === 0, 6, deferred ? 'b09fb.deferred' : firstOf(w, TV(22, 25, 23, 24, 28, 29), 'stain')),
    item('b09.control', deferred ? null : fc.some((o) => /^(celery|pearSection)/.test(o.assetId)) && fc.some((o) => /Wiesner/.test(o.assetId)), 3, deferred ? 'b09fb.deferred' : 'b09fb.control'),
  ];

  // ── Manejo óptico y láminas fijas (20) ──
  const req = w.plant.requiredSlides;
  const seen = req.filter((id) => slideObserved(w, id)).length;
  const objectives = new Set(ownCaptures(w).map((o) => o.objectiveX));
  const optics = [
    item('b09.slidesSeen', seen === req.length, 6, 'b09fb.slidesSeen', { n: seen }, Math.min(1, seen / req.length) * 0.7),
    item('b09.clip', !!w.evidence.slideClamped && errs(31, 32, 41, 42) === 0, 3, firstOf(w, TV(31, 32, 41, 42), 'clip')),
    item('b09.objectives', objectives.has(4) && objectives.has(10) && objectives.has(40) && errs(33, 39) === 0, 4, firstOf(w, TV(33, 39), 'objectives')),
    item('b09.focusLight', ownCaptures(w).length > 0 && errs(36, 37, 38) === 0, 3, firstOf(w, TV(36, 37, 38), 'focusLight')),
    item('b09.returned', allReturned(w) && errs(21, 43, 49, 51) === 0, 4, firstOf(w, TV(21, 49, 43, 51), 'returned')),
  ];

  // ── Anatomía de raíz y tallo (15) ──
  const obsOf = (id: string) => ownCaptures(w, id);
  const rootRows = nb.roots.filter((r) => r.observationId && observation(w, r.observationId)?.isObservationValid && r.group).length;
  const stemRows = nb.stems.filter((r) => r.observationId && observation(w, r.observationId)?.isObservationValid && r.group && r.bundles).length;
  const stemPatternOk = nb.stems.every((r) => {
    if (!r.observationId || !r.bundles) return true;
    const a = observation(w, r.observationId)?.assetId ?? '';
    return a.startsWith('stemEudicot') ? r.bundles === 'ring' && r.group === 'eudicot' : a === 'stemMonocot' ? r.bundles === 'scattered' && r.group === 'monocot' : true;
  });
  const rootOk = validMarks(w, 'rootCap', 'fxRT').length > 0 && validMarks(w, 'stele', 'fxRE').length > 0 && validMarks(w, 'xylem', 'fxRM').length > 0;
  const stemOk = validMarks(w, 'vascularBundle', 'fxSE').length > 0 && validMarks(w, 'vascularBundle', 'fxSM').length > 0;
  const rootStem = [
    item('b09.rootMarks', rootOk && errs(45, 46, 61) === 0, 5, firstOf(w, TV(45, 46, 61), 'rootMarks')),
    item('b09.stemMarks', stemOk && errs(60) === 0 && obsOf('fxSE').length > 0, 4, firstOf(w, TV(60), 'stemMarks')),
    item('b09.atlas', rootRows >= 2 && stemRows >= 2 && stemPatternOk && !has(44, 46, 47, 52, 57), 6, firstOf(w, TV(44, 47, 52, 57, 46), 'atlas', issues), { n: rootRows + stemRows }),
  ];

  // ── Hoja y morfología externa (15) ──
  const ext = externalOk(w, 'bean') + externalOk(w, 'maize');
  const leafRows = nb.leaves.filter((r) => observation(w, r.observationId)?.isObservationValid && r.group && r.mesophyll).length;
  const stereoNeeded = w.plant.stereoRequired;
  const foliar = [
    item('b09.external', flags.external && errs(2, 3, 4) === 0 && !has(1, 8), 5, firstOf(w, TV(2, 3, 4, 1, 8), 'external', issues), { n: ext }, Math.min(1, ext / 12) * 0.6),
    item('b09.venation', (!stereoNeeded || stereoCaptures(w).length >= 2) && nb.external.filter((r) => r.venation).length >= 2 && !has(5) && errs(6, 7) === 0, 3, firstOf(w, TV(6, 7, 5), 'venation', issues)),
    item('b09.leafMarks', validMarks(w, 'palisade', 'fxLE').length > 0 && validMarks(w, 'vascularBundle', 'fxLM').length > 0, 3, 'b09fb.leafMarks'),
    item('b09.leafAtlas', leafRows >= 2 && !has(48), 4, firstOf(w, TV(48), 'leafAtlas', issues), { n: leafRows }),
  ];

  // ── Mediciones, interpretación y libreta (15) ──
  const noScale = !w.div.scale.available;
  const oc = w.params.microscope.ocularX;
  const linked = nb.measures.filter((r) => r.measurementId && w.div.measurements.some((m) => m.id === r.measurementId));
  // Con los datos del propio estudiante: su medición, su escala y su incertidumbre.
  const measureOk = linked.some((r) => {
    const m = w.div.measurements.find((x) => x.id === r.measurementId)!;
    const calc = lengthUm(parseNum(r.pixels), parseNum(r.umPerPx));
    return r.unit === 'um' && near(calc, parseNum(r.lengthUm)) && near(parseNum(r.lengthUm), m.lengthUm) && parseNum(r.uncertaintyUm) > 0 && near(parseNum(r.uncertaintyUm), m.uncertaintyUm, 0.1);
  });
  const magOk = nb.measures.some((r) => {
    const o = observation(w, r.observationId);
    return !!o?.objectiveX && parseNum(r.totalMag) === oc * o.objectiveX;
  });
  const matrixOk = nb.matrix.filter((r) => r.organ && r.system && observation(w, r.evidenceObservationId)?.isObservationValid && filled(r.observation)).length;
  const k = answeredCount(nb);
  const analysis = [
    item('b09.measure', noScale ? null : measureOk && !has(54, 55), 4, noScale ? 'b09fb.noScale' : firstOf(w, TV(54, 55), 'measure', issues)),
    item('b09.magnification', magOk && !has(56), 2, has(56) ? 'b09fb.TV-56' : 'b09fb.magnification'),
    item('b09.interpretation', nb.stain.redMeans === 'lignifiedWall' && !has(26, 27, 30, 58, 59, 62), 3, firstOf(w, TV(26, 27, 30, 58, 59, 62), 'interpretation', issues)),
    item('b09.matrix', matrixOk >= 3, 2, 'b09fb.matrix', { n: matrixOk }),
    item('b09.answers', k >= 5 ? null : false, 4, 'b09fb.answers', { n: k }, Math.min(1, k / 8) * 0.6),
  ];

  const components = [
    finalizeComponent('safety', B09_WEIGHTS.safety, safety),
    finalizeComponent('fresh', B09_WEIGHTS.fresh, fresh),
    finalizeComponent('optics', B09_WEIGHTS.optics, optics),
    finalizeComponent('rootStem', B09_WEIGHTS.rootStem, rootStem),
    finalizeComponent('foliar', B09_WEIGHTS.foliar, foliar),
    finalizeComponent('analysis', B09_WEIGHTS.analysis, analysis),
  ];
  const total = components.reduce((s, c) => s + c.weight * c.score, 0);
  const needsTeacherReview = components.flatMap((c) => c.items.filter((i) => i.ok === null).map((i) => i.key));
  return { components, total, needsTeacherReview };
}
