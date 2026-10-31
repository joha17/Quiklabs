/**
 * Modelos puros de B09 (§3.4, §6.5, §8): aumento, campo, longitud e incertidumbre, fracción de área, partición de masa y de
 * líquido, calidad del corte. La calidad es un índice didáctico calibrable (TV-DEC-06), nunca una medida de un tejido real.
 */
import { clamp } from '../core/math';
import type { CutPlane, ExternalPart, PlantParams, PlantSpecimenId } from './types';

const r6 = (v: number) => Math.round(v * 1e6) / 1e6;

export const totalMagnification = (ocularX: number, objectiveX: number) => ocularX * objectiveX;
export const fieldOfViewUm = (fieldNumberMm: number, objectiveX: number) => r6((fieldNumberMm * 1000) / objectiveX);
export const lengthUm = (px: number, umPerPx: number) => r6(px * umPerPx);
/** u_L = √((escala·u_px)² + (px·u_escala)²). */
export const lengthUncertaintyUm = (px: number, umPerPx: number, uPx: number, uScale: number) => r6(Math.hypot(umPerPx * uPx, px * uScale));
/** Fracción adimensional; no identifica una especie (R5). */
export const areaFraction = (regionPx2: number, totalPx2: number) => (totalPx2 > 0 ? r6(regionPx2 / totalPx2) : 0);

/** Partición de un líquido entre frasco, preparación y residuos (R6). */
export function partitionLiquid(initialMl: number, onSlideMl: number, wasteMl: number) {
  const remainingMl = initialMl - onSlideMl - wasteMl;
  return { remainingMl, balanceMl: initialMl - (remainingMl + onSlideMl + wasteMl) };
}

/** Partición de tejido: masa restante tras una sección y lo perdido (R7). */
export function partitionTissue(initialMg: number, sectionMg: number, lostMg: number) {
  const remainingMg = initialMg - sectionMg - lostMg;
  return { remainingMg, balanceMg: initialMg - (remainingMg + sectionMg + lostMg) };
}

/** Región correcta de corte por fuente (el resto del órgano no contiene el tejido asignado). */
export const SOURCE_REGION: Record<string, { region: string; planes: CutPlane[] }> = {
  cel: { region: 'petiole', planes: ['transverse'] },
  pea: { region: 'flesh', planes: ['transverse'] },
  lea: { region: 'blade', planes: ['transverse', 'epidermal'] },
};

export interface CutGesture {
  thicknessUm: number;
  pressure01: number;
  held: boolean;
  planeOk: boolean;
  regionOk: boolean;
}

/** Integridad 0–1 y fracción aprovechable de la sección a partir de los hechos del gesto (R8 usa el cubreobjetos, no esto). */
export function sectionQuality(p: PlantParams, g: CutGesture) {
  const t = g.thicknessUm;
  const off = t > p.freshSectionTargetUm ? (t - p.freshSectionTargetUm) / p.freshSectionTargetUm : (p.freshSectionTargetUm - t) / p.freshSectionTargetUm;
  let integrity = 1 - 0.25 * off;
  if (t < p.sectionFragileMinUm) integrity -= 0.5;
  if (g.pressure01 > p.crushPressure01) integrity -= 0.45;
  if (!g.held) integrity -= 0.35;
  const integrity01 = r6(clamp(integrity, 0, 1));
  // El campo interpretable cae con el exceso de espesor (menos luz) y con cualquier daño del corte.
  const lightLoss = t > p.sectionUsableMaxUm ? clamp((t - p.sectionUsableMaxUm) / p.sectionUsableMaxUm, 0, 0.8) : 0;
  const viable = integrity01 * (1 - lightLoss) * (g.regionOk ? 1 : 0.2) * (g.planeOk ? 1 : 0.5);
  return { integrity01, viableAreaFraction: r6(clamp(viable, 0, 1)) };
}

/** Plántulas: cada zona numerada es una región real del modelo 3D y su identidad la fija el modelo, no el texto. */
export const EXTERNAL_REGIONS: Record<PlantSpecimenId, Record<string, ExternalPart>> = {
  bean: { a: 'apicalBud', b: 'blade', c: 'petiole', d: 'node', e: 'internode', f: 'primaryRoot', g: 'lateralRoot' },
  maize: { a: 'blade', b: 'sheath', c: 'node', d: 'internode', e: 'fibrousRoot' },
};

/** Etiquetas externas mínimas para acreditar cada plántula. */
export const externalRequired = (s: PlantSpecimenId) => Object.keys(EXTERNAL_REGIONS[s]).length;
