import { createContext, useContext } from 'react';
import type { F08Lab3D } from './F08Lab3D';

export const F08LabContext = createContext<F08Lab3D | null>(null);

export function useF08Lab(): F08Lab3D {
  const l = useContext(F08LabContext);
  if (!l) throw new Error('F08LabContext no disponible');
  return l;
}
