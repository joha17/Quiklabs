/**
 * Comandos de F06. La escena (controlador) y el panel accesible solo informan HECHOS del gesto: hasta qué muesca del
 * trinquete se empujó el carro, con qué rapidez lo soltó la mano, a qué altura quedó la columna del riel, dónde se
 * colgó una pesa, cuánto se apartó la esfera del péndulo o la dirección real de la vista al leer una escala. Ninguno
 * recibe «energía correcta» ni «completar etapa»: el dominio decide qué pasó.
 */
import type { Pose } from './types';

export type PpeItem = 'coat' | 'goggles' | 'shoes' | 'hair';
export type Channel = 'force' | 'position' | 'gates' | 'angle';
export type SpringPlace = 'stand' | 'launcher' | 'rack';
export type TrackGate = 'gate1' | 'gate2';
export type HeightRef = 'launcher' | 'bench';

export type F06Command =
  // Seguridad y reconocimiento
  | { type: 'equipPpe'; item: PpeItem; on: boolean }
  | { type: 'startWork' }
  | { type: 'inspect'; target: string }
  | { type: 'setPose'; id: string; pose: Pose; support?: string }
  // Balanza
  | { type: 'tareBalance' }
  | { type: 'placeOnBalance'; id: string }
  | { type: 'removeFromBalance' }
  | { type: 'readBalance' }
  // A — resorte en el soporte
  | { type: 'mountSpring'; id: string; at: SpringPlace }
  | { type: 'secureSpring'; on: boolean }
  | { type: 'hangHanger'; on: boolean }
  | { type: 'hangMass'; id: string; on: boolean }
  | { type: 'alignRuler' }
  | { type: 'readRuler'; viewDeg: number }
  // B — carro, lanzador y riel
  | { type: 'loadCart'; id: string; on: boolean }
  | { type: 'compress'; x: number }
  | { type: 'releaseCart'; pushMs?: number }
  | { type: 'returnCart' }
  | { type: 'setBrake'; on: boolean }
  | { type: 'repairCart' }
  | { type: 'setHeight'; m: number }
  | { type: 'clampTrack'; on: boolean }
  | { type: 'readHeight'; ref: HeightRef; viewDeg: number }
  | { type: 'moveGate'; id: TrackGate; s: number }
  // D — sensores de fuerza y posición
  | { type: 'connect'; channel: Channel; on: boolean }
  | { type: 'zeroSensor' }
  | { type: 'calibrateSensor' }
  | { type: 'setRange'; n: number }
  | { type: 'mountSensor'; angleDeg: number }
  | { type: 'setRate'; hz: number }
  | { type: 'syncChannels'; on: boolean }
  | { type: 'readLaunch' }
  | { type: 'readGates' }
  // E — pérdidas
  | { type: 'setFriction'; n: number }
  | { type: 'setDamper'; c: number }
  // C — péndulo
  | { type: 'setLength'; m: number }
  | { type: 'holdBob'; deg: number }
  | { type: 'releaseBob'; lateralMs?: number }
  | { type: 'stopBob' }
  | { type: 'readPendulum' }
  | { type: 'readPendScale'; viewDeg: number }
  // Cierre y seguridad
  | { type: 'closeStation' }
  | { type: 'acknowledge' }
  | { type: 'teacherStop'; on: boolean };

export type F06DispatchResult = { ok: boolean; code?: string; id?: string; value?: number };

/** Movimientos continuos que no van a la bitácora (sí a la cinta). */
export const UNLOGGED_F06_COMMANDS = new Set<F06Command['type']>(['setPose', 'setHeight', 'moveGate', 'mountSensor', 'setLength', 'holdBob', 'setFriction', 'setDamper']);
