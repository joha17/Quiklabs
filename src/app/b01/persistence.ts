/**
 * Persistencia local del intento de la práctica B01: mundo (ruta, recipientes, equipos, lecturas),
 * libreta, semilla, escenarios y registro de acciones encadenado. Clave propia por usuario (plataforma).
 */
import type { OpticalWorld } from '../../simulation/optical-world/types';
import type { B01Notebook } from '../../practices/practice-b01/notebook';
import type { PracticeB01Event } from './runtime';
import type { B01Settings } from './store';
import { scopedKey } from '../platform/scope';
import type { TapeSave } from '../platform/tape';

export const B01_SAVE_KEY = 'quiklabs.practica09.intento.v1';

/** Incluye la parte de la cinta que aún no está en IndexedDB (`TapeRecorder.forSave`). */
export interface SavedB01Attempt extends Partial<TapeSave> {
  version: 1;
  savedAt: number;
  attemptId: string;
  settings: B01Settings;
  world: OpticalWorld;
  actions: PracticeB01Event[];
  notebook: B01Notebook;
  workflow: unknown;
  ppe: boolean;
  submitted: boolean;
}

export function saveB01Attempt(a: SavedB01Attempt): boolean {
  try {
    localStorage.setItem(scopedKey(B01_SAVE_KEY), JSON.stringify(a));
    return true;
  } catch {
    return false;
  }
}

export function loadB01Attempt(): SavedB01Attempt | null {
  try {
    const raw = localStorage.getItem(scopedKey(B01_SAVE_KEY));
    if (!raw) return null;
    const a = JSON.parse(raw) as SavedB01Attempt;
    if (a.version !== 1 || !a.world?.microscope || !a.world?.mounts || !a.notebook?.micro) return null;
    return a;
  } catch {
    return null;
  }
}

export function clearB01Attempt(): void {
  try {
    localStorage.removeItem(scopedKey(B01_SAVE_KEY));
  } catch {
    /* noop */
  }
}
