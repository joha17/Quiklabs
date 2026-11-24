import { createContext, useContext } from 'react';
import type { F12Lab3D } from './F12Lab3D';

export const F12LabContext = createContext<F12Lab3D | null>(null);

export function useF12Lab(): F12Lab3D {
  const l = useContext(F12LabContext);
  if (!l) throw new Error('F12LabContext no disponible');
  return l;
}
