import type { F11Runtime } from '../../app/f11/runtime';
import type { ReactionSound } from '../reaction/host';

/** Lo que el motor de F11 necesita de la aplicación (inyectado; el motor no conoce React). */
export interface F11Host {
  runtime: F11Runtime;
  t: (key: string, opts?: Record<string, unknown>) => string;
  getSelected(): string | null;
  select(id: string | null): void;
  notify(level: 'info' | 'warn', key: string, params?: Record<string, unknown>): void;
  sound(name: F11Sound): void;
  reducedMotion(): boolean;
  guidedHints(): boolean;
  showNames(): boolean;
  nameTag(id: string): string;
  onHeldChange?(id: string | null): void;
  /** Lente de lectura: instrumento cuya escala se amplía en la interfaz. */
  onLens?(target: F11Lens | null): void;
}

/** Lo que se amplía: la escala de nivel, la guía de inmersión, el calado, el dinamómetro, el soporte, la probeta, la balanza o el registrador. */
export type F11Lens = 'scale01' | 'ruler01' | 'draft' | 'dyn01' | 'stand01' | 'cyl01' | 'balance01' | 'logger01';

/** Los sonidos de F11 son los del sintetizador común. */
export type F11Sound = ReactionSound;
