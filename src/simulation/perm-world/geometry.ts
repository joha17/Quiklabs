/**
 * Geometría de la mesada B03 (cm; mismos ejes de B01). A la izquierda queda la preparación de Elodea de B01/B02
 * (área de montaje, cubreobjetos, goteros de medios) y el microscopio compartido; a la derecha, donde B02 tenía la
 * preparación animal y el estereoscopio, las estaciones de membranas: A–B (control de membrana y difusión), C
 * (diálisis y ensayos) y D (ósmosis). Medidas `pending`: proporciones de un puesto escolar, no cotas medidas.
 */
export const GEO_B03 = {
  cell: { w: 14, d: 8, h: 9, wall: 0.35 },
  cellTall: { w: 12, d: 7, h: 16 },
  membrane: { w: 6, d: 6 },
  tray: { w: 16, d: 9, h: 1.2 },
  soak: { r: 5, h: 1.6 },
  bottle: { r: 2.6, h: 12 },
  cylinder: { r: 1.4, h: 18 },
  pipette: { length: 16 },
  beaker: { r: 3.6, h: 8 },
  rack: { w: 20, d: 5, h: 5 },
  tube: { r: 0.8, h: 10 },
  thermometer: { length: 18 },
  colorimeter: { w: 10, d: 8, h: 6 },
  waste: { r: 6, h: 16 },
} as const;

/** Posición de cada cámara (centro); el lado A queda a la izquierda y el B a la derecha. */
export const CELL_POS: Record<string, { x: number; y: number }> = { c1: { x: 352, y: 28 }, c2: { x: 402, y: 28 }, c3: { x: 472, y: 28 } };
export const sideOffset = (side: 'A' | 'B') => (side === 'A' ? -3.4 : 3.4);

export const MEMBRANE_TRAY = { x: 332, y: 14, z: GEO_B03.tray.h } as const;
export const SOAK_DISH = { x: 332, y: 34, z: 1.2 } as const;
export const TUBE_RACK = { x: 430, y: 14 } as const;
export const RINSE_BEAKER = { x: 384, y: 18 } as const;
export const CHEM_WASTE = { x: 448, y: 50 } as const;
export const BOTTLE_POS: Record<string, { x: number; y: number }> = {
  bW: { x: 318, y: 48 }, bI: { x: 366, y: 48 }, bE: { x: 414, y: 50 }, bN: { x: 424, y: 50 }, bS: { x: 462, y: 50 }, bSc: { x: 472, y: 50 }, bL: { x: 482, y: 50 },
};
export const CYLINDER_POS: Record<string, { x: number; y: number }> = { g1: { x: 384, y: 40 }, g2: { x: 494, y: 40 } };
export const PIPETTE_POS = { x: 392, y: 12 } as const;
export const COLORIMETER_POS = { x: 372, y: 14 } as const;
export const THERMO_POS = { x: 494, y: 16 } as const;
export const ASSAY_DROPPER_POS: Record<string, { x: number; y: number }> = { dBi: { x: 442, y: 30 }, dAg: { x: 450, y: 30 } };

/** Tubos de ensayo en la gradilla (índice → posición). */
export const tubePos = (i: number) => ({ x: TUBE_RACK.x - 7.5 + i * 2.5, y: TUBE_RACK.y, z: 1 });
/** Piezas de membrana en su bandeja (tres por fila). */
export const membranePos = (i: number) => ({ x: MEMBRANE_TRAY.x - 5 + (i % 3) * 5, y: MEMBRANE_TRAY.y - 3 + Math.floor(i / 3) * 3, z: MEMBRANE_TRAY.z });
