import { createContext, useContext } from 'react';
import type { F04Lab3D } from './F04Lab3D';

export const F04LabContext = createContext<F04Lab3D | null>(null);

export function useF04Lab(): F04Lab3D {
  const l = useContext(F04LabContext);
  if (!l) throw new Error('F04LabContext no disponible');
  return l;
}
