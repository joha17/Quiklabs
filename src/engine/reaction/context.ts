import { createContext, useContext } from 'react';
import type { ReactionLab3D } from './ReactionLab3D';

export const ReactionLabContext = createContext<ReactionLab3D | null>(null);

export function useReactionLab(): ReactionLab3D {
  const l = useContext(ReactionLabContext);
  if (!l) throw new Error('ReactionLabContext no disponible');
  return l;
}
