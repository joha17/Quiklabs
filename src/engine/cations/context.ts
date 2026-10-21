import { createContext, useContext } from 'react';
import type { CationLab3D } from './CationLab3D';

export const CationLabContext = createContext<CationLab3D | null>(null);

export function useCationLab(): CationLab3D {
  const l = useContext(CationLabContext);
  if (!l) throw new Error('CationLabContext no disponible');
  return l;
}
