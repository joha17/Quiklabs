/**
 * F04 — ciencia (§17, matriz «Unitarias»): oráculos de la especificación (m_c = 0,45 kg y m_h = 0,05 kg →
 * a = 0,981 m/s² y T = 0,44145 N con error < 0,3 %; tercera ley |F_A + F_B| < 0,03 N), ecuaciones del modelo
 * (polea con inercia y roce, tensiones de cada tramo, fotopuertas), incertidumbres, instrumentos (sensor de fuerza y
 * acelerómetro), el ensayo simulado contra la solución cerrada, la convergencia al refinar el paso, la conservación y
 * la regla de que ningún contacto crea energía.
 */
import { describe, expect, it } from 'vitest';
import { effectiveMass, gateSpeed, idealAccel, idealTension, kinematicAccel, linFit, realAccel, tensions, tiltFromRest } from '../../simulation/models/f04/equations';
import { uGateSpeed, uIdealAccel } from '../../simulation/models/f04/uncertainty';
import { F04_REFERENCE } from '../../simulation/models/f04/reference';
import { classifyRun, lossFraction, stringTaut } from '../../simulation/models/f04/regimes';
import { accelIndication, forceIndication } from '../../simulation/instruments/force-sensor';
import { DEFAULT_F04_PARAMS } from '../../practices/practice-f04/params';
import { energyResidualJ } from '../../simulation/f04-world/conservation';
import { CART_START_S, FLOOR_DEPTH, PULLEY_S, STRING_FREE_M } from '../../simulation/f04-world/geometry';
import { f04Summary, tautDepth } from '../../simulation/f04-world/world';
import type { F04World } from '../../simulation/f04-world/types';
import * as h from '../helpersF04';

const rel = (x: number, ref: number) => Math.abs(x - ref) / Math.abs(ref);

/** Carril nivelado con cordel tenso, sensores calibrados y en cero. */
function readyWorld(mode: 'CURRICULAR' | 'REALISTIC', params: Partial<F04World['params']> = {}) {
  const w = h.worldF4({ scientificMode: mode, params });
  const C = (c: Parameters<typeof h.cmdF4>[1]) => h.cmdF4(w, c);
  for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) C({ type: 'equipPpe', item, on: true });
  C({ type: 'startWork' });
  for (const ch of ['accel01', 'forceA', 'gates'] as const) C({ type: 'connect', channel: ch, on: true });
  C({ type: 'setRate', hz: 200 });
  C({ type: 'clipCable', on: true });
  C({ type: 'calibrateSensor', id: 'forceA' });
  C({ type: 'zeroSensor', id: 'forceA' });
  h.levelTrack(() => w, C, (s) => h.runF4(w, s));
  C({ type: 'clampPulley', on: true });
  C({ type: 'threadString', path: 'groove' });
  C({ type: 'attachString', on: true });
  C({ type: 'hangHanger', on: true });
  C({ type: 'tensionString' });
  return w;
}

/** Instante (s desde la suelta) en que el centro del carro pasa por s, del muestreo verdadero. */
const releaseAndRun = (w: F04World, seconds = 4.5) => {
  h.cmdF4(w, { type: 'release' });
  h.runF4(w, seconds);
  return w.runs[w.runs.length - 1];
};

describe('F04 · oráculos', () => {
  it('sistema ideal: a = 0,981 m/s² y T = 0,44145 N (< 0,3 %)', () => {
    const o = F04_REFERENCE.ideal;
    expect(rel(idealAccel(o.mc, o.mh, o.g), o.a)).toBeLessThan(o.relTol);
    expect(rel(idealTension(o.mc, o.mh, o.g), o.T)).toBeLessThan(o.relTol);
    expect(rel(realAccel(o.mc, o.mh, o.g, 0, 0.025), o.a)).toBeLessThan(o.relTol);
  });

  it('el ensayo simulado en modo ideal reproduce a y T del oráculo (< 0,3 %)', () => {
    const w = readyWorld('CURRICULAR');
    const rec = releaseAndRun(w);
    const clean = rec.samples.filter((x) => x[0] > 0.1 && x[0] < (rec.landedT ?? 1) - 0.05);
    const a = clean.reduce((s, x) => s + x[3], 0) / clean.length;
    const T = clean.reduce((s, x) => s + x[4], 0) / clean.length;
    expect(rel(a, F04_REFERENCE.ideal.a)).toBeLessThan(0.003);
    expect(rel(T, F04_REFERENCE.ideal.T)).toBeLessThan(0.003);
    // El portapesas aterriza donde lo dice la cinemática: Δs = ½ a t².
    const travel = FLOOR_DEPTH - tautDepth(CART_START_S);
    expect(rec.landedT!).toBeCloseTo(Math.sqrt((2 * travel) / F04_REFERENCE.ideal.a), 2);
  });

  it('tercera ley: los dinamómetros opuestos leen +F y −F en el mismo contacto (|F_A + F_B| < 0,03 N)', () => {
    const w = h.worldF4({ scientificMode: 'CURRICULAR' });
    const C = (c: Parameters<typeof h.cmdF4>[1]) => h.cmdF4(w, c);
    for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) C({ type: 'equipPpe', item, on: true });
    C({ type: 'startWork' });
    C({ type: 'setRate', hz: 200 });
    for (const ch of ['dynP', 'dynQ'] as const) {
      C({ type: 'connect', channel: ch, on: true });
      C({ type: 'calibrateSensor', id: ch });
      C({ type: 'zeroSensor', id: ch });
    }
    C({ type: 'push', forceN: 4.5, durationS: 0.3 });
    h.runF4(w, 0.3);
    // Al terminar el empujón, el momento de la pareja es el impulso de la mano menos el que se llevó el roce: el
    // contacto entre los carros no crea ni destruye momento (fuerzas iguales y opuestas).
    const p = w.params.pairPKg * w.pair.vP + w.params.pairQKg * w.pair.vQ;
    expect(p).toBeLessThanOrEqual(w.momentum.handImpulse + 1e-9);
    expect(p).toBeGreaterThan(w.momentum.handImpulse - 2 * w.params.pairRollingN * 0.3 - 1e-6);
    h.runF4(w, 0.5);
    const r = w.readings[C({ type: 'readPair' }).id!];
    expect(r.pair!.FA!).toBeGreaterThan(2.5);
    expect(Math.abs(r.pair!.FA! + r.pair!.FB!)).toBeLessThan(F04_REFERENCE.thirdLaw.tol);
  });
});

describe('F04 · ecuaciones', () => {
  it('masa efectiva, polea real con roce e inclinación, y cordel que no alcanza a vencer el roce', () => {
    expect(effectiveMass(0.45, 0.05, 2e-5, 0.025)).toBeCloseTo(0.532, 6);
    const a = realAccel(0.45, 0.05, 9.81, 2e-5, 0.025, 0.02, 2e-4);
    expect(a).toBeCloseTo((0.4905 - 0.02 - 0.008) / 0.532, 6);
    expect(realAccel(0.45, 0.05, 9.81, 0, 0.025, 0, 0, 1)).toBeGreaterThan(idealAccel(0.45, 0.05, 9.81));
    expect(realAccel(0.45, 0.01, 9.81, 0, 0.025, 0.2)).toBe(0);
  });

  it('tensiones de cada tramo: la del lado del carro es menor por la inercia y el roce de la polea', () => {
    const a = 0.9;
    const { T1, T2 } = tensions(0.05, 9.81, a, 2e-5, 0.025, 2e-4);
    expect(T2).toBeCloseTo(0.05 * (9.81 - a), 9);
    expect(T1).toBeCloseTo(T2 - 0.032 * a - 0.008, 9);
    expect(stringTaut(T1)).toBe(true);
    expect(stringTaut(-0.01)).toBe(false);
  });

  it('fotopuertas: v = w/Δt y a = (v₂² − v₁²)/(2d); ajuste lineal e inclinación desde el reposo', () => {
    expect(gateSpeed(0.01, 0.0125)).toBeCloseTo(0.8, 9);
    expect(kinematicAccel(0.6, 1.0, 0.4)).toBeCloseTo(0.8, 9);
    expect(Number.isNaN(kinematicAccel(0.6, 1, 0))).toBe(true);
    const f = linFit([[0.8, 0.36], [1.0, 0.45], [1.2, 0.54]]);
    expect(f.m).toBeCloseTo(0.45, 9);
    expect(f.b).toBeCloseTo(0, 9);
    expect(tiltFromRest(-9.81 * Math.sin((0.5 * Math.PI) / 180), 9.81)).toBeCloseTo(0.5, 9);
  });

  it('incertidumbres y régimen: u(v) por ancho y reloj; u(a_pred) por las masas; ensayo ideal, real o inválido', () => {
    expect(uGateSpeed(0.01, 5e-5, 0.01, 1e-5)).toBeCloseTo(Math.hypot(0.005, 0.001), 9);
    expect(uIdealAccel(0.45, 0.0003, 0.05, 0.0003, 9.81)).toBeGreaterThan(0);
    expect(classifyRun([], 0.001)).toBe('ideal');
    expect(classifyRun([], lossFraction(0.45, 0.05, 9.81, 2e-5, 0.025, 0.02))).toBe('real');
    expect(classifyRun(['LANDED'], 0)).toBe('invalid');
  });
});

describe('F04 · instrumentos', () => {
  const P = DEFAULT_F04_PARAMS.force;
  it('sensor de fuerza: proyección cos α, pendiente, corrimiento, rango que recorta y signo de la interfaz', () => {
    const s = { offset: 0, scale: 1, angleDeg: 0, rangeIdx: 1 };
    expect(forceIndication(3, s, P).value).toBe(3);
    expect(forceIndication(3, { ...s, angleDeg: 60 }, P).value).toBeCloseTo(1.5, 2);
    expect(forceIndication(3, { ...s, scale: 1.04 }, P).value).toBeCloseTo(3.12, 2);
    expect(forceIndication(3, { ...s, offset: 0.1 }, P).value).toBeCloseTo(3.1, 2);
    const clip = forceIndication(3, { ...s, rangeIdx: 0 }, P);
    expect(clip.clipped).toBe(true);
    expect(clip.value).toBe(2);
    expect(forceIndication(-3, { ...s, axisSign: -1 }, P).value).toBe(3);
  });

  it('acelerómetro: aceleración propia cuantizada a 0,01 y recortada a ±10 m/s²', () => {
    expect(accelIndication(0.98123, 0, 10, 0.01, 0).value).toBe(0.98);
    expect(accelIndication(14, 0, 10, 0.01, 0)).toEqual({ value: 10, clipped: true });
  });

  it('el acelerómetro en reposo mide −g sen θ y así se nivela el carril', () => {
    const w = h.worldF4({ scientificMode: 'CURRICULAR' });
    const C = (c: Parameters<typeof h.cmdF4>[1]) => h.cmdF4(w, c);
    for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) C({ type: 'equipPpe', item, on: true });
    C({ type: 'startWork' });
    C({ type: 'connect', channel: 'accel01', on: true });
    h.runF4(w, 2);
    const r = w.readings[C({ type: 'readTilt' }).id!];
    expect(r.value).toBeCloseTo(-9.81 * Math.sin((w.track.tiltDeg * Math.PI) / 180), 2);
    h.levelTrack(() => w, C, (s) => h.runF4(w, s));
    expect(Math.abs(w.track.tiltDeg)).toBeLessThanOrEqual(0.1);
  });
});

describe('F04 · integración numérica y conservación', () => {
  it('converge al refinar los subpasos (paso de 5 ms frente a 1 ms)', () => {
    const a = readyWorld('REALISTIC');
    const b = readyWorld('REALISTIC', { subSteps: 50 });
    const ra = releaseAndRun(a);
    const rb = releaseAndRun(b);
    expect(Math.abs(ra.landedT! - rb.landedT!)).toBeLessThan(0.006);
    expect(Math.abs(ra.gates.gate2[0][0] - rb.gates.gate2[0][0])).toBeLessThan(1e-3);
  });

  it('la energía cierra durante el ensayo y la disipación nunca disminuye (ningún contacto crea energía)', () => {
    const w = readyWorld('REALISTIC');
    h.cmdF4(w, { type: 'setBrake', on: false });
    const e0 = energyResidualJ(w);
    h.cmdF4(w, { type: 'release' });
    let last = w.energy.dissipatedJ;
    for (let i = 0; i < 100; i++) {
      h.runF4(w, 0.05);
      expect(w.energy.dissipatedJ).toBeGreaterThanOrEqual(last - 1e-12);
      last = w.energy.dissipatedJ;
    }
    expect(Math.abs(energyResidualJ(w) - e0)).toBeLessThan(2e-3);
    // El carro chocó con el tope y el cordel volvió a tensarse: no hay penetración del tope.
    expect(w.cart.s).toBeLessThanOrEqual(w.stopS - 0.08 + 1e-9);
  });

  it('el cordel conserva su largo: el gancho baja lo que avanza el carro hasta tocar el suelo', () => {
    expect(STRING_FREE_M).toBeCloseTo(0.12 + PULLEY_S - (CART_START_S + 0.08), 12);
    const w = readyWorld('CURRICULAR');
    h.cmdF4(w, { type: 'release' });
    h.runF4(w, 0.6);
    expect(w.string.depth).toBeCloseTo(tautDepth(w.cart.s), 9);
    expect(w.string.vh).toBeCloseTo(w.cart.v, 9);
  });

  it('es determinista: la misma semilla y la misma cinta dan el mismo estado', () => {
    const a = h.idealRouteF4(31).w;
    const b = h.idealRouteF4(31).w;
    expect(f04Summary(a)).toEqual(f04Summary(b));
    expect(JSON.stringify(a.readings)).toBe(JSON.stringify(b.readings));
  });
});
