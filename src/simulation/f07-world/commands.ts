/**
 * Comandos de F07. La escena (controlador) y el panel accesible solo informan HECHOS del gesto: dónde se apoyó un
 * carro, hasta qué muesca se trabó el émbolo, cuánto se giró el tornillo de nivelación, qué paragolpes se montó, la
 * velocidad que la mano le dio a un carro o la dirección real de la vista al leer una escala. Ninguno recibe «choque
 * elástico» ni «completar etapa»: el dominio decide qué pasó.
 */
import type { BumperType, CartId, Pose } from './types';

export type PpeItem = 'coat' | 'goggles' | 'shoes' | 'hair';
export type Channel = 'force' | 'gates' | 'camera';
export type TrackGate = 'gateA' | 'gateB';

export type F07Command =
  // Seguridad y reconocimiento
  | { type: 'equipPpe'; item: PpeItem; on: boolean }
  | { type: 'startWork' }
  | { type: 'inspect'; target: string }
  | { type: 'setPose'; id: string; pose: Pose; support?: string }
  // Balanza y calibre
  | { type: 'tareBalance' }
  | { type: 'placeOnBalance'; id: string }
  | { type: 'removeFromBalance' }
  | { type: 'readBalance' }
  | { type: 'measureFlag'; cart: CartId }
  // A — riel
  | { type: 'setLevelScrew'; deg: number }
  | { type: 'readLevel'; viewDeg: number }
  | { type: 'setEndDampers'; on: boolean }
  // B — carros y paragolpes
  | { type: 'placeCart'; cart: CartId; s: number }
  | { type: 'setCartBrake'; cart: CartId; on: boolean }
  | { type: 'freeWheel'; cart: CartId }
  | { type: 'centerCart'; cart: CartId }
  | { type: 'repairCart'; cart: CartId }
  | { type: 'setBumper'; bumper: BumperType }
  | { type: 'flipMagnet' }
  | { type: 'fixVelcro'; on: boolean }
  | { type: 'separateCarts' }
  | { type: 'cock'; cart: CartId; cm: number }
  | { type: 'release' }
  | { type: 'pushCart'; cart: CartId; v: number }
  | { type: 'stopCart'; cart: CartId }
  // C — fotopuertas, bandera y sensor de fuerza
  | { type: 'moveGate'; id: TrackGate; s: number }
  | { type: 'clampGates'; on: boolean }
  | { type: 'setFlag'; cart: CartId; cm: number }
  | { type: 'alignFlag'; cart: CartId }
  | { type: 'connect'; channel: Channel; on: boolean }
  | { type: 'zeroSensor' }
  | { type: 'calibrateSensor' }
  | { type: 'setRange'; n: number }
  | { type: 'mountSensor'; angleDeg: number }
  | { type: 'setRate'; hz: number }
  | { type: 'readGates' }
  | { type: 'readForce' }
  // D — masas adicionales
  | { type: 'loadCart'; id: string; cart: CartId; on: boolean }
  // E — cámara y regla
  | { type: 'readPosition'; cart: CartId; viewDeg: number }
  | { type: 'readMotion' }
  // Cierre y seguridad
  | { type: 'closeStation' }
  | { type: 'acknowledge' }
  | { type: 'teacherStop'; on: boolean };

export type F07DispatchResult = { ok: boolean; code?: string; id?: string; value?: number };

/** Movimientos continuos que no van a la bitácora (sí a la cinta). */
export const UNLOGGED_F07_COMMANDS = new Set<F07Command['type']>(['setPose', 'setLevelScrew', 'moveGate', 'mountSensor', 'placeCart']);
