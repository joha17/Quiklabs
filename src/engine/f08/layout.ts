/**
 * Geometría visual de F08 (cm de la sala, z = 0 en la cara de la mesada, el piso en z = −88): el soporte giratorio con
 * su base y transportador, la guarda, el eje con el tambor escalonado y la plataforma; los sólidos (sobre el eje o en la
 * bandeja), las masas corredizas sobre la barra, la cuerda con su polea, la masa colgante, la columna de caída con el
 * tope y la fotopuerta, el encoder, el tacómetro, el sensor de tensión, la balanza, el estante, el calibre y el
 * registrador. La usan la cámara (lectura de frente), el controlador y las vistas, con las MISMAS medidas que el dominio
 * (`GEOF08`).
 */
import type { DropId, F08World, SlideId, SolidId } from '../../simulation/f08-world/types';
import { GEOF08, rotorPoint } from '../../simulation/f08-world/geometry';
import { buildObjectsF08 } from '../../practices/practice-f08/definition';
import { massZ } from '../../simulation/f08-world/conservation';

export const DEG = Math.PI / 180;
const AX = GEOF08.axis;
const B = GEOF08.balance;
const C = GEOF08.column;
export const TABLE_TOP = GEOF08.table.z + GEOF08.table.h;
/** Espesor de cada sólido (cm): disco 1,2, aro 2, barra 1,5. */
export const SOLID_H: Record<SolidId, number> = { disc01: 1.2, ring01: 2, bar01: 1.5 };

export type P3 = { x: number; y: number; z: number };

/** Poses de partida (lugar de cada pieza suelta). */
const HOME: Record<string, P3> = Object.fromEntries(buildObjectsF08().map((o) => [o.id, { x: o.pose.x, y: o.pose.y, z: o.pose.z }]));
export const homeOf = (id: string): P3 => HOME[id] ?? { x: GEOF08.massRack.x, y: GEOF08.massRack.y, z: GEOF08.massRack.h };

/** Plato de la balanza (cara superior). */
export const panRoom = (): P3 => ({ x: B.x, y: B.y, z: B.h + 0.6 });

/** Línea vertical por la que baja la cuerda (delante de la polea). */
export const dropLine = (w: F08World): P3 => ({ x: AX.x + w.string.drumR * 100, y: GEOF08.pulley.y - GEOF08.pulley.r, z: GEOF08.drum.z });

/** Centro de la base de un sólido (sobre la plataforma, en la bandeja o sobre el plato). */
export function solidRoom(w: F08World, id: SolidId): P3 {
  const o = w.objects[id];
  if (o.support === 'hub') {
    const r = w.rotor;
    const d = Math.hypot(r.hole, r.ecc);
    return rotorPoint(d, r.theta + (r.ecc > 0 && r.hole === 0 ? 0.7 : 0), TABLE_TOP);
  }
  if (o.support === 'balance') return panRoom();
  return homeOf(id);
}

/** Ángulo dibujado de un sólido (rad): gira con el rotor sobre el eje; en la bandeja, la barra a lo largo de x. */
export const solidAngle = (w: F08World, id: SolidId) => (w.objects[id].support === 'hub' ? w.rotor.theta : 0);

/** Centro de una masa corrediza: sobre la barra (donde esté la barra) o sobre el plato. */
export function slideRoom(w: F08World, id: SlideId): P3 {
  const o = w.objects[id];
  if (o.support === 'balance') return panRoom();
  const bar = solidRoom(w, 'bar01');
  const ang = solidAngle(w, 'bar01') + (id === 'slide2' ? Math.PI : 0);
  const r = w.slides[id].r * 100;
  return { x: bar.x + Math.cos(ang) * r, y: bar.y + Math.sin(ang) * r, z: bar.z + SOLID_H.bar01 };
}

/** Base de una pesa de caída: colgando de la cuerda, en el estante o sobre el plato. */
export function dropRoom(w: F08World, id: DropId): P3 {
  const o = w.objects[id];
  if (o.support === 'hook') {
    const l = dropLine(w);
    return { x: l.x, y: l.y, z: massZ(w) };
  }
  if (o.support === 'balance') return panRoom();
  return homeOf(id);
}

/** Tope blando y haz de la fotopuerta en la columna de caída. */
export const catchRoom = (w: F08World): P3 => ({ x: dropLine(w).x, y: dropLine(w).y, z: w.column.catchZ });
export const gateRoom = (w: F08World): P3 => ({ x: dropLine(w).x, y: dropLine(w).y, z: w.column.gateZ });

/** Índice del transportador (frente del eje) y marca de la plataforma. */
export const protractorIndex = (): P3 => ({ x: AX.x, y: AX.y - GEOF08.table.r - 1.5, z: GEOF08.base.h + 0.2 });

/** Punto que se mira de frente para leer cada escala o pantalla. */
export function eyePoint(w: F08World, target: string): P3 {
  switch (target) {
    case 'base01':
      return protractorIndex();
    case 'ruler01':
    case 'slide1':
      return slideRoom(w, 'slide1');
    case 'slide2':
      return slideRoom(w, 'slide2');
    case 'balance01':
      return { x: B.x, y: B.y - B.d / 2, z: B.h * 0.6 };
    case 'logger01':
      return { x: GEOF08.logger.x, y: GEOF08.logger.y - GEOF08.logger.d / 2, z: GEOF08.logger.h * 0.7 };
    case 'column01':
      return gateRoom(w);
    case 'tach01':
      return { x: GEOF08.tach.x, y: GEOF08.tach.y, z: GEOF08.tach.h };
    case 'caliper01':
      return { x: GEOF08.caliper.x, y: GEOF08.caliper.y, z: 2 };
    default:
      return { x: AX.x, y: AX.y, z: TABLE_TOP };
  }
}

/** Lugar de cada objeto para la cámara, las etiquetas y el cursor de la demostración. */
export function objRoom(w: F08World, id: string): P3 {
  const o = w.objects[id];
  if (!o) return { x: 0, y: 0, z: 0 };
  switch (o.kind) {
    case 'solid':
      return solidRoom(w, id as SolidId);
    case 'slideMass':
      return slideRoom(w, id as SlideId);
    case 'dropMass':
      return dropRoom(w, id as DropId);
    case 'radialRuler': {
      const b = solidRoom(w, 'bar01');
      return { ...b, z: b.z + SOLID_H.bar01 };
    }
    case 'hub':
      return { x: AX.x, y: AX.y, z: TABLE_TOP };
    case 'guard':
      return { x: AX.x, y: AX.y - GEOF08.guard.r, z: GEOF08.guard.h / 2 };
    case 'pulley':
      return { x: AX.x + w.string.drumR * 100, y: GEOF08.pulley.y, z: GEOF08.drum.z };
    case 'catch':
      return catchRoom(w);
    case 'gate':
      return gateRoom(w);
    case 'dropColumn':
      return { x: dropLine(w).x + C.dx, y: dropLine(w).y, z: -40 };
    case 'tensionSensor':
      return { x: dropLine(w).x, y: 8, z: GEOF08.drum.z };
    case 'encoder':
      return { x: AX.x, y: AX.y - 4, z: 4 };
    default:
      return { x: o.pose.x, y: o.pose.y, z: o.pose.z };
  }
}
