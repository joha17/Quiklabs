import { createContext, useContext } from 'react';
import type { F09Lab3D } from './F09Lab3D';

export const F09LabContext = createContext<F09Lab3D | null>(null);

export function useF09Lab(): F09Lab3D {
  const l = useContext(F09LabContext);
  if (!l) throw new Error('F09LabContext no disponible');
  return l;
}
