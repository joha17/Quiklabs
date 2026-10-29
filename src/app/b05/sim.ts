/** La simulación del mundo enzimático (B05) para el runtime compartido con B01/B02 (sin React: la usan la app y los tests). */
import type { OpticalSim } from '../b01/runtime';
import type { EnzWorld } from '../../simulation/enz-world/types';
import type { EnzCommand } from '../../simulation/enz-world/commands';
import { UNLOGGED_ENZ_COMMANDS } from '../../simulation/enz-world/commands';
import { dispatchEnz, enzSummary, stepEnzWorld } from '../../simulation/enz-world/world';

export const ENZ_SIM: OpticalSim = {
  dispatch: (w, c) => dispatchEnz(w as EnzWorld, c as EnzCommand),
  step: (w) => stepEnzWorld(w as EnzWorld),
  summary: (w) => enzSummary(w as EnzWorld),
  unlogged: UNLOGGED_ENZ_COMMANDS as Set<string>,
};
