/**
 * Rutas de la aplicación en el hash de la URL: portada (sin hash), `#login`, `#panel` (panel según el rol), los
 * laboratorios (`#p01`, `#p2` … `#p10` de Química; `#b01`… de Biología) y las páginas legales públicas (`#privacidad`, `#terminos`, `#cookies`, `#accesibilidad`). Así se pueden enlazar y «atrás» del navegador funciona.
 */
import { create } from 'zustand';

import { isLabId, LAB_IDS, type LabId } from '../labs/registry';

export type { LabId };
export type LegalRoute = 'privacidad' | 'terminos' | 'cookies' | 'accesibilidad';
export type Route = LabId | 'login' | 'panel' | LegalRoute;
export const ROUTES: Route[] = [...LAB_IDS, 'login', 'panel', 'privacidad', 'terminos', 'cookies', 'accesibilidad'];

export const isLegal = (r: Route | null): r is LegalRoute => r === 'privacidad' || r === 'terminos' || r === 'cookies' || r === 'accesibilidad';

export const isLab = (r: Route | null): r is LabId => isLabId(r);

function fromHash(): Route | null {
  if (typeof window === 'undefined') return null;
  const h = window.location.hash.replace('#', '').replace('/', '');
  return (ROUTES as string[]).includes(h) ? (h as Route) : null;
}

interface ShellState {
  /** Ruta actual (null = portada). */
  lab: Route | null;
  open(route: Route | null): void;
}

export const useShell = create<ShellState>()((set) => ({
  lab: fromHash(),
  open(lab) {
    set({ lab });
    if (typeof window !== 'undefined') window.scrollTo(0, 0);
    if (typeof window === 'undefined') return;
    const target = lab ? `#${lab}` : '';
    if (window.location.hash !== target) {
      if (lab) window.location.hash = target;
      else history.pushState(null, '', window.location.pathname + window.location.search);
    }
  },
}));

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    const lab = fromHash();
    if (useShell.getState().lab !== lab) useShell.setState({ lab });
  });
  window.addEventListener('popstate', () => {
    const lab = fromHash();
    if (useShell.getState().lab !== lab) useShell.setState({ lab });
  });
}
