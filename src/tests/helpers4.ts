/**
 * Utilidades de prueba de la Práctica 4: conducen el dominio igual que la capa de interacción, sin DOM ni escena.
 */
import type { P4Command } from '../simulation/reaction-world/commands';
import type { P4World } from '../simulation/reaction-world/types';
import type { FlameCommand } from '../simulation/flame-world/commands';
import { dispatchReaction, liquidMl, runReactionFor, stepReaction, surfaceZ } from '../simulation/reaction-world/world';
import { mouthPos } from '../simulation/flame-world/world';
import { contextFor, newPractice4World, type Practice4Options } from '../practices/practice-04';
import { DROPPER_BOTTLES } from '../practices/practice-04/definition';

export function world4(opts: Partial<Practice4Options> = {}): P4World {
  return newPractice4World({ mode: 'PRACTICE', seed: 4242, ...opts });
}

export const ctx4 = (w: P4World) => contextFor(w);

export function cmd4(w: P4World, c: P4Command) {
  return dispatchReaction(w, c, contextFor(w));
}

export function gas4(w: P4World, c: FlameCommand) {
  return cmd4(w, { type: 'gas', cmd: c });
}

export function run4(w: P4World, s: number) {
  runReactionFor(w, s, contextFor(w));
}

export function step4(w: P4World) {
  stepReaction(w, contextFor(w));
}

export const pose = (x: number, y: number, z: number) => ({ x, y, z, rotationRad: 0 });

/** Vierte `ml` desde `src` a `target` a caudal moderado (como un vertido controlado). */
export function pourMl(w: P4World, src: string, target: string | null, ml: number, rate = 1.5) {
  cmd4(w, { type: 'setPour', sourceId: src, targetId: target, rateMlS: rate, tiltDeg: 60 });
  const steps = Math.ceil(ml / rate / w.params.dtS);
  let moved = 0;
  for (let i = 0; i < steps * 2 && moved < ml - 1e-9; i++) {
    const before = liquidMl(w.vessels[src]);
    const left = ml - moved;
    if (left < rate * w.params.dtS) cmd4(w, { type: 'setPour', sourceId: src, targetId: target, rateMlS: left / w.params.dtS, tiltDeg: 60 });
    step4(w);
    moved += before - liquidMl(w.vessels[src]);
    if (before - liquidMl(w.vessels[src]) <= 0) break;
  }
  cmd4(w, { type: 'stopPour', sourceId: src });
  return moved;
}

/** Mide `ml` exactos en una probeta (vertido del frasco y lectura correcta del menisco). */
export function measure(w: P4World, bottle: string, cyl: string, ml: number) {
  return pourMl(w, bottle, cyl, ml, 2);
}

/** Gotero: aspira de su frasco y suelta `drops` gotas en el receptor (vuelve a cargar si se vacía). */
export function drops(w: P4World, bottle: string, target: string, count: number) {
  const dropper = DROPPER_BOTTLES[bottle].dropper;
  cmd4(w, { type: 'setPose', id: dropper, pose: pose(w.objects[bottle].pose.x, w.objects[bottle].pose.y, 3), support: `in:${bottle}` });
  cmd4(w, { type: 'aspirate', dropperId: dropper, sourceId: bottle });
  for (let i = 0; i < count; i++) {
    if (liquidMl(w.vessels[dropper]) < 0.06) cmd4(w, { type: 'aspirate', dropperId: dropper, sourceId: bottle });
    cmd4(w, { type: 'drop', dropperId: dropper, targetId: target });
    run4(w, 0.25);
  }
  // Lo que sobra vuelve a su frasco (sin contaminar: es el mismo reactivo) y el gotero a su tapa.
  cmd4(w, { type: 'emptyDropper', dropperId: dropper, targetId: bottle });
  cmd4(w, { type: 'setPose', id: dropper, pose: pose(w.objects[bottle].pose.x, w.objects[bottle].pose.y, 1.2), support: `cap:${bottle}` });
}

/** Agita con la varilla durante `s` segundos. */
export function stir(w: P4World, id: string, s: number, intensity = 0.5) {
  const o = w.objects[id];
  cmd4(w, { type: 'setPose', id: 'rod', pose: pose(o.pose.x, o.pose.y, o.pose.z + 1), support: `in:${id}` });
  for (let t = 0; t < s; t += 0.2) {
    cmd4(w, { type: 'setAgitation', id, tool: 'ROD', intensity });
    run4(w, 0.2);
  }
}

export function shake(w: P4World, id: string, s: number, intensity = 0.5) {
  for (let t = 0; t < s; t += 0.2) {
    cmd4(w, { type: 'setAgitation', id, tool: 'SHAKE', intensity });
    run4(w, 0.2);
  }
}

/** Inspección previa del mechero y encendido según la guía (mismo procedimiento que la Práctica 3). */
export function lightBurner(w: P4World) {
  for (const t of ['extinguisher', 'blanket', 'estop', 'hose', 'burner']) cmd4(w, { type: 'inspect', target: t });
  gas4(w, { type: 'setExtraction', on: true });
  gas4(w, { type: 'connectHose', connected: true });
  const m = mouthPos(w.gas, contextFor(w).gasCtx);
  gas4(w, { type: 'setValve', valve: 'AIR', value: 0 });
  gas4(w, { type: 'setValve', valve: 'TABLE', value: 1 });
  gas4(w, { type: 'setPose', id: 'lighter', pose: pose(m.x + 1, m.y, m.z + 0.6), support: 'hand' });
  gas4(w, { type: 'spark', on: true });
  for (let i = 1; i <= 12; i++) {
    gas4(w, { type: 'setValve', valve: 'NEEDLE', value: (0.3 * i) / 12 });
    step4(w);
  }
  gas4(w, { type: 'spark', on: false });
  gas4(w, { type: 'setPose', id: 'lighter', pose: pose(398, 12, 1.2), support: 'bench' });
  run4(w, 1);
  for (const a of [0.15, 0.3, 0.45, 0.6, 0.7]) {
    gas4(w, { type: 'setValve', valve: 'AIR', value: a });
    run4(w, 0.5);
  }
  gas4(w, { type: 'setValve', valve: 'NEEDLE', value: 0.5 });
  run4(w, 1);
}

export function burnerOff(w: P4World) {
  gas4(w, { type: 'setValve', valve: 'AIR', value: 0 });
  run4(w, 0.3);
  gas4(w, { type: 'setValve', valve: 'NEEDLE', value: 0 });
  run4(w, 0.3);
  gas4(w, { type: 'setValve', valve: 'TABLE', value: 0 });
  run4(w, 0.5);
  cmd4(w, { type: 'inspect', target: 'burner' });
}

/** Punto caliente de la llama (sobre la punta del cono interno). */
export function hotPoint(w: P4World) {
  const m = mouthPos(w.gas, contextFor(w).gasCtx);
  return pose(m.x, m.y, m.z + Math.max(1.5, w.gas.burner.flame.innerConeHeightCm * 1.15));
}

/** Combustión del Mg completa: advertencia, pantalla, cápsula debajo, pinza para crisol, llama y residuo a la cápsula. */
export function burnMg(w: P4World, ribbon = 'mg1', opts: { capsuleUnder?: boolean; holdS?: number } = {}) {
  const m = mouthPos(w.gas, contextFor(w).gasCtx);
  cmd4(w, { type: 'acceptMgWarning' });
  cmd4(w, { type: 'setShield', alignment: 1, placed: true });
  cmd4(w, { type: 'setPose', id: 'shield', pose: pose(m.x, m.y - 20, 0), support: 'stand' });
  // Cápsula junto al mechero, donde caerá el residuo.
  const capPos = pose(m.x + 9, m.y - 2, 0);
  cmd4(w, { type: 'setPose', id: 'capsule', pose: capPos, support: 'bench' });
  cmd4(w, { type: 'clamp', tongsId: 'crucible_tongs', targetId: ribbon, grip: 0.9 });
  cmd4(w, { type: 'setPose', id: ribbon, pose: hotPoint(w), support: 'tongs:crucible_tongs' });
  for (let i = 0; i < 80 && w.ribbons[ribbon].phase !== 'BRIGHT_COMBUSTION'; i++) step4(w);
  // Una vez encendida se retira parcialmente de la llama y se mantiene sobre la cápsula (§13.2-6).
  run4(w, 0.6);
  const over = opts.capsuleUnder === false ? pose(m.x + 9, m.y + 15, 6) : pose(capPos.x, capPos.y, 6);
  cmd4(w, { type: 'setPose', id: ribbon, pose: over, support: 'tongs:crucible_tongs' });
  run4(w, opts.holdS ?? 8);
  cmd4(w, { type: 'unclamp', tongsId: 'crucible_tongs' });
  step4(w);
}

/** Lleva el clavo con la pinza al tubo y lo deja dentro. */
export function nailInto(w: P4World, tube: string) {
  const t = w.objects[tube];
  cmd4(w, { type: 'clamp', tongsId: 'tube_tongs', targetId: 'nail', grip: 0.9 });
  cmd4(w, { type: 'setPose', id: 'nail', pose: pose(t.pose.x, t.pose.y, t.pose.z + 18), support: 'tongs:tube_tongs' });
  cmd4(w, { type: 'unclamp', tongsId: 'tube_tongs' });
  cmd4(w, { type: 'setPose', id: 'nail', pose: pose(t.pose.x, t.pose.y, t.pose.z + 0.3), support: `in:${tube}` });
}

export function liquidLevel(w: P4World, id: string) {
  return surfaceZ(w, contextFor(w), id);
}
