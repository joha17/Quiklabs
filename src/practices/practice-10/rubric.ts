/**
 * Evaluación por evidencia de la Práctica 10 (§31): seguridad y montaje 15 %, preparación gravimétrica y volumétrica
 * 20 %, reacción y recolección de CO₂ 15 %, correcciones de presión y cálculo de R 20 %, recolección Boyle 15 %,
 * gráfica, ajuste e interpretación 10 %, actividades 5 %. Los cálculos se comparan con lo que corresponde a las
 * lecturas que el estudiante realmente obtuvo; un accidente deja la seguridad en cero (§31.2).
 */
import type { P10World } from '../../simulation/gas-world/types';
import { finalizeComponent, item, type Evaluation } from '../../simulation/scoring/types';
import { atomImbalance } from '../../simulation/gas-laws/stoich';
import { SENSOR_PROFILES } from '../../simulation/instruments/pressure-sensor';
import { p10StageEvidence } from './evidence';
import { expectedActivities, expectedBoyle, expectedRep, massReadings } from './expected-results';
import { answered, filledAnalysis, parseNum, type P10Notebook, type Rep } from './notebook';

const n = (w: P10World, k: string) => w.evidence[k] ?? 0;
const close = (s: string, v: number | null, rel = 0.02, abs = 1e-12) => {
  if (v === null || !s.trim()) return false;
  const x = parseNum(s);
  return Number.isFinite(x) && Math.abs(x - v) <= Math.max(abs, Math.abs(v) * rel);
};

export const P10_WEIGHTS = { safety: 0.15, prep: 0.2, reaction: 0.15, rcalc: 0.2, boyle: 0.15, fit: 0.1, activities: 0.05 } as const;

/** Errores de cálculo detectados en la libreta (§26.5, §26.6) con sus claves `nb:*`. */
export function notebookIssues(w: P10World, nb: P10Notebook): string[] {
  const out: string[] = [];
  for (const rep of ['r1', 'r2'] as Rep[]) {
    const t = nb.t103;
    const tc = parseNum(t.tC[rep].value);
    const tk = parseNum(t.tK[rep].value);
    if (Number.isFinite(tc) && Number.isFinite(tk) && Math.abs(tk - tc) < 1) out.push('nb:celsius');
    const patm = parseNum(t.patm[rep].value);
    const dP = parseNum(t.dP[rep].value);
    const pc = parseNum(t.pCo2[rep].value);
    if ([patm, dP, pc].every(Number.isFinite) && Math.abs(pc - (patm - dP)) < 0.002) out.push('nb:noVapor');
    const pv = parseNum(t.pv[rep].value);
    if (Number.isFinite(pv) && pv > 1) out.push('nb:mmHgConversion');
    const h = parseNum(t.hMm[rep].value);
    if (Number.isFinite(h) && Number.isFinite(dP) && Math.abs(h) > 3 && Math.sign(h) !== Math.sign(dP)) out.push('nb:heightSign');
  }
  const m = massReadings(w);
  const bm = parseNum(nb.t102.bicarbMass.value);
  if (m.sample && Number.isFinite(bm) && Math.abs(bm - m.sample.displayedG) < 0.0005 && m.empty && m.empty.displayedG > 1) out.push('nb:tareAsDifference');
  if (nb.vinegarBasis && nb.vinegarBasis !== w.params.vinegar.basis) out.push('nb:wrongBasis');
  if (parseNum(nb.prep.flaskMl) !== w.params.flaskMl && Number.isFinite(parseNum(nb.prep.flaskMl))) out.push('nb:flask50');
  const gauge = SENSOR_PROFILES[w.sensor.model].kind === 'GAUGE';
  if (nb.pressureKind && (nb.pressureKind === 'GAUGE') !== gauge) out.push('nb:gaugeAsAbsolute');
  if (nb.fit.better === 'PLUS_ONE') out.push('nb:nPlusOne');
  if (!w.evidence.sensorChecked) out.push('nb:noAmbientCheck');
  if ((w.evidence['rinse:watch_glass'] ?? 0) < 1 && massReadings(w).sample) out.push('nb:noRinseGlass');
  if (w.flask.mix < 0.9 && w.evidence.aliquotDelivered) out.push('nb:notHomogenized');
  if (w.runs.some((r) => r.limiting === 'CH3COOH')) out.push('nb:acidLimiting');
  if (Object.values(w.connections).some((c) => c.connectedTo && !c.secured)) out.push('nb:loose');
  if (w.burette.mouthAboveFloorCm < 0.25 && w.connections.c_tip.connectedTo) out.push('nb:tipObstructed');
  if (Object.keys(w.evidence).some((k) => k.startsWith('latch:escape:') && w.evidence[k])) out.push('nb:escape');
  return [...new Set(out)];
}

export function evaluateP10(w: P10World, nb: P10Notebook): Evaluation {
  const flags = p10StageEvidence(w, nb);
  const ins = (t: string) => !!w.evidence[`inspected:${t}`];
  const issues = notebookIssues(w, nb);
  const accident = n(w, 'err:overpressure') > 0 || n(w, 'err:plungerOut') > 0;
  const r1 = expectedRep(w, 'r1');
  const r2 = expectedRep(w, 'r2');
  const run1 = w.runs[0] ?? null;

  const safety = accident
    ? [item('p10.accident', false, 10, 'p10fb.accident')]
    : [
      item('p10.ppe', flags.ppe, 2, 'p10fb.ppe'),
      item('p10.inspect', ins('abalance') && ins('burette') && ins('hose') && ins('syringe'), 2, 'p10fb.inspect'),
      item('p10.propipette', !n(w, 'err:mouthPipette'), 3, 'p10fb.propipette'),
      item('p10.leakTest', !!w.evidence.leakTestOk, 2, 'p10fb.leakTest'),
      item('p10.noOpenEarly', !n(w, 'err:openedEarly'), 1, 'p10fb.noOpenEarly'),
      item('p10.noUnsafeCompression', !w.evidence['latch:unsafeCompression'], 1, 'p10fb.noUnsafeCompression'),
    ];

  const m = massReadings(w);
  const prep = [
    item('p10.leveled', !!w.evidence.balanceLeveled || w.balance.levelErrorDeg < 0.5, 1, 'p10fb.leveled'),
    item('p10.tared', !!w.evidence.taredEmpty, 1, 'p10fb.tared'),
    item('p10.doors', !n(w, 'err:doorsOpen') && !n(w, 'err:unstableMass') && !n(w, 'err:tareDoorsOpen'), 2, 'p10fb.doors'),
    item('p10.byDifference', !!(m.empty && m.sample), 3, 'p10fb.byDifference'),
    item('p10.target', r1.massG !== null && Math.abs(r1.massG - w.params.targetBicarbG) <= 0.05, 1, 'p10fb.target', { g: r1.massG?.toFixed(4) ?? '—' }),
    item('p10.noSpill', !n(w, 'err:addInsideCabin') && !n(w, 'err:solidSpill') && !n(w, 'err:fingers'), 2, 'p10fb.noSpill'),
    item('p10.quantitative', n(w, 'rinse:watch_glass') >= 1 && n(w, 'rinse:beaker150') >= 3 && n(w, 'rinse:funnel') >= 1, 3, 'p10fb.quantitative'),
    item('p10.funnel', !n(w, 'err:noFunnel'), 1, 'p10fb.funnel'),
    item('p10.aforo', !n(w, 'err:flaskOver') && !w.evidence['latch:fastFinish'] && w.volumeReadings.some((v) => v.instrument === 'flask' && v.atEyeLevel), 3, 'p10fb.aforo'),
    item('p10.homogenized', !!w.evidence.homogenized && !n(w, 'err:invertOpen'), 2, 'p10fb.homogenized'),
    item('p10.pipette', !!w.evidence.pipetteConditioned && !!w.evidence.pipetteAdjusted && !n(w, 'err:blowTD') && !w.evidence['latch:pipBubble'], 3, 'p10fb.pipette'),
    item('p10.meniscus', !n(w, 'err:parallax'), 1, 'p10fb.meniscus'),
  ];

  const reaction = [
    item('p10.noBubble', (w.evidence.__airBubbleMl ?? 0) <= 0.3 && !n(w, 'err:invertInAir'), 2, 'p10fb.noBubble'),
    item('p10.aforo50', !!w.evidence.aforo50, 1, 'p10fb.aforo50'),
    item('p10.vertical', !n(w, 'err:tilt'), 1, 'p10fb.vertical'),
    item('p10.quickSeal', !!run1 && !n(w, 'err:lateSeal'), 3, 'p10fb.quickSeal', { s: run1 ? Math.round(w.evidence[`sealDelay:${run1.index}`] ?? 0) : '—' }),
    item('p10.gentle', !!run1 && !n(w, 'err:violentSwirl') && !n(w, 'err:foamHose'), 2, 'p10fb.gentle'),
    item('p10.noEscape', !!run1 && !issues.includes('nb:escape') && !n(w, 'err:overflowBurette') && !n(w, 'err:columnLost'), 3, 'p10fb.noEscape'),
    item('p10.equilibrium', !!w.evidence['reactionComplete:1'] && !n(w, 'err:readMoving') && !n(w, 'err:tempUnstable'), 2, 'p10fb.equilibrium'),
    item('p10.vinegar', !!w.evidence.vinegarRead, 1, 'p10fb.vinegar'),
  ];

  const t = nb.t103;
  const eq = nb.equation;
  const coef = (s: string) => (s.trim() === '' ? 0 : parseNum(s));
  const imb = atomImbalance({ CH3COOH: coef(eq.acid), NaHCO3: coef(eq.bicarb) }, { CH3COONa: coef(eq.acetate), CO2: coef(eq.co2), H2O: coef(eq.water) });
  const balanced = Object.keys(imb).length === 0 && coef(eq.water) > 0 && coef(eq.co2) > 0;
  const nAcidOk = close(nb.prep.nAcid, r1.nAcid, 0.05);
  const rcalc = [
    item('p10.equation', balanced, 2, 'p10fb.equation'),
    item('p10.limiting', nb.limiting !== '' && nb.limiting === r1.limiting && nAcidOk && nb.vinegarBasis === w.params.vinegar.basis, 2, 'p10fb.limiting'),
    item('p10.nCo2', close(t.nCo2.r1.value, r1.nAliquot !== null && r1.nAcid !== null ? Math.min(r1.nAliquot, r1.nAcid) : r1.nAliquot, 0.01), 3, 'p10fb.nCo2'),
    item('p10.kelvin', close(t.tK.r1.value, r1.tK, 0, 0.06) && !issues.includes('nb:celsius'), 2, 'p10fb.kelvin'),
    item('p10.volume', close(t.vL.r1.value, r1.vL, 0.01) && parseNum(t.vL.r1.value) < 0.1, 2, 'p10fb.volume'),
    item('p10.vapor', close(t.pv.r1.value, r1.pv, 0.03) && !issues.includes('nb:noVapor') && !issues.includes('nb:mmHgConversion'), 2, 'p10fb.vapor'),
    item('p10.hydro', close(t.dP.r1.value, r1.dP, 0.06, 0.0002) && !issues.includes('nb:heightSign'), 3, 'p10fb.hydro'),
    item('p10.pCo2', close(t.pCo2.r1.value, r1.pCo2, 0, 0.0012), 2, 'p10fb.pCo2'),
    item('p10.r', close(t.r.r1.value, r1.r, 0.01) && nb.rUnit === 'L·atm/(mol·K)', 4, 'p10fb.r'),
    item('p10.errorPct', close(t.errorPct.r1.value, r1.errorPct, 0.1, 0.3), 1, 'p10fb.errorPct'),
    item('p10.uR', close(t.r.r1.uncertainty || t.uR.r1.value, r1.uR, 0.4), 2, 'p10fb.uR'),
    item('p10.replicate', w.params.replicates < 2 || close(t.r.r2.value, r2.r, 0.01), 2, 'p10fb.replicate'),
  ];

  const pts = w.points;
  const gauge = SENSOR_PROFILES[w.sensor.model].kind === 'GAUGE';
  const boyle = [
    item('p10.ambientCheck', !!w.evidence.sensorChecked, 1, 'p10fb.ambientCheck'),
    item('p10.at10', !!w.evidence.connectedAt10 && !n(w, 'err:connectNot10'), 2, 'p10fb.at10'),
    item('p10.points', pts.length >= 8 ? true : pts.length >= 5 ? null : false, 3, 'p10fb.points', { n: pts.length }, pts.length / 8),
    item('p10.stableKeep', !n(w, 'err:unstableKeep') && !n(w, 'err:overloadKeep'), 2, 'p10fb.stableKeep'),
    item('p10.deadVolume', pts.length > 0 && !n(w, 'err:noDeadVolume') && !n(w, 'err:deadTwice') && !n(w, 'err:wrongTotal'), 3, 'p10fb.deadVolume'),
    item('p10.held', pts.length > 0 && !n(w, 'err:notHeld') && !n(w, 'err:valveVent'), 2, 'p10fb.held'),
    item('p10.noDuplicate', !n(w, 'err:duplicatePoint'), 1, 'p10fb.noDuplicate'),
    item('p10.absolute', nb.pressureKind === (gauge ? 'GAUGE' : 'ABSOLUTE'), 1, 'p10fb.absolute'),
  ];

  const eb = expectedBoyle(w);
  const fit = [
    item('p10.nFree', !!eb.free && close(nb.fit.nFree, eb.free.n, 0, 0.03), 4, 'p10fb.nFree', { n: eb.free ? eb.free.n.toFixed(3) : '—' }),
    item('p10.better', nb.fit.better === 'MINUS_ONE', 2, 'p10fb.better'),
    item('p10.conclusion', answered(nb.fit.conclusion) ? null : false, 2, 'p10fb.conclusion', undefined, answered(nb.fit.conclusion) ? 0.6 : 0),
    item('p10.analysis', filledAnalysis(nb) >= 3 ? null : false, 2, 'p10fb.analysis', { n: filledAnalysis(nb) }, (filledAnalysis(nb) / 4) * 0.6),
  ];

  const act = expectedActivities();
  const activities = [
    item('p10.charles', close(nb.activities.charles, act.charlesV2L, 0.003), 1, 'p10fb.charles'),
    item('p10.boyleAct', close(nb.activities.boyle, act.boyleV2Ml, 0.003) || close(nb.activities.boyle, act.boyleV2Ml / 1000, 0.003), 1, 'p10fb.boyleAct'),
    item('p10.idealN', close(nb.activities.idealN, act.idealNMol, 0.005), 1, 'p10fb.idealN'),
  ];

  const components = [
    finalizeComponent('safety', P10_WEIGHTS.safety, safety),
    finalizeComponent('prep', P10_WEIGHTS.prep, prep),
    finalizeComponent('reaction', P10_WEIGHTS.reaction, reaction),
    finalizeComponent('rcalc', P10_WEIGHTS.rcalc, rcalc),
    finalizeComponent('boyle', P10_WEIGHTS.boyle, boyle),
    finalizeComponent('fit', P10_WEIGHTS.fit, fit),
    finalizeComponent('activities', P10_WEIGHTS.activities, activities),
  ];
  const total = components.reduce((s, c) => s + c.weight * c.score, 0);
  const needsTeacherReview = [answered(nb.fit.conclusion) ? 'p10.conclusion' : '', filledAnalysis(nb) >= 3 ? 'p10.analysis' : ''].filter(Boolean);
  return { components, total, needsTeacherReview };
}
