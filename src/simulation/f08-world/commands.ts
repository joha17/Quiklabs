/**
 * Comandos de F08. La escena (controlador) y el panel accesible solo informan HECHOS del gesto: qué sólido se acopló y
 * en qué agujero, cuántas vueltas de cuerda se enrollaron, cuánto se giró la plataforma con la mano, dónde se trabó una
 * masa corrediza, a qué altura quedó el tope o la fotopuerta, o la dirección real de la vista al leer una escala.
 * Ninguno recibe «momento de inercia» ni «completar etapa»: el dominio decide qué pasó.
 */
import type { DropId, Pose, SlideId, SolidId } from './types';

export type PpeItem = 'coat' | 'goggles' | 'shoes' | 'hair';
export type Channel = 'encoder' | 'tension' | 'tach' | 'gate';
export type CaliperTarget = 'disc01' | 'ring01' | 'drum' | 'flag' | 'hole';

export type F08Command =
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
  | { type: 'measure'; target: CaliperTarget }
  // A — soporte, guarda y freno
  | { type: 'clampBase'; on: boolean }
  | { type: 'setGuard'; closed: boolean }
  | { type: 'setBrake'; on: boolean }
  | { type: 'turnByHand'; deg: number }
  | { type: 'spinByHand'; omega: number }
  | { type: 'touchHub'; on: boolean }
  // B — sólidos y masas corredizas
  | { type: 'mountSolid'; id: SolidId; hole: number }
  | { type: 'removeSolid' }
  | { type: 'centerSolid' }
  | { type: 'repairSolid'; id: SolidId }
  | { type: 'slideMass'; id: SlideId; rCm: number }
  | { type: 'lockMass'; id: SlideId; on: boolean }
  | { type: 'readRadius'; id: SlideId; viewDeg: number }
  // C — cuerda, polea, masa colgante, tope y fotopuerta
  | { type: 'setDrum'; rCm: number }
  | { type: 'windString'; turns: number }
  | { type: 'hangMass'; id: DropId; on: boolean }
  | { type: 'alignPulley' }
  | { type: 'setCatch'; on: boolean; zCm: number }
  | { type: 'moveGate'; zCm: number }
  | { type: 'release' }
  // D — encoder, tensión, tacómetro y registrador
  | { type: 'connect'; channel: Channel; on: boolean }
  | { type: 'readScale'; viewDeg: number }
  | { type: 'zeroEncoder' }
  | { type: 'calibrateEncoder' }
  | { type: 'setEncoderDir'; dir: number }
  | { type: 'readEncoderAngle' }
  | { type: 'zeroTension' }
  | { type: 'mountTension'; angleDeg: number }
  | { type: 'setTachRange'; n: number }
  | { type: 'setRate'; hz: number }
  | { type: 'readEncoder' }
  | { type: 'readTension' }
  | { type: 'readTach' }
  | { type: 'readGate' }
  // Cierre y seguridad
  | { type: 'closeStation' }
  | { type: 'acknowledge' }
  | { type: 'teacherStop'; on: boolean };

export type F08DispatchResult = { ok: boolean; code?: string; id?: string; value?: number };

/** Movimientos continuos que no van a la bitácora (sí a la cinta). */
export const UNLOGGED_F08_COMMANDS = new Set<F08Command['type']>(['setPose', 'turnByHand', 'slideMass', 'moveGate', 'mountTension']);
