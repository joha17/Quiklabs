/**
 * F07 — ciencia (§17, matriz «Unitarias»): oráculos de la especificación (m₁ = 0,20 kg, m₂ = 0,30 kg, u₁ = 1,00 m/s →
 * v₁ = −0,20 m/s, v₂ = 0,80 m/s y J₁ = −0,240 N·s), ecuaciones del modelo (momento, impulso como área, restitución,
 * velocidad común, centro de masa, energía perdida), incertidumbres, el choque simulado contra la solución cerrada para
 * cada paragolpes y rigidez, la conservación del momento sin fuerzas externas, el velcro, los imanes y los balances.
 */
import { describe, expect, it } from 'vitest';
import { centerOfMass, finalVelocities, gateVelocity, impulseArea, keLostPct, kineticEnergy, momentum, relDiff, restitution, stickVelocity } from '../../simulation/models/f07/equations';
import { uMomentum, uSpeed } from '../../simulation/models/f07/uncertainty';
import { F07_REFERENCE } from '../../simulation/models/f07/reference';
import { classifyCollision, isolated } from '../../simulation/models/f07/regimes';
import { energyResidualJ, totalMomentum } from '../../simulation/f07-world/conservation';
import { GEOF07 } from '../../simulation/f07-world/geometry';
import { f07Summary } from '../../simulation/f07-world/world';
import type { BumperType, F07Params } from '../../simulation/f07-world/types';
import * as h from '../helpersF07';

/** Riel listo en modo curricular: frenos sueltos, ruedas libres, carros centrados, topes amortiguados y sensores listos. */
function readyWorld(params: Partial<F07Params> = {}, mode: F07Params['scientificMode'] = 'CURRICULAR', bumper: BumperType = 'spring') {
  const w = h.worldF7({ scientificMode: mode, params });
  const C = (c: Parameters<typeof h.cmdF7>[1]) => h.cmdF7(w, c);
  for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) C({ type: 'equipPpe', item, on: true });
  C({ type: 'startWork' });
  for (const c of ['cartA', 'cartB'] as const) {
    C({ type: 'setCartBrake', cart: c, on: false });
    C({ type: 'freeWheel', cart: c });
    C({ type: 'centerCart', cart: c });
    C({ type: 'alignFlag', cart: c });
  }
  C({ type: 'setEndDampers', on: true });
  for (const ch of ['gates', 'force', 'camera'] as const) C({ type: 'connect', channel: ch, on: true });
  C({ type: 'clampGates', on: true });
  C({ type: 'setRange', n: 1 });
  C({ type: 'setRate', hz: 5000 });
  C({ type: 'calibrateSensor' });
  C({ type: 'zeroSensor' });
  if (bumper !== w.bumper.type) C({ type: 'setBumper', bumper });
  if (bumper === 'magnet' && !w.bumper.polarityOk) C({ type: 'flipMagnet' });
  if (bumper === 'velcro') C({ type: 'fixVelcro', on: true });
  return { w, C, run: (s: number) => h.runF7(w, s) };
}

const collide = (r: ReturnType<typeof readyWorld>, cm = h.ROUTE_COCK) => {
  r.C({ type: 'placeCart', cart: 'cartB', s: GEOF07.cartB0 });
  r.C({ type: 'cock', cart: 'cartA', cm });
  if (Math.abs(r.w.params.v2) > 1e-6) r.C({ type: 'cock', cart: 'cartB', cm });
  r.C({ type: 'release' });
  r.run(0.5);
  h.waitRun(() => r.w, r.run);
  return r.w.runs[r.w.runs.length - 1];
};

describe('F07 · oráculos', () => {
  it('elástico: m₁ = 0,20, m₂ = 0,30, u₁ = 1 → v₁ = −0,20 y v₂ = 0,80 m/s (|Δp| < 0,001), y el choque simulado lo reproduce', () => {
    const o = F07_REFERENCE.elastic;
    const [v1, v2] = finalVelocities(o.m1, o.m2, o.u1, o.u2);
    expect(v1).toBeCloseTo(o.v1, 9);
    expect(v2).toBeCloseTo(o.v2, 9);
    expect(Math.abs(momentum(o.m1, v1) + momentum(o.m2, v2) - momentum(o.m1, o.u1))).toBeLessThan(o.dpTol);
    const r = readyWorld({ m1: o.m1, m2: o.m2, v1: o.u1, e: 1 });
    const rec = collide(r);
    expect(rec.vBefore![0]).toBeCloseTo(o.u1, 2);
    expect(rec.vAfter![0]).toBeCloseTo(o.v1, 2);
    expect(rec.vAfter![1]).toBeCloseTo(o.v2, 2);
    expect(Math.abs(rec.pAfter! - rec.pBefore!)).toBeLessThan(o.dpTol);
  });

  it('impulso: J₁ = m₁ (v₁ − u₁) = −0,240 N·s ± 0,003, y el área bajo F–t del sensor lo reproduce', () => {
    const o = F07_REFERENCE.impulse;
    const e = F07_REFERENCE.elastic;
    expect(Math.abs(momentum(e.m1, e.v1) - momentum(e.m1, e.u1) - o.J1)).toBeLessThan(o.tol);
    const r = readyWorld({ m1: e.m1, m2: e.m2, v1: e.u1, e: 1 });
    const rec = collide(r);
    expect(Math.abs(-rec.trueJ - o.J1)).toBeLessThan(o.tol);
    const f = r.w.readings[r.C({ type: 'readForce' }).id!];
    expect(f.qualityFlags).toEqual([]);
    // El sensor está en el paragolpes de B: mide +J sobre B; sobre el carro 1 es −J.
    expect(Math.abs(-f.value - o.J1)).toBeLessThan(0.006);
  });
});

describe('F07 · ecuaciones e incertidumbres', () => {
  it('momento, área por trapecios, restitución, velocidad común, centro de masa y energía perdida', () => {
    expect(momentum(0.25, -0.4)).toBeCloseTo(-0.1, 12);
    expect(impulseArea([[0, 0], [0.01, 10], [0.02, 0]])).toBeCloseTo(0.1, 12);
    expect(restitution(1, 0, -0.2, 0.8)).toBeCloseTo(1, 12);
    expect(restitution(1, 0, 0.4, 0.4)).toBeCloseTo(0, 12);
    const [a, b] = finalVelocities(0.2, 0.2, 1, 0, 0);
    expect(a).toBeCloseTo(0.5, 12);
    expect(b).toBeCloseTo(0.5, 12);
    expect(stickVelocity(0.2, 0.3, 1, 0)).toBeCloseTo(0.4, 12);
    expect(centerOfMass([0.2, 0.3], [0, 1])).toBeCloseTo(0.6, 12);
    expect(keLostPct(kineticEnergy(0.2, 1), kineticEnergy(0.5, 0.4))).toBeCloseTo(60, 9);
    expect(gateVelocity(0.03, 0.03, -1)).toBeCloseTo(-1, 12);
    expect(relDiff(1.02, 1)).toBeCloseTo(2, 9);
  });

  it('incertidumbres de la rapidez y del momento crecen con las de sus factores', () => {
    const u0 = uSpeed(0.03, 0.00005, 0.03, 1e-5);
    expect(u0).toBeGreaterThan(0);
    expect(uSpeed(0.03, 0.0001, 0.03, 1e-5)).toBeGreaterThan(u0);
    expect(uMomentum(0.2, 0.0001, 1, u0)).toBeGreaterThan(uMomentum(0.2, 0, 1, u0));
  });

  it('regímenes: elástico, inelástico, pegado y aislado', () => {
    expect(classifyCollision([], 0.98, false)).toBe('elastic');
    expect(classifyCollision([], 0.6, false)).toBe('inelastic');
    expect(classifyCollision([], 0, true)).toBe('sticky');
    expect(isolated(0.001, 0.24)).toBe(true);
    expect(isolated(0.02, 0.24)).toBe(false);
  });
});

describe('F07 · choques simulados contra la solución cerrada', () => {
  for (const k of [500, 1500, 8000]) {
    it(`resorte con k = ${k} N/m: velocidades finales y Σp conservado; contacto más corto cuanto más rígido`, () => {
      const r = readyWorld({ contactK: k, e: 1 });
      const rec = collide(r);
      const [u1, u2] = rec.vBefore!;
      const [v1, v2] = finalVelocities(r.w.params.m1, r.w.params.m2, u1, u2, 1);
      expect(rec.vAfter![0]).toBeCloseTo(v1, 2);
      expect(rec.vAfter![1]).toBeCloseTo(v2, 2);
      expect(Math.abs(rec.pAfter! - rec.pBefore!)).toBeLessThan(1e-3);
      const dur = rec.contactEndT! - rec.contactT!;
      expect(dur).toBeGreaterThan(0.004);
      expect(dur).toBeLessThan(k === 8000 ? 0.03 : 0.12);
    });
  }

  it('restitución parcial e = 0,7: la restitución medida con las velocidades verdaderas es 0,7', () => {
    const r = readyWorld({ e: 0.7 });
    const rec = collide(r);
    const e = restitution(rec.vBefore![0], rec.vBefore![1], rec.vAfter![0], rec.vAfter![1]);
    expect(e).toBeCloseTo(0.7, 1);
    expect(Math.abs(rec.pAfter! - rec.pBefore!)).toBeLessThan(1e-3);
  });

  it('velcro fijado: salen juntos con v = m₁u₁/(m₁+m₂) y se pierde 1 − m₁/(m₁+m₂) de la energía cinética', () => {
    const r = readyWorld({}, 'CURRICULAR', 'velcro');
    const rec = collide(r);
    expect(rec.stuck).toBe(true);
    expect(r.w.bumper.joined).toBe(true);
    const { m1, m2 } = r.w.params;
    const vf = stickVelocity(m1, m2, rec.vBefore![0], rec.vBefore![1]);
    expect(rec.vAfter![0]).toBeCloseTo(vf, 2);
    expect(rec.vAfter![1]).toBeCloseTo(vf, 2);
    const lost = keLostPct(kineticEnergy(m1, rec.vBefore![0]), kineticEnergy(m1 + m2, vf));
    expect(lost).toBeCloseTo(100 * (1 - m1 / (m1 + m2)), 0);
  });

  it('imanes que se repelen rebotan sin tocarse; con polos opuestos se atraen y quedan unidos', () => {
    const ok = readyWorld({}, 'CURRICULAR', 'magnet');
    const rec = collide(ok);
    expect(rec.stuck).toBe(false);
    expect(rec.vAfter![1]).toBeGreaterThan(0.3);
    const bad = readyWorld({}, 'CURRICULAR', 'magnet');
    if (bad.w.bumper.polarityOk) bad.C({ type: 'flipMagnet' });
    expect(bad.w.bumper.polarityOk).toBe(false);
    const rb = collide(bad);
    expect(rb.stuck).toBe(true);
    expect((bad.w.evidence['err:E07'] ?? 0) > 0).toBe(true);
  });

  it('velocidad del centro de masa: igual antes y después del choque (sin fuerzas externas)', () => {
    const r = readyWorld();
    r.C({ type: 'loadCart', id: 'cw200', cart: 'cartB', on: true });
    const rec = collide(r);
    const mB = r.w.params.m2 + 0.2;
    const vcm = (v: [number, number]) => (r.w.params.m1 * v[0] + mB * v[1]) / (r.w.params.m1 + mB);
    expect(vcm(rec.vAfter!)).toBeCloseTo(vcm(rec.vBefore!), 3);
    const mo = r.w.readings[r.C({ type: 'readMotion' }).id!];
    expect(mo.motion!.trueVcm).toBeCloseTo(vcm(rec.vBefore!), 2);
  });
});

describe('F07 · conservación y balances', () => {
  it('modo realista: el balance de energía cierra y el impulso externo explica el cambio de Σp', () => {
    const r = readyWorld({}, 'REALISTIC');
    for (let i = 0; i < 2; i++) collide(r);
    expect(Math.abs(energyResidualJ(r.w))).toBeLessThan(1e-3);
    expect(Math.abs(totalMomentum(r.w) - r.w.momentum.externalNs)).toBeLessThan(1e-3);
    const s = f07Summary(r.w);
    expect(Object.values(s).every((v) => typeof v !== 'number' || Number.isFinite(v))).toBe(true);
  });

  it('el freno puesto o el riel inclinado dan un impulso externo durante el choque', () => {
    const r = readyWorld();
    r.C({ type: 'setCartBrake', cart: 'cartB', on: true });
    const rec = collide(r);
    expect(Math.abs(rec.extJ)).toBeGreaterThan(0.002);
    expect((r.w.evidence['err:E10'] ?? 0) > 0).toBe(true);
  });

  it('el paso fijo hace al motor determinista: misma semilla, mismo resultado', () => {
    const a = collide(readyWorld({}, 'REALISTIC'));
    const b = collide(readyWorld({}, 'REALISTIC'));
    expect(a.vAfter).toEqual(b.vAfter);
    expect(a.trueJ).toBe(b.trueJ);
  });
});
