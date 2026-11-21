/**
 * Comandos de F11. La escena (controlador) y el panel accesible solo informan HECHOS del gesto: qué llave se abrió,
 * hasta dónde se bajó la sonda por la guía, dónde se soltó un objeto sobre el agua, hasta qué altura se bajó el brazo
 * del soporte o la dirección real de la vista al leer una escala. Ninguno recibe «presión», «empuje», «densidad» ni
 * «completar etapa»: el dominio decide qué pasó.
 */
import type { BalanceItem, CatchPlace, FloatId, Pose, ProbeMount } from './types';

export type PpeItem = 'coat' | 'goggles' | 'shoes' | 'hair';

export type F11Command =
  // Seguridad y reconocimiento
  | { type: 'equipPpe'; item: PpeItem; on: boolean }
  | { type: 'startWork' }
  | { type: 'inspect'; target: string }
  | { type: 'setPose'; id: string; pose: Pose; support?: string }
  // A — tanque, llaves y agitador
  | { type: 'setTap'; on: boolean }
  | { type: 'setPump'; on: boolean }
  | { type: 'setDrain'; on: boolean }
  | { type: 'setAgitator'; on: boolean }
  | { type: 'mopSpill' }
  | { type: 'readLevel'; viewDeg: number }
  // B — sonda, guía y registrador
  | { type: 'mountProbe'; where: ProbeMount }
  | { type: 'setGuide'; xCm: number }
  | { type: 'setProbeZ'; zCm: number }
  | { type: 'lockGuide'; on: boolean }
  | { type: 'connectProbe'; on: boolean }
  | { type: 'setRange'; idx: number }
  | { type: 'setRate'; hz: number }
  | { type: 'zeroProbe' }
  | { type: 'calibrateProbe' }
  | { type: 'purgeProbe' }
  | { type: 'newSeries' }
  | { type: 'readProbe' }
  | { type: 'readRuler'; viewDeg: number }
  // C — flotación
  | { type: 'setBallast'; grams: number }
  | { type: 'releaseObject'; id: FloatId; xCm: number }
  | { type: 'untieThread'; id: FloatId }
  | { type: 'recoverObject'; id: FloatId }
  | { type: 'readDraft'; id: FloatId; viewDeg: number }
  // D — balanza, probeta y vaso de rebose
  | { type: 'placeOnBalance'; item: BalanceItem }
  | { type: 'clearBalance' }
  | { type: 'tareBalance' }
  | { type: 'readBalance' }
  | { type: 'fillCylinder' }
  | { type: 'emptyCylinder' }
  | { type: 'readCylinder'; viewDeg: number }
  | { type: 'placeCatch'; at: CatchPlace }
  | { type: 'emptyCatch' }
  | { type: 'primeCan' }
  // E — dinamómetro y guía de inmersión
  | { type: 'hangBlock' }
  | { type: 'unhangBlock' }
  | { type: 'aimDyn'; deg: number }
  | { type: 'zeroDyn' }
  | { type: 'setStand'; cm: number }
  | { type: 'zeroStand' }
  | { type: 'readDyn'; viewDeg: number }
  | { type: 'readStand'; viewDeg: number }
  // Cierre y seguridad
  | { type: 'closeStation' }
  | { type: 'acknowledge' }
  | { type: 'teacherStop'; on: boolean };

export type F11DispatchResult = { ok: boolean; code?: string; id?: string; value?: number };

/** Movimientos continuos que no van a la bitácora (sí a la cinta). */
export const UNLOGGED_F11_COMMANDS = new Set<F11Command['type']>(['setPose', 'setGuide', 'setProbeZ', 'aimDyn', 'setStand']);
