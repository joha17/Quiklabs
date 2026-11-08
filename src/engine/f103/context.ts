import { createContext, useContext } from 'react';
import type { F103Lab3D } from './F103Lab3D';

export const F103LabContext = createContext<F103Lab3D | null>(null);

export function useF103Lab(): F103Lab3D {
  const l = useContext(F103LabContext);
  if (!l) throw new Error('F103LabContext no disponible');
  return l;
}
