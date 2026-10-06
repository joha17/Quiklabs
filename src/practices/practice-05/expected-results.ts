/**
 * Resultados esperados de la Práctica 5 a partir de las lecturas REALES del intento (§24.1): con ellas se corrige la
 * libreta y se explica el rendimiento (pérdidas mecánicas, KClO₃ sin descomponer, lecturas inválidas).
 */
import type { P5World } from '../../simulation/stoich-world/types';
import { conversion, expelledG } from '../../simulation/stoich-world/world';
import { MOLAR_MASS, theoretical, uDiff, yieldPct } from '../../simulation/stoichiometry/stoich';
import { differences } from './evidence';

export interface P5Expected {
  mno2G: number | null;
  kclo3G: number | null;
  uKClO3: number | null;
  nKClO3: number | null;
  nKClTheo: number | null;
  mKClTheo: number | null;
  nO2Theo: number | null;
  mO2Theo: number | null;
  mKClExp: number | null;
  uKClExp: number | null;
  nKClExp: number | null;
  yieldPct: number | null;
  /** Causas de que el rendimiento se aleje de 100 % según lo que pasó en el intento. */
  causes: string[];
}

export function expectedResults(w: P5World): P5Expected {
  const d = differences(w);
  const u = w.balance.uncertaintyG;
  const th = d.kclo3 !== null ? theoretical(d.kclo3) : null;
  const y = th && d.kclExp !== null ? yieldPct(d.kclExp, th.mKCl) : null;
  const causes: string[] = [];
  const left = w.tube.contents.KClO3 * MOLAR_MASS.KClO3;
  if (left > 0.03 || conversion(w) < 0.97) causes.push('unreacted');
  if (expelledG(w) > 0.02) causes.push('expelled');
  if (w.tube.waterLostG > 0.02) causes.push('water');
  if (w.measurements.some((m) => !m.valid && m.invalidReason === 'HOT_LOAD')) causes.push('hotReading');
  if (w.measurements.some((m) => !m.valid && m.invalidReason === 'NOT_CALIBRATED')) causes.push('uncalibrated');
  if (w.spills.some((s) => !s.cleaned)) causes.push('spill');
  return {
    mno2G: d.mno2,
    kclo3G: d.kclo3,
    uKClO3: d.kclo3 !== null ? uDiff(u, u) : null,
    nKClO3: th?.nKClO3 ?? null,
    nKClTheo: th?.nKCl ?? null,
    mKClTheo: th?.mKCl ?? null,
    nO2Theo: th?.nO2 ?? null,
    mO2Theo: th?.mO2 ?? null,
    mKClExp: d.kclExp,
    uKClExp: d.kclExp !== null ? uDiff(u, u) : null,
    nKClExp: d.kclExp !== null ? d.kclExp / MOLAR_MASS.KCl : null,
    yieldPct: y,
    causes,
  };
}
