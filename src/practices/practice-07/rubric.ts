/**
 * Evaluación por evidencia de la Práctica 7 (§13): seguridad 10 %, solubilidad/miscibilidad 20 %, conducción en
 * material puro 15 %, conductividad de disoluciones 20 %, incógnitas 15 %, cálculos y registros 10 %, interpretación
 * 10 %. Todo se calcula con la trayectoria y las lecturas PROPIAS del intento; las respuestas abiertas quedan para
 * revisión docente (`ok: null`). Una prevención bloqueada no cuenta como accidente (§13.1). Función pura (Worker).
 */
import type { P07World } from '../../simulation/bonding-world/types';
import { finalizeComponent, item, type Evaluation } from '../../simulation/scoring/types';
import { compTotal } from '../../simulation/solution-properties/conservation';
import { MATERIALS } from '../../simulation/solution-properties/materials';
import { hypothesesCount, p07StageEvidence } from './evidence';
import {
  cellValue, comparedSamples, contactOf, contactReadings, controlReadings, expectedClass, kappaIn, kappaReadings, reading, reportableConc, strongLevels,
  testGroupOf, trueConcOf, unknownTests,
} from './expected-results';
import { answered, answeredCount, decimals, isNum, parseNum, ROWS_B, type P07Notebook } from './notebook';

const n = (w: P07World, k: string) => w.evidence[k] ?? 0;
const near = (a: number, b: number, rel: number) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.abs(b) * rel;

export const P07_WEIGHTS = { safety: 0.1, solubility: 0.2, solidConduction: 0.15, solutionConductivity: 0.2, unknowns: 0.15, calculations: 0.1, interpretation: 0.1 } as const;

const allText = (nb: P07Notebook) =>
  [...Object.values(nb.analysis), nb.conclusion, ...Object.values(nb.tableF).flatMap((r) => [r.explanation, r.why]), ...Object.values(nb.tableE).map((r) => r.limitation), ...Object.values(nb.tableC).map((r) => r.explanation)]
    .join(' \n ')
    .toLowerCase();

/** Errores de cálculo, unidades y argumentación detectados en la libreta (códigos `nb:*`, §9.5–§9.6). */
export function notebookIssues(w: P07World, nb: P07Notebook): string[] {
  const out: string[] = [];
  const text = allText(nb);
  // ── Cuadro B ──
  for (const k of ROWS_B) {
    const r = nb.tableB[k];
    const obs = reading(w, r.observationId);
    if (!obs) continue;
    // L50: «soluble/miscible» en una muestra que quedó en dos fases.
    if ((obs.snapshot.phases ?? 0) >= 2 && (r.interpretation === 'soluble' || r.interpretation === 'miscible')) out.push('nb:two_phases_ignored');
    // L48: «insoluble» con una observación tomada antes del equilibrio de una muestra que sí se disuelve.
    if (r.interpretation === 'insoluble' && obs.qualityFlags.some((q) => q === 'NOT_EQUILIBRATED' || q === 'EARLY')) {
      const tube = w.vessels[obs.targetId];
      if (tube && (obs.snapshot.undissolvedG ?? 0) > 0 && compTotal(tube.solid) < (obs.snapshot.undissolvedG ?? 0) * 0.5) out.push('nb:kinetic_confused_as_equilibrium');
    }
    // L12: volumen anotado distinto del que realmente se transfirió (lectura de la probeta o inventario del tubo).
    const vTyped = parseNum(r.volume.value);
    const tube = w.vessels[r.tubeId || obs.targetId];
    if (Number.isFinite(vTyped) && tube && r.solvent) {
      const solventMl = r.solvent === 'water' ? (tube.polar.water ?? 0) / MATERIALS.water.densityGml : (tube.apolar.heptane ?? 0) / MATERIALS.heptane.densityGml;
      if (solventMl > 0.2 && Math.abs(vTyped - solventMl) > 0.4) out.push('err:volume_mismatch');
    }
  }
  // ── Cuadro D ──
  const D = nb.tableD;
  for (const key of ['strongA', 'strongB', 'nonElectrolyte', 'weak'] as const) {
    const row = D[key];
    const c = parseNum(row.conc.value);
    const k = reading(w, row.kappa.readingId);
    const m = cellValue(w, row.mass);
    const V = cellValue(w, row.volume);
    const rep = reportableConc(w, row);
    // L56: g/L escritos como mol/L.
    if (Number.isFinite(c) && m > 0 && V > 0 && near(c, m / (V / 1000), 0.03) && !near(rep, m / (V / 1000), 0.05)) out.push('nb:grams_as_moles');
    // L41: concentración con la masa pesada cuando parte se perdió (lo que llegó al recipiente es menos).
    const truth = trueConcOf(w, row);
    if (Number.isFinite(c) && near(c, rep, 0.03) && Number.isFinite(truth) && truth > 0 && truth < rep * 0.95) out.push('nb:ideal_mass_used');
    // L44: había sólido sin disolver y se asumió la masa total disuelta.
    if (k && (k.snapshot.undissolvedG ?? 0) > 0.005 && Number.isFinite(c) && near(c, rep, 0.05)) out.push('nb:undissolved_counted');
    // L59: más cifras de las que respaldan una balanza de 0,01 g y una probeta de 0,2 mL.
    if (isNum(row.conc.value) && decimals(row.conc.value) > 4 && !row.conc.uncertainty.trim()) out.push('nb:unjustified_precision');
  }
  for (const row of Object.values(D)) {
    const k = reading(w, row.kappa.readingId);
    const typed = parseNum(row.kappa.value);
    if (k && Number.isFinite(typed) && row.kappaUnit) {
      const right = kappaIn(k, row.kappaUnit);
      // L35: µS/cm copiado como mS/cm (o al revés): factor 1000.
      if ((row.kappaUnit === 'mS/cm' || row.kappaUnit === 'µS/cm') && (near(typed, right * 1000, 0.02) || near(typed, right / 1000, 0.02))) out.push('nb:conductivity_unit_factor');
      // L57: S/m tratado como mS/cm (factor 10).
      if ((row.kappaUnit === 'S/m' || row.kappaUnit === 'mS/cm') && (near(typed, right * 10, 0.02) || near(typed, right / 10, 0.02))) out.push('nb:si_to_ms_cm_error');
      if (decimals(row.kappa.value) > decimals(String(k.value).replace('.', ',')) + 2) out.push('nb:unjustified_precision');
    }
    // L58: temperatura en K donde la columna es °C, o sin número.
    const t = parseNum(row.temp.replace(/[^\d.,-]/g, ''));
    if (row.temp.trim() && (/k\b/i.test(row.temp) || t > 150)) out.push('nb:temperature_unit_error');
  }
  // L55: valores de κ escritos sin lectura (teóricos) presentados como serie experimental.
  const typedNoId = Object.values(D).filter((r) => isNum(r.kappa.value) && !r.kappa.readingId).length;
  if (typedNoId >= 2) out.push('nb:fabricated_experimental_plot');
  // ── Cuadro E ──
  for (const k of ['X', 'Y'] as const) {
    const r = nb.tableE[k];
    const groups = new Set([testGroupOf(r.test1), testGroupOf(r.test2)].filter(Boolean));
    // L45: solo el aspecto (color) como evidencia.
    if ((r.test1 === 'appearance' || r.test2 === 'appearance') && groups.size < 2 && r.classification && r.classification !== 'undetermined') out.push('nb:color_only_evidence');
    // L49: menos de dos pruebas independientes realmente hechas.
    if (r.classification && r.classification !== 'undetermined' && unknownTests(w, k).size < 2) out.push('nb:unknown_underidentified');
    // L60: categoría absoluta con resultados contradictorios o sin evidencia suficiente, sin discutir límites.
    if (r.classification && r.classification !== 'undetermined' && unknownTests(w, k).size < 2 && !/(l[ií]mit|depend|no se puede|indetermin|faltar[ií]a|otra prueba)/.test(r.limitation.toLowerCase())) out.push('nb:unjustified_absolute_claim');
  }
  // ── Argumentación (texto): cada afirmación se juzga dentro de su oración (una negación en otra no la anula) ──
  const sentences = text.split(/[.\n;]+/).map((x) => x.trim()).filter(Boolean);
  const claims = (yes: RegExp, not: RegExp) => sentences.some((x) => yes.test(x) && !not.test(x));
  // L46: grafito tratado como metal.
  if (claims(/grafito[^.]{0,80}(es un metal|es met[aá]lico|enlace met[aá]lico|porque es met[aá]lico)/, /(no es|ni es|no tiene)[^.]{0,20}met[aá]lic|no es un metal|covalente/)) out.push('nb:graphite_misclassified');
  if (nb.tableF.graphite.explanation && /met[aá]lic/.test(nb.tableF.graphite.explanation.toLowerCase()) && !/no (es|tiene)|covalente/.test(nb.tableF.graphite.explanation.toLowerCase())) out.push('nb:graphite_misclassified');
  // L47: ácido acético como sal o compuesto iónico.
  if (claims(/ac[eé]tico[^.]{0,80}(es una sal|es i[oó]nico|compuesto i[oó]nico|enlace i[oó]nico)/, /no es (una sal|i[oó]nico|un compuesto i[oó]nico)/)) out.push('nb:weak_acid_misclassified');
  // L51: enlace polar ⇒ molécula polar sin considerar geometría.
  if (claims(/enlaces? polar(es)?[^.]{0,60}(por (lo )?tanto|entonces|as[ií] que|luego|por eso)[^.]{0,40}(mol[eé]cula|sustancia)[^.]{0,10}(es )?polar/, /geometr|simetr|forma de la mol/)) out.push('nb:bond_vs_molecule_polarity');
  // L52: iones del cristal seco «se mueven» como en solución.
  if (claims(/(cristal|s[oó]lido)[^.]{0,60}iones[^.]{0,30}(se mueven|circulan|libres|m[oó]viles)/, /iones[^.]{0,30}(no se mueven|fijos|no circulan|no son m[oó]viles)|no (se mueven|circulan)/)) out.push('nb:fixed_ions_assumed_mobile');
  // L53: la sacarosa se disocia o forma iones.
  if (claims(/sacarosa[^.]{0,80}(se disocia|forma iones|libera iones|es (un )?electrolito)/, /no (se disocia|forma iones|libera iones|es (un )?electrolito)/)) out.push('nb:sugar_assumed_electrolyte');
  // L54: «lo semejante disuelve a lo semejante» como ley sin excepciones.
  if (claims(/(semejante disuelve|similar disuelve)[^.]*(siempre|todos|todas|cualquier)|(siempre|todos|todas)[^.]*(semejante disuelve|similar disuelve)/, /excepci|no siempre|depende|l[ií]mite/)) out.push('nb:solubility_overgeneralization');
  // L29: grafito medido solo a través de las capas y generalizado.
  const g = contactReadings(w).filter((r) => w.specimens[r.snapshot.specimenId!]?.material === 'graphite');
  if (g.length && g.every((r) => r.snapshot.path === 'perpendicular')) out.push('err:graphite_orientation_unchecked');
  return [...new Set(out)];
}

/** Coherencia entre lo observado y lo interpretado en el Cuadro B (§12.2): fracción de filas consistentes. */
function pairInterpretationScore(w: P07World, nb: P07Notebook): number {
  let ok = 0;
  let total = 0;
  for (const k of ROWS_B) {
    const r = nb.tableB[k];
    const obs = reading(w, r.observationId);
    if (!obs || !r.interpretation) continue;
    total++;
    const phases = obs.snapshot.phases ?? 0;
    const und = obs.snapshot.undissolvedG ?? 0;
    const liquidSample = obs.snapshot.materials.some((m) => MATERIALS[m].phase === 'liquid');
    const fine =
      phases >= 2 ? r.interpretation === 'immiscible' || r.interpretation === 'insoluble' :
      und > 0.002 ? r.interpretation === 'partial' || r.interpretation === 'insoluble' :
      liquidSample ? r.interpretation === 'miscible' || r.interpretation === 'soluble' : r.interpretation === 'soluble';
    if (fine) ok++;
  }
  return total ? ok / total : 0;
}

export function evaluateP07(w: P07World, nb: P07Notebook): Evaluation {
  const flags = p07StageEvidence(w, nb);
  const issues = notebookIssues(w, nb);
  const has = (k: string) => issues.includes(k);
  const errs = (...ks: string[]) => ks.reduce((s, k) => s + n(w, `err:${k}`), 0);

  const safety = [
    item('p7.ppe', flags.ppeReady ? (errs('no_goggles', 'no_coat', 'no_shoes', 'incompatible_gloves') === 0 ? true : null) : false, 3, 'p7fb.ppe', undefined, 0.6),
    item('p7.restricted', errs('restricted_sample') === 0 ? true : null, 1, 'p7fb.restricted_sample', undefined, 0.5),
    item('p7.electrics', errs('wet_electrics') === 0 && compTotal(w.spills.electrics) < 0.3, 2, 'p7fb.wet_electrics'),
    item('p7.waste', errs('waste_crossmix', 'solvent_uncapped') === 0, 2, `p7fb.${errs('solvent_uncapped') ? 'solvent_uncapped' : 'waste_crossmix'}`),
    item('p7.spills', errs('container_overfill', 'mixing_spill') === 0 && compTotal(w.spills.bench) < 0.5, 2, 'p7fb.spills'),
  ];

  const compared = comparedSamples(w).length;
  const solubility = [
    item('p7.pairs', compared >= w.params.minimumPairComparisons ? true : compared === 1 ? null : false, 5, 'p7fb.pairs', { n: compared }, 0.4),
    item('p7.pairVolumes', flags.volumeMeasured && !has('err:volume_mismatch'), 3, `p7fb.${has('err:volume_mismatch') ? 'volume_mismatch' : 'pairVolumes'}`),
    item('p7.equilibrium', flags.observationInterval && errs('premature_solubility_call') === 0 && !has('nb:kinetic_confused_as_equilibrium'), 3, `p7fb.${has('nb:kinetic_confused_as_equilibrium') ? 'kinetic_confused_as_equilibrium' : 'premature_solubility_call'}`),
    item('p7.pairsClean', errs('cross_contaminated_tube', 'wrong_solvent', 'apolar_carryover', 'ionic_carryover') === 0, 3, `p7fb.${['cross_contaminated_tube', 'wrong_solvent', 'apolar_carryover', 'ionic_carryover'].find((k) => n(w, `err:${k}`)) ?? 'pairsClean'}`),
    item('p7.pairInterpretation', pairInterpretationScore(w, nb) >= 0.99 && !has('nb:two_phases_ignored') ? true : pairInterpretationScore(w, nb) > 0 ? null : false, 4, `p7fb.${has('nb:two_phases_ignored') ? 'two_phases_ignored' : 'pairInterpretation'}`, undefined, pairInterpretationScore(w, nb)),
    item('p7.exceptions', answered(nb.analysis.q6) ? null : false, 2, 'p7fb.exceptions', undefined, 0.6),
  ];

  const contactErrs = errs('single_contact', 'electrode_short', 'different_specimens', 'electrode_gap', 'unstable_contact', 'detector_out_of_range');
  const rowsC = Object.values(nb.tableC).filter((r) => r.readingId && reading(w, r.readingId)?.valid).length;
  const solidConduction = [
    item('p7.detectorControl', controlReadings(w).length > 0 && errs('unverified_detector', 'failed_control_circuit') === 0, 3, `p7fb.${errs('failed_control_circuit') ? 'failed_control_circuit' : 'unverified_detector'}`),
    item('p7.contacts', contactErrs === 0 ? true : contactErrs <= 2 ? null : false, 4, `p7fb.${['single_contact', 'electrode_short', 'different_specimens', 'electrode_gap', 'unstable_contact', 'detector_out_of_range'].find((k) => n(w, `err:${k}`)) ?? 'contacts'}`, undefined, 0.6),
    item('p7.metal', contactOf(w, 'metal').length > 0, 2, 'p7fb.metal'),
    item('p7.graphite', contactOf(w, 'graphite').length > 0 && !has('err:graphite_orientation_unchecked'), 2, `p7fb.${has('err:graphite_orientation_unchecked') ? 'graphite_orientation_unchecked' : 'graphite'}`),
    item('p7.drySalt', contactOf(w, 'ionicDry').length > 0 && errs('wet_salt_surface') === 0 ? true : contactOf(w, 'ionicDry').length > 0 ? null : false, 2, 'p7fb.wet_salt_surface', undefined, 0.5),
    item('p7.tableC', rowsC >= 3, 2, 'p7fb.tableC', { n: rowsC }),
  ];

  const m = w.meter;
  const kappaErrs = errs('probe_too_shallow', 'probe_bottom_contact', 'conductivity_not_stable', 'conductivity_over_range', 'instrument_misuse', 'temperature_uncompensated');
  const solutionConductivity = [
    item('p7.calibration', !!m.calibratedWith && errs('unknown_standard', 'wrong_calibration_standard') === 0, 3, `p7fb.${errs('wrong_calibration_standard') ? 'wrong_calibration_standard' : errs('unknown_standard') ? 'unknown_standard' : 'calibration'}`),
    item('p7.blank', kappaReadings(w, 'blank').length > 0, 3, 'p7fb.blank'),
    item('p7.strongLevels', strongLevels(w).length >= 2 ? true : strongLevels(w).length === 1 ? null : false, 4, 'p7fb.strongLevels', undefined, 0.4),
    item('p7.kappaContrast', (kappaReadings(w, 'nonElectrolyte').length > 0 || kappaReadings(w, 'weak').length > 0) && errs('ionic_carryover') === 0, 3, `p7fb.${errs('ionic_carryover') ? 'ionic_carryover' : 'kappaContrast'}`),
    item('p7.rinse', n(w, 'probeRinses') > 0 && errs('probe_contamination', 'colored_solution_carryover') === 0, 3, `p7fb.${errs('probe_contamination') ? 'probe_contamination' : errs('colored_solution_carryover') ? 'colored_solution_carryover' : 'rinse'}`),
    item('p7.kappaTechnique', kappaErrs === 0 ? true : kappaErrs <= 2 ? null : false, 4, `p7fb.${['probe_too_shallow', 'probe_bottom_contact', 'conductivity_not_stable', 'conductivity_over_range', 'instrument_misuse', 'temperature_uncompensated'].find((k) => n(w, `err:${k}`)) ?? 'kappaTechnique'}`, undefined, 0.5),
  ];

  // Incógnitas: evidencia independiente y clasificación sustentada (§13.1: «indeterminado» bien argumentado vale).
  const unkScores = (['X', 'Y'] as const).map((k) => {
    const groups = unknownTests(w, k).size;
    const r = nb.tableE[k];
    const truth = w.unknowns[k] ? expectedClass(w.unknowns[k].material) : '';
    if (!r.classification) return 0;
    if (groups >= 2) return r.classification === truth ? 1 : r.classification === 'undetermined' ? 0.6 : 0;
    return r.classification === 'undetermined' && answered(r.limitation) ? 0.7 : 0;
  });
  const evid = (['X', 'Y'] as const).filter((k) => unknownTests(w, k).size >= 2).length;
  const declared = (['X', 'Y'] as const).filter((k) => {
    const r = nb.tableE[k];
    const g1 = testGroupOf(r.test1);
    const g2 = testGroupOf(r.test2);
    return g1 && g2 && g1 !== g2 && !!r.result1 && !!r.result2;
  }).length;
  const unknowns = [
    item('p7.unknownEvidence', evid === 2 ? true : evid === 1 ? null : false, 6, `p7fb.${has('nb:unknown_underidentified') ? 'unknown_underidentified' : 'unknownEvidence'}`, undefined, 0.5),
    item('p7.unknownDeclared', declared === 2 && !has('nb:color_only_evidence'), 3, `p7fb.${has('nb:color_only_evidence') ? 'color_only_evidence' : 'unknownDeclared'}`),
    item('p7.unknownClass', unkScores.every((x) => x === 1) ? true : unkScores.some((x) => x > 0) ? null : false, 6, 'p7fb.unknownClass', undefined, (unkScores[0] + unkScores[1]) / 2),
  ];

  const concRows = (['strongA', 'strongB'] as const).filter((k) => {
    const row = nb.tableD[k];
    return near(parseNum(row.conc.value), reportableConc(w, row), 0.03);
  }).length;
  const kappaIds = Object.values(nb.tableD).filter((r) => r.kappa.readingId).length;
  const unitIssues = ['nb:conductivity_unit_factor', 'nb:si_to_ms_cm_error', 'nb:temperature_unit_error', 'nb:unjustified_precision'].filter(has);
  const calculations = [
    item('p7.concentration', concRows === 2 && !['nb:grams_as_moles', 'nb:ideal_mass_used', 'nb:undissolved_counted'].some(has) ? true : concRows > 0 ? null : false, 4, `p7fb.${['grams_as_moles', 'ideal_mass_used', 'undissolved_counted'].find((k) => has(`nb:${k}`)) ?? 'concentration'}`, undefined, concRows / 2),
    item('p7.dilution', errs('added_instead_of_final_volume', 'aliquot_unmixed') === 0, 1, `p7fb.${errs('added_instead_of_final_volume') ? 'added_instead_of_final_volume' : 'aliquot_unmixed'}`),
    item('p7.units', unitIssues.length === 0, 2, `p7fb.${unitIssues[0]?.slice(3) ?? 'units'}`),
    item('p7.traceable', kappaIds >= 4 && !has('nb:fabricated_experimental_plot') && errs('sample_identity_unverified') === 0, 3, `p7fb.${has('nb:fabricated_experimental_plot') ? 'fabricated_experimental_plot' : errs('sample_identity_unverified') ? 'sample_identity_unverified' : 'traceable'}`, { n: kappaIds }),
  ];

  const conceptIssues = ['nb:graphite_misclassified', 'nb:weak_acid_misclassified', 'nb:bond_vs_molecule_polarity', 'nb:fixed_ions_assumed_mobile', 'nb:sugar_assumed_electrolyte', 'nb:solubility_overgeneralization'].filter(has);
  const fRows = Object.values(nb.tableF).filter((r) => answered(r.explanation)).length;
  const k = answeredCount(nb);
  const interpretation = [
    item('p7.hypotheses', hypothesesCount(nb) >= 3, 2, 'p7fb.hypotheses'),
    item('p7.matrixF', fRows >= 4 ? null : false, 2, 'p7fb.matrixF', { n: fRows }, (fRows / 5) * 0.6),
    item('p7.concepts', conceptIssues.length === 0, 3, `p7fb.${conceptIssues[0]?.slice(3) ?? 'concepts'}`),
    item('p7.argument', !has('nb:unjustified_absolute_claim'), 1, 'p7fb.unjustified_absolute_claim'),
    item('p7.analysis', k >= 6 ? null : false, 2, 'p7fb.analysis', { n: k }, (k / 10) * 0.6),
  ];

  const components = [
    finalizeComponent('safety', P07_WEIGHTS.safety, safety),
    finalizeComponent('solubility', P07_WEIGHTS.solubility, solubility),
    finalizeComponent('solidConduction', P07_WEIGHTS.solidConduction, solidConduction),
    finalizeComponent('solutionConductivity', P07_WEIGHTS.solutionConductivity, solutionConductivity),
    finalizeComponent('unknowns', P07_WEIGHTS.unknowns, unknowns),
    finalizeComponent('calculations', P07_WEIGHTS.calculations, calculations),
    finalizeComponent('interpretation', P07_WEIGHTS.interpretation, interpretation),
  ];
  const total = components.reduce((s, c) => s + c.weight * c.score, 0);
  const needsTeacherReview = components.flatMap((c) => c.items.filter((i) => i.ok === null).map((i) => i.key));
  return { components, total, needsTeacherReview };
}
