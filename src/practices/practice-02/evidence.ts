/**
 * Evidencia de avance (para la máquina del flujo). Se calcula del estado real, no del orden de acciones.
 */
import type { World } from '../../simulation/entities/types';
import { liquidVolumeMl, substanceMass } from '../../simulation/solutions/mixture';
import { SUBSTANCES } from './substances';
import { dishId } from './roles';
import { type NotebookState, SUBSTANCE_ROWS, filledRow21 } from './notebook';

export type StageFlags = Record<
  'aSetupDone' | 'aSamplesDone' | 'aSolubilityDone' | 'aRecorded' | 'bPrepared' | 'bHeated' | 'bFiltered' | 'bSplit' | 'bEvaporated' | 'bCrystallized' | 'notebookDone',
  boolean
>;

const TUBES = ['t1', 't2', 't3', 't4', 't5', 't6'];

export function stageEvidence(w: World, nb: NotebookState): StageFlags {
  const tubes = TUBES.map((id) => w.vessels[id]).filter(Boolean);
  const beakers = Object.values(w.vessels).filter((v) => v.type === 'BEAKER' && v.integrity === 1);
  const hasSample = (id: string) => {
    const m = w.vessels[id]?.mix;
    if (!m) return false;
    const s = Object.values(m.solid).reduce((a, b) => a + (b ?? 0), 0) + Object.values(m.dissolved).reduce((a, b) => a + (b ?? 0), 0) + Object.values(m.oil).reduce((a, b) => a + (b ?? 0), 0);
    return s > 0.01;
  };
  const prepared = beakers.some((b) => (b.mix.solid.CARBON ?? 0) > 0.2 && b.mix.waterG > 5) || beakers.some((b) => (w.evidence[`maxT:${b.id}`] ?? 0) > 0);
  const heated = beakers.some((b) => (w.evidence[`maxT:${b.id}`] ?? 0) >= 80);
  const papers = Object.values(w.vessels).filter((v) => v.type === 'FILTER_PAPER');
  const filtered = papers.some((p) => (p.mix.solid.CARBON ?? 0) > 0.2) && beakers.some((b) => liquidVolumeMl(b.mix, SUBSTANCES) > 5 && (b.mix.solid.CARBON ?? 0) < 0.2 && substanceMass(b.mix, 'KNO3') > 0.5);
  const dish = w.vessels[dishId(w)];
  const split = !!dish && (substanceMass(dish.mix, 'KNO3') > 0.05 || dish.mix.waterG > 0.5);
  const evaporated = !!dish && dish.mix.waterG <= 0 && substanceMass(dish.mix, 'KNO3') > 0.05;
  const crystallized = beakers.some((b) => (b.mix.crystals?.massG ?? 0) > 0.05);
  const t22 = nb.table22;
  return {
    aSetupDone: tubes.length === 6 && tubes.every((t) => (t.support ?? '').startsWith('rack:') && !!t.label),
    aSamplesDone: TUBES.every(hasSample),
    aSolubilityDone: tubes.every((t) => t.mix.waterG > 1 && t.agitatedTotalS > 1),
    aRecorded: SUBSTANCE_ROWS.every((k) => filledRow21(nb.table21[k])),
    bPrepared: prepared,
    bHeated: heated,
    bFiltered: filtered,
    bSplit: split,
    bEvaporated: evaporated,
    bCrystallized: crystallized,
    notebookDone: !!(t22.EVAPORATION.observations && t22.CRYSTALLIZATION.observations && nb.activities.a3),
  };
}
