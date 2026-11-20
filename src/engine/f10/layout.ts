/**
 * Geometría visual de F10 (cm de la sala, z = 0 en la cara de la mesada): la viga sobre los apoyos del riel (o en la
 * cuña, el pórtico o su soporte de guardado), las cargas colgadas, el dinamómetro del pórtico, la prensa de tracción con
 * su probeta, mordazas, manivela, celda y comparador, el registrador y los instrumentos sueltos. La usan la cámara
 * (lectura de frente), el controlador y las vistas, con las MISMAS medidas que el dominio (`GEOF10`).
 */
import type { F10World, SupportId } from '../../simulation/f10-world/types';
import type { TapeTarget } from '../../simulation/f10-world/commands';
import { GEOF10, beamFrame } from '../../simulation/f10-world/geometry';
import { wedgeTiltF10 } from '../../simulation/f10-world/world';
import { buildObjectsF10 } from '../../practices/practice-f10/definition';

export const DEG = Math.PI / 180;
const G = GEOF10;
const PR = G.press;

export type P3 = { x: number; y: number; z: number };

/** Poses de partida (lugar de cada pieza suelta). */
const HOME: Record<string, P3> = Object.fromEntries(buildObjectsF10().map((o) => [o.id, { x: o.pose.x, y: o.pose.y, z: o.pose.z }]));
export const homeOf = (id: string): P3 => HOME[id] ?? { x: G.loadRack.x, y: G.loadRack.y, z: G.loadRack.h };

/** Pose de la viga: extremo izquierdo, altura de su cara inferior, giro (rad, + baja el extremo derecho) y punto de giro (x). */
export function beamPose(w: F10World): { x0: number; y: number; z: number; angle: number; pivotX: number; pivotZ: number } {
  const b = w.beam;
  const o = w.objects.beam01;
  if (o?.support === 'hand') return { x0: o.pose.x - G.beam.len / 2, y: o.pose.y, z: o.pose.z, angle: 0, pivotX: o.pose.x, pivotZ: o.pose.z };
  const f = beamFrame(b.where, b.wedgeS);
  if (b.where === 'supports' && b.pivot) {
    const px = f.x0 + w.supports[b.pivot].s;
    return { ...f, angle: b.angle, pivotX: px, pivotZ: f.z };
  }
  if (b.where === 'wedge') {
    const t = wedgeTiltF10(w);
    // Fuera de equilibrio la viga cae hacia un lado hasta que su extremo toca la mesada.
    const a = t === 'left' ? -1 : t === 'right' ? 1 : 0;
    const drop = Math.atan(G.wedge.z / Math.max(1, a < 0 ? b.wedgeS : G.beam.len - b.wedgeS));
    return { ...f, angle: a * drop, pivotX: G.wedge.x, pivotZ: f.z };
  }
  return { ...f, angle: 0, pivotX: f.x0 + G.beam.len / 2, pivotZ: f.z };
}

/** Punto de la sala de la coordenada s de la viga, en su cara inferior (dz = 0) o superior (dz = alto). */
export function beamPointRoom(w: F10World, s: number, dz = 0): P3 {
  const p = beamPose(w);
  const x = p.x0 + s - p.pivotX;
  const z = dz;
  const c = Math.cos(p.angle);
  const sn = Math.sin(p.angle);
  return { x: p.pivotX + x * c + z * sn, y: p.y, z: p.pivotZ - x * sn + z * c };
}

/** Filo de un apoyo (cara superior) en la sala. */
export const supportRoom = (w: F10World, id: SupportId): P3 => ({ x: G.beam.x0 + w.supports[id].s, y: G.rail.y, z: G.support.z });

/** Gancho del dinamómetro del pórtico (extremo inferior del resorte). */
export const dynHookRoom = (): P3 => ({ x: G.gantry.x, y: G.gantry.y, z: G.gantry.hookZ - G.gantry.dynLen });

/** Ojo superior del portapesas de la carga: colgado de la viga, del dinamómetro, en el estante o caído en la mesada. */
export function loadRoom(w: F10World): P3 {
  const L = w.loads.load1;
  const o = w.objects.load1;
  if (o?.support === 'hand') return o.pose;
  switch (L.where) {
    case 'beam':
      return beamPointRoom(w, L.s, 0);
    case 'gantry': {
      const h = dynHookRoom();
      return { ...h, z: h.z - 1 };
    }
    case 'bench': {
      const p = beamPointRoom(w, L.s, 0);
      return { x: p.x + 4, y: p.y - 6, z: G.hanger.hook + G.hanger.stack };
    }
    default:
      return { x: G.loadRack.x - 8, y: G.loadRack.y, z: G.loadRack.h + G.hanger.hook + G.hanger.stack };
  }
}

/** Centro de la base de una probeta: en la prensa (entre mordazas) o en el estante. */
export function specimenRoom(w: F10World, id: string): P3 {
  if (w.press.specimen === id) return { x: PR.x, y: PR.y, z: PR.specBot };
  const o = w.objects[id];
  if (o?.support === 'hand') return o.pose;
  return homeOf(id);
}

/** Escala que se lee con la cinta para cada blanco y dirección (sala) en que crece. */
export function tapePoint(w: F10World, t: TapeTarget): { p: P3; axis: P3 } {
  const along = (() => {
    const a = beamPose(w).angle;
    return { x: Math.cos(a), y: 0, z: -Math.sin(a) };
  })();
  switch (t) {
    case 'supA':
    case 'supB':
      return { p: beamPointRoom(w, w.supports[t === 'supA' ? 'A' : 'B'].s, G.beam.h), axis: along };
    case 'load1':
      return { p: beamPointRoom(w, w.loads.load1.s, G.beam.h), axis: along };
    case 'cg':
      return { p: beamPointRoom(w, w.beam.wedgeS, G.beam.h), axis: along };
    case 'L0':
      return { p: { x: PR.x + 3, y: PR.y - 4, z: (PR.specBot + PR.specTop) / 2 }, axis: { x: 0, y: 0, z: 1 } };
  }
}

/** Lo que se lee de frente o desde arriba para evitar paralaje. */
export type EyeKeyF10 = 'tape01' | 'dyn01' | 'supportA' | 'supportB' | 'logger01' | 'gauge01' | 'caliper01' | 'level01';

/** Punto que se mira de frente para leer cada escala o pantalla. */
export function eyePoint(w: F10World, target: string, tape: TapeTarget = 'load1'): P3 {
  switch (target) {
    case 'tape01':
      return tapePoint(w, tape).p;
    case 'dyn01': {
      const h = dynHookRoom();
      return { x: h.x, y: h.y - 1.5, z: h.z + G.gantry.dynLen / 2 };
    }
    case 'supportA':
    case 'supportB': {
      const s = supportRoom(w, target === 'supportA' ? 'A' : 'B');
      return { x: s.x, y: s.y - G.support.d / 2, z: G.rail.h + G.support.cellH / 2 };
    }
    case 'logger01':
      return { x: G.logger.x, y: G.logger.y - G.logger.d / 2, z: G.logger.h * 0.7 };
    case 'gauge01':
      return { x: PR.x - 3, y: PR.y - 6, z: PR.gaugeZ };
    case 'caliper01':
      return { x: G.caliper.x, y: G.caliper.y, z: 1 };
    case 'level01':
      return { x: G.level.x, y: G.level.y, z: 2 };
    default:
      return { x: G.beam.x0 + 60, y: G.beam.y, z: G.support.z };
  }
}

/** Lugar de cada objeto para la cámara, las etiquetas y el cursor de la demostración. */
export function objRoom(w: F10World, id: string): P3 {
  const o = w.objects[id];
  if (!o) return { x: 0, y: 0, z: 0 };
  switch (o.kind) {
    case 'beam':
      return beamPointRoom(w, G.beam.len / 2, G.beam.h);
    case 'support':
      return { ...supportRoom(w, id === 'supportA' ? 'A' : 'B'), z: G.rail.h };
    case 'load': {
      const p = loadRoom(w);
      return { ...p, z: p.z - G.hanger.hook - G.hanger.stack };
    }
    case 'dynamometer':
      return { ...dynHookRoom() };
    case 'specimen':
      return specimenRoom(w, id);
    case 'grip':
      return { x: PR.x, y: PR.y, z: id === 'gripTop' ? PR.specTop : PR.gripBot };
    case 'crank':
      return { x: PR.crankX, y: PR.y, z: PR.crankZ };
    case 'loadCell':
      return { x: PR.x, y: PR.y, z: PR.gripTop };
    case 'gauge':
      return { x: PR.x - 3, y: PR.y - 4, z: PR.gaugeZ - 3 };
    case 'shield':
      return { x: PR.x, y: G.shield.y, z: 0 };
    default:
      return { x: o.pose.x, y: o.pose.y, z: o.pose.z };
  }
}
