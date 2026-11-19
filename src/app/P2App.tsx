import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { startBackgroundLoops, useLab } from './store';
import { IntroScreen } from './practice-config/IntroScreen';
import { LabScreen } from './hud/LabScreen';
import { ReviewScreen } from './review/ReviewScreen';

/** Práctica 2: clasificación de la materia y técnicas de separación (se carga con la aplicación, sin carga diferida). */
export function P2App({ onBack }: { onBack: () => void }) {
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
