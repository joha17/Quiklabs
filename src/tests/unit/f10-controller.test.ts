/**
 * F10 — controlador de la escena: los gestos del ratón se traducen en los comandos físicos del dominio (sin Three.js).
 * La vista se simula: el puntero en píxeles ES la coordenada de la mesada en cm.
 */
import { describe, expect, it } from 'vitest';
import { F10Controller, type PickHitF, type ViewAdapterF } from '../../engine/f10/controller';
import type { F10Host } from '../../engine/f10/host';
import type { F10Lab3D } from '../../engine/f10/F10Lab3D';
import type { F10Command } from '../../simulation/f10-world/commands';
import { dispatchF10 } from '../../simulation/f10-world/world';
import { GEOF10 } from '../../simulation/f10-world/geometry';
import { worldF10 } from '../helpersF10';

function setup() {
  const w = worldF10({ scientificMode: 'CURRICULAR' });
  for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) dispatchF10(w, { type: 'equipPpe', item, on: true });
  dispatchF10(w, { type: 'startWork' });
  const sent: F10Command['type'][] = [];
  const notes: string[] = [];
  const host = {
    runtime: { world: w, dispatch: (c: F10Command) => (sent.push(c.type), dispatchF10(w, c)) },
    t: (k: string) => k, getSelected: () => null, select: () => undefined, notify: (_l: string, k: string) => void notes.push(k), sound: () => undefined,
    reducedMotion: () => true, guidedHints: () => true, showNames: () => false, nameTag: (id: string) => id,
  } as unknown as F10Host;
  const lab = { camera: { position: () => ({ x: 0, y: -200, z: 30 }), focusObject: () => undefined }, eyeOffsetCm: 0 } as unknown as F10Lab3D;
  const c = new F10Controller(host, lab);
  let next: PickHitF | null = null;
  const view: ViewAdapterF = {
    toBench: (sx, sy) => ({ x: sx, y: sy }),
    toWall: (sx) => ({ x: sx, z: 0 }),
    pick: () => next,
    viewW: () => 2000,
    setOrbitEnabled: () => undefined,
    edgePan: () => undefined,
  };
  c.view = view;
  const hitNext = (h: PickHitF | null) => (next = h);
  return { w, c, sent, notes, hitNext };
}

describe('F10 · controlador', () => {
  it('arrastra la viga del soporte a los apoyos y la asienta con un clic', () => {
    const { w, c, sent, hitNext } = setup();
    hitNext({ id: 'beam01', part: 'body' });
    c.onPointerDown(GEOF10.beam.x0 + 60, GEOF10.store.y, 0);
    c.onPointerMove(GEOF10.beam.x0 + 60, GEOF10.store.y - 10);
    expect(c.held?.id).toBe('beam01');
    for (let i = 0; i < 40; i++) {
      c.onPointerMove(GEOF10.beam.x0 + 60, GEOF10.rail.y);
      c.held!.z = GEOF10.support.z + 4;
      c.frame(0.05);
    }
    expect(c.dockTarget).toBe('rail01');
    c.onPointerUp();
    expect(w.beam.where).toBe('supports');
    expect(w.objects.beam01.support).not.toBe('hand');
    hitNext({ id: 'beam01', part: 'body' });
    c.onPointerDown(100, 32, 0);
    c.onPointerUp();
    expect(w.beam.seated).toBe(true);
    expect(sent).toContain('placeBeam');
  });

  it('corre un apoyo a lo largo del riel y lo traba con un clic en la traba', () => {
    const { w, c, hitNext } = setup();
    hitNext({ id: 'supportA', part: 'body' });
    const x0 = GEOF10.beam.x0 + w.supports.A.s;
    c.onPointerDown(x0, 32, 0);
    c.onPointerMove(x0 + 8, 32);
    c.onPointerMove(x0 + 15, 32);
    c.onPointerUp();
    expect(w.supports.A.s).toBeCloseTo(x0 + 15 - GEOF10.beam.x0, 1);
    hitNext({ id: 'supportA', part: 'clamp' });
    c.onPointerDown(x0, 32, 0);
    c.onPointerUp();
    expect(w.supports.A.clamped).toBe(true);
  });

  it('suelta el portapesas sobre la viga en la coordenada bajo el puntero y avisa del gancho abierto', () => {
    const { w, c, notes, hitNext } = setup();
    dispatchF10(w, { type: 'placeBeam', where: 'supports' });
    hitNext({ id: 'load1', part: 'body' });
    c.onPointerDown(GEOF10.loadRack.x, GEOF10.loadRack.y, 0);
    c.onPointerMove(GEOF10.loadRack.x, GEOF10.loadRack.y + 10);
    expect(c.held?.id).toBe('load1');
    for (let i = 0; i < 60; i++) {
      c.onPointerMove(GEOF10.beam.x0 + 70, GEOF10.beam.y);
      c.frame(0.05);
    }
    expect(c.dockTarget).toBe('beam01');
    c.onPointerUp();
    expect(w.loads.load1.where).toBe('beam');
    expect(w.loads.load1.s).toBeGreaterThan(65);
    expect(w.loads.load1.s).toBeLessThan(75);
    expect(notes).toContain('f10.hint.hook');
  });

  it('la manivela sube con la rueda del ratón y el enclavamiento rechaza cargar con el protector abierto', () => {
    const { w, c, notes, hitNext } = setup();
    dispatchF10(w, { type: 'installSpecimen', id: 'spec1' });
    dispatchF10(w, { type: 'lockCrank', on: false });
    hitNext({ id: 'crank01', part: 'wheel' });
    c.onPointerMove(10, 10);
    expect(c.onWheel(-1)).toBe(true);
    expect(w.press.target).toBeGreaterThan(0);
    dispatchF10(w, { type: 'setCrank', mm: 0 });
    for (const grip of ['bottom', 'top'] as const) dispatchF10(w, { type: 'clampGrip', grip, on: true });
    c.crankTo(0.1);
    expect(notes).toContain('f10.cmd.SHIELD_OPEN');
  });
});
