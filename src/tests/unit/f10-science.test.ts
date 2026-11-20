/**
 * F10 — ciencia (§17, matriz «Unitarias»): oráculos de la especificación (viga de 4 N con carga de 2 N al centro →
 * R = 3,00 N; Hooke F = 300 N, L₀ = 0,5 m, E = 200 GPa, A = 1e-4 m² → ΔL = 7,5e-6 m), ecuaciones del modelo,
 * incertidumbre, la viga y la prensa simuladas contra la solución cerrada (estática, vuelco, Hooke, descarga elástica
 * y deformación residual), regímenes de validez y balances.
 */
import { describe, expect, it } from 'vitest';
import { circleArea, hookeElongation, linearFit, reactionA, reactionB, relDiff, strain, stress, tipsOver, torqueAbout, youngModulus } from '../../simulation/models/f10/equations';
import { relUYoung, uReactionB, typeA } from '../../simulation/models/f10/uncertainty';
import { F10_REFERENCE } from '../../simulation/models/f10/reference';
import { classifyBeamReading, classifyPressReading, isElastic } from '../../simulation/models/f10/regimes';
import { energyResidualF10, staticsF10 } from '../../simulation/f10-world/conservation';
import { areaM2, balancePointF10, f10Summary, linFitF10, wedgeTiltF10 } from '../../simulation/f10-world/world';
import type { F10Command } from '../../simulation/f10-world/commands';
import type { F10Params } from '../../simulation/f10-world/types';
import * as h from '../helpersF10';

/** Mundo con EPP y una función de comando. */
function started(o: { params?: Partial<F10Params>; mode?: F10Params['scientificMode']; seed?: number } = {}) {
  const w = h.worldF10({ scientificMode: o.mode ?? 'CURRICULAR', params: o.params, seed: o.seed });
  const C = (c: F10Command) => h.cmdF10(w, c);
  for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) C({ type: 'equipPpe', item, on: true });
  C({ type: 'startWork' });
  return { w, C, run: (s: number) => h.runF10(w, s) };
}

/** Viga en apoyos trabados, sensores en cero, asentada. */
function beam(sA = 10, sB = 110, o: Parameters<typeof started>[0] = {}) {
  const x = started(o);
  const { C } = x;
  C({ type: 'setSupport', id: 'A', sCm: sA });
  C({ type: 'setSupport', id: 'B', sCm: sB });
  for (const id of ['A', 'B'] as const) C({ type: 'clampSupport', id, on: true });
  C({ type: 'connect', channel: 'cells', on: true });
  C({ type: 'zeroCells' });
  C({ type: 'placeBeam', where: 'supports' });
  C({ type: 'seatBeam' });
  C({ type: 'closeHook', id: 'load1', on: true });
  return x;
}

/** Prensa lista con la probeta tomada, comparador y celda en cero. */
function press(o: Parameters<typeof started>[0] = {}) {
  const x = started(o);
  const { C, run } = x;
  C({ type: 'installSpecimen', id: 'spec1' });
  C({ type: 'alignGrips' });
  C({ type: 'lockCrank', on: false });
  C({ type: 'clampGrip', grip: 'bottom', on: true });
  C({ type: 'clampGrip', grip: 'top', on: true });
  for (const ch of ['press', 'gauge'] as const) C({ type: 'connect', channel: ch, on: true });
  C({ type: 'calibrateGauge' });
  C({ type: 'mountGauge', axis: 'axial' });
  C({ type: 'routeCable', on: true });
  C({ type: 'setCellRange', n: 1 });
  C({ type: 'setShield', closed: true });
  C({ type: 'zeroLoadCell' });
  C({ type: 'zeroGauge' });
  const to = (mm: number) => {
    C({ type: 'setCrank', mm });
    h.waitPress(() => x.w, run);
  };
  return { ...x, to };
}

describe('F10 — oráculos de la especificación (§8)', () => {
  it('viga de 4,00 N apoyada en sus extremos con 2,00 N al centro ⇒ R_A = R_B = 3,00 N', () => {
    const B = F10_REFERENCE.beam;
    const loads = [{ W: B.W, x: B.L / 2 }];
    expect(Math.abs(relDiff(reactionB(B.Wb, B.L / 2, loads, 0, B.L), B.R))).toBeLessThan(B.tolPct);
    expect(Math.abs(relDiff(reactionA(B.Wb, B.L / 2, loads, 0, B.L), B.R))).toBeLessThan(B.tolPct);
    const O = F10_REFERENCE.offset;
    expect(reactionB(B.Wb, 0.5, [{ W: B.W, x: O.x }], 0, 1)).toBeCloseTo(O.RB, 10);
    expect(reactionA(B.Wb, 0.5, [{ W: B.W, x: O.x }], 0, 1)).toBeCloseTo(O.RA, 10);
  });

  it('Hooke: F = 300 N, L₀ = 0,50 m, E = 200 GPa, A = 1e-4 m² ⇒ ΔL = 7,5e-6 m (< 0,1 %)', () => {
    const H = F10_REFERENCE.hooke;
    expect(Math.abs(relDiff(hookeElongation(H.F, H.L0, H.E, H.A), H.dL))).toBeLessThan(H.tolPct);
    expect(youngModulus(stress(H.F, H.A), strain(H.dL, H.L0))).toBeCloseTo(H.E, -3);
  });

  it('ecuaciones auxiliares: área, torque, vuelco y ajuste lineal', () => {
    expect(circleArea(2)).toBeCloseTo(Math.PI, 12);
    expect(torqueAbout(2, 0.3, 0.1)).toBeCloseTo(0.4, 12);
    expect(tipsOver(1, -0.1)).toBe(true);
    expect(tipsOver(1, 0)).toBe(false);
    const f = linearFit([1, 2, 3, 4], [3, 5, 7, 9])!;
    expect(f.b).toBeCloseTo(2, 12);
    expect(f.a).toBeCloseTo(1, 12);
    expect(f.ub).toBeCloseTo(0, 12);
    expect(linFitF10([1, 2, 3], [2, 4, 6])!.b).toBeCloseTo(2, 12);
    expect(Number.isNaN(stress(1, 0))).toBe(true);
    expect(Number.isNaN(reactionB(1, 0, [], 1, 1))).toBe(true);
  });

  it('incertidumbre: u(E)/E combina F, L₀, d (doble) y ΔL; u(R_B) crece con la incertidumbre de las posiciones', () => {
    expect(relUYoung(1000, 10, 300, 0, 5, 0, 0.25, 0)).toBeCloseTo(0.01, 12);
    expect(relUYoung(1000, 0, 300, 0, 5, 0.05, 0.25, 0)).toBeCloseTo(0.02, 12);
    expect(uReactionB(4.9, 0.01, 4.9, 0.01, 50, 50, 100, 0.1)).toBeGreaterThan(uReactionB(4.9, 0.01, 4.9, 0.01, 50, 50, 100, 0));
    expect(typeA([1, 1, 1])).toBe(0);
  });

  it('regímenes: la viga inválida con banderas; la prensa elástica, plástica o inválida', () => {
    expect(classifyBeamReading([])).toBe('static');
    expect(classifyBeamReading(['HAND_ON'])).toBe('invalid');
    expect(classifyPressReading([])).toBe('elastic');
    expect(classifyPressReading(['PLASTIC'])).toBe('plastic');
    expect(classifyPressReading(['ECCENTRIC', 'PLASTIC'])).toBe('invalid');
    expect(isElastic(200e6, 250e6)).toBe(true);
    expect(isElastic(240e6, 250e6)).toBe(false);
  });
});

describe('F10 — viga simulada', () => {
  it('las reacciones de los sensores cumplen ΣF = 0 y Στ = 0 (modo curricular)', () => {
    const { w, C, run } = beam();
    C({ type: 'hangLoad', id: 'load1', sCm: 90 });
    run(2);
    const a = h.readingOfF10(w, C({ type: 'readCell', id: 'A' }));
    const b = h.readingOfF10(w, C({ type: 'readCell', id: 'B' }));
    expect(a.qualityFlags).toEqual([]);
    const W = (w.params.beamKg + w.params.loadKg) * w.params.g;
    expect(a.value + b.value).toBeCloseTo(W, 1);
    const RB = reactionB(w.params.beamKg * w.params.g, 60, [{ W: w.params.loadKg * w.params.g, x: 90 }], 10, 110);
    expect(Math.abs(b.value - RB)).toBeLessThanOrEqual(0.006);
  });

  it('con la carga fuera de los apoyos la reacción del lado opuesto sale negativa y la viga vuelca hasta el tope', () => {
    const { w, C, run } = beam(10, 60);
    C({ type: 'hangLoad', id: 'load1', sCm: 115 });
    const st = staticsF10(w);
    expect(st.RA).toBeLessThan(0);
    expect(w.beam.pivot).toBe('B');
    run(0.2);
    expect(w.beam.angle).toBeGreaterThan(0);
    run(2);
    expect(w.beam.tipped).toBe(true);
    expect(Math.tan(w.beam.angle) * (w.params.beamLenCm - 60)).toBeCloseTo(w.params.tipDropCm, 6);
    expect(Math.abs(energyResidualF10(w))).toBeLessThan(1e-9);
  });

  it('el vuelco tarda lo que predice la caída libre angular (convergencia con el paso)', () => {
    const tFall = (sub: number) => {
      const { w, C, run } = beam(10, 60, { params: { subSteps: sub } });
      C({ type: 'hangLoad', id: 'load1', sCm: 115 });
      let t = 0;
      while (!w.beam.tipped && t < 5) {
        run(0.05);
        t += 0.05;
      }
      return { t, w };
    };
    const a = tFall(10);
    const b = tFall(40);
    expect(a.t).toBeGreaterThan(0.1);
    expect(Math.abs(a.t - b.t)).toBeLessThanOrEqual(0.05);
  });

  it('la cuña muestra hacia dónde cae la viga y equilibra en el centro de masa corrido por la inclinación', () => {
    const { w, C } = started({ mode: 'REALISTIC', seed: 3 });
    C({ type: 'placeBeam', where: 'wedge' });
    const bp = balancePointF10(w);
    expect(Math.abs(bp - w.cgS)).toBeGreaterThan(0.05);
    C({ type: 'slideOnWedge', sCm: bp + 2 });
    expect(wedgeTiltF10(w)).toBe('left');
    C({ type: 'slideOnWedge', sCm: bp - 2 });
    expect(wedgeTiltF10(w)).toBe('right');
    C({ type: 'levelBench' });
    C({ type: 'slideOnWedge', sCm: w.cgS });
    expect(wedgeTiltF10(w)).toBe('level');
  });
});

describe('F10 — prensa simulada', () => {
  it('en la zona elástica ΔL = F L₀ / (E A) y la descarga devuelve la probeta a cero', () => {
    const { w, C, to } = press();
    to(0.2);
    const f = h.readingOfF10(w, C({ type: 'readLoadCell' }));
    const e = h.readingOfF10(w, C({ type: 'readGauge' }));
    expect(f.qualityFlags).toEqual([]);
    expect(e.qualityFlags).toEqual([]);
    const A = areaM2(w.specimens.spec1.dMm);
    expect(e.value * 1e-3).toBeCloseTo(hookeElongation(f.value, w.params.L0mm * 1e-3, 200e9, A), 6);
    to(0);
    expect(w.press.forceN).toBe(0);
    expect(h.readingOfF10(w, C({ type: 'readGauge' })).value).toBe(0);
  });

  it('pasada la fluencia la descarga es elástica y deja un residual ε_p = (σ_max − σ_y)/(E + H)·(1 + …)', () => {
    const { w, to } = press();
    to(0.6);
    const p = w.params;
    const m = p.materials.steel;
    const Et = m.E * p.hardening;
    const H = (m.E * Et) / (m.E - Et);
    const sigTrial = (m.E * 0.6) / p.L0mm;
    const epsP = (sigTrial - m.sigmaY) / (m.E + H);
    expect(w.specimens.spec1.epsP).toBeCloseTo(epsP, 6);
    const Fpeak = w.press.forceN;
    expect(Fpeak / areaM2(w.specimens.spec1.dMm)).toBeCloseTo(m.sigmaY + H * epsP, -4);
    to(0);
    expect(w.press.forceN).toBe(0);
    expect(w.press.elongMm).toBeCloseTo(epsP * p.L0mm, 6);
    expect(w.energy.plasticJ).toBeGreaterThan(0);
    expect(Math.abs(energyResidualF10(w))).toBeLessThan(1e-9);
  });

  it('la curva registra la rigidez E A / L₀ del tramo elástico y su fuerza máxima', () => {
    const { w, C, to } = press();
    C({ type: 'setRate', hz: 100 });
    C({ type: 'startLog' });
    to(0.6);
    to(0);
    C({ type: 'stopLog' });
    const r = h.readingOfF10(w, C({ type: 'readCurve' }));
    const k = (200e9 * areaM2(w.specimens.spec1.dMm)) / w.params.L0mm;
    expect(r.qualityFlags).toEqual([]);
    expect(Math.abs(r.fit!.k! / k - 1)).toBeLessThan(0.01);
    expect(r.fit!.res!).toBeGreaterThan(0.2);
    expect(f10Summary(w).F).toBe(0);
  });
});
