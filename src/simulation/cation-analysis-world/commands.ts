/**
 * Comandos de la Práctica 9 (§6.1, §13). El controlador y el panel accesible transmiten HECHOS (poses, inclinación,
 * gotas, apretar la pipeta, posición de la mampara, luz local, botones de la centrífuga y del emisor). Nunca «precipitar
 * el estroncio» ni «identificar potasio»: el dominio decide (§6.1).
 */
import type { Pose } from './types';

export type PpeItem09 = 'goggles' | 'coat' | 'gloves';

export type P09Command =
  | { type: 'setPPE'; item: PpeItem09; enabled: boolean }
  | { type: 'startWork' }
  | { type: 'inspect'; target: string }
  | { type: 'setPose'; id: string; pose: Pose; support?: string }
  | { type: 'setCap'; vesselId: string; capped: boolean }
  | { type: 'setLabel'; vesselId: string; label: string }
  // Balanza
  | { type: 'powerBalance'; on: boolean }
  | { type: 'tare' }
  | { type: 'readBalance' }
  // Líquidos
  | { type: 'setPour'; sourceId: string; targetId: string | null; tiltDeg: number }
  | { type: 'stopPour'; sourceId: string }
  | { type: 'squeezeDropper'; sourceId: string; targetId: string | null; drops: number }
  | { type: 'setPipette'; squeeze01: number }
  | { type: 'squeezeWash'; targetId: string; ml: number }
  | { type: 'setStir'; vesselId: string; motion01: number }
  | { type: 'readVolume'; vesselId: string; eyeDzCm: number }
  | { type: 'dispose'; vesselId: string; targetId: string }
  // Observación de tubos
  | { type: 'readTurbidity' }
  | { type: 'observeTube'; vesselId: string }
  // Centrífuga
  | { type: 'setLid'; closed: boolean }
  | { type: 'spin'; seconds: number }
  // Campana y llama virtual
  | { type: 'setHoodFan'; on: boolean }
  | { type: 'setSash'; heightCm: number }
  | { type: 'setObservationLight'; pct: number; scope: 'local' | 'room' }
  | { type: 'setIgnition'; on: boolean }
  | { type: 'sampleEmission'; zone: 'whole' | 'core' }
  | { type: 'readSpectrum'; gain: 1 | 4 | 16 }
  | { type: 'cleanSupport'; supportId: 'loop01' | 'wgFlame' | 'cupFlame' }
  // Control
  | { type: 'cleanSpill' }
  | { type: 'acknowledge' }
  | { type: 'pause'; on: boolean }
  | { type: 'teacherStop'; on: boolean };

export type P09DispatchResult = { ok: boolean; code?: string; id?: string; value?: number };

export const UNLOGGED_P09_COMMANDS = new Set<P09Command['type']>(['setPose', 'setPipette', 'setStir', 'setPour']);
