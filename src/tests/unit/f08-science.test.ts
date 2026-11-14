/**
 * F08 — ciencia (§17, matriz «Unitarias»): oráculos de la especificación (disco M = 0,50 kg, R = 0,10 m → I = 0,0025
 * kg·m²; τ = 0,010 N·m → α = 4,00 rad/s², ω(2 s) = 8,00 rad/s, Δθ = 8,00 rad), ecuaciones del modelo (inercias, Steiner,
 * masa colgante, tensión, inercia con corrección de roce), incertidumbre, el rotor simulado contra la solución cerrada,
 * la conservación del momento angular cuando una masa se desliza, el ajuste cuadrático y los balances.
 */
import { describe, expect, it } from 'vitest';
import { angularAccel, discI, hangingAlpha, inertiaFromRun, omegaAt, parallelAxis, pointI, relDiff, ringI, rodI, rotKE, rpmToRad, tensionOf, thetaAt } from '../../simulation/models/f08/equations';
import { uInertia } from '../../simulation/models/f08/uncertainty';
import { F08_REFERENCE } from '../../simulation/models/f08/reference';
import { classifyRun, negligibleFriction } from '../../simulation/models/f08/regimes';
import { angularMomentum, energyResidualJ, rotorI } from '../../simulation/f08-world/conservation';
import { massStartZ, maxTurns } from '../../simulation/f08-world/geometry';
import { f08Summary, quadFit } from '../../simulation/f08-world/world';
import type { F08Params, SolidId } from '../../simulation/f08-world/types';
import * as h from '../helpersF08';

/** Rotor listo en modo curricular: base sujeta, polea alineada, tope, sensores y el sólido pedido. */
function readyWorld(solid: SolidId | null = 'disc01', params: Partial<F08Params> = {}, mode: F08Params['scientificMode'] = 'CURRICULAR') {
  const w = h.worldF8({ scientificMode: mode, params });
  const C = (c: Parameters<typeof h.cmdF8>[1]) => h.cmdF8(w, c);
  for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) C({ type: 'equipPpe', item, on: true });
  C({ type: 'startWork' });
  C({ type: 'clampBase', on: true });
  C({ type: 'alignPulley' });
  C({ type: 'setCatch', on: true, zCm: -70 });
  for (const ch of ['encoder', 'tension', 'tach', 'gate'] as const) C({ type: 'connect', channel: ch, on: true });
  C({ type: 'calibrateEncoder' });
  C({ type: 'zeroEncoder' });
  C({ type: 'setEncoderDir', dir: 1 });
  C({ type: 'zeroTension' });
  C({ type: 'setRate', hz: 200 });
  if (solid) C({ type: 'mountSolid', id: solid, hole: 0 });
  if (w.rotor.ecc > 0) C({ type: 'centerSolid' });
  return { w, C, run: (s: number) => h.runF8(w, s) };
}

function release(C: ReturnType<typeof readyWorld>['C'], drop: 'drop20' | 'drop50' | 'drop100' = 'drop50') {
  C({ type: 'windString', turns: 5 });
  C({ type: 'hangMass', id: drop, on: true });
  C({ type: 'setGuard', closed: true });
  C({ type: 'setBrake', on: false });
  return C({ type: 'release' });
}

describe('F08 — oráculos de la especificación (§8)', () => {
  it('disco: I = ½ M R² = 0,0025 kg·m² (< 0,1 %)', () => {
    const R = F08_REFERENCE.disc;
    expect(Math.abs(relDiff(discI(R.M, R.R), R.I))).toBeLessThan(R.tolPct);
  });

  it('torque constante: α = 4,00 rad/s², ω(2 s) = 8,00 rad/s y Δθ = 8,00 rad (< 0,5 %)', () => {
    const T = F08_REFERENCE.torque;
    const a = angularAccel(T.tau, T.I);
    expect(Math.abs(relDiff(a, T.alpha))).toBeLessThan(T.tolPct);
    expect(Math.abs(relDiff(omegaAt(T.t, a), T.omega))).toBeLessThan(T.tolPct);
    expect(Math.abs(relDiff(thetaAt(T.t, a), T.theta))).toBeLessThan(T.tolPct);
  });

  it('el rotor simulado con torque puro reproduce el oráculo (cuerda con masa equivalente)', () => {
    // Masa colgante que da τ = m (g − α r) r = 0,010 N·m sobre el disco + eje en modo curricular.
    const { w, C, run } = readyWorld('disc01', { I0: 0 });
    const I = rotorI(w);
    expect(I).toBeCloseTo(0.0025, 12);
    release(C, 'drop50');
    run(2);
    const r = 0.02;
    const m = w.params.dropKg.drop50;
    const alpha = hangingAlpha(m, r, I, w.params.g);
    expect(w.rotor.omega).toBeCloseTo(alpha * 2, 3);
    expect(w.string.unwound).toBeCloseTo(0.5 * alpha * 4, 3);
    expect(tensionOf(m, alpha, r, w.params.g) * r).toBeCloseTo(I * alpha, 9);
  });
});

describe('F08 — ecuaciones e incertidumbre', () => {
  it('momentos de inercia, Steiner, energía y unidades', () => {
    expect(ringI(0.5, 0.1)).toBeCloseTo(0.005, 12);
    expect(rodI(0.3, 0.6)).toBeCloseTo(0.009, 12);
    expect(pointI(0.05, 0.2)).toBeCloseTo(0.002, 12);
    expect(parallelAxis(0.0025, 0.5, 0.05)).toBeCloseTo(0.00375, 12);
    expect(rotKE(0.004, 10)).toBeCloseTo(0.2, 12);
    expect(rpmToRad(60)).toBeCloseTo(2 * Math.PI, 12);
    expect(Number.isNaN(discI(NaN, 1))).toBe(true);
  });

  it('inercia con corrección de roce: I = T r / (α + |α_c|)', () => {
    // I = 0,004, τ_f = 0,0004 ⇒ α_c = −0,1; con T r = 0,0098 ⇒ α = (0,0098 − 0,0004)/0,004.
    const alpha = (0.0098 - 0.0004) / 0.004;
    expect(inertiaFromRun(0.49, 0.02, alpha, -0.1)).toBeCloseTo(0.004, 9);
    expect(inertiaFromRun(0.49, 0.02, alpha, 0)).toBeGreaterThan(0.004);
    expect(uInertia(0.49, 0.005, 0.02, 0.0001, 2.4, 0.005)).toBeGreaterThan(0);
  });

  it('regímenes: banderas invalidantes, roce apreciable o ideal', () => {
    expect(classifyRun(['MASS_SLID'], 0)).toBe('invalid');
    expect(classifyRun([], 0.1)).toBe('frictional');
    expect(classifyRun([], 0)).toBe('ideal');
    expect(negligibleFriction(2.4, 0.01)).toBe(true);
    expect(negligibleFriction(2.4, 0.1)).toBe(false);
  });

  it('el ajuste cuadrático recupera los coeficientes exactos', () => {
    const ts = Array.from({ length: 50 }, (_, i) => 1 + i * 0.05);
    const f = quadFit(ts, ts.map((t) => 0.3 - 1.2 * t + 0.85 * t * t))!;
    expect(f.a).toBeCloseTo(0.3, 9);
    expect(f.b).toBeCloseTo(-1.2, 9);
    expect(f.c).toBeCloseTo(0.85, 9);
    expect(quadFit([0, 1], [0, 1])).toBeNull();
  });

  it('geometría: altura de arranque y vueltas máximas bajo la polea', () => {
    expect(massStartZ(0.02, 5)).toBeCloseTo(-92 + 2 * Math.PI * 2 * 5, 9);
    expect(massStartZ(0.02, maxTurns(0.02))).toBeLessThanOrEqual(-8);
  });
});

describe('F08 — rotor simulado', () => {
  it.each(['disc01', 'ring01', 'bar01', null] as const)('%s: α y T del modelo; la masa baja r θ', (solid) => {
    const { w, C, run } = readyWorld(solid);
    if (solid === 'bar01') {
      C({ type: 'setGuard', closed: false });
      for (const s of ['slide1', 'slide2'] as const) C({ type: 'lockMass', id: s, on: true });
    }
    release(C);
    run(1);
    const I = rotorI(w);
    const alpha = hangingAlpha(w.params.dropKg.drop50, 0.02, I, w.params.g);
    expect(w.rotor.omega).toBeCloseTo(alpha * 1, 3);
    expect(w.string.y).toBeCloseTo(0.02 * w.string.unwound, 9);
    expect(w.lastT).toBeCloseTo(tensionOf(w.params.dropKg.drop50, alpha, 0.02, w.params.g), 6);
    expect(Math.abs(energyResidualJ(w))).toBeLessThan(1e-9);
  });

  it('una masa corrediza suelta se aleja y conserva el momento angular (sin cuerda ni roce)', () => {
    const { w, C, run } = readyWorld('bar01');
    C({ type: 'setGuard', closed: false });
    C({ type: 'setBrake', on: false });
    C({ type: 'spinByHand', omega: 8 });
    const L0 = angularMomentum(w);
    run(0.3);
    expect(w.slides.slide1.r).toBeGreaterThan(0.15);
    expect(w.rotor.omega).toBeLessThan(8);
    expect(angularMomentum(w)).toBeCloseTo(L0, 9);
    expect(Math.abs(energyResidualJ(w))).toBeLessThan(1e-9);
  });

  it('con roce el tramo libre desacelera con α_c = −τ_f / I', () => {
    const { w, C, run } = readyWorld('disc01', { frictionNm: 0.002 });
    release(C);
    run(12);
    const r = w.readings[C({ type: 'readEncoder' }).id!];
    expect(r.fit!.trueAlphaC!).toBeCloseTo(-0.002 / rotorI(w), 4);
    expect(Math.abs(energyResidualJ(w))).toBeLessThan(1e-6);
  });

  it('el freno detiene el rotor y la sobrevelocidad dispara la protección', () => {
    const { w, C, run } = readyWorld('disc01');
    C({ type: 'setGuard', closed: false });
    C({ type: 'setBrake', on: false });
    C({ type: 'spinByHand', omega: 20 });
    C({ type: 'setBrake', on: true });
    run(2);
    expect(w.rotor.omega).toBe(0);
    C({ type: 'setBrake', on: false });
    C({ type: 'spinByHand', omega: 38 });
    expect(w.rotor.tripped).toBe(true);
    run(3);
    expect(w.rotor.omega).toBe(0);
  });

  it('el estado es determinista con la misma semilla', () => {
    const a = h.idealRouteF8(108);
    const b = h.idealRouteF8(108);
    expect(f08Summary(a.w)).toEqual(f08Summary(b.w));
    expect(JSON.stringify(a.w.readings)).toBe(JSON.stringify(b.w.readings));
  });
});
