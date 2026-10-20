/**
 * Práctica 7 — pruebas de ciencia sin pantalla (§17.1, casos de referencia de §8). Las constantes son de prueba
 * (`[PENDIENTE]` de verificación); los casos comprueban el modelo implementado, no un instrumento comercial.
 */
import { describe, expect, it } from 'vitest';
import {
  concentrationFactor, conductivityAtConcentration, idealInfiniteDilution, molLToMolM3, sPerMToMsPerCm, sPerMToUsPerCm,
} from '../../simulation/solution-properties/conductivity';
import { weakAcidIonizedM } from '../../simulation/solution-properties/weak-electrolytes';
import { aqueousIons, compTotal, formalM, netCharge } from '../../simulation/solution-properties/conservation';
import { equilibriumDissolvedG } from '../../simulation/solution-properties/solubility';
import { MATERIALS, type MaterialId } from '../../simulation/solution-properties/materials';
import { pairValidated, solventPair } from '../../simulation/solution-properties/solvent-pairs';
import { dispatchP07, materialTotals, runP07For, solutionComp, vesselMl } from '../../simulation/bonding-world/world';
import { cmd07, contacts, hit, measureSolid, ppe, readKappa, run07, spoon, stir, world07 } from '../helpers07';
import { S } from '../../simulation/bonding-world/world';

const totalsClose = (a: Record<string, number | undefined>, b: Record<string, number | undefined>) => {
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) expect(Math.abs((a[k] ?? 0) - (b[k] ?? 0)), k).toBeLessThan(1e-9);
};

describe('Práctica 7 — ciencia (§17.1)', () => {
  it('1–2. conversiones: 1 S/m = 10 mS/cm = 10 000 µS/cm; 1 mol/L = 1000 mol/m³', () => {
    expect(sPerMToMsPerCm(1)).toBe(10);
    expect(sPerMToUsPerCm(1)).toBe(10000);
    expect(molLToMolM3(1)).toBe(1000);
  });

  it('3. 0,5844 g de NaCl en 100,0 mL → 0,1000 mol/L (caso de cálculo ideal)', () => {
    const phase = { water: 100 * MATERIALS.water.densityGml, NaCl: 0.5844 / MATERIALS.NaCl.purity };
    expect(formalM(phase, 'NaCl')).toBeCloseTo(0.1, 6);
  });

  it('4. κ límite de NaCl 0,0100 M = 1,2645 mS/cm; la corrección a concentración finita es aparte', () => {
    const ions = { 'Na+': 0.01, 'Cl-': 0.01 };
    expect(sPerMToMsPerCm(idealInfiniteDilution(ions))).toBeCloseTo(1.2645, 4);
    expect(conductivityAtConcentration(ions)).toBeLessThan(idealInfiniteDilution(ions));
    expect(concentrationFactor(ions)).toBeGreaterThan(0.9);
  });

  it('5. dilución de 10,0 mL de 0,1000 M hasta 100,0 mL finales → 0,01000 M (sin perder soluto)', () => {
    const stock = solutionComp('NaCl', 0.1, 100);
    const ali = { water: (stock.water ?? 0) * 0.1, NaCl: (stock.NaCl ?? 0) * 0.1 };
    const final = { ...ali, water: (ali.water ?? 0) + 90 * MATERIALS.water.densityGml };
    expect(formalM(final, 'NaCl')).toBeCloseTo(0.01, 6);
    expect(final.NaCl).toBeCloseTo((stock.NaCl ?? 0) / 10, 12);
  });

  it('6. ácido acético 0,1000 M, Ka 1,8e-5: x ≈ 0,001333 M y la solución es eléctricamente neutra', () => {
    expect(weakAcidIonizedM(1.8e-5, 0.1)).toBeCloseTo(0.001333, 6);
    const ions = aqueousIons(solutionComp('acetic', 0.1, 100));
    expect(ions['H3O+']).toBeCloseTo(0.001333, 5);
    expect(netCharge(ions)).toBeCloseTo(0, 12);
    expect(sPerMToMsPerCm(idealInfiniteDilution(ions))).toBeCloseTo(0.52, 2);
  });

  it('7. la sacarosa disuelta conserva su masa y no genera iones', () => {
    const w = world07();
    ppe(w);
    const before = materialTotals(w);
    cmd07(w, { type: 'setCap', vesselId: 'btWater', capped: false });
    w.vessels.bk4.polar.water = 50 * MATERIALS.water.densityGml;
    w.vessels.btWater.polar.water! -= 50 * MATERIALS.water.densityGml;
    for (let i = 0; i < 6; i++) spoon(w, 'jarSucrose', 'bk4');
    stir(w, 'bk4', 20);
    expect(Object.keys(aqueousIons(w.vessels.bk4.polar))).toEqual([]);
    expect(w.vessels.bk4.polar.sucrose).toBeGreaterThan(0.5);
    totalsClose(materialTotals(w), before);
  });

  it('8. el NaCl disuelto aporta Na⁺ y Cl⁻ en proporción estequiométrica sin duplicar masa', () => {
    const phase = solutionComp('NaCl', 0.05, 40);
    const ions = aqueousIons(phase);
    expect(ions['Na+']).toBeCloseTo(0.05, 9);
    expect(ions['Cl-']).toBeCloseTo(0.05, 9);
    expect(compTotal(phase)).toBeCloseTo((phase.water ?? 0) + (phase.NaCl ?? 0), 12);
  });

  it('9. con más soluto que la solubilidad queda sólido remanente y la concentración se limita', () => {
    expect(equilibriumDissolvedG(2.0, 96, 5)).toBeCloseTo(0.48, 9);
    const w = world07({ scenarios: [S.SOLUBILITY_LIMIT] });
    ppe(w);
    w.vessels.tube1.polar.water = 5 * MATERIALS.water.densityGml;
    w.vessels.btWater.polar.water! -= 5 * MATERIALS.water.densityGml;
    cmd07(w, { type: 'setCap', vesselId: 'jarExcess', capped: false });
    for (let i = 0; i < 40 && compTotal(w.vessels.jarExcess.solid) > 0.001; i++) spoon(w, 'jarExcess', 'tube1');
    stir(w, 'tube1', 60);
    const t = w.vessels.tube1;
    expect(t.solid.NaHCO3 ?? 0).toBeGreaterThan(0.5);
    expect(t.polar.NaHCO3 ?? 0).toBeCloseTo((96 * vesselMl({ ...t, apolar: {}, solid: {} })) / 1000, 3);
  });

  it('10. agua y heptano forman dos fases; agitarlas no cambia la masa', () => {
    const w = world07({ scenarios: [S.MULTIPHASE] });
    ppe(w);
    const before = materialTotals(w);
    const t = w.vessels.tube8;
    expect(t.polar.water).toBeGreaterThan(0);
    expect(t.apolar.heptane).toBeGreaterThan(0);
    stir(w, 'tube8', 5, 0.8);
    expect(t.emulsion01).toBeGreaterThan(0.3);
    run07(w, 30);
    expect(t.emulsion01).toBeLessThan(0.2);
    totalsClose(materialTotals(w), before);
  });

  it('11. sonda sin inmersión suficiente: error, no un valor de κ', () => {
    const w = world07();
    ppe(w);
    w.vessels.bk1.polar = solutionComp('NaCl', 0.01, 30);
    w.vessels.btWater.polar.water! -= 30;
    cmd07(w, { type: 'powerMeter', on: true });
    cmd07(w, { type: 'setProbeDepth', vesselId: 'bk1', immersionCm: 0.6, bottomContact: false });
    run07(w, 4);
    const r = dispatchP07(w, { type: 'readConductivity' });
    expect(r.ok).toBe(false);
    expect(w.readings[r.id!].valid).toBe(false);
    expect(w.readings[r.id!].qualityFlags).toContain('SHALLOW');
  });

  it('12. sin dos contactos correctos el detector no da evidencia; cobre limpio conduce, NaCl seco no', () => {
    const w = world07();
    ppe(w);
    cmd07(w, { type: 'powerDetector', on: true });
    cmd07(w, { type: 'setElectrodeContacts', a: hit('spCu'), b: null });
    run07(w, 1.5);
    expect(dispatchP07(w, { type: 'readDetector' }).ok).toBe(false);
    const cu = measureSolid(w, 'spCu', 3);
    expect(cu.ok).toBe(true);
    expect(cu.value!).toBeGreaterThan(5);
    const salt = measureSolid(w, 'spNaCl', 1);
    expect(salt.ok).toBe(true);
    expect(salt.value!).toBeLessThan(w.params.detectorThresholdMA);
    contacts(w, null, null);
  });

  it('13. el enjuague reduce una contaminación contabilizada y la lleva al residuo', () => {
    const w = world07({ scenarios: [S.PROBE_NOT_RINSED] });
    ppe(w);
    const salt0 = w.meter.film.NaCl ?? 0;
    expect(salt0).toBeGreaterThan(0);
    cmd07(w, { type: 'rinseProbe', wasteId: 'wasteAq' });
    expect(w.meter.film.NaCl ?? 0).toBeLessThan(salt0 * 0.05);
    expect(w.vessels.wasteAq.polar.NaCl ?? 0).toBeCloseTo(salt0 - (w.meter.film.NaCl ?? 0), 12);
  });

  it('14. la misma semilla y los mismos comandos dan lecturas y eventos idénticos', () => {
    const go = () => {
      const w = world07({ seed: 4242 });
      ppe(w);
      w.vessels.bk2.polar = solutionComp('KCl', 0.02, 30);
      w.vessels.btWater.polar.water! -= 30;
      cmd07(w, { type: 'powerMeter', on: true });
      readKappa(w, 'bk2', 'HIGH');
      measureSolid(w, 'spGraphite', 1.5);
      runP07For(w, 2);
      return JSON.stringify({ r: w.readings, e: w.events.map((e) => [e.code, e.t]) });
    };
    expect(go()).toBe(go());
  });

  it('15. toda sustancia habilitada tiene ficha y referencias; un par sin ficha queda bloqueado', () => {
    for (const m of Object.values(MATERIALS)) {
      if (m.status !== 'enabled') continue;
      expect(m.refs.length, m.id).toBeGreaterThan(0);
      expect(m.densityGml, m.id).toBeGreaterThan(0);
      if (m.family === 'ionic-solid') expect(m.dissociation, m.id).toBeTruthy();
      if (m.family === 'ionic-solid' || m.family === 'molecular') expect(m.molarMassGmol, m.id).toBeGreaterThan(0);
    }
    expect(pairValidated('ethanol', 'heptane')).toBe(false);
    expect(solventPair('petEther' as MaterialId, 'water').model.kind).toBe('pending');
    // El dominio no mezcla un par sin ficha: el etanol no se vierte sobre heptano.
    const w = world07();
    ppe(w);
    w.vessels.tube3.apolar.heptane = 3;
    w.vessels.btHeptane.apolar.heptane! -= 3;
    const before = materialTotals(w);
    cmd07(w, { type: 'setCap', vesselId: 'btEthanol', capped: false });
    cmd07(w, { type: 'setPour', sourceId: 'btEthanol', targetId: 'tube3', tiltDeg: 60 });
    run07(w, 2);
    expect(w.vessels.tube3.polar.ethanol ?? 0).toBe(0);
    totalsClose(materialTotals(w), before);
  });
});
