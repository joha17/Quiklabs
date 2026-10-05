/**
 * Persistencia local del intento de la Práctica 3 (§25): mundo (posiciones, válvulas, temperaturas, contaminación,
 * soluciones, incógnita), libreta, semilla y registro de eventos. Clave propia: no interfiere con la Práctica 2.
 */
import type { FlameWorld } from '../../simulation/flame-world/types';
import type { P3Notebook } from '../../practices/practice-03/notebook';
import type { Practice03Event } from './runtime';
import type { P3Settings } from './store';
import { scopedKey } from '../platform/scope';

export const P3_SAVE_KEY = 'quiklabs.practica3.intento.v1';
const HISTORY_KEY = 'quiklabs.practica3.incognitas';

export interface SavedP3Attempt {
  version: 1;
  savedAt: number;
  attemptId: string;
  settings: P3Settings;
  world: FlameWorld;
  actions: Practice03Event[];
  notebook: P3Notebook;
  workflow: unknown;
  ppe: boolean;
  submitted: boolean;
}

export function saveP3Attempt(a: SavedP3Attempt): boolean {
  try {
    localStorage.setItem(scopedKey(P3_SAVE_KEY), JSON.stringify(a));
    return true;
  } catch {
    return false;
  }
}

export function loadP3Attempt(): SavedP3Attempt | null {
  try {
    const raw = localStorage.getItem(scopedKey(P3_SAVE_KEY));
    if (!raw) return null;
    const a = JSON.parse(raw) as SavedP3Attempt;
    if (a.version !== 1 || a.world?.kind !== 'practice-03') return null;
    return a;
  } catch {
    return null;
  }
}

export function clearP3Attempt(): void {
  try {
    localStorage.removeItem(scopedKey(P3_SAVE_KEY));
  } catch {
    /* noop */
  }
}

/** Historial de incógnitas de este navegador (para no repetir la misma identidad, §18.2). */
export function readUnknownHistory(): string[] {
  try {
    const raw = localStorage.getItem(scopedKey(HISTORY_KEY));
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string').slice(-12) : [];
  } catch {
    return [];
  }
}

export function pushUnknownHistory(cation: string): void {
  try {
    localStorage.setItem(scopedKey(HISTORY_KEY), JSON.stringify([...readUnknownHistory(), cation].slice(-12)));
  } catch {
    /* noop */
  }
}
