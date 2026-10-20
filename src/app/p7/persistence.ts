/**
 * Persistencia local del intento de la Práctica 7: mundo (agua, pipeta, clavos, cilindro, instrumentos, lecturas),
 * libreta, semilla, escenarios y registro de acciones encadenado. Clave propia por usuario (plataforma).
 */
import type { P07World } from '../../simulation/bonding-world/types';
import type { P07Notebook } from '../../practices/practice-07/notebook';
import type { Practice07Event } from './runtime';
import type { P07Settings } from './store';
import { scopedKey } from '../platform/scope';
import type { TapeSave } from '../platform/tape';

export const P07_SAVE_KEY = 'quiklabs.practica07.intento.v1';

/** Incluye la parte de la cinta que aún no está en IndexedDB (`TapeRecorder.forSave`). */
export interface SavedP07Attempt extends Partial<TapeSave> {
  version: 1;
  savedAt: number;
  attemptId: string;
  settings: P07Settings;
  world: P07World;
  actions: Practice07Event[];
  notebook: P07Notebook;
  workflow: unknown;
  ppe: boolean;
  submitted: boolean;
}

export function saveP07Attempt(a: SavedP07Attempt): boolean {
  try {
    localStorage.setItem(scopedKey(P07_SAVE_KEY), JSON.stringify(a));
    return true;
  } catch {
    return false;
  }
}

export function loadP07Attempt(): SavedP07Attempt | null {
  try {
    const raw = localStorage.getItem(scopedKey(P07_SAVE_KEY));
    if (!raw) return null;
    const a = JSON.parse(raw) as SavedP07Attempt;
    if (a.version !== 1 || !a.world?.vessels || !a.world?.meter || !a.notebook?.tableE) return null;
    return a;
  } catch {
    return null;
  }
}

export function clearP07Attempt(): void {
  try {
    localStorage.removeItem(scopedKey(P07_SAVE_KEY));
  } catch {
    /* noop */
  }
}
