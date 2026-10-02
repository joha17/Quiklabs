import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './app/i18n';
import './app/styles.css';
import { App } from './app/App';
import { useLab } from './app/store';

// Asa de inspección para pruebas automatizadas (Playwright) y para el modo depuración docente.
(window as unknown as { __lab: typeof useLab }).__lab = useLab;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
