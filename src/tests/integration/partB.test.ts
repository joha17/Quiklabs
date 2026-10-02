/**
 * §17.2 — Integración de la Parte B (dominio completo, sin render).
 */
import { describe, expect, it } from 'vitest';
import { newPracticeWorld } from '../../practices/practice-02';
import { EXPECTED } from '../../practices/practice-02/expected-results';
import { partBResults } from '../../practices/practice-02/results';
import { massBalance, conservationError } from '../../simulation/scoring/balance';
import { cmd, lv, pourMl, run } from '../helpers';
import { crystallize, evaporate, filter, heat, prepareSample, setupFilter, splitFiltrate, waitDrip } from '../routes';
import type { World } from '../../simulation/entities/types';
import { evaluate } from '../../practices/practice-02/rubric';
import { emptyNotebook } from '../../practices/practice-02/notebook';
import { pourSolids, squeezeTo } from '../helpers';

function pourSolidsFromVial(w: World) {
  pourSolids(w, 'vial', 'beaker1', 0.3);
}

const within = (v: number, [a, b]: readonly [number, number]) => {
  expect(v, `${v} ∉ [${a}, ${b}]`).toBeGreaterThanOrEqual(a);
  expect(v, `${v} ∉ [${a}, ${b}]`).toBeLessThanOrEqual(b);
};

function idealUntilFiltrate(seed: number, mode: 'PRACTICE' | 'GUIDED' = 'PRACTICE'): World {
  const w = newPracticeWorld({ mode, seed });
  prepareSample(w);
  heat(w);
  setupFilter(w);
  filter(w);
  return w;
}

function expectConservation(w: World) {
  for (const [k, e] of Object.entries(conservationError(w))) expect(Math.abs(e ?? 0), `conservación ${k}`).toBeLessThan(1e-3);
  for (const row of massBalance(w)) expect(Math.abs(row.residual), `balance ${row.component}`).toBeLessThan(1e-3);
}

describe('§17.2-2 ruta ideal de la Parte B dentro de §9', () => {
  for (const [seed, mode] of [[101, 'PRACTICE'], [202, 'GUIDED'], [303, 'PRACTICE']] as const) {
    it(`semilla ${seed} (${mode})`, () => {
      const w = idealUntilFiltrate(seed, mode);
      const r1 = partBResults(w);
      if (process.env.SIM_DEBUG) console.log('filtrado', seed, JSON.stringify(r1), w.ledger, w.vessels.beaker1.mix, w.vessels.paper1.mix);
      within(r1.filtrateMl, EXPECTED.filtrateBeforeSplitMl);
      within(r1.kno3InFiltrateG, EXPECTED.kno3InWholeFiltrateG);
      within(r1.carbonRecoverableG, EXPECTED.carbonDryRecoverableG);
      expect(r1.carbonInFiltrateG).toBeLessThan(0.005);
      const split = splitFiltrate(w);
      expect(split).toBeCloseTo(2.0, 1);
      evaporate(w);
      crystallize(w);
      const r = partBResults(w);
      if (process.env.SIM_DEBUG) console.log('final', seed, JSON.stringify(r), w.vessels.beaker2.temperatureC, w.vessels.beaker2.cryst);
      within(r.dishKno3G, EXPECTED.kno3FromAliquotEvaporationG);
      within(r.dishPurity!, EXPECTED.purityEvaporation);
      within(r.crystalsG, EXPECTED.kno3CrystallizedFromRestG);
      within(r.crystalPurity!, EXPECTED.purityCrystallization);
      expect(r.motherLiquorKno3G).toBeGreaterThan(0.5);
      expectConservation(w);
    });
  }
});

describe('§17.2 escenarios de error y recuperación', () => {
  it('3. filtro roto y refiltración con papel nuevo', () => {
    const w = newPracticeWorld({ mode: 'PRACTICE', seed: 7 });
    prepareSample(w);
    heat(w);
    setupFilter(w);
    cmd(w, { type: 'tearPaper', paperId: 'paper1' });
    filter(w);
    const dirty = w.vessels.beaker2.mix.solid.CARBON ?? 0;
    expect(dirty).toBeGreaterThan(0.02); // carbón en el filtrado (C3)
    // Refiltrar: retirar el papel roto, montar uno nuevo y pasar el filtrado a un vaso limpio.
    cmd(w, { type: 'grab', id: 'paper1' });
    cmd(w, { type: 'place', id: 'paper1', support: 'bench' });
    const spare = cmd(w, { type: 'requestSpare', kind: 'BEAKER' }).id!;
    for (const a of ['HALF', 'QUARTER', 'OPEN_3_1'] as const) cmd(w, { type: 'foldPaper', paperId: 'paper2', action: a });
    cmd(w, { type: 'place', id: 'paper2', support: 'funnel' });
    cmd(w, { type: 'setDripTarget', funnelId: 'funnel', targetId: spare, touchingWall: true });
    pourMl(w, 'piseta', 'funnel', 0.6, 0.5);
    run(w, 20);
    // Mezclar bien y pasar todo el filtrado turbio.
    cmd(w, { type: 'setAgitation', vesselId: 'beaker2', intensity: 0.6, tool: 'SWIRL' });
    run(w, 2);
    cmd(w, { type: 'setAgitation', vesselId: 'beaker2', intensity: 0, tool: 'NONE' });
    let t = 0;
    while (lv(w, 'beaker2') > 0.05 && t < 900) {
      cmd(w, { type: 'setPour', sourceId: 'beaker2', targetId: 'funnel', liquidRateMlS: lv(w, 'funnel') < 4.5 ? 0.6 : 0, solidRateGS: 0, tiltDeg: 50, guided: true });
      run(w, 0.05);
      t += 0.05;
    }
    cmd(w, { type: 'setPour', sourceId: 'beaker2', targetId: 'funnel', liquidRateMlS: 0, solidRateGS: 0.1, tiltDeg: 110, guided: true });
    run(w, 10);
    cmd(w, { type: 'stopPour', sourceId: 'beaker2' });
    waitDrip(w);
    const clean = w.vessels[spare].mix.solid.CARBON ?? 0;
    expect(clean).toBeLessThan(dirty * 0.05);
    expectConservation(w);
  });

  it('4. exceso de agua y recuperación por evaporación', () => {
    const w = newPracticeWorld({ mode: 'GUIDED', seed: 11 });
    prepareSample(w);
    heat(w);
    setupFilter(w);
    filter(w, 2.0);
    // Exceso de lavado (C8): +12 mL al filtrado → diluido; no cristaliza en el baño.
    pourMl(w, 'piseta', 'beaker2', 12, 2);
    const dilute = structuredClone(w);
    crystallize(dilute, 'beaker2', 900);
    expect(dilute.vessels.beaker2.mix.crystals?.massG ?? 0).toBeLessThan(0.02);
    // Recuperación: evaporar parte del disolvente en la placa y repetir el enfriamiento.
    cmd(w, { type: 'place', id: 'beaker2', support: 'hotplate' });
    cmd(w, { type: 'insertRod', vesselId: 'beaker2' });
    cmd(w, { type: 'setAgitation', vesselId: 'beaker2', intensity: 0.5, tool: 'ROD' });
    cmd(w, { type: 'setHotplatePower', pct: 30 });
    run(w, 40);
    cmd(w, { type: 'setHotplatePower', pct: 70 });
    let t = 0;
    while (lv(w, 'beaker2') > 10.5 && t < 3600) {
      run(w, 5);
      t += 5;
    }
    cmd(w, { type: 'setHotplatePower', pct: 0 });
    cmd(w, { type: 'setAgitation', vesselId: 'beaker2', intensity: 0, tool: 'NONE' });
    cmd(w, { type: 'insertRod', vesselId: null });
    cmd(w, { type: 'setHandMode', mode: 'TONGS' });
    cmd(w, { type: 'grab', id: 'beaker2' });
    cmd(w, { type: 'place', id: 'beaker2', support: 'bench' });
    crystallize(w, 'beaker2', 1200);
    expect(w.vessels.beaker2.mix.crystals?.massG ?? 0).toBeGreaterThan(0.25);
    expectConservation(w);
  });

  it('5. enfriamiento sin nucleación y recuperación por raspado o semilla', () => {
    // Sobresaturación moderada y nucleación lenta (demora máxima configurada).
    const w = newPracticeWorld({ mode: 'GUIDED', seed: 5, params: { crystal: { ...newPracticeWorld({ mode: 'GUIDED', seed: 5 }).params.crystal, baseDelayMinS: 1500, baseDelayMaxS: 1500 } } });
    prepareSample(w);
    heat(w);
    setupFilter(w);
    filter(w);
    const seeded = structuredClone(w);
    crystallize(w, 'beaker2', 300);
    expect(w.vessels.beaker2.mix.crystals).toBeNull();
    expect(['SUPERSATURATED', 'NUCLEATING']).toContain(w.vessels.beaker2.cryst.phase);
    // Raspado suave de la pared con la varilla.
    cmd(w, { type: 'insertRod', vesselId: 'beaker2' });
    for (let i = 0; i < 6; i++) {
      cmd(w, { type: 'scrape', vesselId: 'beaker2' });
      run(w, 10);
    }
    run(w, 900);
    expect(w.vessels.beaker2.mix.crystals?.massG ?? 0).toBeGreaterThan(0.2);
    // Cristal semilla (punta de espátula de KNO₃).
    crystallize(seeded, 'beaker2', 200);
    cmd(seeded, { type: 'cleanTool', toolId: 'spatula' });
    cmd(seeded, { type: 'scoop', toolId: 'spatula', sourceId: 'jar_kno3' });
    cmd(seeded, { type: 'tapTool', toolId: 'spatula', targetId: 'beaker2' });
    run(seeded, 900);
    expect(seeded.vessels.beaker2.mix.crystals?.massG ?? 0).toBeGreaterThan(0.2);
    expectConservation(seeded);
  });

  it('6. derrame parcial con balance correcto', () => {
    const w = newPracticeWorld({ mode: 'GUIDED', seed: 9 });
    prepareSample(w);
    // Vertido que no cae en el receptor (chorro fuera): derrame de ~2 mL.
    cmd(w, { type: 'setAgitation', vesselId: 'beaker1', intensity: 0, tool: 'NONE' });
    pourMl(w, 'beaker1', null, 2.0, 1);
    expect(w.ledger.spilled.H2O ?? 0).toBeGreaterThan(1.5);
    expect(w.ledger.spilled.KNO3 ?? 0).toBeGreaterThan(0.1);
    expect(w.bench.spillMl).toBeGreaterThan(1.5);
    const rows = massBalance(w, ['KNO3', 'CARBON', 'H2O']);
    for (const r of rows) expect(Math.abs(r.residual)).toBeLessThan(1e-3);
    expect(rows.find((r) => r.component === 'KNO3')!.spilled).toBeGreaterThan(0.1);
  });

  it('6b. derrame importante sin limpiar bloquea hasta limpiar', () => {
    const w = newPracticeWorld({ mode: 'GUIDED', seed: 9 });
    prepareSample(w);
    pourMl(w, 'beaker1', null, 8, 2);
    expect(w.safety.block?.code).toBe('SPILL_UNCLEANED');
    expect(cmd(w, { type: 'setHotplatePower', pct: 30 }).ok).toBe(false);
    expect(cmd(w, { type: 'cleanSpill' }).ok).toBe(true);
    expect(w.safety.block).toBeNull();
  });

  it('romper la probeta, barrerla y seguir con una de repuesto (cuenta en la evaluación)', () => {
    const w = newPracticeWorld({ mode: 'GUIDED', seed: 21 });
    // Se cae fuera de la mesada y se rompe (o se fuerza la rotura si la semilla la salva).
    let r = cmd(w, { type: 'drop', id: 'cyl', impactCmS: 400, fell: true });
    if (r.code !== 'BROKEN') r = cmd(w, { type: 'drop', id: 'cyl', impactCmS: 400, fell: true });
    if (r.code !== 'BROKEN') w.vessels.cyl.integrity = 0;
    expect(w.vessels.cyl.integrity).toBe(0);
    expect(cmd(w, { type: 'grab', id: 'cyl' }).ok).toBe(false); // tocar vidrio roto: bloqueado
    cmd(w, { type: 'sweepShards', id: 'cyl' });
    const spare = cmd(w, { type: 'requestSpare', kind: 'GRADUATED_CYLINDER' });
    expect(spare.ok).toBe(true);
    const id = spare.id!;
    expect(w.vessels[id].type).toBe('GRADUATED_CYLINDER');
    // Medir 10,0 mL con la probeta nueva y preparar la mezcla.
    pourSolidsFromVial(w);
    squeezeTo(w, id, 10.0);
    pourMl(w, id, 'beaker1', 20, 1.5);
    expect(w.vessels.beaker1.mix.waterG).toBeCloseTo(10, 1);
    const ev = evaluate(w, emptyNotebook(), { ppeConfirmed: true, mode: 'GUIDED' });
    const handling = ev.components.find((c) => c.id === 'handling')!;
    expect(handling.items.find((i) => i.key === 'beakerWater')!.ok).toBe(true);
    expect(w.evidence.sparesRequested).toBe(1);
  });

  it('varilla rota: hay que barrer antes de pedir otra', () => {
    const w = newPracticeWorld({ mode: 'GUIDED', seed: 22 });
    expect(cmd(w, { type: 'requestSpare', kind: 'ROD' }).code).toBe('NOT_BROKEN');
    w.devices.rod.integrity = 0;
    w.bench.shards.push('rod');
    expect(cmd(w, { type: 'requestSpare', kind: 'ROD' }).code).toBe('SWEEP_FIRST');
    cmd(w, { type: 'sweepShards', id: 'rod' });
    expect(cmd(w, { type: 'requestSpare', kind: 'ROD' }).ok).toBe(true);
    expect(w.devices.rod.integrity).toBe(1);
    expect(w.props.rod.support).toBe('bench');
    expect(cmd(w, { type: 'insertRod', vesselId: 'beaker1' }).ok).toBe(true);
  });

  it('7. calentar la mezcla seca carbón/KNO₃: bloqueado', () => {
    const w = newPracticeWorld({ mode: 'GUIDED', seed: 3 });
    // Vial directo al vaso, sin agua.
    cmd(w, { type: 'setPour', sourceId: 'vial', targetId: 'beaker1', liquidRateMlS: 0, solidRateGS: 0.5, tiltDeg: 110, guided: true });
    run(w, 10);
    cmd(w, { type: 'stopPour', sourceId: 'vial' });
    // a) Placa ya encendida → no se permite colocar.
    cmd(w, { type: 'setHotplatePower', pct: 40 });
    const r = cmd(w, { type: 'place', id: 'beaker1', support: 'hotplate' });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('DRY_MIXTURE_HEAT');
    // b) Placa apagada, se coloca, y al intentar encender se bloquea.
    cmd(w, { type: 'setHotplatePower', pct: 0 });
    run(w, 400);
    expect(cmd(w, { type: 'place', id: 'beaker1', support: 'hotplate' }).ok).toBe(true);
    const on = cmd(w, { type: 'setHotplatePower', pct: 50 });
    expect(on.ok).toBe(false);
    expect(w.devices.hotplate.powerPct).toBe(0);
    expect(w.events.some((e) => e.code === 'SAFETY_DRY_MIXTURE_HEAT')).toBe(true);
    // Nunca hay evento de ignición en ninguna ruta.
    expect(w.events.some((e) => /IGNIT|COMBUST|DEFLAG/.test(e.code))).toBe(false);
  });

  it('7b. evaporar a sequedad un filtrado con carbón (filtro roto) corta la placa antes de quedar seco', () => {
    const w = newPracticeWorld({ mode: 'GUIDED', seed: 13 });
    prepareSample(w);
    heat(w);
    setupFilter(w);
    cmd(w, { type: 'tearPaper', paperId: 'paper1' });
    filter(w);
    splitFiltrate(w);
    cmd(w, { type: 'cover', vesselId: 'dish', mode: 'PARTIAL' });
    cmd(w, { type: 'place', id: 'dish', support: 'hotplate' });
    cmd(w, { type: 'setHotplatePower', pct: 60 });
    run(w, 1200);
    expect(w.devices.hotplate.powerPct).toBe(0);
    expect(w.events.some((e) => e.code === 'SAFETY_DRY_MIXTURE_HEAT')).toBe(true);
  });
});
