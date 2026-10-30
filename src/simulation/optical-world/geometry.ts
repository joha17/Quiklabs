/**
 * Geometría de la mesada B01 (cm, mismo sistema que las demás prácticas: x a lo largo, y en profundidad, z arriba).
 * Puntos de apoyo con nombre que comparten el dominio (desalineación de la lámina en la platina, centrado de la muestra
 * en el estereoscopio), la definición y el motor. Medidas de equipos `pending` de ficha del fabricante.
 */
export const GEO_B01 = {
  slide: { w: 7.5, d: 2.5, h: 0.1 },
  coverslip: { w: 1.8, d: 1.8, h: 0.017 },
  prepBoard: { w: 18, d: 12, h: 0.8 },
  dish: { r: 4.5, h: 1.5 },
  dropperBottle: { r: 1.6, h: 7 },
  coverBox: { w: 4, d: 4, h: 1.2 },
  forceps: { length: 12 },
  scalpel: { length: 12 },
  paper: { w: 8, d: 6, h: 0.05 },
  microscope: { baseW: 20, baseD: 24, stageTopZ: 14, stageW: 14, stageD: 12, height: 38 },
  slideCase: { w: 20, d: 9, h: 3.2, lidH: 1.2, wall: 0.45, rackZ: 1.2, slots: 12, pitch: 1.5 },
  stereo: { baseW: 18, baseD: 22, baseTopZ: 3, height: 34 },
  sampleTray: { w: 12, d: 7, h: 1 },
  bin: { r: 5, h: 14 },
  tray: { w: 16, d: 10, h: 1.5 },
  ppeTray: { w: 30, d: 20, h: 2 },
} as const;

export const BENCH_B01 = { length: 560, depth: 64 } as const;

/** Asiento de la lámina en la platina, área de montaje, base del estereoscopio, bandejas. */
export const MIC_POS = { x: 280, y: 34 } as const;
export const STAGE_SEAT = { x: 280, y: 30 } as const;
export const PREP_SPOT = { x: 140, y: 24, z: 0.8 } as const;
export const STEREO_POS = { x: 430, y: 34 } as const;
export const STEREO_BASE = { x: 430, y: 28, z: GEO_B01.stereo.baseTopZ } as const;
export const CASE_POS = { x: 342, y: 26 } as const;
export const SAMPLE_TRAY = { x: 462, y: 18, z: 1 } as const;
export const CLEAN_TRAY = { x: 510, y: 20, z: 1.5 } as const;
export const GLASS_BIN = { x: 70, y: 50 } as const;
export const BIO_WASTE = { x: 86, y: 50 } as const;
export const COVER_BOX = { x: 160, y: 14, z: 1.2 } as const;

export const caseSlotId = (i: number) => `s${String(i + 1).padStart(2, '0')}`;
export const caseSlotIndex = (slot: string) => Number(slot.slice(1)) - 1;
/** Posición de una ranura de la caja (lámina de canto). */
export const caseSlotPos = (i: number) => ({ x: CASE_POS.x - ((GEO_B01.slideCase.slots - 1) / 2) * GEO_B01.slideCase.pitch + i * GEO_B01.slideCase.pitch, y: CASE_POS.y, z: GEO_B01.slideCase.rackZ });
/** Altura de la cara superior de la platina sobre la mesada (cm) para una altura de platina dada (mm). */
export const stageTopZCm = (stageZmm: number) => GEO_B01.microscope.stageTopZ + stageZmm / 10;
