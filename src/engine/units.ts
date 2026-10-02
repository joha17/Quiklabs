/**
 * Conversión escena ↔ laboratorio (§3.3). ÚNICO lugar donde se mezclan ambos sistemas.
 * - Laboratorio (dominio): cm de mesada; x a lo largo, y en profundidad (0 = canto frontal), z altura.
 * - Escena (Three/Rapier): 1 unidad = 1 cm; X = x, Y = z (arriba), Z = −y (hacia el observador positivo).
 */
import type { Pose } from '../simulation/entities/types';

export const CM = 1;
/** Gravedad de la escena (cm/s²), configurable. */
export const GRAVITY = -981;

export type Vec3 = [number, number, number];

export function toScene(x: number, y: number, z: number): Vec3 {
  return [x, z, -y];
}

export function fromScene(X: number, Y: number, Z: number): { x: number; y: number; z: number } {
  return { x: X, y: -Z, z: Y };
}

/**
 * Inclinación de vertido `rotationRad` (positiva = el lado derecho baja, visto de frente) → cuaternión
 * de la escena (giro alrededor del eje Z de la escena).
 */
export function tiltQuat(rotationRad: number): [number, number, number, number] {
  const a = -rotationRad / 2;
  return [0, 0, Math.sin(a), Math.cos(a)];
}

/** Pose del dominio → pose de la escena (§13: position + quaternion). */
export function poseToScene(p: Pose): { position: Vec3; quaternion: [number, number, number, number] } {
  return { position: toScene(p.x, p.y, p.z), quaternion: p.quat ?? tiltQuat(p.rotationRad) };
}
