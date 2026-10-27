/**
 * B01 — paridad de entradas (§14.4, §17.14): arrastrar la pieza con el ratón (o la mano de la demostración), el teclado
 * (Q/E sobre el mando seleccionado) y el panel accesible emiten comandos equivalentes del dominio y dejan el mismo
 * estado científico. El arrastre usa el mismo controlador que la escena, sin geometría de pantalla.
 */
import { describe, expect, it } from 'vitest';
import { OpticalRuntime } from '../../app/b01/runtime';
import { OpticalLab3D } from '../../engine/optical/OpticalLab3D';
import type { OpticalHost } from '../../engine/optical/host';
import { KIN, type PartGrip } from '../../engine/optical/parts';
import type { KnobB01 } from '../../engine/optical/controller';
import { microscopeView, stereoView } from '../../simulation/optical-world/world';
import type { B01Command } from '../../simulation/optical-world/commands';
import { worldB01, ppeB01 } from '../helpersB01';

function rig() {
  const w = worldB01();
  ppeB01(w);
  const rt = new OpticalRuntime(w, 'parity');
  const sent: B01Command[] = [];
  const orig = rt.dispatch.bind(rt);
  rt.dispatch = (c) => {
    sent.push(c as B01Command);
    return orig(c);
  };
  let selected: string | null = null;
  const host: OpticalHost = {
    runtime: rt, t: (k) => k, getSelected: () => selected, select: (id) => { selected = id; },
    notify: () => {}, sound: () => {}, reducedMotion: () => true, guidedHints: () => false, showNames: () => false, nameTag: (id) => id,
  };
  const lab = new OpticalLab3D(host, 'LOW');
  return { w, rt, c: lab.controller, sent };
}

const rot = (axis: PartGrip['axis']): PartGrip => ({ kind: 'rotary', axis });
/** Arrastre de una pieza en `n` pasos de `rad`, con un fotograma entre pasos (envío cuantizado). */
function dragBy(r: ReturnType<typeof rig>, id: string, part: string, grip: PartGrip, rad: number, n: number) {
  r.c.grabPart(id, part, grip);
  for (let i = 0; i < n; i++) {
    r.c.dragPart(rad);
    r.c.frame(1 / 60);
  }
  r.c.releasePart();
}
const keys = (r: ReturnType<typeof rig>, knob: KnobB01, dir: 1 | -1, n: number) => {
  r.c.knob = knob;
  for (let i = 0; i < n; i++) r.c.turnKnob(dir, false);
};

describe('B01 — ratón, teclado y panel dan el mismo estado', () => {
  it('macro y micro: misma altura de platina', () => {
    const mouse = rig();
    const key = rig();
    const panel = rig();
    dragBy(mouse, 'mic', 'coarse', rot('x'), 0.1 * KIN.radPerTurn, 7);
    dragBy(mouse, 'mic', 'fine', rot('x'), -0.05 * KIN.radPerTurn, 3);
    keys(key, 'mic:coarse', 1, 7);
    keys(key, 'mic:fine', -1, 3);
    for (let i = 0; i < 7; i++) panel.rt.dispatch({ type: 'turnCoarse', deltaTurns: 0.1 });
    for (let i = 0; i < 3; i++) panel.rt.dispatch({ type: 'turnFine', deltaTurns: -0.05 });
    for (const r of [key, panel]) {
      expect(r.w.microscope.coarseTurns).toBeCloseTo(mouse.w.microscope.coarseTurns, 9);
      expect(r.w.microscope.fineTurns).toBeCloseTo(mouse.w.microscope.fineTurns, 9);
      expect(microscopeView(r.w).stageZmm).toBeCloseTo(microscopeView(mouse.w).stageZmm, 9);
    }
    // El arrastre va entre inicio y fin de gesto; el teclado y el panel, no.
    expect(mouse.sent.filter((c) => c.type === 'gesture').map((c) => c.type === 'gesture' && `${c.part}:${c.phase}`)).toEqual(['mic:coarse:begin', 'mic:coarse:end', 'mic:fine:begin', 'mic:fine:end']);
  });

  it('revólver: arrastrado hasta cerca del clic, encaja en el mismo objetivo que con el teclado y el panel', () => {
    const mouse = rig();
    const key = rig();
    const panel = rig();
    // 110° arrastrados: el resorte lo lleva a 120° (10X) al soltar.
    dragBy(mouse, 'mic', 'turret', rot('y'), 11 * KIN.turretRadPerDeg, 10);
    keys(key, 'mic:turret', 1, 1);
    panel.rt.dispatch({ type: 'turnTurret', deltaDeg: panel.c.nextTurretDelta(1) });
    for (const r of [mouse, key, panel]) expect(r.w.microscope.turretDeg).toBe(120);
    expect(microscopeView(mouse.w).objectiveX).toBe(10);
    expect(mouse.w.evidence['err:E71']).toBeUndefined();
  });

  it('revólver soltado lejos de un enclavamiento: queda entre dos (E71), igual que «girar un poco» del panel', () => {
    const mouse = rig();
    dragBy(mouse, 'mic', 'turret', rot('y'), 6 * KIN.turretRadPerDeg, 10);
    expect(mouse.w.microscope.turretDeg).toBeCloseTo(60, 6);
    expect(microscopeView(mouse.w).locked).toBe(false);
    expect(mouse.w.evidence['err:E71']).toBe(1);
  });

  it('pinza: empujar la palanca hasta el fondo la deja abierta; soltarla a medio camino, el resorte la cierra', () => {
    const r = rig();
    expect(r.w.microscope.clipOpen).toBe(true);
    r.c.grabPart('mic', 'clip', { kind: 'lever', axis: 'y' });
    r.c.dragPart(-0.4 * KIN.clipOpenRad);
    r.c.releasePart();
    expect(r.w.microscope.clipOpen).toBe(true);
    r.c.grabPart('mic', 'clip', { kind: 'lever', axis: 'y' });
    r.c.dragPart(-0.8 * KIN.clipOpenRad);
    r.c.releasePart();
    expect(r.w.microscope.clipOpen).toBe(false);
    const panel = rig();
    panel.rt.dispatch({ type: 'openClip', open: false });
    expect(panel.w.microscope.clipOpen).toBe(r.w.microscope.clipOpen);
  });

  it('mandos X/Y, iris, zoom y enfoque del estéreo: mismos valores por los tres caminos', () => {
    const mouse = rig();
    const key = rig();
    dragBy(mouse, 'mic', 'stageX', rot('y'), 0.2 * KIN.stageRadPerMm, 5);
    dragBy(mouse, 'mic', 'diaphragm', { kind: 'lever', axis: 'y' }, 0.02 * KIN.irisRadPer01, 5);
    dragBy(mouse, 'ste', 'zoom', rot('x'), 0.1 * KIN.zoomRadPerX, 8);
    dragBy(mouse, 'ste', 'focus', rot('x'), 0.25 * KIN.radPerTurn, 4);
    keys(key, 'mic:stageX', 1, 5);
    keys(key, 'mic:diaphragm', 1, 5);
    keys(key, 'ste:zoom', 1, 8);
    keys(key, 'ste:focus', 1, 4);
    expect(mouse.w.microscope.stageXmm).toBeCloseTo(key.w.microscope.stageXmm, 6);
    expect(mouse.w.microscope.diaphragm01).toBeCloseTo(key.w.microscope.diaphragm01, 6);
    expect(mouse.w.stereo.zoomX).toBeCloseTo(key.w.stereo.zoomX, 6);
    expect(mouse.w.stereo.focusTurns).toBeCloseTo(key.w.stereo.focusTurns, 6);
    expect(stereoView(mouse.w).fovMm).toBeCloseTo(stereoView(key.w).fovMm, 6);
  });

  it('oculares: deslizar un tubo cambia la distancia interpupilar del equipo tomado, no la del otro', () => {
    const r = rig();
    const ipd0 = r.w.stereo.ipdMm;
    r.c.grabPart('mic', 'ocular', { kind: 'linear', axis: 'x', click: true, variant: 'right' });
    r.c.dragPart(0.2);
    r.c.frame(1 / 60);
    r.c.releasePart();
    expect(r.w.microscope.ipdMm).toBeCloseTo(ipd0 + 4, 6);
    expect(r.w.stereo.ipdMm).toBe(ipd0);
  });
});
