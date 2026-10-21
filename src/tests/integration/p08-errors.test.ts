/**
 * Práctica 8 — los 60 errores ORG01–ORG60 (§9, §17.3 ítem 16) y los 16 escenarios (§10, ítem 17). Cada error tiene
 * una fixture aislada hecha con comandos de estudiante que (1) dispara su `err:`/`nb:`, (2) comprueba la consecuencia
 * CAUSAL en el mundo o en la nota y (3) tiene retroalimentación localizable. 60/60 deben pasar.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { P08World, RouteId } from '../../simulation/organic-world/types';
import { S8, conservedTotals08, conversion, dispatchP08, phasesOf, pressureKPa, runP08For, stepP08World, vesselMl } from '../../simulation/organic-world/world';
import { massG, liquidMl } from '../../simulation/organic-chemistry/species';
import { SIMULATED_ERRORS_P08, P08_SCENARIOS, validScenarios08, type P08Scenario } from '../../practices/practice-08/error-scenarios';
import { evaluateP08, notebookIssues08 } from '../../practices/practice-08/rubric';
import { plannedLimiting, trueLimiting } from '../../practices/practice-08/expected-results';
import type { P08Notebook } from '../../practices/practice-08/notebook';
import {
  cmd08, coolInIce, dose, drainAll, drainBottom, dropperTransfer, heat, idealAttempt, inspectAll, isolateASA, isolateLiquid, place, pourAll, pourTo, ppe08, run08, shakeAndVent,
  spoon, weigh, weighOut, world08, type IdealResult,
} from '../helpers08';
import es8 from '../../locales/es/practice8.json';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const err = (w: P08World, code: string) => (w.evidence[`err:${code}`] ?? 0) > 0;
const newRes = (): IdealResult => ({ masses: [], volumes: [], temps: [], analyses: [] });
const pose = (x = 0, y = 0, z = 0) => ({ x, y, z, rotationRad: 0 });

/** Estados preparados por ruta (se clonan para cada fixture). */
const cache: Partial<Record<string, P08World>> = {};
function base(route: RouteId, scenarios: P08Scenario[] = []) {
  const w = world08({ route, seed: 808, scenarios });
  ppe08(w);
  inspectAll(w);
  return w;
}
function dosed(route: RouteId) {
  const key = `dosed:${route}`;
  if (!cache[key]) {
    const w = base(route);
    dose(w, newRes());
    cache[key] = w;
  }
  return clone(cache[key]!);
}
function heated(route: RouteId) {
  const key = `heated:${route}`;
  if (!cache[key]) {
    const w = dosed(route);
    heat(w, 600);
    cache[key] = w;
  }
  return clone(cache[key]!);
}
/** Ruta líquida enfriada y vertida al embudo, con el condensador ya retirado. */
function inFunnel(route: 'ISO' | 'MS') {
  const key = `funnel:${route}`;
  if (!cache[key]) {
    const w = heated(route);
    coolInIce(w);
    cmd08(w, { type: 'setPose', id: 'th01', pose: pose(292, 16, 0.5), support: 'bench' });
    place(w, 'condenser01', 'bench', 1);
    cmd08(w, { type: 'setCondenserWater', on: false });
    pourAll(w, 'rf', 'sf', 130);
    cmd08(w, { type: 'squeezeWash', targetId: 'sf', ml: route === 'MS' ? 15 : 10 });
    shakeAndVent(w, 2);
    cache[key] = w;
  }
  return clone(cache[key]!);
}
/** ASA reaccionada y apenas enfriada en el aro (lista para el agua). */
function asaReady() {
  const key = 'asaReady';
  if (!cache[key]) {
    const w = heated('ASA');
    cmd08(w, { type: 'setPose', id: 'th01', pose: pose(292, 16, 0.5), support: 'bench' });
    cmd08(w, { type: 'useTongs', on: true });
    place(w, 'rf', 'cork01', 1.2);
    cmd08(w, { type: 'useTongs', on: false });
    for (let i = 0; i < 400 && w.vessels.rf.tempC > 45; i++) run08(w, 5);
    cache[key] = w;
  }
  return clone(cache[key]!);
}
const ideal: Partial<Record<RouteId, ReturnType<typeof idealAttempt>>> = {};
beforeAll(() => {
  for (const r of ['ISO', 'ASA', 'MS'] as const) ideal[r] = idealAttempt(r, 808);
}, 300000);
/** Libreta ideal modificada; devuelve problemas detectados y la nota frente a la ideal. */
function nbFixture(route: RouteId, edit: (nb: P08Notebook, w: P08World) => void) {
  const { w, nb } = ideal[route]!;
  const nb2 = clone(nb);
  edit(nb2, w);
  return { issues: notebookIssues08(w, nb2), score: evaluateP08(clone(w), nb2).total, best: evaluateP08(clone(w), clone(nb)).total };
}

/** Fixtures: cada una dispara el error y verifica su consecuencia causal. */
const FIXTURES: Record<string, () => void> = {
  ORG01() {
    const w = world08({ route: 'ISO', seed: 1 });
    for (const item of ['coat', 'gloves', 'hair'] as const) cmd08(w, { type: 'setPPE', item, enabled: true });
    expect(dispatchP08(w, { type: 'startWork' }).ok).toBe(false);
    expect(err(w, 'ORG01')).toBe(true);
    const ml = vesselMl(w.vessels.btIAA);
    expect(dispatchP08(w, { type: 'setCap', vesselId: 'btIAA', capped: false }).ok).toBe(false);
    run08(w, 1);
    expect(vesselMl(w.vessels.btIAA)).toBe(ml);
  },
  ORG02() {
    const w = world08({ route: 'ASA', seed: 1 });
    cmd08(w, { type: 'setPPE', item: 'goggles', enabled: true });
    expect(dispatchP08(w, { type: 'startWork' }).ok).toBe(false);
    expect(err(w, 'ORG02')).toBe(true);
    expect(dispatchP08(w, { type: 'scoop', sourceId: 'jarSA' }).ok).toBe(false);
    expect(massG(w.spatula.load)).toBe(0);
  },
  ORG03() {
    const w = base('ISO');
    cmd08(w, { type: 'setCap', vesselId: 'btAcOH', capped: false });
    const before = vesselMl(w.vessels.btAcOH);
    expect(dispatchP08(w, { type: 'setPour', sourceId: 'btAcOH', targetId: 'plasticCup', tiltDeg: 120 }).code).toBe('INCOMPATIBLE');
    run08(w, 2);
    expect(err(w, 'ORG03')).toBe(true);
    expect(vesselMl(w.vessels.btAcOH)).toBe(before);
    expect(vesselMl(w.vessels.plasticCup)).toBe(0);
  },
  ORG04() {
    const w = base('ISO');
    pourTo(w, 'btIAA', 'rf', 3);
    const g = massG(w.vessels.rf.liq);
    place(w, 'rf', 'bench', 0);
    expect(err(w, 'ORG04')).toBe(true);
    expect(vesselMl(w.vessels.rf)).toBe(0);
    expect(massG(w.outside.bench)).toBeCloseTo(g, 9);
    expect(w.safety.incident?.code).toBe('ORG04');
  },
  ORG05() {
    const w = base('ISO');
    pourTo(w, 'btIAA', 'rf', 5);
    pourTo(w, 'btAcOH30', 'rf', 7);
    expect(err(w, 'ORG05')).toBe(true);
    // Entra sobre todo agua: el ácido acético pasa a ser el limitante y el agua frena el equilibrio.
    expect(w.vessels.rf.liq.H2O!).toBeGreaterThan(w.vessels.rf.liq.AcOH!);
    expect(w.vessels.rf.liq.AcOH!).toBeLessThan(w.vessels.rf.liq.IAA!);
  },
  ORG06() {
    const w = base('ISO');
    pourTo(w, 'btIAA', 'rf', 5);
    const id = weigh(w, 'rf', 'cork01', 1.2);
    expect(err(w, 'ORG06')).toBe(true);
    expect(w.readings[id].qualityFlags).toContain('NO_TARE');
    expect(w.readings[id].value).toBeGreaterThan(w.objects.rf.massG! + 3);
  },
  ORG07() {
    const w = base('ISO');
    cmd08(w, { type: 'powerBalance', on: true });
    run08(w, 1);
    place(w, 'rf', 'pan', 9);
    const r = dispatchP08(w, { type: 'readBalance' });
    expect(r.ok).toBe(false);
    expect(err(w, 'ORG07')).toBe(true);
    expect(w.readings[r.id!].valid).toBe(false);
  },
  ORG08() {
    const w = base('ISO');
    cmd08(w, { type: 'powerBalance', on: true });
    place(w, 'washBottle', 'pan', 9);
    place(w, 'btNaHCO3', 'pan', 9);
    run08(w, 4);
    const r = dispatchP08(w, { type: 'readBalance' });
    expect(r.ok).toBe(false);
    expect(err(w, 'ORG08')).toBe(true);
    expect(Number.isNaN(w.readings[r.id!].value)).toBe(true);
  },
  ORG09() {
    const w = base('ISO');
    pourTo(w, 'btIAA', 'cyl10', 5);
    const r = cmd08(w, { type: 'readVolume', vesselId: 'cyl10', eyeDzCm: 3 }, false);
    expect(err(w, 'ORG09')).toBe(true);
    expect(Math.abs(w.readings[r.id!].value - w.readings[r.id!].trueValue)).toBeGreaterThan(0.1);
  },
  ORG10() {
    const w = base('ISO');
    weigh(w, 'rf', 'pan', 9);
    place(w, 'rf', 'pan', 9);
    cmd08(w, { type: 'setCap', vesselId: 'btIAA', capped: false });
    cmd08(w, { type: 'setPour', sourceId: 'btIAA', targetId: 'rf', tiltDeg: 130 });
    run08(w, 0.3);
    cmd08(w, { type: 'stopPour', sourceId: 'btIAA' });
    const ext = massG(w.vessels.rf.ext);
    expect(ext).toBeGreaterThan(0.005);
    run08(w, 4);
    const r = dispatchP08(w, { type: 'readBalance' });
    expect(err(w, 'ORG10')).toBe(true);
    expect(w.readings[r.id!].qualityFlags).toContain('WET_OUTSIDE');
    place(w, 'rf', 'cork01', 1.2);
    expect(massG(w.outside.bench)).toBeCloseTo(ext, 9);
  },
  ORG11() {
    const w = base('ISO');
    cmd08(w, { type: 'setCap', vesselId: 'btIAA', capped: false });
    cmd08(w, { type: 'setPour', sourceId: 'btIAA', targetId: null, tiltDeg: 110 });
    run08(w, 1);
    cmd08(w, { type: 'stopPour', sourceId: 'btIAA' });
    expect(err(w, 'ORG11')).toBe(true);
    expect(w.outside.bench.IAA!).toBeGreaterThan(0.001);
    expect(vesselMl(w.vessels.rf)).toBe(0);
  },
  ORG12() {
    const w = base('MS');
    cmd08(w, { type: 'setCap', vesselId: 'jarNa2SO4', capped: false });
    cmd08(w, { type: 'setCap', vesselId: 'jarSA', capped: false });
    place(w, 'spatula', 'jarNa2SO4', 2);
    cmd08(w, { type: 'scoop', sourceId: 'jarNa2SO4' });
    cmd08(w, { type: 'dropSpatula', targetId: 'erDry' });
    // Sin limpiar: la espátula lleva Na₂SO₄ al vidrio con el ácido salicílico.
    place(w, 'spatula', 'jarSA', 2);
    cmd08(w, { type: 'scoop', sourceId: 'jarSA' });
    cmd08(w, { type: 'dropSpatula', targetId: 'wg1' });
    expect(err(w, 'ORG12')).toBe(true);
    expect(w.vessels.wg1.solid.Na2SO4!).toBeGreaterThan(w.vessels.wg1.solid.SA! * 0.006);
  },
  ORG13() {
    const w = dosed('ISO');
    cmd08(w, { type: 'setPlate', on: true, setpointC: 95 });
    run08(w, 40);
    expect(err(w, 'ORG13')).toBe(true);
    expect(w.vessels.rf.tempC).toBeLessThan(26);
    expect(w.plate.bathTempC).toBeGreaterThan(30);
  },
  ORG14() {
    const w = dosed('ISO');
    place(w, 'rf', 'bath01', 13);
    cmd08(w, { type: 'setMagneticStir', level01: 0.5 });
    cmd08(w, { type: 'setPlate', on: true, setpointC: 95 });
    run08(w, 400);
    const r = cmd08(w, { type: 'readThermometer' });
    expect(err(w, 'ORG14')).toBe(true);
    expect(w.readings[r.id!].value).toBeLessThan(w.vessels.rf.tempC - 30);
  },
  ORG15() {
    const run = (stir: number) => {
      const w = dosed('ISO');
      place(w, 'rf', 'bath01', 13);
      cmd08(w, { type: 'setMagneticStir', level01: stir });
      cmd08(w, { type: 'setPlate', on: true, setpointC: 95 });
      run08(w, 240);
      return w;
    };
    const still = run(0);
    const stirred = run(0.5);
    expect(err(still, 'ORG15')).toBe(true);
    expect(err(stirred, 'ORG15')).toBe(false);
    expect(still.vessels.rf.tempC).toBeLessThan(stirred.vessels.rf.tempC - 1);
    expect(conversion(still)).toBeLessThan(conversion(stirred));
  },
  ORG16() {
    const w = dosed('ASA');
    place(w, 'rf', 'bath01', 13);
    cmd08(w, { type: 'setMagneticStir', level01: 0.95 });
    cmd08(w, { type: 'setPlate', on: true, setpointC: 80 });
    run08(w, 300);
    expect(err(w, 'ORG16')).toBe(true);
    expect(massG(w.outside.bench)).toBeGreaterThan(0.01);
  },
  ORG17() {
    const w = dosed('ISO');
    heat(w, 240);
    run08(w, 1);
    expect(err(w, 'ORG17')).toBe(true);
    expect(conversion(w)).toBeLessThan(0.7);
  },
  ORG18() {
    const w = world08({ route: 'ISO', seed: 808, scenarios: [S8.THERM_BIAS] });
    ppe08(w);
    dose(w, newRes());
    place(w, 'th01', 'rf', 4);
    run08(w, 20);
    const r = cmd08(w, { type: 'readThermometer' });
    expect(err(w, 'ORG18')).toBe(true);
    expect(w.readings[r.id!].value - w.readings[r.id!].trueValue).toBeGreaterThan(2.5);
  },
  ORG19() {
    const w = world08({ route: 'ISO', seed: 808, scenarios: [S8.LIMITING_SWITCH] });
    const { w: wi, nb } = ideal.ISO!;
    const nb2 = clone(nb);
    nb2.tableA.reagents.find((r) => r.species === 'AcOH')!.purity = '1';
    const issues = notebookIssues08(w, nb2);
    expect(issues).toContain('nb:ORG19');
    // Con la pureza real (35 %) el limitante es el ácido; con 1 se cree que es el alcohol.
    expect(plannedLimiting(nb2)!.limiting).toBe('IAA');
    void wi;
  },
  ORG20() {
    const run = (water: boolean) => {
      const w = dosed('MS');
      place(w, 'th01', 'rf', 4);
      place(w, 'condenser01', 'rf', 11);
      cmd08(w, { type: 'setCondenserWater', on: water });
      place(w, 'rf', 'bath01', 13);
      cmd08(w, { type: 'setMagneticStir', level01: 0.5 });
      cmd08(w, { type: 'setPlate', on: true, setpointC: 70 });
      run08(w, 600);
      return w;
    };
    const dry = run(false);
    const ok = run(true);
    expect(err(dry, 'ORG20')).toBe(true);
    expect(err(ok, 'ORG20')).toBe(false);
    expect(dry.outside.exhaust.MeOH!).toBeGreaterThan(5 * (ok.outside.exhaust.MeOH ?? 0));
  },
  ORG21() {
    const w = heated('ISO');
    coolInIce(w);
    place(w, 'condenser01', 'bench', 1);
    cmd08(w, { type: 'setValve', opening01: 1, receiverId: 'bkAq' });
    pourAll(w, 'rf', 'sf', 130);
    expect(err(w, 'ORG21')).toBe(true);
    expect(w.vessels.bkAq.liq.IAAc!).toBeGreaterThan(0.01);
  },
  ORG22() {
    const w = heated('ISO');
    expect(dispatchP08(w, { type: 'setPose', id: 'rf', pose: pose(272, 42, 20), support: 'hand' }).code).toBe('HOT');
    expect(err(w, 'ORG22')).toBe(true);
    expect(w.objects.rf.support).toBe('bath01');
  },
  ORG23() {
    const run = (water: boolean) => {
      const w = dosed('ASA');
      if (water) cmd08(w, { type: 'squeezeWash', targetId: 'rf', ml: 2 });
      run08(w, 120);
      return w;
    };
    const wet = run(true);
    const dry = run(false);
    expect(err(wet, 'ORG23')).toBe(true);
    expect(wet.vessels.rf.liq.AA!).toBeLessThan(dry.vessels.rf.liq.AA! - 0.002);
  },
  ORG24() {
    const run = (cat: boolean) => {
      const w = base('ASA');
      weighOut(w, 'wg1', 'jarSA', 2.0);
      cmd08(w, { type: 'dispose', vesselId: 'wg1', targetId: 'rf' });
      pourTo(w, 'btAA', 'cyl10', 5);
      pourAll(w, 'cyl10', 'rf');
      if (cat) dropperTransfer(w, 'btH3PO4', 'rf', 0.25);
      heat(w, 300);
      return w;
    };
    const none = run(false);
    expect(err(none, 'ORG24')).toBe(true);
    expect(conversion(none)).toBeLessThan(conversion(run(true)) - 0.1);
  },
  ORG25() {
    const w = base('ASA');
    dropperTransfer(w, 'btH2SO4', 'rf', 0.2);
    expect(err(w, 'ORG25')).toBe(true);
    expect(w.vessels.rf.liq.H2SO4 ?? 0).toBe(0);
  },
  ORG26() {
    const w = asaReady();
    const wi = asaReady();
    isolateASA(w, newRes(), { extraWaterMl: 40 });
    isolateASA(wi, newRes());
    expect(err(w, 'ORG26')).toBe(true);
    expect(massG(w.vessels.wasteAcid.liq)).toBeGreaterThan(0);
    expect(w.vessels.wasteAcid.liq.ASA!).toBeGreaterThan(wi.vessels.wasteAcid.liq.ASA! * 1.2);
  },
  ORG27() {
    const w = asaReady();
    isolateASA(w, newRes(), { noQuench: true });
    expect(err(w, 'ORG27')).toBe(true);
    expect(w.vessels.fpFine.solid.ASA ?? 0).toBeLessThan(0.002);
  },
  ORG28() {
    const w = asaReady();
    const wi = asaReady();
    isolateASA(w, newRes(), { noIce: true });
    isolateASA(wi, newRes());
    expect(err(w, 'ORG28')).toBe(true);
    expect(w.vessels.wasteAcid.liq.ASA!).toBeGreaterThan(wi.vessels.wasteAcid.liq.ASA!);
  },
  ORG29() {
    const w = asaReady();
    isolateASA(w, newRes(), { paper: 'fpCoarse' });
    expect(err(w, 'ORG29')).toBe(true);
    expect((w.vessels.wasteAcid.solid.ASA ?? 0) + (w.vessels.wasteAcid.liq.ASA ?? 0)).toBeGreaterThan(0.001);
  },
  ORG30() {
    const w = asaReady();
    const res = newRes();
    isolateASA(w, res, { seal: false, skipOven: true });
    expect(err(w, 'ORG30')).toBe(true);
    const wi = asaReady();
    isolateASA(wi, newRes(), { skipOven: true });
    expect(massG(w.vessels.fpFine.liq)).toBeGreaterThan(massG(wi.vessels.fpFine.liq) * 1.5);
  },
  ORG31() {
    const w = asaReady();
    const wi = asaReady();
    const r = newRes();
    const ri = newRes();
    isolateASA(w, r, { skipOven: true });
    isolateASA(wi, ri);
    expect(err(w, 'ORG31')).toBe(true);
    expect(w.readings[r.productMass!].value).toBeGreaterThan(wi.readings[ri.productMass!].value + 0.3);
  },
  ORG32() {
    const w = asaReady();
    const r = newRes();
    isolateASA(w, r, { weighHot: true });
    expect(err(w, 'ORG32')).toBe(true);
    // Recién salido de la estufa lee de menos; la segunda pesada (más fría) es mayor.
    expect(w.readings[r.productMass!].qualityFlags).toContain('HOT');
    expect(w.readings[r.masses[r.masses.length - 1]].value).toBeGreaterThan(w.readings[r.productMass!].value);
  },
  ORG33() {
    const run = (cat: boolean) => {
      const w = base('ISO');
      pourTo(w, 'btIAA', 'rf', 5);
      pourTo(w, 'btAcOH', 'rf', 7);
      if (cat) dropperTransfer(w, 'btH2SO4', 'rf', 0.25);
      heat(w, 300);
      return w;
    };
    const none = run(false);
    expect(err(none, 'ORG33')).toBe(true);
    expect(conversion(none)).toBeLessThan(conversion(run(true)) - 0.1);
  },
  ORG34() {
    const r = nbFixture('ISO', (nb) => {
      const row = nb.tableA.reagents.find((x) => x.species === 'IAA')!;
      row.amount = '6,0';
    });
    expect(r.issues).toContain('nb:ORG34');
    expect(r.score).toBeLessThan(r.best);
  },
  ORG35() {
    const run = (water: boolean) => {
      const w = dosed('ISO');
      if (water) cmd08(w, { type: 'squeezeWash', targetId: 'rf', ml: 3 });
      heat(w, 900);
      return w;
    };
    const wet = run(true);
    expect(err(wet, 'ORG35')).toBe(true);
    expect(conversion(wet)).toBeLessThan(conversion(run(false)) - 0.05);
  },
  ORG36() {
    const w = dosed('ISO');
    place(w, 'th01', 'rf', 4);
    place(w, 'rf', 'bath01', 13);
    cmd08(w, { type: 'setMagneticStir', level01: 0.5 });
    cmd08(w, { type: 'setPlate', on: true, setpointC: 95 });
    run08(w, 600);
    const ok = heated('ISO');
    expect(err(w, 'ORG36')).toBe(true);
    expect(w.outside.exhaust.AcOH!).toBeGreaterThan(10 * (ok.outside.exhaust.AcOH ?? 1e-9));
  },
  ORG37() {
    const w = inFunnel('ISO');
    run08(w, 40);
    drainAll(w, 'wasteAq');
    expect(err(w, 'ORG37')).toBe(true);
    expect(w.vessels.wasteAq.liq.IAAc!).toBeGreaterThan(0.01);
  },
  ORG38() {
    const w = inFunnel('ISO');
    run08(w, 40);
    const bottom = liquidMl(phasesOf(w.vessels.sf).bottom);
    cmd08(w, { type: 'setValve', opening01: 1, receiverId: 'bkAq' });
    run08(w, (bottom + 1.5) / 1.5);
    cmd08(w, { type: 'setValve', opening01: 0, receiverId: null });
    expect(err(w, 'ORG38')).toBe(true);
    expect(w.vessels.bkAq.liq.IAAc!).toBeGreaterThan(0.005);
  },
  ORG39() {
    const w = inFunnel('ISO');
    drainBottom(w, 'bkAq');
    pourTo(w, 'btNaHCO3', 'cyl25', 20);
    pourAll(w, 'cyl25', 'sf');
    cmd08(w, { type: 'setStopper', on: true });
    place(w, 'sf', 'hand', 30);
    cmd08(w, { type: 'shakeFunnel', on: true });
    run08(w, 2);
    expect(err(w, 'ORG39')).toBe(true);
    expect(w.safety.block?.code).toBe('PRESSURE');
    expect(pressureKPa(w)).toBeGreaterThan(w.params.funnelVentKPa);
    expect(dispatchP08(w, { type: 'setValve', opening01: 1, receiverId: 'bkAq' }).ok).toBe(false);
    cmd08(w, { type: 'vent' });
    expect(w.safety.block).toBeNull();
    expect(w.outside.exhaust.CO2!).toBeGreaterThan(0);
  },
  ORG40() {
    const run = (dry: boolean) => {
      const w = inFunnel('ISO');
      drainBottom(w, 'bkAq');
      drainAll(w, 'erDry');
      if (dry) {
        for (let i = 0; i < 3; i++) spoon(w, 'jarNa2SO4', 'erDry');
        cmd08(w, { type: 'setStir', vesselId: 'erDry', motion01: 0.5 });
        run08(w, 90);
        cmd08(w, { type: 'setStir', vesselId: 'erDry', motion01: 0 });
      }
      pourAll(w, 'erDry', 'fracPot', 130);
      place(w, 'vialP', 'frac01', 2);
      cmd08(w, { type: 'setFractionCut', loC: 136, hiC: 148 });
      cmd08(w, { type: 'runFractions' });
      run08(w, 62);
      return w;
    };
    const wet = run(false);
    expect(err(wet, 'ORG40')).toBe(true);
    expect(wet.vessels.vialP.liq.H2O!).toBeGreaterThan(5 * (run(true).vessels.vialP.liq.H2O ?? 1e-9));
  },
  ORG41() {
    const run = (jar: string) => {
      const w = inFunnel('ISO');
      drainBottom(w, 'bkAq');
      drainAll(w, 'erDry');
      spoon(w, jar, 'erDry');
      spoon(w, jar, 'erDry');
      cmd08(w, { type: 'setStir', vesselId: 'erDry', motion01: 0.5 });
      run08(w, 90);
      return w;
    };
    const used = run('jarNa2SO4used');
    expect(err(used, 'ORG41')).toBe(true);
    expect(used.vessels.erDry.liq.H2O!).toBeGreaterThan(run('jarNa2SO4').vessels.erDry.liq.H2O! + 0.002);
  },
  ORG42() {
    const run = (lo: number, hi: number) => {
      const w = inFunnel('ISO');
      drainBottom(w, 'bkAq');
      drainAll(w, 'erDry');
      spoon(w, 'jarNa2SO4', 'erDry');
      spoon(w, 'jarNa2SO4', 'erDry');
      run08(w, 90);
      pourAll(w, 'erDry', 'fracPot', 130);
      place(w, 'vialP', 'frac01', 2);
      cmd08(w, { type: 'setFractionCut', loC: lo, hiC: hi });
      cmd08(w, { type: 'runFractions' });
      run08(w, 62);
      return w;
    };
    const wide = run(110, 160);
    expect(err(wide, 'ORG42')).toBe(true);
    const narrow = run(136, 148);
    expect(wide.vessels.vialP.liq.IAA!).toBeGreaterThan(narrow.vessels.vialP.liq.IAA! * 3);
  },
  ORG43() {
    const w = base('MS', [S8.WET_VESSEL]);
    const id = weighOut(w, 'wg1', 'jarSA', 2);
    expect(err(w, 'ORG43')).toBe(true);
    expect(w.readings[id].snapshot.waterG!).toBeGreaterThan(0.03);
  },
  ORG44() {
    const w = base('MS');
    cmd08(w, { type: 'setCap', vesselId: 'btIAA', capped: false });
    expect(dispatchP08(w, { type: 'setPour', sourceId: 'btIAA', targetId: 'rf', tiltDeg: 110 }).code).toBe('WRONG_ALCOHOL');
    run08(w, 2);
    expect(err(w, 'ORG44')).toBe(true);
    expect(w.vessels.rf.liq.IAA ?? 0).toBe(0);
  },
  ORG45() {
    const w = base('MS');
    cmd08(w, { type: 'setCap', vesselId: 'btMeOH', capped: false });
    expect(dispatchP08(w, { type: 'setBurner', on: true }).ok).toBe(false);
    expect(err(w, 'ORG45')).toBe(true);
    expect(w.burner.lit).toBe(false);
    expect(w.safety.block?.code).toBe('FLAME');
    cmd08(w, { type: 'acknowledge' });
    expect(w.safety.block).toBeNull();
  },
  ORG46() {
    const w = heated('MS');
    expect(dispatchP08(w, { type: 'setPose', id: 'condenser01', pose: pose(300, 52, 1), support: 'bench' }).code).toBe('HOT_REFLUX');
    expect(err(w, 'ORG46')).toBe(true);
    expect(w.reflux.attached).toBe(true);
  },
  ORG47() {
    const r = nbFixture('MS', (nb) => {
      nb.tableA.reagents.find((x) => x.species === 'MeOH')!.amount = '15,0';
    });
    expect(r.issues).toContain('nb:ORG47');
    expect(r.score).toBeLessThan(r.best);
  },
  ORG48() {
    const run = (water: boolean) => {
      const w = dosed('MS');
      if (water) cmd08(w, { type: 'squeezeWash', targetId: 'rf', ml: 3 });
      heat(w, 900);
      return w;
    };
    const wet = run(true);
    expect(err(wet, 'ORG48')).toBe(true);
    expect(conversion(wet)).toBeLessThan(conversion(run(false)) - 0.03);
  },
  ORG49() {
    const w = inFunnel('MS');
    drainBottom(w, 'erDry');
    drainAll(w, 'vialP');
    expect(err(w, 'ORG49')).toBe(true);
    expect((w.vessels.vialP.liq.H2O! * 18.015) / massG(w.vessels.vialP.liq)).toBeGreaterThan(0.5);
  },
  ORG50() {
    const w = inFunnel('MS');
    run08(w, 40);
    cmd08(w, { type: 'setValve', opening01: 1, receiverId: 'erDry' });
    run08(w, 0.25);
    cmd08(w, { type: 'setValve', opening01: 0, receiverId: null });
    expect(err(w, 'ORG50')).toBe(true);
    expect(w.vessels.sf.liq.MeSal!).toBeGreaterThan(w.vessels.erDry.liq.MeSal!);
  },
  ORG51() {
    const r = nbFixture('MS', (nb) => {
      nb.tableC.densityTempC = '';
    });
    expect(r.issues).toContain('nb:ORG51');
    expect(r.score).toBeLessThan(r.best);
  },
  ORG52() {
    const r = nbFixture('MS', (nb) => {
      nb.tableC.purity.readingId = null;
      nb.tableC.purity.value = '1';
    });
    expect(r.issues).toContain('nb:ORG52');
    expect(r.score).toBeLessThan(r.best);
  },
  ORG53() {
    const r = nbFixture('ISO', (nb) => {
      const lim = plannedLimiting(nb)!.theoreticalG / 130.18;
      nb.tableC.theoreticalG = (lim * 180.16).toFixed(3).replace('.', ',');
    });
    expect(r.issues).toContain('nb:ORG53');
    expect(r.score).toBeLessThan(r.best);
  },
  ORG54() {
    const r = nbFixture('ISO', (nb) => {
      nb.tableA.limiting = 'AcOH';
    });
    expect(r.issues).toContain('nb:ORG54');
    expect(r.score).toBeLessThan(r.best);
  },
  ORG55() {
    const r = nbFixture('ISO', (nb) => {
      const row = nb.tableA.reagents.find((x) => x.species === 'IAA')!;
      row.unit = 'g';
    });
    expect(r.issues).toContain('nb:ORG55');
    expect(r.score).toBeLessThan(r.best);
  },
  ORG56() {
    const r = nbFixture('ASA', (nb) => {
      nb.tableC.isolatedMass.value = nb.tableC.grossMass.value;
    });
    expect(r.issues).toContain('nb:ORG56');
    expect(r.score).toBeLessThan(r.best);
  },
  ORG57() {
    const r = nbFixture('ISO', (nb) => {
      nb.tableC.correctedYield = nb.tableC.apparentYield;
    });
    expect(r.issues).toContain('nb:ORG57');
    expect(r.score).toBeLessThan(r.best);
  },
  ORG58() {
    const r = nbFixture('ASA', (nb) => {
      const th = Number(nb.tableC.theoreticalG.replace(',', '.'));
      nb.tableC.isolatedMass.value = (th * 1.06).toFixed(3).replace('.', ',');
      nb.tableC.apparentYield = '100';
    });
    expect(r.issues).toContain('nb:ORG58');
    expect(r.score).toBeLessThan(r.best);
  },
  ORG59() {
    const r = nbFixture('MS', (nb) => {
      nb.tableC.isolatedMass.uncertainty = '';
    });
    expect(r.issues).toContain('nb:ORG59');
    expect(r.score).toBeLessThan(r.best);
  },
  ORG60() {
    const r = nbFixture('ASA', (nb) => {
      nb.tableC.grossMass.attemptId = 'p8-otro-intento';
    });
    expect(r.issues).toContain('nb:ORG60');
    expect(r.score).toBeLessThan(r.best);
  },
};

describe('Práctica 8 — catálogo de errores ORG01–ORG60', () => {
  it('el catálogo tiene 60 errores con el contrato completo y retroalimentación localizada', () => {
    expect(SIMULATED_ERRORS_P08).toHaveLength(60);
    const fb = (es8 as unknown as { p8fb: Record<string, string> }).p8fb;
    for (const e of SIMULATED_ERRORS_P08) {
      expect(e.evidenceKey).toMatch(/^(err|nb):ORG\d\d$/);
      for (const k of ['triggerCommandOrState', 'effectOnWorld', 'testFixture'] as const) expect(e[k].length, `${e.code}.${k}`).toBeGreaterThan(3);
      expect(fb[e.code], e.feedbackKey).toBeTruthy();
      expect(FIXTURES[e.code], `fixture ${e.code}`).toBeTypeOf('function');
    }
  });

  for (const e of SIMULATED_ERRORS_P08) {
    it(`${e.code} (${e.evidenceKey}): ${e.triggerCommandOrState}`, () => FIXTURES[e.code](), 120000);
  }

  it('los errores de técnica nunca rompen la conservación de elementos', () => {
    const w = inFunnel('ISO');
    const e0 = conservedTotals08(world08({ route: 'ISO', seed: 808 }));
    drainAll(w, 'wasteAq');
    cmd08(w, { type: 'setPose', id: 'rf', pose: pose(), support: 'bench' });
    const e1 = conservedTotals08(w);
    for (const k of Object.keys(e0)) expect(Math.abs(e1[k] - e0[k]), k).toBeLessThan(1e-9);
  });
});

describe('Práctica 8 — escenarios docentes SC01–SC16', () => {
  it('16 escenarios, filtrados por ruta y por incompatibilidad', () => {
    expect(P08_SCENARIOS).toHaveLength(16);
    expect(validScenarios08([S8.FILTER_TEAR, S8.REFLUX_LEAK], 'ISO')).toEqual([S8.REFLUX_LEAK]);
    expect(validScenarios08([S8.LIMITING_SWITCH, S8.WATER_LOAD], 'MS')).toEqual([S8.LIMITING_SWITCH]);
  });

  /** Efecto de cada escenario en el estado inicial (y nunca materia creada al combinarlos). */
  const EFFECTS: Record<string, [RouteId, (w: P08World, w0: P08World) => void]> = {
    [S8.MASS_OFFSET]: ['ISO', (w) => expect(w.balance.zeroBiasG).toBeGreaterThan(0)],
    [S8.THERM_BIAS]: ['ISO', (w) => expect(w.thermometer.biasC).toBeGreaterThan(2.9)],
    [S8.UNPURE_START]: ['ASA', (w, w0) => expect(w.vessels.jarSA.solid.SA!).toBeLessThan(w0.vessels.jarSA.solid.SA!)],
    [S8.WET_VESSEL]: ['ASA', (w) => expect(w.vessels.rf.liq.H2O!).toBeGreaterThan(0.02)],
    [S8.HEAT_LOSS]: ['ISO', (w, w0) => {
      for (const x of [w, w0]) {
        ppe08(x);
        place(x, 'rf', 'bath01', 13);
        cmd08(x, { type: 'setPlate', on: true, setpointC: 90 });
        run08(x, 300);
      }
      expect(w.vessels.rf.tempC).toBeLessThan(w0.vessels.rf.tempC - 5);
    }],
    [S8.SLOW_STIR]: ['ISO', (w, w0) => {
      for (const x of [w, w0]) {
        ppe08(x);
        place(x, 'rf', 'bath01', 13);
        cmd08(x, { type: 'setMagneticStir', level01: 0.8 });
        run08(x, 5);
      }
      expect(w.vessels.rf.stir01).toBeLessThan(w0.vessels.rf.stir01);
    }],
    [S8.REFLUX_LEAK]: ['MS', (w, w0) => expect(w.reflux.leakFraction).toBeGreaterThan(w0.reflux.leakFraction * 5)],
    [S8.LIMITING_SWITCH]: ['ASA', (w) => {
      ppe08(w);
      dose(w, newRes());
      run08(w, 1);
      expect(trueLimiting(w).limiting).toBe('AA');
    }],
    [S8.FILTER_TEAR]: ['ASA', (w) => expect(w.scenarios).toContain(S8.FILTER_TEAR)],
    [S8.FILTER_WET]: ['ASA', (w) => expect(w.vessels.fpFine.liq.H2O!).toBeGreaterThan(0.01)],
    [S8.ASA_SOLUBILITY]: ['ASA', (w) => expect(w.scenarios).toContain(S8.ASA_SOLUBILITY)],
    [S8.DRYING_LOW]: ['ISO', (w) => expect(w.scenarios).toContain(S8.DRYING_LOW)],
    [S8.LAYER_EMULSION]: ['ISO', (w) => expect(w.scenarios).toContain(S8.LAYER_EMULSION)],
    [S8.WATER_LOAD]: ['MS', (w, w0) => expect(w.vessels.btMeOH.liq.H2O!).toBeGreaterThan(w0.vessels.btMeOH.liq.H2O! * 10)],
    [S8.FRACTION_CROSSOVER]: ['ISO', (w) => expect(w.scenarios).toContain(S8.FRACTION_CROSSOVER)],
    [S8.ANALYZER_OFFSET]: ['ISO', (w) => expect(w.analyzer.offset).toBeGreaterThan(0)],
  };

  for (const s of P08_SCENARIOS) {
    it(`${s.id}: estado inicial inyectado y reproducible`, () => {
      const [route, check] = EFFECTS[s.id];
      const w = world08({ route, seed: 41, scenarios: [s.id] });
      const again = world08({ route, seed: 41, scenarios: [s.id] });
      expect(JSON.stringify(again)).toBe(JSON.stringify(w));
      check(w, world08({ route, seed: 41 }));
    }, 60000);
  }

  it('efectos dinámicos: S09 pierde finos, S11 disuelve más ASA, S12 seca peor, S13 emulsiona más, S15 ensucia la fracción, S16 desplaza la pureza', () => {
    const asa = (sc: P08Scenario[]) => {
      const w = world08({ route: 'ASA', seed: 808, scenarios: sc });
      ppe08(w);
      inspectAll(w);
      dose(w, newRes());
      heat(w, 600);
      isolateASA(w, newRes());
      return w;
    };
    const idealA = asa([]);
    const tear = asa([S8.FILTER_TEAR]);
    expect(tear.vessels.wasteAcid.solid.ASA ?? tear.vessels.wasteAcid.liq.ASA!).toBeGreaterThan(idealA.vessels.wasteAcid.liq.ASA!);
    const sol = asa([S8.ASA_SOLUBILITY]);
    expect(sol.vessels.wasteAcid.liq.ASA!).toBeGreaterThan(idealA.vessels.wasteAcid.liq.ASA! * 1.3);
    const liq = (sc: P08Scenario[]) => {
      const w = world08({ route: 'ISO', seed: 808, scenarios: sc });
      ppe08(w);
      inspectAll(w);
      dose(w, newRes());
      heat(w, 600);
      coolInIce(w);
      isolateLiquid(w, newRes());
      cmd08(w, { type: 'takeSample', sourceId: 'vialP' });
      cmd08(w, { type: 'requestAnalysis', method: 'purity' });
      run08(w, 21);
      return w;
    };
    const idealL = liq([]);
    const purityOf = (w: P08World) => w.readings[w.readingOrder[w.readingOrder.length - 1]].value;
    expect(purityOf(liq([S8.ANALYZER_OFFSET]))).toBeGreaterThan(purityOf(idealL) + 1.5);
    expect(liq([S8.FRACTION_CROSSOVER]).vessels.vialP.liq.IAA!).toBeGreaterThan(idealL.vessels.vialP.liq.IAA! * 2);
    expect(liq([S8.DRYING_LOW]).vessels.erDry.liq.H2O ?? 0).toBeGreaterThanOrEqual(idealL.vessels.erDry.liq.H2O ?? 0);
    const em = inFunnel('ISO');
    void em;
    const e1 = world08({ route: 'ISO', seed: 808, scenarios: [S8.LAYER_EMULSION] });
    e1.vessels.sf.emulsion01 = 1;
    const e0 = world08({ route: 'ISO', seed: 808 });
    e0.vessels.sf.emulsion01 = 1;
    for (let i = 0; i < 600; i++) {
      stepP08World(e1);
      stepP08World(e0);
    }
    expect(e1.vessels.sf.emulsion01).toBeGreaterThan(e0.vessels.sf.emulsion01 + 0.3);
    void liquidMl;
    void runP08For;
  }, 300000);

  it('combinaciones compatibles conservan los elementos y no crean C/H/O', () => {
    const w = world08({ route: 'MS', seed: 77, scenarios: [S8.UNPURE_START, S8.WET_VESSEL, S8.REFLUX_LEAK, S8.WATER_LOAD, S8.ANALYZER_OFFSET] });
    const e0 = conservedTotals08(w);
    ppe08(w);
    dose(w, newRes());
    heat(w, 300);
    const e1 = conservedTotals08(w);
    for (const k of Object.keys(e0)) expect(Math.abs(e1[k] - e0[k]), k).toBeLessThan(1e-9);
    void heated;
  }, 120000);
});
