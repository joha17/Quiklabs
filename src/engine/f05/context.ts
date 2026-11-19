import { createContext, useContext } from 'react';
import type { F05Lab3D } from './F05Lab3D';

export const F05LabContext = createContext<F05Lab3D | null>(null);

export function useF05Lab(): F05Lab3D {
  const l = useContext(F05LabContext);
  if (!l) throw new Error('F05LabContext no disponible');
  return l;
}
