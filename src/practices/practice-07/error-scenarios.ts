/**
 * Escenarios docentes (§10) y catálogo de los 60 errores simulables L01–L60 (§9) con su contrato de causalidad
 * (§9.7): grupo, clave de evidencia, retroalimentación, severidad, si se recupera y qué ítems de la rúbrica afecta.
 * Los `err:*` cambian una condición real del mundo o bloquean la acción; los `nb:*` solo cambian el resultado académico.
 */
import { S } from '../../simulation/bonding-world/world';

export type P07Scenario = (typeof S)[keyof typeof S];

export interface P07ScenarioSpec {
  id: P07Scenario;
  /** Escenarios incompatibles entre sí (§10, combinaciones). */
  excludes?: P07Scenario[];
}

export const P07_SCENARIOS: P07ScenarioSpec[] = [
  { id: S.STANDARD },
  { id: S.PROBE_NOT_RINSED },
  { id: S.BALANCE_OFFSET },
  { id: S.DRY_IONIC_CRYSTAL, excludes: [S.HUMID_CRYSTAL] },
  { id: S.HUMID_CRYSTAL, excludes: [S.DRY_IONIC_CRYSTAL] },
  { id: S.OXIDIZED_ALUMINUM },
  { id: S.WEAK_ACID, excludes: [S.UNKNOWNS_BLINDED] },
  { id: S.GRAPHITE_SAMPLE },
  { id: S.SOLUBILITY_LIMIT },
  { id: S.UNKNOWNS_BLINDED, excludes: [S.WEAK_ACID] },
  { id: S.WRONG_RANGE },
  { id: S.SUGAR_WITH_SALT },
  { id: S.MULTIPHASE },
  { id: S.COMMERCIAL_SOLVENT },
  { id: S.PROBE_TEMPERATURE },
  { id: S.UNVERIFIED_ALLOY },
];

/** Quita escenarios incompatibles (gana el primero de la lista). */
export function validScenarios(list: string[]): P07Scenario[] {
  const out: P07Scenario[] = [];
  for (const id of list) {
    const spec = P07_SCENARIOS.find((s) => s.id === id);
    if (!spec || out.includes(spec.id)) continue;
    if (out.some((o) => P07_SCENARIOS.find((s) => s.id === o)?.excludes?.includes(spec.id))) continue;
    out.push(spec.id);
  }
  return out;
}

export type ErrorGroup = 'SAFETY' | 'DOSING' | 'DETECTOR' | 'METER' | 'CONCENTRATION' | 'REPORT';

export interface SimulatedError07 {
  code: string;
  group: ErrorGroup;
  /** `err:*` (mundo) o `nb:*` (libreta). */
  evidenceKey: string;
  feedbackKey: string;
  severity: 'info' | 'warn' | 'danger' | 'critical';
  recoverable: boolean;
  /** Prevención con bloqueo (no es un accidente consumado, §9.7). */
  preventive?: boolean;
  affectedRubricItems: string[];
  testCaseId: string;
}

const e = (n: number, group: ErrorGroup, evidenceKey: string, severity: SimulatedError07['severity'], affected: string[], extra: Partial<SimulatedError07> = {}): SimulatedError07 => {
  const code = `L${String(n).padStart(2, '0')}`;
  return { code, group, evidenceKey, feedbackKey: `p7fb.${evidenceKey.split(':')[1]}`, severity, recoverable: true, affectedRubricItems: affected, testCaseId: `error-${code}`, ...extra };
};

export const SIMULATED_ERRORS_P07: SimulatedError07[] = [
  // §9.1 Preparación y seguridad
  e(1, 'SAFETY', 'err:no_goggles', 'danger', ['p7.ppe'], { preventive: true }),
  e(2, 'SAFETY', 'err:no_coat', 'danger', ['p7.ppe'], { preventive: true }),
  e(3, 'SAFETY', 'err:incompatible_gloves', 'danger', ['p7.ppe'], { preventive: true }),
  e(4, 'SAFETY', 'err:unknown_standard', 'warn', ['p7.calibration']),
  e(5, 'SAFETY', 'err:unverified_detector', 'warn', ['p7.detectorControl']),
  e(6, 'SAFETY', 'err:sample_identity_unverified', 'warn', ['p7.traceable']),
  e(7, 'SAFETY', 'err:waste_crossmix', 'warn', ['p7.waste']),
  e(8, 'SAFETY', 'err:solvent_uncapped', 'danger', ['p7.waste']),
  e(9, 'SAFETY', 'err:wet_electrics', 'critical', ['p7.electrics'], { preventive: true }),
  e(10, 'SAFETY', 'err:restricted_sample', 'critical', ['p7.restricted'], { preventive: true }),
  // §9.2 Dosificación y disolventes
  e(11, 'DOSING', 'err:cross_contaminated_tube', 'warn', ['p7.pairsClean']),
  e(12, 'DOSING', 'err:volume_mismatch', 'warn', ['p7.pairVolumes']),
  e(13, 'DOSING', 'err:container_overfill', 'warn', ['p7.spills']),
  e(14, 'DOSING', 'err:ionic_carryover', 'warn', ['p7.pairsClean', 'p7.kappaContrast']),
  e(15, 'DOSING', 'err:untared_balance', 'warn', ['p7.masses']),
  e(16, 'DOSING', 'err:mixing_spill', 'warn', ['p7.spills']),
  e(17, 'DOSING', 'err:premature_solubility_call', 'warn', ['p7.equilibrium']),
  e(18, 'DOSING', 'err:wrong_solvent', 'warn', ['p7.pairsClean']),
  e(19, 'DOSING', 'err:solubility_exceeded', 'info', ['p7.equilibrium']),
  e(20, 'DOSING', 'err:apolar_carryover', 'warn', ['p7.pairsClean']),
  // §9.3 Detector de sólidos
  e(21, 'DETECTOR', 'err:single_contact', 'warn', ['p7.contacts']),
  e(22, 'DETECTOR', 'err:electrode_short', 'warn', ['p7.contacts']),
  e(23, 'DETECTOR', 'err:different_specimens', 'warn', ['p7.contacts']),
  e(24, 'DETECTOR', 'err:oxidized_contact', 'info', ['p7.contacts']),
  e(25, 'DETECTOR', 'err:electrode_gap', 'warn', ['p7.contacts']),
  e(26, 'DETECTOR', 'err:wet_salt_surface', 'warn', ['p7.drySalt']),
  e(27, 'DETECTOR', 'err:detector_out_of_range', 'warn', ['p7.contacts']),
  e(28, 'DETECTOR', 'err:unstable_contact', 'warn', ['p7.contacts']),
  e(29, 'DETECTOR', 'err:graphite_orientation_unchecked', 'info', ['p7.graphite']),
  e(30, 'DETECTOR', 'err:failed_control_circuit', 'warn', ['p7.detectorControl']),
  // §9.4 Conductímetro
  e(31, 'METER', 'err:probe_too_shallow', 'warn', ['p7.kappaTechnique']),
  e(32, 'METER', 'err:probe_bottom_contact', 'warn', ['p7.kappaTechnique']),
  e(33, 'METER', 'err:probe_contamination', 'warn', ['p7.rinse']),
  e(34, 'METER', 'err:wrong_calibration_standard', 'warn', ['p7.calibration']),
  e(35, 'METER', 'nb:conductivity_unit_factor', 'warn', ['p7.units']),
  e(36, 'METER', 'err:conductivity_not_stable', 'warn', ['p7.kappaTechnique']),
  e(37, 'METER', 'err:conductivity_over_range', 'warn', ['p7.kappaTechnique']),
  e(38, 'METER', 'err:colored_solution_carryover', 'warn', ['p7.rinse']),
  e(39, 'METER', 'err:instrument_misuse', 'warn', ['p7.kappaTechnique', 'p7.contacts']),
  e(40, 'METER', 'err:temperature_uncompensated', 'warn', ['p7.kappaTechnique']),
  // §9.5 Concentraciones e incógnitas
  e(41, 'CONCENTRATION', 'nb:ideal_mass_used', 'warn', ['p7.concentration']),
  e(42, 'CONCENTRATION', 'err:added_instead_of_final_volume', 'warn', ['p7.dilution']),
  e(43, 'CONCENTRATION', 'err:aliquot_unmixed', 'warn', ['p7.dilution']),
  e(44, 'CONCENTRATION', 'nb:undissolved_counted', 'warn', ['p7.concentration']),
  e(45, 'CONCENTRATION', 'nb:color_only_evidence', 'warn', ['p7.unknownEvidence']),
  e(46, 'CONCENTRATION', 'nb:graphite_misclassified', 'warn', ['p7.graphite', 'p7.unknownClass']),
  e(47, 'CONCENTRATION', 'nb:weak_acid_misclassified', 'warn', ['p7.weakAcid']),
  e(48, 'CONCENTRATION', 'nb:kinetic_confused_as_equilibrium', 'warn', ['p7.equilibrium']),
  e(49, 'CONCENTRATION', 'nb:unknown_underidentified', 'warn', ['p7.unknownEvidence']),
  e(50, 'CONCENTRATION', 'nb:two_phases_ignored', 'warn', ['p7.pairInterpretation']),
  // §9.6 Reporte y modelos conceptuales
  e(51, 'REPORT', 'nb:bond_vs_molecule_polarity', 'warn', ['p7.concepts']),
  e(52, 'REPORT', 'nb:fixed_ions_assumed_mobile', 'warn', ['p7.concepts']),
  e(53, 'REPORT', 'nb:sugar_assumed_electrolyte', 'warn', ['p7.concepts']),
  e(54, 'REPORT', 'nb:solubility_overgeneralization', 'warn', ['p7.concepts']),
  e(55, 'REPORT', 'nb:fabricated_experimental_plot', 'warn', ['p7.traceable']),
  e(56, 'REPORT', 'nb:grams_as_moles', 'warn', ['p7.concentration']),
  e(57, 'REPORT', 'nb:si_to_ms_cm_error', 'warn', ['p7.units']),
  e(58, 'REPORT', 'nb:temperature_unit_error', 'warn', ['p7.units']),
  e(59, 'REPORT', 'nb:unjustified_precision', 'warn', ['p7.units']),
  e(60, 'REPORT', 'nb:unjustified_absolute_claim', 'warn', ['p7.argument']),
];
