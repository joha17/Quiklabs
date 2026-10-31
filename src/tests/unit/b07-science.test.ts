/** B07 — ciencia (§3, §8): índices de retención, diámetro con incertidumbre, aumentos y geometría del trazado. */
import { describe, expect, it } from 'vitest';
import { colonyDiameter, plateLayout, retentionNeg, retentionPos, streakMetrics, totalMagnification } from '../../simulation/micro-world/model';
import { CROSSED, FOUR_ZONES } from '../helpersB07';

describe('B07 ciencia', () => {
  it('retención didáctica en los puntos de la guía', () => {
    expect(retentionPos(1)).toBeCloseTo(0.92, 9);
    expect(retentionNeg(1)).toBeCloseTo(0.12, 9);
    expect(retentionNeg(0)).toBeCloseTo(0.87, 9);
    expect(retentionPos(2)).toBeCloseTo(0.32, 9);
  });
  it('diámetro con incertidumbre: 120 px × 0,025 = 3,00 ± 0,05 mm', () => {
    const { mm, uMm } = colonyDiameter(120, 0.025, 2, 0);
    expect(mm).toBeCloseTo(3, 9);
    expect(uMm).toBeCloseTo(0.05, 9);
  });
  it('aumentos nominales', () => {
    expect([4, 40, 100].map((x) => totalMagnification(10, x))).toEqual([40, 400, 1000]);
  });
  it('cuatro zonas sin cruces solapan menos que la misma ruta con cruces', () => {
    const a = streakMetrics(FOUR_ZONES);
    const b = streakMetrics(CROSSED);
    expect(a.overlap01).toBeLessThan(b.overlap01);
    expect(a.zones).toBe(4);
    expect(a.separation01).toBeGreaterThan(b.separation01);
  });
  it('la disposición de una placa es determinista y sin colonias fundidas fuera del perfil confluente', () => {
    expect(plateLayout('plA', 'typical')).toEqual(plateLayout('plA', 'typical'));
    const c = plateLayout('plA', 'typical');
    expect(c.length).toBeGreaterThan(5);
    for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) expect(Math.hypot(c[i].x - c[j].x, c[i].y - c[j].y)).toBeGreaterThan(c[i].rPx + c[j].rPx);
  });
});
