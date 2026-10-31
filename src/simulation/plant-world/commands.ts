/**
 * Comandos de B09 (§6.3): los de B06 (instrumentos, montaje, marcas, mediciones) más los gestos propios. Siempre HECHOS
 * (grados girados, plano, grosor y presión del gesto, zona señalada, área trazada), nunca resultados: no existen
 * `identifyXylem`, `stainLignin` ni `completeStage`.
 */
import type { DivCommand, DivDispatchResult } from '../div-world/commands';
import type { CutPlane, ExternalPart, PlantSpecimenId } from './types';

export type PlantOnlyCommand =
  | { type: 'rotatePlant'; specimen: PlantSpecimenId | 'branch'; deg: number }
  | { type: 'labelExternal'; specimen: PlantSpecimenId; regionId: string; part: ExternalPart }
  | { type: 'holdSource'; sourceId: string; hold: boolean }
  /** `handInPath`: la trayectoria de la hoja cruza la mano que sujeta. */
  | { type: 'cutSection'; sourceId: string; plane: CutPlane; thicknessUm: number; lengthCm: number; region: string; pressure01: number; handInPath?: boolean }
  | { type: 'rinseSection'; slideId: string; volumeMl: number }
  | { type: 'moveMicroscope'; grip: 'eyepiece' | 'armBase' }
  | { type: 'traceArea'; observationId: string; regionPx2: number; totalPx2: number }
  | { type: 'reportAssetProblem'; assetId: string; problem: 'corrupt' | 'metadata' };

export type PlantCommand = DivCommand | PlantOnlyCommand;
export type PlantDispatchResult = DivDispatchResult;

export const PLANT_ONLY_TYPES = new Set<PlantCommand['type']>(['rotatePlant', 'labelExternal', 'holdSource', 'cutSection', 'rinseSection', 'moveMicroscope', 'traceArea', 'reportAssetProblem']);
