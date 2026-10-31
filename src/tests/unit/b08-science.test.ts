import { describe, expect, it } from 'vitest';
import { lampIndex, pGross, grossEstimate, respiration } from '../../simulation/photosynthesis/photokinetics';
import { capillaryAreaCm2, molesFromVolume, slopeMmPerH, volumeFromDh } from '../../simulation/photosynthesis/gas-partition';
import { btbColor, phFromDic } from '../../simulation/photosynthesis/carbonate-btb';
import { emptyLedger, ledgerTotal, move } from '../../simulation/photosynthesis/pigment-extraction';
import { frontDistance, rfOf, rfUncertainty } from '../../simulation/photosynthesis/paper-chromatography';
import { DEFAULT_B08_PARAMS } from '../../practices/practice-b08/params';

const k = DEFAULT_B08_PARAMS.photo!.kinetics;

describe('B08 · casos de referencia (§8)', () => {
  it('8.1 cromatograma: Rf desde el origen', () => {
    expect(rfOf(88, 20, 116)).toBeCloseTo(0.70833, 5);
    expect(rfOf(65, 20, 116)).toBeCloseTo(0.46875, 5);
    expect(rfOf(51, 20, 116)).toBeCloseTo(0.32292, 5);
    expect(rfOf(40, 20, 116)).toBeCloseTo(0.20833, 5);
    expect(rfUncertainty(88, 20, 116, 0.5)).toBeGreaterThan(0);
    expect(frontDistance(4.8, 1e6, 220)).toBe(220);
  });
  it('8.2 20 min = 1/3 h', () => {
    expect(slopeMmPerH(18, 1200)).toBeCloseTo(54, 9);
    expect(slopeMmPerH(-6, 1200)).toBeCloseTo(-18, 9);
  });
  it('8.3 capilar → volumen → equivalentes', () => {
    expect(capillaryAreaCm2(0.1)).toBeCloseTo(0.03141593, 7);
    expect(volumeFromDh(18, 0.1)).toBeCloseTo(0.05654867, 7);
    expect(volumeFromDh(-6, 0.1)).toBeCloseTo(-0.01884956, 7);
    expect(molesFromVolume(volumeFromDh(18, 0.1), 101.325, 298.15)).toBeCloseTo(2.31137, 3);
    expect(molesFromVolume(volumeFromDh(-6, 0.1), 101.325, 298.15)).toBeCloseTo(-0.77046, 3);
    expect(grossEstimate(2.31137 / 20, -0.77046 / 20)).toBeCloseTo(0.15409, 4);
  });
  it('8.4 sin luz o sin carbono no hay fotoproducción; R existe', () => {
    expect(pGross(0, 2, 25, k)).toBe(0);
    expect(pGross(100, 0, 25, k)).toBe(0);
    expect(respiration(25, k)).toBeCloseTo(k.r25, 9);
    expect(lampIndex(100, 40, 20)).toBeCloseTo(25, 9);
    expect(lampIndex(0, 10, 20)).toBe(0);
  });
  it('el perfil se calibra al caso 8.3 (índice 100, 25 °C, 2 mmol/L)', () => {
    expect(pGross(100, 2, 25, k)).toBeCloseTo(0.15409, 3);
  });
  it('BTB: amarillo con CO₂ abundante, azul al retirarlo; viraje orientativo', () => {
    expect(btbColor(phFromDic(0.5, 0.1), 6, 7.6)).toBe('yellow');
    expect(btbColor(phFromDic(0.1001, 0.1), 6, 7.6)).toBe('blue');
    expect(btbColor(7, 6, 7.6)).toBe('green');
  });
  it('los pigmentos no aparecen ni desaparecen', () => {
    const l = emptyLedger();
    l.chlA.tissue = 800;
    move(l, 'tissue', 'extract', 0.7);
    move(l, 'extract', 'paper', 0.1);
    move(l, 'paper', 'waste', 1);
    expect(ledgerTotal(l, 'chlA')).toBeCloseTo(800, 9);
  });
});
