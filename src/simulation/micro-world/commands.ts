/**
 * Comandos de B07 (§6.2): los de B06 más los gestos propios. Siempre HECHOS (trazo, cobertura, índice de decoloración,
 * dos extremos en la imagen), nunca resultados: `identifySpecies`, `setGramPositive` o `completeStage` no existen.
 */
import type { DivCommand, DivDispatchResult } from '../div-world/commands';
import type { StainPhase, Technique } from './types';

export type MicroOnlyCommand =
  | { type: 'inspectMedia'; mediaId: string }
  | { type: 'classifyMedia'; mediaId: string; consistency: string; func: string }
  | { type: 'labelMedia'; mediaId: string; label: string }
  | { type: 'commitMedia' }
  | { type: 'selectPlate'; plateId: string }
  | { type: 'openPlate'; plateId: string }
  | { type: 'attemptFlame' }
  | { type: 'cropViewer'; zoom: number }
  | { type: 'recalibrateViewer' }
  | { type: 'recordColony'; plateId: string; colonyId: string }
  /** Extremos en píxeles de la vista del visor (la escala sale de la calibración vigente). */
  | { type: 'measureColony'; plateId: string; colonyId: string | null; ax: number; ay: number; bx: number; by: number; scale: 'calibration' | 'assumed' }
  | { type: 'strokePlate'; technique: Technique; strokes: number[][][] }
  | { type: 'compareMethods' }
  | { type: 'pickColony'; plateId: string; colonyId: string }
  | { type: 'prepareVirtualSmear'; slideId: string; declaredPlateId: string; coverage01: number }
  | { type: 'markSmearDry'; slideId: string }
  | { type: 'applyStainPhase'; slideId: string; phase: StainPhase; index?: number }
  | { type: 'rinseVirtualSlide'; slideId: string }
  | { type: 'recordHypothesis'; sampleCode: string; observationId: string; interpretation: string }
  | { type: 'importMeasurement'; measurementId: string }
  | { type: 'requestAsset'; assetId: string };

export type MicroCommand = DivCommand | MicroOnlyCommand;
export type MicroDispatchResult = DivDispatchResult;

export const MICRO_ONLY_TYPES = new Set<MicroCommand['type']>([
  'inspectMedia', 'classifyMedia', 'labelMedia', 'commitMedia', 'selectPlate', 'openPlate', 'attemptFlame', 'cropViewer', 'recalibrateViewer', 'recordColony', 'measureColony',
  'strokePlate', 'compareMethods', 'pickColony', 'prepareVirtualSmear', 'markSmearDry', 'applyStainPhase', 'rinseVirtualSlide', 'recordHypothesis', 'importMeasurement', 'requestAsset',
]);
