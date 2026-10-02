import { useEffect } from 'react';
import { startBackgroundLoops, useLab } from './store';
import { IntroScreen } from './practice-config/IntroScreen';
import { LabScreen } from './hud/LabScreen';
import { ReviewScreen } from './review/ReviewScreen';

export function App() {
  const screen = useLab((s) => s.screen);
  const uiScale = useLab((s) => s.settings.uiScale);
  useEffect(() => startBackgroundLoops(), []);
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(uiScale));
  }, [uiScale]);
  if (screen === 'lab') return <LabScreen />;
  if (screen === 'review') return <ReviewScreen />;
  return <IntroScreen />;
}
