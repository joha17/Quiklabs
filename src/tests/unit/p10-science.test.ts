/**
 * Práctica 10 — pruebas científicas, de instrumentos y de las actividades (§35.1–35.6).
 */
import { describe, expect, it } from 'vitest';
import { atomImbalance, REACTION, MOLAR, aliquotMoles, limiting, aceticMoles } from '../../simulation/gas-laws/stoich';
import { CURRICULAR_DENSITY_RATIO, densityRatio, dryCo2PressureAtm, gasPressureAtm, hydroAtm } from '../../simulation/gas-laws/hydrostatic';
import { vaporTableMmHg, antoineWaterMmHg } from '../../simulation/gas-laws/vapor';
import { CelsiusInGasLawError, errorPct, idealVolumeL, mmHgToAtm, rExperimental, R_REF, toKelvin } from '../../simulation/gas-laws/ideal-gas';
import { idealBoyleKPa, inverseFit, powerFitFixed, powerFitFree, pvProducts, residualPattern } from '../../simulation/gas-laws/boyle';
import { activityAnswers } from '../../simulation/gas-laws/activities';
import { SENSOR_PROFILES, newSensor, sensorReading, stepSensor } from '../../simulation/instruments/pressure-sensor';
import { solveBurette } from '../../simulation/gas-world/world';
import * as h from '../helpers10';

const REF = { m: 0.5, flask: 100, aliquot: 20, tC: 25, pAtm: 1, pvMmHg: 23.8, hMm: 40 };

describe('§35.1 estequiometría', () => {
  it('la ecuación con agua conserva C, H, O y Na; sin agua no', () => {
    expect(atomImbalance(REACTION.reactants, REACTION.products)).toEqual({});
    const { H2O: _w, ...noWater } = REACTION.products;
    void _w;
    expect(Object.keys(atomImbalance(REACTION.reactants, noWater)).sort()).toEqual(['H', 'O']);
  });

  it('un mol de NaHCO₃ produce como máximo un mol de CO₂ y el limitante se identifica', () => {
    expect(limiting(2, 1)).toEqual({ limiting: 'NaHCO3', nCO2: 1 });
    expect(limiting(0.3, 1)).toEqual({ limiting: 'CH3COOH', nCO2: 0.3 });
    // 10 mL de vinagre al 5 % m/v: el ácido está en exceso frente a la alícuota.
    expect(aceticMoles({ percent: 5, basis: 'm/v', densityGmL: 1.005, purity: 1, uRel: 0 }, 10)).toBeCloseTo(0.5 / MOLAR.CH3COOH, 9);
    expect(aceticMoles({ percent: 5, basis: 'm/m', densityGmL: 1.005, purity: 1, uRel: 0 }, 10)).toBeCloseTo((0.5 * 1.005) / MOLAR.CH3COOH, 9);
  });

  it('0,5000 g en 100,00 mL y alícuota de 20,00 mL → 0,00119038 mol', () => {
    const a = aliquotMoles(REF.m, REF.flask, REF.aliquot);
    expect(a.nTotal).toBeCloseTo(0.0059519, 7);
    expect(a.nAliquot).toBeCloseTo(0.00119038, 8);
  });

  it('una transferencia incompleta reduce los moles reales en el balón', () => {
    const good = h.world10({ seed: 5 });
    const bad = h.world10({ seed: 5 });
    for (const w of [good, bad]) {
      h.cmd10(w, { type: 'scoop', amountG: 0.5 });
      h.cmd10(w, { type: 'tapSpatula', targetId: 'watch_glass', fraction: 1 });
    }
    h.cmd10(good, { type: 'transferSolid', fromId: 'watch_glass', toId: 'beaker150', careful: true });
    h.cmd10(good, { type: 'rinseInto', sourceId: 'watch_glass', targetId: 'beaker150', ml: 5 });
    h.cmd10(bad, { type: 'transferSolid', fromId: 'watch_glass', toId: 'beaker150', careful: false });
    const total = (w: typeof good) => w.liquids.beaker150.solidBicarbG + w.liquids.beaker150.nBicarb * MOLAR.NaHCO3;
    expect(total(bad)).toBeLessThan(total(good) * 0.96);
  });
});

describe('§35.2 presión y volumen', () => {
  it('h > 0 reduce y h < 0 aumenta la presión del gas', () => {
    expect(gasPressureAtm(1, 40)).toBeLessThan(1);
    expect(gasPressureAtm(1, -40)).toBeGreaterThan(1);
    expect(gasPressureAtm(1, 0)).toBe(1);
    expect(hydroAtm(40, 13.5)).toBeCloseTo(40 / 13.5 / 760, 12);
  });

  it('tabla curricular: 23,8 mmHg a 25 °C, interpolación sin redondear y Antoine cerca', () => {
    expect(vaporTableMmHg(25)).toBe(23.8);
    expect(vaporTableMmHg(24.5)).toBeCloseTo(23.1, 9);
    expect(Math.abs(antoineWaterMmHg(25) - 23.8)).toBeLessThan(0.2);
    expect(mmHgToAtm(760)).toBe(1);
    expect(CURRICULAR_DENSITY_RATIO).toBe(13.5);
    // ρ_Hg/ρ_agua a 25 °C = 13 534/997,05 ≈ 13,57 («cercano a 13,6», §2).
    expect(densityRatio(25)).toBeGreaterThan(13.55);
    expect(densityRatio(25)).toBeLessThan(13.6);
  });

  it('el volumen de gas nunca supera la capacidad de la bureta sin marcar la pérdida', () => {
    const w = h.world10({ seed: 9 });
    h.setupGas(w);
    // Mucho más gas que el que cabe: el exceso burbujea por la boca.
    w.burette.nAir += 0.004;
    h.run10(w, 2);
    const s = solveBurette(w);
    const cap = w.burette.topUngraduatedMl + 50 + w.burette.mouthUngraduatedMl;
    expect(s.gasMl).toBeLessThanOrEqual(cap + 1e-6);
    expect(w.burette.overflowMol).toBeGreaterThan(0);
    expect(w.evidence['err:overflowBurette']).toBeGreaterThan(0);
  });

  it('invertir con la boca fuera del agua deja aire: el menisco queda bajo el aforo', () => {
    const ok = h.world10({ seed: 9 });
    const bad = h.world10({ seed: 9 });
    h.setupGas(ok);
    h.setupGas(bad, { mouthSubmerged: false });
    expect(bad.burette.initialAirMl).toBeGreaterThan(4);
    expect(solveBurette(bad).gasMl).toBeGreaterThan(solveBurette(ok).gasMl + 3);
  });
});

describe('§35.3 caso de referencia de R', () => {
  const n = aliquotMoles(REF.m, REF.flask, REF.aliquot).nAliquot;
  const T = toKelvin(REF.tC);
  const pCo2 = dryCo2PressureAtm(REF.pAtm, REF.hMm, mmHgToAtm(REF.pvMmHg), 13.595);

  it('P_CO₂ = 0,964813 atm, V ≈ 30,185 mL y R ≈ 0,082057', () => {
    expect(pCo2).toBeCloseTo(0.964813, 6);
    const V = idealVolumeL(n, pCo2, T);
    expect(V * 1000).toBeCloseTo(30.185, 2);
    expect(rExperimental(pCo2, V, n, T)).toBeCloseTo(R_REF, 4);
    expect(errorPct(rExperimental(pCo2, V, n, T))).toBeLessThan(0.05);
  });

  it('no restar el vapor eleva la presión calculada; usar °C se rechaza', () => {
    expect(gasPressureAtm(REF.pAtm, REF.hMm, 13.595)).toBeGreaterThan(pCo2);
    expect(() => rExperimental(pCo2, 0.03, n, REF.tC)).toThrow(CelsiusInGasLawError);
  });
});

describe('§35.4 sensor', () => {
  it('GPS-BTA: presión absoluta, 0,8 mL internos, rango 0–210 kPa', () => {
    const p = SENSOR_PROFILES.GPS_BTA;
    expect(p.kind).toBe('ABSOLUTE');
    expect(p.internalVolumeMl).toBe(0.8);
    expect(p.rangeKPa).toEqual([0, 210]);
    expect(SENSOR_PROFILES.GDX_GP.internalVolumeMl).not.toBe(0.8);
  });

  it('fuera de 210 kPa marca sobrecarga; con líquido no mide; la lectura tiene retardo', () => {
    const s = newSensor('GPS_BTA', 0);
    stepSensor(s, 230, 101.325, 0.05, false);
    expect(s.overload).toBe(true);
    const s2 = newSensor('GPS_BTA', 0);
    stepSensor(s2, 150, 101.325, 0.05, false);
    expect(s2.displayedPressureKPa).toBeLessThan(150);
    expect(s2.displayedPressureKPa).toBeGreaterThan(101.325);
    for (let i = 0; i < 40; i++) stepSensor(s2, 150, 101.325, 0.05, false);
    expect(sensorReading(s2)).toBeCloseTo(150, 1);
    s2.liquidIngress = 0.5;
    expect(sensorReading(s2)).toBeNaN();
  });

  it('una conexión con fuga lleva la presión hacia la atmosférica', () => {
    const w = h.world10({ seed: 3, scenarios: ['LOOSE_LUER'] });
    h.boyleSetup(w);
    h.plungerTo(w, 5, { holdS: 2 });
    const p0 = w.syringe.pressureKPa;
    h.run10(w, 120);
    expect(w.syringe.pressureKPa).toBeLessThan(p0 - 10);
    expect(w.syringe.leakedMol).toBeGreaterThan(0);
  });
});

describe('§35.5 Boyle', () => {
  const table: Array<[number, number]> = [[5.8, 188.674], [7.8, 140.296], [9.8, 111.664], [11.8, 92.738], [13.8, 79.298], [15.8, 69.26], [17.8, 61.478], [19.8, 55.268]];
  const ideal = table.map(([v]) => ({ vMl: v, pKPa: idealBoyleKPa(10.8, 101.325, v) }));

  it('la tabla ideal coincide con la de referencia y PV es constante', () => {
    table.forEach(([, p], i) => expect(ideal[i].pKPa).toBeCloseTo(p, 2));
    expect(pvProducts(ideal).cvPct).toBeLessThan(1e-9);
  });

  it('el ajuste libre da n ≈ −1, n = −1 supera a n = +1 y P frente a 1/V es lineal con b ≈ 0', () => {
    expect(powerFitFree(ideal)!.n).toBeCloseTo(-1, 6);
    expect(powerFitFixed(ideal, -1)!.r2).toBeGreaterThan(powerFitFixed(ideal, 1)!.r2);
    const inv = inverseFit(ideal)!;
    expect(inv.r2).toBeCloseTo(1, 9);
    expect(Math.abs(inv.b)).toBeLessThan(1e-6);
  });

  it('omitir los 0,8 mL curva los residuos y aleja el exponente de −1', () => {
    const noDead = ideal.map((q) => ({ vMl: q.vMl - 0.8, pKPa: q.pKPa }));
    expect(powerFitFree(noDead)!.n).toBeGreaterThan(-0.95);
    expect(residualPattern(noDead)).toBe('CURVED');
    expect(residualPattern(ideal)).toBe('RANDOM');
  });

  it('una compresión rápida produce un pico de presión que vuelve a la isoterma al sostener', () => {
    const w = h.world10({ seed: 3, params: { model: 'REALISTIC' } });
    h.boyleSetup(w);
    for (let i = 1; i <= 6; i++) {
      h.cmd10(w, { type: 'setPlunger', targetMl: 10 - i * (5 / 6), held: true });
      h.run10(w, 0.05);
    }
    h.run10(w, 0.3);
    const peak = Math.max(...w.series.sensor.slice(-3).map((s) => s.pTrue), w.syringe.pressureKPa);
    const hot = w.syringe.gasK;
    h.run10(w, 12);
    const iso = (101.325 * (10 + 0.8)) / (w.syringe.markMl + 0.8);
    expect(hot).toBeGreaterThan(w.params.ambientC + 273.15 + 3);
    expect(peak).toBeGreaterThan(iso + 3);
    expect(Math.abs(w.syringe.pressureKPa - iso)).toBeLessThan(1.2);
  });

  it('con buena técnica (modo curricular) los puntos del simulador dan n ≈ −1', () => {
    const w = h.world10({ seed: 3 });
    h.cmd10(w, { type: 'confirmPpe' });
    h.boyleSetup(w);
    const pts = h.boyleCollect(w);
    expect(pts).toHaveLength(8);
    const fit = powerFitFree(pts.map((q) => ({ vMl: q.enteredTotalMl, pKPa: q.displayedKPa })))!;
    expect(fit.n).toBeGreaterThan(-1.01);
    expect(fit.n).toBeLessThan(-0.99);
    expect(pts[0].displayedKPa).toBeCloseTo(188.674, 0);
  });

  it('no se guardan lecturas inestables', () => {
    const w = h.world10({ seed: 3, params: { model: 'REALISTIC' } });
    h.boyleSetup(w);
    h.cmd10(w, { type: 'setPlunger', targetMl: 6, held: true });
    h.run10(w, 0.4);
    const r = h.cmd10(w, { type: 'keepPoint', enteredTotalMl: 6.8 });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('UNSTABLE');
    expect(w.points).toHaveLength(0);
  });
});

describe('§35.6 actividades', () => {
  it('Charles 44,09 L, Boyle 1299,91 mL y gas ideal 0,4317 mol (en kelvin)', () => {
    const a = activityAnswers();
    expect(a.charlesV2L).toBeCloseTo(44.09, 2);
    expect(a.boyleV2Ml).toBeCloseTo(1299.91, 2);
    expect(a.idealNMol).toBeCloseTo(0.4317, 4);
  });
});
