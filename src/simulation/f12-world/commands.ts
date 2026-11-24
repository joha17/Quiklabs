/**
 * Comandos de F12. La escena (controlador) y el panel accesible solo informan HECHOS del gesto: qué junta se apretó,
 * hasta dónde se giró la perilla de la bomba o la válvula, a qué toma se enchufó un tubo, con qué inclinación se apoyó
 * el calibre o la dirección real de la vista al leer una escala. Ninguno recibe «caudal», «presión», «velocidad» ni
 * «completar etapa»: el dominio decide qué pasó.
 */
import type { JointId, Pose, PortId, SensorId, SpoolKind } from './types';

export type PpeItem = 'coat' | 'goggles' | 'shoes' | 'hair';

export type F12Command =
  // Seguridad y reconocimiento
  | { type: 'equipPpe'; item: PpeItem; on: boolean }
  | { type: 'startWork' }
  | { type: 'inspect'; target: string }
  | { type: 'setPose'; id: string; pose: Pose; support?: string }
  // A — circuito
  | { type: 'fitGasket'; joint: JointId }
  | { type: 'connectJoint'; joint: JointId; on: boolean }
  | { type: 'setPurge'; open: boolean }
  | { type: 'clampVenturi'; on: boolean }
  | { type: 'swapSpool'; kind: SpoolKind }
  | { type: 'insertStopper' }
  | { type: 'removeStopper' }
  | { type: 'mopSpill' }
  | { type: 'readSump'; viewDeg: number }
  // C — bomba y válvula
  | { type: 'setPump'; on: boolean }
  | { type: 'setSpeed'; value: number }
  | { type: 'setValve'; pos: number }
  // D — tomas, sensores y registrador
  | { type: 'capPort'; port: PortId; on: boolean }
  | { type: 'setProbe'; port: PortId; kind: 'static' | 'pitot' }
  | { type: 'connectSensor'; sensor: SensorId; port: PortId | null }
  | { type: 'setRange'; idx: number }
  | { type: 'setRate'; hz: number }
  | { type: 'setPressureMode'; mode: 'gauge' | 'abs' }
  | { type: 'zeroSensors' }
  | { type: 'calibrateSensors' }
  | { type: 'newSeries' }
  | { type: 'readPressures' }
  | { type: 'readTapHeight'; port: PortId; viewDeg: number }
  // E — caudal y geometría
  | { type: 'readFlow' }
  | { type: 'setDiverter'; to: 'sump' | 'beaker' }
  | { type: 'moveBeaker'; to: 'outlet' | 'bench' }
  | { type: 'emptyBeaker' }
  | { type: 'readBeaker'; viewDeg: number }
  | { type: 'timer'; action: 'start' | 'stop' | 'reset' }
  | { type: 'readTimer' }
  | { type: 'measureDiameter'; section: 'D1' | 'D2'; face: 'inner' | 'outer'; tiltDeg: number }
  // Cierre y seguridad
  | { type: 'closeStation' }
  | { type: 'acknowledge' }
  | { type: 'teacherStop'; on: boolean };

export type F12DispatchResult = { ok: boolean; code?: string; id?: string; value?: number; ids?: string[] };

/** Movimientos continuos que no van a la bitácora (sí a la cinta). */
export const UNLOGGED_F12_COMMANDS = new Set<F12Command['type']>(['setPose', 'setSpeed']);
