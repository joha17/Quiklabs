/**
 * Modelo puro del estereoscopio: aumento y campo con el zoom, error de enfoque por altura del cabezal y perilla,
 * iluminación incidente/transmitida según la muestra (opaca, reflectante) y ajuste binocular.
 */
import { clamp } from '../../core/math';
import type { StereoParams, StereoState } from './stereo-types';

export const stereoMagnification = (p: StereoParams, zoomX: number) => p.ocularX * zoomX;
export const stereoFovMm = (p: StereoParams, zoomX: number) => p.fieldNumberMm / zoomX;

export function stereoFocus(s: StereoState, p: StereoParams, sampleTopMm: number) {
  const focal = s.headZmm + s.focusTurns * p.focusPitchMmPerTurn - p.workingDistanceMm;
  const err = Math.abs(focal - sampleTopMm);
  const sigma = p.focusSigmaMm / Math.max(0.5, s.zoomX);
  return { focusErrorMm: err, sharpness01: clamp(Math.exp(-0.5 * (err / sigma) ** 2), 0, 1) };
}

export type StereoLightIssue = 'LIGHT_OFF' | 'NO_INCIDENT' | 'GLARE' | 'LOW_LIGHT';

/** Iluminación: los opacos necesitan luz incidente; un objeto reflectante satura con incidente intensa. */
export function stereoLight(s: StereoState, p: StereoParams, sample: { opaque: boolean; reflective: boolean } | null) {
  const issues: StereoLightIssue[] = [];
  if (!s.power || (s.incident01 <= 0.001 && s.transmitted01 <= 0.001)) issues.push('LIGHT_OFF');
  else if (sample?.opaque && s.incident01 < p.incidentBand[0]) issues.push(s.transmitted01 > 0.2 ? 'NO_INCIDENT' : 'LOW_LIGHT');
  else if (!sample?.opaque && Math.max(s.incident01, s.transmitted01) < p.incidentBand[0]) issues.push('LOW_LIGHT');
  if (s.power && sample?.reflective && s.incident01 > p.incidentBand[1]) issues.push('GLARE');
  let contrast01 = issues.includes('LIGHT_OFF') ? 0 : 1;
  if (issues.includes('NO_INCIDENT')) contrast01 *= 0.3;
  if (issues.includes('LOW_LIGHT')) contrast01 *= 0.45;
  if (issues.includes('GLARE')) contrast01 *= 0.5;
  return { issues, contrast01 };
}

/** Ajuste binocular (solo cuenta con par estereoscópico real). */
export function binocular(s: StereoState, p: StereoParams) {
  if (s.channelMode !== 'stereo-pair') return { fused: true, diopterMismatch: false, ipdMismatch: false };
  const ipdMismatch = Math.abs(s.ipdMm - p.userIpdMm) > p.ipdTolMm;
  const diopterMismatch = Math.abs(s.leftDiopter - s.rightDiopter) > p.diopterTol;
  return { fused: !ipdMismatch, diopterMismatch, ipdMismatch };
}
