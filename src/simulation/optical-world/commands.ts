/**
 * Comandos del mundo B01 (§6.4): HECHOS del gesto (poses, fuerza, ángulo, velocidad, giros de mandos), nunca
 * resultados («enfocar», «montar», «identificar»). `observe` solo informa que se mira por el ocular; `captureObservation`
 * registra lo que el estado físico permite ver, sin píxeles.
 */
import type { Pose, PpeItemB01 } from './types';

export type B01Command =
  | { type: 'setPPE'; item: PpeItemB01; enabled: boolean }
  | { type: 'startWork' }
  | { type: 'inspect'; target: string }
  | { type: 'setPose'; id: string; pose: Pose; support?: string }
  // Preparación
  | { type: 'pickSpecimen'; toolId: string; sourceId: string; pressure01?: number }
  | { type: 'placeSpecimen'; toolId: string; targetId: string; dxCm: number; dyCm: number }
  | { type: 'cutSpecimen'; slideId: string; toolId: string; keepFraction: number; pressure01: number }
  | { type: 'squeezeDropper'; dispenserId: string; targetId: string; force01: number; dxCm: number; dyCm: number }
  | { type: 'grabCover'; coverId: string; toolId: string }
  | { type: 'setCoverTilt'; coverId: string; angleDeg: number }
  | { type: 'lowerCover'; coverId: string; slideId: string; speedCmS: number; dxCm: number; dyCm: number }
  | { type: 'liftCover'; slideId: string; toolId: string }
  | { type: 'pressCover'; slideId: string; force01: number }
  | { type: 'wipe'; targetId: string; toolId: string; dxCm?: number; dyCm?: number }
  | { type: 'flipSlide'; slideId: string }
  | { type: 'cleanShards' }
  // Microscopio
  | { type: 'openClip'; open: boolean }
  | { type: 'setStageXY'; xMm: number; yMm: number }
  | { type: 'turnCoarse'; deltaTurns: number }
  | { type: 'turnFine'; deltaTurns: number }
  | { type: 'turnTurret'; deltaDeg: number }
  | { type: 'setPower'; device: 'microscope' | 'stereo'; on: boolean }
  | { type: 'setIllumination'; device: 'microscope' | 'stereo-incident' | 'stereo-transmitted'; value01: number }
  | { type: 'setDiaphragm'; value01: number }
  | { type: 'setCondenser'; value01: number }
  | { type: 'checkSide' }
  // Estereoscopio
  | { type: 'setStereoZoom'; zoomX: number }
  | { type: 'setStereoFocus'; deltaTurns: number }
  | { type: 'setStereoHead'; zMm: number }
  | { type: 'setInterpupillary'; valueMm: number }
  | { type: 'setDiopter'; side: 'left' | 'right'; value: number }
  // Caja, observación y cierre
  | { type: 'openSlideCase'; open: boolean }
  | { type: 'observe'; instrument: 'compound' | 'stereo'; open: boolean; sampleId?: string }
  | { type: 'captureObservation'; instrument: 'compound' | 'stereo' }
  | { type: 'attachObservation'; observationId: string; attemptHash: string }
  | { type: 'closeBench' }
  // Control
  | { type: 'acknowledge' }
  | { type: 'pause'; on: boolean }
  | { type: 'teacherStop'; on: boolean };

export type B01DispatchResult = { ok: boolean; code?: string; id?: string; value?: number };

/** Movimientos de alta frecuencia: fuera de la bitácora humana (sí en la cinta). */
export const UNLOGGED_B01_COMMANDS = new Set<B01Command['type']>(['setPose', 'setStageXY', 'turnCoarse', 'turnFine', 'setStereoFocus', 'setCoverTilt']);
