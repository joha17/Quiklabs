import type { OrganicRuntime } from '../../app/p8/runtime';
import type { ReactionSound } from '../reaction/host';

/** Lo que el motor de la Práctica 8 necesita de la aplicación (inyectado; el motor no conoce React). */
export interface OrganicHost {
  runtime: OrganicRuntime;
  t: (key: string, opts?: Record<string, unknown>) => string;
  getSelected(): string | null;
  select(id: string | null): void;
  notify(level: 'info' | 'warn', key: string, params?: Record<string, unknown>): void;
  sound(name: OrganicSound): void;
  reducedMotion(): boolean;
  guidedHints(): boolean;
  showNames(): boolean;
  nameTag(id: string): string;
  onHeldChange?(id: string | null): void;
}

/** Los sonidos de la Práctica 8 son los del sintetizador de la Práctica 4. */
export type OrganicSound = ReactionSound;
