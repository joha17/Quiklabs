/**
 * F101 — pruebas científicas (§17, matriz «Unitarias»): ecuaciones de §3, los dos oráculos de §8, propagación de
 * incertidumbre, modelos instrumentales (calibrador, micrómetro), conservación y convergencia del anillo con el paso.
 */
import { describe, expect, it } from 'vitest';
import { F101_REFERENCE } from '../../simulation/models/f101/reference';
import { add, angleDeg, angleDiffDeg, components, cross, cylinderVolume, density, dot, norm, relErrorPct, sphereVolume, torqueZ, unit, weightN } from '../../simulation/models/f101/equations';
import { combinedMean, decimalsOf, quantize, typeA, uComponents, uCylinderVolume, uDensity } from '../../simulation/models/f101/uncertainty';
import { caliperReadingMm, newCaliper, projectedExtentMm, releaseCaliperThumb, setCaliperTarget } from '../../simulation/instruments/vernier-caliper';
import { micrometerReadingMm, newMicrometer, turnMicrometer } from '../../simulation/instruments/micrometer';
import { DEFAULT_F101_PARAMS } from '../../practices/practice-f101/params';
import { conservedTotals, f101Summary, ringOffsetMm, stringForces } from '../../simulation/f101-world/world';
import * as h from '../helpersF101';

describe('F101 — oráculos de §8', () => {
  it('vectores perpendiculares: (3,0) + (0,4) = (3,4), módulo 5 ± 0,01 N', () => {
    const r = F101_REFERENCE.perpendicular;
    const s = add(r.f1, r.f2);
    expect(s.x).toBeCloseTo(r.sum.x, 10);
    expect(s.y).toBeCloseTo(r.sum.y, 10);
    expect(Math.abs(norm(s) - r.modulus)).toBeLessThan(r.tolN);
    expect(angleDeg(s)).toBeCloseTo(53.1301, 3);
  });
  it('volumen cilíndrico: d = 20,0 mm, h = 50,0 mm → 1,5708 × 10⁻⁵ m³ = 15,708 cm³ (< 0,05 %)', () => {
    const r = F101_REFERENCE.cylinder;
    const Vm3 = cylinderVolume(r.dMm / 1000, r.hMm / 1000);
    expect(Math.abs(Vm3 - r.volumeM3) / r.volumeM3).toBeLessThan(r.relTol);
    expect(Math.abs(cylinderVolume(r.dMm, r.hMm) / 1000 - r.volumeCm3) / r.volumeCm3).toBeLessThan(r.relTol);
  });
});

describe('F101 — ecuaciones (§3)', () => {
  it('componentes, ángulos, productos y momento con grados explícitos', () => {
    const f = components(2, 30);
    expect(f.x).toBeCloseTo(Math.sqrt(3), 10);
    expect(f.y).toBeCloseTo(1, 10);
    expect(angleDeg({ x: -1, y: -1 })).toBeCloseTo(225, 10);
    expect(Number.isNaN(angleDeg({ x: 0, y: 0 }))).toBe(true);
    expect(dot({ x: 1, y: 2 }, { x: 3, y: 4 })).toBe(11);
    expect(cross({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })).toEqual({ x: 0, y: 0, z: 1 });
    expect(torqueZ({ x: 0.1, y: 0 }, { x: 0, y: 2 })).toBeCloseTo(0.2, 12);
    expect(norm(unit({ x: 3, y: 4 }))).toBeCloseTo(1, 12);
    expect(angleDiffDeg(10, 350)).toBeCloseTo(20, 12);
    expect(weightN(0.15, 9.81)).toBeCloseTo(1.4715, 10);
  });
  it('dominio explícito: fuera de dominio devuelve NaN', () => {
    expect(Number.isNaN(cylinderVolume(-1, 2))).toBe(true);
    expect(Number.isNaN(density(1, 0))).toBe(true);
    expect(Number.isNaN(weightN(-1, 9.81))).toBe(true);
    expect(sphereVolume(2)).toBeCloseTo((4 / 3) * Math.PI, 12);
    expect(relErrorPct(101, 100)).toBeCloseTo(1, 12);
  });
});

describe('F101 — incertidumbre', () => {
  it('tipo A y combinada; la tipo B no se divide entre √n', () => {
    const xs = [20.0, 20.02, 19.98];
    expect(typeA(xs)).toBeCloseTo(0.02 / Math.sqrt(3), 10);
    const uB = DEFAULT_F101_PARAMS.uB.caliperMm;
    expect(combinedMean(xs, uB)).toBeCloseTo(Math.hypot(0.02 / Math.sqrt(3), uB), 10);
    expect(combinedMean([20, 20, 20], uB)).toBeCloseTo(uB, 12);
  });
  it('propagación del volumen, la densidad y las componentes', () => {
    const V = cylinderVolume(20, 50);
    expect(uCylinderVolume(20, 0.01, 50, 0.01)).toBeCloseTo(V * Math.hypot(0.001, 0.0002), 6);
    expect(uDensity(42.4, 0.01, 15.7, 0.02)).toBeCloseTo((42.4 / 15.7) * Math.hypot(0.01 / 42.4, 0.02 / 15.7), 12);
    const u = uComponents(2, 0.01, 0, 1);
    expect(u.ux).toBeCloseTo(0.01, 12);
    expect(u.uy).toBeCloseTo(2 * (Math.PI / 180), 10);
    expect(quantize(19.987, 0.02)).toBe(19.98);
    expect(decimalsOf('19,98')).toBe(2);
  });
});

describe('F101 — instrumentos', () => {
  const pc = DEFAULT_F101_PARAMS.caliper;
  const pm = DEFAULT_F101_PARAMS.micrometer;
  it('calibrador: el contacto convierte el exceso de recorrido en fuerza, sin interpenetración', () => {
    const c = newCaliper();
    c.part = { id: 'x', extentMm: 20, crossMm: 50, stiffNPerMm: 2e4, tiltDeg: 0 };
    setCaliperTarget(c, 10, pc);
    expect(c.forceN).toBeCloseTo(Math.min(pc.maxForceN, 40), 6);
    expect(c.jawMm).toBeLessThan(20);
    expect(20 - c.jawMm).toBeLessThan(0.2);
    releaseCaliperThumb(c);
    expect(c.jawMm).toBe(20);
    expect(caliperReadingMm(c, pc, 0).value).toBe(20);
  });
  it('calibrador: pieza oblicua → extensión proyectada; pieza blanda → compresión; paralaje ±1 división', () => {
    const part = { id: 'x', extentMm: 20, crossMm: 50, stiffNPerMm: 55, tiltDeg: 5 };
    expect(projectedExtentMm(part)).toBeGreaterThan(24);
    const c = newCaliper();
    c.part = { ...part, tiltDeg: 0 };
    setCaliperTarget(c, 17.5, pc);
    expect(caliperReadingMm(c, pc, 0).value).toBeLessThan(19.9);
    releaseCaliperThumb(c);
    expect(caliperReadingMm(c, pc, 40).value).toBeCloseTo(20.02, 6);
  });
  it('micrómetro: el tambor avanza paso·giro/360; el trinquete limita la fuerza; sin él se sobreaprieta', () => {
    const m = newMicrometer();
    turnMicrometer(m, -360, 'thimble', pm);
    expect(m.spindleMm).toBeCloseTo(12.5, 10);
    m.part = { id: 'b', extentMm: 19.05 };
    turnMicrometer(m, -360 * 14, 'thimble', pm);
    for (let i = 0; i < 400 && m.forceN === 0; i++) turnMicrometer(m, 2, 'ratchet', pm);
    turnMicrometer(m, 180, 'ratchet', pm);
    expect(m.forceN).toBe(pm.ratchetN);
    expect(m.slipped).toBe(true);
    expect(micrometerReadingMm(m, pm, 0).value).toBeCloseTo(19.05, 6);
    turnMicrometer(m, 90, 'thimble', pm);
    expect(m.forceN).toBeGreaterThan(pm.forceLimitN);
    expect(micrometerReadingMm(m, pm, 0).value).toBeLessThan(19.05);
  });
});

describe('F101 — mundo: conservación, geometría del anillo y determinismo', () => {
  it('las direcciones de los hilos salen de la geometría y el equilibrio 3-4-5 cierra', () => {
    const w = h.worldF({ scientificMode: 'CURRICULAR' });
    h.ppe(w);
    h.setupForces(w);
    const f = stringForces(w, 0, 0);
    const sx = f.reduce((s, x) => s + x.T * x.ux, 0);
    const sy = f.reduce((s, x) => s + x.T * x.uy, 0);
    expect(Math.hypot(sx, sy)).toBeLessThan(0.03);
    h.releaseAndRecord(w);
    expect(ringOffsetMm(w)).toBeLessThan(5);
    expect(w.table.limitHit).toBe(false);
  });
  it('sin el perno y con fuerzas desequilibradas, el anillo va al tope; con el perno, el sensor mide la resultante', () => {
    const w = h.worldF({ scientificMode: 'CURRICULAR' });
    h.ppe(w);
    h.setupForces(w, h.IDEAL_SETUP.slice(0, 2));
    h.runF(w, 1);
    const R = Math.hypot(w.table.pinForce.x, w.table.pinForce.y);
    expect(R).toBeCloseTo(Math.hypot(1.4715, 1.962), 1);
    h.cmdF(w, { type: 'setPin', on: false });
    h.runF(w, 3);
    expect(w.table.limitHit).toBe(true);
  });
  it('convergencia: refinar los subpasos no cambia el equilibrio (< 0,1 mm)', () => {
    const at = (sub: number) => {
      const w = h.worldF({ scientificMode: 'CURRICULAR', params: { subSteps: sub } });
      h.ppe(w);
      h.setupForces(w);
      h.cmdF(w, { type: 'setPin', on: false });
      h.cmdF(w, { type: 'nudgeRing', dxCm: 1.5, dyCm: -1 });
      h.runF(w, 8);
      return { x: w.table.ring.x, y: w.table.ring.y };
    };
    const a = at(10);
    const b = at(40);
    expect(Math.hypot(a.x - b.x, a.y - b.y) * 1000).toBeLessThan(0.1);
  });
  it('agua, piezas y masas se conservan (la salpicadura va a la mesada, no desaparece)', () => {
    const w = h.worldF();
    const t0 = conservedTotals(w);
    h.ppe(w);
    h.cmdF(w, { type: 'dropIntoCylinder', partId: 'steelBall01', heightCm: 8 });
    h.runF(w, 2);
    h.cmdF(w, { type: 'retrievePart', partId: 'steelBall01' });
    h.cmdF(w, { type: 'dryPart', partId: 'steelBall01' });
    h.cmdF(w, { type: 'wipeBench' });
    const t1 = conservedTotals(w);
    for (const k of Object.keys(t0)) expect(t1[k]).toBeCloseTo(t0[k], 9);
    expect(w.water.discardedMl).toBeGreaterThan(0);
  });
  it('misma semilla y misma cinta → mismo estado', () => {
    const a = h.idealRoute(77).w;
    const b = h.idealRoute(77).w;
    expect(f101Summary(a)).toEqual(f101Summary(b));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
