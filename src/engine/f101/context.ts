import { createContext, useContext } from 'react';
import type { F101Lab3D } from './F101Lab3D';

export const F101LabContext = createContext<F101Lab3D | null>(null);

export function useF101Lab(): F101Lab3D {
  const l = useContext(F101LabContext);
  if (!l) throw new Error('F101LabContext no disponible');
  return l;
}
