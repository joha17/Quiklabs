/** La simulación del mundo bioquímico (B04) para el runtime compartido con B01–B03 (sin React: la usan la app y los tests). */
import type { OpticalSim } from '../b01/runtime';
import type { BioWorld } from '../../simulation/bio-world/types';
import type { BioCommand } from '../../simulation/bio-world/commands';
import { UNLOGGED_BIO_COMMANDS } from '../../simulation/bio-world/commands';
import { dispatchBio, bioSummary, stepBioWorld } from '../../simulation/bio-world/world';

export const BIO_SIM: OpticalSim = {
  dispatch: (w, c) => dispatchBio(w as BioWorld, c as BioCommand),
  step: (w) => stepBioWorld(w as BioWorld),
  summary: (w) => bioSummary(w as BioWorld),
  unlogged: UNLOGGED_BIO_COMMANDS as Set<string>,
};
