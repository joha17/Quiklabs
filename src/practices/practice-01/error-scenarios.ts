/**
 * Escenarios docentes (§10) y catálogo de errores simulables (§9): 64 códigos P01-E001…E064. Cada código tiene su
 * evidencia en el mundo (`err:<código>`) o en la libreta (`nb:<código>`) y su retroalimentación `p01fb.<código>`.
 */
import { S } from '../../simulation/density-world/world';

export type P01Scenario = (typeof S)[keyof typeof S];

export const P01_SCENARIOS: P01Scenario[] = Object.values(S);

export interface SimulatedError01 {
  code: string;
  group: 'SAFETY' | 'MASS' | 'PIPETTE' | 'TEMP' | 'DISPLACEMENT' | 'GEOMETRY' | 'CALC';
  /** `err:<x>` (mundo) o `nb:<x>` (libreta); la parte <x> es también la clave de retroalimentación. */
  evidence: string;
  /** Afecta la seguridad (bloqueo real o riesgo), aunque no cambie una cifra. */
  safety?: boolean;
}

const e = (n: number, group: SimulatedError01['group'], evidence: string, safety = false): SimulatedError01 => ({
  code: `P01-E${String(n).padStart(3, '0')}`, group, evidence, safety,
});

export const SIMULATED_ERRORS_P01: SimulatedError01[] = [
  // §9.1 Preparación, seguridad y reconocimiento
  e(1, 'SAFETY', 'err:ppe_goggles', true),
  e(2, 'SAFETY', 'err:ppe_coat', true),
  e(3, 'SAFETY', 'err:ppe_shoes', true),
  e(4, 'SAFETY', 'err:hair_untied', true),
  e(5, 'SAFETY', 'err:workbench_clutter'),
  e(6, 'SAFETY', 'err:damaged_glass', true),
  e(7, 'MASS', 'err:erlenmeyer_as_volumetric'),
  e(8, 'CALC', 'nb:wrong_instrument_resolution'),
  // §9.2 Masa, tara y estabilidad
  e(9, 'MASS', 'err:balance_unleveled'),
  e(10, 'MASS', 'err:mass_unstable'),
  e(11, 'MASS', 'err:tara_missing'),
  e(12, 'MASS', 'err:tara_with_extra_load'),
  e(13, 'MASS', 'err:wet_weigh_vessel'),
  e(14, 'MASS', 'err:wet_balance_pan'),
  e(15, 'MASS', 'err:load_removed_early'),
  e(16, 'CALC', 'nb:combined_mass_as_solid'),
  e(17, 'CALC', 'nb:mismatched_mass_pair'),
  e(18, 'MASS', 'err:balance_zero_bias_ignored'),
  // §9.3 Pipeteo y transferencia
  e(19, 'PIPETTE', 'err:pipette_air_aspiration'),
  e(20, 'PIPETTE', 'err:pipette_bubble'),
  e(21, 'PIPETTE', 'err:pipette_overfill'),
  e(22, 'PIPETTE', 'err:pipette_underfill'),
  e(23, 'PIPETTE', 'err:filler_contaminated', true),
  e(24, 'PIPETTE', 'err:pipette_not_vertical'),
  e(25, 'PIPETTE', 'err:pipette_parallax'),
  e(26, 'PIPETTE', 'err:pipette_tip_wicked'),
  e(27, 'PIPETTE', 'err:pipette_blowout'),
  e(28, 'PIPETTE', 'err:pipette_drain_early'),
  e(29, 'PIPETTE', 'err:pour_off_target'),
  e(30, 'PIPETTE', 'err:receiving_flask_wet'),
  e(31, 'PIPETTE', 'err:cross_sample_residue'),
  // §9.4 Temperatura y comparación de líquidos
  e(32, 'TEMP', 'err:cold_sample_warmed'),
  e(33, 'TEMP', 'err:thermometer_unstable'),
  e(34, 'TEMP', 'err:thermometer_wall_contact'),
  e(35, 'CALC', 'nb:water_labels_swapped'),
  e(36, 'TEMP', 'err:thermometer_shallow'),
  e(37, 'TEMP', 'err:bath_not_ready'),
  e(38, 'CALC', 'nb:water_monotonicity_claim'),
  // §9.5 Probeta, clavos y desplazamiento
  e(39, 'DISPLACEMENT', 'err:cylinder_not_vertical'),
  e(40, 'DISPLACEMENT', 'err:cylinder_parallax'),
  e(41, 'DISPLACEMENT', 'err:initial_read_too_late'),
  e(42, 'DISPLACEMENT', 'err:nails_partially_submerged'),
  e(43, 'DISPLACEMENT', 'err:nails_splash'),
  e(44, 'DISPLACEMENT', 'err:trapped_air'),
  e(45, 'DISPLACEMENT', 'err:nails_mass_mismatch'),
  e(46, 'DISPLACEMENT', 'err:meniscus_unstable'),
  e(47, 'DISPLACEMENT', 'err:cylinder_overflow', true),
  e(48, 'CALC', 'nb:final_volume_as_displacement'),
  e(49, 'CALC', 'nb:negative_displacement'),
  // §9.6 Cilindro regular y cálculo metrológico
  e(50, 'GEOMETRY', 'err:caliper_oblique'),
  e(51, 'GEOMETRY', 'err:caliper_zero_bias'),
  e(52, 'CALC', 'nb:radius_diameter_swapped'),
  e(53, 'GEOMETRY', 'err:caliper_excess_force'),
  e(54, 'GEOMETRY', 'err:caliper_height_misaligned'),
  e(55, 'CALC', 'nb:duplicate_dimension_reading'),
  e(56, 'CALC', 'nb:premature_rounding'),
  e(57, 'CALC', 'nb:cylinder_wrong_formula'),
  e(58, 'CALC', 'nb:length_unit_conversion'),
  e(59, 'CALC', 'nb:density_inverted'),
  e(60, 'CALC', 'nb:uncertainty_sum_linear'),
  e(61, 'CALC', 'nb:volume_uncertainty_power'),
  e(62, 'CALC', 'nb:absolute_relative_uncertainty'),
  e(63, 'CALC', 'nb:invalid_significant_figures'),
  e(64, 'CALC', 'nb:substituted_theoretical_density'),
];

/** Clave corta del error (sin prefijo `err:`/`nb:`): también es la clave de retroalimentación `p01fb.<clave>`. */
export const errKey = (x: SimulatedError01) => x.evidence.replace(/^(err|nb):/, '');
