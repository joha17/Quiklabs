/**
 * Resultados medibles del intento, calculados SIEMPRE desde el estado real del dominio (§16).
 */
import type { World } from '../../simulation/entities/types';
import { liquidVolumeMl, particulateMassG, substanceMass } from '../../simulation/solutions/mixture';
import { SUBSTANCES } from './substances';
import { dishId } from './roles';

/**
 * Fracción del carbón retenido que se puede recuperar seco del papel (el resto queda en las fibras).
 * Supuesto documentado en docs/SUPUESTOS_CIENTIFICOS.md.
 */
export const CARBON_RECOVERABLE_FROM_PAPER = 0.975;

export interface PartBResults {
  sampleG: number;
  filtrateMl: number;
  kno3InFiltrateG: number;
  carbonOnPaperG: number;
  carbonRecoverableG: number;
  carbonInFiltrateG: number;
  dishKno3G: number;
  dishSolidsG: number;
  dishPurity: number | null;
  crystalsG: number;
  crystalPurity: number | null;
  crystalMeanSizeMm: number | null;
  motherLiquorKno3G: number;
  crystalVesselId: string | null;
}

/** Recipiente que contiene más cristales de KNO₃ (excluye la cápsula). */
export function crystalVessel(w: World): string | null {
  let best: string | null = null;
  let bestG = 0;
  for (const id in w.vessels) {
    const v = w.vessels[id];
    if (v.type === 'PORCELAIN_DISH' || v.type === 'FILTER_PAPER' || v.type === 'FUNNEL') continue;
    if (v.type !== 'BEAKER') continue;
    const g = v.mix.crystals?.massG ?? 0;
    if (g > bestG) {
      bestG = g;
      best = id;
    }
  }
  return best;
}

/** Papel del embudo, o el papel con más carbón. */
export function mainPaper(w: World): string | null {
  let best: string | null = null;
  let bestG = -1;
  for (const id in w.vessels) {
    const v = w.vessels[id];
    if (v.type !== 'FILTER_PAPER') continue;
    const g = v.mix.solid.CARBON ?? 0;
    if (g > bestG) {
      bestG = g;
      best = id;
    }
  }
  return best;
}

export function partBResults(w: World, receiverId = 'beaker2'): PartBResults {
  const sample = ['jar_mix', 'vial'].reduce((s, id) => {
    const init = w.reagentInitial[id];
    if (!init || !w.vessels[id]) return s;
    const now = w.vessels[id].mix;
    return s + ((init.CARBON ?? 0) + (init.KNO3 ?? 0) + (init.IMP ?? 0)) - ((now.solid.CARBON ?? 0) + substanceMass(now, 'KNO3') + (now.solid.IMP ?? 0));
  }, 0);
  const rec = w.vessels[receiverId];
  const dish = w.vessels[dishId(w)];
  const dishKno3 = dish ? substanceMass(dish.mix, 'KNO3') : 0;
  const dishSolids = dish ? particulateMassG(dish.mix) + Object.values(dish.mix.dissolved).reduce((a, b) => a + (b ?? 0), 0) : 0;
  const cv = crystalVessel(w);
  const cvv = cv ? w.vessels[cv] : null;
  const crystals = cvv?.mix.crystals?.massG ?? 0;
  const carbonWithCrystals = cvv?.mix.solid.CARBON ?? 0;
  const paper = mainPaper(w);
  return {
    sampleG: sample,
    filtrateMl: rec ? liquidVolumeMl(rec.mix, SUBSTANCES) : 0,
    kno3InFiltrateG: rec ? substanceMass(rec.mix, 'KNO3') : 0,
    carbonOnPaperG: paper ? w.vessels[paper].mix.solid.CARBON ?? 0 : 0,
    carbonRecoverableG: (paper ? w.vessels[paper].mix.solid.CARBON ?? 0 : 0) * CARBON_RECOVERABLE_FROM_PAPER,
    carbonInFiltrateG: rec?.mix.solid.CARBON ?? 0,
    dishKno3G: dishKno3,
    dishSolidsG: dish && dish.mix.waterG === 0 ? dishSolids : dishKno3,
    dishPurity: dish && dish.mix.waterG === 0 && dishSolids > 0 ? dishKno3 / dishSolids : null,
    crystalsG: crystals,
    crystalPurity: crystals > 0 ? (cvv!.mix.crystals!.purityFraction * crystals) / (crystals + carbonWithCrystals) : null,
    crystalMeanSizeMm: cvv?.mix.crystals?.meanSizeMm ?? null,
    motherLiquorKno3G: cvv ? cvv.mix.dissolved.KNO3 ?? 0 : rec?.mix.dissolved.KNO3 ?? 0,
    crystalVesselId: cv,
  };
}
