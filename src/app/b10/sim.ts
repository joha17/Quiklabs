/** La simulación del mundo de tejidos animales y anatomía comparada (B10) para el runtime compartido con B01 (sin React: la usan la app y los tests). */
import type { OpticalSim } from '../b01/runtime';
import type { AnimalWorld } from '../../simulation/animal-world/types';
import type { AnimalCommand } from '../../simulation/animal-world/commands';
import { dispatchAnimal, animalSummary, stepAnimalWorld } from '../../simulation/animal-world/world';

export const ANIMAL_SIM: OpticalSim = {
  dispatch: (w, c) => dispatchAnimal(w as AnimalWorld, c as AnimalCommand),
  step: (w) => stepAnimalWorld(w as AnimalWorld),
  summary: (w) => animalSummary(w as AnimalWorld),
};
