import { createContext, useContext } from 'react';
import type { F06Lab3D } from './F06Lab3D';

export const F06LabContext = createContext<F06Lab3D | null>(null);

export function useF06Lab(): F06Lab3D {
  const l = useContext(F06LabContext);
  if (!l) throw new Error('F06LabContext no disponible');
  return l;
}
