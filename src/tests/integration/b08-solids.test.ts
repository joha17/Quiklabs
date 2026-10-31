/**
 * B08 — la mesada obedece las físicas compartidas: los equipos fijos no se solapan, tienen volumen para el choque y las
 * ramas y tubos encuentran su apoyo al soltarlos (`PhotoController` hereda los choques comunes).
 */
import { describe, expect, it } from 'vitest';
import { OpticalRuntime } from '../../app/b01/runtime';
import { PHOTO_SIM } from '../../app/b08/sim';
import { OpticalLab3D } from '../../engine/optical/OpticalLab3D';
import type { OpticalHost } from '../../engine/optical/host';
import { solidsOf } from '../../engine/optical/layout';
import { PhotoController } from '../../engine/optical/photoController';
import { TANK_SLOT } from '../../simulation/photo-world/geometry';
import type { PhotoWorld } from '../../simulation/photo-world/types';
import { ppeB08, worldB08 } from '../helpersB08';

function rig() {
  const w = worldB08();
  ppeB08(w);
  const rt = new OpticalRuntime<PhotoWorld>(w, 'solids', [], PHOTO_SIM);
  const host = {
    runtime: rt, t: (k: string) => k, getSelected: () => null, select: () => {}, notify: () => {}, sound: () => {}, reducedMotion: () => true, guidedHints: () => false, showNames: () => false, nameTag: (id: string) => id,
    createController: (h: OpticalHost, l: OpticalLab3D) => new PhotoController(h, l),
  } as unknown as OpticalHost;
  return { w, c: new OpticalLab3D(host, 'LOW').controller as PhotoController };
}

describe('B08: mesada', () => {
  it('los equipos fijos no se solapan entre sí', () => {
    const s = solidsOf(worldB08());
    const clash: string[] = [];
    for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) if (Math.abs(s[i].x - s[j].x) < s[i].hw + s[j].hw && Math.abs(s[i].y - s[j].y) < s[i].hd + s[j].hd) clash.push(`${s[i].kind}/${s[j].kind}`);
    expect(clash).toEqual([]);
  });
  it('baño, gradillas, balanza, mortero, residuos y tablero son sólidos', () => {
    const kinds = solidsOf(worldB08()).map((x) => x.kind);
    for (const k of ['thermalTank', 'gasRack', 'btbRack', 'leafBalance', 'mortar', 'organicWaste', 'paperStand'] as const) expect(kinds, k).toContain(k);
  });
  it('soltar un tubo sobre el baño lo acopla a su lugar y la rama lo sigue', () => {
    const { w, c } = rig();
    c.place('el1', 'elodeaSprig', { x: w.objects.gL.pose.x, y: w.objects.gL.pose.y, z: 8, rotationRad: 0 });
    expect(w.objects.el1.support).toBe('tube:gL');
    c.place('gL', 'gasTube', { x: TANK_SLOT.aqA.x, y: TANK_SLOT.aqA.y, z: 12, rotationRad: 0 });
    expect(w.objects.gL.support).toBe('aqA');
    expect(w.objects.el1.pose.x).toBeCloseTo(TANK_SLOT.aqA.x, 6);
  });
  it('el segundo tubo no se monta sobre el primero', () => {
    const { w, c } = rig();
    c.place('gL', 'gasTube', { x: TANK_SLOT.aqA.x, y: TANK_SLOT.aqA.y, z: 12, rotationRad: 0 });
    c.place('gD', 'gasTube', { x: TANK_SLOT.aqA.x, y: TANK_SLOT.aqA.y, z: 12, rotationRad: 0 });
    expect(w.objects.gD.support).not.toBe('aqA');
  });
});
