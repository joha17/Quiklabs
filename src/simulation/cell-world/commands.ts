/**
 * Comandos de B02 (§6.4): los de B01 (mismos instrumentos y montaje) más los gestos de obtención de tejido. Siempre
 * HECHOS del gesto (espesor y largo del corte, distancia y presión del raspado, duración del hisopado, recorrido del
 * extendido), nunca resultados («tinción exitosa», «núcleo encontrado»).
 */
import type { B01Command, B01DispatchResult } from '../optical-world/commands';

export type CellOnlyCommand =
  | { type: 'cutSource'; sourceId: string; toolId: string; thicknessMm: number; lengthCm: number }
  | { type: 'scrape'; sourceId: string; toolId: string; distanceCm: number; pressure01: number }
  | { type: 'swab'; swabId: string; sourceId: string; durationS: number; pressure01: number }
  | { type: 'smear'; swabId: string; slideId: string; lengthCm: number; pressure01: number; dxCm: number; dyCm: number }
  | { type: 'dispose'; objectId: string; containerId: 'bioWaste' | 'trashBin' | 'glassBin' }
  | { type: 'recoverSpill'; dispenserId: string }
  | { type: 'requestVideo' };

export type CellCommand = B01Command | CellOnlyCommand;
export type CellDispatchResult = B01DispatchResult;

export const CELL_ONLY_TYPES = new Set<CellCommand['type']>(['cutSource', 'scrape', 'swab', 'smear', 'dispose', 'recoverSpill', 'requestVideo']);
