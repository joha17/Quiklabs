/**
 * Persistencia local del intento de la Práctica 1: mundo (agua, pipeta, clavos, cilindro, instrumentos, lecturas),
 * libreta, semilla, escenarios y registro de acciones encadenado. Clave propia por usuario (plataforma).
 */
import type { P01World } from '../../simulation/density-world/types';
import type { P01Notebook } from '../../practices/practice-01/notebook';
import type { Practice01Event } from './runtime';
import type { P01Settings } from './store';
import { scopedKey } from '../platform/scope';
import type { TapeSave } from '../platform/tape';

export const P01_SAVE_KEY = 'quiklabs.practica01.intento.v1';

/** Incluye la parte de la cinta que aún no está en IndexedDB (`TapeRecorder.forSave`). */
export interface SavedP01Attempt extends Partial<TapeSave> {
  version: 1;
  savedAt: number;
  attemptId: string;
  settings: P01Settings;
  world: P01World;
  actions: Practice01Event[];
  notebook: P01Notebook;
  workflow: unknown;
  ppe: boolean;
  submitted: boolean;
}

export function saveP01Attempt(a: SavedP01Attempt): boolean {
  try {
    localStorage.setItem(scopedKey(P01_SAVE_KEY), JSON.stringify(a));
    return true;
  } catch {
    return false;
  }
}

export function loadP01Attempt(): SavedP01Attempt | null {
  try {
    const raw = localStorage.getItem(scopedKey(P01_SAVE_KEY));
    if (!raw) return null;
    const a = JSON.parse(raw) as SavedP01Attempt;
    if (a.version !== 1 || !a.world?.pipette || !a.world?.fluids || !a.notebook?.tableB) return null;
    return a;
  } catch {
    return null;
  }
}

export function clearP01Attempt(): void {
  try {
    localStorage.removeItem(scopedKey(P01_SAVE_KEY));
  } catch {
    /* noop */
  }
}
