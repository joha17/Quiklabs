import { createContext, useContext } from 'react';
import type { FlameLab3D } from './FlameLab3D';

export const FlameLabContext = createContext<FlameLab3D | null>(null);

export function useFlameLab(): FlameLab3D {
  const l = useContext(FlameLabContext);
  if (!l) throw new Error('FlameLabContext no disponible');
  return l;
}
