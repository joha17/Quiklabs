import type { LabRuntime } from '../../app/runtime';

/** Lo que el motor necesita de la aplicación (inyectado; el motor no conoce React). */
export interface EngineHost {
  runtime: LabRuntime;
  t: (key: string, opts?: Record<string, unknown>) => string;
  getSelected(): string | null;
  select(id: string | null): void;
  notify(level: 'info' | 'warn', key: string, params?: Record<string, unknown>): void;
  sound(name: SoundName): void;
  reducedMotion(): boolean;
  guidedHints(): boolean;
  /** Etiquetas de nombre siempre visibles sobre cada objeto. */
  showNames(): boolean;
  /** Texto corto de la etiqueta de nombre de un objeto (los tubos incluyen su rótulo). */
  nameTag(id: string): string;
  onHeldChange?(id: string | null): void;
}

export type SoundName =
  | 'glass' | 'pour' | 'drip' | 'stir' | 'hum' | 'boil' | 'ice' | 'break' | 'alert' | 'click' | 'squeeze';
