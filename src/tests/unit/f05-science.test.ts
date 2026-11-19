/**
 * F05 — ciencia (§17, matriz «Unitarias»): oráculos de la especificación (madera μ_s = 0,45 y bloque de 0,500 kg →
 * F_max = 2,207 N ± 0,02 N; θ_c = arctan 0,45 = 24,23° ± 0,1°), ecuaciones del modelo (normal con cable inclinado,
 * μ desde fuerzas y desde el ángulo, bajada con roce cinético, trabajo del roce), incertidumbres, el tirón y la bajada
 * simulados contra la solución cerrada, la convergencia al refinar el paso, la conservación y la regla de que el roce
 * nunca crea energía.
 */
import { describe, expect, it } from 'vitest';
import { criticalAngle, frictionWork, muFrom, muFromAngle, muKFromSlide, normalForce, slideAccel } from '../../simulation/models/f05/equations';
import { uMu, uTan } from '../../simulation/models/f05/uncertainty';
import { F05_REFERENCE } from '../../simulation/models/f05/reference';
import { classifyPull, slidesAlone } from '../../simulation/models/f05/regimes';
import { energyResidualJ, mechanicalEnergyJ } from '../../simulation/f05-world/conservation';
import { cableAngleDeg } from '../../simulation/f05-world/geometry';
import { f05Summary } from '../../simulation/f05-world/world';
import type { F05World } from '../../simulation/f05-world/types';
import * as h from '../helpersF05';

/** Tirador listo sobre madera horizontal con la base sin inclinar (para comparar con la solución cerrada). */
function readyWorld(mode: 'CURRICULAR' | 'REALISTIC' = 'CURRICULAR', params: Partial<F05World['params']> = {}) {
  const w = h.worldF5({ scientificMode: mode, params });
  w.plane.baseDeg = 0;
  w.energy.externalJ = mechanicalEnergyJ(w) + w.energy.dissipatedJ;
  const C = (c: Parameters<typeof h.cmdF5>[1]) => h.cmdF5(w, c);
  for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) C({ type: 'equipPpe', item, on: true });
  C({ type: 'startWork' });
  C({ type: 'connect', channel: 'load01', on: true });
  C({ type: 'setRate', hz: 200 });
  C({ type: 'calibrateSensor' });
  C({ type: 'zeroSensor' });
  C({ type: 'setCableHeight', cm: 2 });
  C({ type: 'clampBase', on: true });
  return { w, C, run: (s: number) => h.runF5(w, s) };
}

const pullOnce = (r: ReturnType<typeof readyWorld>, drive = 2) => {
  r.C({ type: 'attachCable', on: true });
  r.C({ type: 'setDrive', cmS: drive });
  r.run(0.5);
  h.waitDone(() => r.w, r.run);
  return r.w.pulls[r.w.pulls.length - 1];
};

describe('F05 · oráculos', () => {
  it('pico estático en madera: F_max = μ_s m g = 2,207 N (± 0,02 N)', () => {
    const o = F05_REFERENCE.staticPeak;
    expect(Math.abs(o.muS * normalForce(o.m, o.g) - o.F)).toBeLessThan(o.tol);
    const r = readyWorld();
    const rec = pullOnce(r);
    expect(Math.abs(rec.slipF - o.F)).toBeLessThan(o.tol);
    const id = r.C({ type: 'readPull', ...h.pullWindows(rec).peak }).id!;
    expect(Math.abs(r.w.readings[id].pull!.Fpeak! - o.F)).toBeLessThan(o.tol);
  });

  it('ángulo crítico en madera: θ_c = arctan 0,45 = 24,23° (± 0,1°) y el bloque simulado arranca ahí', () => {
    const o = F05_REFERENCE.critical;
    expect(Math.abs(criticalAngle(o.muS) - o.deg)).toBeLessThan(o.tol);
    const r = readyWorld('CURRICULAR', { degPerTurn: 0.05 });
    h.tiltTo(() => r.w, r.C, 23);
    r.run(1);
    for (let i = 0; i < 100 && r.w.tilt.slipVersion === null; i++) {
      r.C({ type: 'turnElevator', turns: 1 });
      r.run(0.2);
    }
    expect(r.w.tilt.slipRelDeg).not.toBeNull();
    expect(Math.abs(r.w.tilt.slipRelDeg! - o.deg)).toBeLessThan(o.tol);
  });

  it('bajada a 30° con μ_k = 0,30: a = g (sen θ − μ_k cos θ) = 2,356 m/s², también en la simulación', () => {
    const o = F05_REFERENCE.slide;
    expect(Math.abs(slideAccel(o.g, o.deg, o.muK) - o.a)).toBeLessThan(o.tol);
    const r = readyWorld();
    r.C({ type: 'connect', channel: 'gates', on: true });
    r.C({ type: 'connect', channel: 'video', on: true });
    h.tiltTo(() => r.w, r.C, 30);
    r.C({ type: 'placeBlock', s: 'top' });
    r.run(1);
    r.C({ type: 'releaseBlock' });
    r.run(0.5);
    h.waitDone(() => r.w, r.run);
    const s = r.w.readings[r.C({ type: 'readSlide' }).id!];
    expect(s.qualityFlags).toEqual([]);
    expect(Math.abs(s.value - o.a)).toBeLessThan(0.01);
    expect(Math.abs(s.slide!.trueA! - o.a)).toBeLessThan(0.005);
  });
});

describe('F05 · ecuaciones', () => {
  it('normal con el cable inclinado y μ desde fuerzas o ángulos', () => {
    expect(normalForce(0.5, 9.81)).toBeCloseTo(4.905, 6);
    expect(normalForce(0.5, 9.81, 30)).toBeCloseTo(4.905 * Math.cos(Math.PI / 6), 6);
    expect(normalForce(0.5, 9.81, 0, 2, 30)).toBeCloseTo(4.905 - 1, 6);
    expect(muFrom(1.4715, 4.905)).toBeCloseTo(0.3, 9);
    expect(muFrom(1, 0)).toBeNaN();
    expect(muFromAngle(45)).toBeCloseTo(1, 9);
    expect(muFromAngle(0)).toBeNaN();
    expect(criticalAngle(1)).toBeCloseTo(45, 9);
  });

  it('bajada: el roce retiene bajo el ángulo crítico; μ_k se recupera de la aceleración; el trabajo del roce es negativo', () => {
    expect(slideAccel(9.81, 10, 0.3)).toBe(0);
    const a = slideAccel(9.81, 35, 0.3);
    expect(muKFromSlide(a, 9.81, 35)).toBeCloseTo(0.3, 9);
    expect(frictionWork(0.3, 4.9, 0.35)).toBeCloseTo(-0.5145, 9);
    expect(frictionWork(-0.3, 4.9, 0.35)).toBeLessThan(0);
    expect(slidesAlone(25, 0.45)).toBe(true);
    expect(slidesAlone(24, 0.45)).toBe(false);
  });

  it('incertidumbres y régimen de una ventana', () => {
    expect(uMu(2.2, 0.01, 4.9, 0.005)).toBeCloseTo((2.2 / 4.9) * Math.hypot(0.01 / 2.2, 0.005 / 4.9), 12);
    expect(uTan(0, 0.5)).toBeCloseTo((0.5 * Math.PI) / 180, 12);
    expect(uTan(45, 0.5)).toBeCloseTo((2 * 0.5 * Math.PI) / 180, 12);
    expect(classifyPull(['BEFORE_SLIP'])).toBe('static');
    expect(classifyPull([])).toBe('kinetic');
    expect(classifyPull(['CLIPPED'])).toBe('invalid');
  });

  it('geometría: el cable a la altura del gancho es paralelo al tablero', () => {
    expect(cableAngleDeg(2, 0.25, 1.0)).toBe(0);
    expect(cableAngleDeg(9, 0.25, 1.0)).toBeGreaterThan(5);
  });
});

describe('F05 · física del contacto', () => {
  it('el roce cinético no depende de la rapidez del tirador ni del área (modelo de Coulomb)', () => {
    const means = [1, 2, 5].map((d) => {
      const r = readyWorld();
      const rec = pullOnce(r, d);
      return r.w.readings[r.C({ type: 'readPull', ...h.pullWindows(rec).plateau }).id!].value;
    });
    for (const m of means) expect(m).toBeCloseTo(0.3 * 0.5 * 9.81, 2);
  });

  it('la adherencia: el bloque no se mueve mientras la tensión no supera μ_s N', () => {
    const r = readyWorld();
    r.C({ type: 'attachCable', on: true });
    r.C({ type: 'setDrive', cmS: 1 });
    r.run(0.9);
    // A 1 cm/s el cable se tensa 5 mm y luego el resorte (200 N/m) crece 2 N/s: antes de 1,6 s el bloque no se mueve.
    expect(r.w.puller.tensionN).toBeGreaterThan(0.5);
    expect(r.w.puller.tensionN).toBeLessThan(2.2);
    expect(r.w.block.v).toBe(0);
    expect(r.w.pull!.slipT).toBeNull();
  });
});

describe('F05 · integración numérica y conservación', () => {
  it('converge al refinar los subpasos (paso de 5 ms frente a 1 ms)', () => {
    const peak = (sub: number) => {
      const r = readyWorld('CURRICULAR', { subSteps: sub });
      const rec = pullOnce(r);
      return { F: rec.slipF, s: r.w.block.s };
    };
    const a = peak(10);
    const b = peak(50);
    // El arranque se detecta al final de un subpaso: la diferencia es del orden de k v h = 0,02 N.
    expect(Math.abs(a.F - b.F)).toBeLessThan(0.025);
    expect(Math.abs(a.s - b.s)).toBeLessThan(0.002);
  });

  it('la energía cierra durante el tirón y la bajada, y la disipación nunca disminuye (el roce no crea energía)', () => {
    const r = readyWorld('REALISTIC');
    r.C({ type: 'attachCable', on: true });
    r.C({ type: 'setDrive', cmS: 2 });
    let last = 0;
    for (let i = 0; i < 260; i++) {
      r.run(0.05);
      expect(r.w.energy.dissipatedJ).toBeGreaterThanOrEqual(last - 1e-12);
      last = r.w.energy.dissipatedJ;
      expect(Math.abs(energyResidualJ(r.w))).toBeLessThan(1e-3);
    }
    r.C({ type: 'returnPuller' });
    r.C({ type: 'attachCable', on: false });
    h.tiltTo(() => r.w, r.C, 35);
    r.run(3);
    expect(Math.abs(energyResidualJ(r.w))).toBeLessThan(5e-3);
  });

  it('es determinista: la misma semilla y los mismos comandos dan el mismo estado', () => {
    const a = h.idealRouteF5(321).w;
    const b = h.idealRouteF5(321).w;
    expect(f05Summary(a)).toEqual(f05Summary(b));
    expect(a.readingOrder.map((id) => a.readings[id].value)).toEqual(b.readingOrder.map((id) => b.readings[id].value));
  });
});
