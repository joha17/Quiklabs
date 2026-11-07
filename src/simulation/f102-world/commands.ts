/**
 * Comandos de F102. La escena (controlador) y el panel accesible solo informan HECHOS del gesto: vueltas del tornillo
 * del pie, posición a la que se arrastró la base de una compuerta, muesca del émbolo, velocidad de la mano al soltar
 * el carro, altura de la prensa del electroimán, desplazamiento lateral con que se colgó la esfera, altura desde la
 * que se abre la mano o ángulo real de la vista. Ninguno recibe «velocidad correcta», «g» ni «completar etapa»: el
 * dominio decide qué pasó (§14, acciones con semántica física).
 */
import type { Pose } from './types';

export type PpeItem = 'coat' | 'goggles' | 'shoes' | 'hair';
export type RulerTarget = 'gate1' | 'gate2' | 'flag';

export type F102Command =
  // Seguridad y reconocimiento
  | { type: 'equipPpe'; item: PpeItem; on: boolean }
  | { type: 'startWork' }
  | { type: 'inspect'; target: string }
  | { type: 'setPose'; id: string; pose: Pose; support?: string }
  // A — nivelación
  | { type: 'turnFootScrew'; turns: number }
  | { type: 'placeInclinometer'; where: 'bench' | 'track' | 'off' }
  | { type: 'zeroInclinometer' }
  | { type: 'readInclinometer' }
  // B — compuertas, regla, lanzador y carro
  | { type: 'setGatePos'; gateId: string; sCm: number }
  | { type: 'setGateYaw'; gateId: string; yawDeg: number }
  | { type: 'connectGate'; gateId: string; on: boolean }
  | { type: 'readRuler'; target: RulerTarget; mark: 'index' | 'edge'; viewDeg: number }
  | { type: 'cockLauncher'; notchCm: number }
  | { type: 'pullLatch' }
  | { type: 'holdCart'; sCm: number }
  | { type: 'releaseCart'; pushMs: number }
  | { type: 'armGateTimer' }
  | { type: 'readGateTimer' }
  | { type: 'loadBar'; barId: string; on: boolean }
  | { type: 'replaceFlag' }
  // C — cordel, polea, masa colgante y registrador de cinta
  | { type: 'attachString'; on: boolean }
  | { type: 'seatString'; on: boolean }
  | { type: 'hangHanger'; on: boolean }
  | { type: 'loadMass'; massId: string; on: boolean }
  | { type: 'attachTape'; on: boolean }
  | { type: 'tensionTape' }
  | { type: 'startTape' }
  | { type: 'stopTape' }
  // D — torre de caída
  | { type: 'setMagnetHeight'; hCm: number }
  | { type: 'tightenClamp'; on: boolean }
  | { type: 'swingMagnetArm'; armIn: boolean }
  | { type: 'switchMagnet'; on: boolean }
  | { type: 'attachToMagnet'; id: string; offsetMm: number }
  | { type: 'dropByHand'; id: string; heightCm: number; offsetMm: number; pushMs: number }
  | { type: 'readTowerScale'; viewDeg: number }
  | { type: 'capPhotocell'; on: boolean }
  | { type: 'armFallTimer' }
  | { type: 'readFallTimer' }
  | { type: 'pickUpBody'; id: string }
  // E — filtros y sensor de movimiento
  | { type: 'stackFilter'; filterId: string; onto: string | null; offsetMm: number }
  | { type: 'crumpleFilter'; filterId: string }
  | { type: 'connectMotion'; on: boolean }
  | { type: 'setMotionRange'; range: 'near' | 'far' }
  | { type: 'setMotionRate'; hz: 10 | 50 }
  | { type: 'aimMotion'; aimDeg: number }
  | { type: 'calibrateMotion' }
  | { type: 'startMotion' }
  | { type: 'stopMotion' }
  // Cierre y seguridad
  | { type: 'closeStation' }
  | { type: 'acknowledge' }
  | { type: 'teacherStop'; on: boolean };

export type F102DispatchResult = { ok: boolean; code?: string; id?: string; value?: number };

/** Movimientos continuos que no van a la bitácora (sí a la cinta). */
export const UNLOGGED_F102_COMMANDS = new Set<F102Command['type']>(['setPose', 'holdCart', 'setGatePos', 'setGateYaw', 'setMagnetHeight', 'turnFootScrew', 'aimMotion']);
