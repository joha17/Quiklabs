/**
 * Cuerpo macizo de lo que se lleva en la mano: compara el volumen completo del objeto (no solo su origen) con lo que
 * descansa en la mesada. Lo bajo se pasa por encima; lo muy alto (la varilla de un soporte) no se puede sobrevolar.
 */
import * as THREE from 'three';
import { sweepOnBench, type BenchRect } from './viewport';

/** Lo que llega más alto no se sobrevuela: detiene (la pantalla, la varilla de un soporte). */
const TALL_Z = 30;
const POINT_R = 0.3;
const GAP = 0.2;
/** Lo que empieza más arriba está en el aire (pinza de un soporte): no estorba al arrastrar. */
const GROUND_Z = 3;
/** Hasta esta altura, lo arrastrado por la mesada puede montarse encima (base de un soporte, bandeja). */
const FLAT_Z = 2;
const box = new THREE.Box3();

/** Herramientas cuya punta debe acercarse a otro objeto para trabajar: conservan solo el control por su punta. */
export const TIP_TOOLS: ReadonlySet<string> = new Set(['tongs', 'crucibleTongs', 'tubeTongs', 'loop', 'dropper', 'pipette', 'rod', 'probe', 'spatula', 'tip', 'thermometer', 'phPaper', 'towel', 'cloth', 'brush']);

/** Planta de una caja de la escena (z de la escena = -y de la mesada). */
const planOf = (b: THREE.Box3): BenchRect => ({ x0: b.min.x, x1: b.max.x, y0: -b.max.z, y1: -b.min.z });

function boxesOf(meshes: Iterable<THREE.Mesh>, id: string): THREE.Box3[] {
  const out: THREE.Box3[] = [];
  for (const m of meshes) if (m.userData.objId === id) out.push(new THREE.Box3().setFromObject(m));
  return out;
}

/** Altura mínima del origen para que el cuerpo de `id`, llevado a (x, y), no entre en los objetos `resting`. */
export function solidFloorOf(meshes: Iterable<THREE.Mesh>, id: string, cur: { x: number; y: number; z: number }, x: number, y: number, resting: readonly string[]): number {
  const body = boxesOf(meshes, id);
  if (!body.length) return 0;
  const rest = new Set(resting);
  rest.delete(id);
  const dx = x - cur.x;
  // La escena usa z = -y de la mesada.
  const dz = -(y - cur.y);
  let floor = 0;
  for (const m of meshes) {
    if (!rest.has(m.userData.objId as string)) continue;
    box.setFromObject(m);
    if (box.max.y > TALL_Z) continue;
    for (const b of body) {
      const overlaps = b.min.x + dx < box.max.x && b.max.x + dx > box.min.x && b.min.z + dz < box.max.z && b.max.z + dz > box.min.z;
      if (overlaps) floor = Math.max(floor, box.max.y + GAP - (b.min.y - cur.z));
    }
  }
  return floor;
}

/** Primer punto cercano donde el objeto, apoyado a altura z, no queda dentro de otro (tolera lo plano, como una bandeja). */
export function clearSpotNear(floorAt: (x: number, y: number) => number, x: number, y: number, z: number): { x: number; y: number } {
  for (let k = 0; k < 16; k++) {
    const ty = Math.max(3, Math.min(60, y - k * 3));
    for (const dx of [0, -5, 5, -10, 10, -16, 16, -24, 24]) if (floorAt(x + dx, ty) <= z + 2) return { x: x + dx, y: ty };
  }
  return { x, y };
}

/**
 * Lo que no se puede sobrevolar detiene el objeto: lo alto que nace en la mesada para cualquiera, y todo lo que no sea
 * plano para lo que se arrastra pegado a ella (`grounded`, el mechero). El movimiento se recorre paso a paso desde la
 * pose actual, por eje: el objeto se detiene al tocar y se desliza por la superficie, sin saltar al otro lado aunque
 * el puntero ya esté detrás. Lo que ya estaba solapado al empezar no retiene (se puede sacar un objeto atascado).
 * `point`: solo cuenta la punta, para las herramientas que trabajan con ella.
 */
export function solidPushOf(meshes: Iterable<THREE.Mesh>, id: string, cur: { x: number; y: number; z?: number }, x: number, y: number, resting: readonly string[], grounded: boolean, point = false): { x: number; y: number } {
  const body = point
    ? [new THREE.Box3(new THREE.Vector3(cur.x - POINT_R, 0, -cur.y - POINT_R), new THREE.Vector3(cur.x + POINT_R, 1, -cur.y + POINT_R))]
    : boxesOf(meshes, id);
  if (!body.length) return { x, y };
  const rest = new Set(resting);
  rest.delete(id);
  const bottom = point ? cur.z ?? 0 : Math.min(...body.map((b) => b.min.y));
  const blockers: BenchRect[] = [];
  for (const m of meshes) {
    if (!rest.has(m.userData.objId as string)) continue;
    box.setFromObject(m);
    if (box.min.y > GROUND_Z) continue;
    if (grounded ? box.max.y <= FLAT_Z : box.max.y <= TALL_Z) continue;
    // Lo que ya va por encima pasa libre: una botella sobre la probeta para verter.
    if (bottom >= box.max.y) continue;
    blockers.push(planOf(box));
  }
  return sweepOnBench(cur, x, y, body.map(planOf), blockers);
}
