/**
 * Utilidades de prueba de la Práctica 3: conducen el dominio igual que la capa de interacción, sin DOM ni escena.
 */
import type { FlameCommand } from '../simulation/flame-world/commands';
import type { FlameWorld } from '../simulation/flame-world/types';
import { dispatchFlame, mouthPos, runFlameFor, stepFlame } from '../simulation/flame-world/world';
import { CTX3, newPractice3World, type Practice3Options } from '../practices/practice-03';
import { HOLDER_POS, TILE_POS, holderSlotPose, loopIdFor } from '../practices/practice-03/definition';
import { TILE } from '../practices/practice-03/instruments';

export const ctx3 = CTX3;

export function world3(opts: Partial<Practice3Options> = {}): FlameWorld {
  return newPractice3World({ mode: 'PRACTICE', seed: 12345, ...opts });
}

export function cmd3(w: FlameWorld, c: FlameCommand) {
  return dispatchFlame(w, c, CTX3);
}

export function run3(w: FlameWorld, s: number) {
  runFlameFor(w, s, CTX3);
}

export const pose = (x: number, y: number, z: number) => ({ x, y, z, rotationRad: 0 });

/** Inspección previa completa (§7.1). */
export function precheck(w: FlameWorld) {
  cmd3(w, { type: 'confirmPpe' });
  for (const t of ['extinguisher', 'blanket', 'estop', 'hose', 'burner']) cmd3(w, { type: 'inspect', target: t });
  cmd3(w, { type: 'setExtraction', on: true });
  cmd3(w, { type: 'connectHose', connected: true });
}

/** Encendido según la guía: aire cerrado, llave de mesa, chispero en la boca, aguja abierta poco a poco. */
export function ignite(w: FlameWorld, needle = 0.3) {
  const m = mouthPos(w, CTX3);
  cmd3(w, { type: 'setValve', valve: 'AIR', value: 0 });
  cmd3(w, { type: 'setValve', valve: 'TABLE', value: 1 });
  cmd3(w, { type: 'setPose', id: 'lighter', pose: pose(m.x + 1, m.y, m.z + 0.6), support: 'hand' });
  cmd3(w, { type: 'spark', on: true });
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    cmd3(w, { type: 'setValve', valve: 'NEEDLE', value: (needle * i) / steps });
    stepFlame(w, CTX3);
  }
  cmd3(w, { type: 'spark', on: false });
  cmd3(w, { type: 'setPose', id: 'lighter', pose: pose(170, 12, 1.2), support: 'bench' });
  run3(w, 1);
}

/** Abre el aire poco a poco y ajusta el gas para una llama azul de ~10 cm. */
export function makeBlue(w: FlameWorld) {
  for (const a of [0.15, 0.3, 0.45, 0.6, 0.7]) {
    cmd3(w, { type: 'setValve', valve: 'AIR', value: a });
    run3(w, 0.5);
  }
  cmd3(w, { type: 'setValve', valve: 'NEEDLE', value: 0.5 });
  run3(w, 1);
}

/** Apagado según la guía. */
export function shutdown(w: FlameWorld) {
  cmd3(w, { type: 'setValve', valve: 'AIR', value: 0 });
  run3(w, 0.5);
  cmd3(w, { type: 'setValve', valve: 'NEEDLE', value: 0 });
  run3(w, 0.5);
  cmd3(w, { type: 'setValve', valve: 'TABLE', value: 0 });
  run3(w, 0.5);
  cmd3(w, { type: 'inspect', target: 'burner' });
}

/** Posición óptima de la muestra: sobre la punta del cono interno. */
export function optimalPoint(w: FlameWorld) {
  const m = mouthPos(w, CTX3);
  return pose(m.x, m.y + 0.2, m.z + Math.max(1.5, w.burner.flame.innerConeHeightCm * 1.15));
}

export function capsuleToFlame(w: FlameWorld, dz = 5) {
  const m = mouthPos(w, CTX3);
  cmd3(w, { type: 'clamp', tongsId: 'tongs', targetId: 'capsule', grip: 0.9 });
  cmd3(w, { type: 'setPose', id: 'capsule', pose: pose(m.x, m.y, m.z + dz), support: 'tongs:tongs' });
}

export function capsuleToTile(w: FlameWorld) {
  cmd3(w, { type: 'setPose', id: 'capsule', pose: pose(TILE_POS.x, TILE_POS.y, TILE.h), support: 'tongs:tongs' });
  cmd3(w, { type: 'unclamp', tongsId: 'tongs' });
  cmd3(w, { type: 'setPose', id: 'capsule', pose: pose(TILE_POS.x, TILE_POS.y, TILE.h), support: 'tile' });
}

/** Sumerge el aro del asa en el tubo, lo retira y lo lleva a la región óptima de la llama. */
export function loadLoop(w: FlameWorld, solutionId: string, loopId = loopIdFor(solutionId), depth = 0.6) {
  const tube = w.objects[solutionId];
  const sol = w.solutions[solutionId];
  const surf = tube.pose.z + CTX3.geo.tube.bottomZ + sol.volumeMl * CTX3.geo.tube.cmPerMl;
  cmd3(w, { type: 'setPose', id: loopId, pose: pose(tube.pose.x, tube.pose.y, surf - depth), support: 'hand' });
  run3(w, 1);
  cmd3(w, { type: 'setPose', id: loopId, pose: pose(tube.pose.x, tube.pose.y, tube.pose.z + 18), support: 'hand' });
  stepFlame(w, CTX3);
}

export function loopToFlame(w: FlameWorld, loopId: string, s = 4) {
  cmd3(w, { type: 'setPose', id: loopId, pose: optimalPoint(w), support: 'hand' });
  run3(w, s);
}

export function loopToHolder(w: FlameWorld, loopId: string, slot: number) {
  cmd3(w, { type: 'setPose', id: loopId, pose: holderSlotPose(slot), support: `holder:${slot}` });
}

export { HOLDER_POS };
