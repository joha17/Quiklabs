/**
 * Comandos del dominio de la Práctica 4: lo único que la interacción (o una prueba) puede pedirle al mundo.
 * La escena aporta hechos geométricos (poses, receptor bajo el pico, alineación de la pantalla, agitación medida);
 * el dominio decide las consecuencias químicas, térmicas y de seguridad.
 */
import type { FlameCommand } from '../flame-world/commands';
import type { Pose } from './types';

export type P4Command =
  | { type: 'confirmPpe' }
  | { type: 'setGloves'; on: boolean }
  /** Comando del mechero (sub-mundo de la Práctica 3: válvulas, manguera, chispa, poses del mechero…). */
  | { type: 'gas'; cmd: FlameCommand }
  | { type: 'setPose'; id: string; pose: Pose; support?: string }
  | { type: 'pickUp'; id: string; tool: 'HAND' | 'TONGS' }
  /** Vertido continuo desde un recipiente inclinado: caudal por la geometría (§16.2). `targetId` null = derrame. */
  | { type: 'setPour'; sourceId: string; targetId: string | null; rateMlS: number; tiltDeg: number }
  | { type: 'stopPour'; sourceId: string }
  /** Gotero: aspirar del frasco donde está metido; soltar una gota sobre el receptor. */
  | { type: 'aspirate'; dropperId: string; sourceId: string }
  | { type: 'drop'; dropperId: string; targetId: string | null }
  | { type: 'emptyDropper'; dropperId: string; targetId: string | null }
  /** Piseta: chorro de agua (mL/s) sobre el receptor (o fuera). */
  | { type: 'squeeze'; washId: string; targetId: string | null; rateMlS: number }
  | { type: 'stopSqueeze'; washId: string }
  /** Agitación medida por la escena (varilla, sacudida del tubo o giro), 0–1. */
  | { type: 'setAgitation'; id: string; tool: 'ROD' | 'SHAKE' | 'SWIRL'; intensity: number }
  | { type: 'clamp'; tongsId: string; targetId: string; grip: number }
  | { type: 'unclamp'; tongsId: string }
  | { type: 'sand'; id: string }
  | { type: 'inspect'; target: string }
  | { type: 'label'; id: string; label: string | null }
  | { type: 'washVessel'; id: string }
  | { type: 'dryVessel'; id: string }
  | { type: 'checkPh'; id: string }
  | { type: 'cleanSpill'; spillId: string }
  | { type: 'newRibbon' }
  | { type: 'acceptMgWarning' }
  | { type: 'setShield'; alignment: number; placed: boolean }
  | { type: 'setMgView'; inView: boolean; shielded: boolean }
  | { type: 'stopwatch'; action: 'START' | 'STOP' | 'RESET' }
  | { type: 'impact'; id: string; speedCmS: number }
  | { type: 'requestSpare'; kind: 'tube' | 'rod' | 'cyl10' }
  | { type: 'firstAid' }
  | { type: 'eyewash' }
  | { type: 'acknowledge' }
  | { type: 'teacherStop'; on: boolean };

/** Comandos de alta frecuencia que no se registran como acciones con significado (§22.3). */
export const UNLOGGED_P4_COMMANDS = new Set<P4Command['type']>(['setShield', 'setMgView', 'setAgitation']);

export interface P4DispatchResult {
  ok: boolean;
  code?: string;
  id?: string;
}
