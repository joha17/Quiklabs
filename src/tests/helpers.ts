/**
 * Utilidades de prueba: conducen el dominio igual que lo haría la capa de interacción,
 * pero sin DOM ni Pixi (§17.1/17.2).
 */
import type { World } from '../simulation/entities/types';
import type { Command } from '../simulation/world/commands';
import { dispatchMut, pourableSolidsG, runFor, stepMut } from '../simulation/world/world';
import { liquidVolumeMl, particulateMassG } from '../simulation/solutions/mixture';
import { CTX } from '../practices/practice-02';
import { balanceReading } from '../simulation/world/world';

export const ctx = CTX;

export function cmd(w: World, c: Command) {
  return dispatchMut(w, c, CTX);
}

export function run(w: World, s: number) {
  runFor(w, s, CTX);
}

export function lv(w: World, id: string): number {
  return liquidVolumeMl(w.vessels[id].mix, CTX.subs);
}

export function solids(w: World, id: string): number {
  return particulateMassG(w.vessels[id].mix);
}

/** Vierte líquido hasta transferir `ml` (o vaciar) a `rate` mL/s. */
export function pourMl(w: World, src: string, dst: string | null, ml: number, rate = 1, guided = true, maxS = 600): number {
  const start = lv(w, src);
  cmd(w, { type: 'setPour', sourceId: src, targetId: dst, liquidRateMlS: rate, solidRateGS: 0, tiltDeg: 60, guided });
  let t = 0;
  while (start - lv(w, src) < ml - 1e-9 && lv(w, src) > 1e-6 && t < maxS) {
    const remaining = ml - (start - lv(w, src));
    if (remaining < rate * w.params.dtS) {
      cmd(w, { type: 'setPour', sourceId: src, targetId: dst, liquidRateMlS: remaining / w.params.dtS, solidRateGS: 0, tiltDeg: 60, guided });
    }
    stepMut(w, CTX);
    t += w.params.dtS;
  }
  cmd(w, { type: 'stopPour', sourceId: src });
  return start - lv(w, src);
}

/** Vierte con un límite de nivel en el receptor (decantación al embudo sin pasar el borde del papel). */
export function pourIntoFunnel(w: World, src: string, funnel: string, maxHeadMl: number, rate = 0.8, maxS = 1800): void {
  let t = 0;
  while (lv(w, src) > 0.05 && t < maxS) {
    const head = lv(w, funnel);
    const r = head < maxHeadMl ? rate : 0;
    cmd(w, { type: 'setPour', sourceId: src, targetId: funnel, liquidRateMlS: r, solidRateGS: 0, tiltDeg: 50, guided: true });
    stepMut(w, CTX);
    t += w.params.dtS;
  }
  cmd(w, { type: 'stopPour', sourceId: src });
}

/** Transfiere sólidos (residuo/mezcla) por inclinación pronunciada. */
export function pourSolids(w: World, src: string, dst: string | null, rateGS = 0.2, maxS = 120): void {
  cmd(w, { type: 'setPour', sourceId: src, targetId: dst, liquidRateMlS: 0, solidRateGS: rateGS, tiltDeg: 110, guided: true });
  let t = 0;
  while (pourableSolidsG(w.vessels[src]) > 1e-4 && t < maxS) {
    stepMut(w, CTX);
    t += w.params.dtS;
  }
  cmd(w, { type: 'stopPour', sourceId: src });
}

/** Llena un recipiente con la piseta hasta `ml` exactos (lectura ideal del menisco). */
export function squeezeTo(w: World, dst: string, ml: number, rate = 1): void {
  const target = lv(w, dst) + ml;
  let t = 0;
  while (lv(w, dst) < target - 1e-6 && t < 300) {
    const rem = target - lv(w, dst);
    cmd(w, { type: 'setPour', sourceId: 'piseta', targetId: dst, liquidRateMlS: Math.min(rate, rem / w.params.dtS), solidRateGS: 0, tiltDeg: 0, guided: true });
    stepMut(w, CTX);
    t += w.params.dtS;
  }
  cmd(w, { type: 'stopPour', sourceId: 'piseta' });
}

/** Pesa ~`g` de la mezcla sobre papel en la balanza (tarada) con la espátula. */
export function weighOut(w: World, jar: string, g: number, tol = 0.02): number {
  cmd(w, { type: 'place', id: 'weigh_paper', support: 'balance' });
  cmd(w, { type: 'tareBalance' });
  let guard = 0;
  while ((balanceReading(w) ?? 0) < g - tol && guard++ < 200) {
    cmd(w, { type: 'scoop', toolId: 'spatula', sourceId: jar });
    // Ajuste fino: si la carga excede, se devuelve parte al frasco.
    cmd(w, { type: 'tapTool', toolId: 'spatula', targetId: 'weigh_paper' });
    if ((balanceReading(w) ?? 0) > g + tol) {
      cmd(w, { type: 'setPour', sourceId: 'weigh_paper', targetId: jar, liquidRateMlS: 0, solidRateGS: 0.2, tiltDeg: 80, guided: true });
      while ((balanceReading(w) ?? 0) > g + tol / 2) stepMut(w, CTX);
      cmd(w, { type: 'stopPour', sourceId: 'weigh_paper' });
    }
  }
  return balanceReading(w) ?? 0;
}
