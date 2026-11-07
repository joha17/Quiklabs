import type { F101Runtime } from '../../app/f101/runtime';
import type { ReactionSound } from '../reaction/host';

/** Lo que el motor de F101 necesita de la aplicación (inyectado; el motor no conoce React). */
export interface F101Host {
  runtime: F101Runtime;
  t: (key: string, opts?: Record<string, unknown>) => string;
  getSelected(): string | null;
  select(id: string | null): void;
  notify(level: 'info' | 'warn', key: string, params?: Record<string, unknown>): void;
  sound(name: F101Sound): void;
  reducedMotion(): boolean;
  guidedHints(): boolean;
  showNames(): boolean;
  nameTag(id: string): string;
  onHeldChange?(id: string | null): void;
  /** Lente de lectura: instrumento cuya escala se amplía en la interfaz. */
  onLens?(target: F101Lens | null): void;
}

export type F101Lens = 'caliper01' | 'micrometer01' | 'gradCyl01' | 'dynamometer01' | 'forceTable01' | 'ruler01';

/** Los sonidos de F101 son los del sintetizador común. */
export type F101Sound = ReactionSound;
