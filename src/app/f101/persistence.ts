/**
 * Persistencia local del intento de F101: mundo (instrumentos, piezas, agua, mesa de fuerzas, lecturas), libreta,
 * semilla, escenarios y registro de acciones encadenado. Clave propia por usuario (plataforma).
 */
import type { F101World } from '../../simulation/f101-world/types';
import type { F101Notebook } from '../../practices/practice-f101/notebook';
import type { PracticeF101Event } from './runtime';
import type { F101Settings } from './store';
import { scopedKey } from '../platform/scope';
import type { TapeSave } from '../platform/tape';

export const F101_SAVE_KEY = 'quiklabs.f101.intento.v1';

/** Incluye la parte de la cinta que aún no está en IndexedDB (`TapeRecorder.forSave`). */
export interface SavedF101Attempt extends Partial<TapeSave> {
  version: 1;
  savedAt: number;
  attemptId: string;
  settings: F101Settings;
  world: F101World;
  actions: PracticeF101Event[];
  notebook: F101Notebook;
  workflow: unknown;
  ppe: boolean;
  submitted: boolean;
}

export function saveF101Attempt(a: SavedF101Attempt): boolean {
  try {
    localStorage.setItem(scopedKey(F101_SAVE_KEY), JSON.stringify(a));
    return true;
  } catch {
    return false;
  }
}

export function loadF101Attempt(): SavedF101Attempt | null {
  try {
    const raw = localStorage.getItem(scopedKey(F101_SAVE_KEY));
    if (!raw) return null;
    const a = JSON.parse(raw) as SavedF101Attempt;
    if (a.version !== 1 || !a.world?.table || !a.world?.caliper || !a.notebook?.dims) return null;
    return a;
  } catch {
    return null;
  }
}

export function clearF101Attempt(): void {
  try {
    localStorage.removeItem(scopedKey(F101_SAVE_KEY));
  } catch {
    /* noop */
  }
}
