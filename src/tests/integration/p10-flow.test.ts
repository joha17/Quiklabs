/**
 * Práctica 10 — recorridos completos sin escena: ruta ideal con dos réplicas, máquina por etapas y evaluación,
 * Boyle, errores de técnica con consecuencia causal en R (§17.6) y catálogo de errores simulables (§26, ≥ 40).
 */
import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import type { P10World } from '../../simulation/gas-world/types';
import { elementTotals } from '../../simulation/gas-world/world';
import { emptyP10Notebook, REPS, type P10Notebook } from '../../practices/practice-10/notebook';
import { expectedActivities, expectedBoyle, expectedRep } from '../../practices/practice-10/expected-results';
import { p10StageEvidence } from '../../practices/practice-10/evidence';
import { practice10Machine, p10StageName } from '../../practices/practice-10/workflow.machine';
import { evaluateP10 } from '../../practices/practice-10/rubric';
import { SIMULATED_ERRORS_P10 } from '../../practices/practice-10/error-scenarios';
import { R_REF } from '../../simulation/gas-laws/ideal-gas';
import * as h from '../helpers10';

const f = (v: number | null, d: number) => (v === null || !Number.isFinite(v) ? '' : v.toFixed(d).replace('.', ','));

/** Lo que escribe un estudiante cuidadoso con SUS lecturas. */
function fillNotebook(w: P10World, nb: P10Notebook) {
  const e1 = expectedRep(w, 'r1');
  const m = [...w.massReadings].filter((x) => x.valid && x.objectId === 'watch_glass');
  nb.t102.glassEmpty.value = f(m.find((x) => x.bicarbG < 0.001)!.displayedG, 4);
  nb.t102.glassSample.value = f([...m].reverse().find((x) => x.bicarbG > 0.05)!.displayedG, 4);
  nb.t102.bicarbMass.value = f(e1.massG, 4);
  nb.prep.flaskMl = '100,00';
  nb.prep.aliquotMl = '20,00';
  nb.prep.nAliquot = f(e1.nAliquot, 7);
  nb.prep.nAcid = f(e1.nAcid, 6);
  nb.vinegarBasis = 'm/v';
  nb.limiting = e1.limiting === 'CH3COOH' ? 'CH3COOH' : 'NaHCO3';
  nb.equation = { acid: '1', bicarb: '1', acetate: '1', co2: '1', water: '1' };
  nb.rUnit = 'L·atm/(mol·K)';
  for (const rep of REPS) {
    const e = expectedRep(w, rep);
    if (e.r === null) continue;
    const t = nb.t103;
    t.nCo2[rep].value = f(Math.min(e.nAliquot!, e.nAcid ?? Infinity), 8);
    t.tK[rep].value = f(e.tK, 2);
    t.vL[rep].value = f(e.vL, 5);
    t.patm[rep].value = f(e.patm, 5);
    t.pv[rep].value = f(e.pv, 5);
    t.dP[rep].value = f(e.dP, 5);
    t.pCo2[rep].value = f(e.pCo2, 5);
    t.r[rep].value = f(e.r, 5);
    t.r[rep].uncertainty = f(e.uR, 5);
    t.errorPct[rep].value = f(e.errorPct, 2);
  }
  const eb = expectedBoyle(w);
  nb.boyle = w.points.map((p) => ({ pointIndex: p.index, markMl: f(p.markMl, 1), deadMl: '0,8', totalMl: f(p.enteredTotalMl, 1), pKPa: f(p.displayedKPa, 2), tK: '' }));
  nb.pressureKind = 'ABSOLUTE';
  nb.fit = { nFree: f(eb.free?.n ?? null, 3), better: 'MINUS_ONE', conclusion: 'La presión es inversamente proporcional al volumen total con n y T constantes; n ≈ −1 dentro de la incertidumbre y residuos aleatorios.' };
  const a = expectedActivities();
  nb.activities = { charles: f(a.charlesV2L, 2), boyle: f(a.boyleV2Ml, 1), idealN: f(a.idealNMol, 4) };
  const long = 'Respuesta argumentada con los datos y las causas registradas durante la práctica.';
  nb.analysis = { q1: long, q2: long, q3: long, q4: long };
}

function idealRun(seed = 1010, params = {}) {
  const w = h.world10({ seed, params });
  const a = h.partA(w);
  const b = h.secondReplicate(w);
  h.boyleSetup(w);
  h.boyleCollect(w);
  h.cmd10(w, { type: 'startCollection', on: false });
  return { w, a, b };
}

describe('Práctica 10 — ruta completa', () => {
  const { w, a } = idealRun();
  const nb = emptyP10Notebook();
  fillNotebook(w, nb);

  it('1. R de las dos réplicas a menos de 2,5 % de 0,082057 (modo curricular) con sus lecturas reales', () => {
    expect(a.r0ok).toBe(true);
    expect(a.lt.ok).toBe(true);
    for (const rep of REPS) {
      const e = expectedRep(w, rep);
      expect(e.r, rep).not.toBeNull();
      expect(Math.abs(e.r! - R_REF) / R_REF, `${rep}: ${e.r}`).toBeLessThan(0.025);
      expect(e.limiting).toBe('NaHCO3');
    }
    expect(w.runs).toHaveLength(2);
    // Las dos réplicas difieren (no hay resultados prefijados).
    expect(expectedRep(w, 'r1').r).not.toBe(expectedRep(w, 'r2').r);
  });

  it('2. conserva C, H, O y Na en todo el recorrido (sólido, disoluciones, gas, desechos)', () => {
    const e1 = elementTotals(w);
    for (const k of Object.keys(w.initialElements)) expect(Math.abs(e1[k] - w.initialElements[k]), k).toBeLessThan(1e-12);
  });

  it('3. la máquina llega a COMPLETE solo con evidencia y la evaluación es alta', () => {
    const flags = p10StageEvidence(w, nb);
    expect(Object.entries(flags).filter(([, v]) => !v).map(([k]) => k)).toEqual([]);
    const actor = createActor(practice10Machine).start();
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    actor.send({ type: 'EVIDENCE', flags });
    expect(p10StageName(actor.getSnapshot().value)).toBe('COMPLETE');
    const ev = evaluateP10(w, nb);
    const missed = ev.components.flatMap((c) => c.items.filter((i) => i.ok === false).map((i) => i.key));
    expect(missed).toEqual([]);
    expect(ev.total).toBeGreaterThan(0.9);
  });

  it('4. un cuaderno vacío no aprueba los cálculos y una libreta con °C se detecta', () => {
    const empty = evaluateP10(w, emptyP10Notebook());
    expect(empty.components.find((c) => c.id === 'rcalc')!.score).toBeLessThan(0.2);
    const bad = structuredClone(nb);
    bad.t103.tK.r1.value = bad.t103.tC.r1.value = '24,4';
    const ev = evaluateP10(w, bad);
    expect(ev.components.find((c) => c.id === 'rcalc')!.items.find((i) => i.key === 'p10.kelvin')!.ok).toBe(false);
  });
});

describe('Práctica 10 — errores con consecuencia causal (§17.6, §26)', () => {
  const base = (() => {
    const w = h.world10({ seed: 77 });
    h.partA(w);
    return expectedRep(w, 'r1').r!;
  })();

  it('tapar tarde: escapa CO₂ y R baja', () => {
    const w = h.world10({ seed: 77 });
    h.partA(w, { sealDelayS: 15 });
    expect(w.evidence['err:lateSeal']).toBeGreaterThan(0);
    expect(w.runs[0].co2Escaped).toBeGreaterThan(0);
    expect(expectedRep(w, 'r1').r!).toBeLessThan(base * 0.97);
    expect(expectedRep(w, 'r1').causes).toContain('lateSeal');
  });

  it('uniones flojas: la fuga baja R y la prueba de hermeticidad la detecta', () => {
    const w = h.world10({ seed: 77 });
    const a = h.partA(w, { secure: false });
    expect(a.lt.ok).toBe(false);
    expect(w.runs[0].co2Leaked).toBeGreaterThan(0);
    expect(expectedRep(w, 'r1').r!).toBeLessThan(base * 0.97);
  });

  it('aire inicial en la bureta tomado como 50,0 mL: R sale alto', () => {
    const w = h.world10({ seed: 77 });
    const a = h.partA(w, { mouthSubmerged: false });
    const e = expectedRep(w, 'r1');
    // El estudiante anota 50,0 como lectura inicial aunque el menisco ya estaba más abajo.
    const vWrong = (50 - a.g.readingMl) / 1000;
    expect(vWrong).toBeGreaterThan(e.vL! + 0.003);
    expect((e.pCo2! * vWrong) / (e.nAliquot! * e.tK!)).toBeGreaterThan(base * 1.08);
    expect(e.causes).toContain('airBubble');
  });

  it('manguera doblada y obstruida: la presión sube y el tapón salta (bloqueo de seguridad)', () => {
    const w = h.world10({ seed: 77 });
    h.cmd10(w, { type: 'confirmPpe' });
    h.setupGas(w);
    h.cmd10(w, { type: 'kink', id: 'c_hose_u', fraction: 1 });
    h.weighBicarb(w);
    h.prepareSolution(w);
    h.pipetteAliquot(w);
    h.measureVinegar(w);
    h.cmd10(w, { type: 'addVinegar' });
    h.cmd10(w, { type: 'insertStopper', on: true });
    for (let i = 0; i < 60 && !w.safety.block; i++) {
      h.cmd10(w, { type: 'swirl', id: 'erlenmeyer', intensity: 0.4 });
      h.run10(w, 1);
    }
    expect(w.safety.block?.code).toBe('STOPPER_POPPED');
    expect(w.evidence['err:overpressure']).toBe(1);
    const ev = evaluateP10(w, emptyP10Notebook());
    expect(ev.components.find((c) => c.id === 'safety')!.score).toBe(0);
  });

  it('agitación violenta: espuma y líquido en la manguera', () => {
    const w = h.world10({ seed: 77 });
    h.partA(w, { swirl: 1 });
    expect(w.evidence['err:violentSwirl']).toBeGreaterThan(0);
    expect(w.evidence['err:foamHose'] ?? 0).toBeGreaterThan(0);
  });

  it('modo realista: CO₂ disuelto (Henry) y R más bajo que en el curricular', () => {
    const w = h.world10({ seed: 77, params: { model: 'REALISTIC' } });
    h.partA(w);
    const r = expectedRep(w, 'r1').r!;
    expect(r).toBeLessThan(base * 0.95);
    expect(w.liquids.erlenmeyer.nCo2Aq + w.liquids.waste.nCo2Aq + w.burette.nCo2Aq).toBeGreaterThan(1e-5);
  });

  it('vinagre diluido: el ácido es el limitante y lo dice el diagnóstico', () => {
    const w = h.world10({ seed: 77, params: { vinegar: { percent: 0.5, basis: 'm/v', densityGmL: 1.0, purity: 1, uRel: 0.02 } } });
    h.partA(w);
    expect(w.runs[0].limiting).toBe('CH3COOH');
    expect(expectedRep(w, 'r1').limiting).toBe('CH3COOH');
  });

  it('pipeta sin acondicionar y balón sin homogeneizar: menos NaHCO₃ en la alícuota', () => {
    const ok = h.world10({ seed: 77 });
    h.cmd10(ok, { type: 'confirmPpe' });
    h.weighBicarb(ok);
    h.prepareSolution(ok);
    h.pipetteAliquot(ok);
    const bad = h.world10({ seed: 77 });
    h.cmd10(bad, { type: 'confirmPpe' });
    h.weighBicarb(bad);
    h.prepareSolution(bad, { homogenize: 0 });
    h.pipetteAliquot(bad, { condition: false });
    expect(bad.liquids.erlenmeyer.nBicarb).toBeLessThan(ok.liquids.erlenmeyer.nBicarb * 0.95);
    expect(bad.evidence['err:unconditioned']).toBe(1);
  });

  it('Boyle sin sostener el émbolo ni volumen muerto: errores registrados y exponente alejado de −1', () => {
    const w = h.world10({ seed: 3 });
    h.boyleSetup(w);
    h.boyleCollect(w, [5, 9, 13, 17], { dead: 0 });
    expect(w.evidence['err:noDeadVolume']).toBeGreaterThan(0);
  });

  it('el catálogo tiene ≥ 40 errores simulables y las rutas de error disparan muchos distintos', () => {
    expect(SIMULATED_ERRORS_P10.length).toBeGreaterThanOrEqual(40);
    expect(new Set(SIMULATED_ERRORS_P10.map((e) => e.code)).size).toBe(SIMULATED_ERRORS_P10.length);
    const fired = new Set<string>();
    const collect = (w: P10World) => {
      for (const e of SIMULATED_ERRORS_P10) {
        const k = e.evidence;
        if (k.startsWith('scenario:') ? w.scenarios.includes(k.slice(9)) : (w.evidence[k] ?? 0) > 0) fired.add(e.code);
      }
    };
    const routes: Array<(w: P10World) => void> = [
      (w) => h.partA(w, { sealDelayS: 15, swirl: 1, secure: false }),
      (w) => h.partA(w, { mouthSubmerged: false, condition: false, homogenize: 0 }),
      (w) => {
        h.cmd10(w, { type: 'setDoors', open: true });
        h.cmd10(w, { type: 'tare' });
        h.cmd10(w, { type: 'readBalance' });
        h.cmd10(w, { type: 'touchGlass' });
        h.cmd10(w, { type: 'aspirate', ml: 21 });
        h.cmd10(w, { type: 'readVolume', instrument: 'cylinder', eyeDzCm: 15 });
        h.cmd10(w, { type: 'readBarometer', source: 'WEATHER_SEA_LEVEL' });
        h.setupGas(w);
        h.cmd10(w, { type: 'clampBurette', tiltDeg: 5 });
        h.cmd10(w, { type: 'measureHeight', eyeDzCm: 0 });
        h.boyleSetup(w);
        h.cmd10(w, { type: 'setPlunger', targetMl: 6, held: true });
        h.run10(w, 0.3);
        h.cmd10(w, { type: 'keepPoint', enteredTotalMl: 6 });
        h.run10(w, 8);
        h.cmd10(w, { type: 'keepPoint', enteredTotalMl: 6 });
        h.cmd10(w, { type: 'keepPoint', enteredTotalMl: 7.6 });
        h.cmd10(w, { type: 'setValve', valve: 'VENT' });
      },
      (w) => {
        // Pesada descuidada, aforo y pipeteo con errores, reacción abierta y Boyle con la marca equivocada.
        h.cmd10(w, { type: 'setDoors', open: false });
        h.run10(w, 3);
        h.cmd10(w, { type: 'tare' });
        h.cmd10(w, { type: 'setDoors', open: true });
        h.cmd10(w, { type: 'setPose', id: 'watch_glass', pose: h.pose(70, 42, 7.5), support: 'pan' });
        h.cmd10(w, { type: 'setDoors', open: false });
        h.run10(w, 3);
        h.cmd10(w, { type: 'readBalance' });
        h.cmd10(w, { type: 'scoop', amountG: 0.5 });
        h.cmd10(w, { type: 'tapSpatula', targetId: 'watch_glass', fraction: 1 });
        h.cmd10(w, { type: 'transferSolid', fromId: 'watch_glass', toId: 'beaker150', careful: false });
        h.pourMl(w, 'water_bottle', 'beaker150', 40);
        h.pourMl(w, 'beaker150', 'flask', 40);
        h.pourMl(w, 'water_bottle', 'flask', 70, 130);
        h.cmd10(w, { type: 'invertFlask' });
        h.cmd10(w, { type: 'attachPropipette', on: true });
        h.cmd10(w, { type: 'setPose', id: 'pipette', pose: h.pose(160, 40, 6), support: 'flask' });
        h.cmd10(w, { type: 'aspirate', ml: 21 });
        h.cmd10(w, { type: 'deliverPipette', targetId: 'erlenmeyer', blow: true });
        h.setupGas(w);
        h.measureVinegar(w);
        h.cmd10(w, { type: 'addVinegar' });
        h.cmd10(w, { type: 'insertStopper', on: true });
        h.run10(w, 5);
        h.cmd10(w, { type: 'readVolume', instrument: 'burette', eyeDzCm: 0 });
        h.cmd10(w, { type: 'setStopcock', open: true });
        h.cmd10(w, { type: 'setStopcock', open: false });
        h.cmd10(w, { type: 'insertStopper', on: false });
        h.cmd10(w, { type: 'setPose', id: 'thermometer', pose: h.pose(336, 30, 4), support: 'beaker600' });
        h.cmd10(w, { type: 'readThermometer' });
        h.cmd10(w, { type: 'setPlunger', targetMl: 12, held: true });
        h.run10(w, 1);
        h.cmd10(w, { type: 'connectSyringe', on: true });
        h.cmd10(w, { type: 'startCollection', on: true });
        h.plungerTo(w, 8);
        h.cmd10(w, { type: 'keepPoint', enteredTotalMl: 8 });
        h.plungerTo(w, 8.1);
        h.cmd10(w, { type: 'keepPoint', enteredTotalMl: 9.7 });
        h.plungerTo(w, 10);
        h.cmd10(w, { type: 'setPlunger', targetMl: w.syringe.markMl, held: false });
        h.run10(w, 0.2);
        h.cmd10(w, { type: 'keepPoint', enteredTotalMl: 10.8 });
      },
    ];
    for (const route of routes) {
      const w = h.world10({ seed: 21, scenarios: ['UNLEVEL', 'WET_WATCH_GLASS', 'KINKED_HOSE', 'DAMAGED_SEAL', 'LOOSE_LUER'] });
      route(w);
      collect(w);
    }
    expect(fired.size, [...fired].join(',')).toBeGreaterThanOrEqual(25);
  });
});

describe('Práctica 10 — guardado y determinismo', () => {
  it('el mundo serializado y restaurado sigue igual que el original', () => {
    const a = h.world10({ seed: 5 });
    h.cmd10(a, { type: 'confirmPpe' });
    h.setupGas(a);
    h.weighBicarb(a);
    const b = JSON.parse(JSON.stringify(a)) as P10World;
    h.run10(a, 30);
    h.run10(b, 30);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
});
