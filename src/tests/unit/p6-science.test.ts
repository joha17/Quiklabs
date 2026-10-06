/**
 * Práctica 6 — pruebas científicas e instrumentales (§30.1–30.5).
 */
import { describe, expect, it } from 'vitest';
import {
  CAL_J, boilingPointC, convertEnergyPerMass, detectPeak, equilibriumCorrected, equilibriumIdeal, fToC, heatToWarm, identify, initialMetalTemp,
  monteCarloSpecificHeat, specificHeatIdeal, uSpecificHeat,
} from '../../simulation/calorimetry/heat';
import { FOODS, METALS } from '../../simulation/calorimetry/materials';
import { calorimeterEnergyJ, cupWaterC, displayedValue, metalGAt, totalMetalG, totalWaterG } from '../../simulation/calorimetry-world/world';
import { bombCorrectedDT } from '../../simulation/calorimetry-world/bomb';
import {
  addMetal, assembleCup, balanceAndRead, bomb6, boil, calibrate, cmd6, fillBath, fillCylinder, fullRun, pose, pourCylinderToCup, run6, step6, transferAndPeak,
  tubeToBath, weigh, world6,
} from '../helpers6';

describe('§30.3 valores numéricos', () => {
  it('hierro ideal, con calorímetro y cobre', () => {
    expect(equilibriumIdeal(50, 22, 25, 0.449, 96)).toBeCloseTo(25.772, 3);
    expect(equilibriumCorrected(50, 22, 25, 0.449, 96, 15)).toBeCloseTo(25.531, 3);
    expect(equilibriumIdeal(50, 22, 25, 0.385, 96)).toBeCloseTo(25.258, 3);
  });
  it('actividades: 94 g de hierro a 392 °F y temperatura inicial del cobre', () => {
    expect(fToC(392)).toBeCloseTo(200, 9);
    expect(heatToWarm(94, 0.449, 25, fToC(392)) / 1000).toBeCloseTo(7.39, 2);
    expect(initialMetalTemp(150, 23, 34, 25, 0.385)).toBeCloseTo(750.57, 2);
  });
  it('conversión cal–J con 4,184 exacto y unidades por masa', () => {
    expect(CAL_J).toBe(4.184);
    expect(convertEnergyPerMass(1, 'kcal/g', 'kJ/g')).toBeCloseTo(4.184, 12);
    expect(convertEnergyPerMass(26400, 'J/g', 'kcal/g')).toBeCloseTo(6.31, 2);
  });
  it('ebullición según la presión (100 °C a 101,325 kPa; ≈ 91,8 °C a 75 kPa)', () => {
    expect(boilingPointC(101.325)).toBeCloseTo(100, 1);
    expect(boilingPointC(75)).toBeGreaterThan(91);
    expect(boilingPointC(75)).toBeLessThan(93);
  });
});

describe('§30.2 termodinámica', () => {
  it('Tf entre las temperaturas iniciales; más agua → menor aumento; C_cal > 0 → menor aumento', () => {
    const tf = equilibriumIdeal(50, 22, 25, 0.449, 96);
    expect(tf).toBeGreaterThan(22);
    expect(tf).toBeLessThan(96);
    expect(equilibriumIdeal(100, 22, 25, 0.449, 96) - 22).toBeLessThan(tf - 22);
    expect(equilibriumIdeal(50, 22, 50, 0.449, 96)).toBeGreaterThan(tf);
    expect(equilibriumCorrected(50, 22, 25, 0.449, 96, 15)).toBeLessThan(tf);
  });

  it('el baño calienta el metal de forma progresiva, no instantánea', () => {
    const w = world6({ seed: 1 });
    fillBath(w);
    addMetal(w, 'tube_fe', 'jar_fe');
    tubeToBath(w, 'tube_fe');
    cmd6(w, { type: 'setPlate', knob: 0.6 });
    run6(w, 120);
    const t2 = w.tubes.tube_fe.metalC;
    expect(t2).toBeGreaterThan(w.params.ambientC + 1);
    expect(t2).toBeLessThan(w.vessels.beaker.waterC);
    boil(w, 600);
    expect(w.vessels.beaker.waterC).toBeCloseTo(100, 0);
    expect(w.tubes.tube_fe.metalC).toBeGreaterThan(98.5);
    expect(w.tubes.tube_fe.metalC).toBeLessThan(100);
  });

  it('transferencia lenta reduce el máximo; la agitación mejora la uniformidad', () => {
    const peaks: number[] = [];
    const spread: number[] = [];
    for (const [tr, stir] of [[5, 0.6], [60, 0.6], [5, 0]] as const) {
      const w = world6({ seed: 2 });
      calibrate(w);
      const r = fullRun(w, 'tube_fe', 'jar_fe', { transferS: tr, stir });
      peaks.push(r.run.metalCAtEntry);
      run6(w, 1);
      spread.push(Math.abs(w.cal.bottomC - w.cal.topC));
    }
    expect(peaks[1]).toBeLessThan(peaks[0] - 0.3);
    expect(spread[2]).toBeGreaterThan(spread[0]);
  });
});

describe('§30.1 conservación', () => {
  it('modo aislado: la energía del calorímetro se conserva tras recibir el metal', () => {
    const w = world6({ seed: 3, params: { model: 'IDEAL' } });
    calibrate(w);
    fullRun(w, 'tube_fe', 'jar_fe');
    const e0 = calorimeterEnergyJ(w);
    run6(w, 120);
    expect(Math.abs(calorimeterEnergyJ(w) - e0) / e0).toBeLessThan(1e-6);
  });

  it('modo realista: lo que pierde el sistema es lo que recibe el entorno', () => {
    const w = world6({ seed: 4 });
    calibrate(w);
    fullRun(w, 'tube_fe', 'jar_fe');
    const e0 = calorimeterEnergyJ(w);
    const l0 = w.cal.lossToAmbientJ;
    run6(w, 300);
    const lost = e0 - calorimeterEnergyJ(w);
    expect(lost).toBeGreaterThan(0);
    expect(Math.abs(lost - (w.cal.lossToAmbientJ - l0)) / lost).toBeLessThan(0.02);
  });

  it('el agua y el metal conservan su masa entre recipientes, derrames y evaporación', () => {
    const w = world6({ seed: 5 });
    const W0 = totalWaterG(w);
    const M0 = totalMetalG(w);
    fillCylinder(w, 50);
    pourCylinderToCup(w);
    fillBath(w);
    addMetal(w, 'tube_fe', 'jar_fe');
    tubeToBath(w, 'tube_fe');
    boil(w, 120);
    cmd6(w, { type: 'setPour', sourceId: 'water_bottle', targetId: null, tiltDeg: 80 });
    run6(w, 1);
    cmd6(w, { type: 'stopPour', sourceId: 'water_bottle' });
    expect(Math.abs(totalWaterG(w) - W0)).toBeLessThan(1e-6);
    expect(totalMetalG(w)).toBeCloseTo(M0, 9);
    expect(metalGAt(w, 'tube:tube_fe')).toBeGreaterThan(23);
  });
});

describe('§30.4 instrumentos', () => {
  it('la balanza oscila, se amortigua y vuelve a cero al retirar la carga', () => {
    const w = world6({ seed: 6 });
    calibrate(w);
    cmd6(w, { type: 'setPose', id: 'cylinder', pose: pose(80, 40, 9.5), support: 'pan' });
    step6(w);
    run6(w, 0.6);
    expect(Math.abs(w.balance.pointer)).toBeGreaterThan(0.5);
    cmd6(w, { type: 'setPose', id: 'cylinder', pose: pose(130, 24), support: 'bench' });
    run6(w, 0.4);
    const swing = Math.abs(w.balance.pointerVel);
    expect(swing).toBeGreaterThan(0.05);
    run6(w, 15);
    expect(Math.abs(w.balance.pointer)).toBeLessThan(0.06);
    expect(cmd6(w, { type: 'readBalance' }).ok).toBe(true);
  });

  it('el menisco cambia con el paralaje; una pesada caliente no es válida', () => {
    const w = world6({ seed: 7 });
    fillCylinder(w, 50);
    const a = cmd6(w, { type: 'readCylinder', eyeDzCm: 0 }).value!;
    const up = cmd6(w, { type: 'readCylinder', eyeDzCm: 8 });
    const down = cmd6(w, { type: 'readCylinder', eyeDzCm: -8 }).value!;
    expect(up.ok).toBe(false);
    expect(up.value!).toBeGreaterThan(a + 0.5);
    expect(down).toBeLessThan(a - 0.5);
    calibrate(w);
    fillBath(w);
    addMetal(w, 'tube_fe', 'jar_fe');
    tubeToBath(w, 'tube_fe');
    boil(w, 200);
    cmd6(w, { type: 'setPose', id: 'tube_fe', pose: pose(300, 30, 20), support: 'tongs' });
    cmd6(w, { type: 'setPose', id: 'tube_fe', pose: pose(80, 40, 9.5), support: 'pan' });
    const m = balanceAndRead(w);
    expect(m.valid).toBe(false);
    expect(m.invalidReason).toBe('HOT_LOAD');
  });

  it('el termómetro responde con retardo y sesga si toca el fondo junto al metal', () => {
    const w = world6({ seed: 8 });
    calibrate(w);
    const r = fullRun(w, 'tube_fe', 'jar_fe');
    expect(r.peak).toBeGreaterThan(r.tiw + 2);
    // Retardo: al cambiar a un baño caliente, la lectura sube poco a poco.
    cmd6(w, { type: 'setPose', id: 'therm_bath', pose: pose(0, 0, 0), support: 'bench' });
    run6(w, 120);
    cmd6(w, { type: 'setPlate', knob: 0.5 });
    cmd6(w, { type: 'setPose', id: 'therm_bath', pose: pose(305, 41, 10), support: 'bath' });
    step6(w);
    step6(w);
    expect(displayedValue(w, 'therm_bath')).toBeLessThan(w.vessels.beaker.waterC - 20);
    run6(w, 30);
    expect(displayedValue(w, 'therm_bath')).toBeGreaterThan(w.vessels.beaker.waterC - 2);
    // Termómetro del calorímetro hasta el fondo: lee la mezcla con el metal.
    const w2 = world6({ seed: 8 });
    calibrate(w2);
    const cylE = weigh(w2, 'cylinder');
    void cylE;
    fillCylinder(w2, 50);
    pourCylinderToCup(w2);
    assembleCup(w2);
    cmd6(w2, { type: 'setThermoDepth', id: 'therm_cal', depth: 1 });
    fillBath(w2);
    addMetal(w2, 'tube_fe', 'jar_fe');
    tubeToBath(w2, 'tube_fe');
    boil(w2, 300);
    transferAndPeak(w2, 'tube_fe', { stir: 0 });
    expect(w2.thermos.therm_cal.sensorC).toBeGreaterThan(cupWaterC(w2));
  });

  it('el máximo no se acepta antes del aumento ni mientras sigue subiendo', () => {
    expect(detectPeak([{ t: 0, c: 22 }, { t: 1, c: 22.05 }]).reason).toBe('TOO_FEW');
    expect(detectPeak(Array.from({ length: 10 }, (_, i) => ({ t: i, c: 22 + i * 0.01 }))).reason).toBe('NO_RISE');
    expect(detectPeak(Array.from({ length: 20 }, (_, i) => ({ t: i, c: 22 + i * 0.2 }))).reason).toBe('STILL_RISING');
    const ok = detectPeak(Array.from({ length: 40 }, (_, i) => ({ t: i, c: i < 20 ? 22 + i * 0.2 : 26 - (i - 20) * 0.01 })));
    expect(ok.valid).toBe(true);
    expect(ok.peakC).toBeCloseTo(26, 6);
    const w = world6({ seed: 9 });
    calibrate(w);
    fillCylinder(w, 50);
    pourCylinderToCup(w);
    assembleCup(w);
    fillBath(w);
    addMetal(w, 'tube_fe', 'jar_fe');
    tubeToBath(w, 'tube_fe');
    boil(w, 300);
    cmd6(w, { type: 'setPose', id: 'tube_fe', pose: pose(300, 30, 20), support: 'tongs' });
    cmd6(w, { type: 'setLid', closed: false });
    cmd6(w, { type: 'pourMetal', tubeId: 'tube_fe', targetId: 'cup', dropHeightCm: 4, offsetCm: 0 });
    cmd6(w, { type: 'setLid', closed: true });
    run6(w, 3);
    cmd6(w, { type: 'readThermometer', id: 'therm_cal', peak: true });
    expect(w.runs[0].recorded?.judgement).toBe('EARLY');
  });
});

describe('§30.2–17 incertidumbre e identificación', () => {
  it('propagación y Monte Carlo coinciden; Cu y Zn no se distinguen con esta incertidumbre', () => {
    const x = { mw: 50, uMw: 0.07, mm: 25, uMm: 0.07, TiW: 22, TiM: 99, Tf: 25.3, uT: 0.1 };
    const pr = uSpecificHeat(x);
    const mc = monteCarloSpecificHeat(x, 4000, 7);
    expect(mc.mean).toBeCloseTo(pr.c, 2);
    expect(mc.sd / pr.u).toBeGreaterThan(0.7);
    expect(mc.sd / pr.u).toBeLessThan(1.4);
    const cands = (['Cu', 'Zn', 'brass', 'Al', 'Pb'] as const).map((id) => ({ id, cp: METALS[id].cp, uCp: METALS[id].uCp }));
    const res = identify(0.386, 0.015, cands);
    expect(res.ambiguous).toBe(true);
    expect(res.unique).toBeNull();
    expect(identify(0.89, 0.02, cands).unique).toBe('Al');
    expect(specificHeatIdeal(50, 22, 25.772, 25, 96)).toBeCloseTo(0.449, 3);
  });
});

describe('§30.5 bomba calorimétrica', () => {
  function readyBomb(seed = 10, opts: { contact?: 'OK' | 'NO_TOUCH' | 'CRUCIBLE'; bucket?: number; scen?: 'DAMAGED_SEAL'[] } = {}) {
    const w = world6({ seed, scenarios: opts.scen });
    cmd6(w, { type: 'confirmPpe' });
    bomb6(w, { type: 'selectProfile', profile: 'GENERIC_A' });
    for (const part of ['vessel', 'seal', 'electrodes', 'valve'] as const) bomb6(w, { type: 'inspect', part });
    bomb6(w, { type: 'loadCalibration' });
    bomb6(w, { type: 'selectFood', food: 'peanut' });
    bomb6(w, { type: 'weighSample', amount: 'target' });
    bomb6(w, { type: 'placeSample' });
    bomb6(w, { type: 'connectWire', lengthCm: 10, contact: opts.contact ?? 'OK' });
    bomb6(w, { type: 'seal' });
    bomb6(w, { type: 'leakTest' });
    for (let i = 0; i < 6; i++) bomb6(w, { type: 'pressurize', deltaAtm: 5 });
    bomb6(w, { type: 'fillBucket', waterG: opts.bucket ?? 2000 });
    bomb6(w, { type: 'submerge' });
    bomb6(w, { type: 'closeLid' });
    run6(w, 130);
    return w;
  }

  it('sin perfil no se prepara; con sello dañado falla la hermeticidad y no presuriza', () => {
    const w = world6({ seed: 11 });
    expect(bomb6(w, { type: 'inspect', part: 'seal' }).code).toBe('NO_PROFILE');
    const d = readyBomb(12, { scen: ['DAMAGED_SEAL'] });
    expect(d.bomb.leakTestPassed).toBe(false);
    expect(d.bomb.pressureAtm).toBe(0);
    expect(bomb6(d, { type: 'arm' }).ok).toBe(false);
  });

  it('no enciende sin estar sumergida y cerrada; con todo listo, ΔT = q/C', () => {
    const w = world6({ seed: 13 });
    bomb6(w, { type: 'selectProfile', profile: 'GENERIC_A' });
    expect(bomb6(w, { type: 'ignite' }).ok).toBe(false);
    const r = readyBomb(14);
    expect(bomb6(r, { type: 'arm' }).ok).toBe(true);
    expect(bomb6(r, { type: 'ignite' }).ok).toBe(true);
    const ti = Math.round(r.timeS);
    run6(r, 520);
    const b = r.bomb;
    const dt = bombCorrectedDT(b.series, ti)!;
    const q = b.qSampleJ + b.qWireJ + b.qAuxJ;
    expect(dt.dT).toBeCloseTo(q / b.effectiveJPerC, 1);
    // Calor de combustión con la constante, restando alambre y auxiliares.
    const hc = (b.energyEquivalent! * dt.dT - b.qWireJ - b.qAuxJ) / b.sampleReadingG!;
    expect(Math.abs(hc - FOODS.peanut.grossEnergyJPerG) / FOODS.peanut.grossEnergyJPerG).toBeLessThan(0.03);
    // Omitir el alambre sobreestima.
    expect((b.energyEquivalent! * dt.dT) / b.sampleReadingG!).toBeGreaterThan(hc);
    // No se abre presurizada.
    expect(bomb6(r, { type: 'open' }).code).toBe('OPEN_PRESSURIZED');
    expect(r.safety.block?.code).toBe('OPEN_PRESSURIZED');
    bomb6(r, { type: 'depressurize' });
    cmd6(r, { type: 'acknowledge' });
    expect(bomb6(r, { type: 'open' }).ok).toBe(true);
  });

  it('el alambre sin contacto no enciende la muestra; combustión incompleta deja residuo', () => {
    const r = readyBomb(15, { contact: 'NO_TOUCH' });
    bomb6(r, { type: 'arm' });
    bomb6(r, { type: 'ignite' });
    expect(r.bomb.qSampleJ).toBe(0);
    expect(r.bomb.residue).toBe('UNBURNED');
    const s = readyBomb(16, { contact: 'CRUCIBLE' });
    bomb6(s, { type: 'arm' });
    bomb6(s, { type: 'ignite' });
    expect(s.events.map((e) => e.code)).toContain('BOMB_SHORT_CIRCUIT');
    const c = readyBomb(17);
    c.bomb.food = 'cereal';
    bomb6(c, { type: 'arm' });
    bomb6(c, { type: 'ignite' });
    expect(c.bomb.completeness).toBeLessThan(1);
  });
});
