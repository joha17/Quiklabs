/**
 * Persistencia local del intento de F07: mundo (resortes, carro, riel, sensores, péndulo, lecturas), libreta,
 * semilla, escenarios y registro de acciones encadenado. Clave propia por usuario (plataforma).
 */
import type { F07World } from '../../simulation/f07-world/types';
import type { F07Notebook } from '../../practices/practice-f07/notebook';
import type { PracticeF07Event } from './runtime';
import type { F07Settings } from './store';
import { scopedKey } from '../platform/scope';
import type { TapeSave } from '../platform/tape';

export const F07_SAVE_KEY = 'quiklabs.f07.intento.v1';

/** Incluye la parte de la cinta que aún no está en IndexedDB (`TapeRecorder.forSave`). */
export interface SavedF07Attempt extends Partial<TapeSave> {
  version: 1;
  savedAt: number;
  attemptId: string;
  settings: F07Settings;
  world: F07World;
  actions: PracticeF07Event[];
  notebook: F07Notebook;
  workflow: unknown;
  ppe: boolean;
  submitted: boolean;
}

export function saveF07Attempt(a: SavedF07Attempt): boolean {
  try {
    localStorage.setItem(scopedKey(F07_SAVE_KEY), JSON.stringify(a));
    return true;
  } catch {
    return false;
  }
}

export function loadF07Attempt(): SavedF07Attempt | null {
  try {
    const raw = localStorage.getItem(scopedKey(F07_SAVE_KEY));
    if (!raw) return null;
    const a = JSON.parse(raw) as SavedF07Attempt;
    if (a.version !== 1 || !a.world?.carts || !a.world?.bumper || !a.notebook?.elasticRows) return null;
    return a;
  } catch {
    return null;
  }
}

export function clearF07Attempt(): void {
  try {
    localStorage.removeItem(scopedKey(F07_SAVE_KEY));
  } catch {
    /* noop */
  }
}
