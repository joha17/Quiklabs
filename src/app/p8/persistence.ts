/**
 * Persistencia local del intento de la Práctica 8: mundo (ruta, recipientes, equipos, lecturas),
 * libreta, semilla, escenarios y registro de acciones encadenado. Clave propia por usuario (plataforma).
 */
import type { P08World } from '../../simulation/organic-world/types';
import type { P08Notebook } from '../../practices/practice-08/notebook';
import type { Practice08Event } from './runtime';
import type { P08Settings } from './store';
import { scopedKey } from '../platform/scope';
import type { TapeSave } from '../platform/tape';

export const P08_SAVE_KEY = 'quiklabs.practica08.intento.v1';

/** Incluye la parte de la cinta que aún no está en IndexedDB (`TapeRecorder.forSave`). */
export interface SavedP08Attempt extends Partial<TapeSave> {
  version: 1;
  savedAt: number;
  attemptId: string;
  settings: P08Settings;
  world: P08World;
  actions: Practice08Event[];
  notebook: P08Notebook;
  workflow: unknown;
  ppe: boolean;
  submitted: boolean;
}

export function saveP08Attempt(a: SavedP08Attempt): boolean {
  try {
    localStorage.setItem(scopedKey(P08_SAVE_KEY), JSON.stringify(a));
    return true;
  } catch {
    return false;
  }
}

export function loadP08Attempt(): SavedP08Attempt | null {
  try {
    const raw = localStorage.getItem(scopedKey(P08_SAVE_KEY));
    if (!raw) return null;
    const a = JSON.parse(raw) as SavedP08Attempt;
    if (a.version !== 1 || !a.world?.vessels || !a.world?.reflux || !a.notebook?.tableC) return null;
    return a;
  } catch {
    return null;
  }
}

export function clearP08Attempt(): void {
  try {
    localStorage.removeItem(scopedKey(P08_SAVE_KEY));
  } catch {
    /* noop */
  }
}
