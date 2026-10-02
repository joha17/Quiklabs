import type { Mixture, Vessel, World } from '../entities/types';
import {
  addMix, emptyMixture, liquidVolumeMl, particulateMassG, pourInto, sanitize, takeAllFraction, takeLiquidFraction, takeSolids,
} from '../solutions/mixture';
import { bump, deliver, emit, emitOnce, spill, type SimContext } from '../world/ops';
import { clamp } from '../core/math';

/** Eficiencia de retención y fracción que rodea el papel según su estado (C1–C3). */
export function filterQuality(w: World, paper: Vessel): { efficiency: number; bypass: number } {
  const f = w.params.filter;
  const fs = paper.filter!;
  if (fs.torn) return { efficiency: f.efficiencyTorn, bypass: f.bypassTorn };
  if (fs.fold !== 'CONE_OK') return { efficiency: f.efficiencyBadFold, bypass: f.bypassBadFold };
  if (!fs.wetted) return { efficiency: f.efficiencyDry, bypass: f.bypassDry };
  return { efficiency: f.efficiencyOk, bypass: 0 };
}

function outflow(w: World, funnel: Vessel, part: Mixture, tempC: number, ctx: SimContext): void {
  const fl = funnel.funnel!;
  const target = fl.dripTargetId ? w.vessels[fl.dripTargetId] ?? null : null;
  const ml = liquidVolumeMl(part, ctx.subs);
  if (!target) {
    if (ml > 0.001) emitOnce(w, `filtrate-lost:${Math.floor(w.timeS / 15)}`, 'FILTRATE_LOST', 'ALERT', { vesselId: funnel.id });
    bump(w, 'filtrateLostMl', ml);
    spill(w, part, ctx, 'no-receiver');
    return;
  }
  // Espiga sin tocar la pared: gotas que salpican fuera del receptor.
  if (!fl.stemTouchingWall && ml > 0) {
    const sp = takeAllFraction(part, w.params.filter.splashNoWallFrac);
    spill(w, sp, ctx, 'stem-splash');
  }
  bump(w, `filtrateTo:${target.id}`, ml);
  deliver(w, part, tempC, target, ctx, 'receiver-overflow');
}

/**
 * Filtración por gravedad. Embudo = líquido sobre el papel; papel = torta + líquido retenido (tanque bien mezclado).
 * El caudal depende del nivel de líquido (carga), humedecido, torta de sólidos y estado del papel (§5.2 B4).
 */
export function stepFiltration(w: World, funnel: Vessel, dt: number, ctx: SimContext): void {
  const fl = funnel.funnel;
  if (!fl || funnel.integrity === 0) return;
  const pf = w.params.filter;
  const paper = fl.paperId ? w.vessels[fl.paperId] ?? null : null;
  let delivered = 0;
  const head = liquidVolumeMl(funnel.mix, ctx.subs);

  if (!paper) {
    // Sin papel: todo pasa por la espiga.
    if (head > 0) {
      const ml = Math.min(head, 3 * dt);
      const part = takeLiquidFraction(funnel.mix, ml / head, ctx.subs);
      delivered += ml;
      outflow(w, funnel, part, funnel.temperatureC, ctx);
    } else if (particulateMassG(funnel.mix) > 0) {
      outflow(w, funnel, takeSolids(funnel.mix, particulateMassG(funnel.mix)), funnel.temperatureC, ctx);
    }
    fl.dripRateMlPerS = delivered / dt;
    return;
  }

  const fs = paper.filter!;
  const q = filterQuality(w, paper);

  // C4 — líquido por encima del borde del papel: rodea el papel con su sólido en suspensión.
  if (head > pf.coneCapacityMl) {
    const over = Math.min(head - pf.coneCapacityMl, 4 * dt);
    const part = takeLiquidFraction(funnel.mix, over / head, ctx.subs);
    if (!fs.overflowed) emit(w, 'FILTER_OVERFLOW', 'ALERT', { vesselId: funnel.id });
    fs.overflowed = true;
    bump(w, 'filterOverflowMl', over);
    delivered += over;
    outflow(w, funnel, part, funnel.temperatureC, ctx);
  }

  // Flujo a través del papel.
  const h2 = liquidVolumeMl(funnel.mix, ctx.subs);
  const cake = particulateMassG(paper.mix);
  const wetF = fs.wetted ? 1 : 0.7;
  let k = (pf.baseK * wetF) / (1 + 1.5 * cake);
  if (fs.torn) k *= 3;
  if (fs.fold === 'CONE_BAD') k *= 1.6; // canales: pasa más rápido
  const flowMl = Math.min(h2, k * (h2 + 0.3) * dt);
  if (h2 > 0 && flowMl > 0) {
    const part = takeLiquidFraction(funnel.mix, flowMl / h2, ctx.subs);
    routeThroughPaper(w, funnel, paper, part, q, ctx);
  }

  // Cuando el embudo se vacía, el sedimento remanente (y cristales) queda sobre el papel.
  if (liquidVolumeMl(funnel.mix, ctx.subs) < 0.02 && particulateMassG(funnel.mix) > 0) {
    const solids = takeSolids(funnel.mix, particulateMassG(funnel.mix));
    const liquidRest = takeLiquidFraction(funnel.mix, 1, ctx.subs);
    addMix(solids, liquidRest);
    routeThroughPaper(w, funnel, paper, solids, q, ctx);
  }

  // Tanque del papel: el exceso sobre la retención drena por la espiga.
  const holdupCap = pf.holdupBaseMl + pf.holdupPerGSolidMl * particulateMassG(paper.mix);
  const pl = liquidVolumeMl(paper.mix, ctx.subs);
  if (pl > holdupCap) {
    const out = pl - holdupCap;
    const part = takeLiquidFraction(paper.mix, out / pl, ctx.subs, false);
    delivered += out;
    outflow(w, funnel, part, paper.temperatureC, ctx);
  }
  if (paper.mix.waterG >= 0.4 && !fs.wetted) {
    fs.wetted = true;
    emit(w, 'FILTER_WETTED', 'INFO', { vesselId: paper.id });
  }
  fs.retainedLiquidMl = Math.min(liquidVolumeMl(paper.mix, ctx.subs), holdupCap);
  fl.dripRateMlPerS = fl.dripRateMlPerS + (delivered / dt - fl.dripRateMlPerS) * Math.min(1, dt / 0.5);
  fs.flowRateMlPerS = fl.dripRateMlPerS;
  // Las partículas retenidas en el papel no están en suspensión.
  for (const s in paper.mix.suspended) paper.mix.suspended[s as keyof typeof paper.mix.suspended] = 0;
  sanitize(paper.mix);
}

function routeThroughPaper(
  w: World,
  funnel: Vessel,
  paper: Vessel,
  part: Mixture,
  q: { efficiency: number; bypass: number },
  ctx: SimContext,
): void {
  // Fracción que rodea el papel (seco/mal doblado/rasgado) con su sólido.
  if (q.bypass > 0) {
    const by = takeAllFraction(part, q.bypass);
    bump(w, 'filterBypassMl', liquidVolumeMl(by, ctx.subs));
    outflow(w, funnel, by, funnel.temperatureC, ctx);
  }
  // Sólidos: se retienen con la eficiencia del papel; el resto pasa al filtrado.
  const solidMass = particulateMassG(part);
  if (solidMass > 0) {
    const solids = takeSolids(part, solidMass);
    const passed = takeAllFraction(solids, clamp(1 - q.efficiency, 0, 1));
    if (particulateMassG(passed) > 0) {
      bump(w, 'solidsPassedFilterG', particulateMassG(passed));
      const carrier = emptyMixture();
      addMix(carrier, passed);
      outflow(w, funnel, carrier, funnel.temperatureC, ctx);
    }
    addMix(paper.mix, solids);
  }
  // Líquido → tanque del papel.
  pourInto(paper, part, funnel.temperatureC, ctx.subs, w.params.cpWater);
}
