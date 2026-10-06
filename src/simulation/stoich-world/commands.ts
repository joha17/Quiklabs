/**
 * Comandos de la Práctica 5. La escena solo informa hechos (poses, gestos medidos); el dominio decide consecuencias.
 */
import type { FlameCommand } from '../flame-world/commands';
import type { Pose } from './types';

export type P5Command =
  | { type: 'confirmPpe' }
  | { type: 'gas'; cmd: FlameCommand }
  | { type: 'setPose'; id: string; pose: Pose; support?: string }
  | { type: 'inspect'; target: string }
  // Balanza
  | { type: 'setRider'; beam: 0 | 1 | 2; valueG: number }
  | { type: 'turnZeroScrew'; deltaG: number }
  | { type: 'levelBalance' }
  | { type: 'readBalance' }
  | { type: 'cleanPan' }
  | { type: 'shieldDraft'; on: boolean }
  // Reactivos
  | { type: 'openBottle'; id: string; open: boolean }
  | { type: 'scoop'; spatulaId: string; bottleId: string; amount: 'tip' | 'small' | 'level' }
  | { type: 'tip'; spatulaId: string; targetId: string; fraction: number }
  | { type: 'returnToBottle'; spatulaId: string; bottleId: string }
  | { type: 'wipeSpatula'; spatulaId: string }
  | { type: 'dryTube' }
  // Mezcla
  | { type: 'tap'; strength: number }
  | { type: 'grind' }
  | { type: 'stopper'; on: boolean }
  // Montaje
  | { type: 'setClamp'; angleDeg?: number; mouthYawDeg?: number; grip?: number; heightCm?: number; gripAt?: number; nutTight?: boolean }
  | { type: 'setShield'; placed: boolean }
  // Enfriamiento y lectura
  | { type: 'measureIR' }
  | { type: 'waterOnTube' }
  | { type: 'touchTube' }
  | { type: 'cleanSpill'; spillId: string }
  | { type: 'disposeResidue' }
  | { type: 'stopwatch'; action: 'START' | 'STOP' | 'RESET' }
  | { type: 'acknowledge' }
  | { type: 'teacherStop'; on: boolean };

export type P5DispatchResult = { ok: boolean; code?: string; id?: string; value?: number };

/** Comandos que no se registran en la bitácora de acciones (§22.3). */
export const UNLOGGED_P5_COMMANDS = new Set<P5Command['type']>(['setPose', 'measureIR']);
