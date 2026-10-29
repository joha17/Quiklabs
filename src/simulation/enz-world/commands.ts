/**
 * Comandos de B05 (§6.4): los de B02 (microscopio, montaje húmedo de papa) más los gestos enzimáticos. Siempre HECHOS
 * del gesto (gramos que carga la espátula, rpm del mando, consigna de la perilla, inclinación de un frasco, mL que se
 * aspiran y con qué rapidez, sello del captador, vigor del agitado, profundidad de inmersión), nunca resultados
 * («disolver», «producir oxígeno», «dar positivo»). Las gotas de los goteros de B05 usan `squeezeDropper` de B01.
 */
import type { CellCommand, CellDispatchResult } from '../cell-world/commands';
import type { EnzInstrument } from './types';

export type EnzOnlyCommand =
  | { type: 'tare'; balanceId: string }
  | { type: 'scoop'; toolId: string; sourceId: string; massG: number }
  /** Sólido de la espátula, el bote o la tabla (hígado) a otro soporte o a un recipiente. */
  | { type: 'transferSolid'; fromId: string; toId: string }
  | { type: 'cutTissue'; sourceId: string; toolId: string; massG: number }
  | { type: 'mince'; toolId: string; strokes: number }
  | { type: 'insertStirBar'; barId: string; vesselId: string }
  | { type: 'removeStirBar'; barId: string }
  | { type: 'setStir'; plateId: string; rpm: number }
  | { type: 'setHeat'; plateId: string; on: boolean; setpointK?: number }
  | { type: 'startPour'; sourceId: string; targetId: string; tiltDeg: number }
  | { type: 'stopPour'; sourceId: string }
  /** `speed01`: rapidez del émbolo (una aspiración brusca arrastra aire, M05). */
  | { type: 'aspirate'; toolId: string; sourceId: string; volumeMl: number; speed01?: number }
  | { type: 'dispense'; toolId: string; targetId: string }
  | { type: 'rinseTool'; toolId: string }
  | { type: 'labelTube'; tubeId: string; label: string }
  | { type: 'shake'; targetId: string; strength01: number }
  | { type: 'stopperTube'; tubeId: string; closed: boolean }
  /** Captador de gas: `tubeId` null lo desconecta; `seal01` es el ajuste de la unión (gesto de encaje). */
  | { type: 'setCollector'; tubeId: string | null; seal01?: number }
  | { type: 'setStopcock'; open: boolean }
  | { type: 'resetCollector' }
  /** Pinza de tubos: lleva un tubo a un baño (con la profundidad del gesto) o a su gradilla. */
  | { type: 'tongs'; tubeId: string; to: string; depth01?: number }
  | { type: 'setBath'; bathId: string; on?: boolean; setpointK?: number }
  /** Tira de pH: nueva de la caja o (`reuse`) la misma que ya está en la mano. */
  | { type: 'dipStrip'; targetId: string; reuse?: boolean }
  | { type: 'clock'; clockId: string; action: 'start' | 'stop' | 'reset' }
  /** `eyeDeg`: ángulo del ojo sobre el menisco (0 = a su altura; lo calcula la cámara). */
  | { type: 'readInstrument'; instrument: EnzInstrument; targetId: string; eyeDeg?: number }
  | { type: 'discardLiquid'; vesselId: string; wasteId: string }
  | { type: 'rinseVessel'; vesselId: string }
  | { type: 'setUVBlank'; cuvetteId: string }
  | { type: 'setBurner'; on: boolean }
  /** El alumno pide acelerar el tiempo (la aplicación lo consulta antes de cambiar la escala). */
  | { type: 'requestTimeScale'; x: number };

export type EnzCommand = CellCommand | EnzOnlyCommand;
export type EnzDispatchResult = CellDispatchResult;

export const ENZ_ONLY_TYPES = new Set<EnzCommand['type']>([
  'tare', 'scoop', 'transferSolid', 'cutTissue', 'mince', 'insertStirBar', 'removeStirBar', 'setStir', 'setHeat', 'startPour', 'stopPour', 'aspirate',
  'dispense', 'rinseTool', 'labelTube', 'shake', 'stopperTube', 'setCollector', 'setStopcock', 'resetCollector', 'tongs', 'setBath', 'dipStrip', 'clock',
  'readInstrument', 'discardLiquid', 'rinseVessel', 'setUVBlank', 'setBurner', 'requestTimeScale',
]);

/** Comandos de alta frecuencia fuera de la bitácora humana (sí en la cinta). */
export const UNLOGGED_ENZ_COMMANDS = new Set<EnzCommand['type']>(['setPose', 'setStageXY', 'turnCoarse', 'turnFine', 'setStereoFocus', 'setCoverTilt', 'gesture']);
