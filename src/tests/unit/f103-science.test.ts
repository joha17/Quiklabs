/**
 * F103 — ciencia (§17, matriz «Unitarias»): oráculos de la especificación (v₀ = 8,00 m/s a 45° sobre suelo nivelado →
 * R = 6,524 m y T = 1,153 s con error < 0,5 %; ángulos complementarios con el mismo alcance), ecuaciones del modelo,
 * ajuste de la trayectoria, incertidumbres, instrumentos (fotopuerta de esfera, plataforma de impacto) y el vuelo
 * simulado contra la parábola.
 */
import { describe, expect, it } from 'vitest';
import {
  components, flightTime, gateSpeed, levelRange, levelTime, maxHeight, peakTime, rangeWithDrop, relErrorPct, trajectoryFit, trajectoryY, v0FromRange, vyAt,
} from '../../simulation/models/f103/equations';
import { uGateSpeed, uRangePred } from '../../simulation/models/f103/uncertainty';
import { F103_REFERENCE } from '../../simulation/models/f103/reference';
import { classifyShot, dragFraction, parabolaValid } from '../../simulation/models/f103/regimes';
import { chordOf, gateCrossing, resolvedAt, sampledInterval } from '../../simulation/instruments/ball-gate';
import { clockIndication, onPlatform, platformIndication } from '../../simulation/instruments/impact-platform';
import { DEFAULT_F103_PARAMS } from '../../practices/practice-f103/params';
import { energyResidualJ } from '../../simulation/f103-world/conservation';
import { elevationF3, muzzleF3 } from '../../simulation/f103-world/world';
import * as h from '../helpersF103';

const rel = (x: number, ref: number) => Math.abs(x - ref) / Math.abs(ref);

/** Mundo listo para disparar (anclado, nivelado, barrera cerrada, protector fuera, plataforma lejos). */
function readyWorld(mode: 'CURRICULAR' | 'REALISTIC') {
  const w = h.worldF3({ scientificMode: mode });
  for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) h.cmdF3(w, { type: 'equipPpe', item, on: true });
  h.cmdF3(w, { type: 'startWork' });
  h.cmdF3(w, { type: 'anchorStand', on: true });
  h.levelStand((c) => h.cmdF3(w, c), (s) => h.runF3(w, s));
  h.cmdF3(w, { type: 'movePlatform', xCm: 650, yCm: -95 });
  h.cmdF3(w, { type: 'closeBarrier', on: true });
  h.cmdF3(w, { type: 'setCap', on: false });
  return w;
}

describe('F103 · oráculos', () => {
  it('v₀ = 8,00 m/s a 45° sobre suelo nivelado: R = 6,524 m y T = 1,153 s (< 0,5 %)', () => {
    const o = F103_REFERENCE.level45;
    expect(rel(levelRange(o.v0, o.thetaDeg, o.g), o.R)).toBeLessThan(o.relTol);
    expect(rel(levelTime(o.v0, o.thetaDeg, o.g), o.T)).toBeLessThan(o.relTol);
    expect(rel(rangeWithDrop(o.v0, o.thetaDeg, 0, o.g), o.R)).toBeLessThan(o.relTol);
    expect(rel(flightTime(o.v0, o.thetaDeg, 0, o.g), o.T)).toBeLessThan(o.relTol);
  });

  it('ángulos complementarios (30° y 60°) dan el mismo alcance a nivel (< 0,5 %)', () => {
    const o = F103_REFERENCE.complementary;
    expect(rel(levelRange(o.v0, o.a, o.g), levelRange(o.v0, o.b, o.g))).toBeLessThan(0.005);
    // Con la boca elevada ya no: el ángulo menor llega más lejos.
    expect(rangeWithDrop(o.v0, o.a, 1, o.g)).toBeGreaterThan(rangeWithDrop(o.v0, o.b, 1, o.g));
  });

  it('el vuelo simulado (modo ideal) cae donde dice la parábola desde la boca hasta el suelo', () => {
    const w = readyWorld('CURRICULAR');
    h.setAndRead((c) => h.cmdF3(w, c), (s) => h.runF3(w, s), 45);
    const m = muzzleF3(w);
    const elev = elevationF3(w);
    h.cmdF3(w, { type: 'loadBall', ball: 'ballA' });
    h.cmdF3(w, { type: 'cock', notch: 2 });
    h.cmdF3(w, { type: 'fire' });
    const f = w.flight!;
    const v0 = f.v0;
    h.waitLanded(() => w, (s) => h.runF3(w, s));
    const c = f.contacts[0];
    expect(c.on).toBe('floor');
    const R = rangeWithDrop(v0, elev, m.z - f.radius, w.params.g);
    expect(Math.abs(c.x - m.x - R)).toBeLessThan(0.005);
    expect(Math.abs(c.t - f.launchedS - flightTime(v0, elev, m.z - f.radius, w.params.g))).toBeLessThan(0.003);
    expect(Math.abs(energyResidualJ(w))).toBeLessThan(1e-6);
  });

  it('con aire (modo realista) el mismo disparo cae más corto que la parábola, en pocos %', () => {
    const w = readyWorld('REALISTIC');
    h.setAndRead((c) => h.cmdF3(w, c), (s) => h.runF3(w, s), 45);
    const m = muzzleF3(w);
    const elev = elevationF3(w);
    h.cmdF3(w, { type: 'loadBall', ball: 'ballA' });
    h.cmdF3(w, { type: 'cock', notch: 2 });
    h.cmdF3(w, { type: 'fire' });
    const f = w.flight!;
    h.waitLanded(() => w, (s) => h.runF3(w, s));
    const R = rangeWithDrop(f.v0, elev, m.z - f.radius, w.params.g);
    const short = (R - (f.contacts[0].x - m.x)) / R;
    expect(short).toBeGreaterThan(0.002);
    expect(short).toBeLessThan(0.08);
    expect(Math.abs(energyResidualJ(w))).toBeLessThan(1e-4);
  });
});

describe('F103 · ecuaciones', () => {
  it('componentes, vértice y v_y con signo', () => {
    const c = components(5, 30);
    expect(c.vx).toBeCloseTo(5 * Math.cos(Math.PI / 6), 12);
    expect(c.vy).toBeCloseTo(2.5, 12);
    expect(peakTime(5, 30, 9.81)).toBeCloseTo(2.5 / 9.81, 12);
    expect(maxHeight(5, 30, 9.81)).toBeCloseTo(2.5 ** 2 / (2 * 9.81), 12);
    expect(vyAt(5, 30, 0.1, 9.81)).toBeGreaterThan(0);
    expect(vyAt(5, 30, 0.4, 9.81)).toBeLessThan(0);
  });

  it('alcance con caída: crece con la altura y v₀ se recupera desde el alcance', () => {
    expect(rangeWithDrop(5, 45, 0.4, 9.81)).toBeGreaterThan(levelRange(5, 45, 9.81));
    const R = rangeWithDrop(4.7, 35, 0.3, 9.81);
    expect(v0FromRange(R, 35, 0.3, 9.81)).toBeCloseTo(4.7, 6);
    expect(trajectoryY(5, 0, 1, 9.81)).toBeCloseTo(-9.81 / (2 * 25), 12);
    expect(gateSpeed(0.025, 0.005)).toBeCloseTo(5, 12);
    expect(relErrorPct(9.9, 10)).toBeCloseTo(-1, 12);
  });

  it('el ajuste de la trayectoria recupera θ y v₀ de puntos exactos (y no se define con menos de tres)', () => {
    const g = 9.81;
    const pts: Array<[number, number]> = [0.6, 1.2, 1.8, 2.4].map((x) => [x, 0.5 + trajectoryY(5.2, 35, x, g)]);
    const f = trajectoryFit(pts, g);
    expect(f.thetaDeg).toBeCloseTo(35, 6);
    expect(f.v0).toBeCloseTo(5.2, 6);
    expect(f.c0).toBeCloseTo(0.5, 6);
    expect(f.rms).toBeLessThan(1e-9);
    expect(Number.isNaN(trajectoryFit(pts.slice(0, 2), g).v0)).toBe(true);
  });

  it('incertidumbres: u(v₀) por diámetro y reloj; u(R) crece con u(v₀)', () => {
    const u = uGateSpeed(0.025, 0.0001, 0.005, 1e-5);
    expect(u).toBeCloseTo(5 * Math.hypot(0.0001 / 0.025, 1e-5 / 0.005), 9);
    expect(uRangePred(5, 0.1, 45, 0.3, 0.4, 0.002, 9.81)).toBeGreaterThan(uRangePred(5, 0.02, 45, 0.3, 0.4, 0.002, 9.81));
  });

  it('régimen: arrastre como fracción del peso y clasificación de cada disparo', () => {
    const area = Math.PI * 0.0125 ** 2;
    expect(dragFraction(5, 0.02, 9.81, 1.2, 0.47, area)).toBeLessThan(0.03);
    expect(parabolaValid(5, 0.02, 9.81, 1.2, 0.47, area)).toBe(true);
    expect(parabolaValid(15, 0.003, 9.81, 1.2, 0.47, area)).toBe(false);
    expect(classifyShot(['BOUNCE'], 0)).toBe('invalid');
    expect(classifyShot(['LATERAL'], 0)).toBe('out_of_plane');
    expect(classifyShot([], 0.05)).toBe('drag');
    expect(classifyShot([], 0.001)).toBe('ideal');
  });
});

describe('F103 · instrumentos', () => {
  const p = DEFAULT_F103_PARAMS;

  it('fotopuerta: la cuerda se acorta con el haz descentrado y desaparece fuera de la esfera; muestreo y resolución', () => {
    expect(chordOf(0.0125, 0)).toBeCloseTo(0.025, 12);
    expect(chordOf(0.0125, 0.006)).toBeLessThan(0.025);
    expect(chordOf(0.0125, 0.013)).toBe(0);
    const c = gateCrossing(0, 5, 0, 0.03, 0.0125, 0);
    expect(c.tOut! - c.tIn!).toBeCloseTo(0.005, 9);
    expect(gateCrossing(0, 5, 0, 0.03, 0.0125, 0.02).tIn).toBeNull();
    expect(sampledInterval(0.0048372, 100000)).toBeCloseTo(0.00484, 9);
    expect(resolvedAt(0.005, 100000, p.gate)).toBe(true);
    expect(resolvedAt(0.005, 1000, p.gate)).toBe(false);
  });

  it('plataforma: posición desde el borde de origen, escala sin calibrar y reloj que satura en rango corto', () => {
    const pp = p.platform;
    expect(onPlatform(2.1, -0.9, 2, -0.95, pp)).toBe(true);
    expect(onPlatform(2.3, -0.95, 2, -0.95, pp)).toBe(false);
    const ind = platformIndication(2.05, -0.95, 2, -0.95, 1, pp);
    expect(ind.xCm).toBeCloseTo(25, 6);
    expect(platformIndication(2.05, -0.95, 2, -0.95, pp.uncalScale, pp).xCm).toBeGreaterThan(25.5);
    expect(clockIndication(1.2, 'short', pp)).toEqual({ s: pp.ranges.short.maxS, clipped: true });
    expect(clockIndication(1.2, 'long', pp).clipped).toBe(false);
  });
});
