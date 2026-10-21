/**
 * Geometría visual de la Práctica 8 (cm de mesada): bocas, bordes de vertido y niveles de líquido e interfase. La usan
 * la cámara, el controlador (acoples de vertido, herramientas dentro de un recipiente) y las vistas, con las MISMAS
 * medidas que el dominio (`GEO08`).
 */
import type { P08World, Vessel08 } from '../../simulation/organic-world/types';
import { GEO08, type VesselShape08 } from '../../simulation/organic-world/geometry';
import { levels08 } from '../../simulation/organic-world/world';

/** Altura del borde sobre la base de cada forma (cm). */
export const RIM_Z: Record<VesselShape08, number> = {
  roundFlask: GEO08.roundFlask.h, beaker50: GEO08.beaker50.h, beaker100: GEO08.beaker100.h, erlenmeyer: GEO08.erlenmeyer.h, cyl10: GEO08.cyl10.h, cyl25: GEO08.cyl25.h,
  sepFunnel: GEO08.sepFunnel.h, kitasato: GEO08.kitasato.h, filterPaper: GEO08.filterPaper.h, vial: GEO08.vial.h, bottle250: GEO08.bottle250.h + 2.5,
  bottle100: GEO08.bottle100.h + 2, dropperBottle: GEO08.dropperBottle.h + 1.2, jar: GEO08.jar.h + 0.6, watchGlass: GEO08.watchGlass.h, washBottle: GEO08.washBottle.h,
  waste: GEO08.waste.h, bath: GEO08.bath.h, iceBath: GEO08.iceBath.h, plasticCup: GEO08.plasticCup.h,
};

/** Radio de la boca (acoples y vertidos). */
export const MOUTH_R: Record<VesselShape08, number> = {
  roundFlask: GEO08.roundFlask.neckR + 0.3, beaker50: GEO08.beaker50.r, beaker100: GEO08.beaker100.r, erlenmeyer: GEO08.erlenmeyer.mouthR + 0.3, cyl10: GEO08.cyl10.r + 0.2,
  cyl25: GEO08.cyl25.r + 0.2, sepFunnel: 1.3, kitasato: 1.6, filterPaper: GEO08.filterPaper.r, vial: GEO08.vial.r - 0.3, bottle250: 1.4, bottle100: 1.1, dropperBottle: 0.6,
  jar: GEO08.jar.r - 0.3, watchGlass: GEO08.watchGlass.r, washBottle: 0.4, waste: GEO08.waste.r, bath: GEO08.bath.r, iceBath: 8, plasticCup: GEO08.plasticCup.r,
};

/** Borde de vertido (radio y altura sobre la base) de las formas que se vierten inclinándolas. */
export const POUR_LIP08: Partial<Record<VesselShape08, { r: number; h: number }>> = {
  roundFlask: { r: GEO08.roundFlask.neckR + 0.2, h: GEO08.roundFlask.h },
  beaker50: { r: GEO08.beaker50.r + 0.2, h: GEO08.beaker50.h },
  beaker100: { r: GEO08.beaker100.r + 0.2, h: GEO08.beaker100.h },
  erlenmeyer: { r: GEO08.erlenmeyer.mouthR + 0.2, h: GEO08.erlenmeyer.h },
  cyl10: { r: GEO08.cyl10.outerR, h: GEO08.cyl10.h },
  cyl25: { r: GEO08.cyl25.outerR, h: GEO08.cyl25.h },
  bottle250: { r: 1.4, h: RIM_Z.bottle250 },
  bottle100: { r: 1.1, h: RIM_Z.bottle100 },
  dropperBottle: { r: 0.6, h: RIM_Z.dropperBottle },
  vial: { r: GEO08.vial.r - 0.3, h: GEO08.vial.h },
  sepFunnel: { r: 1.3, h: GEO08.sepFunnel.h },
  kitasato: { r: 1.6, h: GEO08.kitasato.h },
  plasticCup: { r: GEO08.plasticCup.r + 0.1, h: GEO08.plasticCup.h },
};

export const isPourable = (w: P08World, id: string) => {
  const v = w.vessels[id];
  return !!v && !!POUR_LIP08[v.shape] && w.objects[id]?.movable !== false;
};

/** Boca (centro y radio). En el Büchner, el papel recibe lo vertido sobre el embudo. */
export function mouthOf(w: P08World, id: string): { x: number; y: number; z: number; r: number } | null {
  const o = w.objects[id];
  const v = w.vessels[id];
  if (!o || !v) return null;
  return { x: o.pose.x, y: o.pose.y, z: o.pose.z + RIM_Z[v.shape], r: MOUTH_R[v.shape] };
}

/** Boca del embudo Büchner (vertido de la suspensión sobre el papel). */
export function buchnerMouth(w: P08World) {
  const b = w.objects.buchner;
  if (!b) return null;
  return { x: b.pose.x, y: b.pose.y, z: b.pose.z + GEO08.buchner.h, r: GEO08.buchner.r };
}

/** Superficie e interfase (z sobre la mesada). */
export function levelsZ(w: P08World, v: Vessel08) {
  return levels08(w, v.id);
}

/** Puntos de apoyo con nombre: platillo, baño, hielo, aro de corcho, aro del embudo, Büchner, estufa, colector. */
export function supportPoint(w: P08World, support: string): { x: number; y: number; z: number } | null {
  const o = w.objects;
  switch (support) {
    case 'bath01': return o.bath01 ? { x: o.bath01.pose.x, y: o.bath01.pose.y, z: o.bath01.pose.z + 1 } : null;
    case 'ice01': return o.ice01 ? { x: o.ice01.pose.x, y: o.ice01.pose.y, z: 1.2 } : null;
    case 'cork01': return o.cork01 ? { x: o.cork01.pose.x, y: o.cork01.pose.y, z: 1.2 } : null;
    case 'ring01': return o.ring01 ? { x: o.ring01.pose.x, y: o.ring01.pose.y, z: 18 } : null;
    case 'buchner': return o.buchner ? { x: o.buchner.pose.x, y: o.buchner.pose.y, z: o.buchner.pose.z + 1 } : null;
    case 'oven01': return o.oven01 ? { x: o.oven01.pose.x, y: o.oven01.pose.y - 2, z: 4 } : null;
    case 'frac01': return o.frac01 ? { x: o.frac01.pose.x + 6, y: o.frac01.pose.y - 16, z: 0 } : null;
    case 'below:ring01': return o.ring01 ? { x: o.ring01.pose.x, y: o.ring01.pose.y, z: 0 } : null;
    case 'rf': return o.rf ? { x: o.rf.pose.x, y: o.rf.pose.y, z: o.rf.pose.z + GEO08.roundFlask.h } : null;
  }
  return null;
}

/** Sitios donde se puede apoyar cada clase de objeto (además de la mesada y el platillo). */
export const SPOTS: Record<string, string[]> = {
  roundFlask: ['bath01', 'ice01', 'cork01'],
  beaker: ['ice01', 'below:ring01'],
  erlenmeyer: ['below:ring01'],
  sepFunnel: ['ring01'],
  filterPaper: ['buchner', 'oven01'],
  vial: ['frac01', 'below:ring01'],
  condenser: ['rf'],
  thermometer: ['rf', 'bath01', 'ice01'],
};
