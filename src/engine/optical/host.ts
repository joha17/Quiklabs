import type { OpticalRuntime } from '../../app/b01/runtime';
import type { ReactionSound } from '../reaction/host';
import type { OpticalController } from './controller';
import type { OpticalLab3D } from './OpticalLab3D';

/** Vista de cámara de una estación (centro, distancia y elevación). */
export interface OpticalStation {
  id: string;
  target: [number, number, number];
  dist: number;
  elevation: number;
}

/** Lo que el motor de la práctica B01 necesita de la aplicación (inyectado; el motor no conoce React). */
export interface OpticalHost {
  runtime: OpticalRuntime;
  t: (key: string, opts?: Record<string, unknown>) => string;
  getSelected(): string | null;
  select(id: string | null): void;
  notify(level: 'info' | 'warn', key: string, params?: Record<string, unknown>): void;
  sound(name: OpticalSound): void;
  reducedMotion(): boolean;
  guidedHints(): boolean;
  showNames(): boolean;
  nameTag(id: string): string;
  onHeldChange?(id: string | null): void;
  /** Se abrió o cerró un ocular (la app muestra la vista del ocular). */
  onEyepiece?(instrument: 'compound' | 'stereo' | null): void;
  /** Otra práctica sobre el mismo equipo (B02): estaciones de cámara, sala y controlador propios. Por omisión, los de B01. */
  stations?: OpticalStation[];
  roomVariant?: string;
  createController?(host: OpticalHost, lab: OpticalLab3D): OpticalController;
  /** Punto a la altura del ojo para un objetivo de lectura propio de la práctica (B03: el menisco de un recipiente o de un lado de cámara). */
  eyeTargetOf?(target: string): { x: number; y: number; z: number } | null;
}

/** Los sonidos de la práctica B01 son los del sintetizador de la Práctica 4. */
export type OpticalSound = ReactionSound;
