/**
 * Dimensiones físicas (cm) de cada objeto para colisiones, apilado y dibujo.
 * La cristalería se deriva de los perfiles de `practices/practice-02/instruments.ts` (§3.5).
 */
import type { VesselType } from '../../simulation/entities/types';
import { PROFILES, FUNNEL_STEM_CM as STEM } from '../../practices/practice-02/instruments';

export interface Dim {
  /** Radio de la huella sobre la mesada (colisiones). */
  footR: number;
  /** Altura total. */
  h: number;
  /** Radio de la boca (para recibir chorros/herramientas). 0 = no recibe. */
  mouthR: number;
  /** Altura de la boca sobre la base (pose). */
  mouthZ: number;
  /** ¿Se puede inclinar para verter? */
  tiltable: boolean;
  /** Vidrio (frágil). */
  glass: boolean;
}

const P = PROFILES;

export const VESSEL_DIM: Record<VesselType, Dim> = {
  BEAKER: { footR: P.BEAKER.outerR, h: P.BEAKER.rimY, mouthR: P.BEAKER.mouthR, mouthZ: P.BEAKER.rimY, tiltable: true, glass: true },
  TEST_TUBE: { footR: 0.9, h: P.TEST_TUBE.rimY, mouthR: P.TEST_TUBE.mouthR, mouthZ: P.TEST_TUBE.rimY, tiltable: true, glass: true },
  GRADUATED_CYLINDER: { footR: 1.8, h: P.GRADUATED_CYLINDER.rimY, mouthR: P.GRADUATED_CYLINDER.mouthR, mouthZ: P.GRADUATED_CYLINDER.rimY, tiltable: true, glass: true },
  PORCELAIN_DISH: { footR: P.PORCELAIN_DISH.outerR, h: P.PORCELAIN_DISH.rimY, mouthR: P.PORCELAIN_DISH.mouthR, mouthZ: P.PORCELAIN_DISH.rimY, tiltable: true, glass: true },
  FUNNEL: { footR: P.FUNNEL.outerR, h: P.FUNNEL.rimY + STEM, mouthR: P.FUNNEL.mouthR, mouthZ: P.FUNNEL.rimY, tiltable: false, glass: true },
  FILTER_PAPER: { footR: 3.2, h: 0.2, mouthR: 0, mouthZ: 0, tiltable: false, glass: false },
  BATH: { footR: P.BATH.outerR, h: P.BATH.rimY, mouthR: P.BATH.mouthR, mouthZ: P.BATH.rimY, tiltable: false, glass: true },
  REAGENT_JAR: { footR: P.REAGENT_JAR.outerR, h: P.REAGENT_JAR.rimY, mouthR: 1.4, mouthZ: P.REAGENT_JAR.rimY, tiltable: true, glass: true },
  REAGENT_BOTTLE: { footR: P.REAGENT_BOTTLE.outerR, h: 8.5, mouthR: 0.6, mouthZ: 8.5, tiltable: false, glass: true },
  VIAL: { footR: P.VIAL.outerR, h: P.VIAL.rimY, mouthR: 0.7, mouthZ: P.VIAL.rimY, tiltable: true, glass: true },
  WEIGH_PAPER: { footR: 3.0, h: 0.3, mouthR: 2.6, mouthZ: 0.4, tiltable: true, glass: false },
  WASH_BOTTLE: { footR: P.WASH_BOTTLE.outerR, h: 18, mouthR: 0, mouthZ: 18, tiltable: false, glass: false },
  JUG: { footR: P.JUG.outerR, h: P.JUG.rimY, mouthR: 3.5, mouthZ: P.JUG.rimY, tiltable: true, glass: false },
  ICE_BUCKET: { footR: P.ICE_BUCKET.outerR, h: P.ICE_BUCKET.rimY, mouthR: 4.6, mouthZ: P.ICE_BUCKET.rimY, tiltable: false, glass: false },
  SPATULA: { footR: 1.2, h: 0.8, mouthR: 0, mouthZ: 0, tiltable: false, glass: false },
  SCOOP: { footR: 2.2, h: 2.5, mouthR: 0, mouthZ: 0, tiltable: false, glass: false },
  DROPPER: { footR: 1.0, h: 0.8, mouthR: 0, mouthZ: 0, tiltable: false, glass: false },
  WASTE: { footR: P.WASTE.outerR, h: P.WASTE.rimY, mouthR: 3.5, mouthZ: P.WASTE.rimY, tiltable: false, glass: false },
  TOWEL: { footR: 3.5, h: 0.6, mouthR: 0, mouthZ: 0, tiltable: false, glass: false },
};

export const PROP_DIM: Record<string, { footR: number; h: number }> = {
  tray: { footR: 13, h: 3 },
  rack: { footR: 13, h: 7 },
  hotplate: { footR: 8, h: 4 },
  balance: { footR: 8, h: 5 },
  stand: { footR: 7, h: 36 },
  rod: { footR: 1.0, h: 0.6 },
  probe: { footR: 1.0, h: 0.6 },
  watch_glass: { footR: 3.2, h: 1.0 },
  tongs: { footR: 1.5, h: 0.6 },
  shards: { footR: 2, h: 0.4 },
};

/**
 * Huella rectangular sobre la mesada (semiejes en cm: hx a lo largo, hy en profundidad). Coincide con los
 * colisionadores de la física (Bodies.tsx), para que «buscar hueco libre» y la física no discrepen.
 */
export const PROP_FOOTPRINT: Record<string, { hx: number; hy: number }> = {
  hotplate: { hx: 8, hy: 8 },
  balance: { hx: 7, hy: 9 },
  stand: { hx: 7.5, hy: 4.75 },
  rack: { hx: 13, hy: 3 },
  tray: { hx: 14, hy: 2.5 },
};

/** Altura de la superficie de apoyo de cada soporte. */
export const SUPPORT_Z = {
  hotplate: 4.4,
  balance: 5.0,
  rack: 0.6,
  tray: 0.4,
  bath: 0.4,
};

export const RACK_SLOT_DX = 4.0;
export const RING_OFFSET_X = 3.0;
export const FUNNEL_STEM_CM = STEM;
/** El aro (radio 2,6 cm) sostiene el cono del embudo a esta altura sobre el vértice. */
export const RING_GRIP_Z = 3.1;
export const RING_R = 2.6;
