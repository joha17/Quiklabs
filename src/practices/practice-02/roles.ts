/**
 * Papel que cumple cada recipiente en la práctica, independiente de su id.
 * Permite que un repuesto (p. ej., una probeta nueva tras romper la original) cuente igual en resultados y evaluación.
 */
import type { Vessel, World } from '../../simulation/entities/types';
import { mixMassG } from '../../simulation/solutions/mixture';

const intact = (v: Vessel) => v.integrity === 1 && v.support !== 'glass_waste';

/** Todas las probetas (original y repuestos, rotas o no: su evidencia histórica cuenta). */
export function cylinderIds(w: World): string[] {
  return Object.values(w.vessels).filter((v) => v.type === 'GRADUATED_CYLINDER').map((v) => v.id);
}

/** Vaso donde se preparó la mezcla: el que contuvo más carbón (por defecto, beaker1). */
export function mixBeakerId(w: World): string {
  let best = 'beaker1';
  let g = w.vessels.beaker1?.maxParticulateG ?? -1;
  for (const v of Object.values(w.vessels)) {
    if (v.type === 'BEAKER' && v.maxParticulateG > g + 1e-6) {
      g = v.maxParticulateG;
      best = v.id;
    }
  }
  return best;
}

/** Cápsula de trabajo: la intacta con contenido; si no, cualquier cápsula intacta; si no, la original. */
export function dishId(w: World): string {
  const dishes = Object.values(w.vessels).filter((v) => v.type === 'PORCELAIN_DISH');
  const withContent = dishes.filter((v) => intact(v) && mixMassG(v.mix) > 0.001);
  if (withContent.length) return withContent[0].id;
  const ok = dishes.find(intact);
  return ok?.id ?? 'dish';
}

/** Suma de evidencias `prefijo<id>sufijo` para varios recipientes. */
export function sumEvidence(w: World, keys: string[]): number {
  return keys.reduce((s, k) => s + (w.evidence[k] ?? 0), 0);
}
