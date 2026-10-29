/**
 * Persistencia local del intento de la práctica B06: mundo (ruta, recipientes, equipos, lecturas),
 * libreta, semilla, escenarios y registro de acciones encadenado. Clave propia por usuario (plataforma).
 */
import type { DivWorld as OpticalWorld } from '../../simulation/div-world/types';
import type { B06Notebook } from '../../practices/practice-b06/notebook';
import type { PracticeB01Event as PracticeB06Event } from '../b01/runtime';
import type { B06Settings } from './store';
import { scopedKey } from '../platform/scope';
import type { TapeSave } from '../platform/tape';

export const B06_SAVE_KEY = 'quiklabs.practicaB06.intento.v1';

/** Incluye la parte de la cinta que aún no está en IndexedDB (`TapeRecorder.forSave`). */
export interface SavedB06Attempt extends Partial<TapeSave> {
  version: 1;
  savedAt: number;
  attemptId: string;
  settings: B06Settings;
  world: OpticalWorld;
  actions: PracticeB06Event[];
  notebook: B06Notebook;
  workflow: unknown;
  ppe: boolean;
  submitted: boolean;
}

export function saveB06Attempt(a: SavedB06Attempt): boolean {
  try {
    localStorage.setItem(scopedKey(B06_SAVE_KEY), JSON.stringify(a));
    return true;
  } catch {
    return false;
  }
}

export function loadB06Attempt(): SavedB06Attempt | null {
  try {
    const raw = localStorage.getItem(scopedKey(B06_SAVE_KEY));
    if (!raw) return null;
    const a = JSON.parse(raw) as SavedB06Attempt;
    if (a.version !== 1 || !a.world?.microscope || !a.world?.mounts || !a.world?.cell || !a.world?.div || !a.notebook?.organisms) return null;
    return a;
  } catch {
    return null;
  }
}

export function clearB06Attempt(): void {
  try {
    localStorage.removeItem(scopedKey(B06_SAVE_KEY));
  } catch {
    /* noop */
  }
}
