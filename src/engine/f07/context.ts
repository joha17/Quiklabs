import { createContext, useContext } from 'react';
import type { F07Lab3D } from './F07Lab3D';

export const F07LabContext = createContext<F07Lab3D | null>(null);

export function useF07Lab(): F07Lab3D {
  const l = useContext(F07LabContext);
  if (!l) throw new Error('F07LabContext no disponible');
  return l;
}
