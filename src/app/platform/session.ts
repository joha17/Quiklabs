/**
 * Sesión de la plataforma: quién entró, qué prácticas puede abrir y en qué curso. La verdad la tiene el servidor
 * (`/api/auth/me`); aquí solo se guarda para la interfaz.
 */
import { create } from 'zustand';
import type { LabId, LabMode } from '../../../worker/core/types';
import { api, ApiFailure, type Me } from './api';
import { setStorageScope } from './scope';

type Status = 'unknown' | 'anon' | 'ready';

interface PlatformState {
  status: Status;
  me: Me | null;
  /** Motivo del último cierre forzado de sesión (cuenta suspendida, matrícula terminada…). */
  notice: string | null;
  refresh(): Promise<void>;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  changePassword(current: string, next: string): Promise<void>;
  setNotice(code: string | null): void;
}

const applyMe = (me: Me | null) => {
  setStorageScope(me?.user.id ?? null);
  return me;
};

export const usePlatform = create<PlatformState>()((set) => ({
  status: 'unknown',
  me: null,
  notice: null,
  async refresh() {
    try {
      const me = await api<Me>('GET', '/auth/me');
      set({ me: applyMe(me), status: 'ready' });
    } catch (e) {
      applyMe(null);
      const code = e instanceof ApiFailure ? e.code : null;
      set({ me: null, status: 'anon', notice: code && code !== 'NOT_AUTHENTICATED' && code !== 'NETWORK_ERROR' ? code : null });
    }
  },
  async login(email, password) {
    const me = await api<Me>('POST', '/auth/login', { email, password });
    set({ me: applyMe(me), status: 'ready', notice: null });
  },
  async logout() {
    await api('POST', '/auth/logout').catch(() => undefined);
    applyMe(null);
    set({ me: null, status: 'anon' });
  },
  async changePassword(current, next) {
    const me = await api<Me>('POST', '/auth/password', { current, next });
    set({ me: applyMe(me) });
  },
  setNotice(code) {
    set({ notice: code });
  },
}));

/** Curso y modo con que el estudiante puede abrir una práctica ahora (null si no puede). */
export function labAccess(me: Me | null, labId: LabId): { courseId: string | null; mode: LabMode | null } | null {
  const l = me?.labs.find((x) => x.labId === labId);
  return l ? { courseId: l.courseId, mode: l.mode } : null;
}
