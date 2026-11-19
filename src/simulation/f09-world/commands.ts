/**
 * Comandos de F09. La escena (controlador) y el panel accesible solo informan HECHOS del gesto: a qué radio quedó la
 * masa en la guía, qué consigna marca la perilla del motor, cuántas vueltas de cordón se enrollaron y en qué ranura,
 * cuánta fuerza sostiene el carro del dinamómetro y con qué inclinación, hasta dónde se recogió el cordón central o la
 * dirección real de la vista al leer una escala. Ninguno recibe «torque» ni «completar etapa»: el dominio decide qué pasó.
 */
import type { MassId, Pose, SlideId } from './types';

export type PpeItem = 'coat' | 'goggles' | 'shoes' | 'hair';
export type Channel = 'encoder' | 'force' | 'gate';
export type RadiusTarget = MassId | 'arm';

export type F09Command =
  // Seguridad y reconocimiento
  | { type: 'equipPpe'; item: PpeItem; on: boolean }
  | { type: 'startWork' }
  | { type: 'inspect'; target: string }
  | { type: 'setPose'; id: string; pose: Pose; support?: string }
  // Balanza y regla radial
  | { type: 'tareBalance' }
  | { type: 'placeOnBalance'; id: string }
  | { type: 'removeFromBalance' }
  | { type: 'readBalance' }
  | { type: 'readRadius'; target: RadiusTarget; ref: 'center' | 'edge'; viewDeg: number }
  // A — base, nivel, guarda, freno y motor
  | { type: 'clampBase'; on: boolean }
  | { type: 'levelAxis' }
  | { type: 'setGuard'; closed: boolean }
  | { type: 'setBrake'; level: number }
  | { type: 'handBrake' }
  | { type: 'setClutch'; on: boolean }
  | { type: 'setMotor'; rpm: number }
  // B — masa orbitante y guía radial
  | { type: 'mountOrbit'; on: boolean }
  | { type: 'setOrbitRadius'; rCm: number }
  | { type: 'lockStop'; on: boolean }
  | { type: 'tightenCord' }
  | { type: 'reseatOrbit' }
  | { type: 'repairGuide' }
  // C — tambor, cordón y dinamómetro
  | { type: 'setArm'; rCm: number }
  | { type: 'windCord'; turns: number; dir: number }
  | { type: 'aimDyn'; deg: number }
  | { type: 'setPull'; forceN: number }
  | { type: 'startPull' }
  | { type: 'stopPull' }
  | { type: 'zeroDyn' }
  | { type: 'readDyn'; viewDeg: number }
  // D — masas radiales y cordón central
  | { type: 'setSlide'; id: SlideId; rCm: number }
  | { type: 'lockMass'; id: SlideId; on: boolean }
  | { type: 'pullIn'; rCm: number }
  // E — sensores
  | { type: 'connect'; channel: Channel; on: boolean }
  | { type: 'zeroForce' }
  | { type: 'setForceRange'; n: number }
  | { type: 'mountForce'; angleDeg: number }
  | { type: 'routeCable'; on: boolean }
  | { type: 'calibrateEncoder' }
  | { type: 'setRate'; hz: number }
  | { type: 'readForce' }
  | { type: 'timeTurns'; turns: number }
  | { type: 'readOmega' }
  | { type: 'readEncoder' }
  // Cierre y seguridad
  | { type: 'closeStation' }
  | { type: 'acknowledge' }
  | { type: 'teacherStop'; on: boolean };

export type F09DispatchResult = { ok: boolean; code?: string; id?: string; value?: number };

/** Movimientos continuos que no van a la bitácora (sí a la cinta). */
export const UNLOGGED_F09_COMMANDS = new Set<F09Command['type']>(['setPose', 'setOrbitRadius', 'setSlide', 'aimDyn', 'setPull', 'mountForce']);
