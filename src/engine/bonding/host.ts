import type { BondingRuntime } from '../../app/p7/runtime';
import type { ReactionSound } from '../reaction/host';

/** Lo que el motor de la Práctica 7 necesita de la aplicación (inyectado; el motor no conoce React). */
export interface BondingHost {
  runtime: BondingRuntime;
  t: (key: string, opts?: Record<string, unknown>) => string;
  getSelected(): string | null;
  select(id: string | null): void;
  notify(level: 'info' | 'warn', key: string, params?: Record<string, unknown>): void;
  sound(name: BondingSound): void;
  reducedMotion(): boolean;
  guidedHints(): boolean;
  showNames(): boolean;
  nameTag(id: string): string;
  onHeldChange?(id: string | null): void;
}

/** Los sonidos de la Práctica 7 son los del sintetizador de la Práctica 4. */
export type BondingSound = ReactionSound;
