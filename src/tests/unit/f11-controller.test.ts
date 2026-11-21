/**
 * F11 — controlador de la escena: los gestos del ratón se traducen en los comandos físicos del dominio (sin Three.js).
 * La vista se simula: el puntero en píxeles ES la coordenada de la mesada en cm.
 */
import { describe, expect, it } from 'vitest';
import { F11Controller, type PickHitF, type ViewAdapterF } from '../../engine/f11/controller';
import type { F11Host } from '../../engine/f11/host';
import type { F11Lab3D } from '../../engine/f11/F11Lab3D';
import type { F11Command } from '../../simulation/f11-world/commands';
import { dispatchF11 } from '../../simulation/f11-world/world';
import { GEOF11 } from '../../simulation/f11-world/geometry';
import { worldF11 } from '../helpersF11';

function setup() {
  const w = worldF11({ scientificMode: 'CURRICULAR' });
  for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) dispatchF11(w, { type: 'equipPpe', item, on: true });
  dispatchF11(w, { type: 'startWork' });
  const sent: F11Command['type'][] = [];
  const notes: string[] = [];
  const host = {
    runtime: { world: w, dispatch: (c: F11Command) => (sent.push(c.type), dispatchF11(w, c)) },
    t: (k: string) => k, getSelected: () => null, select: () => undefined, notify: (_l: string, k: string) => void notes.push(k), sound: () => undefined,
    reducedMotion: () => true, guidedHints: () => true, showNames: () => false, nameTag: (id: string) => id,
  } as unknown as F11Host;
  const lab = { camera: { position: () => ({ x: 0, y: -200, z: 30 }), focusObject: () => undefined }, eyeOffsetCm: 0 } as unknown as F11Lab3D;
  const c = new F11Controller(host, lab);
  let next: PickHitF | null = null;
  const view: ViewAdapterF = {
    toBench: (sx, sy) => ({ x: sx, y: sy }),
    toWall: (sx, sy) => ({ x: sx, z: sy }),
    pick: () => next,
    viewW: () => 2000,
    setOrbitEnabled: () => undefined,
    edgePan: () => undefined,
  };
  c.view = view;
  const hitNext = (h: PickHitF | null) => (next = h);
  return { w, c, sent, notes, hitNext };
}

const G = GEOF11;
const T = G.tank;

/** Arrastra lo que está bajo el puntero hasta (x, y) y lo suelta. */
function drag(c: F11Controller, hitNext: (h: PickHitF | null) => void, id: string, from: { x: number; y: number }, to: { x: number; y: number }) {
  hitNext({ id, part: 'body' });
  c.onPointerDown(from.x, from.y, 0);
  c.onPointerMove(from.x, from.y + 10);
  expect(c.held?.id).toBe(id);
  hitNext(null);
  for (let i = 0; i < 60; i++) {
    c.onPointerMove(to.x, to.y);
    c.frame(0.05);
  }
  const dock = c.dockTarget;
  c.onPointerUp();
  return dock;
}

describe('F11 · controlador', () => {
  it('lleva el bloque del estante y lo suelta sobre el agua en la x bajo el puntero; avisa del hilo atado', () => {
    const { w, c, sent, notes, hitNext } = setup();
    const dock = drag(c, hitNext, 'float1', { x: G.rack.x - 14, y: G.rack.y }, { x: T.x0 + 25, y: T.y0 + T.W / 2 });
    expect(dock).toBe('tank01');
    expect(w.floats.float1.where).toBe('tank');
    expect(w.floats.float1.x).toBeGreaterThan(22);
    expect(w.floats.float1.x).toBeLessThan(28);
    expect(sent).toContain('releaseObject');
    expect(notes).toContain('f11.hint.thread');
    hitNext({ id: 'float1', part: 'thread' });
    c.onPointerDown(T.x0 + 25, T.y0, 0);
    c.onPointerUp();
    expect(w.floats.float1.tethered).toBe(false);
  });

  it('corre el carro de la guía a lo largo del tanque y lo traba con un clic en la traba', () => {
    const { w, c, hitNext } = setup();
    hitNext({ id: 'guide01', part: 'bridge' });
    const x0 = T.x0 + w.probe.gx;
    c.onPointerDown(x0, 40, 0);
    c.onPointerMove(x0 + 8, 40);
    c.onPointerMove(x0 + 12, 40);
    c.onPointerUp();
    expect(w.probe.gx).toBeCloseTo(x0 + 12 - T.x0, 1);
    hitNext({ id: 'guide01', part: 'lock' });
    c.onPointerDown(x0, 40, 0);
    c.onPointerUp();
    expect(w.probe.locked).toBe(true);
  });

  it('monta la sonda en la guía soltándola sobre el tanque y la baja arrastrando la varilla', () => {
    const { w, c, notes, hitNext } = setup();
    dispatchF11(w, { type: 'setTap', on: true });
    dispatchF11(w, { type: 'setTap', on: false });
    const dock = drag(c, hitNext, 'probe01', { x: G.holder.x, y: G.holder.y }, { x: T.x0 + 30, y: T.y0 + 12 });
    expect(dock).toBe('guide01');
    expect(w.probe.mount).toBe('guide');
    expect(notes).toContain('f11.hint.lock');
    hitNext({ id: 'probe01', part: 'rod' });
    c.onPointerDown(T.x0 + 30, 40, 0);
    c.onPointerMove(T.x0 + 30, 30);
    c.onPointerMove(T.x0 + 30, 21);
    c.onPointerUp();
    expect(w.probe.z).toBeCloseTo(20, 1);
  });

  it('pone el dinamómetro en cero con un clic, cuelga el bloque soltándolo junto al vaso de rebose y la rueda baja el brazo', () => {
    const { w, c, sent, notes, hitNext } = setup();
    hitNext({ id: 'dyn01', part: 'zero' });
    c.onPointerDown(G.can.x, G.can.y, 0);
    c.onPointerUp();
    expect(w.dyn.zeroed).toBe(true);
    const dock = drag(c, hitNext, 'alu1', { x: G.rack.x + 14, y: G.rack.y }, { x: G.can.x, y: G.can.y });
    expect(dock).toBe('dyn01');
    expect(w.dyn.holding).toBe(true);
    expect(sent).toContain('hangBlock');
    hitNext({ id: 'stand01', part: 'arm' });
    c.onPointerMove(G.stand.x, G.stand.y);
    const t0 = w.stand.target;
    expect(c.onWheel(1)).toBe(true);
    expect(w.stand.target).toBeLessThan(t0);
    hitNext({ id: 'dyn01', part: 'zero' });
    c.onPointerDown(G.can.x, G.can.y, 0);
    c.onPointerUp();
    expect(notes.some((n) => n.startsWith('f11.cmd.'))).toBe(true);
  });

  it('las llaves, la tara y el cero del registrador se accionan con un clic; un rechazo del dominio avisa', () => {
    const { w, c, notes, hitNext } = setup();
    const click = (id: string, part?: string) => {
      hitNext({ id, part });
      c.onPointerDown(10, 10, 0);
      c.onPointerUp();
    };
    click('tapA', 'handle');
    expect(w.valves.tap).toBe(true);
    click('tapA', 'handle');
    expect(w.valves.tap).toBe(false);
    click('balance01', 'tare');
    expect(w.balance.zeroed).toBe(true);
    click('logger01', 'zero');
    expect(notes).toContain('f11.cmd.NOT_CONNECTED');
    click('logger01', 'port');
    expect(w.probe.connected).toBe(true);
  });
});
