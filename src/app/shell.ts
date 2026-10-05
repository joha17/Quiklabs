/**
 * Selección de laboratorio (portada con el menú de prácticas). El laboratorio abierto se refleja en el hash de la
 * URL (#p2, #p3, #p4) para poder enlazarlo directamente y para que «atrás» del navegador vuelva al menú.
 */
import { create } from 'zustand';

export type LabId = 'p2' | 'p3' | 'p4';
const LABS: LabId[] = ['p2', 'p3', 'p4'];

function fromHash(): LabId | null {
  if (typeof window === 'undefined') return null;
  const h = window.location.hash.replace('#', '').replace('/', '');
  return (LABS as string[]).includes(h) ? (h as LabId) : null;
}

interface ShellState {
  lab: LabId | null;
  open(lab: LabId | null): void;
}

export const useShell = create<ShellState>()((set) => ({
  lab: fromHash(),
  open(lab) {
    set({ lab });
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
