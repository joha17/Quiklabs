import { createContext, useContext } from 'react';
import type { F11Lab3D } from './F11Lab3D';

export const F11LabContext = createContext<F11Lab3D | null>(null);

export function useF11Lab(): F11Lab3D {
  const l = useContext(F11LabContext);
  if (!l) throw new Error('F11LabContext no disponible');
  return l;
}
