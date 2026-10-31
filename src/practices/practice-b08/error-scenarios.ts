/**
 * Escenarios docentes S01–S28 (§10) y catálogo E01–E76 + I01–I05 de §9 con códigos propios FOT-NN (E01… chocaría con los
 * catálogos que hereda el mundo). `err` los calcula el mundo, `nb` la rúbrica sobre la libreta y `sys` nunca descuenta.
 */
import { SC_B08 } from '../../simulation/photo-world/world';

export type B08Scenario = (typeof SC_B08)[keyof typeof SC_B08];
const S = SC_B08;
const X: Partial<Record<B08Scenario, B08Scenario[]>> = {
  [S.ONLY_CHROM]: [S.ONLY_GAS_BTB],
  [S.ONLY_GAS_BTB]: [S.ONLY_CHROM],
  [S.BRIGHT]: [S.DIM],
  [S.DIM]: [S.BRIGHT],
  [S.LOW_DIC]: [S.HIGH_DIC],
  [S.HIGH_DIC]: [S.LOW_DIC],
  [S.DARK_OK]: [S.DARK_LEAK],
  [S.DARK_LEAK]: [S.DARK_OK],
  [S.OVERLAP]: [S.MANY_XANT],
  [S.MANY_XANT]: [S.OVERLAP],
};
export const B08_SCENARIOS: Array<{ id: B08Scenario; excludes?: B08Scenario[] }> = (Object.values(S) as B08Scenario[]).map((id) => ({ id, excludes: X[id] }));

export function validScenariosB08(list: string[]): B08Scenario[] {
  const known = new Set<string>(B08_SCENARIOS.map((s) => s.id));
  const out: B08Scenario[] = [];
  for (const s of list) {
    if (!known.has(s) || out.includes(s as B08Scenario)) continue;
    if (out.some((o) => X[o]?.includes(s as B08Scenario))) continue;
    out.push(s as B08Scenario);
  }
  return out;
}

export type GroupB08 = 'prep' | 'gas' | 'btb' | 'extract' | 'chrom' | 'safety' | 'notebook' | 'asset';
export interface SimulatedErrorB08 {
  code: string;
  source: string;
  group: GroupB08;
  kind: 'err' | 'nb' | 'sys';
  detector: string;
  evidenceKey: string;
  feedbackKey: string;
}

const DETECTORS = ['biomassMismatch', 'tissueDamage', 'unequalVolume', 'treatmentMislabel', 'dicUnrecorded', 'asymmetricHeatShield', 'darkLeak', 'lightDistanceMismatch', 'asymmetricMixing', 'unitLight', 'looseStopper', 'capillaryLeak', 'unaccountedBubble', 'capillaryNotLevel', 'meniscusParallax', 'missingBaseline', 'swappedCapillaryReading', 'setupLifted', 'thermalExpansion', 'prematureOpening', 'tubeOverflow', 'capillaryLiquidPlug', 'wrongRadius', 'mmAsOxygen', 'dryGasAssumption', 'btbMissingControl', 'btbUnequalDose', 'dicUnequal', 'missingNoPlant', 'indicatorLightLeak', 'btbAsGlucose', 'profileMutated', 'co2NozzleMisaligned', 'btbNoBaseline', 'btbColorMisread', 'leafMassMismatch', 'underGrinding', 'leafLoss', 'solventUnderdose', 'openShaking', 'underMixing', 'noPhaseSeparation', 'interfaceAspirated', 'photoDegradation', 'wrongSolventBottle', 'inkOrigin', 'missingOrigin', 'submergedSpot', 'largeSpot', 'wetRespot', 'paperTilt', 'openChamber', 'prematurePaperRemoval', 'frontOffPaper', 'frontNotMarked', 'bandEdgeRead', 'baseAsOrigin', 'rfAboveOne', 'colorOnlyId', 'noEyeProtection', 'solventOutsideHood', 'ignitionNearVapor', 'hoodOff', 'wrongWaste', 'lampLeftOn', 'paperLeftBehind', 'clipUnsecured', 'wrongDuration', 'grossSignError', 'missingBandConclusion', 'foreignAsset', 'unitMissing', 'dicSpecies', 'respirationAssumption', 'bandVsFront', 'assetNoScale'];
/** Los que se ven en la libreta (lo escrito contra la lectura); el resto los detecta el mundo. */
export const NB_CODES_B08 = [17, 23, 24, 25, 31, 35, 57, 58, 59, 68, 69, 70, 72, 73, 74, 75, 76];
const groupOf = (n: number): GroupB08 => (n <= 10 ? 'prep' : n <= 25 ? 'gas' : n <= 35 ? 'btb' : n <= 45 ? 'extract' : n <= 59 ? 'chrom' : n <= 67 ? 'safety' : 'notebook');

export const SIMULATED_ERRORS_B08: SimulatedErrorB08[] = [
  ...DETECTORS.map((detector, i) => {
    const n = i + 1;
    const code = `FOT-${String(n).padStart(2, '0')}`;
    const kind = NB_CODES_B08.includes(n) ? ('nb' as const) : ('err' as const);
    return { code, source: `E${String(n).padStart(2, '0')}`, group: groupOf(n), kind, detector, evidenceKey: `${kind}:${code}`, feedbackKey: `b08fb.${code}` };
  }),
  ...['missingAsset', 'assetUncalibrated', 'graphicsContextLost', 'outdatedTeacherAsset', 'missingOxygenCalibration'].map((detector, i) => ({ code: `I0${i + 1}`, source: `I0${i + 1}`, group: 'asset' as const, kind: 'sys' as const, detector, evidenceKey: `asset:${detector}`, feedbackKey: `b08fb.I0${i + 1}` })),
];
