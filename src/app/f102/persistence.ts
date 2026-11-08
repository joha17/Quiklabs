/**
 * Persistencia local del intento de F102: mundo (carril, carro, compuertas, torre, filtros, lecturas), libreta,
 * semilla, escenarios y registro de acciones encadenado. Clave propia por usuario (plataforma).
 */
import type { F102World } from '../../simulation/f102-world/types';
import type { F102Notebook } from '../../practices/practice-f102/notebook';
import type { PracticeF102Event } from './runtime';
import type { F102Settings } from './store';
import { scopedKey } from '../platform/scope';
import type { TapeSave } from '../platform/tape';

export const F102_SAVE_KEY = 'quiklabs.f102.intento.v1';

/** Incluye la parte de la cinta que aún no está en IndexedDB (`TapeRecorder.forSave`). */
export interface SavedF102Attempt extends Partial<TapeSave> {
  version: 1;
  savedAt: number;
  attemptId: string;
  settings: F102Settings;
  world: F102World;
  actions: PracticeF102Event[];
  notebook: F102Notebook;
  workflow: unknown;
  ppe: boolean;
  submitted: boolean;
}

export function saveF102Attempt(a: SavedF102Attempt): boolean {
  try {
    localStorage.setItem(scopedKey(F102_SAVE_KEY), JSON.stringify(a));
    return true;
  } catch {
    return false;
  }
}

export function loadF102Attempt(): SavedF102Attempt | null {
  try {
    const raw = localStorage.getItem(scopedKey(F102_SAVE_KEY));
    if (!raw) return null;
    const a = JSON.parse(raw) as SavedF102Attempt;
    if (a.version !== 1 || !a.world?.track || !a.world?.magnet || !a.notebook?.accel) return null;
    return a;
  } catch {
    return null;
  }
}

export function clearF102Attempt(): void {
  try {
    localStorage.removeItem(scopedKey(F102_SAVE_KEY));
  } catch {
    /* noop */
  }
}
