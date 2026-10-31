/** La simulación del mundo de arquitectura vegetal (B09) para el runtime compartido con B01 (sin React: la usan la app y los tests). */
import type { OpticalSim } from '../b01/runtime';
import type { PlantWorld } from '../../simulation/plant-world/types';
import type { PlantCommand } from '../../simulation/plant-world/commands';
import { dispatchPlant, plantSummary, stepPlantWorld } from '../../simulation/plant-world/world';

export const PLANT_SIM: OpticalSim = {
  dispatch: (w, c) => dispatchPlant(w as PlantWorld, c as PlantCommand),
  step: (w) => stepPlantWorld(w as PlantWorld),
  summary: (w) => plantSummary(w as PlantWorld),
};
