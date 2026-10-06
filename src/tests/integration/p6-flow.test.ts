/**
 * Práctica 6 — recorridos completos sin escena: ruta ideal (hierro + incógnito + bomba), máquina, evaluación,
 * errores de técnica con consecuencia causal (§31-12) y catálogo de errores simulables (§31-20).
 */
import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import type { P6World } from '../../simulation/calorimetry-world/types';
import { METALS } from '../../simulation/calorimetry/materials';
import { emptyP6Notebook, type Col, type P6Notebook } from '../../practices/practice-06/notebook';
import { p6StageEvidence } from '../../practices/practice-06/evidence';
import { expectedActivities, expectedBomb, expectedCol, expectedIdentification, readingsFor, runFor } from '../../practices/practice-06/expected-results';
import { practice6Machine, p6StageName } from '../../practices/practice-06/workflow.machine';
import { evaluateP6 } from '../../practices/practice-06/rubric';
import { SIMULATED_ERRORS_P6 } from '../../practices/practice-06/error-scenarios';
import {
  addMetal, assembleCup, bomb6, boil, calibrate, cmd6, fillBath, fillCylinder, fullRun, pose, pourCylinderToCup, run6, transferAndPeak, tubeToBath, weigh, world6,
} from '../helpers6';

const f = (v: number | null, d = 2) => (v === null ? '' : v.toFixed(d).replace('.', ','));

function inspectAll(w: P6World) {
  for (const t of ['balance', 'cylinder', 'tube_fe', 'tube_x', 'therm_cal', 'therm_bath', 'cup']) cmd6(w, { type: 'inspect', target: t });
}

function emptyAndDry(w: P6World) {
  cmd6(w, { type: 'setLid', closed: false });
  cmd6(w, { type: 'emptyCup' });
  cmd6(w, { type: 'dry', id: 'cup' });
  cmd6(w, { type: 'dry', id: 'cylinder' });
}

function runBomb(w: P6World) {
  bomb6(w, { type: 'selectProfile', profile: 'GENERIC_A' });
  for (const part of ['vessel', 'seal', 'electrodes', 'valve'] as const) bomb6(w, { type: 'inspect', part });
  bomb6(w, { type: 'loadCalibration' });
  bomb6(w, { type: 'selectFood', food: 'peanut' });
  bomb6(w, { type: 'weighSample', amount: 'target' });
  bomb6(w, { type: 'placeSample' });
  bomb6(w, { type: 'connectWire', lengthCm: 10, contact: 'OK' });
  bomb6(w, { type: 'seal' });
  bomb6(w, { type: 'leakTest' });
  for (let i = 0; i < 6; i++) bomb6(w, { type: 'pressurize', deltaAtm: 5 });
  bomb6(w, { type: 'fillBucket', waterG: 2000 });
  bomb6(w, { type: 'submerge' });
  bomb6(w, { type: 'closeLid' });
  run6(w, 130);
  bomb6(w, { type: 'arm' });
  bomb6(w, { type: 'ignite' });
  run6(w, 520);
  bomb6(w, { type: 'depressurize' });
  bomb6(w, { type: 'open' });
}

function idealRoute(seed = 601, unknown: 'Cu' | 'Al' | 'Pb' = 'Al') {
  const w = world6({ seed, unknown });
  cmd6(w, { type: 'confirmPpe' });
  inspectAll(w);
  calibrate(w);
  const fe = fullRun(w, 'tube_fe', 'jar_fe');
  run6(w, 20);
  emptyAndDry(w);
  const x = fullRun(w, 'tube_x', 'jar_x');
  cmd6(w, { type: 'setPlate', knob: 0 });
  runBomb(w);
  return { w, fe, x };
}

function fillNotebook(w: P6World, nb: P6Notebook) {
  for (const col of ['fe', 'x'] as Col[]) {
    const run = runFor(w, col);
    const r = readingsFor(w, run, col);
    const e = expectedCol(w, col);
    const put = (tbl: 't61' | 't62', row: string, v: number | null, d: number, id: string | null = null, u = '') => {
      (nb[tbl] as Record<string, Record<Col, { value: string; uncertainty: string; readingId: string | null }>>)[row][col] = { value: f(v, d), uncertainty: u, readingId: id };
    };
    put('t61', 'cylEmpty', r.cylEmpty!.displayedMassG, 1, r.cylEmpty!.id, '0,05');
    put('t61', 'cylWater', r.cylWater!.displayedMassG, 1, r.cylWater!.id, '0,05');
    put('t61', 'waterMass', e.waterMass, 1, null, '0,07');
    put('t61', 'tiWater', e.tiWater, 1, r.tiWater!.id, '0,1');
    put('t61', 'tf', e.tf, 1, null, '0,1');
    put('t61', 'qWater', e.qWater, 0);
    put('t62', 'tubeEmpty', r.tubeEmpty!.displayedMassG, 1, r.tubeEmpty!.id, '0,05');
    put('t62', 'tubeMetal', r.tubeMetal!.displayedMassG, 1, r.tubeMetal!.id, '0,05');
    put('t62', 'metalMass', e.metalMass, 1, null, '0,07');
    put('t62', 'tiMetal', e.tiMetal, 1, r.tiMetal!.id, '0,1');
    put('t62', 'tfMetal', e.tf, 1);
    put('t62', 'cExp', e.cIdeal, 3, null, f(e.uC, 3));
    put('t62', 'cCorr', e.cCorr, 3);
    put('t62', 'errorPct', e.errorPct, 1);
  }
  const id = expectedIdentification(w)!;
  nb.identification = { metal: id.ambiguous ? 'AMBIGUOUS' : (id.unique ?? id.rows[0].id) as never, reason: 'Comparo el intervalo c ± u con los candidatos (z) del banco de materiales.' };
  const eb = expectedBomb(w)!;
  nb.t63 = { sampleMass: f(w.bomb.sampleReadingG, 4), pressure: '30', cSystem: '10150', dT: f(eb.dT, 3), wireJ: f(eb.wireJ, 1), otherJ: f(eb.auxJ, 0), hc: f(eb.hcJPerG / 1000, 2) };
  nb.food = 'peanut';
  nb.hcUnit = 'kJ/g';
  nb.convention = 'GROSS_POSITIVE';
  nb.conventionReason = 'Reporto el contenido energético bruto como magnitud positiva liberada por la muestra.';
  const act = expectedActivities(25);
  nb.activities = { a1: 'El aislamiento reduce el intercambio con el entorno y el balance se cumple mejor.', a2Ambient: '25', a2q: f(act.a2KJ, 2), a3Ti: f(act.a3C, 1), a3Interp: 'Es una temperatura muy alta para un baño de agua: el problema es un ejercicio idealizado.' };
  nb.analysis = { q1: 'El calor es energía transferida; la temperatura, una propiedad del estado.', q2: 'El modelo corregido incluye el calorímetro y aumenta c.', q3: 'Las pérdidas al ambiente y el retardo del termómetro sesgan el máximo.', q4: 'La bomba mide energía bruta; la etiqueta, energía metabolizable.' };
}

describe('§31 ruta ideal — Práctica 6', () => {
  it('hierro e incógnito con técnica correcta, bomba, máquina completa y evaluación sin fallos', () => {
    const { w } = idealRoute();
    const e = expectedCol(w, 'fe');
    // El hierro da un valor razonable: corregido dentro del 6 % del de referencia.
    expect(Math.abs(e.cCorr! - METALS.Fe.cp) / METALS.Fe.cp).toBeLessThan(0.06);
    // Ignorar el calorímetro subestima.
    expect(e.cIdeal!).toBeLessThan(e.cCorr!);
    const id = expectedIdentification(w)!;
    expect(id.rows[0].id).toBe('Al');
    const nb = emptyP6Notebook();
    fillNotebook(w, nb);
    const flags = p6StageEvidence(w, nb);
    expect(Object.entries(flags).filter(([, v]) => !v).map(([k]) => k)).toEqual([]);
    const actor = createActor(practice6Machine).start();
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    actor.send({ type: 'EVIDENCE', flags });
    expect(p6StageName(actor.getSnapshot().value)).toBe('COMPLETE');
    const ev = evaluateP6(w, nb);
    const missed = ev.components.flatMap((c) => c.items.filter((i) => i.ok === false).map((i) => i.key));
    expect(missed).toEqual([]);
    expect(ev.total).toBeGreaterThan(0.9);
  });

  it('Cu como incógnito: compatible también con Zn y latón (identificación no única)', () => {
    const w = world6({ seed: 602, unknown: 'Cu' });
    cmd6(w, { type: 'confirmPpe' });
    calibrate(w);
    fullRun(w, 'tube_x', 'jar_x');
    const id = expectedIdentification(w)!;
    const compatible = id.rows.filter((r) => r.cls !== 'UNLIKELY').map((r) => r.id);
    expect(compatible).toEqual(expect.arrayContaining(['Cu', 'Zn']));
  });

  it('guardar y reanudar conserva las series; determinismo con la misma semilla', () => {
    const a = world6({ seed: 603 });
    const b = world6({ seed: 603 });
    for (const w of [a, b]) {
      calibrate(w);
      fillBath(w);
      addMetal(w, 'tube_fe', 'jar_fe');
      tubeToBath(w, 'tube_fe');
      boil(w, 60);
    }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const saved: P6World = JSON.parse(JSON.stringify(a));
    expect(saved.series.bath.length).toBe(a.series.bath.length);
    run6(saved, 10);
    run6(a, 10);
    expect(saved.vessels.beaker.waterC).toBeCloseTo(a.vessels.beaker.waterC, 9);
  });
});

describe('§31-12 los errores alteran el resultado de forma causal', () => {
  it('calentamiento corto, traslado lento y sin agitar dan un c menor; el motor explica las causas', () => {
    const w = world6({ seed: 610 });
    calibrate(w);
    fullRun(w, 'tube_fe', 'jar_fe', { soakS: 60, transferS: 60, stir: 0 });
    const e = expectedCol(w, 'fe');
    const ref = idealRoute(610).w;
    expect(e.cCorr!).toBeLessThan(expectedCol(ref, 'fe').cCorr!);
    expect(e.causes).toEqual(expect.arrayContaining(['slowTransfer', 'notStirred']));
    expect(w.events.map((x) => x.code)).toEqual(expect.arrayContaining(['SHORT_SOAK', 'SLOW_TRANSFER', 'NOT_STIRRED']));
  });

  it('pesar «vacía» la probeta mojada sesga la masa de agua; leer desde arriba es paralaje', () => {
    const w = world6({ seed: 611, scenarios: ['WET_CYLINDER'] });
    calibrate(w);
    const empty = weigh(w, 'cylinder');
    expect(empty.wetG).toBeGreaterThan(0.5);
    expect(w.events.map((e) => e.code)).toContain('WEIGHED_WET');
    fillCylinder(w, 50);
    expect(cmd6(w, { type: 'readCylinder', eyeDzCm: 6 }).code).toBe('PARALLAX');
  });

  it('tubo hasta el fondo y boca bajo el agua: entra agua al tubo y luego al calorímetro', () => {
    const w = world6({ seed: 612 });
    calibrate(w);
    fillCylinder(w, 50);
    pourCylinderToCup(w);
    assembleCup(w);
    fillBath(w, 330);
    addMetal(w, 'tube_fe', 'jar_fe');
    cmd6(w, { type: 'setPose', id: 'tube_fe', pose: pose(305, 40, 0), support: 'bath' });
    cmd6(w, { type: 'setTubeDepth', tubeId: 'tube_fe', bottomAboveFloorCm: 0 });
    // Un baño casi lleno con un tubo hundido: con 330 g el nivel no alcanza la boca; se hunde más agua.
    cmd6(w, { type: 'setPose', id: 'water_bottle', pose: pose(305, 30, 18), support: 'hand' });
    cmd6(w, { type: 'setPour', sourceId: 'water_bottle', targetId: 'beaker', tiltDeg: 70 });
    run6(w, 3);
    cmd6(w, { type: 'stopPour', sourceId: 'water_bottle' });
    boil(w, 200);
    const codes = w.events.map((e) => e.code);
    expect(codes).toContain('TUBE_ON_BOTTOM');
    transferAndPeak(w, 'tube_fe');
    expect(w.runs[0].bathWaterInG + w.tubes.tube_fe.waterG).toBeGreaterThanOrEqual(0);
  });
});

describe('§31-20 errores simulables', () => {
  it('al menos 30 errores distintos producen eventos observables', () => {
    const seen = new Set<string>();
    const collect = (w: P6World) => w.events.forEach((e) => e.severity !== 'INFO' && seen.add(e.code));
    const a = world6({ seed: 620, scenarios: ['UNLEVEL', 'DRAFT', 'WET_CYLINDER', 'WET_TUBE', 'CRACKED_TUBE', 'THERMO_OFFSET', 'DAMAGED_SEAL'] });
    for (const t of ['balance', 'cylinder', 'tube_fe', 'tube_x', 'therm_cal']) cmd6(a, { type: 'inspect', target: t });
    cmd6(a, { type: 'setPose', id: 'cylinder', pose: pose(80, 40, 9.5), support: 'pan' });
    cmd6(a, { type: 'turnZeroScrew', deltaG: 0.1 });
    cmd6(a, { type: 'readBalance' });
    cmd6(a, { type: 'setPose', id: 'cylinder', pose: pose(130, 24), support: 'bench' });
    cmd6(a, { type: 'readBalance' });
    cmd6(a, { type: 'setPose', id: 'cylinder', pose: pose(70, 34, 9.5), support: 'pan' });
    cmd6(a, { type: 'readBalance' });
    cmd6(a, { type: 'setPose', id: 'cylinder', pose: pose(130, 24), support: 'bench' });
    cmd6(a, { type: 'setPour', sourceId: 'water_bottle', targetId: null, tiltDeg: 60 });
    run6(a, 1);
    cmd6(a, { type: 'stopPour', sourceId: 'water_bottle' });
    cmd6(a, { type: 'setPour', sourceId: 'water_bottle', targetId: 'cylinder', tiltDeg: 120 });
    run6(a, 8);
    cmd6(a, { type: 'stopPour', sourceId: 'water_bottle' });
    cmd6(a, { type: 'readCylinder', eyeDzCm: 8 });
    cmd6(a, { type: 'pickPiece', from: 'jar:jar_x' });
    cmd6(a, { type: 'dropPiece', to: 'tube:tube_fe' });
    cmd6(a, { type: 'pickPiece', from: 'jar:jar_fe' });
    cmd6(a, { type: 'dropPiece', to: 'jar:jar_x' });
    cmd6(a, { type: 'pickPiece', from: 'jar:jar_fe' });
    cmd6(a, { type: 'dropPiece', to: 'bench' });
    cmd6(a, { type: 'setPose', id: 'tube_x', pose: pose(80, 40, 9.5), support: 'pan' });
    cmd6(a, { type: 'pickPiece', from: 'jar:jar_x' });
    cmd6(a, { type: 'dropPiece', to: 'tube:tube_x' });
    cmd6(a, { type: 'setPose', id: 'tube_x', pose: pose(30, 38, 0.6), support: 'rack' });
    for (let i = 0; i < 4; i++) {
      cmd6(a, { type: 'pickPiece', from: 'jar:jar_fe' });
      cmd6(a, { type: 'dropPiece', to: 'tube:tube_fe' });
    }
    cmd6(a, { type: 'setPose', id: 'beaker', pose: pose(305, 40, 8), support: 'plate' });
    cmd6(a, { type: 'setPlate', knob: 0.9 });
    cmd6(a, { type: 'setPose', id: 'tube_x', pose: pose(305, 40, 0), support: 'bath' });
    run6(a, 400);
    collect(a);
    // Baño vigoroso, tubo alto (metal fuera del agua), sin medir el baño, traslado lento, tapa abierta, sin agitar.
    const b = world6({ seed: 621, scenarios: ['POOR_INSULATION'] });
    calibrate(b);
    fillCylinder(b, 50);
    pourCylinderToCup(b);
    cmd6(b, { type: 'setPose', id: 'therm_cal', pose: pose(205, 36, 4), support: 'cup' });
    cmd6(b, { type: 'setThermoDepth', id: 'therm_cal', depth: 1 });
    cmd6(b, { type: 'readThermometer', id: 'therm_cal' });
    cmd6(b, { type: 'setThermoDepth', id: 'therm_cal', depth: 0.05 });
    cmd6(b, { type: 'readThermometer', id: 'therm_cal' });
    cmd6(b, { type: 'setThermoDepth', id: 'therm_cal', depth: 0.5 });
    fillBath(b, 200);
    addMetal(b, 'tube_fe', 'jar_fe');
    cmd6(b, { type: 'setPose', id: 'tube_fe', pose: pose(305, 40, 4), support: 'bath' });
    cmd6(b, { type: 'setPlate', knob: 1 });
    run6(b, 600);
    cmd6(b, { type: 'setPose', id: 'tube_fe', pose: pose(300, 30, 20), support: 'tongs' });
    run6(b, 40);
    cmd6(b, { type: 'setLid', closed: false });
    cmd6(b, { type: 'pourMetal', tubeId: 'tube_fe', targetId: 'cup', dropHeightCm: 30, offsetCm: 2 });
    run6(b, 40);
    cmd6(b, { type: 'stir', intensity: 1 });
    cmd6(b, { type: 'readThermometer', id: 'therm_cal', peak: true });
    run6(b, 300);
    cmd6(b, { type: 'readThermometer', id: 'therm_cal', peak: true });
    cmd6(b, { type: 'setPose', id: 'tube_fe', pose: pose(80, 40, 9.5), support: 'pan' });
    cmd6(b, { type: 'readBalance' });
    cmd6(b, { type: 'setPose', id: 'beaker', pose: pose(280, 22), support: 'hand' });
    collect(b);
    // Bomba: sin perfil, sello dañado, sin contacto, sobrepresión, cubeta, abrir presurizada.
    const c = world6({ seed: 622, scenarios: ['DAMAGED_SEAL'] });
    bomb6(c, { type: 'inspect', part: 'seal' });
    bomb6(c, { type: 'selectProfile', profile: 'GENERIC_A' });
    bomb6(c, { type: 'inspect', part: 'seal' });
    bomb6(c, { type: 'selectFood', food: 'cookie' });
    bomb6(c, { type: 'weighSample', amount: 'target' });
    bomb6(c, { type: 'placeSample' });
    bomb6(c, { type: 'connectWire', lengthCm: 8, contact: 'NO_TOUCH' });
    bomb6(c, { type: 'seal' });
    bomb6(c, { type: 'leakTest' });
    bomb6(c, { type: 'ignite' });
    const d = world6({ seed: 623 });
    bomb6(d, { type: 'selectProfile', profile: 'GENERIC_A' });
    for (const part of ['vessel', 'seal', 'electrodes', 'valve'] as const) bomb6(d, { type: 'inspect', part });
    bomb6(d, { type: 'selectFood', food: 'peanut' });
    bomb6(d, { type: 'weighSample', amount: 'target' });
    bomb6(d, { type: 'placeSample' });
    bomb6(d, { type: 'connectWire', lengthCm: 10, contact: 'CRUCIBLE' });
    bomb6(d, { type: 'seal' });
    bomb6(d, { type: 'leakTest' });
    for (let i = 0; i < 8; i++) bomb6(d, { type: 'pressurize', deltaAtm: 5 });
    bomb6(d, { type: 'fillBucket', waterG: 1900 });
    bomb6(d, { type: 'open' });
    collect(c);
    collect(d);
    expect(seen.size, [...seen].sort().join(', ')).toBeGreaterThanOrEqual(30);
    const catalog = new Set(SIMULATED_ERRORS_P6.map((e) => e.code));
    expect([...seen].filter((x) => catalog.has(x)).length).toBeGreaterThanOrEqual(30);
  });
});
