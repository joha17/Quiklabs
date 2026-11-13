import type { F05Runtime } from '../../app/f05/runtime';
import type { ReactionSound } from '../reaction/host';

/** Lo que el motor de F05 necesita de la aplicación (inyectado; el motor no conoce React). */
export interface F05Host {
  runtime: F05Runtime;
  t: (key: string, opts?: Record<string, unknown>) => string;
  getSelected(): string | null;
  select(id: string | null): void;
  notify(level: 'info' | 'warn', key: string, params?: Record<string, unknown>): void;
  sound(name: F05Sound): void;
  reducedMotion(): boolean;
  guidedHints(): boolean;
  showNames(): boolean;
  nameTag(id: string): string;
  onHeldChange?(id: string | null): void;
  /** Lente de lectura: instrumento cuya escala se amplía en la interfaz. */
  onLens?(target: F05Lens | null): void;
}

/** Lo que se amplía: la escala del tablero en una compuerta, el goniómetro, la escala del soporte, la balanza, el termómetro o la gráfica del registrador. */
export type F05Lens = 'gate1' | 'gate2' | 'gonio01' | 'elevator01' | 'balance01' | 'thermo01' | 'logger01';

/** Los sonidos de F05 son los del sintetizador común. */
export type F05Sound = ReactionSound;
