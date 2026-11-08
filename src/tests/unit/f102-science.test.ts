/**
 * F102 — ciencia (§17, matriz «Unitarias»): oráculos de la especificación (MRUA a = 1,50 m/s², t = 2 s → x = 3,00 m y
 * v = 3,00 m/s con error < 0,2 %; caída libre desde 1,25 m → t = 0,5048 s ± 0,002 s), ecuaciones del modelo, ajuste
 * cuadrático, incertidumbres, instrumentos (fotocompuerta, sensor de movimiento) y la caída simulada contra el oráculo.
 */
import { describe, expect, it } from 'vitest';
import {
  accelFromGates, atwoodAccel, centralVelocities, fallTime, gateVelocity, gFromFall, meanVelocity, positionMRUA, quadraticFit,
  relErrorPct, stringTension, terminalVelocity, velocityFromDisplacement, velocityMRUA,
} from '../../simulation/models/f102/equations';
import { uGFromFall, uGateVelocity } from '../../simulation/models/f102/uncertainty';
import { F102_REFERENCE } from '../../simulation/models/f102/reference';
import { classifyRun, freeFallValid } from '../../simulation/models/f102/regimes';
import { effectiveFlagWidth, timerIndication } from '../../simulation/instruments/photogate';
import { motionIndication, newMotionSensor } from '../../simulation/instruments/motion-sensor';
import { DEFAULT_F102_PARAMS } from '../../practices/practice-f102/params';
import { energyResidualJ } from '../../simulation/f102-world/conservation';
import * as h from '../helpersF102';

const rel = (x: number, ref: number) => Math.abs(x - ref) / Math.abs(ref);

describe('F102 · oráculos', () => {
  it('MRUA: a = 1,50 m/s², t = 2 s → x = 3,00 m y v = 3,00 m/s (< 0,2 %)', () => {
    const o = F102_REFERENCE.mrua;
    expect(rel(positionMRUA(0, 0, o.a, o.t), o.x)).toBeLessThan(o.relTol);
    expect(rel(velocityMRUA(0, o.a, o.t), o.v)).toBeLessThan(o.relTol);
    expect(rel(velocityFromDisplacement(0, o.a, o.x), o.v)).toBeLessThan(o.relTol);
  });

  it('caída libre: h = 1,25 m → t = 0,5048 s ± 0,002 s', () => {
    const o = F102_REFERENCE.freeFall;
    expect(Math.abs(fallTime(o.h, o.g) - o.t)).toBeLessThan(o.tolS);
    expect(gFromFall(o.h, fallTime(o.h, o.g))).toBeCloseTo(o.g, 9);
  });

  it('la torre simulada (modo ideal) reproduce el oráculo de caída con el cronómetro de la fotocelda', () => {
    const w = h.worldF2({ scientificMode: 'CURRICULAR' });
    h.ppeF2(w);
    h.cmdF2(w, { type: 'capPhotocell', on: false });
    // La escala marca el polo del electroimán: la esfera pequeña (2 cm) cuelga debajo, así que su base queda a 1,25 m del haz.
    const { t } = h.magnetDrop(w, 127);
    expect(t.ok).toBe(true);
    expect(Math.abs(t.value! - F102_REFERENCE.freeFall.t)).toBeLessThan(F102_REFERENCE.freeFall.tolS);
    expect(Math.abs(energyResidualJ(w))).toBeLessThan(1e-4);
  });
});

describe('F102 · ecuaciones', () => {
  it('velocidades de compuerta, media y aceleración entre compuertas', () => {
    expect(gateVelocity(0.02, 0.04)).toBeCloseTo(0.5, 12);
    expect(meanVelocity(0.3, 0.6)).toBeCloseTo(0.5, 12);
    expect(accelFromGates(0.5, 0.7, 0.3)).toBeCloseTo((0.49 - 0.25) / 0.6, 12);
    expect(gateVelocity(0, 0.04)).toBeNaN();
    expect(meanVelocity(0.3, 0)).toBeNaN();
  });

  it('máquina de Atwood horizontal: a = m g/(M + m), con inercia y rozamiento menor; T = m (g − a)', () => {
    const a = atwoodAccel(0.25, 0.03, 9.81);
    expect(a).toBeCloseTo((0.03 * 9.81) / 0.28, 12);
    expect(atwoodAccel(0.25, 0.03, 9.81, 0.02)).toBeLessThan(a);
    expect(atwoodAccel(0.25, 0.03, 9.81, 0, 0.05)).toBeLessThan(a);
    expect(stringTension(0.03, 9.81, a)).toBeCloseTo(0.03 * (9.81 - a), 12);
  });

  it('velocidad límite y validez de la caída libre', () => {
    const vt1 = terminalVelocity(0.0011, 9.81, 1.2, 1.4, Math.PI * 0.06 ** 2);
    const vt2 = terminalVelocity(0.0022, 9.81, 1.2, 1.4, Math.PI * 0.06 ** 2);
    expect(vt2 / vt1).toBeCloseTo(Math.SQRT2, 9);
    expect(freeFallValid(1.25, 0.033, 9.81, 1.2, 0.47, Math.PI * 0.01 ** 2)).toBe(true);
    expect(freeFallValid(1.25, 0.0011, 9.81, 1.2, 1.4, Math.PI * 0.06 ** 2)).toBe(false);
    expect(relErrorPct(9.7, 9.81)).toBeCloseTo((100 * -0.11) / 9.81, 12);
  });

  it('el ajuste cuadrático recupera x₀, v₀ y a de puntos exactos y estima u(a) con ruido', () => {
    const pts: Array<[number, number]> = Array.from({ length: 30 }, (_, i) => [i * 0.02, positionMRUA(0.01, 0.2, 1.5, i * 0.02)]);
    const f = quadraticFit(pts);
    expect(f.x0).toBeCloseTo(0.01, 9);
    expect(f.v0).toBeCloseTo(0.2, 9);
    expect(f.a).toBeCloseTo(1.5, 9);
    expect(f.rms).toBeLessThan(1e-9);
    const noisy = pts.map(([t, x], i) => [t, x + (i % 2 ? 1 : -1) * 2e-4] as [number, number]);
    const g = quadraticFit(noisy);
    expect(Math.abs(g.a - 1.5)).toBeLessThan(5 * g.ua + 1e-3);
    expect(g.ua).toBeGreaterThan(0);
    const v = centralVelocities(pts);
    expect(v[5][1]).toBeCloseTo(velocityMRUA(0.2, 1.5, v[5][0]), 9);
  });

  it('incertidumbres combinadas: g crece con u(t) al doble de peso relativo que u(h)', () => {
    const uT = uGFromFall(1.25, 0, 0.5048, 0.0005) / gFromFall(1.25, 0.5048);
    const uH = uGFromFall(1.25, 0.001, 0.5048, 0) / gFromFall(1.25, 0.5048);
    expect(uT).toBeCloseTo((2 * 0.0005) / 0.5048, 9);
    expect(uH).toBeCloseTo(0.001 / 1.25, 9);
    expect(uGateVelocity(0.02, 0.0001, 0.04, 0.0001)).toBeGreaterThan(0);
  });

  it('el régimen de cada corrida sale de sus banderas', () => {
    expect(classifyRun([], false)).toBe('uniform');
    expect(classifyRun([], true)).toBe('accelerated');
    expect(classifyRun(['DRAG'], false)).not.toBe('uniform');
  });
});

describe('F102 · instrumentos', () => {
  const gp = DEFAULT_F102_PARAMS.gateTimer;
  it('fotocompuerta: cuantiza a su resolución, alarga la bandera girada y la pierde pasado el umbral', () => {
    expect(timerIndication(0.040049, gp)).toBeCloseTo(0.04, 12);
    expect(timerIndication(null, gp)).toBeNull();
    expect(effectiveFlagWidth(0.02, 0, gp)).toBeCloseTo(0.02, 12);
    expect(effectiveFlagWidth(0.02, 5, gp)).toBeGreaterThan(0.02);
    expect(effectiveFlagWidth(0.02, gp.missYawDeg + 1, gp)).toBe(0);
  });

  it('sensor de movimiento: saturación del rango cercano, oblicua, escala sin calibrar y mínimo', () => {
    const mp = DEFAULT_F102_PARAMS.motion;
    const s = { ...newMotionSensor(mp), aimDeg: 0, scale: 1 };
    expect(motionIndication(0.5, s, mp, 0).mm).toBe(500);
    expect(motionIndication(1.5, s, mp, 0).clipped).toBe(true);
    expect(motionIndication(1.5, { ...s, range: 'far' }, mp, 0).mm).toBe(1500);
    expect(motionIndication(0.5, { ...s, aimDeg: 10 }, mp, 0).mm!).toBeGreaterThan(500);
    expect(motionIndication(0.5, { ...s, scale: mp.uncalScale }, mp, 0).mm).toBe(Math.round(500 * mp.uncalScale));
    expect(motionIndication(0.05, s, mp, 0).mm).toBeNull();
  });
});
