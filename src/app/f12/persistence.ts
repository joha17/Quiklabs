/**
 * Persistencia local del intento de F12: mundo (circuito, bomba, válvula, sensores, vaso, cronómetro, lecturas), libreta,
 * semilla, escenarios y registro de acciones encadenado. Clave propia por usuario (plataforma).
 */
import type { F12World } from '../../simulation/f12-world/types';
import type { F12Notebook } from '../../practices/practice-f12/notebook';
import type { PracticeF12Event } from './runtime';
import type { F12Settings } from './store';
import { scopedKey } from '../platform/scope';
import type { TapeSave } from '../platform/tape';

export const F12_SAVE_KEY = 'quiklabs.f12.intento.v1';

/** Incluye la parte de la cinta que aún no está en IndexedDB (`TapeRecorder.forSave`). */
export interface SavedF12Attempt extends Partial<TapeSave> {
  version: 1;
  savedAt: number;
  attemptId: string;
  settings: F12Settings;
  world: F12World;
  actions: PracticeF12Event[];
  notebook: F12Notebook;
  workflow: unknown;
  ppe: boolean;
  submitted: boolean;
}

export function saveF12Attempt(a: SavedF12Attempt): boolean {
  try {
    localStorage.setItem(scopedKey(F12_SAVE_KEY), JSON.stringify(a));
    return true;
  } catch {
    return false;
  }
}

export function loadF12Attempt(): SavedF12Attempt | null {
  try {
    const raw = localStorage.getItem(scopedKey(F12_SAVE_KEY));
    if (!raw) return null;
    const a = JSON.parse(raw) as SavedF12Attempt;
    if (a.version !== 1 || !a.world?.circuit || !a.world?.sensors || !a.notebook?.flowRows) return null;
    return a;
  } catch {
    return null;
  }
}

export function clearF12Attempt(): void {
  try {
    localStorage.removeItem(scopedKey(F12_SAVE_KEY));
  } catch {
    /* noop */
  }
}
