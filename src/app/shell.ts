/**
 * Rutas de la aplicación en el hash de la URL: portada (sin hash), `#login`, `#panel` (panel según el rol) y los
 * laboratorios (`#p2` … `#p6`). Así se pueden enlazar y «atrás» del navegador funciona.
 */
import { create } from 'zustand';

export type LabId = 'p2' | 'p3' | 'p4' | 'p5' | 'p6';
export type Route = LabId | 'login' | 'panel';
const ROUTES: Route[] = ['p2', 'p3', 'p4', 'p5', 'p6', 'login', 'panel'];

export const isLab = (r: Route | null): r is LabId => r === 'p2' || r === 'p3' || r === 'p4' || r === 'p5' || r === 'p6';

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
