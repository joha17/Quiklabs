import type { F04Runtime } from '../../app/f04/runtime';
import type { ReactionSound } from '../reaction/host';

/** Lo que el motor de F04 necesita de la aplicación (inyectado; el motor no conoce React). */
export interface F04Host {
  runtime: F04Runtime;
  t: (key: string, opts?: Record<string, unknown>) => string;
  getSelected(): string | null;
  select(id: string | null): void;
  notify(level: 'info' | 'warn', key: string, params?: Record<string, unknown>): void;
  sound(name: F04Sound): void;
  reducedMotion(): boolean;
  guidedHints(): boolean;
  showNames(): boolean;
  nameTag(id: string): string;
  onHeldChange?(id: string | null): void;
  /** Lente de lectura: instrumento cuya escala se amplía en la interfaz. */
  onLens?(target: F04Lens | null): void;
}

export type F04Lens = 'launcher01' | 'stand01' | 'heightRuler01' | 'floorTape01' | 'screen01' | 'timer01' | 'platform01';

/** Los sonidos de F04 son los del sintetizador común. */
export type F04Sound = ReactionSound;
