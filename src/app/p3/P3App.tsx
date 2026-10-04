import { useEffect } from 'react';
import { startP3Loops, useP3 } from './store';
import { IntroScreen3 } from './IntroScreen3';
import { LabScreen3 } from './LabScreen3';
import { ReviewScreen3 } from './ReviewScreen3';
import './p3.css';

/** Práctica 3: mechero de Bunsen y prueba de cationes a la llama. */
export default function P3App({ onBack }: { onBack: () => void }) {
  const screen = useP3((s) => s.screen);
  const uiScale = useP3((s) => s.settings.uiScale);
  useEffect(() => startP3Loops(), []);
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(uiScale));
  }, [uiScale]);
  const back = () => {
    const st = useP3.getState();
    st.save();
    st.setPaused(true);
    useP3.setState({ screen: 'intro', modal: null, demo: null });
    onBack();
  };
  if (screen === 'lab') return <LabScreen3 />;
  if (screen === 'review') return <ReviewScreen3 onBack={back} />;
  return <IntroScreen3 onBack={back} />;
}
