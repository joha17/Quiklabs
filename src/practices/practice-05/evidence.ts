/**
 * Evidencia de la Práctica 5 (§22.2, §23.1): qué pesada es cada lectura de la balanza y banderas por etapa. La
 * máquina avanza solo con evidencia; las banderas experimentales quedan fijadas una vez cumplidas.
 */
import type { P5Measurement, P5World } from '../../simulation/stoich-world/types';
import { isLit, yawDistance } from '../../simulation/stoich-world/world';
import { MOLAR_MASS } from '../../simulation/stoichiometry/stoich';
import type { P5Notebook } from './notebook';
import { filledAnalysis } from './notebook';
import { validateP5Equation } from './equation';

export type MeasurementKind = 'zero' | 'tubeEmpty' | 'tubeMnO2' | 'tubeInitial' | 'afterHeat' | 'other';

/** Clasifica una lectura por lo que había en el platillo al leerla (§8.1, §13). */
export function classify(m: P5Measurement): MeasurementKind {
  if (m.zeroCheck) return 'zero';
  if (m.objectId !== 'tube' || !m.contents) return 'other';
  const c = m.contents;
  const solids = c.KClO3 + c.KCl + c.MnO2;
  if (solids <= 1e-9) return 'tubeEmpty';
  if (c.KClO3 <= 1e-9 && c.KCl <= 1e-9) return 'tubeMnO2';
  if (m.cycle === 0) return 'tubeInitial';
  return 'afterHeat';
}

/** Última lectura VÁLIDA de cada tipo (y todas las válidas tras calentar, en orden). */
export function keyReadings(w: P5World) {
  const valid = w.measurements.filter((m) => m.valid);
  const last = (k: MeasurementKind) => [...valid].reverse().find((m) => classify(m) === k) ?? null;
  const after = valid.filter((m) => classify(m) === 'afterHeat');
  return { tubeEmpty: last('tubeEmpty'), tubeMnO2: last('tubeMnO2'), tubeInitial: last('tubeInitial'), afterHeat: after };
}

export interface P5StageFlags {
  ppe: boolean;
  calibrated: boolean;
  emptyTube: boolean;
  catalyst: boolean;
  reactant: boolean;
  mixed: boolean;
  assembled: boolean;
  heated: boolean;
  cooledWeighed: boolean;
  constantMass: boolean;
  stoichiometry: boolean;
  analysis: boolean;
  waste: boolean;
}

const LATCHED: Array<keyof P5StageFlags> = ['ppe', 'calibrated', 'emptyTube', 'catalyst', 'reactant', 'mixed', 'assembled', 'heated', 'cooledWeighed', 'constantMass'];

export function p5StageEvidence(w: P5World, nb: P5Notebook): P5StageFlags {
  const f = currentEvidence(w, nb);
  for (const k of LATCHED) {
    if (f[k]) w.evidence[`stage:${k}`] ??= w.timeS;
    else if (w.evidence[`stage:${k}`] !== undefined) f[k] = true;
  }
  return f;
}

function currentEvidence(w: P5World, nb: P5Notebook): P5StageFlags {
  const r = keyReadings(w);
  const p = w.params;
  const kclo3G = r.tubeInitial && r.tubeMnO2 ? r.tubeInitial.displayedMassG - r.tubeMnO2.displayedMassG : 0;
  const c = w.clamp;
  const filled = Object.values(nb.table2).filter((x) => x.trim()).length;
  return {
    ppe: w.ppe,
    calibrated: w.balance.calibratedAt !== null || !!w.evidence.calibrated,
    emptyTube: !!r.tubeEmpty,
    catalyst: !!r.tubeMnO2,
    reactant: !!r.tubeInitial && kclo3G >= p.kclo3MinG - 0.05 && kclo3G <= p.kclo3MaxG + 0.05,
    mixed: w.tube.homogeneity >= 0.6,
    assembled: w.objects.tube.support === 'clamp' && c.nutTight && w.safety.shieldPlaced && c.angleDeg >= p.angleMinDeg - 2 && c.angleDeg <= p.angleMaxDeg + 2 && yawDistance(c.mouthYawDeg, 180) >= 60,
    heated: w.tube.cycles.some((x) => x.endS !== null && x.heatedS > 60),
    cooledWeighed: r.afterHeat.length > 0,
    constantMass: !!w.evidence.constantMass,
    stoichiometry: filled >= 6 && validateP5Equation(nb.equation).ok,
    analysis: filledAnalysis(nb) >= 4,
    waste: !!w.evidence.disposed && !isLit(w.gas) && w.gas.burner.tableGasValve <= 0.02,
  };
}

/** Masas por diferencia según las lecturas (lo que el estudiante debería calcular). */
export function differences(w: P5World) {
  const r = keyReadings(w);
  const last = r.afterHeat[r.afterHeat.length - 1] ?? null;
  const mno2 = r.tubeMnO2 && r.tubeEmpty ? r.tubeMnO2.displayedMassG - r.tubeEmpty.displayedMassG : null;
  const kclo3 = r.tubeInitial && r.tubeMnO2 ? r.tubeInitial.displayedMassG - r.tubeMnO2.displayedMassG : null;
  const kclExp = last && r.tubeMnO2 ? last.displayedMassG - r.tubeMnO2.displayedMassG : null;
  return { mno2, kclo3, kclExp, final: last, readings: r };
}

/** Masa real de MnO₂ en el tubo (g). */
export const trueMnO2G = (w: P5World) => w.tube.contents.MnO2 * MOLAR_MASS.MnO2;
