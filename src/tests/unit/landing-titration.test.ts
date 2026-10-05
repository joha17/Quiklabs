import { describe, expect, it } from 'vitest';
import { EQUIVALENCE_ML, phenolphthaleinPink, titrationPH } from '../../app/landing/scene/titration';

describe('simulador mínimo de la página de inicio (HCl 0,10 M + NaOH 0,10 M)', () => {
  it('pH inicial del ácido, equivalencia neutra y exceso de base', () => {
    expect(titrationPH(0)).toBeCloseTo(1, 3);
    expect(EQUIVALENCE_ML).toBeCloseTo(25, 9);
    expect(titrationPH(EQUIVALENCE_ML)).toBeCloseTo(7, 3);
    // 5 mL de exceso en 55 mL: [OH⁻] = 0,5 mmol / 55 mL → pH ≈ 11,96
    expect(titrationPH(30)).toBeCloseTo(14 + Math.log10(0.5 / 55), 2);
  });

  it('salto brusco cerca de la equivalencia y la fenolftaleína solo vira con base en exceso', () => {
    expect(titrationPH(24.9) - titrationPH(24)).toBeLessThan(1.5);
    expect(titrationPH(25.1) - titrationPH(24.9)).toBeGreaterThan(5);
    expect(phenolphthaleinPink(titrationPH(20))).toBe(0);
    expect(phenolphthaleinPink(titrationPH(25))).toBe(0);
    expect(phenolphthaleinPink(titrationPH(26))).toBeGreaterThan(0.9);
  });
});
