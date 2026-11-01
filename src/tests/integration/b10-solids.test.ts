/**
 * B10 — la mesada obedece las físicas compartidas: los equipos fijos no se solapan, los estantes y las bandejas tienen volumen para el
 * choque y un objeto soltado encima no los atraviesa (`AnimalController` hereda los choques comunes).
 */
import { describe, expect, it } from 'vitest';
import { solidsOf } from '../../engine/optical/layout';
import { worldB10 } from '../helpersB10';

describe('B10: mesada', () => {
  it('los equipos fijos no se solapan entre sí', () => {
    const s = solidsOf(worldB10());
    const clash: string[] = [];
    for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) if (Math.abs(s[i].x - s[j].x) < s[i].hw + s[j].hw && Math.abs(s[i].y - s[j].y) < s[i].hd + s[j].hd) clash.push(`${s[i].kind}/${s[j].kind}`);
    expect(clash).toEqual([]);
  });
  it('los estantes y la bandeja de huellas son sólidos', () => {
    const kinds = solidsOf(worldB10()).map((x) => x.kind);
    expect(kinds.filter((k) => k === 'modelShelf')).toHaveLength(4);
    expect(kinds).toContain('trackTray');
    expect(kinds).toContain('orientationBoard');
  });
});
