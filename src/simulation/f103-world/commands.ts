/**
 * Comandos de F103. La escena (controlador) y el panel accesible solo informan HECHOS del gesto: vueltas del tornillo
 * de nivel, altura a la que se llevó la columna del soporte, ángulo al que se giró el mando de elevación, muesca hasta
 * la que se empujó la baqueta, posición a la que se arrastró la plataforma o la pantalla, desplazamiento del soporte de
 * la fotopuerta o dirección real de la vista. Ninguno recibe «velocidad correcta», «alcance» ni «completar etapa»: el
 * dominio decide qué pasó (§14, acciones con semántica física).
 */
import type { Pose } from './types';

export type PpeItem = 'coat' | 'goggles' | 'shoes' | 'hair';
export type TapeTarget = 'platform' | 'screen' | 'plumb';

export type F103Command =
  // Seguridad y reconocimiento
  | { type: 'equipPpe'; item: PpeItem; on: boolean }
  | { type: 'startWork' }
  | { type: 'inspect'; target: string }
  | { type: 'setPose'; id: string; pose: Pose; support?: string }
  // A — soporte, anclaje, nivel, altura de la boca, plomada y cinta del suelo
  | { type: 'anchorStand'; on: boolean }
  | { type: 'setStandHeight'; cm: number }
  | { type: 'turnLevelScrew'; turns: number }
  | { type: 'readLevel' }
  | { type: 'readHeight'; mark: 'muzzle' | 'deck'; viewDeg: number }
  | { type: 'dropPlumb' }
  | { type: 'alignTape' }
  | { type: 'readTape'; target: TapeTarget; mark: 'index' | 'base'; viewDeg: number }
  // B — ángulo, resorte, fotopuerta e interfaz
  | { type: 'setAngle'; deg: number }
  | { type: 'setYaw'; deg: number }
  | { type: 'zeroProtractor' }
  | { type: 'readProtractor'; viewDeg: number }
  | { type: 'setCap'; on: boolean }
  | { type: 'loadBall'; ball: string }
  | { type: 'unloadBall' }
  | { type: 'cock'; notch: number }
  | { type: 'mountGate'; on: boolean }
  | { type: 'setGateOffset'; mm: number }
  | { type: 'connect'; target: 'gate' | 'platform'; on: boolean }
  | { type: 'setTimerRate'; hz: number }
  | { type: 'setClockRange'; range: 'short' | 'long' }
  | { type: 'closeBarrier'; on: boolean }
  | { type: 'fire' }
  | { type: 'readGate' }
  // C/D — pantalla, plataforma, esferas
  | { type: 'moveScreen'; xCm: number; inLane: boolean }
  | { type: 'clearScreen' }
  | { type: 'readScreen'; viewDeg: number }
  | { type: 'movePlatform'; xCm: number; yCm: number }
  | { type: 'calibratePlatform' }
  | { type: 'readImpact' }
  | { type: 'collectBall'; ball: string }
  // E — entorno
  | { type: 'setFan'; speed: number; dir?: 'side' | 'head' | 'tail' }
  // Cierre y seguridad
  | { type: 'closeStation' }
  | { type: 'acknowledge' }
  | { type: 'teacherStop'; on: boolean };

export type F103DispatchResult = { ok: boolean; code?: string; id?: string; value?: number };

/** Movimientos continuos que no van a la bitácora (sí a la cinta). */
export const UNLOGGED_F103_COMMANDS = new Set<F103Command['type']>(['setPose', 'setStandHeight', 'turnLevelScrew', 'setAngle', 'setYaw', 'setGateOffset', 'moveScreen', 'movePlatform']);
