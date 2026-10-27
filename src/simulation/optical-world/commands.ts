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
  /** `tipContact`: la punta del gotero tocó el tejido (B02, CEL29). */
  | { type: 'squeezeDropper'; dispenserId: string; targetId: string; force01: number; dxCm: number; dyCm: number; tipContact?: boolean }
  | { type: 'grabCover'; coverId: string; toolId: string }
  | { type: 'setCoverTilt'; coverId: string; angleDeg: number }
  | { type: 'lowerCover'; coverId: string; slideId: string; speedCmS: number; dxCm: number; dyCm: number }
  | { type: 'liftCover'; slideId: string; toolId: string }
  | { type: 'pressCover'; slideId: string; force01: number }
  /** `strong`: el papel se apoya hasta absorber todo el borde (B02, CEL17). */
  | { type: 'wipe'; targetId: string; toolId: string; dxCm?: number; dyCm?: number; strong?: boolean }
  | { type: 'flipSlide'; slideId: string }
  | { type: 'cleanShards' }
  // Microscopio
  | { type: 'openClip'; open: boolean }
  | { type: 'setStageXY'; xMm: number; yMm: number }
  | { type: 'turnCoarse'; deltaTurns: number }
  | { type: 'turnFine'; deltaTurns: number }
  /** `grip`: dónde se tomó el revólver (anillo moleteado o, mal, un objetivo como palanca, E72). */
  | { type: 'turnTurret'; deltaDeg: number; grip?: 'nosepiece' | 'objective' }
  | { type: 'setPower'; device: 'microscope' | 'stereo'; on: boolean }
  | { type: 'setIllumination'; device: 'microscope' | 'stereo-incident' | 'stereo-transmitted'; value01: number }
  | { type: 'setDiaphragm'; value01: number }
  | { type: 'setCondenser'; value01: number }
  | { type: 'checkSide' }
  // Estereoscopio
  | { type: 'setStereoZoom'; zoomX: number }
  | { type: 'setStereoFocus'; deltaTurns: number }
  | { type: 'setStereoHead'; zMm: number }
  // Binocular de ambos equipos (sin `device`: el estereoscopio, como en las cintas anteriores).
  | { type: 'setInterpupillary'; valueMm: number; device?: 'microscope' | 'stereo' }
  | { type: 'setDiopter'; side: 'left' | 'right'; value: number; device?: 'microscope' | 'stereo' }
  // Caja, observación y cierre
  | { type: 'openSlideCase'; open: boolean }
  | { type: 'observe'; instrument: 'compound' | 'stereo'; open: boolean; sampleId?: string }
  | { type: 'captureObservation'; instrument: 'compound' | 'stereo' }
  | { type: 'attachObservation'; observationId: string; attemptHash: string }
  | { type: 'closeBench' }
  // Inicio y fin de un gesto continuo sobre una pieza (arrastre de una perilla, del revólver, de la platina…): las
  // consecuencias que dependen del gesto entero (E22, E34, E71, E77, E78) se miden desde su inicio.
  | { type: 'gesture'; part: string; phase: 'begin' | 'end' }
  // Control
  | { type: 'acknowledge' }
  | { type: 'pause'; on: boolean }
  | { type: 'teacherStop'; on: boolean };

export type B01DispatchResult = { ok: boolean; code?: string; id?: string; value?: number };

/** Movimientos de alta frecuencia: fuera de la bitácora humana (sí en la cinta). */
export const UNLOGGED_B01_COMMANDS = new Set<B01Command['type']>(['setPose', 'setStageXY', 'turnCoarse', 'turnFine', 'setStereoFocus', 'setCoverTilt', 'gesture']);
