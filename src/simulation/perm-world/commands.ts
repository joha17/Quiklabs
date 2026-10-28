/**
 * Comandos de B03 (§6.4): los de B02 (instrumentos ópticos, montaje húmedo) más los gestos con membranas, cámaras,
 * frascos, probetas, pipeta, goteros de ensayo y tubos. Siempre HECHOS del gesto (inclinación, volumen aspirado,
 * vueltas de la abrazadera, ángulo del ojo al leer), nunca resultados («membrana instalada», «Biuret positivo»).
 */
import type { CellCommand, CellDispatchResult } from '../cell-world/commands';
import type { Side } from './types';

export type PermInstrument = 'scale' | 'eye' | 'colorimeter' | 'thermo';

export type PermOnlyCommand =
  | { type: 'insertMembrane'; membraneId: string; cellId: string; offsetCm: number }
  | { type: 'removeMembrane'; cellId: string }
  | { type: 'turnClamp'; cellId: string; deltaTurns: number }
  | { type: 'startPour'; sourceId: string; targetId: string; tiltDeg: number }
  | { type: 'stopPour'; sourceId: string }
  | { type: 'aspirate'; toolId: string; sourceId: string; volumeMl: number }
  | { type: 'dispense'; toolId: string; targetId: string }
  | { type: 'rinseTool'; toolId: string }
  | { type: 'setMixing'; cellId: string; side: Side; rate01: number }
  | { type: 'setLid'; cellId: string; closed: boolean }
  | { type: 'labelTube'; tubeId: string; label: string }
  /** `eyeDeg`: ángulo del ojo sobre el menisco (0 = a su altura; lo calcula la cámara). */
  | { type: 'readInstrument'; instrument: PermInstrument; targetId: string; eyeDeg?: number }
  | { type: 'zeroColorimeter' }
  | { type: 'disposeTube'; tubeId: string }
  | { type: 'drainCell'; cellId: string }
  /** El alumno pide acelerar el tiempo (la aplicación lo consulta antes de cambiar la escala). */
  | { type: 'requestTimeScale'; x: number }
  | { type: 'requestSeries' };

export type PermCommand = CellCommand | PermOnlyCommand;
export type PermDispatchResult = CellDispatchResult;

export const PERM_ONLY_TYPES = new Set<PermCommand['type']>([
  'insertMembrane', 'removeMembrane', 'turnClamp', 'startPour', 'stopPour', 'aspirate', 'dispense', 'rinseTool', 'setMixing', 'setLid', 'labelTube',
  'readInstrument', 'zeroColorimeter', 'disposeTube', 'drainCell', 'requestTimeScale', 'requestSeries',
]);

/** Comandos de alta frecuencia fuera de la bitácora humana (sí en la cinta). */
export const UNLOGGED_PERM_COMMANDS = new Set<PermCommand['type']>(['setPose', 'setStageXY', 'turnCoarse', 'turnFine', 'setStereoFocus', 'setCoverTilt', 'gesture']);
