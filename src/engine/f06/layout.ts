/**
 * Geometría visual de F06 (cm de la sala, z = 0 en la cara de la mesada): dónde están el soporte con su resorte, el
 * porta-pesas y la regla; el riel con su perfil (llano, subida y parte alta), el lanzador con el émbolo, el carro y sus
 * pesas, las compuertas, el medidor de altura, el freno, el patín y el amortiguador; el péndulo con su escala; la
 * balanza, el estante y el registrador. La usan la cámara (lectura de frente), el controlador (paralaje real y
 * destinos al soltar) y las vistas, con las MISMAS medidas que el dominio (`GEOF06`).
 */
import type { F06World } from '../../simulation/f06-world/types';
import { CART_START_S, GEOF06, trackPoint, trackSlope } from '../../simulation/f06-world/geometry';
import { buildObjectsF06 } from '../../practices/practice-f06/definition';
import { CART_MASSES, SLOTS } from '../../simulation/f06-world/world';

export const DEG = Math.PI / 180;
const TR = GEOF06.track;
const ST = GEOF06.stand;
const B = GEOF06.balance;
const PD = GEOF06.pend;
const CA = GEOF06.cart;
const LA = GEOF06.launcher;

export type P3 = { x: number; y: number; z: number };

/** Poses de partida (lugar de cada pieza suelta en el estante). */
const HOME: Record<string, P3> = Object.fromEntries(buildObjectsF06().map((o) => [o.id, { x: o.pose.x, y: o.pose.y, z: o.pose.z }]));
export const rackSlot = (id: string): P3 => HOME[id] ?? { x: GEOF06.massRack.x, y: GEOF06.massRack.y, z: GEOF06.massRack.h };

/** Punto de la cara del riel en s (m), `up` cm sobre la cara (vertical) y `lateral` cm hacia el fondo. */
export function trackAt(w: F06World, s: number, up = 0, lateral = 0): P3 {
  const p = trackPoint(s, w.track.h, up);
  return { x: p.x, y: TR.y + lateral, z: p.z };
}

/** Inclinación del riel en s (°). */
export const trackTilt = (w: F06World, s: number) => Math.atan(trackSlope(s, w.track.h)) / DEG;

/** Plato de la balanza (cara superior). */
export const panRoom = (): P3 => ({ x: B.x, y: B.y, z: B.h + 0.6 });

/** Centro de la base del carro (sobre el riel o el plato). */
export function cartRoom(w: F06World): P3 {
  if (w.cart.on === 'balance') return panRoom();
  return trackAt(w, w.cart.s);
}
export const cartTilt = (w: F06World) => (w.cart.on === 'track' ? trackTilt(w, w.cart.s) : 0);

/** Cara del émbolo del lanzador (s, m): sigue al carro mientras lo toca; si no, queda libre en su tope. */
export function plungerS(w: F06World): number {
  const back = w.cart.on === 'track' ? w.cart.s - GEOF06.cart.halfM : LA.plunger0;
  return Math.min(LA.plunger0, Math.max(LA.back + 0.02, back));
}

/** Pesas del carro apiladas sobre él. */
export function cartMassRoom(w: F06World, id: string): P3 {
  const o = w.objects[id];
  if (o.support === 'cart') {
    const i = CART_MASSES.filter((m) => w.objects[m].support === 'cart').indexOf(id as (typeof CART_MASSES)[number]);
    const c = cartRoom(w);
    const th = cartTilt(w) * DEG;
    const up = CA.h + 0.6 + i * 1.6;
    return { x: c.x - Math.sin(th) * up, y: c.y, z: c.z + Math.cos(th) * up };
  }
  if (o.support === 'balance') return panRoom();
  if (o.support === 'hand') return { x: o.pose.x, y: o.pose.y, z: o.pose.z };
  return rackSlot(id);
}

/** Resorte del soporte: gancho del brazo y su extremo inferior (puntero) para el alargamiento actual. */
export const standHook = (): P3 => ({ x: ST.x, y: ST.hookY, z: ST.hookZ });
export const springBottom = (w: F06World): P3 => ({ x: ST.x, y: ST.hookY, z: ST.hookZ - GEOF06.spring.natCm - w.stand.x * 100 });
/** Cero de la regla (cm de la sala): frente al puntero sin carga, corrido por el ajuste. */
export const rulerZeroZ = (w: F06World) => ST.hookZ - GEOF06.spring.natCm + w.stand.rulerOffsetCm;

/** Porta-pesas (colgado del resorte o en el estante) y pesas ranuradas apiladas en él. */
export function hangerRoom(w: F06World): P3 {
  const o = w.objects.hanger01;
  if (w.stand.hangerOn) {
    const b = springBottom(w);
    return { x: b.x, y: b.y, z: b.z - GEOF06.hanger.h };
  }
  if (o.support === 'balance') return panRoom();
  if (o.support === 'hand') return { x: o.pose.x, y: o.pose.y, z: o.pose.z };
  return rackSlot('hanger01');
}
export function slotRoom(w: F06World, id: string): P3 {
  const o = w.objects[id];
  if (o.support === 'hanger') {
    const i = SLOTS.filter((m) => w.objects[m].support === 'hanger').indexOf(id as (typeof SLOTS)[number]);
    const h = hangerRoom(w);
    return { x: h.x, y: h.y, z: h.z + 0.8 + i * 1.3 };
  }
  if (o.support === 'balance') return panRoom();
  if (o.support === 'hand') return { x: o.pose.x, y: o.pose.y, z: o.pose.z };
  return rackSlot(id);
}

/** Compuertas del riel (sobre la cara, en su s) y la del péndulo (en la parte baja del recorrido de la esfera). */
export function gateRoom(w: F06World, id: string): P3 {
  if (id === 'gate3') return { x: PD.x, y: PD.y, z: PD.pivotZ - w.pend.L * 100 };
  return trackAt(w, w.gates[id]?.s ?? 0.5);
}

/** Péndulo: pivote y centro de la esfera. */
export const pivotRoom = (): P3 => ({ x: PD.x, y: PD.y, z: PD.pivotZ });
export function bobRoom(w: F06World): P3 {
  const th = w.pend.thetaDeg * DEG;
  const L = w.pend.L * 100;
  const lat = w.pend.y * 100;
  const r = Math.sqrt(Math.max(0, L * L - lat * lat));
  return { x: PD.x + Math.sin(th) * r, y: PD.y + lat, z: PD.pivotZ - Math.cos(th) * r };
}

/** Medidor de altura: columna vertical junto a la parte alta; índice a la altura del riel arriba. */
export const gaugeX = () => trackPoint(GEOF06.gauge.s, 0).x;
export const gaugeIndexRoom = (w: F06World): P3 => ({ x: gaugeX(), y: GEOF06.gauge.y - 1.2, z: TR.z0 + w.track.h * 100 });

/** Escala del péndulo: columna del soporte, se lee frente al centro de la esfera en reposo. */
export const pendScaleRoom = (w: F06World): P3 => ({ x: PD.x + 3, y: PD.y + 2.4, z: PD.pivotZ - w.pend.L * 100 });

/** Punto que se mira de frente para leer cada escala o pantalla. */
export function eyePoint(w: F06World, target: string): P3 {
  switch (target) {
    case 'ruler01':
      return { x: GEOF06.ruler.x, y: GEOF06.ruler.y - 0.6, z: springBottom(w).z };
    case 'gauge01':
      return gaugeIndexRoom(w);
    case 'pendScale':
      return pendScaleRoom(w);
    case 'balance01':
      return { x: B.x, y: B.y - B.d / 2, z: B.h * 0.6 };
    case 'logger01':
      return { x: GEOF06.logger.x, y: GEOF06.logger.y - GEOF06.logger.d / 2, z: GEOF06.logger.h * 0.7 };
    case 'launcher01':
      return trackAt(w, 0.15, 4);
    case 'cart01':
    default:
      return { ...cartRoom(w), z: cartRoom(w).z + CA.h };
  }
}

/** Lugar de cada objeto para la cámara, las etiquetas y el cursor de la demostración. */
export function objRoom(w: F06World, id: string): P3 {
  const o = w.objects[id];
  if (!o) return { x: 0, y: 0, z: 0 };
  switch (o.kind) {
    case 'track':
      return trackAt(w, 0.9);
    case 'launcher':
      return trackAt(w, 0.1, 3);
    case 'cart':
      return cartRoom(w);
    case 'cartMass':
      return cartMassRoom(w, id);
    case 'hanger':
      return hangerRoom(w);
    case 'slotMass':
      return slotRoom(w, id);
    case 'spring': {
      const sp = w.springs[id];
      if (sp.at === 'stand') {
        const a = standHook();
        const b = springBottom(w);
        return { x: a.x, y: a.y, z: (a.z + b.z) / 2 };
      }
      if (sp.at === 'launcher') return trackAt(w, (LA.back + plungerS(w)) / 2, 2.5);
      return o.support === 'hand' ? { x: o.pose.x, y: o.pose.y, z: o.pose.z } : rackSlot(id);
    }
    case 'ruler':
      return { x: GEOF06.ruler.x, y: GEOF06.ruler.y, z: (GEOF06.ruler.z0 + GEOF06.ruler.z1) / 2 };
    case 'gate':
      return gateRoom(w, id);
    case 'brake':
      return trackAt(w, (GEOF06.brake.s0 + GEOF06.brake.s1) / 2);
    case 'pad':
    case 'damper':
      return trackAt(w, (GEOF06.loss.s0 + GEOF06.loss.s1) / 2, id === 'pad01' ? 0 : 0);
    case 'forceSensor':
      return trackAt(w, 0.005, 3);
    case 'posSensor':
      return trackAt(w, 0.005, 10);
    case 'gauge':
      return { x: gaugeX(), y: GEOF06.gauge.y, z: 30 };
    case 'pendulum':
      return { x: PD.x, y: PD.y, z: PD.pivotZ - w.pend.L * 50 };
    case 'angleSensor':
      return pivotRoom();
    case 'stand':
      return { x: ST.x, y: ST.y, z: 0 };
    default:
      return { x: o.pose.x, y: o.pose.y, z: o.pose.z };
  }
}

export { CART_START_S };
