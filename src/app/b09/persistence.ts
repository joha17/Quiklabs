/**
 * Persistencia local del intento de la práctica B09: mundo (ruta, recipientes, equipos, lecturas),
 * libreta, semilla, escenarios y registro de acciones encadenado. Clave propia por usuario (plataforma).
 */
import type { PlantWorld as OpticalWorld } from '../../simulation/plant-world/types';
import type { B09Notebook } from '../../practices/practice-b09/notebook';
import type { PracticeB01Event as PracticeB09Event } from '../b01/runtime';
import type { B09Settings } from './store';
import { scopedKey } from '../platform/scope';
import type { TapeSave } from '../platform/tape';

export const B09_SAVE_KEY = 'quiklabs.practicaB09.intento.v1';

/** Incluye la parte de la cinta que aún no está en IndexedDB (`TapeRecorder.forSave`). */
export interface SavedB09Attempt extends Partial<TapeSave> {
  version: 1;
  savedAt: number;
  attemptId: string;
  settings: B09Settings;
  world: OpticalWorld;
  actions: PracticeB09Event[];
  notebook: B09Notebook;
  workflow: unknown;
  ppe: boolean;
  submitted: boolean;
}

export function saveB09Attempt(a: SavedB09Attempt): boolean {
  try {
    localStorage.setItem(scopedKey(B09_SAVE_KEY), JSON.stringify(a));
    return true;
  } catch {
    return false;
  }
}

export function loadB09Attempt(): SavedB09Attempt | null {
  try {
    const raw = localStorage.getItem(scopedKey(B09_SAVE_KEY));
    if (!raw) return null;
    const a = JSON.parse(raw) as SavedB09Attempt;
    if (a.version !== 1 || !a.world?.microscope || !a.world?.mounts || !a.world?.cell || !a.world?.div || !a.notebook?.roots) return null;
    return a;
  } catch {
    return null;
  }
}

export function clearB09Attempt(): void {
  try {
    localStorage.removeItem(scopedKey(B09_SAVE_KEY));
  } catch {
    /* noop */
  }
}
