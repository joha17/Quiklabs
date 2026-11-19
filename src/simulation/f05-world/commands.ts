/**
 * Comandos de F05. La escena (controlador) y el panel accesible solo informan HECHOS del gesto: vueltas del tornillo
 * del elevador o de la manivela del tirador, la velocidad elegida en el motor, a qué altura se enganchó el cable, qué
 * tira de revestimiento se puso, dónde se apoyó el bloque o un lastre, qué flecha se dibujó, o la dirección real de la
 * vista al leer. Ninguno recibe «coeficiente correcto» ni «completar etapa»: el dominio decide qué pasó.
 */
import type { Pose } from './types';

export type PpeItem = 'coat' | 'goggles' | 'shoes' | 'hair';
export type Material = 'wood' | 'paper' | 'rubber';
export type Channel = 'load01' | 'gates' | 'video';
export type FbdBody = 'blockPull' | 'blockSlide';
export type FbdForce = 'weight' | 'normal' | 'tension' | 'friction';
/** Sentidos: vertical (arriba/abajo), perpendicular a la superficie, y a lo largo del plano (subiendo/bajando). */
export type FbdDir = 'up' | 'down' | 'perp' | 'upSlope' | 'downSlope';
export type FbdPartner = 'earth' | 'plane' | 'cable' | 'block';
export type MassPlace = 'rack' | 'block';
export type GateId = 'gate1' | 'gate2';

export type F05Command =
  // Seguridad y reconocimiento
  | { type: 'equipPpe'; item: PpeItem; on: boolean }
  | { type: 'startWork' }
  | { type: 'inspect'; target: string }
  | { type: 'setPose'; id: string; pose: Pose; support?: string }
  // B — balanza, termómetro y cargas
  | { type: 'tareBalance' }
  | { type: 'placeOnBalance'; id: string }
  | { type: 'removeFromBalance' }
  | { type: 'readBalance' }
  | { type: 'readTemp' }
  | { type: 'placeMass'; id: string; on: MassPlace; offsetCm?: number }
  // A — superficies y bloque
  | { type: 'setSurface'; material: Material }
  | { type: 'placeBlock'; s: number | 'top'; lateralCm?: number }
  | { type: 'releaseBlock' }
  | { type: 'reseatFlag' }
  | { type: 'setCatcher'; on: boolean }
  // F — diagramas de cuerpo libre
  | { type: 'drawForce'; body: FbdBody; force: FbdForce; dir: FbdDir; partner: FbdPartner }
  | { type: 'eraseForce'; body: FbdBody; index: number }
  | { type: 'lockFbd'; body: FbdBody }
  // D — ángulo
  | { type: 'turnElevator'; turns: number }
  | { type: 'setLock'; on: boolean }
  | { type: 'clampBase'; on: boolean }
  | { type: 'readAngle'; target: 'plane' | 'support'; viewDeg: number }
  // C — fuerza: cable, célula de carga y tirador
  | { type: 'attachCable'; on: boolean }
  | { type: 'setCableHeight'; cm: number }
  | { type: 'connect'; channel: Channel; on: boolean }
  | { type: 'zeroSensor' }
  | { type: 'calibrateSensor' }
  | { type: 'setRange'; n: number }
  | { type: 'mountSensor'; angleDeg: number }
  | { type: 'setRate'; hz: number }
  | { type: 'setDrive'; cmS: number }
  | { type: 'turnCrank'; turns: number }
  | { type: 'jerk' }
  | { type: 'returnPuller' }
  | { type: 'readPull'; t0: number; t1: number }
  // E — cinemática
  | { type: 'moveGate'; id: GateId; s: number }
  | { type: 'readScale'; target: GateId; viewDeg: number }
  | { type: 'readSlide' }
  // Cierre y seguridad
  | { type: 'closeStation' }
  | { type: 'acknowledge' }
  | { type: 'teacherStop'; on: boolean };

export type F05DispatchResult = { ok: boolean; code?: string; id?: string; value?: number };

/** Movimientos continuos que no van a la bitácora (sí a la cinta). */
export const UNLOGGED_F05_COMMANDS = new Set<F05Command['type']>(['setPose', 'turnElevator', 'turnCrank', 'moveGate', 'mountSensor', 'setCableHeight']);
