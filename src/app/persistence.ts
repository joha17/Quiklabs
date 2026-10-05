/**
 * Persistencia local del intento (§14): estado del mundo, libreta, semilla y registro de acciones.
 * Al recargar se restaura todo en PAUSA (no se sigue calentando en tiempo real).
 */
import type { World } from '../simulation/entities/types';
import type { NotebookState } from '../practices/practice-02/notebook';
import type { LabActionEvent } from './runtime';
import type { Settings } from './store';
import { scopedKey } from './platform/scope';

export const SAVE_KEY = 'quiklabs.practica2.intento.v1';

export interface SavedAttempt {
  version: 1;
  savedAt: number;
  attemptId: string;
  settings: Settings;
  world: World;
  actions: LabActionEvent[];
  notebook: NotebookState;
  workflow: unknown;
  ppe: boolean;
  spillPos: { x: number; y: number };
  submitted: boolean;
}

export function saveAttempt(a: SavedAttempt): boolean {
  try {
    localStorage.setItem(scopedKey(SAVE_KEY), JSON.stringify(a));
    return true;
  } catch {
    return false;
  }
}

export function loadAttempt(): SavedAttempt | null {
  try {
    const raw = localStorage.getItem(scopedKey(SAVE_KEY));
    if (!raw) return null;
    const a = JSON.parse(raw) as SavedAttempt;
    if (a.version !== 1 || !a.world?.vessels) return null;
    return a;
  } catch {
    return null;
  }
}

export function clearAttempt(): void {
  try {
    localStorage.removeItem(scopedKey(SAVE_KEY));
  } catch {
    /* noop */
  }
}

/** Descarga un objeto como archivo JSON (registro, libreta, informe). */
export function downloadJson(name: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
