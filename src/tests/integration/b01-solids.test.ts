/**
 * B01 — lo que se suelta no atraviesa los equipos: una lámina rechazada por la platina cae junto al microscopio (no
 * dentro de su base), los topes de la platina no se traspasan y la mano pasa por encima de la platina.
 */
import { describe, expect, it } from 'vitest';
import { OpticalRuntime } from '../../app/b01/runtime';
import { OpticalLab3D } from '../../engine/optical/OpticalLab3D';
import type { OpticalHost } from '../../engine/optical/host';
import { freeBenchSpot, halfExtents, solidsOf, stageTop } from '../../engine/optical/layout';
import { GEO_B01, MIC_POS, STAGE_SEAT } from '../../simulation/optical-world/geometry';
import { microscopeView } from '../../simulation/optical-world/world';
import { worldB01, ppeB01 } from '../helpersB01';

function rig() {
  const w = worldB01();
  ppeB01(w);
  const rt = new OpticalRuntime(w, 'solids');
  const host: OpticalHost = {
    runtime: rt, t: (k) => k, getSelected: () => null, select: () => {},
    notify: () => {}, sound: () => {}, reducedMotion: () => true, guidedHints: () => false, showNames: () => false, nameTag: (id) => id,
  };
  const c = new OpticalLab3D(host, 'LOW').controller;
  const slides = Object.values(w.objects).filter((o) => o.kind === 'fixedSlide').map((o) => o.id);
  c.dispatch({ type: 'openSlideCase', open: true });
  c.dispatch({ type: 'openClip', open: true });
  const drop = (id: string, x: number, y: number) => {
    c.beginDrag(id, true);
    c.dispatch({ type: 'setPose', id, pose: { x, y, z: 16, rotationRad: 0 } });
    c.release();
    return w.objects[id];
  };
  return { w, c, slides, drop };
}

const overlapsBase = (x: number, y: number) => Math.abs(x - MIC_POS.x) < GEO_B01.microscope.baseW / 2 + GEO_B01.slide.w / 2 && Math.abs(y - MIC_POS.y) < GEO_B01.microscope.baseD / 2 + GEO_B01.slide.d / 2;

describe('B01: los equipos son macizos', () => {
  it('con la platina ocupada, la segunda lámina cae fuera de la base', () => {
    const { slides, drop } = rig();
    expect(drop(slides[0], STAGE_SEAT.x, STAGE_SEAT.y).support).toBe('stage');
    const o = drop(slides[1], STAGE_SEAT.x + 1, STAGE_SEAT.y + 1);
    expect(o.support).toBe('bench');
    expect(overlapsBase(o.pose.x, o.pose.y)).toBe(false);
  });

  it('con la pinza cerrada, la lámina rechazada cae fuera de la base', () => {
    const { c, slides, drop } = rig();
    c.dispatch({ type: 'openClip', open: false });
    const o = drop(slides[0], STAGE_SEAT.x, STAGE_SEAT.y);
    expect(o.support).toBe('bench');
    expect(overlapsBase(o.pose.x, o.pose.y)).toBe(false);
  });

  it('los topes trasero e izquierdo detienen la lámina; hacia delante conserva la desalineación', () => {
    const { w, slides, drop } = rig();
    const o = drop(slides[0], STAGE_SEAT.x - 2, STAGE_SEAT.y + 2);
    expect([o.pose.x, o.pose.y]).toEqual([STAGE_SEAT.x, STAGE_SEAT.y]);
    expect(w.microscope.slideOffsetMm).toEqual([0, 0]);
    const { w: w2, slides: s2, drop: drop2 } = rig();
    drop2(s2[0], STAGE_SEAT.x + 2, STAGE_SEAT.y - 1);
    expect(w2.microscope.slideOffsetMm).toEqual([20, -10]);
  });

  it('la lámina en la mano sube por encima de la platina antes de entrar en la huella del microscopio', () => {
    const { w, c, slides } = rig();
    const id = slides[0];
    c.beginDrag(id, true);
    c.view = { setOrbitEnabled: () => {}, viewW: () => 800 } as unknown as typeof c.view;
    const h = c.held!;
    h.x = MIC_POS.x;
    h.y = MIC_POS.y - GEO_B01.microscope.baseD / 2 - 1;
    h.z = 0;
    for (let i = 0; i < 90; i++) c.frame(1 / 60);
    expect(w.objects[id].pose.z).toBeGreaterThan(stageTop(w));
  });

  it('un punto de la mesada libre de equipos no se solapa con ninguna huella', () => {
    const { w } = rig();
    const [hw, hd] = halfExtents('fixedSlide');
    for (const s of solidsOf(w)) {
      const [x, y] = freeBenchSpot(w, s.x, s.y, hw, hd);
      expect(solidsOf(w).some((t) => Math.abs(x - t.x) < t.hw + hw && Math.abs(y - t.y) < t.hd + hd)).toBe(false);
    }
  });

  it('no se puede meter una lámina con el objetivo pegado a la platina', () => {
    const { w, c, slides } = rig();
    w.microscope.coarseTurns = 100;
    // Objetivo más largo enclavado: la separación más corta que admite el revólver.
    w.microscope.turretDeg = [0, 90, 120, 180, 240, 270].reduce((best, d) => {
      w.microscope.turretDeg = d;
      const gap = microscopeView(w).gapMm;
      w.microscope.turretDeg = best;
      return gap < microscopeView(w).gapMm ? d : best;
    }, 0);
    expect(microscopeView(w).gapMm).toBeLessThan(w.params.microscope.gapSafeRemoveMm);
    const r = c.dispatch({ type: 'setPose', id: slides[0], pose: { x: STAGE_SEAT.x, y: STAGE_SEAT.y, z: 14, rotationRad: 0 }, support: 'stage' });
    expect(r.ok).toBe(false);
  });

  it('la mano choca con el brazo del microscopio: no lo cruza aunque el puntero ya esté detrás', () => {
    const { w, c, slides } = rig();
    const id = slides[0];
    const arm = MIC_POS.y + 3.4;
    c.dispatch({ type: 'setPose', id, pose: { x: MIC_POS.x, y: arm - 3, z: 5, rotationRad: 0 } });
    c.beginDrag(id, true);
    c.view = { setOrbitEnabled: () => {}, viewW: () => 800 } as unknown as typeof c.view;
    const h = c.held!;
    h.z = 5;
    h.curZ = 5;
    h.x = MIC_POS.x;
    h.y = MIC_POS.y + 20;
    for (let i = 0; i < 60; i++) c.frame(1 / 60);
    expect(w.objects[id].pose.y).toBeLessThan(arm);
  });
});
