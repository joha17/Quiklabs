/**
 * Controlador de gestos de B06: el de B02 (microscopio, pinza, goteros, cubreobjetos, hisopos, papeles) más los
 * gestos propios sobre lo que la herramienta tiene debajo (P / clic; Mayús = gesto brusco):
 * - pinza vacía sobre la maceta de Tradescantia → pela una tira de epidermis (Mayús: tira gruesa, CEL-011);
 * - gotero de cultivo (Paramecium o Euglena) sobre el portaobjetos → una gota de cultivo vivo (como cualquier gotero);
 * - pañuelo sobre el microscopio → lo frota contra la lente (lo decide el dominio: raya, CEL-038);
 * - papel absorbente sobre el microscopio mojado → lo seca.
 * Lo que no es un gesto de mano (fichas, etiqueta, aceite, objetivo, movilidad, marcas y mediciones) se elige en el
 * panel de acciones y en el ocular. Lámina soltada sobre la zona sin desinfectar: el dominio decide (CEL-002).
 */
import type { B01ObjKind } from '../../simulation/optical-world/types';
import type { DivCommand } from '../../simulation/div-world/commands';
import type { DivWorld } from '../../simulation/div-world/types';
import { DIRTY_ZONE, GEO_B06, POT_POS } from '../../simulation/div-world/geometry';
import { CellController } from './cellController';
import type { Spot } from './layout';

/** Tira de epidermis: fina (0,12 mm) o gruesa con Mayús. */
export const PEEL_GESTURES = { fine: { thicknessMm: 0.12, lengthCm: 0.8 }, rough: { thicknessMm: 0.9, lengthCm: 0.8 } } as const;

export class DivController extends CellController {
  private get dw(): DivWorld {
    return this.w as DivWorld;
  }

  protected run(r: ReturnType<CellController['dispatch']> | undefined) {
    if (r && !r.ok && r.code) {
      const k = `b06.cmd.${r.code}`;
      if (this.host.t(k) !== k) {
        this.host.notify('warn', k);
        return r;
      }
    }
    return super.run(r);
  }

  div(c: DivCommand) {
    // El controlador base tipa los comandos de B01–B03; el mundo de diversidad acepta además los suyos.
    return this.run(this.dispatch(c as never));
  }

  protected spots(kind: B01ObjKind): Spot[] {
    const out = super.spots(kind);
    if (kind === 'slide' || kind === 'fixedSlide') out.push({ id: 'dirtyZone', x: DIRTY_ZONE.x, y: DIRTY_ZONE.y, z: 0.05, r: GEO_B06.zone.w / 2 });
    return out;
  }

  targetUnder(): string | null {
    const h = this.held;
    if (!h) return null;
    const near = (x: number, y: number, r: number) => Math.hypot(h.x - x, h.y - y) <= r;
    if (h.kind === 'forceps' && near(POT_POS.x, POT_POS.y, GEO_B06.pot.r + 1)) return 'tra';
    return super.targetUnder();
  }

  primary(strong: boolean) {
    const h = this.held;
    if (!h) return;
    const w = this.dw;
    const t = this.targetUnder();
    const g = strong ? 'rough' : 'fine';
    if (h.kind === 'forceps' && t === 'tra' && !w.forceps.holding) {
      return void this.div({ type: 'peelEpidermis', sourceId: 'tra', toolId: 'fc', ...PEEL_GESTURES[g] });
    }
    if (h.kind === 'tissue') {
      if (t === 'mic') return void this.div({ type: 'wipe', targetId: 'mic:lens', toolId: 'tw' });
      return void this.hintOnce('b01.hint.nothingToDo');
    }
    if (h.kind === 'paper' && t === 'mic' && w.div.micWet) {
      return void this.div({ type: 'wipe', targetId: 'mic', toolId: 'pp' });
    }
    super.primary(strong);
  }
}
