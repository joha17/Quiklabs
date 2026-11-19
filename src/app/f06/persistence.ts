/**
 * Persistencia local del intento de F06: mundo (resortes, carro, riel, sensores, péndulo, lecturas), libreta,
 * semilla, escenarios y registro de acciones encadenado. Clave propia por usuario (plataforma).
 */
import type { F06World } from '../../simulation/f06-world/types';
import type { F06Notebook } from '../../practices/practice-f06/notebook';
import type { PracticeF06Event } from './runtime';
import type { F06Settings } from './store';
import { scopedKey } from '../platform/scope';
import type { TapeSave } from '../platform/tape';

export const F06_SAVE_KEY = 'quiklabs.f06.intento.v1';

/** Incluye la parte de la cinta que aún no está en IndexedDB (`TapeRecorder.forSave`). */
export interface SavedF06Attempt extends Partial<TapeSave> {
  version: 1;
  savedAt: number;
  attemptId: string;
  settings: F06Settings;
  world: F06World;
  actions: PracticeF06Event[];
  notebook: F06Notebook;
  workflow: unknown;
  ppe: boolean;
  submitted: boolean;
}

export function saveF06Attempt(a: SavedF06Attempt): boolean {
  try {
    localStorage.setItem(scopedKey(F06_SAVE_KEY), JSON.stringify(a));
    return true;
  } catch {
    return false;
  }
}

export function loadF06Attempt(): SavedF06Attempt | null {
  try {
    const raw = localStorage.getItem(scopedKey(F06_SAVE_KEY));
    if (!raw) return null;
    const a = JSON.parse(raw) as SavedF06Attempt;
    if (a.version !== 1 || !a.world?.cart || !a.world?.pend || !a.notebook?.springRows) return null;
    return a;
  } catch {
    return null;
  }
}

export function clearF06Attempt(): void {
  try {
    localStorage.removeItem(scopedKey(F06_SAVE_KEY));
  } catch {
    /* noop */
  }
}
