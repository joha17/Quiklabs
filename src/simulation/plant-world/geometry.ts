/**
 * Geometría de la mesada B09 (cm; mismos ejes y apoyos de B01/B02). El microscopio, la caja, la tabla de corte, el área de
 * montaje, el estereoscopio y los residuos son los de siempre; se agregan las plántulas y la rama junto al estereoscopio, las
 * fuentes de tejido sobre la tabla, la zona ventilada de Wiesner y la piseta. Medidas de representación (§4), `pending`.
 */
import { PREP2_SPOT } from '../cell-world/geometry';

export const GEO_B09 = {
  tray: { w: 22, d: 16, h: 1.2 },
  plant: { h: 18, r: 7 },
  branch: { w: 16, d: 4, h: 4 },
  source: { w: 8, d: 5, h: 3 },
  zone: { w: 24, d: 14, h: 0.4 },
  dropper: { r: 1.6, h: 7 },
  wash: { r: 2.4, h: 11 },
  oil: { r: 1.2, h: 5 },
} as const;

export const PLANT_POS: Record<string, { x: number; y: number }> = { bean: { x: 472, y: 40 }, maize: { x: 494, y: 40 } };
export const BRANCH_POS = { x: 486, y: 12 } as const;
/** Fuentes de tejido al fondo de la tabla de corte. */
export const SOURCE_POS: Record<string, { x: number; y: number }> = { cel: { x: 128, y: 46 }, pea: { x: 142, y: 46 }, lea: { x: 156, y: 46 } };
/** Zona ventilada: el segundo apoyo de preparación, único lugar autorizado para el reactivo ácido. */
export const STAIN_ZONE = PREP2_SPOT;
export const WIESNER_POS: Record<string, { x: number; y: number }> = { flo: { x: 304, y: 40 }, hcl: { x: 318, y: 42 } };
export const WASH_POS = { x: 196, y: 36 } as const;
export const OIL_VIAL = { x: 356, y: 40 } as const;
/** Píxeles a lo ancho de una captura (la escala µm/px sale del campo visual). */
export const IMAGE_PX_B09 = 1000;
