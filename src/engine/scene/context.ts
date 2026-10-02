import { createContext, useContext } from 'react';
import type { Lab3D } from '../Lab3D';

export const LabContext = createContext<Lab3D | null>(null);

export function useLab3D(): Lab3D {
  const l = useContext(LabContext);
  if (!l) throw new Error('LabContext no disponible');
  return l;
}
