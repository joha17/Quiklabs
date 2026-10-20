/**
 * Evaluación por evidencia de la Práctica 1 (§13): A seguridad 10 %, B uso de instrumentos y registro 15 %, C agua a
 * dos temperaturas 20 %, D desplazamiento 15 %, E cilindro por geometría 15 %, F propagación y presentación 15 %,
 * G discusión 10 %. Los cálculos se comparan con lo que corresponde a las lecturas del propio estudiante (§12.4); un
 * cálculo correcto sobre datos sesgados recibe crédito, pero no borra el error de técnica. Las respuestas abiertas
 * quedan para revisión docente (`ok: null`). Un incidente grave deja la seguridad en cero.
 */
import type { P01World } from '../../simulation/density-world/types';
import { finalizeComponent, item, type Evaluation } from '../../simulation/scoring/types';
import { decimalsOf, uncertaintyCylinderVolume } from '../../simulation/metrology/uncertainty';
import { p01StageEvidence } from './evidence';
import {
  caliperReadings, cellValue, conventionOf, cylinderMassReadings, expectedDisplacement, expectedGeometry, expectedWater, instrumentU, nailMassReadings, sampleReadings,
} from './expected-results';
import { IMPORT_C, IMPORT_D, answered, answeredCount, isNum, parseNum, type P01Notebook } from './notebook';

const n = (w: P01World, k: string) => w.evidence[k] ?? 0;
/** ¿El texto escrito coincide con el valor esperado (tolerancia relativa o absoluta)? */
const close = (s: string, v: number, rel = 0.005, abs = 1e-12) => {
  if (!Number.isFinite(v) || !s.trim()) return false;
  const x = parseNum(s);
  return Number.isFinite(x) && Math.abs(x - v) <= Math.max(abs, Math.abs(v) * rel);
};
const near = (a: number, b: number, rel: number) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.abs(b) * rel;

export const P01_WEIGHTS = { safety: 0.1, instruments: 0.15, water: 0.2, displacement: 0.15, geometry: 0.15, propagation: 0.15, discussion: 0.1 } as const;

/** Errores de cálculo y de registro detectados en la libreta (§9, códigos `nb:*`). */
export function notebookIssues(w: P01World, nb: P01Notebook): string[] {
  const out: string[] = [];
  const conv = conventionOf(w, nb);
  const u = instrumentU(w, conv);
  // E008: incertidumbres de probeta y pipeta confundidas (la probeta se lee a ±0,5 mL; la pipeta entrega ±0,03 mL).
  const uCyl = parseNum(nb.tableA.cylinder.uncertainty);
  const uPip = parseNum(nb.tableA.pipette.uncertainty);
  if ((Number.isFinite(uCyl) && uCyl < 0.1) || (Number.isFinite(uPip) && uPip >= 0.25) || (Number.isFinite(uCyl) && Number.isFinite(uPip) && Math.abs(uCyl - uPip) < 1e-9)) out.push('nb:wrong_instrument_resolution');
  // E016: masa combinada usada como masa del sólido.
  const C = nb.tableC;
  const D = nb.tableD;
  if (isNum(C.netMass.value) && close(C.netMass.value, cellValue(w, C.boatNailsMass), 0.0005)) out.push('nb:combined_mass_as_solid');
  if (isNum(D.netMass.value) && close(D.netMass.value, cellValue(w, D.totalMass), 0.0005)) out.push('nb:combined_mass_as_solid');
  // E017: las dos masas de una diferencia vienen de sesiones de tara distintas.
  const sess = (id: string | null) => (id ? w.readings[id]?.tareSession : undefined);
  const pairs: Array<[string | null, string | null]> = [[C.boatMass.readingId, C.boatNailsMass.readingId], [D.glassMass.readingId, D.totalMass.readingId]];
  if (pairs.some(([a, b]) => a && b && sess(a) !== sess(b))) out.push('nb:mismatched_mass_pair');
  // E035: rótulos de ambiente y fría intercambiados.
  const tRoom = nb.tableB.room.temp.readingId ? w.readings[nb.tableB.room.temp.readingId] : null;
  const tCold = nb.tableB.cold.temp.readingId ? w.readings[nb.tableB.cold.temp.readingId] : null;
  const sampleSeries = (idx?: number) => w.samples.find((s) => s.index === idx)?.series;
  if ((tRoom && sampleSeries(tRoom.sampleIndex) === 'cold') || (tCold && sampleSeries(tCold.sampleIndex) === 'room')) out.push('nb:water_labels_swapped');
  const mRoom = nb.tableB.room.mass.readingId ? w.readings[nb.tableB.room.mass.readingId] : null;
  const mCold = nb.tableB.cold.mass.readingId ? w.readings[nb.tableB.cold.mass.readingId] : null;
  if ((mRoom && sampleSeries(mRoom.sampleIndex) === 'cold') || (mCold && sampleSeries(mCold.sampleIndex) === 'room')) out.push('nb:water_labels_swapped');
  // E038: «la densidad siempre aumenta al enfriar» (ignora el máximo cerca de 4 °C).
  const allText = [...Object.values(nb.analysis), nb.tableB.room.notes, nb.tableB.cold.notes, nb.sources.water].join(' ').toLowerCase();
  if (/siempre/.test(allText) && /(aumenta|mayor|crece|sube)/.test(allText) && /(enfr|fr[ií]a|baja la temperatura|menor temperatura)/.test(allText) && !/4\s*°\s*c|4\s*grados|cuatro grados/.test(allText)) out.push('nb:water_monotonicity_claim');
  // E048 y E049: volumen final como desplazamiento; resta invertida.
  const vF = cellValue(w, C.vFinal);
  const vI = cellValue(w, C.vInitial);
  const dV = parseNum(C.dV.value);
  if (Number.isFinite(dV) && Number.isFinite(vF) && Math.abs(dV - vF) < 0.051 && Math.abs(vF - vI) > 0.6) out.push('nb:final_volume_as_displacement');
  if ((Number.isFinite(dV) && dV < 0) || parseNum(C.density.value) < 0) out.push('nb:negative_displacement');
  // Cilindro: E052 radio por diámetro, E055 lectura repetida, E056 redondeo prematuro, E057 fórmula πdh, E058 unidades.
  const ge = expectedGeometry(w, nb);
  const dTyped = parseNum(D.dMean.value);
  const vTyped = parseNum(D.volume.value);
  const cal = caliperReadings(w);
  const dTrue = cal.diameters.length ? cal.diameters[cal.diameters.length - 1].value : w.solid.diameterCm;
  if ((Number.isFinite(dTyped) && near(dTyped, dTrue / 2, 0.02)) || near(vTyped, Math.PI * ge.dMean ** 2 * ge.hMean, 0.01)) out.push('nb:radius_diameter_swapped');
  if ((D.d1.readingId && D.d1.readingId === D.d2.readingId) || (D.h1.readingId && D.h1.readingId === D.h2.readingId)) out.push('nb:duplicate_dimension_reading');
  if (Number.isFinite(dTyped) && decimalsOf(D.dMean.value) < 2 && isNum(D.d1.value)) out.push('nb:premature_rounding');
  if (near(vTyped, Math.PI * ge.dMean * ge.hMean, 0.01)) out.push('nb:cylinder_wrong_formula');
  if ((Number.isFinite(dTyped) && near(dTyped, ge.dMean * 10, 0.02)) || near(vTyped, ge.V * 1000, 0.02) || near(vTyped, ge.V * 100, 0.02)) out.push('nb:length_unit_conversion');
  // E059: densidad invertida (V/m) en cualquiera de las tablas.
  // Con el agua ρ ≈ 1 y m/V se parece a V/m: cuenta solo si lo escrito está más cerca de V/m que de m/V.
  const inv = (dens: string, m: number, V: number) => {
    const x = parseNum(dens);
    return isNum(dens) && m > 0 && V > 0 && near(x, V / m, 0.01) && Math.abs(x - V / m) < Math.abs(x - m / V);
  };
  const we = { room: expectedWater(w, nb, 'room'), cold: expectedWater(w, nb, 'cold') };
  const de = expectedDisplacement(w, nb);
  if (inv(nb.tableB.room.density.value, we.room.m, we.room.V) || inv(C.density.value, de.mNet, de.dV) || inv(D.density.value, ge.mNet, ge.V)) out.push('nb:density_inverted');
  // E060: suma lineal de incertidumbres relativas (en vez de cuadrática) en el cilindro.
  const uRhoD = parseNum(D.density.uncertainty);
  const linear = ge.rho * (ge.um / ge.mNet + ge.uV / ge.V);
  if (Number.isFinite(uRhoD) && near(uRhoD, linear, 0.03) && !near(linear, ge.urho, 0.05)) out.push('nb:uncertainty_sum_linear');
  // E061: sin el factor 2 del diámetro en u(V).
  const uVTyped = parseNum(D.volume.uncertainty);
  const noPower = ge.V * Math.hypot(u.caliper / ge.dMean, u.caliper / ge.hMean);
  if (Number.isFinite(uVTyped) && near(uVTyped, noPower, 0.03) && !near(noPower, uncertaintyCylinderVolume(ge.dMean, u.caliper, ge.hMean, u.caliper), 0.05)) out.push('nb:volume_uncertainty_power');
  // E062: incertidumbre relativa escrita como absoluta (o al revés).
  const rel = (urho: string, rho: number, uabs: number) => isNum(urho) && Number.isFinite(rho) && near(parseNum(urho), uabs / rho, 0.05) && !near(uabs / rho, uabs, 0.05);
  if (rel(nb.tableB.room.density.uncertainty, we.room.rho, we.room.urho) || rel(D.density.uncertainty, ge.rho, ge.urho)) out.push('nb:absolute_relative_uncertainty');
  // E063: más cifras de las que permiten las lecturas.
  const tooMany = (s: string, max: number) => isNum(s) && decimalsOf(s) > max;
  if (tooMany(nb.tableB.room.density.value, 5) || tooMany(nb.tableB.cold.density.value, 5) || tooMany(C.density.value, 3) || tooMany(D.density.value, 4)) out.push('nb:invalid_significant_figures');
  // E064: densidad de tabla escrita como «medida».
  const subst = (s: string, ref: number, exp: number) => isNum(s) && Math.abs(parseNum(s) - ref) < ref * 0.001 && Number.isFinite(exp) && Math.abs(exp - ref) > ref * 0.02;
  if (subst(C.density.value, w.params.nailsReferenceDensityGPerMl, de.rho) || subst(D.density.value, w.params.cylinderMaterialDensityGPerMl, ge.rho)) out.push('nb:substituted_theoretical_density');
  return [...new Set(out)];
}

/** Fracción de los datos obligatorios importados desde lecturas (trazabilidad, §12.1). */
export function importedFraction(nb: P01Notebook): number {
  const cells = [nb.tableB.room.mass, nb.tableB.cold.mass, nb.tableB.room.temp, nb.tableB.cold.temp, ...IMPORT_C.map((r) => nb.tableC[r]), ...IMPORT_D.map((r) => nb.tableD[r])];
  return cells.filter((c) => !!c.readingId).length / cells.length;
}

export function evaluateP01(w: P01World, nb: P01Notebook): Evaluation {
  const flags = p01StageEvidence(w, nb);
  const issues = notebookIssues(w, nb);
  const has = (k: string) => issues.includes(`nb:${k}`);
  const accident = n(w, 'err:filler_contaminated') > 0 || n(w, 'err:mouth_pipetting') > 0;
  const ppeErrs = ['ppe_goggles', 'ppe_coat', 'ppe_shoes', 'hair_untied'].reduce((s, k) => s + n(w, `err:${k}`), 0);

  const safety = accident
    ? [item('p01.accident', false, 10, 'p01fb.accident')]
    : [
      item('p01.ppe', flags.ppeReady && ppeErrs === 0, 3, 'p01fb.ppe', undefined, flags.ppeReady ? 0.5 : 0),
      item('p01.glass', !n(w, 'err:damaged_glass'), 2, 'p01fb.damaged_glass'),
      item('p01.clutter', !n(w, 'err:workbench_clutter'), 1, 'p01fb.workbench_clutter'),
      item('p01.spills', !n(w, 'err:cylinder_overflow') && !n(w, 'err:wet_balance_pan') && w.fluids.benchSpill.waterG < 0.5, 2, 'p01fb.spills'),
      item('p01.sharp', !n(w, 'warn:sharpHand'), 1, 'p01fb.sharp'),
      item('p01.panClean', w.balance.panWetG < 0.005, 1, 'p01fb.wet_balance_pan'),
    ];

  const importedF = importedFraction(nb);
  const instruments = [
    item('p01.identified', flags.identifiedInstruments, 2, 'p01fb.identified'),
    item('p01.scaleCompared', flags.scaleCompared, 2, 'p01fb.scaleCompared'),
    item('p01.balanceChecked', flags.balanceChecked, 2, 'p01fb.balanceChecked'),
    item('p01.tare', !n(w, 'err:tara_missing') && !n(w, 'err:tara_with_extra_load') && !n(w, 'err:balance_zero_bias_ignored') && !n(w, 'err:balance_unleveled'), 3, 'p01fb.tare'),
    item('p01.stable', !n(w, 'err:mass_unstable') && !n(w, 'err:load_removed_early'), 2, 'p01fb.mass_unstable'),
    item('p01.meniscus', !n(w, 'err:cylinder_parallax') && !n(w, 'err:pipette_parallax') && !n(w, 'err:cylinder_not_vertical'), 2, 'p01fb.meniscus'),
    item('p01.traceable', importedF >= 0.9 ? true : importedF >= 0.5 ? null : false, 2, 'p01fb.traceable', { pct: Math.round(importedF * 100) }, importedF),
  ];

  const we = { room: expectedWater(w, nb, 'room'), cold: expectedWater(w, nb, 'cold') };
  const B = nb.tableB;
  const sr = { room: sampleReadings(w, 'room'), cold: sampleReadings(w, 'cold') };
  const pipErr = ['pipette_air_aspiration', 'pipette_bubble', 'pipette_overfill', 'pipette_underfill', 'pipette_not_vertical', 'pipette_tip_wicked', 'pipette_blowout', 'pipette_drain_early', 'pour_off_target', 'receiving_flask_wet', 'cross_sample_residue'].filter((k) => n(w, `err:${k}`) > 0);
  const tempErr = ['cold_sample_warmed', 'thermometer_unstable', 'thermometer_wall_contact', 'thermometer_shallow', 'bath_not_ready'].filter((k) => n(w, `err:${k}`) > 0);
  const water = [
    item('p01.roomSample', flags.waterAmbientSampled && !!sr.room.mass, 2, 'p01fb.roomSample'),
    item('p01.coldSample', flags.waterColdSampled && !!sr.cold.mass, 3, 'p01fb.coldSample'),
    item('p01.temps', flags.twoThermometerReadings, 2, 'p01fb.temps'),
    item('p01.pipetteTechnique', flags.waterAmbientSampled && pipErr.length === 0, 4, `p01fb.${pipErr[0] ?? 'pipetteTechnique'}`),
    item('p01.thermoTechnique', flags.twoThermometerReadings && tempErr.length === 0, 2, `p01fb.${tempErr[0] ?? 'thermoTechnique'}`),
    item('p01.rhoRoom', close(B.room.density.value, we.room.rho, 0.0008), 3, 'p01fb.rhoRoom', { rho: Number.isFinite(we.room.rho) ? we.room.rho.toFixed(4) : '—' }),
    item('p01.rhoCold', close(B.cold.density.value, we.cold.rho, 0.0008), 3, 'p01fb.rhoCold', { rho: Number.isFinite(we.cold.rho) ? we.cold.rho.toFixed(4) : '—' }),
    item('p01.labels', !has('water_labels_swapped'), 1, 'p01fb.water_labels_swapped'),
  ];

  const de = expectedDisplacement(w, nb);
  const C = nb.tableC;
  const nm = nailMassReadings(w);
  const dispErr = ['nails_splash', 'trapped_air', 'nails_partially_submerged', 'initial_read_too_late', 'nails_mass_mismatch', 'meniscus_unstable'].filter((k) => n(w, `err:${k}`) > 0);
  const displacement = [
    item('p01.nailsMass', !!nm.boat && !!nm.boatNails && close(C.netMass.value, de.mNet, 0, 0.011) && !has('combined_mass_as_solid'), 3, 'p01fb.nailsMass'),
    item('p01.levels', flags.initialLevelRead && flags.finalLevelRead, 2, 'p01fb.levels'),
    item('p01.dV', close(C.dV.value, de.dV, 0, 0.051) && !has('final_volume_as_displacement') && !has('negative_displacement'), 3, `p01fb.${has('negative_displacement') ? 'negative_displacement' : has('final_volume_as_displacement') ? 'final_volume_as_displacement' : 'dV'}`),
    item('p01.rhoNails', close(C.density.value, de.rho, 0.01), 3, 'p01fb.rhoNails', { rho: Number.isFinite(de.rho) ? de.rho.toFixed(2) : '—' }),
    item('p01.immersion', flags.nailsSubmerged && dispErr.length === 0, 3, `p01fb.${dispErr[0] ?? 'immersion'}`),
    item('p01.errorC', close(nb.errorC, de.errPct, 0.05, 0.3) && nb.referenceC.trim().length > 3, 1, 'p01fb.errorC'),
  ];

  const ge = expectedGeometry(w, nb);
  const D = nb.tableD;
  const cm = cylinderMassReadings(w);
  const geoErr = ['caliper_oblique', 'caliper_zero_bias', 'caliper_excess_force', 'caliper_height_misaligned'].filter((k) => n(w, `err:${k}`) > 0);
  const geometry = [
    item('p01.cylMass', !!cm.glass && !!cm.total && close(D.netMass.value, ge.mNet, 0, 0.011) && !has('combined_mass_as_solid'), 3, 'p01fb.cylMass'),
    item('p01.repeats', flags.caliperDiameterRepeats && flags.caliperHeightRepeats && !has('duplicate_dimension_reading'), 2, 'p01fb.repeats'),
    item('p01.volume', close(D.volume.value, ge.V, 0.004) && !has('cylinder_wrong_formula') && !has('radius_diameter_swapped') && !has('length_unit_conversion'), 3, `p01fb.${['cylinder_wrong_formula', 'radius_diameter_swapped', 'length_unit_conversion'].find(has) ?? 'volume'}`),
    item('p01.rhoCyl', close(D.density.value, ge.rho, 0.004), 3, 'p01fb.rhoCyl', { rho: Number.isFinite(ge.rho) ? ge.rho.toFixed(3) : '—' }),
    item('p01.caliperTechnique', flags.caliperDiameterRepeats && geoErr.length === 0, 3, `p01fb.${geoErr[0] ?? 'caliperTechnique'}`),
    item('p01.errorD', close(nb.errorD, ge.errPct, 0.05, 0.3) && nb.referenceD.trim().length > 3, 1, 'p01fb.errorD'),
  ];

  const calcIssues = ['uncertainty_sum_linear', 'volume_uncertainty_power', 'absolute_relative_uncertainty', 'invalid_significant_figures', 'density_inverted', 'wrong_instrument_resolution', 'premature_rounding', 'substituted_theoretical_density', 'mismatched_mass_pair'].filter(has);
  const propagation = [
    item('p01.convention', nb.convention !== '', 1, 'p01fb.convention'),
    item('p01.uWater', close(B.room.density.uncertainty, we.room.urho, 0.3, 0.00015) && close(B.cold.density.uncertainty, we.cold.urho, 0.3, 0.00015), 3, 'p01fb.uWater'),
    item('p01.uNails', close(C.density.uncertainty, de.urho, 0.3), 3, 'p01fb.uNails'),
    item('p01.uVolume', close(D.volume.uncertainty, ge.uV, 0.3) && !has('volume_uncertainty_power'), 2, 'p01fb.volume_uncertainty_power'),
    item('p01.uCyl', close(D.density.uncertainty, ge.urho, 0.3) && !has('uncertainty_sum_linear') && !has('absolute_relative_uncertainty'), 3, 'p01fb.uCyl'),
    item('p01.presentation', calcIssues.length === 0, 3, `p01fb.${calcIssues[0] ?? 'presentation'}`),
  ];

  const k = answeredCount(nb);
  const srcN = [nb.sources.water, nb.sources.displacement, nb.sources.geometry].filter((s) => s.trim().length > 10).length;
  const discussion = [
    item('p01.procedure', flags.calculationsPresent ? null : false, 3, 'p01fb.procedure', undefined, flags.calculationsPresent ? 0.6 : 0),
    item('p01.sources', srcN >= 3 ? null : false, 2, 'p01fb.sources', { n: srcN }, (srcN / 3) * 0.6),
    item('p01.analysis', k >= 6 ? null : false, 4, 'p01fb.analysis', { n: k }, (k / 8) * 0.6),
    item('p01.monotonic', !has('water_monotonicity_claim'), 1, 'p01fb.water_monotonicity_claim'),
  ];

  const components = [
    finalizeComponent('safety', P01_WEIGHTS.safety, safety),
    finalizeComponent('instruments', P01_WEIGHTS.instruments, instruments),
    finalizeComponent('water', P01_WEIGHTS.water, water),
    finalizeComponent('displacement', P01_WEIGHTS.displacement, displacement),
    finalizeComponent('geometry', P01_WEIGHTS.geometry, geometry),
    finalizeComponent('propagation', P01_WEIGHTS.propagation, propagation),
    finalizeComponent('discussion', P01_WEIGHTS.discussion, discussion),
  ];
  const total = components.reduce((s, c) => s + c.weight * c.score, 0);
  const needsTeacherReview = [flags.calculationsPresent ? 'p01.procedure' : '', srcN >= 3 ? 'p01.sources' : '', k >= 6 ? 'p01.analysis' : '', answered(nb.compareText) ? 'p01.compare' : ''].filter(Boolean);
  return { components, total, needsTeacherReview };
}
