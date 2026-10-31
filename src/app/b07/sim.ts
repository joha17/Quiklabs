/** La simulación del mundo de microbiología (B07) para el runtime compartido con B01 (sin React: la usan la app y los tests). */
import type { OpticalSim } from '../b01/runtime';
import type { MicroWorld } from '../../simulation/micro-world/types';
import type { MicroCommand } from '../../simulation/micro-world/commands';
import { dispatchMicro, microSummary, stepMicroWorld } from '../../simulation/micro-world/world';

export const MICRO_SIM: OpticalSim = {
  dispatch: (w, c) => dispatchMicro(w as MicroWorld, c as MicroCommand),
  step: (w) => stepMicroWorld(w as MicroWorld),
  summary: (w) => microSummary(w as MicroWorld),
};
