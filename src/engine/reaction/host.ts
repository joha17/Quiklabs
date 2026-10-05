import type { ReactionRuntime } from '../../app/p4/runtime';
import type { FlameSound } from '../flame/host';

/** Lo que el motor de la Práctica 4 necesita de la aplicación (inyectado; el motor no conoce React). */
export interface ReactionHost {
  runtime: ReactionRuntime;
  t: (key: string, opts?: Record<string, unknown>) => string;
  getSelected(): string | null;
  select(id: string | null): void;
  notify(level: 'info' | 'warn', key: string, params?: Record<string, unknown>): void;
  sound(name: ReactionSound): void;
  reducedMotion(): boolean;
  guidedHints(): boolean;
  showNames(): boolean;
  nameTag(id: string): string;
  onHeldChange?(id: string | null): void;
  /** La cinta de Mg se acerca a la llama sin haber aceptado la advertencia: la interfaz la muestra (§13.1). */
  requestMgWarning?(): void;
}

export type ReactionSound =
  | FlameSound | 'pour' | 'drip' | 'fizz' | 'clink' | 'stir' | 'mgBurn' | 'sand' | 'squeeze' | 'break' | 'paper';
