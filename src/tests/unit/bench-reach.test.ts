import { describe, expect, it } from 'vitest';
import { clampToBench } from '../../engine/interaction/viewport';

describe('alcance de la mano sobre la mesada', () => {
  it('no deja pasar la pared ni el borde frontal', () => {
    expect(clampToBench(100, 400).y).toBe(61);
    expect(clampToBench(100, -50).y).toBe(3);
  });

  it('no deja salir por los extremos de la mesada', () => {
    expect(clampToBench(-500, 30).x).toBe(-8);
    expect(clampToBench(5000, 30).x).toBe(631);
  });

  it('no altera un punto sobre la mesada', () => {
    expect(clampToBench(280, 30)).toEqual({ x: 280, y: 30 });
  });

  it('no deja entrar en los laterales de la campana', () => {
    const p = clampToBench(350, 60);
    expect(p.x < 347.5 || p.x > 352.5 || p.y < 52).toBe(true);
    expect(clampToBench(350, 40)).toEqual({ x: 350, y: 40 });
    expect(clampToBench(450, 60)).toEqual({ x: 450, y: 60 });
  });
});
