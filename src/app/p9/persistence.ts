/**
 * Persistencia local del intento de la Práctica 9: mundo (ruta, recipientes, equipos, lecturas),
 * libreta, semilla, escenarios y registro de acciones encadenado. Clave propia por usuario (plataforma).
 */
import type { P09World } from '../../simulation/cation-analysis-world/types';
import type { P09Notebook } from '../../practices/practice-09/notebook';
import type { Practice09Event } from './runtime';
import type { P09Settings } from './store';
import { scopedKey } from '../platform/scope';
import type { TapeSave } from '../platform/tape';

export const P09_SAVE_KEY = 'quiklabs.practica09.intento.v1';

/** Incluye la parte de la cinta que aún no está en IndexedDB (`TapeRecorder.forSave`). */
export interface SavedP09Attempt extends Partial<TapeSave> {
  version: 1;
  savedAt: number;
  attemptId: string;
  settings: P09Settings;
  world: P09World;
  actions: Practice09Event[];
  notebook: P09Notebook;
  workflow: unknown;
  ppe: boolean;
  submitted: boolean;
}

export function saveP09Attempt(a: SavedP09Attempt): boolean {
  try {
    localStorage.setItem(scopedKey(P09_SAVE_KEY), JSON.stringify(a));
    return true;
  } catch {
    return false;
  }
}

export function loadP09Attempt(): SavedP09Attempt | null {
  try {
    const raw = localStorage.getItem(scopedKey(P09_SAVE_KEY));
    if (!raw) return null;
    const a = JSON.parse(raw) as SavedP09Attempt;
    if (a.version !== 1 || !a.world?.vessels || !a.world?.hood || !a.notebook?.tableF) return null;
    return a;
  } catch {
    return null;
  }
}

export function clearP09Attempt(): void {
  try {
    localStorage.removeItem(scopedKey(P09_SAVE_KEY));
  } catch {
    /* noop */
  }
}
