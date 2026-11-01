/**
 * Comandos de B10: los de B06 (instrumentos, montaje, marcas, mediciones) más los del visor. Siempre HECHOS (grados girados, región
 * señalada, nombre elegido, luz movida): no existen `identifyTissue`, `solveTrack` ni `completeStage`.
 */
import type { DivCommand, DivDispatchResult } from '../div-world/commands';
import type { AnatomyPart, BeakType, FootType, SkullDiet, TrackSupport } from './catalog';
import type { MaterialClass, MaterialInstrument } from './types';

export type AnimalOnlyCommand =
  | { type: 'classifyMaterial'; materialId: string; materialClass: MaterialClass; instrument: MaterialInstrument }
  | { type: 'readSlideLabel'; slideId: string }
  | { type: 'openModel'; modelId: string | null }
  | { type: 'orientModel'; modelId: string; yawDeg: number; pitchDeg: number; zoom: number }
  | { type: 'setStudyLabels'; on: boolean }
  | { type: 'labelRegion'; modelId: string; regionId: string; part: AnatomyPart }
  | { type: 'identifyModel'; modelId: string; guess: string }
  | { type: 'answerBird'; modelId: string; beak: BeakType | null; foot: FootType | null }
  | { type: 'answerSkull'; modelId: string; taxon: string; diet: SkullDiet | '' }
  | { type: 'compareModels'; a: string; b: string | null }
  | { type: 'setTrackLight'; trackId: string; azimuthDeg: number; elevationDeg: number }
  | { type: 'answerTrack'; trackId: string; digits: number; support: TrackSupport; claws: boolean }
  | { type: 'requestVideo'; subject: string }
  | { type: 'reportAsset'; assetId: string; problem: 'missing' | 'incomplete' | 'noScale' | 'lowResolution' | 'lowRelief' };

export type AnimalCommand = DivCommand | AnimalOnlyCommand;
export type AnimalDispatchResult = DivDispatchResult;

export const ANIMAL_ONLY_TYPES = new Set<AnimalCommand['type']>(['classifyMaterial', 'readSlideLabel', 'openModel', 'orientModel', 'setStudyLabels', 'labelRegion', 'identifyModel', 'answerBird', 'answerSkull', 'compareModels', 'setTrackLight', 'answerTrack', 'requestVideo', 'reportAsset']);

/** Giro continuo del visor y luz de la huella: quedan en la cinta, no en la bitácora. */
export const UNLOGGED_ANIMAL_COMMANDS = new Set<AnimalCommand['type']>(['orientModel', 'setTrackLight']);
