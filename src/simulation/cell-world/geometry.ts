/**
 * Geometría de la mesada B02 (cm; mismos ejes y puntos de apoyo de B01). Se reutilizan el área de montaje, la platina,
 * la caja de láminas, la base del estereoscopio y las bandejas de B01; se agregan la tabla de corte y las fuentes de
 * tejido (estación B) y el área de preparación animal con los hisopos y la fuente virtual de epitelio (estación D).
 * Medidas `pending`: proporciones de un puesto de laboratorio escolar, no cotas medidas.
 */
export const GEO_B02 = {
  board: { w: 14, d: 10, h: 0.6 },
  source: { r: 2.6, h: 2.2 },
  spatula: { length: 14 },
  swabBox: { w: 8, d: 4, h: 2 },
  swab: { length: 10 },
  cheek: { w: 7, d: 5, h: 3 },
  trash: { r: 5, h: 14 },
} as const;

/** Tabla de corte: el fragmento cortado queda aquí hasta tomarlo con la pinza. */
export const BOARD_POS = { x: 120, y: 25, z: GEO_B02.board.h } as const;
/** Área de preparación animal (frotis), junto a la caja de láminas. */
export const PREP2_SPOT = { x: 316, y: 14, z: 0.8 } as const;
export const SWAB_BOX = { x: 304, y: 40, z: GEO_B02.swabBox.h } as const;
export const CHEEK_POS = { x: 318, y: 42 } as const;
export const TRASH_BIN = { x: 102, y: 53 } as const;

/** Fuentes de tejido en fila al fondo de la estación B (id → x). */
export const SOURCE_ROW_Y = 46;
export const SOURCE_X: Record<string, number> = { pot: 128, tom: 138, pep: 148, car: 158, pea: 168, gua: 178, app: 188 };

/** Portaobjetos limpios (dos columnas) y cubreobjetos en su caja. */
export const slidePos = (i: number) => ({ x: 96 + Math.floor(i / 3) * 10, y: 8 + (i % 3) * 5 });

/** Medio portaobjetos (cm): fuera de este rectángulo, lo depositado cae a la mesa. */
export const SLIDE_HALF = { x: 3.75, y: 1.25 } as const;
