/**
 * F12 — controlador de la escena: los gestos del ratón se traducen en los comandos físicos del dominio (sin Three.js).
 * La vista se simula: el puntero en píxeles ES la coordenada de la mesada en cm.
 */
import { describe, expect, it } from 'vitest';
import { F12Controller, type PickHitF, type ViewAdapterF } from '../../engine/f12/controller';
import type { F12Host } from '../../engine/f12/host';
import type { F12Lab3D } from '../../engine/f12/F12Lab3D';
import type { F12Command } from '../../simulation/f12-world/commands';
import { dispatchF12 } from '../../simulation/f12-world/world';
import { GEOF12 } from '../../simulation/f12-world/geometry';
import { worldF12 } from '../helpersF12';

function setup() {
  const w = worldF12({ scientificMode: 'CURRICULAR' });
  for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) dispatchF12(w, { type: 'equipPpe', item, on: true });
  dispatchF12(w, { type: 'startWork' });
  const sent: F12Command['type'][] = [];
  const notes: string[] = [];
  const host = {
    runtime: { world: w, dispatch: (c: F12Command) => (sent.push(c.type), dispatchF12(w, c)) },
    t: (k: string) => k, getSelected: () => null, select: () => undefined, notify: (_l: string, k: string) => void notes.push(k), sound: () => undefined,
    reducedMotion: () => true, guidedHints: () => true, showNames: () => false, nameTag: (id: string) => id,
  } as unknown as F12Host;
  const lab = { camera: { position: () => ({ x: 0, y: -200, z: 30 }), focusObject: () => undefined, target: () => ({ x: 0, y: 0, z: 0 }) }, eyeOffsetCm: 0 } as unknown as F12Lab3D;
  const c = new F12Controller(host, lab);
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

const G = GEOF12;

/** Arrastra lo que está bajo el puntero hasta (x, y) y lo suelta. */
function drag(c: F12Controller, hitNext: (h: PickHitF | null) => void, id: string, from: { x: number; y: number }, to: { x: number; y: number }) {
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

/** Clic sin arrastre sobre una parte. */
function click(c: F12Controller, hitNext: (h: PickHitF | null) => void, id: string, part = 'body') {
  hitNext({ id, part });
  c.onPointerDown(100, 100, 0);
  c.onPointerUp();
}

describe('F12 · controlador', () => {
  it('lleva el vaso bajo el desviador y lo devuelve a la mesada; soltado lejos vuelve a la mesada', () => {
    const { w, c, sent, hitNext } = setup();
    const dock = drag(c, hitNext, 'beaker01', G.beakerBench, G.beakerOutlet);
    expect(dock).toBe('outlet01');
    expect(w.collect.beakerAt).toBe('outlet');
    expect(sent).toContain('moveBeaker');
    drag(c, hitNext, 'beaker01', G.beakerOutlet, { x: 200, y: 60 });
    expect(w.collect.beakerAt).toBe('bench');
  });

  it('el tapón soltado en la boca del Venturi queda dentro del conducto; un clic lo saca', () => {
    const { w, c, hitNext } = setup();
    expect(drag(c, hitNext, 'stopper01', G.stopper, { x: G.venturi.x0, y: G.pipeY })).toBe('venturi01');
    expect(w.stopper).toBe('pipe');
    expect(c.grabbable('stopper01')).toBe(false);
    click(c, hitNext, 'stopper01');
    expect(w.stopper).toBe('bench');
  });

  it('juntas: clic en el anillo coloca la empaquetadura y clic en la junta la aprieta; las tomas se destapan con un clic', () => {
    const { w, c, hitNext } = setup();
    click(c, hitNext, 'jointJ1', 'gasket');
    expect(w.circuit.joints.J1.gasket).toBe(true);
    click(c, hitNext, 'jointJ1');
    expect(w.circuit.joints.J1.connected).toBe(true);
    expect(w.ports[2].capped).toBe(true);
    click(c, hitNext, 'tap2');
    expect(w.ports[2].capped).toBe(false);
    expect(c.lastPort).toBe(2);
    click(c, hitNext, 'tap2', 'probe');
    expect(w.ports[2].probe).toBe('pitot');
  });

  it('la perilla de la bomba gira con un arrastre y la válvula avanza de a una posición cada 40 px', () => {
    const { w, c, hitNext } = setup();
    hitNext({ id: 'pump01', part: 'knob' });
    c.onPointerDown(100, 100, 0);
    for (let x = 100; x <= 200; x += 10) c.onPointerMove(x, 100);
    c.onPointerUp();
    expect(w.pump.set).toBeGreaterThan(0.3);
    expect(w.pump.on).toBe(false);
    const p0 = w.valve.pos;
    hitNext({ id: 'valve01', part: 'handle' });
    c.onPointerDown(100, 100, 0);
    for (let x = 100; x >= 20; x -= 5) c.onPointerMove(x, 100);
    c.onPointerUp();
    expect(w.valve.pos).toBe(Math.max(0, p0 - 2));
  });

  it('panel y registrador: enchufar sensores por clic, frecuencia, rango, cero y serie; la lectura de presiones sale del dominio', () => {
    const { w, c, sent, hitNext } = setup();
    click(c, hitNext, 'panel01', 's1');
    expect(w.sensors[1].port).toBe(1);
    click(c, hitNext, 'panel01', 's2');
    click(c, hitNext, 'panel01', 's2');
    expect(w.sensors[2].port).toBe(3);
    const hz = w.logger.rateHz;
    click(c, hitNext, 'logger01', 'rate');
    expect(w.logger.rateHz).not.toBe(hz);
    click(c, hitNext, 'logger01', 'zero');
    click(c, hitNext, 'logger01', 'series');
    expect(sent).toEqual(expect.arrayContaining(['connectSensor', 'setRate', 'zeroSensors', 'newSeries']));
    click(c, hitNext, 'logger01');
    expect(sent.at(-1)).toBe('readPressures');
  });

  it('teclas de lectura y velocidad; un rechazo del dominio avisa', () => {
    const { w, c, sent, notes, hitNext } = setup();
    expect(c.onKeyDown('PageUp', false)).toBe(true);
    expect(w.pump.set).toBeGreaterThan(0);
    c.onKeyDown('f', false);
    expect(sent.at(-1)).toBe('readFlow');
    c.onKeyDown('n', false);
    expect(sent.at(-1)).toBe('readSump');
    // Encender la bomba con el circuito abierto: el dominio lo rechaza y el controlador avisa.
    click(c, hitNext, 'pump01');
    expect(w.pump.on).toBe(false);
    expect(notes.some((k) => k.includes('CIRCUIT_OPEN'))).toBe(true);
  });

  it('el calibre cambia de cara con un clic, se inclina con un arrastre y mide la sección elegida', () => {
    const { w, c, hitNext } = setup();
    click(c, hitNext, 'sample01');
    expect(c.caliper.section).toBe('D2');
    hitNext({ id: 'caliper01', part: 'jaw' });
    c.onPointerDown(100, 100, 0);
    for (let x = 100; x <= 140; x += 5) c.onPointerMove(x, 100);
    c.onPointerUp();
    expect(c.caliper.tiltDeg).toBeGreaterThan(0);
    click(c, hitNext, 'caliper01');
    const r = w.readings[w.readingOrder.at(-1)!];
    expect(r.kind).toBe('diameter');
    expect(r.target).toBe('D2');
    expect(r.qualityFlags).toContain('OBLIQUE');
  });
});
