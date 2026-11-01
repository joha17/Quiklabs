/**
 * Geometría de la mesada B10 (cm; mismos ejes y apoyos que B01). El microscopio, la caja, el estereoscopio y los residuos son los de
 * siempre; se agregan la mesa de orientación, los estantes de modelos, de cráneos y la bandeja de huellas. Medidas de representación.
 */
export const GEO_B10 = {
  board: { w: 26, d: 3, h: 16 },
  shelf: { w: 26, d: 11, h: 13 },
  trackTray: { w: 22, d: 14, h: 2.4 },
  source: { w: 8, d: 5, h: 3 },
} as const;

export const SHELF_POS: Record<string, { x: number; y: number }> = {
  invRack: { x: 470, y: 50 },
  verRack: { x: 497, y: 50 },
  birdRack: { x: 524, y: 50 },
  skullRack: { x: 546, y: 28 },
};
export const TRACK_TRAY_POS = { x: 488, y: 12 } as const;
/** Mesa de orientación: a la derecha de los recipientes, sin que ninguno la tape. */
export const ORIENT_POS = { x: 128, y: 50 } as const;
export const HYPOTHESIS_POS = { x: 66, y: 50 } as const;
export const MUSCLE_SOURCE_POS = { x: 128, y: 46 } as const;
export const WATER_POS = { x: 196, y: 36 } as const;
export const IMAGE_PX_B10 = 1000;
