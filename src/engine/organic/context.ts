import { createContext, useContext } from 'react';
import type { OrganicLab3D } from './OrganicLab3D';

export const OrganicLabContext = createContext<OrganicLab3D | null>(null);

export function useOrganicLab(): OrganicLab3D {
  const l = useContext(OrganicLabContext);
  if (!l) throw new Error('OrganicLabContext no disponible');
  return l;
}
