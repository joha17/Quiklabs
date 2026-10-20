/**
 * Comandos de la Práctica 1. La escena y el panel de acciones solo informan hechos (poses, mandos continuos de la
 * pera y de la descarga, inclinación, apertura y orientación del calibrador, altura del ojo); ninguno recibe
 * «densidad correcta», «verter exactamente 25 mL» ni «completar etapa»: el dominio decide qué pasó (§6.2).
 */
import type { Pose } from './types';

export type PpeItem = 'coat' | 'goggles' | 'shoes' | 'hair';

export type P01Command =
  // Seguridad y reconocimiento (§5.A)
  | { type: 'equipPpe'; item: PpeItem; on: boolean }
  | { type: 'startWork' }
  | { type: 'inspect'; target: string }
  | { type: 'setPose'; id: string; pose: Pose; support?: string }
  // Balanza (§6)
  | { type: 'powerBalance'; on: boolean }
  | { type: 'levelBalance' }
  | { type: 'tare' }
  | { type: 'readBalance' }
  // Pipeta y pera (§5.B)
  | { type: 'attachFiller'; on: boolean }
  | { type: 'setAspirate'; suction01: number }
  | { type: 'setPipetteRelease'; release01: number }
  | { type: 'adjustMeniscus'; eyeDzCm: number }
  | { type: 'wipeTip'; method: 'outside' | 'orifice' }
  | { type: 'blowOut' }
  | { type: 'rinsePipette' }
  // Líquidos
  | { type: 'setPour'; sourceId: string; targetId: string | null; tiltDeg: number }
  | { type: 'stopPour'; sourceId: string }
  | { type: 'squeeze'; targetId: string | null; drops: number }
  | { type: 'readVolume'; instrumentId: 'cylinder50' | 'pipette25' | 'erlenmeyer150'; eyeDzCm: number }
  // Termómetro (§6)
  | { type: 'setThermometerInsertion'; depthCm: number; touchingWall: boolean }
  | { type: 'readThermometer' }
  // Clavos (§5.C)
  | { type: 'transferNails'; from: string; to: string; count: number; gentle: boolean; tool: 'tongs' | 'hand' }
  | { type: 'tapCylinder' }
  // Calibrador (§5.D)
  | { type: 'setCaliper'; target: 'none' | 'empty' | 'diameter' | 'height'; angleDeg: number; force01: number; orientationDeg: number }
  | { type: 'readCaliper' }
  // Limpieza (§11)
  | { type: 'cleanObject'; objectId: string; action: 'wash' | 'dry' | 'clean' }
  | { type: 'cleanSpill'; where: 'bench' | 'pan' | 'tray' }
  | { type: 'emptyInto'; sourceId: string; targetId: string }
  | { type: 'acknowledge' }
  | { type: 'teacherStop'; on: boolean };

export type P01DispatchResult = { ok: boolean; code?: string; id?: string; value?: number };

/** Movimientos continuos que no van a la bitácora (sí a la cinta): poses, mandos de la pera y del calibrador. */
export const UNLOGGED_P01_COMMANDS = new Set<P01Command['type']>(['setPose', 'setAspirate', 'setPipetteRelease', 'setCaliper', 'setThermometerInsertion']);
