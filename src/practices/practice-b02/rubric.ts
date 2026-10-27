/**
 * Rúbrica pura de B02 (§13): 15 % seguridad, 25 % preparaciones y reactivos, 20 % microscopio, 15 % plastidios,
 * 10 % contraste animal–vegetal, 10 % libreta, 5 % cierre. Usa los hechos del intento y las capturas propias; las
 * respuestas abiertas quedan `ok: null`. Las rutas opcionales (láminas fijas, estereoscopio) solo agregan ítems si
 * el docente las activó. Un recurso faltante (CEL68) difiere los ítems afectados (`null`), nunca los tacha.
 */
import { finalizeComponent, item, type Evaluation } from '../../simulation/scoring/types';
import type { CellWorld } from '../../simulation/cell-world/types';
import { mountUsable } from '../../simulation/specimens/mount-world';
import type { StructureId } from '../../simulation/specimens/assets';
import { b02StageEvidence, pigmentKinds } from './evidence';
import { CHROMO_KINDS, PLANT_KINDS, capturedKinds, fixedCaptures, lowAndHigh, obsKind, observation, stereoCaptures, unavailableKinds } from './expected-results';
import { answeredCount, parseNum, type B02Notebook } from './notebook';

export const B02_WEIGHTS = { safety: 0.15, prep: 0.25, compound: 0.2, plastids: 0.15, contrast: 0.1, notebook: 0.1, closure: 0.05 } as const;

const n = (w: CellWorld, k: string) => w.evidence[k] ?? 0;
const near = (a: number, b: number, rel = 0.001) => Number.isFinite(a) && Math.abs(a - b) <= rel * Math.max(1, Math.abs(b));

/**
 * Errores de interpretación (`nb:CEL*`): lo señalado o afirmado en la libreta contrastado con la captura propia
 * importada (estructuras visibles, muestra, colorante, burbujas) y con lo que el instrumento puede mostrar.
 */
export function notebookIssuesB02(w: CellWorld, nb: B02Notebook): string[] {
  const out: string[] = [];
  const marks: Array<{ id: string | null; st: StructureId[]; plastid?: string; spec?: string }> = [
    ...nb.atlas.map((r) => ({ id: r.observationId, st: r.structures, plastid: r.plastid, spec: r.specimen })),
    { id: nb.buccal.observationId, st: nb.buccal.structures },
    { id: nb.elodea.observationId, st: nb.elodea.structures },
    { id: nb.fixed.observationId, st: nb.fixed.structures },
  ];
  for (const r of marks) {
    const o = observation(w, r.id);
    if (!o) continue;
    const kind = obsKind(w, o);
    const vis = o.visibleRegionIds;
    const plant = PLANT_KINDS.includes(kind as never) || kind === 'fixed';
    if (r.plastid === 'amyloplast' && CHROMO_KINDS.includes(kind as never)) out.push('nb:CEL46');
    if (kind === 'buccal' && r.st.includes('chloroplasts')) out.push('nb:CEL47');
    if (plant && r.st.includes('cellMembrane')) out.push('nb:CEL48');
    if (plant && r.st.includes('nucleus') && !vis.includes('nucleus')) out.push('nb:CEL49');
    if (kind === 'buccal' && o.assetId.startsWith('buccalEosin') && r.st.includes('nucleus') && !vis.includes('nucleus')) out.push('nb:CEL26');
    const m = w.mounts[o.slideId ?? ''];
    if (r.st.includes('vacuole') && m && (m.bubbleFraction > 0 || m.bubbles.length > 0)) out.push('nb:CEL52');
    if (o.instrument === 'stereo' && r.st.includes('nucleus')) out.push('nb:CEL67');
    if (r.st.some((s) => !vis.includes(s))) out.push('nb:unsupported');
    if (r.spec && kind && r.spec !== kind) out.push('nb:specimen');
  }
  if (nb.sclereids.eosinShows === 'lignin') out.push('nb:CEL25');
  if (nb.sclereids.wallCause === 'eosinLignin') out.push('nb:CEL51');
  if (nb.elodea.motion === 'observed') out.push('nb:CEL50');
  if (nb.scaleUm.trim()) out.push('nb:CEL54');
  for (const f of nb.figures) {
    const o = observation(w, f.observationId);
    if (o && f.specimen && f.specimen !== obsKind(w, o)) out.push('nb:CEL55');
  }
  // Núcleo pedido desde el estereoscopio (fila o texto de la ruta macroscópica).
  if (observation(w, nb.stereo.observationId) && /n[úu]cleo/i.test(nb.stereo.features)) out.push('nb:CEL67');
  return [...new Set(out)];
}

const firstOf = (w: CellWorld, codes: string[], fallback: string, issues: string[] = []) => {
  const c = codes.find((k) => n(w, `err:${k}`) > 0 || issues.includes(`nb:${k}`));
  return c ? `b02fb.${c}` : `b02fb.${fallback}`;
};

export function evaluateB02(w: CellWorld, nb: B02Notebook): Evaluation {
  const flags = b02StageEvidence(w, nb);
  const issues = notebookIssuesB02(w, nb);
  const has = (...ks: string[]) => ks.some((k) => issues.includes(`nb:${k}`));
  const errs = (...ks: string[]) => ks.reduce((s, k) => s + n(w, `err:${k}`), 0);
  const missing = unavailableKinds(w);
  const kinds = capturedKinds(w);

  // ── Seguridad y cuidado del equipo (15) ──
  let safety = [
    item('b02.ppe', flags.ppe && errs('PPE') === 0 ? true : flags.ppe ? null : false, 3, 'b02fb.ppe', undefined, 0.5),
    item('b02.safetyInspect', !!w.evidence['inspected:glassBin'] && !!w.evidence['inspected:bioWaste'], 2, 'b02fb.safetyInspect'),
    item('b02.noCollision', errs('CEL35', 'CEL36', 'CEL45') === 0, 3, firstOf(w, ['CEL35', 'CEL36', 'CEL45'], 'noCollision')),
    item('b02.sharps', errs('CEL05', 'CEL16', 'CEL59', 'CEL62') === 0 && w.shards === 0, 4, firstOf(w, ['CEL62', 'CEL05', 'CEL59', 'CEL16'], 'sharps')),
    item('b02.biosafety', errs('CEL60') === 0 && w.benchSpillMl < 0.005, 3, firstOf(w, ['CEL60', 'CEL22', 'CEL19'], 'biosafety')),
  ];
  if (w.safety.incident) safety = safety.map((i) => ({ ...i, ok: false, points: 0, feedbackKey: 'b02fb.incident' }));

  // ── Preparaciones vegetales y manejo de reactivos (25) ──
  const ownMounts = Object.values(w.mounts).filter((m) => m.cell?.zones.some((z) => !z.premade));
  const usable = ownMounts.filter((m) => mountUsable(w.params.mount, m)).length;
  const stained = ownMounts.filter((m) => Object.values(m.cell!.stainMl).some((v) => (v ?? 0) > 0)).length;
  const prep = [
    item('b02.mounts', usable >= 3 && kinds.length >= 3, 6, 'b02fb.mounts', { n: kinds.length }, Math.min(1, kinds.length / 3) * 0.6),
    item('b02.cuts', ownMounts.length > 0 && errs('CEL01', 'CEL02', 'CEL03', 'CEL04', 'CEL07', 'CEL08') === 0, 5, firstOf(w, ['CEL01', 'CEL02', 'CEL03', 'CEL04', 'CEL07', 'CEL08'], 'cuts')),
    item('b02.reagents', stained > 0 && errs('CEL18', 'CEL20', 'CEL21', 'CEL22', 'CEL23', 'CEL24', 'CEL27', 'CEL28', 'CEL29', 'CEL30') === 0, 5, firstOf(w, ['CEL20', 'CEL21', 'CEL24', 'CEL23', 'CEL22', 'CEL27', 'CEL28', 'CEL29', 'CEL30', 'CEL18'], 'reagents')),
    item('b02.cover', ownMounts.some((m) => m.coverId) && errs('CEL14', 'CEL15', 'CEL16', 'CEL17', 'CEL19') === 0, 4, firstOf(w, ['CEL14', 'CEL15', 'CEL16', 'CEL17', 'CEL19'], 'cover')),
    item('b02.contamination', ownMounts.length > 0 && errs('CEL06', 'CEL09', 'CEL10', 'CEL11', 'CEL12', 'CEL13') === 0, 5, firstOf(w, ['CEL09', 'CEL10', 'CEL11', 'CEL12', 'CEL13', 'CEL06'], 'contamination')),
  ];

  // ── Operación del microscopio (20) ──
  const both = kinds.filter((k) => lowAndHigh(w, k)).length;
  const compound = [
    item('b02.magnifications', both >= 3, 6, 'b02fb.magnifications', { n: both }, Math.min(1, both / 3) * 0.6),
    item('b02.clip', !!w.evidence.slideClamped && errs('CEL31', 'CEL32', 'CEL33') === 0, 3, firstOf(w, ['CEL31', 'CEL32', 'CEL33'], 'clip')),
    item('b02.focus', both > 0 && errs('CEL36', 'CEL37', 'CEL44', 'CEL53') === 0, 4, firstOf(w, ['CEL36', 'CEL44', 'CEL37', 'CEL53'], 'focus')),
    item('b02.lowFirst', both > 0 && errs('CEL34', 'CEL38', 'CEL39') === 0, 3, firstOf(w, ['CEL34', 'CEL38', 'CEL39'], 'lowFirst')),
    item('b02.light', both > 0 && errs('CEL40', 'CEL41', 'CEL42', 'CEL43', 'CEL63') === 0, 4, firstOf(w, ['CEL42', 'CEL40', 'CEL41', 'CEL63', 'CEL43'], 'light')),
  ];
  if (w.cell.routes.fixed) {
    const fx = fixedCaptures(w).length > 0;
    compound.push(item('b02.fixed', fx && w.assignment.fixedSlideIds.every((id) => w.slideCase.slots[w.slideCase.home[id]] === id) && errs('CEL56', 'CEL57', 'CEL58') === 0, 3, firstOf(w, ['CEL57', 'CEL58', 'CEL56'], 'fixed')));
  }

  // ── Reconocimiento de plastidios y muestras vegetales (15) ──
  const pig = pigmentKinds(w, nb);
  const pigDeferred = pig.length >= 2 && pig.some((k) => missing.includes(k));
  const potatoObs = observation(w, nb.potato.observationId);
  const grainsTruth = potatoObs?.visibleRegionIds.includes('starchGrains') ? 'visible' : 'notVisible';
  const elodeaRow = nb.elodea.structures;
  const plastids = [
    item('b02.chromoplasts', pigDeferred && !has('CEL46') ? null : flags.pigments && !has('CEL46'), 5, has('CEL46') ? 'b02fb.CEL46' : pigDeferred ? 'b02fb.deferred' : 'b02fb.chromoplasts', { n: pig.length }),
    item('b02.starch', missing.includes('potato') ? null : flags.starch && nb.potato.grains === grainsTruth, 5, firstOf(w, ['CEL20', 'CEL24'], missing.includes('potato') ? 'deferred' : 'starch')),
    item('b02.chloroplasts', flags.elodea && elodeaRow.includes('chloroplasts') && !has('CEL50', 'CEL52'), 5, firstOf(w, ['CEL50', 'CEL52', 'CEL18'], 'chloroplasts', issues)),
  ];

  // ── Contraste animal–vegetal y estructuras especializadas (10) ──
  const contrast = [
    item('b02.buccal', flags.animal && errs('CEL27') === 0 && !has('CEL26', 'CEL47'), 4, firstOf(w, ['CEL27', 'CEL26', 'CEL47', 'CEL12', 'CEL13'], 'buccal', issues)),
    item('b02.sclereids', flags.walls && !has('CEL25', 'CEL51'), 3, firstOf(w, ['CEL25', 'CEL51'], 'sclereids', issues)),
    item('b02.comparison', nb.comparison.plantAnimal.trim().length > 10 && nb.comparison.plastids.trim().length > 10 ? null : false, 3, 'b02fb.comparison', undefined, 0.5),
  ];
  if (w.cell.routes.stereo) {
    contrast.push(item('b02.stereo', stereoCaptures(w).length > 0 && errs('CEL66') === 0 && !has('CEL67'), 3, firstOf(w, ['CEL66', 'CEL67'], 'stereo', issues)));
  }

  // ── Libreta, interpretación y atribución de evidencias (10) ──
  const oc = w.params.microscope.ocularX;
  const rowsOk = nb.atlas.filter((r) => {
    const o = observation(w, r.observationId);
    return !!o?.isObservationValid && !!o.objectiveX && near(parseNum(r.totalMag), oc * o.objectiveX);
  }).length;
  const k = answeredCount(nb);
  const notebook = [
    item('b02.records', rowsOk >= 3 && !has('CEL55', 'specimen'), 3, has('CEL55') ? 'b02fb.CEL55' : 'b02fb.records', { n: rowsOk }),
    item('b02.interpretation', nb.atlas.some((r) => r.structures.length > 0) && !has('CEL48', 'CEL49', 'CEL54', 'CEL67', 'unsupported'), 3, firstOf(w, ['CEL49', 'CEL48', 'CEL54', 'CEL67'], 'interpretation', issues)),
    item('b02.answers', k >= 5 ? null : false, 4, 'b02fb.answers', { n: k }, Math.min(1, k / 10) * 0.6),
  ];

  // ── Orden, devolución y cierre (5) ──
  const closure = [
    item('b02.parked', flags.safeParked && errs('CEL64') === 0, 2, firstOf(w, ['CEL64'], 'parked')),
    item('b02.restored', flags.benchRestored && errs('CEL61', 'CEL65') === 0, 3, firstOf(w, ['CEL61', 'CEL65'], 'restored')),
  ];

  const components = [
    finalizeComponent('safety', B02_WEIGHTS.safety, safety),
    finalizeComponent('prep', B02_WEIGHTS.prep, prep),
    finalizeComponent('compound', B02_WEIGHTS.compound, compound),
    finalizeComponent('plastids', B02_WEIGHTS.plastids, plastids),
    finalizeComponent('contrast', B02_WEIGHTS.contrast, contrast),
    finalizeComponent('notebook', B02_WEIGHTS.notebook, notebook),
    finalizeComponent('closure', B02_WEIGHTS.closure, closure),
  ];
  const total = components.reduce((s, c) => s + c.weight * c.score, 0);
  const needsTeacherReview = components.flatMap((c) => c.items.filter((i) => i.ok === null).map((i) => i.key));
  return { components, total, needsTeacherReview };
}
