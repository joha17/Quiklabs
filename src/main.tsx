import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './app/i18n';
import './app/styles.css';
import { App } from './app/App';
import { useLab } from './app/store';
import { useShell } from './app/shell';
import { applyTheme, storedTheme } from './app/theme';

// Tema elegido en la página de inicio (si no hay elección, se sigue el modo del sistema).
applyTheme(storedTheme());

// Asas de inspección para pruebas automatizadas (Playwright) y para el modo depuración docente.
(window as unknown as { __lab: typeof useLab }).__lab = useLab;
(window as unknown as { __shell: typeof useShell }).__shell = useShell;
// La Práctica 3 se carga al abrirla; su store se expone en cuanto existe (window.__p3).
void import('./app/p3/store').then((m) => ((window as unknown as { __p3: unknown }).__p3 = m.useP3));
// La Práctica 4 también se carga al abrirla (window.__p4).
void import('./app/p4/store').then((m) => ((window as unknown as { __p4: unknown }).__p4 = m.useP4));
void import('./app/p5/store').then((m) => ((window as unknown as { __p5: unknown }).__p5 = m.useP5));
void import('./app/p6/store').then((m) => ((window as unknown as { __p6: unknown }).__p6 = m.useP6));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
