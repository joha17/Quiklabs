/**
 * Geometría visual de F07 (cm de la sala, z = 0 en la cara de la mesada): el riel con su inclinación verdadera, los
 * topes amortiguados y los lanzadores de émbolo, los dos carros (sobre el riel o sobre el plato) con sus pesas, la
 * bandera y el paragolpes; las fotopuertas, el nivel de burbuja, la regla de posición, la cámara, la balanza, el
 * estante, el calibre, el estuche de paragolpes y el registrador. La usan la cámara (lectura de frente), el
 * controlador (paralaje real y destinos al soltar) y las vistas, con las MISMAS medidas que el dominio (`GEOF07`).
 */
import type { CartId, F07World } from '../../simulation/f07-world/types';
import { CART_A_START, CART_B_LAUNCH, GEOF07, trackPoint } from '../../simulation/f07-world/geometry';
import { buildObjectsF07 } from '../../practices/practice-f07/definition';
import { CART_MASSES, tiltDegF7 } from '../../simulation/f07-world/world';

export const DEG = Math.PI / 180;
const TR = GEOF07.track;
const B = GEOF07.balance;
const CA = GEOF07.cart;
const LA = GEOF07.launcher;

export type P3 = { x: number; y: number; z: number };

/** Poses de partida (lugar de cada pieza suelta en el estante). */
const HOME: Record<string, P3> = Object.fromEntries(buildObjectsF07().map((o) => [o.id, { x: o.pose.x, y: o.pose.y, z: o.pose.z }]));
export const rackSlot = (id: string): P3 => HOME[id] ?? { x: GEOF07.massRack.x, y: GEOF07.massRack.y, z: GEOF07.massRack.h };

/** Inclinación dibujada del riel (°, + baja hacia la derecha): la verdadera, que es menor que 2°. */
export const trackTilt = (w: F07World) => tiltDegF7(w);

/** Punto de la cara del riel en s (m), `up` cm sobre la cara y `lateral` cm hacia el fondo (con la inclinación real). */
export function trackAt(w: F07World, s: number, up = 0, lateral = 0): P3 {
  const p = trackPoint(s, up);
  const dz = -Math.tan(trackTilt(w) * DEG) * (s - TR.len / 2) * 100;
  return { x: p.x, y: TR.y + lateral, z: p.z + dz };
}

/** Plato de la balanza (cara superior). */
export const panRoom = (): P3 => ({ x: B.x, y: B.y, z: B.h + 0.6 });

/** Centro de la base de un carro (sobre el riel o sobre el plato). */
export function cartRoom(w: F07World, c: CartId): P3 {
  if (w.carts[c].on === 'balance') return panRoom();
  return trackAt(w, w.carts[c].s, 0, w.carts[c].offsetMm / 10);
}

/** Cara libre del émbolo de cada lanzador (s, m): sigue al carro trabado o queda en su tope. */
export function plungerS(w: F07World, c: CartId): number {
  const k = w.carts[c];
  if (c === 'cartA') return k.on === 'track' && k.latched ? k.s - CA.halfM : LA.left;
  return k.on === 'track' && k.latched ? k.s + CA.halfM : LA.right;
}

/** Pesas cargadas sobre un carro, apiladas. */
export function cartMassRoom(w: F07World, id: string): P3 {
  const o = w.objects[id];
  if (o.support === 'cartA' || o.support === 'cartB') {
    const c = o.support as CartId;
    const i = CART_MASSES.filter((m) => w.objects[m].support === c).indexOf(id as (typeof CART_MASSES)[number]);
    const p = cartRoom(w, c);
    return { x: p.x, y: p.y, z: p.z + CA.h + 0.6 + i * 1.6 };
  }
  if (o.support === 'balance') return panRoom();
  if (o.support === 'hand') return { x: o.pose.x, y: o.pose.y, z: o.pose.z };
  return rackSlot(id);
}

/** Fotopuerta en su s, sobre el riel. */
export const gateRoom = (w: F07World, id: string): P3 => trackAt(w, w.gates[id]?.s ?? 0.5);

/** Burbuja del nivel (al costado del riel, del lado del operador). */
export const levelRoom = (w: F07World): P3 => trackAt(w, GEOF07.level.s, 1.5, GEOF07.level.dy);

/** Regla de posición delante del riel: punto de lectura frente a un carro. */
export const rulerRoom = (w: F07World, c: CartId): P3 => ({ x: cartRoom(w, c).x, y: GEOF07.posRuler.y, z: TR.z0 + 1 });

/** Punto que se mira de frente para leer cada escala o pantalla. */
export function eyePoint(w: F07World, target: string): P3 {
  switch (target) {
    case 'level01':
      return levelRoom(w);
    case 'ruler01':
      return rulerRoom(w, 'cartA');
    case 'balance01':
      return { x: B.x, y: B.y - B.d / 2, z: B.h * 0.6 };
    case 'logger01':
      return { x: GEOF07.logger.x, y: GEOF07.logger.y - GEOF07.logger.d / 2, z: GEOF07.logger.h * 0.7 };
    case 'camera01':
      return { x: GEOF07.camera.x, y: GEOF07.camera.y, z: GEOF07.camera.z };
    case 'caliper01':
      return { x: GEOF07.caliper.x, y: GEOF07.caliper.y, z: 2 };
    case 'launcherA':
      return trackAt(w, LA.left, 4);
    case 'launcherB':
      return trackAt(w, LA.right, 4);
    case 'cartB':
      return { ...cartRoom(w, 'cartB'), z: cartRoom(w, 'cartB').z + CA.h };
    case 'cartA':
    default:
      return { ...cartRoom(w, 'cartA'), z: cartRoom(w, 'cartA').z + CA.h };
  }
}

/** Lugar de cada objeto para la cámara, las etiquetas y el cursor de la demostración. */
export function objRoom(w: F07World, id: string): P3 {
  const o = w.objects[id];
  if (!o) return { x: 0, y: 0, z: 0 };
  switch (o.kind) {
    case 'track':
      return trackAt(w, TR.len / 2);
    case 'endStop':
      return trackAt(w, 0.01, 3);
    case 'launcher':
      return trackAt(w, id === 'launcherA' ? LA.left / 2 : (LA.right + TR.len) / 2, 3);
    case 'level':
      return levelRoom(w);
    case 'cart':
      return cartRoom(w, id as CartId);
    case 'cartMass':
      return cartMassRoom(w, id);
    case 'gate':
      return gateRoom(w, id);
    case 'forceSensor': {
      const p = cartRoom(w, 'cartB');
      return { x: p.x - CA.len / 2 + 2, y: p.y, z: p.z + CA.h + 1 };
    }
    case 'posRuler':
      return { x: TR.x0 + TR.len * 50, y: GEOF07.posRuler.y, z: TR.z0 };
    case 'camera':
      return { x: GEOF07.camera.x, y: GEOF07.camera.y, z: GEOF07.camera.z };
    default:
      return { x: o.pose.x, y: o.pose.y, z: o.pose.z };
  }
}

export { CART_A_START, CART_B_LAUNCH };
