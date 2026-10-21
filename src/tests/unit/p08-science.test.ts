/**
 * Práctica 8 — batería científica (§17.3, ítems 1–12): balances por matrices enteras, máximos teóricos de los tres
 * casos de §8.1, limitante, equilibrio de Fischer, catalizador solo cinético, hidrólisis del anhídrido, conservación
 * en las separaciones, lecturas con sesgo y rendimiento aparente > 100 % sin recortar.
 */
import { describe, expect, it } from 'vitest';
import { ELEMENTS, SPECIES, elementTotals, fromGrams, massG, molAddInto, type Mol } from '../../simulation/organic-chemistry/species';
import { MAIN_REACTION, SIDE_REACTIONS, applyExtent, elementBalance, limiting, theoreticalMassG, yields } from '../../simulation/organic-chemistry/stoichiometry';
import { KINETICS, acetylationRate, catalystFactor, fischerEquilibriumConversion, fischerRate } from '../../simulation/organic-chemistry/kinetics';
import { fractionate, splitPhases } from '../../simulation/organic-chemistry/separation';
import { S8, conservedTotals08, dispatchP08, runP08For, worldElements } from '../../simulation/organic-world/world';
import { cmd08, place, ppe08, run08, weigh, world08 } from '../helpers08';
import { mixture } from '../../practices/practice-08/definition';

const close = (a: Mol, b: Mol, tol = 1e-12) => {
  const ea = elementTotals(a);
  const eb = elementTotals(b);
  for (const e of ELEMENTS) expect(Math.abs(ea[e] - eb[e]), e).toBeLessThan(tol);
};

describe('estequiometría (§3.1, §8.1)', () => {
  it('1. las tres reacciones y las laterales balancean C/H/O (y Na, P, S) exactamente', () => {
    for (const r of [...Object.values(MAIN_REACTION), ...Object.values(SIDE_REACTIONS)]) {
      for (const e of ELEMENTS) expect(elementBalance(r)[e], `${r.id}:${e}`).toBeCloseTo(0, 12);
      for (const nu of Object.values(r.nu)) expect(Number.isInteger(nu)).toBe(true);
    }
  });

  it('2–4. máximos teóricos de §8.1 con 1,00000 g del precursor puro y el otro reactivo en exceso', () => {
    const excess = (s: 'AA' | 'AcOH' | 'MeOH') => fromGrams(s, 50);
    expect(Math.abs(theoreticalMassG('ASA', { ...fromGrams('SA', 1), ...excess('AA') }) - 1.304373)).toBeLessThan(2e-5);
    expect(Math.abs(theoreticalMassG('ISO', { ...fromGrams('IAA', 1), ...excess('AcOH') }) - 1.476801)).toBeLessThan(2e-5);
    expect(Math.abs(theoreticalMassG('MS', { ...fromGrams('SA', 1), ...excess('MeOH') }) - 1.101578)).toBeLessThan(2e-5);
    // Coproductos del caso ASA (§8.1).
    const n = 1 / SPECIES.SA.molarMass;
    expect(n * SPECIES.AcOH.molarMass).toBeCloseTo(0.434767, 5);
    expect(n * SPECIES.AA.molarMass).toBeCloseTo(0.73914, 4);
  });

  it('5. cambiar la proporción cambia el limitante sin tocar la cinética', () => {
    expect(limiting(MAIN_REACTION.ISO, { IAA: 0.05, AcOH: 0.12 }).limiting).toBe('IAA');
    expect(limiting(MAIN_REACTION.ISO, { IAA: 0.05, AcOH: 0.03 }).limiting).toBe('AcOH');
    expect(limiting(MAIN_REACTION.ASA, { SA: 0.0145, AA: 0.013 }).limiting).toBe('AA');
  });
});

describe('cinética y equilibrio (§6.2, §6.3)', () => {
  /** Integra la Fischer de la ruta en un volumen fijo hasta el tiempo dado. */
  function integrate(route: 'ISO' | 'MS', m: Mol, tK: number, seconds: number, cat: number) {
    const acid = route === 'ISO' ? 'AcOH' : 'SA';
    const alcohol = route === 'ISO' ? 'IAA' : 'MeOH';
    const ester = route === 'ISO' ? 'IAAc' : 'MeSal';
    const vL = 0.012;
    for (let t = 0; t < seconds; t += 0.5) {
      const c = (s: keyof Mol) => (m[s] ?? 0) / vL;
      applyExtent(m, MAIN_REACTION[route], fischerRate(route, tK, c(acid), c(alcohol), c(ester), c('H2O'), cat) * vL * 0.5);
    }
    return m;
  }

  it('6. Fischer nunca deja moles negativos ni supera el equilibrio; más agua inicial baja el avance', () => {
    const dry = integrate('ISO', { IAA: 0.046, AcOH: 0.12 }, 368, 40000, 1);
    for (const n of Object.values(dry)) expect(n!).toBeGreaterThanOrEqual(0);
    const xEq = fischerEquilibriumConversion(KINETICS.ISO.keq, 0.12, 0.046);
    expect((dry.IAAc ?? 0) / 0.046).toBeLessThanOrEqual(xEq + 1e-6);
    expect((dry.IAAc ?? 0) / 0.046).toBeGreaterThan(xEq - 0.01);
    const wet = integrate('ISO', { IAA: 0.046, AcOH: 0.12, H2O: 0.1 }, 368, 40000, 1);
    expect((wet.IAAc ?? 0)).toBeLessThan((dry.IAAc ?? 0) - 0.003);
    expect(fischerEquilibriumConversion(3, 0.0145, 0.25, 0, 0.1)).toBeLessThan(fischerEquilibriumConversion(3, 0.0145, 0.25));
  });

  it('7. el catalizador cambia la velocidad, NO el equilibrio ni la masa teórica', () => {
    const fast = integrate('MS', { SA: 0.0145, MeOH: 0.25 }, 338, 300, 1);
    const slow = integrate('MS', { SA: 0.0145, MeOH: 0.25 }, 338, 300, catalystFactor(0, 0.0145, KINETICS.MS.uncatalyzedFactor));
    expect(fast.MeSal!).toBeGreaterThan(5 * (slow.MeSal ?? 0));
    const eqFast = integrate('MS', { SA: 0.0145, MeOH: 0.25 }, 338, 60000, 1);
    const eqSlow = integrate('MS', { SA: 0.0145, MeOH: 0.25 }, 338, 60000 / KINETICS.MS.uncatalyzedFactor, KINETICS.MS.uncatalyzedFactor);
    expect(Math.abs((eqFast.MeSal ?? 0) - (eqSlow.MeSal ?? 0))).toBeLessThan(2e-5);
    expect(theoreticalMassG('MS', { SA: 0.0145, MeOH: 0.25, H2SO4: 0.005 })).toBeCloseTo(theoreticalMassG('MS', { SA: 0.0145, MeOH: 0.25 }), 12);
    expect(acetylationRate(353, 2, 8, 1)).toBeGreaterThan(acetylationRate(353, 2, 8, catalystFactor(0, 1, KINETICS.ASA.uncatalyzedFactor)));
  });

  it('8. la hidrólisis del anhídrido reduce el ASA que se puede formar (balón húmedo, SC04)', () => {
    const run = (scenarios: Array<(typeof S8)[keyof typeof S8]>) => {
      const w = world08({ route: 'ASA', seed: 5, scenarios });
      ppe08(w);
      w.vessels.rf.solid.SA = 0.0145;
      w.vessels.jarSA.solid.SA! -= 0.0145;
      w.vessels.rf.liq.AA = 0.0155;
      w.vessels.btAA.liq.AA! -= 0.0155;
      w.vessels.rf.liq.H3PO4 = 0.0004;
      w.vessels.btH3PO4.liq.H3PO4! -= 0.0004;
      place(w, 'rf', 'bath01', 13);
      cmd08(w, { type: 'setMagneticStir', level01: 0.5 });
      cmd08(w, { type: 'setPlate', on: true, setpointC: 80 });
      run08(w, 900);
      return w;
    };
    const dry = run([]);
    const wet = run([S8.WET_VESSEL]);
    expect(wet.vessels.rf.liq.ASA! + (wet.vessels.rf.solid.ASA ?? 0)).toBeLessThan(dry.vessels.rf.liq.ASA! + (dry.vessels.rf.solid.ASA ?? 0) - 1e-4);
    expect(wet.vessels.rf.liq.AcOH!).toBeGreaterThan(dry.vessels.rf.liq.AcOH!);
  });
});

describe('separación y conservación (§6.4, §6.5)', () => {
  it('9. reparto, fraccionamiento y filtración conservan todas las especies', () => {
    const liq: Mol = { IAAc: 0.03, IAA: 0.01, AcOH: 0.02, H2O: 0.6, H2SO4: 0.002 };
    const s = splitPhases(liq);
    expect(s.twoPhases).toBe(true);
    close(molAddInto({ ...s.aq }, s.org), liq);
    expect(s.org.IAAc! / liq.IAAc!).toBeGreaterThan(0.95);
    expect(s.aq.H2SO4).toBe(liq.H2SO4);
    // La mezcla de reacción con mucho ácido acético es una sola fase.
    expect(splitPhases({ IAA: 0.01, IAAc: 0.035, AcOH: 0.08, H2O: 0.04 }).twoPhases).toBe(false);
    const f = fractionate({ IAAc: 0.03, IAA: 0.005, H2O: 0.001, Na2SO4: 0.0001 }, 136, 148);
    close(molAddInto(molAddInto({ ...f.head }, f.fraction), f.residue), { IAAc: 0.03, IAA: 0.005, H2O: 0.001, Na2SO4: 0.0001 });
  });

  it('9b. el mundo conserva los elementos con derrames, vapores y filtrados (también en la mesada y la campana)', () => {
    const w = world08({ route: 'ASA', seed: 9 });
    ppe08(w);
    const e0 = conservedTotals08(w);
    cmd08(w, { type: 'setCap', vesselId: 'btAA', capped: false });
    cmd08(w, { type: 'setPour', sourceId: 'btAA', targetId: null, tiltDeg: 110 });
    runP08For(w, 3);
    cmd08(w, { type: 'stopPour', sourceId: 'btAA' });
    expect(massG(w.outside.bench)).toBeGreaterThan(0.5);
    cmd08(w, { type: 'cleanSpill' });
    const e1 = conservedTotals08(w);
    for (const k of Object.keys(e0)) expect(Math.abs(e1[k] - e0[k]), k).toBeLessThan(1e-9);
  });

  it('11. el rendimiento aparente puede pasar de 100 % y no se recorta; sin pureza no hay corregido', () => {
    const y = yields(1.36, 1.304373, null);
    expect(y.apparent).toBeGreaterThan(100);
    expect(y.corrected).toBeNull();
    expect(yields(1.36, 1.304373, 0.9).corrected).toBeCloseTo((100 * 1.36 * 0.9) / 1.304373, 9);
  });
});

describe('lecturas (§6.6)', () => {
  it('10. el sesgo depende del escenario y la semilla; mover la cámara o esperar en reposo no cambia la masa', () => {
    const w = world08({ route: 'ISO', seed: 3, scenarios: [S8.MASS_OFFSET] });
    ppe08(w);
    const id = weigh(w, 'rf', 'cork01', 1.2);
    expect(w.readings[id].value).toBeGreaterThan(w.objects.rf.massG! + 0.02);
    const before = worldElements(w).C;
    run08(w, 30);
    expect(worldElements(w).C).toBeCloseTo(before, 12);
    const t1 = world08({ route: 'ISO', seed: 3, scenarios: [S8.THERM_BIAS] }).thermometer.biasC;
    const t2 = world08({ route: 'ISO', seed: 4, scenarios: [S8.THERM_BIAS] }).thermometer.biasC;
    expect(t1).not.toBe(t2);
    expect(world08({ route: 'ISO', seed: 3 }).thermometer.biasC).toBe(0);
  });

  it('12. unidades: °C → K en Arrhenius y mezclas por fracción másica con volúmenes aditivos', () => {
    const m = mixture(10, { H3PO4: 0.85, H2O: 0.15 });
    const g = massG(m);
    expect(g * (0.85 / SPECIES.H3PO4.densityGml! + 0.15 / SPECIES.H2O.densityGml!)).toBeCloseTo(10, 9);
    expect((m.H3PO4! * SPECIES.H3PO4.molarMass) / g).toBeCloseTo(0.85, 12);
    // k(T) crece con T en kelvin: 80 °C = 353,15 K.
    expect(acetylationRate(80 + 273.15, 1, 1, 1)).toBeGreaterThan(acetylationRate(25 + 273.15, 1, 1, 1) * 10);
    const r = dispatchP08(world08({ route: 'ISO', seed: 1 }), { type: 'readBalance' });
    expect(r.ok).toBe(false);
  });
});
