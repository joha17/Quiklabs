/**
 * Geometría física de la Práctica 1 (cm, cm², mL): un único perfil por instrumento gobierna el volumen, el nivel, el
 * menisco y las marcas (decisión P01-8). La escena 3D dibuja con estas mismas medidas.
 */
export const GEO01 = {
  /** Probeta de 50 mL: radio interior 1,15 cm (4,155 cm²), fondo interior a 1,8 cm, borde a 17 cm. */
  cylinder50: { r: 1.15, floor: 1.8, h: 17, outerR: 1.65, baseR: 3.0 },
  /** Pipeta aforada de 25 mL: bulbo y vástago de 0,30 cm de radio interior (0,283 cm² → 3,5 cm por mL). */
  pipette25: { length: 35, tipLen: 8, bulbZ0: 9, bulbZ1: 20, bulbR: 1.1, stemR: 0.3, markZ: 27, topZ: 35 },
  /** Erlenmeyer de 150 mL: base Ø 7 cm, boca Ø 2,4 cm, alto 13 cm. */
  erlenmeyer150: { baseR: 3.5, mouthR: 1.2, neckZ: 10, mouthZ: 13 },
  /** Depósito de agua (vaso de 300 mL, boca amplia). */
  reservoir: { r: 3.6, h: 10, floor: 0.4 },
  /** Baño con hielo: bandeja de 24 × 20 × 14 cm. */
  iceBath: { w: 24, d: 20, h: 14 },
  /** Desecho (vaso de 600 mL). */
  waste: { r: 4.3, h: 12.5, floor: 0.5 },
  /** Piseta. */
  washBottle: { r: 3.2, h: 16 },
  /** Platillo de la balanza granataria (Ø 13 cm) y su altura sobre la mesada. */
  balance: { w: 24, d: 28, h: 12, panR: 6.5, panZ: 8.4 },
  /** Vidrio de reloj, recipiente de pesada y bandeja para derrames. */
  watchGlass: { r: 4.5, h: 1.1 },
  weighBoat: { w: 8, d: 8, h: 2 },
  spillTray: { w: 22, d: 18, h: 3 },
};

export const areaOf = (r: number) => Math.PI * r * r;

/** Sección interior de la probeta (cm²) y volumen por cm de altura. */
export const CYL_AREA = areaOf(GEO01.cylinder50.r);
/** Sección del vástago de la pipeta (cm²). */
export const PIP_STEM_AREA = areaOf(GEO01.pipette25.stemR);
