/**
 * Geometría visual de F09 (cm de la sala, z = 0 en la cara de la mesada): la mesa giratoria con su base, guarda,
 * tambor escalonado y plataforma; la guía radial con la masa orbitante y su tope; la barra con las masas radiales; el
 * mástil con el sensor de fuerza; el carro del dinamómetro en el canto, el motor con embrague, el freno, la fotopuerta,
 * el encoder, el nivel, la palanca del cordón central, el registrador, la balanza y el estante. La usan la cámara
 * (lectura de frente), el controlador y las vistas, con las MISMAS medidas que el dominio (`GEOF09`).
 */
import type { F09World, MassId, SlideId } from '../../simulation/f09-world/types';
import type { RadiusTarget } from '../../simulation/f09-world/commands';
import { GEOF09, TABLE_TOP, cordPoint, rotorPoint } from '../../simulation/f09-world/geometry';
import { buildObjectsF09 } from '../../practices/practice-f09/definition';

export const DEG = Math.PI / 180;
const AX = GEOF09.axis;
const B = GEOF09.balance;
export { TABLE_TOP };

export type P3 = { x: number; y: number; z: number };

/** Poses de partida (lugar de cada pieza suelta). */
const HOME: Record<string, P3> = Object.fromEntries(buildObjectsF09().map((o) => [o.id, { x: o.pose.x, y: o.pose.y, z: o.pose.z }]));
export const homeOf = (id: string): P3 => HOME[id] ?? { x: GEOF09.massRack.x, y: GEOF09.massRack.y, z: GEOF09.massRack.h };

/** Plato de la balanza (cara superior). */
export const panRoom = (): P3 => ({ x: B.x, y: B.y, z: B.h + 0.6 });

/** Lugar en el estante de cada masa (la orbitante a la izquierda, las radiales a la derecha). */
const RACK_DX: Record<MassId, number> = { orbit01: -9, slide1: 2, slide2: 9 };
export const rackRoom = (id: MassId): P3 => ({ x: GEOF09.massRack.x + RACK_DX[id], y: GEOF09.massRack.y, z: GEOF09.massRack.h });

/** Ángulo de la sala (rad) de la guía radial: gira con la plataforma (eje +x local). */
export const guideAngle = (w: F09World) => w.rotor.theta;
/** Ángulo de la sala de cada masa radial: la barra es perpendicular a la guía (slide1 a +90°, slide2 a −90°). */
export const slideAngle = (w: F09World, id: SlideId) => w.rotor.theta + (id === 'slide1' ? Math.PI / 2 : -Math.PI / 2);

/** Centro de la base de la masa orbitante: en la guía, contra la guarda, en el estante o sobre el plato. */
export function orbitRoom(w: F09World): P3 {
  const o = w.objects.orbit01;
  if (o.support === 'balance') return panRoom();
  if (o.support === 'hand') return o.pose;
  if (o.support !== 'guide' && !w.orbit.off) return rackRoom('orbit01');
  const r = w.orbit.off ? (GEOF09.guard.r - GEOF09.orbit.r - 0.4) / 100 : w.orbit.r;
  const p = rotorPoint(r, guideAngle(w), TABLE_TOP + GEOF09.guide.h);
  return w.orbit.off ? { ...p, z: GEOF09.base.h } : p;
}

/** Centro de la base de una masa radial: sobre la barra o sobre el plato. */
export function slideRoom(w: F09World, id: SlideId): P3 {
  const o = w.objects[id];
  if (o.support === 'balance') return panRoom();
  if (o.support === 'hand') return o.pose;
  if (o.support === 'rack') return rackRoom(id);
  return rotorPoint(w.slides[id].r, slideAngle(w, id), TABLE_TOP + GEOF09.bar.h);
}

/** Punto de la fotopuerta (borde de la plataforma) y punto de salida del cordón del tambor. */
export const gateRoom = (): P3 => rotorPoint(GEOF09.table.r / 100, GEOF09.gate.angle, GEOF09.table.z);
export const cordRoom = (w: F09World): P3 => cordPoint(w.drum.armR, w.drum.dir);
/** Gancho del carro del dinamómetro (frente del cordón, en el canto). */
export const dynHook = (w: F09World): P3 => {
  const c = cordRoom(w);
  return { x: c.x, y: GEOF09.dyn.y + GEOF09.dyn.len / 2, z: GEOF09.drum.z + Math.tan(w.drum.aimDeg * DEG) * (AX.y - GEOF09.dyn.y - GEOF09.dyn.len / 2) * -1 };
};

/** Punto de la regla radial que corresponde a cada blanco y dirección (sala) en que la regla crece. */
export function rulerPoint(w: F09World, t: RadiusTarget): { p: P3; axis: P3 } {
  if (t === 'orbit01') {
    const a = guideAngle(w);
    return { p: orbitRoom(w), axis: { x: Math.cos(a), y: Math.sin(a), z: 0 } };
  }
  if (t === 'slide1' || t === 'slide2') {
    const a = slideAngle(w, t);
    return { p: slideRoom(w, t), axis: { x: Math.cos(a), y: Math.sin(a), z: 0 } };
  }
  // Brazo del tambor: la regla del escalón se lee de frente a lo largo de x en el punto donde sale el cordón.
  const c = cordRoom(w);
  return { p: c, axis: { x: -w.drum.dir, y: 0, z: 0 } };
}

/** Lo que se lee de frente o desde arriba para evitar paralaje. */
export type EyeKeyF9 = 'ruler01' | 'dyn01' | 'balance01' | 'logger01' | 'motor01' | 'level01';

/** Punto que se mira de frente para leer cada escala o pantalla. */
export function eyePoint(w: F09World, target: string, radius: RadiusTarget = 'orbit01'): P3 {
  switch (target) {
    case 'ruler01':
      return rulerPoint(w, radius).p;
    case 'dyn01':
      return { x: cordRoom(w).x, y: GEOF09.dyn.y, z: GEOF09.drum.z + 3 };
    case 'balance01':
      return { x: B.x, y: B.y - B.d / 2, z: B.h * 0.6 };
    case 'logger01':
      return { x: GEOF09.logger.x, y: GEOF09.logger.y - GEOF09.logger.d / 2, z: GEOF09.logger.h * 0.7 };
    case 'motor01':
      return { x: GEOF09.motor.x, y: GEOF09.motor.y - GEOF09.motor.d / 2, z: GEOF09.motor.h * 0.7 };
    case 'level01':
      return { x: GEOF09.level.x, y: GEOF09.level.y, z: GEOF09.base.h + 1 };
    default:
      return { x: AX.x, y: AX.y, z: TABLE_TOP };
  }
}

/** Lugar de cada objeto para la cámara, las etiquetas y el cursor de la demostración. */
export function objRoom(w: F09World, id: string): P3 {
  const o = w.objects[id];
  if (!o) return { x: 0, y: 0, z: 0 };
  switch (o.kind) {
    case 'orbitMass':
      return orbitRoom(w);
    case 'radialMass':
      return slideRoom(w, id as SlideId);
    case 'hub':
    case 'guide':
    case 'radialRuler':
      return { x: AX.x, y: AX.y, z: TABLE_TOP };
    case 'forceSensor':
      return { x: AX.x, y: AX.y, z: TABLE_TOP + GEOF09.mast.h };
    case 'guard':
      return { x: AX.x, y: AX.y - GEOF09.guard.r, z: GEOF09.guard.h / 2 };
    case 'drum':
      return { ...cordRoom(w), y: AX.y - 4 };
    case 'dynamometer':
      return { x: cordRoom(w).x, y: GEOF09.dyn.y, z: GEOF09.drum.z };
    case 'gate':
      return gateRoom();
    case 'brake':
      return rotorPoint((GEOF09.table.r + 2) / 100, GEOF09.brake.angle, GEOF09.table.z - 1);
    case 'encoder':
      return { x: AX.x + 6, y: AX.y - 6, z: 3 };
    default:
      return { x: o.pose.x, y: o.pose.y, z: o.pose.z };
  }
}
