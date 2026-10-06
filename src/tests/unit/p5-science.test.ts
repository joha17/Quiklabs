/**
 * Práctica 5 — §27.1–27.4: balanza granataria, estequiometría, química/térmica y masa constante.
 */
import { describe, expect, it } from 'vitest';
import { MOLAR_MASS, isConstantMass, referenceChains, roundTo, theoretical, uDiff, validateChain, yieldPct } from '../../simulation/stoichiometry/stoich';
import { conversion, elementTotals, expelledG, tubeMassG, tubePressurePa } from '../../simulation/stoich-world/world';
import { REFERENCE_EQUATION, validateP5Equation } from '../../practices/practice-05/equation';
import {
  addSolid, balanceAndRead, burnerUnderSample, calibrate, cmd5, cool, g, gas5, heatGradually, lightBurner, mix, mount, pose, run5, setFlame, weighTube, world5,
} from '../helpers5';

/** Preparación estándar: calibrar, pesar tubo, MnO₂ y KClO₃, mezclar y montar. */
function prepared(opts: { seed?: number; kclo3?: number; mno2?: number; taps?: number } = {}) {
  const w = world5({ seed: opts.seed ?? 11 });
  cmd5(w, { type: 'confirmPpe' });
  cmd5(w, { type: 'inspect', target: 'tube' });
  calibrate(w);
  const m0 = weighTube(w);
  addSolid(w, 'MnO2', opts.mno2 ?? 0.1);
  const m1 = weighTube(w);
  addSolid(w, 'KClO3', opts.kclo3 ?? 1.5);
  const m2 = weighTube(w);
  mix(w, opts.taps ?? 14);
  mount(w);
  return { w, m0, m1, m2 };
}

describe('§27.1 balanza granataria', () => {
  it('1–2. el fiel oscila con amplitud decreciente y vuelve al cero calibrado al descargar', () => {
    const w = world5();
    calibrate(w);
    cmd5(w, { type: 'setPose', id: 'tube', pose: pose(70, 38, 9.5), support: 'pan' });
    const peaks: number[] = [];
    let prev = w.balance.pointer;
    let rising = false;
    for (let i = 0; i < 400; i++) {
      run5(w, 0.05);
      const p = w.balance.pointer;
      if (rising && p < prev) peaks.push(prev);
      rising = p > prev;
      prev = p;
    }
    // Cargado sin pesas: el fiel va al tope; se ajustan pesas y oscila alrededor del cero.
    balanceAndRead(w);
    cmd5(w, { type: 'setRider', beam: 2, valueG: w.balance.riders[2] + 0.3 });
    const amp: number[] = [];
    for (let i = 0; i < 6; i++) {
      let mx = -9;
      let mn = 9;
      for (let k = 0; k < 34; k++) {
        run5(w, 0.05);
        mx = Math.max(mx, w.balance.pointer);
        mn = Math.min(mn, w.balance.pointer);
      }
      amp.push(mx - mn);
    }
    expect(amp[0]).toBeGreaterThan(0.1);
    expect(amp[5]).toBeLessThan(amp[0] * 0.5);
    // Descargar y pesas a cero: vuelve a la marca.
    cmd5(w, { type: 'setPose', id: 'tube', pose: pose(100, 26, 0), support: 'hand' });
    for (const b of [0, 1, 2] as const) cmd5(w, { type: 'setRider', beam: b, valueG: 0 });
    run5(w, 15);
    expect(Math.abs(w.balance.pointer)).toBeLessThan(0.05);
    expect(w.balance.stable).toBe(true);
  });

  it('3. el error de cero sesga las lecturas hasta corregirlo; sin calibrar la lectura no es válida', () => {
    const w = world5({ seed: 3, scenarios: ['ZERO_OFF'] });
    const bias = w.balance.zeroErrorG;
    expect(Math.abs(bias)).toBeGreaterThan(0.3);
    cmd5(w, { type: 'setPose', id: 'tube', pose: pose(70, 38, 9.5), support: 'pan' });
    const m = balanceAndRead(w);
    expect(m.valid).toBe(false);
    expect(m.invalidReason).toBe('NOT_CALIBRATED');
    expect(m.displayedMassG - tubeMassG(w.tube)).toBeCloseTo(bias, 0);
    cmd5(w, { type: 'setPose', id: 'tube', pose: pose(100, 26, 0), support: 'hand' });
    expect(calibrate(w).ok).toBe(true);
    const m2 = weighTube(w);
    expect(m2.valid).toBe(true);
    expect(Math.abs(m2.displayedMassG - tubeMassG(w.tube))).toBeLessThanOrEqual(0.1);
  });

  it('4. una carga caliente da lectura inestable e inválida', () => {
    const { w } = prepared();
    burnerUnderSample(w, 0);
    lightBurner(w, 0.3, 0.35);
    heatGradually(w, 240);
    gas5(w, { type: 'setValve', valve: 'NEEDLE', value: 0 });
    gas5(w, { type: 'setValve', valve: 'TABLE', value: 0 });
    run5(w, 30);
    cmd5(w, { type: 'setPose', id: 'tube', pose: pose(420, 20, 10), support: 'tongs' });
    cmd5(w, { type: 'setPose', id: 'tube', pose: pose(70, 38, 9.5), support: 'pan' });
    expect(w.events.map((e) => e.code)).toContain('HOT_ON_BALANCE');
    const m = balanceAndRead(w);
    expect(m.valid).toBe(false);
    expect(m.invalidReason).toBe('HOT_LOAD');
    // El aire caliente que sube hace que la carga parezca más liviana.
    expect(m.displayedMassG).toBeLessThan(tubeMassG(w.tube) - 0.2);
  });

  it('5–7. lectura redondeada a 0,1 g, incertidumbre propagada y balanza no fijada tras pesar', () => {
    const w = world5();
    calibrate(w);
    const m = weighTube(w);
    expect(Number.isInteger(Math.round(m.displayedMassG * 10))).toBe(true);
    expect(roundTo(17.349, 0.1)).toBe(17.3);
    expect(uDiff(0.05, 0.05)).toBeCloseTo(0.0707, 4);
    // La balanza sigue respondiendo: mover una pesa desplaza el fiel.
    cmd5(w, { type: 'setRider', beam: 2, valueG: 3 });
    run5(w, 2);
    expect(Math.abs(w.balance.pointer)).toBeGreaterThan(0.5);
  });
});

describe('§27.2 estequiometría', () => {
  it('1. la ecuación 2:2:3 conserva K, Cl y O; MnO₂ solo como condición', () => {
    const v = validateP5Equation(REFERENCE_EQUATION);
    expect(v.ok).toBe(true);
    expect(validateP5Equation({ ...REFERENCE_EQUATION, products: [{ coef: 2, formula: 'KCl', state: 's' }, { coef: 2, formula: 'O2', state: 'g' }] }).atomsBalanced).toBe(false);
    expect(validateP5Equation({ ...REFERENCE_EQUATION, reactants: [{ coef: 4, formula: 'KClO3', state: 's' }], products: [{ coef: 4, formula: 'KCl', state: 's' }, { coef: 6, formula: 'O2', state: 'g' }] }).lowestWholeNumberRatio).toBe(false);
    const consumed = validateP5Equation({ ...REFERENCE_EQUATION, reactants: [...REFERENCE_EQUATION.reactants, { coef: 1, formula: 'MnO2', state: 's' }], products: [...REFERENCE_EQUATION.products, { coef: 1, formula: 'MnO2', state: 's' }] });
    expect(consumed.catalystIncorrectlyConsumed).toBe(true);
    expect(consumed.ok).toBe(false);
    expect(validateP5Equation({ ...REFERENCE_EQUATION, catalyst: '' }).catalystPlacedAsCondition).toBe(false);
  });

  it('2–4. valores teóricos de referencia (1,000 g; 7,5 g; 1,6 g al 76 %)', () => {
    const a = theoretical(1);
    expect(a.mKCl).toBeCloseTo(0.608, 3);
    expect(a.mO2).toBeCloseTo(0.392, 3);
    const b = theoretical(7.5);
    expect(b.nKClO3).toBeCloseTo(0.0612, 4);
    expect(b.mKCl).toBeCloseTo(4.56, 2);
    expect(b.nO2).toBeCloseTo(0.0918, 4);
    expect(b.mO2).toBeCloseTo(2.94, 2);
    expect(theoretical(1.6).mKCl * 0.76).toBeCloseTo(0.740, 3);
    expect(yieldPct(0.74, theoretical(1.6).mKCl)).toBeCloseTo(76, 0);
    // Conservación con masas molares (diferencia mínima por redondeo de la tabla).
    expect(Math.abs(a.mKCl + a.mO2 - 1)).toBeLessThan(0.001);
  });

  it('6. análisis dimensional: se validan unidades y factores, no solo el resultado', () => {
    const ref = referenceChains(1.5);
    const ok = validateChain(ref.kcl.start, ref.kcl.factors, ref.kcl.target);
    expect(ok.ok).toBe(true);
    expect(ok.result).toBeCloseTo(theoretical(1.5).mKCl, 4);
    expect(validateChain(ref.o2.start, ref.o2.factors, ref.o2.target).result).toBeCloseTo(theoretical(1.5).mO2, 4);
    // Relación 2:3 en lugar de 2:2 para el KCl: el factor está mal.
    const bad = [...ref.kcl.factors];
    bad[1] = { num: { value: 3, unit: 'mol', species: 'KCl' }, den: { value: 2, unit: 'mol', species: 'KClO3' } };
    expect(validateChain(ref.kcl.start, bad, ref.kcl.target).factorsCorrect).toEqual([true, false, true]);
    // Gramos usados como moles: falta la masa molar.
    const gm = validateChain(ref.kcl.start, ref.kcl.factors.slice(1), ref.kcl.target);
    expect(gm.gramsAsMoles).toBe(true);
    expect(gm.ok).toBe(false);
  });
});

describe('§27.3 química y térmica', () => {
  it('1. sin calor suficiente la conversión es despreciable', () => {
    const { w } = prepared();
    run5(w, 600);
    expect(conversion(w)).toBe(0);
    burnerUnderSample(w, 6); // llama lejos de la muestra
    lightBurner(w, 0.3, 0.35);
    run5(w, 300);
    expect(conversion(w)).toBeLessThan(0.01);
  });

  it('2–3. el MnO₂ bien mezclado acelera; más catalizador no cambia el KCl teórico', () => {
    const run = (taps: number, mno2: number) => {
      const { w } = prepared({ taps, mno2, seed: 21 });
      burnerUnderSample(w, 0);
      lightBurner(w, 0.3, 0.35);
      run5(w, 150);
      return { conv: conversion(w), w };
    };
    const mixed = run(14, 0.1);
    const layered = run(0, 0.1);
    expect(mixed.conv).toBeGreaterThan(layered.conv * 1.5);
    const more = run(14, 0.25);
    // KCl final posible = KClO₃ inicial (1:1), independiente del MnO₂.
    for (const r of [mixed, more]) {
      const c = r.w.tube.contents;
      expect(c.KCl + c.KClO3 + r.w.tube.lostMol.KCl + r.w.tube.lostMol.KClO3).toBeCloseTo(c.KCl + c.KClO3 + r.w.tube.lostMol.KCl + r.w.tube.lostMol.KClO3, 12);
    }
    expect(theoretical(1.5).mKCl).toBe(theoretical(1.5).mKCl);
  });

  it('4–5. O₂ liberado = 3/2 del KClO₃ convertido; se conservan K, Cl, O y Mn; el MnO₂ no se consume', () => {
    const { w } = prepared();
    const mn0 = w.tube.contents.MnO2;
    burnerUnderSample(w, 0);
    lightBurner(w, 0.3, 0.35);
    heatGradually(w, 600);
    const c = w.tube.contents;
    const converted = c.KCl + w.tube.lostMol.KCl;
    expect(w.tube.o2ReleasedMol).toBeCloseTo(1.5 * converted, 10);
    expect(c.MnO2 + w.tube.lostMol.MnO2).toBeCloseTo(mn0, 12);
    const now = elementTotals(w);
    for (const el of ['K', 'Cl', 'O', 'Mn']) expect(Math.abs(now[el] - w.initialElements[el])).toBeLessThan(1e-5 / 16); // < 1 mg equivalente
  });

  it('6. el calentamiento brusco expulsa sólido; el gradual no', () => {
    const gentle = prepared({ seed: 31 }).w;
    burnerUnderSample(gentle, 0);
    lightBurner(gentle, 0.3, 0.35);
    heatGradually(gentle, 600);
    const rough = prepared({ seed: 31 }).w;
    burnerUnderSample(rough, 0);
    lightBurner(rough, 0.9, 0.7);
    for (let i = 0; i < 30; i++) {
      cmd5(rough, { type: 'stopwatch', action: 'START' });
      run5(rough, 10);
    }
    expect(expelledG(gentle)).toBeLessThan(0.01);
    expect(expelledG(rough)).toBeGreaterThan(0.08);
    expect(rough.events.map((e) => e.code)).toEqual(expect.arrayContaining(['HEATING_TOO_FAST', 'SOLID_EXPELLED']));
  });

  it('7–8. el tubo abierto queda a presión ambiente; tapado no se puede calentar', () => {
    const { w } = prepared();
    burnerUnderSample(w, 0);
    lightBurner(w, 0.3, 0.35);
    heatGradually(w, 300);
    expect(tubePressurePa(w) / 101_325).toBeLessThan(1.05);
    const s = prepared().w;
    cmd5(s, { type: 'stopper', on: true });
    burnerUnderSample(s, 0);
    lightBurner(s, 0.3, 0.35);
    expect(s.events.map((e) => e.code)).toContain('TUBE_STOPPERED');
    expect(s.safety.block?.code).toBe('TUBE_STOPPERED');
    run5(s, 60);
    expect(conversion(s)).toBe(0);
  });
});

describe('§27.4 masa constante', () => {
  it('1–3. dos lecturas frías dentro del criterio aceptan masa constante; las calientes no cuentan', () => {
    const { w, m1, m2 } = prepared();
    burnerUnderSample(w, 0);
    lightBurner(w, 0.3, 0.35);
    heatGradually(w, 600);
    cool(w);
    const a = weighTube(w);
    mount(w);
    burnerUnderSample(w, 0);
    lightBurner(w, 0.3, 0.35);
    heatGradually(w, 300, { gentleS: 60 });
    cool(w);
    const b = weighTube(w);
    expect(a.valid && b.valid).toBe(true);
    expect(isConstantMass(a, b, 0.1, w.params.ambientC, w.params.allowedDeltaC)).toBe(true);
    expect(w.events.map((e) => e.code)).toContain('CONSTANT_MASS');
    // Rendimiento con las masas medidas.
    const mK = m2.displayedMassG - m1.displayedMassG;
    const y = yieldPct(b.displayedMassG - m1.displayedMassG, theoretical(mK).mKCl);
    expect(y).toBeGreaterThan(90);
    expect(y).toBeLessThan(110);
    const hot = { ...b, loadTemperatureC: 90 };
    expect(isConstantMass(a, hot, 0.1, w.params.ambientC, w.params.allowedDeltaC)).toBe(false);
  });

  it('4–5. mezcla deficiente y poco tiempo: queda KClO₃, la masa sigue bajando y el rendimiento aparente supera 100 %', () => {
    const { w, m1, m2 } = prepared({ taps: 0, seed: 41 });
    burnerUnderSample(w, 0);
    lightBurner(w, 0.3, 0.35);
    heatGradually(w, 150, { gentleS: 150 });
    cool(w);
    const a = weighTube(w);
    expect(w.tube.contents.KClO3 * MOLAR_MASS.KClO3).toBeGreaterThan(0.1);
    const mK = m2.displayedMassG - m1.displayedMassG;
    const apparent = yieldPct(a.displayedMassG - m1.displayedMassG, theoretical(mK).mKCl);
    expect(apparent).toBeGreaterThan(100);
    // Otro ciclo: la masa baja más que el criterio (no hay masa constante todavía).
    mount(w);
    burnerUnderSample(w, 0);
    lightBurner(w, 0.3, 0.35);
    heatGradually(w, 600);
    cool(w);
    const b = weighTube(w);
    expect(a.displayedMassG - b.displayedMassG).toBeGreaterThan(0.1);
    expect(w.events.map((e) => e.code)).not.toContain('CONSTANT_MASS');
    // Sin mezclar, el catalizador casi no actúa: aún queda KClO₃ y hará falta otro ciclo.
    expect(g(w.tube.contents.KClO3, 'KClO3')).toBeGreaterThan(0.05);
    expect(w.events.map((e) => e.code)).toContain('POORLY_MIXED');
  });

  it('6. la pérdida mecánica se registra aparte del O₂', () => {
    const { w } = prepared({ seed: 51 });
    burnerUnderSample(w, 0);
    lightBurner(w, 0.9, 0.7);
    for (let i = 0; i < 40; i++) {
      cmd5(w, { type: 'stopwatch', action: 'START' });
      run5(w, 10);
    }
    expect(expelledG(w)).toBeGreaterThan(0.05);
    expect(w.tube.cycles[0].solidLossG).toBeCloseTo(expelledG(w), 6);
    expect(w.tube.o2ReleasedMol * MOLAR_MASS.O2).toBeLessThan(theoretical(1.5).mO2 + 0.01);
    void setFlame;
  });
});
