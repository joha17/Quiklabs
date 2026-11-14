import type { F08Runtime } from '../../app/f08/runtime';
import type { ReactionSound } from '../reaction/host';

/** Lo que el motor de F08 necesita de la aplicación (inyectado; el motor no conoce React). */
export interface F08Host {
  runtime: F08Runtime;
  t: (key: string, opts?: Record<string, unknown>) => string;
  getSelected(): string | null;
  select(id: string | null): void;
  notify(level: 'info' | 'warn', key: string, params?: Record<string, unknown>): void;
  sound(name: F08Sound): void;
  reducedMotion(): boolean;
  guidedHints(): boolean;
  showNames(): boolean;
  nameTag(id: string): string;
  onHeldChange?(id: string | null): void;
  /** Lente de lectura: instrumento cuya escala se amplía en la interfaz. */
  onLens?(target: F08Lens | null): void;
}

/** Lo que se amplía: el transportador de la base, la regla radial de la barra, la balanza, el calibre o las gráficas θ(t) y ω(t) del registrador. */
export type F08Lens = 'base01' | 'ruler01' | 'balance01' | 'caliper01' | 'logger01';

/** Los sonidos de F08 son los del sintetizador común. */
export type F08Sound = ReactionSound;
