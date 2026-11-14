import type { F07Runtime } from '../../app/f07/runtime';
import type { ReactionSound } from '../reaction/host';

/** Lo que el motor de F07 necesita de la aplicación (inyectado; el motor no conoce React). */
export interface F07Host {
  runtime: F07Runtime;
  t: (key: string, opts?: Record<string, unknown>) => string;
  getSelected(): string | null;
  select(id: string | null): void;
  notify(level: 'info' | 'warn', key: string, params?: Record<string, unknown>): void;
  sound(name: F07Sound): void;
  reducedMotion(): boolean;
  guidedHints(): boolean;
  showNames(): boolean;
  nameTag(id: string): string;
  onHeldChange?(id: string | null): void;
  /** Lente de lectura: instrumento cuya escala se amplía en la interfaz. */
  onLens?(target: F07Lens | null): void;
}

/** Lo que se amplía: la regla del soporte, el medidor de altura, la escala del péndulo, la balanza, la gráfica del registrador (F–x y P(t)) o la pantalla del péndulo. */
export type F07Lens = 'level01' | 'ruler01' | 'balance01' | 'caliper01' | 'logger01' | 'camera01';

/** Los sonidos de F07 son los del sintetizador común. */
export type F07Sound = ReactionSound;
