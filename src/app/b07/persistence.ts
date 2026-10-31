/**
 * Persistencia local del intento de la práctica B07: mundo (ruta, recipientes, equipos, lecturas),
 * libreta, semilla, escenarios y registro de acciones encadenado. Clave propia por usuario (plataforma).
 */
import type { MicroWorld as OpticalWorld } from '../../simulation/micro-world/types';
import type { B07Notebook } from '../../practices/practice-b07/notebook';
import type { PracticeB01Event as PracticeB07Event } from '../b01/runtime';
import type { B07Settings } from './store';
import { scopedKey } from '../platform/scope';
import type { TapeSave } from '../platform/tape';

export const B07_SAVE_KEY = 'quiklabs.practicaB07.intento.v1';

/** Incluye la parte de la cinta que aún no está en IndexedDB (`TapeRecorder.forSave`). */
export interface SavedB07Attempt extends Partial<TapeSave> {
  version: 1;
  savedAt: number;
  attemptId: string;
  settings: B07Settings;
  world: OpticalWorld;
  actions: PracticeB07Event[];
  notebook: B07Notebook;
  workflow: unknown;
  ppe: boolean;
  submitted: boolean;
}

export function saveB07Attempt(a: SavedB07Attempt): boolean {
  try {
    localStorage.setItem(scopedKey(B07_SAVE_KEY), JSON.stringify(a));
    return true;
  } catch {
    return false;
  }
}

export function loadB07Attempt(): SavedB07Attempt | null {
  try {
    const raw = localStorage.getItem(scopedKey(B07_SAVE_KEY));
    if (!raw) return null;
    const a = JSON.parse(raw) as SavedB07Attempt;
    if (a.version !== 1 || !a.world?.microscope || !a.world?.mounts || !a.world?.cell || !a.world?.micro || !a.notebook?.media) return null;
    return a;
  } catch {
    return null;
  }
}

export function clearB07Attempt(): void {
  try {
    localStorage.removeItem(scopedKey(B07_SAVE_KEY));
  } catch {
    /* noop */
  }
}
