/**
 * Geometría física de F09 (cm de la mesada: x a lo largo, y en profundidad con 0 en el canto frontal, z altura con 0 en
 * la cara de la mesada). Un único perfil gobierna la física y el dibujo: la escena 3D lee estas mismas medidas.
 *
 * La mesa giratoria está centrada en AX = (130, 32): base de 64 × 64 cm con tornillos de nivel y traba, guarda
 * cilíndrica de policarbonato (r 32 cm) con puerta frontal, tambor escalonado de torque bajo la plataforma (ranuras de
 * 10, 15 y 20 cm de radio a 5 cm de altura) y la plataforma de Ø 60 cm a 12–13,2 cm. Sobre ella, la guía radial (eje
 * +x local) con la masa orbitante y el mástil central con el sensor de fuerza, y la barra perpendicular (eje ±y local)
 * con las dos masas radiales y su cordón central, que baja por el eje hueco hasta la palanca de recogida. El cordón del
 * tambor sale tangente hacia el frente (−y), cruza la ranura de la guarda y llega al dinamómetro del carro de fuerza
 * constante fijado al canto. El motor con embrague está a la derecha y la fotopuerta abraza el borde de la plataforma.
 */
export const GEOF09 = {
  axis: { x: 130, y: 32 },
  base: { w: 64, d: 64, h: 1.5 },
  /** Guarda cilíndrica con puerta frontal y ranura para el cordón del dinamómetro. */
  guard: { r: 32, h: 30 },
  drum: { z: 5, h: 1.2 },
  table: { r: 30, z: 12, h: 1.2 },
  /** Guía radial: largo útil y alto del riel sobre la plataforma; masa orbitante (cilindro r 2,5 cm, alto 4 cm). */
  guide: { len: 29, h: 1.2, w: 3 },
  orbit: { r: 2.5, h: 4 },
  /** Barra de masas radiales y masas (cilindros r 2 cm, alto 3 cm). */
  bar: { len: 27, h: 1, w: 2.4 },
  slide: { r: 2, h: 3 },
  /** Mástil central con el sensor de fuerza. */
  mast: { h: 9 },
  /** Carro del dinamómetro en el canto frontal (y negativa: sobresale de la mesada). */
  dyn: { y: -6, len: 16 },
  motor: { x: 178, y: 50, w: 16, d: 14, h: 12 },
  brake: { angle: Math.PI / 4 },
  /** La fotopuerta abraza el borde de la plataforma en este ángulo de la sala (rad). */
  gate: { angle: (200 * Math.PI) / 180 },
  pull: { x: 92, y: 6 },
  level: { x: 108, y: 8 },
  logger: { x: 60, y: 48, w: 18, d: 12, h: 7 },
  balance: { x: 252, y: 44, w: 18, d: 20, h: 6, pan: 7 },
  massRack: { x: 252, y: 16, w: 30, d: 10, h: 4 },
};

const AX = GEOF09.axis;
export const TABLE_TOP = GEOF09.table.z + GEOF09.table.h;

/** Punto de la mesada (cm) a una distancia radial r (m) del eje con el ángulo φ (rad) de la sala. */
export function rotorPoint(rM: number, phi: number, z = TABLE_TOP): { x: number; y: number; z: number } {
  return { x: AX.x + Math.cos(phi) * rM * 100, y: AX.y + Math.sin(phi) * rM * 100, z };
}

/** Punto donde el cordón del tambor se separa (cm): tangente hacia −y para el sentido elegido. */
export function cordPoint(armR: number, dir: 1 | -1): { x: number; y: number; z: number } {
  return { x: AX.x - dir * armR * 100, y: AX.y, z: GEOF09.drum.z };
}
