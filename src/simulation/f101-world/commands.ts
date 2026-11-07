/**
 * Comandos de F101. La escena (controlador) y el panel accesible solo informan HECHOS: posición pedida del cursor
 * del calibrador, ángulo girado del tambor, ángulo de una polea a lo largo del borde, altura desde la que se suelta
 * una pieza, altura del ojo o ángulo de la vista. Ninguno recibe «lectura correcta» ni «completar etapa»: el dominio
 * decide qué pasó (§14, acciones con semántica física).
 */
import type { Pose } from './types';

export type PpeItem = 'coat' | 'goggles' | 'shoes' | 'hair';
export type CaliperDim = 'd' | 'h' | 'L';

export type F101Command =
  // Seguridad y reconocimiento (estación A)
  | { type: 'equipPpe'; item: PpeItem; on: boolean }
  | { type: 'startWork' }
  | { type: 'inspect'; target: string }
  | { type: 'setPose'; id: string; pose: Pose; support?: string }
  // Calibrador (estación B)
  | { type: 'placeInCaliper'; partId: string | null; dimension: CaliperDim; tiltDeg: number; spinDeg: number }
  | { type: 'setCaliperSlide'; targetMm: number }
  | { type: 'releaseCaliper' }
  | { type: 'lockCaliper'; on: boolean }
  | { type: 'readCaliper'; viewDeg: number }
  // Micrómetro
  | { type: 'placeInMicrometer'; partId: string | null; spinDeg: number }
  | { type: 'turnMicrometer'; deltaDeg: number; via: 'thimble' | 'ratchet' }
  | { type: 'lockMicrometer'; on: boolean }
  | { type: 'cleanFaces' }
  | { type: 'readMicrometer'; viewDeg: number }
  // Regla
  | { type: 'readRuler'; partId: string; viewDeg: number }
  // Balanza y probeta (estación C)
  | { type: 'powerBalance'; on: boolean }
  | { type: 'levelBalance' }
  | { type: 'tare' }
  | { type: 'readBalance' }
  | { type: 'dropIntoCylinder'; partId: string; heightCm: number }
  | { type: 'retrievePart'; partId: string }
  | { type: 'dryPart'; partId: string }
  | { type: 'readVolume'; eyeDzCm: number; occluded: boolean }
  | { type: 'tapCylinder' }
  | { type: 'replaceCylinder' }
  | { type: 'wipeBench' }
  // Mesa de fuerzas (estación D)
  | { type: 'setPulleyAngle'; pulleyId: string; angleDeg: number }
  | { type: 'seatPulley'; pulleyId: string; on: boolean }
  | { type: 'threadString'; pulleyId: string; on: boolean }
  | { type: 'hang'; hangerId: string; pulleyId: string | null }
  | { type: 'loadMass'; massId: string; hangerId: string | null }
  | { type: 'setPin'; on: boolean }
  | { type: 'nudgeRing'; dxCm: number; dyCm: number }
  | { type: 'tapTable' }
  | { type: 'levelTable' }
  | { type: 'recordEquilibrium'; viewElevDeg: number }
  // Dinamómetro y sensor 2D (estación E)
  | { type: 'mountDynamometer'; on: boolean; angleDeg: number }
  | { type: 'setDynAngle'; angleDeg: number }
  | { type: 'setDynTension'; mm: number }
  | { type: 'alignDynamometer'; alignDeg: number }
  | { type: 'zeroDynamometer' }
  | { type: 'readDynamometer'; viewDeg: number }
  | { type: 'connectSensor'; on: boolean }
  | { type: 'setSensorRange'; rangeN: 2 | 10 }
  | { type: 'setSensorRate'; hz: 5 | 50 }
  | { type: 'calibrateSensor' }
  | { type: 'startCapture' }
  | { type: 'stopCapture' }
  // Cierre y seguridad
  | { type: 'closeStation' }
  | { type: 'acknowledge' }
  | { type: 'teacherStop'; on: boolean };

export type F101DispatchResult = { ok: boolean; code?: string; id?: string; value?: number };

/** Movimientos continuos que no van a la bitácora (sí a la cinta). */
export const UNLOGGED_F101_COMMANDS = new Set<F101Command['type']>(['setPose', 'setCaliperSlide', 'turnMicrometer', 'setPulleyAngle', 'nudgeRing', 'setDynAngle', 'setDynTension']);
