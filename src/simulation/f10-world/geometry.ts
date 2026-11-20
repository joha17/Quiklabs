/**
 * Geometría física de F10 (cm de la mesada: x a lo largo, y en profundidad con 0 en el canto frontal, z altura con 0 en
 * la cara de la mesada). Un único perfil gobierna la física y el dibujo: la escena 3D lee estas mismas medidas.
 *
 * - A (izquierda): riel de 140 cm con dos apoyos regulables; cada apoyo es un soporte con filo a 24 cm de altura sobre
 *   un sensor de reacción. La viga de 120 × 5 × 3 cm tiene su extremo izquierdo en x = 40 y su escala impresa (0–120 cm)
 *   es la coordenada s del dominio. Bajo sus extremos, topes de seguridad a 16 cm (8 cm de caída en un vuelco).
 * - Detrás, el soporte de guardado de la viga; delante, la cuña de equilibrio con su silla (centro de masa).
 * - B (centro): pórtico con el dinamómetro de 0–20 N colgado del gancho a 78 cm; estante bajo de cargas y probetas.
 * - C/D (derecha): prensa de tracción vertical con su manivela, celda de carga sobre la mordaza superior, la probeta de
 *   30 cm de zona calibrada con el comparador sujeto a ella y el protector de policarbonato al frente.
 * - E: nivel, cinta métrica y calibre; F: registrador.
 */
export const GEOF10 = {
  beam: { x0: 40, y: 32, len: 120, w: 5, h: 3 },
  /** Filo del apoyo (cara superior), sensor de reacción en la base y huella del soporte. */
  support: { z: 24, cellH: 4, w: 8, d: 10 },
  rail: { x0: 30, x1: 170, y: 32, h: 2, w: 12 },
  catchZ: 16,
  /** Soporte de guardado de la viga (detrás del riel). */
  store: { y: 56, z: 6 },
  /** Cuña de equilibrio: filo a 8 cm (silla de 5 cm incluida en hc). */
  wedge: { x: 100, y: 10, z: 8 },
  gantry: { x: 210, y: 32, h: 80, hookZ: 78, dynLen: 20, sling: 10 },
  loadRack: { x: 250, y: 10, w: 34, d: 10, h: 10 },
  /** Carga colgada: largo del gancho bajo la viga y alto del portapesas. */
  hanger: { hook: 6, stack: 9, r: 3 },
  press: { x: 300, y: 36, baseW: 26, baseD: 22, baseH: 6, colX: 9, gripBot: 10, specBot: 18, specTop: 52, gripTop: 60, cellTop: 66, head: 70, colH: 78, gaugeZ: 35, crankX: 318, crankZ: 72 },
  shield: { y: 22, w: 30, h: 66 },
  logger: { x: 252, y: 52, w: 18, d: 12, h: 7 },
  tape: { x: 30, y: 20 },
  caliper: { x: 268, y: 6 },
  level: { x: 180, y: 8 },
};

/** Punto de la mesada (cm) de la coordenada s de la viga sobre los apoyos (sin vuelco). */
export function beamPoint(s: number, z: number = GEOF10.support.z + GEOF10.beam.h): { x: number; y: number; z: number } {
  return { x: GEOF10.beam.x0 + s, y: GEOF10.beam.y, z };
}

/** Pose de la viga en la sala: extremo izquierdo, altura de su cara inferior y giro (rad). */
export function beamFrame(where: string, wedgeS: number): { x0: number; y: number; z: number } {
  const B = GEOF10.beam;
  switch (where) {
    case 'wedge':
      return { x0: GEOF10.wedge.x - wedgeS, y: GEOF10.wedge.y, z: GEOF10.wedge.z };
    case 'gantry':
      return { x0: GEOF10.gantry.x - B.len / 2, y: GEOF10.gantry.y, z: GEOF10.gantry.hookZ - GEOF10.gantry.dynLen - GEOF10.gantry.sling - B.h };
    case 'rack':
      return { x0: B.x0, y: GEOF10.store.y, z: GEOF10.store.z };
    default:
      return { x0: B.x0, y: B.y, z: GEOF10.support.z };
  }
}
