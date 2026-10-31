/**
 * Escenarios docentes S01–S22 (§10) y catálogo E01–E64 + I01 de §9 con códigos propios MIC-NN (decisión B07-1: E01…
 * chocaría con el catálogo de B01 que hereda el mundo). `err` los calcula el mundo, `nb` la rúbrica sobre la libreta y la
 * incidencia `sys` nunca descuenta.
 */
import { SC_B07 } from '../../simulation/micro-world/world';

export type B07Scenario = (typeof SC_B07)[keyof typeof SC_B07];
const S = SC_B07;
const X: Partial<Record<B07Scenario, B07Scenario[]>> = {
  [S.PIGMENTED]: [S.CONFLUENT, S.ISOLATED, S.MIXED, S.INCOMPATIBLE],
  [S.CONFLUENT]: [S.PIGMENTED, S.ISOLATED, S.MIXED, S.INCOMPATIBLE],
  [S.ISOLATED]: [S.PIGMENTED, S.CONFLUENT, S.MIXED, S.INCOMPATIBLE],
  [S.MIXED]: [S.PIGMENTED, S.CONFLUENT, S.ISOLATED, S.INCOMPATIBLE],
  [S.INCOMPATIBLE]: [S.PIGMENTED, S.CONFLUENT, S.ISOLATED, S.MIXED],
  [S.BROTH_TURBID]: [S.BROTH_CLEAR],
  [S.BROTH_CLEAR]: [S.BROTH_TURBID],
  [S.ONLY_40X]: [S.IMMERSION],
  [S.IMMERSION]: [S.ONLY_40X],
};
export const B07_SCENARIOS: Array<{ id: B07Scenario; excludes?: B07Scenario[] }> = (Object.values(S) as B07Scenario[]).map((id) => ({ id, excludes: X[id] }));

export function validScenariosB07(list: string[]): B07Scenario[] {
  const known = new Set<string>(B07_SCENARIOS.map((s) => s.id));
  const out: B07Scenario[] = [];
  for (const s of list) {
    if (!known.has(s) || out.includes(s as B07Scenario)) continue;
    if (out.some((o) => X[o]?.includes(s as B07Scenario))) continue;
    out.push(s as B07Scenario);
  }
  return out;
}

export interface SimulatedErrorB07 {
  code: string;
  source: string;
  group: 'media' | 'plates' | 'morpho' | 'smear' | 'gram' | 'optics' | 'interpretation' | 'safety' | 'asset';
  kind: 'err' | 'nb' | 'sys';
  detector: string;
  evidenceKey: string;
  feedbackKey: string;
}

const row = (n: number, group: SimulatedErrorB07['group'], kind: 'err' | 'nb', detector: string): SimulatedErrorB07 => {
  const code = `MIC-${String(n).padStart(2, '0')}`;
  return { code, source: `E${String(n).padStart(2, '0')}`, group, kind, detector, evidenceKey: `${kind}:${code}`, feedbackKey: `b07fb.${code}` };
};

export const SIMULATED_ERRORS_B07: SimulatedErrorB07[] = [
  row(1, 'media', 'nb', 'mediumConsistencyMismatch'), row(2, 'media', 'nb', 'embFunctionMismatch'), row(3, 'media', 'nb', 'selectionDifferentiationSwap'), row(4, 'media', 'nb', 'sterilityOverclaim'),
  row(5, 'media', 'err', 'mediaTraceabilityMissing'), row(6, 'media', 'err', 'mediumLabelSwap'), row(7, 'media', 'nb', 'unsupportedComposition'), row(8, 'media', 'nb', 'wrongMatrixInference'),
  row(9, 'plates', 'err', 'wrongPlateSelected'), row(10, 'plates', 'err', 'streakOverlap'), row(11, 'plates', 'nb', 'methodComparisonMissing'), row(12, 'plates', 'nb', 'confoundedMediaComparison'),
  row(13, 'plates', 'err', 'controlPlateUnseen'), row(14, 'plates', 'nb', 'colonyDescriptorSwap'), row(15, 'plates', 'nb', 'unsupportedColor'), row(16, 'plates', 'nb', 'speciesOverclaim'),
  row(17, 'morpho', 'err', 'measurementWithoutScale'), row(18, 'morpho', 'nb', 'unitMismatch'), row(19, 'morpho', 'err', 'mergedColonyMeasurement'), row(20, 'morpho', 'nb', 'unreliableBorder'),
  row(21, 'morpho', 'err', 'cropCalibrationMismatch'), row(22, 'morpho', 'nb', 'precisionOverclaim'), row(23, 'morpho', 'nb', 'regionUnidentified'), row(24, 'morpho', 'nb', 'cfuSingleCellFallacy'),
  row(25, 'smear', 'err', 'smearTooThick'), row(26, 'smear', 'err', 'smearUnderCoverage'), row(27, 'smear', 'err', 'regionPlateMismatch'), row(28, 'smear', 'err', 'mixedSmear'),
  row(29, 'smear', 'err', 'brokenGlassAttempt'), row(30, 'smear', 'err', 'stainWithoutRack'), row(31, 'smear', 'err', 'fixedSlideMisused'), row(32, 'smear', 'err', 'prematureDryingClaim'),
  row(33, 'gram', 'err', 'primaryMissing'), row(34, 'gram', 'err', 'mordantMissing'), row(35, 'gram', 'err', 'decolorizationMissing'), row(36, 'gram', 'err', 'overDecolorization'),
  row(37, 'gram', 'err', 'counterstainMissing'), row(38, 'gram', 'err', 'stainOrderInvalid'), row(39, 'gram', 'err', 'stainWashOmitted'), row(40, 'gram', 'nb', 'mixedSmearMisread'),
  row(41, 'optics', 'err', 'slideClampClosed'), row(42, 'optics', 'err', 'highPowerFirst'), row(43, 'optics', 'err', 'objectiveCrash'), row(44, 'optics', 'err', 'immersionOilMissing'),
  row(45, 'optics', 'err', 'oilOnDryObjective'), row(46, 'optics', 'err', 'regionOutOfView'), row(47, 'optics', 'err', 'overillumination'), row(48, 'optics', 'err', 'immersionCleanupMissing'),
  row(49, 'interpretation', 'nb', 'gramSpeciesOverclaim'), row(50, 'interpretation', 'nb', 'negativeStainConfusion'), row(51, 'interpretation', 'nb', 'cellShapeMismatch'), row(52, 'interpretation', 'nb', 'unresolvableStructure'),
  row(53, 'interpretation', 'err', 'wrongSpecimenAsset'), row(54, 'interpretation', 'nb', 'ambiguousOverclaim'), row(55, 'interpretation', 'nb', 'gramControlsMissing'), row(56, 'interpretation', 'err', 'foreignMeasurement'),
  row(57, 'safety', 'err', 'ppeMissing'), row(58, 'safety', 'err', 'restrictedPlateOpen'), row(59, 'safety', 'err', 'unauthorizedFlame'), row(60, 'safety', 'err', 'oilySlideReturn'),
  row(61, 'safety', 'err', 'sharpsWrongWaste'), row(62, 'safety', 'err', 'resumeHeldObject'), row(63, 'safety', 'err', 'assetScopeDenied'), row(64, 'safety', 'err', 'unreturnedPlate'),
  { code: 'I01', source: 'I01', group: 'asset', kind: 'sys', detector: 'assetNotAvailable', evidenceKey: 'asset:unavailable', feedbackKey: 'b07fb.I01' },
];
