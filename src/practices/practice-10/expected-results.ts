/**
 * Resultados esperados de la Práctica 10 con las lecturas REALES del intento (§17, §24): con ellas se corrige la
 * libreta. También explican el sesgo de cada réplica con lo que registró el motor (§17.6) y resuelven las
 * actividades (§25).
 */
import type { GasRun, P10World, VolumeReading } from '../../simulation/gas-world/types';
import { MMHG_PER_ATM, R_REF, errorPct, toKelvin } from '../../simulation/gas-laws/ideal-gas';
import { vaporTableMmHg, waterVaporMmHg } from '../../simulation/gas-laws/vapor';
import { aceticMoles, aliquotMoles, limiting } from '../../simulation/gas-laws/stoich';
import { uAliquotRel, uDryPressureAtm, uRelR } from '../../simulation/gas-laws/uncertainty';
import { inverseFit, powerFitFixed, powerFitFree, pvProducts, residualPattern, type PvPoint } from '../../simulation/gas-laws/boyle';
import { activityAnswers } from '../../simulation/gas-laws/activities';
import { deadVolumeMl } from '../../simulation/gas-world/boyle-rig';
import { parseNum, type P10Notebook, type Rep } from './notebook';

/** Pesadas válidas del vidrio vacío y con la muestra (las últimas). */
export function massReadings(w: P10World) {
  const valid = w.massReadings.filter((m) => m.valid && !m.tare && m.objectId === 'watch_glass');
  const last = (f: (m: (typeof valid)[number]) => boolean) => [...valid].reverse().find(f) ?? null;
  return { empty: last((m) => m.bicarbG < 0.001), sample: last((m) => m.bicarbG > 0.05) };
}

export const runOf = (w: P10World, rep: Rep): GasRun | null => w.runs[rep === 'r1' ? 0 : 1] ?? null;

/** Lecturas que corresponden a una réplica: bureta antes y después, temperatura del baño, barómetro y altura. */
export function readingsForRun(w: P10World, run: GasRun | null) {
  if (!run) return { initial: null, final: null, temp: null, baro: null, height: null };
  // La réplica termina al vaciar el reactor (o al empezar la siguiente): las lecturas posteriores son de otra.
  const next = Math.min(run.endedS ?? Infinity, w.runs[run.index]?.acidAddedAt ?? Infinity);
  const prevEnd = run.index > 1 ? (w.runs[run.index - 2].endedS ?? w.runs[run.index - 2].acidAddedAt) : -Infinity;
  const bur = w.volumeReadings.filter((v) => v.instrument === 'burette' && v.atEyeLevel && !v.invalid);
  const initial = [...bur].reverse().find((v) => v.t <= run.acidAddedAt && v.t >= prevEnd) ?? null;
  const final = [...bur].reverse().find((v: VolumeReading) => v.t > run.acidAddedAt && v.t <= next) ?? null;
  const temp = [...w.tempReadings].reverse().find((t) => t.t > run.acidAddedAt && t.t <= next && t.where === 'beaker600') ?? null;
  const baro = [...w.baroReadings].reverse().find((b) => b.source === 'LOCAL') ?? w.baroReadings[w.baroReadings.length - 1] ?? null;
  const height = [...w.heightReadings].reverse().find((h) => h.t > run.acidAddedAt && h.t <= next && h.rulerAligned) ?? null;
  return { initial, final, temp, baro, height };
}

export interface RepExpected {
  massG: number | null;
  nAliquot: number | null;
  nAcid: number | null;
  limiting: 'CH3COOH' | 'NaHCO3' | 'NONE';
  vL: number | null;
  tK: number | null;
  patm: number | null;
  pv: number | null;
  dP: number | null;
  pCo2: number | null;
  r: number | null;
  errorPct: number | null;
  uR: number | null;
  causes: string[];
}

/** Lo que corresponde calcular con las lecturas obtenidas (§17). */
export function expectedRep(w: P10World, rep: Rep): RepExpected {
  const p = w.params;
  const m = massReadings(w);
  const run = runOf(w, rep);
  const rr = readingsForRun(w, run);
  const massG = m.empty && m.sample ? m.sample.displayedG - m.empty.displayedG : null;
  const nAliquot = massG !== null ? aliquotMoles(massG, p.flaskMl, p.pipetteMl).nAliquot : null;
  const vinegarRead = [...w.volumeReadings].reverse().find((v) => v.instrument === 'cylinder' && v.atEyeLevel);
  const nAcid = vinegarRead ? aceticMoles(p.vinegar, vinegarRead.valueMl) : null;
  const lim = nAliquot !== null && nAcid !== null ? limiting(nAcid, nAliquot) : { limiting: 'NONE' as const, nCO2: nAliquot ?? 0 };
  const n = nAliquot !== null ? (nAcid !== null ? lim.nCO2 : nAliquot) : null;
  const vL = rr.initial && rr.final ? Math.abs(rr.initial.valueMl - rr.final.valueMl) / 1000 : null;
  const tC = rr.temp?.valueC ?? null;
  const tK = tC !== null ? toKelvin(tC) : null;
  const patm = rr.baro ? rr.baro.mmHg / MMHG_PER_ATM : null;
  const pv = tC !== null ? waterVaporMmHg(tC, p.vapor) / MMHG_PER_ATM : null;
  const dP = rr.height ? rr.height.valueMm / p.densityRatio / MMHG_PER_ATM : null;
  const pCo2 = patm !== null && pv !== null && dP !== null ? patm - dP - pv : null;
  const r = pCo2 !== null && vL !== null && n !== null && tK !== null && n > 0 ? (pCo2 * vL) / (n * tK) : null;
  let uR: number | null = null;
  if (r !== null && massG !== null && tC !== null && pCo2 !== null && vL !== null && n !== null && tK !== null) {
    const uP = uDryPressureAtm({ uBarometerAtm: p.barometer.uncertaintyMmHg / MMHG_PER_ATM, tC, uTC: p.thermometer.uncertaintyC, uHMm: p.ruler.uncertaintyMm, ratio: p.densityRatio, vapor: p.vapor });
    const uN = n * uAliquotRel({ massG, uMassG: Math.SQRT2 * p.balance.uncertaintyG, flaskMl: p.flaskMl, uFlaskMl: p.flaskTolMl, pipetteMl: p.pipetteMl, uPipetteMl: p.pipetteTolMl });
    const uV = (Math.SQRT2 * p.buretteUncertaintyMl) / 1000;
    uR = r * uRelR({ pAtm: pCo2, uPAtm: uP, vL, uVL: uV, n, uN, tK, uTK: p.thermometer.uncertaintyC });
  }
  return {
    massG, nAliquot, nAcid, limiting: lim.limiting, vL, tK, patm, pv, dP, pCo2, r, errorPct: r !== null ? errorPct(r, R_REF) : null, uR,
    causes: run ? diagnose(w, run) : [],
  };
}

/** Causas registradas por el motor del sesgo de una réplica (§17.6). */
export function diagnose(w: P10World, run: GasRun): string[] {
  const out: string[] = [];
  const g = Math.max(1e-12, run.co2Generated);
  if (run.co2Escaped / g > 0.01) out.push('escaped');
  if (run.co2Leaked / g > 0.01) out.push('leak');
  if (run.co2Dissolved / g > 0.01) out.push('dissolvedBath');
  if (w.reactor.co2Generated > 0 && w.liquids.erlenmeyer.nCo2Aq / g > 0.02) out.push('dissolvedReactor');
  if ((w.evidence.__airBubbleMl ?? 0) > 0.3) out.push('airBubble');
  if (w.evidence[`latch:overflow:${run.index}`]) out.push('overflow');
  if (run.limiting === 'CH3COOH') out.push('acidLimiting');
  if ((w.evidence[`sealDelay:${run.index}`] ?? 0) > 4) out.push('lateSeal');
  if (w.evidence['err:perspective']) out.push('perspective');
  if (w.evidence['err:readMoving']) out.push('notEquilibrated');
  return out;
}

/** Puntos de Boyle con los volúmenes totales que escribió el estudiante (o los del sensor si faltan). */
export function boylePoints(w: P10World, nb: P10Notebook | null): PvPoint[] {
  if (nb && nb.boyle.length) {
    return nb.boyle.map((r) => ({ vMl: parseNum(r.totalMl), pKPa: parseNum(r.pKPa) })).filter((q) => Number.isFinite(q.vMl) && Number.isFinite(q.pKPa));
  }
  return w.points.map((q) => ({ vMl: q.enteredTotalMl, pKPa: q.displayedKPa }));
}

/** Ajustes con los puntos del sensor y el volumen muerto correcto (la «verdad» del análisis). */
export function expectedBoyle(w: P10World) {
  const dead = deadVolumeMl(w);
  const pts: PvPoint[] = w.points.map((q) => ({ vMl: q.markMl + dead, pKPa: q.displayedKPa }));
  return {
    dead,
    pts,
    free: powerFitFree(pts),
    minusOne: powerFitFixed(pts, -1),
    plusOne: powerFitFixed(pts, 1),
    inverse: inverseFit(pts),
    pv: pvProducts(pts),
    pattern: residualPattern(pts),
  };
}

export const expectedActivities = () => activityAnswers();

/** Presión de vapor para la tabla de la guía (ayuda a la libreta). */
export const vaporAtm = (tC: number) => vaporTableMmHg(tC) / MMHG_PER_ATM;
