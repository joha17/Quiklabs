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
void import('./app/p01/store').then((m) => ((window as unknown as { __p01: unknown }).__p01 = m.useP01));
void import('./app/p7/store').then((m) => ((window as unknown as { __p7: unknown }).__p7 = m.useP07));
void import('./app/p8/store').then((m) => ((window as unknown as { __p8: unknown }).__p8 = m.useP08));
void import('./app/p9/store').then((m) => ((window as unknown as { __p9: unknown }).__p9 = m.useP09));
void import('./app/p10/store').then((m) => ((window as unknown as { __p10: unknown }).__p10 = m.useP10));
void import('./app/b01/store').then((m) => ((window as unknown as { __b01: unknown }).__b01 = m.useB01));
void import('./app/b02/store').then((m) => ((window as unknown as { __b02: unknown }).__b02 = m.useB02));
void import('./app/b03/store').then((m) => ((window as unknown as { __b03: unknown }).__b03 = m.useB03));
void import('./app/b04/store').then((m) => ((window as unknown as { __b04: unknown }).__b04 = m.useB04));
void import('./app/b05/store').then((m) => ((window as unknown as { __b05: unknown }).__b05 = m.useB05));
void import('./app/b06/store').then((m) => ((window as unknown as { __b06: unknown }).__b06 = m.useB06));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
