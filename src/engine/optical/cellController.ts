/**
 * Controlador de gestos de B02: el de B01 (instrumentos, pinza, gotero, cubreobjetos, papeles) más los gestos de
 * obtención de tejido sobre lo que la herramienta tiene debajo (P / clic; Mayús = gesto brusco):
 * - bisturí sobre un fruto → corte fino (Mayús: grueso); sobre el portaobjetos → choque con el vidrio (lo decide el dominio);
 * - espátula sobre la papa → raspado (Mayús: presión excesiva); sobre un portaobjetos → deposita lo raspado;
 * - pinza sobre la tabla → toma el fragmento cortado;
 * - hisopo sobre la fuente de epitelio → hisopado; sobre el portaobjetos del área animal → extendido (Mayús: corto y apretado);
 * - papel de lente sobre el bisturí o la espátula → los limpia.
 * Los hisopos se sueltan sobre los contenedores de residuos (biológico o común): el dominio decide si es correcto.
 */
import type { B01ObjKind } from '../../simulation/optical-world/types';
import type { CellCommand } from '../../simulation/cell-world/commands';
import type { CellWorld } from '../../simulation/cell-world/types';
import { BIO_WASTE } from '../../simulation/optical-world/geometry';
import { BOARD_POS, CHEEK_POS, GEO_B02, PREP2_SPOT, SWAB_BOX, TRASH_BIN } from '../../simulation/cell-world/geometry';
import { OpticalController } from './controller';
import type { Spot } from './layout';
import type { Pose } from '../../simulation/optical-world/types';

/** Gesto estándar y brusco de cada herramienta (hechos del gesto, no resultados). */
export const CELL_GESTURES = {
  cut: { fine: { thicknessMm: 0.15, lengthCm: 0.8 }, rough: { thicknessMm: 0.8, lengthCm: 0.8 } },
  scrape: { fine: { distanceCm: 1.2, pressure01: 0.4 }, rough: { distanceCm: 1.2, pressure01: 0.95 } },
  swab: { fine: { durationS: 4, pressure01: 0.5 }, rough: { durationS: 4, pressure01: 1 } },
  smear: { fine: { lengthCm: 1.6, pressure01: 0.4 }, rough: { lengthCm: 0.3, pressure01: 1 } },
} as const;

export class CellController extends OpticalController {
  private get cw(): CellWorld {
    return this.w as CellWorld;
  }

  protected run(r: ReturnType<OpticalController['dispatch']> | undefined) {
    if (r && !r.ok && r.code) {
      const k = `b02.cmd.${r.code}`;
      this.host.notify('warn', this.host.t(k) !== k ? k : `b01.cmd.${r.code}`);
      return r;
    }
    return r;
  }

  protected spots(kind: B01ObjKind): Spot[] {
    const out = super.spots(kind);
    if (kind === 'slide') out.push({ id: 'prep2', x: PREP2_SPOT.x, y: PREP2_SPOT.y, z: PREP2_SPOT.z, r: 7 });
    if (kind === 'swab') {
      out.push({ id: 'bioWaste', x: BIO_WASTE.x, y: BIO_WASTE.y, z: 2, r: 6 });
      out.push({ id: 'trashBin', x: TRASH_BIN.x, y: TRASH_BIN.y, z: 2, r: 6 });
      out.push({ id: 'swabBox', x: SWAB_BOX.x, y: SWAB_BOX.y, z: SWAB_BOX.z, r: 4 });
    }
    return out;
  }

  /** La bandeja de limpieza recibe todas las láminas de la práctica: dos columnas por tres filas y luego apiladas. */
  protected sharedSpot(id: string): boolean {
    return id === 'cleanTray';
  }

  protected spotPose(s: Spot, n: number): Pose {
    if (s.id !== 'cleanTray') return super.spotPose(s, n);
    return { x: s.x + (n % 2 ? 4 : -4), y: s.y - 3 + (Math.floor(n / 2) % 3) * 3, z: s.z + Math.floor(n / 6) * 0.15, rotationRad: 0 };
  }

  protected floorAt(x: number, y: number): number {
    let floor = super.floorAt(x, y);
    if (Math.hypot(x - PREP2_SPOT.x, y - PREP2_SPOT.y) < 9) floor = Math.max(floor, PREP2_SPOT.z + 0.3);
    if (Math.hypot(x - BOARD_POS.x, y - BOARD_POS.y) < 7) floor = Math.max(floor, BOARD_POS.z + 0.3);
    return floor;
  }

  targetUnder(): string | null {
    const h = this.held;
    if (!h) return null;
    const w = this.cw;
    const near = (x: number, y: number, r: number) => Math.hypot(h.x - x, h.y - y) <= r;
    const prep2 = Object.values(w.objects).find((o) => o.support === 'prep2');
    if (prep2 && near(prep2.pose.x, prep2.pose.y, 4.2)) return prep2.id;
    if (near(BOARD_POS.x, BOARD_POS.y, GEO_B02.board.w / 2)) return 'board';
    for (const id of Object.keys(w.cell?.sources ?? {})) {
      const o = w.objects[id];
      if (o && near(o.pose.x, o.pose.y, GEO_B02.source.r + 0.6)) return id;
    }
    if (near(CHEEK_POS.x, CHEEK_POS.y, 4)) return 'bucc';
    if (h.kind === 'lensPaper' || h.kind === 'paper') {
      for (const t of ['sc', 'sp']) {
        const o = w.objects[t];
        if (o && o.support === 'bench' && near(o.pose.x, o.pose.y, 3)) return t;
      }
    }
    return super.targetUnder();
  }

  primary(strong: boolean) {
    const h = this.held;
    if (!h) return;
    const w = this.cw;
    const t = this.targetUnder();
    const r = (c: CellCommand) => this.run(this.dispatch(c));
    const g = strong ? 'rough' : 'fine';
    const isSource = !!t && !!w.cell?.sources[t] && t !== 'el' && t !== 'bucc';
    switch (h.kind) {
      case 'scalpel':
        if (isSource) return void r({ type: 'cutSource', sourceId: t!, toolId: 'sc', ...CELL_GESTURES.cut[g] });
        break;
      case 'spatula':
        if (isSource) return void r({ type: 'scrape', sourceId: t!, toolId: 'sp', ...CELL_GESTURES.scrape[g] });
        if (t && w.slides[t] && w.cell.held.sp) {
          const [dx, dy] = this.rel(t);
          return void r({ type: 'placeSpecimen', toolId: 'sp', targetId: t, dxCm: dx, dyCm: dy });
        }
        return void this.hintOnce('b01.hint.nothingToDo');
      case 'swab':
        if (t === 'bucc') return void r({ type: 'swab', swabId: h.id, sourceId: 'bucc', ...CELL_GESTURES.swab[g] });
        if (t && w.slides[t]) {
          const [dx, dy] = this.rel(t);
          return void r({ type: 'smear', swabId: h.id, slideId: t, ...CELL_GESTURES.smear[g], dxCm: dx, dyCm: dy });
        }
        return void this.hintOnce('b02.hint.swab');
      case 'forceps':
        if (!w.forceps.holding && t === 'board') return void r({ type: 'pickSpecimen', toolId: 'fc', sourceId: 'board' });
        if (!w.forceps.holding && isSource) return void r({ type: 'pickSpecimen', toolId: 'fc', sourceId: t! });
        if (w.cell.held.fc && t && w.slides[t]) {
          const [dx, dy] = this.rel(t);
          return void r({ type: 'placeSpecimen', toolId: 'fc', targetId: t, dxCm: dx, dyCm: dy });
        }
        break;
      case 'lensPaper':
      case 'paper':
        if (t === 'sc' || t === 'sp') return void r({ type: 'wipe', targetId: t, toolId: h.kind === 'paper' ? 'pp' : 'lp' });
        break;
    }
    super.primary(strong);
  }
}
