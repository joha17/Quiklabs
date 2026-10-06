import { useEffect } from 'react';
import { startP5Loops, useP5 } from './store';
import { IntroScreen5 } from './IntroScreen5';
import { LabScreen5 } from './LabScreen5';
import { ReviewScreen5 } from './ReviewScreen5';
import '../p3/p3.css';
import '../p4/p4.css';
import './p5.css';

/** Práctica 5: relaciones estequiométricas. */
export default function P5App({ onBack }: { onBack: () => void }) {
  const screen = useP5((s) => s.screen);
  const uiScale = useP5((s) => s.settings.uiScale);
  useEffect(() => startP5Loops(), []);
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(uiScale));
  }, [uiScale]);
  const back = () => {
    const st = useP5.getState();
    st.save();
    st.setPaused(true);
    useP5.setState({ screen: 'intro', modal: null, demo: null });
    onBack();
  };
  if (screen === 'lab') return <LabScreen5 />;
  if (screen === 'review') return <ReviewScreen5 onBack={back} />;
  return <IntroScreen5 onBack={back} />;
}
