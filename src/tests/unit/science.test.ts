/**
 * §17.1 — Pruebas unitarias del núcleo científico (Node, sin DOM).
 */
import { describe, expect, it } from 'vitest';
import { createWorld } from '../../simulation/world/world';
import { emptyMixture, liquidVolumeMl, mixAmounts, substanceMass } from '../../simulation/solutions/mixture';
import { maxDissolvedKno3G } from '../../simulation/solutions/solubility';
import { interpolateTable } from '../../simulation/core/math';
import { conservationError } from '../../simulation/scoring/balance';
import type { Mixture, Prop, World } from '../../simulation/entities/types';
import type { VesselSpec } from '../../simulation/entities/vessel';
import { DEFAULT_PARAMS, SUBSTANCES } from '../../practices/practice-02';
import { KNO3_SOLUBILITY } from '../../practices/practice-02/substances';
import { cmd, lv, pourMl, run } from '../helpers';
import { stepMut } from '../../simulation/world/world';
import { CTX } from '../../practices/practice-02';

const P = (x = 0, y = 0) => ({ x, y, z: 0, rotationRad: 0 });

function mix(parts: Partial<Mixture> & { solid?: Mixture['solid']; dissolved?: Mixture['dissolved'] }): Mixture {
  return { ...emptyMixture(), ...parts };
}

function miniWorld(vessels: VesselSpec[], ambientC = 25, props: Prop[] = []): World {
  const params = { ...structuredClone(DEFAULT_PARAMS), ambientC };
  return createWorld({ vessels, props }, 12345, params);
}

describe('§4.4 curva de solubilidad', () => {
  it('interpola linealmente y no extrapola sobre 100 °C', () => {
    expect(interpolateTable(KNO3_SOLUBILITY, 25)).toBeCloseTo(38.3, 5);
    expect(interpolateTable(KNO3_SOLUBILITY, 35)).toBeCloseTo((45.8 + 63.9) / 2, 5);
    expect(interpolateTable(KNO3_SOLUBILITY, 120)).toBe(246);
    expect(maxDissolvedKno3G(SUBSTANCES, 20, 10)).toBeCloseTo(3.16, 5);
  });
});

describe('§17.1 núcleo científico', () => {
  it('1. conserva la masa de KNO₃ en 10 000 pasos sin derrames', () => {
    const w = miniWorld([
      { id: 'b', type: 'BEAKER', pose: P(), support: 'hotplate', mix: mix({ waterG: 10, solid: { KNO3: 2.0833 } }) },
    ]);
    cmd(w, { type: 'setAgitation', vesselId: 'b', intensity: 0.5, tool: 'ROD' });
    cmd(w, { type: 'setHotplatePower', pct: 30 });
    const k0 = substanceMass(w.vessels.b.mix, 'KNO3');
    for (let i = 0; i < 10_000; i++) stepMut(w, CTX);
    expect(w.ledger.spilled.KNO3 ?? 0).toBe(0);
    expect(Math.abs(substanceMass(w.vessels.b.mix, 'KNO3') - k0)).toBeLessThan(1e-6);
    expect(Math.abs(conservationError(w).KNO3 ?? 0)).toBeLessThan(1e-6);
  });

  it('2. a 25 °C, 2,083 g de KNO₃ se disuelven por completo en 10 g de agua (y sin agitar es más lento)', () => {
    const make = () =>
      miniWorld([{ id: 'b', type: 'BEAKER', pose: P(), support: 'bench', mix: mix({ waterG: 10, solid: { KNO3: 2.0833 } }), temperatureC: 25 }], 25);
    const stirred = make();
    const still = make();
    cmd(stirred, { type: 'setAgitation', vesselId: 'b', intensity: 0.8, tool: 'ROD' });
    run(stirred, 60);
    run(still, 60);
    const ds = stirred.vessels.b.mix.dissolved.KNO3 ?? 0;
    const du = still.vessels.b.mix.dissolved.KNO3 ?? 0;
    expect(ds).toBeGreaterThan(du * 2);
    run(stirred, 900);
    expect(stirred.vessels.b.mix.dissolved.KNO3).toBeCloseTo(2.0833, 3);
    expect(stirred.vessels.b.mix.solid.KNO3 ?? 0).toBeLessThan(1e-3);
  });

  it('3. al enfriar una disolución concentrada, el exceso sobre la solubilidad pasa a cristales', () => {
    const w = miniWorld([
      { id: 'b', type: 'BEAKER', pose: P(), support: 'bench', mix: mix({ waterG: 10, dissolved: { KNO3: 5 } }), temperatureC: 60 },
      { id: 'bath', type: 'BATH', pose: P(10), support: 'bench', mix: mix({ waterG: 150, iceG: 100 }), temperatureC: 1 },
    ], 22);
    // Enfriamiento gradual al aire y luego en baño.
    run(w, 600);
    cmd(w, { type: 'place', id: 'b', support: 'bath' });
    run(w, 1500);
    const v = w.vessels.b;
    const cap = maxDissolvedKno3G(SUBSTANCES, v.temperatureC, v.mix.waterG);
    const crystals = v.mix.crystals?.massG ?? 0;
    expect(v.temperatureC).toBeLessThan(6);
    expect(crystals).toBeGreaterThan(3);
    // El disuelto se acerca a la capacidad (nunca por debajo de forma significativa).
    expect(v.mix.dissolved.KNO3 ?? 0).toBeGreaterThan(cap * 0.98);
    expect(v.mix.dissolved.KNO3 ?? 0).toBeLessThan(cap * 1.1);
    // Nunca 100 %: queda KNO₃ en la disolución madre.
    expect(v.mix.dissolved.KNO3 ?? 0).toBeGreaterThan(0.5);
  });

  it('3b. nunca cristaliza por debajo de la saturación', () => {
    const w = miniWorld([{ id: 'b', type: 'BEAKER', pose: P(), support: 'bench', mix: mix({ waterG: 10, dissolved: { KNO3: 1.0 } }), temperatureC: 22 }], 22);
    cmd(w, { type: 'setAgitation', vesselId: 'b', intensity: 1, tool: 'ROD' });
    run(w, 600);
    expect(w.vessels.b.mix.crystals).toBeNull();
  });

  it('4. el carbón nunca se marca como disuelto', () => {
    const w = miniWorld([
      { id: 'b', type: 'BEAKER', pose: P(), support: 'hotplate', mix: mix({ waterG: 10, solid: { KNO3: 2.08, CARBON: 0.42 } }) },
    ]);
    cmd(w, { type: 'setAgitation', vesselId: 'b', intensity: 1, tool: 'ROD' });
    cmd(w, { type: 'setHotplatePower', pct: 30 });
    run(w, 300);
    cmd(w, { type: 'setHotplatePower', pct: 60 });
    run(w, 300);
    expect(w.vessels.b.mix.dissolved.CARBON).toBeUndefined();
    // Todo el carbón sigue como sólido (en el vaso o, si salpicó, en el derrame).
    expect((w.vessels.b.mix.solid.CARBON ?? 0) + (w.ledger.spilled.CARBON ?? 0)).toBeCloseTo(0.42, 6);
    for (const v of Object.values(w.vessels)) expect(v.mix.dissolved.CARBON).toBeUndefined();
  });

  it('5. la evaporación quita agua, no KNO₃ (salvo salpicadura)', () => {
    const w = miniWorld([
      { id: 'd', type: 'PORCELAIN_DISH', pose: P(), support: 'hotplate', mix: mix({ waterG: 1.8, dissolved: { KNO3: 0.35 } }) },
    ]);
    cmd(w, { type: 'cover', vesselId: 'd', mode: 'PARTIAL' });
    cmd(w, { type: 'setHotplatePower', pct: 60 });
    run(w, 900);
    const d = w.vessels.d;
    expect(d.mix.waterG).toBe(0);
    const kno3 = substanceMass(d.mix, 'KNO3') + (w.ledger.spilled.KNO3 ?? 0);
    expect(kno3).toBeCloseTo(0.35, 6);
    expect(w.ledger.evaporated.H2O ?? 0).toBeGreaterThan(1.7);
    expect(w.ledger.evaporated.KNO3 ?? 0).toBe(0);
  });

  it('6. dividir el filtrado reparte KNO₃ según concentración y volumen reales', () => {
    const w = miniWorld([
      { id: 'b', type: 'BEAKER', pose: P(), support: 'bench', mix: mix({ waterG: 10.5, dissolved: { KNO3: 2.0 } }) },
      { id: 'cyl', type: 'GRADUATED_CYLINDER', pose: P(5), support: 'bench' },
    ], 22);
    const vTotal = lv(w, 'b');
    pourMl(w, 'b', 'cyl', 2.0, 0.5);
    const inCyl = w.vessels.cyl.mix.dissolved.KNO3 ?? 0;
    expect(lv(w, 'cyl')).toBeCloseTo(2.0, 2);
    expect(inCyl).toBeCloseTo((2.0 * 2.0) / vTotal, 3);
    expect(inCyl + (w.vessels.b.mix.dissolved.KNO3 ?? 0)).toBeCloseTo(2.0, 6);
  });

  it('7. el filtro intacto retiene el carbón según su eficiencia; el roto deja pasar partículas', () => {
    const setup = (torn: boolean) => {
      const w = miniWorld([
        { id: 'src', type: 'BEAKER', pose: P(), support: 'bench', mix: mix({ waterG: 8, solid: { CARBON: 0.4 }, suspended: { CARBON: 1 } }) },
        { id: 'funnel', type: 'FUNNEL', pose: P(10), support: 'ring' },
        { id: 'paper', type: 'FILTER_PAPER', pose: P(10), support: 'bench' },
        { id: 'rec', type: 'BEAKER', pose: P(10), support: 'bench' },
      ], 22);
      for (const a of ['HALF', 'QUARTER', 'OPEN_3_1'] as const) cmd(w, { type: 'foldPaper', paperId: 'paper', action: a });
      cmd(w, { type: 'place', id: 'paper', support: 'funnel' });
      cmd(w, { type: 'setDripTarget', funnelId: 'funnel', targetId: 'rec', touchingWall: true });
      w.vessels.paper.filter!.wetted = true;
      if (torn) cmd(w, { type: 'tearPaper', paperId: 'paper' });
      cmd(w, { type: 'setAgitation', vesselId: 'src', intensity: 1, tool: 'ROD' });
      stepMut(w, CTX);
      cmd(w, { type: 'setAgitation', vesselId: 'src', intensity: 0, tool: 'NONE' });
      cmd(w, { type: 'setPour', sourceId: 'src', targetId: 'funnel', liquidRateMlS: 0.5, solidRateGS: 0, tiltDeg: 50, guided: true });
      run(w, 40);
      cmd(w, { type: 'stopPour', sourceId: 'src' });
      run(w, 300);
      return w;
    };
    const ok = setup(false);
    const torn = setup(true);
    const passedOk = ok.vessels.rec.mix.solid.CARBON ?? 0;
    const passedTorn = torn.vessels.rec.mix.solid.CARBON ?? 0;
    const fedOk = (ok.vessels.paper.mix.solid.CARBON ?? 0) + passedOk;
    expect(fedOk).toBeGreaterThan(0.05);
    expect(passedOk / fedOk).toBeLessThan(0.01);
    expect(passedTorn).toBeGreaterThan(passedOk * 20);
  });

  it('8. ninguna masa ni volumen es negativo (prueba aleatoria)', () => {
    const w = miniWorld([
      { id: 'a', type: 'BEAKER', pose: P(), support: 'hotplate', mix: mix({ waterG: 12, solid: { KNO3: 2, CARBON: 0.4 } }) },
      { id: 'b', type: 'BEAKER', pose: P(5), support: 'bench' },
      { id: 'd', type: 'PORCELAIN_DISH', pose: P(9), support: 'bench' },
    ]);
    let r = 7;
    const rnd = () => ((r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const ids = ['a', 'b', 'd'];
    for (let i = 0; i < 3000; i++) {
      const x = rnd();
      if (x < 0.05) cmd(w, { type: 'setHotplatePower', pct: Math.floor(rnd() * 100) });
      else if (x < 0.1) {
        const s = ids[Math.floor(rnd() * 3)];
        const t = ids[Math.floor(rnd() * 3)];
        if (s !== t) cmd(w, { type: 'setPour', sourceId: s, targetId: t, liquidRateMlS: rnd() * 3, solidRateGS: rnd() * 0.3, tiltDeg: 60, guided: rnd() > 0.5 });
      } else if (x < 0.13) cmd(w, { type: 'stopPour', sourceId: ids[Math.floor(rnd() * 3)] });
      else if (x < 0.16) cmd(w, { type: 'setAgitation', vesselId: ids[Math.floor(rnd() * 3)], intensity: rnd(), tool: 'ROD' });
      stepMut(w, CTX);
      for (const v of Object.values(w.vessels)) {
        const m = v.mix;
        expect(m.waterG).toBeGreaterThanOrEqual(0);
        expect(m.iceG).toBeGreaterThanOrEqual(0);
        for (const g of [...Object.values(m.solid), ...Object.values(m.dissolved), ...Object.values(m.oil)]) expect(g ?? 0).toBeGreaterThanOrEqual(0);
        expect(liquidVolumeMl(m, SUBSTANCES)).toBeGreaterThanOrEqual(0);
        if (m.crystals) expect(m.crystals.massG).toBeGreaterThanOrEqual(0);
      }
    }
    for (const [k, err] of Object.entries(conservationError(w))) expect(Math.abs(err ?? 0), k).toBeLessThan(1e-6);
  });

  it('9. mismo estado inicial + misma semilla + mismos comandos ⇒ mismo resultado', () => {
    const script = (w: World) => {
      cmd(w, { type: 'setAgitation', vesselId: 'b', intensity: 0.7, tool: 'ROD' });
      cmd(w, { type: 'setHotplatePower', pct: 55 });
      run(w, 400);
      cmd(w, { type: 'setHotplatePower', pct: 0 });
      cmd(w, { type: 'place', id: 'b', support: 'bench' });
      run(w, 900);
      return w;
    };
    const make = () => miniWorld([{ id: 'b', type: 'BEAKER', pose: P(), support: 'hotplate', mix: mix({ waterG: 6, solid: { KNO3: 4 } }) }]);
    const a = script(make());
    const b = script(make());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(mixAmounts(a.vessels.b.mix)).toEqual(mixAmounts(b.vessels.b.mix));
  });
});
