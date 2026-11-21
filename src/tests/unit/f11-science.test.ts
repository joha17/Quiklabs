/**
 * F11 — ciencia (§17, matriz «Unitarias»): oráculos de la especificación (agua a 0,40 m ⇒ p = 3924 Pa; bloque de
 * 5×10⁻⁴ m³ sumergido ⇒ F_b = 4,905 N), ecuaciones del modelo, incertidumbre, el tanque, la sonda, el vaso de rebose y
 * la flotación simulados contra la solución cerrada, regímenes de validez y conservación.
 */
import { describe, expect, it } from 'vitest';
import { absolutePressure, apparentWeight, buoyancy, densityGmL, floatFraction, floats, gaugePressure, linearFit, relDiff, stratifiedPressure } from '../../simulation/models/f11/equations';
import { uDensity, uRhoSlopeB } from '../../simulation/models/f11/uncertainty';
import { F11_REFERENCE } from '../../simulation/models/f11/reference';
import { classifyBodyReading, classifyPressureReading } from '../../simulation/models/f11/regimes';
import { canState, conservedTotalsF11, solidOf, tankLevel, volumeOf } from '../../simulation/f11-world/conservation';
import { SF11, f11Summary, hydrostaticPa } from '../../simulation/f11-world/world';
import type { F11Command } from '../../simulation/f11-world/commands';
import type { F11Params } from '../../simulation/f11-world/types';
import * as h from '../helpersF11';
import { routeDepthsF11 } from '../../practices/practice-f11';

/** Mundo con EPP y una función de comando. */
function started(o: { params?: Partial<F11Params>; mode?: F11Params['scientificMode']; seed?: number; scenarios?: string[] } = {}) {
  const w = h.worldF11({ scientificMode: o.mode ?? 'CURRICULAR', params: o.params, seed: o.seed, scenarios: o.scenarios as never });
  const C = (c: F11Command) => h.cmdF11(w, c);
  for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) C({ type: 'equipPpe', item, on: true });
  C({ type: 'startWork' });
  return { w, C, run: (s: number) => h.runF11(w, s) };
}

/** Tanque lleno de agua, sonda calibrada, en cero y montada en la guía trabada. */
function tank(o: Parameters<typeof started>[0] = {}) {
  const x = started(o);
  const { w, C, run } = x;
  h.fillTo(() => w, C, run, 'setTap', w.params.fillCm);
  C({ type: 'setGuide', xCm: 30 });
  C({ type: 'lockGuide', on: true });
  C({ type: 'connectProbe', on: true });
  if (!w.probe.absolute) C({ type: 'setRange', idx: 1 });
  C({ type: 'setRate', hz: 20 });
  C({ type: 'calibrateProbe' });
  if (!w.probe.absolute) C({ type: 'zeroProbe' });
  C({ type: 'mountProbe', where: 'guide' });
  C({ type: 'newSeries' });
  h.waitCalm(() => w, run);
  const at = (z: number) => {
    C({ type: 'setProbeZ', zCm: z });
    run(0.3);
    if (w.probe.bubble) C({ type: 'purgeProbe' });
    run(3);
    return w.readings[C({ type: 'readProbe' }).id!];
  };
  return { ...x, at };
}

describe('F11 — oráculos de la especificación (§8)', () => {
  it('agua de 1000 kg/m³ a 0,40 m ⇒ p = ρ g h = 3924 Pa (±15 Pa)', () => {
    const R = F11_REFERENCE.pressure;
    expect(Math.abs(gaugePressure(R.rho, R.g, R.h) - R.p)).toBeLessThan(R.tolPa);
    expect(absolutePressure(101325, R.rho, R.g, R.h)).toBeCloseTo(101325 + 3924, 6);
  });

  it('bloque de 5×10⁻⁴ m³ totalmente sumergido en agua ⇒ F_b = 4,905 N (±0,01 N)', () => {
    const R = F11_REFERENCE.buoyancy;
    expect(Math.abs(buoyancy(R.rho, R.g, R.V) - R.Fb)).toBeLessThan(R.tolN);
    expect(apparentWeight(13.24, R.rho, R.g, R.V)).toBeCloseTo(13.24 - 4.905, 3);
  });

  it('ecuaciones auxiliares: fracción sumergida, flota o no, densidad, perfil estratificado y ajuste lineal', () => {
    expect(floatFraction(600, 1000)).toBeCloseTo(0.6, 12);
    expect(floats(600, 1000)).toBe(true);
    expect(floats(1400, 1000)).toBe(false);
    expect(densityGmL(236, 200)).toBeCloseTo(1180, 9);
    // Con Δρ = 0 el perfil estratificado es el hidrostático; con Δρ > 0 en el fondo vale ρ̄ g L.
    expect(stratifiedPressure(1000, 0, 9.81, 0.42, 0.2)).toBeCloseTo(gaugePressure(1000, 9.81, 0.2), 9);
    expect(stratifiedPressure(1000, 80, 9.81, 0.42, 0.42)).toBeCloseTo(gaugePressure(1000, 9.81, 0.42), 9);
    expect(stratifiedPressure(1000, 80, 9.81, 0.42, 0.21)).toBeLessThan(gaugePressure(1000, 9.81, 0.21));
    const fit = linearFit([0.05, 0.1, 0.2, 0.3, 0.4], [0.05, 0.1, 0.2, 0.3, 0.4].map((x) => 9810 * x + 3))!;
    expect(fit.b).toBeCloseTo(9810, 6);
    expect(fit.a).toBeCloseTo(3, 6);
    expect(linearFit([1, 2], [1, 2])).toBeNull();
    expect(relDiff(4.95, 4.905)).toBeCloseTo((100 * 0.045) / 4.905, 9);
    expect(Number.isNaN(buoyancy(1000, 9.81, -1))).toBe(true);
  });

  it('incertidumbre: u(ρ) de masa y volumen y u_B(ρ) de la pendiente crecen con u de cada instrumento', () => {
    const u1 = uDensity(1180, 236, 0.1, 200, 1);
    const u2 = uDensity(1180, 236, 0.1, 200, 2);
    expect(u1).toBeGreaterThan(0);
    expect(u2).toBeGreaterThan(u1);
    const b1 = uRhoSlopeB(1000, 10, 3500, 0.0005, 0.35);
    const b2 = uRhoSlopeB(1000, 20, 3500, 0.0005, 0.35);
    expect(b2).toBeGreaterThan(b1);
  });

  it('regímenes: la presión válida, estratificada o inválida; el cuerpo, de Arquímedes o inválido', () => {
    expect(classifyPressureReading([])).toBe('hydrostatic');
    expect(classifyPressureReading(['STRATIFIED'])).toBe('stratified');
    expect(classifyPressureReading(['WAVES', 'STRATIFIED'])).toBe('invalid');
    expect(classifyBodyReading([])).toBe('archimedes');
    expect(classifyBodyReading(['ON_BOTTOM'])).toBe('invalid');
  });
});

describe('F11 — tanque y sonda simulados', () => {
  it('la sonda en cero y calibrada mide ρ g h a cada profundidad (modo curricular) y la pendiente da ρ', () => {
    const { w, at } = tank();
    const L = tankLevel(w);
    const hs: number[] = [];
    const ps: number[] = [];
    for (const z of routeDepthsF11(L)) {
      const r = at(z);
      expect(r.qualityFlags).toEqual([]);
      const hh = (L - z) / 100;
      expect(Math.abs(r.value * 1000 - 1000 * 9.81 * hh)).toBeLessThan(12);
      hs.push(hh);
      ps.push(r.value * 1000);
    }
    expect(linearFit(hs, ps)!.b / 9.81).toBeCloseTo(1000, -1);
  });

  it('la presión hidrostática no depende de la x de la sonda ni de los objetos que flotan (solo del nivel)', () => {
    const { w, C, run, at } = tank();
    const p1 = at(20).trueValue;
    C({ type: 'releaseObject', id: 'float1', xCm: 50 });
    C({ type: 'untieThread', id: 'float1' });
    h.waitFloats(() => w, run);
    const L2 = tankLevel(w);
    const p2 = at(20).trueValue;
    expect(p2).toBeGreaterThan(p1);
    expect(p2).toBeCloseTo(hydrostaticPa(w, L2 - 20) / 1000, 3);
  });

  it('el nivel sube lo que desplaza lo que flota: ΔL = m / (ρ A)', () => {
    const { w, C, run } = tank();
    const L1 = tankLevel(w);
    C({ type: 'setProbeZ', zCm: 44 });
    C({ type: 'releaseObject', id: 'float1', xCm: 18 });
    C({ type: 'untieThread', id: 'float1' });
    h.waitFloats(() => w, run);
    const p = w.params;
    const m = (p.block.rho * volumeOf(w, 'float1')) / 1000;
    expect(tankLevel(w) - L1).toBeCloseTo((m / (p.rhoA / 1000)) / (p.tank.L * p.tank.W), 3);
  });

  it('un cuerpo que flota queda con la fracción sumergida ρ_obj / ρ_líq; uno más denso se hunde', () => {
    const { w, C, run } = tank();
    C({ type: 'setProbeZ', zCm: 44 });
    C({ type: 'releaseObject', id: 'float1', xCm: 18 });
    C({ type: 'untieThread', id: 'float1' });
    h.waitFloats(() => w, run);
    const s = solidOf(w, 'float1');
    const sub = (tankLevel(w) - w.floats.float1.zb) / s.H;
    expect(sub).toBeCloseTo(w.params.block.rho / w.params.rhoA, 2);
    C({ type: 'releaseObject', id: 'alu1', xCm: 45 });
    C({ type: 'untieThread', id: 'alu1' });
    h.waitFloats(() => w, run, 60);
    expect(w.floats.alu1.sank).toBe(true);
    expect(w.floats.alu1.zb).toBeCloseTo(0, 6);
  });

  it('la sonda absoluta suma la presión atmosférica y la manométrica sin cero queda corrida en su offset', () => {
    const abs = tank({ scenarios: [SF11.ABSOLUTE] });
    const r = abs.at(20);
    expect(r.value).toBeGreaterThan(abs.w.params.pAtmKPa);
    const g = started({ mode: 'REALISTIC', scenarios: [SF11.GAUGE] });
    expect(Math.abs(g.w.probe.offset)).toBeGreaterThan(0.29);
  });

  it('la salmuera da una pendiente mayor y el perfil estratificado se aparta de la recta', () => {
    const x = started({ scenarios: [SF11.PROFILE] });
    h.fillTo(() => x.w, x.C, x.run, 'setPump', x.w.params.fillCm);
    const L = tankLevel(x.w);
    expect(x.w.tank.strat).toBeGreaterThan(0.5);
    const mid = hydrostaticPa(x.w, L / 2);
    expect(mid).toBeLessThan(x.w.params.rhoB * x.w.params.g * (L / 200));
    expect(hydrostaticPa(x.w, L)).toBeCloseTo(x.w.params.rhoB * x.w.params.g * (L / 100), 6);
  });
});

describe('F11 — vaso de rebose y dinamómetro', () => {
  it('el bloque sumergido pierde ρ g V de peso y del vaso cebado rebosa exactamente su volumen', () => {
    const { w, C, run } = started();
    C({ type: 'zeroDyn' });
    C({ type: 'hangBlock' });
    run(2);
    const W = w.readings[C({ type: 'readDyn', viewDeg: 0 }).id!].value;
    C({ type: 'primeCan' });
    run(5);
    C({ type: 'placeCatch', at: 'spout' });
    const v0 = w.can.vol;
    C({ type: 'setStand', cm: 2 });
    h.waitStand(() => w, run);
    for (let i = 0; i < 60 && canState(w).level > w.params.can.spoutCm + 0.005; i++) run(0.25);
    run(1);
    const T = w.readings[C({ type: 'readDyn', viewDeg: 0 }).id!].value;
    const V = volumeOf(w, 'alu1');
    expect(W - T).toBeCloseTo(buoyancy(w.params.rhoA, w.params.g, V * 1e-6), 1);
    expect(w.can.catchVol + (w.can.vol - v0) + canState(w).sub - V).toBeCloseTo(0, 0);
    expect(Math.abs(w.can.catchVol - V)).toBeLessThan(V * 0.02);
  });

  it('inclinado α, el dinamómetro mide T cos α', () => {
    const { w, C, run } = started();
    C({ type: 'zeroDyn' });
    C({ type: 'hangBlock' });
    run(2);
    const T0 = w.readings[C({ type: 'readDyn', viewDeg: 0 }).id!].value;
    C({ type: 'aimDyn', deg: 20 });
    run(2);
    const T1 = w.readings[C({ type: 'readDyn', viewDeg: 0 }).id!].value;
    expect(T1 / T0).toBeCloseTo(Math.cos((20 * Math.PI) / 180), 2);
  });
});

describe('F11 — conservación y determinismo', () => {
  it('el líquido se conserva (descontando lo aportado por la canilla) durante una ruta completa', () => {
    const { w } = h.idealRouteF11(111, [], 'REALISTIC');
    const t = conservedTotalsF11(w);
    expect(t.liquidCm3).toBeCloseTo(w.initialTotals.liquidCm3, 3);
    expect(f11Summary(w)).toBeTruthy();
  });

  it('la misma semilla da exactamente las mismas lecturas', () => {
    const a = h.idealRouteF11(42, [], 'REALISTIC').w;
    const b = h.idealRouteF11(42, [], 'REALISTIC').w;
    expect(a.readingOrder.map((id) => a.readings[id].value)).toEqual(b.readingOrder.map((id) => b.readings[id].value));
  });
});
