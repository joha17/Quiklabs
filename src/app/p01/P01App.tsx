import { useEffect } from 'react';
import { startP01Loops, useP01 } from './store';
import { IntroScreen01 } from './IntroScreen01';
import { LabScreen01 } from './LabScreen01';
import { ReviewScreen01 } from './ReviewScreen01';
import '../p3/p3.css';
import '../p4/p4.css';
import '../p6/p6.css';
import './p01.css';

/** Práctica 1: instrumentación científica y determinación experimental de densidades. */
export default function P01App({ onBack }: { onBack: () => void }) {
  const screen = useP01((s) => s.screen);
  const uiScale = useP01((s) => s.settings.uiScale);
  useEffect(() => startP01Loops(), []);
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(uiScale));
  }, [uiScale]);
  const back = () => {
    const st = useP01.getState();
    st.save();
    st.setPaused(true);
    useP01.setState({ screen: 'intro', modal: null, demo: null });
    onBack();
  };
  if (screen === 'lab') return <LabScreen01 />;
  if (screen === 'review') return <ReviewScreen01 onBack={back} />;
  return <IntroScreen01 onBack={back} />;
}
