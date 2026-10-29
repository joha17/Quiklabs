/**
 * Geometría de la mesada B06 (cm; mismos ejes y apoyos de B01/B02). Se reutilizan el área de montaje, la platina, la
 * caja de láminas, el área de frotis y los residuos de B02; se agregan los frascos de cultivo vivo junto al
 * microscopio, la maceta de Tradescantia, el aceite de inmersión y el pañuelo, la zona sin desinfectar, el cultivo
 * cerrado de B. cereus, la lanceta bloqueada, los frascos de Wright y las fichas del reto. Medidas `pending`.
 */
export const GEO_B06 = {
  vial: { r: 1.6, h: 6 },
  pot: { r: 5, h: 8 },
  oil: { r: 1.2, h: 5 },
  plate: { r: 4.5, h: 1.4 },
  zone: { w: 16, d: 10 },
  cards: { w: 14, d: 9 },
} as const;

/** Frascos de cultivo (Paramecium y Euglena), a la izquierda del microscopio. */
export const CULTURE_POS: Record<string, { x: number; y: number }> = { cuP: { x: 236, y: 42 }, cuE: { x: 246, y: 42 } };
export const POT_POS = { x: 128, y: 46 } as const;
export const OIL_POS = { x: 356, y: 40 } as const;
export const TISSUE_POS = { x: 196, y: 26 } as const;
export const DIRTY_ZONE = { x: 62, y: 20 } as const;
export const CULTURE_PLATE = { x: 360, y: 50 } as const;
export const LANCET_POS = { x: 300, y: 50 } as const;
export const WRIGHT_POS: Record<string, { x: number; y: number }> = { wri: { x: 326, y: 46 }, buf: { x: 333, y: 46 } };
export const CARDS_POS = { x: 46, y: 28 } as const;
/** Píxeles a lo ancho de una captura (la escala µm/px sale del campo visual). */
export const IMAGE_PX = 1000;
