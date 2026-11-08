import type { F102Runtime } from '../../app/f102/runtime';
import type { ReactionSound } from '../reaction/host';

/** Lo que el motor de F102 necesita de la aplicación (inyectado; el motor no conoce React). */
export interface F102Host {
  runtime: F102Runtime;
  t: (key: string, opts?: Record<string, unknown>) => string;
  getSelected(): string | null;
  select(id: string | null): void;
  notify(level: 'info' | 'warn', key: string, params?: Record<string, unknown>): void;
  sound(name: F102Sound): void;
  reducedMotion(): boolean;
  guidedHints(): boolean;
  showNames(): boolean;
  nameTag(id: string): string;
  onHeldChange?(id: string | null): void;
  /** Lente de lectura: instrumento cuya escala se amplía en la interfaz. */
  onLens?(target: F102Lens | null): void;
}

export type F102Lens = 'track01' | 'tower01' | 'inclinometer01' | 'gateTimer01' | 'tapeTimer01' | 'photocell01' | 'motionSensor01';

/** Los sonidos de F102 son los del sintetizador común. */
export type F102Sound = ReactionSound;
