import { useEffect } from 'react';
import { startP4Loops, useP4 } from './store';
import { IntroScreen4 } from './IntroScreen4';
import { LabScreen4 } from './LabScreen4';
import { ReviewScreen4 } from './ReviewScreen4';
import '../p3/p3.css';
import './p4.css';

/** Práctica 4: reacciones químicas. */
export default function P4App({ onBack }: { onBack: () => void }) {
  const screen = useP4((s) => s.screen);
  const uiScale = useP4((s) => s.settings.uiScale);
  useEffect(() => startP4Loops(), []);
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(uiScale));
  }, [uiScale]);
  const back = () => {
    const st = useP4.getState();
    st.save();
    st.setPaused(true);
    useP4.setState({ screen: 'intro', modal: null, demo: null });
    onBack();
  };
  if (screen === 'lab') return <LabScreen4 />;
  if (screen === 'review') return <ReviewScreen4 onBack={back} />;
  return <IntroScreen4 onBack={back} />;
}
