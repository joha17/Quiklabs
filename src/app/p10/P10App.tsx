import { useEffect } from 'react';
import { startP10Loops, useP10 } from './store';
import { IntroScreen10 } from './IntroScreen10';
import { LabScreen10 } from './LabScreen10';
import { ReviewScreen10 } from './ReviewScreen10';
import '../p3/p3.css';
import '../p4/p4.css';
import '../p6/p6.css';
import './p10.css';

/** Práctica 10: gases ideales y ley de Boyle. */
export default function P10App({ onBack }: { onBack: () => void }) {
  const screen = useP10((s) => s.screen);
  const uiScale = useP10((s) => s.settings.uiScale);
  useEffect(() => startP10Loops(), []);
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(uiScale));
  }, [uiScale]);
  const back = () => {
    const st = useP10.getState();
    st.save();
    st.setPaused(true);
    useP10.setState({ screen: 'intro', modal: null, demo: null });
    onBack();
  };
  if (screen === 'lab') return <LabScreen10 />;
  if (screen === 'review') return <ReviewScreen10 onBack={back} />;
  return <IntroScreen10 onBack={back} />;
}
