import { lazy, Suspense, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { startBackgroundLoops, useLab } from './store';
import { IntroScreen } from './practice-config/IntroScreen';
import { LabScreen } from './hud/LabScreen';
import { ReviewScreen } from './review/ReviewScreen';
import { Landing } from './landing/Landing';
import { useShell } from './shell';

const P3App = lazy(() => import('./p3/P3App'));
const P4App = lazy(() => import('./p4/P4App'));

/** Página de inicio con los laboratorios; cada práctica conserva su propio flujo (configuración → laboratorio → revisión). */
export function App() {
  const lab = useShell((s) => s.lab);
  const open = useShell((s) => s.open);
  if (lab === 'p2') return <P2App onBack={() => open(null)} />;
  if (lab === 'p3') {
    return (
      <Suspense fallback={<div className="scene-loading" role="status">…</div>}>
        <P3App onBack={() => open(null)} />
      </Suspense>
    );
  }
  if (lab === 'p4') {
    return (
      <Suspense fallback={<div className="scene-loading" role="status">…</div>}>
        <P4App onBack={() => open(null)} />
      </Suspense>
    );
  }
  return <Landing />;
}

/** Práctica 2: clasificación de la materia y técnicas de separación. */
function P2App({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const screen = useLab((s) => s.screen);
  const uiScale = useLab((s) => s.settings.uiScale);
  useEffect(() => startBackgroundLoops(), []);
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(uiScale));
  }, [uiScale]);
  if (screen === 'lab') return <LabScreen />;
  if (screen === 'review') return <ReviewScreen />;
  return (
    <>
      <button className="btn small menu-back" onClick={onBack}>← {t('menu.back')}</button>
      <IntroScreen />
    </>
  );
}
