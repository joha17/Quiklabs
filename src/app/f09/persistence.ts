/**
 * Persistencia local del intento de F09: mundo (resortes, carro, riel, sensores, péndulo, lecturas), libreta,
 * semilla, escenarios y registro de acciones encadenado. Clave propia por usuario (plataforma).
 */
import type { F09World } from '../../simulation/f09-world/types';
import type { F09Notebook } from '../../practices/practice-f09/notebook';
import type { PracticeF09Event } from './runtime';
import type { F09Settings } from './store';
import { scopedKey } from '../platform/scope';
import type { TapeSave } from '../platform/tape';

export const F09_SAVE_KEY = 'quiklabs.f09.intento.v1';

/** Incluye la parte de la cinta que aún no está en IndexedDB (`TapeRecorder.forSave`). */
export interface SavedF09Attempt extends Partial<TapeSave> {
  version: 1;
  savedAt: number;
  attemptId: string;
  settings: F09Settings;
  world: F09World;
  actions: PracticeF09Event[];
  notebook: F09Notebook;
  workflow: unknown;
  ppe: boolean;
  submitted: boolean;
}

export function saveF09Attempt(a: SavedF09Attempt): boolean {
  try {
    localStorage.setItem(scopedKey(F09_SAVE_KEY), JSON.stringify(a));
    return true;
  } catch {
    return false;
  }
}

export function loadF09Attempt(): SavedF09Attempt | null {
  try {
    const raw = localStorage.getItem(scopedKey(F09_SAVE_KEY));
    if (!raw) return null;
    const a = JSON.parse(raw) as SavedF09Attempt;
    if (a.version !== 1 || !a.world?.rotor || !a.world?.drum || !a.notebook?.circRows) return null;
    return a;
  } catch {
    return null;
  }
}

export function clearF09Attempt(): void {
  try {
    localStorage.removeItem(scopedKey(F09_SAVE_KEY));
  } catch {
    /* noop */
  }
}
