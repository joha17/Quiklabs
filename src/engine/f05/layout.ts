/**
 * Geometría visual de F05 (cm de la sala, z = 0 en la cara de la mesada): dónde están el tablero inclinado y lo que va
 * sobre él (bloque, lastres, compuertas, goniómetro, tope, pasador, tirador con su célula de carga), el puntal del
 * elevador, la balanza, los estantes y el registrador. La usan la cámara (lectura de frente), el controlador (paralaje
 * real y destinos al soltar) y las vistas, con las MISMAS medidas que el dominio (`GEOF05`).
 */
import type { F05World } from '../../simulation/f05-world/types';
import { BLOCK_START_S, GEOF05, planePoint } from '../../simulation/f05-world/geometry';
import { thetaDegF5 } from '../../simulation/f05-world/conservation';
import { BALLASTS } from '../../simulation/f05-world/world';

export const DEG = Math.PI / 180;
const PL = GEOF05.plane;
const BK = GEOF05.block;
const B = GEOF05.balance;
const R = GEOF05.massRack;
const SR = GEOF05.stripRack;

export type P3 = { x: number; y: number; z: number };

/** Inclinación dibujada del tablero (°): la real, θ_rel + θ_base. */
export const thetaOf = (w: F05World) => thetaDegF5(w);

/** Punto de la cara del tablero en s (m), `up` cm sobre la cara (normal) y `lateral` cm hacia el fondo. */
export function planeAt(w: F05World, s: number, up = 0, lateral = 0): P3 {
  const p = planePoint(s, thetaOf(w), up);
  return { x: p.x, y: PL.y + lateral, z: p.z };
}

/** Vectores del tablero (cm de la sala): a lo largo (hacia el extremo alto) y normal a la cara. */
export function planeAxes(w: F05World) {
  const th = thetaOf(w) * DEG;
  return { along: { x: Math.cos(th), y: 0, z: Math.sin(th) }, normal: { x: -Math.sin(th), y: 0, z: Math.cos(th) } };
}

/** Plato de la balanza (cara superior). */
export const panRoom = (): P3 => ({ x: B.x, y: B.y, z: B.h + 0.6 });

/** Lugar del bloque caído o apoyado en la mesada, delante del tablero. */
export const benchBlockPose = (): P3 => ({ x: PL.hingeX + BLOCK_START_S * 100, y: PL.y - PL.w / 2 - 9, z: 0 });

/** Centro de la base del bloque (sobre el tablero, el plato o la mesada). */
export function blockRoom(w: F05World): P3 {
  const b = w.block;
  if (b.on === 'balance') return panRoom();
  if (b.on === 'bench') return benchBlockPose();
  return planeAt(w, b.s, 0, b.lateralCm);
}

/** Inclinación con que se dibuja el bloque (sobre el tablero, la del tablero; si no, horizontal). */
export const blockTilt = (w: F05World) => (w.block.on === 'plane' ? thetaOf(w) : 0);

/** Gancho del bloque (lado del tirador) y gancho del tirador (m de plano `p`, altura `heightCm`). */
export function blockHookRoom(w: F05World): P3 {
  if (w.block.on !== 'plane') {
    const c = blockRoom(w);
    return { x: c.x + BK.len / 2 + 0.6, y: c.y, z: c.z + BK.hookZ };
  }
  return planeAt(w, w.block.s + BK.halfLenM + 0.006, BK.hookZ, w.block.lateralCm);
}
export const pullerHookRoom = (w: F05World): P3 => planeAt(w, w.puller.p, w.puller.heightCm);

/** Lastres: apilados en el perno del bloque, en el estante, en el plato o caídos en la mesada. */
export function ballastRoom(w: F05World, id: string): P3 {
  const o = w.objects[id];
  if (o.support === 'block01') {
    const i = BALLASTS.filter((m) => w.objects[m].support === 'block01').indexOf(id as (typeof BALLASTS)[number]);
    const off = w.seated[id] ? 0 : 3;
    if (w.block.on !== 'plane') {
      const c = blockRoom(w);
      return { x: c.x + off, y: c.y, z: c.z + BK.h + i * 2.7 };
    }
    return planeAt(w, w.block.s + off / 100, BK.h + i * 2.7, w.block.lateralCm);
  }
  if (o.support === 'balance') return panRoom();
  if (o.support === 'bench') {
    const b = benchBlockPose();
    return { x: b.x + 12 + (id === 'w250b' ? 6 : 0), y: b.y - 2, z: 0 };
  }
  return { x: o.pose.x, y: o.pose.y, z: o.pose.z };
}

/** Ranura del estante para un lastre (se vuelve allí al soltarlo en el estante). */
export const rackSlot = (id: string): P3 => ({ x: R.x + (id === 'w250b' ? 5 : -5), y: R.y, z: R.h });
export const stripSlot = (id: string): P3 => ({ x: SR.x + (id === 'stripRubber' ? 6 : -6), y: SR.y, z: SR.h });

export const gateRoom = (w: F05World, id: string): P3 => planeAt(w, w.gates[id]?.s ?? 0.3, 0, 0);

/** Escala del tablero: se lee en el índice de la compuerta, sobre el canto frontal. */
export const scaleIndexRoom = (w: F05World, id: string): P3 => {
  const g = gateRoom(w, id);
  return { ...planeAt(w, w.gates[id]?.s ?? 0.3, -1, 0), y: g.y - PL.w / 2 - 0.4 };
};

/** Goniómetro de plomada en el canto frontal del tablero y escala del soporte junto a la bisagra. */
export const goniometerRoom = (w: F05World): P3 => ({ ...planeAt(w, 0.6, -1), y: PL.y - PL.w / 2 - 0.6 });
export const supportScaleRoom = (): P3 => ({ x: PL.hingeX + 4, y: PL.y - GEOF05.base.w / 2 - 0.4, z: PL.hingeZ + 2 });

/** Pie del puntal del elevador (sobre la base) y su apoyo bajo el tablero. */
export const elevatorFoot = (): P3 => ({ x: PL.hingeX + GEOF05.base.elevatorS * 100, y: PL.y, z: GEOF05.base.h });
export const elevatorTop = (w: F05World): P3 => planeAt(w, Math.min(0.9, GEOF05.base.elevatorS), -PL.thick);

/** Punto que se mira de frente para leer cada escala o pantalla. */
export function eyePoint(w: F05World, target: string): P3 {
  switch (target) {
    case 'gate1':
    case 'gate2':
      return scaleIndexRoom(w, target);
    case 'gonio01':
      return goniometerRoom(w);
    case 'elevator01':
      return supportScaleRoom();
    case 'balance01':
      return { x: B.x, y: B.y - B.d / 2, z: B.h * 0.6 };
    case 'logger01':
      return { x: GEOF05.logger.x, y: GEOF05.logger.y - GEOF05.logger.d / 2, z: GEOF05.logger.h * 0.7 };
    case 'thermo01':
      return { x: GEOF05.thermo.x, y: GEOF05.thermo.y - 2, z: 6 };
    case 'block01':
      return { ...blockRoom(w), z: blockRoom(w).z + BK.h };
    default:
      return blockRoom(w);
  }
}

/** Lugar de cada objeto para la cámara, las etiquetas y el cursor de la demostración. */
export function objRoom(w: F05World, id: string): P3 {
  const o = w.objects[id];
  if (!o) return { x: 0, y: 0, z: 0 };
  switch (o.kind) {
    case 'plane':
      return planeAt(w, 0.5);
    case 'block':
      return blockRoom(w);
    case 'ballast':
      return ballastRoom(w, id);
    case 'strip':
      return o.support === 'plane' ? planeAt(w, 0.35, 0.2) : stripSlot(id);
    case 'gate':
      return gateRoom(w, id);
    case 'goniometer':
      return goniometerRoom(w);
    case 'elevator':
      return elevatorFoot();
    case 'catcher':
      return planeAt(w, GEOF05.catcher.s, 2);
    case 'puller':
      return planeAt(w, (GEOF05.puller.s0 + GEOF05.puller.s1) / 2, 3);
    case 'loadCell':
      return pullerHookRoom(w);
    case 'spring': {
      const a = blockHookRoom(w);
      const b = pullerHookRoom(w);
      return { x: b.x + (a.x - b.x) * 0.15, y: b.y, z: b.z + (a.z - b.z) * 0.15 };
    }
    default:
      return { x: o.pose.x, y: o.pose.y, z: o.pose.z };
  }
}
