import { describe, expect, it } from 'vitest';
import { HOSE_R, routeHose, type HoseObstacle, type HosePoint } from '../../engine/flame/hoseRoute';

const start: HosePoint[] = [{ x: 0, y: 40, z: 10 }, { x: 0, y: 38, z: 9 }];
const end: HosePoint[] = [{ x: 0, y: 2, z: 2 }, { x: 0, y: 0, z: 2 }];
const mids = Array.from({ length: 19 }, (_, i) => ({ x: 0, y: 36 - i * 1.8, z: 0.8 }));
const crosses = (p: HosePoint, b: HoseObstacle) => p.x > b.x0 && p.x < b.x1 && p.y > b.y0 && p.y < b.y1 && p.z - HOSE_R < b.z1 && p.z + HOSE_R > b.z0;

describe('recorrido de la manguera', () => {
  it('conserva los acoples en sus extremos', () => {
    const r = routeHose({ start, end }, mids, []);
    expect(r[0]).toEqual(start[0]);
    expect(r[r.length - 1]).toEqual(end[1]);
  });

  it('pasa por encima de un objeto bajo', () => {
    const base: HoseObstacle = { x0: -9, x1: 9, y0: 14, y1: 26, z0: 0, z1: 1.4 };
    const r = routeHose({ start, end }, mids, [base]);
    expect(r.some((p) => crosses(p, base))).toBe(false);
  });

  it('rodea un objeto alto, por un solo lado', () => {
    const rod: HoseObstacle = { x0: -1, x1: 2, y0: 18, y1: 22, z0: 0, z1: 60 };
    const r = routeHose({ start, end }, mids, [rod]);
    expect(r.some((p) => crosses(p, rod))).toBe(false);
    expect(r.every((p) => p.x <= 0.01)).toBe(true);
  });

  it('nunca atraviesa la mesada', () => {
    expect(routeHose({ start, end }, mids, []).every((p) => p.z >= HOSE_R)).toBe(true);
  });
});
