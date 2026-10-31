/**
 * B07 — la mesada obedece las físicas compartidas: ningún equipo fijo se solapa con otro, las placas tienen lugar propio
 * en la bandeja y lo que se suelta o lleva a mano no atraviesa los equipos (`MicroController` hereda los choques comunes).
 */
import { describe, expect, it } from 'vitest';
import { OpticalRuntime } from '../../app/b01/runtime';
import { MICRO_SIM } from '../../app/b07/sim';
import { OpticalLab3D } from '../../engine/optical/OpticalLab3D';
import type { OpticalHost } from '../../engine/optical/host';
import { freeBenchSpot, halfExtents, solidsOf } from '../../engine/optical/layout';
import { MicroController } from '../../engine/optical/microController';
import { GEO_B07, PLATE_TRAY, VIEWER, trayPos } from '../../simulation/micro-world/geometry';
import type { MicroWorld } from '../../simulation/micro-world/types';
import { ppeB07, worldB07 } from '../helpersB07';

function rig() {
  const w = worldB07();
  ppeB07(w);
  const rt = new OpticalRuntime<MicroWorld>(w, 'solids', [], MICRO_SIM);
  const host: OpticalHost = {
    runtime: rt, t: (k) => k, getSelected: () => null, select: () => {}, notify: () => {}, sound: () => {}, reducedMotion: () => true, guidedHints: () => false, showNames: () => false, nameTag: (id) => id,
    createController: (h, l) => new MicroController(h, l),
  };
  const c = new OpticalLab3D(host, 'LOW').controller as MicroController;
  return { w, c };
}

describe('B07: mesada', () => {
  it('los equipos fijos no se solapan entre sí', () => {
    const s = solidsOf(worldB07());
    const clash: string[] = [];
    for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) if (Math.abs(s[i].x - s[j].x) < s[i].hw + s[j].hw && Math.abs(s[i].y - s[j].y) < s[i].hd + s[j].hd) clash.push(`${s[i].kind}/${s[j].kind}`);
    expect(clash).toEqual([]);
  });
  it('los frascos, el visor, la bandeja y la rejilla son sólidos', () => {
    const kinds = solidsOf(worldB07()).map((x) => x.kind);
    for (const k of ['mediaJar', 'plateTray', 'plateViewer', 'stainRack', 'autoclaveMock'] as const) expect(kinds, k).toContain(k);
  });
  it('cuatro placas caben en la bandeja sin montarse', () => {
    const r = GEO_B07.plate.r;
    const p = [0, 1, 2, 3].map(trayPos);
    for (let i = 0; i < 4; i++) {
      expect(Math.abs(p[i].x - PLATE_TRAY.x) + r).toBeLessThanOrEqual(GEO_B07.tray.w / 2);
      expect(Math.abs(p[i].y - PLATE_TRAY.y) + r).toBeLessThanOrEqual(GEO_B07.tray.d / 2);
      for (let j = i + 1; j < 4; j++) expect(Math.hypot(p[i].x - p[j].x, p[i].y - p[j].y)).toBeGreaterThanOrEqual(2 * r);
    }
  });
  it('una placa soltada sobre el visor se acopla, y al volver a la bandeja regresa a su lugar', () => {
    const { w, c } = rig();
    c.beginDrag('plB', true);
    c.dispatch({ type: 'setPose', id: 'plB', pose: { x: VIEWER.x, y: VIEWER.y, z: 9, rotationRad: 0 } });
    c.release();
    expect(w.objects.plB.support).toBe('viewer');
    c.beginDrag('plB', true);
    c.dispatch({ type: 'setPose', id: 'plB', pose: { x: PLATE_TRAY.x, y: PLATE_TRAY.y, z: 8, rotationRad: 0 } });
    c.release();
    expect(w.objects.plB.support).toBe('plateTray');
    expect([w.objects.plB.pose.x, w.objects.plB.pose.y]).toEqual([trayPos(1).x, trayPos(1).y]);
  });
  it('un punto libre de la mesada respeta las huellas nuevas', () => {
    const w = worldB07();
    const [hw, hd] = halfExtents('petriPlate');
    for (const s of solidsOf(w)) {
      const [x, y] = freeBenchSpot(w, s.x, s.y, hw, hd);
      expect(solidsOf(w).filter((t) => Math.abs(x - t.x) < t.hw + hw && Math.abs(y - t.y) < t.hd + hd).map((t) => `${t.kind}@${t.x},${t.y}`), `${s.kind}@${s.x},${s.y} -> ${x},${y}`).toEqual([]);
    }
  });
  it('la mano pasa por encima de un frasco, nunca a través', () => {
    const { w, c } = rig();
    const jar = w.objects.mNA.pose;
    c.dispatch({ type: 'setPose', id: 'loop', pose: { x: jar.x, y: jar.y - 12, z: 0.4, rotationRad: 0 } });
    c.beginDrag('loop', true);
    c.view = { setOrbitEnabled: () => {}, viewW: () => 800 } as unknown as typeof c.view;
    const h = c.held!;
    h.z = 3;
    h.curZ = 3;
    h.x = jar.x;
    h.y = jar.y + 20;
    for (let i = 0; i < 120; i++) {
      c.frame(1 / 60);
      const p = w.objects.loop.pose;
      if (Math.abs(p.y - jar.y) < GEO_B07.jar.d / 2 && Math.abs(p.x - jar.x) < GEO_B07.jar.w / 2) expect(p.z).toBeGreaterThanOrEqual(GEO_B07.jar.h);
    }
  });
});
