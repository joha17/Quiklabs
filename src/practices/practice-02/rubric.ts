/**
 * Rúbrica de la Práctica 2 (§12): evaluación por EVIDENCIA (estado final, eventos y libreta), no por secuencia.
 * Pesos: seguridad 15 %, manipulación 20 %, Parte A 20 %, separación 25 %, resultados y análisis 20 %.
 */
import type { World } from '../../simulation/entities/types';
import { type Evaluation, type ScoreItem, finalizeComponent, item } from '../../simulation/scoring/types';
import { tubeStatus } from '../../simulation/entities/tube';
import { substanceMass } from '../../simulation/solutions/mixture';
import { LABEL_TO_SUBSTANCE, tubeLabels } from './definition';
import { SUBSTANCES } from './substances';
import { type NotebookState, ROW_TRUTH, SUBSTANCE_ROWS, type RowKey } from './notebook';
import { partBResults } from './results';
import { cylinderIds, dishId, mixBeakerId, sumEvidence } from './roles';

const TUBES = ['t1', 't2', 't3', 't4', 't5', 't6'];

function ev(w: World, k: string): number {
  return w.evidence[k] ?? 0;
}

/** Propiedades reales de la sustancia de cada fila (según el perfil de aceite). */
function truthFor(w: World, row: RowKey) {
  const t = ROW_TRUTH[row];
  const subId = row === 'aceite' ? w.params.oilProfile : (t.substance as keyof typeof SUBSTANCES);
  const def = SUBSTANCES[subId];
  const odor = def.odor === 'NONE' ? ['inodoro'] : def.odor === 'FAINT' ? ['tenue', 'casi_inodoro'] : ['casi_inodoro', 'inodoro'];
  const sol = def.waterBehavior === 'SOLUBLE' ? ['soluble'] : def.waterBehavior === 'IMMISCIBLE' ? ['inmiscible', 'insoluble'] : ['insoluble'];
  return { ...t, colors: def.expectedColorKeys, odor, sol };
}

/** Campos incorrectos de una fila del Cuadro 2.1 (para «qué revisar» en modo práctica; no revela la respuesta). */
export function wrongFields(w: World, row: RowKey, nb: NotebookState): string[] {
  const ans = nb.table21[row];
  const t = truthFor(w, row);
  const out: string[] = [];
  const f = ans.formula.trim().toLowerCase();
  if (!(t.formula.includes(f.replace(/\s+/g, '')) || t.formula.includes(f))) out.push('formula');
  if (ans.classification !== t.classification) out.push('classification');
  if (ans.state !== t.state) out.push('state');
  if (!t.colors.includes(ans.color)) out.push('color');
  if (!t.odor.includes(ans.odor)) out.push('odor');
  if (!t.sol.includes(ans.solubility)) out.push('solubility');
  return out;
}

function textOk(s: string, min = 15): boolean {
  return s.trim().length >= min;
}

function mentions(s: string, re: RegExp): boolean {
  return re.test(s.toLowerCase());
}

export function evaluate(w: World, nb: NotebookState, opts: { ppeConfirmed: boolean; mode: string }): Evaluation {
  const review: string[] = [];

  // ── Seguridad y preparación (15 %) ──
  const safety: ScoreItem[] = [
    item('ppe', opts.ppeConfirmed, 2, 'fb.ppe'),
    item('noBurns', ev(w, 'burns') === 0, 2, 'fb.burns', { n: ev(w, 'burns') }),
    item('noDirectSniff', ev(w, 'directSniff') === 0, 1, 'fb.directSniff'),
    item('noCriticalBlocks', ev(w, 'criticalBlocks') === 0, 3, 'fb.criticalBlocks', { n: ev(w, 'criticalBlocks') }),
    item('noBreakage', ev(w, 'breakages') === 0, 2, 'fb.breakage', { n: ev(w, 'breakages') }),
    item('tongs', ev(w, 'hotGlassNoTongs') === 0, 2, 'fb.tongs'),
    item('noIncident', ev(w, 'incidentOverheat') === 0, 2, 'fb.overheat'),
    item('spillsHandled', !w.bench.spillOpen && ev(w, 'spillTotalMl') < 5, 1, 'fb.spills', { ml: Math.round(ev(w, 'spillTotalMl') * 10) / 10 }),
  ];

  // ── Manipulación y medición (20 %) ──
  const tubeWaterOk = TUBES.filter((id) => {
    const v = w.vessels[id];
    return v && v.mix.waterG >= 1.9 && v.mix.waterG <= 2.1;
  }).length;
  // Los repuestos cuentan igual: se usa el papel de cada recipiente, no su id.
  const mb = mixBeakerId(w);
  const cyls = cylinderIds(w);
  const dish = dishId(w);
  // Agua para la mezcla = lo vertido al vaso de la mezcla menos el agua de lavado del residuo.
  const waterToBeaker = sumEvidence(w, [...cyls, 'piseta'].map((c) => `pour:${c}->${mb}`)) - ev(w, `washMl:${mb}`);
  const r = partBResults(w);
  const sampleOk = r.sampleG >= 2.45 && r.sampleG <= 2.55;
  const stirred = ev(w, `heatStirredS:${mb}`);
  const unstirred = ev(w, `heatUnstirredS:${mb}`);
  const aliquot = sumEvidence(w, cyls.map((c) => `pour:${c}->${dish}`));
  const wash = ev(w, 'washMl');
  const handling: ScoreItem[] = [
    { ...item('tubeWater', tubeWaterOk === 6, 3, 'fb.tubeWater', { n: tubeWaterOk }), points: (3 * tubeWaterOk) / 6 },
    item('beakerWater', waterToBeaker >= 9.6 && waterToBeaker <= 10.4, 2, 'fb.beakerWater', { ml: Math.round(waterToBeaker * 10) / 10 }),
    item('sampleMass', w.vessels.vial ? r.sampleG > 2.4 : sampleOk && ev(w, 'tareCount') > 0, 2, w.vessels.vial ? 'fb.vial' : 'fb.sampleMass', { g: Math.round(r.sampleG * 100) / 100 }),
    item('stirHeating', stirred + unstirred > 0 && stirred >= 0.7 * (stirred + unstirred), 2, 'fb.stirHeating'),
    item('gradualPower', ev(w, 'abruptPowerJumps') === 0, 2, 'fb.abruptPower'),
    item('probe', ev(w, `probeIn:${mb}`) > 0, 1, 'fb.probe'),
    item('aliquot', aliquot >= 1.9 && aliquot <= 2.1, 2, 'fb.aliquot', { ml: Math.round(aliquot * 100) / 100 }),
    item('wash', wash >= 1.6 && wash <= 2.8, 2, wash < 1.6 ? 'fb.washLow' : 'fb.washHigh', { ml: Math.round(wash * 10) / 10 }),
    item('noSpills', ev(w, 'spillTotalMl') < 1, 2, 'fb.spills', { ml: Math.round(ev(w, 'spillTotalMl') * 10) / 10 }),
  ];

  // ── Parte A (20 %) ──
  let correct = 0;
  let total = 0;
  const wrongRows: string[] = [];
  for (const row of SUBSTANCE_ROWS) {
    const ans = nb.table21[row];
    const t = truthFor(w, row);
    const checks = [
      t.formula.includes(ans.formula.trim().toLowerCase().replace(/\s+/g, '')) || t.formula.includes(ans.formula.trim().toLowerCase()),
      ans.classification === t.classification,
      ans.state === t.state,
      t.colors.includes(ans.color),
      t.odor.includes(ans.odor),
      t.sol.includes(ans.solubility),
    ];
    const c = checks.filter(Boolean).length;
    correct += c;
    total += checks.length;
    if (c < checks.length) wrongRows.push(row);
  }
  const statuses = TUBES.map((id) => (w.vessels[id] ? tubeStatus(w, w.vessels[id], SUBSTANCES, LABEL_TO_SUBSTANCE) : null));
  const labels = tubeLabels(w.params.oilProfile);
  const labeledAll = TUBES.every((id) => labels.includes(w.vessels[id]?.label ?? ''));
  const mislabeled = statuses.filter((s) => s?.errors.includes('MISLABELED')).length;
  const partA: ScoreItem[] = [
    { ...item('table21', correct === total, 14, 'fb.table21', { rows: wrongRows.join(', ') }), points: (14 * correct) / Math.max(1, total) },
    item('labels', labeledAll && mislabeled === 0, 2, 'fb.labels', { n: mislabeled }),
    item('shaken', statuses.every((s) => s?.shaken), 2, 'fb.notShaken'),
    item('fanned', TUBES.every((id) => w.vessels[id]?.fanned), 1, 'fb.fan'),
    item('noContamination', statuses.every((s) => !s?.errors.includes('CONTAMINATED')), 1, 'fb.contamination'),
  ];

  // ── Separación y montaje (25 %) ──
  const papersUsed = Object.values(w.vessels).filter((v) => v.type === 'FILTER_PAPER' && (v.mix.solid.CARBON ?? 0) > 0.05);
  const anyBadFold = papersUsed.some((p) => p.filter?.fold !== 'CONE_OK');
  const anyTorn = papersUsed.some((p) => p.filter?.torn);
  const guidedFrac = ev(w, 'funnelPourMl') > 0 ? ev(w, 'funnelPourGuidedMl') / ev(w, 'funnelPourMl') : 0;
  const carbonInProducts = (r.carbonInFiltrateG ?? 0) + (w.vessels[dish]?.mix.solid.CARBON ?? 0);
  const covered = ev(w, `coveredEvapS:${dish}`);
  const open = ev(w, `openEvapS:${dish}`);
  const motherLost = substanceMass(w.vessels.waste_liquid?.mix ?? { waterG: 0, iceG: 0, solid: {}, dissolved: {}, oil: {}, suspended: {}, emulsion: 0, crystals: null }, 'KNO3');
  const separation: ScoreItem[] = [
    item('fold', papersUsed.length > 0 && !anyBadFold, 3, 'fb.fold'),
    item('wetted', papersUsed.length > 0 && papersUsed.every((p) => p.filter?.wetted), 2, 'fb.dryPaper'),
    item('receiver', ev(w, 'filtrateLostMl') < 0.1, 2, 'fb.noReceiver', { ml: Math.round(ev(w, 'filtrateLostMl') * 10) / 10 }),
    item('noOverflow', ev(w, 'filterOverflowMl') === 0, 2, 'fb.overflow'),
    item('guided', guidedFrac > 0.7, 2, 'fb.guided'),
    item('clearFiltrate', papersUsed.length > 0 && carbonInProducts < 0.005 && !anyTorn, 4, 'fb.filtrateDark'),
    item('coverEvap', covered > 0 && covered >= open, 2, 'fb.cover'),
    item('evaporated', r.dishKno3G > 0.2 && (w.vessels[dish]?.mix.waterG ?? 1) === 0, 2, 'fb.evaporation'),
    item('crystals', r.crystalsG > 0.2, 3, 'fb.noCrystals'),
    item('iceBath', ev(w, 'iceBathUsed') > 0, 1, 'fb.iceBath'),
    item('noShock', ev(w, 'thermalShockRisk') === 0, 1, 'fb.thermalShock'),
    item('motherLiquor', motherLost < 0.05, 1, 'fb.motherLiquor'),
  ];

  // ── Resultados, balance y análisis (20 %) ──
  const e22 = nb.table22.EVAPORATION;
  const c22 = nb.table22.CRYSTALLIZATION;
  const massCheck = (txt: string, actual: number): boolean | null => {
    const v = parseFloat(txt.replace(',', '.'));
    if (!isFinite(v)) return null;
    return Math.abs(v - actual) <= 0.03 + actual * 0.05;
  };
  const a = nb.activities;
  const a1ok = a.a1.arenaSal === 'HETEROGENEOUS_MIXTURE' && a.a1.aguaArena === 'HETEROGENEOUS_MIXTURE' && a.a1.salAgua === 'HOMOGENEOUS_MIXTURE';
  const a2ok = Object.values(a.a2).every((s) => textOk(s, 15));
  const heatOk = textOk(a.a3, 20) && mentions(a.a3, /aceler|rápid|rapid|velocidad|disolv|solubil|cristaliz|temperatur|filtr/);
  // Fuentes de pérdida realmente observadas en el intento.
  const sources: RegExp[] = [/papel|filtro|retenid|residuo/, /madre|disuelt|queda en (la )?disoluci/];
  if (ev(w, 'spillTotalMl') > 0.2) sources.push(/derram/);
  if (Object.keys(w.evidence).some((k) => k.startsWith('splashG:') && w.evidence[k] > 0.005)) sources.push(/salpic/);
  if ((w.ledger.adhered.KNO3 ?? 0) > 0 || (w.ledger.adhered.H2O ?? 0) > 0) sources.push(/adher|pared|instrument|varilla/);
  sources.push(/evapor/);
  const matched = sources.filter((re) => mentions(a.a5, re)).length;
  if (textOk(a.a3)) review.push('a3');
  if (textOk(a.a4)) review.push('a4');
  if (textOk(a.a5)) review.push('a5');
  const results: ScoreItem[] = [
    item('evapObs', textOk(e22.observations, 10), 2, 'fb.obsEvap'),
    item('crystObs', textOk(c22.observations, 10), 2, 'fb.obsCryst'),
    item('evapMass', massCheck(e22.massG, r.dishKno3G + (w.vessels[dish]?.mix.solid.IMP ?? 0) + (w.vessels[dish]?.mix.solid.CARBON ?? 0)), 2, 'fb.evapMass', { g: Math.round(r.dishSolidsG * 1000) / 1000 }),
    item('crystMass', massCheck(c22.massG, r.crystalsG), 1, 'fb.crystMass', { g: Math.round(r.crystalsG * 1000) / 1000 }),
    item('heatObjective', textOk(a.a3, 20) ? (heatOk ? true : null) : false, 3, 'fb.heatObjective'),
    item('activity1', a1ok, 3, 'fb.activity1'),
    item('activity2', a2ok, 2, 'fb.activity2'),
    item('activity4', textOk(a.a4, 30) ? true : false, 2, 'fb.activity4'),
    item('activity5', matched >= 2 ? true : textOk(a.a5, 20) ? null : false, 3, 'fb.activity5'),
  ];

  const components = [
    finalizeComponent('safety', 0.15, safety),
    finalizeComponent('handling', 0.2, handling),
    finalizeComponent('partA', 0.2, partA),
    finalizeComponent('separation', 0.25, separation),
    finalizeComponent('results', 0.2, results),
  ];
  const totalScore = components.reduce((s, c) => s + c.weight * c.score, 0);
  return { components, total: totalScore, needsTeacherReview: review };
}
