/**
 * Comandos de B06 (§6.4): los de B02 (instrumentos, montaje, frotis y gotero) más los gestos propios. Siempre HECHOS
 * (gota de aceite, punto marcado, extremos de un segmento, ficha elegida), nunca resultados («núcleo visible»,
 * «velocidad 40 µm/s»): `showNucleus`, `completeStage` o `moveEuglenaBy10um` no existen.
 */
import type { CellCommand, CellDispatchResult } from '../cell-world/commands';
import type { DivSpecimen, MarkStructure } from './types';

export type DivOnlyCommand =
  | { type: 'classifySample'; specimen: DivSpecimen; choice: 'fresh' | 'fixed' }
  | { type: 'peelEpidermis'; sourceId: string; toolId: string; thicknessMm: number; lengthCm: number }
  | { type: 'labelSlide'; slideId: string; label: string }
  | { type: 'shiftCover'; slideId: string; dxCm: number }
  | { type: 'addImmersionOil'; slideId: string; drops: number }
  | { type: 'selectObjective'; objectiveX: number }
  | { type: 'recordMotility'; slideId: string }
  | { type: 'estimateSpeed'; slideId: string }
  | { type: 'requestProtistVideo'; kind: 'euglena' | 'paramecium' }
  | { type: 'markRegion'; observationId: string; structure: MarkStructure; u: number; v: number }
  /** Extremos del segmento en píxeles de la captura (0–`imagePx` a lo ancho y alto). */
  | { type: 'measure'; observationId: string; ax: number; ay: number; bx: number; by: number; scale: 'calibration' | 'assumed' }
  | { type: 'goStation'; station: string }
  | { type: 'useLancet' }
  | { type: 'openCulture'; id: string };

export type DivCommand = CellCommand | DivOnlyCommand;
export type DivDispatchResult = CellDispatchResult;

export const DIV_ONLY_TYPES = new Set<DivCommand['type']>([
  'classifySample', 'peelEpidermis', 'labelSlide', 'shiftCover', 'addImmersionOil', 'selectObjective', 'recordMotility', 'estimateSpeed',
  'requestProtistVideo', 'markRegion', 'measure', 'goStation', 'useLancet', 'openCulture',
]);
