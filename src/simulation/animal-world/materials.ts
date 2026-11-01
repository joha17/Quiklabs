/** Materiales de la etapa 1 (§5): qué es cada uno y con qué se observa. La clasificación del estudiante se contrasta con esto. */
import type { MaterialClass, MaterialInstrument } from './types';

export const MATERIALS: Record<string, { materialClass: MaterialClass; instrument: MaterialInstrument; tissue?: boolean }> = {
  matMuscle: { materialClass: 'slide', instrument: 'microscope', tissue: true },
  matPlanaria: { materialClass: 'slide', instrument: 'microscope' },
  matDaphnia: { materialClass: 'specimen', instrument: 'stereo' },
  matLouse: { materialClass: 'specimen', instrument: 'stereo' },
  matScorpion: { materialClass: 'model', instrument: 'viewer' },
  matSkull: { materialClass: 'model', instrument: 'viewer' },
  matTrack: { materialClass: 'track', instrument: 'viewer' },
  matBird: { materialClass: 'model', instrument: 'viewer' },
};
