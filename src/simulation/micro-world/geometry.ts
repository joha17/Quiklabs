/**
 * Geometría de la mesada B07 (cm; mismos ejes que B01–B06). El microscopio, la caja de láminas y los residuos son los
 * de las prácticas anteriores; se agregan los medios, las placas selladas, el visor macroscópico, el trazado digital,
 * el área de frotis, la rejilla de tinción y las maquetas no operables. Medidas de §4.
 */
export const GEO_B07 = {
  jar: { w: 7, d: 7, h: 13 },
  broth: { r: 2.5, h: 9 },
  plate: { r: 4.5, h: 1.5 },
  tray: { w: 25, d: 18, h: 3 },
  viewer: { w: 22, d: 18, h: 4 },
  board: { w: 16, d: 16, h: 0.8 },
  pad: { w: 12, d: 8, h: 0.6 },
  rack: { w: 14, d: 8, h: 4 },
  bottle: { r: 1.8, h: 8 },
  loop: { length: 16 },
  mock: { w: 14, d: 14, h: 18 },
} as const;

export const MEDIA_POS: Record<string, { x: number; y: number }> = { mNA: { x: 70, y: 28 }, mEMB: { x: 82, y: 28 }, mNB: { x: 94, y: 28 } };
export const BROTH_POS = { x: 106, y: 28 } as const;
export const CARDS_B07 = { x: 52, y: 24 } as const;
export const PLATE_TRAY = { x: 184, y: 46, z: 3 } as const;
export const VIEWER = { x: 214, y: 30, z: 4 } as const;
export const STREAK_BOARD = { x: 180, y: 18, z: 0.8 } as const;
export const RESTRICTED_POS = { x: 238, y: 52 } as const;
export const LOOP_POS = { x: 200, y: 12 } as const;
export const SMEAR_PAD = { x: 392, y: 22, z: 0.6 } as const;
export const STAIN_RACK = { x: 424, y: 24, z: 4 } as const;
export const STAIN_POS: Record<string, { x: number; y: number }> = {
  stP: { x: 402, y: 46 }, stM: { x: 412, y: 46 }, stD: { x: 422, y: 46 }, stC: { x: 432, y: 46 }, stW: { x: 444, y: 46 },
};
export const OIL_B07 = { x: 356, y: 42 } as const;
export const AUTOCLAVE_POS = { x: 480, y: 50 } as const;
export const BURNER_POS = { x: 462, y: 22 } as const;
export const slidePosB07 = (i: number) => ({ x: 374 + i * 3.4, y: 10 });
/** Posición propia de cada placa en la bandeja: 2 × 2, sin solaparse (Ø 9 cm en 25 × 18 cm). */
export const trayPos = (i: number) => ({ x: PLATE_TRAY.x + (i % 2 ? 5.5 : -5.5), y: PLATE_TRAY.y + (Math.floor(i / 2) % 2 ? 4.5 : -4.5), z: PLATE_TRAY.z });
