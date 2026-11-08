import type { F103Runtime } from '../../app/f103/runtime';
import type { ReactionSound } from '../reaction/host';

/** Lo que el motor de F103 necesita de la aplicación (inyectado; el motor no conoce React). */
export interface F103Host {
  runtime: F103Runtime;
  t: (key: string, opts?: Record<string, unknown>) => string;
  getSelected(): string | null;
  select(id: string | null): void;
  notify(level: 'info' | 'warn', key: string, params?: Record<string, unknown>): void;
  sound(name: F103Sound): void;
  reducedMotion(): boolean;
  guidedHints(): boolean;
  showNames(): boolean;
  nameTag(id: string): string;
  onHeldChange?(id: string | null): void;
  /** Lente de lectura: instrumento cuya escala se amplía en la interfaz. */
  onLens?(target: F103Lens | null): void;
}

export type F103Lens = 'launcher01' | 'stand01' | 'heightRuler01' | 'floorTape01' | 'screen01' | 'timer01' | 'platform01';

/** Los sonidos de F103 son los del sintetizador común. */
export type F103Sound = ReactionSound;
