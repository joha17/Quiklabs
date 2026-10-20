/**
 * Comandos de la Práctica 7 (§6.3, §14.1). La escena y el panel accesible solo informan HECHOS (poses, inclinación,
 * apriete del gotero, agitación, contactos de las puntas con su separación, profundidad de la sonda); ninguno dice
 * «disolver», «conduce» ni «completar etapa»: el dominio decide qué pasó. No hay botón «Disolver» (§14.1).
 */
import type { Pose, SurfaceHit } from './types';

export type PpeItem = 'coat' | 'goggles' | 'shoes';
export type GloveType = 'none' | 'nitrile' | 'latex';

export type P07Command =
  // Seguridad e inspección (§5.A)
  | { type: 'setPPE'; item: PpeItem; enabled: boolean }
  | { type: 'setGloves'; gloves: GloveType }
  | { type: 'startWork' }
  | { type: 'inspect'; target: string }
  | { type: 'setPose'; id: string; pose: Pose; support?: string }
  | { type: 'setCap'; vesselId: string; capped: boolean }
  | { type: 'labelTube'; tubeId: string; label: string }
  // Balanza
  | { type: 'powerBalance'; on: boolean }
  | { type: 'tare' }
  | { type: 'readBalance' }
  // Trasvases (§6.1)
  | { type: 'setPour'; sourceId: string; targetId: string | null; tiltDeg: number }
  | { type: 'stopPour'; sourceId: string }
  | { type: 'setDropper'; dropperId: string; squeeze01: number }
  | { type: 'scoop'; sourceId: string }
  | { type: 'dropSpatula'; targetId: string }
  | { type: 'cleanTool'; toolId: string }
  | { type: 'squeezeWash'; targetId: string; ml: number }
  | { type: 'setStir'; vesselId: string; motion01: number }
  | { type: 'readVolume'; vesselId: string; eyeDzCm: number }
  | { type: 'observe'; vesselId: string }
  | { type: 'dispose'; vesselId: string; wasteId: string }
  | { type: 'rotateSpecimen'; specimenId: string }
  | { type: 'wetSpecimen'; specimenId: string }
  | { type: 'drySpecimen'; specimenId: string }
  // Detector de sólidos (§3.5)
  | { type: 'powerDetector'; on: boolean }
  | { type: 'setDetectorRange'; range: 'LOW' | 'HIGH' }
  | { type: 'setDetectorCables'; connected: boolean }
  | { type: 'setElectrodeContacts'; a: SurfaceHit | null; b: SurfaceHit | null }
  | { type: 'readDetector' }
  // Conductímetro (§3.4)
  | { type: 'powerMeter'; on: boolean }
  | { type: 'setMeterRange'; range: 'LOW' | 'MID' | 'HIGH' }
  | { type: 'setAtc'; on: boolean }
  | { type: 'setStandard'; value: 1413 | 12880 }
  | { type: 'setProbeDepth'; vesselId: string | null; immersionCm: number; bottomContact: boolean }
  | { type: 'rinseProbe'; wasteId: string }
  | { type: 'calibrateConductivity'; standardId: string }
  | { type: 'readConductivity' }
  // Limpieza y control
  | { type: 'cleanSpill'; where: 'bench' | 'electrics' }
  | { type: 'pause'; on: boolean }
  | { type: 'acknowledge' }
  | { type: 'teacherStop'; on: boolean };

export type P07DispatchResult = { ok: boolean; code?: string; id?: string; value?: number };

/** Mandos continuos y poses: van en la cinta del intento pero no en la bitácora visible. */
export const UNLOGGED_P07_COMMANDS = new Set<P07Command['type']>(['setPose', 'setDropper', 'setStir', 'setPour', 'setElectrodeContacts', 'setProbeDepth']);
