import { createContext, useContext } from 'react';
import type { BondingLab3D } from './BondingLab3D';

export const BondingLabContext = createContext<BondingLab3D | null>(null);

export function useBondingLab(): BondingLab3D {
  const l = useContext(BondingLabContext);
  if (!l) throw new Error('BondingLabContext no disponible');
  return l;
}
