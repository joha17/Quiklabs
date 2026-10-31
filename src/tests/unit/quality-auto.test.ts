import { describe, expect, it } from 'vitest';
import { pickQuality } from '../../engine/quality';

describe('calidad automática', () => {
  it('no sube sola a HIGH, aunque sobre rendimiento', () => {
    expect(pickQuality(120, 'MEDIUM')).toBe('MEDIUM');
  });

  it('baja un nivel si el rendimiento no alcanza', () => {
    expect(pickQuality(20, 'HIGH')).toBe('MEDIUM');
    expect(pickQuality(20, 'MEDIUM')).toBe('LOW');
  });

  it('entre 28 y 55 fps se queda donde está', () => {
    expect(pickQuality(40, 'MEDIUM')).toBe('MEDIUM');
    expect(pickQuality(40, 'HIGH')).toBe('HIGH');
  });
});
