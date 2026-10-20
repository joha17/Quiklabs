/**
 * Práctica 1 — núcleo científico (§17.1): densidad del agua, cilindro, desplazamiento, propagación de incertidumbres,
 * convenciones, entradas fuera de dominio, resolución de los instrumentos y determinismo.
 */
import { describe, expect, it } from 'vitest';
import { rhoWaterGPerMl, waterModelValid } from '../../simulation/density-models/water';
import { cylinderMassG, cylinderVolumeCm3, density, displacementMl, errorPctAbs, errorRelSigned } from '../../simulation/density-models/solids';
import {
  meanAbsoluteDeviation, quantize, sampleStdDev, standardFromHalfWidth, stdErrorOfMean, uncertaintyCylinderVolume, uncertaintyDensity, uncertaintySubtract,
} from '../../simulation/metrology/uncertainty';
import { CYL_AREA, GEO01 } from '../../simulation/density-world/geometry';
import { stableHash } from '../../simulation/core/math';
import * as h from '../helpers01';

describe('densidad del agua (§3.4)', () => {
  it('valores de referencia a 25 °C y 5 °C', () => {
    expect(rhoWaterGPerMl(25)).toBeCloseTo(0.9970751177, 8);
    expect(rhoWaterGPerMl(5)).toBeCloseTo(0.9999918842, 8);
  });
  it('máximo cerca de 4 °C: enfriar no siempre aumenta la densidad', () => {
    expect(rhoWaterGPerMl(4)).toBeGreaterThan(rhoWaterGPerMl(2));
    expect(rhoWaterGPerMl(4)).toBeGreaterThan(rhoWaterGPerMl(8));
  });
  it('fuera de 0–40 °C se rechaza (sin extrapolar ni NaN silenciosos)', () => {
    expect(waterModelValid(41)).toBe(false);
    expect(Number.isNaN(rhoWaterGPerMl(80))).toBe(true);
    expect(Number.isNaN(rhoWaterGPerMl(-3))).toBe(true);
  });
  it('mismo volumen a dos temperaturas: ≈ 0,0730 g más a 5 °C (§8.1)', () => {
    expect(25 * rhoWaterGPerMl(25)).toBeCloseTo(24.9269, 4);
    expect(25 * (rhoWaterGPerMl(5) - rhoWaterGPerMl(25))).toBeCloseTo(0.073, 3);
  });
});

describe('sólidos (§3.2, §8.2, §8.3)', () => {
  it('cilindro de 2,000 × 2,500 cm', () => {
    expect(cylinderVolumeCm3(2, 2.5)).toBeCloseTo(7.853981634, 8);
    expect(cylinderMassG(2, 2.5, 2.7)).toBeCloseTo(21.205750412, 8);
  });
  it('desplazamiento de 20 g de hierro', () => {
    expect(displacementMl(20, 7.87)).toBeCloseTo(2.541296061, 8);
    expect(density(20, 2.5)).toBeCloseTo(8.0, 10);
  });
  it('errores porcentuales con y sin signo', () => {
    expect(errorPctAbs(8, 7.87)).toBeCloseTo(1.6518, 3);
    expect(errorRelSigned(7.7, 7.87)).toBeLessThan(0);
  });
  it('entradas fuera de dominio dan NaN, nunca una densidad engañosa', () => {
    expect(Number.isNaN(density(20, -2.5))).toBe(true);
    expect(Number.isNaN(density(20, 0))).toBe(true);
    expect(Number.isNaN(density(-1, 2))).toBe(true);
    expect(Number.isNaN(cylinderVolumeCm3(0, 2))).toBe(true);
    expect(Number.isNaN(displacementMl(20, 0))).toBe(true);
  });
});

describe('propagación de incertidumbres (§3.3, §8.3)', () => {
  it('diferencia de dos lecturas independientes', () => {
    expect(uncertaintySubtract(0.01, 0.01)).toBeCloseTo(0.0141421356, 9);
  });
  it('volumen y densidad del cilindro concuerdan con §8.3', () => {
    const V = cylinderVolumeCm3(2, 2.5);
    const uV = uncertaintyCylinderVolume(2, 0.002, 2.5, 0.002);
    expect(uV / V).toBeCloseTo(0.0021541, 6);
    expect(uV).toBeCloseTo(0.01692, 4);
    const m = 21.20575;
    expect(uncertaintyDensity(m, uncertaintySubtract(0.01, 0.01), V, uV)).toBeCloseTo(0.00609, 4);
  });
  it('convención rectangular u = a/√3 y directa u = a', () => {
    expect(standardFromHalfWidth(0.5, 'RECTANGULAR')).toBeCloseTo(0.288675, 6);
    expect(standardFromHalfWidth(0.5, 'DIRECT')).toBe(0.5);
    // Desplazamiento de §8.2: u(ΔV) ≈ 0,408 mL con dos lecturas de ±0,5 mL.
    expect(uncertaintySubtract(standardFromHalfWidth(0.5, 'RECTANGULAR'), standardFromHalfWidth(0.5, 'RECTANGULAR'))).toBeCloseTo(0.408, 3);
  });
  it('desviación absoluta media, s y s/√n no son intercambiables', () => {
    const x = [2.0, 2.004, 1.998];
    expect(meanAbsoluteDeviation(x)).toBeCloseTo(0.002222, 5);
    expect(sampleStdDev(x)).toBeCloseTo(0.003055, 5);
    expect(stdErrorOfMean(x)).toBeCloseTo(0.001764, 5);
    expect(meanAbsoluteDeviation([1, 2, 3])).not.toBe(0);
  });
  it('entradas inválidas no producen números', () => {
    expect(Number.isNaN(uncertaintyDensity(0, 0.01, 2, 0.1))).toBe(true);
    expect(Number.isNaN(uncertaintyCylinderVolume(-2, 0.002, 2.5, 0.002))).toBe(true);
    expect(Number.isNaN(standardFromHalfWidth(-1, 'DIRECT'))).toBe(true);
  });
});

describe('instrumentos y geometría compartida (§4)', () => {
  it('la lectura respeta la resolución de cada instrumento', () => {
    expect(quantize(24.9269, 0.01)).toBe(24.93);
    expect(quantize(22.541296, 0.5)).toBe(22.5);
    expect(quantize(2.0011, 0.002)).toBe(2.002);
    expect(quantize(6.37, 0.1)).toBe(6.4);
  });
  it('la marca de 50 mL de la probeta encierra 50,0 mL del mismo perfil', () => {
    const hMark = GEO01.cylinder50.floor + 50 / CYL_AREA;
    expect((hMark - GEO01.cylinder50.floor) * CYL_AREA).toBeCloseTo(50, 9);
    expect(hMark).toBeLessThan(GEO01.cylinder50.h);
  });
  it('misma semilla y mismos comandos ⇒ mismo estado', () => {
    const a = h.world01({ seed: 77 });
    const b = h.world01({ seed: 77 });
    for (const w of [a, b]) {
      h.ppe(w);
      h.balanceCheck(w);
      h.fillPipette(w, 'waterRoom01');
      h.deliver(w);
    }
    expect(stableHash(a)).toBe(stableHash(b));
    expect(stableHash(h.world01({ seed: 78 }).pipette)).not.toBe(stableHash(h.world01({ seed: 77 }).pipette));
  });
});
