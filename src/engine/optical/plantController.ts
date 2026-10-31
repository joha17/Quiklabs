/**
 * Controlador de gestos de B09: el de B06 (microscopio, pinza, goteros, cubreobjetos, papeles) más la mano sobre el tejido
 * (P / clic; Mayús = gesto brusco): pinza vacía sobre la fuente → la sujeta o la suelta; bisturí sobre la fuente → corte
 * transversal fino o, con Mayús, grueso y aplastado. El plano, el grosor y la región exactos se eligen en la mesa de trabajo.
 * Rotular, girar plántulas, lavar, marcar y medir se hacen en los paneles.
 */
import type { PlantCommand } from '../../simulation/plant-world/commands';
import type { PlantWorld } from '../../simulation/plant-world/types';
import { SOURCE_REGION } from '../../simulation/plant-world/model';
import { DivController } from './divController';

export const CUT_GESTURES = { fine: { thicknessUm: 80, pressure01: 0.3 }, rough: { thicknessUm: 400, pressure01: 0.85 } } as const;

export class PlantController extends DivController {
  private get pw(): PlantWorld {
    return this.w as PlantWorld;
  }

  plant(c: PlantCommand) {
    return this.div(c as never);
  }

  protected run(r: ReturnType<DivController['dispatch']> | undefined) {
    if (r && !r.ok && r.code) {
      const k = `b09.cmd.${r.code}`;
      if (this.host.t(k) !== k) {
        this.host.notify('warn', k);
        return r;
      }
    }
    return super.run(r);
  }

  primary(strong: boolean) {
    const h = this.held;
    if (!h) return;
    const w = this.pw;
    const t = this.targetUnder();
    if (t && SOURCE_REGION[t]) {
      if (h.kind === 'scalpel') {
        return void this.plant({ type: 'cutSection', sourceId: t, plane: 'transverse', lengthCm: 0.8, region: SOURCE_REGION[t].region, ...CUT_GESTURES[strong ? 'rough' : 'fine'] });
      }
      if (h.kind === 'forceps' && !w.forceps.holding) {
        return void this.plant({ type: 'holdSource', sourceId: t, hold: w.plant.holding !== t });
      }
    }
    super.primary(strong);
  }
}
