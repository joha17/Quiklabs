/**
 * Geometría de la mesada B04 (cm; mismos ejes de B01). A la izquierda, la estación A (balanza, polvos, hígado, placas
 * con agitador, beakers, probetas y frascos de lotes); al centro el microscopio compartido y la caja de láminas con los
 * frascos de Feulgen (D); a la derecha las reacciones a temperatura ambiente (B), el baño María (C) y las enzimas (E).
 * Medidas `pending`: proporciones de un puesto escolar, no cotas medidas. Un mismo perfil por cristalería (§4.2).
 */
export const GEO_B04 = {
  bottle: { r: 2.4, h: 11 },
  cylinder100: { r: 1.9, h: 26 },
  cylinder10: { r: 0.9, h: 16 },
  pipette: { length: 16 },
  dropper: { r: 1.5, h: 7 },
  beaker250: { r: 3.8, h: 9.5 },
  beaker50: { r: 2.3, h: 5.6 },
  beaker25: { r: 1.8, h: 4.6 },
  rinse: { r: 3.6, h: 8 },
  rack: { w: 22, d: 5, h: 5 },
  tube: { r: 0.8, h: 10 },
  hotplate: { w: 16, d: 18, h: 9 },
  bar: { length: 2.5 },
  balance: { w: 16, d: 20, h: 6 },
  boat: { w: 5, d: 5, h: 0.8 },
  jar: { r: 2.6, h: 6 },
  board: { w: 14, d: 10, h: 1 },
  bath: { w: 24, d: 14, h: 11 },
  tongs: { length: 18 },
  thermometer: { length: 18 },
  photometer: { w: 14, d: 12, h: 7 },
  cuvette: { w: 1.2, d: 1.2, h: 4.5 },
  stainJar: { r: 1.8, h: 9 },
  waste: { r: 6, h: 16 },
  strips: { w: 4, d: 6, h: 1.5 },
  burner: { r: 2.4, h: 12 },
} as const;

export const BALANCE_POS = { x: 112, y: 18 } as const;
export const BOAT_ON_BALANCE = { x: 112, y: 18, z: GEO_B04.balance.h } as const;
export const JAR_POS: Record<string, { x: number; y: number }> = { jSt: { x: 100, y: 38 }, jAm: { x: 112, y: 38 } };
export const BOARD_B04 = { x: 136, y: 40, z: GEO_B04.board.h } as const;
export const PLATE_POS: Record<string, { x: number; y: number }> = { hp1: { x: 164, y: 20 }, hp2: { x: 194, y: 20 } };
export const BEAKER_POS: Record<string, { x: number; y: number }> = { bk1: { x: 214, y: 22 }, bk2: { x: 226, y: 22 }, bk3: { x: 236, y: 22 } };
export const BAR_POS: Record<string, { x: number; y: number }> = { sb1: { x: 178, y: 40 }, sb2: { x: 182, y: 40 }, sb3: { x: 186, y: 40 } };
export const CYL_POS: Record<string, { x: number; y: number }> = { g100: { x: 128, y: 54 }, g10: { x: 138, y: 54 } };
/** Frascos de lotes y reactivos de la fila de atrás (x, y). */
export const BOTTLE_POS_B04: Record<string, { x: number; y: number }> = {
  bW: { x: 104, y: 54 }, sEgg: { x: 152, y: 54 }, sMilk: { x: 160, y: 54 }, sGel: { x: 168, y: 54 }, sPot: { x: 176, y: 54 }, sOil: { x: 184, y: 54 },
  sGlu: { x: 192, y: 54 }, sStd: { x: 200, y: 54 }, sUnk1: { x: 208, y: 54 }, sUnk2: { x: 216, y: 54 },
  bEt: { x: 398, y: 50 }, bBe: { x: 478, y: 52 }, bB4: { x: 446, y: 54 }, bB7: { x: 454, y: 54 }, bB10: { x: 462, y: 54 },
  bH: { x: 500, y: 52 }, bHo: { x: 508, y: 52 }, bHCl: { x: 516, y: 52 }, bOH: { x: 524, y: 52 }, bMe: { x: 552, y: 56 },
  aEt: { x: 534, y: 46 }, aNad: { x: 540, y: 46 }, aAdh: { x: 546, y: 46 }, aMe: { x: 552, y: 46 },
};
export const THERMO_POS_B04 = { x: 244, y: 16 } as const;
export const STAIN_JAR_POS: Record<string, { x: number; y: number }> = { jFix: { x: 318, y: 46 }, jHcl: { x: 326, y: 46 }, jWash: { x: 334, y: 46 }, jSch: { x: 342, y: 46 } };
export const RACK_POS: Record<string, { x: number; y: number }> = { rkA: { x: 380, y: 14 }, rkB: { x: 410, y: 14 }, rkC: { x: 508, y: 14 }, rkD: { x: 538, y: 14 } };
export const DROPPER_POS_B04: Record<string, { x: number; y: number }> = { dI: { x: 372, y: 32 }, dNa: { x: 380, y: 32 }, dCu: { x: 388, y: 32 } };
export const PIPETTE_POS_B04: Record<string, { x: number; y: number }> = { pi: { x: 416, y: 32 }, pv: { x: 424, y: 32 } };
export const RINSE_POS_B04 = { x: 364, y: 44 } as const;
export const BATH_POS: Record<string, { x: number; y: number }> = { ba1: { x: 458, y: 30 }, ba2: { x: 520, y: 32 } };
export const TONGS_POS = { x: 440, y: 12 } as const;
export const PHOTOMETER_POS = { x: 550, y: 32 } as const;
export const STRIPS_POS = { x: 494, y: 30 } as const;
export const CHEM_WASTE_B04 = { x: 360, y: 56 } as const;
export const BURNER_POS = { x: 60, y: 24 } as const;

/** Tubos de cada gradilla (A, B: 8; C: 6; D: 12 en dos filas). */
export const RACK_TUBES: Record<string, string[]> = {
  rkA: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8'],
  rkB: ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8'],
  rkC: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'],
  rkD: ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11', 'D12'],
};
export const ALL_TUBES = Object.values(RACK_TUBES).flat();
export const rackOfTube = (id: string) => Object.keys(RACK_TUBES).find((r) => RACK_TUBES[r].includes(id)) ?? 'rkA';

/** Posición de un tubo en su gradilla (la D en dos filas de seis). */
export function tubeSlotPos(rack: string, i: number) {
  const p = RACK_POS[rack];
  const n = rack === 'rkD' ? 6 : RACK_TUBES[rack].length;
  const col = i % n;
  const row = Math.floor(i / n);
  return { x: p.x - ((n - 1) / 2) * 2.6 + col * 2.6, y: p.y - (rack === 'rkD' ? 1.8 : 0) + row * 3.6, z: 1 };
}
export const tubeHome = (id: string) => {
  const rack = rackOfTube(id);
  return { rack, ...tubeSlotPos(rack, RACK_TUBES[rack].indexOf(id)) };
};

/** Puestos de un baño (dos filas de cinco). */
export const bathSlotPos = (bathId: string, i: number) => ({ x: BATH_POS[bathId].x - 8 + (i % 5) * 4, y: BATH_POS[bathId].y - 3 + Math.floor(i / 5) * 6, z: 3 });
/** Cubetas del fotómetro. */
export const CUVETTES = ['q1', 'q2', 'q3', 'q4'];
export const cuvettePos = (i: number) => ({ x: PHOTOMETER_POS.x - 4.5 + i * 3, y: PHOTOMETER_POS.y - 7, z: 0.2 });
