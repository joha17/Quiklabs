/**
 * Controlador de gestos de B07: el de B06 (microscopio, papeles, caja) más lo propio, siempre como hecho sobre lo que la
 * herramienta tiene debajo (P / clic; Mayús = gesto brusco):
 * - asa sobre el visor → toma material de la colonia elegida; sobre el área de frotis → extiende (Mayús: frotis espeso);
 * - frasco de tinción sobre la lámina → aplica la fase (decolorante con Mayús: índice excesivo);
 * - frasco de lavado sobre la lámina → lava.
 * Las placas se llevan a mano al visor y a la bandeja; las láminas al área de frotis, a la rejilla y a la platina. Los choques
 * y límites de la mesada son los comunes (`OpticalController`); las medidas y los trazos se hacen en sus paneles.
 */
import type { B01ObjKind, Pose } from '../../simulation/optical-world/types';
import type { MicroCommand } from '../../simulation/micro-world/commands';
import type { MicroWorld, StainPhase } from '../../simulation/micro-world/types';
import { PLATE_TRAY, SMEAR_PAD, STAIN_RACK, VIEWER, trayPos } from '../../simulation/micro-world/geometry';
import { DivController } from './divController';
import type { Spot } from './layout';

/** Gestos del asa y del decolorante (hechos, no resultados). */
export const SMEAR_GESTURES = { fine: 0.35, rough: 0.85 } as const;
export const DECOLOR_GESTURES = { fine: 1, rough: 2 } as const;
const BOTTLE_PHASE: Record<string, StainPhase> = { stP: 'primary', stM: 'mordant', stD: 'decolorizer', stC: 'counterstain' };

export class MicroController extends DivController {
  private get mw(): MicroWorld {
    return this.w as MicroWorld;
  }

  micro(c: MicroCommand) {
    return this.run(this.dispatch(c as never));
  }

  protected spots(kind: B01ObjKind): Spot[] {
    const out = super.spots(kind).filter((s) => s.id !== 'prep' && s.id !== 'prep2' && s.id !== 'dirtyZone');
    if (kind === 'slide') {
      out.push({ id: 'smearPad', x: SMEAR_PAD.x, y: SMEAR_PAD.y, z: SMEAR_PAD.z, r: 6 });
      out.push({ id: 'rack', x: STAIN_RACK.x, y: STAIN_RACK.y, z: STAIN_RACK.z, r: 6 });
    }
    if (kind === 'petriPlate') {
      out.push({ id: 'viewer', x: VIEWER.x, y: VIEWER.y, z: VIEWER.z, r: 8 });
      out.push({ id: 'plateTray', x: PLATE_TRAY.x, y: PLATE_TRAY.y, z: PLATE_TRAY.z, r: 12 });
    }
    return out;
  }

  protected sharedSpot(id: string): boolean {
    return id === 'plateTray' || super.sharedSpot(id);
  }

  protected spotPose(s: Spot, n: number): Pose {
    if (s.id !== 'plateTray') return super.spotPose(s, n);
    // Cada placa vuelve a su lugar: así dos placas nunca se montan en la bandeja.
    const own = Object.keys(this.mw.micro.plates).indexOf(this.docking ?? '');
    const p = trayPos(own >= 0 ? own : n);
    return { x: p.x, y: p.y, z: p.z, rotationRad: 0 };
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
    if (!h) return null;
    const near = (x: number, y: number, r: number) => Math.hypot(h.x - x, h.y - y) <= r;
    const w = this.mw;
    if (h.kind === 'transferLoop' && near(VIEWER.x, VIEWER.y, 9)) return 'viewer';
    const on = (support: string) => Object.values(w.objects).find((o) => o.support === support && w.slides[o.id])?.id ?? null;
    if ((h.kind === 'transferLoop' || h.kind === 'stainBottle') && near(SMEAR_PAD.x, SMEAR_PAD.y, 7) && on('smearPad')) return on('smearPad');
    if (h.kind === 'stainBottle' && near(STAIN_RACK.x, STAIN_RACK.y, 8) && on('rack')) return on('rack');
    return super.targetUnder();
  }

  primary(strong: boolean) {
    const h = this.held;
    if (!h) return;
    const w = this.mw;
    const t = this.targetUnder();
    const g = strong ? 'rough' : 'fine';
    if (h.kind === 'transferLoop') {
      if (t === 'viewer') {
        const plate = w.micro.selectedPlate;
        const col = this.selectedColony;
        if (plate && col) return void this.micro({ type: 'pickColony', plateId: plate, colonyId: col });
        return void this.hintOnce('b07.hint.pickColony');
      }
      if (t && w.slides[t] && w.micro.loop) return void this.micro({ type: 'prepareVirtualSmear', slideId: t, declaredPlateId: w.micro.loop.plateId, coverage01: SMEAR_GESTURES[g] });
      return void this.hintOnce('b07.hint.loop');
    }
    if (h.kind === 'stainBottle') {
      if (!t || !w.slides[t]) return void this.hintOnce('b07.hint.stainOnRack');
      if (h.id === 'stW') return void this.micro({ type: 'rinseVirtualSlide', slideId: t });
      const phase = BOTTLE_PHASE[h.id];
      return void this.micro({ type: 'applyStainPhase', slideId: t, phase, index: phase === 'decolorizer' ? DECOLOR_GESTURES[g] : undefined });
    }
    super.primary(strong);
  }

  /** Colonia elegida en el panel del visor (no pertenece al mundo hasta tomar material o registrarla). */
  selectedColony: string | null = null;
}
