import { createContext, useContext } from 'react';
import type { F10Lab3D } from './F10Lab3D';

export const F10LabContext = createContext<F10Lab3D | null>(null);

export function useF10Lab(): F10Lab3D {
  const l = useContext(F10LabContext);
  if (!l) throw new Error('F10LabContext no disponible');
  return l;
}
