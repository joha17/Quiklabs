/**
 * Persistencia local del intento de F08: mundo (resortes, carro, riel, sensores, péndulo, lecturas), libreta,
 * semilla, escenarios y registro de acciones encadenado. Clave propia por usuario (plataforma).
 */
import type { F08World } from '../../simulation/f08-world/types';
import type { F08Notebook } from '../../practices/practice-f08/notebook';
import type { PracticeF08Event } from './runtime';
import type { F08Settings } from './store';
import { scopedKey } from '../platform/scope';
import type { TapeSave } from '../platform/tape';

export const F08_SAVE_KEY = 'quiklabs.f08.intento.v1';

/** Incluye la parte de la cinta que aún no está en IndexedDB (`TapeRecorder.forSave`). */
export interface SavedF08Attempt extends Partial<TapeSave> {
  version: 1;
  savedAt: number;
  attemptId: string;
  settings: F08Settings;
  world: F08World;
  actions: PracticeF08Event[];
  notebook: F08Notebook;
  workflow: unknown;
  ppe: boolean;
  submitted: boolean;
}

export function saveF08Attempt(a: SavedF08Attempt): boolean {
  try {
    localStorage.setItem(scopedKey(F08_SAVE_KEY), JSON.stringify(a));
    return true;
  } catch {
    return false;
  }
}

export function loadF08Attempt(): SavedF08Attempt | null {
  try {
    const raw = localStorage.getItem(scopedKey(F08_SAVE_KEY));
    if (!raw) return null;
    const a = JSON.parse(raw) as SavedF08Attempt;
    if (a.version !== 1 || !a.world?.rotor || !a.world?.string || !a.notebook?.diskRows) return null;
    return a;
  } catch {
    return null;
  }
}

export function clearF08Attempt(): void {
  try {
    localStorage.removeItem(scopedKey(F08_SAVE_KEY));
  } catch {
    /* noop */
  }
}
