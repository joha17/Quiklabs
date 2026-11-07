import { createContext, useContext } from 'react';
import type { F102Lab3D } from './F102Lab3D';

export const F102LabContext = createContext<F102Lab3D | null>(null);

export function useF102Lab(): F102Lab3D {
  const l = useContext(F102LabContext);
  if (!l) throw new Error('F102LabContext no disponible');
  return l;
}
