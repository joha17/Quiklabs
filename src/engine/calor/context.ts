import { createContext, useContext } from 'react';
import type { CalorLab3D } from './CalorLab3D';

export const CalorLabContext = createContext<CalorLab3D | null>(null);

export function useCalorLab(): CalorLab3D {
  const l = useContext(CalorLabContext);
  if (!l) throw new Error('CalorLabContext no disponible');
  return l;
}
