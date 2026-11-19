/**
 * F09 — ciencia (§17, matriz «Unitarias»): oráculos de la especificación (m = 0,20 kg, r = 0,50 m, T = 2,00 s →
 * F_c = 0,987 N; F = 2,00 N ⟂ r = 0,20 m → τ = 0,400 N·m), ecuaciones del modelo, incertidumbre, la mesa simulada contra
 * la solución cerrada (F = m ω² r estacionaria, α = τ/I, L = I ω al recoger las masas), convergencia con el paso de
 * integración, calibración de sensores y balances.
 */
import { describe, expect, it } from 'vitest';
import {
  angularAccel, angularMomentumOf, centripetalForce, centripetalFromPeriod, inertiaFromTorque, omegaAfter, omegaFromPeriod, pointI, relDiff, rotKE, slopeThroughOrigin, tangentialSpeed, torqueOf,
} from '../../simulation/models/f09/equations';
import { relUCentripetal, uInertia } from '../../simulation/models/f09/uncertainty';
import { F09_REFERENCE } from '../../simulation/models/f09/reference';
import { classifyReading, negligibleFriction } from '../../simulation/models/f09/regimes';
import { angularMomentum, energyResidualJ, rotorI } from '../../simulation/f09-world/conservation';
import { f09Summary, linFitF9 } from '../../simulation/f09-world/world';
import type { F09Command } from '../../simulation/f09-world/commands';
import type { F09Params } from '../../simulation/f09-world/types';
import * as h from '../helpersF09';

/** Mesa lista en modo curricular: base, nivel, sensores, masas gemelas a `slides` cm y masa orbitante a `orbitR` cm. */
function readyWorld(o: { orbitR?: number | null; slides?: number; params?: Partial<F09Params>; mode?: F09Params['scientificMode'] } = {}) {
  const w = h.worldF9({ scientificMode: o.mode ?? 'CURRICULAR', params: o.params });
  const C = (c: F09Command) => h.cmdF9(w, c);
  for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) C({ type: 'equipPpe', item, on: true });
  C({ type: 'startWork' });
  C({ type: 'setGuard', closed: false });
  C({ type: 'clampBase', on: true });
  C({ type: 'levelAxis' });
  for (const ch of ['encoder', 'force', 'gate'] as const) C({ type: 'connect', channel: ch, on: true });
  C({ type: 'calibrateEncoder' });
  C({ type: 'routeCable', on: true });
  C({ type: 'zeroForce' });
  C({ type: 'zeroDyn' });
  C({ type: 'setRate', hz: 200 });
  for (const s of ['slide1', 'slide2'] as const) {
    C({ type: 'lockMass', id: s, on: false });
    C({ type: 'setSlide', id: s, rCm: o.slides ?? 15 });
    C({ type: 'lockMass', id: s, on: true });
  }
  if (o.orbitR !== null) {
    C({ type: 'mountOrbit', on: true });
    C({ type: 'tightenCord' });
    C({ type: 'setOrbitRadius', rCm: o.orbitR ?? 20 });
    C({ type: 'lockStop', on: true });
  }
  C({ type: 'setGuard', closed: true });
  C({ type: 'setBrake', level: 0 });
  return { w, C, run: (s: number) => h.runF9(w, s) };
}

describe('F09 — oráculos de la especificación (§8)', () => {
  it('centrípeta: m = 0,20 kg, r = 0,50 m, T = 2,00 s ⇒ F_c = 0,987 N (< 0,5 %)', () => {
    const R = F09_REFERENCE.centripetal;
    expect(Math.abs(relDiff(centripetalFromPeriod(R.m, R.r, R.T), R.F))).toBeLessThan(R.tolPct);
    expect(centripetalForce(R.m, omegaFromPeriod(R.T), R.r)).toBeCloseTo(centripetalFromPeriod(R.m, R.r, R.T), 12);
  });

  it('torque tangencial: F = 2,00 N ⟂ r = 0,20 m ⇒ τ = 0,400 N·m (< 0,2 %)', () => {
    const T = F09_REFERENCE.torque;
    expect(Math.abs(relDiff(torqueOf(T.r, T.F, 90), T.tau))).toBeLessThan(T.tolPct);
    // Oblicuo (F09-E03): r F sen φ.
    expect(torqueOf(T.r, T.F, 60)).toBeCloseTo(T.tau * Math.sin(Math.PI / 3), 12);
  });

  it('la mesa simulada reproduce F_c = m ω² r en régimen estacionario (sensor ideal)', () => {
    const { w, C, run } = readyWorld({ orbitR: 25 });
    C({ type: 'setClutch', on: true });
    h.rampTo(() => w, C, run, 40);
    run(3);
    const r = h.readingOfF9(w, C({ type: 'readForce' }));
    expect(r.qualityFlags).toEqual([]);
    expect(Math.abs(relDiff(r.value, centripetalForce(0.2, w.rotor.omega, 0.25)))).toBeLessThan(0.5);
  });

  it('un tirón de 2,00 N en el brazo de 0,20 m da α = τ / I (< 0,2 %)', () => {
    const { w, C, run } = readyWorld({ orbitR: null });
    C({ type: 'setGuard', closed: false });
    C({ type: 'setArm', rCm: 20 });
    C({ type: 'windCord', turns: 1, dir: 1 });
    C({ type: 'setPull', forceN: 2 });
    C({ type: 'setGuard', closed: true });
    C({ type: 'startPull' });
    run(0.5);
    h.waitRun(() => w, run);
    const e = h.readingOfF9(w, C({ type: 'readEncoder' }));
    const I = rotorI(w);
    expect(Math.abs(relDiff(e.fit!.trueAlpha!, angularAccel(0.4, I)))).toBeLessThan(0.2);
    expect(Math.abs(relDiff(e.value, angularAccel(0.4, I)))).toBeLessThan(0.2);
    expect(Math.abs(e.fit!.trueAlphaC!)).toBeLessThan(1e-9);
  });
});

describe('F09 — ecuaciones e incertidumbre', () => {
  it('v = ω r, ω = 2π/T, I = m r², L = I ω, K = ½ I ω² y ω₂ = I₁ ω₁ / I₂', () => {
    expect(tangentialSpeed(3, 0.2)).toBeCloseTo(0.6, 12);
    expect(omegaFromPeriod(Math.PI)).toBeCloseTo(2, 12);
    expect(pointI(0.2, 0.25)).toBeCloseTo(0.0125, 12);
    expect(angularMomentumOf(0.04, 5)).toBeCloseTo(0.2, 12);
    expect(rotKE(0.04, 5)).toBeCloseTo(0.5, 12);
    expect(omegaAfter(0.045, 5, 0.0225)).toBeCloseTo(10, 12);
    expect(Number.isNaN(omegaFromPeriod(0))).toBe(true);
  });

  it('I con corrección de roce y pendiente por el origen', () => {
    expect(inertiaFromTorque(0.4, 13.7, 0.1)).toBeCloseTo(0.4 / 13.8, 12);
    expect(slopeThroughOrigin([1, 4, 9], [0.04, 0.16, 0.36])).toBeCloseTo(0.04, 12);
    expect(negligibleFriction(10, 0.1)).toBe(true);
    expect(negligibleFriction(10, 0.5)).toBe(false);
  });

  it('propagación: u(F_c) relativa con 2 u_T / T y u(I) de τ/α', () => {
    expect(relUCentripetal(0.2, 0, 0.2, 0, 2, 0.01)).toBeCloseTo(0.01, 12);
    expect(uInertia(0.2, 0, 2, 0.02, 10, 0)).toBeCloseTo(0.04 * 0.01, 12);
  });

  it('regímenes: holgura, aceleración, freno o motor durante la recogida invalidan la lectura', () => {
    expect(classifyReading([], 0)).toBe('ideal');
    expect(classifyReading([], 0.05)).toBe('frictional');
    for (const f of ['SLACK', 'UNSTABLE', 'BRAKING', 'MOTOR_TORQUE', 'OBLIQUE']) expect(classifyReading([f], 0)).toBe('invalid');
  });
});

describe('F09 — dinámica de la mesa', () => {
  it('sin torque externo, recoger las masas conserva L exactamente y K aumenta en el trabajo del cordón', () => {
    const { w, C, run } = readyWorld({ orbitR: null, slides: 25 });
    C({ type: 'setClutch', on: true });
    h.rampTo(() => w, C, run, 50);
    run(2);
    C({ type: 'setClutch', on: false });
    run(0.5);
    const L0 = angularMomentum(w);
    const K0 = 0.5 * rotorI(w) * w.rotor.omega ** 2;
    const W0 = w.energy.pullJ;
    C({ type: 'pullIn', rCm: 6 });
    run(2);
    expect(w.pullTarget).toBeNull();
    expect(angularMomentum(w)).toBeCloseTo(L0, 10);
    const K1 = 0.5 * rotorI(w) * w.rotor.omega ** 2;
    expect(K1 - K0).toBeCloseTo(w.energy.pullJ - W0, 10);
    expect(K1 / K0).toBeCloseTo((w.params.I0 + 2 * 0.2 * 0.0625) / (w.params.I0 + 2 * 0.2 * 0.0036), 6);
    expect(Math.abs(energyResidualJ(w))).toBeLessThan(1e-9);
  });

  it('el roce de Coulomb detiene la mesa en tiempo finito y el balance cierra', () => {
    const { w, C, run } = readyWorld({ orbitR: null, mode: 'REALISTIC' });
    C({ type: 'setClutch', on: true });
    h.rampTo(() => w, C, run, 30);
    run(2);
    C({ type: 'setClutch', on: false });
    run(120);
    expect(w.rotor.omega).toBe(0);
    expect(Math.abs(energyResidualJ(w))).toBeLessThan(1e-9);
  });

  it('refinar el subpaso converge: α del tirón con 1, 10 y 40 subpasos coincide', () => {
    const alphaFor = (subSteps: number) => {
      const { w, C, run } = readyWorld({ orbitR: null, params: { subSteps } });
      C({ type: 'setGuard', closed: false });
      C({ type: 'setArm', rCm: 20 });
      C({ type: 'windCord', turns: 1, dir: 1 });
      C({ type: 'setPull', forceN: 2 });
      C({ type: 'setGuard', closed: true });
      C({ type: 'startPull' });
      run(0.5);
      h.waitRun(() => w, run);
      return { a: h.readingOfF9(w, C({ type: 'readEncoder' })).fit!.trueAlpha!, end: w.runs[0].endT! };
    };
    const a1 = alphaFor(1);
    const a10 = alphaFor(10);
    const a40 = alphaFor(40);
    expect(Math.abs(relDiff(a1.a, a40.a))).toBeLessThan(1);
    expect(Math.abs(relDiff(a10.a, a40.a))).toBeLessThan(0.05);
    expect(Math.abs(a10.end - a40.end)).toBeLessThan(0.006);
  });

  it('el ajuste lineal recupera la pendiente exacta', () => {
    const ts = [0, 0.1, 0.2, 0.3, 0.4];
    const f = linFitF9(ts, ts.map((t) => 1.5 + 4 * t))!;
    expect(f.a).toBeCloseTo(1.5, 12);
    expect(f.b).toBeCloseTo(4, 12);
    expect(linFitF9([0, 1], [0, 1])).toBeNull();
  });

  it('el mundo es determinista: misma semilla y cinta ⇒ mismo resumen', () => {
    const a = h.idealRouteF9(5);
    const b = h.idealRouteF9(5);
    expect(f09Summary(a.w)).toEqual(f09Summary(b.w));
    expect(JSON.stringify(a.w.readings)).toBe(JSON.stringify(b.w.readings));
  });
});

describe('F09 — instrumentos', () => {
  it('el período de n vueltas coincide con 2π n / ω y la media vuelta da la mitad', () => {
    const { w, C, run } = readyWorld({ orbitR: 20 });
    C({ type: 'setClutch', on: true });
    h.rampTo(() => w, C, run, 30);
    run(3);
    const om = w.rotor.omega;
    C({ type: 'timeTurns', turns: 3 });
    h.waitTiming(() => w, run);
    const r = w.readings[w.readingOrder[w.readingOrder.length - 1]];
    expect(r.value).toBeCloseTo((3 * 2 * Math.PI) / om, 3);
  });

  it('el dinamómetro sin cero suma su corrimiento y el encoder sin calibrar escala por 400/360', () => {
    const w = h.worldF9({ scientificMode: 'REALISTIC' });
    expect(w.dyn.zeroed).toBe(false);
    expect(Math.abs(w.dyn.offset)).toBeGreaterThan(0.05);
    expect(w.encoder.scale).toBeCloseTo(400 / 360, 12);
  });
});
