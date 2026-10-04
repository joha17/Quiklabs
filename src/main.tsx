import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './app/i18n';
import './app/styles.css';
import { App } from './app/App';
import { useLab } from './app/store';
import { useShell } from './app/shell';

// Asas de inspección para pruebas automatizadas (Playwright) y para el modo depuración docente.
(window as unknown as { __lab: typeof useLab }).__lab = useLab;
(window as unknown as { __shell: typeof useShell }).__shell = useShell;
// La Práctica 3 se carga al abrirla; su store se expone en cuanto existe (window.__p3).
void import('./app/p3/store').then((m) => ((window as unknown as { __p3: unknown }).__p3 = m.useP3));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
