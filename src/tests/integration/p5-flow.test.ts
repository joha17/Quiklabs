/**
 * Práctica 5 — §27.5 integración (recorridos completos sin escena), bloqueos de seguridad (§19.5) y catálogo de
 * errores simulables (§28-15).
 */
import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import type { P5World } from '../../simulation/stoich-world/types';
import { isLit } from '../../simulation/stoich-world/world';
import { referenceChains, theoretical } from '../../simulation/stoichiometry/stoich';
import { emptyP5Notebook, type P5Notebook } from '../../practices/practice-05/notebook';
import { REFERENCE_EQUATION } from '../../practices/practice-05/equation';
import { differences, p5StageEvidence } from '../../practices/practice-05/evidence';
import { expectedResults } from '../../practices/practice-05/expected-results';
import { practice5Machine, p5StageName } from '../../practices/practice-05/workflow.machine';
import { evaluateP5 } from '../../practices/practice-05/rubric';
import { SIMULATED_ERRORS_P5 } from '../../practices/practice-05/error-scenarios';
import {
  addSolid, balanceAndRead, burnerOff, burnerUnderSample, calibrate, cmd5, cool, gas5, heatGradually, lightBurner, mix, mount, pose, run5, step5, weighTube, world5,
} from '../helpers5';

/** Ruta ideal del estudiante (§8.1, §10, §13). Devuelve el mundo con la evidencia fijada como lo hace la app. */
function idealRoute(seed = 101) {
  const w = world5({ seed });
  const nb = emptyP5Notebook();
  const tick = () => p5StageEvidence(w, nb);
  cmd5(w, { type: 'confirmPpe' });
  for (const t of ['tube', 'balance', 'spatula_kclo3', 'spatula_mno2', 'extinguisher', 'blanket', 'estop']) cmd5(w, { type: 'inspect', target: t });
  calibrate(w);
  tick();
  weighTube(w);
  addSolid(w, 'MnO2', 0.1);
  weighTube(w);
  addSolid(w, 'KClO3', 1.5);
  weighTube(w);
  tick();
  mix(w, 14);
  mount(w);
  tick();
  burnerUnderSample(w, 0);
  lightBurner(w, 0.3, 0.35);
  heatGradually(w, 620);
  cool(w);
  weighTube(w);
  tick();
  mount(w);
  burnerUnderSample(w, 0);
  lightBurner(w, 0.3, 0.35);
  heatGradually(w, 300, { gentleS: 60 });
  cool(w);
  weighTube(w);
  tick();
  return { w, nb, tick };
}

/** El estudiante completa la libreta con sus lecturas y cálculos. */
function fillNotebook(w: P5World, nb: P5Notebook) {
  const d = differences(w);
  const e = expectedResults(w);
  const f = (v: number | null, dec = 2) => (v === null ? '' : v.toFixed(dec).replace('.', ','));
  const set = (row: keyof P5Notebook['table1'], v: number | null, mid?: string) => (nb.table1[row] = { value: f(v, 1), uncertainty: '0,05', observations: '', measurementId: mid ?? null });
  set('tubeEmpty', d.readings.tubeEmpty!.displayedMassG, d.readings.tubeEmpty!.id);
  set('tubeMnO2', d.readings.tubeMnO2!.displayedMassG, d.readings.tubeMnO2!.id);
  set('tubeMnO2KClO3', d.readings.tubeInitial!.displayedMassG, d.readings.tubeInitial!.id);
  set('heat1', d.readings.afterHeat[0].displayedMassG);
  set('heat2', d.readings.afterHeat[1].displayedMassG);
  set('constant', d.readings.afterHeat[1].displayedMassG);
  nb.table2 = {
    nKClO3: f(e.nKClO3, 4), nKClTheo: f(e.nKClTheo, 4), mKClTheo: f(e.mKClTheo, 3), nO2Theo: f(e.nO2Theo, 4), mO2Theo: f(e.mO2Theo, 3),
    mKClExp: f(e.mKClExp, 2), yieldPct: f(e.yieldPct, 1),
  };
  const ref = referenceChains(d.kclo3!);
  nb.chains = { kcl: ref.kcl.factors, o2: ref.o2.factors };
  nb.equation = structuredClone(REFERENCE_EQUATION);
  for (const k of ['q1', 'q2', 'q3', 'q4', 'q5'] as const) nb.analysis[k] = 'Respuesta argumentada con las masas medidas y la ecuación balanceada.';
}

describe('§27.5 integración — Práctica 5', () => {
  it('1. ruta ideal completa: tres pesadas, dos ciclos con masa constante, cálculos, máquina y evaluación', () => {
    const { w, nb, tick } = idealRoute();
    const d = differences(w);
    expect(d.kclo3!).toBeGreaterThanOrEqual(1.0);
    expect(d.kclo3!).toBeLessThanOrEqual(2.0);
    expect(d.readings.afterHeat).toHaveLength(2);
    expect(w.evidence.constantMass).toBeTruthy();
    const e = expectedResults(w);
    expect(e.yieldPct!).toBeGreaterThan(92);
    expect(e.yieldPct!).toBeLessThan(108);
    burnerOff(w);
    cmd5(w, { type: 'disposeResidue' });
    fillNotebook(w, nb);
    const flags = tick();
    expect(Object.entries(flags).filter(([, v]) => !v).map(([k]) => k)).toEqual([]);
    const actor = createActor(practice5Machine).start();
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    actor.send({ type: 'EVIDENCE', flags });
    expect(p5StageName(actor.getSnapshot().value)).toBe('DONE');
    const ev = evaluateP5(w, nb);
    const missed = ev.components.flatMap((c) => c.items.filter((i) => i.ok === false).map((i) => i.key));
    expect(missed).toEqual([]);
    expect(ev.total).toBeGreaterThan(0.9);
  });

  it('2. balanza sin calibrar: lecturas inválidas y sesgadas; tras calibrar, válidas', () => {
    const w = world5({ seed: 102, scenarios: ['ZERO_OFF', 'RIDERS_NOT_ZERO'] });
    const m = weighTube(w);
    expect(m.valid).toBe(false);
    expect(m.invalidReason).toBe('NOT_CALIBRATED');
    expect(calibrate(w).ok).toBe(true);
    expect(weighTube(w).valid).toBe(true);
    const ev = evaluateP5(w, emptyP5Notebook());
    expect(ev.components[1].items.find((i) => i.key === 'p5.noUncalibrated')!.ok).toBe(false);
  });

  it('3. orden incorrecto (KClO₃ antes que MnO₂) se detecta', () => {
    const w = world5({ seed: 103 });
    cmd5(w, { type: 'confirmPpe' });
    calibrate(w);
    weighTube(w);
    addSolid(w, 'KClO3', 1.4);
    addSolid(w, 'MnO2', 0.1);
    const codes = w.events.map((e) => e.code);
    expect(codes).toEqual(expect.arrayContaining(['ORDER_KCLO3_FIRST', 'MNO2_AFTER_KCLO3']));
    expect(evaluateP5(w, emptyP5Notebook()).components[1].items.find((i) => i.key === 'p5.order')!.ok).toBe(false);
  });

  it('5. calentamiento rápido: sólido expulsado, rendimiento bajo y causa explicada', () => {
    const w = world5({ seed: 105 });
    cmd5(w, { type: 'confirmPpe' });
    calibrate(w);
    weighTube(w);
    addSolid(w, 'MnO2', 0.1);
    weighTube(w);
    addSolid(w, 'KClO3', 1.6);
    weighTube(w);
    mix(w, 14);
    mount(w);
    burnerUnderSample(w, 0);
    lightBurner(w, 0.9, 0.7);
    for (let i = 0; i < 60; i++) {
      cmd5(w, { type: 'stopwatch', action: 'START' });
      run5(w, 10);
    }
    cool(w);
    weighTube(w);
    const e = expectedResults(w);
    expect(e.causes).toContain('expelled');
    expect(e.yieldPct!).toBeLessThan(93);
  });

  it('6–7. pesada caliente rechazada; KClO₃ sin descomponer explica un rendimiento > 100 %', () => {
    const w = world5({ seed: 106 });
    cmd5(w, { type: 'confirmPpe' });
    calibrate(w);
    weighTube(w);
    addSolid(w, 'MnO2', 0.1);
    weighTube(w);
    addSolid(w, 'KClO3', 1.5);
    weighTube(w);
    mix(w, 0);
    mount(w);
    burnerUnderSample(w, 0);
    lightBurner(w, 0.3, 0.35);
    heatGradually(w, 150, { gentleS: 150 });
    burnerOff(w);
    run5(w, 40);
    cmd5(w, { type: 'setPose', id: 'tube', pose: pose(420, 20, 10), support: 'tongs' });
    cmd5(w, { type: 'setPose', id: 'tube', pose: pose(70, 38, 9.5), support: 'pan' });
    const hot = balanceAndRead(w);
    expect(hot.valid).toBe(false);
    expect(hot.invalidReason).toBe('HOT_LOAD');
    cmd5(w, { type: 'setPose', id: 'tube', pose: pose(297, 42, 0.6), support: 'rack' });
    cool(w);
    weighTube(w);
    const e = expectedResults(w);
    expect(e.yieldPct!).toBeGreaterThan(100);
    expect(e.causes).toEqual(expect.arrayContaining(['unreacted', 'hotReading']));
  });

  it('8. espátula contaminada: la mezcla queda bloqueada para calentar', () => {
    const w = world5({ seed: 108, scenarios: ['GREASY_SPATULA'] });
    cmd5(w, { type: 'confirmPpe' });
    calibrate(w);
    addSolid(w, 'MnO2', 0.1);
    addSolid(w, 'KClO3', 1.3);
    expect(w.events.map((e) => e.code)).toEqual(expect.arrayContaining(['DIRTY_SPATULA_IN_OXIDANT', 'MIXTURE_CONTAMINATED']));
    mix(w, 10);
    mount(w);
    burnerUnderSample(w, 0);
    lightBurner(w, 0.3, 0.35);
    expect(isLit(w.gas)).toBe(false);
    expect(w.safety.block?.code).toBe('CONTAMINATED_MIXTURE');
    expect(cmd5(w, { type: 'acknowledge' }).ok).toBe(false);
  });

  it('9. guardado y reanudación segura; determinismo con la misma semilla', () => {
    const a = world5({ seed: 109 });
    const b = world5({ seed: 109 });
    for (const w of [a, b]) {
      cmd5(w, { type: 'confirmPpe' });
      calibrate(w);
      addSolid(w, 'MnO2', 0.1);
      addSolid(w, 'KClO3', 1.5);
      mix(w, 10);
      mount(w);
      burnerUnderSample(w, 0);
      lightBurner(w, 0.3, 0.35);
      run5(w, 120);
    }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    // Reanudar (lo hace la app): gas cerrado; la reacción no avanza con la app cerrada.
    const saved: P5World = JSON.parse(JSON.stringify(a));
    const conv0 = saved.tube.contents.KCl;
    saved.gas.burner.needleGasValve = 0;
    saved.gas.burner.tableGasValve = 0;
    for (let i = 0; i < 20; i++) step5(saved);
    expect(isLit(saved.gas)).toBe(false);
    expect(saved.tube.contents.KCl).toBeGreaterThanOrEqual(conv0);
    run5(saved, 120);
    expect(saved.tube.sampleC).toBeLessThan(a.tube.sampleC);
  });
});

describe('§19.5 bloqueos críticos', () => {
  it('boca hacia la persona, tubo agrietado y moler: se detiene sin calentar', () => {
    const w = world5({ seed: 110 });
    cmd5(w, { type: 'confirmPpe' });
    addSolid(w, 'MnO2', 0.1);
    addSolid(w, 'KClO3', 1.3);
    expect(cmd5(w, { type: 'grind' }).code).toBe('GRINDING');
    cmd5(w, { type: 'acknowledge' });
    mix(w, 10);
    mount(w, { yawDeg: 175 });
    burnerUnderSample(w, 0);
    lightBurner(w, 0.3, 0.35);
    expect(w.safety.block?.code).toBe('MOUTH_TOWARD_PERSON');
    cmd5(w, { type: 'setClamp', mouthYawDeg: 0 });
    gas5(w, { type: 'setValve', valve: 'NEEDLE', value: 0 });
    gas5(w, { type: 'setValve', valve: 'TABLE', value: 0 });
    expect(cmd5(w, { type: 'acknowledge' }).ok).toBe(true);
    const c = world5({ seed: 111, scenarios: ['CRACKED_TUBE'] });
    cmd5(c, { type: 'confirmPpe' });
    cmd5(c, { type: 'inspect', target: 'tube' });
    expect(c.events.map((e) => e.code)).toContain('TUBE_CRACK_FOUND');
    addSolid(c, 'MnO2', 0.1);
    addSolid(c, 'KClO3', 1.3);
    mount(c);
    burnerUnderSample(c, 0);
    lightBurner(c, 0.3, 0.35);
    expect(c.safety.block?.code).toBe('CRACKED_TUBE');
  });

  it('agua sobre el tubo caliente se impide; tomarlo con la mano quema', () => {
    const { w } = (() => {
      const x = world5({ seed: 112 });
      cmd5(x, { type: 'confirmPpe' });
      addSolid(x, 'MnO2', 0.1);
      addSolid(x, 'KClO3', 1.3);
      mix(x, 10);
      mount(x);
      burnerUnderSample(x, 0);
      lightBurner(x, 0.3, 0.35);
      heatGradually(x, 200, { gentleS: 200 });
      return { w: x };
    })();
    expect(cmd5(w, { type: 'waterOnTube' }).code).toBe('THERMAL_SHOCK');
    expect(cmd5(w, { type: 'setPose', id: 'tube', pose: pose(420, 20, 10), support: 'hand' }).code).toBe('BURN');
    expect(w.tube.cracked).toBe(false);
  });

  it('KClO₃ por encima de 2,0 g no se calienta (protocolo)', () => {
    const w = world5({ seed: 113 });
    cmd5(w, { type: 'confirmPpe' });
    addSolid(w, 'MnO2', 0.1);
    addSolid(w, 'KClO3', 2.6);
    mix(w, 10);
    mount(w);
    burnerUnderSample(w, 0);
    lightBurner(w, 0.3, 0.35);
    expect(w.safety.block?.code).toBe('KCLO3_OVER_LIMIT');
  });
});

describe('§28-15 errores simulables', () => {
  it('al menos 25 errores distintos producen eventos observables', () => {
    const seen = new Set<string>();
    const collect = (w: P5World) => w.events.forEach((e) => e.severity !== 'INFO' && seen.add(e.code));
    const a = world5({ seed: 120, scenarios: ['UNLEVEL', 'DRAFT', 'WET_TUBE', 'GREASY_SPATULA'] });
    cmd5(a, { type: 'confirmPpe' });
    for (const t of ['balance', 'tube', 'spatula_kclo3']) cmd5(a, { type: 'inspect', target: t });
    cmd5(a, { type: 'setPose', id: 'tube', pose: pose(70, 38, 9.5), support: 'pan' });
    cmd5(a, { type: 'turnZeroScrew', deltaG: 0.2 }); // con carga
    cmd5(a, { type: 'readBalance' }); // sin esperar / sin calibrar
    cmd5(a, { type: 'setPose', id: 'tube', pose: pose(100, 26, 0), support: 'hand' });
    cmd5(a, { type: 'readBalance' });
    cmd5(a, { type: 'setPose', id: 'weigh_paper', pose: pose(70, 38, 9.5), support: 'pan' });
    cmd5(a, { type: 'openBottle', id: 'bottle_kclo3', open: true });
    cmd5(a, { type: 'openBottle', id: 'bottle_mno2', open: true });
    cmd5(a, { type: 'scoop', spatulaId: 'spatula_mno2', bottleId: 'bottle_kclo3', amount: 'tip' }); // espátula equivocada
    cmd5(a, { type: 'returnToBottle', spatulaId: 'spatula_mno2', bottleId: 'bottle_kclo3' });
    cmd5(a, { type: 'scoop', spatulaId: 'spatula_kclo3', bottleId: 'bottle_kclo3', amount: 'small' }); // espátula sucia
    cmd5(a, { type: 'tip', spatulaId: 'spatula_kclo3', targetId: 'weigh_paper', fraction: 0.5 });
    cmd5(a, { type: 'tip', spatulaId: 'spatula_kclo3', targetId: 'bench', fraction: 0.5 });
    cmd5(a, { type: 'scoop', spatulaId: 'spatula_kclo3', bottleId: 'bottle_kclo3', amount: 'small' });
    cmd5(a, { type: 'tip', spatulaId: 'spatula_kclo3', targetId: 'tube', fraction: 1 }); // KClO₃ primero, contamina
    cmd5(a, { type: 'scoop', spatulaId: 'spatula_mno2', bottleId: 'bottle_mno2', amount: 'tip' });
    cmd5(a, { type: 'tip', spatulaId: 'spatula_mno2', targetId: 'tube', fraction: 1 });
    cmd5(a, { type: 'grind' });
    cmd5(a, { type: 'acknowledge' });
    cmd5(a, { type: 'setPose', id: 'tube', pose: pose(205, 26, 8), support: 'hand' });
    cmd5(a, { type: 'tap', strength: 1 });
    cmd5(a, { type: 'stopper', on: true });
    cmd5(a, { type: 'setClamp', grip: 0.95, angleDeg: 60, mouthYawDeg: 180 });
    cmd5(a, { type: 'setPose', id: 'tube', pose: pose(420, 33, 23), support: 'clamp' });
    burnerUnderSample(a, 0);
    lightBurner(a, 0.3, 0.35);
    collect(a);
    // Calentamiento brusco, inclinación excesiva, primer ciclo corto, pesada caliente, quemadura y agua.
    const b = world5({ seed: 121 });
    cmd5(b, { type: 'confirmPpe' });
    calibrate(b);
    addSolid(b, 'MnO2', 0.1);
    addSolid(b, 'KClO3', 1.5);
    mix(b, 12);
    mount(b, { angleDeg: 50, grip: 0.15 });
    cmd5(b, { type: 'setPose', id: 'shield', pose: pose(200, 50, 0), support: 'bench' });
    cmd5(b, { type: 'setShield', placed: false });
    burnerUnderSample(b, 0);
    lightBurner(b, 0.9, 0.7);
    for (let i = 0; i < 10; i++) run5(b, 10);
    collect(b);
    const c = world5({ seed: 122 });
    cmd5(c, { type: 'confirmPpe' });
    calibrate(c);
    addSolid(c, 'MnO2', 0.1);
    addSolid(c, 'KClO3', 1.5);
    mix(c, 12);
    mount(c, { angleDeg: 40 });
    burnerUnderSample(c, 0);
    lightBurner(c, 0.9, 0.7);
    run5(c, 120);
    cmd5(c, { type: 'waterOnTube' });
    cmd5(c, { type: 'touchTube' });
    cmd5(c, { type: 'setClamp', angleDeg: 25 });
    burnerOff(c);
    cmd5(c, { type: 'acknowledge' });
    run5(c, 30);
    cmd5(c, { type: 'setPose', id: 'tube', pose: pose(70, 38, 9.5), support: 'pan' });
    balanceAndRead(c, 4);
    run5(c, 400); // sin supervisión con llama: se apagó antes; se prueba aparte
    collect(c);
    const d = world5({ seed: 123 });
    cmd5(d, { type: 'confirmPpe' });
    addSolid(d, 'MnO2', 0.1);
    addSolid(d, 'KClO3', 1.5);
    mix(d, 12);
    mount(d);
    burnerUnderSample(d, 0);
    lightBurner(d, 0.3, 0.35);
    run5(d, 400); // nadie toca nada: corte por falta de supervisión
    collect(d);
    expect(seen.size, [...seen].sort().join(', ')).toBeGreaterThanOrEqual(25);
    const catalog = new Set(SIMULATED_ERRORS_P5.map((e) => e.code));
    expect([...seen].filter((x) => catalog.has(x)).length).toBeGreaterThanOrEqual(25);
    expect(theoretical(1).mKCl).toBeCloseTo(0.608, 3);
  });
});
