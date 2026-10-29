/**
 * Comandos de B04 (§6.4): los de B02 (microscopio, caja de láminas, pinza) más los gestos bioquímicos. Siempre HECHOS
 * del gesto (inclinación de un frasco, mL que se aspiran y cómo se descarga, gramos que carga la espátula, rpm del
 * mando, consigna de la perilla, profundidad de inmersión, vigor del agitado), nunca resultados («disolver», «dar
 * positivo», «producir oxígeno»).
 */
import type { CellCommand, CellDispatchResult } from '../cell-world/commands';
import type { BioInstrument } from './types';

/** Descarga de una pipeta: escurrir y tocar la pared (correcto), soplar el resto o retirar sin esperar. */
export type DispenseMode = 'drain' | 'blow' | 'quick';

export type BioOnlyCommand =
  | { type: 'tare'; balanceId: string }
  | { type: 'scoopSolid'; toolId: string; sourceId: string; massG: number }
  | { type: 'depositSolid'; toolId: string; targetId: string }
  | { type: 'emptyBoat'; targetId: string }
  | { type: 'dryTool'; toolId: string }
  | { type: 'cutTissue'; sampleId: string; toolId: string; cutSizeCm: number }
  | { type: 'addTissue'; sampleId: string; vesselId: string }
  | { type: 'insertStirBar'; barId: string; vesselId: string }
  | { type: 'retrieveStirBar'; barId: string }
  | { type: 'setStirRate'; plateId: string; rpm: number }
  | { type: 'setHotplatePower'; plateId: string; on: boolean }
  | { type: 'setHotplateSetpoint'; plateId: string; temperatureK: number }
  | { type: 'labelVessel'; vesselId: string; label: string }
  | { type: 'startPour'; sourceId: string; targetId: string; tiltDeg: number }
  | { type: 'stopPour'; sourceId: string }
  /** `speed01`: rapidez del émbolo (una aspiración brusca arrastra aire, M04). */
  | { type: 'aspirate'; toolId: string; sourceId: string; volumeMl: number; speed01?: number }
  | { type: 'dispense'; toolId: string; targetId: string; mode?: DispenseMode }
  | { type: 'rinseTool'; toolId: string }
  | { type: 'mixTube'; tubeId: string; vigor01: number; durationS: number }
  | { type: 'capTube'; tubeId: string; capped: boolean }
  /** Pinza de tubos: lleva un tubo al baño (con la profundidad del gesto) o de vuelta a una gradilla. */
  | { type: 'tongs'; tubeId: string; to: string; depth01?: number }
  | { type: 'setBathPower'; bathId: string; on: boolean }
  | { type: 'setBathSetpoint'; bathId: string; temperatureK: number }
  | { type: 'connectCollector'; tubeId: string; sealed: boolean }
  | { type: 'disconnectCollector'; tubeId: string }
  | { type: 'startTimer'; tubeId: string }
  | { type: 'usePhStrip'; vesselId: string }
  /** `eyeDeg`: ángulo del ojo sobre el menisco (0 = a su altura; lo calcula la cámara). */
  | { type: 'readInstrument'; instrument: BioInstrument; targetId: string; eyeDeg?: number }
  | { type: 'blankPhotometer'; cuvetteId: string }
  | { type: 'disposeVessel'; vesselId: string; wasteId: string }
  | { type: 'lightBurner'; on: boolean }
  /** Pedidos de recursos opcionales (módulo ADH, fotómetro): la incidencia, si la hay, no es imputable. */
  | { type: 'requestModule'; module: 'adh' | 'photometer' }
  | { type: 'requestTimeScale'; x: number };

export type BioCommand = CellCommand | BioOnlyCommand;
export type BioDispatchResult = CellDispatchResult;

export const BIO_ONLY_TYPES = new Set<BioCommand['type']>([
  'tare', 'scoopSolid', 'depositSolid', 'emptyBoat', 'dryTool', 'cutTissue', 'addTissue', 'insertStirBar', 'retrieveStirBar', 'setStirRate',
  'setHotplatePower', 'setHotplateSetpoint', 'labelVessel', 'startPour', 'stopPour', 'aspirate', 'dispense', 'rinseTool', 'mixTube', 'capTube', 'tongs',
  'setBathPower', 'setBathSetpoint', 'connectCollector', 'disconnectCollector', 'startTimer', 'usePhStrip', 'readInstrument', 'blankPhotometer',
  'disposeVessel', 'lightBurner', 'requestModule', 'requestTimeScale',
]);

/** Comandos de alta frecuencia fuera de la bitácora humana (sí en la cinta). */
export const UNLOGGED_BIO_COMMANDS = new Set<BioCommand['type']>(['setPose', 'setStageXY', 'turnCoarse', 'turnFine', 'setStereoFocus', 'setCoverTilt', 'gesture']);
