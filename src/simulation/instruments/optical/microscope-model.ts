/**
 * Modelo puro del microscopio compuesto (§6.5, §6.6): aumento, campo, altura de platina por los mandos, separación
 * objetivo–preparación, error de foco y nitidez visual, iluminación (luz, diafragma, condensador) y revólver indexado.
 * Sin DOM ni Three: lo usa el mundo de cada práctica y lo dibuja el motor.
 */
import { clamp } from '../../core/math';
import { LEGACY_OBJECTIVES, type MicroscopeParams, type MicroscopeState, type ObjectiveX, type PerObjective } from './microscope-types';

/** U01: M_total = M_ocular × M_objetivo. */
export const totalMagnification = (ocularX: number, objectiveX: number) => ocularX * objectiveX;

/** U02: campo ≈ FN / M_objetivo (mm), solo con un FN documentado (aquí hipotético y rotulado). */
export const fieldOfViewMm = (fieldNumberMm: number, objectiveX: number) => fieldNumberMm / objectiveX;

/** U03: límite lateral teórico d ≈ 0,61 λ / NA (m). No implica que una imagen lo contenga. */
export const resolutionLimitM = (lambdaM: number, na: number) => (0.61 * lambdaM) / na;

/** U06: nitidez visual exp(−½ (e/σ)²). */
export const sharpness01 = (focusErrorMm: number, sigmaMm: number) => clamp(Math.exp(-0.5 * (focusErrorMm / sigmaMm) ** 2), 0, 1);

/** Objetivos montados en el revólver, en orden de enclavamiento. */
export const objectivesOf = (p: MicroscopeParams): ObjectiveX[] => p.objectives ?? LEGACY_OBJECTIVES;

/** Objetivo seco fuerte o de 100X: el macrométrico ya no se usa para acercar (E22, E70, E18). */
export const isHighPower = (x: ObjectiveX | null | undefined) => !!x && x >= 40;

/** Valor de un parámetro por objetivo; sin dato propio del 100X, el del 40X. */
export const perObjective = <T>(r: PerObjective<T>, x: ObjectiveX): T => r[x] ?? r[40];

/**
 * Objetivo en el eje según el ángulo del revólver; `null` si quedó entre enclavamientos (E19). El revólver gira la
 * vuelta completa: pasado el último objetivo (100X; 40X en el de tres posiciones) vuelve el 4X.
 */
export function turretObjective(turretDeg: number, p: MicroscopeParams): { objectiveX: ObjectiveX | null; locked: boolean; index: number } {
  const a = ((turretDeg % 360) + 360) % 360;
  const n = Math.round(360 / p.turretDetentDeg);
  const k = Math.round(a / p.turretDetentDeg);
  const off = Math.abs(a - k * p.turretDetentDeg);
  const idx = k % n;
  const objs = objectivesOf(p);
  const locked = off <= p.turretLockTolDeg && idx < objs.length;
  return { objectiveX: locked ? objs[idx] : null, locked, index: Math.min(idx, objs.length - 1) };
}

export const turretDegFor = (obj: ObjectiveX, p: MicroscopeParams) => objectivesOf(p).indexOf(obj) * p.turretDetentDeg;

/** Altura de la platina (mm): macro + micro dentro de sus recorridos. */
export function stageZmm(s: MicroscopeState, p: MicroscopeParams): number {
  return clamp(p.stageZ0Mm + s.coarseTurns * p.coarsePitchMmPerTurn + s.fineTurns * p.finePitchMmPerTurn, p.stageZRangeMm[0], p.stageZRangeMm[1]);
}

/** Límites de giro: el macro recorre todo el rango; el micro, ±fineRangeMm. */
export function coarseTurnLimits(s: MicroscopeState, p: MicroscopeParams): [number, number] {
  const fine = s.fineTurns * p.finePitchMmPerTurn;
  return [(p.stageZRangeMm[0] - p.stageZ0Mm - fine) / p.coarsePitchMmPerTurn, (p.stageZRangeMm[1] - p.stageZ0Mm - fine) / p.coarsePitchMmPerTurn];
}

export const fineTurnLimit = (p: MicroscopeParams) => p.fineRangeMm / p.finePitchMmPerTurn;

/** Pila sobre la platina: portaobjetos + preparación (si la lámina está invertida, el tejido queda bajo el vidrio). */
export interface SlideStack {
  slideMm: number;
  /** Espesor sobre el portaobjetos (película + cubreobjetos, mm). */
  aboveMm: number;
  /** Profundidad del plano del tejido bajo la cara superior de la preparación (mm). */
  specimenDepthMm: number;
  faceDown: boolean;
}

/** Plano del tejido y cara superior de la preparación (mm sobre el cero de la platina). */
export function sampleHeights(stageZ: number, k: SlideStack): { focalZ: number; topZ: number } {
  if (k.faceDown) return { focalZ: stageZ + k.aboveMm - k.specimenDepthMm, topZ: stageZ + k.aboveMm + k.slideMm };
  return { focalZ: stageZ + k.slideMm + k.aboveMm - k.specimenDepthMm, topZ: stageZ + k.slideMm + k.aboveMm };
}

/** Plano focal del objetivo y altura de su lente frontal (mm). */
export function objectivePlanes(obj: ObjectiveX, p: MicroscopeParams): { focusZ: number; tipZ: number } {
  const focusZ = p.focalPlaneZMm + perObjective(p.parfocalOffsetMm, obj);
  return { focusZ, tipZ: focusZ + perObjective(p.workingDistanceMm, obj) };
}

/** Separación objetivo–preparación (mm) y error de foco (mm). Sin lámina, la separación se mide a la platina. */
export function gapAndFocus(s: MicroscopeState, p: MicroscopeParams, obj: ObjectiveX, stack: SlideStack | null) {
  const z = stageZmm(s, p);
  const { focusZ, tipZ } = objectivePlanes(obj, p);
  if (!stack) return { gapMm: tipZ - z, focusErrorMm: Infinity, stageZ: z };
  const h = sampleHeights(z, stack);
  return { gapMm: tipZ - h.topZ, focusErrorMm: Math.abs(h.focalZ - focusZ), stageZ: z };
}

export type LightIssue = 'LIGHT_OFF' | 'LOW_LIGHT' | 'WASHED' | 'DIAPHRAGM_CLOSED' | 'DIAPHRAGM_OPEN' | 'CONDENSER';

/** Iluminación de campo claro (modelo visual simplificado, no fotométrico). */
export function illumination(s: MicroscopeState, p: MicroscopeParams, obj: ObjectiveX) {
  const issues: LightIssue[] = [];
  const cond = s.condenser01 < p.condenserMin01 ? 0.55 + 0.45 * (s.condenser01 / p.condenserMin01) : 1;
  const luminance01 = s.power ? clamp(s.light01 * (0.35 + 0.65 * s.diaphragm01) * cond * 1.4, 0, 1.2) : 0;
  const [lo, hi] = perObjective(p.luminanceBand, obj);
  const [dlo, dhi] = perObjective(p.diaphragmBand, obj);
  if (!s.power || s.light01 <= 0.001) issues.push('LIGHT_OFF');
  else if (luminance01 < lo) issues.push('LOW_LIGHT');
  else if (luminance01 > hi) issues.push('WASHED');
  if (s.diaphragm01 < dlo) issues.push('DIAPHRAGM_CLOSED');
  else if (s.diaphragm01 > dhi) issues.push('DIAPHRAGM_OPEN');
  if (s.condenser01 < p.condenserMin01) issues.push('CONDENSER');
  // Contraste visual: baja con la luz fuera de banda, la apertura fuera de banda y el condensador bajo.
  let contrast01 = 1;
  if (issues.includes('LOW_LIGHT')) contrast01 *= clamp(luminance01 / lo, 0.1, 1);
  if (issues.includes('WASHED')) contrast01 *= clamp(1 - (luminance01 - hi) * 2.5, 0.15, 1);
  if (issues.includes('DIAPHRAGM_CLOSED')) contrast01 *= 0.6;
  if (issues.includes('DIAPHRAGM_OPEN')) contrast01 *= 0.55;
  if (issues.includes('CONDENSER')) contrast01 *= 0.7;
  if (issues.includes('LIGHT_OFF')) contrast01 = 0;
  return { luminance01, contrast01, issues };
}

/** Centro del campo en coordenadas del preparado (mm desde el centro de la lámina). La platina mueve la lámina. */
export function viewCenterOnSlide(s: MicroscopeState, slideOffsetMm: [number, number]): [number, number] {
  return [-(s.stageXmm + slideOffsetMm[0]), -(s.stageYmm + slideOffsetMm[1])];
}
