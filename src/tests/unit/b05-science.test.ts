/**
 * Casos resueltos de B05 (§8): aritmética y conservación con tolerancia relTol ≤ 1e-9 lejos de los límites. Son pruebas
 * de las funciones puras, no predicciones de una muestra real de hígado o de amilasa.
 */
import { describe, expect, it } from 'vitest';
import {
  a340, activeAfter, collectedIdealMl, collectorReading, competitive, gasMl, gasMol, glucosylMol, maltoseIdeal, mm, nadhFromA, noncompetitive,
  o2MaxMol, partitionO2, slopeIn, stripPH,
} from '../../simulation/enz-world/kinetics';

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

describe('B05 — casos de referencia (§8)', () => {
  it('§8.1 gas máximo de la catalasa: 10,00 mL de H₂O₂ 0,1000 M → 5,000e-4 mol de O₂ y 12,23 mL a 298,15 K', () => {
    const n = o2MaxMol(10, 0.1);
    expect(rel(n, 5e-4)).toBeLessThan(1e-9);
    const v = gasMl(n, 298.15, 101.325);
    expect(rel(v, 0.0005 * 8.314462618 * 298.15 / 101.325 * 1000)).toBeLessThan(1e-9);
    expect(v).toBeCloseTo(12.23, 2);
    expect(collectedIdealMl(n, 0.95)).toBeCloseTo(11.62, 2);
    expect(gasMl(o2MaxMol(10, 0.1, 0.4))).toBeCloseTo(4.89, 2);
    expect(rel(gasMol(v), n)).toBeLessThan(1e-9);
  });

  it('§8.2 unidades glucosilo: 0,0100 mol → 1,6214 g; maltosa ideal 0,00500 mol (1,7115 g) con 0,09008 g de agua', () => {
    expect(glucosylMol(1.6214)).toBeCloseTo(0.01, 9);
    const m = maltoseIdeal(0.01);
    expect(rel(m.maltoseMol, 0.005)).toBeLessThan(1e-9);
    expect(m.maltoseG).toBeCloseTo(1.7115, 4);
    expect(m.waterG).toBeCloseTo(0.09008, 5);
    // Conservación de masa del caso: glucosilos + agua = maltosa (dentro del redondeo de las masas molares).
    expect(Math.abs(0.01 * 162.14 + m.waterG - m.maltoseG)).toBeLessThan(1e-3);
  });

  it('§8.3 competitiva: 0,0100 mmol/min sin competidor y 0,00667 con [I]/Ki = 1 (reduce, no anula)', () => {
    expect(rel(mm(0.02, 2, 2), 0.01)).toBeLessThan(1e-9);
    expect(rel(competitive(0.02, 2, 2, 1, 1), 0.02 * 2 / 6)).toBeLessThan(1e-9);
    expect(competitive(0.02, 2, 2, 1, 1)).toBeCloseTo(0.00667, 5);
    expect(competitive(0.02, 2, 2, 100, 1)).toBeGreaterThan(0);
    // A saturación la competitiva recupera Vmax; la no competitiva no (distinguible solo con varias [S], N10).
    expect(competitive(0.02, 1e6, 2, 1, 1)).toBeCloseTo(0.02, 4);
    expect(noncompetitive(0.02, 1e6, 2, 1, 1)).toBeCloseTo(0.01, 4);
  });

  it('§8.4 A340: 50,0 µM de NADH en 1,00 cm → 0,311; con blanco 0,040 la bruta es 0,351 y la corregida 0,311', () => {
    expect(a340(50e-6)).toBeCloseTo(0.311, 3);
    expect(a340(50e-6, 1, 6220, 0.04)).toBeCloseTo(0.351, 3);
    expect(rel(nadhFromA(0.351, 0.04), 0.311 / 6220)).toBeLessThan(1e-9);
  });

  it('§3.2 la desnaturalización es irreversible y multiplicativa', () => {
    const a = activeAfter(activeAfter(1, 0.01, 30), 0.01, 30);
    expect(rel(a, Math.exp(-0.6))).toBeLessThan(1e-9);
    expect(activeAfter(a, 0, 600)).toBe(a);
  });

  it('reparto de O₂ conservativo entre disuelto, colector, venteo y atrapado (BIO5-18)', () => {
    const cases = [
      { dissolvedRoomMmol: 0.01, collector: true, stopcockOpen: true, stoppered: false, efficiency01: 0.95, leak01: 0.2 },
      { dissolvedRoomMmol: 0, collector: true, stopcockOpen: false, stoppered: false, efficiency01: 0.95, leak01: 0 },
      { dissolvedRoomMmol: 0, collector: false, stopcockOpen: true, stoppered: true, efficiency01: 0.95, leak01: 0 },
      { dissolvedRoomMmol: 0.5, collector: false, stopcockOpen: true, stoppered: false, efficiency01: 0.95, leak01: 0 },
    ];
    for (const c of cases) {
      const r = partitionO2(0.2, c);
      expect(Math.abs(r.dissolved + r.collected + r.vented + r.trapped - 0.2)).toBeLessThan(1e-12);
    }
    expect(partitionO2(0.2, cases[0]).collected).toBeCloseTo(0.19 * 0.95 * 0.8, 12);
    expect(partitionO2(0.2, cases[1]).trapped).toBeCloseTo(0.2, 12);
  });

  it('colector: media división, saturación a 50 mL, cero y escala desplazados', () => {
    const base = { offsetMl: 0, scale: 1, capacityMl: 50, resolutionMl: 0.5, parallaxMlPerDeg: 0.03, eyeDeg: 0 };
    expect(collectorReading(11.62, base).value).toBe(11.5);
    expect(collectorReading(11.8, base).value).toBe(12);
    expect(collectorReading(80, base)).toEqual({ value: 50, full: true });
    expect(collectorReading(10, { ...base, offsetMl: 1, scale: 1.05 }).value).toBe(11.5);
    expect(collectorReading(10, { ...base, eyeDeg: 30 }).value).toBe(11);
  });

  it('tasa inicial por mínimos cuadrados en la ventana elegida y tiras de pH con su resolución', () => {
    const pts = [0, 30, 60, 90].map((t) => ({ t, y: 0.1 * t - 0.0004 * t * t }));
    expect(slopeIn(pts, 0, 30)).toBeCloseTo(0.088, 9);
    expect(slopeIn(pts, 60, 90)!).toBeLessThan(slopeIn(pts, 0, 30)!);
    expect(slopeIn(pts.slice(0, 1))).toBeNull();
    expect(stripPH(6.6)).toBe(7);
    expect(stripPH(6.6, 2)).toBe(6);
    expect(stripPH(0.2)).toBe(1);
  });
});
