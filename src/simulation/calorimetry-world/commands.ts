/**
 * Comandos de la Práctica 6. La escena solo informa hechos (poses, inclinación, altura de caída, posición del ojo);
 * el dominio decide las consecuencias.
 */
import type { Pose } from './types';
import type { BombProfile, FoodId } from '../calorimetry/materials';

export type P6Command =
  | { type: 'confirmPpe' }
  | { type: 'setPose'; id: string; pose: Pose; support?: string }
  | { type: 'inspect'; target: string }
  // Balanza
  | { type: 'setRider'; beam: 0 | 1 | 2; valueG: number }
  | { type: 'turnZeroScrew'; deltaG: number }
  | { type: 'levelBalance' }
  | { type: 'readBalance' }
  | { type: 'shieldDraft'; on: boolean }
  // Agua
  | { type: 'setPour'; sourceId: string; targetId: string | null; tiltDeg: number }
  | { type: 'stopPour'; sourceId: string }
  | { type: 'squeeze'; targetId: string | null; drops: number }
  | { type: 'readCylinder'; eyeDzCm: number }
  | { type: 'dry'; id: string }
  // Metal
  | { type: 'pickPiece'; from: string }
  | { type: 'dropPiece'; to: string }
  | { type: 'pourMetal'; tubeId: string; targetId: string | null; dropHeightCm: number; offsetCm: number }
  | { type: 'emptyCup' }
  // Baño y plantilla
  | { type: 'setPlate'; knob: number }
  | { type: 'setTubeDepth'; tubeId: string; bottomAboveFloorCm: number }
  // Calorímetro y termómetros
  | { type: 'setLid'; closed: boolean }
  | { type: 'stir'; intensity: number }
  | { type: 'setThermoDepth'; id: string; depth: number }
  | { type: 'readThermometer'; id: string; peak?: boolean }
  | { type: 'touchHot'; id: string }
  // Bomba calorimétrica (§20)
  | { type: 'bomb'; cmd: BombCommand }
  | { type: 'stopwatch'; action: 'START' | 'STOP' | 'RESET' }
  | { type: 'acknowledge' }
  | { type: 'teacherStop'; on: boolean };

export type BombCommand =
  | { type: 'selectProfile'; profile: BombProfile['id'] }
  | { type: 'inspect'; part: 'vessel' | 'seal' | 'electrodes' | 'valve' }
  | { type: 'loadCalibration' }
  | { type: 'selectFood'; food: FoodId }
  | { type: 'weighSample'; amount: 'small' | 'target' | 'large' }
  | { type: 'placeSample' }
  | { type: 'connectWire'; lengthCm: number; contact: 'OK' | 'NO_TOUCH' | 'CRUCIBLE' }
  | { type: 'seal' }
  | { type: 'leakTest' }
  | { type: 'pressurize'; deltaAtm: number }
  | { type: 'fillBucket'; waterG: number }
  | { type: 'submerge' }
  | { type: 'closeLid' }
  | { type: 'arm' }
  | { type: 'ignite' }
  | { type: 'depressurize' }
  | { type: 'open' }
  | { type: 'abort' };

export type P6DispatchResult = { ok: boolean; code?: string; id?: string; value?: number };

/** Comandos que no se registran en la bitácora (§28.2). */
export const UNLOGGED_P6_COMMANDS = new Set<P6Command['type']>(['setPose']);
