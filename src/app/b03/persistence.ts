/**
 * Persistencia local del intento de la práctica B03: mundo (ruta, recipientes, equipos, lecturas),
 * libreta, semilla, escenarios y registro de acciones encadenado. Clave propia por usuario (plataforma).
 */
import type { PermWorld as OpticalWorld } from '../../simulation/perm-world/types';
import type { B03Notebook } from '../../practices/practice-b03/notebook';
import type { PracticeB01Event as PracticeB03Event } from '../b01/runtime';
import type { B03Settings } from './store';
import { scopedKey } from '../platform/scope';
import type { TapeSave } from '../platform/tape';

export const B03_SAVE_KEY = 'quiklabs.practicaB03.intento.v1';

/** Incluye la parte de la cinta que aún no está en IndexedDB (`TapeRecorder.forSave`). */
export interface SavedB03Attempt extends Partial<TapeSave> {
  version: 1;
  savedAt: number;
  attemptId: string;
  settings: B03Settings;
  world: OpticalWorld;
  actions: PracticeB03Event[];
  notebook: B03Notebook;
  workflow: unknown;
  ppe: boolean;
  submitted: boolean;
}

export function saveB03Attempt(a: SavedB03Attempt): boolean {
  try {
    localStorage.setItem(scopedKey(B03_SAVE_KEY), JSON.stringify(a));
    return true;
  } catch {
    return false;
  }
}

export function loadB03Attempt(): SavedB03Attempt | null {
  try {
    const raw = localStorage.getItem(scopedKey(B03_SAVE_KEY));
    if (!raw) return null;
    const a = JSON.parse(raw) as SavedB03Attempt;
    if (a.version !== 1 || !a.world?.microscope || !a.world?.mounts || !a.world?.cell || !a.world?.perm || !a.notebook?.osmosis) return null;
    return a;
  } catch {
    return null;
  }
}

export function clearB03Attempt(): void {
  try {
    localStorage.removeItem(scopedKey(B03_SAVE_KEY));
  } catch {
    /* noop */
  }
}
