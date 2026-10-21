/**
 * Comandos de la Práctica 8 (§5.2, §14.1). El controlador y el panel accesible transmiten HECHOS (poses, inclinación,
 * apriete del gotero, consignas de la placa, apertura de la llave, cortes del módulo de fracciones). Nunca «convertir
 * 70 %» ni «crear 1 g de producto»: el dominio decide qué pasa (§5.2).
 */
import type { Pose } from './types';

export type PpeItem08 = 'goggles' | 'coat' | 'gloves' | 'hair';

export type P08Command =
  | { type: 'setPPE'; item: PpeItem08; enabled: boolean }
  | { type: 'startWork' }
  | { type: 'inspect'; target: string }
  | { type: 'setPose'; id: string; pose: Pose; support?: string }
  | { type: 'setCap'; vesselId: string; capped: boolean }
  | { type: 'useTongs'; on: boolean }
  // Balanza
  | { type: 'powerBalance'; on: boolean }
  | { type: 'tare' }
  | { type: 'readBalance' }
  // Trasvases
  | { type: 'setPour'; sourceId: string; targetId: string | null; tiltDeg: number }
  | { type: 'stopPour'; sourceId: string }
  | { type: 'setDropper'; dropperId: string; squeeze01: number }
  | { type: 'scoop'; sourceId: string }
  | { type: 'dropSpatula'; targetId: string }
  | { type: 'cleanTool'; toolId: string }
  | { type: 'squeezeWash'; targetId: string; ml: number }
  | { type: 'readVolume'; vesselId: string; eyeDzCm: number }
  | { type: 'dispose'; vesselId: string; targetId: string }
  | { type: 'setStir'; vesselId: string; motion01: number }
  // Calentamiento y reflujo
  | { type: 'setPlate'; on: boolean; setpointC: number }
  | { type: 'setMagneticStir'; level01: number }
  | { type: 'setCondenserWater'; on: boolean }
  | { type: 'readThermometer' }
  | { type: 'setBurner'; on: boolean }
  // Embudo de separación
  | { type: 'setStopper'; on: boolean }
  | { type: 'shakeFunnel'; on: boolean }
  | { type: 'vent' }
  | { type: 'setValve'; opening01: number; receiverId: string | null }
  // Filtración, secado y fracciones
  | { type: 'sealBuchner'; on: boolean }
  | { type: 'setVacuum'; on: boolean }
  | { type: 'setOven'; on: boolean }
  | { type: 'setFractionCut'; loC: number; hiC: number }
  | { type: 'runFractions' }
  // Análisis
  | { type: 'takeSample'; sourceId: string }
  | { type: 'requestAnalysis'; method: 'purity' | 'density' | 'mp' }
  // Limpieza y control
  | { type: 'cleanSpill' }
  | { type: 'acknowledge' }
  | { type: 'pause'; on: boolean }
  | { type: 'teacherStop'; on: boolean };

export type P08DispatchResult = { ok: boolean; code?: string; id?: string; value?: number };

export const UNLOGGED_P08_COMMANDS = new Set<P08Command['type']>(['setPose', 'setDropper', 'setStir', 'setPour', 'shakeFunnel', 'setValve']);
