import type { F06Runtime } from '../../app/f06/runtime';
import type { ReactionSound } from '../reaction/host';

/** Lo que el motor de F06 necesita de la aplicación (inyectado; el motor no conoce React). */
export interface F06Host {
  runtime: F06Runtime;
  t: (key: string, opts?: Record<string, unknown>) => string;
  getSelected(): string | null;
  select(id: string | null): void;
  notify(level: 'info' | 'warn', key: string, params?: Record<string, unknown>): void;
  sound(name: F06Sound): void;
  reducedMotion(): boolean;
  guidedHints(): boolean;
  showNames(): boolean;
  nameTag(id: string): string;
  onHeldChange?(id: string | null): void;
  /** Lente de lectura: instrumento cuya escala se amplía en la interfaz. */
  onLens?(target: F06Lens | null): void;
}

/** Lo que se amplía: la regla del soporte, el medidor de altura, la escala del péndulo, la balanza, la gráfica del registrador (F–x y P(t)) o la pantalla del péndulo. */
export type F06Lens = 'ruler01' | 'gauge01' | 'pendScale' | 'balance01' | 'logger01' | 'angle01';

/** Los sonidos de F06 son los del sintetizador común. */
export type F06Sound = ReactionSound;
