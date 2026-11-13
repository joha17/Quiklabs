/**
 * Persistencia local del intento de F05: mundo (carril, carro, cordel, sensores, pareja, diagramas, lecturas), libreta,
 * semilla, escenarios y registro de acciones encadenado. Clave propia por usuario (plataforma).
 */
import type { F05World } from '../../simulation/f05-world/types';
import type { F05Notebook } from '../../practices/practice-f05/notebook';
import type { PracticeF05Event } from './runtime';
import type { F05Settings } from './store';
import { scopedKey } from '../platform/scope';
import type { TapeSave } from '../platform/tape';

export const F05_SAVE_KEY = 'quiklabs.f05.intento.v1';

/** Incluye la parte de la cinta que aún no está en IndexedDB (`TapeRecorder.forSave`). */
export interface SavedF05Attempt extends Partial<TapeSave> {
  version: 1;
  savedAt: number;
  attemptId: string;
  settings: F05Settings;
  world: F05World;
  actions: PracticeF05Event[];
  notebook: F05Notebook;
  workflow: unknown;
  ppe: boolean;
  submitted: boolean;
}

export function saveF05Attempt(a: SavedF05Attempt): boolean {
  try {
    localStorage.setItem(scopedKey(F05_SAVE_KEY), JSON.stringify(a));
    return true;
  } catch {
    return false;
  }
}

export function loadF05Attempt(): SavedF05Attempt | null {
  try {
    const raw = localStorage.getItem(scopedKey(F05_SAVE_KEY));
    if (!raw) return null;
    const a = JSON.parse(raw) as SavedF05Attempt;
    if (a.version !== 1 || !a.world?.block || !a.world?.puller || !a.notebook?.staticRows) return null;
    return a;
  } catch {
    return null;
  }
}

export function clearF05Attempt(): void {
  try {
    localStorage.removeItem(scopedKey(F05_SAVE_KEY));
  } catch {
    /* noop */
  }
}
