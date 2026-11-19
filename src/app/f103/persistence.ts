/**
 * Persistencia local del intento de F103: mundo (soporte, lanzador, plataforma, pantalla, esferas, lecturas), libreta,
 * semilla, escenarios y registro de acciones encadenado. Clave propia por usuario (plataforma).
 */
import type { F103World } from '../../simulation/f103-world/types';
import type { F103Notebook } from '../../practices/practice-f103/notebook';
import type { PracticeF103Event } from './runtime';
import type { F103Settings } from './store';
import { scopedKey } from '../platform/scope';
import type { TapeSave } from '../platform/tape';

export const F103_SAVE_KEY = 'quiklabs.f103.intento.v1';

/** Incluye la parte de la cinta que aún no está en IndexedDB (`TapeRecorder.forSave`). */
export interface SavedF103Attempt extends Partial<TapeSave> {
  version: 1;
  savedAt: number;
  attemptId: string;
  settings: F103Settings;
  world: F103World;
  actions: PracticeF103Event[];
  notebook: F103Notebook;
  workflow: unknown;
  ppe: boolean;
  submitted: boolean;
}

export function saveF103Attempt(a: SavedF103Attempt): boolean {
  try {
    localStorage.setItem(scopedKey(F103_SAVE_KEY), JSON.stringify(a));
    return true;
  } catch {
    return false;
  }
}

export function loadF103Attempt(): SavedF103Attempt | null {
  try {
    const raw = localStorage.getItem(scopedKey(F103_SAVE_KEY));
    if (!raw) return null;
    const a = JSON.parse(raw) as SavedF103Attempt;
    if (a.version !== 1 || !a.world?.launcher || !a.world?.platform || !a.notebook?.angles) return null;
    return a;
  } catch {
    return null;
  }
}

export function clearF103Attempt(): void {
  try {
    localStorage.removeItem(scopedKey(F103_SAVE_KEY));
  } catch {
    /* noop */
  }
}
