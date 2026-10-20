import { createContext, useContext } from 'react';
import type { DensityLab3D } from './DensityLab3D';

export const DensityLabContext = createContext<DensityLab3D | null>(null);

export function useDensityLab(): DensityLab3D {
  const l = useContext(DensityLabContext);
  if (!l) throw new Error('DensityLabContext no disponible');
  return l;
}
