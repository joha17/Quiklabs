import type { F09Runtime } from '../../app/f09/runtime';
import type { ReactionSound } from '../reaction/host';

/** Lo que el motor de F09 necesita de la aplicación (inyectado; el motor no conoce React). */
export interface F09Host {
  runtime: F09Runtime;
  t: (key: string, opts?: Record<string, unknown>) => string;
  getSelected(): string | null;
  select(id: string | null): void;
  notify(level: 'info' | 'warn', key: string, params?: Record<string, unknown>): void;
  sound(name: F09Sound): void;
  reducedMotion(): boolean;
  guidedHints(): boolean;
  showNames(): boolean;
  nameTag(id: string): string;
  onHeldChange?(id: string | null): void;
  /** Lente de lectura: instrumento cuya escala se amplía en la interfaz. */
  onLens?(target: F09Lens | null): void;
}

/** Lo que se amplía: la regla radial, la escala del dinamómetro, la balanza, la pantalla del motor o la gráfica ω(t) del registrador. */
export type F09Lens = 'ruler01' | 'dyn01' | 'balance01' | 'motor01' | 'logger01';

/** Los sonidos de F09 son los del sintetizador común. */
export type F09Sound = ReactionSound;
