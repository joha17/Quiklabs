import type { FlameRuntime } from '../../app/p3/runtime';

/** Lo que el motor de la Práctica 3 necesita de la aplicación (inyectado; el motor no conoce React). */
export interface FlameHost {
  runtime: FlameRuntime;
  t: (key: string, opts?: Record<string, unknown>) => string;
  getSelected(): string | null;
  select(id: string | null): void;
  notify(level: 'info' | 'warn', key: string, params?: Record<string, unknown>): void;
  sound(name: FlameSound): void;
  reducedMotion(): boolean;
  guidedHints(): boolean;
  showNames(): boolean;
  nameTag(id: string): string;
  onHeldChange?(id: string | null): void;
  /** Modo de identificación de partes: etiqueta elegida en la interfaz (o null). */
  pendingPartLabel(): string | null;
  onPartClicked?(part: string): void;
}

export type FlameSound =
  | 'spark' | 'ignite' | 'click' | 'sizzle' | 'metal' | 'porcelain' | 'glass' | 'alert' | 'spray' | 'hiss' | 'flashback';
