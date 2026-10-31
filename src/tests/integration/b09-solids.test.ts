/**
 * B09 — la mesada obedece las físicas compartidas: los equipos fijos no se solapan, las plántulas y la rama tienen volumen para el
 * choque y un objeto soltado encima no las atraviesa (`PlantController` hereda los choques comunes).
 */
import { describe, expect, it } from 'vitest';
import { solidsOf } from '../../engine/optical/layout';
import { worldB09 } from '../helpersB09';

describe('B09: mesada', () => {
  it('los equipos fijos no se solapan entre sí', () => {
    const s = solidsOf(worldB09());
    const clash: string[] = [];
    for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) if (Math.abs(s[i].x - s[j].x) < s[i].hw + s[j].hw && Math.abs(s[i].y - s[j].y) < s[i].hd + s[j].hd) clash.push(`${s[i].kind}/${s[j].kind}`);
    expect(clash).toEqual([]);
  });
  it('plántulas y rama son sólidos', () => {
    const kinds = solidsOf(worldB09()).map((x) => x.kind);
    expect(kinds.filter((k) => k === 'plantSpecimen')).toHaveLength(2);
    expect(kinds).toContain('woodyBranch');
  });
});
