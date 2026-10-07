/**
 * Persistencia local del intento de la Práctica 10 (§33.1): mundo (sólidos, disoluciones, montaje de gas, reactor,
 * bureta, jeringa y sensor, lecturas), modo curricular o realista, libreta, semilla y registro de acciones encadenado. Clave propia por usuario (plataforma).
 */
import type { P10World } from '../../simulation/gas-world/types';
import type { P10Notebook } from '../../practices/practice-10/notebook';
import type { Practice10Event } from './runtime';
import type { P10Settings } from './store';
import { scopedKey } from '../platform/scope';
import type { TapeSave } from '../platform/tape';

export const P10_SAVE_KEY = 'quiklabs.practica10.intento.v1';

/** Incluye la parte de la cinta que aún no está en IndexedDB (`TapeRecorder.forSave`). */
export interface SavedP10Attempt extends Partial<TapeSave> {
  version: 1;
  savedAt: number;
  attemptId: string;
  settings: P10Settings;
  world: P10World;
  actions: Practice10Event[];
  notebook: P10Notebook;
  workflow: unknown;
  ppe: boolean;
  submitted: boolean;
}

export function saveP10Attempt(a: SavedP10Attempt): boolean {
  try {
    localStorage.setItem(scopedKey(P10_SAVE_KEY), JSON.stringify(a));
    return true;
  } catch {
    return false;
  }
}

export function loadP10Attempt(): SavedP10Attempt | null {
  try {
    const raw = localStorage.getItem(scopedKey(P10_SAVE_KEY));
    if (!raw) return null;
    const a = JSON.parse(raw) as SavedP10Attempt;
    if (a.version !== 1 || !a.world?.burette || !a.world?.syringe || !a.notebook?.t103) return null;
    return a;
  } catch {
    return null;
  }
}

export function clearP10Attempt(): void {
  try {
    localStorage.removeItem(scopedKey(P10_SAVE_KEY));
  } catch {
    /* noop */
  }
}
