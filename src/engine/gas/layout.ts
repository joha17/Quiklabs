/**
 * Geometría visual de la Práctica 10 (cm de mesada): dónde están los meniscos, las bocas y los extremos del montaje.
 * La usan la cámara (lectura a la altura del ojo), el controlador (paralaje) y las vistas, con las mismas medidas
 * físicas que el dominio (`GEO10`).
 */
import type { P10World } from '../../simulation/gas-world/types';
import { GEO10 } from '../../simulation/gas-world/geometry';
import { solveBurette } from '../../simulation/gas-world/world';

export const VIS = {
  flask: { bulbR: 3.0, bulbZ: 3.2, neckZ0: 6.0, neckZ1: 16, markZ: 12, neckR: 0.55 },
  cylinder: { r: Math.sqrt(GEO10.cylinder.areaCm2 / Math.PI), h: GEO10.cylinder.h, floor: GEO10.cylinder.floor, baseR: 2.4 },
  pipette: { tipLen: 9, bulbZ0: 9, bulbZ1: 19, bulbR: 0.95, markZ: 30, topZ: 44, stemR: 0.15 },
  erlen: { baseR: GEO10.erlenmeyer.baseR, neckZ: 11, mouthZ: 14, mouthR: 1.4 },
  beaker600: { r: GEO10.beaker600.r, h: GEO10.beaker600.h, floor: GEO10.beaker600.floor },
  beaker150: { r: GEO10.beaker150.r, h: GEO10.beaker150.h, floor: GEO10.beaker150.floor },
  burette: { r: 0.55, outerR: 0.66 },
  syringe: { barrelLen: 8.6, r: Math.sqrt(GEO10.syringe.areaCm2 / Math.PI) },
};

/** Altura del menisco del balón (z). */
export function flaskLevelZ(w: P10World): number {
  const F = VIS.flask;
  const v = w.liquids.flask;
  const below = (F.markZ - F.neckZ0) * GEO10.flask.neckAreaCm2;
  const bulbVol = w.flask.trueMarkMl - below;
  const o = w.objects.flask.pose;
  if (v.ml <= bulbVol) return o.z + 0.4 + (F.neckZ0 - 0.4) * Math.cbrt(Math.max(0, v.ml) / Math.max(1, bulbVol));
  return o.z + F.markZ + (v.ml - w.flask.trueMarkMl) / GEO10.flask.neckAreaCm2;
}

export const flaskMarkZ = (w: P10World) => w.objects.flask.pose.z + VIS.flask.markZ;

export function cylinderLevelZ(w: P10World): number {
  const o = w.objects.cylinder.pose;
  return o.z + VIS.cylinder.floor + w.liquids.cylinder.ml / GEO10.cylinder.areaCm2;
}

/** Menisco de la pipeta (z) respecto de su marca. */
export function pipetteLevelZ(w: P10World): number {
  const o = w.objects.pipette.pose;
  const P = VIS.pipette;
  return o.z + P.markZ + Math.max(-6, Math.min(6, w.pipette.aboveMarkMl / GEO10.pipette.stemAreaCm2 / 10));
}

/** Boca de la bureta, extremo superior y menisco interno (z), con la bureta invertida en el baño. */
export function buretteZ(w: P10World) {
  const s = solveBurette(w);
  return { mouth: s.zMouthCm, top: s.zTopCm, meniscus: s.zInCm, outer: s.zOutCm };
}

/** Pose de la bureta invertida (sobre el baño). */
export function buretteInBathXY(w: P10World) {
  const b = w.objects.beaker600.pose;
  return { x: b.x + 0.6, y: b.y };
}

export function erlenMouth(w: P10World) {
  const o = w.objects.erlenmeyer.pose;
  return { x: o.x, y: o.y, z: o.z + VIS.erlen.mouthZ };
}

/** Punto del sensor donde se enrosca la jeringa. */
export function sensorPort(w: P10World) {
  const o = w.objects.sensor.pose;
  return { x: o.x - 6.5, y: o.y - 2, z: 4 };
}
