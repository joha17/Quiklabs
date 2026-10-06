/**
 * Persistencia local del intento de la Práctica 5: mundo (balanza, tubo, pinza, espátulas, frascos, derrames,
 * lecturas, mechero), libreta, semilla y registro de eventos. Clave propia por usuario (plataforma).
 */
import type { P5World } from '../../simulation/stoich-world/types';
import type { P5Notebook } from '../../practices/practice-05/notebook';
import type { Practice05Event } from './runtime';
import type { P5Settings } from './store';
import { scopedKey } from '../platform/scope';

export const P5_SAVE_KEY = 'quiklabs.practica5.intento.v1';

export interface SavedP5Attempt {
  version: 1;
  savedAt: number;
  attemptId: string;
  settings: P5Settings;
  world: P5World;
  actions: Practice05Event[];
  notebook: P5Notebook;
  workflow: unknown;
  ppe: boolean;
  submitted: boolean;
}

export function saveP5Attempt(a: SavedP5Attempt): boolean {
  try {
    localStorage.setItem(scopedKey(P5_SAVE_KEY), JSON.stringify(a));
    return true;
  } catch {
    return false;
  }
}

export function loadP5Attempt(): SavedP5Attempt | null {
  try {
    const raw = localStorage.getItem(scopedKey(P5_SAVE_KEY));
    if (!raw) return null;
    const a = JSON.parse(raw) as SavedP5Attempt;
    if (a.version !== 1 || !a.world?.balance || !a.world?.tube || !a.notebook?.table1) return null;
    return a;
  } catch {
    return null;
  }
}

export function clearP5Attempt(): void {
  try {
    localStorage.removeItem(scopedKey(P5_SAVE_KEY));
  } catch {
    /* noop */
  }
}
