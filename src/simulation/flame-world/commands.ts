/**
 * Comandos del dominio de la Práctica 3: lo único que la interacción (o una prueba) puede pedirle al mundo.
 * La escena aporta hechos geométricos (poses, alineación del vidrio, calidad del agarre); el dominio decide.
 */
import type { Pose } from './types';

export type ValveId = 'TABLE' | 'NEEDLE' | 'AIR';

export type FlameCommand =
  | { type: 'confirmPpe' }
  | { type: 'setValve'; valve: ValveId; value: number }
  | { type: 'connectHose'; connected: boolean }
  | { type: 'replaceHose' }
  | { type: 'setHoseMid'; x: number; y: number; z: number }
  | { type: 'spark'; on: boolean }
  /** Pose de un objeto (sostenido, apoyado por la física o encajado en un soporte). */
  | { type: 'setPose'; id: string; pose: Pose; support?: string }
  /** El estudiante toma un objeto (con la mano o con pinzas). */
  | { type: 'pickUp'; id: string; tool: 'HAND' | 'TONGS' }
  | { type: 'clamp'; tongsId: string; targetId: string; grip: number }
  | { type: 'unclamp'; tongsId: string }
  | { type: 'wipeCapsule' }
  | { type: 'inspect'; target: string }
  | { type: 'soapTest' }
  | { type: 'identifyPart'; part: string; answer: string }
  | { type: 'setExtraction'; on: boolean }
  | { type: 'emergencyShutoff' }
  | { type: 'restoreSupply' }
  | { type: 'useBlanket' }
  | { type: 'useExtinguisher' }
  | { type: 'firstAid' }
  | { type: 'raiseAlarm' }
  | { type: 'acknowledge' }
  | { type: 'setHcl'; open: boolean }
  | { type: 'setFilterAlignment'; alignment: number; distanceCm: number }
  | { type: 'cleanGlass' }
  | { type: 'requestSpareLoop'; solutionId: string }
  | { type: 'spray'; atomizerId: string }
  | { type: 'setAtomizerYaw'; id: string; yawRad: number }
  | { type: 'teacherStop'; on: boolean };

/** Comandos de alta frecuencia que no se registran como acciones con significado (§19.3). */
export const UNLOGGED_FLAME_COMMANDS = new Set<FlameCommand['type']>(['setFilterAlignment', 'setAtomizerYaw', 'setHoseMid']);

export interface FlameDispatchResult {
  ok: boolean;
  code?: string;
  id?: string;
}
