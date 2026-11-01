/**
 * Controlador de gestos de B10: el de B06 (microscopio, pinza, goteros, cubreobjetos, papeles) más traducir sus rechazos a los textos de
 * esta práctica. Rotular, girar modelos y mover la luz de las huellas se hacen en el visor; no hay gestos nuevos sobre la mesada.
 */
import type { AnimalCommand } from '../../simulation/animal-world/commands';
import { DivController } from './divController';

export class AnimalController extends DivController {
  animal(c: AnimalCommand) {
    return this.div(c as never);
  }

  protected run(r: ReturnType<DivController['dispatch']> | undefined) {
    if (r && !r.ok && r.code) {
      const k = `b10.cmd.${r.code}`;
      if (this.host.t(k) !== k) {
        this.host.notify('warn', k);
        return r;
      }
    }
    return super.run(r);
  }
}
