import { useEffect } from 'react';
import { startP07Loops, useP07 } from './store';
import { IntroScreen07 } from './IntroScreen07';
import { LabScreen07 } from './LabScreen07';
import { ReviewScreen07 } from './ReviewScreen07';
import '../p3/p3.css';
import '../p4/p4.css';
import '../p6/p6.css';
import './p7.css';

/** Práctica 7: instrumentación científica y determinación experimental de densidades. */
export default function P07App({ onBack }: { onBack: () => void }) {
  const screen = useP07((s) => s.screen);
  const uiScale = useP07((s) => s.settings.uiScale);
  useEffect(() => startP07Loops(), []);
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(uiScale));
  }, [uiScale]);
  const back = () => {
    const st = useP07.getState();
    st.save();
    st.setPaused(true);
    useP07.setState({ screen: 'intro', modal: null, demo: null });
    onBack();
  };
  if (screen === 'lab') return <LabScreen07 />;
  if (screen === 'review') return <ReviewScreen07 onBack={back} />;
  return <IntroScreen07 onBack={back} />;
}
