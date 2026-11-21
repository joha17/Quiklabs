/**
 * Persistencia local del intento de F11: mundo (viga, apoyos, cargas, prensa, probetas, sensores, lecturas), libreta,
 * semilla, escenarios y registro de acciones encadenado. Clave propia por usuario (plataforma).
 */
import type { F11World } from '../../simulation/f11-world/types';
import type { F11Notebook } from '../../practices/practice-f11/notebook';
import type { PracticeF11Event } from './runtime';
import type { F11Settings } from './store';
import { scopedKey } from '../platform/scope';
import type { TapeSave } from '../platform/tape';

export const F11_SAVE_KEY = 'quiklabs.f11.intento.v1';

/** Incluye la parte de la cinta que aún no está en IndexedDB (`TapeRecorder.forSave`). */
export interface SavedF11Attempt extends Partial<TapeSave> {
  version: 1;
  savedAt: number;
  attemptId: string;
  settings: F11Settings;
  world: F11World;
  actions: PracticeF11Event[];
  notebook: F11Notebook;
  workflow: unknown;
  ppe: boolean;
  submitted: boolean;
}

export function saveF11Attempt(a: SavedF11Attempt): boolean {
  try {
    localStorage.setItem(scopedKey(F11_SAVE_KEY), JSON.stringify(a));
    return true;
  } catch {
    return false;
  }
}

export function loadF11Attempt(): SavedF11Attempt | null {
  try {
    const raw = localStorage.getItem(scopedKey(F11_SAVE_KEY));
    if (!raw) return null;
    const a = JSON.parse(raw) as SavedF11Attempt;
    if (a.version !== 1 || !a.world?.tank || !a.world?.floats || !a.notebook?.pARows) return null;
    return a;
  } catch {
    return null;
  }
}

export function clearF11Attempt(): void {
  try {
    localStorage.removeItem(scopedKey(F11_SAVE_KEY));
  } catch {
    /* noop */
  }
}
