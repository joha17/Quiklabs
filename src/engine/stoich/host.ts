import type { StoichRuntime } from '../../app/p5/runtime';
import type { ReactionSound } from '../reaction/host';

/** Lo que el motor de la Práctica 5 necesita de la aplicación (inyectado; el motor no conoce React). */
export interface StoichHost {
  runtime: StoichRuntime;
  t: (key: string, opts?: Record<string, unknown>) => string;
  getSelected(): string | null;
  select(id: string | null): void;
  notify(level: 'info' | 'warn', key: string, params?: Record<string, unknown>): void;
  sound(name: StoichSound): void;
  reducedMotion(): boolean;
  guidedHints(): boolean;
  showNames(): boolean;
  nameTag(id: string): string;
  onHeldChange?(id: string | null): void;
  /** Lectura del termómetro IR (para la interfaz). */
  onIR?(tempC: number): void;
}

/** Los sonidos de la Práctica 5 son un subconjunto de los de la Práctica 4 (mismo sintetizador). */
export type StoichSound = ReactionSound;
