/**
 * Geometría de los gestos sobre las piezas (§6.2). Convierte el movimiento del puntero en la cantidad física de la
 * pieza tomada, sin decidir nada del dominio:
 * - perilla/palanca: el punto agarrado del borde se mueve con la rueda; el arrastre en pantalla se proyecta sobre la
 *   tangente proyectada de ese punto (vale desde cualquier ángulo de cámara, también con la rueda vista de canto, y
 *   pasa por 0/360° sin saltos). Si el punto tomado se va al lado oculto, se vuelve a tomar el borde de delante.
 *   Devuelve radianes alrededor del eje de la pieza (regla de la mano derecha).
 * - deslizamiento: el arrastre se proyecta sobre el eje de la pieza en pantalla. Devuelve centímetros.
 */
import * as THREE from 'three';
import type { GripAxis, GripKind } from './parts';

export interface GrabTracker {
  kind: GripKind;
  /** Avance de la pieza desde la última llamada (rad o cm) para el puntero en (sx, sy) px. */
  move(sx: number, sy: number): number;
}

const AXES: Record<GripAxis, THREE.Vector3> = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
/** Por debajo de esta tangente en pantalla (px/rad o px/cm) el gesto se trata como si la tuviera (evita saltos). */
const MIN_SCREEN_RATE = 24;

type Project = (p: THREE.Vector3) => THREE.Vector2;

/** Eje y pivote en el mundo del volumen de selección de una pieza. */
export function partFrame(mesh: THREE.Object3D, axis: GripAxis) {
  mesh.updateWorldMatrix(true, false);
  const pivot = new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld);
  const q = new THREE.Quaternion();
  mesh.matrixWorld.decompose(new THREE.Vector3(), q, new THREE.Vector3());
  return { pivot, axis: AXES[axis].clone().applyQuaternion(q).normalize() };
}

export class RotaryGrab implements GrabTracker {
  readonly kind: GripKind;
  private radial: THREE.Vector3;
  private axial: THREE.Vector3;
  private last: THREE.Vector2;
  /** Dirección (⟂ al eje) del borde que mira a la cámara; nula si la rueda se ve de frente. */
  private front: THREE.Vector3;

  constructor(kind: GripKind, private pivot: THREE.Vector3, private axis: THREE.Vector3, grabbed: THREE.Vector3, viewDir: THREE.Vector3, minRadius: number, private project: Project, sx: number, sy: number) {
    this.kind = kind;
    const toCam = viewDir.clone().negate();
    this.front = toCam.sub(axis.clone().multiplyScalar(toCam.dot(axis)));
    if (this.front.length() < 0.25) this.front.set(0, 0, 0);
    else this.front.normalize();
    const rel = grabbed.clone().sub(pivot);
    this.axial = axis.clone().multiplyScalar(rel.dot(axis));
    this.radial = rel.sub(this.axial);
    // Tomada casi en el eje: se agarra el borde que mira a la cámara.
    if (this.radial.length() < minRadius * 0.4) {
      const side = new THREE.Vector3().crossVectors(axis, viewDir);
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0).cross(axis);
      this.radial = side.normalize().multiplyScalar(minRadius);
    }
    this.last = new THREE.Vector2(sx, sy);
  }

  move(sx: number, sy: number): number {
    const d = new THREE.Vector2(sx - this.last.x, sy - this.last.y);
    this.last.set(sx, sy);
    if (d.lengthSq() === 0) return 0;
    const p = this.pivot.clone().add(this.axial).add(this.radial);
    const eps = 0.01;
    const tangent = new THREE.Vector3().crossVectors(this.axis, this.radial);
    const t = this.project(p.clone().addScaledVector(tangent, eps)).sub(this.project(p)).divideScalar(eps);
    const rate2 = Math.max(t.lengthSq(), MIN_SCREEN_RATE * MIN_SCREEN_RATE);
    const dTheta = d.dot(t) / rate2;
    // El punto agarrado acompaña a la rueda; si pasa al lado oculto, la mano vuelve a tomar el borde de delante
    // (como al girar una rueda de canto): un arrastre largo y recto sigue girando en el mismo sentido.
    this.radial.applyAxisAngle(this.axis, dTheta);
    // (Las palancas tienen recorrido corto: no hace falta volver a tomarlas.)
    if (this.kind === 'rotary' && this.front.lengthSq() > 0 && this.radial.clone().normalize().dot(this.front) < 0.2) this.radial.copy(this.front).multiplyScalar(this.radial.length());
    return dTheta;
  }
}

export class LinearGrab implements GrabTracker {
  readonly kind: GripKind = 'linear';
  private last: THREE.Vector2;

  constructor(private origin: THREE.Vector3, private axis: THREE.Vector3, private project: Project, sx: number, sy: number) {
    this.last = new THREE.Vector2(sx, sy);
  }

  move(sx: number, sy: number): number {
    const d = new THREE.Vector2(sx - this.last.x, sy - this.last.y);
    this.last.set(sx, sy);
    if (d.lengthSq() === 0) return 0;
    const s = this.project(this.origin.clone().add(this.axis)).sub(this.project(this.origin));
    const cm = d.dot(s) / Math.max(s.lengthSq(), MIN_SCREEN_RATE * MIN_SCREEN_RATE);
    this.origin.addScaledVector(this.axis, cm);
    return cm;
  }
}
