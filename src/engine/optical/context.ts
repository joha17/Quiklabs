import { createContext, useContext } from 'react';
import type { OpticalLab3D } from './OpticalLab3D';

export const OpticalLabContext = createContext<OpticalLab3D | null>(null);

export function useOpticalLab(): OpticalLab3D {
  const l = useContext(OpticalLabContext);
  if (!l) throw new Error('OpticalLabContext no disponible');
  return l;
}
