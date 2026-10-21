import type { OpticalRuntime } from '../../app/b01/runtime';
import type { ReactionSound } from '../reaction/host';

/** Lo que el motor de la práctica B01 necesita de la aplicación (inyectado; el motor no conoce React). */
export interface OpticalHost {
  runtime: OpticalRuntime;
  t: (key: string, opts?: Record<string, unknown>) => string;
  getSelected(): string | null;
  select(id: string | null): void;
  notify(level: 'info' | 'warn', key: string, params?: Record<string, unknown>): void;
  sound(name: OpticalSound): void;
  reducedMotion(): boolean;
  guidedHints(): boolean;
  showNames(): boolean;
  nameTag(id: string): string;
  onHeldChange?(id: string | null): void;
  /** Se abrió o cerró un ocular (la app muestra la vista del ocular). */
  onEyepiece?(instrument: 'compound' | 'stereo' | null): void;
}

/** Los sonidos de la práctica B01 son los del sintetizador de la Práctica 4. */
export type OpticalSound = ReactionSound;
