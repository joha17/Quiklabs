/**
 * Persistencia local del intento de F04: mundo (carril, carro, cordel, sensores, pareja, diagramas, lecturas), libreta,
 * semilla, escenarios y registro de acciones encadenado. Clave propia por usuario (plataforma).
 */
import type { F04World } from '../../simulation/f04-world/types';
import type { F04Notebook } from '../../practices/practice-f04/notebook';
import type { PracticeF04Event } from './runtime';
import type { F04Settings } from './store';
import { scopedKey } from '../platform/scope';
import type { TapeSave } from '../platform/tape';

export const F04_SAVE_KEY = 'quiklabs.f04.intento.v1';

/** Incluye la parte de la cinta que aún no está en IndexedDB (`TapeRecorder.forSave`). */
export interface SavedF04Attempt extends Partial<TapeSave> {
  version: 1;
  savedAt: number;
  attemptId: string;
  settings: F04Settings;
  world: F04World;
  actions: PracticeF04Event[];
  notebook: F04Notebook;
  workflow: unknown;
  ppe: boolean;
  submitted: boolean;
}

export function saveF04Attempt(a: SavedF04Attempt): boolean {
  try {
    localStorage.setItem(scopedKey(F04_SAVE_KEY), JSON.stringify(a));
    return true;
  } catch {
    return false;
  }
}

export function loadF04Attempt(): SavedF04Attempt | null {
  try {
    const raw = localStorage.getItem(scopedKey(F04_SAVE_KEY));
    if (!raw) return null;
    const a = JSON.parse(raw) as SavedF04Attempt;
    if (a.version !== 1 || !a.world?.cart || !a.world?.pair || !a.notebook?.runs) return null;
    return a;
  } catch {
    return null;
  }
}

export function clearF04Attempt(): void {
  try {
    localStorage.removeItem(scopedKey(F04_SAVE_KEY));
  } catch {
    /* noop */
  }
}
