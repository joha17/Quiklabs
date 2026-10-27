/**
 * Montaje húmedo (§5.1, §6.5): fragmento sobre el portaobjetos, gotas de líquido, cubreobjetos bajado en ángulo,
 * burbujas, hidratación, daño y contaminación. Funciones puras y deterministas: las burbujas salen de una función del
 * ángulo, la velocidad y el líquido (y, para su posición, del RNG serializable del mundo), nunca de `Math.random`.
 */
import { clamp } from '../core/math';
import type { CellMountInfo } from './thin-section';

export interface MountParams {
  /** Volumen de una gota a fuerza 0 y a fuerza 1 (mL) `pending`. */
  dropMlMin: number;
  dropMlMax: number;
  coverSizeCm: number;
  /** Tamaño máximo de fragmento que cubre bien el cubreobjetos (cm). */
  maxFragmentCm: number;
  minFragmentCm: number;
  /** Líquido mínimo bajo la cubierta para hidratar y máximo antes de que flote (mL). */
  needMl: number;
  excessMl: number;
  /** Distancia máxima gota–fragmento para humedecerlo (cm) y desplazamiento máximo a la zona útil (cm). */
  dropReachCm: number;
  edgeCm: number;
  /** Ángulo mínimo y velocidad máxima de descenso sin aire (° y cm/s) `pending`. */
  coverMinAngleDeg: number;
  coverMaxSpeedCmS: number;
  coverBreakForce01: number;
  /** Evaporación sin y con cubreobjetos (mL/s) y deshidratación del tejido sin líquido (1/s). */
  evapOpenMlS: number;
  evapCoveredMlS: number;
  dehydratePerS: number;
  /** Fracción de burbujas que vuelve inútil el montaje. */
  bubbleUsableMax: number;
}

export interface Bubble {
  /** Centro y radio en mm, respecto del centro del cubreobjetos. */
  x: number;
  y: number;
  r: number;
}

export interface FreshMount {
  slideId: string;
  specimenId: string | null;
  specimenAsset: string | null;
  /** Largo del fragmento (cm). */
  fragmentCm: number;
  cutState: 'intact' | 'prepared' | 'damaged';
  /** Centro del fragmento respecto del centro del portaobjetos (cm). */
  centerCm: [number, number];
  waterMl: number;
  /** Centro del líquido depositado (cm) y cuánto cubre el fragmento (0–1). */
  waterCenterCm: [number, number];
  wetsSpecimen: boolean;
  reagentId: string | null;
  reagentMl: number;
  coverId: string | null;
  coverOffsetCm: [number, number];
  bubbleFraction: number;
  bubbles: Bubble[];
  coveredFraction: number;
  contamination01: number;
  hydrated01: number;
  damage01: number;
  broken: boolean;
  /** Cubreobjetos desplazado por exceso de líquido (E07). */
  floating: boolean;
  /** Datos celulares (zonas, colorantes, contacto) de los montajes de B02; ausente en B01. */
  cell?: CellMountInfo;
}

export const emptyMount = (slideId: string): FreshMount => ({
  slideId, specimenId: null, specimenAsset: null, fragmentCm: 0, cutState: 'intact', centerCm: [0, 0], waterMl: 0, waterCenterCm: [0, 0], wetsSpecimen: false,
  reagentId: null, reagentMl: 0, coverId: null, coverOffsetCm: [0, 0], bubbleFraction: 0, bubbles: [], coveredFraction: 0, contamination01: 0,
  hydrated01: 1, damage01: 0, broken: false, floating: false,
});

/** Volumen de una gota según la fuerza del apretón (mL). */
export const dropVolumeMl = (p: MountParams, force01: number) => p.dropMlMin + (p.dropMlMax - p.dropMlMin) * clamp(force01, 0, 1);

/**
 * Fracción de área con aire al bajar el cubreobjetos (0–1): crece al bajarlo plano y deprisa, y si no hay líquido.
 * f(θ, v, V) = 0,02 + 0,5·a + 0,3·s·(1 − 0,4·a) + seco, con a = (θmin − θ)/θmin y s = (v − vmax)/(3·vmax), recortados.
 */
export function bubbleFractionFor(p: MountParams, angleDeg: number, speedCmS: number, waterMl: number): number {
  const a = clamp((p.coverMinAngleDeg - angleDeg) / p.coverMinAngleDeg, 0, 1);
  const s = clamp((speedCmS - p.coverMaxSpeedCmS) / (3 * p.coverMaxSpeedCmS), 0, 1);
  const dry = waterMl < p.needMl ? 0.35 * (1 - waterMl / p.needMl) : 0;
  return clamp(0.02 + 0.5 * a + 0.3 * s * (1 - 0.4 * a) + dry, 0, 1);
}

/** Fracción del fragmento que queda bajo el cubreobjetos (E02). */
export function coveredFractionFor(p: MountParams, fragmentCm: number, centerCm: [number, number], coverOffsetCm: [number, number]): number {
  if (fragmentCm <= 0) return 0;
  const half = p.coverSizeCm / 2;
  const dx = Math.abs(centerCm[0] - coverOffsetCm[0]);
  const dy = Math.abs(centerCm[1] - coverOffsetCm[1]);
  const span = (c: number, len: number) => clamp((Math.min(c + len / 2, half) - Math.max(c - len / 2, -half)) / len, 0, 1);
  const width = Math.max(0.25, fragmentCm * 0.35);
  return clamp(span(dy, fragmentCm) * span(dx, width) * clamp(p.maxFragmentCm / Math.max(fragmentCm, p.maxFragmentCm), 0, 1) ** 0.5, 0, 1);
}

/** Líquido del montaje que hidrata el tejido: el agua y, en B02, también el colorante de la receta. */
export const liquidMl = (m: FreshMount) => m.waterMl + (m.cell ? m.reagentMl : 0);

/** ¿Admite el montaje el reactivo que tiene? (B01: ninguno; B02: los de la receta). */
export const reagentOk = (m: FreshMount) => (m.cell ? !m.cell.incompatible : !m.reagentId);

/** ¿Es útil el montaje para observar? */
export function mountUsable(p: MountParams, m: FreshMount): boolean {
  return !!m.specimenId && !!m.coverId && !m.broken && m.bubbleFraction <= p.bubbleUsableMax && m.coveredFraction >= 0.7 && m.hydrated01 >= 0.6
    && m.damage01 < 0.5 && reagentOk(m) && !m.floating;
}

/** Espesor sobre el portaobjetos (mm): película de líquido + cubreobjetos (+ el tejido más grueso en B02). */
export const mountAboveMm = (m: FreshMount, coverThicknessMm: number) =>
  (m.coverId && !m.broken ? coverThicknessMm : 0) + Math.min(0.12, liquidMl(m) * 1.2) + (m.cell ? Math.max(0, ...m.cell.zones.map((z) => z.thicknessMm)) * 0.5 : 0);
