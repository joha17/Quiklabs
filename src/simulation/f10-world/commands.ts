/**
 * Comandos de F10. La escena (controlador) y el panel accesible solo informan HECHOS del gesto: dónde quedó un apoyo o
 * la carga sobre la viga, dónde apoya la viga en la cuña, hasta dónde se giró la manivela de la prensa, con qué
 * inclinación quedó el dinamómetro o el comparador, o la dirección real de la vista al leer una escala. Ninguno recibe
 * «reacción», «módulo» ni «completar etapa»: el dominio decide qué pasó.
 */
import type { BeamPlace, Pose, SupportId } from './types';

export type PpeItem = 'coat' | 'goggles' | 'shoes' | 'hair';
export type Channel = 'cells' | 'press' | 'gauge';
export type TapeTarget = 'supA' | 'supB' | 'load1' | 'cg' | 'L0';
export type Grip = 'top' | 'bottom';

export type F10Command =
  // Seguridad y reconocimiento
  | { type: 'equipPpe'; item: PpeItem; on: boolean }
  | { type: 'startWork' }
  | { type: 'inspect'; target: string }
  | { type: 'setPose'; id: string; pose: Pose; support?: string }
  // A — viga y apoyos
  | { type: 'placeBeam'; where: BeamPlace }
  | { type: 'seatBeam' }
  | { type: 'setSupport'; id: SupportId; sCm: number }
  | { type: 'clampSupport'; id: SupportId; on: boolean }
  | { type: 'tightenKnife'; id: SupportId }
  | { type: 'steadyBeam'; on: boolean }
  | { type: 'resetBeam' }
  | { type: 'repairBeam' }
  // B — cargas y dinamómetro
  | { type: 'hangLoad'; id: 'load1'; sCm: number }
  | { type: 'moveLoad'; id: 'load1'; sCm: number }
  | { type: 'unhangLoad'; id: 'load1' }
  | { type: 'closeHook'; id: 'load1'; on: boolean }
  | { type: 'recoverLoad'; id: 'load1' }
  | { type: 'hangOnDyn'; id: 'beam' | 'load1' }
  | { type: 'unhangDyn' }
  | { type: 'aimDyn'; deg: number }
  | { type: 'zeroDyn' }
  | { type: 'readDyn'; viewDeg: number }
  // E — geometría: cuña, nivel, cinta y calibre
  | { type: 'slideOnWedge'; sCm: number }
  | { type: 'levelBench' }
  | { type: 'readTape'; target: TapeTarget; viewDeg: number }
  | { type: 'readCaliper'; id: string }
  // Sensores de reacción
  | { type: 'zeroCells' }
  | { type: 'readCell'; id: SupportId }
  // C — prensa y probeta
  | { type: 'installSpecimen'; id: string }
  | { type: 'removeSpecimen' }
  | { type: 'clampGrip'; grip: Grip; on: boolean }
  | { type: 'alignGrips' }
  | { type: 'lockCrank'; on: boolean }
  | { type: 'setCrank'; mm: number }
  | { type: 'releaseCrank' }
  | { type: 'setShield'; closed: boolean }
  // D — comparador, celda de carga y registrador
  | { type: 'mountGauge'; axis: 'axial' | 'transverse' | null }
  | { type: 'tiltGauge'; deg: number }
  | { type: 'routeCable'; on: boolean }
  | { type: 'calibrateGauge' }
  | { type: 'zeroGauge' }
  | { type: 'zeroLoadCell' }
  | { type: 'setCellRange'; n: number }
  | { type: 'connect'; channel: Channel; on: boolean }
  | { type: 'setRate'; hz: number }
  | { type: 'readLoadCell' }
  | { type: 'readGauge' }
  | { type: 'startLog' }
  | { type: 'stopLog' }
  | { type: 'readCurve' }
  // Cierre y seguridad
  | { type: 'closeStation' }
  | { type: 'acknowledge' }
  | { type: 'teacherStop'; on: boolean };

export type F10DispatchResult = { ok: boolean; code?: string; id?: string; value?: number };

/** Movimientos continuos que no van a la bitácora (sí a la cinta). */
export const UNLOGGED_F10_COMMANDS = new Set<F10Command['type']>(['setPose', 'setSupport', 'moveLoad', 'slideOnWedge', 'aimDyn', 'tiltGauge', 'setCrank']);
