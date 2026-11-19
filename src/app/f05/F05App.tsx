import { useEffect } from 'react';
import { startF05Loops, useF05 } from './store';
import { IntroScreenF05 } from './IntroScreenF05';
import { LabScreenF05 } from './LabScreenF05';
import { ReviewScreenF05 } from './ReviewScreenF05';
import '../p3/p3.css';
import '../p4/p4.css';
import '../p6/p6.css';
import '../p01/p01.css';
import './f05.css';

/** F05: leyes de Newton y sistemas acoplados (cuarta práctica de Física). */
export default function F05App({ onBack }: { onBack: () => void }) {
  const screen = useF05((s) => s.screen);
  const uiScale = useF05((s) => s.settings.uiScale);
  useEffect(() => startF05Loops(), []);
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(uiScale));
  }, [uiScale]);
  const back = () => {
    const st = useF05.getState();
    st.save();
    st.setPaused(true);
    useF05.setState({ screen: 'intro', modal: null, demo: null });
    onBack();
  };
  if (screen === 'lab') return <LabScreenF05 />;
  if (screen === 'review') return <ReviewScreenF05 onBack={back} />;
  return <IntroScreenF05 onBack={back} />;
}
