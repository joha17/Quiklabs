/**
 * Geometría visual de F04 (cm de la sala, z = 0 en la cara de la mesada, suelo en z = −88): dónde están el carro sobre
 * el carril inclinado, el gancho del portapesas bajo la polea, las pesas ranuradas (estante, portapesas, carro o
 * balanza), las compuertas, el freno, el tope y la pareja de carros. La usan la cámara (lectura de frente), el
 * controlador (paralaje real y destinos al soltar) y las vistas, con las MISMAS medidas que el dominio (`GEOF04`).
 */
import type { F04World } from '../../simulation/f04-world/types';
import { FLOOR_Z, GEOF04, STRING_Z, trackX } from '../../simulation/f04-world/geometry';
import { SLOT_MASSES } from '../../simulation/f04-world/world';

export const DEG = Math.PI / 180;
const T = GEOF04.track;
const C = GEOF04.cart;
const PT = GEOF04.pairTrack;
const B = GEOF04.balance;
const R = GEOF04.massRack;
/** s del pie fijo del carril (el tornillo de nivel está en el extremo de liberación). */
const PIVOT_S = (T.xRelease - T.footFarX) / 100;

export type P3 = { x: number; y: number; z: number };

/** Altura (cm) de la cara del riel en la coordenada s: el tornillo levanta el extremo de liberación. */
export function railZ(w: F04World, s: number): number {
  return T.railZ + (PIVOT_S - s) * 100 * Math.sin(w.track.tiltDeg * DEG);
}

/** Plato de la balanza (cara superior). */
export const panRoom = (): P3 => ({ x: B.x, y: B.y, z: B.h + 0.6 });

/** Centro de la base del carro (sobre el riel o sobre la balanza). */
export function cartRoom(w: F04World): P3 {
  if (w.cart.on === 'balance') return panRoom();
  return { x: trackX(w.cart.s), y: T.y, z: railZ(w, w.cart.s) };
}

/** Gancho del sensor A en el frente del carro (lado de la polea). */
export function hookRoom(w: F04World): P3 {
  const c = cartRoom(w);
  return { x: c.x - C.len / 2 - 1.5, y: c.y, z: c.z + C.hookZ };
}

/** Punto más alto de la polea y punto de bajada del cordel (lado exterior). */
export const pulleyTop = (): P3 => ({ x: GEOF04.pulley.x, y: T.y, z: STRING_Z });
export const dropX = () => GEOF04.pulley.x - GEOF04.pulley.r;

/** Base del platillo del portapesas (cm de la sala) según dónde esté. */
export function hangerRoom(w: F04World): P3 {
  const o = w.objects.hanger01;
  switch (o.support) {
    case 'string':
      return { x: dropX(), y: T.y, z: STRING_Z - w.string.depth * 100 - GEOF04.hanger.h };
    case 'floor':
      return { x: dropX() - 3, y: T.y + 2, z: FLOOR_Z };
    case 'balance':
      return panRoom();
    default:
      return { x: o.pose.x, y: o.pose.y, z: o.pose.z };
  }
}

/** Alto (cm) de cada pesa ranurada según su masa nominal. */
export const slotH = (id: string) => (id.startsWith('m50') ? 1.6 : id.startsWith('m20') ? 0.9 : 0.6);

/** Pose de una pesa ranurada: apilada en el portapesas o sobre el carro en el orden del inventario. */
export function slotRoom(w: F04World, id: string): P3 {
  const o = w.objects[id];
  const stackOn = (on: string) => SLOT_MASSES.filter((m) => w.objects[m]?.support === on);
  if (o.support === 'hanger01') {
    const h = hangerRoom(w);
    let z = h.z + 0.4;
    for (const m of stackOn('hanger01')) {
      if (m === id) break;
      z += slotH(m);
    }
    return { x: h.x, y: h.y, z };
  }
  if (o.support === 'cart01') {
    const c = cartRoom(w);
    const i = stackOn('cart01').indexOf(id as (typeof SLOT_MASSES)[number]);
    return { x: c.x + 3 - (i % 2) * 6, y: c.y, z: c.z + C.h + 1 + Math.floor(i / 2) * 1.8 };
  }
  if (o.support === 'balance') return panRoom();
  return { x: o.pose.x, y: o.pose.y, z: o.pose.z };
}

/** Ranura del estante para una pesa (se vuelve allí al soltarla en el estante). */
export const rackSlot = (i: number): P3 => ({ x: R.x - R.w / 2 + 3 + i * 4.5, y: R.y, z: R.h });
export const hangerRackPose = (): P3 => ({ x: R.x + R.w / 2 + 6, y: R.y, z: 0 });

/** Centro de un carro de la pareja (cm de la sala). */
export function pairCartRoom(w: F04World, id: 'cartP' | 'cartQ'): P3 {
  if (w.objects[id].support === 'balance') return panRoom();
  const x = id === 'cartP' ? w.pair.xP : w.pair.xQ;
  return { x: PT.x0 + x * 100, y: PT.y, z: PT.railZ };
}

export const gateRoom = (w: F04World, id: string): P3 => {
  const s = w.gates[id]?.s ?? 0.3;
  return { x: trackX(s), y: T.y, z: railZ(w, s) };
};

/** Escala del carril: se lee en el índice de la compuerta, sobre el canto frontal del carril. */
export const scaleIndexRoom = (w: F04World, id: string): P3 => {
  const g = gateRoom(w, id);
  return { x: g.x, y: T.y - T.w / 2 - 0.5, z: g.z };
};

/** Punto que se mira de frente para leer cada escala o pantalla. */
export function eyePoint(w: F04World, target: string): P3 {
  switch (target) {
    case 'gate1':
    case 'gate2':
      return scaleIndexRoom(w, target);
    case 'balance01':
      return { x: B.x, y: B.y - B.d / 2, z: B.h * 0.6 };
    case 'logger01':
      return { x: GEOF04.logger.x, y: GEOF04.logger.y - GEOF04.logger.d / 2, z: GEOF04.logger.h * 0.7 };
    case 'cart01':
      return { ...cartRoom(w), z: cartRoom(w).z + C.h };
    case 'pair':
      return { x: (PT.x0 + PT.x1) / 2, y: PT.y, z: 6 };
    default:
      return cartRoom(w);
  }
}

/** Lugar de cada objeto para la cámara, las etiquetas y el cursor de la demostración. */
export function objRoom(w: F04World, id: string): P3 {
  const o = w.objects[id];
  if (!o) return { x: 0, y: 0, z: 0 };
  switch (o.kind) {
    case 'cart':
      return cartRoom(w);
    case 'hanger':
      return hangerRoom(w);
    case 'slotMass':
      return slotRoom(w, id);
    case 'gate':
      return gateRoom(w, id);
    case 'pairCart':
      return pairCartRoom(w, id as 'cartP' | 'cartQ');
    case 'brake':
      return { x: trackX(w.brake.s + GEOF04.brake.len / 2), y: T.y, z: railZ(w, w.brake.s) };
    case 'stop':
      return { x: trackX(w.stopS), y: T.y, z: railZ(w, w.stopS) };
    case 'forceSensor':
      if (id === 'forceA') return { ...hookRoom(w), x: hookRoom(w).x + 3, z: hookRoom(w).z + 1 };
      return { ...pairCartRoom(w, id === 'dynP' ? 'cartP' : 'cartQ'), z: PT.railZ + 6 };
    case 'accelerometer':
      return { ...cartRoom(w), z: cartRoom(w).z + C.h + 1 };
    default:
      return { x: o.pose.x, y: o.pose.y, z: o.pose.z };
  }
}
