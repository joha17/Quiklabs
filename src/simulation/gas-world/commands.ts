/**
 * Comandos de la Práctica 10. La escena solo informa hechos (poses, inclinación, posición del ojo, posición del
 * émbolo que lleva la mano); el dominio decide las consecuencias (§4.2).
 */
import type { Pose } from './types';

export type P10Command =
  | { type: 'confirmPpe' }
  | { type: 'setPose'; id: string; pose: Pose; support?: string }
  | { type: 'inspect'; target: string }
  // Balanza analítica (§8)
  | { type: 'levelBalance' }
  | { type: 'setDoors'; open: boolean }
  | { type: 'tare' }
  | { type: 'readBalance' }
  | { type: 'touchGlass' }
  // Sólido (§10.1)
  | { type: 'scoop'; amountG: number }
  | { type: 'tapSpatula'; targetId: string; fraction: number }
  | { type: 'returnSpatula' }
  | { type: 'transferSolid'; fromId: 'watch_glass'; toId: string; careful: boolean }
  | { type: 'rinseInto'; sourceId: 'watch_glass' | 'beaker150' | 'funnel'; targetId: string; ml: number }
  | { type: 'swirl'; id: string; intensity: number }
  // Líquidos
  | { type: 'setPour'; sourceId: string; targetId: string | null; tiltDeg: number }
  | { type: 'stopPour'; sourceId: string }
  | { type: 'squeeze'; targetId: string | null; drops: number }
  | { type: 'readVolume'; instrument: 'cylinder' | 'burette' | 'flask' | 'pipette'; eyeDzCm: number }
  // Balón aforado (§9.1)
  | { type: 'stopperFlask'; on: boolean }
  | { type: 'invertFlask' }
  // Pipeta (§9.2)
  | { type: 'attachPropipette'; on: boolean }
  | { type: 'conditionPipette' }
  | { type: 'aspirate'; ml: number }
  | { type: 'adjustPipette'; eyeDzCm: number }
  | { type: 'deliverPipette'; targetId: string; blow: boolean }
  // Montaje de gas (§11)
  | { type: 'fillBurette'; ml: number }
  | { type: 'invertBurette'; mouthSubmerged: boolean }
  | { type: 'clampBurette'; tiltDeg: number }
  | { type: 'setBuretteDepth'; mouthAboveFloorCm: number }
  | { type: 'setStopcock'; open: boolean }
  | { type: 'connect'; id: string; secured: boolean }
  | { type: 'secure'; id: string }
  | { type: 'kink'; id: string; fraction: number }
  | { type: 'leakTest' }
  // Reacción (§12, §18)
  | { type: 'addVinegar' }
  | { type: 'insertStopper'; on: boolean }
  // Metrología (§14–15)
  | { type: 'readThermometer' }
  | { type: 'readBarometer'; source: 'LOCAL' | 'WEATHER_SEA_LEVEL' }
  | { type: 'alignRuler'; aligned: boolean }
  | { type: 'measureHeight'; eyeDzCm: number }
  | { type: 'newRun' }
  | { type: 'emptyReactor' }
  // Boyle (§20–23)
  | { type: 'setPlunger'; targetMl: number; held: boolean }
  | { type: 'connectSyringe'; on: boolean }
  | { type: 'setValve'; valve: 'TO_SYRINGE' | 'VENT' }
  | { type: 'startCollection'; on: boolean }
  | { type: 'keepPoint'; enteredTotalMl: number }
  | { type: 'deletePoint'; index: number }
  | { type: 'acknowledge' }
  | { type: 'teacherStop'; on: boolean };

export type P10DispatchResult = { ok: boolean; code?: string; id?: string; value?: number };

/** Comandos que no se registran en la bitácora (§33.2): movimientos continuos. */
export const UNLOGGED_P10_COMMANDS = new Set<P10Command['type']>(['setPose', 'setPlunger', 'swirl']);
