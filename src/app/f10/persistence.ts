/**
 * Persistencia local del intento de F10: mundo (viga, apoyos, cargas, prensa, probetas, sensores, lecturas), libreta,
 * semilla, escenarios y registro de acciones encadenado. Clave propia por usuario (plataforma).
 */
import type { F10World } from '../../simulation/f10-world/types';
import type { F10Notebook } from '../../practices/practice-f10/notebook';
import type { PracticeF10Event } from './runtime';
import type { F10Settings } from './store';
import { scopedKey } from '../platform/scope';
import type { TapeSave } from '../platform/tape';

export const F10_SAVE_KEY = 'quiklabs.f10.intento.v1';

/** Incluye la parte de la cinta que aún no está en IndexedDB (`TapeRecorder.forSave`). */
export interface SavedF10Attempt extends Partial<TapeSave> {
  version: 1;
  savedAt: number;
  attemptId: string;
  settings: F10Settings;
  world: F10World;
  actions: PracticeF10Event[];
  notebook: F10Notebook;
  workflow: unknown;
  ppe: boolean;
  submitted: boolean;
}

export function saveF10Attempt(a: SavedF10Attempt): boolean {
  try {
    localStorage.setItem(scopedKey(F10_SAVE_KEY), JSON.stringify(a));
    return true;
  } catch {
    return false;
  }
}

export function loadF10Attempt(): SavedF10Attempt | null {
  try {
    const raw = localStorage.getItem(scopedKey(F10_SAVE_KEY));
    if (!raw) return null;
    const a = JSON.parse(raw) as SavedF10Attempt;
    if (a.version !== 1 || !a.world?.beam || !a.world?.press || !a.notebook?.eqRows) return null;
    return a;
  } catch {
    return null;
  }
}

export function clearF10Attempt(): void {
  try {
    localStorage.removeItem(scopedKey(F10_SAVE_KEY));
  } catch {
    /* noop */
  }
}
