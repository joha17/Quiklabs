import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './app/i18n';
import './app/styles.css';
import { App } from './app/App';
import { useLab } from './app/store';
import { useShell } from './app/shell';
import { LAB_MODULES } from './app/labModules';
import { LAB_IDS } from './labs/registry';
import { applyTheme, storedTheme } from './app/theme';

// Tema elegido en la página de inicio (si no hay elección, se sigue el modo del sistema).
applyTheme(storedTheme());

// Asas de inspección para pruebas automatizadas (Playwright) y para el modo depuración docente.
(window as unknown as { __lab: typeof useLab }).__lab = useLab;
(window as unknown as { __shell: typeof useShell }).__shell = useShell;
// Los demás laboratorios se cargan al abrirlos; cada store se expone en cuanto existe (window.__p3, window.__f09…).
for (const id of LAB_IDS) {
  if (id === 'p2') continue;
  void Promise.resolve(LAB_MODULES[id].store()).then((store) => ((window as unknown as Record<string, unknown>)[`__${id}`] = store));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
