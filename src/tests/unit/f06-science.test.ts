/**
 * F06 — ciencia (§17, matriz «Unitarias»): oráculos de la especificación (k = 100 N/m y x = 0,10 m → U_el = 0,500 J;
 * m = 0,20 kg y h = 0,25 m → U_g = 0,4905 J), ecuaciones del modelo (Hooke, energías, área bajo F–x, W_nc, péndulo),
 * incertidumbres, el disparo, la subida y el péndulo simulados contra la solución cerrada, la convergencia al refinar
 * el paso, la conservación y la regla de que las fuerzas no conservativas nunca crean energía.
 */
import { describe, expect, it } from 'vitest';
import { areaUnder, elasticEnergy, gateSpeed, gravEnergy, hookeForce, kineticEnergy, nonConservativeWork, pendulumDrop, power, topSpeed } from '../../simulation/models/f06/equations';
import { uElastic, uKinetic, uSpeed } from '../../simulation/models/f06/uncertainty';
import { F06_REFERENCE } from '../../simulation/models/f06/reference';
import { classifyRun, inLinearRange } from '../../simulation/models/f06/regimes';
import { energyResidualJ, springEnergy, springForce } from '../../simulation/f06-world/conservation';
import { CART_START_S, trackSlope, trackZ } from '../../simulation/f06-world/geometry';
import { f06Summary } from '../../simulation/f06-world/world';
import type { F06World } from '../../simulation/f06-world/types';
import * as h from '../helpersF06';

/** Lanzador listo en modo curricular (sin émbolo, sin rodadura) con el resorte montado y asegurado. */
function readyWorld(mode: 'CURRICULAR' | 'REALISTIC' = 'CURRICULAR', params: Partial<F06World['params']> = {}) {
  const w = h.worldF6({ scientificMode: mode, params });
  const C = (c: Parameters<typeof h.cmdF6>[1]) => h.cmdF6(w, c);
  for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) C({ type: 'equipPpe', item, on: true });
  C({ type: 'startWork' });
  C({ type: 'mountSpring', id: 'spring01', at: 'launcher' });
  C({ type: 'secureSpring', on: true });
  for (const ch of ['force', 'position', 'gates', 'angle'] as const) C({ type: 'connect', channel: ch, on: true });
  C({ type: 'setRange', n: 1 });
  C({ type: 'setRate', hz: 1000 });
  C({ type: 'syncChannels', on: true });
  C({ type: 'calibrateSensor' });
  C({ type: 'zeroSensor' });
  C({ type: 'clampTrack', on: true });
  C({ type: 'setBrake', on: true });
  return { w, C, run: (s: number) => h.runF6(w, s) };
}

const shoot = (r: ReturnType<typeof readyWorld>, x: number) => {
  r.C({ type: 'compress', x });
  r.C({ type: 'releaseCart' });
  r.run(0.5);
  h.waitRun(() => r.w, r.run);
  return r.w.runs[r.w.runs.length - 1];
};

describe('F06 · oráculos', () => {
  it('resorte: k = 100 N/m y x = 0,10 m → U_el = 0,500 J (< 0,5 %), y el disparo simulado lo entrega', () => {
    const o = F06_REFERENCE.spring;
    expect(Math.abs(elasticEnergy(o.k, o.x) - o.U) / o.U).toBeLessThan(o.tolRel);
    const r = readyWorld();
    r.C({ type: 'setHeight', m: 0 });
    shoot(r, o.x);
    const id = r.C({ type: 'readLaunch' }).id!;
    const W = r.w.readings[id].value;
    expect(Math.abs(W - o.U) / o.U).toBeLessThan(0.02);
    const g = r.w.readings[r.C({ type: 'readGates' }).id!];
    expect(Math.abs(kineticEnergy(0.2, g.gates!.trueV1!) - o.U) / o.U).toBeLessThan(o.tolRel);
  });

  it('gravitatoria: m = 0,20 kg, h = 0,25 m → U_g = 0,4905 J (< 0,2 %), y arriba K₂ = K₁ − U_g', () => {
    const o = F06_REFERENCE.grav;
    expect(Math.abs(gravEnergy(o.m, o.g, o.h) - o.U) / o.U).toBeLessThan(o.tolRel);
    const r = readyWorld();
    r.C({ type: 'setHeight', m: o.h });
    shoot(r, 0.15);
    const g = r.w.readings[r.C({ type: 'readGates' }).id!];
    const K1 = kineticEnergy(o.m, g.gates!.trueV1!);
    const K2 = kineticEnergy(o.m, g.gates!.trueV2!);
    expect(Math.abs(K1 - K2 - o.U) / o.U).toBeLessThan(o.tolRel);
    expect(g.gates!.trueV2!).toBeCloseTo(topSpeed(g.gates!.trueV1!, o.g, o.h), 3);
  });
});

describe('F06 · ecuaciones', () => {
  it('Hooke, energías, área bajo F–x, W_nc, péndulo y potencia', () => {
    expect(hookeForce(100, 0.1)).toBeCloseTo(10, 12);
    expect(areaUnder([[0, 0], [0.1, 10]])).toBeCloseTo(0.5, 12);
    expect(kineticEnergy(0.2, 2)).toBeCloseTo(0.4, 12);
    expect(nonConservativeWork(1, 0, 0.5, 0.4)).toBeCloseTo(-0.1, 12);
    expect(pendulumDrop(1, 60)).toBeCloseTo(0.5, 12);
    expect(gateSpeed(0.02, 0.01)).toBeCloseTo(2, 12);
    expect(power(10, 2)).toBe(20);
    expect(Number.isNaN(topSpeed(1, 9.81, 0.25))).toBe(true);
  });

  it('incertidumbres y régimen de un ensayo', () => {
    expect(uKinetic(0.2, 0.001, 2, 0.02)).toBeCloseTo(0.4 * Math.hypot(0.005, 0.02), 9);
    expect(uElastic(100, 1, 0.1, 0.001)).toBeCloseTo(0.5 * Math.hypot(0.01, 0.02), 9);
    expect(uSpeed(0.02, 0.0001, 0.01, 1e-5)).toBeGreaterThan(0);
    expect(classifyRun([], false)).toBe('conservative');
    expect(classifyRun([], true)).toBe('dissipative');
    expect(classifyRun(['NONLINEAR'], false)).toBe('invalid');
    expect(inLinearRange(0.15, 0.2)).toBe(true);
    expect(inLinearRange(0.22, 0.2)).toBe(false);
  });

  it('resorte con límite: lineal hasta x_lin, más rígido después; la energía es la integral de la fuerza', () => {
    const w = h.worldF6();
    expect(springForce(w, 'spring01', 0.1)).toBeCloseTo(10, 12);
    expect(springForce(w, 'spring01', 0.24)).toBeGreaterThan(24);
    // dU/dx = F (diferencias centradas), también fuera del tramo lineal.
    for (const x of [0.05, 0.19, 0.23]) expect((springEnergy(w, 'spring01', x + 1e-6) - springEnergy(w, 'spring01', x - 1e-6)) / 2e-6).toBeCloseTo(springForce(w, 'spring01', x), 4);
  });

  it('perfil del riel: llano, subida suave y llano arriba, con pendiente continua', () => {
    expect(trackZ(0.3, 0.25)).toBe(0);
    expect(trackZ(0.85, 0.25)).toBeCloseTo(0.125, 9);
    expect(trackZ(1.5, 0.25)).toBe(0.25);
    expect(trackSlope(0.6, 0.25)).toBeCloseTo(0, 9);
    expect(trackSlope(1.1, 0.25)).toBeCloseTo(0, 9);
  });
});

describe('F06 · física del carro y del péndulo', () => {
  it('el carro no sube si la energía elástica no alcanza m g h (vuelve al lanzador)', () => {
    const r = readyWorld();
    r.C({ type: 'setHeight', m: 0.3 });
    shoot(r, 0.1);
    expect(r.w.runs[0].crested).toBe(false);
    expect(r.w.runs[0].maxZ).toBeLessThan(0.3);
    expect(r.w.runs[0].maxZ).toBeCloseTo(0.5 / (0.2 * 9.81), 2);
  });

  it('el roce del patín resta f · (largo del tramo recorrido) a la energía', () => {
    const a = readyWorld();
    a.C({ type: 'setHeight', m: 0.1 });
    shoot(a, 0.15);
    const b = readyWorld();
    b.C({ type: 'setHeight', m: 0.1 });
    b.C({ type: 'setFriction', n: 0.2 });
    shoot(b, 0.15);
    const gA = a.w.readings[a.C({ type: 'readGates' }).id!].gates!;
    const gB = b.w.readings[b.C({ type: 'readGates' }).id!].gates!;
    const dK = kineticEnergy(0.2, gA.trueV2!) - kineticEnergy(0.2, gB.trueV2!);
    // Largo del tramo de pérdidas a lo largo del perfil (0,62 a 1,30 m, incluida la subida).
    let L = 0;
    for (let s = 0.62; s < 1.3; s += 1e-4) L += 1e-4 * Math.sqrt(1 + trackSlope(s + 5e-5, 0.1) ** 2);
    expect(dK).toBeCloseTo(0.2 * L, 2);
  });

  it('el péndulo sigue ½ v² = g L (1 − cos θ₀) en amplitudes chicas y grandes', () => {
    for (const [L, deg] of [[0.8, 10], [0.4, 60]] as const) {
      const r = readyWorld('CURRICULAR', { pendL0: L });
      r.C({ type: 'holdBob', deg });
      r.C({ type: 'releaseBob' });
      h.waitSwing(() => r.w, r.run);
      const v = r.w.swings[0].vBottom;
      expect(0.5 * v * v).toBeCloseTo(9.81 * pendulumDrop(L, deg), 3);
    }
  });
});

describe('F06 · integración numérica y conservación', () => {
  it('converge al refinar los subpasos (paso de 5 ms frente a 1 ms)', () => {
    const a = readyWorld('CURRICULAR');
    a.C({ type: 'setHeight', m: 0.25 });
    shoot(a, 0.15);
    const b = readyWorld('CURRICULAR', { subSteps: 50 });
    b.C({ type: 'setHeight', m: 0.25 });
    shoot(b, 0.15);
    const va = a.w.readings[a.C({ type: 'readGates' }).id!].gates!.trueV2!;
    const vb = b.w.readings[b.C({ type: 'readGates' }).id!].gates!.trueV2!;
    expect(Math.abs(va - vb) / vb).toBeLessThan(0.002);
  });

  it('la energía cierra en cada paso y la disipación nunca disminuye', () => {
    const r = readyWorld('REALISTIC');
    r.C({ type: 'setHeight', m: 0.2 });
    r.C({ type: 'setDamper', c: 0.3 });
    r.C({ type: 'compress', x: 0.15 });
    r.C({ type: 'releaseCart' });
    let last = r.w.energy.dissipatedJ;
    for (let i = 0; i < 120; i++) {
      r.run(0.05);
      expect(Math.abs(energyResidualJ(r.w))).toBeLessThan(1e-4);
      expect(r.w.energy.dissipatedJ).toBeGreaterThanOrEqual(last - 1e-12);
      last = r.w.energy.dissipatedJ;
    }
  });

  it('es determinista: la misma semilla y los mismos comandos dan el mismo estado', () => {
    const a = h.idealRouteF6(31);
    const b = h.idealRouteF6(31);
    expect(f06Summary(a.w)).toEqual(f06Summary(b.w));
    expect(JSON.stringify(a.w.readings)).toBe(JSON.stringify(b.w.readings));
    expect(a.w.cart.s).toBeCloseTo(CART_START_S, 9);
  });
});
