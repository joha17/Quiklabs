/**
 * Controlador de gestos de B08: el común (microscopio, choques, límites de la mesada) más lo propio, siempre como hecho
 * sobre lo que se suelta o se tiene en la mano. Soltar: rama en su tubo, tubo en el baño, pantalla sobre un tubo, hoja en
 * la balanza, papel y vial a residuos. P: gotero sobre un tubo de BTB. La distancia de la lámpara y si un frasco está en la
 * campana salen de la pose real; los gestos finos (tapón, nivel, regla) se hacen en la mesa de trabajo.
 */
import type { B01ObjKind, Pose } from '../../simulation/optical-world/types';
import type { PhotoCommand } from '../../simulation/photo-world/commands';
import type { PhotoWorld } from '../../simulation/photo-world/types';
import { BALANCE, GAS_RACK, GAS_TUBES, ORGANIC_WASTE, DRAIN, SPRIG_TRAY, TANK, TANK_SLOT } from '../../simulation/photo-world/geometry';
import { DivController } from './divController';
import type { Spot } from './layout';

export class PhotoController extends DivController {
  private get pw(): PhotoWorld {
    return this.w as PhotoWorld;
  }

  photo(c: PhotoCommand) {
    return this.run(this.dispatch(c as never));
  }

  protected spots(kind: B01ObjKind): Spot[] {
    const w = this.pw;
    const out = super.spots(kind);
    const tubesPos = [...Object.keys(w.photo.tubes), ...Object.keys(w.photo.btb)].map((id) => ({ id, p: w.objects[id].pose }));
    if (kind === 'elodeaSprig') {
      for (const { id, p } of tubesPos) out.push({ id: `tube:${id}`, x: p.x, y: p.y, z: p.z + 0.5, r: 2.6 });
      out.push({ id: 'sprigTray', x: SPRIG_TRAY.x, y: SPRIG_TRAY.y, z: SPRIG_TRAY.z, r: 8 });
    }
    if (kind === 'gasTube') {
      for (const s of ['aqA', 'aqB'] as const) out.push({ id: s, x: TANK_SLOT[s].x, y: TANK_SLOT[s].y, z: TANK.z, r: 7 });
      out.push({ id: 'gasRack', x: GAS_RACK.x, y: GAS_RACK.y, z: GAS_RACK.z - 5, r: 10 });
    }
    if (kind === 'darkCover') for (const { id, p } of tubesPos) out.push({ id: `cover:${id}`, x: p.x, y: p.y, z: p.z, r: 3.5 });
    if (kind === 'spinachLeaf') out.push({ id: 'balance', x: BALANCE.x, y: BALANCE.y, z: BALANCE.z, r: 7 });
    if (kind === 'chromPaper' || kind === 'extractVial') {
      out.push({ id: 'organicWaste', x: ORGANIC_WASTE.x, y: ORGANIC_WASTE.y, z: 14, r: 6 });
      out.push({ id: 'drain', x: DRAIN.x, y: DRAIN.y, z: 3, r: 6 });
    }
    return out;
  }

  protected sharedSpot(id: string): boolean {
    return id === 'organicWaste' || id === 'drain' || id === 'sprigTray' || id === 'gasRack' || super.sharedSpot(id);
  }

  protected spotPose(s: Spot, n: number): Pose {
    if (s.id === 'gasRack' && this.docking && GAS_TUBES[this.docking]) return { x: GAS_TUBES[this.docking].x, y: GAS_TUBES[this.docking].y, z: s.z, rotationRad: 0 };
    if (s.id === 'sprigTray') return { x: s.x - 6 + n * 4, y: s.y, z: s.z, rotationRad: 0 };
    return super.spotPose(s, n);
  }

  /** Al soltar, `held` ya está vacío cuando se calcula el apoyo: se recuerda qué objeto se acopla. */
  private docking: string | null = null;

  release() {
    this.docking = this.held?.id ?? null;
    const r = super.release();
    this.docking = null;
    return r;
  }

  targetUnder(): string | null {
    const h = this.held;
    if (!h || h.kind !== 'btbDropper') return super.targetUnder();
    const w = this.pw;
    for (const id of Object.keys(w.photo.btb)) if (Math.hypot(h.x - w.objects[id].pose.x, h.y - w.objects[id].pose.y) <= 3.5) return id;
    return null;
  }

  primary(strong: boolean) {
    const h = this.held;
    if (h?.kind === 'btbDropper') {
      const t = this.targetUnder();
      if (t) return void this.photo({ type: 'addIndicator', tubeId: t, drops: strong ? 4 : 1 });
      return void this.hintOnce('b08.hint.dropper');
    }
    super.primary(strong);
  }
}
