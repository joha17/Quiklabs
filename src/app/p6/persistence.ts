/**
 * Persistencia local del intento de la Práctica 6 (§28.1): mundo (objetos, agua, metal, nodos térmicos, series,
 * lecturas, bomba), modo ideal o realista, libreta, semilla y registro de acciones encadenado. Clave propia por usuario (plataforma).
 */
import type { P6World } from '../../simulation/calorimetry-world/types';
import type { P6Notebook } from '../../practices/practice-06/notebook';
import type { Practice06Event } from './runtime';
import type { P6Settings } from './store';
import { scopedKey } from '../platform/scope';
import type { TapeSave } from '../platform/tape';

export const P6_SAVE_KEY = 'quiklabs.practica6.intento.v1';

/** Incluye la parte de la cinta que aún no está en IndexedDB (`TapeRecorder.forSave`). */
export interface SavedP6Attempt extends Partial<TapeSave> {
  version: 1;
  savedAt: number;
  attemptId: string;
  settings: P6Settings;
  world: P6World;
  actions: Practice06Event[];
  notebook: P6Notebook;
  workflow: unknown;
  ppe: boolean;
  submitted: boolean;
}

export function saveP6Attempt(a: SavedP6Attempt): boolean {
  try {
    localStorage.setItem(scopedKey(P6_SAVE_KEY), JSON.stringify(a));
    return true;
  } catch {
    return false;
  }
}

export function loadP6Attempt(): SavedP6Attempt | null {
  try {
    const raw = localStorage.getItem(scopedKey(P6_SAVE_KEY));
    if (!raw) return null;
    const a = JSON.parse(raw) as SavedP6Attempt;
    if (a.version !== 1 || !a.world?.balance || !a.world?.cal || !a.notebook?.t61) return null;
    return a;
  } catch {
    return null;
  }
}

export function clearP6Attempt(): void {
  try {
    localStorage.removeItem(scopedKey(P6_SAVE_KEY));
  } catch {
    /* noop */
  }
}
