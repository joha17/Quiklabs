/** La simulación del mundo de microbiología (B08) para el runtime compartido con B01 (sin React: la usan la app y los tests). */
import type { OpticalSim } from '../b01/runtime';
import type { PhotoWorld } from '../../simulation/photo-world/types';
import type { PhotoCommand } from '../../simulation/photo-world/commands';
import { dispatchPhoto, photoSummary, stepPhotoWorld } from '../../simulation/photo-world/world';

export const PHOTO_SIM: OpticalSim = {
  dispatch: (w, c) => dispatchPhoto(w as PhotoWorld, c as PhotoCommand),
  step: (w) => stepPhotoWorld(w as PhotoWorld),
  summary: (w) => photoSummary(w as PhotoWorld),
};
