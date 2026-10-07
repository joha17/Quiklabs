import { createContext, useContext } from 'react';
import type { GasLab3D } from './GasLab3D';

export const GasLabContext = createContext<GasLab3D | null>(null);

export function useGasLab(): GasLab3D {
  const l = useContext(GasLabContext);
  if (!l) throw new Error('GasLabContext no disponible');
  return l;
}
