import { useEffect } from 'react';
import { startP08Loops, useP08 } from './store';
import { IntroScreen08 } from './IntroScreen08';
import { LabScreen08 } from './LabScreen08';
import { ReviewScreen08 } from './ReviewScreen08';
import '../p3/p3.css';
import '../p4/p4.css';
import '../p6/p6.css';
import './p8.css';

/** Práctica 8: instrumentación científica y determinación experimental de densidades. */
export default function P08App({ onBack }: { onBack: () => void }) {
  const screen = useP08((s) => s.screen);
  const uiScale = useP08((s) => s.settings.uiScale);
  useEffect(() => startP08Loops(), []);
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(uiScale));
  }, [uiScale]);
  const back = () => {
    const st = useP08.getState();
    st.save();
    st.setPaused(true);
    useP08.setState({ screen: 'intro', modal: null, demo: null });
    onBack();
  };
  if (screen === 'lab') return <LabScreen08 />;
  if (screen === 'review') return <ReviewScreen08 onBack={back} />;
  return <IntroScreen08 onBack={back} />;
}
