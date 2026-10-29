/** La simulación del mundo de diversidad celular (B06) para el runtime compartido con B01 (sin React: la usan la app y los tests). */
import type { OpticalSim } from '../b01/runtime';
import type { DivWorld } from '../../simulation/div-world/types';
import type { DivCommand } from '../../simulation/div-world/commands';
import { dispatchDiv, divSummary, stepDivWorld } from '../../simulation/div-world/world';

export const DIV_SIM: OpticalSim = {
  dispatch: (w, c) => dispatchDiv(w as DivWorld, c as DivCommand),
  step: (w) => stepDivWorld(w as DivWorld),
  summary: (w) => divSummary(w as DivWorld),
};
