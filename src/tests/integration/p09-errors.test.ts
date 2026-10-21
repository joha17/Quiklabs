/**
 * Práctica 9 — los 50 errores E01–E50 (§9, §17 `errors:50`) y los 16 escenarios (§7). Cada error tiene una fixture
 * aislada hecha con comandos que dispara su `err:`/`nb:` y comprueba la consecuencia: estado químico, fracción,
 * instrumento o (para los de interpretación) la libreta y la nota.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { P09World } from '../../simulation/cation-analysis-world/types';
import { S9, conservedTotals09, dispatchP09, solidSplit, vesselMl } from '../../simulation/cation-analysis-world/world';
import { massG, volumeMl } from '../../simulation/cation-analysis-world/species';
import { P09_SCENARIOS, SIMULATED_ERRORS_P09, validScenarios09, type P09Scenario } from '../../practices/practice-09/error-scenarios';
import { evaluateP09, notebookIssues09 } from '../../practices/practice-09/rubric';
import type { P09Notebook } from '../../practices/practice-09/notebook';
import { FLAME_POINT, PAD_POS, rotorSlot } from '../../practices/practice-09/definition';
import {
  balanceCounter, centrifuge, cleanLoop, cmd09, decant, drops, hoodReady, idealAttempt09, loopTest, mix, padTest, pipette, place, ppe09, run09, setLight, world09,
} from '../helpers09';
import es9 from '../../locales/es/practice9.json';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const err = (w: P09World, code: string) => (w.evidence[`err:${code}`] ?? 0) > 0;
const P = (x = 0, y = 0, z = 0) => ({ x, y, z, rotationRad: 0 });

function base(scenarios: P09Scenario[] = []) {
  const w = world09({ seed: 909, scenarios });
  ppe09(w);
  hoodReady(w, 45);
  return w;
}
/** Tubo T1 con 3 mL de muestra. */
function sample(scenarios: P09Scenario[] = []) {
  const w = base(scenarios);
  pipette(w, 'smp1', 'T1', 3);
  return w;
}
const cache: Record<string, P09World> = {};
/** Muestra ya separada del Sr (sobrenadante en T2). */
function afterSr(): P09World {
  if (!cache.afterSr) {
    const w = sample();
    drops(w, 'dbSO4', 'T1', 14);
    mix(w, 'T1');
    run09(w, 30);
    balanceCounter(w, 'T1', 'T4');
    centrifuge(w, 'T1', 'T4');
    decant(w, 'T1', 'T2');
    cache.afterSr = w;
  }
  return clone(cache.afterSr);
}
/** T1 con sulfato, mezclado, en reposo, listo para centrifugar. */
function srReady(): P09World {
  if (!cache.srReady) {
    const w = sample();
    drops(w, 'dbSO4', 'T1', 14);
    mix(w, 'T1');
    run09(w, 30);
    balanceCounter(w, 'T1', 'T4');
    cache.srReady = w;
  }
  return clone(cache.srReady);
}

let ideal: ReturnType<typeof idealAttempt09>;
beforeAll(() => {
  ideal = idealAttempt09(909);
}, 120000);
function nbFixture(edit: (nb: P09Notebook) => void) {
  const nb = clone(ideal.nb);
  edit(nb);
  return { issues: notebookIssues09(ideal.w, nb), score: evaluateP09(clone(ideal.w), nb).total, best: evaluateP09(clone(ideal.w), clone(ideal.nb)).total };
}

const FIX: Record<string, () => void> = {
  E01() {
    const w = world09();
    cmd09(w, { type: 'setPPE', item: 'goggles', enabled: true });
    expect(dispatchP09(w, { type: 'startWork' }).ok).toBe(false);
    expect(err(w, 'E01')).toBe(true);
    const ml = vesselMl(w.vessels.smp1);
    expect(dispatchP09(w, { type: 'setCap', vesselId: 'smp1', capped: false }).ok).toBe(false);
    expect(vesselMl(w.vessels.smp1)).toBe(ml);
  },
  E02() {
    const w = world09();
    ppe09(w);
    expect(dispatchP09(w, { type: 'setIgnition', on: true }).code).toBe('HOOD_FLOW');
    expect(err(w, 'E02')).toBe(true);
    expect(w.flame.ignited).toBe(false);
    expect(w.safety.block?.code).toBe('IGNITION');
  },
  E03() {
    const w = base();
    cmd09(w, { type: 'setIgnition', on: true });
    cmd09(w, { type: 'setSash', heightCm: 60 });
    expect(err(w, 'E03')).toBe(true);
    expect(w.flame.ignited).toBe(false);
  },
  E04() {
    const w = base();
    loopTest(w, 'ctlSr');
    expect(Object.keys(w.flame.emitting).length).toBeGreaterThan(0);
    cmd09(w, { type: 'setHoodFan', on: false });
    expect(err(w, 'E04')).toBe(true);
    expect(w.flame.ignited).toBe(false);
    expect(w.flame.emitting).toEqual({});
  },
  E05() {
    const w = base();
    setLight(w, 45);
    expect(dispatchP09(w, { type: 'setObservationLight', pct: 20, scope: 'room' }).ok).toBe(false);
    expect(err(w, 'E05')).toBe(true);
    expect(w.hood.lightPct).toBe(45);
  },
  E06() {
    const w = base();
    setLight(w, 100);
    const bright = w.readings[loopTest(w, 'ctlK').emission];
    setLight(w, 20);
    const dim = w.readings[loopTest(w, 'ctlK').emission];
    expect(err(w, 'E06')).toBe(true);
    expect(bright.qualityFlags).toContain('AMBIENT_HIGH');
    expect(bright.value).toBeLessThan(dim.value);
  },
  E07() {
    const r = nbFixture((nb) => { nb.tableB.ctlK.color = 'crimson'; });
    expect(r.issues).toContain('nb:E07');
    expect(r.score).toBeLessThan(r.best);
  },
  E08() {
    const r = nbFixture((nb) => { nb.tableF['Sr2+'].evidenceIds = [ideal.res.atlas.ctlSr]; });
    expect(r.issues).toContain('nb:E08');
    expect(r.score).toBeLessThan(r.best);
  },
  E09() {
    const w = base();
    cmd09(w, { type: 'setCap', vesselId: 'ctlSr', capped: false });
    place(w, 'loop01', 'ctlSr', w.objects.ctlSr.pose);
    cmd09(w, { type: 'setIgnition', on: true });
    place(w, 'loop01', 'flame', FLAME_POINT);
    run09(w, 0.2);
    const r = cmd09(w, { type: 'sampleEmission', zone: 'whole' });
    expect(err(w, 'E09')).toBe(true);
    expect(w.readings[r.id!].qualityFlags).toContain('EARLY');
  },
  E10() {
    const w = base();
    const r = loopTest(w, 'ctlNa', { spectrum: 16 });
    expect(err(w, 'E10')).toBe(true);
    expect(w.readings[r.spectrum!].valid).toBe(false);
    expect(w.readings[r.spectrum!].qualityFlags).toContain('SATURATED');
  },
  E11() {
    const w = base();
    loopTest(w, 'ctlSr');
    const nb = clone(ideal.nb);
    const issues = notebookIssues09(w, nb);
    expect(issues).toContain('nb:E11');
  },
  E12() {
    const w = base([S9.DIRTY_LOOP]);
    setLight(w, 20);
    const r = w.readings[loopTest(w, 'ctlK', { clean: false }).emission];
    expect(err(w, 'E12')).toBe(true);
    expect(r.snapshot.emitters).toContain('Na+');
    expect(r.snapshot.fromResidue).toContain('Na+');
  },
  E13() {
    const w = base();
    loopTest(w, 'ctlSr');
    const r = w.readings[loopTest(w, 'ctlK', { clean: false }).emission];
    expect(err(w, 'E13')).toBe(true);
    expect(r.snapshot.emitters).toContain('Sr2+');
    expect(r.snapshot.root).toBe('ctlK');
  },
  E14() {
    const w = base();
    loopTest(w, 'ctlSr');
    loopTest(w, 'ctlK', { clean: false });
    expect(err(w, 'E14')).toBe(true);
    expect(massG(w.loop.residue)).toBeGreaterThan(0);
  },
  E15() {
    const w = base();
    loopTest(w, 'ctlSr', { waitS: 0.5 });
    run09(w, 1);
    const a = cmd09(w, { type: 'sampleEmission', zone: 'core' });
    expect(err(w, 'E15')).toBe(true);
    expect(w.readings[a.id!].qualityFlags).toContain('CORE_ONLY');
  },
  E16() {
    const r = nbFixture((nb) => { nb.tableC.glassRating = 'heatResistant'; });
    expect(r.issues).toContain('nb:E16');
    expect(r.score).toBeLessThan(r.best);
  },
  E17() {
    const w = base();
    cleanLoop(w);
    pipette(w, 'ctlSr', 'wgFlame', 0.3);
    cmd09(w, { type: 'setIgnition', on: true });
    const e0 = conservedTotals09(w);
    place(w, 'wgFlame', 'flamePad', PAD_POS);
    run09(w, 30);
    expect(err(w, 'E17')).toBe(true);
    expect(w.flame.glassCracked).toBe(true);
    expect(massG(w.outside.hoodTray)).toBeGreaterThanOrEqual(0);
    const e1 = conservedTotals09(w);
    for (const k of Object.keys(e0)) expect(Math.abs(e1[k] - e0[k]), k).toBeLessThan(1e-12);
  },
  E18() {
    const w = base([S9.SUPPORT_RESIDUE]);
    cleanLoop(w);
    pipette(w, 'ctlK', 'wgFlame', 0.2);
    expect(err(w, 'E18')).toBe(true);
    cmd09(w, { type: 'setIgnition', on: true });
    place(w, 'wgFlame', 'flamePad', PAD_POS);
    run09(w, 2);
    const r = cmd09(w, { type: 'sampleEmission', zone: 'whole' });
    expect(w.readings[r.id!].snapshot.emitters).toContain('Sr2+');
  },
  E19() {
    const w = base();
    loopTest(w, 'ctlSr');
    const nb = clone(ideal.nb);
    expect(notebookIssues09(w, nb)).toContain('nb:E19');
  },
  E20() {
    const w = base();
    const r = dispatchP09(w, { type: 'sampleEmission', zone: 'whole' });
    expect(r.ok).toBe(false);
    expect(err(w, 'E20')).toBe(true);
    expect(w.readings[r.id!].qualityFlags).toContain('NO_FLAME');
  },
  E21() {
    const w = base();
    pipette(w, 'ctlSr', 'T1', 1);
    cmd09(w, { type: 'setLabel', vesselId: 'T1', label: 'K' });
    expect(err(w, 'E21')).toBe(true);
    expect(w.vessels.T1.liq['Sr2+']).toBeGreaterThan(0);
    expect(w.vessels.T1.liq['K+'] ?? 0).toBe(0);
  },
  E22() {
    const w = base();
    pipette(w, 'smp1', 'cyl10', 3);
    const r = cmd09(w, { type: 'readVolume', vesselId: 'cyl10', eyeDzCm: 3 }, false);
    expect(err(w, 'E22')).toBe(true);
    expect(Math.abs(w.readings[r.id!].value - w.readings[r.id!].trueValue)).toBeGreaterThan(0.05);
  },
  E23() {
    const w = world09({ seed: 909, scenarios: [S9.SULFATE_CLOGGED] });
    ppe09(w);
    pipette(w, 'smp1', 'T1', 3);
    drops(w, 'dbSO4', 'T1', 14);
    const nb = clone(ideal.nb);
    nb.tableD.sr = { ...nb.tableD.sr, tube: 'T1', drops: '14', volumeAdded: { value: '0,70', uncertainty: '', readingId: null } };
    expect(notebookIssues09(w, nb)).toContain('nb:E23');
    expect(w.evidence['vol:T1:dbSO4']).toBeLessThan(0.5);
  },
  E24() {
    const w = base();
    cmd09(w, { type: 'setCap', vesselId: 'smp1', capped: false });
    place(w, 'pip', 'smp1', { ...w.objects.smp1.pose, z: 1 });
    cmd09(w, { type: 'setPipette', squeeze01: -1 });
    run09(w, 2);
    cmd09(w, { type: 'setPipette', squeeze01: 0 });
    place(w, 'pip', 'T1', { ...w.objects.T1.pose, z: 5 });
    cmd09(w, { type: 'setPipette', squeeze01: 1 });
    run09(w, 0.5);
    cmd09(w, { type: 'setPipette', squeeze01: 0 });
    place(w, 'pip', 'bench', P(386, 12, 0.5));
    expect(err(w, 'E24')).toBe(true);
    expect(vesselMl(w.vessels.T1)).toBeLessThan(1);
    expect(volumeMl(w.pipette.content)).toBeGreaterThan(1);
  },
  E25() {
    const w = base();
    pipette(w, 'smp1', 'bk1', 4);
    cmd09(w, { type: 'setPour', sourceId: 'bk1', targetId: 'T1', tiltDeg: 140 });
    run09(w, 1);
    cmd09(w, { type: 'stopPour', sourceId: 'bk1' });
    expect(err(w, 'E25')).toBe(true);
    expect(massG(w.outside.bench)).toBeGreaterThan(0);
  },
  E26() {
    const w = sample();
    drops(w, 'dbSO4', 'T1', 3);
    mix(w, 'T1');
    run09(w, 30);
    decant(w, 'T1', 'T2');
    expect(err(w, 'E26')).toBe(true);
    expect(w.vessels.T2.liq['Sr2+']).toBeGreaterThan(1e-5);
  },
  E27() {
    const w = base();
    pipette(w, 'smp1', 'T1', 1);
    drops(w, 'dbSO4', 'T1', 20);
    mix(w, 'T1');
    run09(w, 20);
    expect(err(w, 'E27')).toBe(true);
    expect(w.vessels.T1.solid['SrSO4(s)']!).toBeLessThanOrEqual(4e-5 + 1e-12);
    expect(w.vessels.T1.liq['SO4^2-']!).toBeGreaterThan(1e-4);
  },
  E28() {
    const run = (mixIt: boolean) => {
      const w = sample();
      drops(w, 'dbSO4', 'T1', 14);
      if (mixIt) mix(w, 'T1', 1);
      run09(w, 2);
      decant(w, 'T1', 'T2');
      return w;
    };
    const lazy = run(false);
    expect(err(lazy, 'E28')).toBe(true);
    expect(lazy.vessels.T2.liq['Sr2+']!).toBeGreaterThan(run(true).vessels.T2.liq['Sr2+'] ?? 0);
  },
  E29() {
    const w = sample();
    drops(w, 'dbSO4', 'T1', 14);
    mix(w, 'T1', 0.2);
    decant(w, 'T1', 'T2');
    expect(err(w, 'E29')).toBe(true);
    // El Sr²⁺ que faltaba precipitar se fue con el sobrenadante (y sigue precipitando allí).
    expect((w.vessels.T2.liq['Sr2+'] ?? 0) + (w.vessels.T2.solid['SrSO4(s)'] ?? 0)).toBeGreaterThan(1e-6);
  },
  E30() {
    const r = nbFixture((nb) => { nb.tableF['Fe3+'].evidenceIds = [ideal.res.turbidity[1]]; });
    expect(r.issues).toContain('nb:E30');
    expect(r.score).toBeLessThan(r.best);
  },
  E31() {
    const w = sample();
    drops(w, 'dbOH', 'T1', 22);
    mix(w, 'T1');
    run09(w, 20);
    expect(err(w, 'E31')).toBe(true);
    expect(w.vessels.T1.solid['FeOH3(s)']!).toBeGreaterThan(0);
    expect(w.vessels.T1.liq['Sr2+']!).toBeGreaterThan(0);
  },
  E32() {
    const w = afterSr();
    drops(w, 'dbOH', 'T2', 10);
    mix(w, 'T2');
    run09(w, 30);
    decant(w, 'T2', 'T3');
    expect(err(w, 'E32')).toBe(true);
    expect(err(w, 'E35')).toBe(false);
    expect(w.vessels.T3.liq['Fe3+']!).toBeGreaterThan(1e-6);
  },
  E33() {
    const w = sample();
    drops(w, 'dbH2O', 'T1', 14);
    mix(w, 'T1');
    run09(w, 20);
    expect(err(w, 'E33')).toBe(true);
    expect(w.vessels.T1.solid['SrSO4(s)'] ?? 0).toBe(0);
  },
  E34() {
    const w = world09({ seed: 909, scenarios: [S9.ALKALI_CONTAMINATED] });
    ppe09(w);
    pipette(w, 'smp1', 'T2', 1);
    drops(w, 'dbOH', 'T2', 10);
    expect(err(w, 'E34')).toBe(true);
    expect(w.vessels.T2.liq['Na+']!).toBeGreaterThan(0);
  },
  E35() {
    const w = afterSr();
    drops(w, 'dbOH', 'T2', 4);
    mix(w, 'T2');
    run09(w, 30);
    decant(w, 'T2', 'T3');
    expect(err(w, 'E35')).toBe(true);
    expect(w.vessels.T3.liq['Fe3+']!).toBeGreaterThan(1e-6);
  },
  E36() {
    const w = sample();
    place(w, 'T1', 'cf:0', rotorSlot(0));
    place(w, 'T4', 'cf:2', rotorSlot(2));
    cmd09(w, { type: 'setLid', closed: true });
    expect(dispatchP09(w, { type: 'spin', seconds: 60 }).code).toBe('IMBALANCE');
    expect(err(w, 'E36')).toBe(true);
    expect(w.centrifuge.targetRpm).toBe(0);
  },
  E37() {
    const w = sample();
    place(w, 'T1', 'cf:0', rotorSlot(0));
    cmd09(w, { type: 'setLid', closed: true });
    expect(dispatchP09(w, { type: 'spin', seconds: 60 }).code).toBe('ASYMMETRIC');
    expect(err(w, 'E37')).toBe(true);
  },
  E38() {
    const w = srReady();
    place(w, 'T1', 'cf:0', rotorSlot(0));
    place(w, 'T4', 'cf:2', rotorSlot(2));
    expect(dispatchP09(w, { type: 'spin', seconds: 60 }).code).toBe('LID_OPEN');
    expect(err(w, 'E38')).toBe(true);
  },
  E39() {
    const w = srReady();
    place(w, 'T1', 'cf:0', rotorSlot(0));
    place(w, 'T4', 'cf:2', rotorSlot(2));
    cmd09(w, { type: 'setLid', closed: true });
    cmd09(w, { type: 'spin', seconds: 60 });
    run09(w, 3);
    expect(dispatchP09(w, { type: 'setLid', closed: false }).ok).toBe(false);
    expect(err(w, 'E39')).toBe(true);
    expect(w.centrifuge.lidClosed).toBe(true);
  },
  E40() {
    const run = (s: number) => {
      const w = srReady();
      centrifuge(w, 'T1', 'T4', s);
      decant(w, 'T1', 'T2');
      return w;
    };
    const short = run(5);
    expect(err(short, 'E40')).toBe(true);
    expect(short.vessels.T2.solid['SrSO4(s)']!).toBeGreaterThan(3 * (run(60).vessels.T2.solid['SrSO4(s)'] ?? 1e-12));
  },
  E41() {
    const w = srReady();
    centrifuge(w, 'T1', 'T4');
    cmd09(w, { type: 'setStir', vesselId: 'T1', motion01: 0.6 });
    expect(err(w, 'E41')).toBe(true);
    expect(w.vessels.T1.suspended['SrSO4(s)']).toBe(1);
  },
  E42() {
    const w = srReady();
    centrifuge(w, 'T1', 'T4');
    cmd09(w, { type: 'setPour', sourceId: 'T1', targetId: 'T2', tiltDeg: 130 });
    run09(w, 3);
    cmd09(w, { type: 'stopPour', sourceId: 'T1' });
    expect(err(w, 'E42')).toBe(true);
    expect(w.vessels.T2.solid['SrSO4(s)']!).toBeGreaterThan(5e-6);
  },
  E43() {
    const w = afterSr();
    cmd09(w, { type: 'dispose', vesselId: 'T2', targetId: 'wasteLiq' });
    expect(err(w, 'E43')).toBe(true);
    expect(w.vessels.wasteLiq.liq['K+']!).toBeGreaterThan(1e-4);
  },
  E44() {
    const w = srReady();
    centrifuge(w, 'T1', 'T4');
    place(w, 'pip', 'T1', { ...w.objects.T1.pose, z: w.objects.T1.pose.z + 0.6 });
    cmd09(w, { type: 'setPipette', squeeze01: -1 });
    run09(w, 1);
    cmd09(w, { type: 'setPipette', squeeze01: 0 });
    expect(err(w, 'E44')).toBe(true);
    expect(massG(w.pipette.solid)).toBeGreaterThan(0);
    expect(solidSplit(w.vessels.T1).pellet).toBeLessThan(1.2e-4);
  },
  E45() {
    const r = nbFixture((nb) => { nb.tableE.reserveTube = ''; });
    expect(r.issues).toContain('nb:E45');
    expect(r.score).toBeLessThan(r.best);
  },
  E46() {
    const r = nbFixture((nb) => { nb.tableF.kCharge = '+2'; });
    expect(r.issues).toContain('nb:E46');
    expect(r.score).toBeLessThan(r.best);
  },
  E47() {
    const r = nbFixture((nb) => { nb.tableD.fe.nuAnion = '1'; });
    expect(r.issues).toContain('nb:E47');
    expect(r.score).toBeLessThan(r.best);
  },
  E48() {
    const r = nbFixture((nb) => { nb.explanation = 'El sólido blanco se formó porque el agua se evaporó durante el reposo del tubo en la gradilla.'; });
    expect(r.issues).toContain('nb:E48');
    expect(r.score).toBeLessThan(r.best);
  },
  E49() {
    const r = nbFixture((nb) => { nb.tableB.ctlSr.lightPct = ''; });
    expect(r.issues).toContain('nb:E49');
    expect(r.score).toBeLessThan(r.best);
  },
  E50() {
    const r = nbFixture((nb) => { nb.tableF['K+'] = { ...nb.tableF['K+'], status: 'notDetected', limitation: 'No hay potasio.' }; });
    expect(r.issues).toContain('nb:E50');
    expect(r.score).toBeLessThan(r.best);
  },
};

describe('Práctica 9 — catálogo de errores E01–E50', () => {
  it('el catálogo tiene 50 errores con contrato completo y retroalimentación localizada', () => {
    expect(SIMULATED_ERRORS_P09).toHaveLength(50);
    const fb = (es9 as unknown as { p9fb: Record<string, string> }).p9fb;
    for (const e of SIMULATED_ERRORS_P09) {
      expect(e.evidenceKey).toMatch(/^(err|nb):E\d\d$/);
      expect(fb[e.code], e.feedbackKey).toBeTruthy();
      expect(FIX[e.code], `fixture ${e.code}`).toBeTypeOf('function');
    }
  });
  for (const e of SIMULATED_ERRORS_P09) it(`${e.code} (${e.evidenceKey}): ${e.trigger}`, () => FIX[e.code](), 60000);
});

describe('Práctica 9 — escenarios S01–S16', () => {
  it('16 escenarios; las composiciones incompatibles se descartan', () => {
    expect(P09_SCENARIOS).toHaveLength(16);
    expect(validScenarios09([S9.ONLY_K, S9.NO_SR])).toEqual([S9.ONLY_K]);
  });
  const EFFECT: Record<string, (w: P09World) => void> = {
    [S9.COMPLETE]: (w) => expect(w.unknown.cations).toEqual(['Sr2+', 'Fe3+', 'K+']),
    [S9.NO_SR]: (w) => expect(w.vessels.smp1.liq['Sr2+'] ?? 0).toBe(0),
    [S9.NO_FE]: (w) => expect(w.vessels.smp1.liq['Fe3+'] ?? 0).toBe(0),
    [S9.NO_K]: (w) => expect(w.vessels.smp1.liq['K+'] ?? 0).toBe(0),
    [S9.ONLY_K]: (w) => expect(w.unknown.cations).toEqual(['K+']),
    [S9.NA_CONTAMINANT]: (w) => expect(w.vessels.smp1.liq['Na+']!).toBeGreaterThan(0),
    [S9.DIRTY_LOOP]: (w) => expect(w.loop.residue['Na+']!).toBeGreaterThan(0),
    [S9.SUPPORT_RESIDUE]: (w) => expect(w.vessels.wgFlame.solid['Sr2+']!).toBeGreaterThan(0),
    [S9.SULFATE_CLOGGED]: (w) => {
      ppe09(w);
      pipette(w, 'smp1', 'T1', 1);
      drops(w, 'dbSO4', 'T1', 10);
      expect(w.evidence['vol:T1:dbSO4']).toBeLessThan(0.35);
    },
    [S9.ALKALI_CONTAMINATED]: (w) => expect(w.vessels.dbOH.liq['Na+']!).toBeGreaterThan(0),
    [S9.MISLABELED]: (w) => {
      expect(w.vessels.T1.label).toBe('Sr');
      expect(w.vessels.T1.liq['Fe3+']!).toBeGreaterThan(0);
    },
    [S9.UNBALANCED]: (w) => expect(vesselMl(w.vessels.T8)).toBeGreaterThan(0.5),
    [S9.SLOW_SETTLING]: (w) => expect(w.scenarios).toContain(S9.SLOW_SETTLING),
    [S9.BRIGHT_ROOM]: (w) => {
      ppe09(w);
      hoodReady(w, 20);
      setLight(w, 20);
      const r = w.readings[loopTest(w, 'ctlK').emission];
      expect(r.snapshot.lightPct).toBeGreaterThan(20);
    },
    [S9.LOW_FLOW]: (w) => {
      ppe09(w);
      hoodReady(w);
      expect(dispatchP09(w, { type: 'setIgnition', on: true }).ok).toBe(false);
    },
    [S9.NEAR_LIMIT]: (w) => expect(w.vessels.smp1.liq['K+']!).toBeLessThan(2e-4),
  };
  for (const s of P09_SCENARIOS) {
    it(`${s.id}: estado inicial reproducible y sin violar el balance`, () => {
      const w = world09({ seed: 41, scenarios: [s.id] });
      expect(JSON.stringify(world09({ seed: 41, scenarios: [s.id] }))).toBe(JSON.stringify(w));
      expect(Math.abs(conservedTotals09(w).charge)).toBeLessThan(1e-12);
      EFFECT[s.id](w);
    }, 60000);
  }

  it('S13: la sedimentación incompleta deja más sólido en suspensión tras el mismo centrifugado', () => {
    const run = (sc: P09Scenario[]) => {
      const w = sample(sc);
      drops(w, 'dbSO4', 'T1', 14);
      mix(w, 'T1');
      run09(w, 30);
      balanceCounter(w, 'T1', 'T4');
      centrifuge(w, 'T1', 'T4', 20);
      return solidSplit(w.vessels.T1).susp;
    };
    expect(run([S9.SLOW_SETTLING])).toBeGreaterThan(5 * run([]));
    void padTest;
  }, 60000);
});
