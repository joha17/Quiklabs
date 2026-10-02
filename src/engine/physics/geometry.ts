/**
 * Geometría 3D de los recipientes a partir de sus perfiles de revolución (instruments.ts):
 *  - volumen bajo un plano HORIZONTAL del mundo con el recipiente inclinado (integración por rebanadas);
 *  - nivel del líquido para un volumen dado (siempre horizontal);
 *  - cuánto cabe antes del pico al inclinar (inicio del vertido) y punto de salida del chorro.
 * El giro es alrededor del eje de profundidad, con pivote en el centro de la base. Solo lectura del estado.
 */
import type { VesselType } from '../../simulation/entities/types';
import {
  type InstrumentProfile, PROFILES, brimVolume, heightFromVolume, innerRadiusAt, volumeToHeight,
} from '../../practices/practice-02/instruments';

export interface VesselShape {
  profile: InstrumentProfile;
  /** Radio interior de la boca (cm). */
  r: number;
  /** Altura del borde sobre la base (cm). */
  h: number;
  /** Altura del fondo interior sobre la base (cm). */
  baseOffset: number;
  /** Volumen interior hasta el borde (mL). */
  fullVolumeMl: number;
  /** Caudal: mL/s por mL de exceso, y máximo (mL/s). */
  pourK: number;
  pourMax: number;
}

function shape(profile: InstrumentProfile, pourK: number, pourMax: number): VesselShape {
  return { profile, r: profile.mouthR, h: profile.rimY, baseOffset: profile.bottomY, fullVolumeMl: brimVolume(profile), pourK, pourMax };
}

const WEIGH_PROFILE: InstrumentProfile = {
  outer: [[0, 0], [3.2, 0], [3.2, 0.6]], inner: [[0, 0.05], [3.0, 0.05], [3.0, 0.6]],
  mouthR: 3.0, rimY: 0.6, bottomY: 0.05, outerR: 3.2, wall: 0.05, material: 'plastic',
};

export const SHAPES: Partial<Record<VesselType, VesselShape>> = {
  BEAKER: shape(PROFILES.BEAKER, 3, 7),
  TEST_TUBE: shape(PROFILES.TEST_TUBE, 2.5, 3),
  GRADUATED_CYLINDER: shape(PROFILES.GRADUATED_CYLINDER, 2.5, 3),
  PORCELAIN_DISH: shape(PROFILES.PORCELAIN_DISH, 3, 5),
  FUNNEL: shape(PROFILES.FUNNEL, 2, 4),
  BATH: shape(PROFILES.BATH, 2, 25),
  REAGENT_JAR: shape(PROFILES.REAGENT_JAR, 1, 2),
  REAGENT_BOTTLE: shape(PROFILES.REAGENT_BOTTLE, 0.6, 1),
  VIAL: shape(PROFILES.VIAL, 2, 2),
  WEIGH_PAPER: shape(WEIGH_PROFILE, 2, 2),
  JUG: shape(PROFILES.JUG, 2.5, 25),
  WASH_BOTTLE: shape(PROFILES.WASH_BOTTLE, 1, 2),
  WASTE: shape(PROFILES.WASTE, 2, 10),
  ICE_BUCKET: shape(PROFILES.ICE_BUCKET, 1, 1),
};

/** Punto local (lx a lo ancho, lz sobre la base) → desplazamiento en el mundo (dx, dz) tras girar `a`. */
export function rotateLocal(lx: number, lz: number, a: number): [number, number] {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [lx * c + lz * s, -lx * s + lz * c];
}

/** Punto más bajo del borde (pico de vertido) tras girar: [dx, dz] respecto del pivote. */
export function lipPoint(sh: VesselShape, angle: number): [number, number] {
  const left = rotateLocal(-sh.r, sh.h, angle);
  const right = rotateLocal(sh.r, sh.h, angle);
  return left[1] < right[1] ? left : right;
}

const SLICES = 96;

/** Área de un círculo de radio r por debajo de la cuerda u ≥ u0 (u ∈ [-1, 1] normalizado). */
function segmentArea(r: number, u0: number): number {
  if (u0 <= -1) return Math.PI * r * r;
  if (u0 >= 1) return 0;
  return r * r * (Math.acos(u0) - u0 * Math.sqrt(1 - u0 * u0));
}

/** Volumen (mL) de la cavidad por debajo del nivel horizontal L (altura respecto del pivote), inclinado `angle`. */
export function volumeBelowLevel(sh: VesselShape, angle: number, L: number): number {
  const p = sh.profile;
  // Vertical: integral exacta del perfil (las marcas de graduación usan la misma función).
  if (Math.abs(angle) < 1e-4) return volumeToHeight(p, Math.min(L, p.rimY));
  const y0 = p.inner[0][1];
  const y1 = p.rimY;
  const dy = (y1 - y0) / SLICES;
  const s = Math.sin(Math.abs(angle));
  const c = Math.cos(angle);
  let v = 0;
  for (let i = 0; i < SLICES; i++) {
    const y = y0 + (i + 0.5) * dy;
    const r = innerRadiusAt(p, y);
    if (r <= 0) continue;
    const zc = y * c; // altura del centro de la rebanada
    const u0 = (zc - L) / (r * s);
    v += segmentArea(r, u0) * dy;
  }
  return v;
}

/** Nivel (altura respecto del pivote) que encierra `volumeMl` con el recipiente inclinado `angle`. */
export function liquidLevel(sh: VesselShape, angle: number, volumeMl: number): number {
  const p = sh.profile;
  if (Math.abs(angle) < 1e-4) return heightFromVolume(p, volumeMl);
  const y0 = p.inner[0][1];
  const pts = [rotateLocal(-sh.r, y0, angle), rotateLocal(sh.r, y0, angle), rotateLocal(-sh.r, sh.h, angle), rotateLocal(sh.r, sh.h, angle)];
  let lo = Math.min(...pts.map((q) => q[1]));
  let hi = Math.max(...pts.map((q) => q[1]));
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    if (volumeBelowLevel(sh, angle, mid) < volumeMl) lo = mid;
    else hi = mid;
  }
  return Math.min((lo + hi) / 2, lipPoint(sh, angle)[1]);
}

/** Volumen (mL) que cabe sin derramar a un ángulo dado. */
export function capacityAtTilt(sh: VesselShape, angle: number): number {
  return volumeBelowLevel(sh, angle, lipPoint(sh, angle)[1]);
}

/**
 * Caudal de vertido (mL/s) según el exceso sobre lo que cabe al ángulo actual, la abertura y la viscosidad.
 * Se autolimita: al bajar el nivel, el caudal cae.
 */
export function pourRate(sh: VesselShape, angle: number, volumeMl: number, viscosity = 1): number {
  const excess = volumeMl - capacityAtTilt(sh, angle);
  if (excess <= 0) return 0;
  return Math.min(sh.pourMax, sh.pourK * excess) / Math.max(1, viscosity);
}

/** Altura del nivel sobre el fondo interior de un recipiente vertical (cm). */
export function uprightLevelCm(sh: VesselShape, volumeMl: number): number {
  return heightFromVolume(sh.profile, volumeMl) - sh.baseOffset;
}

/** Altura absoluta (sobre la base) de una marca de volumen (graduaciones). */
export function markHeight(sh: VesselShape, ml: number): number {
  return heightFromVolume(sh.profile, ml);
}
