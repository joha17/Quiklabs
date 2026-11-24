/**
 * F12 — ciencia (§17, matriz «Unitarias»): oráculos de la especificación (Q = 1 L/s, D1 = 4 cm, D2 = 2 cm ⇒
 * v1 = 0,7958 m/s, v2 = 3,1831 m/s, Δp = 4774,65 Pa), ecuaciones del modelo, incertidumbre, el circuito simulado
 * contra la solución cerrada (continuidad, Bernoulli con pérdidas, curva de la bomba, golpe de ariete), regímenes de
 * validez y conservación.
 */
import { describe, expect, it } from 'vitest';
import {
  area, bernoulliDrop, dissipatedPower, linearFit, lossCoefficient, lossPressure, mach, originFit, relDiff, totalPressure, velocity, venturiDrop, venturiFlow, volumetricFlow,
} from '../../simulation/models/f12/equations';
import { uRhoSlopeB, uVelocity, uVolumetric } from '../../simulation/models/f12/uncertainty';
import { F12_REFERENCE } from '../../simulation/models/f12/reference';
import { INCOMPRESSIBLE_MACH, classifyFlowReading } from '../../simulation/models/f12/regimes';
import { A1, A2, conservedTotalsF12 } from '../../simulation/f12-world/conservation';
import { SF12, f12Summary, hydraulicsF12, steadyQF12 } from '../../simulation/f12-world/world';
import type { F12Command } from '../../simulation/f12-world/commands';
import type { F12Params } from '../../simulation/f12-world/types';
import * as h from '../helpersF12';

/** Mundo con EPP, circuito cerrado y purgado, sensores en cero (modo curricular salvo que se pida). */
function circuit(o: { params?: Partial<F12Params>; mode?: F12Params['scientificMode']; seed?: number; scenarios?: string[]; valve?: number } = {}) {
  const w = h.worldF12({ scientificMode: o.mode ?? 'CURRICULAR', params: o.params, seed: o.seed, scenarios: o.scenarios as never });
  const C = (c: F12Command) => h.cmdF12(w, c);
  const run = (s: number) => h.runF12(w, s);
  for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) C({ type: 'equipPpe', item, on: true });
  C({ type: 'startWork' });
  for (const j of ['J1', 'J2', 'J3'] as const) {
    C({ type: 'fitGasket', joint: j });
    C({ type: 'connectJoint', joint: j, on: true });
  }
  C({ type: 'clampVenturi', on: true });
  C({ type: 'setValve', pos: o.valve ?? 2 });
  for (const i of [1, 2, 3] as const) {
    C({ type: 'connectSensor', sensor: i, port: i });
    C({ type: 'capPort', port: i, on: false });
  }
  C({ type: 'setRange', idx: 1 });
  C({ type: 'setRate', hz: 20 });
  h.purge(() => w, C, run);
  h.stopPump(() => w, C, run);
  run(3);
  C({ type: 'calibrateSensors' });
  C({ type: 'zeroSensors' });
  C({ type: 'newSeries' });
  return { w, C, run };
}

describe('F12 — oráculos de la especificación', () => {
  it('Q = 1 L/s por D1 = 4 cm y D2 = 2 cm: v1 = 0,7958 m/s y v2 = 3,1831 m/s (< 0,2 %)', () => {
    const r = F12_REFERENCE.velocities;
    const v1 = velocity(r.Q, area(r.D1));
    const v2 = velocity(r.Q, area(r.D2));
    expect(Math.abs(v1 / r.v1 - 1)).toBeLessThan(r.tolRel);
    expect(Math.abs(v2 / r.v2 - 1)).toBeLessThan(r.tolRel);
    expect((v1 * area(r.D1)) / (v2 * area(r.D2))).toBeCloseTo(1, 12);
  });

  it('Δp = ½ρ(v2² − v1²) = 4749,4 Pa (±10 Pa), igual por velocidades o por caudal (la cifra 4774,65 de la especificación está mal sumada)', () => {
    const r = F12_REFERENCE;
    const v1 = r.velocities.Q / area(r.velocities.D1);
    const v2 = r.velocities.Q / area(r.velocities.D2);
    expect(Math.abs(bernoulliDrop(r.drop.rho, v1, v2) - r.drop.dp)).toBeLessThan(r.drop.tolPa);
    expect(Math.abs(venturiDrop(r.drop.rho, r.velocities.Q, r.velocities.D1, r.velocities.D2) - r.drop.dp)).toBeLessThan(r.drop.tolPa);
    expect(venturiFlow(r.drop.rho, r.drop.dp, r.velocities.D1, r.velocities.D2)).toBeCloseTo(r.velocities.Q, 6);
    expect(Math.abs(bernoulliDrop(r.drop.rho, r.velocities.v1, r.velocities.v2) - r.drop.specDp)).toBeGreaterThan(r.drop.tolPa);
  });
});

describe('F12 — ecuaciones e incertidumbre', () => {
  it('pérdidas, K con corrección de altura, potencia, presión total, caudal volumétrico y Mach', () => {
    expect(lossPressure(1000, 2, 1)).toBe(1000);
    expect(lossCoefficient(1000, 9.81, 1000 + 981, 0.1, 1)).toBeCloseTo(2, 9);
    expect(dissipatedPower(0.001, 2000)).toBe(2);
    expect(totalPressure(1000, 1000, 2)).toBe(3000);
    expect(volumetricFlow(900, 1.5)).toBeCloseTo(0.6, 12);
    expect(mach(100, 343)).toBeGreaterThan(INCOMPRESSIBLE_MACH * 0.95);
    expect(relDiff(1.02, 1)).toBeCloseTo(2, 9);
    expect(Number.isNaN(area(-1))).toBe(true);
    expect(Number.isNaN(venturiFlow(1000, -5, 0.04, 0.02))).toBe(true);
  });

  it('ajuste lineal y por el origen recuperan la pendiente', () => {
    const xs = [1, 2, 3, 4, 5];
    const lf = linearFit(xs, xs.map((x) => 3 * x + 1))!;
    expect(lf.b).toBeCloseTo(3, 9);
    expect(lf.a).toBeCloseTo(1, 9);
    expect(originFit(xs, xs.map((x) => 998 * x))!.b).toBeCloseTo(998, 9);
  });

  it('propagación: caudal volumétrico, velocidad y ρ del ajuste', () => {
    expect(uVolumetric(0.6, 900, 5, 1.5, 0.1)).toBeCloseTo(0.6 * Math.hypot(5 / 900, 0.1 / 1.5), 12);
    expect(uVelocity(3.18, 0.001, 0.00001, 2, 0.005)).toBeCloseTo(3.18 * Math.hypot(0.01, 0.005), 9);
    const u = uRhoSlopeB(1000, 10, 5000, 0.00001, 0.001, 0.005, 2);
    expect(u).toBeGreaterThan(0);
    expect(u).toBeLessThan(50);
  });

  it('regímenes: el transitorio, la fuga, el aire o una toma tapada invalidan la lectura', () => {
    expect(classifyFlowReading([])).toBe('steady');
    for (const f of ['TRANSIENT', 'LEAK', 'AIR', 'BLOCKED', 'PITOT']) expect(classifyFlowReading([f])).toBe('invalid');
  });
});

describe('F12 — circuito simulado contra la solución cerrada', () => {
  it('en régimen, continuidad Q = A1 v1 = A2 v2 y Bernoulli exacto en modo curricular', () => {
    const { w, C, run } = circuit();
    C({ type: 'setSpeed', value: 0.7 });
    C({ type: 'setPump', on: true });
    h.waitSteady(() => w, run);
    const hy = hydraulicsF12(w);
    expect(hy.Q).toBeCloseTo(steadyQF12(w), 6);
    expect(hy.v[1] * A1(w)).toBeCloseTo(hy.v[2] * A2(w), 12);
    expect(hy.p[1] - hy.p[2]).toBeCloseTo(0.5 * w.params.rho * (hy.v[2] ** 2 - hy.v[1] ** 2), 1);
    expect(hy.p[1]).toBeCloseTo(hy.p[3], 1);
  });

  it('la curva de la bomba fija el punto de trabajo y el caudal crece con la velocidad', () => {
    const { w } = circuit();
    const q = [0.4, 0.6, 0.8, 1].map((n) => steadyQF12(w, n));
    for (let i = 1; i < q.length; i++) expect(q[i]).toBeGreaterThan(q[i - 1]);
    const n = 0.8;
    const pOut = hydraulicsF12(w, q[2], 0, false).pOut;
    expect(pOut).toBeCloseTo(w.params.pump.H0 * n * n - w.params.pump.kq * q[2] ** 2, -1);
  });

  it('las pérdidas declaradas aparecen en Δp13 (modo realista, tramo rugoso)', () => {
    const { w, C, run } = circuit({ mode: 'REALISTIC' });
    h.stopPump(() => w, C, run);
    C({ type: 'swapSpool', kind: 'rough' });
    h.purge(() => w, C, run, 0.6);
    h.waitSteady(() => w, run);
    const hy = hydraulicsF12(w);
    const half = 0.5 * w.params.rho;
    const K = w.params.K;
    const expected = (K.conv + K.diff) * half * hy.v[2] ** 2 + K.rough * half * hy.v[3] ** 2;
    expect(hy.p[1] - hy.p[3]).toBeCloseTo(expected, 1);
    expect(hy.power).toBeCloseTo(hy.Qv * hy.loss13, 9);
  });

  it('la válvula más cerrada baja el caudal y sube la presión aguas arriba', () => {
    const a = circuit({ valve: 3 }).w;
    const b = circuit({ valve: 2 }).w;
    const qa = steadyQF12(a, 0.7);
    const qb = steadyQF12(b, 0.7);
    expect(qb).toBeLessThan(qa);
    expect(hydraulicsF12(b, qb, 0, false).p[3]).toBeGreaterThan(hydraulicsF12(a, qa, 0, false).p[3]);
  });

  it('el golpe de ariete del cierre brusco es ρ c v1 atenuado por la duración de la maniobra', () => {
    const { w, C, run } = circuit({ mode: 'REALISTIC' });
    C({ type: 'setSpeed', value: 0.6 });
    C({ type: 'setPump', on: true });
    h.waitSteady(() => w, run);
    const v1 = hydraulicsF12(w).v[1];
    C({ type: 'setValve', pos: 0 });
    const p = w.params;
    const Tw = (2 * (p.lenM.up + p.lenM.test + p.lenM.down)) / p.waveC;
    expect(w.flow.surgePa).toBeCloseTo(p.rho * p.waveC * v1 * Math.min(1, Tw / 0.3), 0);
  });

  it('la fuga de una junta resta caudal aguas abajo (continuidad con pérdida de masa)', () => {
    const w = h.worldF12({ scenarios: [SF12.LEAK] });
    w.circuit.joints.J1.connected = w.circuit.joints.J2.connected = w.circuit.joints.J3.connected = true;
    w.circuit.joints.J2.gasket = w.circuit.joints.J3.gasket = true;
    w.circuit.joints.J1.gasket = true;
    const hy = hydraulicsF12(w, 0.001, 0, false);
    expect(hy.leak.J1).toBeGreaterThan(0);
    expect(hy.Qv).toBeCloseTo(0.001 - hy.leak.J1, 12);
  });

  it('el paso es determinista y conserva el agua', () => {
    const a = circuit({ mode: 'REALISTIC', seed: 5 });
    const b = circuit({ mode: 'REALISTIC', seed: 5 });
    for (const x of [a, b]) {
      x.C({ type: 'setSpeed', value: 0.75 });
      x.C({ type: 'setPump', on: true });
      x.run(5);
    }
    expect(f12Summary(a.w)).toEqual(f12Summary(b.w));
    expect(conservedTotalsF12(a.w).waterCm3).toBeCloseTo(a.w.initialTotals.waterCm3, 3);
  });
});
