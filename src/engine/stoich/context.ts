import { createContext, useContext } from 'react';
import type { StoichLab3D } from './StoichLab3D';

export const StoichLabContext = createContext<StoichLab3D | null>(null);

export function useStoichLab(): StoichLab3D {
  const l = useContext(StoichLabContext);
  if (!l) throw new Error('StoichLabContext no disponible');
  return l;
}
