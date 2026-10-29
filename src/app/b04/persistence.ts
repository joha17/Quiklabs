/**
 * Persistencia local del intento de la práctica B04: mundo (ruta, recipientes, equipos, lecturas),
 * libreta, semilla, escenarios y registro de acciones encadenado. Clave propia por usuario (plataforma).
 */
import type { BioWorld as OpticalWorld } from '../../simulation/bio-world/types';
import type { B04Notebook } from '../../practices/practice-b04/notebook';
import type { PracticeB01Event as PracticeB04Event } from '../b01/runtime';
import type { B04Settings } from './store';
import { scopedKey } from '../platform/scope';
import type { TapeSave } from '../platform/tape';

export const B04_SAVE_KEY = 'quiklabs.practicaB04.intento.v1';

/** Incluye la parte de la cinta que aún no está en IndexedDB (`TapeRecorder.forSave`). */
export interface SavedB04Attempt extends Partial<TapeSave> {
  version: 1;
  savedAt: number;
  attemptId: string;
  settings: B04Settings;
  world: OpticalWorld;
  actions: PracticeB04Event[];
  notebook: B04Notebook;
  workflow: unknown;
  ppe: boolean;
  submitted: boolean;
}

export function saveB04Attempt(a: SavedB04Attempt): boolean {
  try {
    localStorage.setItem(scopedKey(B04_SAVE_KEY), JSON.stringify(a));
    return true;
  } catch {
    return false;
  }
}

export function loadB04Attempt(): SavedB04Attempt | null {
  try {
    const raw = localStorage.getItem(scopedKey(B04_SAVE_KEY));
    if (!raw) return null;
    const a = JSON.parse(raw) as SavedB04Attempt;
    if (a.version !== 1 || !a.world?.microscope || !a.world?.mounts || !a.world?.cell || !a.world?.bio || !a.notebook?.assays) return null;
    return a;
  } catch {
    return null;
  }
}

export function clearB04Attempt(): void {
  try {
    localStorage.removeItem(scopedKey(B04_SAVE_KEY));
  } catch {
    /* noop */
  }
}
