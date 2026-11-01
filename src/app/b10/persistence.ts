/**
 * Persistencia local del intento de la práctica B10: mundo (ruta, recipientes, equipos, lecturas),
 * libreta, semilla, escenarios y registro de acciones encadenado. Clave propia por usuario (plataforma).
 */
import type { AnimalWorld as OpticalWorld } from '../../simulation/animal-world/types';
import type { B10Notebook } from '../../practices/practice-b10/notebook';
import type { PracticeB01Event as PracticeB10Event } from '../b01/runtime';
import type { B10Settings } from './store';
import { scopedKey } from '../platform/scope';
import type { TapeSave } from '../platform/tape';

export const B10_SAVE_KEY = 'quiklabs.practicaB10.intento.v1';

/** Incluye la parte de la cinta que aún no está en IndexedDB (`TapeRecorder.forSave`). */
export interface SavedB10Attempt extends Partial<TapeSave> {
  version: 1;
  savedAt: number;
  attemptId: string;
  settings: B10Settings;
  world: OpticalWorld;
  actions: PracticeB10Event[];
  notebook: B10Notebook;
  workflow: unknown;
  ppe: boolean;
  submitted: boolean;
}

export function saveB10Attempt(a: SavedB10Attempt): boolean {
  try {
    localStorage.setItem(scopedKey(B10_SAVE_KEY), JSON.stringify(a));
    return true;
  } catch {
    return false;
  }
}

export function loadB10Attempt(): SavedB10Attempt | null {
  try {
    const raw = localStorage.getItem(scopedKey(B10_SAVE_KEY));
    if (!raw) return null;
    const a = JSON.parse(raw) as SavedB10Attempt;
    if (a.version !== 1 || !a.world?.microscope || !a.world?.mounts || !a.world?.cell || !a.world?.div || !a.notebook?.tissues) return null;
    return a;
  } catch {
    return null;
  }
}

export function clearB10Attempt(): void {
  try {
    localStorage.removeItem(scopedKey(B10_SAVE_KEY));
  } catch {
    /* noop */
  }
}
