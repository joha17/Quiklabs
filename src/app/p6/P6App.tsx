import { useEffect } from 'react';
import { startP6Loops, useP6 } from './store';
import { IntroScreen6 } from './IntroScreen6';
import { LabScreen6 } from './LabScreen6';
import { ReviewScreen6 } from './ReviewScreen6';
import '../p3/p3.css';
import '../p4/p4.css';
import './p6.css';

/** Práctica 6: calorimetría. */
export default function P6App({ onBack }: { onBack: () => void }) {
  const screen = useP6((s) => s.screen);
  const uiScale = useP6((s) => s.settings.uiScale);
  useEffect(() => startP6Loops(), []);
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(uiScale));
  }, [uiScale]);
  const back = () => {
    const st = useP6.getState();
    st.save();
    st.setPaused(true);
    useP6.setState({ screen: 'intro', modal: null, demo: null });
    onBack();
  };
  if (screen === 'lab') return <LabScreen6 />;
  if (screen === 'review') return <ReviewScreen6 onBack={back} />;
  return <IntroScreen6 onBack={back} />;
}
