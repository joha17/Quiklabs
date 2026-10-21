/**
 * Práctica 9 — pruebas científicas y de seguridad (§8, §17): estequiometría 1:1 y 1:3 con cota por limitante,
 * conservación en una alícuota, emisión que depende de los moles aportados (no de la etiqueta), enmascaramiento por
 * sodio sin borrar el potasio, vidrio de reloj virtual frente al asa, campana, luz local y rotor.
 */
import { describe, expect, it } from 'vitest';
import { RX, applyExtent, feoh3EquilibriumShift, maxExtent, srso4EquilibriumShift, stepPrecipitation } from '../../simulation/cation-analysis-world/precipitation';
import { ELEMENTS, SPECIES, elementTotals, chargeTotal, molAddInto, solution, type Mol } from '../../simulation/cation-analysis-world/species';
import { lineIntensities, perceive } from '../../simulation/cation-analysis-world/emission-spectrum';
import { S9, conservedTotals09, dispatchP09, flameView } from '../../simulation/cation-analysis-world/world';
import { FLAME_POINT, PAD_POS, rotorSlot } from '../../practices/practice-09/definition';
import { centrifuge, cmd09, hoodReady, loopTest, padTest, pipette, place, ppe09, run09, world09 } from '../helpers09';

const balanced = (r: { nu: Partial<Record<keyof typeof SPECIES, number>> }) => {
  const e = Object.fromEntries(ELEMENTS.map((x) => [x, 0])) as Record<string, number>;
  let q = 0;
  for (const [s, nu] of Object.entries(r.nu) as Array<[keyof typeof SPECIES, number]>) {
    for (const [el, a] of Object.entries(SPECIES[s].atoms)) e[el] += nu * (a ?? 0);
    q += nu * SPECIES[s].charge;
  }
  return Object.values(e).every((v) => Math.abs(v) < 1e-12) && Math.abs(q) < 1e-12;
};

describe('estequiometría (§8)', () => {
  it('las reacciones de la marcha balancean elementos y carga', () => {
    for (const r of Object.values(RX)) expect(balanced(r), r.id).toBe(true);
  });

  it('science:Sr — caso 1: 0,00100 mol Sr²⁺ + 0,00120 mol SO₄²⁻ → ξ = 0,00100 mol, quedan 0,00020 mol de sulfato', () => {
    const m: Mol = { 'Sr2+': 0.001, 'SO4^2-': 0.0012 };
    expect(maxExtent(RX.srso4, m)).toBeCloseTo(0.001, 12);
    applyExtent(m, RX.srso4, maxExtent(RX.srso4, m));
    expect(m['SO4^2-']).toBeCloseTo(0.0002, 12);
    expect(m['SrSO4(s)']! * SPECIES['SrSO4(s)'].molarMass).toBeCloseTo(0.001 * (87.62 + 32.06 + 4 * 15.999), 9);
    // El equilibrio curricular nunca supera el máximo cuantitativo.
    expect(srso4EquilibriumShift(0.001, 0.0012, 0, 0.005)).toBeLessThanOrEqual(0.001);
  });

  it('science:Fe — caso 2: 0,00060 mol Fe³⁺ + 0,00150 mol OH⁻ → ξ_max = 0,00050 mol, quedan 0,00010 mol Fe³⁺', () => {
    const m: Mol = { 'Fe3+': 0.0006, 'OH-': 0.0015 };
    expect(maxExtent(RX.feoh3, m)).toBeCloseTo(0.0005, 12);
    const x = feoh3EquilibriumShift(0.0006, 0.0015, 0, 0.005);
    expect(x).toBeLessThanOrEqual(0.0005 + 1e-15);
    expect(x).toBeGreaterThan(0.0005 * 0.999);
    applyExtent(m, RX.feoh3, x);
    expect(m['Fe3+']).toBeCloseTo(0.0001, 6);
  });

  it('la acidez libre consume el álcali antes que el hierro (neutralización)', () => {
    const liq = molAddInto(solution(3, [{ salt: 'Fe(NO3)3', molL: 0.02 }, { salt: 'HNO3', molL: 0.05 }]), solution(0.5, [{ salt: 'NH4OH', molL: 0.25 }]));
    const solid: Mol = {};
    for (let i = 0; i < 400; i++) stepPrecipitation(liq, solid, 3.5 / 1000, 0.05, 0.5, 1);
    // 1,50×10⁻⁴ mol de H⁺ frente a 1,25×10⁻⁴ mol de OH⁻: todo el álcali se neutraliza y no precipita hierro.
    expect(liq['H+']!).toBeCloseTo(2.5e-5, 12);
    expect(liq['OH-'] ?? 0).toBeLessThan(1e-15);
    expect(solid['FeOH3(s)'] ?? 0).toBe(0);
  });

  it('science:aliquot — caso 3: 2,50 mL de 10,0 mL con 2,00×10⁻⁴ mol de K⁺ llevan 5,00×10⁻⁵ mol', () => {
    const w = world09();
    ppe09(w);
    // Mezcla uniforme de 10,0 mL en el vaso, con exactamente 2,00×10⁻⁴ mol de K⁺ (desde el control, sin crear materia).
    pipette(w, 'ctlK', 'bk1', 2.0);
    cmd09(w, { type: 'squeezeWash', targetId: 'bk1', ml: 8.0 });
    const k0 = w.vessels.bk1.liq['K+']!;
    pipette(w, 'bk1', 'T1', 2.5);
    const ratio = w.vessels.T1.liq['K+']! / k0;
    expect(ratio).toBeGreaterThan(0.245);
    expect(ratio).toBeLessThan(0.256);
    expect(w.vessels.T1.liq['K+']! + w.vessels.bk1.liq['K+']! + (w.pipette.content['K+'] ?? 0)).toBeCloseTo(k0, 15);
  });
});

describe('emisión (§6.3)', () => {
  it('science:spectra — la emisión depende de los moles en la zona emisora, no de la etiqueta', () => {
    const none = perceive(lineIntensities({}), 20);
    expect(none.category).toBe('none');
    expect(perceive(lineIntensities({ 'Sr2+': 6e-7 }), 45).category).toBe('crimson');
    expect(perceive(lineIntensities({ 'Na+': 6e-7 }), 45).category).toBe('yellow');
    expect(perceive(lineIntensities({ 'Ca2+': 6e-7 }), 45).category).toBe('orange');
    expect(perceive(lineIntensities({ 'K+': 6e-7 }), 20).category).toBe('violet');
    const a = lineIntensities({ 'K+': 1e-7 });
    const b = lineIntensities({ 'K+': 2e-7 });
    expect(b.find((l) => l.nm === 766.5)!.intensity).toBeCloseTo(2 * a.find((l) => l.nm === 766.5)!.intensity, 12);
  });

  it('science:NaMask — con el mismo K y más Na el amarillo enmascara el violeta, y el K no desaparece', () => {
    const k = { 'K+': 6e-7 };
    const kna = { 'K+': 6e-7, 'Na+': 6e-7 };
    expect(perceive(lineIntensities(k), 20).category).toBe('violet');
    expect(perceive(lineIntensities(kna), 20).category).toBe('yellow');
    const lineK = (m: typeof k) => lineIntensities(m).find((l) => l.nm === 766.5)!.intensity;
    expect(lineK(kna)).toBe(lineK(k));
  });

  it('la luz local cambia el contraste percibido, nunca el espectro', () => {
    const lines = lineIntensities({ 'K+': 1.5e-7 });
    expect(perceive(lines, 100).contrast).toBeLessThan(perceive(lines, 20).contrast);
    expect(perceive(lines, 20).category).toBe('violet');
    expect(perceive(lines, 100).category).toBe('none');
  });

  it('science:glassMode — asa y vidrio virtual dan lecturas comparables y causales; el vidrio dura más y se fisura si se sobrecalienta', () => {
    const w = world09();
    ppe09(w);
    hoodReady(w, 45);
    const e1 = w.readings[loopTest(w, 'ctlSr').emission];
    const e2 = w.readings[padTest(w, 'wgFlame', 'ctlSr', 2)];
    expect(e1.category).toBe('crimson');
    expect(e2.category).toBe('crimson');
    expect(e2.snapshot.support).toBe('watchGlass');
    // Sin muestra en el vidrio, no hay emisión de Sr (el color sale de lo cargado).
    const e0 = conservedTotals09(w);
    pipette(w, 'ctlSr', 'wgFlame', 0.3);
    place(w, 'wgFlame', 'flamePad', PAD_POS);
    run09(w, 30);
    expect(w.evidence['err:E17']).toBe(1);
    expect(w.flame.glassCracked).toBe(true);
    const e1t = conservedTotals09(w);
    for (const k of Object.keys(e0)) expect(Math.abs(e1t[k] - e0[k]), k).toBeLessThan(1e-12);
  });
});

describe('seguridad (§10, §17)', () => {
  it('safety:hood — sin extracción o con la mampara alta no se enciende la llama virtual', () => {
    const w = world09();
    ppe09(w);
    expect(dispatchP09(w, { type: 'setIgnition', on: true }).code).toBe('HOOD_FLOW');
    cmd09(w, { type: 'acknowledge' });
    cmd09(w, { type: 'setHoodFan', on: true });
    cmd09(w, { type: 'setSash', heightCm: 60 });
    expect(dispatchP09(w, { type: 'setIgnition', on: true }).code).toBe('SASH_TOO_HIGH');
    cmd09(w, { type: 'acknowledge' });
    cmd09(w, { type: 'setSash', heightCm: 30 });
    cmd09(w, { type: 'setIgnition', on: true });
    expect(w.flame.ignited).toBe(true);
    const low = world09({ scenarios: [S9.LOW_FLOW] });
    ppe09(low);
    hoodReady(low);
    expect(dispatchP09(low, { type: 'setIgnition', on: true }).ok).toBe(false);
  });

  it('safety:dim — la luz baja solo es local: oscurecer la sala se rechaza', () => {
    const w = world09();
    ppe09(w);
    cmd09(w, { type: 'setObservationLight', pct: 20, scope: 'local' });
    expect(w.hood.lightPct).toBe(20);
    expect(dispatchP09(w, { type: 'setObservationLight', pct: 20, scope: 'room' }).code).toBe('SAFETY_LIGHT_LOCKED');
  });

  it('safety:rotor — sin par opuesto, sin contrapeso o con la tapa abierta no arranca; girando no se abre', () => {
    const w = world09();
    ppe09(w);
    pipette(w, 'smp1', 'T1', 3);
    place(w, 'T1', 'cf:0', rotorSlot(0));
    cmd09(w, { type: 'setLid', closed: true });
    expect(dispatchP09(w, { type: 'spin', seconds: 30 }).code).toBe('ASYMMETRIC');
    cmd09(w, { type: 'setLid', closed: false });
    place(w, 'T4', 'cf:2', rotorSlot(2));
    cmd09(w, { type: 'setLid', closed: true });
    expect(dispatchP09(w, { type: 'spin', seconds: 30 }).code).toBe('IMBALANCE');
    cmd09(w, { type: 'setLid', closed: false });
    cmd09(w, { type: 'squeezeWash', targetId: 'T4', ml: 3.0 });
    expect(dispatchP09(w, { type: 'spin', seconds: 30 }).code).toBe('LID_OPEN');
    cmd09(w, { type: 'setLid', closed: true });
    cmd09(w, { type: 'spin', seconds: 30 });
    run09(w, 3);
    expect(dispatchP09(w, { type: 'setLid', closed: false }).code).toBe('ROTOR_MOVING');
    run09(w, 40);
    cmd09(w, { type: 'setLid', closed: false });
    expect(w.evidence.spinDone).toBeGreaterThan(0);
    void centrifuge;
    void FLAME_POINT;
  });

  it('una precipitación conserva elementos y carga en todos los compartimentos', () => {
    const liq = molAddInto(solution(3, [{ salt: 'Sr(NO3)2', molL: 0.04 }, { salt: 'Fe(NO3)3', molL: 0.02 }]), solution(1, [{ salt: '(NH4)2SO4', molL: 0.25 }, { salt: 'NH4OH', molL: 0.25 }]));
    const before = { ...elementTotals(liq) };
    const solid: Mol = {};
    for (let i = 0; i < 200; i++) stepPrecipitation(liq, solid, 4 / 1000, 0.05, 0.5, 1);
    const all = molAddInto({ ...liq }, solid);
    const after = elementTotals(all);
    for (const e of ELEMENTS) expect(Math.abs(after[e] - before[e]), e).toBeLessThan(1e-15);
    expect(Math.abs(chargeTotal(all))).toBeLessThan(1e-15);
    expect(solid['SrSO4(s)']).toBeGreaterThan(0);
    void flameView;
  });
});
