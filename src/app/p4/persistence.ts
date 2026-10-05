/**
 * Persistencia local del intento de la Práctica 4 (§27): mundo (posiciones, moles, fases, pH, temperaturas,
 * precipitados, superficies, tiempos, residuos), libreta, semilla y registro de eventos. Clave propia.
 */
import type { P4World } from '../../simulation/reaction-world/types';
import type { P4Notebook } from '../../practices/practice-04/notebook';
import type { Practice04Event } from './runtime';
import type { P4Settings } from './store';

export const P4_SAVE_KEY = 'quiklabs.practica4.intento.v1';

export interface SavedP4Attempt {
  version: 1;
  savedAt: number;
  attemptId: string;
  settings: P4Settings;
  world: P4World;
  actions: Practice04Event[];
  notebook: P4Notebook;
  workflow: unknown;
  ppe: boolean;
  submitted: boolean;
}

export function saveP4Attempt(a: SavedP4Attempt): boolean {
  try {
    localStorage.setItem(P4_SAVE_KEY, JSON.stringify(a));
    return true;
  } catch {
    return false;
  }
}

export function loadP4Attempt(): SavedP4Attempt | null {
  try {
    const raw = localStorage.getItem(P4_SAVE_KEY);
    if (!raw) return null;
    const a = JSON.parse(raw) as SavedP4Attempt;
    if (a.version !== 1 || a.world?.kind !== 'practice-04') return null;
    return a;
  } catch {
    return null;
  }
}

export function clearP4Attempt(): void {
  try {
    localStorage.removeItem(P4_SAVE_KEY);
  } catch {
    /* noop */
  }
}
