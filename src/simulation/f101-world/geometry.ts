/**
 * Geometría física de F101 (cm salvo que se indique). Un único perfil por aparato gobierna la física y el dibujo: la
 * escena 3D lee estas mismas medidas (sección de la probeta, radio de la mesa de fuerzas, alturas de apoyo).
 */
export const GEOF101 = {
  /** Probeta de 100 mL: radio interior 1,4 cm (6,158 cm²), fondo interior a 1,2 cm, borde a 19 cm. */
  gradCyl: { r: 1.4, floor: 1.2, h: 19, outerR: 1.75, baseR: 3.6 },
  /** Mesa de fuerzas: Ø 35 cm, tablero a 28 cm sobre la mesada, poleas 2 cm fuera del borde. */
  forceTable: { r: 17.5, topZ: 28, pulleyOut: 2.2, pinR: 0.4, ringR: 0.75, ringGapCm: 0.35, ringLimitCm: 4 },
  /** Balanza de 2 kg: platillo Ø 14 cm a 7 cm. */
  balance: { w: 20, d: 26, h: 7.5, panR: 7, panZ: 7.5 },
  dish: { r: 4.5, h: 1.4 },
  caliper: { length: 23, beamW: 1.6, jawLen: 4 },
  micrometer: { frameW: 7, frameH: 5, anvilZ: 3.2 },
  ruler: { length: 30, w: 2.8 },
  tray: { w: 22, d: 14, h: 2.5 },
  massRack: { w: 16, d: 8, h: 6 },
  sensorBox: { w: 8, d: 6, h: 4 },
  dynamometer: { length: 18, r: 0.9 },
};

export const areaOf = (r: number) => Math.PI * r * r;
/** Sección interior de la probeta (cm² = mL por cm). */
export const GRADCYL_AREA = areaOf(GEOF101.gradCyl.r);
/** Centro de la mesa de fuerzas sobre la mesada (cm). */
export const TABLE_CENTER = { x: 300, y: 32 };
