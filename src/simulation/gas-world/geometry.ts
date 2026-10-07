/**
 * Geometría física del montaje de la Práctica 10 (cm, cm², mL). La física la usa para niveles, columnas de agua y
 * lecturas; la escena 3D dibuja con estas mismas medidas.
 */
export const GEO10 = {
  /** Bureta de 50 mL: diámetro interior 1,10 cm, exterior 1,32 cm. */
  burette: { areaCm2: Math.PI * 0.55 * 0.55, outerAreaCm2: Math.PI * 0.66 * 0.66, gradMl: 50 },
  /** Beaker de 600 mL (baño de desplazamiento). */
  beaker600: { r: 4.3, h: 12.5, floor: 0.5 },
  beaker150: { r: 2.75, h: 8.2, floor: 0.4 },
  /** Erlenmeyer de 250 mL: volumen interno bajo el tapón. */
  erlenmeyer: { volumeUnderStopperMl: 268, baseR: 4.2, h: 14 },
  /** Balón aforado: cuello de 1,10 cm (0,95 mL por cm). */
  flask: { neckAreaCm2: 0.95, bulbR: 3.0, neckLen: 9 },
  /** Pipeta de 20 mL: tallo de 0,30 cm (0,071 mL por cm). */
  pipette: { stemAreaCm2: 0.071, length: 46 },
  /** Probeta de 25 mL: 2,54 cm². */
  cylinder: { areaCm2: 2.54, h: 17, floor: 1.2 },
  /** Jeringa de 20 mL: sección 2,87 cm² (diámetro interior 1,91 cm). */
  syringe: { areaCm2: 2.87 },
};

/** Equivalencia hidrostática: kPa por cm de columna de agua (ρ ≈ 998 kg/m³). */
export const KPA_PER_CM_WATER = (998.2 * 9.80665) / 100 / 1000;

/** R en kPa·mL·mol⁻¹·K⁻¹. */
export const R_KPA_ML = 8314.462618;
