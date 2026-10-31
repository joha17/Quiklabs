/**
 * Persistencia local del intento de la práctica B08: mundo (ruta, recipientes, equipos, lecturas),
 * libreta, semilla, escenarios y registro de acciones encadenado. Clave propia por usuario (plataforma).
 */
import type { PhotoWorld as OpticalWorld } from '../../simulation/photo-world/types';
import type { B08Notebook } from '../../practices/practice-b08/notebook';
import type { PracticeB01Event as PracticeB08Event } from '../b01/runtime';
import type { B08Settings } from './store';
import { scopedKey } from '../platform/scope';
import type { TapeSave } from '../platform/tape';

export const B08_SAVE_KEY = 'quiklabs.practicaB08.intento.v1';

/** Incluye la parte de la cinta que aún no está en IndexedDB (`TapeRecorder.forSave`). */
export interface SavedB08Attempt extends Partial<TapeSave> {
  version: 1;
  savedAt: number;
  attemptId: string;
  settings: B08Settings;
  world: OpticalWorld;
  actions: PracticeB08Event[];
  notebook: B08Notebook;
  workflow: unknown;
  ppe: boolean;
  submitted: boolean;
}

export function saveB08Attempt(a: SavedB08Attempt): boolean {
  try {
    localStorage.setItem(scopedKey(B08_SAVE_KEY), JSON.stringify(a));
    return true;
  } catch {
    return false;
  }
}

export function loadB08Attempt(): SavedB08Attempt | null {
  try {
    const raw = localStorage.getItem(scopedKey(B08_SAVE_KEY));
    if (!raw) return null;
    const a = JSON.parse(raw) as SavedB08Attempt;
    if (a.version !== 1 || !a.world?.microscope || !a.world?.mounts || !a.world?.cell || !a.world?.photo || !a.notebook?.gas) return null;
    return a;
  } catch {
    return null;
  }
}

export function clearB08Attempt(): void {
  try {
    localStorage.removeItem(scopedKey(B08_SAVE_KEY));
  } catch {
    /* noop */
  }
}
