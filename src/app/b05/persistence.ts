/**
 * Persistencia local del intento de la práctica B05: mundo (ruta, recipientes, equipos, lecturas),
 * libreta, semilla, escenarios y registro de acciones encadenado. Clave propia por usuario (plataforma).
 */
import type { EnzWorld as OpticalWorld } from '../../simulation/enz-world/types';
import type { B05Notebook } from '../../practices/practice-b05/notebook';
import type { PracticeB01Event as PracticeB05Event } from '../b01/runtime';
import type { B05Settings } from './store';
import { scopedKey } from '../platform/scope';
import type { TapeSave } from '../platform/tape';

export const B05_SAVE_KEY = 'quiklabs.practicaB05.intento.v1';

/** Incluye la parte de la cinta que aún no está en IndexedDB (`TapeRecorder.forSave`). */
export interface SavedB05Attempt extends Partial<TapeSave> {
  version: 1;
  savedAt: number;
  attemptId: string;
  settings: B05Settings;
  world: OpticalWorld;
  actions: PracticeB05Event[];
  notebook: B05Notebook;
  workflow: unknown;
  ppe: boolean;
  submitted: boolean;
}

export function saveB05Attempt(a: SavedB05Attempt): boolean {
  try {
    localStorage.setItem(scopedKey(B05_SAVE_KEY), JSON.stringify(a));
    return true;
  } catch {
    return false;
  }
}

export function loadB05Attempt(): SavedB05Attempt | null {
  try {
    const raw = localStorage.getItem(scopedKey(B05_SAVE_KEY));
    if (!raw) return null;
    const a = JSON.parse(raw) as SavedB05Attempt;
    if (a.version !== 1 || !a.world?.microscope || !a.world?.mounts || !a.world?.cell || !a.world?.enz || !a.notebook?.rate) return null;
    return a;
  } catch {
    return null;
  }
}

export function clearB05Attempt(): void {
  try {
    localStorage.removeItem(scopedKey(B05_SAVE_KEY));
  } catch {
    /* noop */
  }
}
