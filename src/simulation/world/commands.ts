import type { AgitationTool, CoverMode, Pose } from '../entities/types';

/** Material de reposición disponible en el estante (los reactivos no se reponen). */
export type SpareKind = 'BEAKER' | 'FILTER_PAPER' | 'TEST_TUBE' | 'GRADUATED_CYLINDER' | 'PORCELAIN_DISH' | 'FUNNEL' | 'ROD';
export const SPARE_KINDS: SpareKind[] = ['GRADUATED_CYLINDER', 'BEAKER', 'TEST_TUBE', 'FILTER_PAPER', 'FUNNEL', 'PORCELAIN_DISH', 'ROD'];

export type FoldAction = 'HALF' | 'QUARTER' | 'OPEN_3_1' | 'OPEN_2_2' | 'MISALIGNED' | 'CRUMPLE';

/**
 * Comandos que la capa de interacción envía al dominio (§3.3).
 * Todos se aplican al inicio del siguiente paso fijo, en orden.
 */
export type Command =
  | { type: 'setPose'; id: string; pose: Pose }
  | { type: 'grab'; id: string }
  | { type: 'place'; id: string; support: string | null }
  | { type: 'drop'; id: string; impactCmS: number; fell: boolean }
  | { type: 'tip'; id: string }
  | { type: 'setPour'; sourceId: string; targetId: string | null; liquidRateMlS: number; solidRateGS: number; tiltDeg: number; guided: boolean }
  | { type: 'stopPour'; sourceId: string }
  | { type: 'setAgitation'; vesselId: string; intensity: number; tool: AgitationTool }
  | { type: 'scoop'; toolId: string; sourceId: string }
  | { type: 'tapTool'; toolId: string; targetId: string | null }
  | { type: 'cleanTool'; toolId: string }
  | { type: 'aspirate'; toolId: string; sourceId: string; ml: number }
  | { type: 'dispenseDrops'; toolId: string; targetId: string | null; drops: number }
  | { type: 'addIce'; targetId: string | null; g: number }
  | { type: 'label'; vesselId: string; label: string | null }
  | { type: 'fan'; vesselId: string }
  | { type: 'sniffDirect'; vesselId: string }
  | { type: 'setHotplatePower'; pct: number }
  | { type: 'tareBalance' }
  | { type: 'insertProbe'; vesselId: string | null; touchingBottom: boolean }
  | { type: 'insertRod'; vesselId: string | null }
  | { type: 'scrape'; vesselId: string }
  | { type: 'foldPaper'; paperId: string; action: FoldAction }
  | { type: 'tearPaper'; paperId: string }
  | { type: 'setDripTarget'; funnelId: string; targetId: string | null; touchingWall: boolean }
  | { type: 'setRingHeight'; cm: number }
  | { type: 'setStandAssembled'; assembled: boolean }
  | { type: 'cover'; vesselId: string; mode: CoverMode }
  | { type: 'setHandMode'; mode: 'HAND' | 'TONGS' }
  | { type: 'cleanSpill' }
  | { type: 'sweepShards'; id: string }
  | { type: 'requestSpare'; kind: SpareKind }
  | { type: 'acknowledgeIncident' }
  | { type: 'touchHotplate' };

/** Comandos que no se registran en el log de acciones (§12: sin movimientos crudos). */
export const UNLOGGED_COMMANDS = new Set<Command['type']>(['setPose', 'setAgitation', 'setDripTarget']);
