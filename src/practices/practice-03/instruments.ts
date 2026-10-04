/**
 * Dimensiones físicas del instrumental de la Práctica 3 (cm). Las usan el dominio (geometría de contacto,
 * inmersión, zonas de la llama) y la escena 3D (modelos procedurales), para que ambos coincidan.
 */
export const BURNER = {
  baseR: 4.6,
  baseH: 1.3,
  barrelR: 0.75,
  /** Altura de la boca del cañón sobre la mesada. */
  mouthZ: 14.5,
  mouthR: 0.55,
  /** Collar de aire (altura del centro). */
  collarZ: 3.4,
  collarH: 1.5,
  /** Entrada lateral de gas: de costado (+x, hacia la llave de mesa) y algo hacia atrás, a 2 cm de altura. */
  inlet: { dx: 3.2, dy: 1.2, z: 2.1 },
  /** Perilla de la válvula de aguja (frente, bajo la base del cañón). */
  needleKnob: { dx: 0, dy: -3.6, z: 0.9 },
} as const;

/** Toma de gas de la canaleta de servicios (pared). */
export const GAS_TAP = { z: 12, nozzleDy: -2.5 } as const;

export const TUBE = {
  outerR: 0.8,
  innerR: 0.68,
  height: 15,
  /** El fondo interior está 0,1 cm sobre la base del tubo; el fondo redondeado se aproxima a un cilindro. */
  bottomZ: 0.4,
  /** Altura de líquido por mL (cm). */
  cmPerMl: 1 / (Math.PI * 0.68 * 0.68),
  /** El tubo en la gradilla apoya sobre la base de la gradilla. */
  rackBaseZ: 0.6,
} as const;

export const LOOP = {
  ringR: 0.22,
  /** Alambre (aro → mango) y mango. */
  wireLen: 6,
  handleLen: 13,
  /** En el soporte, el aro queda arriba. */
  holderRingZ: 22,
  /** Distancia a la que dos aros se tocan. */
  touchCm: 0.7,
} as const;

export const CAPSULE = { rimR: 4.2, height: 2.3, bottomR: 2.2 } as const;
export const TILE = { half: 9, h: 1.1 } as const;
export const GLASS = { halfW: 4.5, halfH: 4.5, handleLen: 9 } as const;
export const HCL_VIAL = { r: 1.4, h: 5.5 } as const;
export const RINSE = { r: 3.2, h: 6, waterZ: 4.2 } as const;
export const RACK = { slots: 8, pitch: 3.6, hx: 16, hy: 3.5, h: 7 } as const;
export const HOLDER = { slots: 8, pitch: 3.2, hx: 14, hy: 2.6, h: 4 } as const;
export const LIGHTER = { length: 26 } as const;
