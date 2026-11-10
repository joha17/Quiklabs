/**
 * Comandos de F04. La escena (controlador) y el panel accesible solo informan HECHOS del gesto: vueltas del tornillo de
 * nivel, por dónde se pasó el cordel, qué se colgó o se puso sobre la balanza, a qué posición se arrastró una
 * compuerta, el freno o el tope, qué flecha se dibujó sobre qué cuerpo, con qué fuerza y durante cuánto se empujó, o la
 * dirección real de la vista. Ninguno recibe «aceleración correcta» ni «completar etapa»: el dominio decide qué pasó.
 */
import type { Pose } from './types';

export type PpeItem = 'coat' | 'goggles' | 'shoes' | 'hair';
export type ForceId = 'forceA' | 'dynP' | 'dynQ';
export type SensorId = ForceId | 'accel01';
export type Channel = SensorId | 'gates';
export type FbdBody = 'cart' | 'hanger' | 'cartP';
export type FbdForce = 'weight' | 'normal' | 'tension' | 'friction' | 'push' | 'contact';
export type FbdDir = 'up' | 'down' | 'left' | 'right';
export type FbdPartner = 'earth' | 'track' | 'string' | 'hand' | 'cartP' | 'cartQ' | 'cart' | 'hanger';
export type MassPlace = 'rack' | 'hanger' | 'cart';

export type F04Command =
  // Seguridad y reconocimiento
  | { type: 'equipPpe'; item: PpeItem; on: boolean }
  | { type: 'startWork' }
  | { type: 'inspect'; target: string }
  | { type: 'setPose'; id: string; pose: Pose; support?: string }
  // E/A — balanza e inventario de masas
  | { type: 'tareBalance' }
  | { type: 'placeOnBalance'; id: string }
  | { type: 'removeFromBalance' }
  | { type: 'readBalance' }
  | { type: 'placeMass'; id: string; on: MassPlace }
  // F — diagramas de cuerpo libre sobre los objetos
  | { type: 'drawForce'; body: FbdBody; force: FbdForce; dir: FbdDir; partner: FbdPartner }
  | { type: 'eraseForce'; body: FbdBody; index: number }
  | { type: 'lockFbd'; body: FbdBody }
  // A/B — carril, polea, cordel y portapesas
  | { type: 'turnLevelScrew'; turns: number }
  | { type: 'readTilt' }
  | { type: 'clampPulley'; on: boolean }
  | { type: 'threadString'; path: 'groove' | 'axle' | 'none' }
  | { type: 'attachString'; on: boolean }
  | { type: 'hangHanger'; on: boolean }
  | { type: 'tensionString' }
  | { type: 'setBrake'; on: boolean }
  | { type: 'moveBrake'; s: number }
  | { type: 'moveStop'; s: number }
  | { type: 'moveGate'; id: 'gate1' | 'gate2'; s: number }
  | { type: 'readScale'; target: 'gate1' | 'gate2'; viewDeg: number }
  // C — sensores e interfaz
  | { type: 'connect'; channel: Channel; on: boolean }
  | { type: 'clipCable'; on: boolean }
  | { type: 'zeroSensor'; id: SensorId }
  | { type: 'calibrateSensor'; id: ForceId }
  | { type: 'setRange'; id: ForceId; n: number }
  | { type: 'mountSensor'; id: ForceId; angleDeg: number }
  | { type: 'setAxisSign'; id: ForceId; sign: 1 | -1 }
  | { type: 'setRate'; hz: number }
  // Ensayo del carro
  | { type: 'release' }
  | { type: 'pushCart'; ms: number }
  | { type: 'returnCart' }
  | { type: 'readRun'; t0: number; t1: number }
  // D — acción y reacción
  | { type: 'push'; forceN: number; durationS: number }
  | { type: 'resetPair' }
  | { type: 'readPair' }
  // Cierre y seguridad
  | { type: 'closeStation' }
  | { type: 'acknowledge' }
  | { type: 'teacherStop'; on: boolean };

export type F04DispatchResult = { ok: boolean; code?: string; id?: string; value?: number };

/** Movimientos continuos que no van a la bitácora (sí a la cinta). */
export const UNLOGGED_F04_COMMANDS = new Set<F04Command['type']>(['setPose', 'turnLevelScrew', 'moveBrake', 'moveStop', 'moveGate', 'mountSensor']);
