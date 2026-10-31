/**
 * Geometría de la mesada B08 (cm; mismos ejes que B01–B07). El orden operativo es A → D → E → B → C → F (§1): gases a la
 * izquierda del microscopio compartido y, a la derecha, indicador y campana. Medidas `≈`: prototipo gráfico (§4).
 */
export const GEO_B08 = {
  tube: { r: 1.5, h: 15, capacityMl: 50 },
  btb: { r: 1.2, h: 13, capacityMl: 25 },
  rack: { w: 22, d: 7, h: 6 },
  tank: { w: 34, d: 16, h: 11 },
  lamp: { r: 5, h: 26 },
  tray: { w: 18, d: 12, h: 1 },
  cover: { r: 2, h: 17 },
  dispenser: { w: 8, d: 8, h: 18 },
  dropper: { r: 1.2, h: 6 },
  balance: { w: 15, d: 15, h: 5 },
  mortar: { r: 5, h: 5 },
  bottle: { r: 2.2, h: 12 },
  sep: { r: 1.6, h: 14 },
  devTube: { r: 2.2, h: 24 },
  paper: { w: 1.5, l: 22 },
  stand: { w: 20, d: 8, h: 0.6 },
  hood: { w: 88, d: 56, h: 62 },
  waste: { r: 5, h: 14 },
} as const;

export const SPRIG_TRAY = { x: 138, y: 16, z: 1 } as const;
export const GAS_RACK = { x: 152, y: 50, z: 6 } as const;
export const TANK = { x: 196, y: 34, z: 3 } as const;
export const TANK_SLOT = { aqA: { x: 186, y: 34 }, aqB: { x: 206, y: 34 } } as const;
export const LAMP_HOME = { x: 232, y: 14 } as const;
export const LAMP2_HOME = { x: 372, y: 14 } as const;
export const COVER_SHELF = { x: 164, y: 14 } as const;
export const BTB_RACK = { x: 402, y: 34, z: 5 } as const;
export const BTB_TUBES: Record<string, { x: number; y: number }> = { bN: { x: 395, y: 34 }, bL: { x: 402, y: 34 }, bD: { x: 409, y: 34 } };
export const GAS_TUBES: Record<string, { x: number; y: number }> = { gL: { x: 146, y: 50 }, gD: { x: 158, y: 50 } };
export const BTB_DROPPER = { x: 386, y: 52 } as const;
export const CO2_DISPENSER = { x: 420, y: 52 } as const;
export const SPRIGS_BTB = { x: 372, y: 44 } as const;
export const HOOD = { x: 486, y: 32 } as const;
export const inHoodXY = (x: number, y: number) => Math.abs(x - HOOD.x) <= GEO_B08.hood.w / 2 && Math.abs(y - HOOD.y) <= GEO_B08.hood.d / 2;
export const BOTTLES_HOME: Record<string, { x: number; y: number }> = { bA: { x: 424, y: 14 }, bW: { x: 432, y: 22 }, bH: { x: 424, y: 26 }, bE: { x: 432, y: 34 } };
export const BOTTLES_HOOD: Record<string, { x: number; y: number }> = { bA: { x: 452, y: 50 }, bW: { x: 461, y: 50 }, bH: { x: 470, y: 50 }, bE: { x: 502, y: 50 } };
export const BALANCE = { x: 454, y: 20, z: 5 } as const;
export const MORTAR = { x: 474, y: 20, z: 0 } as const;
export const SEP_TUBE = { x: 488, y: 42 } as const;
export const VIAL = { x: 490, y: 22 } as const;
export const LEAF_HOME = { x: 440, y: 44, z: 0.2 } as const;
export const PAPER_STAND = { x: 504, y: 14, z: 0.6 } as const;
export const DEV_TUBE = { x: 520, y: 34 } as const;
export const ORGANIC_WASTE = { x: 544, y: 26 } as const;
export const DRAIN = { x: 544, y: 44 } as const;
