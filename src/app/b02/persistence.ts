/**
 * Persistencia local del intento de la práctica B02: mundo (ruta, recipientes, equipos, lecturas),
 * libreta, semilla, escenarios y registro de acciones encadenado. Clave propia por usuario (plataforma).
 */
import type { CellWorld as OpticalWorld } from '../../simulation/cell-world/types';
import type { B02Notebook } from '../../practices/practice-b02/notebook';
import type { PracticeB01Event as PracticeB02Event } from '../b01/runtime';
import type { B02Settings } from './store';
import { scopedKey } from '../platform/scope';
import type { TapeSave } from '../platform/tape';

export const B02_SAVE_KEY = 'quiklabs.practicaB02.intento.v1';

/** Incluye la parte de la cinta que aún no está en IndexedDB (`TapeRecorder.forSave`). */
export interface SavedB02Attempt extends Partial<TapeSave> {
  version: 1;
  savedAt: number;
  attemptId: string;
  settings: B02Settings;
  world: OpticalWorld;
  actions: PracticeB02Event[];
  notebook: B02Notebook;
  workflow: unknown;
  ppe: boolean;
  submitted: boolean;
}

export function saveB02Attempt(a: SavedB02Attempt): boolean {
  try {
    localStorage.setItem(scopedKey(B02_SAVE_KEY), JSON.stringify(a));
    return true;
  } catch {
    return false;
  }
}

export function loadB02Attempt(): SavedB02Attempt | null {
  try {
    const raw = localStorage.getItem(scopedKey(B02_SAVE_KEY));
    if (!raw) return null;
    const a = JSON.parse(raw) as SavedB02Attempt;
    if (a.version !== 1 || !a.world?.microscope || !a.world?.mounts || !a.world?.cell || !a.notebook?.atlas) return null;
    return a;
  } catch {
    return null;
  }
}

export function clearB02Attempt(): void {
  try {
    localStorage.removeItem(scopedKey(B02_SAVE_KEY));
  } catch {
    /* noop */
  }
}
