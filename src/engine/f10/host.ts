import type { F10Runtime } from '../../app/f10/runtime';
import type { ReactionSound } from '../reaction/host';

/** Lo que el motor de F10 necesita de la aplicación (inyectado; el motor no conoce React). */
export interface F10Host {
  runtime: F10Runtime;
  t: (key: string, opts?: Record<string, unknown>) => string;
  getSelected(): string | null;
  select(id: string | null): void;
  notify(level: 'info' | 'warn', key: string, params?: Record<string, unknown>): void;
  sound(name: F10Sound): void;
  reducedMotion(): boolean;
  guidedHints(): boolean;
  showNames(): boolean;
  nameTag(id: string): string;
  onHeldChange?(id: string | null): void;
  /** Lente de lectura: instrumento cuya escala se amplía en la interfaz. */
  onLens?(target: F10Lens | null): void;
}

/** Lo que se amplía: la cinta, la escala del dinamómetro, la pantalla de un apoyo, el registrador, el comparador o el calibre. */
export type F10Lens = 'tape01' | 'dyn01' | 'supportA' | 'supportB' | 'logger01' | 'gauge01' | 'caliper01';

/** Los sonidos de F10 son los del sintetizador común. */
export type F10Sound = ReactionSound;
