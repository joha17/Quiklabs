/**
 * Mesada de B05 (cm, x = 0..560, y = 0..64, z hacia arriba), compartida por el dominio y la escena. A la izquierda la
 * seguridad, los residuos y la preparación de papa del microscopio de B01/B02 (sin cambios); a la derecha las
 * estaciones propias: preparaciones (B), catalasa (D), amilasa (E), baños (C) y ADH (G). Dimensiones geométricas
 * preliminares de simulación (§4), no fichas de fabricante.
 */
export const GEO_B05 = {
  tube: { r: 0.8, h: 15, capMl: 20 },
  beaker: { bk1: { r: 3.6, h: 9.5, capMl: 250 }, bk2: { r: 2.6, h: 7, capMl: 100 }, bk3: { r: 2, h: 5.5, capMl: 50 } } as Record<string, { r: number; h: number; capMl: number }>,
  cylinder: { g100: { r: 1.6, h: 26, capMl: 100 }, g25: { r: 1.1, h: 18, capMl: 25 }, g10: { r: 0.8, h: 15, capMl: 10 } } as Record<string, { r: number; h: number; capMl: number }>,
  bottle: { r: 2.6, h: 13 },
  dropper: { r: 1.2, h: 6 },
  rack: { w: 30, d: 6, h: 8, slots: 8, pitch: 3.4 },
  plate: { w: 16, d: 16, h: 3.5 },
  balance: { w: 16, d: 18, h: 6 },
  bath: { w: 18, d: 14, h: 12 },
  collector: { w: 6, d: 6, h: 32 },
  waste: { r: 5, h: 14 },
  photometer: { w: 18, d: 16, h: 9 },
} as const;

/** Recipientes con nombre (además de tubos y cubetas). */
export const BOTTLE_IDS_B05 = ['bW', 'hp', 'hpOld', 'st1', 'naoh'] as const;
export const ADH_BOTTLES = ['nad', 'eth', 'eth2', 'meth', 'adh'] as const;
export const BEAKER_IDS_B05 = ['bk1', 'bk2', 'bk3'] as const;
export const CYLINDER_IDS_B05 = ['g100', 'g25', 'g10'] as const;
export const PIPETTE_IDS_B05 = ['p1', 'p5', 'p10'] as const;
export const DROPPER_IDS_B05 = ['dL', 'dB', 'dH', 'dN', 'dw2'] as const;
export const WASTE_IDS_B05 = ['wAq', 'wCu', 'wBio'] as const;
export const PLATE_IDS_B05 = ['hp1', 'hp2'] as const;
export const BAR_IDS_B05 = ['sb1', 'sb2'] as const;
export const BATH_IDS_B05 = ['wb1', 'wb2'] as const;
export const CLOCK_IDS_B05 = ['sw1', 'sw2'] as const;
export const LIVER_IDS_B05 = ['liv', 'livB', 'livH'] as const;
export const POWDER_IDS_B05 = ['jS', 'jA'] as const;
export const CUVETTE_IDS_B05 = ['cq', 'cs', 'cp'] as const;
export const RACK1_TUBES = ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8'] as const;
export const RACK2_TUBES = ['t9', 't10', 't11', 't12', 't13', 't14', 't15', 't16'] as const;
export const TUBE_IDS_B05 = [...RACK1_TUBES, ...RACK2_TUBES] as const;

// A — seguridad y residuos.
export const WASTE_POS: Record<string, { x: number; y: number }> = { wAq: { x: 18, y: 20 }, wCu: { x: 32, y: 20 }, wBio: { x: 46, y: 20 } };
// B — preparaciones (balanza, polvos, hígado, placas, beakers, probetas, agua).
export const BALANCE_POS = { x: 316, y: 16 } as const;
export const BOAT_POS = { x: 316, y: 16, z: GEO_B05.balance.h } as const;
export const JAR_POS: Record<string, { x: number; y: number }> = { jS: { x: 310, y: 40 }, jA: { x: 320, y: 40 } };
export const SPATULA_HOME = { x: 330, y: 44 } as const;
export const LIVER_POS: Record<string, { x: number; y: number }> = { liv: { x: 332, y: 56 }, livB: { x: 342, y: 56 }, livH: { x: 352, y: 56 } };
export const LIVER_BOARD = { x: 340, y: 40, z: 1.2 } as const;
export const LIVER_KNIFE = { x: 350, y: 44 } as const;
export const PLATE_POS: Record<string, { x: number; y: number }> = { hp1: { x: 340, y: 18 }, hp2: { x: 362, y: 18 } };
export const BAR_HOME: Record<string, { x: number; y: number }> = { sb1: { x: 330, y: 30 }, sb2: { x: 334, y: 30 } };
export const BEAKER_HOME: Record<string, { x: number; y: number }> = { bk1: { x: 376, y: 40 }, bk2: { x: 384, y: 48 }, bk3: { x: 392, y: 40 } };
export const CYLINDER_HOME: Record<string, { x: number; y: number }> = { g100: { x: 372, y: 54 }, g25: { x: 380, y: 56 }, g10: { x: 388, y: 56 } };
export const BOTTLE_POS_B05: Record<string, { x: number; y: number }> = {
  bW: { x: 364, y: 52 }, hp: { x: 404, y: 52 }, hpOld: { x: 412, y: 56 }, st1: { x: 448, y: 56 }, naoh: { x: 456, y: 56 },
  nad: { x: 534, y: 56 }, eth: { x: 541, y: 56 }, eth2: { x: 548, y: 56 }, meth: { x: 555, y: 56 }, adh: { x: 530, y: 46 },
};
// D — catalasa: gradilla 1, pipetas, colector, cronómetro 1.
export const RACK_POS: Record<string, { x: number; y: number }> = { rk1: { x: 414, y: 14 }, rk2: { x: 462, y: 14 } };
export const PIPETTE_HOME: Record<string, { x: number; y: number }> = { p1: { x: 400, y: 30 }, p5: { x: 404, y: 30 }, p10: { x: 408, y: 30 } };
export const COLLECTOR_POS = { x: 424, y: 36 } as const;
export const CLOCK_POS: Record<string, { x: number; y: number }> = { sw1: { x: 434, y: 30 }, sw2: { x: 478, y: 30 } };
// E — amilasa: gradilla 2, goteros, tiras de pH.
export const DROPPER_POS_B05: Record<string, { x: number; y: number }> = {
  dL: { x: 448, y: 32 }, dB: { x: 454, y: 32 }, dH: { x: 460, y: 32 }, dN: { x: 466, y: 32 }, dw2: { x: 472, y: 32 },
};
export const STRIPS_POS = { x: 484, y: 42 } as const;
export const RINSE_POS = { x: 438, y: 50 } as const;
// C — baños María, pinza y termómetro.
export const BATH_POS: Record<string, { x: number; y: number }> = { wb1: { x: 500, y: 22 }, wb2: { x: 520, y: 22 } };
export const TONGS_HOME = { x: 510, y: 40 } as const;
export const THERMO_POS_B05 = { x: 496, y: 42 } as const;
// G — ADH: fotómetro UV, cubetas, frascos y mechero.
export const UV_POS = { x: 546, y: 30 } as const;
export const CUVETTE_HOME: Record<string, { x: number; y: number }> = { cq: { x: 534, y: 36 }, cs: { x: 537, y: 36 }, cp: { x: 540, y: 36 } };
export const BURNER_POS_B05 = { x: 540, y: 14 } as const;

export const rackOfTube = (id: string) => ((RACK1_TUBES as readonly string[]).includes(id) ? 'rk1' : 'rk2');
export function tubeHome(id: string) {
  const rack = rackOfTube(id);
  const list = (rack === 'rk1' ? RACK1_TUBES : RACK2_TUBES) as readonly string[];
  const i = list.indexOf(id);
  const R = RACK_POS[rack];
  return { x: R.x - ((GEO_B05.rack.slots - 1) / 2) * GEO_B05.rack.pitch + i * GEO_B05.rack.pitch, y: R.y, z: 1.2 };
}
export const bathSlot = (bathId: string, i: number) => ({ x: BATH_POS[bathId].x - 6 + (i % 4) * 4, y: BATH_POS[bathId].y - 3 + Math.floor(i / 4) * 5, z: 2 });
