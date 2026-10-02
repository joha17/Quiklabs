/**
 * Rutas guionizadas reutilizables (integración §17.2). Conducen el dominio como un estudiante
 * que ejecuta la técnica correcta, para poder introducir errores puntuales en cada prueba.
 */
import type { World } from '../simulation/entities/types';
import { stepMut } from '../simulation/world/world';
import { CTX } from '../practices/practice-02';
import { cmd, lv, pourIntoFunnel, pourMl, pourSolids, run, solids, squeezeTo, weighOut } from './helpers';

export function prepareSample(w: World): void {
  if (w.vessels.vial) pourSolids(w, 'vial', 'beaker1', 0.3);
  else {
    weighOut(w, 'jar_mix', 2.5);
    pourSolids(w, 'weigh_paper', 'beaker1', 0.3);
  }
  squeezeTo(w, 'cyl', 10.0);
  pourMl(w, 'cyl', 'beaker1', 20, 1.5);
  cmd(w, { type: 'insertRod', vesselId: 'beaker1' });
  cmd(w, { type: 'setAgitation', vesselId: 'beaker1', intensity: 0.6, tool: 'ROD' });
  run(w, 30);
}

/** Calentamiento gradual con agitación constante ~5 min, cerca de 100 °C sin evaporar todo. */
export function heat(w: World, holdS = 150): void {
  cmd(w, { type: 'place', id: 'beaker1', support: 'hotplate' });
  cmd(w, { type: 'insertProbe', vesselId: 'beaker1', touchingBottom: false });
  for (const pct of [25, 45, 60]) {
    cmd(w, { type: 'setHotplatePower', pct });
    run(w, 40);
  }
  let t = 0;
  while (w.vessels.beaker1.temperatureC < 92 && t < 900) {
    run(w, 5);
    t += 5;
  }
  cmd(w, { type: 'setHotplatePower', pct: 45 });
  run(w, holdS);
  cmd(w, { type: 'setHotplatePower', pct: 0 });
}

export function setupFilter(w: World, paper = 'paper1', receiver = 'beaker2', wet = true): void {
  for (const a of ['HALF', 'QUARTER', 'OPEN_3_1'] as const) cmd(w, { type: 'foldPaper', paperId: paper, action: a });
  cmd(w, { type: 'place', id: 'funnel', support: 'ring' });
  cmd(w, { type: 'place', id: paper, support: 'funnel' });
  if (receiver) cmd(w, { type: 'setDripTarget', funnelId: 'funnel', targetId: receiver, touchingWall: true });
  if (wet) {
    pourMl(w, 'piseta', 'funnel', 0.6, 0.5);
    run(w, 20);
  }
}

/** Decantación guiada con varilla, transferencia del residuo y lavado con 2,0 mL. */
export function filter(w: World, washMl = 2.0): void {
  cmd(w, { type: 'setHandMode', mode: 'TONGS' });
  cmd(w, { type: 'grab', id: 'beaker1' });
  cmd(w, { type: 'place', id: 'beaker1', support: 'bench' });
  cmd(w, { type: 'setHandMode', mode: 'HAND' });
  cmd(w, { type: 'insertRod', vesselId: null });
  cmd(w, { type: 'setAgitation', vesselId: 'beaker1', intensity: 0, tool: 'NONE' });
  run(w, 15); // sedimentar brevemente
  pourIntoFunnel(w, 'beaker1', 'funnel', 4.5, 0.8);
  pourSolids(w, 'beaker1', 'funnel', 0.1);
  if (washMl > 0) {
    squeezeTo(w, 'beaker1', washMl);
    cmd(w, { type: 'setAgitation', vesselId: 'beaker1', intensity: 0.5, tool: 'SWIRL' });
    run(w, 3);
    cmd(w, { type: 'setAgitation', vesselId: 'beaker1', intensity: 0, tool: 'NONE' });
    pourIntoFunnel(w, 'beaker1', 'funnel', 4.5, 0.8);
    pourSolids(w, 'beaker1', 'funnel', 0.1);
  }
  waitDrip(w);
}

export function waitDrip(w: World, maxS = 900): void {
  let t = 0;
  while (t < maxS) {
    run(w, 5);
    t += 5;
    if (lv(w, 'funnel') < 0.01 && (w.vessels.funnel.funnel?.dripRateMlPerS ?? 0) < 0.002) break;
  }
}

export function splitFiltrate(w: World, receiver = 'beaker2'): number {
  cmd(w, { type: 'setAgitation', vesselId: receiver, intensity: 0.3, tool: 'SWIRL' });
  run(w, 2);
  cmd(w, { type: 'setAgitation', vesselId: receiver, intensity: 0, tool: 'NONE' });
  const ml = pourMl(w, receiver, 'cyl', 2.0, 0.4);
  pourMl(w, 'cyl', 'dish', 5, 1);
  return ml;
}

export function evaporate(w: World, pct = 60): void {
  cmd(w, { type: 'cover', vesselId: 'dish', mode: 'PARTIAL' });
  cmd(w, { type: 'place', id: 'dish', support: 'hotplate' });
  cmd(w, { type: 'setHotplatePower', pct });
  let t = 0;
  while (w.vessels.dish.mix.waterG > 0 && t < 1800) {
    run(w, 5);
    t += 5;
  }
  cmd(w, { type: 'setHotplatePower', pct: 0 });
  run(w, 240);
}

export function crystallize(w: World, beaker = 'beaker2', waitS = 1200): void {
  // Enfriar al aire hasta temperatura ambiente.
  let t = 0;
  while (w.vessels[beaker].temperatureC > w.params.ambientC + 3 && t < 1800) {
    run(w, 10);
    t += 10;
  }
  pourMl(w, 'jug', 'bath', 160, 20);
  for (let i = 0; i < 2; i++) {
    cmd(w, { type: 'scoop', toolId: 'ice_scoop', sourceId: 'ice_bucket' });
    cmd(w, { type: 'tapTool', toolId: 'ice_scoop', targetId: 'bath' });
  }
  run(w, 60);
  cmd(w, { type: 'place', id: beaker, support: 'bath' });
  run(w, waitS);
}

export function stepN(w: World, n: number) {
  for (let i = 0; i < n; i++) stepMut(w, CTX);
}

export { solids };
