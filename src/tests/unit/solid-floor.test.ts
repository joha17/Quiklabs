import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { clearSpotNear, solidFloorOf, solidPushOf } from '../../engine/interaction/solidFloor';

/** Caja de hit en cm de mesada (escena: x, z arriba, -y). */
function solid(objId: string, x: number, y: number, z: number, w: number, d: number, h: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d));
  m.position.set(x, z + h / 2, -y);
  m.userData = { objId };
  m.updateMatrixWorld();
  return m;
}

describe('cuerpo macizo de lo que se lleva en la mano', () => {
  // Encendedor: el origen es la punta y el mango se extiende 26 cm hacia la izquierda.
  const lighter = solid('lighter', -13, 0, 1, 26, 2, 2);
  const burner = solid('burner', 20, 0, 0, 8, 8, 12);
  const pose = { x: 0, y: 0, z: 1 };

  it('sube por encima si cualquier parte del cuerpo entra en otro objeto, aunque el origen esté libre', () => {
    expect(solidFloorOf([lighter, burner], 'lighter', pose, 30, 0, ['burner'])).toBeCloseTo(12.2);
  });

  it('no sube si el cuerpo pasa libre', () => {
    expect(solidFloorOf([lighter, burner], 'lighter', pose, 0, 0, ['burner'])).toBe(0);
  });

  it('ignora lo que no descansa en la mesada y lo muy alto', () => {
    expect(solidFloorOf([lighter, burner], 'lighter', pose, 30, 0, [])).toBe(0);
    const rod = solid('stand', 20, 0, 0, 2, 2, 60);
    expect(solidFloorOf([lighter, rod], 'lighter', pose, 30, 0, ['stand'])).toBe(0);
  });

  it('al soltar busca el primer punto libre cercano', () => {
    const spot = clearSpotNear((x) => (x === 100 ? 12 : 0), 100, 30, 0);
    expect(spot).toEqual({ x: 95, y: 30 });
  });

  it('lo muy alto detiene cualquier objeto; lo arrastrado por la mesada choca con todo menos lo plano', () => {
    const panel = solid('shield', 30, 0, 0, 2, 40, 40);
    const bottle = solid('bottle', 30, 0, 0, 6, 6, 14);
    const base = solid('stand', 30, 0, 0, 18, 13, 1.4);
    const burnerAt0 = solid('burner', 0, 0, 0, 8, 8, 12);
    const cur = { x: 0, y: 0 };
    expect(solidPushOf([burnerAt0, panel], 'burner', cur, 30, 0, ['shield'], false).x).toBeLessThan(26);
    expect(solidPushOf([burnerAt0, bottle], 'burner', cur, 30, 0, ['bottle'], true).x).toBeLessThan(23);
    expect(solidPushOf([burnerAt0, bottle], 'burner', cur, 30, 0, ['bottle'], false)).toEqual({ x: 30, y: 0 });
    expect(solidPushOf([burnerAt0, base], 'burner', cur, 30, 0, ['stand'], true)).toEqual({ x: 30, y: 0 });
  });

  it('el cuerpo no entra en el lateral de la campana', () => {
    const burnerAt0 = solid('burner', 300, 30, 0, 14, 14, 12);
    const p = solidPushOf([burnerAt0], 'burner', { x: 300, y: 30 }, 350, 58, [], true);
    expect(p.x + 7 < 348 || p.x - 7 > 352 || p.y + 7 < 52.5).toBe(true);
  });

  it('choca: aunque el puntero salte detrás del obstáculo, no lo cruza y se desliza por su cara', () => {
    const panel = solid('shield', 30, 0, 0, 2, 40, 40);
    const burnerAt0 = solid('burner', 0, 0, 0, 8, 8, 12);
    const cur = { x: 0, y: 0 };
    const p = solidPushOf([burnerAt0, panel], 'burner', cur, 100, 10, ['shield'], true);
    expect(p.x).toBeLessThan(26);
    expect(p.y).toBeCloseTo(10);
    // También por el otro lado y con solo la punta.
    expect(solidPushOf([solid('burner', 60, 0, 0, 8, 8, 12), panel], 'burner', { x: 60, y: 0 }, 0, 0, ['shield'], true).x).toBeGreaterThan(30);
    expect(solidPushOf([burnerAt0, panel], 'burner', cur, 100, 0, ['shield'], false, true).x).toBeLessThan(29.5);
  });

  it('un objeto ya atascado dentro de otro se puede sacar', () => {
    const bottle = solid('bottle', 0, 0, 0, 6, 6, 14);
    const burnerAt0 = solid('burner', 0, 0, 0, 8, 8, 12);
    expect(solidPushOf([burnerAt0, bottle], 'burner', { x: 0, y: 0 }, 20, 0, ['bottle'], true).x).toBeCloseTo(20);
  });

  it('lo que ya va por encima de lo alto pasa libre', () => {
    const panel = solid('cylinder', 30, 0, 0, 6, 6, 25);
    const bottle = solid('bottle', 0, 0, 30, 8, 8, 12);
    expect(solidPushOf([bottle, panel], 'bottle', { x: 0, y: 0, z: 30 }, 30, 0, ['cylinder'], false)).toEqual({ x: 30, y: 0 });
  });
});
