/**
 * Resultados esperados de la Práctica 6 con las lecturas REALES del intento (§16, §17, §20.6): con ellas se corrige la
 * libreta. También explican el sesgo de cada ensayo con lo que el motor registró (§13.3).
 */
import type { MassReading, P6World, Run, TempReading } from '../../simulation/calorimetry-world/types';
import { C_WATER, identify, specificHeatCorrected, specificHeatIdeal, uDiff, uSpecificHeat } from '../../simulation/calorimetry/heat';
import { METALS, UNKNOWN_BANK, type MetalId } from '../../simulation/calorimetry/materials';
import { bombCorrectedDT } from '../../simulation/calorimetry-world/bomb';
import type { Col } from './notebook';

/** Ensayo del hierro y del incógnito (el último de cada uno). */
export function runFor(w: P6World, col: Col): Run | null {
  const rs = w.runs.filter((r) => (col === 'fe' ? r.metal === 'Fe' : r.metal !== 'Fe'));
  return rs[rs.length - 1] ?? null;
}

/** Lecturas válidas que corresponden a un ensayo (tomadas antes de que empezara y después del anterior). */
export function readingsFor(w: P6World, run: Run | null, col: Col) {
  const idx = run ? run.index : w.runs.length;
  const valid = w.massReadings.filter((m) => m.valid && !m.zeroCheck && m.runsBefore === idx);
  const last = (f: (m: MassReading) => boolean) => [...valid].reverse().find(f) ?? null;
  const tube = col === 'fe' ? 'tube_fe' : 'tube_x';
  const cylEmpty = last((m) => m.objectId === 'cylinder' && m.waterG < 0.5);
  const cylWater = last((m) => m.objectId === 'cylinder' && m.waterG > 10);
  const tubeEmpty = last((m) => m.objectId === tube && m.metalG <= 0);
  const tubeMetal = last((m) => m.objectId === tube && m.metalG > 0);
  const temps = w.tempReadings.filter((t) => t.runsBefore === idx && !t.peak && (!run || t.t <= run.startS));
  const lastT = (f: (t: TempReading) => boolean) => [...temps].reverse().find(f) ?? null;
  return { cylEmpty, cylWater, tubeEmpty, tubeMetal, tiWater: lastT((t) => t.where === 'cup'), tiMetal: lastT((t) => t.where === 'bath'), tf: run?.recorded ?? null };
}

export interface ColExpected {
  waterMass: number | null;
  metalMass: number | null;
  tiWater: number | null;
  tiMetal: number | null;
  tf: number | null;
  qWater: number | null;
  cIdeal: number | null;
  cCorr: number | null;
  uC: number | null;
  errorPct: number | null;
  causes: string[];
}

export function expectedCol(w: P6World, col: Col): ColExpected {
  const run = runFor(w, col);
  const r = readingsFor(w, run, col);
  const p = w.params;
  const mw = r.cylWater && r.cylEmpty ? r.cylWater.displayedMassG - r.cylEmpty.displayedMassG : null;
  const mm = r.tubeMetal && r.tubeEmpty ? r.tubeMetal.displayedMassG - r.tubeEmpty.displayedMassG : null;
  const TiW = r.tiWater?.valueC ?? null;
  const TiM = r.tiMetal?.valueC ?? null;
  const Tf = r.tf?.c ?? null;
  const all = mw !== null && mm !== null && TiW !== null && TiM !== null && Tf !== null;
  const qWater = mw !== null && TiW !== null && Tf !== null ? mw * C_WATER * (Tf - TiW) : null;
  const cIdeal = all ? specificHeatIdeal(mw!, TiW!, Tf!, mm!, TiM!) : null;
  const Ccal = p.model === 'REALISTIC' ? p.cupHeatCapJPerC : 0;
  const cCorr = all ? specificHeatCorrected(mw!, TiW!, Tf!, mm!, TiM!, Ccal) : null;
  const uM = uDiff(p.balance.uncertaintyG, p.balance.uncertaintyG);
  const u = all ? uSpecificHeat({ mw: mw!, uMw: uM, mm: mm!, uMm: uM, TiW: TiW!, TiM: TiM!, Tf: Tf!, uT: p.thermometer.uncertaintyC, Ccal }).u : null;
  const ref = col === 'fe' ? METALS.Fe.cp : null;
  const causes: string[] = [];
  if (run) {
    if (run.transferS > 15) causes.push('slowTransfer');
    if (run.metalCAtEntry < run.bathCAtLift - 1.5) causes.push('metalNotAtBath');
    if (run.piecesLost) causes.push('piecesLost');
    if (run.bathWaterInG > 0.05) causes.push('bathWater');
    if (run.recorded?.judgement === 'EARLY') causes.push('peakEarly');
    if (run.recorded?.judgement === 'LATE') causes.push('peakLate');
    if (w.evidence[`latch:lid:${run.index}`]) causes.push('lidOpen');
    if (w.evidence[`stirErr:${run.index}`]) causes.push('notStirred');
  }
  if (p.model === 'REALISTIC') causes.push('calorimeterIgnored');
  if (r.cylEmpty && r.cylEmpty.wetG > 0.05) causes.push('wetCylinder');
  if (w.cal.splashLossG > 0.2) causes.push('splash');
  return { waterMass: mw, metalMass: mm, tiWater: TiW, tiMetal: TiM, tf: Tf, qWater, cIdeal, cCorr, uC: u, errorPct: ref && cIdeal !== null ? (Math.abs(cIdeal - ref) / ref) * 100 : null, causes };
}

/** Identificación del incógnito con incertidumbre (§15.2). */
export function expectedIdentification(w: P6World) {
  const e = expectedCol(w, 'x');
  if (e.cCorr === null || e.uC === null) return null;
  const c = w.params.model === 'REALISTIC' ? e.cCorr : e.cIdeal!;
  const cands = UNKNOWN_BANK.map((id) => ({ id, cp: METALS[id].cp, uCp: METALS[id].uCp }));
  return { c, u: e.uC, ...identify(c, Math.max(e.uC, 0.005), cands) };
}

/** §20.6 — calor de combustión con la constante cargada y las correcciones. */
export function expectedBomb(w: P6World) {
  const b = w.bomb;
  if (b.ignitedAt === null || b.energyEquivalent === null || !b.sampleReadingG) return null;
  const dt = bombCorrectedDT(b.series, Math.round(b.ignitedAt));
  if (!dt) return null;
  const qObs = b.energyEquivalent * dt.dT;
  const hcJPerG = (qObs - b.qWireJ - b.qAuxJ) / b.sampleReadingG;
  return { dT: dt.dT, qObs, wireJ: b.qWireJ, auxJ: b.qAuxJ, hcJPerG, completeness: b.completeness, bucketBias: b.effectiveJPerC - b.energyEquivalent };
}

/** §19 — respuestas de las actividades con el supuesto del estudiante. */
export function expectedActivities(assumedAmbientC: number) {
  return {
    a2KJ: (94 * METALS.Fe.cp * (200 - assumedAmbientC)) / 1000,
    a3C: 34 + (150 * C_WATER * (34 - 23)) / (25 * METALS.Cu.cp),
  };
}

export const refCp = (id: MetalId) => METALS[id].cp;
