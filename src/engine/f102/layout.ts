/**
 * Geometría visual de F102 (cm de mesada): dónde están el carro, las compuertas, el émbolo, la polea, el portapesas
 * colgado, el electroimán, la fotocelda y el cuerpo que cae. La usan la cámara (lectura de frente), el controlador
 * (acoples, alturas de suelta, paralaje real) y las vistas, con las MISMAS medidas que el dominio (`GEOF102`).
 */
import type { F102World } from '../../simulation/f102-world/types';
import { GEOF102, trackX } from '../../simulation/f102-world/geometry';
import { bodyProps, filterStack, hanging } from '../../simulation/f102-world/world';

export const TR = GEOF102.track;
export const TW = GEOF102.tower;
/** Altura de la cara superior del riel y del haz de las compuertas (cm). */
export const RAIL_TOP = TR.railZ;
export const GATE_BEAM_Z = TR.railZ + GEOF102.gate.beamDz;
/** Eje de la polea (a la altura del gancho del carro). */
export const PULLEY_AXIS = { x: GEOF102.pulley.x, y: TR.y, z: TR.railZ + GEOF102.cart.hookZ };

/** Cara superior del riel en x (cm): el carril pivota en su pie lejano y el tornillo levanta el del lanzador. */
export const railZAt = (w: F102World, x: number) => RAIL_TOP + (x - TR.footFarX) * Math.tan((w.track.angleDeg * Math.PI) / 180);
/** Centro del carro sobre el riel (cm). */
export const cartPos = (w: F102World) => {
  const x = trackX(w.cart.s);
  return { x, y: TR.y, z: railZAt(w, x) };
};
/** Índice de una compuerta sobre el carril (cm). */
export const gatePos = (w: F102World, id: string) => {
  const x = trackX(w.gates[id]?.s ?? 0);
  return { x, y: TR.y, z: railZAt(w, x) };
};
/** Cara del émbolo del lanzador (cm): retrocede con la muesca o con la cola del carro. */
export function plungerX(w: F102World): number {
  const rear = Math.min(w.cart.s - GEOF102.cart.halfLenM, 0);
  const c = w.launcher.latched ? -w.launcher.notchCm / 100 : rear < 0 ? rear : 0;
  return TR.xLauncher - c * 100;
}

/** Gancho del portapesas: cuelga del cordel por debajo del borde de la polea. */
export function hangerHook(w: F102World) {
  const d = hanging(w) ? w.string.depth * 100 : 0;
  return { x: PULLEY_AXIS.x - GEOF102.pulley.r, y: TR.y, z: PULLEY_AXIS.z - d };
}

/** Pose visible del portapesas o de una pesa ranurada sobre él (colgado o en el suelo). */
export function hungPose(w: F102World, id: string): { x: number; y: number; z: number } | null {
  const o = w.objects[id];
  if (!o) return null;
  if (id === 'hanger01' && (o.support === 'string' || o.support === 'floor')) {
    const h = hangerHook(w);
    return o.support === 'floor' ? { x: h.x - 6, y: TR.y + 4, z: -88 } : { x: h.x, y: h.y, z: h.z - 10 };
  }
  if (o.kind === 'slotMass' && o.support === 'hanger01') {
    const base = hungPose(w, 'hanger01');
    const rest = w.objects.hanger01;
    const b = base ?? rest.pose;
    const stack = Object.values(w.objects).filter((x) => x.kind === 'slotMass' && x.support === 'hanger01').map((x) => x.id);
    return { x: b.x, y: b.y, z: b.z + 0.5 + stack.indexOf(id) * 0.6 };
  }
  if (o.kind === 'slotMass' && o.support === 'floor') return { x: PULLEY_AXIS.x - 10, y: TR.y + 6, z: -88 };
  return null;
}

/** Cara inferior del polo del electroimán (cm sobre la mesada). */
export const magnetPoleZ = (w: F102World) => TW.beamZ + w.magnet.h * 100;

/** Pose visible de un cuerpo de la torre: colgado del electroimán, cayendo o en reposo. */
export function towerBodyPose(w: F102World, id: string): { x: number; y: number; z: number } | null {
  const o = w.objects[id];
  if (!o) return null;
  if (o.support === 'magnet01') {
    const b = bodyProps(w, id);
    return { x: TW.x + w.magnet.offsetM * 100, y: TW.y, z: magnetPoleZ(w) - (b?.heightM ?? 0) * 100 };
  }
  const f = w.fall;
  if (f && f.id === id && o.support === 'air') return { x: TW.x + f.x * 100, y: TW.y + f.y * 100, z: f.z * 100 };
  return null;
}

/** Pose de un filtro anidado: sigue al de abajo (colgado, cayendo o apoyado). */
export function filterPose(w: F102World, id: string): { x: number; y: number; z: number } | null {
  const st = filterStack(w, id);
  const base = st[0];
  const i = st.indexOf(id);
  if (i <= 0) return towerBodyPose(w, id);
  const b = towerBodyPose(w, base) ?? w.objects[base].pose;
  return { x: b.x + (w.filters[id].offCenter ? 0.8 : 0), y: b.y, z: b.z + i * GEOF102.filter.nest };
}

/** Altura (cm) del ojo para leer de frente: regla del carril, escala de la torre a la altura del puntero. */
export function eyePoint(w: F102World, target: string): { x: number; y: number; z: number } {
  switch (target) {
    case 'tower01':
      return { x: TW.x + 6, y: TW.y + 6, z: magnetPoleZ(w) };
    case 'inclinometer01':
      return { ...w.objects.inclinometer01.pose, z: w.objects.inclinometer01.pose.z + 4 };
    case 'gateTimer01':
    case 'photocell01':
    case 'motionSensor01':
      return { ...w.objects[target].pose, z: w.objects[target].pose.z + 4 };
    default: {
      const g = gatePos(w, 'gate1');
      return { x: g.x, y: TR.y - TR.w / 2, z: RAIL_TOP };
    }
  }
}
