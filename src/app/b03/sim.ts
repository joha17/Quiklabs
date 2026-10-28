/** La simulación del mundo de transporte (B03) para el runtime compartido con B01/B02 (sin React: la usan la app y los tests). */
import type { OpticalSim } from '../b01/runtime';
import type { PermWorld } from '../../simulation/perm-world/types';
import type { PermCommand } from '../../simulation/perm-world/commands';
import { UNLOGGED_PERM_COMMANDS } from '../../simulation/perm-world/commands';
import { dispatchPerm, permSummary, stepPermWorld } from '../../simulation/perm-world/world';

export const PERM_SIM: OpticalSim = {
  dispatch: (w, c) => dispatchPerm(w as PermWorld, c as PermCommand),
  step: (w) => stepPermWorld(w as PermWorld),
  summary: (w) => permSummary(w as PermWorld),
  unlogged: UNLOGGED_PERM_COMMANDS as Set<string>,
};
