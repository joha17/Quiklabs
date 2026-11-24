import type { F12Runtime } from '../../app/f12/runtime';
import type { ReactionSound } from '../reaction/host';

/** Lo que el motor de F12 necesita de la aplicación (inyectado; el motor no conoce React). */
export interface F12Host {
  runtime: F12Runtime;
  t: (key: string, opts?: Record<string, unknown>) => string;
  getSelected(): string | null;
  select(id: string | null): void;
  notify(level: 'info' | 'warn', key: string, params?: Record<string, unknown>): void;
  sound(name: F12Sound): void;
  reducedMotion(): boolean;
  guidedHints(): boolean;
  showNames(): boolean;
  nameTag(id: string): string;
  onHeldChange?(id: string | null): void;
  /** Lente de lectura: instrumento cuya escala se amplía en la interfaz. */
  onLens?(target: F12Lens | null): void;
}

/** Lo que se amplía: el visor del depósito, la regla de cotas, el vaso, el cronómetro, el registrador, el caudalímetro o el calibre. */
export type F12Lens = 'sump01' | 'ruler01' | 'beaker01' | 'timer01' | 'logger01' | 'meter01' | 'caliper01';

/** Los sonidos de F12 son los del sintetizador común. */
export type F12Sound = ReactionSound;
