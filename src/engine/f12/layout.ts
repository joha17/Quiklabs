/**
 * Geometría visual de F12 (cm de la sala, z = 0 en la cara de la mesada): el circuito a lo largo de la mesada, el
 * depósito con su visor, el vaso volumétrico en la mesada o bajo el desviador, el panel de sensores y el registrador.
 * La usan la cámara (lectura de frente), el controlador y las vistas, con las MISMAS medidas que el dominio (`GEOF12`).
 */
import type { F12World, PortId } from '../../simulation/f12-world/types';
import { GEOF12 } from '../../simulation/f12-world/geometry';
import { sumpLevelF12 } from '../../simulation/f12-world/world';
import { buildObjectsF12 } from '../../practices/practice-f12/definition';

export const DEG = Math.PI / 180;
const G = GEOF12;

export type P3 = { x: number; y: number; z: number };

/** Poses de partida (lugar de cada pieza suelta). */
const HOME: Record<string, P3> = Object.fromEntries(buildObjectsF12().map((o) => [o.id, { x: o.pose.x, y: o.pose.y, z: o.pose.z }]));
export const homeOf = (id: string): P3 => HOME[id] ?? { x: G.towel.x, y: G.towel.y, z: 0 };

/** Registrador sobre la mesada, junto al panel de sensores. */
export const LOGGER = { x: G.panel.x + 36, y: G.panel.y - 2, w: 18, d: 10, h: 9 };
/** Vaso volumétrico: en la mesada o bajo el desviador. */
export function beakerRoom(w: F12World): P3 {
  const o = w.objects.beaker01;
  if (o?.support === 'hand') return o.pose;
  return w.collect.beakerAt === 'outlet' ? { x: G.beakerOutlet.x, y: G.beakerOutlet.y, z: 0 } : { x: G.beakerBench.x, y: G.beakerBench.y, z: 0 };
}
/** Altura del agua en el vaso (cm sobre su base interior). */
export const beakerLevelCm = (w: F12World) => (w.collect.beakerVol / (Math.PI * G.beaker.r ** 2));
/** Superficie del agua del depósito (z de la sala). */
export const sumpSurfaceZ = (w: F12World) => 1 + Math.min(G.sump.h - 2, sumpLevelF12(w));
/** Toma en la sala (punto de conexión sobre el tubo). */
export const tapRoom = (w: F12World, p: PortId): P3 => ({ x: G.tapX[p], y: G.pipeY, z: w.tapZ[p] + 2.6 });

/** Lo que se lee de frente para evitar paralaje. */
export type EyeKeyF12 = 'sump01' | 'ruler01' | 'beaker01' | 'timer01' | 'logger01' | 'meter01' | 'caliper01';

/** Punto que se mira de frente para leer cada escala o pantalla. */
export function eyePoint(w: F12World, target: string, port: PortId = 3): P3 {
  switch (target) {
    case 'sump01':
      return { x: G.sump.x - G.sump.w / 2 + 4, y: G.sump.y - G.sump.d / 2, z: sumpSurfaceZ(w) };
    case 'ruler01':
      return { x: G.ruler.x, y: G.ruler.y - 1, z: w.tapZ[port] };
    case 'beaker01': {
      const b = beakerRoom(w);
      return { x: b.x, y: b.y - G.beaker.r, z: b.z + 0.6 + beakerLevelCm(w) };
    }
    case 'timer01':
      return { x: G.timer.x, y: G.timer.y - 3, z: 3.5 };
    case 'logger01':
      return { x: LOGGER.x, y: LOGGER.y - LOGGER.d / 2, z: LOGGER.h * 0.7 };
    case 'meter01':
      return { x: G.meter.x, y: G.pipeY - 3, z: G.axisZ + 4 };
    case 'caliper01':
      return { x: G.caliper.x, y: G.caliper.y - 3, z: 2 };
    default:
      return { x: 150, y: G.pipeY, z: G.axisZ };
  }
}

/** Lugar de cada objeto para la cámara, las etiquetas y el cursor de la demostración. */
export function objRoom(w: F12World, id: string): P3 {
  const o = w.objects[id];
  if (!o) return { x: 0, y: 0, z: 0 };
  if (id === 'beaker01') return beakerRoom(w);
  if (id === 'stopper01' && w.stopper === 'pipe') return { x: G.tapX[2], y: G.pipeY, z: G.axisZ };
  if (o.support === 'hand') return o.pose;
  return { x: o.pose.x, y: o.pose.y, z: o.pose.z };
}
